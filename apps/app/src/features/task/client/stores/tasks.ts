import useSWR, { mutate, type SWRResponse } from 'swr';

import {
  apiv3Delete,
  apiv3Get,
  apiv3Post,
  apiv3Put,
} from '~/client/util/apiv3-client';

import type {
  TaskCreateBody,
  TaskListQuery,
  TaskSummary,
  TaskUpdateBody,
} from '../../interfaces/task';

const BASE = '/tasks';

const buildKey = (query?: TaskListQuery): string => {
  const params = new URLSearchParams();
  if (query?.status != null) params.set('status', query.status);
  if (query?.assignee != null) params.set('assignee', query.assignee);
  if (query?.mine) params.set('mine', 'true');
  if (query?.overdue) params.set('overdue', 'true');
  const qs = params.toString();
  return qs.length > 0 ? `${BASE}?${qs}` : BASE;
};

export const useSWRxTasks = (
  query?: TaskListQuery,
): SWRResponse<TaskSummary[], Error> =>
  useSWR(buildKey(query), (endpoint) =>
    apiv3Get(endpoint).then((res) => res.data.tasks),
  );

/** Revalidate every task list regardless of its filter. */
const revalidateAll = () =>
  mutate((key) => typeof key === 'string' && key.startsWith(BASE));

export const createTask = async (
  body: TaskCreateBody,
): Promise<TaskSummary> => {
  const res = await apiv3Post(BASE, body);
  await revalidateAll();
  return res.data.task;
};

export const updateTask = async (
  id: string,
  body: TaskUpdateBody,
): Promise<TaskSummary> => {
  const res = await apiv3Put(`${BASE}/${id}`, body);
  await revalidateAll();
  return res.data.task;
};

export const deleteTask = async (id: string): Promise<void> => {
  await apiv3Delete(`${BASE}/${id}`);
  await revalidateAll();
};
