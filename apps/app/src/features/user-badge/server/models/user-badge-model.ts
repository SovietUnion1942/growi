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
  revokedAt: {
    type: Date,
    default: null,
  },
  revokedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
});

// Granted fields (grantedAt/grantedBy/note/etc.) are immutable: no update
// API is provided for them. The only allowed mutation is revocation of a
// manual-category badge, which sets revokedAt/revokedBy; the record itself
// is never physically removed (kept for audit purposes).
//
// A duplicate (user, badgeType, level) save is rejected at the DB level with
// an E11000 duplicate-key error; `level: null` (manual badges) participates
// in the uniqueness check as a distinct, indexable value, so the same manual
// badge cannot be granted twice to the same user either. This is a PARTIAL
// unique index (`partialFilterExpression: { revokedAt: null }`): only
// active (non-revoked) records participate, so once a record is revoked,
// the same (user, badgeType, level) can be granted again as a new document
// without hitting a duplicate-key error, while the revoked record itself
// stays in place for audit history.
userBadgeSchema.index(
  { user: 1, badgeType: 1, level: 1 },
  { unique: true, partialFilterExpression: { revokedAt: null } },
);

export default getOrCreateModel<UserBadgeDocument, UserBadgeModel>(
  'UserBadge',
  userBadgeSchema,
);
