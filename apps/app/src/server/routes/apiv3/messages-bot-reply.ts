import type { Types } from 'mongoose';

import type { ConversationDocument } from '../../models/Conversation';

export const MAX_BOT_REPLY_HISTORY = 20;

// direct: any human message in the bot's 1-on-1 DM always asks the bot.
// group: reuses the @mention infrastructure -- only a message that
// explicitly @mentions the bot asks it, so the bot doesn't reply to every
// group message. broadcast isn't supported yet: the Conversation model's
// broadcast type has no fixed participant list, so "is the bot a
// participant" doesn't apply there -- future work.
export const shouldTriggerBotReply = (
  conversation: Pick<ConversationDocument, 'type' | 'participants'>,
  senderId: Types.ObjectId,
  mentionedUserIds: Types.ObjectId[],
  botUserId: Types.ObjectId,
): boolean => {
  if (senderId.equals(botUserId)) {
    return false; // never reply to the bot's own message
  }
  if (conversation.type === 'direct') {
    return conversation.participants.some((id) => id.equals(botUserId));
  }
  if (conversation.type === 'group') {
    return (
      conversation.participants.some((id) => id.equals(botUserId)) &&
      mentionedUserIds.some((id) => id.equals(botUserId))
    );
  }
  return false;
};

export type BotReplyHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};

type HistorySourceMessage = {
  sender: Types.ObjectId;
  body: string;
};

// Converts stored messages (oldest-to-newest) into the plain role/content
// shape the growiAgent integration expects, capped to the most recent
// MAX_BOT_REPLY_HISTORY entries so the prompt doesn't grow unbounded.
// Attachment-only messages (empty body) are dropped -- the agent only
// reasons over text today.
export const buildBotReplyHistory = (
  messages: HistorySourceMessage[],
  botUserId: Types.ObjectId,
): BotReplyHistoryEntry[] => {
  return messages
    .filter((m) => m.body !== '')
    .slice(-MAX_BOT_REPLY_HISTORY)
    .map((m) => ({
      role: m.sender.equals(botUserId)
        ? ('assistant' as const)
        : ('user' as const),
      content: m.body,
    }));
};
