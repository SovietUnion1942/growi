import { groupReactionsByEmoji } from './reaction-utils';

describe('groupReactionsByEmoji', () => {
  it('returns an empty list for no reactions', () => {
    expect(groupReactionsByEmoji([], 'me')).toEqual([]);
  });

  it('groups multiple users under the same emoji into one entry with a count', () => {
    const result = groupReactionsByEmoji(
      [
        { emoji: '👍', userId: 'alice' },
        { emoji: '👍', userId: 'bob' },
      ],
      'carol',
    );
    expect(result).toEqual([{ emoji: '👍', count: 2, reactedByMe: false }]);
  });

  it('marks reactedByMe when the current user is among the reactors', () => {
    const result = groupReactionsByEmoji(
      [
        { emoji: '👍', userId: 'alice' },
        { emoji: '👍', userId: 'me' },
      ],
      'me',
    );
    expect(result).toEqual([{ emoji: '👍', count: 2, reactedByMe: true }]);
  });

  it('keeps distinct emoji as separate entries, in first-seen order', () => {
    const result = groupReactionsByEmoji(
      [
        { emoji: '❤️', userId: 'alice' },
        { emoji: '👍', userId: 'bob' },
        { emoji: '❤️', userId: 'carol' },
      ],
      undefined,
    );
    expect(result).toEqual([
      { emoji: '❤️', count: 2, reactedByMe: false },
      { emoji: '👍', count: 1, reactedByMe: false },
    ]);
  });
});
