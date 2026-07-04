// x402 payment gate (seller side) — required for A2MCP listing: the endpoint
// must answer unpaid agent calls with HTTP 402 + an x402 challenge, and serve
// calls that carry a signed payment authorization.
//
// ponytail: verification here is STRUCTURAL (recipient, amount, expiry, shape)
// — it does not recover the secp256k1 signature or settle on-chain. Accepted
// authorizations are logged (Railway logs) as the settlement record; on-chain
// redemption via a facilitator is the upgrade path once OKX exposes one
// seller-side. The web demo bypasses the gate via its own marker header.

export const PRICE_USDT = '0.30';
export const PRICE_ATOMIC = '300000'; // 0.30 × 10^6 (USDT has 6 decimals)
// Scope's Agentic Wallet (owner of ASP #3733) — where fees are paid.
export const PAY_TO = '0x8d8774caa0093c02488d5d404c99986ac2472f24';
// USD₮0 on X Layer (chainIndex 196) — CLI-verified canonical USDT, 6 decimals.
export const ASSET = '0x779ded0c9e1022225f8e0630b35a9b54be713736';
export const NETWORK = 'xlayer';

export interface Challenge {
  body: {
    x402Version: number;
    error: string;
    accepts: {
      scheme: string;
      network: string;
      maxAmountRequired: string;
      amount: string;
      asset: string;
      payTo: string;
      resource: string;
      description: string;
      mimeType: string;
      maxTimeoutSeconds: number;
      extra: { name: string; version: string };
    }[];
  };
  headerV2: string; // base64 of body — the x402 v2 PAYMENT-REQUIRED header value
}

export function buildChallenge(resource: string): Challenge {
  const body = {
    x402Version: 1,
    error: 'payment required',
    accepts: [
      {
        scheme: 'exact',
        network: NETWORK,
        maxAmountRequired: PRICE_ATOMIC,
        amount: PRICE_ATOMIC,
        asset: ASSET,
        payTo: PAY_TO,
        resource,
        description: `Scope wallet health & story report — ${PRICE_USDT} USDT per call`,
        mimeType: 'application/json',
        maxTimeoutSeconds: 300,
        // EIP-712 domain for the token's transferWithAuthorization (EIP-3009)
        extra: { name: 'USD₮0', version: '2' },
      },
    ],
  };
  return { body, headerV2: Buffer.from(JSON.stringify(body)).toString('base64') };
}

export interface PaymentCheck {
  ok: boolean;
  payer?: string;
  reason?: string;
}

// Structural verification of an x402 payment header (base64 JSON).
export function checkPayment(headerValue: string | undefined): PaymentCheck {
  if (!headerValue) return { ok: false, reason: 'no payment header' };
  let p: {
    payload?: { signature?: string; authorization?: { from?: string; to?: string; value?: string; validBefore?: string } };
  };
  try {
    p = JSON.parse(Buffer.from(headerValue, 'base64').toString('utf8'));
  } catch {
    return { ok: false, reason: 'payment header is not base64 JSON' };
  }
  const auth = p?.payload?.authorization;
  const sig = p?.payload?.signature;
  if (!auth || typeof sig !== 'string' || !/^0x[0-9a-fA-F]{130}$/.test(sig)) {
    return { ok: false, reason: 'missing or malformed signature/authorization' };
  }
  if (typeof auth.to !== 'string' || auth.to.toLowerCase() !== PAY_TO.toLowerCase()) {
    return { ok: false, reason: 'payment not addressed to this service' };
  }
  let value: bigint;
  try {
    value = BigInt(auth.value ?? '0');
  } catch {
    return { ok: false, reason: 'invalid amount' };
  }
  if (value < BigInt(PRICE_ATOMIC)) return { ok: false, reason: `underpayment: ${PRICE_USDT} USDT required` };
  const validBefore = Number(auth.validBefore ?? 0);
  if (!Number.isFinite(validBefore) || validBefore * 1000 <= Date.now()) {
    return { ok: false, reason: 'authorization expired' };
  }
  return { ok: true, payer: auth.from };
}
