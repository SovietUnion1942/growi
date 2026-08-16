import type { IUserHasId } from '@growi/core';
import type { Types } from 'mongoose';

import type Crowi from '~/server/crowi';
import { AttachmentType } from '~/server/interfaces/attachment';
import loggerFactory from '~/utils/logger';

import type {
  BadgeCategory,
  IBadgeLevel,
  IBadgeType,
} from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import { resweepBadgeType } from './badge-grant-service';
import {
  BadgeTypeNotFoundError,
  BadgeTypeValidationError,
} from './badge-type-errors';

const logger = loggerFactory('growi:features:user-badge:badge-type-service');

/** `BadgeType` as returned from persistence, i.e. including its Mongo `_id`. */
export type IBadgeTypeHasId = IBadgeType & { _id: Types.ObjectId };

export type CreateBadgeTypeInput = Pick<
  IBadgeType,
  'name' | 'description' | 'iconKey' | 'category' | 'levels' | 'iconType'
> & {
  /**
   * An admin-uploaded image for the BadgeType icon (requirement 6.1/6.2).
   * When present, this always wins over `iconType`: the created BadgeType
   * is persisted with `iconType: 'image'` and `iconAttachment` set to the
   * newly-created `Attachment`'s id, regardless of what `iconType` says.
   */
  iconImageFile?: Express.Multer.File;
};

// `category` is intentionally excluded: requirement 1.4 only allows editing
// name/icon/description/levels(thresholds), and changing category after
// creation would violate the automatic/manual levels invariant that the
// rest of the system (grant evaluation, resweep) relies on.
export type UpdateBadgeTypeInput = Partial<
  Pick<IBadgeType, 'name' | 'description' | 'iconKey' | 'levels' | 'iconType'>
> & {
  /** Same semantics as `CreateBadgeTypeInput.iconImageFile` (see above). */
  iconImageFile?: Express.Multer.File;
};

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

/**
 * Fires `resweepBadgeType` without awaiting it (design.md, BadgeTypeService
 * Implementation Notes: "自動区分のバッジ種類が新規作成または levels/threshold が変更
 * された場合、BadgeGrantService の resweep を fire-and-forget で呼び出す"). Mirrors
 * `update-page.ts`'s `postAction(...)` fire-and-forget precedent: the caller
 * (an apiv3 route handler) must not block its HTTP response on a
 * potentially long-running resweep over every user with edit activity.
 * Errors are logged here rather than propagated, since there is no request
 * still in flight to report them to by the time they occur.
 */
function fireResweep(badgeTypeId: Types.ObjectId, crowi: Crowi): void {
  resweepBadgeType(badgeTypeId.toString(), crowi).catch((err) => {
    logger.error(`Resweep failed for BadgeType ${badgeTypeId.toString()}`, err);
  });
}

/**
 * Uploads `iconImageFile` via the existing `AttachmentService.createAttachment`
 * (requirement 6.2), tagged `AttachmentType.BADGE_ICON`, and returns the
 * fields to persist on the BadgeType document.
 *
 * This function only ever CREATES a new Attachment — it never deletes one.
 * Deletion of a previous icon Attachment (requirement 6.4) is the caller's
 * responsibility (see `updateBadgeType`), and must be scoped to that
 * specific BadgeType's own previous `iconAttachment` id, never to a query by
 * `attachmentType` alone (that pattern belongs to the BRAND_LOGO
 * site-wide-singleton route and would delete every other BadgeType's image
 * too — see design.md).
 */
async function saveIconImage(
  iconImageFile: Express.Multer.File,
  uploadedBy: IUserHasId,
  crowi: Crowi,
): Promise<Pick<IBadgeType, 'iconType' | 'iconAttachment'>> {
  const attachment = await crowi.attachmentService.createAttachment(
    iconImageFile,
    uploadedBy,
    null,
    AttachmentType.BADGE_ICON,
    undefined,
  );

  return { iconType: 'image', iconAttachment: attachment._id };
}

export const createBadgeType = async (
  input: CreateBadgeTypeInput,
  createdBy: IUserHasId,
  crowi: Crowi,
): Promise<IBadgeTypeHasId> => {
  assertValidLevelsForCategory(input.category, input.levels);

  const iconFields =
    input.iconImageFile != null
      ? await saveIconImage(input.iconImageFile, createdBy, crowi)
      : { iconType: input.iconType, iconAttachment: null };

  const created = await BadgeType.create({
    name: input.name,
    description: input.description,
    iconKey: input.iconKey,
    category: input.category,
    levels: input.levels,
    createdBy: createdBy._id,
    ...iconFields,
  });

  // Requirement 2.5: a newly-created automatic BadgeType may already match
  // users' pre-existing activity, so resweep immediately rather than
  // waiting for their next realtime-triggering edit.
  if (created.category === 'automatic') {
    fireResweep(created._id, crowi);
  }

  return created.toObject();
};

export const updateBadgeType = async (
  id: string,
  input: UpdateBadgeTypeInput,
  crowi: Crowi,
  /**
   * The admin performing the update. Only required when `input.iconImageFile`
   * is set (it becomes the uploaded Attachment's `creator`) — omitted by
   * every non-image-upload call site, so this stays optional rather than
   * forcing every existing caller to thread an actor through.
   */
  uploadedBy?: IUserHasId,
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

  const { iconImageFile, ...rest } = input;

  let iconFields: Partial<Pick<IBadgeType, 'iconType' | 'iconAttachment'>> = {};
  if (iconImageFile != null) {
    if (uploadedBy == null) {
      throw new BadgeTypeValidationError(
        'uploadedBy is required when replacing a BadgeType icon image.',
      );
    }

    // Read this BadgeType's OWN previous iconAttachment id before it gets
    // overwritten below. Create the new Attachment first, then delete the
    // old one by that exact id — never by an `attachmentType`-only query,
    // which would also match (and delete) every other BadgeType's
    // BADGE_ICON attachment (requirement 6.4; see design.md's warning about
    // the BRAND_LOGO route's site-wide-singleton delete pattern).
    const previousIconAttachment = existing.iconAttachment;
    iconFields = await saveIconImage(iconImageFile, uploadedBy, crowi);
    if (previousIconAttachment != null) {
      await crowi.attachmentService.removeAttachment(previousIconAttachment);
    }
  }

  const updated = await BadgeType.findByIdAndUpdate(
    id,
    { $set: { ...rest, ...iconFields } },
    { new: true, runValidators: true },
  );
  if (updated == null) {
    throw new BadgeTypeNotFoundError(`BadgeType not found: ${id}`);
  }

  // Requirement 2.5: resweep on every successful update to an automatic
  // BadgeType, not only ones that touch `levels`. Distinguishing a
  // levels/threshold-changing update from a name/description/iconKey-only
  // one is fragile here (the `$set` payload alone doesn't say whether the
  // *values* actually differ from what's stored), and resweep is already
  // idempotent (task 3.5) and cheap to call slightly more often than the
  // strict minimum, so this simplification is deliberate: it trades a rare
  // redundant resweep for certainty that a threshold-lowering edit is never
  // missed.
  if (updated.category === 'automatic') {
    fireResweep(updated._id, crowi);
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
