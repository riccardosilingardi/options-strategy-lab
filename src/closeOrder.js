/* =====================================================================
   ORDER PATH 3 — CLOSING A WHOLE HOLDING AT A LIMIT (ROADMAP PR #38)

   This was `closeGroup()` inside pro.jsx's desk panel, and only the desk
   could reach it. The Positions card said the close there "is the same
   order" — and it was not an order at all: `closePos()` deleted the record
   and filed the Journal while nothing reached Alpaca. The body moved here,
   unchanged in what it checks, so the desk and the Positions card call ONE
   path. It is still order path 3 of six; there is no seventh.

   TWO STEPS, BECAUSE THERE ARE TWO TAPS (non-negotiable rule 5):

     prepareClose(group)  tap 1. Runs the gate, plans which working orders
                          would conflict, fetches a chain NOW, prices the
                          close with `closeLimitPrice()`, builds the one
                          body with `orderBody()` (type "limit", never
                          market) and checks it with `limitAgainstBook()`.
                          It cancels nothing and sends nothing: it returns
                          the order written out in full, or the refusal.
     sendClose(prepared)  tap 2. Re-runs the gate, cancels the conflicting
                          orders (the wash-trade check), and POSTs.

   Plain JS, no React: the tests drive both steps with a fake broker.
   Everything that talks to the network is handed in, so nothing here can
   reach Alpaca except through the `request` it is given.
===================================================================== */
import { comboBook, limitAgainstBook, closeMarket, closeLimitPrice, closeLimitNote,
  closeUnreadableNote } from "./rules.js";
import { orderBody, limitWords, orderOutcome, orderPreviewLines, alpacaErrorText } from "./order.js";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";

/* ONE LEG, READ OFF THE BROKER'S OWN OCC SYMBOL.
   `/v2/positions` gives a symbol and a quantity and nothing else — no strike
   field, no type field, no quote. The strike and the type are INSIDE the
   symbol, so reading them is reading the broker's number rather than deriving
   one: `XLE261030P00082000` is a put at 82. The thousandths are the OCC
   standard and `Number(null)` is 0 and 0 is finite, so a symbol this function
   cannot parse comes back NULL and the caller refuses — never a leg with a
   strike of zero, which would price against a contract nobody holds. */
export const OCC_RE = /^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/;
export function holdingLeg(item) {
  const m = OCC_RE.exec(String(item?.symbol || ""));
  if (!m) return null;
  const qty = Math.abs(Math.round(Number(item.qty)));
  if (!Number.isFinite(qty) || qty < 1) return null;
  const strike = Number(m[4]) / 1000;
  if (!Number.isFinite(strike) || strike <= 0) return null;
  return { side: Number(item.qty) > 0 ? 1 : -1, qty, type: m[3] === "C" ? "call" : "put", strike };
}

/** The broker's holdings, one group per underlying and expiry. */
export function holdingGroups(positions = []) {
  const groups = {};
  for (const x of positions || []) {
    const m = OCC_RE.exec(String(x?.symbol || ""));
    const expKey = m ? `20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}` : null;
    const key = m ? `${m[1]} · ${expKey}` : x.symbol;
    if (!groups[key]) groups[key] = { key, items: [], pl: 0, ticker: m ? m[1] : null, expKey };
    groups[key].items.push(x); groups[key].pl += +x.unrealized_pl;
  }
  return Object.values(groups);
}

/** The broker holding behind one of this app's records: same ticker, same expiry. */
export function groupForRecord(record, brokerPositions = []) {
  if (!record || !record.ticker || !record.expKey) return null;
  return holdingGroups(brokerPositions).find((g) => g.ticker === record.ticker && g.expKey === record.expKey) || null;
}

/**
 * IS A CLOSE ALREADY WORKING FOR THIS RECORD? Only the broker can say.
 * Working while the broker still lists the close order as open — or while it
 * has not been asked since the order was sent. Once the order is gone from the
 * open list (filled, cancelled, expired) the button comes back.
 */
export function closeWorking(record, alSync = null) {
  const co = record?.closeOrder;
  if (!co || !co.id) return false;
  if (!alSync || !alSync.t || alSync.t < co.t) return true;
  return (alSync.orders || []).some((o) => o && o.id === co.id);
}

const refuse = (refusal) => ({ ok: false, refusal, body: null, limitWords: null, lines: [], cancelIds: [] });

/**
 * TAP 1. Everything the close needs, worked out now, and nothing sent.
 *
 * @param group       one entry of `holdingGroups()`: { key, ticker, expKey, items }
 * @param gate        the risk gate (`evaluateTrade` wrapped); missing fails closed
 * @param openOrders  the broker's open orders, for the cancel-conflicts plan
 * @param fetchChain  (ticker) => chain, read at the moment of the tap
 * @param demo        demo mode refuses (every order path is off in it)
 * @param working     a close for this holding is already working
 * @returns { ok, body, limitWords, lines, cancelIds, refusal, proposal, group }
 */
export async function prepareClose(group, { gate, openOrders = [], fetchChain, demo = DEMO, working = false } = {}) {
  if (demo) return refuse(DEMO_TOOLTIP);                     // order path 3 of six
  if (working) return refuse(`A close order for this position is already working at the broker. ` +
    `Cancel it there, or wait for it, before sending another.`);
  if (!group || !Array.isArray(group.items) || !group.items.length) {
    return refuse(`The close was not sent: the broker shows no holding for this position right now.`);
  }
  // A close is an order too: it goes through the gate. Intent "close", so the
  // entry rules do not apply and the paper rule does.
  const proposal = {
    intent: "close", ticker: String(group.key || "").split(" ")[0],
    legs: group.items.map((x) => ({ side: +x.qty > 0 ? 1 : -1, qty: Math.abs(+x.qty), type: /C\d{8}$/.test(x.symbol) ? "call" : "put" })),
    maxLoss: group.items.reduce((a, x) => a + Math.abs(+x.cost_basis || 0), 0), contracts: 1,
  };
  const g = typeof gate === "function" ? gate(proposal)
    : { pass: false, violations: [{ message: "The risk gate is not wired into this screen, so no order can leave it." }] };
  if (!g.pass) return refuse(`Risk gate: the close was not sent. ${g.violations.map((v) => v.message).join(" ")}`);
  const syms = new Set(group.items.map((x) => x.symbol));
  const cancelIds = [];
  for (const o of openOrders || []) {
    const oSyms = o.order_class === "mleg" ? (o.legs || []).map((l) => l.symbol) : [o.symbol];
    if (oSyms.some((sy) => syms.has(sy))) cancelIds.push(o.id);
  }
  const items = group.items.slice(0, 4);
  /* THE LEGS, READ OFF THE BROKER'S OWN SYMBOLS. Nothing here is invented and
     no contract is named that the account does not already own — `buildOcc()`
     is not involved and must never be. */
  const legs = items.map((x) => holdingLeg(x));
  if (legs.some((l) => !l)) {
    return refuse(`The close was not sent: one of these contracts is held under a symbol this app cannot read, ` +
      `so there is no strike to price it at. Close it from the broker's own screen.`);
  }
  if (!group.ticker || !group.expKey) {
    return refuse(`The close was not sent: this holding's market and expiry could not be read from its symbols, ` +
      `so there is no chain to price it from. Close it from the broker's own screen.`);
  }
  // THE PRICE, WORKED OUT NOW, FROM A CHAIN FETCHED NOW — the same shape
  // `approve.mjs` uses at tap time. The positions payload carries no quote.
  let chain = null;
  try { chain = typeof fetchChain === "function" ? await fetchChain(group.ticker) : null; } catch { chain = null; }
  const exp = chain?.byExp?.[group.expKey] || null;
  if (!exp) {
    return refuse(`The close was not sent: the option chain for ${group.ticker} ${group.expKey} could not be read just ` +
      `now, so there is no price to close at. Nothing has changed on the broker. A close is a limit order ` +
      `priced from the live market — it is never sent at whatever the other side happens to be asking.`);
  }
  const quotes = legs.map((l) => {
    const side = l.type === "put" ? exp.puts : exp.calls;
    const q2 = side?.[l.strike] ?? side?.[String(l.strike)] ?? null;
    return q2 ? { bid: q2.bid, ask: q2.ask } : {};
  });
  const market = closeMarket(legs, quotes);
  if (!market.ok) return refuse(`The close was not sent. ${closeUnreadableNote(market.missing, legs)}`);
  const priced = closeLimitPrice({ netMid: market.netMid, spread: market.spread });
  if (!priced) return refuse(`The close was not sent: ${closeLimitNote(null)}`);
  // `priced.net` is SIGNED and must stay signed: `mlegLimitPrice()` flips it
  // for the close intent, so a debit structure is sold for a credit. The same
  // GCD rule that shaped the opening order shapes the close.
  const body = orderBody({
    legs: legs.map((l) => ({ side: l.side, qty: l.qty })),
    occs: items.map((x) => x.symbol),
    userQty: 1, type: "limit", limit: priced.net, tif: "day", intent: "close",
  });
  const lb = limitAgainstBook({
    limitPrice: body.limit_price ?? null, book: comboBook(legs, quotes),
    intent: "close", legCount: legs.length,
  });
  if (lb.checked && !lb.ok) return refuse(`The close was not sent: ${lb.sentence}`);
  const words = limitWords(body.limit_price) || "a price the app could not read";
  const lines = orderPreviewLines({ legs, ticker: group.ticker, expKey: group.expKey, qty: 1,
    type: "limit", limit: priced.net, tif: "day", intent: "close" });
  if (cancelIds.length) {
    lines.push(`First cancels ${cancelIds.length} working order${cancelIds.length === 1 ? "" : "s"} on the same contracts.`);
  }
  return { ok: true, refusal: null, body, limitWords: words, lines, cancelIds, proposal, group, sent: false };
}

/**
 * TAP 2. Sends what tap 1 wrote out, and nothing else.
 *
 * @param prepared  what `prepareClose()` returned; sending it twice is refused
 * @param request   (path, method, body) => the broker's reply (pro.jsx `alpacaReq`)
 * @param gate      the risk gate, re-run at the send
 * @returns { ok, refusal, order, headline, limitWords }
 */
export async function sendClose(prepared, { request, gate, demo = DEMO, working = false } = {}) {
  if (demo) return { ok: false, refusal: DEMO_TOOLTIP };
  if (!prepared || !prepared.ok || !prepared.body) {
    return { ok: false, refusal: prepared?.refusal || "The close was not sent: there is no prepared order to send." };
  }
  if (prepared.sent || working) {
    return { ok: false, refusal: `A close order for this position is already working at the broker. ` +
      `A second one is not sent.` };
  }
  const g = typeof gate === "function" ? gate(prepared.proposal) : { pass: false, violations: [{ message: "The risk gate is not wired in." }] };
  if (!g.pass) return { ok: false, refusal: `Risk gate: the close was not sent. ${g.violations.map((v) => v.message).join(" ")}` };
  if (typeof request !== "function") return { ok: false, refusal: "The close was not sent: no broker connection." };
  prepared.sent = true;
  // THE WASH-TRADE CHECK: working orders on the same contracts go first.
  for (const id of prepared.cancelIds || []) {
    try { await request(`/v2/orders/${id}`, "DELETE"); } catch { /* already gone */ }
  }
  try {
    const order = await request("/v2/orders", "POST", prepared.body);
    return { ok: true, refusal: null, order, limitWords: prepared.limitWords,
      headline: `Closing ${prepared.group?.key || "the position"} — sent as a single order at ${prepared.limitWords}. ` +
        `${orderOutcome(order).headline}` };
  } catch (e) {
    prepared.sent = false;
    return { ok: false, refusal: `The close was not sent: ${alpacaErrorText(e)}` };
  }
}
