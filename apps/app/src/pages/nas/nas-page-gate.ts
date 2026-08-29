import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type { CrowiRequest } from '~/interfaces/crowi-request';

/**
 * Server-side gate for the `/nas` page. When the NAS File Storage feature is not
 * ready (`GROWI_NAS_ROOT` unset or unusable), the page must behave as 404 so the
 * feature leaves no reachable UI surface — Requirement 1.2.
 *
 * Routed through `crowi.isNasStorageReady()` (not a direct singleton import) for
 * the same realm-safety reason as `common-props`: the root health-checker is
 * populated by `probeOnBoot` only in the Express realm.
 */
export const resolveNasStoragePageGate = (
  context: GetServerSidePropsContext,
): GetServerSidePropsResult<Record<string, never>> => {
  const req = context.req as CrowiRequest;
  if (!req.crowi.isNasStorageReady()) {
    return { notFound: true };
  }
  return { props: {} };
};
