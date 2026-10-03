// PR #46, TASK 0 — the one orders list and the close confirm's price, rendered.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { OrdersPanel, OrderRow, CloseChoice } from "./orders.jsx";
import { CloseConfirm } from "./pro.jsx";
import { prepareClose, groupForRecord } from "./closeOrder.js";

const ok = [], bad = [];
const check = async (name, fn) => { try { await fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasnt = (html, s) => { if (html.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };

const SYM = "GDX261030P00094000";
const HOLD = [{ symbol: SYM, qty: "9", cost_basis: "4500", current_price: "7.90" }];
const CHAIN = { byExp: { "2026-10-30": { puts: { 94: { bid: 7.80, ask: 8.10 } }, calls: {} } } };
const ORDER = { id: "b2c3d4e5-0000-4000-8000-000000000001", symbol: SYM, qty: "9", filled_qty: "0", side: "sell",
  type: "limit", limit_price: "8.23", time_in_force: "day", status: "new", position_intent: "sell_to_close",
  submitted_at: "2026-10-01T13:31:02Z" };
const ctx = { positions: HOLD, orders: [ORDER], chainFor: () => CHAIN, demo: false,
  recordFor: () => ({ ref: "J-0001" }) };

(async () => {
await check("THE ROW AT REST (PR #47): three short lines — what, terms, the book with Alpaca's mark — and Modify / Cancel / History", () => {
  const html = renderToStaticMarkup(<OrderRow order={ORDER} ctx={ctx} />);
  has(html, "J-0001 · ");
  has(html, "Close 9 GDX 94P 30 Oct");
  has(html, "$8.23 credit · today · 0 of 9");
  has(html, "bid 7.80 · mid 7.95 · ask 8.10 · mark 7.90");
  // The limit is above the mark: one glyph at rest, the sentence behind its ⓘ.
  has(html, "⚠"); has(html, "About the limit against Alpaca&#x27;s mark");
  hasnt(html, "above Alpaca&#x27;s mark of $7.90");
  for (const b of [">Modify<", ">Cancel<", ">History<"]) has(html, b);
  // Cancel is the danger OUTLINE, never a red fill.
  hasnt(html, "background:#b23a2b");
});

await check("THE CLOCK LINE: on every row when the market is closed, and never when it was not read", () => {
  const closed = { is_open: false, next_open: "2026-10-05T09:30:00-04:00" };
  has(renderToStaticMarkup(<OrderRow order={ORDER} ctx={{ ...ctx, clock: closed }} />), "Market closed · opens Mon");
  hasnt(renderToStaticMarkup(<OrderRow order={ORDER} ctx={{ ...ctx, clock: null }} />), "Market closed");
  hasnt(renderToStaticMarkup(<OrderRow order={ORDER} ctx={{ ...ctx, clock: { ...closed, is_open: true } }} />), "Market closed");
});

await check("AN ORDER WITH NO RECORD carries one short tag; J-0001's own close does not (0a)", () => {
  const mine = renderToStaticMarkup(<OrderRow order={ORDER} ctx={ctx} />);
  hasnt(mine, "sent outside this app");
  const theirs = renderToStaticMarkup(<OrderRow order={ORDER} ctx={{ ...ctx, recordFor: () => null, gap: "The long sentence." }} />);
  has(theirs, "sent outside this app");
  hasnt(theirs, "The long sentence.");   // behind the ⓘ
});

await check("THE ORDERS SEGMENT: one row per order, Cancel all at the bottom, 'not read' is not 'none'", () => {
  const one = renderToStaticMarkup(<OrdersPanel orders={[ORDER]} ctx={ctx} />);
  has(one, "Cancel all");
  if (one.indexOf("Cancel all") < one.indexOf("data-order-row")) throw new Error("Cancel all sits at the bottom");
  has(renderToStaticMarkup(<OrdersPanel orders={[]} ctx={ctx} />), "No orders working at Alpaca.");
  has(renderToStaticMarkup(<OrdersPanel orders={null} ctx={ctx} />), "not read from Alpaca yet");
});

await check("HISTORY: the owner's local time, and the order id LAST", () => {
  const html = renderToStaticMarkup(<OrderRow order={ORDER} ctx={ctx} initialMode="details" />);
  has(html, "YOUR TIME");
  if (!/\d{1,2} Oct \d{2}:\d{2}:\d{2} · submitted/.test(html)) throw new Error("no local stamp");
  if (html.lastIndexOf("order b2c3d4e5") < html.lastIndexOf("status now")) throw new Error("the id is not last");
});

await check("THE CLOSE CONFIRM: one line, the same price field starting at closeLimitPrice(), Send / Keep it open", async () => {
  const p = await prepareClose(groupForRecord({ ticker: "GDX", expKey: "2026-10-30" }, HOLD),
    { gate: () => ({ pass: true, violations: [] }), fetchChain: async () => CHAIN, demo: false });
  const html = renderToStaticMarkup(<CloseConfirm prep={{ prepared: p }} onSend={() => {}} onCancel={() => {}} onChoose={() => {}} />);
  has(html, "Sell 9 GDX 94P (30 Oct) at $7.88 each · today · you receive ≈ $7,092");
  has(html, 'type="range"');
  has(html, "$7.88");               // the default, closeLimitPrice()
  has(html, "Quantity, you hold 9");
  has(html, "GTC");
  has(html, ">Send<"); has(html, ">Keep it open<");
  // Without onChoose the confirm has no slider, as before.
  hasnt(renderToStaticMarkup(<CloseConfirm prep={{ prepared: p }} onSend={() => {}} onCancel={() => {}} />), 'type="range"');
  if (renderToStaticMarkup(<CloseChoice prepared={{ ...p, bounds: null }} onChoose={() => {}} />) !== "") throw new Error("no range, no field");
});

await check("THE ORDER PRINTS ONCE: no row on the card; the card says one line and opens Orders", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  hasnt(app, "<OrderRow ");
  has(app, "<WorkingCloseLine");
  has(app, 'setPosSeg("orders"); setFocusOrder(');
  has(app, "<DeskCountLine");
  const pro = readFileSync("src/pro.jsx", "utf8");
  hasnt(pro, "cancel(o.id)");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
})();
