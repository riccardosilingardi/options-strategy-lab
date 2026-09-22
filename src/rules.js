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
import { netBS, bs, smile, terminalMC, seasonalDrift, seedFrom } from "./engine.js";
// WHICH WAY THE MONEY MOVES ON AN ORDER, read from its one home. `order.js`
// imports nothing, so this is leaf-ward exactly as the `engine.js` import above
// it is, and it is here for the same reason: `limitAgainstBook()` below has to
// know what direction an order of a given intent WOULD carry, and a second
// spelling of that rule is how the §4q fault came to be sent by five paths at
// once. The sign is decided in `limitDirection()` and nowhere else.
import { limitDirection } from "./order.js";

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

  // --- THE BAR THE AUTOPILOT WAITS FOR BEFORE PROPOSING ANYTHING UNPROMPTED.
  // Two sentences in `signals.js` quoted a bare 70 and named it "the
  // 70-confidence bar the autopilot needs". It had no home, and its VALUE
  // collides with `expensiveIVRank` above — which is why the rule-literal sweep
  // could not be pointed at that file: it would have named the wrong rule.
  // Homed here, unchanged in value, so the sweep can see the file at last.
  //
  // IT IS NOT `lowConfidence`, AND THE DIFFERENCE IS THE WHOLE POINT. 40 is the
  // bar under which the risk gate warns about a trade the USER asked for; 70 is
  // the bar above which the app is willing to raise a trade the user did NOT
  // ask for. A market at 55 is one you may take deliberately and one the app
  // will not bring to you on its own. CHOSEN, NOT MEASURED — nothing in this
  // repository has ever compared outcomes above and below it.
  autopilotConfidence: 70,

  // --- THE VOLATILITY THE EXIT SIMULATOR WALKS ON WHEN THE TABLE HAS NO ROW.
  // `SIGMA` in engine.js is hand-written per ticker; this is the number behind
  // it, and it was a bare `|| 0.25` in autopilot.mjs. CHOSEN, NOT MEASURED —
  // see FALLBACK_SIGMA below for what that means and what would settle it.
  fallbackSigma: 0.25,

  // --- THE IMPLIED VOLATILITY USED WHEN THE CHAIN DID NOT GIVE ONE, AND IT IS
  // A DIFFERENT QUANTITY FROM `fallbackSigma` ABOVE. They are the same number
  // today and they must never be merged into one: `fallbackSigma` is the
  // REALISED volatility the simulator walks the underlying's price on, while
  // this is the IMPLIED volatility the options themselves are PRICED at
  // (`netBS`, `bs`, `smile`). One is a property of the share, the other a
  // property of the option market on it, and on these chains they differ — BOIL
  // carries a realised sigma of 0.95 in `SIGMA` against an implied 0.85 in
  // `UNDERLYINGS`. Homing them in one constant would make a future correction
  // to either one silently move the other.
  //
  // It was a bare `|| 0.25` in `autopilot.mjs` and in `pro.jsx`. CHOSEN, NOT
  // MEASURED, and `ivProvenance()` below says which of the two produced the
  // number a screen or a brief is showing.
  fallbackIV: 0.25,

  // --- HOW MANY RUNS THE ONE CHANCE IS MADE OF.
  //
  // Every probability this app prints comes out of `chanceOf()` below, which is
  // a Monte Carlo — so this number is the precision of every CHANCE, every EV
  // and every distribution on every screen. It is ONE number and not two: the
  // Shortlist ranks many candidates and prints the chance of each, and a
  // cheaper count for ranking than for printing would mean the row you compared
  // and the row you opened disagreeing about the same trade.
  //
  // WHAT 8,000 COSTS, MEASURED. On the development machine one candidate takes
  // 0.54 ms at this count (0.24 ms at 2,000). The widest screen in the app —
  // the guided flow's pool, five markets x two families x the presets — reaches
  // about eighty candidates, so roughly 43 ms of arithmetic for the whole pool,
  // against the `analyze()` call each candidate already pays for. Dropping to
  // 2,000 would save about 25 ms and cost a standard error on each printed
  // percentage of 1.1 points instead of 0.55, which is visible at the whole
  // percent the screens round to. NOT VERIFIED ON A PHONE: there is no browser
  // in this sandbox, and a phone is the machine this app is demoed on.
  //
  // The sampling error is not a rounding error. At 8,000 runs a printed 50% is
  // 50% give or take about one point of the answer an infinite run would give —
  // the SAME one point for every screen, because the seed is the position's.
  mcRuns: 8000,

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

  // --- AND THE PAIR IS NOT THE LEGS. THE FOURTH FLOOR, BESIDE THE THIRD.
  //
  // maxComboSpreadShareOfNet — how far apart the two sides of THE WHOLE
  // STRUCTURE'S market may be, as a share of the net between them.
  //
  // >>> READ LIVE ON THE OWNER'S PHONE, UNG 2026-09-20, spot $10.42, the
  // 2026-10-23 board at 33 DTE. <<< Buy the 10.50 call at a mid of 0.48, sell
  // the 11.00 call at a mid of 0.34. Each leg was quoted about ten cents wide,
  // so each leg's own spread is 21% and 29% of its own mid and BOTH PASS
  // `maxSpreadShareOfMid` comfortably. The combination is bid $4, mid $14,
  // ask $24: a spread of $20, which is 143% OF ITS OWN MID — more than four
  // times the per-leg ceiling — and the app offered it.
  //
  // WHY THE PER-LEG TEST CANNOT SEE THIS. `spreadFloor()` takes the WORST SHARE
  // FOUND AMONG THE LEGS. On a vertical the two leg spreads ADD (you cross one
  // getting long and one getting short) while the two mids SUBTRACT, so the
  // share of the NET is roughly the sum of the leg spreads over the difference
  // of the leg mids. A structure whose legs are worth $48 and $34 and whose net
  // is worth $14 concentrates both spreads onto a seventh of the money: there
  // is no per-leg number that catches it without also refusing every leg on
  // these chains.
  //
  // IT SITS BESIDE THE PER-LEG FLOOR AND DOES NOT REPLACE IT, for the same
  // reason `priceability()`, `impossibleLoss()` and `modelSanity()` are four
  // separate questions with four separate counts. They are not the same fault:
  //   - a LEG 145% wide is a contract nobody can trade at a readable price,
  //     whatever it is combined with. That is the per-leg floor.
  //   - a PAIR 143% wide can be built entirely out of legs anybody would trade.
  //     What it says is that the round trip on THIS TRADE costs more than the
  //     trade is worth. That is this one.
  // Pooling their counts would explain neither, and a screen that cannot say
  // which of the two removed a structure cannot say what to do about it.
  //
  // WHY 1.0, AND IT IS A DIFFERENT ARGUMENT FROM 0.35 RATHER THAN A COPY OF IT.
  // At a share s the two sides differ by s of the number between them, so
  // ask = bid x (2 + s) / (2 - s): 0.35 is "the ask is at most 1.4 times the
  // bid" and 1.0 is "the ask is at most THREE times the bid". One is the bar
  // for a contract, which is quoted in its own right and trades all day; the
  // other is the bar for a combination, which is quoted as the arithmetic of
  // two contracts and is structurally wider on every chain in this basket. A
  // share of 1.0 is also the point at which the round trip costs the WHOLE of
  // what the structure is worth, and the point past which the mid every figure
  // on screen is computed from is further from both quoted sides than they are
  // from each other. The UNG pair above is 1.43 and is refused by 43%.
  //
  // CHOSEN, NOT MEASURED, and on the PRD's NOT VERIFIED list with the other
  // chosen numbers. What has NOT been read is the distribution of combination
  // spread over combination net on the five live chains — the same reading
  // `modelDisagreementRatio` is still waiting for, and for the same reason
  // (no broker keys in the sandbox). Expect a real reading to bring it DOWN.
  maxComboSpreadShareOfNet: 1.0,

  // --- WHEN A POSITION ASKS TO BE LOOKED AT. The share of the maximum loss the
  // position has to be down before the Positions screen marks it "watch"
  // instead of "ok". It refuses nothing, sends nothing and closes nothing: it
  // is a colour and a word on a row, one step below the "action" level the real
  // rules (take profit, the exit window, an autopilot proposal) produce.
  //
  // IT IS NOT THE STOP, AND IT IS NOT THE SPREAD FLOOR. The stop warning fires
  // at `stopLossPct` (half the maximum loss); this is the earlier, quieter
  // notice that the trade is going the wrong way. Its VALUE happens to equal
  // `maxSpreadShareOfMid` above, and that collision is the reason the spread
  // floor was the one rule number kept off the sweep list — a guard that named
  // the wrong rule on this line would be worse than one that missed it. With
  // this home the collision is harmless and the spread floor is back on the
  // list.
  //
  // CHOSEN, NOT MEASURED. Nothing has compared what happened to positions that
  // crossed it against positions that did not.
  watchAttentionShare: 0.35,

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

/* =========================================================================
   ONE CHANCE, ONE ARITHMETIC — THIS IS THE ONE PLACE IT IS COMPUTED.

   `terminalMC()` in engine.js is the arithmetic; this is the policy around it,
   and it lives here for the same reason `modelSanity()` does: engine.js imports
   nothing and may not read RULES, so the run count, the drift and the seed are
   assembled at the one place that already reads the home.

   WHAT THE APP DECIDED, AND WHAT IT DID NOT.

   * THE DRIFT IS THE APP'S OWN SEASONAL THESIS, not the risk-neutral 4.5% the
     two deleted closed forms used. That is ROADMAP P2's house distribution
     arriving early, in its first half: the seasonality this app scores markets
     on now enters the probability it prints about them. P2 still owes the other
     half — REALISED volatility measured from returns instead of the hand-written
     `SIGMA` table.
   * THE VOLATILITY IS THE MARKET'S IMPLIED ONE, read off the structure's own
     legs. The market says how wide the distribution is; the app's thesis says
     which way it leans. Every price in this app — `analyze()`, `netBS()`, the
     model sanity check — is already worked out at that implied volatility, so
     anything else here would price the trade at one number and judge it at
     another.
   * THE SEED IS THE POSITION'S. Ticker, expiry, legs and the spot rounded to
     the cent: the same trade gives the same seed gives the same number, on the
     Radar, on the Shortlist, on Build, in the Guardian and in the autopilot's
     brief. An unseeded Monte Carlo would hand each of them a different answer
     for one object, which is the fault this file exists to prevent, engineered
     in on purpose.
   * UNKNOWN IS NOT A NUMBER. No spot, no horizon, no volatility or no seasonal
     table and the answer is `null`, which every screen prints as a dash.
     `Number(null)` is 0 and 0 is finite — a missing chance must never arrive as
     a confident 0%.
========================================================================= */

/**
 * The key the Monte Carlo is seeded from. Stable across screens and across the
 * client/server boundary, and it MOVES when the trade moves: a different strike
 * or a different expiry is a different trade and gets its own stream.
 *
 * The spot is rounded to the cent so that a quote wobbling in the third decimal
 * between two renders does not re-roll the whole simulation under the reader.
 */
export const chanceSeedKey = ({ ticker = "?", expKey = "?", legs = [], spot = 0, dte = 0 } = {}) =>
  [ticker, expKey, Math.round(dte),
    (legs || []).map((l) => `${Math.sign(l.side)}${l.type === "call" ? "C" : "P"}${l.strike}x${l.qty}`).join(","),
    (Math.round(Number(spot) * 100) / 100).toFixed(2)].join("|");

/**
 * THE CHANCE OF PROFIT, AND EVERYTHING THAT COMES WITH IT.
 *
 * @param legs        [{ side, type, strike, qty }]
 * @param entryNet    what the structure cost per share (negative for a credit)
 * @param spot        today's price
 * @param iv          the structure's own implied volatility (chain average)
 * @param dte         days to expiry
 * @param seasonal    a `seasonalProvenance()` RESULT, never a bare row of means:
 *                    the drift is the one input the market has no say in, so the
 *                    chance may not be computed without knowing whose table it
 *                    came from. A caller handing twelve numbers straight in is a
 *                    programmer error and THROWS, the same discipline as
 *                    `terminalMC()` throwing without an exit policy.
 * @param month       the month the window starts in, 0-11
 * @param ticker      part of the seed, and what the fallback sentence names
 * @param expKey      part of the seed
 * @param thesisIV    an implied volatility the position remembered, if any
 * @returns the `terminalMC` result plus `{ ivSource, ivNote, seedKey }` and the
 *          seasonal stamp (`seasonalSource`, `seasonalMeasured`, `seasonalYears`,
 *          `seasonalAgeDays`, `seasonalNote`), or null when there is nothing to
 *          simulate — including when there is no seasonal reading at all.
 */
export function chanceOf({ legs, entryNet, spot, iv, dte, seasonal, month,
  ticker = "this market", expKey = null, thesisIV = null } = {}) {
  // THE SHAPE IS CHECKED BEFORE ANYTHING ELSE, and it throws rather than
  // returning null: a missing INPUT is a dash on screen, a missing PROVENANCE
  // is a call site that would print a number nobody can trace.
  if (!seasonal || typeof seasonal !== "object" || Array.isArray(seasonal) || typeof seasonal.source !== "string") {
    throw new Error("chanceOf needs a seasonalProvenance() result as `seasonal`, never a bare row of monthly means: see src/rules.js");
  }
  if (!Array.isArray(legs) || !legs.length) return null;
  if (!Number.isFinite(entryNet) || !(spot > 0) || !(dte > 0)) return null;
  // NO SILENT SUBSTITUTION. No table at all means no chance — not a drift of
  // zero, which would be a confident claim that the market goes nowhere.
  if (seasonal.missing) return null;
  const driftAnnual = seasonalDrift(seasonal.monthlyMean, month, dte);
  if (!Number.isFinite(driftAnnual)) return null;
  const vol = ivProvenance(iv, thesisIV, ticker);
  const seedKey = chanceSeedKey({ ticker, expKey, legs, spot, dte });
  const mc = terminalMC(legs, entryNet, spot, {
    driftAnnual, sigma: vol.iv, dte, runs: RULES.mcRuns, seed: seedFrom(seedKey),
  });
  return { ...mc, ivSource: vol.source, ivNote: vol.fromFallback ? vol.note : null, seedKey,
    seasonalSource: seasonal.source, seasonalMeasured: seasonal.measured,
    seasonalYears: seasonal.years, seasonalAgeDays: seasonal.ageDays, seasonalNote: seasonal.note };
}

/**
 * One sentence saying what the chance on screen is an answer about. It names
 * the drift, because the drift is what changed and what every one of these
 * numbers now depends on — AND IT NAMES WHOSE TABLE THE DRIFT CAME FROM.
 *
 * It used to say "${ticker}'s own seasonal reading" whatever the source was,
 * which is true of a measured series and false of the hand-written row: that
 * row is a guess somebody typed, not a reading of ${ticker}. `seasonalNote` is
 * the one sentence and it is generated where the decision was made, so this
 * cannot drift from what the Radar says about the same market.
 */
export const chanceSourceNote = (mc, ticker = "this market") => {
  if (!mc) return "There is no chance to show: something this calculation needs — a price, a horizon or a seasonal reading — is missing.";
  return `Out of ${mc.runs.toLocaleString("en-US")} simulated runs, priced at ${pctText(mc.sigma)} implied volatility ` +
    `and drifting at ${pctText(mc.driftAnnual)} a year over the window this trade is held for, not a ` +
    `market-neutral assumption. ` +
    (mc.seasonalNote || seasonalSourceSentence({ measured: !!mc.seasonalMeasured, ticker,
      years: mc.seasonalYears ?? null, ageDays: mc.seasonalAgeDays ?? null }));
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
    if (t.comboSpread > 0) parts.push(`${t.comboSpread} because ${lab.comboSpread}`);
    if (t.reward > 0) parts.push(`${t.reward} because ${lab.reward}`);
    if (t.unpriceable > 0) parts.push(`${t.unpriceable} because ${lab.unpriceable}`);
    if (t.impossible > 0) parts.push(`${t.impossible} because ${lab.impossible}`);
    if (t.model > 0) parts.push(`${t.model} because ${lab.model}`);
    // WHICH RULE DID THE WORK. `unpriceable` and `impossible` are counted here
    // so a mixed board can be explained in one screen, but they are NOT the
    // floors and the sentence must not say they are: a structure whose price
    // could not be read never reached a floor, and one that could not lose was
    // refused before either floor looked at it.
    const byFloor = (t.liquidity > 0 || t.spread > 0 || t.comboSpread > 0 || t.reward > 0);
    const lead = byFloor
      ? `was filtered out by the quality floors`
      : `was refused before the quality floors were even applied`;
    return `Every structure that fit your answers on ${markets || "the markets you picked"} ` +
      `${lead}: ${parts.join(", and ")}. ` +
      `Those floors are the difference between a price and a market. Nothing here today is the honest answer, ` +
      `and it is a better one than a trade nobody else is willing to take the other side of.`;
  },
};

/* --------------------------------------------------------------------
   THE WARNINGS, ONCE.

   >>> COUNTED ON THE OWNER'S PHONE, one Build screen, UNG. <<< The four-factor
   CONFLICT paragraph — the same ~400 characters — appeared FOUR TIMES on that
   single page: inside "Why this trade", again in the amber against-the-signal
   block, again in the order ticket's warning list, and again in "The checks
   that run when you tap". The gate embeds `signals.narrative` in its
   SIGNAL_CONFLICT warning because the gate has no screen; every surface that
   renders a gate verdict then prints the paragraph a second time beside the
   panel that already carries it.

   The gate is NOT changed for a copy problem. What changes is what a screen
   PRINTS: the narrative has one home — the evidence panel — and everywhere
   else on the same page carries the summary line with the number in it.
-------------------------------------------------------------------- */

/** The one line that stands in for the paragraph, with the count in it. */
export const conflictSummaryLine = (clash, fused) => {
  const n = Number(clash?.n), total = Number(clash?.total);
  const conf = Number(fused?.confidence ?? clash?.confidence);
  const agree = fused?.agreement || clash?.agreement || null;
  const bits = [];
  if (Number.isFinite(n) && Number.isFinite(total)) bits.push(`${n} of ${total} factors read against this trade`);
  else if (agree) bits.push(`the four factors read ${agree}`);
  if (Number.isFinite(conf)) bits.push(`confidence ${Math.round(conf)}/100`);
  return `${bits.join(" · ") || "The four-factor reading needs looking at"}. The full reading is in "Why this trade" above.`;
};

/**
 * The warnings to PRINT on a screen that already shows the narrative.
 *
 * Pure string surgery and deliberately nothing more: the gate's verdict, its
 * codes and its pass/fail are untouched — this only stops one page printing
 * the same paragraph twice. A warning that does not contain the narrative
 * comes back exactly as it was.
 *
 * @param warnings  the gate's `warnings` array
 * @param narrative `fused.narrative`, the paragraph that has its own home
 * @param pointer   what to say instead, usually `conflictSummaryLine()`
 */
export function warningsToPrint(warnings = [], { narrative = null, pointer = null } = {}) {
  const nar = typeof narrative === "string" ? narrative.trim() : "";
  const list = Array.isArray(warnings) ? warnings : [];
  if (!nar) return list.slice();
  const seen = new Set();
  return list.map((w) => {
    const msg = String(w?.message ?? "");
    if (!msg.includes(nar)) return w;
    const trimmed = msg.replace(nar, "").replace(/\s+/g, " ").trim();
    const tail = pointer && !seen.has("pointer") ? ` ${pointer}` : "";
    seen.add("pointer");
    return { ...w, message: `${trimmed}${tail}`.trim(), narrativeRemoved: true };
  });
}

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
    comboSpread: `the two sides of the WHOLE combination are more than ` +
      `${pctText(RULES.maxComboSpreadShareOfNet)} of its net apart, even though each leg on its own is fine`,
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
  return `${liq} Every leg here is also quoted within ${pctText(RULES.maxSpreadShareOfMid)} bid to ask, the ` +
    `WHOLE combination within ${pctText(RULES.maxComboSpreadShareOfNet)} of its own net — two leg spreads land ` +
    `on one net, so a pair of ordinary legs can still be unaffordable — and ` +
    `everything here pays at least ${pctText(RULES.minRewardRisk)} of what it risks. Open interest is how many ` +
    `contracts are actually open and the spread is how far apart the two sides are today: a contract nobody ` +
    `trades is a quote and not a market, and a market that wide has no agreed price to be the middle of. ` +
    `The spread ceiling does not move with this setting. ` +
    `Setting: ${l.label.toUpperCase()}${l.recommended ? " (the app's recommendation)" : ""}.`;
};

/** The one line that says which setting produced the list underneath it. */
/* =====================================================================
   THE RADAR MUST NOT GET LONGER WHEN THE BASKET DOES.

   Read on the owner's phone: SOYB and CORN produced "0 of 2 shown" and most of
   the screen was a paragraph per market explaining why that market had nothing
   on it. The basket went from five to ten with the liquid tier, and ten copies
   of "not searched yet — use the search below" is not a radar, it is a wall.

   A market with something on it keeps its full row. Every market with nothing
   collapses into ONE line, which names them and says which of the two things
   happened — nobody has looked, or somebody looked and nothing cleared. Those
   are different facts and the line keeps them apart, exactly as
   `unloadedBoardNote()` keeps "no board" apart from "nothing cleared on this
   board". Every name in the line is still one tap from its market; nothing is
   removed from the app, only from the page.

   IT COLLAPSES EVEN WHEN EVERY MARKET IS QUIET. A first run has searched
   nothing, so nothing has a full row — and a list of ten identical rows saying
   "not searched yet" is exactly the screen this exists to stop. One line with
   ten names in it is shorter and says the same thing once.
===================================================================== */

/**
 * >>> LOOKED AT IS NOT NOT-SEARCHED, AND THAT WAS ON THE OWNER'S PHONE. <<<
 * Read 21 September 2026, one screen, two sentences four lines apart:
 *
 *     "You asked about 10 markets … 4 of them came through to the shortlist
 *      (BOIL, WEAT, XLE and USO)."
 *     "8 markets with nothing to show — not searched yet: BOIL, USO, UNG, …"
 *
 * BOIL and USO are in both. The guided run priced their boards and their
 * candidates cleared every floor; they simply were not the two roads it took
 * forward. `marketFacts` only ever knew about roads, the wide search's hits and
 * the markets the floors emptied, so a market the guided run looked at and did
 * not choose fell through to "nobody has looked". Collapsing the quiet markets
 * into one line put those two sentences next to each other, which is how a
 * long-standing gap became a visible contradiction.
 *
 * @param rows  `[{ tk, n, cut, searched }]` — `n` structures on screen for it,
 *              `cut` true when the floors emptied it, `searched` true when
 *              anything in this session actually read its board. None of the
 *              three is a count this function makes.
 * @returns {{ shown: object[], quiet: object[], empty: string[], notSearched: string[] }}
 */
export function radarSplit(rows = []) {
  const rs = Array.isArray(rows) ? rows : [];
  const shown = rs.filter((r) => Number(r?.n) > 0);
  const quiet = rs.filter((r) => !(Number(r?.n) > 0));
  return {
    shown, quiet,
    // LOOKED AT AND EMPTY is not NEVER LOOKED AT, and one word for both would
    // make the app report a market verdict it never reached — or deny having
    // read a board it named in the paragraph above.
    empty: quiet.filter((r) => r?.cut || r?.searched).map((r) => r.tk),
    notSearched: quiet.filter((r) => !(r?.cut || r?.searched)).map((r) => r.tk),
  };
}

/** The one line, or null when every market has a row of its own. */
export const radarQuietNote = (split) => {
  const s = split || {};
  const empty = s.empty || [], notSearched = s.notSearched || [];
  const n = empty.length + notSearched.length;
  if (!n) return null;
  const bits = [];
  // "NOTHING CLEARED" WOULD BE A VERDICT THIS LINE CANNOT SUPPORT. A market is
  // in this group when the floors emptied it OR when its structures cleared and
  // were not taken forward, and those are different facts with one thing in
  // common: there is nothing on the Radar for it. The sentence claims only that.
  if (empty.length) bits.push(`looked at, nothing on the radar: ${empty.join(", ")}`);
  if (notSearched.length) bits.push(`not searched yet: ${notSearched.join(", ")}`);
  return `${n} market${n === 1 ? "" : "s"} with nothing to show \u2014 ${bits.join(" \u00b7 ")}.`;
};

export const liquiditySettingNote = (level, counts) => {
  const l = liquidityLevel(level?.id ?? level);
  const c = counts || {};
  const shown = c.kept != null ? `${c.kept} shown` : null;
  const bits = [];
  if (c.liquidity > 0) bits.push(`${c.liquidity} removed for liquidity`);
  if (c.spread > 0) bits.push(`${c.spread} removed for a bid/ask spread over ${pctText(RULES.maxSpreadShareOfMid)} of the mid`);
  if (c.comboSpread > 0) bits.push(`${c.comboSpread} removed for a combination spread over ${pctText(RULES.maxComboSpreadShareOfNet)} of its net`);
  if (c.reward > 0) bits.push(`${c.reward} removed for reward-to-risk`);
  if (c.skipped > 0) bits.push(`${c.skipped} not liquidity-checked (the feed reports no open interest)`);
  if (c.spreadSkipped > 0) bits.push(`${c.spreadSkipped} not spread-checked (the feed quoted only one side)`);
  if (c.comboSpreadSkipped > 0) bits.push(`${c.comboSpreadSkipped} not combination-spread-checked (no two-sided book on every leg)`);
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
 * A CONTRACT THE FEED NEVER LISTED IS UNKNOWN, NOT A WELL-FORMED SYMBOL.
 *
 * >>> READ LIVE ON THE OWNER'S PHONE, SOYB, 20 Sep 2026, 21:49, spot $27.64,
 * the 2026-11-20 board. <<< The fourth order this app has ever sent did not
 * reach the market at all:
 *
 *     HTTP 422 · code 42210000
 *     invalid legs: [leg.0 asset "SOYB261120C00027500" not found]
 *
 * That symbol is perfectly well formed. Nobody has ever issued it. Four of the
 * six order paths spelled
 *
 *     const occ = q?.occ || buildOcc(ticker, expKey, l.type, l.strike);
 *
 * and `buildOcc()` FORMATS a symbol out of a strike the app chose. It cannot
 * know whether anybody lists it — only the chain knows that — so an unquoted
 * leg made the app name a contract that does not exist and ask the broker to
 * trade it. The app created the refusal itself.
 *
 * THIS IS THE RULE THE REST OF THIS FILE ALREADY KEEPS. A missing open interest
 * is UNKNOWN and never zero. A missing quote size is UNKNOWN and never zero. A
 * missing drift is UNKNOWN and never a confident zero. A contract the feed did
 * not list is UNKNOWN and never a well-formed symbol.
 *
 * `buildOcc()` STAYS. Naming a contract is legitimate — the Journal and the
 * option-history panel have to be able to write one down — but naming one is
 * not the same as asserting it trades, and no ORDER PATH may reach the broker
 * with a symbol the chain did not supply.
 *
 * IT BELONGS IN THE GATE, not only in a component, because four paths made the
 * same mistake and the gate is the one place all six pass through. It is the
 * same KIND of question as "is there a price at all" — which is already in the
 * gate — and not the same kind as the quality floors, which stay out of it: a
 * hand-built trade is the user's to make, but a contract that does not exist is
 * not a trade at all.
 * ------------------------------------------------------------------------- */

/** `22.5C`, `19P` — how a leg is named in a sentence. One spelling. */
export const legName = (l) => `${l && l.strike}${l && l.type === "call" ? "C" : "P"}`;

/**
 * DID THE CHAIN LIST EVERY CONTRACT THIS ORDER NAMES?
 *
 * @param legs  [{ side, type, strike, qty }]
 * @param occs  one entry per leg, aligned with `legs`: the OCC symbol the CHAIN
 *              gave for that contract, or null where it gave none. Passing no
 *              array at all means the caller cannot answer the question and
 *              nothing is tested (`checked: false`) — the same discipline
 *              `priceability()` applies to `quotes`. An EMPTY array beside real
 *              legs is an answer: the chain listed nothing.
 * @returns {{ checked, listed, missing, reasons }}
 */
export function contractListing({ legs = [], occs = null } = {}) {
  const ls = Array.isArray(legs) ? legs : [];
  if (!Array.isArray(occs) || !ls.length) {
    return { checked: false, listed: true, missing: [], reasons: [] };
  }
  const missing = [];
  ls.forEach((l, i) => {
    const s = occs[i];
    if (typeof s !== "string" || !s.trim()) missing.push({ i, leg: l, side: Math.sign(+(l && l.side) || 1) });
  });
  return {
    checked: true,
    listed: missing.length === 0,
    missing,
    reasons: missing.length ? [unlistedContractNote(missing, ls.length)] : [],
  };
}

/** The refusal, with the leg in it. "Which leg" is the only actionable half. */
export const unlistedContractNote = (missing = [], total = 0) => {
  const ms = Array.isArray(missing) ? missing : [];
  if (!ms.length) return "";
  const names = ms.map((m) => `${legName(m.leg)}${m.side < 0 ? " you would be selling" : " you would be buying"}`).join(", ");
  return `The option chain never listed ${ms.length === 1 ? "the" : "the"} ${names}${total ? ` (${ms.length} of ${total} leg${total === 1 ? "" : "s"})` : ""}, ` +
    `so the app would have to invent ${ms.length === 1 ? "its symbol" : "their symbols"} to send this order — and a symbol it ` +
    `invented is exactly what the broker refused on 20 September, by name, before the order reached the market. A contract ` +
    `the feed did not give us is UNKNOWN, not a contract that exists at a price of nothing: only the chain knows which ` +
    `strikes are really issued on this board. Pick a strike the board carries, or reload the chain for this expiry.`;
};

/** The one line a list prints in place of a structure it could not name. */
export const unlistedContractListNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} named a contract the chain never listed${what ? ` on ${what}` : ""}. ` +
  `A well-formed symbol is not an issued one, and the app does not make one up.`;

/* -------------------------------------------------------------------------
 * ONE FACT, ONE PLACE, ON ONE SCREEN.
 *
 * "One leg has no two-sided quote" was printed TWICE on the Build screen — once
 * by the leg table and once by the combination panel — inside the panel PR #28
 * built to stop the CONFLICT paragraph appearing four times. Deduplicating
 * warnings needs a RULE, not another pass, and the rule is the one
 * `warningsToPrint()` already uses: the fact keeps its home where the legs are
 * NAMED, and everywhere else points at it.
 * ------------------------------------------------------------------------- */

/** The full sentence. It belongs where the legs are named, and nowhere else. */
export const unquotedLegNote = (n) =>
  `${n === 1 ? "One leg has" : `${n} legs have`} no two-sided quote at all, so there is no side of ` +
  `${n === 1 ? "it" : "them"} that trades and no combination price to place your own against.`;

/** What every OTHER place on the same screen prints instead of repeating it. */
export const unquotedLegPointer = (n) =>
  `No combination price: ${n === 1 ? "one leg is" : `${n} legs are`} not quoted on both sides. The leg table above ` +
  `says which, and says it once.`;

/* -------------------------------------------------------------------------
 * A MARKET ORDER TAKES WHATEVER IS THERE, AND ON THESE CHAINS THAT IS THE
 * POINT. The fourth order was sent MARKET on a structure with an unquoted leg,
 * on boards this repository has measured at 66-166% of the mid. Everything the
 * ticket builds — the per-leg sliders, the net, the verdict band — is bypassed
 * the moment it is chosen, so the choice has to carry its own sentence.
 * ------------------------------------------------------------------------- */
export const marketOrderNote = (book = null) => {
  const wide = book && book.ok && Math.abs(book.mid) > 0 ? book.spread / Math.abs(book.mid) : null;
  return `A market order has no price. It takes whatever the book is showing when it arrives, ` +
    `${wide != null ? `and this book is ${pctText(wide, 0)} of its own mid wide` : `and this book is not quoted on both sides, so there is no touch to take`} — ` +
    `the sliders, the net and the verdict band above are all bypassed. On these chains that is how a ` +
    `${money(MIN_NET_DOLLARS)} structure gets filled at several times what it is worth. Use a limit unless you ` +
    `have a reason not to.`;
};

/** Where a strike moved because the board it moved to does not carry it. */
export const strikeSnapNote = (moved = [], expKey = null) => {
  const ms = Array.isArray(moved) ? moved : [];
  if (!ms.length) return null;
  return `${ms.length === 1 ? "One strike was" : `${ms.length} strikes were`} moved onto ` +
    `${expKey ? `the ${expKey} board` : "this board"}: ${ms.map((m) => `${m.from} → ${m.to}`).join(", ")}. ` +
    `Strikes are a property of the board, not of the trade, and a leg carried over from another expiry can name a ` +
    `contract this one does not list. That is the symbol the broker refused on 20 September.`;
};

/**
 * WHAT THE DROPDOWN CALLS A STRIKE THE BOARD DOES NOT LIST.
 *
 * `strikeOptions()` in chain.js decides WHICH options a strike select may
 * offer; this is the one place the words for the odd one out are written, so
 * a component cannot invent a softer phrasing for it. It is deliberately
 * flat: the leg is still shown, still selected and still editable — it simply
 * cannot be chosen, because choosing it would be choosing a contract nobody
 * issued. The gate's `UNLISTED_CONTRACT` is what actually stops the order;
 * this stops the SCREEN from quietly showing a different strike instead.
 */
export const offBoardStrikeLabel = (strike) => `${strike} \u00b7 not on this board`;

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

/** Why the app is on this expiry, in one sentence, with the counts in it.
 *
 * >>> IT NAMES THE BOARD THAT IS SELECTED, NOT THE ONE THE APP WOULD HAVE
 * PICKED (P9, TASK 1). <<< Read on the owner's phone: the expiry dropdown said
 * 2026-10-16 and this sentence, directly underneath it, said "Building on
 * 2026-11-20". Both were true — the dropdown carried a board handed over by
 * the wide search, and this described `choice.chosen` — and together they were
 * a screen contradicting itself about which trade it was showing.
 *
 * @param selected  the expiry the screen is actually on. When it differs from
 *        the app's own choice, the sentence says so and names both, because
 *        the app's reasoning is still worth reading — it is just not a
 *        description of what is on screen.
 */
export const expiryChoiceNote = (choice, level = RECOMMENDED_LIQUIDITY, { selected = null } = {}) => {
  const c = choice?.chosen;
  if (selected && c && selected !== c.key) {
    const s2 = (choice?.eligible || []).find((e) => e.key === selected)
      || (choice?.passedOver && choice.passedOver.key === selected ? choice.passedOver : null);
    const room = s2 ? entryRoom(s2.dte) : null;
    return `Building on ${selected}${s2 ? ` (${s2.dte} days out)` : ""}, which you chose. Left to itself the ` +
      `app would open on ${c.key} (${c.dte} days out)` +
      (c.clears == null ? `.` : `, where ${c.clears} of its ${c.near} near-the-money contracts clear the ` +
        `${liquidityLevel(level?.id ?? level).label.toUpperCase()} floor.`) +
      (room && room.band !== "clear"
        ? ` ${selected} is inside the ${RULES.minEntryDTE}-day entry floor, so an order built here is ` +
          `refused at the send unless you write down why.`
        : ``);
  }
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
/**
 * WHICH ACCOUNT THE CHECKS ON SCREEN WERE RUN AGAINST.
 *
 * The Build screen's checklist and the order ticket beside it used to be
 * evaluated against two different accounts: the list said "paper mode
 * verified — local simulation, no broker involved" while the send it sat
 * above was gated against Alpaca. They are one account now (`bookFor()` in
 * App.jsx), and this is the sentence that says which, because a checklist
 * that does not name what it checked is a checklist you cannot audit.
 *
 * The second half exists because that one sheet holds TWO taps: the ticket,
 * which sends, and the confirm step, which records on the app's own book. The
 * checks shown are the SEND'S — the stricter of the two, since the gate reads
 * the account for `paperStatus()` and nothing else and the app's own book
 * always passes it — and the sentence says so rather than letting the reader
 * assume.
 *
 * @param viaBroker    true when an order on this screen would reach the broker
 * @param paperSource  `paperStatus().why` — how paper mode was established
 */
export const checkedAgainstNote = (viaBroker, paperSource) => (viaBroker
  ? `These checks were run against your Alpaca paper account — ${paperSource || "paper mode could not be established"} — ` +
    `which is the account the SEND button above uses. Recording the trade on the app's own book instead is not an ` +
    `order and reaches no broker; it passes the same checks bar this one.`
  : `These checks were run against the app's own paper book. Nothing on this screen leaves the browser: no broker is ` +
    `connected, so there is no account to check and no order to send.`);

/**
 * A BOARD THAT HAS NOT LOADED IS NOT A BOARD THAT EMPTIED.
 *
 * `emptyExpiryNote()` below is a VERDICT ON A MARKET — "nothing cleared on
 * this expiry" — and with no board loaded there is nothing for it to be a
 * verdict about. Printing it anyway is a missing-data answer dressed up as a
 * market one, which is the line `wizard.test.jsx` holds on the refusal screen
 * and the same line applies here.
 */
export const unloadedBoardNote = (ticker, expKey) =>
  `The strikes for ${ticker || "this market"}${expKey ? ` on ${expKey}` : ""} have not loaded, so nothing ` +
  `has been judged yet. This is not a verdict on the market: no structure can be built before the board ` +
  `says which strikes it carries, and a percentage of today's price rounded to a grid is a guess about ` +
  `that — which is how this app once named a contract nobody had ever issued.`;

export const emptyExpiryNote = (expKey, tally, level = RECOMMENDED_LIQUIDITY) => {
  const t = tally || {};
  const l = liquidityLevel(level?.id ?? level);
  const bits = [];
  if (t.liquidity > 0) bits.push(`${t.liquidity} for liquidity`);
  if (t.spread > 0) bits.push(`${t.spread} for a bid/ask spread over ${pctText(RULES.maxSpreadShareOfMid)} of the mid`);
  if (t.comboSpread > 0) bits.push(`${t.comboSpread} for a COMBINATION spread over ${pctText(RULES.maxComboSpreadShareOfNet)} of its net`);
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
 * AND THE PAIR IS NOT THE LEGS — THE FOURTH FLOOR.
 *
 * `spreadFloor()` above measures ONE LEG AT A TIME and reports the worst share
 * it found. What the user actually pays is the spread of the COMBINATION, and
 * on a structure whose net is small against its legs the two leg spreads ADD
 * while the two mids SUBTRACT. UNG 2026-09-20, 2026-10-23, spot $10.42: buy the
 * 10.50 call (mid 0.48), sell the 11.00 call (mid 0.34). Each leg about ten
 * cents wide — 21% and 29% of its own mid, both well inside the per-leg 35%
 * ceiling — and the pair quoted bid $4 / mid $14 / ask $24. A spread of $20 on
 * a mid of $14 is 143%, four times the per-leg ceiling, and it was offered.
 *
 * SEPARATE FROM THE PER-LEG FLOOR, DELIBERATELY, with its own count and its own
 * sentence — the same discipline that keeps `priceability()`, `impossibleLoss()`
 * and `modelSanity()` apart. "This leg cannot be traded at a readable price" and
 * "the round trip on this trade costs more than the trade is worth" are two
 * different facts, and a pooled count would explain neither.
 *
 * It reads `comboBook()` — the one place each leg is taken at the side that
 * actually trades — so the number this floor judges is the same number the
 * order ticket prints. See `RULES.maxComboSpreadShareOfNet` for why 1.0.
 * ------------------------------------------------------------------------- */

/**
 * The combination's spread as a share of its own net, or null when unknown.
 *
 * `book.spread` is already `ask - bid` for the whole structure (each leg at the
 * side that trades), so this is one division and not a second summation.
 * A net of about nothing has no share to take: `priceability()` refuses that
 * case by name, before this one, and a division by it here would produce the
 * same infinity that printed "R/R 6748644041614687.00" on BOIL.
 */
export const comboSpreadShare = (book) => {
  if (!book || !book.ok) return null;
  const sp = Number(book.spread), mid = Math.abs(Number(book.mid));
  if (!Number.isFinite(sp) || !Number.isFinite(mid)) return null;
  if (!(mid >= RULES.minNetPremium)) return null;
  if (!(sp >= 0)) return null;
  return sp / mid;
};

/**
 * Run the WHOLE structure past the combination spread ceiling.
 *
 * @param legs    [{ side, qty }] — the structure, because which side of each
 *                leg trades depends on whether you are buying or selling it
 * @param quotes  one `{ bid, ask }` per leg, aligned with the legs
 * @returns {{ checked, pass, share, floor, spread, mid, book }}
 *   `checked` false means there was no two-sided book to measure, or the net
 *   is under `minNetPremium` and belongs to `priceability()` rather than here.
 *   UNKNOWN IS NOT WIDE, exactly as on the per-leg half.
 */
export function comboSpreadFloor(legs = [], quotes = [], { floor = RULES.maxComboSpreadShareOfNet } = {}) {
  const book = comboBook(legs, quotes);
  const share = comboSpreadShare(book);
  if (share == null) {
    return { checked: false, pass: true, share: null, floor, spread: book.ok ? book.spread : null,
      mid: book.ok ? book.mid : null, book };
  }
  return { checked: true, pass: share <= floor, share, floor, spread: book.spread, mid: book.mid, book };
}

/** The refusal sentence, with the live numbers in it. */
export const comboSpreadFloorReason = (share, spread, mid, floor = RULES.maxComboSpreadShareOfNet) =>
  `Its LEGS are each quoted tightly enough, but the COMBINATION is not: the two sides of this structure's ` +
  `own market are ${money(Math.abs(spread) * 100)} apart on a mid of ${money(Math.abs(mid) * 100)} — ` +
  `${pctText(share)} of it, against a ${pctText(floor)} ceiling. On a spread the two legs' spreads add while ` +
  `their mids subtract, so a pair built from perfectly ordinary legs can cost more to get in and out of than ` +
  `it is worth. You pay half of that getting in and half getting out.`;

/** The one line a list prints in place of the structures this floor removed. */
export const wideComboNote = (n, what) =>
  `${n} structure${n === 1 ? "" : "s"} ${n === 1 ? "was" : "were"} left out because the two sides of the ` +
  `WHOLE COMBINATION are more than ${pctText(RULES.maxComboSpreadShareOfNet)} of its net apart` +
  `${what ? ` on ${what}` : ""} — not because any one leg is wide. Two ordinary legs make an unaffordable ` +
  `pair when their spreads add and their mids subtract, which is what a vertical does.`;

/** The one sentence shown when the combination spread floor could not be applied. */
export const comboSpreadSkippedNote = (feed) =>
  `The combination spread floor was SKIPPED${feed ? ` — ${feed} did not quote both sides of every leg` : ""}. ` +
  `Without a two-sided quote on every leg there is no combination market to measure, and a book we do not ` +
  `have is not a wide one.`;

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
 *   legs         — [{ side, qty }] for the COMBINATION spread floor, which is a
 *                  different question from the per-leg one above: each leg is
 *                  taken at the side that actually trades and the whole
 *                  structure's book is measured against its own net. Without
 *                  the legs there is no combination to price, so the check is
 *                  SKIPPED rather than passed silently.
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
/* ------------------------------------------------------------------
   WHAT THE GUIDED FLOW WILL NOT PROPOSE — and it is a SHAPE, not a name

   The wizard already excludes a single long option (rule 2 in CLAUDE.md):
   it pays for time a beginner usually does not get, and the loss reads as
   bad luck rather than as decay. ROADMAP P2 decided the same about
   BUTTERFLIES and nobody had implemented it: "drop butterflies from the
   guided path (pTP near 0: incompatible with the 50% take profit before
   the 21-DTE exit)."

   The reason, in one line: a butterfly is worth its maximum only AT the
   middle strike AT expiry. Half of that maximum is therefore unreachable
   while there is time value left, and this app closes at `exitDTE` — 21
   days out. So the take-profit rung of a structure the guided flow offers
   as a first trade can essentially never be hit, and the trade ends at the
   calendar every time. That is a fine trade for somebody who chose it; it
   is a poor one for somebody being taught what a rule is for.

   IT IS NOT A NAME MATCH. "Bearish Put Butterfly" and "Iron Butterfly" are
   two of four spellings today and a fifth is one preset away. A butterfly
   is the structure whose short legs all sit on ONE strike with long legs
   on both sides of it — which is exactly what makes its peak a point. An
   iron condor has its shorts on TWO strikes and is not caught; a vertical
   has nothing above or below its short and is not caught.

   THEY STAY ON THE FULL DESK. This removes nothing from the Shortlist, the
   wide search or the Build screen: a hand-built trade is the user's to
   make, the same line the quality floors are drawn on.
------------------------------------------------------------------ */

/**
 * Is this structure a butterfly (including an iron butterfly)?
 * @param legs  [{ side, qty, strike }]
 */
export function isButterfly(legs = []) {
  const ls = (Array.isArray(legs) ? legs : []).filter((l) => l && Number.isFinite(+l.strike));
  if (ls.length < 3) return false;
  const shorts = ls.filter((l) => +l.side < 0);
  const longs = ls.filter((l) => +l.side > 0);
  if (!shorts.length || longs.length < 2) return false;
  const body = +shorts[0].strike;
  // Every short on ONE strike: that is what makes the peak a single point.
  if (!shorts.every((l) => +l.strike === body)) return false;
  return longs.some((l) => +l.strike < body) && longs.some((l) => +l.strike > body);
}

/** Why the guided flow passed one over, for the screen that lists what it did. */
export const butterflySkipNote = () =>
  `Butterflies are not offered on the guided path. A butterfly is worth its most only if the market ` +
  `finishes exactly on the middle strike on the last day, so half of that maximum — the take-profit ` +
  `rule this app closes on — is out of reach while there is still time value in it, and every one of ` +
  `them would end at the ${RULES.exitDTE}-day mark instead. They are still on the full desk, where a ` +
  `trade you build yourself is yours to make.`;

export function qualityFloor({
  openInterest = [], peerOpenInterest = null, level = RECOMMENDED_LIQUIDITY,
  quotes = [], legs = [], maxProfit, maxLoss, unboundedProfit = false,
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

  // AND THE PAIR IS NOT THE LEGS. Both leg spreads land on one net, so a
  // structure every leg of which clears the line above can still cost more to
  // get in and out of than it is worth. Also NOT moved by `level`, and counted
  // separately from the per-leg half: they are different faults.
  const comboSpread = comboSpreadFloor(legs, quotes);

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
  if (!comboSpread.pass) reasons.push(comboSpreadFloorReason(comboSpread.share, comboSpread.spread, comboSpread.mid, comboSpread.floor));
  if (!rewardCheck.pass) {
    reasons.push(rr == null
      ? `The best case cannot be measured against the worst, so there is no reward-to-risk to judge.`
      : `It pays ${money(rr * 100)} for every ${money(100)} at risk, under the ${money(RULES.minRewardRisk * 100)} ` +
        `floor: you would have to be right ${pctText(1 / (1 + rr), 0)} of the time just to break even.`);
  }

  return { pass: liquidity.pass && spread.pass && comboSpread.pass && rewardCheck.pass,
    liquidity, spread, comboSpread, reward: rewardCheck, reasons };
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
 * THE TECHNICAL-ANALYSIS COPILOT, AS A PROMPT.
 *
 * A generated prompt is a generated sentence, so it lives here beside
 * `copilotRulesBlock()` and `reportNarrativePrompt()` rather than inline in
 * the panel that sends it. That is not tidiness: the report's prompt INVENTED
 * A POSITION once, and the only reason that fault is testable today is that
 * the sentence which caused it is in a file a test can read.
 *
 * >>> THE ONE RULE THIS PROMPT EXISTS FOR. <<< The model is handed
 * `taContext()` from `indicators.js` and NOTHING ELSE — no price bars. A model
 * given 400 daily closes will work out a moving average, and the number it
 * works out will not be the number on the chart beside its answer. This
 * repository has removed four separate second-implementations of one figure
 * (the chance of profit, the seasonal drift, the realised volatility, open
 * interest); it is not adding a fifth that nobody can even read afterwards.
 *
 * So the prompt says, in as many words, that every figure must be quoted from
 * the context and that a figure not in the context may not be written down at
 * all. `indicators.test.js` holds that sentence.
 * ------------------------------------------------------------------------- */

/** The one-tap questions under the chart. They are here rather than in the
 *  component because each one is a QUESTION PUT TO THE MODEL, and the prompt
 *  above and the questions below are one contract. */
export const TA_QUESTIONS = Object.freeze([
  { id: "trend", label: "What is the trend saying?",
    ask: "What are the moving averages and the trend read saying about this market right now, and how sure can I be about it?" },
  { id: "rsi", label: "Is RSI stretched?",
    ask: "Is RSI stretched here, what does that actually mean, and what would it take for this reading to be the wrong thing to act on?" },
  { id: "macd", label: "What does MACD confirm or deny?",
    ask: "Does MACD confirm or contradict what the moving averages are saying, and which of the two should I weight more here?" },
  { id: "trade", label: "How does this relate to my trade?",
    ask: "Relate this chart to the trade loaded on the Build screen: where are my break-evens against where this market has been, and how far is that in ordinary days of movement?" },
]);

/** The line that has to appear once, and only once. */
export const TA_DISCLAIMER =
  "This is educational analysis on a paper-trading account, not financial advice.";

/**
 * THE SYSTEM PROMPT FOR THE CHART COPILOT.
 * It is deliberately NOT the desk copilot's prompt: that one is about a
 * structure and its greeks, this one is about a price history, and a prompt
 * that tries to be both ends up recommending a trade from a chart.
 */
export const taCopilotPrompt = () =>
  `You are explaining the technical analysis on one commodity ETF chart to someone who is learning ` +
  `to trade options and is not a professional. ${TA_DISCLAIMER}

` +

  `THE NUMBERS ARE GIVEN TO YOU AND YOU MAY NOT PRODUCE ANY OTHERS. The context below was computed ` +
  `by the app from the daily bars and is exactly what is drawn on the chart beside your answer. ` +
  `You are NOT given the price bars, deliberately. Do not compute, estimate, infer or recall any ` +
  `figure that is not in the context: every number you write must be quoted from it. If the reader ` +
  `asks about something the context does not contain — another indicator, another timeframe, a ` +
  `price level nobody has measured — say plainly that the app has not measured it, and say what it ` +
  `HAS measured that comes closest. A field that is null is UNKNOWN and is never zero; an ` +
  `indicator listed in indicators_not_available has not enough history to exist and you must say so ` +
  `rather than describing it.

` +

  `WHAT AN ANSWER IS MADE OF, in this order, for each indicator you touch: what it MEASURES in one ` +
  `plain clause, defined the first time you use the term; what it is SAYING right now, with the ` +
  `figure from the context; and what would make that read WRONG — the specific thing you would ` +
  `watch for. The third one is the part that matters and it is the part everybody skips.

` +

  `WHAT YOU MAY NOT DO. Do not recommend a trade, a strike or an expiry: this panel explains a ` +
  `chart and the app has its own rules for what may be proposed, enforced in code. Do not present ` +
  `a technical reading as a forecast — an indicator describes what HAS happened. Do not guarantee ` +
  `an outcome. ${copilotRulesBlock()}

` +

  `HOW TO WRITE IT. Short paragraphs of plain English prose. No tables, no pipe characters, no ` +
  `code fences, no bullet lists of numbers the screen is already showing. At most three short ` +
  `sections, each headed with "## " and a plain title. Open with one sentence that answers the ` +
  `question asked. Two hundred and fifty words is plenty. Write the disclaimer once, at the end, ` +
  `and nowhere else.`;

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

/* --------------------------------------------------------------------
   HOW OLD A READING IS, IN WORDS — AND IT IS ONE READING.

   The measured monthly series is parsed ONCE (`parseAvJson` /
   `statsFromMatrix` in engine.js) and produces two things this file carries
   provenance for: the twelve seasonal means the drift leans on, and the
   annualised realised volatility the exit simulator walks the SHARE on. They
   are the same reading of the same prices taken at the same moment, so they
   share one age phrase. This used to be called `seasonalAgePhrase` and live
   inside the seasonal block, which would have meant a second copy of four
   lines the moment the volatility needed the same sentence.
-------------------------------------------------------------------- */

/** Null is "not recorded", never "today" — `Number(null)` is 0 and 0 is finite. */
export const readingAgePhrase = (ageDays) => {
  if (!Number.isFinite(ageDays)) return "read on a date this record does not carry";
  if (ageDays <= 0) return "read today";
  if (ageDays === 1) return "read yesterday";
  return `read ${Math.round(ageDays)} days ago`;
};

/**
 * THE REALISED VOLATILITY THE EXIT SIMULATOR WALKS THE SHARE ON — and there are
 * THREE places it can come from, not two.
 *
 * WHAT WAS HERE. This function knew `SIGMA` in `engine.js` (a HAND-WRITTEN
 * per-ticker table) and `RULES.fallbackSigma` behind it, and its sentence said
 * "written down, not measured from returns" about whichever of the two was in
 * force. That was true of both. It is NOT true of the third source, which was
 * already in the app and already on screen: `statsFromMatrix()` returns
 * `sqrt(var * 12)` of the measured monthly returns, `App.jsx` has been storing
 * it as `seasonal[tk].sigma` and handing it to the Guardian for four pull
 * requests, and `autopilot.mjs` had no measured volatility available to it at
 * all. So `exitSim` on the brief and `exitPathSim` on the Guardian walked the
 * SAME position on TWO different volatilities, and every figure they produce —
 * `pTP`, `pSL`, `pTimePos`, `ev`, `medDays` — moves with it. That is the fault
 * PR #26 fixed for the seasonal MEANS, one layer down.
 *
 * SAME SHAPE AS `seasonalProvenance()`, DELIBERATELY. That function is one pull
 * request old and it is the house pattern now: the value, which of the sources
 * produced it, the year count, the age in days, and one sentence. A third
 * provenance invented in a third shape would be a third thing to learn.
 *
 * **0.25 IS CHOSEN, NOT MEASURED.** `RULES.fallbackSigma` is a mid-range
 * annualised volatility for a commodity ETF — between the grain markets this
 * app trades (0.19 to 0.25 in the table) and the leveraged ones (0.48, 0.95).
 * Nothing was estimated from returns to arrive at it and it is on the PRD's NOT
 * VERIFIED list. It is STILL THE NAMED FALLBACK, behind both the measured
 * reading and the table, and it still says so on screen.
 *
 * AND IT must NEVER be merged with `RULES.fallbackIV`: one is the REALISED volatility
 * the share's price is walked on, the other the IMPLIED volatility the OPTIONS
 * are priced at. Merging them would make a correction to either silently move
 * the other. Nothing inside `SIGMA` is edited here either — what changes is
 * where the volatility comes from and what the app SAYS about it, exactly as
 * PR #26 left `SEASONAL` alone.
 */
export const FALLBACK_SIGMA = RULES.fallbackSigma;

/** A volatility worked out from the market's own measured monthly returns. */
export const MEASURED_SIGMA_SOURCE = "measured history";

/** ...the hand-written row in `SIGMA`, which is an estimate and says so. */
export const TABLE_SIGMA_SOURCE = "table";

/** ...and one nobody wrote down for this market at all. */
export const FALLBACK_SIGMA_SOURCE = "fallback";

/**
 * ONE SENTENCE SAYING WHICH VOLATILITY A SIMULATION WALKED ON AND HOW OLD THAT
 * READING IS. Every screen that prints an exit-simulator figure prints this
 * beside it, and the autopilot's brief carries the same string, so a number
 * cannot travel without its source.
 */
export const sigmaSourceSentence = ({ source = FALLBACK_SIGMA_SOURCE, sigma = FALLBACK_SIGMA,
  ticker = "this market", years = null, ageDays = null } = {}) => {
  if (source === MEASURED_SIGMA_SOURCE) {
    return `The simulation below walks ${ticker} at ${pctText(sigma)} a year, MEASURED from ` +
      `${Number.isFinite(years) ? `${years} years of` : "its own"} monthly returns, ${readingAgePhrase(ageDays)}.`;
  }
  if (source === TABLE_SIGMA_SOURCE) {
    return `The simulation below walks ${ticker} at ${pctText(sigma)} a year, the figure this app holds for it. ` +
      `That figure is written down, not measured from returns.`;
  }
  return `THE SIMULATION BELOW IS WALKED AT A FALLBACK VOLATILITY. This app holds no figure for ${ticker}, so ` +
    `it used ${pctText(sigma)} a year — a number chosen as a middle for a commodity ETF, not measured from ` +
    `${ticker}'s own returns. Every figure the simulator produces for it is that assumption's, not the market's.`;
};

/**
 * WHICH VOLATILITY IS IN FORCE, DECIDED ONCE AND CARRIED.
 *
 * @param measured    the loaded measured reading for this market, or null:
 *                    `{ sigma, years, at }` — the same object
 *                    `seasonalProvenance()` takes, because it IS the same
 *                    reading. `at` is when it was read, in epoch ms.
 * @param tableSigma  the hand-written row for this market (`SIGMA[tk]`), or null
 * @param ticker      what the sentence names
 * @returns { sigma, source, measured, fromTable, fromFallback, years, ageDays, ticker, note }
 */
export function sigmaProvenance(measured, tableSigma, ticker = "this market") {
  const ok = (x) => Number.isFinite(x) && x > 0;
  const meas = measured && ok(measured.sigma) ? measured : null;
  const source = meas ? MEASURED_SIGMA_SOURCE : ok(tableSigma) ? TABLE_SIGMA_SOURCE : FALLBACK_SIGMA_SOURCE;
  const sigma = meas ? meas.sigma : ok(tableSigma) ? tableSigma : FALLBACK_SIGMA;
  // `Number.isFinite` on both, for the reason `seasonalProvenance()` gives:
  // `Number(null)` is 0, so a missing year count must not print as "0 years of
  // monthly returns" and a missing timestamp must not read as "read today".
  const years = meas && Number.isFinite(meas.years) ? meas.years : null;
  const ageDays = meas && Number.isFinite(meas.at)
    ? Math.max(0, Math.floor((Date.now() - meas.at) / 86400000)) : null;
  const out = {
    sigma, source,
    measured: !!meas,
    fromTable: source === TABLE_SIGMA_SOURCE,
    fromFallback: source === FALLBACK_SIGMA_SOURCE,
    years, ageDays, ticker,
  };
  out.note = sigmaSourceSentence(out);
  return out;
}

/** The four fields a record keeps, from a `sigmaProvenance()` result. */
export const sigmaStampFields = (prov) => ({
  simSigma: Number.isFinite(prov?.sigma) ? prov.sigma : null,
  simSigmaSource: prov?.source ?? null,
  simSigmaYears: prov?.years ?? null,
  simSigmaAgeDays: prov?.ageDays ?? null,
});

/* --------------------------------------------------------------------
   AND THE IMPLIED VOLATILITY, WHICH IS A DIFFERENT QUANTITY.

   `sigmaProvenance()` above answers "what realised volatility is the price of
   the SHARE being walked at". This answers "what implied volatility are the
   OPTIONS being priced at" — the number `bs()`, `smile()` and `netBS()` take.
   They were both a bare `0.25` in `autopilot.mjs`, one line apart, and merging
   them into one constant would mean a future correction to either silently
   moving the other. See `RULES.fallbackIV`.
-------------------------------------------------------------------- */

/** The implied volatility used when neither the chain nor the thesis had one. */
export const FALLBACK_IV = RULES.fallbackIV;

/** What the app calls a volatility the chain gave it. */
export const CHAIN_IV_SOURCE = "chain";

/** ...one the position's own entry thesis remembered. */
export const THESIS_IV_SOURCE = "entry thesis";

/** ...and one nobody supplied. */
export const FALLBACK_IV_SOURCE = "fallback";

/**
 * WHICH IMPLIED VOLATILITY IS IN FORCE, decided once and carried.
 *
 * The caller hands the two candidates in the order it trusts them: what the
 * chain quoted today, then what the position remembered from the day it was
 * opened. A number that is neither is the fallback, and it says so.
 *
 * @param chainIV   today's average implied volatility across the legs, or null
 * @param thesisIV  the implied volatility recorded when the position opened
 * @param ticker    what to name in the sentence when neither was readable
 */
export function ivProvenance(chainIV, thesisIV, ticker = "this market") {
  const ok = (x) => Number.isFinite(x) && x > 0;
  const iv = ok(chainIV) ? chainIV : ok(thesisIV) ? thesisIV : FALLBACK_IV;
  const source = ok(chainIV) ? CHAIN_IV_SOURCE : ok(thesisIV) ? THESIS_IV_SOURCE : FALLBACK_IV_SOURCE;
  return { iv, source, fromFallback: source === FALLBACK_IV_SOURCE, note: fallbackIVNote(ticker, iv, source) };
}

/** One sentence saying where the implied volatility came from. */
export const fallbackIVNote = (ticker = "this market", iv = FALLBACK_IV, source = FALLBACK_IV_SOURCE) =>
  source === CHAIN_IV_SOURCE
    ? `The options are priced at ${pctText(iv)}, read from today's chain for ${ticker}.`
    : source === THESIS_IV_SOURCE
      ? `The options are priced at ${pctText(iv)}, the figure recorded for ${ticker} when this position was opened. ` +
        `Today's chain did not give one.`
      : `THE OPTIONS ARE PRICED AT A FALLBACK VOLATILITY. Neither today's chain nor this position's own record ` +
        `gave one for ${ticker}, so ${pctText(iv)} was used — a number chosen as a middle for a commodity ETF, ` +
        `never measured. Every figure worked out from it is that assumption's.`;

/* --------------------------------------------------------------------
   AND THE SEASONAL MEANS THE DRIFT IS TAKEN FROM, WHICH IS A THIRD QUANTITY.

   `sigmaProvenance()` answers "what realised volatility is the SHARE walked
   at". `ivProvenance()` answers "what implied volatility are the OPTIONS priced
   at". This answers "WHOSE SEASONALITY is the distribution leaning on" — the
   drift, which is the app's own thesis and the one input to the chance that the
   market has no say in at all.

   WHY IT NEEDED A HOME OF ITS OWN.

   `SEASONAL` in engine.js is hand-written and carries the heaviest of the four
   weights. Measured against 195 months of real Alpha Vantage data for CORN it
   has the WRONG SIGN on eight months of twelve. Correcting ONE cell moves the
   printed chance by 18.8 points and flips the sign of the expected value: CORN
   June reads +1.5 in the table against a measured ten-year mean of -3.46, which
   is a drift of +16.8% a year against -13.0%, a chance of 52.7% against 33.9%
   and an average result of +$16.86 against -$16.57 on one 19/21 call spread.
   September is the same fault the other way round (-1.1 against +1.03).

   So the sentence beside a chance is not decoration. Two markets on two tables
   print two numbers of the same name, and until now nothing on any screen said
   which of the two had produced the one being read. PR #25 wrote that debt down
   and left it open; this is what closes it.

   AND THE TWO SIDES DID NOT EVEN READ THE SAME TABLE. `App.jsx` loaded measured
   means per basket market into state and fell back to the hand-written row per
   market; `autopilot.mjs` passed `SEASONAL[pos.ticker] || SEASONAL.SPY` with no
   measured means available to it at all. The brief and the screen could differ
   on one position for a reason neither of them named.

   THREE RULES, THE SAME THREE EVERY OTHER PROVENANCE IN THIS FILE KEEPS.

   1. DECIDED ONCE AND CARRIED. `chanceOf()` takes the result of this function
      and stamps it into its own, so every screen reads the answer rather than
      re-deciding it.
   2. NO DEFAULT AND NO SILENT SUBSTITUTION. With no means at all — neither
      measured nor hand-written — `missing` is true, `chanceOf()` returns null
      and the interface prints a dash with a sentence. A drift of zero standing
      in for a reading nobody has is a confident claim that the market goes
      nowhere, which is not the same thing as not knowing.
   3. THE ABSENCE OF THE STAMP IS THE MARKER, exactly as `contractsAssumed` and
      `simExitDTE` work: a record written before this existed carries no
      seasonal source, and `seasonalStampOf()` reads that absence as the
      hand-written estimate rather than inventing a measurement for it.

   Deriving the TABLE itself from measured returns is ROADMAP P2 and is
   deliberately not done here. Nothing inside `SEASONAL` is edited by hand: this
   changes where the means come from and what the app SAYS about them.
-------------------------------------------------------------------- */

/** Twelve monthly means worked out from real monthly prices. */
export const MEASURED_SEASONAL_SOURCE = "measured history";

/** ...the hand-written row in engine.js, which is an estimate and says so. */
export const ESTIMATED_SEASONAL_SOURCE = "hand-written estimate";

/** ...and no reading at all, which is not a drift of zero. */
export const NO_SEASONAL_SOURCE = "none";

/** Twelve finite numbers, or it is not a seasonal row. */
const seasonalRowOk = (m) => Array.isArray(m) && m.length === 12 && m.every((x) => Number.isFinite(x));

/**
 * ONE SENTENCE NAMING WHICH TABLE DRIFTED A CHANCE AND HOW OLD IT IS.
 * Every screen that prints a chance prints this beside it, and the autopilot's
 * brief carries the same string, so a number cannot travel without its source.
 */
export const seasonalSourceSentence = ({ measured = false, missing = false, ticker = "this market",
  years = null, ageDays = null } = {}) => {
  if (missing) {
    return `There is no seasonal reading for ${ticker} at all — neither measured prices nor a written estimate — ` +
      `so no chance is worked out for it. A drift of zero would be a claim that ${ticker} goes nowhere, ` +
      `which is a different thing from not knowing.`;
  }
  if (measured) {
    return `Drifted on ${ticker}'s MEASURED seasonality: ` +
      `${Number.isFinite(years) ? `${years} years of` : "its own"} monthly prices, ${readingAgePhrase(ageDays)}.`;
  }
  return `Drifted on the HAND-WRITTEN seasonal estimate for ${ticker}, not on measured prices. ` +
    `That table is wrong on eight months of twelve where it has been checked, so this chance is an ` +
    `estimate's estimate until ${ticker}'s real price history loads.`;
};

/**
 * WHICH SEASONAL MEANS ARE IN FORCE, DECIDED ONCE.
 *
 * @param measured  the loaded Alpha Vantage reading for this market, or null:
 *                  `{ monthlyMean, years, at }` — `at` is when it was read, in
 *                  epoch ms, and is what the age in the sentence comes from.
 * @param fallback  the hand-written row for this market (`SEASONAL[tk]`), or null
 * @param ticker    what the sentence names
 * @returns { monthlyMean, measured, missing, source, years, ageDays, ticker, note }
 */
export function seasonalProvenance(measured, fallback, ticker = "this market") {
  const meas = measured && seasonalRowOk(measured.monthlyMean) ? measured : null;
  const fall = seasonalRowOk(fallback) ? fallback : null;
  const monthlyMean = meas ? meas.monthlyMean : fall;
  const missing = !monthlyMean;
  // `Number.isFinite` on both, because `Number(null)` is 0 and 0 is finite: a
  // missing year count must not print as "0 years of monthly prices" and a
  // missing timestamp must not read as "read today".
  const years = meas && Number.isFinite(meas.years) ? meas.years : null;
  const ageDays = meas && Number.isFinite(meas.at)
    ? Math.max(0, Math.floor((Date.now() - meas.at) / 86400000)) : null;
  const out = {
    monthlyMean: monthlyMean || null,
    measured: !!meas,
    missing,
    source: meas ? MEASURED_SEASONAL_SOURCE : fall ? ESTIMATED_SEASONAL_SOURCE : NO_SEASONAL_SOURCE,
    years, ageDays, ticker,
  };
  out.note = seasonalSourceSentence(out);
  return out;
}

/**
 * THE STAMP ON A STORED RECORD, AND WHAT ITS ABSENCE MEANS.
 *
 * A position's entry thesis, a kept candidate and an autopilot entry all carry
 * the chance they were written with. New ones carry `seasonalSource` beside it;
 * everything written before this PR carries nothing, and nothing is exactly the
 * evidence that the hand-written table was in force — it was the only table
 * either side could reach. Reading a missing stamp as "measured" would invent a
 * measurement; reading it as "unknown" would hide one the record can settle.
 *
 * `Number.isFinite` guards both numbers for the usual reason: a record with no
 * year count must not read as zero years of history.
 */
export const seasonalStampOf = (rec) => {
  const r = rec || {};
  // THREE SOURCES, NOT TWO, SINCE THE LIQUID TIER. A record can now be stamped
  // "none": the market has no measured history loaded AND no hand-written row
  // behind it, which is a real, recorded answer and not a missing stamp. Reading
  // it as the estimate would name a table that does not exist for that market.
  const missing = r.seasonalSource === NO_SEASONAL_SOURCE;
  const stamped = missing || r.seasonalSource === MEASURED_SEASONAL_SOURCE || r.seasonalSource === ESTIMATED_SEASONAL_SOURCE;
  const measured = r.seasonalSource === MEASURED_SEASONAL_SOURCE;
  return {
    stamped,
    measured,
    missing,
    source: stamped ? r.seasonalSource : ESTIMATED_SEASONAL_SOURCE,
    years: measured && Number.isFinite(r.seasonalYears) ? r.seasonalYears : null,
    ageDays: measured && Number.isFinite(r.seasonalAgeDays) ? r.seasonalAgeDays : null,
  };
};

/** The same one sentence, for a record rather than a live reading. */
export const seasonalStampNote = (rec, ticker = "this market") => {
  const s = seasonalStampOf(rec);
  return (s.stamped ? "" : "This record carries no seasonal stamp, which means it was written before the app " +
    "recorded one — and at that point the hand-written table was the only one either side could reach. ") +
    seasonalSourceSentence({ measured: s.measured, missing: s.missing, ticker, years: s.years, ageDays: s.ageDays });
};

/** The three fields a record keeps, from a `seasonalProvenance()` result. */
export const seasonalStampFields = (prov) => ({
  seasonalSource: prov?.source ?? null,
  seasonalYears: prov?.years ?? null,
  seasonalAgeDays: prov?.ageDays ?? null,
});

/**
 * THE TWO NUMBERS A PICTURE OF THIS CANDIDATE HAS TO BE DRAWN AT.
 *
 * A sibling of `seasonalStampFields()` above and for the same reason: the
 * chance printed on a card and the distribution drawn under it must be one
 * reading. `chanceOf()`'s result carries the volatility it priced at (the
 * chain's IMPLIED one) and the drift it leaned on (`seasonalDrift()`); the
 * compare picture was drawing a REALISED volatility and no drift at all.
 *
 * NEVER DEFAULTED. A candidate with no chance carries nulls, and the picture
 * draws no distribution and says why — the same discipline as the stamp above,
 * where the ABSENCE is the marker.
 */
export const chanceDrawFields = (mc) => ({
  sigma: Number.isFinite(mc?.sigma) ? mc.sigma : null,
  driftAnnual: Number.isFinite(mc?.driftAnnual) ? mc.driftAnnual : null,
});

/* --------------------------------------------------------------------
   WHEN A POSITION ASKS TO BE LOOKED AT.
   A colour and a word on a row, one step below "action". See
   `RULES.watchAttentionShare` for why it is not the stop and not the spread
   floor, whatever its value happens to equal.
-------------------------------------------------------------------- */

/**
 * The P&L at or below which a position is marked "watch", in the same signed
 * dollars `maxLoss` is in — so a real worst case is NEGATIVE and the level is
 * negative with it. Null when the maximum loss is not a number, because an
 * unknown loss has no share to take.
 */
export const watchAttentionLevel = (maxLoss) =>
  (Number.isFinite(maxLoss) ? RULES.watchAttentionShare * maxLoss : null);

/* =====================================================================
   ONE P&L PER POSITION — AND IT IS THE BROKER'S (P9, TASK 0b)

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026. <<< The Positions screen
   printed **-$127** in the largest red figure on the card, directly above
   the broker's own panel printing **-$130** for the same XLE position.
   Two numbers for one trade, three dollars apart, neither labelled.

   THE CAUSE IS TWO HOMES. `posAlerts` in App.jsx already prefers Alpaca's
   `unrealized_pl` when the position is live at the broker — and the
   Positions CARD, rendering a few hundred lines further down, re-derived
   its own from `netValue(legs, spot, ...) - entryNet`. So the home page and
   the card read two different arithmetics of the same fact, and the louder
   one was the app's own guess.

   CLAUDE.md, in the owner's own words: **the broker's numbers are READ,
   never re-derived.** `unrealized_pl` is on the first list — bid, ask, IV,
   OCC, open interest, order status, fill price, positions, P&L — and the
   app's mark is a MODEL of it. A model beside a measurement is not a second
   opinion, it is a contradiction the reader has to arbitrate.

   THE APP'S MARK SURVIVES ONLY WHERE THERE IS NO BROKER FIGURE — the app's
   own paper book, a market the chain has not priced, a broker that has not
   been asked — AND IT SAYS SO. The same discipline as `markProvenance()`:
   a figure carries where it came from, or it is not printed.
===================================================================== */

export const BROKER_PNL = "broker";
export const MODEL_PNL = "model";

/**
 * The one P&L of an open position, and where it came from.
 *
 * @param brokerPnl  Alpaca's `unrealized_pl`, summed over the legs of THIS
 *                   position — already a total for every contract of it.
 * @param modelPnl   the app's own mark, already multiplied by the size.
 * @returns {{ pnl, source, live, sentence }}  `pnl` null when neither is
 *          readable, and `sentence` null when the broker answered — a number
 *          read off the account needs no apology.
 */
export function positionPnl({ brokerPnl = null, modelPnl = null, feed = "the option chain" } = {}) {
  // `Number(null)` IS 0 AND 0 IS FINITE, for the eighth time in this
  // repository: the nulls go out before the coercion, or a broker that said
  // nothing becomes a broker reporting break-even.
  const num = (x) => (x == null || x === "" ? NaN : Number(x));
  const b = num(brokerPnl), m = num(modelPnl);
  if (Number.isFinite(b)) {
    return { pnl: b, source: BROKER_PNL, live: true, sentence: null };
  }
  if (Number.isFinite(m)) {
    return { pnl: m, source: MODEL_PNL, live: false, sentence: modelPnlNote(feed) };
  }
  return { pnl: null, source: null, live: false, sentence: null };
}

/** What it means that this figure is the app's and not the account's. */
export const modelPnlNote = (feed = "the option chain") =>
  `This profit is the APP'S OWN MARK, not the broker's: it is what the legs are worth at ` +
  `${feed}'s prices right now, and the account has not reported a figure for this position. ` +
  `Your Alpaca account is the one that counts.`;

/* =====================================================================
   WHAT IS LEFT TO MAKE AGAINST WHAT IS LEFT TO LOSE (P9, TASK 2)

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026, XLE, in one scroll. <<<

       home      "all inside the plan. Nothing to do"
       desk      "TODAY · EVERYTHING IS ON PLAN"
       the row   "Losing: check the reason you opened it"
       verdict   "-> HOLD"
       stat      "OF THE MAXIMUM  -3188%"

   For a trade that can make **$4** and can lose **$346**. Every one of
   those five lines is true of something, and together they say nothing.

   THE MISSING FACT IS NOT ON ANY OF THEM. A position is judged at entry on
   what it pays against what it risks (`RULES.minRewardRisk`), and then
   that question is never asked again — so a structure whose remaining
   reward has collapsed to four dollars against three hundred and forty-six
   of remaining risk is still "on plan", because the plan was written when
   the numbers were different.

   `remainingEdge()` asks the ENTRY question about an OPEN position: from
   today's mark, what is left to make and what is left to lose. It is pure
   subtraction on figures the screen is already holding — no new
   arithmetic, no simulation, no model.

   >>> AND IT IS NOT AN EXIT RULE. <<< The exit rules are chosen at
   construction and FROZEN (50% of max profit, 21 DTE, the stop as a
   warning). Nothing here closes anything, nothing here appears in
   `AUTOPILOT_VERDICTS`, and `ruleExitOf()` is untouched — so this can
   never be the reason a trade ends. It is a WARNING, exactly like the
   stop, and for the same reason: it is the weakest-evidenced thing the app
   can say, and the honest response to it is to look, not to act.
===================================================================== */

/**
 * What a position has left to make, and left to lose, from where it is now.
 *
 * TWO READINGS, AND THE WORSE ONE DECIDES. They answer two different
 * questions and the XLE position needs both:
 *
 *   `ratio`        reward / risk measured FROM THE CURRENT MARK — would the
 *                  rules OPEN this structure today, at today's price? On XLE:
 *                  $131 still to make against $219 still to lose, which is
 *                  0.60 and passes. That is not a mistake; it is the honest
 *                  answer to that question.
 *   `ceilingRatio` maxProfit / |maxLoss| — was this trade EVER something the
 *                  rules would offer? On XLE: **$4 against $346**, which is
 *                  0.01, forty times under the floor, and it is the fact the
 *                  five contradictory lines on that screen were all silent
 *                  about. The §4q inversion turned a $75 credit into $4 and
 *                  nothing has asked the entry question since.
 *
 * A position is an ATTENTION item when EITHER is under `RULES.minRewardRisk`,
 * because either one being thin is a real answer and pooling them would
 * explain neither — the same reasoning that keeps `priceability()`,
 * `impossibleLoss()` and `modelSanity()` apart.
 *
 * @param maxProfit  maximum profit for the WHOLE position (per-combination
 *                   figures scaled by the size before they get here — the
 *                   boundary rule, unchanged). `null` for an unbounded payoff,
 *                   which has no ceiling to take a ratio of.
 * @param maxLoss    maximum loss, SIGNED and negative, whole position.
 * @param pnl        the profit now, whole position, from `positionPnl()`.
 */
export function remainingEdge({ maxProfit = null, maxLoss = null, pnl = null } = {}) {
  const num = (x) => (x == null || x === "" ? NaN : Number(x));
  const P = num(maxProfit), L = num(maxLoss), now = num(pnl);
  const none = { known: false, reward: null, risk: null, ratio: null, ceilingRatio: null,
    maxProfit: null, maxLoss: null, thin: false, thinReason: null, sentence: null };
  // `Number(null)` IS 0 AND 0 IS FINITE. An unbounded payoff has no ceiling to
  // take a ratio of and a position with no readable mark has no "from here" —
  // both are UNKNOWN, and unknown is never a thin edge (the rule
  // `qualityFloor()` applies to an unknown open interest, one screen across).
  if (!Number.isFinite(now) || !Number.isFinite(P) || !Number.isFinite(L)) return none;
  const reward = Math.max(0, P - now);
  const risk = Math.max(0, Math.abs(L) + now);
  // NOTHING DIVIDES BY A COST UNDER THE MINIMUM — `rewardRisk()`'s rule, and
  // the same one that makes "OF THE MAXIMUM" print words below.
  const ratio = risk >= MIN_NET_DOLLARS ? reward / risk : null;
  const ceilingRatio = Math.abs(L) >= MIN_NET_DOLLARS ? Math.max(0, P) / Math.abs(L) : null;
  const ceilingThin = ceilingRatio != null && ceilingRatio < RULES.minRewardRisk;
  const hereThin = ratio != null && ratio < RULES.minRewardRisk;
  const thinReason = ceilingThin ? "ceiling" : hereThin ? "here" : null;
  return {
    known: true, reward, risk, ratio, ceilingRatio, maxProfit: P, maxLoss: L,
    thin: !!thinReason, thinReason,
    sentence: thinReason
      ? remainingEdgeNote({ reward, risk, maxProfit: P, maxLoss: L, reason: thinReason })
      : null,
  };
}

/** The warning, with BOTH dollar figures in it, in the entry rule's own words. */
export const remainingEdgeNote = ({ reward, risk, maxProfit, maxLoss, reason = "ceiling" } = {}) => {
  const head = reason === "ceiling"
    ? `The most this position can make is ${money(maxProfit)} and the most it can lose is ` +
      `${money(Math.abs(maxLoss))}.`
    : `From here this position has ${money(reward)} left to make and ${money(risk)} left to lose.`;
  return `${head} That is under the ${pctText(RULES.minRewardRisk)} of what it risks that the app requires ` +
    `before it will offer a trade at all — the rules would not open this trade today. Nothing closes on ` +
    `this: the exit rules were chosen when you opened it and they are frozen. It is a reason to look at ` +
    `it, the same way the stop is.`;
};

/** The one line a list row carries, short enough to sit beside a price. */
export const remainingEdgeLabel = (e) =>
  (e && e.thin
    ? `Thin: ${money(e.thinReason === "here" ? e.reward : Math.max(0, e.maxProfit))} to make against ` +
      `${money(e.thinReason === "here" ? e.risk : Math.abs(e.maxLoss))} at risk`
    : null);

/* =====================================================================
   THE HEADLINE IS DERIVED FROM THE LIST, NOT WRITTEN BESIDE IT (P9, TASK 2)

   Read in one scroll: the home page said *"all inside the plan. Nothing to
   do."*, the desk said *"TODAY · EVERYTHING IS ON PLAN"*, and the row
   between them said *"Losing: check the reason you opened it"*.

   THE CAUSE IS ONE FILTER. Both headlines read a count of alerts at level
   `action` — and a `watch` row is not `action`, so a position the app had
   just told the reader to check could sit under a headline saying there was
   nothing to check. §4m's rule, one tab across: a screen that argues with
   itself is worse than one that says nothing, because the part that shouts
   loudest wins and here that part was the reassurance.

   `attentionCount()` is the one home. TWO counts, because they answer two
   questions and one number could not: `decisions` is what a rule has fired
   on and the badge is drawn from it; `looks` is everything that is not on
   plan, and NO HEADLINE MAY SAY "nothing to do" WHILE IT IS ABOVE ZERO.
===================================================================== */

export function attentionCount(alerts = []) {
  const list = Array.isArray(alerts) ? alerts : [];
  const decisions = list.filter((a) => a && a.level === "action").length;
  const looks = list.filter((a) => a && a.level && a.level !== "ok").length;
  return { decisions, looks, quiet: looks === 0 };
}

/** THE SAME ACTION, SAID ONCE. The broker panel's close and the Positions
 *  card's close are one act, and only the second one asks why and files the
 *  reason. Where the two meet, this is what the broker panel says instead of
 *  offering a second button. */
export const sameCloseNote = (ref) =>
  `This is ${ref || "a position"} on your Positions screen. Close it there: it is the same order, and ` +
  `that button asks what ended the trade and files the answer with it. A close with no reason on the ` +
  `record teaches nothing later.`;

/* WHEN "OF THE MAXIMUM" IS A PERCENTAGE AND WHEN IT IS WORDS.
   -$127 against a $4 maximum is -3188%, which is a true division and a false
   sentence: a percentage of almost nothing is not a share of anything. The
   rule is the one `rewardRisk()` already applies — nothing divides by a
   figure under `MIN_NET_DOLLARS` — and below it the stat says what it means
   instead of printing a number that reads as a bug. */
export function shareOfMaximum(pnl, maxProfit) {
  const num = (x) => (x == null || x === "" ? NaN : Number(x));
  const now = num(pnl), P = num(maxProfit);
  if (!Number.isFinite(now) || !Number.isFinite(P)) return { pct: null, text: "—" };
  if (!(Math.abs(P) >= MIN_NET_DOLLARS)) {
    return { pct: null, text: `too small to be a share`,
      note: `The most this position can make is ${money(P)}, which is under the ${money(MIN_NET_DOLLARS)} ` +
        `minimum this app will form a ratio against. A percentage of it would be a true division and a ` +
        `false sentence.` };
  }
  return { pct: (now / P) * 100, text: `${((now / P) * 100).toFixed(0)}%` };
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
 * TWO FIELDS COME BACK AND THE ORDER TAKES `net`, NOT `limit`. `net` is the
 * SIGNED net of the structure and it is what `orderBody()` must be handed —
 * `mlegLimitPrice()` in order.js turns it into the order's own direction, and
 * a close flips it, because selling a debit structure is a credit. `limit` is
 * the MAGNITUDE and it is for the SCREEN: a number to compare against a bid
 * and an ask. This comment used to say the opposite, and the mleg body really
 * did take `Math.abs()` — which sent a $75 XLE credit spread as a $75 DEBIT
 * and filled it for $4 on 21 Sep 2026 (src/order.js, 1b).
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
  // 0.40-wide market would concede its way to −0.08, and the sign IS the
  // order's direction: that −0.08 reaches the broker as "sell it for 8 cents"
  // — four times BETTER than the mid, on an order that was meant to concede.
  // A concession that turns the trade round is not a concession.
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

/* ------------------------------------------------------------------
   DOES THE BODY THAT LEAVES AGREE IN SIGN WITH THE BOOK IT WILL MEET?

   The third debt PR #33 handed forward, and the one that would have caught
   the XLE order at the door. J-0001 went out as `limit_price: "0.75"` — a
   DEBIT — against a book whose mid was a CREDIT. An offer to PAY, dropped
   into a market that is paying YOU, is marketable by the whole width of the
   structure: it filled at once at four cents the other way.

   `limitDirection()` decides what direction an order of this intent SHOULD
   have from the structure's own net. `comboBook()` above says what direction
   the market is actually quoting. When those two disagree, one of them was
   built from a number that had lost its sign somewhere, and the order must
   not leave.

   IT IS THE SAME KIND OF QUESTION AS `priceability()` AND `contractListing()`,
   and it is asked in the same two places for the same reason: the gate is
   where all six order paths meet. It is NOT a quality floor — it makes no
   judgement about whether the trade is good. It asks whether the order says
   what the app meant it to say.

   FOUR THINGS MAKE IT SKIP, AND EACH IS A DIFFERENT UNKNOWN:

   1. NO LIMIT. A market order carries no price, so there is no sign to check.
   2. NO BOOK. `comboBook()` needs a two-sided quote on every leg; without one
      there is no market direction to compare against, and an unquoted book is
      UNKNOWN, never a book of zeros — the same rule as a missing open
      interest.
   3. A MID UNDER `MIN_NET_DOLLARS`. That is `priceability()`'s question and
      it already has its own violation and its own sentence. A structure whose
      mid is about nothing has no direction worth reading: the sign of $0.01
      is noise, and refusing on it would refuse the arbitrage cases twice
      under the wrong name.
   4. A SINGLE LEG. Its own `side` carries the direction and Alpaca refuses a
      negative limit on one, so the body is deliberately unsigned (order.js).

   A SKIP IS NOT A PASS AND IT SAYS SO. Every one of the four returns a
   sentence naming which unknown stopped it.
------------------------------------------------------------------ */

/**
 * @param limitPrice  the SIGNED `limit_price` the body carries (string or
 *   number, exactly as `mlegLimitPrice()` produced it), or null for a market
 *   order.
 * @param book        a `comboBook()` result — or null when the caller could
 *   not build one.
 * @param intent      "open" | "close"
 * @param legCount    how many legs the order has; under two the body is a
 *   simple order and is unsigned by design.
 * @returns {{ checked, ok, expected, got, reason, sentence }}
 *   `expected` and `got` are +1 debit / −1 credit / 0 unreadable.
 */
export function limitAgainstBook({ limitPrice = null, book = null, intent = "open", legCount = 0 } = {}) {
  const skip = (reason, sentence) => ({ checked: false, ok: true, expected: null, got: null, reason, sentence });
  const words = (d) => (d > 0 ? "a debit (money going out)" : "a credit (money coming in)");

  if (Math.round(Number(legCount) || 0) < 2) {
    return skip("single-leg", `This is a single-contract order, so its own buy-or-sell side already says which ` +
      `way the money goes and its limit is deliberately unsigned. There is no sign to check.`);
  }
  // `Number(null)` IS 0 AND 0 IS FINITE. The nulls go out before the coercion.
  const L = limitPrice == null || limitPrice === "" ? NaN : Number(limitPrice);
  if (!Number.isFinite(L) || +Math.abs(L).toFixed(2) === 0) {
    return skip("no-limit", `This order carries no readable limit price — a market order has none — so there is ` +
      `no direction on it to hold against the market. Nothing is checked here.`);
  }
  if (!book || book.ok !== true || !Number.isFinite(Number(book.mid))) {
    return skip("no-book", `The market on this structure cannot be read on both sides of every leg, so there is ` +
      `no direction to compare your limit against. An unquoted book is unknown, not a book of zeros: the check ` +
      `is skipped rather than passed.`);
  }
  const mid = Number(book.mid);
  if (Math.abs(mid) * 100 < MIN_NET_DOLLARS) {
    return skip("mid-too-small", `The middle of this structure's market is ${money(Math.abs(mid) * 100)} a ` +
      `combination, under the ${money(MIN_NET_DOLLARS)} this app will read a price at, so which SIDE of zero ` +
      `it falls on is noise rather than a direction. Whether there is a price at all is a different question, ` +
      `and it is asked before this one.`);
  }
  // The direction an order of this intent SHOULD carry, from the market's own
  // net, and the direction the body actually carries.
  const expected = limitDirection(mid, intent);
  const got = L > 0 ? 1 : -1;
  if (expected === 0) {
    return skip("mid-unreadable", `The middle of this structure's market does not fall on either side of zero, ` +
      `so there is no direction to compare against.`);
  }
  if (expected === got) {
    return { checked: true, ok: true, expected, got, reason: null,
      sentence: `Your limit and the market agree: ${intent === "close" ? "closing" : "opening"} this structure ` +
        `is ${words(got)}, and the order is written that way.` };
  }
  return {
    checked: true, ok: false, expected, got, reason: "inverted",
    sentence: `THE ORDER IS THE WRONG WAY ROUND. The market quotes this structure at ` +
      `${money(Math.abs(mid) * 100)} a combination, so ${intent === "close" ? "closing" : "opening"} it is ` +
      `${words(expected)} — and the order says ${words(got)}. An offer to pay, sent into a market that pays ` +
      `you, is met instantly at whatever the book gives: that is exactly how the XLE credit spread filled for ` +
      `$4 against $75 intended. Nothing is sent.`,
  };
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
 * `net` is SIGNED and is what the order takes; `limit` is the magnitude and is
 * what the ticket prints. See `closeLimitPrice()` above for why.
 *
 * A concession may never flip the sign, for the same reason it may not on a
 * close: a +0.02 debit conceded by 0.10 would price at −0.08, and a negative
 * mleg limit IS "sell it for eight cents".
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
  // ...AND IT CARRIES THE SAME HALF-CENT SLACK AS THE MID COMPARISON BELOW,
  // for the same reason: `book.ask` is a SUM of leg quotes, so a limit typed at
  // exactly the price that trades comes out 0.24 against 0.24000000000000005
  // and read "you are waiting" at the one price that fills. See `TICK_EPS`.
  const keener = (a, b) => (dir > 0 ? a >= b - 0.005 : a <= b + 0.005);
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

/* =====================================================================
   A LIMIT IS A CEILING, NOT A PRICE — AND EVERY FIGURE ON THE SCREEN
   IS WORKED OUT AT WHAT WOULD REALLY BE PAID.

   >>> READ ON THE OWNER'S PHONE, UNG 2026-09-20. <<< The Build screen said
   YOU PAY $14 · MOST YOU CAN MAKE $36 · MOST YOU CAN LOSE -$14 · BREAKEVEN
   10.64 — every one of those four numbers worked out from the MID — while
   `limitPlacement()` two thousand pixels below said, in these words, that a
   limit AT the mid is a limit nobody has to meet. At $24, the price that
   actually trades, the same structure pays $26, risks $24 and breaks even at
   10.74: NEARLY HALF THE REWARD AND NEARLY DOUBLE THE RISK. The user decided
   on 2.6:1 and could only have 1.1:1.

   Two facts, and neither of them was on screen:

     1. AN ORDER AT OR PAST THE TOUCH FILLS AT THE TOUCH. Offering more than
        the ask costs nothing — the broker fills you at the ask — and it buys
        a little protection against the quote moving while the order travels.
        The app explains far smaller things at length and never said this.
     2. SO THE PRICE THAT DECIDES THE TRADE IS `min(limit, ask)` ON A DEBIT
        AND `max(limit, bid)` ON A CREDIT, never the number typed. The mid
        stays on screen as the mid — it is still the honest "what it is
        worth" — but it is not the number the decision is made on.
===================================================================== */

/**
 * Which of two prices is the more aggressive offer, in the one place the
 * direction is decided. On a DEBIT you pay, so a bigger magnitude is keener;
 * on a CREDIT you receive, so a smaller one is. Every comparison in this
 * section and in `limitPlacement()` reads the same rule.
 */
/* HALF A CENT, WHICH IS UNDER THE SMALLEST PRICE A BROKER TAKES. Options on
   these chains are quoted in whole cents, so any difference smaller than this
   is floating point and not a decision: the mid of two two-decimal quotes is
   0.23000000000000004, and a typed 0.24 against a touch that came out of a
   summation as 0.24000000000000005 is EXACTLY at the touch. Without the slack
   a limit AT the price that trades reads as one that does not fill, which is
   the one sentence on this panel that must never be wrong. The same tolerance
   the mid comparison in `limitPlacement()` has always used. */
const TICK_EPS = 0.005;
const keenerThan = (dir, a, b) => (dir > 0 ? a >= b - TICK_EPS : a <= b + TICK_EPS);

/**
 * WHAT WOULD ACTUALLY BE PAID (or received) for a typed limit.
 *
 * @param limit  the MAGNITUDE the user typed, per share
 * @param book   `comboBook()`'s result
 * @param sign   +1 debit, -1 credit; taken from the book's own mid when null
 * @returns {{ known, dir, typed, touch, effective, net, capped, give }}
 *   `effective` is a MAGNITUDE per share, `net` the same figure signed the way
 *   `analyze().entry` is. `capped` is true when the limit is at or past the
 *   touch, which is the case the app never named. `give` is how far past.
 *   `known` false means there is no two-sided book: the typed number is then
 *   all there is, and it is returned unchanged rather than invented over.
 */
export function effectiveLimit(limit, book, sign = null) {
  const L = Math.abs(Number(limit));
  const dir = sign != null ? (Number(sign) >= 0 ? 1 : -1) : (book && book.ok && book.mid < 0 ? -1 : 1);
  if (!Number.isFinite(L) || L <= 0) {
    return { known: false, dir, typed: null, touch: null, effective: null, net: null, capped: false, give: null };
  }
  if (!book || !book.ok || !Number.isFinite(book.ask)) {
    return { known: false, dir, typed: L, touch: null, effective: L, net: dir * L, capped: false, give: null };
  }
  const touch = Math.abs(book.ask);   // the side that trades for the structure AS BUILT
  const capped = keenerThan(dir, L, touch);
  const effective = capped ? touch : L;
  return { known: true, dir, typed: L, touch, effective, net: dir * effective,
    capped, give: capped ? Math.abs(L - touch) : 0 };
}

/**
 * THE SENTENCE THE APP NEVER SAID. Only produced when the limit is past the
 * touch, because that is the only case where the two numbers differ — at or
 * inside the spread the typed price IS the price, and saying so twice would
 * be noise on a panel that is already dense.
 */
export const limitCeilingNote = (r) => {
  if (!r || !r.known || !r.capped) return null;
  const pay = r.dir > 0 ? "pay" : "receive";
  const offer = r.dir > 0 ? "offer" : "ask for";
  if (!(r.give > 0.0049)) {
    return `You ${offer} ${money(r.typed * 100)}, which is exactly what the other side is ` +
      `${r.dir > 0 ? "asking" : "bidding"}. Everything below is worked out at that price, not at the mid.`;
  }
  return `You ${offer} ${money(r.typed * 100)}, you ${pay} ${money(r.effective * 100)}. A limit is a CEILING, ` +
    `not a price: an order at or past the other side fills AT the other side, so the ` +
    `${money(r.give * 100)} beyond it costs you nothing and buys a little protection against the quote moving ` +
    `while the order travels. Every figure below is worked out at ${money(r.effective * 100)}.`;
};

/* =====================================================================
   TIME IN FORCE IS PART OF THE VERDICT, NOT A DROPDOWN.

   The same price is a different order depending on how long it stands. A
   limit inside the spread with GTC is "nobody is there now, but the order
   survives the close and over days this market moves"; the same price with
   DAY is "gone tonight, filled or not". The app stated the time in force in
   words AFTER the fact, underneath a verdict that had not read it.
===================================================================== */

/** The three states the ticket colours, and nothing else. */
export const ORDER_VERDICTS = ["fills", "waiting", "no-fill"];

/**
 * ONE VERDICT BAND: where the limit falls, how far from what trades today,
 * and what the chosen time in force does to that answer.
 *
 * Built ON `limitPlacement()` rather than beside it — the placement arithmetic
 * has one home and this adds the horizon to it. Its four zones collapse to
 * three because a band is a colour: "waiting, barely" and "will not fill" are
 * the same instruction to the reader.
 *
 * @param tif  "day" | "gtc"
 * @returns {{ known, state, label, distance, sentence, tifSentence, place }}
 */
export function orderVerdict(limit, book, { sign = null, tif = "day", type = "limit" } = {}) {
  if (type === "market") {
    return { known: true, state: "fills", label: "FILLS NOW", distance: null, place: null,
      sentence: `A market order takes whatever the other side is offering, whatever that turns out to be. On ` +
        `these chains the two sides can be a factor of three apart, so this is the one order type where you ` +
        `do not find out the price until after it is done.`,
      tifSentence: `Time in force does not apply: a market order is filled or killed at once.` };
  }
  const place = limitPlacement(limit, book, sign);
  if (!place.known) {
    return { known: false, state: null, label: null, distance: null, place, sentence: place.sentence, tifSentence: null };
  }
  const state = place.zone === "fills" ? "fills" : place.zone === "waiting" ? "waiting" : "no-fill";
  const dir = sign != null ? (Number(sign) >= 0 ? 1 : -1) : (book.mid >= 0 ? 1 : -1);
  const distance = Math.abs(Math.abs(Number(limit)) - Math.abs(book.ask));
  const under = money(distance * 100);
  const label = state === "fills" ? "FILLS NOW"
    : state === "waiting" ? `WAITING — ${under} ${dir > 0 ? "under" : "over"} what trades today`
      : "WILL NOT FILL";
  // >>> THE HALF THE OWNER SAID UNLOCKED IT. <<<
  const tifSentence = state === "fills"
    ? (tif === "gtc"
      ? `Good until cancelled, but it should not need the time: this price crosses the market now.`
      : `Today only, and that is enough: this price crosses the market now.`)
    : state === "waiting"
      ? (tif === "gtc"
        ? `GOOD UNTIL CANCELLED changes this answer. Nobody is at your price now — but the order survives ` +
          `tonight's close and keeps working, and over days this market moves. That is what makes a limit ` +
          `inside the spread a real trade rather than a wish.`
        : `TODAY ONLY makes this a different order. Nobody is at your price now, and at the close it is gone ` +
          `— filled or not, with nothing to show and nothing waiting. The same price good until cancelled ` +
          `would still be working tomorrow.`)
      : (tif === "gtc"
        ? `Good until cancelled will not rescue this one: the market has to come all the way to you, and you ` +
          `are on the far side of it.`
        : `Today only, and it will not fill today. At the close it is gone.`);
  return { known: true, state, label, distance, place, sentence: place.sentence, tifSentence };
}

/* =====================================================================
   THE MARKET, READ-ONLY, FIRST — AND ONE SLIDER PER LEG.

   The owner, three times, in his own words: "devo vedere il bid/ask di quel
   0.48 e 0.34 per capire quanto sono vicino a un ordine probabile." He set
   a limit at the exact mid because the panel gave him no way to see that
   nothing lives there.

   `legBook()` is that table as data, and `legLimitSeed()` is where the
   sliders start. Both are here rather than in the component for the reason
   every number beside a price is: a screen that derives it separately is a
   screen that can disagree with the one that sends the order.
===================================================================== */

/** A price on the tick. Options do not have continuous prices: a penny class
 *  ticks at a cent under $3.00, and 0.525 is not a price anybody can send. */
export const onTick = (x) => {
  const v = Number(x);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100) / 100;
};

/**
 * THE FOUR-ROW TABLE: each leg with its bid and its ask and the SIZE at each,
 * and which of the two is the side that trades when you buy the structure.
 *
 * THE SIZES WERE NEVER IN THE APP AND THEY ARRIVE FOR FREE. Alpaca's option
 * snapshot carries `latestQuote { bp, ap, bs, as }` and `chain.js` parsed the
 * two sizes away. They are carried now, with the same discipline as open
 * interest: A MISSING SIZE IS UNKNOWN, NEVER ZERO. `Number(null)` is 0 and 0
 * is finite, so a size has to BE a number before it is read as one — a row
 * drawn with a blank where a size should be reads as "nobody is there", which
 * is a different and much worse claim than "the feed did not say".
 *
 * @param legs   [{ side, qty, type, strike }]
 * @param quotes [{ bid, ask, bidSize, askSize }] one per leg, same order
 * @returns {{ rows, anySize, missingSizes, quoted, unquoted }}
 */
export function legBook(legs = [], quotes = []) {
  const ls = Array.isArray(legs) ? legs : [];
  let anySize = false, missingSizes = 0, quoted = 0, unquoted = 0;
  const rows = ls.map((l, i) => {
    const q = (quotes || [])[i] || {};
    const b = Number(q.bid), a = Number(q.ask);
    const twoSided = Number.isFinite(b) && Number.isFinite(a) && b > 0 && a > 0 && a >= b;
    if (twoSided) quoted++; else unquoted++;
    const side = Math.sign(+(l && l.side) || 1);
    const sizeOf = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);
    const bidSize = sizeOf(q.bidSize), askSize = sizeOf(q.askSize);
    if (bidSize != null || askSize != null) anySize = true;
    if (bidSize == null || askSize == null) missingSizes++;
    return {
      i, side, qty: Math.abs(Math.round(+(l && l.qty) || 0)) || 1,
      type: l && l.type, strike: l && l.strike,
      bid: twoSided ? b : (Number.isFinite(b) && b > 0 ? b : null),
      ask: twoSided ? a : (Number.isFinite(a) && a > 0 ? a : null),
      mid: twoSided ? (a + b) / 2 : null,
      bidSize, askSize,
      twoSided,
      // The side that trades when you BUY the structure: lift the ask on a leg
      // you are buying, hit the bid on a leg you are selling. The other side of
      // each row belongs to nobody's version of this trade and is dimmed.
      trades: side > 0 ? "ask" : "bid",
    };
  });
  return { rows, anySize, missingSizes, quoted, unquoted };
}

/** What a screen says instead of drawing a size it does not have. */
export const sizeSkippedNote = (n, feed) =>
  `${n === 1 ? "One leg" : `${n} legs`} came back with no size on ${n === 1 ? "its" : "their"} quote` +
  `${feed ? `, which is normal for ${feed}` : ""}. How many contracts are offered at a price is a fact the ` +
  `app either has or does not: an empty column is not a market with nobody in it.`;

/**
 * WHERE THE SLIDERS START — one price per leg, on the cent.
 *
 * Each leg is seeded at its own mid conceded `openLimitSlippage` of its own
 * spread TOWARD THE SIDE THAT TRADES, which sums to exactly `openLimitPrice()`
 * on the combination: a long leg conceded up and a short leg conceded down
 * both raise the debit, so the net is the combo mid plus the same share of the
 * combo spread. One arithmetic seen two ways, not two arithmetics.
 *
 * A leg with no two-sided quote has nothing to concede from and is seeded at
 * whatever single number it has (its mid, if any) — never invented, and the
 * table says which legs those are.
 *
 * @returns {?number[]} one price per leg, or null with no legs
 */
export function legLimitSeed(legs = [], quotes = [], { slippage = OPEN_LIMIT_SLIPPAGE } = {}) {
  const ls = Array.isArray(legs) ? legs : [];
  if (!ls.length) return null;
  const slip = Math.max(0, Number(slippage) || 0);
  return ls.map((l, i) => {
    const q = (quotes || [])[i] || {};
    const b = Number(q.bid), a = Number(q.ask);
    if (!Number.isFinite(b) || !Number.isFinite(a) || !(b > 0) || !(a > 0) || a < b) {
      const m = Number(q.mid);
      return Number.isFinite(m) && m > 0 ? onTick(m) : null;
    }
    const side = Math.sign(+(l && l.side) || 1);
    const mid = (a + b) / 2;
    const p = onTick(mid + side * slip * (a - b));
    // Cent rounding can push a concession a hair past the touch; it never may.
    return Math.min(a, Math.max(b, p));
  });
}

/**
 * THE NET, FROM THE LEGS — and the arithmetic that produced it, in words.
 *
 * The user prices each leg and the app computes the net, which is the reverse
 * of the single net field the ticket had. That is the direction he thinks in,
 * and it is why the net is never a number that appears from nowhere.
 *
 * @returns {{ net, ok, unpriced, terms, line }} `net` is signed per share the
 *   way `analyze().entry` is; `line` is `0.52 − 0.30 → $22`.
 */
export function netFromLegs(legs = [], prices = []) {
  const ls = Array.isArray(legs) ? legs : [];
  let net = 0, unpriced = 0;
  const terms = [];
  ls.forEach((l, i) => {
    // `Number(null)` IS 0 AND 0 IS FINITE. A leg nobody priced would arrive
    // here as a leg priced at nothing and be summed into the net as a free
    // option — the same coercion that turns a missing maximum profit into a
    // maximum of zero. The null has to be thrown out BEFORE the coercion.
    const raw = (prices || [])[i];
    const px = raw == null || raw === "" ? NaN : Number(raw);
    const side = Math.sign(+(l && l.side) || 1);
    const qty = Math.abs(Math.round(+(l && l.qty) || 0)) || 1;
    if (!Number.isFinite(px) || px < 0) { unpriced++; return; }
    net += side * qty * px;
    terms.push({ side, qty, px, text: `${side > 0 ? "" : "−"}${qty > 1 ? `${qty}×` : ""}${px.toFixed(2)}` });
  });
  const ok = ls.length > 0 && unpriced === 0;
  const body = terms.map((t, i) => (i === 0 ? t.text : `${t.side > 0 ? "+" : "−"} ${t.text.replace("−", "")}`)).join(" ");
  return { net: ok ? +net.toFixed(4) : null, ok, unpriced, terms,
    line: ok ? `${body} → ${money(Math.abs(net) * 100)}${net < 0 ? " credit" : ""}` : null };
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

/* =====================================================================
   THE APP NEVER PROPOSES A TRADE ITS OWN GATE WOULD BLOCK (P9, TASK 1)

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026. <<< The Radar and the
   multi-market search both ran at "HORIZON ~21 DTE" and every structure
   they offered sat on 2026-10-16, twenty-four days out. Taking any of them
   to Build produced, at the bottom of that screen:

       THIS ORDER WOULD NOT BE SENT
       ENTRY_DTE_ROOM — 3 days of room against the 30-day floor

   The app built a menu out of trades its own gate refuses. That is worse
   than an empty screen: an empty screen with a sentence teaches the rule,
   and a menu that dead-ends teaches that the rules are arbitrary.

   THE CAUSE IS THREE DIFFERENT WINDOWS IN THREE PLACES, none of them the
   rule:

       runMultiScan   dte >= dT - 20 && dte <= dT + 35   (at dT=21: 1..56)
       runWizard      dte >= minEntryDTE && dte <= 130   (a bare 130)
       the dropdown   every expiry the feed lists        (no filter at all)

   `buildableExpiries()` is the one home, and it is built ON `entryRoom()`
   so there is no second spelling of the floor anywhere. A board is
   BUILDABLE when the gate would pass it WITHOUT AN OVERRIDE — band
   "clear" — and inside `maxEntryDTE`.

   >>> THE OVERRIDE IS NOT WITHDRAWN. <<< `entryRoom()`'s middle band still
   unlocks with a typed reason, and `expiryChoice()`'s `passedOver` still
   offers a nearer, busier board. What changes is that the app will not
   OPEN a menu there by itself: a door you may choose to walk through is
   not the same as a corridor you are led down.

   THE HORIZON YIELDS, THE FLOOR NEVER DOES — the same fallback
   `expiryChoice()` already carries, and for the same reason: the far edge
   is a preference about which trade this app is for, and the near edge is
   the gate's.
===================================================================== */

/** Would the gate open a position on a board this far out, with no override? */
export const openableBoard = (dte) => entryRoom(dte).band === "clear";

/**
 * Which boards a generation site may build on.
 *
 * @param entries  `[{ key, dte, ... }]`, read off the chain. Anything else on
 *                 each entry is carried through untouched, so a caller can
 *                 hand in its own rows.
 * @returns {{ buildable, blocked, horizonYielded }}
 *   `blocked` carries each refused board with its `entryRoom()` band, so a
 *   screen can NAME what it is not offering instead of silently shortening a
 *   list — the rule `emptyExpiryNote()` and `offBoardStrikeLabel()` follow.
 */
export function buildableExpiries(entries = [], {
  maxEntryDTE = RULES.maxEntryDTE,
} = {}) {
  const all = (Array.isArray(entries) ? entries : [])
    // `Number(null)` IS 0 AND 0 IS FINITE: a board whose DTE has not been read
    // is UNKNOWN, and an unknown board is not a board that settles today. The
    // null goes out BEFORE the coercion, for the ninth time in this repository
    // — coercing first would file every unread board under "inside the exit
    // rule", which is a verdict the app has no evidence for.
    .filter((e) => e && e.key != null && e.dte != null && e.dte !== "" && Number.isFinite(Number(e.dte)))
    .map((e) => ({ ...e, dte: Number(e.dte), room: entryRoom(e.dte) }));
  const open = all.filter((e) => e.room.band === "clear");
  const inWindow = open.filter((e) => e.dte <= maxEntryDTE);
  const buildable = inWindow.length ? inWindow : open;
  const keep = new Set(buildable.map((e) => e.key));
  return {
    buildable,
    blocked: all.filter((e) => !keep.has(e.key)),
    horizonYielded: open.length > 0 && inWindow.length === 0,
  };
}

/** What a board the floor refuses is CALLED in a dropdown, so it can be shown
 *  and disabled rather than silently offered. The `offBoardStrikeLabel()`
 *  pattern: a `<select>` whose value matches no option displays the first one,
 *  and a list that quietly drops a row teaches nothing. */
export const offFloorExpiryLabel = (key, dte) => {
  const r = entryRoom(dte);
  if (r.band === "clear") return `${key} · ${dte} DTE`;
  return r.band === "inside-exit"
    ? `${key} · ${dte} DTE — inside the ${RULES.exitDTE}-day exit, not offered`
    : `${key} · ${dte} DTE — under the ${RULES.minEntryDTE}-day floor`;
};

/** Why the horizon control stops where it does, in ONE clause, from the rule. */
export const horizonFloorNote = () =>
  `from ${RULES.minEntryDTE} days, because the app will not build on a board the gate would refuse`;

/**
 * WHAT STEP 2 OFFERS WHEN THE FLOORS EMPTIED IT.
 *
 * "Go to Build — <structure>" carried whatever was left in the Build screen's
 * legs, which after a refusal is the structure the screen has just said it
 * will not offer. A button onto a trade the list above it removed is the same
 * fault as the menu this section exists to close, one screen later.
 */
export const emptyShortlistCta = ({ expKey = null, ticker = null } = {}) =>
  `Nothing on ${expKey || "this board"}${ticker ? ` for ${ticker}` : ""} survived the floors, so there is ` +
  `nothing here to take apart. Try another expiry above, another market on step 1, or take the answer: ` +
  `some days there is no trade worth making, and that is the app working rather than failing.`;

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

/* =====================================================================
   THE TRADE CARD — FIVE FIXED LINES, AND EVERYTHING ELSE ONE TAP AWAY.

   ROADMAP P4, unchanged since it was written: what you are betting on, what
   you risk, how often it works under your own exit rule, when it exits, what
   would invalidate it.

   >>> WHY IT IS FIVE SENTENCES AND NOT A LAYOUT. <<< The owner has said three
   times, in his own words, that the screens are unreadable — "si capisce poco
   dalla UI. Troppe info da leggere, poco intuitivo." Measured on the Build
   screen of 20 September, ONE decision: a leg-by-leg market table, two
   paragraphs about an unquoted leg, the quantity, the order type, the time in
   force, the send button, a combination-market panel, four stat tiles, a
   market-versus-model pair, a notional paragraph and an error box. None of it
   is wrong and none of it is cut; it simply is not a decision, and a decision
   is what that part of the screen is for.

   THE LINES ARE GENERATED SENTENCES AND THEY LIVE HERE, with every other
   generated sentence, so they cannot drift from the numbers they describe.

   >>> NO NEW ARITHMETIC. <<< Every figure on this card already exists on the
   screen: `analyze()` at the price that will be sent, `chanceOf()`'s one
   simulation, `sizing()`'s limits through the gate, `notionalControlled()`,
   and the rules themselves. This function READS them and writes English.

   >>> THE CURRENCY IS THE BROKER'S. <<< ROADMAP P4 said "what you risk in
   euros". The account is an Alpaca paper account denominated in US dollars and
   every figure in this app is a dollar; converting would put a second number
   on a card whose whole purpose is that there is one. It is SAID once, here,
   and the roadmap line is corrected rather than obeyed.
===================================================================== */

/** The one place the card says which money it is counting. */
export const CARD_CURRENCY = "US dollars";
export const cardCurrencyNote = () =>
  `Every figure on this card is in ${CARD_CURRENCY}. The account is an Alpaca paper account denominated in ` +
  `USD, so that is the currency the broker fills in and the one the app counts in — nothing here is converted.`;

/** Where a payoff pays, in words, from the breakevens the analysis produced. */
const profitWhere = (breakevens = [], dir = 0) => {
  const bs = (Array.isArray(breakevens) ? breakevens : []).filter((b) => known(b)).map(Number).sort((a, b) => a - b);
  if (!bs.length) return null;
  const px = (b) => `$${b.toFixed(2)}`;
  if (bs.length === 1) return `${dir < 0 ? "below" : "above"} ${px(bs[0])}`;
  if (bs.length === 2) return dir === 0 ? `between ${px(bs[0])} and ${px(bs[1])}` : `between ${px(bs[0])} and ${px(bs[1])}`;
  return `around ${bs.map(px).join(" / ")}`;
};

/**
 * FIVE LINES. Each one is an id, a fixed label and one generated sentence.
 *
 * Nothing here decides anything and nothing here is a floor: it is the reading
 * of figures other functions produced. A field it was not given becomes an
 * honest "not known" rather than a confident number — `Number(null)` is 0 and
 * 0 is finite, for the sixth time in this repository.
 *
 * @returns {{ lines: {id,label,text}[], currency: string, ids: string[] }}
 */
export function tradeCard({
  ticker = "this market", name = "this structure", dir = 0,
  spot = null, expKey = null, dte = null,
  maxLoss = null, maxProfit = null, breakevens = [], profitUnbounded = false,
  contracts = 1, chance = null, chanceNote = null, limits = null, notional = null,
  agreement = null, clashCount = 0, seasonalNote = null,
  entry = null, entrySource = null,
} = {}) {
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const risk = known(maxLoss) ? Math.abs(Number(maxLoss)) * n : null;
  const best = profitUnbounded || !known(maxProfit) ? null : Number(maxProfit) * n;
  const where = profitWhere(breakevens, dir);
  const days = known(dte) ? Math.round(Number(dte)) : null;
  const room = days == null ? null : days - RULES.exitDTE;

  /* 1 — WHAT YOU ARE BETTING ON. Direction, the level, and the horizon. */
  const dirWord = dir > 0 ? "goes up" : dir < 0 ? "goes down" : "stays where it is";
  const bet = `${ticker} ${dirWord}. ${where
    ? `You make money ${where} at expiry`
    : `Where it pays cannot be read: this structure has no breakeven the app could compute`}${
    known(spot) ? `, and ${ticker} is $${Number(spot).toFixed(2)} now` : ""}${
    expKey ? `. Expiry ${expKey}${days != null ? `, ${days} day${days === 1 ? "" : "s"} away` : ""}` : ""}.`;

  /* 2 — WHAT YOU RISK. The worst case, what share of capital it is, and what
     it CONTROLS — the fact that makes "capital at risk" mean anything.

     >>> AND THE PRICE IT WAS WORKED OUT AT, BY NAME. <<< Read on the owner's
     phone, SOYB 21 September 2026: the card said "risking $44 of $1,000", he
     then moved the ticket's sliders to the ask and sent $60. Both figures come
     from ONE expression — `AE` in App.jsx is `analyze()` at `effectiveLimit()`'s
     net, and the gate, this card and the ticket all read it — but the card
     never SAID which price it had read, and the order sheet that holds the
     sliders covers the card while they are being moved. A figure with no price
     attached, read before the price changed, is indistinguishable from a
     figure that disagrees with the order. Naming the price is what makes the
     two readable as one fact at two moments instead of two facts. */
  const perTrade = limits && known(limits.perTrade) ? Number(limits.perTrade) : null;
  const cap = limits && known(limits.tradingCapital) ? Number(limits.tradingCapital) : null;
  const owned = limits && limits.answered === false ? "the suggested" : "your";
  const atPrice = known(entry)
    ? ` at the ${money(Math.abs(Number(entry)) * 100)} ${Number(entry) < 0 ? "credit" : "debit"} ${
      entrySource === "limit" ? "the ticket is holding" : "the middle of the market"}`
    : "";
  const riskLine = risk == null
    ? `The worst case could not be computed, so there is nothing to measure against ${owned} per-trade limit. Nothing is sent.`
    : `${money(risk)}${atPrice}, and that is the most this can lose — fixed the moment it opens, never a dollar more${
      n > 1 ? ` (${n} combinations)` : ""}.${
      perTrade != null && cap ? ` That is ${pctText(risk / cap)} of capital, ${risk > perTrade ? "PAST" : "inside"} ${owned} ${money(perTrade)} per-trade limit.` : ""}${
      known(notional) ? ` It controls ${money(notional)} of ${ticker}: you can only lose the ${money(risk)}, and the position moves with all of it.` : ""}`;

  /* 3 — HOW OFTEN IT WORKS. The one chance, and an honest statement of WHICH
     question it answers: `chanceOf()` is where the price FINISHES. How it ends
     under the exit rule is walked day by day, and only on an open position —
     saying otherwise would be a field name asserting a reading nobody took. */
  const pop = chance && known(chance.pop) ? Number(chance.pop) : null;
  const often = pop == null
    ? `Not known: without a live price, a horizon and a seasonal reading there is no simulation to quote, and a missing chance is not a confident zero.`
    : `${chanceInTen(pop)} — ${chanceText(pop)} of ${Number(chance.runs || 0).toLocaleString("en-US")} simulated runs finish in profit AT EXPIRY${
      known(chance.ev) ? `, and the average of all of them is ${signedMoney(Number(chance.ev) * n)}` : ""}. ` +
      `That is where it ENDS. How it ends under your own exit rule is walked day by day, and the app only does ` +
      `that once the position is open.${chanceNote ? ` ${chanceNote}` : ""}`;

  /* 4 — WHEN IT EXITS. Chosen now, frozen now, and the stop named as a warning
     rather than an order, because that is what `RULES.stopLossEnforcement`
     says and what `autopilotVerdict()` does. */
  const exits = `${best != null
    ? `At ${pctText(RULES.takeProfitPct)} of the best case — ${money(best * RULES.takeProfitPct)} of ${money(best)} — or at `
    : `This structure has ${NO_CEILING}, so there is no take-profit figure to aim at. It exits at `}` +
    `${RULES.exitDTE} days to expiration${room != null ? `, ${room} day${room === 1 ? "" : "s"} from now` : ""}` +
    `${best != null ? ", whichever comes first" : ""}. Chosen now and frozen: the plan is not renegotiated while the ` +
    `trade is open. The ${pctText(RULES.stopLossPct)} stop is a WARNING and never an automatic close — the evidence for ` +
    `closing on it has not been measured.`;

  /* 5 — WHAT WOULD MAKE IT WRONG. */
  const wrong = `${where
    ? `${ticker} not ${where} with ${RULES.exitDTE} days left: the exit rule closes it there whatever you think at the time`
    : `The price of this structure cannot be read, which is already enough to make it wrong`}. ${
    clashCount > 0
      ? `${clashCount} of the four factors already disagree with this direction — that is what the written reason above is for.`
      : agreement
        ? `The four factors read ${agreement} today; if that turns, the reason you took this is gone even while the price has not moved.`
        : `The four factors have not been read for this market, so nothing is confirming the idea either.`}${
    seasonalNote ? ` ${seasonalNote}` : ""}`;

  return {
    ids: TRADE_CARD_IDS,
    currency: cardCurrencyNote(),
    lines: [
      { id: "bet", label: "YOU ARE BETTING", text: bet },
      { id: "risk", label: "YOU RISK", text: riskLine },
      { id: "often", label: "HOW OFTEN IT WORKS", text: often },
      { id: "exits", label: "WHEN IT EXITS", text: exits },
      { id: "wrong", label: "WHAT WOULD MAKE IT WRONG", text: wrong },
    ],
  };
}

/** The five, in order, so nothing can render four of them and call it the card. */
export const TRADE_CARD_IDS = ["bet", "risk", "often", "exits", "wrong"];

export default RULES;
