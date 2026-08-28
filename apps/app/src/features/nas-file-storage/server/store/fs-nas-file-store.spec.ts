import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';

import { FsNasFileStore } from './fs-nas-file-store';

describe('FsNasFileStore (read operations)', () => {
  let workDir: string;
  let root: string;
  let store: FsNasFileStore;

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'nas-fs-store-'));
    root = path.join(workDir, 'root');
    await mkdir(root, { recursive: true });
    store = new FsNasFileStore(root);
  });

  afterEach(async () => {
    delete process.env.GROWI_NAS_MAX_ENTRIES_PER_DIR;
    await rm(workDir, { recursive: true, force: true });
  });

  const baseQuery = { limit: 100, includeHidden: false } as const;

  describe('list', () => {
    test('returns name/type/size/modifiedAt for the direct children only', async () => {
      await writeFile(path.join(root, 'a.txt'), 'hello');
      await mkdir(path.join(root, 'sub'));
      await writeFile(path.join(root, 'sub', 'nested.txt'), 'deep');

      const res = await store.list('/', baseQuery);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.entries.map((e) => e.name)).toEqual(['a.txt', 'sub']);

      const file = res.value.entries.find((e) => e.name === 'a.txt');
      expect(file?.type).toBe('file');
      expect(file?.sizeBytes).toBe(5);
      expect(() =>
        new Date(file?.modifiedAt ?? '').toISOString(),
      ).not.toThrow();

      const dir = res.value.entries.find((e) => e.name === 'sub');
      expect(dir?.type).toBe('directory');
      expect(dir?.sizeBytes).toBe(0);
    });

    test('cursor paging is stable: no overlap, no gap, stable order', async () => {
      const names = Array.from({ length: 10 }, (_, i) => `f-${i}.txt`);
      for (const name of names) {
        // biome-ignore lint/performance/noAwaitInLoops: test fixture setup
        await writeFile(path.join(root, name), name);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page++) {
        // biome-ignore lint/performance/noAwaitInLoops: sequential paging is the behaviour under test
        const res = await store.list('/', { ...baseQuery, limit: 3, cursor });
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        seen.push(...res.value.entries.map((e) => e.name));
        cursor = res.value.nextCursor;
        if (cursor == null) break;
      }

      expect(cursor).toBeUndefined();
      expect(seen).toEqual([...names].sort());
      expect(new Set(seen).size).toBe(seen.length);
    });

    test('last page carries no nextCursor', async () => {
      await writeFile(path.join(root, 'only.txt'), 'x');

      const res = await store.list('/', { ...baseQuery, limit: 3 });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.nextCursor).toBeUndefined();
    });

    test('returns TOO_MANY_ENTRIES with limitEntries when the dir exceeds maxEntriesPerDir', async () => {
      process.env.GROWI_NAS_MAX_ENTRIES_PER_DIR = '3';
      for (let i = 0; i < 5; i++) {
        // biome-ignore lint/performance/noAwaitInLoops: test fixture setup
        await writeFile(path.join(root, `e-${i}.txt`), '');
      }

      const res = await store.list('/', baseQuery);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('TOO_MANY_ENTRIES');
      expect(res.error.limitEntries).toBe(3);
    });

    test('excludes dot-files and default system names unless includeHidden', async () => {
      await writeFile(path.join(root, 'visible.txt'), 'v');
      await writeFile(path.join(root, '.hidden'), 'h');
      await writeFile(path.join(root, '.DS_Store'), 'd');
      await writeFile(path.join(root, 'Thumbs.db'), 't');
      await mkdir(path.join(root, '@eaDir'));
      await mkdir(path.join(root, '.growi-nas-tmp'));

      const hidden = await store.list('/', {
        ...baseQuery,
        includeHidden: false,
      });
      expect(hidden.ok).toBe(true);
      if (!hidden.ok) return;
      expect(hidden.value.entries.map((e) => e.name)).toEqual(['visible.txt']);

      const shown = await store.list('/', {
        ...baseQuery,
        includeHidden: true,
      });
      expect(shown.ok).toBe(true);
      if (!shown.ok) return;
      expect(shown.value.entries.map((e) => e.name)).toEqual([
        '.DS_Store',
        '.growi-nas-tmp',
        '.hidden',
        '@eaDir',
        'Thumbs.db',
        'visible.txt',
      ]);
    });

    test('lists files created out-of-band (FS is the source of truth)', async () => {
      // Files written directly via fs, never through GROWI.
      await writeFile(path.join(root, 'external-1.txt'), 'x');
      await mkdir(path.join(root, 'external-dir'));

      const res = await store.list('/', baseQuery);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.entries.map((e) => e.name)).toEqual([
        'external-1.txt',
        'external-dir',
      ]);
    });

    test('re-list reflects external add and delete', async () => {
      await writeFile(path.join(root, 'first.txt'), '1');

      const before = await store.list('/', baseQuery);
      expect(before.ok && before.value.entries.map((e) => e.name)).toEqual([
        'first.txt',
      ]);

      await writeFile(path.join(root, 'second.txt'), '2');
      await rm(path.join(root, 'first.txt'));

      const after = await store.list('/', baseQuery);
      expect(after.ok && after.value.entries.map((e) => e.name)).toEqual([
        'second.txt',
      ]);
    });

    test('resolves a symlink to a directory as type "directory"', async () => {
      await mkdir(path.join(root, 'real-dir'));
      await symlink(
        path.join(root, 'real-dir'),
        path.join(root, 'alias'),
        'dir',
      );

      const res = await store.list('/', baseQuery);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.entries.find((e) => e.name === 'alias')?.type).toBe(
        'directory',
      );
    });

    test('rejects a path that escapes the root (delegates to resolveSafePath)', async () => {
      const res = await store.list('../', baseQuery);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });

    test('missing directory -> NOT_FOUND', async () => {
      const res = await store.list('/does-not-exist', baseQuery);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });
  });

  describe('statEntry', () => {
    test('returns the entry for an existing file', async () => {
      await writeFile(path.join(root, 'doc.md'), 'content');

      const res = await store.statEntry('/doc.md');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.name).toBe('doc.md');
      expect(res.value.type).toBe('file');
      expect(res.value.sizeBytes).toBe(7);
    });

    test('not found -> NOT_FOUND', async () => {
      const res = await store.statEntry('/nope.txt');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });

    test('path escape -> OUT_OF_ROOT', async () => {
      const res = await store.statEntry('../../etc/hosts');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  describe('openRead', () => {
    test('streams the file bytes without reading it all into memory', async () => {
      await writeFile(path.join(root, 'payload.bin'), 'the-bytes');

      const res = await store.openRead('/payload.bin');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.entry.name).toBe('payload.bin');
      expect(res.value.stream).not.toBeInstanceOf(Buffer);
      await expect(text(res.value.stream)).resolves.toBe('the-bytes');
    });

    test('directory target -> IS_DIRECTORY', async () => {
      await mkdir(path.join(root, 'a-dir'));

      const res = await store.openRead('/a-dir');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('IS_DIRECTORY');
    });

    test('not found -> NOT_FOUND', async () => {
      const res = await store.openRead('/missing.txt');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });

    test('path escape -> OUT_OF_ROOT', async () => {
      const res = await store.openRead('../secret.txt');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  describe('write operations are deferred to a later task', () => {
    test('moveIntoRoot throws until implemented', async () => {
      await expect(
        store.moveIntoRoot({
          dirLogicalPath: '/',
          targetName: 'x',
          sourceTmpPath: path.join(workDir, 'tmp'),
          overwrite: false,
        }),
      ).rejects.toThrow(/later task/);
    });
  });
});
