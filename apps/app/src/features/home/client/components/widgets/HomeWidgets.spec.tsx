// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

const SearchWidgetMock = vi.fn(() => <div data-testid="search-widget" />);
const RecentUpdatesWidgetMock = vi.fn(() => (
  <div data-testid="recent-updates-widget" />
));
const BookmarksWidgetMock = vi.fn(() => <div data-testid="bookmarks-widget" />);
const WipPagesWidgetMock = vi.fn(() => <div data-testid="wip-pages-widget" />);

vi.mock('./SearchWidget', () => ({
  SearchWidget: () => SearchWidgetMock(),
}));
vi.mock('./RecentUpdatesWidget', () => ({
  RecentUpdatesWidget: () => RecentUpdatesWidgetMock(),
}));
vi.mock('./BookmarksWidget', () => ({
  BookmarksWidget: () => BookmarksWidgetMock(),
}));
vi.mock('./WipPagesWidget', () => ({
  WipPagesWidget: () => WipPagesWidgetMock(),
}));

import { HomeWidgets } from './HomeWidgets';

describe('HomeWidgets', () => {
  beforeEach(() => {
    SearchWidgetMock.mockReset().mockImplementation(() => (
      <div data-testid="search-widget" />
    ));
    RecentUpdatesWidgetMock.mockReset().mockImplementation(() => (
      <div data-testid="recent-updates-widget" />
    ));
    BookmarksWidgetMock.mockReset().mockImplementation(() => (
      <div data-testid="bookmarks-widget" />
    ));
    WipPagesWidgetMock.mockReset().mockImplementation(() => (
      <div data-testid="wip-pages-widget" />
    ));
  });

  it('renders all 4 widgets in the fixed order: search, recent updates, bookmarks, wip pages', () => {
    render(<HomeWidgets />);

    const testIds = [
      'search-widget',
      'recent-updates-widget',
      'bookmarks-widget',
      'wip-pages-widget',
    ];
    for (const id of testIds) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }

    // Assert relative DOM order via compareDocumentPosition rather than
    // relying on any particular container structure.
    const elements = testIds.map((id) => screen.getByTestId(id));
    for (let i = 0; i < elements.length - 1; i += 1) {
      const position = elements[i].compareDocumentPosition(elements[i + 1]);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('isolates a widget render failure: the failing widget shows a fallback while the other 3 widgets and the page still render', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    RecentUpdatesWidgetMock.mockImplementation(() => {
      throw new Error('boom: recent updates widget failed');
    });

    render(<HomeWidgets />);

    // The failing widget's own content is not shown...
    expect(
      screen.queryByTestId('recent-updates-widget'),
    ).not.toBeInTheDocument();
    // ...but the other 3 widgets render completely normally.
    expect(screen.getByTestId('search-widget')).toBeInTheDocument();
    expect(screen.getByTestId('bookmarks-widget')).toBeInTheDocument();
    expect(screen.getByTestId('wip-pages-widget')).toBeInTheDocument();

    // An error fallback is shown, scoped to that widget's slot only.
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    consoleErrorSpy.mockRestore();
  });

  it('isolates a different widget failure (bookmarks) independently of which widget throws', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    BookmarksWidgetMock.mockImplementation(() => {
      throw new Error('boom: bookmarks widget failed');
    });

    render(<HomeWidgets />);

    expect(screen.queryByTestId('bookmarks-widget')).not.toBeInTheDocument();
    expect(screen.getByTestId('search-widget')).toBeInTheDocument();
    expect(screen.getByTestId('recent-updates-widget')).toBeInTheDocument();
    expect(screen.getByTestId('wip-pages-widget')).toBeInTheDocument();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    consoleErrorSpy.mockRestore();
  });

  it('does not crash the whole page when a widget fails: HomeWidgets itself still renders its container', () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    WipPagesWidgetMock.mockImplementation(() => {
      throw new Error('boom: wip pages widget failed');
    });

    expect(() => render(<HomeWidgets />)).not.toThrow();

    consoleErrorSpy.mockRestore();
  });
});
