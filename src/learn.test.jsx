// src/learn.test.jsx — PR 74, rendered: Learn, the figure lab. The four tabs, one blue point per leg on the picture,
// − / + / Buy-Sell / remove on each leg, the figure's card (and the line under a sold option alone), the gallery's 14
// cards, the market sheet, the states, the two columns on a computer — and no Send anywhere on it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LearnScreen } from "./learn.jsx";
import { FigureChart, payoffBands } from "./visuals.jsx";
import { LAB_TABS, LAB_FIGURES, LEARN_WORDS, labLegText } from "./rules.js";
import { labModel, labCard, labLegRows, labGallery, labExpiry } from "./learnView.js";
import { boardStrikes } from "./chain.js";
import { renderedWords } from "./wordcount.mjs";

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
  byExp: { "2026-11-27": { dte: 38, calls: side, puts: side }, "2026-12-18": { dte: 59, calls: side, puts: side } } };
const EXP = labExpiry(CHAIN), BOARD = boardStrikes(CHAIN, EXP);
const noop = () => {};

function vOf(legs, extra = {}) {
  const m = labModel({ ticker: "GLD", chain: CHAIN, expKey: EXP, legs, bandsOf: payoffBands });
  return {
    wide: false, ticker: "GLD", markets: ["CORN", "GLD", "SLV"], onMarket: noop, where: "GLD · 27 Nov · 38 days",
    canPrevExp: false, canNextExp: true, onExpiry: noop, status: null,
    tabs: LAB_TABS.map((t) => ({ id: t.id, label: t.label, onAdd: noop })), full: null,
    chart: { bands: m.bands, legs, spot: 377.2, onMove: noop, onStep: noop, label: (i) => `${labLegText(legs[i])}: drag` },
    legs: labLegRows(m, BOARD).map((r) => ({ ...r, onMinus: noop, onPlus: noop, flipLabel: r.side === "long" ? "Sell" : "Buy", onFlip: noop, onRemove: noop })),
    card: labCard(m), onClear: noop,
    gallery: labGallery({ ticker: "GLD", chain: CHAIN, expKey: EXP, bandsOf: payoffBands })
      .map((g) => ({ id: g.id, name: g.name, idea: g.idea, bands: g.model.bands, spot: 377.2, current: m.figure.id === g.id, onLoad: noop })),
    ...extra,
  };
}
const LEARN_CEILING = { empty: 313, condor: 379 };
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

check("HOW MUCH THERE IS TO READ (the owner's question): rendered words at rest, empty and with an iron condor, under their ceilings", () => {
  /* Measured on these fixtures when Learn was built (PR 74): 313 words with no leg, 379 with the iron condor loaded —
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
