import loggerFactory from '~/utils/logger';

import type { ChunkedUploadRegistry } from './chunked-upload-registry';

const defaultLogger = loggerFactory('growi:nas-storage:chunked-upload-sweeper');

/**
 * Default gap between periodic stale-session / orphan `.part` sweeps (1h).
 * The reap threshold itself (24h) lives in `ChunkedUploadRegistry.sweepStale`.
 */
export const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

type SweeperLogger = Pick<ReturnType<typeof loggerFactory>, 'error'>;

export interface StartChunkedUploadSweeperOptions {
  /** Override the 1h default (tests). */
  intervalMs?: number;
  /** Override the module logger (tests). */
  logger?: SweeperLogger;
}

export interface ChunkedUploadSweeperHandle {
  /**
   * Settles when the boot-time sweep finishes. Never rejects — a failed sweep is
   * logged and swallowed so it cannot abort the boot sequence.
   */
  readonly initialSweep: Promise<void>;
  /** Stop the periodic sweep (clears the interval). */
  stop(): void;
}

/**
 * Run `registry.sweepStale()` once immediately, then on a fixed interval
 * (design: "起動時に 1 回＋定期"). Rejections from any run are caught and logged
 * so neither the boot sequence nor the timer is ever taken down by a bad sweep.
 * The interval is `unref`'d, so it never keeps the Node process alive.
 */
export const startChunkedUploadSweeper = (
  registry: Pick<ChunkedUploadRegistry, 'sweepStale'>,
  options: StartChunkedUploadSweeperOptions = {},
): ChunkedUploadSweeperHandle => {
  const intervalMs = options.intervalMs ?? SWEEP_INTERVAL_MS;
  const logger = options.logger ?? defaultLogger;

  const runSweep = (): Promise<void> =>
    registry.sweepStale().catch((err) => {
      logger.error('nas-storage: chunked-upload sweepStale failed', err);
    });

  const initialSweep = runSweep();

  const timer = setInterval(() => {
    void runSweep();
  }, intervalMs);
  timer.unref?.();

  return {
    initialSweep,
    stop() {
      clearInterval(timer);
    },
  };
};
