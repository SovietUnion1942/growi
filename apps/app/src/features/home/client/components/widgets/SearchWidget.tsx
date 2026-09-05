import type { FC, FormEvent } from 'react';
import { useCallback, useState } from 'react';

import { useSetSearchKeyword } from '~/states/search';

// Hardcoded label: i18n wiring is deferred to the HomeWidgets integration (task 6.1).
const SEARCH_LABEL = 'Search';

/**
 * Large, prominent search box for the Home page widget area.
 *
 * Submitting a non-empty keyword navigates to the existing search results
 * screen via the same `useSetSearchKeyword` mechanism used by the rest of
 * the app (e.g. SearchModal, TagCloudBox) — no new navigation/search logic
 * is introduced here.
 *
 * Submitting with an empty/whitespace-only keyword is a no-op: it must not
 * navigate, must not throw, and must not surface an error screen.
 */
export const SearchWidget: FC = () => {
  const [keyword, setKeyword] = useState('');
  const setSearchKeyword = useSetSearchKeyword();

  const submitHandler = useCallback(
    (e: FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const trimmedKeyword = keyword.trim();
      if (trimmedKeyword.length === 0) {
        // No-op: do not navigate on an empty/whitespace-only keyword.
        return;
      }

      setSearchKeyword(trimmedKeyword);
    },
    [keyword, setSearchKeyword],
  );

  return (
    <form className="grw-home-search-widget" onSubmit={submitHandler}>
      <div className="input-group input-group-lg">
        <input
          type="search"
          className="form-control"
          style={{ minHeight: '3rem', fontSize: '1.25rem' }}
          placeholder={SEARCH_LABEL}
          aria-label={SEARCH_LABEL}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          aria-label={SEARCH_LABEL}
        >
          <span className="material-symbols-outlined">search</span>
        </button>
      </div>
    </form>
  );
};
