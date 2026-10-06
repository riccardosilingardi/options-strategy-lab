// ============================================================================
// src/settings.jsx — SETTINGS (redesign PR 3b; the owner's board "Settings", 6 Oct 2026).
//
// In the board's order: "‹ Back", "Settings", YOUR CAPITAL (the trading capital, YOUR LIMITS with what is open now,
// and — folded, owner, 6 Oct 2026 — "More limits ▾": positions at once, total savings, the per-trade override and its
// written reason), FREE SIZING (one typed reason to turn it on), CONNECTIONS (Alpaca, Alpha Vantage, Anthropic, each
// with what the app last saw of it; the report webhook), APPEARANCE, WHEN THERE IS NOTHING TO DO, START OVER.
//
// IT DECIDES NOTHING. The limits are `limits` (App.jsx, from rules.js), what is open now is the gate's own open risk,
// and every write is the handler App.jsx hands in (`setSetting()`, `setNotify()`, `setTheme()`), unchanged.
// ============================================================================
import React, { useState } from "react";
import { ChevronLeft, Sun, Moon } from "lucide-react";
import { T, TYPE } from "./theme.js";
import { Fold, Note, mono, sans, TAP } from "./ui.jsx";
import { RULES, money, pctText } from "./rules.js";

const FS = TYPE.size, FW = TYPE.weight, LH = TYPE.line;
const CARD = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 };
const LBL = { ...sans, margin: 0, fontSize: FS.xs, fontWeight: FW.bold, letterSpacing: "0.08em", color: T.mut, lineHeight: LH.tight };
const FIELD = { ...mono, minHeight: TAP, padding: "0 12px", border: `1px solid ${T.field}`, borderRadius: 10, background: T.bg, color: T.ink,
  fontSize: FS.md, boxSizing: "border-box", width: "100%" };
const GHOST = { ...sans, minHeight: TAP, border: `1px solid ${T.field}`, borderRadius: 10, background: "transparent", color: T.ink, fontSize: FS.sm,
  fontWeight: FW.bold, padding: "0 14px", cursor: "pointer", alignSelf: "flex-start" };
const BOX = { width: 22, height: 22, margin: 0, flex: "none", accentColor: T.amber };
const CHECK_ROW = { ...sans, display: "flex", alignItems: "flex-start", gap: 10, minHeight: TAP, fontSize: FS.sm, lineHeight: LH.body, color: T.ink, cursor: "pointer" };
const num = (v, lo) => (v === "" ? null : Math.max(lo, +v));

/** One connection: its name, what the app last saw of it (green only when it answered), a line, and anything else. */
function Conn({ name, extra = null, state, ok = false, first = false, children }) {
  return (
    <div data-conn style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "4px 8px", padding: first ? "0 0 10px" : "10px 0",
      borderTop: first ? "none" : `1px solid ${T.line}`, ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.ink }}>
      <span style={{ fontWeight: FW.bold }}>{name}{extra}</span>
      <span data-conn-state style={{ fontSize: FS.xs, fontWeight: ok ? FW.bold : FW.regular, color: ok ? T.green : T.mut, textAlign: "right" }}>
        {ok ? `● ${state}` : state}
      </span>
      {children}
    </div>
  );
}
const ConnLine = ({ children }) => <span style={{ gridColumn: "1 / -1", fontSize: FS.xs, color: T.mut }}>{children}</span>;

/**
 * @param v { onBack, settings, limits, openNow, freeSizing, onSetting(key, value), onNotify(on), theme, onTheme(id),
 *            conn: { alpaca: {state, ok, account, status}, av: {state, ok}, ai: {state, ok} }, onCheckAlpaca, checking,
 *            capitalNote, sizingFreeOk(reason) }
 */
export function SettingsScreen({ v }) {
  const [freeDraft, setFreeDraft] = useState(null);
  const s = v.settings || {};
  const L = v.limits;
  const over = s.sizeOverride || null;
  return (
    <div data-settings style={{ paddingBottom: 8 }}>
      <header style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px 0 4px" }}>
        <button type="button" data-back onClick={v.onBack} style={{ ...sans, minHeight: TAP, display: "flex", alignItems: "center", gap: 2,
          padding: "0 10px 0 4px", color: T.ink, background: "transparent", border: "none", fontSize: FS.md, cursor: "pointer" }}>
          <ChevronLeft size={22} strokeWidth={2} aria-hidden="true" /><span>Back</span>
        </button>
      </header>
      <main style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
        <h1 data-view-heading tabIndex={-1} style={{ ...sans, margin: 0, fontSize: FS.xl, fontWeight: FW.bold, lineHeight: LH.tight, color: T.ink,
          outline: "none" }}>Settings</h1>

        <section data-settings-capital aria-label="Your capital" style={CARD}>
          <h2 style={LBL}>{L.answered ? "YOUR CAPITAL · EVERY LIMIT COMES FROM HERE" : "YOUR CAPITAL · NOT SET YET"}</h2>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Trading capital, in dollars</span>
            <input type="number" min={100} step={500} value={s.capital ?? ""} placeholder={`e.g. ${RULES.suggestedTradingCapital}`}
              onChange={(e) => v.onSetting("capital", num(e.target.value, 100))} style={{ ...FIELD, fontWeight: FW.bold }} />
          </label>
          {!L.answered && <Note color={T.blue}>{v.capitalNote}</Note>}
          {(L.pills || []).map((pl) => <Note key={pl.id}>{pl.text}</Note>)}
          <div data-limits style={{ padding: "12px 14px", background: T.bg, border: `1px solid ${L.answered ? T.line : T.blue}`, borderRadius: 10,
            display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ ...LBL, color: L.answered ? T.mut : T.blue }}>{L.answered ? "YOUR LIMITS" : "SUGGESTED — NOT YOUR LIMITS YET"}</span>
            <span style={{ ...sans, fontSize: FS.md, color: T.ink }}><span style={{ ...mono, fontWeight: FW.bold }}>{money(L.perTradeLimit)}</span> at risk per trade</span>
            <span style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>
              and <span style={mono}>{money(L.totalLimit)}</span> across everything at once ({pctText(RULES.totalExposurePct)} of your capital).
              {v.openNow != null ? <> Open now: <span style={mono}>{money(v.openNow)}</span>.</> : null}
              {L.overrideAccepted ? ` This is your own limit, not the suggested one — your reason: “${L.overrideReason}”.` : ""}
            </span>
            {v.freeSizing && <span style={{ ...sans, fontSize: FS.sm, color: T.amber }}>Free sizing is on: these two limits are not applied.</span>}
          </div>
          <p style={{ ...sans, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>
            Equity on Positions is Alpaca's number; your limits come from this one.{L.answered && v.capitalNote ? ` ${v.capitalNote}` : ""}
          </p>
          {/* MORE LIMITS, FOLDED (owner, 6 Oct 2026): nothing the board does not draw is dropped. */}
          <Fold label="open" tone={T.ink} keepMounted summary="More limits: positions at once, savings, your own per-trade limit">
            <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Positions at once</span>
                <input type="number" min={1} max={20} value={s.concurrentTarget ?? ""} placeholder={`e.g. ${RULES.suggestedConcurrentTarget}`}
                  onChange={(e) => v.onSetting("concurrentTarget", num(e.target.value, 1))} style={FIELD} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Total savings, in dollars (optional)</span>
                <input type="number" min={0} step={1000} value={s.savings ?? ""} onChange={(e) => v.onSetting("savings", num(e.target.value, 0))} style={FIELD} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ ...sans, fontSize: FS.sm, color: T.mut }}>Your own per-trade limit, in dollars (needs a written reason)</span>
                <input type="number" min={0} step={50} placeholder="amount" value={over?.perTrade ?? ""}
                  onChange={(e) => v.onSetting("sizeOverride", e.target.value === "" ? null : { ...(over || {}), perTrade: Math.max(0, +e.target.value) })} style={FIELD} />
              </label>
              {over && (
                <>
                  <textarea rows={3} placeholder="Why this limit and not the suggested one?" value={over.reason ?? ""}
                    onChange={(e) => v.onSetting("sizeOverride", { ...(over || {}), reason: e.target.value })}
                    style={{ ...sans, width: "100%", boxSizing: "border-box", fontSize: FS.sm, lineHeight: LH.body, background: T.bg, color: T.ink,
                      border: `1px solid ${L.overrideAccepted ? T.green : T.amber}`, borderRadius: 10, padding: "10px 12px", resize: "vertical" }} />
                  <button type="button" onClick={() => v.onSetting("sizeOverride", null)} style={GHOST}>Remove your own limit</button>
                </>
              )}
            </div>
          </Fold>
        </section>

        {/* FREE SIZING (PR #41, TASK 4): off by default; on costs one typed reason. The per-trade and total limits only. */}
        <section data-settings-free aria-label="Free sizing" style={CARD}>
          <h2 style={LBL}>FREE SIZING</h2>
          <label style={CHECK_ROW}>
            <input type="checkbox" checked={v.freeSizing || freeDraft != null} style={BOX}
              onChange={(e) => { if (e.target.checked) { setFreeDraft(""); return; } setFreeDraft(null); v.onSetting("sizingFree", null); }} />
            <span>Size each trade on the amount I type. The {pctText(RULES.bestPracticePerTradePct)} and {pctText(RULES.totalExposurePct)} limits are
              not applied; paper only, defined risk, the entry days and every quality floor still are.</span>
          </label>
          {v.freeSizing && s.sizingFree && (
            <p style={{ ...sans, margin: 0, fontSize: FS.xs, color: T.mut, lineHeight: LH.body }}>
              On since <span style={mono}>{new Date(s.sizingFree.at).toLocaleString("en-GB")}</span> — your reason: “{String(s.sizingFree.reason || "").trim()}”
            </p>
          )}
          {!v.freeSizing && freeDraft != null && (
            <>
              <textarea rows={3} placeholder="Why size freely?" value={freeDraft} onChange={(e) => setFreeDraft(e.target.value)}
                style={{ ...sans, width: "100%", boxSizing: "border-box", fontSize: FS.sm, lineHeight: LH.body, background: T.bg, color: T.ink,
                  border: `1px solid ${T.amber}`, borderRadius: 10, padding: "10px 12px", resize: "vertical" }} />
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <button type="button" disabled={!v.sizingFreeOk(freeDraft)} style={{ ...GHOST, alignSelf: "auto", background: T.amber, color: T.onAccent,
                  border: "none", opacity: v.sizingFreeOk(freeDraft) ? 1 : 0.5 }}
                  onClick={() => { v.onSetting("sizingFree", { reason: freeDraft.trim(), at: Date.now() }); setFreeDraft(null); }}>Turn on</button>
                {!v.sizingFreeOk(freeDraft) && <span style={{ ...mono, fontSize: FS.xs, color: T.mut }}>
                  {RULES.minOverrideReasonChars - freeDraft.trim().length} more characters</span>}
              </div>
            </>
          )}
        </section>

        {/* CONNECTIONS (PR #47, TASK 2). Each says what the app last saw of it: never "Working" on a service nobody read. */}
        <section data-settings-conn aria-label="Connections" style={CARD}>
          <h2 style={LBL}>CONNECTIONS</h2>
          <Conn first name="Alpaca paper trading" state={v.conn.alpaca.state} ok={v.conn.alpaca.ok}>
            <ConnLine>Only paper-api.alpaca.markets is ever contacted. Every order asks you twice.
              {v.conn.alpaca.account ? <> Account <span style={mono}>{v.conn.alpaca.account}</span>{v.conn.alpaca.status ? ` · ${v.conn.alpaca.status}` : ""}.</> : null}</ConnLine>
            <button type="button" onClick={v.onCheckAlpaca} disabled={v.checking} style={{ ...GHOST, gridColumn: "1 / -1", justifySelf: "start" }}>
              {v.checking ? "Checking…" : "Check the connection"}</button>
          </Conn>
          <Conn name="Alpha Vantage · price history" state={v.conn.av.state} ok={v.conn.av.ok}>
            <ConnLine>Powers the measured seasonality and Past yrs.</ConnLine>
          </Conn>
          <Conn name="Anthropic API · copilot and reports" state={v.conn.ai.state} ok={v.conn.ai.ok} />
          <Conn name="Report webhook" extra={<span style={{ fontWeight: FW.regular, color: T.mut }}> (optional)</span>} state={s.webhook ? "Set" : "Not set"}>
            <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontSize: FS.xs, color: T.mut }}>Zapier or Make URL, to forward the Journal report</span>
              <input type="url" placeholder="https://hooks.zapier.com/…" value={s.webhook || ""} onChange={(e) => v.onSetting("webhook", e.target.value)}
                style={{ ...FIELD, ...sans, fontSize: FS.sm }} />
            </label>
          </Conn>
          <p style={{ ...sans, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>
            Keys live on the server (ALPACA_KEY, ALPHAVANTAGE_KEY, ANTHROPIC_KEY): nothing to type here.</p>
        </section>

        <section data-settings-look aria-label="Appearance" style={CARD}>
          <h2 style={LBL}>APPEARANCE</h2>
          <div role="group" aria-label="Theme" style={{ display: "flex", gap: 8 }}>
            {[["light", "Light", Sun], ["dark", "Dark", Moon]].map(([id, label, I]) => {
              const on = v.theme === id;
              return (
                <button key={id} type="button" aria-pressed={on} onClick={() => !on && v.onTheme(id)}
                  style={{ ...sans, flex: 1, minHeight: 52, borderRadius: 10, cursor: on ? "default" : "pointer", fontSize: FS.md,
                    fontWeight: on ? FW.bold : FW.regular, background: on ? T.amber : "transparent", color: on ? T.onAccent : T.ink,
                    border: `1.5px solid ${on ? T.amber : T.line}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <I size={16} aria-hidden="true" /> {label}
                </button>
              );
            })}
          </div>
          <p style={{ ...sans, margin: 0, fontSize: FS.xs, lineHeight: LH.body, color: T.mut }}>Dark is the default. The app reloads to apply the change.</p>
        </section>

        <section data-settings-quiet aria-label="When there is nothing to do" style={CARD}>
          <h2 style={LBL}>WHEN THERE IS NOTHING TO DO</h2>
          <label style={CHECK_ROW}>
            <input type="checkbox" checked={!!s.notifyWhenReady} onChange={(e) => v.onNotify(e.target.checked)} style={BOX} />
            <span>Flag it in the daily brief when the signals line up again and options stop being expensive.</span>
          </label>
        </section>

        <section data-settings-over aria-label="Start over" style={CARD}>
          <h2 style={LBL}>START OVER</h2>
          <p style={{ ...sans, margin: 0, fontSize: FS.sm, lineHeight: LH.body, color: T.body }}>Run the capital questions again. Your positions and saved trades are not touched.</p>
          <button type="button" onClick={() => v.onSetting("onboarded", false)} style={{ ...GHOST, color: T.blue, border: `1px solid ${T.blue}` }}>Redo setup</button>
        </section>
      </main>
    </div>
  );
}
