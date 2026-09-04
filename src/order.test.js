// Tests for src/order.js — the shape of what is sent, and the reading of what
// comes back. Plain Node, no test framework: `npm test` runs this file directly.
//
// Both halves are live findings, 2026-09-04:
//   * Alpaca refused a sized spread with 422 / 42210000, "leg ratio quantities
//     should be relatively prime: GCD[5 5] = 5" — every structure the Shortlist
//     sized above x1 was unsendable.
//   * A confirmed order came back status "accepted", filled_qty 0, and the app
//     announced "Position opened" with an exit plan over it.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { gcdAll, reduceRatios, orderQty, unitLimit, orderBody, orderPreviewLines,
  orderOutcome, orderWaitingPhrase, alpacaErrorText, alpacaBodySentence } from "./order.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ================================================================
   1) THE EXACT REFUSED CASE
================================================================ */

// The order Alpaca refused: a five-lot vertical, written as ratio 5 and 5.
const FIVE_LOT_VERTICAL = [
  { side: 1, qty: 5, type: "call", strike: 19 },
  { side: -1, qty: 5, type: "call", strike: 19.5 },
];

test("the refused case: leg ratios come out relatively prime", () => {
  const { ratios, factor } = reduceRatios(FIVE_LOT_VERTICAL);
  assert.deepEqual(ratios, [1, 1]);
  assert.equal(factor, 5);
  assert.equal(gcdAll(ratios), 1, "the ratios Alpaca receives must have a GCD of 1");
});

test("the refused case: the factor moves into the order's qty", () => {
  const body = orderBody({ legs: FIVE_LOT_VERTICAL, occs: ["BOIL260918C00019000", "BOIL260918C00019500"],
    userQty: 1, type: "limit", limit: 1.45, tif: "day", intent: "open" });
  assert.equal(body.order_class, "mleg");
  assert.equal(body.qty, "5");
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "1"]);
  assert.equal(gcdAll(body.legs.map((l) => +l.ratio_qty)), 1);
});

test("the money at stake is unchanged: qty × unit limit is the price on screen", () => {
  const onScreen = 1.45;            // the net of the structure AS BUILT (five lots)
  const body = orderBody({ legs: FIVE_LOT_VERTICAL, occs: ["A", "B"], userQty: 1, type: "limit", limit: onScreen });
  assert.equal(body.limit_price, "0.29");
  assert.equal(+body.qty * +body.limit_price, onScreen);
});

test("the ticket's own QTY multiplies the reduced combination", () => {
  const body = orderBody({ legs: FIVE_LOT_VERTICAL, occs: ["A", "B"], userQty: 2, type: "market" });
  assert.equal(body.qty, "10");     // 2 of a five-lot structure
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "1"]);
});

/* ================================================================
   2) A GENUINE RATIO SURVIVES
================================================================ */

const BUTTERFLY = [
  { side: 1, qty: 1, type: "call", strike: 21 },
  { side: -1, qty: 2, type: "call", strike: 22.5 },
  { side: 1, qty: 1, type: "call", strike: 24 },
];

test("a 1x2x1 butterfly stays 1, 2, 1", () => {
  const { ratios, factor } = reduceRatios(BUTTERFLY);
  assert.deepEqual(ratios, [1, 2, 1]);
  assert.equal(factor, 1);
  const body = orderBody({ legs: BUTTERFLY, occs: ["A", "B", "C"], userQty: 1, type: "limit", limit: 0.4 });
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "2", "1"]);
  assert.equal(body.qty, "1");
  assert.equal(body.limit_price, "0.40", "a shape with no common factor must not have its price divided");
});

test("a doubled butterfly reduces to the butterfly, twice", () => {
  const doubled = BUTTERFLY.map((l) => ({ ...l, qty: l.qty * 2 }));
  const body = orderBody({ legs: doubled, occs: ["A", "B", "C"], userQty: 1, type: "limit", limit: 0.8 });
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "2", "1"]);
  assert.equal(body.qty, "2");
  assert.equal(body.limit_price, "0.40");
});

test("an iron condor of four 1s is untouched", () => {
  const condor = [{ side: 1, qty: 1 }, { side: -1, qty: 1 }, { side: -1, qty: 1 }, { side: 1, qty: 1 }];
  const { ratios, factor } = reduceRatios(condor);
  assert.deepEqual(ratios, [1, 1, 1, 1]);
  assert.equal(factor, 1);
});

/* ================================================================
   3) THE SINGLE-LEG PATH IS UNCHANGED BY THE FIX
   A single leg goes as a simple order: Alpaca answers 422 to an mleg with
   one leg. Its qty is in CONTRACTS and its price is PER CONTRACT.
================================================================ */

test("a single leg is a simple order, priced per contract", () => {
  const body = orderBody({ legs: [{ side: 1, qty: 5 }], occs: ["UNG260918C00010000"],
    userQty: 2, type: "limit", limit: 5.0, tif: "gtc" });
  assert.equal(body.order_class, undefined);
  assert.equal(body.symbol, "UNG260918C00010000");
  assert.equal(body.qty, "10");            // 2 × 5 contracts
  assert.equal(body.limit_price, "1.00");  // $5.00 for five contracts
  assert.equal(body.time_in_force, "gtc");
});

/* ================================================================
   4) OPEN AND CLOSE ARE DIFFERENT SIDES
================================================================ */

test("open buys the long leg, close sells it", () => {
  const occs = ["A", "B"];
  const open = orderBody({ legs: FIVE_LOT_VERTICAL, occs, intent: "open", type: "market" });
  assert.deepEqual(open.legs.map((l) => l.side), ["buy", "sell"]);
  assert.deepEqual(open.legs.map((l) => l.position_intent), ["buy_to_open", "sell_to_open"]);
  const close = orderBody({ legs: FIVE_LOT_VERTICAL, occs, intent: "close", type: "market" });
  assert.deepEqual(close.legs.map((l) => l.side), ["sell", "buy"]);
  assert.deepEqual(close.legs.map((l) => l.position_intent), ["sell_to_close", "buy_to_close"]);
});

/* ================================================================
   5) ACCEPTED IS NOT OPENED
================================================================ */

// The reply the owner actually got, confirmed on Build, outside market hours.
const ACCEPTED = { id: "b1e0c8aa-1111-2222-3333-444455556666", status: "accepted",
  qty: "5", filled_qty: "0", type: "limit", limit_price: "0.29", time_in_force: "day" };

test("an accepted order is working, not opened, and starts no exit plan", () => {
  const r = orderOutcome(ACCEPTED);
  assert.equal(r.kind, "working");
  assert.equal(r.filled, false);
  assert.equal(r.startsExitPlan, false, "an unfilled order must not start the exit plan");
  assert.match(r.headline, /working, not filled/i);
  assert.ok(!/position opened/i.test(`${r.headline} ${r.detail}`), "nothing may claim a position was opened");
  assert.match(r.detail, /\$0\.29/, "it must say where the order is waiting");
  assert.match(r.detail, /today's session/);
});

test("a filled order is the only one that opens a position", () => {
  const r = orderOutcome({ ...ACCEPTED, status: "filled", filled_qty: "5", filled_avg_price: "0.31" });
  assert.equal(r.kind, "filled");
  assert.equal(r.filled, true);
  assert.equal(r.startsExitPlan, true);
  assert.match(r.headline, /Position opened/);
  assert.match(r.headline, /\$0\.31/);
});

test("a partial fill is its own sentence and still starts no plan", () => {
  const r = orderOutcome({ ...ACCEPTED, status: "partially_filled", filled_qty: "2" });
  assert.equal(r.kind, "partial");
  assert.equal(r.startsExitPlan, false);
  assert.match(r.headline, /2 of 5/);
  assert.match(r.detail, /other 3/);
});

test("an order the broker then killed says nothing was bought", () => {
  const r = orderOutcome({ ...ACCEPTED, status: "rejected", reject_reason: "insufficient buying power" });
  assert.equal(r.kind, "dead");
  assert.equal(r.startsExitPlan, false);
  assert.match(r.detail, /insufficient buying power/);
});

test("a reply with no status is not read as a fill", () => {
  const r = orderOutcome({ id: "abc" });
  assert.equal(r.kind, "unknown");
  assert.equal(r.filled, false);
  assert.equal(r.startsExitPlan, false);
});

test("a market order says so instead of quoting a limit that is not there", () => {
  const p = orderWaitingPhrase({ type: "market", time_in_force: "gtc" });
  assert.match(p, /market order/);
  assert.match(p, /until you cancel/);
});

/* ================================================================
   6) THE REASON A FAILED ORDER FAILED
================================================================ */

// Alpaca's own body, from the refused order.
const REFUSAL = JSON.stringify({ code: 42210000,
  message: "leg ratio quantities should be relatively prime: GCD[5 5] = 5" });

test("the HTTP status and Alpaca's body are both in the sentence", () => {
  const s = alpacaErrorText({ status: 422, body: REFUSAL });
  assert.match(s, /422/);
  assert.match(s, /42210000/);
  assert.match(s, /GCD\[5 5\] = 5/, "the diagnosis must not be truncated away");
});

test("a body that is not JSON is shown as it arrived", () => {
  assert.match(alpacaErrorText({ status: 500, body: "upstream timeout" }), /upstream timeout/);
  assert.equal(alpacaBodySentence(""), "");
});

test("an error with no status still reads as a sentence", () => {
  assert.equal(alpacaErrorText(new Error("pick a real expiry from the chain first")),
    "pick a real expiry from the chain first");
  assert.match(alpacaErrorText(null), /could not read why/);
});

test("a long body is not cut short", () => {
  const long = JSON.stringify({ code: 40010001, message: "x".repeat(600) });
  const s = alpacaErrorText({ status: 422, body: long });
  assert.ok(s.includes("x".repeat(600)), "the 200-character slice is what hid the reason in the first place");
});

/* ================================================================
   7) WHAT THE PENDING TAP SAYS IT WILL SEND
================================================================ */

test("the confirmation preview names the contracts, the size and the price", () => {
  const lines = orderPreviewLines({ legs: FIVE_LOT_VERTICAL, ticker: "BOIL", expKey: "2026-09-18",
    factor: reduceRatios(FIVE_LOT_VERTICAL).factor, qty: 1, type: "limit", limit: 1.45, tif: "day" });
  const text = lines.join("\n");
  assert.match(text, /BUY 5 × BOIL \$19\.00 call/);
  assert.match(text, /SELL 5 × BOIL \$19\.50 call/);
  assert.match(text, /2026-09-18/);
  assert.match(text, /5 combinations/);
  assert.match(text, /\$0\.29/);
  assert.match(text, /today only/);
});

test("a market order preview does not invent a price", () => {
  const lines = orderPreviewLines({ legs: BUTTERFLY, ticker: "CORN", qty: 1, type: "market", tif: "gtc" });
  assert.match(lines[lines.length - 1], /whatever the market is showing/);
  assert.match(lines[lines.length - 1], /until you cancel/);
});

/* ================================================================
   8) NO ORDER PATH KEEPS ITS OWN COPY OF THE ARITHMETIC
   Five paths build a body. A sixth copy of `ratio_qty: String(l.qty)` is
   exactly the bug this file exists to close, so the sources are read.
================================================================ */

const SOURCES = ["src/pro.jsx", "src/App.jsx", "netlify/functions/autopilot.mjs"];

test("no order path writes a leg quantity straight into ratio_qty", () => {
  for (const f of SOURCES) {
    const src = readFileSync(f, "utf8");
    assert.ok(!/ratio_qty:\s*String\(\s*(l|x)\.qty/.test(src),
      `${f} still writes a leg's own qty into ratio_qty — Alpaca refuses that above x1`);
  }
});

test("every order path builds its body with orderBody()", () => {
  for (const f of SOURCES) {
    const src = readFileSync(f, "utf8");
    assert.ok(src.includes("orderBody("), `${f} builds an Alpaca order body without src/order.js`);
  }
});

test("the ticket shows its own outcome, not only the page banner", () => {
  const src = readFileSync("src/pro.jsx", "utf8");
  assert.ok(src.includes("<OrderOutcome"), "OrderTicket must render the outcome beside the button");
  assert.ok(/setOutcome\(/.test(src), "all three outcomes have to reach the in-ticket block");
});

test("only a filled order lets App.jsx print the exit plan as started", () => {
  const src = readFileSync("src/App.jsx", "utf8");
  assert.ok(!/setMsg\(`Position opened\. \$\{exitPlanSentence\(\)\}`\)/.test(src),
    "App.jsx still announces a position over any Alpaca reply");
  assert.ok(src.includes("startsExitPlan"), "the exit plan must be conditional on the fill");
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
