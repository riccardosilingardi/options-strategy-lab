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
  simHorizonOf, autopilotHorizonNote, simVolOf, autopilotVolNote,
  closeReason, closeDecision, CLOSE_REASON_MIN,
  journalEntry, lastCloseOrderId,
  byRefDesc, matchesRef, searchJournal, SEQ_SEP,
  positionSize, positionSizeNote, contractsOf, withPositionSize, ASSUMED_CONTRACTS,
} from "./journal.js";
import { RULES, ruleExitOf, stopWarningSentence,
  seasonalStampOf, seasonalStampNote, ESTIMATED_SEASONAL_SOURCE, MEASURED_SEASONAL_SOURCE } from "./rules.js";
import { reduceRatios, orderQty } from "./order.js";

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

/* ============================================================================
   HOW BIG THE POSITION WAS — AND WHETHER THAT IS KNOWN.

   MEASURED: `riskGate.js` read `p.contracts` in three places and NOTHING EVER
   WROTE IT. A seven-lot spread counted against the 25% exposure ceiling as one
   contract for the rest of its life, and the closed entry recorded `riskOk`
   from a maximum loss that was one seventh of the real one.
============================================================================ */

test("a size that was recorded is read back exactly, and is not assumed", () => {
  assert.deepEqual(positionSize({ contracts: 7 }),
    { contracts: 7, assumed: false, perCombo: 1, brokerQty: 7 });
  assert.equal(contractsOf({ contracts: 7 }), 7);
  assert.equal(positionSizeNote({ contracts: 7 }), "7 contracts");
  assert.equal(positionSizeNote({ contracts: 1 }), "1 contract");
});

test("a record with no size loads, is read as one, and SAYS it was assumed", () => {
  // This is exactly the shape of every position saved before this build.
  const legacy = { id: 1, ticker: "CORN", legs: [], entryNet: 1.2, maxLoss: -120 };
  assert.deepEqual(positionSize(legacy),
    { contracts: ASSUMED_CONTRACTS, assumed: true, perCombo: 1, brokerQty: 1 });
  assert.match(positionSizeNote(legacy), /assumed, not recorded/);
  assert.match(positionSizeNote(legacy), /one combination/);
});

test("the assumption survives being saved again — it cannot launder itself", () => {
  const migrated = withPositionSize({ ticker: "CORN", maxLoss: -120 });
  assert.equal(migrated.contracts, 1);
  assert.equal(migrated.contractsAssumed, true);
  // The whole point: a 1 nobody wrote must never print as a 1 somebody chose,
  // and it goes through localStorage and /api/state between the two readings.
  const roundTrip = JSON.parse(JSON.stringify(migrated));
  assert.equal(positionSize(roundTrip).assumed, true);
  assert.match(positionSizeNote(roundTrip), /assumed/);
});

test("a record that already carries a size is not rewritten at hydration", () => {
  const real = { ticker: "CORN", contracts: 4, maxLoss: -120 };
  assert.equal(withPositionSize(real), real, "the same object, untouched");
  assert.equal(positionSize(real).assumed, false);
});

test("a size that makes no sense is read as one, and said to be assumed", () => {
  for (const junk of [{ contracts: 0 }, { contracts: -2 }, { contracts: "seven" }, { contracts: NaN }, {}, null, undefined]) {
    const r = positionSize(junk);
    assert.equal(r.contracts, 1, JSON.stringify(junk));
    assert.equal(r.assumed, true, JSON.stringify(junk));
  }
  // 2.6 contracts is not a thing a broker can fill.
  assert.equal(positionSize({ contracts: 2.6 }).contracts, 3);
});

test("THE CLOSED ENTRY KEEPS THE SIZE, and keeps the assumption with it", () => {
  const pos = { id: 1, ref: "J-0004", ticker: "BOIL", name: "Bull Call Spread",
    legs: [], entryNet: 0.5, maxProfit: 50, maxLoss: -50, contracts: 7, timeline: [] };
  const e = journalEntry({ pos, pnl: 210, riskOk: true });
  assert.equal(e.contracts, 7, "without this the Journal cannot say what the trade risked");
  assert.equal(e.contractsAssumed, false);
  // `entryNet`, `maxProfit` and `maxLoss` are all per combination, so the size
  // is the only thing that turns them into what the trade actually did.
  assert.equal(e.maxLoss, -50, "still per combination, deliberately");
  const old = journalEntry({ pos: { ...pos, contracts: undefined }, pnl: 30 });
  assert.equal(old.contracts, 1);
  assert.equal(old.contractsAssumed, true, "a closed entry from an older book says so too");
});

/* ============================================================================
   TWO COUNTS, TWO UNITS — READ ON SCREEN, 18 SEP 2026.

   J-0001 showed "1 contract — assumed, not recorded" on its row while its own
   timeline said "0 of 10 combinations bought" and its legs read +10 20C / -10
   21C. Both numbers were true and the screen said neither: the size of that
   position is written into its LEG QUANTITIES, and `analyze()` had already
   multiplied every dollar figure by the ten.
============================================================================ */

const TEN_LOT = {                      // saved the old way: the size is in the legs
  ticker: "BOIL", name: "Bull Call Spread",
  legs: [{ side: 1, type: "call", strike: 20, qty: 10 }, { side: -1, type: "call", strike: 21, qty: 10 }],
  entryNet: 0.45, maxProfit: 550, maxLoss: -450,
};
const ONE_LOT = {
  ticker: "CORN", name: "Bull Call Spread",
  legs: [{ side: 1, type: "call", strike: 22, qty: 1 }, { side: -1, type: "call", strike: 24, qty: 1 }],
  entryNet: 1.8, maxProfit: 320, maxLoss: -180,
};

test("a size written into the legs is READ, not guessed at", () => {
  const r = positionSize({ ...TEN_LOT, contracts: 1, contractsAssumed: true });
  assert.equal(r.perCombo, 10, "the legs' GCD is how many of the reduced shape one structure is");
  assert.equal(r.brokerQty, 10, "which is the number Alpaca was asked for, and the one on the timeline");
  assert.equal(r.contracts, 1, "and the number that multiplies maxLoss is still one");
  // The dollars must NOT move: maxLoss already holds the ten.
  assert.equal(Math.abs(TEN_LOT.maxLoss) * r.contracts, 450);
});

test("the note does not contradict the timeline beside it", () => {
  const note = positionSizeNote({ ...TEN_LOT, contracts: 1, contractsAssumed: true });
  assert.match(note, /10 combinations/, "it says the number the broker's reply says");
  assert.match(note, /already the whole position/, "and that the figures are not per one");
  assert.ok(!/read as one combination/.test(note),
    "the sentence that contradicted a timeline reading '0 of 10 combinations bought'");
});

test("when the legs say nothing, an assumed 1 still says so", () => {
  const r = positionSize(ONE_LOT);
  assert.equal(r.perCombo, 1);
  assert.equal(r.brokerQty, 1);
  assert.equal(r.assumed, true);
  assert.match(positionSizeNote(ONE_LOT), /assumed, not recorded/);
  assert.match(positionSizeNote(ONE_LOT), /read as one combination/,
    "here the figures really are for one, and the doubt really is total");
});

test("a recorded size multiplies the legs' own count for the broker", () => {
  // Three of a structure whose legs are 1:2:1 is three butterflies: GCD 1.
  const fly = { legs: [{ qty: 1 }, { qty: 2 }, { qty: 1 }], contracts: 3 };
  assert.deepEqual(positionSize(fly), { contracts: 3, assumed: false, perCombo: 1, brokerQty: 3 });
  // Two of a structure already saved as +10/-10 is twenty combinations.
  const both = { ...TEN_LOT, contracts: 2 };
  assert.equal(positionSize(both).brokerQty, 20);
  assert.equal(positionSize(both).contracts, 2, "but only two multiply the dollars");
});

test("THE BROKER'S QTY IS NOT THE MULTIPLIER — divide by the legs' GCD first", () => {
  // The bug this file is holding down. `orderBody` sends qty = userQty x GCD,
  // and `analyze()` has already put the GCD into maxLoss. Reading the reply's
  // qty as the multiplier counts a $450 worst case as $4,500.
  const factor = reduceRatios(TEN_LOT.legs).factor;
  assert.equal(factor, 10);
  const brokerQtySent = orderQty(1, factor);             // the ticket said x1
  assert.equal(brokerQtySent, 10, "what Alpaca was asked for");
  const recovered = brokerQtySent / factor;
  assert.equal(recovered, 1, "what multiplies the dollars");
  assert.equal(Math.abs(TEN_LOT.maxLoss) * recovered, 450, "the real worst case");
  assert.equal(Math.abs(TEN_LOT.maxLoss) * brokerQtySent, 4500, "and what reading it raw would have said");
});

test("App.jsx converts the broker's qty into the units maxLoss is in", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const commit = app.slice(app.indexOf("const commitPosition"), app.indexOf("const openPaper"));
  assert.ok(/reduceRatios\(lg\)\.factor/.test(commit), "the legs' GCD is taken out");
  assert.ok(/Number\(alpacaOrder\?\.qty\) \/ factor/.test(commit), "before the reply's qty is believed");
});

test("the position record that App.jsx writes carries the size", () => {
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const commit = app.slice(app.indexOf("const commitPosition"), app.indexOf("const openPaper"));
  assert.ok(/contracts: sized/.test(commit), "the record stores it");
  assert.ok(/Number\(alpacaOrder\?\.qty\)/.test(commit),
    "and the broker order's own qty is the authority where there was one");
  assert.ok(!/contracts: 1/.test(commit), "never a hardcoded one");
});

/* ============================================================================
   THE BRIEFS WRITTEN AT THE WRONG HORIZON (PR #24's first inherited debt).

   `exitSim()` walked every position to 7 DTE while `RULES.exitDTE` has been 21
   since it was changed from 7, and `autopilot.mjs` handed the answer to the
   model in a field called `p_exit_at_exit_dte_positive`. Four pull requests
   shipped on top of it. What the Journal keeps is not the brief — it is the
   verdict plus the model's RATIONALE, prose written after reading those
   numbers — so the wrong horizon is inside the text of past entries where
   nothing can reach it.

   It is NOT marked by date: a deploy date is a second home for a fact the entry
   can carry itself. Entries written since the fix carry the horizon; the
   ABSENCE of that stamp is what identifies the rest.
============================================================================ */

const STAMPED = { t: 1, type: "autopilot", text: "AUTOPILOT HOLD — ...", simExitDTE: RULES.exitDTE, simDays: 24 };
const UNSTAMPED = { t: 1, type: "autopilot", text: "AUTOPILOT HOLD — 62% positive at the exit rule." };

test("an autopilot entry with no horizon stamp is the one written before the fix", () => {
  const before = simHorizonOf(UNSTAMPED);
  assert.equal(before.autopilot, true);
  assert.equal(before.stamped, false);
  assert.equal(before.exitDTE, null, "an unknown horizon is not a horizon of 0");
  const after = simHorizonOf(STAMPED);
  assert.equal(after.stamped, true);
  assert.equal(after.exitDTE, RULES.exitDTE);
  assert.equal(after.days, 24);
});

test("the note appears on an unstamped entry and on NOTHING else", () => {
  const note = autopilotHorizonNote(UNSTAMPED);
  assert.ok(note && note.length > 0, "an unstamped entry is marked");
  assert.ok(/no longer uses/.test(note), "and it says what is wrong with it");
  // ONE SENTENCE, NOT A PARAGRAPH, AND NEVER AN APOLOGY.
  assert.equal((note.match(/\.(?=\s|$)/g) || []).length, 1, `not one sentence: ${note}`);
  assert.ok(!/sorry|apolog|we regret/i.test(note));
  // A stamped one is not marked, or the warning is noise on every entry.
  assert.equal(autopilotHorizonNote(STAMPED), null);
  // ...and neither is anything that never quoted a horizon.
  for (const e of [{ t: 1, type: "open", text: "Opened" }, { t: 1, type: "order", text: "Sent" },
    { t: 1, type: "gate", text: "RISK GATE" }, {}, null]) {
    assert.equal(autopilotHorizonNote(e), null, `${JSON.stringify(e)} never quoted a horizon`);
  }
});

test("a horizon of 0 is a stamp, and a garbage one is not", () => {
  // The exit rule could in principle be 0. A stamp of 0 is a real reading.
  assert.equal(simHorizonOf({ type: "autopilot", simExitDTE: 0 }).stamped, true);
  // But `Number(null)` is 0 and 0 is finite — the fault this repository is
  // about — so a null must never read as a stamp of zero.
  assert.equal(simHorizonOf({ type: "autopilot", simExitDTE: null }).stamped, false);
  assert.equal(simHorizonOf({ type: "autopilot", simExitDTE: "n/a" }).stamped, false);
  assert.equal(simHorizonOf({ type: "autopilot", simExitDTE: -1 }).stamped, false);
});

test("the stamp survives a hydration of an old book", () => {
  // `stampTimeline()` is what runs over every position on load. It gives
  // sequences; it must not touch anything else on an entry, or the marker would
  // be erased by the very pass that reads old records.
  const pos = {
    ref: "J-0007",
    timeline: [
      { t: 10, type: "open", text: "Opened" },
      { ...UNSTAMPED, t: 20 },
      { ...STAMPED, t: 30 },
    ],
  };
  const st = stampTimeline(pos);
  assert.equal(st.timeline.length, 3);
  assert.equal(simHorizonOf(st.timeline[1]).stamped, false, "the old entry stays unstamped");
  assert.equal(simHorizonOf(st.timeline[2]).stamped, true, "and the new one keeps its horizon");
  assert.equal(st.timeline[2].simDays, 24);
  assert.ok(st.timeline[2].seq, "while still gaining its sequence");
  // And through an append, which is the other way a timeline is rebuilt.
  const ap = appendTimeline(st, { t: 40, type: "autopilot", text: "again", simExitDTE: RULES.exitDTE, simDays: 9 });
  assert.equal(simHorizonOf(ap.timeline[1]).stamped, false);
  assert.equal(simHorizonOf(ap.timeline[3]).stamped, true);
  assert.equal(autopilotHorizonNote(ap.timeline[1]) !== null, true);
});

/* ============================================================================
   AND WHICH VOLATILITY THAT SIMULATION WALKED ON (PR #27, PRD §4k).

   The same fact about the same entry, one layer down. Until PR #27 the brief's
   `exitSim` walked the hand-written `SIGMA` row — the only volatility the
   autopilot could reach — while the Guardian's `exitPathSim` walked the
   MEASURED realised volatility of the monthly series App.jsx had already
   loaded. Every figure the model then wrote its rationale from moved with the
   difference, and the rationale is what this entry's text is made of.
============================================================================ */

const VOL_STAMPED = { t: 1, type: "autopilot", text: "AUTOPILOT HOLD — ...",
  simSigma: 0.41, simSigmaSource: "measured history", simSigmaYears: 11, simSigmaAgeDays: 2 };
const VOL_TABLE = { t: 1, type: "autopilot", text: "AUTOPILOT HOLD — ...",
  simSigma: 0.22, simSigmaSource: "table", simSigmaYears: null, simSigmaAgeDays: null };

test("an autopilot entry with no volatility stamp reads as the HAND-WRITTEN table", () => {
  // The absence is the marker, exactly as `contractsAssumed` and `simExitDTE`
  // work — and it reads as the table because the table was the only volatility
  // the autopilot could reach. Reading it as measured would invent one.
  const before = simVolOf(UNSTAMPED);
  assert.equal(before.autopilot, true);
  assert.equal(before.stamped, false);
  assert.equal(before.source, "table", "the only thing it can have been");
  assert.equal(before.measured, false);
  assert.equal(before.sigma, null, "an unknown volatility is not a volatility of 0");
  assert.equal(before.years, null);
  assert.equal(before.ageDays, null);

  const meas = simVolOf(VOL_STAMPED);
  assert.equal(meas.stamped, true);
  assert.equal(meas.measured, true);
  assert.equal(meas.sigma, 0.41);
  assert.equal(meas.years, 11);
  assert.equal(meas.ageDays, 2);

  const table = simVolOf(VOL_TABLE);
  assert.equal(table.stamped, true, "saying 'table' out loud is a stamp");
  assert.equal(table.measured, false);
  assert.equal(table.sigma, 0.22);
  assert.equal(table.years, null, "a table figure has no year count to report");
});

test("a volatility of 0 and a garbage one are not stamps", () => {
  // `Number(null)` is 0 and 0 is finite — the fault this repository is about.
  assert.equal(simVolOf({ type: "autopilot", simSigmaSource: null, simSigma: 0.2 }).stamped, false);
  assert.equal(simVolOf({ type: "autopilot", simSigmaSource: "" }).stamped, false);
  assert.equal(simVolOf({ type: "autopilot", simSigmaSource: 21 }).stamped, false);
  // A source WITHOUT a sigma is still a stamp about the source, and the sigma
  // stays null rather than becoming zero.
  const noSigma = simVolOf({ type: "autopilot", simSigmaSource: "table" });
  assert.equal(noSigma.stamped, true);
  assert.equal(noSigma.sigma, null);
  assert.equal(simVolOf({ type: "autopilot", simSigmaSource: "table", simSigma: "0.22" }).sigma, null,
    "a string is not a reading");
});

test("the volatility note appears on an unstamped entry and on NOTHING else", () => {
  const note = autopilotVolNote(UNSTAMPED);
  assert.ok(note && note.length > 0);
  assert.ok(/hand-written table/.test(note), "and it says which one it must have been");
  assert.equal((note.match(/\.(?=\s|$)/g) || []).length, 1, `not one sentence: ${note}`);
  assert.ok(!/sorry|apolog|we regret/i.test(note));
  // A stamped entry is not marked, whichever source it names — a measured
  // reading is a statement and the table naming itself is not a surprise.
  assert.equal(autopilotVolNote(VOL_STAMPED), null);
  assert.equal(autopilotVolNote(VOL_TABLE), null);
  for (const e of [{ t: 1, type: "open", text: "Opened" }, { t: 1, type: "order", text: "Sent" },
    { t: 1, type: "gate", text: "RISK GATE" }, {}, null]) {
    assert.equal(autopilotVolNote(e), null, `${JSON.stringify(e)} never ran a simulation`);
  }
});

test("HYDRATION — a record with no seasonal or volatility stamp reads as the estimate", () => {
  // The two hydration passes every stored position goes through on load:
  // `withPositionSize()` gives it a size and `stampTimeline()` gives its
  // entries their sequences. NEITHER may invent a provenance — a stamp added
  // at hydration would be the app manufacturing a measurement for a record
  // written when neither side could reach one.
  const old = {
    ref: "J-0003",
    ticker: "CORN",
    // A thesis written before the app recorded a seasonal source, which is the
    // state every position saved by an earlier build is in.
    thesis: { pop: 0.55, iv: 0.24, seasonal: 1.5 },
    timeline: [{ t: 10, type: "open", text: "Opened" }, { ...UNSTAMPED, t: 20 }],
  };
  const hydrated = stampTimeline(withPositionSize(old));

  // 1) The seasonal stamp is still absent, and reads as the hand-written row.
  assert.equal(hydrated.thesis.seasonalSource, undefined, "hydration invents nothing");
  const stamp = seasonalStampOf(hydrated.thesis);
  assert.equal(stamp.stamped, false);
  assert.equal(stamp.source, ESTIMATED_SEASONAL_SOURCE, "absence reads as the estimate");
  assert.equal(stamp.measured, false);
  assert.equal(stamp.years, null, "and not as zero years of history");
  const sentence = seasonalStampNote(hydrated.thesis, "CORN");
  assert.ok(/no seasonal stamp/.test(sentence), sentence);
  assert.ok(/HAND-WRITTEN/.test(sentence), sentence);

  // 2) So is the volatility stamp on its autopilot entry.
  assert.equal(simVolOf(hydrated.timeline[1]).stamped, false);
  assert.equal(simVolOf(hydrated.timeline[1]).source, "table");
  assert.ok(autopilotVolNote(hydrated.timeline[1]));

  // 3) And the passes did do their own jobs, so this is not a no-op test.
  assert.equal(positionSize(hydrated).assumed, true, "the size is marked assumed");
  assert.ok(hydrated.timeline[1].seq, "the entry gained its sequence");

  // 4) A record that DOES carry a stamp keeps it through the same passes.
  const stamped = stampTimeline(withPositionSize({
    ...old, thesis: { ...old.thesis, seasonalSource: MEASURED_SEASONAL_SOURCE, seasonalYears: 11, seasonalAgeDays: 1 },
    timeline: [{ t: 10, type: "open", text: "Opened" }, { ...VOL_STAMPED, t: 20 }],
  }));
  assert.equal(seasonalStampOf(stamped.thesis).measured, true, "a real stamp survives hydration");
  assert.equal(simVolOf(stamped.timeline[1]).measured, true);
  assert.equal(autopilotVolNote(stamped.timeline[1]), null);
});

test("every screen that renders a timeline prints the volatility note too", () => {
  // The Guardian (pro.jsx), the Journal (App.jsx), the weekly report's PDF
  // export and the model's own context — the four places an autopilot entry's
  // text, and therefore its simulator figures, are read.
  for (const f of ["pro.jsx", "App.jsx"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(/autopilotVolNote\(/.test(src), `${f} does not render the note`);
  }
  const pro = readFileSync(new URL("./pro.jsx", import.meta.url), "utf8");
  assert.equal((pro.match(/autopilotVolNote\(/g) || []).length >= 3, true,
    "pro.jsx renders it in the Guardian, the PDF export and buildContext");
});

test("both screens that render a timeline print the note", () => {
  // The live one (the Guardian, in pro.jsx) and the permanent record (the
  // Journal, in App.jsx). A closed trade's autopilot entries are exactly the
  // ones nobody will ever re-read against the fix.
  for (const f of ["pro.jsx", "App.jsx"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.ok(/autopilotHorizonNote\(/.test(src), `${f} does not render the note`);
  }
});

test("the autopilot stamps the horizon it actually simulated to", () => {
  const src = readFileSync(new URL("../netlify/functions/autopilot.mjs", import.meta.url), "utf8");
  // The stamp is the simulator's OWN answer, never a rule number written twice:
  // that is the whole fault — a field name asserting a rule the arithmetic had
  // not applied.
  assert.ok(/simExitDTE: sim\.exitDTE/.test(src), "the stamp must be the simulator's own exitDTE");
  assert.ok(/simDays: sim\.horizon/.test(src), "and how far it actually walked");
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(f.e); process.exit(1); }
