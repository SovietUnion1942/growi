import type { SWRResponse } from 'swr';
import useSWRImmutable from 'swr/immutable';

import { apiv3Get } from '~/client/util/apiv3-client';

/**
 * A single entry of the badge type catalog exposed by
 * `GET /badge-types/catalog` (server: `server/routes/badge-type.ts`, task
 * 10.3). Deliberately minimal -- see that route's doc comment for why only
 * `description` is included: `name`/`iconKey`/`level` are already carried
 * end-to-end by `User.badgeSummaryCached`, so `description` is the only
 * field a badge tooltip is actually missing.
 */
export interface IBadgeTypeCatalogEntry {
  _id: string;
  description: string;
}

type BadgeTypeCatalogResult = {
  badgeTypes: IBadgeTypeCatalogEntry[];
};

/**
 * SWR hook for the badge type tooltip catalog (requirement 4.5).
 *
 * Unlike `useSWRxBadgeTypeList` (`./badge-type.ts`), which calls the
 * admin-only `GET /badge-types` and is therefore only usable on the admin
 * badge management screen, this calls the non-admin-gated
 * `GET /badge-types/catalog` and is safe to call from any logged-in
 * viewer's session -- e.g. anyone viewing another user's profile page where
 * `UserPicture` renders badge tooltips.
 *
 * `useSWRImmutable`: badge type definitions (and their descriptions) are
 * admin-curated and change rarely, so the catalog is fetched once and
 * cached for the session rather than re-validated on every focus/reconnect
 * (design.md, Implementation Notes on `UserPicture(拡張)`: "クライアント側で
 * 一度取得済みのバッジ種類カタログ...から名前・説明を解決する").
 */
export const useSWRxBadgeTypeCatalog = (
  // `false` (the user-badge feature is off) suppresses the fetch — the
  // endpoint 404s in that state. Defaults true so existing callers are
  // unchanged.
  enabled = true,
): SWRResponse<IBadgeTypeCatalogEntry[], Error> => {
  return useSWRImmutable(enabled ? '/badge-types/catalog' : null, (endpoint) =>
    apiv3Get<BadgeTypeCatalogResult>(endpoint).then(
      (result) => result.data.badgeTypes,
    ),
  );
};
