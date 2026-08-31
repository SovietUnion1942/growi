import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockConfigManager } = vi.hoisted(() => ({
  mockConfigManager: { getConfig: vi.fn() },
}));

vi.mock('./config-manager', () => ({
  configManager: mockConfigManager,
}));

import { getEffectiveRegistrationWhitelist } from './registration-whitelist';

type Key =
  | 'security:registrationWhitelist'
  | 'security:additionalRegistrationWhitelist';

const stubConfig = (values: Partial<Record<Key, unknown>>) => {
  mockConfigManager.getConfig.mockImplementation(
    (key: Key) => values[key] ?? undefined,
  );
};

describe('getEffectiveRegistrationWhitelist', () => {
  beforeEach(() => {
    mockConfigManager.getConfig.mockReset();
  });

  it('returns [] when neither source is set', () => {
    stubConfig({});
    expect(getEffectiveRegistrationWhitelist()).toEqual([]);
  });

  it('returns the admin list alone when no env value is set', () => {
    stubConfig({ 'security:registrationWhitelist': ['@growi.org'] });
    expect(getEffectiveRegistrationWhitelist()).toEqual(['@growi.org']);
  });

  it('parses the comma-separated env value alone', () => {
    stubConfig({
      'security:additionalRegistrationWhitelist': '@a.com, @b.ac.jp',
    });
    expect(getEffectiveRegistrationWhitelist()).toEqual(['@a.com', '@b.ac.jp']);
  });

  it('merges both sources and de-duplicates', () => {
    stubConfig({
      'security:registrationWhitelist': ['@growi.org', '@a.com'],
      'security:additionalRegistrationWhitelist': '@a.com,@b.ac.jp',
    });
    expect(getEffectiveRegistrationWhitelist()).toEqual([
      '@growi.org',
      '@a.com',
      '@b.ac.jp',
    ]);
  });

  it('normalizes a legacy bare-domain entry into exact + wildcard forms', () => {
    stubConfig({ 'security:additionalRegistrationWhitelist': 'example.com' });
    expect(getEffectiveRegistrationWhitelist()).toEqual([
      '@example.com',
      '@*.example.com',
    ]);
  });

  it('tolerates a non-array admin value', () => {
    stubConfig({
      'security:registrationWhitelist': null,
      'security:additionalRegistrationWhitelist': '@a.com',
    });
    expect(getEffectiveRegistrationWhitelist()).toEqual(['@a.com']);
  });
});
