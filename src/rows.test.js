// ============================================================================
// src/rows.test.js — FIND, VERSION B: ONE ROW PER MARKET, AND "NOTHING FITS" (redesign PR 1, TASK 2).
// The rows are a view of the one sorted list (no new ranking); "Nothing fits" offers one fix that never passes a limit.
// ============================================================================
import assert from "node:assert/strict";
import { marketRows, rowCounts, rowStateOf } from "./rows.js";
import { requestOf, nothingFits, nothingFitsLine, allMissLine, overLimitNote, resultsLine, RESET_ALL_FILTERS } from "./rules.js";

let passed = 0; const failures = [];
const test = (name, fn) => { try { fn(); passed++; console.log(`  ok   ${name}`); } catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name} — ${e.message}`); } };
console.log("\nFIND, VERSION B — rows and 'Nothing fits'\n");

const cand = (tk, name, pop, risk) => ({ ticker: tk, tk, name, pop, rr: 0.5, maxProfit: risk / 2, maxLoss: -risk, risk, key: `${tk}|${name}|${risk}` });
const item = (tk, name, pop, risk) => ({ key: `${tk}|${name}|${risk}`, tk, cand: cand(tk, name, pop, risk) });
// The size a budget buys, the shape `scaleStrategy()` returns: one contract's risk is `unit`.
const sizer = (amt) => (c) => ({ ok: c.risk <= amt, n: Math.floor(amt / c.risk), unit: c.risk });

test("ONE ROW PER MARKET, IN THE ORDER OF ITS CARD; THE ROW'S CARD IS THE FIRST THAT FITS", () => {
  // Already sorted (the caller's order). At "chance at least 60%", CORN's first card misses and its second fits.
  const items = [item("CORN", "Bull Call Spread", 0.4, 100), item("GLD", "Iron Condor", 0.7, 120),
    item("CORN", "Bull Put Spread", 0.65, 75), item("UNG", "Bear Call Spread", 0.3, 90)];
  const req = requestOf({ amt: 500, minChance: 0.6 }, { perTradeLimit: 500 });
  const rows = marketRows(items, req, sizer(500));
  assert.deepEqual(rows.map((r) => r.tk), ["GLD", "CORN", "UNG"], "CORN sits where its fitting card sits");
  assert.equal(rows[1].x.cand.name, "Bull Put Spread");
  assert.equal(rows[1].cards, 2); assert.equal(rows[1].fitting, 1);
  // UNG has no card that fits: its first card, as a miss, in its own place.
  assert.equal(rows[2].fits, false);
  assert.ok(rows[2].misses.length && rows[2].misses[0].short.startsWith("chance"));
  assert.deepEqual(rowCounts(rows), { n: 2, m: 3 });
  assert.equal(resultsLine(2, 1, false, { unit: "rows" }), "2 of 3 fit · 1 dimmed");
  assert.equal(resultsLine(2, 1, true, { unit: "rows" }), "2 of 3 fit · 1 hidden");
});

test("A MISS STAYS IN ITS PLACE: a market whose only card misses sits where that card sits, not at the bottom", () => {
  const items = [item("UNG", "Bear Call Spread", 0.3, 90), item("GLD", "Iron Condor", 0.7, 120)];
  const rows = marketRows(items, requestOf({ amt: 500, minChance: 0.6 }, { perTradeLimit: 500 }), sizer(500));
  assert.deepEqual(rows.map((r) => [r.tk, r.fits]), [["UNG", false], ["GLD", true]]);
});

test("NO NEW RANKING: with nothing asked every market's row is its first card", () => {
  const items = [item("GLD", "A", 0.2, 50), item("CORN", "B", 0.9, 50), item("GLD", "C", 0.9, 50)];
  const rows = marketRows(items, requestOf({}, {}), () => ({ ok: true, n: 1, unit: 50 }));
  assert.deepEqual(rows.map((r) => r.x.cand.name), ["A", "B"]);
});

test("A MARKET NOT IN: its chain, its season, the rest, a failure or no board — said on its row", () => {
  const g = { loading: ["SOYB"], failed: [{ tk: "BOIL", why: "the feed did not answer" }], noBoard: ["XLE"] };
  assert.deepEqual(rowStateOf("SOYB", g), { state: "chain" });
  assert.deepEqual(rowStateOf("BOIL", g), { state: "failed", why: "the feed did not answer" });
  assert.deepEqual(rowStateOf("XLE", g), { state: "noBoard" });
  assert.deepEqual(rowStateOf("CORN", g, { reading: true, waiting: ["seasonal", "news"] }), { state: "season" });
  assert.deepEqual(rowStateOf("CORN", g, { reading: true, waiting: ["news"] }), { state: "waiting" });
  assert.equal(rowStateOf("CORN", g, { reading: false, waiting: [] }), null);
});

test("NOTHING FITS — the owner's case: a $50 budget, the cheapest is CORN's bull put spread at $75 → 'Set budget to $75'", () => {
  const cands = [cand("CORN", "Bull Put Spread", 0.6, 75), cand("GLD", "Iron Condor", 0.7, 120), cand("UNG", "Bear Call Spread", 0.5, 90)];
  const req = requestOf({ amt: 50 }, { perTradeLimit: 250 });
  const nf = nothingFits(cands, req, sizer(50));
  assert.equal(nf.control, "size");
  assert.equal(nothingFitsLine(nf.control), "Nothing fits your budget.");
  assert.deepEqual(nf.cheapest, { tk: "CORN", name: "Bull Put Spread", risk: 75 });
  assert.equal(allMissLine(3, nf.cheapest), "All 3 markets miss. Cheapest here: CORN Bull Put Spread, $75 risk.");
  assert.equal(nf.fix.label, "Set budget to $75");
  assert.deepEqual(nf.fix.patch, { amt: 75 });
  assert.equal(nf.overLimit, null);
});

test("NOTHING FITS — THE FIX NEVER PASSES A LIMIT: the cheapest over the per-trade limit is said, and the budget is not offered", () => {
  const cands = [cand("CORN", "Bull Put Spread", 0.6, 75)];
  const req = requestOf({ amt: 50 }, { perTradeLimit: 60 });
  const nf = nothingFits(cands, req, sizer(50));
  assert.equal(nf.fix, null, "no budget move past $60");
  assert.equal(nf.reset, true);
  assert.equal(nf.overLimit, 60);
  assert.equal(overLimitNote(nf.overLimit), "It is over your $60 per-trade limit.");
  assert.equal(RESET_ALL_FILTERS, "Reset filters");
});

test("NOTHING FITS — another chip: a chance asked too high offers the chance that lets one in", () => {
  const cands = [cand("CORN", "Bull Put Spread", 0.54, 75), cand("GLD", "Iron Condor", 0.31, 120)];
  const req = requestOf({ amt: 500, minChance: 0.7 }, { perTradeLimit: 500 });
  const nf = nothingFits(cands, req, sizer(500));
  assert.equal(nf.control, "chance");
  assert.equal(nf.fix.label, "Set chance to 54%");
  assert.deepEqual(nf.fix.patch, { minChance: 0.54 });
});

test("NOTHING FITS — no single chip lets a card in → 'Reset filters'; and something fitting → nothing to say", () => {
  const cands = [cand("CORN", "Bull Put Spread", 0.3, 75)];
  const req = requestOf({ amt: 50, minChance: 0.7 }, { perTradeLimit: 500 });
  const nf = nothingFits(cands, req, sizer(50));
  assert.equal(nf.fix, null); assert.equal(nf.reset, true);
  assert.equal(nothingFits([cand("CORN", "X", 0.8, 40)], req, sizer(50)), null);
  assert.equal(nothingFits([], req, sizer(50)), null);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
