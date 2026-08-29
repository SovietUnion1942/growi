/**
 * `NasFileStore` is the sole abstraction over real filesystem operations under
 * the NAS root, and the seam for a future non-FS backend. Every method takes a
 * logical path and internally resolves it within the configured root before
 * touching `node:fs`. Types only — no runtime imports.
 */

import type { NasEntry, NasListPage, NasListQuery } from './nas-entry';
import type { NasResult } from './nas-errors';

export interface PutFileInput {
  dirLogicalPath: string;
  targetName: string;
  /** Path of the multipart temp file to move into the root. */
  sourceTmpPath: string;
  overwrite: boolean;
}

export interface AppendChunkInput {
  /** Absolute path of the `.part` file (registry-owned, inside `.growi-nas-tmp`). */
  partPath: string;
  /** Byte offset this chunk starts at; must equal the current `.part` size. */
  expectedOffset: number;
  chunk: NodeJS.ReadableStream;
}

export interface NasFileStore {
  list(dir: string, query: NasListQuery): Promise<NasResult<NasListPage>>;
  statEntry(logicalPath: string): Promise<NasResult<NasEntry>>;
  openRead(
    logicalPath: string,
  ): Promise<NasResult<{ stream: NodeJS.ReadableStream; entry: NasEntry }>>;
  /**
   * Validate a logical path and return the in-root absolute path plus its
   * `NasEntry` for content delivery, without opening a stream. Directory,
   * missing, and out-of-root targets return `IS_DIRECTORY`, `NOT_FOUND`, and
   * `OUT_OF_ROOT` respectively.
   */
  resolveContentPath(
    logicalPath: string,
  ): Promise<NasResult<{ absolutePath: string; entry: NasEntry }>>;
  moveIntoRoot(input: PutFileInput): Promise<NasResult<NasEntry>>;
  /**
   * Create the 0-byte `${root}/.growi-nas-tmp/<uploadId>.part` backing file for a
   * chunked-upload session. `uploadId` must be a single safe path segment.
   */
  createPart(uploadId: string): Promise<NasResult<{ partPath: string }>>;
  /**
   * Append one chunk to a `.part` file, but only when its current size equals
   * `expectedOffset`; a mismatch returns `CHUNK_OUT_OF_ORDER` without writing.
   * `partPath` must sit directly inside `${root}/.growi-nas-tmp/`.
   */
  appendChunk(input: AppendChunkInput): Promise<NasResult<{ size: number }>>;
  /** Delete a `.part` file (abort / cleanup). Never throws on ENOENT. */
  discardPart(partPath: string): Promise<void>;
  /** Absolute paths of `.part` files whose mtime is older than `cutoff`. */
  listStaleParts(cutoff: Date): Promise<string[]>;
  mkdir(parentDir: string, name: string): Promise<NasResult<NasEntry>>;
  move(
    fromLogicalPath: string,
    toLogicalPath: string,
    overwrite: boolean,
  ): Promise<NasResult<NasEntry>>;
  remove(logicalPath: string, recursive: boolean): Promise<NasResult<void>>;
}
