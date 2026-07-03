# Product Requirements Document (PRD)

## Product Name
Scope — Wallet Health & Story Agent Service Provider

## Overview
Scope is an Agent Service Provider (ASP) built for the OKX AI Genesis Hackathon. It is registered as an A2MCP (Agent-to-MCP) service on the OKX.AI marketplace. Given a wallet address, it returns two things in plain English: a **Health Check** (concentration risk, stale token approvals, dead/illiquid tokens, dust) and an **Activity Story** (a narrated timeline of what the wallet has done over time). It is aimed at non-expert holders who want to understand their own wallet without needing to interpret raw on-chain data themselves.

## Problem Statement
People who hold crypto — especially casual or first-time holders — often cannot easily understand what they actually own, what risks exist in their wallet, or what has happened in it over time. Existing OKX AI marketplace services focus on security scoring (CertiK) and raw market data (CoinAnk), but nothing translates wallet activity into plain, non-technical language for the person who actually owns the wallet.

## Target Users
- Individuals who hold crypto but are not active traders or technical users
- Small holders who received/bought tokens and lost track of their portfolio
- Other agents on the OKX AI marketplace that need a human-readable wallet summary as an input to their own workflow (secondary use case)

## Goals
1. Ship a working, publicly callable A2MCP endpoint before the July 17, 00:00 UTC submission deadline
2. Produce a clear, compelling 90-second demo showing real wallet input → real plain-English output
3. Qualify as a legitimate ASP per OKX's own definition (fixed price, standardized input/output, listed and callable via OKX.AI)
4. Target the **Software Utility** and/or **Finance Copilot** prize categories

## Non-Goals (v1)
- No investment advice, price predictions, or "buy/sell" recommendations of any kind
- No support for negotiated/custom requests (that's A2A, not this service)
- No wallet write-access or transaction execution — read-only analysis only
- No gas-cost-based or spam/airdrop-based dust detection (deferred to v2) — v1 dust detection is value-only (see below)
- Multi-chain support beyond OKX-supported chains/X Layer is out of scope for v1

## Core Features

### 1. Health Check
- **Concentration risk**: flags if a wallet holds an outsized % of value in a single token
- **Stale approvals**: flags token approvals granted to contracts that have not been used/revoked in a defined period, since these are an underrated real risk
- **Dead/illiquid tokens**: flags tokens with no meaningful trading activity in a defined period
- **Dust detection (value-only, v1)**: flags holdings below a defined USD value threshold (e.g., under $2) based purely on balance × current price. This check does **not** account for gas cost to move the asset, liquidity depth, or spam/airdrop origin. The response must include an explicit disclaimer that this is a simple value estimate only and should not be fully relied on to judge whether a holding is worth acting on — users should verify before dismissing or attempting to move any flagged token.

### 2. Activity Story
- A narrated, chronological plain-English summary of the wallet's meaningful activity (major buys, swaps, transfers, NFT holds, etc.)
- Written to read like an explanation to a smart, non-technical friend — no jargon unless immediately explained

### 3. A2MCP Service Interface
- Fixed price per call ($0.10–$0.25 range, to be finalized)
- Standardized request: wallet address (+ optional chain parameter)
- Standardized response: structured JSON containing health check fields (including dust disclaimer text) + story text
- No negotiation, no escrow — instant pay-per-call via OKX Payment SDK

### 4. Demo Web UI (secondary, non-core deliverable)
- Simple front end: paste wallet address → see Health Check card + Activity Story
- Dust-flagged tokens visibly paired with the disclaimer text, not buried in fine print
- Exists purely to make the 90-second demo video visually compelling
- Thin layer on top of the real API — not the product itself

## User Flow (demo/human-facing)
1. User pastes a wallet address into the demo UI
2. System fetches on-chain data via Onchain OS
3. Analysis layer computes concentration %, stale approvals, dead tokens, and value-only dust flags (deterministic, non-LLM)
4. Narration layer (Gemini API) converts computed facts into plain-English Health Check + Story, including the dust disclaimer
5. UI displays both sections clearly

## User Flow (agent-facing, real ASP usage)
1. Calling agent sends a request to the A2MCP endpoint with a wallet address
2. Payment is settled automatically per call via OKX Payment SDK
3. Endpoint returns structured JSON (health check + story, including dust disclaimer field) to the calling agent

## Success Metrics (for hackathon judging)
- **Product quality**: endpoint works reliably, handles edge cases (empty wallet, wallet with only one token, wallet with many stale approvals, wallet with only dust) without breaking
- **Use case strength**: judges immediately understand the problem being solved from the demo alone
- **Marketplace fit**: built on Onchain OS, registered correctly as A2MCP, live and callable on OKX.AI
- **Reliability**: consistent output structure across different test wallets
- **Social traction**: demo video gets engagement under #okxai

## Constraints & Risks
- **Sparse wallet risk**: a wallet with very little activity may produce a thin/boring story — needs a defined fallback narrative for low-activity wallets so the demo never falls flat
- **Data availability**: dependent on what Onchain OS actually exposes; some fields (e.g., approval history, token price for dust calculation) may require additional data sources if not natively available
- **Dust detection accuracy**: value-only dust detection is a simplification and can misclassify holdings (e.g., a token worth more than gas to move, but temporarily low-priced); disclaimer text is mandatory in every response that includes a dust flag
- **Time constraint**: hard deadline of July 17, 00:00 UTC for form submission, plus prior listing approval time (~24 hours), so the real internal deadline is several days earlier
- **Scope discipline**: strong temptation to add features (gas-aware dust detection, multi-chain, richer analytics) — v1 must stay narrow to ship reliably

## Open Questions
- Exact fixed price per call — placeholder $0.10–$0.25, needs final decision
- Which specific chain(s) to support at launch
- Whether stale-approval data and token pricing are available directly via Onchain OS or require a supplementary source
