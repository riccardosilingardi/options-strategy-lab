# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #43, the close says what it sends

Owner's readings, 24 Sep 2026, recorded in PRD §3 and §4 and **closed**:

- **PR #42 verified** on the phone, from the icon and from a link: one GDX card J-0001
  (9 × GDX 94P 2026-10-30, filled $5.00, P&L −$225 equal to Alpaca's).
- **v1 (a) verified.** J-0001's card: "You offered a debit of $5.02 a combination and the
  broker filled it at a debit of $5.00. That is $18.00 BETTER than you asked for, across 9
  combinations." It filled on a recheck (pending_new → filled), so its fill was stored.
- **v1 (c) read for HOLD** on J-0001: readable.
- **A gap the J-0001 test exposed, for future orders only.** An order that fills AT SEND never
  stored `alpacaFillPrice` (only `recheckOrders()` wrote it), so its card would compare the
  limit with the app's own entry. The card now reads `recordFillPrice()` (the order's fill,
  else the broker's average entry `brokerAvgNet`, never the app's figure), and a fill at send
  is stored. The sync's fill entry also named the whole holding's net as "a combination"
  ($45 for nine $5 puts); fixed. J-0001 was not affected by either: its timeline has no such
  entry. A test holds a J-0001-shaped record through `upgradeHolding()` and
  `dropImportedTwins()`: the limit, its sign stamp and the sentence survive.

**Order path 3 wrote out a different order from the one it sent (rule 5, v1 b).** Measured on
main on the owner's only holding (9 × GDX 94P, bid 4.60 / ask 4.90): the body was right (sell 9
at 4.68) and the confirm step said "1 ×", "1 combination, a limit of $42.08 for one combination"
and "a debit of $4.68 (you pay it)". Three faults, fixed:

- **Direction.** `limitWords()` reads a signed price; a simple order's price is unsigned and its
  side says the direction. `orderMoney()` / `orderLimitWords()` in `order.js` describe a limit
  from the order itself (class, side, qty, price): a simple sell is a credit you receive, a
  simple buy a debit you pay, an mleg keeps its signed rule. One home.
- **Quantity and price.** `prepareClose()` now gives the preview the same shape and factor
  `orderBody()` divided out: the lines say 9 × and 9 combinations, the price per combination is
  `body.limit_price`, and one line gives the total ("you receive about $4,212").
- **The same words** on order path 6 (`approve.mjs`: "9 at a credit of $4.68 (you receive it)
  per combination, you receive about $4,212 in all" — the autopilot link will offer this close
  on 9 Oct), in `orderOutcome()` (a sell is "sold"; a filled close says "Closed at the broker",
  not "Position opened"), in the Journal's `close-sent` entry, in the desk's open-orders list
  and in `placeExit()`'s message (order path 4 had the same fault).
- **Not changed:** `orderBody()` output (a test holds the three bodies byte-identical to
  main's), `closeLimitPrice()`, the gate calls on all six paths, `riskGate.js`,
  `alpacaContract.js`, every `RULES` value. `src/closeWords.test.js` is new.

**Two Journal debts, `journal.js` and the Journal screen only.**

- A record Alpaca did not hold, filed inside the 21-day window, was stored "closed by the
  rules". `journalEntry()` no longer marks it a rule close, and `countsAsRuleClose()` reads
  entries already filed the same way; its badge says "not a rule close — Alpaca did not hold it".
- `riskOk` under free sizing was judged against a limit that was not applied. It is stored
  null and reads "no limit applied" (`riskOkOf()`, `riskOkWords()`); the "inside the limit"
  share counts only trades that had a limit.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **(a) is verified and (c) is read for HOLD. v1 now
waits on one reading: J-0001's close (b), which also shows CLOSE (c).**

### What the next session inherits from #40 to #43

- The PR #39 debt is closed: ranking and every floor, `minRewardRisk` included, read the fill.
- A record Alpaca does not hold is no longer counted as a rule close (#43), but the close
  dialog still prints the time exit's sentence over it before it is filed.
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
  time exit, 9 Oct 2026 (21 DTE). Report the confirm step, Alpaca's order and the fill, sign
  included; then tap "Close and file it". That is v1 (b), and CLOSE for v1 (c).
- **Nothing else is asked of the owner until then.** Every other item in PRD §4 is read when
  it happens in normal use, never requested.

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref, so a
  second browser keeps the Journal. Deferred on purpose (24 Sep 2026): changing the sync of
  the only live record before its first live close is the wrong week.
- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
