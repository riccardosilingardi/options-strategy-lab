// ============================================================================
// src/marketView.test.js — WHAT THE MARKET PAGE WORKS OUT (redesign PR 1, TASK 3): the day change, the expected move,
// the latest news, the chain tap. One function each, tested here without a browser.
// ============================================================================
import assert from "node:assert/strict";
import { dayChange, expectedMove, latestNews, toggleChainLeg, legCell, etDate, dayWords } from "./marketView.js";
import { expectedMoveText, dayChangeText, ivRankText, legsMaxText, NEWS_NOT_READ, chainQuotedLegs, trayReplaceHint, trayReplacedText } from "./rules.js";
import { MLEG_MAX_LEGS } from "./alpacaContract.js";
import { xleChain, XLE_EK, OWNER_CONDOR, hasUnlistedPut } from "./fixtures/xleListed.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };
console.log("\nTHE MARKET PAGE — what it works out\n");

test("EXPECTED MOVE: 18.42 × 24.2% × √(47 ÷ 365) = ±$1.60, and a missing input is null", () => {
  const mv = expectedMove(18.42, 0.242, 47);
  assert.equal(mv.toFixed(2), "1.60");
  assert.equal(expectedMoveText(mv, "2026-11-20"), "Expected move to 20 Nov 2026: ±$1.60");
  assert.equal(expectedMove(18.42, null, 47), null);
  assert.equal(expectedMove(null, 0.242, 47), null);
  assert.equal(expectedMove(18.42, 0.242, 0), null);
  assert.equal(expectedMoveText(null, "2026-11-20"), null);
});

test("DAY CHANGE: the previous close is the last bar dated BEFORE TODAY in New York", () => {
  // Tuesday 6 Oct 2026, 15:00 New York (19:00 UTC); the feed already has today's partial bar.
  const now = Date.UTC(2026, 9, 6, 19, 0);
  assert.equal(etDate(now), "2026-10-06");
  const bars = [{ time: "2026-10-02", close: 18.0 }, { time: "2026-10-05", close: 18.3 }, { time: "2026-10-06", close: 18.5 }];
  const ch = dayChange(bars, 18.42, now);
  assert.equal(ch.prev, 18.3);
  assert.equal(ch.prevDay, "Mon 5 Oct");
  assert.equal(ch.change.toFixed(2), "0.12");
  assert.equal(dayChangeText(ch), "+0.12 (+0.7%) since the Mon 5 Oct close");
  // Sunday 4 Oct: Friday's close.
  assert.equal(dayChange(bars.slice(0, 1), 18.42, Date.UTC(2026, 9, 4, 12)).prevDay, "Fri 2 Oct");
  // 01:00 UTC on Tuesday is still Monday in New York: Monday's own bar is not "before today".
  assert.equal(dayChange(bars.slice(0, 2), 18.42, Date.UTC(2026, 9, 6, 1)).prev, 18.0);
});

test("DAY CHANGE: no bars, no earlier bar or no spot → null (the header prints no change line, and fetches nothing)", () => {
  assert.equal(dayChange([], 18.42), null);
  assert.equal(dayChange(null, 18.42), null);
  assert.equal(dayChange([{ time: "2026-10-06", close: 18 }], 18.42, Date.UTC(2026, 9, 6, 19)), null);
  assert.equal(dayChange([{ time: "2026-10-05", close: 18 }], null, Date.UTC(2026, 9, 6, 19)), null);
  assert.equal(dayChangeText(null), null);
  assert.equal(dayWords("2026-10-02"), "Fri 2 Oct");
});

test("IV RANK UNDER 20 DAYS IS 'collecting, N of 20 days' — never a number", () => {
  assert.equal(ivRankText(null, 7), "IV rank: collecting, 7 of 20 days");
  assert.equal(ivRankText(34, 25), "IV rank 34");
});

test("LATEST NEWS: the newest tagged headline; none tagged → the factor's own words; failed → the sentence", () => {
  const items = [
    { title: "Corn futures rally as USDA cuts crop estimate", date: "2026-10-03T10:00:00Z", src: "Reuters" },
    { title: "Drought hits corn belt, corn prices jump", date: "2026-10-04T06:00:00Z", src: "AgWeb" },
    { title: "Gold slips as dollar firms", date: "2026-10-04T08:00:00Z", src: "Kitco" },
  ];
  const n = latestNews("CORN", items, { at: 1 });
  assert.equal(n.title, "Drought hits corn belt, corn prices jump");
  assert.equal(n.source, "AgWeb");
  assert.match(latestNews("UNG", items, { at: 1 }).none, /none of the 3 headlines read tag UNG/);
  assert.deepEqual(latestNews("CORN", items, { err: "timeout" }), { failed: true });
  assert.equal(NEWS_NOT_READ, "News not read: the feed did not answer.");
  assert.equal(latestNews("CORN", items, { loading: true }), null, "still loading");
});

test("THE CHAIN TAP: an ask buys one, a bid sells one, the same cell again removes it, the other side replaces it", () => {
  let r = toggleChainLeg([], { type: "put", strike: 18, side: 1 });
  assert.deepEqual(r.legs, [{ type: "put", strike: 18, side: 1, qty: 1 }]);
  assert.equal(legCell(r.legs, "put", 18), "ask");
  r = toggleChainLeg(r.legs, { type: "put", strike: 17, side: -1 });
  assert.deepEqual(r.legs.map((l) => `${l.side > 0 ? "+" : "-"}${l.strike}P`), ["-17P", "+18P"]);
  r = toggleChainLeg(r.legs, { type: "put", strike: 18, side: 1 });
  assert.deepEqual(r.legs.map((l) => l.strike), [17], "the same cell removes it");
  r = toggleChainLeg(r.legs, { type: "put", strike: 17, side: 1 });
  assert.deepEqual(r.legs, [{ type: "put", strike: 17, side: 1, qty: 1 }], "the other side of one contract replaces it");
});

test("AT MOST MLEG_MAX_LEGS (4, read from alpacaContract.js): a fifth tap changes nothing and says so", () => {
  let legs = [];
  for (const k of [16, 17, 18, 19]) legs = toggleChainLeg(legs, { type: "call", strike: k, side: 1 }, MLEG_MAX_LEGS).legs;
  assert.equal(legs.length, 4);
  const r = toggleChainLeg(legs, { type: "call", strike: 20, side: 1 }, MLEG_MAX_LEGS);
  assert.equal(r.full, true);
  assert.equal(r.legs, legs);
  assert.equal(legsMaxText(MLEG_MAX_LEGS), "Four legs at most. Clear one to add another.");
  // Removing one still works at the cap.
  assert.equal(toggleChainLeg(legs, { type: "call", strike: 16, side: 1 }, MLEG_MAX_LEGS).legs.length, 3);
});

/* PR 70 — "EDIT IN CHAIN" REPLACES THE LEG THE BOARD DOES NOT LIST. The owner's condor (XLE 27 Nov) came to the tray with a
   59.5P the board lists no put for: no cell to tap it away, four legs, and every other tap refused as full. */
const XB = xleChain().byExp[XLE_EK];
// The market page's `trayLegQuoted()`: the generation sites' one predicate, its "unquoted" half, on this board's quote.
const quoted = (l) => {
  const q = (XB[l.type === "call" ? "calls" : "puts"] || {})[l.strike];
  return chainQuotedLegs({ legs: [l], quotes: [q ? { bid: q.bid, ask: q.ask, real: q.mid != null } : null] }).unquoted.length === 0;
};
test("PR 70, BEFORE: with no board to ask, the owner's four legs refuse the 60P as full — the leg could never be swapped", () => {
  const r = toggleChainLeg(OWNER_CONDOR, { type: "put", strike: 60, side: 1 }, MLEG_MAX_LEGS);
  assert.equal(r.full, true, "this is what the owner met");
  assert.equal(r.replaced, null);
  assert.ok(hasUnlistedPut(r.legs), "the 59.5P stays");
});
test("PR 70, AFTER: a tap on the same type and side REPLACES the unlisted leg (not added), keeps its size, and says so", () => {
  assert.equal(quoted(OWNER_CONDOR[3]), false, "the 59.5P is not quoted on this board");
  assert.equal(OWNER_CONDOR.slice(0, 3).every(quoted), true, "the other three are");
  const withQty = OWNER_CONDOR.map((l, i) => (i === 3 ? { ...l, qty: 2 } : l));
  const r = toggleChainLeg(withQty, { type: "put", strike: 60, side: 1 }, MLEG_MAX_LEGS, quoted);
  assert.equal(r.full, false);
  assert.equal(r.legs.length, 4, "replaced, not added");
  assert.equal(hasUnlistedPut(r.legs), false, "the 59.5P is gone");
  const put60 = r.legs.find((l) => l.type === "put" && l.strike === 60);
  assert.ok(put60 && put60.side === 1 && put60.qty === 2, "bought, at the size the leg had");
  assert.deepEqual(r.legs.map((l) => `${l.side > 0 ? "+" : "-"}${l.strike}${l.type[0].toUpperCase()}`), ["+60P", "-62.5P", "-69C", "+70C"], "in strike order");
  assert.equal(trayReplacedText(r.replaced.from, r.replaced.to), "59.5P replaced by 60P.");
  assert.equal(trayReplaceHint(OWNER_CONDOR[3]), "No 59.5P on this board: tap a put ask to replace it.");
  // The other side (a put BID) is not the leg's side: it is an ordinary tap — here, a fifth leg, refused as full.
  assert.equal(toggleChainLeg(OWNER_CONDOR, { type: "put", strike: 60, side: -1 }, MLEG_MAX_LEGS, quoted).full, true);
  // A CALL tap never replaces a put.
  assert.equal(toggleChainLeg(OWNER_CONDOR, { type: "call", strike: 72.5, side: 1 }, MLEG_MAX_LEGS, quoted).full, true);
  // A tray whose legs are all quoted taps exactly as before.
  const fine = OWNER_CONDOR.slice(0, 3);
  assert.deepEqual(toggleChainLeg(fine, { type: "put", strike: 60, side: 1 }, MLEG_MAX_LEGS, quoted).legs.length, 4, "added as before");
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
