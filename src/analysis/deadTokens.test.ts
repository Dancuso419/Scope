import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDeadTokens } from './deadTokens.ts';
import type { TokenMarket } from './types.ts';

const mkt = (symbol: string, liquidity: string, volume24H: string): TokenMarket => ({
  symbol,
  tokenContractAddress: '0x' + symbol,
  liquidity,
  volume24H,
});

test('does not flag a healthy, liquid, actively-traded token', () => {
  // MOODENG-like: ~$459k liquidity, ~$16k 24h volume
  const dead = findDeadTokens([mkt('MOODENG', '458954', '16193')]);
  assert.equal(dead.length, 0);
});

test('flags a token with liquidity below the threshold as illiquid', () => {
  const dead = findDeadTokens([mkt('AAA', '500', '5000')]); // low liq, decent volume
  assert.equal(dead.length, 1);
  assert.equal(dead[0].token, 'AAA');
  assert.equal(dead[0].reason, 'illiquid');
});

test('flags a token with near-zero 24h volume as inactive', () => {
  const dead = findDeadTokens([mkt('BBB', '50000', '5')]); // liquid but not traded
  assert.equal(dead.length, 1);
  assert.equal(dead[0].reason, 'inactive');
});

test('flags a token that is both illiquid and inactive', () => {
  const dead = findDeadTokens([mkt('CCC', '100', '0')]);
  assert.equal(dead.length, 1);
  assert.equal(dead[0].reason, 'illiquid-and-inactive');
});

test('does not flag zero-liquidity tokens — indistinguishable from airdropped spam', () => {
  // spam markets report liquidity "0"; a flag would tell the user they hold a
  // dead token that's actually a scam airdrop. Dead requires a real-but-thin market.
  const dead = findDeadTokens([mkt('SPAM', '0', '0')]);
  assert.equal(dead.length, 0);
});

test('does not flag tokens with unknown (empty/malformed) market data — unknown is not dead', () => {
  // live advanced-info/price-info return "" for missing fields; Number("") = 0
  // must not be read as "zero liquidity"
  const dead = findDeadTokens([mkt('DDD', '', ''), mkt('EEE', 'garbage', '5000')]);
  assert.equal(dead.length, 0);
});
