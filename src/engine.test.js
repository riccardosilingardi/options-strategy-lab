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
import { exitSim, netBS, SIGMA, terminalMC, seedFrom, rng, seasonalDrift, SEASONAL,
  parseAvJson, statsFromMatrix } from "./engine.js";
import { RULES, sigmaProvenance, MEASURED_SIGMA_SOURCE, TABLE_SIGMA_SOURCE, FALLBACK_SIGMA_SOURCE } from "./rules.js";
import { avMonthlyBody, AV_REFUSALS } from "./avFixture.js";

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
    vol: sigmaProvenance(null, SIGMA.CORN, "CORN"), pos: vertical("CORN", 20, 20, 22, 45, 0.28) },
  { name: "BOIL bull call spread 21/24, 50 DTE", dteLeft: 50, spot: 21.2, iv: 0.85,
    vol: sigmaProvenance(null, SIGMA.BOIL, "BOIL"), pos: vertical("BOIL", 21.2, 21, 24, 55, 0.85) },
  { name: "UNG long call 11, 35 DTE (NO CEILING)", dteLeft: 35, spot: 10.6, iv: 0.55,
    vol: sigmaProvenance(null, SIGMA.UNG, "UNG"),
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
  seeded(seed, () => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol, policy, 1500));

/* ---------- the policy is the caller's, and there is no default ---------- */

test("EXIT POLICY — exitSim REFUSES to run without one, rather than inventing it", () => {
  const f = FIXTURES[0];
  // A default is how the bare 7 comes back, silently, in a year.
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol), /exit policy/i);
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol, {}), /exit policy/i);
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol,
    { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct }), /exit policy/i);
  // ...and a null exit DTE is not "no exit rule", it is an unreadable one.
  assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol,
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
  const STILL = { sigma: 0, source: TABLE_SIGMA_SOURCE };
  const still = { ...f, vol: STILL };
  const at21 = exitSim(still.pos, still.spot, still.dteLeft, still.iv, STILL, POLICY, 20);
  const expected21 = (netBS(f.pos.legs, f.spot, RULES.exitDTE, f.iv) - f.pos.entryNet) * 100;
  const expected7 = (netBS(f.pos.legs, f.spot, 7, f.iv) - f.pos.entryNet) * 100;
  assert.ok(Math.abs(at21.ev - expected21) < 1e-9, `marked at ${RULES.exitDTE} DTE, got ${at21.ev}`);
  assert.ok(Math.abs(at21.ev - expected7) > 1, "and NOT at 7 — that is the fault, and the two differ");
  // The same call under the old policy lands on the other number, which is
  // what the autopilot has been reporting for four pull requests.
  const at7 = exitSim(still.pos, still.spot, still.dteLeft, still.iv, STILL, OLD_POLICY, 20);
  assert.ok(Math.abs(at7.ev - expected7) < 1e-9, `the old policy marked at 7 DTE, got ${at7.ev}`);
});

test("HORIZON — the window is what is left BEFORE the rule acts, and it is reported", () => {
  const f = FIXTURES[1];
  const s = run(f, POLICY);
  assert.equal(s.horizon, f.dteLeft - RULES.exitDTE, "50 DTE with a 21-DTE rule is 29 days of room");
  assert.equal(s.exitDTE, RULES.exitDTE, "and the result says which day it stopped at");
  // A position already inside the exit window still simulates one day rather
  // than zero — `Math.max(1, ...)` — and says so.
  const inside = exitSim(f.pos, f.spot, RULES.exitDTE - 5, f.iv, f.vol, POLICY, 50);
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

/* ============================================================================
   THE VOLATILITY IS A PROVENANCE, NOT A NUMBER (PR #27, PRD §4k).

   `exitSim`'s fifth argument used to be a bare sigma, and its two callers read
   it from two different places: the Guardian from the MEASURED realised
   volatility of the monthly series, the autopilot from the hand-written `SIGMA`
   row it was the only one able to reach. One position, two volatilities, and
   pTP, pSL, pTimePos, ev and medDays all move with the difference.
============================================================================ */

test("VOLATILITY — exitSim REFUSES a bare sigma, the way it refuses a bare policy", () => {
  const f = FIXTURES[0];
  // A number cannot say where it came from. That is the whole fault.
  for (const bare of [0.22, "0.22", null, undefined, {}, { sigma: 0.22 }, { source: "table" },
    { sigma: "0.22", source: "table" }, { sigma: 0.22, source: "" }, { sigma: NaN, source: "table" }]) {
    assert.throws(() => exitSim(f.pos, f.spot, f.dteLeft, f.iv, bare, POLICY, 5),
      /sigmaProvenance/, `${JSON.stringify(bare)} is not a provenance`);
  }
  // ...and a real one runs.
  assert.ok(exitSim(f.pos, f.spot, f.dteLeft, f.iv, f.vol, POLICY, 5).ev !== undefined);
});

test("VOLATILITY — the simulator REPORTS the volatility it walked on, and its source", () => {
  // The §4i rule applied one layer down: a field name must never assert a
  // reading the arithmetic did not use, so the brief reads `sim.sigma` rather
  // than writing the caller's `vol.sigma` out a second time.
  const f = FIXTURES[0];
  const measured = sigmaProvenance({ sigma: 0.41, years: 11, at: Date.now() }, SIGMA.CORN, "CORN");
  const s1 = run({ ...f, vol: measured }, POLICY);
  assert.equal(s1.sigma, 0.41, "the measured reading is what it walked on");
  assert.equal(s1.sigmaSource, MEASURED_SIGMA_SOURCE);
  const s2 = run(f, POLICY);
  assert.equal(s2.sigma, SIGMA.CORN);
  assert.equal(s2.sigmaSource, TABLE_SIGMA_SOURCE);
  // A market with no row at all falls to the named fallback and says so. This
  // is the counter-example that must still pass.
  const none = sigmaProvenance(null, undefined, "GLD");
  const s3 = run({ ...f, vol: none }, POLICY);
  assert.equal(s3.sigma, RULES.fallbackSigma);
  assert.equal(s3.sigmaSource, FALLBACK_SIGMA_SOURCE);
});

test("VOLATILITY — a measured sigma and the table one produce DIFFERENT figures", () => {
  // The magnitude is NOT a measurement of any market: it is a sensitivity, with
  // the table perturbed by a stated factor, which is all this sandbox can say.
  const f = FIXTURES[0];
  const table = run(f, POLICY);
  const doubled = run({ ...f, vol: sigmaProvenance({ sigma: SIGMA.CORN * 2, years: 11, at: Date.now() }, SIGMA.CORN, "CORN") }, POLICY);
  assert.notEqual(table.pTP, doubled.pTP, "the chance of taking profit first moves with it");
  assert.notEqual(table.pSL, doubled.pSL, "so does the chance of the stop");
  assert.notEqual(table.pTimePos, doubled.pTimePos, "and being positive at the exit rule");
  assert.notEqual(table.ev, doubled.ev, "and the average result following the rules");
});

test("VOLATILITY — engine.js still imports nothing, so the shape check is structural", () => {
  const code = codeOf("engine.js");
  assert.equal(/from\s+["']\.\/rules\.js["']/.test(code), false,
    "the engine may not read RULES to validate a volatility");
  // ...so the check is on the SHAPE: a finite sigma and a non-empty source.
  assert.ok(/typeof sigmaSource !== "string"/.test(code), "checked structurally, not against RULES");
});

/* ============================================================================
   THE MEASURED PATH'S PARSE, EXERCISED AT LAST (the debt PR #26 handed
   forward, verbatim: "no test exercised either function before the move and
   none exercises them on a real Alpha Vantage body now").

   THIS IS NOT A LIVE CALL and it does not pretend to be. No key, no egress:
   what is closed here is that the two functions `engine.js` now owns are held
   against a body in the shape Alpha Vantage actually returns, refusals
   included. Only the owner's own deploy can close the other half.
============================================================================ */

test("AV PARSE — a real-shaped body becomes a year-by-month matrix of RETURNS", () => {
  const body = avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: 7 });
  const { matrix, from } = parseAvJson(body);
  assert.ok(matrix.length > 0, "there are rows");
  // Every row is [year, ...twelve cells]; a cell is a percentage return or null.
  for (const row of matrix) {
    assert.equal(row.length, 13, `row ${row[0]} has a year and twelve months`);
    assert.ok(Number.isInteger(row[0]) && row[0] > 1900, "the first column is the calendar year");
    for (const c of row.slice(1)) {
      assert.ok(c === null || Number.isFinite(c), "a cell is a number or nothing, never a string");
    }
  }
  // The values ARE parsed out of strings: a body of strings that produced NaN
  // would still satisfy a shape test, so assert one cell arithmetically.
  const dates = Object.keys(body["Monthly Adjusted Time Series"]).sort();
  const iPrev = dates.length - 2, iLast = dates.length - 1;
  const px = (d) => parseFloat(body["Monthly Adjusted Time Series"][d]["5. adjusted close"]);
  const lastY = +dates[iLast].slice(0, 4), lastM = +dates[iLast].slice(5, 7) - 1;
  const row = matrix.find((r) => r[0] === lastY);
  assert.ok(Math.abs(row[lastM + 1] - ((px(dates[iLast]) / px(dates[iPrev]) - 1) * 100)) < 1e-9,
    "the cell is the percentage change on the previous adjusted close");
  assert.ok(from >= dates[0], "and it reports the first date inside the window");
});

test("AV PARSE — the TEN-YEAR cutoff is applied, and it lands mid-year", () => {
  // The cutoff is ten years back from TODAY, so it falls inside a calendar
  // year: the matrix carries ELEVEN calendar rows of which the first and the
  // last are partial. That is why `years` is the ROW COUNT and not "10".
  const body = avMonthlyBody({ months: 240, endYear: 2026, endMonth: 8, seed: 3 });
  const { matrix } = parseAvJson(body);
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 10);
  const oldest = Math.min(...matrix.map((r) => r[0]));
  assert.ok(oldest >= cutoff.getFullYear(), "twenty years of body, ten years of matrix");
  assert.ok(matrix.length <= 11, `eleven calendar rows at most, got ${matrix.length}`);
  assert.ok(matrix.length >= 10, "and not fewer, on a series that covers the whole window");
});

test("AV PARSE — the first and last rows are PARTIAL, and that is not an error", () => {
  const body = avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: 11 });
  const { matrix } = parseAvJson(body);
  const rows = [...matrix].sort((a, b) => a[0] - b[0]);
  const filled = (r) => r.slice(1).filter((c) => c != null).length;
  const first = rows[0], last = rows[rows.length - 1];
  assert.ok(filled(first) < 12, `the oldest calendar row is partial (${filled(first)} months)`);
  assert.ok(filled(last) < 12, `and so is the newest (${filled(last)} months)`);
  // The empty cells are `null`, never 0: a month with no reading is not a month
  // the price did not move, which is the same rule the whole app runs on.
  assert.ok(first.slice(1).some((c) => c === null), "the gap is null");
  assert.equal(first.slice(1).some((c) => c === 0), false, "never a zero standing in for it");
});

test("AV PARSE — `years` is the ROW COUNT, and it is the only figure any screen prints", () => {
  // The header said "10y history" beside a panel saying "11y" about the same
  // numbers. There is one number and this is it.
  const body = avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: 5 });
  const { matrix } = parseAvJson(body);
  const st = statsFromMatrix(matrix);
  assert.equal(st.years, matrix.length, "the row count, not a decade and not a month span");
  // A shorter body gives fewer rows, which is the property that makes it a
  // count rather than a constant.
  const shortM = parseAvJson(avMonthlyBody({ months: 30, endYear: 2026, endMonth: 8, seed: 5 })).matrix;
  assert.equal(statsFromMatrix(shortM).years, shortM.length);
  assert.ok(shortM.length < matrix.length, "and it moves with the series");
});

test("AV PARSE — a REFUSAL served with HTTP 200 throws rather than becoming a table", () => {
  // Alpha Vantage answers a quota refusal, a bad key and an unknown symbol with
  // a normal 200 whose body is a note. A parse that read the status would build
  // a seasonal table out of an apology.
  for (const [kind, body] of Object.entries(AV_REFUSALS)) {
    assert.throws(() => parseAvJson(body), Error, `${kind} must throw`);
    let msg = "";
    try { parseAvJson(body); } catch (e) { msg = e.message; }
    assert.equal(msg, body[kind], `and the message is Alpha Vantage's own words, not ours (${kind})`);
  }
  // An empty body, a null and a body with the wrong key are the same case.
  for (const junk of [null, undefined, {}, { "Weekly Time Series": {} }, "not json"]) {
    assert.throws(() => parseAvJson(junk), Error, `${JSON.stringify(junk)} is not a series`);
  }
});

test("AV STATS — twelve means in PERCENT, an annualised sigma, and no month invented", () => {
  const body = avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: 13, drift: 0.01, vol: 0.05 });
  const { matrix } = parseAvJson(body);
  const st = statsFromMatrix(matrix);
  assert.equal(st.monthlyMean.length, 12);
  st.monthlyMean.forEach((m, i) => assert.ok(Number.isFinite(m), `month ${i} is a number`));
  // The units are the ones `SEASONAL` is in and `seasonalDrift()` expects.
  // A 1% monthly log drift is about +1%/month in these units, not 0.01.
  const avg = st.monthlyMean.reduce((a, b) => a + b, 0) / 12;
  assert.ok(avg > 0.3 && avg < 3, `means are percentages, got an average of ${avg}`);
  // The sigma is sqrt(var * 12) of the same monthly returns: a 5% monthly
  // standard deviation annualises to about 17%.
  assert.ok(st.sigma > 0.1 && st.sigma < 0.3, `annualised, got ${st.sigma}`);
  // Assert it arithmetically rather than by feel, off the matrix itself.
  const all = matrix.flatMap((r) => r.slice(1)).filter((x) => x != null).map((x) => x / 100);
  const mu = all.reduce((a, b) => a + b, 0) / all.length;
  const varr = all.reduce((a, b) => a + (b - mu) ** 2, 0) / (all.length - 1);
  assert.ok(Math.abs(st.sigma - Math.sqrt(varr * 12)) < 1e-12, "sqrt(var * 12), exactly");
});

test("AV STATS — an EMPTY matrix is not twelve zeros and not a share that never moves", () => {
  // `statsFromMatrix([])` returns twelve zeros, a sigma of zero and `years` 0.
  // Those are the values that would be a drift of zero and a motionless price:
  // confident claims standing in for an empty body. The guard is `years > 0`,
  // and it is the CALLER's — `measuredSeasonal()` in autopilot.mjs and the
  // `seasonalProvenance()` / `sigmaProvenance()` pair — so the property held
  // here is that the empty case is RECOGNISABLE.
  const st = statsFromMatrix([]);
  assert.equal(st.years, 0, "and zero rows is what says so");
  assert.deepEqual(st.monthlyMean, Array(12).fill(0));
  assert.equal(st.sigma, 0);
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
