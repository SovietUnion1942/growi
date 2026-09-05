import type { FC } from 'react';
import Link from 'next/link';

import { useCurrentUser } from '~/states/global';
import { useSWRxUserBookmarks } from '~/stores/bookmark';

// Hardcoded label: i18n wiring is deferred to the HomeWidgets integration (task 6.1).
const EMPTY_STATE_MESSAGE = 'No bookmarked pages';

/**
 * Home page widget listing the current user's bookmarked pages.
 *
 * Reuses the existing `useSWRxUserBookmarks` hook (same data source as the
 * user's bookmark list page), called with the current viewer's own user id —
 * the server endpoint (`GET /bookmarks/:userId`) already scopes results to
 * that exact user, so no additional client-side filtering is needed here to
 * keep other users' bookmarks out of the list.
 */
export const BookmarksWidget: FC = () => {
  const currentUser = useCurrentUser();
  const { data } = useSWRxUserBookmarks(currentUser?._id ?? null);

  // `data` is undefined while the request is still loading (or there is no
  // current user yet); render nothing rather than a premature empty-state.
  if (data == null) {
    return null;
  }

  // A bookmarked page can be null if the underlying page has been deleted.
  const pages = data.filter((page) => page != null);

  if (pages.length === 0) {
    return (
      <div className="grw-home-bookmarks-widget">
        <p className="text-muted mb-0">{EMPTY_STATE_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="grw-home-bookmarks-widget">
      <ul className="list-group list-group-flush">
        {pages.map((page) => (
          <li key={page._id} className="list-group-item">
            <Link href={page.path} prefetch={false}>
              {page.path}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};
