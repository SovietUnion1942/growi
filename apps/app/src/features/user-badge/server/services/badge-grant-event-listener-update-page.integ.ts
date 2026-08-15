/**
 * Integration test — end-to-end proof for task 3.2's acceptance bullet:
 * hitting the real page-update API causes a threshold-crossing user to
 * actually receive a `UserBadge`.
 *
 * Reuses the exact harness `update-page.integ.ts` already established for
 * exercising the REAL update-page terminal handler ->
 * `generateUpdateActivity` -> `crowi.events.activity.emit('update')` -> the
 * REAL `ActivityService` listener -> `settleActivityRecord` ->
 * `prisma.activities.createByParameters` -> `crowi.events.activity.emit('updated')`.
 * The only addition here is registering BadgeGrantService's own listener
 * (`initBadgeGrantEventListener`, task 3.2) on the same `crowi.events.activity`
 * before driving the request, then asserting a `UserBadge` document is
 * actually created for the acting user once their cumulative CREATE/UPDATE
 * count crosses an automatic BadgeType's threshold.
 *
 * Only the page-persistence collaborators (Page.count, Page.findByIdAndViewer,
 * Revision.findById, pageService.updatePage) are stubbed, exactly as in
 * update-page.integ.ts, so the test does not depend on the v5 page-tree
 * setup while the activity/badge pipeline stays entirely real.
 *
 * Requirements: 2.1, 2.2. Task 3.2 acceptance bullet: "ページ更新 API を
 * 叩いた際、しきい値を跨いだユーザーに実際に UserBadge が作成されることを
 * 確認できる".
 *
 * Requires a real MongoDB (wired by vitest.workspace.mts integ setup).
 */

import { EventEmitter } from 'node:events';
import type { IPage, IUserHasId } from '@growi/core';
import type { RequestHandler } from 'express';
import mongoose, { Types } from 'mongoose';

import { getInstance } from '^/test/setup/crowi';

import { ActionGroupSize, SupportedTargetModel } from '~/interfaces/activity';
import { parseSnapshot } from '~/models/serializers/in-app-notification-snapshot/user-badge';
import type Crowi from '~/server/crowi';
import { generateAddActivityMiddleware } from '~/server/middlewares/add-activity';
import type { InAppNotificationDocument } from '~/server/models/in-app-notification';
import type { PageModel } from '~/server/models/page';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import { updatePageHandlersFactory } from '~/server/routes/apiv3/page/update-page';
import { configManager } from '~/server/service/config-manager';
import { prisma } from '~/utils/prisma';

import type { IBadgeType } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import { initBadgeGrantEventListener } from './badge-grant-service';

const TEST_IP = '10.0.0.113';
const TEST_ENDPOINT = '/_api/v3/page/update-page-badge-integ';
const TEST_USERNAME = 'update-page-badge-integ-user';

async function createAutomaticBadgeType(
  threshold: number,
): Promise<IBadgeType & { _id: Types.ObjectId }> {
  const created = await BadgeType.create({
    name: 'Editor',
    description: 'Awarded for editing pages',
    iconKey: 'edit',
    category: 'automatic',
    levels: [{ level: 1, name: 'Bronze', iconKey: 'edit', threshold }],
    createdBy: new Types.ObjectId(),
  });
  return created.toObject();
}

/** Poll until at least one UserBadge exists for the user, or time out. */
async function waitForUserBadge(
  userId: string,
  maxWaitMs = 5000,
): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const count = await UserBadge.countDocuments({ user: userId });
    if (count > 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

/**
 * Poll until an InAppNotification for the given user/targetModel exists, or
 * time out. Notification persistence (InAppNotificationService's own
 * listener on `crowi.events.activity`'s `'updated'` event, which runs
 * `generateSnapshot` and `bulkWrite`s the result) happens asynchronously
 * relative to the request handler returning, exactly like `waitForUserBadge`
 * above.
 */
async function waitForInAppNotification(
  userId: Types.ObjectId,
  targetModel: string,
  maxWaitMs = 5000,
): Promise<InAppNotificationDocument | null> {
  const InAppNotification =
    mongoose.model<InAppNotificationDocument>('InAppNotification');
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const found = await InAppNotification.findOne({
      user: userId,
      targetModel,
    });
    if (found != null) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

describe('update-page apiv3 route -> real BadgeGrantService event listener (task 3.2)', () => {
  let crowi: Crowi;
  let testUser: IUserHasId;
  let testUserId: Types.ObjectId;

  beforeAll(async () => {
    crowi = await getInstance();
    // Registers this task's listener on the crowi instance shared by this
    // test file's requests, exactly as task 9.1 will do at boot.
    initBadgeGrantEventListener(crowi);

    testUser = await crowi.models.User.create({
      name: 'Update Page Badge Integ User',
      username: TEST_USERNAME,
      email: 'update-page-badge-integ@example.com',
    });
    testUserId = new Types.ObjectId(testUser._id);
  }, 120_000);

  beforeEach(async () => {
    await prisma.activities.deleteMany({ where: { ip: TEST_IP } });
    await UserBadge.deleteMany({ user: testUserId });
    await BadgeType.deleteMany({});
    const InAppNotification =
      mongoose.model<InAppNotificationDocument>('InAppNotification');
    await InAppNotification.deleteMany({ user: testUserId });
    await UserBadge.init();

    // ACTION_PAGE_UPDATE must be in-gate so settleActivityRecord persists it.
    await configManager.updateConfigs({
      'app:auditLogEnabled': true,
      'app:auditLogActionGroupSize': ActionGroupSize.Large,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await prisma.activities.deleteMany({ where: { ip: TEST_IP } });
    await UserBadge.deleteMany({ user: testUserId });
    await BadgeType.deleteMany({});
    const InAppNotification =
      mongoose.model<InAppNotificationDocument>('InAppNotification');
    await InAppNotification.deleteMany({ user: testUserId });
    await crowi.models.User.deleteMany({ username: TEST_USERNAME });
    await configManager.updateConfigs(
      {
        'app:auditLogEnabled': undefined,
        'app:auditLogActionGroupSize': undefined,
      },
      { removeIfUndefined: true },
    );
  });

  it('creates a UserBadge for the acting user once the real update-page API crosses an automatic threshold', async () => {
    const badgeType = await createAutomaticBadgeType(1);

    const pageId = new Types.ObjectId();
    const revisionId = new Types.ObjectId();

    const Page = mongoose.model<IPage, PageModel>('Page');
    const Revision = mongoose.model('Revision');

    const currentPage = {
      _id: pageId,
      path: '/update-page-badge-integ-target',
      grant: 1,
      revision: revisionId,
      isUpdatable: vi.fn().mockResolvedValue(true),
    };
    const updatedPage = {
      _id: pageId,
      path: '/update-page-badge-integ-target',
      creator: testUserId,
      revision: {
        _id: new Types.ObjectId(),
        body: 'updated',
        author: testUserId,
      },
    };

    vi.spyOn(Page, 'count').mockResolvedValue(1);
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the viewer lookup
    vi.spyOn(Page, 'findByIdAndViewer').mockResolvedValue(currentPage as any);
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the previous revision
    vi.spyOn(Revision, 'findById').mockResolvedValue({
      _id: revisionId,
      body: 'prev',
    } as any);
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub for the page update
    vi.spyOn(crowi.pageService, 'updatePage').mockResolvedValue(
      updatedPage as any,
    );

    const emitter = new EventEmitter();
    const resState = { statusCode: 200 };
    const apiv3 = vi.fn(() => {
      resState.statusCode = 201;
      emitter.emit('finish');
    });
    const res = {
      locals: {} as Record<string, unknown>,
      writableFinished: false,
      get statusCode() {
        return resState.statusCode;
      },
      on: emitter.on.bind(emitter),
      apiv3,
      apiv3Err: vi.fn(),
    } as unknown as ApiV3Response;

    const req = {
      method: 'PUT',
      ip: TEST_IP,
      originalUrl: TEST_ENDPOINT,
      user: testUser,
      body: {
        pageId: pageId.toString(),
        body: 'updated body',
        origin: 'editor',
      },
      // biome-ignore lint/suspicious/noExplicitAny: minimal Express request shape
    } as any;

    const addActivity = generateAddActivityMiddleware();
    addActivity(req, res, () => {});

    // Invoke the REAL terminal handler -- the same call path a real HTTP
    // request to PUT /_api/v3/page reaches after the route's middleware chain.
    const handlers = updatePageHandlersFactory(crowi);
    const terminalHandler = handlers[handlers.length - 1] as RequestHandler;
    await terminalHandler(req, res, () => {});

    const gotBadge = await waitForUserBadge(testUserId.toHexString());
    expect(gotBadge).toBe(true);

    const stored = await UserBadge.findOne({ user: testUserId });
    expect(stored).toMatchObject({
      badgeType: badgeType._id,
      level: 1,
      grantedBy: null,
    });

    // Requirement 5.1: the granted user's notification list must carry a
    // notification whose snapshot includes the granted badge's name -- the
    // strongest available proof, since this drives the same real pipeline
    // (Activity -> InAppNotificationService listener -> generateSnapshot ->
    // bulkWrite) a real grant goes through in production.
    const notification = await waitForInAppNotification(
      testUserId,
      SupportedTargetModel.MODEL_USER_BADGE,
    );
    expect(notification).not.toBeNull();
    expect(notification?.snapshot).toBeDefined();
    const snapshot = parseSnapshot(notification?.snapshot as string);
    expect(snapshot.badgeName).toBe('Bronze');
  });
});
