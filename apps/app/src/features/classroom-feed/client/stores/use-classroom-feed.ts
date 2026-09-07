import type { SWRResponse } from 'swr';
import useSWR from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';

export interface ClassroomFeedItem {
  path: string;
  body: string;
  createdAt: string;
}

interface ClassroomFeedResponse {
  items: ClassroomFeedItem[];
}

/**
 * Live read of `GET /_api/v3/classroom-feed` — always reflects GROWI's own
 * current page/revision data, no separate cache to keep in sync.
 */
export const useClassroomFeed = (
  prefix: string,
  limit?: number,
): SWRResponse<ClassroomFeedItem[], Error> => {
  return useSWR<ClassroomFeedItem[], Error>(
    prefix !== '' ? ['/classroom-feed', prefix, limit] : null,
    async ([endpoint, prefix, limit]) => {
      const res = await apiv3Get<ClassroomFeedResponse>(endpoint, {
        prefix,
        limit,
      });
      return res.data.items;
    },
  );
};
