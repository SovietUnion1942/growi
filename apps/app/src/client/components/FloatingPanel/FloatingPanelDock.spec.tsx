// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { getDefaultStore } from 'jotai';

import { FloatingPanelDock } from './FloatingPanelDock';
import { minimizedFloatingPanelsAtom } from './floating-panel-dock-state';

describe('FloatingPanelDock', () => {
  afterEach(() => {
    getDefaultStore().set(minimizedFloatingPanelsAtom, []);
  });

  it('renders nothing when the registry is empty', () => {
    const { container } = render(<FloatingPanelDock />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one chip per registered entry, with correct title text', () => {
    getDefaultStore().set(minimizedFloatingPanelsAtom, [
      { key: 'grw-panel-1', title: 'AI Chat', onRestore: vi.fn() },
      { key: 'grw-panel-2', title: 'Messages: Alice', onRestore: vi.fn() },
    ]);

    render(<FloatingPanelDock />);

    expect(screen.getByText('AI Chat')).toBeInTheDocument();
    expect(screen.getByText('Messages: Alice')).toBeInTheDocument();
  });

  it("clicking a chip's restore control calls that entry's onRestore", () => {
    const onRestore1 = vi.fn();
    const onRestore2 = vi.fn();
    getDefaultStore().set(minimizedFloatingPanelsAtom, [
      { key: 'grw-panel-1', title: 'AI Chat', onRestore: onRestore1 },
      { key: 'grw-panel-2', title: 'Messages: Alice', onRestore: onRestore2 },
    ]);

    render(<FloatingPanelDock />);

    fireEvent.click(screen.getByText('AI Chat').closest('button') as Element);

    expect(onRestore1).toHaveBeenCalledTimes(1);
    expect(onRestore2).not.toHaveBeenCalled();
  });
});
