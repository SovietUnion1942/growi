import type http from 'node:http';
import mongoose from 'mongoose';
import { WebSocketServer } from 'ws';
import type { WSSharedDoc, YWebsocketPersistence } from 'y-websocket/bin/utils';
import {
  getPersistence,
  setPersistence,
  setupWSConnection,
} from 'y-websocket/bin/utils';
import * as Y from 'yjs';

import type { SessionConfig } from '~/interfaces/session-config';
import { MongodbPersistence } from '~/server/service/yjs/extended/mongodb-persistence';
import { guardSocket } from '~/server/service/yjs/guard-socket';
import loggerFactory from '~/utils/logger';

import { BOARD_YJS_WEBSOCKET_BASE_PATH } from '../../interfaces/board';
import { createBoardUpgradeHandler } from './board-upgrade-handler';
import { createBoardIndexes } from './create-board-indexes';

const MONGODB_PERSISTENCE_COLLECTION_NAME = 'board-yjs-writings';
const MONGODB_PERSISTENCE_FLUSH_SIZE = 100;
const BOARD_YJS_PATH_PREFIX = `${BOARD_YJS_WEBSOCKET_BASE_PATH}/`;

/**
 * `y-websocket/bin/utils` keeps a single process-wide `docs` map and a single
 * persistence, shared with the wiki `YjsService`. Board documents are given a
 * `board:` docName prefix so they never collide with wiki page ids in that
 * map, and the persistence installed here delegates every non-`board:`
 * docName back to the wiki persistence that was set before us.
 */
const BOARD_DOC_PREFIX = 'board:';
export const toBoardDocName = (boardId: string): string =>
  `${BOARD_DOC_PREFIX}${boardId}`;

const logger = loggerFactory('growi:features:board:board-yjs');

/**
 * A minimal y-websocket persistence for boards: load persisted state on
 * bind, push it to the client, store every subsequent update, flush on
 * close. No revision sync, no YDocStatus, no awareness->socket.io bridge --
 * a board has no wiki counterpart. Cf.
 * `server/service/yjs/create-mongodb-persistence.ts`.
 */
const createBoardOnlyPersistence = (
  mdb: MongodbPersistence,
): YWebsocketPersistence => ({
  provider: mdb,
  bindState: async (docName: string, ydoc: WSSharedDoc) => {
    const persistedYdoc = await mdb.getYDoc(docName);

    const persistedStateVector = Y.encodeStateVector(persistedYdoc);
    const diff = Y.encodeStateAsUpdate(ydoc, persistedStateVector);
    if (diff.some((b) => b !== 0)) {
      mdb.storeUpdate(docName, diff);
    }

    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    persistedYdoc.destroy();

    ydoc.on('update', (update: Uint8Array) => {
      mdb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName: string) => {
    await mdb.flushDocument(docName);
  },
});

/**
 * Compose a persistence that serves `board:`-prefixed docNames from the
 * board collection and delegates everything else to the wiki persistence
 * (which must already be set -- initialize order in crowi/index.ts).
 */
const createDelegatingPersistence = (
  boardPersistence: YWebsocketPersistence,
): YWebsocketPersistence => {
  const wikiPersistence = getPersistence();

  const pick = (docName: string): YWebsocketPersistence | null => {
    if (docName.startsWith(BOARD_DOC_PREFIX)) return boardPersistence;
    return wikiPersistence;
  };

  return {
    provider: boardPersistence.provider,
    bindState: (docName, ydoc) => pick(docName)?.bindState(docName, ydoc),
    writeState: async (docName, ydoc) => {
      await pick(docName)?.writeState(docName, ydoc);
    },
  };
};

class BoardYjsService {
  private wss: WebSocketServer;

  constructor(httpServer: http.Server, sessionConfig: SessionConfig) {
    const mdb = new MongodbPersistence(
      {
        client: mongoose.connection.getClient() as never,
        db: mongoose.connection.db as never,
      },
      {
        collectionName: MONGODB_PERSISTENCE_COLLECTION_NAME,
        flushSize: MONGODB_PERSISTENCE_FLUSH_SIZE,
      },
    );

    createBoardIndexes(MONGODB_PERSISTENCE_COLLECTION_NAME);

    setPersistence(
      createDelegatingPersistence(createBoardOnlyPersistence(mdb)),
    );

    this.wss = new WebSocketServer({ noServer: true });
    const handleUpgrade = createBoardUpgradeHandler(sessionConfig);

    httpServer.on('upgrade', async (request, socket, head) => {
      const url = request.url ?? '';
      if (!url.startsWith(BOARD_YJS_PATH_PREFIX)) {
        return;
      }

      const guard = guardSocket(socket);
      try {
        const result = await handleUpgrade(request, socket);
        guard.restore();

        if (!result.authorized) {
          socket.destroy();
          return;
        }

        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
          setupWSConnection(ws, request, {
            docName: toBoardDocName(result.boardId),
          });
        });
      } catch (err) {
        guard.restore();
        logger.error({ url, err }, 'Board Yjs upgrade handler failed');
        if (socket.writable) {
          socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
        }
        socket.destroy();
      }
    });

    logger.info('BoardYjsService initialized');
  }
}

let _instance: BoardYjsService | undefined;

export const initializeBoardYjsService = (
  httpServer: http.Server,
  sessionConfig: SessionConfig,
): void => {
  if (_instance != null) {
    throw new Error('BoardYjsService is already initialized');
  }
  _instance = new BoardYjsService(httpServer, sessionConfig);
};
