import { configManager } from '~/server/service/config-manager';

/**
 * Per-request snapshot of the chat agent's capability switches.
 *
 * Each flag is independent, defaults OFF (see config-definition), and is only
 * meaningful when `app:aiEnabled` is on. `growiAgent` reads this to decide
 * which tools to register and which system-prompt sections to include;
 * `post-message` / the Messages DM-bot path read `vision` to decide whether to
 * forward attached image parts to the model.
 *
 * This module imports only `configManager` (no `@mastra/*` / `@ai-sdk/*`), so
 * it is safe to import from both the boot-time Messages route and the
 * dynamically-loaded mastra graph.
 */
export type AgentFeatureFlags = {
  pageEdit: boolean;
  pageCreate: boolean;
  webSearch: boolean;
  vision: boolean;
};

export const getAgentFeatureFlags = (): AgentFeatureFlags => ({
  pageEdit: configManager.getConfig('ai:agentTools:pageEdit'),
  pageCreate: configManager.getConfig('ai:agentTools:pageCreate'),
  webSearch: configManager.getConfig('ai:agentTools:webSearch'),
  vision: configManager.getConfig('ai:vision'),
});

/** Whether the Messages DM bot may reply. Separate from AgentFeatureFlags
 *  because it is consumed by the Messages route, not the agent itself. */
export const isMessagesBotEnabled = (): boolean =>
  configManager.getConfig('ai:messagesBot');
