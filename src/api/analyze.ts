import { getWalletData, type RunFn } from '../data/wallet.ts';
import { assembleHealth, type WalletHealth } from '../analysis/assemble.ts';
import { narrate, type LLMFn } from '../narration/narrate.ts';
import { round1, round2 } from '../analysis/num.ts';

// TRD §6 response contract. `summary` / `activity_story` are the Narration
// Layer's outputs — null here until Gemini is wired in, so the shape stays
// stable either way. Field name `granted_at` (not the TRD's tentative
// `last_used`): Onchain OS only exposes approval grant time, never last-used.
export interface ApiResponse {
  wallet_address: string;
  chain: string;
  health_check: {
    concentration_risk: { flagged: boolean; top_token: string | null; percentage: number; summary: string | null };
    stale_approvals: { contract: string; token: string; granted_at: string; summary: string | null }[];
    dead_tokens: { token: string; summary: string | null }[];
    dust: { token: string; usd_value: number; disclaimer: string }[];
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
  chain?: string;
}

export class BadRequestError extends Error {}
// Upstream data source failed on the slice nothing works without → 502, never
// a clean-looking empty report. This is a paid call; "all clear" on a wallet
// we couldn't read is worse than an error.
export class UpstreamError extends Error {}

const DEFAULT_CHAIN = 'ethereum';
const SUPPORTED_CHAINS = [DEFAULT_CHAIN]; // v1 launch chain; expanding = add here
const MAX_ADDRESS_LEN = 100; // longest supported chain address (Solana base58) sits well under this

// Trust boundary: the request body is untrusted. Keep validation light (chains
// differ in address format) but reject anything obviously not an address.
function validate(body: AnalyzeRequest): { address: string; chain: string } {
  const address = typeof body?.wallet_address === 'string' ? body.wallet_address.trim() : '';
  if (!address || address.length > MAX_ADDRESS_LEN) {
    throw new BadRequestError('wallet_address is required');
  }
  const chain = typeof body?.chain === 'string' && body.chain.trim() ? body.chain.trim() : DEFAULT_CHAIN;
  if (!SUPPORTED_CHAINS.includes(chain)) {
    throw new BadRequestError(`unsupported chain: ${chain} (supported: ${SUPPORTED_CHAINS.join(', ')})`);
  }
  return { address, chain };
}


export function buildResponse(address: string, chain: string, h: WalletHealth, now: number, warnings: string[]): ApiResponse {
  return {
    wallet_address: address,
    chain,
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
        summary: null,
      })),
      dead_tokens: h.deadTokens.map((d) => ({ token: d.token, summary: null })),
      dust: h.dust.map((d) => ({ token: d.token, usd_value: round2(d.usd_value), disclaimer: d.disclaimer })),
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
  const { address, chain } = validate(body);
  const data = await getWalletData(address, chain, run, now);
  if (data.failed.includes('balances')) {
    throw new UpstreamError('could not read wallet balances — data source unavailable');
  }
  const warnings = data.failed.map((s) => `${s} data unavailable or incomplete`);
  const health = assembleHealth(data, now);
  const response = buildResponse(address, chain, health, now, warnings);

  // Narration is optional and best-effort: the deterministic facts are the paid
  // product, so a Gemini failure degrades to facts-only with a warning.
  if (callLLM) {
    try {
      const n = await narrate(health, callLLM);
      response.health_summary = n.health_summary;
      response.activity_story = n.activity_story;
    } catch {
      response.warnings.push('narration unavailable — facts returned without plain-English summaries');
    }
  }
  return response;
}
