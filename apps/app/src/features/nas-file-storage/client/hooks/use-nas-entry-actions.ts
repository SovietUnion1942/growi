import { useCallback, useMemo } from 'react';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { nasApiRequest } from './use-nas-list';

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
 * Mutations against the NAS storage API. Failures reject with `NasRequestError`
 * — callers branch on `.code`.
 *
 * These do NOT revalidate any listing. `useNasList` is a `useSWRInfinite` hook,
 * and a cross-instance `mutate(key-matcher)` does not reach its per-page cache
 * entries; refreshing the view is the caller's job via `useNasList().reload()`
 * after a successful action.
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
    (
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

      return nasApiRequest<NasEntry>('post', '/files', {
        data: form,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    [currentDirPath],
  );

  const createFolder = useCallback(
    (name: string): Promise<NasEntry> =>
      nasApiRequest<NasEntry>('post', '/folders', {
        data: { parentDir: currentDirPath, name },
      }),
    [currentDirPath],
  );

  const rename = useCallback(
    (from: string, to: string, overwrite?: boolean): Promise<NasEntry> =>
      patchEntry(from, to, overwrite),
    [patchEntry],
  );

  const move = useCallback(
    (from: string, to: string, overwrite?: boolean): Promise<NasEntry> =>
      patchEntry(from, to, overwrite),
    [patchEntry],
  );

  const remove = useCallback(
    async (path: string, recursive?: boolean): Promise<void> => {
      await nasApiRequest<{ ok: true }>('delete', '/entries', {
        params: { path, recursive },
      });
    },
    [],
  );

  return useMemo(
    () => ({ uploadFile, createFolder, rename, move, remove }),
    [uploadFile, createFolder, rename, move, remove],
  );
};
