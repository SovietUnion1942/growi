import type { JSX } from 'react';
import { useTranslation } from 'next-i18next';
import prettyBytes from 'pretty-bytes';

import type { NasStorageUsage } from '~/features/nas-file-storage/interfaces';

type Props = {
  usage: NasStorageUsage | undefined;
};

/** Bootstrap contextual class for the fill, escalating as the volume fills. */
const barVariant = (ratio: number): string => {
  if (ratio >= 0.95) return 'bg-danger';
  if (ratio >= 0.8) return 'bg-warning';
  return '';
};

/**
 * Storage-capacity bar for the NAS root: a progress bar plus "used / total"
 * and the free remainder. Renders nothing until the first reading arrives or
 * when the total is unknown (0) — a bar with no scale is noise.
 */
export const NasStorageUsageBar = ({ usage }: Props): JSX.Element | null => {
  const { t } = useTranslation();

  if (usage == null || usage.totalBytes <= 0) {
    return null;
  }

  const ratio = Math.min(1, usage.usedBytes / usage.totalBytes);
  const percent = Math.round(ratio * 100);

  return (
    <div className="mb-2" data-testid="nas-usage-bar">
      <div className="d-flex justify-content-between small text-muted mb-1">
        <span>{t('nas_storage.usage.label')}</span>
        <span data-testid="nas-usage-summary">
          {t('nas_storage.usage.summary', {
            percent,
            used: prettyBytes(usage.usedBytes),
            total: prettyBytes(usage.totalBytes),
            free: prettyBytes(usage.freeBytes),
          })}
        </span>
      </div>
      <div
        className="progress"
        style={{ height: '6px' }}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`progress-bar ${barVariant(ratio)}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};
