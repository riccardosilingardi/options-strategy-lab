// ============================================================================
// src/chart.test.jsx — BUILD'S CHART: THE ZONES, THE FAN'S EDGES, THE EXIT AND THE CROSSHAIR (PR 63, tasks 63.4 and 63.5).
//
// The zones' chances add up to 100% and the green ones to the CHANCE figure itself (one distribution on one chart); the
// ±1 sd prices sit where the lognormal puts 16% and 84%; the exit is 21 days before the expiry's own date; the crosshair
// says what `payoff()` and the same lognormal say, and its keys move it like a slider. Bundled by scripts/test-jsx.mjs.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedChart, GreekChart, ScenarioTable } from "./pro.jsx";
import { analyze } from "./App.jsx";
import { payoffBands } from "./visuals.jsx";
import { terminalExact, payoff, Phi } from "./engine.js";
import { RULES, CROSS_HINT, chanceText, signedMoney, spotNowLabel, SCENARIO_MAX_MOVES, SCENARIO_MAX_DEFAULT, scenarioMoveText, SCENARIO_WORDS,
  GREEK_TABS } from "./rules.js";
import { chartDist, zoneOdds, coneEdges, exitMark, awayFrom, crosshairReadout, crossStep, crossKey, scenarioGrid, greekCurves,
  brokerGreeks } from "./tradeChart.js";

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); }
}
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const near = (a, b, tol, m) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m}: ${a} vs ${b} (tolerance ${tol})`); };
const has = (h, s) => { if (!h.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };

const POLICY = { driftAnnual: 0.04, sigma: 0.18, dte: 44 };
const FAMILIES = {
  "GLD bear put 382/363": { legs: [{ side: 1, type: "put", strike: 382, qty: 1 }, { side: -1, type: "put", strike: 363, qty: 1 }], net: 6.75, S: 378.4 },
  "iron condor": { legs: [{ side: 1, type: "put", strike: 340, qty: 1 }, { side: -1, type: "put", strike: 355, qty: 1 },
    { side: -1, type: "call", strike: 400, qty: 1 }, { side: 1, type: "call", strike: 415, qty: 1 }], net: -4.2, S: 378.4 },
  "put butterfly": { legs: [{ side: 1, type: "put", strike: 390, qty: 1 }, { side: -1, type: "put", strike: 375, qty: 2 },
    { side: 1, type: "put", strike: 360, qty: 1 }], net: 3.1, S: 378.4 },
  "long call": { legs: [{ side: 1, type: "call", strike: 390, qty: 1 }], net: 5.2, S: 378.4 },
};
const zonesOf = (f, policy = POLICY) => {
  const ks = f.legs.map((l) => l.strike);
  const bands = payoffBands({ legs: f.legs, entryNet: f.net, spot: f.S, lo: Math.min(f.S, ...ks) * 0.5, hi: Math.max(f.S, ...ks) * 1.5 }).bands;
  return zoneOdds(bands, chartDist(f.legs, f.net, f.S, policy));
};

check("THE ZONES ADD UP TO 100%, AND THE GREEN ONES TO THE CHANCE FIGURE ITSELF — on every family", () => {
  for (const [name, f] of Object.entries(FAMILIES)) {
    const z = zonesOf(f);
    if (z.length < 2) throw new Error(`${name}: ${z.length} zone(s)`);
    eq(z[0].lo, 0, `${name}: the first zone starts at a price of zero`);
    eq(z[z.length - 1].hi, Infinity, `${name}: the last zone has no top`);
    near(z.reduce((a, x) => a + x.p, 0), 1, 1e-12, `${name}: the zones' chances add up to`);
    const chance = terminalExact(f.legs, f.net, f.S, POLICY).pop;
    // payoffBands() interpolates its breakevens between 241 samples; the exact chance cuts at the exact root.
    near(z.filter((x) => x.sign > 0).reduce((a, x) => a + x.p, 0), chance, 2e-4, `${name}: the green zones against the CHANCE figure`);
  }
});

check("THE FAN'S EDGES ARE ONE STANDARD DEVIATION: the lognormal puts 15.9% below the low one and 84.1% below the high one", () => {
  const f = FAMILIES["GLD bear put 382/363"];
  const e = coneEdges(f.S, POLICY);
  const D = chartDist(f.legs, f.net, f.S, POLICY);
  near(D.P(e.lo), Phi(-1), 1e-12, "below the −1 sd price");
  near(D.P(e.hi), Phi(1), 1e-12, "below the +1 sd price");
  near(D.P(e.mid), 0.5, 1e-12, "the middle path");
  eq(coneEdges(f.S, { ...POLICY, sigma: 0 }), null, "no volatility, no fan");
});

check("THE EXIT IS 21 DAYS BEFORE THE EXPIRY'S OWN DATE, read with no clock; none once inside it", () => {
  const x = exitMark("2026-11-20", 44);
  eq(x.key, "2026-10-30", "the exit's date"); eq(x.day, "30 Oct", "its words"); eq(x.daysFromNow, 44 - RULES.exitDTE, "days from today");
  eq(exitMark("2026-11-20", RULES.exitDTE), null, "at the exit already");
  eq(exitMark("not a date", 44), null, "no date, no mark");
  eq(exitMark("2027-01-15", 100).key, "2026-12-25", "across a year");
});

check("THE CROSSHAIR SAYS WHAT payoff() AND THE SAME LOGNORMAL SAY, for Build's size", () => {
  const f = FAMILIES["GLD bear put 382/363"];
  const D = chartDist(f.legs, f.net, f.S, POLICY);
  const r = crosshairReadout({ ticker: "GLD", price: 370, expKey: "2026-11-20", legs: f.legs, entryNet: f.net, contracts: 7, dist: D });
  near(r.pnl, (payoff(f.legs, 370) - f.net) * 100 * 7, 1e-9, "the P&L at expiry for 7");
  near(r.below, D.P(370), 1e-15, "the chance of finishing below");
  eq(r.text, `GLD at $370.00 on 20 Nov → ${signedMoney(r.pnl)} on 7 contracts · ${chanceText(r.below)} chance to finish below`, "the sentence");
  eq(crosshairReadout({ ticker: "GLD", price: 370, expKey: "2026-11-20", legs: f.legs, entryNet: f.net, contracts: null, dist: D }).contracts, 1,
    "no size read: one contract, and the sentence says 1 contract");
  near(awayFrom(375.25, 378.4), (375.25 - 378.4) / 378.4, 1e-15, "a breakeven's distance");
});

check("THE CROSSHAIR'S KEYS MOVE IT LIKE A SLIDER: a step near 0.25% of the price, ten on Page, the ends on Home / End", () => {
  eq(crossStep(378.4), 1, "GLD"); eq(crossStep(12), 0.05, "UNG"); eq(crossStep(56), 0.25, "SLV");
  const o = { min: 340, max: 420, step: 1, spot: 378.4 };
  eq(crossKey(null, "ArrowUp", o), 379, "the first key starts from today's price");
  eq(crossKey(379, "ArrowDown", o), 378, "down a step"); eq(crossKey(379, "ArrowLeft", o), 378, "left is down");
  eq(crossKey(379, "PageUp", o), 389, "ten steps"); eq(crossKey(419.5, "PageUp", o), 420, "held at the chart's top");
  eq(crossKey(379, "Home", o), 340, "Home: the lowest price"); eq(crossKey(379, "End", o), 420, "End: the highest");
  eq(crossKey(379, "a", o), null, "another key is not the slider's");
});

/* THE DRAWING, on fixture bars: today's price with its value, the breakeven's distance, ±1 sd at the fan's edge, the exit
   on the time axis, the zones with their chances, and the crosshair as a slider with its readout. */
const f = FAMILIES["GLD bear put 382/363"];
const BARS = Array.from({ length: 60 }, (_, i) => { const c = 370 + 8 * Math.sin(i / 7) + i * 0.1; return { time: i, open: c, high: c + 2, low: c - 2, close: c }; });
const curve = Array.from({ length: 241 }, (_, i) => { const s = 300 + i * 0.5; return { s, exp: (payoff(f.legs, s) - f.net) * 100 }; });
const chart = (extra = {}) => renderToStaticMarkup(<UnifiedChart W={360} ticker="GLD" bars={BARS} dte={44} sigma={POLICY.sigma}
  driftAnnual={POLICY.driftAnnual} curve={curve} legs={f.legs} breakevens={[375.25]} spot={f.S} entryNet={f.net} expKey="2026-11-20"
  contracts={7} {...extra} />);

check("THE CHART SAYS TODAY'S PRICE, THE BREAKEVEN'S DISTANCE, ±1 SD, THE EXIT AND EACH ZONE'S CHANCE", () => {
  const h = chart();
  has(h, `>${spotNowLabel(378.4)}<`); has(h, ">378.40 · now<");
  has(h, ">BE 375.25 · −0.8%<");
  has(h, 'data-sd="+1"'); has(h, ">+1 sd "); has(h, 'data-sd="-1"'); has(h, ">−1 sd ");
  has(h, "data-exit-mark"); has(h, ">exit 30 Oct<");
  const ps = [...h.matchAll(/data-zone-p="([0-9.]+)"/g)].map((m) => Number(m[1]));
  if (ps.length < 2) throw new Error(`${ps.length} zone(s) drawn`);
  near(ps.reduce((a, b) => a + b, 0), 1, 1e-5, "the drawn zones' chances");
  has(h, 'data-zone="pays"'); has(h, 'data-zone="loses"');
});

check("THE CHART IS A SLIDER (keyboard), SAYS HOW TO READ A PRICE AT REST, AND READS ONE ONCE PUT", () => {
  const rest = chart();
  has(rest, 'role="slider"'); has(rest, 'tabindex="0"'); has(rest, 'aria-label="Price to read on the chart"');
  has(rest, `>${CROSS_HINT}<`);
  if (rest.includes("data-crosshair")) throw new Error("a line before anything was read");
  const at = chart({ initialCross: 370 });
  has(at, "data-crosshair"); has(at, "data-cross-handle");
  has(at, ">GLD at $370.00 on 20 Nov → ");
  has(at, " on 7 contracts · ");
  has(at, 'aria-valuenow="370"');
  has(at, "touch-action:none");                       // only the handle takes the drag; the page still scrolls over the chart
  has(at, "touch-action:pan-y");
});

/* ====================================================================
   PR 67 (tasks 67.3 and 67.4) — THE SCENARIO TABLE AND THE GREEK TABS, against the figures Build already prints.
==================================================================== */
const BUILD = (() => {
  const f = FAMILIES["GLD bear put 382/363"];
  const q = (l) => ({ 382: { bid: 12.1, ask: 12.5, mid: 12.3, iv: 0.19 }, 363: { bid: 5.4, ask: 5.7, mid: 5.55, iv: 0.21 } })[l.strike];
  return { ...f, a: analyze(f.legs, f.S, POLICY.dte, 0.18, q), ivs: [0.19, 0.21] };
})();

check("THE TABLE'S COLUMNS ARE THE LARGEST MOVE IN THIRDS, 0 IN THE MIDDLE, AND THE SWITCH CHANGES ONLY THAT", () => {
  for (const mx of SCENARIO_MAX_MOVES) {
    const g = scenarioGrid({ legs: BUILD.legs, entryNet: BUILD.a.entry, spot: BUILD.S, dte: POLICY.dte, ivs: BUILD.ivs, contracts: 3, maxMove: mx });
    eq(g.columns.length, 7, `${mx}: seven columns`);
    g.columns.forEach((c, i) => near(c.move, ((i - 3) * mx) / 3, 1e-12, `${mx}: column ${i}`));
    near(g.columns[3].price, BUILD.S, 1e-9, "the middle column is today's price");
  }
  eq(SCENARIO_MAX_DEFAULT, 0.30, "IBKR's default, ±30%");
  eq(["−30%", "−20%", "−10%", "0", "+10%", "+20%", "+30%"].join(" "),
    scenarioGrid({ legs: BUILD.legs, entryNet: 1, spot: 100, dte: 30, maxMove: 0.3 }).columns.map((c) => scenarioMoveText(c.move)).join(" "), "the heads");
});

check("THE TABLE NEVER COMPUTES A SECOND P&L: at expiry it is the crosshair's; today it is Build's 'now' curve, for the size", () => {
  const n = 3;
  const g = scenarioGrid({ legs: BUILD.legs, entryNet: BUILD.a.entry, spot: BUILD.S, dte: POLICY.dte, ivs: BUILD.ivs, contracts: n });
  for (const c of g.columns) {
    const x = crosshairReadout({ ticker: "GLD", price: c.price, expKey: "2026-11-20", legs: BUILD.legs, entryNet: BUILD.a.entry, contracts: n, dist: null });
    near(c.expiry.pnl, x.pnl, 1e-6, `expiry P&L at ${c.price}`);
    for (const k of ["delta", "gamma", "vega", "theta"]) eq(c.expiry[k], 0, `at expiry ${k} is zero, as IBKR shows it`);
    // ±10/20/30% are points of analyze()'s grid (0.7S … 1.3S in 240 steps): its "now" P&L per contract, to the dollar.
    const pt = BUILD.a.curve.reduce((b, p) => (Math.abs(p.s - c.price) < Math.abs(b.s - c.price) ? p : b));
    near(c.today.pnl / n, pt.now, 0.51 + Math.abs(pt.s - c.price) * 100, `today's P&L at ${c.price}`);
  }
});

check("…AND TODAY'S GREEKS AT TODAY'S PRICE ARE BUILD'S OWN (analyze()'s), for the size", () => {
  const n = 4;
  const g = scenarioGrid({ legs: BUILD.legs, entryNet: BUILD.a.entry, spot: BUILD.S, dte: POLICY.dte, ivs: BUILD.ivs, contracts: n });
  const t = g.columns[3].today, G = BUILD.a.greeks;
  near(t.delta, G.delta * 100 * n, 1e-6, "delta in shares");
  near(t.gamma, G.gamma * 100 * n, 1e-6, "gamma in shares per $1");
  near(t.theta, G.theta * n, 1e-6, "theta, $ a day (analyze()'s is per contract)");
  near(t.vega, G.vega * n, 1e-6, "vega, $ per vol point");
  // Without each leg's IV there is no "today", never a zero.
  eq(scenarioGrid({ legs: BUILD.legs, entryNet: 1, spot: 100, dte: 30, ivs: [0.2] }).columns[0].today, null, "one IV for two legs");
  eq(scenarioGrid({ legs: BUILD.legs, entryNet: 1, spot: null, dte: 30 }), null, "no price, no table");
});

check("THE GREEK TABS: the curve at today's price is the table's middle column; no exit line inside the exit window", () => {
  for (const greek of ["delta", "gamma", "vega", "theta"]) {
    const cv = greekCurves({ legs: BUILD.legs, spot: BUILD.S, dte: POLICY.dte, ivs: BUILD.ivs, contracts: 2, greek, lo: BUILD.S, hi: BUILD.S * 1.3 });
    const g = scenarioGrid({ legs: BUILD.legs, entryNet: BUILD.a.entry, spot: BUILD.S, dte: POLICY.dte, ivs: BUILD.ivs, contracts: 2 });
    near(cv.points[0].today, g.columns[3].today[greek], 1e-9, greek);
    eq(cv.exitDays, RULES.exitDTE, `${greek}: the exit is ${RULES.exitDTE} days before the expiry`);
    if (!cv.points.every((p) => Number.isFinite(p.exit))) throw new Error(`${greek}: an exit point is missing`);
  }
  const inside = greekCurves({ legs: BUILD.legs, spot: BUILD.S, dte: RULES.exitDTE, ivs: BUILD.ivs, greek: "delta" });
  eq(inside.exitDays, null, "inside the window"); eq(inside.points[0].exit, null, "no exit point");
  eq(greekCurves({ legs: BUILD.legs, spot: BUILD.S, dte: 30, ivs: null, greek: "delta" }), null, "no IVs, no curve");
});

check("THE BROKER'S GREEKS ARE READ AND ADDED UP, AND A LEG WITHOUT ONE LEAVES THAT GREEK UNKNOWN (never a partial sum)", () => {
  const reads = [{ delta: -0.46, gamma: 0.011, theta: -0.09, vega: 0.52 }, { delta: -0.22, gamma: 0.008, theta: -0.07, vega: null }];
  const b = brokerGreeks(BUILD.legs, reads, 2);
  near(b.delta, (-0.46 - -0.22) * 200, 1e-9, "delta: +1 × −0.46 − 1 × −0.22, × 100 × 2");
  near(b.theta, (-0.09 - -0.07) * 200, 1e-9, "theta");
  eq(b.vega, null, "one leg sent no vega");
  eq(brokerGreeks(BUILD.legs, null, 2).delta, null, "nothing read");
});

check("THE SCREEN: the tabs, a Greek's chart with its read dot only when every leg was read, and the table's six rows", () => {
  const html = renderToStaticMarkup(<ScenarioTable legs={BUILD.legs} entryNet={BUILD.a.entry} spot={BUILD.S} dte={POLICY.dte} ivs={BUILD.ivs} contracts={3} />);
  for (const id of ["price", "pnl", "delta", "gamma", "vega", "theta"]) has(html, `data-scenario-row="${id}"`);
  for (const m of ["−30%", "−20%", "−10%", "+10%", "+20%", "+30%"]) has(html, `>${m}<`);
  has(html, SCENARIO_WORDS.title); has(html, SCENARIO_WORDS.today); has(html, SCENARIO_WORDS.expiry);
  const reads = [{ delta: -0.46, gamma: 0.011, theta: -0.09, vega: 0.52 }, { delta: -0.22, gamma: 0.008, theta: -0.07, vega: 0.40 }];
  const with_ = renderToStaticMarkup(<GreekChart greek="delta" legs={BUILD.legs} spot={BUILD.S} dte={POLICY.dte} ivs={BUILD.ivs} reads={reads} contracts={2} expKey="2026-11-20" />);
  has(with_, 'data-greek-line="today"'); has(with_, 'data-greek-line="exit"'); has(with_, "data-greek-read");
  has(with_, "read from the broker"); has(with_, "Where the Greeks come from");
  const without = renderToStaticMarkup(<GreekChart greek="vega" legs={BUILD.legs} spot={BUILD.S} dte={POLICY.dte} ivs={BUILD.ivs} reads={[reads[0], { ...reads[1], vega: null }]} contracts={2} expKey="2026-11-20" />);
  if (without.includes("data-greek-read")) throw new Error("a dot from a partial sum");
  for (const t of GREEK_TABS) has(GREEK_TABS.map((x) => x.label).join(" "), t.label);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const x of failures) console.error(`${x.name}:\n${x.e.stack}\n`);
  process.exit(1);
}
