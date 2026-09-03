import mongoose from 'mongoose';

import loggerFactory from '~/utils/logger';

const logger = loggerFactory(
  'growi:features:board:board-yjs:create-board-indexes',
);

/**
 * Indexes for the `y-mongodb-provider` collection backing board documents.
 * Same shape as `server/service/yjs/create-indexes.ts` -- the provider's
 * query patterns are identical; only the collection differs.
 */
export const createBoardIndexes = async (
  collectionName: string,
): Promise<void> => {
  const collection = mongoose.connection.collection(collectionName);

  try {
    await collection.createIndexes([
      { key: { version: 1, docName: 1, action: 1, clock: 1, part: 1 } },
      { key: { version: 1, docName: 1, metaKey: 1 } },
      { key: { docName: 1, clock: 1 } },
    ]);
  } catch (err) {
    logger.error('Failed to create index', err);
    throw err;
  }
};
