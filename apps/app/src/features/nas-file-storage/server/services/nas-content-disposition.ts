import type { NasPreviewKind } from '../../interfaces';
import { resolveNasPreviewEntry } from '../../interfaces';

/**
 * Delivery decision for a single NAS file: the content type to advertise, whether
 * the browser may render it inline, and (for the client preview UI) which preview
 * category it belongs to.
 */
export interface NasContentDelivery {
  contentType: string;
  disposition: 'inline' | 'attachment';
  /** null when not previewable (always delivered as attachment). */
  previewKind: NasPreviewKind | null;
}

/**
 * Decide how a NAS file should be delivered, from its file name alone.
 *
 * The extension -> metadata classification is owned entirely by
 * `resolveNasPreviewEntry` (`interfaces/nas-preview.ts`), the single source of
 * truth shared with the client's `getNasPreviewKind`, so server and client never
 * disagree. This function only layers the inline/attachment policy on top.
 *
 * Pure: no I/O, no `node:*`, no side effects.
 */
export const nasContentDisposition = (
  fileName: string,
  opts: { inlineRequested: boolean },
): NasContentDelivery => {
  const entry = resolveNasPreviewEntry(fileName);

  // `inline` is granted only when the caller asked for it AND the format is both
  // previewable (`previewKind != null`) and inline-safe by default. Scriptable /
  // dangerous formats (svg, html, xml, js, ...) carry `previewKind: null` and
  // `inlineByDefault: false` in the shared table, so they can never reach
  // `inline` here regardless of `inlineRequested` — that is the Req 9.6 guarantee
  // against stored XSS on the wiki's own origin.
  const disposition: NasContentDelivery['disposition'] =
    opts.inlineRequested && entry.inlineByDefault && entry.previewKind != null
      ? 'inline'
      : 'attachment';

  return {
    contentType: entry.mimeType,
    disposition,
    previewKind: entry.previewKind,
  };
};
