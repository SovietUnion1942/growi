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
import { resolveTaskPageGate } from './task-page-gate';

type Props = CommonInitialProps &
  CommonEachProps &
  BasicLayoutConfigurationProps;

// biome-ignore-start lint/style/noRestrictedImports: no-problem dynamic import
const TaskListPage = dynamic(
  () => import('~/features/task').then((mod) => mod.TaskListPage),
  { ssr: false },
);
// biome-ignore-end lint/style/noRestrictedImports: no-problem dynamic import

const TasksPage: NextPageWithLayout<Props> = () => {
  const { t } = useTranslation();
  const title = useCustomTitle(t('task.nav_label'));

  return (
    <>
      <Head>
        <title>{title}</title>
      </Head>
      <div className="dynamic-layout-root">
        <GroundGlassBar className="sticky-top py-4"></GroundGlassBar>

        <div className="main ps-sidebar" data-testid="tasks-page">
          <div className="container-lg wide-gutter-x-lg py-4">
            <h2 className="mb-3">{t('task.nav_label')}</h2>
            <TaskListPage />
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

TasksPage.getLayout = function getLayout(page) {
  return <Layout {...page.props}>{page}</Layout>;
};

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const gateResult = resolveTaskPageGate(context);
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

export default TasksPage;
