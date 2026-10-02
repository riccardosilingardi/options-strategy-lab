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
await check("THE ROW: words, limit, TIF, filled X of Y, sent time, bid/mid/ask, Alpaca's mark, past-the-mark line, three actions", () => {
  const html = renderToStaticMarkup(<OrderRow order={ORDER} ctx={ctx} />);
  has(html, "J-0001 · Close 9 × GDX 94P 2026-10-30");
  has(html, "Limit a credit of $8.23 (you receive it)");
  has(html, "today&#x27;s session only");
  has(html, "filled 0 of 9");
  has(html, "sent ");
  has(html, "bid $7.80 · mid $7.95 · ask $8.10");
  has(html, "Alpaca&#x27;s mark $7.90");
  has(html, "above Alpaca&#x27;s mark of $7.90");
  for (const b of [">Modify<", ">Cancel<", ">Details<"]) has(html, b);
});

await check("THE LIST: one heading with the count, Cancel all only with more than one, nothing when there is nothing", () => {
  const one = renderToStaticMarkup(<OrdersPanel orders={[ORDER]} ctx={ctx} />);
  has(one, "Orders waiting (1)"); hasnt(one, "Cancel all");
  const two = renderToStaticMarkup(<OrdersPanel orders={[ORDER, { ...ORDER, id: "x2" }]} ctx={ctx} />);
  has(two, "Orders waiting (2)"); has(two, "Cancel all");
  if (renderToStaticMarkup(<OrdersPanel orders={[]} ctx={ctx} />) !== "") throw new Error("an empty list draws nothing");
  has(renderToStaticMarkup(<OrdersPanel orders={null} ctx={ctx} />), "not read yet");
});

await check("THE CLOSE CONFIRM: the same price field, starting at closeLimitPrice(), between the bid and the mid", async () => {
  const p = await prepareClose(groupForRecord({ ticker: "GDX", expKey: "2026-10-30" }, HOLD),
    { gate: () => ({ pass: true, violations: [] }), fetchChain: async () => CHAIN, demo: false });
  const html = renderToStaticMarkup(<CloseConfirm prep={{ prepared: p }} onSend={() => {}} onCancel={() => {}} onChoose={() => {}} />);
  has(html, "Close at");
  has(html, 'type="range"');
  has(html, "$7.88");               // the default, closeLimitPrice()
  has(html, "fills $7.80"); has(html, "mid $7.95");
  has(html, "you hold 9");
  has(html, "GTC");
  // Without onChoose the confirm is exactly what it was.
  hasnt(renderToStaticMarkup(<CloseConfirm prep={{ prepared: p }} onSend={() => {}} onCancel={() => {}} />), 'type="range"');
  if (renderToStaticMarkup(<CloseChoice prepared={{ ...p, bounds: null }} onChoose={() => {}} />) !== "") throw new Error("no range, no field");
});

await check("THE CARD SHOWS THE SAME ROW; Build and the desk show counts only", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "<OrderRow key={o.id} order={o} ctx={orderCtx} inline />");
  has(app, "<DeskCountLine");
  const pro = readFileSync("src/pro.jsx", "utf8");
  hasnt(pro, "cancel(o.id)");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
})();
