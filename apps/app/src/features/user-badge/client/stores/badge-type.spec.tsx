// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import {
  type IBadgeTypeHasId,
  useSWRxBadgeType,
  useSWRxBadgeTypeList,
} from './badge-type';

// Mock the API boundary. The hooks' contract is "GET /badge-types, return
// response.data.badgeTypes" — so we assert the resolved data shape and the
// requested URL, not SWR's internals.
const apiv3Get = vi.fn();
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

// Fresh SWR cache per render so the global `/badge-types` key does not leak
// resolved data between tests.
const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const badgeTypeA: IBadgeTypeHasId = {
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

const badgeTypeB: IBadgeTypeHasId = {
  _id: 'badge-type-2',
  name: 'Reviewer',
  description: 'Reviewed pages',
  iconKey: 'icon-b',
  category: 'manual',
  levels: [],
  isDeleted: false,
  deletedAt: null,
  createdBy: 'user-1',
};

beforeEach(() => {
  apiv3Get.mockReset();
});

describe('useSWRxBadgeTypeList', () => {
  it('fetches /badge-types and returns the badgeTypes array', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [badgeTypeA, badgeTypeB] },
    });

    const { result } = renderHook(() => useSWRxBadgeTypeList(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([badgeTypeA, badgeTypeB]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/badge-types');
  });

  it('propagates a fetch error', async () => {
    const error = new Error('failed to fetch');
    apiv3Get.mockRejectedValue(error);

    const { result } = renderHook(() => useSWRxBadgeTypeList(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });
});

describe('useSWRxBadgeType', () => {
  it('resolves a single badge type by id from the fetched list', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [badgeTypeA, badgeTypeB] },
    });

    const { result } = renderHook(() => useSWRxBadgeType('badge-type-2'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual(badgeTypeB);
    });
    // Derived from the list endpoint — no separate single-item request.
    expect(apiv3Get).toHaveBeenCalledWith('/badge-types');
    expect(apiv3Get).toHaveBeenCalledTimes(1);
  });

  it('resolves to undefined without attempting a lookup when badgeTypeId is null', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [badgeTypeA, badgeTypeB] },
    });

    // Since the single-item lookup is derived from the shared list hook
    // (which fetches unconditionally, per the rules of hooks), the
    // underlying `/badge-types` request still fires even when
    // `badgeTypeId` is null — but no item is ever selected out of the
    // resulting list.
    const { result } = renderHook(() => useSWRxBadgeType(null), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Get).toHaveBeenCalledTimes(1);
  });

  it('resolves to undefined when badgeTypeId does not match any item in the list', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [badgeTypeA, badgeTypeB] },
    });

    const { result } = renderHook(() => useSWRxBadgeType('does-not-exist'), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
  });
});

describe('useSWRxBadgeTypeList and useSWRxBadgeType used together', () => {
  it('share a single SWR cache entry: only ONE apiv3Get call for both hooks', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [badgeTypeA, badgeTypeB] },
    });

    // Render both hooks in the same component tree, sharing one SWR cache
    // (the `wrapper`'s SWRConfig). This is the regression test for the bug
    // where `useSWRxBadgeType` used an independent SWR key
    // (`['/badge-types', id]`) instead of deriving from the list hook's own
    // `/badge-types` cache entry, which caused a duplicate fetch whenever
    // both hooks were used together (e.g. a table + an edit modal).
    const { result } = renderHook(
      () => {
        const list = useSWRxBadgeTypeList();
        const single = useSWRxBadgeType('badge-type-2');
        return { list, single };
      },
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.list.data).toEqual([badgeTypeA, badgeTypeB]);
      expect(result.current.single.data).toEqual(badgeTypeB);
    });

    expect(apiv3Get).toHaveBeenCalledTimes(1);
    expect(apiv3Get).toHaveBeenCalledWith('/badge-types');
  });
});
