import type { NasError, NasErrorCode } from '../../interfaces';

/**
 * Convert an arbitrary failure (an `fs` errno error, an already-classified
 * `{ code }` shape from `resolveSafePath` / a `NasError`, or anything else) into
 * a `NasError` safe to hand to the client.
 *
 * The returned `message` is always the stable i18n key `nas_storage.error.<code>`
 * — never an absolute path, errno string/number, or stack frame (Req 8.2). The
 * caller still holds the original `err` and is responsible for `logger.error`-ing
 * the detail (Req 8.3); this function deliberately does not log or swallow.
 */
export const normalizeNasError = (
  err: unknown,
  opts?: { onRoot?: boolean },
): NasError => {
  return toNasError(resolveCode(err, opts?.onRoot ?? false));
};

const KNOWN_CODES: ReadonlySet<NasErrorCode> = new Set<NasErrorCode>([
  'NOT_FOUND',
  'CONFLICT',
  'OUT_OF_ROOT',
  'INVALID_PATH',
  'IS_DIRECTORY',
  'NOT_A_DIRECTORY',
  'PERMISSION_DENIED',
  'STORAGE_UNAVAILABLE',
  'TOO_LARGE',
  'TOO_MANY_ENTRIES',
  'UPLOAD_SESSION_NOT_FOUND',
  'CHUNK_OUT_OF_ORDER',
  'UNKNOWN',
]);

// fs errno -> NasErrorCode. See design "Error Handling -> Error Strategy".
// EXDEV is an internal concern (cross-device rename handled by copy+unlink); if
// it ever surfaces here it is unexpected, hence UNKNOWN.
const ERRNO_TO_CODE: Readonly<Record<string, NasErrorCode>> = {
  ENOENT: 'NOT_FOUND',
  EEXIST: 'CONFLICT',
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  EISDIR: 'IS_DIRECTORY',
  ENOTDIR: 'NOT_A_DIRECTORY',
};

// errno values that mean "the root itself is gone / unreachable" when the caller
// flags the operation as touching the root (mount dropped, permissions revoked).
const ROOT_UNAVAILABLE_ERRNOS: ReadonlySet<string> = new Set([
  'ENOENT',
  'EACCES',
]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value != null;
};

const readCode = (value: Record<string, unknown>): string | undefined => {
  return typeof value.code === 'string' ? value.code : undefined;
};

const resolveCode = (err: unknown, onRoot: boolean): NasErrorCode => {
  if (!isRecord(err)) {
    return 'UNKNOWN';
  }

  const code = readCode(err);
  if (code == null) {
    return 'UNKNOWN';
  }

  // Already-classified input: a NasError or a SafePathResult `{ ok: false, code }`.
  if ((KNOWN_CODES as ReadonlySet<string>).has(code)) {
    return code as NasErrorCode;
  }

  if (onRoot && ROOT_UNAVAILABLE_ERRNOS.has(code)) {
    return 'STORAGE_UNAVAILABLE';
  }

  return ERRNO_TO_CODE[code] ?? 'UNKNOWN';
};

const toNasError = (code: NasErrorCode): NasError => {
  return { code, message: `nas_storage.error.${code.toLowerCase()}` };
};
