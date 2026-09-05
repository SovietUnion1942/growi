// @vitest-environment happy-dom

import { act, render, screen } from '@testing-library/react';

import {
  FloatingPanel,
  type FloatingPanelHeaderControls,
} from './FloatingPanel';

const BASE_PROPS = {
  storageKey: 'grw-test-floating-panel',
  title: 'Test Panel',
  defaultPosition: { x: 0, y: 0 },
  defaultSize: { width: 400, height: 300 },
  minSize: { width: 200, height: 150 },
};

describe('FloatingPanel — minimize', () => {
  it('keeps children mounted and hides the root via CSS, rather than unmounting, while minimized', () => {
    let controls: FloatingPanelHeaderControls | undefined;

    const { container } = render(
      <FloatingPanel
        {...BASE_PROPS}
        header={(c) => {
          controls = c;
          return <div>Header</div>;
        }}
      >
        <div>Panel Content</div>
      </FloatingPanel>,
    );

    expect(screen.getByText('Panel Content')).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass('tw:hidden');

    act(() => {
      controls?.toggleMinimize();
    });

    // The content (and its socket listeners / local draft state, in real
    // consumers like MessageThread) must still be mounted -- minimize hides,
    // it does not destroy.
    expect(screen.getByText('Panel Content')).toBeInTheDocument();
    // The root wrapper is hidden via a CSS utility class instead.
    expect(container.firstElementChild).toHaveClass('tw:hidden');

    act(() => {
      controls?.toggleMinimize();
    });

    expect(screen.getByText('Panel Content')).toBeInTheDocument();
    expect(container.firstElementChild).not.toHaveClass('tw:hidden');
  });
});
