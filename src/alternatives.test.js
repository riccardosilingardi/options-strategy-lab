// PR 4b — the alternatives of a structure, from the chain: Build's variants and a position's roll.
import assert from "node:assert/strict";
import { shiftLegs, widthLegs, sameOnBoard, laterExpiries, variantsOf, rollCandidates, rollEligible, daysTo } from "./alternatives.js";
import { ROLL_WHY, VARIANT_LABELS, gateLine } from "./rules.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); } };

const board = (ks) => ({ calls: Object.fromEntries(ks.map((k) => [k, { bid: 0.1, ask: 0.2 }])), puts: Object.fromEntries(ks.map((k) => [k, { bid: 0.1, ask: 0.2 }])) });
const NOW = Date.parse("2026-10-05T14:00:00Z");
const chain = { spot: 14.2, byExp: {
  "2026-11-20": board([12, 13, 14, 15, 16, 17]),
  "2026-12-18": board([12, 13, 14, 15, 16, 17, 18]),
  "2027-01-15": board([13, 14, 15, 16]),
  "2027-03-19": board([12, 13, 14, 15, 16, 17]),
} };
const BCS = [{ side: 1, qty: 1, type: "call", strike: 14 }, { side: -1, qty: 1, type: "call", strike: 15 }];
const IC = [{ side: 1, qty: 1, type: "put", strike: 12 }, { side: -1, qty: 1, type: "put", strike: 13 },
  { side: -1, qty: 1, type: "call", strike: 16 }, { side: 1, qty: 1, type: "call", strike: 17 }];

console.log("\nPR 4b — the alternatives of a structure\n");

test("SHIFT: every leg one listed strike; off the board or off the list is null, never snapped", () => {
  const s = [12, 13, 14, 15, 16, 17];
  assert.deepEqual(shiftLegs(BCS, s, 1).map((l) => l.strike), [15, 16]);
  assert.deepEqual(shiftLegs(BCS, s, -1).map((l) => l.strike), [13, 14]);
  assert.equal(shiftLegs(IC, s, 1), null, "17 has no step above");
  assert.equal(shiftLegs([{ side: 1, type: "call", strike: 14.5 }], s, 1), null, "a strike the board does not list");
  assert.equal(shiftLegs(BCS, null, 1), null, "no chain: unknown, nothing invented");
});

test("WIDTH: the outer leg of each pair one step out or in; never onto or past its pair; a butterfly has no width", () => {
  const s = [12, 13, 14, 15, 16, 17];
  assert.deepEqual(widthLegs(BCS, s, 14.2, 1).map((l) => l.strike), [14, 16], "wider: the short call (outer) moves out");
  assert.equal(widthLegs(BCS, s, 14.2, -1), null, "narrower would land on its pair");
  assert.deepEqual(widthLegs(IC, [11, 12, 13, 14, 15, 16, 17, 18], 14.5, 1).map((l) => l.strike), [11, 13, 16, 18], "both wings out");
  const fly = [{ side: 1, type: "call", strike: 13 }, { side: -1, qty: 2, type: "call", strike: 14 }, { side: 1, type: "call", strike: 15 }];
  assert.equal(widthLegs(fly, s, 14, 1), null);
  assert.equal(widthLegs([{ side: 1, type: "put", strike: 14 }], s, 14, 1), null, "a single option has no width");
});

test("LATER EXPIRIES: after the current one, inside the entry window, nearest first; days to the 4pm close", () => {
  assert.equal(daysTo("2026-11-20", NOW), 46);
  assert.deepEqual(laterExpiries(chain, "2026-11-20", { now: NOW }), ["2026-12-18"], "January is past maxEntryDTE (102 days)");
  assert.deepEqual(laterExpiries(chain, "2026-11-20", { now: NOW, max: 200 }), ["2026-12-18", "2027-01-15", "2027-03-19"]);
  assert.deepEqual(laterExpiries(null, "2026-11-20", { now: NOW }), []);
  assert.equal(sameOnBoard(IC, Object.keys(chain.byExp["2027-01-15"].calls).map(Number)), null, "12 and 17 are not listed in January");
});

test("BUILD'S VARIANTS: up, down, wider, the next expiry — only what the chain lists, nothing equal to the loaded legs", () => {
  const v = variantsOf({ legs: BCS, expKey: "2026-11-20", chain, spot: 14.2, now: NOW });
  assert.deepEqual(v.map((x) => x.kind), ["up", "down", "wider", "later"]);
  assert.equal(v.find((x) => x.kind === "later").expKey, "2026-12-18");
  for (const x of v) for (const l of x.legs) assert.ok(Object.keys(chain.byExp[x.expKey].calls).map(Number).includes(l.strike), `${x.kind} names a listed strike`);
  for (const k of Object.keys(VARIANT_LABELS)) assert.ok(VARIANT_LABELS[k].length > 3);
});

test("ROLL CANDIDATES: the same structure on the later expiries the window allows — same strikes, one step up and down", () => {
  const r = rollCandidates({ legs: BCS, expKey: "2026-11-20", chain, now: NOW });
  assert.deepEqual(r.map((x) => `${x.kind}@${x.expKey}`), ["roll@2026-12-18", "rollUp@2026-12-18", "rollDown@2026-12-18"]);
  assert.deepEqual(r[0].legs.map((l) => l.strike), [14, 15]);
  assert.deepEqual(rollCandidates({ legs: BCS, expKey: "2026-12-18", chain, now: NOW }), [], "nothing later inside the window");
});

test("A ROLL IS OFFERED ONLY WHEN NOT IN PROFIT AND THE REASONS HOLD; unknown is a no with its reason", () => {
  const held = [{ readAtEntry: true, turned: false }, { readAtEntry: true, turned: false }, { readAtEntry: false, turned: false }];
  assert.deepEqual(rollEligible({ pnl: -40, factors: held }), { ok: true, why: "ok" });
  assert.deepEqual(rollEligible({ pnl: 0, factors: held }), { ok: true, why: "ok" }, "flat is not in profit");
  assert.equal(rollEligible({ pnl: 12, factors: held }).why, "inProfit");
  assert.equal(rollEligible({ pnl: null, factors: held }).why, "noPnl");
  assert.equal(rollEligible({ pnl: -40, factors: [{ readAtEntry: true, turned: true }, ...held] }).why, "turned");
  assert.equal(rollEligible({ pnl: -40, factors: [{ readAtEntry: false }] }).why, "notRecorded");
  assert.equal(rollEligible({ pnl: -40, factors: held, working: true }).why, "working");
  assert.equal(rollEligible({ pnl: -40, factors: held, notHeld: true }).why, "notHeld");
  for (const k of ["ok", "notHeld", "working", "noPnl", "inProfit", "notRecorded", "turned"]) assert.ok(ROLL_WHY[k], k);
});

test("THE GATE LINE: passes, or its first refusal in the gate's own words", () => {
  assert.equal(gateLine({ pass: true, violations: [] }), "✓ The gate passes it at this size.");
  assert.equal(gateLine({ pass: false, violations: [{ message: "Over the per-trade limit." }] }), "✗ Over the per-trade limit.");
  assert.equal(gateLine(null), "The gate has not run on it.");
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`); process.exit(1); }
