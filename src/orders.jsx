// ============================================================================
// src/orders.jsx — THE ORDERS SEGMENT OF POSITIONS (PR #47, TASK 1; built as one list in PR #46, TASK 0).
//
// PR #47: the same order no longer prints twice. The list at the top of Positions and the row inline on the card
// are gone; Positions | Orders are two segments, and this is the Orders one. A card whose close is working shows one
// line and "Manage order", which opens that row here. A row at rest is three short lines (≤ 35 words, measured by
// `scripts/surfaces.mjs` and held by voice.test.js); the sentences that left it are behind a ⓘ or in History.
//
// Orders used to be listed in three places: the Alpaca panel's "ORDERS WAITING", the Positions panel
// "WORKING AT THE BROKER" and a disabled "Close order working" button on the position card. None could change
// an order. This is the one list: one row per order READ FROM ALPACA, and the same row inline on the card whose
// close is working. Build and the desk show counts only (`DeskCountLine`).
//
// A row: what it is in words, limit · TIF · filled X of Y · sent time, the structure's bid / mid / ask from the
// chain, Alpaca's mark, and one line when the limit is past the mark on the side that does not fill. Actions:
// Modify (price between the side that fills and the mid, quantity, DAY/GTC; Review, then Send), Cancel (confirm,
// then the DELETE and `cancelOutcome()`), Details (Alpaca's status history). "Cancel all" with a confirm.
//
// IT DECIDES NOTHING ABOUT AN ORDER. What a row says is `orderRowModel()`; what Modify sends is `modifyPlan()` /
// `sendModify()` (order path 7, or cancel → canceled → path 3 / path 2); the close's price is `prepareClose()`.
// ============================================================================
import React, { useMemo, useState } from "react";
import { T, TYPE } from "./theme.js";
import { Btn, Chip, Panel, Label, Note, NumberInput, RangeField, Info, mono, sans } from "./ui.jsx";
import { orderRowModel, orderHoldingKey, clampLimit, heldToLimit, rowLines } from "./orderRow.js";
import { localStamp, marketClockLine } from "./clock.js";
import { modifyPlan, sendModify, cancelAll } from "./modifyOrder.js";
import { prepareClose, sendClose, groupForRecord } from "./closeOrder.js";
import { cancelOutcome, cancelWaiting } from "./order.js";
import { closeLimitPrice, openLimitPrice } from "./rules.js";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const usd = (x) => (x == null || !Number.isFinite(+x) ? "—" : `$${Math.abs(+x).toFixed(2)}`);

/** A price in the order's own space, in words: an mleg price below zero is a credit. */
const priceWords = (v, mleg) => (v == null ? "—" : `${usd(v)}${mleg ? (v < 0 ? " credit" : " debit") : ""}`);

/** When an order was sent, in the reader's own clock. */
export function sentWords(iso, now = Date.now()) {
  const t = Date.parse(iso || "");
  if (!Number.isFinite(t)) return "sent time not reported";
  const mins = Math.max(0, Math.round((now - t) / 60000));
  const ago = mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} h ago` : `${Math.round(mins / 1440)} d ago`;
  return `sent ${new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} (${ago})`;
}

/**
 * THE PRICE FIELD — one RangeField between the side that fills and the mid. The close confirm and Modify use
 * this one control. `bounds` is `limitBounds()`; values are in the order's own price space.
 */
export function PriceField({ bounds, value, onChange, mleg = false, label = "Price" }) {
  if (!bounds) return <Note color={T.amber}>No range to choose from: the chain for this expiry is not loaded.</Note>;
  return (
    <RangeField label={label} value={value} onChange={(v) => onChange(clampLimit(v, bounds))}
      min={bounds.lo} max={bounds.hi} step={0.01}
      format={(v) => priceWords(v, mleg)} toInput={(v) => Math.abs(v).toFixed(2)}
      parse={(t) => { const n = Number(String(t).replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? (bounds.lo < 0 ? -n : n) : null; }}
      valueText={(v) => priceWords(v, mleg)}
      minCaption="" maxCaption=""
      aside={<Info label="this price">Between {usd(bounds.fill)}, the side that fills now, and {usd(bounds.mid)}, the middle of the market.</Info>} />
  );
}

/** The two TIF chips. */
const TifField = ({ value, onChange }) => (
  <div role="group" aria-label="Time in force" style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
    <Chip on={value === "day"} onClick={() => onChange("day")} label="Today only">Today</Chip>
    <Chip on={value === "gtc"} onClick={() => onChange("gtc")} label="Good till cancelled">GTC</Chip>
  </div>
);

/** The default price a Modify starts at: `closeLimitPrice()` for a close, `openLimitPrice()` for an open. */
export function defaultModifyPrice(order, model) {
  const b = model?.book;
  if (!b || !b.ok) return null;
  const priced = model.intent === "close"
    ? closeLimitPrice({ netMid: b.mid, spread: b.spread })
    : openLimitPrice({ netMid: b.mid, spread: b.spread });
  return priced ? clampLimit(heldToLimit(order, priced.net), model.bounds) : null;
}

/**
 * ONE ROW, LIVE. Owns its own open/closed state; every send goes through the handlers it is given.
 *
 * @param ctx  { positions, orders, chainFor, fetchChain, gate, request, onChanged, onReplaced, onCloseSent,
 *               onOpenBuild, cancelOne, recordFor, demo }
 */
export function OrderRow({ order, ctx, inline = false, initialMode = null }) {
  const [chainLocal, setChainLocal] = useState(null);
  const key = orderHoldingKey(order);
  const chain = chainLocal || (key && ctx.chainFor ? ctx.chainFor(key.ticker) : null);
  const model = useMemo(() => orderRowModel(order, { chain, positions: ctx.positions || [] }), [order, chain, ctx.positions]);
  // `initialMode` opens a panel on first render: the word counter measures Modify open (scripts/surfaces.jsx).
  const [mode, setMode] = useState(initialMode);          // null | "modify" | "cancel" | "details"
  const [edit, setEdit] = useState(() => (initialMode === "modify"
    ? { limit: defaultModifyPrice(order, model), qty: Number(order.qty) || 1, tif: model.tif === "gtc" ? "gtc" : "day" } : null));
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState(null);                 // { ok, text }
  const [cancelAsked, setCancelAsked] = useState(null);
  const demo = ctx.demo ?? DEMO;
  const rec = ctx.recordFor ? ctx.recordFor(order) : null;
  const mleg = !model.single;
  const heldQty = model.intent === "close" && key
    ? Math.min(...key.symbols.map((s) => Math.abs(Number((ctx.positions || []).find((p) => p.symbol === s)?.qty) || 0)))
      / Math.max(1, ...(model.legs || []).map((l) => l.ratio)) || null
    : null;

  const loadChain = async () => {
    if (!key || typeof ctx.fetchChain !== "function") return;
    setBusy(true);
    try { setChainLocal(await ctx.fetchChain(key.ticker)); } catch { setSaid({ ok: false, text: "The chain could not be read just now." }); }
    setBusy(false);
  };
  const openModify = () => {
    setSaid(null); setPlan(null); setMode("modify");
    setEdit({ limit: defaultModifyPrice(order, model), qty: Number(order.qty) || 1, tif: model.tif === "gtc" ? "gtc" : "day" });
    if (!model.book.ok) loadChain();
  };
  const review = () => setPlan(modifyPlan(order, { ...edit, bounds: model.bounds, heldQty }));
  const send = async () => {
    if (!plan || !plan.ok) return;
    setBusy(true);
    const sendNew = model.intent === "close"
      ? async () => {
          const g = groupForRecord({ ticker: key.ticker, expKey: key.expKey }, ctx.positions || []);
          const p = await prepareClose(g, { gate: ctx.gate, openOrders: (ctx.orders || []).filter((o) => o.id !== order.id),
            fetchChain: ctx.fetchChain, working: false, choice: { limit: plan.limit, qty: plan.qty, tif: plan.tif } });
          if (!p.ok) return p;
          const r = await sendClose(p, { request: ctx.request, gate: ctx.gate });
          if (r.ok && ctx.onCloseSent) ctx.onCloseSent(key, r);
          return r;
        }
      : async () => {
          // An opening multi-leg order goes back to Build's ticket — order path 2 — at today's market.
          if (ctx.onOpenBuild) ctx.onOpenBuild(order, plan, rec);
          return { ok: true, headline: `The trade is on Build at ${plan.qty} combination${plan.qty === 1 ? "" : "s"}. ` +
            `Set ${priceWords(plan.limit, true)} on the ticket and send it there, with its two taps.` };
        };
    const r = await sendModify(order, plan, { request: ctx.request, gate: ctx.gate, book: model.book, sendNew, demo });
    setBusy(false);
    setSaid({ ok: r.ok, text: r.ok ? r.headline : r.refusal });
    if (r.ok) {
      setMode(null); setPlan(null);
      if (r.mode === "replace" && ctx.onReplaced) ctx.onReplaced(order, r.order, plan);
    }
    if (ctx.onChanged) ctx.onChanged();
  };
  const doCancel = async () => {
    setBusy(true);
    let res;
    if (ctx.cancelOne) res = await ctx.cancelOne(order, rec);
    else {
      try { await ctx.request(`/v2/orders/${encodeURIComponent(order.id)}`, "DELETE"); res = cancelOutcome({ ok: true }); }
      catch (e) { res = cancelOutcome({ error: e }); }
    }
    setBusy(false);
    if (res?.waiting) setCancelAsked(Date.now());
    setSaid({ ok: res?.kind !== "failed", text: res?.headline || "" });
    setMode(null);
    if (ctx.onChanged) ctx.onChanged();
  };
  const waiting = cancelWaiting({ status: order.status, cancelRequested: cancelAsked || rec?.cancelRequestedAt });

  const L = rowLines(order, model);
  const outside = ctx.recordFor ? !rec : false;
  // The row's order is already at Alpaca: the line says when the market opens. Modify sends, so its panel says queued.
  const clockLine = marketClockLine(ctx.clock);
  const focused = ctx.focusId === order.id;

  return (
    <div data-order-row={order.id} id={`order-${order.id}`} tabIndex={focused ? -1 : undefined}
      style={{ padding: "10px 12px", background: T.bg, border: `${focused ? 2 : 1}px solid ${focused ? T.blue : T.line}`, borderRadius: 8, marginTop: inline ? 8 : 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
        <div style={{ ...sans, fontSize: FS.sm, fontWeight: FW.bold, color: T.ink }}>
          {rec?.ref ? <span style={mono}>{rec.ref} · </span> : null}<span style={mono}>{L.title}</span>
        </div>
        <div style={{ ...mono, fontSize: FS.xs, fontWeight: FW.bold, color: T.dim }}>{(model.status || "working").replace(/_/g, " ")}</div>
      </div>
      {outside && (
        <div style={{ ...sans, fontSize: FS.xs, color: T.mut, marginTop: 2 }}>
          sent outside this app{ctx.gap ? <Info label="an order sent outside this app">{ctx.gap}</Info> : null}
        </div>
      )}
      <div style={{ ...mono, fontSize: FS.xs, color: T.body, marginTop: 4, lineHeight: LH.body }}>{L.terms}</div>
      <div style={{ ...mono, fontSize: FS.xs, color: model.pastMark ? T.amber : T.mut, lineHeight: LH.body }}>
        {L.book}{model.pastMark ? <> ⚠<Info label="the limit against Alpaca's mark">{model.pastMark}</Info></> : null}
      </div>
      {clockLine && <Note style={{ marginTop: 2 }}>{clockLine}</Note>}

      {waiting ? (
        <Note color={T.amber} style={{ marginTop: 8 }}>{cancelOutcome({ order: { status: order.status, cancelRequested: cancelAsked || rec?.cancelRequestedAt } })?.headline}</Note>
      ) : (
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          <Btn small ghost color={T.ink} disabled={demo || busy} title={demo ? DEMO_TOOLTIP : undefined}
            aria-expanded={mode === "modify"} onClick={() => (mode === "modify" ? setMode(null) : openModify())}>Modify</Btn>
          {/* CANCEL IS NOT AN ERROR (PR #47, TASK 3): the danger OUTLINE, never a red fill. */}
          <Btn small ghost color={T.red} disabled={demo || busy} title={demo ? DEMO_TOOLTIP : undefined}
            aria-expanded={mode === "cancel"} onClick={() => { setSaid(null); setMode(mode === "cancel" ? null : "cancel"); }}>Cancel</Btn>
          <Btn small ghost color={T.ink} aria-expanded={mode === "details"}
            onClick={() => setMode(mode === "details" ? null : "details")}>History</Btn>
        </div>
      )}

      {mode === "modify" && edit && (
        <div data-modify={order.id} style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {!model.book.ok && (
            <Note color={T.amber}>{busy ? "Reading the chain…" : "Chain not loaded."}{" "}
              {!busy && <Btn small ghost onClick={loadChain}>Read it now</Btn>}</Note>
          )}
          <PriceField bounds={model.bounds} value={edit.limit} mleg={mleg} onChange={(v) => { setPlan(null); setEdit({ ...edit, limit: v }); }} />
          <label style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.dim, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            Qty
            <NumberInput min={1} max={model.intent === "close" && heldQty ? heldQty : 20} step={1} value={edit.qty}
              aria-label={`Quantity${model.intent === "close" && heldQty ? `, you hold ${heldQty}` : ""}`}
              onChange={(e) => { setPlan(null); setEdit({ ...edit, qty: e.target.value === "" ? "" : Math.round(Number(e.target.value)) }); }}
              style={{ width: 90 }} />
          </label>
          <TifField value={edit.tif} onChange={(t) => { setPlan(null); setEdit({ ...edit, tif: t }); }} />
          {!plan && <div><Btn small onClick={review} disabled={edit.limit == null}>Review</Btn></div>}
          {plan && !plan.ok && <Note color={T.red}>✗ {plan.refusal}</Note>}
          {plan && plan.ok && (
            <div style={{ padding: "9px 11px", border: `1px solid ${T.field}`, borderRadius: 8 }}>
              <Label color={T.ink}>THIS IS THE CHANGE THAT WILL BE SENT</Label>
              {plan.lines.map((l, i) => <Note key={i} color={T.ink} style={{ marginTop: 4 }}>{l}</Note>)}
              {marketClockLine(ctx.clock, { queued: true }) && <Note style={{ marginTop: 4 }}>{marketClockLine(ctx.clock, { queued: true })}</Note>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <Btn small color={T.action} disabled={busy} onClick={send}>{busy ? "Sending…" : "Send"}</Btn>
                <Btn small ghost color={T.ink} disabled={busy} onClick={() => setPlan(null)}>Change it</Btn>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "cancel" && (
        <div style={{ marginTop: 10, padding: "9px 11px", border: `1px solid ${T.field}`, borderRadius: 8 }}>
          <Note color={T.ink}>Cancel this order? Alpaca takes the request; it is cancelled only when Alpaca reports it so.</Note>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Btn small ghost color={T.red} disabled={busy} onClick={doCancel}>{busy ? "Asking…" : "Yes, cancel it"}</Btn>
            <Btn small ghost color={T.ink} disabled={busy} onClick={() => setMode(null)}>Keep it</Btn>
          </div>
        </div>
      )}

      {mode === "details" && (
        <div style={{ marginTop: 10 }}>
          <Label color={T.dim}>ALPACA'S STATUS HISTORY · YOUR TIME</Label>
          {model.history.map((h, i) => (
            <div key={i} style={{ ...mono, fontSize: FS.xs, color: T.body, marginTop: 3, lineHeight: LH.body, wordBreak: "break-word" }}>
              {h.t ? `${localStamp(h.t)} · ` : ""}{h.label}
            </div>
          ))}
          {/* THE ORDER ID GOES LAST (PR #47): it is what you quote to Alpaca, not what you read first. */}
          <div style={{ ...mono, fontSize: FS.xs, color: T.dim, marginTop: 3, wordBreak: "break-all" }}>order {order.id}</div>
        </div>
      )}

      {said && <Note color={said.ok ? T.green : T.red} style={{ marginTop: 8 }}>{said.ok ? "✓" : "✗"} {said.text}</Note>}
    </div>
  );
}

/**
 * THE ORDERS SEGMENT. `orders` is Alpaca's open orders (null until asked: an unasked broker is not an empty one).
 * One row per order; an order with no record carries "sent outside this app" (`recordForOrder()` decides, PR #47
 * 0a), and `ctx.gap` — `orderReconciliation()`'s sentence — is behind that tag's ⓘ. "Cancel all" sits at the
 * bottom, with its confirm.
 */
export function OrdersPanel({ orders, ctx }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const [allSaid, setAllSaid] = useState(null);
  const [busy, setBusy] = useState(false);
  const n = orders ? orders.length : null;
  const demo = ctx.demo ?? DEMO;
  const doAll = async () => {
    setBusy(true);
    const r = await cancelAll({ request: ctx.request, demo });
    setBusy(false); setConfirmAll(false); setAllSaid(r);
    if (ctx.onChanged) ctx.onChanged();
  };
  if (n == null) return <Note>Orders not read from Alpaca yet.</Note>;
  return (
    <div data-orders-segment>
      {n === 0 && <Note>No orders working at Alpaca.</Note>}
      <div style={{ display: "grid", gap: 8 }}>
        {orders.map((o) => <OrderRow key={o.id} order={o} ctx={ctx} />)}
      </div>
      {n > 0 && !confirmAll && (
        <div style={{ marginTop: 12 }}>
          <Btn small ghost color={T.red} disabled={demo} title={demo ? DEMO_TOOLTIP : undefined} onClick={() => setConfirmAll(true)}>Cancel all</Btn>
        </div>
      )}
      {confirmAll && (
        <div style={{ marginTop: 12, padding: "9px 11px", border: `1px solid ${T.field}`, borderRadius: 8 }}>
          <Note color={T.ink}>Cancel all {n} working order{n === 1 ? "" : "s"}? Positions you hold stay open; only the orders are cancelled.</Note>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <Btn small ghost color={T.red} disabled={busy} onClick={doAll}>{busy ? "Asking…" : "Yes, cancel all"}</Btn>
            <Btn small ghost color={T.ink} disabled={busy} onClick={() => setConfirmAll(false)}>Keep them</Btn>
          </div>
        </div>
      )}
      {allSaid && <Note color={allSaid.ok ? T.green : T.red} style={{ marginTop: 6 }}>{allSaid.headline}</Note>}
    </div>
  );
}

/**
 * THE CLOSE CONFIRM'S PRICE (PR #46). The same PriceField, quantity and TIF as Modify, on the prepared close.
 * `prep.prepared` carries `bounds`, `heldQty` and `defaultLimit` from `prepareClose()`. A change calls
 * `onChoose({ limit, qty, tif })`, which prepares the close again at that price: a close stays a limit priced
 * at the tap, and what is written out is what is sent.
 */
export function CloseChoice({ prepared, choice, onChoose }) {
  if (!prepared || !prepared.bounds) return null;
  const c = choice || { limit: prepared.defaultLimit, qty: prepared.heldQty, tif: "day" };
  const mleg = (prepared.body?.order_class || "") === "mleg";
  return (
    <div style={{ display: "grid", gap: 10, marginTop: 8 }}>
      <PriceField bounds={prepared.bounds} value={c.limit} mleg={mleg} label="Price"
        onChange={(v) => onChoose({ ...c, limit: v })} />
      <label style={{ ...sans, fontSize: FS.xs, fontWeight: FW.bold, color: T.dim, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <NumberInput min={1} max={prepared.heldQty} step={1} value={c.qty} aria-label={`Quantity, you hold ${prepared.heldQty}`}
          onChange={(e) => { const q = Math.round(Number(e.target.value)); if (q >= 1 && q <= prepared.heldQty) onChoose({ ...c, qty: q }); }}
          style={{ width: 90 }} />
      </label>
      <TifField value={c.tif} onChange={(t) => onChoose({ ...c, tif: t })} />
      {prepared.defaultLimit != null && c.limit !== prepared.defaultLimit && (
        <Note>App's price: <span style={mono}>{priceWords(prepared.defaultLimit, mleg)}</span></Note>
      )}
    </div>
  );
}
