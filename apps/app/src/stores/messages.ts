import useSWR, { type SWRResponse } from 'swr';
import useSWRInfinite, { type SWRInfiniteResponse } from 'swr/infinite';

import { apiv3Get, apiv3Post } from '~/client/util/apiv3-client';

export type IConversationParticipant = {
  _id: string;
  username: string;
  name: string;
  imageUrlCached?: string;
};

export type IConversation = {
  _id: string;
  participants: IConversationParticipant[];
  isGroup: boolean;
  lastMessageAt: string;
  createdAt: string;
  unreadCount: number;
};

export const getOtherParticipant = (
  conversation: IConversation,
  currentUserId: string | undefined,
): IConversationParticipant | undefined => {
  return conversation.participants.find((p) => p._id !== currentUserId);
};

export type IMessage = {
  _id: string;
  conversation: string;
  sender: string;
  body: string;
  readBy: string[];
  createdAt: string;
};

export const useSWRxConversations = (): SWRResponse<
  { docs: IConversation[]; totalDocs: number },
  Error
> => {
  return useSWR('/messages/conversations', (endpoint) =>
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
