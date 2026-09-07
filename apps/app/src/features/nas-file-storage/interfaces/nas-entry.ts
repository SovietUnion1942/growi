/**
 * Client-safe types describing entries under the NAS storage root and the
 * paginated listing contract. Types only — safe to import from the browser.
 */

export type NasEntryType = 'file' | 'directory';

export interface NasEntry {
  name: string;
  type: NasEntryType;
  /** Always 0 for a directory. */
  sizeBytes: number;
  /** ISO 8601 timestamp. */
  modifiedAt: string;
}

export interface NasListQuery {
  /** Name of the last entry of the previous page; omitted for the first page. */
  cursor?: string;
  /** Requested page size (1..500); clamped by the route layer. */
  limit: number;
  includeHidden: boolean;
}

export interface NasListPage {
  entries: NasEntry[];
  /** Absent on the final page. */
  nextCursor?: string;
}

/**
 * Filesystem-level capacity of the volume backing the NAS root. The root sits
 * on its own dedicated volume (a size-capped VHDX in the reference deployment),
 * so this doubles as the storage quota for the whole feature.
 */
export interface NasStorageUsage {
  totalBytes: number;
  /** Space still writable by an unprivileged process. */
  freeBytes: number;
  /** `totalBytes - freeBytes`. */
  usedBytes: number;
}
