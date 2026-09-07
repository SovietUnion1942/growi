import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';

import type { NextPageWithLayout } from '../_app.page';
import type { CommonEachProps, CommonInitialProps } from '../common-props';
import {
  getServerSideCommonEachProps,
  getServerSideCommonInitialProps,
  getServerSideI18nProps,
} from '../common-props';
import { mergeGetServerSidePropsResults } from '../utils/server-side-props';
import { resolveBoardPageGate } from './board-page-gate';

type Props = CommonInitialProps &
  CommonEachProps & {
    // tldraw SDK license key (env `TLDRAW_LICENSE_KEY`). Passed as a prop
    // rather than `NEXT_PUBLIC_*` so the key can be rotated with an env
    // change + restart, no rebuild. Without it tldraw blanks the editor a
    // few seconds after load on an HTTPS production domain.
    tldrawLicenseKey: string | null;
  };

// biome-ignore-start lint/style/noRestrictedImports: no-problem dynamic import
const TldrawBoard = dynamic(
  () =>
    import('~/features/board/client/components/TldrawBoard').then(
      (mod) => mod.TldrawBoard,
    ),
  { ssr: false },
);
// biome-ignore-end lint/style/noRestrictedImports: no-problem dynamic import

/**
 * Standalone infinite-canvas board editor. Opened directly at `/board/{id}`,
 * or framed by the `:board{id=...}` wiki directive (`?embed=1`). The canvas is
 * independent of any wiki page.
 */
const BoardPage: NextPageWithLayout<Props> = (props: Props) => {
  const router = useRouter();
  const boardId = String(router.query.boardId ?? '');
  const embed = router.query.embed === '1';

  return (
    <>
      <Head>
        <title>{`board: ${boardId}`}</title>
      </Head>
      {boardId !== '' && (
        <TldrawBoard
          boardId={boardId}
          embed={embed}
          licenseKey={props.tldrawLicenseKey ?? undefined}
        />
      )}
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async (
  context: GetServerSidePropsContext,
) => {
  const gateResult = resolveBoardPageGate(context);
  if ('notFound' in gateResult) {
    return gateResult;
  }

  const [commonInitialResult, commonEachResult, i18nPropsResult] =
    await Promise.all([
      getServerSideCommonInitialProps(context),
      getServerSideCommonEachProps(context),
      getServerSideI18nProps(context, ['translation']),
    ]);

  return mergeGetServerSidePropsResults(
    { props: { tldrawLicenseKey: process.env.TLDRAW_LICENSE_KEY ?? null } },
    mergeGetServerSidePropsResults(
      commonInitialResult,
      mergeGetServerSidePropsResults(commonEachResult, i18nPropsResult),
    ),
  );
};

export default BoardPage;
