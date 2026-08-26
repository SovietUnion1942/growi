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
  deleteMessage,
  type IConversation,
  type IMessage,
  markConversationAsRead,
  sendMessage,
  toggleMessageReaction,
  useSWRxMessages,
} from '~/stores/messages';

import { MentionAutocomplete } from './MentionAutocomplete';
import { MessageImage } from './MessageImage';
import { splitMessageBodyIntoMentionSegments } from './mention-query';
import { ReactionBar } from './ReactionBar';
import { useImageAttachment } from './useImageAttachment';
import { useMentionComposer } from './useMentionComposer';

type Props = {
  conversation: IConversation;
};

type MessageItemProps = {
  message: IMessage;
  isMine: boolean;
  isFirstOfRun: boolean;
  currentUserId: string | undefined;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onDelete: (messageId: string) => void;
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
  currentUserId,
  onToggleReaction,
  onDelete,
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
        className={`d-flex align-items-center gap-1 ${isMine ? 'justify-content-end' : 'justify-content-start'}`}
      >
        {message.deletedAt != null ? (
          <div
            className="fst-italic text-muted border"
            style={{
              maxWidth: '75%',
              padding: '0.5rem 0.75rem',
              borderRadius: isMine
                ? '16px 16px 4px 16px'
                : '16px 16px 16px 4px',
            }}
          >
            このメッセージは削除されました
          </div>
        ) : (
          <div
            className={
              isMine ? 'bg-primary text-white' : 'bg-body-tertiary border'
            }
            style={{
              maxWidth: '75%',
              // an image-only message (no body text) skips the text padding
              // so the bubble hugs the image instead of framing it awkwardly
              padding: message.body === '' ? '0.25rem' : '0.5rem 0.75rem',
              wordBreak: 'break-word',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
              borderRadius: isMine
                ? '16px 16px 4px 16px'
                : '16px 16px 16px 4px',
            }}
          >
            {message.attachment != null && (
              <MessageImage attachmentId={message.attachment} />
            )}
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
        )}
        {isMine && message.deletedAt == null && (
          <button
            type="button"
            className="btn btn-sm btn-link text-muted p-0"
            aria-label="メッセージを削除"
            onClick={() => onDelete(message._id)}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16 }}
            >
              delete
            </span>
          </button>
        )}
      </div>
      {message.deletedAt == null && (
        <ReactionBar
          reactions={message.reactions}
          currentUserId={currentUserId}
          isMine={isMine}
          onToggle={(emoji) => onToggleReaction(message._id, emoji)}
        />
      )}
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const image = useImageAttachment();

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

  useEffect(() => {
    if (socket == null) {
      return;
    }

    const onReactionUpdated = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        mutate();
      }
    };

    socket.on(SocketEventName.MessageReactionUpdated, onReactionUpdated);
    return () => {
      socket.off(SocketEventName.MessageReactionUpdated, onReactionUpdated);
    };
  }, [conversationId, mutate, socket]);

  useEffect(() => {
    if (socket == null) {
      return;
    }

    const onMessageDeleted = (payload: { conversationId: string }) => {
      if (payload.conversationId === conversationId) {
        mutate();
      }
    };

    socket.on(SocketEventName.MessageDeleted, onMessageDeleted);
    return () => {
      socket.off(SocketEventName.MessageDeleted, onMessageDeleted);
    };
  }, [conversationId, mutate, socket]);

  // each page is newest-first; earlier pages hold newer messages, so
  // reversing the concatenated pages yields oldest-to-newest for display
  const messages = (data ?? [])
    .flatMap((page) => page.docs)
    .slice()
    .reverse();

  const submitHandler = useCallback(async () => {
    const trimmed = body.trim();
    if ((trimmed === '' && image.file == null) || isSending) {
      return;
    }

    setIsSending(true);
    try {
      const mentionedUserIds = mention.resolveMentionedUserIds(trimmed);
      await sendMessage(
        conversationId,
        trimmed,
        mentionedUserIds,
        image.file ?? undefined,
      );
      setBody('');
      mention.reset();
      image.clear();
      await mutate();
    } finally {
      setIsSending(false);
    }
  }, [body, conversationId, image, isSending, mention, mutate]);

  const fileChangeHandler = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files?.[0];
      if (selected != null) {
        image.select(selected);
      }
      // reset so picking the same file again still fires onChange
      e.target.value = '';
    },
    [image],
  );

  const toggleReactionHandler = useCallback(
    (messageId: string, emoji: string) => {
      toggleMessageReaction(conversationId, messageId, emoji).then(() =>
        mutate(),
      );
    },
    [conversationId, mutate],
  );

  const deleteHandler = useCallback(
    (messageId: string) => {
      // biome-ignore lint/suspicious/noAlert: lightweight irreversible-action confirm, no custom modal needed
      if (!window.confirm('このメッセージを削除しますか？')) {
        return;
      }
      deleteMessage(conversationId, messageId).then(() => mutate());
    },
    [conversationId, mutate],
  );

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
    <div className="d-flex flex-column h-100 p-3">
      <div className="flex-grow-1 overflow-auto">
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
                currentUserId={currentUser?._id}
                onToggleReaction={toggleReactionHandler}
                onDelete={deleteHandler}
              />
            );
          })}
        </ul>
      </div>

      {image.previewUrl != null && (
        <div className="mt-2 position-relative d-inline-block">
          <img
            src={image.previewUrl}
            alt="送信予定の画像"
            style={{
              maxHeight: '96px',
              maxWidth: '96px',
              borderRadius: '8px',
              objectFit: 'cover',
            }}
          />
          <button
            type="button"
            className="btn btn-sm btn-dark rounded-circle position-absolute p-0 d-flex align-items-center justify-content-center"
            aria-label="画像を取り消す"
            onClick={image.clear}
            disabled={isSending}
            style={{
              top: '-6px',
              right: '-6px',
              width: '20px',
              height: '20px',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 14 }}
            >
              close
            </span>
          </button>
        </div>
      )}

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
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="d-none"
          onChange={fileChangeHandler}
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          aria-label="画像を添付"
          onClick={() => fileInputRef.current?.click()}
          disabled={isSending}
        >
          <span className="material-symbols-outlined align-middle">image</span>
        </button>
        <input
          ref={inputRef}
          type="text"
          className="form-control ms-2"
          value={body}
          onChange={mention.onChange}
          onKeyDown={keyDownHandler}
          disabled={isSending}
        />
        <button
          type="button"
          className="btn btn-primary ms-2"
          onClick={submitHandler}
          disabled={isSending || (body.trim() === '' && image.file == null)}
        >
          送信
        </button>
      </div>
    </div>
  );
};
