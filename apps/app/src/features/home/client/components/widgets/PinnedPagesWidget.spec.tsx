// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import type { PinnedPageEntry } from '~/features/home/interfaces/home-widgets';
import type { IPageForTreeItem } from '~/interfaces/page';

const useSWRxResolvePathsMock = vi.fn();
vi.mock('~/stores/page-listing', () => ({
  useSWRxResolvePaths: (...args: unknown[]) => useSWRxResolvePathsMock(...args),
}));

const useIsAdminMock = vi.fn();
vi.mock('~/states/context', () => ({
  useIsAdmin: () => useIsAdminMock(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { PinnedPagesWidget } from './PinnedPagesWidget';

const makePage = (path: string, id: string): IPageForTreeItem =>
  ({
    _id: id,
    path,
  }) as unknown as IPageForTreeItem;

describe('PinnedPagesWidget', () => {
  beforeEach(() => {
    useSWRxResolvePathsMock.mockReset();
    useSWRxResolvePathsMock.mockReturnValue({ data: undefined });
    useIsAdminMock.mockReset();
    useIsAdminMock.mockReturnValue(false);
  });

  it('renders resolved pinned pages as links in the admin-specified order, dropping the forbidden/missing one (AC 3.1, 3.5)', () => {
    const pinnedPages: PinnedPageEntry[] = [
      { path: '/pinned/first' },
      { path: '/pinned/secret' },
      { path: '/pinned/third' },
    ];
    // The hook preserves input order and drops missing/forbidden paths.
    useSWRxResolvePathsMock.mockReturnValue({
      data: [makePage('/pinned/first', 'p1'), makePage('/pinned/third', 'p3')],
    });

    render(<PinnedPagesWidget pinnedPages={pinnedPages} />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('/pinned/first');
    expect(links[1]).toHaveTextContent('/pinned/third');
  });

  it('shows the entry label when set, and the page path when not (AC "表示名")', () => {
    const pinnedPages: PinnedPageEntry[] = [
      { path: '/pinned/first', label: 'はじめに読む' },
      { path: '/pinned/second' },
    ];
    useSWRxResolvePathsMock.mockReturnValue({
      data: [makePage('/pinned/first', 'p1'), makePage('/pinned/second', 'p2')],
    });

    render(<PinnedPagesWidget pinnedPages={pinnedPages} />);

    expect(
      screen.getByRole('link', { name: 'はじめに読む' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: '/pinned/second' }),
    ).toBeInTheDocument();
  });

  it('links each row to the resolved page path (AC 3.3)', () => {
    useSWRxResolvePathsMock.mockReturnValue({
      data: [makePage('/pinned/foo/bar', 'p1')],
    });

    render(
      <PinnedPagesWidget
        pinnedPages={[{ path: '/pinned/foo/bar', label: 'Foo' }]}
      />,
    );

    expect(screen.getByRole('link', { name: 'Foo' })).toHaveAttribute(
      'href',
      '/pinned/foo/bar',
    );
  });

  it('passes the entry paths to the hook in order', () => {
    useSWRxResolvePathsMock.mockReturnValue({ data: [] });

    render(
      <PinnedPagesWidget
        pinnedPages={[{ path: '/a' }, { path: '/b' }, { path: '/c' }]}
      />,
    );

    expect(useSWRxResolvePathsMock.mock.calls[0][0]).toEqual([
      '/a',
      '/b',
      '/c',
    ]);
  });

  it('shows the admin hint and no links when no pinned pages are configured and the viewer is an admin (AC 3.4)', () => {
    useIsAdminMock.mockReturnValue(true);

    render(<PinnedPagesWidget pinnedPages={[]} />);

    expect(
      screen.getByText('home.widgets.pinned_pages_admin_hint'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('renders nothing when no pinned pages are configured and the viewer is not an admin (AC 3.4)', () => {
    useIsAdminMock.mockReturnValue(false);

    const { container } = render(<PinnedPagesWidget pinnedPages={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when no pinned pages are configured and admin status is still undefined (AC 3.4)', () => {
    useIsAdminMock.mockReturnValue(undefined);

    const { container } = render(<PinnedPagesWidget pinnedPages={undefined} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the hook is still resolving (data undefined) - no premature state', () => {
    useSWRxResolvePathsMock.mockReturnValue({ data: undefined });

    const { container } = render(
      <PinnedPagesWidget pinnedPages={[{ path: '/pinned/first' }]} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the empty-state message when every configured path was dropped as forbidden/missing', () => {
    useSWRxResolvePathsMock.mockReturnValue({ data: [] });

    render(<PinnedPagesWidget pinnedPages={[{ path: '/pinned/gone' }]} />);

    expect(
      screen.getByText('home.widgets.pinned_pages_empty'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('renders the widget heading', () => {
    useSWRxResolvePathsMock.mockReturnValue({
      data: [makePage('/pinned/first', 'p1')],
    });

    render(<PinnedPagesWidget pinnedPages={[{ path: '/pinned/first' }]} />);

    expect(
      screen.getByText('home.widgets.pinned_pages_heading'),
    ).toBeInTheDocument();
  });
});
