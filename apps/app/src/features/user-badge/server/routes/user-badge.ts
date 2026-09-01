import type { IUserHasId } from '@growi/core';
import { ErrorV3 } from '@growi/core/dist/models';
import type { Request } from 'express';
import { Router } from 'express';
import { body, query } from 'express-validator';

import type Crowi from '~/server/crowi';
import { generateAddActivityMiddleware } from '~/server/middlewares/add-activity';
import adminRequiredFactory from '~/server/middlewares/admin-required';
import { apiV3FormValidator } from '~/server/middlewares/apiv3-form-validator';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

import { isUserBadgeEnabled } from '../is-user-badge-enabled';
import {
  grantManualBadge,
  listUserBadges,
  revokeManualBadge,
} from '../services/badge-grant-service';
import {
  BadgeAlreadyGrantedError,
  BadgeGrantManualCategoryMismatchError,
  BadgeTypeNotFoundError,
  UserBadgeNotFoundError,
} from '../services/badge-type-errors';

const logger = loggerFactory('growi:routes:apiv3:user-badge');

/**
 * Minimal shape of the `crowi` instance this route depends on directly (for
 * building `loginRequiredStrictly`/`adminRequired`). Deliberately narrow --
 * matches `badge-type.ts`'s `BadgeTypeRouteCrowi` for the same reason: this
 * file builds a self-contained, independently mountable router and is not
 * wired into the central apiv3 router (`routes/apiv3/index.js`) -- that
 * wiring, where a real `Crowi` instance is available, is task 9.3.
 *
 * `grantManualBadge` (task 3.3/3.4, tightened at this task per tasks.md's
 * Implementation Notes) requires a real `Crowi` instance to emit the
 * `ACTION_USER_BADGE_GRANT` Activity/notification. This route's own `crowi`
 * parameter is threaded straight through to it, cast to the full `Crowi`
 * type at that single call site -- the same narrow-interface-at-the-route,
 * full-type-at-the-service-boundary split `badge-type.ts` already uses for
 * `adminRequiredFactory`/`loginRequiredFactory`.
 */
export interface UserBadgeRouteCrowi {
  activityService?: unknown;
  events?: unknown;
}

interface AuthorizedRequest extends Request {
  user?: IUserHasId;
}

/**
 * Builds the `/user-badges` apiv3 router (requirements 3.1-3.5, 4.3).
 *
 * `GET` is available to any logged-in user (viewing another user's granted
 * badges on their profile is not an admin-only action, per design.md's API
 * Contract table: only `loginRequiredStrictly`, no `adminRequired`). `POST`
 * (manual grant) is `adminRequired`, per requirement 3.3.
 *
 * `addActivity` is wired on `POST` per this repo's audit convention (a
 * validation failure by an authenticated admin is still audited as
 * ACTION_UNSETTLED, see `apps/app/.claude/rules/activity-recording.md`), but
 * this route deliberately does NOT itself settle that activity row with
 * `activityEvent.emit(...)` the way `badge-type.ts` does for
 * ADMIN_BADGE_TYPE_*: the notification-worthy `ACTION_USER_BADGE_GRANT`
 * Activity is already created by `BadgeGrantService.grantManualBadge` itself
 * (via the `crowi` passed through below), which is the single write gateway
 * for the "grant -> cache -> notify" sequence (design.md). Emitting a second
 * settle here would just create a duplicate, unrelated Activity document.
 */
export const setup = (crowi: UserBadgeRouteCrowi): Router => {
  const router = Router();

  // Feature gate (app:userBadgeEnabled): every route below 404s when off.
  router.use((_req, res, next) => {
    if (!isUserBadgeEnabled()) {
      return (res as ApiV3Response).apiv3Err(
        new ErrorV3('User badges are disabled', 'user-badge-disabled'),
        404,
      );
    }
    next();
  });

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

  const validator = {
    list: [
      query(
        'targetUserId',
        'targetUserId is required and must be a non-empty string',
      )
        .exists({ checkFalsy: true })
        .isString(),
      query('includeRevoked', 'includeRevoked must be a boolean')
        .optional()
        .isBoolean(),
    ],
    grant: [
      body(
        'badgeTypeId',
        'badgeTypeId is required and must be a non-empty string',
      )
        .exists({ checkFalsy: true })
        .isString(),
      body('userId', 'userId is required and must be a non-empty string')
        .exists({ checkFalsy: true })
        .isString(),
      body('note', 'note must be a string').optional().isString(),
    ],
  };

  router.get(
    '/',
    loginRequiredStrictly,
    validator.list,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { targetUserId, includeRevoked } = req.query as {
        targetUserId: string;
        includeRevoked?: string;
      };

      // `includeRevoked=true` is only honored for admin callers (requirement
      // 7.7); for anyone else (including a logged-in non-admin), the param is
      // silently ignored rather than surfaced as an error, and only active
      // (non-revoked) records are ever returned -- design.md's API Contract
      // table for `GET /user-badges`.
      const shouldIncludeRevoked =
        includeRevoked === 'true' && req.user?.admin === true;

      try {
        const userBadges = await listUserBadges(targetUserId);
        const visibleUserBadges = shouldIncludeRevoked
          ? userBadges
          : userBadges.filter((userBadge) => userBadge.revokedAt == null);
        return res.apiv3({ userBadges: visibleUserBadges });
      } catch (err) {
        const msg = 'Error occurred in fetching the user badge list';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'user-badge-list-fetch-failed'));
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
    validator.grant,
    apiV3FormValidator,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { badgeTypeId, userId, note } = req.body as {
        badgeTypeId: string;
        userId: string;
        note?: string;
      };

      try {
        const userBadge = await grantManualBadge(
          { badgeTypeId, userId, ...(note !== undefined && { note }) },
          req.user as IUserHasId,
          // `crowi` is narrowed to `UserBadgeRouteCrowi` at this route's
          // boundary (see this file's doc comment) but `grantManualBadge`
          // needs the full `Crowi` type; the mount site in task 9.3
          // supplies a real one.
          crowi as unknown as Crowi,
        );

        return res.apiv3({ userBadge }, 201);
      } catch (err) {
        if (err instanceof BadgeGrantManualCategoryMismatchError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'user-badge-manual-category-mismatch'),
            422,
          );
        }
        if (err instanceof BadgeTypeNotFoundError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'user-badge-badge-type-not-found'),
            404,
          );
        }
        if (err instanceof BadgeAlreadyGrantedError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'user-badge-already-granted'),
            409,
          );
        }
        const msg = 'Error occurred in granting a user badge';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'user-badge-grant-failed'));
      }
    },
  );

  router.delete(
    '/:id',
    loginRequiredStrictly,
    adminRequired,
    // addActivity before the (implicit, param-only) validation, same as
    // POST: an authenticated admin's failed revoke attempt is still audited
    // as ACTION_UNSETTLED (apps/app/.claude/rules/activity-recording.md).
    addActivity,
    async (req: AuthorizedRequest, res: ApiV3Response) => {
      const { id } = req.params;

      try {
        const userBadge = await revokeManualBadge(id, req.user as IUserHasId);
        return res.apiv3({ userBadge });
      } catch (err) {
        if (err instanceof UserBadgeNotFoundError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'user-badge-not-found'),
            404,
          );
        }
        if (err instanceof BadgeGrantManualCategoryMismatchError) {
          return res.apiv3Err(
            new ErrorV3(err.message, 'user-badge-manual-category-mismatch'),
            422,
          );
        }
        const msg = 'Error occurred in revoking a user badge';
        logger.error(msg, err);
        return res.apiv3Err(new ErrorV3(msg, 'user-badge-revoke-failed'));
      }
    },
  );

  return router;
};
