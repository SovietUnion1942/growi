import type { ModernUiMode } from './modern-ui-mode';

/**
 * The three UI rendering tiers (see project_system-requirements-ui):
 *   glass  - the modernized "Aero-Fluent Glass" skin (recommended)
 *   legacy - the classic Bootstrap chrome; SAME React SPA, only the CSS differs
 *   lite   - a no-JS static render for SPA-incapable clients (NOT built yet -
 *            this slice resolves `lite` but consumers currently treat it like
 *            `legacy`; the dedicated render path is a later slice)
 */
export const UI_TIERS = ['glass', 'legacy', 'lite'] as const;
export type UiTier = (typeof UI_TIERS)[number];

/** Values the `grw-ui` cookie / `?ui=` param can carry. `auto` clears it. */
export type UiPreference = 'modern' | 'legacy' | 'lite' | 'auto';

export type UaInfo = {
  /** Browser family we could identify, or 'unknown'. */
  browser:
    | 'chrome'
    | 'firefox'
    | 'safari'
    | 'ie'
    | 'legacy-opera'
    | 'text'
    | 'unknown';
  /** Major version of that browser, or 0 when unknown. */
  browserMajor: number;
  /** OS key for the requirements table: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other'. */
  os: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other';
  /** Windows NT version ('6.1' = 7), iOS/Android major as string, or ''. */
  osVersion: string;
  /** Can this client run the GROWI React SPA at all? false -> lite. */
  spaCapable: boolean;
  /** SPA runs, but too old for the modern skin -> forced legacy, opt-in ignored. */
  modernCapable: boolean;
  /** Below the documented minimum -> the system-requirements banner shows. */
  belowMin: boolean;
};

const int = (v: string | undefined): number =>
  v != null ? Number.parseInt(v, 10) : 0;

/**
 * Focused UA sniff - just enough for the tier decision + the requirements
 * table highlight. Not a general UA parser (ua-parser-js is deliberately not a
 * dependency). Version cut-offs follow project_system-requirements-ui.
 */
export const parseUa = (ua: string | undefined): UaInfo => {
  const base: UaInfo = {
    browser: 'unknown',
    browserMajor: 0,
    os: 'other',
    osVersion: '',
    spaCapable: true,
    modernCapable: true,
    belowMin: false,
  };
  if (ua == null || ua.length === 0) {
    // Can't tell -> fall back to legacy (safe), no banner.
    return { ...base, modernCapable: false };
  }

  // --- OS ---
  const ntMatch = ua.match(/Windows NT (\d+\.\d+)/);
  const iosMatch = ua.match(/(?:iPhone|iPad|iPod)(?:.*?) OS (\d+)[._]/);
  const androidMatch = ua.match(/Android (\d+)/);
  if (ntMatch != null) {
    base.os = 'windows';
    base.osVersion = ntMatch[1];
  } else if (iosMatch != null || /(iPhone|iPad|iPod)/.test(ua)) {
    base.os = 'ios';
    base.osVersion = iosMatch != null ? iosMatch[1] : '';
  } else if (androidMatch != null) {
    base.os = 'android';
    base.osVersion = androidMatch[1];
  } else if (/Macintosh|Mac OS X/.test(ua)) {
    base.os = 'macos';
  } else if (/Linux|X11|CrOS/.test(ua)) {
    base.os = 'linux';
  }

  // --- SPA-incapable clients ---
  if (/\b(w3m|Lynx|Links|ELinks|NetSurf|Dillo)\b/i.test(ua)) {
    return {
      ...base,
      browser: 'text',
      spaCapable: false,
      modernCapable: false,
      belowMin: true,
    };
  }
  if (/Trident\/|MSIE /.test(ua)) {
    return {
      ...base,
      browser: 'ie',
      spaCapable: false,
      modernCapable: false,
      belowMin: true,
    };
  }
  if (/Opera\/9\.\d+.*Presto/.test(ua)) {
    return {
      ...base,
      browser: 'legacy-opera',
      spaCapable: false,
      modernCapable: false,
      belowMin: true,
    };
  }

  // --- Browser family + major ---
  const chrome =
    ua.match(/Chrom(?:e|ium)\/(\d+)/) ?? ua.match(/Edg(?:iOS|A)?\/(\d+)/);
  const firefox = ua.match(/(?:Firefox|FxiOS)\/(\d+)/);
  const safariVer = ua.match(/Version\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari/);

  if (chrome != null) {
    base.browser = 'chrome';
    base.browserMajor = int(chrome[1]);
  } else if (firefox != null) {
    base.browser = 'firefox';
    base.browserMajor = int(firefox[1]);
  } else if (safariVer != null || (/Safari/.test(ua) && base.os === 'ios')) {
    base.browser = 'safari';
    base.browserMajor =
      safariVer != null ? int(safariVer[1]) : int(base.osVersion);
  }

  // --- tier flags ---
  const { browser, browserMajor, os, osVersion } = base;
  const nt = os === 'windows' ? Number.parseFloat(osVersion) : NaN;
  const androidV = os === 'android' ? int(osVersion) : NaN;
  const iosV = os === 'ios' ? int(osVersion) : NaN;

  base.spaCapable = !(
    (browser === 'chrome' && browserMajor > 0 && browserMajor < 80) ||
    (browser === 'firefox' && browserMajor > 0 && browserMajor < 78) ||
    (browser === 'safari' && browserMajor > 0 && browserMajor < 14) ||
    (!Number.isNaN(nt) && nt <= 5.9) ||
    (!Number.isNaN(androidV) && androidV <= 4) ||
    (!Number.isNaN(iosV) && iosV <= 9)
  );

  base.modernCapable =
    base.spaCapable &&
    !(
      (browser === 'chrome' && browserMajor > 0 && browserMajor < 115) ||
      (browser === 'firefox' && browserMajor > 0 && browserMajor < 115) ||
      (browser === 'safari' && browserMajor > 0 && browserMajor < 15) ||
      (!Number.isNaN(nt) && nt === 6.1) ||
      (!Number.isNaN(nt) && nt >= 6.2 && nt <= 6.3) ||
      (!Number.isNaN(androidV) && androidV < 10) ||
      (!Number.isNaN(iosV) && iosV < 15)
    );

  base.belowMin =
    !base.spaCapable ||
    (browser === 'chrome' && browserMajor > 0 && browserMajor < 109) ||
    (browser === 'firefox' && browserMajor > 0 && browserMajor < 115) ||
    (!Number.isNaN(nt) && nt < 6.1) ||
    (!Number.isNaN(androidV) && androidV < 10) ||
    (!Number.isNaN(iosV) && iosV < 15);

  return base;
};

/**
 * The effective tier for a request. An explicit `legacy`/`lite` preference
 * always wins; `modern` wins only when the client can run it and the instance
 * offers it. Old clients are silently pinned to legacy regardless of opt-in.
 */
export const resolveUiTier = (args: {
  mode: ModernUiMode;
  cookie: string | undefined;
  ua: string | undefined;
}): UiTier => {
  const { mode, cookie } = args;
  const info = parseUa(args.ua);

  if (!info.spaCapable) {
    return 'lite';
  }
  if (cookie === 'legacy') {
    return 'legacy';
  }
  if (!info.modernCapable || mode === 'off') {
    return 'legacy';
  }
  if (mode === 'on') {
    return 'glass';
  }
  // optin
  return cookie === 'modern' ? 'glass' : 'legacy';
};
