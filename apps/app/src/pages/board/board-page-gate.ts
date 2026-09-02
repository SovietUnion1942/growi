import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import { configManager } from '~/server/service/config-manager';

/**
 * Server-side gate for the `/board/*` pages. When `app:boardEnabled`
 * (env `BOARD_MODE`) is off the pages must behave as 404, so the feature
 * leaves no reachable UI surface. Mirrors `nas/nas-page-gate.ts`.
 */
export const resolveBoardPageGate = (
  _context: GetServerSidePropsContext,
): GetServerSidePropsResult<Record<string, never>> => {
  if (!configManager.getConfig('app:boardEnabled')) {
    return { notFound: true };
  }
  return { props: {} };
};
