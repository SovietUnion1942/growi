import type { SWRResponse } from 'swr';
import useSWRImmutable from 'swr/immutable';

import { apiv3Get } from '~/client/util/apiv3-client';

/**
 * Client-safe mirror of the server `NasRootStatus` union (declared in the
 * root-health-checker service). Re-declared here because that type is not
 * exported through the feature's client-safe barrel and client code must not
 * reach into the server layer.
 */
export type NasRootStatus =
  | { state: 'unconfigured' }
  | {
      state: 'misconfigured';
      reason: 'missing' | 'not-a-directory' | 'not-writable';
    }
  | { state: 'ready'; resolvedRoot: string }
  | { state: 'unavailable'; resolvedRoot: string };

/**
 * Response body of `GET /_api/v3/admin/nas-storage/status` (design "Route 層 ->
 * API Contract（setupNasStorageAdmin）").
 */
export interface NasAdminStatus {
  enabled: boolean;
  status: NasRootStatus;
  groupRestriction: string | null;
  maxFileSizeBytes: number | null;
}

/**
 * Admin-only SWR read of the NAS storage status. This is a plain apiv3 admin GET
 * (no `info` slot involved), so the apiv3 client helper is the right transport.
 */
export const useNasAdminStatus = (): SWRResponse<NasAdminStatus, Error> => {
  return useSWRImmutable<NasAdminStatus, Error>(
    '/admin/nas-storage/status',
    (endpoint: string) =>
      apiv3Get<NasAdminStatus>(endpoint).then((res) => res.data),
  );
};
