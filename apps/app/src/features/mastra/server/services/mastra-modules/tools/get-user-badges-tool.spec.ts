import type { IUserHasId } from '@growi/core';
import { RequestContext } from '@mastra/core/request-context';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MastraRequestContextShape } from '../types/request-context';

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

// The tool resolves the User model via `mongoose.model('User')`. Hoist the
// mock fn so it is available inside the `vi.mock('mongoose', ...)` factory.
const mocks = vi.hoisted(() => ({
  findUserByUsername: vi.fn(),
}));

vi.mock('mongoose', () => ({
  default: {
    model: (name: string) => {
      if (name === 'User') {
        return { findUserByUsername: mocks.findUserByUsername };
      }
      throw new Error(`unexpected model requested in spec: ${name}`);
    },
  },
}));

import { getUserBadgesTool } from './get-user-badges-tool';

const buildRequestContext = (): RequestContext<MastraRequestContextShape> =>
  new RequestContext<MastraRequestContextShape>();

const buildMockUser = (): IUserHasId =>
  ({
    _id: 'user1',
    name: 'test-user',
    username: 'test-user',
  }) as unknown as IUserHasId;

type OkResult = {
  result: 'ok';
  username: string;
  name?: string;
  badges: { name: string; level: number | null }[];
};
type FailureResult = {
  result: 'not_found' | 'missing_input' | 'context_error';
  reason: string;
};

const invokeExecute = async (
  inputData: { username?: string } | Record<string, never>,
  requestContext: RequestContext<MastraRequestContextShape>,
): Promise<OkResult | FailureResult | { error: true }> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await getUserBadgesTool.execute!(
    inputData as never,
    { requestContext } as never,
  );
  return result as OkResult | FailureResult | { error: true };
};

const isValidationFailure = (
  r: OkResult | FailureResult | { error: true },
): r is { error: true } => 'error' in r && r.error === true;

describe('getUserBadgesTool', () => {
  beforeEach(() => {
    mocks.findUserByUsername.mockReset();
  });

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
        { username: 'tanaka' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('context_error');
      expect(mocks.findUserByUsername).not.toHaveBeenCalled();
    });
  });

  describe('lookup', () => {
    it('returns not_found when no user matches the username', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findUserByUsername.mockResolvedValue(null);

      const result = await invokeExecute(
        { username: 'nonexistent' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found');
    });

    it("returns the target user's badges, mapping name/level only", async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findUserByUsername.mockResolvedValue({
        username: 'tanaka',
        name: 'Taro Tanaka',
        badgeSummaryCached: [
          {
            name: 'Contributor',
            level: 2,
            iconType: 'materialSymbol',
            iconKey: 'star',
            iconUrl: null,
            badgeType: 'x',
          },
          {
            name: 'Early Bird',
            level: null,
            iconType: 'emoji',
            iconKey: '🐦',
            iconUrl: null,
            badgeType: 'y',
          },
        ],
      });

      const result = await invokeExecute(
        { username: 'tanaka' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.username).toBe('tanaka');
      expect(result.name).toBe('Taro Tanaka');
      expect(result.badges).toEqual([
        { name: 'Contributor', level: 2 },
        { name: 'Early Bird', level: null },
      ]);
    });

    it('returns an empty badges array when the target user has none', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findUserByUsername.mockResolvedValue({
        username: 'no-badges-user',
        badgeSummaryCached: [],
      });

      const result = await invokeExecute(
        { username: 'no-badges-user' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.badges).toEqual([]);
      expect(result.name).toBeUndefined();
    });

    it('returns not_found when the lookup throws', async () => {
      const requestContext = buildRequestContext();
      requestContext.set('user', buildMockUser());
      mocks.findUserByUsername.mockRejectedValue(new Error('db exploded'));

      const result = await invokeExecute(
        { username: 'tanaka' },
        requestContext,
      );

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_found');
      if (result.result === 'ok') return;
      expect(result.reason).toBe('db exploded');
    });
  });
});
