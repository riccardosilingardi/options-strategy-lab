/* ============================================================================
   THE EXIT SIMULATOR WALKED TO THE WRONG DAY (PR #24).

   `exitSim()` in `src/engine.js` opened with four copies of three rules that
   have a home in `src/rules.js`:

       const tp = Number.isFinite(pos.maxProfit) ? 0.5 * pos.maxProfit : null;
       const sl = 0.5 * pos.maxLoss, days = Math.max(1, dteLeft - 7);
       ...
       const pnl = (netBS(pos.legs, s, 7, iv) - pos.entryNet) * 100;

   `takeProfitPct` is 0.5 and `stopLossPct` is 0.5, so those two were right by
   luck. `exitDTE` is **21**, and has been since it was CHANGED FROM 7 — the
   comment beside it in `rules.js` says so. So the simulator walked the position
   to 7 days and marked whatever survived at 7 days, while the app's own rule
   closes or rolls it at 21, and `netlify/functions/autopilot.mjs` handed the
   result to the model in a field called `p_exit_at_exit_dte_positive`. The name
   asserted the rule the arithmetic had not applied.

   Plain Node, no test framework: `npm test` runs this file directly.
============================================================================ */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { exitSim, netBS, SIGMA, terminalMC, seedFrom, rng, seasonalDrift, SEASONAL } from "./engine.js";
import { RULES } from "./rules.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const codeOf = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** The policy the app actually applies, read from its home. */
const POLICY = { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct, stopLossPct: RULES.stopLossPct };
/** And the one the simulator used to apply by itself. */
const OLD_POLICY = { exitDTE: 7, takeProfitPct: 0.5, stopLossPct: 0.5 };

/* ---------- the fixtures ----------------------------------------------------
   Three positions, priced from the app's own model so nothing here depends on
   a feed. `entryNet` is what the structure cost at entry; `maxProfit` and
   `maxLoss` are per combination, as they are everywhere in this app. */
const vertical = (ticker, spot, k1, k2, dteAtEntry, iv) => {
  const legs = [{ side: 1, type: "call", strike: k1, qty: 1 }, { side: -1, type: "call", strike: k2, qty: 1 }];
  const entryNet = netBS(legs, spot, dteAtEntry, iv);
  return { ticker, legs, entryNet, maxProfit: (k2 - k1 - entryNet) * 100, maxLoss: -entryNet * 100 };
};
const FIXTURES = [
  { name: "CORN bull call spread 20/22, 41 DTE", dteLeft: 41, spot: 20, iv: 0.28,
    sigma: SIGMA.CORN, pos: vertical("CORN", 20, 20, 22, 45, 0.28) },
  { name: "BOIL bull call spread 21/24, 50 DTE", dteLeft: 50, spot: 21.2, iv: 0.85,
    sigma: SIGMA.BOIL, pos: vertical("BOIL", 21.2, 21, 24, 55, 0.85) },
  { name: "UNG long call 11, 35 DTE (NO CEILING)", dteLeft: 35, spot: 10.6, iv: 0.55,
    sigma: SIGMA.UNG,
    pos: (() => {
      const legs = [{ side: 1, type: "call", strike: 11, qty: 1 }];
      const entryNet = netBS(legs, 10.6, 40, 0.55);
      // `payoffCeiling()` says a long call has no maximum profit, so the record
      // carries null — never a number, never Infinity (PRD §4c).
      return { ticker: "UNG", legs, entryNet, maxProfit: null, maxLoss: -entryNet * 100 };
    })() },
];

/** A seeded generator, so a Monte Carlo can be asserted rather than eyeballed.
 *  Mulberry32: one multiply-and-xor per draw, no dependency, same sequence on
 *  every machine. `exitSim` draws from `Math.random`, so this replaces it for
 *  the length of one run and puts the real one back afterwards. */
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
const run = (f, policy, seed = 20260919) =>
  seeded(seed, () => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.sigma, policy, 1500));

/* ---------- the policy is the caller's, and there is no default ---------- */

test("EXIT POLICY — exitSim REFUSES to run without one, rather than inventing it", () => {
  const f = FIXTURES[0];
  // A default is how the bare 7 comes back, silently, in a year.
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.sigma), /exit policy/i);
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.sigma, {}), /exit policy/i);
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.sigma,
    { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct }), /exit policy/i);
  // ...and a null exit DTE is not "no exit rule", it is an unreadable one.
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.sigma,
    { ...POLICY, exitDTE: null }), /exit policy/i);
});

test("EXIT POLICY — engine.js holds no exit rule of its own", () => {
  const code = codeOf("engine.js");
  assert.equal(/dteLeft\s*-\s*7\b/.test(code), false, "the walk no longer ends at a hardcoded 7");
  assert.equal(/0\.5\s*\*\s*pos\.max(Profit|Loss)/.test(code), false, "nor does it spell the two halves");
  assert.equal(/from\s+["']\.\/rules\.js["']/.test(code), false,
    "and it still imports nothing — rules.js imports THIS file, and a cycle is not the fix");
});

/* ---------- the horizon, proved rather than asserted --------------------- */

test("HORIZON — at an exit DTE of 21 nothing is evaluated at 7", () => {
  // WITH SIGMA ZERO THE WALK IS DETERMINISTIC: the price never moves, so every
  // path survives to the end and is marked at the exit rule. That makes `ev`
  // an exact arithmetic statement about WHICH DAY the marking happened on.
  const f = FIXTURES[0];
  const still = { ...f, sigma: 0 };
  const at21 = exitSim(still.pos, still.spot, still.dteLeft, still.iv, 0, POLICY, 20);
  const expected21 = (netBS(f.pos.legs, f.spot, RULES.exitDTE, f.iv) - f.pos.entryNet) * 100;
  const expected7 = (netBS(f.pos.legs, f.spot, 7, f.iv) - f.pos.entryNet) * 100;
  assert.ok(Math.abs(at21.ev - expected21) < 1e-9, `marked at ${RULES.exitDTE} DTE, got ${at21.ev}`);
  assert.ok(Math.abs(at21.ev - expected7) > 1, "and NOT at 7 — that is the fault, and the two differ");
  // The same call under the old policy lands on the other number, which is
  // what the autopilot has been reporting for four pull requests.
  const at7 = exitSim(still.pos, still.spot, still.dteLeft, still.iv, 0, OLD_POLICY, 20);
  assert.ok(Math.abs(at7.ev - expected7) < 1e-9, `the old policy marked at 7 DTE, got ${at7.ev}`);
});

test("HORIZON — the window is what is left BEFORE the rule acts, and it is reported", () => {
  const f = FIXTURES[1];
  const s = run(f, POLICY);
  assert.equal(s.horizon, f.dteLeft - RULES.exitDTE, "50 DTE with a 21-DTE rule is 29 days of room");
  assert.equal(s.exitDTE, RULES.exitDTE, "and the result says which day it stopped at");
  // A position already inside the exit window still simulates one day rather
  // than zero — `Math.max(1, ...)` — and says so.
  const inside = exitSim(f.pos, f.spot, RULES.exitDTE - 5, f.iv, f.sigma, POLICY, 50);
  assert.equal(inside.horizon, 1);
});

test("HORIZON — no take-profit branch exists when the profit has no ceiling", () => {
  // `takeProfitPct * null` is 0, which would count every path that touched
  // break-even as a take-profit exit (PRD §4c).
  const f = FIXTURES[2];
  const s = run(f, POLICY);
  assert.equal(s.pTP, 0, "no path can take profit at a target that does not exist");
  assert.equal(s.medDays, null, "and there is no median number of days to reach it");
  assert.ok(s.pSL + s.pTimePos > 0, "the loss side is untouched: rule 2 still holds");
});

/* ---------- WHAT THE NUMBERS ACTUALLY DID, before and after ---------------
   Real assertions, not snapshots: each one is the seeded run at the OLD policy
   and at the rule the app applies, so the table in the pull request body is
   reproducible by running this file. */

const MOVE = [
  // Seeded at 20260919, 1500 paths. Every figure below is what this file
  // actually prints; the pull request's table is these numbers.
  ["CORN bull call spread 20/22, 41 DTE",
    { pTP: 0.226, pSL: 0.623, pTimePos: 0.093, ev: -2.00, medDays: 22, horizon: 34 },
    { pTP: 0.097, pSL: 0.419, pTimePos: 0.294, ev: -1.30, medDays: 15, horizon: 20 }],
  ["BOIL bull call spread 21/24, 50 DTE",
    { pTP: 0.435, pSL: 0.557, pTimePos: 0.003, ev: 20.56, medDays: 12, horizon: 43 },
    { pTP: 0.393, pSL: 0.519, pTimePos: 0.054, ev: 19.52, medDays: 11, horizon: 29 }],
  ["UNG long call 11, 35 DTE (NO CEILING)",
    { pTP: 0, pSL: 0.767, pTimePos: 0.192, ev: -9.10, medDays: null, horizon: 28 },
    { pTP: 0, pSL: 0.554, pTimePos: 0.281, ev: -8.08, medDays: null, horizon: 14 }],
];

test("BEFORE AND AFTER — every simulator output moves, and by how much is written down", () => {
  for (const [name, before, after] of MOVE) {
    const f = FIXTURES.find((x) => x.name === name);
    const a = run(f, OLD_POLICY), b = run(f, POLICY);
    // The counts are n/1500, so the tolerance is a handful of paths: enough to
    // survive a last-bit difference in Math.exp on another machine, far too
    // little to hide a change of policy.
    const near = (x, y, tol, what) => assert.ok(Math.abs(x - y) <= tol, `${name} ${what}: ${x} is not ${y}`);
    for (const k of ["pTP", "pSL", "pTimePos"]) { near(a[k], before[k], 0.01, `old ${k}`); near(b[k], after[k], 0.01, `new ${k}`); }
    near(a.ev, before.ev, 0.5, "old ev"); near(b.ev, after.ev, 0.5, "new ev");
    assert.equal(a.horizon, before.horizon, `${name} old horizon`);
    assert.equal(b.horizon, after.horizon, `${name} new horizon`);
    if (before.medDays == null) { assert.equal(a.medDays, null); assert.equal(b.medDays, null); }
    else { near(a.medDays, before.medDays, 1, "old medDays"); near(b.medDays, after.medDays, 1, "new medDays"); }
  }
});

test("BEFORE AND AFTER — the direction is the same on every fixture that has a ceiling", () => {
  // THE SHORTER WALK IS THE WHOLE OF THE CHANGE. Fourteen fewer days of price
  // path means fewer chances to touch either barrier, so pTP and pSL both fall
  // and the share still open at the rule rises. Anything else would be a
  // finding rather than a rounding difference.
  for (const f of FIXTURES.filter((x) => x.pos.maxProfit != null)) {
    const a = run(f, OLD_POLICY), b = run(f, POLICY);
    assert.ok(b.horizon < a.horizon, `${f.name}: the new window is shorter`);
    assert.ok(b.pTP <= a.pTP, `${f.name}: pTP ${b.pTP} should not exceed ${a.pTP}`);
    assert.ok(b.pSL <= a.pSL, `${f.name}: pSL ${b.pSL} should not exceed ${a.pSL}`);
    assert.ok(b.pTimePos + b.pTP + b.pSL <= 1.0000001, `${f.name}: the three outcomes are exhaustive`);
    assert.ok(b.pTimePos > a.pTimePos, `${f.name}: more of the book is still open at the rule`);
  }
});

/* ---------- and the shape that hid it ------------------------------------ */

test("NO SIMULATOR MARKS A SURVIVOR AT A HARDCODED HORIZON", () => {
  // The rule-literal sweep in riskGate.test.js cannot catch this one: 7 is not
  // the VALUE of any rule any more, it is a STALE copy of one, and no matcher
  // can know that a bare number used to be right. What can be refused is the
  // SHAPE — `netBS()` is the app's one pricing call and its third argument is
  // how many days are left, so a number literal there is always a policy
  // somebody wrote down twice. Both simulators had one.
  for (const file of ["engine.js", "pro.jsx"]) {
    const hits = codeOf(file).match(/netBS\(\s*[^),]+,\s*[^),]+,\s*-?\d+(\.\d+)?\s*[,)]/g) || [];
    assert.deepEqual(hits, [], `${file} prices at a hardcoded number of days: ${hits.join(", ")}`);
  }
});

/* ============================================================================
   ONE CHANCE, ONE ARITHMETIC (PR #25) — THE ENGINE HALF.

   `terminalMC()` replaces four calculations of "the chance of profit". What is
   held here is the three properties that make it usable as a single truth: it
   refuses to run without a policy, it is deterministic given a seed, and the
   drift it is handed is the app's own seasonal reading rather than a constant
   nobody chose.
============================================================================ */

const VERT = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
const MC_POLICY = { driftAnnual: 0.1, sigma: 0.85, dte: 45, runs: 4000, seed: seedFrom("fixture") };

test("terminalMC THROWS without a policy — a default is how a stale number returns", () => {
  assert.throws(() => terminalMC(VERT, 0.4, 20), TypeError);
  assert.throws(() => terminalMC(VERT, 0.4, 20, {}), TypeError);
  // ...and without ANY ONE of the five. A partial policy is the dangerous case:
  // it looks like a call that was written deliberately.
  for (const k of ["driftAnnual", "sigma", "dte", "runs", "seed"]) {
    const partial = { ...MC_POLICY };
    delete partial[k];
    assert.throws(() => terminalMC(VERT, 0.4, 20, partial), TypeError, `missing ${k} must throw`);
  }
  // `Number(null)` is 0 and 0 is finite — the fault this whole repository is
  // about — so null is refused where undefined is.
  assert.throws(() => terminalMC(VERT, 0.4, 20, { ...MC_POLICY, seed: null }), TypeError);
  // A run count or a volatility of zero is a RangeError, not a silent answer.
  assert.throws(() => terminalMC(VERT, 0.4, 20, { ...MC_POLICY, runs: 0 }), RangeError);
  assert.throws(() => terminalMC(VERT, 0.4, 20, { ...MC_POLICY, sigma: 0 }), RangeError);
  assert.throws(() => terminalMC(VERT, 0.4, 0, MC_POLICY), RangeError);
});

test("SEEDED — two callers with one seed get the IDENTICAL number, to the last bit", () => {
  // This is the whole reason the Monte Carlo can be the single truth. Unseeded,
  // the Radar row and the Build panel would print two different percentages for
  // one trade and both would be right.
  const a = terminalMC(VERT, 0.4, 20, MC_POLICY);
  const b = terminalMC(VERT, 0.4, 20, MC_POLICY);
  assert.equal(a.pop, b.pop, "not approximately equal — equal");
  assert.equal(a.ev, b.ev);
  assert.equal(a.p5, b.p5);
  assert.deepEqual(a.bins, b.bins);
  // And a different seed really is a different stream, or the seed is doing
  // nothing and the equality above proves nothing.
  const c = terminalMC(VERT, 0.4, 20, { ...MC_POLICY, seed: seedFrom("another") });
  assert.notEqual(a.pop, c.pop, "a different seed must walk a different path");
  // ...but the same answer to within its own sampling error: 4,000 runs is a
  // standard error of about 0.8 points, so two seeds inside 4 points is the
  // behaviour of one distribution sampled twice, not of two distributions.
  assert.ok(Math.abs(a.pop - c.pop) < 0.04, `${a.pop} vs ${c.pop}`);
});

test("seedFrom is stable — the same key gives the same seed on every machine", () => {
  // If this ever changes, every chance in the app moves by its sampling error
  // at once, for no reason a reader could see. The literals are the regression.
  assert.equal(seedFrom("BOIL|2026-11-06|45|1C21x1,-1C22x1|21.23"), 1418194756);
  assert.equal(seedFrom(""), 2166136261);
  assert.equal(seedFrom("a"), 3826002220);
  assert.notEqual(seedFrom("a"), seedFrom("b"));
});

test("rng is uniform enough to be a Monte Carlo and never returns 1", () => {
  const next = rng(seedFrom("uniformity"));
  let sum = 0, min = 1, max = 0;
  const N = 200000;
  for (let i = 0; i < N; i++) { const x = next(); sum += x; if (x < min) min = x; if (x > max) max = x; }
  assert.ok(Math.abs(sum / N - 0.5) < 0.005, `mean ${sum / N}`);
  assert.ok(min >= 0 && max < 1, `range ${min}..${max}`);
});

test("terminalMC is ARITHMETICALLY right where the answer is known", () => {
  // At a volatility approaching zero the terminal price is S * exp(drift * T)
  // and the payoff there is the only outcome, so the chance is exactly 1 or 0
  // and the mean is exactly that payoff. Nothing here is a probability: it is
  // the simulator's own arithmetic checked against closed-form arithmetic.
  const tiny = { driftAnnual: 0, sigma: 1e-6, dte: 45, runs: 500, seed: seedFrom("tiny") };
  const win = terminalMC(VERT, 0.4, 20.9, tiny);     // payoff 0.90 against a 0.40 cost
  assert.equal(win.pop, 1);
  assert.ok(Math.abs(win.ev - 50) < 0.1, `ev ${win.ev}`);
  const lose = terminalMC(VERT, 0.4, 19, tiny);      // expires worthless
  assert.equal(lose.pop, 0);
  assert.ok(Math.abs(lose.ev + 40) < 0.1, `ev ${lose.ev}`);
  // A P&L of exactly zero is NOT a profit — the convention `payoffBands()` and
  // `analyze()` use. A call struck far above every path it walks pays nothing
  // on every run; at a cost of nothing that is break-even on every run, and
  // break-even is not a win.
  const nothing = terminalMC([{ side: 1, type: "call", strike: 1000, qty: 1 }], 0, 20,
    { ...MC_POLICY, runs: 1000 });
  assert.equal(nothing.pop, 0, "getting your money back is not a win");
  assert.equal(nothing.ev, 0);
});

test("terminalMC moves the right way when the DRIFT moves, and only then", () => {
  const up = terminalMC(VERT, 0.4, 20, { ...MC_POLICY, driftAnnual: 0.5 });
  const flat = terminalMC(VERT, 0.4, 20, { ...MC_POLICY, driftAnnual: 0 });
  const down = terminalMC(VERT, 0.4, 20, { ...MC_POLICY, driftAnnual: -0.5 });
  assert.ok(up.pop > flat.pop && flat.pop > down.pop,
    `a call spread must do better in a rising market: ${down.pop} ${flat.pop} ${up.pop}`);
});

test("seasonalDrift is the app's own thesis, annualised over the window held", () => {
  // The arithmetic that used to live inside `montecarlo()` in App.jsx: the mean
  // of the monthly means over the months the trade is actually open for, times
  // twelve. A 45-day trade opened in September spans two months.
  const mm = Array(12).fill(0); mm[8] = 1.2; mm[9] = -0.6;
  assert.ok(Math.abs(seasonalDrift(mm, 8, 45) - ((0.012 + -0.006) / 2) * 12) < 1e-12);
  // One month when the window is one month.
  assert.ok(Math.abs(seasonalDrift(mm, 8, 20) - 0.012 * 12) < 1e-12);
  // It wraps round the end of the year rather than falling off it.
  const dec = Array(12).fill(0); dec[11] = 2; dec[0] = 2;
  assert.ok(Math.abs(seasonalDrift(dec, 11, 45) - 0.24) < 1e-12);
  // UNKNOWN IS NOT A DRIFT OF ZERO. A short table, a missing month or no
  // horizon is null, and `chanceOf()` turns that into a dash on screen.
  assert.equal(seasonalDrift(null, 8, 45), null);
  assert.equal(seasonalDrift([1, 2, 3], 8, 45), null);
  assert.equal(seasonalDrift(Array(12).fill(null), 8, 45), null);
  assert.equal(seasonalDrift(mm, 8, 0), null);
});

test("the REAL seasonal tables produce the drifts the PRD's table was built on", () => {
  // September, 45 days: the grain markets read negative and the gas markets
  // positive, which is why every CHANCE moved DOWN on CORN, SOYB and WEAT and
  // UP on UNG and BOIL when the drift changed. PRD §4h carries the table.
  const at = (tk) => +(seasonalDrift(SEASONAL[tk], 8, 45) * 100).toFixed(1);
  assert.equal(at("CORN"), -9.6);
  assert.equal(at("SOYB"), -8.4);
  assert.equal(at("WEAT"), -3.6);
  assert.equal(at("UNG"), 14.4);
  assert.equal(at("BOIL"), 26.4);
});

test("THE CLOSED FORMS ARE GONE FROM THE ENGINE", () => {
  // `probProfit` integrated the payoff against a lognormal at a RISK-NEUTRAL
  // drift of 0.045 and was one of four answers to one question. Deleting it is
  // the point of PR #25: a faster approximation kept beside the truth is a
  // second number waiting for a screen to print it.
  assert.ok(!/probProfit/.test(codeOf("engine.js")), "engine.js still defines probProfit");
  // `codeOf` strips comments, so the note in pro.jsx explaining the deletion
  // does not count as a definition — only live code does.
  assert.ok(!/probProfit/.test(codeOf("pro.jsx")), "pro.jsx still defines probProfit");
  assert.ok(!/probProfit/.test(codeOf("App.jsx")), "App.jsx still calls probProfit");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
