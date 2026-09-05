import type { JSX } from 'react';

import { cn } from '~/utils/shadcn-ui';

import styles from './FloatingPanelControls.module.scss';

export type FloatingPanelControlsProps = {
  isMinimized: boolean;
  toggleMinimize: () => void;
  isMaximized: boolean;
  toggleMaximize: () => void;
  onClose: () => void;
  className?: string;
};

/**
 * The standard trio of FloatingPanel window-chrome buttons (minimize,
 * maximize/restore, close), in that left-to-right order -- matching common
 * OS window-control ordering. Shared by every FloatingPanel consumer so the
 * two floating windows (AI chat sidebar, Messages/DM thread panel) look and
 * behave consistently instead of each hand-rolling its own buttons.
 */
export const FloatingPanelControls = ({
  toggleMinimize,
  isMaximized,
  toggleMaximize,
  onClose,
  className,
}: FloatingPanelControlsProps): JSX.Element => {
  return (
    <div className={cn('tw:flex tw:items-center tw:gap-1', className)}>
      <button
        type="button"
        className={styles['btn-control']}
        aria-label="Minimize"
        onClick={toggleMinimize}
      >
        <span className="material-symbols-outlined">minimize</span>
      </button>
      <button
        type="button"
        className={styles['btn-control']}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
        onClick={toggleMaximize}
      >
        <span className="material-symbols-outlined">
          {isMaximized ? 'fullscreen_exit' : 'fullscreen'}
        </span>
      </button>
      <button
        type="button"
        className={styles['btn-control']}
        aria-label="Close"
        onClick={onClose}
      >
        <span className="material-symbols-outlined">close</span>
      </button>
    </div>
  );
};
