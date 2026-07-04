import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { startServer } from './server.ts';

// Boot on an ephemeral port. Every path checked here resolves BEFORE any
// transport call (health, routing, body-parse, validation), so no CLI/Gemini.
const server = await startServer(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
after(() => server.close());

test('GET / serves the demo UI (HTML) → 200', async () => {
  const r = await fetch(`${base}/`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/html/);
  assert.match(await r.text(), /scope/i);
});

test('GET /health is the JSON health check → 200', async () => {
  const r = await fetch(`${base}/health`);
  assert.equal(r.status, 200);
  assert.equal((await r.json() as { status: string }).status, 'ok');
});

test('GET the self-hosted font → 200 woff2', async () => {
  const r = await fetch(`${base}/fonts/space-grotesk.woff2`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /font\/woff2/);
});

test('unknown route → 404', async () => {
  const r = await fetch(`${base}/nope`);
  assert.equal(r.status, 404);
});

test('GET on the analyze route → 405 (POST only)', async () => {
  const r = await fetch(`${base}/api/analyze`);
  assert.equal(r.status, 405);
});

test('malformed JSON body → 400', async () => {
  const r = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  assert.equal(r.status, 400);
});

test('missing wallet_address → 400 (validation, before any fetch; demo path)', async () => {
  const r = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-scope-demo': '1' }, body: '{}' });
  assert.equal(r.status, 400);
});

test('non-demo POST without payment → 402 with x402 challenge over real HTTP', async () => {
  const r = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"wallet_address":"0xabc"}' });
  assert.equal(r.status, 402);
  assert.ok(r.headers.get('payment-required')); // v2 challenge header
  const body = await r.json() as { x402Version: number };
  assert.equal(body.x402Version, 1);
});

test('oversized body is rejected → 413', async () => {
  const r = await fetch(`${base}/api/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(5000) });
  assert.equal(r.status, 413);
});
