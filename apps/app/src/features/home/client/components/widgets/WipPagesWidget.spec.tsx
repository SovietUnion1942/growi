// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import type { IPageForTreeItem } from '~/interfaces/page';

const useSWRxMyWipPagesMock = vi.fn();
vi.mock('~/stores/page-listing', () => ({
  useSWRxMyWipPages: (...args: unknown[]) => useSWRxMyWipPagesMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { WipPagesWidget } from './WipPagesWidget';

const makePage = (path: string, id: string): IPageForTreeItem =>
  ({
    _id: id,
    path,
    parent: null,
    descendantCount: 0,
    grant: 1,
    isEmpty: false,
    wip: true,
  }) as unknown as IPageForTreeItem;

describe('WipPagesWidget', () => {
  beforeEach(() => {
    useSWRxMyWipPagesMock.mockReset();
  });

  it('renders WIP pages returned by the hook', () => {
    const pages = [
      makePage('/wip-one', 'page1'),
      makePage('/wip-two', 'page2'),
    ];
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    render(<WipPagesWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('/wip-one');
    expect(links[1]).toHaveTextContent('/wip-two');
  });

  it('renders a heading identifying the widget', () => {
    useSWRxMyWipPagesMock.mockReturnValue({ data: [] });

    render(<WipPagesWidget />);

    expect(
      screen.getByText('home.widgets.wip_pages_heading'),
    ).toBeInTheDocument();
  });

  it('renders an empty-state message when the hook returns zero WIP pages', () => {
    useSWRxMyWipPagesMock.mockReturnValue({ data: [] });

    render(<WipPagesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('home.widgets.wip_pages_empty'),
    ).toBeInTheDocument();
  });

  it('renders each item as a link that navigates to the correct page path', () => {
    const pages = [makePage('/foo/bar', 'page1')];
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    render(<WipPagesWidget />);

    const link = screen.getByRole('link', { name: /\/foo\/bar/ });
    expect(link).toHaveAttribute('href', '/foo/bar');
  });

  it('does not render anything while the hook has not yet returned (data undefined)', () => {
    useSWRxMyWipPagesMock.mockReturnValue({ data: undefined });

    render(<WipPagesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.queryByText('home.widgets.wip_pages_empty'),
    ).not.toBeInTheDocument();
  });

  it('does not include other users pages -- hook is expected to scope to the caller only', () => {
    // The hook itself (task 5.1, server-scoped via findWipPagesByUser) is the
    // only source of truth for "whose WIP pages" -- the widget renders
    // exactly what the hook returns (minus its own trash-filtering/cap)
    // without any additional user filtering.
    const ownPages = [makePage('/my-wip', 'own-page')];
    useSWRxMyWipPagesMock.mockReturnValue({ data: ownPages });

    render(<WipPagesWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('/my-wip');
  });

  it('excludes trashed pages from the rendered list', () => {
    const pages = [
      makePage('/kept', 'page1'),
      makePage('/trash/deleted-page', 'page2'),
    ];
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    render(<WipPagesWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('/kept');
    expect(screen.queryByText('/trash/deleted-page')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when filtering out trashed pages leaves nothing', () => {
    const pages = [makePage('/trash/deleted-page', 'page1')];
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    render(<WipPagesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('home.widgets.wip_pages_empty'),
    ).toBeInTheDocument();
  });

  it('caps the rendered list at MAX_ITEMS (14) even when the hook returns more', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      makePage(`/page-${i}`, `page${i}`),
    );
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    render(<WipPagesWidget />);

    expect(screen.getAllByRole('link')).toHaveLength(14);
  });

  it('wraps the populated list in a scrollable container sized to show roughly 7 items', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      makePage(`/page-${i}`, `page${i}`),
    );
    useSWRxMyWipPagesMock.mockReturnValue({ data: pages });

    const { container } = render(<WipPagesWidget />);

    const list = container.querySelector('.list-group');
    const scrollWrapper = list?.parentElement;
    expect(scrollWrapper).not.toBeNull();
    expect(scrollWrapper?.style.overflowY).toBe('auto');
    expect(scrollWrapper?.style.maxHeight).not.toBe('');
  });
});
