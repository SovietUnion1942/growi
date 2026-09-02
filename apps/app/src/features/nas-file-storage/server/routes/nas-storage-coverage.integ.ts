import { mkdir, mkdtemp, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
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
import addCustomFunctionToResponse from '~/server/routes/apiv3/response';

import { createNasStorageService } from '../services/nas-storage-service';
import {
  createRootHealthChecker,
  type RootHealthChecker,
} from '../services/root-health-checker';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import { setupNasStorage } from './nas-storage';

addCustomFunctionToResponse(express);

/**
 * Task 6.1 coverage-gap integration tests for `setupNasStorage`.
 *
 * These go through the REAL `setupNasStorage` router (not a stub) and fill the
 * scenarios the task-3.x suites did not already assert:
 *   - `DELETE /entries` on a non-empty folder WITHOUT `recursive` -> 409, and
 *     WITH `recursive=true` -> 200 + the folder is gone (API contract / Req 5.3)
 *   - `PUT /entries` (move) with an out-of-root `from` or `to` -> 422 (Req 3.5)
 *   - `POST /folders` with an out-of-root `parentDir` -> 422 (Req 3.5)
 *   - `nasAccess` is applied uniformly to every method, not just GET: a write
 *     method (POST/PATCH/DELETE) unauthenticated -> 401, and a logged-in
 *     non-member of `GROWI_NAS_GROUP` on a write method -> 403 (Req 6.2/6.3)
 *
 * Requirements: 3.5, 5.3, 6.2, 6.3, 7.3
 */

const GROUP_NAME = 'nas-writers';

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

const makeReadyChecker = async (root: string): Promise<RootHealthChecker> => {
  const checker = createRootHealthChecker({ resolveRoot: () => root });
  await checker.probeOnBoot();
  return checker;
};

const pathExists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

describe('setupNasStorage router — task 6.1 coverage gaps', () => {
  let crowi: Crowi;
  let currentUser: HydratedDocument<IUser> | undefined;

  const buildApp = (
    router: ReturnType<typeof express.Router>,
  ): express.Application => {
    const app = express();
    app.use(express.json());
    app.use((req: express.Request & { user?: unknown }, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use('/_api/v3/nas-storage', router);
    return app;
  };

  const buildReadyApp = async (root: string): Promise<express.Application> => {
    const health = await makeReadyChecker(root);
    const service = createNasStorageService({
      store: new FsNasFileStore(root),
      health,
    });
    return buildApp(setupNasStorage(crowi, { service, health }));
  };

  const newRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'nas-'));

  beforeAll(async () => {
    crowi = await getInstance();
    await mkdir(`${crowi.tmpDir}uploads`, { recursive: true });
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

  describe('DELETE /entries on a folder — recursive gate (Req 5.3)', () => {
    it('rejects a non-empty folder without `recursive` (409), then deletes it with `recursive=true`', async () => {
      const root = await newRoot();
      await mkdir(path.join(root, 'box'));
      await writeFile(path.join(root, 'box', 'inner.txt'), 'keep');
      currentUser = await seedUser('recursive-deleter');
      const app = await buildReadyApp(root);

      const blocked = await request(app)
        .delete('/_api/v3/nas-storage/entries')
        .query({ path: '/box' });

      expect(blocked.status).toBe(409);
      // Nothing was removed.
      expect(await pathExists(path.join(root, 'box', 'inner.txt'))).toBe(true);

      const removed = await request(app)
        .delete('/_api/v3/nas-storage/entries')
        .query({ path: '/box', recursive: 'true' });

      expect(removed.status).toBe(200);
      expect(removed.body).toEqual({ ok: true });
      expect(await pathExists(path.join(root, 'box'))).toBe(false);
    });
  });

  describe('out-of-root paths on write methods -> 422 (Req 3.5)', () => {
    it('rejects PUT /entries when `from` escapes the root', async () => {
      const root = await newRoot();
      currentUser = await seedUser('move-from-probe');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .put('/_api/v3/nas-storage/entries')
        .send({ from: '../../etc/passwd', to: '/passwd' });

      expect(res.status).toBe(422);
    });

    it('rejects PUT /entries when `to` escapes the root', async () => {
      const root = await newRoot();
      await writeFile(path.join(root, 'src.txt'), 'x');
      currentUser = await seedUser('move-to-probe');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .put('/_api/v3/nas-storage/entries')
        .send({ from: '/src.txt', to: '../../escape.txt' });

      expect(res.status).toBe(422);
      expect(await pathExists(path.join(root, 'src.txt'))).toBe(true);
    });

    it('rejects POST /folders when `parentDir` escapes the root', async () => {
      const root = await newRoot();
      currentUser = await seedUser('folder-escape-probe');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .post('/_api/v3/nas-storage/folders')
        .send({ parentDir: '../../tmp', name: 'evil' });

      expect(res.status).toBe(422);
    });
  });

  describe('nasAccess is enforced on every method, not just GET (Req 6.2)', () => {
    it.each([
      ['post', '/_api/v3/nas-storage/folders', { parentDir: '/', name: 'd' }],
      ['put', '/_api/v3/nas-storage/entries', { from: '/a', to: '/b' }],
    ] as const)('unauthenticated %s %s -> 401', async (method, url, body) => {
      const root = await newRoot();
      const app = await buildReadyApp(root);

      const res = await request(app)[method](url).send(body);

      expect(res.status).toBe(401);
    });

    it('unauthenticated DELETE /entries -> 401', async () => {
      const root = await newRoot();
      const app = await buildReadyApp(root);

      const res = await request(app)
        .delete('/_api/v3/nas-storage/entries')
        .query({ path: '/whatever' });

      expect(res.status).toBe(401);
    });

    it('unauthenticated POST /files (multipart) -> 401', async () => {
      const root = await newRoot();
      const app = await buildReadyApp(root);

      const res = await request(app)
        .post('/_api/v3/nas-storage/files')
        .field('dir', '/')
        .attach('file', Buffer.from('x'), 'x.txt');

      expect(res.status).toBe(401);
    });

    it('a logged-in non-member of GROWI_NAS_GROUP is denied a write method with 403', async () => {
      vi.stubEnv('GROWI_NAS_GROUP', GROUP_NAME);
      await UserGroup.create({ name: GROUP_NAME });
      const root = await newRoot();
      currentUser = await seedUser('non-member-writer');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .post('/_api/v3/nas-storage/folders')
        .send({ parentDir: '/', name: 'blocked' });

      expect(res.status).toBe(403);
      expect(await pathExists(path.join(root, 'blocked'))).toBe(false);
    });

    it('a logged-in member of GROWI_NAS_GROUP may use a write method (201)', async () => {
      vi.stubEnv('GROWI_NAS_GROUP', GROUP_NAME);
      const user = await seedUser('member-writer');
      const group = await UserGroup.create({ name: GROUP_NAME });
      await UserGroupRelation.create({
        relatedGroup: group._id,
        relatedUser: user._id,
      });
      currentUser = user;
      const root = await newRoot();
      const app = await buildReadyApp(root);

      const res = await request(app)
        .post('/_api/v3/nas-storage/folders')
        .send({ parentDir: '/', name: 'allowed' });

      expect(res.status).toBe(201);
      expect(await pathExists(path.join(root, 'allowed'))).toBe(true);
    });
  });
});
