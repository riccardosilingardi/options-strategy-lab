// Tests for the hand-off into the Build screen (src/handoff.js) and for the
// shape of the call sites in src/App.jsx that use it.
// Plain Node, no test framework: `npm test` runs this file directly.
//
// The bug these guard against: after a scan, the button that should open a
// candidate on Build appeared to do nothing. Not because the trade was lost —
// the state was set correctly — but because the tap left the tall evidence
// panel open above it, so the trade landed below the fold, and in some cases
// set a ticker whose option chain had never been fetched, so Build had no
// price and rendered an empty state.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildHandOff, buildScreenState, BUILD_TAB } from "./handoff.js";
import { STEPS } from "./path.js";

/* ---------------- tiny harness ---------------- */
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- fixtures ----------------
   A CORN bull call spread coming off the Shortlist, and the app state of a
   user who is looking at the Shortlist when they tap "Open on Build". They are
   ALREADY on the Build tab: that is what made the old buttons look dead. */
const CANDIDATE = {
  ticker: "CORN", expKey: "2026-10-16", name: "Bull Call Spread",
  legs: [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }],
};
const CHAINS = { CORN: { spot: 22.4 }, UNG: { spot: 13.1 } };
const ON_SHORTLIST = { tab: "build", ev: "shortlist", ticker: "SOYB", expKey: null, legs: [], name: "" };

/** Apply a hand-off the way App.jsx's `openOnBuild` does, so the test walks the
 *  same path the buttons do rather than a paraphrase of it. */
const apply = (state, handOff) => ({
  ...state, tab: handOff.tab, ticker: handOff.ticker, expKey: handOff.expKey,
  legs: handOff.legs, name: handOff.name, ev: handOff.ev,
});

const APP = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");

/* ---------------- the reported bug ---------------- */

test("a candidate handed to Build lands on Build with its legs and no evidence panel open", () => {
  const h = buildHandOff({ ...CANDIDATE, chains: CHAINS });
  const after = apply(ON_SHORTLIST, h);

  assert.equal(after.tab, BUILD_TAB, "the trade must land on the Build screen");
  assert.equal(after.ev, null, "the evidence panel stays open and pushes the trade below the fold");
  assert.equal(after.ticker, "CORN");
  assert.equal(after.expKey, "2026-10-16");
  assert.equal(after.name, "Bull Call Spread");
  assert.deepEqual(after.legs, CANDIDATE.legs, "the candidate's own legs must be on Build");

  // ...and the Build screen actually renders the trade rather than an empty state.
  assert.equal(
    buildScreenState({ spot: CHAINS[after.ticker].spot, hasTrade: after.legs.length > 0, chainLoading: false }),
    "builder",
  );
});

test("the legs are copies: editing the trade on Build cannot rewrite the position it came from", () => {
  const h = buildHandOff({ ...CANDIDATE, chains: CHAINS });
  h.legs[0].strike = 999;
  assert.equal(CANDIDATE.legs[0].strike, 22);
  assert.notEqual(h.legs[0], CANDIDATE.legs[0]);
});

test("a ticker with no chain asks for one, so Build is not left without a price", () => {
  assert.equal(buildHandOff({ ...CANDIDATE, ticker: "WEAT", chains: CHAINS }).loadChain, true);
  assert.equal(buildHandOff({ ...CANDIDATE, chains: CHAINS }).loadChain, false);
  assert.equal(buildHandOff({ ...CANDIDATE, chains: {} }).loadChain, true);
});

test("every hand-off scrolls, because it can land on a tab the user is already on", () => {
  assert.equal(buildHandOff({ ...CANDIDATE, chains: CHAINS }).scroll, true);
});

/* ---------------- the four states of the Build screen ---------------- */

test("a chain in flight says so instead of reporting no market data", () => {
  assert.equal(buildScreenState({ spot: null, hasTrade: true, chainLoading: true }), "loading");
  assert.equal(buildScreenState({ spot: null, hasTrade: true, chainLoading: false }), "no-market-data");
  assert.equal(buildScreenState({ spot: 22.4, hasTrade: false, chainLoading: false }), "empty");
  assert.equal(buildScreenState({ spot: 22.4, hasTrade: true, chainLoading: false }), "builder");
});

/* ---------------- the call sites in App.jsx ----------------
   A hand-off is four things at once (carry the trade, close the evidence
   panel, fetch the chain, scroll). Written inline at a button, one of them
   gets forgotten — which is exactly how the bug happened. These check that no
   button hands a trade to Build on its own any more. */

test("no button sets the legs and the tab by hand: they all go through openOnBuild", () => {
  const inline = APP.split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => line.includes("setLegs(") && line.includes("setTab("));
  assert.deepEqual(inline.map(([n]) => n), [], "inline hand-off left in App.jsx — use openOnBuild");
});

test("openOnBuild does all five things", () => {
  const start = APP.indexOf("const openOnBuild =");
  assert.ok(start > 0, "openOnBuild is gone");
  const body = APP.slice(start, APP.indexOf("const applyPreset", start));
  for (const needed of ["setLegs(", "setEv(", "setTab(", "setStep(", "refreshChain(", "setScrollBuild("]) {
    assert.ok(body.includes(needed), `openOnBuild no longer does ${needed}`);
  }
});

test("every button that hands a trade to Build uses it", () => {
  // Shortlist preset, multi-market scan, Monitor, Load, and the wizard's road.
  const uses = APP.split("openOnBuild({").length - 1;
  assert.ok(uses >= 5, `only ${uses} hand-offs route through openOnBuild`);
});

/* ---------------- the rename ---------------- */

test('the place is called Build, and "bench" survives nowhere', () => {
  // Build is step 3 of the path now (src/path.js) rather than one of three
  // tabs, but the name and the tab id are unchanged: `BUILD_TAB` is still
  // "build" and every hand-off still lands there.
  assert.equal(STEPS[STEPS.length - 1].id, BUILD_TAB, "the last step is no longer the Build screen");
  assert.equal(STEPS[STEPS.length - 1].label, "Build", "the last step is no longer called Build");
  const leftovers = APP.split("\n")
    .map((line, i) => [i + 1, line])
    .filter(([, line]) => /bench/i.test(line));
  assert.deepEqual(leftovers.map(([n]) => n), [], "the word Bench is still in App.jsx");
});

/* ----------------------------------------------------------------------
   A HAND-OFF CARRIES THE TRADE ONTO THE BOARD IT IS HANDING IT TO.

   PRD §4n. The SOYB order the broker refused named a 27.5 call on a board that
   does not list one, and the legs could only have got there two ways: the
   expiry dropdown, or a hand-off. Neither re-snapped. This closes the second.
---------------------------------------------------------------------- */
const BOARD = {
  SOYB: {
    byExp: {
      "2026-11-20": { calls: { 27: {}, 28: {}, 29: {} }, puts: { 27: {}, 28: {} }, dte: 61 },
      "2026-10-16": { calls: { 27: {}, 27.5: {}, 28: {} }, puts: { 27.5: {} }, dte: 26 },
    },
  },
};

test("a leg carried from another board is snapped onto this one, and it says so", () => {
  const h = buildHandOff({
    ticker: "SOYB", expKey: "2026-11-20", name: "x", chains: BOARD,
    legs: [{ side: 1, type: "call", strike: 27.5 }, { side: -1, type: "call", strike: 29 }],
  });
  // 27.5 is exactly between the 27 and the 28 this board carries, and
  // `snapStrike()` has always resolved a tie to the first equally-near strike
  // it met. That is arbitrary and it is DETERMINISTIC, which is what matters:
  // the leg lands on a contract that exists either way, and nothing here
  // changes the arithmetic `buildPresets()` has always used.
  assert.equal(h.legs[0].strike, 27, "the 27.5 the 2026-11-20 board does not list survived");
  assert.equal(h.legs[1].strike, 29, "a strike the board DOES list was moved");
  assert.equal(h.moved.length, 1);
  assert.deepEqual(h.moved[0], { i: 0, from: 27.5, to: 27 });
});

test("a leg the board already lists is untouched, and nothing is said", () => {
  const h = buildHandOff({
    ticker: "SOYB", expKey: "2026-10-16", name: "x", chains: BOARD,
    legs: [{ side: 1, type: "call", strike: 27.5 }],
  });
  assert.equal(h.legs[0].strike, 27.5);
  assert.deepEqual(h.moved, []);
});

test("AN UNLOADED CHAIN IS UNKNOWN, NOT A GRID TO SNAP AGAINST", () => {
  // Snapping against a fallback step is how an invented strike is invented.
  const h = buildHandOff({
    ticker: "SOYB", expKey: "2026-11-20", name: "x", chains: {},
    legs: [{ side: 1, type: "call", strike: 27.5 }],
  });
  assert.equal(h.legs[0].strike, 27.5, "a leg was moved against a board nobody has loaded");
  assert.deepEqual(h.moved, []);
  assert.equal(h.loadChain, true);
  // ...and neither is an expiry the loaded chain does not carry.
  const other = buildHandOff({
    ticker: "SOYB", expKey: "2027-01-15", name: "x", chains: BOARD,
    legs: [{ side: 1, type: "call", strike: 27.5 }],
  });
  assert.equal(other.legs[0].strike, 27.5);
});

test("the legs are still COPIES — snapping must not rewrite the position it came from", () => {
  const legs = [{ side: 1, type: "call", strike: 27.5 }];
  const h = buildHandOff({ ticker: "SOYB", expKey: "2026-11-20", name: "x", chains: BOARD, legs });
  assert.equal(legs[0].strike, 27.5, "the caller's legs were mutated");
  assert.notEqual(h.legs[0], legs[0]);
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
