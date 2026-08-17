import type { SWRResponse } from 'swr';
import useSWR, { mutate } from 'swr';

import { apiv3Delete, apiv3Get } from '~/client/util/apiv3-client';

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
  // `revokedAt: null`/absent = an active (non-revoked) record; only
  // manual-category records can ever have these set (design.md, requirement
  // 7.3/7.7). Optional (rather than required `string | null`) so existing
  // fixtures/callers built before this field existed (e.g.
  // `BadgeShelf.spec.tsx`, which only ever renders active badges) do not
  // need to be touched by this task -- task 16.5's UI is expected to treat
  // "absent" the same as "null" (active).
  revokedAt?: string | null;
  revokedBy?: string | null;
}

type UserBadgeListResult = {
  userBadges: IUserBadgeHasId[];
};

export interface UseSWRxUserBadgesOptions {
  /**
   * When `true`, includes revoked (manual-category) records in the response
   * (requirement 7.7). Only honored server-side for admin callers -- see
   * `server/routes/user-badge.ts`'s `GET /` handler; a non-admin caller
   * passing this is silently ignored there, so this option is safe to set
   * unconditionally from `GrantedManualBadgeList` (design.md).
   */
  includeRevoked?: boolean;
}

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
 * The SWR key embeds `targetUserId` (and, when requested, `includeRevoked`)
 * so that different users' badge lists, and the active-only vs.
 * active-and-revoked variants for the *same* user, never collide in the
 * shared SWR cache -- each combination is its own independent cache entry
 * rather than sharing one key (unlike `useSWRxBadgeType`/
 * `useSWRxBadgeTypeList` in `./badge-type.ts`, which deliberately share a
 * single key because they represent the same underlying resource; here the
 * two variants are genuinely different server responses, e.g.
 * `BadgeShelf.tsx` must never see revoked badges even if
 * `GrantedManualBadgeList` has already warmed the `includeRevoked: true`
 * cache entry for the same user). `revokeUserBadge`'s cache invalidation
 * below intentionally targets both variants' keys together on revoke.
 *
 * When `userId` is `null`, the key is `null` and SWR skips fetching
 * entirely.
 */
export const useSWRxUserBadges = (
  userId: string | null,
  options?: UseSWRxUserBadgesOptions,
): SWRResponse<IUserBadgeHasId[], Error> => {
  const includeRevoked = options?.includeRevoked === true;
  const key =
    userId != null
      ? `/user-badges?targetUserId=${userId}${includeRevoked ? '&includeRevoked=true' : ''}`
      : null;

  return useSWR(key, (endpoint) =>
    apiv3Get<UserBadgeListResult>(endpoint).then(
      (response) => response.data.userBadges,
    ),
  );
};

type RevokeUserBadgeResult = {
  userBadge: IUserBadgeHasId;
};

/**
 * Matches every `useSWRxUserBadges(targetUserId, ...)` cache key for the
 * given user -- both the active-only key and the `includeRevoked: true`
 * key -- without accidentally matching a *different* user whose id happens
 * to share the same string prefix (e.g. `targetUserId=user-1` must not
 * match `targetUserId=user-12`).
 */
const buildUserBadgesKeyMatcher =
  (targetUserId: string) =>
  (key: unknown): boolean =>
    key === `/user-badges?targetUserId=${targetUserId}` ||
    key === `/user-badges?targetUserId=${targetUserId}&includeRevoked=true`;

/**
 * Revokes a manually-granted `UserBadge` (requirement 7.1) by calling
 * `DELETE /user-badges/:id`, then revalidates every `useSWRxUserBadges`
 * cache entry for `targetUserId` (both the active-only and
 * `includeRevoked: true` variants) via SWR's global `mutate`, mirroring the
 * `mutatePageTree`/`keyMatcherForPageTree` pattern in
 * `~/stores/page-listing`.
 *
 * This is a plain async function rather than a hook, so it can be invoked
 * from an event handler (e.g. `GrantedManualBadgeList`'s revoke button,
 * task 16.5) after a confirmation dialog, without needing to be the same
 * component instance that rendered `useSWRxUserBadges`. On failure, the
 * error is propagated (not swallowed) and `mutate` is not called, so the
 * caller can surface it (e.g. a toast) without a stale-looking cache.
 */
export const revokeUserBadge = async (
  userBadgeId: string,
  targetUserId: string,
): Promise<IUserBadgeHasId> => {
  const response = await apiv3Delete<RevokeUserBadgeResult>(
    `/user-badges/${userBadgeId}`,
  );

  await mutate(buildUserBadgesKeyMatcher(targetUserId));

  return response.data.userBadge;
};
