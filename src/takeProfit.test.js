// Tests for the take-profit target (owner decision, 2 Oct 2026, PRD §2).
//
// Measured on J-0001 (9 x GDX 94P, average $5.00, now $8.25): P&L +$2,925 is +65% of the
// $4,500 paid. The old rule, 50% of the MAXIMUM profit, is 50% x (94 - 5) x 100 x 9 = $40,050,
// so the card could only ever read HOLD until the time exit. A single long option now takes
// profit at +50% of the premium paid; a spread keeps 50% of its maximum.
//
// Plain Node, no framework: `npm test` runs this file directly.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { RULES, takeProfitTarget, takeProfitBasisWords, takeProfitProgress, ruleExitOf, positionAction,
  autopilotVerdict, tradeCard } from "./rules.js";
import { exitSim, netBS } from "./engine.js";
import { sigmaProvenance } from "./rules.js";
import { closeDecision } from "./journal.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const J0001 = { legs: [{ side: 1, type: "put", strike: 94, qty: 1 }], entryNet: 5, maxProfit: 8900, maxLoss: -500, contracts: 9 };
const SPREAD = { legs: [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 22, qty: 1 }],
  entryNet: 0.6, maxProfit: 140, maxLoss: -60, contracts: 3 };
const LONG_CALL = { legs: [{ side: 1, type: "call", strike: 20, qty: 1 }], entryNet: 1.2, maxProfit: null, maxLoss: -120, contracts: 2 };

test("the constant lives in RULES and is 0.5", () => {
  assert.equal(RULES.singleTakeProfitPctOfPremium, 0.5);
});

test("J-0001: a single long put takes profit at 50% of the premium paid, not of its maximum", () => {
  const t = takeProfitTarget(J0001);
  assert.equal(t.basis, "premium");
  assert.equal(t.base, 500);
  assert.equal(t.perCombo, 250);
  assert.equal(t.dollars, 2250, "9 x $250");
  assert.notEqual(t.dollars, 0.5 * 8900 * 9, "and not the $40,050 the old rule needed");
});

test("J-0001 at +$2,925 reads CLOSE with the premium sentence", () => {
  const t = takeProfitTarget(J0001);
  const tpHit = 2925 >= t.dollars;
  assert.equal(tpHit, true);
  const act = positionAction({ tpHit, pnl: 2925, dteLeft: 28, tpBasis: t.basis });
  assert.equal(act.action, "CLOSE");
  assert.equal(act.rule, "take-profit");
  assert.equal(act.line, "Take profit reached: 50% of the premium paid.");
});

test("a spread keeps 50% of its maximum profit, whole position", () => {
  const t = takeProfitTarget(SPREAD);
  assert.equal(t.basis, "max-profit");
  assert.equal(t.perCombo, 70);
  assert.equal(t.dollars, 210);
  const act = positionAction({ tpHit: true, pnl: 215, dteLeft: 40, tpBasis: t.basis });
  assert.equal(act.line, "Take profit reached: 50% of the maximum profit.");
});

test("a long call has no maximum and still has a target: the premium", () => {
  const t = takeProfitTarget(LONG_CALL);
  assert.equal(t.basis, "premium");
  assert.equal(t.perCombo, 60);
  assert.equal(t.dollars, 120);
});

test("UNKNOWN IS NOT ZERO: no maximum and not a single option is NO target, never $0", () => {
  const t = takeProfitTarget({ legs: [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 20, qty: 1 }, { side: 1, type: "call", strike: 25, qty: 1 }],
    maxProfit: null, maxLoss: -100, entryNet: 1 });
  assert.equal(t.basis, null);
  assert.equal(t.perCombo, null);
  assert.equal(t.dollars, null);
  assert.equal(takeProfitTarget({}).dollars, null);
});

test("a single option with an unreadable entry falls back to its maximum loss (which IS the premium), else no target", () => {
  assert.equal(takeProfitTarget({ legs: J0001.legs, entryNet: null, maxLoss: -500 }).perCombo, 250);
  assert.equal(takeProfitTarget({ legs: J0001.legs, entryNet: null, maxLoss: null }).perCombo, null);
});

test("a single SHORT leg is not a long option: it keeps the maximum-profit basis", () => {
  const t = takeProfitTarget({ legs: [{ side: -1, type: "put", strike: 10, qty: 1 }], maxProfit: 80, maxLoss: -920, entryNet: -0.8 });
  assert.equal(t.basis, "max-profit");
});

test("progress is a share of the target, null when either side is unknown", () => {
  assert.equal(takeProfitProgress(1125, takeProfitTarget(J0001)), 0.5);
  assert.equal(takeProfitProgress(null, takeProfitTarget(J0001)), null);
  assert.equal(takeProfitProgress(10, takeProfitTarget({})), null);
});

test("ruleExitOf and closeDecision say which basis fired", () => {
  assert.match(ruleExitOf({ tpHit: true, tpBasis: "premium" }).text, /50% of the premium paid/);
  assert.match(ruleExitOf({ tpHit: true }).text, /50% of the maximum profit/);
  const d = closeDecision({ alert: { tpHit: true, tpTarget: { basis: "premium" }, dteLeft: 20 } });
  assert.equal(d.ruleExit, true);
  assert.match(d.text, /premium paid/);
});

test("autopilotVerdict: the same target decides the proposal", () => {
  const t = takeProfitTarget({ ...J0001, contracts: 1 });
  const hit = autopilotVerdict({ takeProfit: t, pnl: 325, maxLoss: -500, dteLeft: 28, modelled: false });
  assert.equal(hit.verdict, "CLOSE_ALL");
  assert.equal(hit.rule, "take-profit");
  assert.match(hit.rationale, /premium paid/);
  const miss = autopilotVerdict({ takeProfit: t, pnl: 200, maxLoss: -500, dteLeft: 28, modelled: false });
  assert.equal(miss.verdict, "HOLD");
  const none = autopilotVerdict({ takeProfit: takeProfitTarget({}), pnl: 9999, maxLoss: -500, dteLeft: 28 });
  assert.equal(none.rule, null, "no target, no take-profit rule");
});

test("exitSim takes the target as a number, and refuses a policy with none (null is a target that does not exist)", () => {
  const vol = sigmaProvenance(null, 0.4, "TEST");
  const pos = { legs: LONG_CALL.legs, entryNet: 1.2, maxProfit: null, maxLoss: -120 };
  const base = { exitDTE: RULES.exitDTE, stopLossPct: RULES.stopLossPct };
  assert.throws(() => exitSim(pos, 20, 60, 0.4, vol, base, 5), /exit policy/i);
  const withTarget = exitSim(pos, 20, 60, 0.4, vol, { ...base, takeProfit: 60 }, 400);
  const without = exitSim(pos, 20, 60, 0.4, vol, { ...base, takeProfit: null }, 400);
  assert.ok(withTarget.pTP > 0, "a long call can now reach its target");
  assert.equal(without.pTP, 0);
  assert.ok(netBS(pos.legs, 20, 60, 0.4) > 0);
});

test("the trade card and the exit plan name the premium for a single option and the maximum for a spread", () => {
  const card = (c) => tradeCard({ ticker: "GDX", name: "x", maxLoss: c.maxLoss, maxProfit: c.maxProfit, profitUnbounded: c.maxProfit == null,
    contracts: 1, takeProfit: takeProfitTarget(c), breakevens: [], entry: c.entryNet }).lines.find((l) => l.id === "exits").text;
  assert.match(card(LONG_CALL), /50% of the premium paid/);
  assert.doesNotMatch(card(LONG_CALL), /no take-profit figure/);
  assert.match(card(SPREAD), /50% of the best case/);
});

test("ONE HOME: no site outside rules.js multiplies a maximum by the take-profit constant", () => {
  const files = ["src/App.jsx", "src/pro.jsx", "src/visuals.jsx", "src/wizard.jsx", "src/engine.js", "netlify/functions/autopilot.mjs", "netlify/functions/approve.mjs"];
  for (const f of files) {
    const code = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    assert.equal(/takeProfitPct\s*\*|\*\s*RULES\.takeProfitPct/.test(code), false, `${f} works a take-profit target out by itself`);
  }
});

test("the words have one home", () => {
  assert.equal(takeProfitBasisWords("premium"), "50% of the premium paid");
  assert.equal(takeProfitBasisWords("max-profit"), "50% of the maximum profit");
});

console.log(`\ntakeProfit: ${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
