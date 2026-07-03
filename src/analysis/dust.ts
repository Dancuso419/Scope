import type { TokenBalance } from './types.ts';
import { DUST_MAX_USD, DUST_LIST_CAP } from './thresholds.ts';
import { parseNum } from './num.ts';

export interface DustItem {
  token: string;
  usd_value: number;
  disclaimer: string;
}

// Mandatory per PRD/TRD: every dust-flagged token must carry this text.
export const DUST_DISCLAIMER =
  'Value-only estimate. This does not account for the gas cost to move the token, ' +
  'its liquidity, or whether it is a spam/airdrop token. Verify before dismissing or moving it.';

export function detectDust(tokens: TokenBalance[]): DustItem[] {
  const dust: DustItem[] = [];
  for (const t of tokens) {
    const balance = parseNum(t.balance);
    const price = parseNum(t.tokenPrice);
    if (balance === null || price === null) continue; // malformed record: skip
    const value = balance * price;
    if (value > 0 && value < DUST_MAX_USD) {
      dust.push({ token: t.symbol, usd_value: value, disclaimer: DUST_DISCLAIMER });
    }
  }
  // Highest-value first, capped: on spam-heavy wallets the cheapest airdrops
  // are the ones cut, and those are the least likely to be real dust.
  return dust.sort((a, b) => b.usd_value - a.usd_value).slice(0, DUST_LIST_CAP);
}
