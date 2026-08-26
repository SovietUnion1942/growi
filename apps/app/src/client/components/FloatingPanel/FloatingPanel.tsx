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
};

export type FloatingPanelProps = {
  storageKey: string;
  defaultPosition: FloatingPanelPosition;
  defaultSize: FloatingPanelSize;
  minSize: FloatingPanelSize;
  // A function so the header can include its own maximize/restore button
  // (placement and icon are entirely up to the consumer -- FloatingPanel
  // only supplies the toggle and its current state).
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
    onDragHandlePointerDown,
    onResizeHandlePointerDown,
  } = useFloatingPanel({ storageKey, defaultPosition, defaultSize, minSize });

  return (
    <div
      className={cn(
        'tw:fixed tw:z-50 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-lg tw:border tw:bg-background tw:shadow-lg',
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
        {header({ isMaximized, toggleMaximize })}
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
