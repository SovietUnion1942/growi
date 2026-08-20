import type { JSX } from 'react';
import React from 'react';

import { useSWRxWikiGapSuggestions } from '../stores/wiki-gap-suggestions';

/**
 * Renders wherever a page embeds `:::wiki-gap-suggestions` (see
 * client/remark/wiki-gap-suggestions-directive.ts) -- a live-fetched list of
 * questions the AI agent's search found no wiki page for, each linking to a
 * blank page pre-titled with that query so a member can start writing it.
 * Fails silently (renders nothing) on error/empty -- this is a non-critical
 * supplementary widget, not core page content.
 */
export const WikiGapSuggestionsViewer = React.memo((): JSX.Element | null => {
  const { data: suggestions, error, isLoading } = useSWRxWikiGapSuggestions();

  if (
    isLoading ||
    error != null ||
    suggestions == null ||
    suggestions.length === 0
  ) {
    return null;
  }

  return (
    <div className="wiki-gap-suggestions-viewer border rounded p-3 my-3">
      <div className="fw-bold mb-2">
        <span className="material-symbols-outlined align-text-bottom me-1">
          auto_awesome
        </span>
        こんな質問に、まだ答えるページがありません
      </div>
      <ul className="mb-0 ps-4">
        {suggestions.map((suggestion) => (
          <li key={suggestion.query}>
            <a href={`/${encodeURIComponent(suggestion.query)}#edit`}>
              {suggestion.query}
            </a>
            <span className="text-muted small ms-1">
              ({suggestion.count}回)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
});
WikiGapSuggestionsViewer.displayName = 'WikiGapSuggestionsViewer';
