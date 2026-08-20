import useSWR, { type SWRResponse } from 'swr';

import { apiv3Get } from '~/client/util/apiv3-client';

import type { WikiGapSuggestion } from '../../interfaces/wiki-gap-suggestion';

export const WIKI_GAP_SUGGESTIONS_SWR_KEY = '/wiki-gap-suggestions';

export const useSWRxWikiGapSuggestions = (): SWRResponse<
  WikiGapSuggestion[],
  Error
> => {
  return useSWR(WIKI_GAP_SUGGESTIONS_SWR_KEY, (endpoint) =>
    apiv3Get(endpoint).then((res) => res.data.suggestions),
  );
};
