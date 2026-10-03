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
- An order that fails must fail where the button is. An order's state lives on its row in Positions → Orders, and
  prints once: a card whose close is working shows one line and "Manage order"; the desk and the bottom bar show counts.
- "Is this order mine" has one answer: `recordForOrder()` in journal.js (opening order or `closeOrder.id`).
- A size sentence states what Alpaca holds, per leg: `sizeWords()` ("9 puts") from `positionSize().brokerQty`.
- A best or worst case includes the payoff at a price of zero (`payoffAtZero()`, `exactExtremes()` in rules.js); a stored
  record keeps its figures and is read through `withExactMaxProfit()`.
- A closed market is one line, `marketClockLine()` (src/clock.js), from Alpaca's `/v2/clock`; an unread clock is not closed.
- Red is for errors and refusals only. CLOSE, Send and the Positions badge use `T.action`; Cancel is the red outline.
- A take-profit target is `takeProfitTarget()` in `rules.js`, never `takeProfitPct * maxProfit` at a site.
- A card and Build read one price: `fillNet()`. `listCardFigures()` and `buildFigures()` are the
  two paths and `figures.test.jsx` holds them equal; the card's four figures are for the size the
  budget buys, from `sizedFigures()` and `sizeLine()`, read at `aFill` (Find) and `AE` (Build), held
  equal by the same test.
- A candidate that misses the request is hidden behind a count, never dropped (`resultsLine()`); a
  slider filters `findGen`'s output and never re-simulates (`find.test.jsx` checks the memo's deps).
- Atoms and sizes: `src/ui.jsx` (now with `Info`, the ⓘ, and `Segments`) and the type tokens in `theme.js`. `ui.jsx`,
  `card.jsx`, `find.jsx`, `orders.jsx`, `positions.jsx` and `navBar.jsx` use no `fontSize` literal and define no atom;
  `ui.test.jsx` fails the build otherwise. A longer explanation goes behind one ⓘ or fold, never deleted.
- No emoji or rare glyphs in UI strings; stay within `↑ ↓ → ✓ ✗ ⚠ ▲ ▼ ●`.
- Plan first, then change surgically.

## Files that matter

- `src/rules.js` — the single source of the trading rules: `RULES`, sizing, floors, exits,
  chance, limit pricing, and every generated rule sentence.
- `src/riskGate.js` — `evaluateTrade()`, the gate every order path calls.
- `src/order.js` — `orderBody()` (the one Alpaca body builder), signs, order outcomes.
- `src/closeOrder.js` — order path 3: close a holding at a limit, in two taps (a chosen price,
  quantity and TIF since PR #46; without one, the body is byte-identical to before).
- `src/orderRow.js` — what one order row says: book, Alpaca's mark, the price range, status history,
  `waitForCanceled()`, the row's three lines (`rowLines()`), the close confirm's one line (`closeSummaryLine()`) and the
  card's working-close line. `src/modifyOrder.js` — Modify (path 7) and Cancel all.
- `src/orders.jsx` — the Orders segment: `OrderRow`, `OrdersPanel` (Cancel all at the bottom), `PriceField`, `CloseChoice`.
- `src/positions.jsx` — the account strip (`AccountStrip`), Positions | Orders (`PositionsBar`), `WorkingCloseLine`.
- `src/navBar.jsx` — the one bottom bar (Find · Build · Positions · Journal), `placeOf()`, `NAV_BAR_H`.
- `src/clock.js` — `marketClockLine()`, `localStamp()`: the market clock and times in the owner's own zone.
- `src/alpacaContract.js` — Alpaca's order contract mirrored from alpaca-py.
- `src/journal.js` — the position record: refs, timelines, size, stage, book, fills.
- `src/positionView.js`, `src/positionCard.jsx` — what a Positions card and its Details sheet say
  (action, profit, three exits, entry against now). They compute nothing new: the profit is
  `posAlerts`', the target `takeProfitTarget()`, the stop level `stopWarningLevel()`.
- `src/nav.js` — Back: the screen state as history entries (push on a move, step back when a sheet
  is closed from its own button, Home is never intercepted).
- `src/engine.js` — Black-Scholes, payoff, exit simulator, seeded Monte Carlo, seasonal parse.
  Imports nothing; shared by client and Netlify functions.
- `src/chain.js` — where the option chain comes from, strikes, open interest, feed names.
- `src/signals.js` — the four-factor confluence engine and the guided-flow drivers.
- `src/indicators.js` — every technical indicator, and the chart copilot's context.
- `src/freshness.js` — how old a number on screen may be.
- `src/visuals.jsx` — every trade picture, all cut from `payoffBands()`.
- `src/card.jsx` — the request controls, the one candidate card (with its picture row), the list that
  hides misses behind a count, the compare tray and the card's actions.
- `src/ui.jsx` — Btn, Panel, Label, Stat, Fold, Chip, Note, inputs, `RangeField`, the mono/sans stacks.
  The type tokens (`TYPE`) are in `src/theme.js`. Mono only for numbers, tickers, legs, OCC symbols.
- `src/find.jsx` — Step 1, Find: heading, controls, market chips, the list, the "why" fold, Compare.
- `src/wizard.jsx` — Home (two doors: positions, Find), onboarding and the confirm step.
- `src/steps.jsx` — navigation chrome: sheets, folds, `DeskCountLine` (`StepNav` is no longer mounted since PR #47).
- `src/path.js`, `src/handoff.js` — the two-step path (Find → Build) and how a trade reaches Build.
- `src/why.jsx` — the "Why this trade" evidence panel.
- `src/App.jsx`, `src/pro.jsx` — UI, the order ticket (`OrderTicket`), the desk, `QtyField`.
- `src/theme.js` — the one theme; light is default.
- `src/demo.js` — public demo mode; every order path is disabled in it.
- `src/basket.js` — the ten markets for Netlify functions; held equal to `App.jsx` by a test.
- `src/wordcount.mjs` — counts words each step renders (source), and `SURFACE_IDS` / `renderedWords()` for the four
  rendered surfaces (positions, orders, confirm, modify; `scripts/surfaces.jsx`); `voice.test.js` enforces both.
- `netlify/functions/alpaca.mjs` — the only proxy to the paper trading host.
- `netlify/functions/chainAlpaca.mjs` — option market data; separate from `alpaca.mjs` on purpose.
- `netlify/functions/autopilot.mjs`, `approve.mjs` — scheduled exit proposals and their one-tap
  approval, which re-runs the gate and prices the close at the tap.
- `netlify/functions/av.mjs` — Alpha Vantage with a seven-day cache (25 calls a day).
- `netlify/functions/liquidity.mjs` — aggregate open-interest measurement, read-only.
- `netlify/edge-functions/gate.js`, `ai.js` — password gate, then the streaming Anthropic proxy.
- `public/sw.js` — service worker; caches the app shell only, never a price.

## Order paths — seven, all through the gate

1. `App.jsx` `sendToAlpaca()` 2. `pro.jsx` `OrderTicket` send 3. `src/closeOrder.js`
`prepareClose()` then `sendClose()` — called by the "Not in the app" card's `closeGroup()` (`UnrecordedCard`
in pro.jsx, the Alpaca panel's until PR #47), by the Positions card's close-at-limit and by Modify of a multi-leg close 4. `pro.jsx` `placeExit()`
5. `autopilot.mjs` 6. `approve.mjs` 7. `src/modifyOrder.js` `sendModify()` — Modify of a
single-leg order: the gate, then `PATCH /v2/orders/{id}` (PR #46). Alpaca refuses a replace on
a multi-leg order, so Modify of one is cancel → wait for "canceled" (`waitForCanceled()`) → a
new order through path 3 (close) or path 2 (open, on Build's ticket). Never two working orders
for one holding. Adding an eighth means adding a gate call.

The proxy `netlify/functions/alpaca.mjs` passes only an allowlist (`routeAllowed()`): GET on the
read paths the app uses (account, clock, positions, orders, contracts), POST `/v2/orders`, PATCH `/v2/orders/{id}`, DELETE `/v2/orders/{id}` and
`/v2/orders`. Everything else, `DELETE /v2/positions` included, is 405 with a sentence. A new
call to Alpaca from the client needs its route added there and in `orders.test.js`.

## Where each constant lives

All in `RULES`, `src/rules.js`, unless noted.

- Exits: `takeProfitPct` 0.5, `singleTakeProfitPctOfPremium` 0.5 (a single long option; read only through
  `takeProfitTarget()`), `stopLossPct` 0.5 (warning only), `exitDTE` 21, `scaleOutPct` 0.75.
- Entry: `minEntryDTE` 30, `targetEntryDTE` 45, `maxEntryDTE` 90.
- Sizing: `bestPracticePerTradePct` 0.05, `totalExposurePct` 0.25, `suggestedTradingCapital`.
- Price exists: `minNetPremium` 0.05 (`MIN_NET_DOLLARS` = $5 a contract).
- Model sanity: `modelDisagreementRatio` 4.
- Stale board (copy only): `staleBoardShare` 0.15 — the share of inverted strike pairs at
  which Find says "<expiry> looks stale on N markets", once.
- Floors: `liquidityPercentile` 0.40, `minOpenInterestAbsolute` 10, `minPeersForPercentile` 8,
  `maxSpreadShareOfMid` 0.35, `maxComboSpreadShareOfNet` 1.0, `maxCrossingShareOfMaxProfit` 0.5,
  `minRewardRisk` 0.25.
- Limit pricing: `openLimitSlippage` 0.25, `closeLimitSlippage` 0.25.
- Simulation: `mcRuns` 8000, `fallbackIV` 0.25, `fallbackSigma` 0.25.
- Attention: `watchAttentionShare` 0.35, `autopilotConfidence` 70, `lowConfidence` 40.
- Chance slider: `chanceAskMin` 0.20, `chanceAskMax` 0.80, `chanceAskStep` 0.05,
  `chanceAskDefault` 0.50. Return-on-risk slider: floor `minRewardRisk`, `rewardAskMax` 3,
  `rewardAskStep` 0.05 (it can only tighten the floor). Amount slider: `amountAskStep` 25.
- Quantity fields: ticket 1–20 (`OrderTicket`), leg 1–10 (Build legs editor), via `QtyField`.
- Indicator periods: `PERIODS` in `src/indicators.js` (deliberately not in `RULES`).
- Theme colours: `src/theme.js`. Liquidity measurement table: `LIQUIDITY_MEASUREMENT` in rules.

## How to test

- `npm ci` once, then `npm test` — every plain-JS suite plus the JSX suites listed in
  `scripts/test-jsx.mjs` (bundled with esbuild, run in node; no DOM library).
- `npm run build` — must be clean.
- A new JSX test file must be added to `FILES` in `scripts/test-jsx.mjs`. JSX tests are
  bundled to CJS, so read source files by repo-relative path, not `import.meta.url`.
- `node scripts/measure-words.mjs` prints the per-screen word counts and the four rendered surfaces on J-0001.
- `node scripts/measure-find.mjs` prints what each Find control passes on the 31 fixture cards and what
  one slider move costs (`scripts/find-fixtures.jsx` builds the cards).
- No order can be sent from the sandbox (no broker keys); live behaviour is an OWNER CHECK.

## Known traps

- Never call `logEvent` inside JSX render; use `useEffect`.
- JSX text does not interpolate `${x}`; wrap it in `{`…`}`.
- Use `getU(ticker)`, never `UNDERLYINGS[ticker]`.
- Single-leg orders go to Alpaca as simple orders, not mleg.
- Cancel conflicting open orders before sending an mleg close (wash-trade check).
- Sending a close does not file the Journal; "Close and file it" is the step after the fill.
- A position whose close is working carries `closeWorking` on its alert: `attentionCount()` counts it as a close
  working, never as a decision.
- The account and the clock are their own state (`account`, `clock`), set by the sync; never write them into `alpaca`,
  whose identity re-arms the sync.
- `settings.notifyWhenReady` and `settings.sizingFree` must be in the `/api/state` sync payload.
- Free sizing is ONE gate input (`evaluateTrade({ sizingFree })`): it drops the per-trade,
  exposure and capital-not-set checks only. Never let it reach another check.
- A card's size is `scaleStrategy()` on the maximum loss; `sizeLine()` prints contracts × risk.
- The amount never passes the per-trade limit with free sizing off: `requestOf(want, limits, { sizingFree })`
  returns `riskCap`, and every `scaleStrategy(a, mode, amt, request.riskCap)` call passes it.
- A leg's `qty` is inside `analyze()`'s figures; `positionSize()` separates `contracts` from
  the broker's `brokerQty`. Never write `Number(p.contracts) || 1`.
