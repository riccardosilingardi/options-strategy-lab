# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #40, one screen, one set of numbers

- **Task 0 — one set of numbers** (PR #39's debt: "ranked and floored at the MID while cards
  print at the price that fills"). `fillNet()` is `openLimitPrice()` on `comboBook()`, on the
  cent, and `legLimitSeed()` lands the ticket's legs on exactly that price. Every card, the
  reward floor (`minRewardRisk`), the ranking, the chance, the payoff picture and Build read it:
  `listCardFigures()` and `buildFigures()` in App.jsx are the two paths and `figures.test.jsx`
  holds them equal on a SOYB 28/30C candidate. Build's reconciliation line compares every
  figure (price, risk, profit, chance, break-even), not entry alone. Every money figure says its
  unit: per contract, or for N.
- **Task 1 — one screen.** The guided door ("Find opportunities", its two roads and its
  "Nothing today" screen) is removed at the owner's request, 23 Sep 2026. Radar and Shortlist
  are one step, **Find**: one request block over one ranked list across the selected markets,
  re-filtered live. What the guided door dropped in silence is a flag on the card. The path is
  Find → Build.

## v1

v1 is done when PRD §3 is true: (a) one opening order filled at the intended price,
(b) one closing order filled via order path 3 (`src/closeOrder.js`), (c) the owner reads each
open position's action in five seconds. **No pull request remains: v1 now needs only the
owner's readings below.**

### What the next session inherits from #39

- Candidates are still ranked and floored at the MID for reward-to-risk (`minRewardRisk`),
  while cards print reward-to-risk at the price that fills. On the fixtures no credit falls
  under 0.25 at the fill after 0a, but the two readings can disagree. P2 full is the fix.
- A record Alpaca does not hold, filed inside the 21-day window, is still recorded as "closed
  by the rules" (`closeDecision()` reads the exit window). Its P&L is null, so no sum is wrong,
  but the discipline count is.
- After a 2xx cancel, the Positions card waits for `recheckOrders()` to read `canceled`; if
  Alpaca never reports it, "Ask Alpaca again" is the only control left on that row.

### Owner readings needed for v1

- Send one opening order and compare Alpaca's fill with the ticket's limit (v1 a). A credit
  is the more useful one now: nothing has filled at the corrected suggested limit.
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
