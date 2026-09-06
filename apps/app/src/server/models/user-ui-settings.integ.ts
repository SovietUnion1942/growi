import type { HomeWidgetPreferences } from '~/features/home/interfaces/home-widgets';

import UserUISettings from './user-ui-settings';

/**
 * Integration tests for the UserUISettings model persistence shape (Req 6.2).
 *
 * Uses the real MongoMemoryServer connection wired by the vitest globalSetup.
 * Verifies that the per-user `homeWidgetPreferences` field round-trips through
 * the Mongoose schema and that a user document without it reads back as
 * undefined ("未設定の利用者では空として扱われる").
 */

describe('UserUISettings.homeWidgetPreferences', () => {
  const userA = '000000000000000000000001';
  const userB = '000000000000000000000002';

  beforeEach(async () => {
    await UserUISettings.deleteMany({});
  });

  it('saves and retrieves a partial per-widget visibility/order override', async () => {
    const homeWidgetPreferences: HomeWidgetPreferences = {
      search: { visible: false },
      homeFeed: { order: 5 },
    };

    await UserUISettings.create({ user: userA, homeWidgetPreferences });

    const doc = await UserUISettings.findOne({ user: userA }).lean();

    expect(doc).not.toBeNull();
    expect(doc?.homeWidgetPreferences).toEqual({
      search: { visible: false },
      homeFeed: { order: 5 },
    });
  });

  it('treats a user document without the field as empty (undefined)', async () => {
    await UserUISettings.create({ user: userB });

    const doc = await UserUISettings.findOne({ user: userB }).lean();

    expect(doc).not.toBeNull();
    expect(doc?.homeWidgetPreferences).toBeUndefined();
  });

  it('does not persist widget keys outside the known WidgetKey set', async () => {
    await UserUISettings.create({
      user: userA,
      homeWidgetPreferences: {
        bogusWidget: { visible: true },
        bookmarks: { visible: false },
      } as Record<string, { visible?: boolean; order?: number }>,
    });

    const doc = await UserUISettings.findOne({ user: userA }).lean();

    expect(doc?.homeWidgetPreferences).toEqual({
      bookmarks: { visible: false },
    });
  });
});
