import type { SWRResponse } from 'swr';
import useSWRImmutable from 'swr/immutable';

import { apiv3Get } from '~/client/util/apiv3-client';

export interface AssignableUser {
  _id: string;
  name: string;
  username: string;
}

/**
 * Active users, name-sorted, for the assignee picker. Same `/users` endpoint
 * the Messages feature uses for its non-admin participant search.
 */
export const useSWRxAssignableUsers = (): SWRResponse<
  AssignableUser[],
  Error
> =>
  useSWRImmutable('/tasks:assignable-users', () =>
    apiv3Get('/users', { sort: 'name', sortOrder: 'asc', page: 1 }).then(
      (res) =>
        (res.data.paginateResult?.docs ?? []).map(
          // biome-ignore lint/suspicious/noExplicitAny: user doc
          (u: any) => ({
            _id: String(u._id),
            name: u.name ?? u.username,
            username: u.username,
          }),
        ),
    ),
  );
