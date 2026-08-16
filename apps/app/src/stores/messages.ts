import type { IUserBadgeSummaryEntry } from '@growi/core';
import useSWR, { type SWRResponse } from 'swr';
import useSWRInfinite, { type SWRInfiniteResponse } from 'swr/infinite';

import { apiv3Delete, apiv3Get, apiv3Post } from '~/client/util/apiv3-client';

export const CONVERSATIONS_SWR_KEY = '/messages/conversations';

export type IConversationParticipant = {
  _id: string;
  username: string;
  name: string;
  imageUrlCached?: string;
  /**
   * Sole writer: features/user-badge's `BadgeGrantService` (see
   * `IUser.badgeSummaryCached`, `packages/core`). The backend already
   * returns this via `serializeUserSecurely` (a blocklist that only strips
   * `password`/`apiToken`/`email`), so no server-side change is needed --
   * this is purely closing a type-definition gap so `MessageThread.tsx` can
   * read it off `message.sender`.
   */
  badgeSummaryCached?: IUserBadgeSummaryEntry[];
};

export type ConversationType = 'direct' | 'group' | 'broadcast';

export type IConversation = {
  _id: string;
  type: ConversationType;
  name?: string;
  participants: IConversationParticipant[];
  lastMessageAt: string;
  createdAt: string;
  unreadCount: number;
  isMuted: boolean;
};

export const getOtherParticipant = (
  conversation: IConversation,
  currentUserId: string | undefined,
): IConversationParticipant | undefined => {
  return conversation.participants.find((p) => p._id !== currentUserId);
};

export const getConversationDisplayName = (
  conversation: IConversation,
  currentUserId: string | undefined,
): string => {
  if (conversation.type === 'direct') {
    const other = getOtherParticipant(conversation, currentUserId);
    return other?.name ?? other?.username ?? '';
  }
  return conversation.name ?? '';
};

export type IMessage = {
  _id: string;
  conversation: string;
  sender: IConversationParticipant;
  body: string;
  readBy: string[];
  createdAt: string;
};

export const useSWRxConversations = (): SWRResponse<
  { docs: IConversation[]; totalDocs: number },
  Error
> => {
  return useSWR(CONVERSATIONS_SWR_KEY, (endpoint) =>
    apiv3Get(endpoint).then((res) => res.data),
  );
};

export const useSWRxMessages = (
  conversationId: string | null,
): SWRInfiniteResponse<{ docs: IMessage[] }, Error> => {
  return useSWRInfinite(
    (pageIndex) =>
      conversationId == null
        ? null
        : [`/messages/conversations/${conversationId}/messages`, pageIndex],
    ([endpoint, pageIndex]) =>
      apiv3Get(endpoint, { offset: pageIndex * 30, limit: 30 }).then(
        (res) => res.data,
      ),
  );
};

export const createConversation = async (
  targetUserId: string,
): Promise<IConversation> => {
  const res = await apiv3Post('/messages/conversations', { targetUserId });
  return res.data.conversation;
};

export const createGroupConversation = async (
  targetUserIds: string[],
  name: string,
): Promise<IConversation> => {
  const res = await apiv3Post('/messages/conversations', {
    targetUserIds,
    name,
  });
  return res.data.conversation;
};

export const addParticipant = async (
  conversationId: string,
  userId: string,
): Promise<IConversation> => {
  const res = await apiv3Post(
    `/messages/conversations/${conversationId}/participants`,
    { userId },
  );
  return res.data.conversation;
};

export const removeParticipant = async (
  conversationId: string,
  userId: string,
): Promise<IConversation> => {
  const res = await apiv3Delete(
    `/messages/conversations/${conversationId}/participants/${userId}`,
  );
  return res.data.conversation;
};

export const muteConversation = async (
  conversationId: string,
  muted: boolean,
): Promise<void> => {
  await apiv3Post(`/messages/conversations/${conversationId}/mute`, {
    muted,
  });
};

export const sendMessage = async (
  conversationId: string,
  body: string,
): Promise<IMessage> => {
  const res = await apiv3Post(
    `/messages/conversations/${conversationId}/messages`,
    { body },
  );
  return res.data.message;
};

export const markConversationAsRead = async (
  conversationId: string,
): Promise<void> => {
  await apiv3Post(`/messages/conversations/${conversationId}/read`);
};

export const searchUsers = async (
  searchText: string,
): Promise<IConversationParticipant[]> => {
  const res = await apiv3Get('/users', {
    searchText,
    page: 1,
    sort: 'name',
    sortOrder: 'asc',
  });
  return res.data.paginateResult.docs;
};
