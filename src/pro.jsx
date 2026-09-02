import React, { useState, useEffect } from "react";
import { RefreshCw, Send, Trash2, Download, Sparkles, FileText, XCircle } from "lucide-react";
import { T } from "./theme.js";
import { RULES, ruleBadge, takeProfitLabel, scaleOutLabel, stopLossLabel, exitDTELabel, perTradeCapLabel, copilotRulesBlock, money, pctText } from "./rules.js";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { erf, netBS } from "./engine.js";
import { ARROW, REGIONS, regionSignals, tagImpacts, taRead } from "./signals.js";
import { useNarrow, BandThumbnail, payoffBands, bandTakeaway } from "./visuals.jsx";
import { DEMO, DEMO_TOOLTIP } from "./demo.js";
import { hasOpenInterest, sourceNote, openInterestNote } from "./chain.js";
// "Why this trade" and the headline tags moved to src/why.jsx: the wizard's
// decision screen needs them too, and a road with no evidence under it is a
// recommendation. Re-exported here so nothing else has to change its import.
export { ImpactTags, WhyThisTrade } from "./why.jsx";
export { useNarrow };

/* ============ theme (condiviso) ============ */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const fmt$ = (x) => (x == null || Number.isNaN(x) || !Number.isFinite(x)) ? "—" : `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(0)}`;
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small, title }) => (
  <button onClick={onClick} disabled={disabled} title={title}
    style={{ ...mono, fontSize: small ? 11 : 12, padding: small ? "4px 8px" : "8px 12px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: ghost ? "transparent" : color, color: ghost ? color : T.onAccent, border: ghost ? `1px solid ${color}66` : "none", display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>
);
const Panel = ({ children, style }) => <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: 14, ...style }}>{children}</div>;
const Lbl = ({ children }) => <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>{children}</div>;
const Stat = ({ k, v, c, tip }) => (
  <div>
    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{k}{tip && <span title={tip} style={{ cursor: "help", color: T.blue, marginLeft: 3 }}>ⓘ</span>}</div>
    <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: c || T.ink }}>{v}</div>
  </div>
);
const Inp = (props) => <input {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />;
const Sel = (props) => <select {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />;

async function proxied(url) {
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("proxy " + r.status);
  return r;
}

/* ================================================================
   1) NEWS: cause -> effect tagging + geopolitical/government sources

   The cause->effect rules themselves live in src/signals.js: the same tags feed
   the news factor of fuseSignals(), so a headline can never mean one thing to
   the feed and another to the engine.
================================================================ */
export { tagImpacts };

const ANALYSIS_QUERIES = [
  '"Saxo Bank" commodities weekly',
  'EIA natural gas weekly storage report analysis',
  'USDA WASDE report analysis grains',
  'CFTC commitment of traders agriculture energy',
];
const GEO_QUERIES = [
  "OPEC energy sanctions geopolitics",
  "USDA WASDE grain report",
  "Black Sea grain Ukraine Russia export",
  "China soybean corn imports trade",
  "government export ban commodities tariff",
];
async function fetchRss(url) {
  let r;
  try { r = await fetch(url); if (!r.ok) throw new Error("rss " + r.status); }
  catch { r = await proxied(url); }
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"));
  if (!items.length) throw new Error("empty feed");
  return items.slice(0, 10).map((it) => ({
    title: it.querySelector("title")?.textContent || "",
    link: it.querySelector("link")?.textContent || "",
    date: it.querySelector("pubDate")?.textContent || "",
    src: it.querySelector("source")?.textContent || new URL(url).hostname,
  }));
}
export async function fetchAllNews(ticker, newsQ) {
  const feeds = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(newsQ)}&hl=en-US&gl=US&ceid=US:en`,
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`,
    "https://www.eia.gov/rss/todayinenergy.xml",
    ...GEO_QUERIES.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`),
    ...ANALYSIS_QUERIES.map((q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`),
  ];
  const nGeoStart = 2, nAnStart = 2 + GEO_QUERIES.length;
  const results = await Promise.allSettled(feeds.map(fetchRss));
  const items = results.flatMap((r, i) => (r.status === "fulfilled" ? r.value.map((x) => ({ ...x, geo: i >= nGeoStart && i < nAnStart, analysis: i >= nAnStart })) : []));
  if (!items.length) throw new Error("news feeds are not reachable");
  const seen = new Set();
  return items
    .filter((i) => i.title && !seen.has(i.title) && seen.add(i.title))
    .map((i) => ({ ...i, impacts: tagImpacts(i.title) }))
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 40);
}

/* ================================================================
   2) WEATHER: Open-Meteo forecasts over the key commodity regions

   The region table, the climate normals and the anomaly read all live in
   src/signals.js. This block only fetches and reshapes for display, so the
   weather drill-down and fuseSignals() can never disagree about the same forecast.
================================================================ */
export { REGIONS };

export async function fetchWeather() {
  const out = {};
  await Promise.all(REGIONS.map(async (rg) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${rg.lat}&longitude=${rg.lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=14&timezone=auto`;
    let r;
    try { r = await fetch(url); if (!r.ok) throw new Error(); } catch { r = await proxied(url); }
    const j = await r.json();
    out[rg.id] = { tmax: j.daily.temperature_2m_max, tmin: j.daily.temperature_2m_min, prec: j.daily.precipitation_sum, dates: j.daily.time };
  }));
  return out;
}

/** One display row per region: anomaly versus that region's own monthly norm. */
export function weatherSignals(data) {
  return regionSignals(data);
}

// The Weather tab is gone (see WhyThisTrade below): weather is evidence for a
// trade, not a place to visit. `weatherSignals` stays — the report still uses it.

/* ================================================================
   3) ALPACA PRO: ordini completi + posizioni/ordini live
================================================================ */
// Nessun componente invia ordini senza cancello: se la prop `gate` manca, la
// risposta e' un blocco, non un permesso (PRD §8, regola 4 di CLAUDE.md).
export function runGate(gate, proposal) {
  if (typeof gate !== "function") {
    return { pass: false, warnings: [], violations: [{ code: "GATE_MISSING",
      message: "The risk gate is not wired into this screen, so no order can leave it. This is a bug, and it fails closed on purpose." }] };
  }
  return gate(proposal);
}

export async function alpacaReq(path, method = "GET", body = null) {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent(path)}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}
export function OrderTicket({ creds, legs, expKey, ticker, buildOcc, quoteFn, estNet, setMsg, onSent, gate, dte, maxLoss, maxProfit }) {
  const [cfg, setCfg] = useState({ qty: 1, type: "limit", tif: "day", limit: "" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (estNet != null && cfg.limit === "") setCfg((c) => ({ ...c, limit: Math.abs(estNet).toFixed(2) })); }, [estNet]); // eslint-disable-line
  // Il cancello gira PRIMA di costruire l'ordine: quello che si vede nel
  // pannello e' esattamente quello che decide se l'ordine parte.
  const preview = runGate(gate, { ticker, intent: "open", legs, dte, contracts: cfg.qty, maxLoss, maxProfit });
  const send = async () => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 2 of six
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setBusy(true);
    try {
      const g = runGate(gate, { ticker, intent: "open", legs, dte, contracts: cfg.qty, maxLoss, maxProfit });
      if (!g.pass) { setMsg(`Risk gate: order not sent. ${g.violations.map((v) => v.message).join(" ")}`); setBusy(false); return; }
      const mlegs = legs.map((l) => {
        const q = quoteFn ? quoteFn(l) : null;
        const occ = q?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("pick a real expiry from the chain first");
        return { symbol: occ, ratio_qty: String(l.qty), side: l.side > 0 ? "buy" : "sell", position_intent: l.side > 0 ? "buy_to_open" : "sell_to_open" };
      });
      if (mlegs.length > 4) throw new Error("Alpaca takes at most 4 legs per order: split the strategy in two");
      let body;
      if (mlegs.length === 1) {
        // singola gamba: ordine semplice (mleg richiede 2-4 gambe)
        body = { symbol: mlegs[0].symbol, qty: String(cfg.qty * (+mlegs[0].ratio_qty || 1)), side: mlegs[0].side, type: cfg.type, time_in_force: cfg.tif };
        if (cfg.type === "limit") body.limit_price = String((Math.abs(+cfg.limit) / (+mlegs[0].ratio_qty || 1)).toFixed(2));
      } else {
        body = { order_class: "mleg", qty: String(cfg.qty), type: cfg.type, time_in_force: cfg.tif, legs: mlegs };
        if (cfg.type === "limit") body.limit_price = String(Math.abs(+cfg.limit).toFixed(2));
      }
      const o = await alpacaReq("/v2/orders", "POST", body);
      if (onSent) onSent(o, cfg);
      setMsg(`${cfg.type === "limit" ? "Limit" : "Market"} order ×${cfg.qty} sent to your Alpaca paper account · id ${o.id?.slice(0, 8)}… · ${o.status}`);
    } catch (e) { setMsg(`The order was not sent: ${e.message}`); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: T.bg, border: `1px solid ${T.violet}44`, borderRadius: 7 }}>
      <Lbl>SEND THE ORDER · ALPACA PAPER ACCOUNT</Lbl>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>QTY</div><Inp type="number" min={1} max={20} value={cfg.qty} onChange={(e) => setCfg({ ...cfg, qty: Math.max(1, +e.target.value) })} style={{ width: 56 }} /></div>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>ORDER TYPE</div>
          <Sel value={cfg.type} onChange={(e) => setCfg({ ...cfg, type: e.target.value })}><option value="limit">Limit — set my price</option><option value="market">Market — take what is there</option></Sel></div>
        {cfg.type === "limit" && (
          <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>MY PRICE $ (market is {estNet != null ? Math.abs(estNet).toFixed(2) : "—"})</div>
            <Inp type="number" step="0.01" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: e.target.value })} style={{ width: 90 }} /></div>
        )}
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>HOW LONG IT STANDS</div>
          <Sel value={cfg.tif} onChange={(e) => setCfg({ ...cfg, tif: e.target.value })}><option value="day">Today only</option><option value="gtc">Until I cancel</option></Sel></div>
        <Btn color={confirm ? T.red : T.violet} onClick={send} disabled={busy || !preview.pass || DEMO}
          title={DEMO ? DEMO_TOOLTIP : undefined}>
          <Send size={12} /> {busy ? "Sending…" : DEMO ? DEMO_TOOLTIP : !preview.pass ? "BLOCKED BY THE RISK GATE" : confirm ? "TAP AGAIN TO CONFIRM" : "Send the order"}
        </Btn>
        {confirm && <Btn small ghost onClick={() => setConfirm(false)}>Cancel</Btn>}
      </div>
      {!preview.pass && (
        <div style={{ display: "grid", gap: 3, marginTop: 7 }}>
          {preview.violations.map((v) => (
            <div key={v.code} style={{ ...mono, fontSize: 10.5, color: T.red }}>✗ {v.message}</div>
          ))}
        </div>
      )}
      {preview.warnings.map((w) => (
        <div key={w.code} style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 5 }}>⚠ {w.message}</div>
      ))}
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Paper account only. The price is for the whole combination, not one leg. Every order asks you twice, and every order goes through the risk gate first.</div>
    </div>
  );
}
export function AlpacaDesk({ creds, setMsg, gate }) {
  const [pos, setPos] = useState(null);
  const [ords, setOrds] = useState(null);
  const [busy, setBusy] = useState(false);
  const sync = async () => {
    setBusy(true);
    try {
      const [p, o] = await Promise.all([
        alpacaReq("/v2/positions"),
        alpacaReq("/v2/orders?status=open&limit=30&nested=true"),
      ]);
      setPos(p); setOrds(o);
    } catch (e) { setMsg(`Could not sync with Alpaca: ${e.message}`); }
    setBusy(false);
  };
  useEffect(() => { sync(); }, []); // eslint-disable-line
  const cancel = async (id) => { try { await alpacaReq(`/v2/orders/${id}`, "DELETE"); setMsg("Order cancelled."); sync(); } catch (e) { setMsg(e.message); } };
  // Chiusura strategia intera: 1) cancella ordini aperti sugli stessi contratti (evita "wash trade detected")
  // 2) invia UN ordine complesso di chiusura (mleg) — mai gambe separate
  const closeGroup = async (grp) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 3 of six
    try {
      // Anche una chiusura e' un ordine: passa dal cancello (intent "close",
      // quindi le regole d'ingresso non si applicano, quella paper si).
      const g = runGate(gate, {
        intent: "close", ticker: String(grp.key || "").split(" ")[0],
        legs: grp.items.map((x) => ({ side: +x.qty > 0 ? 1 : -1, qty: Math.abs(+x.qty), type: /C\d{8}$/.test(x.symbol) ? "call" : "put" })),
        maxLoss: grp.items.reduce((a, x) => a + Math.abs(+x.cost_basis || 0), 0), contracts: 1,
      });
      if (!g.pass) { setMsg(`Risk gate: the close was not sent. ${g.violations.map((v) => v.message).join(" ")}`); return; }
      const syms = new Set(grp.items.map((x) => x.symbol));
      for (const o of ords || []) {
        const oSyms = o.order_class === "mleg" ? (o.legs || []).map((l) => l.symbol) : [o.symbol];
        if (oSyms.some((sy) => syms.has(sy))) { try { await alpacaReq(`/v2/orders/${o.id}`, "DELETE"); } catch { /* già chiuso */ } }
      }
      const mlegs = grp.items.map((x) => ({
        symbol: x.symbol, ratio_qty: String(Math.abs(+x.qty)),
        side: +x.qty > 0 ? "sell" : "buy",
        position_intent: +x.qty > 0 ? "sell_to_close" : "buy_to_close",
      }));
      const body = mlegs.length === 1
        ? { symbol: mlegs[0].symbol, qty: mlegs[0].ratio_qty, side: mlegs[0].side, type: "market", time_in_force: "day" }
        : { order_class: "mleg", qty: "1", type: "market", time_in_force: "day", legs: mlegs.slice(0, 4) };
      await alpacaReq("/v2/orders", "POST", body);
      setMsg(`Closing ${grp.key} — sent as a single order.`);
      setTimeout(sync, 1500);
    } catch (e) { setMsg(`The close was not sent: ${e.message}`); }
  };
  return (
    <Panel style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Lbl>ON YOUR ALPACA PAPER ACCOUNT</Lbl>
        <Btn small ghost onClick={sync} disabled={busy}><RefreshCw size={11} /> Sync</Btn>
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>OPEN POSITIONS ({pos ? pos.length : "…"})</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {(() => {
          const groups = {};
          for (const x of pos || []) {
            const m = (x.symbol || "").match(/^([A-Z]{1,6})(\d{6})([CP])(\d{8})$/);
            const key = m ? `${m[1]} · 20${m[2].slice(0, 2)}-${m[2].slice(2, 4)}-${m[2].slice(4, 6)}` : x.symbol;
            if (!groups[key]) groups[key] = { key, items: [], pl: 0 };
            groups[key].items.push(x); groups[key].pl += +x.unrealized_pl;
          }
          return Object.values(groups).map((g) => (
            <div key={g.key} style={{ padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{g.key} · {g.items.length} leg{g.items.length === 1 ? "" : "s"}</div>
                  {g.items.map((x) => (
                    <div key={x.symbol} style={{ ...mono, fontSize: 10, color: T.dim }}>{+x.qty > 0 ? "+" : ""}{x.qty} {x.symbol.slice(-9)} · avg ${(+x.avg_entry_price).toFixed(2)} → ${(+x.current_price).toFixed(2)}</div>
                  ))}
                </div>
                <Stat k="PROFIT NOW" v={fmt$(g.pl)} c={g.pl >= 0 ? T.green : T.red} />
                <Btn small ghost color={T.red} onClick={() => closeGroup(g)} disabled={DEMO}
                  title={DEMO ? DEMO_TOOLTIP : undefined}><XCircle size={11} /> Close the whole trade</Btn>
              </div>
            </div>
          ));
        })()}
        {pos && pos.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>Nothing open on Alpaca.</div>}
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>ORDERS WAITING ({ords ? ords.length : "…"})</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {(ords || []).map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12 }}>{o.order_class === "mleg" ? `MULTILEG x${o.qty} (${(o.legs || []).length} legs)` : `${o.symbol} ${o.side} ${o.qty}`}</div>
              <div style={{ ...mono, fontSize: 10, color: T.dim }}>{o.type}{o.limit_price ? ` @ ${o.limit_price}` : ""} · {o.time_in_force} · {o.status}</div>
            </div>
            <Btn small ghost color={T.red} onClick={() => cancel(o.id)}><Trash2 size={11} /> Cancel</Btn>
          </div>
        ))}
        {ords && ords.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>No orders waiting.</div>}
      </div>
    </Panel>
  );
}

/* ================================================================
   4) AI COPILOT: chat con skill trader precaricate
================================================================ */
// Un solo posto per le regole, anche nei prompt: il testo qui sotto e' generato
// da src/rules.js, quindi il modello non puo' citare un numero che il codice
// non applica piu' (era il caso di "regola del 5%" e "exit 7 DTE").
const SYSTEM_PROMPT = `You are the copilot of an options trader working on commodity ETFs (SOYB, CORN, UNG, BOIL, WEAT, SPY) in PAPER TRADING.
${copilotRulesBlock()}
These rules are enforced in code by src/riskGate.js before any order is sent. Never propose a trade that breaks them, and never present a rule number that differs from the ones above.
WHO YOU ARE WRITING FOR: someone who is learning, not a professional trader. Plain English sentences. Define any term the first time you use it, in the same sentence — "open interest (how many contracts are actually open)". Never guarantee an outcome: this is educational analysis on a paper account, not financial advice. Always state the risk and what would make the idea wrong.

METHOD (follow in order): 1 Discovery (seasonal scanner + trend) → 2 Construction (real chain, strikes, Greeks, R/R, breakevens) → 3 Execution (only after explicit human confirmation, check buying power) → 4 Monitoring (P&L against the rules, % of max profit) → 5 Reporting.

DECISION TREES: (A) strong bullish seasonal signal + uptrend → bull call spread (small capital) or long call (larger capital), moderate conviction → call calendar; (B) neutral/range market with low volatility → iron condor (never naked strangles: defined risk only); (C) event ahead with low IV → long ATM straddle/strangle; IV already high → sell premium with defined risk, or wait; directional bias → vertical spread.

MANAGEMENT: scale in and out → start with 1 contract, add if it works, close half at ${pctText(RULES.takeProfitPct)} of max profit and the rest at ${pctText(RULES.scaleOutPct)}; roll near expiration with a calendar; if the underlying moves against you → re-examine the thesis: if it is invalidated, close, do not average down.

OUTPUT FORMAT — READ THIS TWICE, IT IS THE MOST IGNORED PART.
The screen ALREADY shows the legs, the strikes, the greeks, the max profit, the max loss and the breakevens, right next to your answer. Do NOT repeat them as a specification. Refer to them ("the $22/$23 call spread above") and spend your words on what the numbers MEAN.
- Write prose. Short paragraphs. NO tables, NO pipe characters, NO code fences, NO leg-by-leg listings.
- At most four short sections. Head each one with "## " and a plain-English title — "What this trade is betting on", not "STRUCTURE".
- Bullets with "- " only where a list is genuinely a list. **Bold** for the one number that matters in a paragraph, sparingly.
- Open with one sentence that answers the question asked. Close with what you would watch, and what would tell you the idea is wrong.
- Ask for confirmation before any execution.`;
/* ================================================================
   MARKDOWN, RENDERED — not printed

   The model answers in markdown. The panel used to drop it on screen with
   `white-space: pre-wrap`, so the reader got `## 1. STRUCTURE`, `**Ticker:**`
   and a wall of `|---|---|` pipes. The content was fine; it was being shown as
   source code. This is a deliberately small renderer — headings, bullets,
   numbered lists, bold, inline code, rules and tables — because the prompt now
   asks for prose and anything more elaborate is a sign the prompt drifted.
================================================================ */

/** `**bold**` and `` `code` `` inside a line. Returns React nodes. */
function inlineMd(text, keyBase = "i") {
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m, n = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(<b key={`${keyBase}-b${n++}`} style={{ color: T.ink }}>{tok.slice(2, -2)}</b>);
    } else {
      out.push(<code key={`${keyBase}-c${n++}`} style={{ ...mono, fontSize: "0.92em", background: T.bg, padding: "1px 4px", borderRadius: 3 }}>{tok.slice(1, -1)}</code>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const mdTableRow = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

export function Markdown({ text, style }) {
  if (!text) return null;
  // Code fences carry no meaning in an analysis; the prompt forbids them and a
  // stray one must not swallow the rest of the answer.
  const lines = String(text).replace(/```[a-z]*\n?/gi, "").split("\n");
  const blocks = [];
  let para = [], list = null;

  const flushPara = () => {
    if (!para.length) return;
    blocks.push(<p key={`p${blocks.length}`} style={{ margin: "0 0 9px", lineHeight: 1.6 }}>{inlineMd(para.join(" "), `p${blocks.length}`)}</p>);
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(<Tag key={`l${blocks.length}`} style={{ margin: "0 0 10px", paddingLeft: 20, lineHeight: 1.6 }}>
      {list.items.map((it, i) => <li key={i} style={{ marginBottom: 3 }}>{inlineMd(it, `l${blocks.length}-${i}`)}</li>)}
    </Tag>);
    list = null;
  };
  const flush = () => { flushPara(); flushList(); };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trimEnd();
    const t = line.trim();

    if (!t) { flush(); continue; }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) { flush(); blocks.push(<hr key={`h${blocks.length}`} style={{ border: "none", borderTop: `1px solid ${T.line}`, margin: "12px 0" }} />); continue; }

    const head = t.match(/^(#{1,4})\s+(.*)$/);
    if (head) {
      flush();
      const lvl = head[1].length;
      blocks.push(<div key={`hd${blocks.length}`} style={{
        ...(lvl <= 2 ? { ...mono, fontSize: 10.5, letterSpacing: "0.12em", color: T.amber, textTransform: "uppercase" } : { fontSize: 13.5, fontWeight: 700, color: T.ink }),
        margin: blocks.length ? "14px 0 6px" : "0 0 6px",
      }}>{inlineMd(head[2].replace(/^\d+[.)]\s*/, ""), `hd${blocks.length}`)}</div>);
      continue;
    }

    // a table: a header row, a separator row, then body rows
    if (t.startsWith("|") && /^\|[\s:|-]+\|?$/.test((lines[i + 1] || "").trim())) {
      flush();
      const header = mdTableRow(t);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(mdTableRow(lines[i])); i++; }
      i--;
      blocks.push(
        <div key={`t${blocks.length}`} style={{ overflowX: "auto", margin: "0 0 10px" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 12.5, minWidth: "100%" }}>
            <thead><tr>{header.map((h, j) => (
              <th key={j} style={{ ...mono, fontSize: 10, letterSpacing: "0.08em", color: T.dim, textAlign: "left", padding: "5px 9px", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>{rows.map((r, j) => (
              <tr key={j}>{r.map((c, k) => (
                <td key={k} style={{ padding: "5px 9px", borderBottom: `1px solid ${T.line}`, color: T.body, verticalAlign: "top" }}>{inlineMd(c, `t${j}-${k}`)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>);
      continue;
    }

    const bullet = t.match(/^[-*•]\s+(.*)$/);
    const numbered = t.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      flushPara();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet || numbered)[1]);
      continue;
    }

    flushList();
    para.push(t);
  }
  flush();
  return <div style={{ fontSize: 13, color: T.body, ...style }}>{blocks}</div>;
}

export const SKILLS = [
  { id: "pretrade", label: "Pre-trade analysis", prompt: `Run the pre-trade analysis of the current strategy: structure, Greeks, risk/reward, breakevens against support and resistance, seasonal alignment and news. Finish with a GO/NO-GO checklist and a position size within the per-trade limit (${perTradeCapLabel()}).` },
  { id: "positions", label: "Position review", prompt: `Review the open positions against the rules (${ruleBadge()}): for each one give → HOLD / CLOSE / ROLL with the reasoning and the levels to watch. Remember the ${stopLossLabel()} rule is a warning, never an automatic close.` },
  { id: "news", label: "News impact", prompt: "Analyse the tagged news in context: which items affect my positions and the underlyings on the radar? Separate noise from signal, with cause→effect and a time horizon." },
  { id: "radar", label: "Opportunity radar", prompt: `From the seasonal scanner and the weather signals, propose the 2 best opportunities of this week with a suggested structure (relative strikes, ~${RULES.targetEntryDTE} DTE), the thesis, the risk and the entry trigger. Nothing below ${RULES.minEntryDTE} DTE at entry: the risk gate refuses it.` },
];
/**
 * Pull the text deltas out of one or more SSE frames.
 *
 * Pure, and separate from the fetch, so the parsing can be tested without a
 * network: the frame shape is Anthropic's contract and a mistake here is
 * silent — text simply goes missing.
 *
 * @param chunk raw bytes decoded to text; may end mid-frame
 * @returns { text, rest } — the deltas found, and the unparsed tail to keep
 */
export function sseDeltas(chunk) {
  const frames = String(chunk).split("\n\n");
  const rest = frames.pop() || "";     // a partial frame: keep it for next time
  let text = "";
  for (const frame of frames) {
    for (const line of frame.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      let ev = null;
      try { ev = JSON.parse(payload); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") text += ev.delta.text;
      else if (ev.type === "error") throw new Error(ev.error?.message || "The copilot stream failed part-way through.");
    }
  }
  return { text, rest };
}

/**
 * Is this response body a GATEWAY talking rather than the API? Returns the
 * sentence to show, or null when the body is something else.
 *
 * A proxy timeout, a block page or a login wall all arrive as HTML. Dumping the
 * markup on screen — which is what happened — tells the reader nothing, and the
 * page title is usually the only part that names the cause.
 */
export function gatewayPageMessage(raw) {
  if (!/^\s*<(?:!doctype|html)/i.test(String(raw))) return null;
  const title = (String(raw).match(/<title[^>]*>([^<]*)<\/title>/i) || [])[1];
  return `The request never reached the copilot: a gateway answered with a web page` +
    `${title ? ` titled \u201c${title.trim()}\u201d` : ""} instead of an answer. ` +
    `That is almost always a timeout on a long analysis rather than a problem with the key.`;
}

/**
 * Ask the copilot. STREAMS, always.
 *
 * A full analysis takes tens of seconds to write. Waiting for the whole thing
 * before the first byte moves leaves the connection silent, and a gateway in
 * the middle kills a silent connection: the reader gets an HTML page saying
 * "Too much time has passed without sending any data for document" where the
 * analysis should have been. Streaming keeps bytes flowing from the first
 * token, so there is no silence to time out — and the answer can be shown as it
 * is written instead of all at once at the end.
 *
 * @param onDelta called with the text SO FAR each time more of it arrives
 * @returns the finished text
 */
export async function askAI(_key, messages, contextStr, onDelta) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      stream: true,
      system: SYSTEM_PROMPT + "\n\nLIVE CONTEXT (JSON):\n" + contextStr,
      messages,
    }),
  });

  // The happy path: server-sent events, one text delta at a time.
  if (r.ok && r.body && /text\/event-stream/i.test(r.headers.get("content-type") || "")) {
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const { text: more, rest } = sseDeltas(buf);
      buf = rest;
      if (more) { text += more; if (onDelta) onDelta(text); }
    }
    if (!text.trim()) throw new Error("The copilot returned an empty answer.");
    return text;
  }
  // The real API message is the only useful thing when this fails — a missing
  // workspace id, an expired key, a rate limit all say exactly what to fix.
  // Never replace it with a generic sentence.
  const raw = await r.text();
  let j = null;
  try { j = JSON.parse(raw); } catch { /* the proxy returned something that is not JSON */ }
  if (!j) {
    // An HTML page here is a GATEWAY talking, not the API: a timeout, a proxy
    // block or a login wall. Dumping its markup on screen tells the reader
    // nothing — keep the title, which usually names what happened, and say what
    // kind of failure it is.
    const gateway = gatewayPageMessage(raw);
    if (gateway) throw new Error(gateway);
    throw new Error(raw.trim().slice(0, 300) || `The copilot endpoint answered HTTP ${r.status} with an empty body.`);
  }
  if (j.error) {
    // The API's own sentence, plus what the proxy actually sent. Without the
    // second half "workspace id required" and "wrong key" read the same on
    // screen, and the person who has to fix it cannot tell which it is.
    const d = j.error.sent;
    const detail = d
      ? ` [ai.mjs sent: model ${d.model || "none"}, headers ${(d.headers || []).join(" ")}, anthropic-workspace-id ${d.workspaceHeader}]`
      : "";
    throw new Error((j.error.message || JSON.stringify(j.error).slice(0, 300)) + detail);
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${raw.trim().slice(0, 300)}`);
  return (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}
export function buildContext(ctx) {
  const { store, scan, news, ticker, legs, expKey, A, spot, seasonalSrc } = ctx;
  return JSON.stringify({
    date: new Date().toISOString().slice(0, 10),
    currentTicker: ticker,
    spot,
    currentStrategy: A ? { legs, expKey, entry: +(A.entry * 100).toFixed(0), maxProfit: +A.maxProfit.toFixed(0), maxLoss: +A.maxLoss.toFixed(0), breakevens: A.breakevens, greeks: { delta: +A.greeks.delta.toFixed(2), theta: +A.greeks.theta.toFixed(0), vega: +A.greeks.vega.toFixed(0) } } : null,
    paperPositions: store.positions.map((p) => ({ ticker: p.ticker, name: p.name, legs: p.legs, exp: p.expKey, entry: +(p.entryNet * 100).toFixed(0), maxProfit: +p.maxProfit.toFixed(0), maxLoss: +p.maxLoss.toFixed(0), openedAt: p.openedAt.slice(0, 10), thesis: p.thesis || null, timeline: (p.timeline || []).slice(-5).map((e) => e.text) })),
    scanner: (scan || []).map((s) => ({ tk: s.tk, seasonalMonthPct: +s.seasonalScore.toFixed(1), sentiment: s.sugg, source: s.real ? "real history" : "estimate",
      fourFactorSignal: s.fused ? { score: s.fused.score, confidence: s.fused.confidence, agreement: s.fused.agreement, narrative: s.fused.narrative } : null })),
    taggedNews: (news || []).slice(0, 10).map((n) => ({ title: n.title, geo: !!n.geo,
      impacts: (n.impacts || []).map((im) => ({ tk: im.tk, dir: ARROW[im.dir], why: im.why })) })),
    seasonalitySource: seasonalSrc,
  });
}
/**
 * THE CONVERSATION DOES NOT LIVE HERE.
 *
 * This panel is one of the five evidence panels on the Build screen, and it is
 * rendered only while it is the open one. Every other chip in that strip
 * UNMOUNTS it — so when `msgs`, `busy` and `err` were local state, tapping
 * another chip destroyed the answer, and an answer that arrived while the panel
 * was closed was thrown away by React before it could be shown. The reported
 * symptom was exactly that: "the analysis starts, nothing appears in the
 * Copilot tab, and if I change tab the run seems already finished or gone."
 *
 * So the conversation is owned by App.jsx and passed in. The panel is a view of
 * it, nothing more: a request that finishes while the panel is shut lands in the
 * app's state and is waiting when it is opened again, and the chip that opens it
 * can say so.
 *
 * @param convo    { msgs, busy, err } — owned by the caller
 * @param setConvo the caller's setter
 */
export function CopilotTab({ ctx, apiKey, convo, setConvo, onAnalysis }) {
  const { msgs = [], busy = false, err = null, partial = "" } = convo || {};
  const [input, setInput] = useState("");
  const send = async (text, label) => {
    if (!text.trim() || busy) return;
    if (!apiKey) { setConvo((c) => ({ ...c, err: "The copilot is not configured on the server." })); return; }
    const next = [...msgs, { role: "user", content: text }];
    setConvo({ msgs: next, busy: true, err: null, partial: "" });
    setInput("");
    try {
      // The answer is shown AS IT ARRIVES. A pre-trade analysis takes tens of
      // seconds to write, and a motionless "Thinking…" for that long is
      // indistinguishable from a hang — which is how the gateway timeout got
      // reported as "it does nothing" in the first place.
      const reply = await askAI(
        apiKey,
        next.map((m) => ({ role: m.role, content: m.content })),
        buildContext(ctx),
        (sofar) => setConvo((c) => ({ ...c, partial: sofar })));
      setConvo({ msgs: [...next, { role: "assistant", content: reply }], busy: false, err: null, partial: "" });
      // THE JOURNAL IS THE RECORD OF WHAT THE APP DID. An analysis run here is
      // part of that record — the Journal's report was already quoting "the
      // copilot's read" while these runs left no trace at all, so the two told
      // different stories about the same day.
      if (onAnalysis) onAnalysis({ label: label || "Question", prompt: text, answer: reply, ticker: ctx?.ticker || null });
    } catch (e) {
      // KEEP the question. Rolling `msgs` back to what it was before also
      // deleted what the user had just asked, so a failure looked like the tap
      // had never happened.
      setConvo({ msgs: next, busy: false, err: String(e.message || e), partial: "" });
    }
  };
  /** Print what is on screen. The browser's own dialog also saves to PDF. */
  const printConvo = () => {
    const w = window.open("", "_blank");
    if (!w) return;
    const esc = (x) => String(x).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
    const body = msgs.map((m) => m.role === "user"
      ? `<h2>${esc(m.content)}</h2>`
      : `<div class="a">${esc(m.content)
        .replace(/^#{1,4}\s+(.*)$/gm, "<h3>$1</h3>")
        .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
        .replace(/^[-*]\s+(.*)$/gm, "<li>$1</li>")
        .replace(/\n{2,}/g, "<br/><br/>")}</div>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Copilot analysis</title><style>
      body{font-family:Georgia,serif;color:#1c2128;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.6}
      h1{font-size:20px;border-bottom:2px solid #b07d18;padding-bottom:6px}
      h2{font-size:13px;color:#555;font-family:ui-monospace,monospace;margin:22px 0 6px}
      h3{font-size:12px;color:#b07d18;letter-spacing:.06em;text-transform:uppercase;margin:14px 0 4px}
      .a{font-size:13.5px} li{font-size:13px}
      @media print{.noprint{display:none}}</style></head><body>
      <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">Print or save as PDF</button>
      <h1>Copilot analysis — ${esc(ctx?.ticker || "")} · ${esc(new Date().toLocaleString("en-GB"))}</h1>
      ${body}
      <p style="font-size:11px;color:#777;margin-top:24px">Paper trading only. Educational analysis, not financial advice.</p>
      </body></html>`);
    w.document.close();
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><Sparkles size={11} style={{ verticalAlign: "-1px" }} /> AI COPILOT · IT ALREADY KNOWS YOUR POSITIONS</Lbl>
          {msgs.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small ghost color={T.blue} onClick={printConvo}><FileText size={11} /> Print</Btn>
              <Btn small ghost onClick={() => setConvo({ msgs: [], busy: false, err: null })}><Trash2 size={11} /> Clear</Btn>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {SKILLS.map((sk) => <Btn key={sk.id} small ghost color={T.blue} onClick={() => send(sk.prompt, sk.label)} disabled={busy}>{sk.label}</Btn>)}
        </div>
        {/* No fixed-height window. An analysis is meant to be READ, and a 420px
            box on a desktop turned every answer into a peephole. It grows with
            the answer; the page scrolls, as pages do. */}
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          {msgs.length === 0 && !busy && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Pick one above or just ask. The copilot already knows your open positions, the trade on the Build screen, the Radar, the tagged news and your own risk rules.</div>}
          {msgs.map((m, i) => (
            <div key={i} style={{ padding: m.role === "user" ? "9px 11px" : "11px 13px", borderRadius: 7, background: m.role === "user" ? `${T.blue}14` : T.bg, border: `1px solid ${m.role === "user" ? T.blue + "44" : T.line}` }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: m.role === "user" ? T.blue : T.amber, marginBottom: m.role === "user" ? 3 : 7 }}>{m.role === "user" ? "YOU ASKED" : "COPILOT"}</div>
              {m.role === "user"
                ? <div style={{ fontSize: 12.5, color: T.body, lineHeight: 1.5 }}>{m.content}</div>
                : <Markdown text={m.content} />}
            </div>
          ))}
          {busy && (
            partial
              ? (
                <div style={{ padding: "11px 13px", borderRadius: 7, background: T.bg, border: `1px solid ${T.line}` }}>
                  <div style={{ ...mono, fontSize: 9, letterSpacing: "0.1em", color: T.amber, marginBottom: 7 }}>COPILOT · WRITING</div>
                  <Markdown text={partial} />
                </div>
              )
              : (
                <div style={{ ...mono, fontSize: 11, color: T.amber }}>
                  Thinking… you can close this panel: the answer waits here, it is not lost.
                </div>
              )
          )}
        </div>
        {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Inp value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask a question… (Enter to send)" style={{ flex: 1 }} />
          <Btn onClick={() => send(input)} disabled={busy}><Send size={13} /></Btn>
        </div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
          Every analysis you run here is filed in the Journal with its question, so the Journal and this panel tell the
          same story about the same day. Educational analysis on a paper account, not financial advice.
        </div>
      </Panel>
    </div>
  );
}

/* ================================================================
   5) REPORT CENTER: routine schedulata + export + webhook
================================================================ */
export function buildReportMd(ctx, weatherSig, aiText) {
  const { store, scan, news, seasonalSrc } = ctx;
  const d = new Date().toLocaleString("en-GB");
  const L = [];
  L.push(`# Commodity Options Report — ${d}\n`);
  L.push(`## 1 · Opportunities (seasonal scanner)`);
  (scan || []).slice(0, 3).forEach((s, i) => L.push(`${i + 1}. **${s.tk}** — seasonal ${s.seasonalScore > 0 ? "+" : ""}${s.seasonalScore.toFixed(1)}%/mo (${s.real ? "real history" : "estimate"}) → leaning **${s.sugg.toUpperCase()}**`));
  L.push(`\n## 2 · Positions against the rules (${ruleBadge()})`);
  if (!store.positions.length) L.push("No open positions.");
  store.positions.forEach((p) => {
    const dte = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
    L.push(`- **${p.ticker} · ${p.name}** — expires ${p.expKey || "n/a"} (${dte} days)${dte <= RULES.exitDTE ? ` ⚠ **${RULES.exitDTE} days or fewer: close or roll**` : ""} · opened at ${fmt$(Math.abs(p.entryNet) * 100)} · can make ${fmt$(p.maxProfit)} / can lose ${fmt$(p.maxLoss)}`);
  });
  if (store.positions.length) {
    const totRisk = store.positions.reduce((a, p) => a + Math.abs(p.maxLoss), 0);
    const totMaxP = store.positions.reduce((a, p) => a + Math.max(0, p.maxProfit), 0);
    L.push(`\n**Across everything:** ${fmt$(totRisk)} at risk · up to ${fmt$(totMaxP)} to be made`);
  }
  L.push(`\n## 3 · Headlines that matter (cause → effect, politics included)`);
  (news || []).filter((n) => (n.impacts || []).length).slice(0, 8).forEach((n) => {
    L.push(`- ${n.title} ${n.geo ? "(policy)" : ""}\n  ${(n.impacts || []).map((im) => `**${im.tk} ${ARROW[im.dir]}** (${im.why})`).join(" · ")}`);
  });
  L.push(`\n## 4 · Weather → commodities (next 14 days)`);
  (weatherSig || []).forEach((s) => L.push(`- **${s.tks.join("+")} ${s.dir}** — ${s.region}: ${s.why}`));
  if (aiText) { L.push(`\n## 5 · The copilot\u2019s read`); L.push(aiText); }
  // The analyses run from the Copilot panel are part of the same record. The
  // report used to carry only its OWN model call, so a day with three pre-trade
  // analyses on it produced a report that mentioned none of them.
  const runs = (store.copilotLog || []).slice(0, 5);
  if (runs.length) {
    L.push(`\n## 6 \u00b7 Analyses you ran in the copilot`);
    runs.forEach((c) => {
      L.push(`\n### ${c.label || "Question"}${c.ticker ? ` \u2014 ${c.ticker}` : ""} \u00b7 ${new Date(c.t).toLocaleString("en-GB")}`);
      L.push(`_Asked:_ ${String(c.prompt).slice(0, 300)}`);
      L.push(String(c.answer || ""));
    });
  }
  L.push(`\n---\n_Seasonality source: ${seasonalSrc}. Paper trading only. Educational software, not financial advice._`);
  return L.join("\n");
}
function svgPayoff(legs, entryNet, S0) {
  const lo = S0 * 0.8, hi = S0 * 1.2, W = 300, H = 80, N = 60;
  const ys = [];
  for (let i = 0; i <= N; i++) {
    const s = lo + (i / N) * (hi - lo);
    ys.push((legs.reduce((a, l) => a + Math.sign(l.side) * l.qty * (l.type === "call" ? Math.max(s - l.strike, 0) : Math.max(l.strike - s, 0)), 0) - entryNet) * 100);
  }
  const ymin = Math.min(...ys), ymax = Math.max(...ys), yr = Math.max(1, ymax - ymin);
  const pt = (i) => `${(i / N * W).toFixed(1)},${(H - (ys[i] - ymin) / yr * H).toFixed(1)}`;
  const d = ys.map((_, i) => (i ? "L" : "M") + pt(i)).join("");
  const zy = H - (0 - ymin) / yr * H;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><line x1="0" x2="${W}" y1="${zy}" y2="${zy}" stroke="#bbb"/><path d="${d}" fill="none" stroke="#b07d18" stroke-width="2"/></svg>`;
}
export function exportPdf(ctx, md) {
  const { store } = ctx;
  const posHtml = store.positions.map((p2) => `
    <div class="pos"><h3>${p2.ticker} · ${p2.name}</h3>
      ${svgPayoff(p2.legs, p2.entryNet, p2.entrySpot)}
      <p class="m">${p2.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · exp ${p2.expKey || "n/d"} · max profit $${p2.maxProfit?.toFixed(0)} · max loss $${Math.abs(p2.maxLoss)?.toFixed(0)}</p>
      ${(p2.timeline || []).slice(-4).map((e) => `<p class="tl">${new Date(e.t).toLocaleDateString("en-GB")} · ${e.text.replace(/\[approva:.*?\]/, "")}</p>`).join("")}
    </div>`).join("");
  const body = md
    .replace(/^# (.*)$/gm, "<h1>$1</h1>").replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>").replace(/_(.*?)_/g, "<i>$1</i>")
    .replace(/^- (.*)$/gm, "<li>$1</li>").replace(/\n{2,}/g, "<br/>");
  const w = window.open("", "_blank");
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Report</title><style>
    body{font-family:Georgia,serif;color:#1c2128;max-width:760px;margin:24px auto;padding:0 16px;line-height:1.5}
    h1{font-size:22px;border-bottom:2px solid #b07d18;padding-bottom:6px} h2{font-size:15px;color:#b07d18;letter-spacing:.05em;margin-top:22px}
    h3{font-size:13px;margin:14px 0 4px} li{font-size:12.5px} .m{font-family:monospace;font-size:11px;color:#555;margin:4px 0}
    .tl{font-family:monospace;font-size:10.5px;color:#777;margin:2px 0} .pos{page-break-inside:avoid;border:1px solid #ddd;border-radius:6px;padding:10px 14px;margin:10px 0}
    @media print {.noprint{display:none}}</style></head><body>
    <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">Print or save as PDF</button>
    ${body}<h2>Positions in detail</h2>${posHtml || "<p>No open positions.</p>"}
    </body></html>`);
  w.document.close();
}
export function ReportTab({ ctx, apiKey, setSetting }) {
  const { store } = ctx;
  const cfg = { freq: store.settings.reportFreq || "weekly", last: store.settings.reportLast || 0 };
  const [md, setMd] = useState(store.settings.reportLastMd || "");
  const [busy, setBusy] = useState(false);
  const [useAI, setUseAI] = useState(!!apiKey);
  // A report that writes ITSELF has to say that it did. This one runs on the
  // effect below whenever one is due, so a user who opened the Journal and
  // found a document where there had been nothing had no way to know whether he
  // had caused it, whether the copilot had put it there, or what it was.
  const [autoRan, setAutoRan] = useState(false);
  const dueMs = cfg.freq === "daily" ? 864e5 : 6048e5;
  const isDue = Date.now() - cfg.last > dueMs;
  const gen = async () => {
    setBusy(true);
    let wsig = [];
    try { wsig = weatherSignals(await fetchWeather()); } catch { /* meteo opzionale */ }
    let ai = null;
    if (useAI && apiKey) {
      try { ai = await askAI(apiKey, [{ role: "user", content: "Write the narrative section of the periodic report: what happened this week, what to prioritise on the open positions, two opportunities from the radar, and the political or weather risks to watch. Bullet points, 250 words maximum." }], buildContext(ctx)); }
      catch (e) { ai = `(the copilot could not be reached: ${e.message})`; }
    }
    const out = buildReportMd(ctx, wsig, ai);
    setMd(out);
    setSetting("reportLast", Date.now());
    setSetting("reportLastMd", out);
    setBusy(false);
  };
  useEffect(() => { if (isDue && (ctx.scan || []).length) { setAutoRan(true); gen(); } }, []); // eslint-disable-line — auto all'apertura se scaduto
  const download = () => {
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
  };
  const toWebhook = async () => {
    try {
      await fetch(store.settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "Commodity Options Report", markdown: md, generatedAt: new Date().toISOString() }) });
      ctx.setMsg("Report sent to your webhook.");
    } catch (e) { ctx.setMsg(`The webhook failed: ${e.message}`); }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><FileText size={11} style={{ verticalAlign: "-1px" }} /> REPORTS · {cfg.freq === "daily" ? "DAILY" : "WEEKLY"} {isDue ? "· ⚠ DUE NOW" : "· ✓ UP TO DATE"}</Lbl>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Sel value={cfg.freq} onChange={(e) => setSetting("reportFreq", e.target.value)}>
              <option value="daily">Every day</option><option value="weekly">Every week</option>
            </Sel>
            <Btn small onClick={gen} disabled={busy}><RefreshCw size={11} /> {busy ? "Writing…" : "Write it now"}</Btn>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...mono, fontSize: 11, color: T.mut, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> include the copilot's read
          </label>
          <span style={{ ...mono, fontSize: 10, color: T.dim }}>last one: {cfg.last ? new Date(cfg.last).toLocaleString("en-GB") : "never"}</span>
        </div>
        {autoRan && (
          <div style={{ ...mono, fontSize: 10.5, color: T.blue, marginTop: 8, padding: "7px 9px", background: `${T.blue}0f`, border: `1px solid ${T.blue}44`, borderRadius: 6, lineHeight: 1.6 }}>
            This report wrote ITSELF just now, because the {cfg.freq === "daily" ? "daily" : "weekly"} one was due and
            you opened the Journal. Nothing was sent anywhere{useAI ? ", and section 5 is the copilot's read — the same model as the Copilot panel, asked a different question" : ""}. Press "Write it now" to redo it.
          </div>
        )}
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>
          Each report covers: scanner opportunities, your positions against the rules, tagged headlines, weather effects, and optionally the copilot's read. It rewrites itself when you reopen the app and one is due.
        </div>
      </Panel>
      {md && (
        <Panel style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Lbl>PREVIEW</Lbl>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small ghost onClick={download}><Download size={11} /> .md</Btn>
              <Btn small color={T.amber} onClick={() => exportPdf(ctx, md)}><FileText size={11} /> Export PDF</Btn>
              {store.settings.webhook && <Btn small ghost color={T.violet} onClick={toWebhook}><Send size={11} /> Send to webhook</Btn>}
            </div>
          </div>
          <pre style={{ ...mono, fontSize: 11.5, color: T.body, whiteSpace: "pre-wrap", marginTop: 10, maxHeight: 460, overflowY: "auto" }}>{md}</pre>
        </Panel>
      )}
    </div>
  );
}

/* ================================================================
   6) OPTIMIZER: scaling per obiettivo di ricavo o budget di premio
================================================================ */
export function scaleStrategy(a, mode, amt) {
  const risk = Math.abs(a.maxLoss);              // capitale a rischio per 1 combo ($)
  const prem = Math.abs(a.entry) * 100;          // premio per 1 combo ($, da chain reale)
  const isCredit = a.entry < 0;
  if (!Number.isFinite(risk) || risk <= 0 || !Number.isFinite(a.maxProfit) || a.maxProfit <= 0) return null;
  // Budget = premio max da pagare (debit) oppure capitale a rischio (credit, dove il premio si incassa)
  const unit = isCredit ? risk : Math.max(prem, 1);
  let n;
  if (mode === "budget") n = Math.floor(amt / unit);
  else n = Math.ceil(amt / a.maxProfit);
  if (!Number.isFinite(n) || n < 1) return { n: 0, ok: false, risk, prem, isCredit, unit };
  return { n, ok: true, isCredit, totProfit: n * a.maxProfit, totRisk: n * risk, totPrem: n * prem, prem, risk, unit };
}
// Probabilità di profitto a scadenza (stile "chance"): lognormale con IV reale della chain
export function probProfit(curve, S, sigma, dte) {
  if (!curve?.length || !S || !sigma || sigma <= 0 || dte <= 0) return null;
  const Tyr = dte / 365, r = 0.045;
  const sq = sigma * Math.sqrt(Tyr);
  const mu = Math.log(S) + (r - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => 0.5 * (1 + erf((Math.log(x) - mu) / (sq * Math.SQRT2)));
  let p = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].exp > 0 || curve[i + 1].exp > 0) p += Math.max(0, cdf(curve[i + 1].s) - cdf(curve[i].s));
  }
  if (curve[0].exp > 0) p += cdf(curve[0].s);                       // coda sinistra
  if (curve[curve.length - 1].exp > 0) p += 1 - cdf(curve[curve.length - 1].s); // coda destra
  return Math.min(1, Math.max(0, p));
}

/* ================================================================
   7) POSITION GUARDIAN — TIS, Exit Path Simulator, Exit Ladder, Timeline
================================================================ */
// Thesis Integrity Score 0-100, scomposto
export function computeTIS(pos, cur) {
  // cur: { pop, ivNow, seasonalNow, dteLeft, vegaSign }
  const th = pos.thesis || {};
  const comp = [];
  // 1) PoP vs entry (40)
  let popPts = 20;
  if (th.pop != null && cur.pop != null && th.pop > 0) popPts = Math.round(Math.max(0, Math.min(1.2, cur.pop / th.pop)) / 1.2 * 40);
  comp.push({ k: "Chance of profit", pts: popPts, max: 40, note: cur.pop != null ? `${(cur.pop * 100).toFixed(0)}% now versus ${th.pop != null ? (th.pop * 100).toFixed(0) : "?"}% when you opened it` : "n/a" });
  // 2) Stagionalità (20)
  let seaPts = 10;
  if (th.seasonal != null && cur.seasonalNow != null) {
    const same = Math.sign(th.seasonal) === Math.sign(cur.seasonalNow) || th.seasonal === 0;
    seaPts = same ? (Math.abs(cur.seasonalNow) >= Math.abs(th.seasonal) * 0.5 ? 20 : 12) : 4;
  }
  comp.push({ k: "Season", pts: seaPts, max: 20, note: `${th.seasonal?.toFixed?.(1) ?? "?"}%/mo when you opened it → ${cur.seasonalNow?.toFixed?.(1) ?? "?"}%/mo now` });
  // 3) IV a favore (20): vega+ vuole IV su, vega- IV giù
  let ivPts = 10;
  if (th.iv != null && cur.ivNow != null && cur.vegaSign) {
    const dIV = cur.ivNow - th.iv;
    const fav = cur.vegaSign * dIV;
    ivPts = fav > 0.01 ? 20 : fav < -0.02 ? 2 : 10;
  }
  comp.push({ k: "Market nerves", pts: ivPts, max: 20, note: `${th.iv != null ? (th.iv * 100).toFixed(0) : "?"}% → ${cur.ivNow != null ? (cur.ivNow * 100).toFixed(0) : "?"}%, and this trade ${cur.vegaSign > 0 ? "wants that to rise" : "wants that to fall"}` });
  // 4) Tempo (20)
  const dtePts = cur.dteLeft > RULES.exitDTE * 2 ? 20 : cur.dteLeft > RULES.exitDTE ? 10 : 0;
  comp.push({ k: "Time left", pts: dtePts, max: 20, note: `${cur.dteLeft} days (the rule closes it at ${RULES.exitDTE})` });
  const tis = comp.reduce((a, c) => a + c.pts, 0);
  return { tis, comp };
}

// Exit Path Simulator: MC giornaliero DA OGGI, regole da src/rules.js
export function exitPathSim(pos, S, dteLeft, iv, sigma, nSim = 2000) {
  const { legs, entryNet, maxProfit, maxLoss } = pos;
  const tp = RULES.takeProfitPct * maxProfit, sl = RULES.stopLossPct * maxLoss;
  const days = Math.max(1, dteLeft - RULES.exitDTE);
  const dt = 1 / 365, sq = sigma * Math.sqrt(dt);
  let nTP = 0, nSL = 0, nTimePos = 0, nTimeNeg = 0, sumExit = 0;
  const tpDays = [];
  for (let i = 0; i < nSim; i++) {
    let s = S, done = false;
    for (let d = 1; d <= days; d++) {
      let u = 0, v = 0;
      while (u === 0) u = Math.random(); while (v === 0) v = Math.random();
      const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      s = s * Math.exp(-0.5 * sigma * sigma * dt + sq * z);
      const pnl = (netBS(legs, s, dteLeft - d, iv) - entryNet) * 100;
      if (pnl >= tp) { nTP++; tpDays.push(d); sumExit += pnl; done = true; break; }
      if (pnl <= sl) { nSL++; sumExit += pnl; done = true; break; }
    }
    if (!done) {
      const pnl = (netBS(legs, s, 7, iv) - entryNet) * 100;
      if (pnl > 0) nTimePos++; else nTimeNeg++;
      sumExit += pnl;
    }
  }
  tpDays.sort((a, b) => a - b);
  return {
    pTP: nTP / nSim, pSL: nSL / nSim, pTimePos: nTimePos / nSim, pTimeNeg: nTimeNeg / nSim,
    evExit: sumExit / nSim, medTPdays: tpDays.length ? tpDays[Math.floor(tpDays.length / 2)] : null,
    pWin: (nTP + nTimePos) / nSim, horizon: days,
  };
}

// Exit Ladder: prezzo netto combo per target P&L
export const ladderNet = (entryNet, targetPnl) => entryNet + targetPnl / 100;

export function GuardianPanel({ pos, spot, dteLeft, ivNow, sigma, seasonalNow, pnlNow, popNow, vegaSign, alpaca, quoteFn, buildOcc, setMsg, logEvent, gate }) {
  const [sim, setSim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ladderBusy, setLadderBusy] = useState(null);
  const { tis, comp } = computeTIS(pos, { pop: popNow, ivNow, seasonalNow, dteLeft, vegaSign });
  const tisColor = tis >= 70 ? T.green : tis >= 40 ? T.amber : T.red;
  useEffect(() => {
    if (tis < 40) logEvent(pos.id, "tis-low", `The reason you opened this has weakened to ${tis}/100 — consider trimming or closing`);
  }, [tis]); // eslint-disable-line
  const runSim = () => {
    setBusy(true);
    setTimeout(() => { setSim(exitPathSim(pos, spot, dteLeft, ivNow || 0.25, sigma)); setBusy(false); }, 30);
  };
  const placeExit = async (label, targetPnl) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }   // order path 4 of six
    setLadderBusy(label);
    try {
      // Ogni gradino della scala e' un ordine su Alpaca: passa dal cancello.
      const g = runGate(gate, { intent: "close", ticker: pos.ticker, legs: pos.legs,
        dte: dteLeft, contracts: 1, maxLoss: pos.maxLoss, maxProfit: pos.maxProfit, pnl: pnlNow });
      if (!g.pass) { setMsg(`Risk gate: the ${label} order was not sent. ${g.violations.map((v) => v.message).join(" ")}`); setLadderBusy(null); return; }
      for (const w of g.warnings) logEvent(pos.id, "gate-warning", w.message);
      const net = ladderNet(pos.entryNet, targetPnl);
      const mlegs = pos.legs.map((l) => {
        const q = quoteFn ? quoteFn(l) : null;
        const occ = q?.occ || (pos.expKey ? buildOcc(pos.ticker, pos.expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("live prices are needed to name the contracts");
        return { symbol: occ, ratio_qty: String(l.qty), side: l.side > 0 ? "sell" : "buy", position_intent: l.side > 0 ? "sell_to_close" : "buy_to_close" };
      });
      let body;
      if (mlegs.length === 1) {
        body = { symbol: mlegs[0].symbol, qty: mlegs[0].ratio_qty, side: mlegs[0].side, type: "limit", time_in_force: "gtc", limit_price: (Math.abs(net) / (+mlegs[0].ratio_qty || 1)).toFixed(2) };
      } else if (mlegs.length > 4) { throw new Error("Alpaca takes at most 4 legs per order"); }
      else {
        body = { order_class: "mleg", qty: "1", type: "limit", time_in_force: "gtc", limit_price: Math.abs(net).toFixed(2), legs: mlegs };
      }
      const o = await alpacaReq("/v2/orders", "POST", body);
      setMsg(`${label} exit order placed at $${Math.abs(net).toFixed(2)}, standing until you cancel it (${o.id?.slice(0, 8)}…)`);
      logEvent(pos.id, "ladder", `${label} exit order placed at $${Math.abs(net).toFixed(2)}`);
    } catch (e) { setMsg(`The ${label} exit order failed: ${e.message}`); }
    setLadderBusy(null);
  };
  const pct = pos.maxProfit > 0 && pnlNow != null ? Math.max(-100, Math.min(130, (pnlNow / pos.maxProfit) * 100)) : null;
  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: `${T.bg}`, border: `1px solid ${tisColor}44`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>IS THE REASON STILL GOOD?</div>
          <div style={{ ...mono, fontSize: 22, fontWeight: 800, color: tisColor }}>{tis}<span style={{ fontSize: 11, color: T.dim }}>/100</span></div>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          {comp.map((c) => (
            <div key={c.k} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
              <span style={{ ...mono, fontSize: 9, color: T.mut, width: 130 }}>{c.k}</span>
              <div style={{ flex: 1, height: 4, background: T.line, borderRadius: 2 }}>
                <div style={{ width: `${(c.pts / c.max) * 100}%`, height: 4, background: c.pts / c.max >= 0.7 ? T.green : c.pts / c.max >= 0.4 ? T.amber : T.red, borderRadius: 2 }} />
              </div>
              <span title={c.note} style={{ ...mono, fontSize: 9, color: T.dim, cursor: "help" }}>{c.pts}/{c.max}</span>
            </div>
          ))}
        </div>
      </div>
      {pct != null && (
        <div style={{ marginTop: 8 }}>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>PROGRESS TOWARDS THE MAXIMUM · {takeProfitLabel()} · rest out at {scaleOutLabel()}</div>
          <div style={{ position: "relative", height: 10, background: T.line, borderRadius: 5, marginTop: 3 }}>
            <div style={{ position: "absolute", left: `${(RULES.takeProfitPct * 100 + 100) / 230 * 100}%`, width: 1, top: -2, bottom: -2, background: T.amber }} title={takeProfitLabel()} />
            <div style={{ position: "absolute", left: `${(RULES.scaleOutPct * 100 + 100) / 230 * 100}%`, width: 1, top: -2, bottom: -2, background: T.green }} title={scaleOutLabel()} />
            <div style={{ width: `${Math.max(0, (pct + 100) / 230 * 100)}%`, height: 10, borderRadius: 5, background: pnlNow >= 0 ? `${T.green}bb` : `${T.red}bb` }} />
          </div>
          <div style={{ ...mono, fontSize: 10, color: pnlNow >= 0 ? T.green : T.red, marginTop: 2 }}>{pct.toFixed(0)}% of the maximum ({fmt$(pnlNow)})</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small ghost color={T.blue} onClick={runSim} disabled={busy}>{busy ? "Simulating…" : "▶ How does this end?"}</Btn>
        {alpaca && (<>
          <Btn small ghost color={T.green} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(takeProfitLabel(), RULES.takeProfitPct * pos.maxProfit)} disabled={!!ladderBusy || DEMO}>GTC {takeProfitLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.takeProfitPct * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.green} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(`TP ${scaleOutLabel()}`, RULES.scaleOutPct * pos.maxProfit)} disabled={!!ladderBusy || DEMO}>GTC TP {scaleOutLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.scaleOutPct * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.red} title={DEMO ? DEMO_TOOLTIP : undefined} onClick={() => placeExit(stopLossLabel(), RULES.stopLossPct * pos.maxLoss)} disabled={!!ladderBusy || DEMO}>{stopLossLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.stopLossPct * pos.maxLoss)).toFixed(2)}</Btn>
        </>)}
      </div>
      {sim && (
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", padding: "8px 10px", background: `${T.blue}0d`, borderRadius: 6 }}>
          <Stat k={`HITS ${takeProfitLabel()} FIRST`} v={`${(sim.pTP * 100).toFixed(0)}%`} c={T.green} />
          <Stat k={`HITS ${stopLossLabel()} FIRST`} v={`${(sim.pSL * 100).toFixed(0)}%`} c={T.red} />
          <Stat k={`RUNS TO ${exitDTELabel()} IN PROFIT`} v={`${(sim.pTimePos * 100).toFixed(0)}%`} c={T.green} />
          <Stat k={`RUNS TO ${exitDTELabel()} AT A LOSS`} v={`${(sim.pTimeNeg * 100).toFixed(0)}%`} c={T.red} />
          <Stat k="TYPICAL DAYS TO TARGET" v={sim.medTPdays ?? "—"} c={T.blue} />
          <Stat k="AVERAGE RESULT FOLLOWING THE RULES" v={fmt$(sim.evExit)} c={sim.evExit >= 0 ? T.green : T.red} />
          <Stat k="TAKE IT NOW OR WAIT?" v={pnlNow != null ? (pnlNow >= sim.evExit ? "→ TAKE IT NOW" : "→ WAIT") : "—"} c={T.amber} />
        </div>
      )}
      {(pos.timeline || []).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>TIMELINE</div>
          {(pos.timeline || []).slice(-6).map((e, i) => (
            <div key={i} style={{ ...mono, fontSize: 10, color: T.mut, marginTop: 2 }}>
              <span style={{ color: T.dim }}>{new Date(e.t).toLocaleDateString("en-GB")}</span> · {e.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   8) PRICE CHART — candele sottostante stile piattaforma pro
================================================================ */

export function PriceChart({ ticker, levels, breakevens, entrySpot, legLines, height = 320 }) {
  const ref = React.useRef(null);
  const [meta, setMeta] = useState(null);
  const [err, setErr] = useState(null);
  const [range, setRange] = useState(180);
  useEffect(() => {
    let chart, dead = false;
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?sym=${encodeURIComponent(ticker)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (dead || !ref.current) return;
        ref.current.innerHTML = "";
        chart = createChart(ref.current, {
          height,
          layout: { background: { color: T.bg }, textColor: T.mut, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 },
          grid: { vertLines: { color: T.line }, horzLines: { color: T.line } },
          rightPriceScale: { borderColor: T.line },
          timeScale: { borderColor: T.line },
          crosshair: { mode: 0 },
        });
        const bars = j.bars.slice(-range);
        const candles = chart.addSeries(CandlestickSeries, {
          upColor: T.green, downColor: T.red, borderUpColor: T.green, borderDownColor: T.red,
          wickUpColor: T.green, wickDownColor: T.red,
        });
        candles.setData(bars);
        const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", color: T.dim, priceFormat: { type: "volume" } });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: `${b.close >= b.open ? T.green : T.red}44` })));
        const line = (price, color, title) => candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
        (legLines || []).forEach((lg) => {
          candles.createPriceLine({ price: lg.price, color: lg.side > 0 ? T.green : T.red, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: lg.label });
        });
        (levels?.supports || []).forEach((p) => line(p, T.green, "support"));
        (levels?.resistances || []).forEach((p) => line(p, T.red, "resistance"));
        (breakevens || []).forEach((p) => line(p, T.blue, "break even"));
        if (entrySpot) line(entrySpot, T.amber, "your entry");
        chart.timeScale().fitContent();
        setMeta({ n: bars.length, source: j.source, last: bars[bars.length - 1] });
        const ro = new ResizeObserver(() => chart.applyOptions({ width: ref.current?.clientWidth || 600 }));
        ro.observe(ref.current);
      } catch (e) { if (!dead) setErr(String(e.message || e)); }
    })();
    return () => { dead = true; chart?.remove?.(); };
  }, [ticker, range, JSON.stringify(levels), JSON.stringify(breakevens), JSON.stringify(legLines), entrySpot]); // eslint-disable-line
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>{ticker} · DAILY PRICES {meta ? `· ${meta.source} (delayed)` : ""}</Lbl>
        <div style={{ display: "flex", gap: 4 }}>
          {[90, 180, 365].map((d) => (
            <Btn key={d} small ghost={range !== d} onClick={() => setRange(d)}>{d === 90 ? "3M" : d === 180 ? "6M" : "1Y"}</Btn>
          ))}
        </div>
      </div>
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8, borderRadius: 6, overflow: "hidden" }} />
      {meta?.last && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Latest: {meta.last.time} · open {meta.last.open} high {meta.last.high} low {meta.last.low} close {meta.last.close} · the lines are where the market is positioned (green and red), your break-even (blue) and your entry (amber)</div>}
    </div>
  );
}

/* ================================================================
   9) CHAIN MATRIX — tabella chain completa cliccabile (stile pro)
================================================================ */
export function ChainMatrix({ chain, expKey, spot, legs, onCell }) {
  const [width, setWidth] = useState(0.12);
  if (!chain || !expKey || !chain.byExp[expKey] || !spot) return null;
  const e = chain.byExp[expKey];
  // No open interest, no OI column. A column of dashes is a promise the feed
  // cannot keep, and it costs width the strikes need on a phone.
  const oi = hasOpenInterest(chain);
  const ks = Array.from(new Set([...Object.keys(e.calls), ...Object.keys(e.puts)].map(Number)))
    .sort((a, b) => a - b)
    .filter((k) => k >= spot * (1 - width) && k <= spot * (1 + width));
  const legAt = (k, t) => legs.find((l) => l.strike === k && l.type === t);
  const cell = (k, t) => {
    const q = e[t === "call" ? "calls" : "puts"][k];
    const lg = legAt(k, t);
    const bgc = lg ? (lg.side > 0 ? `${T.green}26` : `${T.red}26`) : "transparent";
    const itm = t === "call" ? k < spot : k > spot;
    return (
      <td key={t + k} onClick={() => onCell(k, t)}
        style={{ padding: "4px 6px", cursor: "pointer", background: bgc, borderBottom: `1px solid ${T.line}`, textAlign: t === "call" ? "right" : "left", opacity: q ? 1 : 0.35, borderLeft: t === "put" ? `1px solid ${T.line}` : "none", borderRight: t === "call" ? `1px solid ${T.line}` : "none", boxShadow: itm ? `inset 0 0 0 100px ${T.blue}0a` : "none" }}>
        {q ? (
          <span style={{ ...mono, fontSize: 10.5 }}>
            <b style={{ color: lg ? (lg.side > 0 ? T.green : T.red) : T.ink }}>{q.mid != null ? q.mid.toFixed(2) : "—"}</b>
            <span style={{ color: T.dim }}> · {q.iv ? (q.iv * 100).toFixed(0) + "%" : "—"}{oi ? ` · OI ${q.oi ?? "—"}` : ""}</span>
            {lg && <b style={{ color: lg.side > 0 ? T.green : T.red }}> {lg.side > 0 ? "＋BUY" : "−SELL"}{lg.qty > 1 ? "×" + lg.qty : ""}</b>}
          </span>
        ) : <span style={{ ...mono, fontSize: 10, color: T.dim }}>—</span>}
      </td>
    );
  };
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>{expKey} · TAP A PRICE: ONCE TO BUY · TWICE TO SELL · A THIRD TIME TO REMOVE</Lbl>
        <div style={{ display: "flex", gap: 4 }}>
          {[[0.06, "±6%"], [0.12, "±12%"], [0.25, "±25%"]].map(([v, l]) => (
            <Btn key={l} small ghost={width !== v} onClick={() => setWidth(v)}>{l}</Btn>
          ))}
        </div>
      </div>
      <div style={{ overflowX: "auto", marginTop: 8, border: `1px solid ${T.line}`, borderRadius: 7 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", background: T.bg }}>
          <thead>
            <tr style={{ ...mono, fontSize: 9, color: T.dim }}>
              <th style={{ padding: "5px 6px", textAlign: "right" }}>CALL · mid · IV{oi ? " · OI" : ""}</th>
              <th style={{ padding: "5px 6px", textAlign: "center" }}>STRIKE</th>
              <th style={{ padding: "5px 6px", textAlign: "left" }}>PUT · mid · IV{oi ? " · OI" : ""}</th>
            </tr>
          </thead>
          <tbody>
            {ks.map((k) => (
              <tr key={k} style={{ background: Math.abs(k - spot) === Math.min(...ks.map((x) => Math.abs(x - spot))) ? `${T.amber}12` : "transparent" }}>
                {cell(k, "call")}
                <td style={{ ...mono, fontSize: 11.5, fontWeight: 800, color: T.ink, textAlign: "center", padding: "4px 8px", borderBottom: `1px solid ${T.line}` }}>{k}</td>
                {cell(k, "put")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* This was written as JSX text containing `\u2019` and `${spot.toFixed(2)}`,
          neither of which JSX interpolates: the escape and the expression were
          both printed on screen, literally. It is one expression now. */}
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>
        {`The highlighted row is the strike nearest today\u2019s price ($${spot.toFixed(2)}). A blue tint means the option already has value. ${sourceNote(chain)}.${oi ? ` ${openInterestNote(chain)}` : ""}`}
      </div>
    </div>
  );
}

/* ================================================================
   10) OPTION PANEL — storico prezzo del singolo contratto (stile Fiuto)
================================================================ */
export function OptionPanel({ occ, label, quote, onClose }) {
  const ref = React.useRef(null);
  const [err, setErr] = useState(null);
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let chart, dead = false;
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?occ=${encodeURIComponent(occ)}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        if (dead || !ref.current) return;
        ref.current.innerHTML = "";
        chart = createChart(ref.current, {
          height: 190,
          layout: { background: { color: T.bg }, textColor: T.mut, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 },
          grid: { vertLines: { color: T.line + "55" }, horzLines: { color: T.line + "55" } },
          rightPriceScale: { borderColor: T.line }, timeScale: { borderColor: T.line },
        });
        const ls = chart.addSeries(LineSeries, { color: T.violet, lineWidth: 2 });
        ls.setData(j.bars);
        chart.timeScale().fitContent();
        setSrc(j.source);
      } catch (e) { if (!dead) setErr(String(e.message || e)); }
    })();
    return () => { dead = true; chart?.remove?.(); };
  }, [occ]);
  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: T.bg, border: `1px solid ${T.violet}44`, borderRadius: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
        <Lbl>THIS CONTRACT OVER TIME · {label} {src ? `· ${src}` : ""}</Lbl>
        <Btn small ghost onClick={onClose}>✕ close</Btn>
      </div>
      {quote && (
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
          now: {quote.mid?.toFixed(2) ?? "—"} · volatility {quote.iv ? (quote.iv * 100).toFixed(0) + "%" : "—"}{quote.oi != null ? ` · ${quote.oi} contracts open at the last close` : ""}{quote.vol != null ? ` · ${quote.vol} traded today` : ""}
        </div>
      )}
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8 }} />
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>
        This tells you whether you are buying near the top of its price range or after it has deflated — something the payoff chart cannot show you.
      </div>
    </div>
  );
}

/* ================================================================
   11) VISTA UNIFICATA — Prezzo storico × Cono probabilità × Zone strategia
   Un solo asse prezzi: candele, proiezione MC, zone P&L, strike, breakeven.
================================================================ */
// ---- Trend read: the SMA/RSI math is taRead() in src/signals.js, the technical
// factor of fuseSignals(). Here we only add the sentence the Build screen prints. ----
export function taSignals(bars) {
  const ta = taRead(bars);
  if (!ta) return null;
  return { ...ta,
    trendTxt: ta.trend > 0 ? "rising" : ta.trend < 0 ? "falling" : "going sideways" };
}
export function confluence(seasonalM, ta) {
  if (!ta) return null;
  const seaDir = seasonalM > 0.8 ? 1 : seasonalM < -0.8 ? -1 : 0;
  let verdict, c, advice;
  if (seaDir !== 0 && ta.trend === seaDir) { verdict = "BOTH AGREE"; c = T.green; advice = `The season points ${seaDir > 0 ? "up" : "down"} and the price is already moving that way. A ${seaDir > 0 ? "bullish" : "bearish"} spread makes sense, at your full per-trade limit.`; }
  else if (seaDir !== 0 && ta.trend === -seaDir) { verdict = "THEY DISAGREE"; c = T.amber; advice = `The season points ${seaDir > 0 ? "up" : "down"} but the price is moving the other way. Trade smaller, wait for the price to turn, or pick a trade that does not need a direction.`; }
  else if (seaDir === 0 && ta.trend === 0) { verdict = "QUIET MARKET"; c = T.blue; advice = "Neither the season nor the price is pushing. A trade that profits from things staying still suits this best — time works for you."; }
  else { verdict = "ONE SIGNAL ONLY"; c = T.mut; advice = seaDir !== 0 ? "Only the season is pushing and the price is flat. Trade smaller, or wait for the price to confirm it." : "Only the price is pushing and the season is flat. Follow the price, but trade smaller."; }
  const warn = ta.rsi >= 70 ? "⚠ The price has run hot recently (RSI " + ta.rsi.toFixed(0) + "). Buying here often means buying the top — waiting for a dip usually gets a better entry." : ta.rsi <= 30 ? "⚠ The price has been beaten down recently (RSI " + ta.rsi.toFixed(0) + "). Selling here often means selling the bottom — a bounce is common." : null;
  return { verdict, c, advice, warn };
}

export function UnifiedView({ ticker, dte, sigma, driftM, curve, legs, breakevens, spot, onTa }) {
  const [bars, setBars] = useState(null);
  const [allBars, setAllBars] = useState(null);
  const [range, setRange] = useState(180);
  const [err, setErr] = useState(null);
  const wrapRef = React.useRef(null);
  // This chart has a floor of 560px: below it the candles, the cone and the
  // rotated payoff stop being readable at all. On a 390px phone that floor used
  // to make the WHOLE PAGE scroll sideways — every other screen shifted with it
  // and nothing lined up. The width stays; what changes is that the overflow is
  // the CHART's, inside its own scroller, so the page never moves (CLAUDE.md:
  // this app is demoed on a phone).
  const MIN_W = 560;
  const [W, setW] = useState(MIN_W);
  useEffect(() => {
    // The observer must attach to a node that EXISTS ON MOUNT. The loading and
    // error states used to return before the wrapper was rendered, so `wrapRef`
    // was null when this ran, nothing was ever observed, and W kept its initial
    // value for the life of the component. That was invisible while the initial
    // value happened to be 1100 — about right on a desktop — and became a chart
    // frozen at 560px in a 1382px column the moment the initial value changed.
    // The wrapper is now always rendered and the states live inside it.
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setW(Math.max(MIN_W, el.clientWidth || MIN_W));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        const r = await fetch(`/api/bars?sym=${encodeURIComponent(ticker)}&days=${range > 400 ? 1900 : 400}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
        setAllBars(j.bars);
        const ta = taSignals(j.bars);
        if (onTa && ta) onTa(ta);
      } catch (e) { setErr(String(e.message || e)); }
    })();
  }, [ticker, range > 400]); // eslint-disable-line
  useEffect(() => {
    if (!allBars) return;
    const n = range <= 180 ? 90 : range <= 400 ? 250 : allBars.length;
    setBars(allBars.slice(-n));
  }, [allBars, range]);
  // Rendered through the SAME wrapper as the chart, so the width is measured
  // from the moment the component mounts rather than whenever data arrives.
  const shell = (inner) => <div ref={wrapRef} style={{ maxWidth: "100%" }}>{inner}</div>;
  if (err) return shell(<div style={{ ...mono, fontSize: 11, color: T.red }}>Chart unavailable: {err}</div>);
  if (!bars || !spot || !curve?.length) return shell(<div style={{ ...mono, fontSize: 11, color: T.mut }}>Loading the chart…</div>);

  const H = 440, padL = 6, padR = 60, padT = 10, padB = 26;
  // THE PAYOFF, BESIDE THE PRICE CHART, ON THE SAME PRICE AXIS (PRD §6).
  // Price is the vertical axis here, so the multi-leg payoff belongs rotated
  // 90° in a strip on the right: at any height you read the price on the axis
  // and, straight across, what the trade is worth there. It was a separate
  // chart further down the page with its own axis, which meant comparing "where
  // the price could go" with "where this makes money" was a memory exercise.
  // ADAPTIVE: the strip needs real room to be worth anything, so it appears
  // only when there is some, and on a phone the full-width payoff chart below
  // carries it instead.
  const PAY_MIN_W = 820;
  const showPay = W >= PAY_MIN_W;
  const payGap = showPay ? 10 : 0;
  const payW = showPay ? Math.max(120, Math.min(210, (W - padL - padR) * 0.19)) : 0;
  const plotW = W - padL - padR - payW - payGap;
  const shareH = range > 400 ? 0.72 : 0.58;
  const histW = plotW * shareH;
  const projW = plotW * (1 - shareH);
  const x0 = padL, xToday = padL + histW, xEnd = padL + histW + projW;
  const payX0 = xEnd + payGap;
  const xRight = showPay ? payX0 + payW : xEnd;

  // cono lognormale: drift stagionale + IV reale
  const mu = Math.log(1 + (driftM || 0) / 100) * 12;
  const qz = { p5: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645 };
  const days = Math.max(1, dte);
  const cone = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * (days / 365);
    const o = { x: xToday + (i / 24) * projW };
    for (const [k, z] of Object.entries(qz)) o[k] = spot * Math.exp((mu - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
    cone.push(o);
  }
  // dominio Y
  const ys = [
    ...bars.map((b) => b.low), ...bars.map((b) => b.high),
    ...cone.map((c) => c.p5), ...cone.map((c) => c.p95),
    ...legs.map((l) => l.strike), ...(breakevens || []),
  ];
  const yMin = Math.min(...ys) * 0.985, yMax = Math.max(...ys) * 1.015;
  const Y = (v) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const XH = (i) => x0 + (i / (bars.length - 1)) * histW;

  // zone profitto/perdita a scadenza (fasce orizzontali, solo lato proiezione)
  const zones = [];
  let zs = null;
  for (let i = 0; i < curve.length; i++) {
    const pos = curve[i].exp > 0;
    if (pos && zs == null) zs = curve[i].s;
    if ((!pos || i === curve.length - 1) && zs != null) { zones.push([zs, curve[i].s]); zs = null; }
  }
  // coerenza: P(prezzo a scadenza dentro zona verde) con lo stesso modello del cono
  const erf2 = (x) => { const sg = x < 0 ? -1 : 1; x = Math.abs(x); const t2 = 1 / (1 + 0.3275911 * x); return sg * (1 - (((((1.061405429 * t2 - 1.453152027) * t2) + 1.421413741) * t2 - 0.284496736) * t2 + 0.254829592) * t2 * Math.exp(-x * x)); };
  const Tyr = days / 365, sq = sigma * Math.sqrt(Tyr), muT = Math.log(spot) + (mu - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => 0.5 * (1 + erf2((Math.log(x) - muT) / (sq * Math.SQRT2)));
  const pIn = zones.reduce((a, [lo, hi]) => a + Math.max(0, cdf(Math.min(hi, yMax * 2)) - cdf(Math.max(lo, 0.01))), 0);

  /* ---- the payoff, rotated onto the shared price axis ----
     Same `curve` the zones above are cut from, so the strip and the green bands
     can never disagree: one is the other read sideways. Only the visible price
     range is drawn — a payoff that runs off the top of the axis would invite a
     comparison with a price the chart is not showing. */
  const payPts = showPay
    ? curve.filter((c) => c.s >= yMin && c.s <= yMax).map((c) => ({ y: Y(c.s), v: c.exp }))
    : [];
  const payMax = payPts.length ? Math.max(...payPts.map((p2) => Math.abs(p2.v)), 1) : 1;
  // Zero sits a third in from the left, so a credit spread's small win still has
  // somewhere to be drawn and the loss side is not squeezed to nothing.
  const payZero = payX0 + payW * 0.34;
  const PX = (v) => payZero + (v / payMax) * (v >= 0 ? payX0 + payW - 9 - payZero : payZero - payX0 - 9);
  const payPath = payPts.map((p2, i) => `${(i ? "L" : "M")}${PX(p2.v).toFixed(1)},${p2.y.toFixed(1)}`).join("");

  const poly = (ks) => cone.map((c) => `${c.x.toFixed(1)},${Y(c[ks[0]]).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c[ks[1]]).toFixed(1)}`).join(" ");
  const gTicks = 5;

  // The observer measures the OUTER box; the scroller is the inner one, so the
  // measured width is the space actually available rather than the chart's own.
  return (
    <div ref={wrapRef} style={{ maxWidth: "100%" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "flex-end" }}>
        {[[180, "6M"], [365, "1Y"], [1825, "5Y"]].map(([v, l]) => (
          <Btn key={l} small ghost={range !== v} onClick={() => setRange(v)}>{l}</Btn>
        ))}
      </div>
      <div style={{ overflowX: "auto", overflowY: "hidden", maxWidth: "100%", WebkitOverflowScrolling: "touch" }}>
      <svg width={W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.line}` }}>
        {/* griglia + asse prezzi */}
        {Array.from({ length: gTicks + 1 }, (_, i) => {
          const v = yMin + (i / gTicks) * (yMax - yMin);
          return (<g key={i}>
            <line x1={x0} x2={xRight} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
            <text x={xRight + 6} y={Y(v) + 3} fill={T.dim} fontSize={9.5} fontFamily="monospace">{v.toFixed(2)}</text>
          </g>);
        })}
        {/* zone strategia (proiezione): verde = profitto a scadenza */}
        <rect x={xToday} y={padT} width={projW} height={H - padT - padB} fill={T.red} opacity={0.055} />
        {zones.map(([lo, hi], i) => (
          <rect key={i} x={xToday} y={Y(hi)} width={projW} height={Math.max(0, Y(lo) - Y(hi))} fill={T.green} opacity={0.16} />
        ))}
        {/* cono probabilità */}
        <polygon points={poly(["p95", "p5"])} fill={T.violet} opacity={0.10} />
        <polygon points={poly(["p75", "p25"])} fill={T.violet} opacity={0.16} />
        <polyline points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p50).toFixed(1)}`).join(" ")} fill="none" stroke={T.violet} strokeWidth={1.3} strokeDasharray="4 3" />
        {/* candele storiche */}
        {bars.map((b, i) => {
          const x = XH(i), up = b.close >= b.open, cw = Math.max(1.4, histW / bars.length * 0.55);
          return (<g key={i}>
            <line x1={x} x2={x} y1={Y(b.high)} y2={Y(b.low)} stroke={up ? T.green : T.red} strokeWidth={0.8} />
            <rect x={x - cw / 2} y={Y(Math.max(b.open, b.close))} width={cw} height={Math.max(1, Math.abs(Y(b.open) - Y(b.close)))} fill={up ? T.green : T.red} />
          </g>);
        })}
        {/* separatore OGGI */}
        <line x1={xToday} x2={xToday} y1={padT} y2={H - padB} stroke={T.amber} strokeWidth={1} strokeDasharray="3 3" />
        <text x={xToday + 4} y={padT + 10} fill={T.amber} fontSize={9.5} fontFamily="monospace">TODAY ${spot.toFixed(2)}</text>
        <text x={xEnd - 4} y={padT + 10} fill={T.dim} fontSize={9.5} fontFamily="monospace" textAnchor="end">EXPIRY · {dte} DAYS</text>
        {/* strike delle gambe + breakeven */}
        {legs.map((l, i) => (<g key={"lg" + i}>
          <line x1={xToday} x2={xEnd} y1={Y(l.strike)} y2={Y(l.strike)} stroke={l.side > 0 ? T.green : T.red} strokeWidth={1.4} />
          <text x={xToday + 4} y={Y(l.strike) - 3} fill={l.side > 0 ? T.green : T.red} fontSize={9.5} fontFamily="monospace" fontWeight="700">{l.side > 0 ? "+" : "−"}{l.qty} {l.strike}{l.type === "call" ? "C" : "P"}</text>
        </g>))}
        {(breakevens || []).map((b, i) => (<g key={"be" + i}>
          <line x1={x0} x2={xRight} y1={Y(b)} y2={Y(b)} stroke={T.blue} strokeWidth={1.1} strokeDasharray="6 4" />
          <text x={x0 + 4} y={Y(b) - 3} fill={T.blue} fontSize={9.5} fontFamily="monospace">BE {b.toFixed(2)}</text>
        </g>))}
        {/* etichette date */}
        <text x={x0} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace">{bars[0]?.time}</text>
        <text x={xToday} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace" textAnchor="middle">{bars[bars.length - 1]?.time}</text>
        {/* ---- THE PAYOFF, BESIDE THE PRICE, ON THE SAME AXIS ---- */}
        {showPay && (
          <g>
            <rect x={payX0} y={padT} width={payW} height={H - padT - padB} fill={T.panel} opacity={0.5} />
            {/* the profit side and the loss side, tinted like the bands opposite */}
            <rect x={payZero} y={padT} width={Math.max(0, payX0 + payW - payZero)} height={H - padT - padB} fill={T.green} opacity={0.05} />
            <rect x={payX0} y={padT} width={Math.max(0, payZero - payX0)} height={H - padT - padB} fill={T.red} opacity={0.05} />
            <line x1={payZero} x2={payZero} y1={padT} y2={H - padB} stroke={T.mut} strokeWidth={0.9} />
            <path d={payPath} fill="none" stroke={T.amber} strokeWidth={2} />
            <text x={payX0 + payW / 2} y={padT + 10} fill={T.dim} fontSize={9} fontFamily="monospace" textAnchor="middle">
              AT EXPIRY
            </text>
            <text x={payZero - 3} y={H - padB - 4} fill={T.red} fontSize={8.5} fontFamily="monospace" textAnchor="end">lose</text>
            <text x={payZero + 3} y={H - padB - 4} fill={T.green} fontSize={8.5} fontFamily="monospace">make</text>
            {/* today's price, read straight across into the payoff */}
            <line x1={x0} x2={xRight} y1={Y(spot)} y2={Y(spot)} stroke={T.amber} strokeWidth={0.9} strokeDasharray="2 3" opacity={0.75} />
          </g>
        )}
      </svg>
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
        {[["■", T.green + "44", "where you make money at expiry"], ["■", T.violet + "55", "where the price could go (pale 5–95%, solid 25–75%)"], ["┅", T.violet, "the middle path"], ["—", T.blue, "break even"], ["—", T.green, "option you bought"], ["—", T.red, "option you sold"]].map(([g, c, l]) => (
          <span key={l} style={{ ...mono, fontSize: 9.5, color: T.mut }}><span style={{ color: c, fontWeight: 800 }}>{g}</span> {l}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, padding: "8px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
        <b style={{ color: T.ink }}>How to read it:</b> the purple cone is where the price can realistically get to by expiry; the green bands are where this trade makes money. They overlap about <b style={{ color: pIn >= 0.5 ? T.green : T.violet }}>{(pIn * 100).toFixed(0)}%</b> of the time — which is the same number as the CHANCE shown above, worked out the same way.
      </div>
    </div>
  );
}
