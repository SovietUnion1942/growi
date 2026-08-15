export const RoomPrefix = {
  USER: 'user',
  PAGE: 'page',
};

export const getRoomNameWithId = (
  roomPrefix: string,
  roomId: string,
): string => {
  return `${roomPrefix}:${roomId}`;
};

// fixed singleton room every logged-in socket joins, used to fan out
// the system-wide broadcast conversation without tracking a participants list
export const BROADCAST_ROOM_NAME = 'messages:broadcast';
