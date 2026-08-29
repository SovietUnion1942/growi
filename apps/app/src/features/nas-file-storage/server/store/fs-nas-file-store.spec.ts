import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';

import { FsNasFileStore } from './fs-nas-file-store';
import type { FsWritePrimitives } from './fs-write-ops';
import { defaultFsWritePrimitives } from './fs-write-ops';

const EXDEV = (): NodeJS.ErrnoException => {
  return Object.assign(new Error('cross-device link not permitted'), {
    code: 'EXDEV',
  });
};

/** Primitives whose same-volume fast paths always report a cross-device move. */
const exdevPrimitives = (
  overrides?: Partial<FsWritePrimitives>,
): FsWritePrimitives => ({
  ...defaultFsWritePrimitives,
  rename: () => Promise.reject(EXDEV()),
  link: () => Promise.reject(EXDEV()),
  ...overrides,
});

describe('FsNasFileStore', () => {
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

  describe('resolveContentPath', () => {
    test('existing file -> absolute in-root path + entry, no stream', async () => {
      await writeFile(path.join(root, 'deliver.bin'), 'the-bytes');

      const res = await store.resolveContentPath('/deliver.bin');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(path.isAbsolute(res.value.absolutePath)).toBe(true);
      expect(path.basename(res.value.absolutePath)).toBe('deliver.bin');
      expect(res.value.absolutePath.startsWith(root + path.sep)).toBe(true);
      expect(res.value.entry.name).toBe('deliver.bin');
      expect(res.value.entry.type).toBe('file');
      expect(res.value.entry.sizeBytes).toBe('the-bytes'.length);
      expect(() =>
        new Date(res.value.entry.modifiedAt).toISOString(),
      ).not.toThrow();
      expect(res.value.entry.modifiedAt).toBe(
        new Date(res.value.entry.modifiedAt).toISOString(),
      );
      expect(res.value).not.toHaveProperty('stream');
    });

    test('directory target -> IS_DIRECTORY', async () => {
      await mkdir(path.join(root, 'a-dir'));

      const res = await store.resolveContentPath('/a-dir');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('IS_DIRECTORY');
    });

    test('not found -> NOT_FOUND', async () => {
      const res = await store.resolveContentPath('/missing.txt');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });

    test('path escape -> OUT_OF_ROOT', async () => {
      const res = await store.resolveContentPath('../outside');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });

    test('symlink pointing outside root -> OUT_OF_ROOT', async () => {
      await writeFile(path.join(workDir, 'outside-secret.txt'), 'secret');
      await symlink(
        path.join(workDir, 'outside-secret.txt'),
        path.join(root, 'escape-link'),
        'file',
      );

      const res = await store.resolveContentPath('/escape-link');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  const tmpDirName = '.growi-nas-tmp';
  const listTmpLeftovers = async (): Promise<string[]> => {
    try {
      return await readdir(path.join(root, tmpDirName));
    } catch {
      return [];
    }
  };

  describe('moveIntoRoot', () => {
    let src: string;

    beforeEach(async () => {
      src = path.join(workDir, 'upload.tmp');
      await writeFile(src, 'payload-bytes');
    });

    test('same-volume happy path: dest appears, source consumed, entry returned', async () => {
      const res = await store.moveIntoRoot({
        dirLogicalPath: '/docs',
        targetName: 'report.txt',
        sourceTmpPath: src,
        overwrite: false,
      });

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        name: 'report.txt',
        type: 'file',
        sizeBytes: 'payload-bytes'.length,
      });
      await expect(
        readFile(path.join(root, 'docs', 'report.txt'), 'utf8'),
      ).resolves.toBe('payload-bytes');
      await expect(stat(src)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    test('non-overwrite CONFLICT: existing dest untouched', async () => {
      await writeFile(path.join(root, 'keep.txt'), 'original');

      const res = await store.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'keep.txt',
        sourceTmpPath: src,
        overwrite: false,
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('CONFLICT');
      await expect(readFile(path.join(root, 'keep.txt'), 'utf8')).resolves.toBe(
        'original',
      );
    });

    test('overwrite=true replaces the existing dest', async () => {
      await writeFile(path.join(root, 'keep.txt'), 'original');

      const res = await store.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'keep.txt',
        sourceTmpPath: src,
        overwrite: true,
      });

      expect(res.ok).toBe(true);
      await expect(readFile(path.join(root, 'keep.txt'), 'utf8')).resolves.toBe(
        'payload-bytes',
      );
    });

    test('EXDEV fallback (non-overwrite): dest correct, no .growi-nas-tmp leftovers', async () => {
      const store2 = new FsNasFileStore(root, exdevPrimitives());

      const res = await store2.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'moved.txt',
        sourceTmpPath: src,
        overwrite: false,
      });

      expect(res.ok).toBe(true);
      await expect(
        readFile(path.join(root, 'moved.txt'), 'utf8'),
      ).resolves.toBe('payload-bytes');
      expect(await listTmpLeftovers()).toEqual([]);
    });

    test('EXDEV fallback still detects a CONFLICT atomically', async () => {
      await writeFile(path.join(root, 'taken.txt'), 'original');
      const store2 = new FsNasFileStore(root, exdevPrimitives());

      const res = await store2.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'taken.txt',
        sourceTmpPath: src,
        overwrite: false,
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('CONFLICT');
      await expect(
        readFile(path.join(root, 'taken.txt'), 'utf8'),
      ).resolves.toBe('original');
      expect(await listTmpLeftovers()).toEqual([]);
    });

    test('mid-copy read error: no partial dest, no tmp leftovers, {ok:false}', async () => {
      const failingStream = (): NodeJS.ReadableStream => {
        return new Readable({
          read() {
            this.push('half');
            this.destroy(new Error('disk read blew up'));
          },
        });
      };
      const store2 = new FsNasFileStore(
        root,
        exdevPrimitives({ openReadStream: failingStream }),
      );

      const res = await store2.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'broken.txt',
        sourceTmpPath: src,
        overwrite: true,
      });

      expect(res.ok).toBe(false);
      await expect(stat(path.join(root, 'broken.txt'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
      expect(await listTmpLeftovers()).toEqual([]);
    });

    test('two concurrent non-overwrite writes to the same name: exactly one wins', async () => {
      const srcA = path.join(workDir, 'a.tmp');
      const srcB = path.join(workDir, 'b.tmp');
      await writeFile(srcA, 'A');
      await writeFile(srcB, 'B');

      const [a, b] = await Promise.all([
        store.moveIntoRoot({
          dirLogicalPath: '/',
          targetName: 'race.txt',
          sourceTmpPath: srcA,
          overwrite: false,
        }),
        store.moveIntoRoot({
          dirLogicalPath: '/',
          targetName: 'race.txt',
          sourceTmpPath: srcB,
          overwrite: false,
        }),
      ]);

      expect([a.ok, b.ok].sort()).toEqual([false, true]);
      const loser = a.ok ? b : a;
      if (loser.ok) return;
      expect(loser.error.code).toBe('CONFLICT');
    });

    test('path escaping the root -> OUT_OF_ROOT, nothing written', async () => {
      const res = await store.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: '../escaped.txt',
        sourceTmpPath: src,
        overwrite: false,
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
      await expect(
        stat(path.join(workDir, 'escaped.txt')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    });
  });

  describe('mkdir', () => {
    test('creates the directory and returns its entry', async () => {
      const res = await store.mkdir('/', 'new-folder');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value).toMatchObject({
        name: 'new-folder',
        type: 'directory',
      });
      expect((await stat(path.join(root, 'new-folder'))).isDirectory()).toBe(
        true,
      );
    });

    test('existing name -> CONFLICT', async () => {
      await mkdir(path.join(root, 'dup'));

      const res = await store.mkdir('/', 'dup');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('CONFLICT');
    });

    test('escaping path -> OUT_OF_ROOT', async () => {
      const res = await store.mkdir('/', '../evil');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  describe('move', () => {
    test('renames a file, leaving no old path', async () => {
      await writeFile(path.join(root, 'old.txt'), 'data');

      const res = await store.move('/old.txt', '/renamed.txt', false);

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.name).toBe('renamed.txt');
      await expect(
        readFile(path.join(root, 'renamed.txt'), 'utf8'),
      ).resolves.toBe('data');
      await expect(stat(path.join(root, 'old.txt'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    test('moves a directory into a subfolder', async () => {
      await mkdir(path.join(root, 'a'));
      await writeFile(path.join(root, 'a', 'inner.txt'), 'x');
      await mkdir(path.join(root, 'dst'));

      const res = await store.move('/a', '/dst/a', false);

      expect(res.ok).toBe(true);
      await expect(
        readFile(path.join(root, 'dst', 'a', 'inner.txt'), 'utf8'),
      ).resolves.toBe('x');
      await expect(stat(path.join(root, 'a'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    test('non-overwrite over an existing dest -> CONFLICT, both paths intact', async () => {
      await writeFile(path.join(root, 'from.txt'), 'from');
      await writeFile(path.join(root, 'to.txt'), 'to');

      const res = await store.move('/from.txt', '/to.txt', false);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('CONFLICT');
      await expect(readFile(path.join(root, 'from.txt'), 'utf8')).resolves.toBe(
        'from',
      );
      await expect(readFile(path.join(root, 'to.txt'), 'utf8')).resolves.toBe(
        'to',
      );
    });

    test('overwrite=true replaces the destination', async () => {
      await writeFile(path.join(root, 'from.txt'), 'from');
      await writeFile(path.join(root, 'to.txt'), 'to');

      const res = await store.move('/from.txt', '/to.txt', true);

      expect(res.ok).toBe(true);
      await expect(readFile(path.join(root, 'to.txt'), 'utf8')).resolves.toBe(
        'from',
      );
    });

    test('missing source -> NOT_FOUND', async () => {
      const res = await store.move('/nope.txt', '/wherever.txt', false);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });

    test('destination escaping the root -> OUT_OF_ROOT', async () => {
      await writeFile(path.join(root, 'here.txt'), 'x');

      const res = await store.move('/here.txt', '../escaped.txt', false);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  describe('remove', () => {
    test('removes a file', async () => {
      await writeFile(path.join(root, 'gone.txt'), 'x');

      const res = await store.remove('/gone.txt', false);

      expect(res.ok).toBe(true);
      await expect(stat(path.join(root, 'gone.txt'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    test('recursive remove drops a directory and everything under it', async () => {
      await mkdir(path.join(root, 'tree', 'deep'), { recursive: true });
      await writeFile(path.join(root, 'tree', 'deep', 'leaf.txt'), 'x');

      const res = await store.remove('/tree', true);

      expect(res.ok).toBe(true);
      await expect(stat(path.join(root, 'tree'))).rejects.toMatchObject({
        code: 'ENOENT',
      });
    });

    test('non-recursive remove of a non-empty directory -> error, dir kept', async () => {
      await mkdir(path.join(root, 'full'));
      await writeFile(path.join(root, 'full', 'a.txt'), 'x');

      const res = await store.remove('/full', false);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_A_DIRECTORY');
      expect((await stat(path.join(root, 'full'))).isDirectory()).toBe(true);
    });

    test('missing target -> NOT_FOUND', async () => {
      const res = await store.remove('/absent', false);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('NOT_FOUND');
    });

    test('the root itself cannot be removed', async () => {
      await writeFile(path.join(root, 'sentinel.txt'), 'x');

      const res = await store.remove('/', true);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('PERMISSION_DENIED');
      expect((await stat(root)).isDirectory()).toBe(true);
      await expect(
        readFile(path.join(root, 'sentinel.txt'), 'utf8'),
      ).resolves.toBe('x');
    });

    test('escaping path -> OUT_OF_ROOT', async () => {
      const res = await store.remove('../outside', true);

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
    });
  });

  describe('createPart / appendChunk / discardPart / listStaleParts', () => {
    const partPathFor = (uploadId: string): string =>
      path.join(root, tmpDirName, `${uploadId}.part`);

    test('createPart makes a 0-byte .part inside .growi-nas-tmp', async () => {
      const res = await store.createPart('uuid-1');

      expect(res.ok).toBe(true);
      if (!res.ok) return;
      expect(res.value.partPath).toBe(partPathFor('uuid-1'));
      expect(path.dirname(res.value.partPath)).toBe(
        path.join(root, tmpDirName),
      );
      expect((await stat(res.value.partPath)).size).toBe(0);
    });

    test('createPart rejects an unsafe uploadId without creating anything', async () => {
      const res = await store.createPart('../evil');

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('INVALID_PATH');
      expect(await listTmpLeftovers()).toEqual([]);
    });

    test('appendChunk grows the file for in-order chunks and concatenates bytes', async () => {
      const created = await store.createPart('seq');
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { partPath } = created.value;

      const first = await store.appendChunk({
        partPath,
        expectedOffset: 0,
        chunk: Readable.from(Buffer.from('abcd')),
      });
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.size).toBe(4);

      const second = await store.appendChunk({
        partPath,
        expectedOffset: 4,
        chunk: Readable.from(Buffer.from('efg')),
      });
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.size).toBe(7);

      await expect(readFile(partPath, 'utf8')).resolves.toBe('abcdefg');
    });

    test('appendChunk with a mismatched offset -> CHUNK_OUT_OF_ORDER, file unchanged', async () => {
      const created = await store.createPart('ooo');
      expect(created.ok).toBe(true);
      if (!created.ok) return;
      const { partPath } = created.value;

      await store.appendChunk({
        partPath,
        expectedOffset: 0,
        chunk: Readable.from(Buffer.from('abcd')),
      });

      const res = await store.appendChunk({
        partPath,
        expectedOffset: 0,
        chunk: Readable.from(Buffer.from('X')),
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('CHUNK_OUT_OF_ORDER');
      await expect(readFile(partPath, 'utf8')).resolves.toBe('abcd');
    });

    test('appendChunk on a non-existent .part -> UPLOAD_SESSION_NOT_FOUND', async () => {
      const res = await store.appendChunk({
        partPath: partPathFor('never-created'),
        expectedOffset: 0,
        chunk: Readable.from(Buffer.from('x')),
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('UPLOAD_SESSION_NOT_FOUND');
    });

    test('appendChunk refuses a path outside .growi-nas-tmp, leaving it untouched', async () => {
      const outside = path.join(root, 'evil');
      await writeFile(outside, 'original');

      const res = await store.appendChunk({
        partPath: outside,
        expectedOffset: 'original'.length,
        chunk: Readable.from(Buffer.from('-appended')),
      });

      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('OUT_OF_ROOT');
      await expect(readFile(outside, 'utf8')).resolves.toBe('original');
    });

    test('discardPart deletes an existing .part and is a no-op when missing', async () => {
      const created = await store.createPart('to-discard');
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      await store.discardPart(created.value.partPath);
      await expect(stat(created.value.partPath)).rejects.toMatchObject({
        code: 'ENOENT',
      });

      await expect(
        store.discardPart(created.value.partPath),
      ).resolves.toBeUndefined();
    });

    test('discardPart refuses a path outside .growi-nas-tmp', async () => {
      const outside = path.join(root, 'keep.txt');
      await writeFile(outside, 'keep');

      await store.discardPart(outside);

      await expect(readFile(outside, 'utf8')).resolves.toBe('keep');
    });

    test('listStaleParts returns only .part files older than the cutoff', async () => {
      const fresh = await store.createPart('fresh');
      const stale = await store.createPart('stale');
      expect(fresh.ok && stale.ok).toBe(true);
      if (!fresh.ok || !stale.ok) return;

      const old = new Date(Date.now() - 60 * 60 * 1000);
      await utimes(stale.value.partPath, old, old);

      const cutoff = new Date(Date.now() - 30 * 60 * 1000);
      const result = await store.listStaleParts(cutoff);

      expect(result).toEqual([stale.value.partPath]);
    });

    test('listStaleParts returns [] when the tmp dir is missing', async () => {
      await expect(store.listStaleParts(new Date())).resolves.toEqual([]);
    });
  });
});
