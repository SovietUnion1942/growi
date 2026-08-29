import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nasStorageConfig } from './nas-storage-config';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('nasStorageConfig.enabled / isEnabled (GROWI_NAS_ENABLED)', () => {
  it('is false by default (opt-in) even when GROWI_NAS_ROOT is set', () => {
    vi.stubEnv('GROWI_NAS_ENABLED', undefined);
    vi.stubEnv('GROWI_NAS_ROOT', '/nas');

    expect(nasStorageConfig.enabled()).toBe(false);
    expect(nasStorageConfig.isEnabled()).toBe(false);
  });

  it.each([
    'true',
    '1',
    'yes',
    'on',
    'TRUE',
    ' On ',
  ])('is true when GROWI_NAS_ENABLED = %j', (token) => {
    vi.stubEnv('GROWI_NAS_ENABLED', token);
    expect(nasStorageConfig.enabled()).toBe(true);
    expect(nasStorageConfig.isEnabled()).toBe(true);
  });

  it.each([
    'false',
    '0',
    'no',
    'off',
    '',
    '  ',
    'enabled',
  ])('is false when GROWI_NAS_ENABLED = %j', (token) => {
    vi.stubEnv('GROWI_NAS_ENABLED', token);
    expect(nasStorageConfig.enabled()).toBe(false);
  });
});

describe('nasStorageConfig.root / resolveRoot', () => {
  it('returns undefined when GROWI_NAS_ROOT is unset', () => {
    vi.stubEnv('GROWI_NAS_ROOT', undefined);

    expect(nasStorageConfig.root()).toBeUndefined();
    expect(nasStorageConfig.resolveRoot()).toBeUndefined();
  });

  it('treats an empty / whitespace-only GROWI_NAS_ROOT as unset', () => {
    vi.stubEnv('GROWI_NAS_ROOT', '   ');

    expect(nasStorageConfig.root()).toBeUndefined();
  });

  it('resolves GROWI_NAS_ROOT to an absolute path', () => {
    vi.stubEnv('GROWI_NAS_ROOT', '/nas');

    expect(nasStorageConfig.root()).toBe('/nas');
    const resolved = nasStorageConfig.resolveRoot();
    expect(resolved).toBe(path.resolve('/nas'));
    expect(path.isAbsolute(resolved as string)).toBe(true);
  });

  it('resolves a relative GROWI_NAS_ROOT against the process cwd', () => {
    vi.stubEnv('GROWI_NAS_ROOT', 'nas-data');

    const resolved = nasStorageConfig.resolveRoot();
    expect(resolved).toBe(path.resolve('nas-data'));
    expect(path.isAbsolute(resolved as string)).toBe(true);
  });

  it('trims surrounding whitespace before resolving', () => {
    vi.stubEnv('GROWI_NAS_ROOT', '  /nas  ');

    expect(nasStorageConfig.root()).toBe('/nas');
    expect(nasStorageConfig.resolveRoot()).toBe(path.resolve('/nas'));
  });
});

describe('nasStorageConfig.groupName', () => {
  it('returns undefined when GROWI_NAS_GROUP is unset or empty', () => {
    vi.stubEnv('GROWI_NAS_GROUP', undefined);
    expect(nasStorageConfig.groupName()).toBeUndefined();

    vi.stubEnv('GROWI_NAS_GROUP', '  ');
    expect(nasStorageConfig.groupName()).toBeUndefined();
  });

  it('returns the trimmed group name when set', () => {
    vi.stubEnv('GROWI_NAS_GROUP', '  nas-users ');
    expect(nasStorageConfig.groupName()).toBe('nas-users');
  });
});

describe('nasStorageConfig.maxFileSize', () => {
  it('returns undefined (no limit) when unset or empty', () => {
    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', undefined);
    expect(nasStorageConfig.maxFileSize()).toBeUndefined();

    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '');
    expect(nasStorageConfig.maxFileSize()).toBeUndefined();
  });

  it('parses a positive integer byte count', () => {
    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '10485760');
    expect(nasStorageConfig.maxFileSize()).toBe(10485760);
  });

  it('treats non-numeric or non-positive values as unset (no limit)', () => {
    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', 'abc');
    expect(nasStorageConfig.maxFileSize()).toBeUndefined();

    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '-5');
    expect(nasStorageConfig.maxFileSize()).toBeUndefined();

    vi.stubEnv('GROWI_NAS_MAX_FILE_SIZE', '0');
    expect(nasStorageConfig.maxFileSize()).toBeUndefined();
  });
});

describe('nasStorageConfig.showHidden', () => {
  it('defaults to false when unset or empty', () => {
    vi.stubEnv('GROWI_NAS_SHOW_HIDDEN', undefined);
    expect(nasStorageConfig.showHidden()).toBe(false);

    vi.stubEnv('GROWI_NAS_SHOW_HIDDEN', '');
    expect(nasStorageConfig.showHidden()).toBe(false);
  });

  it('is true only for recognised truthy tokens (case/space insensitive)', () => {
    for (const token of ['true', 'TRUE', '1', ' yes ', 'on']) {
      vi.stubEnv('GROWI_NAS_SHOW_HIDDEN', token);
      expect(nasStorageConfig.showHidden()).toBe(true);
    }
  });

  it('is false for other values', () => {
    for (const token of ['false', '0', 'no', 'maybe']) {
      vi.stubEnv('GROWI_NAS_SHOW_HIDDEN', token);
      expect(nasStorageConfig.showHidden()).toBe(false);
    }
  });
});

describe('nasStorageConfig.maxEntriesPerDir', () => {
  it('defaults to 50000 when unset or empty', () => {
    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', undefined);
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(50000);

    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', '   ');
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(50000);
  });

  it('parses a positive integer override', () => {
    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', '1000');
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(1000);
  });

  it('falls back to the default for non-numeric or non-positive values', () => {
    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', 'lots');
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(50000);

    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', '0');
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(50000);

    vi.stubEnv('GROWI_NAS_MAX_ENTRIES_PER_DIR', '-10');
    expect(nasStorageConfig.maxEntriesPerDir()).toBe(50000);
  });
});
