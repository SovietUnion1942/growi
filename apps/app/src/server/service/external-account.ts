import { ErrorV3 } from '@growi/core/dist/models';

import { LoginErrorCode } from '~/interfaces/errors/login-error';
import type { IExternalAuthProviderType } from '~/interfaces/external-auth-provider';
import { isEmailInWhitelist } from '~/utils/email-whitelist';
import loggerFactory from '~/utils/logger';
import { prisma } from '~/utils/prisma';

import { NullUsernameToBeRegisteredError } from '../models/errors';
import { UserStatus } from '../models/user/conts';
import type PassportService from './passport';
import { getEffectiveRegistrationWhitelist } from './registration-whitelist';

const logger = loggerFactory('growi:service:external-account-service');

class ExternalAccountService {
  passportService: PassportService;

  constructor(passportService: PassportService) {
    this.passportService = passportService;
  }

  async getOrCreateUser(
    userInfo: { id: string; username: string; name?: string; email?: string },
    providerId: IExternalAuthProviderType,
  ) {
    // get option
    const isSameUsernameTreatedAsIdenticalUser =
      this.passportService.isSameUsernameTreatedAsIdenticalUser(providerId);
    const isSameEmailTreatedAsIdenticalUser =
      providerId === 'ldap'
        ? false
        : this.passportService.isSameEmailTreatedAsIdenticalUser(providerId);

    try {
      // find or register(create) user
      const statusToBeRegistered = this.determineStatusForNewUser(
        providerId,
        userInfo.email,
      );
      const externalAccount = await prisma.externalaccounts.findOrRegister(
        isSameUsernameTreatedAsIdenticalUser,
        isSameEmailTreatedAsIdenticalUser,
        providerId,
        userInfo.id,
        userInfo.username,
        userInfo.name,
        userInfo.email,
        statusToBeRegistered,
      );
      return externalAccount;
    } catch (err) {
      if (err instanceof NullUsernameToBeRegisteredError) {
        logger.error(err.message);
        throw new ErrorV3(err.message);
      } else if (err.name === 'DuplicatedUsernameException') {
        if (
          isSameEmailTreatedAsIdenticalUser ||
          isSameUsernameTreatedAsIdenticalUser
        ) {
          // associate to existing user
          logger.debug(
            `ExternalAccount '${userInfo.username}' will be created and bound to the exisiting User account`,
          );
          return prisma.externalaccounts.associate(
            providerId,
            userInfo.id,
            err.user,
          );
        }
        logger.error({ providerId }, 'provider-DuplicatedUsernameException');

        throw new ErrorV3(
          'message.provider_duplicated_username_exception',
          LoginErrorCode.PROVIDER_DUPLICATED_USERNAME_EXCEPTION,
          undefined,
          { failedProviderForDuplicatedUsernameException: providerId },
        );
      } else if (err.name === 'UserUpperLimitException') {
        logger.error(err.message);
        throw new ErrorV3(err.message);
      }
    }
  }

  private determineStatusForNewUser(
    providerId: IExternalAuthProviderType,
    email?: string,
  ): number {
    return determineStatusForNewExternalUser(providerId, email);
  }
}

/**
 * Initial account status for a user created via an external auth provider.
 *
 * - google: STATUS_ACTIVE iff the address matches the effective registration
 *   whitelist (admin list + REGISTRATION_WHITELIST env); otherwise
 *   STATUS_REGISTERED. An empty whitelist auto-approves nobody.
 * - github: always STATUS_REGISTERED (approval pending).
 * - anything else (e.g. ldap, saml, oidc): STATUS_ACTIVE, unchanged.
 */
export const determineStatusForNewExternalUser = (
  providerId: IExternalAuthProviderType,
  email?: string,
): number => {
  if (providerId === 'google') {
    return isEmailInWhitelist(email, getEffectiveRegistrationWhitelist())
      ? UserStatus.STATUS_ACTIVE
      : UserStatus.STATUS_REGISTERED;
  }
  if (providerId === 'github') {
    return UserStatus.STATUS_REGISTERED;
  }
  return UserStatus.STATUS_ACTIVE;
};

export let externalAccountService: ExternalAccountService | undefined; // singleton instance
export default function instanciate(passportService: PassportService): void {
  externalAccountService = new ExternalAccountService(passportService);
}
