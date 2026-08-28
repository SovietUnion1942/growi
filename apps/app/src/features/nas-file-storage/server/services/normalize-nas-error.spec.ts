import type { NasErrorCode } from '../../interfaces';
import { normalizeNasError } from './normalize-nas-error';

/** Build an fs-style error carrying an errno `code` and a leaky `message`. */
const fsError = (code: string, message: string): NodeJS.ErrnoException => {
  const err = new Error(message) as NodeJS.ErrnoException;
  err.code = code;
  err.errno = -2;
  return err;
};

describe('normalizeNasError', () => {
  describe('fs errno mapping', () => {
    const cases: Array<[string, NasErrorCode]> = [
      ['ENOENT', 'NOT_FOUND'],
      ['EEXIST', 'CONFLICT'],
      ['EACCES', 'PERMISSION_DENIED'],
      ['EPERM', 'PERMISSION_DENIED'],
      ['EISDIR', 'IS_DIRECTORY'],
      ['ENOTDIR', 'NOT_A_DIRECTORY'],
      ['EXDEV', 'UNKNOWN'],
      ['ESOMETHINGELSE', 'UNKNOWN'],
    ];

    test.each(cases)('maps errno %s to %s', (errno, expected) => {
      const result = normalizeNasError(fsError(errno, `${errno}: failure`));
      expect(result.code).toBe(expected);
    });
  });

  describe('root-scoped errors', () => {
    test('ENOENT on the root maps to STORAGE_UNAVAILABLE', () => {
      const result = normalizeNasError(fsError('ENOENT', 'ENOENT'), {
        onRoot: true,
      });
      expect(result.code).toBe('STORAGE_UNAVAILABLE');
    });

    test('EACCES on the root maps to STORAGE_UNAVAILABLE', () => {
      const result = normalizeNasError(fsError('EACCES', 'EACCES'), {
        onRoot: true,
      });
      expect(result.code).toBe('STORAGE_UNAVAILABLE');
    });

    test('EEXIST on the root still maps to CONFLICT (not root-related)', () => {
      const result = normalizeNasError(fsError('EEXIST', 'EEXIST'), {
        onRoot: true,
      });
      expect(result.code).toBe('CONFLICT');
    });

    test('without onRoot, ENOENT / EACCES keep their normal mapping', () => {
      expect(normalizeNasError(fsError('ENOENT', 'x')).code).toBe('NOT_FOUND');
      expect(normalizeNasError(fsError('EACCES', 'x')).code).toBe(
        'PERMISSION_DENIED',
      );
    });
  });

  describe('message never leaks internal detail', () => {
    const leaky = fsError(
      'ENOENT',
      "ENOENT: no such file or directory, open '/srv/nas/secret/passwd'\n    at Object.open (node:fs:123:45)",
    );

    test('output message contains no absolute path, errno, or stack frame', () => {
      const { message } = normalizeNasError(leaky);
      expect(message).not.toContain('/srv/nas');
      expect(message).not.toContain('secret');
      expect(message).not.toContain('ENOENT');
      expect(message).not.toMatch(/\bat /);
      expect(message).not.toMatch(/errno/i);
    });

    test('message is the stable i18n key for the resolved code', () => {
      expect(normalizeNasError(leaky).message).toBe(
        'nas_storage.error.not_found',
      );
      expect(normalizeNasError(fsError('EEXIST', 'x')).message).toBe(
        'nas_storage.error.conflict',
      );
    });

    test('the returned object exposes no errno / path / stack properties', () => {
      const result = normalizeNasError(leaky);
      expect(Object.keys(result).sort()).toEqual(['code', 'message']);
    });
  });

  describe('non-Error and unknown inputs', () => {
    test.each([
      null,
      undefined,
      'boom',
      42,
      {},
      new Error('plain'),
    ])('maps %p to UNKNOWN', (input) => {
      expect(normalizeNasError(input).code).toBe('UNKNOWN');
    });
  });

  describe('pass-through of already-classified codes', () => {
    test.each([
      'OUT_OF_ROOT',
      'INVALID_PATH',
    ] as const)('passes SafePathResult code %s through', (code) => {
      const result = normalizeNasError({ ok: false, code });
      expect(result.code).toBe(code);
      expect(result.message).toBe(`nas_storage.error.${code.toLowerCase()}`);
    });

    test('passes a NasError-shaped input code through and re-derives message', () => {
      const result = normalizeNasError({
        code: 'TOO_LARGE',
        message: 'file /srv/nas/big.bin exceeds limit',
      });
      expect(result.code).toBe('TOO_LARGE');
      expect(result.message).toBe('nas_storage.error.too_large');
    });
  });
});
