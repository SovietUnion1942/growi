import type Crowi from '~/server/crowi';
import loggerFactory from '~/utils/logger';

import { chunkedUploadRegistry } from './services/chunked-upload-registry';
import { rootHealthChecker } from './services/root-health-checker';
import {
  type ChunkedUploadSweeperHandle,
  startChunkedUploadSweeper,
} from './services/start-chunked-upload-sweeper';

export {
  type ChunkedUploadRegistry,
  chunkedUploadRegistry,
  createChunkedUploadRegistry,
} from './services/chunked-upload-registry';

/**
 * Feature-enabled verdict for the client: true only when the boot-fixed root
 * health status is `ready`. Kept in the Express realm (called via the crowi
 * instance from getServerSideProps) so the module-scoped health status is the
 * one `probeOnBoot` actually populated -- see `Crowi#isNasStorageReady`.
 */
export const isNasStorageReady = (): boolean =>
  rootHealthChecker.getStatus().state === 'ready';

export { setupNasStorage } from './routes/nas-storage';
export { setupNasStorageAdmin } from './routes/nas-storage-admin';

const logger = loggerFactory('growi:nas-storage');

/**
 * Live sweeper handle. Module-scoped so a second `initializeNasFileStorage` call
 * (only expected in tests) stops the previous interval instead of stacking one.
 */
let chunkedUploadSweeper: ChunkedUploadSweeperHandle | undefined;

/**
 * Initialize the NAS file storage feature during the Crowi boot sequence.
 *
 * Runs the one-shot root health probe (`RootHealthChecker.probeOnBoot`) that
 * fixes the boot-determined status (`unconfigured` / `misconfigured` / `ready`).
 * A missing or misconfigured root is not an error here — the feature simply
 * stays disabled and every `/api/v3/nas-storage/*` route answers 404 (Req 7.3);
 * the admin status endpoint surfaces the exact reason. This function therefore
 * never throws: a probe failure is logged and swallowed so it cannot abort boot.
 *
 * `crowi` is accepted for boot-signature consistency with the sibling feature
 * initializers; the probe reads its configuration straight from `process.env`.
 */
export const initializeNasFileStorage = async (
  _crowi: Crowi,
): Promise<void> => {
  try {
    await rootHealthChecker.probeOnBoot();
  } catch (err) {
    logger.warn('NAS file storage: root health probe failed on boot', err);
    return;
  }

  const status = rootHealthChecker.getStatus();
  const detail =
    status.state === 'misconfigured'
      ? `${status.state} (${status.reason})`
      : status.state;

  if (status.state === 'ready') {
    logger.info(`NAS file storage: ${detail}`);
    // Orphan `.part` cleanup: one sweep now (Req 10.3) + a periodic sweep after.
    chunkedUploadSweeper?.stop();
    chunkedUploadSweeper = startChunkedUploadSweeper(chunkedUploadRegistry);
    await chunkedUploadSweeper.initialSweep;
  } else {
    logger.warn(`NAS file storage: ${detail}; feature disabled`);
  }
};
