import type { IUser } from '@growi/core';
import express from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import request from 'supertest';

import { getInstance } from '^/test/setup/crowi';

import ExternalUserGroup from '~/features/external-user-group/server/models/external-user-group';
import ExternalUserGroupRelation from '~/features/external-user-group/server/models/external-user-group-relation';
import type Crowi from '~/server/crowi';
import { UserStatus } from '~/server/models/user/conts';
import UserGroup from '~/server/models/user-group';
import UserGroupRelation from '~/server/models/user-group-relation';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

import { createNasAccessMiddleware } from './nas-access';

const GROUP_NAME = 'nas-users';

const seedUser = async (username: string): Promise<HydratedDocument<IUser>> => {
  const User = mongoose.model<IUser>('User');
  const [user] = await User.insertMany([
    {
      name: username,
      username,
      email: `${username}@example.com`,
      status: UserStatus.STATUS_ACTIVE,
    },
  ]);
  return user;
};

describe('nas-access middleware (integration)', () => {
  let crowi: Crowi;

  // Injected into req.user by the test middleware below (simulates passport).
  let currentUser: HydratedDocument<IUser> | undefined;

  const buildApp = (): express.Application => {
    const app = express();
    app.use(express.json());

    // Re-create the apiv3 response helpers (mimics the real apiv3 middleware).
    app.use((_req, res: ApiV3Response, next) => {
      res.apiv3 = (data?: unknown) => res.json(data);
      res.apiv3Err = (error: unknown, statusCode?: number) => {
        const status = statusCode ?? (Array.isArray(error) ? 400 : 500);
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? (error as { code?: unknown }).code
            : undefined;
        return res.status(status).json({ code });
      };
      next();
    });

    // Simulate passport: attach req.user when a current user is set.
    app.use((req: express.Request & { user?: unknown }, _res, next) => {
      req.user = currentUser;
      next();
    });

    const router = express.Router();
    router.use(createNasAccessMiddleware(crowi));
    router.get('/', (_req, res) => res.json({ ok: true }));

    // Mount under an /_api/ base to match the real apiv3 mount point.
    app.use('/_api/v3/nas-test', router);
    return app;
  };

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(() => {
    currentUser = undefined;
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await Promise.all([
      mongoose.model('User').deleteMany({}),
      UserGroup.deleteMany({}),
      UserGroupRelation.deleteMany({}),
      ExternalUserGroup.deleteMany({}),
      ExternalUserGroupRelation.deleteMany({}),
    ]);
  });

  it('returns 401 for an unauthenticated request', async () => {
    const res = await request(buildApp()).get('/_api/v3/nas-test/');
    expect(res.status).toBe(401);
  });

  it('allows any logged-in user when no group is configured', async () => {
    currentUser = await seedUser('alice');

    const res = await request(buildApp()).get('/_api/v3/nas-test/');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('allows a logged-in user who is a member of the configured internal group', async () => {
    vi.stubEnv('GROWI_NAS_GROUP', GROUP_NAME);
    const user = await seedUser('member');
    const group = await UserGroup.create({ name: GROUP_NAME });
    await UserGroupRelation.create({
      relatedGroup: group._id,
      relatedUser: user._id,
    });
    currentUser = user;

    const res = await request(buildApp()).get('/_api/v3/nas-test/');

    expect(res.status).toBe(200);
  });

  it('denies a logged-in user who is not a member of the configured group', async () => {
    vi.stubEnv('GROWI_NAS_GROUP', GROUP_NAME);
    await UserGroup.create({ name: GROUP_NAME });
    currentUser = await seedUser('outsider');

    const res = await request(buildApp()).get('/_api/v3/nas-test/');

    expect(res.status).toBe(403);
  });

  it('allows a logged-in user who is a member of an external group with the configured name', async () => {
    vi.stubEnv('GROWI_NAS_GROUP', GROUP_NAME);
    const user = await seedUser('ext-member');
    const extGroup = await ExternalUserGroup.create({
      name: GROUP_NAME,
      externalId: 'ext-1',
      provider: 'ldap',
    });
    await ExternalUserGroupRelation.create({
      relatedGroup: extGroup._id,
      relatedUser: user._id,
    });
    currentUser = user;

    const res = await request(buildApp()).get('/_api/v3/nas-test/');

    expect(res.status).toBe(200);
  });

  it('denies when the configured group name matches no existing group (misconfiguration)', async () => {
    vi.stubEnv('GROWI_NAS_GROUP', 'no-such-group');
    currentUser = await seedUser('anyone');

    const res = await request(buildApp()).get('/_api/v3/nas-test/');

    expect(res.status).toBe(403);
  });
});
