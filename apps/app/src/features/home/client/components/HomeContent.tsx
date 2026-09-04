import type { JSX } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';

import { SystemRequirementsTable } from '~/features/system-requirements';
import { useIsAdmin } from '~/states/context';
import { useRendererConfig } from '~/states/server-configurations';

import { HOME_NOTICE_PATH } from '../../consts';

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
 * block (the `/home-notice` wiki page, rendered with the full GROWI renderer so
 * `:::warn` callouts work), and the per-OS system-requirements table.
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
            pagePath={HOME_NOTICE_PATH}
            markdown={noticeMarkdown}
          />
        </section>
      )}
      {noticeMarkdown == null && isAdmin === true && (
        <div className="alert alert-light border my-4 small">
          {t('home.notice_hint', { path: HOME_NOTICE_PATH })}
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
