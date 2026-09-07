import useSWR, { mutate, type SWRResponse } from 'swr';

import { apiv3Delete, apiv3Get, apiv3Post } from '~/client/util/apiv3-client';

import type {
  BoardTemplateSummary,
  BoardTemplateWithContent,
} from '../../interfaces/board-template';

const LIST_KEY = '/board/templates';

export const useSWRxBoardTemplates = (): SWRResponse<
  BoardTemplateSummary[],
  Error
> =>
  useSWR(LIST_KEY, (endpoint) =>
    apiv3Get(endpoint).then((res) => res.data.templates),
  );

export const fetchBoardTemplate = (
  id: string,
): Promise<BoardTemplateWithContent> =>
  apiv3Get(`/board/templates/${id}`).then((res) => res.data.template);

export const createBoardTemplate = async (body: {
  name: string;
  description: string;
  content: unknown;
  thumbnail: string | null;
}): Promise<BoardTemplateSummary> => {
  const res = await apiv3Post('/board/templates', body);
  await mutate(LIST_KEY);
  return res.data.template;
};

export const deleteBoardTemplate = async (id: string): Promise<void> => {
  await apiv3Delete(`/board/templates/${id}`);
  await mutate(LIST_KEY);
};
