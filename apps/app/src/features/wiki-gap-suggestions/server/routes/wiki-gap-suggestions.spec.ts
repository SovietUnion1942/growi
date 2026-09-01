import type { NextFunction, Request, Response } from 'express';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

type MockUser = { _id: string };

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

const findMock = vi.hoisted(() => vi.fn());
vi.mock('../models/wiki-gap-query-model', () => ({
  default: { find: findMock },
}));

const enabled = vi.hoisted(() => ({ value: true }));
vi.mock('../is-wiki-gap-suggestions-enabled', () => ({
  isWikiGapSuggestionsEnabled: () => enabled.value,
}));

import { setup } from './wiki-gap-suggestions';

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

function buildApp() {
  const app = express();
  withApiV3Helpers(app);
  // biome-ignore lint/suspicious/noExplicitAny: only tmpDir/socketIoService-shaped fields the route factory's Crowi param never actually reads
  const router = setup({} as any);
  app.use('/_api/v3/wiki-gap-suggestions', router);
  return app;
}

type MockDoc = {
  rawQueryExample: string;
  count: number;
  lastSeenAt: Date;
};

const buildQueryChain = (docs: MockDoc[]) => {
  const chain = {
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(docs),
  };
  return chain;
};

describe('/wiki-gap-suggestions route', () => {
  beforeEach(() => {
    currentUser = { _id: 'user-1' };
    findMock.mockReset();
    enabled.value = true;
  });

  it('404s when the feature is disabled', async () => {
    enabled.value = false;
    const res = await request(buildApp()).get('/_api/v3/wiki-gap-suggestions');
    expect(res.status).toBe(404);
    expect(findMock).not.toHaveBeenCalled();
  });

  it('returns 401 when not logged in', async () => {
    currentUser = undefined;
    findMock.mockReturnValue(buildQueryChain([]));
    const app = buildApp();

    const res = await request(app).get('/_api/v3/wiki-gap-suggestions');

    expect(res.status).toBe(401);
  });

  it('returns suggestions sorted by count desc, mapped to the client shape', async () => {
    const lastSeenAt = new Date('2027-01-01T00:00:00Z');
    findMock.mockReturnValue(
      buildQueryChain([
        { rawQueryExample: 'physics club schedule', count: 5, lastSeenAt },
        { rawQueryExample: 'exam archive', count: 2, lastSeenAt },
      ]),
    );
    const app = buildApp();

    const res = await request(app).get('/_api/v3/wiki-gap-suggestions');

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([
      {
        query: 'physics club schedule',
        count: 5,
        lastSeenAt: lastSeenAt.toISOString(),
      },
      { query: 'exam archive', count: 2, lastSeenAt: lastSeenAt.toISOString() },
    ]);
  });

  it('defaults the limit to 20 and caps a caller-supplied limit at 50', async () => {
    const chain = buildQueryChain([]);
    findMock.mockReturnValue(chain);
    const app = buildApp();

    await request(app).get('/_api/v3/wiki-gap-suggestions');
    expect(chain.limit).toHaveBeenCalledWith(20);

    await request(app).get('/_api/v3/wiki-gap-suggestions?limit=999');
    expect(chain.limit).toHaveBeenCalledWith(50);
  });
});
