import type { JSX } from 'react';

import { useCurrentUser } from '~/states/global';
import {
  getOtherParticipant,
  type IConversation,
  useSWRxConversations,
} from '~/stores/messages';

type Props = {
  onSelectConversation: (conversation: IConversation) => void;
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
      {conversations.map((conversation) => {
        const other = getOtherParticipant(conversation, currentUser?._id);
        return (
          <li key={conversation._id}>
            <button
              type="button"
              className="btn btn-link text-start w-100 d-flex align-items-center py-2 text-decoration-none"
              onClick={() => onSelectConversation(conversation)}
            >
              <img
                src={other?.imageUrlCached ?? '/images/icons/user.svg'}
                alt={other?.name}
                className="rounded-circle me-2"
                width={32}
                height={32}
              />
              <span className="flex-grow-1">
                {other?.name ?? other?.username}
              </span>
              {conversation.unreadCount > 0 && (
                <span className="badge rounded-pill bg-primary">
                  {conversation.unreadCount}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
