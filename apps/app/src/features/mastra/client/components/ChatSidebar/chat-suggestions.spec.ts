import { describe, expect, it } from 'vitest';

import { buildChatSuggestions } from './chat-suggestions';

describe('buildChatSuggestions', () => {
  it('always includes the static fallback suggestion', () => {
    const suggestions = buildChatSuggestions({ hasBadges: false });
    expect(suggestions.map((s) => s.key)).toContain('whats-new');
  });

  it('adds a page-summary suggestion derived from the last path segment', () => {
    const suggestions = buildChatSuggestions({
      currentPagePath: '/物理研/夏合宿',
      hasBadges: false,
    });
    const pageSuggestion = suggestions.find(
      (s) => s.key === 'summarize-current-page',
    );
    expect(pageSuggestion?.label).toBe('「夏合宿」を要約');
    expect(pageSuggestion?.prompt).toContain('夏合宿');
  });

  it('omits the page-summary suggestion for the root path', () => {
    const suggestions = buildChatSuggestions({
      currentPagePath: '/',
      hasBadges: false,
    });
    expect(suggestions.some((s) => s.key === 'summarize-current-page')).toBe(
      false,
    );
  });

  it('adds a wiki-gap suggestion when a top query is provided', () => {
    const suggestions = buildChatSuggestions({
      topWikiGapQuery: '文化祭の日程',
      hasBadges: false,
    });
    const gapSuggestion = suggestions.find((s) => s.key === 'wiki-gap');
    expect(gapSuggestion?.prompt).toBe('文化祭の日程');
  });

  it('omits the wiki-gap suggestion for a blank query', () => {
    const suggestions = buildChatSuggestions({
      topWikiGapQuery: '   ',
      hasBadges: false,
    });
    expect(suggestions.some((s) => s.key === 'wiki-gap')).toBe(false);
  });

  it('adds a badges suggestion only when the user has badges', () => {
    const withBadges = buildChatSuggestions({ hasBadges: true });
    const withoutBadges = buildChatSuggestions({ hasBadges: false });
    expect(withBadges.some((s) => s.key === 'my-badges')).toBe(true);
    expect(withoutBadges.some((s) => s.key === 'my-badges')).toBe(false);
  });
});
