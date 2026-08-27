// Collapses trivial variants (case, surrounding/internal whitespace) of the
// same search query onto one aggregate row, so "Physics Club" and
// "physics  club" count toward the same suggestion instead of splitting the
// count across near-duplicate rows.
export const normalizeSearchQuery = (rawQuery: string): string => {
  return rawQuery.trim().toLowerCase().replace(/\s+/g, ' ');
};
