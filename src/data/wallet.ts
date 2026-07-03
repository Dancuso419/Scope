import type { TokenBalance, TokenMarket } from '../analysis/types.ts';
import { isCredibleMarket, type AssembleInput } from '../analysis/assemble.ts';
import { parseBalances, parseApprovals, parseDexHistory, parseMarket, ok } from './parse.ts';
import { parseNum } from '../analysis/num.ts';
import {
  HISTORY_WINDOW_MS,
  MARKET_BATCH_SIZE,
  MARKET_TARGET_CREDIBLE,
  MARKET_LOOKUP_BUDGET,
  PAGE_LIMIT,
  MAX_PAGES,
} from './config.ts';

// Top-level fetches whose failure the endpoint must know about. Markets are
// deliberately absent: per-token price-info failures are tolerated by design
// (iterative deepening just keeps digging).
export type FailedSlice = 'balances' | 'approvals' | 'dexHistory';

// The data layer's output is the analysis layer's input, plus which slices
// failed — degradation must be reported, not swallowed, so the endpoint can
// distinguish "empty wallet" from "couldn't read the wallet".
export type WalletData = AssembleInput & { failed: FailedSlice[] };

// Runs one onchainos subcommand and returns its parsed JSON. Injected so the
// orchestrator is testable without spawning the CLI or hitting the network.
export type RunFn = (args: string[]) => Promise<unknown>;

// Any single fetch failing degrades to an empty slice of the wallet view — a
// health check without approvals is still a health check, not a 500.
async function tryRun(run: RunFn, args: string[]): Promise<unknown> {
  try {
    return await run(args);
  } catch {
    return { ok: false };
  }
}

// Follow an endpoint's cursor up to MAX_PAGES. Stops when a page yields no
// cursor. Cursor extraction differs per endpoint, so it's passed in.
async function fetchPages(
  run: RunFn,
  baseArgs: string[],
  getCursor: (json: unknown) => string | null,
): Promise<unknown[]> {
  const pages: unknown[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const args = cursor ? [...baseArgs, '--cursor', cursor] : baseArgs;
    const json = await tryRun(run, args);
    pages.push(json);
    cursor = getCursor(json);
    if (!cursor) break;
  }
  return pages;
}

function approvalsCursor(json: unknown): string | null {
  const data = (json as { data?: unknown })?.data;
  const first = Array.isArray(data) ? (data[0] as { cursor?: unknown } | undefined) : undefined;
  return first?.cursor ? String(first.cursor) : null;
}

function historyCursor(json: unknown): string | null {
  const data = (json as { data?: { cursor?: unknown } })?.data;
  return data?.cursor ? String(data.cursor) : null;
}

function usdValue(t: TokenBalance): number {
  return (parseNum(t.balance) ?? 0) * (parseNum(t.tokenPrice) ?? 0);
}

// Iterative-deepening market fan-out: walk the value ranking in batches (value
// ranking alone is gameable — spam's fabricated prices put it at the top), and
// stop once enough credible markets are found or the call budget is spent.
async function fetchMarkets(run: RunFn, chain: string, balances: TokenBalance[]): Promise<TokenMarket[]> {
  const ranked = [...balances].sort((a, b) => usdValue(b) - usdValue(a));
  const markets: TokenMarket[] = [];
  let credible = 0;
  let spent = 0;

  for (let i = 0; i < ranked.length && spent < MARKET_LOOKUP_BUDGET && credible < MARKET_TARGET_CREDIBLE; i += MARKET_BATCH_SIZE) {
    const batch = ranked.slice(i, Math.min(i + MARKET_BATCH_SIZE, ranked.length, i + (MARKET_LOOKUP_BUDGET - spent)));
    spent += batch.length;
    const results = await Promise.all(
      batch.map(async (t) => {
        const json = await tryRun(run, ['token', 'price-info', '--address', t.tokenContractAddress, '--chain', chain]);
        return parseMarket(json, t.symbol);
      }),
    );
    for (const m of results) {
      if (!m) continue;
      markets.push(m);
      if (isCredibleMarket(m)) credible++;
    }
  }
  return markets;
}

export async function getWalletData(
  address: string,
  chain: string,
  run: RunFn,
  now = Date.now(),
): Promise<WalletData> {
  const begin = String(now - HISTORY_WINDOW_MS);
  const end = String(now);
  const limit = String(PAGE_LIMIT);

  const [balancesJson, approvalPages, historyPages] = await Promise.all([
    tryRun(run, ['portfolio', 'all-balances', '--address', address, '--chains', chain, '--exclude-risk', '0']),
    fetchPages(run, ['security', 'approvals', '--address', address, '--chain', chain, '--limit', limit], approvalsCursor),
    fetchPages(run, ['market', 'portfolio-dex-history', '--address', address, '--chain', chain, '--begin', begin, '--end', end, '--limit', limit], historyCursor),
  ]);

  const balances = parseBalances(balancesJson);
  const approvals = approvalPages.flatMap(parseApprovals);
  const dexHistory = historyPages.flatMap(parseDexHistory);
  const markets = await fetchMarkets(run, chain, balances);

  // Failed = any response that isn't ok-shaped: covers thrown CLI errors
  // (tryRun's {ok:false} sentinel) and error payloads returned with exit 0.
  const failed: FailedSlice[] = [];
  if (!ok(balancesJson)) failed.push('balances');
  if (approvalPages.some((p) => !ok(p))) failed.push('approvals');
  if (historyPages.some((p) => !ok(p))) failed.push('dexHistory');

  return { balances, approvals, dexHistory, markets, failed };
}

// Multi-chain: scan every selected chain in parallel and aggregate into one
// WalletData, tagging every record with its chain so the union keeps its
// origin. `failed` is namespaced per chain (e.g. "balances:base"), and
// `balancesAllFailed` is true only when NO chain returned balances — the
// endpoint uses that to decide 502 vs a per-chain warning.
export interface MultiWalletData extends WalletData {
  chains: string[];
  balancesAllFailed: boolean;
}

export async function getWalletDataMulti(
  address: string,
  chains: string[],
  run: RunFn,
  now = Date.now(),
): Promise<MultiWalletData> {
  const per = await Promise.all(
    chains.map(async (chain) => ({ chain, d: await getWalletData(address, chain, run, now) })),
  );
  const tag = <T>(arr: T[], chain: string): T[] => arr.map((x) => ({ ...x, chain }));

  return {
    balances: per.flatMap((p) => tag(p.d.balances, p.chain)),
    approvals: per.flatMap((p) => tag(p.d.approvals, p.chain)),
    dexHistory: per.flatMap((p) => tag(p.d.dexHistory, p.chain)),
    markets: per.flatMap((p) => tag(p.d.markets, p.chain)),
    failed: per.flatMap((p) => p.d.failed.map((s) => `${s}:${p.chain}` as FailedSlice)),
    chains,
    balancesAllFailed: per.every((p) => p.d.failed.includes('balances')),
  };
}
