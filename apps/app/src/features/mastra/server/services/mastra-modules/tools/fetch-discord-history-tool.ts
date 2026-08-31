import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import loggerFactory from '~/utils/logger';

import type { MastraRequestContextShape } from '../types/request-context';

const logger = loggerFactory('growi:tools:fetch-discord-history-tool');

// Typed view of RequestContext bound to the shared shape so that
// ctx.get('discordContext') is statically inferred.
type TypedRequestContext = RequestContext<MastraRequestContextShape>;

// Kept in sync by hand with discord-bot/src/channel-context.ts's own
// defaults (same char-budget-not-message-count reasoning: a fixed budget
// keeps a single call's cost predictable regardless of whether the messages
// in that window happen to be short or long).
const DEFAULT_CHAR_BUDGET = 1200;
const MAX_CHAR_BUDGET = 4000;
const DEFAULT_MAX_IMAGES = 4;
const MAX_MAX_IMAGES = 8;

const inputSchema = z.object({
  beforeMessageId: z
    .string()
    .describe(
      'Fetch messages older than this Discord message id. On the first call, use the id you were given as the conversation context boundary (the message that triggered this turn); to page further back, use the `oldestMessageId` this tool returned last time.',
    ),
  charBudget: z
    .number()
    .int()
    .positive()
    .max(MAX_CHAR_BUDGET)
    .optional()
    .default(DEFAULT_CHAR_BUDGET)
    .describe(
      `Roughly how many characters of transcript to fetch this call (default ${DEFAULT_CHAR_BUDGET}, max ${MAX_CHAR_BUDGET}). Keep this at the default unless you have a specific reason to widen or narrow it — a bigger budget costs more.`,
    ),
});

const outputSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('ok'),
    context: z
      .string()
      .describe('"username: message" transcript, oldest first.'),
    oldestMessageId: z
      .string()
      .nullable()
      .describe(
        'Pass this as beforeMessageId on your next call to page further back. null means nothing was fetched.',
      ),
    hasMore: z
      .boolean()
      .describe(
        'True if the channel likely has still-older messages beyond oldestMessageId.',
      ),
  }),
  z.object({
    result: z.enum(['not_available', 'error']),
    reason: z.string(),
  }),
]);

export type FetchDiscordHistoryToolOutput = z.infer<typeof outputSchema>;

// Text-only by design: a tool result is structured data the model reads
// back as text, not actual multimodal content -- there is no way to hand it
// an image the way a user message part can. Images from the always-attached
// quick-peek (discord-bot's message-handler.ts) are the only images
// growiAgent ever actually sees; deep-history images are simply noted as
// "[画像添付]" in this tool's transcript text, same as channel-context.ts's
// formatRecentContext marks them.
export const fetchDiscordHistoryTool = createTool({
  id: 'fetch-discord-history-tool',
  description:
    "Page further back into the Discord channel's message history than the small excerpt already given to you in this conversation's context. Only call this when you judge the context you already have is genuinely not enough to answer — most turns do not need it. Only meaningful when this conversation originated on Discord; it returns 'not_available' otherwise (e.g. the browser chat or Messages DM). Call it again with the previous call's `oldestMessageId` to page further back if one call still isn't enough.",
  inputSchema,
  outputSchema,

  execute: async (inputData, context) => {
    const { beforeMessageId, charBudget } = inputData;
    const maxImages = DEFAULT_MAX_IMAGES;

    const ctx = context.requestContext as TypedRequestContext;
    const discordContext = ctx.get('discordContext');

    if (discordContext == null) {
      return {
        result: 'not_available' as const,
        reason:
          'this conversation did not originate on Discord, so there is no channel history to page into',
      };
    }

    const baseUrl = process.env.DISCORD_BOT_HISTORY_URL;
    const sharedSecret = process.env.DISCORD_HISTORY_SHARED_SECRET;
    if (
      baseUrl == null ||
      baseUrl.trim().length === 0 ||
      sharedSecret == null ||
      sharedSecret.trim().length === 0
    ) {
      logger.warn(
        'fetch-discord-history-tool: DISCORD_BOT_HISTORY_URL / DISCORD_HISTORY_SHARED_SECRET not configured',
      );
      return {
        result: 'not_available' as const,
        reason:
          'the Discord history endpoint is not configured on this GROWI instance',
      };
    }

    try {
      const url = new URL('/history', baseUrl);
      url.searchParams.set('channelId', discordContext.channelId);
      url.searchParams.set('beforeMessageId', beforeMessageId);
      url.searchParams.set('charBudget', String(charBudget));
      url.searchParams.set(
        'maxImages',
        String(Math.min(maxImages, MAX_MAX_IMAGES)),
      );

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${sharedSecret}` },
      });

      if (!response.ok) {
        logger.error(
          `fetch-discord-history-tool: bot responded with ${response.status}`,
        );
        return {
          result: 'error' as const,
          reason: `history fetch failed (status ${response.status})`,
        };
      }

      const body = (await response.json()) as {
        context: string;
        oldestMessageId: string | null;
        hasMore: boolean;
      };

      return {
        result: 'ok' as const,
        context: body.context,
        oldestMessageId: body.oldestMessageId,
        hasMore: body.hasMore,
      };
    } catch (err) {
      logger.error('fetch-discord-history-tool failed', err);
      const reason =
        err instanceof Error && err.message.length > 0
          ? err.message
          : 'history_fetch_failed';
      return {
        result: 'error' as const,
        reason,
      };
    }
  },
});
