import { CLUB_EVENTS_PAGE_PATH, parseClubEvents } from './parse-club-events';

describe('parseClubEvents', () => {
  const currentYear = new Date().getFullYear();

  it('parses a single date line into a zero-padded ISO date and its title', () => {
    const result = parseClubEvents('4月5日　春の観測会');
    expect(result).toEqual([
      { date: `${currentYear}-04-05`, title: '春の観測会' },
    ]);
  });

  it('parses multiple date lines in body order', () => {
    const body = ['4月5日　観測会', '4月20日　部会', '5月3日　合宿'].join('\n');
    expect(parseClubEvents(body)).toEqual([
      { date: `${currentYear}-04-05`, title: '観測会' },
      { date: `${currentYear}-04-20`, title: '部会' },
      { date: `${currentYear}-05-03`, title: '合宿' },
    ]);
  });

  it('rolls the year over when the month decreases relative to the previous line', () => {
    const body = ['11月10日　冬合宿', '1月8日　新年会'].join('\n');
    expect(parseClubEvents(body)).toEqual([
      { date: `${currentYear}-11-10`, title: '冬合宿' },
      { date: `${currentYear + 1}-01-08`, title: '新年会' },
    ]);
  });

  it('extracts only the date lines when a markdown navigation footer is appended to the body', () => {
    const body = [
      '# 決定済みイベント',
      '',
      '4月5日　観測会',
      '5月3日　合宿',
      '',
      '---',
      '[前のページ](/イベント/2023) | [次のページ](/イベント/2025)',
      '',
      '* [イベント一覧](/イベント)',
    ].join('\n');
    expect(parseClubEvents(body)).toEqual([
      { date: `${currentYear}-04-05`, title: '観測会' },
      { date: `${currentYear}-05-03`, title: '合宿' },
    ]);
  });

  it('ignores lines that are not date lines', () => {
    const body = ['ただのメモ', '4月5日　観測会', '## 見出し'].join('\n');
    expect(parseClubEvents(body)).toEqual([
      { date: `${currentYear}-04-05`, title: '観測会' },
    ]);
  });

  it('returns an empty array for an empty body', () => {
    expect(parseClubEvents('')).toEqual([]);
  });

  it('exposes the club events page path as a shared constant', () => {
    expect(CLUB_EVENTS_PAGE_PATH).toBe('/イベント/決定済みイベント保管場所');
  });
});
