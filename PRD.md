# Options Strategy Lab — Product Requirements

**Status:** master spec. Everything in this file is decided unless marked OPEN.
**Product language:** English. All UI copy, function names, and generated text are English.

---

## 1. Thesis

> An agent that cannot execute a trade it cannot justify.

Two consequences that govern every decision below:

- The agent must be able to say **"nothing today"**, and that screen gets the same care as every other.
- Risk limits are **code, not prompts**. A model can be argued with; an `if` cannot.

---

## 2. The teaching principle

Every constraint in this app is explained at the moment it bites, in one sentence, with the reason behind it. We call these **literacy pills**. They are not tooltips and not disclaimers — they are the product.

Rules for pills:
- Appear *before* the user makes the choice, never after — a limit shown afterwards feels like punishment.
- One sentence, plain English, no jargon on first read.
- Always state the reasoning, not just the number.
- Any suggested limit can be exceeded **by writing a reason**, which is stored with the position.

Example, at the sizing step:
> "Most systematic traders keep any single trade under 5% of trading capital, so one bad call can't end the run. Yours is set to 8%."

This app is educational software, not financial advice. That line belongs in onboarding and in the footer.

---

## 3. Capital model — REPLACES the old fixed 5% rule

The old spec hardcoded "max 5% per trade, max 25% total". Those numbers were inherited, not chosen, and a number handed down teaches nothing. Replace with a derived model.

**Onboarding asks three things:**

1. `savings` — total savings (optional, skippable)
2. `tradingCapital` — how much is dedicated to trading (required)
3. `concurrentTarget` — how many positions you expect to hold at once (required)

**Derived:**

```
suggestedPerTrade = tradingCapital / concurrentTarget
cappedPerTrade    = min(suggestedPerTrade, 0.05 * tradingCapital)
suggestedTotal    = 0.25 * tradingCapital
```

**Pills triggered by the answers:**

- If `suggestedPerTrade > 5% of tradingCapital`:
  "With N positions at a time, each one would be X% of your capital. Common practice caps a single trade at 5% so one loss can't end the run."
- If `savings` provided and `tradingCapital > 10% of savings`:
  "Trading capital is usually money you could lose without changing your life. Yours is X% of your savings."
- If `concurrentTarget == 1`:
  "One position at a time means all your risk sits on one outcome. That is not wrong, but it is concentrated."

The user can override any suggestion. Overrides require a typed reason and are stored.

---

## 4. Exit rules — evidence status

Rules are **parameters chosen once per position and then frozen**. The copilot picks them at construction time; after confirmation nothing renegotiates them. Flexibility when deciding, rigidity when executing.

| Rule | Status | Basis |
|---|---|---|
| Take profit at 50% of max profit | **KEEP** | tastytrade research: 50% management beats holding to expiration on a risk-adjusted basis |
| Exit at **21 DTE** | **CHANGED from 7** | Original research says 21. Holding from 21 down to 7 adds little premium for sharply higher gamma risk |
| Stop loss at 50% of max loss | **DOWNGRADED to alert** | Weakest evidence. Show a warning, do not auto-close, until backtest says otherwise |
| Defined risk only (spreads) | **KEEP, hard** | Non-negotiable |
| Paper trading only | **KEEP, hard** | Non-negotiable |

DTE = days to expiration.

All of these live in one config object, not scattered as literals. The backtest (§9) tests 7 vs 14 vs 21 on the user's own underlyings and the winner becomes the default.

---

## 5. The wizard IS the app

The wizard is not a feature inside the app. It is the entry point and the spine. Existing tabs remain reachable but are no longer the front door.

**Screen 1 — Open**
Greeting, one line of status, **two** doors: *My positions* / *Find opportunities*.
Once the user has positions, the front page becomes "what needs attention today" and the wizard sits one tap away.

*Three doors was the wrong structure.* "Decide for me" was a door that skipped the questions, and the only way to skip them is to invent the answers. It is now the last button of *Find opportunities*, once the app knows what it is deciding with.

**Screen 2 — Find opportunities**
One screen, three steps, and the last button is the decision.

1. **Basket** — which markets to consider. All five commodity ETFs by default. The ranking later runs across whatever is left in it.
2. **Budget and time** — how much you are willing to lose, and how long to give the idea. No delta, no implied volatility, no Greeks. Sizing pill appears here.
3. **Drivers** — three sliders that always sum to 100: *how often it works*, *how much it pays*, *how little it ties up*. The three presets (*win often* / *balanced* / *win big*) **set** the sliders rather than replacing them, so the user sees what the choice means numerically. That is a literacy pill in itself: the three words are one dial, not three boxes.

Then **Decide for me**, which applies the weights and produces the verdict.

**NOTHING IS PRE-ANSWERED.** The flow cannot proceed past the questions until they are actually answered, and the button names which answer is missing. An earlier build shipped with $250 and 45 days already filled in, and then told the user "the $250 you said you were willing to lose" when they had said nothing at all. An app that invents your answer and quotes it back to you has stopped being trustworthy about anything else it says.

**Screen 3 — The verdict: two roads, never one**
Always at least two candidates with an explicit trade-off. One answer is advice; two answers with their price is teaching. Three things belong on this screen and nowhere else:

- **The copilot narrative, first.** What was actually examined, in English, with the real numbers: how many news items and which of them were geopolitical, which weather regions are outside their own monthly norm and by how much, what seasonality says for this month, and how the user's weights tipped the choice. Generated from the data (`verdictNarrative()` in `signals.js`), never templated prose.
- **The answers, read back**, with a *change* link.
- **The evidence, on each road**: the "Why this trade" panel — agreement badge, the four factors as direction/strength bars, and the tap-through to the weather regions and the news headlines behind them — plus the gauge next to the band thumbnail. The four-factor engine exists and is wired; the screen where the decision happens must not be the one screen that shows none of it.

**The two roads may come from different underlyings.** When the basket holds more than one commodity, every readable market in it contributes candidates, they are ranked together on one scale, and road 2 is free to come from a different market than road 1. Two structures on one underlying share a fate, and comparing them teaches less than comparing two markets.

**Copy rule for a road:** lead with what it gives and what it costs, and put the frequency alongside the payout so the trade-off is one sentence. Opening with "3 times in 10" is a verdict before the reader knows what is being judged, and every beginner reads it as "this is a bad trade".

**Screen 4 — Confirm**
What is being sent, the risk checks in plain language, and the exit plan already decided. The risk gate runs **after** the tap, before the order leaves.

**Screen 5 — Nothing today**
A real screen, not an error state. States why: signals not aligned, or options priced expensively versus their average. Offers to notify.

---

## 6. Component map — where each visual lives

Every visual is generated from the same `payoff(legs, S)` function. Never compute zones separately, or two screens will disagree about the same trade.

| Screen | Primary visual | Secondary |
|---|---|---|
| Wizard open | none — text only | — |
| Three questions | none | — |
| Two roads | band thumbnails, one per candidate | — |
| Compare (optional, max 3) | overlaid payoff curves | shared histogram with each breakeven marked |
| Confirm | unified position component | risk checklist |
| Positions list | band thumbnails | — |
| Position detail | gauge (large) | payoff (small), histogram on demand only |
| Backtest | straight histogram + model curve | seasonal filter, year-by-year bars |

**Band thumbnail** — the underlying's own price line over green/red bands from the sign of the payoff. Survives at 80px. No numbers, no labels. Works for any structure: an iron condor produces three bands with no special-case code.

Price is the **vertical** axis, exactly as it is in the unified component, so the two never disagree about which way is up: the bands are horizontal stripes and the underlying's recent path runs left to right across them, ending at today's price on the right-hand edge. Without that line the thumbnail is a row of coloured bars — it says where the trade pays, but not where the market is in relation to it, which is the whole question. With no history loaded the line degrades to a flat one at today's price; it is never absent.

**Gauge** — the payoff curve projected into polar coordinates. Colours self-calibrate from the sign of the payoff, so left is not necessarily red. Needle = spot.

**Unified position component** — price history → dispersion cone → terminal distribution → payoff rotated 90°, all sharing ONE vertical price axis, with a horizontal dashed line running from today's spot through to the payoff. Cone and distribution switch on based on available width: one component, two levels of detail.

**Backtest** — always straight, never arced. Empirical histogram of historical outcomes with the theoretical model curve overlaid; the divergence between them is the point. Explicit percentages on each zone. Seasonal filter (same-month windows only). Year-by-year bar row so a single good year can't hide behind an average. Grey out and warn when the sample drops below 30 windows.

**Every visual exposes two functions.** `takeaway()` returns one always-visible sentence stating the conclusion, generated from the numbers. `explain(element)` returns the explanation of a single data point, on tap. Neither is ever hand-written text.

> If the takeaway cannot be written in one sentence, the chart is wrong. Change the chart, not the copy.

On mobile there is no hover. Tap to open, tap outside to close, and on narrow screens the explanation appears below the chart.

---

## 7. Signal engine — 4-factor confluence

Currently weather and news are decoration: they render tabs and never reach any decision. Fix that.

`fuseSignals()` returns a score (−100..+100), a confidence (0..100), four components, an agreement verdict, and a narrative.

- **Weather** — reuse the existing anomaly-versus-climate-norm logic, but aggregate per ticker instead of per region. A ticker hit by three concurring regions weighs more than one hit by a single region.
- **News** — reuse the existing cause→effect tagging. Add age decay (five days old counts half) and separate market news from geopolitical/government news (OPEC, sanctions, Black Sea, USDA, EIA, China), which weighs more because it moves supply structurally.
- **Seasonal and technical** — reuse existing functions.
- **Fusion** — 3+ agreeing → CONFLUENT, high confidence. Opposing directions → CONFLICT, confidence under 40, and the narrative must name which factors contradict each other. Weather and geopolitical news agreeing on the same ticker is a reinforced signal and applies a multiplier.

Narratives must contain numbers. "Signals are positive" is a failure.

News must load at startup for the current ticker, not lazily when a tab opens.

---

## 7b. Public demo

`?demo=<DEMO_TOKEN>` bypasses the password gate in `netlify/edge-functions/gate.js`. The token is checked on the edge against the `DEMO_TOKEN` environment variable and never reaches the client bundle; a cookie keeps the session in demo mode across navigation, and it carries no secret — it says "this session came in through the demo door", nothing more.

A demo that cannot be walked through teaches nothing, so **everything stays visible and navigable**. Exactly three things change:

- A banner: *"Public demo — paper trading, read only"*.
- Every button that would reach the **broker** is disabled with the tooltip *"Demo mode: read only"* — all six order paths, checked next to the send and not only on the button.
- State is never POSTed to `/api/state`. That blob is a single shared document: a visitor writing to it would overwrite the owner's positions and feed the autopilot a book that is not theirs. It is not read from either.

Three didactic positions are preloaded — one in profit near its take-profit, one in loss near its stop, and one whose thesis has broken while the price still looks fine. They are **not fixtures with numbers typed into them**: they are real structures priced with the same Black-Scholes as everything else and struck relative to today's live price, so each one actually reads the way it claims to when the app values it. A ticker with no live price is skipped rather than invented.

The third one is the hard case and the point of the exercise: the P&L is fine, nothing is firing on the front page, and the reason for opening it has gone. That break has to be **true on the same tables the Thesis Integrity Score reads**, or the demo is caught lying by its own screen — so the copy states only the breaks that actually happened on the day it is being viewed.

---

## 8. Risk gate

Pure function: `evaluateTrade({ proposal, portfolio, capital, signals })` → `{ pass, violations, warnings }`.

Hard blocks: undefined risk; per-trade limit exceeded; total exposure exceeded; DTE at entry below threshold; account not in paper mode (if unverifiable, reject).
Warnings: signal agreement is CONFLICT; confidence under 40; stop-loss threshold reached.

Every violation carries readable numbers: `"Max loss $340 = 6.8% of capital (your limit: 5%, i.e. $250)"`.

**Every path to an order routes through this**: manual ticket, exit ladder, autopilot. Rejected proposals are never dropped silently — they surface with their reason.

---

## 9. Autopilot

Today it exits immediately when there are no positions. Restructure into two phases.

**MANAGE** — existing logic, plus `fuseSignals` added to the facts sent to the model.
**OPEN** — runs always. Scan watchlist, keep only CONFLUENT and confidence ≥ 70, build defined-risk structures matching the signal direction at ~45 DTE, run every proposal through the gate.

The brief has three sections: OPEN POSITIONS, NEW PROPOSALS, **REJECTED BY GATE** — the last with exact reasons. Nothing executes without a human tapping an approval link.

---

## 10. Build order

| When | What | Done when |
|---|---|---|
| Day 0 | Repo `options-strategy-lab` on GitHub, Netlify linked for auto-deploy | A push publishes the site |
| Day 0 | `CLAUDE.md` written from this file | Rules present in repo |
| Day 1 | Extract `src/engine.js`; delete the duplicated Black-Scholes, payoff, probability and seasonal tables from `autopilot.mjs` | Build passes, three sample positions return identical numbers before and after |
| Day 1 | `src/signals.js` + tests | Six test cases pass; narratives contain numbers |
| Day 2 | Signals wired into scan ranking and UI; news load at startup | CONFLICT candidates rank last |
| Day 2 | `src/riskGate.js` + tests; every order path routed through it | A trade at 10% of capital is refused with the exact figure |
| Day 3 | Wizard screens 1–5; capital model and pills | A new user reaches a confirmable proposal without seeing a Greek |
| Day 3 | Demo access for judges (read-only token, three example positions) | `?demo=<DEMO_TOKEN>` opens the site, every broker button is disabled, three didactic positions are preloaded |
| Day 4 | Backtest: 7 vs 14 vs 21 DTE on two underlyings | `report.md` with assumptions and limitations |
| Day 4 | Video and deck | Recorded |
| Day 5 | Submit, morning | Submitted |

---

## OPEN — decide before Day 1

1. **Computer access before Thursday?** Needed for the local MCP server and video recording. If not available, the MCP demo moves server-side and the plan changes now, not Wednesday.
2. **Which two underlyings for the backtest?** Default assumption: UNG and CORN.
3. **Autopilot notifications** — currently approval links by brief. Push notifications are out of scope before submission.
