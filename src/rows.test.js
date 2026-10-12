// ============================================================================
// src/rows.test.js — FIND, VERSION B: ONE ROW PER MARKET, AND "NOTHING FITS" (redesign PR 1, TASK 2).
// The rows are a view of the one sorted list (no new ranking); "Nothing fits" offers one fix that never passes a limit.
// ============================================================================
import assert from "node:assert/strict";
import { marketRows, rowCounts, rowStateOf, rankOptimize } from "./rows.js";
import { requestOf, nothingFits, nothingFitsLine, allMissLine, overLimitNote, resultsLine, RESET_ALL_FILTERS,
  optimizeSummary, optimizePlaceLine, optimizeRowNote, boardMoveLabel, heldText, RULES } from "./rules.js";

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


/* ---- OPTIMIZE (PR 65): Find's order and Find's request, on the candidates Build priced ---- */
// One priced candidate as `priceAlt()` returns it: the fields the ranking reads (rank, cand, size, gate) and no others.
const priced = (id, { ev100 = 0, pop = 0.5, risk = 100, gate = true, cut = false, loaded = false, dte = 45, expKey = "2026-11-20" } = {}) => (cut
  ? { id, expKey, dte, cut: { why: "liquidity", reasons: ["thin"] }, loaded }
  : { id, expKey, dte, loaded, label: id, legsText: id, cand: cand("UNG", id, pop, risk), size: sizer(500)(cand("UNG", id, pop, risk)),
    gate: { pass: gate, violations: gate ? [] : [{ message: "Over the exposure cap." }] }, gateText: gate ? "✓ The gate passes it at this size." : "✗ Over the exposure cap.",
    rank: { ev100, lf: { pop, rr: 0.5 }, past: null, fused: null, sent: "bull" } });

test("OPTIMIZE RANKS IN THE OWNER'S FIND ORDER, THE ONES THAT FIT FIRST, TOP FIVE AS O1…O5; floors and misses counted", () => {
  const req = requestOf({ amt: 500, minChance: 0.4 }, { perTradeLimit: 500 });
  const list = [priced("A", { ev100: 3 }), priced("B", { ev100: 9, loaded: true }), priced("C", { ev100: 12, pop: 0.2 }),
    priced("D", { ev100: 15, gate: false }), priced("E", { cut: true }), priced("F", { ev100: 1, dte: 80, expKey: "2027-01-15" }),
    priced("G", { ev100: 6 }), priced("H", { ev100: 5 }), priced("I", { ev100: 4 })];
  const r = rankOptimize(list, req, "ev");
  assert.deepEqual(r.rows.map((x) => `${x.tag}:${x.id}`), ["O1:B", "O2:G", "O3:H", "O4:I", "O5:A"],
    "by future avg, highest first; C misses the chance asked, D the gate, E a floor");
  assert.equal(r.checked, 9); assert.equal(r.cut, 1); assert.equal(r.fitting, 6); assert.equal(r.missing, 2);
  assert.equal(r.expiries, 2); assert.equal(r.lo, 45); assert.equal(r.hi, 80);
  assert.deepEqual(r.place, { rank: 1, of: 6, fits: true });
  // The same candidates under "Chance": C (20%) cannot fit, the rest tie at 50% and keep the search's order.
  assert.deepEqual(rankOptimize(list, req, "chance").rows.map((x) => x.id), ["A", "B", "F", "G", "H"]);
  // Nothing fits: the best that miss, in the order, each with its reason in the request's or the gate's words.
  const none = rankOptimize([priced("C", { ev100: 12, pop: 0.2 }), priced("D", { ev100: 15, gate: false })], req, "ev");
  assert.equal(none.anyFit, false);
  assert.deepEqual(none.rows.map((x) => x.id), ["D", "C"]);
  assert.equal(none.rows[0].reason, "✗ Over the exposure cap.");
  assert.ok(none.rows[1].reason.startsWith("chance 20%"));
  // Where the trade on Build sits when it misses, when a floor cut it, and when it is not among them.
  assert.deepEqual(rankOptimize([priced("C", { pop: 0.2, loaded: true })], req, "ev").place, { fits: false });
  assert.deepEqual(rankOptimize([priced("E", { cut: true, loaded: true })], req, "ev").place, { cut: true });
  assert.equal(rankOptimize([priced("A")], req, "ev").place, null);
  assert.deepEqual(rankOptimize([], req, "ev"), { checked: 0, expiries: 0, lo: null, hi: null, cut: 0, fitting: 0, missing: 0, rows: [], anyFit: false, place: null });
});

test("OPTIMIZE'S WORDS: the summary counts, the place, a row's note, a move's name", () => {
  assert.equal(optimizeSummary({ checked: 34, expiries: 4, lo: 31, hi: 86, fitting: 9, missing: 6, cut: 19 }),
    "Checked 34 on 4 expiries, 31–86 days: 9 fit your request, 6 miss it, 19 fail a floor.");
  assert.equal(optimizeSummary({ checked: 7, expiries: 1, lo: 44, hi: 44, fitting: 1, missing: 1, cut: 0 }),
    "Checked 7 on 1 expiry, 44 days: 1 fits your request, 1 misses it.");
  assert.equal(optimizePlaceLine({ rank: 3, of: 9, fits: true }), "Your trade ranks 3rd of the 9 that fit.");
  assert.equal(optimizePlaceLine({ rank: 1, of: 9, fits: true }), "Your trade is the best of the 9 that fit.");
  assert.equal(optimizePlaceLine({ rank: 1, of: 1, fits: true }), "Your trade is the only one that fits.");
  assert.equal(optimizePlaceLine({ fits: false }), "Your trade misses your request.");
  assert.equal(optimizePlaceLine(null), null);
  assert.equal(optimizeRowNote({ dte: 44, place: "future avg +4.2 per $100" }), `44 days, held ${heldText(44)} · future avg +4.2 per $100`);
  assert.equal(heldText(44), `~${44 - RULES.exitDTE} days (exit at ${RULES.exitDTE} DTE)`);
  assert.ok(optimizeRowNote({ reason: "over budget by $40", dte: 44 }).startsWith("Misses: over budget by $40 · 44 days"));
  assert.deepEqual(["same", "up", "down", "wider", "narrower"].map((m) => boardMoveLabel(m, 2)),
    ["Same strikes", "Two steps higher", "Two steps lower", "Wings two steps wider", "Wings two steps narrower"]);
  assert.equal(boardMoveLabel("up", 1), "One step higher");
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) process.exit(1);
