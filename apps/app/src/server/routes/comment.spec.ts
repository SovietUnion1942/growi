import type { Request, Response } from 'express';

// `comment.js`'s `api.get` fetches comments via Prisma (`include: { creator:
// true }`). Prisma's `users` mirror has no `badgeSummaryCached` column (no
// migration is planned for it), so this test proves the route merges it in
// from a single batched Mongoose `User.find(...).lean()` lookup keyed by
// distinct creator id, without touching Prisma's schema.
const mockFindCommentsByPageId = vi.hoisted(() => vi.fn());
vi.mock('~/utils/prisma', () => ({
  prisma: {
    comments: {
      findCommentsByPageId: mockFindCommentsByPageId,
    },
  },
}));

vi.mock('mongoose', async (importOriginal) => {
  const actual = await importOriginal<typeof import('mongoose')>();
  return {
    ...actual,
    default: {
      ...actual.default,
      model: vi.fn(),
    },
  };
});

vi.mock('~/features/comment/server', () => ({
  CommentEvent: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' },
  commentEvent: { emit: vi.fn() },
}));

// biome-ignore lint/suspicious/noExplicitAny: comment.js is a plain JS module, no exported types
let setup: any;

import mongoose from 'mongoose';

const mockMongooseModel = vi.mocked(mongoose.model);

const buildComment = (overrides: Record<string, unknown> = {}) => ({
  id: 'comment1',
  pageId: 'page1',
  creatorId: 'user1',
  revisionId: 'revision1',
  replyToId: null,
  comment: 'hello',
  commentPosition: -1,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  creator: {
    id: 'user1',
    _id: 'user1',
    username: 'alice',
    name: 'Alice',
    email: 'alice@example.com',
    isEmailPublished: false,
  },
  ...overrides,
});

const buildCrowi = () => ({
  models: {
    Page: {
      isAccessiblePageByViewer: vi.fn().mockResolvedValue(true),
    },
  },
  events: { activity: { emit: vi.fn() } },
  globalNotificationService: { fire: vi.fn() },
  userNotificationService: { fire: vi.fn() },
  commentService: {},
});

const buildReqRes = (query: Record<string, unknown>) => {
  const req = {
    query,
    isSharedPage: false,
    user: { _id: 'user1' },
  } as unknown as Request;
  const json = vi.fn();
  const res = { json } as unknown as Response;
  return { req, res, json };
};

describe('comment.js routes: api.get badgeSummaryCached merge', () => {
  beforeEach(async () => {
    vi.resetModules();
    mockFindCommentsByPageId.mockReset();
    mockMongooseModel.mockReset();
    ({ setup } = await import('./comment.js'));
  });

  it('merges badgeSummaryCached from a batched Mongoose lookup when present', async () => {
    mockFindCommentsByPageId.mockResolvedValue([buildComment()]);

    const badgeSummaryCached = [
      { badgeType: 'badge-type-1', iconKey: 'star', name: 'Top', level: 1 },
    ];
    const lean = vi
      .fn()
      .mockResolvedValue([{ _id: 'user1', badgeSummaryCached }]);
    const find = vi.fn().mockReturnValue({ lean });
    mockMongooseModel.mockReturnValue({ find } as never);

    const { req, res, json } = buildReqRes({ page_id: 'page1' });
    const crowi = buildCrowi();
    const actions = setup(crowi, {});

    await actions.api.get(req, res);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(
      { _id: { $in: ['user1'] } },
      'badgeSummaryCached',
    );

    const response = json.mock.calls[0][0];
    expect(response.ok).toBe(true);
    expect(response.comments[0].creator.badgeSummaryCached).toEqual(
      badgeSummaryCached,
    );
  });

  it('leaves badgeSummaryCached as an empty array when Mongoose has no matching user', async () => {
    mockFindCommentsByPageId.mockResolvedValue([buildComment()]);

    const lean = vi.fn().mockResolvedValue([]);
    const find = vi.fn().mockReturnValue({ lean });
    mockMongooseModel.mockReturnValue({ find } as never);

    const { req, res, json } = buildReqRes({ page_id: 'page1' });
    const crowi = buildCrowi();
    const actions = setup(crowi, {});

    await actions.api.get(req, res);

    const response = json.mock.calls[0][0];
    expect(response.comments[0].creator.badgeSummaryCached).toEqual([]);
  });

  it('does not call the Mongoose lookup at all when there are no comments', async () => {
    mockFindCommentsByPageId.mockResolvedValue([]);

    const { req, res, json } = buildReqRes({ page_id: 'page1' });
    const crowi = buildCrowi();
    const actions = setup(crowi, {});

    await actions.api.get(req, res);

    expect(mockMongooseModel).not.toHaveBeenCalled();
    const response = json.mock.calls[0][0];
    expect(response.comments).toEqual([]);
  });

  it('batches a single Mongoose query for multiple comments sharing the same creator (no N+1)', async () => {
    mockFindCommentsByPageId.mockResolvedValue([
      buildComment({ id: 'comment1' }),
      buildComment({ id: 'comment2' }),
    ]);

    const badgeSummaryCached = [
      { badgeType: 'badge-type-1', iconKey: 'star', name: 'Top', level: 1 },
    ];
    const lean = vi
      .fn()
      .mockResolvedValue([{ _id: 'user1', badgeSummaryCached }]);
    const find = vi.fn().mockReturnValue({ lean });
    mockMongooseModel.mockReturnValue({ find } as never);

    const { req, res, json } = buildReqRes({ page_id: 'page1' });
    const crowi = buildCrowi();
    const actions = setup(crowi, {});

    await actions.api.get(req, res);

    expect(find).toHaveBeenCalledTimes(1);
    expect(find).toHaveBeenCalledWith(
      { _id: { $in: ['user1'] } },
      'badgeSummaryCached',
    );

    const response = json.mock.calls[0][0];
    expect(response.comments).toHaveLength(2);
    expect(response.comments[0].creator.badgeSummaryCached).toEqual(
      badgeSummaryCached,
    );
    expect(response.comments[1].creator.badgeSummaryCached).toEqual(
      badgeSummaryCached,
    );
  });
});
