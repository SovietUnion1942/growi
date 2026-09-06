import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';
import {
  CLUB_EVENTS_PAGE_PATH,
  type ClubEvent,
  parseClubEvents,
} from '~/features/home/utils/parse-club-events';
import { toPathMdUrl } from '~/features/page-markdown';
import { useCurrentUser } from '~/states/global';

export { CLUB_EVENTS_PAGE_PATH } from '~/features/home/utils/parse-club-events';

/** A club event to show in the home feed. Alias of the shared `ClubEvent`. */
export type UpcomingClubEvent = ClubEvent;

/** Default number of upcoming events surfaced by the widget. */
const DEFAULT_UPCOMING_EVENTS_LIMIT = 5;

/** Midnight (local) of the given instant, as a fresh Date. */
const startOfDay = (instant: Date): Date => {
  const d = new Date(instant);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Keep only events happening today or later, ordered by date ascending, capped
 * at `limit`. Pure V8 string/date work on already-parsed events.
 */
const toUpcoming = (
  events: ClubEvent[],
  limit: number,
): UpcomingClubEvent[] => {
  const today = startOfDay(new Date());
  return events
    .filter((e) => new Date(`${e.date}T00:00:00`) >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
};

/**
 * Upcoming club events for the home feed.
 *
 * Source: the raw ".md" of the club events page
 * (`toPathMdUrl(CLUB_EVENTS_PAGE_PATH)`, `Content-Type: text/markdown`), fetched
 * with the global `fetch` since it is a page-path route, not `/_api/v3/*`.
 * Parsing: the shared `parseClubEvents`, the single source also used by the
 * server-side attendance reminder.
 * Ordering: date ascending, today-or-later only ("今後の"); no time-window cap.
 * A missing or forbidden page (any non-2xx response) yields `[]` so the widget
 * shows its empty state rather than an error.
 * Login-gated for consistency with the other login-only `/home` widgets.
 */
export const useSWRxUpcomingClubEvents = (
  limit?: number,
  config?: SWRConfiguration<UpcomingClubEvent[], Error>,
): SWRResponse<UpcomingClubEvent[], Error> => {
  const currentUser = useCurrentUser();
  const effectiveLimit = limit ?? DEFAULT_UPCOMING_EVENTS_LIMIT;

  return useSWR(
    currentUser != null
      ? ['home-feed:upcoming-club-events', effectiveLimit]
      : null,
    async () => {
      const res = await fetch(toPathMdUrl(CLUB_EVENTS_PAGE_PATH), {
        headers: { Accept: 'text/markdown' },
      });
      if (!res.ok) return [];
      const body = await res.text();
      return toUpcoming(parseClubEvents(body), effectiveLimit);
    },
    config,
  );
};

/**
 * Whether the current user has answered this month's attendance check.
 * `GET /_api/v3/personal-setting/attendance-status` → `{ answered: boolean }`
 * (`loginRequiredStrictly`); the hook stays idle until a user is present.
 * `answered: false` → the feed shows the passive "未回答" reminder line.
 */
export const useSWRxAttendanceStatus = (
  config?: SWRConfiguration<{ answered: boolean }, Error>,
): SWRResponse<{ answered: boolean }, Error> => {
  const currentUser = useCurrentUser();

  return useSWR(
    currentUser != null ? '/personal-setting/attendance-status' : null,
    (endpoint) => apiv3Get<{ answered: boolean }>(endpoint).then((r) => r.data),
    config,
  );
};
