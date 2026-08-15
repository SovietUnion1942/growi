import type { Document, Model } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '~/server/util/mongoose-utils';

import type { IBadgeLevel, IBadgeType } from '../../interfaces/badge';

export interface BadgeTypeDocument extends IBadgeType, Document {}
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BadgeTypeModel extends Model<BadgeTypeDocument> {}

const badgeLevelSchema = new Schema<IBadgeLevel>(
  {
    level: { type: Number, required: true, min: 1 },
    name: { type: String, required: true },
    iconKey: { type: String, required: true },
    threshold: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const badgeTypeSchema = new Schema<BadgeTypeDocument, BadgeTypeModel>({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
  iconKey: {
    type: String,
    required: true,
  },
  category: {
    type: String,
    required: true,
    enum: ['automatic', 'manual'],
  },
  levels: {
    type: [badgeLevelSchema],
    default: [],
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  deletedAt: {
    type: Date,
    default: null,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
});

// Enforce the category-dependent shape of `levels`:
// - automatic: at least one level, each with a threshold, `level` numbers
//   strictly ascending and unique
// - manual: no levels at all
badgeTypeSchema.pre('validate', function (this: BadgeTypeDocument, next) {
  if (this.category === 'automatic') {
    if (this.levels == null || this.levels.length < 1) {
      next(
        new Error(
          'An automatic BadgeType must have at least one level with a threshold.',
        ),
      );
      return;
    }

    for (const level of this.levels) {
      if (level.threshold == null) {
        next(
          new Error(
            'Every level of an automatic BadgeType must have a threshold.',
          ),
        );
        return;
      }
    }

    for (let i = 1; i < this.levels.length; i += 1) {
      if (this.levels[i].level <= this.levels[i - 1].level) {
        next(
          new Error(
            'Levels of an automatic BadgeType must be unique and in ascending order.',
          ),
        );
        return;
      }
    }
  } else if (this.category === 'manual' && this.levels?.length > 0) {
    next(new Error('A manual BadgeType must not have any levels.'));
    return;
  }

  next();
});

export default getOrCreateModel<BadgeTypeDocument, BadgeTypeModel>(
  'BadgeType',
  badgeTypeSchema,
);
