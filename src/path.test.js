// Tests for the numbered path (src/path.js) and for the shape of the steps in
// src/App.jsx that use it. Plain Node: `npm test` runs this file directly.
//
// What is actually being held here:
//
//  · the path is three steps in one order, and Build is the last one;
//  · the three different things the app calls a candidate — a guided road, a
//    Shortlist row, a multi-market hit — normalise to ONE shape, so comparing
//    and saving have one implementation rather than three;
//  · the compare cap refuses in words instead of silently ignoring a tap;
//  · a saved candidate is a `store.saved` item like any other, so the existing
//    hydration check accepts it and there is no second store.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  STEPS, FIRST_STEP, LAST_STEP, stepIndex, stepOf, nextStepId, prevStepId, stepCarry,
  candidateKey, candidateOf, legsLine, toggleCompare, inCompare, MAX_COMPARE,
  savedFromCandidate, candidateFromSaved, savedAge,
} from "./path.js";
import { BUILD_TAB } from "./handoff.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const APP = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

const LEGS = [
  { side: 1, qty: 1, type: "call", strike: 22 },
  { side: -1, qty: 1, type: "call", strike: 24 },
];

/* ---------------- the path ---------------- */

test("the path is two steps since PR #40: Find, then Build", () => {
  assert.deepEqual(STEPS.map((s) => s.id), ["find", "build"]);
  assert.deepEqual(STEPS.map((s) => s.n), [1, 2]);
  assert.equal(FIRST_STEP, "find");
  assert.equal(LAST_STEP, BUILD_TAB);
});

test("moving forward and back stays inside the path", () => {
  assert.equal(nextStepId("find"), "build");
  assert.equal(nextStepId("build"), "build", "there is nothing after Build");
  assert.equal(prevStepId("find"), "find", "there is nothing before Find");
  assert.equal(stepIndex("nonsense"), -1);
  assert.equal(stepOf("nonsense").id, "find", "an unknown step falls back to the first");
});

test("the nav says what each step is carrying", () => {
  const empty = stepCarry({});
  assert.match(empty.find, /every market/);
  assert.match(empty.build, /nothing loaded/);
  const carried = stepCarry({ ticker: "SOYB", trade: "SOYB · Bull Call Spread", compare: 2, markets: 3 });
  assert.match(carried.find, /3 markets/);
  assert.match(carried.find, /2 to compare/);
  assert.equal(carried.build, "SOYB · Bull Call Spread");
});

/* ---------------- one shape for a candidate ---------------- */

test("a guided road, a shortlist row and a multi-market hit normalise the same", () => {
  const road = candidateOf({
    ticker: "CORN", name: "Bull Call Spread", legs: LEGS, entryNet: 0.8, spot: 22.5,
    expKey: "2026-10-16", dte: 45, maxProfit: 120, maxLoss: -80, pop: 0.55,
  }, { source: "road" });
  const row = candidateOf({
    name: "Bull Call Spread", legs: LEGS, pop: 0.55, dte: 45, expKey: "2026-10-16",
    a: { entry: 0.8, maxProfit: 120, maxLoss: -80 },
  }, { ticker: "CORN", spot: 22.5, source: "shortlist" });
  const multi = candidateOf({
    tk: "CORN", name: "Bull Call Spread", legs: LEGS, expKey: "2026-10-16", dte: 45,
    pop: 0.55, spot: 22.5, a: { entry: 0.8, maxProfit: 120, maxLoss: -80 },
  }, { source: "wide search" });

  for (const c of [road, row, multi]) {
    assert.equal(c.ticker, "CORN");
    assert.equal(c.entryNet, 0.8);
    assert.equal(c.maxProfit, 120);
    assert.equal(c.maxLoss, -80);
    assert.equal(c.risk, 80, "risk is what the loss side actually is");
    assert.equal(c.dte, 45);
  }
  // Same trade from three places is ONE key: it cannot be ticked twice.
  assert.equal(road.key, row.key);
  assert.equal(row.key, multi.key);
  assert.match(road.key, /^CORN\|2026-10-16\|/);
  // The reward-to-risk ratio is derived, never asked for twice.
  assert.equal(road.rr, 1.5);
});

test("normalising copies the legs, so editing on Build cannot rewrite the row", () => {
  const c = candidateOf({ ticker: "CORN", name: "x", legs: LEGS, expKey: "e" });
  c.legs[0].strike = 99;
  assert.equal(LEGS[0].strike, 22);
});

test("something with no legs is not a candidate", () => {
  assert.equal(candidateOf({ ticker: "CORN", name: "x", legs: [] }), null);
  assert.equal(candidateOf(null), null);
});

test("the legs are written the way every list in the app writes them", () => {
  assert.equal(legsLine(LEGS), `+1 22C / \u22121 24C`);
});

/* ---------------- comparing ---------------- */

const cand = (name, strike) => candidateOf({
  ticker: "CORN", name, legs: [{ side: 1, qty: 1, type: "call", strike }],
  expKey: "2026-10-16", entryNet: 1, maxProfit: 100, maxLoss: -100,
});

test("three is the cap, and the fourth tap is refused in words", () => {
  assert.equal(MAX_COMPARE, 3);
  let list = [];
  for (const s of [20, 21, 22]) list = toggleCompare(list, cand("a", s)).list;
  assert.equal(list.length, 3);
  const r = toggleCompare(list, cand("a", 23));
  assert.equal(r.changed, false, "a fourth was accepted");
  assert.equal(r.list.length, 3);
  assert.match(r.note, /Untick one first/, "the refusal has to say why");
});

test("ticking the same candidate again unticks it", () => {
  const c = cand("a", 20);
  const on = toggleCompare([], c);
  assert.equal(on.list.length, 1);
  assert.ok(inCompare(on.list, c));
  const off = toggleCompare(on.list, c);
  assert.equal(off.list.length, 0);
  assert.equal(off.note, null);
  assert.equal(inCompare(off.list, c), false);
});

/* ---------------- keeping one ---------------- */

test("a kept candidate is a store.saved item like any other", () => {
  const c = candidateOf({
    ticker: "SOYB", name: "Iron Condor", legs: LEGS, entryNet: -0.4, spot: 24.1,
    expKey: "2026-11-20", dte: 52, maxProfit: 40, maxLoss: -60, pop: 0.7,
  }, { source: "shortlist" });
  const sv = savedFromCandidate(c, 1772000000000);
  // The shape App.jsx's own saveStrategy() writes: the hydration check on load
  // keeps anything with a legs array and a ticker string, and nothing else has
  // to learn about this.
  for (const k of ["id", "name", "ticker", "expKey", "dte", "legs", "savedAt"]) {
    assert.ok(k in sv, `a saved candidate has no ${k}`);
  }
  assert.ok(Array.isArray(sv.legs) && typeof sv.ticker === "string", "hydration would drop this row");
  assert.equal(sv.from, "shortlist");
  // and it reads back as the same trade
  const back = candidateFromSaved(sv);
  assert.equal(back.key, c.key);
  assert.equal(back.maxProfit, 40);
});

test("a saved row says how old its prices are, rather than passing them off as live", () => {
  const now = 1772000000000;
  const sv = savedFromCandidate(candidateOf({ ticker: "UNG", name: "x", legs: LEGS, expKey: "e" }), now);
  assert.match(savedAge(sv, now), /just now/);
  assert.match(savedAge(sv, now + 5 * 3600000), /5h ago/);
  assert.match(savedAge(sv, now + 3 * 86400000), /3d ago/);
  assert.match(savedAge(sv, now + 5 * 3600000), /prices below are from then/);
});

/* ---------------- the steps as they are wired in App.jsx ---------------- */

test("one step is on screen at a time, and Radar and Shortlist are gone", () => {
  for (const id of ["find", "build"]) {
    assert.ok(APP.includes(`step === "${id}"`), `nothing in App.jsx renders the ${id} step`);
  }
  for (const id of ["radar", "shortlist"]) {
    assert.ok(!APP.includes(`step === "${id}"`), `App.jsx still renders the ${id} step`);
    assert.ok(!APP.includes(`ev === "${id}"`), `${id} is still an evidence panel`);
  }
});

test("evidence opens over the step, not under it", () => {
  assert.ok(APP.includes("<EvidenceOverlay"), "the evidence sheet is not mounted");
  for (const id of ["levels", "history", "copilot", "why"]) {
    assert.ok(APP.includes(`ev === "${id}"`), `${id} is not one of the evidence sheets`);
  }
  // every evidence panel is inside the ONE overlay: no second mount point
  assert.equal(APP.split("<EvidenceOverlay").length - 1, 1, "there is more than one evidence sheet");
});

test("THE GUIDED DOOR IS GONE, and nothing imports it (PR #40, TASK 1)", () => {
  for (const name of ["runWizard", "pickRoad", "FindOpportunities", "WizardCandidates", "NothingToday", "wizStep"]) {
    assert.ok(!APP.includes(name), `App.jsx still carries ${name}`);
  }
  const WIZ = readFileSync(new URL("./wizard.jsx", import.meta.url), "utf8");
  for (const name of ["function FindOpportunities", "function WizardCandidates", "function NothingToday", "function RoadCard", "tradeOffSentence"]) {
    assert.ok(!WIZ.includes(name), `wizard.jsx still defines ${name}`);
  }
  assert.ok(!WIZ.includes("Find opportunities"), "the guided door's title survives");
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
