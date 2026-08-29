import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'next-i18next';
import prettyBytes from 'pretty-bytes';
import { useDropzone } from 'react-dropzone';

import type { NasErrorCode } from '~/features/nas-file-storage/interfaces';

import { useNasEntryActions } from '../hooks/use-nas-entry-actions';

type Props = {
  currentDirPath: string;
  onUploaded?: () => void;
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
}: Props): JSX.Element => {
  const { t } = useTranslation();
  const { uploadFile } = useNasEntryActions(currentDirPath);

  const [items, setItems] = useState<QueueItem[]>([]);

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
        await uploadFile(item.file, opts);
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
    [patchItem, uploadFile],
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
