# ROADMAP — Options Strategy Lab

One session, one prompt, one pull request. Every session opens by fixing what
the previous one flagged as unverified or broken. The owner decides the merge:
prompts open the PR and stop.

## P0 — The loop closes  (IN PROGRESS — THERE IS A FILL, AND IT IS A FAULT REPORT)
The order fills. Model-vs-market sanity check on every proposed price, an
opening limit that concedes part of the spread, a ticket that shows the combo
book and the notional controlled, working orders visible in the main flow,
and the entry floor rewritten as room (hard block only inside the exit
window, warning and typed override above it).
DONE WHEN: an opening order is really filled on the paper account and appears
in Positions. Not a test — a fill.

**AND THE CAUSE OF THE FOURTH WAS NOT WHAT PR #30 GUESSED. THE APP WAS MANUFACTURING ITS OWN
REFUSAL, ON EVERY FRESH MARKET** (PR #31, PRD §4o). PR #30 named two ways a 27.5 could reach a board
that lists whole dollars — the expiry dropdown and `buildHandOff()` — closed both, and put "which of
them it was" on the NOT VERIFIED list. It was neither. The Build screen's **default preset effect**
fires on the render where the chain arrives, `expKey` is set by a sibling effect in that same
render, so `expStrikes` is still null, and `snapStrike()` falls back to a grid: SOYB at 27.64, step
0.5, Bull Call Spread → **27.5 / 29**. Nothing re-snapped afterwards, so `UNLISTED_CONTRACT` fired on
**every fresh load of every board without half-dollar strikes**. `buildPresets()` refuses a null
board now, the effect waits for one, legs already in state are re-snapped when it arrives, and the
strike dropdown names a leg the board does not list instead of silently displaying its first option.

**AND THE GATE WAS CHARGING $1,042 OF EXPOSURE FOR TRADES NOBODY BOUGHT.** Read on the same screen:
450 + 577 + 14 against zero positions, all three sitting under WATCHING. `bookPositions()` in
`journal.js` is the one home for what counts — owned plus working, never not-taken — and the risk
gate, the weekly report, the model's context, `autopilot.mjs` and `approve.mjs` all read it.

**AND THE CHECKS SHOWN BEFORE THE TAP WERE NOT THE CHECKS THE TAP RAN.** The Build checklist was
evaluated against the app's own book while the send beside it gated against Alpaca. `bookFor()` is
the one expression that chooses an account now.

**ORDERS HAVE NOW BEEN SENT AND NONE HAS FILLED — BUT ONE HAS FINALLY REACHED THE MARKET.** The
first three were not met by the market; one of them sat at the exact mid, which the app now names as
the price nobody has to meet. The next was **refused by the broker for a reason the app created
itself**: SOYB, 20 September 2026, HTTP 422 / 42210000, *invalid legs: [leg.0 asset
"SOYB261120C00027500" not found]* — a well-formed symbol for a contract nobody has ever issued,
because `buildOcc()` was a FALLBACK in four of the six order paths. That is closed (PR #30, §4n) and
it is in the gate, where all six pass through. **On 21 September, J-0004 — SOYB 28/29, one
combination, DAY limit $60 — came back ACCEPTED from Alpaca with an order id.** It was sent at 04:15
ET, before the options opened, so nothing could have filled. Whether it fills is a market question,
and P0's DONE WHEN is unchanged.

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

SHIPPED (PR #31 "the app manufactured its own refusal", 769 checks, build clean):
  - `buildPresets()` returns nothing without a board, the preset effect waits
    for one, and legs already in state are re-snapped when it arrives. The
    fallback grid inside `snapStrike()` is unreachable from the preset path.
    PRD §4o.
  - `expiryStrikes()` is the ONE implementation of "which strikes does this
    board carry". There were four.
  - `strikeOptions()` / `offBoardStrikeLabel()` / `StrikeSelect`: a leg the
    board does not list is a disabled option that names itself, instead of the
    browser quietly displaying the first option (16 under a card reading 27.5).
  - `bookPositions()` in journal.js: owned + working, never not-taken. The risk
    gate, the report, the model's context, `autopilot.mjs` and `approve.mjs`.
    The report also multiplies by `positionSize()`, as the gate does.
  - `bookFor()`: the displayed checklist is gated against the account the send
    uses, the record against the account the trade went to, and `LOCAL_BOOK`
    survives only where nothing leaves the browser. `checkedAgainstNote()` says
    which. PRD §4o.

SETTLED ON THE OWNER'S PHONE — SOYB, 21 Sep 2026, 10:12-10:15 CEST (PR #32, PRD §4o):
  - **A FRESH SOYB LOAD PRODUCES 28 / 29.** The strike select shows 28, the
    chain row is highlighted +BUY 28 / −SELL 29, and the card agrees. The preset
    race and failure class 1 are both closed on a live board.
  - **THE PAPER CHECK NAMES THE BROKER'S ACCOUNT**: "account number
    PA3E1WPIW9SZ (Alpaca paper accounts start with PA)". `bookFor()` works.
  - **OPEN RISK READS $0 WITH 3 WATCHING ROWS**, and Positions, the gate and the
    working-order panel agree. `bookPositions()` works; the $1,042 of phantom
    exposure is gone.
  - **THE FOURTH ORDER REACHED THE MARKET.** J-0004, SOYB 28/29, 1 combination,
    DAY limit $60 (= the combo ask; bid $4, mid $28, model $35), Alpaca
    **ACCEPTED**, id 29fdee45-9104-41f2-87cf-2ea9e00f967d, sent 04:15 ET.
    `UNLISTED_CONTRACT` is closed on live data.

AND A SECOND ORDER IS NOW AT THE BROKER (21 Sep, deploy preview 32): J-0001,
XLE Bull Put Spread (credit), 1 combination, limit $75 GTC, Alpaca ACCEPTED,
id e98ad0e8-3a2e-4a1b-8c76-4e6c95d62ac0. Alpaca's own panel lists TWO orders
waiting — this one and the morning's SOYB `limit @ 0.6 · day`. Neither has
filled. Trading capital on that phone is $7,000 ($350 per trade, $1,750 total),
which corrects the $20,000 §4o inferred from a checklist.

**AND THE FILL ARRIVED — BECAUSE THE ORDER WAS WRONG (PR #33, PRD §4q).** J-0001,
XLE Bull Put Spread 2026-10-30, ticket CREDIT $75, GTC. Alpaca holds it as an OPEN
POSITION at a net credit of **$0.04 a combination**: $4 received against $75 intended,
max loss $346 instead of $275, −$112 on the screen. `unitLimit()` in `order.js`
returned `Math.abs()`, and Alpaca's multi-leg `limit_price` is SIGNED — positive a
debit, negative a credit. +0.75 read as "pay up to 75 cents", which is marketable
against a book quoting a credit, so it filled at once at whatever the book gave.
The broker's own panel states the convention in two fields: "Limit @ $0.75" beside
"Avg. Fill Price −0.04".

**DONE WHEN is NOT met by this fill.** An order that filled because it was inverted is
not the loop closing. What it did settle is everything downstream of a fill, which
nothing could reach before.

SHIPPED (PR #33, 818 checks across 19 suites, build clean):
  - **`limitDirection()` / `mlegLimitPrice()` in `order.js`: one home for the sign**,
    for both intents — opening a credit structure and closing a debit structure are
    both credits. `unitLimit()` keeps the MAGNITUDE for the single-leg body (its own
    `side` carries the direction) and for every screen. PRD §4q.
  - **The closing half had never been read by anybody.** `autopilot.test.js` carried
    the fault as an EXPECTATION: `limit_price === "0.48"` on a long call spread being
    CLOSED, which offers to buy back what the order is selling.
  - **Every displayed limit says "debit" or "credit" in words** (`limitWords()`,
    `limitKind()`). Three screens printed `Math.abs()` of the broker's own number, which
    is why no screen ever showed the fault: the app sent the wrong number and hid it on
    the way home.
  - **`fillVsLimit()` in `journal.js`** — the comparison below, closed.
  - **`isBrokerHolding()` / the import path** — §4r.1 below.
  - **`orderReconciliation()`** — §4r.3 below.
  - **`ensureOpenInterest()`** — §4r.4 below.
  - **`isButterfly()`** — P2's butterfly decision, implemented. §4r.5.

WHAT P0 STILL OWES, AFTER PR #33:
  - **A FILL ON A CORRECTLY PRICED ORDER.** The one fill this app has had is the fault
    report above. Nothing has yet been met by the market at a price the app meant.
  - ~~**The effective price against the fill price.**~~ **CLOSED BY PR #33.**
    `fillVsLimit()` in `journal.js` compares the SIGNED limit the order carried against
    Alpaca's SIGNED `filled_avg_price`, at the position's size, and says BETTER or WORSE
    in dollars. On J-0001 it reads "you offered a debit of $0.75 and the broker filled it
    at a credit of $0.04" — the §4q fault in the app's own words. It NEVER invents a
    limit: a record that has none says so. It has never rendered on a screen.
  - **Whether `working` should count towards the exposure ceiling.** It does
    now, deliberately: an order at the broker is money committed. Nothing here
    can measure how often one fills.
  - **The `/api/state` blob has still not been read.** $20,000 of capital is
    inferred from a $1,000 per-trade limit, now read on two days and two
    screens. Corroboration, not the store.

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

## P4-quater — The sign, the fill, and one chain with two verdicts  (PR #33 — DONE)

The FOURTH live reading, and the first with a FILL in it. PRD §4q and §4r.
**Every one of the three faults is the same shape: the app RE-DERIVED something the
broker had already told it, instead of reading it.** The owner put it in one sentence
while this was being written — *"hai sempre tutte le info da Alpaca con la API, devi
solo renderizzarle"* — and it is the rule these three are instances of.

SHIPPED (818 checks across 19 suites, build clean):

  - **CREDIT LIMITS WERE SENT AS DEBITS.** `unitLimit()` returned `Math.abs()` and
    the mleg body used it. Alpaca's multi-leg `limit_price` is SIGNED. A $75 XLE
    credit spread went out as a $75 DEBIT, was marketable against its own book, and
    filled for $4 with $346 of maximum loss. `limitDirection()` / `mlegLimitPrice()`
    are the one home for the sign, for both intents; single-leg orders stay unsigned
    because their own `side` carries the direction. **The closing half had never been
    read by anybody** and `autopilot.test.js` carried it as an expectation.
  - **AND THE READ-BACK HID IT.** Three screens printed `Math.abs()` of the broker's
    own number. Every displayed limit says "debit" or "credit" in words now, and two
    sweeps fail the build on the shape.
  - **A FILLED POSITION WAS LISTED AS AN ORDER STILL WAITING.** `importAlpaca()` wrote
    `alpacaId: "sync"` — a sentinel, not an order id — so `positionStage()` filed a
    holding the broker ALREADY OWNS as `working`, printed "A ? order, which time in
    force not recorded" over it, and `recheckOrders()` then asked `/v2/orders/sync`,
    which 404s into a silent catch. It could never resolve. `isBrokerHolding()` is the
    one home, no order field is invented for a holding, the fill price is stamped
    `entrySource: "fill"` and the exit plan starts with its date named.
  - **THE LIMIT AGAINST THE FILL, WHICH P0 HAS OWED SINCE PR #28.** `fillVsLimit()`,
    on the signed numbers both ways, at the position's size. It never invents a limit.
  - **AND THE TWO ORDER COUNTS SAY WHY THEY DIFFER.** `orderReconciliation()`. An
    unasked broker is not an empty one.
  - **ONE CHAIN, TWO VERDICTS.** The Radar said five markets reported no open interest
    while the Shortlist read GDX's median at 84 off the same board, and the guided
    run's number-one road had legs at OI 3 and OI 4. The difference was a RETURN VALUE:
    open interest is patched in after `refreshChain()` has already returned the bare
    chain. `ensureOpenInterest()` is the one home; the screen still never waits, a
    caller about to judge a floor does.
  - **BUTTERFLIES LEAVE THE GUIDED PATH**, by SHAPE not by name — P2's decision,
    implemented.

WHAT PR #33 HANDS FORWARD:
  - **NO ORDER CAN BE SENT FROM THE SANDBOX.** The sign is checked against Alpaca's
    documented convention and against the broker's own display of the XLE order, and
    against nothing else.
  - **THE CLOSING DIRECTION IS UNEXERCISED.** Nothing has ever been closed through this
    app, in either spelling.
  - **A CORRECTLY SIGNED CREDIT ORDER MAY NOT FILL AT ALL**, and that is the right
    outcome wearing a regression's clothes.
  - **THE XLE POSITION IS STILL OPEN AND STILL WRONG.** The owner's to close.
  - **THE OPEN-INTEREST FIX IS STRUCTURAL.** What the floor now removes on GDX, BOIL,
    WEAT, USO and SLV is the first thing to read on the next live run — and whether the
    guided pool, minus butterflies, still produces two roads.
  - **ALPACA REPORTS `delta` AND `theta` AND THE APP STILL COMPUTES ITS OWN.** Same
    species as all three faults above. Deliberately not touched. The obvious next one.
  - **NOBODY HAS SEEN ANY OF IT ON A PHONE.** Eighth in a row.

## P4-quinquies — The contract, the indicators, and a chart nobody had ever seen  (PR #34 — DONE)

The FIFTH session since the first live reading, and the first one whose subject is not an order
fault. PRD §4s, §4t, §4u.

SHIPPED (864 checks across 21 suites, up from 818 across 19; build clean):

**TASK 0 — the three debts PR #33 handed forward, first, as the standing rule requires.**

  - **AN UNSTAMPED `alpacaLimit` IS SIGN UNKNOWN.** One field held two different quantities
    depending on WHEN it was written — a signed limit since PR #33, `Math.abs()` of one before
    it — and nothing said which. `fillVsLimit()` compares DIRECTIONS on it and was completely
    confident about a record that cannot support one, and **the record the owner has in front of
    him is exactly such a record**. `commitPosition()` stamps `alpacaLimitSigned`; the ABSENCE of
    the stamp is the marker, for the seventh time. `storedLimitOf()` in `journal.js` is the one
    reader, an unstamped limit gets NO direction word, and no comparison is made at all — not on
    directions and not on magnitudes, because $79 better and $71 worse are two answers and the
    app cannot choose. It is NOT a migration: the direction is at the broker.
  - **THE EXIT LADDER PRINTED A BARE MAGNITUDE.** PR #33 said every displayed limit says debit or
    credit and missed the three buttons the owner will use to close XLE J-0001 — the first close
    this app has ever sent. `signedLimitFor()` in `order.js`, `ladderRungPrice()` in `pro.jsx`,
    arithmetic unchanged, and a sweep that fails the build on the shape.
  - **THE BODY THAT LEAVES MUST AGREE IN SIGN WITH THE BOOK IT MEETS.** `limitAgainstBook()` in
    `rules.js`: the sign of the body's own `limit_price` against the sign of `comboBook()`'s mid,
    with the intent applied to both. OPEN is a gate violation (`LIMIT_AGAINST_BOOK`, entry-only,
    needing no new evidence); CLOSE is never in the gate and is refused beside the button in
    `placeExit()`, `closeGroup()` and `approve.mjs`. Four unknowns SKIP and each names itself.
    **This is the check that would have caught J-0001 at the door.**

**TASK 1 — `src/alpacaContract.js`: orders speak Alpaca's own contract.**

  - There is no official JavaScript SDK for multi-leg option orders, so every field name, enum
    and validator lived in four order paths and a serverless function as four acts of memory —
    and every order-body fault this repository has had was that memory being wrong. The file
    mirrors **alpaca-py** with the source file cited for each rule; no Python vendored, no
    dependency added.
  - **`orderBody()` builds through it** and all six order paths pass through `orderBody()`. A body
    alpaca-py would not build is refused with the rule named, instead of after a 422.
  - Two rules are marked as THIS APP'S OWN: a leg whose `side` contradicts its `position_intent`,
    and the relatively-prime ratio rule Alpaca answered with 422 / 42210000 and alpaca-py does not
    check.
  - The RESPONSE shapes are mirrored too (`parseOrder`, `parsePosition`, `wireNumber`), so the
    signs survive and the nulls go out before the coercion in one place.
  - **ALPACA'S PUBLISHED OpenAPI SPEC PREDATES MULTI-LEG OPTIONS ENTIRELY** — no `mleg`, no
    `ratio_qty`, no `position_intent`, and `OrderClass` is `[simple, bracket, oco, oto, '']`. The
    suite says so instead of implying a check that did not happen, holds the three enums the spec
    DOES carry, and runs Alpaca's own documented SPY straddle as a fixture.

**TASK 2 — `src/indicators.js`, and a chart that was rendered by nothing.**

  - **`PriceChart` was exported and mounted by no screen in the app.** Mounted in the History
    evidence panel now, which is where price history belongs.
  - One home for SMA(20/50/200), EMA(9/21), Bollinger(20,2), RSI(14), MACD(12/26/9), ATR(14) and
    volume against its 20-day average, every period named with its reasoning and deliberately NOT
    in `RULES`. `signals.js` reads its trend from here and **its outputs do not change** — the old
    inline body is reproduced in the test and held equal over 200 readings on 40 seeded series.
  - **The RSI is Cutler's, not Wilder's, and the file says so**: the chart draws the SAME number
    the four-factor score reads, rather than a second one that looks alike.
  - Unknown is null everywhere, the chip says "not enough history" and cannot be switched on, and
    no line is drawn from zero. 390px first: overlays on the price pane, RSI and MACD in collapsed
    panes, a chip row remembered per viewer, a crosshair readout, one generated takeaway each.

**TASK 3 — a technical-analysis copilot under the chart.**

  - Four one-tap questions and a free box on the existing streaming path; `askAI` takes a system
    prompt, so there is no second endpoint and no second place the `message_stop` flush and the
    `max_tokens` check have to be got right.
  - **THE MODEL NEVER RECEIVES RAW BARS.** `taContext()` in `indicators.js` is the only source:
    a model given 400 closes computes a moving average, and that number would not be the one
    drawn above its answer. `taCopilotPrompt()` in `rules.js` forbids any figure not in the
    context; a test holds the sentence, holds the serialised context free of series, and holds
    the panel to `taContext()`.
  - **AND THE DESK PROMPT'S DECISION TREES ARE FIXED — P3's first item**, open since the guided
    path was built. They recommended a long call and a long ATM straddle, both of which
    `runWizard` excludes, so the copilot argued in prose with the screen beside it.

WHAT PR #34 HANDS FORWARD (the full list is PRD NOT VERIFIED):
  - **NO ORDER CAN BE SENT FROM THE SANDBOX. NINTH IN A ROW.**
  - **The alpaca-py rules were read from the default branch by URL**, so the exact commit is not
    pinned. Every rule cites its file, which makes a re-read cheap.
  - **`orderBody()` now throws** on a body the contract refuses, and no path has ever thrown live.
  - **The closing direction is still unexercised**, so `limitAgainstBook()` on the close paths has
    never run against a live book.
  - **The unstamped-limit path is what the owner sees FIRST**, on J-0001, and it will look like a
    regression against PR #33's screenshot. It is not.
  - **No indicator has been seen against a real chart**, and the chart copilot has never run — no
    broker key and no Anthropic key here.
  - **NOBODY HAS SEEN ANY OF IT ON A PHONE.** Ninth, and this one is a chart.

## P9 — ONE VOICE  (PR #35 — DONE)

The SIXTH session since the first live reading, and the second whose subject is
not an order fault. Evidence: the owner's live reading of 22 September 2026, sixteen
screens. His words: **"ancora abbastanza confusione, troppe info, trade suggestion non
chiari."** PRD §4v.

SHIPPED (911 checks across 22 suites, up from 864 across 21; build clean. One new
suite, `src/voice.test.js`).

**TASK 0 — the two debts the live reading exposed, first, as the standing rule requires.**

  - **A HOLDING WRITTEN BEFORE THE STAMP NEVER UPGRADED.** XLE J-0002 is a position
    Alpaca ITSELF lists, and the app showed it as "1 contract — assumed, not recorded",
    with one timeline entry, no fill entry, no exit plan and no `fillVsLimit()` sentence.
    The cause is a `continue`: `importAlpaca()` skipped any signature already in the
    store, so a record written before PR #33 could never be reached by the upgrade PR #33
    wrote — and the one holding the owner has is exactly such a record. `upgradeHolding()`
    in `journal.js` is the one home; the size is MEASURED from the broker's own leg
    quantities; NO ORDER FIELD IS INVENTED and an unstamped limit stays unstamped; it
    returns the SAME object when nothing changes, so the 60-second sync cannot loop.
  - **ONE P&L PER POSITION, AND IT IS THE BROKER'S.** The Positions card printed -$127 in
    the largest red figure on the screen, directly above the broker's own -$130 for the
    same position: `posAlerts` preferred `unrealized_pl`, the CARD re-derived its own from
    `netValue()`. `positionPnl()` in `rules.js` decides which source a figure came from and
    carries the sentence when it is the app's own mark; `pnlOf()` is its one spelling in
    App.jsx, and `riskGate.test.js` fails the build on a second one.

**TASK 1 — the app never proposes a trade its own gate would block.**

  - Radar and the multi-market search ran at "HORIZON ~21 DTE", every structure they
    offered sat at 24 DTE, and Build then said **THIS ORDER WOULD NOT BE SENT** —
    `ENTRY_DTE_ROOM`, three days of room against the thirty-day floor. **The app built a
    menu out of trades its own gate refuses**, which is worse than an empty screen: an
    empty screen with a sentence teaches the rule, a menu that dead-ends teaches that the
    rules are arbitrary.
  - The cause is THREE different expiry windows in three places, none of them the rule.
    `buildableExpiries()` / `openableBoard()` in `rules.js`, built ON `entryRoom()`, is the
    one home; the third generation site holds the guard INSIDE itself, the way
    `buildPresets()` refuses a null board. **The override is not withdrawn** — a door you
    may choose to walk through is not a corridor you are led down.
  - The horizon slider reads its rule at both ends; the expiry dropdown renders a refused
    board DISABLED and NAMED (`offFloorExpiryLabel()`); `expiryChoiceNote()` names the
    SELECTED board, so the dropdown and the sentence under it cannot read 2026-10-16 and
    "Building on 2026-11-20" again; the step-2 CTA under an empty shortlist asks for
    another expiry, another market or nothing today.
  - **A REFUSAL AND A REASSURANCE MAY NOT SHARE A CARD**: "none of them stops the order"
    is suppressed while a violation stands.
  - THE TEST: every candidate every generation site returns goes through `evaluateTrade()`
    in a dry run and must come back with ZERO violations, against the real generation
    sites — and the fixture proves the gate really does refuse 24 DTE, so the filter is
    load-bearing rather than decorative.

**TASK 2 — a position says one thing.**

  - Read in ONE scroll on XLE: home *"all inside the plan. Nothing to do"*, desk *"TODAY ·
    EVERYTHING IS ON PLAN"*, the row *"Losing: check the reason"*, the verdict *"→ HOLD"*,
    and **"OF THE MAXIMUM −3188%"** — for a trade that can make **$4** and lose **$346**.
  - `remainingEdge()` asks the ENTRY question of an OPEN position, in TWO readings because
    they answer two questions: from the current mark ($131 to make against $219 to lose,
    which passes and is the honest answer to that question) and the position's own ceiling
    ($4 against $346, which is the fact all five lines were silent about). Either being
    thin is an attention item. **IT IS NOT AN EXIT RULE**: the exit rules are frozen,
    nothing auto-closes, `AUTOPILOT_VERDICTS` is untouched, `ruleExitOf()` does not know it
    exists, and it is not in the gate — a test holds all of that.
  - `attentionCount()` is the one home for the headline, so no screen may say "nothing to
    do" while a row says "check this".
  - "OF THE MAXIMUM" prints a percent only above `MIN_NET_DOLLARS`: −3188% is a true
    division and a false sentence.
  - ONE CLOSE CONTROL PER POSITION. The broker panel's button survives only for a holding
    the app has no record of, which would otherwise have no way out of this app at all.
  - Report section 2: a working order is **"sent, not filled"**, never "opened at", listed
    apart while still counted in the exposure as `bookPositions()` already decides.

**TASK 3 — each explanation once per screen.**

  - The floor paragraph (162 words) rendered TWICE on the Radar and TWICE on the
    Shortlist; the CONFLICT narrative across Build and its overlay; the currency note on
    every card. `Fold` in `steps.jsx` and `filterFold()` in `rules.js`: a summary WITH ITS
    COUNT always on screen, the full text one tap behind it. **FOLD, NEVER DELETE** — and
    **a refusal is never folded**, which is the older rule and outranks this one.
  - **MEASURED, NOT ASSERTED.** `src/wordcount.mjs` reads the source and counts words AT
    REST — what is behind a fold, a sheet or a tooltip does not count, which is what makes
    "fold, never delete" falsifiable. Radar 1,162 → 378, Shortlist 1,881 → 998, Build 963
    → 908; **4,006 → 2,284, a 43.0% cut**, both sides measured by the same counter over a
    whole-tree checkout of `main`. The table is in PRD §4v.
  - The header loses "IV RANK · 6d collected" — a progress bar for a number that is not
    yet a number — to the History overlay.
  - `isTestRecord()`: three records opened and closed by hand within the minute at zero
    P&L moved the owner up a level and spent his patience budget. MARKED, NEVER DELETED.
  - Report section 6 is THIS PERIOD'S, and an analysis claiming it can route an order is
    FLAGGED, not quoted — rule 5 in the app's own document.
  - **THE TEST FAILS THE BUILD** if any sentence over 20 words renders twice on one
    screen, and it proves it can SEE one. It found a real site on the first run, and
    `order.test.jsx` caught an OVER-TRIM on the same day: "every order goes through the
    risk gate first" is rule 5 beside a send button and nothing else in that component
    said it. Restored.

WHAT P9 HANDS FORWARD (the full list is PRD NOT VERIFIED):
  - **NO ORDER CAN BE SENT FROM THIS SANDBOX. TENTH SESSION IN A ROW.**
  - ~~**NOT ONE OF THESE SCREENS HAS BEEN SEEN ON A PHONE.**~~ **THAT WAS FALSE AND THE OWNER
    SAID SO THE SAME DAY.** He has sent PDF captures since PR #32, and he read the P9 preview
    within the hour: the attention line, the broker's P&L and "too small to be a share" are all
    confirmed live, and he acted on the XLE warning by sending a close. PRD §4v NOT VERIFIED
    carries what the reading settled and what it did not. What is genuinely unread is whether
    the FOLDS fold the right things.
  - **`upgradeHolding()` HAS NEVER RUN AGAINST A REAL `/v2/positions` PAYLOAD.**
  - **THE WORD COUNT IS A HEURISTIC AND SAYS SO**, and it counts conditional branches in
    full, so it is an upper bound applied identically to both sides.
  - **WHETHER J-0003 FILLED IS UNKNOWN** — SOYB 28/30, debit $0.80 GTC.
  - **THE ANTHROPIC USAGE LIMIT DISABLED EVERY AI FEATURE UNTIL 2026-10-01**, so report
    section 5 and both copilots were dead on the reading this session is built from.

## P10 — THE CONTROLS COME FIRST, AND THE LIST SPLITS

### >>> THIS IS THE NEXT SESSION'S TASK. <<<

**ASKED FOR BY THE OWNER, 22 September 2026**, reading the P9 deploy preview. His
words, verbatim:

> *"Il reward/Risk è dinamico? Per me dovrebbe, così come lo deve essere il budget
> dedicato all'operazione, oppure quanto vuoi guadagnare. E deve essere tab semplice
> e visibile."*
>
> *"...con Range di raccomandazioni a seconda del bid/ask dei contratti e convenienza
> dell'operazione. Tutti devono stare in radar, o prima di decide for me, dipende dalla
> journey."*
>
> *"...l'app propone anche altro, magari visivamente sposta in una sezione quelle che
> marchiano le richieste e subito sotto le altre. Del resto se il filtro è dinamico
> devono poter entrare e uscire dalla sezione specifica."*

### 0. WHAT IS ALREADY THERE, AND WHY IT DOES NOT ANSWER HIM

Three quarters of this machinery exists. The next session must read this section
before building anything, or it will build a second copy of what is already here.

  - **THE REWARD/RISK IS ALREADY DYNAMIC ON BUILD.** `AE` is `analyze()` re-run at
    `effectiveLimit()`'s net (PR #28, §4l), so MADE PER $1 RISKED moves with the
    ticket's sliders, along with the maximum, the maximum loss and the breakeven.
    The Shortlist row is at the MID deliberately — a candidate is a structure, not
    yet a price.
  - **BUDGET AND TARGET BOTH EXIST**, in `scaleStrategy()` in `pro.jsx`: `"budget"`
    divides by the cost, `"target"` divides by the maximum profit and answers ✓/✗.
    The toggle is on the Shortlist, labelled *"What I can spend"* / *"What I want to
    make"*.
  - **SO THE FAULT IS NOT THAT IT IS MISSING.** It is that (a) it is a 100px number
    field buried among the direction buttons and the expiry dropdown, (b) it drives
    only the contract count on a Shortlist ROW and dies crossing to Build, where
    `contracts` is separate state that resets on every ticker and expiry change, and
    (c) in target mode it can say ✗ without saying what to change.

### 1. >>> THE REWARD/RISK DOES NOT MOVE WITH THE SIZE. READ THIS FIRST. <<<

`analyze()` multiplies `maxProfit` and `maxLoss` by the SAME leg quantities, so the
RATIO is invariant under size: $4 against $346 at one contract is $40 against $3,460
at ten. **A budget cannot change a reward-to-risk.** What a budget changes is WHICH
structures fit and HOW MANY of them you buy.

Building "R/R as a function of the budget" would therefore produce a number that
looks live and never moves, which is this repository's oldest failure mode wearing a
new coat — §4l's "every figure was computed at a price the app said would not fill",
one screen across.

**WHAT DOES MOVE IT IS THE PRICE, AND THAT IS WHAT HE IS ACTUALLY ASKING FOR.** At
the bid, at the mid and at the ask the same structure has three different
reward-to-risks, because `maxLoss` IS the debit. So the honest form of his request —
and the buildable one — is a **RANGE**:

    R/R at the bid   ·   R/R at the mid   ·   R/R at the price that fills

`comboBook()` already returns all three prices for the whole structure, and
`openLimitPrice()` already decides which one is "the price that fills" (mid plus a
quarter of the spread, never past the touch). **No new arithmetic is needed: this is
`rewardRisk()` called three times on `analyze()` at three nets the app already
computes.** That is the whole of "Range di raccomandazioni a seconda del bid/ask".

**THE ONE HOME IS `rewardRiskRange()` IN `rules.js`**, beside `rewardRisk()`. It
returns nulls under `MIN_NET_DOLLARS` exactly as `rewardRisk()` does — a range with
an unreadable end is not a range — and it returns the three NETS beside the three
ratios, so no screen can print a ratio without the price it belongs to.

### 2. THE CONTROLS MOVE TO WHERE THE JOURNEY ASKS THE QUESTION

His rule: *"Tutti devono stare in radar, o prima di decide for me, dipende dalla
journey."* Both doors, the same three answers, asked BEFORE anything is proposed:

  - **DESK JOURNEY → step 1, Radar.** A simple, visible panel at the top, not a
    field among the sentiment buttons on step 2.
  - **GUIDED JOURNEY → `FindOpportunities`, above "Decide for me".** That screen
    already asks for the basket, the budget and the horizon; this is the same
    question in the same place, and the button already refuses to run until they
    are answered.

**ONE STATE, ABOVE BOTH.** `optMode` / `optAmt` live in `App.jsx` today and the
guided run has its own `wiz.risk`; those are two homes for one answer and the
session must make them one. CLAUDE.md's standing rule applies — the Build screen's
hardcoded 500 beside the wizard's derived 250 is the same fault. The default stays
`limits.perTradeLimit`, derived, never typed.

**AND THE SIZE TRAVELS ALL THREE STEPS** (his "pt. 1"): what the budget or the target
decides is the contract count Shortlist shows, Build loads and the ticket sends. The
gate already measures whatever `contracts` says, so nothing about the risk checks
changes — only where the number comes from. `contracts` currently resets on a ticker
or expiry change, which is correct for a hand-built trade and wrong for a budget the
user set once: the reset must become "re-derive from the budget", never "forget it".

### 3. THE LIST SPLITS, AND MEMBERSHIP IS LIVE

His words: *"sposta in una sezione quelle che marchiano le richieste e subito sotto
le altre... se il filtro è dinamico devono poter entrare e uscire dalla sezione
specifica."*

  - **TWO SECTIONS, ONE LIST.** Above: the candidates that MEET what he asked for —
    inside the budget, or reaching the target, and clearing the reward-to-risk bar.
    Immediately below, under its own heading: everything else the app found.
  - **THE APP STILL PROPOSES THE OTHERS** — *"l'app propone anche altro"* — so the
    second section is never hidden and never folded. This is not a filter that
    removes; it is a filter that GROUPS. That distinction is the whole feature: the
    quality floors REMOVE and say why (and they are untouched here); this one only
    decides which heading a row sits under.
  - **MEMBERSHIP IS RECOMPUTED AS THE CONTROLS MOVE**, so a row crosses between the
    two sections while the budget slider is dragged. `candidateOf()` in `path.js`
    already normalises a road, a Shortlist row and a wide-search hit into one shape;
    the section is a derived property of that shape against the current answers, and
    must NEVER be stored on the candidate — a stored membership is a stale one the
    moment the control moves.
  - **THE SECOND HEADING SAYS WHY**, in the register the rest of the app uses: not
    "other", but what each row missed — over the budget, short of the target, under
    the reward bar. A row in the second section with no reason is the "empty screen
    with no sentence" fault, one list down.

### 3-bis. THE SHAPE, READ OFF THE REFERENCE SCREENS THE OWNER SUPPLIED

He sent two captures of a tool he finds clear and said *"vedi com'è chiaro?"*. What follows is
what those screens DO, written as this app's requirements. **Nothing here is a brand, a name or
a copy of anyone's design** — it is a list of properties, and every one of them is a decision
this app has already half-made and then buried.

**THE DISCOVERY SCREEN — controls first, then a grid of cards.**

  1. **EVERY CONTROL IS ABOVE EVERY RESULT, IN ONE BLOCK.** Direction, target price, budget,
     expiry, and one slider that trades **return against probability**. Five controls, one
     block, nothing between them and the results.
  2. **THE RESULT IS A GRID OF CARDS, AND EVERY CARD IS THE SAME CARD.** Name of the structure;
     the legs in PLAIN WORDS on one line; then exactly FOUR figures, always the same four in
     the same places — **return on risk (%), chance, profit ($), risk ($)** — a small payoff
     picture, and one button.
  3. **NO PROSE ON A CARD.** Not one sentence. Everything a card says, it says with a label and
     a number. The explanation lives elsewhere and is not on the way.
  4. **THE FIGURES ARE THE ANSWER TO THREE QUESTIONS AND NOTHING ELSE**: what do I get, what do
     I risk, how likely is it. Anything that is not one of those three is not on the card.

**THE DETAIL SCREEN — five numbers in one row, then the picture.**

  5. **FIVE FIGURES ACROSS ONE ROW, LABEL ABOVE, VALUE BELOW**: what you pay or receive, the
     maximum loss, the maximum profit, the chance, the break-even. One row, one glance.
  6. **THE STRUCTURE IS STATED IN PLAIN WORDS** above them ("own the shares, sell the 790 call"),
     not as a leg table.
  7. **THE EXPIRY IS A STRIP OF DATES**, grouped by month, one tap — not a dropdown.
  8. **THE STRIKE IS A RULER** with today's price marked on it and the chosen strike as a chip.
  9. **THE PICTURE CARRIES THE BREAK-EVEN AS A LABELLED LINE**, and a slider moves the date from
     today to expiry so the curve bends while you watch.
  10. **THE VIEW TOGGLES ARE A ROW OF BUTTONS** — table or graph, dollars or per cent — not a
      menu and not a setting.

**WHAT THIS APP ALREADY HAS FOR EACH OF THOSE.** This is layout, not arithmetic:

  - the four card figures: `rewardRisk()`, `chanceText()`, and `analyze()`'s maxProfit/maxLoss —
    all three already on every Shortlist row, spread across a wide row instead of a card;
  - the small payoff picture: `BandThumbnail` + `Gauge`, already on every candidate, already cut
    from one `payoffBands()` result;
  - the five detail figures: the Build screen's stats, already computed at the price that will
    be sent (§4l);
  - the break-even line: `payoffBands().breakevens`, already drawn;
  - the expiry strip: `buildableExpiries()` already returns exactly the boards that may be
    offered, with the refused ones named (P9);
  - the direction control: `SENT` / the sentiment buttons, already on the Shortlist.

**SO THE WORK IS: MOVE THE CONTROLS UP, TURN THE ROWS INTO CARDS, AND CUT THE PROSE OFF THE
CARDS.** Plus the two genuinely new things — the return-against-probability slider (§2) and the
reward/risk RANGE across bid, mid and the price that fills (§1).

**AND THE MEASURE IS HIS, NOT THE COUNTER'S.** P9 measured a 43% word cut and the owner's
verdict was *"non me ne frega niente, basta si capisca il tutto, sia intuitivo e siano evidenti
takeaway senza perdere sostanza."* `src/wordcount.mjs` stays — it is what stops a paragraph
coming back — but it is a GUARD, not a goal, and no session may report it as the result. The
result is whether he can read a card without reading a sentence.

### 4. WHAT THIS MUST NOT TOUCH

  - **THE QUALITY FLOORS AND THE GATE ARE UNCHANGED.** `minRewardRisk` (0.25) stays a
    FIXED rule: it is the bar under which the app will not propose at all, and it is
    not a slider. Grouping by "meets what you asked for" happens INSIDE what already
    cleared the floors. A user-movable quality floor would be the app letting
    somebody switch off the reason it can be trusted.
  - **THE R/R RANGE IS DISPLAY, NOT A NEW REFUSAL.** Nothing new is blocked, nothing
    new is filtered, and `rewardRisk()` keeps its single-value job for every existing
    caller.
  - `analyze()`, `comboBook()`, `openLimitPrice()`, `scaleStrategy()` and
    `effectiveLimit()` all stay as they are. This session SPENDS them; it does not
    rewrite them.

### 5. WHAT THE NEXT SESSION SHOULD SETTLE BEFORE BUILDING

  - **WHERE EXACTLY ON RADAR.** P9 cut that screen from 1,162 words to 378 and a new
    always-visible panel spends some of that back. `src/wordcount.mjs` measures it:
    take the reading before and after and put it in the PRD, the way P9 did. A
    control that asks a question earns its words; a paragraph explaining the control
    does not, and folds.
  - **WHETHER "CONVENIENZA DELL'OPERAZIONE" IS THE R/R RANGE OR SOMETHING MORE.** The
    owner's phrase is read here as the bid/ask range above. If he means the EDGE —
    house EV against market EV, minus the round trip — that is P2, and the two
    sections' heading should then read off P2's number rather than a second one.
    **ASK HIM RATHER THAN CHOOSING.**
  - **THE P9 PREVIEW WAS READ ON 22 SEPTEMBER AND IT CONFIRMED THE POSITION WORK**
    (PRD §4v NOT VERIFIED lists what it settled). What it did NOT settle is whether the
    folds fold the right things, which is this section's subject.

### 6. AND ONE THING THE SAME READING FOUND, WHICH IS NOT P10'S

**`closeGroup()` IN `pro.jsx` STILL SENDS A MARKET ORDER, AND THE OWNER HIT IT.** He tapped
"Close the whole trade" on the broker panel for the XLE position and Alpaca refused it:
**HTTP 422, code 42210000, "options market orders are only allowed during market hours"**. The
app reported the refusal correctly and where the button is (`alpacaErrorText()`), so nothing is
hidden — but the order should not have been a market order at all.

§8c has said since PR #22 that **a closing order is a LIMIT, priced at the moment of the tap**,
and `closeLimitPrice()` exists for exactly this; `approve.mjs` uses it. `closeGroup()` is the
one close path that never got it, and its own comment says so — it was left because that path
has no chain to price from, while `approve.mjs` fetches one. The consequence is now measured
rather than reasoned about: **a market close is refused outright outside market hours**, where a
limit would have been accepted and queued, exactly as his own SOYB limit sits "accepted" on the
same screen.

It is small, it is a real refusal the owner met, and it is NOT part of P10 — a session that
takes P10 must not widen into it. Whoever takes it: fetch the chain the way `approve.mjs` does,
price with `closeLimitPrice()`, and `limitAgainstBook()` stops SKIPPING on that path for the
first time.

## P2 — Proposals ranked by edge, not by score

### >>> AFTER P10. <<< It was the next session's task until the owner read P9's
### screens and asked for the controls to come first (P10 below). The two do not
### conflict — P10 changes WHERE the user states what he wants and how the list
### is grouped; P2 changes HOW candidates are ranked inside it — but P10 is the
### one he asked for, and a ranking nobody can steer is the thing he is
### complaining about.

**READ ALPACA'S OWN GREEKS INSTEAD OF COMPUTING THEM.** PR #33 wrote this down as "the obvious
next one" and it is still open: `netGreeks()` runs Black-Scholes at a hand-written per-ticker
sigma while **Alpaca's option snapshots carry `delta`, `gamma`, `theta`, `vega`, `rho` and
`implied_volatility` per contract**. It is the same species as every fault in PR #33 — the app
re-deriving something the broker had already told it — and it is the input the rest of this
section needs.

The spec, in the order it has to be built:

  1. **`chain.js` READS THE GREEKS IT IS ALREADY BEING SENT.** They are in the snapshot payload
     and are parsed away today. Same two rules as the quote sizes and open interest: a missing
     greek is UNKNOWN and never zero, CBOE has none, and `feedName()` says which feed produced
     what is on screen. `markProvenance()` already has the shape to copy — **a greek that came
     from the model must never be presented as one the broker reported.**
  2. **STRIKES BY DELTA, NOT BY A PERCENTAGE OF SPOT.** The same iron condor template is 67% wide
     on SOYB and 20% on BOIL today, because the offsets are a fixed share of the price. Delta is
     the market's own answer to "how far is this", and now that it is read rather than computed it
     is the broker's number.
  3. **EDGE = HOUSE EV − MARKET EV − THE ROUND TRIP ACROSS THE COMBO SPREAD.** The house EV is
     `chanceOf()`'s simulation mean, which already exists and already drifts on the app's own
     seasonal thesis. The market EV is the same structure priced at the chain's implied
     volatility with no drift. The round trip is `comboBook().spread` — the number
     `comboSpreadFloor()` already measures — because an edge smaller than the cost of getting in
     and out is not an edge. **Below transaction cost, nothing is proposed. That will be the
     common case and it is correct.**
  4. **THE STRUCTURE FOLLOWS FROM WHERE THE EDGE IS**, never from a sentiment label: directional
     edge → a vertical in that direction; implied volatility rich against realised → sell premium
     with defined risk; cheap → buy it; no edge → nothing. This removes at the root the state
     where every market is tagged VERY BULL and the only menu contains debit structures. The
     rewritten `SYSTEM_PROMPT` trees (PR #34) already describe exactly this: make the code agree
     with them.
  5. **UNKNOWN SEASONAL MEANS EDGE UNKNOWN, AND IT RANKS LAST.** Five of the ten markets carry no
     `SEASONAL` row at all until Alpha Vantage lands, so the house distribution has no drift and
     there is no house EV to subtract a market EV from. That is not an edge of zero. It is the
     same rule `noCeilingRankNote()` already applies to an unbounded profit: shown, blank, sorted
     last, with a sentence saying why — never silently dropped.
  6. **A BEFORE/AFTER TABLE ON ALL TEN MARKETS**, in the PRD, written the way §4h's
     before-and-after table was: what the current four-factor score ranks first on each market,
     what edge ranks first, and how often the two disagree. A ranking change with no table under
     it is an opinion.

Still open in this section from earlier sessions:
  - the house distribution still owes **realised volatility measured from returns**: `SIGMA` is
    five hand-typed numbers and no market's realised volatility has been measured at all (§4k);
  - `RULES.fallbackIV` (0.25) is roughly twice GLD's real implied volatility, and it bites exactly
    where `modelSanity()`'s denominator lives — **reading Alpaca's own `implied_volatility` per
    contract closes this too**, which is another reason 1 comes first;
  - `minPeersForPercentile` was tuned for chains with ten reporting strikes and XLE's chosen
    expiry carries 82 contracts with a 40th percentile of 7. Settle it from a fresh
    `/api/liquidity` across all ten;
  - drop BOIL or keep it with a declared short horizon — a 2x daily-rebalanced ETF is not
    lognormal over 45 days;
  - on screen, probability and payoff always together, with edge as the third number. Never rank
    on one number alone.

## P7 — The broker tells us about the fill; stop asking it

`recheckOrders()` polls `GET /v2/orders/{id}` on arrival and on a 60-second timer, for every
position whose order had not filled. That is the only way this app learns an order filled, and it
has three faults that are all the same fault: **it only knows while the tab is open.**

Alpaca's streaming API has a `trade_updates` channel that pushes every state change — `new`,
`fill`, `partial_fill`, `canceled`, `expired` — the moment it happens.

  - **`orderStatusRecheck()` STAYS AND IS THE ONE READER.** It already decides what changed, what
    to append to the timeline and what the fill was against the limit. A stream is a different
    TRANSPORT for the same event, not a second implementation of what an event means — and this
    repository has been burned four times by a second implementation.
  - **THE CREDENTIALS MAY NOT REACH THE CLIENT** (non-negotiable rule 3). A websocket opened from
    the browser would carry the key, so the stream has to terminate server-side. That is a real
    design question and it is the substance of this item: a Netlify function is not a long-lived
    process. Decide between a background function that writes fills into the blob store for the
    client to read, and simply keeping the poll and making it honest.
  - **UNKNOWN IS NOT DEAD, AND A STREAM THAT DROPPED IS UNKNOWN.** A disconnected socket must
    never be read as "no fills happened". The poll stays as the reconciliation pass, exactly as
    `orderReconciliation()` treats an unasked broker as different from an empty one.
  - **DONE WHEN**: a fill that happens while the tab is closed is on the Positions screen when it
    is opened, with the right timeline entry, and nothing was invented in the meantime.

## P8 — More indicators, and more than one timeframe — NOT BEFORE THE OWNER HAS USED THESE

Deliberately last, and deliberately gated on a reading rather than on an argument. PR #34 put ten
indicators on a chart that had never been rendered at all. **Nobody has used them.**

Nothing in this section is built until the owner has had the current chart on his phone and said
what he actually looked at. The candidates, in the order they are most likely to be worth it:

  - **WILDER'S RSI, MEASURED AGAINST CUTLER'S** (§4u.2). The app's RSI is the simple mean of the
    last 14 changes and every charting package smooths it. The two are internally consistent
    today — the chart draws what the score reads — so this is one change or none. **Measure the
    gap on all ten markets first**: if it moves the four-factor score's direction on any of them,
    that is a P2 input and not a chart decision.
  - **Weekly bars beside daily.** A 45-day option and a 200-day average are not on the same clock.
    The honest version of this is a second timeframe with its own panes, not a switch that silently
    changes what every number on screen means.
  - **VWAP, Keltner channels, OBV, stochastics.** Each one needs a sentence saying what question it
    answers that the current ten do not, or it is decoration.
  - **Drawing on the chart** — trend lines, a measured move. The owner has never asked for it and
    it is the most expensive thing here.

**THE RULE FOR THIS SECTION**: every indicator added carries its own `takeaway()`, its own
"unknown is not a number" guard and its own line in the copilot's typed context, or it does not go
on the chart. The chip row is already at ten and a phone is 390px wide.


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
  - ~~drop butterflies from the guided path (pTP near 0: incompatible with the
    50% take profit before the 21-DTE exit)~~ **DONE BY PR #33** (PRD §4r.5).
    `isButterfly()` in `rules.js` reads the SHAPE — shorts all on one strike with
    longs on both sides — not the name, because four presets spell it today and a
    fifth is one line away. It is the wizard's exclusion only, beside the
    single-leg one; the full desk still builds them, and the count travels
    separately from the floors' because it is not a judgement about a price.
    **Still open in this bullet**: drop BOIL or keep it with a declared short
    horizon — a 2x daily-rebalanced ETF is not lognormal over 45 days;
  - on screen, probability and payoff always together, with edge as the third
    number. Never rank on one number alone.

## P2-bis — The liquid commodity tier  (PR #32 — SHIPPED, and unmeasured)
~~Add GLD, SLV, USO, XLE, GDX.~~ **DONE.** The basket is ten. PRD §4p.

SHIPPED (783 checks across 22 suites, build clean):
  - Five rows in `UNDERLYINGS` and in `src/basket.js`, and the existing sync
    test covers them. **Not one number is invented for them**: no `SEASONAL`
    row, no `SIGMA` row, no per-market `iv` — seasonality is UNKNOWN until
    Alpha Vantage lands, the realised volatility is `RULES.fallbackSigma` with
    its provenance sentence, the implied one is `RULES.fallbackIV` with
    `ivProvenance()`, and `liquidity.test.js` fails the build if any of the
    three appears. `step` is a dropdown fallback and `buildPresets()` still
    refuses a null board.
  - **Eleven raw `monthlyMean[NOW_MONTH]` readers went through one home**
    (`seasonalOf` / `seasonalNowOf` in App.jsx, wrapping `seasonalProvenance()`).
    Every one of them would have thrown on a market with no row, and the guard
    people reach for instead is `|| 0`.
  - **`autopilot.mjs` was drifting any unrowed market on `SEASONAL.SPY`.** It
    passes null now and gets `missing`.
  - **Weather does not apply to a metal, and that is not a quiet 0/100.**
    `weatherApplies()` is derived from the `REGIONS` table, `factorsOf()` drops
    the factor from the weights, the agreement count and the confidence
    denominator, and renormalises the other three. The four weights are
    unchanged in value. A factor that applies but is UNKNOWN stays in,
    contributing nothing — those are different facts.
  - **Eleven news rules** for gold/silver (real yields, the dollar, reserve
    buying, solar), crude (OPEC, EIA inventories, Hormuz, refineries, shale) and
    miners, each with its one-line why. The macro catch-all moved to the END of
    `TAG_RULES`: `tagImpacts()` gives each ticker to the first rule that claims
    it, so a rule that only knows the subject must not beat one that knows the
    direction.
  - **The Radar does not get longer.** `radarSplit()` / `radarQuietNote()`: a
    market with something keeps its row, everything else is ONE line naming them
    and keeping "nothing cleared" apart from "not searched", every name still a
    tap. It replaces the per-row sentence rather than adding one.
  - `/api/liquidity` covers all ten, and `av.mjs` states what happens at the
    quota: cache, then stale cache with its age and the upstream refusal, then
    UNKNOWN. Never a table.

MEASURED ON THE DEPLOY PREVIEW, 21 Sep 2026 (PRD §4p). The prediction was
written before the chains were fetched; this is what they carry:

| market | contracts near the money | whole chain | clear the 10 minimum |
|---|---|---|---|
| WEAT | 50 | 208 | 72% |
| SOYB | 60 | 202 | 48% |
| BOIL | 120 | 427 | 70% |
| **XLE** | **526** | **1,492** | **74%** |
| **USO** | **900** | **2,788** | **88%** |

  - **Eight to eighteen times the population near the money.** That is the
    whole reason this section exists, measured rather than argued.
  - **On XLE the floors removed NOTHING** — "3 of 3 shown" at STRICT,
    RECOMMENDED, RELAXED and OFF alike. The falsifiable half of the prediction
    holds there. **The denominator in it was wrong**: the Shortlist builds
    THREE presets per direction, not eight.
  - **The 10-contract ABSOLUTE minimum is what binds on a deep chain**: XLE's
    chosen expiry carries 82 contracts and its 40th percentile is 7.
    `minPeersForPercentile` was tuned for chains with ten reporting strikes.
    That is a P2 input.
  - Seasonality loads for the new markets (XLE: Alpha Vantage, 11y, +0.1%/mo),
    `weatherNaReason()` and the renormalised weights sentence render as
    written, and the Radar collapsed to one line.

AND THE SAME FIVE SCREENS CAUGHT THREE FAULTS, ALL FIXED IN THIS PR:
  - **A road said it was drifted on a table that does not exist.**
    `toCandidate()` passed `seasonalStampFields(x.mc)`; that function reads a
    PROVENANCE (`source`/`years`/`ageDays`) and a chance result carries
    `seasonalSource`/`seasonalYears`/`seasonalAgeDays`. Three undefineds, an
    unstamped record, and `seasonalStampOf()` reading the absence as the
    hand-written table — for XLE, which has none. It takes `seasonalFor()` now.
  - **The Radar denied having looked at markets the paragraph above named.**
    "4 of them came through … (BOIL, WEAT, XLE and USO)" over "not searched
    yet: BOIL, USO". `radarSplit()` takes `searched`, `runWizard` records the
    boards it read, and the line says "looked at, nothing on the radar".
  - **The road card printed +24/56 where the Radar and Build both said
    +57/69.** The candidate carries the fusion from run time, before the bars
    had loaded. `WizardCandidates` takes `fusedFor` and reads today's.

WHAT P2-bis HANDS FORWARD:
  - **THE GRAIN HALF OF THE PREDICTION IS UNMEASURED**, and so are GLD, SLV,
    USO and GDX: only XLE has had a Shortlist run. Search them.
  - **Re-run `/api/liquidity` against all ten**, and settle
    `minPeersForPercentile` from reading 3 above.
  - **`RULES.fallbackIV` of 0.25 is roughly twice GLD's real implied
    volatility.** It only bites on an unquoted leg, which is exactly where
    `modelSanity()`'s denominator lives. A measured per-market IV is the same
    Alpha Vantage work as the sigma, and both are P2's.
  - ~~**The app's working-order count and the broker's disagree, 1 against 2.**~~
    **CAUSE FOUND AND HALF CLOSED BY PR #33 (PRD §4r).** TWO causes, not one.
    The first was a sentinel: `importAlpaca()` wrote `alpacaId: "sync"`, so
    `positionStage()` filed a position the broker ALREADY HOLDS as an order still
    waiting — and `recheckOrders()` then asked for `GET /v2/orders/sync`, which
    404s into a silent catch, so it could never resolve. That is fixed:
    `isBrokerHolding()` is the one home and a holding is `owned`. The second is
    real and arithmetic cannot fix it — an order sent before the local store was
    cleared has no record here — and `orderReconciliation()` now SAYS so, names
    the order, and points at the broker's panel as the authority.
  - **A road's RANKING is still a snapshot** even though its evidence panel is
    now live, and nothing on the card says so.

## P3 — The harness
buildContext also carries the computed probability, the gate verdict with its
violations, the real sizing, and the liquidity and spread of each leg. The
copilot emits typed fields, never numbers: what it means, what to watch, what
would disprove it.
~~Rewrite the SYSTEM_PROMPT decision trees, which today recommend long calls
and straddles the guided path excludes.~~ **DONE BY PR #34** (PRD §4u.6). They
are built around the structures the app actually offers — debit verticals,
credit verticals, iron condors — with RECOMMEND NOTHING as a named branch and
the excluded structures listed with their reasons. A test in
`indicators.test.js` fails the build if a long call or a straddle comes back.
Re-verification at apply time on the OPEN path as well (the close path already
has it in approve.mjs).
REGRESSION TEST: the copilot can never again write "paste the chain data" or
estimate a price by hand. **THE CHART COPILOT ALREADY HAS THE STRONGER HALF OF
THIS** (PR #34): it is handed `taContext()` and no bars at all, its prompt
forbids any figure not in that context, and a test holds both. The desk
copilot is still given a context it could in principle compute from — doing to
`buildContext()` what `taContext()` did here is the substance of this item.

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
