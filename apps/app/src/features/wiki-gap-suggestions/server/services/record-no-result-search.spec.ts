import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('~/utils/logger', () => ({
  default: () => ({
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
  }),
}));

const mocks = vi.hoisted(() => ({
  findOneAndUpdate: vi.fn(),
  enabled: { value: true },
}));

vi.mock('../models/wiki-gap-query-model', () => ({
  default: {
    findOneAndUpdate: mocks.findOneAndUpdate,
  },
}));
vi.mock('../is-wiki-gap-suggestions-enabled', () => ({
  isWikiGapSuggestionsEnabled: () => mocks.enabled.value,
}));

import { recordNoResultSearch } from './record-no-result-search';

describe('recordNoResultSearch', () => {
  beforeEach(() => {
    mocks.enabled.value = true;
    mocks.findOneAndUpdate.mockReset();
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockResolvedValue(undefined),
    });
  });

  it('upserts by the normalized query, incrementing count and refreshing lastSeenAt/rawQueryExample', async () => {
    await recordNoResultSearch('  Physics   Club  ');

    expect(mocks.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = mocks.findOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ normalizedQuery: 'physics club' });
    expect(update.$inc).toEqual({ count: 1 });
    expect(update.$set.rawQueryExample).toBe('  Physics   Club  ');
    expect(update.$setOnInsert.firstSeenAt).toBeInstanceOf(Date);
    expect(options).toEqual({ upsert: true });
  });

  it('does nothing for a whitespace-only query', async () => {
    await recordNoResultSearch('   ');

    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('never throws when the DB call fails', async () => {
    mocks.findOneAndUpdate.mockReturnValue({
      exec: vi.fn().mockRejectedValue(new Error('db exploded')),
    });

    await expect(recordNoResultSearch('physics')).resolves.toBeUndefined();
  });

  it('records nothing when the feature is disabled', async () => {
    mocks.enabled.value = false;

    await recordNoResultSearch('physics');

    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
