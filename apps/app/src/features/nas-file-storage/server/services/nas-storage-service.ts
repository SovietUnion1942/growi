import loggerFactory, { type Logger } from '~/utils/logger';

import type {
  BeginChunkedUploadInput,
  BeginChunkedUploadResponse,
  NasEntry,
  NasError,
  NasFileStore,
  NasListPage,
  NasListQuery,
  NasResult,
  PutFileInput,
} from '../../interfaces';
import type { NasStorageConfig } from '../config/nas-storage-config';
import { nasStorageConfig } from '../config/nas-storage-config';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import type { ChunkedUploadRegistry } from './chunked-upload-registry';
import { chunkedUploadRegistry } from './chunked-upload-registry';
import { normalizeNasError } from './normalize-nas-error';
import type { RootHealthChecker } from './root-health-checker';
import { rootHealthChecker } from './root-health-checker';
import { suggestNonConflictingName } from './suggest-non-conflicting-name';

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
  /**
   * Retained for the legacy stream-based delivery path (`store.openRead`).
   * Prefer `resolveContent` for delivery: it resolves an absolute path without
   * opening a stream so the route layer can hand it to `res.sendFile`.
   */
  download(
    logicalPath: string,
  ): Promise<NasResult<{ stream: NodeJS.ReadableStream; entry: NasEntry }>>;
  /**
   * Resolve an absolute filesystem path for delivery (Req 9.1). Rejects a
   * directory / missing / out-of-root target as `IS_DIRECTORY` / `NOT_FOUND` /
   * `OUT_OF_ROOT` (Req 9.7). No stream is opened; the route layer serves the
   * returned `absolutePath` via `res.sendFile`.
   */
  resolveContent(
    logicalPath: string,
  ): Promise<NasResult<{ absolutePath: string; entry: NasEntry }>>;
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
  /**
   * Chunked upload (Req 10) — thin wrappers that delegate the session state and
   * `.part` mechanics to `ChunkedUploadRegistry`. `beginChunkedUpload` adds the
   * two service-level gates the registry does not do: the declared-size cap
   * (Req 10.5) and the destination path range check (Req 10.1 / 6.7).
   */
  beginChunkedUpload(
    input: BeginChunkedUploadInput,
  ): Promise<NasResult<BeginChunkedUploadResponse>>;
  appendChunk(
    uploadId: string,
    userId: string,
    offset: number,
    chunk: NodeJS.ReadableStream,
  ): Promise<NasResult<{ receivedBytes: number }>>;
  completeChunkedUpload(
    uploadId: string,
    userId: string,
  ): Promise<NasResult<NasEntry>>;
  abortChunkedUpload(
    uploadId: string,
    userId: string,
  ): Promise<NasResult<void>>;
}

export interface NasStorageServiceDeps {
  store: NasFileStore;
  health: RootHealthChecker;
  /** Defaults to the process-wide `chunkedUploadRegistry` singleton. */
  registry?: ChunkedUploadRegistry;
  config?: Pick<NasStorageConfig, 'maxFileSize'>;
  logger?: Logger;
}

const defaultLogger = loggerFactory('growi:nas-storage:service');

const storageUnavailableError = (): NasError => {
  return normalizeNasError({ code: 'STORAGE_UNAVAILABLE' });
};

/** Join a directory logical path and a single entry name into a logical path. */
const joinLogical = (dir: string, name: string): string => {
  const normalizedDir = dir.endsWith('/') ? dir.slice(0, -1) : dir;
  return `${normalizedDir}/${name}`;
};

export const createNasStorageService = (
  deps: NasStorageServiceDeps,
): NasStorageService => {
  const { store, health } = deps;
  const registry = deps.registry ?? chunkedUploadRegistry;
  const config = deps.config ?? nasStorageConfig;
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

  /**
   * `name (n).ext` suggestion for a non-overwrite CONFLICT: a candidate is free
   * only when the store positively reports `NOT_FOUND`; any other probe outcome
   * (exists, or an ambiguous error) is treated as taken.
   */
  const findSuggestedName = (
    dirLogicalPath: string,
    targetName: string,
  ): Promise<string | undefined> => {
    return suggestNonConflictingName(targetName, async (candidate) => {
      const stat = await store.statEntry(
        joinLogical(dirLogicalPath, candidate),
      );
      return !(!stat.ok && stat.error.code === 'NOT_FOUND');
    });
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

    resolveContent(logicalPath) {
      return run('resolveContent', { logicalPath }, () =>
        store.resolveContentPath(logicalPath),
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
        const suggestedName = await findSuggestedName(
          input.dirLogicalPath,
          input.targetName,
        );
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

    beginChunkedUpload(input) {
      const context = {
        userId: input.userId,
        dirLogicalPath: input.dirLogicalPath,
        targetName: input.targetName,
        totalBytes: input.totalBytes,
        overwrite: input.overwrite,
      };
      return run('beginChunkedUpload', context, async () => {
        const max = config.maxFileSize();
        if (max != null && input.totalBytes > max) {
          return {
            ok: false,
            error: {
              ...normalizeNasError({ code: 'TOO_LARGE' }),
              limitBytes: max,
            },
          };
        }

        // Destination range check (Req 10.1 / 6.7). The service has no `root`, so
        // it probes through the store: `statEntry` runs `resolveSafePath` first
        // and surfaces an escaping path as OUT_OF_ROOT / INVALID_PATH. A
        // resolvable-but-absent destination (NOT_FOUND) is the expected case;
        // an existing destination is fine here — the conflict is settled by the
        // same rules as `putFile` on `complete` (Req 10.6).
        const probe = await store.statEntry(
          joinLogical(input.dirLogicalPath, input.targetName),
        );
        if (
          !probe.ok &&
          (probe.error.code === 'OUT_OF_ROOT' ||
            probe.error.code === 'INVALID_PATH')
        ) {
          return { ok: false, error: probe.error };
        }

        return registry.begin({
          userId: input.userId,
          dirLogicalPath: input.dirLogicalPath,
          targetName: input.targetName,
          totalBytes: input.totalBytes,
          overwrite: input.overwrite,
        });
      });
    },

    appendChunk(uploadId, userId, offset, chunk) {
      return run('appendChunk', { uploadId, userId, offset }, () =>
        registry.append(uploadId, userId, offset, chunk),
      );
    },

    completeChunkedUpload(uploadId, userId) {
      return run('completeChunkedUpload', { uploadId, userId }, () =>
        registry.complete(uploadId, userId),
      );
    },

    abortChunkedUpload(uploadId, userId) {
      return run('abortChunkedUpload', { uploadId, userId }, () =>
        registry.abort(uploadId, userId),
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
      registry: chunkedUploadRegistry,
      config: nasStorageConfig,
    });
  }
  return singleton;
};
