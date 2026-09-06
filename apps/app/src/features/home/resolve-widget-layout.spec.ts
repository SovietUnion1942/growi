import type { ComponentType } from 'react';

import type {
  HomeWidgetPreferences,
  HomeWidgetsSiteConfig,
  WidgetDescriptor,
  WidgetKey,
} from './interfaces/home-widgets';
import { resolveEffectiveWidgetLayout } from './resolve-widget-layout';

// --- fixtures -------------------------------------------------------------

const Dummy: ComponentType = () => null;

// A full 7-key descriptor list so the pure function can be exercised against
// the whole widget set independently of how many widgets the real registry
// currently binds.
const DESCRIPTORS: readonly WidgetDescriptor[] = [
  {
    key: 'search',
    titleI18nKey: 't.search',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 10,
    fullWidth: true,
  },
  {
    key: 'recentUpdates',
    titleI18nKey: 't.recent',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 20,
    fullWidth: false,
  },
  {
    key: 'bookmarks',
    titleI18nKey: 't.bookmarks',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 30,
    fullWidth: false,
  },
  {
    key: 'wipPages',
    titleI18nKey: 't.wip',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 40,
    fullWidth: false,
  },
  {
    key: 'classroomPosts',
    titleI18nKey: 't.classroom',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 50,
    fullWidth: false,
  },
  {
    key: 'pinnedPages',
    titleI18nKey: 't.pinned',
    Component: Dummy,
    defaultVisible: false,
    defaultOrder: 60,
    fullWidth: false,
  },
  {
    key: 'homeFeed',
    titleI18nKey: 't.feed',
    Component: Dummy,
    defaultVisible: true,
    defaultOrder: 70,
    fullWidth: false,
  },
];

const keysOf = (views: { key: WidgetKey }[]): WidgetKey[] =>
  views.map((v) => v.key);

describe('resolveEffectiveWidgetLayout', () => {
  describe('descriptor defaults only (no site config, no user prefs)', () => {
    it('returns every default-visible key in ascending default order', () => {
      const result = resolveEffectiveWidgetLayout(DESCRIPTORS, null, null);
      expect(keysOf(result)).toEqual([
        'search',
        'recentUpdates',
        'bookmarks',
        'wipPages',
        'classroomPosts',
        'homeFeed',
      ]);
      // pinnedPages is defaultVisible:false -> excluded
      expect(keysOf(result)).not.toContain('pinnedPages');
    });

    it('carries Component and fullWidth through from the descriptor', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        undefined,
        undefined,
      );
      const search = result.find((v) => v.key === 'search');
      expect(search?.fullWidth).toBe(true);
      expect(search?.Component).toBe(Dummy);
    });
  });

  describe('precedence: userPrefs -> siteConfig -> descriptor default', () => {
    it('includes a key that site config hides but the user re-enables', () => {
      const siteConfig: HomeWidgetsSiteConfig = {
        bookmarks: { visible: false },
      };
      const userPrefs: HomeWidgetPreferences = { bookmarks: { visible: true } };
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        siteConfig,
        userPrefs,
      );
      expect(keysOf(result)).toContain('bookmarks');
    });

    it('hides a key that site config hides when the user has no preference for it', () => {
      const siteConfig: HomeWidgetsSiteConfig = {
        bookmarks: { visible: false },
      };
      const result = resolveEffectiveWidgetLayout(DESCRIPTORS, siteConfig, {
        search: { order: 1 },
      });
      expect(keysOf(result)).not.toContain('bookmarks');
    });

    it('shows a key that site config enables even though the descriptor default is hidden', () => {
      const siteConfig: HomeWidgetsSiteConfig = {
        pinnedPages: { visible: true },
      };
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        siteConfig,
        null,
      );
      expect(keysOf(result)).toContain('pinnedPages');
    });

    it('resolves order with user winning over site winning over default', () => {
      const siteConfig: HomeWidgetsSiteConfig = { homeFeed: { order: 5 } }; // ahead of search(10)
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        siteConfig,
        null,
      );
      expect(keysOf(result)[0]).toBe('homeFeed');

      const withUser = resolveEffectiveWidgetLayout(DESCRIPTORS, siteConfig, {
        search: { order: 1 },
      });
      expect(keysOf(withUser)[0]).toBe('search');
    });

    it('falls back per-field: user visible without user order still uses site/default order', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        { recentUpdates: { order: 100 } },
        { recentUpdates: { visible: true } },
      );
      // recentUpdates visible (user) but order 100 (site) -> pushed to the end
      expect(keysOf(result).at(-1)).toBe('recentUpdates');
    });
  });

  describe('malformed config is ignored, never throws', () => {
    const defaultVisibleKeys: WidgetKey[] = [
      'search',
      'recentUpdates',
      'bookmarks',
      'wipPages',
      'classroomPosts',
      'homeFeed',
    ];

    it.each([
      ['a string', 'broken json'],
      ['an array', [1, 2, 3]],
      ['a number', 42],
      ['a boolean', true],
    ])('falls back to descriptor defaults when siteConfig is %s', (_label, bad) => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        bad as unknown as HomeWidgetsSiteConfig,
        null,
      );
      expect(keysOf(result)).toEqual(defaultVisibleKeys);
    });

    it('ignores unknown keys in site config and user prefs', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        {
          somethingElse: { visible: true, order: -1 },
        } as unknown as HomeWidgetsSiteConfig,
        { alsoUnknown: { visible: true } } as unknown as HomeWidgetPreferences,
      );
      expect(keysOf(result)).toEqual(defaultVisibleKeys);
      expect(result.some((v) => (v.key as string) === 'somethingElse')).toBe(
        false,
      );
    });

    it('ignores wrong-typed visible/order values and uses the descriptor default', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        {
          bookmarks: { visible: 'yes', order: 'first' },
          pinnedPages: { visible: 'true' },
        } as unknown as HomeWidgetsSiteConfig,
        null,
      );
      // bookmarks: bad values ignored -> descriptor default (visible, order 30)
      expect(keysOf(result)).toEqual(defaultVisibleKeys);
      // pinnedPages: bad value ignored -> descriptor default (hidden)
      expect(keysOf(result)).not.toContain('pinnedPages');
    });

    it('ignores a non-object entry for a known key', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        { bookmarks: null, search: 'x' } as unknown as HomeWidgetsSiteConfig,
        null,
      );
      expect(keysOf(result)).toEqual(defaultVisibleKeys);
    });
  });

  describe('purity and determinism', () => {
    it('returns an equal result for equal input and does not mutate its arguments', () => {
      const siteConfig: HomeWidgetsSiteConfig = { homeFeed: { order: 5 } };
      const userPrefs: HomeWidgetPreferences = {
        bookmarks: { visible: false },
      };
      const siteSnapshot = JSON.stringify(siteConfig);
      const userSnapshot = JSON.stringify(userPrefs);

      const a = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        siteConfig,
        userPrefs,
      );
      const b = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        siteConfig,
        userPrefs,
      );

      expect(keysOf(a)).toEqual(keysOf(b));
      expect(JSON.stringify(siteConfig)).toBe(siteSnapshot);
      expect(JSON.stringify(userPrefs)).toBe(userSnapshot);
    });

    it('keeps descriptor order for keys that resolve to an equal order value', () => {
      const result = resolveEffectiveWidgetLayout(
        DESCRIPTORS,
        {
          search: { order: 1 },
          recentUpdates: { order: 1 },
          bookmarks: { order: 1 },
        },
        null,
      );
      expect(keysOf(result).slice(0, 3)).toEqual([
        'search',
        'recentUpdates',
        'bookmarks',
      ]);
    });
  });
});
