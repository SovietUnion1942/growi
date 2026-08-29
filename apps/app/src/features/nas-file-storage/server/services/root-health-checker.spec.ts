import { constants as fsConstants } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRootHealthChecker } from './root-health-checker';

const runningAsRoot =
  typeof process.getuid === 'function' && process.getuid() === 0;

// Some filesystems (e.g. certain overlay/CI mounts) ignore chmod(0o500); detect
// that so the not-writable case can be skipped rather than fail spuriously.
const chmodEnforcesWrite = async (): Promise<boolean> => {
  const dir = await mkdtemp(path.join(tmpdir(), 'nas-health-chmodprobe-'));
  try {
    await chmod(dir, 0o500);
    try {
      await access(dir, fsConstants.W_OK);
      return false;
    } catch {
      return true;
    }
  } finally {
    await chmod(dir, 0o700).catch(() => undefined);
    await rm(dir, { recursive: true, force: true });
  }
};

describe('createRootHealthChecker', () => {
  let workdir: string;
  const configWithRoot = (root: string | undefined) => ({
    resolveRoot: () => root,
  });

  beforeEach(async () => {
    workdir = await mkdtemp(path.join(tmpdir(), 'nas-health-'));
  });

  afterEach(async () => {
    await chmod(workdir, 0o700).catch(() => undefined);
    await rm(workdir, { recursive: true, force: true });
  });

  describe('GROWI_NAS_ENABLED gate', () => {
    it('reports disabled when enabled() is false, regardless of the root', async () => {
      const checker = createRootHealthChecker({
        resolveRoot: () => workdir,
        enabled: () => false,
      });

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({ state: 'disabled' });
    });

    it('keeps a disabled status untouched through ensureReady (no FS probe)', async () => {
      const checker = createRootHealthChecker({
        resolveRoot: () => workdir,
        enabled: () => false,
      });
      await checker.probeOnBoot();

      expect(await checker.ensureReady()).toEqual({ state: 'disabled' });
    });

    it('proceeds to classify the root when enabled() is true', async () => {
      const checker = createRootHealthChecker({
        resolveRoot: () => workdir,
        enabled: () => true,
      });

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({
        state: 'ready',
        resolvedRoot: path.resolve(workdir),
      });
    });

    it('treats a config without enabled() as opted-in (test-injection default)', async () => {
      const checker = createRootHealthChecker(configWithRoot(workdir));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toMatchObject({ state: 'ready' });
    });
  });

  describe('probeOnBoot', () => {
    it('reports unconfigured when the root is unset', async () => {
      const checker = createRootHealthChecker(configWithRoot(undefined));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({ state: 'unconfigured' });
    });

    it('reports misconfigured/missing when the root path does not exist', async () => {
      const missing = path.join(workdir, 'does-not-exist');
      const checker = createRootHealthChecker(configWithRoot(missing));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({
        state: 'misconfigured',
        reason: 'missing',
      });
    });

    it('reports misconfigured/not-a-directory when the root is a regular file', async () => {
      const file = path.join(workdir, 'a-file');
      await writeFile(file, 'x');
      const checker = createRootHealthChecker(configWithRoot(file));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({
        state: 'misconfigured',
        reason: 'not-a-directory',
      });
    });

    it('reports misconfigured/not-writable when the root dir lacks write permission', async () => {
      if (runningAsRoot || !(await chmodEnforcesWrite())) {
        return;
      }
      const dir = path.join(workdir, 'readonly');
      await mkdir(dir);
      await chmod(dir, 0o500);
      const checker = createRootHealthChecker(configWithRoot(dir));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({
        state: 'misconfigured',
        reason: 'not-writable',
      });
    });

    it('reports ready with the resolvedRoot for a good directory', async () => {
      const checker = createRootHealthChecker(configWithRoot(workdir));

      await checker.probeOnBoot();

      expect(checker.getStatus()).toEqual({
        state: 'ready',
        resolvedRoot: workdir,
      });
    });
  });

  describe('getStatus', () => {
    it('returns unconfigured synchronously before probeOnBoot has run', () => {
      const checker = createRootHealthChecker(configWithRoot(workdir));

      expect(checker.getStatus()).toEqual({ state: 'unconfigured' });
    });
  });

  describe('ensureReady', () => {
    it('cycles ready -> unavailable -> ready as the root disappears and returns', async () => {
      const dir = path.join(workdir, 'root');
      await mkdir(dir);
      const checker = createRootHealthChecker(configWithRoot(dir));

      await checker.probeOnBoot();
      expect(checker.getStatus()).toEqual({
        state: 'ready',
        resolvedRoot: dir,
      });

      await rm(dir, { recursive: true, force: true });
      expect(await checker.ensureReady()).toEqual({
        state: 'unavailable',
        resolvedRoot: dir,
      });
      expect(checker.getStatus()).toEqual({
        state: 'unavailable',
        resolvedRoot: dir,
      });

      await mkdir(dir);
      expect(await checker.ensureReady()).toEqual({
        state: 'ready',
        resolvedRoot: dir,
      });
      expect(checker.getStatus()).toEqual({
        state: 'ready',
        resolvedRoot: dir,
      });
    });

    it('keeps a misconfigured status untouched and does not probe the FS', async () => {
      const file = path.join(workdir, 'a-file');
      await writeFile(file, 'x');
      const checker = createRootHealthChecker(configWithRoot(file));

      await checker.probeOnBoot();
      const before = checker.getStatus();
      expect(before).toEqual({
        state: 'misconfigured',
        reason: 'not-a-directory',
      });

      // Even if the path later becomes a valid dir, ensureReady must not promote it.
      await rm(file);
      await mkdir(file);

      expect(await checker.ensureReady()).toEqual(before);
      expect(checker.getStatus()).toEqual(before);
    });

    it('keeps an unconfigured status untouched', async () => {
      const checker = createRootHealthChecker(configWithRoot(undefined));

      await checker.probeOnBoot();

      expect(await checker.ensureReady()).toEqual({ state: 'unconfigured' });
    });
  });
});
