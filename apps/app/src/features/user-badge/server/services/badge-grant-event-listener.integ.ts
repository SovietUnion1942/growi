/**
 * Integration tests — BadgeGrantService's own `crowi.events.activity`
 * `'updated'` listener (task 3.2).
 *
 * Covers the action filter (only ACTION_PAGE_CREATE/ACTION_PAGE_UPDATE
 * trigger evaluation -- requirement 2.6) and the "threshold newly crossed"
 * grant path (requirements 2.1, 2.2) by emitting directly on a real
 * `EventEmitter` standing in for `crowi.events.activity`, against a real
 * MongoDB (BadgeType/UserBadge) and a real Prisma-backed `activities`
 * collection (`getCumulativeEditCount`'s actual read path).
 *
 * A stronger, full-route proof (hitting the real update-page apiv3 terminal
 * handler end-to-end) lives in
 * `badge-grant-event-listener-update-page.integ.ts`, reusing the harness
 * already established by `update-page.integ.ts`.
 *
 * Design: BadgeGrantService — Event Contract (subscribes
 * `crowi.events.activity` `'updated'`, filters to
 * ACTION_PAGE_CREATE/ACTION_PAGE_UPDATE). research.md: "Architecture
 * Pattern Evaluation" row "`BadgeGrantService` が独自に
 * `crowi.events.activity` を購読" (selected -- `activity.ts` itself is not
 * modified).
 */

import { EventEmitter } from 'node:events';
import { Types } from 'mongoose';
import { mock } from 'vitest-mock-extended';

import { SupportedAction } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import { prisma } from '~/utils/prisma';

import type { IBadgeType } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import { initBadgeGrantEventListener } from './badge-grant-service';

// Sentinel ip so cleanup only ever deletes this suite's seeded activities.
const TEST_IP = '10.0.0.88';

/** Build a Crowi test double wired to a real EventEmitter for events.activity. */
function makeCrowiWithRealActivityEmitter(): {
  crowi: Crowi;
  activityEmitter: EventEmitter;
} {
  const activityEmitter = new EventEmitter();
  const crowi = mock<Crowi>({
    events: {
      // Tier-2 cast (essential-test-patterns): a real EventEmitter is needed
      // so `.on`/`.emit` actually dispatch; only this one field is cast, the
      // rest of the mock stays type-safe via mock<Crowi>().
      activity: activityEmitter as unknown as typeof crowi.events.activity,
    },
  });
  return { crowi, activityEmitter };
}

function makeActivityData(overrides: {
  userId: string;
  action: string;
  createdAt: Date;
}) {
  return {
    id: new Types.ObjectId().toHexString(),
    v: 0,
    action: overrides.action,
    target: new Types.ObjectId().toHexString(),
    createdAt: overrides.createdAt,
    endpoint: '/test/badge-grant-event-listener',
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

async function createAutomaticBadgeType(
  threshold: number,
): Promise<IBadgeType & { _id: Types.ObjectId }> {
  const created = await BadgeType.create({
    name: 'Editor',
    description: 'Awarded for editing pages',
    iconKey: 'edit',
    category: 'automatic',
    levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold }],
    createdBy: new Types.ObjectId(),
  });
  return created.toObject();
}

/** Poll until at least one UserBadge exists for the user, or time out. */
async function waitForUserBadge(
  userId: string,
  maxWaitMs = 2000,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const count = await UserBadge.countDocuments({ user: userId });
    if (count > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return false;
}

describe("BadgeGrantService's crowi.events.activity 'updated' listener", () => {
  beforeAll(async () => {
    await UserBadge.init();
  });

  afterEach(async () => {
    await UserBadge.deleteMany({});
    await BadgeType.deleteMany({});
    await prisma.activities.deleteMany({ where: { ip: TEST_IP } });
  });

  it('does not evaluate/grant when the emitted action is outside ACTION_PAGE_CREATE/ACTION_PAGE_UPDATE (req 2.6)', async () => {
    const userId = new Types.ObjectId().toHexString();
    await createAutomaticBadgeType(1);
    // Cumulative CREATE/UPDATE count already crosses the threshold; only the
    // listener's action filter should be what prevents a grant here.
    await seedActivities(userId, [SupportedAction.ACTION_PAGE_CREATE]);

    const { crowi, activityEmitter } = makeCrowiWithRealActivityEmitter();
    initBadgeGrantEventListener(crowi);

    activityEmitter.emit('updated', {
      action: SupportedAction.ACTION_COMMENT_CREATE,
      userId,
    });

    const gotBadge = await waitForUserBadge(userId, 300);
    expect(gotBadge).toBe(false);
  });

  it('evaluates and grants when ACTION_PAGE_UPDATE is emitted and the threshold is newly crossed (req 2.1, 2.2)', async () => {
    const userId = new Types.ObjectId().toHexString();
    const badgeType = await createAutomaticBadgeType(1);
    // The listener re-derives the cumulative count itself (getCumulativeEditCount);
    // seed the CREATE/UPDATE activity the emitted event is reporting on.
    await seedActivities(userId, [SupportedAction.ACTION_PAGE_UPDATE]);

    const { crowi, activityEmitter } = makeCrowiWithRealActivityEmitter();
    initBadgeGrantEventListener(crowi);

    activityEmitter.emit('updated', {
      action: SupportedAction.ACTION_PAGE_UPDATE,
      userId,
    });

    const gotBadge = await waitForUserBadge(userId);
    expect(gotBadge).toBe(true);

    const stored = await UserBadge.findOne({ user: userId });
    expect(stored).toMatchObject({
      badgeType: badgeType._id,
      level: 1,
      grantedBy: null,
    });
  });

  it('evaluates and grants when ACTION_PAGE_CREATE is emitted (req 2.1, 2.2)', async () => {
    const userId = new Types.ObjectId().toHexString();
    await createAutomaticBadgeType(1);
    await seedActivities(userId, [SupportedAction.ACTION_PAGE_CREATE]);

    const { crowi, activityEmitter } = makeCrowiWithRealActivityEmitter();
    initBadgeGrantEventListener(crowi);

    activityEmitter.emit('updated', {
      action: SupportedAction.ACTION_PAGE_CREATE,
      userId,
    });

    const gotBadge = await waitForUserBadge(userId);
    expect(gotBadge).toBe(true);
  });

  it('does not throw and does not grant when the payload carries no userId', async () => {
    await createAutomaticBadgeType(1);

    const { crowi, activityEmitter } = makeCrowiWithRealActivityEmitter();
    initBadgeGrantEventListener(crowi);

    expect(() => {
      activityEmitter.emit('updated', {
        action: SupportedAction.ACTION_PAGE_UPDATE,
        userId: null,
      });
    }).not.toThrow();

    const count = await UserBadge.countDocuments({});
    expect(count).toBe(0);
  });
});
