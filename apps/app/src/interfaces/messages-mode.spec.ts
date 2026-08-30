import {
  allowedConversationTypes,
  canCreateGroupConversation,
  canStartDirectConversation,
  isConversationTypeAllowed,
  isMessagesFeatureEnabled,
  isMessagesMode,
  MESSAGES_MODES,
  normalizeMessagesMode,
} from './messages-mode';

describe('messages-mode', () => {
  describe('isMessagesMode', () => {
    it.each(MESSAGES_MODES)('accepts the valid mode "%s"', (mode) => {
      expect(isMessagesMode(mode)).toBe(true);
    });

    it.each([
      undefined,
      null,
      '',
      'Full',
      'dm',
      42,
      {},
    ])('rejects the invalid value %p', (value) => {
      expect(isMessagesMode(value)).toBe(false);
    });
  });

  describe('normalizeMessagesMode', () => {
    it('passes a valid mode through', () => {
      expect(normalizeMessagesMode('direct')).toBe('direct');
    });

    it.each([
      undefined,
      null,
      '',
      'nope',
      'FULL',
    ])('falls back to "off" for %p', (value) => {
      expect(normalizeMessagesMode(value)).toBe('off');
    });
  });

  describe('allowedConversationTypes', () => {
    it('permits nothing when off', () => {
      expect([...allowedConversationTypes('off')]).toEqual([]);
    });

    it('permits only broadcast when global', () => {
      expect([...allowedConversationTypes('global')].sort()).toEqual([
        'broadcast',
      ]);
    });

    it('permits broadcast + direct when direct', () => {
      expect([...allowedConversationTypes('direct')].sort()).toEqual([
        'broadcast',
        'direct',
      ]);
    });

    it('permits every type when full', () => {
      expect([...allowedConversationTypes('full')].sort()).toEqual([
        'broadcast',
        'direct',
        'group',
      ]);
    });

    it('returns a fresh Set each call (no shared mutable state)', () => {
      const a = allowedConversationTypes('full');
      a.delete('group');
      expect(allowedConversationTypes('full').has('group')).toBe(true);
    });
  });

  describe('isConversationTypeAllowed', () => {
    it('blocks a group conversation in direct mode', () => {
      expect(isConversationTypeAllowed('direct', 'group')).toBe(false);
    });

    it('blocks a direct conversation in global mode', () => {
      expect(isConversationTypeAllowed('global', 'direct')).toBe(false);
    });

    it('always allows broadcast except when off', () => {
      expect(isConversationTypeAllowed('global', 'broadcast')).toBe(true);
      expect(isConversationTypeAllowed('off', 'broadcast')).toBe(false);
    });
  });

  describe('capability helpers', () => {
    it('isMessagesFeatureEnabled is false only for off', () => {
      expect(isMessagesFeatureEnabled('off')).toBe(false);
      expect(isMessagesFeatureEnabled('global')).toBe(true);
      expect(isMessagesFeatureEnabled('direct')).toBe(true);
      expect(isMessagesFeatureEnabled('full')).toBe(true);
    });

    it('canStartDirectConversation needs direct or full', () => {
      expect(canStartDirectConversation('global')).toBe(false);
      expect(canStartDirectConversation('direct')).toBe(true);
      expect(canStartDirectConversation('full')).toBe(true);
    });

    it('canCreateGroupConversation needs full', () => {
      expect(canCreateGroupConversation('direct')).toBe(false);
      expect(canCreateGroupConversation('full')).toBe(true);
    });
  });
});
