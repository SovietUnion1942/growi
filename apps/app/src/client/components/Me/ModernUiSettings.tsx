import { type JSX, useCallback, useEffect, useId, useState } from 'react';
import { useAtomValue } from 'jotai';
import Cookies from 'js-cookie';
import { useTranslation } from 'react-i18next';

import {
  MODERN_UI_COOKIE,
  MODERN_UI_COOKIE_ON,
} from '~/interfaces/modern-ui-mode';
import { modernUiModeAtom } from '~/states/server-configurations';

/**
 * Per-browser opt-in for the modernized ("Aero-Fluent Glass") UI skin. Only
 * shown while the instance is in `optin` mode (`on` applies it to everyone;
 * `off` hides the whole thing). Toggling sets / clears the same `grw-ui`
 * cookie the `?grw-ui=modern` query param does, then reloads so `_document`
 * re-renders with the right `data-grw-ui` attribute.
 */
export const ModernUiSettings = (): JSX.Element | null => {
  const { t } = useTranslation();
  const mode = useAtomValue(modernUiModeAtom);
  const switchId = useId();

  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(Cookies.get(MODERN_UI_COOKIE) === MODERN_UI_COOKIE_ON);
  }, []);

  const toggle = useCallback(() => {
    if (enabled) {
      Cookies.remove(MODERN_UI_COOKIE, { path: '/' });
    } else {
      Cookies.set(MODERN_UI_COOKIE, MODERN_UI_COOKIE_ON, {
        path: '/',
        expires: 365,
      });
    }
    window.location.reload();
  }, [enabled]);

  if (mode !== 'optin') {
    return null;
  }

  return (
    <div>
      <h2 className="border-bottom pb-2 mb-4 fs-4">
        {t('modern_ui_settings.settings')}
      </h2>

      <div className="row justify-content-center">
        <div className="col-md-6">
          <div className="form-check form-switch">
            <input
              id={switchId}
              className="form-check-input"
              type="checkbox"
              checked={enabled}
              onChange={toggle}
            />
            <label className="form-label form-check-label" htmlFor={switchId}>
              {t('modern_ui_settings.use_modern_ui')}
            </label>
          </div>
          <p className="form-text text-muted small">
            {t('modern_ui_settings.description')}
          </p>
        </div>
      </div>
    </div>
  );
};
