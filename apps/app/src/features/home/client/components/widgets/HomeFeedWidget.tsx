import type { FC } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

import InAppNotificationElm from '~/client/components/InAppNotification/InAppNotificationElm';
import { ATTENDANCE_PAGE_PATH } from '~/stores/attendance-status';
import {
  CLUB_EVENTS_PAGE_PATH,
  useSWRxAttendanceStatus,
  useSWRxUpcomingClubEvents,
} from '~/stores/home-feed';
import { useSWRxInAppNotifications } from '~/stores/in-app-notification';

// Presentational caps. Kept small so the feed stays a glanceable summary.
const FEED_EVENTS_LIMIT = 5;
const FEED_NOTIFICATION_LIMIT = 5;
// ~7-row visible height, parity with the sibling Home widgets.
const LIST_MAX_HEIGHT = '17.5rem';

/**
 * Home feed widget: 3 independent SWR-backed sections in one card
 * ("今後のイベント" / "未回答の出欠確認" / "直近の通知").
 *
 * - Per-section failure isolation: each section branches on its own hook's
 *   `error` value and renders nothing when it is set, so one failed fetch
 *   never hides the other sections. Separate SWR keys mean a fetch failure
 *   surfaces as an `error` value, not a throw, so no try/catch or error
 *   boundary is needed inside this widget.
 * - The attendance line is a passive one-line reminder only. It never touches
 *   `AttendanceReminderModal`'s suppression logic; it just reads `answered`.
 * - Notification rows reuse `InAppNotificationElm`, which owns its own
 *   click/navigate behaviour (`useModelNotification`).
 * - Loading: while all three hooks are still unresolved (and no errors),
 *   render nothing rather than flashing the empty state. Once anything has
 *   resolved, render whatever is available; if nothing is showable, render
 *   the whole-widget empty state (AC 4.5).
 */
export const HomeFeedWidget: FC = () => {
  const { t } = useTranslation();

  const { data: events, error: eventsError } =
    useSWRxUpcomingClubEvents(FEED_EVENTS_LIMIT);
  const { data: attendance, error: attendanceError } =
    useSWRxAttendanceStatus();
  const { data: notif, error: notifError } = useSWRxInAppNotifications(
    FEED_NOTIFICATION_LIMIT,
  );

  const showEvents = eventsError == null && events != null && events.length > 0;
  const showAttendance =
    attendanceError == null && attendance?.answered === false;
  const notifDocs = notifError == null ? (notif?.docs ?? []) : [];
  const showNotifications = notifDocs.length > 0;

  const stillLoading =
    events === undefined &&
    eventsError == null &&
    attendance === undefined &&
    attendanceError == null &&
    notif === undefined &&
    notifError == null;

  if (stillLoading) {
    return null;
  }

  const hasAnything = showEvents || showAttendance || showNotifications;

  return (
    <div className="grw-home-feed-widget card">
      <div className="card-body">
        <h3 className="fs-6 fw-bold mb-2">{t('home.widgets.feed_heading')}</h3>

        {showEvents && (
          <section className="mb-3">
            <h4 className="fs-6 text-muted mb-1">
              {t('home.widgets.feed_events_heading')}
            </h4>
            <div style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
              <ul className="list-group list-group-flush">
                {events.map((event) => (
                  <li
                    key={`${event.date}:${event.title}`}
                    className="list-group-item"
                  >
                    <Link href={CLUB_EVENTS_PAGE_PATH} prefetch={false}>
                      {`${event.date} ${event.title}`}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        {showAttendance && (
          <div className="small text-muted mb-3">
            <Link href={ATTENDANCE_PAGE_PATH} prefetch={false}>
              {t('home.widgets.feed_attendance_reminder')}
            </Link>
          </div>
        )}

        {showNotifications && (
          <section>
            <h4 className="fs-6 text-muted mb-1">
              {t('home.widgets.feed_notifications_heading')}
            </h4>
            <div style={{ maxHeight: LIST_MAX_HEIGHT, overflowY: 'auto' }}>
              {notifDocs.map((n) => (
                <InAppNotificationElm key={n._id} notification={n} />
              ))}
            </div>
          </section>
        )}

        {!hasAnything && (
          <p className="text-muted mb-0">{t('home.widgets.feed_empty')}</p>
        )}
      </div>
    </div>
  );
};
