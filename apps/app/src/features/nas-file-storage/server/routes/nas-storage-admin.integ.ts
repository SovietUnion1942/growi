import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IUser } from '@growi/core';
import express from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import request from 'supertest';

import { getInstance } from '^/test/setup/crowi';

import type Crowi from '~/server/crowi';
import { UserStatus } from '~/server/models/user/conts';
import addCustomFunctionToResponse from '~/server/routes/apiv3/response';

import {
  createRootHealthChecker,
  type RootHealthChecker,
} from '../services/root-health-checker';
import { setupNasStorageAdmin } from './nas-storage-admin';

addCustomFunctionToResponse(express);

const seedUser = async (
  username: string,
  admin: boolean,
): Promise<HydratedDocument<IUser>> => {
  const User = mongoose.model<IUser>('User');
  const [user] = await User.insertMany([
    {
      name: username,
      username,
      email: `${username}@example.com`,
      status: UserStatus.STATUS_ACTIVE,
      admin,
    },
  ]);
  return user;
};

const makeChecker = async (
  resolveRoot: () => string | undefined,
): Promise<RootHealthChecker> => {
  const checker = createRootHealthChecker({ resolveRoot });
  await checker.probeOnBoot();
  return checker;
};

describe('setupNasStorageAdmin router (integration)', () => {
  let crowi: Crowi;
  let currentUser: HydratedDocument<IUser> | undefined;

  const buildApp = (health: RootHealthChecker): express.Application => {
    const app = express();
    app.use(express.json());
    app.use((req: express.Request & { user?: unknown }, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use(
      '/_api/v3/admin/nas-storage',
      setupNasStorageAdmin(crowi, { health }),
    );
    return app;
  };

  const getStatus = (app: express.Application) =>
    request(app).get('/_api/v3/admin/nas-storage/status');

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(() => {
    currentUser = undefined;
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await mongoose.model('User').deleteMany({});
  });

  const newRoot = (): Promise<string> =>
    mkdtemp(path.join(tmpdir(), 'nas-adm-'));

  describe('authorization', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const health = await makeChecker(() => undefined);
      const res = await getStatus(buildApp(health));
      expect(res.status).toBe(401);
    });

    it('rejects a non-admin logged-in user with 403', async () => {
      currentUser = await seedUser('nas-plain-user', false);
      const health = await makeChecker(() => undefined);
      const res = await getStatus(buildApp(health));
      expect(res.status).toBe(403);
    });
  });

  describe('status payload (admin)', () => {
    beforeEach(async () => {
      currentUser = await seedUser('nas-admin', true);
    });

    it('reports enabled + ready with the resolved root when the root probes clean', async () => {
      const root = await newRoot();
      const health = await makeChecker(() => root);

      const res = await getStatus(buildApp(health));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        enabled: true,
        status: { state: 'ready', resolvedRoot: root },
        groupRestriction: null,
        maxFileSizeBytes: null,
      });
    });

    it('reports disabled + unconfigured when GROWI_NAS_ROOT is unset', async () => {
      const health = await makeChecker(() => undefined);

      const res = await getStatus(buildApp(health));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        enabled: false,
        status: { state: 'unconfigured' },
        groupRestriction: null,
        maxFileSizeBytes: null,
      });
    });

    it('reports disabled + misconfigured with the reason when the root is a regular file', async () => {
      const dir = await newRoot();
      const filePath = path.join(dir, 'not-a-dir');
      await writeFile(filePath, 'x');
      const health = await makeChecker(() => filePath);

      const res = await getStatus(buildApp(health));

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        enabled: false,
        status: { state: 'misconfigured', reason: 'not-a-directory' },
        groupRestriction: null,
        maxFileSizeBytes: null,
      });
    });

    it('surfaces the configured group restriction and max file size', async () => {
      vi.stubEnv('GROWI_NAS_GROUP', 'team');
      vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '1048576');
      const root = await newRoot();
      const health = await makeChecker(() => root);

      const res = await getStatus(buildApp(health));

      expect(res.status).toBe(200);
      expect(res.body.groupRestriction).toBe('team');
      expect(res.body.maxFileSizeBytes).toBe(1048576);
    });
  });
});
