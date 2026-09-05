// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';

import type { IConversation } from '~/stores/messages';

const useCurrentUser = vi.fn();
vi.mock('~/states/global', () => ({
  useCurrentUser: (...args: unknown[]) => useCurrentUser(...args),
}));

const muteConversation = vi.fn();
vi.mock('~/stores/messages', () => ({
  CONVERSATIONS_SWR_KEY: '/messages/conversations',
  getConversationDisplayName: (conversation: IConversation) =>
    conversation.name ?? 'display-name',
  muteConversation: (...args: unknown[]) => muteConversation(...args),
}));

// The thread body / member list are heavy, unrelated subtrees -- stub them so
// this spec stays focused on the FloatingPanel wiring (title, close, mute).
vi.mock('./MessageThread', () => ({
  MessageThread: () => <div data-testid="message-thread" />,
}));
vi.mock('./GroupMembersModal', () => ({
  GroupMembersModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div data-testid="group-members-modal" /> : null,
}));

const closeSpy = vi.fn();
const updateSpy = vi.fn();
const { threadStatus } = vi.hoisted(() => ({
  threadStatus: { current: null as IConversation | null },
}));
vi.mock('./messages-thread-status', () => ({
  useMessagesThreadStatus: () => threadStatus.current,
  useMessagesThreadActions: () => ({
    open: vi.fn(),
    close: closeSpy,
    update: updateSpy,
  }),
}));

import { MessagesFloatingThread } from './MessagesFloatingThread';

const buildConversation = (
  overrides: Partial<IConversation> = {},
): IConversation => ({
  _id: 'conv-1',
  type: 'direct',
  name: 'Alice',
  participants: [],
  lastMessageAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  unreadCount: 0,
  isMuted: false,
  ...overrides,
});

beforeEach(() => {
  threadStatus.current = null;
  closeSpy.mockClear();
  updateSpy.mockClear();
  muteConversation.mockClear();
  useCurrentUser.mockReturnValue({ _id: 'me' });
});

describe('MessagesFloatingThread', () => {
  it('renders nothing when there is no active conversation', () => {
    const { container } = render(<MessagesFloatingThread />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the floating panel with the conversation display name as title', () => {
    threadStatus.current = buildConversation({ name: 'Alice' });
    render(<MessagesFloatingThread />);

    // The title appears both as the header heading text.
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getByTestId('message-thread')).toBeInTheDocument();
  });

  it('mute toggle calls muteConversation and updates the thread status', async () => {
    threadStatus.current = buildConversation({ isMuted: false });
    render(<MessagesFloatingThread />);

    fireEvent.click(screen.getByTitle('ミュート'));

    await vi.waitFor(() => {
      expect(muteConversation).toHaveBeenCalledWith('conv-1', true);
    });
    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'conv-1', isMuted: true }),
    );
  });

  it('close button calls the thread status close() action', () => {
    threadStatus.current = buildConversation();
    render(<MessagesFloatingThread />);

    fireEvent.click(screen.getByLabelText('Close'));

    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
