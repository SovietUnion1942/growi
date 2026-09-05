// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';

import { FloatingPanelControls } from './FloatingPanelControls';

describe('FloatingPanelControls', () => {
  it('renders exactly 3 buttons', () => {
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={vi.fn()}
        isMaximized={false}
        toggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('shows the fullscreen icon and calls toggleMaximize when not maximized', () => {
    const toggleMaximize = vi.fn();
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={vi.fn()}
        isMaximized={false}
        toggleMaximize={toggleMaximize}
        onClose={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /maximize/i });
    expect(button).toHaveTextContent('fullscreen');

    fireEvent.click(button);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('shows the fullscreen_exit icon and calls toggleMaximize when maximized', () => {
    const toggleMaximize = vi.fn();
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={vi.fn()}
        isMaximized
        toggleMaximize={toggleMaximize}
        onClose={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: /restore/i });
    expect(button).toHaveTextContent('fullscreen_exit');

    fireEvent.click(button);
    expect(toggleMaximize).toHaveBeenCalledTimes(1);
  });

  it('calls toggleMinimize exactly once when the minimize button is clicked', () => {
    const toggleMinimize = vi.fn();
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={toggleMinimize}
        isMaximized={false}
        toggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /minimize/i }));
    expect(toggleMinimize).toHaveBeenCalledTimes(1);
  });

  it('calls onClose exactly once when the close button is clicked', () => {
    const onClose = vi.fn();
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={vi.fn()}
        isMaximized={false}
        toggleMaximize={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders buttons left-to-right in minimize, maximize, close order', () => {
    render(
      <FloatingPanelControls
        isMinimized={false}
        toggleMinimize={vi.fn()}
        isMaximized={false}
        toggleMaximize={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const buttons = screen.getAllByRole('button');
    expect(buttons[0]).toHaveTextContent('minimize');
    expect(buttons[1]).toHaveTextContent('fullscreen');
    expect(buttons[2]).toHaveTextContent('close');
  });
});
