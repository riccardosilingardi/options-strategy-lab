# Options Strategy Lab — project memory

Read `PRD.md` before any substantial change. This file is the short version.

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
4. No order reaches Alpaca without passing `src/riskGate.js`.
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

**BOTH LIQUIDITY NUMBERS ARE PROVISIONAL AND MARKED AS SUCH IN `rules.js`.**
Nobody has counted the open interest actually present on the five markets. The
measurement runs at `/api/liquidity` (`netlify/functions/liquidity.mjs`), behind
the site's own password, where the broker keys already are: it returns aggregate
statistics only — per market and per expiry, how many strikes, how many report
open interest at all, and the distribution of it. When that JSON exists, set the
two constants from it and delete the provisional block. Until then every screen
that prints the floor says it is provisional.

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

Adding a third generation site means calling `qualityFloor()` there too.

**The floor is held up against the chains it is applied to.** `oiProfile()` in `chain.js`
and `OpenInterestReadout` at the bottom of the Shortlist print what open interest the
loaded chains actually carry — near the money and whole chain — beside the floor, plus the
value the RELATIVE half asks for on that distribution, so the two halves can be compared on
one screen. It reports and never estimates: unknown stays unknown, and a feed with no open
interest is named rather than drawn as zeros. It exists so the floor can be settled from a
live screen instead of re-argued from one walkthrough; `/api/liquidity` is the same
question asked of all five markets at once, where the keys are.

## Exit rules

Chosen once per position at construction time, then frozen. Never renegotiated
while the position is open.

- Take profit at 50% of max profit — keep
- Exit at 21 DTE — changed from 7, see PRD §4
- Stop at 50% of max loss — warning only, pending backtest
- DTE = days to expiration

## Architecture

- `src/rules.js` — **the single source of truth for the trading rules**. Take
  profit, stop loss, exit DTE, the entry-DTE floor and the PRD §3 sizing model
  (`sizing()`), the two quality floors and `qualityFloor()` that applies them,
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
- `src/riskGate.js` — `evaluateTrade({ proposal, portfolio, capital, signals })`,
  a pure function returning `{ pass, violations, warnings }`. Every order path
  calls it, and a screen with no gate wired in fails closed
  (`runGate` in `pro.jsx`).
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
  `CompareTray`, `CandidateActions`. The navigation, and nothing about a trade.
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
  only place zones are derived, and it reads `payoff()` from `engine.js`; the
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
- `src/engine.js` — shared math (Black-Scholes, payoff, probabilities,
  seasonal tables). Plain JS, no React imports. **Both the client and the
  Netlify functions import from here.** Never duplicate this math.
- `src/chain.js` — **where the option chain comes from**, and **the only place
  that decides what to call the feed**. One internal shape
  (`{ spot, byExp, expirations, updated, source }`, each contract
  `{ bid, ask, mid, iv, oi, vol, delta, theta, occ }`) and two sources:
  **Alpaca first, CBOE as the net**. `fetchChain()` gives the broker a 4-second
  timeout and falls back — a slow broker costs seconds, never a blank screen —
  and after two failures in a row it stops asking for the rest of the session.
  `midOf()` is the only place a mid price is computed, so the two sources cannot
  disagree about the price of the same contract for a reason that is only a
  formula. Alpaca snapshots carry no open interest and no volume, so those come
  back `null` (never `0`, which on screen reads as "nobody trades this") and the
  open-interest panel says which feed cannot fill it.

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
- `netlify/edge-functions/gate.js` — password gate, with demo-token bypass

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
about the same trade.

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

The gate answers "may this order leave"; the quality floors answer "should this
have been offered at all", and they live where candidates are generated, not in
the gate — a trade the user builds by hand is his to make.

Adding a seventh means adding a gate call. Paper mode is *verified*, not
assumed: `alpaca.mjs` returns an `X-OSL-Paper-Endpoint` header and the gate
rejects anything it cannot confirm.

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
- `pro.jsx` keeps its own `probProfit(curve, S, sigma, dte)` and `exitPathSim(...)`
  with signatures different from the ones in `engine.js`. This is intentional and
  must not be merged: the UI depends on the extra fields these versions return
  (`pTimeNeg`, `pWin`, `horizon`), and `probProfit` there works on an already
  built payoff `curve` rather than on `legs`

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
every candidate below the quality floors → nothing fits the budget → only one road
survives. A missing-data answer must
never be dressed up as a market verdict — they are different sentences on
screen, and `wizard.test.jsx` holds that line. "Only one candidate" is also a
refusal: one answer is advice, two answers with their price is teaching.

## Working style

Plan first, then implement surgically. State the plan before writing code.
