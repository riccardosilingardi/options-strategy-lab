// ============================================================================
// src/positions.jsx — THE TOP OF POSITIONS: the account strip, the two segments, and the line a card shows while
// its close is working (PR #47, TASKS 1 and 2).
//
// The owner: "deve esserci Positions e Orders". Measured on his phone, 2 Oct 2026, 22:08: J-0001's close printed
// twice (the orders list at the top and the row inline on the card), the Alpaca panel listed both holdings a third
// time, and the false "not sent from this browser" sentence sat over all of it. Now: the account strip, then
// Positions | Orders, one refresh icon on the bar. A card whose close is working says so in one line and opens its
// row in Orders.
//
// Redesign PR 3 (the owner's board "Positions", 5 Oct 2026): the screen's own header (↻ and the gear; no desk header),
// the strip as three tiles with one ⓘ sentence under them, the segment as `SegmentBar`, and the card's buttons.
//
// IT DECIDES NOTHING. Equity and buying power are Alpaca's, read at each sync; AT RISK is the gate's own
// `limits.openRisk` of `limits.total` (`evaluateTrade()`); the clock line is `marketClockLine()`.
// ============================================================================
import React, { useState } from "react";
import { RefreshCw, Settings } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { IconButton, SegmentBar, mono, sans, TAP } from "./ui.jsx";
import { money, SETTINGS_WORD } from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const num = (x) => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

/**
 * WHICH BUYING POWER. alpaca-py's `TradeAccount` (alpaca/trading/models.py, 0.44.0) carries `buying_power` and,
 * on an account approved for options, `options_buying_power` — the figure Alpaca checks an options order against.
 * This app only trades options, so that one is shown when Alpaca sends it, and the label says which it is.
 * NOT OBSERVED LIVE on the owner's account (PRD §4): read from alpaca-py, not from a reply.
 */
export function buyingPowerOf(account) {
  if (!account) return { value: null, options: false };
  const o = num(account.options_buying_power);
  if (o != null) return { value: o, options: true };
  return { value: num(account.buying_power), options: false };
}

/** The board's header (redesign PR 3, "Positions"): the title, ↻ (read Alpaca again) and the gear. No desk header. */
export function PositionsHeader({ title = "Positions", onRefresh, busy = false, onSettings }) {
  return (
    <header data-positions-header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "12px 8px 4px 16px" }}>
      <h1 data-view-heading tabIndex={-1} style={{ ...sans, margin: 0, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
        outline: "none" }}>{title}</h1>
      <span style={{ display: "flex", gap: 2 }}>
        <IconButton label="Read Alpaca again" onClick={onRefresh} disabled={busy} aria-busy={busy || undefined}>
          <RefreshCw size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
        <IconButton label={SETTINGS_WORD} onClick={onSettings}>
          <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
        </IconButton>
      </span>
    </header>
  );
}

/**
 * THE ACCOUNT STRIP. `account` is `GET /v2/account` (null until read); `risk` is the gate's limits
 * ({ openRisk, total, sizingFree }); `capital` is the trading capital set in Settings.
 *
 * The ⓘ sentences, sourced (Alpaca, "Account" in the Trading API reference, and alpaca-py's `TradeAccount`):
 *   equity        — "cash + long_market_value + short_market_value": cash plus positions at Alpaca's prices.
 *   buying power  — what Alpaca allows you to spend on new orders now (options: `options_buying_power`).
 *
 * The board (redesign PR 3): three tiles in a panel; one ⓘ open at a time, its sentence under the tiles. The label is
 * BUYING POWER either way and its ⓘ says which figure it is.
 */
export function AccountStrip({ account = null, risk = null, capital = null }) {
  const [info, setInfo] = useState(null);
  const eq = account ? num(account.equity) : null;
  const bp = buyingPowerOf(account);
  const open = risk ? num(risk.openRisk) : null;
  const total = risk ? num(risk.total) : null;
  const limitsLine = `Your limits come from the capital you set in Settings (${capital != null ? money(capital) : "not set"}), not from equity.`;
  const INFO = {
    eq: <>Equity: cash plus your positions at Alpaca's own prices, as Alpaca reports it now. {limitsLine}</>,
    bp: <>Buying power: what Alpaca lets you spend on new trades now.{" "}
      {bp.options ? "This is Alpaca's options figure, the one it checks an options order against."
        : account ? "Alpaca sent no separate options figure, so this is its general buying power." : ""} {limitsLine}</>,
    risk: <>At risk: the most you can lose on everything you hold and every order still working, as the risk gate counts it
      {risk && risk.sizingFree ? ". No limit is applied: free sizing is on." : ", against your total limit."} {limitsLine}</>,
  };
  const cell = (id, k, v, of = null) => (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...sans, display: "flex", alignItems: "center", fontSize: FS.xs, color: T.dim, letterSpacing: "0.04em" }}>
        {k}
        <button type="button" onClick={() => setInfo((x) => (x === id ? null : id))} aria-label={`What ${k.toLowerCase()} is`}
          aria-expanded={info === id} style={{ ...sans, width: 28, height: 28, padding: 0, border: "none", background: "transparent",
            color: T.blue, fontSize: FS.sm, cursor: "pointer" }}>ⓘ</button>
      </div>
      <div style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, lineHeight: LH.tight }}>
        {v}{of != null && <span style={{ fontSize: FS.xs, fontWeight: FW.regular, color: T.mut }}> {of}</span>}
      </div>
    </div>
  );
  return (
    <section aria-label="Account" data-account-strip style={{ margin: "0 16px", padding: "10px 12px", background: T.panel,
      border: `1px solid ${T.line}`, borderRadius: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {cell("eq", "EQUITY", eq == null ? "—" : money(eq))}
        {cell("bp", "BUYING POWER", bp.value == null ? "—" : money(bp.value))}
        {cell("risk", "AT RISK", open == null ? "—" : money(open),
          open == null ? null : risk && risk.sizingFree ? "no limit" : `of ${total == null ? "—" : money(total)}`)}
      </div>
      {info && (
        <p role="note" style={{ ...sans, margin: "8px 0 0", paddingTop: 8, borderTop: `1px solid ${T.line}`, fontSize: FS.sm, lineHeight: LH.body,
          color: T.body }}>{INFO[info]}</p>
      )}
    </section>
  );
}

/** Positions | Orders, with the counts (the board's segment). The refresh moved to the header's ↻. */
export function PositionsBar({ seg, onSeg, holdings = null, orders = null }) {
  return (
    <SegmentBar label="Positions or orders" value={seg} onChange={onSeg} style={{ margin: "10px 16px 8px" }}
      items={[{ id: "positions", label: "Positions", count: holdings }, { id: "orders", label: "Orders", count: orders }]} />
  );
}

/** "Close working at $7.62 · 0 of 9 · Market closed · opens Mon 15:30 your time", and "Manage order": the card's foot. */
export function WorkingCloseLine({ line, clockLine = null, onManage }) {
  return (
    <div data-working-close style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ ...sans, fontSize: FS.sm, color: T.ink, lineHeight: LH.body, flex: "1 1 180px" }}>
        <span style={mono}>{line}</span>{clockLine ? <span style={{ color: T.mut }}>{` · ${clockLine}`}</span> : null}
      </span>
      <CardButton tone="ghost" onClick={onManage}>Manage order</CardButton>
    </div>
  );
}

/**
 * THE BOARD'S TWO CARD BUTTONS: "ghost" (an action outline: Manage order, Close at limit when a rule says close) and
 * "amber" (Decide: close or keep ›). 44px tall; `quiet` is a field outline in ink (Details ›, File in Journal).
 */
export function CardButton({ tone = "ghost", onClick, children, style, ...rest }) {
  const amber = tone === "amber", quiet = tone === "quiet", filled = tone === "action";
  return (
    <button type="button" onClick={onClick} {...rest}
      style={{ ...sans, minHeight: TAP, display: "inline-flex", alignItems: "center", justifyContent: "center", padding: amber ? "0 16px" : "0 14px",
        borderRadius: 10, fontSize: FS.sm, fontWeight: FW.bold, lineHeight: LH.tight, cursor: rest.disabled ? "not-allowed" : "pointer",
        opacity: rest.disabled ? 0.5 : 1,
        background: amber ? T.amber : filled ? T.action : "transparent", color: amber || filled ? T.onAccent : quiet ? T.ink : T.action,
        border: amber || filled ? "none" : `1px solid ${quiet ? T.field : T.action}`, ...style }}>{children}</button>
  );
}
