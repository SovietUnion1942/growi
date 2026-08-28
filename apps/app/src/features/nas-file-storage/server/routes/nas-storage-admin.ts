import { ErrorV3 } from '@growi/core/dist/models';
import type { Request, RequestHandler, Response, Router } from 'express';
import express from 'express';

import type Crowi from '~/server/crowi';
import adminRequiredFactory from '~/server/middlewares/admin-required';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';

import { nasStorageConfig } from '../config/nas-storage-config';
import type {
  NasRootStatus,
  RootHealthChecker,
} from '../services/root-health-checker';
import { rootHealthChecker } from '../services/root-health-checker';

/**
 * Success body of `GET /api/v3/admin/nas-storage/status` (design "Route 層 ->
 * API Contract（setupNasStorageAdmin）"). `status` carries the full
 * `NasRootStatus` union — including the `misconfigured` reason — so the admin UI
 * can render the exact configuration problem (Req 1.3 / 1.4).
 */
export interface NasStorageAdminStatusResponse {
  /**
   * Whether the feature is actually serving. Derived from the root health state:
   * only `ready` means the NAS surface is usable. `unavailable` (transient mount
   * drop), `misconfigured` and `unconfigured` all report `false`; the nuance for
   * the admin lives in `status`.
   */
  enabled: boolean;
  status: NasRootStatus;
  /** Single group the area is restricted to, or null when unrestricted. */
  groupRestriction: string | null;
  /** Per-file upload cap in bytes, or null when no limit is configured. */
  maxFileSizeBytes: number | null;
}

export interface SetupNasStorageAdminDeps {
  /** Injectable for tests; defaults to the process-wide health checker. */
  health?: RootHealthChecker;
}

/**
 * apiv3 router for the admin-only NAS storage status endpoint (design "Route 層
 * -> API Contract（setupNasStorageAdmin）"). Mounted at
 * `/api/v3/admin/nas-storage` on `routerForAdmin` by task 4.1.
 *
 * The auth chain mirrors the sibling admin feature router
 * (`features/growi-vault/server/routes/vault-admin.ts`): `loginRequired` then
 * `adminRequired`. Both are given a fallback that answers with an apiv3 error so
 * an XHR from the admin UI sees 401 / 403 (per the API Contract) rather than the
 * middleware default redirect. `crowi` is only used to build those middlewares;
 * the `Crowi` class is never imported.
 */
export const setupNasStorageAdmin = (
  crowi: Crowi,
  deps: SetupNasStorageAdminDeps = {},
): Router => {
  const health = deps.health ?? rootHealthChecker;

  const router = express.Router();

  const loginFallback: RequestHandler = (_req, res) => {
    (res as ApiV3Response).apiv3Err(
      new ErrorV3('Login required', 'LOGIN_REQUIRED'),
      401,
    );
  };
  const adminFallback: RequestHandler = (_req, res) => {
    (res as ApiV3Response).apiv3Err(
      new ErrorV3('Admin required', 'ADMIN_REQUIRED'),
      403,
    );
  };

  const loginRequired = loginRequiredFactory(crowi, false, loginFallback);
  const adminRequired = adminRequiredFactory(crowi, adminFallback);

  router.get(
    '/status',
    loginRequired,
    adminRequired,
    (_req: Request, res: Response) => {
      const status = health.getStatus();
      const body: NasStorageAdminStatusResponse = {
        enabled: status.state === 'ready',
        status,
        groupRestriction: nasStorageConfig.groupName() ?? null,
        maxFileSizeBytes: nasStorageConfig.maxFileSize() ?? null,
      };
      (res as ApiV3Response).apiv3(body);
    },
  );

  return router;
};
