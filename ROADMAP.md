# ROADMAP — Options Strategy Lab

One session, one prompt, one pull request. Every session opens by fixing what
the previous one flagged as unverified or broken. The owner decides the merge:
prompts open the PR and stop.

## P0 — The loop closes  (IN PROGRESS — the code is shipped, the fill is not)
The order fills. Model-vs-market sanity check on every proposed price, an
opening limit that concedes part of the spread, a ticket that shows the combo
book and the notional controlled, working orders visible in the main flow,
and the entry floor rewritten as room (hard block only inside the exit
window, warning and typed override above it).
DONE WHEN: an opening order is really filled on the paper account and appears
in Positions. Not a test — a fill.

**FOUR ORDERS HAVE NOW BEEN SENT AND NONE HAS FILLED — AND THE FOURTH DID NOT EVEN REACH THE
MARKET.** The first three were not met by the market; one of them sat at the exact mid, which the app
now names as the price nobody has to meet. The fourth was **refused by the broker for a reason the
app created itself**: SOYB, 20 September 2026, HTTP 422 / 42210000, *invalid legs: [leg.0 asset
"SOYB261120C00027500" not found]* — a well-formed symbol for a contract nobody has ever issued,
because `buildOcc()` was a FALLBACK in four of the six order paths. That is closed (PR #30, §4n) and
it is in the gate, where all six pass through. Whether what is left fills is a market question, and
P0's DONE WHEN is unchanged.

SHIPPED (PR "the order that never filled", 564 checks, build clean):
  - `modelSanity()` in rules.js at all three generation sites, refusing a price
    more than 4x away from `netBS()` either side, naming the leg responsible.
    PRD §4e. The BOIL 20/21 order that started this prices at 0.15 and is now
    refused before it can be offered.
  - `openLimitPrice()` / `RULES.openLimitSlippage`: the ticket seeds mid plus a
    quarter of the spread, never the bare mid. PRD §8d.
  - The ticket shows combo bid/mid/ask, where the typed limit falls in it with
    one plain sentence, the model value beside the market value, and NOTIONAL
    CONTROLLED beside capital at risk. Time in force is stated in words.
  - Working orders listed first on Positions and on the front page, with age,
    limit, time in force, cancel and re-price. Re-price cancels and returns to
    Build, so there are still six order paths. `sent` and `fill` are two
    separate Journal entries. PRD §10e.
  - `entryRoom()`: three bands, hard block only at or inside the exit window,
    typed override between there and the 30-day floor, `passedOver` offerable.
    PRD §4f.

WHAT P1 INHERITED FROM THIS WORK — and what it did with it:
  - **The 4x ratio is CHOSEN, not measured. STILL OPEN.** The live-chain
    distribution of market-net over model-net was not readable from the sandbox
    (no broker keys, egress proxy refuses the CONNECT). What was measured is the
    model's own error budget, and the table is in the comment beside the
    constant. Expect a real reading to bring 4 down. Same for
    `openLimitSlippage` and `closeLimitSlippage`.
  - **`store.expiryLog` is empty. STILL OPEN.** `passedOverRecord()` writes one
    row per market per board as the app is used; P5 calibrates the 30-day floor
    from it. Nothing can be read until the owner has used the app.
  - ~~The ticket is a second consumer of `analyze()`'s per-leg marks.~~
    **CLOSED by P1.** It was: the Shortlist passed `legPx[i].px` and the ticket
    re-derived the marks from `quoteFn(leg).mid`, which differ for a leg priced
    off the model. `modelCheckOf()` in App.jsx is the one expression now, and
    `ceiling.test.jsx` holds the ticket's reading against the Shortlist's.
  - ~~`ComboBookPanel` computes `modelSanity()` on every render.~~ **CLOSED by
    P1** — the verdict is computed once in a `useMemo` on the Build screen and
    passed down; `riskGate.test.js` fails the build if `pro.jsx` calls
    `modelSanity` again.
  - ~~`REASON_MIN` was a bare 15; there may be more copies like it.~~ **SWEPT.**
    Three more were found, all of them `45` where `RULES.targetEntryDTE` lives:
    the Build screen's default horizon, the wide search's default and its
    fallback. `riskGate.test.js` now refuses the SHAPES a copy takes here.

## P1 — Coherence: one number, one source  (DONE — both halves are shipped)

**NEVER CITE A LINE NUMBER IN THIS FILE.** The version of this section that
shipped with P0 sent the next session to App.jsx 1504, 1865, 2345 and 1658, and
by the time anybody read it the real sites were 1613, 2017, 2337, 2516 and 1799.
A line number is stale the moment the file above it changes; the function name
is not. Find these by searching for the name.

SHIPPED (PR "the position that did not remember its size"):
  - **The position remembers its size.** `commitPosition()` in App.jsx stores
    `contracts` — the broker order body's `qty` where there was an order, the
    number the user confirmed where the app opened on its own book.
    `positionSize()` in `src/journal.js` is the one way it is read back, and it
    reports whether the 1 it returned is the record's or its own. Positions
    saved by older builds are given an ASSUMED 1 at hydration
    (`withPositionSize()`) and every screen that prints a size says which it is.
  - **The gate runs at the quantity that will be sent.** The hardcoded
    `contracts: 1` is gone from `commitPosition()`, `sendToAlpaca()`, the
    `guard` memo on Build, `GuardianPanel.placeExit()` in pro.jsx and the
    autopilot's close proposal. The ticket's quantity is no longer the ticket's:
    it is Build-screen state (`contracts` in App.jsx) that the gate preview, the
    confirm step, the order body and the position record all read.
  - The one place a `contracts: 1` survives is the wizard's road candidate, and
    it is genuine: a road is built to fit the budget answer at ONE combination.
    The road card says so in those words.
  - **One model check.** `modelCheckOf()` in App.jsx, used by all three
    generation sites and by the order ticket.
  - **`riskGate.js` no longer spells `Math.max(1, Number(p?.contracts) || 1)`
    three times.**

SHIPPED (PR #25, "one chance, one arithmetic") — THE OTHER HALF, AND P1 CLOSES:
  - **The Monte Carlo is the single truth.** `terminalMC()` in `engine.js` is the
    one arithmetic, `chanceOf()` in `rules.js` the one policy around it, and
    `chanceCheckOf()` the one spelling of it in App.jsx. The FOUR calculations of
    "the chance" are one, and the real difference between them was never the
    algorithm — it was the drift: seasonal, risk-neutral 0.045, risk-neutral
    0.045 again, and zero.
  - ~~One `probProfit`.~~ **DECIDED AND DELETED.** Both closed forms are gone.
    CLAUDE.md's note said the duplication was deliberate because the two had
    different SIGNATURES; that was true and was never a defence of the ANSWER.
    `exitPathSim` in `pro.jsx` keeps its own body and its own note — it answers a
    different question and the UI depends on its extra fields.
  - ~~One EV formula.~~ **DONE.** `evProfile()` and the Build stat read the
    simulation's own mean. `pop * maxProfit` is a two-outcome bet and most of a
    spread's distribution is between those two outcomes.
  - **It is SEEDED**, from the position itself, so the same trade gives the same
    number on every screen by construction rather than by coincidence.
  - **The chart reads the same drift, and fixing it found a second fault**:
    `chanceInProfit()` integrated the profit bands without their TAILS, and
    `payoffBands()` only samples ±30% of spot — on BOIL that is one standard
    deviation, so a long call's chance read 15% where it is 34%.
  - **The server reads the same engine.** `autopilot.mjs` imported `SEASONAL`
    from `engine.js` three lines above computing its `pop` at a risk-neutral
    drift.
  - **The seasonal thesis now enters the app's own probability, which is HALF OF
    P2 ARRIVING EARLY.** P2's house distribution is "seasonality + the four
    factors + REALISED volatility"; the drift half is here. The volatility half
    is not: the chance is worked out at the chain's IMPLIED volatility, which is
    a decision (the market sets the width, the app's thesis the lean) and not a
    measurement.
  - PRD §4h carries the before/after table across all five markets. Every
    directional structure moves the way its market's season points and the
    condors barely move, which is the check that the drift is what moved.
DONE WHEN: ~~a test proves Radar, Shortlist, Build, Guardian and the autopilot
print the same number for the same position~~ — done and tested (`P1 DONE WHEN —
five screens, one position, ONE number`, `src/ceiling.test.jsx`, against the real
generation sites). ~~and a proposal that passes the gate on screen passes it
again in the ticket at the quantity shown~~ — done in PR #23 (`SIZE — a proposal
that passes the gate passes it again at the quantity shown`, `src/riskGate.test.js`).

WHAT P1 HANDS FORWARD:
  - **Nobody has seen any of the new numbers on a phone.** Every probability in
    the app moved, and the run count (8,000) was timed on the development machine
    at 0.54 ms a candidate — about 43 ms for the widest pool. A phone is several
    times slower and is the machine this app is demoed on.
  - **The drift is only as good as `SEASONAL`**, which has the WRONG SIGN on
    eight months of twelve for CORN against real data. That table now drives the
    probability as well as the score. Fixing it is P2.
  - **`probProfit` is deleted and the closed form was about four times cheaper.**
    If the phone reading says the Monte Carlo is too slow for ranking, the
    decision to run one count for both is the one to revisit. The rule that
    survives either way: no screen prints a closed-form number as "the chance".

## P1-bis — PR #24: a rule number can hide in an expression  (DONE, and it found one)

The rule-literal guard could only see a copy that was a `useState` default, a property or a
local constant. It now also refuses **a rule number inside an arithmetic expression**, and it
sweeps every file that computes a number a screen or a brief prints — the list is read off the
disk, so `engine.js` and the Netlify functions are in it and so is whatever is added next.

SHIPPED:
  - **The exit simulator was running at the wrong rule.** `exitSim()` in `engine.js` held four
    copies of three rules: `takeProfitPct` (0.5) and `stopLossPct` (0.5), right by luck, and
    `exitDTE` twice as a bare **7** when the rule has been **21** since it was changed from 7.
    It walked each position to 7 days and marked the survivors at 7 days, and `autopilot.mjs`
    handed the answer to the model in a field called `p_exit_at_exit_dte_positive`. The name
    asserted the rule the arithmetic had not applied. PRD §4g carries the before/after table:
    every simulator output moves, `pTP` and `pSL` fall on every fixture, `pTimePos` rises, and
    `ev` has no single direction because it is a mixture whose three weights all changed.
  - **The policy is the caller's and has NO DEFAULT.** `engine.js` imports nothing and `rules.js`
    imports `engine.js`, so the engine may not read RULES; `exitSim` takes
    `{ exitDTE, takeProfitPct, stopLossPct }` and throws without them. A default is how the bare
    7 comes back silently in a year.
  - `pro.jsx`'s own `exitPathSim` had the same bare 7 in its survivor mark, disagreeing with its
    own walk; `chainAlpaca.mjs` had `dte - 45` twice and `visuals.jsx` a default `dte = 45`. All
    read their home now.
  - **The fallback volatility has a name.** `SIGMA[pos.ticker] || 0.25` became
    `RULES.fallbackSigma` with `sigmaProvenance()`, and the brief, the model and the warnings all
    carry which of the two was in force. The TABLE is still five typed numbers — that is P2.
  - New `src/engine.test.js`: the throw, the horizon proved arithmetically at sigma zero, the
    seeded before/after fixtures as real assertions, and a guard that `netBS()` is never called
    with a number where the days go.

WHAT THE NEXT SESSION INHERITS:
  - **THE PAST BRIEFS ARE WRONG AND NOTHING MARKS THEM.** Every autopilot brief the owner has
    received described the chance of being positive "at the exit rule" at a horizon fourteen days
    past the rule. Those briefs are in the Journal. Nobody has re-read one against this fix, and
    the autopilot has never been watched running with the fix in it.
  - **THREE UN-HOMED NUMBERS, FOUND AND DELIBERATELY NOT FIXED**, each because it needs a product
    decision rather than a rename: the "watch" attention level at `0.35 * p.maxLoss` in App.jsx
    (its value collides with `maxSpreadShareOfMid`, which is the one rule number kept off the
    sweep list for that reason); the "70-confidence bar" in two generated sentences in
    `signals.js` (nothing in RULES holds it; its value collides with `expensiveIVRank`, and the
    file is excluded from the sweep by name); and the bare `0.25` IMPLIED-VOLATILITY fallbacks in
    `autopilot.mjs` and `pro.jsx`, which are a different quantity from the simulator's sigma and
    were left rather than conflated with it.
  - **The guard cannot catch a STALE copy**, which is what the bare 7 was: 7 is not the value of
    any rule, so nothing could name it. What was caught were the two `0.5`s beside it. The shape
    is refused separately for `netBS()` only.
  - **The check count has three different values in the record.** PR #23 wrote 588, the brief for
    #24 said 561, and a clean `main` measures 594. This session took 594 as ground truth and
    reports 606. A count nobody can re-derive is worth as little as a rule number with two homes.

## P1-ter — PR #25: the two debts PR #24 handed forward  (DONE)

  - **THE BRIEFS WRITTEN AT THE WRONG HORIZON ARE MARKED, AND NOT BY DATE.** New
    autopilot timeline entries carry `simExitDTE` and `simDays` — the simulator's
    own answers, never RULES written out a second time. The ABSENCE of that stamp
    is what identifies an entry written before the fix, the same pattern
    `contractsAssumed` uses for a size nobody recorded, and every screen that
    renders one says so in a single sentence. PRD §4i.
  - **THE THREE UN-HOMED NUMBERS HAVE HOMES, AND NOT ONE CHANGED VALUE.**
    `watchAttentionShare` (0.35), `autopilotConfidence` (70) and `fallbackIV`
    (0.25). `maxSpreadShareOfMid` is back on the rule-literal sweep list and
    `signals.js` is back in the swept file set — both clean on the first run, so
    nothing was hiding behind either collision. `fallbackIV` is deliberately a
    SECOND constant beside `fallbackSigma`: one is realised, one implied, and
    merging them would make a correction to either silently move the other.

## P1-quater — PR #26: one seasonal source, and a chance that names it  (DONE)

The debt P1-ter handed forward, closed: **no screen and no brief prints a chance without saying
which seasonal reading drifted it.** PRD §4j.

  - **`seasonalProvenance()` in `rules.js` is the one home**, beside `markProvenance()`,
    `sigmaProvenance()` and `ivProvenance()`. It returns the means, whether they were MEASURED or
    the HAND-WRITTEN estimate, the year count, the age in days and the one sentence.
  - **`chanceOf()` will not work without it.** A caller handing twelve bare numbers THROWS — the
    same discipline as `terminalMC()` throwing without an exit policy — and `riskGate.test.js`
    sweeps every source file for the shape as well, because the throw catches the call that runs
    and the sweep catches the call written today that runs only on a market nobody demos.
  - **`chanceSourceNote()` may no longer call the hand-written row "this market's own seasonal
    reading".** It did, whichever table had produced the drift.
  - **The server reads what the client's loads have already cached.** `autopilot.mjs` was passing
    `SEASONAL[pos.ticker] || SEASONAL.SPY` with no measured means available to it at all while
    App.jsx had been loading them per market for four pull requests — two tables, one question.
    It now reads `av/<SYM>.json` out of the blob store `av.mjs` already fills: **one read per
    ticker**, never one per position, **never a fetch** (the free tier is 25 requests a DAY for
    five markets), and **a stale entry served as is**, because month-old measured seasonality
    beats a table with the wrong sign on eight months of twelve.
  - **`parseAvJson()` and `statsFromMatrix()` moved from `App.jsx` to `engine.js`**, so the client
    and the server derive the means from one parse of one body. A Netlify function cannot import
    `App.jsx`; keeping the parse there would have meant a second seasonal table on the server.
  - **Every surface that prints a chance prints the sentence** — Build, the Shortlist, the wide search, the multi-market
    scan, the guided roads, kept candidates, the Guardian, the Journal's closed-trade thesis, the
    autopilot brief, the weekly report and the copilot's context. The Guardian prints **two**: the
    table in force now and the one recorded at entry, because its Thesis Integrity Score divides
    one by the other and was reading a change in the TABLE as a change in the TRADE.
  - **The absence of the stamp is the marker**, the same pattern `contractsAssumed` and
    `simExitDTE` use: a record written before this carries no `seasonalSource`, and that absence
    reads as the hand-written estimate because it was the only table either side could reach.
  - **Nothing inside `SEASONAL` was edited.** One corrected CORN cell is worth 18.9 points of
    printed chance and the sign of the average result (§4j) — which is the argument for P2, not a
    licence to hand-edit the table here.

WHAT P1-QUATER HANDED FORWARD — and what PR #27 did with it:
  - ~~**THE MEASURED PATH HAS NEVER RUN ONCE.**~~ **HALF CLOSED BY PR #27.** "Unexercised" is
    closed: `src/avFixture.js` builds a body in the shape Alpha Vantage returns (string values,
    `"5. adjusted close"`, the refusal bodies served with HTTP 200), `engine.test.js` holds
    `parseAvJson()` and `statsFromMatrix()` against it, and `autopilot.test.js` drives
    `measuredSeasonal()` through every branch against a fake blob store. **"Never run" is STILL
    OPEN**: no key, no egress, so the live call has not been made and only the owner's own deploy
    can make it.
  - **THE BEFORE/AFTER IS CORN ONLY. STILL OPEN.** SOYB, UNG, BOIL and WEAT have no measured
    seasonal cells anybody has written down, and now no measured VOLATILITY either.
  - **NONE OF THE SENTENCES HAS BEEN READ ON A SCREEN. STILL OPEN**, and PR #27 added one more
    to the Guardian's panel.
  - **THE AUTOPILOT HAS STILL NEVER BEEN WATCHED RUNNING** — the fourth pull request in a row to
    hand this forward.

## P1-quinquies — PR #27: one volatility source, and an exercised parse  (DONE)

The other debt P1-quater handed forward, and the volatility half ROADMAP P2 still owed.
PRD §4k.

  - **THE GUARDIAN AND THE BRIEF WALKED ONE POSITION ON TWO VOLATILITIES.**
    `statsFromMatrix()` has always returned the MEASURED realised volatility of the monthly
    series beside the twelve means; `App.jsx` stored it as `seasonal[tk].sigma` and handed it to
    `exitPathSim`, while `autopilot.mjs` called `sigmaProvenance(SIGMA[pos.ticker], ...)` with no
    measured value available to it at all. `pTP`, `pSL`, `pTimePos`, `ev` and `medDays` all move
    with the difference, and neither screen said which number had produced its figures.
  - **`sigmaProvenance()` LEARNS A THIRD SOURCE**, in the same shape `seasonalProvenance()` uses
    - value, source, year count, age in days, one sentence - and it stops saying "written down,
    not measured from returns" about a number that was measured.
  - **THE SIMULATORS TAKE THE PROVENANCE AND REFUSE A BARE SIGMA.** `exitSim` and `exitPathSim`
    throw on anything that is not `{ sigma, source }`, structurally (engine.js reads no RULES),
    and RETURN the sigma and source they walked on — the §4i rule that a field name must never
    assert a reading the arithmetic did not use.
  - **ONE BLOB READ, TWO PROVENANCES.** `measuredSeasonal()` returns the volatility it was
    already computing and throwing away. No second read, no fetch, one read per ticker, stale
    served as is, cache emptied at the top of every run.
  - **THE ABSENCE OF THE STAMP IS THE MARKER**, the third time: an autopilot entry with no
    `simSigmaSource` reads as the hand-written table, because the table was the only volatility
    the autopilot could reach. `simVolOf()` / `autopilotVolNote()` in `src/journal.js`.
  - **THE BUILD FOOTNOTE WAS NAMING THE WRONG QUANTITY.** It printed `seas.sigma` — the realised
    volatility, which nothing on that panel uses — so it now names the implied volatility and the
    seasonal table that actually produced the figures above it.
  - **NOTHING INSIDE `SIGMA` WAS EDITED**, and `fallbackSigma` is still a separate constant from
    `fallbackIV`.

WHAT THE NEXT SESSION INHERITS:
  - **NO MARKET'S REALISED VOLATILITY HAS BEEN MEASURED.** §4k's table is the hand-written row
    perturbed by a stated factor — a sensitivity of the simulator, never a measurement. The sign
    and size of the correction to `SIGMA` are unknown. This is now the sharpest edge of P2.
  - **THE LIVE ALPHA VANTAGE CALL HAS STILL NEVER HAPPENED.** The fixture proves the parse; only
    a deploy proves the path.
  - **THE GUARDIAN'S PANEL NOW CARRIES THREE PROVENANCE LINES** (two seasonal from PR #26, one
    volatility from PR #27) under its figures. Nobody has looked at that on a phone.
  - **THE WEEKLY REPORT PRINTS NO EXIT-SIMULATOR FIGURE OF ITS OWN.** The only route those
    numbers take into it is the autopilot's rationale inside a timeline entry, which the PDF
    export renders and which now carries the note. If the report ever gains its own simulation,
    it needs the sentence too.

## P4 — UX  (BROUGHT FORWARD, and PR #28 is the first half of it — DONE)

**WHY IT CAME FORWARD, AND IT IS NOT QUEUE-JUMPING.** P4's stated premise below — "the THREE
PROBABILITIES panel is deleted, an ambiguity P2 resolves in code" — was ALREADY SATISFIED BY P1:
PR #25 made that panel TWO QUESTIONS, because there were only ever two and the third was an
arithmetic that did not agree with itself. P4 had been waiting on something that had already
happened. **P0 IS STILL OPEN** and its DONE WHEN is unchanged — a real fill, not a test — and this
work is what stands between the owner and that fill.

**AND THE REAL REASON: THE OWNER USED THE APP ON HIS PHONE, AGAINST THE LIVE MARKET, FOR THE FIRST
TIME.** Six pull requests in a row had been interior coherence work, because a sandbox with no
keys, no egress and no browser can only make the code honest about itself. That ended. There are
screenshots now, and they found **three faults in the ARITHMETIC that no test in this repository
could have caught, because every one of them is a number that is internally consistent and
describes a trade the user cannot have.** PRD §4l.

SHIPPED (PR #28, 705 checks across 19 suites, build clean):

  - **THE SPREAD FLOOR MEASURED ONE LEG AT A TIME AND CHARGED THE PAIR.** UNG 2026-09-20, the
    10.50/11.00 call spread: each leg about ten cents wide — 21% and 29% of its own mid, both
    comfortably inside the 35% per-leg ceiling — and the combination **143% of its own mid**, four
    times that ceiling, offered. Two leg spreads ADD while two mids SUBTRACT, and no per-leg number
    can see it. `RULES.maxComboSpreadShareOfNet` (1.0 — "the ask is at most three times the bid")
    with `comboSpreadFloor()` sits BESIDE the per-leg one, with its own count and its own sentence,
    at all three generation sites. It changes what is OFFERED, never what may be SENT.
  - **EVERY FIGURE ON BUILD WAS WORKED OUT AT A PRICE THE APP ITSELF SAID WOULD NOT FILL.** At the
    mid: pay $14, make $36, lose $14, break even 10.64, 2.6:1. At $24, the price that trades: pay
    $24, make $26, lose $24, break even 10.74, **1.1:1**. `analyze()` takes the entry price as an
    argument now, `AE` on the Build screen is the analysis at the price that will be SENT, and the
    stats, the gate, the confirm step, the ticket and **the position record** all read it.
  - **A LIMIT IS A CEILING, NOT A PRICE.** An order past the touch fills AT the touch, so offering
    more costs nothing — and the app, which explains far smaller things at length, never said it.
    `effectiveLimit()` / `limitCeilingNote()`: *"you offer $30, you pay $24."*
  - **THE TICKET, REBUILT TO THE DESIGN AGREED WITH THE OWNER.** The market read-only first with
    the bid, the ask and **the SIZE at each** (`bs`/`as` were in Alpaca's payload all along and
    `chain.js` parsed them away); one slider per leg in one-cent steps; the net big beside its own
    arithmetic; **time in force as part of the verdict, not a dropdown**; one coloured band with
    three states naming the distance; four numbers that move at the effective price. And the
    CONFLICT paragraph, which was on that one page FOUR TIMES, collapsed into one panel with the
    count in its summary line — **without touching the gate**.
  - **THE COMPARE PICTURE DREW ONE TRADE TWO WAYS.** `ComparePayoffs` drew at the candidate's
    REALISED volatility with no drift at all, under a `pop` computed at the chain's IMPLIED
    volatility on the seasonal drift. `terminalDist()` loses its default drift, the candidate
    carries `chanceDrawFields()`, and an unstamped one draws nothing and says why.
  - **AND THE SWEEP GAINED THE SHAPE THAT HID IT.** `|| 45` is `RULES.targetEntryDTE` in a
    FALLBACK OPERAND — not assigned, not added — which shapes 1, 2 and 3 all walked past. PR #24
    fixed a parameter default of 45 in that very file while this spelling survived four lines away.
    Shape 4 now refuses `IDENT || 45` and `IDENT ?? 45`, with five more quiet-cases proving it does
    not cry wolf.

~~**THE REST OF P4 IS STILL OPEN**: the trade card's five fixed lines~~ — **DONE BY PR #30**, see
P4-ter below. The THREE PROBABILITIES deletion was DONE by P1 (PR #25).

**AND THE "IN EUROS" IN THAT LINE IS CORRECTED, NOT OBEYED.** The account is an Alpaca paper account
denominated in US dollars and every figure in this app is a dollar. Converting would put a second
number on a card whose whole purpose is that there is one. The card SAYS which currency it is
counting, once (`cardCurrencyNote()`), and this roadmap line is wrong rather than the code.

WHAT PR #28 HANDS FORWARD:
  - **`maxComboSpreadShareOfNet` (1.0) IS CHOSEN, NOT MEASURED**, and joins the same list as
    `modelDisagreementRatio`, `openLimitSlippage` and `closeLimitSlippage`. Nobody has read the
    distribution of combination spread over combination net on the five live chains. **Expect a
    real reading to bring it down** — and the pair floor has never emptied a real board, so how
    much of a live chain it removes is unknown.
  - **NOBODY HAS SEEN THE REBUILT TICKET ON A PHONE.** A table, four sliders and a coloured band
    added to the screen three previous pull requests also added to. This is now the FIFTH item in a
    row handed forward that only a phone can settle.
  - **THE SIZE COLUMN HAS NEVER BEEN FED A REAL SIZE.** `bs`/`as` come from a hand-built fixture.
    Whether the indicative feed populates them is unknown, which is why a missing size draws "?"
    and a sentence.
  - **THE EFFECTIVE PRICE IS NOT THE FILL PRICE.** The record carries `min(limit, ask)`; the broker
    records the fill, and `recheckOrders()` does not reconcile the two. Nothing has ever filled, so
    they have never been compared. **This is P0's business.**
  - **`UnifiedPosition()` KEEPS ITS OWN `sigma = 0.3`.** The same species of number as the two
    TASK 2b removed, deliberately left rather than widened into unasked scope. It is the obvious
    next thing to point the sweep at.

## P4-bis — The app stops arguing with the broker  (PR #29 — DONE)

The SECOND live reading, one day after the first, same phone. §4l found three numbers that were
wrong; this found a screen **contradicting itself and the broker, in one scroll**. PRD §4m.

    OPEN POSITIONS (0)   Nothing open on Alpaca.        <- the broker
    WORKING AT THE BROKER (3)   CANCELED / EXPIRED / CANCELED
    YOUR POSITIONS (3)   -$80  -$27  $0
    TODAY · EVERYTHING IS ON PLAN

None of those three trades had ever been bought. The -$80 was the loss on a trade that does not
exist, in the largest, reddest figure on the card — with the correct warning in small amber text
directly underneath it.

SHIPPED (PR #29, 717 checks across 19 suites, build clean):

  - **DEAD IS NOT WORKING.** The live-orders filter was `p.alpacaId && p.alpacaFilled === false` —
    it asks whether an order was FILLED and never whether it is still ALIVE, so a cancelled order
    stayed "working" for ever. `order.js` had known which statuses are finished since PR #18 and
    nobody asked it; the row even PRINTED the status, which is why CANCELED appeared inside a panel
    headed WORKING. `orderLifecycle()` is the one home, and `riskGate.test.js` refuses that filter
    shape ever again.
  - **ONLY WHAT THE BROKER FILLED IS A POSITION.** `positionStage()` in `journal.js`: `owned` /
    `working` / `not-taken`, one function, every list derived from it in one pass. Positions counts
    only `owned`; the attention alert reads only `owned`; `recheckOrders()` stops re-asking the
    broker about orders that have been dead for days. **Unknown is not dead** — an order nobody has
    asked about is `working`, never buried on the app's own authority.
  - **WATCHING IS THE FOURTH PLACE**, and the owner asked for it in those words. Trades that were
    sent and came back with nothing bought arrive by themselves; structures saved from the Shortlist
    join them. `store.saved` has carried the entry price and the date since the path was built and
    did nothing with them but offer a Load button — from the bottom of the Positions screen, which
    is precisely the crowding he was complaining about. It has left that screen.
  - **A THEORETICAL FIGURE MAY NEVER BE PAINTED LIKE A REAL ONE.** `wouldHaveDone()` returns the
    number and its sentence together so neither can be rendered alone, in muted grey, never the red
    the Positions cards use — otherwise the fault is rebuilt one tab across. Held by a test.
  - **AND THE STARTING PRICE IS THE TRAP §4l JUST FIXED.** A saved row's entry came off the
    Shortlist, which prices at the MID. Every row says which of the two prices it began from, and an
    unstamped one is named rather than flattered — the fifth use of "the absence of the stamp is the
    marker".
  - **`Number(null)` IS 0 AND 0 IS FINITE, for the fifth time**, caught by its own test on the first
    run: a structure with no readable price today read "down $450" instead of unreadable.

WHAT PR #29 HANDS FORWARD:
  - **NOBODY HAS SEEN THE WATCHING TAB.** A fourth tab on a 390px phone is a real cost and the
    owner chose it from a description, not a screen. Sixth item in a row only a phone can settle.
  - **NO WATCHED ROW HAS BEEN RE-PRICED AGAINST A LIVE CHAIN**, and **the `entrySource` stamp has
    never been written by a real open** — so only the "starts from the MID" branch has ever
    rendered.
  - **EVERY §4l DEBT IS STILL OPEN AND UNTOUCHED**: the pair ceiling is still chosen not measured,
    the rebuilt ticket still unseen, the size column still never fed a real size, and the effective
    price still unreconciled against a fill. **That last one is P0's**, and P0 has not moved.

## P4-ter — The app stops inventing contracts, and the decision is five lines  (PR #30 — DONE)

The THIRD live reading, and the first where the order never reached the market. PRD §4n.
**This is ROADMAP P0 and the remaining half of P4, and they were one session**: the bug blocks the
fill, the density is why the owner could not see it coming, and both are on the same screen.

SHIPPED (PR #30, 735 checks across 19 suites, build clean):

  - **THE APP INVENTED A CONTRACT THAT DOES NOT EXIST.** Four of the six order paths spelled
    `q?.occ || buildOcc(ticker, expKey, l.type, l.strike)`, and `buildOcc()` FORMATS a symbol out of
    a strike the APP chose — it cannot know whether anybody issued it. An unquoted leg therefore made
    the app name `SOYB261120C00027500` and ask the broker to trade it. **A contract the feed did not
    list is UNKNOWN and never a well-formed symbol**, which is the same rule this codebase already
    keeps for open interest, quote sizes, drift and maximum profit.
  - **IT IS IN THE GATE**, as `UNLISTED_CONTRACT`, a fourth refusal beside `UNPRICEABLE` and
    `IMPOSSIBLE_LOSS` and in the same register: its own code, its own sentence with the leg in it,
    its own test. Four paths made one mistake; the gate is the one place all six pass through. It is
    **not** a quality floor — those stay out for ever — because a contract that does not exist is not
    a trade at all. Entry only: refusing to let somebody OUT of a position because a feed went quiet
    is the worse failure, so the close path refuses in `placeExit()` instead, beside the button.
    `buildOcc()` survives for NAMING a contract, in exactly one place, and a test holds it there.
  - **THE TICKET'S OWN GATE CALL WAS WEAKER THAN THE SCREEN ABOVE IT.** It passed no `quotes` and no
    `net`, so `priceability()` inside the gate could not refuse an unquoted leg, while the Build
    screen's `guard` memo passed both. Both carry the same evidence now, and `riskGate.test.js` fails
    the build if an open-intent gate call leaves `quotes`, `net` or `occs` out.
  - **STRIKES ARE A PROPERTY OF THE BOARD.** Neither the expiry dropdown nor `buildHandOff()`
    re-snapped a leg carried onto a new expiry, which is how a 27.5 from a board that lists half
    dollars survives onto one that does not. Both re-snap now (`resnapLegs()` / `expiryStrikes()` in
    `chain.js`), an unloaded chain is left alone rather than snapped against a fallback grid, and what
    moved is said in one sentence. **Which of the two paths actually did it is not known** — the live
    chain cannot be reached from here — and 0a is the defence that holds whichever it was.
  - **THE DECISION WAS ELEVEN BLOCKS LONG, AND IT IS FIVE LINES.** `tradeCard()` in `rules.js`, with
    every other generated sentence: what you are betting on, what you risk, how often it works, when
    it exits, what would make it wrong. **No new arithmetic** — every figure already existed on that
    screen. **None of the old copy is cut**: the stat tiles, the greeks, the ticket and the confirm
    step open behind a tap in `DeskSheet`, the same viewport-fixed sheet the evidence panels use.
    **A refusal is never behind a tap** — every gate violation renders on the card, beside the button.
  - **AND IT CLOSED THREE DUPLICATES.** "One leg has no two-sided quote" was on the Build screen
    TWICE — inside the panel PR #28 built to stop the CONFLICT paragraph being there four times — and
    it needed a rule rather than another pass: `unquotedLegNote()` keeps its home where the legs are
    NAMED and everywhere else prints `unquotedLegPointer()`. The gate's verdict was printed hundreds
    of pixels above the control it governs, and the gate's warnings were printed raw beside a
    collapsed panel already printing the same list.
  - **THE MARKET ORDER EARNS ITS WARNING.** The refused order was MARKET, on a book with an unquoted
    leg, on chains this repository has measured at 66-166% of the mid — and the stat tile under it
    said "at the price below, not at the mid" with no price below. The label is correct now and
    `marketOrderNote()` says what a market order actually does on these books. The OPTION is not
    removed: that is a product decision, not a bug.

WHAT PR #30 HANDS FORWARD:
  - **NOBODY HAS SEEN THE TRADE CARD**, on a phone or anywhere else. Seventh item in a row that only
    a phone can settle, and the second in a row whose entire subject is what the screen looks like.
    The 390px layout is a statement about the CSS, not a reading.
  - **LINE 3 OF THE CARD IS NOT THE LINE P4 ASKED FOR, AND IT SAYS SO.** P4 wanted "how often it
    works under your own exit rule"; the app's one chance is where the price FINISHES, and the
    exit-rule figure (`exitSim`) exists only on an OPEN position. Computing one on Build would have
    been new arithmetic. **Giving Build its own exit-path figure is the obvious next thing**, and it
    is a real piece of work rather than a rename.
  - **WHICH PATH PUT THE 27.5 ON THAT BOARD IS STILL UNKNOWN.** Both are closed. Only a live chain
    settles which one.
  - **THE CAPITAL SET ON THAT PHONE IS UNKNOWN.** $942 of risk needs at least $18,840 of trading
    capital to clear the 5% cap; whether that is what is set cannot be read from here.
  - **EVERY §4l AND §4m DEBT IS STILL OPEN AND UNTOUCHED**: the pair ceiling is still chosen not
    measured and has never emptied a real board, the rebuilt ticket and the Watching tab and the
    four-tab row have still not been seen, the size column has still never been fed a real quote
    size, and `UnifiedPosition()` still carries its own `sigma = 0.3`. **And the effective price is
    still not reconciled against a fill, because nothing has filled. That one is P0's, and P0 has not
    moved.**

## P2 — Proposals ranked by edge, not by score
At market prices every structure has expected value near zero: high
probability and large payoff are two ends of one lever. So the app must
compute a distribution of its own and propose only where that distribution
disagrees with the market's.
  - a house distribution per underlying: seasonality + the four factors +
    REALISED volatility. ~~(today probProfit uses a risk-neutral drift, so the
    app's whole thesis never enters its own probability)~~ **THE SEASONAL HALF
    ARRIVED EARLY, IN P1.** Every probability the app prints is now a seeded
    Monte Carlo drifted on `seasonalDrift()` — the app's own thesis is inside
    its own probability. What P2 still owes here is the volatility: the chance
    is worked out at the chain's IMPLIED volatility, and the exit simulator
    walks on a hand-written `SIGMA` table with a labelled fallback behind it.
    Neither is measured from returns. And the drift is only as good as
    `SEASONAL`, which has the wrong sign on eight months of twelve for CORN —
    that table now drives the probability as well as the score, which raises the
    price of leaving it hand-written. **PR #26 PUT A NUMBER ON THAT PRICE**: one
    corrected CORN cell moves the printed chance by 18.9 points and flips the
    sign of the average result (§4j). It also made every screen SAY which table
    it is on, so the cost is now visible rather than merely present — what P2
    owes is the table itself. **PR #27 DID THE SAME FOR THE VOLATILITY HALF**
    (§4k): the exit simulator reads a measured realised sigma where one is
    loaded, refuses a volatility with no source attached, and says on every
    screen which of the three sources produced its figures. What P2 still owes
    HERE is the same thing — `SIGMA` is five hand-typed numbers and **no
    market's realised volatility has been measured at all**;
  - rank by edge = EV under the house minus EV under the market, net of
    spread and commissions. Below transaction cost, nothing is proposed —
    that will be the common case and it is correct;
  - the structure follows from where the edge is, not from a sentiment label:
    directional edge -> vertical; IV rich against realised -> credit; IV
    cheap -> debit; no edge -> nothing. This removes at the root the current
    state where every market is tagged VERY BULL and the only menu available
    contains debit structures;
  - strike offsets in units of sigma * sqrt(T) or by delta, never as a fixed
    percentage of spot: the same Iron Condor template is 67% on SOYB and 20%
    on BOIL today;
  - drop butterflies from the guided path (pTP near 0: incompatible with the
    50% take profit before the 21-DTE exit), and drop BOIL or keep it with a
    declared short horizon — a 2x daily-rebalanced ETF is not lognormal over
    45 days;
  - on screen, probability and payoff always together, with edge as the third
    number. Never rank on one number alone.

## P2-bis — The liquid commodity tier
Add GLD, SLV, USO, XLE, GDX. Same chain code, same order code: one table row
per ticker plus the news and weather mappings in signals.js. Real commodities,
so the seasonal engine still applies; far better option liquidity than the
grain ETFs, which is where the placeholder mids come from; larger notional
per contract. Calibrating the edge of P2 on liquid chains is far more
trustworthy than calibrating it on CORN.

## P3 — The harness
buildContext also carries the computed probability, the gate verdict with its
violations, the real sizing, and the liquidity and spread of each leg. The
copilot emits typed fields, never numbers: what it means, what to watch, what
would disprove it. Rewrite the SYSTEM_PROMPT decision trees, which today
recommend long calls and straddles the guided path excludes. Re-verification
at apply time on the OPEN path as well (the close path already has it in
approve.mjs).
REGRESSION TEST: the copilot can never again write "paste the chain data" or
estimate a price by hand.

## P4 — UX  (DONE — PR #28 and PR #30, both brought forward)
~~The trade card, five fixed lines: what you are betting on, what you risk in
euros, how often it works under your own exit rule, when it exits, what would
invalidate it. Everything else one tap away.~~ **DONE BY PR #30** (P4-ter).
**"In euros" is corrected**: the broker's account is in US dollars, the card
says so once and converts nothing. ~~The "THREE PROBABILITIES — which one to
read, and when" panel is deleted~~ — **DONE BY P1** (PR #25 made it TWO
QUESTIONS), which is why the premise this item was waiting on had already been
satisfied and the rest of P4 came forward as PR #28.

What P4 could NOT settle, and no code can: **nobody has seen any of it on a
phone.** That is now seven pull requests in a row handing the same item
forward, and the last two are pull requests whose entire subject is what the
screen looks like.

## P5 — Measure
Backtest the exit rules (take profit 50%, 21 DTE, stop loss as warning) on
the real underlyings. Calibrate the entry floor from the passedOver counts
collected in P0. Until then those numbers are inherited tastytrade defaults,
not the owner's rules.

## P6 — Universe
SPY, QQQ, IWM: the largest notional per contract and the deepest option
liquidity available, but no seasonal edge — needs a different signal engine.
Futures options are a v2 with a different broker (Alpaca has no futures, no
futures options, no index options, max 4 legs): it means rewriting alpaca.mjs,
chainAlpaca.mjs, the order.js conventions and the paper check in riskGate, and
losing the MCP server. Not before the loop closes.

## Not on the roadmap, deliberately
Raising the 5% per-trade cap or the 25% total exposure. It is the one change
that would raise the risk of ruin without giving anything back.
