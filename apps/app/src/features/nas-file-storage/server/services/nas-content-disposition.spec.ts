import { nasContentDisposition } from './nas-content-disposition';

describe('nasContentDisposition', () => {
  describe('previewable formats honour an inline request', () => {
    it('serves an image inline when inline is requested', () => {
      expect(
        nasContentDisposition('photo.png', { inlineRequested: true }),
      ).toEqual({
        contentType: 'image/png',
        disposition: 'inline',
        previewKind: 'image',
      });
    });

    it('falls back to attachment for the same image when inline is not requested', () => {
      expect(
        nasContentDisposition('photo.png', { inlineRequested: false }),
      ).toEqual({
        contentType: 'image/png',
        disposition: 'attachment',
        previewKind: 'image',
      });
    });

    const inlineCases: Array<[string, string, string]> = [
      ['clip.mp4', 'video/mp4', 'video'],
      ['song.mp3', 'audio/mpeg', 'audio'],
      ['doc.pdf', 'application/pdf', 'pdf'],
      ['notes.txt', 'text/plain', 'text'],
    ];
    it.each(
      inlineCases,
    )('%s is delivered inline on request', (fileName, contentType, previewKind) => {
      expect(
        nasContentDisposition(fileName, { inlineRequested: true }),
      ).toEqual({
        contentType,
        disposition: 'inline',
        previewKind,
      });
    });
  });

  describe('scriptable formats are always attachment (Req 9.6)', () => {
    it('forces evil.svg to attachment even when inline is requested', () => {
      const result = nasContentDisposition('evil.svg', {
        inlineRequested: true,
      });
      expect(result.disposition).toBe('attachment');
      expect(result.previewKind).toBeNull();
    });

    it('forces page.html to attachment with a non-executable content type', () => {
      const result = nasContentDisposition('page.html', {
        inlineRequested: true,
      });
      expect(result.disposition).toBe('attachment');
      expect(result.previewKind).toBeNull();
      expect(result.contentType).not.toBe('text/html');
    });

    it('forces data.xml to attachment', () => {
      const result = nasContentDisposition('data.xml', {
        inlineRequested: true,
      });
      expect(result.disposition).toBe('attachment');
      expect(result.previewKind).toBeNull();
    });

    it('forces script.js to attachment with a non-executable content type', () => {
      const result = nasContentDisposition('script.js', {
        inlineRequested: true,
      });
      expect(result.disposition).toBe('attachment');
      expect(result.previewKind).toBeNull();
      expect(result.contentType).not.toBe('application/javascript');
    });
  });

  describe('unknown / extensionless names', () => {
    it('treats an unknown extension as an opaque attachment', () => {
      expect(
        nasContentDisposition('archive.xyz', { inlineRequested: true }),
      ).toEqual({
        contentType: 'application/octet-stream',
        disposition: 'attachment',
        previewKind: null,
      });
    });

    it('treats an extensionless name as an opaque attachment', () => {
      expect(nasContentDisposition('NOTES', { inlineRequested: true })).toEqual(
        {
          contentType: 'application/octet-stream',
          disposition: 'attachment',
          previewKind: null,
        },
      );
    });
  });
});
