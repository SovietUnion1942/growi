import React, { type JSX, useMemo } from 'react';
import Link from 'next/link';
import type { IPageHasId } from '@growi/core';
import { isPopulated } from '@growi/core';
import {
  PageListMeta,
  PagePathLabel,
  UserPicture,
} from '@growi/ui/dist/components';
import Clamp from 'react-multiline-clamp';

import {
  type UserPictureBadgeSource,
  useUserPictureBadges,
} from '~/features/user-badge/client/hooks/use-user-picture-badges';

import styles from './PageListItemS.module.scss';

type PageListItemSProps = {
  page: IPageHasId;
  noLink?: boolean;
  pageTitle?: string;
  isNarrowView?: boolean;
};

export const PageListItemS = (props: PageListItemSProps): JSX.Element => {
  const { page, noLink = false, pageTitle, isNarrowView = false } = props;

  const path = pageTitle != null ? pageTitle : page.path;

  // `page.lastUpdateUser` is typed as `Ref<IUser>` (string | ObjectId |
  // populated user); narrow with `isPopulated` before reading
  // `badgeSummaryCached` (same pattern as `RecentChangesSubstance.tsx`,
  // task 12.3). `badgeType` is normalized to `string` to match
  // `UserPictureBadgeSource`.
  const { lastUpdateUser } = page;
  const badgeSummary = useMemo<UserPictureBadgeSource[] | undefined>(() => {
    if (lastUpdateUser == null || !isPopulated(lastUpdateUser)) {
      return undefined;
    }
    return lastUpdateUser.badgeSummaryCached?.map(
      ({ badgeType, iconKey, iconType, iconUrl, name, level }) => ({
        badgeType: String(badgeType),
        iconKey,
        iconType,
        iconUrl,
        name,
        level,
      }),
    );
  }, [lastUpdateUser]);

  const badges = useUserPictureBadges(badgeSummary);

  let pagePathElement = (
    <PagePathLabel path={path} additionalClassNames={['mx-1']} />
  );
  if (!noLink) {
    pagePathElement = (
      <Link href={`/${page._id}`} className="text-break" prefetch={false}>
        {pagePathElement}
      </Link>
    );
  }

  return (
    <>
      <UserPicture user={page.lastUpdateUser} noLink={noLink} badges={badges} />
      {isNarrowView ? (
        <Clamp lines={2}>
          <div
            className={`mx-1 ${styles['page-title']} ${noLink ? 'text-break' : ''}`}
          >
            {pagePathElement}
          </div>
        </Clamp>
      ) : (
        pagePathElement
      )}
      <span className="ms-1">
        <PageListMeta page={page} shouldSpaceOutIcon />
      </span>
    </>
  );
};
