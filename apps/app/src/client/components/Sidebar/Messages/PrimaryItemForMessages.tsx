import { memo, useCallback, useEffect } from 'react';

import { SidebarContentsType } from '~/interfaces/ui';
import { SocketEventName } from '~/interfaces/websocket';
import { useGlobalSocket } from '~/states/socket-io';
import { useSWRxConversations } from '~/stores/messages';

import { PrimaryItem, type PrimaryItemProps } from '../SidebarNav/PrimaryItem';

type PrimaryItemForMessagesProps = Omit<
  PrimaryItemProps,
  'onClick' | 'label' | 'iconName' | 'contents' | 'badgeContents'
>;

export const PrimaryItemForMessages = memo(
  (props: PrimaryItemForMessagesProps) => {
    const { sidebarMode, onHover } = props;

    const socket = useGlobalSocket();

    const { data: conversations, mutate: mutateConversations } =
      useSWRxConversations();

    const unreadCount =
      conversations?.docs.reduce((sum, c) => sum + c.unreadCount, 0) ?? 0;
    const badgeContents = unreadCount > 0 ? unreadCount : undefined;

    const itemHoverHandler = useCallback(
      (contents: SidebarContentsType) => {
        onHover?.(contents);
      },
      [onHover],
    );

    useEffect(() => {
      if (socket != null) {
        socket.on(SocketEventName.MessageCreated, () => {
          mutateConversations();
        });

        return () => {
          socket.off(SocketEventName.MessageCreated);
        };
      }
    }, [mutateConversations, socket]);

    return (
      <PrimaryItem
        sidebarMode={sidebarMode}
        contents={SidebarContentsType.MESSAGES}
        label="Messages"
        iconName="chat"
        badgeContents={badgeContents}
        onHover={itemHoverHandler}
      />
    );
  },
);
