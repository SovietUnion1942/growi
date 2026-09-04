import { describe, expect, it } from 'vitest';

import { markdownToDoc } from '../markdown/parser';
import { computeNodeRange } from './nodeRangeDiff';

const doc = (md: string) => markdownToDoc(md, false);

describe('computeNodeRange', () => {
  it('identical docs -> empty range (start === oldEnd === newEnd)', () => {
    const r = computeNodeRange(doc('# A\n\npara\n'), doc('# A\n\npara\n'));
    expect(r.start).toBe(r.oldEnd);
    expect(r.start).toBe(r.newEnd);
  });

  it('prefix-only change', () => {
    const a = doc('# A\n\npara1\n\npara2\n');
    const b = doc('# CHANGED\n\npara1\n\npara2\n');
    const r = computeNodeRange(a, b);
    expect(r).toEqual({ start: 0, oldEnd: 1, newEnd: 1 });
  });

  it('suffix-only change', () => {
    const a = doc('# A\n\npara1\n\npara2\n');
    const b = doc('# A\n\npara1\n\nPARA2 changed\n');
    const r = computeNodeRange(a, b);
    expect(r.start).toBe(2);
    expect(r.oldEnd).toBe(3);
    expect(r.newEnd).toBe(3);
  });

  it('middle insertion', () => {
    const a = doc('# A\n\npara1\n\npara2\n');
    const b = doc('# A\n\npara1\n\nINSERTED\n\npara2\n');
    const r = computeNodeRange(a, b);
    expect(r.start).toBe(2);
    expect(r.oldEnd).toBe(2); // nothing removed
    expect(r.newEnd).toBe(3); // one added
  });

  it('whole-body replacement', () => {
    const a = doc('# A\n\npara1\n');
    const b = doc('completely\n\ndifferent\n\ncontent\n');
    const r = computeNodeRange(a, b);
    expect(r.start).toBe(0);
    expect(r.oldEnd).toBe(a.childCount);
    expect(r.newEnd).toBe(b.childCount);
  });
});
