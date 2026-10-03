// ============================================================================
// scripts/surfaces.jsx — THE FOUR SURFACES OF PR #47, RENDERED ON J-0001 AND COUNTED (TASK 3).
//
// Bundled and run by `scripts/surfaces.mjs` (esbuild → node, as the JSX tests are). Prints one JSON object:
// { positions, orders, confirm, modify, ordersSegment } — words at rest, by `renderedWords()` in src/wordcount.mjs.
// The fixtures are J-0001 as it stood on 2 Oct 2026, 22:08 Milan: 9 × GDX 94P 30 Oct, close working at $7.62 GTC,
// 0 of 9, market closed; and J-0002, +25 / −25 XLE call spread. The time zone is pinned to Milan.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { renderedWords } from "../src/wordcount.mjs";
import { OrderRow, OrdersPanel } from "../src/orders.jsx";
import { CloseConfirm } from "../src/pro.jsx";
import { PositionCard } from "../src/positionCard.jsx";
import { AccountStrip, PositionsBar, WorkingCloseLine } from "../src/positions.jsx";
import { prepareClose, groupForRecord } from "../src/closeOrder.js";
import { rowLines, workingCloseText } from "../src/orderRow.js";
import { marketClockLine } from "../src/clock.js";
import { takeProfitTarget, positionAction } from "../src/rules.js";
import { exitProgress, entryVsNow, displayName, pnlShareOfRisk, pnlShareText, sizeWords, withExactMaxProfit } from "../src/positionView.js";

process.env.TZ = process.env.TZ || "Europe/Rome";
const NOW = Date.parse("2026-10-02T20:08:00Z");
const SYM = "GDX261030P00094000";
export const CLOCK = { timestamp: "2026-10-02T16:08:00-04:00", is_open: false, next_open: "2026-10-05T09:30:00-04:00", next_close: "2026-10-05T16:00:00-04:00" };
export const HOLD = [{ symbol: SYM, qty: "9", avg_entry_price: "5.00", current_price: "7.70", unrealized_pl: "2430" },
  { symbol: "XLE261106C00090000", qty: "25", avg_entry_price: "3.00", current_price: "3.40" },
  { symbol: "XLE261106C00095000", qty: "-25", avg_entry_price: "1.00", current_price: "1.20" }];
export const CHAIN = { byExp: { "2026-10-30": { puts: { 94: { bid: 7.60, ask: 7.90 } }, calls: {} } } };
export const CLOSE = { id: "c0ffee00-0000-4000-8000-000000000002", symbol: SYM, qty: "9", filled_qty: "0", side: "sell",
  type: "limit", limit_price: "7.62", time_in_force: "gtc", status: "new", position_intent: "sell_to_close",
  created_at: "2026-10-02T20:08:06Z", submitted_at: "2026-10-02T20:08:06Z", replaces: "c0ffee00-0000-4000-8000-000000000001" };
export const J1 = { id: 1, ref: "J-0001", ticker: "GDX", name: "Imported from Alpaca", expKey: "2026-10-30", expiry: "2026-10-30",
  legs: [{ side: 1, type: "put", strike: 94, qty: 9 }], entryNet: 45, entrySpot: 100, contracts: 1, openedAt: "2026-09-22T14:00:00Z",
  maxProfit: 37800, maxLoss: -4500, alpacaHeld: true, alpacaId: "open-1", thesis: { pop: null },
  closeOrder: { id: CLOSE.id, t: NOW, limit: "7.62" } };
export const J2 = { id: 2, ref: "J-0002", ticker: "XLE", name: "Bull call spread", expKey: "2026-11-06", expiry: "2026-11-06",
  legs: [{ side: 1, type: "call", strike: 90, qty: 5 }, { side: -1, type: "call", strike: 95, qty: 5 }], entryNet: 10, entrySpot: 91,
  contracts: 5, openedAt: "2026-09-25T14:00:00Z", maxProfit: 1500, maxLoss: -1000, alpacaHeld: true, thesis: { pop: 0.48 } };
export const ctx = { positions: HOLD, orders: [CLOSE], chainFor: () => CHAIN, demo: false, clock: CLOCK,
  recordFor: (o) => (o && o.id === CLOSE.id ? J1 : null), gap: null, request: async () => ({}) };

const card = (rec, { pnl, dteLeft, working = false }) => {
  const p = withExactMaxProfit(rec);
  const n = rec.contracts;
  const tp = takeProfitTarget({ legs: p.legs, maxProfit: p.maxProfit, maxLoss: p.maxLoss, entryNet: p.entryNet, contracts: n });
  const act = positionAction({ tpHit: pnl >= tp.dollars, pnl, dteLeft, tpBasis: tp.basis || "max-profit" });
  return (
    <PositionCard key={rec.id} p={p} title={displayName(p)} action={act.action} line={act.line} notes={act.notes} pnl={pnl}
      shareText={pnlShareText(pnlShareOfRisk(pnl, p, n))}
      progress={exitProgress({ p, pnl, dteLeft, tpTarget: tp, n, now: NOW })}
      ev={entryVsNow({ p, n, pnl, popNow: 0.6, nowSignals: null })}
      unitNote={`${sizeWords(p)}, the whole position. Now is what is left from here.`}
      closeLabel={working ? null : "Close at limit"} fileKind="held" guardian={<div />}>
      {working && <WorkingCloseLine line={workingCloseText(rowLines(CLOSE).terms)} clockLine={marketClockLine(CLOCK)} onManage={() => {}} />}
    </PositionCard>
  );
};

export function render() {
  const segment = renderToStaticMarkup(<div>
    <AccountStrip account={{ account_number: "PA1", equity: "102430.12", buying_power: "180000", options_buying_power: "97500" }}
      risk={{ openRisk: 9500, total: 25000, sizingFree: false }} capital={100000} />
    <PositionsBar seg="positions" holdings={2} orders={1} onSeg={() => {}} onRefresh={() => {}} />
    {card(J1, { pnl: 2430, dteLeft: 28, working: true })}
    {card(J2, { pnl: 1000, dteLeft: 35 })}
  </div>);
  const row = renderToStaticMarkup(<OrderRow order={CLOSE} ctx={ctx} />);
  const modify = renderToStaticMarkup(<OrderRow order={CLOSE} ctx={ctx} initialMode="modify" />);
  const ordersSegment = renderToStaticMarkup(<OrdersPanel orders={[CLOSE]} ctx={ctx} />);
  return { segment, row, modify, ordersSegment };
}

export async function confirmHtml() {
  const p = await prepareClose(groupForRecord({ ticker: "GDX", expKey: "2026-10-30" }, HOLD.slice(0, 1)),
    { gate: () => ({ pass: true, violations: [] }), fetchChain: async () => CHAIN, demo: false });
  return renderToStaticMarkup(<CloseConfirm prep={{ prepared: p }} clock={CLOCK} onSend={() => {}} onCancel={() => {}} onChoose={() => {}} />);
}

if (process.argv.includes("--json") || process.env.OSL_SURFACES) {
  (async () => {
    const r = render();
    const confirm = await confirmHtml();
    const out = { positions: renderedWords(r.segment), orders: renderedWords(r.row), confirm: renderedWords(confirm),
      modify: renderedWords(r.modify), ordersSegment: renderedWords(r.ordersSegment) };
    if (process.argv.includes("--html")) out.html = { ...r, confirm };
    console.log(JSON.stringify(out));
  })();
}
