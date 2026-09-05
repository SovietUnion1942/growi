import { useCallback } from 'react';
import { atom, useAtomValue, useSetAtom } from 'jotai';

import type { IConversation } from '~/stores/messages';

/**
 * Atom holding the conversation currently open in the floating Messages
 * thread window, or `null` when no thread is open.
 *
 * Kept module-level (outside `Messages.tsx`) so a top-level, always-mounted
 * component (`MessagesFloatingThread` via `dynamic.tsx`) can read/write it
 * independently of whichever Sidebar tab happens to be selected -- see
 * `FloatingPanel/README.md`'s "Migrating the Messages/DM panel specifically"
 * section for why this indirection is required.
 */
const activeConversationAtom = atom<IConversation | null>(null);

/**
 * Hook to read the currently-open Messages thread conversation.
 * @returns The active conversation, or `null` if no thread is open.
 */
export const useMessagesThreadStatus = (): IConversation | null => {
  return useAtomValue(activeConversationAtom);
};

/**
 * Type definition for Messages thread actions
 */
export type MessagesThreadActions = {
  /** Open the floating thread window on the given conversation. */
  open: (conversation: IConversation) => void;
  /** Close the floating thread window. */
  close: () => void;
  /**
   * Replace the currently-open conversation with an updated object (e.g.
   * after a mute-toggle mutates it locally).
   */
  update: (conversation: IConversation) => void;
};

/**
 * Hook to get the Messages thread actions
 * @returns Actions for managing the Messages thread window
 */
export const useMessagesThreadActions = (): MessagesThreadActions => {
  const setActiveConversation = useSetAtom(activeConversationAtom);

  const open = useCallback(
    (conversation: IConversation) => {
      setActiveConversation(conversation);
    },
    [setActiveConversation],
  );

  const close = useCallback(() => {
    setActiveConversation(null);
  }, [setActiveConversation]);

  const update = useCallback(
    (conversation: IConversation) => {
      setActiveConversation(conversation);
    },
    [setActiveConversation],
  );

  return { open, close, update };
};
