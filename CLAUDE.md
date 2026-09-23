# Options Strategy Lab — project memory

Read `PRD.md` (what the product is, the rules, v1, what is not verified) and `ROADMAP.md`
(what comes next) before any change. Every pull request updates `ROADMAP.md`.
The full history of past decisions is in `docs/history/` — read it only when a code comment
cites a section ("PRD §4w") or a decision needs its original reasoning.

The owner is not a software developer: explain changes in plain language and define technical
terms on first use. Product language (UI copy, names, generated text) is English.

## Standing rule

Start each session by fixing what the previous session flagged as broken or unverified. End it
by writing down what you could not verify (PRD §4, at most ten items).

## Non-negotiable rules

1. Paper trading only. If paper mode cannot be verified, reject the order.
2. No uncovered short legs; the maximum loss is always known.
3. No API key ever reaches the client. Keys live only in Netlify environment variables:
   ALPACA_KEY, ALPACA_SECRET, ANTHROPIC_KEY, ALPHAVANTAGE_KEY, SITE_PASSWORD, DEMO_TOKEN,
   optional WEBHOOK_URL and ANTHROPIC_WORKSPACE_ID.
4. No order reaches Alpaca without passing `src/riskGate.js`.
5. Nothing executes without an explicit human confirmation.

## Working principles

- Risk limits are code, never prompts.
- Unknown is not zero. A missing open interest, quote, drift or size is `null` and the screen
  says so. `Number(null)` is 0 and 0 is finite — test for null before coercing.
- One home per number and per sentence. Never copy a rule constant or a rule sentence out of
  `src/rules.js`; `riskGate.test.js` fails the build on copies.
- The broker's numbers (bid, ask, IV, OCC symbol, open interest, fills, P&L) are read, never
  recomputed. Combination properties (net, payoff, max loss, chance, gate) are computed.
- A multi-leg limit price is signed: positive is a debit, negative a credit.
- Never name a contract the chain did not list; `buildOcc()` formats, it is never a fallback.
- A close is always a limit priced at the tap; never a market order.
- An order that fails must fail where the button is.
- No emoji or rare glyphs in UI strings; stay within `↑ ↓ → ✓ ✗ ⚠ ▲ ▼ ●`.
- Plan first, then change surgically.

## Files that matter

- `src/rules.js` — the single source of the trading rules: `RULES`, sizing, floors, exits,
  chance, limit pricing, and every generated rule sentence.
- `src/riskGate.js` — `evaluateTrade()`, the gate every order path calls.
- `src/order.js` — `orderBody()` (the one Alpaca body builder), signs, order outcomes.
- `src/closeOrder.js` — order path 3: close a whole holding at a limit, in two taps.
- `src/alpacaContract.js` — Alpaca's order contract mirrored from alpaca-py.
- `src/journal.js` — the position record: refs, timelines, size, stage, book, fills.
- `src/engine.js` — Black-Scholes, payoff, exit simulator, seeded Monte Carlo, seasonal parse.
  Imports nothing; shared by client and Netlify functions.
- `src/chain.js` — where the option chain comes from, strikes, open interest, feed names.
- `src/signals.js` — the four-factor confluence engine and the guided-flow drivers.
- `src/indicators.js` — every technical indicator, and the chart copilot's context.
- `src/freshness.js` — how old a number on screen may be.
- `src/visuals.jsx` — every trade picture, all cut from `payoffBands()`.
- `src/card.jsx` — the request controls and the one candidate card.
- `src/wizard.jsx` — the app shell, the guided door and the confirm step.
- `src/steps.jsx` — navigation chrome: steps, sheets, folds.
- `src/path.js`, `src/handoff.js` — the three-step path and how a trade reaches Build.
- `src/why.jsx` — the "Why this trade" evidence panel.
- `src/App.jsx`, `src/pro.jsx` — UI, the order ticket (`OrderTicket`), the desk, `QtyField`.
- `src/theme.js` — the one theme; light is default.
- `src/demo.js` — public demo mode; every order path is disabled in it.
- `src/basket.js` — the ten markets for Netlify functions; held equal to `App.jsx` by a test.
- `src/wordcount.mjs` — counts words each step renders; `voice.test.js` enforces it.
- `netlify/functions/alpaca.mjs` — the only proxy to the paper trading host.
- `netlify/functions/chainAlpaca.mjs` — option market data; separate from `alpaca.mjs` on purpose.
- `netlify/functions/autopilot.mjs`, `approve.mjs` — scheduled exit proposals and their one-tap
  approval, which re-runs the gate and prices the close at the tap.
- `netlify/functions/av.mjs` — Alpha Vantage with a seven-day cache (25 calls a day).
- `netlify/functions/liquidity.mjs` — aggregate open-interest measurement, read-only.
- `netlify/edge-functions/gate.js`, `ai.js` — password gate, then the streaming Anthropic proxy.
- `public/sw.js` — service worker; caches the app shell only, never a price.

## Order paths — six, all through the gate

1. `App.jsx` `sendToAlpaca()` 2. `pro.jsx` `OrderTicket` send 3. `src/closeOrder.js`
`prepareClose()` then `sendClose()` — called by the desk's `closeGroup()` and by the Positions
card's close-at-limit 4. `pro.jsx` `placeExit()` 5. `autopilot.mjs` 6. `approve.mjs`.
Adding a seventh means adding a gate call.

## Where each constant lives

All in `RULES`, `src/rules.js`, unless noted.

- Exits: `takeProfitPct` 0.5, `stopLossPct` 0.5 (warning only), `exitDTE` 21, `scaleOutPct` 0.75.
- Entry: `minEntryDTE` 30, `targetEntryDTE` 45, `maxEntryDTE` 90.
- Sizing: `bestPracticePerTradePct` 0.05, `totalExposurePct` 0.25, `suggestedTradingCapital`.
- Price exists: `minNetPremium` 0.05 (`MIN_NET_DOLLARS` = $5 a contract).
- Model sanity: `modelDisagreementRatio` 4.
- Floors: `liquidityPercentile` 0.40, `minOpenInterestAbsolute` 10, `minPeersForPercentile` 8,
  `maxSpreadShareOfMid` 0.35, `maxComboSpreadShareOfNet` 1.0, `minRewardRisk` 0.25.
- Limit pricing: `openLimitSlippage` 0.25, `closeLimitSlippage` 0.25.
- Simulation: `mcRuns` 8000, `fallbackIV` 0.25, `fallbackSigma` 0.25.
- Attention: `watchAttentionShare` 0.35, `autopilotConfidence` 70, `lowConfidence` 40.
- Chance slider: `chanceAskMin` 0.20, `chanceAskMax` 0.80, `chanceAskStep` 0.05,
  `chanceAskDefault` 0.50.
- Quantity fields: ticket 1–20 (`OrderTicket`), leg 1–10 (Build legs editor), via `QtyField`.
- Indicator periods: `PERIODS` in `src/indicators.js` (deliberately not in `RULES`).
- Theme colours: `src/theme.js`. Liquidity measurement table: `LIQUIDITY_MEASUREMENT` in rules.

## How to test

- `npm ci` once, then `npm test` — every plain-JS suite plus the JSX suites listed in
  `scripts/test-jsx.mjs` (bundled with esbuild, run in node; no DOM library).
- `npm run build` — must be clean.
- A new JSX test file must be added to `FILES` in `scripts/test-jsx.mjs`. JSX tests are
  bundled to CJS, so read source files by repo-relative path, not `import.meta.url`.
- `node scripts/measure-words.mjs` prints the per-screen word counts.
- No order can be sent from the sandbox (no broker keys); live behaviour is an OWNER CHECK.

## Known traps

- Never call `logEvent` inside JSX render; use `useEffect`.
- JSX text does not interpolate `${x}`; wrap it in `{`…`}`.
- Use `getU(ticker)`, never `UNDERLYINGS[ticker]`.
- Single-leg orders go to Alpaca as simple orders, not mleg.
- Cancel conflicting open orders before sending an mleg close (wash-trade check).
- Sending a close does not file the Journal; "Close and file it" is the step after the fill.
- `settings.notifyWhenReady` must be in the `/api/state` sync payload.
- A leg's `qty` is inside `analyze()`'s figures; `positionSize()` separates `contracts` from
  the broker's `brokerQty`. Never write `Number(p.contracts) || 1`.
