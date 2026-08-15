import { type JSX, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate as mutateGlobal } from 'swr';

import { useCurrentUser } from '~/states/global';
import {
  CONVERSATIONS_SWR_KEY,
  getConversationDisplayName,
  type IConversation,
  muteConversation,
} from '~/stores/messages';

import { ConversationList } from './ConversationList';
import { GroupMembersModal } from './GroupMembersModal';
import { MessageThread } from './MessageThread';
import { StartConversationModal } from './StartConversationModal';

export const Messages = (): JSX.Element => {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();

  const [activeConversation, setActiveConversation] =
    useState<IConversation | null>(null);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  const muteToggleHandler = useCallback(async () => {
    if (activeConversation == null) return;
    const newMuted = !activeConversation.isMuted;
    await muteConversation(activeConversation._id, newMuted);
    setActiveConversation({ ...activeConversation, isMuted: newMuted });
    mutateGlobal(CONVERSATIONS_SWR_KEY);
  }, [activeConversation]);

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
        <h3 className="fs-6 fw-bold mb-0 flex-grow-1 text-truncate">
          {activeConversation != null
            ? getConversationDisplayName(activeConversation, currentUser?._id)
            : t('Messages')}
        </h3>

        {activeConversation != null && activeConversation.type === 'group' && (
          <button
            type="button"
            className="btn btn-link p-0 me-2"
            onClick={() => setIsMembersModalOpen(true)}
            title="メンバー管理"
          >
            <span className="material-symbols-outlined">group</span>
          </button>
        )}

        {activeConversation != null && (
          <button
            type="button"
            className="btn btn-link p-0"
            onClick={muteToggleHandler}
            title={activeConversation.isMuted ? 'ミュート解除' : 'ミュート'}
          >
            <span className="material-symbols-outlined">
              {activeConversation.isMuted
                ? 'notifications_off'
                : 'notifications'}
            </span>
          </button>
        )}

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
        <MessageThread conversation={activeConversation} />
      )}

      <StartConversationModal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        onConversationCreated={(conversation) => {
          setIsStartModalOpen(false);
          setActiveConversation(conversation);
          mutateGlobal(CONVERSATIONS_SWR_KEY);
        }}
      />

      {activeConversation != null && (
        <GroupMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          conversation={activeConversation}
          onUpdated={(conversation) => {
            setActiveConversation(conversation);
            mutateGlobal(CONVERSATIONS_SWR_KEY);
          }}
        />
      )}
    </div>
  );
};
