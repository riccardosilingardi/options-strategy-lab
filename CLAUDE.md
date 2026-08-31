# Options Strategy Lab — project memory

Read `PRD.md` before any substantial change. This file is the short version.

## What this is

A paper-trading platform for multi-leg options strategies on commodity ETFs
(CORN, UNG, SOYB, BOIL, WEAT). It guides non-expert traders toward disciplined
trading. The owner is not a software developer: explain changes in plain
language, define technical terms on first use.

**Product language is English.** All UI copy, function names and generated
text are English.

## Thesis

An agent that cannot execute a trade it cannot justify.

- The app must be able to say "nothing today". That is a feature, not an error.
- Risk limits are code, never prompts. A model can be argued with; an `if` cannot.

## Non-negotiable rules

1. Paper trading only. If paper mode cannot be verified, reject the order.
2. Defined-risk structures only (spreads). Never naked legs.
3. No API key ever reaches the client. Keys live only in Netlify environment
   variables: ALPACA_KEY, ALPACA_SECRET, ANTHROPIC_KEY, ALPHAVANTAGE_KEY,
   SITE_PASSWORD, DEMO_TOKEN, optional WEBHOOK_URL.
4. No order reaches Alpaca without passing `src/riskGate.js`.
5. Nothing executes without an explicit human confirmation.

## Position sizing

Derived, not hardcoded. See PRD §3. The user supplies trading capital and how
many positions they hold at once; the app derives the per-trade limit and shows
the best-practice cap as an explained suggestion. Overrides require a typed
reason and are stored with the position.

## Exit rules

Chosen once per position at construction time, then frozen. Never renegotiated
while the position is open.

- Take profit at 50% of max profit — keep
- Exit at 21 DTE — changed from 7, see PRD §4
- Stop at 50% of max loss — warning only, pending backtest
- DTE = days to expiration

## Architecture

- `src/App.jsx`, `src/pro.jsx` — UI
- `src/theme.js` — shared theme, never redeclare a local `T`
- `src/engine.js` — shared math (Black-Scholes, payoff, probabilities,
  seasonal tables). Plain JS, no React imports. **Both the client and the
  Netlify functions import from here.** Never duplicate this math.
- `src/signals.js` — the 4-factor confluence engine (`fuseSignals`) and the
  single source of the region table, the climate norms, the news cause→effect
  rules, the SMA/RSI read and the candidate ranking. Plain JS, no React imports.
  `pro.jsx` imports all of it and keeps only the rendering. Never copy a
  threshold out of here into a component.
- `netlify/functions/*.mjs` — serverless endpoints, routed in `netlify.toml`
- `netlify/edge-functions/gate.js` — password gate, with demo-token bypass

## Visual contract

Every visual is generated from `payoff(legs, S)` — never compute zones
separately or two screens will disagree about the same trade.

Every visual exposes `takeaway()` (one always-visible sentence, generated from
the numbers) and `explain(element)` (on tap). If the takeaway needs more than
one sentence, change the chart, not the copy. Mobile has no hover: tap to open.

## Known traps

- `logEvent` must never be called inside JSX render — use `useEffect`
- News impact directions are numbers (`1 / 0 / -1`), never arrow strings. Render
  them with `ARROW[dir]` from `signals.js`
- Use the safe `getU(ticker)` accessor, never `UNDERLYINGS[ticker]` directly
- Single-leg orders go to Alpaca as simple orders, not mleg (422 otherwise)
- Cancel conflicting open orders before sending an mleg close (wash-trade check)
- State hydration sanitises corrupt positions using the `v: 2` version flag
- `pro.jsx` keeps its own `probProfit(curve, S, sigma, dte)` and `exitPathSim(...)`
  with signatures different from the ones in `engine.js`. This is intentional and
  must not be merged: the UI depends on the extra fields these versions return
  (`pTimeNeg`, `pWin`, `horizon`), and `probProfit` there works on an already
  built payoff `curve` rather than on `legs`

## Working style

Plan first, then implement surgically. State the plan before writing code.
