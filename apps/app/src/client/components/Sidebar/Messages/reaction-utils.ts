import type { IMessageReaction } from '~/stores/messages';

export type GroupedReaction = {
  emoji: string;
  count: number;
  reactedByMe: boolean;
};

// Groups the flat (emoji, userId) pair list into one entry per distinct
// emoji, in first-seen order. Pure data transform -- the storage shape
// (flat pairs) is independent of how the emoji was picked (fixed quick-react
// row today, a full picker later), so this is the single place display
// grouping happens regardless of which UI added the reaction.
export const groupReactionsByEmoji = (
  reactions: IMessageReaction[],
  currentUserId: string | undefined,
): GroupedReaction[] => {
  const order: string[] = [];
  const counts = new Map<string, number>();
  const reactedByMe = new Set<string>();

  reactions.forEach(({ emoji, userId }) => {
    if (!counts.has(emoji)) {
      order.push(emoji);
      counts.set(emoji, 0);
    }
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    if (userId === currentUserId) {
      reactedByMe.add(emoji);
    }
  });

  return order.map((emoji) => ({
    emoji,
    count: counts.get(emoji) ?? 0,
    reactedByMe: reactedByMe.has(emoji),
  }));
};
