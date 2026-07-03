import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, narrate } from './narrate.ts';
import type { WalletHealth } from '../analysis/assemble.ts';
import { DUST_DISCLAIMER } from '../analysis/dust.ts';

function health(overrides: Partial<WalletHealth> = {}): WalletHealth {
  return {
    concentration: { flagged: true, topToken: 'KNC', percentage: 78.73587430362635 },
    staleApprovals: [
      { spender: '0xspender', token: 'MOODENG', granted_at: '2024-10-07T03:36:47.000Z', unlimited: true, reason: 'unlimited-and-stale' },
    ],
    deadTokens: [{ token: 'OMG', liquidityUsd: 4692, volume24hUsd: 49, reason: 'illiquid-and-inactive' }],
    dust: [{ token: 'TITANX', usd_value: 1.9480462452514689, disclaimer: DUST_DISCLAIMER }],
    activity: {
      hasActivity: true, eventCount: 168, firstAt: '2025-12-01T00:00:00.000Z', lastAt: '2025-12-31T00:00:00.000Z',
      notable: [{ action: 'buy', token: 'CMD', valueUsd: 1029.7171407219093, at: '2025-12-15T00:00:00.000Z' }],
    },
    liquidity: { credibleTokens: 12, totalTokens: 2783, insufficient: false },
    holdings: [{ symbol: 'KNC', usdValue: 5000 }],
    ...overrides,
  };
}

// n stale approvals so we can check the digest caps the sample and reports a count
function manyApprovals(n: number): WalletHealth['staleApprovals'] {
  return Array.from({ length: n }, (_, i) => ({
    spender: '0xs' + i, token: 'TKN' + i, granted_at: '2023-01-01T00:00:00.000Z', unlimited: true, reason: 'unlimited-and-stale' as const,
  }));
}

test('buildPrompt embeds the computed facts and the hard constraints', () => {
  const p = buildPrompt(health());
  // facts present so the model narrates from them, never invents
  assert.match(p, /KNC/);
  assert.match(p, /OMG/);
  assert.match(p, /CMD/);
  // hard constraints from CLAUDE.md
  assert.match(p, /investment advice|buy|sell|predict/i);
  assert.match(p, /do not (invent|estimate|alter|make up)/i);
  // structured output contract
  assert.match(p, /health_summary/);
  assert.match(p, /activity_story/);
});

test('buildPrompt rounds numbers so the model never echoes float noise', () => {
  const p = buildPrompt(health());
  assert.match(p, /78\.7/); // rounded percentage
  assert.doesNotMatch(p, /78\.73587/); // raw precision must not reach the model
  assert.match(p, /1\.95/); // dust value rounded to cents
  assert.doesNotMatch(p, /1\.9480462/);
  assert.doesNotMatch(p, /1029\.717140/); // notable trade value rounded too
});

test('buildPrompt gives explicit counts and caps the sample so the model cannot miscount', () => {
  const p = buildPrompt(health({ staleApprovals: manyApprovals(45) }));
  assert.match(p, /45/); // the authoritative count is provided
  assert.match(p, /TKN0/); // sample includes the first few
  assert.doesNotMatch(p, /TKN20\b/); // but not all 45 — no enumeration to miscount
  assert.match(p, /do not (re-?count|enumerate|list every)/i);
});

test('buildPrompt instructs plain, non-technical language for a beginner', () => {
  const p = buildPrompt(health());
  assert.match(p, /beginner|everyday|no crypto|plain/i);
  assert.match(p, /jargon/i);
});

test('buildPrompt tells the model to state insufficient liquid holdings when the gate found nothing', () => {
  const p = buildPrompt(health({ liquidity: { credibleTokens: 0, totalTokens: 500, insufficient: true } }));
  assert.match(p, /enough easily-sellable holdings/i); // plain-language phrasing of the insufficient case
});

test('narrate parses the model JSON into two prose blocks', async () => {
  const callLLM = async () => JSON.stringify({ health_summary: 'One token dominates.', activity_story: 'Busy month.' });
  const r = await narrate(health(), callLLM);
  assert.equal(r.health_summary, 'One token dominates.');
  assert.equal(r.activity_story, 'Busy month.');
});

test('narrate tolerates a markdown-fenced JSON reply', async () => {
  const callLLM = async () => '```json\n{"health_summary":"H","activity_story":"A"}\n```';
  const r = await narrate(health(), callLLM);
  assert.deepEqual(r, { health_summary: 'H', activity_story: 'A' });
});

test('narrate throws on unparseable model output (caller degrades to facts-only)', async () => {
  const callLLM = async () => 'the model rambled without JSON';
  await assert.rejects(() => narrate(health(), callLLM));
});
