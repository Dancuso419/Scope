import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleHealth } from './assemble.ts';
import { DUST_DISCLAIMER } from './dust.ts';
import type { TokenBalance, TokenMarket, DexTransaction, ApprovalRecord } from './types.ts';

// A credible token: real liquidity in markets. Spam: fabricated price, no liquid market.
function bal(symbol: string, addr: string, balance: string, price: string): TokenBalance {
  return { symbol, tokenContractAddress: addr, balance, rawBalance: balance, tokenPrice: price, isRiskToken: false, chainIndex: '1' };
}
function mkt(symbol: string, addr: string, liquidity: string): TokenMarket {
  return { symbol, tokenContractAddress: addr, liquidity, volume24H: '5000' };
}

const now = Date.UTC(2026, 0, 1);

test('liquidity gate: spam token with fake price is excluded from concentration + dust', () => {
  const balances = [
    bal('REAL', '0xreal', '100', '10'), // $1000, credible
    bal('SPAM', '0xspam', '1000000', '5'), // $5,000,000 fabricated, NOT credible
  ];
  const markets = [mkt('REAL', '0xREAL', '50000')]; // spam has no liquid market
  const h = assembleHealth({ balances, markets, approvals: [], dexHistory: [] }, now);

  // Spam's fake $5M must not dominate concentration — only REAL counts.
  assert.equal(h.concentration.topToken, 'REAL');
  assert.equal(h.concentration.percentage, 100);
  // Neither token is worth <$2, so no dust (dust is value-only, ungated).
  assert.equal(h.dust.length, 0);
  assert.equal(h.liquidity.credibleTokens, 1);
  assert.equal(h.liquidity.totalTokens, 2);
  assert.equal(h.liquidity.insufficient, false);
});

test('credibility floor: a thin-pool memecoin cannot back a huge valuation', () => {
  // live failure mode (vitalik.eth): airdropped VITALIK memecoin with ~$2.7k of
  // real liquidity but a fabricated price out-valued actual ETH at 64% of the
  // portfolio. Liquidity > 0 is not enough — the pool must clear the dead-token line.
  const balances = [
    bal('ETH', '', '100', '2000'), // $200k native, inherently credible
    bal('MEME', '0xmeme', '1000000000', '1'), // fake $1B, pool is only $2.7k
  ];
  const markets = [mkt('MEME', '0xmeme', '2700')];
  const h = assembleHealth({ balances, markets, approvals: [], dexHistory: [] }, now);
  assert.equal(h.concentration.topToken, 'ETH');
  assert.equal(h.liquidity.credibleTokens, 1);
});

test('holdings lists credible tokens by USD value, descending; spam excluded', () => {
  const balances = [
    bal('KNC', '0xk', '1000', '5'),      // $5k credible
    bal('ETH', '', '10', '2000'),        // $20k native, credible
    bal('SPAM', '0xs', '1000000', '9'),  // fake price, no credible market
  ];
  const markets = [mkt('KNC', '0xk', '50000')];
  const h = assembleHealth({ balances, markets, approvals: [], dexHistory: [] }, now);
  assert.deepEqual(h.holdings.map((x) => x.symbol), ['ETH', 'KNC']); // sorted desc, spam gone
  assert.equal(h.holdings[0].usdValue, 20000);
});

test('native token (empty contract address) is inherently credible despite no market', () => {
  const balances = [bal('ETH', '', '2', '2000')]; // native, never in markets
  const h = assembleHealth({ balances, markets: [], approvals: [], dexHistory: [] }, now);
  assert.equal(h.concentration.topToken, 'ETH');
  assert.equal(h.liquidity.credibleTokens, 1);
  assert.equal(h.liquidity.insufficient, false);
});

test('all-spam wallet degrades honestly to insufficient liquid holdings', () => {
  const balances = [bal('SPAM1', '0xa', '1', '9999'), bal('SPAM2', '0xb', '1', '8888')];
  const h = assembleHealth({ balances, markets: [], approvals: [], dexHistory: [] }, now);
  assert.equal(h.liquidity.insufficient, true);
  assert.equal(h.concentration.flagged, false);
  assert.equal(h.concentration.topToken, null);
  assert.equal(h.dust.length, 0);
});

test('dust is value-only and ungated: a sub-$2 token with no fetched market is still dust', () => {
  // dust sits at the BOTTOM of the value ranking, so the market fan-out never
  // reaches it — the gate must not starve dust detection. The disclaimer
  // already covers the spam/airdrop caveat.
  const balances = [bal('CRUMB', '0xc', '1', '0.5')];
  const h = assembleHealth({ balances, markets: [], approvals: [], dexHistory: [] }, now);
  assert.equal(h.dust.length, 1);
  assert.equal(h.dust[0].token, 'CRUMB');
});

test('DEX buys/sells of a fully-exited token stay in the activity story', () => {
  // exited positions have no balance, so no price-info was ever fetched — but a
  // swap can't execute against a token with no liquidity, so types 1/2 are
  // inherently credible.
  const dexHistory: DexTransaction[] = [
    { type: '1', tokenSymbol: 'GONE', tokenContractAddress: '0xgone', valueUsd: '500', amount: '1', price: '500', time: String(now - 2000) },
    { type: '2', tokenSymbol: 'GONE', tokenContractAddress: '0xgone', valueUsd: '600', amount: '1', price: '600', time: String(now - 1000) },
  ];
  const h = assembleHealth({ balances: [], markets: [], approvals: [], dexHistory }, now);
  assert.equal(h.activity.eventCount, 2);
});

test('activity gate applies to transfers: fake spam transfers do not appear', () => {
  const dexHistory: DexTransaction[] = [
    { type: '1', tokenSymbol: 'REAL', tokenContractAddress: '0xreal', valueUsd: '1000', amount: '100', price: '10', time: String(now - 1000) },
    { type: '3', tokenSymbol: 'SPAM', tokenContractAddress: '0xspam', valueUsd: '9999999', amount: '1', price: '9999999', time: String(now - 500) },
  ];
  const markets = [mkt('REAL', '0xreal', '50000')];
  const h = assembleHealth({ balances: [], markets, approvals: [], dexHistory }, now);
  assert.equal(h.activity.eventCount, 1);
  assert.equal(h.activity.notable[0].token, 'REAL');
});

test('approvals and dead tokens pass through, dust carries the mandatory disclaimer', () => {
  const balances = [bal('DUSTY', '0xd', '1', '0.5')]; // $0.50 dust, credible
  const markets = [mkt('DUSTY', '0xd', '20000'), mkt('DEAD', '0xdead', '100')]; // DEAD illiquid
  const approvals: ApprovalRecord[] = [
    { approvalAddress: '0xspender', tokenAddress: '0xt', symbol: 'T', blockTime: Date.UTC(2020, 0, 1), remainAmount: (2n ** 256n - 1n).toString(), protocolName: 'X', vulnerabilityFlag: false, status: '1' },
  ];
  const h = assembleHealth({ balances, markets, approvals, dexHistory: [] }, now);
  assert.equal(h.dust.length, 1);
  assert.equal(h.dust[0].disclaimer, DUST_DISCLAIMER);
  assert.equal(h.staleApprovals.length, 1);
  assert.equal(h.deadTokens.length, 1);
  assert.equal(h.deadTokens[0].token, 'DEAD');
});
