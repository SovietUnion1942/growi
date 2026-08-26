import { describe, expect, it } from 'vitest';

import {
  clampPosition,
  clampSize,
  computeDisplayGeometry,
} from './floating-panel-geometry';

describe('clampPosition', () => {
  const size = { width: 400, height: 600 };
  const viewport = { width: 1200, height: 800 };

  it('leaves an in-bounds position unchanged', () => {
    expect(clampPosition({ x: 100, y: 100 }, size, viewport)).toEqual({
      x: 100,
      y: 100,
    });
  });

  it('does not clamp x below 0 as long as at least the margin stays visible', () => {
    // -300 still leaves 100px of a 400px-wide panel on screen (> 48px margin).
    expect(clampPosition({ x: -300, y: 0 }, size, viewport).x).toBe(-300);
  });

  it('clamps x so the panel cannot be dragged fully off the left edge', () => {
    const clamped = clampPosition({ x: -1000, y: 0 }, size, viewport);
    // At minimum, 48px of the panel must remain visible: x = 48 - width.
    expect(clamped.x).toBe(48 - size.width);
  });

  it('clamps x so the panel cannot be dragged fully off the right edge', () => {
    const clamped = clampPosition({ x: 5000, y: 0 }, size, viewport);
    expect(clamped.x).toBe(viewport.width - 48);
  });

  it('never allows a negative y (header must stay below the viewport top)', () => {
    expect(clampPosition({ x: 0, y: -100 }, size, viewport).y).toBe(0);
  });

  it('clamps y so the panel cannot be dragged fully off the bottom edge', () => {
    const clamped = clampPosition({ x: 0, y: 5000 }, size, viewport);
    expect(clamped.y).toBe(viewport.height - 48);
  });

  it('degrades gracefully when the panel is wider than the viewport', () => {
    const tinyViewport = { width: 300, height: 800 };
    const clamped = clampPosition({ x: 0, y: 0 }, size, tinyViewport);
    expect(clamped.x).toBeLessThanOrEqual(0);
    expect(Number.isFinite(clamped.x)).toBe(true);
  });
});

describe('clampSize', () => {
  const min = { width: 320, height: 240 };
  const viewport = { width: 1200, height: 800 };

  it('leaves an in-bounds size unchanged', () => {
    expect(clampSize({ width: 500, height: 500 }, min, viewport)).toEqual({
      width: 500,
      height: 500,
    });
  });

  it('enforces the minimum width and height', () => {
    expect(clampSize({ width: 100, height: 50 }, min, viewport)).toEqual(min);
  });

  it('caps size to the viewport so a saved larger-screen size does not overflow', () => {
    expect(clampSize({ width: 5000, height: 5000 }, min, viewport)).toEqual(
      viewport,
    );
  });
});

describe('computeDisplayGeometry', () => {
  const geometry = {
    position: { x: 100, y: 72 },
    size: { width: 420, height: 640 },
  };
  const viewport = { width: 1200, height: 800 };

  it('returns the panel geometry unchanged when not maximized', () => {
    expect(computeDisplayGeometry(geometry, false, viewport)).toEqual(geometry);
  });

  it('returns a viewport-filling geometry (with a small inset) when maximized', () => {
    const result = computeDisplayGeometry(geometry, true, viewport);
    expect(result.position).toEqual({ x: 8, y: 8 });
    expect(result.size).toEqual({ width: 1184, height: 784 });
  });

  it('does not mutate the original geometry object when maximized', () => {
    computeDisplayGeometry(geometry, true, viewport);
    expect(geometry).toEqual({
      position: { x: 100, y: 72 },
      size: { width: 420, height: 640 },
    });
  });
});
