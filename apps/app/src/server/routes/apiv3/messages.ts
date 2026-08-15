import { SCOPE } from '@growi/core/dist/interfaces';
import { serializeUserSecurely } from '@growi/core/dist/models/serializers';
import type { Router } from 'express';
import express from 'express';
import { Types } from 'mongoose';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import { SocketEventName } from '~/interfaces/websocket';
import type Crowi from '~/server/crowi';
import { accessTokenParser } from '~/server/middlewares/access-token-parser';
import loginRequiredFactory from '~/server/middlewares/login-required';
import { UserStatus } from '~/server/models/user/conts';
import { sendPushNotificationToUsers } from '~/server/service/push-notification';
import {
  BROADCAST_ROOM_NAME,
  getRoomNameWithId,
  RoomPrefix,
} from '~/server/service/socket-io/helper';
import loggerFactory from '~/utils/logger';

import type { ConversationDocument } from '../../models/Conversation';
import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import type { ApiV3Response } from './interfaces/apiv3-response';

const logger = loggerFactory('growi:routes:apiv3:messages');

const MESSAGE_PUSH_BODY_MAX_LENGTH = 100;

const router = express.Router();

// membership is implicit (every logged-in user) for the broadcast conversation
const isConversationMember = (
  conversation: ConversationDocument,
  userId: Types.ObjectId,
): boolean => {
  return (
    conversation.type === 'broadcast' ||
    conversation.participants.some((p) => p.equals(userId))
  );
};

export const setup = (crowi: Crowi): Router => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);
  const { User } = crowi.models;

  const serializeConversation = async (
    conversation: ConversationDocument,
    currentUserId: Types.ObjectId,
  ) => {
    const populated = await conversation.populate('participants');
    const unreadCounts = await Message.countUnreadByConversation(
      [conversation._id],
      currentUserId,
    );

    const obj = conversation.toObject();
    obj.participants = populated.participants.map((p) =>
      serializeUserSecurely(p),
    );
    obj.unreadCount = unreadCounts.get(conversation._id.toString()) ?? 0;
    obj.isMuted = conversation.mutedBy.some((id) => id.equals(currentUserId));
    delete obj.mutedBy;
    return obj;
  };

  // recipients for push notifications, muted participants excluded;
  // broadcast has no fixed participant list, so it fans out to every active user
  const getPushRecipientIds = async (
    conversation: ConversationDocument,
    senderId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> => {
    const mutedIds = new Set(conversation.mutedBy.map((id) => id.toString()));

    const candidateIds: Types.ObjectId[] =
      conversation.type === 'broadcast'
        ? (await User.find({ status: UserStatus.STATUS_ACTIVE }, '_id')).map(
            (u) => u._id,
          )
        : conversation.participants;

    return candidateIds.filter(
      (id) => !id.equals(senderId) && !mutedIds.has(id.toString()),
    );
  };

  router.get(
    '/conversations',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const limit =
        req.query.limit != null
          ? parseInt(req.query.limit.toString()) || 20
          : 20;
      const offset =
        req.query.offset != null
          ? parseInt(req.query.offset.toString(), 10)
          : 0;

      try {
        const paginationResult = await Conversation.findByUser(
          user._id,
          offset,
          limit,
        );

        const unreadCounts = await Message.countUnreadByConversation(
          paginationResult.docs.map((doc) => doc._id),
          user._id,
        );

        const serializedDocs = await Promise.all(
          paginationResult.docs.map(async (doc) => {
            const docObj = doc.toObject();
            const populated = await doc.populate('participants');
            docObj.participants = populated.participants.map((p) =>
              serializeUserSecurely(p),
            );
            docObj.unreadCount = unreadCounts.get(doc._id.toString()) ?? 0;
            docObj.isMuted = doc.mutedBy.some((id) => id.equals(user._id));
            delete docObj.mutedBy;
            return docObj;
          }),
        );

        return res.apiv3({ ...paginationResult, docs: serializedDocs });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations/:id/read',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        await Message.markAsRead(new Types.ObjectId(conversationId), user._id);

        return res.apiv3({});
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations/:id/mute',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;
      const { muted } = req.body;

      if (typeof muted !== 'boolean') {
        return res.apiv3Err(new Error('muted must be a boolean'), 400);
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        await Conversation.setMuted(
          new Types.ObjectId(conversationId),
          user._id,
          muted,
        );

        return res.apiv3({});
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { targetUserId, targetUserIds, name } = req.body;

      try {
        let conversation: ConversationDocument;

        if (Array.isArray(targetUserIds)) {
          if (targetUserIds.length === 0) {
            return res.apiv3Err(
              new Error('targetUserIds must not be empty'),
              400,
            );
          }
          if (name == null || name.trim() === '') {
            return res.apiv3Err(
              new Error('name is required to create a group'),
              400,
            );
          }
          conversation = await Conversation.createGroup(
            user._id,
            targetUserIds.map((id: string) => new Types.ObjectId(id)),
            name.trim(),
          );
        } else if (targetUserId != null) {
          conversation = await Conversation.findOrCreateDirectConversation(
            user._id,
            new Types.ObjectId(targetUserId),
          );
        } else {
          return res.apiv3Err(
            new Error('targetUserId or targetUserIds is required'),
            400,
          );
        }

        return res.apiv3({
          conversation: await serializeConversation(conversation, user._id),
        });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations/:id/participants',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;
      const { userId: targetUserId } = req.body;

      if (targetUserId == null) {
        return res.apiv3Err(new Error('userId is required'), 400);
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation == null || conversation.type !== 'group') {
          return res.apiv3Err(new Error('Not a group conversation'), 400);
        }
        if (!isConversationMember(conversation, user._id)) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const updated = await Conversation.addParticipant(
          new Types.ObjectId(conversationId),
          new Types.ObjectId(targetUserId),
        );
        if (updated == null) {
          return res.apiv3Err(new Error('Conversation not found'), 404);
        }

        return res.apiv3({
          conversation: await serializeConversation(updated, user._id),
        });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.delete(
    '/conversations/:id/participants/:userId',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId, userId: targetUserId } = req.params;

      try {
        const conversation = await Conversation.findById(conversationId);
        if (conversation == null || conversation.type !== 'group') {
          return res.apiv3Err(new Error('Not a group conversation'), 400);
        }
        if (!isConversationMember(conversation, user._id)) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const updated = await Conversation.removeParticipant(
          new Types.ObjectId(conversationId),
          new Types.ObjectId(targetUserId),
        );
        if (updated == null) {
          return res.apiv3Err(new Error('Conversation not found'), 404);
        }

        return res.apiv3({
          conversation: await serializeConversation(updated, user._id),
        });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.get(
    '/conversations/:id/messages',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;
      const limit =
        req.query.limit != null
          ? parseInt(req.query.limit.toString()) || 30
          : 30;
      const offset =
        req.query.offset != null
          ? parseInt(req.query.offset.toString(), 10)
          : 0;

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const paginationResult = await Message.findByConversation(
          new Types.ObjectId(conversationId),
          offset,
          limit,
        );

        const serializedDocs = paginationResult.docs.map((doc) => {
          const obj = doc.toObject();
          obj.sender = serializeUserSecurely(doc.sender);
          return obj;
        });

        return res.apiv3({ ...paginationResult, docs: serializedDocs });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations/:id/messages',
    accessTokenParser([SCOPE.WRITE.FEATURES.IN_APP_NOTIFICATION], {
      acceptLegacy: true,
    }),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;
      const { body } = req.body;

      if (body == null || body.trim() === '') {
        return res.apiv3Err(new Error('body is required'), 400);
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const message = await Message.create({
          conversation: conversationId,
          sender: user._id,
          body,
          readBy: [user._id],
        });

        conversation.lastMessageAt = new Date();
        await conversation.save();

        if (crowi.socketIoService.isInitialized) {
          const socket = crowi.socketIoService.getDefaultSocket();
          if (conversation.type === 'broadcast') {
            socket
              .in(BROADCAST_ROOM_NAME)
              .emit(SocketEventName.MessageCreated, {
                conversationId,
                message,
              });
          } else {
            conversation.participants.forEach((participantId) => {
              socket
                .in(
                  getRoomNameWithId(RoomPrefix.USER, participantId.toString()),
                )
                .emit(SocketEventName.MessageCreated, {
                  conversationId,
                  message,
                });
            });
          }
        }

        // fire-and-forget: don't make the sender wait on push delivery
        const senderName = user.name || user.username;
        const pushBody =
          body.length > MESSAGE_PUSH_BODY_MAX_LENGTH
            ? `${body.slice(0, MESSAGE_PUSH_BODY_MAX_LENGTH)}…`
            : body;
        getPushRecipientIds(conversation, user._id)
          .then((recipientIds) =>
            sendPushNotificationToUsers(
              recipientIds.map((id) => id.toString()),
              {
                title: `${senderName} からのメッセージ`,
                body: pushBody,
                url: '/',
                tag: conversationId,
              },
            ),
          )
          .catch((err) => {
            logger.error('Failed to send push notification for message', err);
          });

        return res.apiv3({ message });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  return router;
};
