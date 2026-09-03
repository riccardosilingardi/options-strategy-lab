// ============================================================================
// src/rules.js — THE single source of truth for the trading rules.
//
// PRD §3 (capital model) and §4 (exit rules) live here and nowhere else.
// If a number or a rule sentence appears in a component, a prompt or a
// serverless function, it is a bug: import it from here instead.
//
// Plain JS, no React imports — the client, the tests and the Netlify
// functions all import this file.
// ============================================================================

/** The config object. Everything else in this file is derived from it. */
export const RULES = {
  // --- exits, PRD §4. Chosen once per position at construction, then frozen.
  takeProfitPct: 0.5,          // take profit at 50% of max profit — KEEP
  scaleOutPct: 0.75,           // scale the rest out at 75% — ladder convenience
  stopLossPct: 0.5,            // stop at 50% of max loss...
  stopLossEnforcement: "warn", // ...but WARNING ONLY: never auto-closes (PRD §4)
  exitDTE: 21,                 // exit at 21 DTE — CHANGED from 7 (PRD §4)

  // --- entry window. An entry too close to the exit rule has no room to work:
  // the position would be opened already inside its own exit window.
  minEntryDTE: 30,             // hard floor at entry
  targetEntryDTE: 45,          // what autopilot aims for (PRD §9)
  // maxEntryDTE — THE FAR EDGE OF THE WINDOW THE APP BUILDS IN, and it exists
  // only so `expiryChoice()` cannot answer "the busiest board" with a board a
  // year out. Twice the target: past about three months the trade stops being
  // the one these exit rules were chosen for — the 21-DTE exit is most of the
  // position's life away, the seasonal window it was entered on has closed, and
  // an option that far out is bought mostly on volatility rather than on the
  // idea. It is a HORIZON, not a floor: nothing is refused for sitting outside
  // it, it just is not what the app opens on by default.
  maxEntryDTE: 90,

  // --- sizing, PRD §3. These two percentages are best practice, not law:
  // they cap a *derived* number, they do not replace it.
  bestPracticePerTradePct: 0.05, // no single trade above 5% of trading capital
  totalExposurePct: 0.25,        // no more than 25% of capital at risk at once

  // --- THE STARTING POINT SHOWN WHILE THE USER HAS NOT ANSWERED YET.
  // These are a SUGGESTION on screen, never "your limit": `sizing()` reports
  // `answered: false` when it had to fall back to them, and every screen that
  // prints a figure derived from them has to say where it came from. An app
  // that quotes a number the user never chose back at them as their own limit
  // has stopped being trustworthy about anything else it says (PRD §5).
  suggestedTradingCapital: 5000,
  suggestedConcurrentTarget: 4,

  // --- pill thresholds
  savingsShareWarnPct: 0.10,   // trading capital above 10% of savings → pill
  lowConfidence: 40,           // signal confidence under this → warning
  minOverrideReasonChars: 15,  // an override needs a typed reason, not a shrug

  // --- "nothing today", PRD §5. The app must be able to refuse, so the two
  // thresholds that make it refuse live here with every other rule number.
  expensiveIVRank: 70,         // IV rank at or above this → options priced rich
                               // versus their own history: we are the buyer of
                               // an expensive option, so we stand down

  // --- QUALITY FLOORS. A structure can pass every rule above and still be
  // indefensible. These two are the floors under a PROPOSAL: a candidate that
  // fails either one is never offered, and the screen says which floor it hit.
  //
  // THE LIQUIDITY FLOOR, IN TWO PARTS — RELATIVE FIRST, ABSOLUTE UNDERNEATH.
  //
  // Open interest is the count of contracts in existence at the previous
  // session's close: the closest thing to a headcount of the people on the
  // other side of your trade. On a contract with 2 open and 0 open, the bid and
  // the ask are a market maker's placeholder, not a price anybody has agreed
  // to — you can be quoted 1.16 and 0.30 on two adjacent strikes whose implied
  // volatility disagrees by ten points, because no trade has ever tested either
  // number.
  //
  // This used to be ONE absolute number, 25 contracts on every leg of every
  // market. That was the mistake. 25 is nothing on UNG and a great deal on
  // SOYB, so a single figure either empties the thin markets or waves the junk
  // through on the liquid ones — and which of the two it does depends on a
  // market it was never measured against. A count only means something next to
  // the other counts on the same board.
  //
  // >>> MEASURED, 2026-09-03, against all five live chains. <<<
  // `/api/liquidity` (netlify/functions/liquidity.mjs) was run against the
  // broker on the 2026-09-01 close: 1,654 contracts inside the band the app
  // builds in, 1,035 of them reporting open interest. What it found, NEAR THE
  // MONEY (within 10% of spot), is the whole argument for this floor:
  //
  //   market  strikes  1st quartile  median  40th pct  clears 10
  //   SOYB      38          11          58       33       82%
  //   CORN      38          40         216      100       89%
  //   UNG       67          90         360      202       90%
  //   BOIL     143          11          50       28       78%
  //   WEAT      45          50         164      150       84%
  //
  // The bar a leg must clear ranges from 28 contracts on BOIL to 202 on UNG —
  // a SEVENFOLD spread across five markets the app treats alike. The old fixed
  // 25 sat ABOVE the first quartile on SOYB and BOIL (both 11) and BELOW it on
  // CORN, UNG and WEAT (40, 90, 50): it bit hardest on exactly the thin markets
  // it was least able to judge, and was close to inert on the liquid ones. That
  // is the failure this replaces, and it is now measured rather than argued.

  // liquidityPercentile — WHERE A LEG SITS AMONG THE OTHER STRIKES ON ITS OWN
  // EXPIRY. At 0.40 a leg has to carry more open interest than the bottom 40%
  // of that expiry. A strike in the bottom of its own chain's distribution is
  // untraded whatever its raw count says, and that judgement travels between
  // markets in a way a fixed number cannot: it asks the same question of UNG
  // and of SOYB and gets an answer in each market's own terms.
  //
  // CONFIRMED by the reading. On all five markets the 40th percentile near the
  // money lands well above the absolute minimum below (28 to 202, against 10),
  // so the relative half does the work everywhere and the absolute one is only
  // catching dead chains — which is the shape this was designed to have.
  liquidityPercentile: 0.40,

  // minOpenInterestAbsolute — THE FLOOR UNDER THE FLOOR. A percentile on its
  // own lets a chain certify itself: where nothing trades, the 40th percentile
  // is one contract, every leg clears it, and the emptiness has become the
  // standard it is measured against.
  //
  // CONFIRMED by the reading, and it earns its keep. Near the money 10 removes
  // 10-22% per market and empties none of them. It also catches the genuinely
  // dead expiry, which is the case it exists for: BOIL's 2026-10-09 board had a
  // near-the-money MEDIAN of 3 contracts and a 40th percentile of 2 — below the
  // minimum, so 10 is what binds there and only 2 of its 7 near-the-money
  // strikes survive. A purely relative floor would have waved that whole expiry
  // through on the strength of its own emptiness.
  minOpenInterestAbsolute: 10,

  // minPeersForPercentile — below this many known counts on an expiry there is
  // no distribution to take a percentile of, so the relative half is dropped
  // and the absolute floor applies alone. The screen says which of the two
  // bound, because "we could not measure the neighbours" is a different fact
  // from "the neighbours are all busy".
  //
  // MOVED FROM 12 TO 8 BY THE READING, and this is the one number the
  // measurement actually changed. Only 34-76% of contracts report open interest
  // at all, so the peer set on an expiry is far smaller than its strike count —
  // and at the horizon this app aims for (targetEntryDTE 45) the grain markets
  // are thin in REPORTING strikes: SOYB's 43-day board had 10 and CORN's had
  // 11. At 12 the relative half would have switched itself off exactly where
  // the app builds, and on CORN that expiry's own 40th percentile was 30 —
  // three times the absolute minimum, so switching it off was a real loss of
  // protection rather than a harmless fallback. Eight is where a percentile
  // still means something: below it you are picking one of a handful.
  minPeersForPercentile: 8,

  // minRewardRisk — the least a structure may pay per dollar it puts at risk.
  // Read it as a break-even hit rate: at a ratio r a win pays r and a loss costs
  // 1, so you break even at p = 1 / (1 + r) — 0.25 means being right
  // 80% of the time to break even, and anything below it needs a hit rate no
  // structure on these five chains actually prices. It is also the practitioner
  // floor for a credit spread — collect at least a quarter of the width or the
  // wins are too small to pay for the losses. High-probability credit spreads
  // sit comfortably above it (a two-thirds-chance spread collecting a third of
  // its width is 0.5), so the floor removes the lottery tickets without
  // removing the boring trades that are the point of this app.
  minRewardRisk: 0.25,

  // --- A WIDE MARKET IS NOT A PRICE. THE THIRD FLOOR, BESIDE THE OTHER TWO.
  //
  // maxSpreadShareOfMid — how far apart the bid and the ask may be, AS A SHARE
  // OF THE MID PRICE BETWEEN THEM. A share and not a number of cents, for the
  // same reason the liquidity half is a percentile and not a count: 10 cents
  // wide is nothing on a $4 option and the whole trade on a $0.12 one.
  //
  // WHY THIS EXISTS AT ALL, when the liquidity floor is already here. They test
  // different things and neither implies the other. Open interest is a
  // HEADCOUNT — how many contracts are open, from last night's close. The
  // spread is TODAY'S DISAGREEMENT about what one is worth. A leg can have 300
  // contracts open and still be quoted 0.10 bid / 0.60 ask, and the liquidity
  // floor waves it straight through: it asked whether anybody is there, not
  // whether they agree. Every MAX PROFIT, CHANCE and EV in this app is computed
  // from the MID (`midOf()` in chain.js), and the mid of a market that wide is
  // the midpoint of an argument, not a price.
  //
  // >>> MEASURED, live, on BOIL 2026-10-09 near the money. <<< Bid/ask spreads
  // of 66%, 91%, 145% and 166% OF THE MID on strikes the app builds on. A
  // spread of 145% of the mid means the ask is more than three times the bid:
  // the two sides of that market do not agree within a factor of three about
  // what the contract is worth, and the number this app would print — half way
  // between them — is a figure neither of them quoted.
  //
  // WHY 0.35. You pay half the spread getting in and half getting out, so at a
  // spread share s the ROUND TRIP costs s times what the leg is worth: at 0.35
  // a third of the position's value goes to the market maker before the trade
  // is right or wrong about anything. That is already a punishing number to
  // accept, and it is deliberately well ABOVE what a liquid market quotes
  // (these chains trade in whole cents, so a $2 option two cents wide is 1%)
  // rather than tuned to be tight: like the liquidity floor, it is drawn where
  // a quote stops being a price, not where a trade stops being good. All four
  // BOIL readings above are refused by it and a normal strike is nowhere near
  // it.
  //
  // It sits BESIDE the liquidity floor and does not touch its two constants.
  // A leg is judged on both, and the screen says which one removed it.
  maxSpreadShareOfMid: 0.35,

  // minNetPremium — THE PRICE HAS TO EXIST BEFORE ANY OTHER RULE CAN BE
  // APPLIED TO IT. In dollars per share, the unit an option is quoted in:
  // multiply by 100 for one contract, as every screen does.
  //
  // Read live on BOIL, 2026-10-09, spot $21.23, with the liquidity floor OFF: a
  // Bullish Call Butterfly (+1 21C / -2 22.5C / +1 24C) priced at a net debit of
  // ZERO. The screen said YOU PAY $0, MAX LOSS -$0, R/R 6748644041614687.00 and
  // offered 250 contracts. A butterfly with 1.5-point wings on a $21 underlying
  // does not cost nothing: at least one leg's mid was a market maker's
  // placeholder on a strike nobody trades, and half of a placeholder ask is not
  // a price. A butterfly's maximum loss IS its debit, so a debit of zero means
  // the worst case is UNKNOWN, not that it is zero — and non-negotiable rule 2
  // is that the maximum loss is always known.
  //
  // Five cents a share ($5 a contract) is where a net stops being a number and
  // becomes the rounding of two placeholders against each other: these chains
  // quote in whole cents, the round trip on four legs costs more than that on
  // its own, and every arithmetic that divides by the cost — sizing, reward to
  // risk — is meaningless below it. It is deliberately far under any real
  // structure this app builds, because it is not a quality judgement: it is the
  // line under which there is nothing to judge.
  minNetPremium: 0.05,

  // --- scratchPayoffShare — FOR COPY ONLY, AND FOR NOTHING ELSE.
  //
  // It filters no candidate, blocks no order and changes no arithmetic. It
  // exists because a band drawn green and a band worth having are not the same
  // thing, and the sentence under the chart was conflating them.
  //
  // Read live on UNG: a broken-wing call butterfly, +1 10.50C / -2 11.00C /
  // +1 12.00C opened for a $1 credit, spot 10.57. Its payoff is +$1 anywhere
  // below 10.50, +$8 at spot, +$51 at the 11.00 peak and -$49 above 12.00. The
  // screen said it "makes money below $11.51, which the next 30 days reach
  // about 73.1% of the time". Every number in that was true, and it was still
  // the wrong impression: most of that 73.1% is the flat lower wing paying ONE
  // DOLLAR. A beginner reads "73% of the time" next to "up to $50" and joins
  // them into a claim nobody made.
  //
  // So a payoff at or under this share of the trade's best case is a SCRATCH:
  // you got your money back and a tip, not a win. A fifth is where the two stop
  // being the same story — at 20% of a $51 peak the wing would have to pay $10
  // to count, and $1 plainly does not; setting it much higher would start
  // calling the shoulders of a butterfly a scratch when they are most of what a
  // butterfly is for, and much lower would let a rounding error count as a win.
  // It is a threshold for a sentence, so it is allowed to be a judgement — but
  // it is a judgement written down once, with its reasoning, rather than a bare
  // number inside visuals.jsx.
  scratchPayoffShare: 0.20,
};

/** The same minimum in dollars for ONE contract, which is how screens print it. */
export const MIN_NET_DOLLARS = RULES.minNetPremium * 100;

/**
 * The dollar payoff below which a green band is a SCRATCH rather than a win.
 * Null when there is no best case to take a share of — with no ceiling there is
 * nothing for a payoff to be a small share OF, and inventing one here would put
 * the grid artefact back in through the copy.
 */
export const scratchLevel = (maxProfit) => {
  const m = Number(maxProfit);
  if (!Number.isFinite(m) || m <= 0) return null;
  return RULES.scratchPayoffShare * m;
};

/* ============================== formatting ============================== */

/** `$340`, `$1,250`. Dollars, no cents — every rule number is a round figure. */
export const money = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(Math.abs(n));
  // "-$0" is not a smaller loss than "$0": it is a number the app could not
  // read, wearing a minus sign. Round FIRST, then decide the sign, so nothing
  // that prints as zero can also print as negative.
  return `${n < 0 && r > 0 ? "-" : ""}$${r.toLocaleString("en-US")}`;
};

/**
 * A NUMBER WHOSE DIRECTION IS THE POINT — theta and vega, and nothing else yet.
 *
 * `money()` prints a minus for a loss and nothing for a gain, which is right for
 * a price: nobody needs "+$340" to understand what a maximum profit is. It is
 * WRONG for a rate of change. THETA on a long debit spread printed "$3" and the
 * holder LOSES that every day; read as a gain it inverts the one thing the
 * number is there to say. So these two always carry a sign.
 *
 * AND IT WILL NOT ROUND A REAL NUMBER AWAY TO NOTHING. VEGA printed exactly
 * "$0" on a 35-day spread, which reads as "volatility does not affect this" —
 * a claim, and a false one. Under a dollar it gains the precision it needs;
 * under a cent it says so in words rather than showing a zero it does not mean.
 * An exact zero is still "$0", because that one IS the number.
 */
export const signedMoney = (x) => {
  if (!known(x)) return "\u2014";
  const n = Number(x);
  if (n === 0) return "$0";
  const sign = n < 0 ? "-" : "+";
  const a = Math.abs(n);
  if (a >= 1) return `${sign}$${Math.round(a).toLocaleString("en-US")}`;
  if (a >= 0.01) return `${sign}$${a.toFixed(2)}`;
  // Below a cent, ONE SIGNIFICANT FIGURE rather than a rounded zero. `$0` on a
  // vega that is really 0.004 is a claim that volatility does not move this
  // trade; `+$0.004` is the same fact told truthfully, and it is no longer.
  return `${sign}$${Number(a.toPrecision(1))}`;
};

/** `5%`, `6.8%`. One decimal only when the number needs it. */
export const pctText = (frac, decimals = 1) => {
  const n = Number(frac) * 100;
  if (!Number.isFinite(n)) return "n/a";
  const r = Math.round(n * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(decimals)}%`;
};

/* -------------------------------------------------------------------------
 * ONE PROBABILITY, ONE ROUNDING, EVERYWHERE.
 *
 * The compare card printed "CHANCE 75%" next to "8 times in 10", and one spread
 * read 44%, 45% and "5 times in 10" across three screens. Some of that was
 * three different roundings of the same number; the rest was the same number
 * spoken two ways with nothing tying the two together. Both are fixed by having
 * ONE function: the phrase is derived FROM the rounded percentage, so the two
 * cannot disagree about a probability they are both describing.
 * ------------------------------------------------------------------------- */

/** The rounded whole percent, or null when there is no probability to print. */
export const chancePct = (p) => {
  // `known()` first: `Number(null)` is 0 and 0 is finite, so coercing straight
  // away turns "we have no probability" into "a 0% chance" — a confident claim
  // built out of a missing one, which is the fault this whole file is about.
  if (!known(p)) return null;
  return Math.round(Math.max(0, Math.min(1, Number(p))) * 100);
};

/** `75%`, or the dash every unknown in this app prints. */
export const chanceText = (p) => {
  const pc = chancePct(p);
  return pc == null ? "\u2014" : `${pc}%`;
};

/**
 * `8 times in 10` — DERIVED FROM THE PERCENTAGE ABOVE, not from the raw float.
 * Rounding twice is how 0.749 became "75%" on one line and "7 times in 10" on
 * the next; there is one rounding now and the second phrasing is a restatement
 * of its result.
 */
export const chanceInTen = (p) => {
  const pc = chancePct(p);
  if (pc == null) return "\u2014";
  const n = Math.round(pc / 10);
  return `${n} time${n === 1 ? "" : "s"} in 10`;
};

/* ============================== rule text ==============================
   Short labels the UI renders. Generated from RULES so changing a number
   changes every screen at once. Never hand-write these strings. */

export const takeProfitLabel = () => `TP ${pctText(RULES.takeProfitPct)}`;
export const scaleOutLabel = () => `${pctText(RULES.scaleOutPct)}`;
export const stopLossLabel = () => `SL ${pctText(RULES.stopLossPct)}`;
export const exitDTELabel = () => `${RULES.exitDTE} DTE`;

/** `TP 50% · SL 50% · 21 DTE` — the badge shown next to the PAPER chip. */
export const ruleBadge = () => [takeProfitLabel(), stopLossLabel(), exitDTELabel()].join(" · ");

/** `max 5% of capital` — the best-practice cap, as a phrase. */
export const perTradeCapLabel = () => `max ${pctText(RULES.bestPracticePerTradePct)} of capital`;

/** `max 5% of capital ($250)` — the same phrase, priced for this user. */
export const perTradeCapText = (tradingCapital) =>
  `${perTradeCapLabel()} (${money(RULES.bestPracticePerTradePct * (tradingCapital || 0))})`;

/** One sentence for each exit rule, for tooltips and literacy pills (PRD §2). */
export const RULE_PILLS = {
  takeProfit: () =>
    `Take the profit at ${pctText(RULES.takeProfitPct)} of the maximum. Closing at half the ` +
    `maximum beats holding to expiration on a risk-adjusted basis.`,
  stopLoss: () =>
    `A loss of ${pctText(RULES.stopLossPct)} of the maximum raises a warning, not an order. ` +
    `The evidence for auto-closing here is the weakest of the four rules.`,
  exitDTE: () =>
    `Close or roll at ${RULES.exitDTE} days to expiration. The last ${RULES.exitDTE} days pay ` +
    `little extra premium for sharply higher gamma risk.`,
  definedRisk: () =>
    `No uncovered short legs, and the maximum loss is always known: every option sold is covered by ` +
    `one bought, so the worst case is a number you can read before you send the order.`,
  paperOnly: () =>
    `Paper trading only. If the account cannot be verified as paper, the order is rejected.`,
};

/* ===================== "nothing today", PRD §5 =====================
   The refusal screen gets the same care as every other. Its sentences are
   generated from the same numbers that cause the refusal, so the screen can
   never explain a threshold the code does not apply. */

export const NOTHING_TODAY = {
  signalsNotAligned: (best) =>
    `The four factors do not agree on any market today` +
    (best ? ` — the closest is ${best.tk}, and even there confidence is ${best.confidence} out of 100, ` +
      `under the ${RULES.lowConfidence} we need.` : `.`) +
    ` When the signals contradict each other we do not know enough, and a trade taken anyway is a guess with your money on it.`,
  optionsExpensive: (ticker, rank) =>
    `Options on ${ticker} are expensive right now: their implied volatility sits at ${rank} out of 100 versus ` +
    `its own past year, above the ${RULES.expensiveIVRank} mark. Buying here means paying a rich price for the ` +
    `same outcome, and the premium usually deflates faster than the idea pays off.`,
  budgetTooSmall: (risk) =>
    `Nothing fits inside ${money(risk)} of risk today. Every structure that matched your answers costs more than ` +
    `that to put on, and stretching the budget past your per-trade limit is exactly the habit these rules exist to stop.`,
  onlyOneRoad: (risk) =>
    `Only one structure fits inside ${money(risk)} of risk today, and one answer is advice rather than teaching. ` +
    `This app shows two roads with the trade-off between them or it shows none: with nothing to compare against, ` +
    `you would be taking our word for it. Widen the budget or come back tomorrow.`,
  noData: (what) =>
    `Market data for ${what} did not load, so there is nothing to judge. This is a missing-data problem, not a ` +
    `verdict on the market: try again in a minute.`,
  // Not a verdict on the market either, and not the same sentence as a board
  // emptied by the floors: every structure was built and then found to have no
  // readable price. Saying "nothing fits your budget" here would blame the user
  // for a chain the app could not read.
  unpriceable: (tally) => {
    const t = tally || {};
    const markets = (t.markets || []).join(", ");
    return `Every structure that fit your answers on ${markets || "the markets you picked"} came back without a ` +
      `price we can stand behind: ${t.unpriceable || "each one"} had a leg nobody is bidding for, or netted out to ` +
      `about ${money(0)} across its legs. That is not a free trade, it is an unpriced one — a maximum loss the app ` +
      `cannot compute is not a maximum loss of zero, and this platform does not send an order whose worst case it ` +
      `cannot print.`;
  },
  // A WORST CASE THAT IS A PROFIT IS ITS OWN ANSWER, and not the same one as an
  // unreadable price: the price was read, and what it produced is impossible.
  // Pooling the two would tell the user "we could not price it" about a board
  // the app priced perfectly well and then disbelieved.
  impossibleLoss: (tally) => {
    const t = tally || {};
    const markets = (t.markets || []).join(", ");
    return `Every structure that fit your answers on ${markets || "the markets you picked"} came back unable ` +
      `to lose: ${t.impossible || "each one"} priced with a worst case that is a PROFIT at every price at ` +
      `expiry. That is a risk-free arbitrage, and there is not one on these chains — it means a leg was priced ` +
      `off a quote nobody has traded against. This platform does not offer a trade on the strength of a number ` +
      `that would have to be wrong for the trade to work.`;
  },
  // The quality floors emptied the board. This is a real answer — "nothing on
  // CORN clears the liquidity floor today" is worth more than a screen of
  // structures nobody trades — so it gets a sentence with the counts in it.
  belowQualityFloor: (tally) => {
    const t = tally || {};
    const markets = (t.markets || []).join(", ");
    const lab = qualityFloorLabels(t.level);
    const parts = [];
    if (t.liquidity > 0) parts.push(`${t.liquidity} because ${lab.liquidity}`);
    if (t.spread > 0) parts.push(`${t.spread} because ${lab.spread}`);
    if (t.reward > 0) parts.push(`${t.reward} because ${lab.reward}`);
    if (t.unpriceable > 0) parts.push(`${t.unpriceable} because ${lab.unpriceable}`);
    if (t.impossible > 0) parts.push(`${t.impossible} because ${lab.impossible}`);
    // WHICH RULE DID THE WORK. `unpriceable` and `impossible` are counted here
    // so a mixed board can be explained in one screen, but they are NOT the
    // floors and the sentence must not say they are: a structure whose price
    // could not be read never reached a floor, and one that could not lose was
    // refused before either floor looked at it.
    const byFloor = (t.liquidity > 0 || t.spread > 0 || t.reward > 0);
    const lead = byFloor
      ? `was filtered out by the quality floors`
      : `was refused before the quality floors were even applied`;
    return `Every structure that fit your answers on ${markets || "the markets you picked"} ` +
      `${lead}: ${parts.join(", and ")}. ` +
      `Those floors are the difference between a price and a market. Nothing here today is the honest answer, ` +
      `and it is a better one than a trade nobody else is willing to take the other side of.`;
  },
};

/**
 * Where the limits on screen came from, in one sentence. Any screen that prints
 * a per-trade or exposure figure prints this next to it, so a suggested number
 * can never be read as the user's own decision (PRD §3, §5).
 */
export const capitalSourceNote = (limits) => {
  const L = limits || {};
  if (L.answered) {
    return `Worked out from the ${money(L.tradingCapital)} you set aside for trading and the ` +
      `${L.concurrentTarget} position${L.concurrentTarget === 1 ? "" : "s"} you want open at once.`;
  }
  return `SUGGESTED STARTING POINT — you have not told the app how much you are trading with yet. ` +
    `These figures come from an example ${money(RULES.suggestedTradingCapital)} split across ` +
    `${RULES.suggestedConcurrentTarget} positions, not from anything you chose. Set your own in Settings.`;
};

/** `your own per-trade limit` / `the suggested per-trade limit` — never the wrong one. */
export const perTradeLimitPhrase = (limits) =>
  (limits && limits.answered) ? "your own per-trade limit" : "the suggested per-trade limit";

/** The possessive in front of a limit figure: `your` only when it really is. */
export const limitOwner = (limits) => ((limits && limits.answered) ? "your" : "the suggested");

/* ====================== QUALITY FLOORS, applied ======================
   The two floors in RULES, as one pure function every candidate goes through.
   It lives here with the numbers rather than in a component, so a structure
   cannot be rejected on one screen and offered on another.

   TWO THINGS THIS FUNCTION WILL NOT DO.

   It will not treat MISSING open interest as low open interest. Alpaca's
   snapshots carry no open-interest figure at all (src/chain.js fills it in
   afterwards from the broker's contract list, and sometimes that call does not
   land). A floor that reads `null` as zero would reject every candidate on the
   whole feed and call it illiquidity, which is a lie about what we know. When
   any leg's count is unknown the liquidity check is SKIPPED and says so, and
   the screen repeats that rather than staying quiet.

   And it will not invent a reason. Every rejection comes back with the number
   that caused it, so the sentence on screen is the arithmetic, not a verdict. */

/**
 * WHAT THE MEASUREMENT FOUND — one home, so a screen can quote it.
 *
 * These are readings, not rules: they are the output of `/api/liquidity` on one
 * close, and they exist so the copy explaining the floor cannot drift from the
 * evidence behind it. They must never be DERIVED from the floor's own constants
 * — a screen that recomputed "the bar ran from 28 to 202" out of
 * `minOpenInterestAbsolute` would report a different measurement the moment
 * somebody changed the floor, which is the opposite of a measurement.
 */
export const LIQUIDITY_MEASUREMENT = {
  asOf: "2026-09-01",     // the close the broker stamped on the counts
  markets: 5,
  contracts: 1654,        // inside the band the app builds in
  reporting: 1035,        // ...and how many of those reported open interest
  // The 40th-percentile bar near the money, at its thinnest and its busiest.
  low: { market: "BOIL", bar: 28 },
  high: { market: "UNG", bar: 202 },
};

/** The measurement, as one sentence. Generated so no screen can misquote it. */
export const liquidityMeasurementNote = () => {
  const M = LIQUIDITY_MEASUREMENT;
  const spread = Math.round(M.high.bar / M.low.bar);
  return `The recommendation is MEASURED, not guessed. On the ${M.asOf} close, /api/liquidity read ` +
    `${M.reporting} contracts reporting open interest across all ${M.markets} markets: near the money the bar ` +
    `ran from ${M.low.bar} contracts on ${M.low.market} to ${M.high.bar} on ${M.high.market}, a ${spread}-fold ` +
    `spread, which is why one fixed number could not serve all ${M.markets}. That is one day's close and not a ` +
    `law: re-read it as the market moves.`;
};

/* ---------------------------------------------------------------------------
 * THE LIQUIDITY FLOOR AS A SETTING THE USER OWNS.
 *
 * The app recommends; the user decides; the screen always says which setting
 * produced what is on it. A floor nobody can move is the app asserting a number
 * it has not measured, and this one has not been measured yet (see RULES).
 *
 * Four settings, and the RECOMMENDED one reads its numbers straight out of
 * RULES so "the app's recommendation" is literally the constant in the code
 * rather than a copy of it that can drift. STRICT keeps the old absolute 25,
 * which is where this floor started; OFF is honestly named — it is not a
 * gentler floor, it is no floor, and the screen says what that lets back in.
 * ------------------------------------------------------------------------- */
export const LIQUIDITY_LEVELS = [
  {
    id: "strict", label: "Strict", percentile: 0.60, absolute: 25,
    blurb: "A leg must beat 60% of the strikes on its own expiry, and never carry under 25 open contracts.",
  },
  {
    id: "recommended", label: "Recommended", recommended: true,
    percentile: RULES.liquidityPercentile, absolute: RULES.minOpenInterestAbsolute,
    blurb: "A leg must beat the bottom 40% of the strikes on its own expiry, and never carry under 10 open contracts.",
  },
  {
    id: "relaxed", label: "Relaxed", percentile: 0.20, absolute: 5,
    blurb: "Only the emptiest fifth of each expiry is removed, and nothing under 5 open contracts.",
  },
  {
    id: "off", label: "Off", percentile: 0, absolute: 0,
    blurb: "No liquidity floor at all: every strike the feed lists is offered, however few contracts are open on it.",
  },
];

export const RECOMMENDED_LIQUIDITY = LIQUIDITY_LEVELS.find((l) => l.recommended);

/** A level by id, and never undefined: an unknown id falls back to the advice. */
export const liquidityLevel = (id) =>
  LIQUIDITY_LEVELS.find((l) => l.id === id) || RECOMMENDED_LIQUIDITY;

/** Is this setting looser than what the app recommends? */
export const isLoosened = (level) => {
  const l = liquidityLevel(level?.id ?? level);
  return l.percentile < RECOMMENDED_LIQUIDITY.percentile || l.absolute < RECOMMENDED_LIQUIDITY.absolute;
};

/**
 * The warning that has to be visible whenever the floor is loosened, naming
 * what it lets back in rather than saying "be careful".
 */
export const looseningWarning = (level) => {
  const l = liquidityLevel(level?.id ?? level);
  if (!isLoosened(l)) return null;
  if (l.id === "off") {
    return `THE LIQUIDITY FLOOR IS OFF. What comes back includes contracts nobody trades: on a strike with a ` +
      `handful of contracts open, the bid and the ask are a market maker's placeholder, not a price anyone has ` +
      `agreed to, and you can be quoted two adjacent strikes whose implied volatility disagrees by ten points. ` +
      `You would be paying whatever was typed, and you may not find anyone to sell it back to.`;
  }
  return `LOOSER THAN RECOMMENDED. This lets back in legs in the bottom ${pctText(l.percentile)} of their own ` +
    `expiry and legs with as few as ${l.absolute} contracts open. A price on a contract nobody trades is a quote, ` +
    `not a market: the exit can cost more than the entry saved.`;
};

/**
 * Is this a count the feed actually gave us? `Number(null)` is 0 and 0 is
 * finite, so every place that reads a count has to ask this BEFORE coercing or
 * an unknown arrives as a zero — which is the one thing this app must never say
 * about data it does not have.
 */
export const known = (x) => x != null && x !== "" && Number.isFinite(Number(x));

/** Sorted, ascending, unknowns dropped. The one place a count is judged known. */
export const knownCounts = (xs) => (Array.isArray(xs) ? xs : [])
  .filter(known)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * The value at fraction `f` of a SORTED array. One convention for the whole
 * app: `oiProfile()` in chain.js reads this too, so the distribution the screen
 * prints and the threshold the floor applies cannot be computed two ways.
 */
export function quantile(sorted, f) {
  if (!sorted?.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
}

/**
 * What open interest a leg needs, given the other strikes on its own expiry.
 *
 * @param peers  every known open-interest count on that expiry (the leg's own
 *               included — it is one of the strikes on the board)
 * @param level  one of LIQUIDITY_LEVELS
 * @returns {{ threshold, relative, absolute, peers, basis }}
 *   `basis` is which half bound: "relative" when the chain's own distribution
 *   set the number, "absolute" when the floor under the floor did, and
 *   "absolute (too few contracts to measure)" when there was no distribution to
 *   take a percentile of. The screen prints it, because a floor that will not
 *   say where its number came from is the thing this replaces.
 */
export function liquidityThreshold(peers, level = RECOMMENDED_LIQUIDITY) {
  const l = liquidityLevel(level?.id ?? level);
  const known = knownCounts(peers);
  // Three different reasons the relative half can be absent, and they are not
  // the same fact: a setting that asks for no percentile, a chain with too few
  // strikes to take one from, and a percentile that simply came out below the
  // absolute minimum. Reporting all three as "too few contracts" would be the app
  // blaming the data for its own setting.
  const wanted = l.percentile > 0;
  const measurable = wanted && known.length >= RULES.minPeersForPercentile;
  const relative = measurable ? quantile(known, l.percentile) : null;
  const threshold = Math.max(l.absolute, relative ?? 0);
  const basis = relative != null && relative > l.absolute ? "relative"
    : !wanted ? "absolute (no relative test at this setting)"
    : measurable ? "absolute"                       // measured, and it lost
    : known.length ? "absolute (too few contracts to measure)"
    : "absolute";
  return { threshold, relative, absolute: l.absolute, peers: known.length, basis, level: l };
}

/** `at least 12 open contracts — the 40th percentile of that expiry` */
export const thresholdPhrase = (t) => {
  if (!t) return "";
  return t.basis === "relative"
    ? `${t.threshold} open contracts — the ${ordinal(Math.round(t.level.percentile * 100))} percentile of that expiry`
    : `${t.threshold} open contracts${t.threshold === t.absolute ? " — the absolute floor, which bound here" : ""}`;
};

/** `40th`, `60th`, `1st`. Only ever used on a percentile. */
export const ordinal = (n) => {
  const v = Math.round(n);
  const s = ["th", "st", "nd", "rd"][(v % 100 - v % 10 !== 10) ? Math.min(v % 10, 4) % 4 : 0] || "th";
  return `${v}${s}`;
};

/** The floors as phrases, generated so no screen can quote a different number. */
export const qualityFloorLabels = (level = RECOMMENDED_LIQUIDITY) => {
  const l = liquidityLevel(level?.id ?? level);
  return {
    liquidity: l.id === "off"
      ? `one of its legs failed the liquidity floor`
      : `one of its legs is among the ${pctText(l.percentile)} least-traded strikes on its own expiry, ` +
        `or has fewer than ${l.absolute} contracts open`,
    spread: `the bid and the ask on one of its legs are more than ${pctText(RULES.maxSpreadShareOfMid)} apart, ` +
      `so the mid it would be priced from is not a number either side quoted`,
    reward: `it pays under ${money(RULES.minRewardRisk * 100)} for every ${money(100)} at risk`,
    unpriceable: `its price could not be read from the chain at all — a leg with no bid, or a net of about nothing`,
    impossible: `its worst case priced as a PROFIT, which is an arbitrage and therefore a mispriced leg`,
  };
};

/** The floors, in one sentence, naming the setting that produced this screen. */
export const qualityFloorSentence = (level = RECOMMENDED_LIQUIDITY) => {
  const l = liquidityLevel(level?.id ?? level);
  const liq = l.id === "off"
    ? `The liquidity floor is OFF on this screen, so nothing here was removed for being untraded.`
    : `Every structure offered here carries at least ${l.absolute} open contracts on every leg and ` +
      `beats the bottom ${pctText(l.percentile)} of the strikes on its own expiry — the floor is measured ` +
      `against the chain it is judging, because ${l.absolute} contracts means one thing on a busy market ` +
      `and another on a quiet one.`;
  return `${liq} Every leg here is also quoted within ${pctText(RULES.maxSpreadShareOfMid)} bid to ask, and ` +
    `everything here pays at least ${pctText(RULES.minRewardRisk)} of what it risks. Open interest is how many ` +
    `contracts are actually open and the spread is how far apart the two sides are today: a contract nobody ` +
    `trades is a quote and not a market, and a market that wide has no agreed price to be the middle of. ` +
    `The spread ceiling does not move with this setting. ` +
    `Setting: ${l.label.toUpperCase()}${l.recommended ? " (the app's recommendation)" : ""}.`;
};

/** The one line that says which setting produced the list underneath it. */
export const liquiditySettingNote = (level, counts) => {
  const l = liquidityLevel(level?.id ?? level);
  const c = counts || {};
  const shown = c.kept != null ? `${c.kept} shown` : null;
  const bits = [];
  if (c.liquidity > 0) bits.push(`${c.liquidity} removed for liquidity`);
  if (c.spread > 0) bits.push(`${c.spread} removed for a bid/ask spread over ${pctText(RULES.maxSpreadShareOfMid)} of the mid`);
  if (c.reward > 0) bits.push(`${c.reward} removed for reward-to-risk`);
  if (c.skipped > 0) bits.push(`${c.skipped} not liquidity-checked (the feed reports no open interest)`);
  if (c.spreadSkipped > 0) bits.push(`${c.spreadSkipped} not spread-checked (the feed quoted only one side)`);
  // Not removed BY this setting, and the note says so rather than letting a
  // count the floor never made appear as one of its own.
  if (c.unpriceable > 0) bits.push(`${c.unpriceable} left out before the floor, with no price we could read`);
  if (c.impossible > 0) bits.push(`${c.impossible} left out before the floor, unable to lose at any price`);
  return `LIQUIDITY FLOOR: ${l.label.toUpperCase()}${l.recommended ? " — the app's recommendation" : ""}` +
    `${shown ? ` · ${shown}` : ""}${bits.length ? ` · ${bits.join(" · ")}` : ""}. ` +
    `Measured against all ${LIQUIDITY_MEASUREMENT.markets} live chains on the ${LIQUIDITY_MEASUREMENT.asOf} close.`;
};

/** The one sentence shown when the liquidity floor could not be applied. */
export const liquiditySkippedNote = (feed) =>
  `The liquidity floor was SKIPPED${feed ? ` — ${feed} does not report open interest for these contracts` : ""}. ` +
  `Missing data is not evidence that nobody trades them, so nothing was rejected for it.`;

/* -------------------------------------------------------------------------
 * UNPRICEABLE IS NOT FREE.
 *
 * This runs BEFORE the quality floors and it is a different question from
 * either of them. The floors ask whether a structure is worth offering; this
 * asks whether it has a price at all. That is also why the risk gate applies
 * THIS and never the floors: a trade the user builds by hand on the desk is his
 * to make, but a maximum loss that cannot be read off real quotes is not a
 * small maximum loss — it is an unknown one, and rule 2 says the worst case is
 * always known.
 *
 * Two tests, both from the live BOIL case in RULES.minNetPremium:
 *
 *  1. EVERY LONG LEG NEEDS A BID ABOVE ZERO. You are buying it, so you have to
 *     be able to sell it back; nobody bidding means nobody is on the other
 *     side, and the mid the app priced it at is half of an ask nobody agreed
 *     to. Short legs are not tested here — the net test below catches a
 *     structure whose credit is imaginary, and a leg the feed said nothing
 *     about is UNKNOWN rather than zero, exactly as with open interest.
 *  2. THE NET MUST CLEAR THE MINIMUM, IN ABSOLUTE VALUE. A credit structure has
 *     a negative net and is perfectly priceable; it is a net of approximately
 *     nothing, either way round, that says the two halves cancelled because at
 *     least one of them was invented.
 * ------------------------------------------------------------------------- */

/**
 * @param {object} arg
 *   legs   — [{ side, type, strike, qty }]
 *   quotes — one entry per leg, aligned with `legs`: `{ bid, ask }`. A missing
 *            entry, or a bid that is null/undefined, is UNKNOWN and tests
 *            nothing. A real `0` fails.
 *   net    — the structure's net price PER SHARE, positive for a debit and
 *            negative for a credit (`analyze().entry`). Multiply by 100 for one
 *            contract.
 *   maxLoss — dollars for ONE contract, if known: it is the same fact seen from
 *            the other end, and for a debit structure it IS the debit.
 * @returns {{ priceable, reasons, why, noBid, unknownQuotes, netDollars }}
 *   `reasons` are finished English sentences with the numbers already in them.
 */
export function priceability({ legs = [], quotes = [], net = null, maxLoss = null } = {}) {
  const reasons = [];
  const known = (x) => x != null && x !== "" && Number.isFinite(Number(x));

  const noBid = [];
  let unknownQuotes = 0;
  (Array.isArray(legs) ? legs : []).forEach((l, i) => {
    const qt = (Array.isArray(quotes) ? quotes[i] : null) || null;
    if (!qt || !known(qt.bid)) { unknownQuotes++; return; }
    if (Number(l?.side) > 0 && Number(qt.bid) <= 0) noBid.push(l);
  });
  if (noBid.length) {
    const names = noBid.map((l) => `${l.strike}${l.type === "call" ? "C" : "P"}`).join(", ");
    reasons.push(
      `Nobody is bidding for the ${names} you would be buying: its bid is 0, so the price on screen is half ` +
      `of an ask that no one has agreed to. You could not sell it back at any price, and what this structure ` +
      `costs is therefore unknown rather than cheap.`);
  }

  const netDollars = known(net) ? Math.abs(Number(net)) * 100 : null;
  const lossDollars = known(maxLoss) ? Math.abs(Number(maxLoss)) : null;
  const netTooSmall = netDollars != null && netDollars < MIN_NET_DOLLARS;
  const lossTooSmall = lossDollars != null && lossDollars < MIN_NET_DOLLARS;
  if (netTooSmall) {
    reasons.push(
      `The whole structure prices at ${money(netDollars)} for one contract, under the ${money(MIN_NET_DOLLARS)} ` +
      `minimum. ${legs.length ? `${legs.length} legs` : "Legs"} on a chain quoted in whole cents cannot net to ` +
      `nothing: the halves cancelled because ` +
      `at least one of them was a placeholder, and a maximum loss of ${money(0)} is a number the app could not ` +
      `read, not a trade that cannot lose.`);
  } else if (lossTooSmall) {
    reasons.push(
      `The worst case prices at ${money(lossDollars)} for one contract, under the ${money(MIN_NET_DOLLARS)} ` +
      `minimum. A defined-risk structure that risks nothing is not a free trade, it is an unpriced one, and ` +
      `the maximum loss has to be a number you can read before anything is sent.`);
  }

  const why = noBid.length ? "no-bid" : (netTooSmall || lossTooSmall) ? "no-net" : null;
  return { priceable: reasons.length === 0, reasons, why, noBid, unknownQuotes, netDollars };
}

/** The one line a list prints in place of a structure it could not price. */
export const unpriceableNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} ${n === 1 ? "was" : "were"} left out because ${n === 1 ? "its" : "their"} ` +
  `price could not be read${what ? ` on ${what}` : ""}: a leg nobody bids for, or a net of about nothing. ` +
  `A maximum loss the app cannot compute is not a maximum loss of zero, and nothing here is shown at ${money(0)}.`;

/* -------------------------------------------------------------------------
 * WHICH EXPIRY THE APP OPENS ON — THE BOARD DECIDES, NOT THE CALENDAR.
 *
 * THE FAULT, MEASURED ON BOIL. Near the money, counting contracts that clear
 * the 10-contract absolute floor:
 *
 *     2026-09-18 (14 DTE)   19 of 23
 *     2026-10-02 (28 DTE)   12 of 14
 *     2026-10-09 (35 DTE)    2 of  7   <- the one the app selected
 *
 * The app picked its expiry by DISTANCE FROM A TARGET DTE alone — the first one
 * between 35 and 60 days out — and landed on the deadest board of the three. So
 * the Shortlist kept saying "nothing clears", the Radar (looking at 28 DTE)
 * kept saying four structures did, and both were telling the truth about
 * different expiries. The floor was never the problem. The floor is measured
 * and it is right; what was wrong was handing it a board with nothing on it.
 *
 * THE RULE. Among the expiries that satisfy the risk gate's `minEntryDTE` — a
 * hard floor that is not negotiable here, because an entry inside the exit
 * window has no days to work in — prefer the one whose NEAR-THE-MONEY strikes
 * actually clear the liquidity floor in force. Distance from `targetEntryDTE`
 * stays, but as the TIE-BREAK it always should have been: it decides between
 * two boards you could build on, it does not decide to build on an empty one.
 *
 * TWO THINGS IT WILL NOT DO, and they are the same discipline as everywhere
 * else in this file.
 *
 *  - IT WILL NOT BREAK THE 30-DAY FLOOR TO FIND A BUSIER BOARD. BOIL's thickest
 *    expiry by far is 14 DTE, and it is not eligible: opening there would put
 *    the position inside its own 21-DTE exit rule within a fortnight. But
 *    passing it over is a FACT THE SCREEN OWES THE USER, so `passedOver`
 *    carries the nearer, thicker expiry and why it was not taken. Silently
 *    choosing the third-best board and saying nothing is how the contradiction
 *    above survived.
 *  - IT WILL NOT COUNT AN UNKNOWN AS A ZERO. An expiry whose open interest has
 *    not landed yet (Alpaca snapshots carry none until the contract-list call
 *    patches it in) is `clears: null`, not `clears: 0`. Unknown expiries are
 *    ranked on DTE alone and `measured` says so, because "we could not read
 *    this board" is not "this board is empty".
 * ------------------------------------------------------------------------- */

/**
 * @param candidates  one entry per expiry, already read off the chain:
 *        `{ key, dte, clears, near }` — `clears` is how many near-the-money
 *        contracts clear the floor in force and `near` how many were looked at.
 *        `clears: null` means the feed has not said yet.
 * @param opts.minEntryDTE / opts.targetEntryDTE  the rules, overridable only so
 *        the tests can state them explicitly.
 * @returns {{ chosen, passedOver, eligible, measured, reason }}
 *   `chosen` the expiry to open on, or null when nothing is eligible.
 *   `passedOver` a NEARER expiry, below the DTE floor, that carries strictly
 *   more tradeable strikes than the one chosen — the thing the screen has to
 *   say out loud.
 */
export function expiryChoice(candidates = [], {
  minEntryDTE = RULES.minEntryDTE, targetEntryDTE = RULES.targetEntryDTE,
  maxEntryDTE = RULES.maxEntryDTE,
} = {}) {
  const all = (Array.isArray(candidates) ? candidates : [])
    .filter((c) => c && c.key != null && Number.isFinite(Number(c.dte)))
    // `Number(null)` IS 0, AND 0 IS FINITE. Coercing first would turn an expiry
    // whose open interest has not landed into an expiry with nothing tradeable
    // on it, and this function would then rank the boards it cannot read LAST —
    // the same lie `qualityFloor()` refuses to tell about a single leg.
    .map((c) => ({
      key: c.key,
      dte: Number(c.dte),
      clears: known(c.clears) ? Number(c.clears) : null,
      near: known(c.near) ? Number(c.near) : null,
    }));
  // The window, and a fallback that can never leave the app with no expiry: if
  // every board past the entry floor is beyond the horizon, the horizon yields
  // — it is a preference about which trade this app is for, and refusing to
  // open anything at all would be a stronger statement than it is entitled to
  // make. The entry floor never yields; that one is the gate's.
  const past = all.filter((c) => c.dte >= minEntryDTE);
  const inWindow = past.filter((c) => c.dte <= maxEntryDTE);
  const eligible = inWindow.length ? inWindow : past;
  const measured = eligible.some((c) => c.clears != null);
  const gap = (c) => Math.abs(c.dte - targetEntryDTE);

  // Most tradeable strikes first; the target DTE breaks the tie. With nothing
  // measured this collapses to the old behaviour — nearest to target — which is
  // correct: with no counts there is nothing better to go on.
  const ranked = [...eligible].sort((a, b) => {
    const ca = a.clears ?? -1, cb = b.clears ?? -1;
    if (ca !== cb) return cb - ca;
    return gap(a) - gap(b);
  });
  const chosen = ranked[0] || null;

  // The nearer board we are not allowed to use, and only when it is genuinely
  // better: naming an expiry that is no thicker would be noise.
  const passedOver = chosen == null ? null : all
    .filter((c) => c.dte < minEntryDTE && c.clears != null && chosen.clears != null && c.clears > chosen.clears)
    .sort((a, b) => (b.clears - a.clears) || (b.dte - a.dte))[0] || null;

  const reason = chosen == null ? "none"
    : !measured ? "dte"
    : ranked.length > 1 && (ranked[0].clears ?? -1) > (ranked[1].clears ?? -1) ? "liquidity"
    : "dte";

  return { chosen, passedOver, eligible, measured, reason };
}

/** Why the app is on this expiry, in one sentence, with the counts in it. */
export const expiryChoiceNote = (choice, level = RECOMMENDED_LIQUIDITY) => {
  const c = choice?.chosen;
  if (!c) return `No expiry is far enough out to open on: the entry floor is ${RULES.minEntryDTE} days, ` +
    `so the exit rule at ${RULES.exitDTE} days has room to work.`;
  const l = liquidityLevel(level?.id ?? level);
  const head = c.clears == null
    ? `Building on ${c.key} (${c.dte} days out), the closest to the ${RULES.targetEntryDTE}-day mark this app ` +
      `aims for. How many of its strikes are actually tradeable is not known yet — the feed has not reported ` +
      `open interest for this expiry.`
    : choice.reason === "liquidity"
      ? `Building on ${c.key} (${c.dte} days out): ${c.clears} of its ${c.near} near-the-money contracts clear ` +
        `the ${l.label.toUpperCase()} liquidity floor, more than any other expiry past the ` +
        `${RULES.minEntryDTE}-day entry minimum.`
      : `Building on ${c.key} (${c.dte} days out), the closest to the ${RULES.targetEntryDTE}-day mark, with ` +
        `${c.clears} of its ${c.near} near-the-money contracts clearing the ${l.label.toUpperCase()} floor.`;
  const over = choice.passedOver
    ? ` ${choice.passedOver.key} is busier — ${choice.passedOver.clears} of ${choice.passedOver.near} clear — ` +
      `but it is only ${choice.passedOver.dte} days out, inside the ${RULES.minEntryDTE}-day entry floor: ` +
      `opening there would put the trade inside its own ${RULES.exitDTE}-day exit rule almost immediately, ` +
      `so it is passed over.`
    : "";
  return head + over;
};

/** `nothing cleared on 2026-10-09` — an empty list always names its expiry. */
export const emptyExpiryNote = (expKey, tally, level = RECOMMENDED_LIQUIDITY) => {
  const t = tally || {};
  const l = liquidityLevel(level?.id ?? level);
  const bits = [];
  if (t.liquidity > 0) bits.push(`${t.liquidity} for liquidity`);
  if (t.spread > 0) bits.push(`${t.spread} for a bid/ask spread over ${pctText(RULES.maxSpreadShareOfMid)} of the mid`);
  if (t.reward > 0) bits.push(`${t.reward} for reward-to-risk`);
  if (t.unpriceable > 0) bits.push(`${t.unpriceable} with no readable price`);
  if (t.impossible > 0) bits.push(`${t.impossible} unable to lose at any price`);
  return `NOTHING CLEARED ON ${expKey || "this expiry"}${bits.length ? ` — ${bits.join(", ")}` : ""}. ` +
    `That is a verdict on ${expKey || "this expiry"} and on nothing else: another expiry on the same market ` +
    `can be far busier, and the count on any other screen is about the expiry that screen names. ` +
    `Setting: ${l.label.toUpperCase()}.`;
};

/* -------------------------------------------------------------------------
 * A WIDE MARKET IS NOT A PRICE — THE SPREAD FLOOR.
 *
 * The liquidity floor counts who is there. This one reads whether they agree.
 * They are independent: a leg with 300 contracts open and a 145%-wide market
 * passes the liquidity floor untouched, and that leg's MID — which is what
 * every maximum profit, chance and expected value in this app is computed
 * from — is the midpoint of an argument rather than a price anybody quoted.
 *
 * SAME TWO RULES AS THE LIQUIDITY HALF, and they are the point:
 *   1. UNKNOWN IS NOT WIDE. A leg the feed quoted one side of, or none, is not
 *      tested. A model-priced leg carries no bid or ask at all. Missing data is
 *      not evidence of a bad market, exactly as `oi: null` is not evidence that
 *      nobody trades a strike.
 *   2. IT NAMES ITSELF. The removal is counted separately from the liquidity
 *      one and says which of the two happened, because "nobody is holding this"
 *      and "nobody agrees what it is worth" are different facts about a leg and
 *      pooling them would explain neither.
 * ------------------------------------------------------------------------- */

/**
 * The bid/ask spread of one leg as a share of its mid, or null when unknown.
 *
 * Both sides have to be positive numbers. A zero or missing bid is NOT a
 * hundred-percent spread: it is the no-bid case, and `priceability()` already
 * refuses a long leg nobody is bidding for, by name and before the floors.
 */
export const spreadShare = (bid, ask) => {
  const b = Number(bid), a = Number(ask);
  if (!Number.isFinite(b) || !Number.isFinite(a)) return null;
  if (!(b > 0) || !(a > 0) || a < b) return null;
  const mid = (b + a) / 2;
  if (!(mid > 0)) return null;
  return (a - b) / mid;
};

/**
 * Run the two-sided quotes of a structure past the spread floor.
 *
 * @param quotes  one `{ bid, ask }` per leg, aligned with the legs, straight
 *                off the chain. A missing entry is UNKNOWN and tests nothing.
 * @param level   accepted so a caller can pass the liquidity setting through
 *                without special-casing; the spread floor is NOT part of that
 *                setting and does not move with it.
 * @returns {{ checked, pass, widest, floor, tested, unknown }}
 *   `widest` is the worst share found among the legs that could be measured.
 */
export function spreadFloor(quotes = [], { floor = RULES.maxSpreadShareOfMid } = {}) {
  const shares = [];
  let unknown = 0;
  for (const q of (Array.isArray(quotes) ? quotes : [])) {
    const sh = spreadShare(q?.bid, q?.ask);
    if (sh == null) { unknown++; continue; }
    shares.push(sh);
  }
  const checked = shares.length > 0;
  const widest = checked ? Math.max(...shares) : null;
  return { checked, pass: checked ? widest <= floor : true, widest, floor, tested: shares.length, unknown };
}

/** The refusal sentence, with the number that produced it already in it. */
export const spreadFloorReason = (widest, floor = RULES.maxSpreadShareOfMid) =>
  `Its widest leg is quoted ${pctText(widest)} apart, bid to ask, against a ${pctText(floor)} ceiling. ` +
  `Every profit, chance and expected value on this screen is worked out from the MID — half way between ` +
  `those two — and half way between numbers that far apart is a figure neither side quoted. You pay half ` +
  `the spread getting in and half getting out, so the round trip alone would cost ${pctText(widest)} of ` +
  `what the leg is worth.`;

/** The one line a list prints in place of the structures this floor removed. */
export const wideSpreadNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} ${n === 1 ? "was" : "were"} left out because the bid and the ask on ` +
  `${n === 1 ? "one of its legs" : "one of their legs"} are more than ${pctText(RULES.maxSpreadShareOfMid)} ` +
  `apart${what ? ` on ${what}` : ""}. That is a different fault from an untraded strike: contracts can be ` +
  `open and the two sides still disagree about what one is worth, and the mid this app prices from sits ` +
  `between them.`;

/** The one sentence shown when the spread floor could not be applied. */
export const spreadSkippedNote = (feed) =>
  `The bid/ask spread floor was SKIPPED${feed ? ` — ${feed} did not quote both sides of these contracts` : ""}. ` +
  `A quote we do not have is not a wide quote, so nothing was rejected for it.`;

/* -------------------------------------------------------------------------
 * IS THERE A CEILING AT ALL? — THE PROPERTY OF THE LEGS, NOT OF A GRID.
 *
 * `analyze()` used to report a maximum profit taken as the largest payoff on a
 * fixed grid running from 70% to 130% of spot. For a long call the expiry
 * payoff never stops rising, so that "maximum" was simply the payoff at +30%:
 * an artefact of where somebody stopped sampling. The Shortlist printed MOST
 * YOU CAN MAKE $459 under the tooltip "It cannot make more than this", which is
 * false, and the same artefact fed the expected value that put WEAT Long Call
 * ATM at the top of the wide search. It is the same disease as the $0 debit in
 * `minNetPremium` above: an UNKNOWN printed as a known number.
 *
 * Boundedness is decided from the legs, and the whole test is the slope of the
 * payoff at the two ends of the price line:
 *
 *  - AS S RISES WITHOUT LIMIT only calls keep paying, each long call adding one
 *    share of payoff per dollar and each short call subtracting one. Above the
 *    highest strike every call is in the money, so the far-right slope is the
 *    NET SIGNED CALL QUANTITY. Positive and the payoff runs away upwards: there
 *    is no maximum profit. Negative and it runs away downwards: there is no
 *    maximum loss, which is the uncovered short call the risk gate already
 *    refuses by name (UNDEFINED_RISK).
 *  - AS S FALLS the price line STOPS AT ZERO — a share cannot be worth less
 *    than nothing — so the put side can never be infinite: a long put is worth
 *    at most its strike and a short put loses at most its strike. That is why
 *    the test below reads the call quantity for both directions and reports the
 *    put quantity only as the number behind the worst case at S = 0. Puts make
 *    the downside LARGE, never unbounded, and calling it unbounded would be as
 *    wrong in the other direction.
 *
 * A structure can therefore be unbounded above, or unbounded below, or neither,
 * and never both.
 * ------------------------------------------------------------------------- */

/**
 * @param legs  [{ side, type, strike, qty }]
 * @returns {{ above, below, callQty, putQty }}
 *   `above` — is the expiry profit bounded above? When false the maximum profit
 *             is UNKNOWN and must never be printed as a number.
 *   `below` — is the expiry loss bounded below? False means an uncovered short
 *             call; the gate refuses those before any order is sent.
 *   `callQty`/`putQty` — the net signed quantities the answer was read from.
 */
export function payoffCeiling(legs = []) {
  const qtyOf = (type) => (Array.isArray(legs) ? legs : []).reduce((a, l) => {
    if (l?.type !== type) return a;
    const q = Number(l.qty);
    return a + Math.sign(Number(l.side) || 0) * (Number.isFinite(q) ? Math.abs(q) : 0);
  }, 0);
  const callQty = qtyOf("call");
  const putQty = qtyOf("put");
  return { above: callQty <= 0, below: callQty >= 0, callQty, putQty };
}

/** Is this structure's best case unknown? The one question every screen asks. */
export const profitUnbounded = (legs) => !payoffCeiling(legs).above;

/**
 * What a screen prints where a maximum profit would have gone. Three words the
 * app owns in one place, so no component invents its own way of saying it.
 */
export const NO_CEILING = "no ceiling";

/** The sentence under a figure that is missing because there is no ceiling. */
export const noCeilingNote = (what = "This structure") =>
  `${what} has NO CEILING: the payoff keeps rising as the price rises, so the best case is not a number — ` +
  `it is unknown. Anything computed from it (a reward-to-risk ratio, an expected value, the ` +
  `${pctText(RULES.takeProfitPct)}-of-maximum target) is left blank rather than taken from the edge of a chart.`;

/** The line a ranked list prints beside a candidate whose value cannot be scored. */
export const noCeilingRankNote = (n) =>
  `${n} candidate${n === 1 ? "" : "s"} here ${n === 1 ? "has" : "have"} no ceiling on the profit, so ` +
  `${n === 1 ? "its" : "their"} expected value cannot be computed and ${n === 1 ? "it sits" : "they sit"} last ` +
  `rather than being scored against the others. That is not a verdict on the trade: an unlimited best case ` +
  `is a real thing to want. It is a refusal to rank a number the app does not have.`;

/* -------------------------------------------------------------------------
 * A MAXIMUM LOSS THAT IS A PROFIT.
 *
 * PR #14 left this open in writing: "A structure whose maximum loss is POSITIVE
 * is still offered. The wizard already skips maxLoss >= 0; the Shortlist does
 * not." A worst case that is a gain says the structure cannot lose at any price
 * at expiry — a risk-free arbitrage. Those do not exist on five commodity ETF
 * chains: what exists is a leg priced off a market maker's placeholder, which
 * is the same fault as the $0 debit and belongs in the same register as
 * UNPRICEABLE rather than being quietly ranked as the best trade on the board.
 *
 * It is a SEPARATE test from `priceability()` on purpose. Priceability asks
 * whether the quotes behind a structure exist; this asks whether the arithmetic
 * they produced is possible. Keeping them apart means the screen can say which
 * of the two happened, and the counts do not get pooled into one number that
 * explains neither.
 *
 * The figure passed here is SIGNED, the way `analyze()` produces it: a real
 * worst case is negative. Callers that carry a positive magnitude (the risk
 * gate, `qualityFloor()`) must not use this function — they have already thrown
 * the sign away, which is exactly the information it reads.
 * ------------------------------------------------------------------------- */

/**
 * @param maxLoss  dollars for ONE contract, SIGNED: a loss is negative.
 * @returns a finished English sentence, or null when the worst case is a loss.
 */
export const impossibleLoss = (maxLoss) => {
  const n = Number(maxLoss);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `The worst this structure can do at expiry is a PROFIT of ${money(n)}: at no price does it lose ` +
    `anything. That is a risk-free arbitrage, and there is not one on these chains — at least one leg was ` +
    `priced off a quote nobody has traded against, so the ${money(n)} is invented rather than earned. ` +
    `A trade that cannot lose is not a trade this app can price.`;
};

/** The one line a list prints in place of a structure whose loss came out positive. */
export const impossibleLossNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} ${n === 1 ? "was" : "were"} left out because ${n === 1 ? "its" : "their"} ` +
  `worst case came out as a PROFIT${what ? ` on ${what}` : ""}: a trade that cannot lose at any price is an ` +
  `arbitrage, and an arbitrage on these chains is a mispriced leg. Nothing here is offered on the strength of ` +
  `a quote that would have to be wrong for the number to be right.`;

/**
 * Reward-to-risk, or null when there is nothing to divide by.
 *
 * The one place the ratio is formed, because the BOIL butterfly printed
 * "R/R 6748644041614687.00" from a max loss of about 1e-16: dividing by a
 * number the app could not read produces a number nobody can read either.
 * Below the minimum the answer is "—", never a ratio.
 */
export const rewardRisk = (maxProfit, maxLoss) => {
  const risk = Math.abs(Number(maxLoss));
  const reward = Number(maxProfit);
  if (!Number.isFinite(risk) || !Number.isFinite(reward)) return null;
  if (risk < MIN_NET_DOLLARS || reward <= 0) return null;
  return reward / risk;
};

/**
 * Run one candidate past both floors.
 *
 * @param {object} cand
 *   openInterest — one entry per leg. A number is a known count (0 included:
 *                  CBOE really does report zero). `null`/`undefined` means the
 *                  feed did not tell us, and skips the check.
 *   quotes       — one `{ bid, ask }` per leg, for the SPREAD floor. A leg the
 *                  feed quoted one side of, or none, is unknown and tests
 *                  nothing — the same rule as the open interest above. This
 *                  floor is independent of the liquidity SETTING: a user who
 *                  loosens the headcount has not said the two sides of a market
 *                  may disagree by a factor of three.
 *   maxProfit    — dollars, the best case, or null when there is no ceiling
 *   maxLoss      — dollars, the worst case (negative, or positive magnitude)
 *   unboundedProfit — true when the payoff has no ceiling (`payoffCeiling()`),
 *                  in which case the reward-to-risk floor is SKIPPED rather
 *                  than failed. This is the same rule as the liquidity half
 *                  one paragraph up: a measurement the app does not have is not
 *                  a measurement that came out badly. A structure with no
 *                  ceiling clears any ratio you care to name in the limit, so
 *                  failing it would be the floor rejecting a candidate for
 *                  paying too MUCH, and dropping it silently would hide the one
 *                  kind of trade whose upside the app cannot bound.
 * @returns {{ pass, liquidity, reward, reasons }} — `reasons` are finished
 *   English sentences with the numbers already in them.
 */
export function qualityFloor({
  openInterest = [], peerOpenInterest = null, level = RECOMMENDED_LIQUIDITY,
  quotes = [], maxProfit, maxLoss, unboundedProfit = false,
} = {}) {
  const risk = Math.abs(Number(maxLoss));
  const reward = Number(maxProfit);
  // `rewardRisk()` and nothing else: a max loss under the minimum is a price
  // the app could not read, and a ratio taken against it is arithmetic on a
  // placeholder. It returns null there, and null reads as "cannot be judged".
  const rr = rewardRisk(reward, risk);
  const lv = liquidityLevel(level?.id ?? level);

  const counts = Array.isArray(openInterest) ? openInterest : [];
  // `Number(null)` is 0 and `Number(undefined)` is NaN, so the unknowns have to
  // be thrown out BEFORE the coercion or a leg the feed said nothing about
  // arrives here as a leg with zero open contracts — exactly the lie this
  // function exists to refuse to tell.
  const isKnown = (x) => x != null && x !== "" && Number.isFinite(Number(x));
  const known = counts.filter(isKnown).map(Number);
  const checked = counts.length > 0 && known.length === counts.length;
  const worst = checked ? Math.min(...known) : null;

  // The floor is RELATIVE to the expiry the leg sits on. `peerOpenInterest` is
  // every known count on that expiry; with none passed the relative half simply
  // has nothing to measure and the absolute floor applies alone, which `basis`
  // reports rather than hiding.
  const t = liquidityThreshold(peerOpenInterest ?? known, lv);

  const liquidity = {
    checked,
    pass: checked ? worst >= t.threshold : true,
    worst,
    floor: t.threshold,
    threshold: t,
    level: lv,
  };

  // A WIDE MARKET IS NOT A PRICE, and it is a different fault from an untraded
  // one. Deliberately NOT moved by `level`: the liquidity setting is the user's
  // answer to "how thin a strike will you accept", which is not an answer to
  // "how far apart may the two sides be".
  const spread = spreadFloor(quotes);

  const rewardCheck = unboundedProfit ? {
    checked: false, pass: true, rr: null, floor: RULES.minRewardRisk, unbounded: true,
  } : {
    checked: rr != null,
    pass: rr != null && rr >= RULES.minRewardRisk,
    rr,
    floor: RULES.minRewardRisk,
    unbounded: false,
  };

  const reasons = [];
  if (!liquidity.pass) {
    const where = t.basis === "relative"
      // CONTRACTS. `expiryOpenInterest()` walks the calls AND the puts, so the
      // peer count is contracts, and naming it "strikes" halves the board in the
      // reader's head — 26 strikes on BOIL 2026-10-09, 52 contracts.
      ? `That expiry's own board sets the bar at ${t.threshold} — it is the ${ordinal(lv.percentile * 100)} ` +
        `percentile of the ${t.peers} contracts priced beside it, so this leg is among the least-traded on its own board.`
      : `The bar is ${t.threshold}, the absolute floor${t.basis.startsWith("absolute (") ? " (too few contracts on that expiry report open interest to measure a distribution)" : ""}.`;
    reasons.push(
      `Open interest is ${worst} on its thinnest leg. ${where} ` +
      `A price on a contract nobody trades is a quote, not a market: you would be paying whatever the ` +
      `market maker felt like typing.`);
  }
  if (!spread.pass) reasons.push(spreadFloorReason(spread.widest, spread.floor));
  if (!rewardCheck.pass) {
    reasons.push(rr == null
      ? `The best case cannot be measured against the worst, so there is no reward-to-risk to judge.`
      : `It pays ${money(rr * 100)} for every ${money(100)} at risk, under the ${money(RULES.minRewardRisk * 100)} ` +
        `floor: you would have to be right ${pctText(1 / (1 + rr), 0)} of the time just to break even.`);
  }

  return { pass: liquidity.pass && spread.pass && rewardCheck.pass, liquidity, spread, reward: rewardCheck, reasons };
}

/** The rules block injected into every model prompt. English, generated. */
export const copilotRulesBlock = () =>
  `Trading rules, to be applied in EVERY analysis: defined risk only — no uncovered short legs, ` +
  `and the maximum loss must always be a known number; take profit at ${pctText(RULES.takeProfitPct)} of max profit; ` +
  `a loss of ${pctText(RULES.stopLossPct)} of max loss is a WARNING, never an automatic close; ` +
  `exit at ${RULES.exitDTE} days to expiration; no single trade above ` +
  `${pctText(RULES.bestPracticePerTradePct)} of trading capital; total options exposure at or ` +
  `below ${pctText(RULES.totalExposurePct)} of trading capital; seasonality is a primary signal ` +
  `and a position against it needs extra scrutiny.`;

/* -------------------------------------------------------------------------
 * THE PERIODIC REPORT'S NARRATIVE SECTION, AS A PROMPT.
 *
 * It lives here rather than inline in the Journal tab for the reason every rule
 * sentence does: it is generated, it is tested, and it cannot drift from what
 * the deterministic half of the same document says.
 *
 * IT INVENTED A POSITION. Section 2 of the report is built from
 * `store.positions` and correctly said "No open positions." Section 5, written
 * by the model, said: "The BOIL $20.50/$22.50 call spread entered at $68 debit
 * — monitor daily against the 50% max-profit target ($434 credit)". No such
 * position was ever opened and the target was wrong as well. The cause was one
 * clause: the prompt asked for "what to prioritise on the open positions"
 * UNCONDITIONALLY, so with nothing to prioritise the model filled the hole from
 * the structure that happened to be loaded on the Build screen.
 *
 * Two fixes, and the second is the one that generalises. The clause is only
 * asked for when there is something to ask about; and the prompt states which
 * field is AUTHORITATIVE, so a structure sitting on the desk can never be
 * written up as a trade that was entered.
 * ------------------------------------------------------------------------- */

/**
 * @param positions  `store.positions` — the paper book. Only its length is read.
 * @returns the user message for the report's narrative section.
 */
export const reportNarrativePrompt = (positions = []) => {
  const n = Array.isArray(positions) ? positions.length : 0;
  const asks = ["what happened this week"];
  if (n > 0) asks.push(`what to prioritise on the ${n} open position${n === 1 ? "" : "s"}`);
  asks.push("two opportunities from the radar", "and the political or weather risks to watch");
  return `Write the narrative section of the periodic report: ${asks.join(", ")}. ` +
    `Bullet points, 250 words maximum.\n\n` +
    `THE OPEN POSITIONS ARE EXACTLY THE \`paperPositions\` ARRAY IN THE CONTEXT AND NOTHING ELSE. ` +
    (n > 0
      ? `There ${n === 1 ? "is" : "are"} ${n} of them. Do not describe any other trade as open, and take every ` +
        `entry price, maximum profit and target from that array rather than restating one from memory.`
      : `It is EMPTY: there are no open positions. Say so plainly and move on. The \`currentStrategy\` in the ` +
        `context is a structure being looked at on the Build screen — it has NOT been entered, it is not a ` +
        `position, and writing it up as one puts a trade in the record that never happened.`);
};

/* ============================== sizing, PRD §3 ==============================
   The old spec hardcoded "max 5% per trade, max 25% total". Those numbers were
   inherited, not chosen, and a number handed down teaches nothing. The limit is
   derived from what the user told us, and the 5% cap is shown as an explained
   suggestion on top of it. */

const positive = (x, fallback) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : fallback);
/** Did the user actually give us this, or are we about to invent it? */
const given = (x) => x != null && x !== "" && Number.isFinite(Number(x)) && Number(x) > 0;

/**
 * @param {object} answers
 *   tradingCapital   — money dedicated to trading (required in onboarding)
 *   concurrentTarget — how many positions held at once (required in onboarding)
 *   savings          — total savings (optional, skippable)
 *   override         — { perTrade, reason } typed by the user, PRD §3
 * @returns the derived limits, the pills the answers trigger, and whether an
 *          override was accepted.
 */
export function sizing(answers = {}) {
  // ANSWERED, or ASSUMED. Both questions have to have been answered before any
  // number derived from them may be shown as the user's own limit; with either
  // missing the whole set is a suggestion, and `answered: false` is how every
  // screen knows to say so. The figures are still produced — the risk gate has
  // to enforce SOMETHING while the questions are open, and the suggested
  // starting point is the conservative thing to enforce.
  const answered = given(answers.tradingCapital) && given(answers.concurrentTarget);
  const tradingCapital = positive(answers.tradingCapital, RULES.suggestedTradingCapital);
  const concurrentTarget = Math.max(1, Math.round(positive(answers.concurrentTarget, RULES.suggestedConcurrentTarget)));
  const savings = Number.isFinite(Number(answers.savings)) && Number(answers.savings) > 0 ? Number(answers.savings) : null;

  const suggestedPerTrade = tradingCapital / concurrentTarget;
  const bestPracticeCap = RULES.bestPracticePerTradePct * tradingCapital;
  const cappedPerTrade = Math.min(suggestedPerTrade, bestPracticeCap);
  const suggestedTotal = RULES.totalExposurePct * tradingCapital;

  // An override is only accepted with a typed reason. This is code, not a prompt.
  const ov = answers.override || {};
  const reason = typeof ov.reason === "string" ? ov.reason.trim() : "";
  const wantsOverride = Number.isFinite(Number(ov.perTrade)) && Number(ov.perTrade) > 0;
  const overrideAccepted = wantsOverride && reason.length >= RULES.minOverrideReasonChars;
  const perTradeLimit = overrideAccepted ? Number(ov.perTrade) : cappedPerTrade;

  // A PILL EXPLAINS AN ANSWER. With the questions still open there is no answer
  // to explain, and a pill built on the suggested figures reads as a statement
  // about the user — "one position at a time means all your risk sits on one
  // outcome" to somebody who never said one — which is the same fault as
  // quoting an invented budget back at him. The override pill is the exception:
  // it is about something he really did type.
  const pills = [];
  if (answered && suggestedPerTrade > bestPracticeCap) {
    pills.push({
      id: "per-trade-over-best-practice",
      text: `With ${concurrentTarget} position${concurrentTarget === 1 ? "" : "s"} at a time, each one ` +
        `would be ${pctText(suggestedPerTrade / tradingCapital)} of your capital ` +
        `(${money(suggestedPerTrade)}). Common practice caps a single trade at ` +
        `${pctText(RULES.bestPracticePerTradePct)} — ${money(bestPracticeCap)} — so one loss can't end the run.`,
    });
  }
  if (answered && savings && tradingCapital > RULES.savingsShareWarnPct * savings) {
    pills.push({
      id: "capital-share-of-savings",
      text: `Trading capital is usually money you could lose without changing your life. Yours is ` +
        `${pctText(tradingCapital / savings)} of your savings (${money(tradingCapital)} of ${money(savings)}).`,
    });
  }
  if (answered && concurrentTarget === 1) {
    pills.push({
      id: "single-position",
      text: `One position at a time means all your risk sits on one outcome. That is not wrong, but ` +
        `it is concentrated: ${money(perTradeLimit)} rides on a single trade.`,
    });
  }
  if (wantsOverride && !overrideAccepted) {
    pills.push({
      id: "override-needs-reason",
      text: `An override of ${money(ov.perTrade)} needs a written reason of at least ` +
        `${RULES.minOverrideReasonChars} characters. Until then the limit stays at ${money(cappedPerTrade)}.`,
    });
  }

  return {
    answered,
    tradingCapital, concurrentTarget, savings,
    suggestedPerTrade, bestPracticeCap, cappedPerTrade, suggestedTotal,
    perTradeLimit, totalLimit: suggestedTotal,
    overrideAccepted, overrideReason: overrideAccepted ? reason : null,
    pills,
  };
}

export default RULES;
