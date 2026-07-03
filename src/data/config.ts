// Lookback window for the DEX transaction history query (Activity Story).
export const HISTORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

// Iterative-deepening market fan-out. Value ranking can be gamed by spam with
// fabricated prices, so lookups run in batches down the ranking until enough
// credible (real-liquidity) markets are found or the call budget is spent.
// Batch size doubles as the concurrency cap.
export const MARKET_BATCH_SIZE = 10;
export const MARKET_TARGET_CREDIBLE = 10;
export const MARKET_LOOKUP_BUDGET = 50;

// Paginated endpoints (approvals, dex-history): request the max page size and
// follow cursors up to a page cap. Default --limit is 20 and approvals are
// reverse-chronological — the stale ones live on the later pages.
export const PAGE_LIMIT = 100;
export const MAX_PAGES = 5;
