// ============================================================================
// src/season.test.jsx — THE SEASON, MEASURED ONLY, AND ONE ANSWER ON EVERY SCREEN (PR #48, TASK 2).
//
// `seasonalSignal()` in rules.js is the one home: a month in the window counts only when |mean| ≥
// RULES.seasonalSignalT × its standard error. This holds that the four readers — the season factor, the chance's
// drift, the position thesis and the autopilot — read that one function, keyed by (market, days held), so the same
// market and expiry give the same season on Find, Build and Positions.
//
// THE SERIES ARE avFixture-DERIVED (a SENSITIVITY, never a ticker's reading): the sandbox cannot call Alpha Vantage.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { RULES, seasonalProvenance, seasonalSignal, seasonMonthLine, seasonRowLines, chanceBasisLabel,
  SEASON_NOT_READ } from "./rules.js";
import { parseAvJson, statsFromMatrix, seasonalSpan } from "./engine.js";
import { avMonthlyBody, CORN_SHAPED_MONTH_DRIFT, CORN_MONTHLY_VOL } from "./avFixture.js";
import { fuseSignals } from "./signals.js";
import { listCardFigures, buildFigures, seasonOf } from "./App.jsx";
import { SeasonRow, WhySheet } from "./why.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 300)}"`); };

/* A CORN-SHAPED SERIES at CORN's own monthly volatility (≈ 6.4%), 16 years — the brief's arithmetic. */
const CORN = statsFromMatrix(parseAvJson(avMonthlyBody({ months: 16 * 12 + 9, endYear: 2026, endMonth: 8, seed: 48,
  vol: CORN_MONTHLY_VOL, monthDrift: CORN_SHAPED_MONTH_DRIFT })).matrix);
const PROV = seasonalProvenance({ ...CORN, at: Date.now() }, "CORN");

check("THE RULE, WRITTEN OUT: a month counts only at |mean| ≥ seasonalSignalT × its own standard error", () => {
  eq(RULES.seasonalSignalT, 2, "chosen, not measured (PRD §4.8)");
  const stats = { monthlyMean: Array(12).fill(0), monthN: Array(12).fill(16), monthSE: Array(12).fill(1.6) };
  stats.monthlyMean[9] = 1.2;      // October: 0.75× — noise
  stats.monthlyMean[5] = -3.46;    // June: 2.16× — counts
  const oct = seasonalSignal(stats, 9, 30), jun = seasonalSignal(stats, 5, 30);
  eq(oct.counts, false, "October"); eq(oct.mean, 0, "October adds nothing");
  eq(jun.counts, true, "June"); eq(+jun.mean.toFixed(2), -3.46, "June leans");
  eq(oct.months[0].line, "Oct +1.2% ± 1.6% (16 yrs) · not a signal", "the owner's own example line");
  eq(jun.months[0].line, "Jun −3.5% ± 1.6% (16 yrs) · counts", "June's");
  // A month whose error is unknown (one year, or a reading stored before PR #48) never counts.
  eq(seasonalSignal({ monthlyMean: Array(12).fill(9), monthN: null, monthSE: null }, 0, 30).counts, false, "no error, no count");
  eq(seasonMonthLine({ label: "Jan", mean: 9, se: null, n: null, counts: false }), "Jan +9.0% ± — · not a signal");
});

check("THE WINDOW IS seasonalDrift()'S SPAN, and a month that does not count adds no drift", () => {
  for (const d of [20, 45, 60, 90]) eq(seasonalSignal(PROV, 5, d).span, seasonalSpan(d), `${d} days`);
  const stats = { monthlyMean: Array(12).fill(0), monthN: Array(12).fill(16), monthSE: Array(12).fill(1.6) };
  stats.monthlyMean[5] = -3.46; stats.monthlyMean[6] = 1.2;
  const two = seasonalSignal(stats, 5, 60);
  eq(two.used.map((x) => x.label), ["Jun"], "used"); eq(two.dropped.map((x) => x.label), ["Jul"], "dropped");
  eq(+two.mean.toFixed(3), -1.73, "−3.46 over two months");
});

check("NOT READ: no months, a zero mean, and the one line", () => {
  const none = seasonalSignal(seasonalProvenance(null, "CORN"), 9, 45);
  eq([none.read, none.mean, none.counts], [false, 0, false], "not read");
  eq(seasonRowLines(none), [SEASON_NOT_READ], "the row says so");
  eq(SEASON_NOT_READ, "season not read: no drift");
});

check("THE CHANCE DRIFTS ON THE COUNTED MEAN × 12 / 100, and its label says what it is made of", () => {
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const q = () => null;
  for (const prov of [PROV, seasonalProvenance(null, "CORN")]) {
    const month = new Date().getMonth();   // the card's window starts this month (NOW_MONTH)
    const sig = seasonalSignal(prov, month, 30);
    const lf = listCardFigures(legs, { spot: 20, dte: 30, iv: 0.22, q, ticker: "CORN", expKey: "2026-11-02", seasonal: prov });
    if (!lf.mc) throw new Error("no chance");
    eq(+lf.mc.driftAnnual.toFixed(12), +((sig.mean * 12) / 100).toFixed(12), `month ${month}: drift`);
    eq(chanceBasisLabel(lf.mc), sig.counts ? "prices + season" : "prices only", `month ${month}: label`);
  }
});

check("SAME MARKET AND EXPIRY → THE SAME SEASON ON FIND, BUILD AND POSITIONS", () => {
  // Find reads a market on its board's days, Build on the trade's, Positions on the days left: one expiry is one
  // number of days, so all three call `seasonalSignal()` with the same arguments.
  const state = { CORN: { ...CORN, at: Date.now() } };
  const d = 45;
  const find = seasonOf(state, "CORN", d), build = seasonOf(state, "CORN", d), positions = seasonOf(state, "CORN", d);
  eq(find, build, "Find = Build"); eq(build, positions, "Build = Positions");
  // The fused factor and the chance read the same window.
  const f1 = fuseSignals({ ticker: "CORN", month: 9, season: find, now: 0 });
  const f2 = fuseSignals({ ticker: "CORN", month: 9, season: build, now: 0 });
  eq(f1.components.seasonal, f2.components.seasonal, "the season factor");
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const opts = { spot: 20, dte: d, iv: 0.22, q: () => null, ticker: "CORN", expKey: "2026-11-17", seasonal: seasonalProvenance(state.CORN, "CORN") };
  const lf = listCardFigures(legs, opts), bf = buildFigures(legs, opts);
  eq(lf.mc.driftAnnual, bf.chance.driftAnnual, "the drift on the card and on Build");
  eq(lf.mc.seasonMonths, bf.chance.seasonMonths, "the window's months");
  // …and the code keys every screen by (market, days): Find, Build (via marketDte), Positions, the autopilot.
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "const fHere = fuseFind(tk, d2);");
  has(app, "(tk === ticker && dte > 0 ? dte");
  has(app, "signalSnapshot(fuseAt(p.ticker, Math.max(1, dteLeft))");
  has(app, "const seasNow = seasonalNowOf(seasonal, p.ticker, Math.max(1, dteLeft));");
  has(readFileSync("netlify/functions/autopilot.mjs", "utf8"), "seasonalSignal(seas, month, Math.max(1, dteLeft))");
});

check("EVERY READER OF THE SEASON READS seasonalSignal(): no ±0.8 band and no hand-written table survives", () => {
  const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const f of ["src/signals.js", "src/App.jsx", "src/pro.jsx", "netlify/functions/autopilot.mjs", "src/demo.js"]) {
    const c = code(f);
    if (/\bSEASONAL\b(?! SOURCE)/.test(c)) throw new Error(`${f} still reads the hand-written table`);
    if (/[<>]\s*-?0\.8\b/.test(c)) throw new Error(`${f} still draws a ±0.8 band`);
  }
  has(code("src/signals.js"), "export function seasonalComponent(ticker, month, signal)");
});

check("THE WHY SHEET'S SEASON ROW: the window's months '± … · counts / not a signal' and the chance's basis", () => {
  const sig = seasonalSignal({ monthlyMean: [0, 0, 0, 0, 0, -3.46, 1.2, 0, 0, 1.2, 0, 0], monthN: Array(12).fill(16),
    monthSE: Array(12).fill(1.6) }, 5, 60);
  const html = renderToStaticMarkup(<SeasonRow season={sig} />);
  has(html, "Season · 2 months held");
  has(html, "Jun −3.5% ± 1.6% (16 yrs) · counts");
  has(html, "Jul +1.2% ± 1.6% (16 yrs) · not a signal");
  has(html, "chance: prices + season");
  const none = renderToStaticMarkup(<SeasonRow season={null} />);
  has(none, "season not read: no drift"); has(none, "chance: prices only");
  // Mounted on the sheet, from the fused result's own window.
  const fused = fuseSignals({ ticker: "CORN", month: 5, season: sig, now: 0 });
  has(renderToStaticMarkup(<WhySheet fused={fused} ticker="CORN" newsItems={[]} />), "Jun −3.5% ± 1.6% (16 yrs) · counts");
});

check("WORKED EXAMPLE — CORN-shaped fixture, October and June, 30 and 45 days (printed for the PR)", () => {
  for (const [label, month] of [["October", 9], ["June", 5]]) {
    for (const d of [30, 45]) {
      const s = seasonalSignal(PROV, month, d);
      console.log(`       ${label} ${d}d: ${s.months.map((x) => x.line).join("; ")} → ${s.mean.toFixed(2)}%/mo`);
    }
  }
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
