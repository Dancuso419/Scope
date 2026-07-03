# Technical Requirements Document (TRD)

## Product Name
Scope — Wallet Health & Story Agent Service Provider

## Related Document
See `PRD.md` for product rationale, scope, and success criteria. This document covers implementation.

---

## 1. Architecture Overview

```
[Calling Agent / Demo UI]
          |
          v
   [A2MCP Endpoint]  <-- fixed price per call, registered on OKX.AI
          |
          v
   [Request Handler] -- validates wallet address + optional chain param
          |
          v
   [Data Layer] -- fetches on-chain data via Onchain OS
          |
          v
   [Analysis Layer] -- deterministic, non-LLM computation
          |          (concentration %, stale approvals, dead tokens, dust)
          v
   [Narration Layer] -- Gemini API call, converts facts -> plain English
          |
          v
   [Response Formatter] -- structured JSON (health check + story)
          |
          v
   [Payment Settlement] -- OKX Payment SDK, pay-per-call
          |
          v
      Response returned
```

Two consumers of the same backend:
- **A2MCP endpoint** — the real ASP, called by agents/OKX marketplace infra
- **Demo Web UI** — thin front end calling the same endpoint, for the hackathon video

---

## 2. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Language/runtime | Node.js + TypeScript | Fits Onchain OS tooling and A2MCP examples most naturally |
| Hosting | Vercel | Fastest path to a public URL, free tier sufficient for hackathon scale; Railway as fallback if a limitation is hit |
| On-chain data | OKX Onchain OS (`npx skills add okx/onchainos-skills`) | Already required for ASP registration; avoids a second data dependency |
| Narration LLM | Gemini API | Free-tier friendly; used only for the narration layer, not for any computed numbers |
| Agent runtime (build/dev tool) | Claude Code | Used to build the project; unrelated to which LLM powers the live narration layer |
| Payments | OKX Payment SDK | Required for A2MCP registration; handles pay-per-call settlement |
| Price data (for dust detection) | OKX market data (preferred) or CoinGecko free tier (fallback) | Needed to compute USD value of small balances |

---

## 3. Data Requirements

To build the Health Check and Activity Story, the following data must be retrieved per wallet address:

1. **Token balances** — all tokens currently held, with quantities
2. **Token prices** — current USD price per held token (for concentration % and dust calculation)
3. **Transaction history** — chronological list of transfers, swaps, and other meaningful on-chain events
4. **Token approval history** — which contracts have been granted spending approval, and when they were last used
5. **Basic liquidity/activity signal per token** — used to flag "dead/illiquid" tokens (e.g., no trades in a defined window)

**Open item:** confirm which of these Onchain OS exposes natively vs. which require a supplementary source (flagged in PRD Open Questions). This must be resolved early in the build, since it affects the Data Layer implementation directly.

---

## 4. Analysis Layer (deterministic, non-LLM)

All numeric/rule-based logic lives here — the LLM never computes numbers, only narrates results already computed in code.

### 4.1 Concentration Risk
- Compute % of total portfolio USD value held in each token
- Flag if any single token exceeds a defined threshold (e.g., 70% of total value) — exact threshold to be finalized during build

### 4.2 Stale Approvals
- List all active token approvals
- Flag any approval not used within a defined lookback window (e.g., 6 months) — exact window to be finalized during build

### 4.3 Dead/Illiquid Tokens
- Flag tokens with no meaningful trading activity within a defined lookback window

### 4.4 Dust Detection (value-only, v1)
- Compute USD value = balance × current price, per token
- Flag any token below a defined threshold (e.g., under $2)
- **Must attach a disclaimer field** to every dust-flagged token in the output: this check does not account for gas cost to move the asset, liquidity depth, or spam/airdrop origin, and should not be fully relied on

### 4.5 Activity Timeline Construction
- Build a chronological list of meaningful events (large transfers, swaps, first/last activity) from transaction history
- Filter out noise (e.g., negligible dust transfers) so the timeline stays readable
- Define an explicit fallback structure for wallets with very little activity, so output is never empty or broken

---

## 5. Narration Layer

- Input: structured JSON output from the Analysis Layer
- Call: single Gemini API request per wallet analysis, prompted to convert facts into plain English across two sections (Health Check summary, Activity Story)
- Constraints on prompt design:
  - No investment advice, no price predictions, no buy/sell language
  - Must explicitly include the dust disclaimer text when dust is present in the input
  - Must handle sparse/empty-activity input gracefully with a defined fallback tone, not an awkward or broken response
- Output: plain text narration blocks, inserted into the final structured response alongside the raw computed fields

---

## 6. API Contract (A2MCP Endpoint)

### Request
```json
{
  "wallet_address": "string, required",
  "chain": "string, optional (defaults to primary supported chain)"
}
```

### Response
```json
{
  "wallet_address": "string",
  "chain": "string",
  "health_check": {
    "concentration_risk": {
      "flagged": "boolean",
      "top_token": "string",
      "percentage": "number",
      "summary": "string (plain English)"
    },
    "stale_approvals": [
      {
        "contract": "string",
        "last_used": "date or null",
        "summary": "string (plain English)"
      }
    ],
    "dead_tokens": [
      {
        "token": "string",
        "summary": "string (plain English)"
      }
    ],
    "dust": [
      {
        "token": "string",
        "usd_value": "number",
        "disclaimer": "string (mandatory, static or near-static text)"
      }
    ]
  },
  "activity_story": "string (plain English narrative)",
  "generated_at": "timestamp"
}
```

Exact field names to be finalized during implementation, but the shape (health_check object + activity_story string) should remain stable, since consistency here is part of the "reliability" judging criterion.

---

## 7. A2MCP Registration Requirements

Per OKX's ASP tutorial, registration requires:
1. Onchain OS installed and Agentic Wallet set up (email-based login)
2. Service registered as A2MCP with: service name ("Scope"), description, fixed price per call, and a live public endpoint URL
3. Submission for listing review (~24 hour turnaround) — must be done with buffer before the July 17 deadline
4. Once approved, the endpoint must remain live and reachable for the duration of judging

---

## 8. Demo Web UI Requirements

- Single page: input field for wallet address → submit → loading state → results
- Results display: Health Check card (with dust items visibly paired with disclaimer, not buried) + Activity Story section
- Should call the same live A2MCP endpoint, not a separate/mocked code path, so the demo reflects the real product
- Needs at least two prepared test wallets: one with rich activity (for a compelling story), one sparse/boring (to confirm the fallback narrative works and doesn't look broken)

---

## 9. Environment & Secrets

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Narration layer LLM calls |
| `ONCHAIN_OS_CONFIG` / relevant Onchain OS credentials | On-chain data access |
| `OKX_PAYMENT_SDK_KEY` (or equivalent) | Payment settlement for A2MCP calls |
| Price data API key (if CoinGecko fallback used) | Dust/concentration USD value calculation |

All secrets managed via Vercel environment variables, never committed to source control.

---

## 10. Build Milestones

1. **Onchain OS integration** — confirm data availability (balances, approvals, tx history, pricing); resolve Open Question from PRD
2. **Analysis Layer** — implement concentration, stale approvals, dead tokens, dust (value-only) as pure functions with unit-testable output
3. **Narration Layer** — Gemini integration, prompt design, disclaimer + fallback handling
4. **API endpoint** — request handling, response formatting, deployed to Vercel
5. **A2MCP registration** — register service, submit for listing (build in buffer before deadline for the ~24hr review)
6. **Demo UI** — thin front end calling the live endpoint
7. **Test wallets + demo recording** — validate rich-activity and sparse-activity cases, record ≤90 second demo video

---

## 11. Known Risks (technical)

- **Onchain OS data gaps**: if approval history or pricing isn't natively available, a supplementary source must be integrated, adding time
- **Gemini output consistency**: narration must reliably follow the required structure/disclaimers across varied inputs — needs prompt testing across edge cases (rich wallet, sparse wallet, dust-heavy wallet)
- **Listing review turnaround**: ~24 hour approval window means the endpoint must be feature-complete and stable well before the hard deadline, not built up to the last minute
- **Endpoint uptime during judging**: Vercel free tier should be sufficient at this scale, but must confirm no cold-start or rate-limit issues would make the service look unreliable during a live judge test call
