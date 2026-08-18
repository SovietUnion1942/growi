import { useEffect, useMemo, useState } from 'react';
import { debounce } from 'throttle-debounce';

import {
  type IConversation,
  type IConversationParticipant,
  searchUsers,
} from '~/stores/messages';

// direct/group conversations have a small, already-fetched participant
// list, so candidates are filtered client-side. 'broadcast' has no fixed
// participant list, so it debounces against the full user-search API
// instead, mirroring UserSearchList.
export const useMentionCandidates = (
  conversation: IConversation,
  query: string | null,
  currentUserId: string | undefined,
): IConversationParticipant[] => {
  const [searchResults, setSearchResults] = useState<
    IConversationParticipant[]
  >([]);

  const runSearch = useMemo(
    () =>
      debounce(300, async (text: string) => {
        const users = await searchUsers(text);
        setSearchResults(users);
      }),
    [],
  );

  useEffect(() => {
    if (conversation.type === 'broadcast' && query != null) {
      runSearch(query);
    }
  }, [conversation.type, query, runSearch]);

  if (query == null) {
    return [];
  }

  if (conversation.type === 'broadcast') {
    return searchResults.filter((u) => u._id !== currentUserId);
  }

  const lowerQuery = query.toLowerCase();
  return conversation.participants.filter(
    (p) =>
      p._id !== currentUserId &&
      (p.name?.toLowerCase().includes(lowerQuery) ||
        p.username?.toLowerCase().includes(lowerQuery)),
  );
};
