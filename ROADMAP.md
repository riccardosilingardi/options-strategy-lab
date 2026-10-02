# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #46, orders where they live, and evidence with a subject

**Orders (Task 0).** Measured: J-0001's close went out as a sell at a credit of $8.23 and sat "0 of 9 sold" while
Alpaca marked the put at $7.90; Cancel existed in two places and nothing could modify an order. Now:
- **One orders list**, "Orders waiting (N)" at the top of Positions (`src/orders.jsx`), one row per order read from
  Alpaca (`orderRowModel()` in `src/orderRow.js`): what it is, limit, TIF, filled X of Y, sent time, the structure's
  bid / mid / ask from the chain, Alpaca's mark (`current_price`, read), and one line when the limit is past the mark
  on the side that does not fill. Modify, Cancel (confirm, the DELETE, `cancelOutcome()`), Details (Alpaca's status
  history), "Cancel all" with a confirm. The card whose close is working shows the same row inline. The old
  "WORKING AT THE BROKER" panel and the Alpaca panel's "ORDERS WAITING" are gone; the desk shows counts only.
- **Modify.** alpaca-py 0.44.0 `replace_order_by_id()` is `PATCH /orders/{id}` with qty, time_in_force, limit_price;
  Alpaca's docs list replace for options orders and answer a replace on an mleg order with 403 "replace mleg order is
  disabled" (read through search results: docs.alpaca.markets is blocked from the sandbox). So one leg → **order path
  7** (`sendModify()`, gate first, then PATCH; the record follows the new order id); several legs → cancel, wait for
  Alpaca's "canceled" (`waitForCanceled()`), then path 3 (close) or Build's ticket, path 2 (open).
- **Never two working orders.** `sendClose()` now waits for each conflicting order to read canceled before it POSTs;
  a pending cancel or a fill that beats it sends nothing.
- **The close's price.** The card's close confirm (and the desk's) has the same `PriceField`: between the side that
  fills and the mid, starting at `closeLimitPrice()`, with quantity and DAY/GTC. Without a choice the body is
  byte-identical to main (`orders.test.js` pins two bodies produced by main's own code).
- **Proxy allowlist** (`routeAllowed()` in `alpaca.mjs`): GET on the read paths used, POST /v2/orders, PATCH and
  DELETE /v2/orders/{id}, DELETE /v2/orders. `DELETE /v2/positions`, exercise and everything else → 405 with a sentence.
- Excluded on purpose, reasons in PRD §2: market close, liquidate all, exercise.

**Find's header (Task 1).** No ticker select; Refresh reloads every selected market quietly; the bar reads "N markets
· prices Xm ago" (the oldest, `findFreshness()`). Theme is in Settings behind one gear. Build's market selector sits
beside the trade.

**Evidence has a subject (Task 2).** No EvidenceBar on Find. A card's badge opens Why for its market, its fold opens
"More on <TK>: levels · history" (that market's open interest, price chart and season), and closing scrolls back to the
card. Build's bar: "About this trade · <TK> <structure>"; the Copilot lives only there.

**The Why sheet (Task 3).** "<TK> this month / the market, not this trade"; one verdict line; an ⓘ (tap, never a
title) writing out the score (this market's renormalised weights × direction × strength, ×REINFORCE, ×CONFLICT_DAMPING)
and the confidence (the case, its formula, its band) from the constants themselves — `scoreWorking()`,
`confidenceWorking()`; the confidence literals moved into `CONFIDENCE_BANDS`, values unchanged. One sentence on what it
changes in Find (`whyFindEffect()` in rules.js, each clause checked against `suggestionOf()`, `rankScore()` /
`signalAdjustment()`, `compareCandidates()` and `seasonalDrift()`). The narrative is behind "The full reasoning".
Tested: the worked result equals `fused.score` and `fused.confidence` on 50 fixture readings (ten markets, metals without
weather included); CORN's 2 Oct reading reproduces +64 / 86.

**Words at rest:** find 309, build 244 (unchanged), positions 304 → 209 (the counter now reads `orders.jsx`; the row's
own words come from `orderRow.js`, which it does not score, so 209 is a floor).

**Not changed:** `orderBody()`, `riskGate.js`, `alpacaContract.js`, every `RULES` value, the `/api/state` payload, Find's
controls and card, the signal constants' values.

### What the next session inherits from #46

- **v1 (b) is still J-0001's close, and now also the first live Modify.** Read from the production address: the orders
  row (limit beside the mark), Modify → price → send → fill → "File in Journal". A `PATCH` on an options order and GTC
  on one have never been observed.
- After a replace the record follows the new order id (`onReplaced`); a record whose order was replaced from Alpaca's
  own screen still points at the old id, which reads "replaced" and stays "working" in `orderLifecycle()`.
- Modify of a multi-leg OPENING order lands on Build at today's market; the chosen price is written in the message,
  not pre-filled into the ticket.
- "More on <TK>" draws open interest, the price chart and the season for the card's market; the year-by-year replay and
  the simulation stay Build's (they are about the trade).

### What the next session inherits from #45

- **PR #47 (was #46) = the design-system sweep of the remaining screens plus ONE bottom navigation bar (mockup first), and red
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

- **FIRST: PR #47 = one market registry** — one row per market (category, factors, newsQ, seasonal row) replacing
  `UNDERLYINGS`' scattered fields, `basket.js` and `weatherApplies()`; Find's markets grouped by category (Grains,
  Energy, Metals) with all/none per category and category result filters; **one bottom navigation bar** (mockup
  first); **the design-system sweep of the remaining screens**; **red only for errors**. Not started.
- **PR #48 = basket expansion** — a measured admission rule (`liquidity.mjs` run on candidate chains) and Find's cost
  on a phone (PRD §4.5). Not started.
- **The sweep, in detail (part of PR #47):** PR #45 built `ui.jsx` and the type tokens and migrated Find, the controls and the card; this
  moves the rest. One set of atoms and one type scale, measured on 2 Oct 2026, before #45: **23 font sizes** (67% of uses below 12px), **402 mono spreads against 15 sans**, **57
  padding values**, **13 radii**, **Btn ×2, Panel ×2, Lbl ×3, Stat ×3 copies**, and the mono stack defined in
  **8 files**. PR #44 raised the floor only on the atoms it had to touch (Btn, Fold, the field border, the
  dark `dim`) and on the screens it rebuilt (the Positions card, Details, the top of Build, the back link); it
  did not dedupe atoms across files, introduce a type scale or restyle any other screen. This sweep does.
- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref, so a
  second browser keeps the Journal. Deferred on purpose (24 Sep 2026): changing the sync of
  the only live record before its first live close is the wrong week.
- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
