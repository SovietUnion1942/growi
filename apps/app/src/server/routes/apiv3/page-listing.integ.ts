import type { IUser } from '@growi/core';
import express from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import request from 'supertest';

import { getInstance } from '^/test/setup/crowi';

import type Crowi from '~/server/crowi';
import type { PageDocument, PageModel } from '~/server/models/page';

import type { ApiV3Response } from './interfaces/apiv3-response';

interface TestRequest extends express.Request {
  user?: HydratedDocument<IUser>;
  crowi?: Crowi;
}

const seedUser = async (username: string): Promise<HydratedDocument<IUser>> => {
  const User = mongoose.model<IUser>('User');
  const [user] = await User.insertMany([
    { name: username, username, email: `${username}@example.com` },
  ]);
  return user;
};

interface SeedWipPageOptions {
  path: string;
  creator: HydratedDocument<IUser>;
  lastUpdateUser: HydratedDocument<IUser>;
}

const seedWipPage = async (
  options: SeedWipPageOptions,
): Promise<HydratedDocument<PageDocument>> => {
  const Page = mongoose.model<HydratedDocument<PageDocument>, PageModel>(
    'Page',
  );
  const [page] = await Page.insertMany([
    {
      path: options.path,
      creator: options.creator._id,
      lastUpdateUser: options.lastUpdateUser._id,
      wip: true,
    },
  ]);
  return page;
};

describe('GET /page-listing/my-wip', () => {
  let app: express.Application;
  let crowi: Crowi;

  // Injected into req.user by middleware below; undefined simulates an
  // unauthenticated (guest) request.
  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;

    app = express();
    app.use(express.json());

    // Re-create the apiv3 response helpers used by the real router.
    app.use((_req, res: ApiV3Response, next) => {
      res.apiv3 = (data: unknown) => res.json(data);
      res.apiv3Err = (error: unknown, statusCode?: number) => {
        const status = statusCode ?? (Array.isArray(error) ? 400 : 500);
        const message =
          typeof error === 'object' &&
          error !== null &&
          'message' in error &&
          typeof error.message === 'string'
            ? error.message
            : String(error);
        return res.status(status).json({ error: message });
      };
      next();
    });

    // Inject crowi and the session user into the request, mirroring what the
    // real passport session middleware would do.
    app.use((req: TestRequest, _res, next) => {
      req.crowi = crowi;
      req.user = currentUser;
      next();
    });

    // Mount the real router at the real apiv3 base path so loginRequired's
    // `/^\/_api\/.+$/` guest-rejection branch behaves exactly as in production.
    const { default: routerFactory } = await import('./page-listing');
    app.use('/_api/v3/page-listing', routerFactory(crowi));
  });

  afterEach(async () => {
    await Promise.all([
      mongoose.model('Page').deleteMany({}),
      mongoose.model('User').deleteMany({}),
    ]);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(app).get('/_api/v3/page-listing/my-wip');

    // loginRequiredFactory's default (isGuestAllowed = false) rejects an
    // unauthenticated request under an `/_api/...` base path with 403 rather
    // than 401 — this is the shared middleware's existing behavior, not a
    // choice made by this route.
    expect(res.status).toBe(403);
  });

  it('returns only the requesting user own WIP pages', async () => {
    const owner = await seedUser('wip-owner');
    const otherUser = await seedUser('wip-other');
    const ownWipPage = await seedWipPage({
      path: '/own-wip',
      creator: owner,
      lastUpdateUser: owner,
    });
    const otherWipPage = await seedWipPage({
      path: '/other-wip',
      creator: otherUser,
      lastUpdateUser: otherUser,
    });
    const publishedPage = await seedWipPage({
      path: '/published',
      creator: owner,
      lastUpdateUser: owner,
    });
    await mongoose
      .model('Page')
      .updateOne({ _id: publishedPage._id }, { $set: { wip: false } });
    currentUser = owner;

    const res = await request(app).get('/_api/v3/page-listing/my-wip');

    expect(res.status).toBe(200);
    const ids = (res.body.pages as { _id: string }[]).map((p) => p._id);
    expect(ids).toContain(ownWipPage._id.toString());
    expect(ids).not.toContain(otherWipPage._id.toString());
    expect(ids).not.toContain(publishedPage._id.toString());
  });
});

const GRANT_PUBLIC = 1;
const GRANT_OWNER = 4;

interface SeedPageOptions {
  path: string;
  creator: HydratedDocument<IUser>;
  updatedAt: Date;
  grant?: number;
  grantedUsers?: mongoose.Types.ObjectId[];
  isEmpty?: boolean;
  status?: string;
}

const seedPage = async (
  options: SeedPageOptions,
): Promise<HydratedDocument<PageDocument>> => {
  const Page = mongoose.model<HydratedDocument<PageDocument>, PageModel>(
    'Page',
  );
  const [page] = await Page.insertMany([
    {
      path: options.path,
      creator: options.creator._id,
      lastUpdateUser: options.creator._id,
      revision: new mongoose.Types.ObjectId(),
      grant: options.grant ?? GRANT_PUBLIC,
      grantedUsers: options.grantedUsers,
      isEmpty: options.isEmpty ?? false,
      descendantCount: 0,
      status: options.status,
      updatedAt: options.updatedAt,
    },
  ]);
  return page;
};

const buildApp = async (
  crowi: Crowi,
  getUser: () => HydratedDocument<IUser> | undefined,
): Promise<express.Application> => {
  const app = express();
  app.use(express.json());
  app.use((_req, res: ApiV3Response, next) => {
    res.apiv3 = (data: unknown) => res.json(data);
    res.apiv3Err = (error: unknown, statusCode?: number) => {
      const status = statusCode ?? (Array.isArray(error) ? 400 : 500);
      const message =
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof error.message === 'string'
          ? error.message
          : String(error);
      return res.status(status).json({ error: message });
    };
    next();
  });
  app.use((req: TestRequest, _res, next) => {
    req.crowi = crowi;
    req.user = getUser();
    next();
  });
  const { default: routerFactory } = await import('./page-listing');
  app.use('/_api/v3/page-listing', routerFactory(crowi));
  return app;
};

describe('GET /page-listing/recent-under-path', () => {
  let app: express.Application;
  let crowi: Crowi;
  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;
    app = await buildApp(crowi, () => currentUser);
  });

  afterEach(async () => {
    await Promise.all([
      mongoose.model('Page').deleteMany({}),
      mongoose.model('User').deleteMany({}),
    ]);
  });

  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app).get(
      '/_api/v3/page-listing/recent-under-path?prefix=/classroom',
    );
    expect(res.status).toBe(403);
  });

  it('returns viewer-filtered pages under the prefix, newest-first', async () => {
    const viewer = await seedUser('recent-viewer');
    const owner = await seedUser('recent-owner');
    const older = await seedPage({
      path: '/classroom/older',
      creator: viewer,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = await seedPage({
      path: '/classroom/newer',
      creator: viewer,
      updatedAt: new Date('2026-01-05T00:00:00Z'),
    });
    const secret = await seedPage({
      path: '/classroom/secret',
      creator: owner,
      updatedAt: new Date('2026-01-09T00:00:00Z'),
      grant: GRANT_OWNER,
      grantedUsers: [owner._id],
    });
    currentUser = viewer;

    const res = await request(app).get(
      '/_api/v3/page-listing/recent-under-path?prefix=/classroom',
    );

    expect(res.status).toBe(200);
    const paths = (res.body.pages as { path: string }[]).map((p) => p.path);
    expect(paths).toEqual(['/classroom/newer', '/classroom/older']);
    const ids = (res.body.pages as { _id: string }[]).map((p) => p._id);
    expect(ids).not.toContain(secret._id.toString());
    expect(ids).toContain(newer._id.toString());
    expect(ids).toContain(older._id.toString());
  });

  it('uses the default Classroom prefix when prefix is omitted', async () => {
    const viewer = await seedUser('recent-default-viewer');
    await seedPage({
      path: '/classroom/from-default',
      creator: viewer,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    await seedPage({
      path: '/elsewhere/nope',
      creator: viewer,
      updatedAt: new Date('2026-01-03T00:00:00Z'),
    });
    currentUser = viewer;

    const res = await request(app).get(
      '/_api/v3/page-listing/recent-under-path',
    );

    expect(res.status).toBe(200);
    const paths = (res.body.pages as { path: string }[]).map((p) => p.path);
    expect(paths).toEqual(['/classroom/from-default']);
  });

  it('rejects a malformed prefix (no leading slash) with 400', async () => {
    const viewer = await seedUser('recent-bad-prefix');
    currentUser = viewer;

    const res = await request(app).get(
      '/_api/v3/page-listing/recent-under-path?prefix=classroom',
    );

    expect(res.status).toBe(400);
  });
});

describe('POST /page-listing/resolve-paths', () => {
  let app: express.Application;
  let crowi: Crowi;
  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;
    app = await buildApp(crowi, () => currentUser);
  });

  afterEach(async () => {
    await Promise.all([
      mongoose.model('Page').deleteMany({}),
      mongoose.model('User').deleteMany({}),
    ]);
  });

  it('rejects an unauthenticated request with 403', async () => {
    const res = await request(app)
      .post('/_api/v3/page-listing/resolve-paths')
      .send({ paths: ['/a'] });
    expect(res.status).toBe(403);
  });

  it('resolves paths in input order, dropping missing and forbidden ones', async () => {
    const viewer = await seedUser('resolve-viewer');
    const owner = await seedUser('resolve-owner');
    const first = await seedPage({
      path: '/pinned/first',
      creator: viewer,
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });
    const second = await seedPage({
      path: '/pinned/second',
      creator: viewer,
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
    const secret = await seedPage({
      path: '/pinned/secret',
      creator: owner,
      updatedAt: new Date('2026-01-03T00:00:00Z'),
      grant: GRANT_OWNER,
      grantedUsers: [owner._id],
    });
    currentUser = viewer;

    const res = await request(app)
      .post('/_api/v3/page-listing/resolve-paths')
      .send({
        paths: [
          '/pinned/second',
          '/pinned/missing',
          '/pinned/secret',
          '/pinned/first',
        ],
      });

    expect(res.status).toBe(200);
    const paths = (res.body.pages as { path: string }[]).map((p) => p.path);
    expect(paths).toEqual(['/pinned/second', '/pinned/first']);
    const ids = (res.body.pages as { _id: string }[]).map((p) => p._id);
    expect(ids).not.toContain(secret._id.toString());
    expect(ids).toEqual([second._id.toString(), first._id.toString()]);
  });

  it('rejects a body whose paths is not an array with 400', async () => {
    const viewer = await seedUser('resolve-notarray');
    currentUser = viewer;

    const res = await request(app)
      .post('/_api/v3/page-listing/resolve-paths')
      .send({ paths: '/pinned/first' });

    expect(res.status).toBe(400);
  });

  it('rejects a body whose paths exceeds the cap with 400', async () => {
    const viewer = await seedUser('resolve-overcap');
    currentUser = viewer;

    const res = await request(app)
      .post('/_api/v3/page-listing/resolve-paths')
      .send({ paths: Array.from({ length: 101 }, (_, i) => `/p/${i}`) });

    expect(res.status).toBe(400);
  });
});
