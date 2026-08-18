import type { IUserBadgeSummaryEntry, IUserHasId } from '@growi/core';
import mongoose, { type Types } from 'mongoose';

import { SupportedAction, SupportedTargetModel } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import { preNotifyService } from '~/server/service/pre-notify';
import loggerFactory from '~/utils/logger';
import { prisma } from '~/utils/prisma';

import type { IUserBadge } from '../../interfaces/badge';
import BadgeType from '../models/badge-type-model';
import UserBadge from '../models/user-badge-model';
import {
  BadgeAlreadyGrantedError,
  BadgeGrantManualCategoryMismatchError,
  BadgeTypeNotFoundError,
} from './badge-type-errors';
import type { IBadgeTypeHasId } from './badge-type-service';

const logger = loggerFactory('growi:features:user-badge:badge-grant-service');

/** `UserBadge` as returned from persistence, i.e. including its Mongo `_id`. */
export type IUserBadgeHasId = IUserBadge & { _id: Types.ObjectId };

/**
 * A `UserBadge` with its `badgeType` reference resolved to the full
 * `BadgeType` document, rather than left as a bare `ObjectId` (design.md,
 * user-badge apiv3 route's `GET /user-badges` response: `IUserBadgeHasId[]`
 * with "BadgeType 情報を populate"). Consumers (the user-badge apiv3 route,
 * and eventually `BadgeShelf`) need the badge's name/icon/level metadata
 * alongside the grant record itself without a second round-trip per badge.
 */
export type IUserBadgeWithBadgeType = Omit<IUserBadgeHasId, 'badgeType'> & {
  badgeType: IBadgeTypeHasId;
};

/**
 * Lists every badge granted to a single user, most recently granted first,
 * with each grant's `badgeType` populated to the full `BadgeType` document
 * (requirement 4.3: a user's page shows all granted badges with name/icon).
 * Read-only -- this is a query, not part of the "single write gateway" that
 * `recordBadgeGrant` is for automatic/manual grants.
 */
export const listUserBadges = async (
  targetUserId: string,
): Promise<IUserBadgeWithBadgeType[]> => {
  const userBadges = await UserBadge.find({ user: targetUserId })
    .sort({ grantedAt: -1 })
    .populate<{ badgeType: IBadgeTypeHasId }>('badgeType')
    .lean();

  return userBadges as unknown as IUserBadgeWithBadgeType[];
};

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
 * Recomputes and persists `User.badgeSummaryCached` for a single user, from
 * scratch, by reading every `UserBadge` the user currently holds and
 * grouping by `badgeType`, keeping only the highest `level` per distinct
 * series (requirement 4.4). A manual grant (`level: null`) is its own
 * single entry -- the unique (user, badgeType, level) index guarantees at
 * most one manual `UserBadge` per (user, badgeType), so it never competes
 * against another entry of the same series.
 *
 * Deliberately a recompute, not an incremental patch (design.md,
 * `research.md` "バッジのアバター併記表示にキャッシュフィールドを導入"): simpler and
 * correct by construction, and immune to drift between the cache and the
 * underlying `UserBadge` records.
 *
 * `iconKey`/`name` are resolved per-entry from the owning `BadgeType`: for
 * an automatic grant, from that specific level's own `IBadgeLevel` fields
 * (each level carries its own name/icon, not the series-level ones); for a
 * manual grant, from the `BadgeType`'s own top-level fields.
 */
async function updateBadgeSummaryCached(userId: string): Promise<void> {
  const User = mongoose.model<IUserHasId>('User');

  const userBadges = await UserBadge.find({ user: userId }).lean();

  if (userBadges.length === 0) {
    await User.findByIdAndUpdate(userId, {
      $set: { badgeSummaryCached: [] },
    });
    return;
  }

  const badgeTypeIds = [
    ...new Set(userBadges.map((userBadge) => userBadge.badgeType.toString())),
  ];
  const badgeTypes = await BadgeType.find({
    _id: { $in: badgeTypeIds },
  }).lean();
  const badgeTypeById = new Map(
    badgeTypes.map((badgeType) => [badgeType._id.toString(), badgeType]),
  );

  // Keep only the highest-level UserBadge per distinct badgeType.
  const highestByBadgeType = new Map<string, (typeof userBadges)[number]>();
  for (const userBadge of userBadges) {
    const key = userBadge.badgeType.toString();
    const current = highestByBadgeType.get(key);
    const currentLevel = current?.level ?? -1;
    const candidateLevel = userBadge.level ?? -1;
    if (current == null || candidateLevel > currentLevel) {
      highestByBadgeType.set(key, userBadge);
    }
  }

  const summary: IUserBadgeSummaryEntry[] = [];
  for (const userBadge of highestByBadgeType.values()) {
    const badgeType = badgeTypeById.get(userBadge.badgeType.toString());
    // Defensive: BadgeType is only ever soft-deleted, never purged, so this
    // should be unreachable in practice.
    if (badgeType == null) {
      continue;
    }

    if (userBadge.level == null) {
      summary.push({
        badgeType: userBadge.badgeType,
        iconKey: badgeType.iconKey,
        name: badgeType.name,
        level: null,
      });
      continue;
    }

    const levelDef = badgeType.levels.find(
      (level) => level.level === userBadge.level,
    );
    summary.push({
      badgeType: userBadge.badgeType,
      iconKey: levelDef?.iconKey ?? badgeType.iconKey,
      name: levelDef?.name ?? badgeType.name,
      level: userBadge.level,
    });
  }

  await User.findByIdAndUpdate(userId, {
    $set: { badgeSummaryCached: summary },
  });
}

/**
 * Creates the Activity record for a badge grant and delegates to the
 * existing `InAppNotificationService` pipeline, per design.md's Event
 * Contract (`ACTION_USER_BADGE_GRANT`).
 *
 * This runs OUTSIDE any Express request context on both call paths
 * (realtime automatic-grant listener, and manual grant from a future
 * apiv3 route not guaranteed to have gone through the `addActivity`
 * middleware at this point), so it cannot rely on `res.locals.activity` /
 * `pendingActivityContext`. Instead it uses
 * `crowi.activityService.createActivity`, the same request-context-free
 * creation path already used by `page-bulk-export-job-cron`'s
 * `notifyExportResult` for its own out-of-request notification (research.md
 * "Risks & Mitigations" — this was the open risk for this task).
 *
 * `contributor`/`user` is set to the GRANTED user (not the granter, if
 * any), since they are who must be notified. The default
 * `preNotifyService.generatePreNotify` resolves notification targets via
 * `Subscription`, a page-only concept that would resolve to nobody for a
 * UserBadge target; `getAdditionalTargetUsers` is used instead to supply
 * the granted user directly, mirroring `notifyExportResult`'s same pattern.
 *
 * `crowi` is a required parameter: this function is never reachable except
 * through `recordBadgeGrant`, which itself now requires `crowi` on every
 * call (tightened at task 5.2 -- see `recordBadgeGrant`'s doc comment). A
 * caller with no real activity/notification wiring on hand still passes an
 * explicit `Crowi` test double; `activityService` on that double may itself
 * be absent, which this function tolerates via the `crowi.activityService
 * == null` guard below.
 */
async function emitBadgeGrantActivity(
  userBadge: IUserBadgeHasId,
  userId: string,
  crowi: Crowi,
): Promise<void> {
  if (crowi.activityService == null) {
    return;
  }

  try {
    const activity = await crowi.activityService.createActivity({
      action: SupportedAction.ACTION_USER_BADGE_GRANT,
      targetModel: SupportedTargetModel.MODEL_USER_BADGE,
      target: userBadge,
      user: userId,
    });

    if (activity == null) {
      return;
    }

    const getAdditionalTargetUsers = async () => [userId];
    const preNotify = preNotifyService.generatePreNotify(
      activity,
      getAdditionalTargetUsers,
    );

    crowi.events.activity.emit('updated', activity, userBadge, preNotify);
  } catch (err) {
    logger.error('Failed to emit badge grant activity', err);
  }
}

/**
 * Single write gateway for recording a `UserBadge` grant (design.md,
 * "BadgeGrantService は自動/手動どちらの付与経路も一本化する単一の書き込み窓口"): creates
 * the `UserBadge`, then updates the granted user's `User.badgeSummaryCached`
 * (requirement 4.4), then emits the `ACTION_USER_BADGE_GRANT` Activity
 * (requirement 5.1). Both `evaluateAndGrantForUser` (automatic path) and
 * `grantManualBadge` (manual path) call this instead of creating `UserBadge`
 * documents themselves, so the "grant -> cache -> notify" sequence lives in
 * exactly one place.
 *
 * Duplicate-key handling stays with each caller (they react differently: the
 * automatic path treats a duplicate as a no-op, the manual path surfaces a
 * typed error) -- this function lets a duplicate-key error propagate as-is.
 *
 * `crowi` is required (tightened at task 5.2, the first real apiv3 caller of
 * this call chain -- see tasks.md Implementation Notes): a missing `crowi`
 * used to silently skip the Activity/notification step, which is a subtle,
 * hard-to-notice requirement-5.1 gap. Making it a compile-time requirement
 * forces every caller (including tests) to be explicit about the `Crowi`
 * instance they intend the grant to notify through.
 */
async function recordBadgeGrant(
  userId: string,
  badgeTypeId: Types.ObjectId,
  level: number | null,
  grantedBy: Types.ObjectId | string | null,
  note: string | null,
  crowi: Crowi,
): Promise<IUserBadgeHasId> {
  const created = await UserBadge.create({
    user: userId,
    badgeType: badgeTypeId,
    level,
    grantedAt: new Date(),
    grantedBy,
    note,
  });
  // `Document.toObject()` is generic (`toObject<T = ...>()`); the original
  // (pre-refactor) call sites got their `T` from a `return`-position
  // contextual type against the enclosing function's declared return type.
  // Assigning to an intermediate `const` loses that context unless the
  // variable itself carries an explicit annotation -- without one, `T`
  // silently falls back to `LeanDocument<any>` and the later use as
  // `IUserBadgeHasId` fails to typecheck.
  const userBadge: IUserBadgeHasId = created.toObject();

  await updateBadgeSummaryCached(userId);
  await emitBadgeGrantActivity(userBadge, userId, crowi);

  return userBadge;
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
  crowi: Crowi,
): Promise<IUserBadgeHasId | null> {
  try {
    return await recordBadgeGrant(
      userId,
      badgeTypeId,
      level,
      null,
      null,
      crowi,
    );
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
  scopedBadgeTypeId: string | undefined,
  crowi: Crowi,
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
        grantLevelIfNotAlreadyGranted(
          userId,
          badgeType._id,
          level.level,
          crowi,
        ),
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

export type GrantManualBadgeInput = {
  badgeTypeId: string;
  userId: string;
  note?: string;
};

/**
 * Grants a manual-category BadgeType to a single user (requirements 3.1,
 * 3.2, 3.5), recording the acting admin as `grantedBy` and the given `note`
 * (or `null` when omitted).
 *
 * Rejects, before writing anything, when:
 * - the `BadgeType` does not exist or is soft-deleted (`BadgeTypeNotFoundError`).
 *   A soft-deleted BadgeType must stop accepting new grants just like an
 *   automatic one does (requirement 1.5's "そのバッジ種類による新規付与を停止する"
 *   applies to manual BadgeTypes too, even though 1.5 predates this task).
 * - the `BadgeType.category` is `'automatic'` (`BadgeGrantManualCategoryMismatchError`,
 *   requirement 3.4) — automatic BadgeTypes are only ever granted by
 *   `evaluateAndGrantForUser`.
 *
 * A duplicate manual grant to the SAME user (same `(user, badgeType,
 * level: null)`) is surfaced as `BadgeAlreadyGrantedError` rather than the
 * raw Mongoose E11000 error or a silent no-op: unlike the automatic path
 * (which is re-evaluated repeatedly as a matter of course and must be
 * idempotent), a manual grant is a single explicit admin action, so the
 * admin should be told clearly that this exact grant already exists.
 * Granting the same manual BadgeType to a DIFFERENT user is unaffected,
 * since the unique index is scoped per-user (requirement 3.5).
 */
export const grantManualBadge = async (
  input: GrantManualBadgeInput,
  grantedBy: IUserHasId,
  crowi: Crowi,
): Promise<IUserBadgeHasId> => {
  const badgeType = await BadgeType.findOne({
    _id: input.badgeTypeId,
    isDeleted: false,
  });
  if (badgeType == null) {
    throw new BadgeTypeNotFoundError(
      `BadgeType not found: ${input.badgeTypeId}`,
    );
  }

  if (badgeType.category === 'automatic') {
    throw new BadgeGrantManualCategoryMismatchError(
      'Automatic BadgeTypes can only be granted by threshold evaluation, not manually.',
    );
  }

  try {
    return await recordBadgeGrant(
      input.userId,
      badgeType._id,
      null,
      grantedBy._id,
      input.note ?? null,
      crowi,
    );
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw new BadgeAlreadyGrantedError(
        `BadgeType ${input.badgeTypeId} is already granted to user ${input.userId}.`,
      );
    }
    throw err;
  }
};

/** Actions that count toward automatic badge evaluation (requirement 2.6). */
const AUTO_GRANT_TRIGGER_ACTIONS: ReadonlySet<string> = new Set([
  SupportedAction.ACTION_PAGE_CREATE,
  SupportedAction.ACTION_PAGE_UPDATE,
]);

/**
 * Shape actually carried by `crowi.events.activity`'s `'updated'` event, as
 * read by this listener. Deliberately narrower than (and NOT the same as)
 * `IActivity`/`ActivityDocument`, whose declared `user: Ref<IUser>` field is
 * NOT populated here: the settled row comes from
 * `settleActivityRecord` -> `prisma.activities.createByParameters`, which
 * creates the row via `context.create({ data })` without `include: { user:
 * true } }` (only `updateByParameters` does -- see
 * `apps/app/src/server/models/activity.ts`'s `ActivityWithUser` doc comment).
 * The raw Prisma row instead carries the acting user as the scalar `userId`
 * field (`schema.prisma`: `activities.userId @map("user")`), which is what
 * is actually present on the object at runtime -- confirmed by
 * `update-page.integ.ts`/`create-page.integ.ts` reading `rows[0].userId`
 * off the same settled row.
 */
type SettledActivityEventPayload = {
  action: string;
  userId?: string | null;
};

/**
 * Subscribes BadgeGrantService's own listener to `crowi.events.activity`'s
 * `'updated'` event, independently of `ActivityService`
 * (`apps/app/src/server/service/activity.ts`, which is NOT modified here --
 * research.md "Architecture Pattern Evaluation": adding a listener inside
 * `ActivityService.initActivityEventListeners` was rejected in favor of a
 * self-registering listener, mirroring how `InAppNotificationService`
 * already subscribes to the same event in its own constructor).
 *
 * Filters to `ACTION_PAGE_CREATE`/`ACTION_PAGE_UPDATE` only (requirement
 * 2.6) and, on a match, evaluates and grants for the acting user
 * (requirements 2.1, 2.2). Not wired into the app boot sequence here --
 * that is task 9.1's responsibility.
 */
/**
 * Returns the distinct set of userIds with at least one
 * ACTION_PAGE_CREATE/ACTION_PAGE_UPDATE activity -- i.e. every user who
 * could possibly qualify for an automatic badge (requirement 2.1's counted
 * actions). Deliberately queries `prisma.activities` with `distinct:
 * ['userId']` rather than iterating `User.find({})`: the latter would also
 * visit every user who has never edited a page (who can never qualify) and
 * scales with total user count instead of with actual contributors.
 */
async function findUserIdsWithEditActivity(): Promise<string[]> {
  const rows = await prisma.activities.findMany({
    where: {
      action: {
        in: [
          SupportedAction.ACTION_PAGE_CREATE,
          SupportedAction.ACTION_PAGE_UPDATE,
        ],
      },
    },
    distinct: ['userId'],
    select: { userId: true },
  });

  return rows
    .map((row) => row.userId)
    .filter((userId): userId is string => userId != null);
}

/**
 * Re-runs `evaluateAndGrantForUser`, scoped to a single BadgeType, for every
 * user who has ever recorded a CREATE/UPDATE activity (requirement 2.5,
 * design.md System Flows "resweep" note). This is what lets a user who
 * already met a threshold before the BadgeType (or this feature) existed
 * receive the badge once an admin creates/edits that BadgeType.
 *
 * This function owns only "who to evaluate" + "loop and call" -- the
 * threshold/level-crossing logic itself is entirely `evaluateAndGrantForUser`
 * (task 3.1), reused unchanged. Idempotency (safe to call repeatedly, safe to
 * race against the realtime path) is likewise inherited from that function's
 * own duplicate-key handling; this wrapper adds none of its own.
 *
 * Sequential, not parallelized/batched: per research.md's Risks &
 * Mitigations note, resweep may run long for a large user base, but a v1
 * fire-and-forget sequential loop is explicitly accepted, with a
 * cron-based/batched approach deferred as future work if it proves too slow
 * in practice.
 *
 * `crowi` is required and threaded through to every `evaluateAndGrantForUser`
 * call so that badges granted during a resweep also emit
 * `ACTION_USER_BADGE_GRANT` and reach the notification pipeline (requirement
 * 5.1) -- a resweep-triggered grant is a real grant like any other, so it
 * must not silently skip notification just because it came from a backfill
 * path rather than the realtime event listener. Tightened to required in
 * lockstep with `evaluateAndGrantForUser`/`grantManualBadge` at task 5.2, per
 * tasks.md's Implementation Notes.
 */
export const resweepBadgeType = async (
  badgeTypeId: string,
  crowi: Crowi,
): Promise<void> => {
  const userIds = await findUserIdsWithEditActivity();

  for (const userId of userIds) {
    try {
      await evaluateAndGrantForUser(userId, badgeTypeId, crowi);
    } catch (err) {
      logger.error(
        `Resweep evaluation failed for user ${userId}, badgeType ${badgeTypeId}`,
        err,
      );
    }
  }
};

export const initBadgeGrantEventListener = (crowi: Crowi): void => {
  crowi.events.activity.on(
    'updated',
    async (activity: SettledActivityEventPayload) => {
      if (
        activity == null ||
        !AUTO_GRANT_TRIGGER_ACTIONS.has(activity.action)
      ) {
        return;
      }
      if (activity.userId == null) {
        return;
      }

      try {
        await evaluateAndGrantForUser(activity.userId, undefined, crowi);
      } catch (err) {
        logger.error('Automatic badge evaluation failed', err);
      }
    },
  );
};
