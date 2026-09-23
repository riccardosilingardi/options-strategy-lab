# ROADMAP — Options Strategy Lab

What comes next, and nothing else. What the product is and what is verified is in `PRD.md`.
The full history of every item shipped so far (P0–P10, P2-bis) is in `docs/history/ROADMAP.md`.

Every pull request updates this file: the session that ships an item marks it done and states
what the next one inherits.

## Done in this pull request — PR #39, no proposal when crossing costs too much

Three debts from the owner's live test of PR #38 (23 Sep 2026) first, then the last v1 change.

- **0a — the opening limit conceded the wrong way on credits.** `openLimitPrice()` read
  `mid + dir × allowance`, which on a credit asks for MORE than the mid, on the side that never
  fills (XLE 60/57: $75.75 suggested, $71 on the ticket's own sliders). It is `mid + allowance`
  now, still never flipping the sign. `crossingCost()` and `openingMarkNote()` measured the gap
  by magnitudes and now use the signed nets. Every credit card's max profit, max loss,
  reward-to-risk, chance and budget count moves; no debit moves (`scripts/measure-crossing.mjs`).
  `closeLimitPrice()` is unchanged and a test holds it.
- **0b — a cancel is a request.** `cancelOutcome()` in `src/order.js` is the one home for the
  sentences on both cancel buttons: a 2xx is "Cancel requested", a 422 "pending cancel" is a
  cancel already waiting (completes at the 9:30 New York open), and an order is cancelled only
  when Alpaca reports `canceled`. While a cancel is waiting there is no Cancel and no Re-price,
  and the order still counts in exposure.
- **0c — a position Alpaca does not hold is not valued.** `legsNotHeld()` in `src/closeOrder.js`
  names the legs a SUCCESSFUL sync did not find (null when unknown). `positionAction()` has one
  new input, `notHeld`: action null, "Not on Alpaca", P&L null. Filing such a record stores
  P&L null, "not read from a fill". The Journal prints a figure closed with no broker order as
  "the app's mark at close — not a fill" and `journalPnlTotal()` excludes it. J-0002 is
  corrected on screen; stored data is not edited.
- **PR #39 — the crossing floor.** `RULES.maxCrossingShareOfMaxProfit` 0.5 (chosen, not
  measured): a candidate is not proposed when `comboBook().spread × 100 × contracts` is more
  than half its maximum profit at the price that fills. A quality floor in `qualityFloor()`,
  not in the gate. It has its own count and sentence in every "not shown" summary.
  `scripts/measure-crossing.mjs` prints the table; `src/crossing.test.jsx` holds the done-when.

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

- **Radar request controls** — one control per question: the single-ticker expiry and the
  multi-search horizon are two answers to one question on one screen; direction and 'season
  decides' likewise.
- **P2 full** — rank proposals by edge at the price that fills.
- **P7** — fills pushed by Alpaca's stream, server-side.
- **P8** — more indicators and timeframes, after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with date slider, view toggles.
- **Play Store** — the PWA as an Android app.
- **Broker change** — futures and futures options need another broker.
