import { ErrorV3 } from '@growi/core/dist/models';
import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Router,
} from 'express';
import express from 'express';
import multer from 'multer';
import autoReap from 'multer-autoreap';

import type {
  NasError,
  NasErrorCode,
  NasListQuery,
} from '~/features/nas-file-storage/interfaces';
import type Crowi from '~/server/crowi';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

import { nasStorageConfig } from '../config/nas-storage-config';
import { createNasAccessMiddleware } from '../middlewares/nas-access';
import type { NasStorageService } from '../services/nas-storage-service';
import { getNasStorageService } from '../services/nas-storage-service';
import type { RootHealthChecker } from '../services/root-health-checker';
import { rootHealthChecker } from '../services/root-health-checker';

const logger = loggerFactory(
  'growi:features:nas-file-storage:routes:nas-storage',
);

const LIMIT_MIN = 1;
const LIMIT_MAX = 500;
const LIMIT_DEFAULT = 100;

/**
 * Mechanical `NasErrorCode` -> HTTP status map (design "Error Handling ->
 * Error Categories and Responses" + the API Contract table). Directory/target
 * type mismatches collapse to 409; range violations to 422; the root being
 * unreachable to 503.
 */
const STATUS_BY_CODE: Readonly<Record<NasErrorCode, number>> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_ENTRIES: 409,
  TOO_LARGE: 413,
  OUT_OF_ROOT: 422,
  INVALID_PATH: 400,
  IS_DIRECTORY: 409,
  NOT_A_DIRECTORY: 409,
  PERMISSION_DENIED: 403,
  STORAGE_UNAVAILABLE: 503,
  UNKNOWN: 500,
};

interface NasErrorHttp {
  status: number;
  extra?: Record<string, number | string>;
}

/**
 * Translate a normalized `NasError` into an HTTP status plus the extra response
 * fields the contract attaches per code (`suggestedName` on CONFLICT,
 * `limitBytes` on TOO_LARGE, `limitEntries` on TOO_MANY_ENTRIES).
 */
export const nasErrorToHttp = (error: NasError): NasErrorHttp => {
  const status = STATUS_BY_CODE[error.code] ?? 500;
  const extra: Record<string, number | string> = {};
  if (error.suggestedName != null) {
    extra.suggestedName = error.suggestedName;
  }
  if (error.limitBytes != null) {
    extra.limitBytes = error.limitBytes;
  }
  if (error.limitEntries != null) {
    extra.limitEntries = error.limitEntries;
  }
  return {
    status,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
};

const respondNasError = (res: ApiV3Response, error: NasError): void => {
  const { status, extra } = nasErrorToHttp(error);
  // `message` is already an i18n key (nas_storage.error.*); extra fields ride
  // in the apiv3Err `info` slot so the client can read them at top level.
  res.apiv3Err(new ErrorV3(error.message, error.code), status, extra);
};

const parseBool = (value: unknown): boolean => {
  return value === 'true' || value === '1' || value === true;
};

const asString = (value: unknown): string | undefined => {
  return typeof value === 'string' ? value : undefined;
};

const clampLimit = (raw: unknown): number => {
  const parsed = Number.parseInt(asString(raw) ?? '', 10);
  if (!Number.isFinite(parsed)) {
    return LIMIT_DEFAULT;
  }
  return Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, parsed));
};

/**
 * Build a `Content-Disposition: attachment` value that keeps the original name
 * (RFC 5987 `filename*` for non-ASCII, plus a quote-stripped ASCII fallback).
 */
const contentDisposition = (name: string): string => {
  const asciiFallback = name.replace(/["\\]/g, '').replace(/[\r\n]/g, '');
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

export interface SetupNasStorageDeps {
  /** Injectable for tests; defaults to the env-wired singleton service. */
  service?: NasStorageService;
  /** Injectable for tests; defaults to the process-wide health checker. */
  health?: RootHealthChecker;
}

/**
 * apiv3 router for the end-user NAS storage endpoints (design "Route 層 -> API
 * Contract（setupNasStorage）"). Mounted at `/api/v3/nas-storage` by task 4.1.
 *
 * Every route is gated at router level by `nasAccess` (login + optional single
 * group, Req 6.2), then by the feature-enabled gate: when the root health state
 * is neither `ready` nor `unavailable` the whole surface answers 404 so a
 * disabled feature is indistinguishable from a missing one (Req 7.3).
 *
 * `crowi` is taken as an argument for `nasAccess` and `crowi.tmpDir`; the
 * `Crowi` class is never imported.
 */
export const setupNasStorage = (
  crowi: Crowi,
  deps: SetupNasStorageDeps = {},
): Router => {
  const service = deps.service ?? getNasStorageService();
  const health = deps.health ?? rootHealthChecker;

  const router = express.Router();

  const maxFileSize = nasStorageConfig.maxFileSize();
  const upload = multer({
    dest: `${crowi.tmpDir}uploads`,
    limits: { fileSize: maxFileSize ?? Number.POSITIVE_INFINITY },
  });

  router.use(createNasAccessMiddleware(crowi));

  // Feature-enabled gate — runs after nasAccess. `unavailable` is let through on
  // purpose: the service's ensureReady gate turns it into STORAGE_UNAVAILABLE
  // (503), which is the correct signal for a transient mount drop.
  const featureEnabledGate: RequestHandler = (_req, res, next) => {
    const { state } = health.getStatus();
    if (state !== 'ready' && state !== 'unavailable') {
      (res as ApiV3Response).apiv3Err(
        new ErrorV3('nas_storage.error.not_found', 'NOT_FOUND'),
        404,
      );
      return;
    }
    next();
  };
  router.use(featureEnabledGate);

  router.get('/entries', async (req: Request, res: ApiV3Response) => {
    const dir = asString(req.query.path) ?? '/';
    const query: NasListQuery = {
      cursor: asString(req.query.cursor),
      limit: clampLimit(req.query.limit),
      includeHidden:
        req.query.includeHidden != null
          ? parseBool(req.query.includeHidden)
          : nasStorageConfig.showHidden(),
    };

    const result = await service.listFolder(dir, query);
    if (!result.ok) {
      respondNasError(res, result.error);
      return;
    }
    res.apiv3(result.value);
  });

  router.get('/file', async (req: Request, res: ApiV3Response) => {
    const logicalPath = asString(req.query.path) ?? '';

    const result = await service.download(logicalPath);
    if (!result.ok) {
      respondNasError(res, result.error);
      return;
    }

    const { stream, entry } = result.value;
    res.setHeader('Content-Disposition', contentDisposition(entry.name));
    res.setHeader('Content-Type', 'application/octet-stream');
    if (entry.sizeBytes > 0) {
      res.setHeader('Content-Length', String(entry.sizeBytes));
    }

    stream.on('error', (err) => {
      logger.error('nas-storage download stream failed', err);
      if (!res.headersSent) {
        res.apiv3Err(new ErrorV3('nas_storage.error.unknown', 'UNKNOWN'), 500);
        return;
      }
      res.destroy(err instanceof Error ? err : undefined);
    });
    stream.pipe(res);
  });

  router.post(
    '/files',
    upload.single('file'),
    autoReap,
    async (req: Request, res: ApiV3Response) => {
      const file = req.file;
      if (file == null) {
        res.apiv3Err(
          new ErrorV3('nas_storage.error.file_required', 'INVALID_PATH'),
          400,
        );
        return;
      }

      const dir = asString(req.body?.dir) ?? '';
      const targetName = asString(req.body?.name) ?? file.originalname;
      const overwrite = parseBool(req.body?.overwrite);

      const result = await service.putFile({
        dirLogicalPath: dir,
        targetName,
        sourceTmpPath: file.path,
        overwrite,
      });
      if (!result.ok) {
        respondNasError(res, result.error);
        return;
      }
      res.apiv3(result.value, 201);
    },
  );

  router.post('/folders', async (req: Request, res: ApiV3Response) => {
    const parentDir = asString(req.body?.parentDir);
    const name = asString(req.body?.name);
    if (parentDir == null || name == null) {
      res.apiv3Err(
        new ErrorV3('nas_storage.error.invalid_path', 'INVALID_PATH'),
        400,
      );
      return;
    }

    const result = await service.createFolder(parentDir, name);
    if (!result.ok) {
      respondNasError(res, result.error);
      return;
    }
    res.apiv3(result.value, 201);
  });

  router.patch('/entries', async (req: Request, res: ApiV3Response) => {
    const from = asString(req.body?.from);
    const to = asString(req.body?.to);
    if (from == null || to == null) {
      res.apiv3Err(
        new ErrorV3('nas_storage.error.invalid_path', 'INVALID_PATH'),
        400,
      );
      return;
    }
    const overwrite = parseBool(req.body?.overwrite);

    const result = await service.rename(from, to, overwrite);
    if (!result.ok) {
      respondNasError(res, result.error);
      return;
    }
    res.apiv3(result.value);
  });

  router.delete('/entries', async (req: Request, res: ApiV3Response) => {
    const logicalPath = asString(req.query.path);
    if (logicalPath == null) {
      res.apiv3Err(
        new ErrorV3('nas_storage.error.invalid_path', 'INVALID_PATH'),
        400,
      );
      return;
    }
    const recursive = req.query.recursive === 'true';

    const result = await service.deleteEntry(logicalPath, recursive);
    if (!result.ok) {
      respondNasError(res, result.error);
      return;
    }
    res.apiv3({ ok: true });
  });

  // multer limit rejection -> TOO_LARGE 413 with the configured limit (Req 3.3).
  const onUploadError: ErrorRequestHandler = (err, _req, res, next) => {
    const apiRes = res as ApiV3Response;
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        respondNasError(apiRes, {
          code: 'TOO_LARGE',
          message: 'nas_storage.error.too_large',
          ...(maxFileSize != null ? { limitBytes: maxFileSize } : {}),
        });
        return;
      }
      apiRes.apiv3Err(
        new ErrorV3('nas_storage.error.upload_failed', 'UNKNOWN'),
        400,
      );
      return;
    }
    next(err);
  };
  router.use(onUploadError);

  return router;
};
