# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request

- The quantity fields (ticket 1–20, leg 1–10) can be emptied and retyped on a phone; an empty
  or invalid field disables Send with a short message instead of becoming 1.
- Documentation diet: the old PRD, CLAUDE.md and ROADMAP moved unchanged to `docs/history/`.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via `closeGroup()`, (c) the owner reads each open position's
action in five seconds. Two pull requests remain.

### PR #38 — one action per open position

- Each open position shows **ONE** action, never several:
  - **HOLD** — nothing to do.
  - **CLOSE** — with the reason (take profit reached, or 21 days to expiry).
  - **WARNING** — the stop level crossed, or the remaining edge is thin. A warning never closes.
- Next to CLOSE, a **close-at-limit** control that sends a limit priced at the tap
  (`closeLimitPrice()`), through the gate and the two-tap confirm. Never a market order.
- The action is derived from the existing rules (`ruleExitOf()`, `stopWarningSentence()`,
  `remainingEdge()`); no new rule number.
- **Done when:** the owner opens Positions and reads each position's action in five seconds.

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
- Close one position through the desk's close button (`closeGroup()`) and read the fill (v1 b).

## After v1

One line each; see `PRD.md` §5 and `docs/history/ROADMAP.md` for detail.

- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
