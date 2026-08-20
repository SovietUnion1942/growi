import { describe, expect, it } from 'vitest';

import { normalizeSearchQuery } from './normalize-search-query';

describe('normalizeSearchQuery', () => {
  it('lowercases the query', () => {
    expect(normalizeSearchQuery('Physics Club')).toBe('physics club');
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeSearchQuery('  physics club  ')).toBe('physics club');
  });

  it('collapses internal runs of whitespace to a single space', () => {
    expect(normalizeSearchQuery('physics   club')).toBe('physics club');
  });

  it('leaves an already-normalized query unchanged', () => {
    expect(normalizeSearchQuery('physics club')).toBe('physics club');
  });

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeSearchQuery('   ')).toBe('');
  });
});
