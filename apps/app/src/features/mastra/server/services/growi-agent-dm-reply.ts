import type { IUserHasId } from '@growi/core';
import type { AIV6Type } from '@mastra/core/agent/message-list';
import { RequestContext } from '@mastra/core/request-context';

import type Crowi from '~/server/crowi';
import loggerFactory from '~/utils/logger';

import { mastra } from './mastra-modules';
import type { MastraRequestContextShape } from './mastra-modules/types/request-context';

const logger = loggerFactory('growi:features:mastra:growi-agent-dm-reply');

export type DmConversationTurn = {
  role: 'user' | 'assistant';
  content: string;
};

/**
 * Factory for the DM-chat reply generator, following the "services receive
 * Crowi as a factory argument" convention (see esm-authoring.md) rather than
 * importing the Crowi class — growiAgent's fullTextSearchTool needs
 * `crowi.searchService` on the requestContext, same as post-message.ts.
 *
 * The returned function takes the DM conversation already converted to plain
 * role/content turns (oldest first) and the asking user's full document —
 * Messages-feature concerns (Message model, thread/conversation mapping,
 * bot-user identity) stay entirely on the caller's side. This module is only
 * ever reached via a dynamic `import()` from the Messages route, so pulling
 * in `@mastra/*` here does not violate the no-eager-ai-imports boot rule.
 */
export const createGetGrowiAgentReply = (crowi: Crowi) => {
  return async (
    conversationHistory: DmConversationTurn[],
    askingUser: IUserHasId,
  ): Promise<string> => {
    const growiAgent = mastra.getAgent('growiAgent');

    const requestContext = new RequestContext<MastraRequestContextShape>();
    requestContext.set('user', askingUser);
    requestContext.set('searchService', crowi.searchService);

    // Each turn independently satisfies AIV6Type.ModelMessage's discriminated
    // union (role/content pairs), but a shared object type with role:
    // 'user' | 'assistant' does not structurally distribute into it — mapping
    // through the union's own literal roles resolves the mismatch.
    const modelMessages: AIV6Type.ModelMessage[] = conversationHistory.map(
      (turn) =>
        turn.role === 'user'
          ? { role: 'user', content: turn.content }
          : { role: 'assistant', content: turn.content },
    );

    const result = await growiAgent.generate(modelMessages, {
      requestContext,
      maxSteps: 10,
    });

    logger.info(
      {
        finishReason: result.finishReason,
        totalTokens: result.usage.totalTokens,
      },
      'DM reply generated',
    );

    return result.text;
  };
};
