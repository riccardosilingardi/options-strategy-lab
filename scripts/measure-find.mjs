// ============================================================================
// scripts/measure-find.mjs — WHAT THE FIND CONTROLS DO ON THE FIXTURE CARDS, AND WHAT A SLIDER MOVE COSTS (PR #45).
//
// Prints, on the 31 fixture cards (MODEL_BOARD + ungBoards(), five directions):
//   1. TASK 0 — a budget of $5,150 against a limit of $5,000, before and after the cap: how many sized cards put
//      more than the limit at risk.
//   2. TASK 1/2 — how many cards each control passes at its default, and at the owner's "chance at least 60%".
//   3. PERFORMANCE — how long one slider move takes (size every card, read every control, split the list), and how
//      long generating the list takes, which a slider move never repeats.
//
//   node scripts/measure-find.mjs
//
// THE TIMINGS ARE THIS MACHINE'S, NOT A PHONE'S (PRD §4.5): they say that a move is a fixed small cost per card and
// that no simulation is in it, not how fast the owner's phone is.
// ============================================================================
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const ENTRY = `
import { findCards } from "./scripts/find-fixtures.jsx";
import { scaleStrategy } from "./src/pro.jsx";
import { RULES, requestOf, sizing, sizedFree, controlReadings, splitByRequest, nearestRelaxation } from "./src/rules.js";
import { marketRows } from "./src/rows.js";

const t0 = performance.now();
const cards = findCards();
const genMs = performance.now() - t0;
const cands = cards.map((c) => c.cand);
const pad = (s, n) => String(s).padEnd(n);

console.log("\\n" + cards.length + " fixture cards over 5 directions (generation incl. 8,000-run chance: " + genMs.toFixed(0) + " ms, once)\\n");

/* ---- 1. TASK 0 ---- */
const over = (req, limit) => {
  let sized = 0, past = 0;
  for (const c of cards) {
    const s = scaleStrategy(c.lf.aFill, req.mode, req.amt, req.riskCap);
    if (s && s.ok) { sized++; if (s.totRisk > limit + 1e-9) past++; }
  }
  return { sized, past };
};
const LIMITS = { perTradeLimit: 5000, tradingCapital: 100000 };
const wasted = over({ mode: "budget", amt: 5150, riskCap: null }, 5000);
const capped = requestOf({ amt: 5150 }, LIMITS);
const after = over(capped, 5000);
console.log("TASK 0 — budget typed $5,150, per-trade limit $5,000");
console.log("  before the cap: " + wasted.past + " of " + wasted.sized + " sized cards put more than $5,000 at risk");
console.log("  after the cap:  " + after.past + " of " + after.sized + " (amount held at " + capped.amt + ", riskCap " + capped.riskCap + ")");
const free = requestOf({ amt: 5150 }, LIMITS, { sizingFree: true });
const fr = over(free, 5000);
console.log("  free sizing ON: amount " + free.amt + ", " + fr.past + " of " + fr.sized + " past $5,000 (unchanged behaviour)");

/* ---- 2. what each control passes ---- */
const row = (label, req) => {
  const sizes = new Map(cards.map((c) => [c.key, sizedFree(scaleStrategy(c.lf.aFill, req.mode, req.amt, req.riskCap), false)]));
  const r = controlReadings(cands, req, (c) => sizes.get(c.key) || null);
  const sp = splitByRequest(cands, req, (c) => sizes.get(c.key) || null);
  console.log("  " + pad(label, 44) + " chance " + String(r.chance.pass).padStart(2) + " · return " + String(r.return.pass).padStart(2) +
    " · size " + String(r.size.pass).padStart(2) + "  →  " + String(sp.meets.length).padStart(2) + " match, " + sp.others.length + " shown as misses (PR #49: one list)");
  return { r, sp, sizes };
};
console.log("\\nWHAT EACH CONTROL PASSES (of " + cards.length + ")");
const d = sizing({});
row("defaults, nothing answered (limit $" + Math.round(d.perTradeLimit) + ")", requestOf({}, d));
row("owner's limit $5,000, defaults", requestOf({}, LIMITS));
row("chance at least 60%", requestOf({ minChance: 0.6 }, LIMITS));
row("chance at least 80%", requestOf({ minChance: 0.8 }, LIMITS));
row("return on risk at least 150%", requestOf({ minReturn: 1.5 }, LIMITS));
for (const amt of [500, 1250, 2500, 5000]) row("most I will risk $" + amt, requestOf({ amt }, LIMITS));
const zero = requestOf({ minChance: 0.8 }, LIMITS);
const sz = new Map(cards.map((c) => [c.key, sizedFree(scaleStrategy(c.lf.aFill, zero.mode, zero.amt, zero.riskCap), false)]));
console.log("\\nNEAREST RELAXATION at chance >= 80%: " + (nearestRelaxation(cands, zero, (c) => sz.get(c.key) || null) || {}).text);

/* ---- 3. one slider move ---- */
const N = 200;
const req = (i) => requestOf({ minChance: RULES.chanceAskMin + ((i % 13) / 12) * (RULES.chanceAskMax - RULES.chanceAskMin), amt: 500 + (i % 9) * 500 }, LIMITS);
const move = (i) => {
  const rq = req(i);
  const sizes = new Map(cards.map((c) => [c.key, sizedFree(scaleStrategy(c.lf.aFill, rq.mode, rq.amt, rq.riskCap), false)]));
  const so = (c) => sizes.get(c.key) || null;
  controlReadings(cands, rq, so);
  const sp = splitByRequest(cands, rq, so);
  if (!sp.meets.length) nearestRelaxation(cands, rq, so);
};
for (let i = 0; i < 20; i++) move(i);          // warm-up
const t1 = performance.now();
for (let i = 0; i < N; i++) move(i);
const per = (performance.now() - t1) / N;
console.log("\\nONE SLIDER MOVE on " + cards.length + " cards (size each, read every control, split, nearest relaxation): " + per.toFixed(3) + " ms");
console.log("GENERATING THE LIST (analyse, floors, 8,000-run chance per card): " + genMs.toFixed(0) + " ms — a move never repeats it\\n");
/* REDESIGN PR 1: WHAT FIND DRAWS NOW. Before: every card, each with its gauge and its unified picture (two drawings).
   After: one row per market, each with one 72×40 thumbnail; the cards are on each market's own page. */
{
  const req = requestOf({}, sizing({ tradingCapital: 5000 * 20, concurrentTarget: 1 }));
  const byKey = new Map(cards.map((x) => [x.key, x]));
  const rows = marketRows(cards, req, (c) => sizedFree(scaleStrategy(byKey.get(c.key).lf.aFill, req.mode, req.amt, req.riskCap), false));
  console.log("WHAT FIND RENDERS (redesign PR 1), on the " + cards.length + " fixture cards over " + new Set(cards.map((x) => x.tk)).size + " markets");
  console.log("  before: " + cards.length + " cards, " + cards.length * 2 + " pictures (a gauge and the unified picture on each)");
  console.log("  after:  " + rows.length + " rows (one per market), " + rows.length + " pictures (one 72×40 thumbnail each), 0 cards — the cards are on the market page\\n");
}
`;

const dir = mkdtempSync(join(tmpdir(), "osl-measure-find-"));
try {
  const out = join(dir, "entry.cjs");
  await build({ stdin: { contents: ENTRY, resolveDir: process.cwd(), loader: "jsx" }, bundle: true, platform: "node", format: "cjs",
    outfile: out, logLevel: "error" });
  const r = spawnSync(process.execPath, [out], { stdio: "inherit" });
  process.exitCode = r.status || 0;
} finally { rmSync(dir, { recursive: true, force: true }); }
