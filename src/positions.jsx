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
// IT DECIDES NOTHING. Equity and buying power are Alpaca's, read at each sync; AT RISK is the gate's own
// `limits.openRisk` of `limits.total` (`evaluateTrade()`); the clock line is `marketClockLine()`.
// ============================================================================
import React from "react";
import { RefreshCw } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { Btn, Info, Note, Segments, mono, sans, TAP } from "./ui.jsx";
import { money } from "./rules.js";

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

/**
 * THE ACCOUNT STRIP. `account` is `GET /v2/account` (null until read); `risk` is the gate's limits
 * ({ openRisk, total, sizingFree }); `capital` is the trading capital set in Settings.
 *
 * The ⓘ sentences, sourced (Alpaca, "Account" in the Trading API reference, and alpaca-py's `TradeAccount`):
 *   equity        — "cash + long_market_value + short_market_value": cash plus positions at Alpaca's prices.
 *   buying power  — what Alpaca allows you to spend on new orders now (options: `options_buying_power`).
 */
export function AccountStrip({ account = null, risk = null, capital = null }) {
  const eq = account ? num(account.equity) : null;
  const bp = buyingPowerOf(account);
  const open = risk ? num(risk.openRisk) : null;
  const total = risk ? num(risk.total) : null;
  const cell = (k, v, info, extra = null) => (
    <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ ...sans, fontSize: FS.xs, color: T.dim, letterSpacing: "0.04em", display: "flex", alignItems: "center", flexWrap: "wrap" }}>
        {k}<Info label={k.toLowerCase()}>{info}</Info>
      </div>
      <div style={{ ...mono, fontSize: FS.md, fontWeight: FW.bold, color: T.ink, lineHeight: LH.tight }}>{v}</div>
      {extra}
    </div>
  );
  const limitsLine = `Your limits come from the capital you set in Settings (${capital != null ? money(capital) : "not set"}), not from equity.`;
  return (
    <div data-account-strip style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(104px, 1fr))", gap: 10,
      padding: "10px 12px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8 }}>
      {cell("EQUITY", eq == null ? "—" : money(eq),
        <>Cash plus your positions at Alpaca's own prices, as Alpaca reports it now. {limitsLine}</>)}
      {cell(bp.options ? "OPTIONS BUYING POWER" : "BUYING POWER", bp.value == null ? "—" : money(bp.value),
        <>What Alpaca lets you spend on new trades now.{" "}
          {bp.options ? "This is Alpaca's options figure, the one it checks an options order against."
            : account ? "Alpaca sent no separate options figure, so this is its general buying power." : ""} {limitsLine}</>)}
      {cell("AT RISK",
        open == null ? "—" : risk && risk.sizingFree ? money(open) : `${money(open)} of ${total == null ? "—" : money(total)}`,
        <>The most you can lose on everything you hold and every order still working, as the risk gate counts it
          {risk && risk.sizingFree ? "." : ", against your total limit."} {limitsLine}</>,
        risk && risk.sizingFree ? <Note>no limit applied</Note> : null)}
    </div>
  );
}

/** Positions | Orders, with the counts, and the one refresh icon (it replaces the Alpaca panel's Sync). */
export function PositionsBar({ seg, onSeg, holdings = null, orders = null, onRefresh, busy = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
      <Segments label="Positions or orders" value={seg} onChange={onSeg}
        items={[{ id: "positions", label: "Positions", count: holdings }, { id: "orders", label: "Orders", count: orders }]} />
      <button onClick={onRefresh} disabled={busy} aria-label="Read Alpaca again"
        style={{ minHeight: TAP, minWidth: TAP, display: "inline-flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: `1px solid ${T.field}`, borderRadius: 8, color: T.ink, cursor: busy ? "wait" : "pointer" }}>
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

/** "Close working at $7.62 · 0 of 9 · Market closed · opens Mon 15:30 your time", and "Manage order". */
export function WorkingCloseLine({ line, clockLine = null, onManage }) {
  return (
    <div data-working-close style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ ...sans, fontSize: FS.sm, color: T.ink, lineHeight: LH.body, flex: "1 1 200px" }}>
        <span style={mono}>{line}</span>{clockLine ? <span style={{ color: T.mut }}>{` · ${clockLine}`}</span> : null}
      </span>
      <Btn small ghost color={T.action} onClick={onManage}>Manage order</Btn>
    </div>
  );
}
