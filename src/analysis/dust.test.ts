import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectDust, DUST_DISCLAIMER } from './dust.ts';
import { DUST_LIST_CAP } from './thresholds.ts';
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

test('flags a sub-$2 holding as dust and attaches the mandatory disclaimer', () => {
  // 1 token @ $0.50 = $0.50, under $2
  const dust = detectDust([tok('AAA', '1', '0.5')]);
  assert.equal(dust.length, 1);
  assert.equal(dust[0].token, 'AAA');
  assert.equal(dust[0].usd_value, 0.5);
  assert.equal(dust[0].disclaimer, DUST_DISCLAIMER);
});

test('does not flag a holding worth more than the dust threshold', () => {
  const dust = detectDust([tok('AAA', '10', '5')]); // $50
  assert.equal(dust.length, 0);
});

test('does not flag zero-value (unpriced) holdings as dust', () => {
  const dust = detectDust([tok('AAA', '1000000', '0')]); // $0
  assert.equal(dust.length, 0);
});

test('caps the dust list, keeping the highest-value items', () => {
  // spam-heavy wallets can have hundreds of sub-$2 airdrops
  const many = Array.from({ length: DUST_LIST_CAP + 15 }, (_, i) =>
    tok(`T${i}`, '1', String(0.01 + i * 0.01)),
  );
  const dust = detectDust(many);
  assert.equal(dust.length, DUST_LIST_CAP);
  // highest-value first: the cheapest airdrops are the ones cut
  assert.equal(dust[0].token, `T${DUST_LIST_CAP + 14}`);
});
