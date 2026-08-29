import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  utimes,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import { FsNasFileStore } from '../store/fs-nas-file-store';
import {
  CHUNK_SIZE,
  createChunkedUploadRegistry,
} from './chunked-upload-registry';

const streamOf = (data: string): NodeJS.ReadableStream => {
  return Readable.from(Buffer.from(data));
};

const TMP_DIR = '.growi-nas-tmp';

const listParts = async (root: string): Promise<string[]> => {
  try {
    return (await readdir(path.join(root, TMP_DIR))).filter((n) =>
      n.endsWith('.part'),
    );
  } catch {
    return [];
  }
};

describe('createChunkedUploadRegistry', () => {
  let workDir: string;
  let root: string;
  let store: FsNasFileStore;
  let clock: Date;

  const now = () => clock;

  const makeRegistry = (
    maxFileSize: () => number | undefined = () => undefined,
  ) => createChunkedUploadRegistry({ store, config: { maxFileSize }, now });

  const baseInput = {
    userId: 'user-a',
    dirLogicalPath: '/',
    targetName: 'out.bin',
    totalBytes: 7,
    overwrite: false,
  };

  beforeEach(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), 'nas-chunk-reg-'));
    root = path.join(workDir, 'root');
    await mkdir(root, { recursive: true });
    store = new FsNasFileStore(root);
    clock = new Date();
  });

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  test('begin creates a .part file and returns uploadId + chunkSize', async () => {
    const registry = makeRegistry();

    const res = await registry.begin(baseInput);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.uploadId).toEqual(expect.any(String));
    expect(res.value.chunkSize).toBe(CHUNK_SIZE);
    expect(await listParts(root)).toEqual([`${res.value.uploadId}.part`]);
  });

  test('sequential append then complete finalizes exactly one file', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    const a = await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));
    expect(a.ok && a.value.receivedBytes).toBe(4);

    const b = await registry.append(uploadId, 'user-a', 4, streamOf('efg'));
    expect(b.ok && b.value.receivedBytes).toBe(7);

    const done = await registry.complete(uploadId, 'user-a');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.name).toBe('out.bin');
    expect(done.value.sizeBytes).toBe(7);

    expect(await readFile(path.join(root, 'out.bin'), 'utf8')).toBe('abcdefg');
    expect(await listParts(root)).toEqual([]);

    // session gone: a second complete is not found
    const again = await registry.complete(uploadId, 'user-a');
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error.code).toBe('UPLOAD_SESSION_NOT_FOUND');
  });

  test('append with a wrong offset is rejected and receivedBytes is unchanged', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));
    const bad = await registry.append(uploadId, 'user-a', 0, streamOf('X'));

    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe('CHUNK_OUT_OF_ORDER');

    const next = await registry.append(uploadId, 'user-a', 4, streamOf('efg'));
    expect(next.ok && next.value.receivedBytes).toBe(7);
  });

  test('append by another user is rejected without touching the store', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');

    const spy = vi.spyOn(store, 'appendChunk');
    const res = await registry.append(
      begun.value.uploadId,
      'user-b',
      0,
      streamOf('abcd'),
    );

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('PERMISSION_DENIED');
    expect(spy).not.toHaveBeenCalled();
  });

  test('append to an unknown uploadId returns UPLOAD_SESSION_NOT_FOUND', async () => {
    const registry = makeRegistry();
    const res = await registry.append('nope', 'user-a', 0, streamOf('x'));

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('UPLOAD_SESSION_NOT_FOUND');
  });

  test('complete rejects and discards when received size != declared total', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));

    const done = await registry.complete(uploadId, 'user-a');
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(done.error.code).toBe('UNKNOWN');

    expect(await listParts(root)).toEqual([]);
    expect(await readdir(root)).not.toContain('out.bin');
  });

  test('complete rejects with TOO_LARGE + limitBytes when the total exceeds the cap', async () => {
    const registry = makeRegistry(() => 5);
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));
    await registry.append(uploadId, 'user-a', 4, streamOf('efg'));

    const done = await registry.complete(uploadId, 'user-a');
    expect(done.ok).toBe(false);
    if (done.ok) return;
    expect(done.error.code).toBe('TOO_LARGE');
    expect(done.error.limitBytes).toBe(5);
    expect(await listParts(root)).toEqual([]);
  });

  test('complete onto an existing target without overwrite returns CONFLICT and cleans up', async () => {
    const registry = makeRegistry();
    await registry.begin(baseInput).then(async (begun) => {
      if (!begun.ok) throw new Error('begin failed');
      await registry.append(
        begun.value.uploadId,
        'user-a',
        0,
        streamOf('abcd'),
      );
      await registry.append(begun.value.uploadId, 'user-a', 4, streamOf('efg'));
      // pre-create the destination
      const seed = await store.moveIntoRoot({
        dirLogicalPath: '/',
        targetName: 'out.bin',
        sourceTmpPath: await seedTmp(root, 'existing'),
        overwrite: false,
      });
      expect(seed.ok).toBe(true);

      const done = await registry.complete(begun.value.uploadId, 'user-a');
      expect(done.ok).toBe(false);
      if (done.ok) return;
      expect(done.error.code).toBe('CONFLICT');
      expect(await listParts(root)).toEqual([]);
      expect(await readFile(path.join(root, 'out.bin'), 'utf8')).toBe(
        'existing',
      );
    });
  });

  test('complete with overwrite replaces the existing target', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin({ ...baseInput, overwrite: true });
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    await store.moveIntoRoot({
      dirLogicalPath: '/',
      targetName: 'out.bin',
      sourceTmpPath: await seedTmp(root, 'old-content'),
      overwrite: false,
    });

    await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));
    await registry.append(uploadId, 'user-a', 4, streamOf('efg'));
    const done = await registry.complete(uploadId, 'user-a');

    expect(done.ok).toBe(true);
    expect(await readFile(path.join(root, 'out.bin'), 'utf8')).toBe('abcdefg');
  });

  test('complete by another user is rejected; owner can still complete afterward', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    await registry.append(uploadId, 'user-a', 0, streamOf('abcd'));
    await registry.append(uploadId, 'user-a', 4, streamOf('efg'));

    const denied = await registry.complete(uploadId, 'user-b');
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.error.code).toBe('PERMISSION_DENIED');

    // the .part is untouched and the session survives
    expect(await listParts(root)).toEqual([`${uploadId}.part`]);

    const done = await registry.complete(uploadId, 'user-a');
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value.sizeBytes).toBe(7);
    expect(await readFile(path.join(root, 'out.bin'), 'utf8')).toBe('abcdefg');
  });

  test('complete for an unknown uploadId returns UPLOAD_SESSION_NOT_FOUND', async () => {
    const registry = makeRegistry();
    const res = await registry.complete('unknown-id', 'user-a');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('UPLOAD_SESSION_NOT_FOUND');
  });

  describe('abort', () => {
    test('discards the .part and drops the session', async () => {
      const registry = makeRegistry();
      const begun = await registry.begin(baseInput);
      if (!begun.ok) throw new Error('begin failed');

      const res = await registry.abort(begun.value.uploadId, 'user-a');
      expect(res.ok).toBe(true);
      expect(await listParts(root)).toEqual([]);
    });

    test('unknown uploadId -> UPLOAD_SESSION_NOT_FOUND', async () => {
      const registry = makeRegistry();
      const res = await registry.abort('nope', 'user-a');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('UPLOAD_SESSION_NOT_FOUND');
    });

    test('wrong user -> PERMISSION_DENIED, .part kept', async () => {
      const registry = makeRegistry();
      const begun = await registry.begin(baseInput);
      if (!begun.ok) throw new Error('begin failed');

      const res = await registry.abort(begun.value.uploadId, 'user-b');
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.error.code).toBe('PERMISSION_DENIED');
      expect(await listParts(root)).toHaveLength(1);
    });
  });

  test('sweepStale reaps expired sessions and orphan .part files, keeps fresh ones', async () => {
    const registry = makeRegistry();

    // a stale session (created "now", clock later jumps forward)
    const stale = await registry.begin(baseInput);
    if (!stale.ok) throw new Error('begin failed');

    // an orphan .part with an old mtime and no tracked session
    const orphan = await store.createPart('orphan-1');
    if (!orphan.ok) throw new Error('createPart failed');
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await utimes(orphan.value.partPath, old, old);

    // advance the clock 25h so the stale session's createdAt is past the cutoff
    clock = new Date(Date.now() + 25 * 60 * 60 * 1000);

    // a fresh session created against the advanced clock
    const fresh = await registry.begin({
      ...baseInput,
      targetName: 'fresh.bin',
    });
    if (!fresh.ok) throw new Error('begin failed');

    await registry.sweepStale();

    const remaining = await listParts(root);
    expect(remaining).toEqual([`${fresh.value.uploadId}.part`]);

    // fresh session still usable, stale one gone
    const staleAppend = await registry.append(
      stale.value.uploadId,
      'user-a',
      0,
      streamOf('x'),
    );
    expect(staleAppend.ok).toBe(false);
    const freshAppend = await registry.append(
      fresh.value.uploadId,
      'user-a',
      0,
      streamOf('abcd'),
    );
    expect(freshAppend.ok).toBe(true);
  });

  test('concurrent appends for one session are serialised in arrival order', async () => {
    const registry = makeRegistry();
    const begun = await registry.begin(baseInput);
    if (!begun.ok) throw new Error('begin failed');
    const { uploadId } = begun.value;

    // the second append's offset assumes the first has already landed;
    // without serialisation it would fail CHUNK_OUT_OF_ORDER
    const [first, second] = await Promise.all([
      registry.append(uploadId, 'user-a', 0, streamOf('abcd')),
      registry.append(uploadId, 'user-a', 4, streamOf('efg')),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.receivedBytes).toBe(7);

    const done = await registry.complete(uploadId, 'user-a');
    expect(done.ok).toBe(true);
    expect(await readFile(path.join(root, 'out.bin'), 'utf8')).toBe('abcdefg');
  });
});

/** Write a scratch file inside the store's tmp dir and return its path. */
const seedTmp = async (root: string, content: string): Promise<string> => {
  const { writeFile } = await import('node:fs/promises');
  const dir = path.join(root, TMP_DIR);
  await mkdir(dir, { recursive: true });
  const p = path.join(dir, `seed-${Math.random().toString(16).slice(2)}.bin`);
  await writeFile(p, content);
  return p;
};
