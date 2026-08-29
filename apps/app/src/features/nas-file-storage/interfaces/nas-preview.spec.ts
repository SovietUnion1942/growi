import { resolveNasPreviewEntry } from './nas-preview';

describe('resolveNasPreviewEntry', () => {
  test('classifies a PNG image as inline image/*', () => {
    const entry = resolveNasPreviewEntry('photo.png');
    expect(entry.previewKind).toBe('image');
    expect(entry.mimeType).toBe('image/png');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('classifies an MP4 video as inline video/*', () => {
    const entry = resolveNasPreviewEntry('clip.mp4');
    expect(entry.previewKind).toBe('video');
    expect(entry.mimeType).toBe('video/mp4');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('classifies an MP3 audio file as inline audio/*', () => {
    const entry = resolveNasPreviewEntry('song.mp3');
    expect(entry.previewKind).toBe('audio');
    expect(entry.mimeType).toBe('audio/mpeg');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('classifies a PDF as inline application/pdf', () => {
    const entry = resolveNasPreviewEntry('report.pdf');
    expect(entry.previewKind).toBe('pdf');
    expect(entry.mimeType).toBe('application/pdf');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('classifies a plain text file as inline text', () => {
    const entry = resolveNasPreviewEntry('notes.txt');
    expect(entry.previewKind).toBe('text');
    expect(entry.mimeType).toBe('text/plain');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('serves source-code text as text/plain so the browser never executes it', () => {
    const entry = resolveNasPreviewEntry('component.ts');
    expect(entry.previewKind).toBe('text');
    expect(entry.mimeType).toBe('text/plain');
    expect(entry.inlineByDefault).toBe(true);
  });

  test('forces SVG to attachment with no preview kind', () => {
    const entry = resolveNasPreviewEntry('logo.svg');
    expect(entry.previewKind).toBeNull();
    expect(entry.mimeType).toBe('image/svg+xml');
    expect(entry.inlineByDefault).toBe(false);
  });

  test('forces HTML to attachment with no preview kind', () => {
    const entry = resolveNasPreviewEntry('page.html');
    expect(entry.previewKind).toBeNull();
    expect(entry.inlineByDefault).toBe(false);
  });

  test('forces JS to attachment and never an executable content type', () => {
    const entry = resolveNasPreviewEntry('script.js');
    expect(entry.previewKind).toBeNull();
    expect(entry.inlineByDefault).toBe(false);
    expect(entry.mimeType).not.toBe('text/javascript');
    expect(entry.mimeType).not.toBe('application/javascript');
  });

  test('falls back to a generic binary attachment for an unknown extension', () => {
    const entry = resolveNasPreviewEntry('archive.xyz');
    expect(entry.previewKind).toBeNull();
    expect(entry.mimeType).toBe('application/octet-stream');
    expect(entry.inlineByDefault).toBe(false);
  });

  test('is case-insensitive on the extension', () => {
    expect(resolveNasPreviewEntry('IMAGE.PNG')).toEqual(
      resolveNasPreviewEntry('image.png'),
    );
  });

  test('falls back to a generic binary attachment for a filename with no extension', () => {
    const entry = resolveNasPreviewEntry('README');
    expect(entry.previewKind).toBeNull();
    expect(entry.mimeType).toBe('application/octet-stream');
    expect(entry.inlineByDefault).toBe(false);
  });
});
