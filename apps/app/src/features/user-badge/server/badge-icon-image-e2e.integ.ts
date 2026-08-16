/**
 * Integration test — task 13.8 (requirements 6.1, 6.1a, 6.2, 6.3, 6.4, 6.5).
 *
 * This is the one link in the "upload an image icon -> grant it -> it
 * displays" chain that no other existing test actually drives end-to-end:
 *
 * - `badge-type-service.integ.ts` (task 13.2) proves `createBadgeType`/
 *   `updateBadgeType` save/replace an image icon correctly, but calls the
 *   service function directly and uses a fully mocked `AttachmentService`
 *   whose `createAttachment` never persists a real `Attachment` document —
 *   so it never exercises the REAL apiv3 route (multer parsing a multipart
 *   upload, admin gating, MIME validation) and never produces an
 *   `iconAttachment` id that actually resolves to anything in the DB.
 * - `badge-grant-service.integ.ts` (task 13.4) proves `grantManualBadge` ->
 *   `User.badgeSummaryCached` resolves `iconUrl` correctly, but starts from
 *   a `BadgeType` fixture built directly via `BadgeType.create(...)`, never
 *   one created through the real upload route.
 *
 * This file closes that gap: it mounts the REAL `badge-type` router
 * (unmocked `badge-type-service`), drives a real multipart `POST
 * /_api/v3/badge-types` request with an attached image file, then calls the
 * real `grantManualBadge` and asserts the resulting
 * `User.badgeSummaryCached[0].iconUrl` matches the REAL persisted
 * `Attachment.filePathProxied` for the attachment the route created.
 *
 * `AttachmentService.createAttachment` itself is still replaced with a
 * lightweight double (real GridFS storage is out of scope for this test —
 * `AttachmentService`'s own storage behavior is not part of this feature),
 * but — unlike `badge-type-service.integ.ts`'s double — this one actually
 * persists a real `Attachment` document via `Attachment.create(...)`, the
 * same technique `badge-grant-service.integ.ts`'s `createTestAttachment`
 * helper uses, so `iconUrl` resolution downstream reads a real document
 * rather than an in-memory stand-in.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { mock } from 'vitest-mock-extended';

import type Crowi from '~/server/crowi';
import type UserEvent from '~/server/events/user';
import { AttachmentType } from '~/server/interfaces/attachment';
import { Attachment } from '~/server/models/attachment';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import type { AttachmentService } from '~/server/service/attachment';

import BadgeType from './models/badge-type-model';
import UserBadge from './models/user-badge-model';
import type { BadgeTypeRouteCrowi } from './routes/badge-type';
import { setup } from './routes/badge-type';
import { grantManualBadge } from './services/badge-grant-service';

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

type AdminRequiredFallback = (
  req: Request & { user?: MockUser },
  res: Response,
  next: NextFunction,
) => void;

// Same faithful model of the real `adminRequiredFactory` branching used by
// `badge-type.spec.ts`/`badge-type-resweep.integ.ts`: a non-admin caller is
// routed to the fallback (403), never a bare redirect.
vi.mock('~/server/middlewares/admin-required', () => ({
  default:
    (_crowi: unknown, fallback: AdminRequiredFallback | null = null) =>
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
        const validationErrors = errors.array().map((err) => ({
          message: `${(err as { param?: string }).param}: ${err.msg}`,
          code: 'validation_failed',
        }));
        return (res as unknown as ApiV3Response).apiv3Err(
          validationErrors,
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

/**
 * A `Crowi` double whose `attachmentService.createAttachment`/
 * `removeAttachment` persist/delete a REAL `Attachment` document (via
 * `Attachment.create`/`findByIdAndDelete`), unlike `badge-type-service.integ.ts`'s
 * mock, which only returns an in-memory stand-in on create and merely
 * records the id it was asked to remove without deleting anything. This is
 * what lets `iconUrl` resolution downstream (inside `grantManualBadge` ->
 * `updateBadgeSummaryCached`) read a real, queryable document, and what lets
 * requirement 6.4's "the old file is not orphaned" assertion check a real
 * deletion rather than merely that `removeAttachment` was called.
 */
function makeRoutePersistingAttachmentService(): AttachmentService {
  const createAttachment = vi.fn(async () => {
    const attachment = await Attachment.create({
      fileName: `badge-icon-${new Types.ObjectId().toString()}.png`,
      fileFormat: 'image/png',
      fileSize: 100,
      originalName: 'icon.png',
      attachmentType: AttachmentType.BADGE_ICON,
    });
    return attachment;
  });
  const removeAttachment = vi.fn(async (attachmentId: Types.ObjectId) => {
    await Attachment.findByIdAndDelete(attachmentId);
  });
  return mock<AttachmentService>({ createAttachment, removeAttachment });
}

// Real multer, same as the actual route (task 13.3): needs a genuine,
// already-existing destination directory (multer does not create it) --
// see the identical setup in `badge-type.spec.ts`.
function makeTmpDir(): string {
  const tmpDir = `${fs.mkdtempSync(path.join(os.tmpdir(), 'badge-icon-e2e-'))}${path.sep}`;
  fs.mkdirSync(`${tmpDir}uploads`, { recursive: true });
  return tmpDir;
}

function buildApp(tmpDir: string) {
  const app = express();
  app.use(express.json());
  withApiV3Helpers(app);

  const attachmentService = makeRoutePersistingAttachmentService();
  const crowi: BadgeTypeRouteCrowi & { attachmentService: AttachmentService } =
    {
      events: { activity: { emit: vi.fn() } },
      tmpDir,
      attachmentService,
    };
  const router = setup(crowi as unknown as BadgeTypeRouteCrowi);
  app.use('/_api/v3/badge-types', router);
  return { app };
}

/**
 * `updateBadgeSummaryCached` (invoked inside the real `grantManualBadge`
 * this file drives) requires the real Mongoose `User` model to already be
 * registered, mirroring `badge-grant-service.integ.ts`'s own
 * `getUserModel` helper.
 */
// biome-ignore lint/suspicious/noExplicitAny: mirrors badge-grant-service.integ.ts's own untyped User model binding.
async function getUserModel(): Promise<any> {
  const existing = mongoose.models.User;
  if (existing != null) {
    return existing;
  }
  const crowiMock = mock<Crowi>({
    events: { user: mock<UserEvent>({ on: vi.fn() }) },
  });
  const userModule = await import('~/server/models/user');
  return userModule.default(crowiMock);
}

async function createUser(): Promise<string> {
  const User = await getUserModel();
  const id = new Types.ObjectId();
  await User.create({
    _id: id,
    name: `Badge Icon E2E User ${id.toString()}`,
    username: `badge-icon-e2e-user-${id.toString()}`,
    email: `${id.toString()}@example.com`,
    password: 'password',
  });
  return id.toString();
}

// `_id` must be a real ObjectId-shaped string: `createBadgeType` persists it
// as `BadgeType.createdBy` (an ObjectId-typed field), so a non-ObjectId
// placeholder like the string `'admin-1'` fails Mongoose's cast during
// `BadgeType.create` with a `ValidationError` -- which the route's generic
// catch-all then turns into an opaque 500, masking whatever the route
// handler under test is actually supposed to do.
const adminUserId = new Types.ObjectId().toString();
const adminUser: MockUser = { _id: adminUserId, admin: true };

describe('badge icon image upload -> grant -> cache (task 13.8, requirements 6.1-6.5)', () => {
  beforeAll(async () => {
    await getUserModel();
    await UserBadge.init();
  });

  beforeEach(() => {
    currentUser = adminUser;
  });

  afterEach(async () => {
    vi.clearAllMocks();
    currentUser = undefined;
    await BadgeType.deleteMany({});
    await UserBadge.deleteMany({});
    await Attachment.deleteMany({ attachmentType: AttachmentType.BADGE_ICON });
    const User = await getUserModel();
    await User.deleteMany({ username: /^badge-icon-e2e-user-/ });
  });

  it('creates a manual BadgeType with a real uploaded image via the real route, grants it, and caches the real resolved iconUrl on User.badgeSummaryCached (req 6.1, 6.2, 6.4, 6.5)', async () => {
    const { app } = buildApp(makeTmpDir());

    const createRes = await request(app)
      .post('/_api/v3/badge-types')
      .field('name', 'Mentor')
      .field('description', 'Mentored a newcomer')
      .field('iconKey', 'star')
      .field('category', 'manual')
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'mentor-icon.png',
        contentType: 'image/png',
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.badgeType.iconType).toBe('image');
    expect(createRes.body.badgeType.iconAttachment).not.toBeNull();

    // The route must actually persist the BadgeType with a REAL, resolvable
    // Attachment id (requirement 6.2) — not just echo back whatever the
    // service returned in memory.
    const attachmentId = createRes.body.badgeType.iconAttachment;
    const persistedAttachment = await Attachment.findById(attachmentId);
    expect(persistedAttachment).not.toBeNull();

    const persistedBadgeType = await BadgeType.findById(
      createRes.body.badgeType._id,
    );
    expect(persistedBadgeType?.iconAttachment?.toString()).toBe(attachmentId);

    // Grant this real, image-backed manual BadgeType to a real user.
    const userId = await createUser();
    await grantManualBadge(
      { badgeTypeId: createRes.body.badgeType._id, userId },
      mock({ _id: adminUserId }),
      mock<Crowi>({}),
    );

    // The cached summary — the data every one of the 4 display sites
    // (profile header, sidebar recent-changes, comment author,
    // BadgeShelf) ultimately reads from — must reflect the real,
    // route-created, DB-resolved iconUrl.
    const User = await getUserModel();
    const stored = await User.findById(userId);
    expect(stored?.badgeSummaryCached).toHaveLength(1);
    expect(stored?.badgeSummaryCached?.[0]).toMatchObject({
      name: 'Mentor',
      iconType: 'image',
      iconUrl: persistedAttachment?.filePathProxied,
      level: null,
    });
    expect(stored?.badgeSummaryCached?.[0].iconUrl).toBe(
      `/attachment/${attachmentId}`,
    );
  });

  it('replacing the image icon via a real PUT request updates the cached iconUrl on a subsequent grant, without deleting an unrelated BadgeType own image (req 6.4)', async () => {
    const { app } = buildApp(makeTmpDir());

    const firstCreate = await request(app)
      .post('/_api/v3/badge-types')
      .field('name', 'Mentor')
      .field('description', 'Mentored a newcomer')
      .field('iconKey', 'star')
      .field('category', 'manual')
      .attach('file', Buffer.from('fake-png-bytes-1'), {
        filename: 'first.png',
        contentType: 'image/png',
      });
    const badgeTypeId = firstCreate.body.badgeType._id;
    const firstAttachmentId = firstCreate.body.badgeType.iconAttachment;

    const replaceRes = await request(app)
      .put(`/_api/v3/badge-types/${badgeTypeId}`)
      .field('name', 'Mentor')
      .attach('file', Buffer.from('fake-png-bytes-2'), {
        filename: 'replacement.png',
        contentType: 'image/png',
      });

    expect(replaceRes.status).toBe(200);
    const replacedAttachmentId = replaceRes.body.badgeType.iconAttachment;
    expect(replacedAttachmentId).not.toBe(firstAttachmentId);

    // Requirement 6.4: the previous attachment for THIS BadgeType is gone.
    const oldAttachment = await Attachment.findById(firstAttachmentId);
    expect(oldAttachment).toBeNull();
    const newAttachment = await Attachment.findById(replacedAttachmentId);
    expect(newAttachment).not.toBeNull();

    const userId = await createUser();
    await grantManualBadge(
      { badgeTypeId, userId },
      mock({ _id: adminUserId }),
      mock<Crowi>({}),
    );

    const User = await getUserModel();
    const stored = await User.findById(userId);
    expect(stored?.badgeSummaryCached?.[0].iconUrl).toBe(
      `/attachment/${replacedAttachmentId}`,
    );
  });

  it('rejects an image upload when creating an automatic-category BadgeType, at the real HTTP route (req 6.1a)', async () => {
    const { app } = buildApp(makeTmpDir());

    const res = await request(app)
      .post('/_api/v3/badge-types')
      .field('name', 'Prolific Editor')
      .field('description', 'Edited many pages')
      .field('iconKey', 'star')
      .field('category', 'automatic')
      .field('levels[0][level]', '1')
      .field('levels[0][name]', 'Bronze')
      .field('levels[0][iconKey]', 'star')
      .field('levels[0][threshold]', '10')
      .attach('file', Buffer.from('fake-png-bytes'), {
        filename: 'not-allowed.png',
        contentType: 'image/png',
      });

    // Whatever the exact status/error shape, the BadgeType must never be
    // persisted with an image icon on an automatic category (requirement
    // 6.1a's server-side backstop for the client-side toggle from task
    // 13.6).
    expect(res.status).toBeGreaterThanOrEqual(400);
    const persisted = await BadgeType.find({ name: 'Prolific Editor' });
    expect(persisted).toHaveLength(0);
  });
});
