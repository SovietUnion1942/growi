/**
 * home-notice-hint-i18n.spec.ts
 *
 * Regression guard for task 3.4 remediation: `home.notice_hint` used to tell
 * admins to create/edit a page at `/home-notice`, but the home page now
 * sources its notice from the `customize:homeNotice` config field (admin
 * Customize screen) — editing `/home-notice` has zero effect (requirement
 * 7.3). The hint must never point admins back at that dead page path.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LOCALE_BASE = join(__dirname, '../../../../../public/static/locales');

function loadTranslation(locale: string): Record<string, unknown> {
  const filePath = join(LOCALE_BASE, locale, 'translation.json');
  const raw = readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

const enTranslation = loadTranslation('en_US');
const jaTranslation = loadTranslation('ja_JP');

function getNoticeHint(translation: Record<string, unknown>): string {
  const home = translation.home as Record<string, unknown> | undefined;
  const value = home?.notice_hint;
  expect(value).toBeTypeOf('string');
  return value as string;
}

describe('home.notice_hint i18n string', () => {
  it.each([
    ['en_US', enTranslation],
    ['ja_JP', jaTranslation],
  ] as const)('does not reference the retired /home-notice page (%s)', (_locale, translation) => {
    const hint = getNoticeHint(translation);
    expect(hint).not.toContain('/home-notice');
    expect(hint).not.toContain('{{path}}');
  });

  it('en_US hint points admins at the Customize screen / Home Notice field', () => {
    const hint = getNoticeHint(enTranslation);
    expect(hint.toLowerCase()).toContain('customize');
    expect(hint.toLowerCase()).toContain('home notice');
  });
});
