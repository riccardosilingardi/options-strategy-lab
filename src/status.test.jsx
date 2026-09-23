// ============================================================================
// src/status.test.jsx — SAY IT ONCE, SAY WHAT MATTERS FIRST (PR #40, TASK 2).
//
// 1. One status per object, one place. An order's state lives on its row in
//    Positions; the desk shows one line of COUNTS linking there. The desk used
//    to print the same order in a top banner, a working-orders strip, the
//    order sheet and Positions.
// 2. Stop signs: at most three short labels, from facts the app already
//    computes — no new rule and no new refusal.
// 3. News: one line per market.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { DeskCountLine } from "./steps.jsx";
import { StopSigns, CandidateCard } from "./card.jsx";
import { stopSigns, GATE_WARNING_LABELS, RULES, boardLooksStale, staleBoardLine } from "./rules.js";
import { monotonicityBreaks, invertedOnStrikes } from "./chain.js";
import { invertedTable } from "../scripts/inverted-fixtures.jsx";
import { newsLine } from "./signals.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}"`); };
const hasNot = (h, s) => { if (String(h).includes(s)) throw new Error(`should not contain "${s}"`); };
const count = (h, s) => String(h).split(s).length - 1;

// JSX tests are bundled to CJS, so sources are read by repo-relative path.
const APP = readFileSync("src/App.jsx", "utf8");
const code = APP.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

const ORDERS = [
  { id: 1, ref: "J-0003", ticker: "SOYB", name: "Bull Call Spread", alpacaStatus: "pending_cancel", alpacaId: "abc123" },
  { id: 2, ref: "J-0004", ticker: "XLE", name: "Bull Put Spread", alpacaStatus: "accepted", alpacaId: "def456" },
];

check("THE DESK LINE IS COUNTS ONLY — no ref, no status, no price, and it links to Positions", () => {
  const h = renderToStaticMarkup(<DeskCountLine working={ORDERS.length} decisions={1} looks={0} onOpen={() => {}} />);
  has(h, "2 orders working"); has(h, "1 position needs a decision"); has(h, "Positions");
  for (const o of ORDERS) { hasNot(h, o.ref); hasNot(h, o.alpacaStatus.toUpperCase().replace(/_/g, " ")); hasNot(h, o.alpacaId); }
  if (renderToStaticMarkup(<DeskCountLine working={0} decisions={0} looks={0} />) !== "") throw new Error("nothing to say is no line");
});

check("RENDERING THE DESK: an order's status is written in exactly one place — its Positions row", () => {
  // The rows that print an order's state: exactly one `workingOrders.map(`,
  // and it sits inside the Positions tab.
  eq(count(code, "workingOrders.map("), 1, "one list of working orders");
  const positions = code.slice(code.indexOf('tab === "positions" && !showSettings'));
  if (!positions.includes("workingOrders.map(")) throw new Error("the one list is not in Positions");
  eq(count(code, "WORKING AT THE BROKER"), 1, "one heading");
  hasNot(code, "ORDERS WORKING AT THE BROKER");  // the desk strip
  hasNot(code, "EVERYTHING IS ON PLAN");          // the desk's TODAY list
  has(code, "<DeskCountLine");
  // The order sheet prints its own outcome beside the button, and no longer
  // copies it into the top banner; the send's banner line only points.
  has(code, "setMsg={quietTicketMsg}");
  const openPaper = code.slice(code.indexOf("const openPaper"), code.indexOf("const COPILOT_LOG_MAX"));
  hasNot(openPaper, "r.outcome.headline");
  has(openPaper, "Its state is on its row in Positions");
});

check("STOP SIGNS: at most three, in the order that decides, from facts already computed", () => {
  const s = stopSigns({
    fused: { agreement: "CONFLICT", confidence: 21 },
    gateWarnings: [{ code: "SIGNAL_CONFLICT" }, { code: "ENTRY_DTE_ROOM" }],
    feedBroken: true, noQuoteLegs: 1, contracts: 14, askSize: 2,
    flags: [{ id: "single", label: "single option" }],
  });
  eq(s.labels.length, 3, "three shown");
  eq(s.labels[0].label, "CONFLICT · confidence 21", "the owner's own example, first");
  eq(s.labels[1].label, GATE_WARNING_LABELS.ENTRY_DTE_ROOM(), "the gate's warning, once, as a label");
  eq(s.labels[2].label, "inverted quotes on its strikes");
  eq(s.more, 3, "and it says how many more");
  const all = s.all.map((x) => x.label);
  if (!all.includes("a leg has no bid") || !all.includes("size 14 > 2 on the ask")) throw new Error(all.join(" | "));
  if (all.filter((x) => /CONFLICT/.test(x)).length !== 1) throw new Error("CONFLICT printed twice");
  for (const x of s.labels) if (x.label.split(/\s+/).length > 6) throw new Error(`"${x.label}" is not short`);
});

check("…labels only: no refusal, no new rule — the gate and RULES are untouched", () => {
  const gate = readFileSync("src/riskGate.js", "utf8");
  hasNot(gate, "stopSigns");
  const s = stopSigns({});
  eq(s.labels.length, 0, "no facts, no signs");
  const h = renderToStaticMarkup(<StopSigns signs={stopSigns({ feedBroken: true })} />);
  has(h, "STOP SIGNS"); has(h, "inverted quotes on its strikes");
  if (renderToStaticMarkup(<StopSigns signs={s} />) !== "") throw new Error("an empty strip renders nothing");
});

check("THE STRIP IS ABOVE THE NUMBERS on every card", () => {
  const h = renderToStaticMarkup(<CandidateCard name="X" legs="+1 28C" rr={1} pop={0.5} profit={1} risk={-1}
    signs={stopSigns({ fused: { agreement: "CONFLICT", confidence: 21 } })} />);
  if (!(h.indexOf("STOP SIGNS") < h.indexOf("RETURN ON RISK"))) throw new Error("the signs must come before the figures");
  // ...and on Build, above the five figures and above Send.
  const b = code.slice(code.indexOf("{legsLine(legs)} · per contract"));
  if (!(b.indexOf("<StopSigns signs={buildSigns}") < b.indexOf("YOU PAY"))) throw new Error("Build: signs before figures");
  if (!(code.indexOf("<StopSigns signs={buildSigns} style={{ marginTop: 10 }} />") < code.indexOf("<OrderTicket"))) throw new Error("Build: signs before Send");
});

check("NEWS IS ONE LINE PER MARKET: direction · tagged count · the newest headline", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");
  const items = [
    { title: "Drought cuts US corn crop outlook", date: "2026-09-22T10:00:00Z" },
    { title: "Corn harvest delayed by drought in Iowa", date: "2026-09-23T08:00:00Z" },
    { title: "Gold steady", date: "2026-09-23T09:00:00Z" },
  ];
  const l = newsLine("CORN", items, now);
  if (!l.tagged) throw new Error("the fixture tags nothing: " + l.text);
  has(l.text, `${l.tagged} tagged`);
  has(l.text, "newest: Corn harvest delayed by drought in Iowa");
  has(newsLine("CORN", [], now).text, "no headline tags CORN");
});

function eq(a, b, m) { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); }
void RULES;
/* ====================================================================
   PR #41, TASK 2 — A STOP SIGN ON ALMOST EVERY CARD IS NOT A STOP SIGN.
   The owner: "feed unreliable on this expiry" on 12 of 14 cards, all on
   2026-11-20; on SOYB it fired on 2 inverted pairs out of 30.
==================================================================== */
const E = "2026-11-20";
const board = { spot: 27.6, byExp: { [E]: { dte: 58,
  // the 28.5 call priced ABOVE the 28 call: one impossible pair, on calls
  calls: { 27: { mid: 1.30 }, 27.5: { mid: 1.00 }, 28: { mid: 0.75 }, 28.5: { mid: 0.80 }, 29: { mid: 0.40 } },
  puts: { 26: { mid: 0.30 }, 26.5: { mid: 0.45 }, 27: { mid: 0.65 } } } } };

check("THE CARD SPEAKS FOR ITS OWN STRIKES: a broken pair labels only a structure that trades one of them", () => {
  const m = monotonicityBreaks(board, E);
  eq(m.breaks, 1, "one broken pair");
  eq(m.list.length, 1, "and it is listed, strikes and side");
  const touches = [{ side: 1, qty: 1, type: "call", strike: 28 }, { side: -1, qty: 1, type: "call", strike: 29 }];
  const away = [{ side: 1, qty: 1, type: "call", strike: 27 }, { side: -1, qty: 1, type: "call", strike: 27.5 }];
  const putsOnly = [{ side: 1, qty: 1, type: "put", strike: 27 }, { side: -1, qty: 1, type: "put", strike: 26.5 }];
  const putAt28 = [{ side: 1, qty: 1, type: "put", strike: 28.5 }];
  eq(invertedOnStrikes(m, touches).length, 1, "28C is one end of the broken pair");
  eq(invertedOnStrikes(m, away).length, 0, "27/27.5 calls are nowhere near it");
  eq(invertedOnStrikes(m, putsOnly).length, 0, "a put structure is not touched by a call pair");
  eq(invertedOnStrikes(m, putAt28).length, 0, "the same strike on the other side is a different contract");
  eq(invertedOnStrikes(null, touches).length, 0, "no reading, no label");
});

check("THE BOARD IS JUDGED BY ITS SHARE, AT RULES.staleBoardShare, AND SAID ONCE", () => {
  eq(boardLooksStale({ checked: true, pairs: 30, breaks: 2 }), false, "SOYB, 2 of 30: not stale");
  eq(boardLooksStale({ checked: true, pairs: 25, breaks: 5 }), true, "BOIL live, 5 of 25: stale");
  eq(boardLooksStale({ checked: false, pairs: 0, breaks: 0 }), false, "an unread board is not stale");
  const n = Math.ceil(RULES.staleBoardShare * 100);
  eq(boardLooksStale({ checked: true, pairs: 100, breaks: n }), true, "at the threshold");
  eq(boardLooksStale({ checked: true, pairs: 100, breaks: n - 1 }), false, "under it");
  eq(staleBoardLine([{ tk: "SLV", expKey: E }, { tk: "SOYB", expKey: E }]), `${E} looks stale on 2 markets (SLV, SOYB)`);
  eq(staleBoardLine([]), null, "nothing stale, nothing said");
  // ONCE: one site in App.jsx, and the card label is not the board's verdict.
  eq(count(code, "staleBoardLine("), 1, "one line above the list");
  if (/feedBroken:\s*(x\.)?feedBroken\b[^\n]*stale/.test(code)) throw new Error("a card reads the board's verdict");
  has(code, "feedBroken: invertedOnStrikes(breaks, p.legs).length > 0");
  has(code, "feedBroken: legsInverted");
});

check("ON THE FIXTURES: the label moves to the cards whose own strikes are inverted, never more cards", () => {
  const t = invertedTable();
  for (const r of t) {
    if (r.after > r.before) throw new Error(`${r.id}: ${r.after} labelled after, ${r.before} before`);
    if (r.breaks === 0 && r.after !== 0) throw new Error(`${r.id}: a clean board labels a card`);
  }
  const soyb = t.find((r) => r.tk === "SOYB");
  eq(soyb.breaks, 2, "the SOYB shape has the owner's 2 pairs");
  eq(soyb.pairs, 30, "…of 30");
  eq(soyb.stale, false, "and is not a stale board");
  if (!(soyb.after < soyb.before)) throw new Error(`SOYB shape: ${soyb.before} → ${soyb.after}`);
  eq(t.find((r) => r.tk === "BOIL").stale, true, "the BOIL share is called stale, once");
  eq(t.filter((r) => r.stale).length, 1, "and only that board");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
