import type { WalletHealth } from '../analysis/assemble.ts';
import { round1, round2 } from '../analysis/num.ts';

// How many items to name in each list. The rest is summarised by count — an
// exhaustive list invites the model to re-count and hallucinate a total.
const SAMPLE_CAP = 5;

// The Narration Layer: converts already-computed facts into plain English. It
// NEVER produces numbers itself (CLAUDE.md hard constraint) — the transport is
// injected so this layer is testable without hitting Gemini.
export type LLMFn = (prompt: string) => Promise<string>;

export interface Narration {
  health_summary: string;
  activity_story: string;
}

// Compact, LLM-friendly digest of the deterministic facts. Every number is
// pre-rounded (narration must not do arithmetic) and every list is reduced to
// an authoritative count + a small sample, so the model summarises rather than
// enumerating (which is where it miscounts). Only these values may appear in
// the prose — the prompt forbids inventing anything else.
function factsDigest(h: WalletHealth) {
  return {
    concentration: {
      one_token_dominates: h.concentration.flagged,
      top_token: h.concentration.topToken,
      top_token_percentage: round1(h.concentration.percentage),
    },
    liquid_holdings_insufficient: h.liquidity.insufficient,
    stale_approvals: {
      count: h.staleApprovals.length,
      sample: h.staleApprovals.slice(0, SAMPLE_CAP).map((a) => ({ token: a.token, granted_at: a.granted_at, reason: a.reason })),
    },
    dead_or_illiquid_tokens: {
      count: h.deadTokens.length,
      sample: h.deadTokens.slice(0, SAMPLE_CAP).map((d) => ({ token: d.token, reason: d.reason })),
    },
    dust_tokens: {
      count: h.dust.length,
      sample: h.dust.slice(0, SAMPLE_CAP).map((d) => ({ token: d.token, usd_value: round2(d.usd_value) })),
    },
    activity: {
      event_count: h.activity.eventCount,
      first_at: h.activity.firstAt,
      last_at: h.activity.lastAt,
      notable: h.activity.notable.map((n) => ({ action: n.action, token: n.token, usd_value: round2(n.valueUsd), at: n.at })),
    },
  };
}

export function buildPrompt(h: WalletHealth, chains: string[] = []): string {
  const digest = { ...factsDigest(h), chains_scanned: chains };
  const facts = JSON.stringify(digest, null, 2);
  const multi = chains.length > 1
    ? `\n- This report combines ${chains.length} blockchains (${chains.join(', ')}). Briefly mention it covers the wallet across these chains; don't repeat the list more than once.`
    : '';
  return `You are explaining a crypto wallet's health to an everyday person with NO crypto or finance background. Turn the FACTS below into two short, plain-English sections: a Health Summary and an Activity Story.${multi}

WHO YOU'RE WRITING FOR:
- A complete beginner. Use simple, everyday words and short sentences.
- Avoid jargon. When a term is unavoidable, explain it in a few plain words the first time — e.g. an "approval" is permission the wallet gave an app to move its tokens; "liquidity" is how easily a token can be sold.
- Say what each finding means for this person and why it matters, calmly and clearly — no scare tactics, no hype.

HARD RULES — follow exactly:
- Use ONLY the numbers, dates, tokens, and counts present in FACTS. Do not invent, estimate, alter, or make up any figure.
- For quantities, use the provided "count" fields verbatim. Do NOT re-count, enumerate, or list every item — name only the tokens in each "sample" and refer to the rest by the count (e.g. "45 old permissions, including MOODENG and BITE").
- Do NOT give investment advice, price predictions, or any buy / sell / hold language.
- No emojis, no marketing tone. A few short sentences per section.
- If "liquid_holdings_insufficient" is true, just say there aren't enough easily-sellable holdings to judge whether the wallet is over-concentrated, and don't give a concentration percentage.
- If a section has no data (a count of 0, or no activity), say so simply in one line.

FACTS:
${facts}

Respond with STRICT JSON and nothing else, in this exact shape:
{"health_summary": "string", "activity_story": "string"}`;
}

// Strip a ```json ... ``` fence if the model wrapped its reply in one.
function stripFence(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return (fenced ? fenced[1] : text).trim();
}

export async function narrate(h: WalletHealth, callLLM: LLMFn, chains: string[] = []): Promise<Narration> {
  const raw = await callLLM(buildPrompt(h, chains));
  const parsed = JSON.parse(stripFence(raw)) as Partial<Narration>;
  if (typeof parsed.health_summary !== 'string' || typeof parsed.activity_story !== 'string') {
    throw new Error('narration response missing health_summary/activity_story');
  }
  return { health_summary: parsed.health_summary, activity_story: parsed.activity_story };
}
