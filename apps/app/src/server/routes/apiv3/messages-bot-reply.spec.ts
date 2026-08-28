import { Types } from 'mongoose';

import {
  buildBotReplyHistory,
  getBotReplyPushRecipientIds,
  shouldTriggerBotReply,
} from './messages-bot-reply';

const botId = new Types.ObjectId();
const humanId = new Types.ObjectId();
const otherHumanId = new Types.ObjectId();
const human = { _id: humanId, name: 'Alice', username: 'alice' };
const otherHuman = { _id: otherHumanId, name: 'Bob', username: 'bob' };
const bot = { _id: botId, name: 'GROWI AI', username: 'growi-ai' };

describe('shouldTriggerBotReply', () => {
  it('triggers for a direct conversation with the bot as the other participant', () => {
    const conversation = {
      type: 'direct' as const,
      participants: [humanId, botId],
    };
    expect(shouldTriggerBotReply(conversation, humanId, [], botId)).toBe(true);
  });

  it('does not trigger for a direct conversation between two humans', () => {
    const conversation = {
      type: 'direct' as const,
      participants: [humanId, otherHumanId],
    };
    expect(shouldTriggerBotReply(conversation, humanId, [], botId)).toBe(false);
  });

  it('does not trigger for the bot replying to its own message', () => {
    const conversation = {
      type: 'direct' as const,
      participants: [humanId, botId],
    };
    expect(shouldTriggerBotReply(conversation, botId, [], botId)).toBe(false);
  });

  it('triggers for a group conversation only when the bot is explicitly mentioned', () => {
    const conversation = {
      type: 'group' as const,
      participants: [humanId, otherHumanId, botId],
    };
    expect(shouldTriggerBotReply(conversation, humanId, [botId], botId)).toBe(
      true,
    );
    expect(
      shouldTriggerBotReply(conversation, humanId, [otherHumanId], botId),
    ).toBe(false);
  });

  it('does not trigger for a group conversation the bot has not joined, even if mentioned', () => {
    const conversation = {
      type: 'group' as const,
      participants: [humanId, otherHumanId],
    };
    expect(shouldTriggerBotReply(conversation, humanId, [botId], botId)).toBe(
      false,
    );
  });

  it('triggers for a broadcast conversation when the bot is explicitly mentioned', () => {
    const conversation = { type: 'broadcast' as const, participants: [] };
    expect(shouldTriggerBotReply(conversation, humanId, [botId], botId)).toBe(
      true,
    );
  });

  it('does not trigger for a broadcast conversation without a mention', () => {
    const conversation = { type: 'broadcast' as const, participants: [] };
    expect(shouldTriggerBotReply(conversation, humanId, [], botId)).toBe(false);
  });
});

describe('buildBotReplyHistory', () => {
  it('maps the bot sender to "assistant" (unprefixed) and a human sender to "user" (prefixed with their name)', () => {
    const result = buildBotReplyHistory(
      [
        { sender: human, body: 'hi' },
        { sender: bot, body: 'hello!' },
      ],
      botId,
    );
    expect(result).toEqual([
      { role: 'user', content: 'Alice: hi' },
      { role: 'assistant', content: 'hello!' },
    ]);
  });

  it('distinguishes multiple human speakers by name, so a group history is not collapsed into one voice', () => {
    const result = buildBotReplyHistory(
      [
        { sender: human, body: 'what do you think?' },
        { sender: otherHuman, body: 'good question' },
      ],
      botId,
    );
    expect(result).toEqual([
      { role: 'user', content: 'Alice: what do you think?' },
      { role: 'user', content: 'Bob: good question' },
    ]);
  });

  it('falls back to username when the sender has no display name', () => {
    const result = buildBotReplyHistory(
      [{ sender: { _id: humanId, username: 'alice' }, body: 'hi' }],
      botId,
    );
    expect(result).toEqual([{ role: 'user', content: 'alice: hi' }]);
  });

  it('drops a message with neither body nor an image attachment', () => {
    const result = buildBotReplyHistory(
      [
        { sender: human, body: 'look at this' },
        { sender: human, body: '' },
      ],
      botId,
    );
    expect(result).toEqual([{ role: 'user', content: 'Alice: look at this' }]);
  });

  it('keeps an image-only (empty body) message, using a placeholder body and flagging hasImageAttachment', () => {
    const result = buildBotReplyHistory(
      [{ sender: human, body: '', hasImageAttachment: true }],
      botId,
    );
    expect(result).toEqual([
      {
        role: 'user',
        content: 'Alice: (画像を送信しました)',
        hasImageAttachment: true,
      },
    ]);
  });

  it("keeps a human message's actual body alongside hasImageAttachment when both text and an image are present", () => {
    const result = buildBotReplyHistory(
      [{ sender: human, body: 'これ見て', hasImageAttachment: true }],
      botId,
    );
    expect(result).toEqual([
      { role: 'user', content: 'Alice: これ見て', hasImageAttachment: true },
    ]);
  });

  it('collapses a historical (bot-turn) image-only message to the placeholder without a hasImageAttachment flag', () => {
    const result = buildBotReplyHistory(
      [{ sender: bot, body: '', hasImageAttachment: true }],
      botId,
    );
    expect(result).toEqual([
      { role: 'assistant', content: '(画像を送信しました)' },
    ]);
  });

  it('caps history to the most recent MAX_BOT_REPLY_HISTORY entries', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      sender: human,
      body: `msg-${i}`,
    }));
    const result = buildBotReplyHistory(messages, botId);
    expect(result).toHaveLength(20);
    expect(result[0].content).toBe('Alice: msg-5');
    expect(result.at(-1)?.content).toBe('Alice: msg-24');
  });
});

describe('getBotReplyPushRecipientIds', () => {
  it('scopes a broadcast reply to just whoever sent the mention, ignoring the default (whole-audience) list', () => {
    const result = getBotReplyPushRecipientIds('broadcast', humanId, [
      humanId,
      otherHumanId,
    ]);
    expect(result).toEqual([humanId]);
  });

  it('passes the default recipient list through unchanged for direct conversations', () => {
    const result = getBotReplyPushRecipientIds('direct', humanId, [humanId]);
    expect(result).toEqual([humanId]);
  });

  it('passes the default recipient list through unchanged for group conversations', () => {
    const result = getBotReplyPushRecipientIds('group', humanId, [
      humanId,
      otherHumanId,
    ]);
    expect(result).toEqual([humanId, otherHumanId]);
  });
});
