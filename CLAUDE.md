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
- **A leg is chosen on its own type's strikes (PR 70): `boardStrikes()` / `strikesFor()`** (chain.js) — Build's dropdown,
  CALL ↔ PUT (`toggleLegType()`), every snap, Find's presets, the variants, Optimize and the roll. The calls-and-puts union
  `expiryStrikes()` is the chain table's rows only (riskGate.test.js). A generated proposal also passes
  `chainQuotedLegs()` (rules.js: every leg quoted by the chain, every bought leg bid); the gate's `priceability()` does not.
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
- **The exit plan is per trade (PR 72): `exitPlanOf(pos)` (rules.js) is its one reader** — the position's frozen
  `exitPlan` { takeProfitPct, exitDTE, stopLossPct, source, suggestedFrom }, else the RULES defaults (a position opened
  before PR 72). `takeProfitTarget()`, `stopWarningLevel()`, `ruleExitOf()`, `positionAction()`, `autopilotVerdict()`,
  `timeExitDay()`, `exitReplayPolicy()`, `exitCurve()`/`exitMark()` and the labels take `plan` (or its value); never read
  `RULES.exitDTE` / `stopLossPct` / `takeProfitPct` for a position or for Build. Build edits `buildPlan` in place within
  `exitPlanBounds()` (`stepExitPlan()`; the time exit never at or past the expiry, `entryRoom()`); Send freezes it
  (`commitPosition({ exitPlan })`); the Journal entry keeps it. The suggestion is `exitSuggestionOf()` over
  `exitPlanVariants()` replayed on the replay's button only, kept per market and `structureFamily()` in
  `store.exitSuggestions` (local, never on /api/state). riskGate.js does not read the plan (its stop warning stays 50%).
- **Against the signals is `againstOnPlan()` (signals.js, PR 72)** on `payoffNeed()` of the payoff valued on the plan's exit
  day (`planNeed` in App.jsx): a direction → `againstSignal()`; a zone around today's price → against only when
  `signalDirection()` reads Bull/Bear and one expected move that way to the exit day leaves the zone; a move either way →
  never. `tradeDir` is that direction (the net delta only when no payoff can be read).
- **A contract is named twice (PR 72): `ibkrName()` (rules.js, "SLV Nov27'26 49.5 Put") and the OCC symbol read from the
  chain (`bookQuotes[i].occ`) or the broker (`heldSymbolFor()`, closeOrder.js)**, drawn by the `ContractName` atom (ui.jsx:
  small mono, Copy); no symbol is "the chain did not list" (`OCC_NOT_LISTED`), never `buildOcc()`. The feed beside the
  prices' age is `feedLine()` / `FEED_INFO` (chain.js).
- **The exposure line above Send is `exposureLine()` (rules.js, PR 72)**, from the gate's own `limits` (totalAfter, or
  openRisk when the trade is already sent), shown only past `limits.total`, cap on or off; it never blocks.
- A card and Build read one price: `fillNet()`. `listCardFigures()` and `buildFigures()` are the
  two paths and `figures.test.jsx` holds them equal; the card's figures are for the size the
  budget buys, from `sizedFigures()` and `sizeLine()`, read at `aFill` (Find) and `AE` (Build), held
  equal by the same test — and so are the two PR #49 tiles, `futureFigures()` and `pastFigures()`.
- **The card's names are the owner's (3 Oct 2026) and live in rules.js only:** `CARD_LABELS` — YOU RISK, MAX PROFIT,
  CHANCE, RETURN ON RISK, FUTURE (MODEL) (FUTURE (MONTE CARLO) until PR 62), PAST YRS (BACKTEST) — and `FIND_ORDERS` — Future avg ·
  Chance · Return on risk · Past yrs (each with the `tile` it rings; "Future avg + signal" removed in PR 66, a stored "evSignal"
  reads as Future avg); `PAST_AVG_LABEL` ("PAST YRS AVG") on
  Build; the two toggles' words. Positions' "at entry vs now" reads the first four. No screen spells them itself.
- **The historical replay has one home: `histBacktest()` in engine.js** (PR #49): the trade settled at expiry in the
  same calendar window of every past year, whole months, the current year left out; a window past December reads the
  next year's row, and the last year (whose next row does not exist yet) is dropped, not padded (PR #50; `runReplay()`
  on Build reads the same way). Find runs it per card in
  `findGen` (via `listCardFigures()`), Build in `buildFigures()` and its backtest panel; never copy it.
- **The exit rules replayed (PR 68, P5) are `exitBacktest()` in engine.js, beside `histBacktest()` (unchanged):** daily
  closes, every session of this month in past years, the trade re-struck at today's moneyness, options at the realised
  volatility of `RULES.replayVolDays` sessions before entry, held to the first of the take profit, 21 days, or expiry; the
  stop is a warning ("Stop as exit" is reported beside, never applied). The policy is `exitReplayPolicy()` (rules.js). It
  runs ONLY on its button (Build's "Exit rules, past years", under the backtest in "More on this trade ▾") on the closes
  `/api/bars` returns, never on its own and **never on a made-up series shown on a screen** (the owner, 12 Oct 2026); it
  changes no rule. Tests use synthetic series; photographs show its empty states only.
- **One sorted list (PR #49).** A candidate that misses the request stays in its place in the chosen order, quieter
  (`T.mut`), with its reason first; "Hide cards that miss" (off) hides it behind the count (`resultsLine()`; on Find's rows `rowsResultsLine()`, "Hide them"). Never
  dropped. A slider filters `findGen`'s output and never re-simulates (`find.test.jsx` checks the memo's deps).
- Atoms and sizes: `src/ui.jsx` (now with `Info`, the ⓘ, and `Segments`) and the type tokens in `theme.js`. `ui.jsx`,
  `card.jsx`, `find.jsx`, `orders.jsx`, `positions.jsx`, `navBar.jsx`, since PR 3a `positionScreen.jsx`, since PR 3b `journal.jsx` and
  `settings.jsx`, and since PR #48 `steps.jsx`, `why.jsx`,
  `positionCard.jsx` and `wizard.jsx`, since PR #49 `pro.jsx` and `App.jsx`, since redesign PR 1 `market.jsx`, since
  redesign PR 2 `build.jsx` and since PR 74 `learn.jsx`
  (atoms now include `Sheet` and `Placeholder`), use no `fontSize` literal and define no atom; `ui.test.jsx` fails the build otherwise (only visuals.jsx's drawings and main.jsx's crash screen are left,
  named in the test). A longer explanation goes behind one ⓘ or fold, never deleted. **An ⓘ shows its label**
  ("How the numbers fit ⓘ"); `iconOnly` only inside a figure tile, where the tile's name is the label.
- No emoji or rare glyphs in UI strings; stay within `↑ ↓ → ✓ ✗ ⚠ ▲ ▼ ●` and, since redesign PR 1 (owner's mockups,
  4 Oct 2026), `☆ ★ ⇅ ≈ ‹ › ▾ ▴`.
- **The app opens on Find (owner, 5 Oct 2026, round 2).** Home (`WizardOpen`) is gone; a first run is `CapitalOnboarding`,
  then Find; Back on Find leaves the app (nav.js rule 2). Positions to look at are the bottom bar's Positions badge, whose
  spoken name is `statusLine()`; Settings is the gear in `FindHeader`. Find, Saved and the market page draw NO desk header
  (`chromeless` in App.jsx), and neither does Build since redesign PR 2, nor Positions since PR 3a (its own `PositionsHeader`),
  nor the Journal (`src/journal.jsx`) and Settings (`src/settings.jsx`) since PR 3b: no screen keeps it.
- **On a computer (redesign PR 3b, owner, 6 Oct 2026): `useWide()` in ui.jsx** (a window ≥ `WIDE_MIN` 1024px). The bottom bar
  is a left sidebar (`BottomBar rail`, `RAIL_W`), Find's rows sit beside the market page (`paneFind`) and Positions' cards beside
  a position's screen (`panePos`) — on a phone their wrappers are `display: contents`, so nothing moves; the Journal is two
  columns (`wide`); Settings keeps 760px. Below 1024px nothing here applies; the boards are the phone's.
  **Responsive since PR 73 (owner, 19 Oct 2026):** Find's list is a fixed 420px (`PANES_FIND`), its chips wrap (`FindStep
  wide`); the market page is `docked` (its Chain tray and compare line sticky at the pane's foot, `barOuter()`); Build is
  two columns (`v.wide` → `data-build-cols="2"`: legs, order, exit plan, Send | chart, numbers, why, copilot, variants,
  Optimize; More under both; up to 1440px); Positions is a table (`PANES_POS`, `PositionsTable`, the card's `row` prop →
  `PositionRow`, columns from its own width via `useBoxWidth()` in ui.jsx, full from `TABLE_FULL_MIN`). Nothing may scroll
  sideways on a computer: `node scripts/audit-computer.mjs` (1280×800, 1024×768, 1440×900) exits 1 if anything does.
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
  (`settings.findOrder`, `findOrderCompare()`); no order adds the signal since PR 66 (`signalAdjustment()` stays for
  `rankScore()` / `withSignalRank()`). The tile the list is sorted by is ringed.
- **Find's chips, from your view of the market (PR 66, owner 12 Oct 2026): View · Style · Max loss · ⇅ Sort · More**
  (`FIND_CHIPS`, `chipPartsOf()`, `chipText()`, `chipOffDefault()`, `moreOffCount()` in rules.js). **View** is Signals
  decide · Up · Down · Range; the target is in EXPECTED MOVES and picks the family (`dirOfView()`: up to
  `RULES.viewVeryMoves` the Bull/Bear cards, beyond it the Very ones; `viewOfDir()` reads an old direction, "Very" as
  `viewFartherMoves`); `find.dir` stays the family findGen builds and `find.target` the moves, so a target inside one family
  re-builds nothing. **Style** is Cautious · Balanced · Bold (`FIND_STYLES`, `styleOf()`): the chance and return floors,
  Balanced = the default list, the two sliders under "Set them yourself", "Custom" off a style. **More** holds Debit ·
  Credit · Both (`request.side` in `meetsRequest()`, the card's `entryNet` sign: a miss is dimmed, an unknown net a miss),
  Horizon, the Liquidity panel as a fold, and the three list toggles. **When rows are dimmed, `bindingFilter()` (rows.js)
  names the control that leaves out the most markets, from the same misses, with one fix** that never passes the limit.
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
  is the market's first card that fits, else its first card as a miss in its place; a row's figures are `rowFigures()`, the
  card's tiles (figures.test.jsx). The market page (`src/market.jsx`) is a filtered view of the same list for one ticker
  (`findSorted`), never a second list; its ticker and tab are nav.js fields (`mkt`, `mtab`), and opening it does not
  replace the trade loaded on Build. Every chip on Find opens a `Sheet` (ui.jsx) holding its controls.
  **A row prints three figures, always (PR 63): `rowFigures()`** — Chance · Return on risk · Avg per $100 at risk, the
  card's own, the sorted-by one ringed — then the days and the risk. **Find reads ONE expiry per market** (the board
  nearest the Horizon): reading every expiry costs 2–6× (PR 63's measurement); the owner moved that search to a separate
  "Optimize" run, proposed in the ROADMAP and not built until the owner says yes.
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
- **The copilot by place (PRD §1; owner, PR 4): the app builds, the copilot explains and recommends, the person decides,
  the gate checks.** Every `SKILLS` question in pro.jsx carries `place` (find · market · build · positions) and opens with
  that place's `COPILOT_ROLE`; a screen shows only its own (`skillsFor()`, `BUILD_SKILL_IDS`, `POSITION_SKILL_IDS`). A
  copilot recommends ONLY among what the app built or offers and put in the context (Find: the cards that fit,
  `compareCards()`; Build: a verdict from `BUILD_VERDICTS` on the loaded trade, never over a gate check; a position: one
  of `positionActions()`); it never writes a strike, an expiry, a structure or a size of its own, never sends, never
  closes. The standing prompt (`SYSTEM_PROMPT`) has no decision tree: the trees are criteria for judging a card. A
  position's answers are filed in copilotLog tagged with its ref, plus one timeline line. **No two questions on one screen
  ask the same thing (owner, 12 Oct 2026, PR 65 task 65.7):** Find 2, market 2 (`slot` "news" in the news block, "read"
  under the market's read), Build 5, a position 3 ("Should I roll it?" only when a roll is offered, `positionSkills({
  canRoll })`), Journal 1, and the chart copilot's 3 (`TA_QUESTIONS`, no trade question). A question asks only for what its
  context carries: dates come from `eventsBrief()` (events.js, in the context as `events`), the market's factors from
  `marketSignals`. A new question first checks that no question on its screen already answers it.
- **Build's variants and a position's roll are one calculation: `src/alternatives.js`** (PR 4b) — legs moved on the strikes
  the chain lists, never snapped; priced only through `priceAlt()` in App.jsx (the card's path, the budget's size, the one
  gate callback). A roll is offered only by `rollEligible()` and is two orders, never both held: Build blocks Send with
  `rollCloseFirst()` until Alpaca no longer holds the old position, then sends through order path 2; the records are
  linked by `rolledInto()` / `rolledFrom()` timeline lines, never a new /api/state field.
- **Optimize and the roll search the same way, judge differently (PR 65, owner 7 Oct 2026).** The search is
  `optimizeCandidates()` / `rollCandidates()` (every expiry in the entry window — the later ones for a roll — × the moves of
  up to `OPTIMIZE_STEPS` listed strikes, one by the measured rule). Every candidate is read by `readAlternative()` (App.jsx,
  `priceAlt()`'s arithmetic) through Find's own floors (`floorsFor()`, the loop body of `shortlistWithFloors()`). Optimize
  ranks with `rankOptimize()` (rows.js: the owner's Find order, `meetsRequest()`, the gate; O1…O5) and runs ONLY on its
  button; never on Find, never on its own. A roll is judged by `rollJudge()` on the WHOLE trade at the size held — today's
  P&L plus the new trade, never a worst case past the max loss accepted at entry — ranked by `rankRolls()`.
- **One compare (PR 61):** the tick on a Strategies card selects (≤ `MAX_COMPARE`) and shows its word; ONE sheet
  (`CompareSheet`) — Find's "Compare ›", the market page's "See them ›", Build's "N still ticked" — shows the ticked cards
  (or, with none, the cards that fit) as `compareCards()`'s rows, labelled C1…Cn, at the size the budget buys, and its
  copilot reads exactly those rows. Never a second tray.
- **☆ is a toggle (PR 61):** a second tap removes through `delSaved()` (`withoutSaved()`, the one remover); Undo puts back
  the same item (`restoreSaved()`).
- **The copilot's model has one home, `COPILOT_MODEL` (rules.js)**; copilot.test.jsx fails on the id anywhere else. An
  answer stopped by its length limit offers Continue (appended to the same answer, filed once).
- **A copilot answer is checked against the app's figures (PR 62):** once finished, `ungroundedFigures()` (grounding.js)
  looks for every $ and % among the numbers sent (the context and the standing instructions; rounding tolerance only;
  strikes, dates and counts not looked at), and every copilot place prints `notInFiguresLine()` under it in amber.
- **The chance is exact (PR 62): `chanceOf()` reads `terminalExact()`** — no runs, no seed. Never put a simulation back
  under a figure on screen; `exitSim()` is the only path simulation.
- **Two chances (PR 67, owner 12 Oct 2026): the market's and the OSL model's.** The market's is IBKR's method in
  `src/impliedDist.js` (one expiry's out-of-the-money mids, segments between strikes, non-negative least squares with Σ = 1 held exactly, a small
  measured smoothing; plain JS, imports nothing), read ONLY through `marketDistOf()` / `marketChanceOf()` in rules.js beside
  `chanceOf()`, and spelled once in App.jsx (`marketChanceCheckOf()`, one fit per board and expiry `boardDistOf()`).
  `listCardFigures()` and `buildFigures()` return both (`mkt`, `gap`; figures.test.jsx holds card = compact card = Build =
  row). The tile's words are `chanceLines()` / `CHANCE_LINES` ("Market", "OSL model"); past `RULES.chanceGapPoints` one
  line says why (`chanceGapOf()`, `chanceGapLine()`), amber when the market's is lower — the one sentence a card carries
  besides its name and legs. A board too broken to read gives no number (`MARKET_CHANCE_NOT_READ`). The sort, the floors
  and the gate stay on the OSL model's chance.
- **Build's chart reads the chance's own lognormal (PR 63): `src/tradeChart.js`** — the zones (`payoffBands()`' bands with
  their chances, adding to 100%, the green ones to CHANCE), the ±1 sd prices, the exit tick, the crosshair's readout and
  keys. `UnifiedView` loads the bars; `UnifiedChart` (pro.jsx) draws and takes no other distribution. A card's Details
  rows are `cardDetailRows()` (rules.js). **Since PR 67 (IBKR's Option Wizard)** `UnifiedView` has the tabs P&L · Delta ·
  Gamma · Vega · Theta (`GREEK_TABS`; a Greek is `GreekChart`, `greekCurves()`, today and on the exit day) and the scenario
  table under it (`ScenarioTable`, `scenarioGrid()`: Today or At expiry, the largest move in thirds). The structure today is
  ONE function, `legsAt()` in engine.js (Black-Scholes on each leg's own IV; `bsGreeks()` moved there from App.jsx), read
  by Build's "now" curve and Greeks and by both; the broker's Greeks are read (`brokerGreeks()`, never a partial sum).
  **Since PR 68 the chart reads "At expiry" or "At the 21-DTE exit"** (`CHART_WHEN`): at the exit the right-edge line, the
  zones, the bars and the crosshair are the exit day's (`exitCurve()`, `curveZones()`, `exitPnlAt()`; the lognormal to that
  day); the fan and the ±1 sd prices stay at expiry.
- **Open risk says what it includes (PR 61):** `limits.openRiskParts` are the gate's own summands; a trade on Build that is
  already in the book is said ("Already sent as…") and never added twice on Build's figure.
- **Costs are said, never subtracted (PR 67): `BROKER_COSTS`, `costsFor()`, `costsLine()` in rules.js.** Alpaca $0
  commission with "regulatory fees not counted" (never as $0 fees); IBKR is `<Placeholder id="costs-ibkr">` until a second
  broker is connected. No gate check, ranking, floor, alternative or order path reads a cost (riskGate.test.js).
- **Which chance came true (PR 68): `thesis.marketPop` beside `thesis.pop`** (a field of the record's thesis, written at
  entry by `commitPosition()`; never a new /api/state field) and `chanceCalibration()` in journal.js: bands and Brier
  scores only once `RULES.calibrationMinTrades` closed trades carry both and a result read from a fill; until then the
  count and "too few to judge". Its words are journalView.js's.
- **The Journal is on the server (PR 71): `journal` and `journalSeq` ride on `/api/state`, MERGED, never replaced.** One
  home for the rule, `src/journalSync.js`: an entry is keyed by ref AND position id (`journalKey()`), the newer `updatedAt`
  wins (`journalEntry()` stamps it at filing; every later edit of a FILED entry goes through `touchEntry()`), nothing is
  dropped, the counter is the highest either side has seen (`mergedSeq()`). The server's POST merges (`mergeStateBody()`:
  every other key the body sends replaces, a key it omits is kept); the load merges the server's into the browser's, drops
  an open position another device filed (`filedElsewhere()`, id and ref), and uploads `{ journal, journalSeq }` once when the
  server lacks something (`journalBehind()`). A new ref reads the server's counter first (`serverSeq()` in App.jsx). The
  payload is `serverPayload()`; the Journal's line under its title is `journalSyncLine()`. `copilotLog` stays on the device.
- **Learn, the figure lab (PR 74, owner 20 Oct 2026: "as on IBKR Campus") — the fifth place.** `src/learn.jsx` draws,
  `src/learnView.js` computes, the picture is `FigureChart` in visuals.jsx (cut from `payoffBands()`). **What a set of legs
  is called has one home, `figureOf()` (rules.js)**, read as a NET position per strike and type (`figureLegs()`: a four-leg
  butterfly is a butterfly); PR 75's drawing names what it recognises through it. The gallery is `LAB_FIGURES` (each leg's
  strike in expected moves, laid out by `labFigureLegs()` on the type's listed strikes, symmetric pairs kept equal), its
  words `LEARN_WORDS`. A real market's price, listed strikes and each strike's own IV; the premiums are Black-Scholes on
  each leg's own IV, said "model price", and a strike with no IV has no price (never a guess). Legs move only onto their own
  type's listed strikes, at most `MLEG_MAX_LEGS`. A sold option alone is allowed, to learn from: max loss "unlimited" for a
  sold call, and the card says in amber that the app never sends it (`undefinedRiskLegs()`, the gate's own question).
  **Nothing in Learn sends, saves or calls the gate** (learn.test.js reads learnView.js, learn.jsx and App's block); the lab
  lives in memory (`lab` in App.jsx), never on /api/state.
- **Learn's picture (PR 76) is `FigureChart` drawing what learnView.js works out:** the dollar and price scales (`niceTicks()`),
  the card's extremes (`labExtremes()`, never re-read off the curve), today and the exit date (`labCurves()`: each leg's own IV
  through `legsAt()`, the exit `exitPlanOf({})`'s days through Build's `exitCurve()`), the market's band and chance at the
  MODEL net (`labDensity()`, `labMarketLine()` on `boardDistOf()`), the crosshair's sentence (`labReadout()`), the finger's
  bands and offsets (`labHitZones()`, `labPointXs()`) and the sideways-only drag (`labDragTo()`). Its words are LEARN_WORDS'.
- **A finger on a shape inside an `<svg>` must cancel the page's scroll itself (PR 76, measured):** Chromium and Safari
  ignore `touch-action` there, so a handle (Learn's points, Build's crosshair handle) adds non-passive `touchstart` /
  `touchmove` listeners that `preventDefault()` a touch starting on it; the picture keeps `pan-y` so the page still scrolls
  elsewhere. `node scripts/shoot-pr76.mjs` measures it with Chromium's own touch input.
- **A figure drawn with a finger (PR 77) is `recogniseDrawing()` in `src/learnDraw.js`** (plain JS, sends nothing): the stroke
  read as segments and kinks, every `DRAW_SHAPES` shape (rules.js, all of FIGURE_NAMES on strike slots) laid out on its
  types' listed strikes inside the drawn span, scored pattern → kinks → curve at the MODEL net; the names are `figureOf()`'s;
  one card per line; a figure the app never sends brings its `DEFINED_SIBLINGS` version first, built by `withWings()` (also
  PR 78's defined-risk version); under `DRAW_MATCH_MIN` or a scribble, nothing is named. Learn's screen reads it through
  `labDrawView()` (learnView.js); the strokes live in `lab`, never on /api/state.
- **A market as IBKR lists it (PR 76): `src/listing.js`** reads `{ exchange, name }` from Alpaca's `GET /v2/assets/{symbol}`
  (one GET per market, a day on the device, never /api/state), the words are rules.js's (`listingLine()` "UNG · ARCA",
  `listingName()`, `EXCHANGE_WORDS`, `listingSearchInfo()`), the name line is the `ListingName` atom. Lists (Find's rows, the
  Journal's) carry the exchange only (owner, 20 Oct 2026); a market's or a trade's own header carries the name under it. Not
  read: the ticker alone — never a name typed in the app.
- **The Journal's copilot (PR 4c)** asks about one closed trade (`closedTrade` in the context, the record's own words) and
  recommends nothing (`COPILOT_ROLE.journal`).
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
- `src/orders.jsx` — the Orders segment: `OrderRow`, `OrdersPanel` (the clock and Cancel all at the top since PR 3a), `PriceField`, `CloseChoice`.
- `src/positions.jsx` — the account strip (`AccountStrip`), Positions | Orders (`PositionsBar`), `WorkingCloseLine`.
- `src/navBar.jsx` — the one bottom bar (Find · Build · Positions · Journal · Learn), `placeOf()`, `NAV_BAR_H`.
- `src/clock.js` — `marketClockLine()`, `localStamp()`: the market clock and times in the owner's own zone.
- `src/alpacaContract.js` — Alpaca's order contract mirrored from alpaca-py.
- `src/journal.js` — the position record: refs, timelines, size, stage, book, fills; `chanceCalibration()` (PR 68).
- `src/journalSync.js` — one Journal on every device (PR 71): the merge by ref, the counter, what the server stores on a POST.
- `src/listing.js` — every market as IBKR lists it (PR 76): Alpaca's asset reply read into an exchange and a name, a day's cache.
- `src/positionView.js`, `src/positionCard.jsx` — what a Positions card and its Details sheet say
  (action, profit, three exits, entry against now). They compute nothing new: the profit is
  `posAlerts`', the target `takeProfitTarget()`, the stop level `stopWarningLevel()`.
- `src/nav.js` — Back: the screen state as history entries (push on a move, step back when a sheet
  is closed from its own button, Find — the first entry — is never intercepted).
- `src/engine.js` — Black-Scholes and its Greeks (`bsGreeks()`, and `legsAt()`: a structure today on each leg's own IV,
  since PR 67), payoff, exit simulator, the exit-rule replay `exitBacktest()` and `realisedVol()` (PR 68), the exact chance `terminalExact()` (PR 62; `terminalMC()`, the
  seeded Monte Carlo it replaced, stays only as the proof test's reference), seasonal parse (`parseAvJson()` keeps
  the whole series since PR #49; `statsFromMatrix()` returns per-month years and standard errors; `seasonalSpan()`),
  the historical replay `histBacktest()` (PR #49). `SEASONAL` is retired; `SIGMA` stays.
  Imports nothing; shared by client and Netlify functions.
- `src/chain.js` — where the option chain comes from, strikes (per type since PR 70: `boardStrikes()`, `strikesFor()`,
  `toggleLegType()`), open interest, feed names.
- `src/signals.js` — the four-factor confluence engine, `signalDirection()`, the Find order (`findOrderCompare()`,
  `placeLine()`; it re-exports `FIND_ORDERS` from rules.js), `badgeText()` and `numbersFitLines()`.
- `src/tradeChart.js` — Build's chart arithmetic (PR 63): `zoneOdds()`, `coneEdges()`, `exitMark()`, `crosshairReadout()`,
  `crossKey()`; since PR 67 `scenarioGrid()`, `greekCurves()`, `brokerGreeks()` (plain JS; chart.test.jsx).
- `src/impliedDist.js` — the market's chance (PR 67): `impliedDistribution()`, `marketChance()`, `marketBelow()`, `simplexLS()`,
  `quoteMid()` (plain JS, imports nothing; impliedDist.test.js). Read only through rules.js.
- `src/grounding.js` — a copilot number must exist in the app's figures (PR 62): `ungroundedFigures()` and the one
  amber line `notInFiguresLine()` (rules.js) under a finished answer, on every copilot place.
- `src/indicators.js` — every technical indicator, and the chart copilot's context.
- `src/freshness.js` — how old a number on screen may be.
- `src/visuals.jsx` — every trade picture, all cut from `payoffBands()`.
- `src/card.jsx` — the request controls (shown in Find's sheets, `bare`), the one candidate card (six tiles and its
  picture row), the one sorted list (misses in place) and the card's actions.
- `src/ui.jsx` — Btn, Panel, Label, Stat, Fold, Chip, Note, inputs, `RangeField`, the mono/sans stacks.
  The type tokens (`TYPE`) are in `src/theme.js`. Mono only for numbers, tickers, legs, OCC symbols.
- `src/find.jsx` — Step 1, Find (version B, redesign PR 1): category tabs, the chip row and its sheets, the summary line,
  one row per market (`MarketRow`), the states, and the one Compare sheet (`CompareSheet`, mounted by App.jsx; PR 61).
- `src/rows.js` — `marketRows()`, `rowFigures()`, `rowStateOf()`: Find's rows over the one sorted list; `rankOptimize()`,
  Build's Optimize ranking (PR 65) (plain JS).
- `src/alternatives.js` — the alternatives of a structure (PR 4b): `variantsOf()`, `rollCandidates()`, `rollEligible()`; since
  PR 65 `optimizeCandidates()`, `movesOnBoard()`, `OPTIMIZE_STEPS`, `rollJudge()`, `rankRolls()` (plain JS).
- `src/market.jsx` — Step 2, the market page: header, Signals (the tab id stays `overview`; the four factor blocks are
  why.jsx's `FactorRows`, titled by `factorHeadline()`), Strategies (`StrategyCard`), Chain (`ChainTab`, the tray).
- `src/marketView.js` — `dayChange()`, `expectedMove()`, `latestNews()`, `toggleChainLeg()` (plain JS).
- `src/events.js` — the event calendar to 31 Dec 2026; `nextEvent()`, `eventsFor()`, the holiday weeks.
- `src/wizard.jsx` — onboarding, the confirm step, and `statusLine()` (Home is gone since round 2).
- `src/saved.jsx` — Saved's rows (round 2, moved out of App.jsx): When saved / Now, what it would have done.
- `src/steps.jsx` — navigation chrome: sheets, folds, `DeskCountLine` (`StepNav` removed in PR #48).
- `src/build.jsx` — Step 3, Build (redesign PR 2): its sections, the review sheet, its three states.
- `src/positionScreen.jsx` — one position's own screen (redesign PR 3a): what to do now, Keep it, the chart, the exit
  plan, entry vs now, the record, Alpaca details, the copilot, the Guardian fold.
- `src/learn.jsx`, `src/learnView.js` — Learn, the figure lab (PR 74): the screen, and its plain-JS arithmetic (`labModel()`,
  `labCard()`, `labLegRows()`, `labGallery()`, `labFigureLegs()`, the leg moves). Nothing in either sends or saves.
- `src/learnDraw.js` — a figure drawn with a finger, recognised on the market shown (PR 77); `withWings()`.
- `src/journal.jsx`, `src/journalView.js` — the Journal (redesign PR 3b) and its words (plain JS: `whyOpenedLine()`,
  `endedLine()`, `closedState()`, `closedTitle()`, `timelineItems()`). `src/settings.jsx` — Settings (redesign PR 3b).
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
read paths the app uses (account, clock, positions, orders, contracts, one asset since PR 76), POST `/v2/orders`, PATCH `/v2/orders/{id}`, DELETE `/v2/orders/{id}` and
`/v2/orders`. Everything else, `DELETE /v2/positions` included, is 405 with a sentence. A new
call to Alpaca from the client needs its route added there and in `orders.test.js`. Every route but a GET answers 403
off the published production deploy (`deployWrites()`, rule 6).

## Where each constant lives

All in `RULES`, `src/rules.js`, unless noted.

- Exits: `takeProfitPct` 0.5, `singleTakeProfitPctOfPremium` 0.5 (a single long option; read only through
  `takeProfitTarget()`), `stopLossPct` 0.5 (warning only), `exitDTE` 21, `scaleOutPct` 0.75 — since PR 72 the defaults a
  trade's plan is suggested from. The plan's bounds: `exitPlanTakeProfitMin` 0.25 / `Max` 0.9, `exitPlanDTEMin` 7 / `Max` 45,
  `exitPlanStopMin` 0.25 / `Max` 1 (owner), `exitPlanPctStep` 0.05; the replay's grid `exitPlanReplayTakeProfits` [0.25,
  0.5, 0.75] × `exitPlanReplayExitDays` [14, 21, 30] (chosen).
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
- Simulation: `fallbackIV` 0.25, `fallbackSigma` 0.25 (`mcRuns` left in PR 62: the chance is exact, nothing read it).
- Attention: `watchAttentionShare` 0.35, `autopilotConfidence` 70, `lowConfidence` 40.
- Chance slider: `chanceAskMin` 0.20, `chanceAskMax` 0.80, `chanceAskStep` 0.05,
  `chanceAskDefault` none (null; the slider's leftmost position reads "any", PR #49). Return-on-risk slider: floor `minRewardRisk`, `rewardAskMax` 3,
  `rewardAskStep` 0.05 (it can only tighten the floor). Amount slider: `amountAskStep` 25.
- The exit replay (PR 68): `replayVolDays` 20; the Journal's calibration waits for `calibrationMinTrades` 10.
- The market's chance (PR 67): `impliedMinQuotes` 4, `chanceGapPoints` 0.05 (the owner's five points); the scenario table's
  largest moves `SCENARIO_MAX_MOVES` (1% 5% 10% 30%, default 30%) and the smoothing `SMOOTH` 0.01 (impliedDist.js) are not RULES.
- Find's Style (PR 66): `styleCautiousChance` 0.5, `styleBoldReturn` 1.5. The View's target, in expected moves:
  `viewTargetDefault` 1, `viewTargetMin` 0.5, `viewTargetMax` 3, `viewTargetStep` 0.25, `viewVeryMoves` 1.5,
  `viewFartherMoves` 2 (all chosen on fixtures, PRD §4).
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
  photographs Positions, a position's screen, Orders, the Journal, Settings and the computer's two panes (1366×900) on the
  `+book` fixture (scripts/book-fixture.js: three open records, two holdings, two orders, two closed trades).
- `node scripts/audit-build.mjs [light]` (now `audit-screen.mjs build`) measures Build against the mockup's own values (getComputedStyle: sizes, weights,
  borders, radii, paddings, taps, theme colours) and its words, on the same harness; exits 1 on any difference.
- `node scripts/shoot-screens.mjs [dir]` photographs Find, a sheet, Saved and the market page's tabs at 390×844 in the
  pre-installed headless Chromium, on findB's fixtures (`scripts/screens.jsx`), and prints page and card heights.
- `node scripts/shoot-pr4.mjs [dir]` photographs PR 4's screens (Find's Compare sheet, the Signals tab, the copilot
  sections) on the `+book` fixture with a stub copilot (docs/screens/pr4/).
- `node scripts/shoot-pr63.mjs [dir]` photographs PR 63's screens (Find's rows, a card's Details, Build's chart at rest, with
  the crosshair, "How to read", light) on the `+book` fixture (docs/screens/pr63/).
- `node scripts/measure-optimize.mjs` times one Optimize run (one step against two) on UNG's board copied onto 1–9 expiries,
  and counts how often the second step changed the first pick (PR 65, task 64.5). `node scripts/shoot-pr65.mjs [dir]`
  photographs Optimize on Build (`+opt`) and the roll's whole-trade lines (`+roll`) (docs/screens/pr65/).
- `node scripts/shoot-pr61.mjs [dir]` photographs PR 61's screens (☆ with Undo, the tick and its line, the Compare sheet, Build's
  card-vs-limit and "already open" lines, AT RISK's "Includes…") on the `+book` fixture (docs/screens/pr61/).
- `node scripts/measure-find.mjs` prints what each Find control passes on the 31 fixture cards and what
  one slider move costs (`scripts/find-fixtures.jsx` builds the cards); since PR 66 also the cards and rows each Style and
  each Debit · Credit choice keeps. `node scripts/shoot-pr66.mjs [dir]` photographs Find's chips and sheets and the market
  page under a chosen View (`app+all`); `ONLY=find-binding,find-binding-light node scripts/shoot-screens.mjs docs/screens/pr66`
  the binding-filter line on the two-market fixture (docs/screens/pr66/).
- `node scripts/shoot-pr67.mjs [dir]` photographs PR 67's screens (Find's row "· mkt", the compact card's two chances and its
  why line, its Details with the costs row and IBKR's placeholder, Build's numbers, the Delta tab, the scenario table, the
  Order's costs line; dark and light) on the `+book` fixture (docs/screens/pr67/).
- `node scripts/shoot-pr68.mjs [dir]` photographs PR 68's screens (the chart at the 21-DTE exit, "Exit rules, past years" at
  rest and after the tap, the Journal's "Which chance came true") on the `+book` fixture, in their empty states
  (docs/screens/pr68/). `node scripts/measure-exits.mjs <dir> [month]` answers P5 per market and family from the owner's saved
  `/api/bars?sym=<TICKER>&days=1900` replies (`<TICKER>.json`); with none it says so and prints no number.
- `node scripts/audit-computer.mjs [1280x800,…]` checks the computer's layout on the whole app on fixtures: nothing scrolls
  sideways (the page or inside it), the chips wrap, the tray sits in its pane, Build is two columns, Positions a table;
  exits 1 on a miss. `node scripts/shoot-pr73.mjs [dir]` photographs those screens at 1024, 1100, 1280 and 1440px and the
  phone's (docs/screens/pr73/before and after).
- `node scripts/shoot-pr74.mjs [dir]` photographs Learn (empty, an iron condor from the gallery, a sold call alone, light, and
  1280×800) on the `+book` fixture (docs/screens/pr74/; the harness answers every market with UNG's board). Since PR 74
  `scripts/audit-computer.mjs` checks Learn too (two columns, the picture in its column, four points).
- `node scripts/shoot-pr76.mjs [dir]` photographs PR 76's screens (Learn's picture, the crosshair, a point held, the listings on
  Find, the market page, Build, a position and the Journal; 390×844 and 1280×800) and MEASURES a finger's slide on each point
  with Chromium's touch input (the strike before and after, the page's scroll); `ONLY=a,b` picks shots ("finger" included).
  The harness answers `/v2/assets/{sym}` with fixture names (typed there, not Alpaca's); "+nolisting" answers 404.
- `node scripts/shoot-pr77.mjs [dir]` photographs PR 77's drawing (at rest, a short strangle, a bull put spread, a scribble, a
  card loaded, light, 1280×800), drawn by Chromium's touch input, and prints each drawing's cards and the page's scroll.
- `node scripts/shoot-pr72.mjs [dir]` photographs PR 72's screens (the Exit plan at rest and edited, the legs named twice,
  the review's legs, the exposure line on `+poor`, the market's feed line, the tray's two chances) (docs/screens/pr72/).
- `node scripts/shoot-pr71.mjs [dir]` photographs the Journal's line under its title, saved on the server and (with the
  harness's `+offline` flag: `/api/state` refused) only on this device, dark and light (docs/screens/pr71/).
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
- `settings.notifyWhenReady`, `settings.sizingFree` and `settings.findOrder` must be in the `/api/state` sync payload
  (`serverPayload()` in App.jsx, which since PR 71 also carries `journal` and `journalSeq`).
- Free sizing is ONE gate input (`evaluateTrade({ sizingFree })`): it drops the per-trade,
  exposure and capital-not-set checks only. Never let it reach another check.
- A card's size is `scaleStrategy()` on the maximum loss; `sizeLine()` prints contracts × risk.
- The amount never passes the per-trade limit with free sizing off: `requestOf(want, limits, { sizingFree })`
  returns `riskCap`, and every `scaleStrategy(a, mode, amt, request.riskCap)` call passes it.
- A leg's `qty` is inside `analyze()`'s figures; `positionSize()` separates `contracts` from
  the broker's `brokerQty`. Never write `Number(p.contracts) || 1`.
