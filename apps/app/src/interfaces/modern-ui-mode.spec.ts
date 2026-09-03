import {
  isModernUiActive,
  isModernUiMode,
  MODERN_UI_COOKIE,
  MODERN_UI_COOKIE_ON,
  MODERN_UI_MODES,
  normalizeModernUiMode,
  THEME_COOKIE,
  THEME_COOKIE_RESET,
} from './modern-ui-mode';

describe('modern-ui-mode', () => {
  describe('isModernUiMode', () => {
    it.each(MODERN_UI_MODES)('accepts the valid mode "%s"', (mode) => {
      expect(isModernUiMode(mode)).toBe(true);
    });

    it.each([
      undefined,
      null,
      '',
      'On',
      'modern',
      'enabled',
      42,
      {},
    ])('rejects the invalid value %p', (value) => {
      expect(isModernUiMode(value)).toBe(false);
    });
  });

  describe('normalizeModernUiMode', () => {
    it('passes a valid mode through', () => {
      expect(normalizeModernUiMode('optin')).toBe('optin');
    });

    it.each([
      undefined,
      null,
      '',
      'nope',
      'ON',
    ])('falls back to "off" for %p', (value) => {
      expect(normalizeModernUiMode(value)).toBe('off');
    });
  });

  describe('isModernUiActive', () => {
    it('is always on when the mode is "on"', () => {
      expect(isModernUiActive('on', undefined)).toBe(true);
      expect(isModernUiActive('on', 'modern')).toBe(true);
      expect(isModernUiActive('on', 'anything')).toBe(true);
    });

    it('is never on when the mode is "off"', () => {
      expect(isModernUiActive('off', undefined)).toBe(false);
      expect(isModernUiActive('off', 'modern')).toBe(false);
    });

    it('follows the cookie when the mode is "optin"', () => {
      expect(isModernUiActive('optin', 'modern')).toBe(true);
      expect(isModernUiActive('optin', undefined)).toBe(false);
      expect(isModernUiActive('optin', 'off')).toBe(false);
      expect(isModernUiActive('optin', '')).toBe(false);
    });
  });

  describe('cookie names', () => {
    it('are the stable strings the middleware and _document share', () => {
      expect(MODERN_UI_COOKIE).toBe('grw-ui');
      expect(MODERN_UI_COOKIE_ON).toBe('modern');
      expect(THEME_COOKIE).toBe('grw-theme');
      expect(THEME_COOKIE_RESET).toBe('default');
    });
  });
});
