import type { Types } from 'mongoose';

import { SupportedAction } from '~/interfaces/activity';
import { prisma } from '~/utils/prisma';

import type { IUserBadge } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';

/** `UserBadge` as returned from persistence, i.e. including its Mongo `_id`. */
export type IUserBadgeHasId = IUserBadge & { _id: Types.ObjectId };

/**
 * Counts the user's cumulative Wiki-editing contributions: page creations
 * and page updates only (requirement 2.1). Deliberately reads
 * `prisma.activities` directly with an explicit `action` filter rather than
 * reusing the Contribution model, whose aggregated `count` spans a
 * different set of actions and would therefore violate requirement 2.6
 * (e.g. comment activity must never inflate this count). See research.md,
 * "Decision: 累積貢献数のカウント方式".
 */
export const getCumulativeEditCount = (userId: string): Promise<number> => {
  return prisma.activities.count({
    where: {
      userId,
      action: {
        in: [
          SupportedAction.ACTION_PAGE_CREATE,
          SupportedAction.ACTION_PAGE_UPDATE,
        ],
      },
    },
  });
};

/** True for a Mongo/Mongoose duplicate-key error (E11000). */
function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err != null &&
    'code' in err &&
    (err as { code?: unknown }).code === 11000
  );
}

/**
 * Creates a single UserBadge grant, treating a duplicate-key rejection as
 * "already granted" rather than an error (design.md, "Concurrency
 * strategy"). This is what makes `evaluateAndGrantForUser` safe to call
 * repeatedly at the same cumulative count (requirement 2.4), and safe under
 * a race between the realtime evaluation path and a resweep re-evaluation
 * of the same (user, badgeType, level).
 */
async function grantLevelIfNotAlreadyGranted(
  userId: string,
  badgeTypeId: Types.ObjectId,
  level: number,
): Promise<IUserBadgeHasId | null> {
  try {
    const created = await UserBadge.create({
      user: userId,
      badgeType: badgeTypeId,
      level,
      grantedAt: new Date(),
      grantedBy: null,
      note: null,
    });
    return created.toObject();
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      return null;
    }
    throw err;
  }
}

/**
 * Evaluates a user's cumulative edit count against every (or, when
 * `scopedBadgeTypeId` is given, one) automatic BadgeType's levels, and
 * grants every level whose threshold is newly met.
 *
 * Called from both the realtime event-subscription path (task 3.2, on each
 * ACTION_PAGE_CREATE/ACTION_PAGE_UPDATE) and the resweep path (task 3.5,
 * after a BadgeType's thresholds change or for retroactive backfill) so
 * the grant logic itself lives in exactly one place (design.md).
 *
 * All newly-qualified levels are granted in the same pass — not just the
 * highest one — so a user whose cumulative count jumps past multiple
 * thresholds at once (e.g. a bulk import) still receives every level they
 * qualify for (requirement 2.3). Already-granted lower-level UserBadge
 * documents are never read for the purpose of mutation; they are simply
 * left alone, since granting only ever inserts new documents.
 */
export const evaluateAndGrantForUser = async (
  userId: string,
  scopedBadgeTypeId?: string,
): Promise<IUserBadgeHasId[]> => {
  const badgeTypes = await BadgeType.find({
    category: 'automatic',
    isDeleted: false,
    ...(scopedBadgeTypeId != null ? { _id: scopedBadgeTypeId } : {}),
  });

  if (badgeTypes.length === 0) {
    return [];
  }

  const cumulativeCount = await getCumulativeEditCount(userId);

  const alreadyGranted = await UserBadge.find({
    user: userId,
    badgeType: { $in: badgeTypes.map((badgeType) => badgeType._id) },
  }).select('badgeType level');
  const alreadyGrantedKeys = new Set(
    alreadyGranted.map(
      (grant) => `${grant.badgeType.toString()}:${grant.level}`,
    ),
  );

  const granted: IUserBadgeHasId[] = [];

  for (const badgeType of badgeTypes) {
    const newlyQualifyingLevels = badgeType.levels.filter(
      (level) =>
        level.threshold <= cumulativeCount &&
        !alreadyGrantedKeys.has(`${badgeType._id.toString()}:${level.level}`),
    );

    // Distinct levels of the same badge type never collide on the unique
    // (user, badgeType, level) index, so granting them concurrently is safe.
    const results = await Promise.all(
      newlyQualifyingLevels.map((level) =>
        grantLevelIfNotAlreadyGranted(userId, badgeType._id, level.level),
      ),
    );
    for (const result of results) {
      if (result != null) {
        granted.push(result);
      }
    }
  }

  return granted;
};
