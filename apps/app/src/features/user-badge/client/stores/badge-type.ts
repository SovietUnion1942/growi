import type { SWRResponse } from 'swr';
import useSWRImmutable from 'swr/immutable';

import { apiv3Get } from '~/client/util/apiv3-client';

import type { IBadgeType } from '../../interfaces/badge';

/**
 * `IBadgeType` as returned to the client, i.e. with Mongo `_id`/refs
 * serialized to their JSON (string) form rather than the server-side
 * `Types.ObjectId` used by `IBadgeTypeHasId` in
 * `server/services/badge-type-service.ts`. `iconAttachment` is likewise
 * serialized to a plain string id (not a `Types.ObjectId`), which
 * `BadgeTypeTable`/`BadgeShelf` use directly to build an `/attachment/:id`
 * image URL (task 13.7, requirement 6.5) -- the same URL shape
 * `Attachment.filePathProxied` produces server-side
 * (`apps/app/src/server/models/attachment.ts`), reconstructed client-side
 * rather than fetched, since the id alone is enough to derive it.
 */
export interface IBadgeTypeHasId
  extends Omit<IBadgeType, 'createdBy' | 'iconAttachment'> {
  _id: string;
  createdBy: string;
  iconAttachment?: string | null;
}

type BadgeTypeListResult = {
  badgeTypes: IBadgeTypeHasId[];
};

/**
 * SWR hook for the full badge type list (admin management screen).
 * Requirement 1.1: the admin badge management screen must be able to
 * actually retrieve the list from `GET /badge-types`.
 */
export const useSWRxBadgeTypeList = (): SWRResponse<
  IBadgeTypeHasId[],
  Error
> => {
  return useSWRImmutable('/badge-types', (endpoint) =>
    apiv3Get<BadgeTypeListResult>(endpoint).then(
      (result) => result.data.badgeTypes,
    ),
  );
};

/**
 * Shape returned by `useSWRxBadgeType`. This is deliberately not
 * `SWRResponse<IBadgeTypeHasId, Error>`: because the single item is derived
 * client-side from `useSWRxBadgeTypeList`'s own data (see below), there is
 * no independent SWR key/fetcher pair of its own. `data`/`error`/
 * `isLoading`/`isValidating` mirror the list hook's state (with `data`
 * narrowed to the single derived item); `mutate` is forwarded verbatim from
 * the list hook, so it still mutates the *list's* cache entry — the only
 * one that exists — keeping both hooks in sync.
 */
export type SWRxBadgeTypeResponse = {
  data: IBadgeTypeHasId | undefined;
  error: SWRResponse<IBadgeTypeHasId[], Error>['error'];
  isLoading: SWRResponse<IBadgeTypeHasId[], Error>['isLoading'];
  isValidating: SWRResponse<IBadgeTypeHasId[], Error>['isValidating'];
  mutate: SWRResponse<IBadgeTypeHasId[], Error>['mutate'];
};

/**
 * SWR hook for a single badge type by id.
 *
 * There is no `GET /badge-types/:id` endpoint on the server (the apiv3
 * route only exposes list/create/update/delete — see
 * `server/routes/badge-type.ts`), so this does NOT issue its own request.
 * Instead it calls `useSWRxBadgeTypeList()` internally and derives the
 * single item from that hook's `data` via `.find()`. This means
 * `useSWRxBadgeTypeList` and `useSWRxBadgeType` always share exactly ONE
 * SWR cache entry (key `'/badge-types'`) and ONE underlying fetch — calling
 * both hooks together in the same render tree does not double-fetch, and
 * mutating the list's cache key (e.g. after a PUT) keeps both in sync.
 *
 * When `badgeTypeId` is `null`, no lookup is attempted and `data` is
 * `undefined` (the list hook is still invoked so callers relying on the
 * list being warmed up continue to work, but no "not found" error is
 * synthesized for the `null` case). When `badgeTypeId` does not match any
 * item in the fetched list, `data` resolves to `undefined` rather than
 * throwing — the caller is expected to treat "no match" the same as "still
 * loading" or "not present" and render accordingly.
 */
export const useSWRxBadgeType = (
  badgeTypeId: string | null,
): SWRxBadgeTypeResponse => {
  const listSWR = useSWRxBadgeTypeList();

  const badgeType =
    badgeTypeId != null
      ? listSWR.data?.find((bt) => bt._id === badgeTypeId)
      : undefined;

  return {
    data: badgeType,
    error: listSWR.error,
    isLoading: listSWR.isLoading,
    isValidating: listSWR.isValidating,
    mutate: listSWR.mutate,
  };
};
