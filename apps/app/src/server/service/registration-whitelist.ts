import {
  normalizeWhitelistEntries,
  parseWhitelistEnvValue,
} from '~/utils/email-whitelist';

import { configManager } from './config-manager';

/**
 * The effective registration whitelist: the admin-managed
 * `security:registrationWhitelist` array merged with the operator-supplied
 * `security:additionalRegistrationWhitelist` string (env `REGISTRATION_WHITELIST`,
 * comma/newline separated), then run through {@link normalizeWhitelistEntries}
 * so legacy bare-domain entries expand and duplicates collapse.
 *
 * An empty result means "no restriction" for registration validation
 * (`User.isEmailValid`) and "no OAuth auto-activation" for
 * `determineStatusForNewUser`.
 */
export const getEffectiveRegistrationWhitelist = (): string[] => {
  const fromDb = configManager.getConfig('security:registrationWhitelist');
  const fromEnv = parseWhitelistEnvValue(
    configManager.getConfig('security:additionalRegistrationWhitelist'),
  );

  return normalizeWhitelistEntries([
    ...(Array.isArray(fromDb) ? fromDb : []),
    ...fromEnv,
  ]);
};
