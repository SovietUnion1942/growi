import { type FC, memo } from 'react';
import { useAtomValue } from 'jotai';

import { useLazyLoader } from '~/components/utils/use-lazy-loader';
import { isMessagesFeatureEnabled } from '~/interfaces/messages-mode';
import { useIsGuestUser } from '~/states/context';
import { messagesModeAtom } from '~/states/server-configurations';

import { useMessagesThreadStatus } from './messages-thread-status';

export const MessagesFloatingThreadLazyLoaded: FC = memo(() => {
  const isGuestUser = useIsGuestUser();
  const messagesMode = useAtomValue(messagesModeAtom);
  const activeConversation = useMessagesThreadStatus();

  // Defense in depth: even though the Messages Sidebar tab already refuses to
  // offer the "open a conversation" entry point for a guest / disabled
  // feature (see SidebarContents.tsx), this top-level, always-mounted
  // component must not assume that guarantee holds forever.
  const isMessagesAvailable =
    !isGuestUser && isMessagesFeatureEnabled(messagesMode);

  const isOpen = isMessagesAvailable && activeConversation != null;

  const ComponentToRender = useLazyLoader(
    'messages-thread',
    () =>
      import('./MessagesFloatingThread').then((mod) => ({
        default: mod.MessagesFloatingThread,
      })),
    isOpen,
  );

  if (ComponentToRender == null || !isOpen) {
    return null;
  }

  return <ComponentToRender />;
});
MessagesFloatingThreadLazyLoaded.displayName =
  'MessagesFloatingThreadLazyLoaded';
