/**
 * A reusable chunk of board content (a `tldraw` `TLContent` snapshot) that a
 * member saved from a board and can drop onto any other board. Shared
 * club-wide -- everyone sees every template.
 */
export type BoardTemplateSummary = {
  _id: string;
  name: string;
  description: string;
  /** PNG data URI, generated from the content when the template was saved */
  thumbnail: string | null;
  createdByName: string | null;
  createdAt: string;
  isOwn: boolean;
};

export type BoardTemplateWithContent = BoardTemplateSummary & {
  /** a `tldraw` `TLContent` object */
  content: unknown;
};

export const BOARD_TEMPLATE_NAME_MAX = 80;
export const BOARD_TEMPLATE_DESCRIPTION_MAX = 500;
/** cap the stored snapshot + thumbnail so one template can't bloat the DB */
export const BOARD_TEMPLATE_CONTENT_MAX_BYTES = 2 * 1024 * 1024;
export const BOARD_TEMPLATE_THUMBNAIL_MAX_BYTES = 256 * 1024;

/** upload cap for a board image asset (D&D / paste / file picker) */
export const BOARD_ASSET_MAX_BYTES = 20 * 1024 * 1024;
export const BOARD_ASSET_ALLOWED_MIME = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
] as const;
