import { type JSX, useState } from 'react';

import type { IMessageReaction } from '~/stores/messages';

import { QuickReactionPicker } from './QuickReactionPicker';
import { groupReactionsByEmoji } from './reaction-utils';

type Props = {
  reactions: IMessageReaction[];
  currentUserId: string | undefined;
  isMine: boolean;
  onToggle: (emoji: string) => void;
};

export const ReactionBar = (props: Props): JSX.Element => {
  const { reactions, currentUserId, isMine, onToggle } = props;
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  const grouped = groupReactionsByEmoji(reactions, currentUserId);

  return (
    <div
      className={`d-flex flex-wrap align-items-center gap-1 mt-1 position-relative ${
        isMine ? 'justify-content-end' : 'justify-content-start'
      }`}
    >
      {grouped.map(({ emoji, count, reactedByMe }) => (
        <button
          key={emoji}
          type="button"
          className={`btn btn-sm rounded-pill px-2 py-0 ${
            reactedByMe ? 'btn-primary' : 'btn-outline-secondary'
          }`}
          style={{ fontSize: '0.75rem' }}
          onClick={() => onToggle(emoji)}
        >
          <span style={{ fontSize: '0.9rem' }}>{emoji}</span> {count}
        </button>
      ))}

      <button
        type="button"
        className="btn btn-sm btn-outline-secondary rounded-circle p-0 d-flex align-items-center justify-content-center"
        aria-label="リアクションを追加"
        style={{ width: '22px', height: '22px' }}
        onClick={() => setIsPickerOpen((prev) => !prev)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          add_reaction
        </span>
      </button>

      {isPickerOpen && (
        <QuickReactionPicker
          onSelect={(emoji) => {
            onToggle(emoji);
            setIsPickerOpen(false);
          }}
        />
      )}
    </div>
  );
};
