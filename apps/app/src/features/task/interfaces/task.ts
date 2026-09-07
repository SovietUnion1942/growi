/**
 * Standalone task feature (`app:taskEnabled`, env `TASK_MODE`, default OFF).
 * Tasks live in their own collection, not in page markdown — a page link is
 * optional context only.
 */

export const TASK_STATUSES = ['todo', 'doing', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_TITLE_MAX = 300;
export const TASK_DESCRIPTION_MAX = 10_000;
export const TASK_LABEL_MAX = 40;
export const TASK_LABELS_MAX_COUNT = 20;
export const TASK_LIST_LIMIT = 500;

export interface TaskUserSummary {
  _id: string;
  name: string | null;
  username: string | null;
}

export interface TaskRelatedPageSummary {
  _id: string;
  path: string;
}

/** Shape returned by the `/tasks` API. */
export interface TaskSummary {
  _id: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignee: TaskUserSummary | null;
  createdBy: TaskUserSummary | null;
  dueDate: string | null;
  relatedPage: TaskRelatedPageSummary | null;
  labels: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
}

export interface TaskCreateBody {
  title: string;
  description?: string;
  status?: TaskStatus;
  assignee?: string | null;
  dueDate?: string | null;
  relatedPage?: string | null;
  labels?: string[];
}

export type TaskUpdateBody = Partial<TaskCreateBody> & {
  /** Kanban reordering: new position within the target status column. */
  order?: number;
};

export interface TaskListQuery {
  status?: TaskStatus;
  assignee?: string;
  /** `me` resolves to the requesting user server-side. */
  mine?: boolean;
  overdue?: boolean;
}

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' &&
  (TASK_STATUSES as readonly string[]).includes(value);
