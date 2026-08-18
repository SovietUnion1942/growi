// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import {
  type IBadgeTypeCatalogEntry,
  useSWRxBadgeTypeCatalog,
} from './badge-type-catalog';

const apiv3Get = vi.fn();
vi.mock('~/client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const catalogEntryA: IBadgeTypeCatalogEntry = {
  _id: 'badge-type-1',
  description: 'Contributed to the wiki',
};

const catalogEntryB: IBadgeTypeCatalogEntry = {
  _id: 'badge-type-2',
  description: 'Reviewed pages',
};

beforeEach(() => {
  apiv3Get.mockReset();
});

describe('useSWRxBadgeTypeCatalog', () => {
  it('fetches /badge-types/catalog (not the admin-only /badge-types) and returns the badgeTypes array', async () => {
    apiv3Get.mockResolvedValue({
      data: { badgeTypes: [catalogEntryA, catalogEntryB] },
    });

    const { result } = renderHook(() => useSWRxBadgeTypeCatalog(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.data).toEqual([catalogEntryA, catalogEntryB]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/badge-types/catalog');
  });

  it('propagates a fetch error', async () => {
    const error = new Error('failed to fetch');
    apiv3Get.mockRejectedValue(error);

    const { result } = renderHook(() => useSWRxBadgeTypeCatalog(), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });
});
