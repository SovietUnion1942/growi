import type { Document, PaginateModel, Types } from 'mongoose';
import { Schema } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { getOrCreateModel } from '../util/mongoose-utils';

export type MessageReaction = {
  emoji: string;
  userId: Types.ObjectId;
};

export interface MessageDocument extends Document {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  readBy: Types.ObjectId[];
  mentionedUserIds: Types.ObjectId[];
  attachment?: Types.ObjectId;
  // One entry per (emoji, user) pair -- not grouped by emoji here, so this
  // shape is agnostic to whichever emoji source added the entry (a fixed
  // quick-react row today, a full picker later). Grouping for display is a
  // pure client-side transform (see reaction-utils.ts).
  reactions: MessageReaction[];
  // Soft-delete marker (set by softDeleteMessage). A deleted message keeps
  // its row (conversation/sender/createdAt stay intact for pagination and
  // unread-count consistency) but has body/attachment/reactions cleared, so
  // the client renders a placeholder instead of the original content.
  deletedAt?: Date;
  createdAt: Date;
}

export interface MessageModel extends PaginateModel<MessageDocument> {
  findByConversation(
    conversation: Types.ObjectId,
    skip: number,
    offset: number,
  );
  markAsRead(
    conversation: Types.ObjectId,
    user: Types.ObjectId,
  ) /* : Promise<Query<any>> */;
  countUnreadByConversation(
    conversationIds: Types.ObjectId[],
    user: Types.ObjectId,
  ): Promise<Map<string, number>>;
  toggleReaction(
    messageId: Types.ObjectId,
    emoji: string,
    userId: Types.ObjectId,
  ): Promise<MessageDocument | null>;
  softDeleteMessage(
    messageId: Types.ObjectId,
    senderId: Types.ObjectId,
  ): Promise<MessageDocument | null>;
}

const messageSchema = new Schema<MessageDocument, MessageModel>(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // A message must carry a body or an attachment (enforced at the route
    // level, alongside multipart parsing), so `body` allows an empty string
    // here rather than requiring one.
    body: {
      type: String,
      default: '',
    },
    readBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    mentionedUserIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    attachment: {
      type: Schema.Types.ObjectId,
      ref: 'Attachment',
    },
    reactions: [
      {
        _id: false,
        emoji: { type: String, required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
      },
    ],
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

messageSchema.plugin(mongoosePaginate);

messageSchema.index({ conversation: 1, createdAt: -1 });

messageSchema.statics.findByConversation = function (
  conversation: Types.ObjectId,
  skip: number,
  offset: number,
) {
  return this.paginate(
    { conversation },
    {
      sort: { createdAt: -1 },
      offset: skip,
      limit: offset,
      populate: 'sender',
    },
  );
};

messageSchema.statics.markAsRead = function (
  conversation: Types.ObjectId,
  user: Types.ObjectId,
) {
  return this.updateMany(
    { conversation, readBy: { $ne: user } },
    { $addToSet: { readBy: user } },
  );
};

messageSchema.statics.countUnreadByConversation = async function (
  conversationIds: Types.ObjectId[],
  user: Types.ObjectId,
) {
  const results: { _id: Types.ObjectId; count: number }[] =
    await this.aggregate([
      {
        $match: {
          conversation: { $in: conversationIds },
          readBy: { $ne: user },
        },
      },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]);

  return new Map(results.map((r) => [r._id.toString(), r.count]));
};

// Atomic per-step toggle: first try to remove a matching (emoji, userId)
// entry; if none matched (findOneAndUpdate's query filter requires the
// entry to exist, so it returns null when there's nothing to pull), add one
// instead. $addToSet already de-dupes identical entries, so the narrow
// double-click race window at worst repeats a no-op rather than corrupting
// state.
messageSchema.statics.toggleReaction = async function (
  messageId: Types.ObjectId,
  emoji: string,
  userId: Types.ObjectId,
) {
  const removed = await this.findOneAndUpdate(
    { _id: messageId, reactions: { $elemMatch: { emoji, userId } } },
    { $pull: { reactions: { emoji, userId } } },
    { new: true },
  );
  if (removed != null) {
    return removed;
  }

  return this.findOneAndUpdate(
    { _id: messageId },
    { $addToSet: { reactions: { emoji, userId } } },
    { new: true },
  );
};

// Authorization is baked into the query filter (sender: senderId) rather
// than checked separately, so this is a single atomic op: it can only ever
// match and update the caller's own, not-yet-deleted message. Returns null
// for "not found", "not the sender", and "already deleted" alike -- the
// route treats all three as a 404, which doesn't leak which case occurred.
messageSchema.statics.softDeleteMessage = async function (
  messageId: Types.ObjectId,
  senderId: Types.ObjectId,
) {
  return this.findOneAndUpdate(
    { _id: messageId, sender: senderId, deletedAt: { $exists: false } },
    {
      $set: { deletedAt: new Date(), body: '', reactions: [] },
      $unset: { attachment: '' },
    },
    { new: true },
  );
};

const Message = getOrCreateModel<MessageDocument, MessageModel>(
  'Message',
  messageSchema,
);

export { Message };
