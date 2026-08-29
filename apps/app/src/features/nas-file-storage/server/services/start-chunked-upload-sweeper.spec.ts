import { mkdir, mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mock } from 'vitest-mock-extended';

import { FsNasFileStore } from '../store/fs-nas-file-store';
import type { ChunkedUploadRegistry } from './chunked-upload-registry';
import { createChunkedUploadRegistry } from './chunked-upload-registry';
import {
  SWEEP_INTERVAL_MS,
  startChunkedUploadSweeper,
} from './start-chunked-upload-sweeper';

describe('startChunkedUploadSweeper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs sweepStale once immediately, then on each interval tick', async () => {
    const registry = mock<ChunkedUploadRegistry>();
    registry.sweepStale.mockResolvedValue();

    const handle = startChunkedUploadSweeper(registry, { intervalMs: 1000 });
    await handle.initialSweep;
    expect(registry.sweepStale).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(registry.sweepStale).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(registry.sweepStale).toHaveBeenCalledTimes(3);

    handle.stop();
  });

  it('stop() clears the interval so no further sweeps fire', async () => {
    const registry = mock<ChunkedUploadRegistry>();
    registry.sweepStale.mockResolvedValue();

    const handle = startChunkedUploadSweeper(registry, { intervalMs: 1000 });
    await handle.initialSweep;
    handle.stop();

    await vi.advanceTimersByTimeAsync(5000);
    expect(registry.sweepStale).toHaveBeenCalledTimes(1);
  });

  it('catches and logs a rejected sweepStale without an unhandled rejection', async () => {
    const registry = mock<ChunkedUploadRegistry>();
    registry.sweepStale.mockRejectedValue(new Error('disk gone'));
    const logger = { error: vi.fn() };

    const handle = startChunkedUploadSweeper(registry, {
      intervalMs: 1000,
      logger,
    });
    await expect(handle.initialSweep).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(logger.error).toHaveBeenCalledTimes(2);

    handle.stop();
  });

  it('does not keep the process alive (interval is unref-ed)', () => {
    const registry = mock<ChunkedUploadRegistry>();
    registry.sweepStale.mockResolvedValue();
    const unref = vi.spyOn(global, 'setInterval');

    const handle = startChunkedUploadSweeper(registry, { intervalMs: 1000 });
    const timer = unref.mock.results[0]?.value as ReturnType<
      typeof setInterval
    >;
    // Node timers expose hasRef(); an unref-ed timer reports false.
    expect(timer.hasRef()).toBe(false);

    handle.stop();
    unref.mockRestore();
  });

  it('defaults the interval to one hour', () => {
    const registry = mock<ChunkedUploadRegistry>();
    registry.sweepStale.mockResolvedValue();
    const spy = vi.spyOn(global, 'setInterval');

    const handle = startChunkedUploadSweeper(registry);
    expect(spy).toHaveBeenCalledWith(expect.any(Function), SWEEP_INTERVAL_MS);
    expect(SWEEP_INTERVAL_MS).toBe(60 * 60 * 1000);

    handle.stop();
    spy.mockRestore();
  });

  it('actually reaps an old orphan .part on the boot-time sweep (real registry)', async () => {
    vi.useRealTimers();
    const workDir = await mkdtemp(path.join(tmpdir(), 'nas-sweeper-'));
    const root = path.join(workDir, 'root');
    await mkdir(root, { recursive: true });
    const store = new FsNasFileStore(root);
    const registry = createChunkedUploadRegistry({
      store,
      config: { maxFileSize: () => undefined },
    });

    const orphan = await store.createPart('orphan-1');
    if (!orphan.ok) throw new Error('createPart failed');
    const old = new Date(Date.now() - 26 * 60 * 60 * 1000);
    await utimes(orphan.value.partPath, old, old);

    const handle = startChunkedUploadSweeper(registry, {
      intervalMs: SWEEP_INTERVAL_MS,
    });
    await handle.initialSweep;
    handle.stop();

    const remaining = (await readdir(path.join(root, '.growi-nas-tmp'))).filter(
      (n) => n.endsWith('.part'),
    );
    expect(remaining).toEqual([]);

    await rm(workDir, { recursive: true, force: true });
  });
});
