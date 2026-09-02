import { useCallback, useMemo } from 'react';

import type {
  BeginChunkedUploadResponse,
  NasEntry,
} from '~/features/nas-file-storage/interfaces';

import type { NasFolderSelection } from '../util/nas-upload-name';
import { validateNasUploadName } from '../util/nas-upload-name';
import { shouldUseChunkedUpload } from './use-nas-chunked-upload';
import { NasRequestError, nasApiRequest } from './use-nas-list';

/**
 * Minimal structural view of a File System Access API directory handle. This
 * TS release's `lib.dom` does not model `values()`/`getFile()` on
 * `FileSystemDirectoryHandle`, and the picker itself is feature-detected in
 * `NasUploadDropzone`, so the walk narrows through this local type.
 */
interface DirectoryHandleLike {
  kind: 'file' | 'directory';
  name: string;
  getFile(): Promise<File>;
  values(): AsyncIterable<DirectoryHandleLike>;
}

/** Conflict policy chosen once for the whole batch (Req 11.3). */
export type NasBatchPolicy = 'overwrite' | 'skip' | 'rename';

/** i18n key recorded against a path segment that fails name validation (Req 11.5). */
export const FOLDER_UPLOAD_INVALID_PATH_KEY =
  'nas_storage.folder_upload.invalid_path';

export interface NasFolderWalkResult {
  /** Ancestor directory relative paths, shallowest-first (parents before children). */
  dirs: string[];
  /** Every uploadable file with its sanitized relative path. */
  files: { relativePath: string; file: File }[];
  /** Entries dropped because a path segment was unsafe (`..`, separator, empty, over-long). */
  invalid: { relativePath: string; error: string }[];
}

export interface NasFolderUploadFileResult {
  relativePath: string;
  status: 'done' | 'skipped' | 'failed';
  error?: string;
}

export interface NasFolderUploadResult {
  succeeded: number;
  skipped: number;
  failed: { relativePath: string; error: string }[];
}

export interface UploadFolderOptions {
  onFileResult?: (result: NasFolderUploadFileResult) => void;
}

export interface UseNasFolderUploadResult {
  /**
   * Recreate the selected folder tree under `currentDirPath` and upload every
   * file with a single batch-wide conflict `policy` (Req 11.1–11.5). Per-file
   * failures are collected and never abort the batch; the caller refreshes the
   * listing afterwards (Req 11.6).
   */
  uploadFolder: (
    selection: NasFolderSelection,
    policy: NasBatchPolicy,
    opts?: UploadFolderOptions,
  ) => Promise<NasFolderUploadResult>;
}

/** Join a logical NAS dir with a relative sub-path, collapsing redundant slashes. */
const joinLogical = (base: string, rel: string): string => {
  const parts = [...base.split('/'), ...rel.split('/')].filter(
    (segment) => segment.length > 0,
  );
  return `/${parts.join('/')}`;
};

const sanitizeSegments = (rawPath: string): string[] | null => {
  const segments = rawPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }
  if (segments.some((segment) => validateNasUploadName(segment) != null)) {
    return null;
  }
  return segments;
};

const sortDirsShallowestFirst = (dirSet: Set<string>): string[] =>
  [...dirSet].sort((a, b) => {
    const depthDiff = a.split('/').length - b.split('/').length;
    if (depthDiff !== 0) {
      return depthDiff;
    }
    return a < b ? -1 : 1;
  });

type WalkAcc = {
  dirSet: Set<string>;
  files: { relativePath: string; file: File }[];
  invalid: { relativePath: string; error: string }[];
};

const walkDirectoryHandle = async (
  handle: DirectoryHandleLike,
  prefixSegments: string[],
  acc: WalkAcc,
): Promise<void> => {
  // The async iterator is the only way to enumerate a directory handle.
  for await (const entry of handle.values()) {
    const relSegments = [...prefixSegments, entry.name];
    const relativePath = relSegments.join('/');
    if (validateNasUploadName(entry.name) != null) {
      acc.invalid.push({
        relativePath,
        error: FOLDER_UPLOAD_INVALID_PATH_KEY,
      });
      continue;
    }
    if (entry.kind === 'directory') {
      acc.dirSet.add(relativePath);
      await walkDirectoryHandle(entry, relSegments, acc);
    } else {
      const file = await entry.getFile();
      acc.files.push({ relativePath, file });
    }
  }
};

/**
 * Walk a folder selection into a directory set + file set, sanitizing every
 * path segment. The `'handle'` path (Chromium's File System Access API) also
 * lists empty sub-folders (Req 11.2); the `<input webkitdirectory>` fallback
 * only yields files, so empty folders cannot be recovered there.
 */
export const walkSelection = async (
  selection: NasFolderSelection,
): Promise<NasFolderWalkResult> => {
  const acc: WalkAcc = { dirSet: new Set(), files: [], invalid: [] };

  if (selection.kind === 'handle') {
    const rootName = selection.handle.name;
    if (validateNasUploadName(rootName) != null) {
      return {
        dirs: [],
        files: [],
        invalid: [
          { relativePath: rootName, error: FOLDER_UPLOAD_INVALID_PATH_KEY },
        ],
      };
    }
    acc.dirSet.add(rootName);
    // The picker is feature-detected upstream; `lib.dom` under-models the handle.
    const rootHandle = selection.handle as unknown as DirectoryHandleLike;
    await walkDirectoryHandle(rootHandle, [rootName], acc);
  } else {
    for (const file of selection.files) {
      const rawPath = file.webkitRelativePath || file.name;
      const segments = sanitizeSegments(rawPath);
      if (segments == null) {
        acc.invalid.push({
          relativePath: rawPath,
          error: FOLDER_UPLOAD_INVALID_PATH_KEY,
        });
        continue;
      }
      acc.files.push({ relativePath: segments.join('/'), file });
      for (let i = 1; i < segments.length; i += 1) {
        acc.dirSet.add(segments.slice(0, i).join('/'));
      }
    }
  }

  return {
    dirs: sortDirsShallowestFirst(acc.dirSet),
    files: acc.files,
    invalid: acc.invalid,
  };
};

const errorMessageKey = (err: unknown): string =>
  err instanceof NasRequestError
    ? err.message
    : 'nas_storage.error.upload_failed';

/**
 * Folder-scoped chunked upload. `useNasChunkedUpload` binds its destination dir
 * from the hook argument and cannot target a nested sub-folder, so the folder
 * orchestrator runs its own minimal begin/patch/complete loop with an explicit
 * `dir`. No CHUNK_OUT_OF_ORDER auto-restart here — a mid-stream failure is
 * collected as a per-file failure and the batch continues (Req 11.4).
 */
const postFileChunked = async (
  dir: string,
  file: File,
  name: string,
  overwrite: boolean,
): Promise<NasEntry> => {
  const { uploadId, chunkSize } =
    await nasApiRequest<BeginChunkedUploadResponse>('post', '/uploads', {
      data: { dir, name, totalBytes: file.size, overwrite },
    });

  try {
    for (let offset = 0; offset < file.size; offset += chunkSize) {
      const end = Math.min(offset + chunkSize, file.size);
      // biome-ignore lint/performance/noAwaitInLoops: chunks MUST be sent sequentially (Content-Range 逐次追記)
      await nasApiRequest<void>('put', `/uploads/${uploadId}`, {
        data: file.slice(offset, end),
        headers: {
          'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
          'Content-Type': 'application/octet-stream',
        },
      });
    }
  } catch (err) {
    try {
      await nasApiRequest<{ ok: true }>('delete', `/uploads/${uploadId}`);
    } catch {
      // best-effort: the TTL sweep reaps the orphaned session/.part otherwise
    }
    throw err;
  }

  return nasApiRequest<NasEntry>('post', `/uploads/${uploadId}/complete`, {});
};

const postFile = (
  dir: string,
  file: File,
  name: string,
  overwrite: boolean,
): Promise<NasEntry> => {
  if (shouldUseChunkedUpload(file.size)) {
    return postFileChunked(dir, file, name, overwrite);
  }
  const form = new FormData();
  form.append('file', file);
  form.append('dir', dir);
  form.append('name', name);
  if (overwrite) {
    form.append('overwrite', 'true');
  }
  return nasApiRequest<NasEntry>('post', '/files', {
    data: form,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

const uploadOneFile = async (
  dir: string,
  file: File,
  name: string,
  policy: NasBatchPolicy,
): Promise<NasEntry> => {
  try {
    return await postFile(dir, file, name, policy === 'overwrite');
  } catch (err) {
    if (
      policy === 'rename' &&
      err instanceof NasRequestError &&
      err.code === 'CONFLICT' &&
      err.suggestedName != null
    ) {
      return postFile(dir, file, err.suggestedName, false);
    }
    throw err;
  }
};

export const useNasFolderUpload = (
  currentDirPath: string,
): UseNasFolderUploadResult => {
  const uploadFolder = useCallback(
    async (
      selection: NasFolderSelection,
      policy: NasBatchPolicy,
      opts?: UploadFolderOptions,
    ): Promise<NasFolderUploadResult> => {
      const { dirs, files, invalid } = await walkSelection(selection);
      const report = opts?.onFileResult;
      const failed: { relativePath: string; error: string }[] = [];
      let succeeded = 0;
      let skipped = 0;

      for (const entry of invalid) {
        failed.push(entry);
        report?.({
          relativePath: entry.relativePath,
          status: 'failed',
          error: entry.error,
        });
      }

      for (const dirRelativePath of dirs) {
        const segments = dirRelativePath.split('/');
        const name = segments[segments.length - 1];
        const parentDir = joinLogical(
          currentDirPath,
          segments.slice(0, -1).join('/'),
        );
        try {
          // biome-ignore lint/performance/noAwaitInLoops: directories are created shallowest-first so a parent exists before its children
          await nasApiRequest<NasEntry>('post', '/folders', {
            data: { parentDir, name },
          });
        } catch (err) {
          // An existing folder is a success within a batch (design note, Req 11.1).
          if (!(err instanceof NasRequestError && err.code === 'CONFLICT')) {
            const error = errorMessageKey(err);
            failed.push({ relativePath: dirRelativePath, error });
            report?.({
              relativePath: dirRelativePath,
              status: 'failed',
              error,
            });
          }
        }
      }

      for (const { relativePath, file } of files) {
        const segments = relativePath.split('/');
        const name = segments[segments.length - 1];
        const dir = joinLogical(
          currentDirPath,
          segments.slice(0, -1).join('/'),
        );
        try {
          // biome-ignore lint/performance/noAwaitInLoops: sequential upload bounds server load, matching the single-file dropzone
          await uploadOneFile(dir, file, name, policy);
          succeeded += 1;
          report?.({ relativePath, status: 'done' });
        } catch (err) {
          if (
            policy === 'skip' &&
            err instanceof NasRequestError &&
            err.code === 'CONFLICT'
          ) {
            skipped += 1;
            report?.({ relativePath, status: 'skipped' });
            continue;
          }
          const error = errorMessageKey(err);
          failed.push({ relativePath, error });
          report?.({ relativePath, status: 'failed', error });
        }
      }

      return { succeeded, skipped, failed };
    },
    [currentDirPath],
  );

  return useMemo(() => ({ uploadFolder }), [uploadFolder]);
};
