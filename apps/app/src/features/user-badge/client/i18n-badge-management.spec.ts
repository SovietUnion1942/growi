/**
 * i18n-badge-management.spec.ts
 *
 * Verifies the baseline (structural) i18n keys for the badge-management
 * feature exist, with non-empty string values, and are present with an
 * identical key set across all 5 supported locales.
 *
 * Baseline keys (task 1.6):
 *   - admin.json:   badge_management.{badge_management, category_automatic, category_manual}
 *   - commons.json: badge.{badge, badges}
 *
 * Per-screen/form copy (icons, thresholds, tooltips, buttons, etc.) is
 * added by the owning UI tasks (7.x, 8, 10.1, 10.3) as part of their own
 * implementation; the baseline-key checks above only assert that the
 * task-1.6 minimum subset exists (not the full current key set).
 *
 * The key-set-parity checks below intentionally do NOT hardcode the full
 * expected key list: they derive it from one locale (the first entry in
 * `LOCALES`) at run time and assert every other locale matches it. This
 * keeps the test meaningful as later tasks add more `badge_management.*`/
 * `badge.*` keys — parity across locales is what matters, not a frozen
 * snapshot of which keys exist. (A fixed-list version of this test broke
 * when tasks 7.1/7.2 added ~20 keys without touching the test.)
 *
 * Requirements: 1.1, 4.5
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALES = ['en_US', 'ja_JP', 'ko_KR', 'fr_FR', 'zh_CN'] as const;

const LOCALE_BASE = join(__dirname, '../../../../public/static/locales');

function loadLocale(locale: string, file: string): Record<string, unknown> {
  const filePath = join(LOCALE_BASE, locale, file);
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function getNestedValue(
  obj: Record<string, unknown>,
  dotPath: string,
): unknown {
  return dotPath.split('.').reduce<unknown>((acc, key) => {
    if (acc == null || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
}

// Recursively collects dot-joined leaf key paths from a (possibly nested)
// translation namespace, e.g. { manual_grant: { note: '...' } } -> ['manual_grant.note'].
// Used for key-set-parity comparisons so nested namespaces (like
// `badge_management.manual_grant.*`) are covered, not just top-level keys.
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Record<string, unknown>, path);
    }
    return [path];
  });
}

const adminLocales = Object.fromEntries(
  LOCALES.map((locale) => [locale, loadLocale(locale, 'admin.json')]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

const commonsLocales = Object.fromEntries(
  LOCALES.map((locale) => [locale, loadLocale(locale, 'commons.json')]),
) as Record<(typeof LOCALES)[number], Record<string, unknown>>;

const ADMIN_BADGE_MANAGEMENT_KEYS = [
  'badge_management.badge_management',
  'badge_management.category_automatic',
  'badge_management.category_manual',
];

const COMMONS_BADGE_KEYS = [
  'badge.badge',
  'badge.badges',
  // Added at task 10.3: `UserPicture`'s badge tooltip placeholder shown
  // while the badge type catalog (`useSWRxBadgeTypeCatalog`) is still
  // loading. See `apps/app/src/features/user-badge/client/hooks/
  // use-user-picture-badges.ts`.
  'badge.description_loading',
];

describe('badge-management baseline i18n keys', () => {
  describe.each(LOCALES)('admin.json (%s)', (locale) => {
    for (const key of ADMIN_BADGE_MANAGEMENT_KEYS) {
      it(`has non-empty string for key: ${key}`, () => {
        const value = getNestedValue(adminLocales[locale], key);
        expect(
          value,
          `key "${key}" not found or not a string in ${locale}/admin.json`,
        ).toBeTypeOf('string');
        expect(
          (value as string).trim().length,
          `key "${key}" is an empty string in ${locale}/admin.json`,
        ).toBeGreaterThan(0);
      });
    }
  });

  describe.each(LOCALES)('commons.json (%s)', (locale) => {
    for (const key of COMMONS_BADGE_KEYS) {
      it(`has non-empty string for key: ${key}`, () => {
        const value = getNestedValue(commonsLocales[locale], key);
        expect(
          value,
          `key "${key}" not found or not a string in ${locale}/commons.json`,
        ).toBeTypeOf('string');
        expect(
          (value as string).trim().length,
          `key "${key}" is an empty string in ${locale}/commons.json`,
        ).toBeGreaterThan(0);
      });
    }
  });

  describe('key-set parity across locales', () => {
    it('admin.json "badge_management" has the identical key set in all 5 locales', () => {
      const [baseLocale, ...restLocales] = LOCALES;
      const baseKeys = flattenKeys(
        (adminLocales[baseLocale].badge_management ?? {}) as Record<
          string,
          unknown
        >,
      ).sort();

      // Sanity check: the namespace must exist and contain at least the
      // task-1.6 baseline keys — this guards against the baseline itself
      // silently going empty (e.g. a locale file swapped for `{}`).
      expect(baseKeys.length).toBeGreaterThanOrEqual(
        ADMIN_BADGE_MANAGEMENT_KEYS.length,
      );
      for (const key of ADMIN_BADGE_MANAGEMENT_KEYS) {
        expect(baseKeys).toContain(key.split('.')[1]);
      }

      for (const locale of restLocales) {
        const keys = flattenKeys(
          (adminLocales[locale].badge_management ?? {}) as Record<
            string,
            unknown
          >,
        ).sort();
        expect(
          keys,
          `admin.json badge_management keys mismatch in ${locale}`,
        ).toEqual(baseKeys);
      }
    });

    it('commons.json "badge" has the identical key set in all 5 locales', () => {
      const [baseLocale, ...restLocales] = LOCALES;
      const baseKeys = flattenKeys(
        (commonsLocales[baseLocale].badge ?? {}) as Record<string, unknown>,
      ).sort();

      expect(baseKeys.length).toBeGreaterThanOrEqual(COMMONS_BADGE_KEYS.length);
      for (const key of COMMONS_BADGE_KEYS) {
        expect(baseKeys).toContain(key.split('.')[1]);
      }

      for (const locale of restLocales) {
        const keys = flattenKeys(
          (commonsLocales[locale].badge ?? {}) as Record<string, unknown>,
        ).sort();
        expect(keys, `commons.json badge keys mismatch in ${locale}`).toEqual(
          baseKeys,
        );
      }
    });
  });
});
