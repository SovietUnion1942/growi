import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { LoadingSpinner } from '@growi/ui/dist/components';
import { useTranslation } from 'next-i18next';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { useNasConfirm } from '../hooks/use-nas-confirm';
import { useNasEntryActions } from '../hooks/use-nas-entry-actions';
import { useNasList } from '../hooks/use-nas-list';
import { useNasPreview } from '../hooks/use-nas-preview';
import { NasConfirmDialog } from './NasConfirmDialog';
import { NasEntryRow } from './NasEntryRow';
import { NasUploadDropzone } from './NasUploadDropzone';

// The preview modal pulls in reactstrap's Modal and an axios text fetch; it is
// never needed for the initial render and must not run during SSR (design:
// 「モーダルは dynamic({ ssr: false })」).
const NasPreviewModal = dynamic(
  () => import('./NasPreviewModal').then((m) => m.NasPreviewModal),
  { ssr: false },
);

type Props = {
  /** Folder to open first. Defaults to the NAS root. */
  initialPath?: string;
};

const toSegments = (path: string): string[] => path.split('/').filter(Boolean);

const buildPath = (segments: string[]): string => `/${segments.join('/')}`;

/**
 * True when `err` carries the `{ code, message }` shape of a `NasRequestError`
 * (its class lives in the hook module; a structural check keeps this component
 * decoupled from it).
 */
const isNasErrorShape = (
  err: unknown,
): err is { code: string; message: string } =>
  typeof err === 'object' &&
  err !== null &&
  typeof (err as { code?: unknown }).code === 'string' &&
  typeof (err as { message?: unknown }).message === 'string';

/**
 * The user-facing i18n key summarising a failed action (Req 8.3 — 理由の要約).
 * Falls back to a generic key for anything that is not a NAS request error.
 */
const extractNasErrorMessage = (err: unknown): string =>
  isNasErrorShape(err) ? err.message : 'nas_storage.error.unknown';

/**
 * File browser for the NAS storage root: breadcrumb + toolbar + entry list with
 * infinite scroll. Owns the current folder path and drives `useNasList` with it;
 * opening a directory or a breadcrumb segment just moves that path. The listing
 * is re-validated against the filesystem via the toolbar refresh control so that
 * changes made outside GROWI show up on re-display (Req 2.3).
 */
export const NasStorageBrowser = ({
  initialPath = '/',
}: Props): JSX.Element => {
  const { t } = useTranslation();

  const [currentPath, setCurrentPath] = useState(initialPath);
  const { entries, loadMore, hasMore, isLoading, error, reload } =
    useNasList(currentPath);

  const segments = toSegments(currentPath);

  const handleOpenDir = useCallback((name: string) => {
    setCurrentPath((prev) => buildPath([...toSegments(prev), name]));
  }, []);

  const actions = useNasEntryActions(currentPath);
  const { confirm, dialogProps } = useNasConfirm();
  const { previewEntry, previewLogicalPath, openPreview, closePreview } =
    useNasPreview();

  const [isNewFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isUploadOpen, setUploadOpen] = useState(false);
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Error surface for action (mutation) failures — distinct from `error`, which
  // is the list-load failure from the hook. Dismissible inline banner (Req 8.3).
  const [actionError, setActionError] = useState<string | null>(null);

  const entryPathOf = useCallback(
    (name: string): string => buildPath([...toSegments(currentPath), name]),
    [currentPath],
  );

  // Native browser download: the <a> GET carries the session cookie, and the
  // server sends `Content-Disposition: attachment` (Req 4.1). Files only — a
  // directory has no downloadable content.
  const downloadUrlOf = useCallback(
    (name: string): string =>
      `/_api/v3/nas-storage/file?path=${encodeURIComponent(entryPathOf(name))}`,
    [entryPathOf],
  );

  // Close the new-folder input on both success and failure — a failed create
  // should be retried from scratch, not from a half-filled field.
  const handleCreateFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (name === '') return;
    try {
      await actions.createFolder(name);
      await reload();
      setActionError(null);
    } catch (err) {
      setActionError(extractNasErrorMessage(err));
    } finally {
      setNewFolderName('');
      setNewFolderOpen(false);
    }
  }, [newFolderName, actions, reload]);

  // Delete always routes through `useNasConfirm` — no destructive action without
  // an explicit answer (Req 5.6).
  const handleDelete = useCallback(
    async (entry: NasEntry) => {
      const ok = await confirm({
        title: t('nas_storage.confirm.delete_title'),
        message: t('nas_storage.confirm.delete_message', { name: entry.name }),
      });
      if (!ok) return;
      try {
        await actions.remove(
          entryPathOf(entry.name),
          entry.type === 'directory',
        );
        await reload();
        setActionError(null);
      } catch (err) {
        setActionError(extractNasErrorMessage(err));
      }
    },
    [confirm, actions, entryPathOf, reload, t],
  );

  // Move without overwrite first; a CONFLICT is the only case that needs the
  // confirm dialog, and only then do we retry with `overwrite: true` (Req 5.6).
  const handleRenameSubmit = useCallback(
    async (entry: NasEntry) => {
      const nextName = renameValue.trim();
      if (nextName === '' || nextName === entry.name) {
        setRenamingName(null);
        return;
      }
      const from = entryPathOf(entry.name);
      const to = entryPathOf(nextName);
      // Close the input on every terminating branch (success or failure): the op
      // is done and any retry starts fresh.
      const closeInput = (): void => {
        setRenamingName(null);
        setRenameValue('');
      };
      try {
        await actions.move(from, to);
      } catch (err) {
        const code = (err as { code?: string } | null)?.code;
        if (code !== 'CONFLICT') {
          setActionError(extractNasErrorMessage(err));
          closeInput();
          return;
        }
        const ok = await confirm({
          title: t('nas_storage.confirm.overwrite_title'),
          message: t('nas_storage.confirm.overwrite_message', {
            name: nextName,
          }),
        });
        if (!ok) {
          closeInput();
          return;
        }
        try {
          await actions.move(from, to, true);
        } catch (retryErr) {
          setActionError(extractNasErrorMessage(retryErr));
          closeInput();
          return;
        }
      }
      await reload();
      setActionError(null);
      closeInput();
    },
    [renameValue, entryPathOf, actions, confirm, reload, t],
  );

  // The hook returns a fresh `loadMore` identity on every render (new closure
  // over `swr.setSize`). Keeping it in a ref lets the observer effect depend on
  // stable signals only, so SWR state churn (validating -> data -> settled) does
  // not tear down and recreate the observer — which previously let a single
  // viewport intersection advance `setSize` more than once.
  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  // Entry count at which we last called `loadMore`. Acts as an in-flight guard
  // without touching the hook: a repeated intersection at the same count is a
  // no-op, and the guard re-arms naturally once the next page grows the list.
  const lastRequestedLenRef = useRef(0);

  // A new folder starts a fresh page series in the hook; re-arm the guard during
  // render so the first intersection in the new folder is honoured.
  const guardedPathRef = useRef(currentPath);
  if (guardedPathRef.current !== currentPath) {
    guardedPathRef.current = currentPath;
    lastRequestedLenRef.current = 0;
  }

  const entriesLength = entries.length;
  const sentinelRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (el == null || !hasMore) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((observerEntries) => {
      if (!observerEntries.some((e) => e.isIntersecting)) return;
      if (!hasMore) return;
      if (entriesLength <= lastRequestedLenRef.current) return;
      lastRequestedLenRef.current = entriesLength;
      loadMoreRef.current();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, entriesLength]);

  let body: JSX.Element;
  if (isLoading && entries.length === 0) {
    body = (
      <div className="text-muted text-center py-5" data-testid="nas-loading">
        <LoadingSpinner className="fs-3" />
      </div>
    );
  } else if (error != null) {
    body = (
      <div className="text-danger py-3" role="alert">
        {t(error.message)}
      </div>
    );
  } else if (entries.length === 0) {
    body = (
      <div className="text-muted text-center py-5">
        {t('nas_storage.empty_folder')}
      </div>
    );
  } else {
    body = (
      <ul className="list-group list-group-flush">
        {entries.map((entry) => (
          <NasEntryRow
            key={`${entry.type}:${entry.name}`}
            entry={entry}
            onOpenDir={handleOpenDir}
            onPreview={
              entry.type === 'file'
                ? () => openPreview(entryPathOf(entry.name), entry)
                : undefined
            }
            actions={
              renamingName === entry.name ? (
                <span className="d-flex align-items-center gap-1">
                  <input
                    className="form-control form-control-sm"
                    data-testid="nas-rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        void handleRenameSubmit(entry);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    data-testid="nas-rename-submit"
                    onClick={() => {
                      void handleRenameSubmit(entry);
                    }}
                  >
                    {t('nas_storage.rename')}
                  </button>
                </span>
              ) : (
                <span className="d-flex align-items-center gap-1">
                  {entry.type === 'file' && (
                    <a
                      className="btn btn-sm btn-outline-secondary"
                      href={downloadUrlOf(entry.name)}
                      download
                    >
                      <span
                        className="material-symbols-outlined"
                        aria-hidden="true"
                      >
                        download
                      </span>
                      <span className="visually-hidden">
                        {t('nas_storage.download')}
                      </span>
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    aria-label={t('nas_storage.rename')}
                    onClick={() => {
                      setRenamingName(entry.name);
                      setRenameValue(entry.name);
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      edit
                    </span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-danger"
                    aria-label={t('nas_storage.delete')}
                    onClick={() => {
                      void handleDelete(entry);
                    }}
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden="true"
                    >
                      delete
                    </span>
                  </button>
                </span>
              )
            }
          />
        ))}
        {hasMore && (
          <li
            ref={sentinelRef}
            data-testid="nas-load-more-sentinel"
            className="list-group-item text-center text-muted small"
          >
            <LoadingSpinner className="me-1" />
            {t('nas_storage.loading_more')}
          </li>
        )}
      </ul>
    );
  }

  return (
    <div className="nas-storage-browser">
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb mb-2">
          <li className="breadcrumb-item">
            <button
              type="button"
              className="btn btn-link p-0 text-decoration-none"
              aria-label={t('nas_storage.breadcrumb_root')}
              onClick={() => setCurrentPath('/')}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                home
              </span>
            </button>
          </li>
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;
            const targetPath = buildPath(segments.slice(0, index + 1));
            return (
              <li
                key={targetPath}
                className={`breadcrumb-item${isLast ? ' active' : ''}`}
              >
                {isLast ? (
                  <span aria-current="page">{segment}</span>
                ) : (
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none"
                    onClick={() => setCurrentPath(targetPath)}
                  >
                    {segment}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div
        className="nas-storage-browser__toolbar d-flex align-items-center gap-2 mb-2"
        data-testid="nas-toolbar"
      >
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          aria-label={t('nas_storage.refresh')}
          onClick={() => {
            void reload();
          }}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            refresh
          </span>
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          aria-label={t('nas_storage.new_folder')}
          onClick={() => setNewFolderOpen((v) => !v)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            create_new_folder
          </span>
        </button>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          aria-label={t('nas_storage.upload_button')}
          onClick={() => setUploadOpen((v) => !v)}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            upload
          </span>
        </button>
      </div>

      {actionError != null && (
        <div
          className="alert alert-danger d-flex align-items-center justify-content-between py-2 mb-2"
          role="alert"
          data-testid="nas-action-error"
        >
          <span>{t(actionError)}</span>
          <button
            type="button"
            className="btn-close"
            aria-label={t('nas_storage.dismiss_error')}
            onClick={() => setActionError(null)}
          />
        </div>
      )}

      {isNewFolderOpen && (
        <div
          className="d-flex align-items-center gap-2 mb-2"
          data-testid="nas-new-folder"
        >
          <input
            className="form-control form-control-sm"
            data-testid="nas-new-folder-input"
            placeholder={t('nas_storage.new_folder')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void handleCreateFolder();
              }
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-primary"
            data-testid="nas-new-folder-submit"
            onClick={() => {
              void handleCreateFolder();
            }}
          >
            {t('nas_storage.new_folder')}
          </button>
        </div>
      )}

      {isUploadOpen && (
        <div className="mb-2">
          <NasUploadDropzone
            currentDirPath={currentPath}
            onUploaded={() => {
              void reload();
            }}
          />
        </div>
      )}

      {body}

      {/* Mounted unconditionally so a pending confirm() is never lost on unmount. */}
      <NasConfirmDialog {...dialogProps} />

      <NasPreviewModal
        entry={previewEntry}
        logicalPath={previewLogicalPath}
        onClose={closePreview}
      />
    </div>
  );
};
