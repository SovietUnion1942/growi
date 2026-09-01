import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import dynamic from 'next/dynamic';

import type { CrowiRequest } from '~/interfaces/crowi-request';

import type { NextPageWithLayout } from '../_app.page';
import type { AdminCommonProps } from './_shared';
import {
  createAdminPageLayout,
  getServerSideAdminCommonProps,
} from './_shared';

const BadgeManagement = dynamic(
  () =>
    import(
      // biome-ignore lint/style/noRestrictedImports: no-problem dynamic import
      '~/features/user-badge/client/components/Admin/BadgeManagement'
    ).then((mod) => mod.BadgeManagement),
  { ssr: false },
);

type Props = AdminCommonProps;

const AdminBadgesPage: NextPageWithLayout<Props> = () => <BadgeManagement />;

AdminBadgesPage.getLayout = createAdminPageLayout<Props>({
  title: (_p, t) => t('badge_management.badge_management'),
});

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const { crowi } = context.req as CrowiRequest;
  if (!crowi.configManager.getConfig('app:userBadgeEnabled')) {
    return { notFound: true };
  }
  return getServerSideAdminCommonProps(context);
};

export default AdminBadgesPage;
