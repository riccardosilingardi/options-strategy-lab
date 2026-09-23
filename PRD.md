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
  1. **Find** — one request block (markets, direction or "season decides", budget or target
     with the per-trade limit editable inline, horizon, minimum chance) above one ranked list of
     cards across the selected markets. Every control re-filters the list live; there is no
     Search button. Each card carries one badge (agreement · score · confidence, tap for "Why
     this market") and, where it applies, a flag: single option, butterfly, CONFLICT,
     confidence under 40, options dear. A toggle hides flagged cards and says how many. The old
     Shortlist is a one-market filter on this list; up to three cards compared side by side.
     "Nothing today" appears only when zero candidates pass, with the count for every reason.
  2. **Build** — one trade: chain, legs, a five-line trade card, the order ticket, and the
     confirm step with the risk gate's checks in plain English.
- **Two other places.** Positions (what you own, orders still working, and trades you are
  watching) and the Journal (what happened, with a timeline per position and a weekly report).
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
4. **Every order passes the risk gate** (`src/riskGate.js`) — all six order paths.
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
| Take profit | 50% of max profit | Closes the trade |
| Time exit | 21 days to expiry | Closes the trade |
| Stop | 50% of max loss | **Warning only.** Never an automatic close, never an approve link |

A close is always a **limit** order priced at the moment of the tap; never a market order.
An open position is never blocked from closing by the gate.

## 3. v1 — DONE WHEN

v1 is done when all three are true, each observed on the owner's real account and phone:

- **(a)** One opening order **filled at the intended price** — the fill Alpaca reports matches
  the limit the ticket showed, sign included.
- **(b)** One closing order **filled via order path 3** (`src/closeOrder.js`, from the Positions
  card or the desk) — the close path sent live, accepted by Alpaca, and filled.
- **(c)** The owner **reads each open position's action in five seconds**: HOLD, CLOSE with its
  reason, or WARNING.

(c) is built (ROADMAP PR #38); it is the owner's reading. PR #39, the last v1 change, is shipped:
v1 now waits only on the owner's three readings.

## 4. NOT VERIFIED

At most ten items. **OWNER CHECK** means only a reading on the live market or the owner's phone
can settle it; no test in this repository can.

1. **OWNER CHECK — order path 3 has never been sent live, neither from the desk nor from the
   Positions card's close-at-limit.** In particular whether the sign on the limit comes out the
   way `mlegLimitPrice()` says, whether `groupForRecord()` finds the holding in a real
   `/v2/positions` payload, and whether "close order working" clears when Alpaca reports the
   fill. The opening sign was wrong for four pull requests and only a fill found it. This is v1 (b).
2. **OWNER CHECK — J-0003 has not filled.** Is the indicative combination ask systematically
   inside the real one on thin chains, and by how much? Its cancel is `pending_cancel`: whether
   the card shows "a cancel is already waiting" and clears when Alpaca reports it canceled has
   only been tested on fixtures (`cancelOutcome()`).
3. **OWNER CHECK — no opening order has yet filled at the intended price** since the sign fix.
   This is v1 (a). **And no credit order has filled at the corrected suggested limit** (PR #39,
   0a: a credit used to be suggested above the mid, on the side that never fills).
4. **OWNER CHECK — nobody has read the split list, the cards or the controls on a real screen,**
   nor the Positions card's one action (HOLD / CLOSE / WARNING / NO QUOTE / NOT ON ALPACA). Whether it reads in
   five seconds is the owner's answer to give (v1 c).
5. **OWNER CHECK — the quantity fields have not been tried on a real phone.** They are tested
   by driving the component's handlers, not by a touch keyboard.
6. **OWNER CHECK — `upgradeHolding()` has never run against a real `/v2/positions` payload.**
   Nor has the broker-preferred P&L, nor "Not on Alpaca" (`legsNotHeld()`, PR #39 0c): all are
   tested on hand-built fixtures only.
7. **Chosen, not measured:** `modelDisagreementRatio` 4, `maxComboSpreadShareOfNet` 1.0,
   `maxCrossingShareOfMaxProfit` 0.5 (measured on fixtures only: `scripts/measure-crossing.mjs`),
   `openLimitSlippage` and `closeLimitSlippage` 0.25, `watchAttentionShare` 0.35,
   `autopilotConfidence` 70, `fallbackIV` and `fallbackSigma` 0.25, and the four chance-slider
   constants (`chanceAskMin` 0.20, `chanceAskMax` 0.80, `chanceAskStep` 0.05,
   `chanceAskDefault` 0.50).
8. **The exit rules are inherited defaults, not backtested** on these ten markets.
9. **OWNER CHECK — the liquidity floor was measured on one close (2026-09-01).** Re-run
   `/api/liquidity` as the market moves.
10. **The AI features were disabled by an Anthropic usage limit until 2026-10-01.** Both
    copilots, report section 5 and `copilotOverreach()` have not seen a real answer since.

## 5. After v1

One line each. Detail for every item is in `docs/history/ROADMAP.md`.

- **P2 full** — rank proposals by edge at the price that fills, not by score.
- **P7** — learn about fills from Alpaca's `trade_updates` stream server-side, instead of polling.
- **P8** — more indicators and timeframes, only after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with a date slider, view toggles.
- **Play Store** — ship the PWA as an Android app.
- **Broker change** — a broker with futures and futures options; means rewriting the Alpaca layer.
