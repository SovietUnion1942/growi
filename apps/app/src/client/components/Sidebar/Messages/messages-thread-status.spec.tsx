import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { Provider } from 'jotai';

import type { IConversation } from '~/stores/messages';

import {
  useMessagesThreadActions,
  useMessagesThreadStatus,
} from './messages-thread-status';

const buildConversation = (
  overrides: Partial<IConversation> = {},
): IConversation => ({
  _id: 'conv-1',
  type: 'direct',
  participants: [],
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  unreadCount: 0,
  isMuted: false,
  ...overrides,
});

/**
 * Render both hooks together under a fresh Jotai Provider so each test gets an
 * isolated store (no state leakage between tests). The two hooks share the
 * same store, allowing actions to be observed via the status hook.
 */
const renderMessagesThread = () => {
  return renderHook(
    () => ({
      status: useMessagesThreadStatus(),
      actions: useMessagesThreadActions(),
    }),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <Provider>{children}</Provider>
      ),
    },
  );
};

describe('messages-thread-status', () => {
  it('has no active conversation initially', () => {
    const { result } = renderMessagesThread();

    expect(result.current.status).toBeNull();
  });

  it('open() sets the active conversation', () => {
    const { result } = renderMessagesThread();
    const conversation = buildConversation();

    act(() => {
      result.current.actions.open(conversation);
    });

    expect(result.current.status).toEqual(conversation);
  });

  it('close() clears the active conversation', () => {
    const { result } = renderMessagesThread();

    act(() => {
      result.current.actions.open(buildConversation());
    });
    act(() => {
      result.current.actions.close();
    });

    expect(result.current.status).toBeNull();
  });

  it('update() replaces the active conversation', () => {
    const { result } = renderMessagesThread();

    act(() => {
      result.current.actions.open(buildConversation({ isMuted: false }));
    });
    act(() => {
      result.current.actions.update(buildConversation({ isMuted: true }));
    });

    expect(result.current.status?.isMuted).toBe(true);
  });
});
