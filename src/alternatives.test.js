// PR 4b — the alternatives of a structure, from the chain: Build's variants and a position's roll.
import assert from "node:assert/strict";
import { shiftLegs, widthLegs, sameOnBoard, laterExpiries, variantsOf, rollCandidates, rollEligible, daysTo,
  windowExpiries, movesOnBoard, optimizeCandidates, OPTIMIZE_STEPS, rollJudge, rankRolls, nearestListedOf } from "./alternatives.js";
import { ROLL_WHY, VARIANT_LABELS, gateLine, rollWholeLine, rollSummaryLine, ROLL_NONE_SAFE, listedFixLead, LISTED_FIX_NONE } from "./rules.js";
import { expiryStrikes, boardStrikes } from "./chain.js";
import { xleChain, XLE_EK, XLE_SPOT, OWNER_CONDOR, hasUnlistedPut } from "./fixtures/xleListed.js";

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

test("ROLL CANDIDATES (PR 65: Optimize's search on the LATER expiries): same strikes, up to two steps up, down, wider, narrower", () => {
  // Two steps, to hold the search at its widest; the app's default is OPTIMIZE_STEPS (one, task 64.5's measurement).
  const r = rollCandidates({ legs: BCS, expKey: "2026-11-20", chain, spot: 14.2, now: NOW, steps: 2 });
  assert.deepEqual(rollCandidates({ legs: BCS, expKey: "2026-11-20", chain, spot: 14.2, now: NOW }).map((x) => `${x.kind}${x.step || ""}`),
    ["roll", "rollUp1", "rollDown1", "rollWider1"], "by default, one listed step");
  assert.deepEqual(r.map((x) => `${x.kind}${x.step || ""}@${x.expKey}`), ["roll@2026-12-18", "rollUp1@2026-12-18", "rollDown1@2026-12-18",
    "rollUp2@2026-12-18", "rollDown2@2026-12-18", "rollWider1@2026-12-18", "rollWider2@2026-12-18"]);
  assert.deepEqual(r[0].legs.map((l) => l.strike), [14, 15]);
  assert.deepEqual(r.find((x) => x.kind === "rollWider" && x.step === 2).legs.map((l) => l.strike), [14, 17]);
  assert.ok(r.every((x) => x.expKey > "2026-11-20"), "a roll is only ever later");
  assert.deepEqual(rollCandidates({ legs: BCS, expKey: "2026-12-18", chain, now: NOW }), [], "nothing later inside the window");
  assert.equal(rollCandidates({ legs: BCS, expKey: "2026-11-20", chain, now: NOW }).some((x) => x.move === "wider"), false, "no spot read: no width, never a guess");
});

test("OPTIMIZE (PR 65): every expiry in the window × every move up to OPTIMIZE_STEPS, chain-listed only; the loaded trade is marked", () => {
  assert.equal(OPTIMIZE_STEPS, 1, "one step: the rule fixed before measuring (scripts/measure-optimize.mjs)");
  assert.deepEqual(windowExpiries(chain, { now: NOW }), ["2026-11-20", "2026-12-18"], "January (102 days) and March are past the window");
  const m = movesOnBoard(BCS, [12, 13, 14, 15, 16, 17], 14.2, 2);
  assert.deepEqual(m.map((x) => `${x.move}${x.step}`), ["same0", "up1", "down1", "up2", "down2", "wider1", "wider2"]);
  assert.deepEqual(movesOnBoard(BCS, [12, 13, 14, 15, 16, 17], 14.2, 1).map((x) => `${x.move}${x.step}`), ["same0", "up1", "down1", "wider1"],
    "one step is a subset of two");
  const o = optimizeCandidates({ legs: BCS, expKey: "2026-11-20", chain, spot: 14.2, now: NOW, steps: 2 });
  assert.equal(o.length, 14, "seven moves on each of the two boards in the window");
  assert.equal(optimizeCandidates({ legs: BCS, expKey: "2026-11-20", chain, spot: 14.2, now: NOW }).length, 8, "four a board at the default step");
  assert.equal(o.filter((x) => x.loaded).length, 1, "the loaded trade once");
  assert.deepEqual(o.find((x) => x.loaded), { kind: "optimize", move: "same", step: 0, legs: BCS, expKey: "2026-11-20", loaded: true });
  for (const x of o) for (const l of x.legs) assert.ok(Object.keys(chain.byExp[x.expKey].calls).map(Number).includes(l.strike), `${x.move}${x.step}@${x.expKey} names a listed strike`);
  // A trade built on an expiry outside the window is still ranked: its own board is searched too.
  const far = optimizeCandidates({ legs: [{ side: 1, qty: 1, type: "call", strike: 14 }, { side: -1, qty: 1, type: "call", strike: 15 }],
    expKey: "2027-01-15", chain, spot: 14.2, now: NOW });
  assert.ok(far.some((x) => x.expKey === "2027-01-15" && x.loaded));
  assert.deepEqual(optimizeCandidates({ legs: BCS, expKey: "2026-11-20", chain: null, now: NOW }), [], "no chain: nothing invented");
});

/* ---- A ROLL JUDGED ON THE WHOLE TRADE (PR 65) ---- */
// An independent normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7), not engine.js's, to hold the judge to the lognormal.
const ncdf = (x) => { const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2; };
const above = (K, { S, sigma, dte, drift = 0 }) => { const T = dte / 365, s = sigma * Math.sqrt(T), m = (drift - sigma * sigma / 2) * T;
  return 1 - ncdf((Math.log(K / S) - m) / s); };

test("ROLL JUDGE: today's loss plus the new trade at the size held; never more risk than accepted; the chances are the lognormal's", () => {
  // The new trade: the 14/15 call spread at 0.40 — X per combination runs from -$40 (below 14) to +$60 (above 15).
  const mc = { driftAnnual: 0, sigma: 0.4, dte: 60, ev: 2.5 };
  const base = { realized: -120, n: 3, legs: BCS, entryNet: 0.4, spot: 14.2, mc, maxLoss: -40 };
  const j = rollJudge({ ...base, accepted: 300, target: 30 });
  assert.equal(j.ok, true); assert.equal(j.why, "ok");
  assert.equal(j.worst, -120 + 3 * -40, "the close's loss plus three new maximum losses");
  // Back to zero: -120 + 3X ≥ 0 ⇔ X ≥ 40 ⇔ the spread pays 0.80 ⇔ the price ends at 14.80 or more.
  assert.ok(Math.abs(j.back - above(14.8, { S: 14.2, sigma: 0.4, dte: 60 })) < 1e-6, `back ${j.back}`);
  // The target ($30 on the whole): X ≥ 50 ⇔ 14.90 or more.
  assert.ok(Math.abs(j.target - above(14.9, { S: 14.2, sigma: 0.4, dte: 60 })) < 1e-6, `target ${j.target}`);
  assert.equal(j.avg, -120 + 3 * 2.5);
  // Over the risk accepted at entry: refused, with the figures that say why.
  const over = rollJudge({ ...base, accepted: 200 });
  assert.equal(over.ok, false); assert.equal(over.why, "overRisk"); assert.equal(over.worst, -240);
  assert.equal(rollJudge({ ...base, accepted: 240 }).ok, true, "exactly the accepted risk is within it");
  // A target out of reach is a chance of zero, not an unknown; no target is unknown.
  assert.equal(rollJudge({ ...base, accepted: 300, target: 90 }).target, 0);
  assert.equal(rollJudge({ ...base, accepted: 300 }).target, null);
  // Unknown is not zero: a missing P&L, size, accepted risk or model is never a pass.
  for (const miss of [{ realized: null }, { n: null }, { accepted: null }, { mc: null }, { maxLoss: null }, { n: 0 }]) {
    assert.equal(rollJudge({ ...base, accepted: 300, ...miss }).why, "noFigures", JSON.stringify(miss));
  }
});

test("ROLLS RANK BY THE CHANCE THE WHOLE TRADE GETS BACK TO ZERO, THEN THE AVERAGE; a refused one is never ranked", () => {
  const row = (id, back, avg, ok = true) => ({ id, judge: { ok, why: ok ? "ok" : "overRisk", back, avg } });
  assert.deepEqual(rankRolls([row("a", 0.3, 10), row("b", 0.5, -20), row("c", 0.5, 5), row("d", 0.9, 50, false), row("e", 0.3, null)]).map((r) => r.id),
    ["c", "b", "a", "e"]);
  assert.equal(rollWholeLine({ back: 0.412, target: 0.18, worst: -540, avg: -35 }),
    "Whole trade: back to $0 or better 41% · reaches your target 18% · worst -$540 · avg -$35");
  assert.equal(rollSummaryLine({ checked: 24, expiries: 3, kept: 9, overRisk: 13, cut: 2, accepted: 600 }),
    "Checked 24 rolls on 3 later expiries: 9 keep the whole trade within the $600 you accepted at entry; 13 would risk more and are not offered; 2 fail a floor.");
  assert.ok(ROLL_NONE_SAFE.includes("more at risk than you accepted"));
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

/* ====================================================================
   PR 70 — THE MOVES READ EACH LEG'S OWN SIDE OF THE BOARD. XLE 27 Nov (synthetic prices): 59.5 is a call, not a put.
==================================================================== */
const XC = xleChain();
const CONDOR = [{ side: 1, qty: 1, type: "put", strike: 60 }, { side: -1, qty: 1, type: "put", strike: 62.5 },
  { side: -1, qty: 1, type: "call", strike: 69 }, { side: 1, qty: 1, type: "call", strike: 72.5 }];

test("PR 70: ON THE UNION A PUT STEPPED ONTO 59.5 (the bug, shown); on the board's put side it never does", () => {
  // What the merged list did: one step down from 60 is 59.5 — a strike only the CALLS list.
  assert.ok(hasUnlistedPut(shiftLegs(CONDOR, expiryStrikes(XC, XLE_EK), -1)), "the union no longer shows the bug: the fixture changed");
  const down = shiftLegs(CONDOR, boardStrikes(XC, XLE_EK), -1);
  assert.deepEqual(down.map((l) => `${l.strike}${l.type[0]}`), ["57.5p", "60p", "67.5c", "70c"], "each leg one step along ITS type's strikes");
  assert.deepEqual(widthLegs(CONDOR, boardStrikes(XC, XLE_EK), XLE_SPOT, 1).map((l) => l.strike), [57.5, 62.5, 69, 75], "wider, per type");
  assert.equal(sameOnBoard([{ side: 1, type: "put", strike: 59.5 }], boardStrikes(XC, XLE_EK)), null, "59.5 is not a put on this board");
  assert.ok(sameOnBoard([{ side: 1, type: "call", strike: 59.5 }], boardStrikes(XC, XLE_EK)), "…and is a call");
});

test("PR 70: VARIANTS, OPTIMIZE AND THE ROLL NEVER PRODUCE A 59.5P", () => {
  const vs = variantsOf({ legs: CONDOR, expKey: XLE_EK, chain: XC, spot: XLE_SPOT, now: NOW });
  assert.ok(vs.length >= 3, "the variants are built");
  for (const v of vs) assert.equal(hasUnlistedPut(v.legs), false, `${v.kind} names a 59.5 put`);
  const opt = optimizeCandidates({ legs: CONDOR, expKey: XLE_EK, chain: XC, spot: XLE_SPOT, now: NOW, steps: 2 });
  assert.ok(opt.length >= 3, "Optimize's moves are built");
  for (const o of opt) assert.equal(hasUnlistedPut(o.legs), false, `Optimize ${o.move} ${o.step} names a 59.5 put`);
  const rolls = rollCandidates({ legs: CONDOR, expKey: "2026-10-30", chain: XC, spot: XLE_SPOT, now: NOW, steps: 2 });
  assert.ok(rolls.length >= 3, "the roll's moves are built");
  for (const r of rolls) assert.equal(hasUnlistedPut(r.legs), false, `roll ${r.kind} names a 59.5 put`);
});

test("PR 70: THE ONE-TAP FIX — the refused leg to the nearest strike its type lists and quotes; the rest untouched", () => {
  const fix = nearestListedOf({ legs: OWNER_CONDOR, expKey: XLE_EK, chain: XC, bad: [3] });
  assert.equal(fix.kind, "listed");
  assert.ok(VARIANT_LABELS.listed, "its label");
  assert.deepEqual(fix.legs.map((l) => `${l.strike}${l.type[0]}`), ["62.5p", "69c", "70c", "60p"], "59.5P → 60P, nothing else moved");
  assert.equal(fix.legs[3].side, 1, "still bought"); assert.equal(fix.expKey, XLE_EK, "the same expiry");
  assert.equal(listedFixLead(fix.moved), "The same structure on strikes this board lists and quotes: 59.5P → 60P.");
  // A bought put nobody bids for at 60 is skipped: the next nearest QUOTED put is 57.5 (62.5 is the short leg's).
  const noBid60 = xleChain((type, k, q) => (type === "put" && k === 60 ? { ...q, bid: 0 } : q));
  assert.equal(nearestListedOf({ legs: OWNER_CONDOR, expKey: XLE_EK, chain: noBid60, bad: [3] }).legs[3].strike, 57.5);
  // A put side with nothing quoted: no fix, and Send says so in words (LISTED_FIX_NONE), never a made-up strike.
  const dead = xleChain((type, k, q) => (type === "put" ? { ...q, mid: null, bid: 0, ask: 0 } : q));
  assert.equal(nearestListedOf({ legs: OWNER_CONDOR, expKey: XLE_EK, chain: dead, bad: [3] }), null);
  assert.ok(/pick another expiry/.test(LISTED_FIX_NONE));
  assert.equal(nearestListedOf({ legs: OWNER_CONDOR, expKey: "2027-01-15", chain: XC, bad: [3] }), null, "no board");
  assert.equal(nearestListedOf({ legs: OWNER_CONDOR, expKey: XLE_EK, chain: XC, bad: [] }), null, "nothing refused");
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) { for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`); process.exit(1); }
