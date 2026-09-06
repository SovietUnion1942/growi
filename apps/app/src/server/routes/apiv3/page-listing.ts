import type { IPageInfoForListing, IUserHasId } from '@growi/core';
import { getIdForRef, isIPageInfoForEntity } from '@growi/core';
import { type IPageInfoForEmpty, SCOPE } from '@growi/core/dist/interfaces';
import { ErrorV3 } from '@growi/core/dist/models';
import {
  isUserPage,
  isUsersTopPage,
} from '@growi/core/dist/utils/page-path-utils';
import type { Request, Router } from 'express';
import express from 'express';
import { body, oneOf, query } from 'express-validator';
import type { HydratedDocument } from 'mongoose';
import mongoose from 'mongoose';

import { DEFAULT_HOME_CLASSROOM_PATH_PREFIX } from '~/features/home/consts';
import type { IPageForTreeItem } from '~/interfaces/page';
import { accessTokenParser } from '~/server/middlewares/access-token-parser';
import loginRequiredFactory from '~/server/middlewares/login-required';
import { configManager } from '~/server/service/config-manager';
import type { IPageGrantService } from '~/server/service/page-grant';
import { pageListingService } from '~/server/service/page-listing';
import loggerFactory from '~/utils/logger';
import { prisma } from '~/utils/prisma';

import type Crowi from '../../crowi';
import { apiV3FormValidator } from '../../middlewares/apiv3-form-validator';
import type { PageDocument, PageModel } from '../../models/page';
import type { ApiV3Response } from './interfaces/apiv3-response';

const logger = loggerFactory('growi:routes:apiv3:page-tree');

/*
 * Types & Interfaces
 */
interface AuthorizedRequest extends Request {
  user?: IUserHasId;
}

/*
 * Validators
 */
const RECENT_UNDER_PATH_LIMIT_DEFAULT = 20;
const RECENT_UNDER_PATH_LIMIT_MAX = 50;
const RESOLVE_PATHS_MAX = 100;

const validator = {
  pagePathRequired: [query('path').isString().withMessage('path is required')],
  pageIdOrPathRequired: oneOf(
    [query('id').isMongoId(), query('path').isString()],
    'id or path is required',
  ),
  pageIdsOrPathRequired: [
    // type check independent of existence check
    query('pageIds').isArray().optional(),
    query('path').isString().optional(),
    // existence check
    oneOf(
      [query('pageIds').exists(), query('path').exists()],
      'pageIds or path is required',
    ),
  ],
  infoParams: [
    query('attachBookmarkCount').isBoolean().optional(),
    query('attachShortBody').isBoolean().optional(),
  ],
  recentUnderPath: [
    query('prefix')
      .optional()
      .isString()
      .withMessage('prefix must be a string')
      .bail()
      .matches(/^\//)
      .withMessage('prefix must start with "/"'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: RECENT_UNDER_PATH_LIMIT_MAX })
      .withMessage(
        `limit must be an integer between 1 and ${RECENT_UNDER_PATH_LIMIT_MAX}`,
      )
      .toInt(),
  ],
  resolvePaths: [
    body('paths')
      .isArray({ max: RESOLVE_PATHS_MAX })
      .withMessage(
        `paths must be an array of at most ${RESOLVE_PATHS_MAX} items`,
      ),
    body('paths.*').isString().withMessage('each path must be a string'),
  ],
};

/*
 * Routes
 */
const routerFactory = (crowi: Crowi): Router => {
  const loginRequired = loginRequiredFactory(crowi, true);
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  const router = express.Router();

  /**
   * @swagger
   *
   * /page-listing/root:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/root
   *     description: Get the root page
   *     responses:
   *       200:
   *         description: Success
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 rootPage:
   *                   $ref: '#/components/schemas/PageForTreeItem'
   */
  router.get(
    '/root',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequired,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      try {
        const rootPage: IPageForTreeItem =
          await pageListingService.findRootByViewer(req.user);
        return res.apiv3({ rootPage });
      } catch (err) {
        return res.apiv3Err(new ErrorV3('rootPage not found'));
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/children:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/children
   *     description: Get the children of a page
   *     parameters:
   *       - name: id
   *         in: query
   *         schema:
   *           type: string
   *       - name: path
   *         in: query
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Get the children of a page
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 children:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/PageForTreeItem'
   */
  /*
   * In most cases, using id should be prioritized
   */
  router.get(
    '/children',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequired,
    validator.pageIdOrPathRequired,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { id, path } = req.query;

      const hideRestrictedByOwner = await configManager.getConfig(
        'security:list-policy:hideRestrictedByOwner',
      );
      const hideRestrictedByGroup = await configManager.getConfig(
        'security:list-policy:hideRestrictedByGroup',
      );
      const disableUserPages = await configManager.getConfig(
        'security:disableUserPages',
      );

      try {
        let pages =
          await pageListingService.findChildrenByParentPathOrIdAndViewer(
            (id || path) as string,
            req.user,
            !hideRestrictedByOwner,
            !hideRestrictedByGroup,
          );

        if (disableUserPages) {
          pages = pages.filter(
            (page) => !isUserPage(page.path) && !isUsersTopPage(page.path),
          );
        }

        return res.apiv3({ children: pages });
      } catch (err) {
        logger.error('Error occurred while finding children.', err);
        return res.apiv3Err(
          new ErrorV3('Error occurred while finding children.'),
        );
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/info:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/info
   *     description: Get summary information of pages
   *     parameters:
   *       - name: pageIds
   *         in: query
   *         description: Array of page IDs to retrieve information for (One of pageIds or path is required)
   *         schema:
   *           type: array
   *           items:
   *             type: string
   *       - name: path
   *         in: query
   *         description: Path of the page to retrieve information for (One of pageIds or path is required)
   *         schema:
   *           type: string
   *       - name: attachBookmarkCount
   *         in: query
   *         schema:
   *           type: boolean
   *       - name: attachShortBody
   *         in: query
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Get the information of a page
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               additionalProperties:
   *                 $ref: '#/components/schemas/PageInfoExt'
   */
  router.get(
    '/info',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    validator.pageIdsOrPathRequired,
    validator.infoParams,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const {
        pageIds,
        path,
        attachBookmarkCount: attachBookmarkCountParam,
        attachShortBody: attachShortBodyParam,
      } = req.query;

      const attachBookmarkCount: boolean = attachBookmarkCountParam === 'true';
      const attachShortBody: boolean = attachShortBodyParam === 'true';

      const Page = mongoose.model<HydratedDocument<PageDocument>, PageModel>(
        'Page',
      );
      const pageService = crowi.pageService;
      const pageGrantService: IPageGrantService = crowi.pageGrantService;

      try {
        const pages =
          pageIds != null
            ? await Page.findByIdsAndViewer(
                pageIds as string[],
                req.user,
                null,
                true,
              )
            : await Page.findByPathAndViewer(
                path as string,
                req.user,
                null,
                false,
                true,
              );

        const foundIds = pages.map((page) => page._id);

        let shortBodiesMap: Record<string, string | null> | undefined;
        if (attachShortBody) {
          shortBodiesMap = await pageService.shortBodiesMapByPageIds(
            foundIds,
            req.user,
          );
        }

        let bookmarkCountMap: Record<string, number> | undefined;
        if (attachBookmarkCount) {
          bookmarkCountMap =
            await prisma.bookmarks.getPageIdToCountMap(foundIds);
        }

        const idToPageInfoMap: Record<
          string,
          IPageInfoForEmpty | IPageInfoForListing
        > = {};

        const isGuestUser = req.user == null;

        const userRelatedGroups = await pageGrantService.getUserRelatedGroups(
          req.user,
        );

        for (const page of pages) {
          // TODO: use pageService.getCreatorIdForCanDelete to get creatorId (https://redmine.weseek.co.jp/issues/140574)
          const isDeletable = pageService.canDelete(
            page,
            page.creator == null ? null : getIdForRef(page.creator),
            req.user,
            false,
          );
          const isAbleToDeleteCompletely = pageService.canDeleteCompletely(
            page,
            page.creator == null ? null : getIdForRef(page.creator),
            req.user,
            false,
            userRelatedGroups,
          ); // use normal delete config

          const basicPageInfo = {
            ...pageService.constructBasicPageInfo(page, isGuestUser),
            isDeletable,
            isAbleToDeleteCompletely,
            bookmarkCount:
              bookmarkCountMap != null
                ? (bookmarkCountMap[page._id.toString()] ?? 0)
                : 0,
          };

          const pageInfo = !isIPageInfoForEntity(basicPageInfo)
            ? (basicPageInfo satisfies IPageInfoForEmpty)
            : ({
                ...basicPageInfo,
                revisionShortBody:
                  shortBodiesMap != null
                    ? (shortBodiesMap[page._id.toString()] ?? undefined)
                    : undefined,
              } satisfies IPageInfoForListing);

          idToPageInfoMap[page._id.toString()] = pageInfo;
        }

        return res.apiv3(idToPageInfoMap);
      } catch (err) {
        logger.error('Error occurred while fetching page informations.', err);
        return res.apiv3Err(
          new ErrorV3('Error occurred while fetching page informations.'),
        );
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/item:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/item
   *     description: Get a single page item for tree display
   *     parameters:
   *       - name: id
   *         in: query
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Page item data
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 item:
   *                   $ref: '#/components/schemas/PageForTreeItem'
   */
  router.get(
    '/item',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequired,
    validator.pageIdOrPathRequired,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { id } = req.query;

      if (id == null) {
        return res.apiv3Err(new ErrorV3('id parameter is required'));
      }

      try {
        const Page = mongoose.model<HydratedDocument<PageDocument>, PageModel>(
          'Page',
        );
        const page = await Page.findByIdAndViewer(
          id as string,
          req.user,
          null,
          true,
        );

        if (page == null) {
          return res.apiv3Err(new ErrorV3('Page not found'), 404);
        }

        const item: IPageForTreeItem = {
          _id: page._id.toString(),
          path: page.path,
          parent: page.parent,
          revision: page.revision, // required to create an IPageToDeleteWithMeta instance
          descendantCount: page.descendantCount,
          grant: page.grant,
          isEmpty: page.isEmpty,
          wip: page.wip ?? false,
        };

        return res.apiv3({ item });
      } catch (err) {
        logger.error('Error occurred while fetching page item.', err);
        return res.apiv3Err(
          new ErrorV3('Error occurred while fetching page item.'),
        );
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/my-wip:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/my-wip
   *     description: Get the WIP (work-in-progress) pages of the logged-in user
   *     responses:
   *       200:
   *         description: Get the WIP pages of the logged-in user
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 pages:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/PageForTreeItem'
   *       401:
   *         description: Not logged in
   */
  router.get(
    '/my-wip',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequiredStrictly,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      // biome-ignore lint/style/noNonNullAssertion: user must be set by loginRequiredStrictly
      const user = req.user!;

      try {
        const pages = await pageListingService.findWipPagesByUser(
          user._id.toString(),
          user,
        );
        return res.apiv3({ pages });
      } catch (err) {
        logger.error('Error occurred while finding WIP pages.', err);
        return res.apiv3Err(
          new ErrorV3('Error occurred while finding WIP pages.'),
        );
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/recent-under-path:
   *   get:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/recent-under-path
   *     description: Get the most-recently-updated pages under a path prefix, filtered by the viewer's permissions
   *     parameters:
   *       - name: prefix
   *         in: query
   *         description: Path prefix to search under (must start with "/"). Defaults to the Classroom source path when omitted.
   *         schema:
   *           type: string
   *       - name: limit
   *         in: query
   *         description: Maximum number of pages to return (1-50, default 20)
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Recent pages under the prefix
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 pages:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/PageForTreeItem'
   *       400:
   *         description: Invalid prefix or limit
   *       403:
   *         description: Not logged in
   */
  router.get(
    '/recent-under-path',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequiredStrictly,
    validator.recentUnderPath,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const prefix =
        (req.query.prefix as string | undefined) ??
        DEFAULT_HOME_CLASSROOM_PATH_PREFIX;
      const limit =
        (req.query.limit as number | undefined) ??
        RECENT_UNDER_PATH_LIMIT_DEFAULT;

      try {
        const pages = await pageListingService.findRecentPagesUnderPath(
          prefix,
          req.user,
          limit,
        );
        return res.apiv3({ pages });
      } catch (err) {
        logger.error(
          'Error occurred while finding recent pages under path.',
          err,
        );
        return res.apiv3Err(
          new ErrorV3('Error occurred while finding recent pages under path.'),
        );
      }
    },
  );

  /**
   * @swagger
   *
   * /page-listing/resolve-paths:
   *   post:
   *     tags: [PageListing]
   *     security:
   *       - bearer: []
   *       - accessTokenInQuery: []
   *       - accessTokenHeaderAuth: []
   *     summary: /page-listing/resolve-paths
   *     description: Resolve a list of page paths to their viewer-visible metadata, preserving input order and dropping missing or forbidden paths. Read-only; records no audit activity.
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               paths:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Resolved pages in input order
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 pages:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/PageForTreeItem'
   *       400:
   *         description: paths is not an array or exceeds the allowed length
   *       403:
   *         description: Not logged in
   */
  router.post(
    '/resolve-paths',
    accessTokenParser([SCOPE.READ.FEATURES.PAGE], { acceptLegacy: true }),
    loginRequiredStrictly,
    validator.resolvePaths,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { paths } = req.body as { paths: string[] };

      try {
        const pages = await pageListingService.resolvePagesByPaths(
          paths,
          req.user,
        );
        return res.apiv3({ pages });
      } catch (err) {
        logger.error('Error occurred while resolving pages by paths.', err);
        return res.apiv3Err(
          new ErrorV3('Error occurred while resolving pages by paths.'),
        );
      }
    },
  );

  return router;
};

export default routerFactory;
