import type { DexTransaction } from './types.ts';
import { ACTIVITY_MIN_USD } from './thresholds.ts';
import { parseNum } from './num.ts';

const ACTION_BY_TYPE: Record<string, ActivityAction> = {
  '1': 'buy',
  '2': 'sell',
  '3': 'transfer-in',
  '4': 'transfer-out',
};
const NOTABLE_LIMIT = 5;

export type ActivityAction = 'buy' | 'sell' | 'transfer-in' | 'transfer-out';

export interface NotableEvent {
  action: ActivityAction;
  token: string;
  valueUsd: number;
  at: string; // ISO
  chain?: string;
}

export interface ActivityTimeline {
  hasActivity: boolean;
  eventCount: number;
  firstAt: string | null;
  lastAt: string | null;
  notable: NotableEvent[]; // most valuable events, chronological
}

export function buildActivityTimeline(txs: DexTransaction[]): ActivityTimeline {
  const events: NotableEvent[] = [];
  for (const tx of txs) {
    const valueUsd = parseNum(tx.valueUsd);
    const time = parseNum(tx.time);
    const action = ACTION_BY_TYPE[tx.type];
    // malformed record: skip, don't throw on Invalid Date or rank NaN values
    if (!action || valueUsd === null || time === null || valueUsd < ACTIVITY_MIN_USD) continue;
    events.push({ action, token: tx.tokenSymbol, valueUsd, at: new Date(time).toISOString(), chain: tx.chain });
  }

  if (events.length === 0) {
    return { hasActivity: false, eventCount: 0, firstAt: null, lastAt: null, notable: [] };
  }

  const times = events.map((e) => e.at).sort();
  const notable = [...events]
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, NOTABLE_LIMIT)
    .sort((a, b) => a.at.localeCompare(b.at));

  return {
    hasActivity: true,
    eventCount: events.length,
    firstAt: times[0],
    lastAt: times[times.length - 1],
    notable,
  };
}
