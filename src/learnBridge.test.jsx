// src/learnBridge.test.jsx — PR 78 (owner, 20 Oct 2026): from Learn to the real chain, Build and Optimize.
//
// Learn sends nothing: its doors are the market page's Chain tray and `buildHandOff()`. What these check: "Build this"
// hands Build the same legs, which Build then prices at the market's bid and ask (the card's own path, `readAlternative()`);
// an iron condor DRAWN with PR 77's recognition reaches Build and passes the gate on a fixture chain; a figure the app never
// sends offers only its defined-risk version; Optimize runs on a trade from Learn as on any other; and, read off the source,
// Learn's only way to Build is `openOnBuild()` → `buildHandOff()`.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { LearnScreen } from "./learn.jsx";
import { payoffBands } from "./visuals.jsx";
import { readAlternative } from "./App.jsx";
import { labModel, labBridge, labGallery, labExpiry, labExpectedMove } from "./learnView.js";
import { recogniseDrawing } from "./learnDraw.js";
import { buildHandOff, tradeKey } from "./handoff.js";
import { boardStrikes } from "./chain.js";
import { optimizeCandidates } from "./alternatives.js";
import { evaluateTrade } from "./riskGate.js";
import { bs } from "./engine.js";
import { LEARN_WORDS, LAB_TABS, learnPriceLine, figureOf, requestOf } from "./rules.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s, m) => { if (!h.includes(s)) throw new Error(`${m || "missing"}: ${JSON.stringify(s)}`); };
const hasNot = (h, s, m) => { if (h.includes(s)) throw new Error(`${m || "unexpected"}: ${JSON.stringify(s)}`); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const near = (a, b, tol, m) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${m}: ${a} vs ${b}`); };

console.log("\nPR 78 — from Learn to the chain, Build and Optimize\n");

/* A GLD-shaped board with real-looking quotes on every strike: Black-Scholes on each strike's IV, a bid 3% under and an
   ask 3% over, the OCC symbol the chain lists. A fixture: every price here is worked out, none is a market's. */
const SPOT = 377.2, EXP = "2026-11-27", DTE = 38;
const occ = (type, k) => `GLD261127${type === "call" ? "C" : "P"}${String(Math.round(k * 1000)).padStart(8, "0")}`;
function chainOf({ widen = 0 } = {}) {
  const calls = {}, puts = {};
  for (let k = 320; k <= 440; k += 1) {
    const iv = 0.2 + Math.abs(k - 377) / 2000;
    for (const [book, type] of [[calls, "call"], [puts, "put"]]) {
      const v = Math.max(0.05, bs(SPOT, k, DTE / 365, iv, type));
      book[k] = { bid: +(v * (0.97 - widen)).toFixed(2), ask: +(v * (1.03 + widen) + 0.01).toFixed(2), mid: +v.toFixed(2), iv, oi: 500, occ: occ(type, k) };
    }
  }
  return { ticker: "GLD", spot: SPOT, expirations: [EXP], byExp: { [EXP]: { dte: DTE, calls, puts } } };
}
const CH = chainOf(), BOARD = boardStrikes(CH, EXP);
const PAPER = { account_number: "PA3XYZ01", paperVerified: true, paperSource: "paper-api.alpaca.markets" };
const gate = (proposal) => evaluateTrade({ proposal, portfolio: { positions: [], account: PAPER }, capital: { tradingCapital: 100000, concurrentTarget: 4 }, signals: null });
const REQUEST = requestOf({ amt: 2000 }, { answered: true, tradingCapital: 100000, concurrentTarget: 4, perTradeLimit: 5000, totalExposureLimit: 25000 });
const onBuild = (legs) => readAlternative({ kind: "learn", legs, expKey: EXP }, { chain: CH, ticker: "GLD", iv: 0.22, seasonal: null, request: REQUEST, gate, name: "Learn" });
const modelOf = (legs, ch = CH) => labModel({ ticker: "GLD", chain: ch, expKey: EXP, legs, bandsOf: payoffBands });
const condor = labGallery({ ticker: "GLD", chain: CH, expKey: labExpiry(CH) }).find((g) => g.id === "iron-condor").legs;

check("BUILD THIS → BUILD HOLDS THE SAME LEGS, priced at the market's bid and ask (not the model's): 'Model … → market …'", () => {
  const m = modelOf(condor);
  const br = labBridge(m, { board: BOARD, chain: CH });
  eq(br.kind, "build"); eq(br.name, "Iron condor"); eq(br.legs, condor, "the lab's legs, as they are");
  const h = buildHandOff({ ticker: "GLD", expKey: EXP, legs: br.legs, name: br.name, chains: { GLD: CH } });
  eq(h.legs, condor, "Build holds the same legs (the board is the same: nothing re-snapped)"); eq(h.moved, []); eq(h.name, "Iron condor");
  const a = onBuild(h.legs);
  if (!a || a.cut) throw new Error("priced on Build's path");
  if (Math.abs(a.entryNet - m.net) < 1e-6) throw new Error("the market's price is not the model's");
  // The market's price moves with the bid and ask; the model's does not (it reads only each strike's IV).
  const wide = chainOf({ widen: 0.2 });
  const aw = readAlternative({ kind: "learn", legs: h.legs, expKey: EXP }, { chain: wide, ticker: "GLD", iv: 0.22, seasonal: null, request: REQUEST, gate });
  if (aw.entryNet === a.entryNet) throw new Error("a wider book is a different market price");
  near(modelOf(condor, wide).net, m.net, 1e-12, "the model's price is the same on both");
  eq(learnPriceLine(-1.2, -1.35), "Model 1.20 → market 1.35 (credit)");
  eq(learnPriceLine(0.42, 0.45), "Model 0.42 → market 0.45 (debit)");
  eq(learnPriceLine(-0.1, 0.05), "Model 0.10 credit → market 0.05 debit", "each side said when they differ");
  // The line is shown only until the trade is edited: the key Build compares.
  eq(tradeKey(EXP, condor), tradeKey(EXP, [...condor].reverse()), "the same trade, legs in any order");
  if (tradeKey(EXP, condor) === tradeKey(EXP, condor.map((l, i) => (i ? l : { ...l, strike: l.strike - 1 })))) throw new Error("an edited leg is a different trade");
  if (tradeKey(EXP, condor) === tradeKey("2026-12-18", condor)) throw new Error("another expiry is a different trade");
  if (tradeKey(EXP, condor) === tradeKey(EXP, condor.map((l, i) => (i ? l : { ...l, side: -l.side })))) throw new Error("a flipped leg is a different trade");
  if (tradeKey(EXP, condor) === tradeKey(EXP, condor.map((l, i) => (i ? l : { ...l, qty: 2 })))) throw new Error("another quantity is a different trade");
});

check("AN IRON CONDOR DRAWN WITH A FINGER (PR 77) reaches Build and PASSES THE GATE on a fixture chain", () => {
  const netOf = (ls) => modelOf(ls).net;
  const truth = [{ side: 1, type: "put", strike: 340, qty: 1 }, { side: -1, type: "put", strike: 355, qty: 1 }, { side: -1, type: "call", strike: 400, qty: 1 }, { side: 1, type: "call", strike: 415, qty: 1 }];
  const net = netOf(truth);
  const pay = (x) => truth.reduce((a, l) => a + Math.sign(l.side) * (l.type === "call" ? Math.max(x - l.strike, 0) : Math.max(l.strike - x, 0)), 0) - net;
  const stroke = [];
  for (let x = 297, i = 0; x < 457; x += 1.3 + (i++ % 3) * 0.4) stroke.push({ s: x, v: 4.2 * (pay(x) + 0.25 * Math.sin(x)) });
  const rec = recogniseDrawing({ stroke, board: BOARD, spot: SPOT, lo: SPOT * 0.75, hi: SPOT * 1.25, netOf, sd: labExpectedMove(CH, EXP) });
  eq(rec.named, true); eq(rec.best.id, "iron-condor");
  const m = modelOf(rec.best.legs);
  const br = labBridge(m, { board: BOARD, chain: CH });
  eq(br.kind, "build");
  const h = buildHandOff({ ticker: "GLD", expKey: EXP, legs: br.legs, name: br.name, chains: { GLD: CH } });
  const a = onBuild(h.legs);
  if (!a || a.cut) throw new Error(`priced (${a && a.cut && a.cut.why})`);
  if (!a.gate.pass) throw new Error(`the gate refused: ${a.gate.violations.map((v) => v.message).join(" | ")}`);
  eq(figureOf(h.legs).id, "iron-condor");
});

check("A SHORT STRADDLE SHOWS ONLY THE DEFINED-RISK BUTTON: 'Build the defined-risk version', the wings it adds in one line", () => {
  const straddle = [{ side: -1, type: "call", strike: 377, qty: 1 }, { side: -1, type: "put", strike: 377, qty: 1 }];
  const m = modelOf(straddle);
  const br = labBridge(m, { board: BOARD, sd: labExpectedMove(CH, EXP), chain: CH });
  eq(br.kind, "defined"); eq(figureOf(br.legs).id, "iron-fly"); eq(br.name, "Iron butterfly");
  has(br.line, "Adds a bought "); has(br.line, " call and a bought "); has(br.line, " put: the wings cap the loss.");
  if (br.modelNet == null) throw new Error("the version's own model price travels to Build's line");
  const v = { wide: false, ticker: "GLD", markets: ["GLD"], onMarket: () => {}, where: "GLD · 27 Nov · 38 days", canPrevExp: false, canNextExp: false,
    onExpiry: () => {}, status: null, tabs: LAB_TABS.map((t) => ({ id: t.id, label: t.label, onAdd: () => {} })), full: null,
    chart: { bands: m.bands, legs: straddle, spot: SPOT, onMove: () => {}, onStep: () => {}, label: () => "leg" },
    legs: [], card: { name: "Short straddle", id: "short-straddle", risk: { tone: "warn", text: LEARN_WORDS.neverSent }, rows: [], needs: null, missing: [], where: "" },
    onClear: () => {}, gallery: [], bridge: { kind: br.kind, line: br.line, onChain: () => {}, onBuild: () => {} } };
  const h = renderToStaticMarkup(<LearnScreen v={v} />);
  has(h, 'data-learn-bridge="defined"'); has(h, LEARN_WORDS.buildDefined); has(h, LEARN_WORDS.openInChain); has(h, br.line);
  hasNot(h, `>${LEARN_WORDS.buildThis}<`, "no 'Build this' for a figure the app never sends");
  const def = renderToStaticMarkup(<LearnScreen v={{ ...v, card: { ...v.card, risk: { tone: "ok", text: LEARN_WORDS.defined } }, bridge: { kind: "build", line: null, onChain: () => {}, onBuild: () => {} } }} />);
  has(def, `>${LEARN_WORDS.buildThis}<`); hasNot(def, LEARN_WORDS.buildDefined);
  // Four legs already, one uncovered: no room for a wing — said, and nothing to build.
  const full = labBridge(modelOf([{ side: 1, type: "put", strike: 340, qty: 1 }, { side: 1, type: "put", strike: 350, qty: 1 }, { side: 1, type: "put", strike: 360, qty: 1 }, { side: -1, type: "call", strike: 400, qty: 1 }]), { board: BOARD, chain: CH });
  eq(full.kind, "none"); eq(full.legs, null); eq(full.line, LEARN_WORDS.noRoomWings);
  eq(labBridge(modelOf([]), { board: BOARD }), null, "no leg, no door");
});

check("OPTIMIZE WORKS ON A TRADE FROM LEARN EXACTLY AS ON ANY OTHER: the same search, priced on the card's path; Build keeps the section", () => {
  const cands = optimizeCandidates({ legs: condor, expKey: EXP, chain: CH, spot: SPOT, now: Date.parse("2026-10-20T12:00:00Z") });
  if (cands.length < 3) throw new Error(`only ${cands.length} candidates`);
  if (!cands.some((c) => c.loaded)) throw new Error("the trade from Learn is among them, as loaded");
  const priced = cands.slice(0, 6).map((c) => readAlternative(c, { chain: CH, ticker: "GLD", iv: 0.22, seasonal: null, request: REQUEST, gate }));
  if (!priced.every((p) => p && (p.cut || p.gate))) throw new Error("each read as a card");
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, 'optimize: buildOrigin && buildOrigin.kind === "roll" ? null : optimizeView', "only a roll turns Optimize off: a trade from Learn keeps it");
});

check("LEARN'S ONLY WAY TO BUILD IS buildHandOff(): its doors call openOnBuild() and the market page's tray, never a setter or an order", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  const doors = app.slice(app.indexOf("const labBr = labM ?"), app.indexOf("/* PR 77: A FIGURE DRAWN WITH A FINGER."));
  has(doors, "openOnBuild({ ticker: labTk, expKey: labExp, legs: labBr.legs, name: labBr.name,");
  has(doors, 'origin: { kind: "learn"'); has(doors, "goMarket(labTk, \"chain\"); setMktTray(");
  for (const no of ["setLegs(", "setTicker(", "setExpKey(", "evaluateTrade", "sendToAlpaca", "useTicketSend", "fetch(", "/api/"]) hasNot(doors, no, `Learn's doors must not ${no}`);
  const ob = app.slice(app.indexOf("const openOnBuild = ("), app.indexOf("const openOnBuild = (") + 400);
  has(ob, "buildHandOff(", "openOnBuild is buildHandOff");
  // Build says where the trade came from: back to Learn, and the model's price against the market's until it is edited.
  has(app, 'buildOrigin.kind === "learn" ? { label: LEARN_WORDS.backLabel, onClick: goLearn }');
  has(app, 'buildOrigin.tradeKey === tradeKey(expKey, legs) ? learnPriceLine(buildOrigin.modelNet, AE.entry) : null');
  has(app, "onBackToLearn={mktFromLearn ? goLearn : null}");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
