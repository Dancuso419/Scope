import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBalances, parseApprovals, parseDexHistory, parseMarket } from './parse.ts';

// Fixtures mirror the real CLI response shapes observed against the live API.

test('parseBalances flattens tokenAssets across chains and drops risk tokens', () => {
  const json = {
    ok: true,
    data: [
      {
        tokenAssets: [
          { symbol: 'REAL', tokenContractAddress: '0x1', balance: '5', rawBalance: '0', tokenPrice: '2', isRiskToken: false, chainIndex: '1' },
          { symbol: 'SPAM', tokenContractAddress: '0x2', balance: '999', rawBalance: '0', tokenPrice: '14.89', isRiskToken: true, chainIndex: '1' },
        ],
      },
    ],
  };
  const out = parseBalances(json);
  assert.equal(out.length, 1);
  assert.equal(out[0].symbol, 'REAL');
});

test('parseBalances returns [] on ok:false or missing data', () => {
  assert.deepEqual(parseBalances({ ok: false, msg: 'nope' }), []);
  assert.deepEqual(parseBalances({ ok: true }), []);
  assert.deepEqual(parseBalances(null), []);
});

test('parseApprovals flattens dataList across pages', () => {
  const json = {
    ok: true,
    data: [
      { cursor: 1, dataList: [{ approvalAddress: '0xa', tokenAddress: '0xt', symbol: 'AAA', blockTime: 1, remainAmount: '1', protocolName: 'p', vulnerabilityFlag: false, status: '1' }] },
      { cursor: 2, dataList: [{ approvalAddress: '0xb', tokenAddress: '0xu', symbol: 'BBB', blockTime: 2, remainAmount: '2', protocolName: 'q', vulnerabilityFlag: false, status: '1' }] },
    ],
  };
  const out = parseApprovals(json);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((a) => a.symbol), ['AAA', 'BBB']);
});

test('parseDexHistory extracts transactionList', () => {
  const json = { ok: true, data: { transactionList: [{ type: '1', tokenSymbol: 'AAA', tokenContractAddress: '0x1', valueUsd: '10', amount: '1', price: '10', time: '123' }] } };
  const out = parseDexHistory(json);
  assert.equal(out.length, 1);
  assert.equal(out[0].tokenSymbol, 'AAA');
});

test('parseDexHistory returns [] when history is empty or missing', () => {
  assert.deepEqual(parseDexHistory({ ok: true, data: {} }), []);
  assert.deepEqual(parseDexHistory({ ok: false }), []);
});

test('parseMarket pulls liquidity+volume from data[0] and attaches the supplied symbol', () => {
  const json = { ok: true, data: [{ tokenContractAddress: '0x28', liquidity: '458954.34', volume24H: '16193.28', price: '0.0001' }] };
  const out = parseMarket(json, 'MOODENG');
  assert.deepEqual(out, { symbol: 'MOODENG', tokenContractAddress: '0x28', liquidity: '458954.34', volume24H: '16193.28' });
});

test('parseMarket returns null when price-info has no data', () => {
  assert.equal(parseMarket({ ok: true, data: [] }, 'AAA'), null);
  assert.equal(parseMarket({ ok: false }, 'AAA'), null);
});
