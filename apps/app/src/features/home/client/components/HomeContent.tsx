import type { JSX } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { SystemRequirementsTable } from '~/features/system-requirements';
import { useIsAdmin } from '~/states/context';
import { useRendererConfig } from '~/states/server-configurations';

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
};

/**
 * The standalone home page body: a welcome heading, the admin-authored notice
 * block (sourced from the `customize:homeNotice` config, rendered with the
 * full GROWI renderer so `:::warn` callouts work), and the per-OS
 * system-requirements table.
 */
export const HomeContent = ({
  appTitle,
  noticeMarkdown,
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();
  const rendererConfig = useRendererConfig();

  return (
    <div className="container-lg wide-gutter-x-lg py-4" data-testid="home-page">
      <h1 className="mb-2">{appTitle}</h1>
      <p className="text-muted">{t('home.welcome')}</p>

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

      <section className="my-4">
        <h2 className="fs-4 border-bottom pb-2 mb-3">
          {t('home.requirements_heading')}
        </h2>
        <SystemRequirementsTable />
      </section>
    </div>
  );
};
