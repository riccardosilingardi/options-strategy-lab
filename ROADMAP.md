# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #43, the close says what it sends

Owner's readings, 24 Sep 2026, recorded in PRD §3 and §4.6:

- **PR #42 verified** on the phone, from the icon and from a link: one GDX card J-0001
  (9 × GDX 94P 2026-10-30, filled $5.00, P&L −$225 equal to Alpaca's). The duplicate, the
  9 × 9 size and the empty-browser overwrite are gone.
- **v1 (c) read for HOLD only** on J-0001: readable. CLOSE and WARNING not yet seen live.
- **v1 (a) needs no new UI, but the card's comparison was hollow on an order filled at send.**
  The Positions card printed `fillVsLimit()` with the fill read as `alpacaFillPrice ?? entryNet`;
  only `recheckOrders()` ever wrote `alpacaFillPrice`, so an order filled at send compared the
  limit with the app's own intended entry and could only say "the price you asked for". The
  card now reads `recordFillPrice()`: the order's own fill, else the broker's average entry for
  the holding (`brokerAvgNet`, written by the sync), never the app's figure; and an order that
  fills at send stores its fill. The sync's fill entry also named the whole holding's net as
  "a combination" ($45.00 for nine $5.00 puts); it names $5.00 now. A test holds a J-0001-shaped
  record through `upgradeHolding()` and `dropImportedTwins()`: the limit, its sign stamp and the
  sentence survive.

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
open position's action in five seconds. **No pull request remains: v1 now needs only the
owner's readings below.**

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
- J-0001's intended limit: the owner saw the fill ($5.00) but not yet the ticket's limit beside
  it. After this PR's sync the card compares the limit with Alpaca's $5.00 (`brokerAvgNet`).
  J-0001's timeline may already hold a fill entry reading "$45.00 a combination" from PR #42's
  sync; the timeline is history and is not rewritten.

### Owner readings needed for v1

- Read J-0001's card after this PR: the line under it should compare the ticket's limit with
  Alpaca's $5.00 fill (v1 a). Or send one opening order and compare the two (v1 a). A credit
  is the more useful one now: nothing has filled at the corrected suggested limit.
- Close one position with the Positions card's close-at-limit (order path 3) and read the fill,
  sign included (v1 b). Then tap "Close and file it".
- Open Positions and read each position's action in five seconds (v1 c). HOLD is read
  (J-0001, 24 Sep); CLOSE and WARNING are not — the first CLOSE will be J-0001's time exit.
- Open Find on the phone with live chains and say whether the list and its stop signs read
  in five seconds, and whether moving a slider lags.
- On the live 2026-11-20 board: how many cards now carry "inverted quotes on its strikes",
  and whether the "looks stale" line appears (PR #41).
- Turn free sizing on in Settings (one reason), size a trade past the old limit, and read the
  "at risk now" line above Send (PR #41).

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
