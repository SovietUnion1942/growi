import { escapeStringForMongoRegex } from '@growi/core/dist/utils';
import mongoose from 'mongoose';

import { UserStatus } from '~/server/models/user/conts';
import loggerFactory from '~/utils/logger';

import { sendPushNotificationToUser } from './push-notification';

const logger = loggerFactory('growi:service:attendance-reminder');

const EVENTS_PAGE_PATH = '/イベント/決定済みイベント保管場所';
const RESPONSES_PATH_PREFIX = '/schedule/responses';

const getReminderWindowDays = (): number => {
  const raw = Number(process.env.ATTENDANCE_REMINDER_WINDOW_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 7;
};

type ScheduleEvent = { date: string; title: string };

// 出欠プラグイン(growi-plugin-calendarv2)のイベント行パースと同じ形式に合わせる
const parseEvents = (body: string): ScheduleEvent[] => {
  const now = new Date();
  let year = now.getFullYear();
  let lastMonth = 0;
  const events: ScheduleEvent[] = [];

  for (const line of body.split('\n')) {
    const match = line.match(/^\s*(\d{1,2})月(\d{1,2})日[\s　]+(.+?)\s*$/);
    if (match == null) continue;

    const month = Number.parseInt(match[1], 10);
    const day = match[2].padStart(2, '0');
    const title = match[3];
    if (month < lastMonth) year += 1;
    lastMonth = month;
    events.push({
      date: `${year}-${String(month).padStart(2, '0')}-${day}`,
      title,
    });
  }

  return events;
};

const parseAvailability = (body: string): Record<string, string> | null => {
  const match = body.match(/<!--\s*availability\s*([\s\S]*?)-->/);
  if (match == null) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

const getPageBody = async (path: string): Promise<string | null> => {
  const Page = mongoose.model('Page');
  const page = await Page.findOne({ path, isEmpty: { $ne: true } })
    .populate({ path: 'revision', select: 'body' })
    .lean();
  return (page?.revision as { body?: string } | undefined)?.body ?? null;
};

const getPageBodiesByPrefix = async (
  pathPrefix: string,
): Promise<{ path: string; body: string }[]> => {
  const Page = mongoose.model('Page');
  const escaped = escapeStringForMongoRegex(pathPrefix);
  const pages = await Page.find({
    path: new RegExp(`^${escaped}`),
    isEmpty: { $ne: true },
  })
    .populate({ path: 'revision', select: 'body' })
    .lean();

  return pages
    .map((p) => ({
      path: p.path as string,
      body: (p.revision as { body?: string } | undefined)?.body,
    }))
    .filter((p): p is { path: string; body: string } => p.body != null);
};

const fetchUpcomingEvents = async (): Promise<ScheduleEvent[]> => {
  const body = await getPageBody(EVENTS_PAGE_PATH);
  if (body == null) return [];

  const events = parseEvents(body);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(
    today.getTime() + getReminderWindowDays() * 24 * 60 * 60 * 1000,
  );

  return events.filter((e) => {
    const d = new Date(`${e.date}T00:00:00`);
    return d >= today && d <= windowEnd;
  });
};

// 指定した年月群について、日付ごとに「回答済みのユーザー名」の集合を返す
const fetchAnsweredUsernamesByDate = async (
  yearMonths: string[],
): Promise<Map<string, Set<string>>> => {
  const answeredByDate = new Map<string, Set<string>>();

  for (const yearMonth of yearMonths) {
    const prefix = `${RESPONSES_PATH_PREFIX}/${yearMonth}/`;
    const pages = await getPageBodiesByPrefix(prefix);

    for (const { path, body } of pages) {
      const username = path.slice(prefix.length);
      if (username === '' || username.includes('/')) continue;

      const availability = parseAvailability(body);
      if (availability == null) continue;

      for (const date of Object.keys(availability)) {
        if (!answeredByDate.has(date)) {
          answeredByDate.set(date, new Set());
        }
        answeredByDate.get(date)?.add(username);
      }
    }
  }

  return answeredByDate;
};

const getActiveUsers = async (): Promise<
  { _id: mongoose.Types.ObjectId; username: string }[]
> => {
  const User = mongoose.model('User');
  return User.find({ status: UserStatus.STATUS_ACTIVE })
    .select('_id username')
    .lean();
};

const getCurrentYearMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

// 指定したpathPrefix配下に、ユーザー名ごとのページが存在するかどうかだけを見る
// (中身の出欠データが妥当かどうかは問わない。ページ自体が無ければ「今月未回答」とみなす)
const getUsernamesWithPageAtPrefix = async (
  pathPrefix: string,
): Promise<Set<string>> => {
  const Page = mongoose.model('Page');
  const escaped = escapeStringForMongoRegex(pathPrefix);
  const pages = await Page.find({
    path: new RegExp(`^${escaped}`),
    isEmpty: { $ne: true },
  })
    .select('path')
    .lean();

  const usernames = new Set<string>();
  for (const p of pages) {
    const username = (p.path as string).slice(pathPrefix.length);
    if (username === '' || username.includes('/')) continue;
    usernames.add(username);
  }
  return usernames;
};

export type AttendanceReminderResult = {
  eventCount: number;
  remindedUserCount: number;
};

/**
 * 直近(ATTENDANCE_REMINDER_WINDOW_DAYS日以内、既定7日)のイベントについて、
 * 出欠未回答のアクティブユーザーへPush通知でリマインドする。
 */
export const sendAttendanceReminders =
  async (): Promise<AttendanceReminderResult> => {
    const events = await fetchUpcomingEvents();
    if (events.length === 0) {
      return { eventCount: 0, remindedUserCount: 0 };
    }

    const yearMonths = Array.from(
      new Set(events.map((e) => e.date.slice(0, 7))),
    );
    const [answeredByDate, activeUsers] = await Promise.all([
      fetchAnsweredUsernamesByDate(yearMonths),
      getActiveUsers(),
    ]);

    const unansweredDatesByUserId = new Map<string, Set<string>>();

    for (const event of events) {
      const answered = answeredByDate.get(event.date) ?? new Set<string>();
      for (const user of activeUsers) {
        if (answered.has(user.username)) continue;

        const userId = user._id.toString();
        if (!unansweredDatesByUserId.has(userId)) {
          unansweredDatesByUserId.set(userId, new Set());
        }
        unansweredDatesByUserId.get(userId)?.add(event.date);
      }
    }

    let remindedUserCount = 0;

    for (const [userId, dateSet] of unansweredDatesByUserId) {
      const dates = Array.from(dateSet).sort();
      const payload = {
        title: '物理部Wiki 出欠リマインダー',
        body: `${dates.length}件のイベントの出欠が未回答です: ${dates.join('、')}`,
        url: '/出欠確認投票ページ',
      };

      const result = await sendPushNotificationToUser(userId, payload);
      if (result.sent > 0) {
        remindedUserCount += 1;
      }
    }

    logger.info(
      `Attendance reminders: ${events.length} upcoming event(s), reminded ${remindedUserCount} user(s)`,
    );

    return { eventCount: events.length, remindedUserCount };
  };

export type MonthlyVotingReminderResult = {
  remindedUserCount: number;
};

/**
 * 直近イベントの有無に関係なく、今月分の出欠回答ページ
 * (/schedule/responses/{今月}/{username})を一度も作っていないアクティブユーザーへ
 * Push通知でリマインドする。
 */
export const sendMonthlyVotingReminders =
  async (): Promise<MonthlyVotingReminderResult> => {
    const yearMonth = getCurrentYearMonth();
    const prefix = `${RESPONSES_PATH_PREFIX}/${yearMonth}/`;

    const [answeredUsernames, activeUsers] = await Promise.all([
      getUsernamesWithPageAtPrefix(prefix),
      getActiveUsers(),
    ]);

    const [year, month] = yearMonth.split('-');
    let remindedUserCount = 0;

    for (const user of activeUsers) {
      if (answeredUsernames.has(user.username)) continue;

      const payload = {
        title: '物理部Wiki 出欠リマインダー',
        body: `${year}年${Number.parseInt(month, 10)}月の出欠がまだ未投票です。都合の良い日を教えてください`,
        url: '/出欠確認投票ページ',
      };

      const result = await sendPushNotificationToUser(
        user._id.toString(),
        payload,
      );
      if (result.sent > 0) {
        remindedUserCount += 1;
      }
    }

    logger.info(
      `Monthly voting reminder: reminded ${remindedUserCount} user(s) for ${yearMonth}`,
    );

    return { remindedUserCount };
  };
