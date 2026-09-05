import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useSWRINFxRecentlyUpdated } from '~/stores/page-listing';

// Fixed number of items to show in the widget. Unlike the sidebar Recent
// Changes panel, this widget does not offer infinite scroll (task 4.2 design
// constraint) — only the hook's first batch is consumed, sliced down to a
// smaller, widget-appropriate count.
const MAX_ITEMS = 14;

// Bootstrap's default .list-group-item is padding: 0.5rem 1rem with ~1.5rem
// line-height text, so each row is roughly 2.5rem tall. Capping the visible
// height to ~7 rows (17.5rem) keeps the card compact while still allowing
// scroll access to the full MAX_ITEMS list.
const LIST_MAX_HEIGHT = '17.5rem';

// Trashed pages are excluded from this widget's display: the underlying
// hook is not wrong to return them, but showing a trashed page under
// "recently updated" reads as a bug to the viewer. This is a presentational
// decision local to this widget, not a data-source change.
const isTrashedPath = (path: string): boolean =>
  path === '/trash' || path.startsWith('/trash/');

/**
 * Home page widget listing the most recently updated pages.
 *
 * Reuses the existing `useSWRINFxRecentlyUpdated` hook (same data source as
 * the sidebar Recent Changes panel), which already filters out pages the
 * current viewer has no permission to see and returns pages newest-updated
 * first — no re-fetching or re-sorting is done here.
 */
export const RecentUpdatesWidget: FC = () => {
  const { t } = useTranslation();
  const { data } = useSWRINFxRecentlyUpdated();

  // `data` is undefined while the first page is still loading; render
  // nothing rather than a premature empty-state message.
  if (data == null) {
    return null;
  }

  const pages = (data[0]?.pages ?? [])
    .filter((page) => !isTrashedPath(page.path))
    .slice(0, MAX_ITEMS);

  return (
    <div className="grw-home-recent-updates-widget card">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">
          {t('home.widgets.recent_updates_heading')}
        </h3>
        {pages.length === 0 ? (
          <p className="text-muted mb-0">
            {t('home.widgets.recent_updates_empty')}
          </p>
        ) : (
          <div style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
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
        )}
      </div>
    </div>
  );
};
