// ref: https://elements.ai-sdk.dev/examples/chatbot

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useChat } from '@ai-sdk/react';
import { useAtomValue } from 'jotai';
import { CopyIcon, PaperclipIcon, RefreshCcwIcon, XIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { v7 as uuid } from 'uuid';

import {
  FloatingPanel,
  FloatingPanelControls,
} from '~/client/components/FloatingPanel';
import { scheduleToPut } from '~/client/services/user-ui-settings';
import { Action, Actions } from '~/components/ai-elements/actions';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '~/components/ai-elements/conversation';
import { Loader } from '~/components/ai-elements/loader';
import { Message, MessageContent } from '~/components/ai-elements/message';
import {
  PromptInput,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectGroup,
  PromptInputModelSelectItem,
  PromptInputModelSelectLabel,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTools,
  usePromptInputAttachments,
} from '~/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '~/components/ai-elements/reasoning';
import { Response } from '~/components/ai-elements/response';
import { Suggestion, Suggestions } from '~/components/ai-elements/suggestion';
import { Button } from '~/components/ui/button';
import {
  PageMentionInput,
  type PageMentionInputHandle,
} from '~/features/mastra/client/components/PageMentionInput';
import { getProviderLabel } from '~/features/mastra/interfaces/ai-provider';
import type { CustomUIMessage } from '~/features/mastra/interfaces/chat-message';
import {
  formatModelLabel,
  groupModelsByProvider,
} from '~/features/mastra/utils/model-display';
import { useSWRxWikiGapSuggestions } from '~/features/wiki-gap-suggestions/client/stores/wiki-gap-suggestions';
import { useCurrentUser } from '~/states/global/global';
import { useCurrentPagePath } from '~/states/page/hooks';
import { aiVisionEnabledAtom } from '~/states/server-configurations';

import {
  useChatSidebarActions,
  useChatSidebarStatus,
} from '../../status/chat-sidebar';
import { useSWRxMessages } from '../../stores/message';
import { useSWRxChatModels } from '../../stores/models';
import { useSWRINFxRecentThreads } from '../../stores/thread';
import { CreatePageProposal } from './CreatePageProposal';
import {
  createMastraChatTransport,
  resolveChatErrorDetail,
  resolveChatHeaderLabel,
} from './chat-sidebar-helpers';
import { buildChatSuggestions } from './chat-suggestions';
import { EditProposal } from './EditProposal';
import { IncompleteResponseNotice } from './IncompleteResponseNotice';
import { PageSources } from './PageSources';
import { extractPageSources } from './page-sources';

import styles from './ChatSidebar.module.scss';

const moduleClass = styles['grw-chat-sidebar'] ?? '';

// Default geometry for the floating chat window: docked near the top-right
// corner (roughly where the fixed right-hand sidebar used to sit) at a size
// comfortable for a conversation. See FloatingPanel for how this is clamped
// to the actual viewport on mount and on resize.
const FLOATING_CHAT_DEFAULT_SIZE = { width: 420, height: 640 };
const FLOATING_CHAT_MIN_SIZE = { width: 320, height: 360 };
const FLOATING_CHAT_DEFAULT_POSITION = {
  x:
    typeof window === 'undefined'
      ? 0
      : window.innerWidth - FLOATING_CHAT_DEFAULT_SIZE.width - 24,
  y: 72,
};

// Must be rendered as a descendant of <PromptInput> — usePromptInputAttachments
// reads the context PromptInput establishes internally for its children (no
// separate PromptInputProvider needed here, see prompt-input.tsx's "local
// attachments" mode).
const AttachImageButton = (): JSX.Element => {
  const { t } = useTranslation();
  const attachments = usePromptInputAttachments();
  return (
    <PromptInputButton
      onClick={attachments.openFileDialog}
      aria-label={t('ai_sidebar.attach_image')}
    >
      <PaperclipIcon size={16} />
    </PromptInputButton>
  );
};

export const ChatSidebar = (): JSX.Element => {
  const { t } = useTranslation();

  const [input, setInput] = useState('');

  const chatSidebarStatus = useChatSidebarStatus();
  const { close } = useChatSidebarActions();
  const isAiVisionEnabled = useAtomValue(aiVisionEnabledAtom);
  const threadId = chatSidebarStatus.threadId;
  const openSeq = chatSidebarStatus.openSeq;

  // Hand the caret to the prompt input every time the sidebar is opened, so the
  // user can type right away after clicking "New chat" or a recent thread.
  //
  // Keyed on `openSeq` (bumped by every openChat() call), not on mount alone:
  // re-opening the thread that is already displayed keeps the same remount key
  // in `dynamic.tsx`, so no remount happens and a mount-only focus would be
  // skipped.
  //
  // On the mount path this depends on `PageMentionInput` mounting synchronously
  // below us: React flushes child effects before the parent's, so its CodeMirror
  // view already exists when this runs. Should the input ever move behind
  // Suspense or a conditional render, the ref would still be null here and the
  // focus silently skipped (`focus()` no-ops rather than throwing) — keep it
  // eagerly rendered, or move the trigger down to the input itself.
  const promptInputRef = useRef<PageMentionInputHandle>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: openSeq is the trigger, not a value read by the effect
  useEffect(() => {
    promptInputRef.current?.focus();
  }, [openSeq]);

  // Generate a stable thread id for this chat session.
  // For an existing thread, reuse the given id; for a new chat, mint one
  // so every message in the same session targets the same thread on the
  // server (the server creates the thread on first use).
  const [chatThreadId] = useState<string>(() => threadId ?? uuid());

  const { data: savedMessages } = useSWRxMessages(threadId);
  const swrInfiniteThreads = useSWRINFxRecentThreads();
  const { data: threadPages, mutate: mutateRecentThreads } = swrInfiniteThreads;

  // Available models across every enabled provider + the server-validated
  // initial selection (Req 4.1/4.4/4.5). Each entry carries its owning provider
  // for grouped display, and an opaque cross-provider `key` (the modelKey).
  const { data: chatModels } = useSWRxChatModels();
  const models = chatModels?.models;

  // Live model selection, held as the opaque modelKey. Feature-local state only —
  // no dedicated atom, no SSR hydration (design: read via /mastra/models, write
  // via shared scheduleToPut). The server already rounds an out-of-allowlist /
  // absent saved key to the effective default, so `selectedModelKey` is trusted
  // as-is for the initial value.
  const [modelKey, setModelKey] = useState<string | undefined>(
    () => chatModels?.selectedModelKey,
  );

  // `selectedModelKey` may arrive after the first render (SWR resolves async).
  // Seed the local selection once it lands and the user has not picked yet.
  useEffect(() => {
    if (modelKey == null && chatModels?.selectedModelKey != null) {
      setModelKey(chatModels.selectedModelKey);
    }
  }, [modelKey, chatModels?.selectedModelKey]);

  const handleModelChange = (nextModelKey: string) => {
    setModelKey(nextModelKey);
    // Persist as the user's selection for next visit (debounced DB write, Req
    // 4.4 — unique down to the provider). The shared service owns the debounce +
    // PUT; we only schedule it.
    scheduleToPut({ aiChatSelectedModelKey: nextModelKey });
  };

  // Group the available models by owning provider in fixed slot order, keeping
  // allow-list order within each group and dropping providers that own no model
  // (Req 4.1/4.2). Shares the grouping rule with the admin selector.
  const providerGroups = useMemo(
    () => groupModelsByProvider(models ?? [], (entry) => entry.provider),
    [models],
  );

  // The currently-selected entry, used to render the closed trigger as
  // "provider · modelId" (Req 4.2).
  const selectedEntry = models?.find((entry) => entry.key === modelKey);

  const headerLabel = resolveChatHeaderLabel(
    chatThreadId,
    threadPages?.flatMap((page) => page.threads) ?? [],
    t('ai_sidebar.new_chat'),
  );

  // The transport reads the current modelKey through this ref at request time.
  // `useChat` captures the transport when its internal Chat is created and only
  // re-creates that Chat when the chat `id` changes (NOT when the transport
  // instance changes), so re-creating the transport on a model change would have
  // no effect. A ref lets the (stable) transport always see the live selection.
  const modelKeyRef = useRef(modelKey);
  modelKeyRef.current = modelKey;

  // Stable getter that reads the live selection from the ref on each request.
  const getModelKey = useCallback(() => modelKeyRef.current, []);

  // Stable for the session (chatThreadId is fixed). The factory attaches the
  // threadId and the live modelKey (via the getter) to EVERY request — incl.
  // regenerate(), which sends no per-call body (Critical Issue 1, Req 4.7).
  const transport = useMemo(
    () => createMastraChatTransport(chatThreadId, getModelKey),
    [chatThreadId, getModelKey],
  );

  const {
    messages,
    sendMessage,
    status,
    regenerate,
    setMessages,
    error,
    clearError,
  } = useChat<CustomUIMessage>({
    id: chatThreadId,
    transport,
    // Refresh the thread list after the assistant finishes streaming.
    //
    // The thread itself is persisted by the time the stream closes, but
    // Mastra's auto-generated title (configured via `generateTitle: true`
    // on the Memory) is written asynchronously and may land slightly later.
    //
    // This is an intentional design choice of Mastra. See:
    //   https://mastra.ai/docs/memory/storage
    //   > Title generation operates asynchronously after the agent
    //   > responds, ensuring it doesn't impact response times.
    //
    // Mastra exposes no event for "title persisted", so poll briefly until
    // the title for the current thread shows up in the list.
    onFinish: async () => {
      const targetId = chatThreadId;
      const maxAttempts = 5;
      const intervalMs = 1000;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // biome-ignore lint/performance/noAwaitInLoops: intentionally poll in series with a delay
        const pages = await mutateRecentThreads();
        const thread = pages
          ?.flatMap((p) => p.threads)
          .find((t) => t.id === targetId);
        if (thread?.title) return;
        await new Promise((resolve) => {
          setTimeout(resolve, intervalMs);
        });
      }
    },
  });

  useEffect(() => {
    if (savedMessages == null) return;
    setMessages(savedMessages);
  }, [savedMessages, setMessages]);

  const handleSubmit = (message: PromptInputMessage) => {
    // The input stays editable while the assistant responds so the user can
    // compose the next message, but starting a new request is suppressed until
    // the current one settles. This guards both the submit button and the
    // keymap's Enter→requestSubmit path against double-sending while busy (#5).
    if (status === 'submitted' || status === 'streaming') {
      return;
    }
    // Nothing to send for an empty (or whitespace-only) message with no
    // image attached — an image-only message is valid (e.g. "what's in
    // this picture?" is implicit).
    const text = message.text ?? '';
    const files = message.files ?? [];
    if (text.trim().length === 0 && files.length === 0) {
      return;
    }
    // The threadId rides on the transport body (see useChat above), so no
    // per-call body is needed here.
    sendMessage({ text, files });
    setInput('');
  };

  // Copilot-style suggestion chips shown above the empty chat — deterministic
  // and rule-based (no extra AI call) from context already available
  // client-side. See buildChatSuggestions's own doc comment for the sources.
  const currentPagePath = useCurrentPagePath();
  const currentUser = useCurrentUser();
  const { data: wikiGapSuggestions } = useSWRxWikiGapSuggestions();
  const chatSuggestions = useMemo(
    () =>
      buildChatSuggestions({
        currentPagePath,
        topWikiGapQuery: wikiGapSuggestions?.[0]?.query,
        hasBadges: (currentUser?.badgeSummaryCached?.length ?? 0) > 0,
      }),
    [currentPagePath, wikiGapSuggestions, currentUser?.badgeSummaryCached],
  );
  const handleSuggestionClick = (prompt: string) => {
    if (status === 'submitted' || status === 'streaming') {
      return;
    }
    sendMessage({ text: prompt });
  };

  return (
    <FloatingPanel
      className={`tw-root ${moduleClass}`}
      storageKey="grw-ai-chat-sidebar-geometry"
      title={headerLabel}
      defaultPosition={FLOATING_CHAT_DEFAULT_POSITION}
      defaultSize={FLOATING_CHAT_DEFAULT_SIZE}
      minSize={FLOATING_CHAT_MIN_SIZE}
      header={({
        isMaximized,
        toggleMaximize,
        isMinimized,
        toggleMinimize,
      }) => (
        <div className="tw:flex tw:items-center tw:gap-2 tw:px-3 tw:py-2 tw:border-b tw:border-border">
          <span className="growi-custom-icons fs-4">ai_chat</span>
          <span className="tw:flex-1 tw:font-semibold tw:truncate">
            {headerLabel}
          </span>
          <FloatingPanelControls
            isMinimized={isMinimized}
            toggleMinimize={toggleMinimize}
            isMaximized={isMaximized}
            toggleMaximize={toggleMaximize}
            onClose={close}
          />
        </div>
      )}
    >
      <div className="tw:mx-auto tw:flex tw:h-full tw:max-w-4xl tw:flex-col">
        <Conversation className="tw:h-full">
          <ConversationContent>
            {messages.length === 0 && (
              <Suggestions className="tw:px-1 tw:pb-2">
                {chatSuggestions.map((suggestion) => (
                  <Suggestion
                    key={suggestion.key}
                    suggestion={suggestion.prompt}
                    onClick={handleSuggestionClick}
                  >
                    {suggestion.label}
                  </Suggestion>
                ))}
              </Suggestions>
            )}
            {messages.map((message) => (
              <div key={message.id}>
                {message.role === 'assistant' && (
                  <PageSources sources={extractPageSources(message.parts)} />
                )}
                {message.parts.map((part, i) => {
                  switch (part.type) {
                    case 'text':
                      return (
                        <Fragment
                          // biome-ignore lint/suspicious/noArrayIndexKey: the text parts have no stable ID, but the index is sufficient for this static list
                          key={`${message.id}-${i}`}
                        >
                          <Message from={message.role}>
                            <MessageContent variant="flat">
                              <Response
                                className={
                                  message.role === 'assistant'
                                    ? 'tw-prose'
                                    : undefined
                                }
                                // Streamdown defaults to mode="streaming",
                                // which waits for further incremental
                                // updates before it ever flushes visible
                                // output. A part that isn't the tail of an
                                // in-flight stream (a completed message, a
                                // reloaded thread's history, a fast
                                // response that never produced more than
                                // one delta) never gets that follow-up
                                // update, so it rendered nothing at all.
                                // "static" renders whatever text is
                                // present immediately.
                                mode={
                                  status === 'streaming' &&
                                  i === message.parts.length - 1 &&
                                  message.id === messages.at(-1)?.id
                                    ? 'streaming'
                                    : 'static'
                                }
                              >
                                {part.text}
                              </Response>
                            </MessageContent>
                          </Message>
                          {message.role === 'assistant' &&
                            i === messages.length - 1 && (
                              <Actions className="tw:mt-2">
                                <Action
                                  onClick={() => regenerate()}
                                  label="Retry"
                                >
                                  <RefreshCcwIcon className="tw:size-3" />
                                </Action>
                                <Action
                                  onClick={() =>
                                    navigator.clipboard.writeText(part.text)
                                  }
                                  label="Copy"
                                >
                                  <CopyIcon className="tw:size-3" />
                                </Action>
                              </Actions>
                            )}
                        </Fragment>
                      );
                    case 'reasoning':
                      return (
                        <Reasoning
                          // biome-ignore lint/suspicious/noArrayIndexKey: the reasoning parts have no stable ID, but the index is sufficient for this static list
                          key={`${message.id}-${i}`}
                          className="w-full"
                          isStreaming={
                            status === 'streaming' &&
                            i === message.parts.length - 1 &&
                            message.id === messages.at(-1)?.id
                          }
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    case 'tool-proposePageEditTool':
                      if (
                        part.state !== 'output-available' ||
                        part.output.result !== 'ok'
                      ) {
                        return null;
                      }
                      return (
                        <EditProposal
                          key={part.toolCallId}
                          toolCallId={part.toolCallId}
                          page={part.output.page}
                        />
                      );
                    case 'tool-proposePageCreateTool':
                      if (
                        part.state !== 'output-available' ||
                        part.output.result !== 'ok'
                      ) {
                        return null;
                      }
                      return (
                        <CreatePageProposal
                          key={part.toolCallId}
                          toolCallId={part.toolCallId}
                          page={part.output.page}
                        />
                      );
                    case 'file':
                      // Renders an attached image inline in the message
                      // history — without this case the part silently fell
                      // through to `default` and neither the user's own
                      // sent image nor an assistant-returned file ever
                      // appeared (only its accompanying text part did).
                      return part.mediaType?.startsWith('image/') ? (
                        <Message
                          // biome-ignore lint/suspicious/noArrayIndexKey: file parts have no stable ID, but the index is sufficient for this static list
                          key={`${message.id}-${i}`}
                          from={message.role}
                        >
                          <MessageContent variant="flat">
                            {/* A base64 data: URI of unknown dimensions (a
                                user-attached or model-returned file, not a
                                static asset) -- next/image's required
                                width/height can't be known ahead of time,
                                and its optimization pipeline doesn't apply
                                to a data URI anyway. */}
                            {/* biome-ignore lint/performance/noImgElement: see comment above */}
                            <img
                              src={part.url}
                              alt={part.filename ?? 'attachment'}
                              className="tw:max-w-full tw:rounded-md"
                            />
                          </MessageContent>
                        </Message>
                      ) : null;
                    default:
                      return null;
                  }
                })}
                {message.role === 'assistant' && (
                  <IncompleteResponseNotice
                    finishReason={message.metadata?.finishReason}
                  />
                )}
              </div>
            ))}
            {(() => {
              // Keep the spinner up until *some* part of the assistant
              // reply (reasoning trigger or text body) is mounted.
              // `status === 'submitted'` covers the wait before the stream
              // opens; `status === 'streaming'` with an empty assistant
              // message covers the gap between stream open and the first
              // chunk (notable for reasoning models that pause to think
              // before emitting anything).
              if (status !== 'submitted' && status !== 'streaming') {
                return null;
              }
              const last = messages.at(-1);
              const awaitingFirstPart =
                last?.role !== 'assistant' || (last.parts?.length ?? 0) === 0;
              return awaitingFirstPart ? <Loader /> : null;
            })()}
            {error != null && (
              <div
                role="alert"
                className="tw:my-2 tw:flex tw:flex-col tw:gap-2 tw:rounded-lg tw:border tw:border-destructive/40 tw:bg-destructive/10 tw:p-3 tw:text-sm"
              >
                <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
                  <p className="tw:font-medium tw:text-destructive">
                    {t('ai_sidebar.error.title')}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="tw:-my-1"
                    aria-label={t('ai_sidebar.error.dismiss')}
                    onClick={() => clearError()}
                  >
                    <XIcon className="tw:size-3.5" />
                  </Button>
                </div>
                {(() => {
                  const detail = resolveChatErrorDetail(error);
                  return detail == null ? null : (
                    <p className="tw:break-words tw:text-muted-foreground">
                      {detail}
                    </p>
                  );
                })()}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="tw:self-end"
                  onClick={() => regenerate()}
                >
                  <RefreshCcwIcon className="tw:mr-1 tw:size-3" />
                  {t('ai_sidebar.error.retry')}
                </Button>
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="tw:shrink-0 tw:px-6 tw:pt-4">
          <PromptInput
            onSubmit={handleSubmit}
            inputGroupClassName="tw:rounded-xl"
            accept="image/*"
            multiple
          >
            <PromptInputAttachments>
              {(attachment) => <PromptInputAttachment data={attachment} />}
            </PromptInputAttachments>
            <PromptInputBody>
              <PageMentionInput
                ref={promptInputRef}
                value={input}
                onChange={setInput}
                placeholder={t('pageMention.placeholder')}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                {isAiVisionEnabled && <AttachImageButton />}
              </PromptInputTools>
              <PromptInputModelSelect
                value={modelKey ?? ''}
                onValueChange={handleModelChange}
                disabled={models == null}
              >
                <PromptInputModelSelectTrigger>
                  {/*
                      The grouped items render only the display name, so the
                      default <SelectValue/> would show a bare name — ambiguous
                      when two providers expose a same-named model. Render the
                      selected entry as "Provider · name" instead; fall back to
                      the empty placeholder value before a selection resolves
                      (Req 4.2).
                    */}
                  {selectedEntry != null ? (
                    formatModelLabel(
                      selectedEntry.provider,
                      selectedEntry.displayName,
                    )
                  ) : (
                    <PromptInputModelSelectValue />
                  )}
                </PromptInputModelSelectTrigger>
                {/*
                    The Radix Select dropdown is portaled to document.body — a
                    sibling of this position-fixed sidebar in the root stacking
                    context. The vendored content defaults to `tw:z-50`, which
                    sits below the chat sidebar (`.grw-chat-sidebar` =
                    `$zindex-fixed + 2` = 1032), so the menu opens behind the
                    opaque panel and looks empty. Lift it to Bootstrap's popover
                    tier (`$zindex-popover` = 1070) so it paints above the
                    sidebar. (prefix-aware tailwind-merge makes this override the
                    baked-in `tw:z-50`.)

                    `tw:border-border`: the vendored SelectContent uses a bare
                    `tw:border` (width only, no color), so its border falls back to
                    `currentColor` (the dark popover text color) and looks too
                    heavy. Pin it to the theme border token (`--border` =
                    `--bs-border-color`, the light gray used elsewhere in GROWI).
                  */}
                <PromptInputModelSelectContent className="tw:z-[1070] tw:border-border">
                  {providerGroups.map((group) => (
                    <PromptInputModelSelectGroup key={group.provider}>
                      <PromptInputModelSelectLabel>
                        {getProviderLabel(group.provider)}
                      </PromptInputModelSelectLabel>
                      {group.entries.map((entry) => (
                        <PromptInputModelSelectItem
                          key={entry.key}
                          value={entry.key}
                        >
                          {entry.displayName}
                        </PromptInputModelSelectItem>
                      ))}
                    </PromptInputModelSelectGroup>
                  ))}
                </PromptInputModelSelectContent>
              </PromptInputModelSelect>
              <PromptInputSubmit disabled={!input && !status} status={status} />
            </PromptInputFooter>
          </PromptInput>
          {/* Persistent accuracy disclaimer, placed under the input like
                other AI chat products so it reads as a notice covering the
                whole conversation and never scrolls out of view.
                Spaced with PADDING, not margin: tailwind.css pins `.tw-root p`
                margins to 0 with an UNLAYERED rule that outranks the
                @layer-ed tw: margin utilities, so tw:mt-* can never win on a
                <p> here — tw:pt-* is untouched by that rule. */}
          <p className="tw:pt-2 tw:text-center tw:text-xs tw:text-muted-foreground/60">
            {t('ai_sidebar.accuracy_notice')}
          </p>
        </div>
      </div>
    </FloatingPanel>
  );
};
