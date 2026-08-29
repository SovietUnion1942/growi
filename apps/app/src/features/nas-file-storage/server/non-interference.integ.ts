/**
 * Task 6.1 — non-interference integration test (Req 7.1 / 7.2 / 7.4).
 *
 * Proves that enabling the NAS file storage feature (`GROWI_NAS_ROOT` set,
 * `initializeNasFileStorage` run so the boot probe reports `ready`) does NOT
 * change the behaviour of GROWI's existing page-attachment stack:
 *   - a genuine multipart upload through the REAL apiv3 `/attachment` route
 *     still succeeds and streams into GridFS (Req 7.1)
 *   - the attachment is retrievable via `GET /attachment/:id` and appears in
 *     `GET /attachment/list` for its page (Req 7.1)
 *   - `crowi.attachmentService.removeAttachment` still deletes it (Req 7.1)
 *   - nothing was written under `GROWI_NAS_ROOT` by the attachment flow, and
 *     the NAS listing never surfaces attachment artifacts (Req 7.2 / 7.4)
 *
 * Only the auth middlewares are replaced by passthroughs (same fidelity
 * trade-off as `attachment-add-activity.integ.ts`); multer, the validators and
 * the real handler / `AttachmentService` run unmodified.
 */

import { readdir } from 'node:fs/promises';
import type { IUserHasId } from '@growi/core';
import { PageGrant } from '@growi/core';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';

import { getInstance } from '^/test/setup/crowi';

import { AttachmentMethodType } from '~/interfaces/attachment';
import type Crowi from '~/server/crowi';
import { Attachment } from '~/server/models/attachment';
import addCustomFunctionToResponse from '~/server/routes/apiv3/response';
import { configManager } from '~/server/service/config-manager';

import { initializeNasFileStorage, isNasStorageReady } from './index';
import { setupNasStorage } from './routes/nas-storage';
import { createNasStorageService } from './services/nas-storage-service';
import { rootHealthChecker } from './services/root-health-checker';
import { FsNasFileStore } from './store/fs-nas-file-store';

addCustomFunctionToResponse(express);

const passthrough = (_req: Request, _res: Response, next: NextFunction) =>
  next();

vi.mock('~/server/middlewares/access-token-parser', () => ({
  accessTokenParser: () => passthrough,
}));
vi.mock('~/server/middlewares/login-required', () => ({
  default: () => passthrough,
}));

const PAGE_PATH = '/nas-non-interference-integ';
const TEST_USERNAME = 'nas-non-interference-integ-user';

describe('nas-file-storage: enabling the feature does not disturb page attachments', () => {
  let crowi: Crowi;
  let nasRoot: string;
  let attachmentApp: express.Application;
  let nasApp: express.Application;
  let testUser: IUserHasId;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    crowi = await getInstance();

    // --- enable the NAS feature via a real, writable root + boot probe ---
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const path = await import('node:path');
    nasRoot = await mkdtemp(path.join(tmpdir(), 'nas-noninterf-'));
    vi.stubEnv('GROWI_NAS_ENABLED', 'true');
    vi.stubEnv('GROWI_NAS_ROOT', nasRoot);
    await initializeNasFileStorage(crowi);
    expect(isNasStorageReady()).toBe(true);

    // --- real GridFS-backed attachment upload path ---
    await configManager.updateConfig(
      'app:fileUploadType',
      AttachmentMethodType.gridfs,
    );
    await crowi.setUpFileUpload(true);

    testUser = await crowi.models.User.create({
      name: 'NAS Non-Interference Integ User',
      username: TEST_USERNAME,
      email: 'nas-non-interference-integ@example.com',
    });
    testUserId = new Types.ObjectId(testUser._id);

    const { setup } = await import('~/server/routes/apiv3/attachment');
    const attachmentRouter = setup(crowi);

    attachmentApp = express();
    attachmentApp.use(
      (
        req: Request & { user?: IUserHasId },
        _res: Response,
        next: NextFunction,
      ) => {
        req.user = testUser;
        next();
      },
    );
    attachmentApp.use('/attachment', attachmentRouter);

    // NAS router over the same enabled root, to assert the two stores stay disjoint.
    const service = createNasStorageService({
      store: new FsNasFileStore(nasRoot),
      health: rootHealthChecker,
    });
    nasApp = express();
    nasApp.use(express.json());
    nasApp.use((req: Request & { user?: unknown }, _res, next) => {
      req.user = testUser;
      next();
    });
    nasApp.use(
      '/_api/v3/nas-storage',
      setupNasStorage(crowi, { service, health: rootHealthChecker }),
    );
  }, 120_000);

  afterAll(async () => {
    const uploaded = await Attachment.find({ creator: testUserId });
    await Promise.all(
      uploaded.map((a) => crowi.attachmentService.removeAttachment(a._id)),
    );
    await crowi.models.Page.deleteMany({ path: PAGE_PATH });
    await crowi.models.User.deleteMany({ username: TEST_USERNAME });
    await configManager.updateConfigs(
      { 'app:fileUploadType': undefined },
      { removeIfUndefined: true },
    );
    vi.unstubAllEnvs();
  });

  it('uploads, retrieves, lists and deletes a page attachment exactly as without NAS', async () => {
    const [page] = await crowi.models.Page.insertMany([
      {
        path: PAGE_PATH,
        grant: PageGrant.GRANT_PUBLIC,
        creator: testUserId,
        revision: new Types.ObjectId(),
      },
    ]);
    const fileBody = Buffer.from(
      'non-interference payload for page attachment',
    );

    // Upload
    const uploadRes = await request(attachmentApp)
      .post('/attachment')
      .field('page_id', page._id.toString())
      .attach('file', fileBody, 'coexist.md');
    expect(uploadRes.status).toBe(200);
    const attachmentId: string = uploadRes.body.attachment._id;
    expect(await Attachment.findById(attachmentId)).not.toBeNull();

    // Retrieve by id
    const getRes = await request(attachmentApp).get(
      `/attachment/${attachmentId}`,
    );
    expect(getRes.status).toBe(200);
    expect(getRes.body.attachment._id).toBe(attachmentId);

    // Appears in the page's attachment list
    const listRes = await request(attachmentApp)
      .get('/attachment/list')
      .query({ pageId: page._id.toString() });
    expect(listRes.status).toBe(200);
    const listedIds = listRes.body.paginateResult.docs.map(
      (d: { _id: string }) => d._id,
    );
    expect(listedIds).toContain(attachmentId);

    // Req 7.2 / 7.4 — the attachment flow wrote nothing under GROWI_NAS_ROOT,
    // and the NAS listing does not surface attachment artifacts.
    expect(await readdir(nasRoot)).toEqual([]);
    const nasList = await request(nasApp)
      .get('/_api/v3/nas-storage/entries')
      .query({ path: '/' });
    expect(nasList.status).toBe(200);
    expect(nasList.body.entries).toEqual([]);

    // Delete via the existing service — still works.
    await crowi.attachmentService.removeAttachment(attachmentId);
    expect(await Attachment.findById(attachmentId)).toBeNull();
  }, 60_000);

  it('leaves the GridFS attachment collections as the only attachment store (no NAS mongo state)', async () => {
    // The NAS feature is filesystem-only: it must not have created any mongo
    // collection of its own that could shadow attachment queries (Req 7.1/7.4).
    const names = (
      await mongoose.connection.db.listCollections().toArray()
    ).map((c) => c.name);
    expect(names.some((n) => /nas/i.test(n))).toBe(false);
  });
});
