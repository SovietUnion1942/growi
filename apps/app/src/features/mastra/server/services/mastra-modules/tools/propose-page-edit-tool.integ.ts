import type { IUserHasId } from '@growi/core';
import { RequestContext } from '@mastra/core/request-context';
import mongoose, { type Model } from 'mongoose';

import { getInstance } from '^/test/setup/crowi';

import type { PageDocument, PageModel } from '~/server/models/page';

import type { MastraRequestContextShape } from '../types/request-context';
import { proposePageEditTool } from './propose-page-edit-tool';

// Integration test for the Mastra propose-page-edit tool.
//
// Approach: real MongoDB + real Page / Revision / User models. This tool
// never writes to the database — it only reads the current page/revision via
// the same grant-aware finders as get-page-content-tool, so this suite
// exercises the same permission matrix at a smaller scale (the finders
// themselves are already covered exhaustively by get-page-content-tool.integ.ts).

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

const WORKER_ID = process.env.VITEST_WORKER_ID ?? '1';

type ProposeOkResult = {
  result: 'ok';
  page: {
    pageId: string;
    path: string;
    revisionId: string;
    currentBody: string;
    newBody: string;
    summary: string;
  };
};
type ProposeFailureResult = {
  result: 'not_found_or_forbidden' | 'missing_input' | 'context_error';
  reason: string;
};
type ProposeResult = ProposeOkResult | ProposeFailureResult;

const invokeExecute = async (
  inputData: {
    pageId?: string;
    pagePath?: string;
    newBody: string;
    summary: string;
  },
  requestContext: RequestContext<MastraRequestContextShape>,
): Promise<ProposeResult> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await proposePageEditTool.execute!(
    inputData as never,
    { requestContext } as never,
  );
  return result as ProposeResult;
};

function assertOk(result: ProposeResult): asserts result is ProposeOkResult {
  expect(result.result).toBe('ok');
}

function assertFailure(
  result: ProposeResult,
): asserts result is ProposeFailureResult {
  expect(result.result).not.toBe('ok');
}

describe('proposePageEditTool (integration)', () => {
  let Page: PageModel;
  let User: Model<IUserHasId>;
  let Revision: Model<{
    pageId: mongoose.Types.ObjectId;
    body: string;
    format: string;
    author: mongoose.Types.ObjectId;
  }>;

  let userA: IUserHasId;
  let userB: IUserHasId;

  const pagePathPublic = `/propose-page-edit-integ/${WORKER_ID}/public`;
  const pagePathOwner = `/propose-page-edit-integ/${WORKER_ID}/owner`;
  const bodyPublic = `Public page body for ${WORKER_ID}`;
  const bodyOwner = `Owner page body for ${WORKER_ID}`;

  let publicPageId: string;
  let ownerPageId: string;

  beforeAll(async () => {
    await getInstance();

    type RevisionDoc = {
      pageId: mongoose.Types.ObjectId;
      body: string;
      format: string;
      author: mongoose.Types.ObjectId;
    };
    Page = mongoose.model<PageDocument, PageModel>('Page');
    User = mongoose.model<IUserHasId>('User');
    Revision = mongoose.model<RevisionDoc>('Revision');

    const userAName = `propose-page-edit-integ-userA-${WORKER_ID}`;
    const userBName = `propose-page-edit-integ-userB-${WORKER_ID}`;
    await User.deleteMany({ username: { $in: [userAName, userBName] } });
    const insertedUsers = await User.insertMany([
      {
        name: userAName,
        username: userAName,
        email: `${userAName}@example.com`,
      },
      {
        name: userBName,
        username: userBName,
        email: `${userBName}@example.com`,
      },
    ]);
    userA = insertedUsers[0];
    userB = insertedUsers[1];

    await Page.deleteMany({
      path: { $in: [pagePathPublic, pagePathOwner] },
    });

    const publicPage = await Page.create({
      path: pagePathPublic,
      grant: Page.GRANT_PUBLIC,
      creator: userA._id,
      lastUpdateUser: userA._id,
    });
    const ownerPage = await Page.create({
      path: pagePathOwner,
      grant: Page.GRANT_OWNER,
      grantedUsers: [userA._id],
      creator: userA._id,
      lastUpdateUser: userA._id,
    });

    const revisions = await Revision.insertMany([
      {
        pageId: publicPage._id,
        body: bodyPublic,
        format: 'markdown',
        author: userA._id,
      },
      {
        pageId: ownerPage._id,
        body: bodyOwner,
        format: 'markdown',
        author: userA._id,
      },
    ]);

    publicPage.revision = revisions[0]._id;
    ownerPage.revision = revisions[1]._id;
    await publicPage.save();
    await ownerPage.save();

    publicPageId = String(publicPage._id);
    ownerPageId = String(ownerPage._id);
  }, 60_000);

  afterAll(async () => {
    try {
      await Revision.deleteMany({
        pageId: {
          $in: [
            new mongoose.Types.ObjectId(publicPageId),
            new mongoose.Types.ObjectId(ownerPageId),
          ],
        },
      });
    } catch {
      // ignore
    }
    try {
      await Page.deleteMany({
        path: { $in: [pagePathPublic, pagePathOwner] },
      });
    } catch {
      // ignore
    }
    try {
      await User.deleteMany({ _id: { $in: [userA?._id, userB?._id] } });
    } catch {
      // ignore
    }
  }, 30_000);

  const buildRequestContext = (
    user: IUserHasId,
  ): RequestContext<MastraRequestContextShape> => {
    const ctx = new RequestContext<MastraRequestContextShape>();
    ctx.set('user', user);
    return ctx;
  };

  describe('GRANT_PUBLIC', () => {
    it('returns ok with the current body, the proposed body, and a revisionId for any viewer', async () => {
      const result = await invokeExecute(
        {
          pageId: publicPageId,
          newBody: 'proposed new body',
          summary: 'test edit',
        },
        buildRequestContext(userB),
      );

      assertOk(result);
      expect(result.page.path).toBe(pagePathPublic);
      expect(result.page.pageId).toBe(publicPageId);
      expect(result.page.currentBody).toBe(bodyPublic);
      expect(result.page.newBody).toBe('proposed new body');
      expect(result.page.summary).toBe('test edit');
      expect(typeof result.page.revisionId).toBe('string');
      expect(result.page.revisionId.length).toBeGreaterThan(0);
    });

    it('resolves via pagePath the same as via pageId', async () => {
      const result = await invokeExecute(
        {
          pagePath: pagePathPublic,
          newBody: 'proposed new body',
          summary: 'test edit',
        },
        buildRequestContext(userA),
      );

      assertOk(result);
      expect(result.page.path).toBe(pagePathPublic);
      expect(result.page.currentBody).toBe(bodyPublic);
    });
  });

  describe('GRANT_OWNER', () => {
    it('returns ok for the owner (A)', async () => {
      const result = await invokeExecute(
        {
          pageId: ownerPageId,
          newBody: 'proposed new body',
          summary: 'test edit',
        },
        buildRequestContext(userA),
      );

      assertOk(result);
      expect(result.page.currentBody).toBe(bodyOwner);
    });

    // This tool intentionally only enforces VIEWER permission (see the code
    // comment in propose-page-edit-tool.ts) — the real edit-authorization
    // gate is the existing update-page API, exercised at approval time. A
    // non-owner can still see a proposal preview here; they simply cannot
    // ever get it applied, since the update API re-checks permission.
    it('returns not_found_or_forbidden for a non-owner (B), matching the viewer-permission finder', async () => {
      const result = await invokeExecute(
        {
          pageId: ownerPageId,
          newBody: 'proposed new body',
          summary: 'test edit',
        },
        buildRequestContext(userB),
      );

      assertFailure(result);
      expect(result.result).toBe('not_found_or_forbidden');
    });
  });

  describe('non-existent page', () => {
    it('returns not_found_or_forbidden for a random non-existent ObjectId', async () => {
      const nonExistentId = new mongoose.Types.ObjectId().toString();

      const result = await invokeExecute(
        { pageId: nonExistentId, newBody: 'x', summary: 'y' },
        buildRequestContext(userA),
      );

      assertFailure(result);
      expect(result.result).toBe('not_found_or_forbidden');
    });
  });
});
