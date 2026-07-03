import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildActivityTimeline } from './activity.ts';
import type { DexTransaction } from './types.ts';

const DAY = 24 * 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

const txn = (over: Partial<DexTransaction>): DexTransaction => ({
  type: '1',
  tokenSymbol: 'AAA',
  tokenContractAddress: '0xaaa',
  valueUsd: '100',
  amount: '1',
  price: '100',
  time: String(T0),
  ...over,
});

test('builds a chronological timeline with first/last and maps tx types to actions', () => {
  const tl = buildActivityTimeline([
    txn({ type: '1', valueUsd: '500', time: String(T0) }), // buy, earliest
    txn({ type: '2', valueUsd: '300', time: String(T0 + 2 * DAY) }), // sell, latest
    txn({ type: '4', valueUsd: '200', time: String(T0 + 1 * DAY) }), // transfer out, middle
  ]);
  assert.equal(tl.hasActivity, true);
  assert.equal(tl.eventCount, 3);
  assert.equal(tl.firstAt, new Date(T0).toISOString());
  assert.equal(tl.lastAt, new Date(T0 + 2 * DAY).toISOString());
  // notable is chronological
  assert.deepEqual(
    tl.notable.map((e) => e.action),
    ['buy', 'transfer-out', 'sell'],
  );
});

test('filters out sub-threshold noise events', () => {
  const tl = buildActivityTimeline([
    txn({ valueUsd: '0.01', time: String(T0) }), // noise
    txn({ valueUsd: '50', time: String(T0 + DAY) }),
  ]);
  assert.equal(tl.eventCount, 1);
  assert.equal(tl.notable.length, 1);
  assert.equal(tl.notable[0].valueUsd, 50);
});

test('returns a defined empty fallback for a sparse wallet (no meaningful events)', () => {
  const tl = buildActivityTimeline([txn({ valueUsd: '0.001' })]);
  assert.deepEqual(tl, {
    hasActivity: false,
    eventCount: 0,
    firstAt: null,
    lastAt: null,
    notable: [],
  });
});

test('skips records with malformed time or value instead of throwing', () => {
  const tl = buildActivityTimeline([
    txn({ time: 'garbage', valueUsd: '100' }), // Invalid Date must not throw
    txn({ valueUsd: 'garbage', time: String(T0) }),
    txn({ valueUsd: '50', time: String(T0 + DAY) }),
  ]);
  assert.equal(tl.eventCount, 1);
  assert.equal(tl.notable[0].valueUsd, 50);
});

test('caps notable events to the top 5 by value', () => {
  const txs = Array.from({ length: 8 }, (_, i) =>
    txn({ valueUsd: String((i + 1) * 10), time: String(T0 + i * DAY) }),
  );
  const tl = buildActivityTimeline(txs);
  assert.equal(tl.eventCount, 8);
  assert.equal(tl.notable.length, 5);
  // the 5 kept are the highest-value ($40..$80), still chronological
  assert.deepEqual(
    tl.notable.map((e) => e.valueUsd),
    [40, 50, 60, 70, 80],
  );
});
