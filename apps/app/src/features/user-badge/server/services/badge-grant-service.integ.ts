/**
 * Integration tests — BadgeGrantService: cumulative edit-count counting and
 * threshold evaluation/grant logic.
 *
 * Uses a real MongoDB connection (wired by vitest.workspace.mts integ
 * setup) for `BadgeType`/`UserBadge` reads/writes, and a real Prisma client
 * bound to the same test DB (`test/setup/prisma.ts`) for seeding/reading
 * `activities` rows — `getCumulativeEditCount` queries `prisma.activities`
 * directly rather than the Mongoose `Activity` model, so only a real Prisma
 * round-trip exercises the actual `where`/`in` filter this function sends.
 *
 * Requirements: 2.1 (count only CREATE/UPDATE), 2.2 (single-level threshold
 * grant), 2.3 (multi-level crossing grants all qualified levels, keeps
 * lower ones), 2.4 (idempotent duplicate-grant), 2.6 (COMMENT_CREATE etc.
 * excluded from the count).
 * Design: BadgeGrantService — Service Interface (`evaluateAndGrantForUser`),
 * Implementation Notes (`getCumulativeEditCount` via
 * `prisma.activities.count`, Contribution model deliberately not used).
 * research.md: "Decision: 累積貢献数のカウント方式".
 */

import { EventEmitter } from 'node:events';
import type { IUserHasId } from '@growi/core';
import mongoose, { Types } from 'mongoose';
import { mock } from 'vitest-mock-extended';

import { SupportedAction } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import type UserEvent from '~/server/events/user';
import { prisma } from '~/utils/prisma';

import type { IBadgeType } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import {
  evaluateAndGrantForUser,
  getCumulativeEditCount,
  grantManualBadge,
} from './badge-grant-service';
import {
  BadgeAlreadyGrantedError,
  BadgeGrantManualCategoryMismatchError,
  BadgeTypeNotFoundError,
} from './badge-type-errors';

// A sentinel ip value so cleanup deletes only this suite's seeded activities.
const TEST_IP = '10.0.0.77';

/** Build a minimal activities record for seeding via prisma.activities.create(Many). */
function makeActivityData(overrides: {
  userId: string;
  action: string;
  createdAt: Date;
}) {
  return {
    id: new Types.ObjectId().toHexString(),
    v: 0,
    action: overrides.action,
    // Each seeded row targets a distinct (fake) page, matching the fact that
    // real ACTION_PAGE_CREATE/UPDATE activities are per-page — this also
    // keeps every row distinct under the (userId, target, action,
    // createdAt) unique index even when several rows share the same action.
    target: new Types.ObjectId().toHexString(),
    createdAt: overrides.createdAt,
    endpoint: '/test/badge-grant-service',
    ip: TEST_IP,
    snapshot: { id: new Types.ObjectId().toHexString(), username: 'testuser' },
    userId: overrides.userId,
  };
}

async function seedActivities(
  userId: string,
  actions: string[],
): Promise<void> {
  const now = Date.now();
  await prisma.activities.createMany({
    data: actions.map((action, index) =>
      makeActivityData({ userId, action, createdAt: new Date(now + index) }),
    ),
  });
}

function makeGrantedBy(): IUserHasId {
  return mock<IUserHasId>({ _id: new Types.ObjectId().toString() });
}

/**
 * The real User model, registered once via its production factory (mirrors
 * `user.integ.ts`, whose own `User` binding is likewise untyped `any`: the
 * factory is a plain `.js` module with no exported TS type), so
 * `badgeSummaryCached` reads/writes exercise the actual schema added in
 * task 1.4 rather than an ad-hoc stand-in.
 */
// biome-ignore lint/suspicious/noExplicitAny: mirrors user.integ.ts's own `let User: any` -- the factory is an untyped .js module.
async function getUserModel(): Promise<any> {
  const existing = mongoose.models.User;
  if (existing != null) {
    return existing;
  }
  const crowiMock = mock<Crowi>({
    events: { user: mock<UserEvent>({ on: vi.fn() }) },
  });
  const userModule = await import('~/server/models/user');
  return userModule.default(crowiMock);
}

async function createUser(): Promise<string> {
  const User = await getUserModel();
  const id = new Types.ObjectId();
  await User.create({
    _id: id,
    name: `Badge Test User ${id.toString()}`,
    username: `badge-test-user-${id.toString()}`,
    email: `${id.toString()}@example.com`,
    password: 'password',
  });
  return id.toString();
}

async function createManualBadgeType(
  overrides: Partial<Pick<IBadgeType, 'name'>> = {},
): Promise<IBadgeType & { _id: Types.ObjectId }> {
  const createdBy = new Types.ObjectId();
  const created = await BadgeType.create({
    name: overrides.name ?? 'Community Helper',
    description: 'Awarded for community support',
    iconKey: 'heart',
    category: 'manual',
    levels: [],
    createdBy,
  });
  return created.toObject();
}

async function createAutomaticBadgeType(
  overrides: Partial<Pick<IBadgeType, 'name' | 'levels'>> = {},
): Promise<IBadgeType & { _id: Types.ObjectId }> {
  const createdBy = new Types.ObjectId();
  const created = await BadgeType.create({
    name: overrides.name ?? 'Editor',
    description: 'Awarded for editing pages',
    iconKey: 'edit',
    category: 'automatic',
    levels: overrides.levels ?? [
      { level: 1, name: 'Bronze', iconKey: 'edit', threshold: 3 },
      { level: 2, name: 'Silver', iconKey: 'edit', threshold: 5 },
      { level: 3, name: 'Gold', iconKey: 'edit', threshold: 10 },
    ],
    createdBy,
  });
  return created.toObject();
}

describe('BadgeGrantService', () => {
  beforeAll(async () => {
    // Mongoose builds the (user, badgeType, level) unique index in the
    // background after model compilation; `.create()` does not wait for
    // that build to finish. Without this explicit `init()`, the unique
    // index may not yet exist when the first duplicate-grant assertion
    // runs, silently allowing a duplicate through (this bit task 1.3).
    await UserBadge.init();
  });

  afterEach(async () => {
    await UserBadge.deleteMany({});
    await BadgeType.deleteMany({});
    await prisma.activities.deleteMany({ where: { ip: TEST_IP } });
    const User = await getUserModel();
    await User.deleteMany({ username: /^badge-test-user-/ });
  });

  describe('getCumulativeEditCount', () => {
    it('counts only ACTION_PAGE_CREATE and ACTION_PAGE_UPDATE activities for the user', async () => {
      const userId = new Types.ObjectId().toHexString();
      const otherUserId = new Types.ObjectId().toHexString();

      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);
      // Activity by a different user must not be counted.
      await seedActivities(otherUserId, [SupportedAction.ACTION_PAGE_CREATE]);

      const count = await getCumulativeEditCount(userId);

      expect(count).toBe(3);
    });

    it('excludes non-edit actions such as ACTION_COMMENT_CREATE from the count (req 2.6)', async () => {
      const userId = new Types.ObjectId().toHexString();

      await seedActivities(userId, [
        SupportedAction.ACTION_COMMENT_CREATE,
        SupportedAction.ACTION_COMMENT_CREATE,
        SupportedAction.ACTION_PAGE_VIEW,
        SupportedAction.ACTION_PAGE_LIKE,
      ]);

      const count = await getCumulativeEditCount(userId);

      expect(count).toBe(0);
    });
  });

  describe('evaluateAndGrantForUser', () => {
    it('grants no badge when the cumulative count is below every threshold', async () => {
      const userId = new Types.ObjectId().toHexString();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(0);
      const stored = await UserBadge.find({ user: userId });
      expect(stored).toHaveLength(0);
    });

    it('grants exactly the single level whose threshold is newly reached (req 2.2)', async () => {
      const userId = new Types.ObjectId().toHexString();
      const badgeType = await createAutomaticBadgeType();
      // 3 CREATE/UPDATE activities crosses only the level-1 threshold (3).
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(1);
      expect(granted[0]).toMatchObject({
        badgeType: badgeType._id,
        level: 1,
        grantedBy: null,
      });
    });

    it('grants all newly-qualified levels at once when crossing multiple thresholds in one evaluation, and keeps lower levels on a later evaluation (req 2.3)', async () => {
      const userId = new Types.ObjectId().toHexString();
      const badgeType = await createAutomaticBadgeType();
      // 10 activities crosses thresholds 3, 5 and 10 all at once.
      await seedActivities(
        userId,
        Array.from({ length: 10 }, () => SupportedAction.ACTION_PAGE_CREATE),
      );

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(3);
      const grantedLevels = granted.map((g) => g.level).sort();
      expect(grantedLevels).toEqual([1, 2, 3]);

      // Lower-level records must still be present and untouched (not merged
      // into, deleted, or replaced by the higher-level grant).
      const level1 = await UserBadge.findOne({
        user: userId,
        badgeType: badgeType._id,
        level: 1,
      });
      expect(level1).not.toBeNull();
      const level2 = await UserBadge.findOne({
        user: userId,
        badgeType: badgeType._id,
        level: 2,
      });
      expect(level2).not.toBeNull();
      const level3 = await UserBadge.findOne({
        user: userId,
        badgeType: badgeType._id,
        level: 3,
      });
      expect(level3).not.toBeNull();
    });

    it('is idempotent: evaluating twice at the same cumulative count does not duplicate-grant or throw (req 2.4)', async () => {
      const userId = new Types.ObjectId().toHexString();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);

      const firstRun = await evaluateAndGrantForUser(userId);
      expect(firstRun).toHaveLength(1);

      // Second evaluation at the identical cumulative count must not throw
      // and must not create a second UserBadge for (user, badgeType, level).
      await expect(evaluateAndGrantForUser(userId)).resolves.toEqual([]);

      const count = await UserBadge.countDocuments({ user: userId });
      expect(count).toBe(1);
    });

    it('grants only the newly-crossed higher level when re-evaluated after more activity, without duplicating the already-granted lower level', async () => {
      const userId = new Types.ObjectId().toHexString();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);
      await evaluateAndGrantForUser(userId); // grants level 1

      // Two more activities push the cumulative count to 5, crossing level 2.
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_CREATE,
      ]);

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(1);
      expect(granted[0].level).toBe(2);

      const count = await UserBadge.countDocuments({ user: userId });
      expect(count).toBe(2);
    });

    it('does not grant a badge when activity consists only of non-edit actions such as comments (req 2.6)', async () => {
      const userId = new Types.ObjectId().toHexString();
      // Threshold of 1 is deliberately low: even a single comment must not cross it.
      await createAutomaticBadgeType({
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
      });
      await seedActivities(userId, [
        SupportedAction.ACTION_COMMENT_CREATE,
        SupportedAction.ACTION_COMMENT_CREATE,
        SupportedAction.ACTION_COMMENT_CREATE,
      ]);

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(0);
      const count = await UserBadge.countDocuments({ user: userId });
      expect(count).toBe(0);
    });

    it('narrows evaluation to a single BadgeType when scopedBadgeTypeId is given', async () => {
      const userId = new Types.ObjectId().toHexString();
      const badgeTypeA = await createAutomaticBadgeType({
        name: 'Editor A',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
      });
      const badgeTypeB = await createAutomaticBadgeType({
        name: 'Editor B',
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
      });
      await seedActivities(userId, [SupportedAction.ACTION_PAGE_CREATE]);

      const granted = await evaluateAndGrantForUser(
        userId,
        badgeTypeA._id.toString(),
      );

      expect(granted).toHaveLength(1);
      expect(granted[0].badgeType).toEqual(badgeTypeA._id);

      // BadgeType B was excluded by the scope and must not have been granted.
      const bGrants = await UserBadge.find({
        user: userId,
        badgeType: badgeTypeB._id,
      });
      expect(bGrants).toHaveLength(0);
    });

    it('excludes soft-deleted BadgeTypes from evaluation', async () => {
      const userId = new Types.ObjectId().toHexString();
      const badgeType = await createAutomaticBadgeType({
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 1 }],
      });
      await BadgeType.updateOne(
        { _id: badgeType._id },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      );
      await seedActivities(userId, [SupportedAction.ACTION_PAGE_CREATE]);

      const granted = await evaluateAndGrantForUser(userId);

      expect(granted).toHaveLength(0);
    });
  });

  describe('grantManualBadge', () => {
    it('grants a manual BadgeType and records grantedBy, grantedAt and note (req 3.1, 3.2)', async () => {
      const badgeType = await createManualBadgeType();
      const userId = new Types.ObjectId().toHexString();
      const grantedBy = makeGrantedBy();
      const before = Date.now();

      const result = await grantManualBadge(
        {
          badgeTypeId: badgeType._id.toString(),
          userId,
          note: 'Great community support',
        },
        grantedBy,
      );

      expect(result.user.toString()).toBe(userId);
      expect(result.badgeType).toEqual(badgeType._id);
      expect(result.level).toBeNull();
      expect(result.grantedBy?.toString()).toBe(grantedBy._id);
      expect(result.note).toBe('Great community support');
      expect(result.grantedAt.getTime()).toBeGreaterThanOrEqual(before);

      const stored = await UserBadge.findOne({
        user: userId,
        badgeType: badgeType._id,
      });
      expect(stored).not.toBeNull();
      expect(stored?.grantedBy?.toString()).toBe(grantedBy._id);
      expect(stored?.note).toBe('Great community support');
    });

    it('defaults note to null when omitted', async () => {
      const badgeType = await createManualBadgeType();
      const userId = new Types.ObjectId().toHexString();

      const result = await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId },
        makeGrantedBy(),
      );

      expect(result.note).toBeNull();
    });

    it('rejects granting when the target BadgeType is automatic (req 3.4)', async () => {
      const badgeType = await createAutomaticBadgeType();
      const userId = new Types.ObjectId().toHexString();

      await expect(
        grantManualBadge(
          { badgeTypeId: badgeType._id.toString(), userId },
          makeGrantedBy(),
        ),
      ).rejects.toThrow(BadgeGrantManualCategoryMismatchError);

      const count = await UserBadge.countDocuments({ user: userId });
      expect(count).toBe(0);
    });

    it('rejects granting when the target BadgeType does not exist', async () => {
      const userId = new Types.ObjectId().toHexString();

      await expect(
        grantManualBadge(
          { badgeTypeId: new Types.ObjectId().toString(), userId },
          makeGrantedBy(),
        ),
      ).rejects.toThrow(BadgeTypeNotFoundError);
    });

    it('rejects granting when the target BadgeType is soft-deleted (req 1.5 applies to manual grants too)', async () => {
      const badgeType = await createManualBadgeType();
      await BadgeType.updateOne(
        { _id: badgeType._id },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      );
      const userId = new Types.ObjectId().toHexString();

      await expect(
        grantManualBadge(
          { badgeTypeId: badgeType._id.toString(), userId },
          makeGrantedBy(),
        ),
      ).rejects.toThrow(BadgeTypeNotFoundError);

      const count = await UserBadge.countDocuments({ user: userId });
      expect(count).toBe(0);
    });

    it('grants the same manual BadgeType to two different users independently (req 3.5)', async () => {
      const badgeType = await createManualBadgeType();
      const userIdA = new Types.ObjectId().toHexString();
      const userIdB = new Types.ObjectId().toHexString();

      await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId: userIdA },
        makeGrantedBy(),
      );
      await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId: userIdB },
        makeGrantedBy(),
      );

      const countA = await UserBadge.countDocuments({
        user: userIdA,
        badgeType: badgeType._id,
      });
      const countB = await UserBadge.countDocuments({
        user: userIdB,
        badgeType: badgeType._id,
      });
      expect(countA).toBe(1);
      expect(countB).toBe(1);
    });

    it('rejects a second manual grant of the same BadgeType to the same user with a typed error (not a raw duplicate-key error)', async () => {
      const badgeType = await createManualBadgeType();
      const userId = new Types.ObjectId().toHexString();
      await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId },
        makeGrantedBy(),
      );

      await expect(
        grantManualBadge(
          { badgeTypeId: badgeType._id.toString(), userId },
          makeGrantedBy(),
        ),
      ).rejects.toThrow(BadgeAlreadyGrantedError);

      const count = await UserBadge.countDocuments({
        user: userId,
        badgeType: badgeType._id,
      });
      expect(count).toBe(1);
    });
  });

  describe('User.badgeSummaryCached (task 3.4)', () => {
    it('reflects a newly automatic-granted badge after evaluateAndGrantForUser (req 4.4)', async () => {
      const userId = await createUser();
      const badgeType = await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);

      await evaluateAndGrantForUser(userId);

      const User = await getUserModel();
      const stored = await User.findById(userId);
      expect(stored?.badgeSummaryCached).toHaveLength(1);
      expect(stored?.badgeSummaryCached?.[0]).toMatchObject({
        badgeType: badgeType._id,
        name: 'Bronze',
        iconKey: 'edit',
        level: 1,
      });
    });

    it('shows only the highest level once a higher level in the same series is granted, not a duplicate lower-level entry (req 4.4)', async () => {
      const userId = await createUser();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);
      await evaluateAndGrantForUser(userId); // grants level 1

      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_CREATE,
      ]);
      await evaluateAndGrantForUser(userId); // grants level 2

      const User = await getUserModel();
      const stored = await User.findById(userId);
      expect(stored?.badgeSummaryCached).toHaveLength(1);
      expect(stored?.badgeSummaryCached?.[0]).toMatchObject({
        name: 'Silver',
        level: 2,
      });
    });

    it('reflects a manual grant too (req 4.4)', async () => {
      const userId = await createUser();
      const badgeType = await createManualBadgeType();

      await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId },
        makeGrantedBy(),
      );

      const User = await getUserModel();
      const stored = await User.findById(userId);
      expect(stored?.badgeSummaryCached).toHaveLength(1);
      expect(stored?.badgeSummaryCached?.[0]).toMatchObject({
        badgeType: badgeType._id,
        name: badgeType.name,
        iconKey: badgeType.iconKey,
        level: null,
      });
    });
  });

  describe('ACTION_USER_BADGE_GRANT Activity emission (task 3.4)', () => {
    /** Build a Crowi test double wired to a real EventEmitter for events.activity,
     * mirroring badge-grant-event-listener.integ.ts's own helper of the same shape. */
    function makeCrowiWithActivityDouble(): {
      crowi: Crowi;
      createActivityMock: ReturnType<typeof vi.fn>;
      activityEmitter: EventEmitter;
    } {
      const activityEmitter = new EventEmitter();
      const createActivityMock = vi.fn();
      const crowi = mock<Crowi>({
        activityService: { createActivity: createActivityMock },
        events: {
          activity: activityEmitter as unknown as typeof crowi.events.activity,
        },
      });
      return { crowi, createActivityMock, activityEmitter };
    }

    it('creates an Activity via crowi.activityService.createActivity and emits it for the notification pipeline after an automatic grant (req 5.1)', async () => {
      const userId = await createUser();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);
      const fakeActivity = {
        _id: new Types.ObjectId(),
        action: SupportedAction.ACTION_USER_BADGE_GRANT,
      };
      const { crowi, createActivityMock, activityEmitter } =
        makeCrowiWithActivityDouble();
      createActivityMock.mockResolvedValue(fakeActivity);
      const emitSpy = vi.spyOn(activityEmitter, 'emit');

      await evaluateAndGrantForUser(userId, undefined, crowi);

      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: SupportedAction.ACTION_USER_BADGE_GRANT,
          targetModel: 'UserBadge',
          user: userId,
        }),
      );
      expect(emitSpy).toHaveBeenCalledWith(
        'updated',
        fakeActivity,
        expect.objectContaining({ user: expect.anything() }),
        expect.any(Function),
      );
    });

    it('creates an Activity after a manual grant too (req 5.1)', async () => {
      const userId = await createUser();
      const badgeType = await createManualBadgeType();
      const fakeActivity = {
        _id: new Types.ObjectId(),
        action: SupportedAction.ACTION_USER_BADGE_GRANT,
      };
      const { crowi, createActivityMock, activityEmitter } =
        makeCrowiWithActivityDouble();
      createActivityMock.mockResolvedValue(fakeActivity);
      const emitSpy = vi.spyOn(activityEmitter, 'emit');

      await grantManualBadge(
        { badgeTypeId: badgeType._id.toString(), userId },
        makeGrantedBy(),
        crowi,
      );

      expect(createActivityMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: SupportedAction.ACTION_USER_BADGE_GRANT,
          targetModel: 'UserBadge',
          user: userId,
        }),
      );
      expect(emitSpy).toHaveBeenCalled();
    });

    it('does not throw when crowi is omitted, and still updates the cache (req 5.1 out-of-scope-context safety)', async () => {
      const userId = await createUser();
      await createAutomaticBadgeType();
      await seedActivities(userId, [
        SupportedAction.ACTION_PAGE_CREATE,
        SupportedAction.ACTION_PAGE_UPDATE,
        SupportedAction.ACTION_PAGE_UPDATE,
      ]);

      await expect(evaluateAndGrantForUser(userId)).resolves.toHaveLength(1);

      const User = await getUserModel();
      const stored = await User.findById(userId);
      expect(stored?.badgeSummaryCached).toHaveLength(1);
    });
  });
});
