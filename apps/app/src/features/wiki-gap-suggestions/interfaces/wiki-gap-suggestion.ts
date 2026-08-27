// Shared shape between the apiv3 read endpoint and the client — a single
// normalized query the AI agent's fullTextSearchTool found nothing for,
// aggregated across all askers (no asker identity is ever recorded, see
// server/services/record-no-result-search.ts).
export type WikiGapSuggestion = {
  query: string;
  count: number;
  lastSeenAt: string;
};
