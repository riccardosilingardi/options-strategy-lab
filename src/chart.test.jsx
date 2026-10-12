// ============================================================================
// src/chart.test.jsx — BUILD'S CHART: THE ZONES, THE FAN'S EDGES, THE EXIT AND THE CROSSHAIR (PR 63, tasks 63.4 and 63.5).
//
// The zones' chances add up to 100% and the green ones to the CHANCE figure itself (one distribution on one chart); the
// ±1 sd prices sit where the lognormal puts 16% and 84%; the exit is 21 days before the expiry's own date; the crosshair
// says what `payoff()` and the same lognormal say, and its keys move it like a slider. Bundled by scripts/test-jsx.mjs.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UnifiedChart } from "./pro.jsx";
import { payoffBands } from "./visuals.jsx";
import { terminalExact, payoff, Phi } from "./engine.js";
import { RULES, CROSS_HINT, chanceText, signedMoney, spotNowLabel } from "./rules.js";
import { chartDist, zoneOdds, coneEdges, exitMark, awayFrom, crosshairReadout, crossStep, crossKey } from "./tradeChart.js";

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

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const x of failures) console.error(`${x.name}:\n${x.e.stack}\n`);
  process.exit(1);
}
