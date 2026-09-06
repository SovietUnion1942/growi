import type { JSX } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import type {
  HomeWidgetPreferences,
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
} from '~/features/home/interfaces/home-widgets';
import { SystemRequirementsTable } from '~/features/system-requirements';
import { useIsAdmin } from '~/states/context';
import { useCurrentUser } from '~/states/global';
import { useRendererConfig } from '~/states/server-configurations';

import { HomeHero } from './HomeHero';
import { HomeWidgetCustomizePanel } from './HomeWidgetCustomizePanel';

const PageContentRenderer = dynamic(
  () =>
    import('~/components/PageView/PageContentRenderer').then(
      (mod) => mod.PageContentRenderer,
    ),
  { ssr: false },
);

type Props = {
  appTitle: string;
  noticeMarkdown: string | null;
  /** SSR site-wide widget layout config, forwarded to the widget area. */
  homeWidgetsSiteConfig?: HomeWidgetsSiteConfig;
  /** SSR admin-maintained pinned pages, forwarded to the widget area. */
  homePinnedPages?: PinnedPageEntry[];
  /** SSR classroom path prefix, forwarded to the widget area. */
  homeClassroomPathPrefix?: string | null;
  /** Hydrated per-user widget visibility/order preferences. */
  homeWidgetPreferences?: HomeWidgetPreferences;
};

/**
 * The standalone home page body: the hero region (wiki name + description,
 * shown to everyone — Requirement 7.1), the admin-authored notice block
 * (sourced from the `customize:homeNotice` config, rendered with the full
 * GROWI renderer so `:::warn` callouts work), the widget area (logged-in
 * users only — Requirement 8.2), and the per-OS system-requirements table
 * (shown to everyone — Requirement 8.1).
 *
 * The SSR site-wide widget config and the hydrated per-user preferences are
 * received here and handed down to `HomeWidgets` (the "受け渡し").
 */
export const HomeContent = ({
  appTitle,
  noticeMarkdown,
  homeWidgetsSiteConfig,
  homePinnedPages,
  homeClassroomPathPrefix,
  homeWidgetPreferences,
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const rendererConfig = useRendererConfig();
  const currentUser = useCurrentUser();

  return (
    <div className="container-lg wide-gutter-x-lg py-4" data-testid="home-page">
      <HomeHero appTitle={appTitle} />

      {noticeMarkdown != null && (
        <section className="my-4">
          <PageContentRenderer
            rendererConfig={rendererConfig}
            // The notice is no longer sourced from a wiki page (see
            // `customize:homeNotice`); pass the home page's own path so the
            // renderer resolves relative links/images against the page it is
            // actually displayed on, rather than the retired notice page.
            pagePath="/"
            markdown={noticeMarkdown}
          />
        </section>
      )}
      {noticeMarkdown == null && isAdmin === true && (
        <div className="alert alert-light border my-4 small">
          {t('home.notice_hint')}
        </div>
      )}

      {/*
        Widget area (Requirement 5.1, 5.2): shown only to logged-in users.
        Anonymous guests keep the exact v1 layout — notice + requirements
        table only — so the widget area must not even mount for them.
        `HomeWidgetCustomizePanel` wraps `HomeWidgets` and adds the opt-in
        per-user customize mode (Requirement 6.1, 6.2, 6.4).
      */}
      {currentUser != null && (
        <HomeWidgetCustomizePanel
          homeWidgetsSiteConfig={homeWidgetsSiteConfig}
          homePinnedPages={homePinnedPages}
          homeClassroomPathPrefix={homeClassroomPathPrefix}
          homeWidgetPreferences={homeWidgetPreferences}
        />
      )}

      <section className="my-4">
        <h2 className="fs-4 border-bottom pb-2 mb-3">
          {t('home.requirements_heading')}
        </h2>
        <SystemRequirementsTable />
      </section>
    </div>
  );
};
