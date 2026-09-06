// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

const useCurrentUserMock = vi.fn();
vi.mock('~/states/global', () => ({
  useCurrentUser: (...args: unknown[]) => useCurrentUserMock(...args),
}));

const useIsAdminMock = vi.fn();
vi.mock('~/states/context', () => ({
  useIsAdmin: (...args: unknown[]) => useIsAdminMock(...args),
}));

vi.mock('~/states/server-configurations', () => ({
  useRendererConfig: () => ({}),
}));

vi.mock('~/features/system-requirements', () => ({
  SystemRequirementsTable: () => (
    <div data-testid="system-requirements-table" />
  ),
}));

vi.mock('~/components/PageView/PageContentRenderer', () => ({
  PageContentRenderer: () => <div data-testid="page-content-renderer" />,
}));

vi.mock('./HomeHero', () => ({
  HomeHero: ({ appTitle }: { appTitle: string }) => (
    <div data-testid="home-hero">{appTitle}</div>
  ),
}));

let homeWidgetsProps: Record<string, unknown> | undefined;
vi.mock('./widgets/HomeWidgets', () => ({
  HomeWidgets: (props: Record<string, unknown>) => {
    homeWidgetsProps = props;
    return <div data-testid="home-widgets" />;
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { HomeContent } from './HomeContent';

const siteConfig = { search: { visible: true } };
const pinnedPages = [{ path: '/foo' }];
const widgetPrefs = { bookmarks: { visible: false } };

describe('HomeContent', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
    useIsAdminMock.mockReset();
    useIsAdminMock.mockReturnValue(false);
    homeWidgetsProps = undefined;
  });

  it('renders the hero for a logged-in user', () => {
    useCurrentUserMock.mockReturnValue({ _id: 'user1' });

    render(<HomeContent appTitle="Wiki" noticeMarkdown={null} />);

    expect(screen.getByTestId('home-hero')).toHaveTextContent('Wiki');
  });

  it('renders the hero for an anonymous guest', () => {
    useCurrentUserMock.mockReturnValue(undefined);

    render(<HomeContent appTitle="Wiki" noticeMarkdown={null} />);

    expect(screen.getByTestId('home-hero')).toHaveTextContent('Wiki');
  });

  it('renders the widget area for a logged-in user and passes config + per-user prefs down', () => {
    useCurrentUserMock.mockReturnValue({ _id: 'user1' });

    render(
      <HomeContent
        appTitle="Wiki"
        noticeMarkdown={null}
        homeWidgetsSiteConfig={siteConfig}
        homePinnedPages={pinnedPages}
        homeClassroomPathPrefix="/classroom"
        homeWidgetPreferences={widgetPrefs}
      />,
    );

    expect(screen.getByTestId('home-widgets')).toBeInTheDocument();
    expect(screen.getByTestId('system-requirements-table')).toBeInTheDocument();
    expect(homeWidgetsProps).toMatchObject({
      homeWidgetsSiteConfig: siteConfig,
      homePinnedPages: pinnedPages,
      homeClassroomPathPrefix: '/classroom',
      userWidgetPreferences: widgetPrefs,
    });
  });

  it('does not render the widget area for an anonymous guest, but still renders the notice/table area', () => {
    useCurrentUserMock.mockReturnValue(undefined);

    render(<HomeContent appTitle="Wiki" noticeMarkdown={null} />);

    expect(screen.queryByTestId('home-widgets')).not.toBeInTheDocument();
    expect(screen.getByTestId('system-requirements-table')).toBeInTheDocument();
  });
});
