// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { getDefaultStore } from 'jotai';

import { minimizedFloatingPanelsAtom } from './floating-panel-dock-state';
import { useFloatingPanel } from './use-floating-panel';

const PARAMS = {
  storageKey: 'grw-test-panel-geometry',
  title: 'Test Panel',
  defaultPosition: { x: 0, y: 0 },
  defaultSize: { width: 400, height: 400 },
  minSize: { width: 200, height: 200 },
};

describe('useFloatingPanel — minimize', () => {
  afterEach(() => {
    // The registry is a module-level default-store atom shared across tests;
    // reset it so a leaked/left-over entry from one test can't leak into the
    // next.
    getDefaultStore().set(minimizedFloatingPanelsAtom, []);
  });

  it('toggleMinimize flips isMinimized', () => {
    const { result } = renderHook(() => useFloatingPanel(PARAMS));

    expect(result.current.isMinimized).toBe(false);

    act(() => {
      result.current.toggleMinimize();
    });

    expect(result.current.isMinimized).toBe(true);
  });

  it('registers an entry with the title while minimized, and onRestore un-minimizes', () => {
    const { result } = renderHook(() => useFloatingPanel(PARAMS));

    act(() => {
      result.current.toggleMinimize();
    });

    const entries = getDefaultStore().get(minimizedFloatingPanelsAtom);
    const entry = entries.find((e) => e.key === PARAMS.storageKey);
    expect(entry).toBeDefined();
    expect(entry?.title).toBe(PARAMS.title);

    act(() => {
      entry?.onRestore();
    });

    expect(result.current.isMinimized).toBe(false);
    expect(
      getDefaultStore()
        .get(minimizedFloatingPanelsAtom)
        .find((e) => e.key === PARAMS.storageKey),
    ).toBeUndefined();
  });

  it('does not register an entry while not minimized', () => {
    renderHook(() => useFloatingPanel(PARAMS));

    expect(
      getDefaultStore()
        .get(minimizedFloatingPanelsAtom)
        .find((e) => e.key === PARAMS.storageKey),
    ).toBeUndefined();
  });

  it('removes the entry on unmount while minimized (no leak)', () => {
    const { result, unmount } = renderHook(() => useFloatingPanel(PARAMS));

    act(() => {
      result.current.toggleMinimize();
    });
    expect(
      getDefaultStore()
        .get(minimizedFloatingPanelsAtom)
        .find((e) => e.key === PARAMS.storageKey),
    ).toBeDefined();

    unmount();

    expect(
      getDefaultStore()
        .get(minimizedFloatingPanelsAtom)
        .find((e) => e.key === PARAMS.storageKey),
    ).toBeUndefined();
  });

  it('supports multiple simultaneously-minimized panels', () => {
    const { result: result1 } = renderHook(() =>
      useFloatingPanel({
        ...PARAMS,
        storageKey: 'grw-panel-1',
        title: 'Panel 1',
      }),
    );
    const { result: result2 } = renderHook(() =>
      useFloatingPanel({
        ...PARAMS,
        storageKey: 'grw-panel-2',
        title: 'Panel 2',
      }),
    );

    act(() => {
      result1.current.toggleMinimize();
      result2.current.toggleMinimize();
    });

    const keys = getDefaultStore()
      .get(minimizedFloatingPanelsAtom)
      .map((e) => e.key);
    expect(keys).toContain('grw-panel-1');
    expect(keys).toContain('grw-panel-2');
  });
});
