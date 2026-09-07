import { describe, expect, it } from 'vitest';

import { lineDiffRange } from './lineDiff';

const apply = (before: string, after: string) => {
  const { from, to, insert } = lineDiffRange(before, after);
  return before.slice(0, from) + insert + before.slice(to);
};

describe('lineDiffRange', () => {
  const cases: [name: string, before: string, after: string][] = [
    ['no change', 'a\nb\nc\n', 'a\nb\nc\n'],
    ['change middle line', 'a\nb\nc\n', 'a\nB\nc\n'],
    ['insert line at head', 'a\nb\n', 'x\na\nb\n'],
    ['insert line at tail', 'a\nb\n', 'a\nb\nc\n'],
    ['delete middle line', 'a\nb\nc\n', 'a\nc\n'],
    ['replace whole doc', 'a\nb\n', 'x\ny\nz\n'],
    ['no trailing newline', 'a\nb', 'a\nB'],
    ['empty -> content', '', '# title\n'],
    ['content -> empty', '# title\n', ''],
  ];

  for (const [name, before, after] of cases) {
    it(`reconstructs "after" for: ${name}`, () => {
      expect(apply(before, after)).toBe(after);
    });
  }

  it('returns a range that snaps to line boundaries', () => {
    const { from, to } = lineDiffRange(
      'alpha\nbeta\ngamma\n',
      'alpha\nBETA\ngamma\n',
    );
    // "alpha\n" = 6 chars, then "beta\n" ends at 11
    expect(from).toBe(6);
    expect(to).toBe(11);
  });

  it('no-op for identical input', () => {
    expect(lineDiffRange('same\n', 'same\n')).toEqual({
      from: 0,
      to: 0,
      insert: '',
    });
  });
});
