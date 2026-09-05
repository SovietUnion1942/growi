import type { FC, FormEvent } from 'react';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSetSearchKeyword } from '~/states/search';

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
  const { t } = useTranslation();
  const [keyword, setKeyword] = useState('');
  const setSearchKeyword = useSetSearchKeyword();

  const searchLabel = t('home.widgets.search_placeholder');

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
          placeholder={searchLabel}
          aria-label={searchLabel}
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary"
          aria-label={searchLabel}
        >
          <span className="material-symbols-outlined">search</span>
        </button>
      </div>
    </form>
  );
};
