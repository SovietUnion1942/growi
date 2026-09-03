/**
 * Base path for the board Yjs websocket namespace. Kept separate from the
 * wiki `/yjs` namespace (`YJS_WEBSOCKET_BASE_PATH`) so the two upgrade
 * handlers never contend and the board collab stack can be cloned from
 * `server/service/yjs` without the wiki-body revision-sync logic.
 */
export const BOARD_YJS_WEBSOCKET_BASE_PATH = '/board-yjs';

/**
 * A board id is author-supplied in the `::board{id=...}` directive, so it is
 * validated rather than trusted: 1-64 chars of `[A-Za-z0-9_-]`. It doubles as
 * the Yjs document name and the `board-yjs-writings` docName.
 */
export const BOARD_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export const isValidBoardId = (value: string): boolean =>
  BOARD_ID_PATTERN.test(value);
