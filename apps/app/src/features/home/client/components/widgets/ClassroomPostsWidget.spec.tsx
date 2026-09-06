// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

import type { IPageForTreeItem } from '~/interfaces/page';

const useSWRxRecentPagesUnderPathMock = vi.fn();
vi.mock('~/stores/page-listing', () => ({
  useSWRxRecentPagesUnderPath: (...args: unknown[]) =>
    useSWRxRecentPagesUnderPathMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { DEFAULT_HOME_CLASSROOM_PATH_PREFIX } from '~/features/home/consts';

import { ClassroomPostsWidget } from './ClassroomPostsWidget';

const makePage = (path: string, id: string): IPageForTreeItem =>
  ({
    _id: id,
    path,
  }) as unknown as IPageForTreeItem;

describe('ClassroomPostsWidget', () => {
  beforeEach(() => {
    useSWRxRecentPagesUnderPathMock.mockReset();
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: undefined });
  });

  it('renders pages returned by the hook as links, in the order returned (AC 2.1)', () => {
    // AC 2.1 ordering (updatedAt desc) is the server endpoint's responsibility;
    // the widget just renders the list in the order it receives.
    const pages = [
      makePage('/classroom/newest', 'p1'),
      makePage('/classroom/middle', 'p2'),
      makePage('/classroom/oldest', 'p3'),
    ];
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: pages });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('/classroom/newest');
    expect(links[1]).toHaveTextContent('/classroom/middle');
    expect(links[2]).toHaveTextContent('/classroom/oldest');
  });

  it('renders each item as a link that navigates to the page path (AC 2.3)', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({
      data: [makePage('/classroom/foo/bar', 'p1')],
    });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    const link = screen.getByRole('link', { name: /\/classroom\/foo\/bar/ });
    expect(link).toHaveAttribute('href', '/classroom/foo/bar');
  });

  it('renders the widget heading', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: [] });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    expect(
      screen.getByText('home.widgets.classroom_posts_heading'),
    ).toBeInTheDocument();
  });

  it('shows the empty-state message and no links when the hook returns zero pages (AC 2.4)', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: [] });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('home.widgets.classroom_posts_empty'),
    ).toBeInTheDocument();
  });

  it('renders nothing while the hook is still loading (data undefined) - no premature empty state', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: undefined });

    const { container } = render(
      <ClassroomPostsWidget pathPrefix="/classroom" />,
    );

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.queryByText('home.widgets.classroom_posts_empty'),
    ).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('passes the pathPrefix prop through to the hook as the first argument (AC 2.5)', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: [] });

    render(<ClassroomPostsWidget pathPrefix="/custom/classroom" />);

    expect(useSWRxRecentPagesUnderPathMock).toHaveBeenCalled();
    expect(useSWRxRecentPagesUnderPathMock.mock.calls[0][0]).toBe(
      '/custom/classroom',
    );
  });

  it('falls back to DEFAULT_HOME_CLASSROOM_PATH_PREFIX when pathPrefix is nullish (AC 2.5)', () => {
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: [] });

    render(<ClassroomPostsWidget pathPrefix={null} />);
    expect(useSWRxRecentPagesUnderPathMock.mock.calls[0][0]).toBe(
      DEFAULT_HOME_CLASSROOM_PATH_PREFIX,
    );

    useSWRxRecentPagesUnderPathMock.mockClear();

    render(<ClassroomPostsWidget />);
    expect(useSWRxRecentPagesUnderPathMock.mock.calls[0][0]).toBe(
      DEFAULT_HOME_CLASSROOM_PATH_PREFIX,
    );
  });

  it('renders whatever the hook returns without a client-side permission re-filter (AC 2.2)', () => {
    // AC 2.2 (viewer-permission scoping) is enforced by the server endpoint
    // (service task 1.5 / api task 2.1) and covered by its integration tests.
    // The widget must NOT re-implement permission filtering; it renders the
    // already-scoped list verbatim.
    const pages = [
      makePage('/classroom/a', 'p1'),
      makePage('/classroom/b', 'p2'),
    ];
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: pages });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    expect(screen.getAllByRole('link')).toHaveLength(2);
  });

  it('caps the rendered list at MAX_ITEMS (14) even when the hook returns more', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      makePage(`/classroom/page-${i}`, `p${i}`),
    );
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: pages });

    render(<ClassroomPostsWidget pathPrefix="/classroom" />);

    expect(screen.getAllByRole('link')).toHaveLength(14);
  });

  it('wraps the populated list in a scrollable container', () => {
    const pages = Array.from({ length: 20 }, (_, i) =>
      makePage(`/classroom/page-${i}`, `p${i}`),
    );
    useSWRxRecentPagesUnderPathMock.mockReturnValue({ data: pages });

    const { container } = render(
      <ClassroomPostsWidget pathPrefix="/classroom" />,
    );

    const list = container.querySelector('.list-group');
    const scrollWrapper = list?.parentElement;
    expect(scrollWrapper).not.toBeNull();
    expect(scrollWrapper?.style.overflowY).toBe('auto');
    expect(scrollWrapper?.style.maxHeight).not.toBe('');
  });
});
