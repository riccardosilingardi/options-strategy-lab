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
  orderOutcome, orderWaitingPhrase, alpacaErrorText, alpacaBodySentence,
  limitDirection, mlegLimitPrice, limitWords, limitKind, fillPriceOf } from "./order.js";

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

/* ================================================================
   CREDIT LIMITS WERE SENT AS DEBITS — PRD §4q

   >>> MEASURED ON THE OWNER'S ALPACA PAPER ACCOUNT, 21 Sep 2026. <<<
   J-0001, XLE Bull Put Spread 2026-10-30 (−1 62.5P / +1 59P), ticket CREDIT
   $75, GTC. Alpaca holds it as an OPEN POSITION at a net credit of $0.04 a
   combination: $4 received against $75 intended, max loss $346 not $275.
   `unitLimit()` returned `Math.abs()` and the mleg body used it, so +0.75
   read as "pay up to 75 cents" — marketable, filled at once.
================================================================ */

const V_PUT = [{ side: -1, qty: 1, type: "put" }, { side: 1, qty: 1, type: "put" }];
const V_CALL = [{ side: 1, qty: 1, type: "call" }, { side: -1, qty: 1, type: "call" }];
const FLY = [{ side: 1, qty: 1, type: "call" }, { side: -2, qty: 2, type: "call" }, { side: 1, qty: 1, type: "call" }];
const lim = (legs, net, intent) => orderBody({
  legs, occs: legs.map((_, i) => `X${i}`), userQty: 1, type: "limit", limit: net, intent,
}).limit_price;

test("SIGN — opening a CREDIT structure is negative: the XLE order that filled for $4", () => {
  // The structure's net is −0.75 (you receive it). The order says so.
  assert.equal(lim(V_PUT, -0.75, "open"), "-0.75");
});

test("SIGN — opening a DEBIT structure is positive", () => {
  assert.equal(lim(V_CALL, 0.24, "open"), "0.24");
});

test("SIGN — CLOSING a debit structure is a CREDIT, and this is the half nobody had read", () => {
  // Selling back a long call spread worth +0.64 brings money IN. With
  // Math.abs() this offered to BUY it at 0.64, which fills at any price.
  assert.equal(lim(V_CALL, 0.64, "close"), "-0.64");
});

test("SIGN — closing a CREDIT structure is a DEBIT", () => {
  assert.equal(lim(V_PUT, -0.37, "close"), "0.37");
});

test("SIGN — a butterfly opens as a debit and closes as a credit", () => {
  assert.equal(lim(FLY, 0.30, "open"), "0.30");
  assert.equal(lim(FLY, 0.30, "close"), "-0.30");
});

test("SIGN — a SINGLE-LEG order stays unsigned: its own side carries the direction", () => {
  const one = [{ side: 1, qty: 1, type: "call" }];
  const body = orderBody({ legs: one, occs: ["X0"], userQty: 1, type: "limit", limit: 1.25, intent: "open" });
  assert.equal(body.limit_price, "1.25");
  assert.equal(body.order_class, undefined, "a single leg is a simple order, never mleg");
  // ...and it is unsigned on a close too, where the side flips to "sell".
  const close = orderBody({ legs: one, occs: ["X0"], userQty: 1, type: "limit", limit: 1.25, intent: "close" });
  assert.equal(close.limit_price, "1.25");
  assert.equal(close.side, "sell");
});

test("SIGN — the size still leaves the price, exactly as before", () => {
  // A five-lot credit vertical: qty 5, ratios 1:1, and ONE combination priced.
  const legs = [{ side: -1, qty: 5 }, { side: 1, qty: 5 }];
  const body = orderBody({ legs, occs: ["A", "B"], userQty: 1, type: "limit", limit: -3.75, intent: "open" });
  assert.equal(body.qty, "5");
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "1"]);
  assert.equal(body.limit_price, "-0.75");
});

test("SIGN — round first, decide the sign after: nothing is ever '-0.00'", () => {
  assert.equal(mlegLimitPrice(-0.0001, 1, "open"), "0.00");
  assert.equal(mlegLimitPrice(0, 1, "open"), "0.00");
  assert.equal(limitDirection(0, "open"), 0);
  assert.equal(limitDirection(null, "open"), 0);
  assert.equal(limitDirection(NaN, "close"), 0);
});

test("SIGN — the words, and an unreadable price gets none rather than '$0'", () => {
  assert.equal(limitWords("-0.75"), "a credit of $0.75 (you receive it)");
  assert.equal(limitWords(0.24), "a debit of $0.24 (you pay it)");
  assert.equal(limitWords(null), null);
  assert.equal(limitWords("0.00"), null);
  assert.equal(limitKind(-0.04), "credit");
  assert.equal(limitKind(1), "debit");
  assert.equal(limitKind(null), null);
});

test("READ-BACK — the broker's own credit is never reported as money paid", () => {
  // Alpaca prints a multi-leg credit fill as NEGATIVE: "Avg. Fill Price -0.04".
  const r = orderOutcome({ status: "filled", qty: "1", filled_qty: "1", filled_avg_price: "-0.04", id: "abcdef1234" });
  assert.equal(r.fillPrice, -0.04, "the sign survives the read");
  assert.ok(r.headline.includes("credit"), `a credit fill must say so: ${r.headline}`);
  assert.ok(!r.headline.includes("debit"));
  const d = orderOutcome({ status: "filled", qty: "1", filled_qty: "1", filled_avg_price: "0.24" });
  assert.ok(d.headline.includes("debit"), d.headline);
  // UNKNOWN IS NOT ZERO.
  assert.equal(fillPriceOf({}), null);
  assert.equal(fillPriceOf({ filled_avg_price: null }), null);
  assert.equal(fillPriceOf({ filled_avg_price: "" }), null);
  assert.equal(fillPriceOf({ filled_avg_price: "0" }), 0, "a real zero is a real reading");
});

test("READ-BACK — a waiting order says which way its limit goes", () => {
  const p = orderWaitingPhrase({ type: "limit", limit_price: "-0.75", time_in_force: "gtc" });
  assert.ok(p.includes("credit"), p);
  assert.ok(!p.includes("debit"), p);
});

test("PREVIEW — the tap that arms the order says debit or credit, never a bare $", () => {
  const lines = orderPreviewLines({ legs: V_PUT, ticker: "XLE", expKey: "2026-10-30",
    qty: 1, factor: 1, type: "limit", limit: -0.75, tif: "gtc", intent: "open" });
  const last = lines[lines.length - 1];
  assert.ok(last.includes("credit"), last);
});

test("NEVER AGAIN — no mleg limit may be wrapped in Math.abs()", () => {
  /* The fault was one `Math.abs()` in `unitLimit()` plus three read-backs that
     hid it: App.jsx's `alpacaLimit`, its timeline sentence and the waiting
     phrase here. A sweep, because the shape is what comes back, not the name. */
  const files = ["src/order.js", "src/App.jsx", "src/pro.jsx", "netlify/functions/approve.mjs"];
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const f of files) {
    const code = strip(readFileSync(f, "utf8"));
    for (const field of ["limit_price", "filled_avg_price"]) {
      const re = new RegExp(`Math\\.abs\\(\\s*\\+?[A-Za-z_$][\\w$.?]*\\.?${field}`, "g");
      assert.equal(re.test(code), false,
        `${f} takes Math.abs() of ${field}: the sign IS the direction of the money (PRD §4q)`);
    }
  }
  // ...and the mleg branch of orderBody uses the signed spelling, not unitLimit.
  const order = strip(readFileSync("src/order.js", "utf8"));
  assert.ok(/order_class: "mleg"[\s\S]{0,400}?limit_price = mlegLimitPrice\(/.test(order),
    "the mleg body must be priced by mlegLimitPrice(), the one home for the sign");
  assert.ok(/mlegs\.length === 1[\s\S]{0,400}?limit_price = unitLimit\(/.test(order),
    "and a single-leg order must stay unsigned");

  /* THE STORED LIMIT IS THE BROKER'S, SIGNED — and a screen that prints its
     MAGNITUDE must print the word beside it. `money(p.alpacaLimit * 100)` was
     the old shape: it renders a credit and a debit of the same size
     identically, which is how the XLE order looked correct on every screen
     the app has. The magnitude is allowed; a magnitude ALONE is not. */
  const app = strip(readFileSync("src/App.jsx", "utf8"));
  assert.equal(/money\(\s*p\.alpacaLimit\s*\*/.test(app), false,
    "a limit rendered without its direction says nothing about which way the money went");
  assert.ok(/limitKind\(/.test(app), "App.jsx names the direction of every limit it prints");
});

test("NEVER AGAIN — no order path hands orderBody() a magnitude", () => {
  // `Math.abs(net)` reaching `limit:` is the exact call that sent the XLE
  // credit out as a debit. The ticket keeps a magnitude for the SCREEN; the
  // body takes `signedLimit`.
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const f of ["src/pro.jsx", "src/App.jsx", "netlify/functions/approve.mjs"]) {
    const code = strip(readFileSync(f, "utf8"));
    assert.equal(/limit:\s*Math\.abs\(/.test(code), false, `${f} passes a magnitude as an order limit`);
    assert.equal(/limit:\s*limitStr\b/.test(code), false,
      `${f} passes the screen's magnitude (limitStr) to the broker; pass signedLimit`);
  }
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
