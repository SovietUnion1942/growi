import { useCallback, useMemo, useState } from 'react';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import type { NasPreviewKind } from '../util/nas-preview-kind';
import { getNasPreviewKind } from '../util/nas-preview-kind';

/** apiv3 endpoint that streams a single NAS file body. */
export const NAS_FILE_ENDPOINT = '/_api/v3/nas-storage/file';

/**
 * Build the file-delivery URL for a logical path. With `inline` the server is
 * asked to serve previewable types as `Content-Disposition: inline`; without it
 * the response is always an attachment (the download escape hatch).
 */
export const buildNasFileUrl = (
  logicalPath: string,
  opts?: { inline?: boolean },
): string => {
  const url = `${NAS_FILE_ENDPOINT}?path=${encodeURIComponent(logicalPath)}`;
  return opts?.inline ? `${url}&inline=1` : url;
};

export interface UseNasPreviewResult {
  /** Entry currently being previewed; `null` when the modal is closed. */
  previewEntry: NasEntry | null;
  /** Logical path of the previewed entry; `null` when closed. */
  previewLogicalPath: string | null;
  /** Inline delivery URL for the previewed entry; `null` when closed. */
  previewUrl: string | null;
  /** Preview classification of the previewed entry; `null` when closed or unknown. */
  previewKind: NasPreviewKind | null;
  /** Open the modal for a file. The caller builds the logical path the same way
   * the download control does. */
  openPreview: (logicalPath: string, entry: NasEntry) => void;
  closePreview: () => void;
}

/**
 * Thin state hook for the NAS preview modal (Req 9). No data fetching lives
 * here — the text range-fetch is the modal's concern.
 */
export const useNasPreview = (): UseNasPreviewResult => {
  const [current, setCurrent] = useState<{
    entry: NasEntry;
    logicalPath: string;
  } | null>(null);

  const openPreview = useCallback((logicalPath: string, entry: NasEntry) => {
    setCurrent({ entry, logicalPath });
  }, []);

  const closePreview = useCallback(() => {
    setCurrent(null);
  }, []);

  return useMemo(
    () => ({
      previewEntry: current?.entry ?? null,
      previewLogicalPath: current?.logicalPath ?? null,
      previewUrl:
        current != null
          ? buildNasFileUrl(current.logicalPath, { inline: true })
          : null,
      previewKind:
        current != null ? getNasPreviewKind(current.entry.name) : null,
      openPreview,
      closePreview,
    }),
    [current, openPreview, closePreview],
  );
};
