import type { Types } from 'mongoose';

import type {
  ConversationDocument,
  ConversationType,
} from '../../models/Conversation';

export const MAX_BOT_REPLY_HISTORY = 20;

// direct: any human message in the bot's 1-on-1 DM always asks the bot.
// group: reuses the @mention infrastructure -- only a message that
// explicitly @mentions the bot asks it, so the bot doesn't reply to every
// group message. broadcast: same @mention-only condition as group, but
// without the "is the bot a participant" check -- broadcast has no fixed
// participant list (membership is implicit), so mentioning the bot (which
// resolveMentionedUserIds already resolves against "any existing user" for
// broadcast) is the only signal available. The caller is responsible for
// keeping the bot's broadcast reply's push notification scoped to whoever
// sent the mention, not the whole broadcast audience -- see
// getBotReplyPushRecipientIds.
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
  if (conversation.type === 'broadcast') {
    return mentionedUserIds.some((id) => id.equals(botUserId));
  }
  return false;
};

export type BotReplyHistoryEntry = {
  role: 'user' | 'assistant';
  content: string;
};

export type HistorySourceMessage = {
  sender: { _id: Types.ObjectId; name?: string; username: string };
  body: string;
};

// Converts stored messages (oldest-to-newest) into the plain role/content
// shape the growiAgent integration expects, capped to the most recent
// MAX_BOT_REPLY_HISTORY entries so the prompt doesn't grow unbounded.
// Attachment-only messages (empty body) are dropped -- the agent only
// reasons over text today.
//
// Human turns are prefixed with the speaker's display name ("Alice: ...").
// This is redundant in a 1-on-1 DM (only one possible human speaker) but
// necessary in a group: without it every participant's message collapses
// into the same undifferentiated 'user' role, and the agent can't tell who
// said what.
export const buildBotReplyHistory = (
  messages: HistorySourceMessage[],
  botUserId: Types.ObjectId,
): BotReplyHistoryEntry[] => {
  return messages
    .filter((m) => m.body !== '')
    .slice(-MAX_BOT_REPLY_HISTORY)
    .map((m) => {
      const isBot = m.sender._id.equals(botUserId);
      if (isBot) {
        return { role: 'assistant' as const, content: m.body };
      }
      const speakerLabel = m.sender.name ?? m.sender.username;
      return { role: 'user' as const, content: `${speakerLabel}: ${m.body}` };
    });
};

// The bot's reply pushes to the same audience a human's message would,
// EXCEPT in broadcast: pushing to the whole broadcast audience every time
// any single person @mentions the bot would be disruptive noise for
// everyone else, so a broadcast bot-reply notifies only whoever sent the
// mention (mirrors the existing mention-bypasses-mute precedent: an
// explicit @mention should reach its target regardless of their own mute
// state).
export const getBotReplyPushRecipientIds = (
  conversationType: ConversationType,
  askingUserId: Types.ObjectId,
  defaultRecipientIds: Types.ObjectId[],
): Types.ObjectId[] => {
  if (conversationType === 'broadcast') {
    return [askingUserId];
  }
  return defaultRecipientIds;
};
