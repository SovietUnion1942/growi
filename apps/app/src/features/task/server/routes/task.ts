import { ErrorV3 } from '@growi/core/dist/models';
import { Router } from 'express';
import { isValidObjectId } from 'mongoose';

import type { CrowiRequest } from '~/interfaces/crowi-request';
import loginRequiredFactory from '~/server/middlewares/login-required';
import type { ApiV3Response } from '~/server/routes/apiv3/interfaces/apiv3-response';
import loggerFactory from '~/utils/logger';

import {
  isTaskStatus,
  TASK_LABEL_MAX,
  TASK_LABELS_MAX_COUNT,
  TASK_LIST_LIMIT,
  TASK_TITLE_MAX,
  type TaskStatus,
  type TaskSummary,
} from '../../interfaces/task';
import { isTaskEnabled } from '../is-task-enabled';
import Task from '../models/task';

const logger = loggerFactory('growi:features:task:routes');

type TaskRouteCrowi = Parameters<typeof loginRequiredFactory>[0];

// biome-ignore lint/suspicious/noExplicitAny: lean()/populated doc
type LeanDoc = any;

const userSummary = (u: LeanDoc | null) =>
  u == null || u._id == null
    ? null
    : {
        _id: String(u._id),
        name: u.name ?? null,
        username: u.username ?? null,
      };

const toSummary = (doc: LeanDoc): TaskSummary => {
  const dueDate: Date | null = doc.dueDate ?? null;
  return {
    _id: String(doc._id),
    title: doc.title,
    description: doc.description ?? '',
    status: doc.status,
    assignee: userSummary(doc.assignee),
    createdBy: userSummary(doc.createdBy),
    dueDate: dueDate != null ? dueDate.toISOString() : null,
    relatedPage:
      doc.relatedPage != null && doc.relatedPage._id != null
        ? { _id: String(doc.relatedPage._id), path: doc.relatedPage.path }
        : null,
    labels: doc.labels ?? [],
    order: doc.order ?? 0,
    createdAt: (doc.createdAt as Date).toISOString(),
    updatedAt: (doc.updatedAt as Date).toISOString(),
    isOverdue:
      dueDate != null &&
      doc.status !== 'done' &&
      dueDate.getTime() < Date.now(),
  };
};

const populated = () =>
  Task.find()
    .populate('assignee', 'name username')
    .populate('createdBy', 'name username')
    .populate('relatedPage', 'path');

const findByIdPopulated = (id: string) =>
  Task.findById(id)
    .populate('assignee', 'name username')
    .populate('createdBy', 'name username')
    .populate('relatedPage', 'path')
    .lean();

/** Normalize/validate the writable fields shared by create and update. */
const parseBody = (
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): { patch: Record<string, unknown> } | { error: string; code: string } => {
  const patch: Record<string, unknown> = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title ?? '').trim();
    if (title.length === 0 || title.length > TASK_TITLE_MAX) {
      return { error: 'Invalid task title', code: 'invalid-title' };
    }
    patch.title = title;
  }

  if (body.description !== undefined) {
    patch.description = String(body.description ?? '');
  }

  if (body.status !== undefined) {
    if (!isTaskStatus(body.status)) {
      return { error: 'Invalid status', code: 'invalid-status' };
    }
    patch.status = body.status as TaskStatus;
  }

  if (body.assignee !== undefined) {
    if (body.assignee === null || body.assignee === '') {
      patch.assignee = null;
    } else if (isValidObjectId(body.assignee)) {
      patch.assignee = body.assignee;
    } else {
      return { error: 'Invalid assignee', code: 'invalid-assignee' };
    }
  }

  if (body.relatedPage !== undefined) {
    if (body.relatedPage === null || body.relatedPage === '') {
      patch.relatedPage = null;
    } else if (isValidObjectId(body.relatedPage)) {
      patch.relatedPage = body.relatedPage;
    } else {
      return { error: 'Invalid related page', code: 'invalid-related-page' };
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') {
      patch.dueDate = null;
    } else {
      const d = new Date(body.dueDate as string);
      if (Number.isNaN(d.getTime())) {
        return { error: 'Invalid due date', code: 'invalid-due-date' };
      }
      patch.dueDate = d;
    }
  }

  if (body.labels !== undefined) {
    if (!Array.isArray(body.labels)) {
      return { error: 'Invalid labels', code: 'invalid-labels' };
    }
    const labels = Array.from(
      new Set(
        body.labels
          .map((l) => String(l).trim())
          .filter((l) => l.length > 0 && l.length <= TASK_LABEL_MAX),
      ),
    );
    if (labels.length > TASK_LABELS_MAX_COUNT) {
      return { error: 'Too many labels', code: 'invalid-labels' };
    }
    patch.labels = labels;
  }

  if (body.order !== undefined) {
    const order = Number(body.order);
    if (!Number.isFinite(order)) {
      return { error: 'Invalid order', code: 'invalid-order' };
    }
    patch.order = order;
  }

  return { patch };
};

export const setup = (crowi: TaskRouteCrowi): Router => {
  const router = Router();
  const loginRequiredStrictly = loginRequiredFactory(crowi);

  // Feature gate: every route 404s when TASK_MODE is off.
  router.use((_req, res: ApiV3Response, next) => {
    if (!isTaskEnabled()) {
      return res.apiv3Err(
        new ErrorV3('Task feature is disabled', 'task-disabled'),
        404,
      );
    }
    next();
  });

  // --- List --------------------------------------------------------------
  router.get(
    '/',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const filter: Record<string, unknown> = {};

      const { status, assignee, mine, overdue } = req.query;
      if (typeof status === 'string' && isTaskStatus(status)) {
        filter.status = status;
      }
      if (mine === 'true') {
        filter.assignee = req.user?._id;
      } else if (typeof assignee === 'string' && isValidObjectId(assignee)) {
        filter.assignee = assignee;
      }
      if (overdue === 'true') {
        filter.dueDate = { $lt: new Date() };
        filter.status = { $ne: 'done' };
      }

      const docs = await populated()
        .where(filter)
        .sort({ status: 1, order: 1, createdAt: -1 })
        .limit(TASK_LIST_LIMIT)
        .lean();

      return res.apiv3({ tasks: docs.map(toSummary) });
    },
  );

  // --- Create ----------------------------------------------------------
  router.post(
    '/',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      const parsed = parseBody(req.body, { partial: false });
      if ('error' in parsed) {
        return res.apiv3Err(new ErrorV3(parsed.error, parsed.code), 400);
      }

      // new task sorts to the bottom of its status column
      const last = await Task.findOne({
        status: parsed.patch.status ?? 'todo',
      })
        .sort({ order: -1 })
        .select('order')
        .lean();

      const created = await Task.create({
        ...parsed.patch,
        order: (last?.order ?? 0) + 1,
        createdBy: req.user?._id,
      });
      const doc = await findByIdPopulated(String(created._id));
      return res.apiv3({ task: toSummary(doc) }, 201);
    },
  );

  // --- Update -------------------------------------------------------
  router.put(
    '/:id',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      if (!isValidObjectId(req.params.id)) {
        return res.apiv3Err(new ErrorV3('Task not found', 'not-found'), 404);
      }
      const task = await Task.findById(req.params.id);
      if (task == null) {
        return res.apiv3Err(new ErrorV3('Task not found', 'not-found'), 404);
      }
      const isOwner = String(task.createdBy) === String(req.user?._id);
      if (!isOwner && !req.user?.admin) {
        return res.apiv3Err(new ErrorV3('Forbidden', 'forbidden'), 403);
      }

      const parsed = parseBody(req.body, { partial: true });
      if ('error' in parsed) {
        return res.apiv3Err(new ErrorV3(parsed.error, parsed.code), 400);
      }
      task.set(parsed.patch);
      await task.save();

      const doc = await findByIdPopulated(String(task._id));
      return res.apiv3({ task: toSummary(doc) });
    },
  );

  // --- Delete -----------------------------------------------------------
  router.delete(
    '/:id',
    loginRequiredStrictly,
    async (req: CrowiRequest, res: ApiV3Response) => {
      if (!isValidObjectId(req.params.id)) {
        return res.apiv3Err(new ErrorV3('Task not found', 'not-found'), 404);
      }
      const task = await Task.findById(req.params.id);
      if (task == null) {
        return res.apiv3Err(new ErrorV3('Task not found', 'not-found'), 404);
      }
      const isOwner = String(task.createdBy) === String(req.user?._id);
      if (!isOwner && !req.user?.admin) {
        return res.apiv3Err(new ErrorV3('Forbidden', 'forbidden'), 403);
      }
      await task.deleteOne();
      return res.apiv3({ ok: true });
    },
  );

  router.use(
    (
      err: Error,
      _req: CrowiRequest,
      res: ApiV3Response,
      // biome-ignore lint/correctness/noUnusedFunctionParameters: express needs arity 4
      next: unknown,
    ) => {
      logger.error({ err }, 'task route error');
      return res.apiv3Err(new ErrorV3('Unexpected error', 'unexpected'), 500);
    },
  );

  return router;
};
