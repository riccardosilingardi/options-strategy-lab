// ============================================================================
// scripts/measure-exits.mjs — P5, THE OWNER'S QUESTION, PER MARKET AND PER FAMILY (PR 68, task 68.1).
//
//   node scripts/measure-exits.mjs <dir> [month]     (month 0–11, default this month)
//
// Do the 21-DTE exit and the 50% take profit beat holding to expiry on this basket, and would turning the stop-loss
// warning into a real exit have helped? It answers ONLY from real daily closes: one file per market in <dir>, named
// <TICKER>.json, each the reply of the deployed app's `/api/bars?sym=<TICKER>&days=1900` (about five years). With no
// directory, or a market with no file, it says so and prints no number for it — never a made-up series (the owner,
// 12 Oct 2026: "the logic, without data, or it passes for real").
//
// The structures are TEMPLATES, one per family, in strike steps of the market's own `step` (markets.js) around the last
// close, held `RULES.targetEntryDTE` days: they are not Find's cards (Find needs a live chain). `exitBacktest()` re-strikes
// each at every past entry's moneyness, so only the distances matter.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { exitBacktest } from "../src/engine.js";
import { RULES, exitReplayPolicy } from "../src/rules.js";
import { BASKET, getU } from "../src/markets.js";

const dir = process.argv[2] || null;
const month = process.argv[3] != null ? Number(process.argv[3]) : new Date().getMonth();
const C = (k, side) => ({ type: "call", k, side }), P = (k, side) => ({ type: "put", k, side });
const FAMILIES = [
  ["Bull call spread", [C(0, 1), C(2, -1)]],
  ["Bear put spread", [P(0, 1), P(-2, -1)]],
  ["Bull put credit spread", [P(-1, -1), P(-3, 1)]],
  ["Bear call credit spread", [C(1, -1), C(3, 1)]],
  ["Iron condor", [P(-4, 1), P(-2, -1), C(2, -1), C(4, 1)]],
  ["Long call", [C(1, 1)]],
  ["Long put", [P(-1, 1)]],
];
const fmt = (v) => (v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`);
const pct = (v) => (v == null ? "—" : `${Math.round(v * 100)}%`);

if (!dir || !existsSync(dir)) {
  console.log(`\nNo closes given. Save each market's /api/bars?sym=<TICKER>&days=1900 from the deployed app as <TICKER>.json in one`);
  console.log(`directory and pass it: node scripts/measure-exits.mjs <dir> [month]. Nothing is replayed without real closes.\n`);
  process.exit(0);
}
console.log(`\nExit rules on past years — every session of month ${month + 1}, ${RULES.targetEntryDTE} days to expiry, templates per family`);
console.log(`(take profit ${pct(RULES.takeProfitPct)} of max profit, exit at ${RULES.exitDTE} days, stop ${pct(RULES.stopLossPct)} of max loss as a warning).`);
console.log("Per $100 at risk: rules · held to expiry · stop as exit · win rate (rules) · exits target/time/expiry · warnings (then won)\n");
for (const tk of BASKET) {
  const f = join(dir, `${tk}.json`);
  if (!existsSync(f)) { console.log(`${tk.padEnd(5)} no file: not read`); continue; }
  let bars;
  try { const j = JSON.parse(readFileSync(f, "utf8")); bars = Array.isArray(j) ? j : j.bars; } catch (e) { console.log(`${tk.padEnd(5)} unreadable: ${e.message}`); continue; }
  if (!Array.isArray(bars) || !bars.length) { console.log(`${tk.padEnd(5)} no closes in the file: not read`); continue; }
  const S = Number(bars[bars.length - 1].close), step = getU(tk).step;
  const atm = Math.round(S / step) * step;
  for (const [name, tpl] of FAMILIES) {
    const legs = tpl.map((l) => ({ type: l.type, side: l.side, qty: 1, strike: atm + l.k * step }));
    const r = exitBacktest(legs, S, RULES.targetEntryDTE, bars, exitReplayPolicy(), { month });
    if (!r) { console.log(`${tk.padEnd(5)} ${name.padEnd(24)} no finished window`); continue; }
    console.log(`${tk.padEnd(5)} ${name.padEnd(24)} n ${String(r.n).padStart(3)} · ${fmt(r.rules.per100).padStart(6)} · ${fmt(r.expiry.per100).padStart(6)} · ` +
      `${fmt(r.withStop.per100).padStart(6)} · ${pct(r.rules.winRate).padStart(4)} · ${r.exits.target}/${r.exits.time}/${r.exits.expiry} · ` +
      `${r.warnings.n} (${r.warnings.thenWon})`);
  }
}
console.log("");
