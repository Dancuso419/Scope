import { analyzeWallet, BadRequestError, UpstreamError, type AnalyzeRequest } from './analyze.ts';
import { runOnchainos } from '../data/transport.ts';
import { callGemini } from '../narration/gemini.ts';
import type { RunFn } from '../data/wallet.ts';
import type { LLMFn } from '../narration/narrate.ts';

export interface HttpResult {
  status: number;
  body: unknown;
}

// Transport-agnostic core of the endpoint: turns an HTTP method + parsed body
// into a status + JSON body. Transports are injected (defaulted to the real
// ones) so the status-code mapping is unit-testable without spawning the CLI or
// calling Gemini. The thin Vercel adapter in /api/analyze.ts wires req/res to this.
export async function handleAnalyze(
  method: string | undefined,
  body: unknown,
  run: RunFn = runOnchainos,
  callLLM: LLMFn = callGemini,
): Promise<HttpResult> {
  if (method !== 'POST') {
    return { status: 405, body: { error: 'method not allowed — use POST' } };
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
