import { nasContentDisposition } from '../../server/services/nas-content-disposition';
import { getNasPreviewKind } from './nas-preview-kind';

describe('getNasPreviewKind', () => {
  test.each([
    ['photo.png', 'image'],
    ['clip.mp4', 'video'],
    ['song.mp3', 'audio'],
    ['doc.pdf', 'pdf'],
    ['notes.txt', 'text'],
    ['code.ts', 'text'],
    ['PHOTO.PNG', 'image'], // case-insensitive
  ] as const)('classifies %s as %s', (name, expected) => {
    expect(getNasPreviewKind(name)).toBe(expected);
  });

  test.each([
    ['evil.svg'], // Req 9.4 — scriptable, never previewable
    ['page.html'],
    ['archive.zip'],
    ['archive.xyz'], // unknown extension
    ['README'], // no extension
  ])('returns null for non-previewable %s', (name) => {
    expect(getNasPreviewKind(name)).toBeNull();
  });

  // Proves "サーバー側の分類と同じ結論": the client util and the server's
  // nasContentDisposition must agree on previewKind for every name, because
  // both delegate to the same shared interfaces/nas-preview table.
  test('agrees with server nasContentDisposition on previewKind', () => {
    const names = [
      'photo.png',
      'image.JPEG',
      'clip.mp4',
      'movie.mov',
      'song.mp3',
      'audio.flac',
      'doc.pdf',
      'notes.txt',
      'main.py',
      'style.css',
      'evil.svg',
      'page.html',
      'data.xml',
      'script.js',
      'archive.zip',
      'unknown.xyz',
      'README',
    ];
    for (const name of names) {
      expect(getNasPreviewKind(name)).toBe(
        nasContentDisposition(name, { inlineRequested: true }).previewKind,
      );
    }
  });
});
