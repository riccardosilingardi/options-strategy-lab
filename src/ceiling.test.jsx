// ============================================================================
// src/ceiling.test.jsx — AN UNKNOWN IS NOT A NUMBER.
//
// Four faults are held here, and they are one fault wearing four coats: the app
// printing something it does not know as something it does.
//
//  0. A maximum LOSS that came out POSITIVE is an arbitrage, therefore invented
//     quotes, and it is refused at every generation site — the debt PR #14
//     wrote down and left open.
//  1. A maximum PROFIT on a payoff with no ceiling is not a number at all. It
//     used to be the payoff at +30%, which is where somebody stopped sampling,
//     and that artefact fed the reward-to-risk, the expected value and the
//     ranking that put WEAT Long Call ATM at the top of the wide search.
//  2. The takeaway sentence adding a true frequency to a true payout and
//     producing a false impression: a flat wing paying $1 counted inside "73%
//     of the time" next to "up to $50".
//  3. One trade, two breakevens: the Shortlist said $20.67 and Build $20.68,
//     because one interpolated the crossing and the other took the middle of
//     the grid step it fell in.
//
// This file imports the REAL generation site (`analyze`, `shortlistWithFloors`
// from App.jsx), not a copy of it — the whole point is that no second
// implementation of these decisions exists.
// ============================================================================
import {
  payoffCeiling, profitUnbounded, impossibleLoss, impossibleLossNote, scratchLevel,
  qualityFloor, rewardRisk, reportNarrativePrompt, NOTHING_TODAY, NO_CEILING, RULES,
} from "./rules.js";
import { payoffBands, payingBands, bandsAbove, scratchSplit, unifiedTakeaway, explainElement, exitPlanDetail, compareTakeaway } from "./visuals.jsx";
import { analyze, shortlistWithFloors, buildPresets } from "./App.jsx";
import { payoff } from "./engine.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, sub) => { if (!String(s).includes(sub)) throw new Error(`missing ${JSON.stringify(sub)} in ${JSON.stringify(String(s).slice(0, 220))}`); };
const hasNot = (s, sub) => { if (String(s).includes(sub)) throw new Error(`should not contain ${JSON.stringify(sub)}: ${JSON.stringify(String(s).slice(0, 220))}`); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} is not within ${tol} of ${b}`); };
const oneSentence = (s) => {
  const t = String(s).trim();
  const stops = (t.replace(/\d\.\d/g, "00").match(/\.(?=\s|$)/g) || []).length;
  if (stops !== 1 || !t.endsWith(".")) throw new Error(`not one sentence: ${JSON.stringify(t)}`);
};

/* ---- structures ---- */
const longCall = [{ side: 1, type: "call", strike: 100, qty: 1 }];
const longPut = [{ side: 1, type: "put", strike: 100, qty: 1 }];
const bullCall = [{ side: 1, type: "call", strike: 100, qty: 1 }, { side: -1, type: "call", strike: 105, qty: 1 }];
const nakedCall = [{ side: -1, type: "call", strike: 105, qty: 1 }];
const butterfly = [
  { side: 1, type: "call", strike: 95, qty: 1 },
  { side: -2, type: "call", strike: 100, qty: 2 },
  { side: 1, type: "call", strike: 105, qty: 1 },
];
// The live UNG case from the task: a broken-wing call butterfly opened for a
// $1 credit ONE CONTRACT — 0.01 a share — with spot at 10.57. +$1 anywhere
// below 10.50, +$8 at spot, +$51 at the 11.00 peak, -$49 above 12.00. Every
// figure in the sentence about it was true; the sentence was not.
const ungBroken = [
  { side: 1, type: "call", strike: 10.5, qty: 1 },
  { side: -2, type: "call", strike: 11.0, qty: 2 },
  { side: 1, type: "call", strike: 12.0, qty: 1 },
];
const UNG_CREDIT = -0.01;   // a $1 credit on one contract, per share
const UNG_SPOT = 10.57;

/* ==================================================================
   TASK 1 — boundedness is a property of the legs
================================================================== */

check("bounded above is the net signed CALL quantity, not the edge of a grid", () => {
  eq(payoffCeiling(longCall).above, false, "a long call has no ceiling");
  eq(payoffCeiling(longCall).callQty, 1, "net call quantity");
  eq(payoffCeiling(bullCall).above, true, "a call spread is capped by its short leg");
  eq(payoffCeiling(butterfly).above, true, "a butterfly is capped");
  eq(payoffCeiling(ungBroken).above, true, "a broken-wing butterfly is still capped");
  eq(profitUnbounded(longCall), true, "the one-question form agrees");
  eq(profitUnbounded(bullCall), false, "and on the bounded side too");
});

check("the DOWNSIDE is unbounded only for an uncovered short call", () => {
  eq(payoffCeiling(nakedCall).below, false, "a naked short call has no floor");
  eq(payoffCeiling(bullCall).below, true, "a spread has one");
  // A long put gains as the price falls, but the price stops at zero, so its
  // best case is its strike: large, and finite. Calling it unbounded would be
  // the same mistake pointing the other way.
  eq(payoffCeiling(longPut).above, true, "a long put HAS a ceiling — the price cannot go below zero");
  eq(payoffCeiling(longPut).below, true, "and a floor");
});

check("analyze() reports NO maximum profit rather than the payoff at +30%", () => {
  const a = analyze(longCall, 100, 45, 0.3, null);
  eq(a.maxProfit, null, "maximum profit");
  eq(a.profitUnbounded, true, "and it says why");
  // The grid edge is still there for anything that has to draw a picture — it
  // is simply not the answer to "what is the most this can make".
  if (!(a.sampledMaxProfit > 0)) throw new Error("the sampled top should still exist for drawing");
  // ...and it is exactly the artefact: the payoff at 1.3 x spot.
  near(a.sampledMaxProfit, (payoff(longCall, 130) - a.entry) * 100, 1, "the sampled top IS the grid edge");
});

check("a maximum LOSS is still always a finite number — rule 2 is untouched", () => {
  for (const legs of [longCall, longPut, bullCall, butterfly, ungBroken]) {
    const a = analyze(legs, 100, 45, 0.3, null);
    if (!Number.isFinite(a.maxLoss)) throw new Error("a maximum loss must always be known");
  }
});

check("nothing that needs a finite best case is computed from the grid edge", () => {
  const a = analyze(longCall, 100, 45, 0.3, null);
  eq(rewardRisk(a.maxProfit, a.maxLoss), null, "reward-to-risk prints an em dash, not a ratio");
  const b = payoffBands({ legs: longCall, entryNet: a.entry, spot: 100 });
  eq(b.maxProfit, null, "the bands agree with the analysis");
  eq(b.unbounded, true, "and say so");
  if (!(b.sampledTop > 0)) throw new Error("the drawing code still gets a number to scale to");
});

check("the reward floor is SKIPPED on an unbounded profit, never failed", () => {
  const q = qualityFloor({ openInterest: [500, 500], maxProfit: null, maxLoss: -220, unboundedProfit: true });
  eq(q.reward.checked, false, "not checked");
  eq(q.reward.pass, true, "and therefore not a rejection");
  eq(q.pass, true, "so the candidate survives to be shown and ranked last");
  // Without the flag an unknown ratio IS a failure, which is what would have
  // made every long call vanish from the Shortlist without a word.
  const q2 = qualityFloor({ openInterest: [500, 500], maxProfit: null, maxLoss: -220 });
  eq(q2.pass, false, "an unknown ratio with no reason given still fails");
});

check("the words for having no ceiling are written once and never a dash", () => {
  eq(NO_CEILING, "no ceiling", "the phrase");
  has(explainElement("green", payoffBands({ legs: longCall, entryNet: 2.2, spot: 100 })), NO_CEILING);
  hasNot(explainElement("green", payoffBands({ legs: longCall, entryNet: 2.2, spot: 100 })), "worth up to");
  has(explainElement("payoff", payoffBands({ legs: longCall, entryNet: 2.2, spot: 100 })), NO_CEILING);
  // ...and a bounded structure still prints its real ceiling.
  has(explainElement("payoff", payoffBands({ legs: bullCall, entryNet: 2, spot: 100 })), "Best case");
});

check("half of an unknown maximum is not $0 of profit", () => {
  has(exitPlanDetail(null), NO_CEILING);
  hasNot(exitPlanDetail(null), "$0 of profit");
  has(exitPlanDetail(null), `${RULES.exitDTE}-day`);   // the half of the plan that survives
  has(exitPlanDetail(400), "$200 of profit");
});

check("a candidate with no ceiling is not ranked as the one that pays least", () => {
  const items = [
    { name: "Long Call ATM", maxProfit: null, pop: 0.3, risk: 220 },
    { name: "Bull Call Spread", maxProfit: 300, pop: 0.45, risk: 200 },
  ];
  const t = compareTakeaway(items);
  has(t, "Long Call ATM");
  has(t, NO_CEILING);
  hasNot(t, "Bull Call Spread pays the most");
});

/* ==================================================================
   TASK 0 — a worst case that is a profit
================================================================== */

check("a positive maximum loss is refused, with the number in the sentence", () => {
  eq(impossibleLoss(-120), null, "a real loss is not refused");
  eq(impossibleLoss(0), null, "zero is the unpriceable test's business, not this one");
  eq(impossibleLoss(NaN), null, "an unknown is not an arbitrage");
  const why = impossibleLoss(37);
  has(why, "$37");
  has(why, "arbitrage");
});

check("the refusal is in the same register as UNPRICEABLE — a sentence and a count", () => {
  has(impossibleLossNote(1, "BOIL"), "1 structure was left out");
  has(impossibleLossNote(3, "BOIL"), "3 structures were left out");
  has(impossibleLossNote(2, "CORN"), "CORN");
  const screen = NOTHING_TODAY.impossibleLoss({ impossible: 4, markets: ["UNG", "BOIL"] });
  has(screen, "UNG, BOIL");
  has(screen, "4");
  // ...and it is NOT the same sentence as the board the app could not price.
  if (screen === NOTHING_TODAY.unpriceable({ unpriceable: 4, markets: ["UNG", "BOIL"] })) {
    throw new Error("two different refusals must not share one sentence");
  }
});

check("the Shortlist refuses it too — the site PR #14 said still ranked it", () => {
  // A chain quoting the 105 call at MORE than the 100 call: buying the spread
  // pays you, so its worst case is a profit. Nothing on a real board does this;
  // one placeholder quote does.
  const strikes = [95, 100, 105, 110];
  const quote = (leg) => {
    const px = { 95: 6.0, 100: 3.0, 105: 4.2, 110: 0.8 }[leg.strike];
    return px == null ? null : { mid: px, bid: px - 0.05, ask: px + 0.05, iv: 0.3, oi: 500, vol: 10 };
  };
  const r = shortlistWithFloors("bull", 100, 5, strikes, 45, 0.3, quote);
  const impossible = r.cut.filter((c) => c.why === "impossible");
  if (!impossible.length) throw new Error("a structure that cannot lose must be cut, not ranked");
  eq(r.tally.impossible, impossible.length, "and counted separately from the floors'");
  has(impossible[0].reasons[0], "arbitrage");
  // It never reaches the rows, at any liquidity setting.
  for (const row of r.rows) {
    if (row.a.maxLoss >= 0) throw new Error(`${row.p.name} was offered with a worst case of ${row.a.maxLoss}`);
  }
});

check("the count travels separately: no floor did that work", () => {
  const strikes = [95, 100, 105, 110];
  const quote = (leg) => {
    const px = { 95: 6.0, 100: 3.0, 105: 4.2, 110: 0.8 }[leg.strike];
    return px == null ? null : { mid: px, bid: px - 0.05, ask: px + 0.05, iv: 0.3, oi: 500, vol: 10 };
  };
  const r = shortlistWithFloors("bull", 100, 5, strikes, 45, 0.3, quote);
  eq(r.tally.liquidity, 0, "not blamed on liquidity");
  eq(r.tally.reward, 0, "not blamed on reward-to-risk");
});

/* ==================================================================
   TASK 2 — a scratch is not a win
================================================================== */

check("the scratch level is one named constant, and null when there is no maximum", () => {
  eq(scratchLevel(51), RULES.scratchPayoffShare * 51, "a share of the best case");
  eq(scratchLevel(null), null, "no ceiling, no share to take");
  eq(scratchLevel(0), null, "and nothing to divide either");
});

check("the profit region is cut at the scratch level with the same interpolation", () => {
  const entry = UNG_CREDIT;
  const b = payoffBands({ legs: ungBroken, entryNet: entry, spot: 10.57 });
  // The whole green band runs from the bottom of the range to about 11.51...
  const green = b.bands.filter((z) => z.sign > 0);
  eq(green.length, 1, "one green band");
  near(green[0].hi, 11.51, 0.03, "the breakeven the old sentence quoted");
  // ...but the money is a much narrower slice of it.
  const pay = payingBands(b);
  eq(pay.length, 1, "one paying region");
  if (!(pay[0].lo > green[0].lo)) throw new Error("the flat wing must be outside the paying region");
  if (!(pay[0].hi < green[0].hi)) throw new Error("so must the tail above the peak");
  // The flat wing pays $1 against a $51 peak — nowhere near the level.
  const lv = scratchLevel(b.maxProfit);
  if (!(b.at(10.0) < lv)) throw new Error("the $1 wing should be under the scratch level");
  if (!(b.at(11.0) > lv)) throw new Error("the peak should be over it");
});

check("bandsAbove() finds every crossing, including a band that never clears", () => {
  const b = payoffBands({ legs: ungBroken, entryNet: UNG_CREDIT, spot: UNG_SPOT });
  eq(bandsAbove(b, 1e9).length, 0, "nothing clears an impossible level");
  eq(bandsAbove(b, -1e9).length, 1, "everything clears an impossible one the other way");
  eq(bandsAbove(b, NaN).length, 0, "an unknown level cuts nothing");
});

check("the takeaway separates where the money is from how often it scratches", () => {
  const b = payoffBands({ legs: ungBroken, entryNet: UNG_CREDIT, spot: UNG_SPOT });
  const t = unifiedTakeaway(b, { ticker: "UNG", sigma: 0.55, dte: 30 });
  oneSentence(t);
  has(t, "UNG");
  has(t, "scratch");
  // Both halves are quoted: how often it is green at all, and how often it
  // actually pays.
  const sp = scratchSplit(b, { spot: 10.57, sigma: 0.55, dte: 30 });
  if (!(sp.pScratch > sp.pPaying)) throw new Error("this is the case where most of the green is a scratch");
  if (!(sp.pPaying < sp.inProfit)) throw new Error("the paying chance must be a subset of the profit chance");
});

check("a trade whose green is mostly money says nothing about scratches", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: 100 });
  const t = unifiedTakeaway(b, { ticker: "CORN", sigma: 0.25, dte: 30 });
  oneSentence(t);
  hasNot(t, "scratch");
});

check("payoffBands(), profitBands() and chanceInProfit() are unchanged arithmetic", () => {
  // The task said the arithmetic was already correct: this holds that line.
  const b = payoffBands({ legs: ungBroken, entryNet: UNG_CREDIT, spot: UNG_SPOT });
  for (const s of [9, 10.2, 10.57, 11, 11.4, 12.5]) {
    near(b.at(s), (payoff(ungBroken, s) - UNG_CREDIT) * 100, 1e-6, `payoff at ${s}`);
  }
  near(b.at(10.2), 1, 0.01, "the flat wing pays back the $1 credit and nothing else");
  near(b.at(UNG_SPOT), 8, 0.01, "expiring at today's price pays $8");
  near(b.at(11), 51, 0.01, "the peak pays $51");
  near(b.at(12.5), -49, 0.01, "and above the far wing it loses $49");
});

/* ==================================================================
   TASK 3 — one trade, one breakeven
================================================================== */

check("the breakeven is interpolated inside the bracket, not the middle of it", () => {
  // BOIL: a call spread whose exact breakeven is 20.50 + 0.17 = 20.67. The old
  // code took the midpoint of a grid step 0.051 wide and printed 20.68.
  const legs = [{ side: 1, type: "call", strike: 20.5, qty: 1 }, { side: -1, type: "call", strike: 22.5, qty: 1 }];
  const quote = (leg) => {
    const px = { 20.5: 0.87, 22.5: 0.70 }[leg.strike];
    return px == null ? null : { mid: px, bid: px - 0.02, ask: px + 0.02, iv: 0.6, oi: 400, vol: 5 };
  };
  const a = analyze(legs, 20.65, 45, 0.6, quote);
  near(a.entry, 0.17, 1e-9, "the debit");
  eq(a.breakevens.length, 1, "one breakeven");
  eq(a.breakevens[0], 20.67, "exactly the strike plus the debit");
});

check("Build and the Shortlist print the SAME breakeven string for one trade", () => {
  const legs = [{ side: 1, type: "call", strike: 20.5, qty: 1 }, { side: -1, type: "call", strike: 22.5, qty: 1 }];
  const quote = (leg) => {
    const px = { 20.5: 0.87, 22.5: 0.70 }[leg.strike];
    return px == null ? null : { mid: px, bid: px - 0.02, ask: px + 0.02, iv: 0.6, oi: 400, vol: 5 };
  };
  const a = analyze(legs, 20.65, 45, 0.6, quote);
  const b = payoffBands({ legs, entryNet: a.entry, spot: 20.65 });
  // Build prints `a.breakevens`; the band takeaway is cut from `payoffBands`.
  eq(a.breakevens[0].toFixed(2), b.breakevens[0].toFixed(2), "two screens, one number");
  eq(a.breakevens[0].toFixed(2), "20.67", "and it is the exact one");
});

check("the two agree across every preset, not just the one that was reported", () => {
  const strikes = [90, 95, 100, 105, 110];
  const quote = (leg) => {
    const iv = 0.3, t = 45 / 365;
    // A plain, well-behaved board: the point is the crossing, not the price.
    const px = leg.type === "call" ? Math.max(0.4, 100 * 0.04 - (leg.strike - 100) * 0.5)
      : Math.max(0.4, 100 * 0.04 + (leg.strike - 100) * 0.5);
    return { mid: +px.toFixed(2), bid: +(px - 0.05).toFixed(2), ask: +(px + 0.05).toFixed(2), iv, oi: 800, vol: 20, t };
  };
  for (const sent of ["verybear", "bear", "neutral", "bull", "verybull"]) {
    for (const p of buildPresets(sent, 100, 5, strikes)) {
      const a = analyze(p.legs, 100, 45, 0.3, quote);
      const b = payoffBands({ legs: p.legs, entryNet: a.entry, spot: 100 });
      eq(a.breakevens.length, b.breakevens.length, `${p.name}: how many breakevens`);
      a.breakevens.forEach((x, i) => eq(x.toFixed(2), b.breakevens[i].toFixed(2), `${p.name}: breakeven ${i}`));
    }
  }
});

/* ==================================================================
   TASK 4 — the report cannot invent a position
================================================================== */

check("the prompt changes with an EMPTY positions array", () => {
  const empty = reportNarrativePrompt([]);
  const one = reportNarrativePrompt([{ ticker: "BOIL" }]);
  if (empty === one) throw new Error("the prompt must not be the same with and without a book");
  hasNot(empty, "what to prioritise on the");
  has(one, "what to prioritise on the 1 open position");
  has(reportNarrativePrompt([{}, {}]), "2 open positions");
});

check("the prompt names paperPositions as authoritative, in both states", () => {
  has(reportNarrativePrompt([]), "paperPositions");
  has(reportNarrativePrompt([{}]), "paperPositions");
  // ...and with nothing open it says what the model must NOT do: describe the
  // structure loaded on Build as a trade that was entered.
  has(reportNarrativePrompt([]), "EMPTY");
  has(reportNarrativePrompt([]), "currentStrategy");
  has(reportNarrativePrompt([]), "has NOT been entered");
});

check("the default argument is safe: no positions at all is the empty case", () => {
  eq(reportNarrativePrompt(), reportNarrativePrompt([]), "no argument");
  eq(reportNarrativePrompt(null), reportNarrativePrompt([]), "a null book");
});

for (const [n, m] of bad) console.log(`  FAIL ${n}\n       ${m}`);
for (const n of ok) console.log(`  ok   ${n}`);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
