import path from 'node:path';

/**
 * Typed accessor over the `GROWI_NAS_*` environment variables.
 *
 * By design this feature reads `process.env` directly and never goes through
 * `configManager` / `config-definition.ts`: the NAS root and its options are
 * env-only and must not be overridable from the database. All direct
 * `process.env` access for this feature is confined to this module.
 *
 * Parsing is defensive: unset, empty, whitespace-only, non-numeric or
 * non-positive numeric values fall back to the documented default (or "unset").
 * Nothing here throws, so importing the module is always safe at boot time.
 */

const DEFAULT_MAX_ENTRIES_PER_DIR = 50_000;

const TRUTHY_TOKENS = new Set(['true', '1', 'yes', 'on']);

/** Read an env var, trimming it and mapping empty/whitespace-only to undefined. */
const readTrimmed = (name: string): string | undefined => {
  const raw = process.env[name];
  if (raw == null) {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/** Read an env var and interpret it as a boolean flag (default false). */
const readBooleanFlag = (name: string): boolean => {
  const value = readTrimmed(name);
  return value != null && TRUTHY_TOKENS.has(value.toLowerCase());
};

/** Parse a strictly-positive integer, or undefined when absent / invalid. */
const readPositiveInt = (name: string): number | undefined => {
  const value = readTrimmed(name);
  if (value == null) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
};

export const nasStorageConfig = {
  /** Raw (trimmed) `GROWI_NAS_ROOT`, or undefined when unset/empty. */
  root(): string | undefined {
    return readTrimmed('GROWI_NAS_ROOT');
  },

  /** `GROWI_NAS_ROOT` resolved to an absolute path, or undefined when unset. */
  resolveRoot(): string | undefined {
    const root = this.root();
    return root != null ? path.resolve(root) : undefined;
  },

  /**
   * Master on/off switch. `GROWI_NAS_ENABLED` must be explicitly truthy for the
   * feature to activate — an opt-in default so a configured `GROWI_NAS_ROOT` /
   * mounted volume alone does not turn it on. Health of the root is checked
   * separately by `RootHealthChecker`.
   */
  enabled(): boolean {
    return readBooleanFlag('GROWI_NAS_ENABLED');
  },

  /** Alias of `enabled()`; kept for readability at call sites. */
  isEnabled(): boolean {
    return this.enabled();
  },

  /** Optional single group name that access is restricted to; undefined = no restriction. */
  groupName(): string | undefined {
    return readTrimmed('GROWI_NAS_GROUP');
  },

  /** Optional per-file upload size limit in bytes; undefined = no limit. */
  maxFileSize(): number | undefined {
    return readPositiveInt('GROWI_NAS_MAX_FILE_SIZE');
  },

  /** Whether hidden / system entries are shown by default. Defaults to false. */
  showHidden(): boolean {
    return readBooleanFlag('GROWI_NAS_SHOW_HIDDEN');
  },

  /** Per-directory entry cap protecting the full readdir+sort. Defaults to 50,000. */
  maxEntriesPerDir(): number {
    return (
      readPositiveInt('GROWI_NAS_MAX_ENTRIES_PER_DIR') ??
      DEFAULT_MAX_ENTRIES_PER_DIR
    );
  },
} as const;

export type NasStorageConfig = typeof nasStorageConfig;
