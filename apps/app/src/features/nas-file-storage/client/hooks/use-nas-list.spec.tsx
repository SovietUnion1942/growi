// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { useNasList } from './use-nas-list';

// Mock the shared axios adapter -- the hook's contract is "GET
// /_api/v3/nas-storage/entries with cursor paging, flatten pages" -- so we
// assert the requested URL/params and the resolved shape, not SWR internals.
const request = vi.fn();
vi.mock('~/utils/axios', () => ({
  default: {
    request: (...args: unknown[]) => request(...args),
    isAxiosError: (e: unknown): boolean =>
      e != null && typeof e === 'object' && 'response' in (e as object),
  },
}));

const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

const entry = (name: string): NasEntry => ({
  name,
  type: 'file',
  sizeBytes: 1,
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  request.mockReset();
});

describe('useNasList', () => {
  it('loads the first page and flattens entries', async () => {
    request.mockResolvedValueOnce({
      data: { entries: [entry('a.txt'), entry('b.txt')], nextCursor: 'b.txt' },
    });

    const { result } = renderHook(() => useNasList('/docs'), { wrapper });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: '/_api/v3/nas-storage/entries',
        params: expect.objectContaining({
          path: '/docs',
          includeHidden: false,
        }),
      }),
    );
    expect(result.current.hasMore).toBe(true);
  });

  it('loadMore() fetches the next page with nextCursor and appends', async () => {
    request
      .mockResolvedValueOnce({
        data: { entries: [entry('a.txt')], nextCursor: 'a.txt' },
      })
      .mockResolvedValueOnce({ data: { entries: [entry('b.txt')] } });

    const { result } = renderHook(() => useNasList('/docs'), { wrapper });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    act(() => {
      result.current.loadMore();
    });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ cursor: 'a.txt' }),
      }),
    );
    expect(result.current.hasMore).toBe(false);
  });

  it('refetches when dirPath changes', async () => {
    request.mockResolvedValueOnce({ data: { entries: [entry('a.txt')] } });
    const { result, rerender } = renderHook(({ dir }) => useNasList(dir), {
      wrapper,
      initialProps: { dir: '/a' },
    });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    request.mockResolvedValueOnce({
      data: { entries: [entry('x.txt'), entry('y.txt')] },
    });
    rerender({ dir: '/b' });

    await waitFor(() => expect(result.current.entries).toHaveLength(2));
    expect(request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ path: '/b' }),
      }),
    );
  });

  it('reload() revalidates from the server', async () => {
    request.mockResolvedValue({ data: { entries: [entry('a.txt')] } });
    const { result } = renderHook(() => useNasList('/docs'), { wrapper });
    await waitFor(() => expect(result.current.entries).toHaveLength(1));

    const before = request.mock.calls.length;
    await act(async () => {
      await result.current.reload();
    });
    expect(request.mock.calls.length).toBeGreaterThan(before);
  });

  it('maps an apiv3 error body to { code, message }', async () => {
    request.mockRejectedValueOnce({
      response: {
        data: {
          errors: [
            { message: 'nas_storage.error.not_found', code: 'NOT_FOUND' },
          ],
          info: {},
        },
      },
    });

    const { result } = renderHook(() => useNasList('/missing'), { wrapper });

    await waitFor(() => expect(result.current.error).toBeDefined());
    expect(result.current.error).toMatchObject({
      code: 'NOT_FOUND',
      message: 'nas_storage.error.not_found',
    });
  });
});
