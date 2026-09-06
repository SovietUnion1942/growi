import type { IUser } from '@growi/core';
import express from 'express';
import type { HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import request from 'supertest';
import { mock } from 'vitest-mock-extended';

import { getInstance } from '^/test/setup/crowi';

import type Crowi from '~/server/crowi';
import { configManager } from '~/server/service/config-manager';

import type { ApiV3Response } from './interfaces/apiv3-response';

/** Build a minimal (unpersisted) user for injecting into `req.user` directly. */
const buildUser = (
  overrides: Partial<HydratedDocument<IUser>>,
): HydratedDocument<IUser> =>
  mock<HydratedDocument<IUser>>({
    _id: new Types.ObjectId(),
    username: 'test-user',
    status: 2,
    ...overrides,
  });

interface TestRequest extends express.Request {
  user?: HydratedDocument<IUser>;
  crowi?: Crowi;
}

describe('PUT /customize-setting/customize-home-notice', () => {
  let app: express.Application;
  let crowi: Crowi;

  // Injected into req.user by the middleware below; undefined simulates an
  // unauthenticated (guest) request.
  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;

    app = express();
    app.use(express.json());

    // Re-create the apiv3 response helpers used by the real router.
    app.use((_req, res: ApiV3Response, next) => {
      res.apiv3 = (data: unknown) => res.json(data);
      res.apiv3Err = (error: unknown, statusCode?: number) => {
        const status = statusCode ?? (Array.isArray(error) ? 400 : 500);
        return res.status(status).json({ error });
      };
      next();
    });

    // Inject crowi and the session user into the request, mirroring what the
    // real passport session middleware would do.
    app.use((req: TestRequest, _res, next) => {
      req.crowi = crowi;
      req.user = currentUser;
      next();
    });

    // Mount the real router (no middleware mocking) so adminRequired's real
    // rejection behavior is exercised, per the sibling customize-noscript
    // route pattern.
    const { setup: setupCustomizeSetting } = await import(
      './customize-setting'
    );
    app.use('/_api/v3/customize-setting', setupCustomizeSetting(crowi));
  });

  it('rejects an update from a non-admin user and leaves the config unchanged', async () => {
    const before = await configManager.getConfig('customize:homeNotice');

    currentUser = buildUser({ admin: false });

    const res = await request(app)
      .put('/_api/v3/customize-setting/customize-home-notice')
      .send({ customizeHomeNotice: '## Notice from a non-admin' });

    // adminRequiredFactory's default fallback (no fallback supplied) redirects
    // a non-admin away instead of processing the request -- it never reaches
    // the handler that would call configManager.updateConfigs().
    expect(res.status).not.toBe(200);

    expect(await configManager.getConfig('customize:homeNotice')).toBe(before);
  });

  it('updates customize:homeNotice and emits the audit activity when an admin sends a valid body', async () => {
    currentUser = buildUser({ admin: true });

    const emitSpy = vi.spyOn(crowi.events.activity, 'emit');

    const noticeMarkdown = '**Welcome!** See the [wiki](/) for more.';

    const res = await request(app)
      .put('/_api/v3/customize-setting/customize-home-notice')
      .send({ customizeHomeNotice: noticeMarkdown })
      .expect(200);

    expect(res.body.customizedParams.customizeHomeNotice).toBe(noticeMarkdown);
    expect(await configManager.getConfig('customize:homeNotice')).toBe(
      noticeMarkdown,
    );

    expect(emitSpy).toHaveBeenCalledWith(
      'update',
      expect.anything(),
      expect.objectContaining({ action: 'ADMIN_HOME_NOTICE_UPDATE' }),
    );

    emitSpy.mockRestore();
  });

  it('rejects a request with an invalid body with 400 and leaves the config unchanged', async () => {
    const before = await configManager.getConfig('customize:homeNotice');

    currentUser = buildUser({ admin: true });

    const res = await request(app)
      .put('/_api/v3/customize-setting/customize-home-notice')
      .send({ customizeHomeNotice: 12345 });

    expect(res.status).toBe(400);
    expect(await configManager.getConfig('customize:homeNotice')).toBe(before);
  });
});

describe('customize-setting home-widgets', () => {
  let app: express.Application;
  let crowi: Crowi;

  let currentUser: HydratedDocument<IUser> | undefined;

  beforeAll(async () => {
    crowi = await getInstance();
  });

  beforeEach(async () => {
    currentUser = undefined;

    // reset the three keys to their defaults between cases
    await configManager.updateConfigs(
      {
        'customize:homeWidgets': {},
        'customize:homePinnedPages': [],
        'customize:homeClassroomPathPrefix': undefined,
      },
      { removeIfUndefined: true },
    );

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
      next();
    });

    const { setup: setupCustomizeSetting } = await import(
      './customize-setting'
    );
    app.use('/_api/v3/customize-setting', setupCustomizeSetting(crowi));
  });

  const validBody = {
    homeWidgets: { recentUpdates: { visible: false, order: 3 } },
    homePinnedPages: [{ path: '/Sandbox', label: 'Sandbox' }],
    homeClassroomPathPrefix: '/Classroom',
  };

  describe('PUT /customize-setting/home-widgets', () => {
    it('rejects an update from a non-admin user and leaves the config unchanged', async () => {
      currentUser = buildUser({ admin: false });

      const res = await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send(validBody);

      expect(res.status).not.toBe(200);

      expect(await configManager.getConfig('customize:homeWidgets')).toEqual(
        {},
      );
      expect(
        await configManager.getConfig('customize:homePinnedPages'),
      ).toEqual([]);
      expect(
        await configManager.getConfig('customize:homeClassroomPathPrefix'),
      ).toBeUndefined();
    });

    it('persists the three keys and emits the audit activity when an admin sends a valid body', async () => {
      currentUser = buildUser({ admin: true });

      const emitSpy = vi.spyOn(crowi.events.activity, 'emit');

      const res = await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send(validBody)
        .expect(200);

      expect(res.body.customizedParams).toEqual({
        homeWidgets: validBody.homeWidgets,
        homePinnedPages: validBody.homePinnedPages,
        homeClassroomPathPrefix: validBody.homeClassroomPathPrefix,
      });

      expect(await configManager.getConfig('customize:homeWidgets')).toEqual(
        validBody.homeWidgets,
      );
      expect(
        await configManager.getConfig('customize:homePinnedPages'),
      ).toEqual(validBody.homePinnedPages);
      expect(
        await configManager.getConfig('customize:homeClassroomPathPrefix'),
      ).toBe('/Classroom');

      expect(emitSpy).toHaveBeenCalledWith(
        'update',
        expect.anything(),
        expect.objectContaining({ action: 'ADMIN_HOME_WIDGETS_UPDATE' }),
      );

      emitSpy.mockRestore();
    });

    it('accepts a null homeClassroomPathPrefix (unset)', async () => {
      currentUser = buildUser({ admin: true });

      await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send({ ...validBody, homeClassroomPathPrefix: null })
        .expect(200);

      // a null prefix means "unset" -> configManager reports the (undefined) default
      expect(
        await configManager.getConfig('customize:homeClassroomPathPrefix'),
      ).toBeUndefined();
    });

    it('rejects a body whose homePinnedPages is not an array with 400', async () => {
      currentUser = buildUser({ admin: true });

      const res = await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send({ ...validBody, homePinnedPages: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(await configManager.getConfig('customize:homeWidgets')).toEqual(
        {},
      );
    });

    it('rejects a pinned page path without a leading slash with 400', async () => {
      currentUser = buildUser({ admin: true });

      const res = await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send({
          ...validBody,
          homePinnedPages: [{ path: 'Sandbox' }],
        });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /customize-setting/', () => {
    it('includes the three home-widgets keys with their current values', async () => {
      currentUser = buildUser({ admin: true });

      const res = await request(app)
        .get('/_api/v3/customize-setting/')
        .expect(200);

      expect(res.body.customizeParams).toMatchObject({
        homeWidgets: {},
        homePinnedPages: [],
      });
      // unset -> undefined default, omitted from the JSON body
      expect(res.body.customizeParams.homeClassroomPathPrefix).toBeUndefined();
    });

    it('reflects values written through PUT /home-widgets', async () => {
      currentUser = buildUser({ admin: true });

      await request(app)
        .put('/_api/v3/customize-setting/home-widgets')
        .send(validBody)
        .expect(200);

      const res = await request(app)
        .get('/_api/v3/customize-setting/')
        .expect(200);

      expect(res.body.customizeParams).toMatchObject({
        homeWidgets: validBody.homeWidgets,
        homePinnedPages: validBody.homePinnedPages,
        homeClassroomPathPrefix: '/Classroom',
      });
    });
  });
});
