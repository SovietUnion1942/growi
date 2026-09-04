/**
 * Operator-facing switch for the modernized ("Aero-Fluent Glass") UI skin.
 *
 * Set via the `MODERN_UI_MODE` env var (or the `app:modernUiMode` config key).
 * The modern skin is a self-contained stylesheet scoped under
 * `:root[data-grw-ui="modern"]`; when the attribute is absent the UI renders
 * byte-for-byte identically to the classic Bootstrap chrome.
 *
 *   off    - classic UI only. The `data-grw-ui` attribute is never emitted.
 *   optin  - classic UI by default; a viewer opts their own browser in by
 *            visiting any page with `?grw-ui=modern` (which sets the
 *            {@link MODERN_UI_COOKIE} cookie; `?grw-ui=off` clears it).
 *   on     - the modern skin is applied to every view. `_document` stamps
 *            `data-grw-ui="modern"` on the initial HTML so there is no flash
 *            of the classic UI on load.
 */
export const MODERN_UI_MODES = ['off', 'optin', 'on'] as const;

export type ModernUiMode = (typeof MODERN_UI_MODES)[number];

/** Cookie a viewer sets (via `?grw-ui=modern`) to opt their own browser into
 *  the modern skin while the instance mode is `optin`. */
export const MODERN_UI_COOKIE = 'grw-ui';
export const MODERN_UI_COOKIE_ON = 'modern';
/** Pin this browser to the classic chrome even where the modern skin is on. */
export const MODERN_UI_COOKIE_LEGACY = 'legacy';
/** Pin this browser to the no-JS lite render (see features/lite-ui). */
export const MODERN_UI_COOKIE_LITE = 'lite';

/**
 * Cookie a viewer sets (via `?grw-theme=<name>` or the /me picker) to override
 * the instance's preset color theme for their own browser. Validated
 * server-side against the preset-themes manifest
 * (`customizeService.resolvePresetThemeAsset`); an unknown value falls back to
 * the instance default. Cleared with `?grw-theme=default`.
 */
export const THEME_COOKIE = 'grw-theme';
export const THEME_COOKIE_RESET = 'default';

/** Narrowing type guard for values coming from env / the config store. */
export const isModernUiMode = (value: unknown): value is ModernUiMode =>
  typeof value === 'string' &&
  (MODERN_UI_MODES as readonly string[]).includes(value);

/**
 * Coerce an untrusted value (raw env string, stale DB config, `undefined`)
 * into a valid {@link ModernUiMode}. Anything unrecognised falls back to
 * `off` - the safe default for a purely cosmetic, opt-in feature.
 */
export const normalizeModernUiMode = (value: unknown): ModernUiMode =>
  isModernUiMode(value) ? value : 'off';

// The mode x cookie x User-Agent decision lives in ~/interfaces/ui-tier
// (`resolveUiTier`) so it can also account for old / SPA-incapable clients.
