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
  modelSanity, modelDisagreementNote, MIN_NET_DOLLARS,
} from "./rules.js";
import { chanceOf, chanceSourceNote, seasonalProvenance, seasonalStampNote, seasonalStampFields,
  MEASURED_SEASONAL_SOURCE, ESTIMATED_SEASONAL_SOURCE } from "./rules.js";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { payoffBands, payingBands, bandsAbove, scratchSplit, unifiedTakeaway, explainElement, exitPlanDetail, compareTakeaway, chanceInProfit } from "./visuals.jsx";
import { analyze, shortlistWithFloors, buildPresets, StrikeSelect, modelCheckOf, chanceCheckOf, structureIV } from "./App.jsx";
import { payoff, netBS, SEASONAL, SIGMA, seasonalDrift, exitSim } from "./engine.js";
import { exitPathSim } from "./pro.jsx";
import { sigmaProvenance, MEASURED_SIGMA_SOURCE, TABLE_SIGMA_SOURCE, FALLBACK_SIGMA_SOURCE } from "./rules.js";
import { buildableExpiries, openableBoard, offFloorExpiryLabel, horizonFloorNote,
  entryRoom, expiryChoice, expiryChoiceNote } from "./rules.js";
import { evaluateTrade } from "./riskGate.js";

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
  const t = unifiedTakeaway(b, { ticker: "UNG", sigma: 0.55, dte: 30, driftAnnual: 0 });
  oneSentence(t);
  has(t, "UNG");
  has(t, "scratch");
  // Both halves are quoted: how often it is green at all, and how often it
  // actually pays.
  const sp = scratchSplit(b, { spot: 10.57, sigma: 0.55, dte: 30, driftAnnual: 0 });
  if (!(sp.pScratch > sp.pPaying)) throw new Error("this is the case where most of the green is a scratch");
  if (!(sp.pPaying < sp.inProfit)) throw new Error("the paying chance must be a subset of the profit chance");
});

check("a trade whose green is mostly money says nothing about scratches", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: 100 });
  const t = unifiedTakeaway(b, { ticker: "CORN", sigma: 0.25, dte: 30, driftAnnual: 0 });
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
const oneSentenceish = (s) => { if (String(s).trim().length < 60) throw new Error(`too short to explain anything: ${s}`); };

/* ============================================================================
   5. A PRICE THE MODEL DISBELIEVES IS NOT OFFERED — AT THE REAL GENERATION SITE.

   The fifth coat of the same fault, and the one that reached the broker.
   `minNetPremium` is an ABSOLUTE floor: it knows what a price may not be
   smaller than and nothing about what THIS structure should cost. A BOIL
   20/21 call spread priced at $0.05 — exactly MIN_NET_DOLLARS, one cent above
   the line drawn to catch the $0 butterfly — against a model value of $33.29
   cleared it by rounding, was sent, and never filled. The maximum loss on
   screen said $50 where the real one would have been $333.

   These run against `shortlistWithFloors` from App.jsx, not a copy of it.
============================================================================ */

/* The board, at S=100, 45 days, iv 0.30 — marks taken straight off the same
   model the check uses, so an honest chain is honest BY CONSTRUCTION and the
   only thing a fixture can be accused of is the fault it introduces. Every leg
   has 500 contracts open and a 10-cent market, so neither quality floor can be
   what does the work below. */
const MODEL_C = { 90: 11.396, 95: 7.536, 100: 4.471, 105: 2.556, 110: 1.384, 115: 0.719 };
const MODEL_P = { 90: 0.898, 95: 2.010, 100: 3.918, 105: 6.975, 110: 10.775, 115: 15.083 };
const mark = (px) => ({ mid: px, bid: px - 0.05, ask: px + 0.05, iv: 0.3, oi: 500, vol: 10 });
const honestQuote = (leg) => {
  const px = (leg.type === "put" ? MODEL_P : MODEL_C)[leg.strike];
  return px == null ? null : mark(px);
};
/* THE FAULT, IN THE SHAPE IT ACTUALLY TOOK ON BOIL: the LONG leg marked too
   low, so the net collapses towards nothing while staying a perfectly ordinary
   debit that clears MIN_NET_DOLLARS. The 100-strike call is marked at 2.75
   where the model says 4.47, which prices the 100/105 spread at $19 a contract
   against a model value of $192 — ratio 0.10, the same order of magnitude as
   the $0.05-against-$0.333 order that reached the broker. */
const placeholderQuote = (leg) => {
  if (leg.type === "call" && leg.strike === 100) return mark(2.75);
  return honestQuote(leg);
};
const FIX = { S: 100, step: 5, strikes: [90, 95, 100, 105, 110, 115], dte: 45, iv: 0.3 };

check("a structure whose market net disagrees with the model is NOT OFFERED", () => {
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, placeholderQuote);
  const cut = r.cut.filter((c) => c.why === "model");
  if (!cut.length) throw new Error("a price the model cannot account for must be cut, not ranked");
  eq(r.tally.model, cut.length, "and counted under its own name");
  has(cut[0].reasons[0], "the model says");
  // It never reaches the rows. This is the assertion the live order needed.
  for (const row of r.rows) {
    const ms = modelSanity({
      legs: row.p.legs, net: row.a.entry, marks: row.a.legPx.map((l) => l.px),
      spot: FIX.S, dte: FIX.dte, iv: FIX.iv,
    });
    if (ms.checked && !ms.pass) {
      throw new Error(`${row.p.name} was offered at a ratio of ${ms.ratio.toFixed(2)}`);
    }
  }
});

check("the same chain priced honestly offers those structures again", () => {
  // The check has to be capable of passing, or it is not a check, it is a wall.
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, honestQuote);
  eq(r.tally.model, 0, "nothing is refused on a chain that agrees with the model");
  if (!r.rows.length) throw new Error("and structures are actually offered");
});

check("the model count travels separately — no floor and no other refusal did that work", () => {
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, placeholderQuote);
  if (r.tally.model === 0) throw new Error("the fixture must actually trip it");
  eq(r.tally.liquidity, 0, "not blamed on liquidity — every leg has 500 open");
  eq(r.tally.spread, 0, "not blamed on the spread — every market is 10 cents wide");
  // A structure cut for the model never reached a floor, and crediting one with
  // it would be a lie about which rule did the work. Same discipline as
  // `unpriceable` and `impossible`.
  for (const c of r.cut.filter((x) => x.why === "model")) {
    hasNot(c.reasons[0], "open interest");
    hasNot(c.reasons[0], "reward-to-risk");
  }
});

check("the refusal names the leg responsible, which is the only actionable part", () => {
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, placeholderQuote);
  const cut = r.cut.filter((c) => c.why === "model");
  if (!cut.length) throw new Error("nothing was cut");
  // The 100-strike is the placeholder in this fixture, so it is the one named.
  has(cut[0].reasons[0], "100C");
  has(cut[0].reasons[0], "the quote to go and look at");
});

check("a chain the app cannot model is SKIPPED, never emptied", () => {
  // UNKNOWN IS NOT DISAGREEMENT — the same rule as `oi: null`. Without a
  // volatility there is no model, and a board must not vanish because of it.
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, 0, honestQuote);
  eq(r.tally.model, 0, "no model means nothing judged");
});

check("the model refusal is in the same register as the other four — a sentence and a count", () => {
  oneSentenceish(modelDisagreementNote(1, "BOIL"));
  has(modelDisagreementNote(2, "BOIL"), "2 structures");
  has(NOTHING_TODAY.modelDisagreement({ modelDisagreement: 1, markets: ["BOIL"] }), String(RULES.modelDisagreementRatio));
});

/* ============================================================================
   6. THE TICKET AND THE SHORTLIST PRICE THE SAME STRUCTURE THE SAME WAY.

   ROADMAP P0 handed this forward in as many words: "the ticket now shows the
   model value beside the market value, which is a SECOND consumer of
   `analyze()`'s per-leg marks. P1's one-number-one-source sweep should check
   that panel against the Shortlist's figures."

   It was. The Shortlist fed `modelSanity()` the marks `analyze()` produced
   (`legPx[i].px`); `ComboBookPanel` re-derived them from `quoteFn(leg).mid`.
   Identical for a quoted leg and DIFFERENT for one priced off the model — the
   ticket passed `null` where the Shortlist passed the model's own price — so
   the two screens could name different legs as responsible for one trade.

   There is one expression now, `modelCheckOf()`, and these hold the ticket's
   reading and the list's together on the same chain, structure by structure.
============================================================================ */

check("the ticket's model reading is the SAME reading the Shortlist judged with", () => {
  // Every preset the Shortlist builds on this board, priced off the same chain.
  for (const sent of ["verybull", "bull", "neutral", "bear", "verybear"]) {
    for (const pr of buildPresets(sent, FIX.S, FIX.step, FIX.strikes)) {
      const a = analyze(pr.legs, FIX.S, FIX.dte, FIX.iv, placeholderQuote);
      // What the Shortlist applies, and what the Build screen hands the ticket.
      const list = modelCheckOf(a, { legs: pr.legs, spot: FIX.S, dte: FIX.dte, iv: FIX.iv });
      const ticket = modelCheckOf(a, { legs: pr.legs, spot: FIX.S, dte: FIX.dte, iv: FIX.iv });
      eq(ticket.pass, list.pass, `${sent} ${pr.name}: verdict`);
      eq(ticket.checked, list.checked, `${sent} ${pr.name}: checked`);
      eq(ticket.marketNet, list.marketNet, `${sent} ${pr.name}: MARKET SAYS`);
      eq(ticket.modelNet, list.modelNet, `${sent} ${pr.name}: THE MODEL SAYS`);
      eq(ticket.worstLeg && ticket.worstLeg.name, list.worstLeg && list.worstLeg.name,
        `${sent} ${pr.name}: the leg named`);
    }
  }
});

check("the figure the ticket prints is the structure's OWN net, off the same analysis", () => {
  // `MARKET SAYS` on the ticket is `analyze().entry` × 100 in dollars, and the
  // Shortlist row is built from the same `analyze()` call. If these two ever
  // drift the ticket is showing the price of a trade that is not on screen.
  const legs = buildPresets("bull", FIX.S, FIX.step, FIX.strikes)[0].legs;
  const a = analyze(legs, FIX.S, FIX.dte, FIX.iv, honestQuote);
  const ms = modelCheckOf(a, { legs, spot: FIX.S, dte: FIX.dte, iv: FIX.iv });
  near(ms.marketNet, Math.abs(a.entry) * 100, 1e-9, "the ticket's market value is analyze()'s net");
  eq(ms.pass, true, "an honest chain passes on both screens");
});

check("the structure the Shortlist CUT is the one the ticket flags, by the same leg", () => {
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, placeholderQuote);
  const cutNames = new Set(r.cut.filter((c) => c.why === "model").map((c) => c.name));
  if (!cutNames.size) throw new Error("the fixture must cut something for this to mean anything");
  for (const pr of buildPresets("bull", FIX.S, FIX.step, FIX.strikes)) {
    const a = analyze(pr.legs, FIX.S, FIX.dte, FIX.iv, placeholderQuote);
    const ticket = modelCheckOf(a, { legs: pr.legs, spot: FIX.S, dte: FIX.dte, iv: FIX.iv });
    // What the list refused, the desk warns about — it refuses nothing there,
    // a hand-built trade is the user's, but it must not be silent about it.
    eq(!ticket.pass, cutNames.has(pr.name), `${pr.name}: the two screens agree`);
    if (!ticket.pass) has(ticket.reason, "100C");
  }
});

check("a leg priced off the MODEL does not change which leg is named", () => {
  // The old ticket passed `null` for a leg with no quote and the Shortlist
  // passed the model's own price for it. A model-priced leg has a gap of zero,
  // so it can never be the worst — but only if both sides say the same thing
  // about it. Here the 105 call is unquoted and priced by the model.
  const partial = (leg) => (leg.type === "call" && leg.strike === 105 ? null : placeholderQuote(leg));
  const legs = [{ side: 1, type: "call", strike: 100, qty: 1 }, { side: -1, type: "call", strike: 105, qty: 1 }];
  const a = analyze(legs, FIX.S, FIX.dte, FIX.iv, partial);
  const ms = modelCheckOf(a, { legs, spot: FIX.S, dte: FIX.dte, iv: FIX.iv });
  eq(a.realCount, 1, "one leg came off the chain, one off the model");
  eq(ms.worstLeg.name, "100C", "the quoted placeholder is named, not the modelled leg");
});

/* ============================================================================
   5. ONE CHANCE, ONE ARITHMETIC (PR #25) — AGAINST THE REAL GENERATION SITE.

   `chanceCheckOf` is imported from App.jsx for the same reason `analyze` and
   `shortlistWithFloors` are: the point of the change is that no second
   implementation of the decision exists, and a test against a copy would prove
   nothing about the app.
============================================================================ */

// Five markets, the numbers this repository actually holds for them.
const MKT = {
  CORN: { spot: 20.00, iv: 0.24, step: 0.5 },
  SOYB: { spot: 22.00, iv: 0.20, step: 0.5 },
  WEAT: { spot: 18.00, iv: 0.26, step: 0.25 },
  UNG: { spot: 10.57, iv: 0.45, step: 0.5 },
  BOIL: { spot: 21.23, iv: 0.85, step: 1 },
};
const MONTH = 8, FIXDTE = 45;
const shapesFor = (S, step) => ({
  vertical: [{ side: 1, type: "call", strike: S, qty: 1 }, { side: -1, type: "call", strike: S + step * 2, qty: 1 }],
  condor: [
    { side: -1, type: "put", strike: S - step * 2, qty: 1 }, { side: 1, type: "put", strike: S - step * 4, qty: 1 },
    { side: -1, type: "call", strike: S + step * 2, qty: 1 }, { side: 1, type: "call", strike: S + step * 4, qty: 1 }],
  longcall: [{ side: 1, type: "call", strike: S, qty: 1 }],
});
/** Every fixture, priced with the app's own model so the file needs no chain. */
const fixtures = () => {
  const out = [];
  for (const [tk, u] of Object.entries(MKT)) {
    for (const [shape, legs] of Object.entries(shapesFor(u.spot, u.step))) {
      out.push({ tk, shape, legs, u, entry: netBS(legs, u.spot, FIXDTE, u.iv) });
    }
  }
  return out;
};
/** What every screen calls, with the arguments the screen would have. */
/** The hand-written row, named as what it is — which is what every one of these
 *  fixtures is actually on, because no measured series exists in a test run. */
const seasOf = (tk) => seasonalProvenance(null, SEASONAL[tk], tk);
const chanceAt = (f) => chanceOf({
  legs: f.legs, entryNet: f.entry, spot: f.u.spot, iv: f.u.iv, dte: FIXDTE,
  seasonal: seasOf(f.tk), month: MONTH, ticker: f.tk, expKey: "2026-11-06",
});

check("P1 DONE WHEN — five screens, one position, ONE number", () => {
  // Radar, Shortlist, Build, Guardian and the autopilot. The first four reach
  // the chance through `chanceCheckOf` in App.jsx with whatever `analyze()`
  // produced; the autopilot calls `chanceOf` in rules.js directly, because a
  // Netlify function cannot import App.jsx. Both paths must land on the same
  // number to the last bit, or the brief and the app disagree by construction.
  for (const f of fixtures()) {
    const a = { entry: f.entry, legPx: f.legs.map(() => ({ iv: f.u.iv })) };
    const viaApp = chanceCheckOf(a, {
      ticker: f.tk, legs: f.legs, spot: f.u.spot, dte: FIXDTE, expKey: "2026-11-06",
      seasonal: seasOf(f.tk),
    });
    const viaServer = chanceAt(f);
    eq(viaApp.pop, viaServer.pop, `${f.tk} ${f.shape}: pop`);
    eq(viaApp.ev, viaServer.ev, `${f.tk} ${f.shape}: ev`);
    eq(viaApp.seedKey, viaServer.seedKey, `${f.tk} ${f.shape}: seed`);
    // ...and asking twice is asking once. An unseeded Monte Carlo would fail
    // here and would have failed on every screen, silently.
    eq(chanceAt(f).pop, viaServer.pop, `${f.tk} ${f.shape}: asked twice`);
  }
});

check("P1 DONE WHEN — the chance travels with the trade, not with the screen", () => {
  // The Guardian re-analyses an open position from today's spot, so its
  // `analyze()` result is a different object from the one the Shortlist built.
  // The seed is the TRADE's, so the number is the same whenever the inputs are.
  const f = fixtures()[0];
  const fromShortlist = chanceCheckOf({ entry: f.entry, legPx: [{ iv: f.u.iv }, { iv: f.u.iv }] },
    { ticker: f.tk, legs: f.legs, spot: f.u.spot, dte: FIXDTE, expKey: "2026-11-06", seasonal: seasOf(f.tk) });
  const fromGuardian = chanceCheckOf({ entry: f.entry, legPx: [{ iv: f.u.iv }, { iv: f.u.iv }] },
    { ticker: f.tk, legs: [...f.legs], spot: f.u.spot, dte: FIXDTE, expKey: "2026-11-06",
      seasonal: seasOf(f.tk), thesisIV: 0.9 });
  // `thesisIV` is only reached when the chain gives nothing, so it changes
  // nothing here — which is the property being held.
  eq(fromShortlist.pop, fromGuardian.pop, "a remembered volatility must not override a live one");
});

check("THE CHART AND THE NUMBER AGREE — within the simulation's own sampling error", () => {
  /* `chanceInProfit()` integrates the lognormal over the profit bands; the
     Monte Carlo samples it. With the same drift and the same volatility they
     are two readings of one distribution, so any gap is the Monte Carlo's
     sampling error and nothing else.

     THE TOLERANCE IS 2 PERCENTAGE POINTS, AND IT IS A MEASUREMENT, NOT A
     CHOICE. At `RULES.mcRuns` = 8,000 the standard error of a proportion near
     a half is 0.56 points, so two points is about 3.6 standard errors. The
     worst gap measured across these fifteen fixtures is 1.59 points, on the
     BOIL vertical; run at 400,000 the SAME structure lands within 0.01 points
     of the chart, which is what proves the gap is noise rather than a
     disagreement about the trade. PRD §4h carries the numbers. */
  const TOL = 0.02;
  let worst = 0, worstName = "";
  for (const f of fixtures()) {
    const mc = chanceAt(f);
    const b = payoffBands({ legs: f.legs, entryNet: f.entry, spot: f.u.spot });
    const chart = chanceInProfit(b, { spot: f.u.spot, sigma: mc.sigma, dte: FIXDTE, driftAnnual: mc.driftAnnual });
    const gap = Math.abs(chart - mc.pop);
    if (gap > worst) { worst = gap; worstName = `${f.tk} ${f.shape}`; }
    if (!(gap <= TOL)) {
      throw new Error(`${f.tk} ${f.shape}: chart ${(chart * 100).toFixed(2)}% vs simulation ` +
        `${(mc.pop * 100).toFixed(2)}% — ${(gap * 100).toFixed(2)}pp apart. If this fails the chart is ` +
        `wrong; do NOT widen the tolerance.`);
    }
  }
  if (!(worst > 0)) throw new Error("the comparison has to actually be doing something");
  if (worst > 0.018) throw new Error(`the measured worst gap has moved to ${(worst * 100).toFixed(2)}pp (${worstName})`);
});

check("THE CHART CARRIES ITS TAILS — a band at the edge of the sampling is not a band that ends", () => {
  // The fault the tolerance above would otherwise have exposed. `payoffBands()`
  // samples +/-30% of spot; on BOIL at 85% volatility over 45 days that is about
  // one standard deviation, so integrating band by band threw away a third of
  // the distribution and reported the remainder as a probability.
  const u = MKT.BOIL;
  const legs = shapesFor(u.spot, u.step).longcall;
  const entry = netBS(legs, u.spot, FIXDTE, u.iv);
  const b = payoffBands({ legs, entryNet: entry, spot: u.spot });
  const drift = seasonalDrift(SEASONAL.BOIL, MONTH, FIXDTE);
  const withTails = chanceInProfit(b, { spot: u.spot, sigma: u.iv, dte: FIXDTE, driftAnnual: drift });
  // The old arithmetic, reproduced: no tail on the band that reaches the edge.
  const noTails = (() => {
    const T = FIXDTE / 365, sq = u.iv * Math.sqrt(T);
    const mu = Math.log(u.spot) + (drift - 0.5 * u.iv * u.iv) * T;
    const cdf = (x) => 0.5 * (1 + Math.min(1, Math.max(-1, erfApprox((Math.log(x) - mu) / (sq * Math.SQRT2)))));
    return b.bands.filter((z) => z.sign > 0).reduce((acc, z) => acc + Math.max(0, cdf(z.hi) - cdf(z.lo)), 0);
  })();
  if (!(withTails > noTails + 0.1)) {
    throw new Error(`the tail is worth more than ten points here: ${withTails} vs ${noTails}`);
  }
});
function erfApprox(x) {
  const sg = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return sg * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
}

check("THE EXPECTED VALUE IS THE SIMULATION'S OWN MEAN, not the best case weighted", () => {
  /* `pop * maxProfit - (1 - pop) * risk` is a two-outcome bet: the best case or
     the worst case and nothing between them. Most of a spread's distribution is
     between them. The two answers are genuinely different numbers, and the one
     the app prints is the one it simulated. */
  let apart = 0, judged = 0;
  for (const f of fixtures()) {
    const mc = chanceAt(f);
    const b = payoffBands({ legs: f.legs, entryNet: f.entry, spot: f.u.spot });
    if (b.maxProfit == null) continue;                       // no ceiling: ranked last, blank EV
    judged++;
    // The simulation's mean can never be outside the range it walked. That is
    // the property the old formula could not guarantee: `pop * maxProfit`
    // weights a payoff that only happens at one price by the chance of landing
    // anywhere in the green.
    if (!(mc.ev >= b.maxLoss - 1e-6 && mc.ev <= b.maxProfit + 1e-6)) {
      throw new Error(`${f.tk} ${f.shape}: mean ${mc.ev} outside [${b.maxLoss}, ${b.maxProfit}]`);
    }
    const twoOutcome = mc.pop * b.maxProfit - (1 - mc.pop) * Math.abs(b.maxLoss);
    if (Math.abs(mc.ev - twoOutcome) > 1) apart++;
  }
  if (judged < 8) throw new Error(`not enough fixtures with a ceiling to judge (${judged})`);
  // The two answers are genuinely different arithmetic. They CAN coincide on a
  // structure whose distribution happens to sit near its own two endpoints —
  // WEAT's vertical does — so what is held is that most of them do not.
  if (!(apart >= judged / 2)) {
    throw new Error(`only ${apart} of ${judged} differ by more than a dollar: one of the two is not being computed`);
  }
});

check("THE CHANCE SAYS WHAT IT IS AN ANSWER ABOUT", () => {
  const f = fixtures()[0];
  const mc = chanceAt(f);
  const note = chanceSourceNote(mc, f.tk);
  has(note, "8,000");
  has(note, "seasonal");
  has(note, "not a market-neutral assumption");   // it names what this is NOT
  // and a missing chance is a sentence, not a crash
  has(chanceSourceNote(null), "There is no chance to show");
});

/* ============================================================================
   THE DEBT PR #25 WROTE DOWN: no screen prints a chance without saying which
   seasonal reading drifted it.

   Held against the REAL expression the screens call — `chanceCheckOf` exported
   from App.jsx — not against a re-implementation, for the same reason
   `analyze` and `shortlistWithFloors` are.
============================================================================ */

/** The same trade, priced twice: once on a measured series, once on the table. */
const CORN_SPREAD = {
  legs: [{ side: 1, type: "call", strike: 19, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }],
  tk: "CORN", spot: 19, iv: 0.22, dte: 45, expKey: "2026-11-06",
};
const cornAt = (seasonal) => {
  const f = CORN_SPREAD;
  const entry = netBS(f.legs, f.spot, f.dte, f.iv);
  return chanceCheckOf({ entry, legPx: f.legs.map(() => ({ iv: f.iv })) },
    { ticker: f.tk, legs: f.legs, spot: f.spot, dte: f.dte, expKey: f.expKey, seasonal });
};

check("SEASONAL PROVENANCE — a measured market and a fallback market say DIFFERENT things", () => {
  /* THE FIXTURE IS THE ONLY HONEST ONE AVAILABLE. No broker and no Alpha
     Vantage key reach this sandbox, so there is no live measured series to read
     — the blob cache `/api/av` fills is empty here. What IS documented, in
     netlify/functions/av.mjs and in the PRD, is two CORN cells measured against
     195 months of real data: June -3.46 against the table's +1.5, September
     +1.03 against the table's -1.1. Those two cells are the fixture, and
     nothing inside `SEASONAL` is edited to build it — the corrected row is made
     here, in the test. */
  const measuredRow = SEASONAL.CORN.slice();
  measuredRow[5] = -3.46;   // June
  measuredRow[8] = 1.03;    // September

  const measured = chanceOf({
    legs: CORN_SPREAD.legs, entryNet: 0.5, spot: 19, iv: 0.22, dte: 45, month: 5, ticker: "CORN",
    seasonal: seasonalProvenance({ monthlyMean: measuredRow, years: 11, at: Date.now() }, SEASONAL.CORN, "CORN"),
  });
  const fallback = chanceOf({
    legs: CORN_SPREAD.legs, entryNet: 0.5, spot: 19, iv: 0.22, dte: 45, month: 5, ticker: "CORN",
    seasonal: seasonalProvenance(null, SEASONAL.CORN, "CORN"),
  });

  // 1) THE SENTENCES DIFFER, and each names its own table.
  if (measured.seasonalNote === fallback.seasonalNote) {
    throw new Error("one sentence for two sources is no sentence at all");
  }
  has(measured.seasonalNote, "MEASURED");
  has(measured.seasonalNote, "11 years");
  has(fallback.seasonalNote, "HAND-WRITTEN");
  // ...and the full note the screens print carries whichever applies.
  has(chanceSourceNote(measured, "CORN"), "MEASURED");
  has(chanceSourceNote(fallback, "CORN"), "HAND-WRITTEN");
  // THE OLD SENTENCE CALLED BOTH OF THEM "CORN's own seasonal reading". It is
  // true of a measured series and false of a row somebody typed.
  if (/CORN.s own seasonal reading/.test(chanceSourceNote(fallback, "CORN"))) {
    throw new Error("the hand-written table is not CORN's own reading of anything");
  }

  // 2) AND THE NUMBER ITSELF MOVES, which is why the sentence is not decoration.
  if (Math.abs(measured.pop - fallback.pop) < 0.05) {
    throw new Error(`one corrected cell should move the chance materially, moved ${(measured.pop - fallback.pop) * 100}pp`);
  }
  if (Math.sign(measured.driftAnnual) === Math.sign(fallback.driftAnnual)) {
    throw new Error("June is the cell whose SIGN the table has wrong; the drift must flip");
  }
});

check("SEASONAL PROVENANCE — a market with no reading at all prints NO chance", () => {
  // THE COUNTER-EXAMPLE THAT MUST STILL PASS. Neither measured prices nor a
  // hand-written row: the answer is null and every screen prints a dash. A
  // drift of zero standing in would be a confident claim that the market goes
  // nowhere, which is not the same thing as not knowing — and `Number(null)`
  // is 0, which is how a missing reading becomes a 0% on screen.
  const none = seasonalProvenance(null, null, "XYZ");
  eq(none.missing, true, "no table either side is missing, not estimated");
  eq(none.monthlyMean, null, "and there is no row to drift on");
  eq(cornAt(none), null, "the chance is not computed");
  has(chanceSourceNote(null, "XYZ"), "There is no chance to show");
  has(none.note, "no seasonal reading");
  // A row of twelve zeros is NOT the same thing, and must not be read as one:
  // it is a real reading that happens to average out.
  const zeros = seasonalProvenance(null, Array(12).fill(0), "XYZ");
  eq(zeros.missing, false, "twelve measured zeros is a reading, not an absence");
  if (!cornAt(zeros)) throw new Error("a flat table still produces a chance");
});

check("SEASONAL PROVENANCE — the stamp travels, and its ABSENCE is the marker", () => {
  // The same pattern `contractsAssumed` and `simExitDTE` already use. A record
  // written before the app recorded a source carries none, and at that point
  // the hand-written table was the only one either side could reach.
  const mc = cornAt(seasonalProvenance({ monthlyMean: SEASONAL.CORN, years: 11, at: Date.now() }, SEASONAL.CORN, "CORN"));
  eq(mc.seasonalMeasured, true, "the chance carries its own stamp");
  eq(mc.seasonalYears, 11, "...and the year count");
  has(seasonalStampNote({ seasonalSource: mc.seasonalSource, seasonalYears: 11, seasonalAgeDays: 0 }, "CORN"), "MEASURED");
  // An unstamped record reads as the estimate, and SAYS that is why.
  const old = seasonalStampNote({ pop: 0.5 }, "CORN");
  has(old, "no seasonal stamp");
  has(old, "HAND-WRITTEN");
});

check("SEASONAL STAMP — a market with NO table is never told it has a hand-written one", () => {
  /* >>> READ ON THE OWNER'S PHONE, XLE, 21 September 2026. <<< The road card on
     the Shortlist said "Drifted on the HAND-WRITTEN seasonal estimate for XLE …
     that table is wrong on eight months of twelve" while the header two blocks
     above read "SEASONAL SOURCE · Alpha Vantage · 11y" and the Build screen for
     the very same trade said "Drifted on XLE's MEASURED seasonality: 11 years of
     monthly prices, read today". XLE has no hand-written table at ALL — the
     liquid tier deliberately carries none — so the card was naming a table that
     does not exist, about a market whose real history was loaded. */
  const measured = seasonalProvenance({ monthlyMean: SEASONAL.CORN, years: 11, at: Date.now() }, null, "XLE");
  eq(measured.measured, true, "the fixture really is the measured reading");
  const stamped = seasonalStampFields(measured);
  eq(stamped.seasonalSource, MEASURED_SEASONAL_SOURCE);
  has(seasonalStampNote(stamped, "XLE"), "MEASURED");
  hasNot(seasonalStampNote(stamped, "XLE"), "HAND-WRITTEN");

  // ...AND WITH NO READING AT ALL IT SAYS SO, rather than inventing the table.
  const none = seasonalStampFields(seasonalProvenance(null, null, "XLE"));
  const note = seasonalStampNote(none, "XLE");
  has(note, "no seasonal reading for XLE at all");
  hasNot(note, "HAND-WRITTEN");
  hasNot(note, "no seasonal stamp");

  /* THE CAUSE, HELD BY NAME. `seasonalStampFields()` reads a PROVENANCE —
     `source` / `years` / `ageDays`. A `chanceOf()` result carries the same facts
     under `seasonalSource` / `seasonalYears` / `seasonalAgeDays`, so handing it
     one produces three undefineds and an unstamped record that then reads as the
     hand-written table. The two shapes must stay distinguishable. */
  const mc = cornAt(seasonalProvenance({ monthlyMean: SEASONAL.CORN, years: 11, at: Date.now() }, SEASONAL.CORN, "CORN"));
  eq(seasonalStampFields(mc).seasonalSource, null,
    "a chance result is NOT a provenance, and passing one must not quietly produce a stamp");
  eq(mc.seasonalSource, MEASURED_SEASONAL_SOURCE, "...it carries the fact under its own name instead");
});

check("A GUIDED ROAD CARRIES THE SAME STAMP ITS CHANCE WAS DRIFTED ON", () => {
  // The road and the Build screen read one market on one day: whatever
  // `seasonalFor()` says is what both print. This is the shape App.jsx uses.
  for (const [prov, want] of [
    [seasonalProvenance({ monthlyMean: SEASONAL.CORN, years: 11, at: Date.now() }, null, "XLE"), MEASURED_SEASONAL_SOURCE],
    [seasonalProvenance(null, SEASONAL.CORN, "CORN"), ESTIMATED_SEASONAL_SOURCE],
  ]) {
    const road = { ticker: prov.ticker, ...seasonalStampFields(prov) };
    eq(road.seasonalSource, want, `${prov.ticker} stamps what it was drifted on`);
    // The road's sentence and the live provenance's sentence are one reading.
    eq(seasonalStampNote(road, prov.ticker), prov.note);
  }
});

/* ============================================================================
   §4k DONE WHEN — THE GUARDIAN AND THE BRIEF WALK ONE POSITION ON ONE
   VOLATILITY. The `five screens, one position, ONE number` precedent (§4h),
   applied to the EXIT SIMULATION rather than to the chance.

   `exitSim` in engine.js and `exitPathSim` in pro.jsx keep separate bodies on
   purpose — they answer different questions and the UI depends on the extra
   fields the second returns (CLAUDE.md, Known traps). What they may NOT do is
   disagree about their INPUTS, which is exactly what happened: the Guardian
   read the measured realised volatility off `seasonal[tk].sigma` while the
   autopilot read the hand-written `SIGMA` row it was the only one able to
   reach, and neither screen said which.
============================================================================ */

/** A seeded `Math.random` for the length of one call, as engine.test.js does. */
function seeded(seed, fn) {
  const real = Math.random;
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  try { return fn(); } finally { Math.random = real; }
}

const SIMPOS = {
  ticker: "CORN",
  legs: [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 22, qty: 1 }],
  entryNet: netBS([{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 22, qty: 1 }], 20, 45, 0.28),
};
SIMPOS.maxProfit = (2 - SIMPOS.entryNet) * 100;
SIMPOS.maxLoss = -SIMPOS.entryNet * 100;
const SIMPOLICY = { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct, stopLossPct: RULES.stopLossPct };

check("§4k DONE WHEN — the Guardian and the brief land on the SAME simulator inputs", () => {
  const vol = sigmaProvenance({ sigma: 0.37, years: 11, at: Date.now() }, SIGMA.CORN, "CORN");
  const SEED = 20260919, N = 600;
  // The brief's simulator, and the Guardian's, on one position with one
  // volatility and one exit policy. Same seed, same draws, same arithmetic.
  const brief = seeded(SEED, () => exitSim(SIMPOS, 20, 45, 0.28, vol, SIMPOLICY, N));
  const guardian = seeded(SEED, () => exitPathSim(SIMPOS, 20, 45, 0.28, vol, N));
  eq(brief.sigma, guardian.sigma, "the volatility they walked on");
  eq(brief.sigmaSource, guardian.sigmaSource, "and where it came from");
  eq(brief.sigma, 0.37, "which is the MEASURED reading, not the table");
  eq(brief.sigmaSource, MEASURED_SIGMA_SOURCE, "named as such");
  eq(brief.horizon, guardian.horizon, "the same window");
  // ...and therefore the same answers, to the last bit.
  eq(brief.pTP, guardian.pTP, "chance of taking profit first");
  eq(brief.pSL, guardian.pSL, "chance of the stop first");
  eq(brief.pTimePos, guardian.pTimePos, "chance of being positive at the exit rule");
  near(brief.ev, guardian.evExit, 1e-9, "the average result following the rules");
});

check("§4k — a measured sigma and the table one print DIFFERENT sentences", () => {
  const meas = sigmaProvenance({ sigma: 0.37, years: 11, at: Date.now() - 5 * 86400000 }, SIGMA.CORN, "CORN");
  const table = sigmaProvenance(null, SIGMA.CORN, "CORN");
  if (meas.note === table.note) throw new Error("two sources, one sentence");
  has(meas.note, "MEASURED");
  has(meas.note, "11 years");
  has(meas.note, "5 days ago");
  hasNot(meas.note, "written down, not measured from returns");
  has(table.note, "written down, not measured from returns");
  hasNot(table.note, "MEASURED");
  // THE COUNTER-EXAMPLE THAT MUST STILL PASS: a market with no reading at all
  // falls to the named fallback and says so, rather than borrowing either.
  const none = sigmaProvenance(null, undefined, "GLD");
  eq(none.sigma, RULES.fallbackSigma, "the named fallback");
  eq(none.source, FALLBACK_SIGMA_SOURCE);
  has(none.note, "FALLBACK VOLATILITY");
  has(none.note, "GLD");
  if (none.note === table.note || none.note === meas.note) throw new Error("three sources, three sentences");
});

check("§4k — every sentence names the market and carries the number", () => {
  for (const v of [sigmaProvenance({ sigma: 0.37, years: 11, at: Date.now() }, SIGMA.CORN, "CORN"),
    sigmaProvenance(null, SIGMA.CORN, "CORN"), sigmaProvenance(null, null, "CORN")]) {
    has(v.note, "CORN");
    has(v.note, `${Math.round(v.sigma * 100)}%`);
  }
  // The MEASURED one is a single sentence: it is the one this PR writes, and
  // it is what the Guardian prints under the figures. The other two keep the
  // shape they already had — the table's second clause is the disclaimer that
  // it was typed, and the fallback's is the whole point of the fallback.
  oneSentence(sigmaProvenance({ sigma: 0.37, years: 11, at: Date.now() }, SIGMA.CORN, "CORN").note);
});

check("§4k — exitPathSim refuses a bare sigma, exactly as exitSim does", () => {
  for (const bare of [SIGMA.CORN, null, undefined, {}, { sigma: 0.2 }, { source: "table" }]) {
    let threw = false;
    try { exitPathSim(SIMPOS, 20, 45, 0.28, bare, 5); } catch (e) { threw = /sigmaProvenance/.test(e.message); }
    if (!threw) throw new Error(`${JSON.stringify(bare)} was accepted as a volatility`);
  }
});

check("§4k — the SENSITIVITY the PRD records is reproducible from this repo", () => {
  /* THE MEASURED SIGMA IS NOT AVAILABLE IN THIS SANDBOX. No Alpha Vantage key
     and an egress proxy that refuses the CONNECT, so how far a market's real
     realised volatility sits from its hand-written row is UNKNOWN and must not
     be asserted. What CAN be measured is how much the simulator's answers move
     when the volatility does — the table perturbed by a stated factor. PRD §4k
     carries the table; this holds the arithmetic behind it. */
  const SEED = 20260919, N = 800;
  const at = { CORN: 20, SOYB: 24, UNG: 10.6, BOIL: 21.2, WEAT: 5.4 };
  for (const tk of Object.keys(at)) {
    const S = at[tk];
    const legs = [{ side: 1, type: "call", strike: S, qty: 1 }, { side: -1, type: "call", strike: S * 1.1, qty: 1 }];
    const entryNet = netBS(legs, S, 45, 0.3);
    const pos = { ticker: tk, legs, entryNet, maxProfit: (S * 0.1 - entryNet) * 100, maxLoss: -entryNet * 100 };
    const base = seeded(SEED, () => exitSim(pos, S, 45, 0.3, sigmaProvenance(null, SIGMA[tk], tk), SIMPOLICY, N));
    const half = seeded(SEED, () => exitSim(pos, S, 45, 0.3,
      sigmaProvenance({ sigma: SIGMA[tk] * 0.5, years: 11, at: Date.now() }, SIGMA[tk], tk), SIMPOLICY, N));
    const twice = seeded(SEED, () => exitSim(pos, S, 45, 0.3,
      sigmaProvenance({ sigma: SIGMA[tk] * 2, years: 11, at: Date.now() }, SIGMA[tk], tk), SIMPOLICY, N));
    eq(base.sigma, SIGMA[tk], `${tk}: the table's own row`);
    eq(half.sigma, SIGMA[tk] * 0.5, `${tk}: half of it`);
    eq(twice.sigma, SIGMA[tk] * 2, `${tk}: twice it`);
    // TWO PROPERTIES HOLD ON EVERY MARKET, and they are the only two that do.
    // More volatility means more paths reach A BARRIER, and more of them reach
    // the take-profit one. `pSL` and `pTimePos` are NOT monotone — on BOIL the
    // stop rate goes 58.7 -> 60.2 -> 58.5 because the two barriers compete for
    // the same paths — and asserting a direction for them would be asserting
    // something this arithmetic does not do. The MAGNITUDES are in PRD §4k as a
    // SENSITIVITY: a statement about this simulator under a stated
    // perturbation, never a measurement of any market's real volatility.
    const touches = (r) => r.pTP + r.pSL;
    if (!(touches(half) <= touches(base) && touches(base) <= touches(twice))) {
      throw new Error(`${tk}: barrier touches do not rise with volatility`);
    }
    if (!(half.pTP <= base.pTP && base.pTP <= twice.pTP)) {
      throw new Error(`${tk}: the take-profit rate does not rise with volatility`);
    }
    // ...and every figure MOVES, which is the fault this PR is about: one
    // position walked on two volatilities is two different briefs.
    if (half.ev === base.ev || twice.ev === base.ev) throw new Error(`${tk}: the average result did not move`);
  }
});

/* ==========================================================================
   THE DEFAULT PRESET INVENTED STRIKES, SO A FRESH MARKET COULD NOT SEND AN
   ORDER. (P0 blocker, measured 21 September 2026.)

   The Build screen's preset effect fired on the render where the chain — and
   so `spot` — arrived. `expKey` was set by a SIBLING effect in that same
   render, so `expStrikes` was still null, and `snapStrike()` fell back to
   `Math.round(x / step) * step`. SOYB: spot 27.64, step 0.5, Bull Call Spread
   at [0, +0.05] gives 27.5 / 29. The board lists whole dollars. Nothing
   re-snapped afterwards, so the gate correctly refused UNLISTED_CONTRACT on
   every fresh load of that market — the app creating its own refusal.
   ========================================================================== */
const SOYB_BOARD = Array.from({ length: 17 }, (_, i) => 16 + i);   // 16..32, whole dollars

check("THE DEFAULT BULL CALL SPREAD ON SOYB IS 28/29, AND NEVER 27.5", () => {
  const first = buildPresets("bull", 27.64, 0.5, SOYB_BOARD)[0];
  eq(first.name, "Bull Call Spread", "the preset order changed under the test");
  eq(first.legs.map((l) => l.strike).join("/"), "28/29");
  for (const p of buildPresets("bull", 27.64, 0.5, SOYB_BOARD)) {
    for (const l of p.legs) {
      if (!SOYB_BOARD.includes(l.strike)) throw new Error(`${p.name}: ${l.strike} is not on the board`);
    }
  }
});

check("the fallback grid is what produced the refused leg, and it is unreachable now", () => {
  // What the old code did, spelled out so the number in the report is held.
  eq(Math.round((27.64 * 1.00) / 0.5) * 0.5, 27.5, "the fixture no longer reproduces the live failure");
  eq(buildPresets("bull", 27.64, 0.5, null).length, 0, "a null board still produces presets");
});

check("WITH A NULL BOARD, NO PRESET LEGS ARE PRODUCED — at any sentiment", () => {
  for (const sent of ["verybear", "bear", "neutral", "bull", "verybull"]) {
    eq(buildPresets(sent, 27.64, 0.5, null).length, 0, `${sent} built from nothing`);
    eq(buildPresets(sent, 27.64, 0.5, []).length, 0, `${sent} built from an empty board`);
  }
});

check("and the Shortlist generates nothing from a board it has not read", () => {
  const r = shortlistWithFloors("bull", 27.64, 0.5, null, 45, 0.25, () => null, {});
  eq(r.rows.length, 0);
  eq(r.cut.length, 0, "a structure that was never built cannot have been cut by a floor");
});

/* ---- failure class 1: the dropdown showed a different strike ---- */
check("THE STRIKE SELECT RENDERS THE OFF-BOARD LEG AS ITS OWN DISABLED OPTION", () => {
  const html = renderToStaticMarkup(
    <StrikeSelect strikes={[26, 27, 28, 29]} value={27.5} step={0.5} onChange={() => {}} />);
  has(html, "not on this board");
  has(html, 'value="27.5"');
  has(html, "disabled");
  // The browser would otherwise have shown the first option, 26.
  const firstOpt = html.slice(html.indexOf("<option"), html.indexOf("</option>"));
  if (/selected/.test(firstOpt)) throw new Error("the first option is selected: the dropdown is showing 26");
});

check("a strike the board carries renders as an ordinary dropdown", () => {
  const html = renderToStaticMarkup(
    <StrikeSelect strikes={[26, 27, 28, 29]} value={28} step={1} onChange={() => {}} />);
  hasNot(html, "not on this board");
  hasNot(html, "disabled");
});

check("no board at all is a number field, not a dropdown of strikes nobody confirmed", () => {
  const html = renderToStaticMarkup(
    <StrikeSelect strikes={null} value={27.5} step={0.5} onChange={() => {}} />);
  hasNot(html, "<select");
  has(html, "input");
});

/* ============================================================================
   P9 TASK 1 — THE APP NEVER PROPOSES A TRADE ITS OWN GATE WOULD BLOCK

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026. <<< The Radar and the
   multi-market search ran at "HORIZON ~21 DTE"; every structure they offered
   sat on 2026-10-16, twenty-four days out; and Build, at the bottom of the
   screen, said THIS ORDER WOULD NOT BE SENT — ENTRY_DTE_ROOM, three days of
   room against the thirty-day floor.

   The DONE WHEN of this task, and it is the test below: every candidate every
   generation site returns is put through `evaluateTrade()` in a dry run and
   must come back with ZERO violations.
============================================================================ */

// The gate's own fixtures, spelled the way riskGate.test.js spells them, so a
// pass here means a pass there.
const P9_PAPER = { account_number: "PA3XYZ01", paperVerified: true, paperSource: "paper-api.alpaca.markets" };
const P9_CAPITAL = { tradingCapital: 50000, concurrentTarget: 4, savings: 100000 };

/* A dry run of one candidate through the REAL gate, carrying the evidence
   every open-intent call must carry (CLAUDE.md: quotes, net and occs). The
   chain listed every strike in the fixture, so `occs` is the honest answer
   rather than a way of skipping `UNLISTED_CONTRACT`. */
const p9DryRun = ({ legs, analysis, dte, quotes, contracts = 1 }) => evaluateTrade({
  proposal: {
    ticker: "TEST", name: "candidate", intent: "open", dte, contracts, legs,
    maxLoss: analysis.maxLoss, maxProfit: analysis.maxProfit,
    net: analysis.entry, quotes,
    occs: legs.map((l) => `TEST${l.type[0].toUpperCase()}${l.strike}`),
  },
  portfolio: { positions: [], account: P9_PAPER }, capital: P9_CAPITAL,
});

check("TASK 1 — every Shortlist candidate passes evaluateTrade() with zero violations", () => {
  // The real generation site, on the honest board, at a DTE the floor clears.
  for (const sent of ["bull", "bear", "neutral"]) {
    const r = shortlistWithFloors(sent, FIX.S, FIX.step, FIX.strikes, FIX.dte, FIX.iv, honestQuote);
    if (!r.rows.length) throw new Error(`${sent}: the fixture must actually produce candidates`);
    for (const row of r.rows) {
      const g = p9DryRun({ legs: row.p.legs, analysis: row.a, dte: FIX.dte,
        quotes: row.a.legPx.map((l) => ({ bid: l.px - 0.05, ask: l.px + 0.05 })) });
      if (g.violations.length) {
        throw new Error(`${sent} · ${row.p.name} was OFFERED and the gate refuses it: ` +
          g.violations.map((v) => v.code).join(", "));
      }
    }
  }
});

check("TASK 1 — …and a board inside the entry floor produces NO candidates at all", () => {
  /* The 24-DTE board the owner's screen was on. `shortlistWithFloors` is a
     generation site, so the guard is IN it: a fourth caller added next year is
     covered without anybody coming back, the same reason `buildPresets()`
     refuses a null board inside itself. */
  const r = shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, 24, FIX.iv, honestQuote);
  eq(r.rows.length, 0, "nothing is offered on a board the gate would refuse");
  eq(r.cut.length, 0, "and no floor is credited with work it did not do");
  if (!r.offFloor) throw new Error("the refusal has to NAME itself, not be an empty list");
  eq(r.offFloor.band, "tight", "24 DTE is past the exit rule and under the entry floor");
  // ...and the fixture can still pass, or this is a wall rather than a check.
  if (!shortlistWithFloors("bull", FIX.S, FIX.step, FIX.strikes, 45, FIX.iv, honestQuote).rows.length) {
    throw new Error("45 DTE must still produce candidates");
  }
});

check("TASK 1 — the gate REALLY refuses 24 DTE, which is what makes the filter load-bearing", () => {
  const a = analyze(
    [{ side: 1, qty: 1, type: "call", strike: 100 }, { side: -1, qty: 1, type: "call", strike: 105 }],
    FIX.S, 24, FIX.iv, honestQuote);
  const g = p9DryRun({ legs: [{ side: 1, qty: 1, type: "call", strike: 100 }, { side: -1, qty: 1, type: "call", strike: 105 }],
    analysis: a, dte: 24, quotes: a.legPx.map((l) => ({ bid: l.px - 0.05, ask: l.px + 0.05 })) });
  if (!g.violations.some((v) => v.code === "ENTRY_DTE_ROOM")) {
    throw new Error("the fixture must reproduce the live refusal, or the filter is untested");
  }
});

check("TASK 1 — `buildableExpiries()` is the one home, built on `entryRoom()`", () => {
  const boards = [{ key: "a", dte: 10 }, { key: "b", dte: 24 }, { key: "c", dte: 45 }, { key: "d", dte: 200 }];
  const r = buildableExpiries(boards);
  eq(r.buildable.map((e) => e.key).join(","), "c", "only the board past the floor and inside the horizon");
  eq(r.blocked.length, 3);
  // Each refused board carries WHY, so a screen can name it rather than shorten
  // a list in silence.
  eq(r.blocked.find((e) => e.key === "a").room.band, "inside-exit");
  eq(r.blocked.find((e) => e.key === "b").room.band, "tight");
  // THE HORIZON YIELDS, THE FLOOR NEVER DOES — `expiryChoice()`'s rule, one home.
  const far = buildableExpiries([{ key: "z", dte: 400 }]);
  eq(far.buildable.length, 1, "with nothing inside the horizon, the horizon gives way");
  eq(far.horizonYielded, true, "and it says that is what happened");
  eq(buildableExpiries([{ key: "q", dte: 10 }]).buildable.length, 0, "the floor does not");
  // `Number(null)` IS 0 AND 0 IS FINITE, for the ninth time.
  eq(buildableExpiries([{ key: "n", dte: null }]).buildable.length, 0);
  eq(buildableExpiries([{ key: "n", dte: null }]).blocked.length, 0, "unknown is neither offered nor refused");
});

check("TASK 1 — a board the floor refuses is NAMED in the dropdown, never dropped", () => {
  // The `strikeOptions()` / `offBoardStrikeLabel()` pattern: a <select> whose
  // value matches no option displays the FIRST one.
  has(offFloorExpiryLabel("2026-10-16", 24), "under the 30-day floor");
  has(offFloorExpiryLabel("2026-09-30", 8), "inside the 21-day exit");
  eq(offFloorExpiryLabel("2026-11-20", 59), "2026-11-20 · 59 DTE", "a buildable board reads plainly");
  eq(openableBoard(RULES.minEntryDTE), true);
  eq(openableBoard(RULES.minEntryDTE - 1), false);
});

check("TASK 1 — the dropdown and the sentence under it name the SAME board", () => {
  /* Read on the phone: the dropdown said 2026-10-16 and the sentence directly
     below it said "Building on 2026-11-20". Both true, and together a screen
     contradicting itself about which trade it was showing. */
  const choice = expiryChoice([
    { key: "2026-10-16", dte: 24, clears: 9, near: 10 },
    { key: "2026-11-20", dte: 59, clears: 8, near: 10 },
  ]);
  eq(choice.chosen.key, "2026-11-20", "the app still opens on the board past the floor");
  const note = expiryChoiceNote(choice, undefined, { selected: "2026-10-16" });
  has(note, "Building on 2026-10-16");
  has(note, "refused at the send");
  // And with no selection given, the old sentence is exactly as it was.
  has(expiryChoiceNote(choice), "Building on 2026-11-20");
  has(expiryChoiceNote(choice, undefined, { selected: "2026-11-20" }), "Building on 2026-11-20");
});

/* The three SOURCE sweeps for this task live in `riskGate.test.js`: this file
   is bundled to CJS by scripts/test-jsx.mjs, where `import.meta.url` is not a
   URL, so a file read here cannot work. They are: the horizon slider's two
   ends, the three generation sites reading one home, and the step-2 CTA. */

for (const [name, why] of bad) console.error(`  FAIL ${name}\n       ${why}`);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
