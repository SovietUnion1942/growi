import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
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

import { nasStorageConfig } from '../config/nas-storage-config';
import { createChunkedUploadRegistry } from '../services/chunked-upload-registry';
import { createNasStorageService } from '../services/nas-storage-service';
import {
  createRootHealthChecker,
  type RootHealthChecker,
} from '../services/root-health-checker';
import { FsNasFileStore } from '../store/fs-nas-file-store';
import { setupNasStorage } from './nas-storage';

addCustomFunctionToResponse(express);

/**
 * Task 9.4: the four `/uploads` chunked-upload endpoints.
 *
 * Asserts the observable HTTP contract:
 *   - begin -> sequential append -> complete yields a file identical to a
 *     single-shot upload, with no `.part` scratch left behind (Req 10.1, 10.2)
 *   - out-of-order / bad Content-Range map to 409 / 400 (Req 10.4)
 *   - the declared total is capped at `GROWI_NAS_MAX_FILE_SIZE` -> 413 (Req 10.5)
 *   - abort and a size mismatch on complete both discard the `.part` (Req 10.3, 10.7)
 *   - the destination-name conflict is settled the same way as `/files`
 *     (409 + `suggestedName`, or replaced under `overwrite`) (Req 10.6)
 *   - every route shares the `nasAccess` + feature gate (401 / 404) (Req 6.7)
 *
 * Requirements: 6.7, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

const TMP_DIR = '.growi-nas-tmp';

const listParts = async (root: string): Promise<string[]> => {
  try {
    return (await readdir(path.join(root, TMP_DIR))).filter((n) =>
      n.endsWith('.part'),
    );
  } catch {
    return [];
  }
};

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

describe('setupNasStorage /uploads — chunked upload', () => {
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
    const store = new FsNasFileStore(root);
    const service = createNasStorageService({
      store,
      health,
      // The default registry singleton is bound to the env-resolved root; the
      // test root is a per-case tmp dir, so wire a registry against this store.
      registry: createChunkedUploadRegistry({
        store,
        config: nasStorageConfig,
      }),
    });
    return buildApp(setupNasStorage(crowi, { service, health }));
  };

  const newRoot = (): Promise<string> =>
    mkdtemp(path.join(tmpdir(), 'nas-cu-'));

  const patchChunk = (
    app: express.Application,
    uploadId: string,
    range: string,
    body: Buffer,
  ) =>
    request(app)
      .put(`/_api/v3/nas-storage/uploads/${uploadId}`)
      .set('Content-Range', range)
      .set('Content-Type', 'application/octet-stream')
      .send(body);

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

  it('begin -> sequential append -> complete produces the concatenated file', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-happy');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'big.bin', totalBytes: 10 });

    expect(begin.status).toBe(201);
    const { uploadId, chunkSize } = begin.body;
    expect(typeof uploadId).toBe('string');
    expect(chunkSize).toBeGreaterThan(0);

    const a = await patchChunk(
      app,
      uploadId,
      'bytes 0-5/10',
      Buffer.from('ABCDEF'),
    );
    expect(a.status).toBe(204);

    const b = await patchChunk(
      app,
      uploadId,
      'bytes 6-9/10',
      Buffer.from('GHIJ'),
    );
    expect(b.status).toBe(204);

    const complete = await request(app).post(
      `/_api/v3/nas-storage/uploads/${uploadId}/complete`,
    );
    expect(complete.status).toBe(201);
    expect(complete.body.name).toBe('big.bin');
    expect(complete.body.sizeBytes).toBe(10);

    const list = await request(app)
      .get('/_api/v3/nas-storage/entries')
      .query({ path: '/' });
    expect(list.body.entries.map((e: { name: string }) => e.name)).toEqual([
      'big.bin',
    ]);

    const file = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/big.bin' })
      .responseType('blob');
    expect((file.body as Buffer).toString('utf8')).toBe('ABCDEFGHIJ');

    expect(await listParts(root)).toEqual([]);
  });

  it('rejects an out-of-order chunk with 409', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-order');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'x.bin', totalBytes: 10 });
    const { uploadId } = begin.body;

    await patchChunk(app, uploadId, 'bytes 0-5/10', Buffer.from('ABCDEF'));
    const bad = await patchChunk(
      app,
      uploadId,
      'bytes 0-3/10',
      Buffer.from('ZZZZ'),
    );
    expect(bad.status).toBe(409);
  });

  it('rejects a malformed / missing Content-Range with 400', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-range');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'x.bin', totalBytes: 10 });
    const { uploadId } = begin.body;

    const wrongUnit = await patchChunk(
      app,
      uploadId,
      'pages 1-2/3',
      Buffer.from('AB'),
    );
    expect(wrongUnit.status).toBe(400);

    const missing = await request(app)
      .put(`/_api/v3/nas-storage/uploads/${uploadId}`)
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.from('AB'));
    expect(missing.status).toBe(400);
  });

  it('rejects a declared total over GROWI_NAS_MAX_FILE_SIZE with 413 + limitBytes', async () => {
    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '8');
    const root = await newRoot();
    currentUser = await seedUser('cu-big');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'big.bin', totalBytes: 100 });

    expect(begin.status).toBe(413);
    expect(begin.body.info.limitBytes).toBe(8);
  });

  it('abort discards the .part and makes the session unknown afterwards', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-abort');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'x.bin', totalBytes: 10 });
    const { uploadId } = begin.body;
    await patchChunk(app, uploadId, 'bytes 0-5/10', Buffer.from('ABCDEF'));

    const abort = await request(app).delete(
      `/_api/v3/nas-storage/uploads/${uploadId}`,
    );
    expect(abort.status).toBe(200);
    expect(abort.body).toEqual({ ok: true });
    expect(await listParts(root)).toEqual([]);

    const after = await patchChunk(
      app,
      uploadId,
      'bytes 6-9/10',
      Buffer.from('GHIJ'),
    );
    expect(after.status).toBe(404);
  });

  it('rejects append / complete / abort by another user with 403', async () => {
    const root = await newRoot();
    const owner = await seedUser('cu-owner');
    const other = await seedUser('cu-other');

    currentUser = owner;
    const app = await buildReadyApp(root);
    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'x.bin', totalBytes: 10 });
    const { uploadId } = begin.body;

    currentUser = other;
    const append = await patchChunk(
      app,
      uploadId,
      'bytes 0-5/10',
      Buffer.from('ABCDEF'),
    );
    expect(append.status).toBe(403);

    const complete = await request(app).post(
      `/_api/v3/nas-storage/uploads/${uploadId}/complete`,
    );
    expect(complete.status).toBe(403);

    const abort = await request(app).delete(
      `/_api/v3/nas-storage/uploads/${uploadId}`,
    );
    expect(abort.status).toBe(403);
  });

  it('maps an unknown uploadId to 404 for append / complete / abort', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-unknown');
    const app = await buildReadyApp(root);

    const append = await patchChunk(
      app,
      'does-not-exist',
      'bytes 0-1/2',
      Buffer.from('AB'),
    );
    expect(append.status).toBe(404);

    const complete = await request(app).post(
      '/_api/v3/nas-storage/uploads/does-not-exist/complete',
    );
    expect(complete.status).toBe(404);

    const abort = await request(app).delete(
      '/_api/v3/nas-storage/uploads/does-not-exist',
    );
    expect(abort.status).toBe(404);
  });

  it('fails complete with 500 on a size mismatch and leaves no file or .part', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-mismatch');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'short.bin', totalBytes: 10 });
    const { uploadId } = begin.body;
    await patchChunk(app, uploadId, 'bytes 0-5/10', Buffer.from('ABCDEF'));

    const complete = await request(app).post(
      `/_api/v3/nas-storage/uploads/${uploadId}/complete`,
    );
    expect(complete.status).toBe(500);

    expect(await readdir(root)).not.toContain('short.bin');
    expect(await listParts(root)).toEqual([]);
  });

  it('settles a destination-name conflict with 409 + suggestedName', async () => {
    const root = await newRoot();
    await writeFile(path.join(root, 'taken.bin'), 'existing');
    currentUser = await seedUser('cu-conflict');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'taken.bin', totalBytes: 4, overwrite: false });
    const { uploadId } = begin.body;
    await patchChunk(app, uploadId, 'bytes 0-3/4', Buffer.from('WXYZ'));

    const complete = await request(app).post(
      `/_api/v3/nas-storage/uploads/${uploadId}/complete`,
    );
    expect(complete.status).toBe(409);
    expect(complete.body.info.suggestedName).toBe('taken (1).bin');
    expect(await listParts(root)).toEqual([]);
  });

  it('replaces the destination when overwrite is requested', async () => {
    const root = await newRoot();
    await writeFile(path.join(root, 'taken.bin'), 'old');
    currentUser = await seedUser('cu-overwrite');
    const app = await buildReadyApp(root);

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'taken.bin', totalBytes: 4, overwrite: true });
    const { uploadId } = begin.body;
    await patchChunk(app, uploadId, 'bytes 0-3/4', Buffer.from('WXYZ'));

    const complete = await request(app).post(
      `/_api/v3/nas-storage/uploads/${uploadId}/complete`,
    );
    expect(complete.status).toBe(201);

    const file = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/taken.bin' })
      .responseType('blob');
    expect((file.body as Buffer).toString('utf8')).toBe('WXYZ');
  });

  it('rejects an invalid begin body with 400', async () => {
    const root = await newRoot();
    currentUser = await seedUser('cu-invalid');
    const app = await buildReadyApp(root);

    const res = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: '', totalBytes: -1 });
    expect(res.status).toBe(400);
  });

  it('rejects an unauthenticated begin with 401 (Req 6.7)', async () => {
    const root = await newRoot();
    const app = await buildReadyApp(root);

    const res = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'big.bin', totalBytes: 10 });
    expect(res.status).toBe(401);
  });

  it('answers every /uploads route with 404 when the feature is disabled', async () => {
    const health = createRootHealthChecker({ resolveRoot: () => undefined });
    await health.probeOnBoot();
    const service = createNasStorageService({
      store: new FsNasFileStore(''),
      health,
    });
    currentUser = await seedUser('cu-disabled');
    const app = buildApp(setupNasStorage(crowi, { service, health }));

    const begin = await request(app)
      .post('/_api/v3/nas-storage/uploads')
      .send({ dir: '/', name: 'big.bin', totalBytes: 10 });
    expect(begin.status).toBe(404);

    const complete = await request(app).post(
      '/_api/v3/nas-storage/uploads/whatever/complete',
    );
    expect(complete.status).toBe(404);
  });
});
