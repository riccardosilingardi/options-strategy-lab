/* =====================================================================
   MODIFY A WORKING ORDER (PR #46, TASK 0) — ORDER PATH 7, AND WHERE IT IS NOT.

   WHAT ALPACA DOES, CHECKED BEFORE THIS WAS WRITTEN:
   - alpaca-py 0.44.0 `TradingClient.replace_order_by_id(order_id, ReplaceOrderRequest)`
     is `PATCH /orders/{order_id}` with `qty`, `time_in_force`, `limit_price`,
     `stop_price`, `trail`, `client_order_id`. It says nothing about options.
   - Alpaca's options overview lists "the ability to replace and cancel options
     orders", and its replace reference refuses orders in `accepted`,
     `pending_new`, `pending_cancel` or `pending_replace`.
   - Alpaca's multi-leg reference answers a PATCH on an mleg order with 403
     "replace mleg order is disabled".
   (Read through search results on 2 Oct 2026: docs.alpaca.markets itself is
   blocked from the build sandbox. A live replace has never been run: PRD §4.)

   SO MODIFY IS TWO THINGS, CHOSEN BY THE ORDER'S SHAPE:
   - ONE LEG → ORDER PATH 7: `evaluateTrade()` through the gate, then
     `PATCH /v2/orders/{id}`. Alpaca keeps one order (the old one reads
     `replaced`), so there are never two working.
   - SEVERAL LEGS → no new path: cancel, wait until Alpaca REPORTS the old order
     canceled (`waitForCanceled()`), then a new order through path 3 (a close)
     or path 2 (an opening order, on Build's ticket). Nothing new is sent while
     the old one may still be working.
===================================================================== */
import { orderLegs, orderIntent, orderHoldingKey, heldToLimit, limitToHeld, withinBounds, waitForCanceled } from "./orderRow.js";
import { validateOrderRequest } from "./alpacaContract.js";
import { alpacaErrorText, cancelOutcome } from "./order.js";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";

const DAY_MS = 86400000;
const dteOf = (expKey, now = Date.now()) => {
  const t = Date.parse(`${expKey}T21:00:00Z`);
  return Number.isFinite(t) ? Math.max(0, Math.round((t - now) / DAY_MS)) : null;
};

/**
 * What a Modify would change, checked, before anything is sent (tap 1).
 * @param order   the Alpaca order as listed
 * @param choice  { limit, qty, tif } — `limit` in the order's own price space
 * @param bounds  `limitBounds()` for this order, from the chain read now
 * @param heldQty for a close, the combinations held (the most a close may sell)
 */
export function modifyPlan(order = {}, { limit, qty, tif = "day", bounds = null, heldQty = null } = {}) {
  const refuse = (refusal) => ({ ok: false, refusal, mode: null, patch: null, lines: [] });
  const legs = orderLegs(order);
  if (!legs) return refuse(`This order's contracts could not be read from their symbols, so it cannot be modified here.`);
  if (!bounds) return refuse(`The chain for this order is not loaded, so there is no range to choose a price from. ` +
    `Refresh, then try again.`);
  if (!withinBounds(limit, bounds)) {
    return refuse(`A price of $${Math.abs(+limit || 0).toFixed(2)} is outside the range: between the side that fills ` +
      `($${Math.abs(bounds.fill).toFixed(2)}) and the mid ($${Math.abs(bounds.mid).toFixed(2)}).`);
  }
  const n = Math.round(Number(qty));
  const most = orderIntent(order) === "close" && heldQty != null ? heldQty : 20;
  if (!Number.isFinite(n) || n < 1 || n > most) return refuse(`The quantity must be between 1 and ${most}.`);
  const t = String(tif || "").toLowerCase();
  if (t !== "day" && t !== "gtc") return refuse(`Time in force is DAY or GTC, nothing else.`);
  const price = (+limit).toFixed(2);
  const single = legs.length === 1;
  const lines = [
    `${single ? "Replace" : "Cancel, then send again"}: ${n} at $${Math.abs(+price).toFixed(2)} ` +
      `${orderIntent(order) === "close" ? "to close" : "to open"}, ${t === "gtc" ? "good till cancelled" : "for today's session"}.`,
    single
      ? `Alpaca replaces the order in place; the old one reads "replaced" and only the new one works.`
      : `Alpaca does not replace multi-leg orders, so the old one is cancelled first. Nothing new is sent until Alpaca ` +
        `reports it canceled.`,
  ];
  if (single) {
    // THE PATCH IS ALPACA'S `ReplaceOrderRequest`, and `limit_price` IS THE CHOSEN PRICE.
    const patch = { qty: String(n), time_in_force: t, limit_price: price };
    return { ok: true, refusal: null, mode: "replace", patch, lines, limit: +price, qty: n, tif: t };
  }
  return { ok: true, refusal: null, mode: "cancel-new", patch: null, lines, limit: +price, qty: n, tif: t };
}

/**
 * THE GATE'S VIEW OF A MODIFIED ORDER. A close is intent "close" (the paper
 * rule applies, the entry rules do not); an opening order carries the same
 * evidence every open-intent gate call carries — quotes, net and the OCC
 * symbols — so `priceability()` and `contractListing()` see it.
 */
export function modifyProposal(order, plan, book = null) {
  const legs = orderLegs(order) || [];
  const key = orderHoldingKey(order) || {};
  const quotes = (book && book.quotes) || legs.map(() => ({}));
  const net = limitToHeld(order, plan.limit);
  const legsAt = legs.map((l) => ({ side: l.side, qty: l.ratio, type: l.type, strike: l.strike }));
  if (orderIntent(order) === "close") {
    return { intent: "close", ticker: key.ticker, legs: legsAt.map((l) => ({ ...l, qty: l.qty * plan.qty })),
      maxLoss: null, contracts: 1 };
  }
  // A long option or a debit structure: the most it can lose is what is paid.
  const maxLoss = net != null && net > 0 ? -net * 100 : null;
  return { ticker: key.ticker, intent: "open", legs: legsAt, dte: dteOf(key.expKey), contracts: plan.qty,
    maxLoss, maxProfit: null, quotes: quotes.map((q, i) => ({ ...q, occ: legs[i]?.symbol || null })),
    net, occs: legs.map((l) => l.symbol) };
}

/**
 * TAP 2. Sends what tap 1 planned.
 * @param request   (path, method, body) => reply — pro.jsx `alpacaReq`
 * @param gate      the risk gate, run FIRST, before anything reaches Alpaca
 * @param sendNew   for "cancel-new": async () => { ok, refusal, headline } — the
 *                  new order through path 3 (close) or path 2 (open). Called only
 *                  after Alpaca reports the old order canceled.
 */
export async function sendModify(order, plan, { request, gate, book = null, sendNew = null, demo = DEMO, waitOpts = null } = {}) {
  if (demo) return { ok: false, refusal: DEMO_TOOLTIP };
  if (!plan || !plan.ok) return { ok: false, refusal: plan?.refusal || "Nothing was modified: there is no plan to send." };
  if (typeof request !== "function") return { ok: false, refusal: "Nothing was modified: no broker connection." };
  const g = typeof gate === "function" ? gate(modifyProposal(order, plan, book))
    : { pass: false, violations: [{ message: "The risk gate is not wired into this screen, so no order can leave it." }] };
  if (!g.pass) return { ok: false, refusal: `Risk gate: nothing was modified. ${g.violations.map((v) => v.message).join(" ")}` };

  if (plan.mode === "replace") {
    // ORDER PATH 7. The patch is checked against the contract like any body.
    const v = validateOrderRequest({ symbol: order.symbol, side: order.side, type: "limit",
      qty: plan.patch.qty, time_in_force: plan.patch.time_in_force, limit_price: plan.patch.limit_price });
    if (!v.ok) return { ok: false, refusal: `Nothing was modified: ${v.errors.map((e) => e.message || e).join(" ")}` };
    try {
      const o = await request(`/v2/orders/${encodeURIComponent(order.id)}`, "PATCH", plan.patch);
      return { ok: true, refusal: null, order: o, mode: "replace",
        headline: `Modified: Alpaca replaced the order — ${plan.qty} at $${plan.limit.toFixed(2)}, ` +
          `${plan.tif === "gtc" ? "good till cancelled" : "for today's session"}. Order ${String(o?.id || "").slice(0, 8)}… ` +
          `is the one working now.` };
    } catch (e) {
      return { ok: false, refusal: `Nothing was modified: ${alpacaErrorText(e)}` };
    }
  }

  if (typeof sendNew !== "function") return { ok: false, refusal: "Nothing was modified: no path for the new order." };
  let res;
  try { await request(`/v2/orders/${encodeURIComponent(order.id)}`, "DELETE"); res = cancelOutcome({ ok: true }); }
  catch (e) { res = cancelOutcome({ error: e }); }
  if (res.kind === "failed") return { ok: false, refusal: res.headline };
  const w = await waitForCanceled(order.id, request, waitOpts || undefined);
  if (!w.ok) return { ok: false, refusal: w.sentence, cancelRequested: true };
  const r = await sendNew();
  return r && r.ok
    ? { ok: true, refusal: null, mode: "cancel-new", headline: `The old order is canceled. ${r.headline || ""}`.trim(), order: r.order }
    : { ok: false, refusal: `The old order is canceled, and the new one was not sent: ${r?.refusal || "no reason given"}`,
      canceled: true };
}

/** Cancel every working order, after one confirm. DELETE /v2/orders. */
export async function cancelAll({ request, demo = DEMO } = {}) {
  if (demo) return { ok: false, headline: DEMO_TOOLTIP };
  try {
    const r = await request("/v2/orders", "DELETE");
    const n = Array.isArray(r) ? r.length : null;
    return { ok: true, headline: `Cancel requested for ${n != null ? `${n} order${n === 1 ? "" : "s"}` : "every working order"}. ` +
      `Each is working until Alpaca reports it canceled.` };
  } catch (e) {
    return { ok: false, headline: cancelOutcome({ error: e }).headline };
  }
}

export { heldToLimit };
