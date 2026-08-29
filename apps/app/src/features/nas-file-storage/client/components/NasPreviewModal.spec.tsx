import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { NasPreviewModal } from './NasPreviewModal';

vi.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en_US' },
  }),
}));

const mockGet = vi.fn();
vi.mock('~/utils/axios', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

const entry = (name: string): NasEntry => ({
  name,
  type: 'file',
  sizeBytes: 5,
  modifiedAt: '2026-01-01T00:00:00.000Z',
});

const inlineUrl = (logicalPath: string) =>
  `/_api/v3/nas-storage/file?path=${encodeURIComponent(logicalPath)}&inline=1`;
const downloadUrl = (logicalPath: string) =>
  `/_api/v3/nas-storage/file?path=${encodeURIComponent(logicalPath)}`;

beforeEach(() => {
  mockGet.mockReset();
});

describe('NasPreviewModal', () => {
  it('renders nothing without an entry', () => {
    render(
      <NasPreviewModal entry={null} logicalPath={null} onClose={vi.fn()} />,
    );
    expect(screen.queryByTestId('nas-preview-modal')).toBeNull();
  });

  it('renders an image with the inline src', () => {
    render(
      <NasPreviewModal
        entry={entry('x.png')}
        logicalPath="/docs/x.png"
        onClose={vi.fn()}
      />,
    );
    const img = screen.getByTestId('nas-preview-image');
    expect(img).toHaveAttribute('src', inlineUrl('/docs/x.png'));
    expect(img).toHaveAttribute('alt', 'x.png');
  });

  it('renders a video with controls and the inline src', () => {
    render(
      <NasPreviewModal
        entry={entry('clip.mp4')}
        logicalPath="/clip.mp4"
        onClose={vi.fn()}
      />,
    );
    const video = screen.getByTestId('nas-preview-video');
    expect(video).toHaveAttribute('src', inlineUrl('/clip.mp4'));
    expect(video).toHaveAttribute('controls');
  });

  it('renders an audio element with controls', () => {
    render(
      <NasPreviewModal
        entry={entry('song.mp3')}
        logicalPath="/song.mp3"
        onClose={vi.fn()}
      />,
    );
    const audio = screen.getByTestId('nas-preview-audio');
    expect(audio).toHaveAttribute('src', inlineUrl('/song.mp3'));
    expect(audio).toHaveAttribute('controls');
  });

  it('renders a sandboxed iframe for a PDF', () => {
    render(
      <NasPreviewModal
        entry={entry('doc.pdf')}
        logicalPath="/doc.pdf"
        onClose={vi.fn()}
      />,
    );
    const iframe = screen.getByTestId('nas-preview-pdf');
    expect(iframe).toHaveAttribute('src', inlineUrl('/doc.pdf'));
    expect(iframe).toHaveAttribute('sandbox');
  });

  it('shows text content with no truncation note when the whole file fits', async () => {
    mockGet.mockResolvedValue({
      data: 'hello world',
      headers: { 'content-range': 'bytes 0-10/11' },
    });
    render(
      <NasPreviewModal
        entry={entry('notes.txt')}
        logicalPath="/notes.txt"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByTestId('nas-preview-text')).toHaveTextContent(
      'hello world',
    );
    expect(screen.queryByTestId('nas-preview-truncated')).toBeNull();
  });

  it('flags a large text file as truncated and keeps the download link', async () => {
    mockGet.mockResolvedValue({
      data: 'x'.repeat(262144),
      headers: { 'content-range': 'bytes 0-262143/999999' },
    });
    render(
      <NasPreviewModal
        entry={entry('big.txt')}
        logicalPath="/big.txt"
        onClose={vi.fn()}
      />,
    );
    expect(
      await screen.findByTestId('nas-preview-truncated'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('nas-preview-download')).toHaveAttribute(
      'href',
      downloadUrl('/big.txt'),
    );
  });

  it('shows an error message when the text fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('boom'));
    render(
      <NasPreviewModal
        entry={entry('notes.txt')}
        logicalPath="/notes.txt"
        onClose={vi.fn()}
      />,
    );
    expect(await screen.findByTestId('nas-preview-error')).toBeInTheDocument();
    expect(screen.getByTestId('nas-preview-download')).toBeInTheDocument();
  });

  it('always offers a plain (attachment) download link', () => {
    render(
      <NasPreviewModal
        entry={entry('x.png')}
        logicalPath="/docs/x.png"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByTestId('nas-preview-download')).toHaveAttribute(
      'href',
      downloadUrl('/docs/x.png'),
    );
  });

  it('calls onClose from the header close control', async () => {
    const onClose = vi.fn();
    render(
      <NasPreviewModal
        entry={entry('x.png')}
        logicalPath="/docs/x.png"
        onClose={onClose}
      />,
    );
    await userEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
