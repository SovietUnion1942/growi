// --- Mock boundary -----------------------------------------------------
//
// getServerSideHomeWidgetsProps reads the three site-common widget configs
// (`customize:homeWidgets` / `customize:homePinnedPages` /
// `customize:homeClassroomPathPrefix`) straight from configManager for the
// first render (requirements 5.3, 5.5). No DB query, no page lookup. We
// assert the sourcing contract — the returned props track the config values,
// and unset configs resolve to the documented defaults (empty map / empty
// array / null) so the home page can still render server-side.
import type { GetServerSidePropsContext } from 'next';
import { mock, mockDeep } from 'vitest-mock-extended';

import type {
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
} from '~/features/home/interfaces/home-widgets';
import type { CrowiRequest } from '~/interfaces/crowi-request';

type Configs = {
  'customize:homeWidgets'?: HomeWidgetsSiteConfig;
  'customize:homePinnedPages'?: PinnedPageEntry[];
  'customize:homeClassroomPathPrefix'?: string;
};

// Spy on a representative page-lookup entry point to assert this SSR helper
// never touches the DB / page services (config read only).
const findPageAndMetaDataByViewerMock = vi.fn();
vi.mock('~/server/service/page/find-page-and-meta-data-by-viewer', () => ({
  findPageAndMetaDataByViewer: findPageAndMetaDataByViewerMock,
}));

const { getServerSideHomeWidgetsProps } = await import(
  './get-home-widgets-config'
);

const buildContext = (configs: Configs): GetServerSidePropsContext => {
  const req = mockDeep<CrowiRequest>();
  req.crowi.configManager.getConfig.mockImplementation((key) =>
    key in configs ? configs[key as keyof Configs] : undefined,
  );
  return mock<GetServerSidePropsContext>({
    req: req as unknown as GetServerSidePropsContext['req'],
  });
};

const getProps = async (configs: Configs) => {
  const result = await getServerSideHomeWidgetsProps(buildContext(configs));
  if (!('props' in result)) {
    throw new Error('expected a props result');
  }
  return await result.props;
};

describe('getServerSideHomeWidgetsProps', () => {
  it('returns the documented defaults when none of the 3 configs are set', async () => {
    const props = await getProps({});
    expect(props).toEqual({
      homeWidgetsSiteConfig: {},
      homePinnedPages: [],
      homeClassroomPathPrefix: null,
    });
  });

  it('passes through the configured values when the 3 configs are set', async () => {
    const props = await getProps({
      'customize:homeWidgets': { search: { visible: false, order: 3 } },
      'customize:homePinnedPages': [{ path: '/guide', label: 'Guide' }],
      'customize:homeClassroomPathPrefix': '/classroom',
    });
    expect(props).toEqual({
      homeWidgetsSiteConfig: { search: { visible: false, order: 3 } },
      homePinnedPages: [{ path: '/guide', label: 'Guide' }],
      homeClassroomPathPrefix: '/classroom',
    });
  });

  it('never touches a page-lookup / DB service (config read only)', async () => {
    await getProps({ 'customize:homeClassroomPathPrefix': '/classroom' });
    expect(findPageAndMetaDataByViewerMock).not.toHaveBeenCalled();
  });
});
