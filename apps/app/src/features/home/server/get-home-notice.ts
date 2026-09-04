import type { GetServerSidePropsContext, GetServerSidePropsResult } from 'next';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import { findPageAndMetaDataByViewer } from '~/server/service/page/find-page-and-meta-data-by-viewer';

import { HOME_NOTICE_PATH } from '../consts';

export type HomeNoticeProps = { noticeMarkdown: string | null };

/**
 * The `/home-notice` page body for this viewer (null when it doesn't exist),
 * shaped as a getServerSideProps result so it merges with the common props.
 */
export const getServerSideHomeNoticeProps = async (
  context: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<HomeNoticeProps>> => {
  const req = context.req as CrowiRequest;
  const { crowi } = req;
  let noticeMarkdown: string | null = null;
  try {
    const { data: page } = await findPageAndMetaDataByViewer(
      crowi.pageService,
      crowi.pageGrantService,
      { pageId: null, path: HOME_NOTICE_PATH, user: req.user, basicOnly: true },
    );
    if (page != null) {
      page.initLatestRevisionField(undefined);
      const populated = await page.populateDataToShowRevision(false);
      noticeMarkdown = populated?.revision?.body ?? null;
    }
  } catch {
    noticeMarkdown = null;
  }
  return { props: { noticeMarkdown } };
};
