# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #38, one action per open position

- `positionAction()` in `src/rules.js` reads the existing rules (`ruleExitOf()`,
  `stopWarningHead()`, `remainingEdge()`) and returns one action: **CLOSE** with its reason,
  **WARNING** (stop crossed, or thin edge; never CLOSE), **HOLD**, or **NO QUOTE** (action
  `null`, never HOLD). The 21-day exit is CLOSE even without a quote. No new rule number.
- Each owned position's card shows that action first, in large type. Everything else it
  showed is one tap away under "legs, profit, exits, details". The small "→ HOLD" line at the
  end of the stat row is gone; the action replaces it.
- Order path 3 moved from `pro.jsx` to `src/closeOrder.js` as `prepareClose()` (tap 1: the
  order written out in full) and `sendClose()` (tap 2). The desk and the Positions card both
  call it. Close-at-limit sits beside CLOSE; for HOLD and WARNING it is inside the fold, so a
  close you choose yourself is still possible. After a send the card shows "close order
  working" and the timeline says "close sent at <limit>". The Journal is not filed at send.
- `sameCloseNote()` is now true: the Positions close is the same order as the desk's.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. One pull request remains.

### What PR #39 inherits from #38

- `positionAction()` is the one home for a position's action. #39 changes what is offered, not
  what an open position shows; it should not touch it.
- `level` and `label` in `posAlerts` still drive the headline and `attentionCount()`; the card
  no longer reads `label`. Folding the two into one is possible later, not required for v1.
- A close that fills is not filed automatically: the owner still taps "Close and file it".
  Filing on fill needs the fill to be read (P7 or a re-check like `recheckOrders()`).

### PR #39 — no proposal when crossing costs too much

- A candidate is not proposed when crossing the combination spread costs more than a set share
  of its maximum profit.
- The share is one named constant in `RULES`, with its reasoning, marked chosen-not-measured.
- It is a quality floor: it changes what is offered, never what may be sent (not in the gate).
  It has its own count and its own sentence on every screen that says what was removed.
- **Done when:** no card on Radar or Shortlist has a maximum profit smaller than the cost of
  getting in and out.

### Owner readings needed for v1

- Send one opening order and compare Alpaca's fill with the ticket's limit (v1 a).
- Close one position with the Positions card's close-at-limit (order path 3) and read the fill,
  sign included (v1 b). Then tap "Close and file it".
- Open Positions and read each position's action in five seconds (v1 c).

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
