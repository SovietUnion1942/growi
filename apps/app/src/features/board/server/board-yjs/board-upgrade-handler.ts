import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import type { IUserHasId } from '@growi/core';
import expressSession from 'express-session';
import passport from 'passport';

import type { SessionConfig } from '~/interfaces/session-config';
import loggerFactory from '~/utils/logger';

import {
  BOARD_YJS_WEBSOCKET_BASE_PATH,
  isValidBoardId,
} from '../../interfaces/board';

const logger = loggerFactory(
  'growi:features:board:board-yjs:board-upgrade-handler',
);

type AuthenticatedRequest = IncomingMessage & { user?: IUserHasId };

type ConnectMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: unknown) => void,
) => void;

/**
 * Run a Connect-style middleware against a raw IncomingMessage. Safe for
 * express-session / passport, which only touch `req`. Mirrors
 * `server/service/yjs/upgrade-handler.ts`.
 */
const runMiddleware = (
  middleware: ConnectMiddleware,
  req: IncomingMessage,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const stubRes = {} as ServerResponse;
    middleware(req, stubRes, (err?: unknown) => {
      if (err) return reject(err);
      resolve();
    });
  });

const boardIdPattern = new RegExp(
  `^${BOARD_YJS_WEBSOCKET_BASE_PATH}/([^/?#]+)`,
);
const extractBoardId = (url: string | undefined): string | null => {
  if (url == null) return null;
  const raw = url.match(boardIdPattern)?.[1];
  if (raw == null) return null;
  const decoded = decodeURIComponent(raw);
  return isValidBoardId(decoded) ? decoded : null;
};

const writeErrorResponse = (
  socket: Duplex,
  statusCode: number,
  message: string,
): void => {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\n\r\n`);
};

export type BoardUpgradeResult =
  | { authorized: true; request: AuthenticatedRequest; boardId: string }
  | { authorized: false; statusCode: number };

/**
 * Authenticates a board websocket upgrade with the existing express-session
 * + passport mechanism. Board access is "any logged-in user" -- boards are
 * not per-page ACL'd (unlike the wiki `/yjs` namespace, which checks
 * `Page.isAccessiblePageByViewer`).
 */
export const createBoardUpgradeHandler = (sessionConfig: SessionConfig) => {
  const sessionMiddleware = expressSession(sessionConfig as never);
  const passportInit = passport.initialize();
  const passportSession = passport.session();

  return async (
    request: IncomingMessage,
    socket: Duplex,
  ): Promise<BoardUpgradeResult> => {
    const boardId = extractBoardId(request.url);
    if (boardId == null) {
      logger.warn({ url: request.url }, 'Invalid board id for Yjs upgrade');
      writeErrorResponse(socket, 400, 'Bad Request');
      return { authorized: false, statusCode: 400 };
    }

    try {
      await runMiddleware(sessionMiddleware as ConnectMiddleware, request);
      await runMiddleware(passportInit as ConnectMiddleware, request);
      await runMiddleware(passportSession as ConnectMiddleware, request);
    } catch (err) {
      logger.warn({ err }, 'Session/passport middleware failed on upgrade');
      writeErrorResponse(socket, 401, 'Unauthorized');
      return { authorized: false, statusCode: 401 };
    }

    const user = (request as AuthenticatedRequest).user ?? null;
    if (user == null) {
      writeErrorResponse(socket, 401, 'Unauthorized');
      return { authorized: false, statusCode: 401 };
    }

    return {
      authorized: true,
      request: request as AuthenticatedRequest,
      boardId,
    };
  };
};
