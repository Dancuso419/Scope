import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeConcentration } from './concentration.ts';
import type { TokenBalance } from './types.ts';

const tok = (symbol: string, balance: string, price: string): TokenBalance => ({
  symbol,
  tokenContractAddress: '0x' + symbol,
  balance,
  rawBalance: '0',
  tokenPrice: price,
  isRiskToken: false,
  chainIndex: '1',
});

test('flags a wallet with one token above the concentration threshold', () => {
  // $90 in AAA, $10 in BBB → 90% in one token
  const r = analyzeConcentration([tok('AAA', '90', '1'), tok('BBB', '10', '1')]);
  assert.equal(r.flagged, true);
  assert.equal(r.topToken, 'AAA');
  assert.equal(Math.round(r.percentage), 90);
});

test('does not flag a well-diversified wallet below the threshold', () => {
  // $40 / $30 / $30 → top is 40%, under 70%
  const r = analyzeConcentration([tok('AAA', '40', '1'), tok('BBB', '30', '1'), tok('CCC', '30', '1')]);
  assert.equal(r.flagged, false);
  assert.equal(r.topToken, 'AAA');
});

test('handles an empty wallet without dividing by zero', () => {
  const r = analyzeConcentration([]);
  assert.deepEqual(r, { flagged: false, topToken: null, percentage: 0 });
});

test('skips tokens with malformed price/balance instead of emitting NaN', () => {
  // one bad record must not poison the math for the good ones
  const r = analyzeConcentration([
    tok('BAD', '100', ''), // Number('') = 0 is fine, but undefined-ish garbage is not
    tok('UGLY', 'not-a-number', '1'),
    tok('AAA', '90', '1'),
    tok('BBB', '10', '1'),
  ]);
  assert.equal(r.flagged, true);
  assert.equal(r.topToken, 'AAA');
  assert.equal(Math.round(r.percentage), 90);
  assert.equal(Number.isFinite(r.percentage), true);
});
