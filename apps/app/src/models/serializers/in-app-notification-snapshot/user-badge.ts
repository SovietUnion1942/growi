import mongoose from 'mongoose';

import type { IUserBadge } from '~/features/user-badge/interfaces/badge';
import type { BadgeTypeDocument } from '~/features/user-badge/server/models/badge-type-model';

export interface IUserBadgeSnapshot {
  badgeName: string;
  level: number | null;
}

/**
 * Resolves the display name for a granted badge (requirement 5.1: the
 * notification must include the granted badge's name).
 *
 * `userBadge.badgeType` on the target passed through from
 * `emitBadgeGrantActivity` (badge-grant-service.ts) is a bare `ObjectId`
 * reference, not a populated document, so the name is fetched here rather
 * than assumed available -- mirroring `page-bulk-export-job.ts`'s own
 * serializer, which likewise fetches its target's referenced `Page`
 * document when not already populated.
 *
 * For an automatic grant (`level` is a number), the name comes from that
 * specific level's own `IBadgeLevel.name` (each level carries its own
 * name, distinct from the series-level name), matching
 * `updateBadgeSummaryCached`'s same per-entry resolution in
 * badge-grant-service.ts. For a manual grant (`level: null`), the name is
 * the `BadgeType`'s own top-level `name`.
 */
export const stringifySnapshot = async (
  userBadge: IUserBadge,
): Promise<string | undefined> => {
  const BadgeType = mongoose.model<BadgeTypeDocument>('BadgeType');
  const badgeType = await BadgeType.findById(userBadge.badgeType);

  if (badgeType == null) {
    return undefined;
  }

  const badgeName =
    userBadge.level != null
      ? (badgeType.levels.find((level) => level.level === userBadge.level)
          ?.name ?? badgeType.name)
      : badgeType.name;

  return JSON.stringify({
    badgeName,
    level: userBadge.level,
  });
};

export const parseSnapshot = (snapshot: string): IUserBadgeSnapshot => {
  return JSON.parse(snapshot);
};
