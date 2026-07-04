import { analyzeWallet, BadRequestError, UpstreamError, type AnalyzeRequest } from './analyze.ts';
import { buildChallenge, checkPayment, PRICE_USDT } from './paywall.ts';
import { runOnchainos } from '../data/transport.ts';
import { callGemini } from '../narration/gemini.ts';
import type { RunFn } from '../data/wallet.ts';
import type { LLMFn } from '../narration/narrate.ts';

export interface HttpResult {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

const RESOURCE = 'https://scope-production-b104.up.railway.app/api/analyze';

// Web demo marker: the bundled UI sends this header, agents don't. The demo is
// a free showcase; agent traffic is metered via x402.
// ponytail: spoofable by design — an agent could set the header and scan free.
// Acceptable for v1 (the demo must stay free and same-origin checks are equally
// spoofable); tighten with a signed token if freeloading ever shows up in logs.
const DEMO_HEADER = 'x-scope-demo';

// Transport-agnostic core of the endpoint: HTTP method + parsed body + headers
// in, status + JSON body (+ headers) out. Transports injected so the mapping is
// unit-testable without spawning the CLI or calling Gemini.
export async function handleAnalyze(
  method: string | undefined,
  body: unknown,
  reqHeaders: Record<string, string | string[] | undefined> = {},
  run: RunFn = runOnchainos,
  callLLM: LLMFn = callGemini,
): Promise<HttpResult> {
  if (method !== 'POST') {
    return { status: 405, body: { error: 'method not allowed — use POST' } };
  }

  // x402 gate (A2MCP listing requirement): agents pay per call, the web demo is free.
  const isDemo = reqHeaders[DEMO_HEADER] != null;
  if (!isDemo) {
    const paymentHeader = reqHeaders['x-payment'] ?? reqHeaders['payment-signature'];
    const raw = Array.isArray(paymentHeader) ? paymentHeader[0] : paymentHeader;
    const challenge = buildChallenge(RESOURCE);
    if (!raw) {
      return {
        status: 402,
        body: challenge.body,
        headers: { 'PAYMENT-REQUIRED': challenge.headerV2 },
      };
    }
    const check = checkPayment(raw);
    if (!check.ok) {
      return {
        status: 402,
        body: { ...challenge.body, error: check.reason },
        headers: { 'PAYMENT-REQUIRED': challenge.headerV2 },
      };
    }
    // Settlement record: the signed authorization is the claim on the funds.
    console.log(`[x402] accepted payment authorization: payer=${check.payer} amount=${PRICE_USDT} USDT`);
  }

  try {
    const result = await analyzeWallet((body ?? {}) as AnalyzeRequest, run, Date.now(), callLLM);
    return { status: 200, body: result };
  } catch (e) {
    if (e instanceof BadRequestError) return { status: 400, body: { error: e.message } };
    // Upstream data source failed on the core slice — never a clean-looking 200.
    if (e instanceof UpstreamError) return { status: 502, body: { error: e.message } };
    // ponytail: last-resort net. The stack below is defensively wrapped, so this
    // is genuinely hard to reach — trivial one-liner, no dedicated test.
    return { status: 500, body: { error: 'internal error' } };
  }
}
