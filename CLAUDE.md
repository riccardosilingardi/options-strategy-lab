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

Derived, not hardcoded. See PRD §3. The user supplies trading capital and how
many positions they hold at once; the app derives the per-trade limit and shows
the best-practice cap as an explained suggestion. Overrides require a typed
reason and are stored with the position.

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
  (`sizing()`), plus the generated rule strings (`ruleBadge()`,
  `perTradeCapLabel()`, `copilotRulesBlock()`, `RULE_PILLS`, `NOTHING_TODAY`).
  Never write a rule number or a rule sentence anywhere else — not in a
  component, not in a prompt, not in a serverless function. The two thresholds
  that make the app refuse (`lowConfidence`, `expensiveIVRank`) live here too,
  so the "nothing today" screen can only ever explain a rule the code applies.
- `src/riskGate.js` — `evaluateTrade({ proposal, portfolio, capital, signals })`,
  a pure function returning `{ pass, violations, warnings }`. Every order path
  calls it, and a screen with no gate wired in fails closed
  (`runGate` in `pro.jsx`).
- `src/wizard.jsx` — **the app shell (PRD §5)**. The wizard is the entry point,
  not a tab: capital onboarding on a first run, then screen 1 (greeting, one line
  of status, **two** doors — and "what needs attention today" once positions
  exist), screen 2 (`FindOpportunities`: basket, budget and time, three driver
  sliders, then **"Decide for me"** as the last button), screen 3 (the verdict:
  the copilot narrative, the answers read back with a *change* link, then **two
  roads, never one** — each with a band thumbnail, a gauge, the "Why this trade"
  evidence panel and one generated sentence naming what it gives up), screen 4
  (confirm: the unified component, the gate's checks in plain English, the exit
  plan stated as already decided) and screen 5 ("nothing today"). On screen 4 the
  gate runs **after** the tap. `App.jsx` owns the `view` (`wizard` | `desk`).

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

- `src/why.jsx` — **the "Why this trade" panel**, and the only copy of it. The
  agreement badge, the four factors as direction/strength bars, and the
  drill-down behind them: weather opens the regions and their anomalies, news
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
- `netlify/edge-functions/gate.js` — password gate, with demo-token bypass

## Navigation — tabs are not destinations, they are evidence

The desk has **three places only**: **Build** (one trade, taken apart),
**Positions**, **Journal**. Settings sits behind the gear, not in the row.

What used to be tabs is now evidence for the trade on **Build**, opening
underneath it: **Radar** (was Scan), **Shortlist** (was Optimize), Market
levels, History, Copilot. **Build** was the Builder, then the Bench — the tab
id is `"build"`, and "Bench" survives nowhere in the code or the copy, because
a beginner cannot guess what a bench is for. **Shortlist keeps its name**: it
is the list of candidate structures, which is what the word means. Weather and
News are not tabs at all any more: they are the drill-down behind the
"Why this trade" panel — tapping the weather bar reveals the regions and their
anomalies, tapping the news bar reveals the headlines with their tags.

**An evidence panel must be written next to the strip that opens it.** Market
levels, History and Copilot were once written after the whole builder block, so
opening one rendered it ~2,000px down a page that does not scroll: on a phone
the tap looked like it did nothing, and both were reported as broken features.
All five panels now open directly under the button that opened them. A panel
that needs prices and has none must SAY so — rendering nothing at all is the
same failure with a different cause.

A trade reaches Build through **one function**, `openOnBuild()` in `App.jsx`,
built on `buildHandOff()` in `src/handoff.js`. It closes the open evidence
panel, loads the target ticker's chain if it is missing and scrolls Build into
view. A hand-off written inline at the button instead silently does nothing
when the user is already on the Build tab: the evidence panel stays expanded
above and the trade lands below the fold.

## Visual contract

Every visual is generated from `payoff(legs, S)`, through `payoffBands()` in
`src/visuals.jsx` — never compute zones separately or two screens will disagree
about the same trade.

The three components:
- **Band thumbnail** — the **underlying's own price line** over green/red bands
  from the sign of the payoff. No numbers, no labels, readable at 80px. An iron
  condor produces three bands with no special-casing. Used in every list.
  Price is the **vertical** axis, as it is in the unified component, so the bands
  are horizontal stripes and the price line runs across them, ending at today's
  price on the right-hand edge. Pass `bars`; with none it falls back to a flat
  dashed line at spot. Without that line it is a row of coloured bars that never
  says where the market is in relation to the trade.
- **Gauge** — the payoff projected into polar coordinates as a semicircular
  arc, needle at spot. Colours come from the sign of the payoff, so left is NOT
  always red: a bear spread is green on the left. Primary visual on position
  detail.
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

Positions are opened through one function, `commitPosition()` in `App.jsx`:
both Build's "open on paper" and the wizard's screen 4 land there, so a
position carries the same gate record, thesis and timeline whichever way it was
opened.

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

`runWizard` ranks the **whole basket on one scale**: every readable market
contributes candidates and road 2 is free to come from a different market than
road 1. Building both roads out of the single best-scoring ticker gives a user
who picked five commodities two structures on one of them, which teaches less
than comparing two markets — they share a fate.

## Saying "nothing today"

The refusal is a screen, not a toast. `runWizard` in `App.jsx` decides, in order:
data missing → signals not aligned → options expensive versus their own history →
nothing fits the budget → only one road survives. A missing-data answer must
never be dressed up as a market verdict — they are different sentences on
screen, and `wizard.test.jsx` holds that line. "Only one candidate" is also a
refusal: one answer is advice, two answers with their price is teaching.

## Working style

Plan first, then implement surgically. State the plan before writing code.
