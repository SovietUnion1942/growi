/**
 * Client-safe types for the single-file chunked upload protocol (Requirement 10).
 * A chunk stream is sent sequentially with `Content-Range`; the session lives in
 * memory on the server and is not resumable across process restarts.
 *
 * Types only — this module must not import `node:*` or any runtime value, so it
 * stays safe to import from the browser (client hook in task 11.4) and the route
 * layer alike.
 */

import type { NasEntry } from './nas-entry';

/**
 * In-memory state of one chunked upload session, owned by the
 * `ChunkedUploadRegistry`. Treated as immutable: as chunks arrive the registry
 * replaces the whole object with a copy whose `receivedBytes` advances, rather
 * than mutating in place.
 */
export interface ChunkedUploadSession {
  /** Unguessable id minted with `node:crypto.randomUUID()` on begin. */
  readonly uploadId: string;
  /** Id of the user who started the session; only they may append/complete/abort. */
  readonly userId: string;
  /** Logical path of the destination directory under the NAS root. */
  readonly dirLogicalPath: string;
  /** Final file name at the destination. */
  readonly targetName: string;
  /** Total size the client promised on begin; both this and the real received
   * amount are checked against the max file size. */
  readonly totalBytes: number;
  /** Whether an existing destination file may be overwritten on completion. */
  readonly overwrite: boolean;
  /** Bytes appended to the `.part` file so far; the next chunk's offset must equal this. */
  readonly receivedBytes: number;
  /** Absolute path of the `${root}/.growi-nas-tmp/<uploadId>.part` scratch file. */
  readonly partPath: string;
  /** Creation time, used by the TTL sweep to reap orphaned sessions/`.part` files. */
  readonly createdAt: Date;
}

/**
 * Input to `NasStorageService.beginChunkedUpload` / `ChunkedUploadRegistry.begin`
 * (mirrors the design's `BeginChunkedUploadInput`).
 */
export interface BeginChunkedUploadInput {
  userId: string;
  dirLogicalPath: string;
  targetName: string;
  totalBytes: number;
  overwrite: boolean;
}

/** Request body for `POST /api/v3/nas-storage/uploads`. */
export interface BeginChunkedUploadRequest {
  dir: string;
  name: string;
  totalBytes: number;
  overwrite?: boolean;
}

/** Response body for `POST /api/v3/nas-storage/uploads`. */
export interface BeginChunkedUploadResponse {
  uploadId: string;
  /** Chunk size the client should slice the file into for each `PATCH`. */
  chunkSize: number;
}

/** Response body for `PATCH /api/v3/nas-storage/uploads/:uploadId`. */
export interface AppendChunkResult {
  receivedBytes: number;
}

/**
 * Response body for `POST /api/v3/nas-storage/uploads/:uploadId/complete` — the
 * finalized entry, identical in shape to a single-shot upload result.
 */
export type CompleteChunkedUploadResponse = NasEntry;
