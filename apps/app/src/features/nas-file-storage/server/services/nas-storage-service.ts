import path from 'node:path';

import loggerFactory, { type Logger } from '~/utils/logger';

import type {
  NasEntry,
  NasError,
  NasFileStore,
  NasListPage,
  NasListQuery,
  NasResult,
  PutFileInput,
} from '../../interfaces';
import { nasStorageConfig } from '../config/nas-storage-config';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import { normalizeNasError } from './normalize-nas-error';
import type { RootHealthChecker } from './root-health-checker';
import { rootHealthChecker } from './root-health-checker';

/**
 * Use-case orchestration over `NasFileStore` for already-authorized requests.
 *
 * Responsibilities (design "Components -> Service -> NasStorageService"):
 * - gate every operation on `RootHealthChecker.ensureReady()` (Req 8.1)
 * - compute a unique `suggestedName` on a non-overwrite `putFile` conflict (Req 3.2)
 * - pass `download` `IS_DIRECTORY` / `NOT_FOUND` through unchanged (Req 4.2)
 * - normalize every failure via `normalizeNasError` and log the raw detail for
 *   operators, while the returned message stays an i18n key (Req 8.3)
 *
 * It does NOT authorize (that is the `nasAccess` middleware) and does NOT do path
 * range validation directly (that is the store's `resolveSafePath`).
 */
export interface NasStorageService {
  listFolder(dir: string, query: NasListQuery): Promise<NasResult<NasListPage>>;
  download(
    logicalPath: string,
  ): Promise<NasResult<{ stream: NodeJS.ReadableStream; entry: NasEntry }>>;
  putFile(input: PutFileInput): Promise<NasResult<NasEntry>>;
  createFolder(parentDir: string, name: string): Promise<NasResult<NasEntry>>;
  rename(
    fromLogicalPath: string,
    toLogicalPath: string,
    overwrite: boolean,
  ): Promise<NasResult<NasEntry>>;
  deleteEntry(
    logicalPath: string,
    recursive: boolean,
  ): Promise<NasResult<void>>;
}

export interface NasStorageServiceDeps {
  store: NasFileStore;
  health: RootHealthChecker;
  logger?: Logger;
}

const defaultLogger = loggerFactory('growi:nas-storage:service');

/** Max number of `name (n).ext` candidates probed before giving up (Req 3.2). */
const MAX_SUGGESTION_ATTEMPTS = 999;

const storageUnavailableError = (): NasError => {
  return normalizeNasError({ code: 'STORAGE_UNAVAILABLE' });
};

/** Join a directory logical path and a single entry name into a logical path. */
const joinLogical = (dir: string, name: string): string => {
  const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${normalizedDir}/${name}`;
};

/**
 * Split a file name into the stem and its extension (including the leading dot).
 * A leading-dot name with no further dot (`.env`, `README`) has an empty ext, so
 * the numbering lands as `.env (1)` / `README (1)`.
 */
const splitName = (name: string): { stem: string; ext: string } => {
  const ext = path.extname(name);
  if (ext === '' || ext === name) {
    return { stem: name, ext: '' };
  }
  return { stem: name.slice(0, -ext.length), ext };
};

export const createNasStorageService = (
  deps: NasStorageServiceDeps,
): NasStorageService => {
  const { store, health } = deps;
  const logger = deps.logger ?? defaultLogger;

  const logFailure = (
    op: string,
    context: Record<string, unknown>,
    errorCode: string,
    detail: unknown,
  ): void => {
    logger.error(
      { ...context, errorCode, err: detail },
      `nas-storage ${op} failed`,
    );
  };

  /**
   * Run `ensureReady`, then the store operation, converting any store failure or
   * thrown error into a logged, normalized `NasResult` error. `onRoot` widens
   * root-level errno (`ENOENT` / `EACCES`) to `STORAGE_UNAVAILABLE` (Req 8.1).
   */
  const run = async <T>(
    op: string,
    context: Record<string, unknown>,
    call: () => Promise<NasResult<T>>,
    opts?: { onRoot?: boolean },
  ): Promise<NasResult<T>> => {
    const status = await health.ensureReady();
    if (status.state !== 'ready') {
      return { ok: false, error: storageUnavailableError() };
    }

    try {
      const result = await call();
      if (!result.ok) {
        logFailure(op, context, result.error.code, result.error);
      }
      return result;
    } catch (err) {
      const error = normalizeNasError(err, opts);
      logFailure(op, context, error.code, err);
      return { ok: false, error };
    }
  };

  const findSuggestedName = async (
    input: PutFileInput,
  ): Promise<string | undefined> => {
    const { stem, ext } = splitName(input.targetName);
    for (let n = 1; n <= MAX_SUGGESTION_ATTEMPTS; n += 1) {
      const candidate = `${stem} (${n})${ext}`;
      // biome-ignore lint/performance/noAwaitInLoops: sequential probing is intentional — stop at the first free name
      const stat = await store.statEntry(
        joinLogical(input.dirLogicalPath, candidate),
      );
      if (!stat.ok && stat.error.code === 'NOT_FOUND') {
        return candidate;
      }
    }
    return undefined;
  };

  return {
    listFolder(dir, query) {
      return run('listFolder', { dir }, () => store.list(dir, query), {
        onRoot: true,
      });
    },

    download(logicalPath) {
      return run('download', { logicalPath }, () =>
        store.openRead(logicalPath),
      );
    },

    async putFile(input) {
      const context = {
        dirLogicalPath: input.dirLogicalPath,
        targetName: input.targetName,
        overwrite: input.overwrite,
      };
      const result = await run(
        'putFile',
        context,
        () => store.moveIntoRoot(input),
        { onRoot: true },
      );

      if (result.ok || input.overwrite || result.error.code !== 'CONFLICT') {
        return result;
      }

      try {
        const suggestedName = await findSuggestedName(input);
        return {
          ok: false,
          error: {
            ...result.error,
            ...(suggestedName != null ? { suggestedName } : {}),
          },
        };
      } catch (err) {
        // Suggestion is best-effort; still return the CONFLICT even if probing failed.
        logFailure('putFile:suggest', context, 'UNKNOWN', err);
        return result;
      }
    },

    createFolder(parentDir, name) {
      return run('createFolder', { parentDir, name }, () =>
        store.mkdir(parentDir, name),
      );
    },

    rename(fromLogicalPath, toLogicalPath, overwrite) {
      return run('rename', { fromLogicalPath, toLogicalPath, overwrite }, () =>
        store.move(fromLogicalPath, toLogicalPath, overwrite),
      );
    },

    deleteEntry(logicalPath, recursive) {
      return run('deleteEntry', { logicalPath, recursive }, () =>
        store.remove(logicalPath, recursive),
      );
    },
  };
};

let singleton: NasStorageService | undefined;

/**
 * Lazily-built, default-wired service used by the route layer. The store is
 * created against the resolved root; when no root is configured the health gate
 * short-circuits every method before the store is touched, so an empty root is
 * never dereferenced.
 */
export const getNasStorageService = (): NasStorageService => {
  if (singleton == null) {
    const root = nasStorageConfig.resolveRoot() ?? '';
    singleton = createNasStorageService({
      store: new FsNasFileStore(root),
      health: rootHealthChecker,
    });
  }
  return singleton;
};
