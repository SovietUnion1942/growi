import type { JSX, ReactNode } from 'react';
import prettyBytes from 'pretty-bytes';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

type Props = {
  entry: NasEntry;
  onOpenDir: (name: string) => void;
  /** Optional row-action controls (rename / delete) rendered at the row end. */
  actions?: ReactNode;
};

/**
 * One row of the NAS folder listing: type icon, name, size and modified date.
 * A directory name is a button (opens the child folder); a file name is inert
 * here — download lands in a later task.
 */
export const NasEntryRow = ({
  entry,
  onOpenDir,
  actions,
}: Props): JSX.Element => {
  const isDirectory = entry.type === 'directory';

  // `modifiedAt` is typed as an ISO string, but the custom axios instance may
  // hand back a Date (convertStringsToDates). `new Date()` accepts both.
  const modified = new Date(entry.modifiedAt);
  const modifiedLabel = Number.isNaN(modified.getTime())
    ? ''
    : modified.toLocaleString();

  return (
    <li className="list-group-item d-flex align-items-center gap-2">
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
      {actions}
    </li>
  );
};
