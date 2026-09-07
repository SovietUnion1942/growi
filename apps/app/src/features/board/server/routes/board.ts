import { ErrorV3 } from '@growi/core/dist/models';
import type { Response } from 'express';
import { Router } from 'express';
import multer from 'multer';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import type Crowi from '~/server/crowi';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

import {
  BOARD_ASSET_ALLOWED_MIME,
  BOARD_ASSET_MAX_BYTES,
  BOARD_TEMPLATE_CONTENT_MAX_BYTES,
  BOARD_TEMPLATE_DESCRIPTION_MAX,
  BOARD_TEMPLATE_NAME_MAX,
  BOARD_TEMPLATE_THUMBNAIL_MAX_BYTES,
  type BoardTemplateSummary,
} from '../../interfaces/board-template';
import { boardAssetStore } from '../board-assets/board-asset-store';
import { isBoardEnabled } from '../is-board-enabled';
import BoardTemplate from '../models/board-template';

const logger = loggerFactory('growi:features:board:routes');

const byteLength = (value: unknown): number =>
  Buffer.byteLength(JSON.stringify(value ?? null));

type BoardRouteCrowi = Pick<Crowi, 'tmpDir'> &
  Parameters<typeof loginRequiredFactory>[0];

export const setup = (crowi: BoardRouteCrowi): Router => {
  const router = Router();
  const loginRequiredStrictly = loginRequiredFactory(crowi);
  const uploads = multer({
    dest: `${crowi.tmpDir}uploads`,
    limits: { fileSize: BOARD_ASSET_MAX_BYTES },
  });

  // Feature gate: every route 404s when BOARD_MODE is off.
  router.use((_req, res: ApiV3Response, next) => {
    if (!isBoardEnabled()) {
      return res.apiv3Err(
        new ErrorV3('Board feature is disabled', 'board-disabled'),
        404,
      );
    }
    next();
  });

  const toSummary = (
    // biome-ignore lint/suspicious/noExplicitAny: lean() doc
    doc: any,
    userId: string,
  ): BoardTemplateSummary => ({
    _id: String(doc._id),
    name: doc.name,
    description: doc.description ?? '',
    thumbnail: doc.thumbnail ?? null,
    createdByName: doc.createdBy?.name ?? doc.createdBy?.username ?? null,
    createdAt: (doc.createdAt as Date).toISOString(),
    isOwn: String(doc.createdBy?._id ?? doc.createdBy) === userId,
  });

  // --- Templates -----------------------------------------------------------

  router.get(
    '/templates',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const docs = await BoardTemplate.find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .populate('createdBy', 'name username')
        .lean();
      const userId = String(req.user?._id);
      return res.apiv3({ templates: docs.map((d) => toSummary(d, userId)) });
    },
  );

  router.get(
    '/templates/:id',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const doc = await BoardTemplate.findById(req.params.id)
        .populate('createdBy', 'name username')
        .lean();
      if (doc == null) {
        return res.apiv3Err(
          new ErrorV3('Template not found', 'not-found'),
          404,
        );
      }
      const userId = String(req.user?._id);
      return res.apiv3({
        template: { ...toSummary(doc, userId), content: doc.content },
      });
    },
  );

  router.post(
    '/templates',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const name = String(req.body.name ?? '').trim();
      const description = String(req.body.description ?? '').trim();
      const { content, thumbnail } = req.body;

      if (name.length === 0 || name.length > BOARD_TEMPLATE_NAME_MAX) {
        return res.apiv3Err(
          new ErrorV3('Invalid template name', 'invalid-name'),
          400,
        );
      }
      if (description.length > BOARD_TEMPLATE_DESCRIPTION_MAX) {
        return res.apiv3Err(
          new ErrorV3('Description too long', 'invalid-description'),
          400,
        );
      }
      if (
        content == null ||
        byteLength(content) > BOARD_TEMPLATE_CONTENT_MAX_BYTES
      ) {
        return res.apiv3Err(
          new ErrorV3(
            'Template content missing or too large',
            'invalid-content',
          ),
          400,
        );
      }
      if (
        typeof thumbnail === 'string' &&
        Buffer.byteLength(thumbnail) > BOARD_TEMPLATE_THUMBNAIL_MAX_BYTES
      ) {
        return res.apiv3Err(
          new ErrorV3('Thumbnail too large', 'invalid-thumbnail'),
          400,
        );
      }

      const created = await BoardTemplate.create({
        name,
        description,
        content,
        thumbnail: typeof thumbnail === 'string' ? thumbnail : null,
        createdBy: req.user?._id,
      });
      const doc = await created.populate('createdBy', 'name username');
      return res.apiv3(
        { template: toSummary(doc.toObject(), String(req.user?._id)) },
        201,
      );
    },
  );

  router.delete(
    '/templates/:id',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const doc = await BoardTemplate.findById(req.params.id);
      if (doc == null) {
        return res.apiv3Err(
          new ErrorV3('Template not found', 'not-found'),
          404,
        );
      }
      const isOwner = String(doc.createdBy) === String(req.user?._id);
      if (!isOwner && !req.user?.admin) {
        return res.apiv3Err(new ErrorV3('Forbidden', 'forbidden'), 403);
      }
      await doc.deleteOne();
      return res.apiv3({ ok: true });
    },
  );

  // --- Image assets ------------------------------------------------------

  router.post(
    '/assets',
    loginRequiredStrictly,
    uploads.single('file'),
    async (req: CrowiRequest, res: ApiV3Response) => {
      const file = req.file;
      if (file == null) {
        return res.apiv3Err(new ErrorV3('No file', 'no-file'), 400);
      }
      if (
        !(BOARD_ASSET_ALLOWED_MIME as readonly string[]).includes(file.mimetype)
      ) {
        return res.apiv3Err(
          new ErrorV3('Unsupported image type', 'unsupported-type'),
          400,
        );
      }
      try {
        const id = await boardAssetStore.put(
          file.path,
          file.originalname,
          file.mimetype,
          String(req.user?._id),
        );
        // relative URL: resolves to the same origin for every viewer, so it
        // survives being shared through the Yjs doc.
        return res.apiv3({ url: `/_api/v3/board/assets/${id}` }, 201);
      } catch (err) {
        logger.error({ err }, 'board asset upload failed');
        return res.apiv3Err(new ErrorV3('Upload failed', 'upload-failed'), 500);
      }
    },
  );

  router.get(
    '/assets/:id',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: Response) => {
      const meta = await boardAssetStore.stat(req.params.id);
      if (meta == null) {
        res.status(404).json({ error: 'Asset not found' });
        return;
      }
      res.setHeader('Content-Type', meta.contentType);
      res.setHeader('Content-Length', String(meta.length));
      res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      boardAssetStore
        .openDownloadStream(req.params.id)
        .on('error', (err) => {
          logger.error({ err }, 'board asset stream failed');
          if (!res.headersSent) res.status(500).end();
        })
        .pipe(res);
    },
  );

  return router;
};
