# Product

## Register

product

## Users
Two audiences. Primary in production: **other AI agents** calling Scope as an A2MCP service (machine-to-machine, JSON). The demo UI's audience is **humans evaluating the service** — hackathon judges and the operator — who paste a wallet address and read the diagnostic to see what the agent service actually returns. So the demo is a showcase of a tool, viewed by people who value trust and clarity over decoration.

## Product Purpose
Given a wallet address, Scope returns a deterministic **Health Check** (concentration risk, stale approvals, dead/illiquid tokens, value-only dust) plus a plain-English **Health Summary** and **Activity Story**. The demo page proves the real deployed endpoint works end-to-end, in public, on a real wallet. Success = a person pastes an address, waits through the live analysis, and trusts the readout without pausing at anything that feels off or invented.

## Brand Personality
Instrument, not marketing. A diagnostic readout — precise, legible, unshowy. Three words: **precise, trustworthy, native** (reads like a real tool's output, not a landing page). The numbers are the product; the interface disappears into them.

## Anti-references
- Neon crypto dashboard (glowing candlesticks on black) — this is a health report, not a trading terminal.
- SaaS landing template (hero headline + three feature cards + gradient CTA).
- Navy-and-gold "serious fintech" cliché.
- Playful / meme-y (mascots, emoji-heavy) — undercuts the trust a health report needs.

## Design Principles
- **The data is the design.** Presentation-ready numbers, aligned like real tool output; the chrome recedes.
- **Show the real thing.** The page calls the live deployed endpoint and displays its exact URL — no mock path.
- **Honest states.** Loading is reassuring over a slow (~30–60s) real analysis; degraded (`warnings`) and error states are shown plainly, never hidden behind a fake "all clear".
- **Never invent.** The UI only renders what the API returned; the mandatory dust disclaimer is shown verbatim.
- **Terminal-native with restraint.** Monospace, dense, considered — not a hacker-movie set. One restrained signal accent, semantic colors for flagged/ok/warn.

## Accessibility & Inclusion
WCAG 2.2 AA: body text ≥4.5:1 on the dark surface, visible focus states, semantic colors never the *only* signal (pair with text/glyph). Full `prefers-reduced-motion` alternative for every animation. Keyboard-operable input + run.
