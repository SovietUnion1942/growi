import { getInstance } from '^/test/setup/crowi';

import type Crowi from '~/server/crowi';

import { hasAnsweredCurrentMonth } from './attendance-reminder';

const getCurrentYearMonth = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

describe('hasAnsweredCurrentMonth', () => {
  let crowi: Crowi;
  // biome-ignore lint/suspicious/noExplicitAny: crowi.models.Page has no usable TS type here
  let Page: any;

  const username = `attendance-reminder-integ-user-${Date.now()}`;
  const yearMonth = getCurrentYearMonth();
  const path = `/schedule/responses/${yearMonth}/${username}`;

  beforeAll(async () => {
    crowi = await getInstance();
    Page = crowi.models.Page;
  });

  afterEach(async () => {
    await Page.deleteMany({ path });
  });

  it('returns false when the user has no attendance page for this month', async () => {
    const answered = await hasAnsweredCurrentMonth(username);
    expect(answered).toBe(false);
  });

  it("returns true once the user has created this month's attendance page", async () => {
    await Page.create({ path });

    const answered = await hasAnsweredCurrentMonth(username);
    expect(answered).toBe(true);
  });

  it('returns false when the only matching page is empty (isEmpty: true)', async () => {
    // isEmpty pages are placeholder nodes GROWI creates for intermediate path
    // segments, not a real user submission — they must not count as "answered".
    await Page.create({ path, isEmpty: true });

    const answered = await hasAnsweredCurrentMonth(username);
    expect(answered).toBe(false);
  });
});
