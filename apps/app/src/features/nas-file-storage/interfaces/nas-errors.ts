/**
 * Error contract shared by every NAS storage layer. The store and service
 * layers never throw for expected failures — they return `NasResult<T>`, a
 * discriminated union the route layer maps mechanically to HTTP statuses.
 */

export type NasErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'OUT_OF_ROOT'
  | 'INVALID_PATH'
  | 'IS_DIRECTORY'
  | 'NOT_A_DIRECTORY'
  | 'PERMISSION_DENIED'
  | 'STORAGE_UNAVAILABLE'
  | 'TOO_LARGE'
  | 'TOO_MANY_ENTRIES'
  | 'UNKNOWN';

export interface NasError {
  code: NasErrorCode;
  /** User-facing summary. Never contains internal paths, errno, or stack. */
  message: string;
  /** Present only for CONFLICT. */
  suggestedName?: string;
  /** Present only for TOO_LARGE. */
  limitBytes?: number;
  /** Present only for TOO_MANY_ENTRIES. */
  limitEntries?: number;
}

export type NasResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: NasError };
