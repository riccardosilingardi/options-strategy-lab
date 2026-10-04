# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — Redesign PR 1 of 3 (owner, 4 Oct 2026): Find version B, the market page, the event calendar, dark by default

The owner approved the mockups and answered the open questions on 4 Oct 2026. The owner's rule for the redesign: no
function shown in the mockups is dropped — each is wired (already in the app), built (derivable from data the app has)
or a placeholder (no source yet: never a made-up number, never silently left out). Planned first; the plan's four
questions were answered the same day (the calendar sources, Saved's unfilled orders, where "Show flagged" and the "why"
fold go, the glyphs).

- **Task 0.** J-0001's working close is not touched (Positions, closeOrder.js and the Journal are not in this PR;
  close.test.jsx, positions.test.jsx and positionCard.test.jsx pass unedited). Every sentence this PR writes is sans;
  App.jsx 148 mono / 31 sans → 146 / 37. The replay's Dec→Jan wrap stays deferred; the live season and PAST YRS tiles
  stay owner-observed.
- **Task 1 — the placeholder.** `Placeholder` in ui.jsx (takes an id, nothing else) and `PLACEHOLDERS` in rules.js
  ({ id, screen, shows, needs, pr }); placeholder.test.jsx holds every use to the list, every id to a use, and no figure
  in any entry's words. Shipped: `events-calendar` (the event line, until the publishers' dates are read and copied in).
- **Task 2 — Find, version B.** Category tabs (the registry's counts), one row of eight chips with a sheet each holding
  the existing control, the summary line through `resultsLine()` (`rowsResultsLine()`), the column head with "How <TK>'s
  numbers connect", one row per market from `marketRows()` (src/rows.js) over the one sorted list; reading, stale,
  nothing-fits (`nothingFits()` on `relaxOptions()`, the move `nearestRelaxation()` already named) and Saved (When saved
  / Now; one new field, `futureAvg`, written by `savedFromCandidate()`). MarketPicker, ResultsFilter, the request block,
  Find's card list and its "Go to Build" button are gone (Build is on the bottom bar).
- **Task 3 — the market page.** STEPS find → market → build; nav.js carries the market's ticker and tab; header
  (`dayChange()`, `expectedMove()`, `atmIv()` moved out of the IV-rank recorder, `latestNews()`), Overview, Strategies
  (`signalStance()` beside `againstSignal()`, `futurePastDisagree()`), Chain (src/market.jsx; the tray through
  `listCardFigures()` and `buildHandOff()`; `MLEG_MAX_LEGS` read, not changed). The Chain tab shipped complete.
- **Task 4 — the event calendar, shipped as a placeholder (owner decision, 4 Oct 2026).** src/events.js holds the reports,
  a source URL beside each block, the logic (next major event before the expiry, else the next weekly report, in the
  user's own time; federal holidays worked out from their rules) and an `events` key on each markets.js row — but no
  date: the sandbox's network refused all four publishers' pages, and the owner chose the placeholder over dates nobody
  read. The logic is tested on a test-only table (the prompt's cases: WASDE 9 Oct, EIA storage 8 Oct, FOMC 28 Oct).
- **Task 5 — dark is the default.** `themeName()`, the first paint (index.html) and the install manifest; a stored
  "light" stays light.

**Measured.** Words (`node scripts/measure-words.mjs`): find 344 → 332, build 267 → 267, positions 207 → 207, market (new)
566 — an upper bound over three tabs; J-0001 surfaces 113/120, 32/35, 35/35, 40/40 unchanged. Find draws (`node
scripts/measure-find.mjs`, fixtures): 31 cards and 62 pictures → 2 rows and 2 thumbnails (one per market), 0 cards.

**Not changed:** riskGate.js, closeOrder.js, modifyOrder.js, `orderBody()`, the seven gate calls, alpacaContract.js, every
RULES value, `histBacktest()`, `seasonalSignal()`, the rules in `fuseSignals()` and `signalDirection()`, the Netlify
functions, Positions, Orders, the Journal, Settings beyond the theme line, Build's screen and ticket, the desk. The
/api/state payload is unchanged: saved trades live in the browser's store, so `futureAvg` is a field on that local item.

### The redesign, three PRs (owner, 4 Oct 2026)

- **PR 1 (this one)** — Find version B, the market page (Overview · Strategies · Chain), the event calendar, dark default.
- **PR 2** — Build, the review sheet, Why this trade, and the copilot inside Build.
- **PR 3** — Positions, Orders, the Journal and Settings.

### What the next session inherits from redesign PR 1

- **J-0001 is still v1 (b)**: its close was working at Alpaca (GTC, $7.62). Nothing here cancels, resends or re-prices it.
- **The event calendar needs its dates**: read CME's list of USDA's 2026 schedule, EIA's storage page and petroleum
  schedule, and the Fed's calendar on their own pages, copy the dates (with any holiday moves) into `src/events.js`, and
  the `events-calendar` placeholder leaves the line. The sandbox could not reach them; a session whose network allows
  those four hosts can.
- The market page and Find's rows have run on fixtures in a headless Chromium only; the Chain tab has not met the live
  Alpaca feed (no open interest) or the CBOE fallback.
- The word counter expands a component mounted inside a closed fold or sheet (it discovers components in the raw
  source); fixing it lowers main's own counts (find 344 → 333, build 267 → 251, positions 207 → 194, measured), so it
  was left for a session that re-derives every ceiling.

## Done in PR #49 — one sorted list, the future and the past on every card, the sweep finished

Planned first (the new standing rule, CLAUDE.md); the owner answered the plan's eight questions on 3 Oct 2026.

**Task 0 — the standing rule, debts and defects.**
- **0a** CLAUDE.md's standing rule: plan before you execute, ask on every ambiguity, the plan opens the PR.
- **0b** The season reads ALL the history Alpha Vantage returns (`parseAvJson()` no longer cuts at ten years; the
  realised volatility from the same series lengthens with it). Measured on avFixture (`node scripts/measure-season.mjs`;
  the live series is not reachable from the sandbox): a 195-month series (CORN's real length) carries 16–17 years per
  month instead of 9–10; months that count, markets with no season built in, 12 → 9 false positives in 132 tests;
  CORN-shaped June −6.0% ± 1.4% (10 yrs) → −4.0% ± 1.3% (16 yrs), counts both ways; the built-in +1.03% September
  counts in neither.
- **0c** Every ⓘ shows its label ("How the numbers fit ⓘ") and opens a readable box (FS.sm, full width); `iconOnly`
  only in a figure tile (the account strip's cells, the card's FUTURE and PAST tiles). The 8 sites: How the numbers fit
  (card.jsx; also the Why sheet), the account strip (iconOnly), Positions' "Hold", the price field's "This price", "An
  order sent outside this app", "The limit against Alpaca's mark", the close confirm's "The order in full", "A holding
  with no record". The owner chose visible labels everywhere: the close confirm's budget 30 → 35 and Modify's 38 → 40,
  exactly the labels' words.
- **0d** "1 card matches what you asked" / "9 cards match what you asked".
- **0e** The gauge's end labels never overlap: a card's 104px gauge drops the cents when the two would collide and
  stacks them if they still do (`gaugeEndLabels()`); checked at 390px in a headless Chromium.

**Task 1 — one sorted list.** `MatchList` is one list in the chosen order; a miss stays in place, quieter (`T.mut`,
held at 4.5:1), its reason at the top; "Hide cards that miss" (off) gives the old view; the line reads "N cards match
what you asked · M shown as misses" (or "· M hidden"). The tile the list is sorted by is ringed with "sorted by" on
every card; under "Future avg + signal" the card says "sorted by −3.6 + signal +27.5 = 23.9 per $100" at rest.

**Task 2 — no chance minimum by default.** `RULES.chanceAskDefault` is none; the slider's leftmost position (20%)
reads "any" and filters nothing (the owner's choice over adding a position).

**Task 3 — the future and the past on every card.** `histBacktest()` moved to engine.js (row for row the same,
engine.test.js) and runs per card in `findGen`; FUTURE (MONTE CARLO) and PAST YRS (BACKTEST) tiles on Find and on
Build's top card (figures.test.jsx holds them equal); "Past yrs" order (win rate, then average per $100); "Only a
positive future avg"; "How the numbers fit" in the owner's words, every number held to its function; Build's backtest
average is "PAST YRS AVG" and reads the price that fills (`AE`), as the tile does. The names live in rules.js
(`CARD_LABELS`, `FIND_ORDERS`, moved from signals.js, which re-exports them).

**Task 4 — the sweep.** pro.jsx and App.jsx are on ui.jsx's atoms and the type tokens (one commit each, every test
unchanged but the sweep test); the card's CONFLICT badge is amber. Counts (`node scripts/measure-sweep.mjs`):

| File | fontSize literals (under 12px) | mono / sans | atom copies |
|---|---|---|---|
| pro.jsx | 117 (93) → 0 | 101 / 0 → 102 / 0 | Btn, Panel, Lbl, Stat, mono → none |
| App.jsx | 224 (110) → 0 | 152 / 26 → 148 / 31 | Btn, Panel, Lbl, Stat, mono, sansUI → none |

**Words** (`node scripts/measure-words.mjs`): find 315 → 344 (0d +1, "any" +1, the two tiles +17, the at-rest sum +10),
build 250 → 267 (the two tiles); rendered on J-0001: Positions 113/120, one order 32/35, close confirm 35/35, Modify
40/40.

**Not changed:** `orderBody()`, closeOrder.js, modifyOrder.js's send paths, `closeLimitPrice()`, riskGate.js rules,
alpacaContract.js, the seven gate calls, every `RULES` value but `chanceAskDefault`, the `/api/state` payload (the two
list toggles are screen state), `seasonalSignal()`'s rule. J-0001's working close is not touched.

### What the next session inherits from #49

- **J-0001 is still v1 (b)**: its close was working at Alpaca (GTC, $7.62). Nothing here cancels, resends or re-prices it.
- **The live season and every live PAST YRS tile are unread**: the whole series is read since 0b, so which months
  count can move on the owner's phone; the sandbox cannot call Alpha Vantage.
- **The replay wraps a window past December to the same row's January** (moved unchanged from App.jsx): a November
  start held 75 days reads Nov, Dec and that year's Jan, not the next one's. Fix it in `histBacktest()` and Build's
  `runReplay()` together, after v1.
- **The sweep left the type rule, not the tokens**: sentences still in mono — App.jsx 148 mono / 31 sans spreads,
  pro.jsx 102 / 0 — and two files named in `ui.test.jsx`: visuals.jsx's drawings and main.jsx's crash screen (6 literals).
- Build's backtest panel still runs behind its button; the top card's PAST tile runs on its own.

## Done in PR #48 — one market registry, measured season, Signals decide, Order by, the sweep

**Task 0 — the debts #47 left.**
- **0a** A record whose order was replaced from Alpaca's own screen now follows it: `adoptReplacement()` in journal.js
  is the one update (Modify's `onReplaced` calls it too). The sync reads it off the open-order list (`replaces`, no
  extra call); the recheck follows `replaced_by`. The timeline says so once. Tested on a J-0001-shaped close.
- **0b** Positions' "at entry vs now" reads `CARD_LABELS` in the card's order (YOU RISK, MAX PROFIT, CHANCE, RETURN ON
  RISK); `FIGURE_LABELS` is gone and `positionView.test.js` holds the two equal.

**Task 1 — one market registry.** `src/markets.js` (plain JS): one row per market — ticker, name, category, step,
proposable, weather (applies, or why not), newsQ, the iv/sigma fallback references. `BASKET`, `getU()`, the weather rule
in `factorsOf()`, `basket.js`, the demo's seed list and the copilot's market list derive from it. Categories: Grains
(CORN, SOYB, WEAT), Energy (UNG, BOIL, USO, XLE), Metals (GLD, SLV, GDX). Find's markets control is grouped ("2 of 3 ·
all / none"); the results filter reads "All N · Grains n · Energy n · Metals n" and a category opens its tickers'
counts. `markets.test.js` adds a dummy row through `buildRegistry()` and checks every derivation sees it and the UI
never does.

**Task 2 — the season, measured only.** `SEASONAL` is retired. `statsFromMatrix()` returns per month the years and the
standard error. `seasonalSignal(stats, month, dte)` in rules.js is the one home: a month counts at |mean| ≥
`RULES.seasonalSignalT` (2) × its standard error; the window mean averages the counted months over the whole span.
Readers: the season factor (direction and strength from the counted mean, today's ×40 formula; the ±0.8% band is
gone), the chance's drift (counted mean × 12 / 100), the position thesis, `autopilot.mjs`, the desk's confluence line.
Fused results are keyed by (market, days held): Find on each board, Build on the trade, Positions on days left
(`season.test.jsx` holds one answer per market and expiry). Before the series loads the season is "not read": the factor
is excluded with that reason and the chance drifts at zero, labelled "prices only". The Why sheet has a season row
("Jun −3.5% ± 1.6% (16 yrs) · counts"); every card says "chance: prices + season" or "chance: prices only".
Measured on avFixture series (`node scripts/measure-season.mjs`; the live series is not reachable from the sandbox):
markets with no season built in had 0–2 months of 12 count (8 false positives in 132 tests, ≈ 6%, about what a 2-σ rule
gives on ~10 years); the season factor is zero for 8 of 11 markets for October's 45-day window; drifting the 31 fixture
cards on the counted months instead of every month's mean moves their chance by a median 3.3 points (largest 7.5).

**Task 3 — Signals decide.** `signalDirection()` in signals.js: s = score × confidence / 100; Bull at s ≥
`RULES.directionSignalMin` (12.5), Bear at s ≤ −12.5, CONFLICT always Neutral, never "Very". A market shows its
suggested family plus the Neutral family (Neutral only while reading or when the suggestion is Neutral); each card is
tagged "↑ bull · signals" or "→ neutral"; when signals land: "CORN: signals in, Bull cards added". `suggestionScore()` /
`suggestionOf()` are retired. Measured (`node scripts/measure-signals.mjs`, fixtures): CORN 2 Oct was 4.00 → Very Bull
(the season 45% of it), now s = 55.0 → Bull + Neutral; 31 of 50 market × reading pairs change family; a directional
fixture board shows 4–5 cards where it showed 2–3; generation on the fixture boards 110 → 122 ms.

**Task 4 — Order by, and how the numbers fit.** "Order by": Expected value (default) · Expected value + signal · Chance ·
Return on risk, synced as `settings.findOrder` (the one payload change). Only "Expected value + signal" adds
`signalAdjustment()`, and only then is CONFLICT last. The card's fold says "Why this place: expected value −12.0 per
$100 + signal +27.5 = 15.5" (`placeLine()`, the same figures `findOrderCompare()` sorts on). The badge reads "CORN ↑ +64
· conf 86". An ⓘ "How the numbers fit" beside the results line and on the Why sheet, written from the constants
(`numbersFitLines()`; signals.test.js holds every number to its function). **P2 (rank by edge at the price that fills)
is done as "Expected value", now the default.**

**Task 5 — the sweep, as far as a file boundary.** Removed `StepNav`, `onCardLine()` and EvidenceBar's leftover chip
text. Migrated one commit each, tests unchanged except the sweep test: `steps.jsx`, `why.jsx`, `positionCard.jsx`,
`wizard.jsx` (now in `ui.test.jsx`'s sweep), and `visuals.jsx`'s HTML text (its SVG drawings keep their sizes, so it is
not in the sweep list). Red for errors only on those files: a down reading and a loss are violet, a CONFLICT and a low
confidence amber, CLOSE `T.action`. Counts (`node scripts/measure-sweep.mjs`), before → after:

| File | fontSize literals (under 12px) | mono / sans | atom copies |
|---|---|---|---|
| steps.jsx | 12 (8) → 0 | 8 / 6 → 0 / 10 | mono → none |
| why.jsx | 45 (25) → 0 | 33 / 0 → 4 / 26 | Lbl, Stat, mono → none |
| positionCard.jsx | 29 (0) → 0 | 16 / 13 → 6 / 23 | mono → none |
| wizard.jsx | 44 (4) → 0 | 8 / 37 → 4 / 39 | Chip, mono → none |
| visuals.jsx (HTML text) | 4 (1) → 0 | — | mono → none |

**Words** (`node scripts/measure-words.mjs`): find 309 → 315 and build 244 → 250 — the badge's words were JSX the counter
could not see and are now a scored generator (the real change is one word, the ticker); ceilings moved by exactly that,
with the reason in voice.test.js. Rendered on J-0001: Positions 112/120, one order 32/35, close confirm 29/30, Modify
38/38 — PR #47's budgets untouched.

**Not changed:** `orderBody()`, closeOrder.js, modifyOrder.js's send paths, `closeLimitPrice()`, riskGate.js rules,
alpacaContract.js, the seven gate calls, every `RULES` value but the two new ones, `SIGMA`, the payload beyond
`settings.findOrder`. J-0001's working close is not touched.

### What the next session inherits from #48

- **J-0001 is still v1 (b)**: its close was working at Alpaca (GTC, $7.62). Nothing here cancels, resends or re-prices it.
- **The season is not read until each market's Alpha Vantage series loads**, so on a cold start every chance says
  "prices only" and the season is out of the score. The live series has never been seen by `seasonalSignal()`.
- DONE IN #49 (0b): `parseAvJson()` reads the whole series (it kept ten years).
- DONE IN #49 (Task 4): the sweep of App.jsx and pro.jsx (tokens and atoms); card.jsx's CONFLICT badge is amber.
- Under "Signals decide" Find builds two families per directional market; on a phone this is the cost to read (PR #49).

### What the next session inherits from #47

- **J-0001 is still v1 (b)**: its close was working at Alpaca (GTC, $7.62) when this was written. Nothing here cancels,
  resends or re-prices it. Read from the production address: the card's line, Orders, the fill, "File in Journal".
- The live `/v2/clock` and `/v2/account` replies have not been seen: the fields are alpaca-py 0.44.0's.
- The sync still auto-imports a new Alpaca holding on its first read, so "Not in the app" shows mainly when that import
  has not run (or failed).
- The bar floats above the 80px Netlify badge strip; if the badge is gone from production, `BADGE_H` can drop.
- DONE IN #48: `StepNav`, `onCardLine()` and `EvidenceBar`'s leftover chips are removed.

### What the next session inherits from #46

- **v1 (b) is still J-0001's close, and now also the first live Modify.** Read from the production address: the orders
  row (limit beside the mark), Modify → price → send → fill → "File in Journal". A `PATCH` on an options order and GTC
  on one have never been observed.
- DONE IN #48 (0a): a record whose order was replaced from Alpaca's own screen adopts the new id.
- Modify of a multi-leg OPENING order lands on Build at today's market; the chosen price is written in the message,
  not pre-filled into the ticket.
- "More on <TK>" draws open interest, the price chart and the season for the card's market; the year-by-year replay and
  the simulation stay Build's (they are about the trade).

### What the next session inherits from #45

- **DONE IN PART BY #47 (the bottom bar, red for errors on the surfaces it touched); the sweep is #48's. Was: PR #47 =
  the design-system sweep of the remaining screens plus ONE bottom navigation bar (mockup first), and red
  reserved for errors.** Still on their own copies and sizes: `App.jsx` (Btn, Panel, Lbl, Stat, `mono`, `sansUI`),
  `pro.jsx`, `positionCard.jsx`, `wizard.jsx`, `why.jsx`, `visuals.jsx` (its drawings keep their own sizes; the card
  names a 12px axis label through `labelSize`), `steps.jsx` (`StepNav`, `EvidenceBar`, `DeskCountLine`). (`orders.jsx` is already on the atoms and tokens.)
  `positionView.js` keeps `FIGURE_LABELS` = RETURN ON RISK, CHANCE, PROFIT, RISK, which no longer equals the Find
  card's four labels (YOU RISK, MAX PROFIT, CHANCE, RETURN ON RISK); move Positions' "at entry vs now" onto
  `CARD_LABELS` in that sweep. Red is still used for sentences that are not errors (a sell side, a stop sign).
- **The default chance of 50% hides most of the list on fixtures (5 of 31).** It is a RULES value and was not touched;
  read the live distribution (`scripts/measure-find.mjs` prints the fixture one) before moving `chanceAskDefault`.
- **DONE IN PART BY #46:** the close's bid / mid / ask and Alpaca's mark are on the order row, and the close's price is
  chosen between the side that fills and the mid. Order types stay limit only. Original note: **The owner asked, with
  J-0001's closing screen attached, for every order type Alpaca offers and for what a close
  really costs in bid/ask spread.** NOT DONE then: it is an order-path change and v1 (b) is being read on that path. The
  screens show a close at a credit of $8.23 working ("0 of 9 combinations sold") while the broker's row marks the
  put at $7.90 (the limit is above the broker's mark). After v1 (b): (a) show the close's effective cost beside the
  limit (the structure's bid, mid and ask and what crossing costs, as `crossingCostNote()` already does on open);
  (b) decide which order types a close may use. `alpacaContract.js` mirrors all five of alpaca-py's `OrderType`
  values and says a multi-leg order is market or limit only; which of the five Alpaca accepts on a single-leg option
  has NOT been checked against the live API. CLAUDE.md's rule stays: a close is always a limit priced at the tap.
- Find recomputes the whole list when a chain refreshes; the "split the chance out of the memo" item is now only
  about that, since a slider no longer touches the memo.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **(a) is verified and (c) is read for HOLD. v1 now
waits on one reading: J-0001's close (b), which also shows CLOSE (c). J-0001 reads CLOSE since
PR #44. It must be closed with "Close at limit" and then filed with "File in Journal" _from the
production address_: the Journal lives in that browser only.**

### What the next session inherits from #40 to #43

- The PR #39 debt is closed: ranking and every floor, `minRewardRisk` included, read the fill.
- A record Alpaca does not hold is not counted as a rule close (#43), and the filing dialog no
  longer prints a rule's sentence over it (#44).
- After a 2xx cancel, the Positions card waits for `recheckOrders()` to read `canceled`; if
  Alpaca never reports it, "Ask Alpaca again" is the only control left. (From #39.)
- Find recomputes the whole list when a chain refreshes; if the owner's phone lags (PRD §4.5),
  split the chance out of the memo so only survivors of the current request are simulated. (A slider no longer
  touches the memo since #45; this is only about a chain refresh.)
- `staleBoardShare` 0.15 sits between two readings (BOIL 20%, SOYB 7%). Count inverted pairs
  on a week of live boards (`monotonicityBreaks()` on each Find board) before moving it.
- Under free sizing `riskOk` is null, "no limit applied" (#43); the weekly report's P&L split
  is the reading for free sizing.
- The close preview's words are tested on J-0001-shaped payloads only (#43). The first live
  close of J-0001 is the reading: the confirm step, Alpaca's order, and the fill.
- A position opened before PR #41 has no `sizingFree` field and is filed as `false`.
- Two browsers still write one server copy: whichever saves last wins. PR #42 only stops an
  EMPTY browser from doing it. The Journal is not on `/api/state` at all — deferred, see the
  first item after v1.

### The one owner reading left for v1

- Close J-0001 with the Positions card's "Close at limit" (order path 3), at the latest on its
  time exit, 9 Oct 2026 (21 DTE); it reads CLOSE now. Report the confirm step, Alpaca's order and
  the fill, sign included; then tap "File in Journal", **from the production address**. That is
  v1 (b), and CLOSE for v1 (c).
- **Nothing else is asked of the owner until then.** Every other item in PRD §4 is read when
  it happens in normal use, never requested.

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **DONE: PR #48** — the market registry, Find by category, the measured season, Signals decide, Order by, and the
  sweep of steps.jsx, why.jsx, positionCard.jsx, wizard.jsx.
- **DONE: PR #49** — one sorted list, no chance minimum by default, FUTURE (MONTE CARLO) and PAST YRS (BACKTEST) on
  every card, the whole Alpha Vantage history, visible ⓘ labels, and the sweep of App.jsx and pro.jsx.
- **DONE: redesign PR 1** — Find version B, the market page, the event calendar, dark by default.
- **NEXT: redesign PR 2** (Build, the review sheet, Why this trade, the copilot inside Build), then **PR 3** (Positions,
  Orders, the Journal, Settings).
- **FIRST: PR #50 = basket expansion with a measured admission rule.** The owner pastes `/api/liquidity` for the
  candidate tickers; a market is admitted when its open interest clears the liquidity floor AND Alpha Vantage holds at
  least **N = 14 years** of its monthly history. N is set from what `seasonalSignal()` needs: a month counts at |mean| ≥
  2 × sd / √n, so for a move as large as CORN's measured June (−3.46% on a ≈ 6.4% monthly volatility) to be able to
  count, n ≥ (2 × 6.4 / 3.46)² ≈ 13.7 → 14 years; with fewer, only moves larger than any the owner has measured can
  count, and the PAST YRS tile replays fewer than 14 rows. A market enters as one `markets.js` row. Measure Find's cost on
  a phone (PRD §4.5). Not started.
- **What the sweep left** (under #49's inherits): sentences in mono in App.jsx and pro.jsx; visuals.jsx's drawings;
  main.jsx's crash screen.
- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref, so a
  second browser keeps the Journal. Deferred on purpose (24 Sep 2026): changing the sync of
  the only live record before its first live close is the wrong week.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
