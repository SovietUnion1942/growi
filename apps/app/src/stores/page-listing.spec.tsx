// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { IPageForTreeItem } from '~/interfaces/page';

import {
  useSWRxMyWipPages,
  useSWRxRecentPagesUnderPath,
  useSWRxResolvePaths,
} from './page-listing';

// Mock the API boundary. The hook's contract is "GET /page-listing/my-wip,
// return response.data.pages" -- so we assert the resolved data shape and
// the requested endpoint, not SWR's internals.
const apiv3Get = vi.fn();
const apiv3Post = vi.fn();
vi.mock('../client/util/apiv3-client', () => ({
  apiv3Get: (...args: unknown[]) => apiv3Get(...args),
  apiv3Post: (...args: unknown[]) => apiv3Post(...args),
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

const pageA: IPageForTreeItem = {
  _id: 'page-a',
  path: '/classroom/notice-a',
  parent: null,
  descendantCount: 0,
  grant: 1,
  isEmpty: false,
  wip: false,
};
const pageB: IPageForTreeItem = {
  _id: 'page-b',
  path: '/classroom/notice-b',
  parent: null,
  descendantCount: 0,
  grant: 1,
  isEmpty: false,
  wip: false,
};

beforeEach(() => {
  apiv3Get.mockReset();
  apiv3Post.mockReset();
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

describe('useSWRxRecentPagesUnderPath', () => {
  it('fetches recent-under-path with prefix and limit, returns the pages array', async () => {
    apiv3Get.mockResolvedValue({ data: { pages: [pageA, pageB] } });

    const { result } = renderHook(
      () => useSWRxRecentPagesUnderPath('/classroom', 10),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([pageA, pageB]);
    });
    expect(apiv3Get).toHaveBeenCalledWith('/page-listing/recent-under-path', {
      prefix: '/classroom',
      limit: 10,
    });
  });

  it('is idle (no fetch) when prefix is null', async () => {
    const { result } = renderHook(() => useSWRxRecentPagesUnderPath(null), {
      wrapper,
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Get).not.toHaveBeenCalled();
  });
});

describe('useSWRxResolvePaths', () => {
  it('POSTs resolve-paths with the paths and returns the pages array in API order', async () => {
    apiv3Post.mockResolvedValue({ data: { pages: [pageB, pageA] } });

    const { result } = renderHook(
      () => useSWRxResolvePaths(['/classroom/notice-b', '/classroom/notice-a']),
      { wrapper },
    );

    await waitFor(() => {
      expect(result.current.data).toEqual([pageB, pageA]);
    });
    expect(apiv3Post).toHaveBeenCalledWith('/page-listing/resolve-paths', {
      paths: ['/classroom/notice-b', '/classroom/notice-a'],
    });
  });

  it('is idle (no fetch) for an empty array', async () => {
    const { result } = renderHook(() => useSWRxResolvePaths([]), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Post).not.toHaveBeenCalled();
  });

  it('is idle (no fetch) when paths is null', async () => {
    const { result } = renderHook(() => useSWRxResolvePaths(null), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.data).toBeUndefined();
    expect(apiv3Post).not.toHaveBeenCalled();
  });
});
