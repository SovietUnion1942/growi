// @vitest-environment happy-dom

import type { PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { SWRConfig } from 'swr';

import type { NasFolderSelection } from '../components/NasUploadDropzone';
import { useNasFolderUpload, walkSelection } from './use-nas-folder-upload';

// The hook's contract is the sequence of NAS API calls it makes (POST /folders
// to recreate the tree, POST /files per file with a batch-wide policy), so we
// assert against a mocked axios adapter rather than internals.
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

type Call = { method: string; url: string; data?: unknown };
const calls = (): Call[] => request.mock.calls.map((c) => c[0] as Call);
const callsTo = (suffix: string): Call[] =>
  calls().filter((c) => String(c.url).endsWith(suffix));

const inputFile = (relativePath: string): File => {
  const file = new File(['content'], relativePath.split('/').at(-1) ?? 'f');
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath });
  return file;
};

const renderUpload = (dir = '/docs') =>
  renderHook(() => useNasFolderUpload(dir), { wrapper }).result;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ data: { name: 'x', type: 'file' } });
});

describe('walkSelection (input fallback)', () => {
  it('derives the ancestor directory set shallowest-first and keeps file paths', async () => {
    const selection: NasFolderSelection = {
      kind: 'input',
      files: [
        inputFile('top/a.txt'),
        inputFile('top/sub/b.txt'),
        inputFile('top/sub/deep/c.txt'),
      ],
    };

    const { dirs, files, invalid } = await walkSelection(selection);

    expect(dirs).toEqual(['top', 'top/sub', 'top/sub/deep']);
    expect(files.map((f) => f.relativePath)).toEqual([
      'top/a.txt',
      'top/sub/b.txt',
      'top/sub/deep/c.txt',
    ]);
    expect(invalid).toHaveLength(0);
  });

  it('drops a file whose path escapes the root and records it as invalid', async () => {
    const selection: NasFolderSelection = {
      kind: 'input',
      files: [inputFile('top/a.txt'), inputFile('top/../evil.txt')],
    };

    const { files, invalid } = await walkSelection(selection);

    expect(files.map((f) => f.relativePath)).toEqual(['top/a.txt']);
    expect(invalid).toEqual([
      {
        relativePath: 'top/../evil.txt',
        error: expect.stringMatching(/invalid_path/),
      },
    ]);
  });
});

describe('walkSelection (directory handle)', () => {
  const fileHandle = (name: string) => ({
    kind: 'file' as const,
    name,
    getFile: async () => new File(['x'], name),
  });
  const dirHandle = (name: string, children: unknown[]) => ({
    kind: 'directory' as const,
    name,
    // biome-ignore lint/suspicious/useAwait: an async generator is what `for await` consumes
    values: async function* values() {
      for (const child of children) {
        yield child;
      }
    },
  });

  it('lists empty sub-folders so the tree is reproduced (Req 11.2)', async () => {
    const handle = dirHandle('photos', [
      fileHandle('p1.jpg'),
      dirHandle('empty', []),
      dirHandle('sub', [fileHandle('p2.jpg')]),
    ]);

    const { dirs, files } = await walkSelection({
      kind: 'handle',
      // biome-ignore lint/suspicious/noExplicitAny: minimal structural fake of FileSystemDirectoryHandle
      handle: handle as any,
    });

    expect(dirs).toEqual(['photos', 'photos/empty', 'photos/sub']);
    expect(files.map((f) => f.relativePath).sort()).toEqual([
      'photos/p1.jpg',
      'photos/sub/p2.jpg',
    ]);
  });
});

describe('useNasFolderUpload().uploadFolder', () => {
  const threeFiles: NasFolderSelection = {
    kind: 'input',
    files: [
      inputFile('top/a.txt'),
      inputFile('top/sub/b.txt'),
      inputFile('top/sub/deep/c.txt'),
    ],
  };

  it('recreates directories and uploads every file with overwrite policy', async () => {
    const result = renderUpload();

    const summary = await result.current.uploadFolder(threeFiles, 'overwrite');

    const folderCalls = callsTo('/nas-storage/folders');
    expect(folderCalls.map((c) => c.data)).toEqual([
      { parentDir: '/docs', name: 'top' },
      { parentDir: '/docs/top', name: 'sub' },
      { parentDir: '/docs/top/sub', name: 'deep' },
    ]);

    const fileCalls = callsTo('/nas-storage/files');
    expect(fileCalls).toHaveLength(3);
    expect((fileCalls[0].data as FormData).get('dir')).toBe('/docs/top');
    expect((fileCalls[0].data as FormData).get('overwrite')).toBe('true');
    expect((fileCalls[2].data as FormData).get('dir')).toBe(
      '/docs/top/sub/deep',
    );

    expect(summary).toEqual({ succeeded: 3, skipped: 0, failed: [] });
  });

  it('treats an existing-folder CONFLICT as success within the batch', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/folders')) {
        return Promise.reject(rejectWith('CONFLICT'));
      }
      return Promise.resolve({ data: { name: 'x', type: 'file' } });
    });
    const result = renderUpload();

    const summary = await result.current.uploadFolder(threeFiles, 'overwrite');

    expect(summary.succeeded).toBe(3);
    expect(summary.failed).toHaveLength(0);
  });

  it('counts a skipped file on CONFLICT and does not retry it', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/files')) {
        const name = (cfg.data as FormData).get('name');
        if (name === 'b.txt') {
          return Promise.reject(
            rejectWith('CONFLICT', { suggestedName: 'b (1).txt' }),
          );
        }
      }
      return Promise.resolve({ data: { name: 'x', type: 'file' } });
    });
    const result = renderUpload();

    const summary = await result.current.uploadFolder(threeFiles, 'skip');

    expect(summary).toEqual({ succeeded: 2, skipped: 1, failed: [] });
    expect(
      callsTo('/nas-storage/files').filter(
        (c) => (c.data as FormData).get('name') === 'b (1).txt',
      ),
    ).toHaveLength(0);
  });

  it('retries once with the suggested name under rename policy', async () => {
    let bAttempts = 0;
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/files')) {
        const name = (cfg.data as FormData).get('name');
        if (name === 'b.txt') {
          bAttempts += 1;
          return Promise.reject(
            rejectWith('CONFLICT', { suggestedName: 'b (1).txt' }),
          );
        }
      }
      return Promise.resolve({ data: { name: 'x', type: 'file' } });
    });
    const result = renderUpload();

    const summary = await result.current.uploadFolder(threeFiles, 'rename');

    expect(bAttempts).toBe(1);
    expect(
      callsTo('/nas-storage/files').filter(
        (c) => (c.data as FormData).get('name') === 'b (1).txt',
      ),
    ).toHaveLength(1);
    expect(summary).toEqual({ succeeded: 3, skipped: 0, failed: [] });
  });

  it('collects a per-file failure and keeps uploading the rest (Req 11.4)', async () => {
    request.mockImplementation((cfg: Call) => {
      if (cfg.url.endsWith('/nas-storage/files')) {
        const name = (cfg.data as FormData).get('name');
        if (name === 'b.txt') {
          return Promise.reject(rejectWith('STORAGE_UNAVAILABLE'));
        }
      }
      return Promise.resolve({ data: { name: 'x', type: 'file' } });
    });
    const onFileResult = vi.fn();
    const result = renderUpload();

    const summary = await result.current.uploadFolder(threeFiles, 'overwrite', {
      onFileResult,
    });

    expect(summary.succeeded).toBe(2);
    expect(summary.failed).toEqual([
      { relativePath: 'top/sub/b.txt', error: expect.any(String) },
    ]);
    expect(onFileResult).toHaveBeenCalledWith({
      relativePath: 'top/sub/b.txt',
      status: 'failed',
      error: expect.any(String),
    });
  });
});
