import { type JSX, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import {
  isSysreqOsKey,
  type SysreqOsKey,
} from '~/interfaces/system-requirements';
import {
  sysreqNoticeAtom,
  uaBelowMinAtom,
  uaOsAtom,
} from '~/states/server-configurations';

const DISMISS_KEY = 'grw-sysreq-dismissed';

/**
 * A dismissible warning shown when this client's User-Agent is below the
 * documented minimum (`uaBelowMin`, from the SSR UA sniff) and the instance
 * has `SYSREQ_NOTICE=true`. Modeled on AlertSiteUrlUndefined; rendered next to
 * it in BasicLayout. Dismissal is per-browser (localStorage).
 */
export const SystemRequirementsBanner = (): JSX.Element => {
  const { t } = useTranslation('commons');
  const enabled = useAtomValue(sysreqNoticeAtom);
  const belowMin = useAtomValue(uaBelowMinAtom);
  const osKey = useAtomValue(uaOsAtom);

  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      setDismissed(false);
    }
  }, []);

  if (!enabled || !belowMin || dismissed) {
    return <></>;
  }

  const os: SysreqOsKey | null = isSysreqOsKey(osKey) ? osKey : null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* private mode etc. - just hide for this render */
    }
    setDismissed(true);
  };

  return (
    <div className="alert alert-warning rounded-0 d-edit-none d-print-none mb-0 px-4 py-2 small">
      <div className="d-flex align-items-start gap-2">
        <span className="material-symbols-outlined">info</span>
        <div className="flex-grow-1">
          {t('system_requirements.banner')}
          {os != null && (
            <details className="mt-1">
              <summary>{t('system_requirements.details')}</summary>
              <dl className="row mb-0 mt-1">
                <dt className="col-sm-2">{t('system_requirements.minimum')}</dt>
                <dd className="col-sm-10">
                  {t(`system_requirements.os.${os}.min`)}
                </dd>
                <dt className="col-sm-2">
                  {t('system_requirements.recommended')}
                </dt>
                <dd className="col-sm-10">
                  {t(`system_requirements.os.${os}.rec`)}
                </dd>
              </dl>
            </details>
          )}
        </div>
        <button
          type="button"
          className="btn-close"
          aria-label={t('system_requirements.dismiss')}
          onClick={dismiss}
        />
      </div>
    </div>
  );
};

SystemRequirementsBanner.displayName = 'SystemRequirementsBanner';
