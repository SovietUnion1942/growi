// @vitest-environment happy-dom

import { render, screen, within } from '@testing-library/react';

vi.mock('next/router', () => ({
  useRouter: () => ({ push: vi.fn(), events: { on: vi.fn(), off: vi.fn() } }),
}));

// `UserPicture`'s badge tooltip is a `next/dynamic`-loaded
// `UncontrolledTooltip` (reactstrap). Mock it to a synchronous stub, same as
// `packages/ui/src/components/UserPicture.spec.tsx` and the other
// `UserPicture`-wiring specs in this task group do, so the badge tooltip
// doesn't asynchronously mount and hit a stale colon-containing selector
// against happy-dom.
vi.mock('next/dynamic', () => ({
  default: () => {
    const Stub = ({ children }: { children?: React.ReactNode }) => (
      <span data-testid="mock-tooltip">{children}</span>
    );
    return Stub;
  },
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const useSWRxBadgeTypeCatalog = vi.fn();
vi.mock('~/features/user-badge/client/stores/badge-type-catalog', () => ({
  useSWRxBadgeTypeCatalog: (...args: unknown[]) =>
    useSWRxBadgeTypeCatalog(...args),
}));

const useCurrentUser = vi.fn();
vi.mock('~/states/global', () => ({
  useCurrentUser: (...args: unknown[]) => useCurrentUser(...args),
}));

const useGlobalSocket = vi.fn();
vi.mock('~/states/socket-io', () => ({
  useGlobalSocket: (...args: unknown[]) => useGlobalSocket(...args),
}));

const useSWRxMessages = vi.fn();
const markConversationAsRead = vi.fn();
const sendMessage = vi.fn();
const toggleMessageReaction = vi.fn();
const deleteMessage = vi.fn();
vi.mock('~/stores/messages', () => ({
  CONVERSATIONS_SWR_KEY: '/messages/conversations',
  useSWRxMessages: (...args: unknown[]) => useSWRxMessages(...args),
  markConversationAsRead: (...args: unknown[]) =>
    markConversationAsRead(...args),
  sendMessage: (...args: unknown[]) => sendMessage(...args),
  toggleMessageReaction: (...args: unknown[]) => toggleMessageReaction(...args),
  deleteMessage: (...args: unknown[]) => deleteMessage(...args),
}));

import { makeBadgeSummaryFixture } from '~/features/user-badge/test-utils/badge-summary-fixture';
import type {
  IConversation,
  IConversationParticipant,
  IMessage,
} from '~/stores/messages';

import { MessageThread } from './MessageThread';

const conversation: IConversation = {
  _id: 'conv1',
  type: 'direct',
  participants: [],
  lastMessageAt: '2026-08-17T00:00:00.000Z',
  createdAt: '2026-08-17T00:00:00.000Z',
  unreadCount: 0,
  isMuted: false,
};

// `makeBadgeSummaryFixture` produces `badgeType: string` entries;
// `IUserBadgeSummaryEntry.badgeType` (packages/core) is typed as
// `Types.ObjectId` for the server-side Mongoose model but is actually a
// plain string once it reaches the client over JSON, so the fixture (and
// this cast) match runtime reality -- same pattern as AuthorInfo.spec.tsx.
const senderWithBadge = {
  _id: 'sender-badge',
  username: 'alice',
  name: 'Alice',
  badgeSummaryCached: makeBadgeSummaryFixture(),
} as unknown as IConversationParticipant;

const senderNoBadge: IConversationParticipant = {
  _id: 'sender-no-badge',
  username: 'bob',
  name: 'Bob',
};

const buildMessage = (
  overrides: Partial<IMessage> & Pick<IMessage, '_id' | 'sender'>,
): IMessage => ({
  conversation: 'conv1',
  body: 'hello',
  readBy: [],
  mentionedUserIds: [],
  reactions: [],
  createdAt: '2026-08-17T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  useSWRxBadgeTypeCatalog.mockReturnValue({ data: [], isLoading: false });
  useCurrentUser.mockReturnValue(undefined);
  useGlobalSocket.mockReturnValue(null);
  markConversationAsRead.mockResolvedValue(undefined);
});

describe('MessageThread', () => {
  it('renders a badge icon for a message whose sender has badgeSummaryCached', () => {
    const message = buildMessage({
      _id: 'msg1',
      sender: senderWithBadge,
      body: 'hi there',
    });
    useSWRxMessages.mockReturnValue({
      data: [{ docs: [message] }],
      mutate: vi.fn(),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
    });

    render(<MessageThread conversation={conversation} />);

    expect(screen.getByTestId('user-picture-badge')).toBeInTheDocument();
  });

  it('does not render a badge for a message whose sender has no badge data, and still renders the avatar/name', () => {
    const message = buildMessage({
      _id: 'msg2',
      sender: senderNoBadge,
      body: 'no badge here',
    });
    useSWRxMessages.mockReturnValue({
      data: [{ docs: [message] }],
      mutate: vi.fn(),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
    });

    render(<MessageThread conversation={conversation} />);

    expect(screen.queryByTestId('user-picture-badge')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('no badge here')).toBeInTheDocument();
  });

  it('attributes badges to the correct message when senders differ across messages', () => {
    // `useSWRxMessages` pages are newest-first and get reversed for display
    // (see `MessageThread.tsx`), so the docs array here is provided in
    // reverse of the intended display order: [badge-message, no-badge-message].
    const badgeMessage = buildMessage({
      _id: 'msg-badge',
      sender: senderWithBadge,
      body: 'badge message',
    });
    const noBadgeMessage = buildMessage({
      _id: 'msg-no-badge',
      sender: senderNoBadge,
      body: 'plain message',
    });
    useSWRxMessages.mockReturnValue({
      data: [{ docs: [noBadgeMessage, badgeMessage] }],
      mutate: vi.fn(),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
    });

    render(<MessageThread conversation={conversation} />);

    const listItems = screen.getAllByRole('listitem');
    expect(listItems).toHaveLength(2);

    const badgeListItem = listItems.find((li) =>
      li.textContent?.includes('badge message'),
    );
    const noBadgeListItem = listItems.find((li) =>
      li.textContent?.includes('plain message'),
    );

    expect(badgeListItem).toBeDefined();
    expect(noBadgeListItem).toBeDefined();

    expect(
      within(badgeListItem as HTMLElement).getByTestId('user-picture-badge'),
    ).toBeInTheDocument();
    expect(
      within(noBadgeListItem as HTMLElement).queryByTestId(
        'user-picture-badge',
      ),
    ).not.toBeInTheDocument();
  });

  it('renders a placeholder instead of the body for a deleted message', () => {
    const message = buildMessage({
      _id: 'msg-deleted',
      sender: senderNoBadge,
      body: '',
      deletedAt: '2026-08-20T00:00:00.000Z',
    });
    useSWRxMessages.mockReturnValue({
      data: [{ docs: [message] }],
      mutate: vi.fn(),
      size: 1,
      setSize: vi.fn(),
      isLoading: false,
    });

    render(<MessageThread conversation={conversation} />);

    expect(
      screen.getByText('このメッセージは削除されました'),
    ).toBeInTheDocument();
  });
});
