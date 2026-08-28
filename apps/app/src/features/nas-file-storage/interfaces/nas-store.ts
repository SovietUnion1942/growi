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

export interface NasFileStore {
  list(dir: string, query: NasListQuery): Promise<NasResult<NasListPage>>;
  statEntry(logicalPath: string): Promise<NasResult<NasEntry>>;
  openRead(
    logicalPath: string,
  ): Promise<NasResult<{ stream: NodeJS.ReadableStream; entry: NasEntry }>>;
  moveIntoRoot(input: PutFileInput): Promise<NasResult<NasEntry>>;
  mkdir(parentDir: string, name: string): Promise<NasResult<NasEntry>>;
  move(
    fromLogicalPath: string,
    toLogicalPath: string,
    overwrite: boolean,
  ): Promise<NasResult<NasEntry>>;
  remove(logicalPath: string, recursive: boolean): Promise<NasResult<void>>;
}
