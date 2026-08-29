/**
 * Client-safe preview / delivery metadata for NAS files.
 *
 * This module is a pure `const` table plus one pure lookup helper — it imports
 * nothing (no `node:*`, no I/O) so it is safe to import from browser code. It is
 * the single source of truth shared by the server `nasContentDisposition` and
 * the client `getNasPreviewKind`, so their decisions never diverge.
 */

/**
 * In-browser preview category. Erasable const-union (this repo bans `enum`).
 * `null` elsewhere in this module means "not previewable — deliver as attachment".
 */
export type NasPreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text';

export interface NasPreviewEntry {
  /** null when the format must not be rendered in the browser. */
  readonly previewKind: NasPreviewKind | null;
  /** Content type to advertise on delivery (MIME-equivalent). */
  readonly mimeType: string;
  /** Whether `inline` delivery is allowed by default for this format. */
  readonly inlineByDefault: boolean;
}

const image = (mimeType: string): NasPreviewEntry => ({
  previewKind: 'image',
  mimeType,
  inlineByDefault: true,
});
const video = (mimeType: string): NasPreviewEntry => ({
  previewKind: 'video',
  mimeType,
  inlineByDefault: true,
});
const audio = (mimeType: string): NasPreviewEntry => ({
  previewKind: 'audio',
  mimeType,
  inlineByDefault: true,
});
const text: NasPreviewEntry = {
  previewKind: 'text',
  mimeType: 'text/plain',
  inlineByDefault: true,
};

/**
 * Script-capable / dangerous formats. Always delivered as `attachment` with
 * `previewKind: null` — an inline request must never override this, because these
 * are served from the same origin as GROWI's authenticated session (stored XSS).
 * The advertised MIME type is deliberately non-executable where a text-like type
 * would otherwise tempt the browser to run the content.
 */
const scriptable = (mimeType: string): NasPreviewEntry => ({
  previewKind: null,
  mimeType,
  inlineByDefault: false,
});

/** The fallback for any extension not in the table (and for extensionless names). */
export const NAS_PREVIEW_FALLBACK: NasPreviewEntry = {
  previewKind: null,
  mimeType: 'application/octet-stream',
  inlineByDefault: false,
};

/**
 * lowercase extension (no leading dot) -> delivery metadata.
 * Keyed by extension (unlike GROWI's MIME-keyed `defaultContentDispositionSettings`)
 * but mirrors the same classification philosophy.
 */
export const NAS_PREVIEW_TABLE: Readonly<Record<string, NasPreviewEntry>> = {
  // images
  jpg: image('image/jpeg'),
  jpeg: image('image/jpeg'),
  png: image('image/png'),
  gif: image('image/gif'),
  webp: image('image/webp'),
  avif: image('image/avif'),
  bmp: image('image/bmp'),
  ico: image('image/x-icon'),

  // video
  mp4: video('video/mp4'),
  webm: video('video/webm'),
  ogv: video('video/ogg'),
  mov: video('video/quicktime'),
  m4v: video('video/x-m4v'),

  // audio
  mp3: audio('audio/mpeg'),
  wav: audio('audio/wav'),
  ogg: audio('audio/ogg'),
  oga: audio('audio/ogg'),
  m4a: audio('audio/mp4'),
  flac: audio('audio/flac'),
  aac: audio('audio/aac'),

  // pdf
  pdf: {
    previewKind: 'pdf',
    mimeType: 'application/pdf',
    inlineByDefault: true,
  },

  // text (always served as text/plain so the browser never executes it)
  txt: text,
  md: text,
  markdown: text,
  csv: text,
  tsv: text,
  log: text,
  ini: text,
  conf: text,
  yaml: text,
  yml: text,
  ts: text,
  tsx: text,
  jsx: text,
  py: text,
  rb: text,
  go: text,
  rs: text,
  c: text,
  h: text,
  cpp: text,
  java: text,
  sh: text,
  css: text,
  sql: text,

  // scriptable / dangerous -> always attachment, never inline
  svg: scriptable('image/svg+xml'),
  html: scriptable('text/plain'),
  htm: scriptable('text/plain'),
  xhtml: scriptable('text/plain'),
  xml: scriptable('application/xml'),
  js: scriptable('text/plain'),
  mjs: scriptable('text/plain'),
  cjs: scriptable('text/plain'),
};

const extractExtension = (fileName: string): string | null => {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return null;
  }
  return fileName.slice(lastDot + 1).toLowerCase();
};

/**
 * Look up delivery metadata for a file name. Pure: lowercases, takes the
 * extension after the last dot, and reads {@link NAS_PREVIEW_TABLE}. Unknown or
 * extensionless names return {@link NAS_PREVIEW_FALLBACK}.
 */
export const resolveNasPreviewEntry = (fileName: string): NasPreviewEntry => {
  const ext = extractExtension(fileName);
  if (ext == null) {
    return NAS_PREVIEW_FALLBACK;
  }
  return NAS_PREVIEW_TABLE[ext] ?? NAS_PREVIEW_FALLBACK;
};
