# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #44, the card says what to do

**Debts first.** (0a) The suite was red on main since 1 Oct: `ceiling.test.jsx` fixed MONTH = 8 while
`chanceCheckOf()` read the clock. The month is an explicit option now (default: this month) and the test
passes its own to both paths. Run under a faked date in March, June and December, one other test
depended on the calendar: `chain.test.js` (five tests, a fixture expiry of 2026-10-16 goes past on 17 Oct);
`fetchChain()` takes a test-only `now`. Nothing else did. (0b) The filing dialog no longer prints the time
exit's sentence over a record Alpaca does not hold. (0c) The copilots are "read when it happens" (PRD §4.10).

**Take profit for a single long option (owner decision, 2 Oct).** +50% of the premium paid; spreads keep 50% of
their maximum. One constant (`singleTakeProfitPctOfPremium`) and one function (`takeProfitTarget()`), read by
`posAlerts`, the action and close sentences, `autopilotVerdict()`, `autopilot.mjs`, `exitSim` (the target is
passed in as a number), the Guardian simulator and its GTC rung, the Build stat, the exit-plan sentences and
the copilot prompt. J-0001 reads CLOSE. J-0002-shaped spreads are unchanged.

**The Positions card.** Action, profit (dollars and share of the risk), three exit lines, the entry beside now
(the Find card's four figures and the four factors), "Close at limit" always in view (primary and red only on
CLOSE), "File in Journal" only when the holding is gone from Alpaca (or never at a broker), a record named
"Imported from Alpaca" shows its structure's name, and a holding with a record is one line in the broker
panel. **Details** is a read-only sheet; "Analyse as a new trade" goes to Build with a line saying a Send would
open a second position, and Build labels a structure you already hold ("You already hold this", a stop sign,
never a gate refusal). Words at rest on Positions: **422 → 304**.

**Find and Build are one card.** Find loads news for every market it shows; a badge reads "reading…" until
news, bars, seasonal (and weather where it applies) have landed or failed, and names a failed input. The fused
result travels as a snapshot beside the figures and is stored on the position at entry (`thesis.signals`);
Build says what moved and why in one line. A trade that arrived from a card shows the same `CandidateCard`,
then size and send, then three folds. Words at rest: **find 374 → 384, build 376 → 264**.

**Back works.** `src/nav.js` makes history out of the screen state; focus moves to the new view's heading;
Build-from-a-card has "← Back to the list", which returns to that card. **The Journal stops nudging**; the
entry-floor log is behind one fold. **Accessibility floor (WCAG 2.1 AA)** in the shared atoms: 44px buttons,
full-colour ghost border, a field-border token, dark `dim` at 4.55:1, `aria-expanded` on folds, and
`theme.test.js` fails the build when any text token drops under 4.5:1 or the field border under 3:1.

**Not changed:** `orderBody()`, `closeOrder.js`, `closeLimitPrice()`, `riskGate.js`, `alpacaContract.js`, the six
gate calls, every `RULES` value but the one new constant, the `/api/state` payload's shape (a position's
`thesis` gains a small `signals` object, which rides inside the positions it always carried).

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
  split the chance out of the memo so only survivors of the current request are simulated.
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

- **FIRST: the design-system sweep (the next pull request).** One set of atoms and one type scale, measured
  on 2 Oct 2026: **23 font sizes** (67% of uses below 12px), **402 mono spreads against 15 sans**, **57
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
