import type { JSX } from 'react';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import {
  SYSREQ_OS_KEYS,
  type SysreqOsKey,
} from '~/interfaces/system-requirements';
import { uaOsAtom } from '~/states/server-configurations';

// OS names are proper nouns — not translated, just displayed.
const OS_LABEL: Record<SysreqOsKey, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  android: 'Android',
  ios: 'iOS',
};

/**
 * The per-OS minimum / recommended environment table. Data lives in the
 * `commons` i18n namespace (`system_requirements.os.<key>.{min,rec}`); the
 * viewer's own OS row (from `uaOsAtom`) is highlighted. Shared by the home
 * page and, later, the `::sysreq{}` directive.
 */
export const SystemRequirementsTable = (): JSX.Element => {
  const { t } = useTranslation('commons');
  const viewerOs = useAtomValue(uaOsAtom);

  return (
    <div className="table-responsive">
      <table className="table table-bordered align-middle small">
        <thead>
          <tr>
            <th scope="col" />
            <th scope="col">{t('system_requirements.minimum')}</th>
            <th scope="col">{t('system_requirements.recommended')}</th>
          </tr>
        </thead>
        <tbody>
          {SYSREQ_OS_KEYS.map((os) => (
            <tr
              key={os}
              className={os === viewerOs ? 'table-active' : undefined}
            >
              <th scope="row" className="text-nowrap">
                {OS_LABEL[os]}
                {os === viewerOs && (
                  <span className="badge text-bg-secondary ms-2 fw-normal">
                    {t('system_requirements.your_os')}
                  </span>
                )}
              </th>
              <td>{t(`system_requirements.os.${os}.min`)}</td>
              <td>{t(`system_requirements.os.${os}.rec`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
