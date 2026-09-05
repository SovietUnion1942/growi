import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useCurrentUser } from '~/states/global';
import { useSWRxUserBookmarks } from '~/stores/bookmark';

// Fixed number of items to show in the widget, matching
// RecentUpdatesWidget's MAX_ITEMS -- an unbounded list looks broken on the
// Home page.
const MAX_ITEMS = 10;

// Trashed pages are excluded from this widget's display: the underlying
// hook is not wrong to return them, but showing a trashed page under
// "bookmarks" reads as a bug to the viewer. This is a presentational
// decision local to this widget, not a data-source change.
const isTrashedPath = (path: string): boolean =>
  path === '/trash' || path.startsWith('/trash/');

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
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const { data } = useSWRxUserBookmarks(currentUser?._id ?? null);

  // `data` is undefined while the request is still loading (or there is no
  // current user yet); render nothing rather than a premature empty-state.
  if (data == null) {
    return null;
  }

  // A bookmarked page can be null if the underlying page has been deleted.
  const pages = data
    .filter((page) => page != null)
    .filter((page) => !isTrashedPath(page.path))
    .slice(0, MAX_ITEMS);

  return (
    <div className="grw-home-bookmarks-widget card h-100">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">
          {t('home.widgets.bookmarks_heading')}
        </h3>
        {pages.length === 0 ? (
          <p className="text-muted mb-0">{t('home.widgets.bookmarks_empty')}</p>
        ) : (
          <ul className="list-group list-group-flush">
            {pages.map((page) => (
              <li key={page._id} className="list-group-item">
                <Link href={page.path} prefetch={false}>
                  {page.path}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
