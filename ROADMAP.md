# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #45, Find filters, sizes the card, and has one control style

**Debt first (Task 0).** A budget typed at $5,150 against a $5,000 per-trade limit sized 27 of 28 cards above the
limit, and the gate refuses every one on Build (PER_TRADE_LIMIT): a card offered a trade it could not send.
`requestOf(want, limits, { sizingFree })` now holds the amount at `floor(perTradeLimit)` and hands every sizing
site `request.riskCap`; `scaleStrategy(a, mode, amt, riskCap)` never returns a count that puts more than the cap at
risk, in "profit I am aiming for" mode too. Free sizing ON is unchanged (no cap; the slider's top is the capital).
Raising the limit is the existing per-trade limit edit with its typed reason. A structure with no ceiling (a long
call) is sized on its risk alone now; it used to read "cannot be sized" in every list. Held by `find.test.jsx`.

**The controls filter (Task 1).** A card that misses the request is hidden: "N match what you asked · show M that
miss", and tapping it shows them with their `missReasonLine()`. With nothing matching it names the control that binds
and the nearest value that lets one in, from the cards' own figures (`nearestRelaxation()`). Under "season decides"
every card says which direction its market's season chose. `meetsHeading()` and `otherwiseHeading()` are retired;
the new words are `matchHeading()`, `missToggle()`, `resultsLine()` in `rules.js`. Generation stays in `findGen`'s
memo, which does not read the request: a slider move sizes and filters the finished list.

**One control style (Task 2).** `RangeField` (label, value you can tap to type, slider, ends, a histogram of the
candidates with the threshold marked, "N pass") for *most I will risk*, *chance at least*, *return on risk at least*
(new; its floor is `minRewardRisk`, so it can only tighten) and *horizon*. The number box and the risk chips are gone.
44px targets, `aria-valuetext` on every slider. New RULES: `rewardAskMax` 3, `rewardAskStep` 0.05, `amountAskStep` 25.

**The card shows your size (Task 3).** YOU RISK, MAX PROFIT, CHANCE, RETURN ON RISK for the size the budget buys, one
line "25 contracts × $193 at risk each", per-contract figures in a fold. `sizedFigures()` and `sizeLine()` are the one
function each; Find reads them at `aFill`, Build at `AE`, and `figures.test.jsx` holds the sized totals equal.

**The picture beside the gauge (Task 4).** The card's picture row is the gauge plus the compact unified picture; a tap
opens the full `UnifiedFigure` in place. The band thumbnail left the card. Cards sit in a grid (columns of about
340px) and the Find column stops at 1,280px.

**Design-system foundation (Task 5).** `src/ui.jsx` (Btn, Panel, Label, Stat, Fold, Chip, RangeField, Note, inputs and
the two font stacks), type tokens in `theme.js` (sizes 12, 13, 15, 18, 24; two weights; two line heights). Find moved
to `src/find.jsx`. `ui.test.jsx` fails the build on a `fontSize` literal or a local atom copy in `ui.jsx`, `card.jsx`
or `find.jsx`. Words at rest: **find 384 → 309, build 264 → 244**.

**Not changed:** `orderBody()`, `closeOrder.js`, `closeLimitPrice()`, `riskGate.js`, `alpacaContract.js`, the six gate
calls, every `RULES` value, the `/api/state` payload. No order path was touched, so J-0001's close (v1 b) may happen
while this is open.

### What the next session inherits from #45

- **PR #46 = the design-system sweep of the remaining screens plus ONE bottom navigation bar (mockup first), and red
  reserved for errors.** Still on their own copies and sizes: `App.jsx` (Btn, Panel, Lbl, Stat, `mono`, `sansUI`),
  `pro.jsx`, `positionCard.jsx`, `wizard.jsx`, `why.jsx`, `visuals.jsx` (its drawings keep their own sizes; the card
  names a 12px axis label through `labelSize`), `steps.jsx` (`StepNav`, `EvidenceBar`, `DeskCountLine`).
  `positionView.js` keeps `FIGURE_LABELS` = RETURN ON RISK, CHANCE, PROFIT, RISK, which no longer equals the Find
  card's four labels (YOU RISK, MAX PROFIT, CHANCE, RETURN ON RISK); move Positions' "at entry vs now" onto
  `CARD_LABELS` in that sweep. Red is still used for sentences that are not errors (a sell side, a stop sign).
- **The default chance of 50% hides most of the list on fixtures (5 of 31).** It is a RULES value and was not touched;
  read the live distribution (`scripts/measure-find.mjs` prints the fixture one) before moving `chanceAskDefault`.
- **The owner asked, with J-0001's closing screen attached, for every order type Alpaca offers and for what a close
  really costs in bid/ask spread.** NOT DONE: it is an order-path change and v1 (b) is being read on that path. The
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

- **FIRST: PR #46, the design-system sweep of the remaining screens, one bottom navigation bar (mockup first) and red
  reserved for errors.** PR #45 built `ui.jsx` and the type tokens and migrated Find, the controls and the card; this
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
