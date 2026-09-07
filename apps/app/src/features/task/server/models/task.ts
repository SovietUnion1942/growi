import type { Document, Model, Types } from 'mongoose';
import { Schema } from 'mongoose';

import { getOrCreateModel } from '~/server/util/mongoose-utils';

import {
  TASK_DESCRIPTION_MAX,
  TASK_LABEL_MAX,
  TASK_LABELS_MAX_COUNT,
  TASK_STATUSES,
  TASK_TITLE_MAX,
  type TaskStatus,
} from '../../interfaces/task';

/**
 * A standalone task. Shared club-wide; `createdBy` only drives the
 * "delete / edit your own" affordance for non-admins.
 */
export interface TaskDocument extends Document {
  title: string;
  description: string;
  status: TaskStatus;
  assignee: Types.ObjectId | null;
  createdBy: Types.ObjectId;
  dueDate: Date | null;
  relatedPage: Types.ObjectId | null;
  labels: string[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface TaskModel extends Model<TaskDocument> {}

const schema = new Schema<TaskDocument, TaskModel>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: TASK_TITLE_MAX,
    },
    description: {
      type: String,
      default: '',
      maxlength: TASK_DESCRIPTION_MAX,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: 'todo',
      required: true,
      index: true,
    },
    assignee: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date, default: null },
    relatedPage: { type: Schema.Types.ObjectId, ref: 'Page', default: null },
    labels: {
      type: [{ type: String, trim: true, maxlength: TASK_LABEL_MAX }],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= TASK_LABELS_MAX_COUNT,
        message: `A task cannot have more than ${TASK_LABELS_MAX_COUNT} labels`,
      },
    },
    // sort key within a status column, ascending; created tasks go to the end
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// the standalone task board: list by column, ordered
schema.index({ status: 1, order: 1 });
// "my tasks" / due-soon views
schema.index({ assignee: 1, dueDate: 1 });

export default getOrCreateModel<TaskDocument, TaskModel>('Task', schema);
