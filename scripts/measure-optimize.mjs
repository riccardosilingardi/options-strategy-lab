// ============================================================================
// scripts/measure-optimize.mjs — WHAT ONE OPTIMIZE RUN COSTS, AND WHAT A SECOND STEP OF WIDTH BUYS (PR 65, task 64.5).
//
//   node scripts/measure-optimize.mjs
//
// THE RULE WAS FIXED BEFORE MEASURING: Optimize searches two listed steps around the loaded strikes if one run stays under
// 50 ms on the fixture chains with the most expiries, else one step (OPTIMIZE_STEPS in src/alternatives.js). Two steps hold
// every candidate one step holds, so the first pick can only be as good or better; this prints what it costs and how often
// it changed the first pick.
//
// THE CODE IS THE APP'S: `optimizeCandidates()` (alternatives.js), `readAlternative()` (App.jsx — what Build's `priceAlt()`
// calls, Find's floors included), the real gate (`evaluateTrade()`, an empty paper book, $10,000 of trading capital) and
// `rankOptimize()` (rows.js). FIXTURES, NOT A LIVE CHAIN: UNG's captured Alpaca board (src/fixtures), copied onto 1, 2, 5 and
// 9 expiries a week apart from 31 days out (9 is a market listing weeklies, the 63.1 measurement's worst case); the season
// is flat and the past is find-fixtures.jsx's matrix. The loaded trades are every card Find builds on that board; a trade's
// time is the median of five warm runs, because a single run on this machine jumps by tens of ms when the garbage collector
// runs. The timings are this machine's, not a phone's (PRD §4).
//
// MEASURED 7 Oct 2026 (six repeats): with 9 expiries the slowest trade's run took 40–82 ms at two steps (over 50 ms in four
// of six) and 32–48 ms at one; the median trade 28–39 ms and 20–34 ms. Two steps changed the first pick on 1 of the 9 trades
// with 5 or 9 expiries, 2 of 9 with 1 or 2. By the rule: ONE step.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { readFileSync } from "node:fs";
import { readAlternative, shortlistWithFloors, makeQuote } from "./src/App.jsx";
import { normaliseAlpacaChain, expiryStrikes, expiryOpenInterest } from "./src/chain.js";
import { optimizeCandidates } from "./src/alternatives.js";
import { rankOptimize } from "./src/rows.js";
import { requestOf, seasonalProvenance, sizing } from "./src/rules.js";
import { evaluateTrade } from "./src/riskGate.js";
import { FIXTURE_MATRIX, DIRECTIONS } from "./scripts/find-fixtures.jsx";

const NOW = Date.parse("2026-10-07T14:00:00Z");
const RAW = JSON.parse(readFileSync("src/fixtures/alpaca-chain-UNG.json", "utf8"));
const one = normaliseAlpacaChain("UNG", RAW, { spot: 13.24, now: NOW });
const [k0] = Object.keys(one.byExp);
const DAY = 86400000;
const chainWith = (n) => {
  const byExp = {};
  for (let i = 0; i < n; i++) {
    const key = new Date(Date.parse("2026-11-07T00:00:00Z") + i * 7 * DAY).toISOString().slice(0, 10);
    byExp[key] = { ...one.byExp[k0], dte: 31 + 7 * i };
  }
  return { ...one, byExp };
};
const FLAT = seasonalProvenance(null, "fixture");
const capital = { tradingCapital: 10000 };
const request = requestOf({ amt: 500 }, sizing(capital));
const BOOK = { paperVerified: true, paperSource: "fixture" };
const gate = (proposal) => evaluateTrade({ proposal, portfolio: { positions: [], account: BOOK }, capital, signals: null });

// The loaded trades: every structure Find builds on the first board, in the five directions.
const c1 = chainWith(1), ek1 = Object.keys(c1.byExp)[0], b1 = c1.byExp[ek1];
const loaded = [];
for (const sent of DIRECTIONS) {
  const r = shortlistWithFloors(sent, c1.spot, 0.5, expiryStrikes(c1, ek1), b1.dte, 0.6, makeQuote(c1, ek1), { peers: expiryOpenInterest(c1, ek1) });
  for (const { p } of r.rows) if (!loaded.some((x) => JSON.stringify(x.legs) === JSON.stringify(p.legs))) loaded.push({ name: p.name, legs: p.legs });
}

const run = (chain, legs, steps) => {
  const expKey = Object.keys(chain.byExp)[0];
  const t0 = performance.now();
  const priced = optimizeCandidates({ legs, expKey, chain, spot: chain.spot, now: NOW, steps })
    .map((c) => readAlternative(c, { chain, ticker: "UNG", iv: 0.6, seasonal: FLAT, matrix: FIXTURE_MATRIX, request, gate, floors: true }))
    .filter(Boolean);
  const r = rankOptimize(priced, request, "ev");
  return { ms: performance.now() - t0, n: priced.length, top: r.rows[0] ? r.rows[0].expKey + " " + JSON.stringify(r.rows[0].legs.map((l) => l.strike)) : null };
};
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

console.log("\\n" + loaded.length + " loaded trades (every card Find builds on UNG's fixture board), three runs each, warm\\n");
console.log("  expiries   steps   candidates   median ms   max ms   first pick changed by the second step");
for (const nExp of [1, 2, 5, 9]) {
  const chain = chainWith(nExp);
  const res = { 1: [], 2: [] };
  for (const steps of [1, 2]) for (const t of loaded) { run(chain, t.legs, steps); }   // warm-up
  for (const steps of [1, 2]) for (const t of loaded) {
    const rs = [0, 1, 2, 3, 4].map(() => run(chain, t.legs, steps));
    res[steps].push({ ms: med(rs.map((x) => x.ms)), n: rs[0].n, top: rs[0].top });
  }
  const changed = res[1].filter((x, i) => x.top !== res[2][i].top).length;
  for (const steps of [1, 2]) {
    const xs = res[steps];
    console.log("  " + String(nExp).padEnd(10) + " " + String(steps).padEnd(7) + " " + String(Math.round(xs.reduce((a, x) => a + x.n, 0) / xs.length)).padEnd(12) + " " +
      med(xs.map((x) => x.ms)).toFixed(1).padEnd(11) + " " + Math.max(...xs.map((x) => x.ms)).toFixed(1).padEnd(18) + " " +
      (steps === 2 ? changed + " of " + xs.length : ""));
  }
}
console.log("\\nThe rule: two steps if one run stays under 50 ms with 9 expiries (the max ms above), else one.\\n");
`;

const dir = mkdtempSync(join(tmpdir(), "osl-measure-opt-"));
try {
  const out = join(dir, "m.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status;
} finally { rmSync(dir, { recursive: true, force: true }); }
