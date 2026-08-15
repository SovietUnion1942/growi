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
 * intentionally out of scope here — it is added by the owning UI tasks
 * (7.x, 8, 10.1, 10.3) as part of their own implementation.
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
      const baseKeys = Object.keys(
        (adminLocales[baseLocale].badge_management ?? {}) as object,
      ).sort();
      expect(baseKeys).toEqual(
        ADMIN_BADGE_MANAGEMENT_KEYS.map((k) => k.split('.')[1]).sort(),
      );

      for (const locale of restLocales) {
        const keys = Object.keys(
          (adminLocales[locale].badge_management ?? {}) as object,
        ).sort();
        expect(
          keys,
          `admin.json badge_management keys mismatch in ${locale}`,
        ).toEqual(baseKeys);
      }
    });

    it('commons.json "badge" has the identical key set in all 5 locales', () => {
      const [baseLocale, ...restLocales] = LOCALES;
      const baseKeys = Object.keys(
        (commonsLocales[baseLocale].badge ?? {}) as object,
      ).sort();
      expect(baseKeys).toEqual(
        COMMONS_BADGE_KEYS.map((k) => k.split('.')[1]).sort(),
      );

      for (const locale of restLocales) {
        const keys = Object.keys(
          (commonsLocales[locale].badge ?? {}) as object,
        ).sort();
        expect(keys, `commons.json badge keys mismatch in ${locale}`).toEqual(
          baseKeys,
        );
      }
    });
  });
});
