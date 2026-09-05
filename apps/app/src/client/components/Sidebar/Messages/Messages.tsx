import { type JSX, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { mutate as mutateGlobal } from 'swr';

import {
  canCreateGroupConversation,
  canStartDirectConversation,
} from '~/interfaces/messages-mode';
import { messagesModeAtom } from '~/states/server-configurations';
import { CONVERSATIONS_SWR_KEY } from '~/stores/messages';

import { ConversationList } from './ConversationList';
import { useMessagesThreadActions } from './messages-thread-status';
import { StartConversationModal } from './StartConversationModal';

export const Messages = (): JSX.Element => {
  const { t } = useTranslation();
  const messagesMode = useAtomValue(messagesModeAtom);
  const canStartDirect = canStartDirectConversation(messagesMode);
  const canCreateGroup = canCreateGroupConversation(messagesMode);
  // `global` mode has only the ever-present broadcast conversation, so there
  // is nothing for the "start a conversation" affordance to do.
  const canStartConversation = canStartDirect || canCreateGroup;

  const { open } = useMessagesThreadActions();
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);

  return (
    <div className="px-3">
      <div className="grw-sidebar-content-header py-4 d-flex align-items-center">
        <h3 className="fs-6 fw-bold mb-0 flex-grow-1 text-truncate">
          {t('Messages')}
        </h3>

        {canStartConversation && (
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

      <ConversationList onSelectConversation={open} />

      {canStartConversation && (
        <StartConversationModal
          isOpen={isStartModalOpen}
          canCreateGroup={canCreateGroup}
          onClose={() => setIsStartModalOpen(false)}
          onConversationCreated={(conversation) => {
            setIsStartModalOpen(false);
            open(conversation);
            mutateGlobal(CONVERSATIONS_SWR_KEY);
          }}
        />
      )}
    </div>
  );
};
