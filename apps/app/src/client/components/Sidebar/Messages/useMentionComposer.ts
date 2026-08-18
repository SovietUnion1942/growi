import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useCallback,
  useRef,
  useState,
} from 'react';

import type {
  IConversation,
  IConversationParticipant,
} from '~/stores/messages';

import {
  applyMention,
  detectMentionQuery,
  type MentionQuery,
} from './mention-query';
import { useMentionCandidates } from './useMentionCandidates';

type UseMentionComposerParams = {
  conversation: IConversation;
  currentUserId: string | undefined;
  body: string;
  setBody: (body: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
};

type UseMentionComposerResult = {
  candidates: IConversationParticipant[];
  activeIndex: number;
  isOpen: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  // returns true when the key was consumed by mention navigation -- the
  // caller should skip its own handling (e.g. submit-on-Enter) in that case
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => boolean;
  selectCandidate: (user: IConversationParticipant) => void;
  setActiveIndex: (index: number) => void;
  resolveMentionedUserIds: (finalBody: string) => string[];
  reset: () => void;
};

export const useMentionComposer = (
  params: UseMentionComposerParams,
): UseMentionComposerResult => {
  const { conversation, currentUserId, body, setBody, inputRef } = params;

  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // username -> userId, accumulated as candidates are picked. Needed for
  // 'broadcast' conversations, which have no fixed participant directory to
  // resolve "@username" back to an id from at submit time.
  const mentionedUsersMapRef = useRef(new Map<string, string>());

  const candidates = useMentionCandidates(
    conversation,
    mentionQuery?.query ?? null,
    currentUserId,
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setBody(value);
      setMentionQuery(detectMentionQuery(value.slice(0, cursorPos)));
      setActiveIndex(0);
    },
    [setBody],
  );

  const selectCandidate = useCallback(
    (user: IConversationParticipant) => {
      const inputEl = inputRef.current;
      if (mentionQuery == null || inputEl == null) {
        return;
      }
      const cursorPos = inputEl.selectionStart ?? body.length;
      const { text, cursorPos: nextCursorPos } = applyMention(
        body,
        mentionQuery.triggerIndex,
        cursorPos,
        user.username,
      );
      mentionedUsersMapRef.current.set(user.username, user._id);
      setBody(text);
      setMentionQuery(null);
      // the input's value updates on the next render; move the caret there
      requestAnimationFrame(() => {
        inputEl.focus();
        inputEl.setSelectionRange(nextCursorPos, nextCursorPos);
      });
    },
    [body, inputRef, mentionQuery, setBody],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>): boolean => {
      if (mentionQuery == null || candidates.length === 0) {
        return false;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % candidates.length);
        return true;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + candidates.length) % candidates.length);
        return true;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectCandidate(candidates[activeIndex]);
        return true;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return true;
      }
      return false;
    },
    [activeIndex, candidates, mentionQuery, selectCandidate],
  );

  const resolveMentionedUserIds = useCallback(
    (finalBody: string): string[] => {
      const usernames = Array.from(finalBody.matchAll(/@([^\s@]+)/g)).map(
        (m) => m[1],
      );
      const ids = new Set<string>();
      usernames.forEach((username) => {
        if (conversation.type === 'broadcast') {
          const id = mentionedUsersMapRef.current.get(username);
          if (id != null) {
            ids.add(id);
          }
          return;
        }
        const participant = conversation.participants.find(
          (p) => p.username === username,
        );
        if (participant != null) {
          ids.add(participant._id);
        }
      });
      return Array.from(ids);
    },
    [conversation],
  );

  const reset = useCallback(() => {
    setMentionQuery(null);
    setActiveIndex(0);
  }, []);

  return {
    candidates,
    activeIndex,
    isOpen: mentionQuery != null && candidates.length > 0,
    onChange,
    onKeyDown,
    selectCandidate,
    setActiveIndex,
    resolveMentionedUserIds,
    reset,
  };
};
