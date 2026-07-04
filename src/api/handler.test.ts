import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleAnalyze } from './handler.ts';
import { PRICE_ATOMIC, PAY_TO } from './paywall.ts';
import type { RunFn } from '../data/wallet.ts';
import type { LLMFn } from '../narration/narrate.ts';

const emptyOk: RunFn = async () => ({ ok: true, data: [] });
const allFail: RunFn = async () => ({ ok: false });
const okLLM: LLMFn = async () => JSON.stringify({ health_summary: 'HS', activity_story: 'AS' });
const DEMO = { 'x-scope-demo': '1' }; // web demo marker → free path

function paidHeader() {
  return {
    'x-payment': Buffer.from(JSON.stringify({
      x402Version: 1, scheme: 'exact', network: 'xlayer',
      payload: {
        signature: '0x' + 'ab'.repeat(65),
        authorization: {
          from: '0x1111111111111111111111111111111111111111', to: PAY_TO,
          value: PRICE_ATOMIC, validAfter: '0',
          validBefore: String(Math.floor(Date.now() / 1000) + 300),
          nonce: '0x' + '11'.repeat(32),
        },
      },
    })).toString('base64'),
  };
}

test('rejects non-POST with 405', async () => {
  const r = await handleAnalyze('GET', {}, DEMO, emptyOk, okLLM);
  assert.equal(r.status, 405);
});

test('demo (web UI) POST is free and returns 200 with the TRD §6 body', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, DEMO, emptyOk, okLLM);
  assert.equal(r.status, 200);
  const body = r.body as { wallet_address: string; health_summary: string | null };
  assert.equal(body.wallet_address, '0xabc');
  assert.equal(body.health_summary, 'HS');
});

test('agent POST without payment → 402 with x402 challenge (body + PAYMENT-REQUIRED header)', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, {}, emptyOk, okLLM);
  assert.equal(r.status, 402);
  const body = r.body as { x402Version: number; accepts: { payTo: string }[] };
  assert.equal(body.x402Version, 1);
  assert.equal(body.accepts[0].payTo, PAY_TO);
  assert.ok(r.headers && r.headers['PAYMENT-REQUIRED']); // v2 header present
});

test('agent POST with a valid payment authorization is served', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, paidHeader(), emptyOk, okLLM);
  assert.equal(r.status, 200);
});

test('agent POST with a bad payment (wrong recipient) → 402 again', async () => {
  const h = paidHeader();
  const tampered = JSON.parse(Buffer.from(h['x-payment'], 'base64').toString());
  tampered.payload.authorization.to = '0x' + '99'.repeat(20);
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, { 'x-payment': Buffer.from(JSON.stringify(tampered)).toString('base64') }, emptyOk, okLLM);
  assert.equal(r.status, 402);
});

test('bad request (unsupported chain) maps to 400', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc', chain: 'solana' }, DEMO, emptyOk, okLLM);
  assert.equal(r.status, 400);
  assert.match((r.body as { error: string }).error, /chain/);
});

test('missing wallet_address maps to 400', async () => {
  const r = await handleAnalyze('POST', {}, DEMO, emptyOk, okLLM);
  assert.equal(r.status, 400);
});

test('upstream data failure maps to 502, not a clean-looking 200', async () => {
  const r = await handleAnalyze('POST', { wallet_address: '0xabc' }, DEMO, allFail, okLLM);
  assert.equal(r.status, 502);
});
