// @vitest-environment happy-dom

import type { IPageHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

const useSWRINFxRecentlyUpdatedMock = vi.fn();
vi.mock('~/stores/page-listing', () => ({
  useSWRINFxRecentlyUpdated: (...args: unknown[]) =>
    useSWRINFxRecentlyUpdatedMock(...args),
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

  it('renders an empty-state message when the hook returns zero pages', () => {
    useSWRINFxRecentlyUpdatedMock.mockReturnValue({
      data: [{ pages: [], totalCount: 0, offset: 0 }],
    });

    render(<RecentUpdatesWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/no recently updated pages/i)).toBeInTheDocument();
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
});
