// ============================================================================
// scripts/measure-crossing.mjs — WHAT CROSSING COSTS AGAINST WHAT A TRADE CAN
// MAKE, ON EVERY FIXTURE CANDIDATE (ROADMAP PR #39).
//
// For every candidate that reached the quality floors it prints the crossing
// cost (`comboBook().spread × 100`, one combination), the maximum profit at the
// price that fills, and their ratio — then how many candidates a share of
// 0.25, 0.5 and 0.75 would remove. Below that, the 0a audit: which figures the
// corrected opening limit moved, and by how much.
//
// FIXTURES, NOT A LIVE CHAIN. `RULES.maxCrossingShareOfMaxProfit` is chosen,
// not measured, until this is run against a real board.
//
//   node scripts/measure-crossing.mjs
//
// App.jsx is JSX, so the fixture module is bundled with esbuild (already a
// vite dependency) and run in node — the same way `scripts/test-jsx.mjs` runs
// the JSX tests.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { fixtureCandidates, measured, removedAt } from "./scripts/crossing-fixtures.jsx";
import { RULES } from "./src/rules.js";

const f$ = (x) => (x == null || !Number.isFinite(x) ? "—" : "$" + x.toFixed(2));
const f2 = (x) => (x == null || !Number.isFinite(x) ? "—" : x.toFixed(2));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
const lpad = (s, n) => String(s).padStart(n);

const all = fixtureCandidates();
const m = measured(all);

console.log("\\nCROSSING COST AGAINST MAXIMUM PROFIT AT THE PRICE THAT FILLS — one combination");
console.log("share floor in force: " + RULES.maxCrossingShareOfMaxProfit + "\\n");
console.log(pad("fixture", 32) + pad("structure", 30) + lpad("crossing", 10) + lpad("max profit", 12) + lpad("ratio", 9) + "  verdict");
for (const c of m) {
  const r = c.qf.crossing;
  const ratio = r.maxProfit > 0 ? r.cost / r.maxProfit : null;
  const verdict = c.shown ? "shown" : c.why === "crossing" ? "REMOVED (crossing)" : "removed (" + c.why + ")";
  console.log(pad(c.fixture, 32) + pad(c.name, 30) + lpad(f$(r.cost), 10) + lpad(f$(r.maxProfit), 12) + lpad(ratio == null ? "n/a" : ratio.toFixed(3), 9) + "  " + verdict);
}
const skipped = all.filter((c) => c.qf && !c.qf.crossing.checked);
console.log("\\n" + m.length + " measured; " + skipped.length + " reached the floors but could not be measured (" +
  [...new Set(skipped.map((c) => c.qf.crossing.skipped))].join(", ") + ")");

console.log("\\nREMOVED AT EACH SHARE");
console.log(pad("share", 8) + lpad("of all measured", 18) + lpad("of those clearing every other floor", 38));
for (const s of [0.25, 0.5, 0.75]) {
  const r = removedAt(all, s);
  console.log(pad(s, 8) + lpad(r.removed + " / " + r.measured, 18) + lpad(r.removedAlone + " / " + r.clearedOthers, 38));
}

console.log("\\n0a AUDIT — THE OPENING LIMIT, BEFORE AND AFTER, on every candidate with a two-sided book");
console.log(pad("fixture", 32) + pad("structure", 30) + pad("kind", 7) + lpad("net old", 9) + lpad("net new", 9) +
  lpad("maxP old", 10) + lpad("maxP new", 10) + lpad("maxL old", 10) + lpad("maxL new", 10) + lpad("R/R old", 8) + lpad("R/R new", 8) +
  lpad("pop old", 8) + lpad("pop new", 8) + lpad("x$500 old", 10) + lpad("new", 5));
const booked = all.filter((c) => c.book && c.book.ok);
for (const c of booked) {
  console.log(pad(c.fixture, 32) + pad(c.name, 30) + pad(c.credit ? "credit" : "debit", 7) + lpad(f2(c.oldNet), 9) + lpad(f2(c.newNet), 9) +
    lpad(f$(c.maxProfitOld), 10) + lpad(f$(c.maxProfitNew), 10) + lpad(f$(c.maxLossOld), 10) + lpad(f$(c.maxLossNew), 10) +
    lpad(f2(c.rrOld), 8) + lpad(f2(c.rrNew), 8) + lpad(pct(c.popOld), 8) + lpad(pct(c.popNew), 8) + lpad(c.sizeOld, 10) + lpad(c.sizeNew, 5));
}
const credits = booked.filter((c) => c.credit);
const moved = booked.filter((c) => c.oldNet !== c.newNet);
const below = (k) => credits.filter((c) => c[k] != null && c[k] < RULES.minRewardRisk).length;
console.log("\\n" + booked.length + " candidates with a book: " + credits.length + " credits, " + (booked.length - credits.length) + " debits; " +
  moved.length + " changed net (every one a credit: " + moved.every((c) => c.credit) + ")");
console.log("credit candidates with reward-to-risk AT THE FILL under minRewardRisk (" + RULES.minRewardRisk + "): before " +
  below("rrOld") + ", after " + below("rrNew") + " (of " + credits.length + ")");
console.log("");
`;

const dir = mkdtempSync(join(tmpdir(), "osl-measure-crossing-"));
try {
  const out = join(dir, "measure.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" },
    bundle: true, platform: "node", format: "cjs", outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
