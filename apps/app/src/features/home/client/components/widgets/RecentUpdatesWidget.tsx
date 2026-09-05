import type { FC } from 'react';
import Link from 'next/link';

import { useSWRINFxRecentlyUpdated } from '~/stores/page-listing';

// Hardcoded label: i18n wiring is deferred to the HomeWidgets integration (task 6.1).
const EMPTY_STATE_MESSAGE = 'No recently updated pages';

// Fixed number of items to show in the widget. Unlike the sidebar Recent
// Changes panel, this widget does not offer infinite scroll (task 4.2 design
// constraint) — only the hook's first batch is consumed, sliced down to a
// smaller, widget-appropriate count.
const MAX_ITEMS = 10;

/**
 * Home page widget listing the most recently updated pages.
 *
 * Reuses the existing `useSWRINFxRecentlyUpdated` hook (same data source as
 * the sidebar Recent Changes panel), which already filters out pages the
 * current viewer has no permission to see and returns pages newest-updated
 * first — no re-fetching or re-sorting is done here.
 */
export const RecentUpdatesWidget: FC = () => {
  const { data } = useSWRINFxRecentlyUpdated();

  // `data` is undefined while the first page is still loading; render
  // nothing rather than a premature empty-state message.
  if (data == null) {
    return null;
  }

  const pages = (data[0]?.pages ?? []).slice(0, MAX_ITEMS);

  if (pages.length === 0) {
    return (
      <div className="grw-home-recent-updates-widget">
        <p className="text-muted mb-0">{EMPTY_STATE_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="grw-home-recent-updates-widget">
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
