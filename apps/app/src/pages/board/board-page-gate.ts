import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type { CrowiRequest } from '~/interfaces/crowi-request';

/**
 * Server-side gate for the `/board/*` pages. When `app:boardEnabled`
 * (env `BOARD_MODE`) is off the pages must behave as 404, so the feature
 * leaves no reachable UI surface.
 *
 * Reads config via `req.crowi.configManager`, not a directly-imported
 * singleton: this runs in the Next SSR realm, where a directly-imported
 * `configManager` is a separate, unloaded instance ("Config is not loaded").
 * Same reason `common-props/commons.ts` destructures it from `crowi`.
 */
export const resolveBoardPageGate = (
  context: GetServerSidePropsContext,
): GetServerSidePropsResult<Record<string, never>> => {
  const { crowi } = context.req as CrowiRequest;
  if (!crowi.configManager.getConfig('app:boardEnabled')) {
    return { notFound: true };
  }
  return { props: {} };
};
