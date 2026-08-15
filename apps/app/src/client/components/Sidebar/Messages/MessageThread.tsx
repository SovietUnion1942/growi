import { type JSX, useCallback, useEffect, useState } from 'react';
import { mutate as mutateGlobal } from 'swr';

import { SocketEventName } from '~/interfaces/websocket';
import { useCurrentUser } from '~/states/global';
import { useGlobalSocket } from '~/states/socket-io';
import {
  CONVERSATIONS_SWR_KEY,
  type IConversation,
  markConversationAsRead,
  sendMessage,
  useSWRxMessages,
} from '~/stores/messages';

type Props = {
  conversation: IConversation;
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
      await sendMessage(conversationId, trimmed);
      setBody('');
      await mutate();
    } finally {
      setIsSending(false);
    }
  }, [body, conversationId, isSending, mutate]);

  const keyDownHandler = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitHandler();
      }
    },
    [submitHandler],
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
              <li key={message._id} className="mb-2">
                {!isMine && isFirstOfRun && (
                  <div className="d-flex align-items-center mb-1">
                    <img
                      src={
                        message.sender.imageUrlCached ??
                        '/images/icons/user.svg'
                      }
                      alt={message.sender.name}
                      className="rounded-circle me-2"
                      width={20}
                      height={20}
                    />
                    <span className="small text-muted">
                      {message.sender.name ?? message.sender.username}
                    </span>
                  </div>
                )}
                <div
                  className={`d-flex ${isMine ? 'justify-content-end' : 'justify-content-start'}`}
                >
                  <div
                    className={
                      isMine
                        ? 'bg-primary text-white'
                        : 'bg-body-tertiary border'
                    }
                    style={{
                      maxWidth: '75%',
                      padding: '0.5rem 0.75rem',
                      wordBreak: 'break-word',
                      boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
                      borderRadius: isMine
                        ? '16px 16px 4px 16px'
                        : '16px 16px 16px 4px',
                    }}
                  >
                    {message.body}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="d-flex align-items-center mt-2">
        <input
          type="text"
          className="form-control"
          value={body}
          onChange={(e) => setBody(e.target.value)}
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
