// ============================================================================
// scripts/measure-season.mjs — WHAT seasonalSignal() DOES ON THE FIXTURE SERIES (PR #48, TASK 2).
//
//   node scripts/measure-season.mjs
//
// THE SANDBOX CANNOT CALL ALPHA VANTAGE (no key, and the egress proxy refuses alphavantage.co), so every series here
// is avFixture-derived: a reproducible random walk per market at that market's own monthly volatility (SIGMA / √12,
// or the 0.25 fallback where nobody measured one), with NO season built in — so every month that "counts" here is a
// false positive of the rule — plus one CORN-shaped series with the owner's measured cells (June −3.46%, Sep +1.03%,
// Oct +1.2%) built in. Figures from it are a SENSITIVITY, never a reading of any ticker (PRD §4k).
//
// Prints, per market: how many of 12 months count; whether the season factor is zero for this month's 45-day window;
// and how far the 31 Find fixture cards' chances move between "every month's full mean" (before) and "the counted
// months only" (after), drifted on the board's own market where one exists.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { findCards } from "./scripts/find-fixtures.jsx";
import { RULES, seasonalProvenance, seasonalSignal, chanceOf } from "./src/rules.js";
import { parseAvJson, statsFromMatrix, seasonalDrift, SIGMA, terminalMC, seedFrom } from "./src/engine.js";
import { avMonthlyBody, CORN_SHAPED_MONTH_DRIFT } from "./src/avFixture.js";
import { BASKET, getU } from "./src/markets.js";

const MONTH = new Date().getMonth();
const series = {};
let seed = 100;
for (const tk of [...BASKET, "SPY"]) {
  const vol = (getU(tk).sigma || RULES.fallbackSigma) / Math.sqrt(12);
  series[tk] = statsFromMatrix(parseAvJson(avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: seed++, vol })).matrix);
}
series["CORN (shaped)"] = statsFromMatrix(parseAvJson(avMonthlyBody({ months: 132, endYear: 2026, endMonth: 8, seed: 48,
  vol: SIGMA.CORN / Math.sqrt(12), monthDrift: CORN_SHAPED_MONTH_DRIFT })).matrix);

console.log("\\nMONTHS THAT COUNT (|mean| >= " + RULES.seasonalSignalT + " x its standard error), avFixture series, ~10 years each");
let zero = 0, n = 0;
for (const [tk, st] of Object.entries(series)) {
  const prov = seasonalProvenance({ ...st }, tk);
  const counted = Array.from({ length: 12 }, (_, m) => seasonalSignal(prov, m, 30)).filter((s) => s.counts).map((s) => s.months[0].label);
  const now = seasonalSignal(prov, MONTH, 45);
  if (!tk.includes("shaped")) { n++; if (now.mean === 0) zero++; }
  console.log("  " + tk.padEnd(15) + String(counted.length).padStart(2) + " of 12" + (counted.length ? " (" + counted.join(", ") + ")" : "") +
    "   · this month, 45 days: " + (now.mean === 0 ? "factor 0" : now.mean.toFixed(2) + "%/mo"));
}
console.log("  → the season factor is zero for " + zero + " of " + n + " markets this month (45-day window)");

const cards = findCards();
let moved = [], maxMove = 0;
for (const c of cards) {
  const st = series[c.tk] || series.SPY;
  const prov = seasonalProvenance({ ...st }, c.tk);
  const a = c.lf.aFill;
  const iv = c.lf.mc ? c.lf.mc.sigma : 0.3;
  const after = chanceOf({ legs: c.legs, entryNet: a.entry, spot: c.spot, iv, dte: c.dte, seasonal: prov, month: MONTH, ticker: c.tk, expKey: c.expKey });
  const driftBefore = seasonalDrift(st.monthlyMean, MONTH, c.dte);
  const before = terminalMC(c.legs, a.entry, c.spot, { driftAnnual: driftBefore, sigma: after.sigma, dte: c.dte, runs: RULES.mcRuns, seed: seedFrom(after.seedKey) });
  const d = (after.pop - before.pop) * 100;
  moved.push(Math.abs(d)); maxMove = Math.max(maxMove, Math.abs(d));
}
moved.sort((x, y) => x - y);
const med = moved[Math.floor(moved.length / 2)];
console.log("\\nFIND FIXTURE CARDS (" + cards.length + "): chance with every month's full mean (before) vs counted months only (after)");
console.log("  median move " + med.toFixed(1) + " points, largest " + maxMove.toFixed(1) + " points; " + moved.filter((x) => x < 0.05).length + " cards unchanged");
console.log("  (the fixture cards themselves are drifted on a season NOT READ: zero drift before and after, so on fixtures the list does not move)\\n");
`;

const dir = mkdtempSync(join(tmpdir(), "osl-measure-season-"));
try {
  const out = join(dir, "entry.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs",
    outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status || 0;
} finally { rmSync(dir, { recursive: true, force: true }); }
