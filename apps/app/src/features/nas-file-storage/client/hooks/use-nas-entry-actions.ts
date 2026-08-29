import { useCallback, useMemo } from 'react';
import { mutate } from 'swr';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { NAS_LIST_ENDPOINT, nasApiRequest } from './use-nas-list';

/**
 * Revalidate every `useNasList` page series whose key targets `dirPath`. The
 * SWR-Infinite per-page cache keys are the raw `NasListKey` tuples, so a key
 * matcher on `[endpoint, dirPath]` reaches all of them regardless of cursor,
 * `includeHidden`, or page size.
 */
const revalidateListFor = (dirPath: string): Promise<unknown> =>
  mutate(
    (key) =>
      Array.isArray(key) && key[0] === NAS_LIST_ENDPOINT && key[1] === dirPath,
    undefined,
    { revalidate: true },
  );

/** Parent directory of a full path (`/a/b/c.txt` -> `/a/b`, `/a` -> `/`). */
const parentDirOf = (fullPath: string): string => {
  const trimmed = fullPath.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : trimmed.slice(0, idx);
};

export interface UseNasEntryActionsResult {
  /**
   * Upload a single file into the current folder. On a name clash the rejection
   * is a `NasRequestError` with `code: 'CONFLICT'` and `suggestedName`; on an
   * oversize file, `code: 'TOO_LARGE'` and `limitBytes`. Sequential
   * orchestration of multi-file uploads is the caller's job.
   */
  uploadFile: (
    file: File,
    opts?: { name?: string; overwrite?: boolean },
  ) => Promise<NasEntry>;
  createFolder: (name: string) => Promise<NasEntry>;
  rename: (from: string, to: string, overwrite?: boolean) => Promise<NasEntry>;
  move: (from: string, to: string, overwrite?: boolean) => Promise<NasEntry>;
  remove: (path: string, recursive?: boolean) => Promise<void>;
}

/**
 * Mutations against the NAS storage API. Every action revalidates the current
 * folder's listing on success (a move also revalidates the destination
 * folder). Failures reject with `NasRequestError` — callers branch on `.code`.
 */
export const useNasEntryActions = (
  currentDirPath: string,
): UseNasEntryActionsResult => {
  const patchEntry = useCallback(
    (from: string, to: string, overwrite?: boolean): Promise<NasEntry> =>
      nasApiRequest<NasEntry>('patch', '/entries', {
        data: { from, to, ...(overwrite != null ? { overwrite } : {}) },
      }),
    [],
  );

  const uploadFile = useCallback(
    async (
      file: File,
      opts?: { name?: string; overwrite?: boolean },
    ): Promise<NasEntry> => {
      const form = new FormData();
      form.append('file', file);
      form.append('dir', currentDirPath);
      if (opts?.name != null) {
        form.append('name', opts.name);
      }
      if (opts?.overwrite != null) {
        form.append('overwrite', String(opts.overwrite));
      }

      const entry = await nasApiRequest<NasEntry>('post', '/files', {
        data: form,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await revalidateListFor(currentDirPath);
      return entry;
    },
    [currentDirPath],
  );

  const createFolder = useCallback(
    async (name: string): Promise<NasEntry> => {
      const entry = await nasApiRequest<NasEntry>('post', '/folders', {
        data: { parentDir: currentDirPath, name },
      });
      await revalidateListFor(currentDirPath);
      return entry;
    },
    [currentDirPath],
  );

  const rename = useCallback(
    async (
      from: string,
      to: string,
      overwrite?: boolean,
    ): Promise<NasEntry> => {
      const entry = await patchEntry(from, to, overwrite);
      await revalidateListFor(currentDirPath);
      return entry;
    },
    [currentDirPath, patchEntry],
  );

  const move = useCallback(
    async (
      from: string,
      to: string,
      overwrite?: boolean,
    ): Promise<NasEntry> => {
      const entry = await patchEntry(from, to, overwrite);
      const destDir = parentDirOf(to);
      await Promise.all(
        destDir === currentDirPath
          ? [revalidateListFor(currentDirPath)]
          : [revalidateListFor(currentDirPath), revalidateListFor(destDir)],
      );
      return entry;
    },
    [currentDirPath, patchEntry],
  );

  const remove = useCallback(
    async (path: string, recursive?: boolean): Promise<void> => {
      await nasApiRequest<{ ok: true }>('delete', '/entries', {
        params: { path, recursive },
      });
      await revalidateListFor(currentDirPath);
    },
    [currentDirPath],
  );

  return useMemo(
    () => ({ uploadFile, createFolder, rename, move, remove }),
    [uploadFile, createFolder, rename, move, remove],
  );
};
