import { configManager } from '~/server/service/config-manager';

/**
 * Feature gate for the user-badge feature (`app:userBadgeEnabled`, env
 * `USER_BADGE`, default OFF). When false: the boot auto-grant listener is
 * skipped (see Crowi#setupBadgeGrantService), the `/badge-types` and
 * `/user-badges` apiv3 routes 404, the admin section is hidden and no badge
 * UI renders.
 *
 * Imports only `configManager` (no feature-heavy modules), so it is safe to
 * pull into the boot-time route graph.
 */
export const isUserBadgeEnabled = (): boolean =>
  configManager.getConfig('app:userBadgeEnabled');
