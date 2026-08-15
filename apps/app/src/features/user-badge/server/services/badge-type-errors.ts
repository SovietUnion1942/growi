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
