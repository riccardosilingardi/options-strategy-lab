// Tests for PR #44, TASKS 1 and 2 — the Positions card's arrangement (src/positionView.js), the take-profit
// target as the card reads it, and the filing dialog's honesty about a record Alpaca does not hold (TASK 0b).
//
// Measured on J-0001 (9 x GDX 94P 2026-10-30, average $5.00, now $8.25) on the owner's phone, 2 Oct 2026: the
// card read HOLD with no profit; the +$2,925 was in the broker panel. After TASK 5 it reads CLOSE.
//
// Plain Node, no framework: `npm test` runs this file directly.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { RULES, takeProfitTarget, positionAction, stopWarningLevel, stopSigns, onCardLine } from "./rules.js";
import { closeDecision, notHeldCloseWords } from "./journal.js";
import { sizeWords, unitWords, maxProfitCorrection, withExactMaxProfit, maxProfitCorrectionNote } from "./positionView.js";
import { exactExtremes, payoffAtZero, CARD_LABELS } from "./rules.js";
import { structureName, displayName, exitDateOf, exitProgress, entryVsNow, fileState, pnlShareOfRisk,
  pnlShareText, signedMoney$, holdsStructure, shortDate, factorText } from "./positionView.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const NOW = Date.parse("2026-10-02T12:00:00Z");
const J1 = { id: 1, ref: "J-0001", ticker: "GDX", name: "Imported from Alpaca", expKey: "2026-10-30", expiry: "2026-10-30",
  legs: [{ side: 1, type: "put", strike: 94, qty: 1 }], entryNet: 5, entrySpot: 100, contracts: 9,
  openedAt: "2026-09-22T14:00:00Z", maxProfit: 8900, maxLoss: -500, alpacaHeld: true, thesis: { pop: null } };
const J1_TARGET = takeProfitTarget({ legs: J1.legs, maxProfit: J1.maxProfit, maxLoss: J1.maxLoss, entryNet: J1.entryNet, contracts: 9 });

test("NAME — an imported record shows the structure's name, and the stored name is untouched", () => {
  assert.equal(displayName(J1), "Long put 94 · 30 Oct");
  assert.equal(J1.name, "Imported from Alpaca");
  assert.equal(displayName({ ...J1, name: "Bull Put Spread" }), "Bull Put Spread", "a name the app gave is kept");
  assert.equal(structureName([{ side: 1, type: "call", strike: 20 }, { side: -1, type: "call", strike: 22 }], "2026-11-06"), "Bull call spread 20/22 · 6 Nov");
  assert.equal(structureName([{ side: -1, type: "put", strike: 20 }, { side: 1, type: "put", strike: 18 }], "2026-11-06"), "Bull put spread 18/20 · 6 Nov");
  assert.equal(structureName([{ side: 1, type: "put", strike: 20 }, { side: -1, type: "put", strike: 18 }], "2026-11-06"), "Bear put spread 18/20 · 6 Nov");
  assert.equal(structureName([{ side: -1, type: "call", strike: 5 }], null), "Short call 5");
  assert.equal(shortDate("not a date"), null);
});

test("PROFIT — the share of the risk is the profit over the whole position's maximum loss", () => {
  const share = pnlShareOfRisk(2925, J1, 9);
  assert.equal(Math.round(share * 100), 65, "+65% of the $4,500 paid");
  assert.equal(pnlShareText(share), "+65% of the risk");
  assert.equal(pnlShareText(pnlShareOfRisk(-225, J1, 9)), "-5% of the risk");
  assert.equal(pnlShareOfRisk(null, J1, 9), null, "unknown is not zero");
  assert.equal(pnlShareOfRisk(100, { maxLoss: null }, 1), null);
  assert.equal(signedMoney$(2925), "+$2,925");
  assert.equal(signedMoney$(-225), "-$225");
  assert.equal(signedMoney$(null), "—");
  assert.equal(signedMoney$(0.2), "+$0", "a rounded zero never carries a minus");
});

test("J-0001 now reads CLOSE: take profit at 50% of the premium paid", () => {
  const pnl = 2925;
  const tpHit = pnl >= J1_TARGET.dollars;
  const act = positionAction({ tpHit, pnl, dteLeft: 28, tpBasis: J1_TARGET.basis });
  assert.equal(act.action, "CLOSE");
  assert.equal(act.line, "Take profit reached: 50% of the premium paid.");
});

test("EXITS — three lines, from the one function each", () => {
  const pr = exitProgress({ p: J1, pnl: 2925, dteLeft: 28, tpTarget: J1_TARGET, n: 9, now: NOW });
  assert.equal(exitDateOf(J1), "2026-10-09");
  assert.equal(pr.time.text, "Time exit: 7 days left · 9 Oct");
  assert.equal(pr.takeProfit.text, "Take profit: $2,925 of $2,250");
  assert.equal(pr.takeProfit.state, "reached");
  assert.equal(pr.takeProfit.frac, 1, "a bar never runs past its end");
  assert.equal(pr.stop.text, "Stop warning: at -$2,250");
  assert.equal(stopWarningLevel({ maxLoss: -500, contracts: 9 }), -2250);
  assert.equal(pr.stop.frac, 0, "no loss, no progress towards the warning");
  assert.ok(pr.time.frac > 0 && pr.time.frac < 1);
});

test("EXITS — unknown is a dash, never a zero, and no target is said, not shown as $0", () => {
  const unknown = exitProgress({ p: J1, pnl: null, dteLeft: 28, tpTarget: J1_TARGET, n: 9, now: NOW });
  assert.equal(unknown.takeProfit.text, "Take profit: — of $2,250");
  assert.equal(unknown.takeProfit.frac, 0);
  const none = exitProgress({ p: J1, pnl: 10, dteLeft: 28, tpTarget: takeProfitTarget({}), n: 1, now: NOW });
  assert.equal(none.takeProfit.state, "none");
  assert.doesNotMatch(none.takeProfit.text, /\$0/);
  const reached = exitProgress({ p: J1, pnl: 0, dteLeft: 21, tpTarget: J1_TARGET, n: 9, now: NOW });
  assert.match(reached.time.text, /reached, 21 days to expiry/);
  assert.equal(exitProgress({ p: J1, pnl: -3000, dteLeft: 28, tpTarget: J1_TARGET, n: 9, now: NOW }).stop.state, "reached");
  assert.equal(exitProgress({ p: { ...J1, maxLoss: null }, pnl: 1, dteLeft: 28, tpTarget: J1_TARGET, n: 9, now: NOW }).stop.state, "unknown");
});

test("AT ENTRY VS NOW — the Find card's four labels, in its order; an unknown cell is a dash", () => {
  const ev = entryVsNow({ p: J1, n: 9, pnl: 2925, popNow: 0.62, nowSignals: null });
  // ONE HOME (PR #48, 0b): the Find card's labels, in the card's order.
  assert.deepEqual(ev.figures.map((f) => f.k), [CARD_LABELS.risk, CARD_LABELS.profit, CARD_LABELS.chance, CARD_LABELS.rr]);
  assert.deepEqual(ev.figures.map((f) => f.k), ["YOU RISK", "MAX PROFIT", "CHANCE", "RETURN ON RISK"]);
  const by = Object.fromEntries(ev.figures.map((f) => [f.k, f]));
  assert.equal(by["RETURN ON RISK"].entry, "1780%");
  assert.equal(by["CHANCE"].entry, "—", "an imported holding has no entry chance");
  assert.equal(by["CHANCE"].now, "62%");
  assert.equal(by["MAX PROFIT"].entry, "$80,100");
  assert.equal(by["YOU RISK"].entry, "$4,500");
  // From here: what is left to make and to lose.
  assert.equal(by["MAX PROFIT"].now, "$77,175");
  assert.equal(by["YOU RISK"].now, "$7,425", "what the position is worth now is what it could still lose");
  assert.deepEqual(ev.factors.map((f) => f.label), ["SEASONALITY", "PRICE TREND", "WEATHER", "NEWS"]);
  assert.ok(ev.factors.every((f) => f.entry === "—" && f.now === "—"), "no factors recorded and none read: dashes");
});

test("AT ENTRY VS NOW — the four factors, entry beside now, from the snapshot stored at entry", () => {
  const snap = (dirs) => ({ ready: true, factors: {
    seasonal: { dir: dirs[0], strength: 60 }, technical: { dir: dirs[1], strength: 40 }, news: { dir: dirs[2], strength: 25 } } });
  const p = { ...J1, thesis: { pop: 0.5, signals: snap([1, 1, 0]) } };
  const ev = entryVsNow({ p, n: 9, pnl: 0, popNow: 0.5, nowSignals: snap([1, -1, -1]) });
  const f = Object.fromEntries(ev.factors.map((x) => [x.k, x]));
  assert.equal(f.seasonal.entry, "↑ 60");
  assert.equal(f.technical.now, "↓ 40");
  assert.equal(f.news.entry, "→ 25");
  assert.equal(f.weather.entry, "n/a", "a market with no weather factor says so");
  assert.equal(factorText({ dir: -1, strength: 30 }), "↓ 30");
  assert.equal(factorText(null), "—");
});

test("A FACTOR WHOSE INPUT FAILED IS 'not read', never a neutral the market did not say", () => {
  const now = { ready: true, failed: ["news"], factors: { seasonal: { dir: 1, strength: 50 }, technical: { dir: 0, strength: 0 }, news: { dir: 0, strength: 0 } } };
  const f = Object.fromEntries(entryVsNow({ p: J1, n: 9, pnl: 0, nowSignals: now }).factors.map((x) => [x.k, x]));
  assert.equal(f.news.now, "not read");
  assert.equal(f.seasonal.now, "↑ 50");
  assert.equal(f.technical.now, "→ 0", "a price trend that really is flat still says so");
});

test("A STRUCTURE WITH NO CEILING HAS NO MAXIMUM: an imported long call prints the words, not a grid edge", () => {
  const call = { ...J1, legs: [{ side: 1, type: "call", strike: 20, qty: 1 }], maxProfit: 777, maxLoss: -100 };
  const ev = entryVsNow({ p: call, n: 1, pnl: 40, popNow: null });
  const by = Object.fromEntries(ev.figures.map((f) => [f.k, f]));
  assert.match(by["MAX PROFIT"].entry, /no ceiling/i);
  assert.equal(by["RETURN ON RISK"].entry, "—");
});

test("FILE IN JOURNAL — offered only when the holding is gone (or never at a broker), a quiet link when unknown", () => {
  const held = { positions: [{ symbol: "GDX261030P00094000", qty: "9" }], orders: [], t: Date.parse("2026-10-02T11:00:00Z") };
  const gone = { positions: [], orders: [], t: Date.parse("2026-10-02T11:00:00Z") };
  assert.equal(fileState(J1, held), "held");
  assert.equal(fileState(J1, gone), "gone");
  assert.equal(fileState(J1, null), "unknown");
  assert.equal(fileState(J1, { positions: [], orders: [], t: 0 }), "unknown", "a failed or missing sync is not 'nothing held'");
  assert.equal(fileState({ ...J1, alpacaHeld: false, alpacaId: null, alpacaFilled: null, alpacaLive: false }, held), "book",
    "a record the app's own paper book holds has nothing to disagree with");
});

test("HOLDS — a structure equal to an open position's is found, whatever the size", () => {
  const owned = [J1];
  const cand = { ticker: "GDX", expKey: "2026-10-30", legs: [{ side: 1, type: "put", strike: 94, qty: 1 }] };
  assert.equal(holdsStructure(owned, cand), J1, "9 contracts held, 1 on the candidate: the same shape");
  assert.equal(holdsStructure(owned, { ...cand, legs: [{ side: 1, type: "put", strike: 90, qty: 1 }] }), null);
  assert.equal(holdsStructure(owned, { ...cand, expKey: "2026-11-20" }), null);
  assert.equal(holdsStructure(owned, { ...cand, ticker: "GLD" }), null);
  assert.equal(holdsStructure(owned, { ...cand, legs: [] }), null);
  assert.equal(holdsStructure([], cand), null);
});

test("HOLDS — it is a stop sign, FIRST, and never a gate refusal", () => {
  const s = stopSigns({ holds: true, flags: [{ id: "single", label: "single option" }] });
  assert.equal(s.labels[0].label, "You already hold this");
  assert.equal(stopSigns({}).labels.length, 0);
  assert.equal(/holds\s*[:=]/.test(readFileSync("src/riskGate.js", "utf8")), false, "the gate has no such input: it is a label");
});

test("0b — the filing dialog does not print a rule's sentence over a record Alpaca does not hold", () => {
  const alert = { tpHit: false, dteExit: true, slHit: false, dteLeft: 12, notHeld: ["+1 28C"] };
  const d = closeDecision({ alert, written: "" });
  assert.equal(d.ruleExit, false, "no rule ended a trade the broker does not hold");
  assert.equal(d.text, null);
  assert.equal(d.rule, null);
  assert.deepEqual(d.notHeld, ["+1 28C"]);
  assert.equal(d.reason.ok, false, "so the reason is the one the user writes");
  assert.match(notHeldCloseWords(d.notHeld), /Alpaca does not hold this leg \(\+1 28C\)/);
  assert.equal(closeDecision({ alert, written: "It expired on Friday and was never filled at the broker." }).reason.ok, true);
  // The same alert for a record the broker DOES hold still reads the time exit.
  const held = closeDecision({ alert: { ...alert, notHeld: null }, written: "" });
  assert.equal(held.ruleExit, true);
  assert.match(held.text, /exit window/);
});

test("THE BROKER PANEL — a holding with a record is one line", () => {
  assert.equal(onCardLine("J-0001", "+$2,925"), "✓ J-0001 · +$2,925 · on your Positions card");
});

test("ONE HOME — the card's stop level is the level that raises the warning", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.match(app, /stopWarningLevel\(\{ maxLoss: p\.maxLoss, contracts: n \}\)/);
  assert.equal(/RULES\.stopLossPct \* p\.maxLoss/.test(app), false, "posAlerts no longer spells the level itself");
  assert.equal(RULES.stopLossPct, 0.5);
});


/* ---- PR #47, TASK 0b and 0c ---- */
const J1_IMPORT = { ref: "J-0001", ticker: "GDX", expKey: "2026-10-30", legs: [{ side: 1, type: "put", strike: 94, qty: 9 }],
  entryNet: 45, contracts: 1, maxProfit: 37800, maxLoss: -4500 };
const J1_TICKET = { ...J1_IMPORT, legs: [{ side: 1, type: "put", strike: 94, qty: 1 }], entryNet: 5, contracts: 9, maxProfit: 4200, maxLoss: -500 };
const J2 = { ref: "J-0002", ticker: "XLE", legs: [{ side: 1, type: "call", strike: 90, qty: 5 }, { side: -1, type: "call", strike: 95, qty: 5 }],
  contracts: 5, entryNet: 10, maxProfit: 1500, maxLoss: -1000 };

test("0b — THE SIZE SENTENCE IS WHAT ALPACA HOLDS, PER LEG: 9 puts, 25 call spreads", () => {
  assert.equal(sizeWords(J1_IMPORT), "9 puts", "the import shape: contracts 1, nine in the leg");
  assert.equal(sizeWords(J1_TICKET), "9 puts", "the ticket shape: one in the leg, nine contracts");
  assert.equal(sizeWords(J2), "25 call spreads", "+25 / -25 at Alpaca, was '5 contracts'");
  assert.equal(unitWords([{ type: "put", side: 1 }, { type: "put", side: -1 }, { type: "call", side: -1 }, { type: "call", side: 1 }]), "iron condor");
  assert.equal(sizeWords({ legs: [{ side: 1, type: "call", strike: 1, qty: 1 }], contracts: 1 }), "1 call");
});

test("0c — the payoff at zero is part of the extremes: +1 94P at 5.00 makes $8,900, not $2,600", () => {
  assert.equal(payoffAtZero([{ side: 1, type: "put", strike: 94, qty: 1 }], 5), 8900);
  const ex = exactExtremes([{ side: 1, type: "put", strike: 94, qty: 1 }], 5);
  assert.equal(ex.maxProfit, 8900); assert.equal(ex.maxLoss, -500);
  // A put spread's best case is flat below its lower strike: nothing moves.
  const bear = exactExtremes([{ side: 1, type: "put", strike: 94, qty: 1 }, { side: -1, type: "put", strike: 90, qty: 1 }], 1.5);
  assert.equal(bear.maxProfit, 250); assert.equal(bear.maxLoss, -150);
  // A long call has no ceiling.
  assert.equal(exactExtremes([{ side: 1, type: "call", strike: 94, qty: 1 }], 2).maxProfit, null);
});

test("0c — J-0001's stored $37,800 is corrected on the card to $80,100 (1,780% of the risk), once", () => {
  const c = maxProfitCorrection(J1_IMPORT);
  assert.deepEqual(c, { from: 37800, to: 80100 });
  const ev = entryVsNow({ p: withExactMaxProfit(J1_IMPORT), n: 1, pnl: 2925 });
  assert.equal(ev.figures.find((f) => f.k === "MAX PROFIT").entry, "$80,100");
  assert.equal(ev.figures.find((f) => f.k === "RETURN ON RISK").entry, "1780%");
  assert.equal(J1_IMPORT.maxProfit, 37800, "the stored record keeps its figure");
  assert.ok(/\$37,800 → \$80,100/.test(maxProfitCorrectionNote(c, J1_IMPORT)));
  // The ticket shape: 9 × $8,900 as well.
  assert.ok(/\$80,100/.test(maxProfitCorrectionNote(maxProfitCorrection(J1_TICKET), J1_TICKET)));
  // A figure that was not cut off stands.
  assert.equal(maxProfitCorrection(J2), null);
  assert.equal(withExactMaxProfit(J2), J2);
  assert.equal(maxProfitCorrection({ ...J1_IMPORT, entryNet: null }), null, "no entry, no correction");
});

console.log(`\npositionView: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
