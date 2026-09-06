import type { RawConfigData } from '@growi/core/dist/interfaces';

import type {
  HomeWidgetsSiteConfig,
  PinnedPageEntry,
} from '~/features/home/interfaces/home-widgets';

import type { ConfigKey, ConfigValues } from './config-definition';
import { CONFIG_DEFINITIONS, CONFIG_KEYS } from './config-definition';
import { ConfigLoader } from './config-loader';

vi.mock('../../models/config', () => ({
  Config: { find: vi.fn() },
}));

describe('config-definition home-widgets site-common keys (task 1.2)', () => {
  describe('CONFIG_KEYS array', () => {
    it.each([
      'customize:homeWidgets',
      'customize:homePinnedPages',
      'customize:homeClassroomPathPrefix',
    ] as const)('contains %s', (key) => {
      expect(CONFIG_KEYS).toContain(key);
    });
  });

  describe('CONFIG_DEFINITIONS defaults', () => {
    it('customize:homeWidgets defaults to an empty map', () => {
      expect(CONFIG_DEFINITIONS['customize:homeWidgets'].defaultValue).toEqual(
        {},
      );
    });

    it('customize:homePinnedPages defaults to an empty array', () => {
      expect(
        CONFIG_DEFINITIONS['customize:homePinnedPages'].defaultValue,
      ).toEqual([]);
    });

    it('customize:homeClassroomPathPrefix defaults to undefined (unset)', () => {
      expect(
        CONFIG_DEFINITIONS['customize:homeClassroomPathPrefix'].defaultValue,
      ).toBeUndefined();
    });
  });

  describe('admin-screen only (no env-var fallback)', () => {
    it.each([
      'customize:homeWidgets',
      'customize:homePinnedPages',
      'customize:homeClassroomPathPrefix',
    ] as const)('%s has no envVarName', (key) => {
      expect(CONFIG_DEFINITIONS[key].envVarName).toBeUndefined();
    });
  });

  // Round-trips the 3 keys through config management: with nothing stored and
  // no env var set, reading them back must yield the code-level defaults.
  describe('default resolution through ConfigLoader.loadFromEnv', () => {
    it('resolves the three keys to {} / [] / undefined', async () => {
      const config: RawConfigData<ConfigKey, ConfigValues> =
        await new ConfigLoader().loadFromEnv();

      expect(config['customize:homeWidgets'].value).toEqual({});
      expect(config['customize:homePinnedPages'].value).toEqual([]);
      expect(config['customize:homeClassroomPathPrefix'].value).toBeUndefined();
    });
  });

  // Type-level: the generic params from task 1.1's interfaces file flow through.
  it('exposes the task 1.1 types on ConfigValues', () => {
    const widgets: ConfigValues['customize:homeWidgets'] =
      {} satisfies HomeWidgetsSiteConfig;
    const pinned: ConfigValues['customize:homePinnedPages'] =
      [] satisfies PinnedPageEntry[];
    const prefix: ConfigValues['customize:homeClassroomPathPrefix'] = undefined;
    expect([widgets, pinned, prefix]).toStrictEqual([{}, [], undefined]);
  });
});
