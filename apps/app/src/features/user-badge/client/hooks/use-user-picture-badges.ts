import { useMemo } from 'react';
import type { UserPictureBadge } from '@growi/ui/dist/components';
import { useTranslation } from 'next-i18next';

import { useSWRxBadgeTypeCatalog } from '../stores/badge-type-catalog';

/**
 * The shape `UserPicture`'s `badges` prop is ultimately sourced from on the
 * server: `User.badgeSummaryCached` (`IUserBadgeSummaryEntry`,
 * `packages/core`), serialized for the client with `badgeType` kept as a
 * string id. This hook's INPUT type, not `UserPictureBadge` itself --
 * `UserPictureBadge` (packages/ui) deliberately has no `badgeType` id field
 * (a `packages/ui` display-only type must not carry a raw domain
 * reference), which is exactly why the id -> description lookup has to
 * happen out here in `apps/app`, not inside `UserPicture`.
 */
export type UserPictureBadgeSource = {
  badgeType: string;
  iconKey: string;
  name: string;
  level: number | null;
};

/**
 * Resolves a user's badge summary into `UserPicture`'s `badges` prop shape,
 * enriched with `description` looked up from the badge type catalog
 * (requirement 4.5, design.md's Implementation Notes on `UserPicture(拡張)`).
 *
 * This is the "resolve from a client-side catalog fetched once" mechanism
 * task 10.3 is scoped to: it does NOT itself wire any of `UserPicture`'s
 * call sites to real badge data (no task in this spec threads
 * `User.badgeSummaryCached` to the client yet) -- callers that already have
 * a `UserPictureBadgeSource[]` in hand (e.g. once that wiring exists) use
 * this hook to get an enriched, ready-to-render `UserPictureBadge[]`.
 *
 * While the catalog is still loading, `description` is filled with a
 * translated placeholder rather than left `undefined`, so the tooltip does
 * not silently drop the description line for the (typically brief) window
 * before the catalog resolves -- callers that render immediately on mount
 * still get a description-shaped tooltip instead of a flash of
 * name-only content.
 */
export const useUserPictureBadges = (
  badgeSummary: UserPictureBadgeSource[] | undefined,
): UserPictureBadge[] => {
  const { t } = useTranslation();
  const { data: catalog, isLoading } = useSWRxBadgeTypeCatalog();

  return useMemo(() => {
    if (badgeSummary == null || badgeSummary.length === 0) {
      return [];
    }

    const descriptionByBadgeTypeId = new Map(
      (catalog ?? []).map((entry) => [entry._id, entry.description]),
    );

    return badgeSummary.map(({ badgeType, iconKey, name, level }) => {
      const description = descriptionByBadgeTypeId.get(badgeType);
      return {
        iconKey,
        name,
        level,
        ...(description != null
          ? { description }
          : isLoading
            ? { description: t('badge.description_loading') }
            : {}),
      };
    });
  }, [badgeSummary, catalog, isLoading, t]);
};
