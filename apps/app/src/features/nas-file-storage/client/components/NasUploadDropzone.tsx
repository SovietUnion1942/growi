import type { ChangeEvent, JSX } from 'react';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import prettyBytes from 'pretty-bytes';
import { useDropzone } from 'react-dropzone';

import type { NasErrorCode } from '~/features/nas-file-storage/interfaces';

import {
  shouldUseChunkedUpload,
  useNasChunkedUpload,
} from '../hooks/use-nas-chunked-upload';
import { useNasEntryActions } from '../hooks/use-nas-entry-actions';

declare global {
  interface Window {
    // Not yet in this TS release's lib.dom; feature-detected before use.
    showDirectoryPicker?: (
      options?: unknown,
    ) => Promise<FileSystemDirectoryHandle>;
  }
}

declare module 'react' {
  interface InputHTMLAttributes<T> {
    // Non-standard directory-select attribute, unknown to @types/react.
    webkitdirectory?: string;
  }
}

/**
 * A folder the user picked for bulk upload. Task 11.5 only surfaces the
 * selection; `useNasFolderUpload` (task 11.6) walks it into a directory/file set
 * and orchestrates the batch. Two shapes because the two selection mechanisms
 * yield different things: the File System Access API hands back a live directory
 * handle (which also exposes empty sub-folders), the `<input webkitdirectory>`
 * fallback hands back a flat `File[]` carrying `webkitRelativePath`.
 */
export type NasFolderSelection =
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  | { kind: 'input'; files: File[] };

type Props = {
  currentDirPath: string;
  onUploaded?: () => void;
  /**
   * Wired by task 11.6. When omitted, the "upload a folder" affordance is not
   * rendered.
   */
  onFolderSelected?: (selection: NasFolderSelection) => void;
};

type ItemStatus =
  | 'pending'
  | 'uploading'
  | 'done'
  | 'error'
  | 'conflict'
  | 'skipped';

type QueueItem = {
  id: string;
  file: File;
  name: string;
  status: ItemStatus;
  /** i18n key for an inline error (validation failure or upload failure). */
  errorKey?: string;
  /** Formatted size limit, shown for TOO_LARGE. */
  limitLabel?: string;
  /** Server-proposed alternative name, present only while `status === 'conflict'`. */
  suggestedName?: string;
};

const MAX_NAME_LENGTH = 255;

let idSeq = 0;
const nextId = (): string => {
  idSeq += 1;
  return `nas-upload-${idSeq}`;
};

/**
 * Client-side name check mirroring the server's rules (the server stays the
 * final authority). Returns an i18n key when the name is not acceptable.
 */
export const validateNasUploadName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'nas_storage.upload.invalid_name_empty';
  }
  if (trimmed === '.' || trimmed === '..') {
    return 'nas_storage.upload.invalid_name_dots';
  }
  if (/[/\\]/.test(name)) {
    return 'nas_storage.upload.invalid_name_separator';
  }
  if (name.length > MAX_NAME_LENGTH) {
    return 'nas_storage.upload.invalid_name_length';
  }
  return null;
};

type UploadErrorShape = {
  code?: NasErrorCode;
  suggestedName?: string;
  limitBytes?: number;
};

/**
 * Drag & drop / click-to-select upload target for the current NAS folder.
 * Files are validated locally, then uploaded one at a time (small fixed
 * concurrency per design). A name clash is never resolved automatically — the
 * user picks overwrite / save-as / skip (Req 3.2).
 */
export const NasUploadDropzone = ({
  currentDirPath,
  onUploaded,
  onFolderSelected,
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const { uploadFile } = useNasEntryActions(currentDirPath);
  const { uploadLargeFile } = useNasChunkedUpload(currentDirPath);

  const [items, setItems] = useState<QueueItem[]>([]);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const patchItem = useCallback(
    (id: string, patch: Partial<QueueItem>): void => {
      setItems((prev) =>
        prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
      );
    },
    [],
  );

  const uploadOne = useCallback(
    async (
      item: QueueItem,
      opts?: { overwrite?: boolean; name?: string },
    ): Promise<boolean> => {
      patchItem(item.id, {
        status: 'uploading',
        errorKey: undefined,
        limitLabel: undefined,
      });
      try {
        // Large files exceed the front proxy's single-request limit, so they
        // take the chunked path. Both calls resolve to a `NasEntry` and reject
        // with the same `NasRequestError` shape, so the branches below are
        // identical for either route.
        const upload = shouldUseChunkedUpload(item.file.size)
          ? uploadLargeFile(item.file, opts)
          : uploadFile(item.file, opts);
        await upload;
        patchItem(item.id, { status: 'done', suggestedName: undefined });
        return true;
      } catch (err) {
        const shape = (err ?? {}) as UploadErrorShape;
        if (shape.code === 'CONFLICT') {
          patchItem(item.id, {
            status: 'conflict',
            suggestedName: shape.suggestedName,
          });
        } else if (shape.code === 'TOO_LARGE') {
          patchItem(item.id, {
            status: 'error',
            errorKey: 'nas_storage.error.too_large',
            limitLabel:
              shape.limitBytes != null
                ? prettyBytes(shape.limitBytes)
                : undefined,
          });
        } else {
          patchItem(item.id, {
            status: 'error',
            errorKey: 'nas_storage.error.upload_failed',
          });
        }
        return false;
      }
    },
    [patchItem, uploadFile, uploadLargeFile],
  );

  const runQueue = useCallback(
    async (queue: QueueItem[]): Promise<void> => {
      let anySuccess = false;
      for (const item of queue) {
        if (item.status !== 'pending') {
          continue;
        }
        // Sequential on purpose: design pins concurrency low; one-at-a-time is
        // the simplest shape that satisfies "並列度は小さく固定".
        // biome-ignore lint/performance/noAwaitInLoops: sequential upload is the intended behaviour
        const ok = await uploadOne(item);
        anySuccess = anySuccess || ok;
      }
      if (anySuccess) {
        onUploaded?.();
      }
    },
    [onUploaded, uploadOne],
  );

  const onDrop = useCallback(
    (accepted: File[]): void => {
      if (accepted.length === 0) {
        return;
      }
      const queue: QueueItem[] = accepted.map((file) => {
        const invalidKey = validateNasUploadName(file.name);
        return {
          id: nextId(),
          file,
          name: file.name,
          status: invalidKey != null ? 'error' : 'pending',
          errorKey: invalidKey ?? undefined,
        };
      });
      setItems((prev) => [...prev, ...queue]);
      void runQueue(queue);
    },
    [runQueue],
  );

  const resolveConflict = useCallback(
    async (
      item: QueueItem,
      action: 'overwrite' | 'rename' | 'skip',
    ): Promise<void> => {
      if (action === 'skip') {
        patchItem(item.id, { status: 'skipped', suggestedName: undefined });
        return;
      }
      const opts =
        action === 'overwrite'
          ? { overwrite: true }
          : { name: item.suggestedName };
      const ok = await uploadOne(item, opts);
      if (ok) {
        onUploaded?.();
      }
    },
    [onUploaded, patchItem, uploadOne],
  );

  const openFolderPicker = useCallback(async (): Promise<void> => {
    if (onFolderSelected == null) {
      return;
    }
    // Chromium exposes the File System Access API, which also enumerates empty
    // sub-folders; everywhere else falls back to `<input webkitdirectory>`.
    if (typeof window !== 'undefined' && window.showDirectoryPicker != null) {
      try {
        const handle = await window.showDirectoryPicker();
        onFolderSelected({ kind: 'handle', handle });
      } catch {
        // The user dismissed the picker — nothing selected, nothing to do.
      }
      return;
    }
    folderInputRef.current?.click();
  }, [onFolderSelected]);

  const onFolderInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const picked = e.target.files;
      if (picked != null && picked.length > 0) {
        onFolderSelected?.({ kind: 'input', files: Array.from(picked) });
      }
      // Allow re-selecting the same folder later.
      e.target.value = '';
    },
    [onFolderSelected],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  return (
    <div className="nas-upload-dropzone">
      <div
        {...getRootProps({
          className:
            'nas-upload-dropzone__target border border-2 border-dashed rounded p-4 text-center',
        })}
        data-testid="nas-upload-dropzone"
      >
        <input {...getInputProps()} data-testid="nas-upload-input" />
        <span className="material-symbols-outlined" aria-hidden="true">
          upload_file
        </span>
        <p className="mb-0">
          {isDragActive
            ? t('nas_storage.upload.drop_active')
            : t('nas_storage.upload.drop_here')}
        </p>
        <p
          className="mb-0 mt-1 small text-muted"
          data-testid="nas-upload-size-hint"
        >
          {t('nas_storage.upload.size_hint')}
        </p>
      </div>

      {onFolderSelected != null && (
        <div className="mt-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
            data-testid="nas-folder-select"
            onClick={() => {
              void openFolderPicker();
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              drive_folder_upload
            </span>
            {t('nas_storage.upload.select_folder')}
          </button>
          <input
            ref={folderInputRef}
            type="file"
            multiple
            webkitdirectory=""
            className="d-none"
            data-testid="nas-folder-input"
            onChange={onFolderInputChange}
          />
        </div>
      )}

      {items.length > 0 && (
        <ul
          className="list-group list-group-flush mt-2"
          data-testid="nas-upload-queue"
        >
          {items.map((item) => (
            <li
              key={item.id}
              className="list-group-item d-flex flex-column"
              data-testid="nas-upload-item"
            >
              <div className="d-flex justify-content-between align-items-center">
                <span className="text-truncate">{item.name}</span>
                <span className="small text-muted">
                  {t(`nas_storage.upload.status_${item.status}`)}
                </span>
              </div>

              {item.errorKey != null && (
                <span className="small text-danger" role="alert">
                  {t(item.errorKey)}
                  {item.limitLabel != null ? ` (${item.limitLabel})` : ''}
                </span>
              )}

              {item.status === 'conflict' && (
                <div className="d-flex align-items-center gap-2 mt-1">
                  <span className="small text-warning">
                    {t('nas_storage.upload.conflict')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    onClick={() => {
                      void resolveConflict(item, 'overwrite');
                    }}
                  >
                    {t('nas_storage.upload.overwrite')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => {
                      void resolveConflict(item, 'rename');
                    }}
                  >
                    {t('nas_storage.upload.save_as', {
                      name: item.suggestedName,
                    })}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-link"
                    onClick={() => {
                      void resolveConflict(item, 'skip');
                    }}
                  >
                    {t('nas_storage.upload.skip')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
