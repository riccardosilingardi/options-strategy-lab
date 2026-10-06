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

Plan before you execute. Before changing any file, write the plan: tasks in order, files touched, tests
added or changed, what is not touched, risks, and every point where the prompt is ambiguous or disagrees
with the code. If there is such a point, stop and ask the owner before executing. The plan opens the PR
description; each task then reads 'Done as planned' or 'Changed from the plan, and why'. (Owner rule,
3 Oct 2026.)

## Non-negotiable rules

1. Paper trading only. If paper mode cannot be verified, reject the order.
2. No uncovered short legs; the maximum loss is always known.
3. No API key ever reaches the client. Keys live only in Netlify environment variables:
   ALPACA_KEY, ALPACA_SECRET, ANTHROPIC_KEY, ALPHAVANTAGE_KEY, SITE_PASSWORD, DEMO_TOKEN,
   optional WEBHOOK_URL and ANTHROPIC_WORKSPACE_ID.
4. No order reaches Alpaca without passing `src/riskGate.js`.
5. Nothing executes without an explicit human confirmation.
6. **Deploy previews are read-only** (redesign PR 2, TASK 0a; deploy-preview-51 overwrote production's book on 5 Oct
   2026). Every Netlify function that writes or sends asks `deployWrites(context)` (src/deploy.js) first and answers 403
   "Preview deploys are read-only: nothing is saved or sent from here." unless the deploy is production AND published;
   an unreadable context is refused. Guarded: state.mjs's POST, alpaca.mjs's POST/PATCH/DELETE, approve.mjs,
   autopilot.mjs, av.mjs's cache write. Reads are never asked. The client reads its build stamp
   (`__OSL_DEPLOY_CONTEXT__`, vite.config.js, from Netlify's CONTEXT): anything but "production" draws the banner and
   disables Send, Close, Modify, Cancel and File in Journal with the sentence. A new writer needs the check and a case
   in `deploy.test.js`. Old previews keep the code they were built with: the guard protects deploys built after it.

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
  two paths and `figures.test.jsx` holds them equal; the card's figures are for the size the
  budget buys, from `sizedFigures()` and `sizeLine()`, read at `aFill` (Find) and `AE` (Build), held
  equal by the same test — and so are the two PR #49 tiles, `futureFigures()` and `pastFigures()`.
- **The card's names are the owner's (3 Oct 2026) and live in rules.js only:** `CARD_LABELS` — YOU RISK, MAX PROFIT,
  CHANCE, RETURN ON RISK, FUTURE (MONTE CARLO), PAST YRS (BACKTEST) — and `FIND_ORDERS` — Future avg · Future avg +
  signal · Chance · Return on risk · Past yrs (each with the `tile` it rings); `PAST_AVG_LABEL` ("PAST YRS AVG") on
  Build; the two toggles' words. Positions' "at entry vs now" reads the first four. No screen spells them itself.
- **The historical replay has one home: `histBacktest()` in engine.js** (PR #49): the trade settled at expiry in the
  same calendar window of every past year, whole months, the current year left out; a window past December reads the
  next year's row, and the last year (whose next row does not exist yet) is dropped, not padded (PR #50; `runReplay()`
  on Build reads the same way). Find runs it per card in
  `findGen` (via `listCardFigures()`), Build in `buildFigures()` and its backtest panel; never copy it.
- **One sorted list (PR #49).** A candidate that misses the request stays in its place in the chosen order, quieter
  (`T.mut`), with its reason first; "Hide cards that miss" (off) hides it behind the count (`resultsLine()`; on Find's rows `rowsResultsLine()`, "Hide them"). Never
  dropped. A slider filters `findGen`'s output and never re-simulates (`find.test.jsx` checks the memo's deps).
- Atoms and sizes: `src/ui.jsx` (now with `Info`, the ⓘ, and `Segments`) and the type tokens in `theme.js`. `ui.jsx`,
  `card.jsx`, `find.jsx`, `orders.jsx`, `positions.jsx`, `navBar.jsx`, since PR 3a `positionScreen.jsx`, and since PR #48 `steps.jsx`, `why.jsx`,
  `positionCard.jsx` and `wizard.jsx`, since PR #49 `pro.jsx` and `App.jsx`, since redesign PR 1 `market.jsx` and since
  redesign PR 2 `build.jsx`
  (atoms now include `Sheet` and `Placeholder`), use no `fontSize` literal and define no atom; `ui.test.jsx` fails the build otherwise (only visuals.jsx's drawings and main.jsx's crash screen are left,
  named in the test). A longer explanation goes behind one ⓘ or fold, never deleted. **An ⓘ shows its label**
  ("How the numbers fit ⓘ"); `iconOnly` only inside a figure tile, where the tile's name is the label.
- No emoji or rare glyphs in UI strings; stay within `↑ ↓ → ✓ ✗ ⚠ ▲ ▼ ●` and, since redesign PR 1 (owner's mockups,
  4 Oct 2026), `☆ ★ ⇅ ≈ ‹ › ▾ ▴`.
- **The app opens on Find (owner, 5 Oct 2026, round 2).** Home (`WizardOpen`) is gone; a first run is `CapitalOnboarding`,
  then Find; Back on Find leaves the app (nav.js rule 2). Positions to look at are the bottom bar's Positions badge, whose
  spoken name is `statusLine()`; Settings is the gear in `FindHeader`. Find, Saved and the market page draw NO desk header
  (`chromeless` in App.jsx), and neither does Build since redesign PR 2, nor Positions since PR 3a (its own `PositionsHeader`);
  the Journal and Settings keep it until PR 3b.
- **The mockups' look (round 2) lives in ui.jsx's atoms**: `IconButton`, `SegmentBar` (Results | Saved, the chain's modes),
  `UnderTabs` (Find's categories, the market's tabs), `FilterChip` (Find's chips, the sheets' choices; ink when off its
  default, never amber), `TextBtn`, and `Sheet` (scrim, grab handle, the value beside the title). Two theme tokens joined in
  round 2, in both palettes: `raise` (a selected or in-the-money cell; never dim text on it) and `scrim` (behind a sheet).
- **The compact card is the one `CandidateCard` with `compact`** (market page's Strategies): four figures, what the trade
  needs (`needsText()`), the stance, FUTURE · PAST in one mono line (the tiles' own `futureTile()` / `pastTileText()`), the
  disagree sentence, the actions, and "Details ▾" with the full card (`details`). figures.test.jsx holds the compact and
  the full card to the same six figures. Its 72×40 picture is handed in (`thumb`): card.jsx draws no band thumbnail.
- **One registry for the markets: `src/markets.js`.** Adding a market is ONE row there (ticker, name, category, step,
  proposable, weather applies or why not, newsQ, the iv/sigma fallback references); BASKET, `getU()`, the categories
  Find groups by, the weather rule, `basket.js`, the demo and the copilot list derive from it. `markets.test.js` proves
  it with a dummy row. Never type a ticker list anywhere else.
- **The season is measured only, and `seasonalSignal(stats, month, dte)` in rules.js is its one home.** A month counts at
  |mean| ≥ `RULES.seasonalSignalT` × its standard error; the season factor, the chance's drift, the position thesis and
  the autopilot all read it, keyed by (market, days held) — `fuseAt(tk, dte)` in App.jsx. Not loaded is "not read"
  (`SEASON_NOT_READ`): the factor is excluded and the chance drifts at zero. There is no hand-written table; never add one.
- **"Signals decide" is `signalDirection()`** (signals.js): score × confidence / 100 against `RULES.directionSignalMin`,
  CONFLICT Neutral, never "Very"; a market shows that family plus Neutral. **The list order is the owner's**
  (`settings.findOrder`, `findOrderCompare()`); only "Future avg + signal" adds `signalAdjustment()`, and then the
  card says its sum at rest with `placeLine()` on the same figures. The tile the list is sorted by is ringed.
- **Build, since redesign PR 2 (owner's mockup "3 · Build", 5 Oct 2026), is `src/build.jsx`** — it computes nothing; App.jsx
  hands it `v` (figures from `buildFigures()`/`AE`, the gate's `guard`, `buildCard`, `factorStands()`, `BF.bands`). Order:
  header ("‹ TK" back, "Paper"), title (`buildSubLine()`), What this trade does (`tradeTakeaway()` + `UnifiedView`, the one
  chart), The numbers (the card's figures), Why this trade (folded: `stanceText(signalStance())`; open: the factors, the
  rule `reasonRuleText(AGAINST_MIN_SCORE)`, "The market's read ›", the trade card's five lines), the copilot
  (`useCopilot()`, `BUILD_SKILL_IDS` in SKILLS; every Build question says it never proposes), Legs (Edit in chain → the
  market page's tray via `initialTray`), **the Order inline** (two steppers; the cap checkbox writes `settings.sizingFree`,
  the same setting Settings shows; turning it off asks the typed reason), Exit plan, Send, then "More on this trade ▾"
  (everything else in today's form, handed in as `foldedNode`). **Send opens the review sheet** (`deskSheet` "review", so
  Back closes it), assembled by `reviewSheetOf()` outside the step block: the legs and OCC symbols, the limit line,
  `gateChecklist()`'s rows plus Find's open-interest floor, the clock, the against-signal reason; its second tap is
  `useTicketSend().fire()` (order path 2) or, with no Alpaca, the app's own book. Build draws no desk header and no
  evidence bar. `Reveal` (ui.jsx) is a tap-away region the word counter folds.
- **Three steps since redesign PR 1 (owner, 4 Oct 2026): Find → the market page → Build** (`STEPS`, path.js). Find is one
  row per market from ONE function, `marketRows()` in `src/rows.js`, over `findShown` (the one sorted list): a row's card
  is the market's first card that fits, else its first card as a miss in its place; a row's figure is `rowFigure()`, the
  card's tile (figures.test.jsx). The market page (`src/market.jsx`) is a filtered view of the same list for one ticker
  (`findSorted`), never a second list; its ticker and tab are nav.js fields (`mkt`, `mtab`), and opening it does not
  replace the trade loaded on Build. Every chip on Find opens a `Sheet` (ui.jsx) holding the existing control.
- **Where a card stands against its market's signals is `signalStance()`** (signals.js, beside `againstSignal()`, one
  counting: the factors the market HAS, the `AGAINST_MIN_SCORE` noise floor); its words are `stanceText()` in rules.js.
- **A function with no source yet is a `<Placeholder id>`** (ui.jsx), its words `PLACEHOLDERS` in rules.js; never a
  made-up number, never left out. An id leaves the list only when its function is built (PRD §4 lists them). A feed's own
  limit or a state the app already handles is said in words, not a placeholder.
- **The event calendar is `src/events.js`**, copied from the publishers' calendars with the source and "read 5 Oct 2026"
  beside each block; the table ends `EVENT_TABLE_END` (31 Dec 2026), after which the box is the placeholder
  `events-calendar`. A block may carry a day with no time (the FOMC: never print an hour nobody read), a moved date with
  its own time (`moves`), or `holidaysRead` (its page lists every holiday change, so no holiday-week note). Which market
  reads which calendar is the `events` key on its markets.js row; each category's icon is `CATEGORY_ICONS` there. Never
  type a date from memory; events.test.js runs on the shipped table.
- **The Chain tab's tray prices legs through `listCardFigures()`** (handed in from App.jsx) and reaches Build only through
  `buildHandOff()` (`openOnBuild`); at most `MLEG_MAX_LEGS` legs (read, never changed); Build › is blocked when
  `undefinedRiskLegs()` finds an uncovered short. Nothing is sent from the market page.
- **Every screen is checked against the owner's board itself (redesign PR 3a): `scripts/audit-screen.mjs`.** It mounts
  docs/mockups/src/<Board>.dc.html beside the whole app on fixtures and compares paired elements by computed style and
  the board's words. A difference passes only with a `why` — a README/CLAUDE.md rule (`R` in audit-map.mjs) or a
  "left:" leftover the ROADMAP lists; anything else exits 1. **Adding a screen:** dump both trees
  (`node scripts/dump-tree.mjs board <Board>` and `… app "<mode>" "tap:sel:text"`), give the app's elements `data-*`
  hooks, write the board's entry in `scripts/audit-map.mjs` (mode, go, pairs, skipWords with reasons) and its group,
  run it dark and light, fix every unexplained ✗.
- **A position has its own screen (redesign PR 3a): `src/positionScreen.jsx`**, opened by `detailsId` (nav.js; its ‹ and
  Back step back like a sheet). It computes nothing: App.jsx hands it `v` from `positionModels` and positionView.js's
  generators (`screenHeadline()`, `paysLine()`, `exitPlanRows()`, `turnedLine()`, `recordRows()`, `statusBadge()`). Close at
  limit is order path 3 unchanged; **"Keep it, write why" is a `keep` entry on the position's timeline**
  (`keepEntry()` through `appendTimeline()`), refused on a preview — never a new /api/state field. The card's sentence is
  `cardSentence()`; its exits are `exitLabels()`.
- **The copilot by place (PRD §1):** every `SKILLS` question in pro.jsx carries `place` (find · build · positions · desk);
  a screen shows only its own (`skillsFor()`, `BUILD_SKILL_IDS`, `POSITION_SKILL_IDS`). A copilot explains; it never
  proposes, closes or sends. A position's answers are filed in copilotLog tagged with its ref, plus one timeline line.
- Plan first, then change surgically: the plan is the standing rule's ("Plan before you execute", above).

## Files that matter

- `src/rules.js` — the single source of the trading rules: `RULES`, sizing, floors, exits,
  chance, limit pricing, `seasonalSignal()`, and every generated rule sentence.
- `src/markets.js` — the market registry (PR #48): one row per market, the categories, `getU()`, `BASKET`.
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
  is closed from its own button, Find — the first entry — is never intercepted).
- `src/engine.js` — Black-Scholes, payoff, exit simulator, seeded Monte Carlo, seasonal parse (`parseAvJson()` keeps
  the whole series since PR #49; `statsFromMatrix()` returns per-month years and standard errors; `seasonalSpan()`),
  the historical replay `histBacktest()` (PR #49). `SEASONAL` is retired; `SIGMA` stays.
  Imports nothing; shared by client and Netlify functions.
- `src/chain.js` — where the option chain comes from, strikes, open interest, feed names.
- `src/signals.js` — the four-factor confluence engine, `signalDirection()`, the Find order (`findOrderCompare()`,
  `placeLine()`; it re-exports `FIND_ORDERS` from rules.js), `badgeText()` and `numbersFitLines()`.
- `src/indicators.js` — every technical indicator, and the chart copilot's context.
- `src/freshness.js` — how old a number on screen may be.
- `src/visuals.jsx` — every trade picture, all cut from `payoffBands()`.
- `src/card.jsx` — the request controls (shown in Find's sheets, `bare`), the one candidate card (six tiles and its
  picture row), the one sorted list (misses in place), the compare tray and the card's actions.
- `src/ui.jsx` — Btn, Panel, Label, Stat, Fold, Chip, Note, inputs, `RangeField`, the mono/sans stacks.
  The type tokens (`TYPE`) are in `src/theme.js`. Mono only for numbers, tickers, legs, OCC symbols.
- `src/find.jsx` — Step 1, Find (version B, redesign PR 1): category tabs, the chip row and its sheets, the summary line,
  one row per market (`MarketRow`), the states, Compare (`ComparePanel`).
- `src/rows.js` — `marketRows()`, `rowFigure()`, `rowStateOf()`: Find's rows over the one sorted list (plain JS).
- `src/market.jsx` — Step 2, the market page: header, Overview, Strategies (`StrategyCard`), Chain (`ChainTab`, the tray).
- `src/marketView.js` — `dayChange()`, `expectedMove()`, `latestNews()`, `toggleChainLeg()` (plain JS).
- `src/events.js` — the event calendar to 31 Dec 2026; `nextEvent()`, `eventsFor()`, the holiday weeks.
- `src/wizard.jsx` — onboarding, the confirm step, and `statusLine()` (Home is gone since round 2).
- `src/saved.jsx` — Saved's rows (round 2, moved out of App.jsx): When saved / Now, what it would have done.
- `src/steps.jsx` — navigation chrome: sheets, folds, `DeskCountLine` (`StepNav` removed in PR #48).
- `src/build.jsx` — Step 3, Build (redesign PR 2): its sections, the review sheet, its three states.
- `src/positionScreen.jsx` — one position's own screen (redesign PR 3a): what to do now, Keep it, the chart, the exit
  plan, entry vs now, the record, Alpaca details, the copilot, the Guardian fold.
- `src/path.js`, `src/handoff.js` — the three-step path (Find → market → Build) and how a trade reaches Build.
- `src/why.jsx` — the "Why this trade" evidence panel.
- `src/App.jsx`, `src/pro.jsx` — UI, the order ticket (`OrderTicket`), the desk, `QtyField`.
- `src/theme.js` — the one theme; dark is the default since redesign PR 1 (owner, 4 Oct 2026); a stored "light" stays light.
- `src/demo.js` — public demo mode; every order path is disabled in it.
- `src/deploy.js` — deploy previews are read-only: `deployWrites()` for the functions, `PREVIEW` for the client.
- `src/basket.js` — re-exports `markets.js`'s `BASKET` for the Netlify functions.
- `src/wordcount.mjs` — counts words each step renders (source; "market" is a screen since redesign PR 1, and a `Sheet`
  is one tap away), and `SURFACE_IDS` / `renderedWords()` for the four
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

1. `App.jsx` `sendToAlpaca()` 2. `pro.jsx` `useTicketSend()` — the ticket's send as one hook since redesign PR 2, fired by
Build's review sheet ("Send to Alpaca") and by `OrderTicket` (whose `noSend` copy in "More on this trade ▾" has no Send) 3. `src/closeOrder.js`
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
call to Alpaca from the client needs its route added there and in `orders.test.js`. Every route but a GET answers 403
off the published production deploy (`deployWrites()`, rule 6).

## Where each constant lives

All in `RULES`, `src/rules.js`, unless noted.

- Exits: `takeProfitPct` 0.5, `singleTakeProfitPctOfPremium` 0.5 (a single long option; read only through
  `takeProfitTarget()`), `stopLossPct` 0.5 (warning only), `exitDTE` 21, `scaleOutPct` 0.75.
- Entry: `minEntryDTE` 30, `targetEntryDTE` 45, `maxEntryDTE` 90.
- Sizing: `bestPracticePerTradePct` 0.05, `totalExposurePct` 0.25, `suggestedTradingCapital`.
- Price exists: `minNetPremium` 0.05 (`MIN_NET_DOLLARS` = $5 a contract).
- Model sanity: `modelDisagreementRatio` 4.
- Season: `seasonalSignalT` 2 (a month counts at 2 standard errors; read only through `seasonalSignal()`).
- Direction: `directionSignalMin` 12.5 ("Signals decide"; read only through `signalDirection()`).
- Stale board (copy only): `staleBoardShare` 0.15 — the share of inverted strike pairs at
  which Find says "<expiry> looks stale on N markets", once.
- Floors: `liquidityPercentile` 0.40, `minOpenInterestAbsolute` 10, `minPeersForPercentile` 8,
  `maxSpreadShareOfMid` 0.35, `maxComboSpreadShareOfNet` 1.0, `maxCrossingShareOfMaxProfit` 0.5,
  `minRewardRisk` 0.25.
- Limit pricing: `openLimitSlippage` 0.25, `closeLimitSlippage` 0.25.
- Simulation: `mcRuns` 8000, `fallbackIV` 0.25, `fallbackSigma` 0.25.
- Attention: `watchAttentionShare` 0.35, `autopilotConfidence` 70, `lowConfidence` 40.
- Chance slider: `chanceAskMin` 0.20, `chanceAskMax` 0.80, `chanceAskStep` 0.05,
  `chanceAskDefault` none (null; the slider's leftmost position reads "any", PR #49). Return-on-risk slider: floor `minRewardRisk`, `rewardAskMax` 3,
  `rewardAskStep` 0.05 (it can only tighten the floor). Amount slider: `amountAskStep` 25.
- Quantity fields: ticket 1–20 (`OrderTicket`), leg 1–10 (Build legs editor), via `QtyField`.
- Indicator periods: `PERIODS` in `src/indicators.js` (deliberately not in `RULES`).
- Theme colours: `src/theme.js`. Liquidity measurement table: `LIQUIDITY_MEASUREMENT` in rules.

## How to test

- `npm ci` once, then `npm test` — every plain-JS suite plus the JSX suites listed in
  `scripts/test-jsx.mjs` (bundled with esbuild, run in node; no DOM library).
- `npm run build` — must be clean.
- A new JSX test file must be added to `FILES` in `scripts/test-jsx.mjs`. A file that must render as a deploy preview goes in
  `PREVIEW_FILES` too (bundled with `__OSL_DEPLOY_CONTEXT__` = "deploy-preview"); every other file is unstamped, i.e. not a
  preview. JSX tests are
  bundled to CJS, so read source files by repo-relative path, not `import.meta.url`.
- `node scripts/measure-words.mjs` prints the per-screen word counts and the four rendered surfaces on J-0001.
- `node scripts/shoot-build.mjs [dir]` photographs Build through the WHOLE app on fixtures (`scripts/app-screens.jsx`, renamed from build-screens.jsx in PR 3a:
  Find → UNG → Build ›, a stub Alpaca, a stub copilot, a fixed clock) at 390×844: at rest, Why, copilot, over the cap,
  review, sent, the three states, More, Edit in chain, light (docs/screens/redesign-pr2/).
- `node scripts/audit-screen.mjs <Board|find|market|build|pr3|shipped|all> [dark,light] [--quiet] [--no-shots]` checks
  each screen against the owner's board (docs/mockups) on the whole app on fixtures; exits 1 on an unexplained
  difference; side-by-side pictures in docs/screens/redesign-pr3/audit/. `node scripts/shoot-positions.mjs [dir]`
  photographs Positions, a position's screen and Orders on the `+book` fixture (scripts/book-fixture.js).
- `node scripts/audit-build.mjs [light]` (now `audit-screen.mjs build`) measures Build against the mockup's own values (getComputedStyle: sizes, weights,
  borders, radii, paddings, taps, theme colours) and its words, on the same harness; exits 1 on any difference.
- `node scripts/shoot-screens.mjs [dir]` photographs Find, a sheet, Saved and the market page's tabs at 390×844 in the
  pre-installed headless Chromium, on findB's fixtures (`scripts/screens.jsx`), and prints page and card heights.
- `node scripts/measure-find.mjs` prints what each Find control passes on the 31 fixture cards and what
  one slider move costs (`scripts/find-fixtures.jsx` builds the cards).
- `node scripts/measure-season.mjs` (months that count, on avFixture series), `node scripts/measure-signals.mjs`
  ("Signals decide" against the retired rule), `node scripts/measure-sweep.mjs` (design-system counts per file).
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
- `settings.notifyWhenReady`, `settings.sizingFree` and `settings.findOrder` must be in the `/api/state` sync payload.
- Free sizing is ONE gate input (`evaluateTrade({ sizingFree })`): it drops the per-trade,
  exposure and capital-not-set checks only. Never let it reach another check.
- A card's size is `scaleStrategy()` on the maximum loss; `sizeLine()` prints contracts × risk.
- The amount never passes the per-trade limit with free sizing off: `requestOf(want, limits, { sizingFree })`
  returns `riskCap`, and every `scaleStrategy(a, mode, amt, request.riskCap)` call passes it.
- A leg's `qty` is inside `analyze()`'s figures; `positionSize()` separates `contracts` from
  the broker's `brokerQty`. Never write `Number(p.contracts) || 1`.
