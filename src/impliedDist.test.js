// ============================================================================
// src/impliedDist.test.js — THE MARKET'S CHANCE, READ OFF THE OPTION PRICES (PR 67, task 67.1; owner 12 Oct 2026: "the
// market probability must be the same as IBKR's"). IBKR's production code is not public: equality is the METHOD, tested
// here, and IBKR's own screen, which the owner checks (PRD §4).
//
// (a) IBKR's worked example (510 call 6.45, 515 call 4.40, P(below 510) = 0.56 → 0.06 for 510–515 and 0.38 above 515),
//     on a full board priced exactly by the fair-pricing rule; (b) a board priced by Black-Scholes at one flat IV gives
//     the lognormal's own chance (`terminalExact()` at zero drift) within 1 point; (c) a put skew lowers a far
//     out-of-the-money credit put spread's chance against the flat-IV one (and the market's equals the prices' own
//     answer); (d) the same board gives the same numbers, and a 1-cent move in the price moves nothing.
//
// THE SMOOTHING, MEASURED (PR 67). With each segment's mass at its midpoint, the prices pin down only the sums of two
// neighbouring segments; with quotes rounded to the cent the bare fit zig-zags, and a cent moves mass to every other
// segment. A penalty on the second difference (× the median strike width) removes that. Measured on the boards below with
// the solver as shipped (`simplexLS()`, Σ = 1 held exactly; worst over five structures, points):
//
//     penalty   flat board, vs lognormal   flat, 1-cent move   cent-rounded quotes: vs lognormal, 1-cent move   IBKR, 510–515
//       0              0.11                    0.01                       0.47              0.25                0.0600
//       0.01           0.11                    0.00                       0.10              0.05                0.0688
//       0.05           0.11                    0.00                       0.06              0.03                0.0882
//       0.2            0.11                    0.00                       0.05 (0.1)        0.00 (0.1)          0.1052
//
// 0.01 is the smallest that tames the cent-rounded board; on IBKR's sparse toy board it moves 0.9 points of mass into
// 510–515, and the pure method (penalty 0) recovers IBKR's numbers exactly — test (a).
// ============================================================================
import assert from "node:assert/strict";
import { impliedDistribution, marketChance, marketBelow, quoteMid, simplexLS } from "./impliedDist.js";
import { terminalExact, N } from "./engine.js";
import { marketDistOf, marketChanceOf, MARKET_CHANCE_NOT_READ, chanceGapOf, chanceGapLine, chanceLines, chancesBrief, RULES,
  chanceOf, seasonalProvenance } from "./rules.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} is not within ${tol} of ${b}`); };
console.log("\nTHE MARKET'S CHANCE — the distribution the option prices imply\n");

/* ---------------------------------------------------------------- (a) IBKR's worked example */
// A board on which IBKR's example holds exactly: the masses below are chosen so that P(below 510) = 0.56, P(510–515) =
// 0.06 and P(above 515) = 0.38 with a mean excess above 515 of 11.58 — so the 510 call is 6.45 and the 515 call 4.40, as
// on IBKR's page — and every out-of-the-money option is priced by the fair-pricing rule on the module's own segments
// (the lowest at ⅔ of 490, the highest 20% above 540). The two upper masses e and f solve the two conditions.
const STRIKES = [490, 495, 500, 505, 510, 515, 520, 525, 530, 535, 540];
const F_TAIL = (4.40 - (0.25 + 0.75 + 1.0 + 1.05) - 22.5 * 0.04) / (133 - 22.5);
const MASSES = [0.06, 0.08, 0.10, 0.14, 0.18, 0.06, 0.10, 0.10, 0.08, 0.06, 0.04 - F_TAIL, F_TAIL];
const AT = [490 * 2 / 3, ...STRIKES.slice(1).map((k, i) => (STRIKES[i] + k) / 2), 540 * 1.2];
const fair = (type, K) => AT.reduce((s, x, i) => s + MASSES[i] * (type === "call" ? Math.max(x - K, 0) : Math.max(K - x, 0)), 0);
const IBKR_BOARD = { calls: {}, puts: {} };
for (const K of STRIKES) {
  IBKR_BOARD.calls[K] = { bid: fair("call", K) - 0.005, ask: fair("call", K) + 0.005 };
  IBKR_BOARD.puts[K] = { bid: Math.max(fair("put", K) - 0.005, 0.001), ask: fair("put", K) + 0.005 };
}

test("(a) IBKR'S EXAMPLE: the board carries IBKR's two prices, 510 call 6.45 and 515 call 4.40", () => {
  near(MASSES.reduce((a, b) => a + b, 0), 1, 1e-12, "the masses add up to 1");
  near(fair("call", 510), 6.45, 1e-9, "510 call");
  near(fair("call", 515), 4.40, 1e-9, "515 call");
});

test("(a) …AND THE METHOD READS BACK 0.56 BELOW 510, 0.06 FOR 510–515 AND 0.38 ABOVE 515", () => {
  const d = impliedDistribution(IBKR_BOARD, 510, { smooth: 0, minQuotes: 4 });
  assert.equal(d.ok, true);
  const below510 = marketBelow(d, 510), below515 = marketBelow(d, 515);
  near(below510, 0.56, 1e-6, "P(below 510)");
  near(below515 - below510, 0.06, 1e-6, "P(510–515)");
  near(1 - below515, 0.38, 1e-6, "P(above 515)");
  // Every option is priced back to the cent: the fit's root-mean-square error is nothing.
  assert.ok(d.rms < 1e-6, `rms ${d.rms}`);
  // The segments are IBKR's: below the lowest strike one segment with its mass at ⅔ of it; above the highest, 20% above.
  near(d.segments[0].at, 490 * 2 / 3, 1e-9, "the lowest segment's point");
  near(d.segments[d.segments.length - 1].at, 540 * 1.2, 1e-9, "the highest segment's point");
});

test("(a) THE SMOOTHING'S COST ON IBKR'S SPARSE TOY BOARD IS UNDER ONE POINT (the table above)", () => {
  const d = impliedDistribution(IBKR_BOARD, 510, { minQuotes: 4 });
  const mid = marketBelow(d, 515) - marketBelow(d, 510);
  near(mid, 0.06, 0.01, "P(510–515) with the default penalty");
});

/* ---------------------------------------------------------------- (b) flat IV */
// THE BOARD'S OWN PRICING: Black-Scholes with NO interest (IBKR's method ignores it, so a board priced with a rate would
// test the rate, not the method) at 30% for every strike, 60 to 140 every 2.50, 45 days, ±1% around the price.
const bs0 = (S, K, T, v, type) => {
  const d1 = (Math.log(S / K) + 0.5 * v * v * T) / (v * Math.sqrt(T)), d2 = d1 - v * Math.sqrt(T);
  return type === "call" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1);
};
const S = 100, DTE = 45, T = DTE / 365, V = 0.30;
const KS = []; for (let K = 60; K <= 140; K += 2.5) KS.push(K);
const boardOf = (ivOf, { spot = S, cents = false } = {}) => {
  const b = { calls: {}, puts: {} };
  const q = (x) => (cents ? { bid: Math.max(0.01, Math.floor(x * 98) / 100), ask: Math.max(0.01, Math.ceil(x * 102) / 100) }
    : { bid: x * 0.99, ask: x * 1.01 });
  for (const K of KS) { b.calls[K] = q(bs0(spot, K, T, ivOf(K), "call")); b.puts[K] = q(bs0(spot, K, T, ivOf(K), "put")); }
  return b;
};
const FLAT = boardOf(() => V);
const leg = (side, type, strike) => ({ side, qty: 1, type, strike });
const STRUCTS = [
  ["a bull call spread 100/105", [leg(1, "call", 100), leg(-1, "call", 105)]],
  ["a bear put spread 100/95", [leg(1, "put", 100), leg(-1, "put", 95)]],
  ["a credit put spread 90/85", [leg(-1, "put", 90), leg(1, "put", 85)]],
  ["an iron condor 85/90/110/115", [leg(-1, "put", 90), leg(1, "put", 85), leg(-1, "call", 110), leg(1, "call", 115)]],
  ["a long call 105", [leg(1, "call", 105)]],
];
const midNet = (b, legs) => legs.reduce((a, l) => a + Math.sign(l.side) * quoteMid((l.type === "call" ? b.calls : b.puts)[l.strike]), 0);

test("(b) ONE FLAT IV: the market's chance is the lognormal's own (terminalExact at zero drift), within 1 point", () => {
  const d = impliedDistribution(FLAT, S, { minQuotes: 4 });
  for (const [name, legs] of STRUCTS) {
    const net = midNet(FLAT, legs);
    const m = marketChance(d, legs, net);
    const t = terminalExact(legs, net, S, { driftAnnual: 0, sigma: V, dte: DTE }).pop;
    near(m, t, 0.01, name);
  }
  // …and with quotes rounded to the cent and 4% wide, still within 1 point.
  const R = boardOf(() => V, { cents: true }), dr = impliedDistribution(R, S, { minQuotes: 4 });
  for (const [name, legs] of STRUCTS) {
    const net = midNet(R, legs);
    near(marketChance(dr, legs, net), terminalExact(legs, net, S, { driftAnnual: 0, sigma: V, dte: DTE }).pop, 0.01, `${name}, cents`);
  }
});

/* ---------------------------------------------------------------- (c) a put skew */
// The puts below the price carry more volatility than the calls above it (+0.6 per 100% below, +0.1 per 100% above).
const skewIV = (K) => V + (K < S ? 0.6 * (S - K) / S : 0.1 * (S - K) / S);
const SKEW = boardOf(skewIV);
/** P(S_T above x) the prices themselves imply: 1 − dPut/dK at x, by a central difference on the skewed board's pricing. */
const truthAbove = (x) => 1 - (bs0(S, x + 0.01, T, skewIV(x + 0.01), "put") - bs0(S, x - 0.01, T, skewIV(x - 0.01), "put")) / 0.02;

test("(c) A PUT SKEW: a far out-of-the-money credit put spread's market chance is LOWER than the flat-IV chance", () => {
  const d = impliedDistribution(SKEW, S, { minQuotes: 4 });
  const legs = [leg(-1, "put", 85), leg(1, "put", 80)];
  const net = midNet(SKEW, legs);
  const m = marketChance(d, legs, net);
  const flat = terminalExact(legs, net, S, { driftAnnual: 0, sigma: V, dte: DTE }).pop;
  assert.ok(m < flat - 0.02, `market ${m} against flat ${flat}`);          // measured: 91.0% against 93.7%
  // …and it is what the prices themselves say: P(above the breakeven) = 1 − dPut/dK there.
  near(m, truthAbove(85 + net), 0.01, "the market's chance against the prices' own");
});

test("(c) …NEAR THE MONEY THE SAME SKEW RAISES IT (changed from the plan: the prompt's 'lower' holds far out of the money)", () => {
  // The skew puts more weight on big falls AND, to keep the forward, more on small rises: a credit put spread whose
  // breakeven is near the price wins more often. Measured 75.0% against 70.6% flat; the prices' own answer is 75.2%.
  const d = impliedDistribution(SKEW, S, { minQuotes: 4 });
  const legs = [leg(-1, "put", 95), leg(1, "put", 90)];
  const net = midNet(SKEW, legs);
  const m = marketChance(d, legs, net);
  const flat = terminalExact(legs, net, S, { driftAnnual: 0, sigma: V, dte: DTE }).pop;
  assert.ok(m > flat, `market ${m} against flat ${flat}`);
  near(m, truthAbove(95 + net), 0.01, "the market's chance against the prices' own");
});

/* ---------------------------------------------------------------- (d) determinism and a cent */
test("(d) THE SAME BOARD GIVES THE SAME NUMBERS, EVERY TIME", () => {
  const a = impliedDistribution(SKEW, S, { minQuotes: 4 }), b = impliedDistribution(SKEW, S, { minQuotes: 4 });
  assert.deepEqual(a, b);
  for (const [, legs] of STRUCTS) assert.equal(marketChance(a, legs, midNet(SKEW, legs)), marketChance(b, legs, midNet(SKEW, legs)));
});

test("(d) A 1-CENT MOVE IN THE PRICE MOVES NO CHANCE BY A TENTH OF A POINT (the 100 call leaves the board at 100.01)", () => {
  for (const cents of [false, true]) {
    const b = boardOf(() => V, { cents });
    const d0 = impliedDistribution(b, 100, { minQuotes: 4 }), d1 = impliedDistribution(b, 100.01, { minQuotes: 4 });
    // The out-of-the-money set changes: the 100 call is in at 100 and out at 100.01.
    assert.ok(d0.used.some((u) => u.type === "call" && u.strike === 100));
    assert.ok(!d1.used.some((u) => u.type === "call" && u.strike === 100));
    for (const [name, legs] of STRUCTS) {
      const net = midNet(b, legs);
      near(marketChance(d1, legs, net), marketChance(d0, legs, net), 0.001, `${name}${cents ? ", cents" : ""}`);
    }
  }
});

/* ---------------------------------------------------------------- what is never a price */
test("A QUOTE WITHOUT A BID OR AN ASK, OR WITH THE ASK UNDER THE BID, IS NOT A PRICE (unknown is never zero)", () => {
  assert.equal(quoteMid({ bid: 1, ask: 1.2 }), 1.1);
  for (const q of [null, { bid: 0, ask: 1 }, { bid: null, ask: 1 }, { bid: 1, ask: null }, { bid: 1.2, ask: 1 }, { bid: "x", ask: 1 }])
    assert.equal(quoteMid(q), null, JSON.stringify(q));
  // A board whose strikes have no prices reads as too few quotes, never as a distribution.
  const empty = { calls: { 100: { bid: 0, ask: 0 }, 105: { bid: null, ask: 1 } }, puts: { 95: { bid: 0, ask: 0.1 } } };
  assert.equal(impliedDistribution(empty, 100).reason, "few");
});

test("A BOARD TOO BROKEN TO READ GIVES NO NUMBER, AND SAYS WHY", () => {
  assert.deepEqual([impliedDistribution(FLAT, null).reason, impliedDistribution(FLAT, 0).reason], ["noSpot", "noSpot"]);
  assert.equal(impliedDistribution(FLAT, S, { stale: true }).reason, "stale");
  const two = { calls: { 105: { bid: 1, ask: 1.1 } }, puts: { 95: { bid: 1, ask: 1.1 } } };
  assert.equal(impliedDistribution(two, S, { minQuotes: 4 }).reason, "few");
  // rules.js reads it through one function each, with the RULES floor; every reason has its words.
  assert.equal(marketDistOf(two, S).reason, "few");
  assert.equal(RULES.impliedMinQuotes, 4);
  for (const why of ["stale", "few", "noSpot", "noBoard", "noPrice"]) assert.ok(MARKET_CHANCE_NOT_READ[why], why);
  assert.deepEqual(marketChanceOf({ dist: null, legs: STRUCTS[0][1], entryNet: 1 }), { pop: null, ok: false, reason: "noBoard" });
  assert.deepEqual(marketChanceOf({ dist: marketDistOf(FLAT, S, { stale: true }), legs: STRUCTS[0][1], entryNet: 1 }),
    { pop: null, ok: false, reason: "stale" });
  assert.equal(marketChanceOf({ dist: marketDistOf(FLAT, S), legs: STRUCTS[0][1], entryNet: null }).reason, "noPrice");
  assert.equal(marketChance(marketDistOf(FLAT, S), [], 1), null);
});

test("THE SOLVER: least squares on the simplex — no negative mass, the sum exactly 1, an exact system solved exactly", () => {
  // A = I: the nearest point of the simplex. (0.7, 0.5) → (0.6, 0.4); (1.5, −0.2, 0.1) → (1, 0, 0).
  const a = simplexLS([[1, 0], [0, 1]], [0.7, 0.5]);
  near(a[0], 0.6, 1e-12, "a0"); near(a[1], 0.4, 1e-12, "a1");
  const c = simplexLS([[1, 0, 0], [0, 1, 0], [0, 0, 1]], [1.5, -0.2, 0.1]);
  assert.deepEqual(c.map((v) => +v.toFixed(12)), [1, 0, 0]);
  // Two equations and the sum pin three unknowns: (0.2, 0.5, 0.3) comes back.
  const x = simplexLS([[1, 2, 0], [0, 1, 3]], [1.2, 1.4]);
  near(x[0], 0.2, 1e-9, "x0"); near(x[1], 0.5, 1e-9, "x1"); near(x[2], 0.3, 1e-9, "x2");
  assert.equal(simplexLS([], []), null);
  // ITS SPEED (PR 67): the QR version it replaced took 26 ms for 60 strikes and 63 ms for 100. Printed, not asserted (a
  // machine's speed is not a property of the code); the owner's phone is an OWNER CHECK with Find's speed (PRD §4 #5).
  const big = (n) => { const b = { calls: {}, puts: {} };
    for (let i = 0; i < n; i++) { const K = +(60 + (i * 80) / (n - 1)).toFixed(2), iv = skewIV(K);
      b.calls[K] = { bid: bs0(S, K, T, iv, "call") * 0.98, ask: bs0(S, K, T, iv, "call") * 1.02 + 0.01 };
      b.puts[K] = { bid: bs0(S, K, T, iv, "put") * 0.98, ask: bs0(S, K, T, iv, "put") * 1.02 + 0.01 }; }
    return b; };
  for (const n of [60, 100, 150]) {
    const b = big(n); impliedDistribution(b, S);
    const t0 = performance.now(); for (let r = 0; r < 3; r++) impliedDistribution(b, S);
    console.log(`       ${n} strikes: ${((performance.now() - t0) / 3).toFixed(1)} ms a fit`);
  }
});

/* ---------------------------------------------------------------- why the two chances differ (rules.js) */
test("WHY THEY DIFFER: nothing under 5 points; the season and the skew, in words; 'under' when the market's is lower", () => {
  const legs = [leg(-1, "put", 85), leg(1, "put", 80)];
  const net = midNet(SKEW, legs);
  const dist = marketDistOf(SKEW, S);
  const mkt = marketChanceOf({ dist, legs, entryNet: net });
  // The OSL model with no season read: one volatility, zero drift — 93.7% against the market's 91.0%, under the owner's
  // 5 points, so nothing is said.
  const mc = chanceOf({ legs, entryNet: net, spot: S, iv: V, dte: DTE, seasonal: seasonalProvenance(null, "TEST") });
  assert.ok(mc && mc.pop != null);
  assert.equal(chanceGapOf({ mc, mkt, dist, legs, entryNet: net, spot: S }), null);
  assert.equal(chanceGapLine(null), null);
  // A model 9 points over the market: the line names the gap, the shape, and is the lower-market (amber) kind.
  const far = chanceGapOf({ mc: { ...mc, pop: mkt.pop + 0.09 }, mkt, dist, legs, entryNet: net, spot: S });
  assert.equal(far.lower, true);
  const line = chanceGapLine(far);
  assert.match(line, /^Market 9 points under the model/);
  assert.match(line, /bigger falls/);
  assert.match(line, /\(skew\)/);
  // A strong upward season (+30% a year): the model's chance with its drift against the same model at zero drift.
  const up = terminalExact(legs, net, S, { driftAnnual: 0.3, sigma: V, dte: DTE });
  const gs = chanceGapOf({ mc: up, mkt, dist, legs, entryNet: net, spot: S });
  assert.ok(gs && gs.season > 0.01, JSON.stringify(gs));
  assert.match(chanceGapLine(gs), /the season adds \+\d+/);
  // The threshold is the RULES value, read, not copied.
  assert.equal(RULES.chanceGapPoints, 0.05);
  const edge = chanceGapOf({ mc: { ...mc, pop: mkt.pop + RULES.chanceGapPoints }, mkt, dist, legs, entryNet: net, spot: S });
  assert.equal(edge, null);
});

test("THE TILE'S TWO LINES AND THE COPILOT'S BRIEF: Market first, then OSL model; not read is a dash, never 0%", () => {
  const lines = chanceLines(0.74, { pop: 0.71 });
  assert.deepEqual(lines.map((l) => [l.word, l.value]), [["Market", "71%"], ["OSL model", "74%"]]);
  assert.deepEqual(chanceLines(null, null).map((l) => l.value), ["—", "—"]);
  const b = chancesBrief({ pop: 0.74, mkt: { pop: null, ok: false, reason: "stale" } });
  assert.equal(b.market, null); assert.equal(b.oslModel, "74%");
  assert.equal(b.marketNotRead, MARKET_CHANCE_NOT_READ.stale);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
