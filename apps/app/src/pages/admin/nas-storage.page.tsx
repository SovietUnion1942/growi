import type { GetServerSideProps } from 'next';
import dynamic from 'next/dynamic';

import type { NextPageWithLayout } from '../_app.page';
import type { AdminCommonProps } from './_shared';
import {
  createAdminPageLayout,
  getServerSideAdminCommonProps,
} from './_shared';

const NasStorageAdminStatus = dynamic(
  () =>
    import(
      // biome-ignore lint/style/noRestrictedImports: no-problem dynamic import
      '~/features/nas-file-storage/client/admin/NasStorageAdminStatus'
    ).then((mod) => mod.NasStorageAdminStatus),
  { ssr: false },
);

type Props = AdminCommonProps;

const AdminNasStoragePage: NextPageWithLayout<Props> = () => (
  <NasStorageAdminStatus />
);

AdminNasStoragePage.getLayout = createAdminPageLayout<Props>({
  title: (_props, t) => t('nas_storage_management'),
  containerFactories: [],
});

export const getServerSideProps: GetServerSideProps = async (context) => {
  return getServerSideAdminCommonProps(context, { preloadAllLang: true });
};

export default AdminNasStoragePage;
