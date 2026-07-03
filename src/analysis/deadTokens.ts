import type { TokenMarket } from './types.ts';
import { DEAD_TOKEN_MIN_LIQUIDITY_USD, DEAD_TOKEN_MIN_VOLUME_24H_USD } from './thresholds.ts';
import { parseNum } from './num.ts';

export interface DeadToken {
  token: string;
  liquidityUsd: number;
  volume24hUsd: number;
  reason: 'illiquid' | 'inactive' | 'illiquid-and-inactive';
}

export function findDeadTokens(markets: TokenMarket[]): DeadToken[] {
  const dead: DeadToken[] = [];
  for (const m of markets) {
    const liquidityUsd = parseNum(m.liquidity);
    const volume24hUsd = parseNum(m.volume24H);
    if (liquidityUsd === null || volume24hUsd === null) continue; // unknown market data ≠ dead
    // zero liquidity is indistinguishable from an airdropped spam token — "dead"
    // requires a real-but-thin market, not the absence of one
    if (liquidityUsd <= 0) continue;
    const illiquid = liquidityUsd < DEAD_TOKEN_MIN_LIQUIDITY_USD;
    const inactive = volume24hUsd < DEAD_TOKEN_MIN_VOLUME_24H_USD;
    if (!illiquid && !inactive) continue;
    const reason =
      illiquid && inactive ? 'illiquid-and-inactive' : illiquid ? 'illiquid' : 'inactive';
    dead.push({ token: m.symbol, liquidityUsd, volume24hUsd, reason });
  }
  return dead;
}
