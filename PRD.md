# Options Strategy Lab — Product Requirements

What the product is, the rules it enforces, when v1 is done, and what is not verified.
What comes next is in `ROADMAP.md`. How the code is laid out is in `CLAUDE.md`.

The full history — every incident, measurement and decision behind the rules below — is in
`docs/history/PRD.md`, unchanged. Code comments that cite "PRD §4a" … "§12" point there.

## 1. What the app does

A paper-trading app for multi-leg options strategies on ten commodity ETFs, for a
non-expert trader who wants to learn discipline rather than be sold trades.

- **Markets.** One registry, `src/markets.js` (PR #48), in three categories: Grains (CORN, SOYB, WEAT), Energy (UNG,
  BOIL, USO, XLE), Metals (GLD, SLV, GDX). SPY exists only to price a hedge; it is never proposed. Adding a market is
  one row there.
- **Broker.** An Alpaca paper account (US dollars). Option chains come from Alpaca's
  indicative feed first, CBOE delayed quotes as the fallback. The feed is named on screen.
- **Three steps, one on screen at a time (redesign PR 1, owner's mockups of 4 Oct 2026; two since PR #40).** **The app opens
  on Find** (owner, 5 Oct 2026, round 2): Home is no longer a screen; a first run answers the two capital questions, then
  lands on Find; Back on Find leaves the app. What Home said moved where the mockups put it: positions to look at are the
  Positions badge on the bottom bar (its spoken name is Home's old sentence, `statusLine()`), Settings is the gear in Find's
  header. Find and the market page draw no desk header (round 2); Build, Positions, the Journal and Settings keep it, without
  "← Home", until PR 2 and PR 3.
  1. **Find — one row per market (version B).** Top to bottom: "Find" with ↻ (refresh every market) and the gear; the status
     line "<freshness> · <feed> · Paper" (the stale banner with Retry in its place when stale); Results | Saved; the
     underlined category tabs "All 10 ·
     Grains 3 · Energy 4 · Metals 3" (the registry's own counts; they only filter what is shown, the basket is always
     read); ONE row of chips — ⇅ Order · Budget · Chance · Return · Horizon · Direction · Avg > 0 · Liquidity — each
     showing its value, filled when off its default, every one but Avg > 0 opening a bottom sheet that holds the
     existing control unchanged and ends with a live "Show N of M" ("Show flagged" is in the Order sheet, the floors'
     "why" fold in the Liquidity sheet); the line "N of M fit · K dimmed" (or "· K hidden") with Hide them / Show them
     and Reset; the column head "Market … <the sorted-by figure> · risk" with the ⓘ "How <TK>'s numbers connect" (five
     numbered steps); then one row per market: ☆, the ticker, ▲ Bull / ▼ Bear / ≈ Neutral from "Signals decide", "<structure>
     · <expiry>" (or the miss reason), a 72×40 picture, the sorted-by figure and "risk $N". **The rows are a view of the
     one sorted list** (`marketRows()`, src/rows.js): a row's card is the market's first card that fits, in the chosen
     order, else its first card as a miss, quieter, in its place. No new ranking, no new simulation; a row's figure is
     its card's tile (figures.test.jsx). States: markets still being read wait after the rows that are in ("Reading 10
     markets · 3 done · the order settles when all are in"); a stale feed is a banner with Retry; nothing fitting says
     which filter binds, the cheapest card here and ONE fix that never passes the per-trade limit ("Set budget to
     $75"), else "Reset filters". Saved shows "When saved" beside "Now" (priced at every read) for Chance, Future avg and
     You risk, with Remove and Build ›; orders sent and never filled stay there, and "what it would have done" folds.
     PR #49's request block, its card list and the "Go to Build" button left Find: the controls are in the sheets, the
     cards on the market page, the loaded trade on the bottom bar's Build.
  2. **The market page — Overview · Strategies · Chain** (a filtered view of Find's list for one ticker, not a second
     list; a row opens it on Strategies, the back arrow and Back return; ↻ refreshes this market). The header on every tab:
     the category's icon, ticker, name · category,
     price and its freshness, the change since the last close (from the bars already cached), the market clock, IV (the
     at-the-money IV the IV rank records, `atmIv()`), IV rank ("collecting, N of 20 days" until it exists), the expected
     move to the expiry shown (spot × IV × √(days ÷ 365)), ☆ (saves the first Strategies card), the newest headline the
     news factor tagged, and the event line. *Overview*: the price chart with no trade on it, its readout, "THE MARKET'S
     READ" (the Why sheet inline) and the chart copilot. *Strategies*: the market's cards, the signals' family first
     ("▲ BULL · WHAT THE SIGNALS SUGGEST"), then "≈ NEUTRAL · ALWAYS LISTED"; the line "Signals: +46 × 84 ÷ 100 = 38.6 →
     Bull" with "The market's read ›", then "Neutral cards are always listed. Order: … Expiry … · 40d."; each card is the
     **compact card** (round 2): PR #49's `CandidateCard` in its `compact` layout — the name, the legs and a 72×40
     picture; YOU RISK · MAX PROFIT · CHANCE · RETURN ON RISK in one row (each label opens its definition); what the trade
     needs at expiry and where it stands against the signals ("with the signals, 3 of 4 · none against",
     `signalStance()`); "FUTURE avg … · PAST YRS …"; the disagree sentence when the future and the past disagree; ☆ ·
     Compare · Open in chain · Build ›; and "Details ▾", which holds the full card as it was (nothing deleted). *Chain (advanced)*: expiry chips with days left (under 30 days dashed, not
     buildable), a T-chain with three modes (Bid · Ask, Delta · IV, OI · Vol — the last only when the feed sends open
     interest), "thin" under the liquidity floor; tap an ask to buy one, a bid to sell one (four legs at most); the tray
     names the structure and prices Debit or Credit, Max profit, Max loss and Chance through `listCardFigures()`; Build ›
     is blocked on an uncovered short leg and goes through `buildHandOff()`. Nothing is sent from this page.
  - **The event calendar** (`src/events.js`): WASDE and Crop Progress for the grains, EIA storage for UNG and BOIL, EIA
    petroleum for USO and XLE, FOMC for the metals, plus each market's expiries and its positions' 21-day exits; which
    market reads which is a key on its markets.js row. **The dates were read on the publishers' pages on 4–5 Oct 2026 and
    copied in (owner decision, 5 Oct 2026)**, each block with its source and "read 5 Oct 2026": WASDE 9 Oct, 10 Nov,
    10 Dec (12:00 ET); Crop Progress Mondays 16:00 ET to 30 Nov; EIA storage Thursdays 10:30 ET; EIA petroleum Wednesdays
    10:30 ET, moved to Thu 15 Oct and Thu 12 Nov 12:00 ET (Columbus Day, Veterans Day); FOMC 27–28 Oct and 8–9 Dec — the
    decision day only, **no time** (the Fed's page gives days, not the hour). The box names the next major event before the
    expiry shown, else the next weekly report, in the user's own time ("**WASDE** crop report · Fri 9 Oct, 18:00 your time
    · in 5 days"; "FOMC · decision Wed 28 Oct · in 24 days"); a tap lists every event before the expiry. A weekly report
    in a federal-holiday week says "holiday week: <publisher> may move it" (round 1's rule, kept by the owner on 5 Oct
    2026), except EIA petroleum, whose page lists its holiday changes. After 31 Dec 2026 the box is the placeholder
    `events-calendar`.
  - **Placeholders** (owner's rule, 4 Oct 2026): a function with no source yet is a dashed "Not connected yet" box saying
    what it will show, what it needs and which PR fills it (`PLACEHOLDERS` in rules.js), never a made-up number.
  **The controls and the card, as PR #45–#49 built them** — now inside Find's sheets and on the market page; only the
  markets picker and the results filter are gone: direction or **"Signals decide"**, size by
     spend or by target, and four sliders in one style (PR #45) — *most I will risk* (its top is the per-trade limit,
     editable inline; the trading capital under free sizing; "profit I am aiming for" in target mode), *chance at
     least*, *return on risk at least* (it can only tighten the reward floor, never loosen it) and *horizon*. Tap a
     slider's value to type an exact number; each slider shows a small histogram of the candidates with the threshold
     marked, and how many pass. Every control re-filters the list live; there is no Search button, and a slider never
     re-runs a simulation. **The chance slider asks for nothing by default** (PR #49): its leftmost position reads
     "any". **One sorted list (PR #49).** Every card is in the chosen order; a card that misses what you asked stays
     in its place, quieter, with the reason it missed at the top. The line reads "N cards match what you asked · M
     shown as misses"; "Hide cards that miss" (off by default) hides them ("· M hidden"). With nothing matching, the
     line says which control binds and the nearest value that lets one in, read off the cards' own figures.
     **Signals decide (PR #48).** A market's direction comes from its four signals once: s = score × confidence / 100,
     Bull at s ≥ 12.5, Bear at s ≤ −12.5, Neutral between, CONFLICT always Neutral, never "Very". It shows its
     suggested family plus the Neutral family; each card says "↑ bull · signals" or "→ neutral". While a market's
     signals are being read it shows its Neutral cards and the badge reads "reading…"; when they land, one line says
     "CORN: signals in, Bull cards added".
     **Order by** (names PR #49): Future avg (default) · Future avg + signal · Chance · Return on risk · Past yrs
     (synced). It sorts the whole list. The tile the list is sorted by is ringed and says "sorted by" on every card.
     Only "Future avg + signal" adds the signal adjustment (then CONFLICT markets sort last), and then the card says its
     sum at rest: "sorted by −3.6 + signal +27.5 = 23.9 per $100". "Past yrs" sorts by the replay's win rate, then
     its average per $100 at risk. "Only a positive future avg" (off by default) hides the rest and says how many.
     **"How the numbers fit ⓘ"** (every ⓘ shows its label since PR #49) says, from the constants: Future (Monte Carlo)
     = 8,000 invented futures to expiry, a simulation, not history; Past yrs (backtest) = this trade replayed on the
     ETF's real past, one row per year; + signal = score ÷ 2 × confidence ÷ 100 (a neutral card: (40 − |score|) ÷ 2 ×
     confidence ÷ 100); the filter is the sliders and toggles only; "Signals decide" and the autopilot's thresholds.
     Each card carries one badge ("CORN ↑ +64 · conf 86", tap for "Why this market"), a flag where it applies (single
     option, butterfly, CONFLICT, confidence under 40, options dear), the gauge beside the unified picture (tap opens
     the full figure), and **six figures for the size the budget buys**: YOU RISK (contracts × the risk), MAX PROFIT
     (contracts × the maximum profit, or "no ceiling"), CHANCE, RETURN ON RISK, **FUTURE (MONTE CARLO)** (the
     simulation's average at the fill price for this size, then "per $100 at risk", then "to <expiry>"; "— · no
     ceiling" for a structure with no maximum, which sorts last) and **PAST YRS (BACKTEST)** ("won 9 of 14 · avg
     +$310" for this size, "not read" until the series loads; its ⓘ says it settles at expiry, does not replay the
     exit rules and steps in whole months), with one line under them, "25 contracts × $193 at risk each", and what the
     chance is made of ("chance: prices + season" or "prices only"). Build's top card is the same component on the
     same numbers, and Build's backtest names its average "PAST YRS AVG". A toggle hides flagged cards and says how many. Up to three cards
     compared side by side. "Nothing today" appears only when zero candidates pass, with the count for every reason.
  3. **Build** — one trade: chain, legs, a five-line trade card, the order ticket, and the
     confirm step with the risk gate's checks in plain English.
- **Header (PR #46; round 2).** No market select at the top. On Find, ↻ in Find's own header reloads every selected market
  and the status line reads "N markets · prices Xm ago · <feed> · Paper" (the oldest); on Build the market selector sits
  beside the trade. Theme is in Settings, behind one gear; **dark is the default** since redesign PR 1 (a stored
  "light" stays light).
- **Evidence has a subject (PR #46).** Find has no evidence bar: a card's badge opens "<TK> this
  month" (the market, not this trade) and its fold opens "More on <TK>: levels · history" for that
  market; closing returns to the card. Build's bar is headed "About this trade · <TK> <structure>"
  and the Copilot lives only there. The Why sheet shows one verdict line ("3 of 4 agree · score +64
  · confidence 86"), an ⓘ that writes out how the score and the confidence were worked out from
  this market's numbers, one sentence on what the read changes in Find, and the long narrative
  behind "The full reasoning".
- **Places and the bottom bar (PR #47).** One bar at the bottom of every desk screen: **Find · Build · Positions ·
  Journal** (the Positions badge counts decisions plus closes working). Find is the start screen (round 2). Trades you are
  watching are **Saved**, inside Find (Results | Saved). The browser's Back button steps back through Find, the market
  page, Build, the places, the segments and the open sheets; Back on Find leaves the app.
- **Positions (PR #47).** On top, the **account strip**: EQUITY and BUYING POWER read from Alpaca at each sync (its
  options buying power when Alpaca sends one, and the label says which), and AT RISK "$X of $Y" — the risk gate's own
  open risk against the total limit ("no limit applied" under free sizing); each has a ⓘ, and the limits come from the
  capital set in Settings, not from equity. Then two segments, **Positions | Orders**, and one refresh icon.
  - *Positions*: one card per holding, saying its action first, then the profit (dollars and share of the risk), how far
    each of the three exits is, and the size as Alpaca holds it ("9 puts"); "Close at limit" and "Details" (the
    position read-only, with the entry beside now). A card whose close is working shows one line — "Close working at
    $7.62 · 0 of 9 · Market closed · opens Mon 15:30 your time" — and "Manage order", which opens its row in Orders. A
    holding Alpaca lists with no record here is a "Not in the app" card with Import (and its close at a limit).
  - *Orders*: one row per order read from Alpaca, three short lines (what · price, time in force, filled X of Y · the
    structure's bid / mid / ask and Alpaca's mark), with Modify, Cancel (confirm first) and History (Alpaca's
    timestamps in your time, the order id last); "Cancel all" at the bottom asks first. An order with no record here is
    tagged "sent outside this app". When the market is closed every row says when it opens, in your time.
  The order prints once: Build and the desk show counts only. Integrations are in Settings → Connections.
- **The Journal** — what happened, with a timeline per position and a weekly report.
- **The guided door is removed** at the owner's request, 23 Sep 2026 (PR #40): "Find
  opportunities" answered "Nothing today" while Radar listed seven structures on the same
  data. Home itself is gone since redesign PR 1 round 2: the app opens on Find.
- **Autopilot.** A scheduled server job that reads open positions and proposes exits as
  one-tap approval links. It never executes by itself.
- **Copilots.** An AI explanation of the loaded trade and of the chart. They explain; they
  never propose or place a trade.
- **Deploy previews are read-only** (redesign PR 2, TASK 0a, after deploy-preview-51 overwrote production's book on
  5 Oct 2026). A preview reads everything production reads, but every Netlify function that writes or sends (the state
  save, every order, Modify and cancel, the one-tap approval, the autopilot's run, the Alpha Vantage cache write) answers
  403 "Preview deploys are read-only: nothing is saved or sent from here." unless the deploy is the published production
  one; a context it cannot read is refused. On a preview the app shows "Preview · read-only: nothing here is saved or
  sent" on every screen and disables Send, Close, Modify, Cancel and File in Journal with that sentence under each.
- **Installable** as a PWA. Offline it says "Offline — no live data" and shows no prices.

The app must be able to say "nothing today". That is a feature, not an error.

## 2. Rules

Every rule below is code, not a prompt. The numbers live in `src/rules.js` (`RULES`).

### Non-negotiable

1. **Paper only.** If paper mode cannot be verified (the `X-OSL-Paper-Endpoint` header from
   `alpaca.mjs`), the order is refused.
2. **Defined risk.** No uncovered short leg; the maximum loss is always known before entry.
   Single long options and butterflies are offered, flagged on their card (PR #40).
3. **No API key reaches the client.** Keys live only in Netlify environment variables.
4. **Every order passes the risk gate** (`src/riskGate.js`) — all seven order paths (the seventh,
   PR #46, is Modify of a single-leg order: the gate, then Alpaca's in-place replace).
5. **Nothing executes without an explicit human confirmation.** Every send is two taps, and
   the second tap is made against the order written out in full.

### Sizing — asked, not assumed

- The user supplies trading capital and how many positions they hold at once; `sizing()`
  derives the limits. Until both are answered every figure is labelled a suggestion.
- **5% per trade** of trading capital, at most (`bestPracticePerTradePct`).
- **25% total exposure** at once (`totalExposurePct`). Exposure counts positions owned and
  orders still working at the broker, times their size.
- An override needs a typed reason and is stored with the position.
- Raising either cap is deliberately not on the roadmap.
- **Free sizing** (owner decision, 23 Sep 2026, PR #41): "capital ÷ concurrent positions is a
  guess I cannot make; a limit must not preclude a signal." One Settings toggle, **OFF by
  default**; turning it ON asks one typed reason, stored with its time (`settings.sizingFree`,
  synced via `/api/state`). While ON, the 5% and 25% limits are **not enforced**: no card is
  over budget, the risk gate neither refuses nor warns on size (`evaluateTrade({ sizingFree })`,
  its one new input), a trade is sized on the amount typed as "most I will risk", and one line
  above Send says "at risk now: $X across N positions" (information, never a block). The RULES
  values are unchanged. Paper only, defined risk, `minEntryDTE` and every quality floor stay
  enforced regardless. Every position records `sizingFree: true|false` and the weekly report
  splits P&L by it.
- A card's size is contracts × its RISK (the maximum loss), never the premium (PR #41).
- **The amount never passes the per-trade limit** (PR #45). With free sizing OFF, the amount typed
  as "most I will risk" is capped at `floor(perTradeLimit)` everywhere it sizes a card, and in
  "profit I am aiming for" mode no count puts more than the limit at risk. Measured before: a
  budget of $5,150 against a $5,000 limit sized 27 of 28 fixture cards above the limit, and the
  gate refused every one of them on Build. Raising the limit is the existing per-trade limit edit
  (typed reason). A structure with no ceiling is now sized on its risk alone (it can be sized
  against a budget, never against a profit target).

### The season — measured only (PR #48)

- The season is read from each market's measured Alpha Vantage monthly history (`/api/av`, seven-day cache) and nothing
  else — **all of it** since PR #49 (owner decision, 3 Oct 2026; it was cut at ten years); the hand-written table is
  retired. Until it has loaded, the season is **not read**: the factor is left out of
  the score with that reason, and the chance drifts at zero ("prices only").
- A calendar month counts only when its mean is at least `RULES.seasonalSignalT` (2) standard errors from zero (its own
  standard deviation ÷ √years). The window is the months the trade is held for; months that do not count add no drift.
- One function, `seasonalSignal()`, says what the season is for a window; the season factor, the chance, the position
  thesis and the autopilot all read it, so one market and one expiry give one season on every screen. The Why sheet
  prints each month: "Oct +1.2% ± 1.6% (16 yrs) · not a signal".

### The request — asked, not assumed (PR #49)

- **No chance minimum by default** (owner decision, 3 Oct 2026): `RULES.chanceAskDefault` is none; the chance
  slider's leftmost position reads "any" and filters nothing. Measured at the old 50%: 1 of 9 live cards and 5 of the
  31 fixture cards passed, so the list opened mostly hidden. The quality floors are unchanged and still remove.

### Entry

- At least **30 days to expiry** at entry (`minEntryDTE`). At or inside 21 days it is refused
  outright; between 21 and 30 it needs a typed reason.
- A candidate must have a real price (every long leg bid above zero, net at least $0.05 a
  share), a worst case that is actually a loss, a price the model does not contradict by more
  than 4×, and must clear the quality floors: liquidity (open interest against its own expiry),
  leg spread (≤35% of mid), combination spread (≤100% of net), crossing cost (the combination
  spread in and out, ≤50% of the maximum profit at the price that fills) and reward-to-risk (≥0.25).
- A contract the chain never listed is refused by the gate.
- Every figure on a card, every floor and the ranking are worked out at the price that will fill
  (`fillNet()`: `openLimitPrice()` on `comboBook()`, on the cent), and Build reads the same price.

### Exit — chosen once at entry, then frozen

| Rule | Value | Status |
|---|---|---|
| Take profit | 50% of max profit; **a single long option: 50% of the premium paid** | Closes the trade |
| Time exit | 21 days to expiry | Closes the trade |
| Stop | 50% of max loss | **Warning only.** Never an automatic close, never an approve link |

**Owner decision, 2 Oct 2026 (amends "frozen at entry" for single options).** A single long option
has no maximum to be half of: J-0001 (9 × GDX 94P, paid $4,500, now +$2,925 = +65%) needed
+$40,050 under the old rule and could only read HOLD until the time exit. So a single long option
(one leg, long) takes profit at +50% of the premium paid (`singleTakeProfitPctOfPremium`,
`takeProfitTarget()` in `rules.js`, the one function every site reads); spreads keep 50% of
their maximum. It applies to open positions too, J-0001 included: its target is read from the
premium, not frozen at a figure written at entry. Chosen, not measured (§4).

A close is always a **limit** order priced at the moment of the tap; never a market order.
An open position is never blocked from closing by the gate. Since PR #46 the price may be chosen
on the confirm, but only between the side that fills (the bid, to sell) and the mid; the default
is still `closeLimitPrice()`, and with the default the order sent is byte-for-byte what it was.

**The market clock (PR #47).** Alpaca's `GET /v2/clock` is read at each sync. When the market is closed, every order
row, the close confirm, Modify and Build's confirm say "Market closed · opens <weekday> <time> your time"; a close stays
sendable (Alpaca queues a limit order until the open) and the confirm says "queued". An unread clock is not a closed market.

**A best case is exact (PR #47).** The payoff at a price of zero is part of a structure's extremes, so a long put's
maximum profit is its strike less the premium, not the payoff at the edge of a chart. Records already stored keep their
figures; a card reads the exact best case and its timeline says "corrected" once.

**Modify, and never two working orders (PR #46).** One leg: the gate, then `PATCH
/v2/orders/{id}` (Alpaca keeps one order; the old one reads "replaced"). Several legs: Alpaca
refuses a replace on a multi-leg order, so Modify cancels, waits until Alpaca reports the old
order canceled, and only then sends the new one (path 3 for a close; Build's ticket, path 2, for
an opening order). The close's own cancel-the-conflicts step now waits the same way: a cancel
still pending at night means nothing new is sent until the session opens.

**Excluded on purpose (PR #46).**
- **Market close** — a close is a limit priced at the tap; a market order into these books pays
  whatever the far side asks (BOIL spreads of 66% to 166% of the mid).
- **Liquidate all** (`DELETE /v2/positions`) — the same rule, for every holding at once, at
  market. The proxy now refuses it outright.
- **Exercise** — turns the option into shares (100 per contract), outside the defined risk every
  trade here is sized on.
The proxy (`netlify/functions/alpaca.mjs`) passes an allowlist only: the read paths the app uses (`/v2/clock` since PR #47),
`POST /v2/orders`, `PATCH /v2/orders/{id}`, `DELETE /v2/orders/{id}` and `DELETE /v2/orders`.
Anything else is 405 with a sentence.

## 3. v1 — DONE WHEN

**v1 IS REACHED (owner's report, 5 Oct 2026):** J-0001's close filled 9 of 9 at $7.65 through order path 3, and the owner
filed it in the Journal from the production address. One owner check is left (§4 #1): the Journal entry shows the
$7.65 fill.

v1 is done when all three are true, each observed on the owner's real account and phone:

- **(a)** One opening order **filled at the intended price** — the fill Alpaca reports matches
  the limit the ticket showed, sign included.
- **(b)** One closing order **filled via order path 3** (`src/closeOrder.js`, from the Positions
  card or the desk) — the close path sent live, accepted by Alpaca, and filled.
- **(c)** The owner **reads each open position's action in five seconds**: HOLD, CLOSE with its
  reason, or WARNING.

(c) is built (ROADMAP PR #38); it is the owner's reading. PR #40 (one screen, one set of numbers)
changes what the owner reads, not what v1 needs: v1 waits only on the owner's three readings.

**Readings so far (24 Sep 2026, owner's phone).**
- **(a) VERIFIED.** J-0001 (9 × GDX 94P 2026-10-30): the ticket sent a debit of $5.02, Alpaca
  filled at a debit of $5.00, and the Positions card reads "That is $18.00 BETTER than you
  asked for, across 9 combinations". It filled on a recheck (pending_new → filled).
- **(c) read for HOLD** on J-0001 and readable. CLOSE and WARNING are read at J-0001's close.
- **(b) FILLED, read from the owner's Alpaca screenshot of 5 Oct 2026:** J-0001's close (GDX261030P00094000, sell 9,
  limit $7.62, the order sent by the card's "Close at limit", order path 3) filled 9 of 9 at an average $7.65 on
  5 Oct 2026, 3:30 PM — $0.03 a share better than the limit, $27 across the 9 contracts. The earlier $8.23 limit reads
  canceled. **Filed in the Journal from the production address** (owner's report, 5 Oct 2026). (A "File in Journal" tapped
  the same day on deploy-preview-51 went into that preview's own Journal and cost production's server copy the GDX
  position; that is why previews are read-only since redesign PR 2.)

## 4. NOT VERIFIED

At most ten items. **OWNER CHECK** means only the owner's reading can settle it; there is exactly
one, J-0001's Journal entry. Everything marked **read when it happens** is recorded if the owner meets it in
normal use, and is never asked for.

1. **OWNER CHECK — the Journal entry for J-0001 shows the $7.65 fill** (v1 is reached on the owner's report of 5 Oct
   2026: filled 9 of 9 at $7.65, filed from the production address; this session cannot see that browser). **No Modify
   has run live:** whether Alpaca accepts a `PATCH` on a single-leg
   option order is read from its documentation, not observed; a multi-leg replace is taken as refused (403) from the same
   reading. `replaces` / `replaced_by` (PR #48) are read from alpaca-py's source and tested on stubs only.
2. **Read when it happens — the live `/v2/clock` and `/v2/account` replies.** Their fields (`is_open`, `next_open`;
   `equity`, `buying_power`, `options_buying_power`) are read from alpaca-py 0.44.0's source, never from a reply; tested
   on stubs and in a headless Chromium against a stubbed broker only. Whether the owner's account sends
   `options_buying_power` is unknown.
3. **Read when it happens — every new screen on a phone with live data, in both themes.** Redesign PR 1's Find (round 2's
   look: its header, tabs, filter chips and their sheets, the flat rows, the stale banner, "Nothing fits", Saved's When
   saved / Now) and the market page (header, event box, Overview, Strategies' compact cards, Chain and its fixed tray)
   were photographed in a headless Chromium at 390×844, dark and one screen light, on findB.test.jsx's fixtures with every
   feed stubbed (docs/screens/redesign-pr1/; no sideways scroll) — **never on a real phone, never with live data, and the
   light theme never on a phone.** The list ends 88px above the bottom (owner's choice, 5 Oct 2026): while the Netlify
   badge strip exists the bar sits higher, and the last row may sit under it. **The Chain tab has not met the live Alpaca
   feed (no open interest) nor the CBOE fallback**: "thin", the OI mode and the tray's figures are read on fixtures only.
   The expected move and the day change have not been held against a live quote. **No screen reader was run.**
4. **Read when it happens — no credit has filled at the corrected limit** (the indicative combination ask on thin chains
   has not been measured by a fill; J-0003 never filled at it), **and "Not on Alpaca", "size N > M on the ask", the "Not
   in the app" card, an order "sent outside this app", and free sizing (PR #41)** have not appeared or been used live (the sync auto-imports a new holding on its
   first read, so "Not in the app" shows mainly when that import has not run); free sizing's "no limit applied" is
   tested on fixtures only.
5. **Find's cost on a phone is not measured, and the live season has never been read.** Generation is one memo (139–259
   ms for the 31 fixture cards on a desktop CPU; under "Signals decide" a directional market builds two families; the
   PR #49 replay adds ≈ 1 ms); a slider move is 0.1 ms. The sandbox cannot call Alpha Vantage: `seasonalSignal()` and
   `histBacktest()` have run on avFixture series only. Since PR #49 `parseAvJson()` keeps the whole series: on a
   195-month fixture a month carries 16–17 years instead of 9–10; which live months count, and every live PAST YRS
   tile, are unread.
6. **Not verified on the real deploy — the read-only preview guard (redesign PR 2, TASK 0a).** The deploy context is
    read from `context.deploy` as Netlify's own type definitions (`@netlify/types` 3.2.0) describe it; this sandbox
    could not open docs.netlify.com, and no function has run on a real preview or on production with the check. Stubbed
    in tests only (preview, branch, unpublished production, no context → 403 and nothing upstream; production → as
    before). **Whether previews hold the production Alpaca keys is not read** (netlify.toml scopes nothing per context;
    the Netlify connector listed no site): the owner reads it in Site configuration → Environment variables. **Previews
    built before this PR keep their unguarded functions** (deploy-preview-51 included); regenerating the Alpaca paper
    keys after this merges leaves them with dead keys, and their writes to the shared store cannot be revoked.
7. **The event dates have not been held against the publishers' pages on the days they fall, and the placeholders.**
   The table was read on the pages on 4–5 Oct 2026 by the owner's assistant (this sandbox could not reach them) and copied
   in; whether WASDE, the EIA reports and the FOMC decision land on those days, and EIA storage's holiday weeks, is read
   when they happen. **Placeholders and unknowns shipped** (`PLACEHOLDERS` in rules.js; an id leaves only when its
   function is built):
   - `events-calendar` — the event box after 31 Dec 2026 (the next year's calendars are not copied yet), and for a market
     with no calendar.
   - The EIA storage holiday weeks — the 2026 changes could not be read: Thanksgiving week (23–27 Nov) and Christmas week
     (21–25 Dec), like every federal-holiday week of a weekly report whose page was not read in full, carry "holiday week:
     EIA may move it".
8. **Chosen, not measured:** `seasonalSignalT` 2 and `directionSignalMin` 12.5 (owner decisions, 3 Oct 2026, PR #48),
   `singleTakeProfitPctOfPremium` 0.5 (owner decision, 2 Oct 2026),
   `modelDisagreementRatio` 4, `maxComboSpreadShareOfNet` 1.0, `maxCrossingShareOfMaxProfit` 0.5, `openLimitSlippage`
   and `closeLimitSlippage` 0.25, `watchAttentionShare` 0.35, `autopilotConfidence` 70, `fallbackIV`/`fallbackSigma` 0.25,
   the four chance-slider constants, `rewardAskMax` 3, `rewardAskStep` 0.05, `amountAskStep` 25, `staleBoardShare` 0.15,
   the liquidity floor, and the signal engine's constants (`BASE_WEIGHTS`, `REINFORCE` 1.25, `CONFLICT_DAMPING` 0.6,
   `CONFIDENCE_BANDS`). **`chanceAskDefault` is none** (owner decision, 3 Oct 2026, PR #49); the old 50% matched 1 of 9
   live cards and 5 of the 31 fixture cards. PR #47's word budgets (row 35, Positions 120) are the owner's; the close
   confirm 30 → 35 and Modify 38 → 40 are the owner's PR #49 decision (the ⓘ labels' words, measured). Find's and Build's word
   ceilings moved 309 → 315 and 244 → 250 in PR #48: the badge's words are now counted (the real change is one word).
9. **The exit rules are inherited defaults, not backtested** on these ten markets; the single option's +50% of the
   premium is the owner's choice. PAST YRS settles at expiry and does not replay them. **Since PR #50 a replay window
   that runs past December reads the next year's row and the last year is dropped, not padded** (it used to wrap to the
   same row's January): the PAST YRS tiles on windows that cross December (a November or December entry held 45+ days)
   changed with #50 and are owner-observed — no live tile has been read. On fixtures with no
   season the future avg runs −41.3 → +9.5 per $100, median −4.3, 6 of 31 above zero (the brief measured −41.0 →
   +8.2, −3.6, 4 of 31; the difference was not traced). The exact long-put maximum (PR #47, 0c) raises three Find fixture cards' return on
   risk 3.5–4.5×; how that moves their rank on live boards is not measured.
10. **Read when it happens — the AI features** have not seen a real answer since the usage limit ended (2026-10-01),
    the chart copilot on the market page's Overview included (the same `TaCopilot`, no trade loaded).

## 5. After v1

One line each. Detail for every item is in `docs/history/ROADMAP.md`.

- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref. First
  after v1: changing the sync of the only live record before its first live close is the wrong week.
- **P7** — learn about fills from Alpaca's `trade_updates` stream server-side, instead of polling.
- **P8** — more indicators and timeframes, only after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with a date slider, view toggles.
- **Play Store** — ship the PWA as an Android app.
- **Broker change** — a broker with futures and futures options; means rewriting the Alpaca layer.
