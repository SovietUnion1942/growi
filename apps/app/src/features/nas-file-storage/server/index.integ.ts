import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
  initializeNasFileStorage,
  setupNasStorage,
  setupNasStorageAdmin,
} from './index';
import { createNasStorageService } from './services/nas-storage-service';
import {
  createRootHealthChecker,
  type RootHealthChecker,
  rootHealthChecker,
} from './services/root-health-checker';
import { FsNasFileStore } from './store/fs-nas-file-store';

addCustomFunctionToResponse(express);

const APIV3_INDEX = path.resolve(
  import.meta.dirname,
  '../../../server/routes/apiv3/index.js',
);

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

const makeReadyChecker = async (root: string): Promise<RootHealthChecker> => {
  const checker = createRootHealthChecker({ resolveRoot: () => root });
  await checker.probeOnBoot();
  return checker;
};

describe('nas-file-storage server barrel (wiring)', () => {
  let crowi: Crowi;
  let currentUser: HydratedDocument<IUser> | undefined;

  const newRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'nas-'));

  const buildApp = (
    mount: string,
    router: ReturnType<typeof express.Router>,
  ): express.Application => {
    const app = express();
    app.use(express.json());
    app.use((req: express.Request & { user?: unknown }, _res, next) => {
      req.user = currentUser;
      next();
    });
    app.use(mount, router);
    return app;
  };

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(() => {
    currentUser = undefined;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    await mongoose.model('User').deleteMany({});
  });

  describe('apiv3 route registration', () => {
    it('registers the user router at /nas-storage and the admin router at /admin/nas-storage', async () => {
      const source = await readFile(APIV3_INDEX, 'utf8');
      expect(source).toMatch(
        /router\.use\(\s*['"]\/nas-storage['"],\s*setupNasStorage\(crowi\)\)/,
      );
      // routerForAdmin is mounted at /_api/v3, so the admin status endpoint is
      // /_api/v3/admin/nas-storage/status — matching the client hook. A bare
      // '/nas-storage' here would collide with the user router (fix 934160be91).
      expect(source).toMatch(
        /routerForAdmin\.use\(\s*['"]\/admin\/nas-storage['"],\s*setupNasStorageAdmin\(crowi\)\)/,
      );
    });
  });

  describe('user routes mounted at the real apiv3 path', () => {
    const REAL_MOUNT = '/api/v3/nas-storage';

    it('GET /api/v3/nas-storage/entries is 401 when unauthenticated', async () => {
      const root = await newRoot();
      const health = await makeReadyChecker(root);
      const service = createNasStorageService({
        store: new FsNasFileStore(root),
        health,
      });
      const app = buildApp(
        REAL_MOUNT,
        setupNasStorage(crowi, { service, health }),
      );

      const res = await request(app).get(`${REAL_MOUNT}/entries`);
      expect(res.status).toBe(401);
    });

    it('GET /api/v3/nas-storage/entries is 200 when authenticated and the root probes ready', async () => {
      const root = await newRoot();
      await writeFile(path.join(root, 'a.txt'), 'A');
      const health = await makeReadyChecker(root);
      const service = createNasStorageService({
        store: new FsNasFileStore(root),
        health,
      });
      currentUser = await seedUser('nas-wire-user', false);
      const app = buildApp(
        REAL_MOUNT,
        setupNasStorage(crowi, { service, health }),
      );

      const res = await request(app)
        .get(`${REAL_MOUNT}/entries`)
        .query({ path: '/' });

      expect(res.status).toBe(200);
      expect(res.body.entries.map((e: { name: string }) => e.name)).toContain(
        'a.txt',
      );
    });
  });

  describe('admin route mounted at the real apiv3 path', () => {
    const REAL_MOUNT = '/api/v3/admin/nas-storage';

    it('GET /api/v3/admin/nas-storage/status returns the status body for an admin', async () => {
      const root = await newRoot();
      const health = await makeReadyChecker(root);
      currentUser = await seedUser('nas-wire-admin', true);
      const app = buildApp(REAL_MOUNT, setupNasStorageAdmin(crowi, { health }));

      const res = await request(app).get(`${REAL_MOUNT}/status`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        enabled: true,
        status: { state: 'ready', resolvedRoot: root },
        groupRestriction: null,
        maxFileSizeBytes: null,
      });
    });

    it('GET /api/v3/admin/nas-storage/status is 403 for a non-admin', async () => {
      const health = await makeReadyChecker(await newRoot());
      currentUser = await seedUser('nas-wire-plain', false);
      const app = buildApp(REAL_MOUNT, setupNasStorageAdmin(crowi, { health }));

      const res = await request(app).get(`${REAL_MOUNT}/status`);
      expect(res.status).toBe(403);
    });
  });

  describe('initializeNasFileStorage', () => {
    it('reports disabled when GROWI_NAS_ENABLED is not set (opt-in default)', async () => {
      vi.stubEnv('GROWI_NAS_ENABLED', undefined);
      vi.stubEnv('GROWI_NAS_ROOT', await newRoot());
      const spy = vi.spyOn(rootHealthChecker, 'probeOnBoot');

      await expect(initializeNasFileStorage(crowi)).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(rootHealthChecker.getStatus().state).toBe('disabled');
    });

    it('runs rootHealthChecker.probeOnBoot and resolves when the root is unconfigured', async () => {
      vi.stubEnv('GROWI_NAS_ENABLED', 'true');
      vi.stubEnv('GROWI_NAS_ROOT', '');
      const spy = vi.spyOn(rootHealthChecker, 'probeOnBoot');

      await expect(initializeNasFileStorage(crowi)).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(rootHealthChecker.getStatus().state).toBe('unconfigured');
    });

    it('resolves without throwing when the root is misconfigured (points at a regular file)', async () => {
      const dir = await newRoot();
      const filePath = path.join(dir, 'not-a-dir');
      await writeFile(filePath, 'x');
      vi.stubEnv('GROWI_NAS_ENABLED', 'true');
      vi.stubEnv('GROWI_NAS_ROOT', filePath);
      const spy = vi.spyOn(rootHealthChecker, 'probeOnBoot');

      await expect(initializeNasFileStorage(crowi)).resolves.toBeUndefined();

      expect(spy).toHaveBeenCalledTimes(1);
      expect(rootHealthChecker.getStatus().state).toBe('misconfigured');
    });

    it('does not throw when probeOnBoot itself rejects', async () => {
      vi.spyOn(rootHealthChecker, 'probeOnBoot').mockRejectedValueOnce(
        new Error('boom'),
      );

      await expect(initializeNasFileStorage(crowi)).resolves.toBeUndefined();
    });
  });
});
