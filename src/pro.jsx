import React, { useState, useEffect } from "react";
import { RefreshCw, Send, Trash2, Download, Sparkles, CloudSun, FileText, XCircle } from "lucide-react";
import { T } from "./theme.js";
import { RULES, ruleBadge, takeProfitLabel, scaleOutLabel, stopLossLabel, exitDTELabel, perTradeCapLabel, copilotRulesBlock, money, pctText } from "./rules.js";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { erf, netBS } from "./engine.js";
import { ARROW, REGIONS, regionSignals, tagImpacts, taRead } from "./signals.js";

/* ============ theme (condiviso) ============ */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const fmt$ = (x) => (x == null || Number.isNaN(x) || !Number.isFinite(x)) ? "—" : `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(0)}`;
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
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
export const ImpactTags = ({ item }) => (
  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 5 }}>
    {item.geo && <span style={{ ...mono, fontSize: 9, color: T.violet, border: `1px solid ${T.violet}55`, padding: "2px 6px", borderRadius: 4 }}>GEO/GOV</span>}
    {item.analysis && <span style={{ ...mono, fontSize: 9, color: T.blue, border: `1px solid ${T.blue}55`, padding: "2px 6px", borderRadius: 4 }}>ANALYSIS</span>}
    {(item.impacts || []).length === 0 && <span style={{ ...mono, fontSize: 9, color: T.dim, border: `1px solid ${T.line}`, padding: "2px 6px", borderRadius: 4 }}>general market</span>}
    {(item.impacts || []).map((im) => {
      const c = im.dir > 0 ? T.green : im.dir < 0 ? T.red : T.mut;
      return (
        <span key={im.tk} title={im.why} style={{ ...mono, fontSize: 9, color: c, border: `1px solid ${c}55`, padding: "2px 6px", borderRadius: 4, cursor: "help" }}>
          {im.tk} {ARROW[im.dir]} · {im.why}
        </span>
      );
    })}
  </div>
);

/* ================================================================
   2) WEATHER: Open-Meteo forecasts over the key commodity regions

   The region table, the climate normals and the anomaly read all live in
   src/signals.js. This block only fetches and reshapes for display, so the
   Weather tab and fuseSignals() can never disagree about the same forecast.
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

export function MeteoTab({ news = [], data: given = null }) {
  // Le previsioni le carica già l'app all'avvio (servono a fuseSignals): se
  // arrivano da lì non le riscarichiamo, il tab le riusa.
  const [fetched, setFetched] = useState(null);
  const [err, setErr] = useState(null);
  const data = given || fetched;
  const load = async () => { try { setErr(null); setFetched(await fetchWeather()); } catch (e) { setErr(String(e.message || e)); } };
  useEffect(() => { if (!given) load(); }, [given]);
  const sig = data ? weatherSignals(data) : [];
  // correlazione meteo ↔ news: per ticker, direzione prevalente delle news taggate
  const newsDir = {};
  for (const n of news) for (const im of n.impacts || []) {
    if (!newsDir[im.tk]) newsDir[im.tk] = { up: 0, dn: 0 };
    if (im.dir > 0) newsDir[im.tk].up++; else if (im.dir < 0) newsDir[im.tk].dn++;
  }
  const combined = sig.filter((s2) => s2.dir !== "≈").map((s2) => {
    const agree = s2.tks.some((tk) => {
      const nd = newsDir[tk]; if (!nd) return false;
      return (s2.dir === "↑" && nd.up > nd.dn) || (s2.dir === "↓" && nd.dn > nd.up);
    });
    return { ...s2, agree };
  });
  return (
    <div style={{ marginTop: 12 }}>
      {combined.length > 0 && (
        <Panel style={{ marginBottom: 10, border: `1px solid ${T.amber}44` }}>
          <Lbl>⚡ LIVE SIGNALS · WEATHER {combined.some((s2) => s2.agree) ? "+ NEWS AGREEING" : ""}</Lbl>
          <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
            {combined.map((s2, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: s2.dir === "↑" ? T.green : T.red }}>{s2.tks.join("+")} {s2.dir}</span>
                <span style={{ ...mono, fontSize: 9, color: s2.agree ? T.amber : T.dim, border: `1px solid ${s2.agree ? T.amber : T.line}66`, borderRadius: 4, padding: "1px 6px" }}>
                  {s2.agree ? "★ REINFORCED: weather and news point the same way" : `strength ${s2.strength} (weather only)`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>★ means two independent sources agree, so the signal counts for more. Open the News tab first to include them.</div>
        </Panel>
      )}
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><CloudSun size={11} style={{ verticalAlign: "-1px" }} /> WEATHER VERSUS NORMAL (NEXT 14 DAYS) · CAUSE → EFFECT</Lbl>
          <Btn small ghost onClick={load}><RefreshCw size={11} /> Refresh</Btn>
        </div>
        {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {sig.map((s, i) => {
            const c = s.dir === "↑" ? T.green : s.dir === "↓" ? T.red : T.mut;
            return (
              <div key={i} style={{ padding: "9px 11px", background: T.bg, border: `1px solid ${c}44`, borderRadius: 7 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: c }}>{s.tks.join("+")} {s.dir}</span>
                  <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>{s.region}</span>
                </div>
                <div style={{ fontSize: 12.5, color: T.body, marginTop: 3 }}>{s.why}</div>
              </div>
            );
          })}
          {!data && !err && <div style={{ ...mono, fontSize: 12, color: T.mut }}>Loading the forecast…</div>}
        </div>
      </Panel>
      {data && (
        <Panel style={{ marginTop: 10 }}>
          <Lbl>REGIONS BEING WATCHED</Lbl>
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {REGIONS.map((rg) => {
              const d = data[rg.id];
              if (!d) return null;
              const rain = d.prec.reduce((a, b) => a + b, 0);
              const tmaxAvg = d.tmax.reduce((a, b) => a + b, 0) / d.tmax.length;
              const hot = d.tmax.filter((t) => t >= 34).length;
              return (
                <div key={rg.id} style={{ padding: "9px 11px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                    <div style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>{rg.name} <span style={{ ...mono, fontSize: 10, color: T.blue }}>{rg.affects.join(" · ")}</span></div>
                    <div style={{ ...mono, fontSize: 11, color: T.mut }}>avg high {tmaxAvg.toFixed(0)}°C · {hot} days ≥34°C · {rain.toFixed(0)}mm rain in 14 days</div>
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 3 }}>{rg.phase}</div>
                  <div style={{ display: "flex", gap: 2, marginTop: 6 }}>
                    {d.tmax.map((t, i) => (
                      <div key={i} title={`${d.dates[i]}: ${t}°C, ${d.prec[i]}mm`} style={{ flex: 1, height: 18, borderRadius: 2, background: t >= 36 ? T.red : t >= 33 ? T.amber : t >= 28 ? "#8a7434" : "#3a4a5a", opacity: 0.5 + Math.min(0.5, d.prec[i] / 20) }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ ...mono, fontSize: 10, color: T.dim }}>KEY (one mark per day, 14 days):</span>
            {[["#3a4a5a", "mild, under 28°C"], ["#8a7434", "warm, 28-33°C"], ["#b8860b", "hot, 33-36°C"], ["#c0392b", "extreme, 36°C and up"]].map(([c, l]) => (
              <span key={l} style={{ ...mono, fontSize: 10, color: T.mut, display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} /> {l}
              </span>
            ))}
            <span style={{ ...mono, fontSize: 10, color: T.dim }}>· the more solid the mark, the more rain · source open-meteo.com</span>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ================================================================
   2b) WHY THIS TRADE — the 4-factor read, in plain English

   Progressive disclosure (PRD §6): the verdict and the narrative are always
   visible; the four components sit behind a tap. Mobile has no hover, so every
   explanation opens on tap, closes on a tap outside, and on a narrow screen it
   renders below the bars instead of floating over them.
================================================================ */

const AGREEMENT_STYLE = {
  CONFLUENT: { c: T.green, label: "CONFLUENT", meaning: "three or more factors point the same way" },
  MIXED: { c: T.blue, label: "MIXED", meaning: "some factors push, the rest stay quiet" },
  CONFLICT: { c: T.red, label: "CONFLICT", meaning: "the factors contradict each other" },
};
const FACTOR_LABEL = { seasonal: "Seasonality", technical: "Price trend", weather: "Weather", news: "News flow" };
const FACTOR_ORDER = ["seasonal", "technical", "weather", "news"];

/** True while the viewport is too narrow to float an explanation over content. */
export function useNarrow(px = 720) {
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= px : false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [px]);
  return narrow;
}

export function WhyThisTrade({ fused, title = "WHY THIS TRADE", note }) {
  const [detail, setDetail] = useState(false);
  const [open, setOpen] = useState(null); // key of the factor whose explanation is open
  const narrow = useNarrow();
  const ref = React.useRef(null);

  // Tap outside closes the open explanation. Mobile has no hover, so this is
  // the only way back out of it.
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(null); };
    const esc = (e) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!fused) return null;
  const st = AGREEMENT_STYLE[fused.agreement] || AGREEMENT_STYLE.MIXED;
  const scoreCol = fused.score > 0 ? T.green : fused.score < 0 ? T.red : T.mut;

  return (
    <div ref={ref} style={{ marginTop: 10, padding: "11px 13px", background: `${st.c}0d`, border: `1px solid ${st.c}55`, borderRadius: 8 }}>
      {/* ---- always visible: verdict, the two numbers, the narrative ---- */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Lbl>{title}</Lbl>
        <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: T.onAccent, background: st.c, borderRadius: 4, padding: "2px 7px", letterSpacing: "0.08em" }}>
          {st.label}
        </span>
        <span style={{ ...mono, fontSize: 11, color: T.mut }}>{st.meaning}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 12 }}>
          <Stat k="SIGNAL SCORE" v={`${fused.score > 0 ? "+" : ""}${fused.score} / 100`} c={scoreCol} />
          <Stat k="CONFIDENCE" v={`${fused.confidence} / 100`} c={fused.confidence >= 70 ? T.green : fused.confidence < 40 ? T.red : T.amber} />
        </span>
      </div>

      <div style={{ fontSize: 12.5, color: T.body, marginTop: 7, lineHeight: 1.5 }}>{fused.narrative}</div>
      {note && <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 5 }}>{note}</div>}

      {/* ---- behind a tap: the four components as direction + strength ---- */}
      <button onClick={() => { setDetail((d) => !d); setOpen(null); }}
        style={{ ...mono, fontSize: 10.5, marginTop: 8, background: "transparent", color: T.blue, border: `1px solid ${T.blue}55`, borderRadius: 5, padding: "4px 9px", cursor: "pointer" }}>
        {detail ? "hide detail ▲" : "show detail ▼"}
      </button>

      {detail && (
        <div style={{ marginTop: 9, display: "grid", gap: 6 }}>
          {FACTOR_ORDER.map((k) => {
            const cp = fused.components[k];
            const col = cp.dir > 0 ? T.green : cp.dir < 0 ? T.red : T.mut;
            const isOpen = open === k;
            const explanation = (
              <div style={{
                ...(narrow
                  ? { position: "static", marginTop: 6 }
                  : { position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 20, boxShadow: `0 6px 18px rgba(0,0,0,${T.dark ? 0.45 : 0.14})` }),
                background: T.panel, border: `1px solid ${col}66`, borderRadius: 6, padding: "8px 10px",
              }}>
                <div style={{ fontSize: 12, color: T.body, lineHeight: 1.5 }}>{cp.why}</div>
                <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 4 }}>tap anywhere outside to close</div>
              </div>
            );
            return (
              <div key={k} style={{ position: "relative" }}>
                <button onClick={() => setOpen(isOpen ? null : k)}
                  style={{ width: "100%", textAlign: "left", background: isOpen ? `${col}14` : T.bg, border: `1px solid ${isOpen ? col : T.line}`, borderRadius: 6, padding: "7px 9px", cursor: "pointer" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ ...mono, fontSize: 13, fontWeight: 800, color: col, width: 14 }}>{ARROW[cp.dir]}</span>
                    <span style={{ ...mono, fontSize: 11, color: T.ink, minWidth: 96 }}>{FACTOR_LABEL[k]}</span>
                    <span style={{ flex: 1, minWidth: 90, height: 7, background: T.line, borderRadius: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", width: `${cp.strength}%`, height: "100%", background: col, borderRadius: 4 }} />
                    </span>
                    <span style={{ ...mono, fontSize: 10.5, color: T.dim, width: 52, textAlign: "right" }}>{cp.strength}/100</span>
                    <span style={{ ...mono, fontSize: 10, color: T.blue }}>{isOpen ? "▲" : "why?"}</span>
                  </div>
                </button>
                {isOpen && explanation}
              </div>
            );
          })}
          <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>
            Direction is the arrow, strength is the bar (0-100). The score above is these four weighted together: seasonality 30%, price trend 25%, weather 25%, news 20%.
          </div>
        </div>
      )}
    </div>
  );
}

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
        <Btn color={confirm ? T.red : T.violet} onClick={send} disabled={busy || !preview.pass}>
          <Send size={12} /> {busy ? "Sending…" : !preview.pass ? "BLOCKED BY THE RISK GATE" : confirm ? "TAP AGAIN TO CONFIRM" : "Send the order"}
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
                <Btn small ghost color={T.red} onClick={() => closeGroup(g)}><XCircle size={11} /> Close the whole trade</Btn>
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
Style: concise, explicit numbers (Greeks, P&L, probabilities), recommendations marked with an arrow →, always state the risk and what would invalidate the thesis. Never guarantee an outcome: this is educational analysis on a paper account, not financial advice.

METHOD (follow in order): 1 Discovery (seasonal scanner + trend) → 2 Construction (real chain, strikes, Greeks, R/R, breakevens) → 3 Execution (only after explicit human confirmation, check buying power) → 4 Monitoring (P&L against the rules, % of max profit) → 5 Reporting.

DECISION TREES: (A) strong bullish seasonal signal + uptrend → bull call spread (small capital) or long call (larger capital), moderate conviction → call calendar; (B) neutral/range market with low volatility → iron condor (never naked strangles: defined risk only); (C) event ahead with low IV → long ATM straddle/strangle; IV already high → sell premium with defined risk, or wait; directional bias → vertical spread.

MANAGEMENT: scale in and out → start with 1 contract, add if it works, close half at ${pctText(RULES.takeProfitPct)} of max profit and the rest at ${pctText(RULES.scaleOutPct)}; roll near expiration with a calendar; if the underlying moves against you → re-examine the thesis: if it is invalidated, close, do not average down.

OUTPUT FORMAT: clear sections (LEGS / P&L PROFILE / GREEKS / NEXT STEPS), always risk/reward, always next steps, and ask for confirmation before any execution.`;
export const SKILLS = [
  { id: "pretrade", label: "✓ Pre-trade analysis", prompt: `Run the pre-trade analysis of the current strategy: structure, Greeks, risk/reward, breakevens against support and resistance, seasonal alignment and news. Finish with a GO/NO-GO checklist and a position size within the per-trade limit (${perTradeCapLabel()}).` },
  { id: "positions", label: "♻ Position review", prompt: `Review the open positions against the rules (${ruleBadge()}): for each one give → HOLD / CLOSE / ROLL with the reasoning and the levels to watch. Remember the ${stopLossLabel()} rule is a warning, never an automatic close.` },
  { id: "news", label: "📰 News impact", prompt: "Analyse the tagged news in context: which items affect my positions and the underlyings on the radar? Separate noise from signal, with cause→effect and a time horizon." },
  { id: "radar", label: "📡 Opportunity radar", prompt: `From the seasonal scanner and the weather signals, propose the 2 best opportunities of this week with a suggested structure (relative strikes, ~${RULES.targetEntryDTE} DTE), the thesis, the risk and the entry trigger. Nothing below ${RULES.minEntryDTE} DTE at entry: the risk gate refuses it.` },
];
export async function askAI(_key, messages, contextStr) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM_PROMPT + "\n\nLIVE CONTEXT (JSON):\n" + contextStr,
      messages,
    }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message || JSON.stringify(j.error).slice(0, 200));
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
export function CopilotTab({ ctx, apiKey }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (text) => {
    if (!text.trim() || busy) return;
    if (!apiKey) { setErr("Add your Anthropic API key in Positions → Integrations."); return; }
    setErr(null);
    const next = [...msgs, { role: "user", content: text }];
    setMsgs(next); setInput(""); setBusy(true);
    try {
      const reply = await askAI(apiKey, next.map((m) => ({ role: m.role, content: m.content })), buildContext(ctx));
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch (e) { setErr(String(e.message || e)); setMsgs(msgs); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <Lbl><Sparkles size={11} style={{ verticalAlign: "-1px" }} /> AI COPILOT · IT ALREADY KNOWS YOUR POSITIONS</Lbl>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {SKILLS.map((s) => <Btn key={s.id} small ghost color={T.blue} onClick={() => send(s.prompt)} disabled={busy}>{s.label}</Btn>)}
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {msgs.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Pick one above or just ask. The copilot already knows your open positions, the trade in the Builder, the seasonal scanner, the tagged news and your own risk rules.</div>}
          {msgs.map((m, i) => (
            <div key={i} style={{ padding: "9px 11px", borderRadius: 7, background: m.role === "user" ? `${T.blue}14` : T.bg, border: `1px solid ${m.role === "user" ? T.blue + "44" : T.line}` }}>
              <div style={{ ...mono, fontSize: 9, color: m.role === "user" ? T.blue : T.amber, marginBottom: 3 }}>{m.role === "user" ? "YOU" : "COPILOT"}</div>
              <div style={{ fontSize: 13, color: T.body, whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          ))}
          {busy && <div style={{ ...mono, fontSize: 11, color: T.amber }}>Thinking…</div>}
        </div>
        {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Inp value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Ask a question… (Enter to send)" style={{ flex: 1 }} />
          <Btn onClick={() => send(input)} disabled={busy}><Send size={13} /></Btn>
        </div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Educational analysis on a paper account, not financial advice.</div>
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
    L.push(`- ${n.title} ${n.geo ? "🏛" : ""}\n  ${(n.impacts || []).map((im) => `**${im.tk} ${ARROW[im.dir]}** (${im.why})`).join(" · ")}`);
  });
  L.push(`\n## 4 · Weather → commodities (next 14 days)`);
  (weatherSig || []).forEach((s) => L.push(`- **${s.tks.join("+")} ${s.dir}** — ${s.region}: ${s.why}`));
  if (aiText) { L.push(`\n## 5 · The copilot\u2019s read`); L.push(aiText); }
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
    <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">🖨 Print or save as PDF</button>
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
  useEffect(() => { if (isDue && (ctx.scan || []).length) gen(); }, []); // eslint-disable-line — auto all'apertura se scaduto
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
          <Btn small ghost color={T.green} onClick={() => placeExit(takeProfitLabel(), RULES.takeProfitPct * pos.maxProfit)} disabled={!!ladderBusy}>GTC {takeProfitLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.takeProfitPct * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.green} onClick={() => placeExit(`TP ${scaleOutLabel()}`, RULES.scaleOutPct * pos.maxProfit)} disabled={!!ladderBusy}>GTC TP {scaleOutLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.scaleOutPct * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.red} onClick={() => placeExit(stopLossLabel(), RULES.stopLossPct * pos.maxLoss)} disabled={!!ladderBusy}>{stopLossLabel()} @ ${Math.abs(ladderNet(pos.entryNet, RULES.stopLossPct * pos.maxLoss)).toFixed(2)}</Btn>
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
            <span style={{ color: T.dim }}> · {q.iv ? (q.iv * 100).toFixed(0) + "%" : "—"} · OI {q.oi}</span>
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
              <th style={{ padding: "5px 6px", textAlign: "right" }}>CALL · mid · IV · OI</th>
              <th style={{ padding: "5px 6px", textAlign: "center" }}>STRIKE</th>
              <th style={{ padding: "5px 6px", textAlign: "left" }}>PUT · mid · IV · OI</th>
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
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>The highlighted row is the strike nearest today\u2019s price (${spot.toFixed(2)}). A blue tint means the option already has value. Live CBOE prices, ~15 min delayed.</div>
    </div>
  );
}

/* Mini-thumbnail payoff per le card dell'Optimize */
export function PayoffThumb({ curve, height = 48 }) {
  if (!curve?.length) return null;
  const pts = curve.filter((_, i) => i % 6 === 0);
  const xs = pts.map((p) => p.s), ys = pts.map((p) => p.exp);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymin = Math.min(...ys), ymax = Math.max(...ys), yr = Math.max(1, ymax - ymin);
  const W = 160, H = height;
  const X = (x) => ((x - xmin) / (xmax - xmin)) * W;
  const Y = (y) => H - ((y - ymin) / yr) * H;
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p.s).toFixed(1)},${Y(p.exp).toFixed(1)}`).join("");
  const zeroY = Y(0);
  return (
    <svg width={W} height={H} style={{ display: "block" }}>
      <line x1={0} x2={W} y1={zeroY} y2={zeroY} stroke={T.line} strokeWidth={1} />
      <path d={`${d}L${W},${H}L0,${H}Z`} fill={`${T.green}18`} />
      <path d={d} fill="none" stroke={T.amber} strokeWidth={1.8} />
    </svg>
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
          now: {quote.mid?.toFixed(2) ?? "—"} · volatility {quote.iv ? (quote.iv * 100).toFixed(0) + "%" : "—"} · {quote.oi ?? "—"} contracts open · {quote.vol ?? "—"} traded today
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
// factor of fuseSignals(). Here we only add the sentence the Builder prints. ----
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
  const [W, setW] = useState(1100);
  useEffect(() => {
    const ro = new ResizeObserver(() => setW(Math.max(560, wrapRef.current?.clientWidth || 900)));
    if (wrapRef.current) ro.observe(wrapRef.current);
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
  if (err) return <div style={{ ...mono, fontSize: 11, color: T.red }}>Chart unavailable: {err}</div>;
  if (!bars || !spot || !curve?.length) return <div style={{ ...mono, fontSize: 11, color: T.mut }}>Loading the chart…</div>;

  const H = 440, padL = 6, padR = 60, padT = 10, padB = 26;
  const shareH = range > 400 ? 0.72 : 0.58;
  const histW = (W - padL - padR) * shareH;
  const projW = (W - padL - padR) * (1 - shareH);
  const x0 = padL, xToday = padL + histW, xEnd = padL + histW + projW;

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

  const poly = (ks) => cone.map((c) => `${c.x.toFixed(1)},${Y(c[ks[0]]).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c[ks[1]]).toFixed(1)}`).join(" ");
  const gTicks = 5;

  return (
    <div ref={wrapRef}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, justifyContent: "flex-end" }}>
        {[[180, "6M"], [365, "1Y"], [1825, "5Y"]].map(([v, l]) => (
          <Btn key={l} small ghost={range !== v} onClick={() => setRange(v)}>{l}</Btn>
        ))}
      </div>
      <svg width={W} height={H} style={{ display: "block", background: T.bg, borderRadius: 8, border: `1px solid ${T.line}` }}>
        {/* griglia + asse prezzi */}
        {Array.from({ length: gTicks + 1 }, (_, i) => {
          const v = yMin + (i / gTicks) * (yMax - yMin);
          return (<g key={i}>
            <line x1={x0} x2={xEnd} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
            <text x={xEnd + 6} y={Y(v) + 3} fill={T.dim} fontSize={9.5} fontFamily="monospace">{v.toFixed(2)}</text>
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
          <line x1={x0} x2={xEnd} y1={Y(b)} y2={Y(b)} stroke={T.blue} strokeWidth={1.1} strokeDasharray="6 4" />
          <text x={x0 + 4} y={Y(b) - 3} fill={T.blue} fontSize={9.5} fontFamily="monospace">BE {b.toFixed(2)}</text>
        </g>))}
        {/* etichette date */}
        <text x={x0} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace">{bars[0]?.time}</text>
        <text x={xToday} y={H - 8} fill={T.dim} fontSize={9} fontFamily="monospace" textAnchor="middle">{bars[bars.length - 1]?.time}</text>
      </svg>
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
