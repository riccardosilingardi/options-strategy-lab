// PR #46, TASK 0 — one orders list, Modify, the close's price, and the proxy allowlist.
//   orderRow.js     what one order row says (book, Alpaca's mark, the range a price may use)
//   modifyOrder.js  Modify: order path 7 (PATCH, one leg) or cancel → canceled → new (several legs)
//   closeOrder.js   order path 3 with a chosen price; default bodies unchanged
//   alpaca.mjs      the proxy refuses what the app does not do
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { orderRowModel, orderLegs, limitBounds, clampLimit, withinBounds, pastMarkLine, orderMark, orderBook,
  heldToLimit, limitToHeld, waitForCanceled, statusHistory, ordersForRecord } from "./orderRow.js";
import { modifyPlan, modifyProposal, sendModify, cancelAll } from "./modifyOrder.js";
import { prepareClose, sendClose, groupForRecord } from "./closeOrder.js";
import { routeAllowed } from "../netlify/functions/alpaca.mjs";

let passed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- fixtures: J-0001-shaped ---------------- */
// 9 × GDX 94P 2026-10-30, held long. The close went out as a sell at $8.23 and
// sat "0 of 9 sold" while Alpaca marked the put at $7.90.
const J1_SYM = "GDX261030P00094000";
const J1_HOLDING = [{ symbol: J1_SYM, qty: "9", side: "long", cost_basis: "4500", unrealized_pl: "2925",
  avg_entry_price: "5.00", current_price: "7.90" }];
const J1_RECORD = { id: 1, ref: "J-0001", ticker: "GDX", expKey: "2026-10-30" };
const J1_CHAIN = { byExp: { "2026-10-30": { puts: { 94: { bid: 7.80, ask: 8.10 } }, calls: {} } } };
const J1_CLOSE = { id: "b2c3d4e5-0000-4000-8000-000000000001", symbol: J1_SYM, qty: "9", filled_qty: "0", side: "sell",
  type: "limit", limit_price: "8.23", time_in_force: "day", status: "new", position_intent: "sell_to_close",
  created_at: "2026-10-01T13:31:02Z", submitted_at: "2026-10-01T13:31:02Z", updated_at: "2026-10-01T13:31:03Z" };

// An XLE bull call spread held long, closing as one mleg order.
const SPREAD_HOLDING = [
  { symbol: "XLE261030C00090000", qty: "2", cost_basis: "420", unrealized_pl: "80", current_price: "2.10" },
  { symbol: "XLE261030C00095000", qty: "-2", cost_basis: "-170", unrealized_pl: "-20", current_price: "0.85" },
];
const SPREAD_CHAIN = { byExp: { "2026-10-30": { calls: { 90: { bid: 2.0, ask: 2.2 }, 95: { bid: 0.8, ask: 0.9 } }, puts: {} } } };
const SPREAD_CLOSE = { id: "c3d4e5f6-0000-4000-8000-000000000002", order_class: "mleg", qty: "2", filled_qty: "0",
  type: "limit", limit_price: "-1.30", time_in_force: "day", status: "new",
  legs: [
    { symbol: "XLE261030C00090000", side: "sell", ratio_qty: "1", position_intent: "sell_to_close", status: "new" },
    { symbol: "XLE261030C00095000", side: "buy", ratio_qty: "1", position_intent: "buy_to_close", status: "new" },
  ] };
// The same spread as an OPENING order (a debit).
const SPREAD_OPEN = { ...SPREAD_CLOSE, id: "d4e5f6a7-0000-4000-8000-000000000003", limit_price: "1.20",
  legs: [
    { symbol: "XLE261030C00090000", side: "buy", ratio_qty: "1", position_intent: "buy_to_open" },
    { symbol: "XLE261030C00095000", side: "sell", ratio_qty: "1", position_intent: "sell_to_open" },
  ] };
const PASS = () => ({ pass: true, violations: [], warnings: [] });
const FAIL = () => ({ pass: false, violations: [{ code: "PAPER", message: "Paper mode could not be verified." }], warnings: [] });
const noSleep = { tries: 3, sleep: async () => {} };

function broker(getStatus = "canceled") {
  const calls = [];
  const request = async (path, method = "GET", body = null) => {
    calls.push({ path, method, body });
    if (method === "GET") return { status: typeof getStatus === "function" ? getStatus(calls) : getStatus };
    if (method === "PATCH") return { id: "new-order-id-0001", status: "accepted", ...body };
    if (method === "POST") return { id: "posted-0001", status: "accepted", qty: body?.qty, filled_qty: "0", limit_price: body?.limit_price };
    return {};
  };
  return { calls, request };
}
const working = (calls) => calls.filter((c) => c.method === "POST" || c.method === "PATCH").length;

/* ---------------- 1) the row ---------------- */

await test("J-0001's close row: words, limit, TIF, filled 0 of 9, the book, Alpaca's mark, and the past-the-mark line", () => {
  const m = orderRowModel(J1_CLOSE, { chain: J1_CHAIN, positions: J1_HOLDING });
  assert.equal(m.intent, "close");
  assert.equal(m.what, "Close 9 × GDX 94P 2026-10-30");
  assert.equal(m.limitWords, "a credit of $8.23 (you receive it)");
  assert.equal(m.tif, "day");
  assert.equal(m.filledLine, "filled 0 of 9");
  assert.equal(m.bookLine, "bid $7.80 · mid $7.95 · ask $8.10");
  assert.equal(m.markLine, "Alpaca's mark $7.90", "read off current_price, never computed");
  assert.match(m.pastMark, /above Alpaca's mark of \$7\.90/);
  assert.deepEqual(m.bounds, { fill: 7.8, mid: 7.95, lo: 7.8, hi: 7.95 });
});

await test("a limit on the side that fills says nothing; an opening order has no mark and says so", () => {
  assert.equal(pastMarkLine({ ...J1_CLOSE, limit_price: "7.85" }, orderMark(J1_CLOSE, J1_HOLDING)), null);
  const m = orderRowModel(SPREAD_OPEN, { chain: SPREAD_CHAIN, positions: [] });
  assert.equal(m.mark, null);
  assert.match(m.markLine, /you do not hold these contracts yet/);
  assert.equal(m.pastMark, null);
});

await test("unknown is not zero: no chain, no book and no range — never a book of zeros", () => {
  const m = orderRowModel(J1_CLOSE, { chain: null, positions: [] });
  assert.equal(m.book.ok, false);
  assert.equal(m.bounds, null);
  assert.match(m.bookLine, /not loaded/);
  assert.match(m.markLine, /not read/);
});

await test("THE CHOSEN LIMIT STAYS WITHIN [fill side, mid] — both ways (a sell, a buy, a credit, a debit)", () => {
  const cases = [
    [J1_CLOSE, J1_CHAIN, { fill: 7.8, mid: 7.95 }],                 // sell to close: bid → mid
    [SPREAD_CLOSE, SPREAD_CHAIN, { fill: -1.1, mid: -1.25 }],        // mleg close, a credit: −bid → −mid
    [SPREAD_OPEN, SPREAD_CHAIN, { fill: 1.4, mid: 1.25 }],           // mleg open, a debit: ask → mid
  ];
  for (const [o, ch, want] of cases) {
    const b = limitBounds(o, orderBook(o, ch));
    assert.equal(b.fill, want.fill, `${o.id} fill`); assert.equal(b.mid, want.mid, `${o.id} mid`);
    for (const v of [-99, b.lo - 0.01, b.lo, (b.lo + b.hi) / 2, b.hi, b.hi + 0.01, 99]) {
      const c = clampLimit(v, b);
      assert.ok(c >= b.lo && c <= b.hi, `${v} clamps into [${b.lo}, ${b.hi}] → ${c}`);
    }
    assert.equal(withinBounds(b.lo - 0.01, b), false);
    assert.equal(withinBounds(b.hi + 0.01, b), false);
    assert.equal(clampLimit(null, b), null, "no value is no value, never zero");
  }
  // The held ↔ limit conversion is one function each way and they invert.
  for (const o of [J1_CLOSE, SPREAD_CLOSE, SPREAD_OPEN]) {
    assert.equal(limitToHeld(o, heldToLimit(o, 1.23)), 1.23);
  }
});

await test("Details: Alpaca's status history, oldest first, from the order's own fields", () => {
  const h = statusHistory({ ...J1_CLOSE, canceled_at: "2026-10-01T15:00:00Z", status: "canceled", replaced_by: "abcdef0123" });
  assert.deepEqual(h.filter((r) => r.t).map((r) => r.label), ["created", "submitted", "last updated", "canceled"]);
  assert.ok(h.some((r) => /replaced by order abcdef01/.test(r.label)));
  assert.ok(h.some((r) => r.label === "status now: canceled"));
});

await test("a position card finds its own working order: same underlying, same expiry", () => {
  assert.deepEqual(ordersForRecord(J1_RECORD, [J1_CLOSE, SPREAD_CLOSE]).map((o) => o.id), [J1_CLOSE.id]);
  assert.deepEqual(ordersForRecord({ ticker: "GDX" }, [J1_CLOSE]), [], "no expiry, no match");
});

/* ---------------- 2) Modify ---------------- */

await test("Modify, one leg → ORDER PATH 7: the gate first, then PATCH; limit_price IS the chosen price", async () => {
  const bounds = limitBounds(J1_CLOSE, orderBook(J1_CLOSE, J1_CHAIN));
  const plan = modifyPlan(J1_CLOSE, { limit: 7.87, qty: 9, tif: "gtc", bounds, heldQty: 9 });
  assert.equal(plan.ok, true, plan.refusal);
  assert.equal(plan.mode, "replace");
  assert.deepEqual(plan.patch, { qty: "9", time_in_force: "gtc", limit_price: "7.87" });
  const b = broker();
  let gated = null;
  const r = await sendModify(J1_CLOSE, plan, { request: b.request, gate: (p) => { gated = p; return PASS(); }, demo: false });
  assert.equal(r.ok, true, r.refusal);
  assert.equal(gated.intent, "close");
  assert.deepEqual(b.calls.map((c) => `${c.method} ${c.path}`), [`PATCH /v2/orders/${J1_CLOSE.id}`]);
  assert.equal(b.calls[0].body.limit_price, "7.87");
  // The gate refuses → nothing reaches Alpaca.
  const b2 = broker();
  const r2 = await sendModify(J1_CLOSE, plan, { request: b2.request, gate: FAIL, demo: false });
  assert.equal(r2.ok, false); assert.match(r2.refusal, /Risk gate/); assert.equal(b2.calls.length, 0);
  // No gate wired → fails closed.
  const r3 = await sendModify(J1_CLOSE, plan, { request: b2.request, gate: null, demo: false });
  assert.equal(r3.ok, false); assert.equal(b2.calls.length, 0);
});

await test("Modify refuses a price outside [fill, mid], a quantity over the holding, and a TIF that is not DAY/GTC", () => {
  const bounds = limitBounds(J1_CLOSE, orderBook(J1_CLOSE, J1_CHAIN));
  assert.equal(modifyPlan(J1_CLOSE, { limit: 8.23, qty: 9, bounds, heldQty: 9 }).ok, false, "8.23 is past the mid");
  assert.equal(modifyPlan(J1_CLOSE, { limit: 7.79, qty: 9, bounds, heldQty: 9 }).ok, false, "below the bid");
  assert.equal(modifyPlan(J1_CLOSE, { limit: 7.9, qty: 10, bounds, heldQty: 9 }).ok, false);
  assert.equal(modifyPlan(J1_CLOSE, { limit: 7.9, qty: 9, tif: "ioc", bounds, heldQty: 9 }).ok, false);
  assert.equal(modifyPlan(J1_CLOSE, { limit: 7.9, qty: 9, bounds: null }).ok, false, "no chain, no range");
});

await test("an opening single-leg Modify carries the open-intent evidence: quotes, net, occs", () => {
  const OPEN1 = { ...J1_CLOSE, side: "buy", position_intent: "buy_to_open", limit_price: "8.00", qty: "2" };
  const book = orderBook(OPEN1, J1_CHAIN);
  const plan = modifyPlan(OPEN1, { limit: 8.0, qty: 2, bounds: limitBounds(OPEN1, book) });
  const p = modifyProposal(OPEN1, plan, book);
  assert.equal(p.intent, "open");
  assert.deepEqual(p.occs, [J1_SYM]);
  assert.equal(p.net, 8);
  assert.equal(p.maxLoss, -800);
  assert.equal(p.contracts, 2);
  assert.equal(p.quotes[0].bid, 7.8);
});

await test("Modify, several legs → cancel, wait for CANCELED, then the new order (path 3) — never two working", async () => {
  const bounds = limitBounds(SPREAD_CLOSE, orderBook(SPREAD_CLOSE, SPREAD_CHAIN));
  const plan = modifyPlan(SPREAD_CLOSE, { limit: -1.2, qty: 2, bounds, heldQty: 2 });
  assert.equal(plan.mode, "cancel-new");
  const b = broker("canceled");
  const r = await sendModify(SPREAD_CLOSE, plan, {
    request: b.request, gate: PASS, demo: false, waitOpts: noSleep,
    sendNew: async () => {
      const p = await prepareClose(groupForRecord({ ticker: "XLE", expKey: "2026-10-30" }, SPREAD_HOLDING), {
        gate: PASS, openOrders: [], fetchChain: async () => SPREAD_CHAIN, demo: false,
        choice: { limit: plan.limit, qty: plan.qty, tif: plan.tif } });
      if (!p.ok) return p;
      return sendClose(p, { request: b.request, gate: PASS, demo: false });
    } });
  assert.equal(r.ok, true, r.refusal);
  assert.deepEqual(b.calls.map((c) => `${c.method} ${c.path}`),
    [`DELETE /v2/orders/${SPREAD_CLOSE.id}`, `GET /v2/orders/${SPREAD_CLOSE.id}`, "POST /v2/orders"]);
  assert.equal(b.calls[2].body.limit_price, "-1.20", "the new order carries the chosen price");
  assert.equal(b.calls.some((c) => c.method === "PATCH"), false, "an mleg order is never PATCHed");
});

await test("NO PATH LEAVES TWO WORKING ORDERS: pending cancel or a fill first → nothing new is sent", async () => {
  const bounds = limitBounds(SPREAD_CLOSE, orderBook(SPREAD_CLOSE, SPREAD_CHAIN));
  const plan = modifyPlan(SPREAD_CLOSE, { limit: -1.2, qty: 2, bounds, heldQty: 2 });
  for (const status of ["pending_cancel", "new", "filled", "partially_filled"]) {
    const b = broker(status);
    let called = false;
    const r = await sendModify(SPREAD_CLOSE, plan, { request: b.request, gate: PASS, demo: false, waitOpts: noSleep,
      sendNew: async () => { called = true; return { ok: true }; } });
    assert.equal(r.ok, false, status);
    assert.equal(called, false, `${status}: the new order was not attempted`);
    assert.equal(working(b.calls), 0, `${status}: nothing POSTed or PATCHed`);
  }
  // The gate runs before the cancel: a refused Modify cancels nothing.
  const b = broker();
  const r = await sendModify(SPREAD_CLOSE, plan, { request: b.request, gate: FAIL, demo: false, sendNew: async () => ({ ok: true }) });
  assert.equal(r.ok, false); assert.equal(b.calls.length, 0);
  // Demo mode: no call at all.
  const d = await sendModify(J1_CLOSE, modifyPlan(J1_CLOSE, { limit: 7.9, qty: 9, bounds: limitBounds(J1_CLOSE, orderBook(J1_CLOSE, J1_CHAIN)), heldQty: 9 }),
    { request: b.request, gate: PASS, demo: true });
  assert.equal(d.ok, false); assert.equal(b.calls.length, 0);
});

await test("waitForCanceled reads Alpaca until it reports the end, and only canceled/expired/rejected/replaced are ok", async () => {
  let n = 0;
  const later = async () => ({ status: ++n < 3 ? "pending_cancel" : "canceled" });
  assert.equal((await waitForCanceled("x", later, { tries: 5, sleep: async () => {} })).ok, true);
  for (const s of ["expired", "rejected", "replaced"]) assert.equal((await waitForCanceled("x", async () => ({ status: s }), noSleep)).ok, true);
  const down = async () => { throw new Error("offline"); };
  assert.equal((await waitForCanceled("x", down, noSleep)).ok, false, "unreachable is not canceled");
});

await test("Cancel all: one DELETE /v2/orders, and the words say requested, not cancelled", async () => {
  const b = broker();
  const r = await cancelAll({ request: async (p, m) => { b.calls.push({ p, m }); return [{ id: 1 }, { id: 2 }]; }, demo: false });
  assert.equal(r.ok, true);
  assert.deepEqual(b.calls, [{ p: "/v2/orders", m: "DELETE" }]);
  assert.match(r.headline, /Cancel requested for 2 orders/);
  assert.equal((await cancelAll({ request: async () => [], demo: true })).ok, false);
});

/* ---------------- 3) the close's price (order path 3) ---------------- */

await test("DEFAULT-PRICE BODIES ARE BYTE-IDENTICAL TO MAIN (closeLimitPrice, the whole holding, DAY)", async () => {
  // These two strings were produced by main's own closeOrder.js (25d87f8) on these fixtures, 2 Oct 2026.
  const MAIN_J1 = '{"symbol":"GDX261030P00094000","qty":"9","side":"sell","type":"limit","time_in_force":"day","limit_price":"7.88"}';
  const MAIN_SPREAD = '{"order_class":"mleg","qty":"2","type":"limit","time_in_force":"day","legs":[{"symbol":"XLE261030C00090000",' +
    '"ratio_qty":"1","side":"sell","position_intent":"sell_to_close"},{"symbol":"XLE261030C00095000","ratio_qty":"1",' +
    '"side":"buy","position_intent":"buy_to_close"}],"limit_price":"-1.18"}';
  const j1 = await prepareClose(groupForRecord(J1_RECORD, J1_HOLDING), { gate: PASS, fetchChain: async () => J1_CHAIN, demo: false });
  assert.equal(JSON.stringify(j1.body), MAIN_J1);
  const sp = await prepareClose(groupForRecord({ ticker: "XLE", expKey: "2026-10-30" }, SPREAD_HOLDING),
    { gate: PASS, fetchChain: async () => SPREAD_CHAIN, demo: false });
  assert.equal(JSON.stringify(sp.body), MAIN_SPREAD);
  assert.equal(j1.defaultLimit, 7.88, "the confirm's price field starts at closeLimitPrice()");
  assert.ok(withinBounds(j1.defaultLimit, j1.bounds), "and closeLimitPrice() sits inside [bid, mid]");
});

await test("the close confirm's chosen price: limit_price equals it, within [bid, mid], and qty/TIF are honoured", async () => {
  const g = groupForRecord(J1_RECORD, J1_HOLDING);
  const p = await prepareClose(g, { gate: PASS, fetchChain: async () => J1_CHAIN, demo: false, choice: { limit: 7.83, qty: 9, tif: "day" } });
  assert.equal(p.ok, true, p.refusal);
  assert.equal(p.body.limit_price, "7.83");
  assert.equal(p.body.qty, "9");
  const part = await prepareClose(g, { gate: PASS, fetchChain: async () => J1_CHAIN, demo: false, choice: { limit: 7.9, qty: 4, tif: "gtc" } });
  assert.equal(part.body.qty, "4"); assert.equal(part.body.time_in_force, "gtc"); assert.equal(part.body.limit_price, "7.90");
  for (const bad of [8.23, 7.79]) {
    const r = await prepareClose(g, { gate: PASS, fetchChain: async () => J1_CHAIN, demo: false, choice: { limit: bad, qty: 9 } });
    assert.equal(r.ok, false, `${bad} is outside [7.80, 7.95]`); assert.match(r.refusal, /outside the range/);
  }
  const over = await prepareClose(g, { gate: PASS, fetchChain: async () => J1_CHAIN, demo: false, choice: { limit: 7.9, qty: 10 } });
  assert.equal(over.ok, false);
  // A credit structure: the chosen price is the signed mleg price.
  const sp = await prepareClose(groupForRecord({ ticker: "XLE", expKey: "2026-10-30" }, SPREAD_HOLDING),
    { gate: PASS, fetchChain: async () => SPREAD_CHAIN, demo: false, choice: { limit: -1.15, qty: 2 } });
  assert.equal(sp.ok, true, sp.refusal); assert.equal(sp.body.limit_price, "-1.15");
  assert.deepEqual(sp.bounds, { fill: -1.1, mid: -1.25, lo: -1.25, hi: -1.1 });
});

/* ---------------- 4) the proxy allowlist ---------------- */

await test("THE PROXY REFUSES DELETE /v2/positions — and everything else the app does not do — with 405 and a sentence", () => {
  for (const [m, p] of [["DELETE", "/v2/positions"], ["DELETE", "/v2/positions/GDX261030P00094000"],
    ["POST", "/v2/positions/GDX261030P00094000/exercise"], ["PATCH", "/v2/account/configurations"],
    ["POST", "/v2/orders/abc"], ["PUT", "/v2/orders/abc"], ["GET", "/v2/watchlists"]]) {
    const r = routeAllowed(m, p);
    assert.equal(r.ok, false, `${m} ${p}`); assert.equal(r.status, 405, `${m} ${p}`);
    assert.match(r.sentence, /does not send/);
  }
  assert.equal(routeAllowed("GET", "/v2/../v1/x").status, 400);
});

await test("…and passes every path the app uses", () => {
  for (const [m, p] of [["GET", "/v2/account"], ["GET", "/v2/positions"], ["GET", "/v2/orders?status=open&limit=30&nested=true"],
    ["GET", "/v2/orders/b2c3d4e5-0000-4000-8000-000000000001"], ["POST", "/v2/orders"],
    ["PATCH", "/v2/orders/b2c3d4e5-0000-4000-8000-000000000001"], ["DELETE", "/v2/orders/b2c3d4e5"], ["DELETE", "/v2/orders"],
    ["GET", "/v2/options/contracts?underlying_symbols=CORN&status=active&limit=10000&expiration_date_gte=2026-10-01&strike_price_gte=15.00&page_token=abc%3D%3D"]]) {
    assert.equal(routeAllowed(m, p).ok, true, `${m} ${p}`);
  }
});

await test("every proxy path the client source calls is on the allowlist (source sweep)", () => {
  const files = ["App.jsx", "pro.jsx", "chain.js", "closeOrder.js", "modifyOrder.js", "orderRow.js"];
  const seen = new Set();
  for (const f of files) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    for (const m of src.matchAll(/alpaca(?:Req|Get)\(\s*[`"](\/v2\/[^`"$?]*)/g)) seen.add(m[1]);
  }
  assert.ok(seen.size >= 3, `only ${seen.size} paths found`);
  for (const p of seen) assert.equal(routeAllowed("GET", p.endsWith("/") ? `${p}x` : p).ok, true, p);
});

/* ---------------- 5) path 7 is gated, and listed ---------------- */

await test("ORDER PATH 7 calls the gate before its PATCH, and CLAUDE.md lists seven paths", () => {
  const src = readFileSync(new URL("./modifyOrder.js", import.meta.url), "utf8");
  const gateAt = src.indexOf("gate(modifyProposal(");
  const patchAt = src.indexOf('"PATCH"');
  const delAt = src.indexOf('"DELETE", ');
  assert.ok(gateAt > 0 && patchAt > gateAt, "the gate runs before the PATCH");
  assert.ok(delAt === -1 || delAt > gateAt || src.indexOf('request("/v2/orders", "DELETE")') > 0, "and before the cancel");
  const claude = readFileSync(new URL("../CLAUDE.md", import.meta.url), "utf8");
  assert.ok(/Order paths — seven, all through the gate/.test(claude), "CLAUDE.md does not say seven order paths");
  assert.ok(/7\. `src\/modifyOrder\.js` `sendModify\(\)`/.test(claude), "CLAUDE.md does not list path 7");
  // Nothing else in the client PATCHes.
  for (const f of ["App.jsx", "pro.jsx", "closeOrder.js", "orderRow.js"]) {
    assert.equal(/"PATCH"/.test(readFileSync(new URL(`./${f}`, import.meta.url), "utf8")), false, `${f} sends a PATCH`);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`FAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
