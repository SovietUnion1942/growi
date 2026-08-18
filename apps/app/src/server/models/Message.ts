import type { Document, PaginateModel, Types } from 'mongoose';
import { Schema } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { getOrCreateModel } from '../util/mongoose-utils';

export interface MessageDocument extends Document {
  _id: Types.ObjectId;
  conversation: Types.ObjectId;
  sender: Types.ObjectId;
  body: string;
  readBy: Types.ObjectId[];
  mentionedUserIds: Types.ObjectId[];
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
    body: {
      type: String,
      required: true,
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

const Message = getOrCreateModel<MessageDocument, MessageModel>(
  'Message',
  messageSchema,
);

export { Message };
