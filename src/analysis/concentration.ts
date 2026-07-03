import type { TokenBalance } from './types.ts';
import { CONCENTRATION_THRESHOLD } from './thresholds.ts';
import { parseNum } from './num.ts';

export interface ConcentrationResult {
  flagged: boolean;
  topToken: string | null;
  percentage: number; // share of the top token, 0–100
}

export function analyzeConcentration(tokens: TokenBalance[]): ConcentrationResult {
  let total = 0;
  let top: { symbol: string; value: number } | null = null;
  for (const t of tokens) {
    const balance = parseNum(t.balance);
    const price = parseNum(t.tokenPrice);
    if (balance === null || price === null) continue; // malformed record: skip, don't poison the total
    const value = balance * price;
    total += value;
    if (!top || value > top.value) top = { symbol: t.symbol, value };
  }
  if (!top || total === 0) return { flagged: false, topToken: null, percentage: 0 };
  const share = top.value / total;
  return { flagged: share >= CONCENTRATION_THRESHOLD, topToken: top.symbol, percentage: share * 100 };
}
