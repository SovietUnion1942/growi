import type { NasPreviewKind } from '../../interfaces';
import { resolveNasPreviewEntry } from '../../interfaces';

export type { NasPreviewKind };

/**
 * Client-side preview classification for a NAS file name.
 *
 * Delegates entirely to the shared `interfaces/nas-preview` table via
 * `resolveNasPreviewEntry`, which is also the sole source consulted by the
 * server's `nasContentDisposition`. This guarantees the browser preview UI and
 * the download endpoint can never disagree on which files are previewable.
 *
 * Returns `null` for any format that must not be rendered in the browser
 * (scriptable / dangerous formats, unknown extensions, extensionless names).
 *
 * Pure: no I/O, no `node:*`, no React, no DOM.
 */
export const getNasPreviewKind = (fileName: string): NasPreviewKind | null => {
  return resolveNasPreviewEntry(fileName).previewKind;
};
