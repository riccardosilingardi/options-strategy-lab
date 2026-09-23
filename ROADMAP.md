# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #41, size, stop signs, one header, free sizing

- **Task 1 — a card's size matches its risk.** The owner's SLV Bearish Put Butterfly
  (+1 58P / −2 55P / +1 51P, 2026-11-20) printed RISK $143 and "6 contracts for $258": the
  budget was divided by the $43 premium, and on a butterfly with wings 3 and 4 wide the worst
  case is $43 + $100. `scaleStrategy()` now divides by the maximum loss (the larger of loss
  and premium on a debit) and `sizeLine()` prints contracts × risk: $300 buys 2 for $286.
  `figures.test.jsx` holds the butterfly and a sweep of 14 structure families on the fixtures.
- **Task 2 — a stop sign on almost every card is not a stop sign.** "Feed unreliable on this
  expiry" fired on every card of an expiry with one inverted pair anywhere. A card now says
  "inverted quotes on its strikes" only when a broken pair touches its own strikes
  (`invertedOnStrikes()`); a board whose share of broken pairs reaches `staleBoardShare`
  (0.15, chosen) is said once above the list — "2026-11-20 looks stale on N markets".
  `node scripts/measure-inverted.mjs` prints inverted/pairs per fixture board: labelled cards
  19 → 11 overall, 9 → 1 on the SOYB-shaped board (synthetic; the UNG fixture is clean).
- **Task 3 — Find has no single-ticker header strip** (price, expiry, seasonality, seasonal
  source, IV rank). Build keeps it.
- **Task 4 — one "Free sizing" flag replaces derived limits** (owner decision, 23 Sep 2026).
  Settings toggle, OFF by default, ON with one typed reason and its time. While ON the 5% and
  25% limits are not enforced — no card is over budget, the gate neither refuses nor warns on
  size — and "at risk now: $X across N positions" sits above Send. Paper only, defined risk,
  `minEntryDTE` and every floor stay enforced; RULES values unchanged. Every position records
  `sizingFree`; the weekly report splits P&L by it.
- Words at rest: **Find 374** (PR #40: 375), **Build 376** (PR #40: 376). Two Find sentences
  were shortened to make room for the stale-board line.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **No pull request remains: v1 now needs only the
owner's readings below.**

### What the next session inherits from #40 and #41

- The PR #39 debt is closed: ranking and every floor, `minRewardRisk` included, read the fill.
- A record Alpaca does not hold, filed inside the 21-day window, is still recorded as "closed
  by the rules" (`closeDecision()` reads the exit window). Its P&L is null, but the discipline
  count is wrong. (From #39, not touched here.)
- After a 2xx cancel, the Positions card waits for `recheckOrders()` to read `canceled`; if
  Alpaca never reports it, "Ask Alpaca again" is the only control left. (From #39.)
- Find recomputes the whole list when a chain refreshes; if the owner's phone lags (PRD §4.5),
  split the chance out of the memo so only survivors of the current request are simulated.
- `staleBoardShare` 0.15 sits between two readings (BOIL 20%, SOYB 7%). Count inverted pairs
  on a week of live boards (`monotonicityBreaks()` on each Find board) before moving it.
- The Journal's `riskOk` ("respected the per-trade cap") is still computed against the derived
  limit when free sizing is on; the weekly report's P&L split is the reading for free sizing.
- A position opened before PR #41 has no `sizingFree` field and is filed as `false`.

### Owner readings needed for v1

- Send one opening order and compare Alpaca's fill with the ticket's limit (v1 a). A credit
  is the more useful one now: nothing has filled at the corrected suggested limit.
- Close one position with the Positions card's close-at-limit (order path 3) and read the fill,
  sign included (v1 b). Then tap "Close and file it".
- Open Positions and read each position's action in five seconds (v1 c).
- Open Find on the phone with live chains and say whether the list and its stop signs read
  in five seconds, and whether moving a slider lags.
- On the live 2026-11-20 board: how many cards now carry "inverted quotes on its strikes",
  and whether the "looks stale" line appears (PR #41).
- Turn free sizing on in Settings (one reason), size a trade past the old limit, and read the
  "at risk now" line above Send (PR #41).

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
