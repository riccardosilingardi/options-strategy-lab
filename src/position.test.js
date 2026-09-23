// Tests for ROADMAP PR #38 — one action per open position, and the close that
// is an order. Plain Node, no test framework: `npm test` runs this file directly.
//
//   positionAction()  src/rules.js     — CLOSE / WARNING / HOLD / no quote
//   prepareClose()    src/closeOrder.js — tap 1: order path 3, written out
//   sendClose()       src/closeOrder.js — tap 2: sends exactly that, once

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULES, positionAction, remainingEdge, stopWarningHead, stopWarningSentence, sameCloseNote } from "./rules.js";
import { prepareClose, sendClose, groupForRecord, holdingGroups, closeWorking, holdingLeg, legsNotHeld } from "./closeOrder.js";
import { journalEntry, journalPnl, countedPnl, journalPnlTotal, NOT_A_FILL, MARK_AT_CLOSE } from "./journal.js";
import { DEMO_TOOLTIP } from "./demo.js";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- fixtures ---------------- */

// A position that can make $100 and lose $250 (whole position), from which
// every state below is cut by moving the profit and the days left.
const MAX_P = 100, MAX_L = -250;
const stateOf = ({ pnl = null, dteLeft = 40, level = "ok", ap = null } = {}) => {
  const known = pnl != null;
  const tpHit = known && pnl >= RULES.takeProfitPct * MAX_P;
  const slHit = known && pnl <= RULES.stopLossPct * MAX_L;
  const dteExit = dteLeft <= RULES.exitDTE;
  const edge = remainingEdge({ maxProfit: MAX_P, maxLoss: MAX_L, pnl });
  return { tpHit, slHit, dteExit, edge, pnl, dteLeft, level, ap };
};

// The broker's holdings for a long XLE call vertical, 90/95, 30 Oct 2026.
const HOLDING = [
  { symbol: "XLE261030C00090000", qty: "1", cost_basis: "210", unrealized_pl: "40" },
  { symbol: "XLE261030C00095000", qty: "-1", cost_basis: "-85", unrealized_pl: "-10" },
];
const CHAIN = { byExp: { "2026-10-30": { calls: { 90: { bid: 2.0, ask: 2.2 }, 95: { bid: 0.8, ask: 0.9 } }, puts: {} } } };
const RECORD = { id: 7, ref: "J-0007", ticker: "XLE", expKey: "2026-10-30" };
const PASS = () => ({ pass: true, violations: [], warnings: [] });
const FAIL = () => ({ pass: false, violations: [{ code: "PAPER", message: "Paper mode could not be verified." }], warnings: [] });
const fakeBroker = () => {
  const calls = [];
  const request = async (path, method = "GET", body = null) => {
    calls.push({ path, method, body });
    return method === "POST" ? { id: "close-1", status: "accepted", qty: "1", filled_qty: "0", limit_price: body?.limit_price } : {};
  };
  return { calls, request };
};

/* ---------------- 1) positionAction ---------------- */

await test("the three states come out of the fixtures: CLOSE, WARNING, HOLD", () => {
  const close = positionAction(stateOf({ pnl: 60 }));
  assert.equal(close.action, "CLOSE");
  assert.equal(close.rule, "take-profit");
  assert.ok(/Take profit reached/.test(close.line), close.line);

  const warn = positionAction(stateOf({ pnl: -130 }));
  assert.equal(warn.action, "WARNING");
  assert.equal(warn.kind, "stop");
  assert.equal(warn.line, stopWarningHead(-130));

  const hold = positionAction(stateOf({ pnl: 10 }));
  assert.equal(hold.action, "HOLD");
});

await test("the 21-day exit is CLOSE with the days in its reason", () => {
  const a = positionAction(stateOf({ pnl: 10, dteLeft: 12 }));
  assert.equal(a.action, "CLOSE");
  assert.equal(a.rule, "exit-dte");
  assert.ok(/12 days to expiry/.test(a.line), a.line);
});

await test("THE STOP NEVER YIELDS CLOSE — however far past it the position is", () => {
  for (const pnl of [-125, -200, -249, -250]) {
    const a = positionAction(stateOf({ pnl }));
    assert.notEqual(a.action, "CLOSE", `stop at ${pnl} became CLOSE`);
    assert.equal(a.action, "WARNING");
  }
  // ...and with a rule that does close, the stop is a note, not the reason.
  const both = positionAction(stateOf({ pnl: -200, dteLeft: 10 }));
  assert.equal(both.action, "CLOSE");
  assert.equal(both.rule, "exit-dte");
  assert.ok(both.notes.includes(stopWarningHead(-200)), "the stop still shows, in the fold");
});

await test("the stop line is the head of the stop sentence, one home", () => {
  assert.ok(stopWarningSentence(-130).startsWith(stopWarningHead(-130)));
  assert.ok(stopWarningSentence(null).startsWith(stopWarningHead(null)));
});

await test("a thin edge is a WARNING, never CLOSE", () => {
  const edge = remainingEdge({ maxProfit: 4, maxLoss: -346, pnl: -10 });
  assert.equal(edge.thin, true);
  const a = positionAction({ tpHit: false, slHit: false, dteExit: false, edge, pnl: -10, dteLeft: 40 });
  assert.equal(a.action, "WARNING");
  assert.equal(a.kind, "edge");
  assert.ok(/^Thin:/.test(a.line), a.line);
});

await test("NO QUOTE says so, and is never HOLD", () => {
  for (const pnl of [null, undefined, "", NaN]) {
    const a = positionAction({ ...stateOf({ pnl: null }), pnl });
    assert.equal(a.action, null, `pnl ${pnl} gave ${a.action}`);
    assert.notEqual(a.action, "HOLD");
    assert.ok(/No quote/.test(a.line) && /broker/.test(a.line), a.line);
  }
  // A take-profit flag with no price behind it is not a take profit.
  assert.equal(positionAction({ tpHit: true, pnl: null, dteLeft: 40 }).action, null);
  // Nothing at all passed in is still not HOLD.
  assert.equal(positionAction().action, null);
});

await test("a 21-day exit is CLOSE WITHOUT a quote", () => {
  const a = positionAction(stateOf({ pnl: null, dteLeft: 21 }));
  assert.equal(a.action, "CLOSE");
  assert.equal(a.rule, "exit-dte");
});

await test("the watch level and a pending autopilot verdict do not move the action", () => {
  const base = positionAction(stateOf({ pnl: 10 }));
  const watched = positionAction(stateOf({ pnl: 10, level: "watch", ap: { text: "CLOSE_ALL" } }));
  assert.equal(watched.action, base.action);
  assert.equal(watched.line, base.line);
  assert.equal(watched.notes.length, 2, "both lines go in the fold");
  const warn = positionAction(stateOf({ pnl: -130, ap: { text: "CLOSE_ALL" } }));
  assert.equal(warn.action, "WARNING", "the autopilot cannot turn a warning into a close");
});

await test("the broker panel's sentence names a close that is an order", () => {
  const n = sameCloseNote("J-0007");
  assert.ok(/close-at-limit/.test(n) && /same order/.test(n), n);
});

/* ---------------- 2) prepareClose — tap 1 ---------------- */

await test("the holding for a record is found by ticker and expiry", () => {
  const g = groupForRecord(RECORD, HOLDING);
  assert.ok(g);
  assert.equal(g.items.length, 2);
  assert.equal(groupForRecord({ ...RECORD, expKey: "2026-11-20" }, HOLDING), null);
  assert.equal(groupForRecord({ ...RECORD, ticker: "GLD" }, HOLDING), null);
  assert.equal(holdingGroups(HOLDING).length, 1);
  assert.deepEqual(holdingLeg(HOLDING[1]), { side: -1, qty: 1, type: "call", strike: 95 });
});

await test("prepareClose() builds a LIMIT — never a market order — and sends nothing", async () => {
  const b = fakeBroker();
  const open = [{ id: "tp-ladder", order_class: "mleg", legs: [{ symbol: "XLE261030C00090000" }] },
    { id: "other", symbol: "GLD261030C00200000" }];
  const p = await prepareClose(groupForRecord(RECORD, HOLDING),
    { gate: PASS, openOrders: open, fetchChain: async () => CHAIN, demo: false });
  assert.equal(p.ok, true, p.refusal);
  assert.equal(p.body.type, "limit");
  assert.notEqual(p.body.type, "market");
  assert.equal(p.body.time_in_force, "day");
  assert.ok(Number.isFinite(Number(p.body.limit_price)), "a limit price is on the body");
  // A long debit vertical closes for money coming in: the limit is a credit.
  assert.ok(Number(p.body.limit_price) < 0, `closing a debit spread is a credit, got ${p.body.limit_price}`);
  assert.ok(/credit/.test(p.limitWords), p.limitWords);
  // The order written out: one line per leg, one for the order, one for the cancel plan.
  assert.ok(p.lines.some((l) => /SELL to close/.test(l)) && p.lines.some((l) => /BUY to close/.test(l)), p.lines.join(" | "));
  assert.ok(p.lines.some((l) => /good for today only/.test(l)));
  assert.deepEqual(p.cancelIds, ["tp-ladder"], "only the order on the same contracts is planned for cancelling");
  assert.equal(b.calls.length, 0, "tap 1 reaches no broker");
});

await test("every refusal comes back as a sentence, and nothing is built", async () => {
  const g = groupForRecord(RECORD, HOLDING);
  const gate = await prepareClose(g, { gate: FAIL, fetchChain: async () => CHAIN, demo: false });
  assert.equal(gate.ok, false); assert.ok(/Risk gate/.test(gate.refusal)); assert.equal(gate.body, null);
  const noGate = await prepareClose(g, { fetchChain: async () => CHAIN, demo: false });
  assert.equal(noGate.ok, false, "a missing gate fails closed");
  const noChain = await prepareClose(g, { gate: PASS, fetchChain: async () => { throw new Error("offline"); }, demo: false });
  assert.equal(noChain.ok, false); assert.ok(/option chain/.test(noChain.refusal));
  const noQuote = await prepareClose(g, { gate: PASS, demo: false,
    fetchChain: async () => ({ byExp: { "2026-10-30": { calls: { 90: { bid: 2.0, ask: 2.2 } }, puts: {} } } }) });
  assert.equal(noQuote.ok, false); assert.ok(noQuote.refusal.startsWith("The close was not sent."), noQuote.refusal);
  const none = await prepareClose(null, { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  assert.equal(none.ok, false); assert.ok(/no holding/.test(none.refusal));
});

await test("DEMO refuses both taps", async () => {
  const b = fakeBroker();
  const p = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: true });
  assert.equal(p.ok, false);
  assert.equal(p.refusal, DEMO_TOOLTIP);
  const real = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  const s = await sendClose(real, { request: b.request, gate: PASS, demo: true });
  assert.equal(s.ok, false);
  assert.equal(b.calls.length, 0, "nothing reached the broker in demo mode");
});

/* ---------------- 3) sendClose — tap 2 ---------------- */

await test("sendClose() cancels the conflicts, then POSTs exactly what tap 1 wrote out", async () => {
  const b = fakeBroker();
  const open = [{ id: "tp-ladder", order_class: "mleg", legs: [{ symbol: "XLE261030C00095000" }] }];
  const p = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, openOrders: open, fetchChain: async () => CHAIN, demo: false });
  const s = await sendClose(p, { request: b.request, gate: PASS, demo: false });
  assert.equal(s.ok, true, s.refusal);
  assert.deepEqual(b.calls.map((c) => `${c.method} ${c.path}`), ["DELETE /v2/orders/tp-ladder", "POST /v2/orders"]);
  assert.deepEqual(b.calls[1].body, p.body);
  assert.equal(b.calls[1].body.type, "limit");
  assert.equal(s.limitWords, p.limitWords);
});

await test("a second send while a close is working is refused", async () => {
  const b = fakeBroker();
  const p = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  const first = await sendClose(p, { request: b.request, gate: PASS, demo: false });
  assert.equal(first.ok, true);
  const again = await sendClose(p, { request: b.request, gate: PASS, demo: false });
  assert.equal(again.ok, false, "the same prepared close cannot go twice");
  assert.equal(b.calls.filter((c) => c.method === "POST").length, 1);

  // ...and once the record carries a working close, neither tap proceeds.
  const rec = { ...RECORD, closeOrder: { id: "close-1", t: 1000 } };
  const synced = { t: 2000, orders: [{ id: "close-1" }], positions: HOLDING };
  assert.equal(closeWorking(rec, synced), true);
  const p2 = await prepareClose(groupForRecord(rec, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false,
    working: closeWorking(rec, synced) });
  assert.equal(p2.ok, false); assert.ok(/already working/.test(p2.refusal));
  const fresh = await prepareClose(groupForRecord(rec, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  const s2 = await sendClose(fresh, { request: b.request, gate: PASS, demo: false, working: true });
  assert.equal(s2.ok, false); assert.ok(/already working/.test(s2.refusal));
  assert.equal(b.calls.filter((c) => c.method === "POST").length, 1, "still one close sent");
});

await test("the working state is the broker's: gone from its open orders, the button comes back", () => {
  const rec = { ...RECORD, closeOrder: { id: "close-1", t: 1000 } };
  assert.equal(closeWorking(RECORD, { t: 2000, orders: [] }), false, "no close sent, nothing working");
  assert.equal(closeWorking(rec, { t: 500, orders: [] }), true, "not asked since the send: still working");
  assert.equal(closeWorking(rec, { t: 2000, orders: [] }), false, "filled, cancelled or expired");
});

await test("sendClose() re-runs the gate at the send", async () => {
  const b = fakeBroker();
  const p = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  const s = await sendClose(p, { request: b.request, gate: FAIL, demo: false });
  assert.equal(s.ok, false); assert.ok(/Risk gate/.test(s.refusal));
  assert.equal(b.calls.length, 0);
});

await test("a broker refusal comes back as the reason, and the close can be tried again", async () => {
  const p = await prepareClose(groupForRecord(RECORD, HOLDING), { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  const refusing = async (path, method) => {
    if (method === "POST") { const e = new Error("x"); e.status = 422; e.body = '{"message":"insufficient qty"}'; throw e; }
    return {};
  };
  const s = await sendClose(p, { request: refusing, gate: PASS, demo: false });
  assert.equal(s.ok, false);
  assert.ok(/HTTP 422/.test(s.refusal), s.refusal);
  assert.equal(p.sent, false);
});

/* ---------------- 0c) NOT ON ALPACA ---------------- */

// J-0002 as it was: XLE +1 59P / -1 62.5P, imported 21 Sep, held on the
// record while a SUCCESSFUL sync of /v2/positions returned nothing at all.
const J0002 = { id: 2, ref: "J-0002", ticker: "XLE", expKey: "2026-10-30", name: "Imported from Alpaca",
  openedAt: "2026-09-21T14:00:00.000Z", alpacaHeld: true, alpacaLive: true, maxProfit: 101, maxLoss: -249,
  legs: [{ side: 1, qty: 1, type: "put", strike: 59 }, { side: -1, qty: 1, type: "put", strike: 62.5 }], timeline: [] };
const AFTER = Date.parse("2026-09-23T08:00:00Z");
const J0002_HELD = [
  { symbol: "XLE261030P00059000", qty: "1", unrealized_pl: "-20" },
  { symbol: "XLE261030P00062500", qty: "-1", unrealized_pl: "-40" },
];

await test("NOT ON ALPACA — a successful sync holding none of the legs names both", () => {
  const missing = legsNotHeld(J0002, { t: AFTER, positions: [] });
  assert.deepEqual(missing, ["+1 59P", "-1 62.5P"]);
});

await test("NOT ON ALPACA — holding only SOME of the legs names the ones missing", () => {
  assert.deepEqual(legsNotHeld(J0002, { t: AFTER, positions: [J0002_HELD[0]] }), ["-1 62.5P"]);
  assert.deepEqual(legsNotHeld(J0002, { t: AFTER, positions: J0002_HELD }), [], "all held: nothing missing");
  // The SIDE is part of the leg: a short 59P is not the long 59P on the record.
  assert.deepEqual(legsNotHeld(J0002, { t: AFTER, positions: [{ symbol: "XLE261030P00059000", qty: "-1" }, J0002_HELD[1]] }), ["+1 59P"]);
});

await test("NOT ON ALPACA — UNKNOWN IS NOT 'NOTHING HELD': no sync, a failed one, or an old one change nothing", () => {
  assert.equal(legsNotHeld(J0002, { t: 0, positions: [] }), null, "never synced (alSync.t is only set on success)");
  assert.equal(legsNotHeld(J0002, null), null, "no sync state at all");
  assert.equal(legsNotHeld(J0002, { t: Date.parse("2026-09-20T00:00:00Z"), positions: [] }), null,
    "a sync from before the record was owned says nothing about it");
  assert.equal(legsNotHeld({ ...J0002, alpacaHeld: false, alpacaLive: false }, { t: AFTER, positions: [] }), null,
    "a record never tied to the broker (the app's own paper book) is not judged by it");
  const fillLater = { ...J0002, alpacaHeld: false, alpacaLive: false, alpacaFilled: true,
    timeline: [{ t: AFTER + 1000, type: "fill" }] };
  assert.equal(legsNotHeld(fillLater, { t: AFTER, positions: [] }), null, "a sync older than the fill is not an answer");
});

await test("NOT ON ALPACA — positionAction(): action null with the reason; never HOLD, WARNING or CLOSE", () => {
  const missing = legsNotHeld(J0002, { t: AFTER, positions: [] });
  // Every state that would otherwise produce an action — including the 21-day
  // exit, which is CLOSE even without a quote.
  for (const st of [stateOf({ pnl: 60 }), stateOf({ pnl: -130 }), stateOf({ pnl: 10 }), stateOf({ pnl: null, dteLeft: 10 })]) {
    const a = positionAction({ ...st, notHeld: missing });
    assert.equal(a.action, null, "no action");
    assert.equal(a.kind, "not-held");
    assert.ok(/^Not on Alpaca: \+1 59P, -1 62\.5P are not in the account\./.test(a.line), a.line);
  }
  // null or [] changes nothing: the existing behaviour, exactly.
  for (const notHeld of [null, []]) {
    assert.equal(positionAction({ ...stateOf({ pnl: 60 }), notHeld }).action, "CLOSE");
    assert.equal(positionAction({ ...stateOf({ pnl: 10 }), notHeld }).action, "HOLD");
    assert.equal(positionAction({ ...stateOf({ pnl: null }), notHeld }).action, null);
  }
});

await test("NOT ON ALPACA — filed with P&L null and 'not read from a fill'", () => {
  const e = journalEntry({ pos: J0002, pnl: null, pnlNote: NOT_A_FILL, reason: { kind: "manual", text: "gone" } });
  assert.equal(e.pnl, null);
  assert.equal(e.pnlNote, "not read from a fill");
  const jp = journalPnl(e);
  assert.equal(jp.shown, null, "no figure is printed");
  assert.equal(jp.note, "not read from a fill");
  assert.equal(countedPnl(e), null, "and no sum counts it");
});

await test("JOURNAL — a figure filed with no broker closing order is the app's mark, and no sum counts it", () => {
  // J-0002 as it is actually stored: -$133, "closing order · none". Not edited.
  const stored = { ref: "J-0002", pnl: -133, closeOrderId: null };
  const jp = journalPnl(stored);
  assert.equal(jp.shown, -133, "the stored figure is still shown");
  assert.equal(jp.note, MARK_AT_CLOSE);
  assert.ok(/the app's mark at close — not a fill/.test(jp.note));
  assert.equal(jp.counted, null);
  const filled = { ref: "J-0009", pnl: 42, closeOrderId: "abc" };
  assert.equal(countedPnl(filled), 42, "a close with a broker order counts");
  const sum = journalPnlTotal([stored, filled, { pnl: null, pnlNote: NOT_A_FILL }]);
  assert.equal(sum.total, 42, "only the broker-closed figure is summed");
  assert.equal(sum.counted, 1);
  assert.equal(sum.excluded, 2);
  assert.equal(journalPnlTotal([stored]).total, null, "a sum of nothing counted is unknown, not zero");
});

await test("NOT ON ALPACA — WIRED: the card's action, the P&L, the filing and the Journal row read the helpers", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/const notHeld = legsNotHeld\(p, alSync\)/.test(app), "posAlerts asks legsNotHeld() with the sync state");
  assert.ok(/positionAction\(\{[^}]*notHeld \}\)/.test(app), "and hands it to positionAction()");
  assert.ok(/notHeld && notHeld\.length \? \{ pnl: null/.test(app), "the P&L is null, never the model mark");
  assert.ok(/pnlNote: notOnAlpaca \? NOT_A_FILL : null/.test(app), "filing stores the note");
  assert.ok(/journalPnl\(e\)/.test(app), "the Journal row reads journalPnl()");
  assert.ok(/"NOT ON ALPACA"/.test(app), "and the card says it in large type");
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
