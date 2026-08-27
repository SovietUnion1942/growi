export type ChatSuggestion = {
  key: string;
  label: string;
  prompt: string;
};

type BuildChatSuggestionsParams = {
  currentPagePath?: string;
  topWikiGapQuery?: string;
  hasBadges: boolean;
};

// Last non-empty path segment, decoded, as a human-readable page title —
// e.g. "/物理研/夏合宿" -> "夏合宿". Root ("/") and a malformed URI component
// both fall back to undefined so the caller skips the page-specific
// suggestion rather than showing a garbled label.
const derivePageTitle = (pagePath: string): string | undefined => {
  const segments = pagePath.split('/').filter((s) => s.length > 0);
  const last = segments.at(-1);
  if (last == null) return undefined;
  try {
    return decodeURIComponent(last);
  } catch {
    return undefined;
  }
};

/**
 * Builds the Copilot-style suggestion chips shown above an empty chat —
 * deterministic and rule-based (no extra AI call) from context already
 * available client-side: the page being viewed, the top wiki-gap-suggestions
 * entry (see features/wiki-gap-suggestions), and whether the user has any
 * badges. A couple of static fallbacks keep the row non-empty even with no
 * contextual data.
 */
export const buildChatSuggestions = (
  params: BuildChatSuggestionsParams,
): ChatSuggestion[] => {
  const suggestions: ChatSuggestion[] = [];

  const pageTitle =
    params.currentPagePath != null
      ? derivePageTitle(params.currentPagePath)
      : undefined;
  if (pageTitle != null) {
    suggestions.push({
      key: 'summarize-current-page',
      label: `「${pageTitle}」を要約`,
      prompt: `このページ(${pageTitle})の内容を要約してください`,
    });
  }

  if (
    params.topWikiGapQuery != null &&
    params.topWikiGapQuery.trim().length > 0
  ) {
    suggestions.push({
      key: 'wiki-gap',
      label: `「${params.topWikiGapQuery}」について`,
      prompt: params.topWikiGapQuery,
    });
  }

  if (params.hasBadges) {
    suggestions.push({
      key: 'my-badges',
      label: '自分のバッジを見る',
      prompt: '私が獲得しているバッジを教えてください',
    });
  }

  suggestions.push({
    key: 'whats-new',
    label: '最近更新されたページ',
    prompt: '最近更新されたページを教えてください',
  });

  return suggestions;
};
