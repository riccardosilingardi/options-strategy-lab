/* =====================================================================
   ONE ROW PER ORDER, READ FROM ALPACA (PR #46, TASK 0).

   Orders were listed in three places — the desk's "ORDERS WAITING", the
   Positions panel "WORKING AT THE BROKER", and a disabled "Close order working"
   button on the position card — and none of them could change an order.
   Measured on J-0001 (9 × GDX 94P): the close went out as a sell at $8.23 and
   sat "0 of 9 sold" while Alpaca marked the put at $7.90. Nothing on screen put
   the limit beside the mark, so nothing said the limit was on the side that
   does not fill.

   This file is what one row SAYS. Plain JS, no React: `OrdersPanel` in
   pro.jsx draws it, and the tests read it without a DOM.

   WHAT IS READ AND WHAT IS COMPUTED. Read, never recomputed: the order's
   limit, time in force, quantities, times and status; each leg's bid and ask
   from the chain; Alpaca's mark (`current_price` on /v2/positions). Computed,
   because they are combination properties: the structure's bid / mid / ask
   (`comboBook()`), the net of the legs' marks on a multi-leg holding, and
   the range a Modify may choose from.

   PRICE SPACE. Every price a row offers is in the ORDER'S OWN terms — the
   number that goes in `limit_price`. A simple order's is unsigned (its side
   says which way the money goes); a multi-leg order's is signed, positive a
   debit, negative a credit (order.js 1b). `heldToLimit()` is the one place
   that conversion is written.
===================================================================== */
import { comboBook } from "./rules.js";
import { orderLimitWords, orderMoney, orderLifecycle } from "./order.js";

/* THE OCC SYMBOL'S SHAPE — one home. closeOrder.js re-exports it. */
export const OCC_RE = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;

/** One OCC symbol, read: underlying, expiry, type, strike. Null when unreadable. */
export function parseOcc(symbol) {
  const m = OCC_RE.exec(String(symbol || ""));
  if (!m) return null;
  const strike = Number(m[4]) / 1000;
  if (!(strike > 0)) return null;
  return { und: m[1], expKey: `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}`,
    type: m[3] === "C" ? "call" : "put", strike };
}

const num = (x) => (x == null || x === "" ? null : (Number.isFinite(Number(x)) ? Number(x) : null));
const isMleg = (o) => String(o?.order_class || "").toLowerCase() === "mleg";

/** Is this order closing something (every leg `_to_close`, or a simple sell)? */
export function orderIntent(order = {}) {
  const pi = String(order.position_intent || "");
  if (!isMleg(order) && pi) return /_to_close$/.test(pi) ? "close" : "open";
  return orderMoney(order).closing ? "close" : "open";
}

/**
 * THE LEGS OF AN ORDER, AS THE STRUCTURE IS HELD (close) OR BEING BOUGHT (open).
 * `side` +1 long / −1 short in the STRUCTURE, `ratio` per combination. A close
 * sells what is long, so its held side is the opposite of the order's side.
 * Null when any symbol cannot be read — never a leg at a strike of zero.
 */
export function orderLegs(order = {}) {
  const intent = orderIntent(order);
  const flip = intent === "close" ? -1 : 1;
  const raw = isMleg(order)
    ? (order.legs || []).map((l) => ({ symbol: l.symbol, side: String(l.side).toLowerCase() === "buy" ? 1 : -1,
        ratio: Math.max(1, Math.round(num(l.ratio_qty) ?? 1)) }))
    : [{ symbol: order.symbol, side: String(order.side).toLowerCase() === "buy" ? 1 : -1, ratio: 1 }];
  const legs = raw.map((l) => {
    const p = parseOcc(l.symbol);
    return p ? { ...p, symbol: l.symbol, side: l.side * flip, ratio: l.ratio, qty: l.ratio } : null;
  });
  return legs.length && legs.every(Boolean) ? legs : null;
}

/** Held-structure net (signed, + debit) → the number `limit_price` carries.
 *  `shape` is an order, or `{ mleg, close }` for a holding with no order yet. */
const shapeOf = (o) => (o && typeof o.mleg === "boolean"
  ? o : { mleg: isMleg(o), close: orderIntent(o) === "close", sign: Math.sign((orderLegs(o) || [{ side: 1 }])[0].side) || 1 });
export function heldToLimit(order, v) {
  if (v == null || !Number.isFinite(+v)) return null;
  const s = shapeOf(order);
  if (!s.mleg) return Math.abs(+v);
  return s.close ? -v : +v;
}
/** And back: a `limit_price` → the held-structure net. */
export function limitToHeld(order, limit) {
  const L = num(limit);
  if (L == null) return null;
  const s = shapeOf(order);
  if (!s.mleg) return Math.abs(L) * (s.sign || 1);
  return s.close ? -L : L;
}

/**
 * THE STRUCTURE'S BOOK, PER COMBINATION, FROM THE CHAIN.
 * `{ ok, bid, mid, ask, spread }` signed as the structure is held (+ debit).
 * Unknown is null, never a book of zeros.
 */
export function orderBook(order, chain) {
  const legs = orderLegs(order);
  if (!legs) return { ok: false, reason: "symbol" };
  const exp = chain?.byExp?.[legs[0].expKey];
  if (!exp) return { ok: false, reason: "chain" };
  const quotes = legs.map((l) => {
    const side = l.type === "put" ? exp.puts : exp.calls;
    const q = side?.[l.strike] ?? side?.[String(l.strike)] ?? null;
    return q ? { bid: q.bid, ask: q.ask } : {};
  });
  const b = comboBook(legs, quotes);
  return b.ok ? { ok: true, bid: b.bid, mid: b.mid, ask: b.ask, spread: b.spread, quotes, legs }
    : { ok: false, reason: "quote", missing: b.missing };
}

/**
 * ALPACA'S MARK, READ OFF /v2/positions. Per combination, signed as held.
 * One leg: that contract's `current_price`, exactly as Alpaca sent it.
 * Several: the net of each leg's `current_price` (a combination property of
 * the broker's own numbers). Null when any leg is not held — an opening order
 * has no mark, and that is said, not shown as zero.
 */
export function orderMark(order, positions = []) {
  const legs = orderLegs(order);
  if (!legs) return null;
  let net = 0;
  for (const l of legs) {
    const p = (positions || []).find((x) => x && x.symbol === l.symbol);
    const cp = num(p?.current_price);
    if (cp == null) return null;
    net += l.side * l.ratio * cp;
  }
  return { held: net, limit: heldToLimit(order, net), single: legs.length === 1 };
}

/**
 * THE RANGE A PRICE MAY BE CHOSEN FROM: between the side that fills and the mid.
 * Buying (open) fills at the ask; selling (close) fills at the bid. Returned in
 * the ORDER'S price space, with `lo`/`hi` sorted for a slider and `fill`/`mid`
 * named for the words. Null without a book.
 */
export function limitBounds(order, book) {
  if (!book || !book.ok) return null;
  const close = shapeOf(order).close;
  const fillHeld = close ? book.bid : book.ask;
  const fill = +heldToLimit(order, fillHeld).toFixed(2);
  const mid = +heldToLimit(order, book.mid).toFixed(2);
  return { fill, mid, lo: Math.min(fill, mid), hi: Math.max(fill, mid) };
}

/** A chosen price held inside the range, on the cent. Null in, null out. */
export function clampLimit(v, bounds) {
  if (v == null || v === "" || !Number.isFinite(+v) || !bounds) return null;
  return +Math.min(bounds.hi, Math.max(bounds.lo, +v)).toFixed(2);
}
export const withinBounds = (v, bounds) =>
  bounds != null && v != null && Number.isFinite(+v) && +v >= bounds.lo - 1e-9 && +v <= bounds.hi + 1e-9;

const usd = (x) => `$${Math.abs(+x).toFixed(2)}`;

/**
 * ONE LINE WHEN THE LIMIT IS PAST THE MARK ON THE SIDE THAT DOES NOT FILL.
 * A sell above the mark waits for a buyer to pay more than the market is worth;
 * a buy below it waits for a seller to take less. Null otherwise, and null
 * without a mark.
 */
export function pastMarkLine(order, mark) {
  if (!mark || mark.held == null) return null;
  const Lh = limitToHeld(order, order?.limit_price);
  if (Lh == null) return null;
  const close = orderIntent(order) === "close";
  const past = close ? Lh > mark.held + 1e-9 : Lh < mark.held - 1e-9;
  if (!past) return null;
  return close
    ? `Your limit of ${usd(Lh)} is above Alpaca's mark of ${usd(mark.held)}: a sell above the mark waits for a ` +
      `buyer to pay more than the market's own price, and may not fill.`
    : `Your limit of ${usd(Lh)} is below Alpaca's mark of ${usd(mark.held)}: a buy below the mark waits for a ` +
      `seller to take less than the market's own price, and may not fill.`;
}

const STAMPS = [
  ["created_at", "created"], ["submitted_at", "submitted"], ["filled_at", "filled"],
  ["canceled_at", "canceled"], ["expired_at", "expired"], ["replaced_at", "replaced"],
  ["failed_at", "failed"], ["updated_at", "last updated"],
];
/** Alpaca's status history for one order: its own timestamps, oldest first. */
export function statusHistory(order = {}) {
  const rows = STAMPS.filter(([k]) => order[k]).map(([k, label]) => ({ t: String(order[k]), label }))
    .sort((a, b) => Date.parse(a.t) - Date.parse(b.t));
  if (order.replaces) rows.push({ t: null, label: `replaces order ${String(order.replaces).slice(0, 8)}…` });
  if (order.replaced_by) rows.push({ t: null, label: `replaced by order ${String(order.replaced_by).slice(0, 8)}…` });
  rows.push({ t: null, label: `status now: ${String(order.status || "not reported")}` });
  for (const l of isMleg(order) ? order.legs || [] : []) {
    rows.push({ t: null, label: `leg ${l.symbol}: ${l.side} ${l.ratio_qty ?? ""} · ${l.status || "no status"}` });
  }
  return rows;
}

/** "a sell to close", in words. */
function whatWords(order, legs) {
  const close = orderIntent(order) === "close";
  const n = num(order.qty);
  const name = legs && legs.length === 1
    ? `${legs[0].und} ${legs[0].strike}${legs[0].type === "put" ? "P" : "C"} ${legs[0].expKey}`
    : legs ? `${legs[0].und} ${legs.length}-leg ${legs[0].expKey}` : String(order.symbol || "an order");
  return `${close ? "Close" : "Open"} ${n != null ? `${n} × ` : ""}${name}`;
}

/**
 * EVERYTHING ONE ROW PRINTS.
 * @param order      an Alpaca order (nested)
 * @param chain      the chain for its underlying, or null
 * @param positions  /v2/positions, for Alpaca's mark
 */
export function orderRowModel(order = {}, { chain = null, positions = [] } = {}) {
  const legs = orderLegs(order);
  const book = orderBook(order, chain);
  const mark = orderMark(order, positions);
  const qty = num(order.qty), filled = num(order.filled_qty) ?? 0;
  const tif = String(order.time_in_force || "").toLowerCase() || null;
  const limitWords = orderLimitWords(order) || null;
  const sentAt = order.submitted_at || order.created_at || null;
  return {
    id: order.id, intent: orderIntent(order), legs, single: !!legs && legs.length === 1,
    what: whatWords(order, legs),
    limitWords, limit: num(order.limit_price), type: String(order.type || "").toLowerCase(),
    tif, tifWords: tif === "gtc" ? "good till cancelled" : tif === "day" ? "today's session only" : tif || "not reported",
    filledLine: `filled ${filled} of ${qty != null ? qty : "?"}`,
    sentAt, status: String(order.status || "").toLowerCase(), working: orderLifecycle({ status: order.status }) === "working",
    book, bookLine: book.ok
      ? `bid ${usd(heldToLimit(order, book.bid))} · mid ${usd(heldToLimit(order, book.mid))} · ask ${usd(heldToLimit(order, book.ask))}` +
        `${isMleg(order) ? (book.mid < 0 ? " (a credit structure)" : " (a debit structure)") : ""}`
      : book.reason === "chain" ? "the chain for this expiry is not loaded" : "no two-sided quote on every leg right now",
    mark, markLine: mark ? `Alpaca's mark ${usd(mark.held)}` : intentNoMark(order),
    pastMark: pastMarkLine(order, mark),
    bounds: limitBounds(order, book),
    history: statusHistory(order),
  };
}
const intentNoMark = (order) => orderIntent(order) === "open"
  ? "no mark from Alpaca: you do not hold these contracts yet"
  : "Alpaca's mark not read";

/** The underlying and expiry an order trades — to match it to a holding. */
export function orderHoldingKey(order) {
  const legs = orderLegs(order);
  return legs ? { ticker: legs[0].und, expKey: legs[0].expKey, symbols: legs.map((l) => l.symbol) } : null;
}

/** The broker's working orders that trade this record's holding (same underlying and expiry). */
export function ordersForRecord(record, orders = []) {
  if (!record?.ticker || !record?.expKey) return [];
  return (orders || []).filter((o) => {
    const k = orderHoldingKey(o);
    return k && k.ticker === record.ticker && k.expKey === record.expKey;
  });
}

/* =====================================================================
   NEVER TWO WORKING ORDERS FOR ONE HOLDING.

   A cancel is a request (`cancelOutcome()`): a 2xx means Alpaca has it, and
   outside the session it sits in `pending_cancel` until 9:30 New York. A new
   order sent in that window is a SECOND working order on the same contracts.
   So every path that cancels before it sends — the close's wash-trade check
   and Modify's cancel-then-new — asks Alpaca until it reports the old order
   ended, and sends nothing new until then.
===================================================================== */
const ENDED_EMPTY = ["canceled", "cancelled", "expired", "rejected", "replaced", "done_for_day"];
const FILLED_ANY = ["filled", "partially_filled"];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Ask Alpaca until the order is reported ended with nothing more to fill.
 * @returns {{ ok, status, sentence }} ok true only for canceled / expired /
 *   rejected / replaced. A fill (whole or part) is NOT ok: what filled is
 *   already traded, and a new order on top of it would be a second one.
 */
export async function waitForCanceled(id, request, { tries = 6, delayMs = 1500, sleep = pause } = {}) {
  let status = null;
  for (let i = 0; i < tries; i++) {
    try { status = String((await request(`/v2/orders/${encodeURIComponent(id)}`, "GET"))?.status || "").toLowerCase(); }
    catch { status = null; }
    if (status && ENDED_EMPTY.includes(status)) return { ok: true, status, sentence: null };
    if (status && FILLED_ANY.includes(status)) {
      return { ok: false, status, sentence: `The old order ${status === "filled" ? "filled" : "partly filled"} before ` +
        `the cancel took effect, so nothing new was sent: a second order would trade the same contracts again.` };
    }
    if (i < tries - 1) await sleep(delayMs);
  }
  return { ok: false, status, sentence: `Alpaca has the cancel but has not reported the old order canceled yet` +
    `${status ? ` (it reads "${status.replace(/_/g, " ")}")` : ""}, so nothing new was sent — two working orders on one ` +
    `holding is what this step exists to prevent. A cancel asked outside the session completes at 9:30 New York; ` +
    `send again once the old order reads canceled.` };
}
