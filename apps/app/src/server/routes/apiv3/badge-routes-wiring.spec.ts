/**
 * Wiring test — task 9.3: badge-type/user-badge routes registered on the
 * central apiv3 router (`./index.js`).
 *
 * Booting `./index.js`'s real `setup(crowi, app)` end-to-end is not
 * feasible in a unit test: it eagerly wires ~40 unrelated feature routers,
 * several of which destructure deep, undocumented shapes off `crowi`
 * (e.g. `notification-setting.js` does `const { GlobalNotificationSetting }
 * = crowi.models`) that would require a near-complete mock of the whole
 * Crowi instance to avoid throwing — the same "no unit-test infrastructure
 * for the app bootstrap" wall task 9.1 hit for `crowi/index.ts`. So this
 * test proves the two claims that matter for this task without booting the
 * whole file:
 *
 * 1. Source-level proof the mount lines actually exist in `./index.js`, at
 *    the exact router (`routerForAdmin` vs `router`) and path this task
 *    requires. A regression that removes or misplaces a mount line (e.g.
 *    moves `/user-badges` onto `routerForAdmin`, which would silently
 *    admin-gate the GET endpoint) fails this test.
 * 2. HTTP-level proof that, when the REAL route files (`badge-type.ts` /
 *    `user-badge.ts`, unmocked) are mounted at those exact extracted paths
 *    on a bare Express app, a request actually reaches the route's own
 *    auth middleware rather than 404ing — the same "reaching auth
 *    middleware is proof of wiring" signal the task's testing guidance
 *    describes, applied to the specific path each router is mounted at in
 *    `./index.js`. This also confirms the mount points match each route's
 *    actual internal auth shape: `/badge-types` is admin-gated for every
 *    verb (mounted under `routerForAdmin` is consistent with that), while
 *    `/user-badges` GET is available to any logged-in user and only POST
 *    is admin-gated (mounted under the general `router`, not
 *    `routerForAdmin`, is required for GET to stay reachable by non-admins).
 */

import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

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

vi.mock('~/server/middlewares/admin-required', () => ({
  default:
    (
      _crowi: unknown,
      fallback:
        | ((
            req: Request & { user?: MockUser },
            res: Response,
            next: NextFunction,
          ) => void)
        | null = null,
    ) =>
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
        return (res as unknown as ApiV3Response).apiv3Err(
          errors.array().map((err) => ({
            message: `${(err as { param?: string }).param}: ${err.msg}`,
            code: 'validation_failed',
          })),
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

vi.mock(
  '../../../features/user-badge/server/services/badge-type-service',
  () => ({
    listBadgeTypes: vi.fn().mockResolvedValue([]),
    createBadgeType: vi.fn(),
    updateBadgeType: vi.fn(),
    deleteBadgeType: vi.fn(),
  }),
);

vi.mock(
  '../../../features/user-badge/server/services/badge-grant-service',
  () => ({
    listUserBadges: vi.fn().mockResolvedValue([]),
    grantManualBadge: vi.fn(),
  }),
);

import { setup as setupBadgeType } from '~/features/user-badge/server/routes/badge-type';
import { setup as setupUserBadge } from '~/features/user-badge/server/routes/user-badge';

const INDEX_PATH = path.resolve(import.meta.dirname, 'index.js');
const indexSource = fs.readFileSync(INDEX_PATH, 'utf-8');

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

const adminUser: MockUser = { _id: 'admin-1', admin: true };
const nonAdminUser: MockUser = { _id: 'user-1', admin: false };

afterEach(() => {
  currentUser = undefined;
  vi.clearAllMocks();
});

describe('index.js source: badge route mount lines (task 9.3)', () => {
  it('mounts /badge-types on routerForAdmin using the badge-type route setup', () => {
    expect(indexSource).toMatch(
      /routerForAdmin\.use\(\s*['"]\/badge-types['"]\s*,\s*setupBadgeType\(crowi\)\s*\)/,
    );
  });

  it('imports setupBadgeType from the badge-type route file', () => {
    expect(indexSource).toMatch(
      /import\s*\{\s*setup as setupBadgeType\s*\}\s*from\s*['"]~\/features\/user-badge\/server\/routes\/badge-type['"]/,
    );
  });

  it('mounts /user-badges on the general router (not routerForAdmin) using the user-badge route setup', () => {
    expect(indexSource).toMatch(
      /(?<!For)router\.use\(\s*['"]\/user-badges['"]\s*,\s*setupUserBadge\(crowi\)\s*\)/,
    );
    // Guard against the mixed-auth route being accidentally admin-gated at
    // the mount level, which would 403 the GET endpoint for non-admins.
    expect(indexSource).not.toMatch(
      /routerForAdmin\.use\(\s*['"]\/user-badges['"]/,
    );
  });

  it('imports setupUserBadge from the user-badge route file', () => {
    expect(indexSource).toMatch(
      /import\s*\{\s*setup as setupUserBadge\s*\}\s*from\s*['"]~\/features\/user-badge\/server\/routes\/user-badge['"]/,
    );
  });
});

describe('HTTP reachability at the exact index.js mount paths (task 9.3)', () => {
  describe('/badge-types (mounted under routerForAdmin)', () => {
    function buildApp() {
      const app = express();
      app.use(express.json());
      withApiV3Helpers(app);
      app.use(
        '/badge-types',
        setupBadgeType({
          events: { activity: { emit: vi.fn() } },
          // Unused by this suite: every request here is JSON, so multer's
          // uploads.single('file') (task 13.3) never touches the
          // filesystem — only present to satisfy BadgeTypeRouteCrowi's type.
          tmpDir: '/tmp/',
        }),
      );
      return app;
    }

    it('reaches the route (401), not a generic 404, when unauthenticated', async () => {
      currentUser = undefined;
      const res = await request(buildApp()).get('/badge-types');
      expect(res.status).toBe(401);
    });

    it('reaches admin-gating (403) for a logged-in non-admin, confirming every verb is admin-only', async () => {
      currentUser = nonAdminUser;
      const res = await request(buildApp()).get('/badge-types');
      expect(res.status).toBe(403);
    });

    it('reaches the real handler for a logged-in admin', async () => {
      currentUser = adminUser;
      const res = await request(buildApp()).get('/badge-types');
      expect(res.status).toBe(200);
    });
  });

  describe('/user-badges (mounted under the general router)', () => {
    function buildApp() {
      const app = express();
      app.use(express.json());
      withApiV3Helpers(app);
      app.use('/user-badges', setupUserBadge({}));
      return app;
    }

    it('GET reaches the route (401), not a generic 404, when unauthenticated', async () => {
      currentUser = undefined;
      const res = await request(buildApp()).get('/user-badges').query({
        targetUserId: 'user-2',
      });
      expect(res.status).toBe(401);
    });

    it('GET reaches the real handler for a logged-in non-admin (mixed auth: GET is not admin-only)', async () => {
      currentUser = nonAdminUser;
      const res = await request(buildApp()).get('/user-badges').query({
        targetUserId: 'user-2',
      });
      expect(res.status).toBe(200);
    });

    it('POST reaches admin-gating (403) for a logged-in non-admin (mixed auth: POST is admin-only)', async () => {
      currentUser = nonAdminUser;
      const res = await request(buildApp()).post('/user-badges').send({
        userId: 'user-2',
        badgeTypeId: 'bt-1',
      });
      expect(res.status).toBe(403);
    });
  });
});
