// @vitest-environment happy-dom

import type { IPageHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

const useSWRINFxRecentlyUpdatedMock = vi.fn();
vi.mock('~/stores/page-listing', () => ({
  useSWRINFxRecentlyUpdated: (...args: unknown[]) =>
    useSWRINFxRecentlyUpdatedMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { RecentUpdatesWidget } from './RecentUpdatesWidget';

const makePage = (path: string, id: string): IPageHasId =>
  ({
    _id: id,
    path,
  }) as unknown as IPageHasId;

describe('RecentUpdatesWidget', () => {
  beforeEach(() => {
    useSWRINFxRecentlyUpdatedMock.mockReset();
  });

  it('renders pages returned by the hook, in the order returned', () => {
    const pages = [
      makePage('/newest', 'page1'),
      makePage('/middle', 'page2'),
      makePage('/oldest', 'page3'),
    ];
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages, totalCount: 3, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveTextContent('/newest');
    expect(links[1]).toHaveTextContent('/middle');
    expect(links[2]).toHaveTextContent('/oldest');
  });

  it('renders a heading identifying the widget', () => {
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages: [], totalCount: 0, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    expect(
      screen.getByText('home.widgets.recent_updates_heading'),
    ).toBeInTheDocument();
  });

  it('renders an empty-state message when the hook returns zero pages', () => {
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages: [], totalCount: 0, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('home.widgets.recent_updates_empty'),
    ).toBeInTheDocument();
  });

  it('renders each item as a link that navigates to the correct page path', () => {
    const pages = [makePage('/foo/bar', 'page1')];
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages, totalCount: 1, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    const link = screen.getByRole('link', { name: /\/foo\/bar/ });
    expect(link).toHaveAttribute('href', '/foo/bar');
  });

  it('does not render pages that the hook has not yet returned (data undefined)', () => {
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({ data: undefined });

    render(<RecentUpdatesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('excludes trashed pages from the rendered list', () => {
    const pages = [
      makePage('/kept', 'page1'),
      makePage('/trash/deleted-page', 'page2'),
    ];
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages, totalCount: 2, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('/kept');
    expect(screen.queryByText('/trash/deleted-page')).not.toBeInTheDocument();
  });

  it('shows the empty-state message when filtering out trashed pages leaves nothing', () => {
    const pages = [makePage('/trash/deleted-page', 'page1')];
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages, totalCount: 1, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(
      screen.getByText('home.widgets.recent_updates_empty'),
    ).toBeInTheDocument();
  });

  it('caps the rendered list at MAX_ITEMS (10) even when the hook returns more', () => {
    const pages = Array.from({ length: 15 }, (_, i) =>
      makePage(`/page-${i}`, `page${i}`),
    );
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages, totalCount: 15, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    expect(screen.getAllByRole('link')).toHaveLength(10);
  });
});
