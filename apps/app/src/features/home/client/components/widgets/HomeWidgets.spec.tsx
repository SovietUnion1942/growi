// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import type { HomeWidgetPreferences } from '~/features/home/interfaces/home-widgets';

// Each widget module is replaced with a testid stub. The mock functions also
// record the props they were called with, so the prop-wiring done by
// HomeWidgets can be asserted directly.
const SearchWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="search-widget" />
));
const RecentUpdatesWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="recent-updates-widget" />
));
const BookmarksWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="bookmarks-widget" />
));
const WipPagesWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="wip-pages-widget" />
));
const ClassroomPostsWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="classroom-posts-widget" />
));
const PinnedPagesWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="pinned-pages-widget" />
));
const HomeFeedWidgetMock = vi.fn((_props: unknown) => (
  <div data-testid="home-feed-widget" />
));

vi.mock('./SearchWidget', () => ({
  SearchWidget: (props: unknown) => SearchWidgetMock(props),
}));
vi.mock('./RecentUpdatesWidget', () => ({
  RecentUpdatesWidget: (props: unknown) => RecentUpdatesWidgetMock(props),
}));
vi.mock('./BookmarksWidget', () => ({
  BookmarksWidget: (props: unknown) => BookmarksWidgetMock(props),
}));
vi.mock('./WipPagesWidget', () => ({
  WipPagesWidget: (props: unknown) => WipPagesWidgetMock(props),
}));
vi.mock('./ClassroomPostsWidget', () => ({
  ClassroomPostsWidget: (props: unknown) => ClassroomPostsWidgetMock(props),
}));
vi.mock('./PinnedPagesWidget', () => ({
  PinnedPagesWidget: (props: unknown) => PinnedPagesWidgetMock(props),
}));
vi.mock('./HomeFeedWidget', () => ({
  HomeFeedWidget: (props: unknown) => HomeFeedWidgetMock(props),
}));

import { HomeWidgets } from './HomeWidgets';

const ALL_TESTIDS = [
  'search-widget',
  'recent-updates-widget',
  'bookmarks-widget',
  'wip-pages-widget',
  'classroom-posts-widget',
  'pinned-pages-widget',
  'home-feed-widget',
] as const;

const resetMock = (mock: ReturnType<typeof vi.fn>, testId: string) => {
  mock.mockReset().mockImplementation(() => <div data-testid={testId} />);
};

const expectDomOrder = (testIds: readonly string[]) => {
  const elements = testIds.map((id) => screen.getByTestId(id));
  for (let i = 0; i < elements.length - 1; i += 1) {
    const position = elements[i].compareDocumentPosition(elements[i + 1]);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
};

describe('HomeWidgets', () => {
  beforeEach(() => {
    resetMock(SearchWidgetMock, 'search-widget');
    resetMock(RecentUpdatesWidgetMock, 'recent-updates-widget');
    resetMock(BookmarksWidgetMock, 'bookmarks-widget');
    resetMock(WipPagesWidgetMock, 'wip-pages-widget');
    resetMock(ClassroomPostsWidgetMock, 'classroom-posts-widget');
    resetMock(PinnedPagesWidgetMock, 'pinned-pages-widget');
    resetMock(HomeFeedWidgetMock, 'home-feed-widget');
  });

  it('renders all 7 widgets in the default resolved order', () => {
    render(<HomeWidgets />);

    for (const id of ALL_TESTIDS) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expectDomOrder(ALL_TESTIDS);
  });

  it('hides a widget the site config marks not visible (Req 5.3)', () => {
    render(
      <HomeWidgets homeWidgetsSiteConfig={{ bookmarks: { visible: false } }} />,
    );

    expect(screen.queryByTestId('bookmarks-widget')).not.toBeInTheDocument();
    for (const id of ALL_TESTIDS.filter((i) => i !== 'bookmarks-widget')) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  it('lets a per-user preference re-show a widget the site config hid (Req 6.3)', () => {
    render(
      <HomeWidgets
        homeWidgetsSiteConfig={{ search: { visible: false } }}
        userWidgetPreferences={{ search: { visible: true } }}
      />,
    );

    expect(screen.getByTestId('search-widget')).toBeInTheDocument();
  });

  it('reorders widgets by resolved order (site config)', () => {
    render(<HomeWidgets homeWidgetsSiteConfig={{ homeFeed: { order: 5 } }} />);

    // order 5 < search's default 10 -> homeFeed comes first
    expectDomOrder(['home-feed-widget', 'search-widget']);
  });

  it('isolates a widget render failure: the failing widget shows a fallback, the other 6 still render, render does not throw (Req 1.2)', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    RecentUpdatesWidgetMock.mockImplementation(() => {
      throw new Error('boom: recent updates widget failed');
    });

    expect(() => render(<HomeWidgets />)).not.toThrow();

    expect(
      screen.queryByTestId('recent-updates-widget'),
    ).not.toBeInTheDocument();
    for (const id of ALL_TESTIDS.filter((i) => i !== 'recent-updates-widget')) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    consoleErrorSpy.mockRestore();
  });

  it('renders without crashing when every widget is hidden (Req 7.4)', () => {
    const allHidden = Object.fromEntries(
      ALL_TESTIDS.map((_, i) => [
        [
          'search',
          'recentUpdates',
          'bookmarks',
          'wipPages',
          'classroomPosts',
          'pinnedPages',
          'homeFeed',
        ][i],
        { visible: false },
      ]),
    ) as HomeWidgetPreferences;

    const { container } = render(
      <HomeWidgets userWidgetPreferences={allHidden} />,
    );

    for (const id of ALL_TESTIDS) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(container.querySelector('.grw-home-widgets')).toBeInTheDocument();
  });

  it('wires homeClassroomPathPrefix into ClassroomPostsWidget', () => {
    render(<HomeWidgets homeClassroomPathPrefix="/cr" />);

    expect(ClassroomPostsWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathPrefix: '/cr' }),
    );
  });

  it('wires homePinnedPages into PinnedPagesWidget', () => {
    render(<HomeWidgets homePinnedPages={[{ path: '/x' }]} />);

    expect(PinnedPagesWidgetMock).toHaveBeenCalledWith(
      expect.objectContaining({ pinnedPages: [{ path: '/x' }] }),
    );
  });
});
