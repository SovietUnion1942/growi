'use client';

import type { ReactNode } from 'react';

import { cn } from '~/utils/shadcn-ui';

import type {
  FloatingPanelPosition,
  FloatingPanelSize,
} from './floating-panel-geometry';
import { useFloatingPanel } from './use-floating-panel';

export type FloatingPanelHeaderControls = {
  isMaximized: boolean;
  toggleMaximize: () => void;
  isMinimized: boolean;
  toggleMinimize: () => void;
};

export type FloatingPanelProps = {
  storageKey: string;
  // Label for this panel's minimized dock chip (see FloatingPanelDock).
  title: string;
  defaultPosition: FloatingPanelPosition;
  defaultSize: FloatingPanelSize;
  minSize: FloatingPanelSize;
  // A function so the header can include its own maximize/restore/minimize
  // buttons (placement and icon are entirely up to the consumer --
  // FloatingPanel only supplies the toggles and their current state; most
  // consumers should render <FloatingPanelControls> here rather than
  // hand-rolling buttons).
  header: (controls: FloatingPanelHeaderControls) => ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * A draggable, resizable, maximizable, position-persisting floating window.
 * Generic by design so it can back more than one feature's panel (built
 * first for the AI chat sidebar; the Messages/DM panel is expected to move
 * onto this same primitive later rather than growing its own copy).
 *
 * `header` is the drag handle; a resize grip is rendered in the bottom-right
 * corner (hidden while maximized, since a maximized panel's size is not
 * user-controlled). Geometry re-clamps to the live viewport on every resize
 * (see useFloatingPanel), so a saved position/size from a larger screen
 * never strands the panel off-screen on a smaller one.
 */
export const FloatingPanel = ({
  storageKey,
  title,
  defaultPosition,
  defaultSize,
  minSize,
  header,
  children,
  className,
}: FloatingPanelProps): JSX.Element => {
  const {
    displayGeometry,
    isMaximized,
    toggleMaximize,
    isMinimized,
    toggleMinimize,
    onDragHandlePointerDown,
    onResizeHandlePointerDown,
  } = useFloatingPanel({
    storageKey,
    title,
    defaultPosition,
    defaultSize,
    minSize,
  });

  return (
    <div
      className={cn(
        'tw:fixed tw:z-50 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-lg tw:border tw:bg-background tw:shadow-lg',
        // While minimized, the dock chip (rendered elsewhere by
        // FloatingPanelDock) is the only visible trace of this panel -- hide
        // via CSS rather than unmounting, so `children` (unsent drafts,
        // socket listeners, staged attachments, etc.) stays alive underneath.
        isMinimized && 'tw:hidden',
        className,
      )}
      style={{
        left: displayGeometry.position.x,
        top: displayGeometry.position.y,
        width: displayGeometry.size.width,
        height: displayGeometry.size.height,
      }}
    >
      <div
        className={cn(
          'tw:touch-none tw:shrink-0',
          isMaximized ? 'tw:cursor-default' : 'tw:cursor-move',
        )}
        onPointerDown={onDragHandlePointerDown}
      >
        {header({ isMaximized, toggleMaximize, isMinimized, toggleMinimize })}
      </div>
      <div className="tw:min-h-0 tw:flex-1 tw:overflow-hidden">{children}</div>
      {!isMaximized && (
        <button
          type="button"
          aria-label="resize"
          className="tw:absolute tw:right-0 tw:bottom-0 tw:size-4 tw:cursor-nwse-resize tw:touch-none tw:border-0 tw:bg-transparent tw:p-0"
          onPointerDown={onResizeHandlePointerDown}
        />
      )}
    </div>
  );
};
