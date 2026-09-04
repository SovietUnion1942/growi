/** Minimal HTML-entity escape for text interpolated into the lite templates. */
export const esc = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Escape a value for use inside a double-quoted HTML attribute. */
export const escAttr = (v: string): string => esc(v);
