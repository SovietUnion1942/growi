import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

import { webSearchTool } from './web-search-tool';

type OkResult = {
  result: 'ok';
  hits: { title: string; url: string; snippet?: string }[];
};
type FailureResult = {
  result: 'not_configured' | 'missing_input' | 'error';
  reason: string;
};

const invokeExecute = async (
  inputData: { query?: string; limit?: number } | Record<string, never>,
): Promise<OkResult | FailureResult | { error: true }> => {
  // biome-ignore lint/style/noNonNullAssertion: createTool always wires execute
  const result = await webSearchTool.execute!(inputData as never, {} as never);
  return result as OkResult | FailureResult | { error: true };
};

const isValidationFailure = (
  r: OkResult | FailureResult | { error: true },
): r is { error: true } => 'error' in r && r.error === true;

describe('webSearchTool', () => {
  const originalApiKey = process.env.BRAVE_SEARCH_API_KEY;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.BRAVE_SEARCH_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    if (originalApiKey == null) {
      delete process.env.BRAVE_SEARCH_API_KEY;
    } else {
      process.env.BRAVE_SEARCH_API_KEY = originalApiKey;
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('input validation (zod)', () => {
    it('rejects an empty query before reaching execute body', async () => {
      const result = await invokeExecute({});
      expect(isValidationFailure(result)).toBe(true);
    });
  });

  describe('configuration guard', () => {
    it('returns not_configured when BRAVE_SEARCH_API_KEY is unset', async () => {
      delete process.env.BRAVE_SEARCH_API_KEY;
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await invokeExecute({ query: 'physics' });

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('not_configured');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('search', () => {
    it('returns hits mapped from the Brave Search response', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          web: {
            results: [
              {
                title: 'Physics Club Wikipedia',
                url: 'https://en.wikipedia.org/wiki/Physics_club',
                description: 'A club about physics.',
              },
              // Missing url — should be dropped defensively.
              { title: 'No URL' },
            ],
          },
        }),
      });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await invokeExecute({ query: 'physics club', limit: 3 });

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('ok');
      if (result.result !== 'ok') return;
      expect(result.hits).toEqual([
        {
          title: 'Physics Club Wikipedia',
          url: 'https://en.wikipedia.org/wiki/Physics_club',
          snippet: 'A club about physics.',
        },
      ]);

      const calledUrl = fetchMock.mock.calls[0][0] as URL;
      expect(calledUrl.toString()).toContain('q=physics+club');
      expect(calledUrl.toString()).toContain('count=3');
      const calledOptions = fetchMock.mock.calls[0][1] as {
        headers: Record<string, string>;
      };
      expect(calledOptions.headers['X-Subscription-Token']).toBe(
        'test-api-key',
      );
    });

    it('returns an error result when the API responds non-2xx', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 });
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await invokeExecute({ query: 'physics' });

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('error');
    });

    it('returns an error result when fetch throws', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
      globalThis.fetch = fetchMock as unknown as typeof fetch;

      const result = await invokeExecute({ query: 'physics' });

      expect(isValidationFailure(result)).toBe(false);
      if (isValidationFailure(result)) return;
      expect(result.result).toBe('error');
      if (result.result === 'ok') return;
      expect(result.reason).toBe('network down');
    });
  });
});
