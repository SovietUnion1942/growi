import type { IUserHasId } from '@growi/core';
import { SCOPE } from '@growi/core/dist/interfaces';
import { serializeUserSecurely } from '@growi/core/dist/models/serializers';
import type { Router } from 'express';
import express from 'express';
import { Types } from 'mongoose';
import multer from 'multer';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import { SocketEventName } from '~/interfaces/websocket';
import type Crowi from '~/server/crowi';
import { AttachmentType } from '~/server/interfaces/attachment';
import { accessTokenParser } from '~/server/middlewares/access-token-parser';
import loginRequiredFactory from '~/server/middlewares/login-required';
import { UserStatus } from '~/server/models/user/conts';
import { validateImageContentType } from '~/server/routes/attachment/image-content-type-validator';
import { findOrCreateGrowiBotUser } from '~/server/service/growi-bot-user';
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
import {
  buildBotReplyHistory,
  MAX_BOT_REPLY_HISTORY,
  shouldTriggerBotReply,
} from './messages-bot-reply';

const logger = loggerFactory('growi:routes:apiv3:messages');

const MESSAGE_PUSH_BODY_MAX_LENGTH = 100;
const IMAGE_PUSH_BODY_FALLBACK = '📷 画像を送信しました';
// Generous enough for a multi-codepoint ZWJ sequence (e.g. a family emoji
// with skin-tone modifiers) while still rejecting arbitrary long strings.
const MAX_EMOJI_LENGTH = 32;

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
  // same multer config shape as badge-type.ts / customize-setting.js's
  // upload-brand-logo: a disk-backed temp store, expecting a single 'file'
  // field. When Content-Type isn't multipart/form-data, multer is a no-op
  // and req.body is left to the JSON body parser, so this route keeps
  // accepting plain text-only JSON sends unchanged.
  const uploads = multer({ dest: `${crowi.tmpDir}uploads` });

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
  // broadcast has no fixed participant list, so it fans out to every active user.
  // Mentioned users bypass the mute filter — a mention is an explicit call-out
  // and should reach them even if they've muted the conversation as a whole.
  const getPushRecipientIds = async (
    conversation: ConversationDocument,
    senderId: Types.ObjectId,
    mentionedIds: Types.ObjectId[] = [],
  ): Promise<Types.ObjectId[]> => {
    const mutedIds = new Set(conversation.mutedBy.map((id) => id.toString()));
    const mentionedIdSet = new Set(mentionedIds.map((id) => id.toString()));

    const candidateIds: Types.ObjectId[] =
      conversation.type === 'broadcast'
        ? (await User.find({ status: UserStatus.STATUS_ACTIVE }, '_id')).map(
            (u) => u._id,
          )
        : conversation.participants;

    return candidateIds.filter(
      (id) =>
        !id.equals(senderId) &&
        (mentionedIdSet.has(id.toString()) || !mutedIds.has(id.toString())),
    );
  };

  // Only ids that are valid ObjectIds AND a legitimate mention target are kept:
  // for direct/group, that means an existing participant; broadcast has no
  // fixed participant list, so any existing user is a valid mention there.
  const resolveMentionedUserIds = async (
    conversation: ConversationDocument,
    rawMentionedUserIds: unknown,
  ): Promise<Types.ObjectId[]> => {
    if (!Array.isArray(rawMentionedUserIds)) {
      return [];
    }

    const candidateIds = rawMentionedUserIds
      .filter(
        (id): id is string =>
          typeof id === 'string' && Types.ObjectId.isValid(id),
      )
      .map((id) => new Types.ObjectId(id));

    if (candidateIds.length === 0) {
      return [];
    }

    if (conversation.type === 'broadcast') {
      const existingUsers = await User.find(
        { _id: { $in: candidateIds } },
        '_id',
      );
      return existingUsers.map((u) => u._id);
    }

    return candidateIds.filter((id) =>
      conversation.participants.some((p) => p.equals(id)),
    );
  };

  // Broadcasts a message-related event to everyone who can see the
  // conversation: the shared broadcast room for a 'broadcast' conversation,
  // or each participant's own user room otherwise. Shared by MessageCreated
  // and MessageReactionUpdated so the two stay consistent.
  const emitToConversation = (
    conversation: ConversationDocument,
    eventName: string,
    payload: unknown,
  ): void => {
    if (!crowi.socketIoService.isInitialized) {
      return;
    }
    const socket = crowi.socketIoService.getDefaultSocket();
    if (conversation.type === 'broadcast') {
      socket.in(BROADCAST_ROOM_NAME).emit(eventName, payload);
      return;
    }
    conversation.participants.forEach((participantId) => {
      socket
        .in(getRoomNameWithId(RoomPrefix.USER, participantId.toString()))
        .emit(eventName, payload);
    });
  };

  // Generates and posts the bot's reply as an ordinary Message from the bot
  // User, reusing the same create -> emit -> push pipeline a human send
  // uses. Dynamic import keeps the mastra/AI SDK stack out of this route's
  // static import graph (it's always loaded; see server-boot-imports rule)
  // -- it's only pulled in on the rare request that actually needs it.
  // Errors are the caller's responsibility (fire-and-forget .catch()).
  const triggerBotReply = async (
    conversation: ConversationDocument,
    botUser: { _id: Types.ObjectId },
    askingUser: IUserHasId,
  ): Promise<void> => {
    const recentMessages = await Message.find({
      conversation: conversation._id,
    })
      .sort({ createdAt: -1 })
      .limit(MAX_BOT_REPLY_HISTORY)
      .select('sender body')
      .lean();
    const history = buildBotReplyHistory(recentMessages.reverse(), botUser._id);

    // factory pattern: the module receives crowi (e.g. crowi.searchService
    // for the agent's search tool) rather than importing the Crowi class --
    // see esm-authoring.md's no-Crowi-import-cycle rule.
    const { createGetGrowiAgentReply } = await import(
      '~/features/mastra/server/services/growi-agent-dm-reply'
    );
    const getGrowiAgentReply = createGetGrowiAgentReply(crowi);
    const replyBody = (await getGrowiAgentReply(history, askingUser)).trim();
    if (replyBody === '') {
      return;
    }

    const botMessage = await Message.create({
      conversation: conversation._id,
      sender: botUser._id,
      body: replyBody,
      readBy: [botUser._id],
      mentionedUserIds: [],
    });

    conversation.lastMessageAt = new Date();
    await conversation.save();

    emitToConversation(conversation, SocketEventName.MessageCreated, {
      conversationId: conversation._id.toString(),
      message: botMessage,
    });

    const pushBody =
      replyBody.length > MESSAGE_PUSH_BODY_MAX_LENGTH
        ? `${replyBody.slice(0, MESSAGE_PUSH_BODY_MAX_LENGTH)}…`
        : replyBody;
    const recipientIds = await getPushRecipientIds(conversation, botUser._id);
    await sendPushNotificationToUsers(
      recipientIds.map((id) => id.toString()),
      {
        title: 'GROWI AI からのメッセージ',
        body: pushBody,
        url: '/',
        tag: conversation._id.toString(),
      },
    );
  };

  // A multipart/form-data body (image send) can't carry a real array field,
  // so the client JSON-stringifies mentionedUserIds in that case; a plain
  // JSON body already has a real array. Normalize both shapes here.
  const parseMentionedUserIdsInput = (raw: unknown): unknown => {
    if (typeof raw !== 'string') {
      return raw;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
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
        // Lazily ensures the bot User exists before it could ever be
        // searched for, mirroring findOrCreateBroadcast()'s own
        // ensure-on-list-fetch pattern below: a user opens the Messages
        // panel (which fetches this list) before they'd ever open "start a
        // new conversation" and search for the bot by name.
        await findOrCreateGrowiBotUser(User);

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
    uploads.single('file'),
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId } = req.params;
      const { body, mentionedUserIds: rawMentionedUserIds } = req.body;
      const file = req.file;

      const trimmedBody = typeof body === 'string' ? body.trim() : '';
      if (trimmedBody === '' && file == null) {
        return res.apiv3Err(new Error('body or file is required'), 400);
      }

      if (file != null) {
        const { isValid, error } = validateImageContentType(file.mimetype);
        if (!isValid) {
          return res.apiv3Err(new Error(error ?? 'Invalid file type.'), 400);
        }
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const mentionedUserIds = await resolveMentionedUserIds(
          conversation,
          parseMentionedUserIdsInput(rawMentionedUserIds),
        );

        const attachment =
          file != null
            ? await crowi.attachmentService.createAttachment(
                file,
                user,
                null,
                AttachmentType.MESSAGE_IMAGE,
                undefined,
              )
            : undefined;

        const message = await Message.create({
          conversation: conversationId,
          sender: user._id,
          body: trimmedBody,
          readBy: [user._id],
          mentionedUserIds,
          attachment: attachment?._id,
        });

        conversation.lastMessageAt = new Date();
        await conversation.save();

        emitToConversation(conversation, SocketEventName.MessageCreated, {
          conversationId,
          message,
        });

        // fire-and-forget: don't make the sender wait on push delivery
        const senderName = user.name || user.username;
        const pushBody =
          trimmedBody === ''
            ? IMAGE_PUSH_BODY_FALLBACK
            : trimmedBody.length > MESSAGE_PUSH_BODY_MAX_LENGTH
              ? `${trimmedBody.slice(0, MESSAGE_PUSH_BODY_MAX_LENGTH)}…`
              : trimmedBody;
        getPushRecipientIds(conversation, user._id, mentionedUserIds)
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

        // fire-and-forget: the human sender doesn't wait on agent inference
        const botUser = await findOrCreateGrowiBotUser(User);
        if (
          shouldTriggerBotReply(
            conversation,
            user._id,
            mentionedUserIds,
            botUser._id,
          )
        ) {
          // CrowiRequest types req.user as HydratedDocument<IUser> (_id:
          // ObjectId), while IUserHasId types _id as string -- the same
          // known mismatch documented in attachment-add-activity.integ.ts.
          triggerBotReply(
            conversation,
            botUser,
            user as unknown as IUserHasId,
          ).catch((err) => {
            logger.error('Failed to generate bot reply', err);
          });
        }

        return res.apiv3({ message });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  router.post(
    '/conversations/:id/messages/:messageId/reactions',
    accessTokenParser(),
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const user = req.user!;
      const { id: conversationId, messageId } = req.params;
      const { emoji } = req.body;

      if (
        typeof emoji !== 'string' ||
        emoji.trim() === '' ||
        emoji.length > MAX_EMOJI_LENGTH
      ) {
        return res.apiv3Err(new Error('emoji is required'), 400);
      }

      try {
        const conversation = await Conversation.findById(conversationId);
        if (
          conversation == null ||
          !isConversationMember(conversation, user._id)
        ) {
          return res.apiv3Err(new Error('Forbidden'), 403);
        }

        const message = await Message.toggleReaction(
          new Types.ObjectId(messageId),
          emoji,
          user._id,
        );
        // also guards against toggling a reaction on a message that
        // belongs to a different conversation than the one just verified
        if (message == null || !message.conversation.equals(conversation._id)) {
          return res.apiv3Err(new Error('Message not found'), 404);
        }

        emitToConversation(
          conversation,
          SocketEventName.MessageReactionUpdated,
          { conversationId, message },
        );

        return res.apiv3({ message });
      } catch (err) {
        return res.apiv3Err(err);
      }
    },
  );

  return router;
};
