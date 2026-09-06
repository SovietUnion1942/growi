/**
 * 部イベントページ本文のパース(単一ソース)。
 *
 * mongoose 非依存・React 非依存・ロガー非依存の純粋モジュール。
 * サーバー(出欠リマインダー)とクライアントストアの両方から import される。
 */

export const CLUB_EVENTS_PAGE_PATH = '/イベント/決定済みイベント保管場所';

export type ClubEvent = { date: string; title: string };

// 出欠プラグイン(growi-plugin-calendarv2)のイベント行パースと同じ形式に合わせる。
// ページ本文末尾にナビゲーションフッターが付いていても、日付行のみを抽出する。
export const parseClubEvents = (body: string): ClubEvent[] => {
  const now = new Date();
  let year = now.getFullYear();
  let lastMonth = 0;
  const events: ClubEvent[] = [];

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
