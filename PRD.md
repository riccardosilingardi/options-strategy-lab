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

**AND THE TABLE WAS ONLY HALF THE PROBLEM — SEE §4k.** `sigmaProvenance()` knew two sources and
the app had a third all along: `statsFromMatrix()` returns the MEASURED realised volatility of the
monthly series, `App.jsx` stored it and handed it to the Guardian, and `autopilot.mjs` could not
reach it. One position, two volatilities. PR #27 closes that.

---

## 4h. One chance, one arithmetic — and the Monte Carlo is the one

### THE FAULT

This app computed "the chance of profit" **four different ways**, and the real difference between
them was never the algorithm. It was the **drift** — the assumption each one made about which way
the market is expected to move while the trade is open.

| where | how | drift |
|---|---|---|
| `montecarlo()` in `App.jsx` | 8,000 runs, **unseeded** (`Math.random`) | the app's own **seasonal monthly means** |
| `probProfit()` in `engine.js` | closed form, payoff integrated against a lognormal | **risk-neutral 0.045** |
| `probProfit()` in `pro.jsx` | a second closed form, different signature | **risk-neutral 0.045** |
| `chanceInProfit()` in `visuals.jsx` | band integration under the chart | **`driftAnnual` defaulting to 0** |

Three drifts and one question. The Radar row, the Shortlist row, the Build panel, the Guardian
and the autopilot's brief each reached for whichever of the four was nearest, so one position had
several different chances depending on which screen you were standing on — and the Build panel's
was **unseeded**, so it also had a different one each time the button was pressed.

Two consequences beyond the display. The Guardian's Thesis Integrity Score divides today's chance
by `thesis.pop`, the chance recorded at entry: entry came from a closed form, today came from
whichever screen asked, so the score was measuring the gap between two FORMULAS as much as the
gap between two days. And `autopilot.mjs` imported `SEASONAL` from `engine.js` — the very table
the Build screen's Monte Carlo drifted on — three lines above computing its `pop` at a
risk-neutral 0.045.

### THE DECISION

**The Monte Carlo is the single truth.** Every number a screen or a brief prints as "the chance
of profit" comes out of one function, and the two closed forms are **deleted** rather than kept
as a faster approximation. A faster approximation kept beside the truth is a second number
waiting for a screen to reach for it — which is exactly how there came to be four.

That decision also brings **ROADMAP P2's house distribution forward by half**: the seasonality
this app already scores every market on now enters the probability it prints about them. P2 still
owes the other half — REALISED volatility measured from returns instead of the hand-written
`SIGMA` table.

### HOW IT IS BUILT

* **`terminalMC(legs, entryNet, S, { driftAnnual, sigma, dte, runs, seed })` in `engine.js`** is
  the arithmetic. `engine.js` imports nothing and `rules.js` imports it, so it may not read
  `RULES`: the drift, the volatility, the run count and the seed are the **caller's**, and there
  are **no defaults** — a missing one THROWS, exactly as `exitSim()` now does (§4g). A default is
  how a stale number comes back silently in a year.
* **`chanceOf()` in `rules.js`** is the policy around it, and the only place `terminalMC` is
  called. It assembles the run count from its home, the drift from `seasonalDrift()`, the
  volatility through `ivProvenance()` and the seed from the position.
* **`chanceCheckOf()` in `App.jsx`** is the one spelling of `chanceOf` in that file, the same
  discipline `modelCheckOf()` follows. `riskGate.test.js` fails the build if App.jsx spells it
  twice, if `pro.jsx` spells it at all, or if any file runs a `terminalMC` of its own.

**THE DRIFT IS THE APP'S OWN THESIS.** `seasonalDrift(monthlyMean, month, dte)` averages the
seasonal monthly means over the months the trade is actually held for and annualises them — the
arithmetic that used to live inside `montecarlo()`, moved into the engine so the client and the
server cannot derive it two ways.

**THE VOLATILITY IS THE MARKET'S.** The structure's own implied volatility, averaged across its
legs from the live chain. The market says how WIDE the distribution is; the app's thesis says
which way it LEANS. Every price in this app — `analyze()`, `netBS()`, the model sanity check — is
already worked out at that implied volatility, so anything else here would price a trade at one
number and judge it at another. The realised `SIGMA` table keeps its own job: it is what the exit
simulator walks the price on, which is a different question.

**IT IS SEEDED, AND THE SEED IS THE POSITION'S.** Ticker, expiry, rounded days, the legs and the
spot rounded to the cent. An unseeded Monte Carlo hands each caller a different answer for one
object — failure class #3, engineered in on purpose — so the same trade gives the same seed gives
the same number on the Radar, the Shortlist, Build, the Guardian and in the brief. The spot is
rounded to the cent so a quote wobbling in the third decimal between two renders does not re-roll
the simulation under the reader; a different strike or expiry is a different trade and gets its
own stream.

**RANKING IS NOT PRINTING — AND THE DECISION IS ONE RUN COUNT FOR BOTH.** The trap is that the
Shortlist prices and ranks many candidates and prints the chance of each, so a cheaper count for
ranking than for printing would mean the row you compared and the row you opened disagreeing
about the same trade. Measured on the development machine: **0.54 ms per candidate at 8,000 runs**
(0.24 ms at 2,000). The widest screen in the app — the guided flow's pool, five markets by two
families by the presets — reaches about eighty candidates, so **roughly 43 ms** for the whole
pool, against the `analyze()` call each candidate already pays for. Dropping to 2,000 would save
about 25 ms and double the standard error on every printed percentage, from 0.55 points to 1.1,
which is visible at the whole percent the screens round to. So `RULES.mcRuns` is **8,000
everywhere**. **NOT VERIFIED ON A PHONE** — there is no browser in this sandbox, and a phone is
the machine this app is demoed on.

**UNKNOWN IS NOT A NUMBER.** No spot, no horizon, no entry price or no seasonal row and
`chanceOf()` returns `null`, which every screen prints as a dash. `Number(null)` is 0 and 0 is
finite: a missing chance must never arrive as a confident 0%. The one input with a named fallback
instead of a null is the implied volatility, and `ivProvenance()` says on screen that it used one.

### THE CHART CANNOT SAY SOMETHING ELSE — AND FIXING IT FOUND A SECOND FAULT

`chanceInProfit()` feeds the distribution picture. Its `driftAnnual` **defaulted to zero and no
caller ever passed one**, so the green under the histogram was drawn against a market that goes
nowhere while the number printed beside it came from somewhere else. The default is gone: a
caller that has not said what the drift is gets `null` and a dash, not a confident number worked
out against an assumption nobody made.

Giving it the right drift exposed the second fault. **`payoffBands()` samples a FINITE range —
±30% of spot — so the outermost bands stop where the SAMPLING stops, not where the payoff does.**
Integrating the lognormal band by band therefore threw away every path that finished outside that
window and reported the remainder as a probability. On BOIL, at an implied 85% over 45 days, one
standard deviation is about 30%: a long call's chance read **15%** when it is really **34%**.
`bandMass()` now extends a band that reaches the edge of the sampling to the tail, which is what
the payoff itself does — the deleted `probProfit` in `engine.js` always did this and the band
integration never had.

**THE TOLERANCE IS A MEASUREMENT, NOT A CHOICE.** With the same drift and the same volatility the
chart and the simulation are two readings of one distribution, so any gap is the Monte Carlo's
sampling error and nothing else. At 8,000 runs the standard error of a proportion near a half is
**0.56 points**. The worst gap measured across the fifteen fixtures below is **1.59 points**, on
the BOIL vertical; run at 400,000 the SAME structure lands within **0.01 points** of the chart,
which is what proves the gap is noise rather than a disagreement about the trade.
`ceiling.test.jsx` holds the pair at **2 percentage points** and says in the failure message not
to widen it.

### EV READS THE SIMULATION'S OWN MEAN

`evProfile()` computed `pop * maxProfit - (1 - pop) * risk`, and the Build screen printed
`maxProfit × pop` under the label PROFIT × CHANCE. That is a **two-outcome bet**: the best case
or the worst case and nothing in between, weighted by a probability of landing anywhere in the
green. An iron condor that finishes a dollar inside a short strike is neither of those numbers,
and neither is a vertical that expires between its strikes — which is most of the distribution.
Both now read the Monte Carlo's `ev`, the mean of every outcome it actually walked, and the stat
on the Shortlist is relabelled AVERAGE RESULT because that is what it is.

The no-ceiling rule (§4c) is **untouched, deliberately**: a structure with no maximum profit still
returns `null` from `evProfile()` and still ranks last with a blank EV. `mc.ev` exists for it and
is honest, but making it rankable is a change to that rule rather than to this arithmetic.

### THE EXIT SIMULATOR IS A DIFFERENT QUESTION AND KEEPS ITS NAME

`exitSim()` and `exitPathSim()` answer "what happens along the path under the exit rule", not
"where does this finish". They stay, with their own bodies and their own signatures. What went is
the screen that called two different quantities "the chance" without saying which question each
answered: the Build screen's "THREE PROBABILITIES — which one to read, and when" panel is now
**TWO QUESTIONS**, because there were only ever two questions and the third entry was an
arithmetic that did not agree with itself.

### BEFORE AND AFTER — every probability on screen, five markets

Seeded fixtures, September, 45 DTE, each structure priced with the app's own model at the
market's implied volatility. `vertical` is an ATM call spread two strike-steps wide, `condor` an
iron condor at ±2 and ±4 steps, `longcall` an ATM call (no ceiling).

| market | structure | drift now used | CHANCE before | CHANCE now | dir | chart before | chart now | dir |
|---|---|---|---|---|---|---|---|---|
| CORN | vertical | −9.6%/yr | 43% | **35%** | down | 40% | **34%** | down |
| CORN | condor | −9.6%/yr | 59% | **59%** | same | 58% | **58%** | same |
| CORN | longcall | −9.6%/yr | 35% | **28%** | down | 32% | **27%** | down |
| SOYB | vertical | −8.4%/yr | 43% | **33%** | down | 39% | **34%** | down |
| SOYB | condor | −8.4%/yr | 63% | **60%** | down | 61% | **61%** | same |
| SOYB | longcall | −8.4%/yr | 35% | **27%** | down | 32% | **27%** | down |
| WEAT | vertical | −3.6%/yr | 46% | **41%** | down | 43% | **41%** | down |
| WEAT | condor | −3.6%/yr | 38% | **37%** | down | 38% | **38%** | same |
| WEAT | longcall | −3.6%/yr | 35% | **30%** | down | 32% | **30%** | down |
| UNG | vertical | +14.4%/yr | 41% | **43%** | up | 35% | **43%** | up |
| UNG | condor | +14.4%/yr | 59% | **58%** | down | 59% | **58%** | down |
| UNG | longcall | +14.4%/yr | 33% | **36%** | up | 27% | **36%** | up |
| BOIL | vertical | +26.4%/yr | 41% | **46%** | up | 25% | **44%** | up |
| BOIL | condor | +26.4%/yr | 37% | **38%** | up | 37% | **37%** | same |
| BOIL | longcall | +26.4%/yr | 30% | **33%** | up | 15% | **34%** | up |

**The direction is the drift and nothing else.** September reads negative on all three grain
markets (−9.6, −8.4, −3.6) and positive on both gas markets (+14.4, +26.4), and every directional
structure moves the way its market's season points: down on CORN, SOYB and WEAT, up on UNG and
BOIL. The **condors barely move at all**, which is the check that the change is doing what it
claims: a symmetric structure is nearly indifferent to a drift, so a large move there would have
meant something else had changed.

The chart column moves further than the CHANCE column on the two gas markets — 25% → 44% on the
BOIL vertical, 15% → 34% on the long call — because that column carries **both** fixes: the drift
and the missing tails. The tails are worth most exactly where the volatility is highest.

| market | structure | EV before (pop × maxP) | EV now (simulated mean) | Build panel before | now |
|---|---|---|---|---|---|
| CORN | vertical | +$5 | **−$5** | 33% | **35%** |
| CORN | condor | −$4 | **−$1** | 63% | **59%** |
| CORN | longcall | — | **−$15** | 26% | **28%** |
| SOYB | vertical | +$6 | **−$7** | 33% | **33%** |
| SOYB | condor | −$4 | **−$2** | 63% | **60%** |
| SOYB | longcall | — | **−$17** | 26% | **27%** |
| WEAT | vertical | +$2 | **−$1** | 42% | **41%** |
| WEAT | condor | −$0 | **−$2** | 39% | **37%** |
| WEAT | longcall | — | **−$10** | 29% | **30%** |
| UNG | vertical | +$7 | **+$6** | 43% | **43%** |
| UNG | condor | −$5 | **−$2** | 55% | **58%** |
| UNG | longcall | — | **+$8** | 37% | **36%** |
| BOIL | vertical | +$18 | **+$24** | 44% | **46%** |
| BOIL | condor | −$19 | **−$19** | 33% | **38%** |
| BOIL | longcall | — | **+$38** | 35% | **33%** |

**`ev` has no single direction and that is expected** — it is a mixture whose weights all changed
at once. What is worth reading is the grain verticals: every one of them went from a positive
expected value to a negative one. The old formula credited them with the full maximum profit at
the probability of finishing anywhere green, and most of "anywhere green" on a two-strike spread
pays a fraction of the maximum. The EV column for a `longcall` was blank before and is blank on
screen still: the no-ceiling rule is unchanged, and the figure in this table is what the
simulation would say if it were asked.

The Build panel column is the closest thing to a like-for-like: it was already a Monte Carlo on
the same seasonal drift, so what moved there is the **volatility** — implied instead of the
realised `SIGMA` table — and the fact that it is seeded. Those numbers move by a few points and
in both directions, which is the right size for that change.

### WHAT THIS TABLE PROVES, AND WHAT IT DOES NOT

It proves the change moved the numbers, that it moved them in the direction the drift points, and
that a structure insensitive to drift barely moved. **It proves NOTHING about whether either set
of numbers describes a real market.** Both are model output: a lognormal at an implied volatility
this app reads off a delayed indicative feed, drifted on a seasonal table that is hand-written for
four of the five markets until Alpha Vantage loads. Nothing here was run against a live chain, and
nothing here was compared with what actually happened to a trade. Settling that is ROADMAP P5.

---

## 4i. What the entry itself has to carry — the horizon, and three numbers with no home

### A BRIEF WRITTEN AT THE WRONG HORIZON IS STILL IN THE JOURNAL

§4g fixed the arithmetic: `exitSim()` walked every position to 7 DTE while `RULES.exitDTE` has
been 21 since it was changed from 7. It did not touch what had already been written. **Every
autopilot brief the owner has received describes the chance of being positive "at the exit rule"
at a horizon fourteen days past the rule**, and four pull requests shipped on top of that.

What the Journal keeps is **not the brief**. `appendTimeline()` stores a `type: "autopilot"` entry
whose `text` is the verdict, the share of the maximum, the TIS and **the model's rationale** —
prose the model wrote *after reading* `simulator_from_today`. So the wrong numbers are inside the
prose of past entries, where no migration can reach them, and nothing distinguishes those entries
from the ones written since.

**NOT BY DATE.** A deploy date is a second home for a fact the entry can carry itself, and it
would have to be maintained by hand for the life of the record. So:

* new autopilot entries carry **`simExitDTE`** and **`simDays`** — the simulator's OWN answers
  (`sim.exitDTE`, `sim.horizon`), never `RULES` written out a second time, because a name
  asserting a rule the arithmetic had not applied is the whole fault;
* **the ABSENCE of that stamp identifies an entry written before the fix**, the same pattern
  `contractsAssumed` uses for a size that was assumed rather than recorded (§10f);
* `simHorizonOf()` and `autopilotHorizonNote()` in `src/journal.js` read it, because how a record
  was produced is a fact about the record;
* **every screen that renders an unstamped entry says so in one plain sentence** — the Guardian's
  timeline, the Journal's timeline, the weekly report, and the context handed to the copilot.
  One sentence, not a paragraph, and never an apology: *"The simulation behind this entry ran to a
  day the app no longer uses, so any chance quoted inside it is not the app's current exit rule."*

`Number(null)` is 0 and 0 is finite, so `simHorizonOf()` checks that the stamp **is a number**
before coercing it — otherwise an entry with no stamp at all would read as a stamp of zero, which
is the exact confusion the marker exists to end. A horizon of 0 is a real reading and counts.

### THREE NUMBERS WITH NO HOME — AND NOT ONE OF THEM CHANGED VALUE

PR #24 found them and deliberately left them, because each needed a product decision rather than a
rename. The owner's decision: **give all three a home, change no value.** A rename that moves a
number is two changes wearing one coat.

| number | now | why it had no home |
|---|---|---|
| `0.35 * p.maxLoss` — the "watch" attention level in `App.jsx` | `RULES.watchAttentionShare`, read through `watchAttentionLevel()` | its value collides with `maxSpreadShareOfMid`, so the rule-literal sweep would have named the wrong rule on that line |
| `confidence >= 70` in two generated sentences in `signals.js` | `RULES.autopilotConfidence` | nothing in `RULES` held the bar the autopilot waits for, and its value collides with `expensiveIVRank` |
| the bare `0.25` implied-volatility fallbacks in `autopilot.mjs` and `pro.jsx` | `RULES.fallbackIV`, read through `ivProvenance()` | it is a DIFFERENT quantity from `fallbackSigma` and had to be homed without being conflated with it |

**THE TWO COLLISIONS ARE NOW HARMLESS INSTEAD OF HIDDEN.** With the watch level reading
`RULES.watchAttentionShare`, `maxSpreadShareOfMid` goes **back on the sweep list** — it was the
one rule number deliberately kept off it — and with the confidence bar reading
`RULES.autopilotConfidence`, **`signals.js` is back in the swept file set**. Both were clean on
the first run: nothing else was hiding behind either collision. That is a negative result and it
is worth recording, because the two exclusions were costing coverage rather than concealing a
fault.

**`fallbackIV` AND `fallbackSigma` ARE THE SAME NUMBER AND MUST NEVER BE ONE CONSTANT.**
`fallbackSigma` is the **realised** volatility the exit simulator walks the SHARE's price on;
`fallbackIV` is the **implied** volatility the OPTIONS are priced at (`bs`, `smile`, `netBS`).
One is a property of the share, the other of the option market on it, and on these chains they
differ — BOIL carries a realised 0.95 in `SIGMA` against an implied 0.85 in `UNDERLYINGS`. Merging
them would make a future correction to either one silently move the other. `ivProvenance()`
carries which of three sources produced the number — today's chain, the position's own entry
thesis, or the fallback — exactly as `sigmaProvenance()` does for the simulator (§4g), and a
fallback says so on screen rather than passing as a reading.

All three are **CHOSEN, NOT MEASURED**, and all three are on the NOT VERIFIED list.

---

## 4j. One seasonal source — and a chance that says whose table drifted it

### THE DEBT §4h LEFT OPEN, VERBATIM

> **THE DRIFT IS NOW THE SEASONAL TABLE, AND FOUR OF THE FIVE MARKETS ARE STILL ON THE
> HAND-WRITTEN ONE UNTIL ALPHA VANTAGE LOADS.** The app says on screen when a market is on the
> fallback; it does not say it beside the CHANCE.

§4h made five screens agree on the *number*. It did not make any of them say what the number is an
answer about, and the drift is the one input to it that the market has no say in at all: implied
volatility says how wide the distribution is, the seasonal table says which way it leans.

### AND THE TWO SIDES DID NOT EVEN READ THE SAME TABLE

| side | what it drifted on |
|---|---|
| `App.jsx` | measured monthly means loaded per basket market, `meansFor()` falling back to the hand-written row |
| `autopilot.mjs` | `SEASONAL[pos.ticker] \|\| SEASONAL.SPY`, with **no measured means available to it at all** |

So the brief and the screen could print two different chances for one position, for a reason
neither of them named — on top of the reason §4h already fixed.

### WHAT ONE CELL IS WORTH

Measured on this repo's own arithmetic, seeded exactly as §4h is (`chanceSeedKey`, 8,000 runs,
`RULES.mcRuns`). CORN 19/21 call debit spread, spot 20, 45 DTE, at the repo's own
`SIGMA.CORN` = 0.22. **Nothing inside `SEASONAL` was edited**: the corrected row is built in the
test from the two cells `netlify/functions/av.mjs` documents against 195 months of real data.

| month | cell | drift | chance | average result |
|---|---|---|---|---|
| June, hand-written | +1.50 %/mo | **+16.8 %/yr** | **57.5 %** | **+$13.51** |
| June, measured | −3.46 %/mo | **−13.0 %/yr** | **38.5 %** | **−$21.73** |
| | | *sign flips* | **−18.9 pp** | *sign flips* |
| September, hand-written | −1.10 %/mo | −9.6 %/yr | 40.7 % | −$17.86 |
| September, measured | +1.03 %/mo | +3.2 %/yr | 49.3 % | −$2.78 |
| | | *sign flips* | **+8.6 pp** | +$15.08 |

One cell of twelve, on one market of five, moves the printed chance by nearly nineteen points and
reverses the sign of the average result. **The sentence beside the number is not a footnote about
the number; it is the difference between a measurement and a guess wearing the same digits.**

### WHAT THE FIVE MARKETS LOOK LIKE IN THIS SANDBOX

**THE CACHE IS EMPTY HERE AND THERE IS NO WAY TO FILL IT.** No `ALPHAVANTAGE_KEY` is set and the
egress proxy refuses the CONNECT to `alphavantage.co` (403), so no measured series exists to read
and `/api/av` cannot be exercised. Every market below is therefore on the hand-written row — which
is itself the reading that matters: **this is what the app prints today**, and until this PR it
printed it with nothing saying so. At-the-money call debit spread, 45 DTE, each market's own
`SIGMA`:

| market | June drift | June chance | Sept drift | Sept chance | source |
|---|---|---|---|---|---|
| SOYB | +18.0 %/yr | 61.1 % | −8.4 %/yr | 41.5 % | hand-written estimate |
| CORN | +16.8 %/yr | 57.5 % | −9.6 %/yr | 40.7 % | hand-written estimate |
| UNG | −0.6 %/yr | 47.3 % | +14.4 %/yr | 51.4 % | hand-written estimate |
| BOIL | −3.6 %/yr | 43.4 % | +26.4 %/yr | 48.1 % | hand-written estimate |
| WEAT | −7.2 %/yr | 44.1 % | −3.6 %/yr | 46.1 % | hand-written estimate |

**The before/after for the other four markets is NOT MEASURED and is on the NOT VERIFIED list.**
Only CORN has documented measured cells. Whether the table is as wrong on SOYB, UNG, BOIL and WEAT
as it is on CORN is unknown, and the honest expectation — given eight wrong signs of twelve on the
one market that was checked — is that it is not better.

### THE DECISION

**`seasonalProvenance()` in `src/rules.js` is the ONE home**, beside `markProvenance()`,
`sigmaProvenance()` and `ivProvenance()` and in the same register: decide once which of the two
tables is in force, and carry the decision everywhere the number goes.

- **`chanceOf()` takes it and will not work without it.** A caller handing twelve bare numbers
  **throws** — the same discipline as `terminalMC()` throwing without an exit policy. A missing
  *input* is a dash on screen; a missing *provenance* is a call site printing a number nobody can
  trace, which is a programmer error and is treated as one. `riskGate.test.js` sweeps every source
  file for the shape as well, because the throw catches the call that runs and the sweep catches
  the call written today that only runs on a market nobody demos.
- **`chanceSourceNote()` may no longer say "CORN's own seasonal reading" about a row somebody
  typed.** It said exactly that, whichever table had produced the drift.
- **The server reads the same measured means, and spends nothing to do it.** `av.mjs` already
  caches each market's Alpha Vantage body in the `autopilot` blob store under `av/<SYM>.json` with
  a seven-day TTL. `autopilot.mjs` reads what the client's loads have already put there — one read
  per **ticker**, never one per position — and **never fetches**: the free tier is 25 requests a
  DAY for five markets, and a scheduled job nobody watches must not be able to spend the
  allowance. A **stale entry is served as is, with no TTL test**: month-old measured seasonality
  beats a table with the wrong sign on eight months of twelve, and the age travels into the
  sentence. `parseAvJson()` and `statsFromMatrix()` moved from `App.jsx` into `engine.js` so both
  sides derive the means from **one parse of one body** — a Netlify function cannot import
  `App.jsx`, and a second parse is a second seasonal table waiting to disagree.
- **NO DEFAULT AND NO SILENT SUBSTITUTION.** With no table at all — neither measured nor
  hand-written — `chanceOf()` returns null and the interface prints a dash with a sentence saying
  why. A drift of zero standing in for a reading nobody has is a confident claim that the market
  goes nowhere, which is a different thing from not knowing. A row of twelve measured **zeros** is
  not the same case and is not treated as one.
- **The absence of the stamp is the marker**, exactly as `contractsAssumed` (§4i) and `simExitDTE`
  (§4i) work. A position thesis, a kept candidate, a Radar row and an autopilot entry written
  before this PR carry no `seasonalSource`, and `seasonalStampOf()` reads that absence as the
  hand-written estimate — because at that point the hand-written table was the only one either
  side could reach. Inventing a measurement for it would be the same lie in the other direction.

### WHERE THE SENTENCE APPEARS

| screen | what it prints |
|---|---|
| Build — CHANCE OF PROFIT | `chanceSourceNote()` as the tip and in the "in plain words" paragraph |
| Shortlist row, wide-search row, multi-market scan row | the sentence on the CHANCE stat |
| Guided roads | one line under the per-combination note, on each road card |
| Kept / compared candidates | read off the saved record's stamp, absence included |
| Open positions — Guardian | **two** lines: the table in force NOW and the one recorded AT ENTRY |
| Journal — a closed trade's entry thesis | the stamp beside the chance it was opened on |
| Autopilot brief | `chanceNote`, plus `drift_source` / `drift_is_measured` / `drift_age_days` in the model's own facts |
| Weekly report | per market in section 1; the footer no longer asserts one source for five markets |
| Copilot context | per market in `scanner`, and on each position's `thesis` |

The Guardian pair is the one that was doing real damage rather than merely staying silent: its
Thesis Integrity Score divides today's chance by the one recorded at entry, so a market that was on
the hand-written estimate in August and on measured prices in September had **a change in the table
read as a change in the trade**. The two sentences make that visible instead of scoring it.

### NOT VERIFIED

- **No measured series was read.** No key, no egress; every number above that is labelled
  "measured" comes from the two CORN cells `av.mjs` documents, applied to the hand-written row in a
  test. `/api/av`, the blob cache and the server's read of it are **exercised only by their own
  unit tests** — the whole round trip has never run.
- **The before/after for SOYB, UNG, BOIL and WEAT is unknown.**
- **Nothing on a phone, nothing against a live chain.** The sentences are held by tests, not by a
  screenshot.
- Deriving `SEASONAL` itself from measured returns is **ROADMAP P2** and is deliberately not done
  here. This PR changes where the means come from and what the app *says* about them, never what
  the hand-written row contains.

---

## §4k — ONE VOLATILITY SOURCE, FOR THE SCREENS AND FOR THE BRIEF

§4j settled *whose seasonality* drifts a chance. This settles *whose volatility* the exit
simulator walks the share on — the same fault one layer down, and the volatility half ROADMAP P2
still owes.

### THE FAULT, READ OFF THE CODE

`statsFromMatrix()` in `engine.js` has always returned `sqrt(var * 12)` of the measured monthly
returns beside the twelve means. `App.jsx` stored it as `seasonal[tk].sigma` and handed it to the
Guardian; `autopilot.mjs` had no measured volatility available to it at all:

| side | what walked the share |
|---|---|
| `App.jsx` → `GuardianPanel` → `exitPathSim` | `seasonal[p.ticker]?.sigma \|\| getU(p.ticker).sigma` — the MEASURED realised volatility, falling back to the hand-written row |
| `autopilot.mjs` → `exitSim` | `sigmaProvenance(SIGMA[pos.ticker], …)` — the hand-written row, always |

So the Guardian's panel and the autopilot's brief walked the **same position on two different
volatilities**, and `pTP`, `pSL`, `pTimePos`, `ev` and `medDays` all move with it. Neither screen
said which number had produced its figures. `measuredSeasonal()` read the body, computed the sigma
inside `statsFromMatrix()` and **threw it away**.

### THE DECISION

**`sigmaProvenance()` in `src/rules.js` learns a THIRD source**, in the same shape
`seasonalProvenance()` uses — the value, which source produced it, the year count, the age in days
and one sentence:

| source | when | what the sentence says |
|---|---|---|
| `measured history` | a loaded reading with a usable sigma | "walks CORN at 37% a year, **MEASURED** from 11 years of monthly returns, read 3 days ago" |
| `table` | the hand-written `SIGMA` row | "the figure this app holds for it. That figure is written down, not measured from returns." |
| `fallback` | no row for this market at all | "**THE SIMULATION BELOW IS WALKED AT A FALLBACK VOLATILITY** … not measured from CORN's own returns." |

It could only say "written down, not measured from returns" before, about all of them. That is now
false of the first row, and the test that holds it asserts the measured sentence **does not**
contain that phrase.

- **THE SIMULATORS TAKE THE PROVENANCE, NOT A NUMBER, AND REFUSE A BARE SIGMA.**
  `exitSim(pos, S, dteLeft, iv, vol, policy, n)` and `exitPathSim(pos, S, dteLeft, iv, vol, nSim)`
  throw on anything that is not a `{ sigma, source }` — the same discipline as `exitSim` throwing
  without an exit policy (§4g) and `chanceOf()` throwing on a bare row of means (§4j). The check is
  **structural**, because `engine.js` imports nothing and may not read `RULES`. Both simulators
  **return** `sigma` and `sigmaSource`, for the §4i reason: a field name must never assert a reading
  the arithmetic did not use, so the brief reads `sim.sigma`, never the caller's `vol.sigma` written
  out a second time.
- **THE SERVER READS IT OUT OF THE SAME BLOB READ.** `measuredSeasonal()` in `autopilot.mjs` now
  returns `{ monthlyMean, sigma, years, at }` from one `store.get("av/<SYM>.json")`, one
  `parseAvJson()` and one `statsFromMatrix()`. **No second read, no fetch** — the free tier is 25
  requests a DAY for five markets — one read per **ticker**, a **stale entry served as is**, and
  the cache emptied at the top of every run so a warm container cannot pin yesterday's reading.
  The means and the volatility are two questions about **one** set of prices, so both provenances
  are decided from the one object.
- **THE ABSENCE OF THE STAMP IS THE MARKER**, the third time (`contractsAssumed` §4i,
  `simExitDTE` §4i, `seasonalSource` §4j). An autopilot timeline entry now carries `simSigma`,
  `simSigmaSource`, `simSigmaYears` and `simSigmaAgeDays`; an entry written before this carries
  none, and that absence reads as **the hand-written table** — because the table was the only
  volatility the autopilot could reach. `simVolOf()` / `autopilotVolNote()` in `src/journal.js`
  read it, beside `simHorizonOf()` / `autopilotHorizonNote()`, for the same reason: how a record
  was produced is a fact about the record.
- **NO DEFAULT AND NO SILENT SUBSTITUTION.** `RULES.fallbackSigma` (0.25) is still the named
  fallback, still says it was **CHOSEN, NOT MEASURED**, and is still on the NOT VERIFIED list. It
  must **never** be merged with `RULES.fallbackIV`: one is the realised volatility the SHARE is
  walked on, the other the implied volatility the OPTIONS are priced at, and merging them would
  make a correction to either silently move the other. A market with no reading at all is the
  counter-example the tests keep.
- **NOTHING INSIDE `SIGMA` WAS EDITED**, exactly as §4j left `SEASONAL` alone. This changes where
  the volatility comes from and what the app says about it, never what the typed row contains.

### WHERE THE SENTENCE APPEARS

| surface | what it prints |
|---|---|
| Guardian — the exit-path panel | `sigmaProvenance().note` under the figures, amber unless the reading was measured |
| Autopilot brief (webhook markdown) | the same sentence after `Sim to 21 DTE at N% vol` — it used to print one bare word, `(table)` |
| Autopilot brief (record) | `simSigma`, `simSigmaSource`, `simSigmaMeasured`, `simSigmaYears`, `simSigmaAgeDays`, `simSigmaNote` |
| The model's own facts | `volatility_used` / `volatility_source` **from the simulator**, plus `volatility_is_measured`, `volatility_years`, `volatility_age_days`, `volatility_note` |
| Journal timeline, Guardian timeline, the report's PDF export, the copilot's context | `autopilotVolNote()` on every entry whose stamp is absent |
| Autopilot rule warnings | raised when the volatility was **not measured** — it used to warn only about the fallback and stay silent about the table, the very number the fallback stands in for |
| Build — the simulation footnote | **corrected, not decorated**: see below |

**THE BUILD FOOTNOTE WAS NAMING THE WRONG QUANTITY.** It read *"Simulated with real/estimated
seasonal drift and N% volatility"*, where N was `seas.sigma` — the REALISED volatility of the
monthly series, which is what the exit simulator walks the SHARE on and which **nothing on that
panel uses**. The chance, its distribution and its average result are all priced at the chain's
IMPLIED volatility. Saying where that N came from would have been giving a provenance to a number
that produced nothing on the screen it was printed on, so the sentence now names the two inputs
that did produce the figures above it — the implied volatility and its source, and which seasonal
table drifted them — and `seas.sigma` is gone from the screen. The `sigma` key is gone from that
fallback object too: it was a second place deciding which realised volatility is in force.

### THE MAGNITUDE — AND IT IS A SENSITIVITY, NOT A MEASUREMENT

**THE MEASURED SIGMA IS NOT AVAILABLE IN THIS SANDBOX.** No `ALPHAVANTAGE_KEY`, and the egress
proxy refuses the CONNECT to `alphavantage.co` (403). **How far any market's real realised
volatility sits from its hand-written `SIGMA` row is UNKNOWN**, and nothing below may be read as a
measurement of CORN, SOYB, UNG, BOIL or WEAT.

What *can* be measured is what the simulator does when the volatility moves. Each market's own
`SIGMA` row, perturbed by a stated factor, on an at-the-money 10%-wide call debit spread, 45 DTE,
implied volatility 0.30, seeded (`Math.random` replaced by mulberry32 at 20260919), 4,000 paths,
`RULES` exit policy:

| market | volatility | pTP | pSL | positive at 21 DTE | average result |
|---|---|---|---|---|---|
| SOYB | 10% (half) | 0.1% | 13.6% | 31.4% | −$9.22 |
| SOYB | **19% (table)** | **7.7%** | **36.3%** | **32.3%** | **−$2.05** |
| SOYB | 38% (twice) | 30.3% | 56.6% | 8.9% | +$6.42 |
| CORN | 11% (half) | 0.5% | 17.9% | 33.4% | −$6.83 |
| CORN | **22% (table)** | **12.2%** | **41.7%** | **28.3%** | **−$0.05** |
| CORN | 44% (twice) | 34.3% | 58.0% | 5.2% | +$7.30 |
| UNG | 24% (half) | 15.4% | 44.3% | 25.1% | +$0.49 |
| UNG | **48% (table)** | **35.9%** | **59.1%** | **3.4%** | **+$4.18** |
| UNG | 96% (twice) | 39.9% | 60.2% | 0.0% | +$5.37 |
| BOIL | 48% (half) | 35.6% | 58.7% | 3.9% | +$8.40 |
| BOIL | **95% (table)** | **39.8%** | **60.2%** | **0.0%** | **+$10.74** |
| BOIL | 190% (twice) | 41.5% | 58.5% | 0.0% | +$13.91 |
| WEAT | 13% (half) | 1.1% | 22.7% | 34.9% | −$1.56 |
| WEAT | **25% (table)** | **16.9%** | **45.6%** | **23.2%** | **+$0.39** |
| WEAT | 50% (twice) | 36.4% | 59.2% | 2.9% | +$2.18 |

Read it this way. **Every figure the brief prints moves, and some of them invert.** Halving CORN's
volatility takes the take-profit rate from 12.2% to 0.5% and the average result from break-even to
−$6.83; doubling it takes the same trade to +$7.30. A brief and a screen that disagree about the
volatility are not disagreeing about a detail.

**TWO PROPERTIES HOLD ON EVERY MARKET AND ONLY TWO.** More volatility means more paths reach *a*
barrier (`pTP + pSL` never falls), and more of them reach the take-profit one (`pTP` never falls).
`pSL` and `pTimePos` are **not** monotone — BOIL's stop rate goes 58.7% → 60.2% → 58.5%, because
the two barriers compete for the same paths — and `ceiling.test.jsx` deliberately asserts only the
two that hold. A test asserting a direction the arithmetic does not have would be the same fault
this section is about.

### NOT VERIFIED

- **The measured volatility has never been read for any market.** Every number above labelled
  "measured" is the table perturbed by a stated factor inside a test. Whether CORN's realised
  volatility is 0.22, 0.15 or 0.40 is unknown here, and so is the SIGN of the correction.
- **The measured path still has not run end to end.** `/api/av` → blob → `measuredSeasonal()` →
  `sigmaProvenance()` is now exercised against a fake blob store and a real-shaped Alpha Vantage
  body (`src/avFixture.js`), which is what makes it no longer *unexercised*. It is not a live call
  and only the owner's own deploy can make it one.
- **Nothing on a screen.** The Guardian's panel gained a sentence under its figures; whether that,
  plus the two seasonal lines §4j added, crowds a 390px phone is a judgement nobody has made.
- Deriving `SIGMA` itself from measured returns is **ROADMAP P2** and is deliberately not done
  here.

---

## §4l — THE FIRST LIVE READING, AND THREE FAULTS NO TEST COULD HAVE CAUGHT

**This is ROADMAP P4 (UX) brought forward, and the roadmap records why.** P4's stated premise —
"the THREE PROBABILITIES panel is deleted, an ambiguity P2 resolves in code" — was already
satisfied by P1 (PR #25 made it TWO QUESTIONS), so P4 was waiting on something that had already
happened. **P0 is still open** and its DONE WHEN is unchanged: a real fill. This is what stands
between the owner and that fill.

**The owner used the app on his phone, against the live market, for the first time.** Six pull
requests in a row had been interior coherence work, because a sandbox with no keys, no egress and
no browser can only make the code honest about itself. That ended: there are screenshots, and they
found three faults in the ARITHMETIC. **Every one of them is a number that is internally
consistent and describes a trade the user cannot have**, which is exactly why no test in this
repository could have caught any of them.

### The reading

UNG, 2026-09-20, spot $10.42, the 2026-10-23 board at 33 DTE:

    buy  10.50C   mid 0.48   OI 471
    sell 11.00C   mid 0.34   OI 172
    combo:  bid $4   mid $14   ask $24   spread $20 = 143% of the mid

The screen showed **YOU PAY $14 · MOST YOU CAN MAKE $36 · MOST YOU CAN LOSE -$14 · BREAKEVEN
10.64**. Two orders from earlier sessions were still working, unfilled. A third was sent at a
limit of $14, GTC — it is still working. The four-factor agreement read CONFLICT, confidence
32/100.

### 0a. THE SPREAD FLOOR MEASURED ONE LEG AT A TIME AND CHARGED THE PAIR

`spreadFloor()` takes one `{ bid, ask }` per leg and returns `widest`, the worst share found AMONG
THE LEGS. Each UNG leg is about ten cents wide — **21% and 29% of its own mid, both comfortably
inside `RULES.maxSpreadShareOfMid` (0.35)** — and the combination is **143% of its own mid, more
than four times that ceiling**. The candidate was offered.

The per-leg test cannot see this and no per-leg number can. On a vertical the two leg spreads ADD
(you cross one getting long and one getting short) while the two mids SUBTRACT, so a structure
whose legs are worth $48 and $34 and whose net is worth $14 concentrates both spreads onto a
seventh of the money.

**THE PAIR TEST SITS BESIDE THE PER-LEG ONE, IT DOES NOT REPLACE IT**, with its own constant, its
own count and its own sentence — the same reasoning that keeps `priceability()`, `impossibleLoss()`
and `modelSanity()` four separate questions. They are different faults:

| | what it asks | what a failure means |
|---|---|---|
| `maxSpreadShareOfMid` (0.35) | is this LEG quoted at a readable price? | the contract is untradeable, whatever it is combined with |
| `maxComboSpreadShareOfNet` (1.0) | is THIS TRADE affordable to get in and out of? | the legs are fine and the round trip still costs more than the trade is worth |

A pooled count would explain neither, and a screen that cannot say which of the two removed a
structure cannot say what to do about it.

**WHY 1.0, AND IT IS A DIFFERENT ARGUMENT FROM 0.35 RATHER THAN A COPY OF IT.** At a share `s` the
two sides differ by `s` of the number between them, so `ask = bid × (2 + s) / (2 − s)`: **0.35 is
"the ask is at most 1.4 times the bid" and 1.0 is "the ask is at most THREE times the bid"**. One
is the bar for a contract, which is quoted in its own right and trades all day; the other is the
bar for a combination, which is quoted as the arithmetic of two contracts and is structurally
wider on every chain in this basket. A share of 1.0 is also the point at which the round trip
costs the WHOLE of what the structure is worth, and the point past which the mid every figure on
screen is computed from is further from both quoted sides than they are from each other. The UNG
pair is 1.43 and is refused by 43%.

`comboSpreadFloor()` reads `comboBook()` — the one place each leg is taken at the side that
actually trades — so the number this floor judges is the same number the order ticket prints. Same
two rules as every other floor: **UNKNOWN IS NOT WIDE** (a leg with no two-sided quote, or a net
under `MIN_NET_DOLLARS`, is SKIPPED, and the second of those belongs to `priceability()` rather
than here), and **IT NAMES ITSELF** (`comboSpreadFloorReason()`, `wideComboNote()`,
`comboSpreadSkippedNote()`, `tally.comboSpread`, `floors.comboSpread`).

**IT CHANGES WHAT IS OFFERED, NEVER WHAT MAY BE SENT.** Like the other quality floors it is OUT of
the gate: a hand-built trade is the user's to make, and the desk prints the combination spread
beside the price instead of refusing it.

### 0b. EVERY FIGURE WAS COMPUTED AT A PRICE THE APP ITSELF SAID WOULD NOT FILL

`analyze()` priced the structure at the mid, full stop, so YOU PAY $14, MOST YOU CAN MAKE $36,
MOST YOU CAN LOSE -$14 and BREAKEVEN 10.64 all describe a **$14 trade** — while `limitPlacement()`,
two thousand pixels below, printed *"a limit AT the mid is a limit nobody has to meet"*.

| at | you pay | most you can make | most you can lose | breakeven | made per $1 risked |
|---|---|---|---|---|---|
| the MID, $14 | $14 | $36 | −$14 | 10.64 | **2.57** |
| the price that TRADES, $24 | $24 | $26 | −$24 | 10.74 | **1.08** |

**Nearly half the reward and nearly double the risk.** The user decided on 2.6:1 and could only
have 1.1:1.

`analyze(legs, S, dte, baseIV, q, { net })` takes the entry price as an ARGUMENT now. With none it
uses the mid exactly as before, so every existing caller is unchanged; `entryMid` and
`entrySource` ALWAYS travel, because the mid is still the honest "what it is worth" and a field
name may never assert a price the arithmetic did not use (the §4i rule). The LEG marks, the greeks
and the volatility are untouched: those are properties of the chain, not of the price you chose.

**`AE` ON THE BUILD SCREEN IS THAT ANALYSIS, AND EVERYTHING READS IT** — the six stats, the
reward-to-risk, the chance, the gate preview, the confirm step, the order ticket and **the position
record**. A position recorded at the mid is a position whose maximum loss, breakeven and
take-profit target describe a trade nobody made, and the Guardian reads it for the rest of its
life. The Shortlist row still prints its candidate at the MID — a candidate is a structure, not
yet a price — and Build says so in one sentence where the two are side by side.

### 0c. A LIMIT IS A CEILING, NOT A PRICE, AND NOTHING SAID SO

An order at or above the ask is filled AT THE ASK. So offering more than the ask **costs nothing**
and buys a little protection against the quote moving while the order travels. `effectiveLimit()`
is `min(limit, ask)` on a debit and `max(limit, bid)` on a credit — one expression, because
`keenerThan(dir, …)` is the single place the direction is decided — and `limitCeilingNote()` is the
sentence: *"you offer $30, you pay $24."* It appears only when the two differ.

**HALF A CENT OF SLACK, AND IT IS NOT COSMETIC.** `book.ask` is a SUM of leg quotes, so a limit
typed at exactly the price that trades arrives as 0.24 against 0.24000000000000005 and read *"you
are waiting"* at the one price that fills. `TICK_EPS` is the same tolerance `limitPlacement()`'s
mid comparison has always carried, for the same reason: these chains quote in whole cents, so
anything smaller is floating point and not a decision.

### TASK 1 — the order ticket, rebuilt

Designed with the owner over an afternoon against his own screenshots. He could not read the old
one: **he set a limit at the exact mid because the panel gave him no way to see that nothing lives
there.** Top to bottom on a 390px phone:

1. **THE MARKET, READ-ONLY, FIRST.** One row per leg with its BID and its ASK and the SIZE at
   each; the two sides that trade when you buy — the ask on a long leg, the bid on a short — in
   full contrast, the other two dimmed. `legBook()` in `rules.js` is the data.
   **THE SIZES WERE NEVER IN THE APP AND THEY ARRIVED FOR FREE.** Alpaca's option snapshot carries
   `latestQuote { bp, ap, bs, as }` and `chain.js` parsed the two sizes away. They are carried now
   with the same discipline as open interest: `?? null`, never `?? 0`, and a screen with no sizes
   says so (`sizeSkippedNote()`) rather than drawing a blank that reads as "nobody is there".
   CBOE's delayed payload has no sizes at all, and reports that as nulls.
2. **ONE SLIDER PER LEG, IN ONE-CENT STEPS**, each labelled with that leg's bid, mid and ask. The
   user prices each leg and the app computes the net — the reverse of the single net field the
   ticket had, and the direction the owner thinks in. The steps are cents because **options do not
   have continuous prices**: a penny class ticks at $0.01 under $3.00 and 0.525 is not a price. The
   old `<Inp type="number" step="0.01">` constrained the spinner and not what could be typed;
   `onTick()` is applied to the VALUE, so what reaches `orderBody()` is on the tick whatever route
   it came by. `legLimitSeed()` starts each leg at its own mid conceded `openLimitSlippage` of its
   own spread toward the side that trades, which **sums to exactly `openLimitPrice()` on the
   combination** — one arithmetic seen two ways, not two arithmetics.
3. **THE NET, BIG, BESIDE ITS OWN ARITHMETIC** — `0.52 − 0.30 → $22` (`netFromLegs()`) — so the net
   is never a number that appears from nowhere, and the 0c sentence under it when the limit is past
   the touch.
4. **TIME IN FORCE AS A CHOICE THAT CHANGES THE VERDICT.** This is the half the owner said unlocked
   his understanding: inside the spread with GTC is *"nobody is there now, but the order survives
   the close and over days this market moves"*; the same price with DAY is *"gone tonight, filled
   or not."* The app stated the time in force in words AFTER the fact, under a verdict that had not
   read it. `orderVerdict(limit, book, { sign, tif, type })` is built ON `limitPlacement()` — the
   placement arithmetic keeps one home and this adds the horizon to it.
5. **ONE VERDICT BAND**, coloured, three states (`ORDER_VERDICTS`), naming the distance:
   FILLS NOW / WAITING — $N under what trades today / WILL NOT FILL. `limitPlacement()`'s four
   zones collapse to three because a band is a colour, and "waiting, barely" and "will not fill"
   are the same instruction to the reader.
6. **FOUR NUMBERS THAT MOVE**: most you can make, most you can lose, break even, made per $1
   risked — all at the effective price of 0b/0c, in the ticket and in the stats above it, from the
   SAME `analyze()` result.
7. **THE WARNINGS, ONCE.** The CONFLICT paragraph — the same ~400 characters — was on that page
   FOUR TIMES: in "Why this trade", again as an amber warning, again in the order ticket's warning
   list, and again in "The checks that run when you tap". The gate embeds `signals.narrative` in
   its SIGNAL_CONFLICT warning **because the gate has no screen**, so every surface rendering a gate
   verdict printed it a second time beside the panel that already carried it.
   **THE GATE IS NOT CHANGED FOR A COPY PROBLEM.** What changed is what a screen PRINTS: the
   narrative keeps its home (the evidence panel), `warningsToPrint()` replaces it with
   `conflictSummaryLine()` — the count and a pointer — and `BuildWarnings` is one collapsed panel
   with the number in its summary line. It opens by itself while a written reason is still
   required, because a textarea that unlocks the ticket cannot be behind a tap nobody knows to make.
   `ConfirmSteps` takes `showWarnings={false}` on Build and prints one line saying where they are.

Everything else on Build — chain, greeks, candles, cone, payoff — is where it was. This is the
moment the price is chosen, and nothing else.

### TASK 2 — two things PR #27's work exposed without touching

**2a. The compare screen drew one trade two ways.** `ComparePayoffs()` drew its shared distribution
with `terminalDist({ … sigma: shown[0].sigma || 0.3, dte: shown[0].dte || 45, … })` and **passed no
`driftAnnual`**, so `terminalDist()`'s own `driftAnnual = 0` default took over. `shown[0].sigma` was
the candidate's REALISED volatility (`sigmaFor(ticker).sigma`); the `pop` printed on the cards
directly above that curve comes from `chanceOf()` — the chain's IMPLIED volatility and the SEASONAL
drift. This is the rule `bandMass()` had its own default removed for in PR #25, one caller away.

`terminalDist()` has no default drift now and **a missing drift is not a drift of zero**;
`chanceDrawFields()` puts the chance's own sigma and drift on the candidate beside
`seasonalStampFields()`; `compareDistInputs()` refuses to draw without both and `compareDistNote()`
says which is missing — the same answer the picture already gave for two markets. **The ABSENCE of
the stamp is the marker**, the fourth time this pattern is used. `UnifiedPosition()` passes
`drawDrift` and was never at fault.

**2b. Two bare numbers rode along in that same call, and the sweep could not see either.** `|| 0.3`
is a volatility with no home and no provenance, and it is **not the value of any rule**, so the
rule-literal sweep could never name it — the stale-copy blind spot PR #24 wrote down. `|| 45` **IS**
`RULES.targetEntryDTE`, and PR #24 fixed a parameter default of 45 in this very file while this
spelling survived four lines away.

**The sweep could not see it, and the fix is to widen it.** `ruleLiteralHits()` knew three shapes —
a `useState` default, a property or local constant, and an operand of an arithmetic expression. A
FALLBACK OPERAND is none of them: the rule number is neither assigned to a name nor added to
anything. **Shape 4** matches `IDENT || 45` and `IDENT ?? 45` and stays quiet the same way shape 3
does — the identifier on the left has to carry a RULE WORD, matched on words and not as a
substring, so `c.dte || 45` is a copy and `bins.length || 45`, `barWidth || 21` and
`RULES.targetEntryDTE ?? 45` are not. A second test proves the matcher can still see each of the
four shapes AND still stays quiet on the five things that are not copies.
`ConfirmSteps`'s own `sigma = 0.3` is gone in the same pass.

### What a fill would settle that this PR cannot

- **Whether 1.0 is the right pair ceiling.** It is CHOSEN, not measured, exactly like
  `modelDisagreementRatio`, `openLimitSlippage` and `closeLimitSlippage`. What has NOT been read is
  the distribution of combination spread over combination net on the five live chains. Expect a
  real reading to bring it DOWN.
- **Whether a limit inside the spread on GTC ever fills on these books.** The app can now say
  what it is waiting for; it cannot say whether the wait ends. Three orders have been sent and
  none has filled, which is data about the mid and nothing yet about anywhere else.
- **Whether the effective price is the right one to record.** The app records `min(limit, ask)`;
  the broker records the FILL. Those agree only when the order crosses. A fill is the only thing
  that can tell the two apart, and `recheckOrders()` does not yet reconcile a filled price against
  the recorded one.
- **Whether the rebuilt ticket is readable on a 390px phone.** It is the fourth pull request in a
  row to add to that screen and the first to add a table, four sliders and a coloured band to it.

---

## §4m — DEAD IS NOT WORKING, AND A TRADE NOBODY BOUGHT IS NOT A POSITION

**The second live reading, one day after the first**, and it found a fault one layer above §4l: not
a number that was wrong, but a screen **arguing with itself and with the broker**.

### What was on the phone, 20 Sep 2026, in one scroll

    ON YOUR ALPACA PAPER ACCOUNT
      OPEN POSITIONS (0)   Nothing open on Alpaca.

    WORKING AT THE BROKER (3) · SENT, NOT FILLED
      J-0003 UNG    CANCELED · 8 hours old
      J-0002 CORN   EXPIRED  · 3 days old
      J-0001 BOIL   CANCELED · 3 days old

    YOUR POSITIONS (3) · VALUED LIVE
      BOIL −$80      CORN −$27      UNG $0
    TODAY · EVERYTHING IS ON PLAN

Three statements, all on one screen, and the only true one is the broker's. **Not one of those three
trades had ever been bought.** The −$80 was the loss on a trade that does not exist, printed in red,
in the largest figure on the card, under a gauge and a 76/100 "is the reason still good?" score. The
card even carried the correct sentence — *"until it fills, nothing here is a position you own"* — in
small amber text **underneath the number that contradicted it**. A screen that argues with itself is
worse than one that says nothing, because the part that shouts loudest wins, and here that part was
the false one.

### The cause, and it is one expression

```js
p.alpacaId && p.alpacaFilled === false      // "working orders"
```

It asks whether an order was **filled** and never whether it is still **alive**. A cancelled order
was never filled, so it stayed in the working list for ever. **`order.js` has known which statuses
are finished since PR #18** — `DEAD = ["rejected","canceled","cancelled","expired","done_for_day",
"suspended","stopped"]`, and `orderOutcome()` has returned `working: false` for every one of them.
Nobody asked it. The row even *printed* `alpacaStatus` — which is why the badge said CANCELED inside
a panel headed WORKING, on the same line.

**SENT is not FILLED** (PR #18) and **DEAD is not WORKING** (this one) are the same rule read at two
different moments of an order's life, and the second was missing.

### Three stages, one function

`positionStage(pos)` in `src/journal.js`. `store.positions` is a record of what the app **decided**,
which is not what the user **owns**:

| stage | what it is | a position? | exit plan? | counted in exposure? |
|---|---|---|---|---|
| `owned` | the broker filled it, or it never went to a broker (the app's own paper book, where deciding IS owning) | **yes** | running | yes |
| `working` | sent, still held by the broker | no | not started | no |
| `not-taken` | sent, came back with nothing bought | no | never | no |

It reads `orderLifecycle()` in `order.js` — the one place that knows which statuses are finished — so
a status added to that list is understood here without anybody coming back. **UNKNOWN IS NOT DEAD**:
a record the broker has not been asked about yet is `working`, never buried by the app on its own
authority. The same rule as a missing open interest, a missing quote size and a missing drift.

Every list in `App.jsx` comes out of one pass (`byStage`), so no screen can decide for itself what a
record is. `recheckOrders()` also reads it — it had been re-asking Alpaca about three cancelled
orders once a minute, for days.

### WATCHING — the fourth place, and it exists because the owner asked for it

> *"cosa diversa invece se lo salvo come trade (magari voglio vedere come sarebbe andata) ma non deve
> stare nella stessa schermata delle posizioni e ordini"*

A trade you did not take is **neither a position nor history**: it is a live observation. Putting it
in the Journal would have been the compromise that gets undone in two months, because the Journal is
the record of what HAPPENED and this is a question about what is happening now. So: a fourth place,
beside Positions and the Journal.

Two sources, one list, because they are the same question asked twice:

- a trade that **was sent** and came back with nothing bought (`not-taken`) — these arrive by
  themselves, which is what happens to the three above;
- a structure **saved** from the Shortlist and never sent. `store.saved` has carried `entryNet`,
  `spot` and `savedAt` since the path was built — everything needed to answer "how would it have
  gone" — and did nothing with them but offer a Load button, **from the bottom of the Positions
  screen**: a list of trades NOT taken, on the screen whose whole job is the trades you have.

**THE FIGURE IS THEORETICAL AND MAY NEVER BE PAINTED LIKE A REAL ONE.** `wouldHaveDone()` in
`journal.js` returns the number **and** the sentence together, so neither can be rendered alone, and
the screen prints it in muted grey — never the red the Positions cards use. Printing −$80 in that red
one tab across would have rebuilt the exact fault this work removes. `riskGate.test.js` fails the
build if it ever does.

**AND THE STARTING PRICE IS THE TRAP — the one §4l just fixed.** A saved row's `entryNet` came off
the Shortlist, which prices at the **MID**: the price this app has just finished proving nobody gives
you. Started from there, every watched trade reads better than it could have been, and three months
of that is a story about being right. Each row says which of the two prices it began from, and an
unstamped record — everything saved before §4l — is **named rather than flattered**. The absence of
the stamp is the marker, for the fifth time (`contractsAssumed`, `simExitDTE`, `seasonalSource`,
`driftAnnual`, and now `entrySource`).

### `Number(null)` is 0 and 0 is finite — the fifth time

`wouldHaveDone()` coerced its two prices before testing them, so a structure whose price today cannot
be read arrived as a structure worth nothing and the sentence said *"it would be down $450"* where
the truth is that nobody knows. Caught by its own test on the first run. The nulls go out **before**
the coercion, exactly as `qualityFloor()` throws out an unknown open interest before counting one.

### What this does NOT do

- **The gate is untouched.** Six order paths, six. Nothing about what may be sent has changed; this
  is about what the app SAYS it has.
- **Nothing is deleted behind the owner's back.** The three trades move, they do not vanish — which
  is the whole of what he asked for. "Stop watching" is a button he presses.
- **It does not make anything fill.** P0 is still open and its DONE WHEN is unchanged.

### NOT VERIFIED

- **Nobody has seen the Watching tab.** A fourth tab on a 390px phone is a real cost, and the
  judgement that it is worth paying is the owner's, made from a description rather than a screen.
- **No watched row has ever been re-priced against a live chain.** The arithmetic is tested against
  the BOIL figures read off the phone; the re-pricing path runs through `netValue()` on a loaded
  chain, and no chain loads here.
- **The `entrySource` stamp has never been written by a real open**, because nothing has ever
  filled. Every row that exists today is an unstamped one, so the "starts from the MID" sentence is
  the only branch anybody has seen.

---

## §4n — THE APP INVENTED A CONTRACT, AND THE DECISION WAS ELEVEN BLOCKS LONG

The THIRD live reading, and the first one where the order never reached the market at all. Same
phone, same owner, SOYB, 20 September 2026, 21:49, spot $27.64, the 2026-11-20 board.

    Alpaca refused it — HTTP 422. code 42210000:
    invalid legs: [leg.0 asset "SOYB261120C00027500" not found]

    QTY 14 · Market — take what is there · Until I cancel
    MOST YOU CAN MAKE $1,158 · MOST YOU CAN LOSE $942
    MADE PER $1 RISKED 1.23 · NOTIONAL CONTROLLED $38,696
    MARKET SAYS $67 · THE MODEL SAYS $60

Four orders have now been sent and none has filled. The first three were not met by the market. The
fourth **was refused by the broker for a reason the app created itself**, which is a different and
worse class of failure: nothing about the market stopped it.

### The cause — `buildOcc()` was a fallback, and it must not be one

Four of the six order paths spelled exactly this:

    const occ = q?.occ || buildOcc(ticker, expKey, l.type, l.strike);

`src/App.jsx` (`sendToAlpaca`, and the chart button beside each leg) and `src/pro.jsx`
(`OrderTicket.send`, `GuardianPanel.placeExit`). `buildOcc()` FORMATS an OCC symbol out of a strike
**the app chose**. It cannot know whether anybody issued it — only the chain knows that. So the
moment a leg was unquoted, the app named a contract that has never existed and asked the broker to
trade it. `SOYB261120C00027500` is a perfectly well-formed symbol for a contract nobody has ever
listed.

**THIS IS THE RULE THE REST OF THE CODEBASE ALREADY KEEPS.** A missing open interest is UNKNOWN and
never zero. A missing quote size is UNKNOWN and never zero. A missing drift is UNKNOWN and never a
confident zero. A missing maximum profit is UNKNOWN and never a maximum of zero. **A contract the
feed did not list is UNKNOWN and never a well-formed symbol.**

`buildOcc()` stays. Naming a contract is legitimate — the Journal and the option-history panel have
to be able to write one down — but naming one is not the same as asserting it trades. Exactly ONE
call survives in `App.jsx`, the price-history button beside each leg, and it says on screen when the
chain did not list what it is about to chart. `pro.jsx` does not call it at all any more, and
`riskGate.test.js` fails the build if either changes.

### It is in the GATE, and that is not a widening of the gate

`contractListing()` / `unlistedContractNote()` in `src/rules.js`, enforced as `UNLISTED_CONTRACT` in
`src/riskGate.js` — a fourth refusal beside `UNPRICEABLE` and `IMPOSSIBLE_LOSS`, in the same
register: its own code, its own sentence with the leg in it, its own test.

- **Why the gate and not only the components.** Four paths made one mistake. The gate is the one
  place all six pass through.
- **Why it is not a quality floor.** The floors stay out of the gate for ever, because a hand-built
  trade is the user's to make. This is not a judgement about whether a trade is worth taking: a
  contract that does not exist is not a trade at all. It is the same KIND of question as "is there a
  price at all", which has been in the gate since PR #14.
- **ENTRY ONLY**, like both of its neighbours. A closing order names contracts the account already
  holds, and refusing to let somebody OUT of a position because a feed went quiet is the worse
  failure by a distance. The refusal on the close path lives in `placeExit()` instead, beside the
  button, and it says which leg and what to do about it.
- **UNKNOWN IS NOT MISSING.** `occs` is evidence a caller either has or does not, exactly like
  `quotes`: no array at all means the caller cannot answer and nothing is tested. An EMPTY array
  beside real legs is an answer — the chain listed nothing — and it fails. That is the case the SOYB
  order was.

### The ticket's own gate call was WEAKER than the screen above it

`runGate(gate, { ticker, intent: "open", legs, dte, contracts, maxLoss, maxProfit, entryOverride })`
in `pro.jsx` passed **no `quotes` and no `net`**, so `priceability()` inside the gate saw only the
maximum loss and could not refuse an unquoted leg — while the Build screen's `guard` memo, in the
same codebase, passed both. **The weaker of the two was the one guarding the send.** Both calls carry
the same evidence now, and `riskGate.test.js` sweeps the source: an open-intent gate call that leaves
out `quotes`, `net` or `occs` fails the build. The sweep is a source scan, not a behaviour test, for
the same reason the rule-literal sweep is — the throw catches the call that runs, the sweep catches
the call written today that only runs on a market nobody demos.

### Where the strike came from — two ways, and both are closed

`snapStrike()` snaps to the nearest strike ON THE LOADED BOARD and falls back to an invented
`Math.round(x / step) * step` only when the board is empty. The live chain could not be reached from
here, so the exact path that produced this 27.5 cannot be replayed. What CAN be established from the
code is that there were two ways in, and **neither of them re-snapped**:

1. **The expiry dropdown on Build** — `onChange={(e) => { setExpKey(e.target.value); setBt(null); }}`
   changed the board and left the legs exactly where they were.
2. **`buildHandOff()`** — it copies the legs verbatim onto whatever board it hands them to, from the
   Shortlist, from a saved strategy, from "Monitor" on a position.

A board that lists half-dollar strikes and one that does not are a real pair on these chains, so a
27.5 carried from a nearer SOYB expiry onto 2026-11-20 is a complete explanation. It is **not proven**
that this is what happened, and that is on the NOT VERIFIED list rather than written up as the cause.
Both paths re-snap now (`resnapLegs()` / `expiryStrikes()` in `chain.js`, which is where a fact about
a board belongs), an unloaded chain is left alone rather than snapped against a fallback grid, and
what moved is said on screen in one sentence instead of sliding under the reader.

**0a is the defence that holds whichever it was**, which is why it is in the gate and not in a
validator on the strike field.

### Two things the screenshot raised — reported, and only the wrong one fixed

- **MARKET, on a board with an unquoted leg.** Everything PR #28 built — the per-leg sliders, the
  net, the verdict band — is bypassed the moment MARKET is chosen, and the stat tile underneath still
  read *"at the price below, not at the mid"* when there is no price below. That label names a
  control that is not on the screen, and it is now correct (*"at the touch a market order takes"*).
  The option itself is NOT removed — that is a product decision, not a bug — but it carries
  `marketOrderNote()`, which says in words that it has no price, how wide this book is, and that on
  these chains that is how a $5 structure is filled at several times what it is worth.
- **QTY 14 against `sizing()`.** The figures reconcile exactly: $942 / 14 = $67.3 a combination,
  which is the MARKET SAYS $67 above it, and 14 × 100 × $27.64 = $38,696, which is the notional. So
  **$942 is the total and the gate measured the total**, which is what PR #23 built. The gate
  therefore passed it correctly **only if trading capital is at least $18,840** ($942 ≤ 5% of
  capital); with the capital questions unanswered the suggested $5,000 gives a $250 cap and this
  order would have been blocked. The capital actually set is not readable from here and is on the
  NOT VERIFIED list. **Nothing suggested the 14 into the ticket**: `openOnBuild()` resets the size to
  1 on every hand-off and `applyPreset()` passes none, so 14 was typed. It is worth noting that the
  Shortlist DOES print a suggested "HOW MANY ×N" from the budget and does not carry it to Build — a
  number shown on one screen and retyped on another.

## The decision was eleven blocks long — the trade card (ROADMAP P4)

The owner has now said three times, in his own words: *"si capisce poco dalla UI. Troppe info da
leggere, poco intuitivo."* The bug above blocks the fill; the density is why he could not see it
coming.

Counted on that one Build screen, for ONE decision: a leg-by-leg market table, TWO paragraphs about
an unquoted leg, the quantity, the order type, the time in force, the send button, a
combination-market panel, four stat tiles, a market-versus-model pair, a notional paragraph and an
error box. **The sentence "one leg has no two-sided quote" appeared TWICE** — once in the leg table
and once in the combination panel — inside the panel PR #28 built to stop the CONFLICT paragraph
appearing four times.

### Five fixed lines, and everything else one tap away

`tradeCard()` in `src/rules.js`, with every other generated sentence, so the card cannot drift from
the numbers it describes. `TradeCard` in `App.jsx` renders it as the DEFAULT state of the Build
screen's decision area:

1. **YOU ARE BETTING** — the direction, the level it pays at, the horizon, and where the market is now.
2. **YOU RISK** — the worst case at the size on screen, what share of capital that is, which limit it
   is inside, and what it CONTROLS.
3. **HOW OFTEN IT WORKS** — the one seeded Monte Carlo, with the seasonal table that drifted it.
4. **WHEN IT EXITS** — take profit, exit DTE, and the stop named as the warning it is.
5. **WHAT WOULD MAKE IT WRONG** — the level the exit rule will close it at, and what the four factors
   are saying today.

- **NO NEW ARITHMETIC.** Every figure already existed on that screen: `analyze()` at the price that
  will be sent, `chanceOf()`'s one simulation, `sizing()`'s limits through the gate,
  `notionalControlled()`, and the rules themselves. The card READS them and writes English.
- **NONE OF THE OLD COPY IS CUT.** The stat tiles, the greeks, the ticket and the confirm step all
  open behind a tap, in `DeskSheet` — the same `EvidenceOverlay` the evidence panels use, fixed to
  the viewport and scrolling inside itself, which is also what stops a panel landing below the fold.
  `DeskSheet` lives in `steps.jsx` because it is chrome with no trade in it.
- **A REFUSAL IS NEVER BEHIND A TAP.** Every gate violation — including the two this session added —
  renders on the card, beside the button, under the same rule as "an order that fails must fail where
  the button is". The tap only ever hides figures that explain a trade, never a reason it cannot be
  made.
- **AND IT CLOSED TWO MORE DUPLICATES ON THE WAY.** The gate's verdict was printed above the chain
  and the legs editor, hundreds of pixels from the control it governs; the gate's WARNINGS were
  printed there raw while the collapsed warnings panel above was already printing the same list
  through `warningsToPrint()`. The refusals sit on the card, the warnings in the warnings panel, and
  neither is anywhere else.
- **ONE FACT, ONE PLACE, and it needed a rule rather than another pass.** `unquotedLegNote()` keeps
  its home where the legs are NAMED; every other place on the screen prints `unquotedLegPointer()`,
  which is the same discipline `warningsToPrint()` applies to the CONFLICT paragraph.

### The currency is the broker's

ROADMAP P4 said "what you risk **in euros**". The account is an Alpaca paper account denominated in
US dollars and every figure in this app is a dollar; converting would put a second number on a card
whose whole purpose is that there is one. `cardCurrencyNote()` says it once, on the card, and the
roadmap line is corrected rather than obeyed.

### Laid out for 390px

One column. An 18px rail for the line number and `minmax(0, 1fr)` for the sentence, so nothing can
force a horizontal scroll. Buttons wrap and are full-height. The sheets are the same
`EvidenceOverlay` that was designed against a phone. **This is a statement about the CSS, not a
reading**: nobody has opened it on a phone, and that is the seventh item in a row handed forward that
only a phone can settle.

### What this does NOT do

- **The gate gains ONE rule and loses none.** Six order paths, six, every one through
  `evaluateTrade`. Paper mode is still verified, not assumed. The quality floors are still out of it.
- **`RULES.mcRuns`, the exit rule, the 5% and 25% caps, `terminalMC`, `exitSim` and the provenance
  work of PR #26 through #29 are untouched.** Not one number changed value.
- **It does not make anything fill.** P0 is still open and its DONE WHEN is unchanged: a real fill.

### What a fill would still settle that this PR cannot

- Whether `SOYB261120C00027500` was the only thing wrong with that order. The gate refuses it now;
  whether what is left fills is a market question.
- **The effective price against the fill price.** The record carries `min(limit, ask)`; the broker
  records the fill; `recheckOrders()` still does not compare them. Nothing has ever filled, so the
  two have never been compared. This is P0's, and it is unmoved.
- Whether the indicative feed ever populates `bidSize` / `askSize`, and whether `occ` is ever absent
  on a leg the board really does list — which would make the new refusal a false one.

### SETTLED ON THE OWNER'S PHONE — SOYB, 21 September 2026, 09:14

Four things §4n could only write down as unverified were read off a screen. Each one is moved here
with the evidence that settled it; none of them is still on the NOT VERIFIED list below.

- ~~**NOBODY HAS SEEN THE TRADE CARD, ON A PHONE OR ANYWHERE ELSE.** Seventh in a row.~~
  **SEEN.** The trade card rendered on the owner's phone and **all five lines are on the screen**:
  YOU ARE BETTING, YOU RISK, HOW OFTEN IT WORKS, WHEN IT EXITS, WHAT WOULD MAKE IT WRONG. The
  seven-in-a-row run of "this is a statement about the CSS, not a reading" ends here for the card.
  What is still NOT settled is the only question that mattered underneath it — whether these are the
  five lines that make the screen legible to him — and that stays below.
- ~~**THE CAPITAL ACTUALLY SET IS NOT READABLE FROM HERE.**~~ **READ.** The ticket checklist on that
  screen states **$20,000 of trading capital and a $1,000 per-trade limit**. $1,000 is 5% of
  $20,000, so `sizing()`'s best-practice cap is the binding one and both questions have been
  answered — `answered: true`, no suggested figure in force. This also settles §4n's arithmetic on
  the QTY 14 order: it reconciled "only if trading capital is at least $18,840", and $20,000 clears
  that. **The gate passed that order correctly.**
- ~~**THE WATCHING TAB AND THE POSITIONS / WATCHING / JOURNAL ROW HAVE NOT BEEN SEEN.**~~ **SEEN.**
  The fourth place §4m built is on the phone, in the navigation row beside Positions and the
  Journal, with the three not-taken rows in it. That is also what made TASK 2 below findable: the
  three figures the gate was charging — 450 + 577 + 14 = $1,042 — were sitting in that list, named,
  while the gate called them open risk.
- ~~**WHICH OF THE TWO PATHS PUT THE 27.5 ON THAT BOARD.**~~ **NEITHER. IT WAS A THIRD PATH, AND IT
  IS NOW MEASURED.** §4n named two candidates — the expiry dropdown and `buildHandOff()` — closed
  both, and said neither was proven. Both were wrong. The 27.5 was put there by the Build screen's
  **default preset effect, on the very first render of a fresh market, before any board existed**:

      the effect calls buildPresets(sentiment, spot, U.step, expStrikes) when legs.length === 0
      it fires on the render where `chain` — and so `spot` — arrives
      `expKey` is set by a SIBLING effect in that same render, so `expStrikes` is still null
      snapStrike() then falls back to Math.round(x / step) * step
      SOYB: spot 27.64, step 0.5, Bull Call Spread [0, +0.05]  ->  27.5 / 29

  27.5 is not a strike the app carried from anywhere. It is a strike the app **computed**, from a
  percentage of spot rounded to a grid, because nothing had told it what the board carries. And
  nothing re-snapped afterwards, so the gate's `UNLISTED_CONTRACT` refusal fired on **every fresh
  load of a board that lists whole-dollar strikes** — the app manufacturing its own refusal, for
  every market, not once. That is written up as **§4o** below and it is what made this a P0 blocker
  rather than a loose end.

### NOT VERIFIED

- **THE FIVE LINES HAVE NEVER BEEN READ BY THE PERSON THEY ARE FOR.** The card has now been SEEN
  on a phone and all five lines render; whether they are the five lines that make the screen
  legible to him is a different question and it has not been asked.
- **LINE 3 IS NOT THE LINE ROADMAP P4 ASKED FOR, AND IT SAYS SO.** P4 wanted "how often it works
  under your own exit rule". The app's one chance (`chanceOf()`) is where the price FINISHES; the
  exit-rule answer is `exitSim()` / `exitPathSim()`, which run only on an OPEN position. Computing
  one here would have been new arithmetic, which this session was told not to add. The line therefore
  states which question it answers and says the other is walked once the position is open.
- **NO LIVE CHAIN, NO BROWSER, NO ALPHA VANTAGE, NO DEPLOY.** The same wall as PR #15 through #29.

---

## §4o — THE APP MANUFACTURED ITS OWN REFUSAL, ON EVERY FRESH MARKET

Three faults read off one phone screen on 21 September 2026. The first is the P0 blocker §4n could
only guess at; the other two are a screen and a document that argued with the truth.

### 0. THE DEFAULT PRESET INVENTED STRIKES — and it was not a carry, it was a computation

§4n named two ways a 27.5 could reach a board that lists whole dollars, closed both, and put
"which of them it was" on the NOT VERIFIED list. It was neither. **It was the Build screen's default
preset, on the first render of a fresh market**, and the sequence is four lines long:

1. `legs` starts empty on a new ticker, so the preset effect is armed.
2. It fires on the render where `chain` arrives — which is the render where `spot` becomes readable.
3. `expKey` is set by a **sibling effect in that same render**, so `expStrikes` is still `null` when
   the preset effect runs.
4. `snapStrike(x, null, step)` falls back to `Math.round(x / step) * step`. SOYB at spot 27.64,
   step 0.5, Bull Call Spread at [0, +0.05]: **27.5 / 29**.

Nothing re-snapped afterwards, so those legs sat on the Build screen, went into the trade card, went
into the order ticket, and were refused by the gate — correctly — as `UNLISTED_CONTRACT`. **On every
fresh load of every market whose board does not carry half dollars.** Not a carry from another
expiry, not a one-off: a structural first-render race that made a whole class of market unsendable.

**AN UNLOADED BOARD IS UNKNOWN, NOT A GRID.** The fix is one guard in one place:

- **`buildPresets()` returns an empty list without a board**, so the fallback grid inside
  `snapStrike()` is unreachable from it. The guard is in the function rather than at its four call
  sites for the same reason `snapStrike()` itself lives in `chain.js`: one question, one answer, and
  a fifth generation site added next year is covered without anybody coming back.
- **The preset effect waits.** It no longer fires without `expStrikes`; the chain arrives a render or
  two later and it fires then. An empty legs editor for one render is a far smaller failure than a
  default trade naming a contract nobody issued.
- **Legs already in state are re-snapped when the board arrives** (`resnapLegs()` / `strikeSnapNote()`,
  both already in `chain.js` and `rules.js` from §4n). This is what covers "Go to Build" through
  `goStep()`, which carries the state legs exactly as they are. `resnapLegs()` returns the SAME
  array when nothing moves, so React bails out of the update and it cannot loop.
- **The four callers, and what each does now.** `buildPresets()` is called from the Build screen's
  preset effect (waits for the board), from `shortlistWithFloors()` (the Shortlist memo requires a
  board and the empty state says the board has not loaded, through `unloadedBoardNote()`, rather
  than printing `emptyExpiryNote()`'s "NOTHING CLEARED ON <expiry>" about a board nobody read),
  from the wide multi-market search and from `runWizard` (both read the board through
  `expiryStrikes()` and skip the market when it comes back null, which cannot happen because the
  expiry was reduced out of that chain's own list — it is the belt to that brace).
- **`expStrikes` WAS A SECOND IMPLEMENTATION OF `expiryStrikes()`**, and the wide search and the
  guided run were the third and fourth. All four were the same `new Set([...calls, ...puts])`
  written out again. One function now, in `chain.js`, where a fact about a board belongs.

**FAILURE CLASS 1 — THE DROPDOWN SHOWED A DIFFERENT STRIKE FROM THE TRADE.** `<select value={27.5}>`
over options 16…32 does not render empty and does not warn: **the browser displays the FIRST
option.** So the leg editor read **16** while the trade card two blocks above read **27.5**, and the
order carried the 27.5. One screen, two trades, nothing saying so. `strikeOptions()` in `chain.js`
always includes the current strike, flagged `listed: false` when the board does not carry it, and
`StrikeSelect` renders it as its own **disabled** option reading `offBoardStrikeLabel()` —
*"27.5 · not on this board"*. The leg is shown, it is selected, it can be changed, and it cannot be
chosen. The gate is what refuses the order; this is what stops the screen choosing a different
trade on the user's behalf.

### 1. THE EXPOSURE COUNTED TRADES NOBODY BOUGHT

The phone showed **"$1,042 already at risk"** — 450 + 577 + 14 — against **zero** open positions, and
all three figures were sitting one tab across under WATCHING, correctly labelled as orders the
broker came back on with nothing bought.

`evaluateTrade`'s `portfolio.positions` was `store.positions`, and `store.positions` is what the app
**DECIDED**, not what the user OWNS. §4m split that into three stages and rebuilt every list from
`positionStage()`; the gate was the one consumer that never got the split. So was
`buildReportMd()`'s section 2, whose entire job is to say what is open.

**`bookPositions()` in `journal.js` is the one home**, and it is `owned` + `working`:

- **`working` COUNTS, and the reason is the opposite of the one that makes it not a position:** a
  working order can still fill. The exposure ceiling is not a report of what is open, it is a limit
  on what may be **committed**, and an order standing at the broker is committed. That is a
  different question from `positionStageNote()`'s "the money is not at risk yet", which is about
  profit and loss — there is nothing to value until it fills.
- **`not-taken` NEVER counts, anywhere.** There is no trade there and there never was one.

Read against the $5,000 fixture: $1,041 of phantom risk leaves $209 under the $1,250 total ceiling,
so a $220 trade — comfortably inside the $250 per-trade cap — was refused for an exposure that does
not exist. It did not only print a false number; it spent the ceiling.

**WHAT CHANGED, IN FULL.** The risk gate in `App.jsx`; the weekly report's section 2 (which also
**multiplies by `positionSize()`**, exactly as the gate does — `maxLoss` describes ONE combination,
so a ten-lot spread was being reported at a tenth of the money it risks, and a row above a total
now prints its own size); the report's PDF payoff pages; `reportNarrativePrompt()`'s argument; the
model's `paperPositions` context (which `reportNarrativePrompt()` tells it is AUTHORITATIVE — the
§4c "entered at $68 debit" fault rebuilt one array across); `autopilot.mjs`, which was walking
every record and proposing exits for trades nobody bought; and `approve.mjs`'s gate. The front
page's "N open positions" and the journey counter read `owned` alone, because those words mean
owned and working orders have their own panel on that screen.

**NOT CHANGED, AND WHY.** `nextRef()` in `journal.js` scans every record for the highest ref — the
counter only ever goes up, and a not-taken trade still has a name. The auto-monitor and the bar
loader walk `store.positions` for TICKERS, which is a set of chains to refresh and not a sum of
money. The Watching screen reads `not-taken` on purpose: that is what it is for.

### 2. THE CHECKS SHOWN WERE NOT THE CHECKS THE TAP RAN

The Build screen's checklist — the one thing on that screen that answers *"is this paper?"* — was
evaluated against `LOCAL_BOOK`, *"local simulation, no broker involved"*, while the order ticket
beside it gates against the Alpaca account. Non-negotiable rule 1 is **"if paper mode cannot be
verified, reject"**, and a checklist that answers it about a different account than the send does is
not an answer at all.

They agreed only by luck. The gate reads the account for `paperStatus()` **and nothing else**, and
the app's own book always passes it — so the list the owner read **could not fail**. A checklist that
cannot fail is not a check.

**`bookFor(viaBroker)` in `App.jsx` is the only place this app chooses an account**, and
`riskGate.test.js` fails the build if `LOCAL_BOOK` is named anywhere else:

- The **displayed** `guard` is gated against `bookFor(!!alpaca)`. With the broker connected, the
  route to an order on that screen IS the ticket, so the checklist is the broker's — verified by the
  proxy's own `X-OSL-Paper-Endpoint` header, or by a PA account number, or **not verified at all**,
  which refuses the order and now says so where the button is.
- The **record** is gated against `bookFor(!!alpacaOrder)` — the account the trade actually went to.
  The gate summary goes onto the position's timeline, and it used to say "local simulation, no
  broker involved" in the Journal entry of an order Alpaca was holding.
- `LOCAL_BOOK` survives for the one case it is true of: the confirm step with no broker connected,
  where nothing leaves the browser.
- **And the list says whose account it checked.** `checkedAgainstNote()` in `rules.js` sits under the
  checklist. That sheet holds two taps — the ticket, which sends, and the confirm step, which
  records locally — and the checks shown are the SEND'S, which is the stricter of the two. Saying so
  is cheaper than splitting the checklist in half.

### What this does NOT do

- **Not one rule number changed value.** Take profit 50%, stop 50% warning-only, 21 DTE,
  `terminalMC` and the chance policy, `signals.js`, every liquidity constant and the gate's
  `UNLISTED_CONTRACT` refusal itself are all untouched.
- **The gate gains no rule and loses none.** Six order paths, six. What changed is which book it
  measures and which account it measures against.
- **It does not make anything fill.** P0's DONE WHEN is unchanged: a real fill.

### SETTLED ON THE OWNER'S PHONE — SOYB, 21 September 2026, 10:12-10:15 CEST

Every item §4o put on the NOT VERIFIED list has been read on a real screen except one. Each is moved
out here with the evidence that settled it, and what is left is listed below it.

- **THE PRESET RACE IS CLOSED, AND IT WAS READ.** A fresh SOYB load produced **28 / 29**. The strike
  select shows **28** — not 16, not 27.5 — and the chain row below it is highlighted **+BUY 28 /
  −SELL 29**. Three screens, one trade. This settles both §4o item 1 (nobody had watched a fresh load)
  and §4o item 2 (the dropdown's behaviour was asserted from rendered markup): the dropdown, the card
  and the order now agree on a live board, which is the whole of what failure class 1 was about.
- **THE PAPER CHECK NAMES THE BROKER'S OWN ACCOUNT.** The checklist read *"account number
  PA3E1WPIW9SZ (Alpaca paper accounts start with PA)"*. That is `bookFor(!!alpaca)` working: the
  account the send uses, verified by its number, printed under the checks — not `LOCAL_BOOK`'s "local
  simulation, no broker involved" over an order about to leave for a broker.
- **THE EXPOSURE READS $0 AGAINST THREE WATCHING ROWS.** Open risk **$0** with **3** rows under
  WATCHING, and Positions, the risk gate and the working-order panel all agreeing. That is
  `bookPositions()`: the $1,042 of phantom exposure is gone, and the three trades nobody bought are
  in the one place that is for trades nobody bought. §4o item 4 — *which* of the three rows was the
  QTY 14 order — is retired rather than settled: `not-taken` records no longer reach the gate, the
  report, the model's context, `autopilot.mjs` or `approve.mjs` at all, so no decision anywhere
  depends on the answer.
- **AND THE FOURTH ORDER REACHED THE MARKET.** J-0004, SOYB 28/29 bull call spread, **1
  combination**, DAY limit **$60** (combo bid $4, mid $28, model $35 — so the limit is the combo
  ask), Alpaca status **ACCEPTED**, order id `29fdee45-9104-41f2-87cf-2ea9e00f967d`, sent 04:15 ET.
  §4n's order never got past the broker's validator; this one is at the exchange. **The
  `UNLISTED_CONTRACT` class of failure is closed on live data.**

**STILL NOT VERIFIED: THE FILL.** It was sent at 04:15 ET, before the options open, so nothing could
have filled yet and nothing had. **P0's DONE WHEN is unchanged: a real fill.** Also still open:
`working` counting towards the exposure ceiling is a decision and not a measurement, and the
`/api/state` blob has still not been read directly — $20,000 of capital is inferred from a $1,000
per-trade limit and `sizing()`'s 5% cap, read twice now on two days and two screens, which is
corroboration and not the store.

### THE ONE INCONSISTENCY IN THAT READING — and it is failure class 3

The trade card said **"✓ Inside your rules: risking $44 of $1,000"**. The owner then moved the
ticket's sliders to the ask and sent **$60**. One screen, two figures, one trade.

**BOTH FIGURES ALREADY CAME FROM ONE EXPRESSION.** `AE` on the Build screen is `analyze()` at
`effectiveLimit()`'s net (§4l), and the gate, the card and the ticket are all handed it — there is no
second arithmetic to delete. On this book the seed is the mid plus a quarter of the spread, which is
where the $44 came from, and the ask is $60. What was missing is the two things that made those read
as a disagreement rather than as one figure at two moments:

1. **THE CARD NEVER SAID WHICH PRICE IT HAD READ.** *"$44, and that is the most this can lose"* is
   silent about the $0.44 it was worked out at. `tradeCard()` takes `entry` and `entrySource` now —
   the pair `analyze()` has carried since §4l — and line 2 names them: *"$60 at the $60 debit the
   ticket is holding"*, or *"…at the $28 debit the middle of the market"* when no ticket price is
   readable. A figure with its price attached cannot be mistaken for a figure about a different one.
2. **THE LIMIT CHECK WAS NOT WHERE THE SEND IS.** The sliders live in `DeskSheet`, which covers the
   card while they are being moved, and the per-trade check existed only on the card. The ticket's
   MOST YOU CAN LOSE cell used to carry the note *"the most you can lose"* — its own label, repeated
   — and now carries *"of $1,000 allowed"*, read from the **same `guard.limits`** the card prints.
   Nothing new is computed and no sentence is added: one redundant note is replaced.

`src/ticket.test.jsx` drives the whole chain — `legLimitSeed` → `netFromLegs` → `effectiveLimit` →
`analyze` → `evaluateTrade` → `tradeCard` → the rendered `OrderTicket` — at the seed AND at the ask,
and holds the three figures equal at each of them. The fixture is the live book ($4 / $28 / $60) and
the test fails if the two prices stop being different trades.

### NOT VERIFIED

- **NO FILL.** The only item left from §4o's list, and it is P0's.
- **`working` COUNTING TOWARDS THE CEILING IS A DECISION, NOT A MEASUREMENT.** Nothing in this
  sandbox can say how often a working order fills. If it turns out they almost never do, this makes
  the ceiling tighter than it needs to be — which is the side to be wrong on.
- **THE `/api/state` BLOB HAS NOT BEEN READ.** $20,000 of capital is inferred from the $1,000
  per-trade limit printed on two different days.
- **NO BROWSER HERE.** The card's new clause and the ticket's new note are held against
  `renderToStaticMarkup`, like everything else on a screen in this repository. The owner has now read
  the screens around them, which is what settled the rest of this list.

---

## §4p — THE LIQUID COMMODITY TIER, AND A FACTOR THAT DOES NOT APPLY

ROADMAP P2-bis. **GLD, SLV, USO, XLE, GDX** join SOYB, CORN, UNG, BOIL and WEAT. The basket is ten.

### Why, and it was read on the phone

SOYB and CORN produced **"0 of 2 shown"** and a wall of refusal text. That is not a bug — the floors
are measured and they are doing their job — but it means most of what is on screen is an explanation
of why there is nothing on screen. The grain chains carry ten or eleven reporting strikes at the
~45-day horizon this app aims for, spreads this repository has measured at 66-166% of the mid, and
combination spreads that routinely exceed the whole net. Almost nothing can clear four floors there.

These five are real commodities, so the seasonal engine still applies; their option books are an
order of magnitude deeper; and the notional per contract is larger. **Calibrating P2's edge on a
liquid chain is worth far more than calibrating it on CORN.**

### NOT ONE NUMBER IS INVENTED FOR THEM — failure classes 1 and 5

Three things every existing row carries are deliberately absent from the five new ones, and
`src/liquidity.test.js` fails the build if any of them appears:

- **NO `SEASONAL` ROW.** Seasonality is **UNKNOWN** until Alpha Vantage's real monthly history loads.
  `seasonalProvenance()` reports `missing`, `chanceOf()` returns null, every screen prints a dash and
  the sentence — *"There is no seasonal reading for GLD at all… a drift of zero would be a claim that
  GLD goes nowhere, which is a different thing from not knowing."* That machinery has existed since
  §4j; what is new is that five markets actually reach it. A hand-written row would be a fifth
  estimate on a table this repository has already measured as wrong on eight months of twelve.
- **NO `SIGMA` ROW.** `sigmaProvenance()` falls to `RULES.fallbackSigma` and says on screen that the
  number was **CHOSEN, not measured** — until the same Alpha Vantage read supplies the measured
  realised volatility it has always returned beside the means (§4k).
- **NO PER-MARKET `iv`.** `RULES.fallbackIV` is the one home for "the implied volatility the options
  are priced at when nothing else is known", and `ivProvenance()` already says so wherever it is
  used. Writing 0.15 for GLD out of memory is exactly the estimate-as-a-reading this codebase keeps
  refusing. The live chain quotes its own IV per contract, and that is what every figure is worked
  out at the moment it lands. **See NOT VERIFIED: 0.25 is a poor guess for GLD and it matters for
  unquoted legs.**

**`step` IS A FALLBACK AND ONLY A FALLBACK.** Strikes are a property of the board
(`expiryStrikes()`), `buildPresets()` refuses to build without one (§4o), and `snapStrike()`'s grid
is unreachable from it. The listing increments are there so a dropdown has something to offer before
the chain lands, not so a trade can be built on them.

**EVERY READER OF `monthlyMean` NOW GOES THROUGH ONE HOME.** `seasonalOf()` / `seasonalNowOf()` in
`App.jsx` wrap `seasonalProvenance()`, and there were **eleven** raw `…monthlyMean[NOW_MONTH]`
readers, every one of which would have thrown on `undefined[8]` — and the guard people reach for
instead is `|| 0`, which prints a market as having no seasonal edge when nobody has measured one. The
Radar row, the Build stat tile, the monthly bar chart, the agreement panel, the weekly report, the
model's `scanner` context, the position thesis and the Guardian all read the one expression now.

**AND `autopilot.mjs` HAD THE WORST VERSION OF IT.** `SEASONAL[pos.ticker] || SEASONAL.SPY` — for any
market without a hand-written row, a brief written overnight would have drifted that position's
chance on **the S&P 500's seasonality** and called it the position's own. It passes `|| null` now and
gets `missing`.

### WEATHER DOES NOT APPLY TO A METAL — and that is not a quiet zero

`weatherApplies()` / `weatherNaReason()` / `factorsOf()` in `src/signals.js`.

Nothing about a forecast moves an ounce of gold. Scoring GLD's weather as **0/100** would put a
quarter of the weighted sum on a question that has no answer, drag every score toward zero, and —
worse — spend one of the four slots the CONFLUENT / MIXED read is counted out of. A market with three
real factors would then look *less* certain than one with four, purely because a fourth had been
invented and then silently failed.

**TWO CASES, AND THEY ARE DIFFERENT:**

- **DOES NOT APPLY** (weather on a metal): dropped from the weights, from the agreement count and
  from the confidence denominator. The remaining weights are **renormalised** so they still sum to
  one — the quarter is spread over the other three in proportion, not left unused — and the bar
  renders `n/a` with the reason behind a tap instead of an empty 0/100 bar.
- **APPLIES BUT IS UNKNOWN** (no forecast loaded; no seasonal history yet): **kept**, contributing
  nothing. Not knowing something that does matter is real uncertainty about this market and belongs
  in the score and in the confidence. Only the first case is an exclusion.

**IT IS DERIVED, NEVER A SECOND LIST.** `REGIONS` already declares which markets each region drives;
a hand-typed "these have weather" beside it would be two answers to one question. **The four weights
are unchanged in value** — `BASE_WEIGHTS` is the same 30/25/25/20 — and `why.jsx` prints the scale
from `fused.weights` instead of the sentence it used to have typed into it, so it can no longer
describe a scale nothing was measured against.

**CONFLUENT STILL NEEDS THREE AGREEING.** On a three-factor market that means all three, which is a
*higher* bar than three of four. Deliberately: there is less evidence, so the word has to be harder
to earn, not easier. Scaling the bar with the count would have made a market with a factor removed
look more certain than one with it.

**CRUDE AND ENERGY EQUITIES ARE EXCLUDED TOO, AND THAT IS A JUDGEMENT.** A Gulf hurricane really can
shut crude production in. But this app's regions measure crop stress and heating/cooling degree days,
and neither of those is what moves a barrel — so rather than invent a hurricane region, storm supply
risk reaches USO and XLE through the **news** rules, and `weatherNaReason()` says exactly that on
screen. On the NOT VERIFIED list.

### News: eleven new rules, each with its one-line why

Same shape as everything already in `TAG_RULES` — a regular expression, the markets it moves, and one
line saying why. Gold and silver: rate cuts and real yields, the dollar both ways, reserve and haven
buying, and solar demand for silver's industrial half. Crude: OPEC (the existing rule reaches USO and
XLE now), EIA crude inventories, Hormuz / Red Sea / tanker attacks, refinery outages, and US shale
output. Miners: mine disruption, plus every gold rule, because a miner's revenue is the gold price
and its costs are not.

**A HEADLINE WHOSE DIRECTION DEPENDS ON THE NUMBER IS TAGGED `0`**, exactly as the USDA and EIA
storage rules already are. A guess dressed as a direction is worse than saying the print decides.

**AND THE ORDER OF THE LIST IS NOW LOAD-BEARING.** `tagImpacts()` gives each ticker to the FIRST rule
that claims it. The macro catch-all — `fed|fomc|interest rate|inflation|cpi|payrolls|recession` — sat
in the middle of the list, which was harmless with SPY as its only ticker and stopped being harmless
the moment the metals were added to it: *"Fed signals a rate cut as real yields fall"* matched both it
and the sharper rule, and the catch-all won, so a clearly bullish headline for gold was tagged
ambiguous. It is last now, with a comment saying why, and a test holds each of the eleven.

### The Radar must not get longer when the basket does

`radarSplit()` / `radarQuietNote()` in `rules.js`. A market with something on it keeps its full row.
**Every market with nothing collapses into ONE line**, which names them and keeps the two facts apart
— *"6 markets with nothing to show — nothing cleared on CORN, SOYB · not searched yet: GLD, SLV, USO,
XLE."* Each name in that line is still the button that opens that market, so nothing is removed from
the app, only from the page.

**IT COLLAPSES EVEN WHEN EVERY MARKET IS QUIET.** A first run has searched nothing, and ten identical
rows saying *"not searched yet — use the search below"* is exactly the screen this exists to stop.

**TEXT BUDGET: this REPLACES, it does not add.** The per-market sentence inside every quiet row is
gone; one line carries the same two facts. The ticket's MOST YOU CAN LOSE note replaced its own
repeated label. The only genuinely new sentences are `weatherNaReason()` — which appears where the
weather bar used to draw an empty 0/100 — and the card's price clause, which replaced silence about
the one number that had moved.

**And the wide search now opens on GLD, SLV, USO** instead of SOYB, CORN, UNG. The selection is still
the user's and every market is one tap away underneath it, but the default it offers should be a
search with results in it.

### The Alpha Vantage quota at ten markets

25 requests a day, free tier. A cold start spends **ten** of the twenty-five; the server cache's TTL
is seven days, so steady state is at most ten a week. When the quota is spent:

- a cached answer inside the TTL is served, as always;
- a cached answer **outside** the TTL is served as `cache-stale`, carrying its age in days and Alpha
  Vantage's own refusal text, and the screen prints both;
- with **no** cached answer the endpoint returns the refusal and that market's seasonality stays
  **UNKNOWN**. `seasonalProvenance()` reports `missing`, `chanceOf()` returns null, screens print a
  dash and the sentence, and the four-factor read scores that market with its seasonal bar reading
  "no seasonal history".

**There is no fall back to a table**, because for five of the ten there is no table to fall back to —
and inventing one is the failure this whole section is about.

### THE PREDICTION, WRITTEN BEFORE THE MEASUREMENT

On a board near 45 DTE, at the RECOMMENDED liquidity setting, of the eight presets
`shortlistWithFloors()` builds per direction, **how many clear all four floors** (liquidity, per-leg
spread, combination spread, reward-to-risk) plus `priceability()` and `modelSanity()`:

| market | predicted to clear | why |
|---|---|---|
| **GLD** | **7 of 8** (6-8) | penny-to-nickel markets, open interest in the thousands on $1 strikes |
| **GDX** | **6 of 8** (5-8) | one of the most heavily traded ETF option books there is |
| **SLV** | **6 of 8** (5-7) | deep, slightly wider than GLD in absolute cents on a lower price |
| **XLE** | **6 of 8** (4-7) | good depth, $1 strikes, but a lower-volatility book so nets are small |
| **USO** | **5 of 8** (3-7) | decent but the thinnest of the five, and the wildcard |
| **SOYB** | **0-2 of 8** | measured: "0 of 2 shown" |
| **CORN** | **0-2 of 8** | same chains, same reading |

**AND THE FALSIFIABLE PART, which is the one worth measuring:** the floor that does the cutting on
the grains is the **COMBINATION spread** (`comboSpreadFloor`, 100% of net), not open interest — the
per-leg floor passes and the pair does not, which is the §4l fault the combination floor was built
for. On the metals I expect `comboSpread` to cut **at most one** of the eight and open interest to cut
**none**. If the grains turn out to be cut by `liquidity` instead, the diagnosis in this PRD is wrong
and the liquidity percentile is the number to look at rather than the pair ceiling.

### SEEN ON THE OWNER'S PHONE — 21 September 2026, five screens, deploy preview 32

**THE LIQUID TIER WORKS, AND THE PREDICTION IS PART-MEASURED.** Everything below is read off the
screens, not from the code.

**1. The depth is what P2-bis was for, and it is now a number.** The Shortlist's own
`OpenInterestReadout` — which reports and never estimates — on the chains loaded in that session:

| market | contracts near the money | whole chain | clear the 10-contract minimum, near the money |
|---|---|---|---|
| WEAT | 50 | 208 | 72% |
| SOYB | 60 | 202 | 48% |
| BOIL | 120 | 427 | 70% |
| **XLE** | **526** | **1,492** | **74%** |
| **USO** | **900** | **2,788** | **88%** |

**Eight to eighteen times the population near the money**, which is where every structure is built.
That is the whole thesis of this section, measured on live chains rather than argued.

**2. Nothing was cut on XLE, at any setting.** *"3 of 3 structures on XLE are shown at this
setting"* — and the same "3 of 3 shown" under STRICT, RECOMMENDED, RELAXED and OFF. **The
falsifiable half of the prediction holds for XLE: the combination-spread floor cut none of them and
open interest cut none of them.** The grain half is NOT measured — SOYB and CORN were not searched
in that session.

**AND THE DENOMINATOR IN THE PREDICTION WAS WRONG.** It said "of the eight presets
`shortlistWithFloors()` builds per direction". For VERY BULL on XLE it built **three**. The
7-of-8 / 6-of-8 figures predicted are therefore not comparable to what was read; what IS comparable,
and what held, is how many were REMOVED: zero.

**3. The 10-contract absolute minimum is what binds on a deep chain, and that is new.**
*"On 2026-10-23 the 10-contract absolute minimum is what binds: the 40th percentile of the 82
contracts there is only 7."* `minPeersForPercentile` was moved 12 → 8 because the GRAIN chains carry
ten or eleven reporting strikes; on a chain with 82 contracts on one expiry the relative half is
still not the binding rule. That is an input to ROADMAP P2, not a change to make here.

**4. The feed-reliability check fires on a liquid chain too, and proportionally less.**
*"THIS FEED LOOKS UNRELIABLE ON 2026-10-23. 1 of its 78 neighbouring strike pairs are priced in an
impossible order … the 53 put is priced above the 52 put"* — against BOIL's five of twenty-five.

**5. Seasonality really does load for the new markets.** XLE reads *"SEASONAL SOURCE · Alpha Vantage
· 11y"*, *"seasonal +0.1%/mo (11y history)"*, and the trade card says *"Drifted on XLE's MEASURED
seasonality: 11 years of monthly prices, read today."* No hand-written row was needed and none was
invented.

**6. Weather says why it does not apply, and the scale says what it was measured on.** On XLE:
*"Weather — n/a — why not?"*, and under the bars *"The score above is these 3 weighted together:
seasonality 40%, price trend 33%, news flow 27% — weather does not apply to this market, so it is
not in the score and its share is spread over the rest."* Both generated, neither typed.

**7. The Radar collapsed to one line.** *"8 markets with nothing to show — …"* under two full rows,
with every name still a tap.

**8. §4o's card fix is on the screen.** *"YOU RISK — $267 **at the $83 credit the ticket is
holding**… That is 3.8% of capital, inside your $350 per-trade limit"*, and inside the order sheet
*"MOST YOU CAN LOSE $275 — **of $350 allowed**"*. **That closes the seven-pull-request-old debt for
the trade card, the ticket, the Watching tab and the five-line layout: they have now been seen.**

**9. A fifth order is at the broker.** J-0001, XLE Bull Put Spread (credit), 1 combination, limit
**$75** GTC, Alpaca **accepted**, id `e98ad0e8-3a2e-4a1b-8c76-4e6c95d62ac0`. Alpaca's own panel shows
**two** orders waiting — this one and the morning's `limit @ 0.6 · day`, which is §4o's SOYB order,
still unfilled. **Still no fill.** Trading capital on that phone is **$7,000** ($350 per trade, $1,750
total), not the $20,000 §4o inferred.

### THREE THINGS THE SAME FIVE SCREENS CAUGHT, AND ALL THREE ARE FIXED HERE

**A. A ROAD TOLD THE USER IT WAS DRIFTED ON A TABLE THAT DOES NOT EXIST.** The Shortlist road card
for XLE: *"This record carries no seasonal stamp … Drifted on the HAND-WRITTEN seasonal estimate for
XLE, not on measured prices. That table is wrong on eight months of twelve"* — four lines under a
header reading *"SEASONAL SOURCE · Alpha Vantage · 11y"*, and on the same trade whose Build screen
said *"Drifted on XLE's MEASURED seasonality"*. **XLE has no hand-written row at all.**

The cause is one argument. `toCandidate()` spelled `seasonalStampFields(x.mc)`. A `chanceOf()`
result carries the facts as `seasonalSource` / `seasonalYears` / `seasonalAgeDays`;
`seasonalStampFields()` reads a **provenance**, whose fields are `source` / `years` / `ageDays`. All
three came back `undefined`, the road went out unstamped, and `seasonalStampOf()` reads an absent
stamp as the hand-written table — the right reading for a record written before stamps existed, the
wrong one for a road generated three seconds ago. And where `chanceOf()` returns null, as it does for
a market with no seasonal reading at all, there was no object to read from in the first place. It
takes `seasonalFor(x.tk)` now: the same provenance `chanceFor()` drifted that candidate on, so the
stamp and the arithmetic cannot disagree. `ceiling.test.jsx` holds the two shapes apart by name.

**B. THE RADAR DENIED HAVING LOOKED AT MARKETS THE PARAGRAPH ABOVE NAMED.** One screen, four lines
apart: *"4 of them came through to the shortlist (BOIL, WEAT, XLE and USO)"* over *"8 markets with
nothing to show — not searched yet: BOIL, USO, UNG, …"*. BOIL and USO cleared every floor and were
simply not the two roads taken forward. `marketFacts` only ever knew roads, wide-search hits and the
markets the floors emptied, so a board the guided run priced and did not choose fell through to
"nobody has looked". **Collapsing the quiet markets into one line is what put those two sentences
next to each other** — the gap is older than the line, the contradiction is not.

`radarSplit()` takes `searched` now, `runWizard` records the boards it read, and the sentence claims
only what it can support: **"looked at, nothing on the radar: BOIL, USO · not searched yet: GLD, …"**.
Not "nothing cleared" — their structures *did* clear.

**C. THE ROAD CARD PRINTED A SIGNAL SCORE NOBODY ELSE AGREED WITH.** The XLE road card read
*"+24 / 100 · 56 / 100 — XLE: 1 of the 3 factors points higher … the heaviest reading is news flow at
89/100"*, while the Radar row and the Build screen both read *"+57 / 100 · 69 / 100 … the heaviest
reading is the price trend at 100/100"*. One market, one day, three screens, two answers. The
candidate carries the fusion from the moment the guided run finished — **before the daily bars had
loaded**, so the trend factor read 0 — and nothing refreshed it. `WizardCandidates` takes `fusedFor`
and the evidence panel reads today's fusion, falling back to the snapshot only when there is no live
one. The snapshot is not removed: a card with no reading at all would be worse.

### NOT VERIFIED

- **NO FILL. STILL.** Two orders are at the broker, both accepted, neither filled.
- **THE GRAIN HALF OF THE PREDICTION IS UNMEASURED.** SOYB and CORN were not searched in that
  session, so "0-2 of 8" and "the combination spread is what cuts them" are still predictions. The
  liquid half is measured only on XLE; GLD, SLV, USO and GDX have still never had a Shortlist run.
- **THE APP'S WORKING-ORDER COUNT AND THE BROKER'S DISAGREE — 1 against 2.** The app lists the
  orders it holds records of and Alpaca lists the account's; the local store had been reset and
  renumbered from J-0001, so the morning's SOYB order has no record. Both panels are labelled and
  neither is wrong, but nothing on that screen SAYS why the two numbers differ.
- **THE LIQUIDITY FLOOR'S CONSTANTS WERE MEASURED ON THE ORIGINAL FIVE**, on the 2026-09-01 close.
  `LIQUIDITY_MEASUREMENT` says so and is unchanged. `/api/liquidity` now covers all ten but **has not
  been run against them**, and the `minPeersForPercentile` of 8 was tuned to grain chains with ten or
  eleven reporting strikes — on a board with a hundred it is not the binding consideration it was.
- **`RULES.fallbackIV` (0.25) IS A POOR NUMBER FOR GLD**, whose implied volatility runs closer to
  half that, and a low one for GDX. It only bites on a leg the chain does not quote — every quoted
  contract is priced at its own IV — but that is exactly where `modelSanity()`'s denominator lives,
  so an unquoted leg on GLD could be judged against a model priced at twice the right volatility.
  The honest fix is a measured per-market IV, which is the same Alpha Vantage work as the sigma.
- **EXCLUDING WEATHER FROM USO AND XLE IS A JUDGEMENT, NOT A MEASUREMENT.** The alternative was to
  invent a Gulf-hurricane region, and inventing a region is worse than routing the fact through the
  news rules and saying so.
- **THE ELEVEN NEWS RULES ARE WRITTEN, NOT MEASURED.** They are held against eleven synthetic
  headlines. XLE's card shows three headlines tagging it and WEAT's nineteen, so they do fire on a
  real feed — but nobody has read the headlines themselves to see whether the tags are right, or how
  often a real headline matches two rules and the first one wins.
- **THE SEASONAL ENGINE APPLIES TO THESE MARKETS AS AN ASSERTION.** Gold has a documented seasonal
  pattern and crude a strong one; GDX and XLE are equities whose seasonality is their underlying
  commodity's plus the equity market's, which this app does not separate. XLE's measured September
  reading is +0.1%/mo — almost nothing — which is consistent with either story and settles neither.
- **THE SNAPSHOT A ROAD CARRIES IS STILL A SNAPSHOT.** Fix C makes the evidence PANEL read today's
  fusion, but the road's own ranking — which two roads were chosen, and in what order — was decided
  on the reading at run time. Re-ranking live would mean the two cards swapping places under the
  reader, so it is deliberately not done, and nothing on the card says the ranking is older than the
  panel beneath it.

---

## §4q — CREDIT LIMITS WERE SENT AS DEBITS, AND THE READ-BACK HID IT

**THE FIRST FILL THIS APP HAS EVER HAD, AND IT IS A FAULT REPORT.** ROADMAP P0's
DONE WHEN has been "an opening order is really filled on the paper account" for six pull
requests. It filled. It filled because the order was wrong.

### The reading — Alpaca paper account, 21 September 2026

J-0001, XLE Bull Put Spread 2026-10-30, **−1 62.5P / +1 59P**. The ticket said **CREDIT
$75**, time in force GTC. The gate passed it, the card agreed with the ticket, the
confirm step agreed with both.

Alpaca now holds it as an **OPEN POSITION**:

| leg | quantity | average price |
|---|---|---|
| XLE261030P00059000 | +1 | 1.12 |
| XLE261030P00062500 | −1 | 1.16 |

= a net **credit of $0.04 a combination**. **$4 received against $75 intended.** The
maximum loss is **$346** instead of $275 — the spread is 3.50 wide and the credit that
was supposed to reduce it did not arrive — and the Positions screen reads **−$112**.

And Alpaca's own Orders panel, the same day, states the convention in two fields side by
side: the XLE 2-Leg Order reads **"Limit @ $0.75"** — no minus, a debit — beside **"Avg.
Fill Price −0.04"**, the credit printed as a negative.

### The cause — one `Math.abs()`, in the one place that spells the body

```js
export function unitLimit(comboLimit, factor, perContract = 1) {
  const d = ...;
  return (Math.abs(+comboLimit || 0) / d).toFixed(2);   // <- here
}
```

**Alpaca's multi-leg `limit_price` is SIGNED.** Positive is a debit — "pay at most this";
negative is a credit — "receive at least this" (alpaca-py's `LimitOrderRequest` reference
for multi-leg orders, and the broker's own display above). So `+0.75` on a structure the
app meant to SELL for 0.75 was read as **"pay up to 75 cents for it"**. Against a book
quoting that spread as a credit, an offer to pay is marketable by a wide margin: it filled
at once, at whatever the book gave, which was four cents the other way.

A **single-leg** order is different and stays unsigned: its own `side` already says which
way the money goes, and Alpaca rejects a negative limit on one.

### IT IS THE ORDER'S DIRECTION, NOT THE STRUCTURE'S

The same structure is a credit one way and a debit the other, so the sign is
`sign(structure net)` **flipped when the intent is close**:

| | structure net | order limit |
|---|---|---|
| open a credit structure (bull put) | −0.75 | **−0.75** you receive |
| open a debit structure (bull call) | +0.24 | **+0.24** you pay |
| close a debit structure | +0.64 | **−0.64** you receive |
| close a credit structure | −0.37 | **+0.37** you pay |

**The closing half had never been read by anybody.** Closing the butterfly or a bull call
spread with `Math.abs()` offers to BUY BACK what the order is selling — which a market
maker meets at any price at all. `src/autopilot.test.js` carried that fault as an
EXPECTATION (`assert.equal(body.limit_price, "0.48")` on a long call spread being closed);
that assertion is now `"-0.48"` and says why.

### ONE HOME FOR THE SIGN

- **`limitDirection(structureNet, intent)`** in `src/order.js` — +1 debit, −1 credit,
  0 unreadable. The only place the rule above is written.
- **`mlegLimitPrice(structureNet, factor, intent)`** — the string an mleg body carries.
  It **rounds first and decides the sign after**, the same rule `money()` keeps: a net of
  −0.0001 rounds to zero and `-0.00` is a direction the number does not have.
- **`unitLimit()` keeps its job and its name**: the MAGNITUDE, for the single-leg body and
  for every screen that compares a price against a bid and an ask.
- **The callers hand over the SIGNED net.** `pro.jsx`'s ticket keeps `limit` (the
  magnitude, for the screen and for the "is this a price at all" guard) and passes
  `signedLimit` to `orderBody()`. `placeExit()` and `approve.mjs` already passed
  `ladderNet()` and `closeLimitPrice().net`, both signed — those two were only ever wrong
  because `orderBody()` threw the sign away.
- **`rules.js` said the opposite and was corrected.** `closeLimitPrice()` and
  `openLimitPrice()` both carried the comment *"`limit` is the MAGNITUDE, because that is
  what `orderBody()` sends"*. It was true and it was the bug. They return `net` (signed,
  for the order) and `limit` (magnitude, for the ticket), and the comments now say which
  is which and why.

### AND EVERY DISPLAYED LIMIT SAYS DEBIT OR CREDIT, IN WORDS

The read-back is the second half of this fault and the reason it survived: **three screens
printed `Math.abs()` of the broker's own number**, so nothing anywhere showed that a credit
spread had gone out as a debit. The app sent the wrong number and then hid it on the way
home.

- `orderWaitingPhrase()` and `orderOutcome()` in `order.js` — a credit fill said "at
  $0.04" where the truth is "you received four cents".
- `App.jsx`'s `alpacaLimit` on the position record, and its `sent` timeline sentence.
- The working-orders row on Positions, which rendered `money(p.alpacaLimit * 100)` — a
  credit and a debit of the same size read identically.

**`limitWords()`** ("a credit of $0.75 (you receive it)") and **`limitKind()`** (the one
word, for a screen that formats its own dollars) are the two spellings, and a price that
cannot be read gets **no sentence at all** rather than "$0".

### THE TEST THAT REFUSES IT AGAIN

`src/order.test.js` holds all six directions (bull put open, bull call open, bull call
close, bull put close, butterfly open and close), the single leg unchanged, the size still
leaving the price on a five-lot, and `-0.00` never appearing. Two sweeps fail the build:
no source file may take `Math.abs()` of a `limit_price` or a `filled_avg_price`, no order
path may hand `orderBody()` a magnitude (`limit: Math.abs(…)`, `limit: limitStr`), the
mleg branch must be priced by `mlegLimitPrice()` and the single-leg branch by
`unitLimit()`, and `App.jsx` may not render `money(p.alpacaLimit * 100)` without the word
beside it.

### NOT VERIFIED

- **NO ORDER CAN BE SENT FROM THIS SANDBOX.** No broker keys, and the egress proxy refuses
  the CONNECT. **The sign is checked against Alpaca's documented convention and against the
  broker's own display of this very order, and against nothing else.** Only a deploy can
  send one.
- **THE CLOSING DIRECTION HAS NEVER BEEN SENT AT ALL**, in either spelling. Nothing has
  ever been closed through this app.
- **WHETHER A CORRECTLY SIGNED CREDIT ORDER FILLS IS A MARKET QUESTION.** The $75 was
  probably never available: the fill says the book was near zero. The next correctly signed
  order may simply sit, which would be the right outcome and would look like a regression.
- **THE XLE POSITION IS STILL OPEN AND STILL WRONG.** This changes what the app SENDS; it
  cannot unwind a fill. That position carries a $346 maximum loss against a $4 credit and
  is the owner's to close.

---

## §4r — THE FILL THE APP COULD NOT SEE, AND ONE CHAIN WITH TWO VERDICTS

### 1. A FILLED POSITION LISTED AS AN ORDER STILL WAITING

**Read on the owner's phone, 21 September 2026, one screen, one minute:**

```
YOUR POSITIONS (0) · Nothing is open
XLE  Imported from Alpaca · WORKING · A ? order, which time in force not recorded
--- and directly below, the broker's own panel ---
OPEN POSITIONS:  XLE, 2 legs
ORDERS WAITING:  MULTILEG limit @ 0.6 · day          (that is J-0004, SOYB)
```

The app called the XLE **position** a waiting order, and did not list the SOYB **order**
at all. Read down the screen, the two look swapped.

**THE CAUSE IS ONE SENTINEL.** `importAlpaca()` wrote

```js
realEntry: true, alpacaId: "sync", alpacaLive: true,
```

`"sync"` is a sentinel, not an order id, and no status was written beside it.
`positionStage()` saw a truthy `alpacaId`, asked `orderLifecycle()` about a record with no
status and no `filled` flag, correctly got **"unknown"** — unknown is not dead — and
returned **"working"**. So every position imported from the broker's own holdings was filed
as an order still waiting to fill. The `?` and the "time in force not recorded" on that row
are the same fault seen from the other end: the screen was printing an order's fields for
something that is not an order.

And it could never resolve. `recheckOrders()` then asked Alpaca for `GET /v2/orders/sync`,
which 404s into a catch that swallows its own failure by design. The record was stuck as
"working" for ever, which is why the app had "the fill it cannot see".

**`/v2/positions` RETURNS ONLY WHAT THE ACCOUNT HOLDS.** There is nothing pending about it:
no order id, no limit, no time in force. So:

- **`isBrokerHolding(pos)`** in `journal.js` is the one home, and `positionStage()`
  short-circuits on it: a holding is `owned`, full stop. It recognises the legacy `"sync"`
  spelling too, because a record saved by an earlier build is still in `localStorage` and
  in the `/api/state` blob and has to read correctly on the FIRST render after this ships,
  not after a write.
- **NO ORDER FIELD IS INVENTED FOR IT.** The record carries `alpacaHeld: true` and
  `alpacaId: null`, and **no `alpacaStatus`** — writing `"filled"` there would be the app
  asserting an order the broker never told it about, which is the same class of fault as
  the sentinel it replaces.
- **IT IS A FILL, SO IT CARRIES THE PRICE IT FILLED AT.** `entryNet` is already the sum of
  the broker's own `avg_entry_price` per leg; it is stamped **`entrySource: "fill"`**, the
  sixth use of "the absence of the stamp is the marker".
- **THE SIZE IS MEASURED, NOT ASSUMED.** The legs carry the broker's own quantities and
  `payoffExp` multiplies by them, so `contracts: 1` here is the real per-combination unit
  and `contractsAssumed` is correctly absent.
- **THE EXIT PLAN STARTS, AND NAMES ITS DATE.** The timeline gets three entries: a `fill`
  naming the legs and the net, a note about the limit (below), and a `plan` — *"Exit plan
  starts now — close at 50% of max gain, or at 21 days to expiration. On this expiry the
  21-day mark is 2026-10-09."*
- **`recheckOrders()` no longer asks about records that are not orders**
  (`p.alpacaId && p.alpacaId !== "sync"`).

**UNKNOWN IS STILL NOT DEAD.** A real order the broker has not been asked about is still
`working`, and a test holds that: the fix must not buy its correctness by burying genuine
unknowns.

### 2. THE LIMIT AGAINST THE FILL — the comparison P0 has owed since PR #28

PR #28 handed this forward and every session since repeated it: *"the record carries
`min(limit, ask)`; the broker records the fill, and `recheckOrders()` does not reconcile
the two. Nothing has ever filled, so they have never been compared."*

Something has filled. **`fillVsLimit({ limit, fill, contracts })`** in `journal.js` is the
comparison, on the SIGNED numbers both ways, because a credit received and a debit paid of
the same size are as far apart as two prices can be. On J-0001 it reads:

> You offered a debit of $0.75 a combination and the broker filled it at a credit of
> $0.04. That is $79.00 BETTER than you asked for, across 1 combination.

— which is arithmetically true and is the §4q fault stated in the app's own words, because
the "better" price is a credit of four cents on a trade meant to collect seventy-five.

`orderStatusRecheck()` carries it onto the timeline when and only when the broker says
filled, and the position record gains `alpacaFillPrice` (signed). The Positions row prints
the sentence under the size.

**IT NEVER INVENTS THE LIMIT.** An imported holding has no intended price — the app did not
send that order, or sent it before its local record was cleared — and the sentence says so:
*"The price you offered and the price you got cannot be compared here, because this record
does not carry the limit the order was sent at. Nothing is estimated in its place."*
`Number(null)` is 0 and 0 is finite, for the **sixth** time in this repository: the nulls go
out before the coercion, and a real zero on either side is still a real reading.

### 3. WHY THE APP'S ORDER COUNT AND THE BROKER'S DISAGREE

PR #32 handed forward: *"the app's working-order count and the broker's disagree, 1 against
2 … both panels are labelled and neither is wrong, but nothing on that screen SAYS why the
two numbers differ."*

**Two causes, and they are different facts.** One was the sentinel above — a holding counted
as an order. The other is real and arithmetic cannot fix it: the local store was reset, so an
order the broker is still holding has no record in this app at all.

**`orderReconciliation(working, brokerOrders)`** in `journal.js` names it. The app cannot
invent the record; it can say the order exists, that it can still fill, that the broker's own
panel is the authority on it, and that this app can only cancel or re-price the orders it has
records of. **An unasked broker is not an empty one** — the sentence is null until
`alSync` has been answered — and when the two agree there is no line at all. The WORKING
panel now opens for a gap as well as for the app's own rows, because with zero records and
one order at the broker it previously said nothing whatsoever.

### 4. ONE CHAIN, ONE OPEN INTEREST, ONE VERDICT

**Read in the same session.** The Radar said:

> On BOIL, WEAT, USO, SLV and GDX the feed reported no open interest at all, so the
> liquidity floor was SKIPPED.

The GDX 2026-10-30 chain was on screen printing open interest per strike (as of
2026-09-17). The Shortlist read GDX's near-the-money **median OI 84**, **76% clearing the
10-contract minimum**, and removed *"the 63 emptiest of the 96 contracts"*. And the guided
run's **number-one road** was a GDX Bearish Put Butterfly 94.5 / 89×2 / 85 **with legs at
OI 3 and OI 4**.

**Two paths, two verdicts, one chain — and the difference is a return value.** Open
interest is not in an option snapshot; it comes from the trading API's contract list and is
**patched in** after the chain is on screen. So `refreshChain()` sets the bare chain, fires
the enrichment, and **returns the bare one**. The Shortlist reads `chains[tk]` out of state,
which by then carries the numbers. The wizard and the wide search read what `refreshChain()`
handed back, which never does.

- **`ensureOpenInterest(tk, chain)` in `App.jsx` is the one home.** The SCREEN still never
  waits — `refreshChain()` fires it and moves on, exactly as before, and that rule was
  always about the screen and never about a caller holding a liquidity floor. A caller that
  is about to JUDGE open interest awaits it. The promise is memoised per chain object, so
  the background fire and the awaiting caller share one fetch.
- **UNKNOWN IS STILL SKIPPED, NEVER REJECTED.** A chain that genuinely carries no open
  interest comes back unreported and the floor still skips. That half was always right and
  a test holds it, together with the rule that a real `0` is a real reading and still fails.
- `enrichOpenInterest()` is now called in exactly one place, and a test fails the build if a
  second appears or if a generation site awaits the bare chain.

### 5. BUTTERFLIES LEAVE THE GUIDED PATH — and it is a SHAPE, not a name

ROADMAP P2 decided this and nobody had implemented it: *"drop butterflies from the guided
path (pTP near 0: incompatible with the 50% take profit before the 21-DTE exit)."*

A butterfly is worth its maximum only **at** the middle strike **at** expiry. Half of that
maximum is therefore out of reach while there is time value left, and this app closes at
`RULES.exitDTE` — 21 days out. So the take-profit rung of a structure the guided flow
offers as a **first trade** can essentially never be hit, and the trade ends at the
calendar every time. That is a fine trade for somebody who chose it; it is a poor one for
somebody being taught what a rule is for.

- **`isButterfly(legs)` in `rules.js` reads the SHAPE.** "Bearish Put Butterfly", "Iron
  Butterfly", "Call Butterfly ATM" and "Bullish Call Butterfly" are four spellings today
  and a fifth is one preset away. A butterfly is the structure whose **short legs all sit
  on ONE strike with long legs on both sides of it** — which is exactly what makes its peak
  a point. An iron condor has its shorts on TWO strikes and is not caught; a vertical has
  nothing above or below its short and is not caught. All six cases are tested.
- **It sits beside the single-leg exclusion in `runWizard`, and nowhere else.** The
  Shortlist, the wide search and the Build screen are untouched: a hand-built trade is the
  user's to make, the same line the quality floors are drawn on. A test fails the build if
  `isButterfly` appears more than once in `App.jsx`, and another holds the four preset names
  in `buildPresets()`.
- **ITS COUNT TRAVELS SEPARATELY AND IT IS NOT A FLOOR.** A butterfly is not refused for
  being a bad price; it is not offered here at all, for a reason about the EXIT RULE rather
  than about the market. `floors.butterfly` and `butterflySkipNote()` have their own
  sentence in `verdictNarrative()`, exactly as `unpriceable` does.

### What this does NOT do

- It does not re-price, re-send or unwind the XLE position. Only the owner can close it.
- It does not change any floor's number, any exit parameter, the Monte Carlo, the seasonal
  drift, the signal weights or the 5% / 25% caps.
- It does not give the app a second opinion about anything the broker reports. Every number
  here is Alpaca's own, read rather than re-derived — which is the standing rule this whole
  section is an instance of.

### NOT VERIFIED

- **NONE OF THIS HAS BEEN SEEN ON A PHONE**, which is now the **eighth** pull request in a
  row handing that item forward.
- **THE IMPORT PATH HAS NOT RUN AGAINST A LIVE ACCOUNT SINCE THE CHANGE.** The record shape
  is tested; the fetch is not reachable from here.
- **NO FILL COMPARISON HAS EVER RENDERED.** `fillVsLimit()` is tested on the numbers read
  off the broker's panel, and the sentence has never been on a screen.
- **THE `orderReconciliation()` LINE HAS NEVER FIRED.** It needs `alSync` to have been
  answered by a real account.
- **THE OPEN-INTEREST FIX IS STRUCTURAL, NOT MEASURED.** Whether the guided run now removes
  that GDX butterfly for LIQUIDITY as well as for shape — and what else the floor removes on
  the four other markets the Radar reported as unmeasured — cannot be read from here. It is
  the first thing to look at on the next live run.
- **HOW MUCH THE GUIDED POOL SHRINKS IS UNMEASURED.** Removing butterflies leaves the
  `verybear` and `verybull` families with one multi-leg preset each and `neutral` with the
  iron condor alone. "Only one road survives" is already a refusal the app knows how to
  make, and it may now be reached more often. Nobody has run it.
- **ALPACA REPORTS `delta` AND `theta` PER CONTRACT AND THE APP STILL COMPUTES ITS OWN**
  (`netGreeks()` in `App.jsx`, Black-Scholes at the app's own IV). It is the same species of
  fault as the two above — re-deriving what the broker already reported — and it is
  deliberately NOT touched here rather than widened into unasked scope. It is the obvious
  next thing.

---

## §4s — THE THREE DEBTS PR #33 LEFT, AND THE ORDER THAT DID NOT AGREE WITH ITS OWN MARKET

The standing rule: a session starts with what the last one flagged. PR #33 flagged three
things and each one is closed here.

### 1. A RECORD WRITTEN BEFORE PR #33 CARRIES AN UNSIGNED LIMIT

PR #33 made Alpaca's multi-leg `limit_price` SIGNED on the way out, and stored the broker's
own echo of it on the position record as `alpacaLimit`. Everything written before that stored
`Math.abs()` of it — the very `Math.abs()` that sent the XLE credit spread out as a debit.

So ONE FIELD NOW HOLDS TWO DIFFERENT QUANTITIES depending on WHEN it was written, and nothing
on the record said which. `fillVsLimit()` compares DIRECTIONS on it. `limitKind()` printed one
in words. Both are completely confident, both are wrong on an older record, and **the record
the owner has in front of him is exactly such a record**: J-0001, limit 0.75, fill −0.04.

- **`commitPosition()` stamps `alpacaLimitSigned: true`** beside every limit it stores.
  **THE ABSENCE OF THE STAMP IS THE MARKER**, for the SEVENTH time in this repository, after
  `contractsAssumed`, `simExitDTE`, `seasonalSource`, `driftAnnual`, `entrySource` and the
  `"sync"` holding.
- **`storedLimitOf(pos)` in `journal.js` is the one way a stored limit is read back.** An
  unstamped one gets `kind: null` and `words: null` — there is no word for a direction nobody
  recorded — and a `note` that says so. Never read the field directly again.
- **`fillVsLimit()` makes NO comparison on an unstamped limit.** Not on directions and not on
  magnitudes either: read as signed, J-0001 is $79 better than the offer; read as a magnitude
  written before the sign existed, it could be $71 worse. Two different answers, and the app
  has no way to choose between them, so it says which fact is missing and stops.
- **IT IS NOT A MIGRATION AND MUST NOT BECOME ONE.** The direction cannot be recovered: the
  order is at the broker and the record never held the sign. Inferring it from the structure's
  own net would be inventing the evidence, which is the fault §4q was.

### 2. THE EXIT LADDER PRINTED A BARE MAGNITUDE

PR #33 said every displayed limit says debit or credit. It missed the one place it matters
most. `GuardianPanel`'s three exit-ladder buttons rendered
`$${Math.abs(ladderNet(...)).toFixed(2)}` with no word anywhere on the button — **and those
are the buttons the owner will use to close XLE J-0001, the first close this app has ever
sent.**

`signedLimitFor(structureNet, intent)` in `order.js` gives a screen the signed number an order
of that intent would carry, built on `limitDirection()` so the rule that a close flips the
sign stays spelled once. `ladderRungPrice()` in `pro.jsx` is the one spelling, and the
arithmetic is unchanged: the magnitude is the same number it always was. A sweep in
`order.test.js` fails the build on `Math.abs(ladderNet(` and on any displayed `Math.abs()` of
an identifier named after a limit.

### 3. THE BODY THAT LEAVES MUST AGREE IN SIGN WITH THE BOOK IT MEETS

The check that would have caught J-0001 at the door. It went out as `limit_price: "0.75"` — a
DEBIT — into a book quoting that bull put spread as a CREDIT. **An offer to pay, dropped into
a market that is paying you, is marketable by the whole width of the structure**: it filled at
once at four cents the other way.

`limitAgainstBook({ limitPrice, book, intent, legCount })` in `rules.js` compares the sign of
the price the body will carry against the sign of `comboBook()`'s mid, with the intent applied
to both. It imports `limitDirection` from `order.js` — leaf-ward, exactly as `rules.js`
imports `engine.js` — so the sign is still decided in one place.

- **OPEN is a gate violation**, `LIMIT_AGAINST_BOOK`, **ENTRY ONLY**, like `UNPRICEABLE`,
  `UNLISTED_CONTRACT` and `IMPOSSIBLE_LOSS`. It needs NO new evidence: `quotes` and `net` are
  already carried by every open-intent gate call, and the gate spells the body's own price with
  the same `mlegLimitPrice()` `orderBody()` uses, so it reads the order rather than a number
  that resembles it.
- **CLOSE is never in the gate.** Refusing a close strands somebody in a position they asked to
  leave, which is the worse failure by a distance. It is refused beside the button in
  `placeExit()`, in `closeGroup()` and in `approve.mjs`.
- **FOUR UNKNOWNS SKIP, AND EACH NAMES ITSELF**: no limit (a market order has none), no book (a
  leg without a two-sided quote means there is no book, never a book of zeros), a mid under
  `MIN_NET_DOLLARS` (that is `priceability()`'s question and refusing on it twice would name the
  wrong rule), and a single leg (whose own `side` carries the direction, so the body is
  deliberately unsigned).

---

## §4t — ORDERS SPEAK ALPACA'S OWN CONTRACT

**There is no official JavaScript SDK for multi-leg option orders.** Every field name, every
enum value and every validator lived in four order paths and a serverless function as four
separate acts of memory — and every fault this repository has had on an order body was that
memory being wrong: the GCD 422, the unlisted symbol, and the sign on a credit limit.

`src/alpacaContract.js` mirrors **alpaca-py**, the reference implementation, with the file each
rule came from cited beside it: `OptionLegRequest`, `OrderRequest`, `MarketOrderRequest`,
`LimitOrderRequest`, the enums `OrderSide` / `PositionIntent` / `TimeInForce` / `OrderClass` /
`OrderType` / `OrderStatus`, and the root validators with their exact messages. No Python is
vendored — the Python it mirrors is QUOTED, in comments, so the mirror can be checked — and no
dependency was added.

- **`orderBody()` BUILDS THROUGH IT.** The leg is `optionLegRequest()`, which decides `side` and
  `position_intent` from ONE table so the two vocabularies cannot disagree, and the finished
  body is held against `validateOrderRequest()` before it leaves. All six order paths pass
  through that one function, which is the only reason one check is enough: **a body alpaca-py
  would not build is refused with the rule named, instead of after a 422 round trip that names
  it worse.**
- **TWO RULES ARE NOT ALPACA-PY'S AND ARE MARKED AS THIS APP'S OWN**: a leg whose `side`
  contradicts its own `position_intent` (alpaca-py accepts either field alone; this app sends
  both, and a body where the two disagree is a body it built wrong), and the relatively-prime
  ratio rule that Alpaca answered with **422 / 42210000** on 2026-09-04 and that alpaca-py does
  not check at all.
- **THE RESPONSE SHAPES ARE MIRRORED TOO.** `parseOrder()` and `parsePosition()` read what the
  broker says, with `limit_price` and `filled_avg_price` keeping their SIGN, and `wireNumber()`
  is the one place the nulls go out before the coercion — alpaca-py types those fields
  `Optional[Union[str, float]]` because the wire sends strings, and `Number("")` is 0.
  `order.js` reads its lifecycle lists off the mirrored `ORDER_STATUS`.

### ALPACA'S OpenAPI SPEC CANNOT VALIDATE AN MLEG BODY

It exists — `alpacahq/alpaca-docs`, `oas/trading/openapi.yaml`, the machine-readable
description of `POST /v2/orders` — **and it predates multi-leg options entirely.** Read on 21
September 2026, the whole document contains no `mleg`, no `ratio_qty`, no `position_intent` and
no request schema for `legs` (its one `legs:` is a RESPONSE field, *"an array of Order entities
associated with this order"*). Its `OrderClass` enum reads, in full:

```yaml
enum: [simple, bracket, oco, oto, '']
```

So there is nothing in the spec to hold an mleg body against, and the suite says that rather
than implying a validation that did not happen. What the spec CAN still settle is the
vocabulary the two order classes share — `OrderType`, `TimeInForce`, `OrderSide` — and those
three are held against its own enums, quoted verbatim.

**AND ALPACA'S DOCUMENTATION STATES THE SIGN CONVENTION IN ITS OWN WORDS**, which is a second
and independent confirmation of §4q: *"For the mleg order class, a positive value indicates a
debit (representing a cost or payment to be made) while a negative value signifies a credit
(reflecting an amount to be received)."* The suite also runs Alpaca's own documented multi-leg
example — the SPY long straddle — as a fixture, so the mirror is held against a body the broker
published and not only against bodies this app wrote.

---

## §4u — THE CHART CARRIES THE INDICATORS, AND A COPILOT THAT READS THEM

### 0. `PriceChart` WAS RENDERED BY NOTHING

It has been exported from `pro.jsx` since the desk was built and mounted by no screen in the
app. The candles, the volume, the support and resistance lines, the break-evens and the leg
lines were all code nobody could see — and everything below would have been invisible with it.
It is mounted in the **History evidence panel** now, which is the panel whose whole subject is
what this market has done.

### 1. `src/indicators.js` IS THE ONE HOME

Pure functions over daily bars, importing nothing: SMA(20/50/200), EMA(9/21), Bollinger(20,2),
RSI(14), MACD(12/26/9), ATR(14), and volume against its 20-day average. Every period is a named
constant in `PERIODS` with its reasoning beside it.

**They are deliberately NOT in `RULES`.** That file is the single source of the TRADING rules —
what the app will and will not do with money — and a moving-average length decides nothing the
app does. It decides what a line on a chart is.

**`signals.js` READS ITS TREND FROM HERE AND ITS OUTPUTS DO NOT CHANGE.** The four-factor
engine has carried an inline SMA20/SMA50 + RSI14 body since it was written, and the chart drew
none of it — so the moment the chart gained a moving average there would have been two SMA20s
in this app, and the score would have read the other one. That is the fault this repository has
already fixed for the chance of profit (§4h), the seasonal drift (§4j), the realised volatility
(§4k) and open interest (§4r.4). `indicators.test.js` reproduces the OLD body verbatim and
holds every field equal over 200 readings across 40 seeded series, with all three trend values
and a crossing exercised — **because a refactor that moves a number is two changes wearing one
coat.**

### 2. THE RSI IS NOT WILDER'S, AND THE FILE SAYS SO

Wilder's original smooths the average gain and loss the way an exponential average does. This
app has always used the SIMPLE mean of the last 14 changes — the variant usually attributed to
Cutler — and moving the trend read into one file must not move the score.

So the chart draws **THE SAME reading the score uses**, and this app has one RSI rather than
two that look alike. The consequence is real and stated out loud in the file, in the copilot's
context and on the NOT VERIFIED list: a charting package will print a slightly different number
on the same bars. Switching is a measured decision nobody has made, and it is ROADMAP P8.

### 3. UNKNOWN IS NOT A NUMBER, AND NO LINE IS DRAWN FROM ZERO

Every series is the same length as its input with `null` wherever there were not enough bars. A
200-day average on 120 bars is not a 120-day average and it is not zero: it is nothing. The
chip for it cannot be switched on and says "not enough history"; the takeaway becomes the
sentence naming how many bars are missing; the copilot's context lists it under
`indicators_not_available`. `Number(null)` is 0 and 0 is finite — caught again here, in
`volumeRead`, by this file's own test on the first run.

### 4. THE CHART, LAID OUT FOR 390px

- **Overlays on the price pane** (the averages and the band), because they are prices.
- **RSI and MACD in their own small panes, COLLAPSED by default.** A 0-100 oscillator drawn
  against a $20 stock is a flat line at the top of the screen, and a phone that opens with
  three charts on it has taught nobody anything.
- **A chip row, remembered per viewer** in `localStorage`, every read and write wrapped: that
  store throws in a private window and the chart has to render correctly without it.
- **A crosshair readout** that reads the same arrays the lines were drawn from — never
  recomputed for the tooltip, which is how a tooltip comes to disagree with its own line. On a
  phone there is no pointer, so it falls back to the last bar and says which it is.
- **One generated `takeaway()` per indicator**, the visual contract in `CLAUDE.md`.
- **The existing lines stay**: support, resistance, break-even, entry and the legs.
- **The averages are computed from ALL the bars that loaded and only the tail is drawn.** A
  200-day average taken from the 180 days on screen would be a 180-day average with the wrong
  name on it — and at 90 days it would not exist at all while the data to form it sat in the
  same reply.

### 5. THE COPILOT UNDER THE CHART NEVER RECEIVES RAW BARS

Four one-tap questions and a free box, directly under `PriceChart`, on the existing streaming
path (`askAI` takes a system prompt now; no new endpoint and no new key).

**THIS IS THE RULE THE PANEL EXISTS FOR, and it is a rule about arithmetic rather than tone.**
A model handed 400 daily closes will compute a moving average, and the number it computes will
not be the number drawn six inches above its answer. So it is handed `taContext()` from
`indicators.js` and nothing else: the last values, the crossings with their dates, the bands,
and — when a trade is loaded on Build — that structure's own legs and break-evens, REPEATED
from `analyze()` and not recomputed. Every figure in it is one some part of the screen is also
showing.

`taCopilotPrompt()` lives in `rules.js`, because a generated prompt is a generated sentence and
because the report's prompt INVENTED A POSITION once — the only reason that fault is testable
today is that the sentence which caused it is in a file a test can read. It forbids producing
any figure not in the context, requires every number to be quoted from it, says that a null
field is UNKNOWN and never zero, and states the educational register: what the indicator
MEASURES, what it is SAYING now, and what would make that read WRONG. The disclaimer appears
once. It may not recommend a trade, a strike or an expiry.

The state lives in `App.jsx` (an evidence panel owns no state), the answers render with the
existing `Markdown`, and a cut-off answer is labelled cut off and is not filed in the Journal.

### 6. AND THE DESK PROMPT RECOMMENDED WHAT THE APP REFUSES TO OFFER

ROADMAP P3's first item, open since the guided path was built. `SYSTEM_PROMPT` in `pro.jsx`
read *"strong bullish seasonal signal + uptrend → bull call spread (small capital) or LONG CALL
(larger capital)"* and *"event ahead with low IV → long ATM STRADDLE/STRANGLE"*. Every one of
those is a structure this app will not put in front of this user: a long call is a single-leg
long option, which `runWizard` excludes and which `payoffCeiling()` gives no maximum profit and
so no take-profit rung; a straddle and a strangle are two single-leg longs bought together, and
a short strangle is an uncovered leg, forbidden outright.

**A copilot that recommends a structure the screen beside it will not build is the app arguing
with itself, and the part that argues in prose wins with a reader who is learning.** The trees
are rewritten around what the app actually offers — debit verticals, credit verticals when the
options are expensive against their own history, iron condors — with **RECOMMEND NOTHING** as a
named branch, and the excluded structures listed with their reasons. The chart copilot does not
inherit any of it: it has its own prompt and may not propose a trade at all.

---

## §4v — ONE VOICE: THE MENU THE GATE REFUSED, THE POSITION THAT SAID FIVE THINGS, AND THE PARAGRAPH PRINTED FOUR TIMES

The SIXTH live reading, 22 September 2026, sixteen screens. The owner's words:
**"ancora abbastanza confusione, troppe info, trade suggestion non chiari."**

Three faults, and none of them is an arithmetic error. Every number on those screens was
correct. What was wrong is what the app SAID with them.

### 0a. A HOLDING WRITTEN BEFORE THE STAMP NEVER UPGRADED

XLE **J-0002** is a position Alpaca ITSELF lists under `/v2/positions`, and the app showed it
as *"1 contract — assumed, not recorded"*, with one timeline entry, no fill entry, no exit
plan, and no `fillVsLimit()` sentence anywhere on the row.

**THE CAUSE IS A `continue`.** `importAlpaca()` builds a signature per broker group and skips
any signature already in `store.positions`:

    if (known.has(sigOf(g.und, g.exp, g.legs))) continue;

That is right about ADDING and wrong about everything else. PR #33 (§4r.1) gave a holding
`alpacaHeld`, `entrySource: "fill"`, the broker's own measured size and two timeline entries —
and every record written BEFORE it matches the signature, so the upgrade could never reach it.
**The one holding the owner actually has is exactly such a record.**

A MATCH IS NOT A REASON TO DO NOTHING. It is a reason to UPGRADE: the sync is already holding
the broker's own legs and the broker's own average entry prices, which is every input the
missing fields need. `upgradeHolding()` in `journal.js` is the one home — whether a record is a
holding, how big it is and where its price came from are facts about the RECORD.

  - **THE SIZE IS MEASURED**, from the broker's own leg quantities through `reduceRatios()`, so
    it clears `contractsAssumed` rather than agreeing with it by luck. Measured is not assumed
    even when the two agree on the number.
  - **NO ORDER FIELD IS INVENTED**: no `alpacaStatus`, no limit, no time in force. The broker
    named a HOLDING. And the direction of a limit this app once sent is at the broker, not in a
    positions payload, so **an unstamped limit stays unstamped** and `fillVsLimit()` goes on
    refusing to compare it (§4s stands).
  - **IT RETURNS THE SAME OBJECT WHEN NOTHING CHANGES**, so React bails out and the 60-second
    sync cannot loop. Running it twice is running it once.

### 0b. ONE P&L PER POSITION, AND IT IS THE BROKER'S

The Positions screen printed **−$127** in the largest red figure on the card, directly above
the broker's own panel printing **−$130** for the same XLE position. Two numbers for one trade,
three dollars apart, neither labelled.

`posAlerts` already preferred Alpaca's `unrealized_pl`; the Positions CARD, rendering a few
hundred lines further down, re-derived its own from `netValue(legs, spot, …) − entryNet`.

CLAUDE.md, in the owner's own words: **the broker's numbers are READ, never re-derived.**
`unrealized_pl` is on that list; the app's mark is a MODEL of it, and a model beside a
measurement is not a second opinion — it is a contradiction the reader has to arbitrate.

`positionPnl()` in `rules.js` decides which of the two sources a figure came from and carries
the sentence when it is the app's own — the same shape as `markProvenance()`. **The app's mark
survives only where there is no broker figure, and it SAYS so, naming the feed it priced from.**
`pnlOf()` in `App.jsx` is its one spelling there, and `riskGate.test.js` fails the build on a
second `netValue(…) − p.entryNet` or a second read of `.unrealized_pl`.

**AN UNASKED BROKER IS NOT A BROKER REPORTING ZERO** — `Number(null)` is 0 and 0 is finite, for
the eighth time in this repository. A real `0` from the broker is still a real reading.

### 1. THE APP BUILT A MENU OUT OF TRADES ITS OWN GATE REFUSES

The Radar and the multi-market search both ran at **"HORIZON ~21 DTE"**. Every structure they
offered sat on **2026-10-16, twenty-four days out**. Taking any of them to Build produced, at
the bottom of that screen:

    ✗ THIS ORDER WOULD NOT BE SENT
    ENTRY_DTE_ROOM — 3 days of room against the 30-day floor

**That is worse than an empty screen.** An empty screen with a sentence teaches the rule; a
menu that dead-ends teaches that the rules are arbitrary.

THE CAUSE IS THREE DIFFERENT EXPIRY WINDOWS IN THREE PLACES, none of them the rule:

    runMultiScan   dte >= dT - 20 && dte <= dT + 35     at dT=21: ONE to 56 DTE
    runWizard      dte >= minEntryDTE && dte <= 130     a bare 130, and maxEntryDTE is 90
    the dropdown   every expiry the feed lists          no filter at all

`buildableExpiries()` / `openableBoard()` in `rules.js` is the one home, built ON `entryRoom()`
so there is no second spelling of the floor. A board is buildable when the gate would pass it
**without an override**, and inside `maxEntryDTE`; the horizon yields when nothing is inside it
and the floor never does, which is `expiryChoice()`'s rule read from one place.

>>> **THE OVERRIDE IS NOT WITHDRAWN.** <<< `entryRoom()`'s middle band still unlocks with a
typed reason and `passedOver` is still offerable. What changes is that the app will not OPEN a
menu there by itself: **a door you may choose to walk through is not a corridor you are led
down.**

  - **THE THIRD GENERATION SITE HOLDS THE GUARD INSIDE ITSELF.** `shortlistWithFloors()`
    returns nothing on an unbuildable board and says `offFloor`, the same reasoning that puts
    `buildPresets()`'s null-board refusal in the function rather than at its call sites. An
    empty list and "this board was never one the app opens on" are different answers.
  - **THE HORIZON SLIDER READS ITS RULE AT BOTH ENDS.** `min` was 21 — `RULES.exitDTE` wearing
    a horizon's clothes — and the label says why in one clause.
  - **THE DROPDOWN AND THE SENTENCE NAME THE SAME BOARD.** The `<select>` offered every expiry
    the feed lists while the line under it described `expChoice.chosen`, so the owner's screen
    read **2026-10-16** above **"Building on 2026-11-20"**. A refused board renders DISABLED and
    NAMED (`offFloorExpiryLabel()`, the `strikeOptions()` pattern), and `expiryChoiceNote()`
    takes the SELECTED key.
  - **"Go to Build — <structure>" IS NEVER OFFERED FOR A STRUCTURE THE FLOORS REMOVED.** It
    carried whatever was in the Build screen's legs, which after a refusal is the structure the
    list above has just said it will not offer.
  - **A REFUSAL AND A REASSURANCE MAY NOT SHARE A CARD.** The owner read "THIS ORDER WOULD NOT
    BE SENT" and, four lines below, "none of them stops the order" — §4m's fault on the card
    §4n built to end it. While a violation stands the refusal is the whole verdict.

**THE TEST**: every candidate every generation site returns is put through `evaluateTrade()` in
a dry run and must come back with **zero violations**, against the real `shortlistWithFloors`
and `analyze` out of `App.jsx` — and the fixture proves the gate really does refuse 24 DTE, so
the filter is load-bearing rather than decorative.

### 2. A POSITION SAID FIVE THINGS, AND TOGETHER THEY SAID NOTHING

Read on XLE, in ONE scroll:

    home      "all inside the plan. Nothing to do"
    desk      "TODAY · EVERYTHING IS ON PLAN"
    the row   "Losing: check the reason you opened it"
    verdict   "→ HOLD"
    stat      "OF THE MAXIMUM  −3188%"

For a trade that can make **$4** and can lose **$346**.

**THE MISSING FACT IS ON NONE OF THEM.** A position is judged at entry on what it pays against
what it risks (`RULES.minRewardRisk`), and that question is then never asked again. The §4q
inversion turned J-0002's $75 credit into $4 against $346 — a reward-to-risk of **0.01** against
a floor of 0.25 — and nothing has asked since.

`remainingEdge()` in `rules.js` asks the ENTRY question of an OPEN position, in **two readings**,
because they answer two questions and one number could not:

| reading | question | XLE |
|---|---|---|
| `ratio` | would the rules OPEN this structure today, at today's price? | $131 to make against $219 to lose = **0.60**, passes |
| `ceilingRatio` | was this trade EVER something the rules would offer? | **$4 against $346 = 0.01**, forty times under the floor |

The first is not a mistake; it is the honest answer to that question. The second is the fact all
five lines were silent about. **Either being thin is an attention item**, and the sentence names
both dollar figures and which reading fired.

>>> **IT IS NOT AN EXIT RULE.** <<< The exit rules are chosen at construction and FROZEN — 50%
of max profit, 21 DTE, the stop as a warning — and none of them changed. Nothing auto-closes,
`AUTOPILOT_VERDICTS` is untouched, `ruleExitOf()` does not know this exists, and it is **not in
the gate**. It is a WARNING, exactly like the stop, and a test holds all of that.

  - **THE HEADLINE IS DERIVED FROM THE LIST.** Both headlines counted alerts at level `action`;
    a `watch` row is not one, so a position the app had just told the reader to check sat under
    a headline saying there was nothing to check. `attentionCount()` is the one home —
    `decisions` draws the badge, `looks` is everything not on plan — and no headline may call
    the book quiet while `looks` is above zero.
  - **"OF THE MAXIMUM" PRINTS A PERCENT ONLY ABOVE `MIN_NET_DOLLARS`.** −$127 against a $4
    maximum is −3188%: a true division and a false sentence. The rule is `rewardRisk()`'s —
    nothing divides by a figure under the minimum — and below it the stat says so in words.
  - **ONE CLOSE CONTROL PER POSITION.** Two buttons on two screens for one act, and only the
    Positions card's asks WHY and files the answer. The broker panel's button survives for the
    case that is genuinely its own — a holding with no record here, which
    `orderReconciliation()` already names and which would otherwise have no way out of this app.
  - **REPORT SECTION 2**: a working order is **"sent, not filled"**, never "opened at", listed
    APART from positions while still counted in the exposure, exactly as `bookPositions()`
    already decides. SENT is not FILLED, applied to the one consumer that read the book and then
    described all of it as open.

### 3. EACH EXPLANATION ONCE PER SCREEN — AND IT IS MEASURED

Counted on those screens: the floor paragraph — `qualityFloorSentence()`, **162 words** —
rendered TWICE on the Radar and TWICE on the Shortlist; the four-factor CONFLICT narrative
across Build and its overlay; *"Every figure on this card is in US dollars"* on every card.

**THE RULE IS `warningsToPrint()`'S RULE MADE GENERAL**: a long generated explanation has ONE
HOME PER SCREEN, and everywhere else prints a one-line pointer naming where the full text is.

>>> **FOLD, NEVER DELETE.** <<< `Fold` in `steps.jsx` — chrome with no trade in it, and the one
file both `App.jsx` and `pro.jsx` can import without a cycle — puts a summary **with its count**
always on screen and the full text one tap behind it, so nobody has to open it to learn whether
it is worth opening. `filterFold()` in `rules.js` does the same for the nine separate paragraphs
that explained why a structure was not on the Shortlist.

>>> **AND A REFUSAL IS NEVER FOLDED.** <<< The rule that a gate violation renders beside the
button is older than this one and outranks it. What folds is an EXPLANATION of a rule; what
never folds is the app saying no.

**MEASURED, NOT ASSERTED.** `src/wordcount.mjs` reads the SOURCE — the three step blocks,
expanded through the components they mount — and counts **words at rest**: what is behind a
fold, a sheet or a tooltip is one tap away and does not count. That is what makes "fold, never
delete" falsifiable rather than a slogan.

| screen | `main` | now | change |
|---|---:|---:|---:|
| Radar | 1,162 | 378 | **−67.5%** |
| Shortlist | 1,881 | 998 | **−46.9%** |
| Build | 963 | 908 | −5.7% |
| **total** | **4,006** | **2,284** | **−43.0%** |

Both sides measured by the same counter over a **whole-tree** checkout of `main`. Swapping only
`App.jsx` under today's components reads 3,867 instead of 4,006 — a 3.5% error in the direction
that flatters this session, which is why the recorded number is the worktree's.

**WHAT THE COUNTER DOES NOT CLAIM.** Generated sentences are scored at their current wording
whichever tree is read, so the delta measures SITES REMOVED OR FOLDED and never rewording —
deliberately, because rewording is the thing this task must not do. Conditional branches are
counted in full: a block with three mutually exclusive empty states renders one and this counts
three. It is an upper bound applied identically to both sides, which is what makes the RATIO
meaningful even though the absolute number is not a screenshot. A generator with no fixture
scores zero and is NAMED in `uncounted`, so the coverage of the measurement travels with it.

Also in this task:

  - **THE HEADER CARRIES NOTHING THAT ASKS NOTHING OF THE USER.** *"IV RANK · 6d collected"* is
    a progress bar for a number that is not yet a number, in the row the reader scans first on
    every screen. The rank stays when it EXISTS — it is what `RULES.expensiveIVRank` refuses a
    trade on — and the collection counter moved to the History overlay.
  - **A TEST IS NOT A TRADE.** Three records opened and closed by hand within the minute at zero
    P&L moved the owner up a level and spent his "patience" budget. `isTestRecord()` needs all
    THREE conditions — zero P&L, same calendar day, closed by hand — because each alone is an
    ordinary trade: a scratch, a day trade, a manual close. **THEY ARE MARKED, NEVER DELETED**:
    the Journal is what happened, and deleting a record to make a score look better is the
    opposite of what that screen is for.
  - **REPORT SECTION 6 IS THIS PERIOD'S**, not the last five ever: a weekly report reprinting an
    analysis from three weeks ago says something happened this week that did not. And an
    analysis claiming it can route or place an order is **FLAGGED, not quoted** — rule 5 is that
    nothing executes without an explicit human confirmation, and a document reproducing a model
    saying otherwise, over the app's own signature, is the app contradicting its own rule in its
    own report. It stays in the Journal; it is named, not reprinted.

**THE TEST FAILS THE BUILD** if any sentence over 20 words renders twice on one screen, and it
proves it can SEE one rather than passing by construction. It found a real site on the first
run: `{looseningWarning(x) && <div>{looseningWarning(x)}</div>}` generates the sentence twice to
render it once.

**AND IT CAUGHT AN OVER-TRIM ON THE SAME DAY.** `order.test.jsx` failed on the order ticket's
footer: *"every order goes through the risk gate first"* is rule 5 standing beside a send button,
and nothing else in that component said it. Deleting it was over-reading this task's own rule.
Restored, and the failure is recorded here rather than quietly fixed.

### NOT VERIFIED

- **NO ORDER CAN BE SENT FROM THIS SANDBOX. TENTH SESSION IN A ROW.** No broker keys, and the
  egress proxy refuses the CONNECT.
- **NOT ONE OF THESE SCREENS HAS BEEN SEEN ON A PHONE.** Tenth in a row — and this one's whole
  subject is what a screen looks like. Every fold, every summary line and every trimmed
  paragraph has been read in code and in a passing build, and on no screen. **A fold is a
  judgement about what somebody will tap**, and nobody has tapped one.
- **`upgradeHolding()` HAS NEVER RUN AGAINST A REAL `/v2/positions` PAYLOAD.** It is tested
  against a record shaped exactly like J-0002 and a group shaped like the sync's own, both
  hand-built. Whether the live payload produces the group shape this assumes is unverified.
- **THE BROKER-PREFERRED P&L HAS NEVER BEEN READ OFF A LIVE ACCOUNT EITHER.** `positionPnl()` is
  tested on both branches; which branch the owner's screen takes depends on `alpacaLive` and on
  the leg match in `pnlOf()`, and that match has run against a fixture only.
- **THE WORD COUNT IS A HEURISTIC AND SAYS SO.** "Prose" is four or more tokens of which 60%
  look like English words; conditional branches are counted in full; six generators in `.jsx`
  files cannot be scored by a plain-node counter and are named rather than silently zeroed.
  **The 43% is a ratio between two runs of the same heuristic, not a count of pixels.**
- **NOBODY HAS ASKED THE OWNER WHETHER THE FOLDS FOLD THE RIGHT THINGS.** The choice of what is
  an EXPLANATION (folds) against what is a REFUSAL (never folds) was made here, from the rules
  in CLAUDE.md, and not with him.
- **`remainingEdge()`'S SECOND READING HAS NO THRESHOLD OF ITS OWN.** It reuses
  `RULES.minRewardRisk`, which was chosen for ENTRY. Whether the bar for holding should be the
  same as the bar for opening is a product decision nobody has taken, and 0.25 is itself an
  inherited default like the rest of §4.
- **WHETHER J-0003 FILLED IS UNKNOWN** — SOYB 28/30, a debit of $0.80, GTC. It was sent before
  this session and nothing here can ask the broker.
- **THE ANTHROPIC USAGE LIMIT DISABLED EVERY AI FEATURE UNTIL 2026-10-01.** Report section 5,
  the desk copilot and the chart copilot were all dead on the reading this session is built
  from, so `copilotOverreach()` has never seen a real model answer and section 6 has never been
  generated with content in it.
- **THE NEW SWEEPS ARE SOURCE SWEEPS.** `riskGate.test.js` and `voice.test.js` read `App.jsx`
  and `pro.jsx` as text. A site written in a way the regex does not recognise is a site they do
  not see, which is the same limit every sweep in this repository has.

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
| One chance, one arithmetic — the seeded Monte Carlo behind every probability | **DONE** (§4h) — the drift is the app's own seasonal thesis; the two closed forms are deleted |
| Past autopilot entries written at the wrong horizon are marked | **DONE** (§4i) — by the absence of a stamp, never by a date |
| The three un-homed numbers have homes in `RULES` | **DONE** (§4i) — no value changed, and two sweep exclusions are gone |
| The ticket shows the combo book, the model value and the notional | **DONE** (§8d) |
| Working orders visible in the main flow, with age, re-price and cancel | **DONE** (§10e) |
| The entry floor as ROOM: hard block only inside the exit window | **DONE** (§4f) — the number 30 is unchanged and uncalibrated |
| The position remembers its size, and the gate runs at it | **DONE** (§10f) — the cap that did not hold |
| One model check, shared by the three generation sites and the ticket | **DONE** (§10f) |
| The exit simulator runs at the exit rule, and the policy is the caller's | **DONE** (§4g) — it walked to 7 DTE while the rule says 21 |
| A rule number inside an arithmetic expression is refused by a test | **DONE** (§4g) — and it still cannot catch a STALE copy |
| The simulator's fallback volatility has a name, and the brief carries which was in force | **DONE** (§4g) — 0.25 is CHOSEN, and the table behind it is P2 |
| One volatility source: the Guardian and the brief walk one position on one number | **DONE** (§4k) — `sigmaProvenance()` learns a third source, the simulators refuse a bare sigma, and the absence of the stamp reads as the hand-written table |
| The measured Alpha Vantage parse is exercised, refusals included | **DONE** (§4k) — against a real-shaped fixture and a fake blob store; the LIVE call is still impossible here |
| The spread floor measures the PAIR, not one leg at a time | **DONE** (§4l) — `maxComboSpreadShareOfNet` beside the per-leg one, own count, own sentence; the live UNG pair was 143% wide with both legs inside the per-leg ceiling |
| Every figure on Build is worked out at the price that will be SENT | **DONE** (§4l) — `analyze(…, { net })`, `AE`, and the mid still on screen as what it is worth |
| A limit is a ceiling, not a price, and the app says so | **DONE** (§4l) — `effectiveLimit()` / `limitCeilingNote()`: you offer $30, you pay $24 |
| The order ticket shows the book, the sizes and one verdict that reads the time in force | **DONE** (§4l) — and nobody has seen it on a phone |
| The compare picture is drawn at the numbers its own chance was computed at | **DONE** (§4l) — `terminalDist()` loses its default drift; the sweep gains the fallback shape that hid the 45 |
| A cancelled order is not a working order | **DONE** (§4m) — `orderLifecycle()`; the phone showed CANCELED / EXPIRED / CANCELED under a heading reading "WORKING" |
| Only what the broker filled is a position | **DONE** (§4m) — `positionStage()`; the app said 3 positions over the broker's own "OPEN POSITIONS (0)" |
| Trades you did not take have a place of their own | **DONE** (§4m) — the Watching tab, with a theoretical figure that may never be painted like a real one |
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

### WRITTEN THIS SESSION — one voice (§4v)

`npm test` reports **911 checks across 22 suites**, up from the **864 across 21** a clean `main`
measures (measured on an untouched `main` at the start of this session, and it matches what
PR #34 recorded). `npm run build` is clean. One new suite: `src/voice.test.js`.

- **NO ORDER CAN BE SENT FROM THIS SANDBOX. TENTH SESSION IN A ROW.**
- **NOT ONE OF THESE SCREENS HAS BEEN SEEN ON A PHONE**, and this session's whole subject is
  what a screen looks like. Tenth in a row.
- **`upgradeHolding()` HAS NEVER RUN AGAINST A REAL `/v2/positions` PAYLOAD**, and neither has
  the broker-preferred P&L: both are tested against hand-built fixtures.
- **THE 43% WORD CUT IS A RATIO BETWEEN TWO RUNS OF ONE HEURISTIC**, not a count of pixels, and
  the heuristic states its own limits (§4v.3).
- **NOBODY HAS ASKED THE OWNER WHETHER THE FOLDS FOLD THE RIGHT THINGS.**
- **`remainingEdge()`'S SECOND READING REUSES `RULES.minRewardRisk`**, which was chosen for
  ENTRY. Whether the bar for holding is the bar for opening is an untaken product decision.
- **WHETHER J-0003 FILLED IS UNKNOWN** — SOYB 28/30, debit $0.80, GTC.
- **THE ANTHROPIC USAGE LIMIT DISABLED EVERY AI FEATURE UNTIL 2026-10-01**, so report section 5
  and both copilots were dead on the reading this session is built from, and
  `copilotOverreach()` has never seen a real model answer.

The full list, with the reasoning, is §4v NOT VERIFIED.

### WRITTEN BEFORE THIS — the contract, the indicators and the chart copilot (§4s, §4t, §4u)

`npm test` reports **864 checks across 21 suites**, up from the **818 across 19** a clean `main`
measures (measured on an untouched `main` at the start of this session, and it matches what PR #33
recorded). `npm run build` is clean. Two new suites: `alpacaContract.test.js` and
`indicators.test.js`.

- **NO ORDER CAN BE SENT FROM THIS SANDBOX. NINTH SESSION IN A ROW.** No broker keys, and the
  egress proxy refuses the CONNECT. Everything about the order body below is checked against
  alpaca-py's source, against Alpaca's own documentation, and against nothing that was actually
  sent.
- **THE ALPACA-PY RULES WERE READ FROM SOURCE ON GitHub, NOT FROM MEMORY** — `alpaca/trading/
  requests.py`, `enums.py` and `models.py`, fetched on 21 September 2026. **What could NOT be
  confirmed from source is `master`'s exact commit**: the files were fetched from the default
  branch by URL, so a rule that changed in alpaca-py after that fetch is a rule this mirror does
  not have. The mirror cites the file for every rule, which is what makes a re-read cheap.
- **ALPACA'S OpenAPI SPEC WAS SEARCHED AND HAS NO MLEG AT ALL** (§4t). That is a fact about the
  spec, read on the same day, and it means the mleg half of `orderBody()` is validated against
  alpaca-py alone. If the spec ever gains `mleg`, the contract suite has a line that says to
  validate against it instead of explaining why it cannot.
- **`validateOrderRequest()` NOW THROWS FROM `orderBody()`, AND NO PATH HAS EVER THROWN LIVE.**
  Every one of the six paths already renders `alpacaErrorText(e)` beside its own button, so the
  failure mode is a sentence where a 422 used to be — but that is reasoning about the code, not
  a reading of it.
- **THE CLOSING DIRECTION IS STILL UNEXERCISED.** Nothing has ever been closed through this app,
  in either spelling, and `limitAgainstBook()` on the close paths has therefore never run against
  a live book. `closeGroup()`'s call SKIPS by construction — that path sends a market order and
  has no quotes — and is wired anyway, which is stated in the code rather than left to be
  discovered.
- **THE UNSTAMPED-LIMIT PATH IS THE ONE THE OWNER WILL SEE FIRST.** J-0001 predates the stamp, so
  the Positions card will say the direction was not recorded rather than comparing the fill. That
  is correct and it will look like a regression against PR #33's screenshot.
- **THE RSI IS CUTLER'S, NOT WILDER'S** (§4u.2). It is the reading `signals.js` has always
  scored, and the chart now draws the same one, so the app is internally consistent — but a
  reader comparing it against TradingView will find a different number. The size of that
  difference has NOT been measured. ROADMAP P8.
- **NO INDICATOR HAS BEEN SEEN AGAINST A REAL CHART.** The arithmetic is held against direct
  recomputation on 500-bar series and against the old inline body, all seeded and deterministic.
  Whether the SMA line on this chart lands where the SMA line on a charting package lands has not
  been read, because `/api/bars` needs the broker keys this sandbox does not have.
- **THE CHART COPILOT HAS NEVER RUN.** No Anthropic key here either. The prompt, the context
  builder and the panel are tested; not one answer has been generated, so whether the model
  actually stays inside the context is unverified. The prompt forbids it, the context is the only
  thing sent, and neither of those is a measurement.
- **`PriceChart` HAS NEVER BEEN RENDERED BY ANYBODY, EVER** — that is the point of §4u.0 — so its
  new mount, the two collapsed panes, the chip row and the crosshair have been read in code and in
  a passing build, and on no screen.
- **NOBODY HAS SEEN ANY OF IT ON A PHONE.** Ninth pull request in a row, and this one is a chart.

### WRITTEN BEFORE THIS — the sign on a credit order, and the fill (§4q, §4r)

The FOURTH live reading, and the first one with a FILL in it. `npm test` reports **818 checks
across 19 suites**, up from the **787** a clean `main` measures. `npm run build` is clean.
(ROADMAP P2-bis wrote 783 for PR #32; 787 is what this session measured on untouched `main` and
took as ground truth, the same way PR #24 took 594 over three recorded values.)

- **NO ORDER CAN BE SENT FROM THIS SANDBOX.** No broker keys, egress proxy refuses the CONNECT.
  **The signed multi-leg limit is checked against Alpaca's documented convention and against the
  broker's own display of the XLE order — "Limit @ $0.75" beside "Avg. Fill Price −0.04" — and
  against nothing else.** Only a deploy can send one.
- **THE CLOSING DIRECTION HAS NEVER BEEN SENT, IN EITHER SPELLING.** Nothing has ever been closed
  through this app, so the half of §4q that flips the sign on `intent: "close"` is reasoned and
  tested and unexercised.
- **A CORRECTLY SIGNED CREDIT ORDER MAY SIMPLY NOT FILL**, and that would be the right outcome
  looking like a regression. The $75 was probably never there: the fill says the book was near zero.
- **THE XLE POSITION IS STILL OPEN AND STILL WRONG.** $346 of maximum loss against a $4 credit.
  This changes what the app SENDS; it cannot unwind a fill.
- **THE IMPORT PATH, THE FILL COMPARISON AND THE RECONCILIATION LINE HAVE NEVER RENDERED.** All
  three are tested on the numbers read off the broker's panel and none has been on a screen.
- **THE OPEN-INTEREST FIX IS STRUCTURAL, NOT MEASURED.** Whether the guided run now removes that
  GDX butterfly for LIQUIDITY as well as for shape, and what the floor removes on BOIL, WEAT, USO
  and SLV once it can see the column, is the first thing to look at on the next live run.
- **HOW MUCH THE GUIDED POOL SHRINKS WITHOUT BUTTERFLIES IS UNMEASURED.** `verybear` and `verybull`
  are left with one multi-leg preset each and `neutral` with the iron condor alone.
- **ALPACA REPORTS `delta` AND `theta` PER CONTRACT AND THE APP STILL COMPUTES ITS OWN**
  (`netGreeks()`, Black-Scholes at the app's own IV). Same species as the two faults fixed here —
  re-deriving what the broker already reported — deliberately not touched, and the obvious next one.
- **A RECORD WRITTEN BEFORE THIS BUILD CARRIES AN UNSIGNED `alpacaLimit`**, because the old
  `commitPosition()` stored `Math.abs()` of it. If such a record ever fills, `fillVsLimit()`
  will compare a magnitude against a signed fill and read a credit structure backwards. It is
  deliberately NOT migrated: nothing has ever filled, and the one order that did was sent at a
  positive limit anyway, so there is no record this can be wrong about today. The honest fix if
  it matters later is the same stamp pattern used five times already, not a guess at the sign.
- **NOBODY HAS SEEN ANY OF IT ON A PHONE.** Eighth pull request in a row.

### WRITTEN BEFORE THIS — the contract the app invented, and the trade card (§4n)

The THIRD live reading. `npm test` reports **735 checks across 19 suites**, up from the **717** §4m
wrote down. `npm run build` is clean.

Suite totals that sum to 735: signals 22, chain 35, engine 28, riskGate **162**, theme 39, demo 16,
handoff **13**, path 14, liquidity 7, order 25, journal 81, autopilot 61, pwa 36, visuals 35, wizard
56, steps 20, ceiling 49, order.jsx 8, ticket **28**. The eighteen new checks are eight in
`riskGate.test.js` (the SOYB leg refused by name, a listed leg and a genuine 1x2x1 ratio unaffected,
unknown-is-not-missing, entry-only, the gate-not-a-floor guard, `contractListing()` itself, the
open-intent evidence sweep and the no-invented-symbol sweep), six in `ticket.test.jsx` (the five
lines with real numbers, the refusal on the first screen, unknown-is-still-not-a-number, the
unquoted-leg sentence counted ONCE, the market-order warning, the strike-snap sentence) and four in
`handoff.test.js` (the re-snap, the leg already on the board, the unloaded chain, and that the legs
are still copies).

**WHAT THE TESTS FOUND THAT I DID NOT.** The tie case in `snapStrike()`: 27.5 is exactly between the
27 and the 28 a board carries, and it has always resolved to the first equally-near strike it meets.
That is arbitrary and DETERMINISTIC, the leg lands on a contract that exists either way, and nothing
about it was changed — but it was asserted rather than assumed.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER, ALPHA VANTAGE OR A DEPLOY.** Same wall as
PR #15 through #29.

- **WHICH OF THE TWO PATHS PUT THE 27.5 ON THAT BOARD IS NOT KNOWN.** The expiry dropdown and
  `buildHandOff()` both failed to re-snap; both are closed; neither is proven to be the one that did
  it. 0a is the defence that holds whichever it was.
- **NOBODY HAS SEEN THE TRADE CARD.** Seventh item in a row that only a phone can settle, and the
  first one where the whole point of the change is what it looks like.
- **THE FIVE LINES HAVE NEVER BEEN READ BY THE PERSON THEY ARE FOR.**
- **LINE 3 IS NOT THE LINE ROADMAP P4 ASKED FOR.** It is the chance AT EXPIRY, because the
  exit-rule figure only exists on an open position and computing one on Build would have been new
  arithmetic. The line says which question it answers.
- **THE CAPITAL ACTUALLY SET IS UNKNOWN**, so the QTY-14 finding is arithmetic ($942 needs at least
  $18,840 of trading capital to clear the 5% cap), not an observation.
- **THE §4l AND §4m DEBTS ARE ALL STILL OPEN**, untouched by this session: `maxComboSpreadShareOfNet`
  is still chosen not measured and has still never emptied a real board; the rebuilt ticket has still
  not been seen on a phone, and neither has the Watching tab or the four-tab row; the size column has
  still never held a real quote size; `UnifiedPosition()` still carries its own `sigma = 0.3`; and
  **the effective price is still not reconciled against a fill, because nothing has filled — that one
  is P0's.**

### WRITTEN BEFORE THIS — dead is not working, and Watching (§4m)

The second live reading, a day after the first, from the same phone. `npm test` reports **717 checks
across 19 suites**, up from the **705** §4l wrote down. `npm run build` is clean.

Suite totals that sum to 717: signals 22, chain 35, engine 28, riskGate **154**, theme 39, demo 16,
handoff 9, path 14, liquidity 7, order 25, journal **81**, autopilot 61, pwa 36, visuals 35, wizard
56, steps 20, ceiling 49, order.jsx 8, ticket 22. The twelve new checks are ten in `journal.test.js`
(the three live rows, the three stages, the theoretical figure and the null trap) and two source
guards in `riskGate.test.js` — one that refuses `alpacaFilled === false` as a liveness test ever
again, one that holds Watching to its own register and keeps SAVED STRATEGIES off the Positions
screen.

**WHAT THE TEST FOUND THAT I DID NOT.** `wouldHaveDone()` failed its own first run: `Number(null)` is
0 and 0 is finite, so a structure with no readable price today came back "down $450" instead of
unreadable. **Fifth time** that coercion has produced a wrong number in this repository.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER, ALPHA VANTAGE OR A DEPLOY.** Same wall as
PR #15 through #28.

- **NOBODY HAS SEEN THE WATCHING TAB.** A fourth tab on a 390px phone is a real cost; the owner
  chose it from a description, not a screen.
- **NO WATCHED ROW HAS BEEN RE-PRICED AGAINST A LIVE CHAIN.** The arithmetic is held against the
  BOIL figures read off the phone; the re-pricing path needs a loaded chain and none loads here.
- **THE `entrySource` STAMP HAS NEVER BEEN WRITTEN BY A REAL OPEN**, because nothing has ever
  filled — so every row that exists today takes the "starts from the MID" branch, and the other one
  has never been rendered.
- **THE §4l DEBTS ARE ALL STILL OPEN**, untouched by this session: `maxComboSpreadShareOfNet` is
  still chosen not measured, the rebuilt ticket has still not been seen on a phone, the size column
  has still never held a real size, and the effective price is still not reconciled against a fill.

### WRITTEN BEFORE THIS — the first live reading, and the ticket it produced (§4l)

This session did TASK 0 (three arithmetic faults found on a phone against the live market), TASK 1
(the order ticket, rebuilt to the design agreed with the owner) and TASK 2 (the compare screen's
drift, and the sweep shape that could not see the number causing it) — §4l. `npm test` reports
**705 checks across 19 suites**, up from the **681** PR #27 wrote down and which a clean clone of
`main` at `f262f19` reproduces exactly. `npm run build` is clean.

Suite totals that sum to 705: signals 22, chain **35**, engine 28, riskGate 152, theme 39, demo 16,
handoff 9, path 14, liquidity 7, order 25, journal 71, autopilot 61, pwa 36, and the six JSX files —
visuals 35, wizard 56, steps 20, ceiling 49, order.jsx 8, **ticket 22 (new)**. The twenty-four new
checks are two in `chain.test.js` (the quote sizes on both parsers, and a reported zero that stays
a reading) and twenty-two in the new `src/ticket.test.jsx`, which holds the live UNG case as a
fixture against the REAL sites — `shortlistWithFloors` and `analyze` out of `App.jsx`,
`qualityFloor` out of `rules.js`, the rendered ticket out of `pro.jsx`. `riskGate.test.js` gained
shape 4 and five more quiet-cases inside its existing two tests, so its count is unchanged.

**WHAT THE NEW TESTS FOUND THAT THE REVIEW DID NOT.** Three of the twenty-two failed on first run
for reasons worth recording, because all three are faults this repository has a named rule about:

- `netFromLegs()` summed an UNPRICED leg as a leg priced at nothing. **`Number(null)` is 0 and 0 is
  finite** — the fourth time that coercion has produced a wrong number in this codebase.
- `compareDistInputs()` did the same to a candidate with no drift stamp: `Number(null)` passed
  `Number.isFinite`, so an unstamped candidate would have drawn at a confident drift of zero, which
  is the exact picture the function was written to stop.
- A limit typed at EXACTLY the price that trades read "you are waiting". `book.ask` is a SUM of leg
  quotes, so 0.24 met 0.24000000000000005 — the same floating-point fault the `atMid` comparison
  already carried a tolerance for, one line away.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER, ALPHA VANTAGE OR A DEPLOY.** Same wall as
PR #15 through #27 — with the one difference that this session's TASK 0 came from a live reading
the owner took himself, which is the first time that has been true.

- **`maxComboSpreadShareOfNet` (1.0) IS CHOSEN, NOT MEASURED.** It joins `modelDisagreementRatio`,
  `openLimitSlippage` and `closeLimitSlippage` on this list, and for the same reason: the
  distribution of combination spread over combination net on the five live chains has never been
  read. One live pair at 1.43 is a reading, not a law. **Expect a real reading to bring it DOWN.**
- **NOBODY HAS SEEN THE REBUILT TICKET.** A four-row market table, one slider per leg, a big net,
  a coloured verdict band and four figures, on the 390px phone this app is demoed on. It is the
  fourth pull request in a row to add to that screen.
- **THE SIZE COLUMN HAS NEVER BEEN FED A REAL SIZE.** `bs` and `as` are documented in
  `chainAlpaca.mjs`'s own header and parsed from a hand-built fixture. Whether Alpaca's indicative
  feed actually populates them, and how often, is unknown here — which is precisely why a missing
  size is drawn as "?" with a sentence rather than as a blank.
- **THE EFFECTIVE PRICE IS NOT THE FILL PRICE.** The record now carries `min(limit, ask)`, which
  is what the trade would be done at if it crossed. `recheckOrders()` does not reconcile a real
  filled price against it, and nothing has ever filled, so the two have never been compared.
- **THE PAIR FLOOR HAS NEVER EMPTIED A REAL BOARD.** It is proved against the UNG fixture at the
  real generation sites. How much of a live chain it removes at 1.0 — and whether the Shortlist
  goes empty on the grain markets because of it — is unknown until the app is used.
- **`UnifiedPosition()` KEEPS ITS OWN `sigma = 0.3` PARAMETER DEFAULT.** TASK 2b named the
  `ComparePayoffs` call and that is what was fixed; the parameter default one file down is the
  same species of number and was deliberately left rather than widened into unasked scope. It is
  the obvious next thing for the sweep to be pointed at.

### WRITTEN BEFORE THIS — one volatility source, and a measured path that is exercised (PR #27)

This session did TASK 0 (the two debts PR #26 handed forward: "THE MEASURED PATH HAS NEVER RUN
ONCE" and "no test exercised either function before the move and none exercises them on a real
Alpha Vantage body now") and TASK 1 (one volatility source for the screens and for the brief) —
§4k. `npm test` reports **681 checks across 18 suites**, up from the **650** PR #26 wrote down and
which a clean clone of `main` at `9232c0b` reproduces exactly. `npm run build` is clean.

Suite totals that sum to 681: signals 22, chain 33, engine **28**, riskGate **152**, theme 39,
demo 16, handoff 9, path 14, liquidity 7, order 25, journal **71**, autopilot **61**, pwa 36, and
the five JSX files — visuals 35, wizard 56, steps 20, ceiling **49**, order.jsx 8. The thirty-one
new checks are eleven in `engine.test.js` (four on the volatility provenance, seven on the Alpha
Vantage parse), four in `riskGate.test.js` (the simulator shape guard and the two-constant rule),
five in `journal.test.js` (the volatility stamp, its absence, and the hydration test), six in
`autopilot.test.js` (`measuredSeasonal()` against a fake blob store) and five in
`ceiling.test.jsx` (the Guardian-versus-brief agreement and the sensitivity table).

**WHAT THIS CLOSES OF PR #26's DEBT, AND WHAT IT CANNOT.** It closes *unexercised*: `parseAvJson()`
and `statsFromMatrix()` are held against a body in the shape Alpha Vantage returns — string values,
`"5. adjusted close"`, the ten-year cutoff, the partial first and last calendar rows, `years` as
the ROW COUNT — and the three refusal bodies Alpha Vantage serves with HTTP 200 are proved to throw
rather than parse. `measuredSeasonal()` is driven against a fake blob store through every branch.
It does **not** close *never run*: there is still no key and no egress, so the live call has never
been made and only the owner's own deploy can make it.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER, ALPHA VANTAGE OR A DEPLOY.** Same wall as
PR #15 through #26.

- **THE MEASURED VOLATILITY HAS NEVER BEEN READ FOR ANY MARKET.** §4k's table is the hand-written
  row perturbed by a stated factor — a SENSITIVITY of this simulator, never a measurement of a
  market. How far CORN's real realised volatility sits from 0.22, and in which direction, is
  unknown here.
- **THE GUARDIAN'S NEW SENTENCE HAS NOT BEEN SEEN.** It joins the two seasonal lines §4j added,
  under the exit-path figures, on a screen nobody has opened on a phone.
- **NOTHING INSIDE `SIGMA` WAS TOUCHED**, deliberately, exactly as §4j left `SEASONAL` alone.

### WRITTEN BEFORE THIS — one seasonal source, and a chance that names it (PR #26)

This session did TASK 0 (the debt PR #25 handed forward: no screen printed a chance beside the
seasonal reading that drifted it) and TASK 1 (one seasonal source for the screens and for the
brief) — §4j. `npm test` reports **650 checks across 18 suites**, up from the **644** PR #25 wrote
down and which a clean clone of `main` at `9fcd104` reproduces exactly. `npm run build` is clean.

Suite totals that sum to 650: signals 22, chain 33, engine 17, riskGate **148**, theme 39, demo 16,
handoff 9, path 14, liquidity 7, order 25, journal 66, autopilot **55**, pwa 36, and the five JSX
files — visuals 35, wizard 56, steps 20, ceiling **44**, order.jsx 8. The six new checks are two in
`riskGate.test.js` (the shape guard, and measured-versus-fallback), one in `autopilot.test.js` (the
server reads the cache and never spends the quota) and three in `ceiling.test.jsx`.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER, ALPHA VANTAGE OR A DEPLOY.** Same wall as
PR #15 through #25.

- **THE MEASURED PATH HAS NEVER RUN END TO END, AND THAT IS THIS PR'S CENTRAL GAP.** No
  `ALPHAVANTAGE_KEY` is set here and the egress proxy refuses the CONNECT to `alphavantage.co`
  (403), so the blob cache `av.mjs` fills is **empty** and `autopilot.mjs`'s read of it returns a
  miss every time. Every sentence the app now prints in this sandbox is the *fallback* sentence.
  The measured branch — the one that says "11 years of monthly prices, read 3 days ago" — is
  exercised only by unit tests with a hand-built reading. **`/api/av` → blob → `measuredSeasonal()`
  → `seasonalProvenance()` has never been walked once with a real body.**
- **THE BEFORE/AFTER IN §4j IS CORN ONLY.** Only CORN has measured cells anybody has written down
  (the two in `av.mjs`, from 195 months). What the table gets wrong on SOYB, UNG, BOIL and WEAT is
  **unknown**; the honest expectation, from eight wrong signs of twelve on the one market checked,
  is that it is not better. The five-market table in §4j is what the app prints **today**, on the
  hand-written row, not a before/after.
- **NOTHING INSIDE `SEASONAL` WAS TOUCHED, DELIBERATELY.** Deriving the table from measured returns
  is ROADMAP P2. This PR changed where the means come from and what the app says about them. The
  corrected CORN row used in §4j and in the tests is built in the test file, never in `engine.js`.
- **THE SENTENCES HAVE NOT BEEN READ ON A PHONE, OR ANYWHERE.** Nine surfaces now carry the stamp
  (§4j's table). Whether the Guardian's two-line NOW/AT-ENTRY pair reads as clarifying or as noise
  on a 390px screen is a judgement nobody has made. The Journal, the report and the road cards
  gained a line each; none has been looked at.
- **THE STAMP ON OLD RECORDS IS AN INFERENCE, AND IT IS THE RIGHT ONE — BUT IT IS AN INFERENCE.**
  `seasonalStampOf()` reads a missing `seasonalSource` as the hand-written estimate, because until
  this PR neither side could reach anything else. That is true of every record in the owner's
  actual store, and nothing here has read that store to confirm it contains what is expected.
- **THE SERVER'S BLOB READ IS UNMEASURED.** One read per ticker, memoised, no TTL test, no fetch —
  all held by a source sweep in `autopilot.test.js`, not by watching the function run. **The
  autopilot has still never been watched running at all**, which is the same debt PR #24 and #25
  each wrote down.
- **`parseAvJson()` AND `statsFromMatrix()` MOVED FILES AND THEIR BEHAVIOUR IS ASSUMED UNCHANGED.**
  `statsFromMatrix()` is byte-identical to the version in `App.jsx`. `parseAvJson()` differs by
  **one deliberate hardening**: a null or undefined body now throws the same named `Error` the
  refusal path throws instead of a bare `TypeError`, because the server reads it out of a blob
  store where a miss is a normal event rather than off a `fetch` that already succeeded. Both
  versions throw and every caller catches, so no caller can tell the difference — but that is an
  argument, not a test. **No test exercised either function before the move and none exercises
  them on a real Alpha Vantage body now.** What is verified is that the build is clean and every
  suite still passes, not that the parse produces the same matrix it used to, because nothing ever
  checked that it produced a correct one.
- **THE DEAD `AV_URL` CONSTANT WAS REMOVED** with them. It was unreferenced and it templated an
  `apikey` into a client-side URL; nothing on the client may call Alpha Vantage directly. That is a
  deletion, not a fix, and nothing depended on it.

### WRITTEN BY PR #25, STILL OPEN — one chance, one arithmetic

This session did TASK 0 (the two debts PR #24 handed forward) and TASK 1 (ROADMAP P1's remaining
half): past autopilot entries written at the wrong horizon are marked on every screen that renders
one, the three un-homed numbers have homes in `RULES`, and every probability the app prints comes
out of one seeded Monte Carlo drifted on the app's own seasonal thesis (§4h). `npm test` reports
**644 checks across 18 suites**, up from the **606** PR #24 wrote down and which a clean clone of
`main` at `b85beb3` reproduces exactly — so that debt is closed and 644 is measured against a
number anybody can re-derive. `npm run build` is clean.

Suite totals that sum to 644: signals 22, chain 33, engine 17, riskGate 146, theme 39, demo 16,
handoff 9, path 14, liquidity 7, order 25, journal 66, autopilot 54, pwa 36, and the five JSX
files — visuals 35, wizard 56, steps 20, ceiling 41, order.jsx 8.

**NOTHING HERE WAS RUN AGAINST A LIVE CHAIN, A BROWSER OR A DEPLOY.** Same wall as PR #15 through
#24: no broker keys in this sandbox, no Anthropic key, and the egress proxy refuses the CONNECT.
Every number in §4h's tables is the app's own model talking to itself with a seeded generator.

- **EVERY PROBABILITY ON EVERY SCREEN HAS MOVED AND NOBODY HAS SEEN ONE.** §4h's table is fifteen
  fixtures priced by `netBS`; the app on a phone will show different structures off a live chain.
  The direction is what was verified, not the magnitude on any real trade.
- **THE 8,000 RUN COUNT WAS TIMED ON THE DEVELOPMENT MACHINE, NOT ON A PHONE.** 0.54 ms per
  candidate here, about 43 ms for the widest pool. A phone is several times slower and it is the
  machine this app is demoed on. If the Shortlist or the guided run feels slow, `RULES.mcRuns` is
  the one number to move — and moving it moves every printed percentage by its sampling error.
- **THE DRIFT IS NOW THE SEASONAL TABLE, AND FOUR OF THE FIVE MARKETS ARE STILL ON THE HAND-WRITTEN
  ONE UNTIL ALPHA VANTAGE LOADS.** `SEASONAL` in `engine.js` has the WRONG SIGN on eight months of
  twelve for CORN against 195 months of real data (§7). That table now drives the probability as
  well as the score, so a market on the fallback is drifting its own chance on numbers this
  repository already knows to be wrong. ~~The app says on screen when a market is on the fallback;
  it does not say it beside the CHANCE.~~ **THE SAYING IS CLOSED BY PR #26** (§4j): every screen
  that prints a chance prints one sentence naming which table drifted it and how old that reading
  is, `chanceOf()` refuses to work without the provenance, and the autopilot reads the same
  measured means the client does. **THE TABLE ITSELF IS STILL WRONG AND IS STILL ROADMAP P2** —
  what changed is that the app no longer prints a number off it without saying so.
- **THE VOLATILITY IS THE CHAIN'S IMPLIED ONE AND THAT IS A DECISION, NOT A MEASUREMENT.** The
  market sets the width, the app's thesis sets the lean. The alternative — realised volatility
  measured from returns — is the other half of ROADMAP P2 and is deliberately not done here.
  Nothing compares the two on these five markets.
- **THE CHART-VERSUS-SIMULATION TOLERANCE IS 2 PERCENTAGE POINTS AND THE WORST MEASURED GAP IS
  1.59.** That is about three standard errors at 8,000 runs, which is a high but unremarkable
  draw across fifteen fixtures; the same structure at 400,000 runs lands within 0.01 points of
  the chart, which is the evidence that it is noise. If a future fixture exceeds 2 points the
  chart is wrong — do not widen it.
- **THE MARKED-UP AUTOPILOT ENTRIES HAVE NOT BEEN READ ON SCREEN.** `autopilotHorizonNote()`
  renders on the Guardian's timeline and in the Journal's, and is carried into the weekly report
  and the model's context. Whether the owner's actual Journal contains any unstamped autopilot
  entries is unknown from here — the autopilot has never been watched running at all.
- **THE THREE NEWLY HOMED NUMBERS DID NOT CHANGE VALUE, DELIBERATELY** (the owner's decision: a
  rename that moves a number is two changes wearing one coat). All three are still CHOSEN, not
  measured: `watchAttentionShare` (0.35 — nothing compares what happened to positions that crossed
  it against positions that did not), `autopilotConfidence` (70 — nothing compares outcomes above
  and below it), `fallbackIV` (0.25 — a middle for a commodity ETF, never estimated).
- **THE SWEEP FOUND NOTHING HIDING BEHIND THE COLLISION.** `maxSpreadShareOfMid` is back on the
  rule-literal list and `signals.js` is back in the swept file set; both were clean on the first
  run. That is a negative result and it is worth recording: the two exclusions were costing
  coverage, not concealing a second fault.
- **`probProfit` IS DELETED FROM BOTH FILES AND NOTHING PROVES NOBODY WANTED IT.** The closed form
  was roughly four times cheaper than 8,000 runs. If the phone reading says the Monte Carlo is too
  slow for ranking, the decision recorded in §4h — one run count for printing and for ranking —
  is the one to revisit, and the rule that survives either way is that no screen prints a
  closed-form number as "the chance".

### WRITTEN BY PR #24, STILL OPEN — a rule number can hide in an expression

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
  briefs are in the Journal. ~~and they are wrong in a way nothing in the app marks.~~ **THE
  MARKING IS CLOSED BY PR #25**: entries written since the fix carry `simExitDTE` and `simDays`,
  and the absence of that stamp is what every screen reads to say, in one sentence, that the
  simulation behind an older entry ran to a day the app no longer uses. **No brief has still been
  re-read against this**, and the autopilot has never been watched running.
- **THE BEFORE/AFTER TABLE IS THE APP'S MODEL TALKING TO ITSELF.** The fixtures are priced with
  `netBS` at the hand-written `SIGMA` (§4g), walked at that same hand-written volatility, and
  seeded so the run reproduces. It proves the change moved the numbers and in which direction. It
  proves nothing about whether either set of numbers describes a real market, and the honest
  reading of `ev` moving DOWN on BOIL while it moved UP on the other two is that `ev` was never a
  one-directional quantity, not that one of them is wrong.
- **`fallbackSigma` (0.25) IS CHOSEN, NOT MEASURED — and so is the whole table behind it.** PR #24
  named the fallback and made the brief carry which of the two was in force. **PR #27 (§4k) added
  the third source and made both sides read it**, so the Guardian and the brief can no longer walk
  one position on two volatilities. Neither PR fixed `SIGMA` in `engine.js`, which is five
  hand-typed numbers, and **no market's realised volatility has been computed here at all** — the
  measured branch exists, is tested, and has never been fed a real reading. §4k's table is a
  SENSITIVITY of the simulator under a stated perturbation, never a measurement. Fixing the table
  is ROADMAP P2's house distribution.
- **THE GUARD STILL CANNOT PROVE A NEGATIVE, AND NOW IT CANNOT CATCH A STALE COPY EITHER.** It
  refuses three shapes across fourteen rule numbers. The bare 7 was not any rule's value, so no
  matcher could have named it — what the widened guard caught was the two `0.5`s beside it. A
  copy written as `Math.round(44.9)`, or inside a template string, still passes.
- ~~**THREE UN-HOMED NUMBERS WERE FOUND AND DELIBERATELY NOT FIXED.**~~ **CLOSED BY PR #25** —
  all three have a home in `RULES` and not one of them changed value. `maxSpreadShareOfMid` is
  back on the sweep list and `signals.js` is back in the swept file set. The three were:
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
