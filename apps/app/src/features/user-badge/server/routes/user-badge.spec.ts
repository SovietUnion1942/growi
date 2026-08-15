/**
 * Unit tests — /user-badges apiv3 route (requirements 3.1-3.5, 4.3).
 *
 * This route file is self-contained and mountable in isolation (task 5.2
 * builds the route only; wiring into the central apiv3 router is task
 * 9.3). Following the same pattern as `badge-type.spec.ts` (task 5.1):
 * mount the router directly on a fresh `express()` app, mock
 * `login-required`/`admin-required`/`apiv3-form-validator`/`add-activity`
 * so the test controls authn/authz/validation/audit outcomes explicitly,
 * and mock the BadgeGrantService functions (already covered by their own
 * `badge-grant-service.integ.ts`) so this test verifies only the route's
 * own responsibilities: middleware wiring, request/response shape, and
 * error mapping.
 */

import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

import {
  BadgeAlreadyGrantedError,
  BadgeGrantManualCategoryMismatchError,
  BadgeTypeNotFoundError,
} from '../services/badge-type-errors';
import type { UserBadgeRouteCrowi } from './user-badge';

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

// Faithfully models the real `adminRequiredFactory`'s branching
// (apps/app/src/server/middlewares/admin-required.ts): when the caller is
// not a logged-in admin, it invokes whatever `fallback` was passed as the
// second argument (falling back to a redirect if none was passed -- never a
// bare 403). This ensures the route under test must itself wire a fallback
// that produces 403; a regression to a bare `adminRequiredFactory(crowi)`
// call would surface here as a redirect status, not 403 (this is the exact
// bug that task 5.1's first attempt shipped -- see badge-type.ts).
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
    () => (req: Request, res: Response, next: NextFunction) => {
      (res as unknown as ApiV3Response).locals.activity = { _id: 'activity-1' };
      next();
    },
}));

vi.mock('../services/badge-grant-service', () => ({
  listUserBadges: vi.fn(),
  grantManualBadge: vi.fn(),
}));

import {
  grantManualBadge,
  listUserBadges,
} from '../services/badge-grant-service';
import { setup } from './user-badge';

const listUserBadgesMock = vi.mocked(listUserBadges);
const grantManualBadgeMock = vi.mocked(grantManualBadge);

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

  const crowi: UserBadgeRouteCrowi = {};
  const router = setup(crowi);
  app.use('/_api/v3/user-badges', router);
  return { app };
}

const adminUser: MockUser = { _id: 'admin-1', admin: true };
const nonAdminUser: MockUser = { _id: 'user-1', admin: false };

const grantedUserBadge = {
  _id: 'ub-1',
  user: 'user-2',
  badgeType: {
    _id: 'bt-1',
    name: 'Community Helper',
    description: 'Awarded for community support',
    iconKey: 'heart',
    category: 'manual' as const,
    levels: [],
    isDeleted: false,
    deletedAt: null,
    createdBy: 'admin-1',
  },
  level: null,
  grantedAt: '2026-08-15T00:00:00.000Z',
  grantedBy: 'admin-1',
  note: 'Great community support',
};

describe('/user-badges route', () => {
  beforeEach(() => {
    currentUser = nonAdminUser;
  });

  afterEach(() => {
    vi.clearAllMocks();
    currentUser = undefined;
  });

  describe('GET /', () => {
    it('returns userBadges from listUserBadges(targetUserId) for a logged-in non-admin user', async () => {
      listUserBadgesMock.mockResolvedValueOnce([grantedUserBadge] as never);

      const { app } = buildApp();
      const res = await request(app)
        .get('/_api/v3/user-badges')
        .query({ targetUserId: 'user-2' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ userBadges: [grantedUserBadge] });
      expect(listUserBadgesMock).toHaveBeenCalledWith('user-2');
    });

    it('returns 401 when the caller is not logged in', async () => {
      currentUser = undefined;

      const { app } = buildApp();
      const res = await request(app)
        .get('/_api/v3/user-badges')
        .query({ targetUserId: 'user-2' });

      expect(res.status).toBe(401);
      expect(listUserBadgesMock).not.toHaveBeenCalled();
    });

    it('returns 400 when targetUserId is missing', async () => {
      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/user-badges');

      expect(res.status).toBe(400);
      expect(listUserBadgesMock).not.toHaveBeenCalled();
    });

    it('returns 400 when targetUserId is an empty string', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .get('/_api/v3/user-badges')
        .query({ targetUserId: '' });

      expect(res.status).toBe(400);
      expect(listUserBadgesMock).not.toHaveBeenCalled();
    });
  });

  describe('POST /', () => {
    const validBody = {
      badgeTypeId: 'bt-1',
      userId: 'user-2',
      note: 'Great community support',
    };

    beforeEach(() => {
      currentUser = adminUser;
    });

    it('grants a badge and returns 201 with ApiV3Response shape', async () => {
      grantManualBadgeMock.mockResolvedValueOnce(grantedUserBadge as never);

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ userBadge: grantedUserBadge });
      expect(grantManualBadgeMock).toHaveBeenCalledWith(
        {
          badgeTypeId: validBody.badgeTypeId,
          userId: validBody.userId,
          note: validBody.note,
        },
        adminUser,
        expect.anything(),
      );
    });

    it('returns 403 when the caller is not an admin (req 3.3)', async () => {
      currentUser = nonAdminUser;

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(403);
      expect(grantManualBadgeMock).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed request body (missing required fields)', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send({ note: 'no badgeTypeId or userId' });

      expect(res.status).toBe(400);
      expect(grantManualBadgeMock).not.toHaveBeenCalled();
    });

    it('maps BadgeGrantManualCategoryMismatchError from the service to 422 (automatic-category badgeTypeId, req 3.4)', async () => {
      grantManualBadgeMock.mockRejectedValueOnce(
        new BadgeGrantManualCategoryMismatchError(
          'Automatic BadgeTypes can only be granted by threshold evaluation, not manually.',
        ),
      );

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(422);
      expect(res.body.errors).toBeDefined();
    });

    it('maps BadgeTypeNotFoundError from the service to 404', async () => {
      grantManualBadgeMock.mockRejectedValueOnce(
        new BadgeTypeNotFoundError('not found'),
      );

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(404);
    });

    it('maps BadgeAlreadyGrantedError from the service to 409', async () => {
      grantManualBadgeMock.mockRejectedValueOnce(
        new BadgeAlreadyGrantedError('already granted'),
      );

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(409);
    });

    it('returns 500 for an unexpected service error', async () => {
      grantManualBadgeMock.mockRejectedValueOnce(new Error('boom'));

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/user-badges')
        .send(validBody);

      expect(res.status).toBe(500);
    });
  });
});
