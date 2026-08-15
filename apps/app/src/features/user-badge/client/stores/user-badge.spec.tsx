// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { IBadgeTypeHasId } from './badge-type';
import { type IUserBadgeHasId, useSWRxUserBadges } from './user-badge';

// Mock the API boundary. The hook's contract is "GET
// /user-badges?targetUserId=<id>, return response.data.userBadges" -- so we
// assert the resolved data shape and the requested URL, not SWR's internals.
const apiv3Get = vi.fn();
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

// Fresh SWR cache per render so cache entries do not leak between tests.
const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const badgeType: IBadgeTypeHasId = {
  _id: 'badge-type-1',
  name: 'Contributor',
  description: 'Contributed to the wiki',
  iconKey: 'icon-a',
  category: 'automatic',
  levels: [{ level: 1, name: 'Bronze', iconKey: 'icon-a-1', threshold: 10 }],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

const userBadgeA: IUserBadgeHasId = {
  _id: 'user-badge-1',
  user: 'user-1',
  badgeType,
  level: 1,
  grantedAt: '2026-01-01T00:00:00.000Z',
  grantedBy: null,
  note: null,
};

beforeEach(() => {
  apiv3Get.mockReset();
});

describe('useSWRxUserBadges', () => {
  it('fetches /user-badges with the given targetUserId and returns the userBadges array', async () => {
    apiv3Get.mockResolvedValue({ data: { userBadges: [userBadgeA] } });

    const { result } = renderHook(() => useSWRxUserBadges('user-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([userBadgeA]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/user-badges?targetUserId=user-1');
  });

  it('propagates a fetch error', async () => {
    const error = new Error('failed to fetch');
    apiv3Get.mockRejectedValue(error);

    const { result } = renderHook(() => useSWRxUserBadges('user-1'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });

  it('does not fetch when userId is null', async () => {
    const { result } = renderHook(() => useSWRxUserBadges(null), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Get).not.toHaveBeenCalled();
  });

  it('uses distinct cache keys for different users', async () => {
    apiv3Get.mockImplementation((endpoint: string) => {
      if (endpoint === '/user-badges?targetUserId=user-1') {
        return Promise.resolve({ data: { userBadges: [userBadgeA] } });
      }
      return Promise.resolve({ data: { userBadges: [] } });
    });

    const { result } = renderHook(
      () => {
        const userOne = useSWRxUserBadges('user-1');
        const userTwo = useSWRxUserBadges('user-2');
        return { userOne, userTwo };
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.userOne.data).toEqual([userBadgeA]);
      expect(result.current.userTwo.data).toEqual([]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/user-badges?targetUserId=user-1');
    expect(apiv3Get).toHaveBeenCalledWith('/user-badges?targetUserId=user-2');
  });
});
