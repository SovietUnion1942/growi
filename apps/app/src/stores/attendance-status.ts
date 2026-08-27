import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';
import { useCurrentUser } from '~/states/global';

export const ATTENDANCE_PAGE_PATH = '/出欠確認投票ページ';

type AttendanceStatus = { answered: boolean };

const fetchAttendanceStatus = async (
  url: string,
): Promise<AttendanceStatus> => {
  const { data } = await apiv3Get<AttendanceStatus>(url);
  return data;
};

type UseAttendanceReminderModalResult = {
  isOpen: boolean;
  dismiss: () => void;
};

/**
 * 今月分の出欠が未回答の間、ページ遷移のたびに再度リマインドするための状態。
 * 「あとで」で一時的に閉じても、次のページ遷移で再度未回答なら開き直す。
 */
export const useAttendanceReminderModal =
  (): UseAttendanceReminderModalResult => {
    const router = useRouter();
    const currentUser = useCurrentUser();
    const [dismissed, setDismissed] = useState(false);

    const { data, mutate } = useSWR(
      currentUser != null ? '/personal-setting/attendance-status' : null,
      fetchAttendanceStatus,
    );

    useEffect(() => {
      const handleRouteChangeComplete = () => {
        setDismissed(false);
        mutate();
      };
      router.events.on('routeChangeComplete', handleRouteChangeComplete);
      return () => {
        router.events.off('routeChangeComplete', handleRouteChangeComplete);
      };
    }, [router, mutate]);

    const isOnAttendancePage = decodeURIComponent(router.asPath).startsWith(
      ATTENDANCE_PAGE_PATH,
    );

    const isOpen =
      !dismissed && !isOnAttendancePage && data?.answered === false;

    const dismiss = () => setDismissed(true);

    return { isOpen, dismiss };
  };
