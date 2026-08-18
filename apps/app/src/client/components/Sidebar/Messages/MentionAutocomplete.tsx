import type { JSX } from 'react';
import { UserPicture } from '@growi/ui/dist/components';

import type { IConversationParticipant } from '~/stores/messages';

type Props = {
  candidates: IConversationParticipant[];
  activeIndex: number;
  onSelect: (user: IConversationParticipant) => void;
  onHover: (index: number) => void;
};

export const MentionAutocomplete = (props: Props): JSX.Element => {
  const { candidates, activeIndex, onSelect, onHover } = props;

  return (
    <div
      className="border rounded shadow-sm bg-body position-absolute"
      style={{
        bottom: '100%',
        left: 0,
        marginBottom: '4px',
        width: '260px',
        maxHeight: '220px',
        overflowY: 'auto',
        zIndex: 1000,
      }}
    >
      <ul className="list-unstyled mb-0">
        {candidates.map((user, index) => (
          <li key={user._id}>
            <button
              type="button"
              className={`btn text-start w-100 d-flex align-items-center py-2 px-2 text-decoration-none rounded-0 ${
                index === activeIndex ? 'bg-primary text-white' : ''
              }`}
              // mousedown (not click) fires before the input's blur, so the
              // selection can still read/restore the input's caret position
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(user);
              }}
              onMouseEnter={() => onHover(index)}
            >
              <UserPicture user={user} size="sm" noLink noTooltip />
              <span className="ms-2">{user.name ?? user.username}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
