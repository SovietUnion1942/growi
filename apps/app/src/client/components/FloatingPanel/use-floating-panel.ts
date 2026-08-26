import { useCallback, useEffect, useRef, useState } from 'react';

import {
  clampPosition,
  clampSize,
  computeDisplayGeometry,
  type FloatingPanelGeometry,
  type FloatingPanelPosition,
  type FloatingPanelSize,
} from './floating-panel-geometry';

type UseFloatingPanelParams = {
  // localStorage key this panel's geometry is saved under. Per-viewer,
  // per-browser convenience only (see localStorage guidance) -- never
  // synced across devices, so a fresh browser/profile just gets the
  // defaults again.
  storageKey: string;
  defaultPosition: FloatingPanelPosition;
  defaultSize: FloatingPanelSize;
  minSize: FloatingPanelSize;
};

type UseFloatingPanelResult = {
  // The geometry actually rendered (viewport-filling while maximized) --
  // consumers should render at this, not at some geometry they combine with
  // isMaximized themselves.
  displayGeometry: FloatingPanelGeometry;
  isMaximized: boolean;
  toggleMaximize: () => void;
  onDragHandlePointerDown: (e: React.PointerEvent) => void;
  onResizeHandlePointerDown: (e: React.PointerEvent) => void;
};

const readViewport = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
});

const readSavedGeometry = (
  storageKey: string,
): FloatingPanelGeometry | undefined => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw == null) return undefined;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.position?.x !== 'number' ||
      typeof parsed?.position?.y !== 'number' ||
      typeof parsed?.size?.width !== 'number' ||
      typeof parsed?.size?.height !== 'number'
    ) {
      return undefined;
    }
    return parsed as FloatingPanelGeometry;
  } catch {
    // Private browsing / storage disabled / corrupt JSON -- fall back to
    // defaults rather than throwing.
    return undefined;
  }
};

const writeSavedGeometry = (
  storageKey: string,
  geometry: FloatingPanelGeometry,
): void => {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(geometry));
  } catch {
    // Ignore write failures (quota, disabled storage) -- the panel still
    // works for this session, it just won't remember its geometry.
  }
};

/**
 * Drag-to-move + drag-to-resize (bottom-right corner) for a floating panel,
 * with geometry persisted per-browser in localStorage and re-clamped to the
 * current viewport on every read (handles both a saved geometry from a
 * differently-sized screen, and the live window being resized while open).
 */
export const useFloatingPanel = (
  params: UseFloatingPanelParams,
): UseFloatingPanelResult => {
  const { storageKey, defaultPosition, defaultSize, minSize } = params;

  const [geometry, setGeometry] = useState<FloatingPanelGeometry>(() => {
    if (typeof window === 'undefined') {
      return { position: defaultPosition, size: defaultSize };
    }
    const saved = readSavedGeometry(storageKey);
    const size = clampSize(saved?.size ?? defaultSize, minSize, readViewport());
    const position = clampPosition(
      saved?.position ?? defaultPosition,
      size,
      readViewport(),
    );
    return { position, size };
  });

  // Maximized is orthogonal to `geometry`: toggling it never touches the
  // saved position/size, so restoring always returns to exactly where the
  // panel was (see computeDisplayGeometry's doc comment).
  const [isMaximized, setIsMaximized] = useState(false);
  const toggleMaximize = useCallback(() => {
    setIsMaximized((current) => !current);
  }, []);

  // Re-clamp (without discarding the saved geometry) whenever the browser
  // window itself is resized, so the panel never ends up stranded off the
  // now-smaller viewport.
  useEffect(() => {
    const onResize = () => {
      setGeometry((current) => {
        const viewport = readViewport();
        const size = clampSize(current.size, minSize, viewport);
        const position = clampPosition(current.position, size, viewport);
        return { position, size };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [minSize]);

  // Dragging and resizing both track the pointer via a single move/up pair
  // registered on `document` for the duration of the gesture (not on the
  // handle itself), so the pointer can leave the handle mid-drag without
  // interrupting the gesture.
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origin: FloatingPanelGeometry;
  } | null>(null);
  const resizeStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    origin: FloatingPanelGeometry;
  } | null>(null);

  const onDragHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only the primary button/touch initiates a drag. A maximized panel
      // fills the viewport by definition, so dragging it is a no-op --
      // restore first via toggleMaximize.
      if (e.button !== 0 || isMaximized) return;
      dragStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        origin: geometry,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const start = dragStartRef.current;
        if (start == null) return;
        const viewport = readViewport();
        const nextPosition = clampPosition(
          {
            x: start.origin.position.x + (moveEvent.clientX - start.pointerX),
            y: start.origin.position.y + (moveEvent.clientY - start.pointerY),
          },
          start.origin.size,
          viewport,
        );
        setGeometry((current) => ({ ...current, position: nextPosition }));
      };
      const onPointerUp = () => {
        dragStartRef.current = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        setGeometry((current) => {
          writeSavedGeometry(storageKey, current);
          return current;
        });
      };
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [geometry, isMaximized, storageKey],
  );

  const onResizeHandlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0 || isMaximized) return;
      e.stopPropagation();
      resizeStartRef.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        origin: geometry,
      };

      const onPointerMove = (moveEvent: PointerEvent) => {
        const start = resizeStartRef.current;
        if (start == null) return;
        const viewport = readViewport();
        const nextSize = clampSize(
          {
            width:
              start.origin.size.width + (moveEvent.clientX - start.pointerX),
            height:
              start.origin.size.height + (moveEvent.clientY - start.pointerY),
          },
          minSize,
          viewport,
        );
        setGeometry((current) => ({ ...current, size: nextSize }));
      };
      const onPointerUp = () => {
        resizeStartRef.current = null;
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        setGeometry((current) => {
          writeSavedGeometry(storageKey, current);
          return current;
        });
      };
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    },
    [geometry, isMaximized, minSize, storageKey],
  );

  const displayGeometry = computeDisplayGeometry(
    geometry,
    isMaximized,
    typeof window === 'undefined' ? geometry.size : readViewport(),
  );

  return {
    displayGeometry,
    isMaximized,
    toggleMaximize,
    onDragHandlePointerDown,
    onResizeHandlePointerDown,
  };
};
