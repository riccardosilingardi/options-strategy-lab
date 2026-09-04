// The order ticket's own answer, rendered. `src/order.test.js` covers the
// arithmetic; this covers the thing that was actually missing on 2026-09-04 —
// an outcome the user can SEE, beside the button they tapped.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { OrderOutcome, OrderPending, OrderTicket, runGate } from "./pro.jsx";
import { orderOutcome, orderPreviewLines, reduceRatios, alpacaErrorText } from "./order.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasnt = (html, s) => { if (html.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };

/* ---- the refusal, with Alpaca's own words under it ---- */
check("a refused order shows the status, the reason and the raw reply", () => {
  const body = JSON.stringify({ code: 42210000, message: "leg ratio quantities should be relatively prime: GCD[5 5] = 5" });
  const h = renderToStaticMarkup(
    <OrderOutcome outcome={{ label: "NOT SENT · ALPACA REFUSED IT", headline: alpacaErrorText({ status: 422, body }),
      detail: "Nothing was bought and nothing is working.", body }} onDismiss={() => {}} />);
  has(h, "422");
  has(h, "GCD[5 5] = 5");
  has(h, "42210000");
  has(h, "Dismiss");   // it persists until dismissed, so there has to be a way to dismiss it
});

/* ---- accepted and not filled: the third outcome ---- */
check("a working order says it is working and names where it waits", () => {
  const res = orderOutcome({ id: "b1e0c8aa", status: "accepted", qty: "5", filled_qty: "0",
    type: "limit", limit_price: "0.29", time_in_force: "day" });
  const h = renderToStaticMarkup(
    <OrderOutcome outcome={{ label: "SENT · WORKING, NOT FILLED", headline: res.headline, detail: res.detail }} onDismiss={() => {}} />);
  has(h, "working, not filled");
  has(h, "$0.29");
  hasnt(h, "Position opened");
});

/* ---- the gate's refusal lands in the same place as the broker's ---- */
check("the risk gate's refusal renders in the ticket too", () => {
  const h = renderToStaticMarkup(
    <OrderOutcome outcome={{ label: "NOT SENT · THE RISK GATE REFUSED IT", headline: "Nothing was sent to Alpaca.",
      detail: "The maximum loss is above your per-trade limit." }} onDismiss={() => {}} />);
  has(h, "Nothing was sent to Alpaca.");
  has(h, "per-trade limit");
});

check("nothing renders when there is nothing to say", () => {
  if (renderToStaticMarkup(<OrderOutcome outcome={null} onDismiss={() => {}} />) !== "") throw new Error("an empty outcome drew a box");
});

/* ---- the armed tap says what it armed ---- */
check("the pending state shows what will be sent, and how to send nothing", () => {
  const legs = [{ side: 1, qty: 5, type: "call", strike: 19 }, { side: -1, qty: 5, type: "call", strike: 19.5 }];
  const h = renderToStaticMarkup(
    <OrderPending onCancel={() => {}}
      lines={orderPreviewLines({ legs, factor: reduceRatios(legs).factor, ticker: "BOIL", expKey: "2026-09-18",
        qty: 1, type: "limit", limit: 1.45, tif: "day" })} />);
  has(h, "NOT SENT YET");
  has(h, "BUY 5 × BOIL $19.00 call");
  has(h, "SELL 5 × BOIL $19.50 call");
  has(h, "5 combinations");
  has(h, "Cancel");
});

/* ---- the ticket itself still renders, gate wired and not ---- */
const LEGS = [{ side: 1, qty: 5, type: "call", strike: 19 }, { side: -1, qty: 5, type: "call", strike: 19.5 }];
const PASS = () => ({ pass: true, violations: [], warnings: [] });

check("the ticket asks twice before it sends", () => {
  const h = renderToStaticMarkup(
    <OrderTicket legs={LEGS} expKey="2026-09-18" ticker="BOIL" buildOcc={() => "BOIL260918C00019000"}
      estNet={1.45} setMsg={() => {}} gate={PASS} dte={14} maxLoss={-145} maxProfit={105} />);
  has(h, "Send the order");
  has(h, "every order goes through the risk gate first");
});

check("a screen with no gate wired in fails closed, in words", () => {
  const h = renderToStaticMarkup(
    <OrderTicket legs={LEGS} expKey="2026-09-18" ticker="BOIL" buildOcc={() => "X"} estNet={1.45} setMsg={() => {}} />);
  has(h, "BLOCKED BY THE RISK GATE");
  if (runGate(undefined, {}).pass) throw new Error("a missing gate must never pass");
});

check("a precondition failure does not blame the broker", () => {
  const h = renderToStaticMarkup(
    <OrderOutcome outcome={{ label: "NOT SENT · THE ORDER COULD NOT BE BUILT",
      headline: alpacaErrorText(new Error("type a limit price first — $0.00 is a missing price, not a cheap one")) }} onDismiss={() => {}} />);
  has(h, "COULD NOT BE BUILT");
  hasnt(h, "ALPACA REFUSED");
});

console.log(`${ok.length} passed, ${bad.length} failed`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
