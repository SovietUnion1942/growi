// --- Mock boundary -----------------------------------------------------
//
// getServerSideHomeNoticeProps used to read the `/home-notice` wiki page body
// via findPageAndMetaDataByViewer. It now reads the `customize:homeNotice`
// admin setting instead (requirements 6.1-6.4, 7.3): the wiki page is no
// longer consulted at all, so editing it after migration must have zero
// effect on the home page. We assert the sourcing contract — the returned
// noticeMarkdown tracks req.crowi.configManager.getConfig('customize:homeNotice')
// — and that no page-lookup service is touched.
import type { GetServerSidePropsContext } from 'next';
import { mock, mockDeep } from 'vitest-mock-extended';

import type { CrowiRequest } from '~/interfaces/crowi-request';

// Spy on the v1 page-lookup entry point so we can assert the new
// implementation never calls into it (requirement 7.3: post-migration
// `/home-notice` edits must not affect the home page).
const findPageAndMetaDataByViewerMock = vi.fn();
vi.mock('~/server/service/page/find-page-and-meta-data-by-viewer', () => ({
  findPageAndMetaDataByViewer: findPageAndMetaDataByViewerMock,
}));

const { getServerSideHomeNoticeProps } = await import('./get-home-notice');

const buildContext = (
  configValue: string | undefined,
): GetServerSidePropsContext => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key) =>
    key === 'customize:homeNotice' ? configValue : undefined,
  );
  return mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
};

const getNoticeMarkdown = async (
  configValue: string | undefined,
): Promise<string | null> => {
  const result = await getServerSideHomeNoticeProps(buildContext(configValue));
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  const props = await result.props;
  return props.noticeMarkdown;
};

describe('getServerSideHomeNoticeProps', () => {
  it('returns the configured markdown when customize:homeNotice has a value', async () => {
    const noticeMarkdown = await getNoticeMarkdown(
      '# Welcome\n\nHave a nice day.',
    );
    expect(noticeMarkdown).toBe('# Welcome\n\nHave a nice day.');
  });

  it('returns null when customize:homeNotice is unset (admin hint / hidden-section signal)', async () => {
    const noticeMarkdown = await getNoticeMarkdown(undefined);
    expect(noticeMarkdown).toBeNull();
  });

  it('returns null when customize:homeNotice is an empty string', async () => {
    const noticeMarkdown = await getNoticeMarkdown('');
    expect(noticeMarkdown).toBeNull();
  });

  it('never calls the v1 /home-notice page-lookup entry point (requirement 7.3)', async () => {
    const noticeMarkdown = await getNoticeMarkdown('from config');
    expect(noticeMarkdown).toBe('from config');
    expect(findPageAndMetaDataByViewerMock).not.toHaveBeenCalled();
  });
});
