import { lstat, readlink, realpath } from 'node:fs/promises';
import path from 'node:path';

import { isPathWithinBase } from '~/server/util/safe-path-utils';

/**
 * Outcome of containing a user-supplied logical path inside the NAS root.
 *
 * `INVALID_PATH` — the input can never denote a location under the root
 * (NUL byte, Windows drive / UNC path).
 * `OUT_OF_ROOT` — the input resolves, lexically or via a symlink, outside the
 * root, or containment could not be positively verified.
 */
export type SafePathResult =
  | { ok: true; absolutePath: string; logicalPath: string }
  | { ok: false; code: 'OUT_OF_ROOT' | 'INVALID_PATH' };

// Design names this `ResolveSafePath`; expressed as a type alias rather than a
// call-signature interface to satisfy biome's useShorthandFunctionType.
export type ResolveSafePath = (
  root: string,
  logicalPath: string,
  segments?: string[],
) => Promise<SafePathResult>;

// Windows drive-absolute (`C:\`, `C:/`) — these must not be honoured as absolute.
const WINDOWS_DRIVE_ABSOLUTE = /^[a-zA-Z]:[\\/]/;

/**
 * Normalize a POSIX-style logical path into path segments.
 *
 * A leading `/` is treated as root-relative (not filesystem-absolute), so
 * absolute-path injection is contained rather than honoured. `.` segments are
 * dropped; `..` segments are kept and left for the post-resolve boundary check
 * to catch as `OUT_OF_ROOT` (a single consistent rejection code for every
 * escaping traversal). Returns `null` for input that can never be a path under
 * the root.
 */
const normalizeToSegments = (input: string): string[] | null => {
  if (input.includes('\u0000')) {
    return null;
  }
  if (WINDOWS_DRIVE_ABSOLUTE.test(input) || input.startsWith('\\\\')) {
    return null;
  }
  return input.split(/[/\\]+/).filter((s) => s.length > 0 && s !== '.');
};

/** Build the canonical logical path (POSIX, root-anchored) for an in-root abs path. */
const toLogicalPath = (root: string, absolutePath: string): string => {
  const rel = path.relative(root, absolutePath);
  if (rel === '') {
    return '/';
  }
  return `/${rel.split(path.sep).join('/')}`;
};

/**
 * A symlink was found at `linkPath` but `realpath()` on it threw `ENOENT`
 * (dangling — the link target, or a leaf of it, does not exist). Resolve the
 * link's *intended* absolute location as far as the filesystem can confirm it:
 * read the link, resolve it against the link's directory, then `realpath()` the
 * target's parent and re-attach the leaf. Returns `null` when the intended
 * location cannot be positively confirmed, which the caller maps to
 * `OUT_OF_ROOT` (fail closed).
 */
const resolveDanglingSymlink = async (
  linkPath: string,
): Promise<string | null> => {
  let linkTarget: string;
  try {
    linkTarget = await readlink(linkPath);
  } catch {
    return null;
  }
  const absTarget = path.resolve(path.dirname(linkPath), linkTarget);
  try {
    const realParent = await realpath(path.dirname(absTarget));
    return path.join(realParent, path.basename(absTarget));
  } catch {
    return null;
  }
};

/**
 * Walk the components of `segments` top-down starting from `realRoot`, resolving
 * every symlink encountered (including dangling ones) to its real absolute
 * location. Stops at the first non-existent component and appends the remainder
 * lexically. Returns the fully-resolved absolute location, or `null` when
 * containment could not be positively verified (a non-`ENOENT` fs error, or a
 * symlink whose real target cannot be confirmed).
 *
 * This is symlink-aware for the not-yet-existing portion of the path: a
 * `root/link -> /outside` symlink is detected as an escape even when its target
 * does not exist, so a later `mkdir -p` / write cannot follow it out of root.
 */
const resolveContainedLocation = async (
  realRoot: string,
  segments: string[],
): Promise<string | null> => {
  let current = realRoot;

  for (let i = 0; i < segments.length; i++) {
    const candidate = path.join(current, segments[i]);

    let stats: Awaited<ReturnType<typeof lstat>>;
    try {
      // Sequential by nature: each component resolves relative to the previous.
      // biome-ignore lint/performance/noAwaitInLoops: top-down component walk is inherently sequential
      stats = await lstat(candidate);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        return null;
      }
      // The rest of the path is genuinely new — append it lexically and stop.
      return path.join(current, ...segments.slice(i));
    }

    if (stats.isSymbolicLink()) {
      try {
        current = await realpath(candidate);
      } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          return null;
        }
        const resolved = await resolveDanglingSymlink(candidate);
        if (resolved == null) {
          return null;
        }
        current = resolved;
      }
    } else {
      current = candidate;
    }
  }

  return current;
};

/**
 * Resolve a user-supplied logical path to an absolute path guaranteed to sit
 * under `root`.
 *
 * `root` is assumed to be an already-resolved absolute path (the caller is
 * `NasStorageConfig.resolveRoot()`). No filesystem entry is created; the
 * existence of the target is the caller's concern — a non-existent leaf is still
 * `ok: true` as long as the resolved (symlink-aware) location is within the root.
 */
export const resolveSafePath: ResolveSafePath = async (
  root,
  logicalPath,
  segments,
) => {
  const rawSegments =
    segments != null
      ? segments.flatMap((s) => normalizeToSegments(s) ?? ['\u0000'])
      : normalizeToSegments(logicalPath);

  if (rawSegments == null || rawSegments.includes('\u0000')) {
    return { ok: false, code: 'INVALID_PATH' };
  }

  // path.join collapses `.` / `..`; root is absolute so the result is absolute.
  const absolutePath = path.join(root, ...rawSegments);

  // Lexical boundary check — catches every `..` traversal that escapes root.
  if (!isPathWithinBase(absolutePath, root)) {
    return { ok: false, code: 'OUT_OF_ROOT' };
  }

  // Resolve the real root (root itself may sit under a symlink).
  let realRoot: string;
  try {
    realRoot = await realpath(root);
  } catch {
    return { ok: false, code: 'OUT_OF_ROOT' };
  }

  // The in-root portion, as clean components (no `..`, contained by the check above).
  const rel = path.relative(root, absolutePath);
  const cleanSegments = rel === '' ? [] : rel.split(path.sep);

  // Symlink-aware containment: walk the components top-down from realRoot,
  // resolving links (dangling ones included) to their real absolute location.
  const realLocation = await resolveContainedLocation(realRoot, cleanSegments);

  if (realLocation == null || !isPathWithinBase(realLocation, realRoot)) {
    return { ok: false, code: 'OUT_OF_ROOT' };
  }

  return {
    ok: true,
    absolutePath,
    logicalPath: toLogicalPath(root, absolutePath),
  };
};
