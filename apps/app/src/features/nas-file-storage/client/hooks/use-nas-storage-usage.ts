import useSWR from 'swr';

import type { NasStorageUsage } from '~/features/nas-file-storage/interfaces';

import { type NasRequestError, nasApiRequest } from './use-nas-list';

export interface UseNasStorageUsageResult {
  usage: NasStorageUsage | undefined;
  isLoading: boolean;
  error: NasRequestError | undefined;
  /** Re-read capacity from the server (call after an upload / delete). */
  reload: () => Promise<unknown>;
}

/**
 * Capacity of the volume backing the NAS root. Not auto-revalidated on focus —
 * the browser calls `reload()` after a mutation, which is the only time it
 * meaningfully changes.
 */
export const useNasStorageUsage = (): UseNasStorageUsageResult => {
  const swr = useSWR<NasStorageUsage, NasRequestError>(
    '/nas-storage/usage',
    () => nasApiRequest<NasStorageUsage>('get', '/usage'),
    { revalidateOnFocus: false },
  );

  return {
    usage: swr.data,
    isLoading: swr.isLoading,
    error: swr.error,
    reload: () => swr.mutate(),
  };
};
