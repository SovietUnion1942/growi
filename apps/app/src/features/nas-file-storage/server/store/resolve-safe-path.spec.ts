import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { resolveSafePath } from './resolve-safe-path';

describe('resolveSafePath', () => {
  let workDir: string;
  let root: string;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'nas-safe-path-'));
    root = path.join(workDir, 'root');
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('resolves a normal nested path to an absolute path within root', async () => {
    const result = await resolveSafePath(root, '/docs/report.txt');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe(path.join(root, 'docs', 'report.txt'));
      expect(result.absolutePath.startsWith(root + path.sep)).toBe(true);
      expect(result.logicalPath).toBe('/docs/report.txt');
    }
  });

  test('resolves the root itself for "/"', async () => {
    const result = await resolveSafePath(root, '/');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe(root);
      expect(result.logicalPath).toBe('/');
    }
  });

  test('a non-existent leaf whose parent exists within root is ok', async () => {
    await mkdir(path.join(root, 'sub'), { recursive: true });

    const result = await resolveSafePath(root, '/sub/not-created-yet.bin');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe(
        path.join(root, 'sub', 'not-created-yet.bin'),
      );
    }
  });

  test('a single "../" that escapes root is rejected as OUT_OF_ROOT', async () => {
    const result = await resolveSafePath(root, '../secret.txt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });

  test('a chained "../../etc/passwd" traversal is rejected as OUT_OF_ROOT', async () => {
    const result = await resolveSafePath(
      root,
      'a/b/../../../../../../etc/passwd',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });

  test('never returns ok:true for a traversal that would escape root', async () => {
    const result = await resolveSafePath(root, 'x/../../../../tmp');

    expect(result.ok).toBe(false);
  });

  test('absolute-path injection ("/etc/passwd") is contained to root, never escapes', async () => {
    const result = await resolveSafePath(root, '/etc/passwd');

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe(path.join(root, 'etc', 'passwd'));
      expect(
        result.absolutePath === root ||
          result.absolutePath.startsWith(root + path.sep),
      ).toBe(true);
    }
  });

  test('a Windows-style absolute path is rejected as INVALID_PATH', async () => {
    const result = await resolveSafePath(root, 'C:\\Windows\\system32');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_PATH');
    }
  });

  test('a NUL byte in the path is rejected as INVALID_PATH', async () => {
    const result = await resolveSafePath(root, '/docs/\u0000evil');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('INVALID_PATH');
    }
  });

  test('a symlink inside root pointing outside root escapes -> OUT_OF_ROOT', async () => {
    const outside = path.join(workDir, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(path.join(outside, 'secret.txt'), 'top secret');
    await symlink(outside, path.join(root, 'link'), 'dir');

    const result = await resolveSafePath(root, '/link/secret.txt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });

  test('a symlink inside root whose target is a fully absent path outside root -> OUT_OF_ROOT', async () => {
    // The symlink target does not exist at all (dangling). The link must still be
    // recognised as an escape so a later mkdir -p / write cannot follow it out.
    const outside = path.join(workDir, 'outside');
    await symlink(outside, path.join(root, 'link'), 'dir');

    const result = await resolveSafePath(root, '/link/never-existed.txt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });

  test('a symlink inside root whose target parent exists but is outside root, leaf absent -> OUT_OF_ROOT', async () => {
    const outsideParent = path.join(workDir, 'outside');
    await mkdir(outsideParent, { recursive: true });
    // Parent (workDir/outside) exists, but the link target leaf (missing) does not.
    await symlink(
      path.join(outsideParent, 'missing'),
      path.join(root, 'link'),
      'dir',
    );

    const result = await resolveSafePath(root, '/link/child.txt');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });

  test('a symlink inside root pointing to another location inside root stays ok', async () => {
    await mkdir(path.join(root, 'real'), { recursive: true });
    await writeFile(path.join(root, 'real', 'a.txt'), 'a');
    await symlink(path.join(root, 'real'), path.join(root, 'alias'), 'dir');

    const result = await resolveSafePath(root, '/alias/a.txt');

    expect(result.ok).toBe(true);
  });

  test('accepts pre-split segments instead of a logical path string', async () => {
    const result = await resolveSafePath(root, '', ['docs', 'a', 'b.txt']);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.absolutePath).toBe(path.join(root, 'docs', 'a', 'b.txt'));
    }
  });

  test('segments containing ".." that escape are rejected', async () => {
    const result = await resolveSafePath(root, '', ['..', '..', 'etc']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('OUT_OF_ROOT');
    }
  });
});
