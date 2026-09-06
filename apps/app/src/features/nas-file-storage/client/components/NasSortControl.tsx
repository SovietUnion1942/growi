import type { JSX } from 'react';
import { useTranslation } from 'next-i18next';

import type { NasSortKey } from '../util/nas-entry-sort';
import { DEFAULT_SORT_DIR, type NasSortDir } from '../util/nas-entry-sort';

type Props = {
  sortKey: NasSortKey;
  sortDir: NasSortDir;
  onChange: (key: NasSortKey, dir: NasSortDir) => void;
};

const KEYS: readonly NasSortKey[] = ['name', 'modified', 'size'];

/**
 * Segmented sort control for the NAS folder listing. Clicking the active key
 * flips its direction; clicking another key switches to it with that key's
 * default direction (name asc, modified/size desc).
 */
export const NasSortControl = ({
  sortKey,
  sortDir,
  onChange,
}: Props): JSX.Element => {
  const { t } = useTranslation();

  return (
    // biome-ignore lint/a11y/useSemanticElements: bootstrap btn-group is the idiomatic toolbar grouping
    <div
      className="btn-group btn-group-sm"
      role="group"
      aria-label={t('nas_storage.sort.label')}
      data-testid="nas-sort-control"
    >
      {KEYS.map((key) => {
        const active = key === sortKey;
        return (
          <button
            key={key}
            type="button"
            className={`btn btn-outline-secondary${active ? ' active' : ''}`}
            aria-pressed={active}
            data-testid={`nas-sort-${key}`}
            onClick={() =>
              onChange(
                key,
                active
                  ? sortDir === 'asc'
                    ? 'desc'
                    : 'asc'
                  : DEFAULT_SORT_DIR[key],
              )
            }
          >
            {t(`nas_storage.sort.${key}`)}
            {active && (
              <span
                className="material-symbols-outlined ms-1 align-middle fs-6"
                aria-hidden="true"
              >
                {sortDir === 'asc' ? 'arrow_upward' : 'arrow_downward'}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
