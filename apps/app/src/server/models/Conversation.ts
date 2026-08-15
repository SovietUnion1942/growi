import type { Document, PaginateModel } from 'mongoose';
import { Schema, Types } from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

import { getOrCreateModel } from '../util/mongoose-utils';

export type ConversationType = 'direct' | 'group' | 'broadcast';

export interface ConversationDocument extends Document {
  _id: Types.ObjectId;
  type: ConversationType;
  // ignored/empty for 'broadcast': membership is implicit (every user)
  participants: Types.ObjectId[];
  name?: string; // required for 'group'; fixed label for 'broadcast'
  createdBy?: Types.ObjectId; // unset for 'broadcast'
  mutedBy: Types.ObjectId[];
  lastMessageAt: Date;
  createdAt: Date;
}

export interface ConversationModel extends PaginateModel<ConversationDocument> {
  findOrCreateDirectConversation(
    userId1: Types.ObjectId,
    userId2: Types.ObjectId,
  ): Promise<ConversationDocument>;
  createGroup(
    creatorId: Types.ObjectId,
    participantIds: Types.ObjectId[],
    name: string,
  ): Promise<ConversationDocument>;
  findOrCreateBroadcast(): Promise<ConversationDocument>;
  findByUser(user: Types.ObjectId, skip: number, offset: number);
  addParticipant(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<ConversationDocument | null>;
  removeParticipant(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<ConversationDocument | null>;
  setMuted(
    conversationId: Types.ObjectId,
    userId: Types.ObjectId,
    muted: boolean,
  );
}

const conversationSchema = new Schema<ConversationDocument, ConversationModel>(
  {
    type: {
      type: String,
      enum: ['direct', 'group', 'broadcast'],
      required: true,
      default: 'direct',
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        index: true,
      },
    ],
    name: {
      type: String,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
    mutedBy: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
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
conversationSchema.index({ participants: 1, type: 1 });
// 全体連絡(broadcast)はシステム全体で1件だけ存在する
conversationSchema.index(
  { type: 1 },
  { unique: true, partialFilterExpression: { type: 'broadcast' } },
);

conversationSchema.statics.findOrCreateDirectConversation = async function (
  userId1: Types.ObjectId,
  userId2: Types.ObjectId,
) {
  const existing = await this.findOne({
    type: 'direct',
    participants: { $all: [userId1, userId2], $size: 2 },
  });
  if (existing != null) return existing;

  return this.create({
    type: 'direct',
    participants: [userId1, userId2],
  });
};

conversationSchema.statics.createGroup = function (
  creatorId: Types.ObjectId,
  participantIds: Types.ObjectId[],
  name: string,
) {
  const uniqueParticipantIds = Array.from(
    new Set([creatorId, ...participantIds].map((id) => id.toString())),
  );
  const uniqueParticipants = uniqueParticipantIds.map(
    (id) => new Types.ObjectId(id),
  );

  return this.create({
    type: 'group',
    participants: uniqueParticipants,
    name,
    createdBy: creatorId,
  });
};

conversationSchema.statics.findOrCreateBroadcast = function () {
  return this.findOneAndUpdate(
    { type: 'broadcast' },
    {
      $setOnInsert: {
        type: 'broadcast',
        participants: [],
        name: '全体連絡',
      },
    },
    { upsert: true, new: true },
  );
};

conversationSchema.statics.findByUser = async function (
  user: Types.ObjectId,
  skip: number,
  offset: number,
) {
  // lazily ensure the singleton broadcast conversation exists so every
  // user's list includes it, without needing to sync a participants list
  await this.findOrCreateBroadcast();

  return this.paginate(
    { $or: [{ type: 'broadcast' }, { participants: user }] },
    { sort: { lastMessageAt: -1 }, offset: skip, limit: offset },
  );
};

conversationSchema.statics.addParticipant = function (
  conversationId: Types.ObjectId,
  userId: Types.ObjectId,
) {
  return this.findOneAndUpdate(
    { _id: conversationId, type: 'group' },
    { $addToSet: { participants: userId } },
    { new: true },
  );
};

conversationSchema.statics.removeParticipant = function (
  conversationId: Types.ObjectId,
  userId: Types.ObjectId,
) {
  return this.findOneAndUpdate(
    { _id: conversationId, type: 'group' },
    { $pull: { participants: userId } },
    { new: true },
  );
};

conversationSchema.statics.setMuted = function (
  conversationId: Types.ObjectId,
  userId: Types.ObjectId,
  muted: boolean,
) {
  return this.updateOne(
    { _id: conversationId },
    muted ? { $addToSet: { mutedBy: userId } } : { $pull: { mutedBy: userId } },
  );
};

const Conversation = getOrCreateModel<ConversationDocument, ConversationModel>(
  'Conversation',
  conversationSchema,
);

export { Conversation };
