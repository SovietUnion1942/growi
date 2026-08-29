import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'next-i18next';
import prettyBytes from 'pretty-bytes';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { getNasPreviewKind } from '../util/nas-preview-kind';

type Props = {
  entry: NasEntry;
  onOpenDir: (name: string) => void;
  /**
   * Open the in-browser preview for this file. The browser owns the modal state;
   * the row only renders the trigger, and only for a previewable file (Req 9.1).
   * Omitted for directories and non-previewable files (Req 9.4).
   */
  onPreview?: () => void;
  /** Optional row-action controls (rename / delete) rendered at the row end. */
  actions?: ReactNode;
};

/**
 * One row of the NAS folder listing: type icon, name, size and modified date.
 * A directory name is a button (opens the child folder); a file name is plain
 * text — the row-action slot carries the file download control (see
 * `NasStorageBrowser`, which owns `currentPath`).
 */
export const NasEntryRow = ({
  entry,
  onOpenDir,
  onPreview,
  actions,
}: Props): JSX.Element => {
  const { t } = useTranslation();

  const isDirectory = entry.type === 'directory';

  // A preview trigger appears only for a file whose extension the shared table
  // classifies as previewable (Req 9.1); a null kind means download-only (Req 9.4).
  const canPreview =
    !isDirectory && onPreview != null && getNasPreviewKind(entry.name) != null;

  // `modifiedAt` is typed as an ISO string, but the custom axios instance may
  // hand back a Date (convertStringsToDates). `new Date()` accepts both.
  const modified = new Date(entry.modifiedAt);
  const modifiedLabel = Number.isNaN(modified.getTime())
    ? ''
    : modified.toLocaleString();

  return (
    <li
      className="list-group-item d-flex align-items-center gap-2"
      data-testid="nas-entry-row"
    >
      <span className="material-symbols-outlined" aria-hidden="true">
        {isDirectory ? 'folder' : 'draft'}
      </span>
      <span className="flex-grow-1 text-truncate">
        {isDirectory ? (
          <button
            type="button"
            className="btn btn-link p-0 text-start text-decoration-none"
            onClick={() => onOpenDir(entry.name)}
          >
            {entry.name}
          </button>
        ) : (
          <span>{entry.name}</span>
        )}
      </span>
      <span className="text-muted small text-end" data-testid="nas-entry-size">
        {isDirectory ? '—' : prettyBytes(entry.sizeBytes)}
      </span>
      <span
        className="text-muted small text-end"
        data-testid="nas-entry-modified"
      >
        {modifiedLabel}
      </span>
      {canPreview && (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          data-testid="nas-entry-preview"
          onClick={onPreview}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            visibility
          </span>
          <span className="visually-hidden">
            {t('nas_storage.preview.action')}
          </span>
        </button>
      )}
      {actions}
    </li>
  );
};
