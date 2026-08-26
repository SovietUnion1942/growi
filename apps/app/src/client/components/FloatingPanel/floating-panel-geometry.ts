export type FloatingPanelPosition = { x: number; y: number };
export type FloatingPanelSize = { width: number; height: number };
export type FloatingPanelGeometry = {
  position: FloatingPanelPosition;
  size: FloatingPanelSize;
};

// How much of the panel must stay reachable inside the viewport on each
// axis, in pixels — enough of the header stays grabbable to drag it back
// even after resizing the browser window down.
const MIN_VISIBLE_MARGIN = 48;

/**
 * Clamps a candidate top-left position so the panel never becomes fully
 * unreachable: at least MIN_VISIBLE_MARGIN px of it stays inside the
 * viewport on both axes, regardless of viewport resizes after the position
 * was saved (e.g. a saved position from a wider screen, restored on a
 * narrower one).
 */
export const clampPosition = (
  position: FloatingPanelPosition,
  size: FloatingPanelSize,
  viewport: { width: number; height: number },
): FloatingPanelPosition => {
  const minX = MIN_VISIBLE_MARGIN - size.width;
  const maxX = viewport.width - MIN_VISIBLE_MARGIN;
  const minY = 0;
  const maxY = viewport.height - MIN_VISIBLE_MARGIN;

  return {
    x: Math.min(Math.max(position.x, minX), Math.max(minX, maxX)),
    y: Math.min(Math.max(position.y, minY), Math.max(minY, maxY)),
  };
};

/**
 * Clamps a candidate size to the panel's configured minimum, and to the
 * viewport itself (a saved size from a larger screen must not force
 * overflow on a smaller one).
 */
export const clampSize = (
  size: FloatingPanelSize,
  min: FloatingPanelSize,
  viewport: { width: number; height: number },
): FloatingPanelSize => ({
  width: Math.min(Math.max(size.width, min.width), viewport.width),
  height: Math.min(Math.max(size.height, min.height), viewport.height),
});

// Small inset so a maximized panel reads as "fills the window" without
// literally touching the browser chrome/edges on every side.
const MAXIMIZED_INSET = 8;

/**
 * The geometry actually rendered: the panel's own (draggable/resizable,
 * clamped) geometry normally, or a viewport-filling geometry while
 * maximized. `geometry` itself is left untouched by maximizing — restoring
 * returns to exactly where the panel was before, not to some new position
 * derived from the maximized state.
 */
export const computeDisplayGeometry = (
  geometry: FloatingPanelGeometry,
  isMaximized: boolean,
  viewport: { width: number; height: number },
): FloatingPanelGeometry => {
  if (!isMaximized) return geometry;
  return {
    position: { x: MAXIMIZED_INSET, y: MAXIMIZED_INSET },
    size: {
      width: viewport.width - MAXIMIZED_INSET * 2,
      height: viewport.height - MAXIMIZED_INSET * 2,
    },
  };
};
