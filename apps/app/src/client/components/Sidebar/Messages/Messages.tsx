import { type JSX, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mutate as mutateGlobal } from 'swr';

import {
  FloatingPanel,
  type FloatingPanelPosition,
  type FloatingPanelSize,
} from '~/client/components/FloatingPanel';
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

// Default geometry for the floating chat-thread window, docked near the
// top-left where the collapsible left sidebar sits. See FloatingPanel for
// how this is clamped to the actual viewport on mount and on resize.
const FLOATING_MESSAGES_DEFAULT_POSITION: FloatingPanelPosition = {
  x: 100,
  y: 72,
};
const FLOATING_MESSAGES_DEFAULT_SIZE: FloatingPanelSize = {
  width: 420,
  height: 640,
};
const FLOATING_MESSAGES_MIN_SIZE: FloatingPanelSize = {
  width: 320,
  height: 360,
};

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
        <h3 className="fs-6 fw-bold mb-0 flex-grow-1 text-truncate">
          {t('Messages')}
        </h3>

        <button
          type="button"
          className="btn btn-primary btn-sm rounded-circle"
          onClick={() => setIsStartModalOpen(true)}
          title="新しい会話を始める"
        >
          <span className="material-symbols-outlined align-middle">add</span>
        </button>
      </div>

      <ConversationList onSelectConversation={setActiveConversation} />

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
        <FloatingPanel
          storageKey="grw-messages-thread-geometry"
          defaultPosition={FLOATING_MESSAGES_DEFAULT_POSITION}
          defaultSize={FLOATING_MESSAGES_DEFAULT_SIZE}
          minSize={FLOATING_MESSAGES_MIN_SIZE}
          header={({ isMaximized, toggleMaximize }) => (
            <div className="d-flex align-items-center px-3 py-2 border-bottom">
              <h3 className="fs-6 fw-bold mb-0 flex-grow-1 text-truncate">
                {getConversationDisplayName(
                  activeConversation,
                  currentUser?._id,
                )}
              </h3>

              {activeConversation.type === 'group' && (
                <button
                  type="button"
                  className="btn btn-link p-0 me-2"
                  onClick={() => setIsMembersModalOpen(true)}
                  title="メンバー管理"
                >
                  <span className="material-symbols-outlined">group</span>
                </button>
              )}

              <button
                type="button"
                className="btn btn-link p-0 me-2"
                onClick={muteToggleHandler}
                title={activeConversation.isMuted ? 'ミュート解除' : 'ミュート'}
              >
                <span className="material-symbols-outlined">
                  {activeConversation.isMuted
                    ? 'notifications_off'
                    : 'notifications'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-link p-0 me-2"
                onClick={toggleMaximize}
                title={isMaximized ? '元のサイズに戻す' : '最大化'}
              >
                <span className="material-symbols-outlined">
                  {isMaximized ? 'fullscreen_exit' : 'fullscreen'}
                </span>
              </button>

              <button
                type="button"
                className="btn btn-link p-0"
                onClick={() => setActiveConversation(null)}
                title="閉じる"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
          )}
        >
          <MessageThread conversation={activeConversation} />
        </FloatingPanel>
      )}

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
