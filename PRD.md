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
  header. Find and the market page draw no desk header (round 2), nor Build (redesign PR 2), nor Positions (redesign
  PR 3a, which draws its own: "Positions", ↻ and the gear), nor the Journal and Settings (redesign PR 3b): no screen
  keeps the desk header. **On a computer** (a window at least 1024px wide, owner, 6 Oct 2026) the bottom bar is a sidebar
  on the left, Find's rows sit beside the market page, Positions' cards beside a position's own screen, and the Journal
  is two columns; Build and Settings keep a 760px reading width. A phone is unchanged.
  1. **Find — one row per market (version B).** Top to bottom: "Find" with ↻ (refresh every market) and the gear; the status
     line "<freshness> · <feed> · Paper" (the stale banner with Retry in its place when stale); Results | Saved; the
     underlined category tabs "All 10 ·
     Grains 3 · Energy 4 · Metals 3" (the registry's own counts; they only filter what is shown, the basket is always
     read); ONE row of chips — ⇅ Order · Budget · Chance · Return · Horizon · Direction · Avg > 0 · Liquidity — each
     showing its value, filled when off its default, every one but Avg > 0 opening a bottom sheet that holds the
     existing control unchanged and ends with a live "Show N of M" ("Show flagged" is in the Order sheet, the floors'
     "why" fold in the Liquidity sheet — which since PR 4d opens on today's takeaway, its four levels as chips counting the
     cards each keeps across every market, what else keeps cards out with counts, and the numbers one fold down); the line "N of M fit · K dimmed" (or "· K hidden") with Hide them / Show them
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
  2. **The market page — Signals · Strategies · Chain** (the first tab was "Overview" until PR 4: the owner asked that the
     tabs speak for themselves) (a filtered view of Find's list for one ticker, not a second
     list; a row opens it on Strategies, the back arrow and Back return; ↻ refreshes this market). The header on every tab:
     the category's icon, ticker, name · category,
     price and its freshness, the change since the last close (from the bars already cached), the market clock, IV (the
     at-the-money IV the IV rank records, `atmIv()`), IV rank ("collecting, N of 20 days" until it exists), the expected
     move to the expiry shown (spot × IV × √(days ÷ 365)), ☆ (saves the first Strategies card), the newest headline the
     news factor tagged, and the event line. *Signals*: the price chart with no trade on it, its readout, "THE MARKET'S
     READ" — the four factors as four blocks, each titled with what it highlights ("NEWS · pushes down · 3 headlines");
     News opens its headlines and Weather its regions in place, and the news block folds "Ask the copilot: News impact on
     TK" (PR 4) — and the chart copilot. *Strategies*: the market's cards, the signals' family first
     ("▲ BULL · WHAT THE SIGNALS SUGGEST"), then "≈ NEUTRAL · ALWAYS LISTED"; the line "Signals: +46 × 84 ÷ 100 = 38.6 →
     Bull" with "The market's read ›", then "Neutral cards are always listed. Order: … Expiry … · 40d."; each card is the
     **compact card** (round 2): PR #49's `CandidateCard` in its `compact` layout — the name, the legs and a 72×40
     picture; YOU RISK · MAX PROFIT · CHANCE · RETURN ON RISK in one row (each label opens its definition); what the trade
     needs at expiry and where it stands against the signals ("with the signals, 3 of 4 · none against",
     `signalStance()`); "FUTURE avg … · PAST YRS …"; the disagree sentence when the future and the past disagree; ☆ and
     **Compare** (the tick shows its word, "✓ Comparing" when on; PR 61), then Open in chain and Build ›; and "Details ▾",
     which holds the full card as it was (nothing deleted). After a tick, a line fixed above the bottom bar says "2 of 3 to
     compare · See them ›" and opens the one Compare sheet (below). ☆ is a toggle everywhere (PR 61): a second tap removes
     the saved item and the message line offers Undo, which puts back the same item. *Chain (advanced)*: expiry chips with days left (under 30 days dashed, not
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
  3. **Build — one trade, on the owner's mockup "3 · Build" (redesign PR 2).** No desk header. Top to bottom: "‹ CORN"
     (back to the market page on Strategies; "‹ Find" when the trade did not come from a market) and a "Paper" pill; the
     structure's name and "CORN · 20 Nov · 47 days · ×1", with the warning signs under it; **What this trade does** — one
     sentence from one generator (`tradeTakeaway()`: "Keeps up to $25 if CORN closes above $18.00 on 20 Nov; loses up to
     $75 below $17.00. Breakeven $17.75.") and the one chart: the last 60 sessions (1Y, 5Y a tap away), a blue fan to
     expiry (inner 68%, outer 95%), the bars of where it ends (green where it pays), the payoff at the right edge, the
     dashed labelled breakeven and today's price as a dot, at full width, with "How to read ⓘ"; **The numbers** — max
     profit, max loss, breakeven, return on risk (each label opens its definition), FUTURE (MONTE CARLO) chance and avg,
     PAST YRS (BACKTEST) in profit N of M and avg, delta in shares and theta a day — the card's own figures
     (figures.test.jsx); **Why this trade**, folded: the stance line the market page's card prints; open, each factor
     with its arrow, strength and "supports / against / quiet", the rule for when Send asks why in its real words (the
     market's score against the trade by 10 or more, not "2 or more against"), "The market's read ›" (the market page's
     Overview) and the five numbered lines (BETS ON, RISKS, WORKS, EXITS, WRONG IF); **Ask the copilot about this trade**
     — Pre-trade analysis (ending on CONFIRM, DOUBTS or DO NOT CONFIRM, PR 4), Explain the Greeks, The chart and this
     trade, What would make it wrong?, Compare with the other cards, News that could move it, or your own question; every answer is filed in the Journal; **Legs** with "Edit in chain ›" (the market page's Chain tray; its
     Build › comes back); **Order**, inline: Contracts and the limit as two steppers (the tick is the app's one price
     rule, a cent; since PR 4b the limit can also be typed, and **Mid · Pay · Negotiate** set it to the mid, the
     market's own price, or back to the app's starting price — owner, 6 Oct 2026), "Mid · natural · tick", where the limit sits, "Card at 6.75 · now 6.61: risk
     −$98, max profit +$98" when the limit in force is not the card's price (PR 61), the risk and its share of capital, the
     cap as a checkbox that writes the same free-sizing setting as Settings (turning it off asks the typed reason), and the
     open risk after this — with what it includes ("Includes $4,500 on GDX (not on Alpaca) and $4,725 on the GLD order
     still working", the gate's own terms) and, when the trade on Build is already in the book, "Already sent as J-0008…"
     and the open risk as it is, never the trade added a second time (PR 61; the review sheet says a resend is a second
     order); return on risk is a percentage, as on the card; **Exit plan** — take profit, the 21-day exit with its date, the stop as an alert, with "defaults ·
     not backtested on CORN"; **Send** ("Send limit order · credit $25"), held with its reason in words when the gate
     refuses; then **More on this trade ▾**, everything else in today's form (the market now, the card, the editor and
     the chain, the price and what crossing costs, the ticket's leg prices, order type and time in force with no Send of
     its own, all the numbers, the charts, every factor, market levels, history and the replay behind its button, the
     copilot's other questions). **Send opens the review sheet** — the order written out leg by leg with its OCC symbols,
     "Limit $0.25 credit · day · ×1", the gate's checks one per row (✓ / ✗, "—" when not read), the market clock, the
     against-the-signals reason when the rule asks it, Back and **Send to Alpaca** (the second tap: order path 2, the
     same gate call, `orderBody()` and POST). Accepted, it says "✓ Sent. Alpaca accepted it.", the order, the Journal ref,
     and Journal / See it in Orders. With Alpaca not connected the second tap opens on the app's own book. States:
     loading (dashes, "never a zero"), no quotes (Retry, Pick another expiry), empty (Go to Find, Open a chain).
- **Header (PR #46; round 2).** No market select at the top. On Find, ↻ in Find's own header reloads every selected market
  and the status line reads "N markets · prices Xm ago · <feed> · Paper" (the oldest); on Build the market selector is in
  "More on this trade ▾", in the editor (redesign PR 2). Theme is in Settings, behind one gear; **dark is the default** since redesign PR 1 (a stored
  "light" stays light).
- **Evidence has a subject (PR #46).** Find has no evidence bar: a card's badge opens "<TK> this
  month" (the market, not this trade) and its fold opens "More on <TK>: levels · history" for that
  market; closing returns to the card. Build has no evidence bar since redesign PR 2: "Why this market" is the market
  page's Overview, Market levels and History are in "More on this trade ▾", and the trade's copilot is a section of
  Build. The Why sheet shows one verdict line ("3 of 4 agree · score +64
  · confidence 86"), an ⓘ that writes out how the score and the confidence were worked out from
  this market's numbers, one sentence on what the read changes in Find, and the long narrative
  behind "The full reasoning".
- **Places and the bottom bar (PR #47).** One bar at the bottom of every desk screen: **Find · Build · Positions ·
  Journal** (the Positions badge counts decisions plus closes working). Find is the start screen (round 2). Trades you are
  watching are **Saved**, inside Find (Results | Saved). The browser's Back button steps back through Find, the market
  page, Build, the places, the segments and the open sheets; Back on Find leaves the app.
- **Positions (PR #47; the owner's boards since redesign PR 3a, 6 Oct 2026).** Its own header ("Positions", ↻ to read
  Alpaca again, the gear), then the **account strip**: EQUITY, BUYING POWER (Alpaca's options figure when it sends one; the
  ⓘ says which) and AT RISK "$X of $Y" — the risk gate's own open risk against the total limit ("no limit" under free
  sizing), and under it what that figure includes that is not a holding at Alpaca (a record Alpaca does not hold, an order
  still working; PR 61). One ⓘ open at a time, its sentence under the three tiles; the limits come from the capital set in Settings,
  not from equity. Then **Positions | Orders**.
  - *Positions*: one card per holding — the badge (CLOSE filled in the action tone, WARNING an amber outline, HOLD a
    green outline with its sentence behind ⓘ, NOT ON ALPACA / NO QUOTE dim), "J-0002 · UNG · 2 puts" (the size as Alpaca
    holds it), the structure's title and the profit with its share of the risk, one sentence ("Take profit reached: $178
    of $160." / "Stop warning reached: -$153 against -$120. A warning, not an order: you decide."), the three exits in
    short words over 4px bars, and one foot: the working close's line and "Manage order", or "Close at limit" when a rule
    says close, "Decide: close or keep ›" on a warning, a quiet "Details ›" otherwise; "File in Journal" when the holding
    is gone from Alpaca. An order sent and not filled is one line under the cards ("…is an order, not a position yet: it
    waits in Orders for Monday's open"). A holding Alpaca lists with no record is a "Not in the app" card with Import.
  - *The position's own screen* (the card's title, Decide, Details or Close at limit open it; "‹ Positions" or Back
    leaves): WHAT TO DO NOW (the badge with its rule, the profit, one sentence, and **Close at limit** — order path 3, its
    confirm in place — or **Keep it, write why**, which files the reason on the position's timeline; a preview keeps
    nothing), WHERE IT MAKES AND LOSES MONEY (one sentence and the last 60 sessions over the payoff at expiry), THE EXIT
    PLAN (three rows and bars), AT ENTRY VS NOW (the card's four figures and the four factors, a factor that turned marked,
    "N of the M reasons you opened it have turned"), RECORD · LAST 4 with "Whole record ›", Analyse as a new trade, Alpaca
    details (the record's own rows, read-only), the copilot's three position questions, and the exit orders and the
    reason check folded at the end.
  - *Orders*: the market's clock once at the top beside "Cancel all" (it asks first). One row per order read from Alpaca:
    the intent tag (OPEN / CLOSE), the structure's name and the ref; its terms and when it was sent; the book and Alpaca's
    mark; Modify (inline: the limit and the quantity on steppers, the range, Day | Good till cancelled, Review, then Send
    to Alpaca), Cancel (asks first) and Details (Alpaca's status history in your time, the order id last). An order with
    no record here is tagged "sent outside this app".
  The order prints once: Build and the desk show counts only. Integrations are in Settings → Connections.
- **The Journal (the owner's board since redesign PR 3b).** THE RECORD (level, rule closes, awareness, what is next;
  "inside the limit" and what the measures mean behind its ⓘ), "Find a trade" (a ref, its number or a ticker), OPEN
  (every open trade and every order still waiting, each opening on the reason it was opened and its whole timeline),
  CLOSED TRADES with their net (each opening on why it ended — "Closed by the rules: …" or "Your reason: …" — the reason
  it was opened, the per-trade reading, both order ids in full and its whole timeline; a figure that is not a fill is
  never in the net), and "Refs only go up". Folded below: the weekly report (its frequency beside it), the copilot's
  analyses, the 30-day entry floor's log. "Whole record ›" on a position's screen opens that position's entry.
- **Settings (the owner's board since redesign PR 3b).** "‹ Back"; YOUR CAPITAL and YOUR LIMITS with what is open now
  (positions at once, savings and your own per-trade limit with its written reason folded under "More limits");
  FREE SIZING (one typed reason); CONNECTIONS, each saying what the app last saw of it ("Connected · checked 10:14",
  "Not read yet" — never "Working" for a service nobody read), and the report webhook; APPEARANCE; WHEN THERE IS NOTHING
  TO DO; START OVER.
- **The guided door is removed** at the owner's request, 23 Sep 2026 (PR #40): "Find
  opportunities" answered "Nothing today" while Radar listed seven structures on the same
  data. Home itself is gone since redesign PR 1 round 2: the app opens on Find.
- **Autopilot.** A scheduled server job that reads open positions and proposes exits as
  one-tap approval links. It never executes by itself.
- **Copilots, by place** (owner, 6 Oct 2026: "It depends where it is. In Find, a preset analyses the cards and, under
  the filters set, makes objective comparisons that highlight or suggest the best strategy. In Build it explains the
  strategy. In Positions it analyses the position, the exit strategy, where you started from."; PR 4, the same day: "In
  Find AI explains the proposals, which is best, with a recommendation; in Build it confirms the structure or not; with
  open positions, review, analysis against the initial assumptions, what to do to close in profit"). **The app builds,
  the copilot explains and recommends, the person decides, the gate checks**: a copilot recommends only among what the
  app built or offers, and never writes a strike, an expiry, a structure or a size of its own, never sends, never closes.
  Every question in `SKILLS` (pro.jsx, the one home) names its place and opens with that place's role (`COPILOT_ROLE`);
  a screen offers only its own place's questions. The standing instructions carry no decision tree: the old trees are
  criteria for judging a card, never an instruction to build one.
  - **On Find**, "Compare ›" on the summary line opens **the one Compare sheet** (PR 61; the market page's "See them ›"
    and Build's "N still ticked" open the same one). With cards ticked it shows them — one picture (`CompareFigure`, at
    the size the budget buys) and their rows — and **Compare the cards** compares those; with none ticked it says "N cards
    from M markets fit" (cards, from `compareCards()`; Find's summary line keeps counting rows, one per market) and reads
    the cards that fit, in the owner's order, up to 20. Every row is labelled C1…Cn and prints the card's own figures for
    that size in CARD_LABELS' words; the copilot is handed the same rows with the same labels and names cards only by
    them. It recommends one card, at most two, or none, saying which filter binds; **News impact** reads the news across
    the markets and says which cards it supports or undercuts. The standing instructions say that Future and Past yrs
    answer different questions and neither is the more reliable.
  - **On the market page**, the news block's folded **News impact** explains this market's headlines; the chart copilot
    explains the chart. Neither recommends a trade.
  - **In Build**: **Pre-trade analysis** opens on one verdict — CONFIRM, DOUBTS or DO NOT CONFIRM (`BUILD_VERDICTS`) —
    then at most three reasons from the app's figures; it names a gate check only when it fails or sits at 90% or more of
    its limit (the share is the app's, in the context), and never overrides one (PR 61); **Explain the Greeks**; **The
    chart and this trade** (`taContext()` with the trade's breakevens); "What would make it wrong?", "Compare with the
    other cards" (it may name a card that fits better), "News that could move it".
  - **On a position's screen**: **Review this position**, **The exit from here** (what it takes to close in profit),
    **Since I opened it** (the figures, the four factors and the Greeks at entry against now) and **The chart since I
    opened it** (`sinceEntry()`); each may recommend one of the actions the screen offers (`positionActions()`: keep,
    keep and write why, close at limit, a good-till-cancelled take-profit order at the target, or Manage a close already
    working — never a second close). **Should I roll it?** reads the roll the app offers, below.
  - **Build's variants and a position's roll (PR 4b) are one calculation**, `src/alternatives.js`: the loaded legs moved
    on the strikes the chain lists — every strike one step up or down, the outer leg of each pair one step out or in, the
    same strikes on a later expiry — never a strike the chain did not list. Each is priced like a card (`priceAlt()` in
    App.jsx: `listCardFigures()`, the size the budget buys, the gate at that size). **Build** shows them under "Variants
    of this trade" with "Load ›" and asks **Which variant fits best?**. **A position** offers a roll only when it is not
    in profit and no reason it was opened has turned (`rollEligible()`; otherwise one sentence why not): the same
    structure on the later expiries the entry window allows, "Prepare the roll in Build ›". **A roll is two orders and
    never holds both:** Build says "Roll of J-0003: close J-0003 first" and Send waits until Alpaca no longer holds it;
    then the new trade is sent as a new trade through the gate (order path 2), and the two records are linked on their
    timelines ("Rolled into J-0006" / "Rolled from J-0003"). No eighth order path, no 4-leg roll order.
  - **In the Journal** (PR 4c), an opened closed trade asks **What did this trade teach me?**: its reasons at entry
    against how it ended (the record's own words — `whyOpenedLine()`, `endedLine()`, its result and whole timeline,
    a roll's "Rolled into / from" included). It explains; it recommends nothing. The answer is filed with the ref and
    leaves one line on the record's timeline.
  - No copilot places a trade; every answer is filed in the Journal. An answer cut off by its length limit (3,000 tokens
    since PR 61) offers **Continue**: the same context and the cut answer, continued where it stopped and appended to the
    same answer, filed once when whole. The model's id has one home, `COPILOT_MODEL` in rules.js.
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

At most ten items. **OWNER CHECK** means only the owner's reading can settle it: J-0001's Journal entry (#1), the live
open-risk numbers (#4), Find's speed on the phone (#5) and a real copilot answer (#10). Everything marked **read when it
happens** is recorded if the owner meets it in normal use, and is never asked for. (PR 61 re-read every item below by
name: none could be closed from this sandbox; each is re-confirmed with what PR 61 added to it.)

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
   The expected move and the day change have not been held against a live quote. **Redesign PR 2's Build** (at rest, Why
   open, the copilot with a stubbed answer, the Order over the cap, the review sheet, the sent state, loading, no
   quotes, empty, More open, Edit in chain, light) was photographed the same way but through the WHOLE app on fixtures
   (scripts/build-screens.jsx: Find → UNG → Build ›, a stub Alpaca on a closed market, a stub copilot;
   docs/screens/redesign-pr2/; Build 2,592px at rest, no sideways scroll) — never on a phone, never live. **Redesign PR
   3a's Positions, the position's screen and Orders** were photographed the same way on a fixture book (+book: three
   records, two holdings, two orders; docs/screens/redesign-pr3/) and every shipped screen was measured against the owner's
   boards themselves (`scripts/audit-screen.mjs`: 18 boards, dark and light, 0 differences unexplained) — never on a
   phone, never live. **Redesign PR 3b's Journal and Settings** joined the same audit (20 boards) and photographs, and
   **the computer's layout (two panes, the sidebar) was photographed at 1024, 1280 and 1366 px in the same headless
   Chromium only (PR 4: from 1024 the right pane keeps at least 390px) — never in a real desktop browser, and no board
   draws it** (the owner chose it in words). **PR 4's Signals tab, Find's Compare sheet and the copilot sections** were
   photographed the same way with a stub copilot (docs/screens/pr4/); the fixture has no headlines, so a news block with
   real headlines has not been seen. **PR 61's screens** (☆ with Undo, the tick's word and the line after it, the one
   Compare sheet ticked and fitting, Build's card-vs-limit line, "Already open as…", AT RISK's "Includes…") were
   photographed the same way (docs/screens/pr61/, `node scripts/shoot-pr61.mjs`) — never on a phone. **No screen reader
   was run.**
4. **Read when it happens — no credit has filled at the corrected limit** (the indicative combination ask on thin chains
   has not been measured by a fill; J-0003 never filled at it), **and "Not on Alpaca", "size N > M on the ask", the "Not
   in the app" card, an order "sent outside this app", free sizing (PR #41), and an order sent from Build's new review
   sheet (production only, never from a preview), "Keep it, write why" and Modify's steppers (redesign PR 3a)** have not
   appeared or been used live (the sync auto-imports a new holding on its
   first read, so "Not in the app" shows mainly when that import has not run); free sizing's "no limit applied" is
   tested on fixtures only. **OWNER CHECK — the live open-risk numbers (PR 61):** the double count is reproduced in code
   and fixed on Build (USO 145/152 ×17: $14,101 + $4,726 = $18,827 in riskGate.test.js); "Includes … (not on Alpaca) …
   order still working" and "Already sent as …" have been seen on the `+book` fixture and the owner's numbers only, never
   on the live book.
5. **OWNER CHECK — Find's speed on the phone; the live season has never been read.** Generation is one memo (139–259
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
   Redesign PR 3a: Positions' ceiling 207 → 235 (the boards' own words, counted in voice.test.js); the position's screen
   is built outside the block and has no ceiling of its own yet.
   PR 4: the counter stopped counting components that render only inside a fold or a sheet (main re-measured: find 336
   → 269, market 604 → 574); the ceilings are now find 288, market 581, build 417, positions 248 (voice.test.js).
   PR 4b: build 417 → 458 (the variants section and the roll's line on Build, an upper bound). PR 61: find 288 → 184
   and market 581 → 474 (the compare tray left both screens for the Compare sheet), build 462 → 504 (the "already sent"
   and card-vs-limit lines, Continue); `GATE_NEAR_LIMIT` 0.9 (when Pre-trade analysis names a gate check) is chosen.
9. **The exit rules are inherited defaults, not backtested** on these ten markets; the single option's +50% of the
   premium is the owner's choice. PAST YRS settles at expiry and does not replay them. **Since PR #50 a replay window
   that runs past December reads the next year's row and the last year is dropped, not padded** (it used to wrap to the
   same row's January): the PAST YRS tiles on windows that cross December (a November or December entry held 45+ days)
   changed with #50 and are owner-observed — no live tile has been read. On fixtures with no
   season the future avg runs −41.3 → +9.5 per $100, median −4.3, 6 of 31 above zero (the brief measured −41.0 →
   +8.2, −3.6, 4 of 31; the difference was not traced). The exact long-put maximum (PR #47, 0c) raises three Find fixture cards' return on
   risk 3.5–4.5×; how that moves their rank on live boards is not measured.
10. **OWNER CHECK — a real copilot answer.** The AI features have not seen a real answer since the usage limit ended
    (2026-10-01). PR 61 changed what they are asked (Pre-trade analysis: the verdict first, at most three reasons, the gate
    only for a failed check or one at 90%+; Find's cards named C1…Cn; Future and Past held equal), raised the budget to
    3,000 tokens and added Continue: all tested on a stubbed stream only.
    PR 4 rewrote the standing instructions (no decision trees; recommend only among what the app built) and added Find's
    two questions, the market page's News impact, Build's verdict, Greeks and chart questions and the position's four:
    **whether the model keeps to the cards and actions handed in, and gives exactly one of the three verdicts, has only
    been read in the prompt, never in a real answer** — tested on a stubbed stream only. **PR 4b's roll has never run
    live:** the close, then the opening from Build and the two timeline lines, are tested on the source and photographed
    on a fixture (`+roll`, a later CORN expiry added for the photograph); whether the live chain lists a later expiry
    inside the 30–90 day window for these markets is read when it happens.

## 5. After v1

One line each. Detail for every item is in `docs/history/ROADMAP.md`.

- **Journal on the server** — `journal` and `journalSeq` on `/api/state`, merged by ref. First
  after v1: changing the sync of the only live record before its first live close is the wrong week.
- **P7** — learn about fills from Alpaca's `trade_updates` stream server-side, instead of polling.
- **P8** — more indicators and timeframes, only after the owner has used the current ones.
- **P10-bis** — expiry strip, strike ruler, break-even line with a date slider, view toggles.
- **Play Store** — ship the PWA as an Android app.
- **Broker change** — a broker with futures and futures options; means rewriting the Alpaca layer.
