import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type { CrowiRequest } from '~/interfaces/crowi-request';

export type HomeNoticeProps = { noticeMarkdown: string | null };

/**
 * The admin-configured home notice (`customize:homeNotice`) for this
 * request, shaped as a getServerSideProps result so it merges with the
 * common props.
 *
 * v2: sourced from the `customize:homeNotice` admin setting via
 * `configManager`, not from the `/home-notice` wiki page. Editing that page
 * no longer has any effect on the home page (requirement 7.3). An
 * empty/unset config value resolves to `null`; the caller (`HomeContent`)
 * already knows the current viewer's admin status independently and decides
 * whether to render an admin hint or hide the notice section entirely
 * (requirement 6.4).
 */
export const getServerSideHomeNoticeProps = async (
  context: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<HomeNoticeProps>> => {
  const req = context.req as CrowiRequest;
  const { crowi } = req;
  const configuredNotice = crowi.configManager.getConfig(
    'customize:homeNotice',
  );
  const noticeMarkdown =
    configuredNotice != null && configuredNotice !== ''
      ? configuredNotice
      : null;
  return { props: { noticeMarkdown } };
};
