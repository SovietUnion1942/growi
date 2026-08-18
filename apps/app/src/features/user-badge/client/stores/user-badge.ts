import type { SWRResponse } from 'swr';
import useSWR from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';

import type { IBadgeTypeHasId } from './badge-type';

/**
 * `IUserBadgeWithBadgeType` (server/services/badge-grant-service.ts) as
 * returned to the client: Mongo `_id`/refs serialized to their JSON (string)
 * form, `grantedAt` serialized to an ISO string, and `badgeType` populated
 * with the client-facing `IBadgeTypeHasId` (string ids) rather than the
 * server-side document.
 */
export interface IUserBadgeHasId {
  _id: string;
  user: string;
  badgeType: IBadgeTypeHasId;
  level: number | null;
  grantedAt: string;
  grantedBy: string | null;
  note: string | null;
}

type UserBadgeListResult = {
  userBadges: IUserBadgeHasId[];
};

/**
 * SWR hook for a single user's granted badge list, with `BadgeType`
 * information populated (requirement 4.3: the user page shows every granted
 * badge with its name/icon/grant date).
 *
 * Uses plain `useSWR` (not `useSWRImmutable`, unlike the admin
 * `useSWRxBadgeTypeList`/`useSWRxBadgeType` in `./badge-type.ts`): badges can
 * be granted to a user at any time while their profile is being viewed, so
 * this data is not treated as immutable (design.md, Client/UI section).
 *
 * The SWR key embeds `targetUserId` so that different users' badge lists
 * never collide in the shared SWR cache. When `userId` is `null`, the key is
 * `null` and SWR skips fetching entirely.
 */
export const useSWRxUserBadges = (
  userId: string | null,
): SWRResponse<IUserBadgeHasId[], Error> => {
  const key = userId != null ? `/user-badges?targetUserId=${userId}` : null;

  return useSWR(key, (endpoint) =>
    apiv3Get<UserBadgeListResult>(endpoint).then(
      (response) => response.data.userBadges,
    ),
  );
};
