import { UserPicture } from '@growi/ui/dist/components';
import PropTypes from 'prop-types';

import { useUserPictureBadges } from '~/features/user-badge/client/hooks/use-user-picture-badges';

/**
 * Renders a single user's `UserPicture` inside `UserPictureList`.
 *
 * `useUserPictureBadges` is a hook, so it cannot be called directly inside
 * `UserPictureList`'s `.map()` callback (that would call a hook a variable
 * number of times per render, violating the Rules of Hooks). Extracting one
 * list item into its own component makes each call site a proper component
 * instance -- calling a hook at the top level of *this* component is legal,
 * and each instance gets its own hook state independent of list length.
 *
 * `user.badgeSummaryCached` (`IUser`, `packages/core`) is optional and
 * absent for callers that don't pass badge-carrying user data (e.g.
 * `BookmarkButtons.tsx`, `LikeButtons.tsx`), so `useUserPictureBadges`
 * naturally resolves to an empty badge list and rendering is unaffected.
 */
const UserPictureListItem = ({ user }) => {
  const badgeSummary = user?.badgeSummaryCached?.map(
    ({ badgeType, iconKey, iconType, iconUrl, name, level }) => ({
      badgeType: String(badgeType),
      iconKey,
      iconType,
      iconUrl,
      name,
      level,
    }),
  );

  const badges = useUserPictureBadges(badgeSummary);

  return (
    <span>
      <UserPicture user={user} size="xs" badges={badges} />
    </span>
  );
};

UserPictureListItem.propTypes = {
  // eslint-disable-next-line react/forbid-prop-types
  user: PropTypes.object.isRequired,
};

export default UserPictureListItem;
