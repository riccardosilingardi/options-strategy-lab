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

// THE MODEL, FOR THE ONE CHECK THAT NEEDS ONE. `engine.js` imports nothing, so
// this is a leaf-ward import and not a cycle. `modelSanity()` below compares a
// price off the chain against `netBS()` — the SAME function and the SAME smile
// every other screen in this app prices with, which is the point: a second
// implementation of the model would make the check a comparison of two guesses.
import { netBS, bs, smile } from "./engine.js";

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

  // --- modelDisagreementRatio — A PRICE HAS TO SURVIVE A SANITY CHECK, NOT
  // JUST A FLOOR.
  //
  // >>> CHOSEN, NOT MEASURED — see the two paragraphs at the end. <<<
  //
  // THE FAULT, READ ON THE OWNER'S PHONE AND ON HIS ALPACA PAPER ACCOUNT,
  // 17 September 2026. A two-leg order reached the broker: BOIL 2026-10-23,
  // buy 10x 20C, sell 10x 21C, limit $0.05, day. It sat at "new" with a filled
  // quantity of 0.00 and never filled. It is the only order this app has ever
  // sent.
  //
  // With spot at 19.84, 36 days out and the implied volatility this app itself
  // uses for BOIL, that spread is worth $0.333 a share — $33.29 a contract.
  // The app priced it at $0.05, which is EXACTLY `minNetPremium`: it cleared
  // `priceability()` by rounding. Wrong by a factor of 6.7 in the direction of
  // "too cheap" means at least one leg's mid was a placeholder, and the
  // MAXIMUM LOSS SHOWN TO THE USER WAS $50 WHERE THE REAL ONE, HAD IT FILLED,
  // WOULD HAVE BEEN $333.
  //
  // That is the same disease as the $0 butterfly above, one cent ABOVE the
  // floor built to catch it — which is the whole lesson. `minNetPremium` is an
  // ABSOLUTE floor: it knows what a price may not be smaller than, and nothing
  // at all about what THIS structure should cost. A relative check does: the
  // app already has a theoretical value for every structure it builds
  // (`netBS()` in engine.js, with the same `smile()` used everywhere else), so
  // it can ask whether the chain and the model are telling the same story.
  //
  // WHY FOUR, AND WHAT IT IS MEASURED AGAINST. The numerator is a real chain.
  // The denominator is Black-Scholes at a HARDCODED per-ticker sigma, so the
  // bar cannot be tighter than that model's own error, or the app would refuse
  // real structures for the crime of the app's own volatility guess being off.
  // That error budget WAS measured here, by repricing every structure family
  // this app builds, on all five markets, at 30/36/45/60/90 days and five
  // strikes either side of the money, with the assumed volatility deliberately
  // wrong — `netBS(legs, S, dte, iv * m) / netBS(legs, S, dte, iv)`, counting
  // only cases where both nets clear MIN_NET_DOLLARS:
  //
  //     family          IV wrong +/-25%    IV wrong x0.5 .. x2
  //     call vertical   0.63 .. 1.28       0.39 .. 1.68
  //     put vertical    0.61 .. 1.44       0.41 .. 2.33
  //     butterfly       0.81 .. 1.31       0.59 .. 1.87
  //     iron condor     0.59 .. 1.53       0.27 .. 2.83
  //
  //     the live failure above (BOIL 20/21): 0.15
  //
  // A bar of FOUR accepts 0.25 to 4.00. Every artefact in that table sits
  // inside it — even a volatility guess wrong by a factor of TWO cannot make
  // this floor fire — and the one real fault sits outside it by 1.67x. It is
  // deliberately loose: it is not there to say a price is a bad price, only
  // that a price and its model cannot both be describing the same structure.
  //
  // >>> WHAT WAS NOT MEASURED, AND IT IS THE THING THE TASK ASKED FOR. <<<
  // The distribution of market-net over model-net on the five LIVE chains. It
  // would have been read through /api/liquidity and /api/chain and tabulated
  // here the way `LIQUIDITY_MEASUREMENT` is; there are no broker keys in this
  // sandbox and the egress proxy refuses the CONNECT, as it has since PR #15.
  // So the table above is the DENOMINATOR'S error budget, not the numerator's
  // behaviour, and 4 is a judgement written down once rather than a reading.
  // It goes on the NOT VERIFIED list in PRD.md until somebody takes that
  // reading — and the honest expectation is that it will come DOWN, because a
  // real chain should sit near 1 and nothing here knows how near.
  modelDisagreementRatio: 4,

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

  // --- closeLimitSlippage — HOW FAR A CLOSING LIMIT MAY WALK AWAY FROM THE MID.
  //
  // >>> CHOSEN, NOT MEASURED. <<< Every other number in this object either comes
  // from published research (the exits, PRD §4) or from a reading taken off the
  // live chains (the three floors). This one comes from neither. It is a
  // judgement written down once, with its reasoning, and it goes on the NOT
  // VERIFIED list in PRD.md until a filled closing order has been watched.
  //
  // What it is for. A closing order used to be sent as a MARKET order, which on
  // these chains is not a price at all: BOIL quoted bid/ask spreads of 66%, 91%,
  // 145% and 166% of the mid near the money, and a market order into a 145%-wide
  // book pays whatever the far side is asking. So a close is a LIMIT, and a
  // limit needs a number.
  //
  // The number starts at the MID and is allowed to concede a quarter of the
  // spread, in the direction that is worse for whoever is closing. A quarter and
  // not a half: half the spread IS the far side of the market, which is the
  // market order this replaces. A quarter is a real concession — enough that the
  // order is not sitting at a price nobody will meet — while keeping the close
  // nearer the mid than the touch. On a 10-cent-wide $2 option it gives up 2.5
  // cents; on the 145%-wide BOIL strike it refuses to chase.
  //
  // It is NOT a licence to retry. An order that does not fill at this price is
  // reported as working, and the next autopilot run proposes the close again at
  // a limit computed from a fresh chain. Nothing walks the price up by itself.
  closeLimitSlippage: 0.25,

  // --- openLimitSlippage — AND THE SAME QUESTION FOR AN ORDER GOING ON.
  //
  // >>> CHOSEN, NOT MEASURED, exactly like its sibling above. <<<
  //
  // THE FAULT, SAME ORDER AS `modelDisagreementRatio`. The ticket seeded its
  // limit with the bare mid — `Math.abs(estNet).toFixed(2)` — and a limit at
  // the mid of a BOIL book quoting 66%, 91%, 145% and 166% of the mid is a
  // price nobody meets. Closing orders have conceded a quarter of the spread
  // since PR #19, with the reasoning written down; opening orders conceded
  // NOTHING, and the ticket carried a comment saying so. The order sat.
  //
  // WHY IT IS A SIBLING AND NOT THE SAME CONSTANT. The number is the same and
  // the arithmetic is the same, and it would have been easy to export one. It
  // is two constants because the two concessions are answers to two different
  // questions, and a later session has to be able to move one without moving
  // the other:
  //
  //  - A CLOSE HAS TO HAPPEN. The exit rule has fired; the only choice is the
  //    price. Conceding buys the fill that the rule already decided on.
  //  - AN OPEN NEVER HAS TO HAPPEN. Nothing is forced, and "nothing today" is
  //    a feature of this app. So the concession is not buying a necessary
  //    fill, it is buying a fill the user may simply decline to pay for.
  //  - AND IT COSTS SOMETHING A CLOSE CANNOT COST: conceding on the way IN
  //    raises the debit, which IS the maximum loss on every structure this app
  //    builds — measured against the per-trade limit by the risk gate. A
  //    quarter of a wide spread can push a trade through that limit, and the
  //    right answer then is the gate refusing it, not a quieter concession.
  //    That is why the ticket prints the conceded price, the mid and the model
  //    value side by side, and why the gate reads what will actually be sent.
  //
  // A quarter for the same reason as the close: half the spread IS the far
  // side of the market, which is the market order this exists to avoid.
  openLimitSlippage: 0.25,
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
  // A PRICE THE MODEL DISBELIEVES IS A FIFTH ANSWER, and it is not any of the
  // four above. The price was read, it cleared the absolute minimum, and the
  // worst case it produced is a perfectly possible loss — it is simply not the
  // loss this structure has. Folding it into "unpriceable" would say the app
  // could not read the chain when it read it fine and disagreed with it.
  modelDisagreement: (tally) => {
    const t = tally || {};
    const markets = (t.markets || []).join(", ");
    return `Every structure that fit your answers on ${markets || "the markets you picked"} is priced by the ` +
      `chain at something the app's own model cannot account for: ${t.modelDisagreement || "each one"} came ` +
      `back more than ${RULES.modelDisagreementRatio}x away from its theoretical value, in one direction or ` +
      `the other. A price like that clears the ${money(MIN_NET_DOLLARS)} minimum and is still a placeholder — ` +
      `and the maximum loss on screen would have been wrong by the same factor. Nothing is offered on a number ` +
      `the app would have to disbelieve to offer it.`;
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
    if (t.model > 0) parts.push(`${t.model} because ${lab.model}`);
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
    model: `the chain's price and the app's own model disagree by more than ${RULES.modelDisagreementRatio}x, `
      + `so one of them is describing a different structure`,
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
 * A PRICE HAS TO SURVIVE A SANITY CHECK, NOT JUST A FLOOR.
 *
 * `priceability()` above asks whether there is a price AT ALL, and it answers
 * with an absolute minimum. That minimum is now proven insufficient: the BOIL
 * 20/21 call spread that reached the broker on 17 September 2026 priced at
 * $0.05 — exactly `minNetPremium`, one cent above the line drawn to catch the
 * $0 butterfly — against a model value of $0.333. It cleared the floor by
 * rounding and was wrong by a factor of 6.7.
 *
 * So this is the THIRD question, after "is there a price" and before the
 * quality floors: DOES THE PRICE AND THE MODEL DESCRIBE THE SAME STRUCTURE?
 * The reasoning behind the ratio, and the table it was drawn from, is in
 * `RULES.modelDisagreementRatio`.
 *
 * FOUR RULES HOLD IT, and three of them are the same discipline as every other
 * check in this file:
 *
 *  1. UNKNOWN IS NOT DISAGREEMENT. Without a spot, a DTE and a volatility there
 *     is no model to compare against, and the check is SKIPPED rather than
 *     failed — exactly as the liquidity half skips on `oi: null` and the spread
 *     half skips on a one-sided quote.
 *  2. NOTHING IS JUDGED AGAINST A PRICE UNDER THE MINIMUM. Both sides have to
 *     clear MIN_NET_DOLLARS before a ratio is formed. A model net of pennies is
 *     not a valuation, it is the same rounding `rewardRisk()` refuses to divide
 *     by, and the measured error budget blows out precisely there.
 *  3. IT NAMES THE LEG. The refusal is useless as "the price is wrong": the
 *     screen has to say WHICH quote is responsible, so `worstLeg` is the leg
 *     whose own mark disagrees most, in dollars, with its own model price.
 *  4. IT IS A PROPOSAL FLOOR, NOT A GATE. It lives at the three generation
 *     sites beside `qualityFloor()` and it is deliberately NOT in
 *     `riskGate.js`: a trade the user builds by hand on the desk is his to
 *     make. What the desk owes him instead is the model value printed BESIDE
 *     the market value, so he can see what he is accepting.
 * ------------------------------------------------------------------------- */

/**
 * @param {object} arg
 *   legs   — [{ side, type, strike, qty }]
 *   net    — the structure's net PER SHARE off the chain, signed
 *            (`analyze().entry`). Positive is a debit.
 *   marks  — one market price per leg, aligned with `legs` (`analyze().legPx`'s
 *            `px`). Optional: without it the ratio is still computed, only
 *            `worstLeg` cannot be named.
 *   spot / dte / iv — what the model needs. Any of them missing skips the check.
 *   ratio  — the bar, overridable only so the tests can state it explicitly.
 * @returns {{ checked, pass, ratio, bar, marketNet, modelNet, worstLeg, reason }}
 *   dollars for ONE contract on `marketNet`/`modelNet`; `reason` is a finished
 *   English sentence with the numbers already in it, or null.
 */
export function modelSanity({
  legs = [], net = null, marks = [], spot = null, dte = null, iv = null,
  ratio = RULES.modelDisagreementRatio,
} = {}) {
  const skip = (why) => ({
    checked: false, pass: true, ratio: null, bar: ratio, marketNet: null,
    modelNet: null, worstLeg: null, reason: null, why,
  });
  const ls = Array.isArray(legs) ? legs : [];
  if (!ls.length) return skip("no-legs");
  if (!known(net)) return skip("no-net");
  // RULE 1: unknown is not disagreement. A model needs all three of these and
  // `Number(null)` is 0, which would silently price everything at a spot of
  // zero and refuse the whole board.
  if (!known(spot) || !known(dte) || !known(iv)) return skip("no-model");
  const S = Number(spot), D = Number(dte), V = Number(iv);
  if (!(S > 0) || !(D > 0) || !(V > 0)) return skip("no-model");

  const marketNet = Math.abs(Number(net)) * 100;
  let modelShare;
  try { modelShare = netBS(ls, S, D, V); } catch { return skip("no-model"); }
  if (!Number.isFinite(modelShare)) return skip("no-model");
  const modelNet = Math.abs(modelShare) * 100;

  // RULE 2: nothing is judged against a price under the minimum. The market
  // side under it is `priceability()`'s refusal, not this one's, and a model
  // side under it is a valuation of about nothing — the region where the
  // measured error budget runs from 0.11 to 2.8 and a ratio means nothing.
  if (marketNet < MIN_NET_DOLLARS || modelNet < MIN_NET_DOLLARS) {
    return { ...skip("below-minimum"), marketNet, modelNet };
  }

  const r = marketNet / modelNet;
  const bar = Math.max(1, Number(ratio) || RULES.modelDisagreementRatio);
  const pass = r >= 1 / bar && r <= bar;

  // RULE 3: name the leg. The leg whose own mark disagrees most, in dollars,
  // with its own model price at the same smile — which is the quote a person
  // would go and look at.
  let worstLeg = null;
  if (Array.isArray(marks) && marks.length === ls.length) {
    let worstGap = -1;
    ls.forEach((l, i) => {
      const m = marks[i];
      if (!known(m)) return;
      let theo;
      try { theo = bs(S, Number(l.strike), D / 365, smile(V, S, Number(l.strike)), l.type); }
      catch { return; }
      if (!Number.isFinite(theo)) return;
      const qty = Math.abs(Number(l.qty)) || 1;
      const gap = Math.abs(Number(m) - theo) * qty * 100;
      if (gap > worstGap) {
        worstGap = gap;
        worstLeg = {
          i, strike: Number(l.strike), type: l.type, side: Number(l.side) > 0 ? 1 : -1,
          mark: Number(m) * 100, model: theo * 100, gap,
          name: `${l.strike}${l.type === "put" ? "P" : "C"}`,
        };
      }
    });
  }

  const reason = pass ? null : modelSanityReason({ marketNet, modelNet, r, bar, worstLeg });
  return { checked: true, pass, ratio: r, bar, marketNet, modelNet, worstLeg, reason, why: null };
}

/** The refusal, as one finished sentence with the leg named in it. */
export const modelSanityReason = ({ marketNet, modelNet, r, bar = RULES.modelDisagreementRatio, worstLeg } = {}) => {
  const cheap = r < 1;
  const times = r > 0 ? (cheap ? 1 / r : r) : null;
  const how = times != null && Number.isFinite(times)
    ? `${times.toFixed(1)} times ${cheap ? "less" : "more"} than`
    : `nothing like`;
  const leg = worstLeg
    ? ` The ${worstLeg.name} is what does it: the chain marks it at ${money(worstLeg.mark)} a contract ` +
      `where the model says ${money(worstLeg.model)}, a gap of ${money(worstLeg.gap)} on that leg alone. ` +
      `That is the quote to go and look at.`
    : ``;
  return `The chain prices this structure at ${money(marketNet)} a contract and the model says ` +
    `${money(modelNet)} — ${how} it should be.${leg} A price ${cheap ? "that far under" : "that far over"} ` +
    `its own theoretical value is not ${cheap ? "a bargain" : "expensive"}, it is at least one leg quoted off ` +
    `a placeholder: ${money(marketNet)} was also what the maximum loss would have been shown as, and the real ` +
    `one would have been ${money(modelNet)}. Anything beyond ${bar}x either way is refused.`;
};

/** The one line a list prints in place of a structure the model disbelieved. */
export const modelDisagreementNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} ${n === 1 ? "was" : "were"} left out because the price on the chain and ` +
  `the app's own model disagree by more than ${RULES.modelDisagreementRatio}x${what ? ` on ${what}` : ""}. ` +
  `A net that clears the ${money(MIN_NET_DOLLARS)} minimum can still be a placeholder — the order that started ` +
  `this priced at ${money(MIN_NET_DOLLARS)} against a model value of ${money(33)} — and the maximum loss on ` +
  `screen would have been wrong by the same factor.`;

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
 *    AND IT WILL NOT NAME A BOARD THAT SETTLES TODAY. See `SETTLING_DTE`
 *    below: the sentence exists to describe a real trade-off, and an expiry
 *    at 0 or 1 DTE is not one of the alternatives anybody was weighing.
 *  - IT WILL NOT COUNT AN UNKNOWN AS A ZERO. An expiry whose open interest has
 *    not landed yet (Alpaca snapshots carry none until the contract-list call
 *    patches it in) is `clears: null`, not `clears: 0`. Unknown expiries are
 *    ranked on DTE alone and `measured` says so, because "we could not read
 *    this board" is not "this board is empty".
 * ------------------------------------------------------------------------- */

/**
 * THE NEAREST BOARD `passedOver` MAY NAME. An expiry at or below this is
 * excluded from the sentence entirely.
 *
 * `passedOver` exists to name a REAL TRADE-OFF the entry floor forced: a board
 * you could have built on, that is genuinely busier, that the 30-day floor took
 * away from you. An expiry that settles today or tomorrow is not that. Nobody
 * was choosing between a 45-day position and a contract with hours left on it —
 * there is no trade there to have been passed over, only a strip of open
 * interest that belongs to positions already being closed. Read live on
 * 2026-09-04, where the note offered "2026-09-04 is busier — 16 of 16 clear —
 * but it is only 0 days out": on the main screen that reads as a bug in the
 * app, not as a rule explaining itself, which is the opposite of what the
 * sentence is for.
 *
 * ONE, not zero, because expiry-day open interest does not vanish at midnight:
 * a board with a single day left is the same non-choice for the same reason.
 * It is deliberately NOT in `RULES` — it refuses nothing and sizes nothing, it
 * only decides whether one sentence is worth printing.
 */
const SETTLING_DTE = 1;

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
  // better: naming an expiry that is no thicker would be noise. A board that
  // settles today is not an alternative either — see `SETTLING_DTE`.
  const po = chosen == null ? null : all
    .filter((c) => c.dte > SETTLING_DTE && c.dte < minEntryDTE
      && c.clears != null && chosen.clears != null && c.clears > chosen.clears)
    .sort((a, b) => (b.clears - a.clears) || (b.dte - a.dte))[0] || null;
  // AND NOW IT IS OFFERABLE, NOT MERELY NARRATED. `passedOver` has been a
  // sentence on the screen naming a board the user was not allowed to take,
  // which is a door with no handle. A board in the WARNING band — past the
  // exit rule, under the entry floor — can be taken with a written reason
  // (`entryRoom()` below, and the gate). A board at or inside the exit rule
  // still cannot, by anybody, for any reason: it would open inside its own
  // exit window. The CHOICE is untouched — a passed-over board is never what
  // the app opens on by itself — only what the app lets you do about it.
  const passedOver = po ? { ...po, offerable: po.dte > RULES.exitDTE } : null;

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
  const p = choice.passedOver;
  const over = p
    ? ` ${p.key} is busier — ${p.clears} of ${p.near} clear — but it is only ${p.dte} days out, inside the ` +
      `${RULES.minEntryDTE}-day entry floor, so it is not what the app opens on.` +
      // THE SENTENCE NOW SAYS WHAT YOU MAY DO ABOUT IT. Naming a better board
      // and stopping there was the fault: past the exit rule it is a warning
      // with a door, at or inside it there is no trade to have.
      (p.offerable
        ? ` It is ${p.dte - RULES.exitDTE} day${p.dte - RULES.exitDTE === 1 ? "" : "s"} clear of the ` +
          `${RULES.exitDTE}-day exit rather than the ${RULES.minEntryDTE - RULES.exitDTE} the app aims for, ` +
          `so you can take it anyway by writing down why.`
        : ` Opening there would put the trade at or inside its own ${RULES.exitDTE}-day exit rule, so it is ` +
          `not offered to anybody.`)
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
  if (t.model > 0) bits.push(`${t.model} priced more than ${RULES.modelDisagreementRatio}x away from the model`);
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

/* =====================================================================
   THE AUTOPILOT'S VERDICT — WHICH RULE FIRED, WHAT IT SAYS, AND WHETHER
   ANYTHING MAY BE ACTED ON.

   This lives here for the reason every rule sentence does: the autopilot
   runs on a server nobody is watching, it writes the brief that the owner
   reads on his phone, and the difference between "a rule fired" and "here
   is a link that sends an order" is the whole of the safety of this app.
   A `.mjs` function is not the place to decide that.

   Three findings, and each one is a rule of action that was being written
   somewhere it could not be tested:

   1. THE STOP IS A WARNING IN THE PRD AND WAS AN ORDER IN THE CODE.
      PRD §4 downgraded the 50%-of-max-loss stop to an alert — "show a
      warning, do not auto-close, until backtest says otherwise" — and
      `RULES.stopLossEnforcement` has said `"warn"` since. The autopilot
      set `verdict = "STOP"` on it and then built an approve link, which
      is a one-tap close on the weakest-evidenced rule in the app. The
      backtest that would justify it is still NOT BUILT (PRD §4).

   2. A MODEL PRICE IS NOT A MARKET PRICE. When a leg is missing from the
      chain the mark is computed from Black-Scholes. That is a fine number
      to THINK with and a terrible one to ACT on: it is the app's own
      opinion of what the contract is worth, and an approve link built on
      it closes a real position at a price nobody quoted.

   3. A VERDICT IS NOT AN AUTHORISATION. `approvable` is separate from
      `verdict` on purpose. CLOSE_ALL can be the right call while the link
      is still refused, and the brief has to be able to say both.
===================================================================== */

/** The one home for how far a closing limit may walk from the mid. */
export const CLOSE_LIMIT_SLIPPAGE = RULES.closeLimitSlippage;

/** The same allowance for an order going ON. See `RULES.openLimitSlippage`. */
export const OPEN_LIMIT_SLIPPAGE = RULES.openLimitSlippage;

/** What the app calls a price it worked out itself. */
export const MODEL_PRICE = "model";

/**
 * WHERE THE MARK CAME FROM — and it must never be the feed's name when the
 * feed did not supply it.
 *
 * `markFromChain()` in the autopilot returns `net: null` unless EVERY leg was
 * found with a two-sided quote, and the caller then falls back to `netBS()`.
 * The brief went on reporting the feed's name whenever the chain had loaded at
 * all, so a position marked entirely by Black-Scholes was handed to the model —
 * and printed in the brief — as delayed market data.
 *
 * @param chainNet  the net the CHAIN produced, or null if it could not
 * @param feed      what to call the feed when it did produce one. The caller
 *                  names its own feed; this function never does (CLAUDE.md:
 *                  never write a feed's name into anything but `chain.js`).
 */
export function markProvenance(chainNet, feed = "the option chain") {
  const modelled = chainNet == null;
  return {
    modelled,
    source: modelled ? MODEL_PRICE : feed,
    note: modelled ? modelPriceNote(feed) : null,
  };
}

/** Why an estimated price is not something to act on, in one sentence. */
export const modelPriceNote = (feed = "the option chain") =>
  `This position's value is ESTIMATED: at least one leg had no two-sided quote on ${feed}, so the ` +
  `price here was worked out from a volatility model rather than read from the market. Every figure ` +
  `derived from it — the profit, the share of the maximum, the distance to the exit — is an estimate ` +
  `too, and nothing can be sent to the broker on it.`;

/**
 * THE STOP, IN THE WORDS THE PRD USES FOR IT.
 * A sentence, never a verdict: `stopLossEnforcement` is "warn" and this is what
 * warning looks like. The first clause is the phrase the brief and the screen
 * both carry, so the two cannot drift apart.
 */
export const stopWarningSentence = (pnl = null) =>
  `Stop threshold crossed — not validated by backtest` +
  `${pnl != null && Number.isFinite(+pnl) ? ` (${money(pnl)}, at or past ${pctText(RULES.stopLossPct)} of the maximum loss)` : ""}. ` +
  `Nothing closes on this and no order is offered for it. Closing here is your decision, and it is ` +
  `recorded as a manual close with the reason you write, never as a trade the rules ended.`;

/**
 * WHICH RULE ENDED A TRADE — and the stop is not one of them.
 *
 * The Journal counts "closed by the rules" as the app's one measure of
 * discipline, and it was counting a stop-warning close among them: `posAlerts`
 * raises the stop to level "action" so the row is impossible to miss, and
 * `closePos` read that level as "a rule said so". A warning the user chose to
 * act on is a decision, and filing it as obedience flatters the number that is
 * supposed to be the honest one.
 *
 * @returns { ruleExit, rule, text, stopWarning }
 */
export function ruleExitOf({ tpHit = false, dteExit = false, slHit = false, dteLeft = null } = {}) {
  if (tpHit) {
    return { ruleExit: true, rule: "take-profit", stopWarning: !!slHit,
      text: `Closed by the rules: ${pctText(RULES.takeProfitPct)} of the maximum profit was reached.` };
  }
  if (dteExit) {
    return { ruleExit: true, rule: "exit-dte", stopWarning: !!slHit,
      text: `Closed by the rules: inside the ${RULES.exitDTE}-day exit window` +
        `${dteLeft != null ? ` (${dteLeft} day${dteLeft === 1 ? "" : "s"} left)` : ""}.` };
  }
  return { ruleExit: false, rule: null, stopWarning: !!slHit, text: null };
}

/** The verdicts the model is allowed to return. STOP is deliberately absent. */
export const AUTOPILOT_VERDICTS = ["HOLD", "CLOSE_ALL"];

/**
 * THE VERDICT, AND WHETHER IT MAY BECOME AN APPROVE LINK.
 *
 * @param verdict   what the model said, already normalised to upper case
 * @param pctMax    percent of the maximum profit reached (null when unbounded)
 * @param pnl       profit or loss in dollars, SIGNED
 * @param maxLoss   the position's maximum loss, SIGNED (negative)
 * @param dteLeft   days to expiration
 * @param modelled  true when the mark came from the model, not from quotes
 * @returns { verdict, rule, rationale, warnings, approvable }
 */
export function autopilotVerdict({ verdict = "HOLD", pctMax = null, pnl = null,
  maxLoss = null, dteLeft = null, modelled = false } = {}) {
  const warnings = [];
  let v = String(verdict || "HOLD").toUpperCase();
  let rationale = null, rule = null;

  // A model that answers STOP is answering a question that is no longer asked.
  // The prompt no longer offers it; this is what happens if one comes back
  // anyway, and it is the same treatment the mechanical crossing gets below.
  if (v === "STOP") { v = "HOLD"; rationale = null; }
  if (!AUTOPILOT_VERDICTS.includes(v)) v = "HOLD";

  // 1) take profit — a rule of action, and it keeps its link.
  const tp = pctMax != null && Number.isFinite(+pctMax) && +pctMax >= RULES.takeProfitPct * 100;
  if (tp) {
    v = "CLOSE_ALL"; rule = "take-profit";
    rationale = `Rule: reached ${pctText(RULES.takeProfitPct)} of max profit.`;
  }

  // 2) the stop — NEVER a verdict, NEVER a link, ALWAYS a warning.
  const stopCrossed = pnl != null && maxLoss != null
    && Number.isFinite(+pnl) && Number.isFinite(+maxLoss) && +maxLoss < 0
    && +pnl <= RULES.stopLossPct * +maxLoss;
  if (stopCrossed) warnings.push(stopWarningSentence(pnl));

  // 3) the exit window — a rule of action, and it keeps its link.
  if (!tp && v === "HOLD" && dteLeft != null && Number.isFinite(+dteLeft) && +dteLeft <= RULES.exitDTE) {
    v = "CLOSE_ALL"; rule = "exit-dte";
    rationale = `Rule: inside the ${RULES.exitDTE} DTE exit window.`;
  }

  // 4) AN ESTIMATED PRICE CANNOT AUTHORISE AN ORDER. The trigger is real and is
  // reported as a warning; what it may not do is produce a one-tap close at a
  // price the market never quoted. The verdict goes back to HOLD so the brief
  // does not read as an instruction the app is refusing to act on.
  if (modelled && rule) {
    warnings.push(
      `${rule === "take-profit" ? `The ${pctText(RULES.takeProfitPct)} take-profit level` : `The ${RULES.exitDTE}-day exit window`} ` +
      `has been reached on an ESTIMATED price, so this is a warning and not a proposal: no order is offered. ` +
      `Check the position against a live chain before doing anything.`);
    v = "HOLD";
    rationale = `${rule === "take-profit" ? `The take-profit level` : `The exit window`} was reached on an estimated ` +
      `price. The rule is reported, not acted on.`;
    rule = null;
  }

  return {
    verdict: v, rule,
    // null means "no rule spoke": the caller keeps whatever the model said.
    rationale,
    warnings,
    // A link exists only for an action verdict reached on a real price.
    approvable: v !== "HOLD" && !modelled,
  };
}

/* =====================================================================
   THE PRICE A CLOSING ORDER IS SENT AT.

   A close used to go out as a MARKET order. On these chains that is not a
   price: BOIL quoted bid/ask spreads of 66%, 91%, 145% and 166% of the mid
   on strikes this app builds on, and a market order into a book that wide
   pays whatever the far side is asking. The whole app refuses to PRICE a
   candidate off a market that wide (`spreadFloor`), and then closed one at
   the touch.

   So a close is a limit, and the limit is computed AT TAP TIME from a fresh
   chain — never at proposal time, which can be a day earlier.
===================================================================== */

/**
 * THE CLOSING MARKET, READ OFF THE LEGS AND THEIR QUOTES.
 *
 * @param legs    [{ side, qty }] — the position AS HELD (side +1 long, -1 short)
 * @param quotes  [{ bid, ask }] one per leg, in the same order
 * @returns { ok, missing, netMid, spread }
 *
 * `netMid` is the net of the structure at the mids, SIGNED the way the position
 * is: positive for something you would sell to close, negative for something you
 * would buy back. `spread` is how wide the whole structure's market is.
 *
 * A LEG WITHOUT A TWO-SIDED QUOTE MAKES THE WHOLE THING UNREADABLE, and a bid
 * of zero is not a quote — it is the same test `priceability()` applies at
 * entry, for the same reason: nobody bidding means the mid is half of an ask
 * nobody agreed to. `ok` false means DO NOT SEND, and `missing` names which legs.
 */
export function closeMarket(legs = [], quotes = []) {
  const missing = [];
  let netMid = 0, spread = 0;
  (legs || []).forEach((l, i) => {
    const q = (quotes || [])[i] || {};
    const bid = Number(q.bid), ask = Number(q.ask);
    if (!Number.isFinite(bid) || !Number.isFinite(ask) || !(bid > 0) || !(ask > 0) || ask < bid) {
      missing.push(i); return;
    }
    const qty = Math.abs(Math.round(+(l && l.qty) || 0)) || 1;
    netMid += Math.sign(+(l && l.side) || 1) * qty * (bid + ask) / 2;
    spread += qty * (ask - bid);
  });
  const ok = missing.length === 0 && (legs || []).length > 0;
  return { ok, missing, netMid: ok ? netMid : null, spread: ok ? spread : null };
}

/**
 * THE LIMIT, STARTING AT THE MID AND NEVER WORSE THAN THE ALLOWANCE.
 *
 * The concession is `CLOSE_LIMIT_SLIPPAGE × (ask − bid)` summed over the legs,
 * and it is always subtracted from the SIGNED net, which is the same direction
 * in both cases and is why the arithmetic has no branch in it:
 *
 *   a long structure  netMid +3.00, spread 0.40 → +2.90  you receive 10c less
 *   a short structure netMid −3.00, spread 0.40 → −3.10  you pay 10c more
 *
 * `limit` is the MAGNITUDE, because that is what `orderBody()` sends: it takes
 * the absolute value and lets the legs' own sides say which way the money goes.
 *
 * The floor at one cent is the smallest price a broker takes. If the allowance
 * would drive the net through zero the structure is worth about nothing and the
 * order is priced at the minimum, which is honest: it is not worth chasing.
 */
export function closeLimitPrice({ netMid, spread, slippage = CLOSE_LIMIT_SLIPPAGE } = {}) {
  // `Number(null)` is 0 and 0 is finite — the trap this repository has written
  // down three times (the ceiling, the expiry choice, the probability). A
  // missing net is not a net of nothing; it is no price at all.
  if (netMid == null || spread == null) return null;
  if (!Number.isFinite(+netMid) || !Number.isFinite(+spread)) return null;
  const mid = +netMid;
  const allowance = Math.max(0, +spread) * Math.max(0, +slippage);
  const conceded = mid - allowance;
  const dir = Math.sign(mid) || -1;
  // FLOORED AT A CENT, AND NEVER FLIPPED ROUND. A structure worth +0.02 into a
  // 0.40-wide market would concede its way to −0.08, and since `orderBody()`
  // sends the MAGNITUDE and lets the legs say which way the money goes, that
  // 0.08 would reach the broker as "sell it for 8 cents" — four times BETTER
  // than the mid, on an order that was meant to concede. A concession that
  // turns the trade round is not a concession.
  const net = Math.sign(conceded) === dir && Math.abs(conceded) >= 0.01
    ? +conceded.toFixed(4)
    : dir * 0.01;
  return { netMid: mid, spread: +spread, slippage: Math.max(0, +slippage), allowance, net, limit: Math.abs(net) };
}

/** What the limit is, and where it came from, in one sentence for the page. */
export const closeLimitNote = (r) => {
  if (!r) return `The closing price could not be worked out, so nothing was sent.`;
  return `Limit ${money(r.limit * 100)} per combination, worked out just now from the live chain: ` +
    `the structure's mid is ${money(Math.abs(r.netMid) * 100)} and the two sides of its market are ` +
    `${money(r.spread * 100)} apart, so the order concedes ${pctText(r.slippage)} of that — ` +
    `${money(r.allowance * 100)} — and no more. It is a limit, not a market order: if nobody meets it ` +
    `the order sits, and the next run works the price out again from a fresh chain.`;
};

/** Why a close was refused before it was sent. */
export const closeUnreadableNote = (missing = [], legs = []) => {
  const n = missing.length;
  const which = missing.map((i) => {
    const l = (legs || [])[i] || {};
    return l.strike != null ? `${l.strike}${l.type === "put" ? "P" : "C"}` : `leg ${i + 1}`;
  }).join(", ");
  return `Nothing was sent. ${n === 1 ? "One leg has" : `${n} legs have`} no live two-sided quote right now` +
    `${which ? ` (${which})` : ""}, so the closing price cannot be read from the market — and a close priced ` +
    `off a guess is the thing this app refuses to do. Nothing has changed on the broker. The autopilot will ` +
    `work the price out again on its next run, when the market is quoting.`;
};


/* =====================================================================
   THE OPENING ORDER: WHAT THE MARKET IS, WHERE YOUR LIMIT SITS, AND HOW
   MUCH OF THE UNDERLYING YOU ARE ACTUALLY CONTROLLING.

   The owner's words, on the ticket as it stood: "it is not clear what price
   to put in the app, or what the information is, or how to choose it." The
   ticket offered a text field with the bare mid in it and nothing else — no
   book, no sense of which side of it a number falls on, and no notional.

   These four functions are what the ticket prints. They are here rather
   than in `pro.jsx` for the same reason `closeMarket()` is: a number a
   screen shows next to a limit price is part of the decision, and two
   screens deriving it separately is how they come to disagree.
===================================================================== */

/**
 * THE COMBO BOOK — the whole structure's bid, mid and ask, not leg by leg.
 *
 * Each leg is taken at THE SIDE THAT ACTUALLY TRADES. To buy the structure
 * you lift the ask on every leg you are buying and hit the bid on every leg
 * you are selling; to sell it, the other way round. Summing "the bids" and
 * "the asks" leg by leg would produce two numbers that belong to no trade
 * anybody can do.
 *
 * SIGNED THE WAY `analyze().entry` IS: positive is a debit (you pay),
 * negative is a credit (you are paid). So for a debit structure
 * `bid < mid < ask` reads as "the cheapest you might get it for" through to
 * "the most it would cost", which is the order a person reads them in.
 *
 * @param legs    [{ side, qty }] — side +1 you are buying, -1 you are selling
 * @param quotes  [{ bid, ask }] one per leg, in the same order
 * @returns {{ ok, missing, bid, mid, ask, spread }} — PER SHARE, like every
 *   other net in this file. `ok` false means at least one leg has no
 *   two-sided quote and there is no book to print; `missing` names which.
 */
export function comboBook(legs = [], quotes = []) {
  const missing = [];
  let bid = 0, mid = 0, ask = 0, spread = 0;
  const ls = Array.isArray(legs) ? legs : [];
  ls.forEach((l, i) => {
    const q = (quotes || [])[i] || {};
    const b = Number(q.bid), a = Number(q.ask);
    if (!Number.isFinite(b) || !Number.isFinite(a) || !(b > 0) || !(a > 0) || a < b) { missing.push(i); return; }
    const qty = Math.abs(Math.round(+(l && l.qty) || 0)) || 1;
    const side = Math.sign(+(l && l.side) || 1);
    // Buying the structure: pay the ask on longs, receive the bid on shorts.
    ask += qty * (side > 0 ? a : -b);
    // Selling it: receive the bid on longs, pay the ask on shorts.
    bid += qty * (side > 0 ? b : -a);
    mid += qty * side * (b + a) / 2;
    spread += qty * (a - b);
  });
  const ok = missing.length === 0 && ls.length > 0;
  return ok
    ? { ok, missing, bid, mid, ask, spread }
    : { ok: false, missing, bid: null, mid: null, ask: null, spread: null };
}

/**
 * THE OPENING LIMIT: START AT THE MID, CONCEDE A SHARE OF THE SPREAD.
 *
 * The mirror of `closeLimitPrice()`, with `openLimitSlippage` in place of
 * `closeLimitSlippage` — see both comments in `RULES` for why they are two
 * constants. The concession is ADDED to the signed net, which is the
 * direction that fills in both cases and is why there is no branch:
 *
 *   a debit  netMid +0.40, spread 0.20 → +0.45  you offer to pay 5c more
 *   a credit netMid −0.40, spread 0.20 → −0.35  you accept 5c less
 *
 * `limit` is the MAGNITUDE, because that is what `orderBody()` sends.
 *
 * A concession may never flip the sign, for the same reason it may not on a
 * close: a +0.02 debit conceded by 0.10 would price at −0.08, and the broker
 * reads the magnitude as "sell it for eight cents".
 */
export function openLimitPrice({ netMid, spread, slippage = OPEN_LIMIT_SLIPPAGE } = {}) {
  if (netMid == null || spread == null) return null;
  if (!Number.isFinite(+netMid) || !Number.isFinite(+spread)) return null;
  const mid = +netMid;
  const allowance = Math.max(0, +spread) * Math.max(0, +slippage);
  const dir = Math.sign(mid) || 1;
  const conceded = mid + dir * allowance;
  const net = Math.abs(conceded) >= 0.01 ? +conceded.toFixed(4) : dir * 0.01;
  return { netMid: mid, spread: +spread, slippage: Math.max(0, +slippage), allowance, net, limit: Math.abs(net) };
}

/** Where the opening limit came from, in one sentence for the ticket. */
export const openLimitNote = (r) => {
  if (!r) return `The market on this structure cannot be read on both sides, so there is no price to suggest: ` +
    `type one yourself, or wait until it is quoted.`;
  return `Suggested limit ${money(r.limit * 100)} a contract: the structure's mid is ` +
    `${money(Math.abs(r.netMid) * 100)} and the two sides of its market are ${money(r.spread * 100)} apart, so ` +
    `this concedes ${pctText(r.slippage)} of that — ${money(r.allowance * 100)} — in the direction that fills. ` +
    `A limit AT the mid is a limit nobody has to meet, and the only order this app has ever sent sat at one ` +
    `all day. Nothing walks the price further by itself: if this does not fill, you change it.`;
};

/**
 * WHERE THE TYPED LIMIT FALLS BETWEEN THE BID AND THE ASK — and one plain
 * sentence about what that means for the order.
 *
 * Read on the DEBIT convention and then mirrored, so both directions get the
 * same three answers:
 *
 *   at or past the ask  → "fills now"      you are paying what is being asked
 *   between mid and ask → "you are waiting" a real chance, not a certainty
 *   at or under the mid → "this will not fill" on a market this wide
 *
 * @param limit  the MAGNITUDE the user typed (the ticket's field)
 * @param book   `comboBook()`'s result
 * @param sign   +1 when the structure is a debit, -1 when it is a credit;
 *               taken from the book's own mid when not given
 * @returns {{ known, zone, label, sentence }} — `known` false when there is
 *   no book to place it against, which is a real state and not a failure.
 */
export function limitPlacement(limit, book, sign = null) {
  const L = Math.abs(Number(limit));
  if (!book || !book.ok || !Number.isFinite(L) || L <= 0) {
    return { known: false, zone: null, label: null,
      sentence: !book || !book.ok
        ? `There is no two-sided market on every leg right now, so the app cannot say where your price sits ` +
          `in it. That is also why it is not suggesting one.`
        : `Type a price and the app will say where it falls between the two sides of the market.` };
  }
  const dir = sign != null ? (Number(sign) >= 0 ? 1 : -1) : (book.mid >= 0 ? 1 : -1);
  const mid = Math.abs(book.mid);
  // `ask` is the price at which the structure AS BUILT trades right now — longs
  // lifted at their ask, shorts hit at their bid. `bid` is the reverse trade,
  // which is nobody's side of this one.
  const fill = Math.abs(book.ask);
  const rest = Math.abs(book.bid);

  // >>> THE DIRECTION OF "MORE AGGRESSIVE" INVERTS ON A CREDIT. <<<
  // On a debit you PAY, so a bigger number is a better offer and `fill` is the
  // LARGEST of the three magnitudes. On a credit you RECEIVE, so a smaller
  // number is the better offer and `fill` is the SMALLEST. Comparing magnitudes
  // with `>=` in both cases reads a credit exactly backwards: it would call a
  // limit demanding MORE than the market is offering "fills now", which is the
  // one sentence on this panel that must never be wrong. Every comparison below
  // goes through this, so there is one place the direction is decided.
  const keener = (a, b) => (dir > 0 ? a >= b : a <= b);
  const pay = dir > 0 ? "pay" : "accept";
  const away = Math.abs(L - fill);

  if (keener(L, fill)) {
    return { known: true, zone: "fills", label: "FILLS NOW",
      sentence: `At ${money(L * 100)} you are willing to ${pay} the whole of what the other side is offering ` +
        `(${money(fill * 100)}), so this should fill as soon as the market is open.` +
        (away >= 0.005
          ? ` You are ${money(away * 100)} past it — anything beyond the touch is money you did not have to give up.`
          : ``) };
  }
  // AT the mid is its own answer, and floating point will not give it to you
  // for free: the mid of two two-decimal quotes is 0.23000000000000004, so an
  // exact comparison against a typed 0.23 is false and the case that MATTERS
  // MOST — the limit this app actually sent — would fall through to a softer
  // sentence. Half a cent is under the smallest price a broker takes.
  const atMid = Math.abs(L - mid) < 0.005;
  if (atMid) {
    return { known: true, zone: "unlikely", label: "THIS WILL NOT FILL",
      sentence: `At ${money(L * 100)} you are exactly at the middle of the market. Nobody is obliged to meet ` +
        `the middle, and on a spread this wide (${money(book.spread * 100)}) nobody does: the only order this ` +
        `app has ever sent was a limit at the mid and it never filled.` };
  }
  if (keener(L, mid)) {
    return { known: true, zone: "waiting", label: "YOU ARE WAITING",
      sentence: `At ${money(L * 100)} you are between the middle of the market (${money(mid * 100)}) and what ` +
        `the other side is offering (${money(fill * 100)}). That is a real chance of a fill and not a promise: ` +
        `the order stands until somebody meets it or it expires.` };
  }
  // STRICTLY keener than the far touch. A buy limit sitting exactly ON the bid
  // does not cross it, it joins it — that is not a trade, it is a queue, and it
  // belongs with the prices that do not fill rather than with the ones that
  // might. Same on a credit: an offer exactly at the ask joins the offer.
  if (dir > 0 ? L > rest : L < rest) {
    return { known: true, zone: "unlikely", label: "YOU ARE WAITING, BARELY",
      sentence: `At ${money(L * 100)} you are on the wrong side of the middle (${money(mid * 100)}) — nearer ` +
        `the price you would get if you were on the other side of this trade. It can fill if the market moves ` +
        `to you. It will not fill because you waited.` };
  }
  return { known: true, zone: "no-fill", label: "THIS WILL NOT FILL",
    sentence: `At ${money(L * 100)} you are at or past the far side of the market (${money(rest * 100)}): that ` +
      `is the price somebody on the other side of this trade would take, not one anybody will trade with you ` +
      `at. The order will sit until it expires.` };
}

/**
 * NOTIONAL CONTROLLED — contracts × 100 × spot.
 *
 * The app has always computed this implicitly and never once shown it, and
 * the owner reads the product as having no leverage because of it. Ten
 * contracts of a $1 spread on a $20 underlying risks $1,000 and CONTROLS
 * $20,000 of BOIL. Both numbers are true and only one was ever on screen.
 *
 * It is deliberately not a rule and refuses nothing: it is the fact that
 * makes "capital at risk" mean something.
 */
export const notionalControlled = (contracts, spot) => {
  const n = Math.round(Number(contracts));
  const s = Number(spot);
  if (!Number.isFinite(n) || !Number.isFinite(s) || n <= 0 || s <= 0) return null;
  return n * 100 * s;
};

/** The sentence that goes beside it, with the risk it is standing next to. */
export const notionalNote = (notional, risk, ticker) => {
  if (notional == null) return `The notional cannot be worked out without a live price.`;
  const r = Math.abs(Number(risk));
  const mult = Number.isFinite(r) && r > 0 ? notional / r : null;
  return `${money(notional)} of ${ticker || "the underlying"} moves under this trade. You can only lose ` +
    `${Number.isFinite(r) ? money(r) : "the premium"}${mult != null ? `, so the position moves with ` +
      `${mult.toFixed(0)} times the money you have at risk` : ""} — that is what an option is, and it is ` +
    `the reason the per-trade limit is a percentage of capital rather than a feeling.`;
};


/* =====================================================================
   THE ENTRY FLOOR STOPS BEING A CLIFF.

   `minEntryDTE` is 30 and it was a HARD VIOLATION at 29. The quantity that
   actually matters is not the expiry, it is the ROOM BEFORE THE EXIT RULE
   FIRES: room = dte - exitDTE. Thirty days is nine days of room, and there
   is nothing about nine that is right and seven that is wrong — the number
   is an inherited tastytrade default like the rest of §4, and the app has
   never measured it.

   >>> THE NUMBER 30 IS NOT CHANGED IN THIS SESSION, DELIBERATELY. <<< What
   changes is what happens either side of it, so that a reading can be taken
   before the floor is moved (ROADMAP P5). Three bands:

     dte <= exitDTE                 HARD VIOLATION, unchanged in spirit. The
                                    position would open already INSIDE its own
                                    exit window: there is no trade there, only
                                    an instruction to close something you have
                                    just bought.
     exitDTE < dte < minEntryDTE    WARNING, carrying the number, and
                                    OVERRIDABLE WITH A TYPED REASON — the same
                                    mechanism `sizing()` uses for the per-trade
                                    cap, and the same constant
                                    (`minOverrideReasonChars`). The override
                                    and its reason go to the Journal.
     dte >= minEntryDTE             unchanged: nothing is said.

   WHY AN OVERRIDE AND NOT JUST A WARNING. Because the thing this unlocks is
   a real trade the app was refusing: `expiryChoice()` has been naming a
   nearer, busier board in `passedOver` and then not letting anybody take it.
   A sentence that describes a door and does not open it is worse than no
   sentence. And because a written reason is this app's one pattern for "you
   may, and it is recorded that you did".
===================================================================== */

/**
 * How much room a board gives before the exit rule fires, and which band it
 * falls in.
 *
 * @param dte  days to expiration at entry
 * @returns {{ known, dte, room, target, band, blocking }}
 *   band: "inside-exit" | "tight" | "clear"
 *   `blocking` is true only for "inside-exit"; "tight" blocks until a reason
 *   is written, which is the caller's question and not this function's.
 */
export function entryRoom(dte, {
  exitDTE = RULES.exitDTE, minEntryDTE = RULES.minEntryDTE,
} = {}) {
  if (!known(dte)) return { known: false, dte: null, room: null, target: minEntryDTE - exitDTE, band: null, blocking: false };
  const d = Math.round(Number(dte));
  const room = d - exitDTE;
  const target = minEntryDTE - exitDTE;
  const band = d <= exitDTE ? "inside-exit" : d < minEntryDTE ? "tight" : "clear";
  return { known: true, dte: d, room, target, band, blocking: band === "inside-exit" };
}

/** The hard refusal: the position would open inside its own exit window. */
export const entryInsideExitNote = (r) =>
  `${r?.dte ?? "This board"} days to expiration is at or inside the ${RULES.exitDTE}-day exit rule, so this ` +
  `trade would be opened with ${r && r.room > 0 ? `${r.room} day${r.room === 1 ? "" : "s"}` : "no days at all"} ` +
  `before it must be closed. That is not a short trade, it is an order to buy something and an order to sell ` +
  `it back, and this one is not overridable: the exit rule is chosen at construction and frozen, so there is ` +
  `no version of this position that the rule does not immediately end.`;

/** The warning in the middle band, with the number in it. */
export const entryRoomWarning = (r) =>
  `This board gives you ${r.room} day${r.room === 1 ? "" : "s"} before the ${RULES.exitDTE}-day exit fires; ` +
  `the app aims for ${r.target}. ${r.dte} days to expiration is under the ${RULES.minEntryDTE}-day entry ` +
  `floor — which is an inherited default, not a measured one, so it warns rather than refuses. Less room ` +
  `means the idea has less time to be right and time decay has more of the position to eat.`;

/** What it takes to take it anyway. */
export const entryRoomOverrideAsk = (r) =>
  `${entryRoomWarning(r)} Write why this expiry is worth taking — at least ` +
  `${RULES.minOverrideReasonChars} characters — and the trade unlocks. The reason is stored with the ` +
  `position and appears in the Journal, so a run of these can be read back later.`;

/** Whether a typed reason is enough to unlock it. One rule, one home. */
export const entryOverrideOk = (reason) =>
  String(reason || "").trim().length >= RULES.minOverrideReasonChars;

/** The Journal entry the override writes. */
export const entryOverrideNote = (r, reason) =>
  `Entered at ${r.dte} DTE, under the ${RULES.minEntryDTE}-day floor: ${r.room} day${r.room === 1 ? "" : "s"} ` +
  `of room before the ${RULES.exitDTE}-day exit, where the app aims for ${r.target}. ` +
  `Reason: "${String(reason || "").trim()}"`;

/* ---------------------------------------------------------------------
   INSTRUMENTING THE FLOOR SO IT CAN BE CALIBRATED LATER (ROADMAP P5).

   `expiryChoice()` names a nearer, busier board in `passedOver` and, from
   this session on, may offer it. How often that happens, on which market,
   and HOW MUCH busier the passed-over board was, is exactly the reading the
   30 was never chosen from. It is recorded rather than argued about.
--------------------------------------------------------------------- */

/**
 * One row for the Journal's record of a passed-over board.
 * @returns null when nothing was passed over — there is no event to log.
 */
export function passedOverRecord(ticker, choice) {
  const po = choice && choice.passedOver;
  const ch = choice && choice.chosen;
  if (!po || !ch) return null;
  const busier = known(po.clears) && known(ch.clears) ? Number(po.clears) - Number(ch.clears) : null;
  const factor = known(po.clears) && known(ch.clears) && Number(ch.clears) > 0
    ? Number(po.clears) / Number(ch.clears) : null;
  return {
    t: Date.now(), ticker: ticker || null,
    chosen: { key: ch.key, dte: ch.dte, clears: ch.clears ?? null, near: ch.near ?? null },
    passedOver: { key: po.key, dte: po.dte, clears: po.clears ?? null, near: po.near ?? null },
    busierBy: busier, busierFactor: factor,
    offerable: !!po.offerable,
  };
}

/** What the accumulated rows say, in one sentence for the Journal. */
export const passedOverSummary = (rows = []) => {
  const rs = (Array.isArray(rows) ? rows : []).filter(Boolean);
  if (!rs.length) return `The entry floor has not taken a busier board away from you yet — nothing to calibrate ` +
    `it from. This is the reading ROADMAP P5 needs, and it is collected as you use the app rather than argued for.`;
  const byTk = {};
  for (const r of rs) { const k = r.ticker || "?"; (byTk[k] ??= []).push(r); }
  const parts = Object.entries(byTk).map(([tk, xs]) => {
    const fs = xs.map((x) => x.busierFactor).filter((x) => Number.isFinite(x) && x > 0);
    const med = fs.length ? fs.slice().sort((a, b) => a - b)[(fs.length / 2) | 0] : null;
    return `${tk} ${xs.length}×${med != null ? ` (typically ${med.toFixed(1)}× busier)` : ""}`;
  });
  const offerable = rs.filter((r) => r.offerable).length;
  return `The ${RULES.minEntryDTE}-day entry floor has passed over a busier board ${rs.length} ` +
    `time${rs.length === 1 ? "" : "s"}: ${parts.join(", ")}. ${offerable} of those ` +
    `${offerable === 1 ? "was" : "were"} inside the warning band and could be taken with a written reason; ` +
    `the rest sat at or inside the ${RULES.exitDTE}-day exit rule and could not. The floor is an inherited ` +
    `default and this is what a measured one would be drawn from.`;
};

export default RULES;
