// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { SWRConfig } from 'swr';

import { useNasStorageUsage } from './use-nas-storage-usage';

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

beforeEach(() => {
  request.mockReset();
});

describe('useNasStorageUsage', () => {
  it('GETs /_api/v3/nas-storage/usage and exposes the reading', async () => {
    request.mockResolvedValue({
      data: { totalBytes: 20, freeBytes: 12, usedBytes: 8 },
    });

    const { result } = renderHook(() => useNasStorageUsage(), { wrapper });

    await waitFor(() => expect(result.current.usage).toBeDefined());
    expect(result.current.usage).toEqual({
      totalBytes: 20,
      freeBytes: 12,
      usedBytes: 8,
    });
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'get',
        url: '/_api/v3/nas-storage/usage',
      }),
    );
  });
});
