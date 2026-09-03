import {
  type JSX,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { GrowiThemeSchemeType } from '@growi/core';
import { PresetThemesMetadatas } from '@growi/preset-themes';
import { useAtomValue } from 'jotai';
import Cookies from 'js-cookie';
import { useTranslation } from 'react-i18next';

import {
  MODERN_UI_COOKIE,
  MODERN_UI_COOKIE_ON,
  THEME_COOKIE,
} from '~/interfaces/modern-ui-mode';
import { modernUiModeAtom } from '~/states/server-configurations';

import { ThemeColorBox } from '../Admin/Customize/ThemeColorBox';

const COOKIE_OPTS = { path: '/', expires: 365 } as const;

/**
 * Per-browser UI preferences: the preset color theme (a swatch grid mirroring
 * the admin picker) and, while `MODERN_UI_MODE=optin`, the modern UI skin
 * toggle. Both are cookie-backed (`grw-theme` / `grw-ui`) so they only affect
 * this browser; a change reloads the page so `_document` re-renders with the
 * right `<link>` / `data-grw-ui`. Hidden entirely when `MODERN_UI_MODE=off`.
 */
export const ThemeSettings = (): JSX.Element | null => {
  const { t } = useTranslation();
  const mode = useAtomValue(modernUiModeAtom);
  const modernSwitchId = useId();

  const [themeCookie, setThemeCookie] = useState<string | undefined>(undefined);
  const [modernEnabled, setModernEnabled] = useState(false);
  useEffect(() => {
    setThemeCookie(Cookies.get(THEME_COOKIE));
    setModernEnabled(Cookies.get(MODERN_UI_COOKIE) === MODERN_UI_COOKIE_ON);
  }, []);

  const { bothModeThemes, oneModeThemes } = useMemo(
    () => ({
      bothModeThemes: PresetThemesMetadatas.filter(
        (m) => m.schemeType === GrowiThemeSchemeType.BOTH,
      ),
      oneModeThemes: PresetThemesMetadatas.filter(
        (m) => m.schemeType !== GrowiThemeSchemeType.BOTH,
      ),
    }),
    [],
  );

  const selectTheme = useCallback((name: string) => {
    Cookies.set(THEME_COOKIE, name, COOKIE_OPTS);
    window.location.reload();
  }, []);

  const resetTheme = useCallback(() => {
    Cookies.remove(THEME_COOKIE, { path: '/' });
    window.location.reload();
  }, []);

  const toggleModern = useCallback(() => {
    if (modernEnabled) {
      Cookies.remove(MODERN_UI_COOKIE, { path: '/' });
    } else {
      Cookies.set(MODERN_UI_COOKIE, MODERN_UI_COOKIE_ON, COOKIE_OPTS);
    }
    window.location.reload();
  }, [modernEnabled]);

  if (mode === 'off') {
    return null;
  }

  const renderGrid = (
    heading: string,
    themes: typeof PresetThemesMetadatas,
  ): JSX.Element => (
    <div className="mb-3">
      <h3 className="mb-3 fs-6">{heading}</h3>
      <div className="hstack gap-3 align-items-start flex-wrap">
        {themes.map((theme) => (
          <ThemeColorBox
            key={theme.name}
            isSelected={themeCookie === theme.name}
            metadata={theme}
            onSelected={() => selectTheme(theme.name)}
          />
        ))}
      </div>
    </div>
  );

  return (
    <div>
      <h2 className="border-bottom pb-2 mb-4 fs-4">
        {t('theme_settings.settings')}
      </h2>

      {mode === 'optin' && (
        <div className="row justify-content-center mb-4">
          <div className="col-md-8">
            <div className="form-check form-switch">
              <input
                id={modernSwitchId}
                className="form-check-input"
                type="checkbox"
                checked={modernEnabled}
                onChange={toggleModern}
              />
              <label
                className="form-label form-check-label"
                htmlFor={modernSwitchId}
              >
                {t('theme_settings.use_modern_ui')}
              </label>
            </div>
            <p className="form-text text-muted small">
              {t('theme_settings.modern_ui_desc')}
            </p>
          </div>
        </div>
      )}

      <div className="row justify-content-center">
        <div className="col-md-10">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="fs-6 mb-0">{t('theme_settings.color_theme')}</h3>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={resetTheme}
              disabled={themeCookie == null}
            >
              {t('theme_settings.reset_to_default')}
            </button>
          </div>
          {renderGrid(t('theme_settings.light_and_dark'), bothModeThemes)}
          {renderGrid(t('theme_settings.single_mode'), oneModeThemes)}
        </div>
      </div>
    </div>
  );
};
