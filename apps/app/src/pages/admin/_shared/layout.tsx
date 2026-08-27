import type React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useMemo } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'next-i18next';

import { useCustomTitle } from '~/pages/utils/page-title-customization';

import { AdminPageFrame } from './AdminPageFrame';
import type { AdminCommonProps, AnyUnstatedContainer } from './types';
import { useUnstatedContainers } from './use-unstated-container';

export interface AdminLayoutOptions<P extends AdminCommonProps> {
  title: string | ((props: P, t: TFunction) => string);
  containerFactories?: Array<() => Promise<AnyUnstatedContainer>>;
}

export function createAdminPageLayout<P extends AdminCommonProps>(
  options: AdminLayoutOptions<P>,
) {
  // Defined once, outside the returned getLayout closure: _app calls
  // `Component.getLayout(page)` on every render, and a component defined
  // inside that closure would be a new function identity each call — React
  // would then treat it as a different component type and unmount/remount
  // the whole subtree (losing unstated container state) on every _app
  // re-render, not just on actual page navigation.
  const Wrapper: React.FC<{ page: ReactElement<P> }> = ({ page }) => {
    const { t } = useTranslation('admin');

    const rawTitle =
      typeof options.title === 'function'
        ? options.title(page.props, t)
        : options.title;
    const title = useCustomTitle(rawTitle);

    const factories = useMemo(() => options.containerFactories ?? [], []);
    const containers = useUnstatedContainers(factories);

    return (
      <AdminPageFrame
        title={title}
        componentTitle={rawTitle}
        isAccessDeniedForNonAdminUser={page.props.isAccessDeniedForNonAdminUser}
        containers={containers}
      >
        {page}
      </AdminPageFrame>
    );
  };

  return function getLayout(page: ReactElement<P>): ReactNode {
    return <Wrapper page={page} />;
  };
}

export default createAdminPageLayout;
