export type MentionQuery = {
  query: string;
  triggerIndex: number;
};

// Detects an in-progress "@query" mention immediately before the cursor. The
// trigger must start at the beginning of the text or be preceded by
// whitespace, and the query itself must not contain whitespace or another
// "@" -- this keeps email-like "user@host" text from opening the dropdown.
export const detectMentionQuery = (
  textBeforeCursor: string,
): MentionQuery | null => {
  const match = textBeforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
  if (match == null) {
    return null;
  }
  const query = match[1];
  return { query, triggerIndex: textBeforeCursor.length - query.length - 1 };
};

export type MentionInsertion = {
  text: string;
  cursorPos: number;
};

// Replaces the in-progress "@query" (from triggerIndex through cursorPos)
// with the selected user's "@username " mention, and reports where the
// cursor should land afterwards.
export const applyMention = (
  text: string,
  triggerIndex: number,
  cursorPos: number,
  username: string,
): MentionInsertion => {
  const before = text.slice(0, triggerIndex);
  const after = text.slice(cursorPos);
  const inserted = `@${username} `;
  return {
    text: `${before}${inserted}${after}`,
    cursorPos: (before + inserted).length,
  };
};

export type MentionSegment =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string };

// Splits a message body into plain-text and "@mention" segments for
// highlighting. This is a text-pattern match, not id-backed: any "@token" is
// treated as a mention span, which is sufficient since mentions are always
// inserted as literal "@username " text by applyMention above.
export const splitMessageBodyIntoMentionSegments = (
  body: string,
): MentionSegment[] => {
  const segments: MentionSegment[] = [];
  const regex = /@[^\s@]+/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(body);
  while (match != null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        value: body.slice(lastIndex, match.index),
      });
    }
    segments.push({ type: 'mention', value: match[0] });
    lastIndex = match.index + match[0].length;
    match = regex.exec(body);
  }
  if (lastIndex < body.length) {
    segments.push({ type: 'text', value: body.slice(lastIndex) });
  }
  return segments;
};
