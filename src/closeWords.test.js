// Tests for PR #43, TASK 1 — order path 3 wrote out a different order from the
// one it sent (non-negotiable rule 5).
//
// Measured on main (1267d9d), 24 Sep 2026, on a /v2/positions payload shaped
// like the owner's only holding, 9 x GDX 94P 2026-10-30, chain bid 4.60 / ask
// 4.90. The BODY was right; the confirm step said "SELL to close 1 x", "1
// combination, a limit of $42.08 for one combination" and "a debit of $4.68
// (you pay it)" — while the order sold 9 puts at 4.68 each, a credit.
//
// Plain Node, no framework: `npm test` runs this file directly.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { prepareClose, sendClose, holdingGroups } from "./closeOrder.js";
import { orderMoney, orderLimitWords, orderTotalWords, orderOutcome, orderPreviewLines } from "./order.js";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const gate = () => ({ pass: true, violations: [] });
const q = (bid, ask) => ({ bid, ask, mid: (bid + ask) / 2 });
const P94 = "GDX261030P00094000", P90 = "GDX261030P00090000";
const CASES = {
  "1 x put": {
    positions: [{ symbol: P94, qty: "1", cost_basis: "500", unrealized_pl: "-25" }],
    puts: { 94: q(4.6, 4.9) },
  },
  "9 x put — the owner's holding": {
    positions: [{ symbol: P94, qty: "9", cost_basis: "4500", unrealized_pl: "-225" }],
    puts: { 94: q(4.6, 4.9) },
  },
  "3 x debit put spread 94/90": {
    positions: [{ symbol: P94, qty: "3", cost_basis: "1500", unrealized_pl: "0" },
      { symbol: P90, qty: "-3", cost_basis: "-600", unrealized_pl: "0" }],
    puts: { 94: q(4.6, 4.9), 90: q(2.0, 2.2) },
  },
};
async function prep(name) {
  const c = CASES[name];
  const [g] = holdingGroups(c.positions);
  return prepareClose(g, { gate, demo: false,
    fetchChain: async () => ({ byExp: { "2026-10-30": { puts: c.puts, calls: {} } } }) });
}
const ACCEPT = async (_path, _m, b) => ({ id: "abcdef1234", status: "accepted", qty: b.qty, filled_qty: "0",
  type: "limit", limit_price: b.limit_price, time_in_force: "day", side: b.side, order_class: b.order_class || "simple",
  legs: b.legs });

/* ---------------- the bodies do not move ---------------- */

// Captured from main (1267d9d) with these exact fixtures. `orderBody()` is not
// touched by this PR; this holds it to that, byte for byte.
const MAIN_BODIES = {
  "1 x put": `{"symbol":"GDX261030P00094000","qty":"1","side":"sell","type":"limit","time_in_force":"day","limit_price":"4.67"}`,
  "9 x put — the owner's holding": `{"symbol":"GDX261030P00094000","qty":"9","side":"sell","type":"limit","time_in_force":"day","limit_price":"4.68"}`,
  "3 x debit put spread 94/90": `{"order_class":"mleg","qty":"3","type":"limit","time_in_force":"day","legs":[{"symbol":"GDX261030P00094000","ratio_qty":"1","side":"sell","position_intent":"sell_to_close"},{"symbol":"GDX261030P00090000","ratio_qty":"1","side":"buy","position_intent":"buy_to_close"}],"limit_price":"-2.52"}`,
};
for (const name of Object.keys(CASES)) {
  await test(`BODY UNCHANGED — ${name}: byte-identical to main's`, async () => {
    const p = await prep(name);
    assert.equal(p.ok, true, p.refusal);
    assert.equal(JSON.stringify(p.body), MAIN_BODIES[name]);
  });
}

/* ---------------- the confirm step says what the body sends ---------------- */

const LINES = {
  "1 x put": [
    "SELL to close 1 × GDX $94.00 put expiring 2026-10-30",
    "1 combination, a credit of $4.67 (you receive it) for one combination, good for today only.",
    "In all, you receive about $467 at this limit (1 × $4.67 × 100).",
  ],
  "9 x put — the owner's holding": [
    "SELL to close 9 × GDX $94.00 put expiring 2026-10-30",
    "9 combinations, a credit of $4.68 (you receive it) for one combination, good for today only.",
    "In all, you receive about $4,212 at this limit (9 × $4.68 × 100).",
  ],
  "3 x debit put spread 94/90": [
    "SELL to close 3 × GDX $94.00 put expiring 2026-10-30",
    "BUY to close 3 × GDX $90.00 put expiring 2026-10-30",
    "3 combinations, a credit of $2.52 (you receive it) for one combination, good for today only.",
    "In all, you receive about $756 at this limit (3 × $2.52 × 100).",
  ],
};
const WORDS = {
  "1 x put": "a credit of $4.67 (you receive it)",
  "9 x put — the owner's holding": "a credit of $4.68 (you receive it)",
  "3 x debit put spread 94/90": "a credit of $2.52 (you receive it)",
};
for (const name of Object.keys(CASES)) {
  await test(`CONFIRM LINES — ${name}: the quantity, the price and the direction are the body's`, async () => {
    const p = await prep(name);
    assert.deepEqual(p.lines, LINES[name]);
    assert.equal(p.limitWords, WORDS[name]);
    // The price per combination printed IS body.limit_price.
    assert.ok(p.lines.join(" ").includes(`$${Math.abs(+p.body.limit_price).toFixed(2)} (you receive it) for one combination`));
    assert.ok(!/debit|you pay/.test(p.lines.join(" ")), "a close that sells receives money");
  });
}

await test("AFTER SEND — the headline names the quantity, the credit and 'sold', never 'bought'", async () => {
  const p = await prep("9 x put — the owner's holding");
  const r = await sendClose(p, { gate, demo: false, request: ACCEPT });
  assert.equal(r.ok, true);
  assert.equal(r.headline, "Closing GDX · 2026-10-30 — sent as one order: 9 at a credit of $4.68 (you receive it) each, " +
    "you receive about $4,212 in all. The order is working, not filled — 0 of 9 combinations sold.");
  assert.equal(r.qty, "9");
  assert.equal(r.total, "you receive about $4,212");
  const s = await sendClose(await prep("3 x debit put spread 94/90"), { gate, demo: false, request: ACCEPT });
  assert.match(s.headline, /3 at a credit of \$2\.52 \(you receive it\) each, you receive about \$756 in all\. .* 0 of 3 combinations sold\.$/);
});

/* ---------------- one home for the words ---------------- */

await test("orderMoney() — a simple sell is a credit, a simple buy a debit, an mleg keeps its sign", () => {
  assert.equal(orderLimitWords({ side: "sell", qty: "9", limit_price: "4.68" }), "a credit of $4.68 (you receive it)");
  assert.equal(orderLimitWords({ side: "buy", qty: "9", limit_price: "5.00" }), "a debit of $5.00 (you pay it)");
  assert.equal(orderLimitWords({ order_class: "mleg", limit_price: "-2.52" }), "a credit of $2.52 (you receive it)");
  assert.equal(orderLimitWords({ order_class: "mleg", limit_price: "0.37" }), "a debit of $0.37 (you pay it)");
  // An mleg reply that also says side "buy" is still read by its sign.
  assert.equal(orderMoney({ order_class: "mleg", side: "buy", limit_price: "-0.75" }).kind, "credit");
  // Unknown is not zero.
  assert.equal(orderLimitWords({ side: "sell", limit_price: null }), null);
  assert.equal(orderLimitWords({ side: "sell", limit_price: "" }), null);
  assert.equal(orderLimitWords({ side: "sell", limit_price: "0" }), null);
  assert.equal(orderTotalWords({ side: "sell", qty: "", limit_price: "4.68" }), null);
  // The verb and whether it closes.
  assert.equal(orderMoney({ side: "sell" }).verb, "sold");
  assert.equal(orderMoney({ side: "sell" }).closing, true);
  assert.equal(orderMoney({ side: "buy" }).verb, "bought");
  const mlegClose = { order_class: "mleg", limit_price: "-2.52",
    legs: [{ position_intent: "sell_to_close" }, { position_intent: "buy_to_close" }] };
  assert.equal(orderMoney(mlegClose).closing, true);
  assert.equal(orderMoney({ ...mlegClose, legs: [{ position_intent: "buy_to_open" }, { position_intent: "sell_to_open" }] }).closing, false);
});

await test("orderOutcome() — a simple sell is 'sold' and a filled close does not claim a position opened", () => {
  const base = { id: "abcdef1234", side: "sell", order_class: "simple", qty: "9", type: "limit", limit_price: "4.68", time_in_force: "day" };
  const w = orderOutcome({ ...base, status: "accepted", filled_qty: "0" });
  assert.equal(w.headline, "The order is working, not filled — 0 of 9 combinations sold.");
  assert.match(w.detail, /at your limit of a credit of \$4\.68 \(you receive it\)/);
  assert.match(w.detail, /Nothing has been sold yet, so the position is still open/);
  const f = orderOutcome({ ...base, status: "filled", filled_qty: "9", filled_avg_price: "4.70" });
  assert.equal(f.headline, "Filled at a credit of $4.70 (you receive it): 9 combinations sold. Closed at the broker.");
  assert.ok(!/Position opened|exit plan/.test(`${f.headline} ${f.detail}`));
  const d = orderOutcome({ ...base, status: "canceled" });
  assert.match(d.headline, /nothing was sold\.$/);
  // The opening path reads as it did: a buy is bought, and opens.
  const o = orderOutcome({ ...base, side: "buy", limit_price: "5.00", status: "filled", filled_qty: "9", filled_avg_price: "5.00" });
  assert.equal(o.headline, "Filled at a debit of $5.00 (you pay it): 9 combinations are yours. Position opened.");
});

await test("THE BUILD TICKET'S single leg says debit, from the same words", () => {
  const lines = orderPreviewLines({ legs: [{ side: 1, qty: 1, type: "put", strike: 94 }], ticker: "GDX",
    expKey: "2026-10-30", qty: 9, type: "limit", limit: 5, tif: "day", intent: "open" });
  assert.deepEqual(lines, ["BUY 9 × GDX $94.00 put expiring 2026-10-30",
    "9 combinations, a debit of $5.00 (you pay it) for one combination, good for today only."]);
});

await test("ORDER PATH 6 AND THE JOURNAL say it with the same function (source)", () => {
  const approve = readFileSync("netlify/functions/approve.mjs", "utf8");
  assert.match(approve, /\$\{orderLimitWords\(order\) \|\| "a price the page could not read"\} per combination/);
  assert.ok(!/limitWords\(order\.limit_price\)/.test(approve), "no bare signed reading of a simple order's price");
  const app = readFileSync("src/App.jsx", "utf8");
  assert.match(app, /text: `close sent: \$\{r\.qty\} at \$\{r\.limitWords\} each\$\{r\.total \? `, \$\{r\.total\} in all` : ""\}`/);
  const pro = readFileSync("src/pro.jsx", "utf8");
  assert.ok(!/limitWords\(body\.limit_price\)|limitWords\(o\.limit_price\)/.test(pro), "placeExit and the desk list read the order");
  const close = readFileSync("src/closeOrder.js", "utf8");
  assert.ok(!/limitWords\(body\.limit_price\)/.test(close));
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(f.e); process.exit(1); }
