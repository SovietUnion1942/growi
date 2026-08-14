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
import { sendPushNotificationToUser } from '~/server/service/push-notification';
import {
  getRoomNameWithId,
  RoomPrefix,
} from '~/server/service/socket-io/helper';
import loggerFactory from '~/utils/logger';

import { Conversation } from '../../models/Conversation';
import { Message } from '../../models/Message';
import type { ApiV3Response } from './interfaces/apiv3-response';

const logger = loggerFactory('growi:routes:apiv3:messages');

const MESSAGE_PUSH_BODY_MAX_LENGTH = 100;

const router = express.Router();

export const setup = (crowi: Crowi): Router => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

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
          !conversation.participants.some((p) => p.equals(user._id))
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
    '/conversations',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { targetUserId } = req.body;

      if (targetUserId == null) {
        return res.apiv3Err(new Error('targetUserId is required'), 400);
      }

      try {
        const conversation = await Conversation.findOrCreateDirectConversation(
          user._id,
          targetUserId,
        );

        const conversationObj = conversation.toObject();
        const populated = await conversation.populate('participants');
        conversationObj.participants = populated.participants.map((p) =>
          serializeUserSecurely(p),
        );
        conversationObj.unreadCount = 0;

        return res.apiv3({ conversation: conversationObj });
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
          !conversation.participants.some((p) => p.equals(user._id))
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const paginationResult = await Message.findByConversation(
          new Types.ObjectId(conversationId),
          offset,
          limit,
        );
        return res.apiv3(paginationResult);
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
          !conversation.participants.some((p) => p.equals(user._id))
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
          conversation.participants.forEach((participantId) => {
            socket
              .in(getRoomNameWithId(RoomPrefix.USER, participantId.toString()))
              .emit(SocketEventName.MessageCreated, {
                conversationId,
                message,
              });
          });
        }

        // fire-and-forget: don't make the sender wait on push delivery
        const recipientIds = conversation.participants.filter(
          (p) => !p.equals(user._id),
        );
        const senderName = user.name || user.username;
        const pushBody =
          body.length > MESSAGE_PUSH_BODY_MAX_LENGTH
            ? `${body.slice(0, MESSAGE_PUSH_BODY_MAX_LENGTH)}…`
            : body;
        Promise.all(
          recipientIds.map((recipientId) =>
            sendPushNotificationToUser(recipientId.toString(), {
              title: `${senderName} からのメッセージ`,
              body: pushBody,
              url: '/',
              tag: conversationId,
            }),
          ),
        ).catch((err) => {
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
