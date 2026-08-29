import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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

import { createNasStorageService } from '../services/nas-storage-service';
import {
  createRootHealthChecker,
  type RootHealthChecker,
} from '../services/root-health-checker';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import { setupNasStorage } from './nas-storage';

addCustomFunctionToResponse(express);

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

describe('setupNasStorage router (integration)', () => {
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
    await mongoose.model('User').deleteMany({});
  });

  const newRoot = (): Promise<string> => mkdtemp(path.join(tmpdir(), 'nas-'));

  describe('happy paths (feature ready)', () => {
    it('GET /entries lists the seeded directory and pages with limit', async () => {
      const root = await newRoot();
      await writeFile(path.join(root, 'a.txt'), 'A');
      await writeFile(path.join(root, 'b.txt'), 'B');
      await writeFile(path.join(root, 'c.txt'), 'C');
      currentUser = await seedUser('lister');
      const app = await buildReadyApp(root);

      const first = await request(app)
        .get('/_api/v3/nas-storage/entries')
        .query({ path: '/', limit: 2 });

      expect(first.status).toBe(200);
      expect(first.body.entries.map((e: { name: string }) => e.name)).toEqual([
        'a.txt',
        'b.txt',
      ]);
      expect(first.body.nextCursor).toBe('b.txt');

      const second = await request(app)
        .get('/_api/v3/nas-storage/entries')
        .query({ path: '/', limit: 2, cursor: first.body.nextCursor });

      expect(second.status).toBe(200);
      expect(second.body.entries.map((e: { name: string }) => e.name)).toEqual([
        'c.txt',
      ]);
      expect(second.body.nextCursor).toBeUndefined();
    });

    it('GET /file streams the bytes with the original filename in Content-Disposition', async () => {
      const root = await newRoot();
      await writeFile(path.join(root, 'report.txt'), 'hello nas');
      currentUser = await seedUser('downloader');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .get('/_api/v3/nas-storage/file')
        .query({ path: '/report.txt' })
        .responseType('blob');

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('report.txt');
      expect(Buffer.isBuffer(res.body)).toBe(true);
      expect((res.body as Buffer).toString('utf8')).toBe('hello nas');
    });

    it('POST /files stores the file, then rejects a same-name non-overwrite upload with 409 + suggestedName', async () => {
      const root = await newRoot();
      currentUser = await seedUser('uploader');
      const app = await buildReadyApp(root);

      const first = await request(app)
        .post('/_api/v3/nas-storage/files')
        .field('dir', '/')
        .attach('file', Buffer.from('first'), 'note.txt');

      expect(first.status).toBe(201);
      expect(await readFile(path.join(root, 'note.txt'), 'utf8')).toBe('first');

      const conflict = await request(app)
        .post('/_api/v3/nas-storage/files')
        .field('dir', '/')
        .field('overwrite', 'false')
        .attach('file', Buffer.from('second'), 'note.txt');

      expect(conflict.status).toBe(409);
      expect(conflict.body.info.suggestedName).toBe('note (1).txt');
    });

    it('POST /folders creates a directory and 409s on an existing one', async () => {
      const root = await newRoot();
      currentUser = await seedUser('folder-maker');
      const app = await buildReadyApp(root);

      const created = await request(app)
        .post('/_api/v3/nas-storage/folders')
        .send({ parentDir: '/', name: 'docs' });
      expect(created.status).toBe(201);

      const again = await request(app)
        .post('/_api/v3/nas-storage/folders')
        .send({ parentDir: '/', name: 'docs' });
      expect(again.status).toBe(409);
    });

    it('PATCH /entries renames an entry', async () => {
      const root = await newRoot();
      await writeFile(path.join(root, 'old.txt'), 'x');
      currentUser = await seedUser('renamer');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .patch('/_api/v3/nas-storage/entries')
        .send({ from: '/old.txt', to: '/new.txt' });

      expect(res.status).toBe(200);
      expect(await readFile(path.join(root, 'new.txt'), 'utf8')).toBe('x');
    });

    it('DELETE /entries removes a folder recursively', async () => {
      const root = await newRoot();
      await mkdir(path.join(root, 'trash'));
      await writeFile(path.join(root, 'trash', 'inner.txt'), 'y');
      currentUser = await seedUser('deleter');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .delete('/_api/v3/nas-storage/entries')
        .query({ path: '/trash', recursive: 'true' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true });
    });
  });

  describe('out-of-root paths -> 422', () => {
    it('rejects a traversal path on GET /entries', async () => {
      const root = await newRoot();
      currentUser = await seedUser('probe-get');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .get('/_api/v3/nas-storage/entries')
        .query({ path: '../../etc/passwd' });

      expect(res.status).toBe(422);
    });

    it('rejects a traversal path on DELETE /entries', async () => {
      const root = await newRoot();
      currentUser = await seedUser('probe-del');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .delete('/_api/v3/nas-storage/entries')
        .query({ path: '../../etc/passwd', recursive: 'true' });

      expect(res.status).toBe(422);
    });
  });

  describe('size limit -> 413', () => {
    it('rejects an upload over GROWI_NAS_MAX_FILE_SIZE with limitBytes', async () => {
      vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '8');
      const root = await newRoot();
      currentUser = await seedUser('big-uploader');
      const app = await buildReadyApp(root);

      const res = await request(app)
        .post('/_api/v3/nas-storage/files')
        .field('dir', '/')
        .attach('file', Buffer.from('way over eight bytes'), 'big.txt');

      expect(res.status).toBe(413);
      expect(res.body.info.limitBytes).toBe(8);
    });
  });

  describe('feature disabled (root unconfigured) -> every endpoint 404', () => {
    let app: express.Application;

    beforeEach(async () => {
      const health = createRootHealthChecker({ resolveRoot: () => undefined });
      await health.probeOnBoot();
      const service = createNasStorageService({
        store: new FsNasFileStore(''),
        health,
      });
      currentUser = await seedUser('disabled-caller');
      app = buildApp(setupNasStorage(crowi, { service, health }));
    });

    it.each([
      ['get', '/_api/v3/nas-storage/entries'],
      ['get', '/_api/v3/nas-storage/file'],
      ['post', '/_api/v3/nas-storage/folders'],
      ['patch', '/_api/v3/nas-storage/entries'],
      ['delete', '/_api/v3/nas-storage/entries'],
    ] as const)('%s %s -> 404', async (method, url) => {
      const res = await request(app)[method](url).send({});
      expect(res.status).toBe(404);
    });

    it('POST /files -> 404', async () => {
      const res = await request(app)
        .post('/_api/v3/nas-storage/files')
        .field('dir', '/')
        .attach('file', Buffer.from('x'), 'x.txt');
      expect(res.status).toBe(404);
    });
  });

  describe('authorization', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const root = await newRoot();
      const app = await buildReadyApp(root);

      const res = await request(app).get('/_api/v3/nas-storage/entries');

      expect(res.status).toBe(401);
    });
  });
});
