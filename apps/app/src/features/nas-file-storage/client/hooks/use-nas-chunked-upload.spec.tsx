// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { SWRConfig } from 'swr';

import {
  CHUNK_UPLOAD_THRESHOLD_BYTES,
  shouldUseChunkedUpload,
  useNasChunkedUpload,
} from './use-nas-chunked-upload';

// The hook's contract is the chunked-upload wire protocol (POST /uploads ->
// sequential PATCH with Content-Range -> POST /complete, DELETE on abort), so we
// assert the requests it makes against a mocked axios adapter, not internals.
const request = vi.fn();
vi.mock('~/utils/axios', () => ({
  default: {
    request: (...args: unknown[]) => request(...args),
    isAxiosError: (e: unknown): boolean =>
      e != null && typeof e === 'object' && 'response' in (e as object),
  },
}));

const wrapper = ({ children }: PropsWithChildren): JSX.Element => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);

const rejectWith = (code: string, info: Record<string, unknown> = {}) => ({
  response: {
    data: {
      errors: [{ message: `nas_storage.error.${code.toLowerCase()}`, code }],
      info,
    },
  },
});

type Call = {
  method: string;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
};
const callsTo = (suffix: string): Call[] =>
  request.mock.calls
    .map((c) => c[0] as Call)
    .filter((c) => String(c.url).endsWith(suffix));

const bigFile = (bytes: number, name = 'big.bin'): File =>
  new File([new Uint8Array(bytes)], name);

const completedEntry = {
  name: 'big.bin',
  type: 'file' as const,
  sizeBytes: 20,
  modifiedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  request.mockReset();
});

const renderUpload = (dir = '/docs') =>
  renderHook(() => useNasChunkedUpload(dir), { wrapper }).result;

describe('shouldUseChunkedUpload', () => {
  it('routes files strictly larger than the threshold to the chunked path', () => {
    expect(shouldUseChunkedUpload(CHUNK_UPLOAD_THRESHOLD_BYTES)).toBe(false);
    expect(shouldUseChunkedUpload(CHUNK_UPLOAD_THRESHOLD_BYTES + 1)).toBe(true);
    expect(CHUNK_UPLOAD_THRESHOLD_BYTES).toBe(90 * 1024 * 1024);
  });
});

describe('useNasChunkedUpload', () => {
  const mockHappyPath = () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/uploads') && cfg.method === 'post') {
        return Promise.resolve({ data: { uploadId: 'u1', chunkSize: 8 } });
      }
      if (cfg.url.endsWith('/uploads/u1') && cfg.method === 'put') {
        return Promise.resolve({ status: 204, data: undefined });
      }
      if (cfg.url.endsWith('/uploads/u1/complete')) {
        return Promise.resolve({ data: completedEntry });
      }
      return Promise.reject(new Error(`unexpected ${cfg.method} ${cfg.url}`));
    });
  };

  it('begins a session, streams sequential Content-Range chunks, then completes', async () => {
    mockHappyPath();
    const onProgress = vi.fn();
    const result = renderUpload();

    const entry = await result.current.uploadLargeFile(bigFile(20), {
      onProgress,
    });

    expect(entry).toEqual(completedEntry);

    const begin = callsTo('/nas-storage/uploads')[0];
    expect(begin.method).toBe('post');
    expect(begin.data).toEqual({
      dir: '/docs',
      name: 'big.bin',
      totalBytes: 20,
      overwrite: false,
    });

    const patches = callsTo('/uploads/u1');
    expect(patches).toHaveLength(3);
    expect(patches.map((p) => p.headers?.['Content-Range'])).toEqual([
      'bytes 0-7/20',
      'bytes 8-15/20',
      'bytes 16-19/20',
    ]);
    expect(
      patches.every(
        (p) => p.headers?.['Content-Type'] === 'application/octet-stream',
      ),
    ).toBe(true);
    expect(
      await Promise.all(patches.map((p) => (p.data as Blob).size)),
    ).toEqual([8, 8, 4]);

    expect(callsTo('/uploads/u1/complete')).toHaveLength(1);
    expect(onProgress.mock.calls).toEqual([
      [8, 20],
      [16, 20],
      [20, 20],
    ]);
  });

  it('passes name and overwrite through to the begin request', async () => {
    mockHappyPath();
    const result = renderUpload();

    await result.current.uploadLargeFile(bigFile(20), {
      name: 'renamed.bin',
      overwrite: true,
    });

    expect(callsTo('/nas-storage/uploads')[0].data).toEqual({
      dir: '/docs',
      name: 'renamed.bin',
      totalBytes: 20,
      overwrite: true,
    });
  });

  it('maps a TOO_LARGE begin failure to NasRequestError.limitBytes without touching the session', async () => {
    request.mockRejectedValueOnce(
      rejectWith('TOO_LARGE', { limitBytes: 1048576 }),
    );
    const result = renderUpload();

    await expect(
      result.current.uploadLargeFile(bigFile(20)),
    ).rejects.toMatchObject({ code: 'TOO_LARGE', limitBytes: 1048576 });

    expect(callsTo('/uploads/u1')).toHaveLength(0);
    expect(
      request.mock.calls.filter((c) => c[0].method === 'delete'),
    ).toHaveLength(0);
  });

  it('aborts the session and stops on a mid-stream PATCH failure', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/uploads') && cfg.method === 'post') {
        return Promise.resolve({ data: { uploadId: 'u1', chunkSize: 8 } });
      }
      if (cfg.method === 'put') {
        return Promise.reject(rejectWith('STORAGE_UNAVAILABLE'));
      }
      if (cfg.method === 'delete') {
        return Promise.resolve({ data: { ok: true } });
      }
      return Promise.reject(new Error('unexpected'));
    });
    const result = renderUpload();

    await expect(
      result.current.uploadLargeFile(bigFile(20)),
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE' });

    expect(
      callsTo('/uploads/u1').filter((c) => c.method === 'put'),
    ).toHaveLength(1); // stopped after the first
    const deletes = request.mock.calls
      .map((c) => c[0] as Call)
      .filter((c) => c.method === 'delete');
    expect(deletes).toHaveLength(1);
    expect(deletes[0].url).toMatch(/\/uploads\/u1$/);
    expect(callsTo('/uploads/u1/complete')).toHaveLength(0);
  });

  it('restarts once from a fresh session on CHUNK_OUT_OF_ORDER, then succeeds', async () => {
    let beginCount = 0;
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/uploads') && cfg.method === 'post') {
        beginCount += 1;
        return Promise.resolve({
          data: { uploadId: `u${beginCount}`, chunkSize: 8 },
        });
      }
      if (cfg.method === 'put') {
        if (cfg.url.endsWith('/uploads/u1')) {
          return Promise.reject(rejectWith('CHUNK_OUT_OF_ORDER'));
        }
        return Promise.resolve({ status: 204, data: undefined });
      }
      if (cfg.method === 'delete') {
        return Promise.resolve({ data: { ok: true } });
      }
      if (cfg.url.endsWith('/uploads/u2/complete')) {
        return Promise.resolve({ data: completedEntry });
      }
      return Promise.reject(new Error(`unexpected ${cfg.method} ${cfg.url}`));
    });
    const result = renderUpload();

    const entry = await result.current.uploadLargeFile(bigFile(20));

    expect(entry).toEqual(completedEntry);
    expect(beginCount).toBe(2);
    const deletes = request.mock.calls
      .map((c) => c[0] as Call)
      .filter((c) => c.method === 'delete');
    expect(deletes).toHaveLength(1); // aborted the first session before restarting
    expect(callsTo('/uploads/u2/complete')).toHaveLength(1);
  });

  it('rethrows CHUNK_OUT_OF_ORDER after the single restart also fails', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/uploads') && cfg.method === 'post') {
        return Promise.resolve({ data: { uploadId: 'u1', chunkSize: 8 } });
      }
      if (cfg.method === 'put') {
        return Promise.reject(rejectWith('CHUNK_OUT_OF_ORDER'));
      }
      if (cfg.method === 'delete') {
        return Promise.resolve({ data: { ok: true } });
      }
      return Promise.reject(new Error('unexpected'));
    });
    const result = renderUpload();

    await expect(
      result.current.uploadLargeFile(bigFile(20)),
    ).rejects.toMatchObject({ code: 'CHUNK_OUT_OF_ORDER' });
  });

  it('surfaces a CONFLICT from complete with suggestedName and no abort call', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/uploads') && cfg.method === 'post') {
        return Promise.resolve({ data: { uploadId: 'u1', chunkSize: 8 } });
      }
      if (cfg.method === 'put') {
        return Promise.resolve({ status: 204, data: undefined });
      }
      if (cfg.url.endsWith('/uploads/u1/complete')) {
        return Promise.reject(
          rejectWith('CONFLICT', { suggestedName: 'big (1).bin' }),
        );
      }
      return Promise.reject(new Error('unexpected'));
    });
    const result = renderUpload();

    await expect(
      result.current.uploadLargeFile(bigFile(20)),
    ).rejects.toMatchObject({ code: 'CONFLICT', suggestedName: 'big (1).bin' });

    const deletes = request.mock.calls
      .map((c) => c[0] as Call)
      .filter((c) => c.method === 'delete');
    expect(deletes).toHaveLength(0);
  });
});
