/* ============================================================================
   src/alpacaContract.test.js — OUR BODIES, AGAINST THE BROKER'S OWN CONTRACT.

   `alpacaContract.js` is a hand-written mirror of alpaca-py's request models,
   because there is no official JavaScript SDK for multi-leg option orders. A
   mirror nobody checks is worse than no mirror, so this suite does three
   things:

   1. VALIDATES THE BODIES THIS APP ACTUALLY BUILDS against the mirrored
      models — every one of the six order paths' shapes.
   2. RUNS ALPACA'S OWN DOCUMENTED MULTI-LEG EXAMPLE through the validator as
      a fixture, so the mirror is held against a body the broker published
      rather than only against bodies this app wrote.
   3. REFUSES what alpaca-py refuses, in alpaca-py's own words.

   >>> ON THE OpenAPI SPEC. <<< Alpaca DOES publish one for the trading API
   (alpacahq/alpaca-docs, oas/trading/openapi.yaml) and it PREDATES multi-leg
   options: read on 21 Sep 2026 it contains no `mleg`, no `ratio_qty`, no
   `position_intent` and no request schema for `legs`, and its OrderClass enum
   is [simple, bracket, oco, oto, '']. So an mleg body cannot be validated
   against it, and this suite says so rather than implying a check that did
   not happen. The vocabulary the two order classes SHARE is held against the
   spec's enums below, which is the part of it that is still true.
============================================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ORDER_SIDE, POSITION_INTENT, TIME_IN_FORCE, ORDER_CLASS, ORDER_TYPE, ORDER_STATUS,
  valuesOf, positionIntentFor, sideForIntent, optionLegRequest, validateLeg,
  validateOrderRequest, contractRefusal, MLEG_MAX_LEGS, MLEG_MIN_LEGS,
  parseOrder, parsePosition, wireNumber,
} from "./alpacaContract.js";
import { orderBody } from "./order.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- the enums ---------------- */

test("ENUMS — the four alpaca-py enums, member for member", () => {
  // alpaca/trading/enums.py, read 21 Sep 2026.
  assert.deepEqual(valuesOf(ORDER_SIDE), ["buy", "sell"]);
  assert.deepEqual(valuesOf(POSITION_INTENT),
    ["buy_to_open", "buy_to_close", "sell_to_open", "sell_to_close"]);
  assert.deepEqual(valuesOf(TIME_IN_FORCE), ["day", "gtc", "opg", "cls", "ioc", "fok"]);
  assert.deepEqual(valuesOf(ORDER_CLASS), ["simple", "mleg", "bracket", "oco", "oto"]);
  assert.deepEqual(valuesOf(ORDER_TYPE), ["market", "limit", "stop", "stop_limit", "trailing_stop"]);
  // 18 statuses, and `order.js` reads its lifecycle lists off this one.
  assert.equal(valuesOf(ORDER_STATUS).length, 18);
  for (const s of ["filled", "partially_filled", "canceled", "expired", "accepted", "new", "held"]) {
    assert.ok(valuesOf(ORDER_STATUS).includes(s), `ORDER_STATUS is missing "${s}"`);
  }
  // They are frozen: a contract a caller can edit is not a contract.
  assert.throws(() => { ORDER_SIDE.BUY = "nope"; }, /read only|Cannot assign/i);
});

test("ENUMS — the OpenAPI spec's shared vocabulary agrees, where the spec has one", () => {
  /* Quoted verbatim from alpacahq/alpaca-docs oas/trading/openapi.yaml, read
     21 Sep 2026. These are the three enums the spec and alpaca-py BOTH carry;
     OrderClass is deliberately NOT one of them — the spec's is
     [simple, bracket, oco, oto, ''] and has no `mleg` at all, which is the
     clearest statement there is of why alpaca-py is the reference here. */
  const SPEC_ORDER_TYPE = ["market", "limit", "stop", "stop_limit", "trailing_stop"];
  const SPEC_TIF = ["day", "gtc", "opg", "cls", "ioc", "fok"];
  const SPEC_SIDE = ["buy", "sell"];
  assert.deepEqual(valuesOf(ORDER_TYPE), SPEC_ORDER_TYPE);
  assert.deepEqual(valuesOf(TIME_IN_FORCE), SPEC_TIF);
  assert.deepEqual(valuesOf(ORDER_SIDE), SPEC_SIDE);
  const SPEC_ORDER_CLASS = ["simple", "bracket", "oco", "oto", ""];
  assert.equal(SPEC_ORDER_CLASS.includes("mleg"), false,
    "if the spec ever gains mleg, this suite should validate against it instead of saying it cannot");
});

/* ---------------- the leg ---------------- */

test("LEG — the four position intents, and the side that must agree with each", () => {
  assert.equal(positionIntentFor(1, "open"), "buy_to_open");
  assert.equal(positionIntentFor(-1, "open"), "sell_to_open");
  assert.equal(positionIntentFor(1, "close"), "sell_to_close");
  assert.equal(positionIntentFor(-1, "close"), "buy_to_close");
  assert.equal(sideForIntent("buy_to_open"), "buy");
  assert.equal(sideForIntent("buy_to_close"), "buy");
  assert.equal(sideForIntent("sell_to_open"), "sell");
  assert.equal(sideForIntent("sell_to_close"), "sell");
  assert.equal(sideForIntent("nonsense"), null);
  // ONE TABLE, TWO VOCABULARIES: the leg's own side and its intent can never
  // disagree, because both come out of the same call.
  for (const legSide of [1, -1]) {
    for (const intent of ["open", "close"]) {
      const leg = optionLegRequest({ symbol: "XLE261030P00059000", ratioQty: 1, legSide, intent });
      assert.equal(leg.side, sideForIntent(leg.position_intent),
        `${legSide} / ${intent}: side ${leg.side} vs intent ${leg.position_intent}`);
      assert.equal(typeof leg.ratio_qty, "string", "ratio_qty goes on the wire as a string");
      assert.deepEqual(validateLeg(leg), []);
    }
  }
});

test("LEG — alpaca-py's own message when a leg carries neither side nor intent", () => {
  const e = validateLeg({ symbol: "X", ratio_qty: "1" });
  assert.ok(e.includes("at least one of side or position_intent must be provided for OptionLegRequest"),
    e.join(" | "));
});

test("LEG — a side that contradicts its own intent is refused (this app's rule)", () => {
  const e = validateLeg({ symbol: "X", ratio_qty: "1", side: "buy", position_intent: "sell_to_close" }, 0);
  assert.ok(e.some((m) => /contradicts/.test(m)), e.join(" | "));
  // And an unknown value in either field is named rather than passed along.
  assert.ok(validateLeg({ symbol: "X", ratio_qty: "1", side: "purchase" }).some((m) => /not one of/.test(m)));
  assert.ok(validateLeg({ symbol: "X", ratio_qty: "1", position_intent: "open_it" }).some((m) => /not one of/.test(m)));
  assert.ok(validateLeg({ ratio_qty: "1", side: "buy" }).some((m) => /symbol is required/.test(m)));
  assert.ok(validateLeg({ symbol: "X", ratio_qty: "0", side: "buy" }).some((m) => /ratio_qty/.test(m)));
});

/* ---------------- ALPACA'S OWN DOCUMENTED EXAMPLE ---------------- */

/* Verbatim from Alpaca's "Options Level 3 Trading" documentation: a long
   straddle on SPY, sent as one mleg market order. It is the only multi-leg
   request body Alpaca publishes, and it is here as a FIXTURE so the mirror is
   held against the broker's own words rather than only against this app's. */
const ALPACA_DOC_STRADDLE = {
  type: "market",
  time_in_force: "day",
  order_class: "mleg",
  legs: [
    { side: "buy", position_intent: "buy_to_open", symbol: "SPY250127C00608000", ratio_qty: "1" },
    { side: "buy", position_intent: "buy_to_open", symbol: "SPY250127P00608000", ratio_qty: "1" },
  ],
  qty: "2",
};

test("FIXTURE — Alpaca's own documented multi-leg example validates", () => {
  const v = validateOrderRequest(ALPACA_DOC_STRADDLE);
  assert.deepEqual(v.errors, [], "the broker's own example must pass the mirror");
  assert.equal(v.ok, true);
});

test("FIXTURE — the same example as a LIMIT order taken in for a CREDIT", () => {
  /* Alpaca's documentation states the sign convention in one sentence: "For
     the mleg order class, a positive value indicates a debit (representing a
     cost or payment to be made) while a negative value signifies a credit
     (reflecting an amount to be received)." A NEGATIVE mleg limit is correct
     and must never be refused — refusing it is the §4q fault read the other
     way round. */
  const credit = { ...ALPACA_DOC_STRADDLE, type: "limit", limit_price: "-0.01" };
  assert.deepEqual(validateOrderRequest(credit).errors, []);
  const debit = { ...ALPACA_DOC_STRADDLE, type: "limit", limit_price: "1.24" };
  assert.deepEqual(validateOrderRequest(debit).errors, []);
  // ...and a SINGLE-contract order's limit is a magnitude: its own side
  // carries the direction and Alpaca rejects a negative one.
  const single = { symbol: "SPY250127C00608000", qty: "1", side: "buy", type: "limit",
    time_in_force: "day", limit_price: "-1.24" };
  assert.ok(validateOrderRequest(single).errors.some((m) => /negative on a single-contract order/.test(m)),
    validateOrderRequest(single).errors.join(" | "));
});

/* ---------------- what alpaca-py refuses ---------------- */

test("ORDER — alpaca-py's mleg rules, in alpaca-py's own words", () => {
  const leg = (sym) => ({ side: "buy", position_intent: "buy_to_open", symbol: sym, ratio_qty: "1" });
  const base = { type: "limit", time_in_force: "day", order_class: "mleg", qty: "1", limit_price: "0.24" };
  const msgs = (b) => validateOrderRequest(b).errors.join(" | ");

  assert.match(msgs({ ...base, qty: undefined, legs: [leg("A"), leg("B")] }),
    /At least one of qty or notional must be provided/);
  assert.match(msgs({ ...base, notional: "100", legs: [leg("A"), leg("B")] }),
    /Both qty and notional can not be set\./);
  assert.match(msgs({ ...base, legs: undefined }), /legs is required for the mleg order class\./);
  assert.match(msgs({ ...base, legs: [leg("A"), leg("B"), leg("C"), leg("D"), leg("E")] }),
    /At most 4 legs are allowed for the mleg order class\./);
  assert.match(msgs({ ...base, legs: [leg("A")] }),
    /At least 2 legs are required for the mleg order class\./);
  assert.match(msgs({ ...base, legs: [leg("A"), leg("A")] }), /All legs must have unique symbols\./);
  assert.match(msgs({ ...base, type: "stop", legs: [leg("A"), leg("B")] }),
    /mleg order class only supports market and limit orders\./);
  assert.match(msgs({ ...base, limit_price: undefined, legs: [leg("A"), leg("B")] }), /limit_price is required/);
  // And the non-mleg half.
  assert.match(msgs({ type: "market", time_in_force: "day", qty: "1", side: "buy" }),
    /symbol is required for all order classes other than mleg\./);
  assert.match(msgs({ type: "market", time_in_force: "day", qty: "1", symbol: "X" }),
    /side is required for all order classes other than mleg\./);
  // The constants say what the messages say.
  assert.equal(MLEG_MAX_LEGS, 4);
  assert.equal(MLEG_MIN_LEGS, 2);
});

test("ORDER — the GCD rule Alpaca answered with a 422, caught before the round trip", () => {
  /* 2026-09-04, live: 422 / 42210000 "leg ratio quantities should be
     relatively prime: GCD[5 5] = 5". alpaca-py does not check it; the broker
     does, after the order has gone. */
  const leg = (sym, r) => ({ side: "buy", position_intent: "buy_to_open", symbol: sym, ratio_qty: String(r) });
  const bad = validateOrderRequest({ type: "market", time_in_force: "day", order_class: "mleg",
    qty: "1", legs: [leg("A", 5), leg("B", 5)] });
  assert.match(bad.errors.join(" | "), /relatively prime: GCD\[5 5\] = 5/);
  // A genuine 1:2:1 butterfly has a GCD of 1 and survives untouched.
  const fly = validateOrderRequest({ type: "market", time_in_force: "day", order_class: "mleg",
    qty: "1", legs: [leg("A", 1), leg("B", 2), leg("C", 1)] });
  assert.deepEqual(fly.errors, []);
});

test("ORDER — a price field that does not belong to the type is refused", () => {
  const leg = (sym) => ({ side: "buy", position_intent: "buy_to_open", symbol: sym, ratio_qty: "1" });
  const base = { type: "market", time_in_force: "day", order_class: "mleg", qty: "1", legs: [leg("A"), leg("B")] };
  assert.match(validateOrderRequest({ ...base, limit_price: "0.24" }).errors.join(" | "),
    /limit_price is not supported for market orders\./);
  assert.match(validateOrderRequest({ ...base, stop_price: "1" }).errors.join(" | "),
    /stop_price is not supported/);
  assert.match(validateOrderRequest({ ...base, time_in_force: "forever" }).errors.join(" | "),
    /time_in_force "forever" is not one of/);
});

test("ORDER — the refusal names the rule and never truncates it", () => {
  const s = contractRefusal(["At least 2 legs are required for the mleg order class."]);
  assert.ok(s.includes("At least 2 legs are required"), s);
  assert.ok(s.includes("alpacaContract.js"), "the sentence says where the rule is written down");
});

/* ---------------- OUR OWN BODIES, ALL SIX PATHS ---------------- */

const V_CALL = [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }];
const V_PUT = [{ side: -1, qty: 1, type: "put", strike: 62.5 }, { side: 1, qty: 1, type: "put", strike: 59 }];
const FLY = [{ side: 1, qty: 1 }, { side: -1, qty: 2 }, { side: 1, qty: 1 }];

test("OUR BODIES — every shape the six order paths send validates", () => {
  const cases = [
    // 1. App.jsx sendToAlpaca — the manual multileg ticket, opening a debit.
    ["open debit vertical, limit", { legs: V_CALL, occs: ["C22", "C24"], userQty: 1, type: "limit", limit: 0.24, tif: "day", intent: "open" }],
    // 2. pro.jsx OrderTicket — opening a credit, GTC, sized.
    ["open credit vertical, gtc, x5", { legs: V_PUT, occs: ["P625", "P590"], userQty: 5, type: "limit", limit: -0.75, tif: "gtc", intent: "open" }],
    // 3. pro.jsx closeGroup — a whole strategy, market.
    ["close vertical, market", { legs: V_CALL, occs: ["C22", "C24"], userQty: 1, type: "market", tif: "day", intent: "close" }],
    // 4. pro.jsx placeExit — the exit ladder, a limit close.
    ["close vertical, limit gtc", { legs: V_CALL, occs: ["C22", "C24"], userQty: 3, type: "limit", limit: 0.37, tif: "gtc", intent: "close" }],
    // 5/6. autopilot.mjs → approve.mjs — a butterfly closed at a live limit.
    ["close butterfly, limit", { legs: FLY, occs: ["A", "B", "C"], userQty: 1, type: "limit", limit: 0.48, tif: "day", intent: "close" }],
    // The single-leg path, which is a SIMPLE order and not an mleg.
    ["single leg, limit", { legs: [{ side: 1, qty: 1 }], occs: ["C22"], userQty: 2, type: "limit", limit: 1.2, tif: "day", intent: "open" }],
    ["single leg, market", { legs: [{ side: -1, qty: 1 }], occs: ["C22"], userQty: 1, type: "market", tif: "day", intent: "close" }],
  ];
  for (const [label, arg] of cases) {
    const body = orderBody(arg);
    const v = validateOrderRequest(body);
    assert.deepEqual(v.errors, [], `${label}: ${v.errors.join(" | ")}`);
    // ...and the body wears the right class for its leg count.
    if (arg.legs.length > 1) {
      assert.equal(body.order_class, "mleg", label);
      assert.equal(body.symbol, undefined, `${label}: an mleg names its contracts on the legs`);
    } else {
      assert.equal(body.order_class, undefined, `${label}: a single leg is a simple order`);
    }
  }
});

test("OUR BODIES — orderBody() REFUSES a body the contract would not build", () => {
  // Five legs: alpaca-py's ceiling is four, and the callers' own check used to
  // be the only thing between this and a 422.
  assert.throws(() => orderBody({
    legs: [{ side: 1, qty: 1 }, { side: -1, qty: 1 }, { side: 1, qty: 1 }, { side: -1, qty: 1 }, { side: 1, qty: 1 }],
    occs: ["A", "B", "C", "D", "E"], userQty: 1, type: "market", intent: "open",
  }), /At most 4 legs/);
  // A leg the chain never named: `symbol: undefined` used to go out as-is.
  assert.throws(() => orderBody({
    legs: V_CALL, occs: ["C22", null], userQty: 1, type: "limit", limit: 0.24, intent: "open",
  }), /symbol is required/);
  // Two legs on the same contract.
  assert.throws(() => orderBody({
    legs: V_CALL, occs: ["C22", "C22"], userQty: 1, type: "market", intent: "open",
  }), /unique symbols/);
});

/* ---------------- what comes back ---------------- */

test("RESPONSE — the order reply is READ, and its signs survive", () => {
  const o = parseOrder({
    id: "e98ad0e8-3a2e-4a1b-8c76-4e6c95d62ac0", status: "FILLED", order_class: "mleg",
    type: "limit", time_in_force: "gtc", qty: "1", filled_qty: "1",
    limit_price: "0.75", filled_avg_price: "-0.04",
  });
  // J-0001 as Alpaca holds it: a debit limit, a credit fill.
  assert.equal(o.limitPrice, 0.75);
  assert.equal(o.filledAvgPrice, -0.04, "a credit fill is NEGATIVE, as Alpaca's own panel prints it");
  assert.equal(o.status, "filled", "the status is lower-cased once, here");
  assert.equal(o.statusKnown, true);
  assert.equal(o.qty, 1);
  // A STATUS THIS FILE DID NOT MIRROR IS A FACT ABOUT THIS FILE.
  assert.equal(parseOrder({ status: "quantum_superposition" }).statusKnown, false);
  // UNKNOWN IS NOT ZERO — the eighth time in this repository.
  const empty = parseOrder({ status: "accepted", qty: "1" });
  assert.equal(empty.filledAvgPrice, null);
  assert.equal(empty.filledQty, null);
  assert.equal(parseOrder({ filled_avg_price: "" }).filledAvgPrice, null);
  assert.equal(parseOrder({ filled_avg_price: "0" }).filledAvgPrice, 0, "a real zero is a real reading");
  assert.equal(wireNumber(null), null);
  assert.equal(wireNumber(""), null);
  assert.equal(wireNumber("abc"), null);
  assert.equal(wireNumber("0"), 0);
  // Nested legs on a multi-leg reply are read the same way.
  const nested = parseOrder({ status: "filled", order_class: "mleg", legs: [{ status: "filled", filled_avg_price: "1.12" }] });
  assert.equal(nested.legs[0].filledAvgPrice, 1.12);
});

test("RESPONSE — a broker POSITION is read, and it is not an order", () => {
  const p = parsePosition({
    symbol: "XLE261030P00059000", asset_class: "us_option", qty: "1", side: "long",
    avg_entry_price: "1.12", cost_basis: "112", unrealized_pl: "-112", market_value: "",
  });
  assert.equal(p.symbol, "XLE261030P00059000");
  assert.equal(p.avgEntryPrice, 1.12);
  assert.equal(p.unrealizedPl, -112);
  assert.equal(p.marketValue, null, "an empty string is not a market value of zero");
  assert.equal(parsePosition({}).qty, null);
});

/* ---------------- the mirror cites its source ---------------- */

test("THE MIRROR CITES ITS SOURCE, rule by rule", () => {
  /* A hand-written mirror whose provenance is not written down is a guess that
     looks like a fact. Every block in that file names the alpaca-py file it
     came from, and the header says in full what the OpenAPI spec can and
     cannot settle. */
  const src = readFileSync(new URL("./alpacaContract.js", import.meta.url), "utf8");
  for (const cite of [
    "alpaca/trading/enums.py",
    "alpaca/trading/requests.py",
    "alpaca/trading/models.py",
    "OptionLegRequest",
    "LimitOrderRequest",
    "oas/trading/openapi.yaml",
  ]) {
    assert.ok(src.includes(cite), `the mirror does not cite ${cite}`);
  }
  // The two rules that are NOT alpaca-py's are marked as this app's own.
  assert.equal((src.match(/THIS APP'S OWN RULE/g) || []).length >= 2, true,
    "a rule nobody can attribute is a rule nobody can check");
  // And no Python was vendored.
  /* The Python in that file is QUOTED, inside comments, which is the whole
     point of citing a source. What must not exist is Python as CODE — so the
     comments come out before the check, exactly as the rule-literal sweep in
     riskGate.test.js strips them before reading a number. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.equal(/^\s*(def |class \w+\(|@model_validator|raise ValueError)/m.test(code), false,
    "no Python is vendored here: it is a mirror, not a copy");
  assert.ok(/def root_validator/.test(src), "and the Python it mirrors IS quoted, so the mirror can be checked");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(Object.keys(pkg.dependencies).some((d) => /alpaca/i.test(d)), false,
    "no dependency was added for this");
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
