import type { JSX, ReactNode } from 'react';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';

import { BasicLayout } from '~/components/Layout/BasicLayout';
import { GroundGlassBar } from '~/components/Navbar/GroundGlassBar';

import type { NextPageWithLayout } from '../_app.page';
import type { BasicLayoutConfigurationProps } from '../basic-layout-page';
import { getServerSideBasicLayoutProps } from '../basic-layout-page';
import { useHydrateBasicLayoutConfigurationAtoms } from '../basic-layout-page/hydrate';
import type { CommonEachProps, CommonInitialProps } from '../common-props';
import {
  getServerSideCommonEachProps,
  getServerSideCommonInitialProps,
  getServerSideI18nProps,
} from '../common-props';
import { useCustomTitle } from '../utils/page-title-customization';
import { mergeGetServerSidePropsResults } from '../utils/server-side-props';
import { resolveNasStoragePageGate } from './nas-page-gate';

type Props = CommonInitialProps &
  CommonEachProps &
  BasicLayoutConfigurationProps;

// biome-ignore-start lint/style/noRestrictedImports: no-problem dynamic import
const NasStorageBrowser = dynamic(
  () =>
    import(
      '~/features/nas-file-storage/client/components/NasStorageBrowser'
    ).then((mod) => mod.NasStorageBrowser),
  { ssr: false },
);
// biome-ignore-end lint/style/noRestrictedImports: no-problem dynamic import

const NasStoragePage: NextPageWithLayout<Props> = () => {
  const { t } = useTranslation();
  const title = useCustomTitle(t('nas_storage.nav_label'));

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="dynamic-layout-root">
        <GroundGlassBar className="sticky-top py-4"></GroundGlassBar>

        <div className="main ps-sidebar" data-testid="nas-storage-page">
          <div className="container-lg wide-gutter-x-lg py-4">
            <h2 className="mb-3">{t('nas_storage.nav_label')}</h2>
            <NasStorageBrowser />
          </div>
        </div>
      </div>
    </>
  );
};

type LayoutProps = Props & {
  children?: ReactNode;
};

const Layout = ({ children, ...props }: LayoutProps): JSX.Element => {
  useHydrateBasicLayoutConfigurationAtoms(
    props.searchConfig,
    props.sidebarConfig,
    props.userUISettings,
  );

  return <BasicLayout>{children}</BasicLayout>;
};

NasStoragePage.getLayout = function getLayout(page) {
  return <Layout {...page.props}>{page}</Layout>;
};

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  // Req 1.2: the feature leaves no reachable UI surface when disabled.
  const gateResult = resolveNasStoragePageGate(context);
  if ('notFound' in gateResult) {
    return gateResult;
  }

  const [
    commonInitialResult,
    commonEachResult,
    basicLayoutResult,
    i18nPropsResult,
  ] = await Promise.all([
    getServerSideCommonInitialProps(context),
    getServerSideCommonEachProps(context),
    getServerSideBasicLayoutProps(context),
    getServerSideI18nProps(context, ['translation']),
  ]);

  return mergeGetServerSidePropsResults(
    commonInitialResult,
    mergeGetServerSidePropsResults(
      commonEachResult,
      mergeGetServerSidePropsResults(basicLayoutResult, i18nPropsResult),
    ),
  );
};

export default NasStoragePage;
