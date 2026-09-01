import { configManager } from '~/server/service/config-manager';

/**
 * Feature gate for wiki-gap suggestions (`app:wikiGapSuggestionsEnabled`, env
 * `WIKI_GAP_SUGGESTIONS`, default OFF). When false: `recordNoResultSearch` is
 * a no-op, the `/wiki-gap-suggestions` report route 404s, and the client
 * viewer / chat chips render nothing.
 *
 * Imports only `configManager`, so it is safe to pull into the boot-time
 * route graph.
 */
export const isWikiGapSuggestionsEnabled = (): boolean =>
  configManager.getConfig('app:wikiGapSuggestionsEnabled');
