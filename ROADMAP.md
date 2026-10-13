# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in PR 68 (owner, 12 Oct 2026): P5 — the exit rules replayed, the chart at the exit, the chances checked

The third of three stacked PRs (66 → 67 → 68). Stacked on PR 67. **The logic only, with no data shown** (the owner, 12 Oct
2026: "implement the logic but without data, otherwise they pass for real"): every number below the code is computed on
the owner's deploy from real daily closes, on a tap; this environment reads none, so **the owner's P5 question is not
answered with numbers here** — its answer is one tap away on Build, or one command away (`scripts/measure-exits.mjs`).

- **68.0 — the design** (in the plan; no stop: the free limits hold it). *Data:* daily closes from `/api/bars` (Alpaca
  IEX, else Alpha Vantage's daily series; up to 1,900 days, about five past years), the series the chart already reads —
  no new call against Alpha Vantage's 25 a day, none against its monthly cache. *Past option prices:* Black-Scholes at the
  **realised** volatility of the 20 sessions before each entry (`RULES.replayVolDays`), since past quotes are not available;
  implied volatility usually sits above realised, so premiums are usually understated — said beside every result.
  *Trades:* every session of today's month in each past year, the loaded structure re-struck at today's moneyness, today's
  days to expiry; this year left out. *Reported:* with the rules, held to expiry, and the stop as an exit — in profit, the
  average and the worst per $100 at risk, days held; the exits by rule; how often the stop warning fired and how many of
  those still won.
- **68.1 — `exitBacktest()`** (engine.js, beside `histBacktest()`, which is unchanged; `realisedVol()`): held day by day
  until the first of the take profit (`takeProfitTarget()`, through `exitReplayPolicy()` in rules.js), 21 days to expiry,
  or the expiry; the stop level recorded as "would have warned" with its day, never an exit. Tested on synthetic series
  only (engine.test.js: a rise takes profit early and leaves money on the table; a fall warns, and exiting at the warning
  loses less; sideways a credit spread leaves at 21 days; determinism; an unfinished window dropped).
  `scripts/measure-exits.mjs <dir>` reports per market and per family (templates in strike steps) from the owner's saved
  `/api/bars` replies; with none it says so and prints no number.
- **68.2 — where it shows.** Build's "Exit rules, past years", under the backtest panel in "More on this trade ▾": one
  button; the closes are read on the tap; the table (With the rules · Held to expiry · Stop as exit), the exits, the
  warning, and the owner's question answered from those numbers (`exitReplayVerdict()`). No closes: "The daily closes are not
  loaded …, so nothing is replayed." **The chart's toggle "At expiry / At the 21-DTE exit"** (deferred from PR 63): at the
  exit the right-edge line, the zones and their chances, the bars and the crosshair are read on the exit day — each leg on
  its own IV with 21 days left (`exitCurve()`, `curveZones()`, `exitPnlAt()`), on the lognormal to that day.
- **68.3 — the Journal checks both chances.** A trade opened from now on stores `thesis.marketPop` beside `thesis.pop` (a
  field of the record's thesis, not a new /api/state field). The Journal's "Which chance came true" (`chanceCalibration()`,
  journal.js) waits for `RULES.calibrationMinTrades` (10) closed trades carrying both and a result read from a fill: until
  then "N trades so far — too few to judge"; then, per band, what each chance said and how often it won, and each Brier score.

**Measured.** Tests 1,473 → 1,487, 0 failed. Build 1,519.03 → 1,533.08 kB (the usual chunk warning). Audit 20 boards, dark
and light: 5,248 ✓, 0 unexplained. Words: no ceiling moved (the replay is in a fold; the toggle's words are `CHART_WHEN`'s).
Photographs: docs/screens/pr68/ (`node scripts/shoot-pr68.mjs`): the chart at the exit, the replay at rest and after the tap
(the fixture's closes cover this year only, which the replay leaves out: "No finished window …"), the Journal's section with
the fixture's records (none carries a market chance: "0 trades so far"). No photograph shows a number from a made-up series.

**Not changed:** the gate, every existing RULES value (the exit rules included: the replay informs a later owner decision,
it changes no rule), the order paths, `histBacktest()`, the /api/state payload's fields.

### What the next session inherits

- **The owner's P5 answer is one tap away**: on the deploy, Build → More on this trade → "Replay the exit rules ›", per trade;
  or every market and family at once: save each `/api/bars?sym=<TICKER>&days=1900` reply and run
  `node scripts/measure-exits.mjs <dir>`. Then the owner decides whether any exit rule changes (a later PR; none changes here).
- The Journal's calibration starts counting with the first trade opened after this merges; it judges at ten.

## Done in PR 67 (owner, 12 Oct 2026): Build like IBKR's Option Wizard — the market's chance, scenarios, Greeks, costs

The second of three stacked PRs (66 → 67 → 68). Stacked on PR 66.

- **67.1 — the market's chance, IBKR's method** (`src/impliedDist.js`, plain JS, imports nothing; read once in rules.js by
  `marketDistOf()` / `marketChanceOf()` beside `chanceOf()`, spelled once in App.jsx by `marketChanceCheckOf()` beside
  `chanceCheckOf()`, one fit per board and expiry `boardDistOf()`). One expiry's out-of-the-money quotes at their mid (a
  choice: IBKR does not say which price), segments between listed strikes with their mass at the midpoint, the tails at
  ⅔ of the lowest strike and 20% above the highest, fair pricing with no interest, non-negative least squares under Σ = 1.
  A board `boardLooksStale()` calls stale, or with fewer than `RULES.impliedMinQuotes` (4) usable quotes, gives no number
  and says why (`MARKET_CHANCE_NOT_READ`). **A small smoothing penalty** (0.01 × the median strike width on the second
  difference) tames the zig-zag the midpoint rule leaves on quotes rounded to the cent — measured in impliedDist.test.js:
  a 1-cent move moved a chance by up to 0.25 points without it, 0.05 with it. **The solver** (`simplexLS()`: Lawson–
  Hanson's active set with Σ = 1 held exactly, its Cholesky factor grown a column at a time) fits a 60-strike board in
  about 5 ms and a 150-strike one in about 17 ms on a desktop CPU (the first version, Σ = 1 as a weighted row solved by QR,
  took 26 and 63 ms at 60 and 100); one fit per market and expiry, cached on the chain. Tests: (a) IBKR's example (510 call 6.45, 515 call 4.40) reads
  back exactly 0.56 / 0.06 / 0.38 with no penalty, within a point with it; (b) a flat-IV board gives the lognormal's own
  chance within 0.11 points (1 allowed); (c) a put skew lowers a far out-of-the-money credit put spread's chance (91.0%
  against 93.7% flat) and the market's equals the prices' own answer — **near the money the same skew raises it** (75.0%
  against 70.6%; changed from the plan's wording, tested both ways); (d) determinism, and a 1-cent move moves nothing.
- **67.2 — two chances on the card, the row and Build.** The CHANCE tile reads "Market 71%" then "OSL model 74%"
  (`chanceLines()`, `CHANCE_LINES`); past `RULES.chanceGapPoints` (5 points) one line under it says why
  (`chanceGapOf()`, `chanceGapLine()`: the season against the same model at zero drift; the market's tails past ±1.5
  standard deviations against one volatility, "(skew)" when they lean opposite ways), amber when the market's is lower —
  the one sentence a card carries besides its name and legs (card.test.jsx names it). Find's row adds "· mkt 71%" (the
  owner's leaning); the sort stays on the OSL model. Build's FUTURE box lists both, then the line or "Market chance not
  read: …", then "The two chances ⓘ". The copilot reads both (Build's `chances`, Find's Compare `chanceMarket`, Build's
  other cards). figures.test.jsx holds card = compact card = Build = row for both chances and the line.
- **67.3 — the scenario table under Build's chart** (`scenarioGrid()`, tradeChart.js): today's price moved by the largest
  move in thirds (1% · 5% · 10% · 30%, default 30%, IBKR's "Variaz. max"); rows Price, P&L $, Delta, Gamma, Vega, Theta for
  Build's size; **Today** (Black-Scholes on each leg's own IV, `legsAt()` in engine.js — the same function Build's "now"
  curve and its Greeks now read) or **At expiry** (the one payoff; Greeks zero, as IBKR shows them). One set at a time
  (a phone holds seven columns, not fourteen: changed from "a second column set").
- **67.4 — Greek tabs above the chart**: P&L (the chart as it was) · Delta · Gamma · Vega · Theta, each drawn against price
  today and on the exit day (`greekCurves()`), with a dot at today's price where the broker sent the figure for every leg
  (`brokerGreeks()`, read; a partial sum is never drawn). The chain parsers now keep gamma and vega (the owner's answer:
  "read all four"); Build's Legs list prints the broker's delta where it has one.
- **67.5 — costs, said, never subtracted** (`BROKER_COSTS`, `costsFor()`, `costsLine()` in rules.js): "Costs: $0
  commission on Alpaca, 0% of the debit (regulatory fees not counted)" on Build's Order and in a card's Details; IBKR is
  `<Placeholder id="costs-ibkr">` ("Not connected yet") with the owner's IDEM rate (€2.00 a contract a side) and the US
  combo report stored, and no US rate invented. riskGate.test.js holds that no gate, ranking, floor, alternative or order
  path reads a cost.
- **67.6 — owner checks and the defined-risk sweep.** PRD §4 #9 is the OWNER CHECK "Market chance = IBKR's", with its
  steps. figures.test.jsx sweeps every structure Find builds on the fixture boards (31, every view) and every move Optimize
  reads off the board from them (150): none has an uncovered short leg (`undefinedRiskLegs()`, the gate's own check).

**Measured.** Tests 1,448 → 1,473, 0 failed. Build 1,496.42 → 1,519.03 kB (the usual chunk warning). Audit 20 boards, dark
and light: 5,248 ✓, 0 unexplained (no board draws the new sections). Words: build 518 → 610 (both chance lines, the Greek
tabs' readout and legend, the table's words, the costs line; written in voice.test.js); find and market unchanged.
Photographs: docs/screens/pr67/ (`node scripts/shoot-pr67.mjs`, 14 shots, dark and light).

**Not changed:** the gate and every existing RULES value, the seven order paths, `chanceOf()`'s own arithmetic,
`histBacktest()`, `seasonalSignal()`, the /api/state payload, findGen and the sort.

### What PR 68 inherits

- The market's chance has met fixture boards only; equality with IBKR's screen is the owner's check (PRD §4 #9).
- The Greek dot and the leg deltas read the broker's figures only where the feed sends them; the live Alpaca snapshot's
  gamma and vega have not been seen (this environment's Alpaca credential is refused).
- `thesis.marketPop` (PR 68) can store `marketChanceOf()`'s figure at entry: the function exists and is held equal on the
  card and on Build.

## Done in PR 66 (owner, 12 Oct 2026): Find — four chips, from your view of the market

The first of three stacked PRs (66 → 67 → 68), planned together and approved by the owner on 12 Oct 2026 after comparing
OSL with IBKR's Option Wizard. The plan's four questions were answered: the View's target picks the family; it is in
expected moves; Alpaca's four Greeks are read (PR 67); PR 68 builds the exit replay's logic with no data (nothing shown
that could pass for a real result).

- **66.1 — the chip row is View · Style · Max loss · ⇅ Sort · More** (it was eight chips and two toggles hidden in sheets).
  *View* (`FIND_VIEWS`, `dirOfView()`, `viewOfDir()`): Signals decide · Up · Down · Range; Up and Down take a target in
  expected moves (0.5–3×, default 1×), which picks the family findGen builds — up to 1.5× the Bull (Bear) cards, beyond it
  the Very ones — and is written as a price on the top row's market ("CORN $13.24 → $15.97 by 18 Dec") and on the market
  page ("View: Up to $15.97, your choice"). `find.dir` stays the family; a target moved inside one family re-builds
  nothing. *Style* (`FIND_STYLES`, `styleOf()`): Cautious · Balanced · Bold set the chance and return floors, print the two
  numbers, keep the sliders under "Set them yourself", read "Custom" when moved. *Max loss*: the budget, unchanged.
  *⇅ Sort*: four orders — "Future avg + signal" removed (a stored "evSignal" reads as Future avg; `placeSignal()`, the
  card's sum line and the "+ signal" line of "How the numbers fit" deleted; `signalAdjustment()` kept for `rankScore()`).
  *More*: Debit · Credit · Both (new: `request.side`, the card's `entryNet` sign, a miss dimmed with its reason), Horizon,
  the three list toggles, the Liquidity panel as a fold. The words are rules.js's (`FIND_CHIPS`, `chipPartsOf()`,
  `chipText()`, `chipOffDefault()`, `moreOffCount()`).
- **66.2 — the filter that binds** (`bindingFilter()`, rows.js; words `bindingFilterText()`): when rows are dimmed, the
  control that leaves out the most markets — counted from the same `meetsRequest()` misses — and one fix: "Style Cautious
  leaves out 5 markets · Loosen ›" (to Balanced), "Credit only leaves out 4 markets · Both ›", "Max loss $500 leaves out 3
  markets · Max loss $750 ›" (never past the per-trade limit; over it, "· over your per-trade limit" and no fix).
- **66.3 — tests and measurement.** Every chip and every More item, the migrations (verybull, evSignal), Debit/Credit on the
  10 credit and 21 debit fixture cards, the binding line and its fix, and the memo-deps check (now also forbidding the
  target, the style and the side). `node scripts/measure-find.mjs` (PR 66's section): **Cautious (chance ≥ 50% · return ≥
  25%) 5 of 31 cards · Balanced (any · 25%) 31 · Bold (any · 150%) 19 · Debit 21 · Credit 10 · Both 31**; rows 2 of 2 in
  each (the fixture has two markets). Before PR 66 the same requests (chance 50%, return 150%) kept the same cards; Debit ·
  Credit did not exist (31).
- **66.4 — Broker change**: the owner's decision of 12 Oct 2026 is below, in its line.

**Measured.** Tests 1,439 → 1,448, 0 failed. Build 1,488.32 → 1,496.42 kB (the usual chunk warning). Audit 20 boards, dark
and light: 5,258 → 5,248 ✓, 0 unexplained (the board still draws the eight chips: five of its words per theme are skipped
with their reason, `R.chips`; the order and budget chips are paired with the app's 4th and 3rd). Words: find 184 → 157
(five chips, not eight), market 487 → 477 (the "+ signal" sum left the cards); the binding line (7 words, only when rows
are dimmed) is `bindingFilter()`'s data, written in voice.test.js. Photographs: docs/screens/pr66/
(`node scripts/shoot-pr66.mjs`; the binding line on the two-market component fixture,
`ONLY=find-binding,find-binding-light node scripts/shoot-screens.mjs docs/screens/pr66`).

**Not changed:** findGen and the one sorted list, every floor, the gate and every existing RULES value, one expiry per market
(the all-expiry search stays in Optimize on Build), Build, the order paths, the /api/state payload.

### What PR 67 inherits

- Find's chips have met fixtures only: how many of the ten live rows each Style keeps is unread (PRD §4 #8).
- The binding line was photographed on the two-market fixture; the whole-app fixture's ten identical markets cannot show it.
- This environment cannot read market data (its Alpaca credential is refused, Alpha Vantage's and FRED's fail to inject),
  and the network policy blocks interactivebrokers.com: PR 67's market chance follows IBKR's method as the owner's
  prompt describes it, unread against IBKR's page.

## Done in PR 65 (owner, 7 Oct 2026): Optimize on Build, and the roll judged on the whole trade

PR 64 is a carry-over with no code: PRs 62 and 63 were merged into the branches they were stacked on, not into `main`, and
#64 brings them there. PR 65 targets `main` directly.

The owner, after 63.1's measurement: *"make it a separate run; Find presents as it is; then an Optimize tab or similar that
finds the best combination of duration and also of legs (the roll with proposals is already there, maybe it is about
optimizing that too). Plan the improvement and propose before executing."* Then, to the proposal: *"1. ok in Build;
2. I trust you to choose the objectively best solution for target profit; 3. the roll: judge objectively whether the search
principle is the same. But in a roll it must weigh the starting position more, to mitigate the risk against the initial
strategy and goal, which is maybe different."* And: the roll judged on the whole trade, as proposed; no Optimize button on
the market page's card ("Build is enough").

- **64.2 — the search, legs only** (`src/alternatives.js`). `optimizeCandidates()`: the loaded structure on every expiry the
  chain lists inside the entry window (`windowExpiries()`, plus the loaded expiry if it sits outside), and on each board
  `movesOnBoard()`: the same strikes and every move of up to `OPTIMIZE_STEPS` listed strikes up, down, wider, narrower. A
  move the board cannot list is left out, never snapped. `rollCandidates()` is the same search on the LATER expiries only
  (it took the next two × three moves); it now gets the price, so its wider and narrower moves exist (it was never handed
  one, so they never did).
- **64.3 — each candidate read as a card, ranked as Find ranks.** `floorsFor()` (App.jsx) is `shortlistWithFloors()`'s
  loop body moved out unchanged (Find's 31 fixture cards, tallies and cuts identical before and after), so a candidate meets
  Find's floors in Find's order. `readAlternative()` is `priceAlt()`'s arithmetic at module scope (so a script measures the
  same code), with `floors`, `contracts` and what Find sorts and fits on (`rank`, `cand`, `size`); `sortEv100()` is the one
  home of the "Future avg" sort figure, read by findGen's `evProfile()` too. `rankOptimize()` (rows.js): the owner's Find
  order (`findOrderCompare()`), `meetsRequest()` at the size the budget buys and the gate; fit = meets the request AND the
  gate passes; the top five that fit as O1…O5, or — when none fits — the best that miss with their reason first.
- **64.4 — the section.** "Optimize this trade" on Build under the variants (`OptimizeSection`, build.jsx): one button,
  "Find the best expiry and legs", never run on its own; then "Checked 12 on 3 expiries, 39–88 days: 6 fit your request,
  6 fail a floor. Your trade ranks 2nd of the 6 that fit." and the rows (the card's figures, the gate's line, "39 days, held
  ~18 days (exit at 21 DTE) · future avg +14.3 per $100" — `placeLine()`, why it ranks). "Load ›" puts one on Build and the
  run stays open on it; the trade already on Build says "On Build now". Not offered while a roll is on Build (its own
  judge is on the position's screen). Build's "Which variant fits best?" reads the O rows by label (`optimize` in the
  context) and recommends among them only, never one the gate refuses or one that misses the request.
- **64.5 — the width, by the rule fixed before measuring** ("two steps if one run stays under 50 ms on the fixture chains,
  else one"). `node scripts/measure-optimize.mjs` (UNG's board copied onto 1, 2, 5, 9 expiries; the app's own functions
  and gate): with 9 expiries the slowest trade took 40–82 ms at two steps, over 50 ms in four of six repeats, and 32–48 ms
  at one; two steps changed the first pick on 1 of 9 trades. **So `OPTIMIZE_STEPS` is 1.** Two is that one number.
- **64.6 — the roll judged on the whole trade** (`rollJudge()`, `rankRolls()` in alternatives.js). The close books today's
  P&L; the new trade at the SAME size held adds its P&L at expiry on the chance's own lognormal (`exactPnl()`). Refused when
  the whole trade's worst case is past the maximum loss accepted at entry (|record max loss| × size); ranked by the chance
  the whole trade gets back to at least zero, then its average; each row says "Whole trade: back to $0 or better 22% ·
  reaches your target 21% · worst -$237 · avg -$162" (the target is the take-profit set at entry). Candidates go through
  Find's floors at the size held; the summary says how many keep the risk, how many would risk more, how many fail a floor
  ("Every roll the chain lists would put more at risk than you accepted at entry" when none is left). "Prepare the roll in
  Build ›" arrives at the size held. The position's copilot reads the summary and each whole-trade line.
- **65.7 — the copilot's presets rationalized (owner, 12 Oct 2026: "not redundant, and specifically useful for the section
  they sit in"; the owner chose: in PR 65, merge Build's and a position's, add "Do the four signals agree?").** Twenty
  preset questions → sixteen. **Find:** "Which card fits best?" (the Greeks only where they separate the cards) and "What
  could change the pick?" (news and reports for the cards' own markets, no longer a survey of every market). **Market
  page:** "News impact" in the news block, and a new fold under the market's read, "Do the four signals agree?"
  (`marketSignals` in the context); the chart copilot lost "How does this relate to my trade?" (the market page hands it no
  trade). **Build (7 → 5):** Pre-trade analysis (about the trade loaded only), What would make it wrong? (now with the news
  and the calendar), Is there a better choice? (the other cards + the variants + Optimize's O rows), Explain the Greeks,
  The chart and this trade. **A position (5 → 3):** What should I do now? (review + exit), Should I roll it? (only when a
  roll is offered), Since I opened it (with the price since entry). **Two questions asked for what they were never given:**
  the market page's chart question had no trade, and "What would make it wrong?" asked for the reports before expiry with
  no calendar in its context — it now gets `eventsBrief()` (the publishers' dates, by market; null past 31 Dec 2026).

**Measured.** Tests 1,429 → 1,439, 0 failed. Build 1,475.46 → 1,488.31 kB (the usual chunk warning). Audit 20 boards, dark
and light: 5,264 → 5,258 ✓, 0 unexplained (no board draws Optimize or the roll's lines; the six fewer ✓ are the three board
phrases 65.7 retired — "Compare with the other cards", "News that could move it", "How does this relate to my trade?" —
now skipped words with their reason, `R.presets`). Words: find 184, build 518 unchanged (Optimize's 12 words at rest are
build.jsx's, which the source counter does not read; written in voice.test.js); market 479 → 487 (65.7's new fold, 8 words;
the chart's trade question, 7 unscored words, left the same screen). Photographs: docs/screens/pr65/ (`node scripts/shoot-pr65.mjs`, `+opt` copies UNG's December board onto two
more expiries — the same prices on every expiry, not a live chain).

**Not changed:** the risk gate and every RULES value, the seven order paths and their bodies, `histBacktest()`,
`seasonalSignal()`, the /api/state payload, deploy.js, events.js's dates, the copilot's model, Find's generation and its
output (one expiry per market), the variants (no floors, as before).

### What the next PR inherits

- **OWNER CHECK — Optimize on the phone:** its speed (one tap, 20–34 ms for the median trade with 9 expiries on a desktop)
  and whether five rows read well at 390px.
- The ranking has met copies of one board only: on a real chain a later expiry costs more, and how often Optimize moves the
  expiry rather than the strikes is not known.
- The roll's booked loss is today's mark; the close is priced at the tap.
- Proposed, not built: two steps of width if the owner wants the wider search (`OPTIMIZE_STEPS`); an Optimize run on the
  market page's card (the owner said Build is enough).
- The sixteen questions have not met a real answer (OWNER CHECK, PRD §4 #10): whether "What would make it wrong?" keeps to
  the calendar's dates, and "Do the four signals agree?" to the factors handed in, is unread.

## Done in PR 63 (owner, 7 Oct 2026): Find's rows and the trade chart

The third of three stacked PRs (61 → 62 → 63), branched from PR 62's branch.

- **63.1 — measured, stopped, moved (the owner's rule: "if it more than doubles, stop and tell me").** Building every
  expiry in the window more than doubles Find's work (numbers above). The owner chose a separate run: the proposal is
  the section above, waiting for a yes. Kept from 63.1, because it costs nothing: the card's Details say the days held,
  "~23 days (exit at 21 DTE)". Find's Horizon is unchanged (the nearest board).
- **63.2 — three figures on every row.** Chance · Return on risk · Avg per $100 at risk, each the card's own
  (`rowFigures()` in rows.js, replacing `rowFigure()`), the one the list is sorted by ringed (under "Past yrs" the PAST
  tile's text is added, ringed); the days and the risk in the right-hand column; the column head "Days · risk". The
  card's **Details** open with five rows (`cardDetailRows()` in rules.js): breakeven distance in % and in expected moves
  (`expectedMove()` on the chance's volatility), entry cost (the combination's bid/ask spread for the size and as a share
  of the maximum profit), IV rank ("— collecting N of 20 days" until it can be read), theta a day for the size, and the
  days held — each "—" with a word when unknown. findGen carries the spread and the IV rank on each item.
- **63.3 — "No card has a positive average today."** above the rows, when cards fit and none has a positive future
  average (the "Avg > 0" chip's own test, `futureIsPositive()`).
- **63.4 — Build's chart says more, on one distribution.** The fan, the bars, the new zones and the crosshair all read
  the chance's own lognormal (its drift and volatility, handed in; the fan used to draw on the legs' average IV and its
  own drift). Today's price is written at its dot ("13.24 · now"); each breakeven says how far it is ("BE 14.67 ·
  +10.8%"); the fan's darker band is now exactly ±1 standard deviation, its two prices written at its edge ("+1 sd
  15.51"); faint green and violet zones are `payoffBands()`'s, each with its chance — they add up to 100% and the green
  ones to the CHANCE figure (chart.test.jsx); the exit at 21 days to expiry is a dashed tick with its date ("exit 27
  Nov"). The arithmetic is plain JS in `src/tradeChart.js`.
- **63.5 — a crosshair.** A tap on the chart, a drag of the line's handle (a 44px target; the rest of the chart still
  scrolls the page), the mouse, or the arrow keys (the chart is a slider: ↑↓ a step near 0.25% of the price, Page ×10,
  Home / End) put a line at a price; under the chart: "UNG at $11.75 on 18 Dec → -$495 on 15 contracts · 37% chance to
  finish below" (`crosshairReadout()`: `payoff()` for Build's size, the same lognormal). "How to read ⓘ" explains the
  zones, ±1 sd, the exit tick and the crosshair (`howToReadChart()`).

**Later (nothing more than written here):** event ticks on the chart's time axis (the calendar, `events.js`); Bollinger
and moving-average toggles on the chart; the 21 past years as dots where each ended; an "at expiry / at the 21-DTE exit"
toggle for the payoff (waits for P5, the exit model — **done in PR 68**).

**Measured.** Tests 1,422 → 1,429, 0 failed. Build 1,465.18 → 1,475.46 kB (the usual chunk warning). Audit 20 boards,
dark and light: 5,264 ✓, 0 unexplained (two fewer ✓ than PR 62: the board's column head "Future avg · risk" on Find is
now a skipped word with its reason, `R.rows`, once per theme; Find's row gap matches the board's 10px). Words: find 184, market 479, build 518 — unchanged, with what
the source counter cannot see written in voice.test.js. Photographs: docs/screens/pr63/ (`node scripts/shoot-pr63.mjs`).

**Not changed:** the risk gate and every RULES value, the seven order paths and their bodies, `histBacktest()`,
`seasonalSignal()`, the /api/state payload, deploy.js, events.js's dates, the copilot's model, Find's generation.

### What PR 64 inherits

- **The Optimize proposal, waiting for the owner's yes and three answers** (answered and built in PR 65, above).
- The new row and the chart's marks have no board to be audited against (docs/mockups draws neither); they were checked
  by photograph only (docs/screens/pr63/).
- The crosshair has not been used on a phone (OWNER CHECK); the handle's drag and the page's scroll share the chart.

## Done in PR 62 (owner, 7 Oct 2026): numbers without noise; the copilot grounded

The second of three stacked PRs (61 → 62 → 63), branched from PR 61's branch.

- **62.1 — the chance and the future average are exact.** `chanceOf()` (rules.js) now calls `terminalExact()`
  (engine.js): the same lognormal, the same implied volatility and the same seasonal drift `terminalMC()` drew 8,000
  futures from, worked out in closed form between the strikes (the chance of each profit stretch, the average leg by
  leg, the percentiles by solving the exact distribution, the 30 bars as probabilities). The same shape; `runs`/`seed`
  became `method: "exact"`; no caller changed. `chanceSeedKey()` and `RULES.mcRuns` are gone (nothing read them);
  `terminalMC()` stays only as the proof's reference; `exitSim()` (day by day) is unchanged. **The tile is renamed
  FUTURE (MONTE CARLO) → FUTURE (MODEL)** in `CARD_LABELS`, because it is no longer a Monte Carlo; every sentence that
  said "8,000 simulated futures/runs" says what is now true.
- **Proved** (engine.test.js): on nine families (a debit call vertical, the debit put GLD 382/363, the credit call GLD
  393/412, a credit put vertical, an iron condor, an iron butterfly, a put butterfly, a long call, a long put) the exact answer sits inside 4 standard errors of `terminalMC()` at 1,000,000 runs
  (measured: within 2); a spot 1 cent apart moves the chance and the average by no more than their true slope;
  determinism replaces the seed tests; figures.test.jsx's card = Build equality holds.
- **Before → after, the same trade** (GLD Bear Put 382/363 ×7 at 6.75, 44 days): 200 seeds gave a future average of
  $752–$1,124 (sd $65) and a chance sd of 0.54 points; exact: $928.81 and 46.59%, and a cent higher on the spot,
  $926.87 and 46.572%. **On the 31 fixture cards** the chance moved at most 0.94 points (median 0.27) and the average per
  $100 at risk at most 2.57 (median 0.54); one butterfly went +1.3 → −1.1 per $100, inside the old noise. The chart's
  fan and the chance now agree to under 0.001 points (they differed by up to 1.59). Find's generation: 215–249 ms →
  87–106 ms on the 31 cards (three runs each, desktop CPU).
- **62.2 — a copilot number must exist in the app's figures.** `src/grounding.js` (+ grounding.test.js): once an
  answer is finished, every $ amount and % in it is looked for among the numbers sent (the context JSON walked value by
  value, and the standing instructions — so a rule number is never flagged, the owner's "forget these rules"); a
  rounding tolerance only (half a unit of the last digit, or of a round hundred). Strikes ("$382/$363", "$380 put"),
  "per $100", dates and plain counts are not looked at. One amber line under the answer, "Not in the app's figures:
  $1,040, 52%.", on every copilot place (`useCopilot()` — Find, the market page, Build, a position, the Journal — and
  the chart copilot); nothing when every figure is found; not while an answer is cut off.

**Measured.** Tests 1,411 → 1,422, 0 failed. Build 1,461.38 → 1,465.18 kB (the usual chunk warning). Audit 20 boards,
dark and light: 5,266 ✓, 0 unexplained (two fewer ✓ than PR 61: the board's "FUTURE (MONTE CARLO)" on Build is now a
skipped word with its reason, `R.model`). Words: market 474 → 479, build 504 → 518 (the grounding line at two sites;
reasons in voice.test.js).

**Not changed:** the risk gate and every RULES value but `mcRuns` (removed: nothing read it), the seven order paths and
their bodies, `exitSim()`, `histBacktest()`, `seasonalSignal()`, the /api/state payload, deploy.js, events.js's dates,
the copilot's model.

### What PR 63 inherits

- **The chance is exact and has no seed**: Horizon "Auto" (63.1) can build every expiry without the simulation's cost;
  the payoff zones' probabilities (63.4) read the same distribution (`exactPnl()` in engine.js).
- The CompareFigure's chance curve under the payoffs is drawn from the candidates' own `sigma`/`driftAnnual` (the same
  ones the exact chance reads); unchanged.
- The grounding line has been seen on written examples only; how often a real answer works out a figure the app never
  sent (a difference, a product) is unknown (PRD §4 #10).

## Done in PR 61 (owner, 7 Oct 2026): quick fixes from the post-PR-60 sanity check

The first of three PRs (61 quick fixes, 62 numbers without noise and the copilot grounded, 63 Find and the trade chart),
planned together; the owner answered the plan's questions on 7 Oct 2026 (a sent trade is said, never added twice; Find
builds every expiry and picks after; the copilot check ignores the rule numbers; Find's two questions use the C1…Cn
labels).

- **61.0 — the debt, by name.** Every PRD §4 item was re-read; none can be closed from the sandbox, each is re-confirmed
  with what this PR adds to it (the four OWNER CHECKS are now named in §4's header). The inherits below were re-read: the
  computer at 1024–1366 px (closed by 4a's TASK 0), the audit's "left:" leftovers (six per theme, unchanged; the AT ENTRY
  VS NOW footnote is no longer among them), the falling day change in red (still the owner's decision), the position's
  screen, the Journal and Settings with no word ceiling (still none), a news block with real headlines, a live roll and a
  real copilot answer (still unseen).
- **61.1 — ☆ is a toggle** on Find's rows, the market header, the Strategies card and `CandidateActions`: a second tap
  removes through `delSaved()` (the one remover, `withoutSaved()` in path.js); "GLD Bear Put Spread removed from Saved."
  with **Undo**, which puts back the same item (`restoreSaved()`); `ARIA.saveTrade` says what the tap will do.
- **61.2 — the copilot is not cut off**: `max_tokens` 1200 → 3000; the model's one home `COPILOT_MODEL` (rules.js, read
  by pro.jsx and autopilot.mjs; a test fails on the id anywhere else; the model unchanged). **Pre-trade analysis**: the
  verdict first, at most three reasons, the gate only for a failed check or one at `GATE_NEAR_LIMIT` (90%) or more —
  the review rows now carry each check's share of its limit. **Continue** beside Print/Clear (and on the chart copilot):
  the same context and the cut answer, appended to the same answer, filed once when whole.
- **61.3 — Compare counts cards**: the sheet's rows are `compareCards()`'s, labelled C1…Cn, the same labels in the
  context; Find's two questions name cards only by them; "N cards from M markets fit" (Find keeps counting rows); the
  standing instructions: Future (Monte Carlo) and Past yrs (backtest) answer different questions, neither more reliable.
- **61.4 — return on risk in one unit**: `returnText()` on Build's Numbers, the More's ticket and price ranges, and the
  card's "WINS BIG" sentence; figures.test.jsx now compares the PRINTED strings of the six figures, card vs Build.
- **61.5 — open risk says what it includes**: "Includes $4,500 on GDX (not on Alpaca) and $4,725 on the GLD order still
  working." under AT RISK and Build's open risk, from the gate's own terms (`limits.openRiskParts`, the summands of
  `openRiskOf()`; no rule touched). **The double count reproduced** (riskGate.test.js: USO ×17 sent and still on Build,
  $14,101 + $4,726 = $18,827); Build now shows the open risk as it is and says "Already sent as J-0008…"; the review sheet
  says a resend is a second order (the gate, unchanged, counts that one).
- **61.6 — Build says when its limit is not the card's price**: "Card at 6.75 · now 6.61: risk −$98, max profit +$98"
  (`limitMovedLine()`, the same sized figures), nothing when they match.
- **61.7 — one compare**: the tick shows its word ("Compare" / "✓ Comparing"; the card's actions on two rows so it
  fits); after a tick, "2 of 3 to compare · See them ›" above the bottom bar; the one Compare sheet (App.jsx mounts it,
  so Find, the market page and Build open it) shows the ticked cards — one picture at the size the budget buys
  (`sizedCandidate()`) and their rows — above "Compare the cards", which compares those (or the cards that fit when
  nothing is ticked). The blue tray (`CompareTray`, `ComparePanel`, drawn at the foot of the market page) is gone; its
  remove, Clear and "Take to Build" are in the sheet.

**Measured.** Tests 1,401 → 1,411, 0 failed. Build 1,452.43 → 1,461.38 kB (the usual chunk warning). Audit 20 boards,
dark and light: 5,268 ✓, 0 unexplained. Words: find 288 → 184, market 581 → 474 (the tray left), build 462 → 504
(reasons in voice.test.js). Photographs: docs/screens/pr61/ (`node scripts/shoot-pr61.mjs`).

**Not changed:** the risk gate's rules (one output field added: the terms it already sums), every RULES value, the seven
order paths and their bodies, `histBacktest()`, `seasonalSignal()`, the /api/state payload, deploy.js, events.js's dates,
the copilot's model.

### What PR 62 inherits

- **The chance is a simulation** (8,000 seeded runs, the seed moving with the spot to the cent): PR 62 makes it exact.
- **A copilot number is not checked against the app's figures**: PR 62's `grounding.js`.
- The CompareFigure's chance curve underneath the payoffs is still drawn from the candidates' own `sigma`/`driftAnnual`.

## Done in PR 4d (owner, 6 Oct 2026): the Liquidity sheet on Find, said plainly

The owner: "the liquidity floor tab and its takeaway are no longer clear". The sheet held the desk's old panel as it was:
its four buttons counted ONE market (USO, "0 of 2 shown") while the footer said "Show 10 of 10"; the takeaway (no feed
had reported open interest, so the floor filtered nothing) sat at the bottom in three paragraphs; sentences in mono, Off
in red, a ten-row table of "does not report".

- **Today's takeaway first** (`liquidityTakeaway()`): no open interest anywhere → "the floor cannot run… cards are kept or
  hidden by their price, spread, crossing cost and return on risk only"; else how many markets report it and how many
  cards it hid, and that the others are skipped, not passed.
- **The four levels as Find's chips**, each counting the cards it keeps across EVERY market (`liqPreview`, the same
  `shortlistWithFloors()` findGen runs, family by family; worked out only while the sheet is open); the setting's own
  sentence; a loosened floor's warning in amber (a warning, not an error).
- **What else keeps cards out**, one row per reason with its count (`filterFold()`'s reasons); each in full behind "why".
- **The numbers one fold down** ("The numbers behind it"): open interest market by market (the markets with none in one
  line, `noOiLine()`; with none anywhere, only that line), the floor on one board (`FloorDetail`, was LiquidityFilter:
  the strip, the arithmetic, why relative, where the two numbers come from). Sentences in sans.
- The sheet's model is assembled outside Find's step block (`liquiditySheet`): it is one tap away, so its words are not
  Find's at rest (find stays 288). **No floor value changed** (riskGate.test.js holds the four levels).

**Measured.** Tests 1,400 → 1,401. Audit 20 boards, 0 unexplained. Photographs: docs/screens/pr4/find-liquidity*.png.

## Done in PR 4c (owner, 6 Oct 2026): "What did this trade teach me?" in the Journal

Rides on PR #59 (the same branch; 4b was not merged yet).

- **The Journal's question** (place `journal`, `COPILOT_ROLE.journal`): inside an opened closed trade, its reasons at
  entry against how it ended, from the record's own words and figures (`closedTrade` in the context: `whyOpenedLine()`,
  `endedLine()`, `journalPnl()`, the factors and chance at entry, the whole timeline). It recommends nothing; the answer
  is filed with the ref and one "Asked the copilot" line goes on the record's timeline.
- **The limit, by hand** (owner, 6 Oct 2026: "I no longer see where to set the price"): it was there, a cent a tap.
  Build's limit can now be typed (`parseLimitText()`), and three quick prices sit under it — **Mid**, **Pay** (the
  market's own price), **Negotiate** (the app's starting price, `legLimitSeed()`); the one in force is pressed. They set
  the same ticket state the stepper moves; the gate checks the price as before. Words: build 458 → 462.
- **A timeline number is never repeated:** `highestSeq()` (journal.js) also reads an entry's written seq ("J-0005·02"),
  so a line appended to an older record or a fixture takes the next number, not "·01" again.

**Measured.** Tests 1,399, 0 failed. Build 1,449.90 kB. Audit 20 boards, 0 unexplained. Words unchanged (the Journal is
not a counted screen). Photograph: docs/screens/pr4/journal-lesson.png.

### What PR 4d inherits

- **The Liquidity sheet on Find, reworked** (owner, 6 Oct 2026: "its own PR"): today's takeaway on top (when Alpaca has
  reported no open interest, the floor cannot run and says so first); the four levels as Find's chips, counted across
  all markets so they agree with "Show N"; what else filters the cards, with counts; the readout table and where the
  numbers come from in one fold; markets with no data in one line; sentences in sans, Off amber. No floor value changes.

## Done in PR 4b (owner, 6 Oct 2026): Build's variants and a position's roll — one calculation

The plan agreed in PR 4a's rounds: refine a trade in Build among alternatives the app computes; roll a position that
is not in profit while its reasons hold, prepared in Build, two orders, never both open.

- **TASK 1 — the alternatives** (`src/alternatives.js`, plain JS, alternatives.test.js): `shiftLegs()`, `widthLegs()`,
  `sameOnBoard()`, `laterExpiries()`; `variantsOf()` (one step up, one down, wider, narrower, the next expiry) and
  `rollCandidates()` (the same structure on the first two later expiries inside 30–90 days: same strikes, one up, one
  down). A leg the chain does not list leaves the alternative out; nothing is snapped.
- **TASK 2 — priced like a card** (`priceAlt()` in App.jsx): `listCardFigures()`, `scaleStrategy()` for the size the
  budget buys, the gate (`gate()`, the one `evaluateTrade()` callback) at that size; its first refusal is the row's
  line (`gateLine()`).
- **TASK 3 — Build's "Variants of this trade"** with "Load ›" (a roll stays a roll when a variant is loaded), and the
  question **Which variant fits best?** (`buildVariants` in the context).
- **TASK 4 — "Roll it" on a position's screen** (`rollEligible()`: not in profit, held, no close working, no reason
  turned — else one sentence why not; `ROLL_NONE` when the chain has no later expiry in the window), "Prepare the roll
  in Build ›", the question **Should I roll it?** and the action in `positionActions()`.
- **TASK 5 — Build during a roll**: "Roll of J-0003: close J-0003 first…", Send blocked (`rollCloseFirst()`) while
  Alpaca holds it; after, an ordinary send through the gate; "Rolled into / Rolled from" on both timelines (the old
  record found in positions or the Journal). No new /api/state field, no new order path.

**Measured.** Tests 1,387 → 1,398, 0 failed (new: alternatives.test.js 7, roll.test.jsx 4). Build 1,436.40 → 1,447.17 kB.
Audit: 20 boards, dark and light, 0 unexplained. Words: build 417 → 458 (reasons in voice.test.js). Photographs:
docs/screens/pr4/ (build-variants, position-roll, position-roll-turned, build-roll; the `+roll` fixture flag).

**Not changed:** the risk gate, the seven order paths, every RULES value, the /api/state payload, deploy.js.

### What PR 4c inherits

- **"What this trade taught"** on a closed trade in the Journal: its entry's reasons against how it ended — a rolled
  trade reads its partner through the "Rolled into / from" line.
- Not seen yet: a live roll; whether the live chains list later expiries inside the window.

## Done in PR 4a (owner, 6 Oct 2026): the copilot by place, and screens that say what they show

Planned first, in three rounds with the owner: the copilot may recommend, but only among what the app built ("the app
builds, the copilot explains and recommends, the person decides, the gate checks"); the chart and the Greeks explained;
rolling a position that is not in profit; news kept, as one of the four factors, with a place per level; tabs that speak
for themselves. Split in three: **4a** (this), **4b** (the alternatives: Build's variants and the roll), **4c** (the
Journal's "What this trade taught").

- **TASK 0 — the computer at 1024 and 1280 px** (left unverified by 3b): no sideways scroll; at 1024 the market page's
  header was cut off in a 364px pane. The two panes are now `minmax(320px, 420px) minmax(390px, 1fr)`: the right pane is
  never narrower than a phone. Photographed (`shoot-positions.mjs`, computer-*-1024 / -1280).
- **TASK 1 — the standing instructions** (pro.jsx `SYSTEM_PROMPT`): the decision trees, the "Execution" step, "ask for
  confirmation before any execution" and "start with 1 contract" are gone; the trees are criteria for judging a card;
  the structures the app builds are described as it builds them (verticals, iron condors, butterflies, a single long
  option only in the very bullish or bearish families), each with its weak side. Every question opens with its place's
  role (`COPILOT_ROLE`); the "desk" place is gone.
- **TASK 2 — Find's "Compare ›"** on the summary line opens a sheet with **Compare the cards** (the cards that fit, in
  the owner's order, up to 20, from `compareCards()` in rows.js: the card's own six figures and its Greeks for the size;
  the chips' words; the misses counted) and **News impact** across the markets.
- **TASK 3 — Build**: Pre-trade analysis ends on CONFIRM, DOUBTS or DO NOT CONFIRM (`BUILD_VERDICTS`), never over a
  gate check; **Explain the Greeks** (gamma joined the context); **The chart and this trade** (`taContext()` with the
  trade's breakevens, worked out at the send only).
- **TASK 4 — a position's screen**: the questions may recommend one of the screen's own actions (`positionActions()` in
  positionView.js); "Since I opened it" reads the Greeks at entry against now; **The chart since I opened it**
  (`sinceEntry()`).
- **TASK 5 — the market page's Signals tab** (was "Overview"): the four factors as blocks titled with what they
  highlight (`factorHeadline()`: "NEWS · pushes down · 3 headlines"); News opens its headlines and Weather its regions in
  place; the news block folds "Ask the copilot: News impact on TK".
- **TASK 6** — Build's "More on this trade" sections are named for what they show; the desk's `CopilotTab` and the
  evidence sheet's Market levels / History / Copilot branches (no button since redesign PR 2) are removed.
- **TASK 7** — the word counter no longer counts a component that renders only inside a fold or a sheet.

**Measured.** Tests 1,382 → 1,387, 0 failed (copilot.test.jsx rewritten: 11 checks). Build 1,430.59 → 1,436.40 kB (the usual chunk
warning). Audit: 20 boards, dark and light, 5,268 checks, 0 unexplained (the Signals tab's name is the owner's, R.signals).
Words (the corrected counter; main re-measured 269 / 574 / 435 / 248): find 288, market 581, build 417, positions 248.
Photographs: docs/screens/pr4/ (`node scripts/shoot-pr4.mjs`).

**Not changed:** the risk gate, the seven order paths and their bodies, every RULES value, `histBacktest()`,
`seasonalSignal()`, the rules inside `fuseSignals()` and `signalDirection()`, the /api/state payload, deploy.js's rule,
events.js's dates, the chart copilot's prompt, the autopilot.

### What PR 4b and 4c inherit

- **4b — the alternatives, one calculation:** the app computes alternatives of the loaded structure from the chain
  (strikes a step nearer or further, wider or narrower wings, the next listed expiry), each priced and gate-checked;
  **Build's variants** (the copilot recommends one; "Load this variant") and **the roll** of a position that is not in
  profit while its reasons still hold: the candidates at a later expiry, "Prepare the roll in Build", the close first
  (order path 3) then the opening on Build (path 2) as a new trade through the gate, and the two records linked on their
  timelines ("rolled into J-0006" / "rolled from J-0003"). Never one 4-leg order (an eighth path), never both open.
- **4c — "What this trade taught"** on a closed trade in the Journal: its entry's reasons against how it ended.
- Not seen yet: a news block with real headlines (the fixture has none); any real copilot answer under the new
  instructions.

## Done in redesign PR 3b (owner, 6 Oct 2026): the Journal, Settings, and the app on a computer

Planned first; the owner answered the four open points: the branch restarted from main after PR #56 merged; on a computer,
two panes; Settings' extra fields folded under "More limits"; the Journal's report, analyses and floor log below, folded.

- **TASK 0 — the close confirm on a position's screen** in the board's closing state (`CloseConfirm look="screen"`):
  the order in one mono line, the book, the clock, Back / Send close; another price, quantity or TIF one fold away.
  Order path 3 unchanged; the "Not in the app" card and a multi-leg Modify keep the old look and the 35-word budget.
- **TASK 1 — the Journal** (src/journal.jsx, its words src/journalView.js): the board's record, search, OPEN (new on the
  Journal: open trades and waiting orders with the reason they were opened and their whole timeline), CLOSED TRADES with
  the net (`journalPnlTotal()`), "Refs only go up"; the report, the copilot's analyses and the entry floor's log folded
  below, unchanged inside. "Whole record ›" opens that position's entry. Two closed trades joined the fixture book.
- **TASK 2 — Settings** (src/settings.jsx): the board's order; a connection says what the app last saw of it (Alpaca's
  account and the time of the last sync; Alpha Vantage "Working" only when a market's season was measured; Anthropic
  the date of the last filed answer), never "Working" for a service nobody read. Every write is the handler it was.
- **TASK 3 — the app on a computer** (`useWide()`, `WIDE_MIN` 1024, `RAIL_W` 200 in ui.jsx): the bottom bar becomes a
  sidebar; Find's rows beside the market page; Positions' cards beside a position's screen; the Journal in two columns;
  Build and Settings at 760px. On a phone the wrappers are `display: contents`, and the 20-board audit shows nothing moved.
- **TASK 4** — the audit now covers 20 boards (Journal, Settings added), dark and light; photographs in
  docs/screens/redesign-pr3/ (`node scripts/shoot-positions.mjs`, now with the Journal, Settings and 1366×900).

**Measured.** Tests 1,372 → 1,382, 0 failed (new: journalScreen.test.jsx; the Journal's and Settings' source checks
point at their new files). Build 1,417.33 → 1,430.59 kB (the usual chunk warning). Words: find 336, market 604, build
435, positions 248 (the close confirm's screen look is counted where the "Not in the app" card mounts it; reason in
voice.test.js); J-0001's surfaces 62/120, 30/35, 35/35, 40/40.

**Not changed:** the risk gate, the seven order paths and their bodies, every RULES value, the /api/state payload (no
new field), deploy.js's rule, what Find, the market page, Build, Positions and Orders do.

### What PR 4 inherits from PR 3b

- **Find's "Compare the cards" preset** on Find, and **the system prompt's decision trees**, which still recommend
  structures (the copilot by place says it never proposes).
- **The computer's layout has no board** (the owner chose it in words): it is photographed at 1366×900 only, and a
  window between 1024 and 1366 has not been looked at. The market page's back arrow, on a computer, keeps the page in its
  pane (it returns Find to its rows; the pane shows the last market opened).
- Leftovers the audit still names ("left:"), unchanged from 3a: Find's FUTURE · PAST line gap, the price chart's
  indicator chips, the Build states' header padding, FindEmpty's second action, BuildNoData's legs, the AT ENTRY VS NOW
  footnote's wording. The market page's falling day change is still red (not an error): decide with the owner.
- The position's screen still has no word ceiling of its own; the Journal and Settings have none either (they are not
  among the counter's screens).

## Done in redesign PR 3a (owner, 6 Oct 2026): every screen against its board; Positions, a position's screen, Orders

The owner's prompt for redesign PR 3, split in two at the owner's request ("Dividi in due"): this PR is TASK 0 and TASKS 2,
3 and 4; **PR 3b** is the Journal, Settings and the layout that adapts to a computer and a phone. The plan opens the PR.

- **TASK 0a — one audit against the boards themselves.** `scripts/audit-screen.mjs` mounts each board in
  docs/mockups/src (with `render.mjs`'s `mountMockup`) beside the whole app on fixtures (`scripts/app-harness.mjs`,
  `scripts/app-screens.jsx`), pairs elements (`scripts/audit-map.mjs`), compares size, weight, family, colour, background,
  border, radius, padding, tap height and gap by computed style, looks for every board phrase on the app's screen, and
  writes a side-by-side picture per board and theme (docs/screens/redesign-pr3/audit/). A difference passes only with a
  reason: a README or CLAUDE.md rule, or a named leftover. **18 boards, dark and light: 4,424 checks, 0 unexplained.**
  The shipped Find, market and Build screens were fixed to it (sizes, gaps, sentence case, the stale banner, the reading
  bar, the Overview's factor rows, Build's three states, the review sheet's lines). `audit-build.mjs` is now its caller.
- **TASK 0b** — the desk header left Positions; BuildWarnings, TradeCard and ConfirmSteps (unmounted since PR 2) are
  deleted, their tests moved; the footer line is gone (owner: "puoi toglierlo"); the ticker strip's falling season is
  muted and a dear IV rank amber (red is for errors).
- **TASK 0c — the copilot by place** (PRD §1): every `SKILLS` question names its place; Find's "Compare the cards"
  waits for PR 4; Build explains (Pre-trade analysis, no GO/NO-GO); Positions reviews (three questions).
- **TASK 2 — Positions** on the board: its own header, the strip's three tiles with one ⓘ sentence, Positions | Orders,
  the card's badge, "J-0002 · UNG · 2 puts", title, profit and share, the board's sentence (`cardSentence()`), three
  short exits over 4px bars (`exitLabels()`), one foot, and the line for an order still waiting (`waitingOrdersLine()`).
- **TASK 3 — a position's own screen** (src/positionScreen.jsx; it replaces the Details sheet): what to do now, Close at
  limit (order path 3 unchanged) or **Keep it, write why** (a `keep` entry on the position's timeline through
  `appendTimeline()` — the /api/state payload's shape is unchanged; refused on a preview), where it pays (`paysLine()`
  and `PositionChart` in visuals.jsx), the exit plan, at entry vs now with the reasons that turned, the record's last
  four, Analyse as a new trade, Alpaca details (a sheet of the old rows), the copilot's three position questions (each
  answer filed in the Journal tagged with the ref, and one line on the timeline), the Guardian folded at the end.
- **TASK 4 — Orders** on the board: the clock and Cancel all once at the top; the row's tag, name and ref, terms and
  book, Modify | Cancel | Details; Modify inline with two steppers; the cancel confirm inline. Order path 7 unchanged.

**Measured.** Tests 1,359 → 1,372, 0 failed (new: positionScreen.test.jsx, copilot.test.jsx; rewritten: the card's,
the strip's and the Orders row's to the boards). Build 1,379.84 → 1,417.33 kB (the usual chunk warning). Words: find 336,
market 604, build 435, positions 235 (ceilings re-set with reasons in voice.test.js); J-0001's surfaces 62/120, 30/35,
35/35, 40/40. Photographs: docs/screens/redesign-pr3/ (`node scripts/shoot-positions.mjs`).

**Not changed:** riskGate.js, closeOrder.js, modifyOrder.js's send paths, `orderBody()`, the seven gate calls,
alpacaContract.js, every RULES value, `histBacktest()`, `seasonalSignal()`, the rules inside `fuseSignals()` and
`signalDirection()`, the /api/state payload, deploy.js's rule, events.js's dates, the functions of Find, the market
page and Build.

### What PR 3b and PR 4 inherit

- **PR 3b:** the Journal and Settings on their boards (the desk header leaves them; "Whole record ›" lands on the
  Journal's top, not yet on the record), the report frequency beside the report (owner, point 10), and the layout that
  adapts to a computer and a phone (owner, point 8: "va bene da mock up").
- **Leftovers the audit names ("left:")**: Find's FUTURE · PAST line gap, the price chart's indicator chips, the Build
  states' header padding, FindEmpty's second action, BuildNoData's legs (the fixture loads none), and the AT ENTRY VS NOW
  footnote's wording (the board says "Now is Alpaca's last price"; the app's NOW is what is left from here). **The close
  confirm** inside a position's screen keeps its PR #46 look (the price slider and the chips): it is shared with the "Not
  in the app" card and a multi-leg Modify, and sits at its 35-word budget — PR 3b restyles it with the owner.
- **The position's screen has no word ceiling of its own** (it is built outside the Positions block, like the Details
  sheet was). The board's multi-leg Modify "replaces in place": the rule wins (cancel → wait → a new order).
- **PR 4:** Find's "Compare the cards" preset on Find, and the system prompt's decision trees, which still recommend
  structures (the copilot by place says it never proposes).
- The day change on the market page is still red when the price falls (not an error): PR 3b decides it with the header.

## Done in PR #54 — Build checked against the mockup, value by value (owner, 5 Oct 2026)

The owner asked, after PR #52 and #53 merged, to verify that Build carries every element of the mockup with the same
look. The mockups themselves are not in the repository; the check is against the values the redesign PR 2 prompt wrote
for "3 · Build" and "Build · review, then send".

- **`scripts/audit-build.mjs`** (new, same harness as shoot-build: the whole app on fixtures, 390×844): reads every
  value the mockup gives with `getComputedStyle` — sizes, weights, letter-spacing, borders, radii, paddings, tap heights,
  colours from theme.js — and looks for the mockup's words on the screen, the review sheet and the sent state. Before
  the fixes: 62 of 64 style checks matched.
- **Three differences fixed** (src/build.jsx only):
  1. Delta and Theta were mono 18; the mockup says mono 15 bold.
  2. The grid's labels read "MAX PROFIT · MAX LOSS · BREAKEVEN · RETURN ON RISK"; the mockup writes "Max profit, Max
     loss, Breakeven, Return on risk" (and the loading state's "Chance"). Sentence case is derived from `CARD_LABELS`
     (one home), as the FUTURE box's "Chance" already was.
  3. On "no quotes" a leg printed "— / — · Δ —"; the mockup prints "bid — / ask —".
- After: **89 of 89** checks match, dark and light; nothing scrolls sideways.

**Measured.** Tests 1,359 → 1,359, 0 failed (build.test.jsx's checks rewritten to the mockup's words and sizes). Build
1,379.74 → 1,379.84 kB (unstamped), the usual chunk warning. Words unchanged: find 327, market 587, build 428, positions
207; J-0001's surfaces 113/120, 32/35, 35/35, 40/40. Build at rest 2,589px. Screens re-shot in docs/screens/redesign-pr2/.

**Not changed:** everything outside src/build.jsx, its test and the new script. Every RULES value, the gate, the order
paths, the /api/state payload, Find, the market page, Positions, Orders, the Journal, Settings.

### What the next session inherits from this check

- **Not in the mockup, kept (no function is dropped):** the STOP SIGNS line under the title (the gate's own stop signs,
  red as a refusal), the app-wide footer under every screen ("Paper trading only · … · Educational software"), still mono
  sentences, and the status banner above the header (e.g. "Loading SOYB option prices…"). PR 3 decides with the owner.
- The loading and no-quotes states print the title and the "for <date>" only when an expiry is known; the fixture's
  market never answered, so they show the ticker. Words follow the data, never a made-up date.
- **Redesign PR 3** (Positions, Orders, the Journal, Settings) waits for its prompt and its mockups' values. (Done in
  part: PR 3a above.)

## Done in redesign PR 2, part B (owner, 5 Oct 2026): Build, the review sheet, Why this trade, the copilot

Planned first (with part A); the owner took every recommendation: the five lines are the trade card's with the mockup's
labels, the tick is the app's cent, the review sheet carries an open-interest row read off Find's floor, "no quotes" is
`buildScreenState()`'s "no-market-data", the local-book confirm only without Alpaca, the copilot's other questions in
"More on this trade ▾".

- **Task 1 — the inventory** (in the PR): every piece of today's Build has a place; what the mockup has no place for is in
  "More on this trade ▾" in today's form. Nothing deleted.
- **Task 2 — Build's look** (`src/build.jsx`, on ui.jsx's atoms): header row, title, What this trade does
  (`tradeTakeaway()`, rules.js, and `UnifiedView` brought to the mockup: 60 sessions, a blue 68/95% fan, the ending bars,
  the payoff at the edge, the labelled breakeven, today's dot, no 560px floor), The numbers (the card's figures,
  figures.test.jsx), Why this trade (`factorStands()` beside `signalStance()`; `reasonRuleText()` from
  `AGAINST_MIN_SCORE`), the copilot (`useCopilot()`, three new SKILLS that never propose), Legs with Edit in chain (the
  market page's tray), the Order inline, the Exit plan, Send. No desk header and no evidence bar on Build.
- **Task 3 — the review sheet**: Send opens it; the second tap is `useTicketSend().fire()` — the ticket's send moved
  unchanged into one hook in pro.jsx (order path 2), which `OrderTicket` also calls (`noSend` in More).
- **Task 4 — the three states**, `buildScreenState()` unchanged.
- **Task 5 — the evidence list**: "The market's read ›" opens the market page's Overview; levels and History in More.
- **Task 6 — photographed** through the whole app on fixtures (`node scripts/shoot-build.mjs`, docs/screens/redesign-pr2/).

**Measured.** Tests 1,342 → 1,359, 0 failed. Build 1,363.03 → 1,390.35 kB (production stamp), the usual chunk warning.
Words: find 327, market 587 (unchanged), build 286 → 428 (named site by site in voice.test.js), positions 207; J-0001's
surfaces 113/120, 32/35, 35/35, 40/40. Build at rest 2,592px at 390×844 (the Iron Condor fixture), nothing sideways.

**Not changed:** riskGate.js, closeOrder.js, modifyOrder.js, `orderBody()`, the gate calls, alpacaContract.js, every RULES
value, `histBacktest()`, `seasonalSignal()`, `fuseSignals()`'s and `signalDirection()`'s rules, the /api/state payload, the
event dates, Find and the market page beyond Edit in chain (`initialTray`) and the chain tray's origin, Positions / Orders /
Journal / Settings.

### What PR 3 inherits from part B

- **The one-market strip** (price now, expiry, season, source, IV rank) is one piece (`tickerStrip`) drawn in the desk
  header and in Build's More; it still colours a falling season and a dear IV rank red — PR 3 decides with the header.
- **The copilot's proposals** (owner to decide): "Opportunity radar" asks for two trades, the system prompt's decision
  trees recommend structures, "Pre-trade analysis" asks for a GO/NO-GO and a size. Build's three new questions never do.
- **Build's empty state is rare**: a board that loads with nothing on Build puts a default trade there (`buildPresets()`),
  so "Nothing on Build yet" shows only on a board with no strikes or after every leg is removed.
- **Loading is Build's own request** (`buildScreenState()`): Find's background reads are not "loading", so tapping Build
  before a market answers shows "No quotes" with Retry until Build itself asks.
- `BuildWarnings`, `TradeCard` and `ConfirmSteps` are no longer mounted on Build (their content is in the Why section,
  the review sheet and More); they stay for their tests and for PR 3 to decide.
- The word counter's upper bound still counts states that never show together (Build's three).

## Done in redesign PR 2, part A (owner, 5 Oct 2026): deploy previews are read-only

Planned first; the owner took every recommendation (5 Oct 2026): two PRs — this safety fix first and alone, then Build;
the Alpha Vantage cache is not written from a preview; "production" means production AND published; and the rest of the
plan's questions, which belong to the Build PR.

- **0a — previews are read-only.** Measured on 5 Oct 2026: "File in Journal" tapped on deploy-preview-51 filed into that
  preview's own Journal while production's server copy lost the GDX position — every function shares one site-wide blob
  store. `src/deploy.js` holds the one check, `deployWrites(context)` (Netlify's `context.deploy`, from `@netlify/types`
  3.2.0; the doc pages are cited beside it, their anchors unverified from this sandbox): state.mjs's POST, alpaca.mjs's
  POST / PATCH / DELETE, approve.mjs, autopilot.mjs and av.mjs's cache write answer 403 "Preview deploys are read-only:
  nothing is saved or sent from here." unless the deploy is production and published; an unreadable context is refused.
  Reads are untouched. The client reads the build's stamp (`__OSL_DEPLOY_CONTEXT__` from Netlify's CONTEXT, vite.config.js):
  off production a banner on every screen, no save to the server, and Send, Close, Modify, Cancel, Cancel all, File in
  Journal and the exit rungs disabled with the sentence. deploy.test.js (17) drives every writer with a preview, a branch,
  an unpublished production, no context, and production, with a recording store and network; preview.test.jsx (6)
  renders the disabled controls. demo.test.js's source pattern was widened to `if (DEMO || PREVIEW) return;` (test-only).
- **0b — PR #50's docs.** The replay's December wrap is done (below and CLAUDE.md); PRD §4 #9 says the PAST YRS tiles on
  windows that cross December changed with #50 and are owner-observed.
- **0c — v1 is reached** on the owner's report (5 Oct 2026: filled 9 of 9 at $7.65, filed from production). One owner check
  is left: the Journal entry shows the $7.65 fill (PRD §4 #1).
- **0d — Build's words 267 → 286 (sites 21 → 25) in PR #51.** The four sites are `chanceText`, `pastTileText`,
  `futureTile` and `returnText`, one each — all from card.jsx's compact layout, which Build mounts and never draws. No
  site came into Build's own code; nothing was removed. The counter fix below is still the cure.

**Measured.** Tests 1,319 → 1,342, 0 failed. Build 1,362.51 → 1,363.03 kB (stamped production), the usual chunk warning.
Words unchanged: find 327, market 587, build 286, positions 207; J-0001 surfaces 113/120, 32/35, 35/35, 40/40.

**Not changed:** riskGate.js, closeOrder.js, modifyOrder.js, `orderBody()`, the seven gate calls (unchanged: the
client's send functions gain a preview check beside the demo's, the server's writers one at their top), alpacaContract.js, every RULES value, the /api/state payload, every screen's look
beyond the banner and the disabled controls' sentence.

### What the next session inherits from part A

- **Old previews keep their unguarded functions** (deploy-preview-51 included). After this merges, regenerate the Alpaca
  paper keys and set them in Netlify (then redeploy production): the old previews are left holding dead keys. Their
  writes to the shared store cannot be revoked — do not open old preview links.
- Whether previews hold the production keys is unread (Site configuration → Environment variables → each key's deploy
  contexts). The guard does not depend on it.
- The guard has run on stubs only; the context read live, on a preview and on production, is an owner reading.
- DONE IN PART B: Build, the review sheet, Why this trade, the copilot inside Build.

## Done in round 2 of redesign PR 1 (owner, 5 Oct 2026) — the look, the dates, the app opens on Find

The deploy preview did not look like the mockups (measured on 9cb2359 at 390×844: the old Home first, a 230px desk header
over Find, filled pills, boxed rows, a 590px card and a 10,816px Strategies page). Round 2 is the look, written to the
mockups' values; no function changed. Planned first; the owner answered four questions (holiday notes as round 1; USO
tested both ways; ↻ on the market page; the mockup's sizes — 88px list end, 36px ⓘ and text buttons, 32px sliders).

- **Task 0 — the event dates** are in `src/events.js` (read on the publishers' pages 4–5 Oct 2026), with three table
  additions: a day with no time (FOMC), a weekly date moved with its own time (EIA petroleum), a block whose page lists its
  holiday changes. events.test.js runs on the shipped table. The placeholder shows after 31 Dec 2026.
- **Task 1 — the app opens on Find.** Home (`WizardOpen`) is gone; `statusLine()` is the Positions badge's spoken name;
  Back on Find leaves the app; "← Home" is removed everywhere.
- **Task 2 — Find's look.** `FindHeader` (Find, ↻, the gear, the status line or the stale banner, Results | Saved);
  underlined tabs; filter chips; flat 66px rows; sheets with a scrim and a grab handle; Saved's rows in `src/saved.jsx`.
  Two tokens, `raise` and `scrim`, in both palettes; five atoms in ui.jsx (`IconButton`, `SegmentBar`, `UnderTabs`,
  `FilterChip`, `TextBtn`).
- **Task 3 — the market page's look** and **the compact card** (`CandidateCard compact`, the full card behind
  "Details ▾"); the chain's tray fixed above the bottom bar; category icons named in markets.js (`CATEGORY_ICONS`).
- **Task 4 — screenshots** in docs/screens/redesign-pr1/ (`node scripts/shoot-screens.mjs`), on findB's fixtures.

**Measured.** Tests 1,300 → 1,318, 0 failed. Build 1,342.69 → 1,362.18 kB, the usual chunk warning. Words: find 332 → 327,
market 566 → 587, build 267 → 286 (a counter artifact: the compact layout's sites are scored on Build, which never draws
it), positions 207 → 207; J-0001's surfaces unchanged. Page heights at 390px: Find at rest 844px (one screen), Strategies
with the 18 fixture cards 10,816 → 6,402px, one compact card 291–365px (median 310; the first, with the disagree
sentence, 332) against the ≤280px target; nothing scrolls sideways.

**Not changed:** riskGate.js, closeOrder.js, modifyOrder.js, `orderBody()`, the seven gate calls, alpacaContract.js, every
RULES value, `histBacktest()`, `seasonalSignal()`, `fuseSignals()` and `signalDirection()`'s rules, the /api/state payload,
the Netlify functions, the look of Build, Positions, Orders, the Journal and Settings beyond "← Home". J-0001 is not touched.

### What the next session inherits from round 2

- **J-0001's close FILLED** (9 of 9 at $7.65, 5 Oct 2026, the owner's Alpaca screenshot). v1 (b) waits only on "File in
  Journal" from the production address.
- **The compact card is 291–365px, not ≤280**: the stance and needs line wraps to two lines, and the PAST figure must
  print `pastTileText()` (the row's words, held by figures.test.jsx), which wraps the FUTURE · PAST line. Shorter words
  there are the owner's call.
- **The word counter** still expands every branch of a component (Build is charged the compact layout); the fix is the
  same one round 1 left.
- **Red is used for a falling day change on the market page** (the prompt's "red down"), against CLAUDE.md's "red is for
  errors only"; the owner decides which rule wins.
- The 2027 event calendars, and EIA storage's holiday weeks once EIA publishes its 2026 changes.

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
- DONE IN ROUND 2: the event calendar's dates (read on the publishers' pages 4–5 Oct 2026, copied into `src/events.js`).
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
- DONE IN PR #50: **the replay read a window past December from the same row's January.** It now reads the next year's
  row in `histBacktest()` and Build's `runReplay()`, and drops the last year rather than padding it.
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

**v1 IS REACHED (owner's report, 5 Oct 2026):** J-0001's close filled 9 of 9 at $7.65 and was filed in the Journal from
the production address. One owner check is left: the Journal entry shows the $7.65 fill (PRD §4 #1).

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **(a) is verified and (c) is read for HOLD. J-0001's close FILLED on 5 Oct 2026
(9 of 9 at $7.65 against a $7.62 limit, sent by "Close at limit", order path 3 — read from the owner's Alpaca screenshot).
v1 (b) now waits only on "File in Journal" _from the production address_: the Journal lives in that browser only.**

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

- DONE (owner's Alpaca screenshot, 5 Oct 2026): J-0001 closed with "Close at limit" (order path 3) and filled, 9 of 9 at
  $7.65; filed in the Journal from the production address (owner's report, 5 Oct 2026). Left: read the entry's $7.65.
- **Nothing else is asked of the owner until then.** Every other item in PRD §4 is read when
  it happens in normal use, never requested.

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **DONE: PR #48** — the market registry, Find by category, the measured season, Signals decide, Order by, and the
  sweep of steps.jsx, why.jsx, positionCard.jsx, wizard.jsx.
- **DONE: PR #49** — one sorted list, no chance minimum by default, FUTURE (MONTE CARLO) and PAST YRS (BACKTEST) on
  every card, the whole Alpha Vantage history, visible ⓘ labels, and the sweep of App.jsx and pro.jsx.
- **DONE: redesign PR 1** — Find version B, the market page, the event calendar, dark by default; round 2: the mockups'
  look, the event dates, the app opens on Find.
- **DONE: PR #50** — the replay reads the next year's row past December; `scripts/sanity.mjs` (read-only live reads).
- **DONE: redesign PR 2** — part A, deploy previews are read-only; part B, Build, the review sheet, Why this trade, the
  copilot inside Build.
- **DONE: redesign PR 3a** — the audit against the boards; Positions, a position's own screen, Orders.
- **DONE: redesign PR 3b** — the Journal, Settings, the app on a computer.
- **DONE: PR 4a** — the copilot by place (it recommends only among what the app built), Find's Compare, Build's verdict,
  the Greeks and the chart explained, the Signals tab.
- **DONE: PR 4b** — Build's variants and a position's roll, one calculation.
- **DONE: PR 4c** — "What did this trade teach me?" in the Journal.
- **DONE: PR 4d** — the Liquidity sheet on Find, said plainly.
- **DONE: PR 66** — Find's four chips from your view of the market (View, Style, Max loss, ⇅ Sort, More) and the filter
  that binds.
- **DONE: PR 67** — Build like IBKR's Option Wizard: the market's chance beside the OSL model's, the scenario table, the
  Greek tabs, costs said per broker.
- **DONE: PR 68** — P5's logic: the exit rules replayed on real daily closes on a tap (no data shown from this sandbox), the
  chart at the 21-DTE exit, the market chance stored at entry and the Journal's calibration. **NEXT:** the owner reads the
  replay on the deploy and decides on the exit rules; then the basket expansion (below), unless the owner picks another.
- **DONE: PR 61** — quick fixes from the post-PR-60 sanity check (☆ toggle, the copilot's room and Continue, Compare
  counts cards, one return unit, open risk says what it includes, one compare). **NEXT:** PR 62 and PR 63 (stacked), then
  the basket expansion with a measured admission rule (below), unless the owner picks another.
- **Basket expansion with a measured admission rule** (planned as #50, not started; #50 shipped the wrap instead). The owner pastes `/api/liquidity` for the
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
- **Broker change** — futures and futures options need another broker. **Owner, 12 Oct 2026 (PR 66, task 66.4):** Directa
  evaluated and archived — options only on IDEM/EUREX, its API runs only through the Darwin desktop platform on a PC, and
  there is no API test account, so paper cannot be verified. IBKR is the candidate for futures options, studied after P5.
