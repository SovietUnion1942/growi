import { describe, expect, it } from 'vitest';

import { isValidBoardId } from './board';

describe('isValidBoardId', () => {
  it.each([
    'physics-lab',
    'Board_1',
    'a',
    'x'.repeat(64),
    '0123456789abcdef01234567', // a 24-hex string is still a valid board id
  ])('accepts %j', (id) => {
    expect(isValidBoardId(id)).toBe(true);
  });

  it.each([
    '',
    'x'.repeat(65),
    'has space',
    'slash/inside',
    'dot.dot',
    'unicode-ずんだ',
    '../etc/passwd',
  ])('rejects %j', (id) => {
    expect(isValidBoardId(id)).toBe(false);
  });
});
