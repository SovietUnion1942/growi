import { type JSX, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCurrentUser } from '~/states/global';
import { getOtherParticipant, type IConversation } from '~/stores/messages';

import { ConversationList } from './ConversationList';
import { MessageThread } from './MessageThread';
import { StartConversationModal } from './StartConversationModal';

export const Messages = (): JSX.Element => {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();

  const [activeConversation, setActiveConversation] =
    useState<IConversation | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  const otherParticipant =
    activeConversation != null
      ? getOtherParticipant(activeConversation, currentUser?._id)
      : undefined;

  return (
    <div className="px-3">
      <div className="grw-sidebar-content-header py-4 d-flex align-items-center">
        {activeConversation != null && (
          <button
            type="button"
            className="btn btn-link p-0 me-2"
            onClick={() => setActiveConversation(null)}
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
        )}
        <h3 className="fs-6 fw-bold mb-0 flex-grow-1">{t('Messages')}</h3>
        {activeConversation == null && (
          <button
            type="button"
            className="btn btn-primary btn-sm rounded-circle"
            onClick={() => setIsStartModalOpen(true)}
            title="新しい会話を始める"
          >
            <span className="material-symbols-outlined align-middle">add</span>
          </button>
        )}
      </div>

      {activeConversation == null ? (
        <ConversationList onSelectConversation={setActiveConversation} />
      ) : (
        <MessageThread
          conversationId={activeConversation._id}
          otherParticipant={otherParticipant}
        />
      )}

      <StartConversationModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConversationCreated={(conversation) => {
          setIsStartModalOpen(false);
          setActiveConversation(conversation);
        }}
      />
    </div>
  );
};
