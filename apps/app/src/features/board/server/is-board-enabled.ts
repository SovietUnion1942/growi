import { configManager } from '~/server/service/config-manager';

/**
 * Feature gate for the Miro-like board feature (`app:boardEnabled`, env
 * `BOARD_MODE`, default OFF). When false: the `/board/*` pages 404, the
 * `:board` directive renders nothing, and the board Yjs websocket namespace
 * is not registered.
 *
 * Imports only `configManager`, so it is safe to pull into the boot-time
 * route graph.
 */
export const isBoardEnabled = (): boolean =>
  configManager.getConfig('app:boardEnabled');
