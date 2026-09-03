import type { NextFunction, Request, Response } from 'express';

import {
  MODERN_UI_COOKIE,
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

/**
 * Per-browser UI preference query params, set on any page:
 *
 *   ?grw-ui=modern | off       - opt into / out of the modern UI skin
 *                                (only meaningful while MODERN_UI_MODE=optin)
 *   ?grw-theme=<preset name>   - override the instance's preset color theme
 *   ?grw-theme=default         - clear the override
 *
 * Both write a non-`httpOnly` cookie (so the /me picker can also toggle them
 * from JS) read back in `_document` / common-props. Unknown `grw-theme` values
 * are validated there (fall back to the instance default). Must run after
 * cookieParser.
 */
export const modernUiPreview = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const ui = req.query[MODERN_UI_COOKIE];
  if (ui === MODERN_UI_COOKIE_ON) {
    res.cookie(MODERN_UI_COOKIE, MODERN_UI_COOKIE_ON, COOKIE_OPTS);
  } else if (ui === 'off') {
    res.clearCookie(MODERN_UI_COOKIE, { path: '/' });
  }

  const theme = req.query[THEME_COOKIE];
  if (typeof theme === 'string' && theme.length > 0) {
    if (theme === THEME_COOKIE_RESET) {
      res.clearCookie(THEME_COOKIE, { path: '/' });
    } else {
      res.cookie(THEME_COOKIE, theme, COOKIE_OPTS);
    }
  }

  next();
};
