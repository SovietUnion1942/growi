import type { IUserHasId } from '@growi/core';
import { ErrorV3 } from '@growi/core/dist/models';
import type { Request } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';

import { SupportedAction } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import { generateAddActivityMiddleware } from '~/server/middlewares/add-activity';
import adminRequiredFactory from '~/server/middlewares/admin-required';
import { apiV3FormValidator } from '~/server/middlewares/apiv3-form-validator';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

import {
  BadgeTypeNotFoundError,
  BadgeTypeValidationError,
} from '../services/badge-type-errors';
import type {
  CreateBadgeTypeInput,
  UpdateBadgeTypeInput,
} from '../services/badge-type-service';
import {
  createBadgeType,
  deleteBadgeType,
  listBadgeTypes,
  updateBadgeType,
} from '../services/badge-type-service';

const logger = loggerFactory('growi:routes:apiv3:badge-type');

/**
 * Minimal shape of the `crowi` instance this route depends on. Kept
 * intentionally narrow (rather than importing the full `Crowi` type) so the
 * route can be constructed and tested in isolation without pulling in the
 * whole application bootstrap, matching this task's boundary: this file
 * builds a self-contained, independently mountable router and is not wired
 * into the central apiv3 router (`routes/apiv3/index.js`) — that wiring is a
 * later, explicit integration task.
 */
export interface BadgeTypeRouteCrowi {
  events: {
    activity: {
      emit: (event: 'update', id: unknown, parameters: unknown) => void;
    };
  };
}

interface AuthorizedRequest extends Request {
  user?: IUserHasId;
}

/**
 * Builds the `/badge-types` apiv3 router (requirement 1.1-1.6).
 *
 * Middleware chain per design.md: loginRequiredStrictly -> adminRequired ->
 * addActivity -> body/param validators -> apiV3FormValidator -> handler.
 * `addActivity` is placed after auth (a 403 from adminRequired is not
 * audited) and before the validators (a validation failure by an
 * authenticated admin IS audited as ACTION_UNSETTLED), per
 * `apps/app/.claude/rules/activity-recording.md`.
 */
export const setup = (crowi: BadgeTypeRouteCrowi): Router => {
  const router = Router();

  const loginRequiredStrictly = loginRequiredFactory(
    crowi as unknown as Parameters<typeof loginRequiredFactory>[0],
  );
  const adminRequired = adminRequiredFactory(
    crowi as unknown as Parameters<typeof adminRequiredFactory>[0],
    (_req, res, _next) =>
      (res as ApiV3Response).apiv3Err(
        new ErrorV3('Forbidden. You are not an admin user.', 'admin-required'),
        403,
      ),
  );
  const addActivity = generateAddActivityMiddleware();

  const activityEvent = crowi.events.activity;

  const levelValidator = (field: string) => [
    body(`${field}.*.level`, 'level is required and must be an integer')
      .exists()
      .isInt(),
    body(`${field}.*.name`, 'name is required and must be a non-empty string')
      .exists({ checkFalsy: true })
      .isString(),
    body(
      `${field}.*.iconKey`,
      'iconKey is required and must be a non-empty string',
    )
      .exists({ checkFalsy: true })
      .isString(),
    body(`${field}.*.threshold`, 'threshold is required and must be an integer')
      .exists()
      .isInt(),
  ];

  const validator = {
    create: [
      body('name', 'name is required and must be a non-empty string')
        .exists({ checkFalsy: true })
        .isString(),
      body('description', 'description is required and must be a string')
        .exists()
        .isString(),
      body('iconKey', 'iconKey is required and must be a non-empty string')
        .exists({ checkFalsy: true })
        .isString(),
      body(
        'category',
        "category is required and must be 'automatic' or 'manual'",
      )
        .exists({ checkFalsy: true })
        .isIn(['automatic', 'manual']),
      body('levels', 'levels must be an array').optional().isArray(),
      ...levelValidator('levels'),
    ],
    update: [
      param('id', 'id is required').trim().exists({ checkFalsy: true }),
      body('name', 'name must be a non-empty string')
        .optional()
        .isString()
        .notEmpty(),
      body('description', 'description must be a string').optional().isString(),
      body('iconKey', 'iconKey must be a non-empty string')
        .optional()
        .isString()
        .notEmpty(),
      body('levels', 'levels must be an array').optional().isArray(),
      ...levelValidator('levels'),
    ],
    delete: [param('id', 'id is required').trim().exists({ checkFalsy: true })],
  };

  router.get(
    '/',
    loginRequiredStrictly,
    adminRequired,
    async (_req: AuthorizedRequest, res: ApiV3Response) => {
      try {
        const badgeTypes = await listBadgeTypes(false);
        return res.apiv3({ badgeTypes });
      } catch (err) {
        const msg = 'Error occurred in fetching badge type list';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'badge-type-list-fetch-failed'));
      }
    },
  );

  /**
   * `GET /badge-types/catalog` (task 10.3, requirement 4.5): a lightweight,
   * NON-admin-gated catalog for `UserPicture`'s badge tooltip resolution.
   *
   * The badge-type catalog CRUD above (`GET /`, `POST /`, `PUT /:id`,
   * `DELETE /:id`) is admin-only per requirement 1.6, but a badge tooltip
   * must be resolvable by ANY logged-in viewer of a user's profile page
   * (requirement 4.5 makes no admin distinction). Rather than relax
   * `GET /`'s own admin gate (which would leak the full admin management
   * payload -- `iconKey`, `category`, `levels`, `createdBy`, soft-delete
   * state -- to non-admins), this route exposes only the single field the
   * tooltip is actually missing: `description`. `name` is not included here
   * because it is already carried end-to-end by `User.badgeSummaryCached`
   * (`IUserBadgeSummaryEntry.name`) and therefore already reaches
   * `UserPicture`'s `badges` prop without a catalog lookup; only the
   * `BadgeType`-level `description` (requirement 4.5's "説明") has no path
   * to the client today. See design.md's Implementation Notes on
   * `UserPicture(拡張)` for the "resolve from a client-side catalog fetched
   * once" design intent this route implements.
   */
  router.get(
    '/catalog',
    loginRequiredStrictly,
    async (_req: AuthorizedRequest, res: ApiV3Response) => {
      try {
        const badgeTypes = await listBadgeTypes(false);
        const catalog = badgeTypes.map(({ _id, description }) => ({
          _id,
          description,
        }));
        return res.apiv3({ badgeTypes: catalog });
      } catch (err) {
        const msg = 'Error occurred in fetching the badge type catalog';
        logger.error(msg, err);
        return res.apiv3Err(
          new ErrorV3(msg, 'badge-type-catalog-fetch-failed'),
        );
      }
    },
  );

  router.post(
    '/',
    loginRequiredStrictly,
    adminRequired,
    // addActivity before the validators: validation failures are audited as
    // ACTION_UNSETTLED (see apps/app/.claude/rules/activity-recording.md).
    addActivity,
    validator.create,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const {
        name,
        description,
        iconKey,
        category,
        levels = [],
      } = req.body as CreateBadgeTypeInput;

      try {
        const badgeType = await createBadgeType(
          { name, description, iconKey, category, levels },
          req.user as IUserHasId,
          crowi as unknown as Crowi,
        );

        const parameters = {
          action: SupportedAction.ACTION_ADMIN_BADGE_TYPE_CREATE,
        };
        activityEvent.emit('update', res.locals.activity._id, parameters);

        return res.apiv3({ badgeType }, 201);
      } catch (err) {
        if (err instanceof BadgeTypeValidationError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'badge-type-invalid'),
            400,
          );
        }
        const msg = 'Error occurred in creating a badge type';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'badge-type-create-failed'));
      }
    },
  );

  router.put(
    '/:id',
    loginRequiredStrictly,
    adminRequired,
    // addActivity before the validators: validation failures are audited as
    // ACTION_UNSETTLED (see apps/app/.claude/rules/activity-recording.md).
    addActivity,
    validator.update,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { id } = req.params as { id: string };
      const { name, description, iconKey, levels } =
        req.body as UpdateBadgeTypeInput;

      const input: UpdateBadgeTypeInput = {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(iconKey !== undefined && { iconKey }),
        ...(levels !== undefined && { levels }),
      };

      try {
        const badgeType = await updateBadgeType(
          id,
          input,
          crowi as unknown as Crowi,
        );

        const parameters = {
          action: SupportedAction.ACTION_ADMIN_BADGE_TYPE_UPDATE,
        };
        activityEvent.emit('update', res.locals.activity._id, parameters);

        return res.apiv3({ badgeType });
      } catch (err) {
        if (err instanceof BadgeTypeNotFoundError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'badge-type-not-found'),
            404,
          );
        }
        if (err instanceof BadgeTypeValidationError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'badge-type-invalid'),
            400,
          );
        }
        const msg = 'Error occurred in updating a badge type';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'badge-type-update-failed'));
      }
    },
  );

  router.delete(
    '/:id',
    loginRequiredStrictly,
    adminRequired,
    // addActivity before the validators: validation failures are audited as
    // ACTION_UNSETTLED (see apps/app/.claude/rules/activity-recording.md).
    addActivity,
    validator.delete,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { id } = req.params as { id: string };

      try {
        await deleteBadgeType(id);

        const parameters = {
          action: SupportedAction.ACTION_ADMIN_BADGE_TYPE_DELETE,
        };
        activityEvent.emit('update', res.locals.activity._id, parameters);

        return res.apiv3({ isDeleted: true });
      } catch (err) {
        if (err instanceof BadgeTypeNotFoundError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'badge-type-not-found'),
            404,
          );
        }
        const msg = 'Error occurred in deleting a badge type';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'badge-type-delete-failed'));
      }
    },
  );

  return router;
};
