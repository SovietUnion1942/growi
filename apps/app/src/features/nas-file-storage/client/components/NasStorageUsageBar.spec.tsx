import { render, screen } from '@testing-library/react';

import { NasStorageUsageBar } from './NasStorageUsageBar';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts != null ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

describe('NasStorageUsageBar', () => {
  it('renders nothing until a reading arrives', () => {
    const { container } = render(<NasStorageUsageBar usage={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the total is unknown', () => {
    const { container } = render(
      <NasStorageUsageBar
        usage={{ totalBytes: 0, freeBytes: 0, usedBytes: 0 }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the percent and used/total/free summary and fills the bar', () => {
    render(
      <NasStorageUsageBar
        usage={{
          totalBytes: 20_000_000_000,
          freeBytes: 15_000_000_000,
          usedBytes: 5_000_000_000,
        }}
      />,
    );

    const summary = screen.getByTestId('nas-usage-summary');
    expect(summary).toHaveTextContent('"percent":25');
    const bar = screen
      .getByTestId('nas-usage-bar')
      .querySelector<HTMLElement>('.progress-bar');
    expect(bar).toHaveStyle({ width: '25%' });
    expect(bar?.className).not.toMatch(/bg-(warning|danger)/);
  });

  it('escalates the bar colour as the volume fills', () => {
    const { rerender } = render(
      <NasStorageUsageBar
        usage={{ totalBytes: 100, freeBytes: 15, usedBytes: 85 }}
      />,
    );
    expect(
      screen.getByTestId('nas-usage-bar').querySelector('.progress-bar')
        ?.className,
    ).toMatch(/bg-warning/);

    rerender(
      <NasStorageUsageBar
        usage={{ totalBytes: 100, freeBytes: 2, usedBytes: 98 }}
      />,
    );
    expect(
      screen.getByTestId('nas-usage-bar').querySelector('.progress-bar')
        ?.className,
    ).toMatch(/bg-danger/);
  });
});
