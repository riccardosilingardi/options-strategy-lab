// ============================================================================
// scripts/measure-signals.mjs — "SIGNALS DECIDE" AGAINST THE RETIRED SUGGESTION, ON FIXTURES (PR #48, TASK 3).
//
//   node scripts/measure-signals.mjs
//
// 1. FAMILY. For every market × five fixture readings (signals.test.js's sets: hot/dry bullish, wet bearish, mixed,
//    quiet, nothing), the family the old rule built (season × 1.5 + score / 25 × confidence, ±0.5 / ±1.5, the season
//    counted twice) against the new one (score × confidence / 100 vs RULES.directionSignalMin, plus Neutral), and the
//    brief's own CORN reading of 2 Oct (+64 / conf 86, October measured +1.2%).
// 2. CARDS, on the two fixture boards (MODEL_BOARD and the UNG board): how many cards one family gave before and the
//    suggested family plus Neutral give after.
// 3. TIME: generating those cards (analyse, floors, the chance), before and after, on this machine — not a
//    phone (PRD §4.5).
// FIXTURES ONLY: no live board, no live reading.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { shortlistWithFloors, listCardFigures } from "./src/App.jsx";
import { fuseSignals, signalDirection, signalFamilies } from "./src/signals.js";
import { RULES, seasonalProvenance, seasonalSignal } from "./src/rules.js";
import { BASKET } from "./src/markets.js";
import { MODEL_BOARD, ungBoards } from "./scripts/crossing-fixtures.jsx";

const oldScore = (season, f) => (season ?? 0) * 1.5 + (f ? (f.score / 25) * (f.confidence / 100) : 0);
const oldFamily = (season, f) => { const x = oldScore(season, f);
  return x > 1.5 ? "verybull" : x > 0.5 ? "bull" : x < -1.5 ? "verybear" : x < -0.5 ? "bear" : "neutral"; };

const NOW = Date.UTC(2025, 6, 15);
const fc = (tmax, rain) => ({ tmax: Array(14).fill(tmax), tmin: Array(14).fill(tmax - 10), prec: Array(14).fill(rain / 14), dates: [] });
const bars = (k) => Array.from({ length: 80 }, (_, i) => { const c = k === "up" ? 100 * (1 + 0.004 * i) : k === "down" ? 140 * (1 - 0.004 * i) : 100 + (i % 2 ? 0.5 : -0.5); return { open: c, high: c + 1, low: c - 1, close: c }; });
const HOT = { cornbelt: fc(36, 10), brazil: fc(36, 0), blacksea: fc(35, 2), plains: fc(38, 5), "gas-south": fc(40, 5), "gas-ne": fc(34, 20) };
const WET = { cornbelt: fc(29, 130), brazil: fc(30, 20), blacksea: fc(27, 45), plains: fc(28, 120), "gas-south": fc(30, 90), "gas-ne": fc(24, 90) };
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const BULL = [{ title: "Black Sea grain corridor halted as Russia exits deal", date: ago(0) }, { title: "OPEC announces a production cut", date: ago(0) }, { title: "Fed signals a rate cut as real yields fall", date: ago(1) }];
const BEAR = [{ title: "Bumper harvest expected as beneficial rain improves yields", date: ago(0) }, { title: "Dollar index surges to a two-year high", date: ago(0) }];
const seasonAt = (x) => seasonalSignal({ monthlyMean: Array(12).fill(x), monthN: Array(12).fill(16), monthSE: Array(12).fill(0.4) }, 6, 30);
const SETS = [
  ["bullish", { weatherData: HOT, newsItems: BULL, bars: bars("up") }, 1.3],
  ["bearish", { weatherData: WET, newsItems: BEAR, bars: bars("down") }, -1.1],
  ["mixed", { weatherData: HOT, newsItems: BEAR, bars: bars("up") }, -1],
  ["quiet", { weatherData: WET, newsItems: [], bars: bars("flat") }, 0.3],
  ["nothing", { weatherData: null, newsItems: [], bars: null }, 0],
];
let changed = 0, total = 0;
const rows = [];
for (const tk of BASKET) for (const [name, set, mean] of SETS) {
  const f = fuseSignals({ ticker: tk, month: 6, now: NOW, ...set, season: seasonAt(mean) });
  const before = oldFamily(mean, f);
  const after = signalFamilies(signalDirection(f));
  total++; if (!(after[0] === before && after.length === 1)) changed++;
  if (name === "bullish" || name === "mixed") rows.push(tk.padEnd(5) + " " + name.padEnd(8) + " score " + String(f.score).padStart(4) + " conf " + String(f.confidence).padStart(3) + "  before " + before.padEnd(9) + " after " + after.join(" + "));
}
console.log("\\n1. FAMILY — " + changed + " of " + total + " market × reading pairs change family (any pair now also shows Neutral counts as a change)");
for (const r of rows.slice(0, 8)) console.log("   " + r);
const corn = { score: 64, confidence: 86, agreement: "CONFLUENT" };
console.log("   CORN 2 Oct (brief): old " + oldScore(1.2, corn).toFixed(2) + " → " + oldFamily(1.2, corn) + " (season share " + Math.round(100 * 1.8 / oldScore(1.2, corn)) + "%); new s = " + signalDirection(corn).s.toFixed(2) + " → " + signalFamilies(signalDirection(corn)).join(" + "));
const xle = { score: 18, confidence: 52, agreement: "MIXED" };
console.log("   XLE (illustrative, score +18 conf 52, no season read): old " + oldFamily(null, xle) + "; new s = " + signalDirection(xle).s.toFixed(2) + " → " + signalFamilies(signalDirection(xle)).join(" + "));

const FLAT = seasonalProvenance(null, "fixture");
const gen = (b, fams) => { let n = 0; const seen = new Set();
  for (const fam of fams) { const r = shortlistWithFloors(fam, b.S, b.step, b.strikes, b.dte, b.iv, b.q, { peers: b.peers });
    for (const { p, a, aFill } of r.rows) { const k = p.legs.map((l) => l.side + l.type + l.strike).join(); if (seen.has(k)) continue; seen.add(k);
      listCardFigures(p.legs, { spot: b.S, dte: b.dte, iv: b.iv, q: b.q, ticker: b.ticker, expKey: b.id, seasonal: FLAT, a, aFill }); n++; } }
  return n; };
console.log("\\n2. CARDS on the fixture boards (one market each)");
const boards = [MODEL_BOARD, ...ungBoards()];
for (const dir of ["verybull", "bull", "neutral", "bear"]) {
  for (const b of boards) {
    const newF = dir === "verybull" ? ["bull", "neutral"] : signalFamilies({ dir: dir === "neutral" ? "neutral" : dir });
    console.log("   " + b.id.padEnd(16) + " old " + dir.padEnd(9) + gen(b, [dir]) + " cards → new " + newF.join(" + ").padEnd(15) + gen(b, newF) + " cards");
  }
}
const time = (fn) => { fn(); const t = performance.now(); for (let i = 0; i < 5; i++) fn(); return (performance.now() - t) / 5; };
const before = time(() => { for (const b of boards) for (const d of ["verybear", "bear", "neutral", "bull", "verybull"]) gen(b, [d]); });
const after = time(() => { for (const b of boards) for (const d of ["bear", "neutral", "bull"]) gen(b, signalFamilies({ dir: d })); });
console.log("\\n3. TIME — generating the fixture cards, this machine: the 31-card five-direction run " + before.toFixed(0) + " ms; " +
  "the same boards under Signals decide (each direction + Neutral) " + after.toFixed(0) + " ms. Per market Find now builds two families " +
  "where it built one, so a market's generation roughly doubles when its signals point somewhere.\\n");
`;

const dir = mkdtempSync(join(tmpdir(), "osl-measure-signals-"));
try {
  const out = join(dir, "entry.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs",
    outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status || 0;
} finally { rmSync(dir, { recursive: true, force: true }); }
