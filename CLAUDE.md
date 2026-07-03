# CLAUDE.md

## Project
Scope — Wallet Health & Story Agent Service Provider (ASP) for the OKX AI Genesis Hackathon.

See `PRD.md` for product rationale and scope, and `TRD.md` for technical architecture and implementation details. Read both before starting work.

---

## Mandatory First Step: Skill Discovery

Before writing any code, creating any file, or making any implementation decision, scan all available skills and identify the best-fit skill(s) for the task at hand. Do not proceed on assumption or default patterns if a more specific, relevant skill is available — check first, every time.

This applies at the start of the project and again at the start of each new sub-task, since different parts of this build (data integration, API endpoint, front-end UI, deployment, documentation) may call for different skills. Re-check rather than relying on a skill scan done earlier in the session for an unrelated task.

If multiple skills seem partially relevant, read all of them before deciding — do not stop at the first plausible match.

If no specific skill applies to a given task, proceed using general best practice, but state that no matching skill was found rather than silently skipping the check.

---

## Project Context

- **What this is**: an A2MCP (Agent-to-MCP) service registered on the OKX.AI marketplace. Fixed price per call, standardized request/response, no negotiation or escrow.
- **Core function**: given a wallet address, return a Health Check (concentration risk, stale approvals, dead/illiquid tokens, value-only dust detection) and an Activity Story (plain-English narrated timeline).
- **Hard constraint**: the Analysis Layer (all numeric/rule-based logic) must be deterministic, non-LLM code. The Narration Layer (Gemini API) only converts already-computed facts into plain English — it never generates or estimates numbers itself.
- **Hard constraint**: any dust-flagged token in the output must include the mandatory disclaimer text (value-only estimate, does not account for gas cost, liquidity, or spam/airdrop origin).
- **Hard constraint**: no investment advice, price predictions, or buy/sell language anywhere in generated narration.

## Tech Stack (do not deviate without discussion)

- Node.js + TypeScript
- Hosting: Vercel (Railway as fallback only if a Vercel limitation is hit)
- On-chain data: OKX Onchain OS
- Narration LLM: Gemini API
- Payments: OKX Payment SDK

## Working Style

- Flag open questions from the PRD/TRD (e.g., exact thresholds, data availability gaps) as they're hit during implementation rather than guessing silently — surface them for a decision.
- Keep the Analysis Layer and Narration Layer clearly separated in code structure, not intermixed, so it's always clear which layer produced which part of the output.
- Build toward the API contract defined in `TRD.md` Section 6 — keep the response shape stable once implemented, since consistency matters for the "reliability" judging criterion.
- Prioritize a working, narrow v1 over expanding scope — dust detection is value-only for v1, gas-cost/spam-detection layers are explicitly out of scope.
- The demo web UI should call the real deployed endpoint, not a mocked/separate code path.

## Installation & Dependency Rule (mandatory)

Before installing, adding, or configuring **any** file, package, SDK, API, library, CLI tool, or external service — including but not limited to Onchain OS, the Gemini API, the OKX Payment SDK, any price-data source, or any npm package not already present in the project — stop and ask the user first. Do not assume a package name, version, install command, or configuration approach and proceed on that assumption.

Specifically, for each new dependency:
- State what it is and why it's needed for the current task
- Propose the specific package/SDK/API and install command
- Wait for explicit confirmation before running the install or writing config/env variables for it

This applies even if the TRD names a specific tool (e.g., "Onchain OS," "Gemini API") — the TRD says *what* to use at a high level, but the exact package, install method, version, and configuration must still be confirmed with the user before installing, since these details can change or may need the user's own account setup first.

Never silently substitute a different tool or library because the originally intended one seems hard to find, deprecated, or unclear — surface that problem to the user instead of picking a replacement unilaterally.

## Deadline Context

Submission form deadline: July 17, 00:00 UTC. Listing review takes ~24 hours after registration, so the endpoint needs to be feature-complete and stable well before the hard deadline — build with that buffer in mind rather than treating July 17 as the working deadline.
