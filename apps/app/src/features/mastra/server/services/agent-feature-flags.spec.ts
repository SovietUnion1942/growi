import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfigManager } = vi.hoisted(() => ({
  mockConfigManager: { getConfig: vi.fn() },
}));

vi.mock('~/server/service/config-manager', () => ({
  configManager: mockConfigManager,
}));

import {
  getAgentFeatureFlags,
  isMessagesBotEnabled,
} from './agent-feature-flags';

const stub = (values: Record<string, unknown>) => {
  mockConfigManager.getConfig.mockImplementation(
    (key: string) => values[key] ?? false,
  );
};

describe('agent-feature-flags', () => {
  beforeEach(() => mockConfigManager.getConfig.mockReset());

  it('maps each config key to its flag', () => {
    stub({
      'ai:agentTools:pageEdit': true,
      'ai:agentTools:pageCreate': false,
      'ai:agentTools:webSearch': true,
      'ai:vision': false,
    });
    expect(getAgentFeatureFlags()).toEqual({
      pageEdit: true,
      pageCreate: false,
      webSearch: true,
      vision: false,
    });
  });

  it('is all-false when nothing is configured', () => {
    stub({});
    expect(getAgentFeatureFlags()).toEqual({
      pageEdit: false,
      pageCreate: false,
      webSearch: false,
      vision: false,
    });
  });

  it('isMessagesBotEnabled reads ai:messagesBot', () => {
    stub({ 'ai:messagesBot': true });
    expect(isMessagesBotEnabled()).toBe(true);
    stub({});
    expect(isMessagesBotEnabled()).toBe(false);
  });
});
