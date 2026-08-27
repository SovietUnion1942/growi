import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import loggerFactory from '~/utils/logger';

const logger = loggerFactory('growi:tools:web-search-tool');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe('Search query for the public web (not the GROWI wiki).'),
  limit: z
    .number()
    .int()
    .positive()
    .max(10)
    .optional()
    .default(5)
    .describe('Maximum number of results to return (default 5, max 10).'),
});

const outputSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('ok'),
    hits: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        snippet: z.string().optional(),
      }),
    ),
  }),
  z.object({
    result: z.enum(['not_configured', 'missing_input', 'error']),
    reason: z.string(),
  }),
]);

export type WebSearchToolOutput = z.infer<typeof outputSchema>;

type SerpApiResponse = {
  organic_results?: {
    title?: string;
    link?: string;
    snippet?: string;
  }[];
};

export const webSearchTool = createTool({
  id: 'web-search-tool',
  description:
    "Search the public internet (NOT the GROWI wiki — use fullTextSearchTool for wiki content). Use this only when the user explicitly asks about something outside the wiki, or when the wiki has no answer and general/current information from the web would help. Every answer built from this tool's results MUST tell the user this information is NOT from the wiki and name the site(s) it came from (see growiAgent's instructions for the exact wording requirement).",
  inputSchema,
  outputSchema,

  execute: async (inputData) => {
    const { query, limit } = inputData;

    if (query.trim().length === 0) {
      return {
        result: 'missing_input' as const,
        reason: 'query must be a non-empty string',
      };
    }

    const apiKey = process.env.SERPAPI_KEY;
    if (apiKey == null || apiKey.trim().length === 0) {
      logger.warn('web-search-tool: SERPAPI_KEY is not configured');
      return {
        result: 'not_configured' as const,
        reason: 'web search is not configured on this GROWI instance',
      };
    }

    try {
      const url = new URL(SERPAPI_ENDPOINT);
      url.searchParams.set('q', query);
      url.searchParams.set('num', String(limit));
      url.searchParams.set('engine', 'google');
      url.searchParams.set('api_key', apiKey);

      const response = await fetch(url);

      if (!response.ok) {
        logger.error(
          `web-search-tool: SerpApi responded with ${response.status}`,
        );
        return {
          result: 'error' as const,
          reason: `web search failed (status ${response.status})`,
        };
      }

      const body: SerpApiResponse = await response.json();
      const hits = (body.organic_results ?? []).flatMap((entry) => {
        if (typeof entry.title !== 'string' || typeof entry.link !== 'string') {
          return [];
        }
        return [
          {
            title: entry.title,
            url: entry.link,
            ...(typeof entry.snippet === 'string' && entry.snippet.length > 0
              ? { snippet: entry.snippet }
              : {}),
          },
        ];
      });

      return {
        result: 'ok' as const,
        hits: hits.slice(0, limit),
      };
    } catch (err) {
      logger.error('web-search-tool failed', err);
      const reason =
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'search_failed';
      return {
        result: 'error' as const,
        reason,
      };
    }
  },
});
