import { constants as fsConstants } from 'node:fs';
import { access, stat } from 'node:fs/promises';

import type { NasStorageConfig } from '../config/nas-storage-config';
import { nasStorageConfig } from '../config/nas-storage-config';

/**
 * Health state of the configured NAS root.
 *
 * `unconfigured` / `misconfigured` are boot-determined and sticky: once
 * `probeOnBoot` has classified the root as structurally unusable, no later
 * `fs.access` re-check can promote it. Only the `ready` <-> `unavailable` pair
 * moves at runtime (mount dropped mid-operation, then restored).
 */
export type NasRootStatus =
  | { state: 'unconfigured' }
  | {
      state: 'misconfigured';
      reason: 'missing' | 'not-a-directory' | 'not-writable';
    }
  | { state: 'ready'; resolvedRoot: string }
  | { state: 'unavailable'; resolvedRoot: string };

export interface RootHealthChecker {
  /** Run once from the crowi boot sequence to fix the boot-determined status. */
  probeOnBoot(): Promise<void>;
  /** Last computed status, synchronously (in-memory). */
  getStatus(): NasRootStatus;
  /**
   * Lightweight re-check at each operation entry point. Transitions only
   * `ready` <-> `unavailable`; returns any other state unchanged without
   * touching the filesystem.
   */
  ensureReady(): Promise<NasRootStatus>;
}

const READ_WRITE = fsConstants.R_OK | fsConstants.W_OK;

type RootResolver = Pick<NasStorageConfig, 'resolveRoot'>;

const classifyRoot = async (resolvedRoot: string): Promise<NasRootStatus> => {
  const stats = await stat(resolvedRoot).catch(() => null);
  if (stats == null) {
    return { state: 'misconfigured', reason: 'missing' };
  }
  if (!stats.isDirectory()) {
    return { state: 'misconfigured', reason: 'not-a-directory' };
  }
  try {
    await access(resolvedRoot, READ_WRITE);
  } catch {
    return { state: 'misconfigured', reason: 'not-writable' };
  }
  return { state: 'ready', resolvedRoot };
};

/**
 * @param config - injection point for tests; defaults to the real env-backed config.
 * Before `probeOnBoot` runs the status is `unconfigured` — boot must call it.
 */
export const createRootHealthChecker = (
  config: RootResolver = nasStorageConfig,
): RootHealthChecker => {
  let status: NasRootStatus = { state: 'unconfigured' };

  return {
    async probeOnBoot(): Promise<void> {
      const resolvedRoot = config.resolveRoot();
      status =
        resolvedRoot == null
          ? { state: 'unconfigured' }
          : await classifyRoot(resolvedRoot);
    },

    getStatus(): NasRootStatus {
      return status;
    },

    async ensureReady(): Promise<NasRootStatus> {
      if (status.state !== 'ready' && status.state !== 'unavailable') {
        return status;
      }
      const { resolvedRoot } = status;
      try {
        await access(resolvedRoot, READ_WRITE);
        status = { state: 'ready', resolvedRoot };
      } catch {
        status = { state: 'unavailable', resolvedRoot };
      }
      return status;
    },
  };
};

/** Process-wide singleton used by the boot sequence, admin API, and `isEnabled`. */
export const rootHealthChecker = createRootHealthChecker();
