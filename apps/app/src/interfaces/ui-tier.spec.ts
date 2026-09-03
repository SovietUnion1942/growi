import { parseUa, resolveUiTier } from './ui-tier';

// Representative real-ish UA strings.
const UA = {
  chromeNew:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  chromeLegacyBand:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36',
  chromeWin7:
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
  chromeAncient:
    'Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.112 Safari/537.36',
  firefoxNew:
    'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
  firefoxOld:
    'Mozilla/5.0 (Windows NT 6.1; rv:60.0) Gecko/20100101 Firefox/60.0',
  safariNew:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  iosOld:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 12_5_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  androidOld:
    'Mozilla/5.0 (Linux; Android 8.1.0; SM-J710F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.157 Mobile Safari/537.36',
  ie11: 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
  w3m: 'w3m/0.5.3+git20230121',
} as const;

describe('parseUa', () => {
  it('identifies a modern Chrome on Windows 10', () => {
    const i = parseUa(UA.chromeNew);
    expect(i.browser).toBe('chrome');
    expect(i.browserMajor).toBe(131);
    expect(i.os).toBe('windows');
    expect(i.spaCapable).toBe(true);
    expect(i.modernCapable).toBe(true);
    expect(i.belowMin).toBe(false);
  });

  it('flags a legacy-band Chrome (SPA ok, modern not) ', () => {
    const i = parseUa(UA.chromeLegacyBand);
    expect(i.spaCapable).toBe(true);
    expect(i.modernCapable).toBe(false);
  });

  it('treats Windows 7 + a current-enough Chrome as the supported minimum (legacy, no banner)', () => {
    const i = parseUa(UA.chromeWin7);
    expect(i.os).toBe('windows');
    expect(i.osVersion).toBe('6.1');
    expect(i.spaCapable).toBe(true);
    expect(i.modernCapable).toBe(false);
    expect(i.belowMin).toBe(false);
  });

  it('flags Windows 7 with an outdated Chrome as below minimum', () => {
    const i = parseUa(
      'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.0.0 Safari/537.36',
    );
    expect(i.belowMin).toBe(true);
  });

  it('flags an ancient Chrome as SPA-incapable', () => {
    expect(parseUa(UA.chromeAncient).spaCapable).toBe(false);
  });

  it.each([
    ['old Firefox', UA.firefoxOld],
    ['old iOS', UA.iosOld],
    ['old Android', UA.androidOld],
  ])('%s is below min and not modern-capable', (_label, ua) => {
    const i = parseUa(ua);
    expect(i.modernCapable).toBe(false);
    expect(i.belowMin).toBe(true);
  });

  it.each([
    ['IE11', UA.ie11, 'ie'],
    ['w3m', UA.w3m, 'text'],
  ])('%s is SPA-incapable', (_label, ua, browser) => {
    const i = parseUa(ua);
    expect(i.browser).toBe(browser);
    expect(i.spaCapable).toBe(false);
  });

  it('modern browsers pass', () => {
    expect(parseUa(UA.firefoxNew).modernCapable).toBe(true);
    expect(parseUa(UA.safariNew).modernCapable).toBe(true);
  });

  it('falls back safely for a missing / unknown UA', () => {
    const i = parseUa(undefined);
    expect(i.modernCapable).toBe(false);
    expect(i.spaCapable).toBe(true);
  });
});

describe('resolveUiTier', () => {
  const ua = UA.chromeNew;

  it('optin + no cookie -> legacy (current default)', () => {
    expect(resolveUiTier({ mode: 'optin', cookie: undefined, ua })).toBe(
      'legacy',
    );
  });
  it('optin + grw-ui=modern -> glass', () => {
    expect(resolveUiTier({ mode: 'optin', cookie: 'modern', ua })).toBe(
      'glass',
    );
  });
  it('an explicit legacy cookie always wins', () => {
    expect(resolveUiTier({ mode: 'on', cookie: 'legacy', ua })).toBe('legacy');
  });
  it('mode on -> glass for a capable client', () => {
    expect(resolveUiTier({ mode: 'on', cookie: undefined, ua })).toBe('glass');
  });
  it('mode off -> legacy even with the modern cookie', () => {
    expect(resolveUiTier({ mode: 'off', cookie: 'modern', ua })).toBe('legacy');
  });
  it('old browser -> legacy, modern cookie ignored', () => {
    expect(
      resolveUiTier({ mode: 'on', cookie: 'modern', ua: UA.chromeWin7 }),
    ).toBe('legacy');
  });
  it('SPA-incapable -> lite', () => {
    expect(resolveUiTier({ mode: 'on', cookie: 'modern', ua: UA.ie11 })).toBe(
      'lite',
    );
  });
});
