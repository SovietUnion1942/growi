import type { JSX } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';

/**
 * Sidebar rail entry linking to the standalone home page (`/home`). Mirrors
 * `NasStorageNavItem`. Shown to everyone (the home page itself applies ACL to
 * its notice content).
 */
export const HomeNavItem = (): JSX.Element => {
  const { t } = useTranslation();
  return (
    <Link
      href="/home"
      className="btn btn-primary m-1 rounded d-flex align-items-center justify-content-center"
      aria-label={t('home.nav_label')}
      prefetch={false}
    >
      <span className="material-symbols-outlined">home</span>
    </Link>
  );
};
