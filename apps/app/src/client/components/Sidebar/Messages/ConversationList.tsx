import type { JSX } from 'react';

import { useCurrentUser } from '~/states/global';
import {
  getConversationDisplayName,
  getOtherParticipant,
  type IConversation,
  useSWRxConversations,
} from '~/stores/messages';

type Props = {
  onSelectConversation: (conversation: IConversation) => void;
};

const ConversationIcon = ({
  conversation,
  currentUserId,
}: {
  conversation: IConversation;
  currentUserId: string | undefined;
}): JSX.Element => {
  if (conversation.type === 'broadcast') {
    return (
      <span
        className="rounded-circle bg-primary text-white d-flex align-items-center justify-content-center me-2"
        style={{ width: 32, height: 32, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          campaign
        </span>
      </span>
    );
  }

  if (conversation.type === 'group') {
    return (
      <span
        className="rounded-circle bg-body-tertiary border d-flex align-items-center justify-content-center me-2"
        style={{ width: 32, height: 32, flexShrink: 0 }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          group
        </span>
      </span>
    );
  }

  const other = getOtherParticipant(conversation, currentUserId);
  return (
    <img
      src={other?.imageUrlCached ?? '/images/icons/user.svg'}
      alt={other?.name}
      className="rounded-circle me-2"
      width={32}
      height={32}
    />
  );
};

export const ConversationList = (props: Props): JSX.Element => {
  const { onSelectConversation } = props;

  const { data, isLoading } = useSWRxConversations();
  const currentUser = useCurrentUser();

  if (isLoading) {
    return <div className="text-center py-3">Loading...</div>;
  }

  const conversations = data?.docs ?? [];

  if (conversations.length === 0) {
    return (
      <div className="text-muted text-center py-3">まだ会話がありません</div>
    );
  }

  return (
    <ul className="list-unstyled">
      {conversations.map((conversation) => (
        <li key={conversation._id}>
          <button
            type="button"
            className="btn btn-link text-start w-100 d-flex align-items-center py-2 text-decoration-none"
            onClick={() => onSelectConversation(conversation)}
          >
            <ConversationIcon
              conversation={conversation}
              currentUserId={currentUser?._id}
            />
            <span className="flex-grow-1">
              {getConversationDisplayName(conversation, currentUser?._id)}
            </span>
            {conversation.unreadCount > 0 && (
              <span className="badge rounded-pill bg-primary">
                {conversation.unreadCount}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
};
