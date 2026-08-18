import {
  type JSX,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { UserPicture } from '@growi/ui/dist/components';
import { mutate as mutateGlobal } from 'swr';

import {
  type UserPictureBadgeSource,
  useUserPictureBadges,
} from '~/features/user-badge/client/hooks/use-user-picture-badges';
import { SocketEventName } from '~/interfaces/websocket';
import { useCurrentUser } from '~/states/global';
import { useGlobalSocket } from '~/states/socket-io';
import {
  CONVERSATIONS_SWR_KEY,
  type IConversation,
  type IMessage,
  markConversationAsRead,
  sendMessage,
  useSWRxMessages,
} from '~/stores/messages';

import { MentionAutocomplete } from './MentionAutocomplete';
import { splitMessageBodyIntoMentionSegments } from './mention-query';
import { useMentionComposer } from './useMentionComposer';

type Props = {
  conversation: IConversation;
};

type MessageItemProps = {
  message: IMessage;
  isMine: boolean;
  isFirstOfRun: boolean;
};

/**
 * Renders a single message bubble, including the sender's avatar/name (shown
 * only at the start of a run of consecutive messages from the same person).
 *
 * `useUserPictureBadges` is a hook, so it cannot be called directly inside
 * `MessageThread`'s `.map()` callback over `messages` (that would call a
 * hook a variable number of times per render, violating the Rules of
 * Hooks -- same reasoning as `UserPictureListItem.jsx`). Extracting one
 * message bubble into its own component makes each call site a proper
 * component instance.
 */
const MessageItem = ({
  message,
  isMine,
  isFirstOfRun,
}: MessageItemProps): JSX.Element => {
  // `IUserBadgeSummaryEntry.badgeType` (packages/core) is typed as
  // `Types.ObjectId` for the server-side Mongoose model, but by the time it
  // reaches this client component (via API JSON serialization) it is
  // actually a string; normalize explicitly to match
  // `UserPictureBadgeSource.badgeType: string`.
  const badgeSummary = useMemo<UserPictureBadgeSource[] | undefined>(() => {
    return message.sender.badgeSummaryCached?.map(
      ({ badgeType, iconKey, iconType, iconUrl, name, level }) => ({
        badgeType: String(badgeType),
        iconKey,
        iconType,
        iconUrl,
        name,
        level,
      }),
    );
  }, [message.sender.badgeSummaryCached]);

  const badges = useUserPictureBadges(badgeSummary);

  const segments = useMemo(
    () => splitMessageBodyIntoMentionSegments(message.body),
    [message.body],
  );

  return (
    <li className="mb-2">
      {!isMine && isFirstOfRun && (
        <div className="d-flex align-items-center mb-1">
          <UserPicture user={message.sender} size="sm" badges={badges} />
          <span className="small text-muted ms-2">
            {message.sender.name ?? message.sender.username}
          </span>
        </div>
      )}
      <div
        className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}
      >
        <div
          className={
            isMine ? 'bg-primary text-white' : 'bg-body-tertiary border'
          }
          style={{
            maxWidth: '75%',
            padding: '0.5rem 0.75rem',
            wordBreak: 'break-word',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
            borderRadius: isMine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          }}
        >
          {segments.map((segment, index) =>
            segment.type === 'mention' ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived fresh from message.body each render and never reordered
              <span key={index} className="fw-bold">
                {segment.value}
              </span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are derived fresh from message.body each render and never reordered
              <span key={index}>{segment.value}</span>
            ),
          )}
        </div>
      </div>
    </li>
  );
};

export const MessageThread = (props: Props): JSX.Element => {
  const { conversation } = props;
  const conversationId = conversation._id;

  const socket = useGlobalSocket();
  const currentUser = useCurrentUser();
  const { data, mutate, size, setSize, isLoading } =
    useSWRxMessages(conversationId);

  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const mention = useMentionComposer({
    conversation,
    currentUserId: currentUser?._id,
    body,
    setBody,
    inputRef,
  });

  const markAsRead = useCallback(async () => {
    await markConversationAsRead(conversationId);
    await mutateGlobal(CONVERSATIONS_SWR_KEY);
  }, [conversationId]);

  // mark the conversation read as soon as it's opened
  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  useEffect(() => {
    if (socket == null) {
      return;
    }

    const onMessageCreated = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        mutate();
        // the thread is open, so an incoming message is seen immediately
        markAsRead();
      }
    };

    socket.on(SocketEventName.MessageCreated, onMessageCreated);
    return () => {
      socket.off(SocketEventName.MessageCreated, onMessageCreated);
    };
  }, [conversationId, markAsRead, mutate, socket]);

  // each page is newest-first; earlier pages hold newer messages, so
  // reversing the concatenated pages yields oldest-to-newest for display
  const messages = (data ?? [])
    .flatMap((page) => page.docs)
    .slice()
    .reverse();

  const submitHandler = useCallback(async () => {
    const trimmed = body.trim();
    if (trimmed === '' || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const mentionedUserIds = mention.resolveMentionedUserIds(trimmed);
      await sendMessage(conversationId, trimmed, mentionedUserIds);
      setBody('');
      mention.reset();
      await mutate();
    } finally {
      setIsSending(false);
    }
  }, [body, conversationId, isSending, mention, mutate]);

  const keyDownHandler = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (mention.onKeyDown(e)) {
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitHandler();
      }
    },
    [mention, submitHandler],
  );

  return (
    <div className="d-flex flex-column">
      <div className="flex-grow-1 overflow-auto" style={{ maxHeight: '60vh' }}>
        {isLoading && <div className="text-center py-3">Loading...</div>}

        {!isLoading && messages.length === 0 && (
          <div className="text-muted text-center py-3">
            まだメッセージがありません
          </div>
        )}

        <button
          type="button"
          className="btn btn-sm btn-link"
          onClick={() => setSize(size + 1)}
        >
          もっと読み込む
        </button>

        <ul className="list-unstyled">
          {messages.map((message, index) => {
            const isMine = message.sender._id === currentUser?._id;
            // show the sender's avatar/name only at the start of a run of
            // consecutive messages from the same person, not on every bubble
            const isFirstOfRun =
              index === 0 ||
              messages[index - 1].sender._id !== message.sender._id;

            return (
              <MessageItem
                key={message._id}
                message={message}
                isMine={isMine}
                isFirstOfRun={isFirstOfRun}
              />
            );
          })}
        </ul>
      </div>

      <div className="d-flex align-items-center mt-2 position-relative">
        {mention.isOpen && (
          <MentionAutocomplete
            candidates={mention.candidates}
            activeIndex={mention.activeIndex}
            onSelect={mention.selectCandidate}
            onHover={mention.setActiveIndex}
          />
        )}
        <input
          ref={inputRef}
          type="text"
          className="form-control"
          value={body}
          onChange={mention.onChange}
          onKeyDown={keyDownHandler}
          disabled={isSending}
        />
        <button
          type="button"
          className="btn btn-primary ms-2"
          onClick={submitHandler}
          disabled={isSending || body.trim() === ''}
        >
          送信
        </button>
      </div>
    </div>
  );
};
