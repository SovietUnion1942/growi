import type { IUser } from '@growi/core';
import express from 'express';
import type { HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';

import { getInstance } from '^/test/setup/crowi';

import type Crowi from '~/server/crowi';
import UserUISettings from '~/server/models/user-ui-settings';

import type { ApiV3Response } from './interfaces/apiv3-response';

/**
 * Build a minimal (unpersisted) user for injecting into `req.user` directly.
 * A real ObjectId is used for `_id` so the handler's findOneAndUpdate filter is
 * exercised against a concrete, distinct key per user.
 */
const buildUser = (): HydratedDocument<IUser> =>
  ({
    _id: new Types.ObjectId(),
    username: 'test-user',
    status: 2,
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub, only _id is read
  }) as any;

interface TestRequest extends express.Request {
  user?: HydratedDocument<IUser>;
  crowi?: Crowi;
}

describe('PUT /user-ui-settings (homeWidgetPreferences persistence)', () => {
  let app: express.Application;
  let crowi: Crowi;

  // Injected into req.user by the middleware below; undefined simulates a guest.
  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;
    await UserUISettings.deleteMany({});

    app = express();
    app.use(express.json());

    app.use((_req, res: ApiV3Response, next) => {
      res.apiv3 = (data: unknown) => res.json(data);
      res.apiv3Err = (error: unknown, statusCode?: number) => {
        const status = statusCode ?? (Array.isArray(error) ? 400 : 500);
        return res.status(status).json({ error });
      };
      next();
    });

    app.use((req: TestRequest, _res, next) => {
      req.crowi = crowi;
      req.user = currentUser;
      // minimal session stub for the guest branch (no passport session here)
      // biome-ignore lint/suspicious/noExplicitAny: session is not typed on the bare app
      (req as any).session ??= {};
      next();
    });

    const { setup } = await import('./user-ui-settings');
    app.use('/_api/v3/user-ui-settings', setup());
  });

  it('persists homeWidgetPreferences end-to-end for the authenticated user', async () => {
    const userA = buildUser();
    currentUser = userA;

    const prefs = {
      bookmarks: { visible: false },
      homeFeed: { order: 5, visible: true },
    };

    await request(app)
      .put('/_api/v3/user-ui-settings')
      .send({ settings: { homeWidgetPreferences: prefs } })
      .expect(200);

    const doc = await UserUISettings.findOne({ user: userA._id }).lean();
    expect(doc).not.toBeNull();
    expect(doc?.homeWidgetPreferences).toEqual(prefs);
  });

  it("does not touch another user's UserUISettings document", async () => {
    const userA = buildUser();
    const userB = buildUser();

    // seed B the same way the route writes (findOneAndUpdate skips subdoc
    // validation, which mongoose 6 mishandles for this dynamically-keyed schema)
    const bDoc = await UserUISettings.findOneAndUpdate(
      { user: userB._id },
      {
        $set: {
          user: userB._id,
          homeWidgetPreferences: { search: { visible: false } },
        },
      },
      { upsert: true, new: true },
    );

    currentUser = userA;
    await request(app)
      .put('/_api/v3/user-ui-settings')
      .send({
        settings: {
          homeWidgetPreferences: {
            bookmarks: { visible: false },
            homeFeed: { order: 5, visible: true },
          },
        },
      })
      .expect(200);

    const bAfter = await UserUISettings.findOne({ user: userB._id }).lean();
    expect(bAfter?._id.toString()).toBe(bDoc._id.toString());
    expect(bAfter?.homeWidgetPreferences).toEqual({
      search: { visible: false },
    });
  });

  it('resets homeWidgetPreferences to empty on a subsequent PUT', async () => {
    const userA = buildUser();
    currentUser = userA;

    await request(app)
      .put('/_api/v3/user-ui-settings')
      .send({
        settings: { homeWidgetPreferences: { bookmarks: { visible: false } } },
      })
      .expect(200);

    await request(app)
      .put('/_api/v3/user-ui-settings')
      .send({ settings: { homeWidgetPreferences: {} } })
      .expect(200);

    const doc = await UserUISettings.findOne({ user: userA._id }).lean();
    // an empty map means "follow site config" — the schema stores {} or nothing
    expect(doc?.homeWidgetPreferences ?? {}).toEqual({});
  });

  it('handles a guest PUT via the session branch without persisting a document', async () => {
    // currentUser stays undefined -> guest branch
    const res = await request(app)
      .put('/_api/v3/user-ui-settings')
      .send({
        settings: { homeWidgetPreferences: { bookmarks: { visible: false } } },
      })
      .expect(200);

    expect(res.body.homeWidgetPreferences).toEqual({
      bookmarks: { visible: false },
    });
    expect(await UserUISettings.countDocuments({})).toBe(0);
  });
});
