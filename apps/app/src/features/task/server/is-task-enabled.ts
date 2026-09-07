import { configManager } from '~/server/service/config-manager';

/**
 * Feature gate for the standalone task feature (`app:taskEnabled`, env
 * `TASK_MODE`, default OFF). When false: the `/tasks` API 404s, the
 * `/_tasks` page 404s, and the sidebar entry is not rendered.
 *
 * Imports only `configManager`, so it is safe to pull into the boot-time
 * route graph.
 */
export const isTaskEnabled = (): boolean =>
  configManager.getConfig('app:taskEnabled');
