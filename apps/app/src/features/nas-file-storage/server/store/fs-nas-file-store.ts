import type { Stats } from 'node:fs';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

import type {
  NasEntry,
  NasFileStore,
  NasListPage,
  NasListQuery,
  NasResult,
  PutFileInput,
} from '../../interfaces';
import { nasStorageConfig } from '../config/nas-storage-config';
import { normalizeNasError } from '../services/normalize-nas-error';
import { resolveSafePath } from './resolve-safe-path';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/**
 * Names hidden from the default listing on top of every `.`-prefixed name:
 * the feature's own temp dir plus common OS/NAS metadata artifacts (Req 8.4).
 */
const DEFAULT_EXCLUDED_NAMES: ReadonlySet<string> = new Set([
  '.growi-nas-tmp',
  '.DS_Store',
  'Thumbs.db',
  '@eaDir',
]);

const isHiddenName = (name: string): boolean => {
  return name.startsWith('.') || DEFAULT_EXCLUDED_NAMES.has(name);
};

/** Clamp a caller-supplied page size into 1..500, falling back to the default. */
const clampLimit = (limit: number): number => {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }
  const truncated = Math.trunc(limit);
  if (truncated < 1) {
    return 1;
  }
  return Math.min(truncated, MAX_LIMIT);
};

// Locale-independent ascending order by UTF-16 code unit. `localeCompare` is
// deliberately avoided — its ordering depends on the server's locale, which would
// make `cursor` paging non-deterministic across environments.
const byNameAscending = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const entryFromStat = (name: string, stats: Stats): NasEntry => {
  const type = stats.isDirectory() ? 'directory' : 'file';
  return {
    name,
    type,
    sizeBytes: type === 'directory' ? 0 : stats.size,
    modifiedAt: stats.mtime.toISOString(),
  };
};

/**
 * The only `NasFileStore` implementation: real `node:fs` operations confined to
 * a configured root. Every method resolves its logical path through
 * `resolveSafePath` before touching the filesystem, so the root boundary (incl.
 * symlink escapes) is enforced in exactly one place.
 *
 * This class implements the read side (`list`, `statEntry`, `openRead`); the
 * mutating operations are implemented in a later task and currently throw.
 */
export class FsNasFileStore implements NasFileStore {
  private readonly root: string;

  /** `root` must be an already-resolved absolute path (see `nasStorageConfig.resolveRoot()`). */
  constructor(root: string) {
    this.root = root;
  }

  async list(
    dir: string,
    query: NasListQuery,
  ): Promise<NasResult<NasListPage>> {
    const resolved = await resolveSafePath(this.root, dir);
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    const onRoot = resolved.logicalPath === '/';

    try {
      const dirents = await readdir(resolved.absolutePath, {
        withFileTypes: true,
      });

      const maxEntries = nasStorageConfig.maxEntriesPerDir();
      if (dirents.length > maxEntries) {
        return {
          ok: false,
          error: {
            ...normalizeNasError({ code: 'TOO_MANY_ENTRIES' }),
            limitEntries: maxEntries,
          },
        };
      }

      const names = dirents
        .map((d) => d.name)
        .filter((name) => query.includeHidden || !isHiddenName(name))
        .sort(byNameAscending);

      const afterCursor =
        query.cursor != null
          ? names.filter((name) => name > (query.cursor ?? ''))
          : names;

      const limit = clampLimit(query.limit);
      const pageNames = afterCursor.slice(0, limit);
      const hasMore = afterCursor.length > pageNames.length;

      const entries = await Promise.all(
        pageNames.map((name) => this.statChild(resolved.absolutePath, name)),
      );

      return {
        ok: true,
        value: {
          entries,
          nextCursor: hasMore ? pageNames[pageNames.length - 1] : undefined,
        },
      };
    } catch (err) {
      return { ok: false, error: normalizeNasError(err, { onRoot }) };
    }
  }

  async statEntry(logicalPath: string): Promise<NasResult<NasEntry>> {
    const resolved = await resolveSafePath(this.root, logicalPath);
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    try {
      const stats = await stat(resolved.absolutePath);
      return {
        ok: true,
        value: entryFromStat(path.basename(resolved.absolutePath), stats),
      };
    } catch (err) {
      return {
        ok: false,
        error: normalizeNasError(err, {
          onRoot: resolved.logicalPath === '/',
        }),
      };
    }
  }

  async openRead(
    logicalPath: string,
  ): Promise<NasResult<{ stream: NodeJS.ReadableStream; entry: NasEntry }>> {
    const resolved = await resolveSafePath(this.root, logicalPath);
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    try {
      const stats = await stat(resolved.absolutePath);
      if (stats.isDirectory()) {
        return {
          ok: false,
          error: normalizeNasError({ code: 'IS_DIRECTORY' }),
        };
      }

      const entry = entryFromStat(path.basename(resolved.absolutePath), stats);
      // Streamed, never buffered — downloads must not scale with file size.
      const stream = createReadStream(resolved.absolutePath);
      return { ok: true, value: { stream, entry } };
    } catch (err) {
      return { ok: false, error: normalizeNasError(err) };
    }
  }

  // --- mutating operations: implemented in a later task -----------------------

  moveIntoRoot(_input: PutFileInput): Promise<NasResult<NasEntry>> {
    return Promise.reject(
      new Error(
        'FsNasFileStore write operations are implemented in a later task',
      ),
    );
  }

  mkdir(_parentDir: string, _name: string): Promise<NasResult<NasEntry>> {
    return Promise.reject(
      new Error(
        'FsNasFileStore write operations are implemented in a later task',
      ),
    );
  }

  move(
    _fromLogicalPath: string,
    _toLogicalPath: string,
    _overwrite: boolean,
  ): Promise<NasResult<NasEntry>> {
    return Promise.reject(
      new Error(
        'FsNasFileStore write operations are implemented in a later task',
      ),
    );
  }

  remove(_logicalPath: string, _recursive: boolean): Promise<NasResult<void>> {
    return Promise.reject(
      new Error(
        'FsNasFileStore write operations are implemented in a later task',
      ),
    );
  }

  /**
   * `stat` (not `lstat`) a listed child so a symlink reports its target's type.
   * A broken symlink or a child removed between `readdir` and `stat` falls back
   * to a zero-size `file` entry rather than failing the whole page.
   */
  private async statChild(absDir: string, name: string): Promise<NasEntry> {
    try {
      const stats = await stat(path.join(absDir, name));
      return entryFromStat(name, stats);
    } catch {
      return {
        name,
        type: 'file',
        sizeBytes: 0,
        modifiedAt: new Date(0).toISOString(),
      };
    }
  }
}
