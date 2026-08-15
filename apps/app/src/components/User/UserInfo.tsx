import React, { type JSX, useMemo } from 'react';
import type { IUserHasId } from '@growi/core';
import { UserPicture } from '@growi/ui/dist/components';

// biome-ignore-start lint/style/noRestrictedImports: useUserPictureBadges is SSR-safe (SWR only fetches in an effect, never during render) and there is no non-"client/" home for it yet; see requirement 4.5 / task 12.2.
import {
  type UserPictureBadgeSource,
  useUserPictureBadges,
} from '~/features/user-badge/client/hooks/use-user-picture-badges';

// biome-ignore-end lint/style/noRestrictedImports: useUserPictureBadges is SSR-safe (SWR only fetches in an effect, never during render) and there is no non-"client/" home for it yet; see requirement 4.5 / task 12.2.

import styles from './UserInfo.module.scss';

export type UserInfoProps = {
  author?: IUserHasId;
};

export const UserInfo = (props: UserInfoProps): JSX.Element => {
  const { author } = props;

  // `IUserBadgeSummaryEntry.badgeType` (packages/core) is typed as
  // `Types.ObjectId` for the server-side Mongoose model, but by the time it
  // reaches this client component (via getServerSideProps JSON
  // serialization) it is actually a string; normalize explicitly here to
  // match `UserPictureBadgeSource.badgeType: string`.
  const badgeSummary = useMemo<UserPictureBadgeSource[] | undefined>(() => {
    return author?.badgeSummaryCached?.map(
      ({ badgeType, iconKey, name, level }) => ({
        badgeType: String(badgeType),
        iconKey,
        name,
        level,
      }),
    );
  }, [author?.badgeSummaryCached]);

  const badges = useUserPictureBadges(badgeSummary);

  if (author == null || author.status === 4) {
    return <></>;
  }

  return (
    <div
      className={`${styles['grw-users-info']} grw-users-info d-flex align-items-center d-edit-none mb-5 pb-3 border-bottom`}
      data-testid="grw-users-info"
    >
      <UserPicture user={author} noTooltip noLink badges={badges} />
      <div className="users-meta">
        <h1 className="user-page-name">{author.name}</h1>
        <div className="user-page-meta mt-3 mb-0">
          <span className="user-page-username me-4">
            <span className="user-page-username me-4">
              <span className="material-symbols-outlined">person</span>
              {author.username}
            </span>
          </span>
          <span className="user-page-email me-2">
            <span className="material-symbols-outlined me-1">mail</span>
            {author.isEmailPublished ? author.email : '*****'}
          </span>
          {author.introduction && (
            <span className="user-page-introduction">
              {author.introduction}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
