import { randomBytes } from 'node:crypto';
import type { Stats } from 'node:fs';
import { createReadStream } from 'node:fs';
import {
  mkdir,
  open,
  readdir,
  rename,
  rm,
  rmdir,
  stat,
} from 'node:fs/promises';
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
import type { FsWritePrimitives } from './fs-write-ops';
import {
  defaultFsWritePrimitives,
  moveExclusive,
  moveOverwriting,
  tmpPathUnder,
} from './fs-write-ops';
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
 * This class implements both the read side (`list`, `statEntry`, `openRead`) and
 * the mutating side (`moveIntoRoot`, `mkdir`, `move`, `remove`). Every mutating
 * method returns a `NasResult` and never throws for an expected failure, exactly
 * like the read side.
 */
export class FsNasFileStore implements NasFileStore {
  private readonly root: string;

  private readonly writePrimitives: FsWritePrimitives;

  /**
   * `root` must be an already-resolved absolute path (see
   * `nasStorageConfig.resolveRoot()`). `writePrimitives` is a test seam for
   * forcing the cross-device write fallback; production omits it.
   */
  constructor(
    root: string,
    writePrimitives: FsWritePrimitives = defaultFsWritePrimitives,
  ) {
    this.root = root;
    this.writePrimitives = writePrimitives;
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

  // --- mutating operations ---------------------------------------------------

  async moveIntoRoot(input: PutFileInput): Promise<NasResult<NasEntry>> {
    const resolved = await resolveSafePath(
      this.root,
      `${input.dirLogicalPath}/${input.targetName}`,
      [input.dirLogicalPath, input.targetName],
    );
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    const dest = resolved.absolutePath;
    try {
      await mkdir(path.dirname(dest), { recursive: true });
      const makeTmpPath = () => this.reserveTmpPath();

      if (input.overwrite) {
        await moveOverwriting(
          input.sourceTmpPath,
          dest,
          makeTmpPath,
          this.writePrimitives,
        );
      } else {
        await moveExclusive(
          input.sourceTmpPath,
          dest,
          makeTmpPath,
          this.writePrimitives,
        );
      }

      const stats = await stat(dest);
      return { ok: true, value: entryFromStat(path.basename(dest), stats) };
    } catch (err) {
      return { ok: false, error: normalizeNasError(err) };
    }
  }

  async mkdir(parentDir: string, name: string): Promise<NasResult<NasEntry>> {
    const resolved = await resolveSafePath(this.root, `${parentDir}/${name}`, [
      parentDir,
      name,
    ]);
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    try {
      await mkdir(path.dirname(resolved.absolutePath), { recursive: true });
      // Non-recursive leaf: an existing entry surfaces as EEXIST -> CONFLICT.
      await mkdir(resolved.absolutePath);
      const stats = await stat(resolved.absolutePath);
      return {
        ok: true,
        value: entryFromStat(path.basename(resolved.absolutePath), stats),
      };
    } catch (err) {
      return { ok: false, error: normalizeNasError(err) };
    }
  }

  async move(
    fromLogicalPath: string,
    toLogicalPath: string,
    overwrite: boolean,
  ): Promise<NasResult<NasEntry>> {
    const from = await resolveSafePath(this.root, fromLogicalPath);
    if (!from.ok) {
      return { ok: false, error: normalizeNasError({ code: from.code }) };
    }
    const to = await resolveSafePath(this.root, toLogicalPath);
    if (!to.ok) {
      return { ok: false, error: normalizeNasError({ code: to.code }) };
    }

    try {
      // Missing source -> ENOENT -> NOT_FOUND. Also tells us how to reserve the dest.
      const srcStats = await stat(from.absolutePath);
      await mkdir(path.dirname(to.absolutePath), { recursive: true });

      if (overwrite) {
        await rename(from.absolutePath, to.absolutePath);
      } else {
        await this.renameExclusive(
          from.absolutePath,
          to.absolutePath,
          srcStats.isDirectory(),
        );
      }

      const stats = await stat(to.absolutePath);
      return {
        ok: true,
        value: entryFromStat(path.basename(to.absolutePath), stats),
      };
    } catch (err) {
      return { ok: false, error: normalizeNasError(err) };
    }
  }

  async remove(
    logicalPath: string,
    recursive: boolean,
  ): Promise<NasResult<void>> {
    const resolved = await resolveSafePath(this.root, logicalPath);
    if (!resolved.ok) {
      return { ok: false, error: normalizeNasError({ code: resolved.code }) };
    }

    // Destructive-operation guard: the root itself is never a valid target.
    if (resolved.logicalPath === '/') {
      return {
        ok: false,
        error: normalizeNasError({ code: 'PERMISSION_DENIED' }),
      };
    }

    try {
      const stats = await stat(resolved.absolutePath);
      if (stats.isDirectory()) {
        if (recursive) {
          await rm(resolved.absolutePath, { recursive: true });
        } else {
          // Non-empty -> ENOTEMPTY; mapped to NOT_A_DIRECTORY (API contract: 409).
          await rmdir(resolved.absolutePath);
        }
      } else {
        await rm(resolved.absolutePath);
      }
      return { ok: true, value: undefined };
    } catch (err) {
      if ((err as NodeJS.ErrnoException | null)?.code === 'ENOTEMPTY') {
        return {
          ok: false,
          error: normalizeNasError({ code: 'NOT_A_DIRECTORY' }),
        };
      }
      return { ok: false, error: normalizeNasError(err) };
    }
  }

  /** Create `<root>/.growi-nas-tmp/` lazily and return a fresh random path in it. */
  private async reserveTmpPath(): Promise<string> {
    const tmpPath = tmpPathUnder(this.root, randomBytes(16).toString('hex'));
    await mkdir(path.dirname(tmpPath), { recursive: true });
    return tmpPath;
  }

  /**
   * `rename` that refuses to clobber an existing destination, detecting the
   * clash atomically (no pre-`exists` check). A file dest is reserved with an
   * exclusive `open(dest, 'wx')`; a directory dest with `mkdir(dest)` (a
   * `rename` onto an empty dir then succeeds, onto a non-empty one is
   * `ENOTEMPTY`). Either reservation yields `EEXIST` -> `CONFLICT` on a clash,
   * and is rolled back if the `rename` itself fails.
   */
  private async renameExclusive(
    src: string,
    dest: string,
    srcIsDirectory: boolean,
  ): Promise<void> {
    if (srcIsDirectory) {
      await mkdir(dest);
      try {
        await rename(src, dest);
      } catch (err) {
        await rmdir(dest).catch(() => undefined);
        throw err;
      }
      return;
    }

    const reservation = await open(dest, 'wx');
    await reservation.close();
    try {
      await rename(src, dest);
    } catch (err) {
      await rm(dest, { force: true });
      throw err;
    }
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
