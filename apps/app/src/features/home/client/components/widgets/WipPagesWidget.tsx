import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { useSWRxMyWipPages } from '~/stores/page-listing';

// Fixed number of items to show in the widget, matching
// RecentUpdatesWidget's MAX_ITEMS -- an unbounded list looks broken on the
// Home page.
const MAX_ITEMS = 10;

// Trashed pages are excluded from this widget's display: the underlying
// hook is not wrong to return them, but showing a trashed page under
// "work in progress" reads as a bug to the viewer. This is a presentational
// decision local to this widget, not a data-source change.
const isTrashedPath = (path: string): boolean =>
  path === '/trash' || path.startsWith('/trash/');

/**
 * Home page widget listing the current user's own work-in-progress (WIP) pages.
 *
 * Reuses the existing `useSWRxMyWipPages` hook, whose server endpoint
 * (`GET /page-listing/my-wip`) already scopes results to the WIP pages
 * last updated by the authenticated caller — no additional client-side
 * filtering is needed here to keep other users' WIP pages out of the list.
 */
export const WipPagesWidget: FC = () => {
  const { t } = useTranslation();
  const { data } = useSWRxMyWipPages();

  // `data` is undefined while the request is still loading; render nothing
  // rather than a premature empty-state message.
  if (data == null) {
    return null;
  }

  const pages = data
    .filter((page) => !isTrashedPath(page.path))
    .slice(0, MAX_ITEMS);

  return (
    <div className="grw-home-wip-pages-widget card h-100">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">
          {t('home.widgets.wip_pages_heading')}
        </h3>
        {pages.length === 0 ? (
          <p className="text-muted mb-0">{t('home.widgets.wip_pages_empty')}</p>
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
