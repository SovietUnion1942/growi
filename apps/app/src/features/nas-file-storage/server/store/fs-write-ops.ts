import { createReadStream, createWriteStream } from 'node:fs';
import { link, open, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

/**
 * The two same-volume fast-path primitives `FsNasFileStore` tries first. They are
 * injectable so a unit test can force the cross-device (`EXDEV`) fallback without
 * a real second filesystem; production always uses the `node:fs/promises`
 * implementations below.
 */
export interface FsWritePrimitives {
  /** Atomic same-volume replace (`overwrite=true` fast path). */
  rename: (src: string, dest: string) => Promise<void>;
  /** Atomic same-volume exclusive create (`overwrite=false` fast path). */
  link: (src: string, dest: string) => Promise<void>;
  /** Opens the source for the copy fallback; overridable to simulate a mid-stream read error. */
  openReadStream: (src: string) => NodeJS.ReadableStream;
}

export const defaultFsWritePrimitives: FsWritePrimitives = {
  rename,
  link,
  openReadStream: createReadStream,
};

const errno = (err: unknown): string | undefined => {
  return (err as NodeJS.ErrnoException | null)?.code;
};

/** A path under `<root>/.growi-nas-tmp/` (caller ensures the dir exists). */
export const tmpPathUnder = (root: string, randomToken: string): string => {
  return path.join(root, '.growi-nas-tmp', randomToken);
};

/** Lazily creates `<root>/.growi-nas-tmp/` on first use only. */
export type MakeTmpPath = () => Promise<string>;

/**
 * Move `src` to `dest`, overwriting any existing `dest` atomically.
 *
 * Same volume: a single `rename`. Cross-device (`EXDEV`): stream-copy into
 * `tmpPath` (already under the root, so same volume as `dest`), then an atomic
 * `rename` onto `dest`; the original `dest` is only touched by that final rename.
 * Any failure removes the half-written temp file — never a partial `dest`.
 */
export const moveOverwriting = async (
  src: string,
  dest: string,
  makeTmpPath: MakeTmpPath,
  prim: FsWritePrimitives,
): Promise<void> => {
  try {
    await prim.rename(src, dest);
    return;
  } catch (err) {
    if (errno(err) !== 'EXDEV') {
      throw err;
    }
  }

  const tmpPath = await makeTmpPath();
  try {
    await pipeline(prim.openReadStream(src), createWriteStream(tmpPath));
    // Same-volume rename (tmp is under the root) — the real primitive, not the injected one.
    await rename(tmpPath, dest);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
  await unlink(src).catch(() => undefined);
};

/**
 * Move `src` to `dest` only when `dest` does not yet exist, detecting a clash
 * atomically (no pre-`exists` check — TOCTOU-free).
 *
 * Same volume: `link` + `unlink` — `link` fails `EEXIST` if `dest` is taken.
 * Cross-device (`EXDEV`): reserve `dest` with an exclusive `open(dest, 'wx')`
 * (atomic; `EEXIST` on a clash), stream-copy into `tmpPath`, then `rename` the
 * copy over our own reservation. Any failure removes both the temp file and the
 * reservation, leaving no partial `dest`.
 *
 * `EEXIST` is left to propagate; the caller normalizes it to `CONFLICT`.
 */
export const moveExclusive = async (
  src: string,
  dest: string,
  makeTmpPath: MakeTmpPath,
  prim: FsWritePrimitives,
): Promise<void> => {
  try {
    await prim.link(src, dest);
    await unlink(src).catch(() => undefined);
    return;
  } catch (err) {
    const code = errno(err);
    if (code !== 'EXDEV') {
      // EEXIST (clash) and everything else propagate unchanged.
      throw err;
    }
  }

  // EXDEV fallback. Reserve the destination name atomically first.
  const reservation = await open(dest, 'wx');
  await reservation.close();

  const tmpPath = await makeTmpPath();
  try {
    await pipeline(prim.openReadStream(src), createWriteStream(tmpPath));
    await rename(tmpPath, dest);
  } catch (err) {
    await rm(tmpPath, { force: true });
    await rm(dest, { force: true });
    throw err;
  }
  await unlink(src).catch(() => undefined);
};
