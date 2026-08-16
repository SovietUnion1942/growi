import type { FC } from 'react';
import { useTranslation } from 'next-i18next';

import type { IBadgeTypeHasId } from '../stores/badge-type';
import { type IUserBadgeHasId, useSWRxUserBadges } from '../stores/user-badge';

type Props = {
  userId: string;
};

type BadgeGroup = {
  badgeType: IBadgeTypeHasId;
  entries: IUserBadgeHasId[];
};

/**
 * Groups a flat list of granted badges by `badgeType._id`. Unlike
 * `User.badgeSummaryCached` (used by `UserPicture`, which keeps only the
 * highest level per series -- requirement 4.4's avatar-adjacent summary),
 * this preserves every distinct level a user holds within each series, in
 * ascending level order. Manual badges (`level: null`) simply form their own
 * single-entry group.
 */
const groupByBadgeType = (userBadges: IUserBadgeHasId[]): BadgeGroup[] => {
  const groups = new Map<string, BadgeGroup>();

  for (const userBadge of userBadges) {
    const key = userBadge.badgeType._id;
    const existing = groups.get(key);
    if (existing != null) {
      existing.entries.push(userBadge);
    } else {
      groups.set(key, { badgeType: userBadge.badgeType, entries: [userBadge] });
    }
  }

  for (const group of groups.values()) {
    group.entries.sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
  }

  return Array.from(groups.values());
};

type EntryDisplay = {
  name: string;
  iconKey: string;
  // Per-level image icons are out of scope (design.md/task 13.1): only
  // `category: 'manual'` BadgeTypes may have `iconType: 'image'`, so this is
  // always resolved from `badgeType` itself, regardless of `level`.
  iconType: IBadgeTypeHasId['iconType'];
  iconUrl?: string;
};

/**
 * Resolves the display name/icon for a single grant. For an automatic
 * badge (`level` set), the level's own name/icon is used when found in
 * `badgeType.levels`; for a manual badge (`level: null`), the badge type's
 * own name/icon is used. `iconType`/`iconUrl` are always resolved from the
 * `badgeType` itself: manual badges have no `levelDef`, so the existing
 * `?? badgeType.iconKey` fallback already routes through the type-level
 * fields naturally -- no extra resolution logic is needed here.
 */
const resolveEntryDisplay = (userBadge: IUserBadgeHasId): EntryDisplay => {
  const { badgeType, level } = userBadge;
  // Same `/attachment/:id` URL shape `Attachment.filePathProxied` produces
  // server-side (`apps/app/src/server/models/attachment.ts`), reconstructed
  // client-side from the passed-through `iconAttachment` id.
  const iconUrl =
    badgeType.iconType === 'image' && badgeType.iconAttachment != null
      ? `/attachment/${badgeType.iconAttachment}`
      : undefined;

  if (level != null) {
    const levelDef = badgeType.levels.find((l) => l.level === level);
    return {
      name: levelDef?.name ?? badgeType.name,
      iconKey: levelDef?.iconKey ?? badgeType.iconKey,
      iconType: badgeType.iconType,
      iconUrl,
    };
  }
  return {
    name: badgeType.name,
    iconKey: badgeType.iconKey,
    iconType: badgeType.iconType,
    iconUrl,
  };
};

// Same heuristic as `packages/ui/src/components/UserPicture.tsx`'s
// `isEmojiIconKey`, reused here for visual consistency between the
// avatar-adjacent badge display and this full-detail list.
const isEmojiIconKey = (iconKey: string): boolean => !/^[ -~]+$/.test(iconKey);

export const BadgeShelf: FC<Props> = ({ userId }: Props) => {
  const { t } = useTranslation();
  const { data: userBadges, isLoading } = useSWRxUserBadges(userId);

  if (isLoading && userBadges == null) {
    return (
      <div data-testid="grw-badge-shelf-loading">
        {t('user_home_page.badges_loading')}
      </div>
    );
  }

  if (userBadges == null || userBadges.length === 0) {
    return (
      <div data-testid="grw-badge-shelf-empty">
        {t('user_home_page.no_badges')}
      </div>
    );
  }

  const groups = groupByBadgeType(userBadges);

  return (
    <div data-testid="grw-badge-shelf">
      {groups.map((group) => (
        <div
          key={group.badgeType._id}
          data-testid="grw-badge-shelf-group"
          className="grw-badge-shelf-group"
        >
          {group.entries.map((userBadge) => {
            const { name, iconKey, iconType, iconUrl } =
              resolveEntryDisplay(userBadge);
            return (
              <div
                key={userBadge._id}
                data-testid="grw-badge-shelf-entry"
                className="grw-badge-shelf-entry d-flex align-items-center"
              >
                <span className="grw-badge-shelf-entry-icon">
                  {iconType === 'image' ? (
                    // biome-ignore lint/performance/noImgElement: plain profile-page thumbnail, not a Next.js page image.
                    <img src={iconUrl} alt="" />
                  ) : isEmojiIconKey(iconKey) ? (
                    iconKey
                  ) : (
                    <span className="material-symbols-outlined">{iconKey}</span>
                  )}
                </span>
                <span className="grw-badge-shelf-entry-name">{name}</span>
                <span className="grw-badge-shelf-entry-date">
                  {new Date(userBadge.grantedAt).toLocaleDateString()}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
