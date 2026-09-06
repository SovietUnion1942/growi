import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import { DEFAULT_HOME_CLASSROOM_PATH_PREFIX } from '~/features/home/consts';
import { useSWRxRecentPagesUnderPath } from '~/stores/page-listing';

// Fixed number of items to show, matching the other Home widgets
// (RecentUpdatesWidget / WipPagesWidget) -- an unbounded list looks broken
// on the Home page. The server endpoint also applies its own `limit`; this
// is a defensive presentational cap.
const MAX_ITEMS = 14;

// Same ~7-row visible height as the sibling widgets (each Bootstrap
// .list-group-item is roughly 2.5rem tall) so the card stays compact while
// the full list remains scroll-accessible.
const LIST_MAX_HEIGHT = '17.5rem';

type Props = {
  // Site-wide Classroom source path prefix (admin `customize:homeClassroomPathPrefix`).
  // The real wiring is done in the integration phase (task 4.1); until then
  // this is passed explicitly. Nullish -> fall back to the default prefix.
  pathPrefix?: string | null;
};

/**
 * Home page widget listing the most recently updated Classroom-origin pages
 * (posts synced into the wiki by the external Classroom agent).
 *
 * The server endpoint behind `useSWRxRecentPagesUnderPath`
 * (`GET /page-listing/recent-under-path`, service task 1.5 / api task 2.1)
 * already does all the scoping this widget needs:
 *  - filters to pages the authenticated viewer may read (Requirement 2.2),
 *  - orders by `updatedAt` descending (Requirement 2.1),
 *  - excludes trash and empty pages, and applies `limit`.
 * So there is deliberately NO client-side re-sort or permission re-filter
 * here -- the widget renders the already-scoped list verbatim. AC 2.2 is
 * covered by that endpoint's integration tests.
 */
export const ClassroomPostsWidget: FC<Props> = ({ pathPrefix }) => {
  const { t } = useTranslation();

  // AC 2.5: use the admin-configured source path, or the default when unset.
  const prefix = pathPrefix ?? DEFAULT_HOME_CLASSROOM_PATH_PREFIX;

  const { data } = useSWRxRecentPagesUnderPath(prefix, MAX_ITEMS);

  // `data` is undefined while loading; render nothing rather than flashing a
  // premature empty-state message.
  if (data == null) {
    return null;
  }

  const pages = data.slice(0, MAX_ITEMS);

  return (
    <div className="grw-home-classroom-posts-widget card">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">
          {t('home.widgets.classroom_posts_heading')}
        </h3>
        {pages.length === 0 ? (
          <p className="text-muted mb-0">
            {t('home.widgets.classroom_posts_empty')}
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
