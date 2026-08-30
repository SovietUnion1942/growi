/**
 * Operator-facing on/off switch for the Messages (DM / chat) feature.
 *
 * Set via the `MESSAGES_MODE` env var (or the `app:messagesMode` config key).
 * The four levels are cumulative:
 *
 *   off     - the feature is disabled entirely: no sidebar item, the panel
 *             renders nothing, and every `/_api/v3/messages*` route replies 404.
 *   global  - only the single site-wide broadcast conversation ("全体連絡").
 *             No 1-on-1 DMs, no group chats.
 *   direct  - broadcast + 1-on-1 DMs. No group chats.
 *   full    - broadcast + DMs + group chats (the historical behaviour).
 *
 * When the mode is lowered on a running instance, conversations whose type is
 * no longer permitted become fully inaccessible: they disappear from the
 * conversation list and every read/write route rejects them (see
 * `isConversationTypeAllowed`). The documents are left untouched, so raising
 * the mode again restores them.
 */
export const MESSAGES_MODES = ['off', 'global', 'direct', 'full'] as const;

export type MessagesMode = (typeof MESSAGES_MODES)[number];

/**
 * Conversation discriminator. Mirrors the `ConversationType` unions declared
 * next to the Mongoose schema (`~/server/models/Conversation`) and the client
 * store (`~/stores/messages`); kept as its own copy here so this module stays
 * importable from both the server and the browser bundle without dragging in
 * either of those.
 */
export type ConversationType = 'direct' | 'group' | 'broadcast';

/** Narrowing type guard for values coming from env / the config store. */
export const isMessagesMode = (value: unknown): value is MessagesMode =>
  typeof value === 'string' &&
  (MESSAGES_MODES as readonly string[]).includes(value);

/**
 * Coerce an untrusted value (raw env string, stale DB config, `undefined`)
 * into a valid {@link MessagesMode}. Anything unrecognised falls back to
 * `off` - the safe default for a feature that is opt-in per deployment.
 */
export const normalizeMessagesMode = (value: unknown): MessagesMode =>
  isMessagesMode(value) ? value : 'off';

const ALLOWED_TYPES_BY_MODE: Record<MessagesMode, readonly ConversationType[]> =
  {
    off: [],
    global: ['broadcast'],
    direct: ['broadcast', 'direct'],
    full: ['broadcast', 'direct', 'group'],
  };

/** The conversation types a given mode permits, as a fresh Set. */
export const allowedConversationTypes = (
  mode: MessagesMode,
): Set<ConversationType> => new Set(ALLOWED_TYPES_BY_MODE[mode]);

/** Whether a single conversation type is usable under the given mode. */
export const isConversationTypeAllowed = (
  mode: MessagesMode,
  type: ConversationType,
): boolean => ALLOWED_TYPES_BY_MODE[mode].includes(type);

/** Whether the Messages feature is reachable at all (any non-`off` mode). */
export const isMessagesFeatureEnabled = (mode: MessagesMode): boolean =>
  mode !== 'off';

/** Whether a user can start new 1-on-1 DMs under the given mode. */
export const canStartDirectConversation = (mode: MessagesMode): boolean =>
  isConversationTypeAllowed(mode, 'direct');

/** Whether a user can create new group conversations under the given mode. */
export const canCreateGroupConversation = (mode: MessagesMode): boolean =>
  isConversationTypeAllowed(mode, 'group');
