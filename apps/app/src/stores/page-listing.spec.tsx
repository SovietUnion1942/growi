// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { IPageForTreeItem } from '~/interfaces/page';

import { useSWRxMyWipPages } from './page-listing';

// Mock the API boundary. The hook's contract is "GET /page-listing/my-wip,
// return response.data.pages" -- so we assert the resolved data shape and
// the requested endpoint, not SWR's internals.
const apiv3Get = vi.fn();
vi.mock('../client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
}));

// Fresh SWR cache per render so cache entries do not leak between tests.
const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const wipPageA: IPageForTreeItem = {
  _id: 'page-1',
  path: '/wip-page-a',
  parent: null,
  descendantCount: 0,
  grant: 1,
  isEmpty: false,
  wip: true,
};

beforeEach(() => {
  apiv3Get.mockReset();
});

describe('useSWRxMyWipPages', () => {
  it('fetches /page-listing/my-wip and returns the pages array', async () => {
    apiv3Get.mockResolvedValue({ data: { pages: [wipPageA] } });

    const { result } = renderHook(() => useSWRxMyWipPages(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).toEqual([wipPageA]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/page-listing/my-wip');
  });

  it('propagates a fetch error', async () => {
    const error = new Error('failed to fetch');
    apiv3Get.mockRejectedValue(error);

    const { result } = renderHook(() => useSWRxMyWipPages(), { wrapper });

    await waitFor(() => {
      expect(result.current.error).toBe(error);
    });
  });
});
