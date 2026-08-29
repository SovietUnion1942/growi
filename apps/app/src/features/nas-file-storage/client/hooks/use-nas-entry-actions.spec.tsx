// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { act, renderHook } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { useNasEntryActions } from './use-nas-entry-actions';

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

const dirEntry: NasEntry = {
  name: 'sub',
  type: 'directory',
  sizeBytes: 0,
  modifiedAt: '2026-01-01T00:00:00.000Z',
};

const rejectWith = (code: string, info: Record<string, unknown>) => ({
  response: {
    data: {
      errors: [{ message: `nas_storage.error.${code.toLowerCase()}`, code }],
      info,
    },
  },
});

beforeEach(() => {
  request.mockReset();
});

describe('useNasEntryActions', () => {
  it('uploadFile posts multipart FormData with file, dir, name, overwrite', async () => {
    request.mockResolvedValueOnce({ data: dirEntry });
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await act(async () => {
      await result.current.uploadFile(new File(['x'], 'note.txt'), {
        name: 'renamed.txt',
        overwrite: false,
      });
    });

    const call = request.mock.calls.find((c) =>
      String(c[0].url).endsWith('/nas-storage/files'),
    );
    expect(call?.[0].method).toBe('post');
    const form = call?.[0].data as FormData;
    expect(form.get('file')).toBeInstanceOf(File);
    expect(form.get('dir')).toBe('/docs');
    expect(form.get('name')).toBe('renamed.txt');
    expect(form.get('overwrite')).toBe('false');
  });

  it('surfaces suggestedName on a 409 CONFLICT upload', async () => {
    request.mockRejectedValueOnce(
      rejectWith('CONFLICT', { suggestedName: 'note (1).txt' }),
    );
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await expect(
      result.current.uploadFile(new File(['x'], 'note.txt')),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      suggestedName: 'note (1).txt',
    });
  });

  it('surfaces limitBytes on a 413 TOO_LARGE upload', async () => {
    request.mockRejectedValueOnce(
      rejectWith('TOO_LARGE', { limitBytes: 1048576 }),
    );
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await expect(
      result.current.uploadFile(new File(['x'], 'big.bin')),
    ).rejects.toMatchObject({ code: 'TOO_LARGE', limitBytes: 1048576 });
  });

  it('createFolder POSTs { parentDir, name } to /folders', async () => {
    request.mockResolvedValueOnce({ data: dirEntry });
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await act(async () => {
      await result.current.createFolder('sub');
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'post',
        url: '/_api/v3/nas-storage/folders',
        data: { parentDir: '/docs', name: 'sub' },
      }),
    );
  });

  it('rename PATCHes { from, to } to /entries', async () => {
    request.mockResolvedValueOnce({ data: dirEntry });
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await act(async () => {
      await result.current.rename('/docs/a.txt', '/docs/b.txt');
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'patch',
        url: '/_api/v3/nas-storage/entries',
        data: { from: '/docs/a.txt', to: '/docs/b.txt' },
      }),
    );
  });

  it('remove DELETEs /entries with path and recursive params', async () => {
    request.mockResolvedValueOnce({ data: { ok: true } });
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await act(async () => {
      await result.current.remove('/docs/sub', true);
    });

    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'delete',
        url: '/_api/v3/nas-storage/entries',
        params: { path: '/docs/sub', recursive: true },
      }),
    );
  });

  it('resolves with the created entry (list refresh is the caller’s job)', async () => {
    request.mockResolvedValueOnce({ data: dirEntry });
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    let created: NasEntry | undefined;
    await act(async () => {
      created = await result.current.createFolder('sub');
    });

    expect(created).toEqual(dirEntry);
  });

  it('rejects with the NasRequestError code on a failed mutation', async () => {
    request.mockRejectedValueOnce(
      rejectWith('CONFLICT', { suggestedName: 'sub (1)' }),
    );
    const { result } = renderHook(() => useNasEntryActions('/docs'), {
      wrapper,
    });

    await act(async () => {
      await expect(result.current.createFolder('sub')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });
  });
});
