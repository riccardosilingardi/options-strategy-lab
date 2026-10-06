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
// Redesign PR 3, TASK 4 (the owner's board "Orders"): the row is the board's — the intent tag, the structure's name and
// the ref; its terms with the sent time and the book on two mono lines; Modify | Cancel | Details; Modify inline with two
// steppers, the range, Day | Good till cancelled, Review then Send to Alpaca; the cancel confirm inline; the market's
// clock and Cancel all once, at the top. The look only: every send below is the one it was.
//
// IT DECIDES NOTHING ABOUT AN ORDER. What a row says is `orderRowModel()`; what Modify sends is `modifyPlan()` /
// `sendModify()` (order path 7, or cancel → canceled → path 3 / path 2); the close's price is `prepareClose()`.
// ============================================================================
import React, { useMemo, useState } from "react";
import { T, TYPE } from "./theme.js";
import { Btn, Chip, Note, NumberInput, RangeField, Info, mono, sans, TAP } from "./ui.jsx";
import { orderRowModel, orderHoldingKey, clampLimit, heldToLimit, rowLines, orderRowName, modifyBoundsLine, modifyRangeText, cancelQuestion } from "./orderRow.js";
import { localStamp, marketClockLine } from "./clock.js";
import { modifyPlan, sendModify, cancelAll } from "./modifyOrder.js";
import { prepareClose, sendClose, groupForRecord } from "./closeOrder.js";
import { cancelOutcome, cancelWaiting } from "./order.js";
import { closeLimitPrice, openLimitPrice } from "./rules.js";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";
import { positionTitle } from "./positionView.js";
import { PREVIEW, PREVIEW_READ_ONLY } from "./deploy.js";

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
  // A DEPLOY PREVIEW IS READ-ONLY (redesign PR 2, TASK 0a): Modify and Cancel are disabled with the reason.
  const readOnly = ctx.readOnly ?? PREVIEW;
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

  const name = orderRowName(rec, L, rec && Array.isArray(rec.legs) ? positionTitle(rec) : null);
  const on = (m) => mode === m;
  const lockTitle = demo ? DEMO_TOOLTIP : readOnly ? PREVIEW_READ_ONLY : undefined;
  const heldMax = model.intent === "close" && heldQty ? heldQty : 20;
  const stepLimit = (dir) => {
    if (edit.limit == null || !model.bounds) return;
    const sign = edit.limit < 0 || model.bounds.lo < 0 ? -1 : 1;
    const next = clampLimit(sign * +(Math.abs(edit.limit) + dir * 0.01).toFixed(2), model.bounds);
    if (next != null) { setPlan(null); setEdit({ ...edit, limit: next }); }
  };
  const atEdge = (dir) => edit && edit.limit != null && model.bounds
    && clampLimit((edit.limit < 0 || model.bounds.lo < 0 ? -1 : 1) * +(Math.abs(edit.limit) + dir * 0.01).toFixed(2), model.bounds) === edit.limit;

  return (
    <li data-order-row={order.id} id={`order-${order.id}`} tabIndex={focused ? -1 : undefined}
      style={{ listStyle: "none", background: T.panel, border: `${focused ? 2 : 1}px solid ${focused ? T.blue : T.line}`, borderRadius: 12,
        padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6, marginTop: inline ? 8 : 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span data-order-tag style={{ ...sans, flex: "none", fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.04em", lineHeight: "20px",
            padding: "0 6px", borderRadius: 6, border: `1px solid ${T.field}`, color: T.ink }}>{model.intent === "close" ? "CLOSE" : "OPEN"}</span>
          <span data-order-name style={{ ...sans, fontSize: FS.md, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink }}>{name}</span>
        </span>
        {rec?.ref && <span data-order-ref style={{ ...mono, flex: "none", fontSize: FS.xs, color: T.mut }}>{rec.ref}</span>}
      </div>
      {outside && (
        <div style={{ ...sans, fontSize: FS.xs, color: T.mut }}>
          sent outside this app{ctx.gap ? <Info label="an order sent outside this app">{ctx.gap}</Info> : null}
        </div>
      )}
      <p data-order-terms style={{ ...mono, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>{L.terms}{L.sent ? ` · sent ${L.sent}` : ""}</p>
      <p data-order-book style={{ ...mono, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color: model.pastMark ? T.amber : T.mut }}>
        {L.book}{model.pastMark ? <> ⚠<Info label="the limit against Alpaca's mark">{model.pastMark}</Info></> : null}
      </p>

      {waiting ? (
        <Note color={T.amber}>{cancelOutcome({ order: { status: order.status, cancelRequested: cancelAsked || rec?.cancelRequestedAt } })?.headline}</Note>
      ) : !mode || mode === "details" ? (
        <div data-order-actions style={{ display: "flex", gap: 6, paddingTop: 6 }}>
          <RowBtn on={false} disabled={demo || readOnly || busy} title={lockTitle} aria-expanded={false} onClick={openModify}>Modify</RowBtn>
          {/* CANCEL IS NOT AN ERROR (PR #47, TASK 3): the danger OUTLINE, never a red fill. */}
          <RowBtn danger disabled={demo || readOnly || busy} title={lockTitle} aria-expanded={false}
            onClick={() => { setSaid(null); setMode("cancel"); }}>Cancel</RowBtn>
          <RowBtn on={on("details")} aria-expanded={on("details")} onClick={() => setMode(on("details") ? null : "details")}>Details</RowBtn>
        </div>
      ) : null}
      {!waiting && readOnly && <Note color={T.amber}>{PREVIEW_READ_ONLY}</Note>}

      {mode === "modify" && edit && (
        <div data-modify={order.id} style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
          {!model.book.ok && (
            <Note color={T.amber}>{busy ? "Reading the chain…" : "Chain not loaded."}{" "}
              {!busy && <Btn small ghost onClick={loadChain}>Read it now</Btn>}</Note>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
            <Stepper label={mleg ? (edit.limit != null && edit.limit < 0 ? "Limit credit" : "Limit debit") : "Limit price"}
              info={model.bounds ? modifyBoundsLine(model.bounds, model.intent === "close" ? heldQty : null) : null}
              value={edit.limit == null ? "—" : Math.abs(edit.limit).toFixed(2)} downLabel="Lower by 0.01" upLabel="Raise by 0.01"
              downOff={edit.limit == null || atEdge(-1)} upOff={edit.limit == null || atEdge(1)} onDown={() => stepLimit(-1)} onUp={() => stepLimit(1)} />
            <Stepper label="Quantity" value={edit.qty} downLabel="One fewer" upLabel="One more"
              downOff={!(Number(edit.qty) > 1)} upOff={!(Number(edit.qty) < heldMax)}
              onDown={() => { setPlan(null); setEdit({ ...edit, qty: Math.max(1, Number(edit.qty) - 1) }); }}
              onUp={() => { setPlan(null); setEdit({ ...edit, qty: Math.min(heldMax, Number(edit.qty) + 1) }); }} />
          </div>
          {/* THE RANGE AT REST, ITS SENTENCE BEHIND THE PRICE'S ⓘ: the J-0001 Modify budget is ≤ 40 words (voice.test.js). */}
          {model.bounds && <p data-modify-bounds style={{ ...mono, margin: 0, fontSize: FS.xs, color: T.mut }}>{modifyRangeText(model.bounds)}</p>}
          <div role="group" aria-label="Time in force" style={{ display: "flex", gap: 2, padding: 3, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10 }}>
            {[["day", "Day"], ["gtc", "Good till cancelled"]].map(([id, w]) => (
              <button key={id} type="button" aria-pressed={edit.tif === id} onClick={() => { setPlan(null); setEdit({ ...edit, tif: id }); }}
                style={{ ...sans, flex: 1, minHeight: TAP, border: "none", borderRadius: 8, cursor: "pointer", fontSize: FS.sm,
                  fontWeight: edit.tif === id ? FW.bold : FW.regular, background: edit.tif === id ? T.ink : "transparent", color: edit.tif === id ? T.bg : T.mut }}>{w}</button>
            ))}
          </div>
          {plan && !plan.ok && <Note color={T.red}>✗ {plan.refusal}</Note>}
          {plan && plan.ok && (
            <div data-modify-plan style={{ padding: "10px 12px", border: `1px solid ${T.line}`, borderRadius: 10, background: T.bg, display: "grid", gap: 4 }}>
              {plan.lines.map((l, i) => <p key={i} style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>{l}</p>)}
              {marketClockLine(ctx.clock, { queued: true }) && <Note>{marketClockLine(ctx.clock, { queued: true })}</Note>}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <PanelBtn disabled={busy} onClick={() => { setMode(null); setPlan(null); }}>Back</PanelBtn>
            {plan && plan.ok
              ? <PanelBtn act disabled={busy} onClick={send}>{busy ? "Sending…" : "Send to Alpaca"}</PanelBtn>
              : <PanelBtn act disabled={edit.limit == null} onClick={review}>Review</PanelBtn>}
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div data-cancel-confirm style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 10, borderTop: `1px solid ${T.line}` }}>
          <p style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>{cancelQuestion(model.intent)}</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <PanelBtn disabled={busy} onClick={() => setMode(null)}>Keep it</PanelBtn>
            <PanelBtn danger disabled={busy} onClick={doCancel}>{busy ? "Asking…" : "Cancel order"}</PanelBtn>
          </div>
        </div>
      )}

      {mode === "details" && (
        <div data-order-details style={{ display: "flex", flexDirection: "column", gap: 4, paddingTop: 10, borderTop: `1px solid ${T.line}`, ...sans,
          fontSize: FS.xs, lineHeight: LH.body }}>
          <span style={{ fontWeight: FW.bold, color: T.mut, letterSpacing: "0.08em" }}>ALPACA STATUS HISTORY</span>
          {model.history.map((h, i) => (
            <span key={i} style={{ ...mono, display: "flex", justifyContent: "space-between", gap: 8, color: T.ink }}>
              <span>{h.label}</span><span style={{ color: T.mut, flex: "none" }}>{h.t ? localStamp(h.t) : ""}</span>
            </span>
          ))}
          {/* THE ORDER ID GOES LAST (PR #47): it is what you quote to Alpaca, not what you read first. */}
          <span style={{ ...mono, color: T.mut, wordBreak: "break-all" }}>id {order.id}</span>
        </div>
      )}

      {said && <Note color={said.ok ? T.green : T.red}>{said.ok ? "✓" : "✗"} {said.text}</Note>}
    </li>
  );
}

/** The row's three buttons (the board's `rowbtn`): a field outline in ink, ink when its panel is open; Cancel the red outline. */
function RowBtn({ on = false, danger = false, children, ...rest }) {
  return (
    <button type="button" {...rest}
      style={{ ...sans, flex: 1, minHeight: TAP, borderRadius: 10, fontSize: FS.sm, fontWeight: FW.bold, cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1, background: on ? T.ink : "transparent", color: on ? T.bg : danger ? T.red : T.ink,
        border: `1px solid ${on ? T.ink : danger ? T.red : T.field}` }}>{children}</button>
  );
}

/** The panels' two buttons: Back / Keep it (a field outline), Review / Send to Alpaca (the action fill), Cancel order (red outline). */
function PanelBtn({ act = false, danger = false, children, ...rest }) {
  return (
    <button type="button" {...rest}
      style={{ ...sans, minHeight: TAP, borderRadius: 10, padding: "0 14px", fontSize: FS.sm, fontWeight: FW.bold, cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1, background: act ? T.action : "transparent", color: act ? T.onAccent : danger ? T.red : T.ink,
        border: act ? "none" : `1px solid ${danger ? T.red : T.field}` }}>{children}</button>
  );
}

/** − value + (the board's steppers): 44px steps, the value in mono. */
function Stepper({ label, info = null, value, downLabel, upLabel, downOff, upOff, onDown, onUp }) {
  const step = (off) => ({ width: TAP, height: TAP, border: "none", background: "transparent", color: off ? T.line : T.ink, borderRadius: 8,
    display: "flex", alignItems: "center", justifyContent: "center", ...sans, fontSize: FS.lg, cursor: off ? "default" : "pointer" });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ ...sans, fontSize: FS.xs, color: T.mut }}>{info ? <Info label={label.toLowerCase()} style={{ marginLeft: -4 }}>{info}</Info> : label}</span>
      <div role="group" aria-label={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${T.field}`, borderRadius: 10 }}>
        <button type="button" aria-label={downLabel} disabled={downOff} onClick={onDown} style={step(downOff)}>−</button>
        <output style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink }}>{value}</output>
        <button type="button" aria-label={upLabel} disabled={upOff} onClick={onUp} style={step(upOff)}>+</button>
      </div>
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
  const readOnly = ctx.readOnly ?? PREVIEW;
  const doAll = async () => {
    setBusy(true);
    const r = await cancelAll({ request: ctx.request, demo });
    setBusy(false); setConfirmAll(false); setAllSaid(r);
    if (ctx.onChanged) ctx.onChanged();
  };
  if (n == null) return <Note>Orders not read from Alpaca yet.</Note>;
  const clockLine = marketClockLine(ctx.clock);
  return (
    <div data-orders-segment>
      {/* THE BOARD'S HEAD LINE: the market's clock once for every row, and Cancel all (red text; it asks first). */}
      <div data-orders-head style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "0 0 6px", ...sans,
        fontSize: FS.xs, color: T.mut }}>
        <span>{clockLine || (n === 0 ? "No orders working at Alpaca." : "")}</span>
        {n > 0 && !confirmAll && (
          <button type="button" disabled={demo || readOnly} title={demo ? DEMO_TOOLTIP : readOnly ? PREVIEW_READ_ONLY : undefined}
            onClick={() => setConfirmAll(true)} style={{ ...sans, minHeight: TAP, border: "none", background: "transparent", color: T.red,
              fontSize: FS.sm, fontWeight: FW.bold, padding: "0 4px", cursor: demo || readOnly ? "not-allowed" : "pointer", opacity: demo || readOnly ? 0.5 : 1 }}>Cancel all</button>
        )}
      </div>
      {n > 0 && readOnly && <Note color={T.amber} style={{ marginBottom: 6 }}>{PREVIEW_READ_ONLY}</Note>}
      {n === 0 && clockLine && <Note>No orders working at Alpaca.</Note>}
      {confirmAll && (
        <div data-cancel-all style={{ marginBottom: 10, padding: "10px 12px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12,
          display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>Cancel all {n} working order{n === 1 ? "" : "s"}? Positions you hold stay open; only the orders are cancelled.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            <PanelBtn disabled={busy} onClick={() => setConfirmAll(false)}>Keep them</PanelBtn>
            <PanelBtn danger disabled={busy} onClick={doAll}>{busy ? "Asking…" : "Yes, cancel all"}</PanelBtn>
          </div>
        </div>
      )}
      {allSaid && <Note color={allSaid.ok ? T.green : T.red} style={{ marginBottom: 6 }}>{allSaid.headline}</Note>}
      <ul data-order-list style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.map((o) => <OrderRow key={o.id} order={o} ctx={ctx} />)}
      </ul>
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
