import type { JSX, ReactNode } from 'react';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import Head from 'next/head';
import { useTranslation } from 'next-i18next';

import { BasicLayout } from '~/components/Layout/BasicLayout';
import { GroundGlassBar } from '~/components/Navbar/GroundGlassBar';
import { HomeContent } from '~/features/home';
import { getServerSideHomeNoticeProps } from '~/features/home/server/get-home-notice';

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
import type {
  RendererConfigProps,
  ServerConfigurationProps,
} from '../general-page';
import {
  getServerSideGeneralPageProps,
  getServerSideRendererConfigProps,
} from '../general-page';
import { useHydrateGeneralPageConfigurationAtoms } from '../general-page/hydrate';
import { useCustomTitle } from '../utils/page-title-customization';
import { mergeGetServerSidePropsResults } from '../utils/server-side-props';

type Props = CommonInitialProps &
  CommonEachProps &
  BasicLayoutConfigurationProps &
  ServerConfigurationProps &
  RendererConfigProps & { noticeMarkdown: string | null };

const HomePage: NextPageWithLayout<Props> = (props: Props) => {
  const { t } = useTranslation();
  const title = useCustomTitle(t('home.nav_label'));

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="dynamic-layout-root">
        <GroundGlassBar className="sticky-top py-4" />
        <div className="main ps-sidebar">
          <HomeContent
            appTitle={props.appTitle}
            noticeMarkdown={props.noticeMarkdown}
          />
        </div>
      </div>
    </>
  );
};

type LayoutProps = Props & { children?: ReactNode };

const Layout = ({ children, ...props }: LayoutProps): JSX.Element => {
  useHydrateBasicLayoutConfigurationAtoms(
    props.searchConfig,
    props.sidebarConfig,
    props.userUISettings,
  );
  useHydrateGeneralPageConfigurationAtoms(
    props.serverConfig,
    props.rendererConfig,
  );
  return <BasicLayout>{children}</BasicLayout>;
};

HomePage.getLayout = function getLayout(page) {
  return <Layout {...page.props}>{page}</Layout>;
};

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const [
    commonInitial,
    commonEach,
    basicLayout,
    generalPage,
    rendererConfig,
    i18nProps,
    homeNotice,
  ] = await Promise.all([
    getServerSideCommonInitialProps(context),
    getServerSideCommonEachProps(context),
    getServerSideBasicLayoutProps(context),
    getServerSideGeneralPageProps(context),
    getServerSideRendererConfigProps(context),
    getServerSideI18nProps(context, ['translation', 'commons']),
    getServerSideHomeNoticeProps(context),
  ]);

  return mergeGetServerSidePropsResults(
    commonInitial,
    mergeGetServerSidePropsResults(
      commonEach,
      mergeGetServerSidePropsResults(
        basicLayout,
        mergeGetServerSidePropsResults(
          generalPage,
          mergeGetServerSidePropsResults(
            rendererConfig,
            mergeGetServerSidePropsResults(i18nProps, homeNotice),
          ),
        ),
      ),
    ),
  );
};

export default HomePage;
