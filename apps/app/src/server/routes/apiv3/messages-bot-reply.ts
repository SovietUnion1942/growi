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
  // Set only on the entry that carries an image attachment -- the caller
  // (triggerBotReply) fills in the actual base64 data separately for the
  // triggering message only (see growi-agent-dm-reply.ts); historical image
  // messages are represented by the placeholder text below instead of
  // re-sending their bytes on every later turn.
  hasImageAttachment?: boolean;
};

export type HistorySourceMessage = {
  sender: { _id: Types.ObjectId; name?: string; username: string };
  body: string;
  hasImageAttachment?: boolean;
};

// Placeholder body text for a historical (non-triggering) image-only turn --
// keeps the entry non-empty and tells the agent an image was here, without
// re-sending its bytes on every later reply.
const IMAGE_ATTACHMENT_PLACEHOLDER = '(画像を送信しました)';

// Converts stored messages (oldest-to-newest) into the plain role/content
// shape the growiAgent integration expects, capped to the most recent
// MAX_BOT_REPLY_HISTORY entries so the prompt doesn't grow unbounded. A
// message with neither body nor attachment (should not normally occur --
// the route requires one or the other) is dropped as having nothing to say.
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
    .filter((m) => m.body !== '' || m.hasImageAttachment === true)
    .slice(-MAX_BOT_REPLY_HISTORY)
    .map((m) => {
      const bodyOrPlaceholder =
        m.body !== ''
          ? m.body
          : m.hasImageAttachment === true
            ? IMAGE_ATTACHMENT_PLACEHOLDER
            : m.body;
      const isBot = m.sender._id.equals(botUserId);
      if (isBot) {
        return { role: 'assistant' as const, content: bodyOrPlaceholder };
      }
      const speakerLabel = m.sender.name ?? m.sender.username;
      return {
        role: 'user' as const,
        content: `${speakerLabel}: ${bodyOrPlaceholder}`,
        hasImageAttachment: m.hasImageAttachment,
      };
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
