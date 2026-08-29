import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { NasEntryRow } from './NasEntryRow';

const fileEntry: NasEntry = {
  name: 'report.pdf',
  type: 'file',
  sizeBytes: 2048,
  modifiedAt: '2026-01-02T03:04:05Z',
};

const dirEntry: NasEntry = {
  name: 'documents',
  type: 'directory',
  sizeBytes: 0,
  modifiedAt: '2026-01-02T03:04:05Z',
};

const renderRow = (entry: NasEntry, onOpenDir = vi.fn()) =>
  render(
    <ul>
      <NasEntryRow entry={entry} onOpenDir={onOpenDir} />
    </ul>,
  );

describe('NasEntryRow', () => {
  it('renders a file row: name as plain text, human-readable size', () => {
    renderRow(fileEntry);

    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'report.pdf' })).toBeNull();
    expect(screen.getByTestId('nas-entry-size')).toHaveTextContent('2.05 kB');
  });

  it('renders a directory row: name as a button that calls onOpenDir', async () => {
    const onOpenDir = vi.fn();
    renderRow(dirEntry, onOpenDir);

    await userEvent.click(screen.getByRole('button', { name: 'documents' }));

    expect(onOpenDir).toHaveBeenCalledWith('documents');
  });

  it('shows a dash instead of a byte size for a directory', () => {
    renderRow(dirEntry);

    expect(screen.getByTestId('nas-entry-size')).toHaveTextContent('—');
  });

  it('formats the modified date defensively when the value is a Date', () => {
    const asDate = {
      ...fileEntry,
      // WHY: the custom axios instance coerces ISO date strings to `Date`, so at
      // runtime `modifiedAt` can arrive as a `Date` despite the `string` type;
      // the cast reproduces that coercion to exercise the row's defensive format.
      modifiedAt: new Date('2026-01-02T03:04:05Z') as unknown as string,
    };
    renderRow(asDate);

    expect(screen.getByTestId('nas-entry-modified')).toHaveTextContent(
      new Date('2026-01-02T03:04:05Z').toLocaleString(),
    );
  });
});
