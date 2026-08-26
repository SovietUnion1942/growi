'use client';

import type { ReactNode } from 'react';

import { cn } from '~/utils/shadcn-ui';

import type {
  FloatingPanelPosition,
  FloatingPanelSize,
} from './floating-panel-geometry';
import { useFloatingPanel } from './use-floating-panel';

export type FloatingPanelProps = {
  storageKey: string;
  defaultPosition: FloatingPanelPosition;
  defaultSize: FloatingPanelSize;
  minSize: FloatingPanelSize;
  header: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * A draggable, resizable, position-persisting floating window. Generic by
 * design so it can back more than one feature's panel (built first for the
 * AI chat sidebar; the Messages/DM panel is expected to move onto this same
 * primitive later rather than growing its own copy).
 *
 * `header` is the drag handle; a resize grip is rendered in the bottom-right
 * corner. Geometry re-clamps to the live viewport on every resize (see
 * useFloatingPanel), so a saved position/size from a larger screen never
 * strands the panel off-screen on a smaller one.
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
  const { geometry, onDragHandlePointerDown, onResizeHandlePointerDown } =
    useFloatingPanel({ storageKey, defaultPosition, defaultSize, minSize });

  return (
    <div
      className={cn(
        'tw:fixed tw:z-50 tw:flex tw:flex-col tw:overflow-hidden tw:rounded-lg tw:border tw:bg-background tw:shadow-lg',
        className,
      )}
      style={{
        left: geometry.position.x,
        top: geometry.position.y,
        width: geometry.size.width,
        height: geometry.size.height,
      }}
    >
      <div
        className="tw:cursor-move tw:touch-none tw:shrink-0"
        onPointerDown={onDragHandlePointerDown}
      >
        {header}
      </div>
      <div className="tw:min-h-0 tw:flex-1 tw:overflow-hidden">{children}</div>
      <button
        type="button"
        aria-label="resize"
        className="tw:absolute tw:right-0 tw:bottom-0 tw:size-4 tw:cursor-nwse-resize tw:touch-none tw:border-0 tw:bg-transparent tw:p-0"
        onPointerDown={onResizeHandlePointerDown}
      />
    </div>
  );
};
