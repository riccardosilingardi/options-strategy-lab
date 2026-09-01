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

- `src/rules.js` — **the single source of truth for the trading rules**. Take
  profit, stop loss, exit DTE, the entry-DTE floor and the PRD §3 sizing model
  (`sizing()`), plus the generated rule strings (`ruleBadge()`,
  `perTradeCapLabel()`, `copilotRulesBlock()`, `RULE_PILLS`, `NOTHING_TODAY`).
  Never write a rule number or a rule sentence anywhere else — not in a
  component, not in a prompt, not in a serverless function. The two thresholds
  that make the app refuse (`lowConfidence`, `expensiveIVRank`) live here too,
  so the "nothing today" screen can only ever explain a rule the code applies.
- `src/riskGate.js` — `evaluateTrade({ proposal, portfolio, capital, signals })`,
  a pure function returning `{ pass, violations, warnings }`. Every order path
  calls it, and a screen with no gate wired in fails closed
  (`runGate` in `pro.jsx`).
- `src/wizard.jsx` — **the app shell (PRD §5)**. The wizard is the entry point,
  not a tab: capital onboarding on a first run, then screen 1 (greeting, one line
  of status, three choices — and "what needs attention today" once positions
  exist), screen 2 (budget, horizon, what matters most) and screen 5 ("nothing
  today"). Screens 3 and 4 are not built yet: the search hands its pick to the
  Builder. `App.jsx` owns the `view` (`wizard` | `desk`) above the tabs.
- `src/App.jsx`, `src/pro.jsx` — UI. The tabs are still all reachable, behind
  "Open the full desk", but they are no longer the front door.
- `src/theme.js` — shared theme, never redeclare a local `T`. **Light is the
  default**; dark lives behind Settings. `T.onAccent` is the text colour on a
  filled accent — never write `#14181d` into a component. Every light accent
  clears 4.5:1 on white and on the page, and `src/theme.test.js` fails the build
  if a tweak breaks that.
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

## Order paths

There are **six** ways an order can reach Alpaca, and every one routes through
`evaluateTrade`:

1. `App.jsx` → `sendToAlpaca()` — the manual multileg ticket
2. `pro.jsx` → `OrderTicket.send()` — the pro ticket (limit/market, TIF, qty)
3. `pro.jsx` → `AlpacaDesk.closeGroup()` — close a whole strategy
4. `pro.jsx` → `GuardianPanel.placeExit()` — the exit ladder
5. `autopilot.mjs` — gates each proposal before it becomes an approve link
6. `approve.mjs` — re-runs the gate at execution time, up to 24h later

Adding a seventh means adding a gate call. Paper mode is *verified*, not
assumed: `alpaca.mjs` returns an `X-OSL-Paper-Endpoint` header and the gate
rejects anything it cannot confirm.

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

## Saying "nothing today"

The refusal is a screen, not a toast. `runWizard` in `App.jsx` decides, in order:
data missing → signals not aligned → options expensive versus their own history →
nothing fits the budget. A missing-data answer must never be dressed up as a
market verdict — they are different sentences on screen, and `wizard.test.jsx`
holds that line.

## Working style

Plan first, then implement surgically. State the plan before writing code.
