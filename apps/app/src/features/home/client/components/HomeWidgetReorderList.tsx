import type { FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { WidgetKey } from '~/features/home/interfaces/home-widgets';
import { HOME_WIDGET_DESCRIPTORS } from '~/features/home/widgets-registry';

/** One row of the customize-mode reorder list: a widget key + its working visibility. */
export type ReorderListEntry = { key: WidgetKey; visible: boolean };

const TITLE_BY_KEY = Object.fromEntries(
  HOME_WIDGET_DESCRIPTORS.map((d) => [d.key, d.titleI18nKey]),
) as Record<WidgetKey, string>;

type Props = {
  entries: ReorderListEntry[];
  onMove: (key: WidgetKey, dir: 'up' | 'down') => void;
  onToggleVisible: (key: WidgetKey) => void;
};

/**
 * Compact single-column reorder / show-hide list shown while `/home` is in
 * customize mode (task 4.3 UX rework).
 *
 * The earlier design overlaid up/down arrows on the live widget cards, which
 * were laid out in a responsive multi-column grid — so "up" moved a card
 * diagonally (to the end of the previous row) and every click re-rendered all
 * seven data-fetching widgets. This list drops the widgets entirely: one slim
 * row per widget in a single column, so "up" means up, reordering is instant,
 * and there is no fetch/flicker. The real layout is restored when the user
 * leaves customize mode.
 */
export const HomeWidgetReorderList: FC<Props> = ({
  entries,
  onMove,
  onToggleVisible,
}) => {
  const { t } = useTranslation();

  return (
    <ul
      className="list-group grw-home-widget-reorder"
      data-testid="home-widget-reorder-list"
    >
      {entries.map((entry, index) => (
        <li
          key={entry.key}
          className="list-group-item d-flex align-items-center gap-2"
          data-testid={`reorder-row-${entry.key}`}
        >
          <span className="text-muted small" style={{ width: '1.5em' }}>
            {index + 1}
          </span>

          <span
            className={`flex-grow-1 text-truncate${entry.visible ? '' : ' text-muted text-decoration-line-through'}`}
          >
            {t(TITLE_BY_KEY[entry.key])}
          </span>

          {!entry.visible && (
            <span className="badge text-bg-light border">
              {t('home.customize.hidden')}
            </span>
          )}

          <span className="btn-group btn-group-sm flex-shrink-0">
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center"
              aria-label={t('home.customize.move_up')}
              disabled={index === 0}
              onClick={() => onMove(entry.key, 'up')}
            >
              <span className="material-symbols-outlined">arrow_upward</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center"
              aria-label={t('home.customize.move_down')}
              disabled={index === entries.length - 1}
              onClick={() => onMove(entry.key, 'down')}
            >
              <span className="material-symbols-outlined">arrow_downward</span>
            </button>
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center"
              aria-label={
                entry.visible
                  ? t('home.customize.hide_widget')
                  : t('home.customize.show_widget')
              }
              onClick={() => onToggleVisible(entry.key)}
            >
              <span className="material-symbols-outlined">
                {entry.visible ? 'visibility' : 'visibility_off'}
              </span>
            </button>
          </span>
        </li>
      ))}
    </ul>
  );
};
