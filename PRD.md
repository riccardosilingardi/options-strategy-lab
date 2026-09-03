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

**BUILT, and this is the one home for it.** `sizing()` in `src/rules.js` is the only
thing that turns the two answers into limits, and everything reads it: the risk gate,
the wizard's budget question and its preset chips, the Build screen's risk field, the
Settings panel and every sentence that prints a dollar figure. The Build field used to
default to a hardcoded 500 while the wizard quoted a derived 250; it now starts at
`limits.perTradeLimit` and holds a number of its own only once the user types one, so
the two screens are incapable of disagreeing.

**ASKED, NEVER ASSUMED.** `tradingCapital` and `concurrentTarget` are stored as `null`
until answered, and `sizing()` returns `answered: false` when it had to fall back to
`RULES.suggestedTradingCapital` / `suggestedConcurrentTarget`. While that flag is false:
every figure on screen is labelled a suggestion rather than a limit ("SUGGESTED — NOT
YOUR LIMITS YET", `capitalSourceNote()`), the onboarding fields start EMPTY with the
suggestion offered as a tappable link beside them, no literacy pill is generated (a pill
explains an answer, and there is no answer to explain), and the risk gate still enforces
the suggested figures — a proposal cannot wait for a questionnaire — but attaches a
`CAPITAL_NOT_SET` warning saying where the numbers came from.

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

All of these live in one config object, not scattered as literals.

**NOT BUILT:** the 7-vs-14-vs-21 backtest that would replace this default with a measured
one. The app has a year-by-year historical replay of a *given structure* (`histBacktest`
in `App.jsx`, one row per year with a click-through month-by-month replay), but nothing
that compares the three exit rules against each other, and no `report.md`. 21 DTE remains
a number taken from published research, not from this app's own evidence.

---

## 4b. Quality floors — the app will not propose an indefensible trade

A structure can satisfy every rule in §4 and still be one nobody should take. Two floors,
both named constants in `src/rules.js` with the reasoning beside them, applied by one pure
function `qualityFloor()` at every point candidates are generated — the guided flow's pool,
the Shortlist, and the multi-market scan — so a structure cannot be rejected on one screen
and offered on another.

| Floor | Value | Why that number |
|---|---|---|
| `liquidityPercentile` | **0.40 — PROVISIONAL** | Where a leg must sit among the other strikes **on its own expiry**. A single absolute count was the mistake: 25 contracts is nothing on UNG and a great deal on SOYB, so one figure either empties the thin markets or waves the junk through on the liquid ones, and which it does depends on a market it was never measured against. A strike in the bottom 40% of its own chain's distribution is untraded whatever its raw count says, and that judgement travels between markets in a way a fixed number cannot. |
| `minOpenInterestAbsolute` | **10 contracts — PROVISIONAL** | The floor under the floor. A percentile alone lets a chain certify itself: where nothing trades the 40th percentile is one contract, every leg clears it, and the emptiness has become the standard. Well below the old 25 on purpose — the relative test now does the work on a liquid board, and this one only has to catch "nobody trades anything here". The live case that prompted the whole floor: a SOYB call spread quoted at 1.16 and 0.30 on adjacent strikes whose implied volatility disagreed by ten points, on legs with **2** and **0** open. Those were placeholders, not prices. |
| `minPeersForPercentile` | **12 strikes** | Below this there is no distribution to take a percentile of, so the absolute floor applies alone — and the screen says so. "We could not measure the neighbours" is a different fact from "the neighbours are all busy", and reporting them as one would be the app blaming the data for its own setting. |
| `minRewardRisk` | **0.25** | The least a structure may pay per dollar risked. At a ratio *r* you break even at a hit rate of 1/(1+*r*), so 0.25 means being right 80% of the time just to come out level. The SOYB spread paid $15 for $86 at risk — 0.17, an 85% break-even. It is also the practitioner floor for a credit spread: collect at least a quarter of the width. A two-thirds-chance credit spread collecting a third of its width scores 0.5 and clears it comfortably. |

Two rules hold them:

- **Missing open interest is not low open interest.** Alpaca's snapshots carry no
  open-interest figure at all — `null`, not `0` — and the enrichment call from the trading
  API sometimes does not land. Reading `null` as zero would reject an entire feed and call
  it illiquidity. When any leg's count is unknown the liquidity check is **skipped**, and
  the screen says it was skipped and why. A real `0`, which CBOE does report, still fails.
- **Never an empty screen without an explanation.** When the floors empty a market, the
  screen says so with the counts: "nothing on CORN clears the liquidity floor today" is a
  useful answer and a consistent one — this app is built to be able to say there is nothing
  worth doing. The refusal has its own sentence (`NOTHING_TODAY.belowQualityFloor`), the
  Shortlist lists what it removed and why, and the verdict narrative reports how many
  candidates were built and thrown away before the user saw them.

**BOTH LIQUIDITY NUMBERS ARE PROVISIONAL, AND THE APP SAYS SO ON SCREEN.** They were
chosen from the live examples above and from the structure of these five option markets;
nobody has yet counted the open interest actually present on UNG, CORN, SOYB, BOIL and
WEAT. That cannot be done from a development sandbox — the broker keys live only in
Netlify's environment — so the measurement runs where the keys already are:
`netlify/functions/liquidity.mjs`, opened at **`/api/liquidity`** behind the site's own
password. It fetches the five chains and returns AGGREGATE STATISTICS ONLY: per market and
per expiry, how many strikes, how many report open interest at all, and the distribution of
it (min, quartiles, median, 90th, max), plus what each half of the current floor would ask
of that distribution. No credentials, no account data, no contract-level row. When that
JSON exists, the two constants are set from it and the provisional block in `rules.js` is
deleted.

### The floor is the USER'S setting, and the screen says which one produced what is on it

The app recommends; the user decides. `LIQUIDITY_LEVELS` in `rules.js` is **Strict /
Recommended / Relaxed / Off**, and the recommended level reads `RULES.liquidityPercentile`
and `RULES.minOpenInterestAbsolute` directly — "the app's recommendation" is literally the
constant in the code, not a copy of it that can drift. Strict keeps the old absolute 25,
which is where this floor started. Three things the control has to do, and it is not the
filter if it does not do all three:

- **Say which setting produced the list**, on the same screen as the list and in every
  state of it including the empty one (`liquiditySettingNote()`). A filtered list with no
  visible filter lies by omission about what it left out. The wide search prints the
  setting it **actually ran at**, not the one now in force, and says when they differ.
- **Show the consequence as it moves.** Each level carries the count that level produces on
  the list below it — how many survive, how many went for liquidity, how many for
  reward-to-risk, how many were not liquidity-checked at all.
- **Name what loosening lets back in** (`looseningWarning()`), in those words: quotes on
  contracts nobody trades, a bid and an ask that are a market maker's placeholder, and an
  exit that can cost more than the entry saved. Not "be careful".

It also prints the threshold **in contracts** for the expiry on screen and which half of
the floor bound — the chain's own distribution or the absolute minimum underneath it. A
relative floor that will not show its own arithmetic is worse than the fixed number it
replaced.

**So the app reports what the developer cannot fetch.** At the bottom of the Shortlist,
`OpenInterestReadout` reads every chain the session has loaded and prints, per market, the
median, 90th percentile and maximum open interest, and the share of contracts that clear the
floor — twice: once for the strikes within 10% of spot, where these structures are actually
built, and once for the whole chain, which is dominated by strikes nobody trades. The pure
function behind it is `oiProfile()` in `src/chain.js`. It **reports and never estimates**: a
contract whose count is unknown is counted as unknown, and a feed that carries no open
interest at all is named as such rather than drawn as a row of zeros — the same rule
`qualityFloor()` applies when it skips. Read the near-the-money share: high means the floor is
removing untraded strikes and nothing else; falling towards zero on a market worth trading
means the absolute minimum is too high for it, and it is one line in `src/rules.js`.
`/api/liquidity` is the same question asked of all five markets at once, from where the
keys are.

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

**Screen 3 — The verdict: two roads, never one — NOW ON THE PATH (§12)**
Always at least two candidates with an explicit trade-off. One answer is advice; two answers with their price is teaching. The verdict is no longer a screen of its own: a guided run lands on **step 1, Radar**, carrying what it examined, and the roads are on **step 2, Shortlist**, beside every other candidate on that market. Nothing on it was cut — the narrative moved to the step that asks "which market", the roads to the step that asks "which structure". Three things still belong to it and nowhere else:

- **The copilot narrative, first — now the top of step 1.** What was actually examined, in English, with the real numbers: how many news items and which of them were geopolitical, which weather regions are outside their own monthly norm and by how much, what seasonality says for this month, and how the user's weights tipped the choice. Generated from the data (`verdictNarrative()` in `signals.js`), never templated prose.
- **The answers, read back**, with a *change* link, above the roads on step 2.
- **The evidence, on each road**: the "Why this trade" panel — agreement badge, the four factors as direction/strength bars, and the tap-through to the weather regions and the news headlines behind them — plus the gauge next to the band thumbnail. The four-factor engine exists and is wired; the screen where the decision happens must not be the one screen that shows none of it.

**The two roads may come from different underlyings.** When the basket holds more than one commodity, every readable market in it contributes candidates, they are ranked together on one scale, and road 2 is free to come from a different market than road 1. Two structures on one underlying share a fate, and comparing them teaches less than comparing two markets.

**Copy rule for a road:** lead with what it gives and what it costs, and put the frequency alongside the payout so the trade-off is one sentence. Opening with "3 times in 10" is a verdict before the reader knows what is being judged, and every beginner reads it as "this is a bad trade".

**Screen 4 is gone as a screen — taking a road LANDS ON BUILD.**
"Take this road" used to jump straight to a confirm page carrying a send button, so the
guided flow could reach an order without ever passing the screen where the trade can
actually be looked at. It now loads the road onto Build, names it there ("the road you
took"), and the confirm step — what is being sent, the risk checks in plain language, and
the exit plan already decided — is the **bottom of the Build screen** (`ConfirmSteps` in
`wizard.jsx`). It reads the LIVE Build state, so a strike changed above changes the checks
below: what is confirmed is what is on screen. The risk gate still runs **after** the tap,
and a refusal stays on that screen with its reasons. There is one route to an order from
Build, not two.

**Screen 5 — Nothing today**
A real screen, not an error state. `runWizard` decides in order: data missing → signals not
aligned → options expensive versus their own history → **every candidate filtered out by the
quality floors (§4b)** → nothing fits the budget → only one road survives. A missing-data answer
is never dressed up as a market verdict, and a board emptied by the floors is never reported as
a budget problem: they are different sentences on screen, and `wizard.test.jsx` holds that line.
Offers to notify.

---

## 6. Component map — where each visual lives

Every visual is generated from the same `payoff(legs, S)` function. Never compute zones separately, or two screens will disagree about the same trade.

| Screen | Primary visual | Secondary |
|---|---|---|
| Wizard open | none — text only | — |
| Three questions | none | — |
| Two roads | band thumbnails, one per candidate | — |
| Compare (step 2, max 3) — **BUILT** | overlaid payoff curves on one axis | one shared distribution, every breakeven marked |
| Confirm | unified position component | risk checklist |
| Positions list | band thumbnails | — |
| Position detail | gauge (large) | payoff (small), histogram on demand only |
| Backtest | straight histogram + model curve | seasonal filter, year-by-year bars |

**Band thumbnail** — the underlying's own price line over green/red bands from the sign of the payoff. Survives at 80px. No numbers, no labels. Works for any structure: an iron condor produces three bands with no special-case code.

**The thumbnail and the gauge are what a LIST row gets, and they are all it gets.** Both are
cut from one `payoffBands()` result, so they cannot disagree about the same trade, and they
are on every list where a candidate appears: the Radar market rows, the wide-search hits, the
Shortlist rows, the kept rows and the compare rows. A shrunken chart of the underlying says
nothing about the structure being offered and is unreadable at that size anyway; the candles
belong on Build, where there is room to read them. `PriceChart` — the candle chart — is not
imported by `App.jsx` at all.

Price is the **vertical** axis, exactly as it is in the unified component, so the two never disagree about which way is up: the bands are horizontal stripes and the underlying's recent path runs left to right across them, ending at today's price on the right-hand edge. Without that line the thumbnail is a row of coloured bars — it says where the trade pays, but not where the market is in relation to it, which is the whole question. With no history loaded the line degrades to a flat one at today's price; it is never absent.

**Gauge** — the payoff curve projected into polar coordinates. Colours self-calibrate from the sign of the payoff, so left is not necessarily red. Needle = spot.

**Unified position component** — price history → dispersion cone → terminal distribution → payoff rotated 90°, all sharing ONE vertical price axis, with a horizontal dashed line running from today's spot through to the payoff. Cone and distribution switch on based on available width: one component, two levels of detail.

**Compare** — `ComparePayoffs` in `visuals.jsx`. Up to three candidates, ONE picture: the payoffs
overlaid on a single axis, with one shared distribution underneath and every breakeven marked on it.
Not three charts side by side, and not a table of every number the app knows — the reader has to be
able to say which one they prefer, and why, from the picture.

The shared axis is the **move from today's price**, not the price itself, because two roads can be in
two different markets and $4.55 of CORN has no common axis with $13.20 of UNG — "up 8%" does. The
vertical axis is dollars per contract, shared, so the taller curve really is the bigger win. The
distribution is drawn **only when the candidates share a market and a horizon**: there is no such
thing as one distribution over two markets, so when they differ the breakevens are still marked and
the picture says why the curve is missing rather than averaging two things that are not the same
thing. `terminalDist()` is that curve, lifted out of `UnifiedPosition` so both read one function.

**Backtest** — always straight, never arced. Empirical histogram of historical outcomes with the theoretical model curve overlaid; the divergence between them is the point. Built: the Monte Carlo histogram, the year-by-year row (one clickable button per year, opening a month-by-month replay of that year under the exit rules), and the same-month window — `histBacktest` replays forward from the current month, so the seasonal filter is inherent rather than a toggle. **NOT BUILT:** the "grey out and warn below 30 windows" guard. Alpha Vantage gives roughly 10–20 years for these ETFs, so the sample is *always* under 30 windows; the screen shows YEARS TESTED but does not warn that the number is small.

**Every visual exposes two functions.** `takeaway()` returns one always-visible sentence stating the conclusion, generated from the numbers. `explain(element)` returns the explanation of a single data point, on tap. Neither is ever hand-written text.

> If the takeaway cannot be written in one sentence, the chart is wrong. Change the chart, not the copy.

On mobile there is no hover. Tap to open, tap outside to close, and on narrow screens the explanation appears below the chart.

---

## 7. Signal engine — 4-factor confluence

**BUILT.** Weather and news were once decoration — they rendered tabs and reached no
decision. They now reach every decision: `fuseSignals()` is what ranks the Radar, what
scales the guided flow's candidate scores, and what the "Why this trade" panel renders.
Weather and News are no longer tabs at all; they are the drill-down behind their own bars
in that panel (see §12).

`fuseSignals()` returns a score (−100..+100), a confidence (0..100), four components, an agreement verdict, and a narrative.

- **Weather** — reuse the existing anomaly-versus-climate-norm logic, but aggregate per ticker instead of per region. A ticker hit by three concurring regions weighs more than one hit by a single region.
- **News** — reuse the existing cause→effect tagging. Add age decay (five days old counts half) and separate market news from geopolitical/government news (OPEC, sanctions, Black Sea, USDA, EIA, China), which weighs more because it moves supply structurally.
- **Seasonal and technical** — reuse existing functions.
- **Fusion** — 3+ agreeing → CONFLUENT, high confidence. Opposing directions → CONFLICT, confidence under 40, and the narrative must name which factors contradict each other. Weather and geopolitical news agreeing on the same ticker is a reinforced signal and applies a multiplier.

Narratives must contain numbers. "Signals are positive" is a failure. `verdictNarrative()`
in `signals.js` writes the guided flow's narrative from the real counts, and only writes a
clause when there is a number to put in it — so "we read 0 headlines" says something
different from "we read 14, 3 of them geopolitical" rather than being the same sentence
with a zero in it. It also reports what the quality floors (§4b) removed, and where the
liquidity floor was skipped for want of open-interest data.

News loads at startup for the current ticker, not lazily when a tab opens: `loadNews` runs
from a `useEffect` keyed on the ticker, and the ticker has a value on first render.

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
Warnings: signal agreement is CONFLICT; confidence under 40; stop-loss threshold reached; **the capital questions are unanswered**, so the limits being enforced are the suggested starting point rather than the user's own (§3).

The gate is about whether an order may leave. The **quality floors (§4b) are a different
question** — whether a structure should ever have been offered — and they are applied where
candidates are generated, not here. A trade the user builds by hand on the full desk is his
to make; a trade the app *proposes* has to clear both.

Every violation carries readable numbers: `"Max loss $340 = 6.8% of capital (your limit: 5%, i.e. $250)"`.

**Every path to an order routes through this**: manual ticket, exit ladder, autopilot. Rejected proposals are never dropped silently — they surface with their reason.

---

## 9. Autopilot

A Netlify scheduled function, weekdays at 11:00 UTC.

**MANAGE — BUILT.** For each open position it fetches the chain, marks the position,
computes the Thesis Integrity Score and the exit simulation, and asks the model for a
verdict; mechanical rules then override the model in the three cases where a rule is not
negotiable (take-profit reached, stop warning reached, inside the exit-DTE window). Every
non-HOLD verdict goes through `evaluateTrade` **before** an approval link is created, and
`approve.mjs` runs the gate again at execution time, up to 24 hours later.

It no longer exits immediately when there are no positions: "Notify me" on the
nothing-today screen sets `settings.notifyWhenReady`, that flag reaches the server in the
`/api/state` payload, and with it on the autopilot still produces a brief when nothing is
open — because "still nothing, and here is why" is exactly what was asked for. The brief
states whether the watch is on rather than obeying it silently.

**OPEN — NOT BUILT.** Nothing scans the watchlist for new positions; the brief's NEW
PROPOSALS section says so in as many words rather than sitting empty. When it is built it
must apply the §4b quality floors as well as the gate.

The brief has three sections: OPEN POSITIONS, NEW PROPOSALS, **REJECTED BY GATE** — the
last exists even when it is empty, and carries the gate's exact reasons. Nothing executes
without a human tapping an approval link.

---

## 10. What shipped

The build order was a plan for a future builder. It is now a record.

| What | Status |
|---|---|
| Repo on GitHub, Netlify linked for auto-deploy | **DONE** — a push publishes the site |
| `CLAUDE.md` written from this file | **DONE**, and carrying the standing rule about session debts |
| `src/engine.js` extracted; the duplicated Black-Scholes, payoff, probability and seasonal tables deleted from `autopilot.mjs` | **DONE** — client and functions both import it |
| `src/signals.js` + tests; narratives contain numbers | **DONE** |
| Signals wired into scan ranking and UI; news load at startup; CONFLICT candidates rank last | **DONE** (`compareCandidates` puts CONFLICT last whatever its expected value) |
| `src/riskGate.js` + tests; every order path routed through it | **DONE** — six paths, all gated (see CLAUDE.md) |
| Wizard screens 1–5; capital model and pills | **DONE**; the capital model became one derived source in this session (§3) |
| Demo access for judges (`?demo=<DEMO_TOKEN>`, broker buttons disabled, three didactic positions) | **DONE** (§7b) |
| Alpaca as the primary option-chain source, CBOE as the net | **DONE** (§11) |
| Open interest from the trading API, non-blocking and labelled | **DONE** (§11) |
| Quality floors on every candidate | **DONE** (§4b) |
| Liquidity floor relative to the chain being judged, with an absolute floor underneath | **DONE** (§4b) — and it is the user's setting, with the app's recommendation marked and the consequence of every setting shown live |
| `/api/liquidity`, the measurement that will replace the two provisional numbers | **BUILT, NEVER RUN** — it needs the broker keys, which live only in Netlify |
| Backtest: 7 vs 14 vs 21 DTE on two underlyings, `report.md` | **NOT BUILT** (§4) |
| Video and deck | **NOT VERIFIED HERE** — outside the repo |

---

## 10b. The copilot, and what the Journal is a record of

**The call streams.** `ai.mjs` passes Anthropic's server-sent events straight through and
`askAI` always asks for them. Buffering the whole answer first left the connection silent for
the tens of seconds an analysis takes to write, and a gateway kills a silent connection — the
browser got an HTML page reading *"Too much time has passed without sending any data for
document"* where the analysis should have been. Streaming also means the answer is shown as it
is written rather than after a motionless wait, which is the difference between "thinking" and
"hung". An HTML body is now reported as the timeout it is (`gatewayPageMessage()`), never
dumped as markup.

The copilot answers in **markdown**, and the panel renders it (`Markdown` in `pro.jsx`).
Printing it raw put `## 1. STRUCTURE`, `**Ticker:**` and a wall of `|---|` pipes on screen —
the content was fine, it was being shown as source. The system prompt now writes for someone
learning rather than a professional: prose, at most four plain-English sections, terms defined
on first use, and an explicit ban on restating the legs, the greeks and the max loss that the
Build screen already shows a centimetre away. Tables coming back is a sign the prompt drifted.

**The Journal is the record of what the app did, and the copilot is part of that.** An analysis
run from the panel is filed in `store.copilotLog` — local only, capped, never in the shared
`/api/state` blob — listed in the Journal under the question that produced it, and quoted in
the report. Before, the report cited "the copilot's read" from its own separate model call
while the panel's runs left no trace anywhere, so the two documents described the same day
differently. The panel can also print what is on screen.

---

## 11. Data sources — what each number on screen actually is

| What | Where it comes from | What it is *not* |
|---|---|---|
| Option chain, greeks, implied volatility | **Alpaca snapshots** (`data.alpaca.markets`, via `chainAlpaca.mjs`), with **CBOE delayed quotes as the fallback** | Not OPRA, not the consolidated tape. The Basic plan is an **indicative** feed and delayed. The UI must never call it real-time. |
| Which feed a given chain came from | `feedName(chain)` / `sourceNote(chain)` in `src/chain.js` — the ONLY things that decide what the data is called | Never a literal "CBOE" or "Alpaca" typed into a component. Two places naming one feed is a screen that contradicts itself. |
| Open interest | **Alpaca's trading API**, `GET /v2/options/contracts` (`open_interest`, `open_interest_date`), through the existing `/api/alpaca` proxy, fired *after* the chain is on screen | Not live, and never estimated. It is the **previous session's close**; `openInterestNote()` says so with the broker's own date. When the call does not land the column disappears rather than printing dashes. |
| Price history (underlying daily bars) | **Alpha Vantage**, with Alpaca's IEX bars tried first when keys are present | — |
| Weather forecasts | **Open-Meteo**, 14-day, read against each region's own monthly climate norm | Never a fixed temperature threshold. |
| Execution | **Alpaca paper** only, `paper-api.alpaca.markets`, verified by the `X-OSL-Paper-Endpoint` header the gate checks | If paper cannot be verified, the order is rejected. |
| The open-interest **measurement** (`/api/liquidity`) | Alpaca's trading API for `/v2/options/contracts` and the market-data API for the underlying's last trade, aggregated in `netlify/functions/liquidity.mjs` | Not a chain and not an order path: GET-only, aggregate statistics only, no credentials, no account data, no contract-level row, and no `X-OSL-Paper-Endpoint` header for anything to trust. It exists to settle the liquidity floor's two provisional numbers from a reading rather than an argument. |
| The autopilot's chain | Its own CBOE delayed-quote fetch, independent of the client's `chain.js` | This is the one place that names a feed outside `chain.js`, and it is accurate there because that function really does only call CBOE. |

---

## 12. Desk navigation — ONE NUMBERED PATH, macro to micro

The desk was one page that grew. Evidence panels replaced nothing: they appended. Open the
Shortlist and the page got longer; open History and it got longer again. Scrolling down it you met
"Why this trade", then "Agreement", then "How to read it", then "Three probabilities", then the
totals, then the legend — none of them duplicated in the code, every one of them needed at some
moment, all of them on screen at the same moment. It read as repetitive and unclear, and no part of
it felt like a step, because there was no navigation: only accumulation.

The desk's first place is now **three numbered steps, one on screen at a time** (`src/path.js`):

1. **RADAR** — the wide scan across every market **in the basket** (never SPY: it is in the table so
   the desk can price a hedge, it is not a market the path goes looking for), already filtered by the
   quality floors (§4b). Macro: which markets have something worth looking at today, and which do not
   **and why** — a row that found nothing names the floor that emptied it or says nobody has searched
   it yet. The multi-market search lives here, because "which market" is the question it answers.
2. **SHORTLIST** — the candidates that survived, on the market carried in from step 1: the roads from
   a guided run, the per-market structures priced from the live chain, and the wide search's hits on
   that market. Up to **three** can be compared side by side (§6) and any of them kept for later.
3. **BUILD** — the detail for one chosen structure: chain, greeks, charts, and the confirm step at the
   bottom. Unchanged.

**Moving forward carries the selection; moving back does not lose it.** The selection lives in
`App.jsx`, above all three screens, so a step is only which part of it is being shown. The nav writes
what each step is carrying under its number (`stepCarry`), because "back" has to look free before
anyone will use it.

**The guided door feeds the same path.** "Find opportunities" used to jump from the three questions
straight to two roads — the middle of the path with the macro view skipped. It now lands on step 1
with what was examined in front of it, and the roads are on step 2 beside every other candidate. Same
three steps whether the user came through the guided door or the desk. The "nothing today" refusal is
unchanged and still its own screen.

**Evidence opens OVER the step, never under it** (`EvidenceOverlay` in `src/steps.jsx`): Why this
market (the four readings, and the weather regions and headlines behind them), Market levels, History
and the Copilot, at every step, as a sheet fixed to the viewport that scrolls inside itself. When
evidence is open the step behind it is not also on screen; closing it puts the step back where it was.
This also settles the older fault by construction — a panel written 2,000px down a page that does not
scroll looked, on a phone, like a tap that did nothing, and a sheet fixed to the viewport cannot land
below the fold.

- **Bench was renamed Build.** It was the Builder, then the Bench; the tab id is still `"build"`,
  `BUILD_TAB`, and "Bench" survives nowhere in the code or the copy. **Shortlist keeps its name** — it
  is the list of candidate structures, which is what the word means.
- **Weather and News are not tabs.** They are the drill-down behind the "Why this trade" panel, which
  is now one of the evidence sheets. The toggle that opens the four factor bars **names them**.
- **An evidence panel owns no state.** It is mounted only while its sheet is open, so anything
  long-running lives above it: the copilot's conversation belongs to `App.jsx` and the chip says when
  it is thinking or holding an answer.
- **Anything the app does by itself has to say that it did.** The Journal's report writes itself when
  one is due and you open the tab, copilot section included.
- A trade reaches Build through **one function**, `openOnBuild()` in `App.jsx`, built on
  `buildHandOff()` in `src/handoff.js` — it now also moves the path to step 3, because a hand-off is
  what "forward" means here.
- **One shape for a candidate.** A guided road, a Shortlist row and a wide-search hit are three
  different objects; `candidateOf()` in `path.js` normalises them, so comparing and keeping have one
  implementation instead of three. Kept candidates are `store.saved` items — the array the Build
  screen's Save button already writes to, with the same hydration check and the same sync. There is no
  second store.

---

## NEXT — the plan for the next session

~~One numbered path, macro to micro: Radar → Shortlist → Build, with the guided flow feeding the
same Radar and evidence available at every level.~~ **BUILT — see §12.** Three numbered steps, one
on screen at a time; the selection travels forward and survives going back; evidence opens over the
step instead of lengthening it; up to three candidates compared on one picture (§6) and kept in
`store.saved`.

What is left:

- **SET THE TWO LIQUIDITY NUMBERS FROM THE READING.** This is still the oldest carried-forward
  debt, but it is no longer blocked on anything a session can do: the owner opens
  **`https://<the site>/api/liquidity`** in a browser (the site password, the same one as every
  other page) and pastes the JSON back. Then, per market and per expiry: read
  `nearTheMoney.atFloorPercentile` against `minOpenInterestAbsolute`. Where the percentile sits
  well above the absolute minimum near the money, the relative half is doing the work and the
  shape is right; where it sits below on a market worth trading, the absolute minimum is too high
  for that market. Set `liquidityPercentile` and `minOpenInterestAbsolute` from that, record the
  measured distribution in §4b, and delete the PROVISIONAL block in `src/rules.js`. Add `?sym=UNG`
  to read one market, or `?near=15` to widen the near-the-money band.
- ~~One simplified multi-leg thumbnail used everywhere: no unreadable candles at 80px.~~ **DONE** —
  `simplifyCloses()` reduces the price line to what the width can carry (about one point per 7px),
  keeping the first and last close exactly, so the line is a shape at 80px instead of a scribble.
  A series already short enough is left untouched.
- ~~Gauge plus thumbnail on Radar and Shortlist.~~ **DONE** — the gauge sits beside the thumbnail on
  every candidate row on step 2, and step 1 carries the thumbnail of the best structure found in each
  market. Both are cut from the same `payoffBands()` result, so they cannot disagree.
- ~~The verdict narrative is long on a phone.~~ **DONE** — the first paragraph stays and the rest
  opens on a tap that says how many paragraphs are behind it, so nobody has to guess whether it is
  worth the scroll. A fold is not a deletion: nothing was cut.
- **Nobody has used the liquidity filter who did not build it.** The four settings, their live
  counts and the loosening warning were driven by a script and read in screenshots at 390px. Whether
  a beginner understands "beats the bottom 40% of the strikes on its own expiry" is not something a
  script can answer.

### AFTER THE SUBMISSION

- The guided flow and the desk are two implementations of the same path and do not share state.
  Unify them behind one state object.
- Remove concepts repeated across panels so each idea lives in exactly one place.

---

## OPEN — still undecided

1. **Which two underlyings for the backtest?** Default assumption: UNG and CORN. Moot until the
   7-vs-14-vs-21 backtest is built at all (§4).
2. **Autopilot notifications** — approval links by brief. Push notifications remain out of scope.

---

## NOT VERIFIED — carried forward for the next session

The standing rule in `CLAUDE.md`: every session starts by fixing what the last one flagged, and
ends by writing down what it could not verify. Currently open:

- **THE TWO LIQUIDITY NUMBERS ARE STILL PROVISIONAL.** 0.40 and 10 are chosen to be conservative
  in the one direction that matters — they cut the tail of untouched strikes without emptying a
  quiet market — but they are an argument, not a reading. Re-checked from this session's sandbox
  and the position is unchanged: no `ALPACA_KEY` and no `ANTHROPIC_KEY` in the environment, and
  both `data.alpaca.markets` and `cdn.cboe.com` refused by the egress proxy (`curl` returns
  HTTP 000, connection never established). What is different is that the measurement no longer
  needs a session with access: `/api/liquidity` runs where the keys are and the owner can open it.
  **Until that JSON is pasted back, the floor on screen says it is provisional, and so does this.**
- **`/api/liquidity` HAS NEVER BEEN RUN AGAINST THE BROKER.** Its two upstream request shapes are
  the ones `chain.js` and `chainAlpaca.mjs` already use in production (`/v2/options/contracts` with
  `open_interest` as a string, and `/v2/stocks/trades/latest`), and its aggregation is driven by
  `src/liquidity.test.js` against fixtures — but the handler itself has been executed by nothing.
  The first real call may need its page limit or its 8-second upstream budget adjusted, and a
  market that errors comes back as `{ market, error }` beside the four that worked rather than
  taking the whole report down.
- **The live Anthropic call.** No `ANTHROPIC_KEY` in this sandbox either. The streaming copilot has
  been proven against a simulated stream, not the live endpoint.
- **The live open-interest call.** No `ALPACA_KEY`; the request shape is verified against Alpaca's
  SDK and driven against a stub, not the broker.
- **`src/fixtures/alpaca-chain-UNG.json` is still synthetic.** `node scripts/capture-alpaca-chain.mjs UNG`
  with real keys replaces it.
- **THE WHOLE PATH WAS WALKED AGAINST STUBBED CHAINS AGAIN.** Chromium at 390px, capital
  onboarding → front page → Find opportunities → the three questions → step 1 with the folded
  narrative → step 2 → the liquidity filter moved through all four settings → tick two → compare →
  step 3 → the confirm step → back to step 2 with the filter and the ticks intact: **0px horizontal
  overflow at every stage and 0 page errors.** But the chains, bars, weather and news were served by
  a local stub, so what is verified is the NAVIGATION AND THE FILTER'S ARITHMETIC, not how any of it
  reads against a real market on a quiet day.
- **The stub's open-interest skew is invented.** It is a bell around the money falling to single
  digits in the tail, with two markets deliberately kept quiet, which is what made the four filter
  settings produce different counts on screen. Whether a real chain has that shape is exactly the
  question `/api/liquidity` exists to answer, and it is the reason the counts on those buttons are
  demonstrated but not validated.
- **The compare picture has not been read across two real markets.** The refusal to draw one
  distribution over two markets is exercised in `steps.test.jsx` and was seen on screen, but with
  stubbed volatilities. Whether the ±38% axis cap is wide enough for a live BOIL-versus-SOYB pair is
  untested against real prices.
- **Nobody has walked the path who did not build it**, and nobody has used the liquidity filter who
  did not build it. The steps were driven by a script and read in screenshots. A script cannot tell
  whether a beginner reads "1 Radar / 2 Shortlist / 3 Build" as three steps or as three tabs with
  numbers on them, nor whether "beats the bottom 40% of the strikes on its own expiry" means
  anything to them.
