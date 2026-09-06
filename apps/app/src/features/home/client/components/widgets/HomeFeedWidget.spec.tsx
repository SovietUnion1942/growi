// @vitest-environment happy-dom

import { render, screen } from '@testing-library/react';

const useSWRxUpcomingClubEventsMock = vi.fn();
const useSWRxAttendanceStatusMock = vi.fn();
const useSWRxInAppNotificationsMock = vi.fn();

vi.mock('~/stores/home-feed', () => ({
  useSWRxUpcomingClubEvents: (...args: unknown[]) =>
    useSWRxUpcomingClubEventsMock(...args),
  useSWRxAttendanceStatus: (...args: unknown[]) =>
    useSWRxAttendanceStatusMock(...args),
  CLUB_EVENTS_PAGE_PATH: '/club-events-page',
}));

vi.mock('~/stores/attendance-status', () => ({
  ATTENDANCE_PAGE_PATH: '/attendance-page',
}));

vi.mock('~/stores/in-app-notification', () => ({
  useSWRxInAppNotifications: (...args: unknown[]) =>
    useSWRxInAppNotificationsMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('~/client/components/InAppNotification/InAppNotificationElm', () => ({
  default: ({ notification }: { notification: { _id: string } }) => (
    <div data-testid="notif">{notification._id}</div>
  ),
}));

import { HomeFeedWidget } from './HomeFeedWidget';

const loading = { data: undefined, error: undefined };

const notifPage = (ids: string[]) => ({
  data: { docs: ids.map((_id) => ({ _id })) },
  error: undefined,
});

beforeEach(() => {
  useSWRxUpcomingClubEventsMock.mockReset().mockReturnValue(loading);
  useSWRxAttendanceStatusMock.mockReset().mockReturnValue(loading);
  useSWRxInAppNotificationsMock.mockReset().mockReturnValue(loading);
});

describe('HomeFeedWidget', () => {
  it('renders all three sections when every hook returns data (AC 4.1/4.2/4.3)', () => {
    useSWRxUpcomingClubEventsMock.mockReturnValue({
      data: [
        { date: '2026-09-10', title: 'Event A' },
        { date: '2026-09-20', title: 'Event B' },
      ],
      error: undefined,
    });
    useSWRxAttendanceStatusMock.mockReturnValue({
      data: { answered: false },
      error: undefined,
    });
    useSWRxInAppNotificationsMock.mockReturnValue(notifPage(['n1', 'n2']));

    render(<HomeFeedWidget />);

    expect(screen.getByText('home.widgets.feed_heading')).toBeInTheDocument();
    expect(
      screen.getByText('home.widgets.feed_events_heading'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Event A/)).toBeInTheDocument();
    expect(screen.getByText(/Event B/)).toBeInTheDocument();
    expect(
      screen.getByText('home.widgets.feed_attendance_reminder'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('home.widgets.feed_notifications_heading'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('notif')).toHaveLength(2);
    expect(
      screen.queryByText('home.widgets.feed_empty'),
    ).not.toBeInTheDocument();
  });

  it('event rows link to CLUB_EVENTS_PAGE_PATH and the attendance line links to ATTENDANCE_PAGE_PATH (AC 4.4)', () => {
    useSWRxUpcomingClubEventsMock.mockReturnValue({
      data: [{ date: '2026-09-10', title: 'Event A' }],
      error: undefined,
    });
    useSWRxAttendanceStatusMock.mockReturnValue({
      data: { answered: false },
      error: undefined,
    });

    render(<HomeFeedWidget />);

    expect(screen.getByRole('link', { name: /Event A/ })).toHaveAttribute(
      'href',
      '/club-events-page',
    );
    expect(
      screen.getByText('home.widgets.feed_attendance_reminder').closest('a'),
    ).toHaveAttribute('href', '/attendance-page');
  });

  it('does not render the attendance line when already answered', () => {
    useSWRxAttendanceStatusMock.mockReturnValue({
      data: { answered: true },
      error: undefined,
    });
    useSWRxInAppNotificationsMock.mockReturnValue(notifPage(['n1']));

    render(<HomeFeedWidget />);

    expect(
      screen.queryByText('home.widgets.feed_attendance_reminder'),
    ).not.toBeInTheDocument();
  });

  it('keeps other sections when one section fails (failure isolation)', () => {
    useSWRxUpcomingClubEventsMock.mockReturnValue({
      data: undefined,
      error: new Error('boom'),
    });
    useSWRxAttendanceStatusMock.mockReturnValue({
      data: { answered: true },
      error: undefined,
    });
    useSWRxInAppNotificationsMock.mockReturnValue(notifPage(['n1']));

    render(<HomeFeedWidget />);

    expect(
      screen.queryByText('home.widgets.feed_events_heading'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTestId('notif')).toHaveLength(1);
    expect(
      screen.queryByText('home.widgets.feed_empty'),
    ).not.toBeInTheDocument();
  });

  it('renders the whole-widget empty state when nothing is available (AC 4.5)', () => {
    useSWRxUpcomingClubEventsMock.mockReturnValue({
      data: [],
      error: undefined,
    });
    useSWRxAttendanceStatusMock.mockReturnValue({
      data: { answered: true },
      error: undefined,
    });
    useSWRxInAppNotificationsMock.mockReturnValue({
      data: { docs: [] },
      error: undefined,
    });

    render(<HomeFeedWidget />);

    expect(screen.getByText('home.widgets.feed_heading')).toBeInTheDocument();
    expect(screen.getByText('home.widgets.feed_empty')).toBeInTheDocument();
  });

  it('renders nothing while all three hooks are still loading', () => {
    const { container } = render(<HomeFeedWidget />);

    expect(container).toBeEmptyDOMElement();
    expect(
      screen.queryByText('home.widgets.feed_empty'),
    ).not.toBeInTheDocument();
  });

  it('renders one notification row per doc via InAppNotificationElm', () => {
    useSWRxInAppNotificationsMock.mockReturnValue(notifPage(['a', 'b', 'c']));

    render(<HomeFeedWidget />);

    const rows = screen.getAllByTestId('notif');
    expect(rows.map((r) => r.textContent)).toEqual(['a', 'b', 'c']);
  });
});
