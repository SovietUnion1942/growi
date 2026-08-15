import type { Document, Model } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '~/server/util/mongoose-utils';

import type { IUserBadge } from '../../interfaces/badge';

export interface UserBadgeDocument extends IUserBadge, Document {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface UserBadgeModel extends Model<UserBadgeDocument> {}

const userBadgeSchema = new Schema<UserBadgeDocument, UserBadgeModel>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  badgeType: {
    type: Schema.Types.ObjectId,
    ref: 'BadgeType',
    required: true,
  },
  level: {
    type: Number,
    default: null,
  },
  grantedAt: {
    type: Date,
    required: true,
  },
  grantedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  note: {
    type: String,
    default: null,
  },
});

// Records are immutable: no update/removal API is provided by this model.
// A duplicate (user, badgeType, level) save is rejected at the DB level with
// an E11000 duplicate-key error; `level: null` (manual badges) participates
// in the uniqueness check as a distinct, indexable value, so the same manual
// badge cannot be granted twice to the same user either.
userBadgeSchema.index({ user: 1, badgeType: 1, level: 1 }, { unique: true });

export default getOrCreateModel<UserBadgeDocument, UserBadgeModel>(
  'UserBadge',
  userBadgeSchema,
);
