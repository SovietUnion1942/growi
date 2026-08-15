import type { IUserHasId } from '@growi/core';
import type { Types } from 'mongoose';

import type {
  BadgeCategory,
  IBadgeLevel,
  IBadgeType,
} from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import {
  BadgeTypeNotFoundError,
  BadgeTypeValidationError,
} from './badge-type-errors';

/** `BadgeType` as returned from persistence, i.e. including its Mongo `_id`. */
export type IBadgeTypeHasId = IBadgeType & { _id: Types.ObjectId };

export type CreateBadgeTypeInput = Pick<
  IBadgeType,
  'name' | 'description' | 'iconKey' | 'category' | 'levels'
>;

// `category` is intentionally excluded: requirement 1.4 only allows editing
// name/icon/description/levels(thresholds), and changing category after
// creation would violate the automatic/manual levels invariant that the
// rest of the system (grant evaluation, resweep) relies on.
export type UpdateBadgeTypeInput = Partial<
  Pick<IBadgeType, 'name' | 'description' | 'iconKey' | 'levels'>
>;

/**
 * Re-checks the category/levels shape that `BadgeType`'s `pre('validate')`
 * hook also enforces. This is deliberate defense-in-depth, not redundancy:
 * `findByIdAndUpdate(..., { runValidators: true })` (used by
 * `updateBadgeType`) runs schema-level validators but does not invoke
 * Mongoose document middleware such as `pre('validate')`, so without this
 * check an inconsistent update could otherwise reach the database.
 * Throwing here also lets callers reject requests before any write is
 * attempted, rather than surfacing a raw Mongoose `ValidationError`.
 */
function assertValidLevelsForCategory(
  category: BadgeCategory,
  levels: IBadgeLevel[],
): void {
  if (category === 'automatic') {
    if (levels.length < 1) {
      throw new BadgeTypeValidationError(
        'An automatic BadgeType must have at least one level with a threshold.',
      );
    }

    for (const level of levels) {
      if (level.threshold == null) {
        throw new BadgeTypeValidationError(
          'Every level of an automatic BadgeType must have a threshold.',
        );
      }
    }

    for (let i = 1; i < levels.length; i += 1) {
      if (levels[i].level <= levels[i - 1].level) {
        throw new BadgeTypeValidationError(
          'Levels of an automatic BadgeType must be unique and in ascending order.',
        );
      }
    }
    return;
  }

  if (levels.length > 0) {
    throw new BadgeTypeValidationError(
      'A manual BadgeType must not have any levels.',
    );
  }
}

export const createBadgeType = async (
  input: CreateBadgeTypeInput,
  createdBy: IUserHasId,
): Promise<IBadgeTypeHasId> => {
  assertValidLevelsForCategory(input.category, input.levels);

  const created = await BadgeType.create({
    name: input.name,
    description: input.description,
    iconKey: input.iconKey,
    category: input.category,
    levels: input.levels,
    createdBy: createdBy._id,
  });

  return created.toObject();
};

export const updateBadgeType = async (
  id: string,
  input: UpdateBadgeTypeInput,
): Promise<IBadgeTypeHasId> => {
  // Runtime guard against `category` changes: the type signature already
  // excludes `category`, but callers at the HTTP boundary work with
  // untyped JSON, so a request body carrying `category` must still be
  // rejected explicitly rather than silently ignored or passed through.
  if ('category' in input) {
    throw new BadgeTypeValidationError(
      'category cannot be changed after a BadgeType has been created.',
    );
  }

  const existing = await BadgeType.findOne({ _id: id, isDeleted: false });
  if (existing == null) {
    throw new BadgeTypeNotFoundError(`BadgeType not found: ${id}`);
  }

  const nextLevels = input.levels ?? existing.levels;
  assertValidLevelsForCategory(existing.category, nextLevels);

  const updated = await BadgeType.findByIdAndUpdate(
    id,
    { $set: input },
    { new: true, runValidators: true },
  );
  if (updated == null) {
    throw new BadgeTypeNotFoundError(`BadgeType not found: ${id}`);
  }

  return updated.toObject();
};

/**
 * Soft-deletes a BadgeType (requirement 1.5): the document itself is kept
 * so that existing `UserBadge` references keep resolving to it, but new
 * grants must stop choosing it (enforced by callers filtering on
 * `isDeleted` before granting, and by `listBadgeTypes(false)` excluding it
 * from the default admin list).
 *
 * Calling this again on an already-deleted BadgeType is a no-op success
 * rather than an error: the end state ("this BadgeType is deleted") is
 * already satisfied, so treating a repeat call as a client error would
 * only punish callers for a benign race (e.g. a double click) without any
 * corresponding data-integrity risk.
 */
export const deleteBadgeType = async (id: string): Promise<void> => {
  const existing = await BadgeType.findById(id);
  if (existing == null) {
    throw new BadgeTypeNotFoundError(`BadgeType not found: ${id}`);
  }

  if (existing.isDeleted) {
    return;
  }

  await BadgeType.updateOne(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );
};

export const listBadgeTypes = async (
  includeDeleted: boolean,
): Promise<IBadgeTypeHasId[]> => {
  const filter = includeDeleted ? {} : { isDeleted: false };
  const docs = await BadgeType.find(filter);
  return docs.map((doc) => doc.toObject());
};
