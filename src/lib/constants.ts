/**
 * Shared numeric defaults used by pairing and meet-setup logic.
 *
 * Keep these as plain constants (not config/state) so they can be reused in both
 * server and client code without import cycles.
 */
export const DAYS_PER_YEAR = 365;

/** Default maximum age difference used for automatic pairings (years). */
export const DEFAULT_MAX_AGE_GAP_YEARS = 1;

/** Default maximum age difference used for automatic pairings (days). */
export const DEFAULT_MAX_AGE_GAP_DAYS = DEFAULT_MAX_AGE_GAP_YEARS * DAYS_PER_YEAR;

/** Hard cap used by pairing logic to prevent runaway match counts. */
export const MAX_MATCHES_PER_WRESTLER = 5;
