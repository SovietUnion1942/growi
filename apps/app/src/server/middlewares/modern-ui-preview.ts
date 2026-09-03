import type { NextFunction, Request, Response } from 'express';

import {
  MODERN_UI_COOKIE,
  MODERN_UI_COOKIE_ON,
} from '~/interfaces/modern-ui-mode';

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Lets a viewer flip their own browser into (or out of) the modern UI skin
 * while `MODERN_UI_MODE=optin`, by visiting any page with `?grw-ui=modern`
 * (or `?grw-ui=off` to clear it). The cookie is read back in `_document`
 * (`isModernUiActive`). Not `httpOnly` so it can also be toggled from JS /
 * devtools. No effect when the instance mode is `off` or `on`.
 */
export const modernUiPreview = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const q = req.query[MODERN_UI_COOKIE];

  if (q === MODERN_UI_COOKIE_ON) {
    res.cookie(MODERN_UI_COOKIE, MODERN_UI_COOKIE_ON, {
      path: '/',
      maxAge: ONE_YEAR_MS,
      sameSite: 'lax',
    });
  } else if (q === 'off') {
    res.clearCookie(MODERN_UI_COOKIE, { path: '/' });
  }

  next();
};
