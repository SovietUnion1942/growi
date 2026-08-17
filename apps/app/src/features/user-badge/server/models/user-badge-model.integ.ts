/**
 * Integration tests — UserBadge unique compound index enforcement.
 *
 * `(user, badgeType, level)` must be unique so the same badge (same level)
 * can never be granted twice to the same user. This is enforced at the DB
 * level (E11000 duplicate-key error), which only a real Mongo engine can
 * trigger — a bare `.validateSync()`/`.validate()` would not catch it.
 *
 * Requires a real MongoDB connection (wired by vitest.workspace.mts integ
 * setup, `test/setup/mongo/index.ts`, via MongoMemoryReplSet or an external
 * MONGO_URI in CI).
 *
 * Requirements: 2.4 (no duplicate automatic-badge grant), 3.5 (independent
 * manual grants to different users — the `level: null` case here confirms
 * the same manual badge is still rejected for the SAME user).
 * Design: UserBadge model — `{ user: 1, badgeType: 1, level: 1 }` unique
 * compound index; `level: null` participates as a distinct indexable value.
 */

import { Types } from 'mongoose';

import UserBadge from './user-badge-model';

describe('UserBadge model', () => {
  beforeAll(async () => {
    // Mongoose builds indexes in the background after model compilation;
    // `.create()` does not wait for that build to finish. Without this
    // explicit `init()` (which resolves once index creation completes),
    // the unique index may not yet exist on the collection when the first
    // test runs, and a duplicate-key save would wrongly succeed.
    await UserBadge.init();
  });

  afterEach(async () => {
    await UserBadge.deleteMany({});
  });

  describe('unique compound index on (user, badgeType, level)', () => {
    it('rejects a second save of the same automatic-badge (user, badgeType, level)', async () => {
      const user = new Types.ObjectId();
      const badgeType = new Types.ObjectId();

      await UserBadge.create({
        user,
        badgeType,
        level: 1,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
      });

      await expect(
        UserBadge.create({
          user,
          badgeType,
          level: 1,
          grantedAt: new Date(),
          grantedBy: null,
          note: null,
        }),
      ).rejects.toThrow(/E11000|duplicate key/i);
    });

    it('rejects a second save of the same manual badge (level: null) for the same user', async () => {
      const user = new Types.ObjectId();
      const badgeType = new Types.ObjectId();
      const grantedBy = new Types.ObjectId();

      await UserBadge.create({
        user,
        badgeType,
        level: null,
        grantedAt: new Date(),
        grantedBy,
        note: 'first grant',
      });

      await expect(
        UserBadge.create({
          user,
          badgeType,
          level: null,
          grantedAt: new Date(),
          grantedBy,
          note: 'second grant attempt',
        }),
      ).rejects.toThrow(/E11000|duplicate key/i);
    });

    it('allows the same manual badge to be granted independently to two different users', async () => {
      const badgeType = new Types.ObjectId();
      const userA = new Types.ObjectId();
      const userB = new Types.ObjectId();

      await UserBadge.create({
        user: userA,
        badgeType,
        level: null,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
      });

      await expect(
        UserBadge.create({
          user: userB,
          badgeType,
          level: null,
          grantedAt: new Date(),
          grantedBy: null,
          note: null,
        }),
      ).resolves.toBeDefined();

      const count = await UserBadge.countDocuments({ badgeType });
      expect(count).toBe(2);
    });

    it('allows two different levels of the same badge type for the same user', async () => {
      const user = new Types.ObjectId();
      const badgeType = new Types.ObjectId();

      await UserBadge.create({
        user,
        badgeType,
        level: 1,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
      });

      await expect(
        UserBadge.create({
          user,
          badgeType,
          level: 2,
          grantedAt: new Date(),
          grantedBy: null,
          note: null,
        }),
      ).resolves.toBeDefined();

      const count = await UserBadge.countDocuments({ user, badgeType });
      expect(count).toBe(2);
    });
  });

  describe('revokedAt/revokedBy fields and partial unique index', () => {
    it('defaults revokedAt and revokedBy to null on a freshly created UserBadge', async () => {
      const userBadge = await UserBadge.create({
        user: new Types.ObjectId(),
        badgeType: new Types.ObjectId(),
        level: 1,
        grantedAt: new Date(),
        grantedBy: null,
        note: null,
      });

      expect(userBadge.revokedAt).toBeNull();
      expect(userBadge.revokedBy).toBeNull();
    });

    it('allows a new (user, badgeType, level) record when the existing record is revoked', async () => {
      const user = new Types.ObjectId();
      const badgeType = new Types.ObjectId();
      const admin = new Types.ObjectId();

      await UserBadge.create({
        user,
        badgeType,
        level: null,
        grantedAt: new Date(),
        grantedBy: null,
        note: 'first grant',
        revokedAt: new Date(),
        revokedBy: admin,
      });

      await expect(
        UserBadge.create({
          user,
          badgeType,
          level: null,
          grantedAt: new Date(),
          grantedBy: null,
          note: 'second grant after revocation',
        }),
      ).resolves.toBeDefined();

      const count = await UserBadge.countDocuments({ user, badgeType });
      expect(count).toBe(2);
    });

    it('still rejects a second save of the same (user, badgeType, level) when the existing record is not revoked', async () => {
      const user = new Types.ObjectId();
      const badgeType = new Types.ObjectId();

      await UserBadge.create({
        user,
        badgeType,
        level: null,
        grantedAt: new Date(),
        grantedBy: null,
        note: 'first grant',
      });

      await expect(
        UserBadge.create({
          user,
          badgeType,
          level: null,
          grantedAt: new Date(),
          grantedBy: null,
          note: 'second grant attempt',
        }),
      ).rejects.toThrow(/E11000|duplicate key/i);
    });
  });
});
