import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UserStatus } from '../models/user/conts';

const { getEffectiveRegistrationWhitelist } = vi.hoisted(() => ({
  getEffectiveRegistrationWhitelist: vi.fn<() => string[]>(),
}));

vi.mock('./registration-whitelist', () => ({
  getEffectiveRegistrationWhitelist,
}));
// external-account.ts pulls prisma in transitively; stub it so importing the
// module under test doesn't spin up a real client.
vi.mock('~/utils/prisma', () => ({ prisma: {} }));

import { determineStatusForNewExternalUser } from './external-account';

describe('determineStatusForNewExternalUser', () => {
  beforeEach(() => {
    getEffectiveRegistrationWhitelist.mockReset();
    getEffectiveRegistrationWhitelist.mockReturnValue([]);
  });

  describe('google', () => {
    it('is STATUS_REGISTERED when the whitelist is empty', () => {
      expect(determineStatusForNewExternalUser('google', 'a@growi.org')).toBe(
        UserStatus.STATUS_REGISTERED,
      );
    });

    it('is STATUS_ACTIVE when the address matches the whitelist', () => {
      getEffectiveRegistrationWhitelist.mockReturnValue(['@growi.org']);
      expect(determineStatusForNewExternalUser('google', 'a@growi.org')).toBe(
        UserStatus.STATUS_ACTIVE,
      );
    });

    it('is STATUS_REGISTERED when the address does not match', () => {
      getEffectiveRegistrationWhitelist.mockReturnValue(['@growi.org']);
      expect(determineStatusForNewExternalUser('google', 'a@other.com')).toBe(
        UserStatus.STATUS_REGISTERED,
      );
    });

    it('is STATUS_REGISTERED when the provider gives no email', () => {
      getEffectiveRegistrationWhitelist.mockReturnValue(['@growi.org']);
      expect(determineStatusForNewExternalUser('google', undefined)).toBe(
        UserStatus.STATUS_REGISTERED,
      );
    });
  });

  it('keeps github always STATUS_REGISTERED, whitelist or not', () => {
    getEffectiveRegistrationWhitelist.mockReturnValue(['@growi.org']);
    expect(determineStatusForNewExternalUser('github', 'a@growi.org')).toBe(
      UserStatus.STATUS_REGISTERED,
    );
  });

  it('leaves other providers (ldap) at STATUS_ACTIVE', () => {
    expect(determineStatusForNewExternalUser('ldap', 'a@growi.org')).toBe(
      UserStatus.STATUS_ACTIVE,
    );
  });
});
