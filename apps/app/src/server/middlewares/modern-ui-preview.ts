import type { NextFunction, Request, Response } from 'express';

import {
  MODERN_UI_COOKIE,
  MODERN_UI_COOKIE_LEGACY,
  MODERN_UI_COOKIE_LITE,
  MODERN_UI_COOKIE_ON,
  THEME_COOKIE,
  THEME_COOKIE_RESET,
} from '~/interfaces/modern-ui-mode';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const COOKIE_OPTS = {
  path: '/',
  maxAge: ONE_YEAR_MS,
  sameSite: 'lax',
} as const;

const asString = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

/**
 * Per-browser UI preference query params, set on any page (must run after
 * cookieParser). All write a non-`httpOnly` cookie (so the /me picker can also
 * toggle them from JS) read back in `_document` / common-props.
 *
 *   ?ui=modern | legacy | lite | auto
 *                                - pin the UI tier (auto clears the cookie).
 *   ?grw-ui=modern | off         - back-compat alias for ?ui=modern / ?ui=auto
 *   ?grw-theme=<preset name>     - override the instance's preset color theme
 *   ?grw-theme=default           - clear that override
 *
 * An old / SPA-incapable User-Agent is pinned to legacy in `resolveUiTier`
 * regardless of the cookie, so `?ui=modern` on such a client is inert.
 */
export const modernUiPreview = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Mirror the write into `req.cookies` as well, so the tier resolution that
  // runs later in THIS same request (the lite-ui gate, `_document`) already
  // sees the intended value instead of only taking effect on the next load.
  const setUi = (value: string | undefined): void => {
    if (value == null) {
      res.clearCookie(MODERN_UI_COOKIE, { path: '/' });
      if (req.cookies != null) {
        delete req.cookies[MODERN_UI_COOKIE];
      }
    } else {
      res.cookie(MODERN_UI_COOKIE, value, COOKIE_OPTS);
      if (req.cookies != null) {
        req.cookies[MODERN_UI_COOKIE] = value;
      }
    }
  };

  const ui = asString(req.query.ui) ?? asString(req.query[MODERN_UI_COOKIE]);
  if (ui === MODERN_UI_COOKIE_ON) {
    setUi(MODERN_UI_COOKIE_ON);
  } else if (ui === MODERN_UI_COOKIE_LEGACY) {
    setUi(MODERN_UI_COOKIE_LEGACY);
  } else if (ui === MODERN_UI_COOKIE_LITE) {
    setUi(MODERN_UI_COOKIE_LITE);
  } else if (ui === 'off' || ui === 'auto') {
    setUi(undefined);
  }

  const theme = asString(req.query[THEME_COOKIE]);
  if (theme != null) {
    if (theme === THEME_COOKIE_RESET) {
      res.clearCookie(THEME_COOKIE, { path: '/' });
    } else {
      res.cookie(THEME_COOKIE, theme, COOKIE_OPTS);
    }
  }

  next();
};
