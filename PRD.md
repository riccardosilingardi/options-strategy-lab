# Options Strategy Lab — Product Requirements

What the product is, the rules it enforces, when v1 is done, and what is not verified.
What comes next is in `ROADMAP.md`. How the code is laid out is in `CLAUDE.md`.

The full history — every incident, measurement and decision behind the rules below — is in
`docs/history/PRD.md`, unchanged. Code comments that cite "PRD §4a" … "§12" point there.

## 1. What the app does

A paper-trading app for multi-leg options strategies on ten commodity ETFs, for a
non-expert trader who wants to learn discipline rather than be sold trades.

- **Markets.** Grain and gas tier: CORN, UNG, SOYB, BOIL, WEAT. Liquid tier: GLD, SLV,
  USO, XLE, GDX. SPY exists only to price a hedge; it is never proposed.
- **Broker.** An Alpaca paper account (US dollars). Option chains come from Alpaca's
  indicative feed first, CBOE delayed quotes as the fallback. The feed is named on screen.
- **Two steps, one on screen at a time.**
  1. **Find** — one request block above one ranked list of cards across the selected markets:
     markets, direction or "season decides", size by spend or by target, and four sliders in
     one style (PR #45) — *most I will risk* (its top is the per-trade limit, editable inline;
     the trading capital under free sizing; "profit I am aiming for" in target mode), *chance at
     least*, *return on risk at least* (it can only tighten the reward floor, never loosen it)
     and *horizon*. Tap a slider's value to type an exact number; each slider shows a small
     histogram of the candidates with the threshold marked, and how many pass. Every control
     re-filters the list live; there is no Search button, and a slider never re-runs a
     simulation. **A card that misses what you asked is hidden behind a count**: "N match what
     you asked · show M that miss", tapping it shows them, each with the reason it missed. With
     nothing matching, the line says which control binds and the nearest value that lets one in
     ("Lower chance to 54% → 1 match: XLE"), read off the cards' own figures. Under "season
     decides" a card says which direction its market's season chose ("↑ bull · season").
     Each card carries one badge (agreement · score · confidence, tap for "Why this market"),
     a flag where it applies (single option, butterfly, CONFLICT, confidence under 40, options
     dear), the gauge beside the unified picture (tap opens the full figure), and **four figures
     for the size the budget buys**: YOU RISK (contracts × the risk), MAX PROFIT (contracts ×
     the maximum profit, or "no ceiling"), CHANCE, RETURN ON RISK, with one line under them,
     "25 contracts × $193 at risk each"; the per-contract figures are behind the card's fold.
     Build's top card is the same component on the same numbers. A toggle hides flagged cards and
     says how many. The old Shortlist is a one-market filter on this list; up to three cards
     compared side by side. "Nothing today" appears only when zero candidates pass, with the
     count for every reason.
  2. **Build** — one trade: chain, legs, a five-line trade card, the order ticket, and the
     confirm step with the risk gate's checks in plain English.
- **Header (PR #46).** No market select at the top. On Find, Refresh reloads every selected market
  and the bar reads "N markets · prices Xm ago" (the oldest); on Build the market selector sits
  beside the trade. Theme is in Settings, behind one gear.
- **Evidence has a subject (PR #46).** Find has no evidence bar: a card's badge opens "<TK> this
  month" (the market, not this trade) and its fold opens "More on <TK>: levels · history" for that
  market; closing returns to the card. Build's bar is headed "About this trade · <TK> <structure>"
  and the Copilot lives only there. The Why sheet shows one verdict line ("3 of 4 agree · score +64
  · confidence 86"), an ⓘ that writes out how the score and the confidence were worked out from
  this market's numbers, one sentence on what the read changes in Find, and the long narrative
  behind "The full reasoning".
- **Two other places.** Positions (what you own, orders still working, and trades you are
  watching) and the Journal (what happened, with a timeline per position and a weekly report).
  A Positions card says its action first, then the profit (dollars and share of the risk), how
  far each of the three exits is, and the entry beside now; "Close at limit" is always on it and
  "Details" opens the position read-only (PR #44). **One orders list (PR #46)** sits at the top of
  Positions, "Orders waiting (N)", one row per order read from Alpaca: what it is, limit, time in
  force, filled X of Y, sent time, the structure's bid / mid / ask from the chain, Alpaca's mark,
  and one line when the limit is past the mark on the side that does not fill. Each row has
  Modify (a price between the side that fills and the mid, quantity, DAY or GTC; review, then
  send), Cancel (confirm first) and Details (Alpaca's status history); "Cancel all" asks first. A
  card whose close is working shows the same row inline; Build and the desk show counts only. The
  close confirm on the card has the same price field, starting at the app's own price. The browser's Back button steps back through
  Home, Find, Build, the places and the open sheets; Back on Home leaves the app, as before.
- **The guided door is removed** at the owner's request, 23 Sep 2026 (PR #40): "Find
  opportunities" answered "Nothing today" while Radar listed seven structures on the same
  data. Home's second door goes straight to Find.
- **Autopilot.** A scheduled server job that reads open positions and proposes exits as
  one-tap approval links. It never executes by itself.
- **Copilots.** An AI explanation of the loaded trade and of the chart. They explain; they
  never propose or place a trade.
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
The proxy (`netlify/functions/alpaca.mjs`) passes an allowlist only: the read paths the app uses,
`POST /v2/orders`, `PATCH /v2/orders/{id}`, `DELETE /v2/orders/{id}` and `DELETE /v2/orders`.
Anything else is 405 with a sentence.

## 3. v1 — DONE WHEN

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
- **(b) is the one reading left:** J-0001 closed with the card's "Close at limit" (order path
  3) and filled. Since PR #44 J-0001 reads CLOSE now ("Take profit reached: 50% of the premium
  paid"); at the latest its time exit, 9 Oct 2026 (21 DTE). It must be closed **and filed from
  the production address**, because the Journal lives in that browser only. Until then the owner
  is asked nothing else.

## 4. NOT VERIFIED

At most ten items. **OWNER CHECK** means only the owner's reading can settle it; there is exactly
one, v1 (b). Everything marked **read when it happens** is recorded if the owner meets it in
normal use, and is never asked for.

1. **OWNER CHECK — order path 3 has never been sent live, and no Modify has run live** (v1 b):
   the confirm step's words and its new price field, `groupForRecord()` on the real payload,
   Alpaca's order, the fill, and "close order working" clearing; the orders row, Modify → price →
   send (path 7, `PATCH`) → fill → "File in Journal". Tested on J-0001-shaped payloads and in a
   headless Chromium against a stubbed broker only. **Whether Alpaca accepts a `PATCH` on a
   single-leg option order is read from its documentation, not observed**, and a multi-leg
   replace is taken as refused (403 "replace mleg order is disabled") from the same reading;
   docs.alpaca.markets was blocked from the build sandbox, so both come from search results and
   alpaca-py 0.44.0's source. GTC on an options order is likewise unobserved.
2. **Read when it happens — no credit has filled at the corrected limit.** v1 (a) is verified
   on a debit (J-0001); PR #40's cent-a-leg seed change has not been seen on a credit.
3. **Read when it happens — the indicative combination ask on thin chains.** J-0003 (SOYB
   28/30) never filled at the indicative ask; no order has yet measured the gap.
4. **Read when it happens — every screen on a phone with live data:** Find (PR #40, #41, #45: the
   four sliders, the hidden-misses line, the sized card, the picture row, the grid) and PR #44's
   Positions card, Details, Back button, "reading…" badge and Build-from-a-card, and PR #46's
   orders list, Modify, Find header and Why sheet. Tested on
   fixtures, and PR #44's, #45's and #46's screens also in a headless Chromium (390px and 2000px) with
   stubbed chains. **No screen reader was run:** labels, headings, focus, `aria-expanded` and
   `aria-valuetext` are checked in markup and in the browser's DOM, not by hearing them.
5. **Find's cost on a phone is not measured.** Generation is one memo over every selected market
   (analyse, floors, an 8,000-run chance per survivor: 203 ms for the 31 fixture cards on a
   desktop CPU) and, since PR #44, ten news feeds loaded alongside chains and bars. A slider move
   is not in that memo: it sizes and filters the finished list (0.1 ms for 31 cards, within two
   frames in Chromium on a desktop). A slow phone may still lag on generation, and a feed that
   never answers keeps a badge on "reading…" until it fails.
6. **Read when it happens — "Not on Alpaca" and "size N > M on the ask"** have not appeared
   live. (PR #42's three fixes were verified on the phone on 24 Sep 2026 and are closed.)
7. **Read when it happens — free sizing (PR #41) has not been used live.** Tested with gate
   tests, renders and source sweeps only.
8. **Chosen, not measured:** `singleTakeProfitPctOfPremium` 0.5 (owner decision, 2 Oct 2026),
   `modelDisagreementRatio` 4, `maxComboSpreadShareOfNet` 1.0, `maxCrossingShareOfMaxProfit`
   0.5, `openLimitSlippage` and `closeLimitSlippage` 0.25, `watchAttentionShare` 0.35,
   `autopilotConfidence` 70, `fallbackIV`/`fallbackSigma` 0.25, the four chance-slider
   constants, the return slider's `rewardAskMax` 3 and `rewardAskStep` 0.05 and the amount
   slider's `amountAskStep` 25 (PR #45), `staleBoardShare` 0.15 (two boards only), and the
   liquidity floor (one close, 2026-09-01). **The default "chance at least 50%" is a RULES value
   nobody has read against live boards: on the 31 fixture cards it matches 5 and hides 26.**
   And the signal engine's constants (`signals.js`, explained on the Why sheet since PR #46,
   values unchanged): `BASE_WEIGHTS` seasonality 0.30, price trend 0.25, weather 0.25, news 0.20
   (renormalised over the factors a market has); `REINFORCE` 1.25 when weather and geopolitical
   news agree; `CONFLICT_DAMPING` 0.6; and `CONFIDENCE_BANDS` — confluent 75 + 0.15 × mean
   strength + 5 per factor beyond three, in [75, 95]; conflict 38 − 0.25 × the weaker side's mean,
   in [8, 39]; two pushing 50 + 0.2 × mean, in [45, 70]; one pushing 45 + 0.12 × mean, in [45, 58];
   none pushing 20. None was measured on past trades.
9. **The exit rules are inherited defaults, not backtested** on these ten markets; the single
   option's +50% of the premium is the owner's choice and has no measurement behind it at all.
10. **Read when it happens — the AI features.** The Anthropic usage limit that disabled both
    copilots, report section 5 and `copilotOverreach()` ended 2026-10-01; none has seen a real
    answer since, and none is asked of the owner.

## 5. After v1

One line each. Detail for every item is in `docs/history/ROADMAP.md`.

- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref. First
  after v1: changing the sync of the only live record before its first live close is the wrong week.
- **P2 full** — rank proposals by edge at the price that fills, not by score.
- **P7** — learn about fills from Alpaca's `trade_updates` stream server-side, instead of polling.
- **P8** — more indicators and timeframes, only after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with a date slider, view toggles.
- **Play Store** — ship the PWA as an Android app.
- **Broker change** — a broker with futures and futures options; means rewriting the Alpaca layer.
