import type { IPage, IUserHasId } from '@growi/core';
import { ErrorV3 } from '@growi/core/dist/models';
import type { Request, Response, Router } from 'express';
import express from 'express';
import { query } from 'express-validator';
import mongoose, { type HydratedDocument } from 'mongoose';

import type Crowi from '~/server/crowi';
import { apiV3FormValidator } from '~/server/middlewares/apiv3-form-validator';
import loginRequiredFactory from '~/server/middlewares/login-required';
import {
  type PageDocument,
  type PageModel,
  PageQueryBuilder,
} from '~/server/models/page';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export interface ClassroomFeedItem {
  path: string;
  body: string;
  createdAt: Date;
}

interface ClassroomFeedRequest extends Request {
  user?: IUserHasId;
}

/**
 * Read-only feed of descendant pages under a given path prefix, newest
 * first, WITH body text — unlike `lsx` (GROWI's built-in list-children
 * directive), which only renders titles/links. Built for the
 * classroom-sync feature's "recent updates, readable inline" request, but
 * generic over any prefix so it can be reused for other feeds later.
 *
 * Respects the requesting user's normal page-view permissions via
 * `PageQueryBuilder.addViewerCondition` — this does not bypass grants.
 */
export const setupClassroomFeed = (crowi: Crowi): Router => {
  const router = express.Router();
  const loginRequired = loginRequiredFactory(crowi, true);

  const validators = [
    query('prefix').isString().notEmpty(),
    query('limit').optional().isInt({ min: 1, max: MAX_LIMIT }),
  ];

  router.get(
    '/',
    loginRequired,
    validators,
    apiV3FormValidator,
    async (req: ClassroomFeedRequest, res: Response) => {
      const prefix = req.query.prefix as string;
      const limit = Math.min(
        Number(req.query.limit ?? DEFAULT_LIMIT),
        MAX_LIMIT,
      );

      try {
        const Page = mongoose.model<IPage, PageModel>('Page');

        const queryBuilder = new PageQueryBuilder(Page.find({}));
        queryBuilder.addConditionToListOnlyDescendants(prefix);
        queryBuilder.addConditionToExcludeTrashed();
        queryBuilder.addConditionToExcludeWipPage();
        await queryBuilder.addViewerCondition(req.user);

        const pages = (await queryBuilder.query
          .sort({ createdAt: -1 })
          .limit(limit)
          .populate({ path: 'revision', select: 'body' })
          .lean()) as HydratedDocument<PageDocument>[];

        const items: ClassroomFeedItem[] = pages
          .map((p) => ({
            path: p.path,
            body: (p.revision as { body?: string } | undefined)?.body ?? '',
            createdAt: p.createdAt,
          }))
          .filter((item) => item.body !== '');

        (res as ApiV3Response).apiv3({ items });
      } catch (err) {
        (res as ApiV3Response).apiv3Err(
          new ErrorV3(
            `Failed to build classroom feed: ${String(err)}`,
            'classroom_feed_error',
          ),
          500,
        );
      }
    },
  );

  return router;
};
