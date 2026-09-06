import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type {
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
} from '~/features/home/interfaces/home-widgets';
import type { CrowiRequest } from '~/interfaces/crowi-request';

export type HomeWidgetsConfigProps = {
  homeWidgetsSiteConfig: HomeWidgetsSiteConfig;
  homePinnedPages: PinnedPageEntry[];
  homeClassroomPathPrefix: string | null;
};

/**
 * The admin-configured site-common widget layout for the `/home` first
 * render, shaped as a getServerSideProps result so it merges with the common
 * props (requirements 5.3, 5.5).
 *
 * Reads three `customize:*` admin settings synchronously via `configManager`
 * — no DB query, no page lookup. Per-user widget preferences are deliberately
 * NOT in this bundle: they already reach the client on the hydrated
 * `userUISettings` prop, and resolving site-common + per-user layout is the
 * shared resolver's job.
 *
 * When nothing has been saved the configs resolve to their defaults so the
 * page still renders server-side: `homeWidgetsSiteConfig` -> `{}`,
 * `homePinnedPages` -> `[]`, `homeClassroomPathPrefix` -> `null` (Next.js
 * props must be JSON-serializable, so an unset prefix maps to `null`, not
 * `undefined`). A stored value of the wrong (non-nullish) type is passed
 * through as-is; sanitising malformed config is the fail-safe resolver's
 * responsibility (design "有効レイアウト解決の失敗").
 */
export const getServerSideHomeWidgetsProps = async (
  context: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<HomeWidgetsConfigProps>> => {
  const req = context.req as CrowiRequest;
  const { crowi } = req;

  const homeWidgetsSiteConfig =
    crowi.configManager.getConfig('customize:homeWidgets') ?? {};
  const homePinnedPages =
    crowi.configManager.getConfig('customize:homePinnedPages') ?? [];
  const homeClassroomPathPrefix =
    crowi.configManager.getConfig('customize:homeClassroomPathPrefix') ?? null;

  return {
    props: { homeWidgetsSiteConfig, homePinnedPages, homeClassroomPathPrefix },
  };
};
