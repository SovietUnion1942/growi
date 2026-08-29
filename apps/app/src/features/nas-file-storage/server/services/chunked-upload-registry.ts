import { randomUUID } from 'node:crypto';

import type {
  AppendChunkResult,
  BeginChunkedUploadInput,
  BeginChunkedUploadResponse,
  ChunkedUploadSession,
  NasEntry,
  NasError,
  NasErrorCode,
  NasFileStore,
  NasResult,
} from '../../interfaces';
import type { NasStorageConfig } from '../config/nas-storage-config';
import { nasStorageConfig } from '../config/nas-storage-config';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import { normalizeNasError } from './normalize-nas-error';

/**
 * In-memory session registry for the single-file chunked upload protocol
 * (Requirement 10). One GROWI process is assumed — sessions live in a plain
 * `Map` and are lost on restart (resume is an explicit Non-Goal). The registry
 * owns session state and the sequential-append guard; the FS-level `.part`
 * mechanics belong to `NasFileStore`.
 */
export interface ChunkedUploadRegistry {
  begin(
    input: BeginChunkedUploadInput,
  ): Promise<NasResult<BeginChunkedUploadResponse>>;
  append(
    uploadId: string,
    userId: string,
    offset: number,
    chunk: NodeJS.ReadableStream,
  ): Promise<NasResult<AppendChunkResult>>;
  complete(uploadId: string, userId: string): Promise<NasResult<NasEntry>>;
  abort(uploadId: string, userId: string): Promise<NasResult<void>>;
  /** Boot-time + periodic reap of expired sessions and orphan `.part` files. */
  sweepStale(): Promise<void>;
}

export interface ChunkedUploadRegistryDeps {
  store: NasFileStore;
  config: Pick<NasStorageConfig, 'maxFileSize'>;
  /** Injectable clock for the TTL sweep; defaults to the wall clock. */
  now?: () => Date;
}

/** Chunk size the client slices each `PATCH` into (8 MiB). */
export const CHUNK_SIZE = 8 * 1024 * 1024;

/** A session / `.part` older than this is reaped by `sweepStale` (24h). */
const STALE_MS = 24 * 60 * 60 * 1000;

const fail = (code: NasErrorCode): { ok: false; error: NasError } => {
  return { ok: false, error: normalizeNasError({ code }) };
};

export const createChunkedUploadRegistry = (
  deps: ChunkedUploadRegistryDeps,
): ChunkedUploadRegistry => {
  const { store, config } = deps;
  const now = deps.now ?? (() => new Date());

  const sessions = new Map<string, ChunkedUploadSession>();
  /** Per-session promise chain serialising concurrent `append` calls. */
  const appendChains = new Map<string, Promise<unknown>>();

  /** Drop all in-memory state for a session (both maps must stay in step). */
  const dropSession = (uploadId: string): void => {
    sessions.delete(uploadId);
    appendChains.delete(uploadId);
  };

  const requireOwnedSession = (
    uploadId: string,
    userId: string,
  ):
    | { ok: true; session: ChunkedUploadSession }
    | { ok: false; error: NasError } => {
    const session = sessions.get(uploadId);
    if (session == null) {
      return fail('UPLOAD_SESSION_NOT_FOUND');
    }
    if (session.userId !== userId) {
      return fail('PERMISSION_DENIED');
    }
    return { ok: true, session };
  };

  const appendCritical = async (
    uploadId: string,
    offset: number,
    chunk: NodeJS.ReadableStream,
  ): Promise<NasResult<AppendChunkResult>> => {
    const session = sessions.get(uploadId);
    if (session == null) {
      return fail('UPLOAD_SESSION_NOT_FOUND');
    }
    // Gap / overlap / reorder is rejected without touching the store (Req 10.4).
    if (offset !== session.receivedBytes) {
      return fail('CHUNK_OUT_OF_ORDER');
    }

    const res = await store.appendChunk({
      partPath: session.partPath,
      expectedOffset: session.receivedBytes,
      chunk,
    });
    if (!res.ok) {
      return res;
    }

    sessions.set(uploadId, { ...session, receivedBytes: res.value.size });
    return { ok: true, value: { receivedBytes: res.value.size } };
  };

  return {
    async begin(input) {
      const uploadId = randomUUID();
      const created = await store.createPart(uploadId);
      if (!created.ok) {
        return created;
      }

      sessions.set(uploadId, {
        uploadId,
        userId: input.userId,
        dirLogicalPath: input.dirLogicalPath,
        targetName: input.targetName,
        totalBytes: input.totalBytes,
        overwrite: input.overwrite,
        receivedBytes: 0,
        partPath: created.value.partPath,
        createdAt: now(),
      });

      return { ok: true, value: { uploadId, chunkSize: CHUNK_SIZE } };
    },

    append(uploadId, userId, offset, chunk) {
      const owned = requireOwnedSession(uploadId, userId);
      if (!owned.ok) {
        return Promise.resolve(owned);
      }

      const prev = appendChains.get(uploadId) ?? Promise.resolve();
      const run = prev.then(() => appendCritical(uploadId, offset, chunk));
      // Keep the chain alive even if this append rejects/settles as an error.
      appendChains.set(
        uploadId,
        run.catch(() => undefined),
      );
      return run;
    },

    async complete(uploadId, userId) {
      const owned = requireOwnedSession(uploadId, userId);
      if (!owned.ok) {
        return owned;
      }
      const { session } = owned;

      // Req 10.7 — the joined result must match what the client promised.
      if (session.receivedBytes !== session.totalBytes) {
        await store.discardPart(session.partPath);
        dropSession(uploadId);
        return {
          ok: false,
          error: {
            code: 'UNKNOWN',
            message: 'nas_storage.error.chunk_size_mismatch',
          },
        };
      }

      // Req 10.5 — the size cap applies to the real received total too.
      const max = config.maxFileSize();
      if (max != null && session.receivedBytes > max) {
        await store.discardPart(session.partPath);
        dropSession(uploadId);
        return {
          ok: false,
          error: {
            ...normalizeNasError({ code: 'TOO_LARGE' }),
            limitBytes: max,
          },
        };
      }

      // Req 10.6 — finalization goes through the same atomic move + conflict
      // handling as a single-shot upload. `suggestedName` enrichment on CONFLICT
      // is the service wrapper's job (mirrors `NasStorageService.putFile`).
      const moved = await store.moveIntoRoot({
        dirLogicalPath: session.dirLogicalPath,
        targetName: session.targetName,
        sourceTmpPath: session.partPath,
        overwrite: session.overwrite,
      });

      // The session is dropped whether or not the move succeeded — a retry
      // starts a fresh session (Req 10.4).
      dropSession(uploadId);
      if (!moved.ok) {
        // On any failure path (CONFLICT included) the `.part` was not consumed
        // by the move, so drop it rather than leaking a scratch file.
        await store.discardPart(session.partPath);
        return moved;
      }
      return moved;
    },

    async abort(uploadId, userId) {
      const owned = requireOwnedSession(uploadId, userId);
      if (!owned.ok) {
        return owned;
      }
      await store.discardPart(owned.session.partPath);
      dropSession(uploadId);
      return { ok: true, value: undefined };
    },

    async sweepStale() {
      const cutoffMs = now().getTime() - STALE_MS;

      for (const [id, session] of [...sessions]) {
        if (session.createdAt.getTime() < cutoffMs) {
          // biome-ignore lint/performance/noAwaitInLoops: sequential cleanup, bounded by session count
          await store.discardPart(session.partPath).catch(() => undefined);
          dropSession(id);
        }
      }

      // `.part` files still backing a live session are never orphans.
      const liveParts = new Set(
        [...sessions.values()].map((session) => session.partPath),
      );
      const orphans = await store
        .listStaleParts(new Date(cutoffMs))
        .catch(() => [] as string[]);
      for (const partPath of orphans) {
        if (liveParts.has(partPath)) {
          continue;
        }
        // biome-ignore lint/performance/noAwaitInLoops: sequential cleanup, bounded by orphan count
        await store.discardPart(partPath).catch(() => undefined);
      }
    },
  };
};

/**
 * Process-wide singleton used by the service wrapper (task 9.3) and the boot
 * sweeper wiring (task 10.1). Mirrors `rootHealthChecker`: built eagerly against
 * the env-resolved root; when no root is configured the store is never touched
 * because the service gates every call on `RootHealthChecker.ensureReady()`.
 */
export const chunkedUploadRegistry = createChunkedUploadRegistry({
  store: new FsNasFileStore(nasStorageConfig.resolveRoot() ?? ''),
  config: nasStorageConfig,
});
