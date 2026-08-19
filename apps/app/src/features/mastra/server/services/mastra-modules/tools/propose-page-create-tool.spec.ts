import type { IUserHasId } from '@growi/core';
import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, it, vi } from 'vitest';

import type { MastraRequestContextShape } from '../types/request-context';
import { proposePageCreateTool } from './propose-page-create-tool';

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

const buildRequestContext = (): RequestContext<MastraRequestContextShape> =>
  new RequestContext<MastraRequestContextShape>();

const buildMockUser = (): IUserHasId =>
  ({
    _id: 'user1',
    name: 'test-user',
    username: 'test-user',
  }) as unknown as IUserHasId;

type ProposeOkResult = {
  result: 'ok';
  page: { path: string; body: string; summary: string };
};
type ProposeFailureResult = {
  result: 'missing_input' | 'context_error';
  reason: string;
};
type ProposeResult = ProposeOkResult | ProposeFailureResult;
type ValidationFailure = { error: true; validationErrors: unknown };

const invokeExecute = async (
  inputData:
    | { path?: string; body?: string; summary?: string }
    | Record<string, never>,
  requestContext: RequestContext<MastraRequestContextShape>,
): Promise<ProposeResult | ValidationFailure> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await proposePageCreateTool.execute!(
    inputData as never,
    { requestContext } as never,
  );
  return result as ProposeResult | ValidationFailure;
};

const isValidationFailure = (
  r: ProposeResult | ValidationFailure,
): r is ValidationFailure => 'error' in r && r.error === true;

describe('proposePageCreateTool', () => {
  describe('input validation (zod)', () => {
    it('rejects an empty input ({}) before reaching execute body', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());

      const result = await invokeExecute({}, requestContext);

      expect(isValidationFailure(result)).toBe(true);
    });
  });

  describe('context guards', () => {
    it('returns context_error when user is missing from requestContext', async () => {
      const requestContext = buildRequestContext();

      const result = await invokeExecute(
        { path: '/new-page', body: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('context_error');
    });
  });

  describe('path validation', () => {
    it('returns missing_input when path does not start with "/"', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());

      const result = await invokeExecute(
        { path: 'no-leading-slash', body: 'x', summary: 'y' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('missing_input');
    });
  });

  describe('success path', () => {
    it('returns ok echoing back the proposed path/body/summary without touching the DB', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());

      const result = await invokeExecute(
        {
          path: '/資料/新しいページ',
          body: '# タイトル\n本文',
          summary: '新規作成の提案',
        },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.page.path).toBe('/資料/新しいページ');
      expect(result.page.body).toBe('# タイトル\n本文');
      expect(result.page.summary).toBe('新規作成の提案');
    });
  });
});
