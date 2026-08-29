/**
 * Shared upload-name validation and the folder-selection shape.
 *
 * Extracted here so `NasUploadDropzone` and `useNasFolderUpload` can both use
 * them without a circular value import between the component and the hook
 * (see `apps/app/.claude/rules/esm-authoring.md`).
 */

/**
 * Two shapes because the two selection mechanisms yield different things: the
 * File System Access API hands back a live directory handle (which also exposes
 * empty sub-folders), the `<input webkitdirectory>` fallback hands back a flat
 * `File[]` carrying `webkitRelativePath`.
 */
export type NasFolderSelection =
  | { kind: 'handle'; handle: FileSystemDirectoryHandle }
  | { kind: 'input'; files: File[] };

const MAX_NAME_LENGTH = 255;

/**
 * Client-side name check mirroring the server's rules (the server stays the
 * final authority). Returns an i18n key when the name is not acceptable, or
 * `null` when the name is fine. Applied per path segment for folder uploads.
 */
export const validateNasUploadName = (name: string): string | null => {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return 'nas_storage.upload.invalid_name_empty';
  }
  if (trimmed === '.' || trimmed === '..') {
    return 'nas_storage.upload.invalid_name_dots';
  }
  if (/[/\\]/.test(name)) {
    return 'nas_storage.upload.invalid_name_separator';
  }
  if (name.length > MAX_NAME_LENGTH) {
    return 'nas_storage.upload.invalid_name_length';
  }
  return null;
};
