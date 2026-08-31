import { RequestContext } from '@mastra/core/request-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { MastraRequestContextShape } from '../types/request-context';

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

import { fetchDiscordHistoryTool } from './fetch-discord-history-tool';

const buildRequestContext = (): RequestContext<MastraRequestContextShape> =>
  new RequestContext<MastraRequestContextShape>();

type OkResult = {
  result: 'ok';
  context: string;
  oldestMessageId: string | null;
  hasMore: boolean;
};
type FailureResult = { result: 'not_available' | 'error'; reason: string };

const invokeExecute = async (
  inputData:
    | { beforeMessageId?: string; charBudget?: number }
    | Record<string, never>,
  requestContext: RequestContext<MastraRequestContextShape>,
): Promise<OkResult | FailureResult | { error: true }> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await fetchDiscordHistoryTool.execute!(
    inputData as never,
    { requestContext } as never,
  );
  return result as OkResult | FailureResult | { error: true };
};

describe('fetchDiscordHistoryTool', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DISCORD_BOT_HISTORY_URL = 'http://discord-bot:3100';
    process.env.DISCORD_HISTORY_SHARED_SECRET = 'test-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns not_available when discordContext is absent (non-Discord conversation)', async () => {
    const requestContext = buildRequestContext();

    const result = await invokeExecute(
      { beforeMessageId: '123' },
      requestContext,
    );

    expect(result).toMatchObject({ result: 'not_available' });
  });

  it('returns not_available when the endpoint env vars are not configured, even with discordContext present', async () => {
    delete process.env.DISCORD_BOT_HISTORY_URL;
    delete process.env.DISCORD_HISTORY_SHARED_SECRET;
    const requestContext = buildRequestContext();
    requestContext.set('discordContext', {
      channelId: 'chan1',
      beforeMessageId: 'msg1',
    });

    const result = await invokeExecute(
      { beforeMessageId: 'msg1' },
      requestContext,
    );

    expect(result).toMatchObject({ result: 'not_available' });
  });

  it('calls the bot history endpoint with the shared-secret bearer token and returns its result on success', async () => {
    const requestContext = buildRequestContext();
    requestContext.set('discordContext', {
      channelId: 'chan1',
      beforeMessageId: 'msg1',
    });

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          context: 'alice: hi\nbob: hello',
          oldestMessageId: 'msg0',
          hasMore: true,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeExecute(
      { beforeMessageId: 'msg1' },
      requestContext,
    );

    expect(result).toEqual({
      result: 'ok',
      context: 'alice: hi\nbob: hello',
      oldestMessageId: 'msg0',
      hasMore: true,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [
      URL,
      RequestInit,
    ];
    expect(calledUrl.pathname).toBe('/history');
    expect(calledUrl.searchParams.get('channelId')).toBe('chan1');
    expect(calledUrl.searchParams.get('beforeMessageId')).toBe('msg1');
    expect(calledInit.headers).toMatchObject({
      Authorization: 'Bearer test-secret',
    });
  });

  it('returns result "error" when the bot responds with a non-2xx status', async () => {
    const requestContext = buildRequestContext();
    requestContext.set('discordContext', {
      channelId: 'chan1',
      beforeMessageId: 'msg1',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('', { status: 500 })),
    );

    const result = await invokeExecute(
      { beforeMessageId: 'msg1' },
      requestContext,
    );

    expect(result).toMatchObject({ result: 'error' });
  });

  it('returns result "error" when the fetch itself throws (network failure)', async () => {
    const requestContext = buildRequestContext();
    requestContext.set('discordContext', {
      channelId: 'chan1',
      beforeMessageId: 'msg1',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('connection refused')),
    );

    const result = await invokeExecute(
      { beforeMessageId: 'msg1' },
      requestContext,
    );

    expect(result).toEqual({ result: 'error', reason: 'connection refused' });
  });
});
