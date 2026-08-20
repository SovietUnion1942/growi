import { Types } from 'mongoose';

import {
  buildBotReplyHistory,
  shouldTriggerBotReply,
} from './messages-bot-reply';

const botId = new Types.ObjectId();
const humanId = new Types.ObjectId();
const otherHumanId = new Types.ObjectId();

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

  it('does not trigger for broadcast conversations', () => {
    const conversation = { type: 'broadcast' as const, participants: [] };
    expect(shouldTriggerBotReply(conversation, humanId, [botId], botId)).toBe(
      false,
    );
  });
});

describe('buildBotReplyHistory', () => {
  it('maps the bot sender to "assistant" and everyone else to "user"', () => {
    const result = buildBotReplyHistory(
      [
        { sender: humanId, body: 'hi' },
        { sender: botId, body: 'hello!' },
      ],
      botId,
    );
    expect(result).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello!' },
    ]);
  });

  it('drops attachment-only (empty body) messages', () => {
    const result = buildBotReplyHistory(
      [
        { sender: humanId, body: 'look at this' },
        { sender: humanId, body: '' },
      ],
      botId,
    );
    expect(result).toEqual([{ role: 'user', content: 'look at this' }]);
  });

  it('caps history to the most recent MAX_BOT_REPLY_HISTORY entries', () => {
    const messages = Array.from({ length: 25 }, (_, i) => ({
      sender: humanId,
      body: `msg-${i}`,
    }));
    const result = buildBotReplyHistory(messages, botId);
    expect(result).toHaveLength(20);
    expect(result[0].content).toBe('msg-5');
    expect(result.at(-1)?.content).toBe('msg-24');
  });
});
