// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import {
  useSWRxAttendanceStatus,
  useSWRxUpcomingClubEvents,
} from './home-feed';

// Mock the apiv3 boundary (attendance-status hook).
const apiv3Get = vi.fn();
vi.mock('../client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

// Mock the login gate. `setUser(null)` exercises the idle path.
let currentUser: unknown = { username: 'tester' };
vi.mock('~/states/global', () => ({
  useCurrentUser: () => currentUser,
}));

// Fresh SWR cache per render so entries do not leak between tests.
const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

// Body dates are parsed against a fixed "now" so future/ordering is deterministic.
// parseClubEvents bumps the year each time a month is < the previous line's month.
const EVENTS_MD = [
  '# 決定済みイベント',
  '3月1日　春合宿', // 2026-03-01 (past)
  '10月5日　秋の遠足', // 2026-10-05 (future)
  '12月20日　忘年会', // 2026-12-20 (future)
  '9月6日　全体会議', // 2027-09-06 (future, year bumped)
  '',
  '---',
  '[前へ](/prev) [次へ](/next)',
].join('\n');

beforeEach(() => {
  apiv3Get.mockReset();
  currentUser = { username: 'tester' };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-06T12:00:00'));
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useSWRxUpcomingClubEvents', () => {
  const okResponse = (text: string): Response =>
    ({ ok: true, text: () => Promise.resolve(text) }) as unknown as Response;

  it('fetches the club events page ".md" and returns future events sorted by date ascending', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse(EVENTS_MD),
    );

    const { result } = renderHook(() => useSWRxUpcomingClubEvents(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([
        { date: '2026-10-05', title: '秋の遠足' },
        { date: '2026-12-20', title: '忘年会' },
        { date: '2027-09-06', title: '全体会議' },
      ]);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      '/イベント/決定済みイベント保管場所.md',
      { headers: { Accept: 'text/markdown' } },
    );
  });

  it('caps the result at the given limit (nearest first)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse(EVENTS_MD),
    );

    const { result } = renderHook(() => useSWRxUpcomingClubEvents(2), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([
        { date: '2026-10-05', title: '秋の遠足' },
        { date: '2026-12-20', title: '忘年会' },
      ]);
    });
  });

  it('includes an event happening today', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      okResponse('9月6日　本日集会'),
    );

    const { result } = renderHook(() => useSWRxUpcomingClubEvents(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([
        { date: '2026-09-06', title: '本日集会' },
      ]);
    });
  });

  it('returns [] when the page is missing or forbidden (non-2xx)', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 403,
    } as unknown as Response);

    const { result } = renderHook(() => useSWRxUpcomingClubEvents(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([]);
    });
  });

  it('is idle (no fetch) when there is no current user', async () => {
    currentUser = null;

    const { result } = renderHook(() => useSWRxUpcomingClubEvents(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('useSWRxAttendanceStatus', () => {
  it('reads /personal-setting/attendance-status and returns the answered flag', async () => {
    apiv3Get.mockResolvedValue({ data: { answered: false } });

    const { result } = renderHook(() => useSWRxAttendanceStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual({ answered: false });
    });
    expect(apiv3Get).toHaveBeenCalledWith(
      '/personal-setting/attendance-status',
    );
  });

  it('is idle (no fetch) when there is no current user', async () => {
    currentUser = null;

    const { result } = renderHook(() => useSWRxAttendanceStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Get).not.toHaveBeenCalled();
  });
});
