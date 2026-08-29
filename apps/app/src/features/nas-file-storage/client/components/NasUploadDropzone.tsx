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
import type { NasFolderUploadResult } from '../hooks/use-nas-folder-upload';
import { useNasFolderUpload } from '../hooks/use-nas-folder-upload';
import type { NasFolderSelection } from '../util/nas-upload-name';
import { validateNasUploadName } from '../util/nas-upload-name';
import {
  NasBatchPolicyDialog,
  useNasBatchPolicy,
} from './NasBatchPolicyDialog';

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
 * and orchestrates the batch.
 */
export type { NasFolderSelection } from '../util/nas-upload-name';

type Props = {
  currentDirPath: string;
  onUploaded?: () => void;
  /**
   * Optional notification fired when the user picks a folder. The dropzone
   * runs the batch itself via `useNasFolderUpload`; this callback is only a
   * hook for callers that want to observe the selection.
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

let idSeq = 0;
const nextId = (): string => {
  idSeq += 1;
  return `nas-upload-${idSeq}`;
};

// Re-exported for existing callers/tests; the definition lives in the util
// module so the hook and this component do not form an import cycle.
export { validateNasUploadName } from '../util/nas-upload-name';

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
  const { uploadFolder } = useNasFolderUpload(currentDirPath);
  const { requestPolicy, dialogProps: policyDialogProps } = useNasBatchPolicy();

  const [items, setItems] = useState<QueueItem[]>([]);
  const [folderBusy, setFolderBusy] = useState(false);
  const [folderResult, setFolderResult] =
    useState<NasFolderUploadResult | null>(null);
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

  const handleFolderSelected = useCallback(
    async (selection: NasFolderSelection): Promise<void> => {
      // Keep the task 11.5 notification contract for external consumers.
      onFolderSelected?.(selection);

      // Ask the batch conflict policy exactly once, before anything is written.
      const policy = await requestPolicy();
      if (policy == null) {
        return;
      }

      setFolderBusy(true);
      setFolderResult(null);
      try {
        const result = await uploadFolder(selection, policy);
        setFolderResult(result);
        if (result.succeeded > 0 || result.skipped > 0) {
          onUploaded?.();
        }
      } finally {
        setFolderBusy(false);
      }
    },
    [onFolderSelected, onUploaded, requestPolicy, uploadFolder],
  );

  const openFolderPicker = useCallback(async (): Promise<void> => {
    // Chromium exposes the File System Access API, which also enumerates empty
    // sub-folders; everywhere else falls back to `<input webkitdirectory>`.
    if (typeof window !== 'undefined' && window.showDirectoryPicker != null) {
      let handle: FileSystemDirectoryHandle;
      try {
        handle = await window.showDirectoryPicker();
      } catch {
        // The user dismissed the picker — nothing selected, nothing to do.
        return;
      }
      await handleFolderSelected({ kind: 'handle', handle });
      return;
    }
    folderInputRef.current?.click();
  }, [handleFolderSelected]);

  const onFolderInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const picked = e.target.files;
      if (picked != null && picked.length > 0) {
        void handleFolderSelected({
          kind: 'input',
          files: Array.from(picked),
        });
      }
      // Allow re-selecting the same folder later.
      e.target.value = '';
    },
    [handleFolderSelected],
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

      <div className="mt-2">
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary d-inline-flex align-items-center gap-1"
          data-testid="nas-folder-select"
          disabled={folderBusy}
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

      <NasBatchPolicyDialog {...policyDialogProps} />

      {folderBusy && (
        <p
          className="mt-2 small text-muted"
          data-testid="nas-folder-upload-busy"
        >
          {t('nas_storage.folder_upload.in_progress')}
        </p>
      )}

      {folderResult != null && !folderBusy && (
        <div className="mt-2" data-testid="nas-folder-upload-summary">
          <p className="mb-1 small text-muted">
            {t('nas_storage.folder_upload.summary', {
              succeeded: folderResult.succeeded,
              skipped: folderResult.skipped,
              failed: folderResult.failed.length,
            })}
          </p>
          {folderResult.failed.length > 0 && (
            <div
              className="alert alert-warning py-2 px-3 mb-0"
              data-testid="nas-folder-upload-failures"
            >
              <p className="mb-1 small fw-bold">
                {t('nas_storage.folder_upload.failures_title')}
              </p>
              <ul className="mb-0 ps-3 small">
                {folderResult.failed.map((entry) => (
                  <li key={entry.relativePath}>
                    <span className="text-truncate">{entry.relativePath}</span>
                    {' — '}
                    {t(entry.error)}
                  </li>
                ))}
              </ul>
            </div>
          )}
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
