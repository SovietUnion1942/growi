import type { IUserHasId } from '@growi/core';
import { ErrorV3 } from '@growi/core/dist/models';
import type { Request } from 'express';
import { Router } from 'express';
import { body, param } from 'express-validator';
import multer from 'multer';

import { SupportedAction } from '~/interfaces/activity';
import type Crowi from '~/server/crowi';
import { generateAddActivityMiddleware } from '~/server/middlewares/add-activity';
import adminRequiredFactory from '~/server/middlewares/admin-required';
import { apiV3FormValidator } from '~/server/middlewares/apiv3-form-validator';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import { validateImageContentType } from '~/server/routes/attachment/image-content-type-validator';
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
  /**
   * Base temp-file directory, mirroring the shared multer wiring already
   * used across apiv3 routes (e.g. `customize-setting.js`'s
   * `/upload-brand-logo`: `multer({ dest: `${crowi.tmpDir}uploads` })`).
   * This route builds its own `multer` instance from it rather than reusing
   * a central singleton, since `crowi.tmpDir` is the only piece those routes
   * actually share (there is no shared `uploads` middleware export).
   */
  tmpDir: string;
}

interface AuthorizedRequest extends Request {
  user?: IUserHasId;
}

/**
 * Rejects a request carrying a disallowed image MIME type (requirement
 * 6.3), before any BadgeTypeService call. Reuses the same
 * `validateImageContentType` helper as the profile-picture upload route
 * (`attachments.uploadProfileImage`) rather than reimplementing MIME
 * checking. A request with no file at all (JSON-only create/update) passes
 * through untouched — the image upload is optional.
 */
function validateUploadedImageOrRespond(
  req: AuthorizedRequest,
  res: ApiV3Response,
): boolean {
  if (req.file == null) {
    return true;
  }

  const { isValid, error } = validateImageContentType(req.file.mimetype);
  if (!isValid) {
    res.apiv3Err(
      new ErrorV3(
        error ?? 'Invalid file type.',
        'badge-type-invalid-image-type',
      ),
      400,
    );
    return false;
  }

  return true;
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

  /**
   * Same multer config shape as `upload-brand-logo`
   * (`apps/app/src/server/routes/apiv3/customize-setting.js`): a disk-backed
   * temp store under `crowi.tmpDir`, expecting a single `file` field. Placed
   * AFTER `adminRequired` in both routes below (not before, unlike
   * `upload-brand-logo`, which needs the body parsed early for its
   * access-token check) — a non-admin caller is rejected before any
   * multipart body is parsed or written to disk.
   */
  const uploads = multer({ dest: `${crowi.tmpDir}uploads` });

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
    // multer parses the optional multipart image upload (requirement 6.2)
    // and populates req.body from the form's other fields; placed before
    // addActivity/validators so both see a normalized req.body regardless of
    // whether the request was JSON or multipart/form-data.
    uploads.single('file'),
    // addActivity before the validators: validation failures are audited as
    // ACTION_UNSETTLED (see apps/app/.claude/rules/activity-recording.md).
    addActivity,
    validator.create,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      if (!validateUploadedImageOrRespond(req, res)) {
        return;
      }

      const {
        name,
        description,
        iconKey,
        category,
        levels = [],
      } = req.body as CreateBadgeTypeInput;

      try {
        const badgeType = await createBadgeType(
          {
            name,
            description,
            iconKey,
            category,
            levels,
            ...(req.file != null && { iconImageFile: req.file }),
          },
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
    // multer parses the optional multipart image upload (requirement 6.2),
    // same placement rationale as POST / above.
    uploads.single('file'),
    // addActivity before the validators: validation failures are audited as
    // ACTION_UNSETTLED (see apps/app/.claude/rules/activity-recording.md).
    addActivity,
    validator.update,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      if (!validateUploadedImageOrRespond(req, res)) {
        return;
      }

      const { id } = req.params as { id: string };
      const { name, description, iconKey, levels } =
        req.body as UpdateBadgeTypeInput;

      const input: UpdateBadgeTypeInput = {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(iconKey !== undefined && { iconKey }),
        ...(levels !== undefined && { levels }),
        ...(req.file != null && { iconImageFile: req.file }),
      };

      try {
        // uploadedBy (req.user) is only passed when an image file is being
        // replaced (requirement 6.4) — updateBadgeType requires it in that
        // case, and every other call site omits it (see badge-type-service.ts).
        const badgeType =
          req.file != null
            ? await updateBadgeType(
                id,
                input,
                crowi as unknown as Crowi,
                req.user as IUserHasId,
              )
            : await updateBadgeType(id, input, crowi as unknown as Crowi);

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
