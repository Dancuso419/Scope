import { getWalletDataMulti, type RunFn } from '../data/wallet.ts';
import { assembleHealth, type WalletHealth } from '../analysis/assemble.ts';
import { narrate, type LLMFn } from '../narration/narrate.ts';
import { round1, round2 } from '../analysis/num.ts';

// TRD §6 response contract. `summary` / `activity_story` are the Narration
// Layer's outputs — null here until Gemini is wired in, so the shape stays
// stable either way. Field name `granted_at` (not the TRD's tentative
// `last_used`): Onchain OS only exposes approval grant time, never last-used.
export interface ApiResponse {
  wallet_address: string;
  chain: string; // display string of chains scanned (back-compat); see `chains`
  chains: string[]; // the chains this report aggregates
  // Plain, deterministic one-line summary of the whole report — computed from
  // the flags, never LLM-written, so it can't be wrong or invented.
  verdict: string;
  health_check: {
    concentration_risk: { flagged: boolean; top_token: string | null; percentage: number; summary: string | null };
    stale_approvals: { contract: string; token: string; granted_at: string; chain?: string; summary: string | null }[];
    dead_tokens: { token: string; chain?: string; summary: string | null }[];
    dust: { token: string; usd_value: number; chain?: string; disclaimer: string }[];
  };
  // Deterministic breakdowns for the dashboard charts (additive to the TRD §6
  // contract). holdings = credible portfolio by share; activity = structured
  // timeline behind the prose activity_story. Each item tagged with its chain.
  holdings: { token: string; usd_value: number; share: number; chain?: string }[];
  activity: {
    event_count: number;
    first_at: string | null;
    last_at: string | null;
    notable: { action: string; token: string; usd_value: number; at: string; chain?: string }[];
  };
  // Narration Layer outputs (two prose blocks, TRD §5). Null until Gemini fills
  // them; a narration failure leaves them null and adds a warning — the
  // deterministic facts above are the paid product and always return.
  health_summary: string | null;
  activity_story: string | null;
  warnings: string[]; // slices that failed or were incomplete — empty on a clean read
  generated_at: string;
}

export interface AnalyzeRequest {
  wallet_address: string;
  chain?: string; // single chain (back-compat)
  chains?: string[]; // one or more chains to scan and aggregate
}

export class BadRequestError extends Error {}
// Upstream data source failed on the slice nothing works without → 502, never
// a clean-looking empty report. This is a paid call; "all clear" on a wallet
// we couldn't read is worse than an error.
export class UpstreamError extends Error {}

// CLI-verified chain identifiers. Add here to support more.
const SUPPORTED_CHAINS = ['xlayer', 'ethereum', 'base', 'arbitrum', 'bsc', 'polygon'];
const DEFAULT_CHAINS = ['xlayer', 'ethereum']; // host chain + where the example wallets are active
const MAX_CHAINS = SUPPORTED_CHAINS.length; // each chain is a full (metered) scan — bound the fan-out
const MAX_ADDRESS_LEN = 100; // longest supported chain address (Solana base58) sits well under this

// Trust boundary: the request body is untrusted. Accept `chains` (array) or a
// single `chain` (back-compat); default when neither is given.
function validate(body: AnalyzeRequest): { address: string; chains: string[] } {
  const address = typeof body?.wallet_address === 'string' ? body.wallet_address.trim() : '';
  if (!address || address.length > MAX_ADDRESS_LEN) {
    throw new BadRequestError('wallet_address is required');
  }
  let raw: unknown[];
  if (Array.isArray(body?.chains)) raw = body.chains;
  else if (typeof body?.chain === 'string' && body.chain.trim()) raw = [body.chain];
  else raw = DEFAULT_CHAINS;

  const chains = [...new Set(raw.map((c) => String(c).trim().toLowerCase()).filter(Boolean))];
  if (!chains.length) throw new BadRequestError('at least one chain is required');
  if (chains.length > MAX_CHAINS) throw new BadRequestError(`too many chains (max ${MAX_CHAINS})`);
  for (const c of chains) {
    if (!SUPPORTED_CHAINS.includes(c)) {
      throw new BadRequestError(`unsupported chain: ${c} (supported: ${SUPPORTED_CHAINS.join(', ')})`);
    }
  }
  return { address, chains };
}

// Plain-English, deterministic verdict for the top-of-report banner. Built only
// from the computed flags, so it is always accurate and never model-generated.
function verdict(h: WalletHealth): string {
  if (h.liquidity.insufficient) return "Not enough easily-sellable holdings to judge this wallet's health.";
  const issues: string[] = [];
  if (h.concentration.flagged) issues.push(`most of the value sits in one token (${round1(h.concentration.percentage)}% in ${h.concentration.topToken})`);
  if (h.staleApprovals.length) issues.push(`${h.staleApprovals.length} old approval${h.staleApprovals.length === 1 ? '' : 's'} worth reviewing`);
  if (h.deadTokens.length) issues.push(`${h.deadTokens.length} hard-to-sell token${h.deadTokens.length === 1 ? '' : 's'}`);
  if (!issues.length) return 'This wallet looks healthy — nothing notable was flagged.';
  return 'A few things worth a look: ' + issues.join('; ') + '.';
}


const HOLDINGS_TOP = 8; // chart the top N; roll the rest into one "Other" slice

function holdingsBreakdown(holdings: WalletHealth['holdings']): ApiResponse['holdings'] {
  const total = holdings.reduce((s, x) => s + x.usdValue, 0);
  const share = (v: number) => (total > 0 ? round1((v / total) * 100) : 0);
  const out = holdings.slice(0, HOLDINGS_TOP).map((x) => ({ token: x.symbol, usd_value: round2(x.usdValue), share: share(x.usdValue), chain: x.chain }));
  const rest = holdings.slice(HOLDINGS_TOP);
  if (rest.length) {
    const restVal = rest.reduce((s, x) => s + x.usdValue, 0);
    out.push({ token: 'Other', usd_value: round2(restVal), share: share(restVal), chain: undefined });
  }
  return out;
}

export function buildResponse(address: string, chains: string[], h: WalletHealth, now: number, warnings: string[]): ApiResponse {
  return {
    wallet_address: address,
    chain: chains.join(', '),
    chains,
    verdict: verdict(h),
    health_check: {
      concentration_risk: {
        flagged: h.concentration.flagged,
        top_token: h.concentration.topToken,
        percentage: round1(h.concentration.percentage),
        summary: null,
      },
      stale_approvals: h.staleApprovals.map((a) => ({
        contract: a.spender,
        token: a.token,
        granted_at: a.granted_at,
        chain: a.chain,
        summary: null,
      })),
      dead_tokens: h.deadTokens.map((d) => ({ token: d.token, chain: d.chain, summary: null })),
      dust: h.dust.map((d) => ({ token: d.token, usd_value: round2(d.usd_value), chain: d.chain, disclaimer: d.disclaimer })),
    },
    holdings: holdingsBreakdown(h.holdings),
    activity: {
      event_count: h.activity.eventCount,
      first_at: h.activity.firstAt,
      last_at: h.activity.lastAt,
      notable: h.activity.notable.map((n) => ({ action: n.action, token: n.token, usd_value: round2(n.valueUsd), at: n.at, chain: n.chain })),
    },
    health_summary: null,
    activity_story: null,
    warnings,
    generated_at: new Date(now).toISOString(),
  };
}

// The one endpoint. Transport is injected: CLI locally, REST on Vercel later.
export async function analyzeWallet(
  body: AnalyzeRequest,
  run: RunFn,
  now = Date.now(),
  callLLM?: LLMFn,
): Promise<ApiResponse> {
  const { address, chains } = validate(body);
  const data = await getWalletDataMulti(address, chains, run, now);
  // 502 only when NO selected chain returned balances — one chain failing while
  // others succeed degrades to a warning, not a dropped report.
  if (data.balancesAllFailed) {
    throw new UpstreamError('could not read wallet balances on any selected chain — data source unavailable');
  }
  const warnings = data.failed.map((s) => `${s} data unavailable or incomplete`);
  const health = assembleHealth(data, now);
  const response = buildResponse(address, chains, health, now, warnings);

  // Narration is optional and best-effort: the deterministic facts are the paid
  // product, so a Gemini failure degrades to facts-only with a warning.
  if (callLLM) {
    try {
      const n = await narrate(health, callLLM, chains);
      response.health_summary = n.health_summary;
      response.activity_story = n.activity_story;
    } catch (e) {
      // Log the real reason server-side (Railway logs); keep the wire warning
      // generic so we don't leak internals to the caller.
      console.error('[narration] failed, returning facts only:', e instanceof Error ? e.message : e);
      response.warnings.push('narration unavailable — facts returned without plain-English summaries');
    }
  }
  return response;
}
