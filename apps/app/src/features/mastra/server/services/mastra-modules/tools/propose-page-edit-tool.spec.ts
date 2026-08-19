import type { IUserHasId } from '@growi/core';
import { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MastraRequestContextShape } from '../types/request-context';
import { proposePageEditTool } from './propose-page-edit-tool';

// Suppress logger noise from the tool under test, mirroring
// get-page-content-tool.spec.ts.
vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

// The tool resolves the Page model via `mongoose.model('Page')`. Hoist mock
// fns so they are available inside the `vi.mock('mongoose', ...)` factory.
const mocks = vi.hoisted(() => ({
  findByIdAndViewer: vi.fn(),
  findByPathAndViewer: vi.fn(),
  populateDataToShowRevision: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    model: (name: string) => {
      if (name === 'Page') {
        return {
          findByIdAndViewer: mocks.findByIdAndViewer,
          findByPathAndViewer: mocks.findByPathAndViewer,
        };
      }
      throw new Error(`unexpected model requested in spec: ${name}`);
    },
  },
}));

vi.mock('~/server/models/obsolete-page', () => ({
  populateDataToShowRevision: mocks.populateDataToShowRevision,
}));

const buildRequestContext = (): RequestContext<MastraRequestContextShape> =>
  new RequestContext<MastraRequestContextShape>();

const buildMockUser = (): IUserHasId =>
  ({
    _id: 'user1',
    name: 'test-user',
    username: 'test-user',
  }) as unknown as IUserHasId;

type MockPage = {
  _id: string;
  path: string;
  revision: unknown;
  populate: ReturnType<typeof vi.fn>;
};

const buildMockPage = (overrides: Partial<MockPage> = {}): MockPage => ({
  _id: 'page-1-id',
  path: '/p1',
  revision: 'revision-id-placeholder',
  populate: vi.fn(),
  ...overrides,
});

// Wires findByIdAndViewer/findByPathAndViewer to return a mockPage and has
// populateDataToShowRevision attach { _id, body } onto it.
const setupPageWithRevision = (
  currentBody: string,
  revisionId = 'rev-1',
  viaPath = false,
): MockPage => {
  const mockPage = buildMockPage();
  if (viaPath) {
    mocks.findByPathAndViewer.mockResolvedValue(mockPage);
  } else {
    mocks.findByIdAndViewer.mockResolvedValue(mockPage);
  }
  mocks.populateDataToShowRevision.mockImplementation((page: MockPage) => {
    page.revision = { _id: revisionId, body: currentBody };
    return page;
  });
  return mockPage;
};

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

type ValidationFailure = { error: true; validationErrors: unknown };

const invokeExecute = async (
  inputData:
    | {
        pageId?: string;
        pagePath?: string;
        newBody?: string;
        summary?: string;
      }
    | Record<string, never>,
  requestContext: RequestContext<MastraRequestContextShape>,
): Promise<ProposeResult | ValidationFailure> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await proposePageEditTool.execute!(
    inputData as never,
    { requestContext } as never,
  );
  return result as ProposeResult | ValidationFailure;
};

const isValidationFailure = (
  r: ProposeResult | ValidationFailure,
): r is ValidationFailure => 'error' in r && r.error === true;

describe('proposePageEditTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.populateDataToShowRevision.mockImplementation(
      async (page: unknown) => page,
    );
  });

  describe('input validation (zod refine)', () => {
    it('rejects an empty input ({}) before reaching execute body', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());

      const result = await invokeExecute({}, requestContext);

      expect(isValidationFailure(result)).toBe(true);
      expect(mocks.findByIdAndViewer).not.toHaveBeenCalled();
      expect(mocks.findByPathAndViewer).not.toHaveBeenCalled();
    });
  });

  describe('context guards', () => {
    it('returns context_error when user is missing from requestContext', async () => {
      const requestContext = buildRequestContext();

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('context_error');
      expect(mocks.findByIdAndViewer).not.toHaveBeenCalled();
    });
  });

  describe('not_found_or_forbidden', () => {
    it('returns not_found_or_forbidden when findByIdAndViewer resolves null', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findByIdAndViewer.mockResolvedValue(null);

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found_or_forbidden');
    });

    it('returns not_found_or_forbidden when the resolved page has no current revision', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      const mockPage = buildMockPage({ revision: null });
      mocks.findByIdAndViewer.mockResolvedValue(mockPage);
      mocks.populateDataToShowRevision.mockImplementation(
        async (page: MockPage) => page,
      );

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found_or_forbidden');
    });
  });

  describe('AI-protected pages', () => {
    it('refuses to propose an edit for the member-directory page even though the viewer can see it', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      const mockPage = buildMockPage({ path: '/メンバー/アカウント対応表' });
      mocks.findByIdAndViewer.mockResolvedValue(mockPage);

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found_or_forbidden');
      // The guard fires before any revision is read.
      expect(mocks.populateDataToShowRevision).not.toHaveBeenCalled();
    });
  });

  describe('success path', () => {
    it('returns ok with current + proposed body and the revisionId to send back on approval', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      setupPageWithRevision('old content', 'rev-42');

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'new content', summary: 'fix typo' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.page.pageId).toBe('page-1-id');
      expect(result.page.path).toBe('/p1');
      expect(result.page.revisionId).toBe('rev-42');
      expect(result.page.currentBody).toBe('old content');
      expect(result.page.newBody).toBe('new content');
      expect(result.page.summary).toBe('fix typo');
      expect(mocks.findByPathAndViewer).not.toHaveBeenCalled();
    });

    it('resolves via pagePath when pageId is omitted', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      setupPageWithRevision('old content', 'rev-1', /* viaPath */ true);

      const result = await invokeExecute(
        { pagePath: '/p1', newBody: 'new content', summary: 'update' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.page.path).toBe('/p1');
      expect(mocks.findByIdAndViewer).not.toHaveBeenCalled();
    });
  });

  describe('exception handling', () => {
    it('converts thrown errors into not_found_or_forbidden without throwing out of execute', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findByIdAndViewer.mockRejectedValue(new Error('boom'));

      const result = await invokeExecute(
        { pageId: 'abc', newBody: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found_or_forbidden');
      if (result.result !== 'ok') {
        expect(
          result.reason === 'boom' || result.reason === 'fetch_failed',
        ).toBe(true);
      }
    });
  });
});
