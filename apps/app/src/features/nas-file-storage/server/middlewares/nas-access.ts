import type { IUser } from '@growi/core';
import { ErrorV3 } from '@growi/core/dist/models';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { HydratedDocument, Types } from 'mongoose';

import ExternalUserGroup from '~/features/external-user-group/server/models/external-user-group';
import ExternalUserGroupRelation from '~/features/external-user-group/server/models/external-user-group-relation';
import { nasStorageConfig } from '~/features/nas-file-storage/server/config/nas-storage-config';
import type Crowi from '~/server/crowi';
import loginRequiredFactory from '~/server/middlewares/login-required';
import UserGroup from '~/server/models/user-group';
import UserGroupRelation from '~/server/models/user-group-relation';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

const logger = loggerFactory(
  'growi:features:nas-file-storage:middleware:nas-access',
);

type NasAccessRequest = Request & {
  user?: HydratedDocument<IUser>;
  // Request-scoped cache of the membership decision (Req 6.3). The gate runs
  // once per request at router level, so this mostly guards against a second
  // invocation if the middleware is ever chained twice.
  nasAccessGranted?: boolean;
};

/**
 * Resolve `groupName` against both the internal `UserGroup` collection and the
 * external `ExternalUserGroup` collection, then report whether `userId` belongs
 * to any of the matched groups. Membership in EITHER an internal OR an external
 * group with that name grants access.
 *
 * When the name matches no group at all (operator misconfiguration) this returns
 * `false` — a configured-but-unresolvable restriction denies rather than opens
 * access.
 */
const isUserInNamedGroup = async (
  userId: Types.ObjectId,
  groupName: string,
): Promise<boolean> => {
  const [internalGroups, externalGroups] = await Promise.all([
    UserGroup.find({ name: groupName }).select('_id').exec(),
    ExternalUserGroup.find({ name: groupName }).select('_id').exec(),
  ]);

  if (internalGroups.length === 0 && externalGroups.length === 0) {
    return false;
  }

  const membershipChecks: Promise<number>[] = [];

  if (internalGroups.length > 0) {
    membershipChecks.push(
      UserGroupRelation.countDocuments({
        relatedGroup: { $in: internalGroups.map((g) => g._id) },
        relatedUser: userId,
      }).exec(),
    );
  }
  if (externalGroups.length > 0) {
    membershipChecks.push(
      ExternalUserGroupRelation.countDocuments({
        relatedGroup: { $in: externalGroups.map((g) => g._id) },
        relatedUser: userId,
      }).exec(),
    );
  }

  const counts = await Promise.all(membershipChecks);
  return counts.some((count) => count > 0);
};

/**
 * Build the NAS access-control middleware chain, applied at router level to ALL
 * NAS routes so every operation shares one access condition (Req 6.2).
 *
 * The chain is:
 *   1. `loginRequiredFactory(crowi)` — guests are NOT allowed (Req 6.1). An
 *      unauthenticated request is answered with 401 via `apiv3Err`.
 *   2. group gate — when `GROWI_NAS_GROUP` is set, the request user must belong
 *      to an internal or external group of that name, else 403 (Req 6.3).
 *      When it is unset, every logged-in user passes (Req 6.4).
 *
 * `crowi` is received as an argument; the `Crowi` class is never imported.
 */
export const createNasAccessMiddleware = (crowi: Crowi): RequestHandler[] => {
  const loginRequired = loginRequiredFactory(
    crowi,
    false,
    (_req: Request, res: Response) => {
      (res as ApiV3Response).apiv3Err(
        new ErrorV3(
          'Login is required to access NAS storage',
          'nas_storage.login_required',
        ),
        401,
      );
    },
  );

  const groupGate = async (
    req: NasAccessRequest,
    res: ApiV3Response,
    next: NextFunction,
  ): Promise<void> => {
    if (req.nasAccessGranted === true) {
      next();
      return;
    }

    const groupName = nasStorageConfig.groupName();
    if (groupName == null) {
      req.nasAccessGranted = true;
      next();
      return;
    }

    const user = req.user;
    if (user == null) {
      // Defensive: loginRequired should already have rejected this.
      res.apiv3Err(
        new ErrorV3(
          'Login is required to access NAS storage',
          'nas_storage.login_required',
        ),
        401,
      );
      return;
    }

    try {
      const isMember = await isUserInNamedGroup(user._id, groupName);
      if (isMember) {
        req.nasAccessGranted = true;
        next();
        return;
      }

      req.nasAccessGranted = false;
      res.apiv3Err(
        new ErrorV3(
          'You are not allowed to access NAS storage',
          'nas_storage.forbidden',
        ),
        403,
      );
    } catch (err) {
      logger.error('Failed to evaluate NAS storage access', err);
      res.apiv3Err(
        new ErrorV3(
          'Failed to evaluate NAS storage access',
          'nas_storage.access_check_failed',
        ),
        500,
      );
    }
  };

  return [loginRequired, groupGate as RequestHandler];
};
