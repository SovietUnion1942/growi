import type { FC } from 'react';
import Link from 'next/link';

import { useSWRxMyWipPages } from '~/stores/page-listing';

// Hardcoded label: i18n wiring is deferred to the HomeWidgets integration (task 6.1).
const EMPTY_STATE_MESSAGE = 'No work-in-progress pages';

/**
 * Home page widget listing the current user's own work-in-progress (WIP) pages.
 *
 * Reuses the existing `useSWRxMyWipPages` hook, whose server endpoint
 * (`GET /page-listing/my-wip`) already scopes results to the WIP pages
 * last updated by the authenticated caller — no additional client-side
 * filtering is needed here to keep other users' WIP pages out of the list.
 */
export const WipPagesWidget: FC = () => {
  const { data } = useSWRxMyWipPages();

  // `data` is undefined while the request is still loading; render nothing
  // rather than a premature empty-state message.
  if (data == null) {
    return null;
  }

  if (data.length === 0) {
    return (
      <div className="grw-home-wip-pages-widget">
        <p className="text-muted mb-0">{EMPTY_STATE_MESSAGE}</p>
      </div>
    );
  }

  return (
    <div className="grw-home-wip-pages-widget">
      <ul className="list-group list-group-flush">
        {data.map((page) => (
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
