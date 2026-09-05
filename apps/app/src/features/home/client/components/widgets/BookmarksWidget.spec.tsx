// @vitest-environment happy-dom

import type { IPageHasId } from '@growi/core';
import { render, screen } from '@testing-library/react';

const useCurrentUserMock = vi.fn();
vi.mock('~/states/global', () => ({
  useCurrentUser: (...args: unknown[]) => useCurrentUserMock(...args),
}));

const useSWRxUserBookmarksMock = vi.fn();
vi.mock('~/stores/bookmark', () => ({
  useSWRxUserBookmarks: (...args: unknown[]) =>
    useSWRxUserBookmarksMock(...args),
}));

import { BookmarksWidget } from './BookmarksWidget';

const makePage = (path: string, id: string): IPageHasId =>
  ({
    _id: id,
    path,
  }) as unknown as IPageHasId;

describe('BookmarksWidget', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
    useSWRxUserBookmarksMock.mockReset();
    useCurrentUserMock.mockReturnValue({ _id: 'currentUserId' });
    useSWRxUserBookmarksMock.mockReturnValue({ data: undefined });
  });

  it('renders bookmarked pages returned by the hook', () => {
    const pages = [
      makePage('/bookmark-one', 'page1'),
      makePage('/bookmark-two', 'page2'),
    ];
    useSWRxUserBookmarksMock.mockReturnValue({ data: pages });

    render(<BookmarksWidget />);

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveTextContent('/bookmark-one');
    expect(links[1]).toHaveTextContent('/bookmark-two');
  });

  it('renders an empty-state message when the hook returns zero bookmarks', () => {
    useSWRxUserBookmarksMock.mockReturnValue({ data: [] });

    render(<BookmarksWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/no bookmarked pages/i)).toBeInTheDocument();
  });

  it('renders an empty-state message when all bookmarked pages are null (deleted)', () => {
    useSWRxUserBookmarksMock.mockReturnValue({ data: [null, null] });

    render(<BookmarksWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/no bookmarked pages/i)).toBeInTheDocument();
  });

  it('renders each item as a link that navigates to the correct page path', () => {
    const pages = [makePage('/foo/bar', 'page1')];
    useSWRxUserBookmarksMock.mockReturnValue({ data: pages });

    render(<BookmarksWidget />);

    const link = screen.getByRole('link', { name: /\/foo\/bar/ });
    expect(link).toHaveAttribute('href', '/foo/bar');
  });

  it('does not render anything while the hook has not yet returned (data undefined)', () => {
    useSWRxUserBookmarksMock.mockReturnValue({ data: undefined });

    render(<BookmarksWidget />);

    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByText(/no bookmarked pages/i)).not.toBeInTheDocument();
  });

  it('calls the hook with the current user id, not an arbitrary or hardcoded one', () => {
    useCurrentUserMock.mockReturnValue({ _id: 'the-actual-current-user-id' });
    useSWRxUserBookmarksMock.mockReturnValue({ data: [] });

    render(<BookmarksWidget />);

    expect(useSWRxUserBookmarksMock).toHaveBeenCalledWith(
      'the-actual-current-user-id',
    );
  });

  it('calls the hook with null when there is no current user', () => {
    useCurrentUserMock.mockReturnValue(undefined);
    useSWRxUserBookmarksMock.mockReturnValue({ data: undefined });

    render(<BookmarksWidget />);

    expect(useSWRxUserBookmarksMock).toHaveBeenCalledWith(null);
  });
});
