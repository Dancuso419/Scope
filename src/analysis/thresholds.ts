// Tunable analysis thresholds. Defaults from TRD §4; flagged as open questions
// in the PRD, so kept here as named constants for easy tuning.

export const CONCENTRATION_THRESHOLD = 0.7; // flag if one token >= 70% of portfolio USD value
export const DUST_MAX_USD = 2; // flag holdings worth less than $2
export const DUST_LIST_CAP = 20; // spam-heavy wallets have hundreds of sub-$2 airdrops; keep the highest-value ones
export const STALE_APPROVAL_AGE_DAYS = 180; // "granted long ago" = 6 months
// Dead/illiquid tokens. Onchain OS exposes token liquidity + 24H volume (no
// longer lookback), so "dead" is defined on those rather than a 90-day window.
export const DEAD_TOKEN_MIN_LIQUIDITY_USD = 10_000; // below this = illiquid
export const DEAD_TOKEN_MIN_VOLUME_24H_USD = 100; // below this = no meaningful recent trading
export const ACTIVITY_MIN_USD = 1; // ignore sub-$1 events when building the activity timeline
