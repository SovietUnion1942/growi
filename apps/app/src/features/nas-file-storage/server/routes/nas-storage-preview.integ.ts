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
 * Task 8.4: `GET /file` inline-preview delivery.
 *
 * Asserts the observable HTTP contract of the rewritten handler:
 *   - `inline=1` yields `Content-Disposition: inline` for inline-safe formats,
 *     with the extension-derived `Content-Type` and the anti-XSS security headers
 *   - no `inline` param preserves the `attachment` download behaviour (Req 6.7)
 *   - scriptable formats (`.svg`, `.html`) stay `attachment` even with `inline=1`
 *     and are never advertised as an executable content type (Req 9.6)
 *   - `Range` requests are answered with `206` + `Content-Range` (Req 9.3 / 9.5)
 *   - folder / missing / out-of-root targets map to 409 / 404 / 422 (Req 9.7)
 *   - the router-level `nasAccess` gate still rejects anonymous callers, and a
 *     logged-in non-member of `GROWI_NAS_GROUP` is refused on `/file` too (Req 6.7)
 *
 * Requirements: 6.7, 9.1, 9.2, 9.3, 9.5, 9.6, 9.7
 */

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
]);
const CLIP_BYTES = Buffer.from('0123456789abcdef', 'utf8');

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

describe('setupNasStorage GET /file — inline preview delivery', () => {
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

  const seedRoot = async (): Promise<string> => {
    const root = await mkdtemp(path.join(tmpdir(), 'nas-preview-'));
    await writeFile(path.join(root, 'photo.png'), PNG_BYTES);
    await writeFile(path.join(root, 'notes.txt'), 'plain text body');
    await writeFile(
      path.join(root, 'evil.svg'),
      '<svg onload="alert(1)"></svg>',
    );
    await writeFile(path.join(root, 'page.html'), '<script>alert(1)</script>');
    await writeFile(path.join(root, 'clip.mp4'), CLIP_BYTES);
    // A real-world name with characters outside printable US-ASCII (en-dash,
    // parens): the Content-Disposition ASCII fallback must not carry them or
    // res.setHeader throws ERR_INVALID_CHAR and the response hangs (499).
    await writeFile(path.join(root, 'Coat of arms (1956–1991).png'), PNG_BYTES);
    return root;
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
    ]);
  });

  it('serves an image inline with the security headers when inline=1', async () => {
    currentUser = await seedUser('previewer');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/photo.png', inline: '1' })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(res.body as Buffer, PNG_BYTES)).toBe(0);
  });

  it('serves a file whose name has non-ASCII characters without hanging', async () => {
    currentUser = await seedUser('previewer');
    const app = await buildReadyApp(await seedRoot());

    for (const inline of ['1', undefined]) {
      // biome-ignore lint/performance/noAwaitInLoops: two sequential requests, each fully asserted
      const res = await request(app)
        .get('/_api/v3/nas-storage/file')
        .query({
          path: '/Coat of arms (1956–1991).png',
          ...(inline ? { inline } : {}),
        })
        .responseType('blob');

      expect(res.status).toBe(200);
      // ASCII fallback is sanitised; the real name rides on filename*.
      const cd = res.headers['content-disposition'];
      expect(cd).toMatch(inline ? /^inline/ : /^attachment/);
      expect(cd).toContain("filename*=UTF-8''");
      expect(cd.match(/filename="([^"]*)"/)?.[1]).toMatch(/^[\x20-\x7e]*$/);
      expect(res.body.length).toBe(PNG_BYTES.length);
    }
  });

  it('keeps the attachment disposition when inline is not requested', async () => {
    currentUser = await seedUser('downloader');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/photo.png' })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-disposition']).toContain('photo.png');
  });

  it('serves a text file inline as text/plain', async () => {
    currentUser = await seedUser('text-previewer');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/notes.txt', inline: '1' });

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^inline/);
    expect(res.headers['content-type']).toContain('text/plain');
  });

  it('forces attachment for an SVG even with inline=1 (Req 9.6)', async () => {
    currentUser = await seedUser('svg-previewer');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/evil.svg', inline: '1' })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });

  it('never advertises an HTML file as text/html and forces attachment', async () => {
    currentUser = await seedUser('html-previewer');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/page.html', inline: '1' })
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-type']).not.toContain('text/html');
  });

  it('answers a Range request with 206 + Content-Range', async () => {
    currentUser = await seedUser('range-previewer');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/clip.mp4', inline: '1' })
      .set('Range', 'bytes=0-3')
      .responseType('blob');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe(`bytes 0-3/${CLIP_BYTES.length}`);
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect((res.body as Buffer).length).toBe(4);
  });

  it('maps folder / missing / out-of-root targets to 409 / 404 / 422', async () => {
    currentUser = await seedUser('error-previewer');
    const app = await buildReadyApp(await seedRoot());

    const dir = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/' });
    expect(dir.status).toBe(409);

    const missing = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/nope.png', inline: '1' });
    expect(missing.status).toBe(404);

    const outOfRoot = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/../escape', inline: '1' });
    expect(outOfRoot.status).toBe(422);
  });

  it('rejects an unauthenticated request with 401', async () => {
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/photo.png', inline: '1' });

    expect(res.status).toBe(401);
  });

  it('refuses a logged-in non-member of GROWI_NAS_GROUP on GET /file with 403', async () => {
    vi.stubEnv('GROWI_NAS_GROUP', 'nas-users');
    await UserGroup.create({ name: 'nas-users' });
    // Seeded but never related to the group -> the router-level `nasAccess`
    // group gate must reject the delivery endpoint just like every other route.
    currentUser = await seedUser('outsider');
    const app = await buildReadyApp(await seedRoot());

    const res = await request(app)
      .get('/_api/v3/nas-storage/file')
      .query({ path: '/photo.png', inline: '1' });

    expect(res.status).toBe(403);
  });
});
