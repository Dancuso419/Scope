import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChallenge, checkPayment, PRICE_ATOMIC, PAY_TO } from './paywall.ts';

const RESOURCE = 'https://scope-production-b104.up.railway.app/api/analyze';

function validPayment(overrides: Record<string, unknown> = {}) {
  return {
    x402Version: 1,
    scheme: 'exact',
    network: 'xlayer',
    payload: {
      signature: '0x' + 'ab'.repeat(65),
      authorization: {
        from: '0x1111111111111111111111111111111111111111',
        to: PAY_TO,
        value: PRICE_ATOMIC,
        validAfter: '0',
        validBefore: String(Math.floor(Date.now() / 1000) + 300),
        nonce: '0x' + '11'.repeat(32),
        ...overrides,
      },
    },
  };
}
const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64');

test('challenge carries the x402 v1 body shape and a v2 header', () => {
  const c = buildChallenge(RESOURCE);
  assert.equal(c.body.x402Version, 1);
  const a = c.body.accepts[0];
  assert.equal(a.scheme, 'exact');
  assert.equal(a.network, 'xlayer');
  assert.equal(a.maxAmountRequired, PRICE_ATOMIC);
  assert.equal(a.payTo, PAY_TO);
  assert.equal(a.resource, RESOURCE);
  assert.match(a.asset, /^0x[0-9a-fA-F]{40}$/);
  // v2 header is base64 of the same challenge
  const decoded = JSON.parse(Buffer.from(c.headerV2, 'base64').toString());
  assert.equal(decoded.accepts[0].payTo, PAY_TO);
});

test('accepts a structurally valid payment authorization', () => {
  const r = checkPayment(enc(validPayment()));
  assert.equal(r.ok, true);
  assert.equal(r.payer, '0x1111111111111111111111111111111111111111');
});

test('rejects: wrong recipient, underpayment, expired, garbage', () => {
  assert.equal(checkPayment(enc(validPayment({ to: '0x' + '99'.repeat(20) }))).ok, false);
  assert.equal(checkPayment(enc(validPayment({ value: '299999' }))).ok, false);
  assert.equal(checkPayment(enc(validPayment({ validBefore: '1000' }))).ok, false);
  assert.equal(checkPayment('not-base64-json').ok, false);
  assert.equal(checkPayment(undefined).ok, false);
});
