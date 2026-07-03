import type { TokenBalance, TokenMarket, DexTransaction, ApprovalRecord } from './types.ts';
import { analyzeConcentration, type ConcentrationResult } from './concentration.ts';
import { detectDust, type DustItem } from './dust.ts';
import { findRiskyApprovals, type RiskyApproval } from './approvals.ts';
import { findDeadTokens, type DeadToken } from './deadTokens.ts';
import { buildActivityTimeline, type ActivityTimeline } from './activity.ts';
import { parseNum } from './num.ts';
import { DEAD_TOKEN_MIN_LIQUIDITY_USD } from './thresholds.ts';

export interface AssembleInput {
  balances: TokenBalance[];
  markets: TokenMarket[];
  approvals: ApprovalRecord[];
  dexHistory: DexTransaction[];
}

export interface WalletHealth {
  concentration: ConcentrationResult;
  staleApprovals: RiskyApproval[];
  deadTokens: DeadToken[];
  dust: DustItem[];
  activity: ActivityTimeline;
  liquidity: {
    credibleTokens: number;
    totalTokens: number;
    insufficient: boolean; // no credible holdings — concentration/dust ran on an empty set
  };
}

// A market is credible when price-info returned real liquidity ABOVE the
// dead-token line. Spam carries fabricated prices with empty/zero liquidity,
// and a thin pool (a few $k) can't back a large valuation either — live data
// showed a $2.7k-pool memecoin out-"valuing" actual ETH. Tokens below the line
// still show up in dead_tokens; they just don't count toward concentration/activity.
export function isCredibleMarket(m: TokenMarket): boolean {
  const liq = parseNum(m.liquidity);
  return liq !== null && liq >= DEAD_TOKEN_MIN_LIQUIDITY_USD;
}

// Spam tokens carry fabricated prices but no real liquid market. The credible
// set is the tokens whose price-info returned real liquidity (> 0). Everything
// else is filtered out before concentration/activity math so fake prices
// can't dominate. See onchainos-data-availability memory (liquidity gate).
function credibleAddresses(markets: TokenMarket[]): Set<string> {
  return new Set(markets.filter(isCredibleMarket).map((m) => m.tokenContractAddress.toLowerCase()));
}

export function assembleHealth(input: AssembleInput, now = Date.now()): WalletHealth {
  const credible = credibleAddresses(input.markets);
  // The native token (ETH, etc.) has no contract address, so price-info can't be
  // called on it and it never appears in `markets` — but it's the most credible
  // holding a wallet can have. Empty address = inherently credible.
  const isCredible = (addr: string) => addr.trim() === '' || credible.has(addr.toLowerCase());

  const liquidBalances = input.balances.filter((b) => isCredible(b.tokenContractAddress));
  // DEX buys/sells (types 1/2) are inherently credible — a swap can't execute
  // against a token with no liquidity, and exited positions have no balance so
  // their markets were never fetched. Only transfers (3/4) carry spam's fake
  // valueUsd, so only they are gated.
  const liquidHistory = input.dexHistory.filter(
    (t) => t.type === '1' || t.type === '2' || isCredible(t.tokenContractAddress),
  );

  return {
    concentration: analyzeConcentration(liquidBalances),
    // dust is value-only and UNGATED: dust sits at the bottom of the value
    // ranking where the market fan-out never reaches, and the mandatory
    // disclaimer already covers the spam/airdrop caveat. detectDust caps the list.
    dust: detectDust(input.balances),
    activity: buildActivityTimeline(liquidHistory),
    staleApprovals: findRiskyApprovals(input.approvals, now),
    deadTokens: findDeadTokens(input.markets),
    liquidity: {
      credibleTokens: liquidBalances.length,
      totalTokens: input.balances.length,
      insufficient: input.balances.length > 0 && liquidBalances.length === 0,
    },
  };
}
