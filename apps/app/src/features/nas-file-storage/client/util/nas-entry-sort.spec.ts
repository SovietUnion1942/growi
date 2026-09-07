import type { NasEntry } from '~/features/nas-file-storage/interfaces';

import { sortNasEntries } from './nas-entry-sort';

const file = (
  name: string,
  sizeBytes: number,
  modifiedAt: string,
): NasEntry => ({ name, type: 'file', sizeBytes, modifiedAt });

const entries: NasEntry[] = [
  file('banana.txt', 300, '2026-01-02T00:00:00.000Z'),
  {
    name: 'archive',
    type: 'directory',
    sizeBytes: 0,
    modifiedAt: '2026-03-01T00:00:00.000Z',
  },
  file('apple.txt', 100, '2026-01-03T00:00:00.000Z'),
  file('cherry.txt', 200, '2026-01-01T00:00:00.000Z'),
];

const names = (result: NasEntry[]): string[] => result.map((e) => e.name);

describe('sortNasEntries', () => {
  it('name/asc reproduces the server code-unit order', () => {
    expect(names(sortNasEntries(entries, 'name', 'asc'))).toEqual([
      'apple.txt',
      'archive',
      'banana.txt',
      'cherry.txt',
    ]);
  });

  it('name/desc reverses it', () => {
    expect(names(sortNasEntries(entries, 'name', 'desc'))).toEqual([
      'cherry.txt',
      'banana.txt',
      'archive',
      'apple.txt',
    ]);
  });

  it('sorts by size, directories (size 0) sorting as smallest', () => {
    expect(names(sortNasEntries(entries, 'size', 'asc'))).toEqual([
      'archive',
      'apple.txt',
      'cherry.txt',
      'banana.txt',
    ]);
    expect(names(sortNasEntries(entries, 'size', 'desc'))).toEqual([
      'banana.txt',
      'cherry.txt',
      'apple.txt',
      'archive',
    ]);
  });

  it('sorts by modified date', () => {
    expect(names(sortNasEntries(entries, 'modified', 'asc'))).toEqual([
      'cherry.txt',
      'banana.txt',
      'apple.txt',
      'archive',
    ]);
  });

  it('breaks ties by name ascending and is stable regardless of input order', () => {
    const sameSize: NasEntry[] = [
      file('c.txt', 10, '2026-01-01T00:00:00.000Z'),
      file('a.txt', 10, '2026-01-01T00:00:00.000Z'),
      file('b.txt', 10, '2026-01-01T00:00:00.000Z'),
    ];
    expect(names(sortNasEntries(sameSize, 'size', 'desc'))).toEqual([
      'a.txt',
      'b.txt',
      'c.txt',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...entries];
    sortNasEntries(input, 'size', 'desc');
    expect(input).toEqual(entries);
  });

  it('tolerates an unparseable modifiedAt (sorts as epoch)', () => {
    const withBad: NasEntry[] = [
      file('good.txt', 1, '2026-01-01T00:00:00.000Z'),
      file('bad.txt', 1, 'not-a-date'),
    ];
    expect(names(sortNasEntries(withBad, 'modified', 'asc'))).toEqual([
      'bad.txt',
      'good.txt',
    ]);
  });
});
