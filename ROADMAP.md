# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #42, one holding, one record, one size

Read on the owner's phone, 23 Sep 2026: 9 × GDX 94P 2026-10-30, sent from the app as J-0001.

- **A duplicate record.** The Alpaca sync matched records to holdings on a signature that
  spelled each leg's quantity: the app stores +1 put × 9 contracts, the broker lists +9, so the
  holding looked new and was imported again as "J-0002 · Imported from Alpaca". Matching is by
  shape now (`holdingShape()`: ticker, expiry, side, type, strike, ratio), and an imported
  record whose holding the app's own record already describes is removed once
  (`dropImportedTwins()`), with a message saying which ref went.
- **A size counted twice.** `upgradeHolding()` wrote the broker's count (9) into `contracts`
  on a record whose leg already said 9: 81 puts, $40,500 at risk for a $4,500 position, and
  $45,000 counted against the $25,000 exposure ceiling. The count is divided by what one of the
  record's structures holds (`perCombination()`); an inflated record is repaired.
- **An empty browser overwrote the server.** The app opened from a link rather than its icon is
  a different browser store: it started empty, re-imported GDX as a stranger, and its first save
  replaced the server's book (which the autopilot reads). A browser with nothing saved now
  starts from `/api/state` (`hydrateFromServer()`); the Journal is not on the server, so the
  message says to open the installed app to see it. A local store, even an empty one, wins.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **No pull request remains: v1 now needs only the
owner's readings below.**

### What the next session inherits from #40, #41 and #42

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
- Two browsers still write one server copy: whichever saves last wins. PR #42 only stops an
  EMPTY browser from doing it. The Journal is not on `/api/state` at all.
- J-0001's intended limit: the owner saw the fill ($5.00) but not yet the ticket's limit beside
  it. That comparison is v1 (a).

### Owner readings needed for v1

- Send one opening order and compare Alpaca's fill with the ticket's limit (v1 a). A credit
  is the more useful one now: nothing has filled at the corrected suggested limit.
- Close one position with the Positions card's close-at-limit (order path 3) and read the fill,
  sign included (v1 b). Then tap "Close and file it".
- Open Positions and read each position's action in five seconds (v1 c).
- Open Find on the phone with live chains and say whether the list and its stop signs read
  in five seconds, and whether moving a slider lags.
- Open the installed app after PR #42: one GDX card (J-0001), a message naming J-0002 as
  removed, and exposure $4,500. Then open the app from a link: J-0001 should load, not an import.
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
