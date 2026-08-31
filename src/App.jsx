import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from "recharts";
import {
  RefreshCw, ShieldCheck, Save, Trash2, Play, Layers, Radar, Box,
  FlaskConical, Briefcase, Plus, Newspaper, Plug, Send, ExternalLink, CloudSun, MessageSquare, FileText, Compass, Bell, Home,
} from "lucide-react";
import { fetchAllNews, fetchWeather, ImpactTags, MeteoTab, CopilotTab, ReportTab, OrderTicket, AlpacaDesk, scaleStrategy, probProfit, buildContext, GuardianPanel, PriceChart, ChainMatrix, PayoffThumb, OptionPanel, UnifiedView, taSignals, confluence, WhyThisTrade } from "./pro.jsx";
import { fuseSignals, sentimentDirection, withSignalRank, compareCandidates, againstSignal } from "./signals.js";
import { N as nCDF, bs as bsPrice, smile as smileIV, payoff as payoffExp, SEASONAL, SIGMA } from "./engine.js";
import { T } from "./theme.js";

/* ============================== THEME ============================== */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };

/* ============================== MATH: Black-Scholes (Greeks only — shared engine covers price/payoff) ============================== */
const nPDF = (x) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
const R = 0.045;

function bsGreeks(S, K, Tyr, iv, type) {
  if (Tyr <= 0 || iv <= 0) return { delta: 0, gamma: 0, theta: 0, vega: 0 };
  const sq = Math.sqrt(Tyr);
  const d1 = (Math.log(S / K) + (R + 0.5 * iv * iv) * Tyr) / (iv * sq);
  const d2 = d1 - iv * sq;
  const delta = type === "call" ? nCDF(d1) : nCDF(d1) - 1;
  const gamma = nPDF(d1) / (S * iv * sq);
  const theta = ((-S * nPDF(d1) * iv / (2 * sq)) - (type === "call" ? 1 : -1) * R * K * Math.exp(-R * Tyr) * nCDF(type === "call" ? d2 : -d2)) / 365;
  const vega = S * nPDF(d1) * sq / 100;
  return { delta, gamma, theta, vega };
}

/* ============================== UNDERLYINGS (fallback stats) ============================== */
const UNDERLYINGS = {
  SOYB: { name: "Soybeans", iv: 0.20, sigma: SIGMA.SOYB, step: 0.5,
    monthlyMean: SEASONAL.SOYB,
    newsQ: "soybean futures prices" },
  CORN: { name: "Corn", iv: 0.24, sigma: SIGMA.CORN, step: 0.5,
    monthlyMean: SEASONAL.CORN,
    newsQ: "corn futures USDA crop" },
  UNG: { name: "US Natural Gas", iv: 0.45, sigma: SIGMA.UNG, step: 0.5,
    monthlyMean: SEASONAL.UNG,
    newsQ: "natural gas prices storage EIA" },
  BOIL: { name: "2x Natural Gas", iv: 0.85, sigma: SIGMA.BOIL, step: 1,
    monthlyMean: SEASONAL.BOIL,
    newsQ: "natural gas prices forecast" },
  WEAT: { name: "Wheat", iv: 0.26, sigma: SIGMA.WEAT, step: 0.25,
    monthlyMean: SEASONAL.WEAT,
    newsQ: "wheat futures prices" },
  SPY: { name: "S&P 500 ETF", iv: 0.13, sigma: SIGMA.SPY, step: 5,
    monthlyMean: SEASONAL.SPY,
    newsQ: "S&P 500 stock market outlook" },
};
const MONTHS_IT = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
const NOW_MONTH = new Date().getMonth();
// Accesso SICURO alle statistiche del sottostante: qualunque ticker (anche importato
// da Alpaca o salvato da versioni precedenti) ha sempre un fallback valido.
// Questo elimina la causa n.1 delle "schermate nere" (crash su UNDERLYINGS[ticker] undefined).
const FALLBACK_U = (tk) => ({ name: tk, iv: 0.30, sigma: 0.30, step: 0.5, monthlyMean: Array(12).fill(0), newsQ: `${tk} price outlook`, fallback: true });
const getU = (tk) => UNDERLYINGS[tk] || FALLBACK_U(tk || "?");

/* ============================== CBOE REAL OPTION CHAIN ============================== */
// Endpoint pubblico CBOE (dati ritardati ~15min): bid/ask, IV, OI, volume, greche REALI per strike
function parseOcc(occ) {
  const m = occ.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    und: m[1],
    exp: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] === "C" ? "call" : "put",
    strike: parseInt(m[6], 10) / 1000,
    occ,
  };
}
function buildOcc(sym, expISO, type, strike) {
  const d = expISO.replaceAll("-", "").slice(2); // YYMMDD
  const k = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${sym.toUpperCase()}${d}${type === "call" ? "C" : "P"}${k}`;
}
const CBOE_URL = (sym) => `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym.toUpperCase()}.json`;

async function fetchCboeDirect(sym) {
  const r = await fetch(CBOE_URL(sym));
  if (!r.ok) throw new Error("CBOE " + r.status);
  return parseCboeJson(sym, await r.json());
}
function parseCboeJson(sym, j) {
  const d = j.data || {};
  const spot = d.current_price ?? d.close ?? d.last ?? null;
  const byExp = {};
  for (const o of d.options || []) {
    const p = parseOcc(o.option || "");
    if (!p) continue;
    const dte = Math.round((new Date(p.exp) - Date.now()) / 86400000);
    if (dte < 0 || dte > 400) continue; // fino a ~13 mesi: tutte le scadenze CBOE disponibili
    if (!byExp[p.exp]) byExp[p.exp] = { dte, calls: {}, puts: {} };
    const mid = o.bid > 0 && o.ask > 0 ? (o.bid + o.ask) / 2 : (o.last_trade_price || null);
    byExp[p.exp][p.type === "call" ? "calls" : "puts"][p.strike] = {
      bid: o.bid, ask: o.ask, mid, iv: o.iv || null, oi: o.open_interest || 0,
      vol: o.volume || 0, delta: o.delta, theta: o.theta, occ: p.occ,
    };
  }
  const expirations = Object.keys(byExp).sort();
  if (!expirations.length) throw new Error("chain vuota");
  return { spot, byExp, expirations, updated: new Date().toISOString(), source: "CBOE diretta" };
}

// Fallback: proxy serverless della web app (nessun problema CORS/CSP)
async function proxied(url) {
  const r = await fetch(`/api/proxy?url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error("proxy " + r.status);
  return r;
}
async function fetchCboeChain(sym) {
  // 1) endpoint server dedicato (gestisce varianti simbolo + header browser)
  try {
    const r = await fetch(`/api/chain?sym=${encodeURIComponent(sym)}`);
    if (r.ok) { const c = parseCboeJson(sym, await r.json()); return { ...c, source: "CBOE (server)" }; }
    const err = await r.json().catch(() => ({}));
    throw new Error((err.tried || [err.error]).join(" | "));
  } catch (eServer) {
    // 2) fetch diretta (funziona in locale/dev)
    try { return await fetchCboeDirect(sym); }
    catch (eDirect) { throw new Error(`server: ${eServer.message} · diretta: ${eDirect.message}`); }
  }
}

/* ============================== ALPHA VANTAGE: storico 10y+ ============================== */
function statsFromMatrix(matrix) {
  // matrix: [[year, r1..r12 in %], ...] — calcola medie mensili e sigma localmente
  const all = [];
  const monthlyMean = Array.from({ length: 12 }, (_, m) => {
    const xs = matrix.map((row) => row[m + 1]).filter((x) => x != null && !Number.isNaN(x));
    xs.forEach((x) => all.push(x / 100));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  });
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const varr = all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length - 1);
  return { monthlyMean, sigma: Math.sqrt(varr * 12), years: matrix.length };
}
const AV_URL = (sym, key) => `https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${sym}&apikey=${key}`;
function parseAvJson(j) {
  const ts = j["Monthly Adjusted Time Series"];
  if (!ts) throw new Error(j["Note"] || j["Information"] || j["Error Message"] || "risposta vuota (rate limit?)");
  const rows = Object.entries(ts)
    .map(([date, v]) => ({ date, close: parseFloat(v["5. adjusted close"]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 10);
  const recent = rows.filter((r2) => new Date(r2.date) >= cutoff);
  const byYM = {};
  for (let i = 1; i < recent.length; i++) {
    const d = new Date(recent[i].date);
    if (!byYM[d.getFullYear()]) byYM[d.getFullYear()] = Array(12).fill(null);
    byYM[d.getFullYear()][d.getMonth()] = (recent[i].close / recent[i - 1].close - 1) * 100;
  }
  const matrix = Object.entries(byYM).map(([y, ms]) => [+y, ...ms]);
  return { matrix, from: recent[0]?.date };
}
async function fetchHistory(sym) {
  const r = await fetch(`/api/av?sym=${encodeURIComponent(sym)}`);
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || `HTTP ${r.status}`); }
  const h = parseAvJson(await r.json()); h.src = "Alpha Vantage (server)";
  const st = statsFromMatrix(h.matrix);
  return { ...st, matrix: h.matrix, from: h.from, src: `${h.src} · ${st.years}y` };
}

/* ============================== NEWS RSS (via proxy serverless) ============================== */
async function fetchRss(url) {
  let r;
  try { r = await fetch(url); if (!r.ok) throw new Error("rss " + r.status); }
  catch { r = await proxied(url); }
  const xml = await r.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = Array.from(doc.querySelectorAll("item"));
  if (!items.length) throw new Error("feed vuoto");
  return items.slice(0, 12).map((it) => ({
    title: it.querySelector("title")?.textContent || "",
    link: it.querySelector("link")?.textContent || "",
    date: it.querySelector("pubDate")?.textContent || "",
    src: it.querySelector("source")?.textContent || new URL(url).hostname,
  }));
}
async function fetchNews(ticker) {
  const q = getU(ticker).newsQ;
  const feeds = [
    `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`,
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${ticker}&region=US&lang=en-US`,
  ];
  const results = await Promise.allSettled(feeds.map(fetchRss));
  const items = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  if (!items.length) throw new Error("feed non raggiungibili");
  const seen = new Set();
  return items.filter((i) => i.title && !seen.has(i.title) && seen.add(i.title))
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 18);
}

/* ============================== ALPACA PAPER (via proxy serverless /api/alpaca) ============================== */
async function alpacaGet(path) {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  return r.json();
}
async function alpacaOrderMleg(legs) {
  const body = {
    order_class: "mleg", qty: "1", type: "market", time_in_force: "day",
    legs: legs.map((l) => ({
      symbol: l.occ,
      ratio_qty: String(l.qty),
      side: l.side > 0 ? "buy" : "sell",
      position_intent: l.side > 0 ? "buy_to_open" : "sell_to_open",
    })),
  };
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent("/v2/orders")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  return r.json();
}

/* ============================== STRATEGY PRESETS ============================== */
const SENTIMENTS = [
  { id: "verybear", label: "Very Bear", color: "#c0392b", icon: "⭣⭣", tgt: -0.08 },
  { id: "bear", label: "Bear", color: T.red, icon: "⭣", tgt: -0.04 },
  { id: "neutral", label: "Neutral", color: T.mut, icon: "→", tgt: 0 },
  { id: "bull", label: "Bull", color: T.green, icon: "⭡", tgt: 0.04 },
  { id: "verybull", label: "Very Bull", color: "#4a9e3f", icon: "⭡⭡", tgt: 0.08 },
];
// se c'è la chain reale, gli strike vengono agganciati ai più vicini disponibili
function snapStrike(x, strikes, step) {
  if (!strikes || !strikes.length) return Math.round(x / step) * step;
  return strikes.reduce((best, k) => (Math.abs(k - x) < Math.abs(best - x) ? k : best), strikes[0]);
}
function buildPresets(sent, S, step, strikes) {
  const K = (pct) => snapStrike(S * (1 + pct), strikes, step);
  const P = {
    verybear: [
      { name: "Long Put ATM", raw: [[1, "put", 0]] },
      { name: "Bear Put Spread largo", raw: [[1, "put", 0], [-1, "put", -0.1]] },
      { name: "Put Butterfly ribassista", raw: [[1, "put", 0], [-2, "put", -0.06], [1, "put", -0.12]] },
    ],
    bear: [
      { name: "Bear Call Spread", raw: [[-1, "call", 0.03], [1, "call", 0.08]] },
      { name: "Bear Put Spread", raw: [[1, "put", 0], [-1, "put", -0.05]] },
    ],
    neutral: [
      { name: "Iron Condor", raw: [[1, "put", -0.1], [-1, "put", -0.05], [-1, "call", 0.05], [1, "call", 0.1]] },
      { name: "Iron Butterfly", raw: [[1, "put", -0.07], [-1, "put", 0], [-1, "call", 0], [1, "call", 0.07]] },
      { name: "Call Butterfly ATM", raw: [[1, "call", -0.05], [-2, "call", 0], [1, "call", 0.05]] },
    ],
    bull: [
      { name: "Bull Call Spread", raw: [[1, "call", 0], [-1, "call", 0.05]] },
      { name: "Bull Put Spread (credito)", raw: [[-1, "put", -0.03], [1, "put", -0.08]] },
    ],
    verybull: [
      { name: "Long Call ATM", raw: [[1, "call", 0]] },
      { name: "Bull Call Spread largo", raw: [[1, "call", 0], [-1, "call", 0.1]] },
      { name: "Call Butterfly rialzista", raw: [[1, "call", 0], [-2, "call", 0.06], [1, "call", 0.12]] },
    ],
  };
  return P[sent].map((p) => ({
    name: p.name,
    legs: p.raw.map(([s, t, pct]) => ({ side: Math.sign(s), qty: Math.abs(s), type: t, strike: K(pct) })),
  }));
}

/* ============================== PRICING ENGINE (ibrido: chain reale → BS) ============================== */
function makeQuote(chain, expKey) {
  return (leg) => {
    if (!chain || !expKey || !chain.byExp[expKey]) return null;
    return chain.byExp[expKey][leg.type === "call" ? "calls" : "puts"][leg.strike] || null;
  };
}
function priceLeg(leg, S, dte, baseIV, q) {
  const quote = q ? q(leg) : null;
  if (quote && quote.mid != null) return { px: quote.mid, iv: quote.iv || smileIV(baseIV, S, leg.strike), real: true, occ: quote.occ, oi: quote.oi, vol: quote.vol };
  const iv = smileIV(baseIV, S, leg.strike);
  return { px: bsPrice(S, leg.strike, dte / 365, iv, leg.type), iv, real: false };
}
function netValue(legs, S, dte, baseIV, q) {
  return legs.reduce((a, l) => a + Math.sign(l.side) * l.qty * priceLeg(l, S, dte, baseIV, q).px, 0);
}
function scenarioValue(legs, S, dte, baseIV, ivMap) {
  return legs.reduce((a, l, i) => {
    const iv = ivMap ? ivMap[i] : smileIV(baseIV, S, l.strike);
    return a + Math.sign(l.side) * l.qty * bsPrice(S, l.strike, dte / 365, iv, l.type);
  }, 0);
}
function netGreeks(legs, S, dte, baseIV, ivMap) {
  return legs.reduce((a, l, i) => {
    const iv = ivMap ? ivMap[i] : smileIV(baseIV, S, l.strike);
    const g = bsGreeks(S, l.strike, dte / 365, iv, l.type);
    const m = Math.sign(l.side) * l.qty;
    return { delta: a.delta + m * g.delta, gamma: a.gamma + m * g.gamma, theta: a.theta + m * g.theta * 100, vega: a.vega + m * g.vega * 100 };
  }, { delta: 0, gamma: 0, theta: 0, vega: 0 });
}
function analyze(legs, S, dte, baseIV, q) {
  const legPx = legs.map((l) => priceLeg(l, S, dte, baseIV, q));
  const ivMap = legPx.map((p) => p.iv);
  const entry = legs.reduce((a, l, i) => a + Math.sign(l.side) * l.qty * legPx[i].px, 0);
  const realCount = legPx.filter((p) => p.real).length;
  const lo = S * 0.7, hi = S * 1.3, N = 240;
  let maxP = -Infinity, maxL = Infinity;
  const curve = []; const bes = []; let prev = null;
  for (let i = 0; i <= N; i++) {
    const s = lo + (i / N) * (hi - lo);
    const pnl = (payoffExp(legs, s) - entry) * 100;
    const pnlMid = (scenarioValue(legs, s, dte / 2, baseIV, ivMap) - entry) * 100;
    const pnlNow = (scenarioValue(legs, s, Math.max(0.5, dte), baseIV, ivMap) - entry) * 100;
    curve.push({ s: +s.toFixed(2), exp: +pnl.toFixed(0), mid: +pnlMid.toFixed(0), now: +pnlNow.toFixed(0) });
    if (pnl > maxP) maxP = pnl;
    if (pnl < maxL) maxL = pnl;
    if (prev !== null && Math.sign(prev) !== Math.sign(pnl) && Math.sign(pnl) !== 0) bes.push(+(lo + ((i - 0.5) / N) * (hi - lo)).toFixed(2));
    prev = pnl;
  }
  return { entry, curve, maxProfit: maxP, maxLoss: maxL, breakevens: bes, greeks: netGreeks(legs, S, dte, baseIV, ivMap), realCount, legPx };
}

/* ============================== MONTE CARLO + BACKTEST STORICO ============================== */
function montecarlo(legs, S, dte, entry, sigma, monthlyMean, nSim = 8000) {
  const Tyr = dte / 365;
  const span = Math.max(1, Math.round(dte / 30));
  let mu = 0;
  for (let i = 0; i < span; i++) mu += monthlyMean[(NOW_MONTH + i) % 12] / 100;
  mu = (mu / span) * 12;
  const pnls = new Float64Array(nSim);
  let wins = 0, sum = 0;
  for (let i = 0; i < nSim; i++) {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const ST = S * Math.exp((mu - 0.5 * sigma * sigma) * Tyr + sigma * Math.sqrt(Tyr) * z);
    const pnl = (payoffExp(legs, ST) - entry) * 100;
    pnls[i] = pnl; sum += pnl; if (pnl > 0) wins++;
  }
  const sorted = Array.from(pnls).sort((a, b) => a - b);
  const qq = (p) => sorted[Math.floor(p * (nSim - 1))];
  const lo = qq(0.01), hi = qq(0.99), B = 30;
  const bins = Array.from({ length: B }, (_, i) => ({ x: +(lo + ((i + 0.5) / B) * (hi - lo)).toFixed(0), n: 0 }));
  for (const p of pnls) { const idx = Math.min(B - 1, Math.max(0, Math.floor(((p - lo) / (hi - lo)) * B))); bins[idx].n++; }
  return { pop: wins / nSim, ev: sum / nSim, p5: qq(0.05), p50: qq(0.5), p95: qq(0.95), bins, muAnn: mu };
}
// Backtest su rendimenti storici reali: applica il payoff alla finestra stagionale di ogni anno passato
function histBacktest(legs, S, dte, entry, matrix) {
  if (!matrix || !matrix.length) return null;
  const span = Math.max(1, Math.round(dte / 30));
  const out = [];
  for (const row of matrix) {
    const [y, ...ms] = row;
    let cum = 1, ok = true;
    for (let i = 0; i < span; i++) {
      const r = ms[(NOW_MONTH + i) % 12];
      if (r == null || Number.isNaN(r)) { ok = false; break; }
      cum *= 1 + r / 100;
    }
    if (!ok) continue;
    const ST = S * cum;
    out.push({ year: String(y), ret: (cum - 1) * 100, pnl: (payoffExp(legs, ST) - entry) * 100 });
  }
  if (!out.length) return null;
  const wins = out.filter((o) => o.pnl > 0).length;
  return { rows: out, winRate: wins / out.length, avg: out.reduce((a, b) => a + b.pnl, 0) / out.length };
}

/* ============================== 3D DATA da chain reale ============================== */
function oiGridFromChain(chain, S) {
  if (!chain) return null;
  const exps = chain.expirations.filter((e) => chain.byExp[e].dte >= 7 && chain.byExp[e].dte <= 120).slice(0, 6);
  if (!exps.length) return null;
  const strikeSet = new Set();
  for (const e of exps) {
    for (const k of Object.keys(chain.byExp[e].calls)) { const kk = +k; if (kk > S * 0.8 && kk < S * 1.2) strikeSet.add(kk); }
    for (const k of Object.keys(chain.byExp[e].puts)) { const kk = +k; if (kk > S * 0.8 && kk < S * 1.2) strikeSet.add(kk); }
  }
  const strikes = Array.from(strikeSet).sort((a, b) => a - b);
  if (strikes.length < 3) return null;
  const g = (e, k) => {
    const c = chain.byExp[e].calls[k], p = chain.byExp[e].puts[k];
    return { oi: (c?.oi || 0) + (p?.oi || 0), vol: (c?.vol || 0) + (p?.vol || 0), oiC: c?.oi || 0, oiP: p?.oi || 0 };
  };
  return {
    strikes, dtes: exps.map((e) => chain.byExp[e].dte), exps,
    oi: exps.map((e) => strikes.map((k) => g(e, k).oi)),
    vol: exps.map((e) => strikes.map((k) => g(e, k).vol)),
    oiCallTot: strikes.map((k) => exps.reduce((a, e) => a + g(e, k).oiC, 0)),
    oiPutTot: strikes.map((k) => exps.reduce((a, e) => a + g(e, k).oiP, 0)),
    real: true,
  };
}
function levelsFromGrid(grid, S) {
  if (!grid) return null;
  const sup = grid.strikes.map((k, j) => ({ k, v: grid.oiPutTot[j] })).filter((x) => x.k < S).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.k).sort((a, b) => b - a);
  const res = grid.strikes.map((k, j) => ({ k, v: grid.oiCallTot[j] })).filter((x) => x.k > S).sort((a, b) => b.v - a.v).slice(0, 3).map((x) => x.k).sort((a, b) => a - b);
  return { supports: sup, resistances: res };
}


/* ============================== STORAGE (localStorage del browser) ============================== */
const SKEY = "options-lab-state";
async function loadState() {
  try { const v = localStorage.getItem(SKEY); return v ? JSON.parse(v) : null; }
  catch { return null; }
}
const EMPTY = { saved: [], positions: [], settings: { webhook: "", reportFreq: "weekly", reportLast: 0, reportLastMd: "", capital: 5000, mode: "pro" }, seasonal: {}, journal: [], ivHist: {} };
async function saveState(st) {
  try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) { console.error(e); }
  // sync server (abilita Autopilot ad app chiusa); fire-and-forget
  try { fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions: st.positions, settings: { webhook: st.settings?.webhook } }) }); } catch { /* offline ok */ }
}

/* ============================== UI ATOMS ============================== */
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    style={{
      ...mono, fontSize: small ? 11 : 12, padding: small ? "4px 8px" : "8px 12px", borderRadius: 6,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      background: ghost ? "transparent" : color, color: ghost ? color : "#14181d",
      border: ghost ? `1px solid ${color}66` : "none", display: "inline-flex", alignItems: "center", gap: 6,
    }}>{children}</button>
);
const Panel = ({ children, style }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: 14, ...style }}>{children}</div>
);
const Lbl = ({ children }) => <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber }}>{children}</div>;
const Stat = ({ k, v, c, tip }) => (
  <div>
    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{k}{tip && <span title={tip} style={{ cursor: "help", color: T.blue, marginLeft: 3 }}>ⓘ</span>}</div>
    <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: c || T.ink }}>{v}</div>
  </div>
);
const Inp = (props) => (
  <input {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />
);
const fmt$ = (x) => (x === Infinity || x === -Infinity || x == null || Number.isNaN(x)) ? "—" : `${x < 0 ? "-" : ""}$${Math.abs(x).toFixed(0)}`;
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? `${m}m fa` : m < 1440 ? `${Math.round(m / 60)}h fa` : `${Math.round(m / 1440)}g fa`; };

/* ============================== MAIN ============================== */
class TabBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) return (
      <div style={{ marginTop: 12, padding: 16, background: T.panel, border: `1px solid ${T.red}66`, borderRadius: 8 }}>
        <div style={{ ...mono, fontSize: 11, color: T.red, fontWeight: 700 }}>⚠ ERRORE IN QUESTA SEZIONE (il resto dell'app funziona)</div>
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 6, whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err).slice(0, 300)}</div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Copia questo messaggio e incollalo in chat per il fix. Cambia tab per continuare a usare l'app.</div>
      </div>
    );
    return this.props.children;
  }
}

export default function OptionsStrategyLab() {
  const [tab, setTab] = useState("wizard");
  const [ticker, setTicker] = useState("SOYB");
  const [chains, setChains] = useState({});      // ticker -> chain CBOE
  const [seasonal, setSeasonal] = useState({});  // ticker -> {monthlyMean, sigma, rets, years} da Alpha Vantage
  const [news, setNews] = useState({});          // ticker -> items
  const [sentiment, setSentiment] = useState("bull");
  const [expKey, setExpKey] = useState(null);
  const [dteManual, setDteManual] = useState(45);
  const [legs, setLegs] = useState([]);
  const [stratName, setStratName] = useState("Bull Call Spread");
  const [store, setStore] = useState(EMPTY);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [mc, setMc] = useState(null);
  const [bt, setBt] = useState(null);
  const [alpaca, setAlpaca] = useState(null);    // account info
  const [confirmSend, setConfirmSend] = useState(false);
  const [optMode, setOptMode] = useState("budget");
  const [optAmt, setOptAmt] = useState(500);
  const [autoMon, setAutoMon] = useState(true);
  const [optLeg, setOptLeg] = useState(null); // {occ, label, quote}
  const [alSync, setAlSync] = useState({ orders: [], positions: [], t: 0 });
  const [ta, setTa] = useState({}); // per ticker
  const [replay, setReplay] = useState(null);
  const [nf, setNf] = useState({ tk: "ALL", kind: "all", q: "", days: 7 });
  const [multi, setMulti] = useState({ sel: ["SOYB", "CORN", "UNG"], busy: false, res: null, err: null, dteT: 45, senMode: "auto" });
  const [wiz, setWiz] = useState({ risk: 250, horizon: 45, conviction: "moderate", busy: false, result: null, err: null });
  const [optRef, setOptRef] = useState(null); // snapshot prezzi Optimizer per riconciliazione col Builder
  const [weather, setWeather] = useState(null);  // regionId -> forecast 14g (fuseSignals)
  const [barsCache, setBarsCache] = useState({}); // ticker -> daily bars (fattore tecnico)
  const [against, setAgainst] = useState({ reason: "" }); // motivazione per un trade contro il segnale

  const U = getU(ticker);
  const chain = chains[ticker];
  const spot = chain?.spot ?? null;
  const seas = seasonal[ticker] || { monthlyMean: U.monthlyMean, sigma: U.sigma, matrix: null, years: null, src: "stima" };
  const iv = U.iv;
  const dte = expKey && chain?.byExp[expKey] ? chain.byExp[expKey].dte : dteManual;
  const expStrikes = useMemo(() => {
    if (!chain || !expKey || !chain.byExp[expKey]) return null;
    const s = new Set([...Object.keys(chain.byExp[expKey].calls), ...Object.keys(chain.byExp[expKey].puts)].map(Number));
    return Array.from(s).sort((a, b) => a - b);
  }, [chain, expKey]);
  const q = useMemo(() => makeQuote(chain, expKey), [chain, expKey]);

  /* ---- chain fetch ---- */
  const refreshChain = useCallback(async (tk, silent) => {
    if (!silent) { setBusy(tk); setMsg(`Scarico chain ${tk}… (se la fetch diretta è bloccata uso il proxy Claude: 20-40s)`); }
    try {
      const c = await fetchCboeChain(tk);
      setChains((m) => ({ ...m, [tk]: c }));
      // snapshot IV ATM giornaliero → costruisce lo storico per l'IV Rank
      try {
        const ek2 = c.expirations.find((e) => c.byExp[e].dte >= 25 && c.byExp[e].dte <= 70) || c.expirations[0];
        if (ek2 && c.spot) {
          const cs = Object.keys(c.byExp[ek2].calls).map(Number);
          const kA = cs.reduce((b2, k) => Math.abs(k - c.spot) < Math.abs(b2 - c.spot) ? k : b2, cs[0]);
          const ivA = c.byExp[ek2].calls[kA]?.iv;
          if (ivA) setStore((st) => {
            const d = new Date().toISOString().slice(0, 10);
            const h = (st.ivHist?.[tk] || []).filter((x) => x.d !== d);
            const ns = { ...st, ivHist: { ...(st.ivHist || {}), [tk]: [...h, { d, iv: ivA }].slice(-250) } };
            saveState(ns); return ns;
          });
        }
      } catch { /* opzionale */ }
      if (!silent) setMsg(`${tk}: chain reale caricata [${c.source}] — spot $${c.spot?.toFixed(2)}, ${c.expirations.length} scadenze.`);
      return c;
    } catch (e) {
      if (!silent) setMsg(`${tk}: chain non disponibile — ${e.message}`);
      return null;
    } finally { if (!silent) setBusy(null); }
  }, []);

  /* ---- avvio: storage + refresh automatico ---- */
  useEffect(() => {
    (async () => {
      const st = (await loadState()) || EMPTY;
      // merge timeline Autopilot dal server (brief generati ad app chiusa)
      try {
        const r = await fetch("/api/state");
        if (r.ok) {
          const srv = await r.json();
          for (const sp of srv.positions || []) {
            const lp = st.positions?.find((x) => x.id === sp.id);
            if (lp && sp.timeline) {
              const known = new Set((lp.timeline || []).map((e) => e.t));
              lp.timeline = [...(lp.timeline || []), ...sp.timeline.filter((e) => !known.has(e.t))].sort((a, b) => a.t - b.t);
            }
          }
        }
      } catch { /* server sync opzionale */ }
      // SANIFICAZIONE stato salvato (v2): posizioni corrotte da versioni precedenti
      // non devono mai piuò far crashare l'app. Si tengono solo record integri.
      const okPos = (p) => p && typeof p === "object" && Array.isArray(p.legs) && p.legs.length > 0
        && p.legs.every((l) => l && Number.isFinite(+l.strike) && (l.type === "call" || l.type === "put"))
        && typeof p.ticker === "string" && p.ticker.length > 0 && Number.isFinite(+p.entryNet);
      const droppedPos = (st.positions || []).filter((p) => !okPos(p)).length;
      st.positions = (st.positions || []).filter(okPos);
      st.saved = (st.saved || []).filter((sv) => sv && Array.isArray(sv.legs) && typeof sv.ticker === "string");
      if (droppedPos > 0) setMsg(`⚠ ${droppedPos} posizione/i corrotte da una versione precedente sono state rimosse (i dati validi sono intatti).`);
      setStore({ ...EMPTY, ...st, v: 2, settings: { ...EMPTY.settings, ...(st.settings || {}) } });
      if ((st.positions || []).length > 0) setTab("paper");
      if (st.seasonal) setSeasonal(st.seasonal);
      const tickers = [...new Set([(st.positions || []).map((p) => p.ticker), "SOYB"].flat())];
      setBusy("auto"); setMsg("Aggiornamento automatico chain reali (CBOE)…");
      for (const tk of tickers) await refreshChain(tk, true);
      setMsg("Dati aggiornati all'apertura ✓");
      setBusy(null);
    })();
  }, [refreshChain]);

  /* ---- default legs quando chain e exp disponibili ---- */
  useEffect(() => {
    if (chain && !expKey) {
      const target = chain.expirations.find((e) => chain.byExp[e].dte >= 35 && chain.byExp[e].dte <= 60) || chain.expirations.find((e) => chain.byExp[e].dte >= 20) || chain.expirations[0];
      setExpKey(target || null);
    }
  }, [chain, expKey]);
  useEffect(() => {
    if (spot && legs.length === 0) {
      setLegs(buildPresets(sentiment, spot, U.step, expStrikes)[0].legs);
    }
  }, [spot, expStrikes]); // eslint-disable-line

  /* ---- sync continuo col conto Alpaca: ordini pendenti + fill → posizioni guidate ---- */
  useEffect(() => {
    if (!alpaca) return;
    let stop = false;
    const tick = async () => {
      try {
        const [po, oo] = await Promise.all([
          alpacaGet("/v2/positions"),
          alpacaGet("/v2/orders?status=open&limit=30&nested=true"),
        ]);
        if (stop) return;
        setAlSync((prev) => {
          // fill rilevato: c'è una posizione nuova o un ordine sparito → importa
          if (po.length > prev.positions.length || (prev.orders.length > oo.length && po.length)) importAlpaca(true);
          return { orders: oo, positions: po, t: Date.now() };
        });
      } catch { /* offline/market closed */ }
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => { stop = true; clearInterval(id); };
  }, [alpaca]); // eslint-disable-line

  /* ---- monitoraggio automatico posizioni: refresh chain ogni 60s ---- */
  useEffect(() => {
    if (!autoMon || !store.positions.length) return;
    const id = setInterval(() => {
      const tks = [...new Set(store.positions.map((p) => p.ticker))];
      tks.forEach((tk) => refreshChain(tk, true));
    }, 60000);
    return () => clearInterval(id);
  }, [autoMon, store.positions, refreshChain]);

  const switchTicker = (tk) => { setTicker(tk); setExpKey(null); setLegs([]); setMc(null); setBt(null); setAgainst({ reason: "" }); if (!chains[tk]) refreshChain(tk); };

  /* ---- seasonal da Alpha Vantage ---- */
  const loadSeasonal = async () => {
    setBusy("av"); setMsg(null);
    try {
      const h = await fetchHistory(ticker);
      const s2 = { ...seasonal, [ticker]: h };
      setSeasonal(s2);
      const st = { ...store, seasonal: Object.fromEntries(Object.entries(s2).map(([k, v]) => [k, { monthlyMean: v.monthlyMean, sigma: v.sigma, matrix: v.matrix, years: v.years, from: v.from, src: v.src }])) };
      setStore(st); await saveState(st);
      setMsg(`${ticker}: stagionalità reale calcolata su ${h.years} anni di dati.`);
    } catch (e) { setMsg(`Alpha Vantage: ${e.message}`); }
    setBusy(null);
  };

  /* ---- news ----
     PRD §7: le news devono caricarsi all'AVVIO per il ticker corrente, non
     quando si apre il tab. Altrimenti il motore ragiona senza di loro. Con
     `silent` il caricamento in background non tocca busy/messaggi. */
  const loadNews = useCallback(async (tk, silent) => {
    if (!silent) setBusy("news");
    try {
      setNews((n) => ({ ...n, [tk]: { items: n[tk]?.items || [], loading: true } }));
      const items = await fetchAllNews(tk, getU(tk).newsQ);
      setNews((n) => ({ ...n, [tk]: { items, at: Date.now() } }));
    } catch {
      setNews((n) => ({ ...n, [tk]: { items: n[tk]?.items || [], loading: false, err: true } }));
      if (!silent) setMsg("Feed RSS non raggiungibili al momento.");
    }
    if (!silent) setBusy(null);
  }, []);
  // all'avvio e a ogni cambio ticker: le news del ticker corrente sono già lì
  useEffect(() => { if (!news[ticker]) loadNews(ticker, true); }, [ticker, news, loadNews]);

  /* ---- meteo: una volta all'avvio, serve al fattore weather di fuseSignals ---- */
  useEffect(() => { (async () => { try { setWeather(await fetchWeather()); } catch { /* meteo opzionale */ } })(); }, []);

  /* ---- barre giornaliere: servono al fattore tecnico (SMA/RSI, 60+ barre) ---- */
  // Restituisce le barre (dalla cache o dalla rete) così chi chiama può usarle
  // subito, senza aspettare il giro di render dello state.
  const barsAsked = useRef({});
  const loadBars = useCallback(async (tk) => {
    if (barsAsked.current[tk]) return barsAsked.current[tk];
    const job = (async () => {
      try {
        const r = await fetch(`/api/bars?sym=${encodeURIComponent(tk)}&days=400`);
        const j = await r.json();
        if (r.ok && j.bars?.length) { setBarsCache((b) => ({ ...b, [tk]: j.bars })); return j.bars; }
      } catch { /* il fattore tecnico degrada a neutro da solo */ }
      return null;
    })();
    barsAsked.current[tk] = job;
    return job;
  }, []);
  useEffect(() => { loadBars(ticker); }, [ticker, loadBars]);

  /* ---- fusione 4 fattori per ticker (PRD §7) ----
     Le news taggate valgono per tutti i sottostanti (un titolo sul Mar Nero
     tocca WEAT anche se il feed è stato scaricato per SOYB), quindi il pool è
     l'unione di tutti i feed caricati, deduplicata per titolo. */
  const newsPool = useMemo(() => {
    const seen = new Set();
    return Object.values(news).flatMap((n) => n?.items || []).filter((i) => i?.title && !seen.has(i.title) && seen.add(i.title));
  }, [news]);

  const fuseFor = useCallback((tk, barsOverride) => fuseSignals({
    ticker: tk, month: NOW_MONTH,
    weatherData: weather, newsItems: newsPool,
    bars: barsOverride !== undefined ? barsOverride : barsCache[tk],
    seasonalMean: ((seasonal[tk]?.monthlyMean) || getU(tk).monthlyMean)[NOW_MONTH],
  }), [weather, newsPool, barsCache, seasonal]);

  const fused = useMemo(
    () => Object.fromEntries(Object.keys(UNDERLYINGS).map((tk) => [tk, fuseFor(tk)])),
    [fuseFor]
  );

  /* ---- analisi ---- */
  const A = useMemo(() => (spot && legs.length ? analyze(legs, spot, dte, iv, q) : null), [legs, spot, dte, iv, q]);
  const oiGrid = useMemo(() => oiGridFromChain(chain, spot), [chain, spot]);
  const lv = useMemo(() => levelsFromGrid(oiGrid, spot), [oiGrid, spot]);


  /* ---- azioni strategia ---- */
  const applyPreset = (p, a) => {
    setLegs(p.legs.map((l) => ({ ...l }))); setStratName(p.name); setMc(null); setBt(null);
    setOptRef(a ? { name: p.name, entry: a.entry, maxProfit: a.maxProfit, maxLoss: a.maxLoss, expKey, t: Date.now() } : null);
    setTab("build");
  };
  const updLeg = (i, f, v) => setLegs((L) => L.map((l, j) => (j === i ? { ...l, [f]: v } : l)));
  const onChainCell = (k, t) => {
    setLegs((L) => {
      const i = L.findIndex((l) => l.strike === k && l.type === t);
      if (i < 0) return [...L, { side: 1, type: t, strike: k, qty: 1 }];
      if (L[i].side > 0) return L.map((l, j) => (j === i ? { ...l, side: -1 } : l));
      return L.filter((_, j) => j !== i);
    });
    setMc(null); setBt(null);
  };
  const addLeg = () => setLegs((L) => [...L, { side: 1, type: "call", strike: snapStrike(spot, expStrikes, U.step), qty: 1 }]);
  const rmLeg = (i) => setLegs((L) => L.filter((_, j) => j !== i));

  const saveStrategy = async () => {
    const item = { id: Date.now(), name: stratName, ticker, expKey, dte, legs, savedAt: new Date().toISOString() };
    const st = { ...store, saved: [...store.saved, item] };
    setStore(st); await saveState(st); setMsg("Strategia salvata ✓ (persistente tra sessioni).");
  };
  const openPaper = async (alpacaOrder) => {
    // Non blocchiamo il trade: chiediamo la motivazione scritta e la salviamo
    // con la posizione (PRD §2, pattern override).
    if (clash && against.reason.trim().length < REASON_MIN) {
      setMsg(`Write why you are going against ${clash.n} of ${clash.total} factors (at least ${REASON_MIN} characters). The reason is stored with the position.`);
      return;
    }
    const expiry = expKey ? new Date(expKey).toISOString() : new Date(Date.now() + dte * 86400000).toISOString();
    const ivAvg0 = A.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, A.legPx.length);
    const pop0 = probProfit(A.curve, spot, ivAvg0, dte);
    const pos = {
      id: Date.now(), name: stratName, ticker, expKey, legs, entryNet: A.entry, entrySpot: spot,
      openedAt: new Date().toISOString(), expiry, maxProfit: A.maxProfit, maxLoss: A.maxLoss,
      realEntry: A.realCount === legs.length,
      alpacaId: alpacaOrder?.id || null,
      thesis: { pop: pop0, iv: ivAvg0, seasonal: seas.monthlyMean[NOW_MONTH], regime: seas.monthlyMean[NOW_MONTH] > 0.8 ? "forte+" : seas.monthlyMean[NOW_MONTH] < -0.8 ? "forte-" : "debole", spot, breakevens: A.breakevens, delta: A.greeks.delta, vega: A.greeks.vega,
        signal: fused[ticker] ? { score: fused[ticker].score, confidence: fused[ticker].confidence, agreement: fused[ticker].agreement, narrative: fused[ticker].narrative } : null,
        againstSignal: clash ? { ...clash, reason: against.reason.trim(), at: Date.now() } : null },
      timeline: [
        { t: Date.now(), type: "open", text: `${alpacaOrder ? "Ordine Alpaca " + alpacaOrder.id.slice(0, 8) + "… inviato · " : ""}Aperta: PoP ${pop0 != null ? (pop0 * 100).toFixed(0) + "%" : "n/d"} · IV ${(ivAvg0 * 100).toFixed(0)}% · stagionale ${seas.monthlyMean[NOW_MONTH].toFixed(1)}%/m${fused[ticker] ? ` · segnale ${fused[ticker].score > 0 ? "+" : ""}${fused[ticker].score}/100 ${fused[ticker].agreement}` : ""}` },
        ...(clash ? [{ t: Date.now(), type: "against", text: `Against ${clash.n} of ${clash.total} factors. Reason: "${against.reason.trim()}"` }] : []),
      ],
    };
    const st = { ...store, positions: [...store.positions, pos] };
    setStore(st); await saveState(st); setAgainst({ reason: "" }); setMsg("Posizione paper aperta ✓"); setTab("paper");
  };
  const delSaved = async (id) => { const st = { ...store, saved: store.saved.filter((s) => s.id !== id) }; setStore(st); await saveState(st); };
  const logEvent = useCallback((id, type, text) => {
    setStore((st) => {
      const positions = st.positions.map((p) => {
        if (p.id !== id) return p;
        const day = new Date().toDateString();
        const dup = (p.timeline || []).some((e) => e.type === type && new Date(e.t).toDateString() === day);
        if (dup) return p;
        const next = { ...p, timeline: [...(p.timeline || []), { t: Date.now(), type, text }] };
        return next;
      });
      const ns = { ...st, positions };
      saveState(ns);
      return ns;
    });
  }, []);

  const closePos = async (id) => {
    const p = store.positions.find((x) => x.id === id);
    let entry = null;
    if (p) {
      const al = posAlerts.find((a) => a.p.id === id);
      const pnl = al?.pnl ?? null;
      const ruleExit = !!(al && (al.level === "action"));
      entry = { id, t: Date.now(), ticker: p.ticker, name: p.name, openedAt: p.openedAt, pnl, ruleExit,
        riskOk: Math.abs(p.maxLoss) <= 0.05 * (store.settings.capital || 5000) };
    }
    const st = { ...store, positions: store.positions.filter((x) => x.id !== id), journal: entry ? [...(store.journal || []), entry] : (store.journal || []) };
    setStore(st); await saveState(st);
  };

  const runMultiScan = async () => {
    setMulti((m) => ({ ...m, busy: true, err: null, res: null }));
    try {
      const out = [];
      // le barre servono al fattore tecnico: caricale prima di fondere i segnali
      const barsMap = Object.fromEntries(await Promise.all(multi.sel.map(async (tk) => [tk, await loadBars(tk)])));
      const fz = Object.fromEntries(multi.sel.map((tk) => [tk, fuseFor(tk, barsMap[tk] ?? barsCache[tk])]));
      for (const tk of multi.sel) {
        let c = chains[tk] || (await refreshChain(tk, true));
        if (!c?.spot) continue;
        const sp = c.spot;
        const dT = multi.dteT || 45;
        const exps = c.expirations.filter((e) => c.byExp[e].dte >= dT - 20 && c.byExp[e].dte <= dT + 35);
        const ek = exps[0] ? exps.reduce((b2, e) => Math.abs(c.byExp[e].dte - dT) < Math.abs(c.byExp[b2].dte - dT) ? e : b2, exps[0]) : null;
        if (!ek) continue;
        const d2 = c.byExp[ek].dte;
        const row = scan.find((r) => r.tk === tk);
        const sent = multi.senMode === "fixed" ? sentiment : (row && row.sugg !== "neutral" ? row.sugg : "neutral");
        const sSet = new Set([...Object.keys(c.byExp[ek].calls), ...Object.keys(c.byExp[ek].puts)].map(Number));
        const strikes = Array.from(sSet).sort((a, b) => a - b);
        const qq = makeQuote(c, ek);
        for (const pr of buildPresets(sent, sp, getU(tk).step, strikes)) {
          const a = analyze(pr.legs, sp, d2, getU(tk).iv, qq);
          if (!Number.isFinite(a.maxProfit) || a.maxProfit <= 0 || !Number.isFinite(a.maxLoss)) continue;
          const ivA = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
          const pop = probProfit(a.curve, sp, ivA, d2) || 0;
          const unit = Math.abs(a.maxLoss);
          const n = Math.floor(optAmt / Math.max(1, a.entry >= 0 ? Math.abs(a.entry) * 100 : unit));
          if (n < 1) continue;
          out.push({ tk, sent, name: pr.name, legs: pr.legs, expKey: ek, dte: d2, a, pop, n, ev: pop * a.maxProfit * n });
        }
      }
      // Ranking: valore atteso CORRETTO dal segnale a 4 fattori, e i CONFLICT in
      // fondo comunque (PRD §7). Le funzioni pure stanno in src/signals.js.
      const ranked = out.map((o) => {
        const pr = evProfile(o.pop, o.a.maxProfit, o.a.maxLoss);
        return withSignalRank({ ...o, ev100: pr ? pr.ev100 : -999, tag: pr?.tag }, fz[o.tk], sentimentDirection(o.sent));
      }).sort(compareCandidates);
      setMulti((m) => ({ ...m, busy: false, res: ranked.slice(0, 8) }));
    } catch (e) { setMulti((m) => ({ ...m, busy: false, err: String(e.message || e) })); }
  };

  const runReplay = (row) => {
    // row = [anno, r1..r12 in %]; rigioca la finestra stagionale mese per mese con le regole
    const span = Math.max(1, Math.round(dte / 30));
    const steps = [{ m: 0, label: "ingresso", S: spot, pnl: 0, note: "apri la posizione" }];
    let Sx = spot, closed = null;
    for (let i = 1; i <= span; i++) {
      const r = row[((NOW_MONTH + i - 1) % 12) + 1];
      if (r == null) break;
      Sx = Sx * (1 + r / 100);
      const rem = Math.max(1, dte - i * 30);
      const pnl = ((i === span ? payoffExp(legs, Sx) : scenarioValue(legs, Sx, rem, iv)) - A.entry) * 100;
      let note = `prezzo ${r >= 0 ? "+" : ""}${r.toFixed(1)}%`;
      if (!closed && pnl >= 0.5 * A.maxProfit) { closed = { i, pnl: 0.5 * A.maxProfit, why: "TP 50%" }; note += " → 🎯 TP 50% colpito: incassi a regola"; }
      else if (!closed && pnl <= 0.5 * A.maxLoss) { closed = { i, pnl: 0.5 * A.maxLoss, why: "STOP 50%" }; note += " → 🛑 STOP 50%: chiudi a regola"; }
      steps.push({ m: i, label: MONTHS_IT[(NOW_MONTH + i) % 12], S: Sx, pnl, note });
      if (closed) break;
    }
    const finale = closed ? closed.pnl : steps[steps.length - 1].pnl;
    setReplay({ year: row[0], steps, closed, finale });
  };

  const runMC = () => { setMc(montecarlo(legs, spot, dte, A.entry, seas.sigma, seas.monthlyMean)); setBt(histBacktest(legs, spot, dte, A.entry, seas.matrix)); };

  /* ---- Alpaca ---- */
  const setSetting = async (k, v) => { const st = { ...store, settings: { ...store.settings, [k]: v } }; setStore(st); await saveState(st); };
  const testAlpaca = async () => {
    setBusy("alpaca"); setMsg(null);
    try {
      const acc = await alpacaGet("/v2/account");
      setAlpaca(acc);
      setMsg(`Alpaca PAPER connesso ✓ · equity $${(+acc.equity).toLocaleString()} · buying power $${(+acc.buying_power).toLocaleString()}`);
    } catch (e) {
      setAlpaca(null);
      setMsg(`Alpaca non raggiungibile: ${e.message}. Nota: se vedi un errore CORS/network, il browser blocca le chiamate dirette — in tal caso usa il server MCP Alpaca da configurare tra i connettori Claude.`);
    }
    setBusy(null);
  };
  const sendToAlpaca = async () => {
    if (!confirmSend) { setConfirmSend(true); return; }
    setConfirmSend(false); setBusy("order");
    try {
      const withOcc = legs.map((l) => {
        const quote = q(l);
        const occ = quote?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("seleziona una scadenza reale dalla chain per generare i simboli OCC");
        return { ...l, occ };
      });
      const o = await alpacaOrderMleg(withOcc);
      setMsg(`Ordine multileg inviato ad Alpaca PAPER ✓ · id ${o.id?.slice(0, 8)}…`);
    } catch (e) { setMsg(`Invio ordine fallito: ${e.message}`); }
    setBusy(null);
  };

  /* ---- IV rank del ticker corrente ---- */
  const ivRank = useMemo(() => {
    const h = (store.ivHist || {})[ticker] || [];
    if (!h.length) return null;
    const cur = h[h.length - 1].iv;
    if (h.length < 20) return { collecting: h.length, cur };
    const below = h.filter((x) => x.iv <= cur).length;
    return { rank: Math.round((below / h.length) * 100), cur, n: h.length };
  }, [store.ivHist, ticker]);

  /* ---- alert center: valutazione rapida posizioni ---- */
  const posAlerts = useMemo(() => store.positions.map((p) => {
    const c = chains[p.ticker];
    const sp = c?.spot;
    const dteLeft = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
    const qp = makeQuote(c, p.expKey);
    // P&L: preferisci il dato REALE del conto Alpaca se la posizione è collegata
    let pnl = null, live = false;
    if (p.alpacaLive && alSync.positions.length) {
      const match = alSync.positions.filter((x) => {
        const o = parseOcc(x.symbol || "");
        return o && o.und === p.ticker && o.exp === p.expKey && p.legs.some((l) => l.strike === o.strike && l.type === o.type);
      });
      if (match.length) { pnl = match.reduce((a, x) => a + (+x.unrealized_pl), 0); live = true; }
    }
    if (pnl == null) pnl = sp != null ? (netValue(p.legs, sp, Math.max(1, dteLeft), getU(p.ticker).iv, qp) - p.entryNet) * 100 : null;
    const tpHit = pnl != null && p.maxProfit > 0 && pnl >= 0.5 * p.maxProfit;
    const slHit = pnl != null && p.maxLoss < 0 && pnl <= 0.5 * p.maxLoss;
    const dteExit = dteLeft <= 7;
    // verdetto autopilot recente non-HOLD in attesa
    const ap = (p.timeline || []).filter((e) => e.type === "autopilot" && Date.now() - e.t < 48 * 36e5 && !e.text.includes("HOLD")).slice(-1)[0];
    const level = tpHit || slHit || dteExit || ap ? "action" : pnl != null && pnl < 0.35 * p.maxLoss ? "watch" : "ok";
    const label = tpHit ? "TP 50% raggiunto → incassa" : slHit ? "STOP 50% toccato → chiudi" : dteExit ? `${dteLeft} DTE → chiudi/rolla` : ap ? "Autopilot: azione in attesa di OK" : pnl == null ? "in attesa dati…" : level === "watch" ? "in perdita: monitora la tesi" : "in linea col piano";
    return { p, pnl, dteLeft, level, label, ap, live, spotNow: sp, tpHit, slHit, dteExit };
  }), [store.positions, chains, alSync]);

  // Log eventi regola (TP/SL/DTE) fuori dal render: prima veniva chiamato logEvent
  // DENTRO il JSX del tab Paper (setState durante il render) => instabilità del tab.
  useEffect(() => {
    for (const a of posAlerts) {
      if (a.tpHit) logEvent(a.p.id, "tp", `Raggiunto TP 50% (${fmt$(a.pnl)})`);
      if (a.slHit) logEvent(a.p.id, "sl", `Toccato SL 50% (${fmt$(a.pnl)})`);
      if (a.dteExit) logEvent(a.p.id, "dte", "Entrata in finestra ≤7 DTE");
    }
  }, [posAlerts, logEvent]);
  const nAttention = posAlerts.filter((a) => a.level === "action").length;

  /* ---- wizard: trova il mio trade ---- */
  const runWizard = async () => {
    setWiz((w) => ({ ...w, busy: true, err: null, result: null }));
    try {
      const best = scan.find((r) => r.sugg !== "neutral") || scan[0];
      let c = chains[best.tk] || (await refreshChain(best.tk, true));
      if (!c?.spot) throw new Error(`dati ${best.tk} non disponibili ora: riprova tra poco`);
      const sp = c.spot;
      const exps = c.expirations.filter((e) => c.byExp[e].dte >= 15 && c.byExp[e].dte <= 130);
      const ek = exps.reduce((b2, e) => Math.abs(c.byExp[e].dte - wiz.horizon) < Math.abs(c.byExp[b2].dte - wiz.horizon) ? e : b2, exps[0]);
      if (!ek) throw new Error("nessuna scadenza adatta");
      const d2 = c.byExp[ek].dte;
      const sSet = new Set([...Object.keys(c.byExp[ek].calls), ...Object.keys(c.byExp[ek].puts)].map(Number));
      const strikes = Array.from(sSet).sort((a, b) => a - b);
      const qq = makeQuote(c, ek);
      // candidati da ENTRAMBE le famiglie: direzionale (sentiment scanner) + intervallo (neutral)
      const fams = best.sugg === "neutral" ? ["neutral"] : [best.sugg, "neutral"];
      const cands = fams.flatMap((sent) => buildPresets(sent, sp, getU(best.tk).step, strikes).map((pr) => {
        const a = analyze(pr.legs, sp, d2, getU(best.tk).iv, qq);
        if (!Number.isFinite(a.maxProfit) || a.maxProfit <= 0 || !Number.isFinite(a.maxLoss) || a.maxLoss >= 0) return null;
        const ivA = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
        const pop = probProfit(a.curve, sp, ivA, d2) || 0;
        const unit = Math.abs(a.maxLoss);
        const n = Math.floor(wiz.risk / unit);
        if (n < 1) return null;
        const pr2 = evProfile(pop, a.maxProfit, a.maxLoss);
        return { sent, pr, a, pop, n, unit, ev100: pr2 ? pr2.ev100 : -999 };
      })).filter(Boolean);
      if (!cands.length) throw new Error(`con $${wiz.risk} di rischio nessuna strategia entra: alza il budget o allunga l'orizzonte`);
      const safe = cands.filter((x) => x.pop >= 0.55).sort((a, b) => b.ev100 - a.ev100)[0]
        || cands.slice().sort((a, b) => b.pop - a.pop)[0];
      const bold = cands.filter((x) => x.pop < 0.55 && x !== safe).sort((a, b) => b.ev100 - a.ev100)[0]
        || cands.filter((x) => x !== safe).sort((a, b) => b.n * b.a.maxProfit - a.n * a.a.maxProfit)[0];
      const t3 = ta[best.tk];
      const seaDir3 = best.seasonalScore > 0 ? 1 : -1;
      const strong = Math.abs(best.seasonalScore) >= 1 && (!t3 || t3.trend === 0 || t3.trend === seaDir3);
      const mk = (x, kind) => x && ({
        kind, tk: best.tk, name: x.pr.name, legs: x.pr.legs, expKey: ek, dte: d2, n: x.n,
        totRisk: x.n * x.unit, totProfit: x.n * x.a.maxProfit, pop: x.pop, ev100: x.ev100,
        winTxt: `vinci ~${Math.round(x.pop * 10)} volte su 10`,
      });
      setWiz((w) => ({ ...w, busy: false, result: {
        tk: best.tk, expKey: ek, seas: best.seasonalScore,
        props: [mk(safe, "safe"), mk(bold, "bold")].filter(Boolean),
        reco: strong ? "bold" : "safe",
        recoTxt: strong
          ? `Pattern stagionale FORTE (${best.seasonalScore > 0 ? "+" : ""}${best.seasonalScore.toFixed(1)}%/m)${t3 && t3.trend === seaDir3 ? " e trend tecnico concorde" : ""}: ha senso valutare l'Ambiziosa.`
          : `Il pattern stagionale è debole/moderato: la piattaforma consiglia la Prudente (più probabilità, meno dipendenza dalla direzione).`,
      }}));
    } catch (e) { setWiz((w) => ({ ...w, busy: false, err: String(e.message || e) })); }
  };

  /* ---- profilo strategia: EV per $100 a rischio + etichetta onesta ---- */
  const evProfile = (pop, maxProfit, maxLoss) => {
    if (pop == null || !Number.isFinite(maxProfit) || !Number.isFinite(maxLoss) || maxLoss >= 0) return null;
    const risk = Math.abs(maxLoss);
    const ev = pop * maxProfit - (1 - pop) * risk;
    const ev100 = (ev / risk) * 100;
    const rr = maxProfit / risk;
    const tag = pop >= 0.6 ? { t: "ALTA PROBABILIT\u00c0", c: T.green, d: `vinci ~${Math.round(pop * 10)} volte su 10, guadagno contenuto` }
      : pop < 0.45 && rr >= 2 ? { t: "ALTO POTENZIALE", c: T.violet, d: `vinci ~${Math.round(pop * 10)} su 10, ma R/R ${rr.toFixed(1)}:1` }
      : { t: "BILANCIATA", c: T.blue, d: "compromesso probabilit\u00e0/guadagno" };
    return { ev, ev100, rr, tag };
  };

  /* ---- import posizioni reali dal conto paper Alpaca ---- */
  const importAlpaca = useCallback(async (silent) => {
    try {
      const raw = await alpacaGet("/v2/positions");
      const opts = raw.filter((x) => x.asset_class === "us_option" && parseOcc(x.symbol));
      if (!opts.length) { if (!silent) setMsg("Nessuna posizione in opzioni sul conto Alpaca."); return; }
      const groups = {};
      for (const x of opts) {
        const o = parseOcc(x.symbol);
        const key = `${o.und}|${o.exp}`;
        if (!groups[key]) groups[key] = { und: o.und, exp: o.exp, legs: [], net: 0 };
        const qty = Math.abs(+x.qty);
        const side = +x.qty > 0 ? 1 : -1;
        groups[key].legs.push({ side, type: o.type, strike: o.strike, qty });
        groups[key].net += side * qty * (+x.avg_entry_price);
      }
      let added = 0;
      setStore((st) => {
        const sigOf = (tk, exp, legs) => tk + exp + legs.map((l) => `${l.side}${l.type[0]}${l.strike}x${l.qty}`).sort().join("");
        const known = new Set(st.positions.map((p) => sigOf(p.ticker, p.expKey || "", p.legs)));
        const next = [...st.positions];
        for (const g of Object.values(groups)) {
          // qualunque sottostante Alpaca è ora seguibile (getU fornisce statistiche di fallback)
          if (known.has(sigOf(g.und, g.exp, g.legs))) continue;
          const ks = g.legs.map((l) => l.strike);
          const lo2 = Math.min(...ks) * 0.5, hi2 = Math.max(...ks) * 1.5;
          let mp = -Infinity, ml = Infinity;
          for (let i = 0; i <= 200; i++) {
            const pnl = (payoffExp(g.legs, lo2 + (i / 200) * (hi2 - lo2)) - g.net) * 100;
            mp = Math.max(mp, pnl); ml = Math.min(ml, pnl);
          }
          const dte0 = Math.round((new Date(g.exp) - Date.now()) / 864e5);
          next.push({
            id: Date.now() + added, name: "Importata da Alpaca", ticker: g.und, expKey: g.exp,
            legs: g.legs, entryNet: g.net, entrySpot: chains[g.und]?.spot ?? null,
            openedAt: new Date().toISOString(), expiry: g.exp,
            maxProfit: Number.isFinite(mp) ? mp : 0, maxLoss: Number.isFinite(ml) ? ml : 0,
            realEntry: true, alpacaId: "sync", alpacaLive: true,
            thesis: { imported: true, iv: getU(g.und).iv, seasonal: (seasonal[g.und]?.monthlyMean || getU(g.und).monthlyMean)[NOW_MONTH], pop: null, spot: chains[g.und]?.spot ?? null, vega: 1 },
            timeline: [{ t: Date.now(), type: "open", text: `Importata dal conto paper Alpaca (${g.legs.length} gambe, ${dte0} DTE): il Guardian ora la segue` }],
          });
          added++;
        }
        if (!added) return st;
        const ns = { ...st, positions: next };
        saveState(ns);
        return ns;
      });
      if (!silent) setMsg(added ? `Importate ${added} posizioni dal conto Alpaca \u2713` : "Posizioni Alpaca gi\u00e0 tutte collegate \u2713");
    } catch (e) { if (!silent) setMsg(`Import Alpaca: ${e.message}`); }
  }, [chains, seasonal]);

  useEffect(() => {
    (async () => {
      try { const acc = await alpacaGet("/v2/account"); if (acc?.account_number) { setAlpaca(acc); importAlpaca(true); } } catch { /* non configurato */ }
    })();
  }, []); // eslint-disable-line

  /* ---- percorso: livello + awareness score ---- */
  const journey = useMemo(() => {
    const j = store.journal || [];
    const closed = j.length;
    const ruled = j.filter((x) => x.ruleExit).length;
    const disciplina = closed ? ruled / closed : null;
    const coerenza = closed ? j.filter((x) => x.riskOk).length / closed : null;
    const opens = [...j.map((x) => new Date(x.openedAt).getTime()), ...store.positions.map((p) => new Date(p.openedAt).getTime())].sort();
    let maxWk = 0;
    for (let i = 0; i < opens.length; i++) { let c2 = 1; for (let k = i + 1; k < opens.length && opens[k] - opens[i] < 6048e5; k++) c2++; maxWk = Math.max(maxWk, c2); }
    const pazienza = opens.length === 0 ? null : maxWk <= 3 ? 1 : maxWk <= 5 ? 0.6 : 0.2;
    const parts = [disciplina, coerenza, pazienza].filter((x) => x != null);
    const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100) : null;
    const opened = closed + store.positions.length;
    let level = 1, next = "Usa il Wizard e apri il tuo primo paper trade";
    if (opened >= 1) { level = 2; next = `Apri ${Math.max(0, 3 - opened)} paper trade per il Liv.3 (spread a 2 gambe + Exit Ladder)`; }
    if (opened >= 3) { level = 3; next = `Chiudi ${Math.max(0, 5 - ruled)} trade seguendo le regole per il Liv.4 (condor, vendita premio)`; }
    if (ruled >= 5 && (disciplina ?? 0) >= 0.6) { level = 4; next = `Arriva a 10 chiusure con disciplina \u226580% per il Liv.5 (Autopilot pieno)`; }
    if (closed >= 10 && (disciplina ?? 0) >= 0.8) { level = 5; next = "Percorso completo: valuta la Live Readiness col Copilot"; }
    return { level, next, score, disciplina, coerenza, pazienza, closed, opened, ruled };
  }, [store.journal, store.positions, store.settings.capital]);

  /* ---- guardrail ---- */
  const guard = useMemo(() => {
    if (!A) return null;
    const cap = store.settings.capital || 5000;
    const tradeRisk = Math.abs(A.maxLoss);
    const openRisk = store.positions.reduce((a, p) => a + Math.abs(p.maxLoss), 0);
    const overTrade = tradeRisk > 0.05 * cap;
    const overTotal = openRisk + tradeRisk > 0.25 * cap;
    return { cap, tradeRisk, openRisk, overTrade, overTotal, maxTradeRisk: 0.05 * cap, maxTotal: 0.25 * cap };
  }, [A, store.positions, store.settings.capital]);

  /* ---- direzione del trade e scontro col segnale (PRD §7) ----
     La direzione la dà il delta netto della struttura: positivo = il trade
     guadagna se il prezzo sale. Sotto 0.05 in valore assoluto la struttura è
     di fatto neutra e non c'è nessuna direzione contro cui andare. */
  const tradeDir = useMemo(() => {
    if (!A) return 0;
    const d = A.greeks.delta;
    return Math.abs(d) < 0.05 ? 0 : Math.sign(d);
  }, [A]);
  const clash = useMemo(() => againstSignal(fused[ticker], tradeDir), [fused, ticker, tradeDir]);
  const REASON_MIN = 15;
  const reasonOk = !clash || against.reason.trim().length >= REASON_MIN;

  /* ---- scanner ----
     Il punteggio non è più la sola stagionalità: pesa fuseSignals(), che
     contiene già stagionalità, trend, meteo e news con i loro pesi (PRD §7).
     Un ticker in CONFLICT finisce ULTIMO comunque: quando i fattori si
     contraddicono non sappiamo abbastanza, e nessun rendimento atteso può
     farci cambiare idea. */
  const scan = useMemo(() => Object.entries(UNDERLYINGS).map(([tk, u]) => {
    const s = seasonal[tk] || { monthlyMean: u.monthlyMean };
    const seasonalScore = s.monthlyMean[NOW_MONTH];
    const c = chains[tk];
    const f = fused[tk];
    // fuseSignals vive in -100..+100, la stagionalità in %/mese: /25 le riporta
    // sulla stessa scala prima di sommarle.
    const score = seasonalScore * 1.5 + (f ? (f.score / 25) * (f.confidence / 100) : 0);
    const sugg = score > 1.5 ? "verybull" : score > 0.5 ? "bull" : score < -1.5 ? "verybear" : score < -0.5 ? "bear" : "neutral";
    return { tk, name: u.name, spot: c?.spot ?? null, seasonalScore, score, sugg, real: !!seasonal[tk], hasChain: !!c,
      fused: f, conflict: f?.agreement === "CONFLICT", agreement: f?.agreement, signalScore: f?.score ?? 0, confidence: f?.confidence ?? 0 };
  }).sort((a, b) => (a.conflict !== b.conflict ? (a.conflict ? 1 : -1) : b.score - a.score)), [chains, seasonal, fused]);

  /* ============================== RENDER ============================== */
  // "Oggi" rimossa su feedback: troppe info, valore basso al livello attuale.
  // Il codice resta dietro flag per reintegrarla in futuro dentro il Guardian.
  const SHOW_OGGI = false;
  const TABS = [
    ...(SHOW_OGGI ? [{ id: "oggi", label: "Oggi", I: Home }] : []),
    { id: "wizard", label: "Wizard", I: Compass },
    { id: "scan", label: "Scanner", I: Radar },
    { id: "optimize", label: "Optimize", I: Layers },
    { id: "build", label: "Builder", I: Play },
    { id: "3d", label: "Livelli OI", I: Box },
    { id: "backtest", label: "Backtest MC", I: FlaskConical },
    { id: "news", label: "News", I: Newspaper },
    { id: "meteo", label: "Meteo", I: CloudSun },
    { id: "copilot", label: "Copilot", I: MessageSquare },
    { id: "report", label: "Report", I: FileText },
    { id: "paper", label: "Paper", I: Briefcase },
  ];
  const SENT = SENTIMENTS.find((s) => s.id === sentiment);

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.body, fontFamily: "ui-sans-serif, system-ui" }}>
      <div style={{ maxWidth: 1720, margin: "0 auto", padding: "18px 14px 40px" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <Lbl>OPTIONS STRATEGY LAB v2 · DATI REALI</Lbl>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: T.ink, margin: "4px 0 6px" }}>Commodity Options Desk</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 10, color: T.green, border: `1px solid ${T.green}55`, background: `${T.green}12`, padding: "3px 8px", borderRadius: 5, display: "inline-flex", gap: 5, alignItems: "center" }}>
                <ShieldCheck size={12} /> PAPER · TP 50% · SL 50% · 7 DTE
              </span>
              <span style={{ ...mono, fontSize: 10, color: chain ? T.blue : T.dim, border: `1px solid ${chain ? T.blue : T.dim}44`, padding: "3px 8px", borderRadius: 5 }}>
                {chain ? `${chain.source} · agg. ${ago(chain.updated)}` : "chain non caricata"}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={ticker} onChange={(e) => switchTicker(e.target.value)}
              style={{ ...mono, background: T.panel, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 6, padding: "8px 10px", fontSize: 13 }}>
              {Object.keys(UNDERLYINGS).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <Btn onClick={() => refreshChain(ticker)} disabled={busy !== null}>
              <RefreshCw size={13} /> {busy === ticker ? "…" : "Refresh"}
            </Btn>
            <Btn small ghost onClick={() => { localStorage.setItem("osl-theme", localStorage.getItem("osl-theme") === "light" ? "dark" : "light"); location.reload(); }}>◐</Btn>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <Stat k="SPOT (CBOE)" v={spot ? `$${spot.toFixed(2)}` : "—"} />
          <Stat k="SCADENZA" v={expKey ? `${expKey} · ${dte} DTE` : `${dte} DTE (modello)`} c={T.blue} />
          <Stat k={`STAGIONALITÀ ${MONTHS_IT[NOW_MONTH].toUpperCase()}`} v={`${seas.monthlyMean[NOW_MONTH] > 0 ? "+" : ""}${seas.monthlyMean[NOW_MONTH].toFixed(1)}%`} c={seas.monthlyMean[NOW_MONTH] > 0 ? T.green : T.red} />
          <Stat k="FONTE STAG." v={seas.src || "stima"} c={seasonal[ticker] ? T.green : T.dim} />
          <Stat k="IV RANK" v={ivRank ? (ivRank.rank != null ? `${ivRank.rank}` : `raccolta ${ivRank.collecting}g`) : "—"}
            c={ivRank?.rank != null ? (ivRank.rank >= 60 ? T.red : ivRank.rank <= 40 ? T.green : T.mut) : T.dim}
            tip="Dove si trova la volatilità implicita di oggi rispetto al suo storico (0=minimi, 100=massimi). Alto (>60) → conviene VENDERE premio (condor, credit spread). Basso (<40) → conviene COMPRARE opzioni. Lo storico si costruisce con un refresh al giorno." />
        </div>

        {msg && <div style={{ ...mono, fontSize: 11.5, color: T.amber, border: `1px solid ${T.amber}44`, background: `${T.amber}10`, borderRadius: 6, padding: "7px 10px", marginTop: 10 }}>{msg}</div>}

        <TabBoundary k={tab}>
        {/* Alert Center: morning check */}
        {posAlerts.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.panel, border: `1px solid ${nAttention ? T.red : T.line}55`, borderRadius: 8 }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: nAttention ? T.red : T.amber, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={11} /> MORNING CHECK · {nAttention ? `${nAttention} POSIZION${nAttention === 1 ? "E" : "I"} RICHIEDE ATTENZIONE` : "TUTTO IN LINEA COL PIANO"}
            </div>
            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              {posAlerts.map(({ p, pnl, dteLeft, level, label }) => {
                const c2 = level === "action" ? T.red : level === "watch" ? T.amber : T.green;
                return (
                  <button key={p.id} onClick={() => setTab("paper")}
                    style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: c2, flexShrink: 0 }} />
                    <span style={{ ...mono, fontSize: 11.5, color: T.ink, fontWeight: 700 }}>{p.ticker} {p.name}</span>
                    <span style={{ ...mono, fontSize: 11, color: pnl >= 0 ? T.green : T.red }}>{pnl != null ? fmt$(pnl) : "…"}</span>
                    <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>· {dteLeft} DTE · {label} →</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginTop: 14, overflowX: "auto", paddingBottom: 2 }}>
          {TABS.map(({ id, label, I }) => (
            <button key={id} onClick={() => setTab(id)}
              style={{
                ...mono, fontSize: 11, padding: "8px 10px", borderRadius: 6, whiteSpace: "nowrap", cursor: "pointer",
                background: tab === id ? T.amber : "transparent", color: tab === id ? "#14181d" : T.mut,
                border: `1px solid ${tab === id ? T.amber : T.line}`, display: "inline-flex", gap: 5, alignItems: "center",
              }}>
              <I size={12} /> {label}{id === "paper" && nAttention > 0 && (
                <span style={{ ...mono, fontSize: 9, background: T.red, color: "#14181d", borderRadius: 8, padding: "0 5px", fontWeight: 800 }}>{nAttention}</span>
              )}
            </button>
          ))}
        </div>

        {/* ============ OGGI (HOME) — dietro flag SHOW_OGGI ============ */}
        {SHOW_OGGI && tab === "oggi" && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>OGGI · {new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</Lbl>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 700, marginTop: 8 }}>
                {store.positions.length === 0
                  ? "Nessuna posizione aperta: oggi si osserva o si cerca un'opportunità."
                  : nAttention > 0
                    ? `${nAttention} posizion${nAttention === 1 ? "e richiede" : "i richiedono"} la tua attenzione — partiamo da lì.`
                    : "Le tue posizioni sono in linea col piano. Nessuna azione urgente."}
              </div>
              {alSync.orders.length > 0 && (
                <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.amber}0d`, border: `1px solid ${T.amber}55`, borderRadius: 7 }}>
                  <div style={{ ...mono, fontSize: 10, color: T.amber, fontWeight: 700 }}>⏳ ORDINI IN ATTESA DI ESECUZIONE SUL CONTO ({alSync.orders.length})</div>
                  {alSync.orders.map((o) => {
                    const ageH = ((Date.now() - new Date(o.submitted_at)) / 36e5).toFixed(1);
                    return (
                      <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                        <span style={{ ...mono, fontSize: 11.5, color: T.ink, fontWeight: 700 }}>{o.order_class === "mleg" ? `MULTILEG ×${o.qty} (${(o.legs || []).length} gambe)` : `${o.symbol} ${o.side} ${o.qty}`}</span>
                        <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>{o.type}{o.limit_price ? ` @ $${o.limit_price}` : ""} · {o.time_in_force} · in attesa da {ageH}h</span>
                        <Btn small ghost color={T.red} onClick={async () => { try { await alpacaGet(`/v2/orders/${o.id}`).catch(() => null); await fetch(`/api/alpaca?path=${encodeURIComponent("/v2/orders/" + o.id)}`, { method: "DELETE" }); setMsg("Ordine cancellato ✓"); setAlSync((z) => ({ ...z, orders: z.orders.filter((x) => x.id !== o.id) })); } catch (e) { setMsg(String(e.message)); } }}>Cancella</Btn>
                      </div>
                    );
                  })}
                  <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 5 }}>Appena l'ordine viene eseguito, la posizione entra da sola sotto il Guardian (controllo ogni 60s).</div>
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(430px, 1fr))", gap: 8, marginTop: 10 }}>
                {posAlerts.map(({ p, pnl, dteLeft, level, label, live, spotNow }) => {
                  const c2 = level === "action" ? T.red : level === "watch" ? T.amber : T.green;
                  const pct = p.maxProfit > 0 && pnl != null ? Math.max(0, Math.min(100, (pnl / p.maxProfit) * 100)) : null;
                  const curve = (() => {
                    const ks = p.legs.map((l) => l.strike);
                    const lo3 = Math.min(...ks, spotNow || 1e9) * 0.85, hi3 = Math.max(...ks, spotNow || 0) * 1.15;
                    const pts = [];
                    for (let i = 0; i <= 60; i++) { const sx = lo3 + (i / 60) * (hi3 - lo3); pts.push({ s: sx, exp: (payoffExp(p.legs, sx) - p.entryNet) * 100 }); }
                    return pts;
                  })();
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${c2}44`, borderRadius: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: c2 }} />
                        <span style={{ ...mono, fontSize: 12.5, color: T.ink, fontWeight: 700 }}>{p.ticker} {p.name}</span>
                        {live && <span style={{ ...mono, fontSize: 8.5, color: T.violet, border: `1px solid ${T.violet}55`, borderRadius: 4, padding: "1px 5px" }}>P&L DAL CONTO</span>}
                      </div>
                      <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                        <PayoffThumb curve={curve} height={54} />
                        <div style={{ flex: 1, minWidth: 150 }}>
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                            <Stat k="P&L ORA" v={pnl != null ? fmt$(pnl) : "…"} c={pnl >= 0 ? T.green : T.red} />
                            <Stat k="PREZZO ORA" v={spotNow != null ? `$${spotNow.toFixed(2)}` : "…"} />
                            <Stat k="ENTRY" v={p.entrySpot != null ? `$${(+p.entrySpot).toFixed(2)}` : "—"} c={T.amber} />
                            <Stat k="DTE" v={dteLeft} c={dteLeft <= 7 ? T.red : T.mut} />
                          </div>
                          {pct != null && (
                            <div style={{ marginTop: 6 }}>
                              <div style={{ position: "relative", height: 7, background: T.line, borderRadius: 4 }}>
                                <div style={{ position: "absolute", left: "50%", width: 1, top: -2, bottom: -2, background: T.amber }} title="TP 50%" />
                                <div style={{ width: `${pct}%`, height: 7, borderRadius: 4, background: pnl >= 0 ? `${T.green}bb` : `${T.red}bb` }} />
                              </div>
                              <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 2 }}>{pct.toFixed(0)}% del max profit · linea ambra = TP 50%</div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, color: T.body, marginTop: 6 }}>{label}</div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        <Btn small color={c2} onClick={() => setTab("paper")}>Guardian completo →</Btn>
                        <Btn small ghost color={T.blue} onClick={() => { setTicker(p.ticker); if (!chains[p.ticker]) refreshChain(p.ticker); setExpKey(p.expKey || null); setLegs(p.legs.map((l) => ({ ...l }))); setStratName(p.name + " (monitor)"); setTab("build"); }}>Monitor grafico →</Btn>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {store.positions.length === 0 && <Btn onClick={() => setTab("wizard")}><Compass size={13} /> Trova il mio trade</Btn>}
                {scan[0] && (
                  <Btn ghost color={T.blue} onClick={() => { setSentiment(scan[0].sugg); switchTicker(scan[0].tk); setTab("optimize"); }}>
                    Stagionalità più forte: {scan[0].tk} ({scan[0].seasonalScore > 0 ? "+" : ""}{scan[0].seasonalScore.toFixed(1)}%/m) →
                  </Btn>
                )}
                <Btn ghost onClick={() => setTab("news")}>News taggate →</Btn>
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl>IL TUO PERCORSO · LIVELLO {journey.level}/5 {journey.score != null ? `· AWARENESS ${journey.score}/100` : ""}</Lbl>
              <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
                {["Osservatore", "Primo trade", "Gestore", "Stratega", "Autopilota"].map((n, i) => (
                  <div key={n} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 6, borderRadius: 3, background: i < journey.level ? T.amber : T.line }} />
                    <div style={{ ...mono, fontSize: 8.5, color: i < journey.level ? T.amber : T.dim, marginTop: 3 }}>{n}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: T.body, marginTop: 8 }}>→ {journey.next}</div>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Questa piattaforma ti accompagna al profitto con regole, non con promesse: TP 50% · SL 50% · exit 7 DTE · max 5% per trade.</div>
            </Panel>
          </div>
        )}

        {/* ============ WIZARD ============ */}
        {tab === "wizard" && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>TROVA IL MIO TRADE · 3 DOMANDE, ZERO GERGO · SOLO PAPER (DENARO FINTO)</Lbl>
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 700 }}>1 · Quanto sei disposto a rischiare al massimo su questa operazione?</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 2 }}>È il massimo che puoi perdere, mai un centesimo di più. Regola d'oro: max 5% del tuo capitale.</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {[Math.round(0.01 * (store.settings.capital || 5000)), Math.round(0.025 * (store.settings.capital || 5000)), Math.round(0.05 * (store.settings.capital || 5000))].map((v) => (
                    <Btn key={v} small ghost={wiz.risk !== v} onClick={() => setWiz({ ...wiz, risk: v })}>${v}{v === Math.round(0.05 * (store.settings.capital || 5000)) ? " (max 5%)" : ""}</Btn>
                  ))}
                  <Inp type="number" min={50} step={50} value={wiz.risk} onChange={(e) => setWiz({ ...wiz, risk: Math.max(50, +e.target.value) })} style={{ width: 90 }} />
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 700 }}>2 · Quanto tempo vuoi dare all'idea?</div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  {[[21, "2-4 settimane"], [45, "1-2 mesi (consigliato)"], [75, "2-3 mesi"]].map(([v, l]) => (
                    <Btn key={v} small ghost={wiz.horizon !== v} onClick={() => setWiz({ ...wiz, horizon: v })}>{l}</Btn>
                  ))}
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <Btn onClick={runWizard} disabled={wiz.busy}><Compass size={13} /> {wiz.busy ? "Cerco la migliore opportunità…" : "Trova il mio trade"}</Btn>
              </div>
              {wiz.err && <div style={{ ...mono, fontSize: 11.5, color: T.red, marginTop: 10 }}>{wiz.err}</div>}
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl>IL TUO PERCORSO · LIVELLO {journey.level}/5 {journey.score != null ? `· AWARENESS ${journey.score}/100` : ""}</Lbl>
              <div style={{ display: "flex", gap: 3, marginTop: 8 }}>
                {["Osservatore", "Primo trade", "Gestore", "Stratega", "Autopilota"].map((n, i) => (
                  <div key={n} style={{ flex: 1, textAlign: "center" }}>
                    <div style={{ height: 6, borderRadius: 3, background: i < journey.level ? T.amber : T.line }} />
                    <div style={{ ...mono, fontSize: 8.5, color: i < journey.level ? T.amber : T.dim, marginTop: 3 }}>{n}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12.5, color: T.body, marginTop: 8 }}>→ {journey.next}</div>
              {journey.score != null && (
                <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                  <Stat k="DISCIPLINA (uscite a regola)" v={journey.disciplina != null ? `${(journey.disciplina * 100).toFixed(0)}%` : "—"} c={journey.disciplina >= 0.8 ? T.green : T.amber} />
                  <Stat k="COERENZA (rischio ≤5%)" v={journey.coerenza != null ? `${(journey.coerenza * 100).toFixed(0)}%` : "—"} />
                  <Stat k="PAZIENZA (no overtrading)" v={journey.pazienza != null ? `${(journey.pazienza * 100).toFixed(0)}%` : "—"} />
                  <Stat k="TRADE CHIUSI" v={journey.closed} />
                </div>
              )}
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Si sale di livello con i comportamenti, non col tempo: disciplina nelle uscite, rispetto del rischio, niente overtrading.</div>
            </Panel>

            {wiz.result && (
              <Panel style={{ marginTop: 10, border: `1px solid ${T.green}55` }}>
                <Lbl>DUE STRADE, NUMERI VERI · {wiz.result.tk} · SCADENZA {wiz.result.expKey}</Lbl>
                <div style={{ fontSize: 12.5, color: T.body, marginTop: 8 }}>{wiz.result.recoTxt}</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 10, marginTop: 10 }}>
                  {wiz.result.props.map((pp) => {
                    const isReco = wiz.result.reco === pp.kind;
                    const col = pp.kind === "safe" ? T.green : T.violet;
                    return (
                      <div key={pp.kind} style={{ padding: "12px 14px", background: T.bg, border: `1px solid ${col}${isReco ? "" : "44"}`, borderRadius: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                          <div style={{ fontWeight: 800, color: col, fontSize: 13 }}>{pp.kind === "safe" ? "🛡 PRUDENTE" : "🚀 AMBIZIOSA"}{isReco && <span style={{ ...mono, fontSize: 9, color: T.amber, marginLeft: 8 }}>★ consigliata ora</span>}</div>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 700, marginTop: 6 }}>{pp.name} ×{pp.n}</div>
                        <div style={{ fontSize: 12.5, color: T.body, marginTop: 4 }}>
                          {pp.winTxt}; rischi al massimo <b style={{ color: T.red }}>{fmt$(pp.totRisk)}</b>, guadagni fino a <b style={{ color: T.green }}>{fmt$(pp.totProfit)}</b>.
                        </div>
                        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                          <Stat k="CHANCE" v={`${(pp.pop * 100).toFixed(0)}%`} c={col} />
                          <Stat k="EV/$100" v={`${pp.ev100 >= 0 ? "+" : ""}$${pp.ev100.toFixed(0)}`} c={pp.ev100 >= 0 ? T.green : T.red} />
                          <Stat k="RISCHIO" v={fmt$(pp.totRisk)} c={T.red} />
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <Btn color={col} onClick={() => { setTicker(pp.tk); setExpKey(pp.expKey); setLegs(pp.legs.map((l) => ({ ...l }))); setStratName(`${pp.name} (wizard)`); setMc(null); setBt(null); setTab("build"); }}>Vedi e conferma nel Builder →</Btn>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>Nel Builder: grafico completo, guardrail 5%, livelli d'uscita automatici e apertura paper (denaro finto). La scelta resta tua: la piattaforma consiglia, non decide.</div>
              </Panel>
            )}
          </div>
        )}

        {/* ============ SCANNER ============ */}        {/* ============ SCANNER ============ */}
        {tab === "scan" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Lbl>BEST OPPORTUNITIES · SEGNALE A 4 FATTORI · {MONTHS_IT[NOW_MONTH].toUpperCase()}</Lbl>
              <Btn small ghost onClick={async () => { setBusy("all"); for (const tk of Object.keys(UNDERLYINGS)) await refreshChain(tk, true); setBusy(null); setMsg("Tutte le chain aggiornate ✓"); }}>
                <RefreshCw size={11} /> Aggiorna tutte
              </Btn>
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {scan.map((r, i) => {
                const sObj = SENTIMENTS.find((s) => s.id === r.sugg);
                return (
                  <div key={r.tk} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, flexWrap: "wrap" }}>
                    <span style={{ ...mono, fontSize: 11, color: T.dim, width: 18 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>{r.tk} <span style={{ color: T.dim, fontWeight: 400, fontSize: 11 }}>{r.name}</span></div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut }}>
                        stag. {r.seasonalScore > 0 ? "+" : ""}{r.seasonalScore.toFixed(1)}%/m {r.real ? "(reale 10y)" : "(stima)"} · {r.spot ? `$${r.spot.toFixed(2)}` : "chain da caricare"}{ta[r.tk] ? ` · trend ${ta[r.tk].trend > 0 ? "↑" : ta[r.tk].trend < 0 ? "↓" : "→"} RSI ${ta[r.tk].rsi.toFixed(0)}` : ""}
                      </div>
                    </div>
                    {r.fused && (() => {
                      const c = r.conflict ? T.red : r.agreement === "CONFLUENT" ? T.green : T.blue;
                      return (
                        <span title={r.fused.narrative} style={{ ...mono, fontSize: 9.5, color: c, border: `1px solid ${c}66`, padding: "3px 8px", borderRadius: 5, cursor: "help" }}>
                          {r.agreement} · {r.signalScore > 0 ? "+" : ""}{r.signalScore}/100 · conf {r.confidence}
                        </span>
                      );
                    })()}
                    <span style={{ ...mono, fontSize: 10, color: sObj.color, border: `1px solid ${sObj.color}66`, padding: "3px 8px", borderRadius: 5 }}>{sObj.icon} {sObj.label.toUpperCase()}</span>
                    <Btn small ghost onClick={() => { switchTicker(r.tk); setSentiment(r.sugg); setTab("optimize"); }}>→ Ottimizza</Btn>
                  </div>
                );
              })}
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>
The order weighs the 4-factor signal (seasonality, price trend, weather, news): CONFLICT tickers stay last regardless. Tap or hover the badge for the full narrative. Carica la Alpha Vantage key (tab Paper → Integrazioni) e premi "Stagionalità reale" nel Backtest per sostituire le stime con 10 anni di dati veri per ticker.
            </div>
          </Panel>
        )}

        {/* ============ OPTIMIZE ============ */}
        {tab === "optimize" && spot && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>1 · SENTIMENT MACRO</Lbl>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {SENTIMENTS.map((s) => (
                  <button key={s.id} onClick={() => setSentiment(s.id)}
                    style={{
                      ...mono, fontSize: 11, padding: "10px 12px", borderRadius: 24, cursor: "pointer", flex: "1 1 auto",
                      background: sentiment === s.id ? s.color : "transparent",
                      color: sentiment === s.id ? "#14181d" : s.color,
                      border: `1.5px solid ${s.color}`, fontWeight: 700,
                    }}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <Stat k="TARGET IMPLICITO" v={`$${(spot * (1 + SENT.tgt)).toFixed(2)} (${SENT.tgt >= 0 ? "+" : ""}${(SENT.tgt * 100).toFixed(0)}%)`} c={T.blue} />
                <div>
                  <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>MODALITÀ OPTIMIZER</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small ghost={optMode !== "budget"} onClick={() => setOptMode("budget")}>Budget premio</Btn>
                    <Btn small ghost={optMode !== "target"} onClick={() => setOptMode("target")}>Obiettivo ricavo</Btn>
                  </div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{optMode === "budget" ? "BUDGET MAX A RISCHIO ($)" : "RICAVO OBIETTIVO ($)"}</div>
                  <Inp type="number" min={50} step={50} value={optAmt} onChange={(e) => setOptAmt(Math.max(0, +e.target.value))} style={{ width: 100 }} />
                </div>
                {chain && (
                  <div>
                    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>SCADENZA REALE</div>
                    <select value={expKey || ""} onChange={(e) => setExpKey(e.target.value)}
                      style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "5px 8px", fontSize: 12 }}>
                      {chain.expirations.map((e) => (
                        <option key={e} value={e}>{e} · {chain.byExp[e].dte} DTE</option>
                      ))}
                    </select>
                    {chain.expirations.length <= 4 && (
                      <div style={{ ...mono, fontSize: 9, color: T.dim, marginTop: 3, maxWidth: 220 }}>
                        Queste sono TUTTE le scadenze quotate da CBOE per {ticker} (ETF con sole mensili): non è un limite dell'app.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            <WhyThisTrade
              fused={fused[ticker]}
              title={`WHY THIS TRADE · ${ticker}`}
              note={fused[ticker]?.agreement === "CONFLICT"
                ? "Candidates on a CONFLICT ticker rank last in the multi-market scan below, whatever their expected value."
                : "The scan below ranks candidates on expected value adjusted by this read."}
            />

            <Panel style={{ marginTop: 10 }}>
              <Lbl>2 · STRATEGIE {SENT.label.toUpperCase()} — {ticker} · PREMI DA CHAIN REALE</Lbl>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {buildPresets(sentiment, spot, U.step, expStrikes).map((p) => {
                  const a = analyze(p.legs, spot, dte, iv, q);
                  const rr = a.maxProfit > 0 && a.maxLoss < 0 ? (a.maxProfit / Math.abs(a.maxLoss)) : null;
                  const ivAvg = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
                  const pop = probProfit(a.curve, spot, ivAvg, dte);
                  return (
                    <div key={p.name} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>
                          {p.name}{" "}
                          <span style={{ ...mono, fontSize: 9, color: a.realCount === p.legs.length ? T.green : T.amber }}>
                            {a.realCount === p.legs.length ? "● quote reali" : `◐ ${a.realCount}/${p.legs.length} reali`}
                          </span>
                        </div>
                        <Btn small onClick={() => applyPreset(p, a)}>Apri in Builder →</Btn>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")}
                      </div>
                      <div style={{ marginTop: 6 }}><PayoffThumb curve={a.curve} /></div>
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                        <Stat k={a.entry >= 0 ? "DEBITO" : "CREDITO"} v={fmt$(Math.abs(a.entry) * 100)} />
                        <Stat k="MAX PROFIT" v={fmt$(a.maxProfit)} c={T.green} />
                        <Stat k="MAX LOSS" v={fmt$(a.maxLoss)} c={T.red} />
                        <Stat k="R/R" v={rr ? rr.toFixed(2) : "—"} c={T.amber} />
                        <Stat k="CHANCE" v={pop != null ? `${(pop * 100).toFixed(0)}%` : "—"} c={pop >= 0.5 ? T.green : T.violet} />
                        <Stat k="BREAKEVEN" v={a.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                      </div>
                      {(() => {
                        const sc = scaleStrategy(a, optMode, optAmt);
                        if (!sc) return <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Scaling non applicabile (profitto illimitato o rischio nullo): valuta a 1 contratto.</div>;
                        if (!sc.ok) return <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 6 }}>✗ Budget insufficiente: 1 combo {sc.isCredit ? `richiede ${fmt$(sc.unit)} di capitale a rischio` : `costa ${fmt$(sc.unit)} di premio (chain reale)`}.</div>;
                        return (
                          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", padding: "6px 8px", background: `${T.amber}0d`, borderRadius: 5 }}>
                            <Stat k="COMBO" v={`×${sc.n}`} c={T.amber} />
                            <Stat k={sc.isCredit ? "CREDITO INCASSATO" : "PREMIO DA PAGARE"} v={fmt$(sc.totPrem)} c={sc.isCredit ? T.green : T.ink} />
                            <Stat k="CAPITALE A RISCHIO" v={fmt$(sc.totRisk)} c={T.red} />
                            <Stat k="MAX RICAVO TOT" v={fmt$(sc.totProfit)} c={T.green} />
                            {pop != null && <Stat k="RICAVO ATTESO × CHANCE" v={fmt$(sc.totProfit * pop)} c={T.blue} />}
                            <Stat k={optMode === "target" ? "COPRE OBIETTIVO" : "USO BUDGET"} v={optMode === "target" ? (sc.totProfit >= optAmt ? "✓ sì" : "✗ no") : `${((sc.n * sc.unit / Math.max(1, optAmt)) * 100).toFixed(0)}%`} c={T.blue} />
                            <div style={{ ...mono, fontSize: 9, color: T.dim, width: "100%" }}>Totali per ×{sc.n} combo · il Builder mostra sempre 1 combo: per confrontare, dividi per {sc.n}.</div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>3 · CONFRONTO MULTI-COMMODITY · USA IL PANNELLO SENTIMENT QUI SOPRA</Lbl>
                  <Btn small onClick={runMultiScan} disabled={multi.busy}><Radar size={11} /> {multi.busy ? "Scansiono…" : "Scansiona selezionati"}</Btn>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small ghost={multi.senMode !== "auto"} onClick={() => setMulti((m) => ({ ...m, senMode: "auto", res: null }))}>Stagionalità per mercato</Btn>
                    <Btn small ghost={multi.senMode !== "fixed"} onClick={() => setMulti((m) => ({ ...m, senMode: "fixed", res: null }))}>Sentiment scelto ({SENT.label}) su tutti</Btn>
                  </div>
                  <span style={{ ...mono, fontSize: 10, color: T.dim }}>ORIZZONTE: ~{multi.dteT} DTE</span>
                  <input type="range" min={21} max={90} step={1} value={multi.dteT} onChange={(e) => setMulti((m) => ({ ...m, dteT: +e.target.value, res: null }))} style={{ width: 160, accentColor: T.amber }} />
                  <span style={{ ...mono, fontSize: 9.5, color: T.dim }}>cambia orizzonte → rilancia la scansione</span>
                </div>
                <div style={{ display: "flex", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                  {Object.keys(UNDERLYINGS).map((tk) => (
                    <Btn key={tk} small ghost={!multi.sel.includes(tk)}
                      onClick={() => setMulti((m) => ({ ...m, sel: m.sel.includes(tk) ? m.sel.filter((x) => x !== tk) : [...m.sel, tk] }))}>
                      {tk}
                    </Btn>
                  ))}
                </div>
                {multi.err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{multi.err}</div>}
                {multi.res && (
                  <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    {multi.res.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Nessuna strategia entra nel budget sui mercati selezionati.</div>}
                    {multi.res.some((r) => r.conflict) && (
                      <div style={{ ...mono, fontSize: 10, color: T.red }}>
                        Candidates marked CONFLICT sit at the bottom by construction: the four factors contradict each other on that underlying, and no expected value is worth a signal we cannot read.
                      </div>
                    )}
                    {multi.res.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                        <span style={{ ...mono, fontSize: 10, color: T.dim, width: 16 }}>#{i + 1}</span>
                        <PayoffThumb curve={r.a.curve} height={36} />
                        <div style={{ flex: 1, minWidth: 140 }}>
                          <div style={{ fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{r.tk} · {r.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: T.dim }}>{r.expKey} · {r.dte} DTE · ×{r.n}</div>
                        </div>
                        {r.tag && <span title={r.tag.d} style={{ ...mono, fontSize: 8.5, color: r.tag.c, border: `1px solid ${r.tag.c}55`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>{r.tag.t}</span>}
                        {r.fused && (
                          <span title={r.fused.narrative}
                            style={{ ...mono, fontSize: 8.5, color: r.conflict ? T.red : r.fused.agreement === "CONFLUENT" ? T.green : T.blue, border: `1px solid ${(r.conflict ? T.red : r.fused.agreement === "CONFLUENT" ? T.green : T.blue)}55`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>
                            {r.fused.agreement} {r.fused.score > 0 ? "+" : ""}{r.fused.score}
                          </span>
                        )}
                        <Stat k="CHANCE" v={`${(r.pop * 100).toFixed(0)}%`} c={r.pop >= 0.5 ? T.green : T.violet} />
                        <Stat k="EV/$100" v={`${r.ev100 >= 0 ? "+" : ""}$${r.ev100.toFixed(0)}`} c={r.ev100 >= 0 ? T.green : T.red} />
                        <Stat k="RANK" v={`${r.rank >= 0 ? "+" : ""}${r.rank.toFixed(0)}`} c={r.conflict ? T.red : T.amber} />
                        <Stat k="MAX TOT" v={fmt$(r.n * r.a.maxProfit)} c={T.green} />
                        <Btn small ghost onClick={() => { setTicker(r.tk); setExpKey(r.expKey); setLegs(r.legs.map((l) => ({ ...l }))); setStratName(`${r.name} (multi)`); setMc(null); setBt(null); setTab("build"); }}>Builder →</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Budget = premio massimo da pagare (in USD, dai mid reali della chain CBOE); per i credit spread, dove il premio si incassa, il vincolo diventa il capitale a rischio. Chance = probabilità di profitto a scadenza (lognormale con IV reale della chain). Ricorda la regola 5% del capitale per trade.</div>
            </Panel>
          </div>
        )}

        {/* ============ BUILDER ============ */}
        {tab === "build" && spot && A && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <input value={stratName} onChange={(e) => setStratName(e.target.value)}
                  style={{ ...mono, background: "transparent", border: "none", borderBottom: `1px dashed ${T.line}`, color: T.ink, fontSize: 15, fontWeight: 700, outline: "none", minWidth: 200 }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn small ghost color={T.blue} onClick={saveStrategy}><Save size={12} /> Salva</Btn>
                  <Btn small color={T.green} onClick={openPaper} disabled={!reasonOk}><Briefcase size={12} /> Paper interno</Btn>
                  
                </div>
              </div>

              {chain && (
                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 10, color: T.dim }}>SCADENZA</span>
                  <select value={expKey || ""} onChange={(e) => { setExpKey(e.target.value); setMc(null); setBt(null); }}
                    style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "5px 8px", fontSize: 12 }}>
                    {chain.expirations.map((e) => (
                      <option key={e} value={e}>{e} · {chain.byExp[e].dte} DTE</option>
                    ))}
                  </select>
                  <span style={{ ...mono, fontSize: 10, color: A.realCount === legs.length ? T.green : T.amber }}>
                    {A.realCount === legs.length ? "● tutti i premi da quote CBOE reali (mid bid/ask)" : `◐ ${A.realCount}/${legs.length} legs con quote reali — gli altri sono BS`}
                  </span>
                </div>
              )}

              <WhyThisTrade
                fused={fused[ticker]}
                title={`WHY THIS TRADE · ${ticker}`}
                note={tradeDir === 0
                  ? "This structure is direction-neutral: it wants a quiet tape more than a call on direction."
                  : `This structure needs ${ticker} to go ${tradeDir > 0 ? "up" : "down"}.`}
              />

              {/* ---- Andare contro il segnale (PRD §7) ----
                  Non si chiude e non blocca il trade: chiede la motivazione
                  scritta, che viene salvata nella tesi della posizione. */}
              {clash && (
                <div style={{ marginTop: 10, padding: "11px 13px", background: `${T.amber}12`, border: `1.5px solid ${T.amber}`, borderRadius: 8 }}>
                  <div style={{ ...mono, fontSize: 12.5, fontWeight: 800, color: T.amber }}>{clash.question}</div>
                  <div style={{ fontSize: 12.5, color: T.body, marginTop: 5, lineHeight: 1.5 }}>{clash.detail}.</div>
                  <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                    {clash.opposing.map((o) => (
                      <div key={o.key} style={{ ...mono, fontSize: 10.5, color: T.mut }}>
                        <span style={{ color: T.red, fontWeight: 700 }}>✗ {o.label}</span> ({o.strength}/100) — {o.why}
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={against.reason}
                    onChange={(e) => setAgainst({ reason: e.target.value })}
                    placeholder="Why are you taking this trade anyway? Write the reason — it is stored with the position and you will read it again when you close."
                    rows={3}
                    style={{ ...mono, width: "100%", boxSizing: "border-box", marginTop: 9, background: T.bg, color: T.ink, border: `1px solid ${reasonOk ? T.green : T.amber}`, borderRadius: 6, padding: "8px 9px", fontSize: 12, resize: "vertical" }}
                  />
                  <div style={{ ...mono, fontSize: 10, color: reasonOk ? T.green : T.dim, marginTop: 4 }}>
                    {reasonOk
                      ? "✓ Reason recorded: it will be saved with the position and shown again when you close it."
                      : `${Math.max(0, REASON_MIN - against.reason.trim().length)} more characters. Nothing here stops you taking this trade — you are only asked to write down why.`}
                  </div>
                </div>
              )}

              {guard && (guard.overTrade || guard.overTotal) && (
                <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.red}12`, border: `1px solid ${T.red}66`, borderRadius: 7 }}>
                  <div style={{ ...mono, fontSize: 11, color: T.red, fontWeight: 700 }}>⚠ GUARDRAIL: questo trade viola le tue regole</div>
                  <div style={{ fontSize: 12, color: T.body, marginTop: 3 }}>
                    {guard.overTrade && <>Rischio {fmt$(guard.tradeRisk)} &gt; 5% del capitale ({fmt$(guard.maxTradeRisk)}). </>}
                    {guard.overTotal && <>Esposizione totale {fmt$(guard.openRisk + guard.tradeRisk)} &gt; 25% ({fmt$(guard.maxTotal)}). </>}
                    Riduci quantità o strike, oppure procedi consapevolmente (verrà segnato nel tuo percorso).
                  </div>
                </div>
              )}
              {guard && !guard.overTrade && !guard.overTotal && (
                <div style={{ ...mono, fontSize: 10, color: T.green, marginTop: 8 }}>✓ Dentro le regole: rischio {fmt$(guard.tradeRisk)} / max {fmt$(guard.maxTradeRisk)} (5% di {fmt$(guard.cap)}) · esposizione {fmt$(guard.openRisk + guard.tradeRisk)} / {fmt$(guard.maxTotal)}</div>
              )}

              <ChainMatrix chain={chain} expKey={expKey} spot={spot} legs={legs} onCell={onChainCell} />

              {/* Legs editor */}
              <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
                {legs.map((l, i) => {
                  const lp = A.legPx[i];
                  return (
                    <div key={i} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, padding: "8px 10px" }}>
                      <button onClick={() => updLeg(i, "side", -l.side)} style={{ ...mono, fontSize: 11, fontWeight: 800, width: 52, padding: "5px 0", borderRadius: 5, cursor: "pointer", background: l.side > 0 ? `${T.green}22` : `${T.red}22`, color: l.side > 0 ? T.green : T.red, border: `1px solid ${l.side > 0 ? T.green : T.red}55` }}>
                        {l.side > 0 ? "BUY" : "SELL"}
                      </button>
                      <button onClick={() => updLeg(i, "type", l.type === "call" ? "put" : "call")} style={{ ...mono, fontSize: 11, fontWeight: 700, width: 52, padding: "5px 0", borderRadius: 5, cursor: "pointer", background: `${T.blue}18`, color: T.blue, border: `1px solid ${T.blue}44` }}>
                        {l.type.toUpperCase()}
                      </button>
                      {expStrikes ? (
                        <select value={l.strike} onChange={(e) => updLeg(i, "strike", +e.target.value)}
                          style={{ ...mono, background: T.panel, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "5px 6px", fontSize: 12, width: 90 }}>
                          {expStrikes.map((k) => <option key={k} value={k}>{k}</option>)}
                        </select>
                      ) : (
                        <Inp type="number" step={U.step} value={l.strike} onChange={(e) => updLeg(i, "strike", +e.target.value)} style={{ width: 76 }} />
                      )}
                      <Inp type="number" min={1} max={10} value={l.qty} onChange={(e) => updLeg(i, "qty", Math.max(1, +e.target.value))} style={{ width: 48 }} />
                      <span style={{ ...mono, fontSize: 11, color: lp.real ? T.green : T.mut, marginLeft: "auto" }}>
                        ${lp.px.toFixed(2)} {lp.real ? "●" : "◌"} <span style={{ color: T.dim }}>IV {(lp.iv * 100).toFixed(0)}%{lp.oi != null ? ` · OI ${lp.oi}` : ""}</span>
                      </span>
                      {(() => { const qq = q(l); const occ = qq?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null); return occ ? (
                        <button title="storico del contratto" onClick={() => setOptLeg({ occ, label: `${ticker} ${l.strike}${l.type === "call" ? "C" : "P"} ${expKey}`, quote: qq })}
                          style={{ background: "none", border: "none", color: T.violet, cursor: "pointer", ...mono, fontSize: 13 }}>📈</button>
                      ) : null; })()}
                      <button onClick={() => rmLeg(i)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}><Trash2 size={14} /></button>
                    </div>
                  );
                })}
                <Btn small ghost onClick={addLeg}><Plus size={12} /> Aggiungi leg</Btn>
              </div>
              {optLeg && <OptionPanel occ={optLeg.occ} label={optLeg.label} quote={optLeg.quote} onClose={() => setOptLeg(null)} />}

              {/* Riconciliazione con l'Optimizer: stesso trade, numeri sempre spiegati */}
              {optRef && optRef.name === stratName && optRef.expKey === expKey && (() => {
                const d = (A.entry - optRef.entry) * 100;
                if (Math.abs(d) < 1) return (
                  <div style={{ ...mono, fontSize: 10, color: T.green, marginTop: 10 }}>✓ Numeri identici all'Optimizer (stesse quote CBOE, 1 combo).</div>
                );
                return (
                  <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 10 }}>
                    ⚠ Dall'Optimizer il net è cambiato di {fmt$(Math.abs(d))} ({d > 0 ? "più caro" : "più conveniente"}): le quote CBOE si sono aggiornate tra i due tab (delayed ~15m). Il prezzo vero è questo del Builder.
                  </div>
                );
              })()}
              {/* Stats */}
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                <Stat k={A.entry >= 0 ? "NET DEBIT" : "NET CREDIT"} v={fmt$(Math.abs(A.entry) * 100)} tip="Quanto paghi (debit) o incassi (credit) per aprire la combinazione. Con quote reali è il mid tra bid e ask." />
                <Stat k="MAX PROFIT" v={fmt$(A.maxProfit)} c={T.green} tip="Il massimo che puoi guadagnare a scadenza, nello scenario migliore." />
                <Stat k="MAX LOSS" v={fmt$(A.maxLoss)} c={T.red} tip="Il massimo che puoi perdere: è definito in partenza, mai un dollaro di più." />
                <Stat k="BREAKEVEN" v={A.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                <Stat k="TP 50%" v={fmt$(A.maxProfit * 0.5)} c={T.green} tip="La tua regola: incassa quando il profitto raggiunge metà del massimo. Statisticamente batte l'attesa fino a scadenza." />
                <Stat k="SL 50%" v={fmt$(A.maxLoss * 0.5)} c={T.red} tip="La tua regola: ferma la perdita a metà del massimo. Protegge il capitale dagli scenari peggiori." />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                <Stat k="Δ DELTA" v={A.greeks.delta.toFixed(2)} />
                <Stat k="Γ GAMMA" v={A.greeks.gamma.toFixed(3)} />
                <Stat k="Θ THETA/g" v={fmt$(A.greeks.theta)} c={A.greeks.theta >= 0 ? T.green : T.red} tip="Quanto guadagni (+) o perdi (−) ogni giorno che passa, a parità di prezzo. Il tempo lavora per te se è positivo." />
                <Stat k="V VEGA/1%" v={fmt$(A.greeks.vega)} c={T.violet} tip="Quanto cambia il valore se la volatilità implicita sale dell'1%. Positivo = ti aiuta l'agitazione del mercato." />
              </div>

              <div style={{ marginTop: 14 }}>
                <Lbl>VISTA UNIFICATA · PREZZO STORICO × CONO DI PROBABILITÀ × ZONE DELLA TUA STRATEGIA</Lbl>
                <div style={{ marginTop: 8 }}>
                  <UnifiedView
                    ticker={ticker} dte={dte} spot={spot}
                    sigma={A.legPx.length ? A.legPx.reduce((x, y) => x + y.iv, 0) / A.legPx.length : iv}
                    driftM={seas.monthlyMean[NOW_MONTH]}
                    curve={A.curve} legs={legs} breakevens={A.breakevens}
                    onTa={(t2) => setTa((m) => ({ ...m, [ticker]: t2 }))}
                  />
                </div>
              </div>

              {(() => {
                const t2 = ta[ticker];
                const cf = confluence(seas.monthlyMean[NOW_MONTH], t2);
                if (!cf) return null;
                return (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: `${cf.c}0d`, border: `1px solid ${cf.c}55`, borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: cf.c }}>CONFLUENZA: {cf.verdict}</span>
                      <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>stagionalità {seas.monthlyMean[NOW_MONTH] >= 0 ? "+" : ""}{seas.monthlyMean[NOW_MONTH].toFixed(1)}%/m · trend {t2.trendTxt} · RSI14 {t2.rsi.toFixed(0)}{t2.cross ? ` · ${t2.cross === "golden" ? "✚ golden cross recente" : "✖ death cross recente"}` : ""}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.body, marginTop: 5 }}>{cf.advice}</div>
                    {cf.warn && <div style={{ fontSize: 12, color: T.amber, marginTop: 4 }}>{cf.warn}</div>}
                    <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 5 }}>Metodo: la tecnica è un filtro di conferma/timing sulla stagionalità (albero decisionale della tua skill), non un segnale autonomo.</div>
                  </div>
                );
              })()}

              {/* Payoff classico: vista secondaria */}
              <div style={{ marginTop: 14 }}>
              <Lbl>PAYOFF CLASSICO (P&L PER PREZZO A SCADENZA / OGGI / METÀ VITA)</Lbl>
              <div style={{ height: 240, marginTop: 8 }}>
                <ResponsiveContainer>

                  <LineChart data={A.curve} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke={T.line} strokeDasharray="3 3" />
                    <XAxis dataKey="s" stroke={T.dim} tick={{ fontSize: 10, fontFamily: "monospace" }} />
                    <YAxis stroke={T.dim} tick={{ fontSize: 10, fontFamily: "monospace" }} width={52} />
                    <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} labelFormatter={(v) => `S = $${v}`} />
                    <ReferenceLine y={0} stroke={T.mut} />
                    <ReferenceLine x={+spot.toFixed(2)} stroke={T.amber} strokeDasharray="4 3" label={{ value: "spot", fill: T.amber, fontSize: 10 }} />
                    {lv && lv.supports.map((s) => <ReferenceLine key={"s" + s} x={s} stroke={T.green} strokeDasharray="2 4" />)}
                    {lv && lv.resistances.map((s) => <ReferenceLine key={"r" + s} x={s} stroke={T.red} strokeDasharray="2 4" />)}
                    <Line dataKey="now" name="oggi (T+0)" stroke={T.violet} dot={false} strokeWidth={1.5} strokeDasharray="2 3" />
                    <Line dataKey="mid" name={`a T-${Math.round(dte / 2)}g`} stroke={T.blue} dot={false} strokeWidth={1.5} strokeDasharray="5 4" />
                    <Line dataKey="exp" name="a scadenza" stroke={T.amber} dot={false} strokeWidth={2.2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              </div>

              {alpaca && !reasonOk && (
                <div style={{ ...mono, fontSize: 11, color: T.amber, marginTop: 10, padding: "9px 11px", border: `1px solid ${T.amber}66`, borderRadius: 7 }}>
                  The order ticket unlocks as soon as you write why you are going against {clash.n} of {clash.total} factors. The trade is not forbidden — the written reason is required.
                </div>
              )}
              {alpaca && reasonOk && (
                <OrderTicket
                  onSent={(o) => openPaper(o)}
                  legs={legs} expKey={expKey} ticker={ticker}
                  buildOcc={buildOcc} quoteFn={q} estNet={A.entry * 100 / 100}
                  setMsg={setMsg}
                />
              )}
              {!alpaca && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Connetti Alpaca (Paper → Integrazioni) per sbloccare l'order ticket pro: limit/market, TIF, quantità, cancellazioni.</div>}
            </Panel>
          </div>
        )}

        {/* ============ 3D ============ */}
        {tab === "3d" && (
          <Panel style={{ marginTop: 12 }}>
            <Lbl>LIVELLI OPEN INTEREST REALI (CBOE) · DOVE SI ADDENSANO LE POSIZIONI DEL MERCATO</Lbl>
            {!oiGrid && <div style={{ ...mono, fontSize: 12, color: T.mut, padding: 30, textAlign: "center" }}>Carica prima la chain con Refresh.</div>}
            {oiGrid && (
              <div style={{ height: 190, marginTop: 10 }}>
                <ResponsiveContainer>
                  <BarChart data={oiGrid.strikes.map((k, j) => ({ k, put: -oiGrid.oiPutTot[j], call: oiGrid.oiCallTot[j] }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} stackOffset="sign">
                    <XAxis dataKey="k" stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} />
                    <YAxis stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} width={44} tickFormatter={(v) => Math.abs(v)} />
                    <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} formatter={(v, n2) => [Math.abs(v), n2 === "put" ? "OI put" : "OI call"]} />
                    <ReferenceLine y={0} stroke={T.mut} />
                    {spot && <ReferenceLine x={oiGrid.strikes.reduce((b2, k) => Math.abs(k - spot) < Math.abs(b2 - spot) ? k : b2, oiGrid.strikes[0])} stroke={T.amber} strokeDasharray="4 3" />}
                    <Bar dataKey="put" fill={`${T.green}bb`} stackId="a" />
                    <Bar dataKey="call" fill={`${T.red}bb`} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {oiGrid && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 2 }}>Profilo OI 2D (sempre disponibile): barre verdi sotto lo zero = muri PUT (supporti), rosse sopra = muri CALL (resistenze), linea ambra = spot.</div>}
            {lv && (
              <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.green }}>SUPPORTI (muri PUT reali)</div>
                  <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: T.ink }}>{lv.supports.map((x) => `$${x}`).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.red }}>RESISTENZE (muri CALL reali)</div>
                  <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: T.ink }}>{lv.resistances.map((x) => `$${x}`).join(" · ") || "—"}</div>
                </div>
              </div>
            )}
            <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>
              OI aggregato sulle prime 6 scadenze ≤120 DTE (CBOE, ~15 min di ritardo). Muri grandi = livelli dove il mercato ha interesse a difendere il prezzo: usali come riferimento per strike e uscite.
            </div>
          </Panel>
        )}

        {/* ============ BACKTEST ============ */}
        {tab === "backtest" && spot && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>STAGIONALITÀ {seasonal[ticker] ? `REALE · ${seas.src}` : "(STIMA — carica dati reali)"}</Lbl>
                <Btn small ghost color={T.blue} onClick={loadSeasonal} disabled={busy === "av"}>
                  <RefreshCw size={11} /> Stagionalità reale 10y
                </Btn>
              </div>
              {(() => {
                const mm = seas.monthlyMean;
                const bi = mm.indexOf(Math.max(...mm)), wi = mm.indexOf(Math.min(...mm));
                const cur = mm[NOW_MONTH];
                const rank = [...mm].sort((a, b) => b - a).indexOf(cur) + 1;
                return (
                  <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, padding: "8px 10px", background: `${T.amber}0a`, borderRadius: 6 }}>
                    <b style={{ color: T.ink }}>In parole semplici:</b> per {ticker} il mese storicamente migliore è <b style={{ color: T.green }}>{MONTHS_IT[bi]}</b> ({mm[bi] > 0 ? "+" : ""}{mm[bi].toFixed(1)}%/mese in media), il peggiore <b style={{ color: T.red }}>{MONTHS_IT[wi]}</b> ({mm[wi].toFixed(1)}%). {MONTHS_IT[NOW_MONTH]} (barra gialla) è il {rank}° mese su 12: {cur > 0.8 ? "vento a favore — le strategie direzionali hanno senso." : cur < -0.8 ? "vento contrario — meglio ribassiste o non-direzionali." : "mese senza spinta chiara — preferisci strategie a intervallo (condor/butterfly)."}
                  </div>
                );
              })()}
              <div style={{ height: 170, marginTop: 10 }}>
                <ResponsiveContainer>
                  <BarChart data={seas.monthlyMean.map((v, i) => ({ m: MONTHS_IT[i], v: +v.toFixed(2) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                    <XAxis dataKey="m" stroke={T.dim} tick={{ fontSize: 9.5, fontFamily: "monospace" }} />
                    <YAxis stroke={T.dim} tick={{ fontSize: 9.5, fontFamily: "monospace" }} width={34} unit="%" />
                    <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} />
                    <ReferenceLine y={0} stroke={T.mut} />
                    <Bar dataKey="v">
                      {seas.monthlyMean.map((v, i) => <Cell key={i} fill={i === NOW_MONTH ? T.amber : v >= 0 ? `${T.green}bb` : `${T.red}bb`} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl>LE 3 PROBABILITÀ DELLA PIATTAFORMA · QUALE GUARDARE E QUANDO</Lbl>
              <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, lineHeight: 1.6 }}>
                <b style={{ color: T.blue }}>CHANCE</b> (Optimize/Builder): fotografia istantanea — probabilità di finire in profitto <i>a scadenza</i>, calcolata dalla volatilità che il mercato prezza ora. Usala per <b>confrontare strategie prima di entrare</b>.<br/>
                <b style={{ color: T.amber }}>MONTE CARLO</b> (qui sotto): stessa domanda ma con la storia — 8.000 scenari con la stagionalità e la volatilità reali degli ultimi 10 anni. Usala per <b>validare che la stagione sia davvero dalla tua</b>. Se Chance e MC divergono molto, il mercato prezza qualcosa che la storia non conosce (evento in arrivo).<br/>
                <b style={{ color: T.violet }}>EXIT PATH</b> (Guardian, per posizioni aperte): la più realistica — simula giorno per giorno <i>da oggi</i> e applica le TUE regole (TP50/SL50/7DTE). È l'unica che risponde a "da qui, come finisce seguendo il piano?". Usala per <b>decidere se tenere o incassare</b>.
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>MONTE CARLO 8.000 SIM + BACKTEST STORICO — "{stratName}"</Lbl>
                <Btn small onClick={runMC} disabled={!A}><FlaskConical size={12} /> Esegui</Btn>
              </div>
              {mc ? (
                <>
                  <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                    <Stat k="PROB. PROFITTO" v={`${(mc.pop * 100).toFixed(1)}%`} c={mc.pop >= 0.5 ? T.green : T.red} tip="Quota di scenari simulati che finiscono in profitto a scadenza." />
                    <Stat k="P&L ATTESO" v={fmt$(mc.ev)} c={mc.ev >= 0 ? T.green : T.red} />
                    <Stat k="P5" v={fmt$(mc.p5)} c={T.red} tip="Scenario pessimo (5% peggiore): solo 1 volta su 20 andrà peggio di così." />
                    <Stat k="MEDIANA" v={fmt$(mc.p50)} />
                    <Stat k="P95" v={fmt$(mc.p95)} c={T.green} tip="Scenario ottimo (5% migliore): solo 1 volta su 20 andrà meglio di così." />
                    <Stat k="DRIFT ANN." v={`${(mc.muAnn * 100).toFixed(1)}%`} c={T.blue} />
                  </div>
                  <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
                    <b style={{ color: T.ink }}>In parole semplici:</b> su 8.000 scenari simulati, {Math.round(mc.pop * 100)} su 100 chiudono in profitto.
                    Nel 5% dei casi peggiori perdi circa {fmt$(Math.abs(mc.p5))}{guard ? (Math.abs(mc.p5) <= guard.maxTradeRisk ? " — dentro la tua regola del 5% del capitale ✓" : ` — ATTENZIONE: oltre la tua regola del 5% (${fmt$(guard.maxTradeRisk)})`) : ""}.
                    Il risultato tipico (mediana) è {fmt$(mc.p50)}.
                  </div>
                  <div style={{ height: 180, marginTop: 12 }}>
                    <ResponsiveContainer>
                      <BarChart data={mc.bins} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                        <XAxis dataKey="x" stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} />
                        <YAxis stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} width={40} />
                        <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} />
                        <Bar dataKey="n">
                          {mc.bins.map((b, i) => <Cell key={i} fill={b.x >= 0 ? `${T.green}cc` : `${T.red}cc`} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {bt ? (
                    <div style={{ marginTop: 12 }}>
                      <Lbl>BACKTEST STORICO REALE · FINESTRA {MONTHS_IT[NOW_MONTH]}→ +{Math.max(1, Math.round(dte / 30))}m PER OGNI ANNO</Lbl>
                      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                        <Stat k="WIN RATE STORICO" v={`${(bt.winRate * 100).toFixed(0)}%`} c={bt.winRate >= 0.5 ? T.green : T.red} />
                        <Stat k="P&L MEDIO" v={fmt$(bt.avg)} c={bt.avg >= 0 ? T.green : T.red} />
                        <Stat k="ANNI" v={bt.rows.length} />
                      </div>
                      <div style={{ display: "flex", gap: 4, marginTop: 8, flexWrap: "wrap" }}>
                        {bt.rows.map((r) => (
                          <button key={r.year} onClick={() => { const row = (seas.matrix || []).find((x) => String(x[0]) === r.year); if (row) runReplay(row); }}
                            style={{ ...mono, fontSize: 10, padding: "3px 7px", borderRadius: 4, cursor: "pointer", background: replay?.year === +r.year ? `${T.amber}22` : "transparent", color: r.pnl >= 0 ? T.green : T.red, border: `1px solid ${r.pnl >= 0 ? T.green : T.red}44` }}>
                            ▶ {r.year}: {fmt$(r.pnl)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 10 }}>
                      Backtest storico anno-per-anno disponibile dopo il caricamento della stagionalità reale (Alpha Vantage).
                    </div>
                  )}
                  {replay && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: `${T.amber}0a`, border: `1px solid ${T.amber}44`, borderRadius: 7 }}>
                      <Lbl>⏪ COSA SAREBBE SUCCESSO NEL {replay.year} · "{stratName}" APERTA A {MONTHS_IT[NOW_MONTH].toUpperCase()}</Lbl>
                      <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                        {replay.steps.map((st2) => (
                          <div key={st2.m} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ ...mono, fontSize: 10, color: T.dim, width: 58 }}>{st2.label}</span>
                            <span style={{ ...mono, fontSize: 11, color: T.ink }}>${st2.S.toFixed(2)}</span>
                            <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: st2.pnl >= 0 ? T.green : T.red, width: 60 }}>{fmt$(st2.pnl)}</span>
                            <span style={{ fontSize: 11.5, color: T.body }}>{st2.note}</span>
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 12.5, color: T.ink, fontWeight: 700, marginTop: 8 }}>
                        Esito seguendo le tue regole: {fmt$(replay.finale)} {replay.closed ? `(${replay.closed.why} al mese ${replay.closed.i})` : "(portata a scadenza)"}
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Simulazione didattica su rendimenti mensili reali: ti allena a fidarti delle regole prima di rischiare.</div>
                    </div>
                  )}
                  <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>
                    MC: GBM con drift stagionale {seasonal[ticker] ? "reale" : "stimato"} e σ {(seas.sigma * 100).toFixed(0)}%. Modello semplificato: niente salti né term structure IV.
                  </div>
                </>
              ) : (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 10 }}>Premi "Esegui" per PoP, distribuzione P&L e backtest sugli ultimi ~10 anni.</div>
              )}
            </Panel>
          </div>
        )}

        {/* ============ NEWS ============ */}
        {tab === "news" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Lbl>NEWS FEED RSS · {ticker} ({U.newsQ})</Lbl>
              <Btn small ghost onClick={() => loadNews(ticker)} disabled={busy === "news"}><RefreshCw size={11} /> Aggiorna</Btn>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              {["ALL", ...Object.keys(UNDERLYINGS)].map((tk) => (
                <Btn key={tk} small ghost={nf.tk !== tk} onClick={() => setNf({ ...nf, tk })}>{tk === "ALL" ? "Tutti" : tk}</Btn>
              ))}
              <span style={{ width: 8 }} />
              {[["all", "Tutte"], ["geo", "Geo/Gov"], ["analysis", "Analisi"], ["tagged", "Con impatto"]].map(([v, l]) => (
                <Btn key={v} small ghost={nf.kind !== v} color={T.violet} onClick={() => setNf({ ...nf, kind: v })}>{l}</Btn>
              ))}
              <select value={nf.days} onChange={(e) => setNf({ ...nf, days: +e.target.value })}
                style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "4px 6px", fontSize: 11 }}>
                <option value={1}>24 ore</option><option value={3}>3 giorni</option><option value={7}>7 giorni</option><option value={0}>Tutte le date</option>
              </select>
              <Inp placeholder="cerca…" value={nf.q} onChange={(e) => setNf({ ...nf, q: e.target.value })} style={{ width: 130 }} />
            </div>
            <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
              {news[ticker]?.loading && <div style={{ ...mono, fontSize: 12, color: T.mut }}>Carico feed…</div>}
              {(news[ticker]?.items || []).filter((n) => {
                if (nf.tk !== "ALL" && !(n.impacts || []).some((im) => im.tk === nf.tk)) return false;
                if (nf.kind === "geo" && !n.geo) return false;
                if (nf.kind === "analysis" && !n.analysis) return false;
                if (nf.kind === "tagged" && !(n.impacts || []).length) return false;
                if (nf.days && n.date && Date.now() - new Date(n.date) > nf.days * 864e5) return false;
                if (nf.q && !n.title.toLowerCase().includes(nf.q.toLowerCase())) return false;
                return true;
              }).map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noreferrer" style={{ textDecoration: "none", padding: "9px 11px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, display: "block" }}>
                  <div style={{ color: T.ink, fontSize: 13, fontWeight: 600, display: "flex", gap: 6, alignItems: "flex-start" }}>
                    <ExternalLink size={12} style={{ marginTop: 3, color: T.blue, flexShrink: 0 }} /> {n.title}
                  </div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 3 }}>{n.src}{n.date ? ` · ${ago(n.date)}` : ""}</div>
                  <ImpactTags item={n} />
                </a>
              ))}
              {news[ticker] && !news[ticker].loading && !(news[ticker].items || []).length && (
                <div style={{ ...mono, fontSize: 12, color: T.mut }}>Nessuna news trovata: riprova ad aggiornare.</div>
              )}
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>
              Fonti: Google News (target + query geopolitiche: OPEC, sanzioni, Mar Nero, USDA, Cina) + Yahoo Finance per ticker + EIA (governo USA). Ogni notizia è taggata per sottostante con direzione e causa→effetto; passa il mouse sui tag per il dettaglio.
            </div>
          </Panel>
        )}

        {/* ============ PAPER + INTEGRAZIONI ============ */}
        {tab === "paper" && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>POSIZIONI PAPER ({store.positions.length}) · MARK-TO-MARKET LIVE</Lbl>
                <label style={{ ...mono, fontSize: 10.5, color: autoMon ? T.green : T.dim, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={autoMon} onChange={(e) => setAutoMon(e.target.checked)} /> auto-refresh 60s
                </label>
              </div>
              {store.positions.length === 0 && <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8 }}>Nessuna posizione. Builder → "Paper interno".</div>}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {store.positions.map((p) => {
                  const c = chains[p.ticker];
                  const s = c?.spot;
                  const dteLeft = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
                  const qp = makeQuote(c, p.expKey);
                  const nowNet = s ? netValue(p.legs, s, dteLeft, getU(p.ticker).iv, qp) : null;
                  const pnl = nowNet != null ? (nowNet - p.entryNet) * 100 : null;
                  const tpHit = pnl != null && p.maxProfit > 0 && pnl >= 0.5 * p.maxProfit;
                  const slHit = pnl != null && p.maxLoss < 0 && pnl <= 0.5 * p.maxLoss;
                  const dteExit = dteLeft <= 7;
                  const rec = tpHit ? { t: "→ CHIUDI: TP 50%", c: T.green } : slHit ? { t: "→ CHIUDI: SL 50%", c: T.red } : dteExit ? { t: "→ CHIUDI/ROLLA: ≤7 DTE", c: T.amber } : { t: "→ HOLD", c: T.mut };
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>{p.ticker} · {p.name}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn small ghost color={T.blue} onClick={() => { setTicker(p.ticker); if (!chains[p.ticker]) refreshChain(p.ticker); setExpKey(p.expKey || null); setLegs(p.legs.map((l) => ({ ...l }))); setStratName(p.name + " (monitor)"); setTab("build"); }}>Monitor ↗</Btn>
                          <Btn small ghost color={T.red} onClick={() => closePos(p.id)}><Trash2 size={11} /> Chiudi</Btn>
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · exp {p.expKey || new Date(p.expiry).toLocaleDateString("it-IT")} · aperta {new Date(p.openedAt).toLocaleDateString("it-IT")}
                      </div>
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Stat k="ENTRY" v={fmt$(Math.abs(p.entryNet) * 100)} />
                        <Stat k="P&L (mark)" v={pnl != null ? fmt$(pnl) : "refresh…"} c={pnl >= 0 ? T.green : T.red} />
                        <Stat k="% MAX PROFIT" v={pnl != null && p.maxProfit > 0 ? `${((pnl / p.maxProfit) * 100).toFixed(0)}%` : "—"} />
                        <Stat k="DTE" v={dteLeft} c={dteExit ? T.amber : T.ink} />
                        <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: rec.c }}>{rec.t}</span>
                      </div>
                      {(() => {
                        const ivNow = (() => {
                          if (!c || !p.expKey || !c.byExp[p.expKey]) return p.thesis?.iv ?? getU(p.ticker).iv;
                          const ivs = p.legs.map((l) => qp(l)?.iv).filter(Boolean);
                          return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : (p.thesis?.iv ?? getU(p.ticker).iv);
                        })();
                        const seasNow = (seasonal[p.ticker]?.monthlyMean || getU(p.ticker).monthlyMean)[NOW_MONTH];
                        const popNow = s ? (() => {
                          const a2 = analyze(p.legs, s, Math.max(1, dteLeft), ivNow, qp);
                          return probProfit(a2.curve, s, ivNow, Math.max(1, dteLeft));
                        })() : null;
                        return (
                          <GuardianPanel
                            pos={p} spot={s || p.entrySpot} dteLeft={dteLeft} ivNow={ivNow}
                            sigma={(seasonal[p.ticker]?.sigma) || getU(p.ticker).sigma}
                            seasonalNow={seasNow} pnlNow={pnl} popNow={popNow}
                            vegaSign={Math.sign(p.thesis?.vega ?? 1) || 1}
                            alpaca={!!alpaca} quoteFn={qp} buildOcc={buildOcc}
                            setMsg={setMsg} logEvent={logEvent}
                          />
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {alpaca && <AlpacaDesk setMsg={setMsg} />}

            <Panel style={{ marginTop: 10 }}>
              <Lbl>STRATEGIE SALVATE ({store.saved.length})</Lbl>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {store.saved.map((sv) => (
                  <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ color: T.ink, fontWeight: 600, fontSize: 12.5 }}>{sv.ticker} · {sv.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: T.dim }}>{sv.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · {sv.expKey || `${sv.dte} DTE`}</div>
                    </div>
                    <Btn small ghost onClick={() => { setTicker(sv.ticker); if (!chains[sv.ticker]) refreshChain(sv.ticker); setExpKey(sv.expKey || null); setLegs(sv.legs.map((l) => ({ ...l }))); setStratName(sv.name); setMc(null); setBt(null); setTab("build"); }}>Carica</Btn>
                    <button onClick={() => delSaved(sv.id)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}><Trash2 size={13} /></button>
                  </div>
                ))}
                {store.saved.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Nessuna strategia salvata.</div>}
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl><Plug size={11} style={{ verticalAlign: "-1px" }} /> INTEGRAZIONI</Lbl>
              <div style={{ marginTop: 10 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Alpha Vantage (storico 10y+ gratuito)</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>Chiave letta dalla env del server (ALPHAVANTAGE_KEY). Usata dal tab Backtest per stagionalità e backtest reali.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Alpaca PAPER trading</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn small onClick={testAlpaca} disabled={busy === "alpaca"}>Verifica connessione</Btn>
                  <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>chiavi lette dalle env del server (ALPACA_KEY / ALPACA_SECRET)</span>
                </div>
                {alpaca && (
                  <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                    <Stat k="EQUITY" v={`$${(+alpaca.equity).toLocaleString()}`} c={T.green} />
                    <Stat k="BUYING POWER" v={`$${(+alpaca.buying_power).toLocaleString()}`} />
                    <Stat k="STATO" v={alpaca.status} c={T.blue} />
                  </div>
                )}
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>
                  Endpoint paper-api.alpaca.markets (SOLO paper): order ticket limit/market con TIF, sync posizioni/ordini, cancellazioni e chiusure. Ogni invio ordine richiede doppia conferma.
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Anthropic API (Copilot AI + Report)</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>Chiave letta dalla env del server (ANTHROPIC_KEY). Copilot e report AI attivi senza inserire nulla nel sito.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Capitale di riferimento (per le regole 5% / 25%)</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <Inp type="number" min={500} step={500} value={store.settings.capital || 5000} onChange={(e) => setSetting("capital", Math.max(500, +e.target.value))} style={{ width: 120 }} />
                  <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>USD · max per trade: {fmt$(0.05 * (store.settings.capital || 5000))} · esposizione max: {fmt$(0.25 * (store.settings.capital || 5000))}</span>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Webhook report (opzionale)</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Inp placeholder="https://hooks.zapier.com/…" value={store.settings.webhook} onChange={(e) => setSetting("webhook", e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Il tab Report può inviare il report in JSON/markdown a Zapier o Make, che lo gira via email/Telegram su tua regola.</div>
              </div>
            </Panel>
          </div>
        )}

        {tab === "meteo" && <MeteoTab news={news[ticker]?.items || []} data={weather} />}

        {tab === "copilot" && (
          <CopilotTab
            apiKey={"server"}
            ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
          />
        )}

        {tab === "report" && (
          <ReportTab
            apiKey={"server"}
            setSetting={setSetting}
            ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
          />
        )}

        {(tab === "optimize" || tab === "build" || tab === "backtest") && !spot && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.amber }}>Chain {ticker} non ancora caricata: premi Refresh in alto (fonte CBOE, gratuita).</div>
          </Panel>
        )}

        </TabBoundary>

        <div style={{ ...mono, fontSize: 10, color: "#4b5563", textAlign: "center", marginTop: 22 }}>
          Paper trading only · Quote CBOE ritardate ~15 min · Max 5% capitale/trade · Esposizione ≤25% · Non è consulenza finanziaria
        </div>
      </div>
    </div>
  );
}
