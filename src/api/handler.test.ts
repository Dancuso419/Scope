import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAnalyze } from './handler.ts';
import type { RunFn } from '../data/wallet.ts';
import type { LLMFn } from '../narration/narrate.ts';

const emptyOk: RunFn = async () => ({ ok: true, data: [] });
const allFail: RunFn = async () => ({ ok: false });
const okLLM: LLMFn = async () => JSON.stringify({ health_summary: 'HS', activity_story: 'AS' });

test('rejects non-POST with 405', async () => {
  const r = await handleAnalyze('GET', {}, emptyOk, okLLM);
  assert.equal(r.status, 405);
});

test('valid POST returns 200 with the TRD §6 body', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, emptyOk, okLLM);
  assert.equal(r.status, 200);
  const body = r.body as { wallet_address: string; health_summary: string | null };
  assert.equal(body.wallet_address, '0xabc');
  assert.equal(body.health_summary, 'HS');
});

test('bad request (unsupported chain) maps to 400', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc', chain: 'solana' }, emptyOk, okLLM);
  assert.equal(r.status, 400);
  assert.match((r.body as { error: string }).error, /chain/);
});

test('missing wallet_address maps to 400', async () => {
  const r = await handleAnalyze('POST', {}, emptyOk, okLLM);
  assert.equal(r.status, 400);
});

test('upstream data failure maps to 502, not a clean-looking 200', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, allFail, okLLM);
  assert.equal(r.status, 502);
});
