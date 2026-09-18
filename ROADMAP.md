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

WHAT P1 INHERITS FROM THIS WORK:
  - **The 4x ratio is CHOSEN, not measured.** The live-chain distribution of
    market-net over model-net was not readable from the sandbox (no broker
    keys, egress proxy refuses the CONNECT). What was measured is the model's
    own error budget, and the table is in the comment beside the constant.
    Expect a real reading to bring 4 down. Same for `openLimitSlippage`.
  - **`store.expiryLog` is empty.** `passedOverRecord()` writes one row per
    market per board as the app is used; P5 calibrates the 30-day floor from
    it. Nothing can be read until the owner has used the app.
  - **The ticket now shows the model value beside the market value**, which is
    a second consumer of `analyze()`'s per-leg marks. P1's "one number, one
    source" sweep should check that panel against the Shortlist's figures.
  - `ComboBookPanel` in pro.jsx computes `modelSanity()` on every render of the
    ticket. That is cheap and it is a second call site for the same arithmetic;
    if P1 centralises it, this is one of the places to look.
  - `App.jsx`'s `REASON_MIN` was a bare 15 beside `RULES.minOverrideReasonChars`
    and now reads the constant. There may be more copies like it.

## P1 — Coherence: one number, one source
One `probProfit` (engine.js; delete the copy in pro.jsx), one EV formula
(delete `pop * maxProfit * n` and the PROFIT x CHANCE stat), the risk gate
called with the real contract quantity instead of the hardcoded
`contracts: 1` at App.jsx 1504, 1865, 2345 and in `riskOk` at 1658.
DONE WHEN: a test proves Radar, Shortlist, Bench, Guardian and the autopilot
print the same number for the same position, and a proposal that passes the
gate on screen passes it again in the ticket at the quantity shown.

## P2 — Proposals ranked by edge, not by score
At market prices every structure has expected value near zero: high
probability and large payoff are two ends of one lever. So the app must
compute a distribution of its own and propose only where that distribution
disagrees with the market's.
  - a house distribution per underlying: seasonality + the four factors +
    REALISED volatility (today probProfit uses a risk-neutral drift, so the
    app's whole thesis never enters its own probability);
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
