import type { NasEntry } from '~/features/nas-file-storage/interfaces';

/** Field a NAS folder listing can be ordered by (client-side only). */
export type NasSortKey = 'name' | 'modified' | 'size';

export type NasSortDir = 'asc' | 'desc';

/** Sensible default direction when the user switches to a given key. */
export const DEFAULT_SORT_DIR: Record<NasSortKey, NasSortDir> = {
  name: 'asc',
  modified: 'desc', // newest first
  size: 'desc', // largest first
};

// UTF-16 code-unit compare, matching the server's locale-independent name order
// (`byNameAscending` in fs-nas-file-store) so a `name` / `asc` sort reproduces
// exactly what the API already returns.
const byCodeUnit = (a: string, b: string): number => {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};

const compareByKey = (a: NasEntry, b: NasEntry, key: NasSortKey): number => {
  switch (key) {
    case 'name':
      return byCodeUnit(a.name, b.name);
    case 'size':
      return a.sizeBytes - b.sizeBytes;
    case 'modified': {
      // `modifiedAt` is an ISO string but the shared axios instance may already
      // have turned it into a Date; `new Date()` accepts either. An unparseable
      // value sorts as 0 (epoch) rather than throwing.
      const at = new Date(a.modifiedAt).getTime() || 0;
      const bt = new Date(b.modifiedAt).getTime() || 0;
      return at - bt;
    }
  }
};

/**
 * Return a new array of `entries` ordered by `key`/`dir`. Ties always break by
 * name ascending so the order is total and stable regardless of the input order
 * (pages arrive name-sorted from the API). Directories are not forced to the
 * top — the sort is purely by the chosen key, which keeps `name`/`asc`
 * identical to the server order.
 */
export const sortNasEntries = (
  entries: NasEntry[],
  key: NasSortKey,
  dir: NasSortDir,
): NasEntry[] => {
  const factor = dir === 'desc' ? -1 : 1;
  return [...entries].sort((a, b) => {
    const primary = compareByKey(a, b, key) * factor;
    if (primary !== 0) return primary;
    return byCodeUnit(a.name, b.name);
  });
};
