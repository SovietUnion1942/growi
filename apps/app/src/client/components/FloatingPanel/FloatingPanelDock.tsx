import type { JSX } from 'react';
import { useAtomValue } from 'jotai';

import { minimizedFloatingPanelsAtom } from './floating-panel-dock-state';

/**
 * A `position: fixed` tray of restore chips, one per currently-minimized
 * FloatingPanel (see useFloatingPanel's minimize registry). Mounted exactly
 * once, outside any sidebar-specific subtree, so it can render chips for any
 * combination of minimized panels (e.g. Messages AND the AI chat sidebar
 * minimized at once) regardless of which feature owns them.
 */
export const FloatingPanelDock = (): JSX.Element | null => {
  const minimizedPanels = useAtomValue(minimizedFloatingPanelsAtom);

  if (minimizedPanels.length === 0) {
    return null;
  }

  return (
    <div className="tw:fixed tw:bottom-4 tw:right-4 tw:z-50 tw:flex tw:flex-col tw:gap-2 tw:items-end">
      {minimizedPanels.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className="tw:flex tw:max-w-64 tw:items-center tw:gap-2 tw:rounded-full tw:border tw:bg-background tw:px-3 tw:py-2 tw:shadow-lg"
          aria-label={`Restore ${entry.title}`}
          onClick={entry.onRestore}
        >
          <span className="tw:truncate tw:text-sm tw:font-medium">
            {entry.title}
          </span>
          <span className="material-symbols-outlined tw:shrink-0 tw:text-base">
            open_in_full
          </span>
        </button>
      ))}
    </div>
  );
};
