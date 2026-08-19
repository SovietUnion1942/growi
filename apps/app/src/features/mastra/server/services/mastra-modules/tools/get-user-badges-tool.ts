import type { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import mongoose from 'mongoose';
import { z } from 'zod';

import loggerFactory from '~/utils/logger';

import type { MastraRequestContextShape } from '../types/request-context';

const logger = loggerFactory('growi:tools:get-user-badges-tool');

// Typed view of RequestContext bound to the shared shape so that
// ctx.get('user') is statically inferred.
type TypedRequestContext = RequestContext<MastraRequestContextShape>;

const inputSchema = z.object({
  username: z
    .string()
    .describe(
      'The GROWI username to look up badges for (not a display name — use fullTextSearch or ask the user if only a display name is known).',
    ),
});

const outputSchema = z.discriminatedUnion('result', [
  z.object({
    result: z.literal('ok'),
    username: z.string(),
    name: z.string().optional(),
    badges: z.array(
      z.object({
        name: z.string(),
        level: z.number().int().nullable(),
      }),
    ),
  }),
  z.object({
    result: z.enum(['not_found', 'missing_input', 'context_error']),
    reason: z.string(),
  }),
]);

export type GetUserBadgesToolOutput = z.infer<typeof outputSchema>;

// User.findUserByUsername returns badgeSummaryCached as an array of
// mongoose subdocuments — the tool only reads `.name` / `.level`, so a
// minimal structural type is enough here without pulling in the full
// IUserBadgeSummaryEntry / mongoose document typings.
type UserBadgesLookupResult = {
  username: string;
  name?: string;
  badgeSummaryCached?: { name: string; level: number | null }[];
} | null;

export const getUserBadgesTool = createTool({
  id: 'get-user-badges-tool',
  description:
    "Look up the badges (achievements) another GROWI user has earned, by their username. Badges are shown publicly on user profile pages, so this is safe to call for any username, not just the current user — use the identity note for the current user's own badges instead of calling this on themselves.",
  inputSchema,
  outputSchema,

  execute: async (inputData, context) => {
    const { username } = inputData;

    const ctx = context.requestContext as TypedRequestContext;
    const user = ctx.get('user');

    // Defensive context guard, mirrors the other tools in this module.
    if (user == null) {
      logger.warn('get-user-badges-tool: missing user in requestContext');
      return {
        result: 'context_error' as const,
        reason: 'user missing in requestContext',
      };
    }

    if (username.length === 0) {
      return {
        result: 'missing_input' as const,
        reason: 'username must be a non-empty string',
      };
    }

    try {
      // The User model is a plain JS mongoose model (server/models/user) with
      // no exported TS type, so `findUserByUsername` is accessed through a
      // minimal structural cast rather than `mongoose.model<T>()` (which
      // would only type the Document methods, not the static).
      const User = mongoose.model('User') as unknown as {
        findUserByUsername: (u: string) => Promise<UserBadgesLookupResult>;
      };
      const targetUser = await User.findUserByUsername(username);

      if (targetUser == null) {
        return {
          result: 'not_found' as const,
          reason: `no user found with username "${username}"`,
        };
      }

      const badges = (targetUser.badgeSummaryCached ?? []).map((badge) => ({
        name: badge.name,
        level: badge.level,
      }));

      return {
        result: 'ok' as const,
        username: targetUser.username,
        ...(targetUser.name != null && targetUser.name.length > 0
          ? { name: targetUser.name }
          : {}),
        badges,
      };
    } catch (err) {
      logger.error('get-user-badges-tool failed', err);
      return {
        result: 'not_found' as const,
        reason:
          err instanceof Error && err.message.length > 0
            ? err.message
            : 'lookup_failed',
      };
    }
  },
});
