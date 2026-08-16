import React from 'react';
import PropTypes from 'prop-types';

import UserPictureListItem from './UserPictureListItem';

export default class UserPictureList extends React.Component {
  render() {
    return this.props.users.map((user) => (
      <UserPictureListItem key={user._id} user={user} />
    ));
  }
}

UserPictureList.propTypes = {
  users: PropTypes.arrayOf(PropTypes.object),
};

UserPictureList.defaultProps = {
  users: [],
};
