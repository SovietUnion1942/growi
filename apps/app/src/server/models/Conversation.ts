import type { Document, PaginateModel, Types } from 'mongoose';
import { Schema } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { getOrCreateModel } from '../util/mongoose-utils';

export interface ConversationDocument extends Document {
  _id: Types.ObjectId;
  participants: Types.ObjectId[];
  isGroup: boolean;
  lastMessageAt: Date;
  createdAt: Date;
}

export interface ConversationModel extends PaginateModel<ConversationDocument> {
  findOrCreateDirectConversation(
    userId1: Types.ObjectId,
    userId2: Types.ObjectId,
  ): Promise<ConversationDocument>;
  findByUser(user: Types.ObjectId, skip: number, offset: number);
}

const conversationSchema = new Schema<ConversationDocument, ConversationModel>(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
      },
    ],
    isGroup: {
      type: Boolean,
      default: false,
      required: true,
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

conversationSchema.plugin(mongoosePaginate);

// 1対1の会話を「同じparticipantsの組み合わせ」で一意にするためのインデックス
conversationSchema.index({ participants: 1, isGroup: 1 });

conversationSchema.statics.findOrCreateDirectConversation = async function (
  userId1: Types.ObjectId,
  userId2: Types.ObjectId,
) {
  const existing = await this.findOne({
    isGroup: false,
    participants: { $all: [userId1, userId2], $size: 2 },
  });
  if (existing != null) return existing;

  return this.create({
    participants: [userId1, userId2],
    isGroup: false,
  });
};

conversationSchema.statics.findByUser = function (
  user: Types.ObjectId,
  skip: number,
  offset: number,
) {
  return this.paginate(
    { participants: user },
    { sort: { lastMessageAt: -1 }, offset: skip, limit: offset },
  );
};

const Conversation = getOrCreateModel<ConversationDocument, ConversationModel>(
  'Conversation',
  conversationSchema,
);

export { Conversation };
