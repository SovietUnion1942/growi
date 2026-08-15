import { ExtensibleCustomError } from '~/server/util/extensible-custom-error';

/**
 * Thrown by BadgeTypeService when `category`/`levels` are inconsistent
 * (e.g. an automatic BadgeType with no levels, a manual BadgeType with
 * levels, or an attempt to change `category` on update). Thrown before any
 * write is attempted, so callers get a clean, typed 400-shaped error
 * instead of relying solely on the Mongoose `ValidationError` that the
 * model's `pre('validate')` hook would otherwise raise.
 */
export class BadgeTypeValidationError extends ExtensibleCustomError {}

/** Thrown when a BadgeType id does not resolve to an existing, non-deleted document. */
export class BadgeTypeNotFoundError extends ExtensibleCustomError {}

/**
 * Thrown by BadgeGrantService.grantManualBadge when the target BadgeType's
 * `category` is `'automatic'` (requirement 3.4): automatic BadgeTypes may
 * only ever be granted by threshold evaluation, never by direct admin
 * action.
 */
export class BadgeGrantManualCategoryMismatchError extends ExtensibleCustomError {}

/**
 * Thrown by BadgeGrantService.grantManualBadge when the caller attempts to
 * manually grant the same manual BadgeType to the same user a second time.
 * Surfaced as a clear, typed error rather than letting the raw Mongoose
 * duplicate-key (E11000) error propagate, since a manual grant is a direct
 * admin action and the admin should get informative feedback rather than a
 * raw DB error (contrast with the automatic path, which silently swallows
 * duplicates because it is re-evaluated repeatedly and idempotency there is
 * an implementation detail, not a user-facing outcome).
 */
export class BadgeAlreadyGrantedError extends ExtensibleCustomError {}
