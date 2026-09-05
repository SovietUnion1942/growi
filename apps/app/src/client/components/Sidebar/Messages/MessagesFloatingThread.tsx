import { type JSX, useCallback, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';

import {
  FloatingPanel,
  FloatingPanelControls,
  type FloatingPanelPosition,
  type FloatingPanelSize,
} from '~/client/components/FloatingPanel';
import { useCurrentUser } from '~/states/global';
import {
  CONVERSATIONS_SWR_KEY,
  getConversationDisplayName,
  muteConversation,
} from '~/stores/messages';

import { GroupMembersModal } from './GroupMembersModal';
import { MessageThread } from './MessageThread';
import {
  useMessagesThreadActions,
  useMessagesThreadStatus,
} from './messages-thread-status';

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

/**
 * The floating Messages/DM thread window.
 *
 * Deliberately independent of the Sidebar's "Messages" tab lifecycle -- see
 * `FloatingPanel/README.md`'s "Migrating the Messages/DM panel specifically"
 * section. Mounted persistently (via `dynamic.tsx`, from `BasicLayout.tsx`)
 * so switching Sidebar tabs never unmounts an open/minimized thread.
 */
export const MessagesFloatingThread = (): JSX.Element | null => {
  const activeConversation = useMessagesThreadStatus();
  const { close, update } = useMessagesThreadActions();
  const currentUser = useCurrentUser();

  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  const muteToggleHandler = useCallback(async () => {
    if (activeConversation == null) return;
    const newMuted = !activeConversation.isMuted;
    await muteConversation(activeConversation._id, newMuted);
    update({ ...activeConversation, isMuted: newMuted });
    mutateGlobal(CONVERSATIONS_SWR_KEY);
  }, [activeConversation, update]);

  if (activeConversation == null) {
    return null;
  }

  return (
    <>
      <FloatingPanel
        storageKey="grw-messages-thread-geometry"
        title={getConversationDisplayName(activeConversation, currentUser?._id)}
        defaultPosition={FLOATING_MESSAGES_DEFAULT_POSITION}
        defaultSize={FLOATING_MESSAGES_DEFAULT_SIZE}
        minSize={FLOATING_MESSAGES_MIN_SIZE}
        header={({
          isMaximized,
          toggleMaximize,
          isMinimized,
          toggleMinimize,
        }) => (
          <div className="d-flex align-items-center px-3 py-2 border-bottom">
            <h3 className="fs-6 fw-bold mb-0 flex-grow-1 text-truncate">
              {getConversationDisplayName(activeConversation, currentUser?._id)}
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

            <FloatingPanelControls
              isMinimized={isMinimized}
              toggleMinimize={toggleMinimize}
              isMaximized={isMaximized}
              toggleMaximize={toggleMaximize}
              onClose={close}
            />
          </div>
        )}
      >
        <MessageThread conversation={activeConversation} />
      </FloatingPanel>

      <GroupMembersModal
        isOpen={isMembersModalOpen}
        onClose={() => setIsMembersModalOpen(false)}
        conversation={activeConversation}
        onUpdated={(conversation) => {
          update(conversation);
          mutateGlobal(CONVERSATIONS_SWR_KEY);
        }}
      />
    </>
  );
};
