import {
  isModernUiEnabledForInstance,
  isModernUiMode,
  MODERN_UI_MODES,
  normalizeModernUiMode,
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

  describe('isModernUiEnabledForInstance', () => {
    it('is true only for "on"', () => {
      expect(isModernUiEnabledForInstance('on')).toBe(true);
      expect(isModernUiEnabledForInstance('optin')).toBe(false);
      expect(isModernUiEnabledForInstance('off')).toBe(false);
    });
  });
});
