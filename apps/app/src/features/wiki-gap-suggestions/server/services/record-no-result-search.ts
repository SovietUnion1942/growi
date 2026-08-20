import loggerFactory from '~/utils/logger';

import WikiGapQuery from '../models/wiki-gap-query-model';
import { normalizeSearchQuery } from './normalize-search-query';

const logger = loggerFactory(
  'growi:features:wiki-gap-suggestions:record-no-result-search',
);

/**
 * Upserts an aggregate count for a query that returned zero wiki hits.
 * Best-effort by design: the caller (full-text-search-tool.ts) fires this
 * without awaiting failure, so a DB hiccup here never affects the agent's
 * response to the user. Never records who asked.
 */
export const recordNoResultSearch = async (rawQuery: string): Promise<void> => {
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  if (normalizedQuery.length === 0) {
    return;
  }

  try {
    const now = new Date();
    await WikiGapQuery.findOneAndUpdate(
      { normalizedQuery },
      {
        $inc: { count: 1 },
        $set: { lastSeenAt: now, rawQueryExample: rawQuery },
        $setOnInsert: { firstSeenAt: now },
      },
      { upsert: true },
    ).exec();
  } catch (err) {
    logger.warn('failed to record a no-result search query', err);
  }
};
