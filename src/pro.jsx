import React, { useState, useEffect } from "react";
import { RefreshCw, Send, Trash2, Download, Sparkles, CloudSun, FileText, XCircle } from "lucide-react";
import { T } from "./theme.js";
import { createChart, CandlestickSeries, HistogramSeries, LineSeries, LineStyle } from "lightweight-charts";
import { erf, netBS } from "./engine.js";

/* ============ theme (condiviso) ============ */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const fmt$ = (x) => (x == null || Number.isNaN(x) || !Number.isFinite(x)) ? "—" : `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(0)}`;
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    style={{ ...mono, fontSize: small ? 11 : 12, padding: small ? "4px 8px" : "8px 12px", borderRadius: 6, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1, background: ghost ? "transparent" : color, color: ghost ? color : "#14181d", border: ghost ? `1px solid ${color}66` : "none", display: "inline-flex", alignItems: "center", gap: 6 }}>{children}</button>
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
   1) NEWS: tagging causa→effetto + fonti geopolitiche/governative
================================================================ */
const TAG_RULES = [
  { re: /(heat ?wave|drought|dry (spell|weather)|scorching|soil moisture)/i, imp: [["CORN", "↑", "stress idrico/caldo su colture → rischio rese → prezzi su"], ["SOYB", "↑", "stress colture → offerta attesa giù → prezzi su"], ["WEAT", "↑", "siccità aree grano → prezzi su"]] },
  { re: /(beneficial rain|rains improve|good weather|favou?rable weather|bumper (crop|harvest)|record (crop|harvest))/i, imp: [["CORN", "↓", "meteo favorevole/raccolto abbondante → offerta su → prezzi giù"], ["SOYB", "↓", "rese attese in aumento → pressione sui prezzi"]] },
  { re: /(usda|wasde|crop report|grain stocks|acreage|prospective plantings)/i, imp: [["CORN", "≈", "dato governativo USDA: sotto attese ↑, sopra attese ↓"], ["SOYB", "≈", "come sopra: confrontare con consensus"], ["WEAT", "≈", "come sopra"]] },
  { re: /(china).{0,40}(soy|grain|corn|purchas|import|buy)/i, imp: [["SOYB", "↑", "domanda export Cina → sostegno ai prezzi"], ["CORN", "↑", "acquisti cinesi → domanda su"]] },
  { re: /(export sales|export ban|export restriction|tariff|trade (war|deal)|dazi)/i, imp: [["SOYB", "≈", "flussi commerciali: ban/dazi su origine USA ↓, su concorrenti ↑"], ["CORN", "≈", "come sopra"], ["WEAT", "≈", "come sopra"], ["SPY", "↓", "escalation commerciale → risk-off azionario"]] },
  { re: /(black sea|ukrain|grain corridor|odesa|russia.{0,30}(wheat|grain))/i, imp: [["WEAT", "↑", "rischio offerta Mar Nero → premio al rischio sul grano"], ["CORN", "↑", "Ucraina export mais → rischio corridoio → prezzi su"]] },
  { re: /(natural gas storage|eia.{0,30}(storage|inventory|injection)|working gas)/i, imp: [["UNG", "≈", "dato scorte EIA: build sopra attese ↓, sotto attese ↑"], ["BOIL", "≈", "stesso segno, amplificato 2x"]] },
  { re: /(lng (export|terminal|plant)|freeport|cheniere|sabine)/i, imp: [["UNG", "↑", "più export LNG → domanda gas USA su → prezzi su"], ["BOIL", "↑", "leva 2x sul gas"]] },
  { re: /(hurricane|tropical storm|gulf (of mexico|coast).{0,30}(gas|oil|energy))/i, imp: [["UNG", "↑", "rischio produzione/infrastrutture Gulf → gas su"], ["BOIL", "↑", "leva 2x"]] },
  { re: /(opec|crude .{0,10}(cut|sanction)|oil sanction|energy sanction|pipeline (halt|attack|outage)|nord stream)/i, imp: [["UNG", "↑", "shock offerta energia → contagio rialzista sul gas"], ["SPY", "↓", "shock energetico → pressione su azionario"]] },
  { re: /(fed|fomc|interest rate|inflation|cpi|payrolls|recession)/i, imp: [["SPY", "≈", "macro USA: dato hawkish ↓, dovish ↑"]] },
  { re: /(la ni[nñ]a|el ni[nñ]o|monsoon|frost|freeze|polar vortex)/i, imp: [["CORN", "≈", "pattern climatico: valutare fase colturale della regione colpita"], ["SOYB", "≈", "come sopra"], ["UNG", "↑", "freddo estremo → domanda riscaldamento su"]] },
  { re: /(ethanol|biofuel|renewable (fuel|diesel))/i, imp: [["CORN", "↑", "domanda etanolo → domanda mais su"], ["SOYB", "↑", "biodiesel → domanda olio di soia su"]] },
];
export function tagImpacts(title) {
  const out = [];
  const seen = new Set();
  for (const r of TAG_RULES) {
    if (r.re.test(title)) for (const [tk, dir, why] of r.imp) {
      if (!seen.has(tk)) { seen.add(tk); out.push({ tk, dir, why }); }
    }
  }
  return out;
}
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
  if (!items.length) throw new Error("feed vuoto");
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
  if (!items.length) throw new Error("feed non raggiungibili");
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
    {item.analysis && <span style={{ ...mono, fontSize: 9, color: T.blue, border: `1px solid ${T.blue}55`, padding: "2px 6px", borderRadius: 4 }}>ANALISI</span>}
    {(item.impacts || []).length === 0 && <span style={{ ...mono, fontSize: 9, color: T.dim, border: `1px solid ${T.line}`, padding: "2px 6px", borderRadius: 4 }}>macro generale</span>}
    {(item.impacts || []).map((im) => {
      const c = im.dir === "↑" ? T.green : im.dir === "↓" ? T.red : T.mut;
      return (
        <span key={im.tk} title={im.why} style={{ ...mono, fontSize: 9, color: c, border: `1px solid ${c}55`, padding: "2px 6px", borderRadius: 4, cursor: "help" }}>
          {im.tk} {im.dir} · {im.why}
        </span>
      );
    })}
  </div>
);

/* ================================================================
   2) METEO: Open-Meteo (open source) su regioni chiave commodity
================================================================ */
export const REGIONS = [
  { id: "cornbelt", name: "Corn Belt (Iowa, USA)", lat: 41.6, lon: -93.6, affects: ["CORN", "SOYB"], phase: "lug-ago: pollination mais / fioritura soia" },
  { id: "brazil", name: "Mato Grosso (Brasile)", lat: -15.6, lon: -56.1, affects: ["SOYB", "CORN"], phase: "ott-feb: semina/sviluppo soia (ora off-season)" },
  { id: "plains", name: "Plains (Kansas, USA)", lat: 37.7, lon: -97.3, affects: ["WEAT"], phase: "giu-lug: raccolto winter wheat" },
  { id: "blacksea", name: "Odessa (Ucraina)", lat: 46.5, lon: 30.7, affects: ["WEAT", "CORN"], phase: "lug: raccolto grano Mar Nero" },
  { id: "gas-south", name: "Dallas (domanda cooling)", lat: 32.8, lon: -96.8, affects: ["UNG", "BOIL"], phase: "estate: CDD → domanda elettrica per AC" },
  { id: "gas-ne", name: "New York (domanda cooling)", lat: 40.7, lon: -74.0, affects: ["UNG", "BOIL"], phase: "estate: CDD → domanda elettrica per AC" },
];
// Normali climatiche mensili approssimate (Tmax °C e pioggia mm/mese) per il calcolo delle ANOMALIE
const NORMALS = {
  cornbelt: { t: [0, 3, 10, 17, 23, 28, 30, 29, 25, 18, 9, 2], p: [26, 29, 55, 92, 118, 128, 114, 108, 79, 66, 48, 34] },
  brazil:   { t: [31, 31, 31, 31, 30, 30, 31, 33, 34, 33, 31, 31], p: [211, 198, 185, 102, 34, 8, 6, 12, 44, 111, 166, 200] },
  plains:   { t: [6, 9, 15, 21, 25, 31, 34, 33, 28, 21, 13, 7], p: [22, 26, 55, 71, 105, 111, 84, 76, 66, 55, 34, 27] },
  blacksea: { t: [3, 5, 9, 16, 21, 26, 29, 29, 23, 17, 10, 5], p: [38, 33, 31, 30, 34, 42, 32, 32, 34, 30, 39, 42] },
  "gas-south": { t: [14, 17, 21, 25, 29, 33, 36, 36, 32, 26, 20, 15], p: [58, 63, 82, 84, 118, 95, 55, 51, 66, 90, 65, 62] },
  "gas-ne": { t: [4, 6, 11, 17, 22, 27, 30, 29, 25, 18, 12, 7], p: [82, 74, 96, 96, 96, 92, 97, 95, 90, 88, 84, 92] },
};
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
export function weatherSignals(data) {
  // Segnali ad ANOMALIA vs norma climatica del mese (non soglie fisse) + trend prima/seconda settimana
  const sig = [];
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const m0 = new Date().getMonth();
  for (const rg of REGIONS) {
    const d = data[rg.id]; const nz = NORMALS[rg.id];
    if (!d || !nz) continue;
    const tAvg = avg(d.tmax);
    const dT = tAvg - nz.t[m0];
    const rain = d.prec.reduce((a, b) => a + b, 0);
    const dP = rain - nz.p[m0] / 2; // 14 giorni ≈ mezzo mese
    const trend = avg(d.tmax.slice(7)) - avg(d.tmax.slice(0, 7));
    const trendTxt = trend > 1.5 ? "in intensificazione" : trend < -1.5 ? "in attenuazione" : "stabile";
    const isAgri = ["cornbelt", "brazil", "plains", "blacksea"].includes(rg.id);
    if (isAgri) {
      if (dT >= 3 && dP < 0) sig.push({ region: rg.name, tks: rg.affects, dir: "↑", strength: dT >= 5 ? "forte" : "media", why: `Anomalia +${dT.toFixed(1)}°C sopra la norma di ${["Gen","Feb","Mar","Apr","Mag","Giu","Lug","Ago","Set","Ott","Nov","Dic"][m0]} con pioggia sotto norma (${dP.toFixed(0)}mm): stress colturale ${trendTxt} → rialzista` });
      else if (dT >= 3) sig.push({ region: rg.name, tks: rg.affects, dir: "↑", strength: "debole", why: `Caldo anomalo (+${dT.toFixed(1)}°C) ma piogge nella norma: pressione moderata, caldo ${trendTxt}` });
      else if (dP > nz.p[m0] * 0.4 && dT <= 1) sig.push({ region: rg.name, tks: rg.affects, dir: "↓", strength: "media", why: `Piogge abbondanti (+${dP.toFixed(0)}mm vs norma) e temperature regolari: meteo ideale → ribassista` });
      else if (dT <= -3) sig.push({ region: rg.name, tks: rg.affects, dir: "≈", strength: "debole", why: `Fresco anomalo (${dT.toFixed(1)}°C): rallenta lo sviluppo ma non danneggia — neutrale, monitorare` });
      else sig.push({ region: rg.name, tks: rg.affects, dir: "≈", strength: "debole", why: `Nella norma stagionale (ΔT ${dT >= 0 ? "+" : ""}${dT.toFixed(1)}°C, Δpioggia ${dP >= 0 ? "+" : ""}${dP.toFixed(0)}mm): il meteo non è un fattore questa settimana` });
    } else {
      if (dT >= 2.5) sig.push({ region: rg.name, tks: rg.affects, dir: "↑", strength: dT >= 4 ? "forte" : "media", why: `+${dT.toFixed(1)}°C sopra norma → domanda di raffrescamento (CDD) anomala, ${trendTxt} → rialzista gas` });
      else if (dT <= -2.5) sig.push({ region: rg.name, tks: rg.affects, dir: "↓", strength: "media", why: `${dT.toFixed(1)}°C sotto norma → cooling demand debole → ribassista gas` });
      else sig.push({ region: rg.name, tks: rg.affects, dir: "≈", strength: "debole", why: `Temperature in linea con la norma (Δ${dT >= 0 ? "+" : ""}${dT.toFixed(1)}°C): domanda gas regolare` });
    }
  }
  return sig;
}
function weatherSignalsOld(data) {
  const sig = [];
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const g = (id) => data[id];
  if (g("cornbelt")) {
    const d = g("cornbelt");
    const hot = d.tmax.filter((t) => t >= 34).length;
    const rain = d.prec.reduce((a, b) => a + b, 0);
    if (hot >= 3) sig.push({ region: "Corn Belt", tks: ["CORN", "SOYB"], dir: "↑", why: `${hot} giorni ≥34°C nei prossimi 14g durante pollination → rischio rese → rialzista` });
    if (rain < 12) sig.push({ region: "Corn Belt", tks: ["CORN", "SOYB"], dir: "↑", why: `solo ${rain.toFixed(0)}mm di pioggia in 14g → stress idrico → rialzista` });
    if (rain > 60 && hot === 0) sig.push({ region: "Corn Belt", tks: ["CORN", "SOYB"], dir: "↓", why: `${rain.toFixed(0)}mm e temperature miti → meteo ideale → ribassista` });
  }
  if (g("plains")) {
    const d = g("plains");
    const rain = d.prec.reduce((a, b) => a + b, 0);
    if (rain > 50) sig.push({ region: "Plains", tks: ["WEAT"], dir: "↑", why: `${rain.toFixed(0)}mm durante il raccolto → ritardi/qualità a rischio → rialzista` });
    if (rain < 8) sig.push({ region: "Plains", tks: ["WEAT"], dir: "≈", why: "raccolto asciutto e regolare → neutrale/offerta puntuale" });
  }
  if (g("blacksea")) {
    const d = g("blacksea");
    if (d.tmax.filter((t) => t >= 35).length >= 4) sig.push({ region: "Mar Nero", tks: ["WEAT"], dir: "↑", why: "ondata di caldo su area export → rese in calo → rialzista" });
  }
  if (g("gas-south") && g("gas-ne")) {
    const cdd = (avg(g("gas-south").tmax) + avg(g("gas-ne").tmax)) / 2;
    if (cdd >= 33) sig.push({ region: "USA (Sud+NE)", tks: ["UNG", "BOIL"], dir: "↑", why: `Tmax media 14g ${cdd.toFixed(0)}°C → CDD elevati → domanda power burn su → rialzista gas` });
    else if (cdd <= 28) sig.push({ region: "USA (Sud+NE)", tks: ["UNG", "BOIL"], dir: "↓", why: `Tmax media 14g ${cdd.toFixed(0)}°C → cooling demand debole → ribassista gas` });
    else sig.push({ region: "USA (Sud+NE)", tks: ["UNG", "BOIL"], dir: "≈", why: `Tmax media ${cdd.toFixed(0)}°C → domanda nella norma → neutrale` });
  }
  if (g("brazil")) sig.push({ region: "Brasile", tks: ["SOYB"], dir: "≈", why: "off-season colturale: il meteo brasiliano pesa da ottobre (semina)" });
  return sig;
}
export function MeteoTab({ news = [] }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const load = async () => { try { setErr(null); setData(await fetchWeather()); } catch (e) { setErr(String(e.message || e)); } };
  useEffect(() => { load(); }, []);
  const sig = data ? weatherSignals(data) : [];
  // correlazione meteo ↔ news: per ticker, direzione prevalente delle news taggate
  const newsDir = {};
  for (const n of news) for (const im of n.impacts || []) {
    if (!newsDir[im.tk]) newsDir[im.tk] = { up: 0, dn: 0 };
    if (im.dir === "↑") newsDir[im.tk].up++; else if (im.dir === "↓") newsDir[im.tk].dn++;
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
          <Lbl>⚡ SEGNALI ATTIVI · METEO {combined.some((s2) => s2.agree) ? "+ NEWS CONCORDI" : ""}</Lbl>
          <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
            {combined.map((s2, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: s2.dir === "↑" ? T.green : T.red }}>{s2.tks.join("+")} {s2.dir}</span>
                <span style={{ ...mono, fontSize: 9, color: s2.agree ? T.amber : T.dim, border: `1px solid ${s2.agree ? T.amber : T.line}66`, borderRadius: 4, padding: "1px 6px" }}>
                  {s2.agree ? "★ RAFFORZATO: meteo + news nella stessa direzione" : `forza ${s2.strength} (solo meteo)`}
                </span>
              </div>
            ))}
          </div>
          <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>★ = più fonti indipendenti concordano: il segnale pesa di più. Apri prima il tab News per includere la correlazione.</div>
        </Panel>
      )}
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><CloudSun size={11} style={{ verticalAlign: "-1px" }} /> ANOMALIE CLIMATICHE vs NORMA (14 GIORNI) · CAUSA → EFFETTO</Lbl>
          <Btn small ghost onClick={load}><RefreshCw size={11} /> Aggiorna</Btn>
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
          {!data && !err && <div style={{ ...mono, fontSize: 12, color: T.mut }}>Carico previsioni…</div>}
        </div>
      </Panel>
      {data && (
        <Panel style={{ marginTop: 10 }}>
          <Lbl>REGIONI MONITORATE</Lbl>
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
                    <div style={{ ...mono, fontSize: 11, color: T.mut }}>Tmax med {tmaxAvg.toFixed(0)}°C · {hot}g ≥34°C · pioggia {rain.toFixed(0)}mm/14g</div>
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
            <span style={{ ...mono, fontSize: 10, color: T.dim }}>LEGENDA (ogni tacca = 1 giorno, 14 giorni):</span>
            {[["#3a4a5a", "mite <28°C"], ["#8a7434", "caldo 28-33°C"], ["#e8b545", "molto caldo 33-36°C"], ["#d66a5a", "estremo ≥36°C"]].map(([c, l]) => (
              <span key={l} style={{ ...mono, fontSize: 10, color: T.mut, display: "inline-flex", gap: 4, alignItems: "center" }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: c, display: "inline-block" }} /> {l}
              </span>
            ))}
            <span style={{ ...mono, fontSize: 10, color: T.dim }}>· più la tacca è piena/opaca, più pioggia · fonte open-meteo.com</span>
          </div>
        </Panel>
      )}
    </div>
  );
}

/* ================================================================
   3) ALPACA PRO: ordini completi + posizioni/ordini live
================================================================ */
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
export function OrderTicket({ creds, legs, expKey, ticker, buildOcc, quoteFn, estNet, setMsg, onSent }) {
  const [cfg, setCfg] = useState({ qty: 1, type: "limit", tif: "day", limit: "" });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (estNet != null && cfg.limit === "") setCfg((c) => ({ ...c, limit: Math.abs(estNet).toFixed(2) })); }, [estNet]); // eslint-disable-line
  const send = async () => {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false); setBusy(true);
    try {
      const mlegs = legs.map((l) => {
        const q = quoteFn ? quoteFn(l) : null;
        const occ = q?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("seleziona una scadenza reale della chain");
        return { symbol: occ, ratio_qty: String(l.qty), side: l.side > 0 ? "buy" : "sell", position_intent: l.side > 0 ? "buy_to_open" : "sell_to_open" };
      });
      if (mlegs.length > 4) throw new Error("Alpaca accetta max 4 gambe per ordine: dividi la strategia");
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
      setMsg(`Ordine ${cfg.type.toUpperCase()} x${cfg.qty} inviato ad Alpaca PAPER ✓ · id ${o.id?.slice(0, 8)}… · stato ${o.status}`);
    } catch (e) { setMsg(`Invio ordine fallito: ${e.message}`); }
    setBusy(false);
  };
  return (
    <div style={{ marginTop: 12, padding: "10px 12px", background: T.bg, border: `1px solid ${T.violet}44`, borderRadius: 7 }}>
      <Lbl>ORDER TICKET · ALPACA PAPER (multileg)</Lbl>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>QTY</div><Inp type="number" min={1} max={20} value={cfg.qty} onChange={(e) => setCfg({ ...cfg, qty: Math.max(1, +e.target.value) })} style={{ width: 56 }} /></div>
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>TIPO</div>
          <Sel value={cfg.type} onChange={(e) => setCfg({ ...cfg, type: e.target.value })}><option value="limit">Limit (netto)</option><option value="market">Market</option></Sel></div>
        {cfg.type === "limit" && (
          <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>LIMIT NETTO $ (mid: {estNet != null ? Math.abs(estNet).toFixed(2) : "—"})</div>
            <Inp type="number" step="0.01" value={cfg.limit} onChange={(e) => setCfg({ ...cfg, limit: e.target.value })} style={{ width: 90 }} /></div>
        )}
        <div><div style={{ ...mono, fontSize: 9.5, color: T.dim }}>TIF</div>
          <Sel value={cfg.tif} onChange={(e) => setCfg({ ...cfg, tif: e.target.value })}><option value="day">Day</option><option value="gtc">GTC</option></Sel></div>
        <Btn color={confirm ? T.red : T.violet} onClick={send} disabled={busy}>
          <Send size={12} /> {busy ? "Invio…" : confirm ? "CONFERMA INVIO?" : "Invia ordine"}
        </Btn>
        {confirm && <Btn small ghost onClick={() => setConfirm(false)}>Annulla</Btn>}
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Solo paper. Limit sul prezzo NETTO della combinazione (debit positivo). Doppia conferma obbligatoria.</div>
    </div>
  );
}
export function AlpacaDesk({ creds, setMsg }) {
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
    } catch (e) { setMsg(`Sync Alpaca fallita: ${e.message}`); }
    setBusy(false);
  };
  useEffect(() => { sync(); }, []); // eslint-disable-line
  const cancel = async (id) => { try { await alpacaReq(`/v2/orders/${id}`, "DELETE"); setMsg("Ordine cancellato ✓"); sync(); } catch (e) { setMsg(e.message); } };
  // Chiusura strategia intera: 1) cancella ordini aperti sugli stessi contratti (evita "wash trade detected")
  // 2) invia UN ordine complesso di chiusura (mleg) — mai gambe separate
  const closeGroup = async (grp) => {
    try {
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
      setMsg(`Chiusura strategia ${grp.key} inviata come ordine unico ✓`);
      setTimeout(sync, 1500);
    } catch (e) { setMsg(`Chiusura fallita: ${e.message}`); }
  };
  return (
    <Panel style={{ marginTop: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Lbl>ALPACA LIVE · POSIZIONI E ORDINI REALI (PAPER)</Lbl>
        <Btn small ghost onClick={sync} disabled={busy}><RefreshCw size={11} /> Sync</Btn>
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>POSIZIONI APERTE ({pos ? pos.length : "…"})</div>
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
                  <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{g.key} · {g.items.length} gamb{g.items.length === 1 ? "a" : "e"}</div>
                  {g.items.map((x) => (
                    <div key={x.symbol} style={{ ...mono, fontSize: 10, color: T.dim }}>{+x.qty > 0 ? "+" : ""}{x.qty} {x.symbol.slice(-9)} · avg ${(+x.avg_entry_price).toFixed(2)} → ${(+x.current_price).toFixed(2)}</div>
                  ))}
                </div>
                <Stat k="P&L STRATEGIA" v={fmt$(g.pl)} c={g.pl >= 0 ? T.green : T.red} />
                <Btn small ghost color={T.red} onClick={() => closeGroup(g)}><XCircle size={11} /> Chiudi strategia (ordine unico)</Btn>
              </div>
            </div>
          ));
        })()}
        {pos && pos.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>Nessuna posizione su Alpaca.</div>}
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>ORDINI APERTI ({ords ? ords.length : "…"})</div>
      <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
        {(ords || []).map((o) => (
          <div key={o.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ ...mono, fontWeight: 700, color: T.ink, fontSize: 12 }}>{o.order_class === "mleg" ? `MULTILEG x${o.qty} (${(o.legs || []).length} legs)` : `${o.symbol} ${o.side} ${o.qty}`}</div>
              <div style={{ ...mono, fontSize: 10, color: T.dim }}>{o.type}{o.limit_price ? ` @ ${o.limit_price}` : ""} · {o.time_in_force} · {o.status}</div>
            </div>
            <Btn small ghost color={T.red} onClick={() => cancel(o.id)}><Trash2 size={11} /> Cancella</Btn>
          </div>
        ))}
        {ords && ords.length === 0 && <div style={{ ...mono, fontSize: 11, color: T.mut }}>Nessun ordine aperto.</div>}
      </div>
    </Panel>
  );
}

/* ================================================================
   4) AI COPILOT: chat con skill trader precaricate
================================================================ */
const SYSTEM_PROMPT = `Sei il copilot di un trader di opzioni su ETF commodity (SOYB, CORN, UNG, BOIL, WEAT, SPY) in PAPER TRADING.
Regole del trader, da applicare SEMPRE nelle analisi: solo strategie a rischio definito; take profit al 50% del max profit; stop loss al 50% della max loss; uscita a 7 giorni dalla scadenza; max 5% del capitale per trade; esposizione opzioni totale ≤25%; la stagionalità è un segnale primario; posizioni contrarie alla stagionalità richiedono scrutinio extra.
Stile: conciso, numeri espliciti (Greeks, P&L, probabilità), raccomandazioni con freccia →, evidenzia sempre rischi e cosa invaliderebbe la tesi. Non garantire risultati: è analisi educativa su conto paper, non consulenza finanziaria.

METODO DI LAVORO (workflow del trader, seguili in ordine): 1 Discovery (scanner stagionale + trend) → 2 Costruzione (chain reale, strike, Greeks, R/R, breakeven) → 3 Esecuzione (solo dopo conferma esplicita, verifica buying power) → 4 Monitoraggio (P&L vs regole, % del max profit) → 5 Reporting.

ALBERI DECISIONALI: (A) segnale stagionale forte rialzista + trend su → bull call spread (capitale basso) o long call (capitale alto), moderata convinzione → call calendar; (B) mercato neutrale/range e bassa volatilità → iron condor (mai strangle nudi: solo rischio definito); (C) evento in arrivo con IV bassa → long straddle/strangle ATM; IV già alta → vendi premio con rischio definito o aspetta; bias direzionale → vertical spread.

GESTIONE: scaling in/out → parti con 1 contratto, aggiungi se profittevole, chiudi metà al 50% del max profit e tutto al 75%; rolling vicino a scadenza con calendar; se il sottostante va contro → rivaluta la tesi: se invalidata chiudi, non mediare.

FORMATO OUTPUT: sezioni chiare (LEGS / P&L PROFILE / GREEKS / NEXT STEPS), sempre risk/reward, sempre next steps, prima di ogni esecuzione chiedi conferma.`;
export const SKILLS = [
  { id: "pretrade", label: "✓ Analisi pre-trade", prompt: "Esegui l'analisi pre-trade della strategia corrente: valuta struttura, Greeks, R/R, breakeven vs supporti/resistenze, allineamento stagionale e news. Concludi con checklist GO/NO-GO e dimensione posizione secondo la regola del 5%." },
  { id: "positions", label: "♻ Review posizioni", prompt: "Fai la review delle posizioni aperte rispetto alle regole (TP 50%, SL 50%, exit 7 DTE): per ciascuna dai → HOLD / CHIUDI / ROLLA con motivazione e livelli da monitorare." },
  { id: "news", label: "📰 Impatto news", prompt: "Analizza le news taggate nel contesto: quali impattano le mie posizioni e i sottostanti in radar? Distingui rumore da segnale, con causa→effetto e orizzonte temporale." },
  { id: "radar", label: "📡 Radar opportunità", prompt: "Dallo scanner stagionale e dai segnali meteo, proponi le 2 migliori opportunità operative di questa settimana con struttura suggerita (strike relativi, DTE ~45), tesi, rischio e trigger d'ingresso." },
];
export async function askAI(_key, messages, contextStr) {
  const r = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: SYSTEM_PROMPT + "\n\nCONTESTO LIVE (JSON):\n" + contextStr,
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
    data: new Date().toISOString().slice(0, 10),
    ticker_corrente: ticker,
    spot,
    strategia_corrente: A ? { legs, expKey, entry: +(A.entry * 100).toFixed(0), maxProfit: +A.maxProfit.toFixed(0), maxLoss: +A.maxLoss.toFixed(0), breakevens: A.breakevens, greeks: { delta: +A.greeks.delta.toFixed(2), theta: +A.greeks.theta.toFixed(0), vega: +A.greeks.vega.toFixed(0) } } : null,
    posizioni_paper: store.positions.map((p) => ({ ticker: p.ticker, nome: p.name, legs: p.legs, exp: p.expKey, entry: +(p.entryNet * 100).toFixed(0), maxProfit: +p.maxProfit.toFixed(0), maxLoss: +p.maxLoss.toFixed(0), aperta: p.openedAt.slice(0, 10), thesis: p.thesis || null, timeline: (p.timeline || []).slice(-5).map((e) => e.text) })),
    scanner: (scan || []).map((s) => ({ tk: s.tk, stagionale_mese_pct: +s.seasonalScore.toFixed(1), sentiment: s.sugg, fonte: s.real ? "storico reale" : "stima" })),
    news_taggate: (news || []).slice(0, 10).map((n) => ({ titolo: n.title, impatti: n.impacts, geo: !!n.geo })),
    fonte_stagionalita: seasonalSrc,
  });
}
export function CopilotTab({ ctx, apiKey }) {
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (text) => {
    if (!text.trim() || busy) return;
    if (!apiKey) { setErr("Inserisci la tua Anthropic API key in Paper → Integrazioni."); return; }
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
        <Lbl><Sparkles size={11} style={{ verticalAlign: "-1px" }} /> COPILOT AI · SKILL TRADER PRECARICATE · CONTESTO LIVE INIETTATO</Lbl>
        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
          {SKILLS.map((s) => <Btn key={s.id} small ghost color={T.blue} onClick={() => send(s.prompt)} disabled={busy}>{s.label}</Btn>)}
        </div>
        <div style={{ marginTop: 12, display: "grid", gap: 8, maxHeight: 420, overflowY: "auto" }}>
          {msgs.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Usa una skill sopra o scrivi una domanda. Il copilot conosce già: posizioni paper, strategia nel Builder, scanner stagionale, news taggate e le tue regole di rischio.</div>}
          {msgs.map((m, i) => (
            <div key={i} style={{ padding: "9px 11px", borderRadius: 7, background: m.role === "user" ? `${T.blue}14` : T.bg, border: `1px solid ${m.role === "user" ? T.blue + "44" : T.line}` }}>
              <div style={{ ...mono, fontSize: 9, color: m.role === "user" ? T.blue : T.amber, marginBottom: 3 }}>{m.role === "user" ? "TU" : "COPILOT"}</div>
              <div style={{ fontSize: 13, color: T.body, whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          ))}
          {busy && <div style={{ ...mono, fontSize: 11, color: T.amber }}>Il copilot sta analizzando…</div>}
        </div>
        {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <Inp value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send(input)} placeholder="Chiedi al copilot… (Invio per inviare)" style={{ flex: 1 }} />
          <Btn onClick={() => send(input)} disabled={busy}><Send size={13} /></Btn>
        </div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>La tua API key resta nel browser e transita solo verso api.anthropic.com via proxy. Analisi educativa su paper, non consulenza finanziaria.</div>
      </Panel>
    </div>
  );
}

/* ================================================================
   5) REPORT CENTER: routine schedulata + export + webhook
================================================================ */
export function buildReportMd(ctx, weatherSig, aiText) {
  const { store, scan, news, seasonalSrc } = ctx;
  const d = new Date().toLocaleString("it-IT");
  const L = [];
  L.push(`# Report Operativo Commodity Options — ${d}\n`);
  L.push(`## 1 · Opportunità (scanner stagionale)`);
  (scan || []).slice(0, 3).forEach((s, i) => L.push(`${i + 1}. **${s.tk}** — stagionale ${s.seasonalScore > 0 ? "+" : ""}${s.seasonalScore.toFixed(1)}%/m (${s.real ? "storico reale" : "stima"}) → bias **${s.sugg.toUpperCase()}**`));
  L.push(`\n## 2 · Posizioni & segnali regole (TP50/SL50/7DTE)`);
  if (!store.positions.length) L.push("Nessuna posizione paper aperta.");
  store.positions.forEach((p) => {
    const dte = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
    L.push(`- **${p.ticker} · ${p.name}** — exp ${p.expKey || "n/d"} (${dte} DTE)${dte <= 7 ? " ⚠ **≤7 DTE: valuta chiusura/roll**" : ""} · entry ${fmt$(Math.abs(p.entryNet) * 100)} · maxP ${fmt$(p.maxProfit)} / maxL ${fmt$(p.maxLoss)}`);
  });
  if (store.positions.length) {
    const totRisk = store.positions.reduce((a, p) => a + Math.abs(p.maxLoss), 0);
    const totMaxP = store.positions.reduce((a, p) => a + Math.max(0, p.maxProfit), 0);
    L.push(`\n**Portafoglio:** capitale a rischio ${fmt$(totRisk)} · max profit potenziale ${fmt$(totMaxP)}`);
  }
  L.push(`\n## 3 · News rilevanti (tag causa→effetto, incl. geopolitica/governi)`);
  (news || []).filter((n) => (n.impacts || []).length).slice(0, 8).forEach((n) => {
    L.push(`- ${n.title} ${n.geo ? "🏛" : ""}\n  ${(n.impacts || []).map((im) => `**${im.tk} ${im.dir}** (${im.why})`).join(" · ")}`);
  });
  L.push(`\n## 4 · Clima → commodity (14 giorni)`);
  (weatherSig || []).forEach((s) => L.push(`- **${s.tks.join("+")} ${s.dir}** — ${s.region}: ${s.why}`));
  if (aiText) { L.push(`\n## 5 · Analisi del copilot AI`); L.push(aiText); }
  L.push(`\n---\n_Fonte stagionalità: ${seasonalSrc}. Paper trading only. Non è consulenza finanziaria._`);
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
      ${(p2.timeline || []).slice(-4).map((e) => `<p class="tl">${new Date(e.t).toLocaleDateString("it-IT")} · ${e.text.replace(/\[approva:.*?\]/, "")}</p>`).join("")}
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
    <button class="noprint" onclick="window.print()" style="padding:8px 14px;margin-bottom:14px;cursor:pointer">🖨 Stampa / Salva come PDF</button>
    ${body}<h2>Dettaglio posizioni (payoff)</h2>${posHtml || "<p>Nessuna posizione aperta.</p>"}
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
      try { ai = await askAI(apiKey, [{ role: "user", content: "Genera la sezione narrativa del report periodico: sintesi operativa della settimana, priorità sulle posizioni, 2 opportunità dal radar, rischi geopolitici/meteo da monitorare. Max 250 parole, elenco puntato." }], buildContext(ctx)); }
      catch (e) { ai = `(analisi AI non disponibile: ${e.message})`; }
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
      await fetch(store.settings.webhook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject: "Report Commodity Options", markdown: md, generatedAt: new Date().toISOString() }) });
      ctx.setMsg("Report inviato al webhook ✓ (Zapier/Make lo può girare via email)");
    } catch (e) { ctx.setMsg(`Webhook fallito: ${e.message}`); }
  };
  return (
    <div style={{ marginTop: 12 }}>
      <Panel>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Lbl><FileText size={11} style={{ verticalAlign: "-1px" }} /> REPORT CENTER · ROUTINE {cfg.freq === "daily" ? "GIORNALIERA" : "SETTIMANALE"} {isDue ? "· ⚠ IN SCADENZA" : "· ✓ AGGIORNATO"}</Lbl>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <Sel value={cfg.freq} onChange={(e) => setSetting("reportFreq", e.target.value)}>
              <option value="daily">Ogni giorno</option><option value="weekly">Ogni settimana</option>
            </Sel>
            <Btn small onClick={gen} disabled={busy}><RefreshCw size={11} /> {busy ? "Genero…" : "Genera ora"}</Btn>
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...mono, fontSize: 11, color: T.mut, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} /> includi analisi copilot AI
          </label>
          <span style={{ ...mono, fontSize: 10, color: T.dim }}>ultimo: {cfg.last ? new Date(cfg.last).toLocaleString("it-IT") : "mai"}</span>
        </div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>
          Sezioni: opportunità scanner · segnali regole sulle posizioni · news taggate (geo/governi incluse) · clima→commodity · narrativa AI opzionale. Alla riapertura dell'app, se la routine è scaduta, il report si rigenera da solo.
        </div>
      </Panel>
      {md && (
        <Panel style={{ marginTop: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <Lbl>ANTEPRIMA</Lbl>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn small ghost onClick={download}><Download size={11} /> .md</Btn>
              <Btn small color={T.amber} onClick={() => exportPdf(ctx, md)}><FileText size={11} /> Esporta PDF</Btn>
              {store.settings.webhook && <Btn small ghost color={T.violet} onClick={toWebhook}><Send size={11} /> Invia a webhook</Btn>}
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
  comp.push({ k: "Probabilità di profitto", pts: popPts, max: 40, note: cur.pop != null ? `${(cur.pop * 100).toFixed(0)}% ora vs ${th.pop != null ? (th.pop * 100).toFixed(0) : "?"}% all'ingresso` : "n/d" });
  // 2) Stagionalità (20)
  let seaPts = 10;
  if (th.seasonal != null && cur.seasonalNow != null) {
    const same = Math.sign(th.seasonal) === Math.sign(cur.seasonalNow) || th.seasonal === 0;
    seaPts = same ? (Math.abs(cur.seasonalNow) >= Math.abs(th.seasonal) * 0.5 ? 20 : 12) : 4;
  }
  comp.push({ k: "Regime stagionale", pts: seaPts, max: 20, note: `entry ${th.seasonal?.toFixed?.(1) ?? "?"}%/m → ora ${cur.seasonalNow?.toFixed?.(1) ?? "?"}%/m` });
  // 3) IV a favore (20): vega+ vuole IV su, vega- IV giù
  let ivPts = 10;
  if (th.iv != null && cur.ivNow != null && cur.vegaSign) {
    const dIV = cur.ivNow - th.iv;
    const fav = cur.vegaSign * dIV;
    ivPts = fav > 0.01 ? 20 : fav < -0.02 ? 2 : 10;
  }
  comp.push({ k: "Volatilità implicita", pts: ivPts, max: 20, note: `IV ${th.iv != null ? (th.iv * 100).toFixed(0) : "?"}% → ${cur.ivNow != null ? (cur.ivNow * 100).toFixed(0) : "?"}% (vega ${cur.vegaSign > 0 ? "+" : "−"})` });
  // 4) Tempo (20)
  const dtePts = cur.dteLeft > 14 ? 20 : cur.dteLeft > 7 ? 10 : 0;
  comp.push({ k: "Margine temporale", pts: dtePts, max: 20, note: `${cur.dteLeft} DTE (regola exit ≤7)` });
  const tis = comp.reduce((a, c) => a + c.pts, 0);
  return { tis, comp };
}

// Exit Path Simulator: MC giornaliero DA OGGI, regole TP50/SL50/7DTE
export function exitPathSim(pos, S, dteLeft, iv, sigma, nSim = 2000) {
  const { legs, entryNet, maxProfit, maxLoss } = pos;
  const tp = 0.5 * maxProfit, sl = 0.5 * maxLoss;
  const days = Math.max(1, dteLeft - 7);
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

export function GuardianPanel({ pos, spot, dteLeft, ivNow, sigma, seasonalNow, pnlNow, popNow, vegaSign, alpaca, quoteFn, buildOcc, setMsg, logEvent }) {
  const [sim, setSim] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ladderBusy, setLadderBusy] = useState(null);
  const { tis, comp } = computeTIS(pos, { pop: popNow, ivNow, seasonalNow, dteLeft, vegaSign });
  const tisColor = tis >= 70 ? T.green : tis >= 40 ? T.amber : T.red;
  useEffect(() => {
    if (tis < 40) logEvent(pos.id, "tis-low", `TIS ${tis}/100: tesi indebolita — valuta riduzione/chiusura`);
  }, [tis]); // eslint-disable-line
  const runSim = () => {
    setBusy(true);
    setTimeout(() => { setSim(exitPathSim(pos, spot, dteLeft, ivNow || 0.25, sigma)); setBusy(false); }, 30);
  };
  const placeExit = async (label, targetPnl) => {
    setLadderBusy(label);
    try {
      const net = ladderNet(pos.entryNet, targetPnl);
      const mlegs = pos.legs.map((l) => {
        const q = quoteFn ? quoteFn(l) : null;
        const occ = q?.occ || (pos.expKey ? buildOcc(pos.ticker, pos.expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("serve chain reale per i simboli OCC");
        return { symbol: occ, ratio_qty: String(l.qty), side: l.side > 0 ? "sell" : "buy", position_intent: l.side > 0 ? "sell_to_close" : "buy_to_close" };
      });
      let body;
      if (mlegs.length === 1) {
        body = { symbol: mlegs[0].symbol, qty: mlegs[0].ratio_qty, side: mlegs[0].side, type: "limit", time_in_force: "gtc", limit_price: (Math.abs(net) / (+mlegs[0].ratio_qty || 1)).toFixed(2) };
      } else if (mlegs.length > 4) { throw new Error("max 4 gambe per ordine Alpaca"); }
      else {
        body = { order_class: "mleg", qty: "1", type: "limit", time_in_force: "gtc", limit_price: Math.abs(net).toFixed(2), legs: mlegs };
      }
      const o = await alpacaReq("/v2/orders", "POST", body);
      setMsg(`Exit ladder ${label} piazzato GTC @ netto $${Math.abs(net).toFixed(2)} ✓ (${o.id?.slice(0, 8)}…)`);
      logEvent(pos.id, "ladder", `Ordine ${label} GTC @ $${Math.abs(net).toFixed(2)}`);
    } catch (e) { setMsg(`Ladder ${label} fallito: ${e.message}`); }
    setLadderBusy(null);
  };
  const pct = pos.maxProfit > 0 && pnlNow != null ? Math.max(-100, Math.min(130, (pnlNow / pos.maxProfit) * 100)) : null;
  return (
    <div style={{ marginTop: 8, padding: "10px 12px", background: `${T.bg}`, border: `1px solid ${tisColor}44`, borderRadius: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>THESIS INTEGRITY</div>
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
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>PROGRESSO VS MAX PROFIT · TP a 50% · scala-out 75%</div>
          <div style={{ position: "relative", height: 10, background: T.line, borderRadius: 5, marginTop: 3 }}>
            <div style={{ position: "absolute", left: "43.5%", width: 1, top: -2, bottom: -2, background: T.amber }} title="TP 50%" />
            <div style={{ position: "absolute", left: "65.2%", width: 1, top: -2, bottom: -2, background: T.green }} title="75%" />
            <div style={{ width: `${Math.max(0, (pct + 100) / 230 * 100)}%`, height: 10, borderRadius: 5, background: pnlNow >= 0 ? `${T.green}bb` : `${T.red}bb` }} />
          </div>
          <div style={{ ...mono, fontSize: 10, color: pnlNow >= 0 ? T.green : T.red, marginTop: 2 }}>{pct.toFixed(0)}% del max profit ({fmt$(pnlNow)})</div>
        </div>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Btn small ghost color={T.blue} onClick={runSim} disabled={busy}>{busy ? "Simulo…" : "▶ Exit Path Simulator"}</Btn>
        {alpaca && (<>
          <Btn small ghost color={T.green} onClick={() => placeExit("TP50", 0.5 * pos.maxProfit)} disabled={!!ladderBusy}>GTC TP50 @ ${Math.abs(ladderNet(pos.entryNet, 0.5 * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.green} onClick={() => placeExit("TP75", 0.75 * pos.maxProfit)} disabled={!!ladderBusy}>GTC TP75 @ ${Math.abs(ladderNet(pos.entryNet, 0.75 * pos.maxProfit)).toFixed(2)}</Btn>
          <Btn small ghost color={T.red} onClick={() => placeExit("STOP", 0.5 * pos.maxLoss)} disabled={!!ladderBusy}>Stop @ ${Math.abs(ladderNet(pos.entryNet, 0.5 * pos.maxLoss)).toFixed(2)}</Btn>
        </>)}
      </div>
      {sim && (
        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap", padding: "8px 10px", background: `${T.blue}0d`, borderRadius: 6 }}>
          <Stat k="P(TP50 PRIMA)" v={`${(sim.pTP * 100).toFixed(0)}%`} c={T.green} />
          <Stat k="P(STOP PRIMA)" v={`${(sim.pSL * 100).toFixed(0)}%`} c={T.red} />
          <Stat k="P(EXIT 7DTE +)" v={`${(sim.pTimePos * 100).toFixed(0)}%`} c={T.green} />
          <Stat k="P(EXIT 7DTE −)" v={`${(sim.pTimeNeg * 100).toFixed(0)}%`} c={T.red} />
          <Stat k="GIORNI MEDIANI A TP" v={sim.medTPdays ?? "—"} c={T.blue} />
          <Stat k="P&L ATTESO SEGUENDO LE REGOLE" v={fmt$(sim.evExit)} c={sim.evExit >= 0 ? T.green : T.red} />
          <Stat k="CHIUDI ORA vs ATTENDI" v={pnlNow != null ? (pnlNow >= sim.evExit ? "→ CHIUDI ORA" : "→ ATTENDI") : "—"} c={T.amber} />
        </div>
      )}
      {(pos.timeline || []).length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ ...mono, fontSize: 9, color: T.dim }}>TIMELINE</div>
          {(pos.timeline || []).slice(-6).map((e, i) => (
            <div key={i} style={{ ...mono, fontSize: 10, color: T.mut, marginTop: 2 }}>
              <span style={{ color: T.dim }}>{new Date(e.t).toLocaleDateString("it-IT")}</span> · {e.text}
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
          layout: { background: { color: "#14181d" }, textColor: "#8b95a1", fontFamily: "ui-monospace, Menlo, monospace", fontSize: 10 },
          grid: { vertLines: { color: "#1f242b" }, horzLines: { color: "#1f242b" } },
          rightPriceScale: { borderColor: "#2a2f36" },
          timeScale: { borderColor: "#2a2f36" },
          crosshair: { mode: 0 },
        });
        const bars = j.bars.slice(-range);
        const candles = chart.addSeries(CandlestickSeries, {
          upColor: "#7fb85c", downColor: "#d66a5a", borderUpColor: "#7fb85c", borderDownColor: "#d66a5a",
          wickUpColor: "#7fb85c", wickDownColor: "#d66a5a",
        });
        candles.setData(bars);
        const vol = chart.addSeries(HistogramSeries, { priceScaleId: "vol", color: "#3a4a5a", priceFormat: { type: "volume" } });
        chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? "#7fb85c44" : "#d66a5a44" })));
        const line = (price, color, title) => candles.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title });
        (legLines || []).forEach((lg) => {
          candles.createPriceLine({ price: lg.price, color: lg.side > 0 ? "#7fb85c" : "#d66a5a", lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: lg.label });
        });
        (levels?.supports || []).forEach((p) => line(p, "#7fb85c", "OI put"));
        (levels?.resistances || []).forEach((p) => line(p, "#d66a5a", "OI call"));
        (breakevens || []).forEach((p) => line(p, "#5aa7d6", "BE"));
        if (entrySpot) line(entrySpot, "#e8b545", "entry");
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
        <Lbl>GRAFICO {ticker} · CANDELE GIORNALIERE {meta ? `· ${meta.source} (delayed)` : ""}</Lbl>
        <div style={{ display: "flex", gap: 4 }}>
          {[90, 180, 365].map((d) => (
            <Btn key={d} small ghost={range !== d} onClick={() => setRange(d)}>{d === 90 ? "3M" : d === 180 ? "6M" : "1A"}</Btn>
          ))}
        </div>
      </div>
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8, borderRadius: 6, overflow: "hidden" }} />
      {meta?.last && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Ultimo: {meta.last.time} · O {meta.last.open} H {meta.last.high} L {meta.last.low} C {meta.last.close} · linee: muri OI reali (verde/rosso), breakeven strategia (blu), entry (ambra)</div>}
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
        <Lbl>CHAIN {expKey} · CLICCA UNA CELLA: 1° click COMPRA · 2° VENDI · 3° RIMUOVI</Lbl>
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
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Riga evidenziata = strike più vicino allo spot (${spot.toFixed(2)}). Sfondo azzurrato = in-the-money. Dati reali CBOE (delayed ~15m).</div>
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
        <Lbl>STORICO CONTRATTO · {label} {src ? `· ${src}` : ""}</Lbl>
        <Btn small ghost onClick={onClose}>✕ chiudi</Btn>
      </div>
      {quote && (
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
          ora: mid {quote.mid?.toFixed(2) ?? "—"} · IV {quote.iv ? (quote.iv * 100).toFixed(0) + "%" : "—"} · OI {quote.oi ?? "—"} · vol {quote.vol ?? "—"}
        </div>
      )}
      {err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 6 }}>{err}</div>}
      <div ref={ref} style={{ marginTop: 8 }} />
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>
        Ti dice se stai comprando il contratto su massimi di premio o dopo uno sgonfiamento: informazione che il payoff non mostra.
      </div>
    </div>
  );
}

/* ================================================================
   11) VISTA UNIFICATA — Prezzo storico × Cono probabilità × Zone strategia
   Un solo asse prezzi: candele, proiezione MC, zone P&L, strike, breakeven.
================================================================ */
// ---- Motore analisi tecnica minimale (SMA, RSI, struttura) ----
export function taSignals(bars) {
  if (!bars || bars.length < 60) return null;
  const cl = bars.map((b) => b.close);
  const sma = (n, i = cl.length - 1) => cl.slice(i - n + 1, i + 1).reduce((a, b) => a + b, 0) / n;
  const s20 = sma(20), s50 = sma(50), s20p = sma(20, cl.length - 6), s50p = sma(50, cl.length - 6);
  const px = cl[cl.length - 1];
  let g = 0, l = 0;
  for (let i = cl.length - 14; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
  const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  const trend = s20 > s50 && s20 > s20p ? 1 : s20 < s50 && s20 < s20p ? -1 : 0;
  const cross = s20 > s50 && s20p <= s50p ? "golden" : s20 < s50 && s20p >= s50p ? "death" : null;
  return { trend, rsi, s20, s50, cross, px,
    trendTxt: trend > 0 ? "rialzista (SMA20>SMA50, in salita)" : trend < 0 ? "ribassista (SMA20<SMA50, in discesa)" : "laterale (medie piatte/incrociate)" };
}
export function confluence(seasonalM, ta) {
  if (!ta) return null;
  const seaDir = seasonalM > 0.8 ? 1 : seasonalM < -0.8 ? -1 : 0;
  let verdict, c, advice;
  if (seaDir !== 0 && ta.trend === seaDir) { verdict = "GO DIREZIONALE"; c = T.green; advice = `2 conferme: stagionalità ${seaDir > 0 ? "↑" : "↓"} + trend tecnico concorde → vertical spread ${seaDir > 0 ? "rialzista" : "ribassista"}, size piena consentita (entro il 5%).`; }
  else if (seaDir !== 0 && ta.trend === -seaDir) { verdict = "DIVERGENZA"; c = T.amber; advice = `Stagionalità ${seaDir > 0 ? "↑" : "↓"} ma trend tecnico opposto: riduci la size o attendi che il trend giri. In alternativa struttura a intervallo.`; }
  else if (seaDir === 0 && ta.trend === 0) { verdict = "REGIME DA INTERVALLO"; c = T.blue; advice = "Né stagione né trend spingono: iron condor / butterfly sui muri OI, il tempo lavora per te."; }
  else { verdict = "SEGNALE SINGOLO"; c = T.mut; advice = seaDir !== 0 ? "Solo la stagionalità spinge (trend neutro): direzionale a size ridotta o attendi conferma tecnica." : "Solo il trend spinge (stagione neutra): segui il tecnico con size ridotta."; }
  const warn = ta.rsi >= 70 ? "⚠ RSI " + ta.rsi.toFixed(0) + " ipercomprato: timing d'ingresso rialzista sfavorevole, attendi un pullback." : ta.rsi <= 30 ? "⚠ RSI " + ta.rsi.toFixed(0) + " ipervenduto: timing ribassista sfavorevole, possibile rimbalzo." : null;
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
  if (err) return <div style={{ ...mono, fontSize: 11, color: T.red }}>Grafico non disponibile: {err}</div>;
  if (!bars || !spot || !curve?.length) return <div style={{ ...mono, fontSize: 11, color: T.mut }}>Carico vista unificata…</div>;

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
        {[[180, "6M"], [365, "1A"], [1825, "5A"]].map(([v, l]) => (
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
        <text x={xToday + 4} y={padT + 10} fill={T.amber} fontSize={9.5} fontFamily="monospace">OGGI ${spot.toFixed(2)}</text>
        <text x={xEnd - 4} y={padT + 10} fill={T.dim} fontSize={9.5} fontFamily="monospace" textAnchor="end">SCADENZA · {dte} DTE</text>
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
        {[["■", T.green + "44", "zona di PROFITTO a scadenza"], ["■", T.violet + "55", "cono probabilità (chiaro 5–95% · scuro 25–75%)"], ["┅", T.violet, "mediana attesa"], ["—", T.blue, "breakeven"], ["—", T.green, "gamba comprata"], ["—", T.red, "gamba venduta"]].map(([g, c, l]) => (
          <span key={l} style={{ ...mono, fontSize: 9.5, color: T.mut }}><span style={{ color: c, fontWeight: 800 }}>{g}</span> {l}</span>
        ))}
      </div>
      <div style={{ marginTop: 8, padding: "8px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
        <b style={{ color: T.ink }}>Lettura:</b> il cono viola mostra dove il prezzo può realisticamente arrivare entro la scadenza (volatilità reale + stagionalità); le fasce verdi sono dove la tua strategia guadagna. Sovrapposizione cono↔verde ≈ <b style={{ color: pIn >= 0.5 ? T.green : T.violet }}>{(pIn * 100).toFixed(0)}%</b> — {"coerente con la CHANCE della strategia (stesso modello, stessa scala)"}.
      </div>
    </div>
  );
}
