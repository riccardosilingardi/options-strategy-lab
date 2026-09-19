# Options Strategy Lab — Product Requirements

**Status:** master spec. Everything in this file is decided unless marked OPEN.
**Read alongside `ROADMAP.md`**, which every session reads with this file and every
pull request updates: the session that ships P-n marks it done there and restates what
the next one inherits. ROADMAP.md is the single source for WHAT COMES NEXT; this file
is the single source for WHAT THE PRODUCT IS AND WHAT IS VERIFIED. Do not duplicate
content between them.
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
| Stop loss at 50% of max loss | **DOWNGRADED to alert**, and the code now agrees | Weakest evidence. Show a warning, do not auto-close, until backtest says otherwise. **The autopilot used to set verdict `STOP` on it and issue a one-tap approve link**; it now produces verdict HOLD and a named warning, and the model is no longer offered STOP as a verdict at all (§9b) |
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

## 4a. Unpriceable is not free — the test that comes before the floors

A structure has to have a price before any rule can be applied to it. `priceability()`
in `src/rules.js` is that test, run at all three generation sites and inside the risk
gate, against one named constant with the reasoning beside it.

| Rule | Value | Why |
|---|---|---|
| `minNetPremium` | **0.05 a share — $5 a contract** (`MIN_NET_DOLLARS`) | Below this a net is not a number, it is the rounding of two placeholders against each other. These chains quote in whole cents, the round trip on four legs costs more than that on its own, and every arithmetic that divides by the cost — sizing, reward-to-risk — is meaningless underneath it. It sits far below any real structure this app builds, because it is not a quality judgement: it is the line under which there is nothing to judge. |
| every LONG leg needs `bid > 0` | hard | You are buying it, so you must be able to sell it back. A bid of zero means the mid on screen is half of an ask nobody agreed to. Short legs are not tested — the net catches an imaginary credit — and a leg the feed said nothing about is UNKNOWN, never zero, the same rule the liquidity floor already applies to open interest. |
| the net test is on the ABSOLUTE value | hard | A credit structure has a negative net and is perfectly priceable. It is a net of about nothing, in either direction, that says the two halves cancelled. |

**THE LIVE CASE.** BOIL, 2026-10-09, spot $21.23, 54 strikes, liquidity floor OFF. A
Bullish Call Butterfly (+1 21C / -2 22.5C / +1 24C) priced at a **net debit of $0** and
was offered as: YOU PAY $0, MAX LOSS -$0, **R/R 6748644041614687.00**, HOW MANY **×250**,
MOST YOU CAN MAKE $37,462, BUDGET USED 100%. A butterfly with 1.5-point wings on a $21
underlying does not cost nothing: at least one leg's mid was a market maker's placeholder
on a strike nobody trades, which is exactly what the liquidity floor exists to remove and
it was switched off. **A butterfly's maximum loss IS its debit, so a debit of zero means
the price is UNKNOWN, not that the loss is zero** — and non-negotiable rule 2 is that the
maximum loss is always known.

What follows from that:

- **An unpriceable candidate is excluded at every liquidity setting**, with a sentence
  naming why in the same register as the refusal screen (`unpriceableNote()`,
  `NOTHING_TODAY.unpriceable()`). It is never rendered with $0 in it. Its count travels
  separately from the floors': a structure whose price could not be read never reached
  them, and reporting it as one they removed would credit them with work they did not do.
- **The risk gate rejects an unknown maximum loss** (`UNPRICEABLE`). A finite number is
  not a known one — -1e-14 passed every check below it. Entry only: a closing order is
  never blocked by it. The quality floors stay out of the gate for the reason given in
  §8; this test is in both places, because it is a different question from either.
- **Nothing divides by a cost under the minimum.** `rewardRisk()` is the only place the
  ratio is formed and returns null below it, so R/R prints "—"; `scaleStrategy()` returns
  an `unpriceable` flag instead of a quantity, and the `Math.max(prem, 1)` that turned a
  $250 budget into 250 contracts is gone.
- **Nothing ever renders as `-$0`.** `money()` and both `fmt$` copies round first and
  decide the sign afterwards.
- The desk still builds what the user asks it to, and says above the figures that this
  one's price could not be read.

---

## 4c. An unknown is not a number — the ceiling, the arbitrage and the breakeven

Four faults with one shape: the app printing something it does not know as something it
does. §4a settled it for the PRICE. This settles it for the BEST CASE, for a WORST
CASE that came out impossible, for a breakeven read off a grid instead of arithmetic,
and for a weekly report that filled an empty section by inventing a position.

### The maximum profit of an unbounded payoff does not exist

`analyze()` reported the largest payoff SAMPLED on a fixed grid from 70% to 130% of spot.
For a long call the payoff never stops rising, so that "maximum" was the payoff at +30%:
an artefact of where somebody stopped sampling. The Shortlist printed MOST YOU CAN MAKE
$459 under the tooltip *"It cannot make more than this"*, and the same artefact fed the
expected value that put **WEAT Long Call ATM (EV/$100 +$290)** and **UNG Long Call ATM
(+$120)** at the top of the wide search.

`payoffCeiling(legs)` in `src/rules.js` decides it from the LEGS:

| Direction | Bounded when | Why |
|---|---|---|
| above | net signed **call** quantity ≤ 0 | Above the highest strike every call is in the money, so the far-right slope IS that quantity. Positive and the profit runs away. |
| below | net signed **call** quantity ≥ 0 | Negative and the loss runs away — an uncovered short call, which the gate already refuses by name (`UNDEFINED_RISK`). |
| puts | always | The price line stops at zero, so a long put is worth at most its strike and a short put loses at most its strike. Large, never infinite. Calling the put side unbounded would be the same mistake pointing the other way. |

What follows:

- **`maxProfit` is `null`, never a number**, in `analyze()` and in `payoffBands()`. The
  sampled top survives as `sampledMaxProfit` / `sampledTop` for the code that has to
  scale a picture, and is never a figure on a screen.
- **The UI says it in words** — `NO_CEILING` ("no ceiling") in `rules.js`, written once.
  R/R prints "—", the take-profit target prints "—", the exit plan says the
  `RULES.exitDTE` mark is the half that still applies, and the profit rungs of the exit
  ladder are not offered because `takeProfitPct × null` is `0` and would have sent an
  order to close for nothing.
- **Nothing that needs a finite best case is computed.** `rewardRisk()` and `evProfile()`
  already return null on a non-finite reward; `exitSim()`, `exitPathSim()` and the
  seasonal replay skip the take-profit branch rather than triggering it at break-even.
- **It is ranked last, never dropped.** `qualityFloor()` takes `unboundedProfit` and
  SKIPS the reward-to-risk floor instead of failing it — the same rule the liquidity half
  applies to unknown open interest, and for the same reason. The multi-market scan's
  guard was `maxProfit <= 0`, and `null <= 0` is **true** in JavaScript, so the honest
  answer would have made every long call vanish without a word. The candidate is shown,
  its expected value is left blank, it sorts last on the `-999` `evProfile()` returns,
  and `noCeilingRankNote()` says why in the list.
- **The loss side is untouched.** Non-negotiable rule 2 stands: `maxLoss` is still the
  grid minimum and still always a finite number.

### A maximum loss that is a profit is an arbitrage

The debt PR #14 wrote down and left open: *"A structure whose maximum loss is POSITIVE is
still offered. The wizard already skips `maxLoss >= 0`; the Shortlist does not."* A worst
case that is a gain says the structure cannot lose at any price at expiry. There is no
such thing on five commodity ETF chains — what there is, is a leg priced off a market
maker's placeholder, the same fault as the $0 debit.

`impossibleLoss(maxLoss)` in `rules.js` is that test, run at all three generation sites in
the same register as UNPRICEABLE and immediately after it: a named sentence with the
number in it (`impossibleLossNote()`, `NOTHING_TODAY.impossibleLoss()`), its own count in
the tally, and its own refusal screen. It is deliberately SEPARATE from `priceability()`:
that asks whether the quotes exist, this asks whether the arithmetic they produced is
possible, and pooling the counts would explain neither. It reads the SIGNED figure, so
callers that carry a positive magnitude (the gate, `qualityFloor()`) must not use it.

### One trade, one breakeven

The Shortlist said *"BOIL makes money above $20.67"* and Build said *20.68*. Exact is
20.67 (20.50 + 0.17). `payoffBands()` interpolated the crossing; `analyze()` took the
midpoint of the grid step it fell in, resolution 0.051. The expiry payoff is piecewise
linear, so the crossing inside a bracket is exact arithmetic — `analyze()` now interpolates
it with the same zero-is-a-loss sign convention `payoffBands()` uses, and the two screens
print the same string by construction, across every preset in every direction.

### The report cannot invent a position

Section 2 of the generated report is deterministic (`buildReportMd`) and correctly said
**"No open positions."** Section 5, written by the model, said: *"The BOIL $20.50/$22.50
call spread entered at $68 debit — monitor daily against the 50% max-profit target ($434
credit)."* No such position was ever opened, and the target was wrong as well. The cause
was one clause: the prompt asked for *"what to prioritise on the open positions"*
unconditionally, so with nothing to prioritise the model filled the hole from the
structure that happened to be loaded on the Build screen.

`reportNarrativePrompt(positions)` lives in `src/rules.js` with `copilotRulesBlock()` —
a generated prompt is a generated sentence, and it belongs where they all do. Two changes,
and the second is the one that generalises: the clause is only asked for when there is
something to ask about, and the prompt states that **`paperPositions` is authoritative**,
naming `currentStrategy` as a structure being LOOKED at rather than one that was entered.
`src/ceiling.test.jsx` fails the build if the prompt does not change with an empty array.

---

## 4b. Quality floors — the app will not propose an indefensible trade

A structure can satisfy every rule in §4 and still be one nobody should take. Two floors,
both named constants in `src/rules.js` with the reasoning beside them, applied by one pure
function `qualityFloor()` at every point candidates are generated — the guided flow's pool,
the Shortlist, and the multi-market scan — so a structure cannot be rejected on one screen
and offered on another.

| Floor | Value | Why that number |
|---|---|---|
| `liquidityPercentile` | **0.40 — MEASURED** | Where a leg must sit among the other strikes **on its own expiry**. A single absolute count was the mistake: 25 contracts is nothing on UNG and a great deal on SOYB, so one figure either empties the thin markets or waves the junk through on the liquid ones, and which it does depends on a market it was never measured against. A strike in the bottom 40% of its own chain's distribution is untraded whatever its raw count says, and that judgement travels between markets in a way a fixed number cannot. |
| `minOpenInterestAbsolute` | **10 contracts — MEASURED** | The floor under the floor. A percentile alone lets a chain certify itself: where nothing trades the 40th percentile is one contract, every leg clears it, and the emptiness has become the standard. Well below the old 25 on purpose — the relative test now does the work on a liquid board, and this one only has to catch "nobody trades anything here". The live case that prompted the whole floor: a SOYB call spread quoted at 1.16 and 0.30 on adjacent strikes whose implied volatility disagreed by ten points, on legs with **2** and **0** open. Those were placeholders, not prices. |
| `minPeersForPercentile` | **8 strikes — MOVED BY THE READING, from 12** | Below this there is no distribution to take a percentile of, so the absolute floor applies alone — and the screen says so. "We could not measure the neighbours" is a different fact from "the neighbours are all busy", and reporting them as one would be the app blaming the data for its own setting. |
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

**BOTH LIQUIDITY NUMBERS ARE MEASURED, AND THIS IS THE MEASUREMENT.** They were
originally chosen from two live examples and the structure of these markets; nobody had
counted the open interest actually present on UNG, CORN, SOYB, BOIL and WEAT, and it could
not be counted from a development sandbox because the broker keys live only in Netlify's
environment. So the measurement was built to run where the keys already are —
`netlify/functions/liquidity.mjs`, at **`/api/liquidity`**, behind the site's own password —
and it was run against the broker on **the 2026-09-01 close**: 1,654 contracts inside the
+/-45% band the app builds in, 1,035 of them reporting open interest at all.

**Near the money (within 10% of spot), which is where these structures get built:**

| market | strikes | 1st quartile | median | 40th pct — the bar | clears 10 |
|---|---|---|---|---|---|
| SOYB | 38 | 11 | 58 | **33** | 82% |
| CORN | 38 | 40 | 216 | **100** | 89% |
| UNG | 67 | 90 | 360 | **202** | 90% |
| BOIL | 143 | 11 | 50 | **28** | 78% |
| WEAT | 45 | 50 | 164 | **150** | 84% |

**The bar a leg must clear ranges from 28 contracts on BOIL to 202 on UNG — a sevenfold
spread across five markets this app otherwise treats alike.** That is the whole case for a
relative floor, and it is now a reading rather than an argument. It also convicts the number
it replaced: the old fixed 25 sat *above* the first quartile on SOYB and BOIL (both 11) and
*below* it on CORN, UNG and WEAT (40, 90, 50) — it bit hardest on exactly the thin markets it
was least equipped to judge, and was close to inert on the liquid ones.

**What the reading confirmed, and the one thing it changed:**

- `liquidityPercentile` **0.40 — confirmed.** On all five markets the 40th percentile near
  the money lands far above the absolute minimum (28 to 202, against 10), so the relative
  half does the work everywhere and the absolute one is left catching dead chains. That is
  the shape this was designed to have, and the reading says it has it.
- `minOpenInterestAbsolute` **10 — confirmed, and it earns its keep.** Near the money it
  removes 10–22% per market and empties none of them; and it catches the case it exists for.
  BOIL's 2026-10-09 board had a near-the-money *median* of 3 contracts and a 40th percentile
  of **2** — below the minimum, so 10 is what binds there and only 2 of its 7 near-the-money
  strikes survive. A purely relative floor would have waved that whole expiry through on the
  strength of its own emptiness.
- `minPeersForPercentile` **12 → 8 — the one number the measurement moved.** Only 34–76% of
  contracts report open interest at all, so an expiry's peer set is far smaller than its
  strike count, and at the horizon this app aims for (§4, `targetEntryDTE` 45) the grain
  markets are thin in *reporting* strikes: SOYB's 43-day board carried 10 and CORN's 11. At
  12 the relative half would have switched itself off exactly where the app builds — and on
  CORN that expiry's own 40th percentile was 30, three times the absolute minimum, so
  switching it off was a real loss of protection rather than a harmless fallback. Eight is
  where a percentile still means something; below it you are picking one of a handful.

**Two whole expiries reported no open interest at all** (UNG and BOIL, both 2026-10-23). The
skip rule handles them by construction: unknown is not zero, nothing is rejected for it, and
the screen says the floor was skipped rather than passed.

`LIQUIDITY_MEASUREMENT` in `src/rules.js` is the one home for these findings, so the copy
explaining the floor cannot drift from the evidence behind it. It must never be **derived**
from the floor's own constants: a screen that recomputed "the bar ran from 28 to 202" out of
`minOpenInterestAbsolute` would report a different measurement the moment somebody changed
the setting, which is the opposite of a measurement. One close is a reading, not a law —
`/api/liquidity` takes it again whenever the market has moved.

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

## 4e. A price has to survive a sanity check, not just a floor

`minNetPremium` is an **absolute** floor. It knows what a price may not be smaller than and
nothing whatever about what *this* structure should cost. On 17 September 2026 that gap
reached the broker.

**The order.** BOIL 2026-10-23, buy 10x 20C, sell 10x 21C, limit **$0.05**, time in force day.
Status "new", filled quantity 0.00, never filled. It is the only order this app has ever sent.
With spot at 19.84, 36 days out, and the implied volatility this app itself uses for BOIL, that
spread is worth **$0.333 a share — $33.29 a contract**. $0.05 is *exactly* `MIN_NET_DOLLARS`:
it cleared the floor built to catch the $0 butterfly **by one cent**, and it was wrong by a
factor of 6.7 in the direction of "too cheap". The maximum loss shown to the owner was **$50**
where the real one, had it filled, would have been **$333**.

So there is a third question, after "is there a price at all" (`priceability()`) and before the
quality floors: **do the price and the model describe the same structure?** `modelSanity()` in
`src/rules.js` compares the structure's net off the chain against `netBS()` from `engine.js` —
the same function and the same `smile()` every other screen prices with — and refuses a
proposal more than `RULES.modelDisagreementRatio` (**4**) away either side.

**Why four, and what was actually measured.** The denominator is Black-Scholes at a *hardcoded
per-ticker sigma*, so the bar cannot be tighter than that model's own error or the app would
refuse real structures for the crime of its own volatility guess being off. That error budget
was measured: every structure family the app builds, all five markets, 30/36/45/60/90 days,
five strikes either side of the money, repriced with the assumed volatility deliberately wrong,
counting only cases where both nets clear `MIN_NET_DOLLARS`:

| family | IV wrong ±25% | IV wrong ×0.5 .. ×2 |
|---|---|---|
| call vertical | 0.63 .. 1.28 | 0.39 .. 1.68 |
| put vertical | 0.61 .. 1.44 | 0.41 .. 2.33 |
| butterfly | 0.81 .. 1.31 | 0.59 .. 1.87 |
| iron condor | 0.59 .. 1.53 | 0.27 .. 2.83 |
| **the live failure (BOIL 20/21)** | | **0.15** |

Four accepts 0.25 to 4.00: outside every artefact in that table — even a volatility guess wrong
by a factor of two cannot make this fire — and the one real fault sits outside it by 1.67x.

**It is deliberately loose, and it is CHOSEN, NOT MEASURED.** What was not read is the
distribution of market-net over model-net on the five live chains, which is what would set this
number the way `/api/liquidity` set the liquidity percentiles. The table above is the
*denominator's* error budget, not the numerator's behaviour. It is on the NOT VERIFIED list,
and the expectation is that a real reading brings the number down.

**Four rules hold it**, and three are the same discipline as every other check in this file:

1. **Unknown is not disagreement.** No spot, no DTE or no volatility means no model, and the
   check is SKIPPED rather than failed — as the liquidity half skips on `oi: null`.
2. **Nothing is judged against a price under the minimum**, either side. A model net of pennies
   is not a valuation; it is where the measured error budget blows out from 0.27 to 0.11.
3. **It names the leg.** "The price is wrong" is not actionable, so `worstLeg` is the leg whose
   own mark disagrees most, in dollars, with its own model price — the quote to go and look at.
4. **It is a proposal floor, not a gate.** It lives at the three generation sites beside
   `qualityFloor()` and is deliberately NOT in `riskGate.js`, which `riskGate.test.js` asserts
   by reading the source. A trade the user builds by hand on the desk is his to make — what the
   desk owes him is the model value printed *beside* the market value, which §8d is.

---

## 4f. The entry floor is room, not a cliff

`minEntryDTE` is 30 and it was a hard violation at 29. The quantity that actually matters is not
the expiry, it is the **room before the exit rule fires**: `room = dte - exitDTE`. Thirty days
is nine days of room, and there is nothing about nine that is right and seven that is wrong —
it is an inherited tastytrade default like the rest of §4, and this app has never measured it.

**The number 30 is unchanged.** What changed is what happens either side of it, so that a
reading can be taken before the floor is moved. Three bands, in `entryRoom()`:

| band | what happens |
|---|---|
| `dte <= exitDTE` | **hard violation**, unchanged in spirit, and **not overridable** — the position would open already inside its own exit window, and the exit rule is frozen at construction |
| `exitDTE < dte < minEntryDTE` | **warning carrying the number** ("this board gives you 7 days before the 21-day exit fires; the app aims for 24"), unlocked by a typed reason of `minOverrideReasonChars` — the same mechanism `sizing()` uses for the per-trade cap. Without the reason it blocks and says what would unlock it; with it, it warns and the reason goes to the Journal |
| `dte >= minEntryDTE` | unchanged: nothing is said |

**And `passedOver` becomes offerable, not merely narrated.** `expiryChoice()` has been naming a
nearer, busier board and then not letting anybody take it — a door with no handle. A
passed-over board past the exit rule can now be taken through the override; one at or inside it
still cannot, by anybody. **The choice itself is untouched:** a passed-over board is never what
the app opens on by itself.

**It is instrumented, because the 30 has to be settled from a reading.** `passedOverRecord()`
writes one row per market per board into `store.expiryLog` — which board was chosen, which was
passed over, how much busier it was, and whether it was offerable — and the Journal reads it
back through `passedOverSummary()`. It is local, capped at 60, and never goes to the shared
`/api/state` blob: it is calibration data about this user's markets, not a position. ROADMAP P5
is what reads it.

---

## 4g. A rule number can hide in an expression — and the simulator walked to the wrong day

### THE FAULT

`exitSim()` in `src/engine.js` — the exit simulator the autopilot runs on every open position,
every weekday — opened with this:

    const tp = Number.isFinite(pos.maxProfit) ? 0.5 * pos.maxProfit : null;
    const sl = 0.5 * pos.maxLoss, days = Math.max(1, dteLeft - 7);
    ...
    const pnl = (netBS(pos.legs, s, 7, iv) - pos.entryNet) * 100;

Four copies of three rules that have a home in `src/rules.js`. Two of them were right by luck:
`takeProfitPct` is 0.5 and `stopLossPct` is 0.5. **The other two were not.** `RULES.exitDTE` is
**21**, and has been since it was CHANGED FROM 7 — §4 says so in the table and the comment beside
the constant says so again. So the simulator walked each position forward to **7** days to
expiration and marked whatever survived at **7** days, while the app's own rule closes or rolls
the trade at **21**.

`netlify/functions/autopilot.mjs` then handed the result to the model in a field called
`p_exit_at_exit_dte_positive`. **The name asserted the rule the arithmetic had not applied**, and
the model wrote prose on top of it: a brief that says "62% chance of still being positive at the
exit rule" was describing a different trade from the one the app manages.

The same bare 7 was in `exitPathSim()` in `pro.jsx` — the Guardian panel's version, which the
owner runs by hand. That one walked the right number of days (`dteLeft - RULES.exitDTE`) and then
**priced the survivors fourteen days later than the day it stopped at**, so its horizon and its
marking disagreed with each other inside one function.

### THE FIX, AND WHY THE POLICY IS AN ARGUMENT

`engine.js` imports nothing, and `rules.js` imports `engine.js` — a leaf-ward import, stated as
such in `rules.js` (§4e). Reading `RULES` from the engine would make that a cycle. So the exit
policy is the CALLER'S:

    exitSim(pos, S, dteLeft, iv, sigma, { exitDTE, takeProfitPct, stopLossPct }, n)

**and it has no default value, deliberately.** A default is how the bare 7 comes back, silently,
in a year: a new call site that forgets the argument would get whatever number this file happened
to hold rather than the number the app applies. A missing or unreadable policy THROWS. The one
caller, `autopilot.mjs`, builds `EXIT_POLICY` from `RULES` in one place. `pro.jsx` already imports
`RULES` and now reads `RULES.exitDTE` for its survivor mark.

`exitSim` also returns `horizon` (how far it walked) and `exitDTE` (the day it stopped at), and
the brief prints both beside the probabilities — `simulated_to_dte` and `days_simulated` — so a
field name can no longer assert a rule on its own authority.

### WHAT THE NUMBERS DID

Every simulator output moves, because the simulated window is `dteLeft - 21` instead of
`dteLeft - 7`. Seeded at 1500 paths, in `src/engine.test.js` as real assertions:

| Fixture | window | pTP | pSL | pTimePos | ev | medDays |
|---|---|---|---|---|---|---|
| CORN 20/22, 41 DTE | 34 → **20** days | 0.226 → **0.097** | 0.623 → **0.419** | 0.093 → **0.294** | -2.00 → **-1.30** | 22 → **15** |
| BOIL 21/24, 50 DTE | 43 → **29** days | 0.435 → **0.393** | 0.557 → **0.519** | 0.003 → **0.054** | +20.56 → **+19.52** | 12 → **11** |
| UNG 11C, 35 DTE (no ceiling) | 28 → **14** days | 0 → **0** | 0.767 → **0.554** | 0.192 → **0.281** | -9.10 → **-8.08** | — |

Fourteen fewer days of price path is the whole of the change, and three of the five numbers move
in one direction on every fixture: **fewer chances to touch either barrier**, so `pTP` and `pSL`
both fall and the share still open when the rule acts rises. `medDays` falls because the late
take-profits are the ones the shorter window cuts off, so the median of what is left is earlier.

**`ev` has no single direction, and that is not a finding.** It is the average over three
outcomes whose weights all changed at once, and the survivor mark itself moved: at an unchanged
spot the same structure is worth $18 (CORN), $10 (BOIL) and $24 (UNG) more at 21 DTE than at 7,
because two more weeks of time value are still in it. On CORN and UNG that lifts `ev`; on BOIL,
where the take-profit paid more than the survivor mark does, it lowers it.

### THE GUARD THAT FOUND IT, AND WHAT IT STILL CANNOT SEE

`riskGate.test.js` refused two shapes of copy — a `useState` default and a property or local
constant. It now refuses a third: **a rule number inside an arithmetic expression**, which is the
shape that let this live in plain sight for four pull requests. The file list is read off the
disk and now covers `engine.js` and the Netlify functions as well as the three UI files.

Keeping it quiet is the hard half, because 0.5 is in Black-Scholes twice and 30 is how many days
are in a month. Four rules do it, and each is a statement about what a rule number is: the value
must sit beside a **rule-named** identifier, matched on the identifier's WORDS (so `dteLeft` is
about DTE and `xToday` is an x coordinate); **division is not one of the operators** (something
divided BY a number is using it as a unit — `dte / 30` is days into months); an operand already
anchored at the home (`RULES.targetEntryDTE + 30`) is reading the home; and the cosmetic names go
on being excluded.

**It cannot catch a STALE copy, which is what the bare 7 was.** 7 is not the value of any rule
any more, so no matcher can know it used to be one; what the widened guard caught was the two
`0.5`s on the same two lines, and a person reading those lines found the 7. The shape itself is
refused separately: `netBS()` is the app's one pricing call and its third argument is how many
days are left, so a number literal there is always a policy written down twice —
`engine.test.js` fails the build if either simulator does it again.

Two files are excluded from the sweep by name, with their reasons in the code, because on both
the matcher would name the WRONG rule: `demo.js` (`entryDaysAgo: 30` is a fact about a made-up
position, not the entry floor) and `signals.js` (an un-homed confidence bar of 70 that collides
in value with `expensiveIVRank` — see NOT VERIFIED).

### THE FALLBACK TO A FALLBACK

The same function was run on `SIGMA[pos.ticker] || 0.25`: a hand-written volatility table with an
**unlabelled hand-written fallback behind it**, driving pTP, pSL, pTimePos, ev and medDays. A
brief that says "38% chance of taking profit first" reads the same whether the 38 came from a
number somebody wrote down for BOIL or from a number nobody wrote down for anything.

`RULES.fallbackSigma` (`FALLBACK_SIGMA`) now names it, with the same discipline as
`markProvenance()` (§9b): **decide once which of the two is in force, and carry it everywhere.**
`sigmaProvenance()` returns the volatility, whether it came from the table, and one sentence; the
brief carries `simSigmaSource`, the model is told `volatility_source`, and a position walked at
the fallback gets a named warning. **0.25 is CHOSEN, not measured**, and the comment beside it
says so. Fixing the TABLE — measuring realised volatility per market instead of typing it — is
ROADMAP P2's house distribution and is deliberately not this change.

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
aligned → options expensive versus their own history → **every candidate unpriceable (§4a)**
→ **every candidate filtered out by the quality floors (§4b)** → nothing fits the budget →
only one road survives. A board where nothing could be priced is not a board the floors
emptied and is certainly not a budget problem: three refusals, three sentences. A missing-data answer
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

**Open-interest strip** — the liquidity floor (§4b) as a picture rather than a paragraph:
every strike on one expiry from emptiest to busiest, with the line where the setting cuts.
Red left, green right, and the line moves when the filter moves. **A strike with nothing
open is grey and 2px tall**, never green and never invisible: `log1p(0)` is 0, and on
BOIL's 2026-10-09 board 60 of 108 strikes carry no open contracts, so most of the picture
drew at zero height and read as "not drawn". Three colours, because "nobody is here" is a
different fact from "this setting removed it". **With the floor OFF the strip carries a
ghost line** where Recommended would cut — dashed, dimmed, labelled with the count,
filtering nothing. Off only means something against what is being switched off. It is the answer to the
one thing three paragraphs of prose could not explain — that the floor is a POSITION IN A
RANKING, not a quantity. Not derived from `payoffBands()` and not an exception to that
rule: it draws no trade. Heights are log-compressed (1 to 66,130 on one expiry), so the
real extremes are printed at the ends and the takeaway carries the numbers — a vertical
axis that cannot be read as a number must not pretend otherwise.

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

**A SCRATCH IS NOT A WIN, AND THE SENTENCE HAS TO SEPARATE THEM.** Two true numbers can
make a false impression when they are joined. Live UNG: a broken-wing call butterfly,
+1 10.50C / -2 11.00C / +1 12.00C opened for a $1 credit with spot at 10.57 — +$1 anywhere
below 10.50, +$8 at spot, +$51 at the 11.00 peak, -$49 above 12.00. The screen said it
*"makes money below $11.51, which the next 30 days reach about 73.1% of the time — and
expiring at today's price would pay $8."* Every figure is correct. Most of that 73.1% is
the flat lower wing paying **one dollar**, and a beginner reads 73% next to "up to $50" and
joins them into a claim nobody made.

`RULES.scratchPayoffShare` (**0.20**) is the one named constant, in `src/rules.js` with its
reasoning, and it is **for copy only**: it filters no candidate, blocks no order and changes
no arithmetic. `payoffBands()`, `profitBands()` and `chanceInProfit()` are untouched — they
were already correct. What is new is a SECOND cut of the profit region, at
`scratchLevel(maxProfit)`, using the same samples and the same linear interpolation the
sign cut already uses (`bandsAbove()` → `payingBands()` → `scratchSplit()`), so the two can
never disagree about a crossing and a whole band whose own peak sits under the line simply
falls out. The unified takeaway then states both in one sentence, and only when the numbers
demand it — when the chance of finishing where it really pays is SMALLER than the chance of
finishing where it merely scratches:

> "UNG is at $10.57 and makes money below $11.51 about 71.8% of the time in the next 30
> days, but most of that is a scratch — it pays more than $10 only between $10.59 and
> $11.41, about 17.7% of the time — and expiring at today's price would pay $8."

With no ceiling there is no share to take, `scratchLevel()` returns null, and nothing is
said rather than something guessed.

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

Hard blocks: undefined risk; **a maximum loss that cannot be read off real quotes (§4a) — unknown is a violation, not a pass**; per-trade limit exceeded; total exposure exceeded; DTE at entry below threshold; account not in paper mode (if unverifiable, reject).

**The dollar limits are the worst case TIMES THE QUANTITY (§10f).** `maxLoss` on
a proposal is the worst case of one combination; `contracts` is the size that
will actually be sent, and the gate multiplies. It used to read a field nothing
wrote, so every open position counted once whatever was bought.
Warnings: signal agreement is CONFLICT; confidence under 40; stop-loss threshold reached; **the capital questions are unanswered**, so the limits being enforced are the suggested starting point rather than the user's own (§3).

The gate is about whether an order may leave. The **quality floors (§4b) are a different
question** — whether a structure should ever have been offered — and they are applied where
candidates are generated, not here. A trade the user builds by hand on the full desk is his
to make; a trade the app *proposes* has to clear both.

Every violation carries readable numbers: `"Max loss $340 = 6.8% of capital (your limit: 5%, i.e. $250)"`.

**Every path to an order routes through this**: manual ticket, exit ladder, autopilot. Rejected proposals are never dropped silently — they surface with their reason.

---

## 8b. The order itself — the shape that is sent, and the answer that comes back

Two faults confirmed live on 2026-09-04, both of them about the moment the app stops
reasoning and starts transacting. `src/order.js` is where both are answered, and
`src/order.test.js` / `src/order.test.jsx` hold them.

### An order that fails must fail visibly

The owner confirmed twice on Build. The request reached Alpaca, Alpaca rejected it, and
**nothing appeared on screen**: every outcome of the ticket's `send()` — success, risk-gate
refusal, caught error — went to `setMsg`, which renders at the TOP of a long page whose send
button is at the BOTTOM. The order did not vanish; the reason did.

- **The ticket answers where the button is.** `OrderOutcome` renders inside the ticket and
  persists until it is dismissed. `setMsg` still fires — the banner is useful when the page
  is scrolled up — it simply cannot be the only place the answer lives.
- **The status and the body are the diagnosis.** `alpacaReq` now carries `status` and the
  whole body on the error; `alpacaErrorText()` writes the sentence and the raw reply is
  shown under it. The old `text.slice(0, 200)` is what removed *"leg ratio quantities should
  be relatively prime: GCD[5 5] = 5"* from the one sentence the user read. An mleg rejection
  — a bad OCC symbol, insufficient buying power, a refused leg — is unreadable without it.
- **A limit at the mid of a wide market can be ACCEPTED AND NOT FILL.** That is a third
  outcome, not a failure: the ticket says the order is working and names where it is waiting
  — its limit, and how long it stands.
- **One tap never looks like nothing.** The armed confirmation writes out what the second tap
  sends (`OrderPending` over `orderPreviewLines()`), with a cancel beside it.

### The app proposed sizes it could not send

Alpaca refused a sized spread with **422 / 42210000**: *"leg ratio quantities should be
relatively prime: GCD[5 5] = 5"*. Every path put the size multiplier into each leg's
`ratio_qty` (5 and 5) instead of into the order's `qty`. Correct is `ratio_qty` 1/1 with
`qty` 5 — and since the Shortlist routinely suggests x5, x6, x7, **every structure it sized
above x1 was unsendable**, opening and closing alike.

`reduceRatios()` divides the legs by their greatest common divisor, `orderQty()` puts the
factor into the order's quantity, `unitLimit()` divides the price by the same factor so the
money at stake is unchanged, and `orderBody()` is the single builder all five construction
sites use. A genuine ratio survives untouched: GCD(1,2,1) is 1, so a butterfly is still
1, 2, 1.

### "Position opened" is not true of an accepted order

The confirmed order came back `status: "accepted"`, `filled_qty: 0` — submitted outside
market hours and queued — and the app announced *"Position opened. Close at 50% of max gain,
or at 21 days to expiration."* Both halves were false: nothing was bought, and a plan
measured from a fill that has not happened is a plan about nothing.

`orderOutcome(order)` reads the reply. **Filled, partly filled, working and
killed-by-the-broker are four different sentences, and only a complete fill carries
`startsExitPlan`.** The position record keeps `alpacaStatus` / `alpacaFilled`, the Positions
row says the order behind it has not filled, and a working order keeps the screen that
explains it instead of jumping to a tab of positions the user does not own yet.

---

## 8c. The closing order — a LIMIT, priced at the moment of the tap

**Measured: `autopilot.mjs` built the close with `type: "market"`.** The body was built at
proposal time, stored whole, and sent when somebody tapped the approve link — up to 24 hours
later. Two faults in one:

- **A market order into these books is not a price.** BOIL quoted bid/ask spreads of **66%,
  91%, 145% and 166% of the mid** near the money on strikes this app builds on (§4b). At 145%
  the ask is more than three times the bid. The app refuses to *price a candidate* off a market
  that wide (`spreadFloor`) and then closed one at whatever the far side was asking.
- **Even a limit worked out at proposal time would be a day old** by the time it was sent.

So the approval carries the **order intent** — which legs, which contracts, which way — and
nothing else. `approve.mjs` fetches a fresh chain at tap time, reads each leg's live two-sided
quote, and builds the body with **`orderBody()` unchanged, `type: "limit"`**. `order.js`'s
internals were not touched: the size still goes in `qty`, the shape still goes in the ratios,
and the limit is still the net of ONE combination.

**The price starts at the mid and concedes a quarter of the spread, and no more.**
`RULES.closeLimitSlippage` (0.25, exported as `CLOSE_LIMIT_SLIPPAGE`) is **CHOSEN, NOT
MEASURED** — the only number in `RULES` that is neither research nor a reading — and it is on
the NOT VERIFIED list below. A quarter rather than a half because half the spread *is* the far
side of the market, which is the market order this replaces.

The concession is always **subtracted from the signed net**, which is the same direction in
both cases and is why the arithmetic has no branch in it: a long structure at +3.00 in a
0.40-wide market is offered at +2.90 (you receive ten cents less), a short one at −3.00 is
offered at −3.10 (you pay ten cents more). It is floored at a cent and **never flipped round**:
a structure worth +0.02 conceded by 0.10 would land on −0.08, and since the body carries the
MAGNITUDE the broker would read that as "sell it for eight cents" — four times *better* than
the mid, on an order meant to give something up.

- **A leg with no live two-sided quote stops the send**, and the page says which leg and why.
  A bid of zero is not a quote: it is the same test `priceability()` applies at entry.
- **A working order is said to be working.** `orderOutcome()` reads the reply, the position's
  timeline records `orderWorking`, and the page says nothing has filled. The next autopilot run
  reads that entry back, says a close is still outstanding, and proposes a fresh one priced
  from today's chain. **Nothing is re-sent by itself.**
- **A link issued by the old build is refused**, not silently re-priced: it proposed a market
  order and nobody proposed the limit that would replace it.

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

## 9b. What the autopilot may act on — the verdict, and whether it is an authorisation

`autopilotVerdict()` in `src/rules.js`, because a rule of action written inside a `.mjs`
function that runs on a server nobody is watching is a rule nothing can test. The loop used to
decide all of this inline. Three findings:

**1. A MODEL PRICE WAS LABELLED AS MARKET DATA.** `markFromChain()` returns `net: null` unless
EVERY leg is found with a two-sided quote; the caller then falls back to `netBS()`. The brief
reported `chainSource: "CBOE delayed"` whenever the chain had **loaded at all** — so a position
marked entirely by Black-Scholes was handed to the model, printed in the brief, and used to
build an approve link, as delayed market data. `markProvenance()` decides it from the NET and
nothing else: the source is **`"model"`** whenever the number came from `netBS`, `rules.js`
never writes the feed's name itself (it is handed one), and the brief says *"These figures are
ESTIMATES"* above the figures rather than in a footnote under them.

**With a model price, the take-profit and exit-DTE triggers produce a WARNING and never an
approve link.** The rule is reported, not acted on: nothing can be sent to the broker at a
price nobody quoted. `approvable` is a separate field from `verdict` for exactly this.

**2. THE STOP WAS A WARNING IN THIS DOCUMENT AND AN ORDER IN THE CODE.** §4 downgraded the
50%-of-max-loss stop to an alert — *"show a warning, do not auto-close, until backtest says
otherwise"* — and `RULES.stopLossEnforcement` has read `"warn"` ever since. The autopilot set
`verdict = "STOP"` on the crossing and then built a one-tap close out of it, on the
weakest-evidenced rule in the app, whose backtest is still **NOT BUILT** (§4). It also applied
the stop *after* the take-profit and unconditionally, so a crossing could replace a `CLOSE_ALL`
with a `STOP` and its link.

Now: the crossing produces verdict **HOLD** and one named warning — *"Stop threshold crossed —
not validated by backtest"* — with the figure in it, and never an approve link. **The model is
not offered STOP as a verdict**: `AUTOPILOT_VERDICTS` is `["HOLD", "CLOSE_ALL"]`, the prompt is
generated from that constant, and a `STOP` returned anyway is turned back into HOLD. **Take
profit and exit DTE keep their approve links**, on a real price.

**3. A MANUAL CLOSE AFTER A STOP WARNING IS A MANUAL CLOSE.** `posAlerts` raises the stop to
level `"action"` so the row is impossible to miss, and `closePos()` read that level as *"a rule
said so"* — filing a decision the user made as obedience, in the one number meant to measure
discipline honestly. `ruleExitOf()` says which rules actually end a trade: the take-profit and
the exit window, and nothing else. A close taken on the stop warning needs the same written
reason as any other close with no rule behind it (§10c).

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
| `/api/liquidity`, the measurement behind the liquidity floor | **BUILT AND RUN** (2026-09-01 close) — the floor's two numbers are set from it, and §4b carries the distribution |
| Backtest: 7 vs 14 vs 21 DTE on two underlyings, `report.md` | **NOT BUILT** (§4) |
| The order status is re-read after the fact (`recheckOrders`) | **DONE** (§10c) — the last session's open debt |
| The Journal keeps the ref, the whole timeline, the thesis, both order ids and the reason | **DONE** (§10c) |
| The stop is a warning in the autopilot as well as in this document | **DONE** (§9b) |
| A model price can never become an approve link | **DONE** (§9b) |
| Closing orders are limits, priced at tap time from a fresh chain | **DONE in code, NEVER SENT** (§8c) — see NOT VERIFIED |
| Installable PWA: manifest, icons, standalone launch, offline shell | **DONE, AND INSTALLED** (§10d) — on the owner's phone, and it works |
| Model-vs-market sanity check on every proposed price | **DONE** (§4e) — the ratio itself is CHOSEN, see NOT VERIFIED |
| An opening limit that concedes part of the spread | **DONE in code, NEVER FILLED** (§8d) — see NOT VERIFIED |
| The ticket shows the combo book, the model value and the notional | **DONE** (§8d) |
| Working orders visible in the main flow, with age, re-price and cancel | **DONE** (§10e) |
| The entry floor as ROOM: hard block only inside the exit window | **DONE** (§4f) — the number 30 is unchanged and uncalibrated |
| The position remembers its size, and the gate runs at it | **DONE** (§10f) — the cap that did not hold |
| One model check, shared by the three generation sites and the ticket | **DONE** (§10f) |
| The exit simulator runs at the exit rule, and the policy is the caller's | **DONE** (§4g) — it walked to 7 DTE while the rule says 21 |
| A rule number inside an arithmetic expression is refused by a test | **DONE** (§4g) — and it still cannot catch a STALE copy |
| The simulator's fallback volatility has a name, and the brief carries which was in force | **DONE** (§4g) — 0.25 is CHOSEN, and the table behind it is P2 |
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

## 10c. The Journal keeps the record — the ref, the timeline, the reason

**Measured: `closePos()` in `App.jsx` kept four fields.**

```
entry = { id, t, ticker, name, openedAt, pnl, ruleExit, riskOk }
```

The timeline went, the thesis went, both Alpaca order ids went, and the reason went with them.
So the Journal — the app's own record of what it did, and the only place its discipline number
comes from — could say a trade ended at a profit and could not say why it was opened, what the
app told the owner while it was open, which order opened it, which order closed it, or who
decided to end it. A position managed for six weeks became one line with a number in it.

`src/journal.js` is where this lives now, plain JS for the same reason `rules.js`, `order.js`,
`path.js` and `handoff.js` are.

**A REF, GIVEN AT OPEN AND NEVER REUSED.** `J-0001`. A position used to be identified by
`Date.now()`, which is fine for a React key and useless for a human: you cannot say *"look at
J-0007"* to somebody, and you cannot sort by it in a way that means anything. `journalSeq` in
the state is the highest number ever issued, and `refCounter()` takes the maximum of it, every
open position's ref and every closed entry's ref — **closing or deleting a position does not
hand its number back.** Positions saved by an older build are given refs once, at hydration.

**A SEQUENCE PER ENTRY.** `J-0001·03` is the third thing recorded against J-0001. The autopilot
writes into this timeline from a server while the app is shut, the app writes into it from the
browser, and the two are merged on the next load — so an entry needs an identity given when it
is **recorded**, not a position in an array that a merge can shuffle. A middle dot, because
CLAUDE.md's rule about rare glyphs is not optional on the phone this is demoed on.

**THE CLOSED ENTRY KEEPS:** the ref, the **full** timeline, the thesis, both Alpaca order ids
**in full** (the screens slice them to eight characters, which is right on a row and useless
when you are looking a trade up on the broker), and the close reason. The four old fields are
all still there.

**THE CLOSE REASON IS A RULE OR A SENTENCE THE USER WROTE, AND THERE IS NO THIRD OPTION.** A
rule close names its rule (`ruleExitOf()`) and asks for nothing, though anything typed is kept.
A close with no rule behind it — including one taken on the stop **warning** — requires the same
minimum as the against-the-signal override, `RULES.minOverrideReasonChars`, and the Close
button opens a form that says so rather than closing outright.

**THE TIMELINE IS FULLY VIEWABLE.** The position screen showed `slice(-6)` and nothing else, so
everything a position was told in its first weeks was unreachable from the screen that manages
it. The recent six are still in front; the rest open behind a control that says how many there
are. The Journal shows every entry with no cap at all.

**`approve.mjs` WRITES INTO IT TOO.** When an approve link is tapped, the position gains a
timeline entry carrying the full order id, the limit it was sent at and `orderOutcome()`'s
headline — so the record does not end at *"the autopilot proposed a close"* with the order that
actually went out living only in a brief nothing keeps. The approval carries `posId`, because a
display name is not an identity.

**SORTED AND SEARCHED BY REF.** Newest ref first — by ref and not by close date, so the order on
screen is the order the trades were opened in. The search box finds `J-0002`, `0002` and `2`,
and it finds a trade from a **sequence** off its timeline (`J-0002·04`), which is the string
somebody is most likely to be holding. Ticker and name match too.

---

## 10d. Installable — a home-screen icon, and a cache that may not hold a price

The app is a **PWA**: `public/manifest.webmanifest` gives it a name, an icon and
`display: "standalone"`, so Android's "Install app" and iOS's "Add to Home Screen" produce a
tile that launches with no address bar. Nothing about the trading behaviour changes; this is
packaging.

**THE MANIFEST AND THE ICONS ARE OUTSIDE THE PASSWORD GATE, AND THEY HAVE TO BE.** The browser
fetches a manifest **without credentials** — it is not the page asking, it is the install
machinery, and it does not send the Basic-Auth header the user typed into the popup. Behind the
gate it gets a 401, the manifest never parses, and the browser simply does not offer to install,
with no error on any screen. So `netlify.toml` excludes exactly five files: the manifest and the
four PNGs it names. **Nothing else leaves the gate** — not the app, not any `/api/*` path, not
the service worker — and `src/pwa.test.js` fails the build if anything else ever does.

**THE ICONS ARE GENERATED, NOT PASTED IN.** `scripts/make-icons.mjs` draws them from
`src/theme.js` with nothing but node's `zlib`, so the tile cannot drift away from the app's
palette and no image library enters the tree to draw four rectangles and a line. What it draws
is the app's own visual language reduced until it survives at 192px: a bull call spread's payoff
over its zero line, **green where it makes money and red where it loses**, the same rule
`payoffBands()` applies on screen. Re-run it after any change to the palette.

### The service worker, and the one rule it has

`public/sw.js` is hand-written — no plugin, no generated file nobody can read. A cache sitting
in front of every request is, by default, a machine for showing yesterday's prices as today's,
so the rule is a single sentence: **the shell may be cached and nothing else may be.**

- **`routeOf()` DENIES BY DEFAULT.** A request is network-only unless it positively proves it is
  a static shell asset: GET, same-origin, not under `/api/` or `/.netlify/`, and either a
  navigation or a file whose extension is on a short list. An endpoint added to `netlify.toml`
  tomorrow is network-only without anybody remembering to come back to this file.
- **Network-only means no `respondWith` at all.** The request goes to the network exactly as it
  would with no worker installed, credentials and all, and when it fails it fails in the app's
  own hands — which already knows how to say "prices not loaded" and print a dash.
- **Navigations are network-FIRST.** The cached `index.html` is the offline fallback, never the
  normal path. `index.html` names a hashed bundle, so a shell served from cache while the
  network was there is how a PWA pins itself to the build it was installed from.
- **The cache name carries the build** (`osl-shell-<hash>`), stamped into the worker by the
  `stampServiceWorker` plugin in `vite.config.js` from the emitted assets' own content hashes.
  A browser only reinstalls a worker whose SCRIPT changed, so a constant version would mean a
  worker that never updates; `activate` then deletes every older cache, so a deploy REPLACES the
  shell instead of layering on it.
- **THE BUNDLE IS PRECACHED BY NAME, not picked up on the way past.** The visit that installs a
  worker is never a visit it controls, so nothing it merely intercepts is in the cache yet.
  Measured here: an app installed and taken straight offline booted anyway — off the browser's
  own HTTP cache, which lasts exactly as long as the phone feels like it. The same plugin stamps
  the hashed filenames into the shell list, so the offline launch is a property of the file
  rather than a piece of luck.

**And the app says which it is.** `OfflineBanner` in `App.jsx` prints **"Offline — no live
data"** on every screen, from `navigator.onLine` and the browser's own two events. It hides no
number and invents none: with `/api/*` network-only there is no cached price for it to show, and
the existing empty states do the rest. Verified in Chromium at 390px: after fetching an `/api`
answer through the worker, **nothing under `/api/` is in any cache and no cached body carries
the price**; offline, the shell relaunches from cache with the banner, 0px horizontal overflow
and no price anywhere on screen.

---

## 8d. The opening order — a limit that can fill, and a ticket that shows the book

Two faults in one order, and this is the second (§4e is the first).

**The ticket seeded the bare mid.** `pro.jsx` set the limit field to
`Math.abs(estNet).toFixed(2)`. Closing orders have conceded a quarter of the spread since §8c,
with the reasoning written down; opening orders conceded **nothing**, and `OrderTicket` carried
a comment saying so while the code went on doing it. On BOIL, where this repo has measured
bid/ask spreads of **66%, 91%, 145% and 166% of the mid**, a limit at the mid is a limit nobody
has to meet. The only order this app has ever sent was one, and it sat all day.

`openLimitPrice()` in `src/rules.js` mirrors `closeLimitPrice()`: start at the mid, concede
`RULES.openLimitSlippage` (0.25) of the spread in the direction that fills, never past the
touch, and **never flip the sign round** — a +0.02 debit conceded by 0.10 would price at −0.08,
which the broker reads as "sell it for eight cents" because the body carries the magnitude.

**Why it is a sibling constant and not the same one.** The number is the same and the arithmetic
is the same. They are two constants because they answer two questions and a later session has
to be able to move one without the other:

- **A close has to happen.** The exit rule has fired; the only choice is the price.
- **An open never has to happen.** Nothing is forced, and "nothing today" is a feature.
- **And conceding on the way IN raises the debit**, which *is* the maximum loss on every
  structure this app builds, measured against the per-trade limit by the risk gate. A quarter
  of a wide spread can push a trade through that limit, and the right answer then is the gate
  refusing it — not a quieter concession.

Both are **CHOSEN, NOT MEASURED**, and both say so beside themselves.

**And the ticket shows the book.** The owner's words: *"it is not clear what price to put in
the app, or what the information is, or how to choose it."* It offered a text field with a
number in it and nothing else. It now shows four things, for the **whole structure** and never
leg by leg, because a leg is not a thing anybody here trades:

1. **Combo bid, mid and ask** (`comboBook()`), each leg at the side that actually trades — to
   buy the structure you lift the ask on every leg you are buying and hit the bid on every leg
   you are selling. Summing "the bids" and "the asks" leg by leg would produce two numbers that
   belong to no trade anybody can do. A leg without a two-sided quote means there is **no book**,
   not a book of zeros, and the panel says which leg.
2. **Where the typed limit falls in it** (`limitPlacement()`), with one plain sentence:
   **fills now** / **you are waiting** / **this will not fill**. At the mid is named explicitly
   as the thing that does not fill, because that is the price this app sent.
3. **The model value beside the market value** — the same `modelSanity()` that refuses a
   proposal at the three generation sites. It refuses **nothing** here: the desk is the user's.
   What it owes him is the number he is accepting, in the same size as the one he is accepting
   it against.
4. **Notional controlled** — contracts × 100 × spot — next to capital at risk. The app has
   always computed this implicitly and never once shown it, and the owner reads the product as
   having no leverage because of it. Ten contracts of a $1 spread on a $20 underlying risks
   $1,000 and controls **$20,000**. Both numbers are true and only one was ever on screen.

**Time in force is stated in words, never left as a dropdown.** A `day` order that expires at
the close without anybody saying so is the same invisible failure as an order that never fills.

---

## 10e. An order that is working needs a home in the main flow

`orderOutcome()` has distinguished accepted from filled since §10c, and the position row has
carried the warning. What was missing was anywhere **in the main flow** to see an order that is
working: it lived only on the full desk, inside the Alpaca panel. So the one order this app has
ever sent was invisible from the moment it left — failure class 8, the app knowing and not
saying.

**Working orders are listed first on Positions, above the positions**, because "this has not
happened yet" has to be read before "here is what you own". Each row carries its **age**, its
limit, its time in force, and — when a `day` order is old enough to have outlived its session —
a sentence saying it has almost certainly expired unfilled. They also appear on the front page
beside "what needs attention today", which until now only ever contained things that had
already happened.

**Two things can be done with one, and only two.** **Cancel** it, which is a DELETE and not an
order. Or **re-price** it, which is a new order — and a new order does not get a new path to
the broker: it cancels the old one and lands the trade back on **Build**, where the chain, the
legs, the greeks, the book and the confirm step are. *A road must not be able to reach an order
without passing the screen that shows the trade*, and a re-price is a road. **There are still
six order paths.**

**Sent and filled are two events and they get two Journal entries.** The live order came back
`accepted` with `filled_qty: 0` and the app wrote one entry that read as an opening. `sent` is
written when the order leaves, naming its price and how long it stands; `fill` is written by
`recheckOrders()` when and if the broker says so, and never before. A position opened on the
app's own book has no `sent` entry at all, because nothing was.

---

## 10f. The position did not remember its size — a cap that did not hold

`src/riskGate.js` read `p.contracts` in three places: the 25% total-exposure
ceiling (`openRiskOf`), the dollars a proposal puts at risk (`tradeRiskOf`) and
the 50%-of-max-loss stop threshold. **Nothing anywhere ever wrote that field.**
`commitPosition()` in `App.jsx` built the position record without it, so every
open position counted as ONE contract for the rest of its life however many were
really bought — and the pro ticket, which sizes correctly (`contracts: cfg.qty`),
threw the number away the moment the order was sent.

This is not a display bug. **It is a limit that does not hold.** Four one-lot
$300 positions are $1,200 against a $1,250 ceiling; the same four bought three
lots at a time are $3,600, and the gate would have waved a fifth one through.

### The size has one home, and it is read everywhere

| Where | What it is |
|---|---|
| `contracts` on the position record | written by `commitPosition()`: the broker order body's **`qty`** where an order was sent, the number the **user confirmed** where the app opened on its own book |
| `positionSize(pos)` in `src/journal.js` | the ONE way it is read back — `{ contracts, assumed }` |
| `contracts` state in `App.jsx` | the Build screen's size, above the ticket, the gate preview, the confirm step and the record |

`OrderTicket`'s `cfg.qty` is gone: the ticket is a controlled input on the
screen's own state. That is the whole fix — the quantity used to be known only
by the component that sent the order, which is why everything above it ran at 1.

### TWO COUNTS, TWO UNITS — read on screen by the owner, 18 Sep 2026

The first thing the owner saw after this shipped was a screen contradicting
itself. Position **J-0001** printed, three lines apart:

> `+10 20C / −10 21C`
> ⚠ **1 contract** — assumed, not recorded … every figure below is read as one combination
> `J-0001·02` … the order is working, not filled — **0 of 10 combinations bought**

Every one of those is true, and together they say nothing. The size of that
position is written into its **leg quantities**, and it has been all along:

- `legs` carry a `qty` each. That box on the Build screen is how this app used
  to be sized — a ten-lot vertical was saved as `+10 / −10`. **`analyze()`
  multiplies by it**, so `entryNet`, `maxProfit` and `maxLoss` on such a record
  already hold the ten. `$450` on that row IS the whole position's worst case.
- `orderBody()` divides the legs by their greatest common divisor and puts the
  factor into the order's `qty` (§8b, the "relatively prime" refusal). So the
  broker was asked for `userQty × GCD` combinations of the **reduced** shape,
  which is where the timeline's "0 of 10" comes from.

**So there are two counts and only one of them multiplies the dollars.**

| | what it is | where it shows |
|---|---|---|
| `contracts` | combinations of the structure **as built** — the ticket's own quantity | multiplies `maxLoss`, so it is what the risk gate uses |
| `brokerQty` | `contracts × GCD(legs)` | Alpaca's reply, the timeline entry, the working-orders row |

**And reading the broker's `qty` as the multiplier is a real bug, which this
session shipped and this section fixes.** `commitPosition()` took
`Number(alpacaOrder.qty)` as the size. On `+10 / −10` that is 10, against a
`maxLoss` that already held the ten: **a $450 worst case counted as $4,500** the
moment an order filled. It divides by `reduceRatios(legs).factor` first now,
which puts the reply back into the units `maxLoss` is in. `journal.test.js`
holds both numbers against each other.

**The screen says the broker's count, because that is the one you can check.**
`positionSizeNote()` splits the two cases, because the doubt is not the same:

- **The size is in the legs** (`perCombo > 1`): the app is not guessing. The row
  reads *"10 combinations — the size is written into the leg quantities, so every
  figure below is already the whole position"*, in ordinary grey. The only
  remaining doubt is whether the ticket multiplied it again, and that is one
  clause, not a warning.
- **The legs say nothing** (`perCombo === 1`): a missing `contracts` really is
  unknown between one and any number, the figures really are for one
  combination, and the amber "assumed, not recorded" line is right.

### An assumed one is never a measured one

A position saved by an earlier build carries no size and **there is no way to
recover it**: the order is gone and the record never held it. It is read as one
combination, which under-counts exposure rather than over-counting it — the
direction that refuses trades rather than letting them through. But a 1 nobody
wrote must never print as a 1 somebody chose (failure class 1), so
`withPositionSize()` marks it at hydration the way the `v: 2` pass gives an old
position its ref, `positionSize()` reports `assumed: true` for the rest of its
life, and `positionSizeNote()` is what the Positions row prints: *"1 contract —
assumed, not recorded: this position was opened before the app kept its size, so
every figure below is read as one combination."* The flag survives a round trip
through `localStorage` and `/api/state`, so saving it again cannot launder it.

### Every total on screen is now a total

`entryNet`, `maxProfit` and `maxLoss` are stored **per combination** and stay
that way — they describe the structure, not the trade. The size is what turns
them into what the trade is doing, and it is applied at the boundaries:

- **The P&L on a position row.** Alpaca's `unrealized_pl` is the WHOLE
  position's and the app's own calculation was ONE combination; with everything
  at one lot they happened to agree. Both are totals now, and the take-profit
  and stop comparisons are scaled to match.
- **The exit ladder.** `GuardianPanel.placeExit()` gated and sent `userQty: 1`
  on a position of any size — a rung the screen called the exit would have left
  six lots of a seven-lot position open.
- **The autopilot's close.** Same fault in `autopilot.mjs`, in the proposal it
  gates and in the `orderIntent` it stores for `approve.mjs`.
- **`riskOk` in the Journal** — the app's one measure of discipline — compared a
  per-combination worst case against the per-trade cap, so a position that broke
  the cap seven times over was filed as having respected it.
- **The Build screen says what is per combination.** Above the ticket every
  figure is one combination; when the ticket is set above ×1 a line names the
  totals and says the gate and the confirm step below read the same number.
- **The wizard's road keeps `contracts: 1` deliberately** — a road is built to
  fit the budget answer at one combination (`unit > ans.risk` is that test) — and
  the card says so rather than letting a per-contract figure read as the trade's.

### One model check, not two

`ComboBookPanel` in `pro.jsx` called `modelSanity()` on every render of the
ticket: a Black-Scholes reprice of every leg for each keystroke in the limit
field, and — worse — it re-derived the per-leg marks from `quoteFn(leg).mid`
where the Shortlist passes the ones `analyze()` produced (`legPx[i].px`). Those
are the same number for a quoted leg and **different for one priced off the
model**: the ticket passed `null`, the Shortlist passed the model's own price, so
two screens could name different legs as responsible for one trade.

`modelCheckOf(analysis, { legs, spot, dte, iv })` in `App.jsx` is the single
expression. All three generation sites call it, the Build screen memoises it on
the analysis, and the ticket is handed the answer. **Passed down rather than
memoised inside the panel**, because the ticket owes the user the verdict about
the trade on screen, not a second opinion about it. `riskGate.test.js` fails the
build if `pro.jsx` ever calls `modelSanity` again, and `ceiling.test.jsx` holds
the ticket's reading against the Shortlist's for every preset on one chain.

### And a rule number has one home

`App.jsx`'s `REASON_MIN` was a bare `15` beside `RULES.minOverrideReasonChars`
and was fixed last session. The sweep for the rest of that disease found three
more, all of them `45` where `RULES.targetEntryDTE` lives: the Build screen's
default horizon (`useState(45)`), the wide search's default (`dteT: 45`) and its
fallback (`multi.dteT || 45`). `riskGate.test.js` refuses the SHAPES a copy takes
in this codebase — a `useState` default, a property, a local constant — against
eleven of the rule numbers. It cannot prove there is no copy anywhere; a second
test proves the matcher can still see the ones that were there.

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
| The open-interest **measurement** (`/api/liquidity`) | Alpaca's trading API for `/v2/options/contracts` and the market-data API for the underlying's last trade, aggregated in `netlify/functions/liquidity.mjs` | Not a chain and not an order path: GET-only, aggregate statistics only, no credentials, no account data, no contract-level row, and no `X-OSL-Paper-Endpoint` header for anything to trust. It is where the liquidity floor's two numbers came from (§4b), and how they are re-checked as the market moves. |
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

- ~~Set the two liquidity numbers from the reading.~~ **DONE — the oldest carried-forward debt
  in this file is closed.** `/api/liquidity` was opened against the live broker on the
  2026-09-01 close and the distribution is recorded in §4b. 0.40 and 10 were confirmed;
  `minPeersForPercentile` moved 12 → 8. What is left is not a debt but a habit: **re-run
  `/api/liquidity` when the market has moved** (add `?sym=UNG` for one market, `?near=15` to
  widen the band) and check the §4b table still describes it. Open interest moves with the
  expiry cycle, and this reading was taken two weeks before a September expiry.
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

### WRITTEN THIS SESSION — a rule number can hide in an expression (PR #24)

This session widened the rule-literal guard to a third shape and to every file that computes a
number a screen or a brief prints, used it on the exit simulator, and gave the simulator's
fallback volatility a name (§4g). `npm test` reports **606 checks**, up from **594** measured on
`main` at the start of this session — the twelve new ones are the new `src/engine.test.js` (8)
and four in `autopilot.test.js` — and `npm run build` is clean.

**AND THE COUNT ITSELF IS A CORRECTION.** PR #23 wrote down **588**; the brief that opened this
session said **561**. A clean checkout of `main` at 08eac36, after `npm install`, reports
**594** — seventeen suite totals that sum to it, printed in full. Neither earlier number is
reproducible here, so 594 is what this session treats as ground truth and 606 is measured
against it. A test count nobody can re-derive is the same kind of fact as a rule number with
two homes.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER OR A DEPLOY.** Same wall as PR #15
through #23: no broker keys in this sandbox, no Anthropic key, and the egress proxy refuses the
CONNECT. Every number in §4g's table comes from the app's own model with a seeded generator, and
every statement about the autopilot's brief is a statement about its source text. **The autopilot
has never been watched running with this change in it**, and the corrected brief — the one whose
`p_exit_at_exit_dte_positive` is finally computed at 21 DTE — has not been read by anybody.

- **THE SIMULATOR WAS WRONG FOR FOUR PULL REQUESTS AND NOBODY NOTICED, WHICH IS THE REAL
  FINDING.** The fix is arithmetic and it is tested. What is not known is how much of the
  autopilot's past prose was built on it: every brief the owner has ever received described the
  chance of being positive "at the exit rule" at a horizon fourteen days past the rule. Those
  briefs are in the Journal and they are wrong in a way nothing in the app marks. **No brief has
  been re-read against this.**
- **THE BEFORE/AFTER TABLE IS THE APP'S MODEL TALKING TO ITSELF.** The fixtures are priced with
  `netBS` at the hand-written `SIGMA` (§4g), walked at that same hand-written volatility, and
  seeded so the run reproduces. It proves the change moved the numbers and in which direction. It
  proves nothing about whether either set of numbers describes a real market, and the honest
  reading of `ev` moving DOWN on BOIL while it moved UP on the other two is that `ev` was never a
  one-directional quantity, not that one of them is wrong.
- **`fallbackSigma` (0.25) IS CHOSEN, NOT MEASURED — and so is the whole table behind it.** This
  session named the fallback and made the brief carry which of the two was in force. It did NOT
  fix `SIGMA` in `engine.js`, which is five hand-typed numbers driving every probability the
  simulator prints, for markets whose realised volatility nobody has computed here. That is
  ROADMAP P2's house distribution.
- **THE GUARD STILL CANNOT PROVE A NEGATIVE, AND NOW IT CANNOT CATCH A STALE COPY EITHER.** It
  refuses three shapes across fourteen rule numbers. The bare 7 was not any rule's value, so no
  matcher could have named it — what the widened guard caught was the two `0.5`s beside it. A
  copy written as `Math.round(44.9)`, or inside a template string, still passes.
- **THREE UN-HOMED NUMBERS WERE FOUND AND DELIBERATELY NOT FIXED**, because each one needs a
  product decision rather than a rename, and a guard that names the wrong rule is worse than one
  that stays quiet:
  - `App.jsx` draws a position's attention level at `pnl < 0.35 * p.maxLoss * n` — a "watch"
    badge whose 0.35 has no home and collides in value with `maxSpreadShareOfMid`, which is why
    that constant is the one rule number deliberately kept off the sweep list.
  - `signals.js` writes "this clears the 70-confidence bar the autopilot needs" in two generated
    sentences, guarded by `confidence >= 70`. Nothing in `RULES` holds that bar; its value
    collides with `expensiveIVRank`. The file is excluded from the sweep by name for that reason.
  - `autopilot.mjs` and `pro.jsx` still fall back to a bare `0.25` for **implied volatility**
    (`m?.iv ?? pos.thesis?.iv ?? 0.25`, `ivNow || 0.25`). That is a different quantity from the
    simulator's sigma and was left alone rather than conflated with it.
- **`chainAlpaca.mjs` AND `visuals.jsx` WERE CORRECTED BY THE WIDENED SWEEP AND NEITHER WAS
  RE-RUN.** The debug endpoint's `?debug` payload now reports `nearestTarget` instead of
  `nearest45` (nothing in the app reads it, and nothing has called it since), and
  `UnifiedPosition`'s default `dte` is `RULES.targetEntryDTE` instead of a bare 45 — a default
  that only applies when a caller passes no horizon, which no screen currently does.

**CARRIED FORWARD FROM PR #23, UNCHANGED — a sandbox cannot close any of them:**

1. **No multi-lot ticket has been read on a phone.** The size is one piece of state and every
   consumer reads it, in tests; the Build screen at ×5 with the per-combination warning, the
   confirm step saying "5 combinations" and the gate refusing the sixth have not been seen.
2. **No position has ever been opened above one lot**, so `contracts` has never held a real
   number from a fill.
3. **The corrected legacy-migration screen has not been re-read.** The rows should now say "10
   combinations" and "5 combinations" in grey, with `$450` and `$577` unmoved.
4. **The broker's P&L and the app's have never been compared live** at a size above one.
5. **No closing order of any size has ever been sent.**
6. **The re-price round trip has never been walked.**

Each of these is written out in full in the section below, which is PR #23's own list and stays
open word for word.

### WRITTEN BY PR #23, STILL OPEN — the position that did not remember its size

*(Left as PR #23 wrote it, "this session" and all. Its check count is one of the two numbers PR
#24 could not reproduce: see below.)*

This session did TASK 0 (the four items ROADMAP P0 left open and a sandbox could close)
and the quantity half of ROADMAP P1: the position record now carries `contracts`, the risk
gate runs at the quantity that will actually be sent, an assumed size is never printed as a
measured one, and the order ticket's model check is one expression shared with the three
generation sites (§10f). `npm test` reports **588 checks**, up from 564 — the 24 new ones
are in `riskGate.test.js`, `journal.test.js` and `ceiling.test.jsx` — and `npm run build`
is clean.

**WHAT THIS SESSION COULD NOT VERIFY, AND IT IS THE SAME WALL AS PR #15 THROUGH #21.**
Nothing here was run against a live feed, a browser or a deploy: no broker keys in this
sandbox, no Anthropic key, and the egress proxy refuses the CONNECT to the deploy preview.
Everything below is reasoned and unit-tested, not read on a screen.

- **NOBODY HAS TYPED A QUANTITY ABOVE 1 INTO THE TICKET AND WATCHED THE SCREEN AGREE WITH
  ITSELF.** The size is one piece of state now and the gate preview, the confirm step, the
  order body and the position record all read it — in tests. What has not been seen is the
  Build screen at ×5 with the per-combination warning under the stats, the confirm step
  saying "5 combinations", and the risk gate refusing the sixth because $300 is past a $250
  cap. That last one is the behaviour that matters and it is exactly what a beginner will
  read as the app breaking.
- **NO POSITION HAS EVER BEEN OPENED ABOVE ONE LOT, SO THE FIELD HAS NEVER HELD A REAL
  NUMBER.** `commitPosition()` takes the broker order body's `qty` as the authority. The one
  order this app has ever sent was ten lots and it never filled, and no order has been sent
  since the field existed. The first multi-lot fill is what proves this.
- **THE LEGACY MIGRATION RAN, AND IT WAS WRONG ON SCREEN THE FIRST TIME.** This is the one
  item on this list that has now been READ on a real phone, and it failed: both of the
  owner's positions showed "1 contract — assumed, not recorded" over legs reading `+10/−10`
  and `+5`, beside a timeline saying "0 of 10 combinations bought". The cause was two
  different units for "how many" and is fixed above (§10f, TWO COUNTS, TWO UNITS), together
  with a real arithmetic bug it exposed. **What has NOT been re-read is the corrected
  screen**: the rows should now say "10 combinations" and "5 combinations" in grey, and the
  dollar figures must not move — `$450` and `$577` were already the whole position.
- **THE P&L ON A POSITION ROW IS NOW A TOTAL, AND THE TWO SOURCES HAVE NEVER BEEN COMPARED
  LIVE.** Alpaca's `unrealized_pl` was always the whole position's and the app's own
  calculation was one combination; with everything at one lot they agreed by accident. They
  are both totals now. **Nobody has watched a linked position show the broker's number and
  the app's number side by side at a size above one**, which is the only way to find out
  whether `unrealized_pl` means what this assumes it means.
- **THE EXIT LADDER AND THE AUTOPILOT NOW CLOSE THE WHOLE POSITION, AND NEITHER HAS SENT
  ONE.** `placeExit()` and `autopilot.mjs` both sent `userQty: 1` whatever the size. They
  send `contractsOf(pos)` now. No closing order of any size has ever been sent (see below),
  so this is a correction to a path that has never been walked.
- **`contracts` IS RESET TO 1 WHEN THE TICKER, THE EXPIRY OR A HAND-OFF CHANGES, AND THAT
  IS A JUDGEMENT.** A size typed against a butterfly is not an answer about the vertical
  that replaced it. But it also means a user who sets x5, changes one strike (no reset) and
  then changes the expiry (reset) will see it silently go back to 1. Nobody has used it.
  **The one exception is a RE-PRICE**, which hands the size back because it is the same
  trade at a new price, and it is held by a ref so the reset cannot undo it. If the expiry
  arrives LATER than the hand-off — the chain was not loaded yet — the key changes and the
  size does go back to 1. That is the safe direction (a smaller order, and the message on
  screen names the size it came back at) and it is still wrong. **The re-price round trip
  has never been walked**, which is item 9 on the carried list below, so this has not been
  seen either way.
- **THE RULE-LITERAL TEST CANNOT PROVE A NEGATIVE.** It refuses the three shapes a copy
  actually took in this codebase — a `useState` default, a property, a local constant —
  against eleven rule numbers. A copy written as `Math.round(44.9)` or hidden in a template
  string would pass it. A second test proves the matcher still sees the ones that were
  there, so it is a guard rather than a decoration, but it is not a proof.

- **CLOSED THIS SESSION: THE PWA IS INSTALLED ON THE OWNER'S PHONE AND IT WORKS.** Everything
  the last session opened about the install — Android's "Install app" never tapped, no tile
  ever on a home screen, the manifest never fetched without credentials from behind the real
  gate, `/sw.js` never watched registering there, the icon never seen on a home screen among
  other icons — is answered by the owner having done it. Those items are removed from this
  list rather than reworded: they were questions about whether the thing works, and it does.
  Two PWA items are NOT closed and stay below, because installing does not answer them.
- **THE 4x MODEL RATIO IS CHOSEN, NOT MEASURED** (opened by the previous session, carried
  forward unchanged — this one moved to `modelCheckOf()` and the NUMBER did not move).** `RULES.modelDisagreementRatio` refuses a proposal whose price off the chain is more
  than four times away from `netBS()` either way. The task asked for the ratio to be read off
  the five live chains — the distribution of market-net over model-net near the money,
  tabulated the way `LIQUIDITY_MEASUREMENT` is. **That reading was not taken.** There are no
  broker keys in this sandbox and the egress proxy refuses the CONNECT to `/api/liquidity`,
  `/api/chain`, `cdn.cboe.com` and the deploy preview, exactly as it has since PR #15.

  What WAS measured, here, and is in the comment beside the constant: the DENOMINATOR'S error
  budget. Every structure family the app builds, on all five markets, at 30/36/45/60/90 days
  and five strikes either side of the money, repriced with the assumed volatility deliberately
  wrong by up to a factor of two — call verticals 0.39..1.68, put verticals 0.41..2.33,
  butterflies 0.59..1.87, iron condors 0.27..2.83. Four is outside all of it, and the live
  failure (BOIL 20/21, market $0.05 against a model $33.29) sits at 0.15, outside four by
  1.67x. So the bar tolerates every artefact the app's own model can produce and still catches
  the one real fault. **The honest expectation is that a real reading brings it DOWN**, because
  a genuine chain should sit near 1 and nothing here knows how near. Until somebody takes it,
  a structure that is really mispriced by a factor of three is still offered.
- **NO OPENING ORDER HAS EVER BEEN FILLED ON THE PAPER ACCOUNT, AND THIS SESSION CANNOT PROVE
  OTHERWISE FROM A SANDBOX.** One order has ever reached the broker: BOIL 2026-10-23, buy 10x
  20C / sell 10x 21C, limit $0.05, day — status "new", filled 0.00, never filled. Both causes
  are fixed in code (the price would now be refused by `modelSanity()`, and the limit would now
  concede a quarter of the spread instead of sitting at the mid), and **neither fix has been
  watched working against Alpaca.** Only a fill on the owner's account closes this. It is
  ROADMAP P0's DONE WHEN, and it is the one item on this list that the owner alone can settle.
- **THE OPENING CONCESSION IS CHOSEN, NOT MEASURED, EXACTLY LIKE ITS SIBLING.**
  `RULES.openLimitSlippage` is 0.25 and its reasoning is written down beside
  `closeLimitSlippage`, whose own comment has said the same thing since PR #19. The measurement
  that would settle either is how often a limit a quarter of the spread off the mid fills
  within a session on these five markets, and nobody has taken it. **There is now a second
  place that number is load-bearing**, and a second reason to take it.
- **THE COMBO BOOK HAS NEVER BEEN DRAWN FROM A LIVE CHAIN.** `comboBook()` takes each leg at
  the side that actually trades and `limitPlacement()` says which of three zones a typed price
  falls in. Both are unit-tested against the BOIL-shaped 145%-of-mid market and a tight one;
  neither has been rendered next to a real quote, and nobody has checked that the numbers the
  panel prints match what Alpaca's own ticket shows for the same structure.
- **NOTIONAL CONTROLLED IS ARITHMETIC AND IT IS RIGHT; WHETHER IT CHANGES ANYTHING IS NOT
  KNOWN.** The point of putting contracts x 100 x spot next to capital at risk is that the
  owner reads the product as having no leverage. Whether seeing "$19,840 of BOIL moves under
  this trade" beside "$500" actually changes how he sizes is a claim about a person, and it
  has not been read on a screen by the person it is about.
- **THE WORKING-ORDERS PANEL HAS NEVER HAD A WORKING ORDER IN IT.** It lists positions whose
  `alpacaFilled` is false, with age, the limit, the time in force, **how many combinations are
  waiting** (new this session, §10f) and whether a DAY order is old enough to have expired.
  Every one of those fields comes from a reply the app stored, and **no reply has been stored
  since the fields were added.** The stale-DAY-order warning fires
  after eight hours by a clock, not by a session calendar: on a weekend, or a holiday, it will
  say an order has almost certainly expired when the session it was sent in has not opened yet.
  That is the safe way round to be wrong and it is still wrong.
- **RE-PRICING CANCELS AND RETURNS TO BUILD, AND THAT ROUND TRIP HAS NOT BEEN WALKED.** It is
  deliberately not a seventh order path: it cancels at the broker and lands the trade back on
  the screen that shows it, so the send goes down path 2 like everything else there. What has
  not been seen is the cancel failing and the hand-off happening anyway — the code awaits the
  cancel, but `cancelWorking` swallows a broker error into a message, so a failed cancel still
  reaches Build. If that happens the old order is still live at Alpaca while a new one is being
  built, and the only thing that stops two orders existing is the user reading the message.
- **THE ENTRY-ROOM OVERRIDE HAS NEVER BEEN TYPED INTO.** The three bands are unit-tested at the
  gate and the rule functions are tested directly. Nobody has been shown a 25-DTE board, written
  a reason, and watched the trade unlock — and nobody has checked that the Journal entry reads
  well next to the against-the-signal one, which uses the same mechanism and the same constant.
- **AND THE 30 IS STILL UNCALIBRATED. THAT IS THE POINT OF THE INSTRUMENT, NOT AN OVERSIGHT.**
  `minEntryDTE` was not changed this session, deliberately. `passedOverRecord()` now writes one
  row per market per board into `store.expiryLog` and the Journal reads it back, so a later
  session can see how often the floor took a busier board away and by how much. **That log is
  empty.** It fills as the owner uses the app and it is what ROADMAP P5 calibrates from; until
  then 30 remains an inherited tastytrade default that this app has never tested.
- **THE OFFLINE BANNER IS `navigator.onLine`, WHICH IS NOT THE SAME QUESTION** (carried, and
  installing did not answer it). The browser reports whether it has a network interface, not
  whether it can reach this site. A phone on a captive-portal wifi reports itself online and
  the banner stays away while every fetch fails and the screens print dashes.
- **THE BUILD STAMP HAS NEVER SURVIVED A SECOND DEPLOY** (carried, and installing did not
  answer it either — if anything it is now the live question). `stampServiceWorker` was watched
  changing the cache version locally when the bundle changed. What has not been observed is the
  sequence that matters: deploy, install, deploy again, and watch the phone pick up the new
  shell rather than keeping the old one. **The app is now on a real home screen, so the next
  deploy is the first time this can fail for real.**

### CARRIED FORWARD BY THIS SESSION, WORD FOR WORD — none of these is closed

This session was handed nine debts by name and told not to attempt them and not to drop
them: **they need broker keys, a browser or a deploy, and this sandbox has none.** They are
restated here as open, in the order they were handed over, and each one is written out in
full further down this list:

1. **No opening order has ever been FILLED on the paper account.** ROADMAP P0's DONE WHEN.
2. **No closing limit order has ever been SENT.** Still the single biggest thing open.
3. **`modelDisagreementRatio` (4x) is CHOSEN, not measured.**
4. **`openLimitSlippage` (0.25) is CHOSEN, not measured.**
5. **`closeLimitSlippage` (0.25) is CHOSEN, not measured.**
6. **The combo book has never been drawn from a live chain.**
7. **The working-orders panel has never held a working order.** — and it now prints the
   position's SIZE on each row, which is one more field on it nothing has ever filled.
8. **The entry-room override has never been typed into.**
9. **The re-price round trip has never been walked.**
10. **`store.expiryLog` is empty, so `minEntryDTE` (30) stays uncalibrated.** That is
    ROADMAP P5, and the log fills only as the owner uses the app.
11. **The Journal has never been opened against a state the app itself wrote over weeks** —
    and this session made that debt LARGER, not smaller: positions now carry `contracts`
    and `contractsAssumed`, the closed Journal entry keeps both, and the owner's existing
    book will hydrate into a shape that has never held real history.
12. **The build stamp has never survived a second deploy on the installed PWA.**

Everything on this list needs a live feed, a browser on the owner's phone, a deploy or
broker keys, and this sandbox has none of them — the egress proxy refuses the CONNECT,
exactly as it did for PR #15 through #21.

- **RESTATED, AND STILL THE SINGLE BIGGEST THING OPEN: NO LIMIT CLOSE HAS BEEN ACCEPTED BY
  ALPACA, AND NONE HAS BEEN SENT.** This is the single
  biggest thing open. `approve.mjs` now fetches a chain at tap time, prices the close and posts
  `orderBody({ type: "limit" })`. Every piece of that is unit-tested against a fixture — the
  BOIL 145%-of-mid market, the tight market, a leg with no bid — and **the endpoint has never
  been run.** There are no broker keys here and there never have been; the egress proxy refuses
  the CONNECT, as it did for PR #15, #16, #17 and #18. What has NOT been watched: the broker
  accepting a limit mleg close at all, whether `limit_price` is read as the net of one
  combination on a CLOSE the way the app assumes it is on an open (the same unverified reading
  the last session flagged, now load-bearing in a second place), and whether a limit a quarter
  of the spread off the mid actually fills on these chains or simply sits. **The symptom to
  look for is a close that never fills at a price it obviously should have** — the division is
  still the safe way round to be wrong.
- **`CLOSE_LIMIT_SLIPPAGE` IS CHOSEN, NOT MEASURED.** 0.25. It is the only number in `RULES`
  that comes from neither published research nor a reading off the live chains, and its comment
  says so. The reasoning is written down (a quarter, because half the spread IS the far side of
  the market) and it has been tested against nothing. **The measurement that would settle it is
  how often a close at mid-minus-a-quarter-of-the-spread fills within a session on these five
  markets, and nobody has taken it.** It stays on this list until one does.
- **RESTATED: THE JOURNAL HAS NEVER BEEN OPENED AGAINST A STATE THE APP ITSELF WROTE OVER
  WEEKS — ONLY AGAINST A SEEDED BOOK.** A previous session drove `vite preview` in headless
  Chromium at 390x844 with two closed trades, a nine-entry timeline and two real-shaped
  36-character Alpaca order ids, and measured 0px of horizontal overflow at every stage. That
  settled the LAYOUT under a realistic load and it settled nothing else: the book was written
  into `localStorage` by the walk script. Refs that jump or repeat, a sequence that a
  `/api/state` merge shuffles, a position opened by an older build and given its ref at
  hydration — none of that shows up against a book written all at once by a script. **The
  first load after this ships, against the owner's real `localStorage`, is what proves it.**
  This session made the debt slightly larger rather than smaller: the timeline now carries two
  new entry types (`sent` and `fill`) and one new one (`override`), and positions carry five
  new fields, so an existing book will hydrate into a shape that has never held real history.
  `{ ...EMPTY, ...st }` defaults the new `expiryLog` to an empty array and every read of the
  new position fields is null-guarded, which is the reasoning, not the evidence.

- **THE STOP CHANGE HAS NOT BEEN SEEN IN A BRIEF.** The verdict logic is unit-tested against
  the crossing that used to produce `STOP` and its link (−110 on a −210 maximum loss). The
  webhook has not fired here, so nobody has read the sentence *"Stop threshold crossed — not
  validated by backtest"* in an actual brief on a phone, and nobody has confirmed the model
  stops returning STOP now that the prompt no longer offers it — **a prompt change is not a
  model behaviour until a model has answered it.**
- **THE MODEL-PRICE PATH HAS NOT BEEN TRIGGERED LIVE.** `markProvenance(null, …)` is exercised
  from a fixture. What has not happened is a real run where CBOE is missing one leg of a real
  position, so nobody has read the estimate banner in a brief, and nobody has watched the
  approve link NOT be issued on a day when the old code would have issued one.
- **NOTHING RE-READ AN ORDER AGAINST A REAL BROKER EITHER.** The debt from last session is
  closed in code and not on a screen: the `accepted` → `filled` transition is the payload the
  owner reported, rebuilt, and the test proves the app writes one entry and then stops writing.
  **Nobody has left an order in Alpaca's queue overnight and watched the row change in the
  morning.** Nor has the failure path been seen: a broker that cannot be reached is deliberately
  silent, and "silent" is exactly what a bug looks like.
- **THE MIGRATION OF AN EXISTING BOOK IS UNTESTED AGAINST A REAL SAVED STATE.** Positions
  opened by an older build are given refs and sequences at hydration. That path is tested with
  a hand-built object; it has not been run against the owner's actual `localStorage` or the
  `/api/state` blob, and the first load after this ships is what proves it. If it is wrong the
  symptom is refs that jump or repeat, and the counter is stored so it cannot repeat twice.
- **PARTIAL FILLS ARE STILL UNTESTED AGAINST REALITY**, unchanged from last session. The
  re-read reports one honestly and still records ONE position for the whole intended size.

- **THE INHERITED DEBTS ARE STILL OPEN, EXCEPT ONE.** This session started by reading the
  last one's list, as the standing rule requires, and closed **"nothing re-reads
  `alpacaStatus` after the fact"** — in code, with the caveats above. Everything else on it
  needs a live feed, a browser, a deploy or broker keys, and this sandbox has none of them:
  the egress proxy refuses the CONNECT, exactly as it did for PR #15, #16, #17 and #18.

- **NOTHING IN THIS SESSION WAS RUN AGAINST A LIVE FEED, A BROWSER OR A DEPLOY EITHER.** The
  same wall as PR #15 and #16: the sandbox's egress proxy refuses the CONNECT to the deploy
  preview, there are no broker or Anthropic keys here, and no screen was opened. The fault
  being fixed was READ ON A SCREEN by the owner and the fix has not been read back on one.
- **THE MEASUREMENTS ARE THE OWNER'S, NOT THIS SESSION'S.** Every number driving the previous
  session's TASK 1, 2, 3 and 5 — CORN's eight wrong months, BOIL's three expiries, the four
  spreads, the five monotonicity breaks, the 20.19-versus-20.22 spot — and every number driving
  this session's change — the 2026-09-04 board at 0 DTE with 16 of 16 clearing, the live
  2026-10-16 pick, the 26-over-25 monotonicity break — was captured by the owner and reproduced
  from the brief. No session has re-read any of them and none can. They are written into the
  code as the reasoning beside each constant and into the tests as fixtures, so if any of them
  is wrong the comment and the test are wrong with it.
- **CLOSED ON THE LIVE PREVIEW (owner, 2026-09-04): THE EDGE-FUNCTION ORDER QUESTION IS
  SETTLED — ACCESS IS ENFORCED.** `/api/ai` answers **"POST only"** when authenticated and the
  **password gate** when not. That is the whole finding the previous session asked for: an
  unauthenticated request never reaches the Anthropic proxy, whichever of the two edge
  functions ran first. The order itself remains undocumented here — Netlify's own docs are
  still unreachable from a sandbox — but it no longer matters to security, which was always
  the point of `ai.js` checking `lib/access.js` itself. The contingency the last session wrote
  down (delete the `[[edge_functions]]` block for `ai` and put its body back behind a
  `/api/ai` redirect) is **not needed and can be forgotten**.

  What the deploy had already proved, and still holds: both `[[edge_functions]]` declarations
  are valid TOML that Netlify accepts, both files bundle, and the relative import of
  `./lib/access.js` RESOLVES — a subdirectory inside `netlify/edge-functions/` is treated as a
  module rather than as a third edge function.
- **CLOSED ON THE LIVE PREVIEW (owner, 2026-09-04): THE TEN-SECOND WALL IS GONE.** A pre-trade
  analysis was run against the real Anthropic endpoint and **reached its verdict with no
  "CUT OFF" label and no "RAN OUT OF ROOM" label**. So the move from a synchronous function to
  the edge did what it was for — a 1200-token answer written for a non-expert now has room to
  finish — and the 1200-token budget is not binding on an analysis of that size either. The
  final `sseDeltas(buf, { final: true })` flush and the `stop_reason` check are no longer held
  down only by hand-built frames: a real stream has now ended cleanly and been reported as
  ended cleanly.
- **THE SEVEN-DAY AV CACHE HAS NEVER SERVED A HIT.** `av.mjs` writes to the blob store the
  autopilot already uses; that path is untested here because the store is not reachable from the
  sandbox. Every touch of it is wrapped so a missing store degrades to "no cache", but the WARM
  path — and the stale-on-failure path that matters most during a demo — has only been reasoned
  about. Watch for it: the second market to load should be near-instant.
- **NO SEASONAL SERIES WAS EVER FETCHED.** The client now loads all five markets at startup, and
  `statsFromMatrix()` is unchanged code that was already in use — but whether Alpha Vantage
  actually returns five series inside the quota, and what the real monthly means come out at for
  the four markets nobody has measured, is unknown. **Only CORN has been checked, by the owner,
  and only against the hand table.** UNG, BOIL, SOYB and WEAT may be as wrong.
- **CLOSED ON THE LIVE PREVIEW (owner, 2026-09-04): THE EXPIRY RULE HAS NOW PICKED AN EXPIRY ON
  A REAL CHAIN, AND THE BOARD IT PICKED WAS BUILDABLE.** On the real BOIL chain `expiryChoice()`
  selected **2026-10-16 (42 DTE)** and the Shortlist showed **2 of 2 structures at RECOMMENDED**.
  That is the single observation the task was for: the app no longer opens on a board its own
  floor empties, and the Radar-says-four / Shortlist-says-none contradiction had one cause and it
  was the expiry, not the floor.
- **AND `maxSpreadShareOfMid` AT 0.35 DOES NOT EMPTY THE APP.** Same run, same board: 2 of 2
  survived with the spread floor in force, so the first suspect the last session named — "if the
  Shortlist is suddenly empty everywhere, this is it" — is ruled out on BOIL, the thinnest market
  in the basket. One board is not five, so this is evidence rather than a settlement; what it
  removes is the fear that the number was set so tight nothing could ever clear it.
- **AND THE MONOTONICITY WARNING FIRED LIVE.** On that same 2026-10-16 board the **26 call priced
  above the 25**, and `monotonicityBreaks()` said so on screen. It has now done in production
  exactly what it was written for: name a chain whose own prices contradict each other instead of
  quietly pricing structures off it.
- **WHAT THE 2026-10-16 RUN DID NOT SETTLE.** It is ONE market on ONE day. The other four markets
  have not been watched choosing an expiry, and no session has yet seen the four liquidity
  settings moved against a real chain and read what each does to a real Shortlist.
- **`expiryChoiceNote()` NAMED A BOARD THAT SETTLES TODAY, AND THAT IS FIXED (this session).**
  The same live screen offered "2026-09-04 is busier — 16 of 16 clear — but it is only 0 days
  out" as the passed-over alternative. Nobody weighs a 45-day position against a contract with
  hours left on it, so on the main screen that read as a bug rather than as a rule explaining
  itself. `expiryChoice()` now excludes anything at or below `SETTLING_DTE` (1 DTE) from
  `passedOver` entirely; on the owner's boards 2026-09-18 (19 of 23) is named instead. **The
  choice itself is untouched** — a settling board was never eligible — and this is verified by
  test, not on screen: nobody has re-read the sentence on the live preview.
- **`maxSpreadShareOfMid` (0.35) AND `maxEntryDTE` (90) ARE JUDGEMENTS.** Like
  `scratchPayoffShare`, and unlike the liquidity floor, nothing was read off a broker to choose
  either. The reasoning is written beside both and 0.35 refuses all four measured BOIL spreads
  while passing a normal market — but it has not been run across five chains to see how much it
  removes. **If the Shortlist is suddenly empty everywhere, this is the first suspect**, and
  `/api/liquidity` is the endpoint to extend with a spread distribution to settle it properly.
- **THE PROBABILITY FORMATTER UNIFIES THE ROUNDING, NOT THE ARITHMETIC.** "44% / 45% /
  5 times in 10" had two causes. One rounding is now one function, everywhere. But `mc.pop`
  (8,000-run Monte Carlo), `r.pop` (`probProfit` on a curve) and `chanceInProfit` (band
  integration) are still three different calculations of "the chance", and two of them on one
  screen can still differ in the first decimal. Changing that is arithmetic, and TASK 6 was
  copy only. **It is the obvious next debt**, and it is now written down as the half of
  ROADMAP P1 this session did not do: the quantity half is shipped (§10f), the three
  probabilities are still three calculations.
- **THE GATE'S `IMPOSSIBLE_LOSS` INHERITS THE GRID'S BLIND SPOT.** The note below about a very
  wide short structure now applies to the gate as well as the generation sites: a hand-built
  condor whose short strikes sit beyond ±30% of spot reports a maximum-inside-the-window, and
  can trip the refusal as a false positive. Computing both extremes from the STRIKES is still
  the real fix.

- **CLOSED THIS SESSION:** PR #14's *"a structure whose maximum loss is POSITIVE is still
  offered"* — `impossibleLoss()` now refuses it at all three generation sites (§4c).
- **CLOSED THIS SESSION:** *"the positive-max-loss case has never been seen on a real board"*.
  **IT IS LIVE.** On BOIL 2026-10-09, captured by the owner on 2026-09-03T17:57Z, SIX call
  pairs price a bull call spread as a CREDIT: buy 19 / sell 19.5 nets **-0.290**, buy 22 /
  sell 22.5 nets **-0.171**. A debit spread taken in for a credit cannot lose at expiry. The
  refusal is no longer a hypothetical about a hand-built quote.
- **CLOSED THIS SESSION:** *"the positive-max-loss test is not in the risk gate"*.
  `evaluateTrade()` refuses it by name (`IMPOSSIBLE_LOSS`), entry-only, and the sign trap the
  note warned about is handled and tested in both directions: the check reads the SIGNED
  figure, the dollar limits around it keep reading `Math.abs`, and a CLOSING order carrying a
  positive magnitude (`closeGroup()` sends the cost basis) is never sign-tested.
- **THE GRID CAN STILL MISREAD A VERY WIDE SHORT STRUCTURE.** `maxLoss` is deliberately left
  as the minimum over ±30% of spot (rule 2 was not to be weakened, and the presets all break
  inside ±12%). A hand-built condor whose short strikes sit beyond ±30% would report a maximum
  loss that is really a maximum-inside-the-window — and would then trip the new arbitrage
  refusal as a false positive. Computing both extremes from the STRIKES rather than the grid
  is the real fix and was out of scope here.
- **`scratchPayoffShare` (0.20) IS A JUDGEMENT, NOT A MEASUREMENT.** Unlike the liquidity
  floor, nothing was read off a broker to choose it. The reasoning is written beside it and it
  only ever changes a sentence, but it has not been tried against a spread of real structures
  to see whether it calls the shoulders of a butterfly a scratch too readily.
- **THE DEPLOY PREVIEW EXISTS AND CANNOT BE REACHED FROM A SANDBOX.** PR #15 built and
  deployed cleanly to `deploy-preview-15--strategy-lab-optiontrading.netlify.app`, which is
  the one place these screens can be read against a REAL chain with real keys. The session
  that wrote them could not open it: the sandbox's own egress proxy refuses the CONNECT, the
  same wall that made an earlier `/api/liquidity` attempt prove nothing. **Only the owner can
  close the live-walk debts below.** What to look at, in one pass on a phone: the Shortlist
  for a Very Bull market, where a Long Call ATM must read MAX PROFIT `no ceiling` and R/R `—`,
  and the same trade on Build, where MOST YOU CAN MAKE, TP 50% and the BREAKEVEN string must
  agree with the Shortlist to the penny.
- **THE 390px RE-WALK WAS AGAINST A STUBBED BOIL BOARD.** Radar → Look at BOIL → Very Bull →
  Shortlist → Build was driven in Chromium at 390px: the Long Call ATM printed MAX PROFIT
  **no ceiling**, R/R **—**, TP 50% **—**, the exit plan named the 21-day mark instead of a
  dollar target, both screens printed BREAKEVEN **22.87** (and 21.67 for the spread), 0 page
  errors and 0px horizontal overflow. But the chain and the bars came from a local stub server
  written for the walk, so the STRINGS are verified and the live feed is not.
- **THE UNG SENTENCE WAS REPRODUCED, NOT OBSERVED.** The scratch takeaway is tested against
  the broken-wing butterfly from the report (+1 10.50C / -2 11.00C / +1 12.00C, $1 credit,
  spot 10.57) rebuilt from those figures. Nobody has seen the new sentence on the live site
  next to the old one.
- **THE REPORT'S SECTION 5 HAS NOT BEEN RE-GENERATED.** The prompt is fixed and tested, but
  running it needs `ANTHROPIC_KEY`, which this sandbox does not have. What is proven is that
  the prompt text changes with an empty book and names `paperPositions` as authoritative — not
  that the model then obeys it.

- **THE READING IS ONE DAY, AND IT IS NOT A QUIET ONE.** The floor is measured now, but from
  the 2026-09-01 close — roughly two weeks before a September expiry, with the front month fat
  and the back months thin. Open interest moves with the cycle, so the §4b table describes that
  day and not every day. Re-run `/api/liquidity` mid-cycle and check the sevenfold spread and
  the per-market bars still look like the table.
- **THE REJECTION RATE IS BOUNDED, NOT COMPUTED.** The endpoint returns quantiles and no
  contract-level rows — deliberately, so no raw chain leaves it — which means how many
  near-the-money strikes the 40th percentile actually removes can only be estimated between the
  quartiles it reports. On BOIL, the thinnest market, that bound is roughly a quarter to a half
  of its near-the-money strikes, and a spread needs EVERY leg to clear. **Watch BOIL first if
  the Shortlist starts coming up empty**; the `OpenInterestReadout` on step 2 is where it shows.
- **NOTHING HAS WATCHED THE FLOOR RUN AGAINST A LIVE CHAIN.** The constants are measured and the
  arithmetic is tested, but the app itself has still only been driven against stubs: no session
  has loaded a real chain, seen `expiryOpenInterest` build a real peer set, and read what the
  four settings then do to a real Shortlist. That is the next thing worth a screenshot, and it
  needs no new code.
- **`/api/liquidity` has been run exactly once.** It worked first time — one page per market,
  nothing truncated, no market erroring, comfortably inside its 8-second budget. A quieter or
  busier day may page differently, and the per-market error path (`{ market, error }` beside the
  markets that worked) has never actually fired.
- **The password gate over `/api/liquidity` is confirmed by use, not by test.** The owner opened
  it behind the site password and it answered; nobody has watched it refuse an unauthenticated
  request. An earlier attempt from a sandbox proved nothing — the 403 was that sandbox's own
  egress proxy refusing the CONNECT, and `example.com` returned the identical 403.
- **The live Anthropic call — CLOSED (owner, 2026-09-04).** A pre-trade analysis completed
  against the real endpoint with no CUT OFF and no RAN OUT OF ROOM label, so the streaming
  copilot is no longer proven only against a simulated stream. Still unwatched from a sandbox:
  there is no `ANTHROPIC_KEY` here and there never has been, so every future change to
  `ai.js` or `sseDeltas()` is again the owner's to confirm on the preview.
- **The live open-interest call — HALF of this is now settled.** `/api/liquidity` read
  `/v2/options/contracts` from the real broker, so the request shape, the `open_interest` /
  `open_interest_date` fields and the fact that the count arrives as a STRING are all confirmed
  against Alpaca rather than against a stub. What is still unproven is the CLIENT'S path to the
  same data: `fetchOpenInterest` reaches it through the `/api/alpaca` proxy with its own
  3.5-second budget and its own paging, and that has still only been driven against a stub.
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
