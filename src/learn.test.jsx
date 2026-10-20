// src/learn.test.jsx — PR 74, rendered: Learn, the figure lab. The four tabs, one blue point per leg on the picture,
// − / + / Buy-Sell / remove on each leg, the figure's card (and the line under a sold option alone), the gallery's 14
// cards, the market sheet, the states, the two columns on a computer — and no Send anywhere on it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnScreen } from "./learn.jsx";
import { FigureChart, payoffBands } from "./visuals.jsx";
import { LAB_TABS, LAB_FIGURES, LEARN_WORDS, labLegText } from "./rules.js";
import assert from "node:assert/strict";
import { labModel, labCard, labLegRows, labGallery, labExpiry, labFigureLegs, labExpectedMove, legIv, labExitDay, labCurves, labReadout,
  labExtremes, labDensity, labMarketLine, labLegend } from "./learnView.js";
import { bs, legsAt } from "./engine.js";
import { impliedDistribution } from "./impliedDist.js";
import { exitPlanOf, marketChanceOf, MARKET_CHANCE_NOT_READ, RULES, NO_CEILING } from "./rules.js";
import { boardStrikes } from "./chain.js";
import { renderedWords } from "./wordcount.mjs";
import { readFileSync } from "node:fs";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s, m) => { if (!h.includes(s)) throw new Error(`${m || "missing"}: ${JSON.stringify(s)}`); };
const hasNot = (h, s, m) => { if (h.includes(s)) throw new Error(`${m || "unexpected"}: ${JSON.stringify(s)}`); };
const count = (h, s) => h.split(s).length - 1;
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

console.log("\nPR 74 — Learn, the figure lab, rendered\n");

const ks = []; for (let k = 320; k <= 440; k += 1) ks.push(k);
const side = Object.fromEntries(ks.map((k) => [k, { bid: 1, ask: 1.2, mid: 1.1, iv: 0.2 + Math.abs(k - 377) / 2000 }]));
const CHAIN = { spot: 377.2, expirations: ["2026-11-27", "2026-12-18"],
  byExp: { "2026-11-27": { dte: 38, calls: side, puts: { ...side, 361: { ...side[361], occ: "GLD261127P00361000" } } }, "2026-12-18": { dte: 59, calls: side, puts: side } } };
const EXP = labExpiry(CHAIN), BOARD = boardStrikes(CHAIN, EXP);
const noop = () => {};

/** What App.jsx hands Learn (PR 76: the curves, the extremes, the market's band and chance, the legend, the listing). */
function vOf(legs, extra = {}) {
  const m = labModel({ ticker: "GLD", chain: CHAIN, expKey: EXP, legs, bandsOf: payoffBands });
  const dist = impliedDistribution(CHAIN.byExp[EXP], CHAIN.spot, { minQuotes: RULES.impliedMinQuotes });
  const curves = labCurves(m, CHAIN);
  return {
    wide: false, ticker: "GLD", markets: ["CORN", "GLD", "SLV"], onMarket: noop, where: "GLD · 27 Nov · 38 days",
    listingOf: (tk) => (tk === "GLD" ? { exchange: "ARCA", name: "SPDR GOLD TRUST" } : null),
    canPrevExp: false, canNextExp: true, onExpiry: noop, status: null,
    tabs: LAB_TABS.map((t) => ({ id: t.id, label: t.label, onAdd: noop })), full: null,
    chart: { bands: m.bands, legs, spot: 377.2, onMove: noop, onStep: noop, label: (i) => `${labLegText(legs[i])}: drag`,
      curves, extremes: labExtremes(m), density: m.bands ? labDensity(dist, m.bands.lo, m.bands.hi) : [], readout: (x) => labReadout(m, curves, x),
      snapLabel: noop, market: labMarketLine(m, dist), legend: labLegend(legs.length ? curves : null) },
    legs: labLegRows(m, BOARD, CHAIN).map((r) => ({ ...r, onMinus: noop, onPlus: noop, flipLabel: r.side === "long" ? "Sell" : "Buy", onFlip: noop, onRemove: noop })),
    card: labCard(m), onClear: noop,
    gallery: labGallery({ ticker: "GLD", chain: CHAIN, expKey: EXP, bandsOf: payoffBands })
      .map((g) => ({ id: g.id, name: g.name, idea: g.idea, bands: g.model.bands, spot: 377.2, current: m.figure.id === g.id, onLoad: noop })),
    ...extra,
  };
}
// PR 76 moved them, measured on these fixtures: 313 → 319 with no leg (the listing "GLD · ARCA" and "SPDR GOLD TRUST", and
// the empty picture's price figures), 379 → 426 with the iron condor (the dollar scale and the prices along the bottom,
// "max profit $…" and "max loss $…", the three-entry legend, the market's chance line and its ⓘ, each leg named the way
// IBKR writes it, "Long GLD Nov27'26 340 Put" against "Long 340 put").
const LEARN_CEILING = { empty: 319, condor: 426 };
const SPREAD = [{ side: 1, type: "put", strike: 340, qty: 1 }, { side: -1, type: "put", strike: 361, qty: 1 }];

check("AT REST, NO LEG: the title and its line, the market and expiry, four tabs, the empty sentence, 14 figures", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf([])} />);
  has(h, ">Learn<"); has(h, LEARN_WORDS.sub); has(h, "GLD · 27 Nov · 38 days");
  for (const t of LAB_TABS) has(h, `data-learn-tab="${t.id}"`);
  has(h, LEARN_WORDS.empty); hasNot(h, "data-learn-card", "no leg, no card");
  eq(count(h, "data-learn-figure="), LAB_FIGURES.length, "a card per figure");
  eq(count(h, 'data-lab-point='), 0, "no leg, no point");
  hasNot(h, 'role="dialog"', "the market sheet opens on a tap");
  if (!/aria-label="Earlier expiry"[^>]*disabled=""/.test(h)) throw new Error("‹ is disabled at the first expiry");
  if (/aria-label="Later expiry"[^>]*disabled=""/.test(h)) throw new Error("› is not");
});
check("TWO LEGS: a blue point each, a row each with − / + / Sell-Buy / remove, the card named and priced as a model", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf(SPREAD)} />);
  eq(count(h, "data-lab-point="), 2, "one blue point per leg");
  eq(count(h, 'role="slider"'), 2);
  has(h, 'aria-label="Long 340 put: drag"'); has(h, 'aria-valuenow="340"');
  eq(count(h, "data-learn-leg="), 2);
  has(h, "Long 340 put"); has(h, "Short 361 put"); has(h, ">Sell<"); has(h, ">Buy<");
  has(h, 'aria-label="Lower strike: Long 340 put"'); has(h, 'aria-label="Remove: Short 361 put"');
  has(h, 'data-learn-card="bull-put"'); has(h, ">Bull put spread<"); has(h, LEARN_WORDS.defined);
  has(h, "model price"); has(h, "Collects"); has(h, "Breakeven"); has(h, "Needs GLD above");
  has(h, 'data-learn-figure="bull-put" aria-pressed="true"', "the gallery card of the figure on the lab is marked");
  has(h, LEARN_WORDS.drag);
});
check("A SOLD CALL ALONE: amber line, the app never sends it, max loss unlimited — and nothing on the screen sends", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf([{ side: -1, type: "call", strike: 390, qty: 1 }])} />);
  has(h, 'data-learn-risk="warn"'); has(h, LEARN_WORDS.neverSent); has(h, ">unlimited<");
  for (const w of [">Send", "Send limit", "Send to Alpaca", "Review order", "Close at limit"]) hasNot(h, w);
});
check("THE STATES: loading, and a chain that did not arrive (with Retry); the lab's tabs wait for a board", () => {
  const load = renderToStaticMarkup(<LearnScreen v={vOf([], { status: { text: LEARN_WORDS.loading("GLD") } })} />);
  has(load, "Loading GLD option prices…"); hasNot(load, "data-learn-tabs"); hasNot(load, ">Retry<");
  const fail = renderToStaticMarkup(<LearnScreen v={vOf([], { status: { text: LEARN_WORDS.noChain("GLD"), retry: noop } })} />);
  has(fail, "GLD&#x27;s option prices did not arrive."); has(fail, ">Retry<");
  const full = renderToStaticMarkup(<LearnScreen v={vOf(SPREAD, { full: LEARN_WORDS.maxLegs(4) })} />);
  has(full, "data-learn-full"); has(full, "4 legs at most");
});
check("ON A COMPUTER: two columns — the lab left, the card and the gallery right; on a phone one column", () => {
  const w = renderToStaticMarkup(<LearnScreen v={vOf(SPREAD, { wide: true })} />);
  has(w, 'data-learn-cols="2"'); has(w, 'data-learn-col="lab"'); has(w, 'data-learn-col="cards"');
  if (w.indexOf('data-learn-col="lab"') > w.indexOf('data-learn-col="cards"')) throw new Error("the lab comes first");
  has(renderToStaticMarkup(<LearnScreen v={vOf(SPREAD)} />), 'data-learn-cols="1"');
});
check("THE PICTURE: cut from payoffBands — a breakeven per crossing, today's price; the gallery's small one has no point", () => {
  const b = payoffBands({ legs: SPREAD, entryNet: -2, spot: 377.2, lo: 290, hi: 470 });
  const h = renderToStaticMarkup(<FigureChart bands={b} legs={SPREAD} spot={377.2} />);
  eq(count(h, 'aria-label="breakeven"'), b.breakevens.length); has(h, "today 377.20");
  const t = renderToStaticMarkup(<FigureChart compact bands={b} spot={377.2} width={84} height={44} />);
  has(t, 'data-figure-chart="thumb"'); hasNot(t, 'role="slider"'); hasNot(t, "today 377", "no words on the small picture");
  // No legs yet: an axis with today's price, nothing to drag.
  hasNot(renderToStaticMarkup(<FigureChart bands={null} legs={[]} spot={377.2} />), 'role="slider"');
});

/* ================================================================ PR 76: THE PICTURE'S READINGS (they need payoffBands) */
console.log("\nPR 76 — Learn's picture: the curves, the extremes, the market, rendered\n");
const test = (name, fn) => check(name, fn);
const L = (side, type, strike, qty = 1) => ({ side, type, strike, qty });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
/** A board shaped like GLD's on 20 Oct 2026 (learn.test.js's): 1-point strikes 320–440, the puts listing fewer above. */
function chainOf({ step = 1, lo = 320, hi = 440, putsTop = 420, spot = 377.2, ivAt = (k) => 0.2 + Math.abs(k - 377) / 2000 } = {}) {
  const calls = {}, puts = {};
  for (let k = lo; k <= hi + 1e-9; k += step) {
    const kk = Math.round(k * 100) / 100;
    calls[kk] = { bid: 1, ask: 1.2, mid: 1.1, iv: ivAt(kk) };
    if (kk <= putsTop) puts[kk] = { bid: 1, ask: 1.2, mid: 1.1, iv: ivAt(kk) };
  }
  // Out-of-the-money quotes shaped like prices (the market's distribution needs a real-looking board).
  for (const [k, q] of Object.entries(calls)) { const v = Math.max(0.05, bs(spot, +k, 38 / 365, q.iv, "call")); q.bid = +(v * 0.97).toFixed(2); q.ask = +(v * 1.03 + 0.01).toFixed(2); }
  for (const [k, q] of Object.entries(puts)) { const v = Math.max(0.05, bs(spot, +k, 38 / 365, q.iv, "put")); q.bid = +(v * 0.97).toFixed(2); q.ask = +(v * 1.03 + 0.01).toFixed(2); }
  return { spot, expirations: ["2026-10-21", "2026-11-27", "2026-12-18"],
    byExp: { "2026-10-21": { dte: 0, calls, puts }, "2026-11-27": { dte: 38, calls, puts }, "2026-12-18": { dte: 59, calls, puts } } };
}
const condorOn = (ch, exp = "2026-11-27") => labFigureLegs("iron-condor", { board: boardStrikes(ch, exp), spot: ch.spot, sd: labExpectedMove(ch, exp) });
const modelOf = (legs, ch = chainOf(), exp = "2026-11-27") => labModel({ ticker: "GLD", chain: ch, expKey: exp, legs, bandsOf: payoffBands });

test("76.1 TODAY AND THE EXIT DATE: each leg's own IV (legsAt), today zero at today's price, the exit the plan's 21 days (Build's exitCurve)", () => {
  const ch = chainOf(), legs = condorOn(ch), m = modelOf(legs, ch);
  const c = labCurves(m, ch);
  assert.equal(c.exitDTE, exitPlanOf({}).exitDTE); assert.equal(c.exitDTE, RULES.exitDTE, "Learn has no trade: the default plan");
  assert.equal(c.exitDay, "2026-11-06", "27 Nov less 21 days"); assert.equal(labExitDay("2026-11-27", 21), "2026-11-06");
  assert.equal(c.today.length, m.bands.samples.length); assert.equal(c.exit.length, m.bands.samples.length);
  const ivs = legs.map((l) => legIv(ch, "2026-11-27", l));
  const s = m.bands.samples[90].s;
  near(c.today[90].pnl, (legsAt(legs, s, 38, ivs).value - m.net) * 100, 1e-9, "today is legsAt on each leg's own IV");
  near(c.exit[90].pnl, (legsAt(legs, s, 21, ivs).value - m.net) * 100, 1e-9, "the exit is legsAt with 21 days left");
  near((legsAt(legs, ch.spot, 38, ivs).value - m.net) * 100, 0, 1e-9, "today's P&L at today's price is zero: the premiums are these prices");
  // Inside the exit window: no exit curve, and the legend says why.
  const short = chainOf(); short.byExp["2026-11-27"].dte = 15;
  const ci = labCurves(modelOf(condorOn(short), short), short);
  assert.equal(ci.exit, null); assert.equal(ci.inside, true); assert.ok(ci.today);
  assert.deepEqual(labLegend(ci).map((e) => e.text), [LEARN_WORDS.legendExpiry, LEARN_WORDS.legendToday, LEARN_WORDS.legendExitInside(21)]);
  assert.deepEqual(labLegend(c).map((e) => e.text), ["At expiry", "Today", "Exit date, 6 Nov (21 days before expiry)"]);
  // A leg with no IV: no model price, no curve — never a guess.
  const holed = chainOf(); holed.byExp["2026-11-27"].calls[legs[3].strike] = { bid: 1, ask: 1.2, mid: 1.1, iv: null };
  const ch2 = labCurves(modelOf(legs, holed), holed);
  assert.equal(ch2.today, null); assert.equal(ch2.exit, null);
  assert.deepEqual(labLegend(ch2).map((e) => e.drawn), [true, false], "the legend says today and the exit need a model price on every leg");
});
test("76.1 THE CROSSHAIR'S SENTENCE: at a price, the P&L at expiry (the payoff) and today (legsAt), signed", () => {
  const ch = chainOf(), legs = condorOn(ch), m = modelOf(legs, ch), c = labCurves(m, ch);
  const at = 377.2;
  const today = (legsAt(legs, at, 38, c.ivs).value - m.net) * 100;
  assert.equal(labReadout(m, c, at), LEARN_WORDS.readout(at, m.bands.at(at), today));
  assert.match(labReadout(m, c, at), /^at 377\.20 → \+\$\d+ at expiry · [+-]?\$\d/);
  const holed = chainOf(); holed.byExp["2026-11-27"].calls[legs[3].strike].iv = null;
  assert.equal(labReadout(modelOf(legs, holed), null, 380), LEARN_WORDS.readoutNoPrice(380), "no model price: no P&L, said");
});
test("76.1 MAX PROFIT AND LOSS ON THE PICTURE are the card's (exactExtremes), written over their flat, or at the edge", () => {
  const ch = chainOf();
  const condor = modelOf(condorOn(ch), ch);
  const e = labExtremes(condor);
  const p = e.find((x) => x.id === "profit"), l = e.find((x) => x.id === "loss");
  assert.equal(p.pnl, condor.maxProfit); assert.equal(p.text, LEARN_WORDS.chartProfit(condor.maxProfit)); assert.equal(p.edge, null);
  const [, sp, sc] = condorOn(ch).map((x) => x.strike);
  assert.ok(p.s > sp && p.s < sc, "the best case is written between the sold strikes, over the flat");
  assert.equal(l.pnl, condor.maxLoss); assert.equal(l.text, `max loss $${Math.round(Math.abs(condor.maxLoss)).toLocaleString("en-US")}`);
  const call = labExtremes(modelOf([L(-1, "call", 390)], ch));
  assert.deepEqual(call.find((x) => x.id === "loss"), { ...call.find((x) => x.id === "loss"), edge: "right", text: "max loss: unlimited" });
  assert.equal(labExtremes(modelOf([L(1, "call", 390)], ch)).find((x) => x.id === "profit").text, `max profit: ${NO_CEILING}`);
  const put = modelOf([L(1, "put", 370)], ch);
  const pp = labExtremes(put).find((x) => x.id === "profit");
  assert.equal(pp.edge, "left"); assert.equal(pp.text, LEARN_WORDS.chartProfit(put.maxProfit, true), "a long put's best case is at a price of 0");
  assert.match(pp.text, /at price \$0$/);
  assert.deepEqual(labExtremes(modelOf([L(1, "call", 380), L(-1, "call", 380)], ch)), [], "legs that cancel: nothing to write");
});
test("76.1 THE MARKET'S BAND AND CHANCE: the PR 67 distribution cut to the picture; the chance at the model net, said; not read is said", () => {
  const ch = chainOf(), m = modelOf(condorOn(ch), ch);
  const dist = impliedDistribution(ch.byExp["2026-11-27"], ch.spot, { minQuotes: RULES.impliedMinQuotes });
  assert.ok(dist.ok);
  const band = labDensity(dist, m.bands.lo, m.bands.hi);
  assert.ok(band.length > 3 && band.every((g) => g.lo >= m.bands.lo && g.hi <= m.bands.hi && g.w > 0 && g.w <= 1));
  assert.equal(Math.max(...band.map((g) => g.w)), 1, "the densest segment is the darkest");
  const line = labMarketLine(m, dist);
  assert.equal(line.pop, marketChanceOf({ dist, legs: m.legs, entryNet: m.net }).pop, "marketChanceOf at the lab's MODEL net");
  assert.match(line.text, /^Market chance of profit at expiry: \d+%, at the model price\.$/);
  assert.equal(labMarketLine(m, null).text, MARKET_CHANCE_NOT_READ.noBoard);
  assert.equal(labMarketLine(m, { ok: false, reason: "few" }).text, MARKET_CHANCE_NOT_READ.few, "a board too thin to read: said, never invented");
  assert.deepEqual(labDensity({ ok: false }, 1, 2), []); assert.deepEqual(labDensity(null, 1, 2), []);
});
check("76.1 THE PICTURE READS LIKE IBKR'S: a dollar scale, prices along the bottom, three curves and their legend, the extremes, the market", () => {
  const condor = labGallery({ ticker: "GLD", chain: CHAIN, expKey: EXP }).find((g) => g.id === "iron-condor").legs;
  const v = vOf(condor);
  const h = renderToStaticMarkup(<LearnScreen v={v} />);
  has(h, "data-lab-yaxis"); has(h, ">$0<"); if (!/>[+-]\$\d/.test(h)) throw new Error("the dollar scale has figures either side of $0");
  has(h, "data-lab-xaxis");
  for (const c of ["expiry", "today", "exit"]) has(h, `data-lab-curve="${c}"`);
  for (const e of v.chart.legend) has(h, `data-learn-legend-item="${e.id}"`);
  has(h, "Exit date, 6 Nov (21 days before expiry)");
  has(h, 'data-lab-extreme="profit"'); has(h, 'data-lab-extreme="loss"'); has(h, v.chart.extremes[0].text);
  has(h, "data-lab-density"); has(h, v.chart.market.text.replace(/'/g, "&#x27;")); has(h, "The band");
  // No leg: no dollar scale (nothing to scale), no curve, no legend, no market line.
  const e = renderToStaticMarkup(<LearnScreen v={vOf([])} />);
  hasNot(e, ">$0<"); hasNot(e, "data-lab-curve"); hasNot(e, "data-learn-legend"); hasNot(e, "data-learn-market-chance");
});
check("76.2 A FINGER'S TARGETS: each point holds the page still (touch-action none, a ≥44px band along its guide); the picture itself still scrolls", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf(SPREAD)} />);
  if (!/data-figure-chart="lab"[^>]*touch-action:pan-y/.test(h)) throw new Error("the picture keeps pan-y: the page scrolls over it");
  eq(count(h, "data-lab-zone="), 2, "one band per leg");
  for (const m of h.matchAll(/<rect data-lab-zone="\d+"[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"[^>]*style="touch-action:none"/g)) {
    if (Number(m[1]) < 44) throw new Error(`a band ${m[1]}px wide`);
    if (Number(m[2]) < 150) throw new Error(`a band ${m[2]}px tall: it runs the guide's length`);
  }
  eq((h.match(/<rect data-lab-zone="\d+"[^>]*style="touch-action:none"/g) || []).length, 2, "both bands say touch-action none");
  eq((h.match(/data-lab-point="\d"[^>]*style="[^"]*touch-action:none/g) || []).length, 2, "so do the points");
  // Two legs on one strike: two points, two bands, side by side.
  const fly = labGallery({ ticker: "GLD", chain: CHAIN, expKey: EXP }).find((g) => g.id === "iron-fly").legs;
  const f = renderToStaticMarkup(<LearnScreen v={vOf(fly)} />);
  eq(count(f, "data-lab-zone="), 4); eq(count(f, "data-lab-dot"), 4);
  const src = readFileSync("src/visuals.jsx", "utf8");
  has(src, 'el.addEventListener("touchstart", onStart, { passive: false })', "Chromium ignores touch-action inside an svg: the touch is cancelled by hand");
  has(src, "navigator.vibrate(5)"); has(src, "labDragTo"); hasNot(src.slice(src.indexOf("function FigureLab")), "clientY - r.top) / r.height) * H };\n    if (onMove)", "");
});
check("76.3 A LEG IS NAMED THE WAY IBKR WRITES IT, with the chain's OCC symbol and Copy; no symbol listed, nothing said", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf(SPREAD)} />);
  has(h, "Long GLD Nov27&#x27;26 340 Put"); has(h, "Short GLD Nov27&#x27;26 361 Put");
  has(h, "GLD261127P00361000"); has(h, 'aria-label="Copy GLD261127P00361000"');
  eq(count(h, "data-contract-occ="), 1, "one symbol: the 340 put's listing gave none, and none is built");
  hasNot(h, "no OCC symbol", "nothing is said where there is no symbol (owner: say nothing)");
});
check("76.4 LEARN'S MARKET as IBKR lists it: the chip 'GLD · ARCA', the official name under it; the ticker alone when not read", () => {
  const h = renderToStaticMarkup(<LearnScreen v={vOf([])} />);
  has(h, "GLD · ARCA"); has(h, "SPDR GOLD TRUST"); has(h, "data-listing-name");
  const n = renderToStaticMarkup(<LearnScreen v={vOf([], { listingOf: () => null })} />);
  hasNot(n, "ARCA"); hasNot(n, "data-listing-name");
  has(readFileSync("src/learn.jsx", "utf8"), "<Info label={LISTING_SEARCH_LABEL}>{listingSearchInfo(v.ticker, getU(v.ticker).name)}</Info>", "the sheet's ⓘ");
});

check("HOW MUCH THERE IS TO READ (the owner's question): rendered words at rest, empty and with an iron condor, under their ceilings", () => {
  /* Measured on these fixtures when Learn was built (PR 74; PR 76's, above the ceilings): 313 words with no leg, 379 with the iron condor loaded —
     almost all of it the gallery's fourteen one-line ideas (LAB_FIGURES), which the source counter in wordcount.mjs
     does not read because they are data. The ceilings are those numbers, so the next word fails the build. */
  const condor = labGallery({ ticker: "GLD", chain: CHAIN, expKey: EXP }).find((g) => g.id === "iron-condor").legs;
  const empty = renderedWords(renderToStaticMarkup(<LearnScreen v={vOf([])} />));
  const full = renderedWords(renderToStaticMarkup(<LearnScreen v={vOf(condor)} />));
  console.log(`       rendered: ${empty} words with no leg, ${full} with the iron condor`);
  if (empty > LEARN_CEILING.empty) throw new Error(`no leg: ${empty} words against ${LEARN_CEILING.empty}`);
  if (full > LEARN_CEILING.condor) throw new Error(`iron condor: ${full} words against ${LEARN_CEILING.condor}`);
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
