import { useAtomValue } from 'jotai';
import useSWR, { type SWRResponse } from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';
import { wikiGapSuggestionsEnabledAtom } from '~/states/server-configurations';

import type { WikiGapSuggestion } from '../../interfaces/wiki-gap-suggestion';

export const WIKI_GAP_SUGGESTIONS_SWR_KEY = '/wiki-gap-suggestions';

export const useSWRxWikiGapSuggestions = (): SWRResponse<
  WikiGapSuggestion[],
  Error
> => {
  // Feature gate (app:wikiGapSuggestionsEnabled): a null key suppresses the
  // fetch — the report route 404s in that state.
  const isEnabled = useAtomValue(wikiGapSuggestionsEnabledAtom);
  return useSWR(isEnabled ? WIKI_GAP_SUGGESTIONS_SWR_KEY : null, (endpoint) =>
    apiv3Get(endpoint).then((res) => res.data.suggestions),
  );
};
