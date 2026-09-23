// ============================================================================
// src/figures.test.jsx — ONE CANDIDATE, ONE SET OF NUMBERS (PR #40, TASK 0).
//
// The owner's live screens, SOYB 28/30C 2026-11-20: the list card said $62
// risk / $139 profit / 48% chance "read at the price that fills"; Build said
// $68 / $132 / 46%; the card's break-even 28.68 against the chart's 28.61; the
// exit plan "$66 of profit" beside "$924 of $1,848"; and between them Build
// printed "✓ Same numbers as the Shortlist".
//
// This runs the REAL two paths — `listCardFigures()` (every card on the list)
// and `buildFigures()` (the Build screen, the gate and the ticket) — on one
// candidate of that shape and holds every printed figure equal: risk, profit,
// price, chance, break-even, the picture's break-even, the exit plan, the
// rendered card and the trade card.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { listCardFigures, buildFigures } from "./App.jsx";
import { CandidateCard } from "./card.jsx";
import { exitPlanDetail } from "./visuals.jsx";
import { reconcileFigures, figureSet, tradeCard, money, chanceText, seasonalProvenance,
  RULES, fillNet, netFromLegs, sizeLine, requestOf } from "./rules.js";
import { shortlistWithFloors } from "./App.jsx";
import { scaleStrategy } from "./pro.jsx";
// Repo-relative: JSX tests are bundled to CJS (CLAUDE.md, "How to test").
import { MODEL_BOARD, ungBoards } from "../scripts/crossing-fixtures.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 160)}"`); };

/* ---- the fixture: the SOYB 28/30C shape, quotes as the indicative feed gives them ---- */
const SPOT = 27.9, DTE = 58, IV = 0.22, TICKER = "SOYB", EXP = "2026-11-20";
const LEGS = [
  { side: 1, qty: 1, type: "call", strike: 28 },
  { side: -1, qty: 1, type: "call", strike: 30 },
];
// Deliberately wide and uneven, so the mid, the fill and a per-leg rounding
// of the fill are three different numbers — the case that broke on the phone.
const QUOTES = {
  28: { bid: 0.93, ask: 1.18, mid: 1.055, iv: 0.23, oi: 400, occ: "SOYB261120C00028000" },
  30: { bid: 0.40, ask: 0.57, mid: 0.485, iv: 0.22, oi: 300, occ: "SOYB261120C00030000" },
};
const q = (leg) => QUOTES[leg.strike] || null;
const SEASONAL = seasonalProvenance(
  { monthlyMean: [0.5, 0.2, -0.1, 0.4, 0.8, 1.1, -0.6, -1.2, 0.3, 0.9, 0.6, 0.1], years: 11, src: "Alpha Vantage", at: Date.now() },
  null, TICKER);
const OPTS = { spot: SPOT, dte: DTE, iv: IV, q, ticker: TICKER, expKey: EXP, seasonal: SEASONAL };

const list = listCardFigures(LEGS, OPTS);
const build = buildFigures(LEGS, OPTS);   // nothing typed in the ticket

check("the fixture really separates the mid from the fill (or it proves nothing)", () => {
  if (Math.abs(list.a.entry - list.aFill.entry) < 0.02) throw new Error("mid and fill are the same price");
  eq(list.aFill.entrySource, "limit", "the card reads a price, not the mid");
});

check("THE PRICE: card and Build read fillNet(), to the cent, and the ticket's legs sum to it", () => {
  const fill = fillNet(LEGS, [QUOTES[28], QUOTES[30]]);
  eq(+list.aFill.entry.toFixed(4), +fill.toFixed(4), "the card");
  eq(+build.AE.entry.toFixed(4), +fill.toFixed(4), "Build");
  eq(+netFromLegs(LEGS, build.seedPx).net.toFixed(4), +fill.toFixed(4), "the ticket's seeded legs");
});

check("RISK, PROFIT, CHANCE, BREAK-EVEN: every figure identical on the list card and on Build", () => {
  const r = reconcileFigures(list.figures, build.figures);
  for (const row of r.rows) eq(row.build, row.card, `${row.k}`);
  eq(r.same, true, "the reconciliation says same");
  has(r.line, "per contract");
  eq(list.pop, build.chance.pop, "one seeded Monte Carlo, one chance");
});

check("THE CHART: the picture's break-even is the card's and Build's", () => {
  const pic = list.bands.breakevens.map((b) => b.toFixed(2)).join(" · ");
  eq(pic, list.aFill.breakevens.map((b) => b.toFixed(2)).join(" · "), "the card's picture");
  eq(pic, build.AE.breakevens.map((b) => b.toFixed(2)).join(" · "), "Build's chart (AE.breakevens / AE.curve)");
});

check("THE EXIT PLAN: one figure, and it says its unit — per contract, or for N", () => {
  const half = money(RULES.takeProfitPct * list.aFill.maxProfit);
  const card1 = tradeCard({ ticker: TICKER, maxLoss: build.AE.maxLoss, maxProfit: build.AE.maxProfit,
    breakevens: build.AE.breakevens, contracts: 1, chance: build.chance, dte: DTE });
  const exits1 = card1.lines.find((l) => l.id === "exits").text;
  has(exits1, `${half} of ${money(list.aFill.maxProfit)} per contract`);
  has(exitPlanDetail(list.aFill.maxProfit, 1), `${half} of profit per contract`);
  // Fourteen: both say "for 14" and both print the same total.
  const card14 = tradeCard({ ticker: TICKER, maxLoss: build.AE.maxLoss, maxProfit: build.AE.maxProfit,
    breakevens: build.AE.breakevens, contracts: 14, chance: build.chance, dte: DTE });
  const half14 = money(RULES.takeProfitPct * build.AE.maxProfit * 14);
  has(card14.lines.find((l) => l.id === "exits").text, `${half14} of ${money(build.AE.maxProfit * 14)} for 14`);
  has(exitPlanDetail(build.AE.maxProfit, 14), `${half14} of profit for 14`);
  has(card14.lines.find((l) => l.id === "risk").text, `${money(Math.abs(build.AE.maxLoss) * 14)} for 14`);
});

check("THE RENDERED CARD prints the same risk, profit and chance, and says per contract", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C / −1 30C" rr={list.rr} pop={list.pop}
      profit={list.aFill.maxProfit} risk={list.aFill.maxLoss} bands={list.bands} ticker={TICKER} />);
  has(html, money(Math.abs(build.AE.maxLoss)));
  has(html, money(build.AE.maxProfit));
  has(html, chanceText(build.chance.pop));
  has(html, "PER CONTRACT");
});

check("…and a price moved in the ticket is SAID, figure by figure, never 'same'", () => {
  const typed = buildFigures(LEGS, { ...OPTS, legPx: [QUOTES[28].ask, QUOTES[30].bid] });
  const r = reconcileFigures(list.figures, typed.figures);
  eq(r.same, false, "a different price is not the same numbers");
  for (const k of ["price", "risk", "profit", "break-even"]) {
    if (!r.rows.find((x) => x.k === k && !x.same)) throw new Error(`${k} should have moved`);
  }
  has(r.line, "risk");
  eq(reconcileFigures(figureSet(list.aFill, list.pop), figureSet(list.aFill, list.pop)).same, true, "same is same");
});

/* ====================================================================
   PR #41, TASK 1 — A CARD'S SIZE MATCHES ITS RISK.

   The owner's live Find screen, SLV Bearish Put Butterfly +1 58P / −2 55P /
   +1 51P, 2026-11-20: "RISK $143" per contract and "6 contracts for $258".
   6 × $143 is $858 against a $300 limit. The wings are 3 and 4 wide, so the
   worst case is the $43 premium PLUS the extra $1 of width: `scaleStrategy()`
   divided the budget by the premium, and `sizeLine()` printed the premium
   total. Both read the maximum loss now — the figure the card prints as RISK.
==================================================================== */
const SLV_LEGS = [
  { side: 1, qty: 1, type: "put", strike: 58 },
  { side: -1, qty: 2, type: "put", strike: 55 },
  { side: 1, qty: 1, type: "put", strike: 51 },
];
// Quotes chosen so the fill lands on the owner's $0.43 (a synthetic board,
// not a capture: the owner read the card, not the chain).
const SLV_Q = {
  58: { bid: 4.17, ask: 4.23, mid: 4.20, iv: 0.30, oi: 900, occ: "SLV261120P00058000" },
  55: { bid: 2.39, ask: 2.42, mid: 2.405, iv: 0.30, oi: 900, occ: "SLV261120P00055000" },
  51: { bid: 0.99, ask: 1.02, mid: 1.005, iv: 0.31, oi: 900, occ: "SLV261120P00051000" },
};
const slv = listCardFigures(SLV_LEGS, { spot: 55.4, dte: 58, iv: 0.30, q: (l) => SLV_Q[l.strike] || null,
  ticker: "SLV", expKey: EXP, seasonal: null });

check("THE SLV BUTTERFLY: $43 of premium is $143 at risk, and the card prints $143", () => {
  eq(+Math.abs(slv.aFill.entry * 100).toFixed(2), 43, "the premium at the fill");
  eq(Math.round(Math.abs(slv.aFill.maxLoss)), 143, "the worst case: premium + the $1 of extra wing");
  const html = renderToStaticMarkup(<CandidateCard name="SLV · Bearish Put Butterfly" legs="+1 58P / −2 55P / +1 51P"
    rr={slv.rr} pop={null} profit={slv.aFill.maxProfit} risk={slv.aFill.maxLoss} bands={slv.bands} ticker="SLV" />);
  has(html, "$143");
});

check("…and $300 buys 2 of them for $286 — contracts × risk = the total, never 6 for $258", () => {
  const req = requestOf({ amt: 300 }, {});
  const size = scaleStrategy(slv.aFill, req.mode, req.amt);
  eq(size.n, 2, "floor(300 / 143)");
  const line = sizeLine(req, size);
  eq(line, `2 contracts for ${money(2 * 143)}`, "the card's size line");
  if (size.totRisk > req.amt) throw new Error(`${money(size.totRisk)} over the $300 typed`);
  const html = renderToStaticMarkup(<CandidateCard name="SLV" legs="x" rr={slv.rr} pop={null}
    profit={slv.aFill.maxProfit} risk={slv.aFill.maxLoss} size={line} />);
  has(html, "2 contracts for $286");
});

/* EVERY STRUCTURE FAMILY THE FIXTURE BOARDS PRODUCE, EVERY SENTIMENT, FOUR
   AMOUNTS: contracts × the card's RISK is the sized total, and the total never
   passes what the owner typed. */
check("EVERY FAMILY ON THE FIXTURES: contracts × card risk == the sized total, and total ≤ amount typed", () => {
  const families = new Set();
  let sized = 0;
  const cards = [{ name: "Bearish Put Butterfly (SLV, asymmetric)", aFill: slv.aFill }];
  for (const b of [MODEL_BOARD, ...ungBoards()]) {
    for (const sent of ["verybear", "bear", "neutral", "bull", "verybull"]) {
      const r = shortlistWithFloors(sent, b.S, b.step, b.strikes, b.dte, b.iv, b.q, { peers: b.peers });
      for (const row of r.rows) cards.push({ name: row.p.name, aFill: row.aFill });
    }
  }
  for (const c of cards) {
    families.add(c.name);
    const risk = Math.abs(c.aFill.maxLoss);
    for (const amt of [100, 300, 500, 1000]) {
      const req = requestOf({ amt }, {});
      const size = scaleStrategy(c.aFill, req.mode, req.amt);
      if (!size || !size.ok) continue;
      sized++;
      if (Math.abs(size.n * risk - size.totRisk) > 1e-6) throw new Error(`${c.name}: ${size.n} × ${risk} ≠ ${size.totRisk}`);
      if (size.totRisk > amt + 1e-9) throw new Error(`${c.name}: ${money(size.totRisk)} at risk on ${money(amt)} typed`);
      // A debit's premium is paid, so it cannot pass the amount either; a credit's is received.
      if (!size.isCredit && Math.abs(c.aFill.entry) * 100 * size.n > amt + 1e-9) throw new Error(`${c.name}: premium over ${money(amt)}`);
      // The two printed figures multiply, as printed.
      eq(sizeLine(req, size), `${size.n} contract${size.n === 1 ? "" : "s"} for ${money(size.n * Math.round(risk))}`, c.name);
    }
  }
  if (sized < 20) throw new Error(`only ${sized} sized cards: the sweep proves little`);
  for (const f of ["Butterfly", "Spread"]) {
    if (![...families].some((n) => n.includes(f))) throw new Error(`no ${f} on the fixtures: ${[...families].join(", ")}`);
  }
  console.log(`       ${cards.length} cards, ${sized} sized, families: ${[...families].join(", ")}`);
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
