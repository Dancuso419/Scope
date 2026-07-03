import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildResponse, analyzeWallet, BadRequestError, UpstreamError } from './analyze.ts';
import { DUST_DISCLAIMER } from '../analysis/dust.ts';
import type { WalletHealth } from '../analysis/assemble.ts';
import type { RunFn } from '../data/wallet.ts';

const now = Date.UTC(2026, 0, 2, 3, 4, 5);

function health(overrides: Partial<WalletHealth> = {}): WalletHealth {
  return {
    concentration: { flagged: true, topToken: 'ETH', percentage: 82.54321 },
    staleApprovals: [
      { spender: '0xspender', token: 'USDC', granted_at: '2020-01-01T00:00:00.000Z', unlimited: true, reason: 'unlimited-and-stale' },
    ],
    deadTokens: [
      { token: 'OMG', liquidityUsd: 4692, volume24hUsd: 49, reason: 'illiquid-and-inactive' },
    ],
    dust: [{ token: 'CRUMB', usd_value: 1.949867223502011, disclaimer: DUST_DISCLAIMER }],
    activity: { hasActivity: true, eventCount: 3, firstAt: '2025-12-01T00:00:00.000Z', lastAt: '2025-12-31T00:00:00.000Z', notable: [{ action: 'buy', token: 'CMD', valueUsd: 1029.7171407219093, at: '2025-12-15T00:00:00.000Z' }] },
    liquidity: { credibleTokens: 5, totalTokens: 100, insufficient: false },
    holdings: [{ symbol: 'ETH', usdValue: 8000 }, { symbol: 'KNC', usdValue: 2000 }],
    ...overrides,
  };
}

// stub transports
const emptyOk: RunFn = async () => ({ ok: true, data: [] });
const allFail: RunFn = async () => ({ ok: false });

// canned narration transport: returns valid two-block JSON
const okLLM = async () => JSON.stringify({ health_summary: 'HS', activity_story: 'AS' });

test('maps WalletHealth to the TRD §6 response shape', () => {
  const r = buildResponse('0xWALLET', 'ethereum', health(), now, []);

  assert.equal(r.wallet_address, '0xWALLET');
  assert.equal(r.chain, 'ethereum');
  assert.equal(r.generated_at, new Date(now).toISOString());

  // concentration_risk — percentage rounded to 1 decimal (narration must never
  // touch numbers, so the wire carries presentation-ready precision)
  assert.deepEqual(r.health_check.concentration_risk, {
    flagged: true, top_token: 'ETH', percentage: 82.5, summary: null,
  });

  // stale_approvals — spender→contract, granted_at retained (grant time, not last-used)
  assert.equal(r.health_check.stale_approvals.length, 1);
  assert.deepEqual(r.health_check.stale_approvals[0], {
    contract: '0xspender', token: 'USDC', granted_at: '2020-01-01T00:00:00.000Z', summary: null,
  });

  // dead_tokens — token + null summary only (liquidity detail feeds narration, not the wire)
  assert.deepEqual(r.health_check.dead_tokens, [{ token: 'OMG', summary: null }]);

  // dust — usd_value rounded to cents, mandatory disclaimer intact
  assert.equal(r.health_check.dust[0].disclaimer, DUST_DISCLAIMER);
  assert.equal(r.health_check.dust[0].usd_value, 1.95);

  // narration placeholders (filled by the narration layer) + no warnings
  assert.equal(r.health_summary, null);
  assert.equal(r.activity_story, null);
  assert.deepEqual(r.warnings, []);
});

test('response carries a holdings breakdown (share %) and structured activity for the charts', () => {
  const r = buildResponse('0xW', 'ethereum', health(), now, []);
  // holdings: top tokens by value, share = % of total
  assert.equal(r.holdings[0].token, 'ETH');
  assert.equal(r.holdings[0].share, 80); // 8000 / 10000
  assert.equal(r.holdings[1].token, 'KNC');
  assert.equal(r.holdings[1].share, 20);
  // structured activity for the timeline infographic (rounded)
  assert.equal(r.activity.event_count, 3);
  assert.equal(r.activity.notable[0].token, 'CMD');
  assert.equal(r.activity.notable[0].usd_value, 1029.72);
});

test('validation: missing wallet_address throws BadRequestError', async () => {
  await assert.rejects(() => analyzeWallet({} as never, allFail, now), BadRequestError);
  await assert.rejects(() => analyzeWallet({ wallet_address: '   ' }, allFail, now), BadRequestError);
});

test('validation: unsupported chain throws BadRequestError (v1 is ethereum-only)', async () => {
  await assert.rejects(() => analyzeWallet({ wallet_address: '0xabc', chain: 'solana' }, emptyOk, now), BadRequestError);
});

test('a failed balances fetch throws UpstreamError instead of a clean-looking empty report', async () => {
  // paid service: "all clear" on a wallet we couldn't actually read is worse than an error
  await assert.rejects(() => analyzeWallet({ wallet_address: '0xabc' }, allFail, now), UpstreamError);
});

test('partial slice failure degrades with a warning naming the missing slice', async () => {
  const run: RunFn = async (args) => (args[0] === 'security' ? { ok: false } : { ok: true, data: [] });
  const r = await analyzeWallet({ wallet_address: '0xabc' }, run, now);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /approvals/);
});

test('narration fills health_summary + activity_story when a callLLM is provided', async () => {
  const r = await analyzeWallet({ wallet_address: '0xabc' }, emptyOk, now, okLLM);
  assert.equal(r.health_summary, 'HS');
  assert.equal(r.activity_story, 'AS');
  assert.deepEqual(r.warnings, []);
});

test('a failing narration degrades to facts-only with a warning — the paid facts still return', async () => {
  const badLLM = async () => { throw new Error('gemini down'); };
  const r = await analyzeWallet({ wallet_address: '0xabc' }, emptyOk, now, badLLM);
  assert.equal(r.health_summary, null);
  assert.equal(r.activity_story, null);
  assert.equal(r.health_check.concentration_risk.flagged, false); // facts intact
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /narrat/i);
});

test('glue: defaults chain to ethereum and returns a well-formed response on an empty wallet', async () => {
  const r = await analyzeWallet({ wallet_address: '0xabc' }, emptyOk, now);
  assert.equal(r.chain, 'ethereum');
  assert.equal(r.wallet_address, '0xabc');
  assert.equal(r.health_check.concentration_risk.flagged, false);
  assert.deepEqual(r.health_check.dust, []);
  assert.equal(r.activity_story, null);
  assert.deepEqual(r.warnings, []);
});
