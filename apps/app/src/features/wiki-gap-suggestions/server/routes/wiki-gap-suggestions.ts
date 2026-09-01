import { ErrorV3 } from '@growi/core/dist/models';
import type { Request, Router } from 'express';
import express from 'express';

import type Crowi from '~/server/crowi';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

import type { WikiGapSuggestion } from '../../interfaces/wiki-gap-suggestion';
import { isWikiGapSuggestionsEnabled } from '../is-wiki-gap-suggestions-enabled';
import WikiGapQuery from '../models/wiki-gap-query-model';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

const router = express.Router();

/**
 * Read-only, member-visible (not admin-only) report of what the AI agent
 * couldn't find in the wiki, so any member can spot a gap and go write the
 * missing page -- see project memory `search-failure-log-feature`.
 */
export const setup = (crowi: Crowi): Router => {
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  // Feature gate (app:wikiGapSuggestionsEnabled): every route below 404s.
  router.use((_req, res: ApiV3Response, next) => {
    if (!isWikiGapSuggestionsEnabled()) {
      return res.apiv3Err(
        new ErrorV3(
          'Wiki-gap suggestions are disabled',
          'wiki-gap-suggestions-disabled',
        ),
        404,
      );
    }
    next();
  });

  router.get(
    '/',
    loginRequiredStrictly,
    async (req: Request, res: ApiV3Response) => {
      const rawLimit = Number(req.query.limit);
      const limit =
        Number.isFinite(rawLimit) && rawLimit > 0
          ? Math.min(rawLimit, MAX_LIMIT)
          : DEFAULT_LIMIT;

      const docs = await WikiGapQuery.find({})
        .sort({ count: -1, lastSeenAt: -1 })
        .limit(limit)
        .lean();

      const suggestions: WikiGapSuggestion[] = docs.map((doc) => ({
        query: doc.rawQueryExample,
        count: doc.count,
        lastSeenAt: doc.lastSeenAt.toISOString(),
      }));

      return res.apiv3({ suggestions });
    },
  );

  return router;
};
