import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import type { PinnedPageEntry } from '~/features/home/interfaces/home-widgets';
import { useIsAdmin } from '~/states/context';
import { useSWRxResolvePaths } from '~/stores/page-listing';

// Fixed presentational cap, matching the other Home widgets
// (RecentUpdatesWidget / ClassroomPostsWidget). Pinned lists are short by
// nature, but keeping the cap + scroll wrapper in parity guards against an
// over-long admin config breaking the Home layout.
const MAX_ITEMS = 14;

// Same ~7-row visible height as the sibling widgets so the card stays compact
// while the full list remains scroll-accessible.
const LIST_MAX_HEIGHT = '17.5rem';

type Props = {
  // Site-wide pinned-page list (admin `customize:homePinnedPages`), in the
  // admin-specified order. The real wiring is done in the integration phase
  // (task 4.1); until then this is passed explicitly.
  pinnedPages?: PinnedPageEntry[];
};

/**
 * Home page widget listing the admin-maintained "pinned pages".
 *
 * The server behind `useSWRxResolvePaths` (`POST /page-listing/resolve-paths`,
 * service/api task 2.1) already does the resolution this widget needs:
 *  - returns the pages in the SAME order as the input paths (admin order),
 *  - drops paths that do not exist or that the viewer cannot read (AC 3.5).
 * So there is deliberately NO client-side re-sort or permission re-filter
 * here. This widget only adds the display-name rule and the empty-state /
 * admin-hint rendering rules:
 *  - display name = `entry.label` if set, else the page path (there is no
 *    reliable `title` on `IPageForTreeItem`; the path stands in for the
 *    title, matching how every other Home widget labels its rows),
 *  - no pinned pages configured at all (AC 3.4): show a setup hint to admins
 *    only, and render nothing (`return null`, which `HomeWidgets` tolerates)
 *    for everyone else,
 *  - configured but every path resolved away: show an empty-state message.
 */
export const PinnedPagesWidget: FC<Props> = ({ pinnedPages }) => {
  const { t } = useTranslation();

  const entries = pinnedPages ?? [];
  const isAdmin = useIsAdmin();

  const paths = entries.map((e) => e.path);
  const { data: resolved } = useSWRxResolvePaths(
    paths.length > 0 ? paths : null,
  );

  // AC 3.4: nothing configured. Admins get a setup hint; everyone else gets
  // no widget at all.
  if (entries.length === 0) {
    if (isAdmin !== true) {
      return null;
    }
    return (
      <div className="grw-home-pinned-pages-widget card">
        <div className="card-body">
          <h3 className="fs-6 fw-bold mb-2">
            {t('home.widgets.pinned_pages_heading')}
          </h3>
          <div className="alert alert-light border mb-0 small">
            {t('home.widgets.pinned_pages_admin_hint')}
          </div>
        </div>
      </div>
    );
  }

  // `resolved` is undefined while the request is in flight; render nothing
  // rather than flashing a premature empty-state.
  if (resolved == null) {
    return null;
  }

  // `resolved` is already in admin order and already permission-filtered.
  // Attach each entry's optional label by path.
  const labelByPath = new Map(entries.map((e) => [e.path, e.label]));
  const rows = resolved.slice(0, MAX_ITEMS).map((page) => ({
    _id: page._id,
    path: page.path,
    displayName: labelByPath.get(page.path) ?? page.path,
  }));

  return (
    <div className="grw-home-pinned-pages-widget card">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">
          {t('home.widgets.pinned_pages_heading')}
        </h3>
        {rows.length === 0 ? (
          <p className="text-muted mb-0">
            {t('home.widgets.pinned_pages_empty')}
          </p>
        ) : (
          <div style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
            <ul className="list-group list-group-flush">
              {rows.map((row) => (
                <li key={row._id} className="list-group-item">
                  <Link href={row.path} prefetch={false}>
                    {row.displayName}
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
