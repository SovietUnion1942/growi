import type { JSX } from 'react';
import Link from 'next/link';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { useIsGuestUser } from '~/states/context';
import { nasStorageEnabledAtom } from '~/states/server-configurations';

/**
 * Sidebar entry linking to the NAS storage browser page (`/nas`). Rendered only
 * when the feature is enabled (`nasStorageEnabledAtom`) and the viewer is a
 * real, non-guest user — Requirement 1.2 ("関連する UI 導線を利用者に表示しない").
 */
export const NasStorageNavItem = (): JSX.Element | null => {
  const { t } = useTranslation();
  const nasStorageEnabled = useAtomValue(nasStorageEnabledAtom);
  const isGuestUser = useIsGuestUser();

  if (!nasStorageEnabled || isGuestUser !== false) {
    return null;
  }

  return (
    <Link
      href="/nas"
      className="btn btn-primary m-1 rounded d-flex align-items-center justify-content-center"
      aria-label={t('nas_storage.nav_label')}
      prefetch={false}
    >
      <span className="material-symbols-outlined">hard_drive</span>
    </Link>
  );
};
