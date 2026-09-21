# Options Strategy Lab — project memory

Read `PRD.md` and `ROADMAP.md` before any substantial change, and every pull
request updates ROADMAP.md — the session that ships P-n marks it done and
restates what the next one inherits. ROADMAP.md is the single source for WHAT
COMES NEXT; PRD.md is the single source for WHAT THE PRODUCT IS AND WHAT IS
VERIFIED. Nothing is duplicated between them. This file is the short version.

## Standing rule — start with the last session's debts

**Every session begins by fixing what the previous session flagged as broken,
unverified or left hanging, before starting its own task.** Then it hands its own
list forward: the last thing every session writes is what it could NOT verify.
Carry this rule into whatever you hand to the next session — it is the only
reason a note like "the fixture is not a live capture" ever gets resolved
instead of being re-discovered.

## What this is

A paper-trading platform for multi-leg options strategies on commodity ETFs
(CORN, UNG, SOYB, BOIL, WEAT). It guides non-expert traders toward disciplined
trading. The owner is not a software developer: explain changes in plain
language, define technical terms on first use.

**Product language is English.** All UI copy, function names and generated
text are English.

## Thesis

An agent that cannot execute a trade it cannot justify.

- The app must be able to say "nothing today". That is a feature, not an error.
- Risk limits are code, never prompts. A model can be argued with; an `if` cannot.

## Non-negotiable rules

1. Paper trading only. If paper mode cannot be verified, reject the order.
2. No uncovered short legs, max loss always known. The GUIDED wizard flow goes
   further and excludes single-leg long options too — time decay makes them a
   poor first trade. They stay reachable on the full desk.
3. No API key ever reaches the client. Keys live only in Netlify environment
   variables: ALPACA_KEY, ALPACA_SECRET, ANTHROPIC_KEY, ALPHAVANTAGE_KEY,
   SITE_PASSWORD, DEMO_TOKEN (checked on the edge, never bundled), optional
   WEBHOOK_URL and optional
   ANTHROPIC_WORKSPACE_ID (needed only for an identity-linked Anthropic key;
   `ai.mjs` sends the `anthropic-workspace-id` header only when it is set).
4. No order reaches Alpaca without passing `src/riskGate.js`. That includes a worst case that
   prices as a PROFIT: `IMPOSSIBLE_LOSS` refuses an arbitrage on entry, reading the SIGNED
   figure while every dollar limit around it reads `Math.abs`.
5. Nothing executes without an explicit human confirmation.

## Position sizing

Derived, not hardcoded, and **asked rather than assumed**. See PRD §3. The user
supplies trading capital and how many positions they hold at once; `sizing()` in
`src/rules.js` derives the per-trade and total limits and shows the best-practice
cap as an explained suggestion. Overrides require a typed reason and are stored
with the position.

**One home, read everywhere.** Never derive, default or hardcode a capital,
per-trade or exposure figure anywhere else. The Build screen's risk field once
defaulted to a hardcoded 500 while the wizard quoted a derived 250 — two numbers
for the same thing, neither of them the user's. Everything now reads
`limits` (the `sizing()` result) from `App.jsx`.

**Until both questions are answered, nothing is his limit.** `capital` and
`concurrentTarget` are stored `null`, `sizing()` returns `answered: false`, and
every screen printing a figure derived from the fallback labels it a suggestion
(`capitalSourceNote()`, `limitOwner()`, `perTradeLimitPhrase()`). No literacy
pill is generated while the questions are open — a pill explains an answer, and
there is no answer to explain. The gate still enforces the suggested figures,
because a proposal cannot wait for a questionnaire, and warns that it is doing so.

## Unpriceable is not free — the check BEFORE the floors

`priceability()` in `src/rules.js`, applied at every one of the three generation
sites and in `riskGate.js`. It answers a question that comes before both quality
floors: **is there a price at all?** Two tests, and `RULES.minNetPremium` (0.05 a
share, `MIN_NET_DOLLARS` = $5 a contract) is the one home for the number.

1. **Every LONG leg needs a bid above zero.** You are buying it, so you have to be
   able to sell it back; nobody bidding means the mid you priced it at is half of
   an ask nobody agreed to. A short leg is not tested — the net below catches an
   imaginary credit — and a leg the feed said nothing about is UNKNOWN, never a
   bid of zero, exactly as with open interest.
2. **The net must clear the minimum, in ABSOLUTE value.** A credit structure has a
   negative net and is perfectly priceable; it is a net of about nothing, either
   way round, that says the halves cancelled because one of them was invented.

Read live on BOIL 2026-10-09, spot $21.23, floor OFF: a Bullish Call Butterfly
(+1 21C / -2 22.5C / +1 24C) priced at a net debit of **$0** and was offered with
YOU PAY $0, MAX LOSS -$0, R/R 6748644041614687.00 and **250 contracts**. A
butterfly's maximum loss IS its debit, so a debit of zero means the price is
UNKNOWN, not that the loss is zero — and rule 2 is that the maximum loss is
always known. Hence:

- **An unpriceable candidate is never rendered**, at any liquidity setting: it is
  cut with a sentence naming why (`unpriceableNote()`, `NOTHING_TODAY.unpriceable()`),
  and its count travels separately from the floors' — a structure whose price could
  not be read never reached them, and crediting them with it would be a lie about
  which rule did the work.
- **The gate rejects an unknown maximum loss** (`UNPRICEABLE`). A finite number is
  not a known one: -1e-14 passed every check. Entry only — a closing order is
  never blocked by it. The quality floors stay OUT of the gate: they ask whether a
  structure was worth offering, and a hand-built trade is the user's to make;
  whether it has a price at all is a different question.
- **Nothing divides by a cost under the minimum.** `rewardRisk()` is the only place
  a ratio is formed and returns null below it (R/R prints "—"); `scaleStrategy()`
  returns `unpriceable` instead of a quantity — `Math.max(prem, 1)` is what turned
  a $250 budget into 250 contracts.
- **Nothing renders as `-$0`.** `money()` and both `fmt$` copies round first and
  decide the sign after: a minus in front of zero invents a direction the number
  does not have.
- The desk still shows a hand-built structure, and says above the figures that its
  price could not be read.

## A CONTRACT THE FEED NEVER LISTED IS UNKNOWN, NOT A WELL-FORMED SYMBOL

`contractListing()` / `unlistedContractNote()` / `legName()` in `src/rules.js`, enforced as
`UNLISTED_CONTRACT` in `riskGate.js`. **Read live: SOYB 2026-11-20, 20 Sep 2026** — the fourth order
this app has sent did not reach the market at all. `HTTP 422 / 42210000: invalid legs: [leg.0 asset
"SOYB261120C00027500" not found]`. That symbol is perfectly well formed and nobody has ever issued
it.

Four of the six order paths spelled `const occ = q?.occ || buildOcc(ticker, expKey, l.type,
l.strike)`. **`buildOcc()` FORMATS a symbol out of a strike the APP chose** and cannot know whether
anybody lists it — only the chain knows that. So an unquoted leg made the app name a contract that
does not exist and ask the broker to trade it. The app created its own refusal.

- **`buildOcc()` STAYS, AND IT IS NEVER A FALLBACK.** Naming a contract is legitimate — the Journal
  and the option-history panel have to be able to write one down — but naming one is not asserting
  that it trades. **Exactly ONE call survives in `App.jsx`** (the price-history button, which says on
  screen when the chain did not list what it is charting) and **none in `pro.jsx`**;
  `riskGate.test.js` fails the build if either changes.
- **IT IS IN THE GATE, AND IT IS NOT A QUALITY FLOOR.** Four paths made one mistake and the gate is
  the one place all six pass through. It is the same KIND of question as `priceability()` — which has
  been in the gate since PR #14 — and not the same kind as the floors, which stay out for ever: a
  hand-built trade is the user's to make, but a contract that does not exist is not a trade at all.
- **ENTRY ONLY**, like `UNPRICEABLE` and `IMPOSSIBLE_LOSS`. Refusing to let somebody OUT of a
  position because a feed went quiet is the worse failure by a distance; the close path refuses in
  `placeExit()` instead, beside the button, naming the leg.
- **UNKNOWN IS NOT MISSING.** `occs` is evidence a caller either has or does not, exactly like
  `quotes`: no array means nothing is tested; an EMPTY array beside real legs is an answer.
- **EVERY OPEN-INTENT GATE CALL CARRIES THE SAME EVIDENCE.** `OrderTicket`'s two `runGate` calls
  passed no `quotes` and no `net`, so the gate guarding the SEND was weaker than the `guard` memo the
  user had just read. A source sweep in `riskGate.test.js` fails the build on an open-intent gate call
  that leaves out `quotes`, `net` or `occs`.
- **STRIKES ARE A PROPERTY OF THE BOARD.** `snapStrike()` / `expiryStrikes()` / `resnapLegs()` live
  in `chain.js` now. Neither the expiry dropdown nor `buildHandOff()` re-snapped a leg carried onto a
  new expiry; both do, an unloaded chain is UNKNOWN and left alone rather than snapped against a
  fallback grid, and what moved is said (`strikeSnapNote()`).

## AN UNLOADED BOARD IS UNKNOWN, NOT A GRID — and the dropdown says what it shows

PRD §4o. PR #30 named two ways a 27.5 could reach a board that lists whole dollars and proved
neither. **It was a third path**: the Build screen's DEFAULT PRESET, on the first render of a fresh
market. The effect fires on the render where `chain` — and so `spot` — arrives; `expKey` is set by a
SIBLING effect in that same render, so `expStrikes` is still null; `snapStrike()` falls back to
`Math.round(x / step) * step`; SOYB at 27.64, step 0.5, Bull Call Spread → **27.5 / 29**. Nothing
re-snapped afterwards, so `UNLISTED_CONTRACT` fired on **every fresh load of every board without
half-dollar strikes**. The app was manufacturing its own refusal.

- **`buildPresets()` REFUSES A NULL BOARD** and returns `[]`. The guard is in the function, not at
  its call sites, for the same reason `snapStrike()` lives in `chain.js`: a fifth generation site
  added next year is covered without anybody coming back. The fallback grid is unreachable from it.
- **The preset effect WAITS**, and legs already in state are **re-snapped when the board arrives**
  (`resnapLegs()` + `strikeSnapNote()`). That is what covers `goStep()`, which carries state legs
  unchanged. `resnapLegs()` returns the SAME array when nothing moves, so React bails out and it
  cannot loop.
- **`expiryStrikes()` IS THE ONE IMPLEMENTATION.** There were four: `expStrikes` in `App.jsx`, the
  wide search's and `runWizard`'s inline `new Set([...calls, ...puts])`, and the real one.
- **AN EMPTY SHORTLIST IS NOT A VERDICT WHEN THERE IS NO BOARD.** `unloadedBoardNote()` in
  `rules.js`, never `emptyExpiryNote()`'s "NOTHING CLEARED ON <expiry>" — a missing-data answer
  wearing a market verdict's words is the line `wizard.test.jsx` already holds on the refusal screen.
- **FAILURE CLASS 1: `<select value={27.5}>` OVER OPTIONS 16…32 DISPLAYS 16.** It does not render
  empty and it does not warn. The leg editor read 16 while the trade card read 27.5 and the order
  carried the 27.5. `strikeOptions()` in `chain.js` always includes the current strike, flagged
  `listed: false`; `StrikeSelect` in `App.jsx` renders it **disabled**, named by
  `offBoardStrikeLabel()` in `rules.js`. The gate refuses the order; this stops the SCREEN choosing
  a different trade.

## THE EXPOSURE IS THE BOOK, NOT THE DECISIONS LOG — `bookPositions()`

`bookPositions()` in `src/journal.js`. Read on the owner's phone, SOYB 21 Sep 2026: **"$1,042
already at risk"** — 450 + 577 + 14 — against **zero** positions, with all three figures sitting one
tab across under WATCHING as orders the broker came back on with nothing bought. §4m split
`store.positions` into three stages and rebuilt every LIST from it; the gate and the weekly report
were the two consumers that never got the split.

- **owned + working COUNT. `not-taken` NEVER counts.** `working` counts because an order at the
  broker **can still fill**: the exposure ceiling is a limit on what may be COMMITTED, not a report
  of what is open. That is a different question from `positionStageNote()`'s "the money is not at
  risk yet", which is about profit and loss.
- **ONE HOME, READ EVERYWHERE**: the risk gate in `App.jsx`, `buildReportMd()` section 2, the report
  PDF, `reportNarrativePrompt()`, the model's `paperPositions` context, `autopilot.mjs` (which was
  proposing exits for trades nobody bought) and `approve.mjs`. Never write the filter by hand.
- **THE REPORT MULTIPLIES BY `positionSize()`, LIKE THE GATE DOES.** `maxLoss` describes ONE
  combination, so a ten-lot spread was reported at a tenth of the money it risks.
- Not changed, deliberately: `nextRef()` scans every record (the counter only goes up), and the
  auto-monitor walks positions for TICKERS, which is a set of chains and not a sum of money.

## THE CHECKS SHOWN ARE THE CHECKS THE TAP RUNS — `bookFor()`

`bookFor(viaBroker)` in `App.jsx` is the **only** place this app chooses which account a gate call is
measured against, and `riskGate.test.js` fails the build if `LOCAL_BOOK` is named anywhere but its
own declaration and inside `bookFor()`.

The Build screen's checklist was evaluated against `LOCAL_BOOK` — *"local simulation, no broker
involved"* — while the order ticket beside it gates against Alpaca. They agreed only by luck: the
gate reads the account for `paperStatus()` **and nothing else**, and the app's own book always passes
it, so **the list the owner read could not fail**. A checklist that cannot fail is not a check.

- The **displayed** `guard` uses `bookFor(!!alpaca)`. With the broker connected the route to an order
  on that screen IS the ticket, so the checklist is the broker's — and a paper mode it cannot verify
  refuses the order where the button is.
- The **record** uses `bookFor(!!alpacaOrder)`: the account the trade actually went to. The gate
  summary goes on the position's timeline and used to say "no broker involved" about an order Alpaca
  was holding.
- `LOCAL_BOOK` survives for the one case it is true of: the confirm step with no broker connected.
- `checkedAgainstNote()` in `rules.js` says under the checklist whose account it checked, because
  that sheet holds two taps and the checks shown are the SEND'S — the stricter of the two.

## THE DECISION IS FIVE LINES — the trade card, and everything else one tap away

`tradeCard()` / `TRADE_CARD_IDS` / `cardCurrencyNote()` in `src/rules.js`, rendered by `TradeCard` in
`App.jsx` as the DEFAULT state of the Build screen's decision area. ROADMAP P4, PRD §4n.

Counted on one Build screen, for ONE decision: a leg-by-leg market table, TWO paragraphs about an
unquoted leg, the quantity, the order type, the time in force, the send button, a combination-market
panel, four stat tiles, a market-versus-model pair, a notional paragraph and an error box. The owner
has said three times: *"si capisce poco dalla UI. Troppe info da leggere, poco intuitivo."*

1. **YOU ARE BETTING** · 2. **YOU RISK** · 3. **HOW OFTEN IT WORKS** · 4. **WHEN IT EXITS** ·
5. **WHAT WOULD MAKE IT WRONG.**

- **NO NEW ARITHMETIC.** Every figure already existed: `analyze()` at the price that will be sent,
  `chanceOf()`'s one simulation (with `chanceSourceNote()` beside it, as everywhere), `sizing()`'s
  limits through the gate, `notionalControlled()`, and the rules. The card READS and writes English.
- **NONE OF THE OLD COPY IS CUT.** It opens behind a tap in `DeskSheet` (`src/steps.jsx`), which is
  `EvidenceOverlay` — the same viewport-fixed sheet, for the same reason a panel written 2,000px down
  a page looked on a phone like a tap that did nothing. `DeskSheet` is chrome with no trade in it,
  which is why it lives beside the navigation.
- **A REFUSAL IS NEVER BEHIND A TAP.** Every gate violation renders on the card, beside the button,
  under the same rule as "an order that fails must fail where the button is".
- **ONE FACT, ONE PLACE, AND IT NEEDS A RULE RATHER THAN ANOTHER PASS.** `unquotedLegNote()` keeps its
  home where the legs are NAMED; everywhere else prints `unquotedLegPointer()` — the discipline
  `warningsToPrint()` already applies to the CONFLICT paragraph. The gate's verdict moved onto the
  card from hundreds of pixels above the control it governs, and the gate's raw warning list is gone
  from beside the panel that was already printing it.
- **THE CURRENCY IS THE BROKER'S.** ROADMAP P4 said euros; the account is an Alpaca paper account in
  US dollars and every figure in this app is a dollar. Said once, converted never, roadmap corrected.
- **THE MARKET ORDER EARNS ITS WARNING** (`marketOrderNote()`). It bypasses the sliders, the net and
  the verdict band, and the stat tile under it used to say "at the price below, not at the mid" with
  no price below.
- **LINE 3 ANSWERS THE QUESTION IT CAN.** `chanceOf()` is where the price FINISHES; the exit-rule
  figure is `exitSim` / `exitPathSim` and exists only on an OPEN position. The line says so rather
  than letting a label assert a reading nobody took.

## An unknown is not a number — the ceiling, the arbitrage, the breakeven

The same disease as the $0 debit above, in three more places. `analyze()` in `App.jsx`
took its maximum profit as the largest payoff on a grid from `S*0.7` to `S*1.3`.

**A PAYOFF WITH NO CEILING HAS NO MAXIMUM PROFIT.** `payoffCeiling(legs)` in `rules.js`
decides it from the legs, never from a grid: bounded above when the net signed CALL
quantity is <= 0 (above the highest strike every call is in the money, so that quantity IS
the far-right slope), bounded below when it is >= 0 — and puts can make neither side
infinite, because the price line stops at zero and a long put is worth at most its strike.
For a long call the old "maximum" was simply the payoff at +30%, printed under the tooltip
"It cannot make more than this", and the same artefact fed the expected value that topped
the wide search with WEAT Long Call ATM (EV/$100 +$290).

- **`maxProfit` is `null`, never a number**, in `analyze()` and in `payoffBands()`. The
  sampled top survives as `sampledMaxProfit` / `sampledTop` for code that has to scale a
  picture, and is never a figure on screen. `NO_CEILING` in `rules.js` is the one place the
  words "no ceiling" are written; `ceil$()` in `App.jsx` and `upTo()` in `wizard.jsx` are
  the only two formatters that reach for it. **Never `Number.isFinite(Number(x))` on a
  maximum profit** — `Number(null)` is 0 and 0 is finite, which is how a missing maximum
  becomes a maximum of zero.
- **Nothing that needs a finite best case is computed.** R/R and the take-profit target
  print "—", `exitPlanDetail()` says the 21-day mark is the half that still applies, the
  profit rungs of the exit ladder are not offered, and `exitSim()` / `exitPathSim()` / the
  seasonal replay skip the take-profit branch — `takeProfitPct * null` is `0`, which would
  have closed every path at break-even and sent an order to close for nothing.
- **It is ranked last, never dropped.** `qualityFloor()` takes `unboundedProfit` and SKIPS
  the reward floor rather than failing it, exactly as the liquidity half skips on unknown
  open interest. The multi-scan guard was `maxProfit <= 0` and `null <= 0` is TRUE, so
  telling the truth would have made every long call vanish in silence: it is now explicit,
  the candidate is shown, its EV is blank, it sorts last on `evProfile()`'s `-999`, and
  `noCeilingRankNote()` says why.
- **The loss side is untouched.** Rule 2 stands: `maxLoss` is still finite and always known.

**A MAXIMUM LOSS THAT IS A PROFIT IS AN ARBITRAGE — AND IT IS NOW IN THE GATE TOO.** PR #15
left that half open in writing: a hand-built structure on the desk whose worst case priced as a
gain was still sendable. `evaluateTrade()` refuses it by name (`IMPOSSIBLE_LOSS`), entry-only.
**Mind the sign**: `impossibleLoss()` reads a SIGNED figure — a real worst case is NEGATIVE —
while everything else in the gate runs on `Math.abs(maxLoss)`. Both open-intent callers pass
`analyze().maxLoss`, which is signed; `closeGroup()` in `pro.jsx` passes a positive magnitude
and is never tested, because reading a cost basis as an arbitrage would block every close.
**And the PRD said this had never been seen live. It has been now:** on BOIL 2026-10-09 SIX
call pairs price a bull call spread as a CREDIT — buy 19 / sell 19.5 nets **-0.290**, buy 22 /
sell 22.5 nets **-0.171**. A debit spread taken in for a credit cannot lose at expiry.

`impossibleLoss()` itself — the debt PR #14 wrote down and left
open. `impossibleLoss(maxLoss)` in `rules.js`, run at all three generation sites right
after `priceability()`, in the same register: a named sentence with the number in it
(`impossibleLossNote()`, `NOTHING_TODAY.impossibleLoss()`), its own count in the tally, its
own refusal screen. Deliberately SEPARATE from `priceability()`: that asks whether the
quotes exist, this asks whether the arithmetic they produced is possible, and one pooled
count would explain neither. It reads the SIGNED figure, so callers holding a positive
magnitude (`riskGate.js`, `qualityFloor()`) must never use it.

**ONE TRADE, ONE BREAKEVEN.** The Shortlist said BOIL makes money above $20.67 and Build
said 20.68; exact is 20.67. `analyze()` took the midpoint of the grid step the sign changed
in, resolution 0.051. The expiry payoff is piecewise linear, so the crossing is exact
arithmetic: `analyze()` interpolates it now, with the same zero-is-a-loss sign convention
`payoffBands()` uses, and the two screens print the same string by construction.

**A SCRATCH IS NOT A WIN — AND THIS IS COPY ONLY.** `RULES.scratchPayoffShare` (0.20),
one named constant with its reasoning, filters nothing and changes no arithmetic:
`payoffBands()`, `profitBands()` and `chanceInProfit()` are untouched because they were
already right. Live UNG, a broken-wing call butterfly opened for a $1 credit at spot 10.57:
"makes money below $11.51, which the next 30 days reach about 73.1% of the time" was true,
and most of that 73.1% was the flat wing paying ONE DOLLAR against a $51 peak. The profit
region is cut a SECOND time at `scratchLevel(maxProfit)` — `bandsAbove()` → `payingBands()`
→ `scratchSplit()` in `visuals.jsx`, using the same samples and the same interpolation as
the sign cut, so the two cannot disagree about a crossing — and `unifiedTakeaway()` states
both facts in ONE sentence, only when more of the green is scratch than money.

**THE REPORT CANNOT INVENT A POSITION.** `reportNarrativePrompt(positions)` in `rules.js`
(a generated prompt is a generated sentence, so it lives with `copilotRulesBlock()`): the
"what to prioritise on the open positions" clause is conditional on the book, and the
prompt states that `paperPositions` is authoritative and that `currentStrategy` is a
structure being LOOKED at, not one that was entered. Section 5 once described a BOIL call
spread "entered at $68 debit" in a report whose own section 2 said "No open positions."

`src/ceiling.test.jsx` holds all four, against the REAL generation site — `analyze`,
`shortlistWithFloors` and `buildPresets` are exported from `App.jsx` for it, so no second
implementation of these decisions can appear beside them.

## A price that clears the floor can still be the wrong price — `modelSanity()`

`RULES.modelDisagreementRatio` (**4**) with `modelSanity()` / `modelSanityReason()` /
`modelDisagreementNote()` in `src/rules.js`, applied at all three generation sites right after
`impossibleLoss()`. It is the THIRD question — `priceability()` asks whether there is a price,
this asks whether it is THIS STRUCTURE'S price — and it is **not in the gate**, by the same rule
as the quality floors: a hand-built trade is the user's to make. `riskGate.test.js` reads
`riskGate.js` and fails the build if `modelSanity` ever appears in it.

**`minNetPremium` IS AN ABSOLUTE FLOOR AND IT IS NOW PROVEN INSUFFICIENT.** Read live on the
owner's Alpaca paper account, 17 Sep 2026: BOIL 2026-10-23, buy 10x 20C / sell 10x 21C, limit
**$0.05**, day — status "new", filled 0.00, never filled. At spot 19.84, 36 DTE, at the IV this
app itself uses for BOIL, that spread is worth **$0.333 a share, $33.29 a contract**. $0.05 is
*exactly* `MIN_NET_DOLLARS`: it cleared the floor built to catch the $0 butterfly **by one
cent** and was wrong by 6.7x. The max loss on screen said $50; the real one was $333.

`rules.js` imports `netBS`, `bs` and `smile` from `engine.js` for this — the SAME model every
other screen prices with, because a second implementation would make the check a comparison of
two guesses. (`engine.js` imports nothing, so it is a leaf-ward import, not a cycle.)

- **Why 4, and what was measured.** The denominator is BS at a HARDCODED per-ticker sigma, so
  the bar cannot be tighter than that model's own error. That error budget IS measured and the
  table is in the comment: repricing every family, all five markets, 30–90 DTE, with the
  volatility deliberately wrong by up to 2x, verticals run 0.39–2.33 and condors 0.27–2.83.
  Four is outside all of it and still catches the live failure (0.15) by 1.67x.
- **THE RATIO IS CHOSEN, NOT MEASURED, AND IT IS ON THE NOT VERIFIED LIST.** What was NOT read
  is the distribution of market-net over model-net on the five LIVE chains — the reading
  `/api/liquidity` gave the liquidity percentiles. No broker keys, egress proxy refuses the
  CONNECT. Expect a real reading to bring the number DOWN.
- Same discipline as every other check: **unknown is not disagreement** (no spot, DTE or IV →
  SKIPPED, never failed — `Number(null)` is 0 and 0 is finite), **nothing is judged against a
  price under `MIN_NET_DOLLARS` on EITHER side** (that is where the error budget blows out from
  0.27 to 0.11), and **it names the leg** — `worstLeg` is the leg whose own mark disagrees most
  in dollars with its own model price, because "the price is wrong" is not actionable.
- **Its count travels separately** (`tally.model`, `floors.model`) and it has its own refusal
  screen, `NOTHING_TODAY.modelDisagreement()`. It is none of the other four: the chain quoted,
  the net cleared the minimum, the worst case is a perfectly possible loss — it is simply not
  this structure's loss. Saying "we could not price it" would be false.
- **The desk prints the model value BESIDE the market value** instead of refusing
  (`ComboBookPanel` in `pro.jsx`), so nothing can be accepted without being seen.

## The opening limit concedes, and the ticket shows the book

`RULES.openLimitSlippage` (0.25) with `openLimitPrice()` / `openLimitNote()` — a **sibling** of
`closeLimitSlippage`, not a copy of it. Same number, same arithmetic, two questions: **a close
has to happen** (the rule fired, only the price is open), **an open never has to** (nothing is
forced), and **conceding on the way IN raises the debit, which IS the maximum loss** the gate
measures against the per-trade limit. Both are CHOSEN NOT MEASURED and both say so.

`pro.jsx` seeded the ticket with `Math.abs(estNet).toFixed(2)` — the BARE MID — while carrying
a comment saying a mid does not fill on these books. It now seeds mid + a quarter of the spread,
in the direction that fills, never past the touch and **never flipped round** (a +0.02 debit
conceded by 0.10 prices at −0.08, which the broker reads as "sell it for eight cents").

`comboBook()`, `limitPlacement()`, `notionalControlled()` and `notionalNote()` in `rules.js`
are what the ticket prints, for the **WHOLE structure and never leg by leg**:

- **Each leg at the side that actually trades.** To buy, lift the ask on the longs and hit the
  bid on the shorts. Summing "the bids" and "the asks" gives two numbers belonging to no trade.
  A leg with no two-sided quote means there is **no book**, never a book of zeros.
- **Where the typed limit falls**, with one sentence: fills now / you are waiting / this will
  not fill. **At the mid is named explicitly as the thing that does not fill** — and the
  comparison is tolerance-based, because the mid of two two-decimal quotes is
  0.23000000000000004 and an exact `===` would lose the one case that matters.
- **NOTIONAL CONTROLLED — contracts x 100 x spot.** Always computed implicitly, never once
  shown, which is why the owner reads the product as having no leverage. It refuses nothing; it
  is the fact that makes "capital at risk" mean something.
- **Time in force is stated in words.** A `day` order that expires at the close without a word
  is the same invisible failure as an order that never fills.

## ONE CHANCE, ONE ARITHMETIC — and the Monte Carlo is the one

The app computed "the chance of profit" FOUR ways and the real difference was never the
algorithm, it was **the drift**: `montecarlo()` in `App.jsx` (8,000 UNSEEDED runs on the
seasonal means), `probProfit()` in `engine.js` (closed form, risk-neutral 0.045),
`probProfit()` in `pro.jsx` (a second closed form, same 0.045) and `chanceInProfit()` in
`visuals.jsx` (band integration, `driftAnnual` defaulting to 0). One position had several
chances depending on which screen you stood on, and the Build panel's changed every time the
button was pressed. PRD §4h.

- **`terminalMC()` in `engine.js` is the arithmetic. It has NO DEFAULTS and THROWS without a
  policy** — `{ driftAnnual, sigma, dte, runs, seed }` — for the same reason `exitSim()` does:
  `engine.js` imports nothing, `rules.js` imports it, and a default is how a stale number comes
  back silently in a year.
- **`chanceOf()` in `rules.js` is the only caller of it.** The run count (`RULES.mcRuns`), the
  drift (`seasonalDrift()`), the volatility (`ivProvenance()`) and the seed are assembled there,
  at the one place that already reads the home. **`chanceCheckOf()` in `App.jsx` is the one
  spelling of `chanceOf` in that file**, the same discipline as `modelCheckOf()`; the Guardian
  is HANDED the answer. `riskGate.test.js` fails the build on a second spelling, on any
  `chanceOf` in `pro.jsx`, and on any file running a `terminalMC` of its own.
- **AND THE DRIFT SAYS WHOSE TABLE IT CAME FROM.** `seasonalProvenance()` in `rules.js`, beside
  `markProvenance` / `sigmaProvenance` / `ivProvenance`, is the ONE home: measured history or the
  hand-written estimate, the year count, the age in days and one sentence. **`chanceOf()` THROWS
  when handed a bare row of monthly means** — the same discipline as `terminalMC()` throwing
  without an exit policy — and `riskGate.test.js` sweeps every file for the shape too. A screen may
  not print a chance without the sentence: one corrected CORN cell moves it 18.9 points and flips
  the sign of the average result. `chanceSourceNote()` may NOT say "<ticker>'s own seasonal
  reading" about a row somebody typed. **No table at all is not a drift of zero**: `missing` → no
  chance and a sentence. **The ABSENCE of the stamp on a record is the marker**, as with
  `contractsAssumed`. The SERVER reads the same measured means out of `av.mjs`'s blob cache
  (`av/<SYM>.json`) — one read per TICKER, never a fetch (25 requests a DAY for five markets),
  stale served as is — through `parseAvJson()` / `statsFromMatrix()`, which live in `engine.js`
  because a Netlify function cannot import `App.jsx` and a second parse is a second table. PRD §4j.
- **THE DRIFT IS THE APP'S OWN SEASONAL THESIS. THE VOLATILITY IS THE MARKET'S IMPLIED ONE.**
  The market says how wide the distribution is; the app says which way it leans. Every price in
  this app is already worked out at that implied volatility, so anything else would price a trade
  at one number and judge it at another. The realised `SIGMA` table keeps its own job — it is
  what the exit simulator walks the PRICE on, a different question. This is ROADMAP P2's house
  distribution arriving half early; P2 still owes realised volatility.
- **IT IS SEEDED FROM THE POSITION** (ticker, expiry, rounded DTE, legs, spot to the cent), so
  the Radar row, the Shortlist row, Build, the Guardian and the brief land on one number by
  construction. Spot is rounded so a quote wobbling in the third decimal cannot re-roll the
  simulation under the reader.
- **ONE RUN COUNT FOR RANKING AND FOR PRINTING, AND THAT IS THE TRAP.** The Shortlist ranks many
  candidates and prints the chance of each; a cheaper count for ranking would mean the row you
  compared and the row you opened disagreeing. Measured: 0.54 ms a candidate at 8,000 runs, about
  43 ms for the widest pool in the app. **Never print a closed-form number as "the chance".**
- **THE CHART READS THE SAME DRIFT — and fixing that found a second fault.** `chanceInProfit()`
  had `driftAnnual = 0` and nothing ever passed one; the default is gone and a missing drift is
  `null`, never a confident number. And `payoffBands()` samples only ±30% of spot, so integrating
  band by band **threw the tails away**: on BOIL at 85% implied over 45 days a long call read 15%
  where it is 34%. `bandMass()` extends a band that reaches the edge of the sampling to the tail.
  `ceiling.test.jsx` holds the chart against the simulation at **2 percentage points** — the
  worst measured gap is 1.59, and the same structure at 400,000 runs lands within 0.01 of the
  chart, which is what proves the gap is sampling error. **If it ever fails, the chart is wrong;
  do not widen the tolerance.**
- **EV IS THE SIMULATION'S OWN MEAN.** `pop * maxProfit - (1 - pop) * risk` is a two-outcome bet
  and most of a spread's distribution is between those two outcomes. `evProfile()` and the Build
  stat (relabelled AVERAGE RESULT) read `mc.ev`. The no-ceiling rule is untouched: an unbounded
  structure still ranks last with a blank EV.
- **UNKNOWN IS NOT A NUMBER.** `chanceOf()` returns null without a spot, a horizon, an entry price
  or a seasonal row, and every screen prints a dash. The one input with a named fallback is the
  implied volatility, and `ivProvenance()` says on screen that it used one.
- The Build screen's "THREE PROBABILITIES" panel is **TWO QUESTIONS** now. There were only ever
  two — where it finishes, and how it ends under the exit rule — and the third entry was an
  arithmetic that did not agree with itself.

## A BRIEF WRITTEN AT THE WRONG HORIZON IS MARKED BY WHAT IT DOES NOT CARRY

`exitSim()` walked every position to 7 DTE while `RULES.exitDTE` has been 21 since it was changed
from 7, and four pull requests shipped on top of it. What the Journal keeps is not the brief: it
is the verdict plus the model's RATIONALE — prose written after reading those numbers — so the
wrong horizon sits inside the text where no migration can reach it.

**NOT BY DATE**: a deploy date is a second home for a fact the entry can carry itself. New
autopilot entries carry `simExitDTE` and `simDays`, taken from `sim.exitDTE` and `sim.horizon` —
the simulator's OWN answers, never `RULES` written out a second time, because a field name
asserting a rule the arithmetic had not applied is the whole fault. **The ABSENCE of the stamp is
the marker**, exactly as `contractsAssumed` marks a size that was assumed rather than recorded.
`simHorizonOf()` / `autopilotHorizonNote()` in `src/journal.js` read it — how a record was
produced is a fact about the record — and every screen that renders an unstamped entry prints one
plain sentence: the Guardian's timeline, the Journal's timeline, the weekly report and the model's
context. `Number(null)` is 0 and 0 is finite, so the stamp must BE a number before it is coerced
to one; a horizon of 0 is a real reading.

## Three numbers that had no home — and two sweep exclusions that are gone

No value changed: a rename that moves a number is two changes wearing one coat.

- **`RULES.watchAttentionShare`** (0.35) with `watchAttentionLevel()` — the share of the maximum
  loss at which a position asks to be looked at. It is not the stop and not the spread floor,
  whatever its value equals. With it homed, **`maxSpreadShareOfMid` is back on the rule-literal
  sweep list**, where it was the one number deliberately kept off.
- **`RULES.autopilotConfidence`** (70) — the bar the autopilot waits for before proposing
  anything unprompted. It is NOT `lowConfidence` (40, the bar under which the gate warns about a
  trade the USER asked for). With it homed, **`signals.js` is back in the swept file set**.
- **`RULES.fallbackIV`** (0.25) with `ivProvenance()` — the IMPLIED volatility the options are
  priced at. **It is the same number as `fallbackSigma` and must never be one constant with it**:
  that one is the REALISED volatility the simulator walks the share's price on. One is a property
  of the share, the other of the option market on it, and merging them would make a correction to
  either silently move the other. Provenance is carried the way `sigmaProvenance()` carries it.

## ONE VOLATILITY SOURCE — and `sigmaProvenance()` knows THREE

`statsFromMatrix()` has always returned the MEASURED realised volatility of the monthly series
beside the twelve means. `App.jsx` stored it as `seasonal[tk].sigma` and handed it to the
Guardian's `exitPathSim`; `autopilot.mjs` read `SIGMA[pos.ticker]` with no measured value
available to it at all. **One position, two volatilities**, and `pTP`, `pSL`, `pTimePos`, `ev` and
`medDays` all move with the difference — the fault PR #26 fixed for the seasonal MEANS, one layer
down. PRD §4k.

- **`sigmaProvenance(measured, tableSigma, ticker)` in `rules.js` is the one home**, in the same
  shape as `seasonalProvenance()`: the value, the source, the year count, the age in days and one
  sentence. Three sources — `measured history`, `table`, `fallback` — and the sentence may no
  longer say "written down, not measured from returns" about a number that was measured.
  `readingAgePhrase()` is shared with the seasonal stamp because **it is one reading**: the means
  and the sigma come out of one parse of one body.
- **`exitSim` and `exitPathSim` take the PROVENANCE, not a number, and THROW on a bare sigma** —
  the same discipline as `exitSim` throwing without an exit policy and `chanceOf()` throwing on a
  bare row of means. The check is structural, because `engine.js` imports nothing. Both **return**
  `sigma` and `sigmaSource`, so a field name cannot assert a reading the arithmetic did not use.
  `riskGate.test.js` sweeps every file for a call site handing either one a bare `SIGMA[...]`,
  `getU(tk).sigma` or `seasonal[tk]?.sigma`.
- **ONE BLOB READ, TWO PROVENANCES.** `measuredSeasonal()` in `autopilot.mjs` returns
  `{ monthlyMean, sigma, years, at }` — the sigma it was already computing and throwing away.
  Never a second read and never a fetch.
- **The ABSENCE of the stamp means the hand-written table**, the third time this pattern is used
  (`contractsAssumed`, `simExitDTE`, `seasonalSource`). `simVolOf()` / `autopilotVolNote()` in
  `src/journal.js`, rendered wherever `autopilotHorizonNote()` is.
- **`RULES.fallbackSigma` is still the named fallback and still says it was CHOSEN**, and nothing
  inside `SIGMA` was edited: this changed where the volatility comes from and what the app SAYS
  about it. Fixing the table is ROADMAP P2.
- **The Build screen's simulation footnote named the wrong quantity.** It printed `seas.sigma`,
  the realised volatility, on a panel whose every figure is priced at the chain's IMPLIED
  volatility. It names the implied volatility and the seasonal table now, and `seas` no longer
  carries a `sigma` at all.

Both collisions were clean on the first sweep — nothing was hiding behind either. All three are
CHOSEN, not measured, and all three are on the PRD's NOT VERIFIED list.

## The entry floor is ROOM, not a cliff

`entryRoom()` in `rules.js`, enforced in `riskGate.js` and nowhere else. The quantity that
matters is `room = dte - exitDTE`, not the expiry: 30 days is nine days of room and there is
nothing about nine that is right and seven that is wrong.

**THE NUMBER 30 IS UNCHANGED, DELIBERATELY.** What changed is either side of it:

- `dte <= exitDTE` → **hard violation** (`ENTRY_DTE`), and **not overridable**: the exit rule is
  frozen at construction, so there is no version of the trade it does not immediately end.
- `exitDTE < dte < minEntryDTE` → **`ENTRY_DTE_ROOM`**, carrying the number. Without a typed
  reason it BLOCKS and says what would unlock it; with one (`RULES.minOverrideReasonChars`, the
  same constant `sizing()` and the against-the-signal override use) it becomes a WARNING and
  the reason goes to the Journal. An override is not a dismissal: the warning stays.
- `dte >= minEntryDTE` → unchanged, nothing is said.

**`passedOver` IS OFFERABLE NOW, NOT MERELY NARRATED.** `expiryChoice()` has been naming a
nearer, busier board and not letting anybody take it — a door with no handle. Past the exit rule
it can be taken through the override; at or inside it, it cannot, by anybody. **The CHOICE is
untouched** — a passed-over board is never what the app opens on by itself.

**And it is instrumented, because the 30 has to be settled from a reading.**
`passedOverRecord()` writes one row per market per board into `store.expiryLog` (local, capped
at 60, never in the `/api/state` blob — it is calibration data, not a position) and the Journal
reads it back with `passedOverSummary()`. ROADMAP P5 is what reads it. **The log is empty until
the app is used.**

## The position remembers its size — and an assumed 1 is not a measured 1

`riskGate.js` read `p.contracts` in three places — the 25% exposure ceiling, the dollars a
proposal risks, the stop threshold — and **nothing ever wrote that field.** Every open
position counted as ONE contract for the rest of its life however many were really bought,
and the Build screen's gate ran at a hardcoded `contracts: 1` while the ticket below it sized
the order at `cfg.qty`. A cap that reads the wrong quantity is not a display bug.

- **ONE HOME.** `commitPosition()` in `App.jsx` stores `contracts`. `positionSize(pos)` in
  `src/journal.js` is the only way it is read back. Never spell `Number(p.contracts) || 1`
  anywhere again.
- **TWO COUNTS, TWO UNITS, AND THIS IS THE TRAP.** `legs` carry a `qty` each and `analyze()`
  MULTIPLIES BY IT, so a vertical saved as `+10/−10` has the ten inside `entryNet`,
  `maxProfit` and `maxLoss` already. `orderBody()` then divides the legs by their GCD and
  puts the factor in the order's `qty`, so the broker is asked for `contracts × GCD`.
  `positionSize()` returns both: **`contracts`** multiplies the dollars and is what the gate
  reads; **`brokerQty`** is Alpaca's own count and is what the screen prints, because it is
  the number you can check against the account. Reading the reply's `qty` as the multiplier
  counts the size twice — `$450` became `$4,500` — so `commitPosition()` divides it by
  `reduceRatios(legs).factor` first. **Read on screen by the owner, 18 Sep 2026**: a row
  saying "1 contract — assumed" beside its own timeline saying "0 of 10 combinations bought".
- **THE SIZE IS THE SCREEN'S, NOT THE TICKET'S.** `contracts` is Build-screen state in
  `App.jsx`, above `OrderTicket` (now a controlled input on it), the `guard` memo, the
  confirm step and the record. It resets on a ticker, expiry or hand-off change.
- **AN ASSUMED 1 IS NEVER A MEASURED 1 — BUT ONLY SAY "ASSUMED" WHERE THE DOUBT IS REAL.**
  `withPositionSize()` gives an older record a `contracts` of 1 at hydration the way the
  `v: 2` pass gives it a ref, marks `contractsAssumed`, and the flag survives `localStorage`
  and `/api/state`. `positionSizeNote()` then splits two cases: where the legs carry the
  size (`perCombo > 1`) the app is NOT guessing and the row says the broker's count in plain
  grey; where the legs say nothing the amber "assumed, not recorded" line is right. A
  warning printed over a number the record plainly holds is the screen contradicting itself.
- **PER COMBINATION STAYS PER COMBINATION.** `entryNet`, `maxProfit` and `maxLoss` describe
  the STRUCTURE and are never scaled in storage. The size is applied at the boundaries: the
  gate's dollar limits and stop threshold, the P&L on a position row (Alpaca's
  `unrealized_pl` was always a total and the app's own number was one combination), `riskOk`
  in the Journal, the exit ladder's `userQty`, the autopilot's close, and the Build screen,
  which NAMES the totals when the ticket is above x1. The wizard's road keeps `contracts: 1`
  because a road is built to fit the budget at one combination, and the card says so.
- Every order path is sized by the number its gate measured. `sendToAlpaca()` passes it to
  `alpacaOrderMleg()`; `placeExit()` and `autopilot.mjs` pass `contractsOf(pos)`.

## `modelCheckOf()` — one model check, four consumers

`modelSanity()` is spelled ONCE in `App.jsx`, inside `modelCheckOf(analysis, { legs, spot,
dte, iv })`. The three generation sites call it and the Build screen memoises it on `analyze()`
and hands the verdict to the order ticket. `ComboBookPanel` in `pro.jsx` used to run it inline
on every render AND re-derive the marks from `quoteFn(leg).mid` where the Shortlist passes
`legPx[i].px` — the same number for a quoted leg, **different for one priced off the model** —
so two screens could name different legs for one trade. `riskGate.test.js` fails the build if
`pro.jsx` calls `modelSanity` again or if `App.jsx` calls it more than once;
`ceiling.test.jsx` holds the ticket's reading against the Shortlist's.

**A RULE NUMBER HAS ONE HOME, AND A TEST REFUSES THE COPIES.** `REASON_MIN = 15` was one; the
sweep found three more, all `45` where `RULES.targetEntryDTE` lives. `riskGate.test.js` refuses
the shapes a copy takes here — a `useState` default, a property, a local constant, and **a rule
number inside an ARITHMETIC EXPRESSION** — against twenty rule numbers, over every file that
computes a number a screen or a brief prints (the list is read off the disk, so a new module or
endpoint is swept without anybody coming back). A second test proves the matcher can still see
each shape AND still stays quiet on the things that are not copies.

## The simulator walked to the wrong day — and the exit policy is the CALLER'S

`exitSim()` in `engine.js` held `0.5 * pos.maxProfit`, `0.5 * pos.maxLoss`, `dteLeft - 7` and
`netBS(pos.legs, s, 7, iv)`. Two were right by luck; **`RULES.exitDTE` is 21 and has been since
it was CHANGED FROM 7**, so the simulator walked to 7 days and marked the survivors at 7 days
while the app closes at 21 — and `autopilot.mjs` handed the result to the model in a field
called `p_exit_at_exit_dte_positive`. The NAME asserted the rule the arithmetic had not applied.

- **The policy is an ARGUMENT, and it has NO DEFAULT.** `engine.js` imports nothing and `rules.js`
  imports `engine.js`; reading RULES from the engine would be a cycle. `exitSim(pos, S, dteLeft,
  iv, sigma, { exitDTE, takeProfitPct, stopLossPct }, n)` THROWS when the policy is missing or
  unreadable — a default is how the bare 7 comes back, silently, in a year. `autopilot.mjs` builds
  `EXIT_POLICY` from `RULES` once.
- **`exitSim` returns `horizon` and `exitDTE`**, and the brief prints them (`days_simulated`,
  `simulated_to_dte`), so a field name cannot assert a rule on its own authority again.
- **`pro.jsx`'s `exitPathSim` keeps its own body deliberately** (see Known traps) but not its own
  numbers: it reads `RULES.exitDTE` for the survivor mark, which was a bare 7 disagreeing with
  its own walk.
- **Never call `netBS()` with a number where the days go.** `engine.test.js` fails the build if
  either simulator does: that third argument is always a policy written down twice.
- **The volatility has a name, a source and an age.** `SIGMA[pos.ticker] || 0.25` was a
  hand-written table with an unlabelled hand-written fallback behind it. `RULES.fallbackSigma` /
  `sigmaProvenance()` decide once which of THREE sources is in force — measured, table, fallback —
  and carry it to the brief, the warning and the model, exactly as `markProvenance()` does for a
  price. **The volatility is an ARGUMENT with no default, like the policy**: both simulators throw
  on a bare sigma and return the one they walked on. **0.25 is CHOSEN, not measured**; fixing the
  TABLE is ROADMAP P2.

## Working orders have a home, and SENT is not FILLED

`orderOutcome()` has distinguished the two since PR #18, but an order that was working lived
only on the full desk — so the one order this app has ever sent was invisible from the moment
it left. Working orders are listed **first on Positions, above the positions**, with their age,
limit and time in force, and on the front page beside "what needs attention today".

- **Re-pricing is NOT a seventh order path.** It cancels at the broker and lands the trade back
  on Build, so the send goes down path 2 like everything else on that screen. A road must not
  reach an order without passing the screen that shows the trade.
- **SENT and FILLED are two timeline entries.** `sent` when the order leaves, naming its price
  and how long it stands; `fill` from `recheckOrders()` when and only when the broker says so.
  A position on the app's own book has no `sent` entry, because nothing was.

## A wide market is not a price — the THIRD floor, beside the liquidity one

`RULES.maxSpreadShareOfMid` (0.35) with `spreadShare()` / `spreadFloor()` in `src/rules.js`,
applied inside `qualityFloor()` at all three generation sites. **The liquidity floor's two
constants are untouched: this sits beside them.**

They test different things and neither implies the other. Open interest is a HEADCOUNT — how
many contracts exist, from last night's close. The spread is TODAY'S DISAGREEMENT about what
one is worth. **A leg with 300 contracts open and a 145%-wide market passes the liquidity
floor untouched**, and every MAX PROFIT, CHANCE and EV in this app is computed from the MID.

Read live on BOIL 2026-10-09 near the money: bid/ask spreads of **66%, 91%, 145% and 166% of
the mid** on strikes the app builds on. At 145% the ask is more than three times the bid.

- **Why 0.35.** You pay half the spread getting in and half getting out, so at share `s` the
  round trip costs `s` of what the leg is worth. A third of the position going to the market
  maker before the trade is right about anything is already punishing, and it is drawn where a
  quote stops being a price — not where a trade stops being good.
- **It does not move with the liquidity SETTING.** Loosening the headcount is not an answer to
  "may the two sides disagree by a factor of three".
- Same two rules as the liquidity half: **unknown is not wide** (a leg quoted on one side, or
  priced from the model, is skipped — `spreadSkippedNote()`), and **it names itself**
  (`spreadFloorReason()`, `wideSpreadNote()`, its own count in every tally).

**And a chain whose own prices contradict each other is named, not priced off.**
`monotonicityBreaks()` / `monotonicityNote()` in `chain.js`: a call can never cost more than a
call at a lower strike. FIVE of 25 adjacent near-the-money pairs on that BOIL board broke it.
It filters nothing — it is a statement about the whole EXPIRY, and the honest response is to
say the feed looks unreliable here.

## THE PAIR IS NOT THE LEGS — the FOURTH floor, beside the third

`RULES.maxComboSpreadShareOfNet` (**1.0**) with `comboSpreadShare()` / `comboSpreadFloor()` /
`comboSpreadFloorReason()` / `wideComboNote()` / `comboSpreadSkippedNote()` in `src/rules.js`,
applied inside `qualityFloor()` at all three generation sites. **The per-leg floor's constant is
untouched: this sits beside it**, with its own count (`tally.comboSpread`, `floors.comboSpread`)
and its own sentence.

`spreadFloor()` measures ONE LEG AT A TIME and reports the worst share among the legs. Read live on
the owner's phone, UNG 2026-09-20, 2026-10-23 at 33 DTE, spot $10.42: buy the 10.50 call (mid 0.48),
sell the 11.00 call (mid 0.34), each leg about ten cents wide — **21% and 29% of its own mid, both
inside the 35% per-leg ceiling** — and the pair quoted bid $4 / mid $14 / ask $24. **A spread of $20
on a mid of $14 is 143%, four times the per-leg ceiling, and it was offered.**

On a vertical the two leg spreads ADD (you cross one getting long and one getting short) while the
two mids SUBTRACT, so both spreads land on a seventh of the money. No per-leg number can catch that
without refusing every leg on these chains.

- **WHY 1.0, AND IT IS NOT A COPY OF 0.35.** At share `s`, `ask = bid × (2 + s) / (2 − s)`: 0.35 is
  "the ask is at most 1.4× the bid", 1.0 is "at most 3×". One is the bar for a CONTRACT, quoted in
  its own right; the other for a COMBINATION, quoted as the arithmetic of two contracts and
  structurally wider. At 1.0 the round trip costs the whole of what the structure is worth.
  **CHOSEN, not measured** — on the PRD's NOT VERIFIED list, and expect a real reading to bring it
  DOWN, exactly like `modelDisagreementRatio`.
- **DELIBERATELY SEPARATE FROM THE PER-LEG FLOOR**, the same reasoning that keeps `priceability()`,
  `impossibleLoss()` and `modelSanity()` apart: "this leg is untradeable" and "this trade is
  unaffordable" are different facts, and a pooled count would explain neither.
- It reads `comboBook()`, so the number the floor judges IS the number the ticket prints. Same two
  rules as everything else: **unknown is not wide** (no two-sided quote on every leg → SKIPPED), and
  a net under `MIN_NET_DOLLARS` belongs to `priceability()`, never to a division here.
- **It changes what is OFFERED, never what may be SENT.** Out of the gate, like the other floors.

## EVERY FIGURE IS WORKED OUT AT THE PRICE THAT WILL BE SENT

`analyze(legs, S, dte, baseIV, q, { net })` in `App.jsx`. It priced at the mid, full stop, so Build
said YOU PAY $14 · MOST YOU CAN MAKE $36 · MOST YOU CAN LOSE -$14 · BREAKEVEN 10.64 while
`limitPlacement()` two thousand pixels below said a limit AT the mid is a limit nobody has to meet.
At $24, the price that trades: pay $24, make $26, lose $24, break even 10.74. **Nearly half the
reward and nearly double the risk** — 2.6:1 becomes 1.1:1.

- **`AE` on the Build screen is that analysis and everything reads it**: the six stats, the
  reward-to-risk, the chance, the gate preview, the confirm step, the ticket and **the record**. A
  position recorded at the mid describes a trade nobody made, and the Guardian reads it for life.
- **`entryMid` and `entrySource` ALWAYS travel** — the mid is still the honest "what it is worth",
  and a field name may never assert a price the arithmetic did not use. With no `net` it is the mid,
  so every existing caller is unchanged. The leg marks, the greeks and the volatility are untouched:
  those are properties of the chain, not of the price you chose.
- The Shortlist row still prints its candidate at the MID — a candidate is a structure, not yet a
  price — and Build says so in one sentence where the two are side by side.

**A LIMIT IS A CEILING, NOT A PRICE.** An order at or past the touch fills AT the touch, so offering
more costs nothing and buys protection against the quote moving while the order travels.
`effectiveLimit()` is `min(limit, ask)` on a debit and `max(limit, bid)` on a credit, through ONE
`keenerThan(dir, …)`; `limitCeilingNote()` says *"you offer $30, you pay $24"* and only when the two
differ. **`TICK_EPS` (half a cent) is not cosmetic**: `book.ask` is a SUM of leg quotes, so a limit
typed at exactly the price that trades meets 0.24000000000000005 and read "you are waiting" at the
one price that fills — the same tolerance `limitPlacement()`'s mid comparison always carried.

## The order ticket — the market first, one slider per leg, one verdict

Designed with the owner against his own screenshots. He set a limit at the exact mid because the
panel gave him no way to see that nothing lives there. **Neither the price nor the size is the
ticket's**: `ticket` (`{ type, tif, legPx }`) is Build-screen state in `App.jsx` beside `contracts`,
and the ticket is a controlled input on it. Top to bottom:

1. **THE MARKET, READ-ONLY, FIRST** — `legBook()` in `rules.js`. One row per leg, its bid and its
   ask and the SIZE at each, the two sides that trade in full contrast. **The sizes arrive for
   free**: Alpaca's `latestQuote { bp, ap, bs, as }` was being parsed away by `chain.js`. Same
   discipline as open interest — **a missing size is UNKNOWN, never zero** (`?? null`), a reported
   zero is a real reading, and `sizeSkippedNote()` says which legs have none. CBOE has no sizes.
2. **ONE SLIDER PER LEG, IN ONE-CENT STEPS.** The user prices each leg, the app computes the net —
   the reverse of the single net field, and the direction the owner thinks in. Cents because
   **options do not have continuous prices** and 0.525 is not one; `onTick()` is applied to the
   VALUE, not to a spinner. `legLimitSeed()` concedes each leg toward the side that trades and
   **sums to exactly `openLimitPrice()`** on the combination: one arithmetic seen two ways.
3. **THE NET, BIG, BESIDE ITS OWN ARITHMETIC** (`netFromLegs()` → `0.52 − 0.30 → $22`), so it is
   never a number that appears from nowhere.
4. **TIME IN FORCE IS PART OF THE VERDICT, NOT A DROPDOWN.** Inside the spread on GTC is "nobody is
   there now, but the order survives the close and over days this market moves"; the same price on
   DAY is "gone tonight, filled or not". `orderVerdict()` is built ON `limitPlacement()`.
5. **ONE VERDICT BAND**, three states (`ORDER_VERDICTS`), naming the distance: FILLS NOW / WAITING —
   $N under what trades today / WILL NOT FILL.
6. **FOUR NUMBERS THAT MOVE**, at the effective price: most you can make, most you can lose, break
   even, made per $1 risked.
7. **THE WARNINGS, ONCE.** The CONFLICT paragraph was on one page FOUR times. The narrative keeps
   its home in "Why this trade"; `warningsToPrint()` replaces it elsewhere with
   `conflictSummaryLine()` (the count and a pointer), and `BuildWarnings` is one collapsed panel
   that opens by itself while a written reason is still required. **The gate is NOT changed for a
   copy problem** — what changed is what a screen prints. `ConfirmSteps` takes `showWarnings={false}`.

## A picture is drawn at the numbers its own chance was computed at

`terminalDist()` in `visuals.jsx` has **no default drift**, the last one in the file.
`ComparePayoffs()` was the caller relying on it: `sigma: shown[0].sigma || 0.3, dte: shown[0].dte || 45`
and no drift at all, so it drew a risk-free lognormal at the candidate's REALISED volatility under a
`pop` computed at the chain's IMPLIED volatility on the seasonal drift. `chanceDrawFields()` in
`rules.js` puts the chance's own two numbers on the candidate beside `seasonalStampFields()`;
`compareDistInputs()` refuses to draw without both and `compareDistNote()` names what is missing.
**The ABSENCE of the stamp is the marker**, the fourth use of that pattern. `UnifiedPosition()`
passes `drawDrift` and was never at fault.

**AND THE SWEEP LEARNED THE SHAPE THAT HID THE 45.** `riskGate.test.js` knew three shapes; a
FALLBACK OPERAND (`IDENT || 45`, `IDENT ?? 45`) is none of them, because the number is neither
assigned nor added. Shape 4 refuses it and stays quiet the same way shape 3 does — the identifier
must carry a RULE WORD, so `c.dte || 45` is a copy and `bins.length || 45` is not.

## DEAD IS NOT WORKING — and a trade nobody bought is not a position

Three lists, two pure functions, and **only one of the three is a book**. PRD §4m.

- **`orderLifecycle({ status, filled })` in `order.js`** — filled / working / dead / unknown. It
  reads the `DEAD` list that has been in that file since PR #18, so there is no second copy. The
  live-orders filter used to be `p.alpacaId && p.alpacaFilled === false`, which asks whether an
  order was FILLED and never whether it is ALIVE: the owner's phone showed "WORKING AT THE BROKER
  (3) · SENT, NOT FILLED" over three rows badged **CANCELED, EXPIRED, CANCELED**, two of them three
  days old, each row printing its own status directly under the heading that contradicted it.
  **SENT is not FILLED and DEAD is not WORKING are the same rule at two moments of an order's life.**
- **`positionStage(pos)` in `journal.js`** — `owned` / `working` / `not-taken`. `store.positions` is
  what the app DECIDED, not what the user OWNS. No `alpacaId` means the app's own paper book, where
  deciding IS owning. **ONLY `owned` IS A POSITION**: only it has a real P&L, only it counts towards
  the exposure ceiling, only it has an exit plan running. `App.jsx` derives all three lists in one
  pass (`byStage`); never write the filter by hand again, and `riskGate.test.js` fails the build on
  the old shape.
- **UNKNOWN IS NOT DEAD.** A record the broker has not been asked about is `working` — the app may
  not bury an order on its own authority. Same rule as a missing open interest, quote size or drift.
- The app said **YOUR POSITIONS (3)** with -$80 / -$27 / $0 and **"EVERYTHING IS ON PLAN"** directly
  under the broker's own **"OPEN POSITIONS (0) — Nothing open on Alpaca."** The -$80 was the loss on
  a trade that does not exist, in the biggest red figure on the card, with the correct warning in
  small amber text beneath it. **A screen that argues with itself is worse than one that says
  nothing: the part that shouts loudest wins, and here that part was the false one.**

## Watching — the fourth place, for trades that were never taken

Beside Positions and the Journal, because a trade you did not take is **neither a position nor
history**: it is a live observation, and the Journal is the record of what HAPPENED. Two sources,
one list: records whose order came back with nothing bought (they arrive by themselves), and
structures saved from the Shortlist. **`store.saved` moved off the Positions screen** — it was a list
of trades NOT taken sitting on the screen whose whole job is the trades you have.

- **`wouldHaveDone()` in `journal.js` returns the number AND the sentence**, so neither can be
  rendered alone, and the screen prints it in muted grey — **never the red the Positions cards use**.
  A theoretical figure painted like a real one rebuilds the fault one tab across; a test refuses it.
- **THE STARTING PRICE IS THE TRAP.** A saved row's `entryNet` came off the Shortlist, which prices
  at the MID — the price this app has just proved nobody gives you. Started there, every watched
  trade flatters itself for ever. Each row says which price it began from, and an unstamped record
  is named rather than flattered: **the absence of the stamp is the marker**, the fifth time
  (`contractsAssumed`, `simExitDTE`, `seasonalSource`, `driftAnnual`, `entrySource`).
- **`Number(null)` is 0 and 0 is finite** — for the FIFTH time in this repository, and caught by its
  own test on the first run. The nulls go out before the coercion.

## Which expiry the app opens on — the board decides, not the calendar

`expiryChoice()` / `expiryChoiceNote()` / `emptyExpiryNote()` in `src/rules.js`.

Measured on BOIL, near the money, contracts clearing the 10-contract floor:

    2026-09-18 (14 DTE)   19 of 23
    2026-10-02 (28 DTE)   12 of 14
    2026-10-09 (35 DTE)    2 of  7   <- the one the app selected

The app picked by DISTANCE FROM A TARGET DTE alone and landed on the deadest board on the
market. That is why the Shortlist kept saying "nothing clears" while the Radar, looking at a
different expiry, said four structures had. **The floor was never the problem.**

Among expiries past `minEntryDTE` and inside the new `maxEntryDTE` horizon (90 — twice the
target, so "busiest board" cannot answer with one a year out), it prefers the one whose
near-the-money contracts actually clear the floor in force; distance from `targetEntryDTE` is
the TIE-BREAK it always should have been.

- **The 30-day entry floor never yields** — that one is the gate's — but a nearer, thicker
  expiry passed over because of it is named on screen (`passedOver`).
- **A BOARD THAT SETTLES TODAY IS NOT AN ALTERNATIVE**, so `passedOver` excludes anything at or
  below `SETTLING_DTE` (1 DTE). The note offered "2026-09-04 is busier — 16 of 16 clear — but it
  is only 0 days out": nobody was choosing between a 45-day position and a contract with hours
  left on it, and on the main screen a sentence like that reads as a bug rather than as a rule
  explaining itself. The sentence exists to name a REAL trade-off the entry floor forced. The
  CHOICE is untouched — a settling board was never eligible — only what the app says about it.
- **An unknown board is not an empty one.** `Number(null)` is 0 and 0 is finite; unmeasured
  expiries rank on DTE and `measured` says so.
- **Every count names its expiry.** The Radar rows, the Shortlist's empty state and the
  removal tallies all carry the board they are about.

## Quality floors — the app will not propose an indefensible trade

Two named constants in `src/rules.js`, with the reasoning beside them, applied by
one pure function `qualityFloor()` at **every** point candidates are generated:
the guided flow's pool in `runWizard`, the Shortlist (`shortlistWithFloors`) and
the multi-market scan. See PRD §4b for the numbers and the evidence behind them.

- The **liquidity floor**, in two parts — `liquidityPercentile` and
  `minOpenInterestAbsolute`. A leg nobody trades is a quote, not a price, and
  how many contracts count as "nobody" depends on the market: 25 is nothing on
  UNG and a lot on SOYB. So a leg is judged **against the other strikes on its
  own expiry** (`expiryOpenInterest()` in `chain.js` is the peer set,
  `liquidityThreshold()` in `rules.js` turns it into a number), with an absolute
  minimum underneath so a chain where nothing trades cannot certify itself by
  being uniformly empty. `minPeersForPercentile` is when there is no
  distribution to take a percentile of, and the screen says which of the two
  bound rather than printing a number with no provenance.
- `minRewardRisk` — below it you must be right more often than anything on these
  chains actually prices.

**BOTH LIQUIDITY NUMBERS ARE NOW MEASURED, AND `rules.js` CARRIES THE TABLE.**
`/api/liquidity` (`netlify/functions/liquidity.mjs`) was run against the broker
on the 2026-09-01 close — 1,654 contracts in the band the app builds in, 1,035
of them reporting. Near the money the 40th-percentile bar ran from **28**
contracts on BOIL to **202** on UNG: a sevenfold spread across five markets the
app treats alike, and the reason one fixed number could never have served them.
The old 25 sat above the first quartile on SOYB and BOIL and below it on CORN,
UNG and WEAT — hardest on exactly the markets it was least able to judge.
`liquidityPercentile` (0.40) and `minOpenInterestAbsolute` (10) were both
confirmed; **`minPeersForPercentile` moved 12 → 8**, the one number the reading
changed, because only 34–76% of contracts report open interest at all and the
grain markets carry 10–11 reporting strikes at the ~45-DTE horizon this app aims
for — at 12 the relative half switched itself off exactly where the app builds.
`LIQUIDITY_MEASUREMENT` in `rules.js` is the one home for the findings, so the
copy explaining the floor cannot drift from the evidence: **never derive those
figures from the floor's own constants**, or the screen reports a new
measurement every time somebody moves the setting. One close is a reading, not a
law — re-run the endpoint as the market moves.

**RECOMMENDED IS WHERE THE APP STARTS.** A measured floor that ships switched off is a
measurement nobody applies. `src/riskGate.test.js` reads `App.jsx` and fails the build if
the initial level is anything but the recommended one.

**THE FLOOR IS THE USER'S SETTING, NOT THE APP'S ASSERTION.** `LIQUIDITY_LEVELS`
in `rules.js` is Strict / **Recommended** / Relaxed / Off, and the recommended
one reads `RULES.liquidityPercentile` and `RULES.minOpenInterestAbsolute`
directly, so "the app's recommendation" IS the constant rather than a copy of it.
`LiquidityFilter` on step 2 carries the live consequence of every setting — how
many survive, how many go for liquidity and how many for reward-to-risk — and
`looseningWarning()` names what a looser setting lets back in, in those words:
quotes on contracts nobody trades. Every filtered list on Radar and Shortlist
prints `liquiditySettingNote()` saying which setting produced it, and the wide
search prints the setting **it actually ran at**, not the one now in force.

Two rules hold them, and both are the point:

1. **Missing open interest is not low open interest.** Alpaca snapshots carry
   `oi: null`; reading that as `0` would reject a whole feed and call it
   illiquidity. Unknown → the check is SKIPPED and the screen says so
   (`liquiditySkippedNote()`). A real `0` from CBOE still fails.
2. **Never an empty screen without an explanation.** If the floors empty a
   market, say which floor and how many: `NOTHING_TODAY.belowQualityFloor()` on
   the refusal screen, a line on the Shortlist naming what it removed, and the
   counts in `verdictNarrative()`.

Adding a third generation site means calling `qualityFloor()` there too, and passing it
`quotes`, `legs` AND `openInterest` — the per-leg spread floor and the COMBINATION spread
floor both live in the same function, and the second one needs the legs to know which side
of each trades.
It also means calling `priceability()`, `impossibleLoss()` and `modelSanity()` before it,
in that order: they are four different questions and each one has its own count and its own
sentence, so a site that skips one cannot say which rule did the work.

**The floor is held up against the chains it is applied to.** `oiProfile()` in `chain.js`
and `OpenInterestReadout` at the bottom of the Shortlist print what open interest the
loaded chains actually carry — near the money and whole chain — beside the floor, plus the
value the RELATIVE half asks for on that distribution, so the two halves can be compared on
one screen. It reports and never estimates: unknown stays unknown, and a feed with no open
interest is named rather than drawn as zeros. It exists so the floor can be settled from a
live screen instead of re-argued from one walkthrough; `/api/liquidity` is the same
question asked of all five markets at once, where the keys are.

## Seasonality is MEASURED, and the hand table is a labelled fallback

`SEASONAL` in `src/engine.js` is hand-written and carries **30% of the four-factor score, the
heaviest weight**. Measured against 195 months of Alpha Vantage data for CORN it has the
**WRONG SIGN on eight months of twelve**: June reads +1.5 against a real ten-year mean of
**-3.46**, September -1.1 against a real **+1.03** — so the Radar has been calling CORN bearish
in a month that is historically positive.

- **Every market in the basket loads the real monthly series**, through the existing `/api/av`
  path, at startup. It used to be one button for whichever ticker was on screen, which left
  four markets scored on the wrong table.
- **The server caches it, with a TTL in DAYS** (`netlify/functions/av.mjs`, seven days, in the
  blob store the autopilot already uses). Monthly data changes once a month and Alpha Vantage's
  free tier allows **25 requests a day**: refetching per tab switch would exhaust the quota
  during a demo. Every answer is stamped with `_osl` — where it came from and how old it is —
  and a STALE cache entry is served when the upstream call fails, because six weeks of
  month-old seasonality beats today's hand-written wrong sign. Alpha Vantage refuses with HTTP
  200 and a "Note" body, so the failure is read out of the payload, never the status.
- **A market still on the fallback says WHY on screen**, not merely "estimate":
  `seasonalFallbackNote()` / `seasonalSourceLine()` in `App.jsx` separate "the call failed —
  <the error>" from "nobody has asked yet" from "loading".
- **The weights and the scoring arithmetic are untouched.** Only the numbers being scored
  changed, and they changed from invented to measured.
- **One series, one number of years.** The ten-year cutoff lands mid-year, so the matrix holds
  eleven CALENDAR years of which the first and last are partial. `years` is the row count and
  the only figure any screen prints — the header said "10y history" beside a panel saying
  "11y" about the same numbers. The **current year is excluded from the year-by-year
  backtest**, out loud: its window has not finished, and scoring it as a year that worked is
  scoring a trade that is still open.

## Exit rules

Chosen once per position at construction time, then frozen. Never renegotiated
while the position is open.

- Take profit at 50% of max profit — keep
- Exit at 21 DTE — changed from 7, see PRD §4
- Stop at 50% of max loss — **warning only, and the code now agrees.** `autopilot.mjs` used to
  set verdict `STOP` on the crossing and issue a one-tap approve link out of it, on the
  weakest-evidenced rule in the app. It produces verdict HOLD and one named warning now
  (`stopWarningSentence()`), never a link; `AUTOPILOT_VERDICTS` is `["HOLD", "CLOSE_ALL"]` and
  the model's prompt is generated from it, so STOP is not on the menu. A close taken on the
  warning is a MANUAL close with a written reason — `ruleExitOf()` says which rules actually end
  a trade, and the stop is not one of them
- DTE = days to expiration

## Architecture

- `src/rules.js` — **the single source of truth for the trading rules**. Take
  profit, stop loss, exit DTE, the entry-DTE floor and the PRD §3 sizing model
  (`sizing()`), `minNetPremium` with `priceability()` and `rewardRisk()` (is there a
  price at all — the check before the floors), `payoffCeiling()` /
  `profitUnbounded()` / `NO_CEILING` (is there a maximum profit at all),
  `impossibleLoss()` (is the worst case actually a loss),
  `contractListing()` / `unlistedContractNote()` / `legName()` (does the contract
  EXIST — the one the gate asks and `buildOcc()` cannot answer),
  `offBoardStrikeLabel()` (what a dropdown calls a strike the board does not list)
  and `unloadedBoardNote()` (a board that has not loaded is not a board that
  emptied), `checkedAgainstNote()` (which account the checks on screen were run
  against),
  `tradeCard()` / `TRADE_CARD_IDS` / `cardCurrencyNote()` (the five lines of the
  decision, and which currency they are in),
  `unquotedLegNote()` / `unquotedLegPointer()` (one fact, one place, on one
  screen), `marketOrderNote()`, `strikeSnapNote()`,
  `mcRuns` with `chanceOf()` / `chanceSeedKey()` / `chanceSourceNote()` (THE chance
  of profit, and the only caller of `terminalMC`), `seasonalProvenance()` /
  `seasonalStampOf()` / `seasonalSourceSentence()` (WHOSE seasonal table drifted it,
  and what the absence of a stamp on a record means), `fallbackIV` with
  `ivProvenance()`, `fallbackSigma` with `sigmaProvenance()` / `sigmaSourceSentence()` /
  `sigmaStampFields()` (WHICH realised volatility the exit simulator walked the share on — three
  sources, and the measured one is not "written down"), `readingAgePhrase()` (how old a reading
  is, shared by the seasonal stamp and the volatility one because it is ONE reading),
  `watchAttentionShare` with `watchAttentionLevel()`,
  `autopilotConfidence`,
  `modelDisagreementRatio` with `modelSanity()` (is it THIS structure's price —
  one of the two reasons this file imports `engine.js`, the other being
  `chanceOf()`, and deliberately so),
  `openLimitSlippage` with `openLimitPrice()`, and what the ticket prints:
  `comboBook()`, `limitPlacement()`, `notionalControlled()`, `effectiveLimit()` /
  `limitCeilingNote()` (a limit is a CEILING, not a price), `orderVerdict()` with
  `ORDER_VERDICTS` (where the price falls AND what the time in force does to it),
  `legBook()` / `sizeSkippedNote()` / `legLimitSeed()` / `netFromLegs()` / `onTick()`
  (the market table and the per-leg sliders), `maxComboSpreadShareOfNet` with
  `comboSpreadFloor()` (the PAIR is not the legs — the fourth floor),
  `chanceDrawFields()` (the two numbers a picture of a candidate is drawn at) and
  `conflictSummaryLine()` / `warningsToPrint()` (the warnings, once);
  `entryRoom()` with its override sentences and `passedOverRecord()`,
  `scratchPayoffShare`
  with `scratchLevel()` (copy only) and `reportNarrativePrompt()`,
  the two quality floors and `qualityFloor()` that applies them,
  plus the generated rule strings (`ruleBadge()`, `perTradeCapLabel()`,
  `copilotRulesBlock()`, `capitalSourceNote()`, `qualityFloorSentence()`,
  `RULE_PILLS`, `NOTHING_TODAY`), and the liquidity floor as a SETTING —
  `LIQUIDITY_LEVELS`, `liquidityThreshold()`, `looseningWarning()`,
  `liquiditySettingNote()`, and the shared `quantile()` that `oiProfile()` reads
  so the distribution on screen and the threshold applied come from one function.
  Never write a rule number or a rule sentence anywhere else — not in a
  component, not in a prompt, not in a serverless function. The thresholds
  that make the app refuse (`lowConfidence`, `expensiveIVRank`,
  `liquidityPercentile`, `minOpenInterestAbsolute`, `minRewardRisk`) live here
  too, so the "nothing today" screen can only ever explain a rule the code
  applies.
- **The autopilot's verdict and the closing price are rules, so they live in `rules.js`.**
  `markProvenance()` (did this number come from the feed or from `netBS`), `sigmaProvenance()`
  with `RULES.fallbackSigma` (did the simulator's volatility come from the table or from the
  fallback behind it), `autopilotVerdict()`
  (which rule fired, and whether it may become an approve link — `approvable` is a SEPARATE
  field from `verdict`), `AUTOPILOT_VERDICTS`, `stopWarningSentence()`, `ruleExitOf()`,
  `closeMarket()` / `closeLimitPrice()` / `CLOSE_LIMIT_SLIPPAGE`. A rule of action written
  inside a `.mjs` that runs on a server nobody is watching is a rule nothing can test.
- `src/journal.js` — **the permanent record of a position.** Plain JS, no React, for the same
  reason `rules.js` and `order.js` are. The ref given at open (`J-0001`, from a counter that
  only ever goes up — closing a position never hands its number back), the sequence on every
  timeline entry (`J-0001·03`, given when it is RECORDED, not by where a merge puts it),
  `appendTimeline()` / `stampTimeline()` (every append goes through one of these, so an entry
  cannot get its number two different ways), `orderStatusRecheck()`, `closeReason()` /
  `closeDecision()`, `journalEntry()` (what a closed trade keeps) and `searchJournal()`.
  **`simHorizonOf()` / `autopilotHorizonNote()` and `simVolOf()` / `autopilotVolNote()` live here
  too** — what horizon an autopilot entry's simulation ran to and which volatility it walked on,
  and the absence of either stamp, are facts about the record.
  **`positionSize()` / `contractsOf()` / `withPositionSize()` / `positionSizeNote()` live
  here too** — how big a position is, and whether that is known, is a fact about its record.
  `riskGate.js` imports them; nothing else may re-derive a size.
  **`bookPositions()` lives here too** — which records are the BOOK (owned + working, never
  not-taken) is a fact about the records, and it is the one home every consumer that measures
  money or writes a brief reads.
  **`closePos()` used to keep four fields** — ticker, pnl, ruleExit, riskOk — and drop the
  timeline, the thesis, both order ids and the reason. Never build a closed entry by hand.
- `src/order.js` — **what is actually sent, and what came back.** Plain JS, no React,
  for the same reason `rules.js` and `handoff.js` are: `orderBody()` (the one Alpaca
  body builder, used by all five sites that construct one), `reduceRatios()` /
  `orderQty()` / `unitLimit()` (the size in the quantity, the shape in the ratios),
  `orderPreviewLines()` (what an armed tap will send), `orderOutcome()` (filled,
  partly filled, working, killed — and which of them starts an exit plan) and
  `alpacaErrorText()` (the status and Alpaca's own body, untruncated). It writes no
  rule number and no rule sentence: `orderOutcome()` reports whether a reply is the
  kind that STARTS the exit plan, and the plan's words stay in `exitPlanSentence()`.
- `src/riskGate.js` — `evaluateTrade({ proposal, portfolio, capital, signals })`,
  a pure function returning `{ pass, violations, warnings }`. Every order path
  calls it, and a screen with no gate wired in fails closed
  (`runGate` in `pro.jsx`). It is where `entryRoom()`'s three bands are
  ENFORCED and the only place they are: `ENTRY_DTE` inside the exit window is
  not overridable, `ENTRY_DTE_ROOM` above it is unlocked by
  `proposal.entryOverride`. A proposal may carry `quotes` (one `{ bid, ask }` per leg)
  and `net`: the more of them a caller passes the more `priceability()` can catch, and
  the maximum loss alone already blocks the case that got through. **`contracts` is the
  size that will ACTUALLY be sent** and every dollar limit is `maxLoss x contracts`; a
  caller that leaves it out is read as one combination and `positionSize()` marks that
  assumed, so a screen evaluating one combination has to SAY it is a per-contract figure.
- `src/wizard.jsx` — **the app shell (PRD §5)**. The wizard is the entry point,
  not a tab: capital onboarding on a first run, then screen 1 (greeting, one line
  of status, **two** doors — and "what needs attention today" once positions
  exist), screen 2 (`FindOpportunities`: basket, budget and time, three driver
  sliders, then **"Decide for me"** as the last button), the verdict (the copilot
  narrative, the answers read back with a *change* link, then **two roads, never
  one** — each with a band thumbnail, a gauge, the "Why this trade" evidence panel
  and one generated sentence naming what it gives up) and the "nothing today"
  refusal.
  **The verdict is no longer a screen of its own.** A guided run lands on step 1 of
  the desk's path with its narrative, and `WizardCandidates` — the roads, unchanged
  — renders on step 2 beside every other candidate (see Navigation). The refusal
  stays a screen: it has nothing to hand to a path.
  **There is no confirm SCREEN.** "Take this road" lands on Build with the trade
  loaded, and the confirm step — what is being sent, the gate's checks in plain
  English, the exit plan stated as already decided — is `ConfirmSteps` at the
  BOTTOM of the Build screen, reading the live Build state, so a strike changed
  above changes the checks below. The gate runs **after** the tap and a refusal
  stays there with its reasons. A road must not be able to reach an order
  without passing the screen that shows the trade.
  `App.jsx` owns the `view` (`wizard` | `desk`).

  **Never pre-answer a question.** `wiz.risk` and `wiz.horizon` start `null` and
  stay null until the user answers; the button is disabled and names what is
  missing. A default that gets quoted back as "the $250 you said you were willing
  to lose" is the app putting words in the user's mouth. The basket and the
  weights DO have a starting position, because "all five, evenly weighted" is a
  visible state on screen that the user can see and change — that is not the same
  as an invented answer.

  **Lead a road with what it gives and costs**, with the frequency alongside the
  payout in the same sentence (`roadHeadline()`). Opening with "3 times in 10"
  reads as a bad trade to a beginner before they know what is being judged.

- `src/path.js` — **the numbered path**: the three steps and their order, what each
  one carries, `candidateOf()` (one shape for anything that can be compared or kept),
  the compare cap and the `store.saved` item a kept candidate becomes. Plain JS, no
  React, for the same reason `rules.js` and `handoff.js` are.
- `src/steps.jsx` — `StepNav`, `StepForward`, `EvidenceBar`, `EvidenceOverlay`,
  `DeskSheet`, `CompareTray`, `CandidateActions`. The navigation, and nothing
  about a trade. `DeskSheet` is the Build screen's own sheet — its numbers and
  its order ticket — and it is here rather than in `App.jsx` because it is
  chrome with no trade in it, and because there is exactly ONE `EvidenceOverlay`
  mount point in `App.jsx` and a test holds it there.
- `src/why.jsx` — **the "Why this trade" panel**, and the only copy of it. The
  agreement badge, the four factors as direction/strength bars behind a toggle
  that **names them** ("Show the four readings: Seasonality, Price trend,
  Weather and News flow", built from `FACTOR_ORDER`/`FACTOR_LABEL` so it cannot
  drift from the bars it opens — "show detail" was a door with no sign on it and
  nobody opened it), and the drill-down behind them: weather opens the regions and their anomalies, news
  opens the headlines with their tags. It lives here rather than in `pro.jsx`
  because the wizard's decision screen needs it too — a road with no evidence
  under it is a recommendation, and this app does not make recommendations.
  `pro.jsx` re-exports it so older imports keep working.

- `src/demo.js` — **the public demo (PRD §7b)**. `DEMO` is a module constant read
  once at import, exactly like `T` in `theme.js`: a flag that changed halfway
  through a render would mean two screens disagreeing about whether an order can
  leave. It also builds the three didactic positions from today's live prices —
  never from typed-in numbers, and never for a ticker whose price did not load.
- `src/visuals.jsx` — **the visual language (PRD §6)**. `payoffBands()` is the
  only place zones are derived, and it reads `payoff()` from `engine.js`;
  `bandMass()` is the only place a probability is read off those zones and it
  carries the TAILS — a band that reaches the edge of the sampled range does not
  end there — and it has NO default drift, because a picture drawn against a
  market that goes nowhere beside a number drifted on the season is two screens
  disagreeing about one trade; the
  band thumbnail, the gauge and the unified position component all consume its
  output. Every visual exposes `takeaway()` (one always-visible generated
  sentence) and `explainElement(el)` (on tap). Never compute a zone anywhere
  else. `useNarrow` and the `Figure` tap-to-explain frame live here too.
- `src/App.jsx`, `src/pro.jsx` — UI. Everything is still reachable behind
  "Open the full desk", but it is no longer the front door.
- `src/theme.js` — shared theme, never redeclare a local `T`. **Light is the
  default**; dark lives behind Settings. `T.onAccent` is the text colour on a
  filled accent — never write `#14181d` into a component. Every light accent
  clears 4.5:1 on white and on the page, and `src/theme.test.js` fails the build
  if a tweak breaks that.
- `src/engine.js` — shared math (Black-Scholes, payoff, the exit simulator, the
  seeded terminal Monte Carlo, seasonal tables, and `parseAvJson()` /
  `statsFromMatrix()` — the ONE parse of an Alpha Vantage monthly body, read by
  the client and by `autopilot.mjs`, which cannot import `App.jsx`). Plain JS,
  no React imports.
  **Both the client and the Netlify functions import from here.** Never duplicate
  this math. `terminalMC()`, `seasonalDrift()`, `seedFrom()` and `rng()` live here
  and take their policy from the caller with NO DEFAULTS — this file imports
  nothing and `rules.js` imports it, so it may never read `RULES`.
- `src/chain.js` — **where the option chain comes from**, and **the only place
  that decides what to call the feed**. One internal shape
  (`{ spot, byExp, expirations, updated, source }`, each contract
  `{ bid, ask, mid, bidSize, askSize, iv, oi, vol, delta, theta, occ }`) and two sources:
  **Alpaca first, CBOE as the net**. `fetchChain()` gives the broker a 4-second
  timeout and falls back — a slow broker costs seconds, never a blank screen —
  and after two failures in a row it stops asking for the rest of the session.
  `midOf()` is the only place a mid price is computed, so the two sources cannot
  disagree about the price of the same contract for a reason that is only a
  formula. **`snapStrike()` / `expiryStrikes()` / `resnapLegs()` live here too**:
  a strike is a fact about a BOARD, not about a trade, and two implementations of
  "the nearest strike that exists" would be two answers to one question. There were
  FOUR of `expiryStrikes()` and there is one. **`strikeOptions()` is here too**: which
  options a strike dropdown may offer, including the current strike flagged
  `listed: false` when the board does not carry it, because a `<select>` whose value
  matches no option silently displays the first one. Alpaca snapshots carry no open interest and no volume, so those come
  back `null` (never `0`, which on screen reads as "nobody trades this") and the
  open-interest panel says which feed cannot fill it. **The QUOTE SIZES do come
  from Alpaca** (`latestQuote { bs, as }`) and were being parsed away; they are
  `bidSize` / `askSize` now, `null` when the feed does not send them and `null`
  always on CBOE, which has none. The ticket's market table draws a "?" and a
  sentence rather than a blank, because a missing size is UNKNOWN, never zero.

  **`feedName(chain)` and `sourceNote(chain)` name the feed, and every label on
  screen reads from them.** Never write "CBOE" or "Alpaca" into a component. The
  header once said "PRICE NOW (CBOE)" directly under a badge reading
  "Alpaca (indicative)": two places deciding what to call the same numbers is a
  screen that contradicts itself about where its own data came from.

  `expiryOpenInterest(chain, expKey)` is every known open-interest count on ONE
  expiry — the peer set the liquidity floor judges a leg against. Per expiry and
  not per chain on purpose: a front-month strike and one thirteen months out are
  not neighbours, and pooling them would let the busiest expiry set the bar for
  the quietest.

  **Open interest comes from the TRADING API, not the market-data feed.**
  `fetchOpenInterest()` / `enrichOpenInterest()` read
  `GET /v2/options/contracts` (fields `open_interest`, `open_interest_date` —
  the count arrives as a *string*) through the existing `/api/alpaca` proxy, so
  no new host, no new function, no new key, and `alpaca.mjs` still speaks to
  exactly one host: its `X-OSL-Paper-Endpoint` header means exactly what it
  meant before. Two rules hold it: it is **non-blocking** (`refreshChain` fires
  it after the chain is on screen and patches the numbers in when they land —
  nothing ever waits for it), and it is **honest** (the figure is the previous
  session's close, `openInterestNote()` says so with the date, and when the call
  does not land the OI column disappears rather than printing dashes). Never
  invent or estimate an open-interest number.
- `src/freshness.js` — **how old is the number on screen, and may it be.** One budget per
  source (`BUDGETS`: chain in minutes, bars in hours, open interest daily because it IS the
  previous session's close, seasonality in days because the free quota is 25 calls a DAY),
  `isStale()`, `agePhrase()`, `freshnessNote()` and `staleAmong()` — which is what a screen
  asks on arrival instead of refetching everything. A stale number is acceptable; a stale
  number pretending to be live is not. Measured: the chain read BOIL at 20.19 and
  `/api/liquidity` at 20.22, seventeen seconds apart, and the app printed one PRICE NOW.
  **Spot has ONE home** — `spotOf(chain)` in `chain.js`, with `spotAt()` for its age. Any
  other endpoint returning an underlying price is reporting its own reading for its own
  purpose and is never the price on screen.
- `src/signals.js` — the 4-factor confluence engine (`fuseSignals`) and the
  single source of the region table, the climate norms, the news cause→effect
  rules, the SMA/RSI read and the candidate ranking. Plain JS, no React imports.
  `pro.jsx` imports all of it and keeps only the rendering. Never copy a
  threshold out of here into a component.

  The guided flow's three **drivers** live here too: `DRIVERS`, `DRIVER_PRESETS`,
  `normaliseWeights()` (the three always sum to 100), `presetOf()` and
  `rankByDrivers()`. All three drivers are normalised the same way — best in the
  pool scores 1, worst 0 — so a slider set to 60 actually beats one set to 25.
  Mixing an absolute measure with relative ones makes the numbers on screen
  decoration. `verdictNarrative()` is here as well: what the app actually looked
  at, in English, with the real counts.
- `netlify/functions/*.mjs` — serverless endpoints, routed in `netlify.toml`.
  `chainAlpaca.mjs` reads option snapshots from **data.alpaca.markets** and is a
  SEPARATE function from `alpaca.mjs` on purpose: `alpaca.mjs` talks to exactly
  one host, paper-api.alpaca.markets, and that is what makes its
  `X-OSL-Paper-Endpoint` header a verification rather than a claim. Market data
  never goes through it. The feed is indicative, not OPRA, and the source string
  says so on screen
  `liquidity.mjs` is the **measurement**, at `/api/liquidity`: it reads
  `/v2/options/contracts` from the trading API and the underlying's last trade
  from the market-data API, and returns AGGREGATE STATISTICS ONLY — per market
  and per expiry, how many strikes, how many report open interest, and its
  distribution. No credentials, no account data, no contract-level row. It is
  GET-only, places no order, touches no account endpoint and returns no
  `X-OSL-Paper-Endpoint` header, so it cannot weaken the verification that
  `alpaca.mjs`'s single host provides. It exists because the two liquidity-floor
  numbers cannot be settled from a sandbox with no broker access, and it is
  gated by `gate.js` like every other path.
- `public/sw.js` — **the service worker, and the shell is ALL it may remember.** Hand-written,
  no plugin. `routeOf()` **denies by default**: a request is network-only unless it is GET,
  same-origin, not under `/api/` or `/.netlify/`, and either a navigation or a file with a
  shell extension. So a new endpoint is network-only without anybody coming back here. Never
  cache a price, a position or an order — offline those fetches FAIL, and the app already says
  "prices not loaded" and prints a dash. Navigations are network-FIRST (a cached `index.html`
  names a hashed bundle, so a stale shell pins a stale app); the hashed bundle is **precached
  by name** because the visit that installs a worker is never one it controls. The cache name
  carries the build, stamped by `stampServiceWorker` in `vite.config.js` — a browser only
  reinstalls a worker whose script changed, so a constant version never updates.
  `OfflineBanner` in `App.jsx` says **"Offline — no live data"** on every screen.
- `public/manifest.webmanifest` + `scripts/make-icons.mjs` — **installable, and the icons are
  generated from `src/theme.js`** with nothing but node's `zlib`, so a tile cannot drift from
  the palette and no image library enters the tree. Re-run the script after any palette change.
  The manifest's two colours are a COPY of theme tokens (static JSON cannot import), held by
  `src/pwa.test.js` the way `basket.js` is held by `liquidity.test.js`. **The manifest and its
  icons are the only things excluded from the gate**, because the browser fetches a manifest
  WITHOUT credentials and a 401 there kills the install offer silently. Nothing else leaves it.
- `netlify/edge-functions/gate.js` — password gate, with demo-token bypass. The DECISION it
  makes lives in `netlify/edge-functions/lib/access.js`, so `ai.js` can ask the same question
  without a second copy of a password comparison.
- `netlify/edge-functions/ai.js` — **the Anthropic proxy, and it is on the EDGE on purpose.**
  It was `netlify/functions/ai.mjs`, an ordinary synchronous function, and those are killed at
  roughly TEN SECONDS. A 1200-token analysis written for a non-expert takes longer than that
  every single time, so the copilot panel and the weekly report were **structurally** cut off
  rather than intermittently unlucky — no amount of streaming inside a ten-second box was
  going to fix it. The redirect path `/api/ai` is unchanged and nothing else moved.
  **Both edge functions are declared in `netlify.toml`, gate first, and neither uses in-source
  `config`.** netlify.toml runs them in written order; in-source configuration promises nothing
  about the order BETWEEN files, and if `ai.js` ever ran first it would be an unauthenticated
  Anthropic proxy on the open internet. `ai.js` also checks access itself, so the ordering
  cannot matter — belt and braces, because this is the one mistake in this repository that
  would matter to somebody other than its owner.

## Navigation — ONE NUMBERED PATH, macro to micro

The desk's first place is **three numbered steps and one is on screen at a time**
(`src/path.js`, `src/steps.jsx`). **Positions** and **Journal** are the other two
places; Settings sits behind the gear.

1. **RADAR** — every market **in the basket** (never SPY: it is in the table so the
   desk can price a hedge), read by the four factors and filtered by the quality
   floors. A market that produced nothing says which floor emptied it, or that
   nobody has searched it yet. The multi-market search lives here.
2. **SHORTLIST** — the candidates that survived on the market carried in from
   step 1: the guided run's roads, the structures priced from the live chain, and
   the wide search's hits. Up to **three** compared side by side, any of them kept.
3. **BUILD** — one trade taken apart: chain, greeks, charts, and the confirm step
   at the bottom. Unchanged by this work.

**Moving forward carries the selection; moving back does not lose it.** The
selection lives in `App.jsx`, above all three screens, so a step is only which part
of it is being shown, and the nav writes what each step carries under its number
(`stepCarry`). Radar and Shortlist used to be evidence panels that APPENDED to the
Build page, which is why the desk was one page that only ever got longer, with
"Why this trade", "Agreement", "How to read it", "Three probabilities", the totals
and the legend all on screen at once. None of that copy was cut; each piece now
appears at the step that needs it.

**The guided door feeds the same path.** "Find opportunities" lands on step 1 with
what it examined, and its roads are on step 2 beside every other candidate — same
three steps whichever door you came through. The "nothing today" refusal is
unchanged and still its own screen.

**Evidence opens OVER the step, never under it** (`EvidenceOverlay`): Why this
market, Market levels, History and the Copilot, at every step, as a sheet fixed to
the viewport that scrolls inside itself and closes back onto the step. That also
settles the old fault by construction — a panel written 2,000px down a page that
does not scroll looked, on a phone, like a tap that did nothing, and a sheet fixed
to the viewport cannot land below the fold. Weather and News are still the
drill-down inside the "Why this trade" panel, not places of their own.

**Build was the Builder, then the Bench**; the tab id is `"build"` and "Bench"
survives nowhere. **Shortlist keeps its name**: it is the list of candidate
structures, which is what the word means.

A trade reaches Build through **one function**, `openOnBuild()` in `App.jsx`, built
on `buildHandOff()` in `src/handoff.js`. It closes the evidence sheet, loads the
target ticker's chain if it is missing, **moves the path to step 3** and scrolls
Build into view. A hand-off written inline at the button instead silently does
nothing when the user is already there.

**One shape for a candidate.** A guided road, a Shortlist row and a wide-search hit
are three different objects; `candidateOf()` in `path.js` normalises them, so
comparing and keeping have one implementation instead of three. Ticking is capped
at three and **the fourth tap is refused in words**, never swallowed. Kept
candidates are `store.saved` items — the array the Build screen's Save button
already writes to, with the same hydration check and the same sync. Never build a
second store for them.

## Visual contract

Every visual is generated from `payoff(legs, S)`, through `payoffBands()` in
`src/visuals.jsx` — never compute zones separately or two screens will disagree
about the same trade. `payoffBands().maxProfit` is `null` when the payoff has no
ceiling; `sampledTop` is what the drawing code scales to, and it is never printed.
`bandsAbove()` cuts the same samples at any level and is the only way to split a
band — the scratch cut is a caller of it, not a second sampler.

The three components:
- **Band thumbnail** — the **underlying's own price line** over green/red bands
  from the sign of the payoff. No numbers, no labels, readable at 80px. An iron
  condor produces three bands with no special-casing. Used in **every** list where
  a candidate appears — the Radar market rows, the wide-search hits, the Shortlist
  rows, the kept rows and the compare rows — and the **gauge sits beside it** on
  all of them, both cut from ONE `payoffBands()` result so they cannot disagree
  about the same trade. A list row gets those two and nothing else: the candles
  belong on Build, where there is room to read them. `PriceChart` in `pro.jsx` is
  the candle chart, and `App.jsx` does not import it at all — it was imported and
  never rendered, and a dead import of a chart module is how "the candidates carry
  a shrunken candlestick chart" survives as a belief about the code.
  The price line is reduced to what the width can carry (`simplifyCloses`, about one
  point per 7px, first and last close kept exactly), because 120 daily closes across
  230px is a scribble and at 80px a smudge.
  Price is the **vertical** axis, as it is in the unified component, so the bands
  are horizontal stripes and the price line runs across them, ending at today's
  price on the right-hand edge. Pass `bars`; with none it falls back to a flat
  dashed line at spot. Without that line it is a row of coloured bars that never
  says where the market is in relation to the trade.
- **Open-interest strip** (`OpenInterestStrip`) — **the liquidity floor, drawn instead
  of described.** Every strike on ONE expiry, lined up emptiest to busiest, with a
  dashed line where the setting cuts: red to the left is what it removes, green to
  the right is what survives, and moving the filter moves the line.
  **Three colours, not two, and a floor under the empty ones.** A strike with NOTHING
  open is drawn in muted grey at a 2px minimum (`OI_EMPTY_BAR`): `log1p(0)` is 0, so on
  BOIL's 2026-10-09 board — 60 of its 108 strikes carry no open contracts — most of the
  strip drew at zero height and read as "not drawn". Grey is distinct from both the
  removed-red and the surviving-green on purpose: "nobody is here" is a different fact
  from "this setting removed it".
  **At OFF the strip carries a GHOST line** (`oiGhostCut()`) where Recommended would cut,
  dashed, dimmed and labelled with the count — "off" only means something against what is
  being switched off. It filters nothing and the takeaway still says nothing is removed. It sits directly
  under the four level buttons so the setting and its effect are one glance apart.
  **The one visual in `visuals.jsx` not cut from `payoffBands()`, and not an exception
  to that rule** — the rule is that the ZONES OF A TRADE come from one place, and this
  chart has no trade in it. Do not confuse it with `terminalDist()`: that is where the
  PRICE may end up (a forecast from volatility and time); this is a headcount of who is
  already there. **The height is log-compressed and the picture says so**: open interest
  runs 1 to 66,130 on a single expiry, so drawn linearly you would see two bars and a
  grey floor. Because that makes height unreadable as a quantity, the real smallest and
  largest are printed at the ends and the takeaway carries the numbers.
- **Gauge** — the payoff projected into polar coordinates as a semicircular
  arc, needle at spot. Colours come from the sign of the payoff, so left is NOT
  always red: a bear spread is green on the left. Primary visual on position
  detail.
- **Compare** — `ComparePayoffs`: up to three payoffs overlaid on ONE axis, with one
  shared distribution underneath and every breakeven marked. The axis is the move
  from today's price, not the price, because two roads can be in two markets. The
  distribution is drawn only when the candidates share a market and a horizon, and
  when they do not the picture SAYS why rather than averaging two markets.
  `terminalDist()` is that curve, and `UnifiedPosition` reads the same function.
- **Unified position component** — price history, dispersion cone, terminal
  distribution as a rotated histogram and the payoff rotated 90°, all on ONE
  shared vertical price axis, with a horizontal dashed line from today's spot
  across to the payoff value. Cone and distribution switch on above
  `UNIFIED_DETAIL_WIDTH` and off below it. Coloured bands stop where the cone
  ends.

Every visual exposes `takeaway()` (one always-visible sentence, generated from
the numbers) and `explainElement(element)` (on tap). If the takeaway needs more
than one sentence, change the chart, not the copy. Mobile has no hover: tap to
open, tap outside to close, explanation below the chart on narrow screens.

## Order paths

There are **six** ways an order can reach Alpaca, and every one routes through
`evaluateTrade`:

1. `App.jsx` → `sendToAlpaca()` — the manual multileg ticket
2. `pro.jsx` → `OrderTicket.send()` — the pro ticket (limit/market, TIF, qty)
3. `pro.jsx` → `AlpacaDesk.closeGroup()` — close a whole strategy
4. `pro.jsx` → `GuardianPanel.placeExit()` — the exit ladder
5. `autopilot.mjs` — gates each proposal before it becomes an approve link
6. `approve.mjs` — re-runs the gate at execution time, up to 24h later

**Five of them build the body with `orderBody()` in `src/order.js`, and the sixth
sends the body the fifth built.** Never write `ratio_qty` in a component again,
and **never name a contract the chain did not supply**: `buildOcc()` is not a
fallback, it is a formatter, and the gate refuses an order whose leg the chain
never listed (`UNLISTED_CONTRACT`).

- **THE SIZE GOES IN `qty`, THE SHAPE GOES IN THE RATIOS.** Alpaca refused a sized
  spread live on 2026-09-04 — 422 / 42210000, *"leg ratio quantities should be
  relatively prime: GCD[5 5] = 5"* — because every path wrote the leg's own
  quantity into `ratio_qty`. A five-lot vertical is not "5 and 5"; it is "1 and 1,
  five times". `reduceRatios()` divides the legs by their greatest common divisor,
  `orderQty()` puts the factor into the order's quantity and `unitLimit()` takes it
  out of the price, so the money at stake is unchanged and only the spelling moves.
  A genuine ratio has a GCD of 1 and survives untouched: a 1x2x1 butterfly is still
  1, 2, 1. Every structure the Shortlist sized above x1 — and it routinely suggests
  x5, x6, x7 — was unsendable until this, in every direction: the same refusal
  applied to closing what had been opened.
- **ACCEPTED IS NOT OPENED.** `orderOutcome(order)` reads the reply, and filled,
  partly filled, working and killed-by-the-broker are four different sentences.
  Only a complete fill carries `startsExitPlan`, because an exit plan measured from
  a fill that never happened is a plan about nothing. The live order came back
  `status: "accepted"`, `filled_qty: 0` — submitted outside market hours, queued —
  and the app announced *"Position opened. Close at 50% of max gain, or at 21 days
  to expiration."* over it. A working order NAMES WHERE IT IS WAITING (its limit
  and how long it stands): a limit at the mid of a wide market can be accepted and
  never fill, and that is a third outcome, not a failure. The position record
  carries `alpacaStatus` / `alpacaFilled` and the Positions row says so.
- **AN ORDER THAT FAILS MUST FAIL WHERE THE BUTTON IS.** Every outcome used to go
  to `setMsg`, which renders at the TOP of a page whose send button is at the
  BOTTOM: the owner confirmed twice, Alpaca rejected the order, and nothing
  appeared. The order did not vanish — the reason did. `OrderOutcome` renders all
  of them inside the ticket, beside the button, and it stays until it is dismissed.
  `setMsg` is still called; it just cannot be the only place the answer lives.
- **THE STATUS AND THE BODY ARE THE DIAGNOSIS.** `alpacaReq` carries `status` and
  the WHOLE body on the error, and `alpacaErrorText()` writes the sentence from
  them. The old 200-character slice cut *"GCD[5 5] = 5"* out of the only sentence
  the user ever saw. Alpaca's raw reply is shown under it, verbatim.
- **ONE TAP MUST NEVER LOOK LIKE NOTHING.** The first tap arms the confirmation and
  `OrderPending` writes out what the second tap sends — the contracts, the number
  of combinations, the unit price, how long it stands — with a cancel beside it.

In **demo mode** every one of the six is disabled, and the check sits next to the
send as well as on the button, so a path called some other way still cannot reach
Alpaca. `saveState()` also stops writing to `/api/state`: that blob is a single
shared document and a visitor must not overwrite the owner's book.

Positions are opened through one function, `commitPosition()` in `App.jsx`, and
there is now ONE control that calls it: the confirm step at the bottom of Build.
The small "Open on paper" button that used to sit in the builder's header opened
a position without the checks or the exit plan ever being read, and a road that
went straight to a confirm page skipped the trade itself. Both are gone.

- **An evidence panel owns no state.** All five are mounted only while open, so
  every other chip unmounts them. The Copilot's conversation lived inside its
  panel and was destroyed on the next tap — an answer that landed while it was
  shut never reached the screen. It belongs to `App.jsx` now and is passed in;
  the chip shows when the copilot is thinking or holding an answer. Anything
  long-running inside a panel has to live above it.
- **A wide chart scrolls inside ITS OWN box, never the page.** `UnifiedView` has
  a 560px floor below which the candles, the cone and the payoff are unreadable.
  On a 390px phone that floor made the whole page scroll sideways. The svg sits
  in an `overflowX: auto` wrapper; the page must never move.
- **A ResizeObserver must observe a node that exists ON MOUNT.** `UnifiedView`
  returned its loading and error states BEFORE the wrapper carrying the ref, so
  the ref was null when the effect ran, nothing was ever observed, and the width
  kept its initial value for the life of the component — invisible while that
  value happened to suit a desktop, a chart frozen at 560px in a 1382px column
  the moment it changed. Every state renders through the same wrapper now.
- **The payoff sits BESIDE the price chart, on the shared price axis**, in the
  right-hand strip of `UnifiedView`, cut from the same `curve` as the green
  bands — so the strip and the bands are the same fact read two ways. It appears
  above `PAY_MIN_W` and folds away below it, where the full-width payoff chart
  underneath carries it instead.
- **THE COPILOT CALL MUST STREAM.** `ai.mjs` passes Anthropic's SSE straight
  through when the body carries `stream: true`, and `askAI` always asks for it.
  Buffering the whole answer first left the connection silent for the tens of
  seconds an analysis takes to write, and a gateway kills a silent connection:
  the browser got an HTML page — "Too much time has passed without sending any
  data for document" — where the analysis should have been. Bytes must move from
  the first token. `sseDeltas()` keeps the partial tail between reads, because
  TCP does not respect frame boundaries and half a delta dropped is text
  silently missing. `gatewayPageMessage()` turns an HTML body into a sentence
  naming the timeout instead of dumping markup on screen. Both are pure and
  tested; the autopilot calls Anthropic directly and has a background budget, so
  it does not need this.
- **FLUSH THE LAST FRAME BEFORE DECIDING ANYTHING.** `sseDeltas()` holds the trailing frame
  back on every read because TCP does not respect frame boundaries — but once the reader says
  `done` there is no next read to hand it to, and Anthropic's closing `message_stop` does not
  always arrive with a blank line after it. Without the final `sseDeltas(buf, { final: true })`
  the last frame of EVERY stream was discarded as partial, so a COMPLETE answer was reported
  as cut off every single time.
- **RUNNING OUT OF ROOM IS NOT A DROPPED CONNECTION.** `message_delta` carries `stop_reason`
  and was being ignored, so an answer cut at the token budget arrived WITH `message_stop`, was
  judged complete, and was filed in the Journal as finished. `sseDeltas()` reports
  `stopReason`; `askAI` checks `max_tokens` FIRST (such a stream does announce its end) and
  throws with `err.reason = "max_tokens"`, which the panel labels **COPILOT · RAN OUT OF ROOM**
  rather than **CUT OFF**. Asking again is the right advice for one of them and useless for
  the other.
- **A CUT-OFF ANSWER IS NEVER PRESENTED AS A FINISHED ONE.** A stream that just
  stops is indistinguishable from one that finished unless the end is announced,
  so `sseDeltas()` reports `stopped` (Anthropic's `message_stop`) and `askAI`
  throws when the stream ends without it, carrying the partial text on
  `err.partial`. The panel keeps those words — they are worth reading — under a
  "COPILOT · CUT OFF" label that says the connection was cut rather than the
  copilot finishing, and the analysis is NOT filed in the Journal. Half an
  analysis recorded as a whole one is the app lying about its own work.
- **The copilot answers in MARKDOWN.** Render it with `Markdown` in `pro.jsx` —
  never `white-space: pre-wrap`, which put `## 1. STRUCTURE`, `**Ticker:**` and
  a wall of `|---|` pipes on screen. The prompt asks for prose for a non-expert
  and forbids restating the legs, greeks and max loss the screen already shows;
  if tables start coming back, the prompt drifted, not the renderer.
- **Anything the app does by itself has to say that it did.** The Journal's
  report writes itself when one is due and the tab is opened. Finding a document
  where there was nothing, with no explanation, is indistinguishable from a bug.
- **The Journal is the record of what the app did, and that includes the
  copilot.** An analysis run from the Copilot panel is filed in `store.copilotLog`
  (local only, capped, never in the `/api/state` blob), listed in the Journal
  with the question that produced it, and quoted in the report. The report used
  to cite "the copilot's read" from its own model call while the panel's runs
  left no trace, so the two documents described the same day differently.

**A CLOSING ORDER IS A LIMIT, AND ITS PRICE IS WORKED OUT AT THE TAP.** `autopilot.mjs` built
the close with `type: "market"` and stored the finished body; tapping the link sent it, up to 24
hours later. BOIL quoted bid/ask spreads of **66%, 91%, 145% and 166% of the mid** near the
money — the app refuses to PRICE a candidate off a market that wide (`spreadFloor`) and then
closed one at the touch. The approval now carries the **order intent** and `approve.mjs` fetches
a fresh chain, reads each leg's live two-sided quote and calls **`orderBody()` unchanged with
`type: "limit"`**. The price starts at the mid and concedes `CLOSE_LIMIT_SLIPPAGE` (0.25,
**CHOSEN not measured**, and on the NOT VERIFIED list) of the spread, always SUBTRACTED from the
signed net so there is no branch in the arithmetic — and **never flipped round**: a +0.02
structure conceded by 0.10 would price at −0.08, which the broker reads as "sell it for eight
cents" because the body carries the magnitude. A leg with no live bid stops the send and the
page says which leg. A working order says so, and the next run proposes a fresh price rather
than retrying in silence.

**AN ESTIMATED PRICE CAN NEVER BECOME AN ORDER.** `markFromChain()` returns `net: null` unless
every leg is quoted on both sides and the caller falls back to `netBS()`; the brief said
"CBOE delayed" whenever the chain had merely LOADED. `markProvenance()` reads the NET: the source
is `"model"` whenever `netBS` produced it, the brief says the figures are estimates above them,
and the take-profit and exit-DTE triggers produce a warning instead of an approve link.

**THE ORDER STATUS IS RE-READ AFTER THE FACT.** `recheckOrders()` in `App.jsx` asks Alpaca about
any position whose order had not filled — on arrival and with the 60-second monitor — and
appends a timeline entry only when the answer CHANGED. Never on a filled order (finished), never
in demo (no broker call), and silent on failure: the warning simply stays until the broker can
be reached.

The gate answers "may this order leave"; the quality floors answer "should this
have been offered at all", and they live where candidates are generated, not in
the gate — a trade the user builds by hand is his to make. "Is there a price at
all" is a third question, and it is asked in BOTH places: the floors cannot judge
a structure whose price is a placeholder, and the gate cannot let a maximum loss
it could not compute out of the door. **"Does this contract exist" is a FOURTH
question and it is the gate's alone** (`UNLISTED_CONTRACT`): it is not a judgement
about a trade, because a contract nobody has issued is not a trade.

Adding a seventh means adding a gate call. Paper mode is *verified*, not
assumed: `alpaca.mjs` returns an `X-OSL-Paper-Endpoint` header and the gate
rejects anything it cannot confirm.

## One rounding, one function — and a sign where the sign is the point

- **`chancePct()` / `chanceText()` / `chanceInTen()` in `rules.js` are the only way a
  probability is printed.** The compare card said "CHANCE 75%" beside "8 times in 10" and one
  spread read 44%, 45% and "5 times in 10" across three screens: some of that was three
  roundings of one number, the rest was one number spoken two ways with nothing tying them
  together. The phrase is now DERIVED from the rounded percentage, so the two cannot disagree.
  `inTenPhrase()` in `visuals.jsx` delegates to it. A missing probability is a dash, never a
  confident 0% — `Number(null)` is 0 and 0 is finite.
- **`signedMoney()` for theta and vega, and for nothing else yet.** `money()` prints a minus
  for a loss and nothing for a gain, which is right for a price and wrong for a RATE OF
  CHANGE: theta printed "$3" on a long debit spread where the holder LOSES it every day, and
  read as a gain it inverts the one thing the number is there to say. It also refuses to round
  a real vega away to "$0" — that zero was a claim that volatility does not move the trade, and
  it was false; under a cent it prints one significant figure instead. An exact zero is still
  "$0", because that one IS the number.
- **CONTRACTS ARE NOT STRIKES.** `expiryOpenInterest()` walks the calls AND the puts, so its
  peer set is CONTRACTS: BOIL 2026-10-09 has 26 strikes and 52 contracts, and "the 45 emptiest
  of the 52 strikes" was counting one thing and naming another. Every count read off that peer
  set — the strip, its takeaway, its explanations, the floor's own refusal sentence, the
  threshold line — says contracts.

## Known traps

- `logEvent` must never be called inside JSX render — use `useEffect`
- **No emoji and no rare glyphs in user-facing strings.** The direction buttons
  used U+2B61/U+2B63 (`⭡ ⭣`), a block Android's system fonts do not cover: they
  rendered as empty boxes on the phone this app gets demoed on. Stay inside what
  every font has — `↑ ↓ → ✓ ✗ ⚠ ▲ ▼ ●` — and write words where a pictogram was
  doing the talking. This app is demoed on a phone.
- JSX **text** does not interpolate: `${x}` and `\u2019` written as element
  children are printed on screen, literally. Wrap the line in `{`…`}`.
- News impact directions are numbers (`1 / 0 / -1`), never arrow strings. Render
  them with `ARROW[dir]` from `signals.js`
- Use the safe `getU(ticker)` accessor, never `UNDERLYINGS[ticker]` directly
- Single-leg orders go to Alpaca as simple orders, not mleg (422 otherwise)
- Cancel conflicting open orders before sending an mleg close (wash-trade check)
- State hydration sanitises corrupt positions using the `v: 2` version flag
- `settings.notifyWhenReady` must be included in the `/api/state` sync payload:
  the autopilot is the only thing running while the app is closed, so a flag
  that never reaches the server makes "Notify me" a promise nobody keeps
- **`probProfit` IS GONE FROM BOTH FILES, AND THE NOTE THAT SAID OTHERWISE WAS OUT
  OF DATE.** This file used to say `pro.jsx`'s own `probProfit(curve, S, sigma,
  dte)` was a deliberate duplication that must not be merged with `engine.js`'s,
  because the two had different signatures and this one worked on an already-built
  payoff `curve` rather than on `legs`. That was true about their SHAPE and it was
  never a defence of their ANSWER — both integrated the expiry payoff against a
  lognormal at a RISK-NEUTRAL drift of 0.045, while the Build screen's Monte Carlo
  drifted on the app's seasonal thesis and `chanceInProfit()` drifted on nothing.
  Four arithmetics, one question, four numbers on four screens. **Decided: the
  Monte Carlo is the single truth and both closed forms are deleted** — a faster
  approximation kept beside the truth is a second number waiting for a screen to
  reach for it, which is how there came to be four. `riskGate.test.js` fails the
  build if `probProfit` reappears anywhere
- **`exitPathSim(...)` in `pro.jsx` KEEPS its own body and its own signature**, and
  that half of the old note still stands: it answers a different question — what
  happens along the path under the exit rule, not where the price finishes — and
  the UI depends on the extra fields it returns (`pTimeNeg`, `pWin`, `horizon`).
  It reads `RULES.exitDTE` for its numbers and takes its volatility as a
  `sigmaProvenance()` result exactly as `exitSim` does; only the body is its own

## The basket

`BASKET` in `App.jsx` is derived from the `commodity: true` flag on `UNDERLYINGS`,
never typed out a second time — SPY is in the table so the desk can price a hedge,
it is not something the guided flow goes looking for.

`src/basket.js` carries the same five as a plain array, and ONLY because a Netlify
function cannot import `App.jsx` (React, recharts, lightweight-charts). The
derivation in `App.jsx` stays the source; `src/liquidity.test.js` reads that table
and **fails the build** if the two lists drift. A copy nothing checks is the bug;
a copy nobody can quietly break is a copy the code can live with.

`runWizard` ranks the **whole basket on one scale**: every readable market
contributes candidates and road 2 is free to come from a different market than
road 1. Building both roads out of the single best-scoring ticker gives a user
who picked five commodities two structures on one of them, which teaches less
than comparing two markets — they share a fate.

## Saying "nothing today"

The refusal is a screen, not a toast. `runWizard` in `App.jsx` decides, in order:
data missing → signals not aligned → options expensive versus their own history →
every candidate unpriceable → every candidate unable to lose → every candidate below
the quality floors → nothing fits the budget → only one road survives. A board where nothing could be PRICED is
not a board the floors emptied, and neither of them is a budget problem. A missing-data answer must
never be dressed up as a market verdict — they are different sentences on
screen, and `wizard.test.jsx` holds that line. "Only one candidate" is also a
refusal: one answer is advice, two answers with their price is teaching.

## Working style

Plan first, then implement surgically. State the plan before writing code.
