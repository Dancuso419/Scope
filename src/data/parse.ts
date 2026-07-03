import type { TokenBalance, ApprovalRecord, DexTransaction, TokenMarket } from '../analysis/types.ts';

// Pure mappers: raw Onchain OS CLI JSON → analysis input types.
// Every response is shaped { ok: boolean, data: ... }. On ok:false or a missing
// shape, return empty rather than throwing — a partial wallet view beats a 500.

export function ok(json: unknown): json is { ok: true; data: unknown } {
  return typeof json === 'object' && json !== null && (json as { ok?: unknown }).ok === true;
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

// `portfolio all-balances` → data[].tokenAssets[]. Risk tokens are dropped here
// as a defensive backstop to --exclude-risk (which only works on some chains).
export function parseBalances(json: unknown): TokenBalance[] {
  if (!ok(json)) return [];
  return asArray(json.data)
    .flatMap((chain) => asArray((chain as { tokenAssets?: unknown }).tokenAssets))
    .map((t) => t as TokenBalance)
    .filter((t) => !t.isRiskToken);
}

// `security approvals` → data[].dataList[]
export function parseApprovals(json: unknown): ApprovalRecord[] {
  if (!ok(json)) return [];
  return asArray(json.data)
    .flatMap((page) => asArray((page as { dataList?: unknown }).dataList))
    .map((a) => a as ApprovalRecord);
}

// `market portfolio-dex-history` → data.transactionList[]
export function parseDexHistory(json: unknown): DexTransaction[] {
  if (!ok(json)) return [];
  const data = json.data as { transactionList?: unknown } | null;
  return asArray(data?.transactionList).map((tx) => tx as DexTransaction);
}

// `token price-info` → data[0]. Note: price-info has NO symbol field, so the
// caller must supply it (from the balance record).
export function parseMarket(json: unknown, symbol: string): TokenMarket | null {
  if (!ok(json)) return null;
  const first = asArray(json.data)[0] as
    | { tokenContractAddress?: string; liquidity?: string; volume24H?: string }
    | undefined;
  if (!first) return null;
  return {
    symbol,
    tokenContractAddress: first.tokenContractAddress ?? '',
    liquidity: first.liquidity ?? '',
    volume24H: first.volume24H ?? '',
  };
}
