import { type JSX, useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  modernUiModeAtom,
  uaBelowMinAtom,
  uiTierAtom,
} from '~/states/server-configurations';

import { ThemeColorBox } from '../Admin/Customize/ThemeColorBox';

const COOKIE_OPTS = { path: '/', expires: 365 } as const;

/** A swatch, sized like ThemeColorBox, that toggles the modern skin. */
const ModernUiSwatch = ({
  isSelected,
  isDisabled,
  onToggle,
}: {
  isSelected: boolean;
  isDisabled: boolean;
  onToggle: () => void;
}): JSX.Element => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className={`d-flex flex-column align-items-center border-0 bg-transparent ${isSelected ? 'active' : ''}`}
      style={{ minWidth: 100, opacity: isDisabled ? 0.4 : 1 }}
      onClick={isDisabled ? undefined : onToggle}
      aria-pressed={isSelected}
      disabled={isDisabled}
    >
      <div
        className={`m-0 rounded rounded-3 border border-4 border-primary ${isSelected ? '' : 'border-opacity-10'}`}
      >
        <svg viewBox="0 0 64 64" width="64" height="64" className="rounded">
          <title>modern</title>
          <defs>
            <linearGradient id="grw-modern-swatch" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#eaf0f7" />
              <stop offset="55%" stopColor="#d8e2ee" />
              <stop offset="100%" stopColor="#cdd9e8" />
            </linearGradient>
          </defs>
          <rect width="64" height="64" fill="url(#grw-modern-swatch)" />
          <rect
            x="7"
            y="7"
            width="50"
            height="50"
            rx="8"
            fill="#ffffff"
            fillOpacity="0.82"
            stroke="#ffffff"
          />
          <rect
            x="7"
            y="7"
            width="50"
            height="16"
            rx="8"
            fill="#ffffff"
            fillOpacity="0.45"
          />
          <rect
            x="13"
            y="30"
            width="30"
            height="3.5"
            rx="1.75"
            fill="#007eb0"
          />
          <rect x="13" y="39" width="22" height="3" rx="1.5" fill="#8aa1b4" />
          <rect x="13" y="46" width="26" height="3" rx="1.5" fill="#8aa1b4" />
        </svg>
      </div>
      <span className={`mt-2 ${isSelected ? '' : 'opacity-50'}`}>
        <b>{t('theme_settings.modern_ui')}</b>
      </span>
    </button>
  );
};

/**
 * Per-browser UI preferences: the modern skin + the preset color theme, shown
 * as one swatch grid (mirroring the admin theme picker). Cookie-backed
 * (`grw-ui` / `grw-theme`) so they only affect this browser; a change reloads
 * the page so `_document` re-renders. Hidden when `MODERN_UI_MODE=off`.
 */
export const ThemeSettings = (): JSX.Element | null => {
  const { t } = useTranslation();
  const mode = useAtomValue(modernUiModeAtom);
  const uiTier = useAtomValue(uiTierAtom);
  const uaBelowMin = useAtomValue(uaBelowMinAtom);

  const [themeCookie, setThemeCookie] = useState<string | undefined>(undefined);
  useEffect(() => {
    setThemeCookie(Cookies.get(THEME_COOKIE));
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
    if (uiTier === 'glass') {
      Cookies.remove(MODERN_UI_COOKIE, { path: '/' });
    } else {
      Cookies.set(MODERN_UI_COOKIE, MODERN_UI_COOKIE_ON, COOKIE_OPTS);
    }
    window.location.reload();
  }, [uiTier]);

  if (mode === 'off') {
    return null;
  }

  // The modern card only makes sense in per-user opt-in; `on` forces it, `off`
  // is handled above. When the client is too old, show it disabled.
  const showModernSwatch = mode === 'optin';

  return (
    <div>
      <h2 className="border-bottom pb-2 mb-4 fs-4">
        {t('theme_settings.settings')}
      </h2>

      <div className="row justify-content-center">
        <div className="col-md-10">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <p className="form-text text-muted small mb-0">
              {t('theme_settings.desc')}
            </p>
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary flex-shrink-0"
              onClick={resetTheme}
              disabled={themeCookie == null}
            >
              {t('theme_settings.reset_to_default')}
            </button>
          </div>

          <div className="mb-3">
            <h3 className="mb-3 fs-6">{t('theme_settings.light_and_dark')}</h3>
            <div className="hstack gap-3 align-items-start flex-wrap">
              {showModernSwatch && (
                <ModernUiSwatch
                  isSelected={uiTier === 'glass'}
                  isDisabled={uaBelowMin}
                  onToggle={toggleModern}
                />
              )}
              {bothModeThemes.map((theme) => (
                <ThemeColorBox
                  key={theme.name}
                  isSelected={themeCookie === theme.name}
                  metadata={theme}
                  onSelected={() => selectTheme(theme.name)}
                />
              ))}
            </div>
            {showModernSwatch && uaBelowMin && (
              <p className="form-text text-warning small mt-1">
                {t('theme_settings.modern_ui_unavailable')}
              </p>
            )}
          </div>

          <div className="mb-3">
            <h3 className="mb-3 fs-6">{t('theme_settings.single_mode')}</h3>
            <div className="hstack gap-3 align-items-start flex-wrap">
              {oneModeThemes.map((theme) => (
                <ThemeColorBox
                  key={theme.name}
                  isSelected={themeCookie === theme.name}
                  metadata={theme}
                  onSelected={() => selectTheme(theme.name)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
