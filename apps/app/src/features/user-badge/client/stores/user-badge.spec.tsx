// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { IBadgeTypeHasId } from './badge-type';
import {
  type IUserBadgeHasId,
  revokeUserBadge,
  useSWRxUserBadges,
} from './user-badge';

// Mock the API boundary. The hook's contract is "GET
// /user-badges?targetUserId=<id>, return response.data.userBadges" -- so we
// assert the resolved data shape and the requested URL, not SWR's internals.
const apiv3Get = vi.fn();
const apiv3Delete = vi.fn();
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
  apiv3Delete: (...args: unknown[]) => apiv3Delete(...args),
}));

// Mock only `mutate` from 'swr', keeping `useSWR`/`SWRConfig` real so the
// existing hook tests below are unaffected -- mirrors the
// `mutatePageTree`/`keyMatcherForPageTree` pattern in `~/stores/page-listing`
// (the only precedent in this repo for a standalone, non-hook mutation
// function that revalidates via the top-level `mutate` import).
const mutate = vi.fn();
vi.mock('swr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('swr')>();
  return { ...actual, mutate: (...args: unknown[]) => mutate(...args) };
});

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
  revokedAt: null,
  revokedBy: null,
};

beforeEach(() => {
  apiv3Get.mockReset();
  apiv3Delete.mockReset();
  mutate.mockReset();
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

  it('fetches /user-badges with includeRevoked=true when requested', async () => {
    apiv3Get.mockResolvedValue({ data: { userBadges: [userBadgeA] } });

    const { result } = renderHook(
      () => useSWRxUserBadges('user-1', { includeRevoked: true }),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([userBadgeA]);
    });
    expect(apiv3Get).toHaveBeenCalledWith(
      '/user-badges?targetUserId=user-1&includeRevoked=true',
    );
  });

  it('does not include includeRevoked=true when the option is omitted (regression guard)', async () => {
    apiv3Get.mockResolvedValue({ data: { userBadges: [userBadgeA] } });

    renderHook(() => useSWRxUserBadges('user-1'), { wrapper });

    await waitFor(() => {
      expect(apiv3Get).toHaveBeenCalled();
    });
    expect(apiv3Get).toHaveBeenCalledWith('/user-badges?targetUserId=user-1');
    expect(apiv3Get).not.toHaveBeenCalledWith(
      expect.stringContaining('includeRevoked'),
    );
  });

  it('does not include includeRevoked=true when explicitly false (regression guard)', async () => {
    apiv3Get.mockResolvedValue({ data: { userBadges: [userBadgeA] } });

    renderHook(() => useSWRxUserBadges('user-1', { includeRevoked: false }), {
      wrapper,
    });

    await waitFor(() => {
      expect(apiv3Get).toHaveBeenCalled();
    });
    expect(apiv3Get).toHaveBeenCalledWith('/user-badges?targetUserId=user-1');
  });
});

describe('revokeUserBadge', () => {
  it('calls DELETE /user-badges/:id and revalidates the target cache on success', async () => {
    const revokedUserBadge: IUserBadgeHasId = {
      ...userBadgeA,
      revokedAt: '2026-08-17T00:00:00.000Z',
      revokedBy: 'admin-1',
    };
    apiv3Delete.mockResolvedValue({
      data: { userBadge: revokedUserBadge },
    });
    mutate.mockResolvedValue([]);

    const result = await revokeUserBadge('user-badge-1', 'user-1');

    expect(apiv3Delete).toHaveBeenCalledWith('/user-badges/user-badge-1');
    expect(result).toEqual(revokedUserBadge);

    // revalidates via the key-matcher form of `mutate`, mirroring
    // `mutatePageTree`/`keyMatcherForPageTree` in `~/stores/page-listing`.
    expect(mutate).toHaveBeenCalledTimes(1);
    const matcher = mutate.mock.calls[0][0] as (key: unknown) => boolean;
    expect(matcher('/user-badges?targetUserId=user-1')).toBe(true);
    expect(
      matcher('/user-badges?targetUserId=user-1&includeRevoked=true'),
    ).toBe(true);
    // must not collide with a different user's cache entry, nor with a
    // different user id that merely shares the same string prefix
    expect(matcher('/user-badges?targetUserId=user-2')).toBe(false);
    expect(matcher('/user-badges?targetUserId=user-12')).toBe(false);
  });

  it('propagates a failed DELETE without calling mutate', async () => {
    const error = new Error('failed to delete');
    apiv3Delete.mockRejectedValue(error);

    await expect(revokeUserBadge('user-badge-1', 'user-1')).rejects.toBe(error);
    expect(mutate).not.toHaveBeenCalled();
  });
});
