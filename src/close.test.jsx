// The close, written out before it is sent (ROADMAP PR #38, order path 3).
// `CloseConfirm` is what both the desk and the Positions card draw between
// tap 1 (`prepareClose()`) and tap 2 (`sendClose()`).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CloseConfirm } from "./pro.jsx";
import { prepareClose, groupForRecord } from "./closeOrder.js";

const ok = [], bad = [];
const check = async (name, fn) => { try { await fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasnt = (html, s) => { if (html.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };

const HOLDING = [
  { symbol: "XLE261030C00090000", qty: "1", cost_basis: "210", unrealized_pl: "40" },
  { symbol: "XLE261030C00095000", qty: "-1", cost_basis: "-85", unrealized_pl: "-10" },
];
const CHAIN = { byExp: { "2026-10-30": { calls: { 90: { bid: 2.0, ask: 2.2 }, 95: { bid: 0.8, ask: 0.9 } }, puts: {} } } };
const PASS = () => ({ pass: true, violations: [], warnings: [] });

(async () => {
await check("tap 1 shows the order in full: every leg, the signed limit and how long it stands", async () => {
  const prepared = await prepareClose(groupForRecord({ ticker: "XLE", expKey: "2026-10-30" }, HOLDING),
    { gate: PASS, fetchChain: async () => CHAIN, demo: false });
  if (!prepared.ok) throw new Error(prepared.refusal);
  const h = renderToStaticMarkup(<CloseConfirm prep={{ key: "x", prepared }} onSend={() => {}} onCancel={() => {}} />);
  has(h, "SELL to close");
  has(h, "BUY to close");
  has(h, "credit");
  has(h, "good for today only");
  has(h, "Send the close");
  hasnt(h, "market");
});

await check("a refusal prints beside the button, and there is nothing to send", async () => {
  const h = renderToStaticMarkup(<CloseConfirm prep={{ key: "x", refusal: "The close was not sent: no chain." }} onSend={() => {}} onCancel={() => {}} />);
  has(h, "The close was not sent: no chain.");
  hasnt(h, "Send the close");
});

await check("after the send it says what was sent", async () => {
  const h = renderToStaticMarkup(<CloseConfirm prep={{ key: "x", sent: "Closing XLE — sent as a single order." }} onSend={() => {}} onCancel={() => {}} />);
  has(h, "sent as a single order");
  hasnt(h, "Send the close");
});

for (const n of ok) console.log(`  ok   ${n}`);
for (const [n, m] of bad) console.log(`  FAIL ${n}\n       ${m}`);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
})();
