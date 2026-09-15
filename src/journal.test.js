// Tests for src/journal.js — the permanent record of a position.
// Plain Node, no test framework: `npm test` runs this file directly.
//
// TASK 0 and TASK 1 of this session, and both are measured faults:
//
//   * "nothing re-reads `alpacaStatus` after the fact" — carried forward from
//     the previous session's NOT VERIFIED list. The position is written once,
//     at send time, and the warning stays until the user checks the broker.
//     The payload below is the reply that session reported (`accepted`,
//     `filled_qty: 0`) and the same order the next morning.
//
//   * `closePos()` in App.jsx kept ticker, pnl, ruleExit and riskOk and dropped
//     the timeline, the thesis, the order ids and the reason. The position
//     below is a six-week trade reduced to one line with a number in it.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  refOf, refNumber, seqOf, highestSeq, refCounter, nextRef,
  appendTimeline, stampTimeline, orderStatusRecheck,
  closeReason, closeDecision, CLOSE_REASON_MIN,
  journalEntry, lastCloseOrderId,
  byRefDesc, matchesRef, searchJournal, SEQ_SEP,
} from "./journal.js";
import { RULES, ruleExitOf, stopWarningSentence } from "./rules.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ================================================================
   THE PAYLOADS

   One position, opened on an order that did not fill, managed for six
   weeks by the app and the autopilot together, and closed by hand.
================================================================ */

// The reply the previous session reported: Alpaca took it and bought nothing.
const ACCEPTED = {
  id: "d7f29b14-8c3a-4e51-9b02-1f6ac5d3e880",
  status: "accepted", qty: "5", filled_qty: "0", filled_avg_price: null,
  type: "limit", limit_price: "0.42", time_in_force: "day",
};
// The same order the next morning.
const FILLED = { ...ACCEPTED, status: "filled", filled_qty: "5", filled_avg_price: "0.42" };

const POSITION = {
  id: 1757000000000,
  ref: "J-0003",
  ticker: "BOIL", name: "Bull Call Spread",
  openedAt: "2026-08-03T13:10:00.000Z", expKey: "2026-10-16",
  legs: [{ side: 1, qty: 5, type: "call", strike: 19 }, { side: -1, qty: 5, type: "call", strike: 19.5 }],
  entryNet: 0.42, entrySpot: 19.2, maxProfit: 40, maxLoss: -210,
  alpacaId: "d7f29b14-8c3a-4e51-9b02-1f6ac5d3e880",
  alpacaStatus: "accepted", alpacaFilled: false,
  thesis: { pop: 0.44, iv: 0.62, seasonal: 1.4, regime: "strong up", spot: 19.2,
    againstSignal: null },
  timeline: [
    { t: 1754226600000, n: 1, seq: "J-0003·01", type: "gate", text: "Risk gate — passed" },
    { t: 1754226600001, n: 2, seq: "J-0003·02", type: "open", text: "Alpaca order d7f29b14… — the order is working, not filled." },
    { t: 1754226600002, n: 3, seq: "J-0003·03", type: "plan", text: "Exit plan frozen at entry." },
  ],
  seqNext: 4,
};

/* ================================================================
   1) THE REF — GIVEN AT OPEN, NEVER REUSED
================================================================ */

test("a ref is J- and four digits, and reads back as its number", () => {
  assert.equal(refOf(1), "J-0001");
  assert.equal(refOf(7), "J-0007");
  assert.equal(refOf(1234), "J-1234");
  assert.equal(refNumber("J-0007"), 7);
  assert.equal(refNumber("J-0001"), 1);
  assert.equal(refNumber("nonsense"), null);
  assert.equal(refNumber(null), null);
});

test("a ref past four digits keeps counting rather than wrapping", () => {
  assert.equal(refOf(12345), "J-12345");
  assert.equal(refNumber(refOf(12345)), 12345);
});

test("the counter is the highest number the state has EVER issued", () => {
  const store = { journalSeq: 5, positions: [{ ref: "J-0009" }], journal: [{ ref: "J-0003" }] };
  assert.equal(refCounter(store), 9, "an open position's ref outranks a stale counter");
  assert.equal(nextRef(store).ref, "J-0010");
});

test("CLOSING A POSITION DOES NOT HAND ITS NUMBER BACK", () => {
  // J-0004 is closed and out of `positions`. The next position must not be J-0004.
  const after = { journalSeq: 4, positions: [], journal: [{ ref: "J-0004" }] };
  assert.equal(nextRef(after).ref, "J-0005");
  // And it survives even the journal entry being deleted, because the counter
  // is stored in its own right.
  assert.equal(nextRef({ journalSeq: 4, positions: [], journal: [] }).ref, "J-0005");
});

test("an empty state starts at J-0001", () => {
  assert.equal(nextRef({}).ref, "J-0001");
  assert.equal(nextRef({ positions: [], journal: [] }).n, 1);
});

/* ================================================================
   2) THE SEQUENCE — ONE PER ENTRY, GIVEN WHEN IT IS RECORDED
================================================================ */

test("an entry is numbered from its position's ref, two digits", () => {
  assert.equal(seqOf("J-0003", 3), `J-0003${SEQ_SEP}03`);
  assert.equal(seqOf("J-0003", 12), `J-0003${SEQ_SEP}12`);
});

test("the separator is inside what every font has", () => {
  // CLAUDE.md: the direction buttons used U+2B61 and rendered as empty boxes on
  // the phone this app is demoed on. A middle dot is not in that class, and the
  // app already prints it everywhere.
  assert.equal(SEQ_SEP.codePointAt(0), 0x00b7, "a middle dot, not a rare glyph");
});

test("appending continues the position's own count", () => {
  const r = appendTimeline(POSITION, { t: 1755000000000, type: "autopilot", text: "AUTOPILOT HOLD" });
  assert.equal(r.added[0].n, 4);
  assert.equal(r.added[0].seq, `J-0003${SEQ_SEP}04`);
  assert.equal(r.seqNext, 5);
  assert.equal(r.timeline.length, 4);
  assert.equal(POSITION.timeline.length, 3, "the position itself is not mutated");
});

test("two appends in a row cannot share a number", () => {
  const a = appendTimeline(POSITION, [{ t: 1, type: "x", text: "one" }, { t: 2, type: "y", text: "two" }]);
  assert.deepEqual(a.added.map((e) => e.n), [4, 5]);
  const b = appendTimeline({ ...POSITION, timeline: a.timeline, seqNext: a.seqNext }, { t: 3, type: "z", text: "three" });
  assert.equal(b.added[0].n, 6);
});

test("a position from an older build gets sequences without losing its order", () => {
  const old = { ref: "J-0002", timeline: [
    { t: 300, type: "plan", text: "third" },
    { t: 100, type: "gate", text: "first" },
    { t: 200, type: "open", text: "second" },
  ] };
  const st = stampTimeline(old);
  assert.deepEqual(st.timeline.map((e) => e.text), ["first", "second", "third"]);
  assert.deepEqual(st.timeline.map((e) => e.n), [1, 2, 3]);
  assert.equal(st.seqNext, 4);
});

test("A MERGED AUTOPILOT ENTRY IS NUMBERED LAST, NOT BY WHERE IT LANDS", () => {
  // `/api/state` hands back entries the autopilot wrote while the app was shut.
  // They are merged by TIME, so one can land in the middle of the list; the
  // sequence is the order things were RECORDED, so it goes on the end.
  const merged = { ...POSITION, timeline: [
    ...POSITION.timeline.slice(0, 2),
    { t: 1754226600001.5, type: "autopilot", text: "AUTOPILOT HOLD (from the server)" },
    ...POSITION.timeline.slice(2),
  ] };
  const st = stampTimeline(merged);
  const added = st.timeline.find((e) => e.type === "autopilot");
  assert.equal(added.n, 4, "the new entry gets the next number, not the third slot");
  assert.equal(added.seq, `J-0003${SEQ_SEP}04`);
  // and nothing that already had a number was renumbered
  assert.deepEqual(st.timeline.filter((e) => e.type !== "autopilot").map((e) => e.n), [1, 2, 3]);
});

test("highestSeq reads what is there and never guesses from the length", () => {
  assert.equal(highestSeq(POSITION.timeline), 3);
  assert.equal(highestSeq([]), 0);
  assert.equal(highestSeq([{ t: 1 }, { t: 2 }]), 0, "unstamped entries are not a count");
});

/* ================================================================
   3) TASK 0 — RE-READING AN ORDER THAT HAD NOT FILLED
================================================================ */

test("THE ORDER FILLED OVERNIGHT, AND THE RE-READ SAYS SO", () => {
  const r = orderStatusRecheck(POSITION, FILLED);
  assert.equal(r.changed, true);
  assert.equal(r.status, "filled");
  assert.equal(r.filled, true);
  assert.ok(r.entry.text.includes("filled"), "the entry names the new status");
  assert.ok(r.entry.text.includes("accepted"), "and what it was before");
  assert.equal(r.entry.type, "status");
  assert.equal(r.entry.orderId, ACCEPTED.id, "the FULL id, not an eight-character slice");
  assert.ok(r.outcome.startsExitPlan, "a complete fill is what starts the exit plan");
});

test("THE SAME ANSWER WRITES NOTHING — a timeline is not a heartbeat", () => {
  const r = orderStatusRecheck(POSITION, ACCEPTED);
  assert.equal(r.changed, false);
  assert.equal(r.entry, undefined, "nothing is appended when nothing changed");
});

test("an order the broker killed overnight is a change too, and not a fill", () => {
  const dead = { ...ACCEPTED, status: "canceled" };
  const r = orderStatusRecheck(POSITION, dead);
  assert.equal(r.changed, true);
  assert.equal(r.filled, false);
  assert.equal(r.outcome.startsExitPlan, false);
  assert.ok(/nothing was bought/i.test(r.outcome.headline));
});

test("a partial fill is a change, and still does not start the plan", () => {
  const part = { ...ACCEPTED, status: "partially_filled", filled_qty: "2", filled_avg_price: "0.42" };
  const r = orderStatusRecheck(POSITION, part);
  assert.equal(r.changed, true);
  assert.equal(r.filled, false);
  assert.equal(r.outcome.startsExitPlan, false);
});

test("no reply at all changes nothing — a failed read is not a status", () => {
  assert.equal(orderStatusRecheck(POSITION, null).changed, false);
  assert.equal(orderStatusRecheck(POSITION, undefined).changed, false);
});

test("the app actually asks: App.jsx re-reads the order and only when unfilled", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/orderStatusRecheck/.test(app), "the decision is the tested one, not a second copy");
  assert.ok(/alpacaReq\(`\/v2\/orders\//.test(app), "it reads the order back from the broker");
  assert.ok(/alpacaFilled === false/.test(app), "and only for orders that had not filled");
  assert.ok(/if \(DEMO \|\| rechecking\.current\) return;/.test(app),
    "the demo never touches the broker, and one pass at a time");
});

/* ================================================================
   4) TASK 1 / TASK 3 — WHY IT ENDED
================================================================ */

test("a rule close names its rule and asks for nothing", () => {
  const r = closeReason({ rule: "take-profit", ruleText: "Closed by the rules: 50% reached." });
  assert.equal(r.ok, true);
  assert.equal(r.kind, "rule");
  assert.ok(r.text.includes("50%"));
});

test("a manual close needs the same minimum as the override, and says how short it is", () => {
  assert.equal(CLOSE_REASON_MIN, RULES.minOverrideReasonChars, "one rule, one home");
  const short = closeReason({ written: "bored" });
  assert.equal(short.ok, false);
  assert.equal(short.need, CLOSE_REASON_MIN - 5);
  assert.ok(short.message.includes(String(short.need)));
  const ok = closeReason({ written: "The weather thesis expired and I want the cash back." });
  assert.equal(ok.ok, true);
  assert.equal(ok.kind, "manual");
});

test("whitespace is not a reason", () => {
  assert.equal(closeReason({ written: "                        " }).ok, false);
});

test("a rule close still keeps anything the user wrote", () => {
  const r = closeReason({ rule: "exit-dte", ruleText: "Closed by the rules: 21-day window.", written: "Rolled into November instead." });
  assert.equal(r.ok, true);
  assert.equal(r.written, "Rolled into November instead.");
});

test("THE STOP IS NOT A RULE THAT CLOSES ANYTHING", () => {
  // `posAlerts` raises the stop to level "action", and `closePos` used to read
  // that level as "a rule said so" — filing a decision as obedience in the one
  // number that is meant to measure discipline honestly.
  const r = ruleExitOf({ slHit: true });
  assert.equal(r.ruleExit, false);
  assert.equal(r.rule, null);
  assert.equal(r.stopWarning, true);
  const d = closeDecision({ alert: { slHit: true, pnl: -110 }, written: "" });
  assert.equal(d.reason.ok, false, "a stop close still has to be written down");
  assert.equal(d.reason.kind, "manual");
  const d2 = closeDecision({ alert: { slHit: true, pnl: -110 }, written: "Down 50% and the season turned against it." });
  assert.equal(d2.reason.ok, true);
  assert.equal(d2.reason.kind, "manual", "a stop close is a MANUAL close, always");
});

test("the take-profit and the exit window ARE rules that close a trade", () => {
  assert.equal(ruleExitOf({ tpHit: true }).rule, "take-profit");
  assert.equal(ruleExitOf({ dteExit: true, dteLeft: 20 }).rule, "exit-dte");
  assert.ok(ruleExitOf({ dteExit: true, dteLeft: 20 }).text.includes("20 days"));
  assert.equal(closeDecision({ alert: { tpHit: true } }).reason.kind, "rule");
});

test("the take-profit wins over the exit window when both are true", () => {
  assert.equal(ruleExitOf({ tpHit: true, dteExit: true, dteLeft: 5 }).rule, "take-profit");
});

test("the stop warning sentence carries the phrase the brief and the screen share", () => {
  const s = stopWarningSentence(-110);
  assert.ok(s.startsWith("Stop threshold crossed — not validated by backtest"));
  assert.ok(s.includes("manual close"), "and says what closing on it is recorded as");
  assert.ok(!/\b(order|approve link)\b.*offered/i.test(s) || s.includes("no order is offered"));
});

/* ================================================================
   5) TASK 1 — WHAT A CLOSED TRADE KEEPS
================================================================ */

const CLOSED = journalEntry({
  pos: POSITION,
  pnl: 18,
  reason: closeReason({ written: "The weather thesis expired and I want the cash back." }),
  closeOrderId: "aa11bb22-cc33-dd44-ee55-ff6677889900",
  riskOk: true,
});

test("THE CLOSED ENTRY KEEPS THE REF", () => {
  assert.equal(CLOSED.ref, "J-0003");
});

test("THE CLOSED ENTRY KEEPS THE WHOLE TIMELINE", () => {
  assert.equal(CLOSED.timeline.length, POSITION.timeline.length);
  assert.deepEqual(CLOSED.timeline.map((e) => e.seq),
    [`J-0003${SEQ_SEP}01`, `J-0003${SEQ_SEP}02`, `J-0003${SEQ_SEP}03`]);
});

test("THE CLOSED ENTRY KEEPS THE THESIS", () => {
  assert.equal(CLOSED.thesis.pop, 0.44);
  assert.equal(CLOSED.thesis.seasonal, 1.4);
});

test("THE ORDER IDS ARE FULL, BOTH OF THEM, NEVER SLICED", () => {
  assert.equal(CLOSED.openOrderId, "d7f29b14-8c3a-4e51-9b02-1f6ac5d3e880");
  assert.equal(CLOSED.closeOrderId, "aa11bb22-cc33-dd44-ee55-ff6677889900");
  assert.equal(CLOSED.openOrderId.length, 36);
  assert.equal(CLOSED.closeOrderId.length, 36);
});

test("THE CLOSE REASON IS ON THE RECORD, AND IT IS A MANUAL CLOSE", () => {
  assert.equal(CLOSED.ruleExit, false);
  assert.equal(CLOSED.closeReason.kind, "manual");
  assert.equal(CLOSED.closeReason.text, "The weather thesis expired and I want the cash back.");
});

test("the four fields the old entry kept are all still there", () => {
  // Nothing was traded away for the new ones.
  for (const k of ["ticker", "pnl", "ruleExit", "riskOk", "openedAt", "name", "id", "t"]) {
    assert.ok(k in CLOSED, `${k} survived`);
  }
});

test("a rule close is filed as one, with the rule named", () => {
  const e = journalEntry({ pos: POSITION, pnl: 20,
    reason: closeDecision({ alert: { tpHit: true } }).reason });
  assert.equal(e.ruleExit, true);
  assert.equal(e.closeReason.rule, "take-profit");
});

test("a close order id already in the timeline is found without being passed in", () => {
  const withOrder = { ...POSITION, timeline: [...POSITION.timeline,
    { t: 1756000000000, n: 4, type: "order", orderId: "ff00ff00-1111-2222-3333-444455556666", text: "CLOSE_ALL approved and sent" }] };
  assert.equal(lastCloseOrderId(withOrder), "ff00ff00-1111-2222-3333-444455556666");
  const e = journalEntry({ pos: withOrder, pnl: 5, reason: closeReason({ written: "Closing it before the weekend gap." }) });
  assert.equal(e.closeOrderId, "ff00ff00-1111-2222-3333-444455556666");
});

test("no broker order at all is a null, not an invented id", () => {
  const paperOnly = { ...POSITION, alpacaId: null, timeline: [] };
  const e = journalEntry({ pos: paperOnly, pnl: 0, reason: closeReason({ written: "Testing the record keeping here." }) });
  assert.equal(e.openOrderId, null);
  assert.equal(e.closeOrderId, null);
});

/* ================================================================
   6) TASK 1 — SORTED AND SEARCHABLE BY REF
================================================================ */

const BOOK = [
  { id: 1, ref: "J-0001", ticker: "CORN", name: "Bull Put Spread", t: 300, timeline: [] },
  { id: 2, ref: "J-0002", ticker: "UNG", name: "Iron Condor", t: 100, timeline: [] },
  { id: 3, ref: "J-0010", ticker: "BOIL", name: "Bull Call Spread", t: 200, timeline: [] },
];

test("the Journal sorts by REF, newest first — not by the date it closed", () => {
  assert.deepEqual(searchJournal(BOOK, "").map((e) => e.ref), ["J-0010", "J-0002", "J-0001"]);
});

test("J-0010 sorts above J-0002 — a ref is a number, not a string", () => {
  assert.ok(byRefDesc({ ref: "J-0010" }, { ref: "J-0002" }) < 0);
});

test("an entry with no ref sorts after every entry that has one", () => {
  const mixed = [...BOOK, { id: 4, ref: null, ticker: "WEAT", name: "old", t: 999 }];
  assert.equal(searchJournal(mixed, "").at(-1).ticker, "WEAT");
});

test("searching finds a ref three ways: J-0002, 0002 and 2", () => {
  for (const q of ["J-0002", "0002", "2"]) {
    const hits = searchJournal(BOOK, q);
    assert.ok(hits.some((e) => e.ref === "J-0002"), `"${q}" finds J-0002`);
  }
});

test("A SEQUENCE OFF THE TIMELINE FINDS ITS TRADE", () => {
  // The string a user is most likely to be holding is the one the timeline
  // prints, and that is `J-0002·04`, not `J-0002`.
  const hits = searchJournal(BOOK, `J-0002${SEQ_SEP}04`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].ref, "J-0002");
});

test("the box is a search box: a ticker works too", () => {
  assert.equal(searchJournal(BOOK, "boil").length, 1);
  assert.equal(searchJournal(BOOK, "condor")[0].ref, "J-0002");
});

test("an empty query returns everything, sorted", () => {
  assert.equal(searchJournal(BOOK, "").length, 3);
  assert.equal(searchJournal(BOOK, "   ").length, 3);
});

test("a query that matches nothing returns nothing rather than everything", () => {
  assert.equal(searchJournal(BOOK, "J-9999").length, 0);
  assert.equal(matchesRef({ ref: "J-0001", ticker: "CORN" }, "SOYB"), false);
});

/* ================================================================
   7) THE APP USES THESE, RATHER THAN A SECOND COPY OF THEM
================================================================ */

test("App.jsx builds the closed entry with journalEntry(), not by hand", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/journalEntry\(\{/.test(app), "the entry comes from the tested builder");
  assert.ok(!/ruleExit = !!\(al && \(al\.level === "action"\)\)/.test(app),
    "the old reading — any 'action' alert is a rule exit — is gone");
  assert.ok(/closeDecision\(/.test(app), "and the reason goes through the tested decision");
});

test("App.jsx gives a position its ref at open and stores the counter", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/const \{ n: refN, ref \} = nextRef\(store\);/.test(app));
  assert.ok(/journalSeq: refN/.test(app), "the counter moves with the ref it issued");
  assert.ok(/journalSeq: 0/.test(app), "and the empty state has one");
});

test("the open position's timeline is reachable in full, not capped at six", () => {
  const pro = readFileSync(new URL("./pro.jsx", import.meta.url), "utf8");
  assert.ok(!/\(pos\.timeline \|\| \[\]\)\.slice\(-6\)\.map/.test(pro),
    "the hard cap is gone");
  assert.ok(/Show the earlier \$\{earlier\.length\}/.test(pro),
    "and the earlier entries open behind a control that says how many there are");
  assert.ok(/e\.seq \? <span/.test(pro), "each line carries its sequence");
});

test("the Journal shows every timeline entry, not the last six", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const journalHalf = app.slice(app.indexOf("CLOSED TRADES"));
  assert.ok(/e\.timeline\.map\(/.test(journalHalf), "the whole list is mapped");
  assert.ok(!/e\.timeline \|\| \[\]\)\.slice\(-6\)/.test(journalHalf), "nothing truncates it");
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(f.e); process.exit(1); }
