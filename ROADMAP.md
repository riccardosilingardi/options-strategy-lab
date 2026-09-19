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
    price of leaving it hand-written;
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

## P4 — UX
The trade card, five fixed lines: what you are betting on, what you risk in
euros, how often it works under your own exit rule, when it exits, what would
invalidate it. Everything else one tap away. The "THREE PROBABILITIES — which
one to read, and when" panel is deleted: three paragraphs of prose explaining
which probability to read is prose compensating for an ambiguity that P2
resolves in code.

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
