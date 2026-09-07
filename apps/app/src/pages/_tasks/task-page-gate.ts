import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type { CrowiRequest } from '~/interfaces/crowi-request';

/**
 * Server-side gate for the `/_tasks` page. When `app:taskEnabled`
 * (env `TASK_MODE`) is off the page must behave as 404, so the feature
 * leaves no reachable UI surface.
 *
 * Reads config via `req.crowi.configManager` (the SSR realm has its own
 * instance) — same reason `common-props/commons.ts` destructures it from
 * `crowi`.
 */
export const resolveTaskPageGate = (
  context: GetServerSidePropsContext,
): GetServerSidePropsResult<Record<string, never>> => {
  const { crowi } = context.req as CrowiRequest;
  if (!crowi.configManager.getConfig('app:taskEnabled')) {
    return { notFound: true };
  }
  return { props: {} };
};
