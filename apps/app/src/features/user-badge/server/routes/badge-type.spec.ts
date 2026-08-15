/**
 * Unit tests — /badge-types apiv3 route (requirement 1.1-1.6).
 *
 * This route file is self-contained and mountable in isolation (task 5.1
 * builds the route only; wiring into the central apiv3 router is task
 * 9.3). Following the pattern of
 * `features/audit-log-bulk-export/server/routes/apiv3/audit-log-bulk-export.integ.ts`:
 * mount the router directly on a fresh `express()` app, mock
 * `login-required`/`admin-required`/`apiv3-form-validator` so the test
 * controls authn/authz/validation outcomes explicitly, and mock the
 * BadgeTypeService functions (already covered by their own
 * `badge-type-service.integ.ts`) so this test verifies only the route's own
 * responsibilities: middleware wiring, request/response shape, and error
 * mapping.
 */

import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

import {
  BadgeTypeNotFoundError,
  BadgeTypeValidationError,
} from '../services/badge-type-errors';
import type { BadgeTypeRouteCrowi } from './badge-type';

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
// second argument (falling back to a redirect if none was passed — never a
// bare 403). This ensures the route under test must itself wire a fallback
// that produces 403; a regression to a bare `adminRequiredFactory(crowi)`
// call would surface here as a redirect status, not 403.
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

vi.mock('../services/badge-type-service', () => ({
  listBadgeTypes: vi.fn(),
  createBadgeType: vi.fn(),
  updateBadgeType: vi.fn(),
  deleteBadgeType: vi.fn(),
}));

import {
  createBadgeType,
  deleteBadgeType,
  listBadgeTypes,
  updateBadgeType,
} from '../services/badge-type-service';
import { setup } from './badge-type';

const listBadgeTypesMock = vi.mocked(listBadgeTypes);
const createBadgeTypeMock = vi.mocked(createBadgeType);
const updateBadgeTypeMock = vi.mocked(updateBadgeType);
const deleteBadgeTypeMock = vi.mocked(deleteBadgeType);

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

  const activityEmit = vi.fn();
  const crowi: BadgeTypeRouteCrowi = {
    events: { activity: { emit: activityEmit } },
  };
  const router = setup(crowi);
  app.use('/_api/v3/badge-types', router);
  return { app, activityEmit };
}

const adminUser: MockUser = { _id: 'admin-1', admin: true };
const nonAdminUser: MockUser = { _id: 'user-1', admin: false };

const automaticBadgeType = {
  _id: 'bt-1',
  name: 'Editor',
  description: 'Awarded for editing pages',
  iconKey: 'edit',
  category: 'automatic' as const,
  levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 5 }],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'admin-1',
};

describe('/badge-types route', () => {
  beforeEach(() => {
    currentUser = adminUser;
  });

  afterEach(() => {
    vi.clearAllMocks();
    currentUser = undefined;
  });

  describe('GET /', () => {
    it('returns badgeTypes from listBadgeTypes(false) with ApiV3Response shape', async () => {
      listBadgeTypesMock.mockResolvedValueOnce([automaticBadgeType] as never);

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ badgeTypes: [automaticBadgeType] });
      expect(listBadgeTypesMock).toHaveBeenCalledWith(false);
    });

    it('returns 403 when the caller is not an admin', async () => {
      currentUser = nonAdminUser;

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types');

      expect(res.status).toBe(403);
      expect(listBadgeTypesMock).not.toHaveBeenCalled();
    });
  });

  describe('GET /catalog (task 10.3, requirement 4.5)', () => {
    it('returns a minimal { _id, description } catalog for a logged-in non-admin user', async () => {
      currentUser = nonAdminUser;
      listBadgeTypesMock.mockResolvedValueOnce([automaticBadgeType] as never);

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types/catalog');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        badgeTypes: [{ _id: 'bt-1', description: 'Awarded for editing pages' }],
      });
      expect(listBadgeTypesMock).toHaveBeenCalledWith(false);
    });

    it('does not require admin (unlike GET /)', async () => {
      currentUser = nonAdminUser;
      listBadgeTypesMock.mockResolvedValueOnce([]);

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types/catalog');

      expect(res.status).toBe(200);
    });

    it('returns 401 when unauthenticated', async () => {
      currentUser = undefined;

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types/catalog');

      expect(res.status).toBe(401);
      expect(listBadgeTypesMock).not.toHaveBeenCalled();
    });

    it('does not leak admin-only fields (name/iconKey/category/levels/createdBy) in the catalog entries', async () => {
      currentUser = nonAdminUser;
      listBadgeTypesMock.mockResolvedValueOnce([automaticBadgeType] as never);

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types/catalog');

      expect(Object.keys(res.body.badgeTypes[0]).sort()).toEqual([
        '_id',
        'description',
      ]);
    });

    it('returns 500 with ApiV3Response error shape for an unexpected service error', async () => {
      currentUser = nonAdminUser;
      listBadgeTypesMock.mockRejectedValueOnce(new Error('boom'));

      const { app } = buildApp();
      const res = await request(app).get('/_api/v3/badge-types/catalog');

      expect(res.status).toBe(500);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /', () => {
    const validBody = {
      name: 'Editor',
      description: 'Awarded for editing pages',
      iconKey: 'edit',
      category: 'automatic',
      levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold: 5 }],
    };

    it('creates a badge type and returns 201 with ApiV3Response shape', async () => {
      createBadgeTypeMock.mockResolvedValueOnce(automaticBadgeType as never);

      const { app, activityEmit } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send(validBody);

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ badgeType: automaticBadgeType });
      expect(createBadgeTypeMock).toHaveBeenCalledWith(
        {
          name: validBody.name,
          description: validBody.description,
          iconKey: validBody.iconKey,
          category: validBody.category,
          levels: validBody.levels,
        },
        adminUser,
        expect.anything(),
      );
      expect(activityEmit).toHaveBeenCalledWith(
        'update',
        'activity-1',
        expect.objectContaining({ action: 'ADMIN_BADGE_TYPE_CREATE' }),
      );
    });

    it('returns 403 when the caller is not an admin', async () => {
      currentUser = nonAdminUser;

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send(validBody);

      expect(res.status).toBe(403);
      expect(createBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed request body (missing required fields)', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send({ description: 'no name or category' });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
      expect(createBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('returns 400 when category is not automatic/manual', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send({ ...validBody, category: 'bogus' });

      expect(res.status).toBe(400);
      expect(createBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('maps BadgeTypeValidationError from the service to 400', async () => {
      createBadgeTypeMock.mockRejectedValueOnce(
        new BadgeTypeValidationError('levels invalid'),
      );

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send(validBody);

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('returns 500 for an unexpected service error', async () => {
      createBadgeTypeMock.mockRejectedValueOnce(new Error('boom'));

      const { app } = buildApp();
      const res = await request(app)
        .post('/_api/v3/badge-types')
        .send(validBody);

      expect(res.status).toBe(500);
    });
  });

  describe('PUT /:id', () => {
    it('updates a badge type and returns 200 with ApiV3Response shape', async () => {
      const updated = { ...automaticBadgeType, name: 'Editor Pro' };
      updateBadgeTypeMock.mockResolvedValueOnce(updated as never);

      const { app, activityEmit } = buildApp();
      const res = await request(app)
        .put('/_api/v3/badge-types/bt-1')
        .send({ name: 'Editor Pro' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ badgeType: updated });
      expect(updateBadgeTypeMock).toHaveBeenCalledWith(
        'bt-1',
        { name: 'Editor Pro' },
        expect.anything(),
      );
      expect(activityEmit).toHaveBeenCalledWith(
        'update',
        'activity-1',
        expect.objectContaining({ action: 'ADMIN_BADGE_TYPE_UPDATE' }),
      );
    });

    it('does not forward category to the service, even if present in the body', async () => {
      updateBadgeTypeMock.mockResolvedValueOnce(automaticBadgeType as never);

      const { app } = buildApp();
      await request(app)
        .put('/_api/v3/badge-types/bt-1')
        .send({ name: 'Editor Pro', category: 'manual' });

      expect(updateBadgeTypeMock).toHaveBeenCalledWith(
        'bt-1',
        { name: 'Editor Pro' },
        expect.anything(),
      );
    });

    it('returns 403 when the caller is not an admin', async () => {
      currentUser = nonAdminUser;

      const { app } = buildApp();
      const res = await request(app)
        .put('/_api/v3/badge-types/bt-1')
        .send({ name: 'Editor Pro' });

      expect(res.status).toBe(403);
      expect(updateBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('returns 400 for a malformed request body (name is an empty string)', async () => {
      const { app } = buildApp();
      const res = await request(app)
        .put('/_api/v3/badge-types/bt-1')
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(updateBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('maps BadgeTypeNotFoundError from the service to 404', async () => {
      updateBadgeTypeMock.mockRejectedValueOnce(
        new BadgeTypeNotFoundError('not found'),
      );

      const { app } = buildApp();
      const res = await request(app)
        .put('/_api/v3/badge-types/missing')
        .send({ name: 'Editor Pro' });

      expect(res.status).toBe(404);
    });

    it('maps BadgeTypeValidationError from the service to 400', async () => {
      updateBadgeTypeMock.mockRejectedValueOnce(
        new BadgeTypeValidationError('bad levels'),
      );

      const { app } = buildApp();
      const res = await request(app)
        .put('/_api/v3/badge-types/bt-1')
        .send({ levels: [] });

      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /:id', () => {
    it('soft-deletes and returns 200 with { isDeleted: true }', async () => {
      deleteBadgeTypeMock.mockResolvedValueOnce(undefined);

      const { app, activityEmit } = buildApp();
      const res = await request(app).delete('/_api/v3/badge-types/bt-1');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ isDeleted: true });
      expect(deleteBadgeTypeMock).toHaveBeenCalledWith('bt-1');
      expect(activityEmit).toHaveBeenCalledWith(
        'update',
        'activity-1',
        expect.objectContaining({ action: 'ADMIN_BADGE_TYPE_DELETE' }),
      );
    });

    it('returns 403 when the caller is not an admin', async () => {
      currentUser = nonAdminUser;

      const { app } = buildApp();
      const res = await request(app).delete('/_api/v3/badge-types/bt-1');

      expect(res.status).toBe(403);
      expect(deleteBadgeTypeMock).not.toHaveBeenCalled();
    });

    it('maps BadgeTypeNotFoundError from the service to 404', async () => {
      deleteBadgeTypeMock.mockRejectedValueOnce(
        new BadgeTypeNotFoundError('not found'),
      );

      const { app } = buildApp();
      const res = await request(app).delete('/_api/v3/badge-types/missing');

      expect(res.status).toBe(404);
    });
  });
});
