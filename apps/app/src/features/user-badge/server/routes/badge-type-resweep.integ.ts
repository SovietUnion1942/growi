/**
 * Integration test — task 11.4 gap fill (requirements 1.6, 2.5, 3.3).
 *
 * `badge-type-service.integ.ts`'s "resweep wiring" block (task 9.2) proves
 * requirement 2.5 by calling `updateBadgeType` directly as a function. It
 * never confirms the resweep is actually reachable through a real HTTP
 * request to the admin-facing `PUT /_api/v3/badge-types/:id` route a real
 * admin would use — the same kind of route-vs-service gap task 11.3 closed
 * for the automatic-grant flow (`badge-grant-event-listener-update-page.integ.ts`
 * drives the real `update-page` terminal handler rather than only
 * `evaluateAndGrantForUser`).
 *
 * This file mounts the REAL `./badge-type` router with the REAL
 * `badge-type-service`/`badge-grant-service` (unmocked, backed by an actual
 * MongoDB connection per `vitest.workspace.mts`'s integ setup) and drives it
 * with `supertest`. Only auth middleware is mocked (as in every other route
 * test in this feature) so the test controls admin/non-admin outcomes
 * explicitly without needing a full session/passport setup.
 *
 * Two scenarios:
 * 1. An admin's real PUT request that lowers an automatic BadgeType's
 *    threshold below a user's existing (seeded) edit-activity count
 *    retroactively grants that user a `UserBadge` via the real resweep path
 *    (requirement 2.5, reached end-to-end through the real route this time).
 * 2. A non-admin's real PUT request attempting the same threshold change is
 *    rejected before the service (or any resweep) ever runs — confirming
 *    requirements 1.6/3.3 hold against the REAL (unmocked) service, and that
 *    admin-gating strictly precedes any resweep side effect.
 */

import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { mock } from 'vitest-mock-extended';

import { SupportedAction } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import type UserEvent from '~/server/events/user';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import { prisma } from '~/utils/prisma';

import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import type { BadgeTypeRouteCrowi } from './badge-type';
import { setup } from './badge-type';

/**
 * `updateBadgeSummaryCached` (invoked deep inside the real grant pipeline
 * this file drives end-to-end via `resweepBadgeType`) requires the real
 * Mongoose `User` model to already be registered. Registering it here
 * (mirroring `badge-grant-service.integ.ts`'s own `getUserModel` helper)
 * makes this file self-sufficient when run in isolation, rather than
 * relying on another integ test file in the same vitest worker to have
 * registered `User` first. Without this, `updateBadgeSummaryCached` throws
 * `MissingSchemaError` on every per-user grant, silently swallowed by
 * `resweepBadgeType`'s per-user catch, and the resweep-triggered grant in
 * this file's first test would never actually complete.
 */
async function registerRealUserModel(): Promise<void> {
  if (mongoose.models.User != null) {
    return;
  }
  const crowiMock = mock<Crowi>({
    events: { user: mock<UserEvent>({ on: vi.fn() }) },
  });
  const userModule = await import('~/server/models/user');
  userModule.default(crowiMock);
}

/**
 * Returns the real (registered) `User` model, mirroring
 * `badge-grant-service.integ.ts`'s own `getUserModel` helper. Used by the
 * first test below to assert directly on `User.badgeSummaryCached` after
 * the resweep-triggered grant, so that a thrown (and per-user swallowed)
 * `updateBadgeSummaryCached` failure surfaces as a real assertion failure
 * rather than only a log line -- see this file's header comment.
 */
// biome-ignore lint/suspicious/noExplicitAny: mirrors badge-grant-service.integ.ts's own untyped User model binding.
async function getUserModel(): Promise<any> {
  await registerRealUserModel();
  return mongoose.models.User;
}

type MockUser = { _id: string; admin: boolean };

let currentUser: MockUser | undefined;

vi.mock('~/server/middlewares/login-required', () => ({
  default:
    () =>
    (req: Request & { user?: MockUser }, res: Response, next: NextFunction) => {
      if (currentUser == null) {
        return res.sendStatus(401);
      }
      req.user = currentUser;
      return next();
    },
}));

type AdminRequiredFallback = (
  req: Request & { user?: MockUser },
  res: Response,
  next: NextFunction,
) => void;

// Same faithful model of the real `adminRequiredFactory` branching used by
// `badge-type.spec.ts` and `badge-routes-wiring.spec.ts`: a non-admin caller
// is routed to the fallback (403), never a bare redirect.
vi.mock('~/server/middlewares/admin-required', () => ({
  default:
    (_crowi: unknown, fallback: AdminRequiredFallback | null = null) =>
    (req: Request & { user?: MockUser }, res: Response, next: NextFunction) => {
      if (req.user?.admin === true) {
        return next();
      }
      if (fallback != null) {
        return fallback(req, res, next);
      }
      return res.redirect(req.user == null ? '/login' : '/');
    },
}));

vi.mock('~/server/middlewares/apiv3-form-validator', async () => {
  const { validationResult } = await import('express-validator');
  return {
    apiV3FormValidator: (req: Request, res: Response, next: NextFunction) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const validationErrors = errors.array().map((err) => ({
          message: `${(err as { param?: string }).param}: ${err.msg}`,
          code: 'validation_failed',
        }));
        return (res as unknown as ApiV3Response).apiv3Err(
          validationErrors,
          400,
        );
      }
      return next();
    },
  };
});

vi.mock('~/server/middlewares/add-activity', () => ({
  generateAddActivityMiddleware:
    () => (_req: Request, res: Response, next: NextFunction) => {
      (res as unknown as ApiV3Response).locals.activity = { _id: 'activity-1' };
      next();
    },
}));

function withApiV3Helpers(app: express.Express) {
  app.use((_req, res, next) => {
    (res as unknown as ApiV3Response).apiv3 = (body: unknown, status = 200) =>
      res.status(status).json(body ?? {});
    (res as unknown as ApiV3Response).apiv3Err = (
      err: unknown,
      status = 500,
    ) => {
      const errors = Array.isArray(err) ? err : [err];
      return res.status(status).json({ errors });
    };
    next();
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  withApiV3Helpers(app);

  const crowi: BadgeTypeRouteCrowi = {
    events: { activity: { emit: vi.fn() } },
  };
  const router = setup(crowi);
  app.use('/_api/v3/badge-types', router);
  return { app };
}

const adminUser: MockUser = { _id: 'admin-1', admin: true };
const nonAdminUser: MockUser = { _id: 'user-1', admin: false };

const RESWEEP_ROUTE_TEST_IP = '10.0.0.202';

/** Seeds `count` ACTION_PAGE_UPDATE activities for `userId`. */
async function seedEditActivities(
  userId: string,
  count: number,
): Promise<void> {
  const now = Date.now();
  await prisma.activities.createMany({
    data: Array.from({ length: count }, (_, index) => ({
      id: new Types.ObjectId().toHexString(),
      v: 0,
      action: SupportedAction.ACTION_PAGE_UPDATE,
      target: new Types.ObjectId().toHexString(),
      createdAt: new Date(now + index),
      endpoint: '/test/badge-type-resweep-route',
      ip: RESWEEP_ROUTE_TEST_IP,
      snapshot: {
        id: new Types.ObjectId().toHexString(),
        username: 'testuser',
      },
      userId,
    })),
  });
}

/** Poll until a UserBadge exists for the user, or time out. */
async function waitForUserBadge(
  userId: string,
  maxWaitMs = 5000,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const count = await UserBadge.countDocuments({ user: userId });
    if (count > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

describe('PUT /_api/v3/badge-types/:id (real route + real service, task 11.4)', () => {
  beforeAll(async () => {
    await registerRealUserModel();
  });

  beforeEach(() => {
    currentUser = adminUser;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    currentUser = undefined;
    await BadgeType.deleteMany({});
    await UserBadge.deleteMany({});
    await prisma.activities.deleteMany({
      where: { ip: RESWEEP_ROUTE_TEST_IP },
    });
    await mongoose.connection
      .collection('users')
      .deleteMany({ username: /^badge-resweep-route-test-user-/ });
  });

  it("retroactively grants a badge via resweep when an admin's real PUT request lowers an automatic BadgeType's threshold (req 2.5)", async () => {
    // A real `User` document (not just a bare ObjectId) is required here:
    // `updateBadgeSummaryCached` writes via `User.findByIdAndUpdate`, which
    // silently no-ops against a nonexistent document, so asserting on
    // `badgeSummaryCached` below needs a real row to write onto. Inserted
    // via the raw driver (not the `User` Mongoose model) so this setup does
    // NOT itself register the `User` model as a side effect -- that would
    // mask the very failure mode (`MissingSchemaError` from an
    // unregistered `User` model deep inside `updateBadgeSummaryCached`)
    // this test's `badgeSummaryCached` assertion exists to catch.
    const targetUserObjectId = new Types.ObjectId();
    const targetUserId = targetUserObjectId.toHexString();
    await mongoose.connection.collection('users').insertOne({
      _id: targetUserObjectId,
      name: `Badge Resweep Route Test User ${targetUserId}`,
      username: `badge-resweep-route-test-user-${targetUserId}`,
      email: `${targetUserId}@example.com`,
      password: 'password',
    });
    await seedEditActivities(targetUserId, 5);

    const created = await BadgeType.create({
      name: 'Editor',
      description: 'Awarded for editing pages',
      iconKey: 'edit',
      category: 'automatic',
      levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 100 }],
      createdBy: new Types.ObjectId(),
    });

    // Threshold (100) is above the seeded count (5): no grant yet.
    expect(await UserBadge.find({ user: targetUserId })).toHaveLength(0);

    const { app } = buildApp();
    const res = await request(app)
      .put(`/_api/v3/badge-types/${created._id.toString()}`)
      .send({
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 3 }],
      });

    expect(res.status).toBe(200);

    const granted = await waitForUserBadge(targetUserId);
    expect(granted).toBe(true);

    const grants = await UserBadge.find({ user: targetUserId });
    expect(grants).toHaveLength(1);
    expect(grants[0].level).toBe(1);
    expect(grants[0].badgeType.toString()).toBe(created._id.toString());

    // Closes the test-quality gap the reviewer flagged: without this,
    // `UserBadge.create()` succeeding was the only thing asserted, and the
    // subsequent `updateBadgeSummaryCached()` call (invoked from inside
    // `recordBadgeGrant`, after the `UserBadge` write) could throw
    // `MissingSchemaError` -- caught only by `resweepBadgeType`'s per-user
    // `catch` and logged -- without failing this test. Asserting on
    // `User.badgeSummaryCached` here makes that failure mode a real
    // assertion error instead of a log line a human has to notice.
    const User = await getUserModel();
    const storedUser = await User.findById(targetUserId);
    expect(storedUser?.badgeSummaryCached).toHaveLength(1);
    expect(storedUser?.badgeSummaryCached?.[0]).toMatchObject({
      badgeType: created._id,
      name: 'Bronze',
      iconKey: 'edit',
      level: 1,
    });
  });

  it('rejects a non-admin PUT before the real service (or any resweep) runs, leaving the threshold and activity counts unaffected (req 1.6, 3.3)', async () => {
    currentUser = nonAdminUser;

    const targetUserId = new Types.ObjectId().toHexString();
    await seedEditActivities(targetUserId, 5);

    const created = await BadgeType.create({
      name: 'Editor',
      description: 'Awarded for editing pages',
      iconKey: 'edit',
      category: 'automatic',
      levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 100 }],
      createdBy: new Types.ObjectId(),
    });

    const { app } = buildApp();
    const res = await request(app)
      .put(`/_api/v3/badge-types/${created._id.toString()}`)
      .send({
        levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 3 }],
      });

    expect(res.status).toBe(403);

    // Give any (incorrectly-triggered) fire-and-forget resweep a chance to
    // land before asserting nothing happened.
    await new Promise((resolve) => setTimeout(resolve, 200));

    const unchanged = await BadgeType.findById(created._id);
    expect(unchanged?.levels[0]?.threshold).toBe(100);
    expect(await UserBadge.find({ user: targetUserId })).toHaveLength(0);
  });
});
