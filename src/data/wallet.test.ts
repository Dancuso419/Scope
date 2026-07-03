import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWalletData, type RunFn } from './wallet.ts';
import { MARKET_BATCH_SIZE, MARKET_LOOKUP_BUDGET, PAGE_LIMIT } from './config.ts';

// A fake `run` that returns canned JSON per subcommand, and records calls.
function fakeRun(over: Partial<Record<string, unknown>> = {}): { run: RunFn; calls: string[][] } {
  const calls: string[][] = [];
  const balances = {
    ok: true,
    data: [{ tokenAssets: [
      { symbol: 'AAA', tokenContractAddress: '0x1', balance: '5', rawBalance: '0', tokenPrice: '2', isRiskToken: false, chainIndex: '1' },
      { symbol: 'BBB', tokenContractAddress: '0x2', balance: '3', rawBalance: '0', tokenPrice: '1', isRiskToken: false, chainIndex: '1' },
    ] }],
  };
  const approvals = { ok: true, data: [{ dataList: [{ approvalAddress: '0xa', tokenAddress: '0xt', symbol: 'AAA', blockTime: 1, remainAmount: '1', protocolName: 'p', vulnerabilityFlag: false, status: '1' }] }] };
  const history = { ok: true, data: { transactionList: [{ type: '1', tokenSymbol: 'AAA', tokenContractAddress: '0x1', valueUsd: '10', amount: '1', price: '10', time: '123' }] } };

  const run: RunFn = async (args) => {
    calls.push(args);
    const key = `${args[0]} ${args[1]}`;
    if ('throwOn' in over && args.includes(over.throwOn as string)) throw new Error('cli failed');
    if (key === 'portfolio all-balances') return balances;
    if (key === 'security approvals') return approvals;
    if (key === 'market portfolio-dex-history') return history;
    if (key === 'token price-info') {
      const addr = args[args.indexOf('--address') + 1];
      return { ok: true, data: [{ tokenContractAddress: addr, liquidity: addr === '0x1' ? '50000' : '100', volume24H: '9000' }] };
    }
    return { ok: false };
  };
  return { run, calls };
}

test('assembles all four datasets and fans price-info out per held token', async () => {
  const { run, calls } = fakeRun();
  const data = await getWalletData('0xwallet', 'ethereum', run);

  assert.deepEqual(data.balances.map((b) => b.symbol), ['AAA', 'BBB']);
  assert.equal(data.approvals.length, 1);
  assert.equal(data.dexHistory.length, 1);
  // one market per balance token, symbol attached from the balance record
  assert.deepEqual(data.markets.map((m) => m.symbol).sort(), ['AAA', 'BBB']);
  assert.equal(data.markets.find((m) => m.symbol === 'AAA')?.liquidity, '50000');

  const priceCalls = calls.filter((c) => c[0] === 'token' && c[1] === 'price-info');
  assert.equal(priceCalls.length, 2);
});

test('requests the balance fetch with --exclude-risk 0 (spam backstop)', async () => {
  const { run, calls } = fakeRun();
  await getWalletData('0xwallet', 'ethereum', run);
  const bal = calls.find((c) => c[1] === 'all-balances')!;
  assert.ok(bal.includes('--exclude-risk') && bal[bal.indexOf('--exclude-risk') + 1] === '0');
});

// Helper: n tokens where Ti has value (i+1) → higher index = more valuable.
// `marketFor` maps a token address to its price-info liquidity ('' = spam-like).
function manyTokensRun(n: number, marketFor: (addr: string) => string) {
  const many = Array.from({ length: n }, (_, i) => ({
    symbol: `T${i}`, tokenContractAddress: `0x${i}`, balance: '1', rawBalance: '0',
    tokenPrice: String(i + 1), isRiskToken: false, chainIndex: '1',
  }));
  const calls: string[][] = [];
  const run: RunFn = async (args) => {
    calls.push(args);
    const key = `${args[0]} ${args[1]}`;
    if (key === 'portfolio all-balances') return { ok: true, data: [{ tokenAssets: many }] };
    if (key === 'security approvals') return { ok: true, data: [] };
    if (key === 'market portfolio-dex-history') return { ok: true, data: { transactionList: [] } };
    if (key === 'token price-info') {
      const a = args[args.indexOf('--address') + 1];
      return { ok: true, data: [{ tokenContractAddress: a, liquidity: marketFor(a), volume24H: '1' }] };
    }
    return { ok: false };
  };
  return { run, calls };
}

function pricedAddresses(calls: string[][]): string[] {
  return calls.filter((c) => c[0] === 'token' && c[1] === 'price-info').map((c) => c[c.indexOf('--address') + 1]);
}

test('stops market lookups after one batch when it already has enough credible markets', async () => {
  const n = 40;
  const { run, calls } = manyTokensRun(n, () => '50000'); // everything credible
  const data = await getWalletData('0xw', 'ethereum', run);

  const priced = pricedAddresses(calls);
  assert.equal(priced.length, MARKET_BATCH_SIZE); // first batch sufficed
  assert.ok(priced.includes(`0x${n - 1}`)); // started from the most valuable
  assert.equal(data.balances.length, n); // lookup budget never affects balances
});

test('keeps deepening past fake-priced spam until it finds credible markets', async () => {
  // top 15 by "value" are spam (empty liquidity) — exactly the live failure mode
  const n = 30;
  const spam = (addr: string) => Number(addr.slice(2)) >= n - 15;
  const { run, calls } = manyTokensRun(n, (addr) => (spam(addr) ? '' : '50000'));
  const data = await getWalletData('0xw', 'ethereum', run);

  // it must have looked beyond the first (all-spam-heavy) batch...
  assert.ok(pricedAddresses(calls).length > MARKET_BATCH_SIZE);
  // ...and found real tokens
  const credible = data.markets.filter((m) => m.liquidity === '50000');
  assert.ok(credible.length >= 10, `expected >=10 credible, got ${credible.length}`);
});

test('never spends more than the market lookup budget on an all-spam wallet', async () => {
  const { run, calls } = manyTokensRun(MARKET_LOOKUP_BUDGET + 20, () => ''); // nothing credible
  await getWalletData('0xw', 'ethereum', run);
  assert.equal(pricedAddresses(calls).length, MARKET_LOOKUP_BUDGET);
});

test('paginates approvals and dex history with --limit until the cursor runs out', async () => {
  const calls: string[][] = [];
  const approvalItem = (s: string) => ({ approvalAddress: '0xa', tokenAddress: '0xt', symbol: s, blockTime: 1, remainAmount: '1', protocolName: 'p', vulnerabilityFlag: false, status: '1' });
  const txItem = (s: string) => ({ type: '1', tokenSymbol: s, tokenContractAddress: '0x1', valueUsd: '10', amount: '1', price: '10', time: '123' });
  const run: RunFn = async (args) => {
    calls.push(args);
    const key = `${args[0]} ${args[1]}`;
    const cursor = args.includes('--cursor') ? args[args.indexOf('--cursor') + 1] : null;
    if (key === 'portfolio all-balances') return { ok: true, data: [] };
    if (key === 'security approvals') {
      return cursor === '111'
        ? { ok: true, data: [{ dataList: [approvalItem('OLD')] }] } // last page: no cursor
        : { ok: true, data: [{ cursor: 111, dataList: [approvalItem('NEW')] }] };
    }
    if (key === 'market portfolio-dex-history') {
      return cursor === 'abc'
        ? { ok: true, data: { transactionList: [txItem('OLD')] } }
        : { ok: true, data: { cursor: 'abc', transactionList: [txItem('NEW')] } };
    }
    return { ok: false };
  };

  const data = await getWalletData('0xw', 'ethereum', run);
  assert.deepEqual(data.approvals.map((a) => a.symbol), ['NEW', 'OLD']);
  assert.deepEqual(data.dexHistory.map((t) => t.tokenSymbol), ['NEW', 'OLD']);
  // both endpoints must request the max page size, not the default 20
  for (const c of calls.filter((c) => c[1] === 'approvals' || c[1] === 'portfolio-dex-history')) {
    assert.ok(c.includes('--limit') && c[c.indexOf('--limit') + 1] === String(PAGE_LIMIT), `missing --limit ${PAGE_LIMIT}: ${c.join(' ')}`);
  }
});

test('a failing approvals fetch degrades to empty approvals instead of sinking the wallet view', async () => {
  const { run: base } = fakeRun();
  const run: RunFn = async (args) => {
    if (args[0] === 'security') throw new Error('cli failed');
    return base(args);
  };
  const data = await getWalletData('0xwallet', 'ethereum', run);
  assert.deepEqual(data.approvals, []);
  assert.equal(data.balances.length, 2); // everything else intact
  assert.equal(data.dexHistory.length, 1);
  // ...but the failure is REPORTED, not swallowed — the endpoint needs to know
  assert.deepEqual(data.failed, ['approvals']);
});

test('a throwing balances fetch is reported as a failed slice', async () => {
  const { run: base } = fakeRun();
  const run: RunFn = async (args) => {
    if (args[0] === 'portfolio') throw new Error('cli failed');
    return base(args);
  };
  const data = await getWalletData('0xwallet', 'ethereum', run);
  assert.deepEqual(data.balances, []);
  assert.deepEqual(data.failed, ['balances']);
});

test('an error payload (ok:false with zero exit) also counts as a failed slice', async () => {
  const { run: base } = fakeRun();
  const run: RunFn = async (args) =>
    args[0] === 'market' && args[1] === 'portfolio-dex-history' ? { ok: false, msg: 'auth expired' } : base(args);
  const data = await getWalletData('0xwallet', 'ethereum', run);
  assert.deepEqual(data.dexHistory, []);
  assert.deepEqual(data.failed, ['dexHistory']);
});

test('all slices healthy → failed is empty', async () => {
  const { run } = fakeRun();
  const data = await getWalletData('0xwallet', 'ethereum', run);
  assert.deepEqual(data.failed, []);
});

test('a single failing price-info call does not sink the wallet view', async () => {
  const { run } = fakeRun({ throwOn: '0x2' }); // price-info for token 0x2 throws
  const data = await getWalletData('0xwallet', 'ethereum', run);
  assert.deepEqual(data.markets.map((m) => m.symbol), ['AAA']); // 0x2 dropped, rest intact
  assert.equal(data.balances.length, 2);
});
