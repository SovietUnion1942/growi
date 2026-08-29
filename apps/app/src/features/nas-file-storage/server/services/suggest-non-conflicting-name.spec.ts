import {
  MAX_SUGGESTION_ATTEMPTS,
  splitFileName,
  suggestNonConflictingName,
} from './suggest-non-conflicting-name';

describe('splitFileName', () => {
  it('splits a normal file name into stem and dotted extension', () => {
    expect(splitFileName('report.pdf')).toEqual({
      stem: 'report',
      ext: '.pdf',
    });
  });

  it('keeps only the last extension for a multi-dot name', () => {
    expect(splitFileName('archive.tar.gz')).toEqual({
      stem: 'archive.tar',
      ext: '.gz',
    });
  });

  it('treats an extensionless name as an empty extension', () => {
    expect(splitFileName('README')).toEqual({ stem: 'README', ext: '' });
  });

  it('treats a leading-dot name as an empty extension', () => {
    expect(splitFileName('.env')).toEqual({ stem: '.env', ext: '' });
  });
});

describe('suggestNonConflictingName', () => {
  const takenBy = (names: Set<string>) => (candidate: string) =>
    Promise.resolve(names.has(candidate));

  it('suggests "photo (1).png" when no numbered candidate is taken', async () => {
    const result = await suggestNonConflictingName(
      'photo.png',
      takenBy(new Set(['photo.png'])),
    );
    expect(result).toBe('photo (1).png');
  });

  it('skips taken candidates and suggests "photo (2).png"', async () => {
    const result = await suggestNonConflictingName(
      'photo.png',
      takenBy(new Set(['photo.png', 'photo (1).png'])),
    );
    expect(result).toBe('photo (2).png');
  });

  it('numbers an extensionless name as "README (1)"', async () => {
    const result = await suggestNonConflictingName(
      'README',
      takenBy(new Set(['README'])),
    );
    expect(result).toBe('README (1)');
  });

  it('returns undefined when every candidate is taken', async () => {
    const result = await suggestNonConflictingName('photo.png', () =>
      Promise.resolve(true),
    );
    expect(result).toBeUndefined();
  });

  it('probes candidates sequentially and stops at the first free name', async () => {
    const seen: string[] = [];
    const result = await suggestNonConflictingName('photo.png', (candidate) => {
      seen.push(candidate);
      return Promise.resolve(candidate !== 'photo (3).png');
    });
    expect(result).toBe('photo (3).png');
    expect(seen).toEqual(['photo (1).png', 'photo (2).png', 'photo (3).png']);
  });

  it('caps the probe count at MAX_SUGGESTION_ATTEMPTS', async () => {
    let calls = 0;
    await suggestNonConflictingName('photo.png', () => {
      calls += 1;
      return Promise.resolve(true);
    });
    expect(calls).toBe(MAX_SUGGESTION_ATTEMPTS);
  });
});
