import type { JSX } from 'react';
import Link from 'next/link';
import { useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';

import { useIsGuestUser } from '~/states/context';
import { taskEnabledAtom } from '~/states/server-configurations';

/**
 * Sidebar entry linking to the standalone task board (`/_tasks`). Rendered only
 * when the feature is enabled (`taskEnabledAtom`) and the viewer is a real,
 * non-guest user — the feature leaves no reachable UI surface when off.
 */
export const TaskNavItem = (): JSX.Element | null => {
  const { t } = useTranslation();
  const taskEnabled = useAtomValue(taskEnabledAtom);
  const isGuestUser = useIsGuestUser();

  if (!taskEnabled || isGuestUser !== false) {
    return null;
  }

  return (
    <Link
      href="/_tasks"
      className="btn btn-primary m-1 rounded d-flex align-items-center justify-content-center"
      aria-label={t('task.nav_label')}
      prefetch={false}
    >
      <span className="material-symbols-outlined">checklist</span>
    </Link>
  );
};
