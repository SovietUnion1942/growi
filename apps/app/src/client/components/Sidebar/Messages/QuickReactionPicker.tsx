import type { JSX } from 'react';

// The fixed quick-react set. Isolated in this one file on purpose: swapping
// to a full emoji-mart-style picker later means replacing this component's
// body only -- the model, API, socket event, and ReactionBar/reaction-utils
// display layer are all agnostic to where the emoji string came from.
export const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

type Props = {
  onSelect: (emoji: string) => void;
};

export const QuickReactionPicker = (props: Props): JSX.Element => {
  const { onSelect } = props;

  return (
    <div
      className="border rounded shadow-sm bg-body position-absolute d-flex p-1"
      style={{ bottom: '100%', marginBottom: '4px', zIndex: 1000, gap: '2px' }}
    >
      {QUICK_REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          className="btn btn-sm p-1"
          style={{ fontSize: '1.1rem', lineHeight: 1 }}
          // mousedown (not click) fires before the trigger button's blur
          onMouseDown={(e) => {
            e.preventDefault();
            onSelect(emoji);
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
