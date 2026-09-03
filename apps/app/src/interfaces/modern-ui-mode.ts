/**
 * Operator-facing switch for the modernized ("Aero-Fluent Glass") UI skin.
 *
 * Set via the `MODERN_UI_MODE` env var (or the `app:modernUiMode` config key).
 * The modern skin is a self-contained stylesheet scoped under
 * `:root[data-grw-ui="modern"]`; when the attribute is absent the UI renders
 * byte-for-byte identically to the classic Bootstrap chrome.
 *
 *   off    - classic UI only. The `data-grw-ui` attribute is never emitted.
 *   optin  - classic UI by default; each user may switch their own view to the
 *            modern skin from personal settings. (The per-user plumbing ships in
 *            a later phase; for now `optin` behaves like `off` instance-wide.)
 *   on     - the modern skin is applied instance-wide. `_document` stamps
 *            `data-grw-ui="modern"` on the initial HTML so there is no flash of
 *            the classic UI on load.
 */
export const MODERN_UI_MODES = ['off', 'optin', 'on'] as const;

export type ModernUiMode = (typeof MODERN_UI_MODES)[number];

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

/**
 * Whether the modern skin should be applied to every view of the instance
 * (i.e. `_document` should stamp `data-grw-ui="modern"`). `optin` is
 * deliberately excluded here - that mode resolves per-user, not per-instance.
 */
export const isModernUiEnabledForInstance = (mode: ModernUiMode): boolean =>
  mode === 'on';
