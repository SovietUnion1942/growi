import {
  applyMention,
  detectMentionQuery,
  splitMessageBodyIntoMentionSegments,
} from './mention-query';

describe('detectMentionQuery', () => {
  it('detects an "@" trigger at the start of the text', () => {
    expect(detectMentionQuery('@al')).toEqual({ query: 'al', triggerIndex: 0 });
  });

  it('detects an "@" trigger preceded by whitespace', () => {
    expect(detectMentionQuery('hello @al')).toEqual({
      query: 'al',
      triggerIndex: 6,
    });
  });

  it('returns an empty query for a bare "@" (not yet typed further)', () => {
    expect(detectMentionQuery('hi @')).toEqual({ query: '', triggerIndex: 3 });
  });

  it('does not trigger on an "@" embedded in a word (e.g. an email address)', () => {
    expect(detectMentionQuery('user@host')).toBeNull();
  });

  it('stops triggering once the mention is closed by a space', () => {
    expect(detectMentionQuery('@alice ')).toBeNull();
  });

  it('returns null when there is no "@" before the cursor', () => {
    expect(detectMentionQuery('hello world')).toBeNull();
  });
});

describe('applyMention', () => {
  it('replaces the in-progress "@query" with "@username " and reports the new cursor position', () => {
    const result = applyMention('hi @al', 3, 6, 'alice');
    expect(result.text).toBe('hi @alice ');
    expect(result.cursorPos).toBe(result.text.length);
  });

  it('preserves text after the cursor', () => {
    const result = applyMention('hi @al there', 3, 6, 'alice');
    expect(result.text).toBe('hi @alice  there');
  });
});

describe('splitMessageBodyIntoMentionSegments', () => {
  it('returns a single text segment for a body with no mentions', () => {
    expect(splitMessageBodyIntoMentionSegments('hello world')).toEqual([
      { type: 'text', value: 'hello world' },
    ]);
  });

  it('splits mentions out from surrounding text, in order', () => {
    expect(splitMessageBodyIntoMentionSegments('hi @alice and @bob!')).toEqual([
      { type: 'text', value: 'hi ' },
      { type: 'mention', value: '@alice' },
      { type: 'text', value: ' and ' },
      { type: 'mention', value: '@bob!' },
    ]);
  });

  it('treats a body that is only a mention as a single mention segment', () => {
    expect(splitMessageBodyIntoMentionSegments('@alice')).toEqual([
      { type: 'mention', value: '@alice' },
    ]);
  });
});
