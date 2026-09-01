import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from "recharts";
import {
  RefreshCw, ShieldCheck, Save, Trash2, Play, Layers, Radar, Box,
  FlaskConical, Briefcase, Plus, Plug, Send, ExternalLink, MessageSquare, FileText, Bell,
  SlidersHorizontal, ArrowLeft, Sun, Moon,
} from "lucide-react";
import { fetchAllNews, fetchWeather, ImpactTags, CopilotTab, ReportTab, OrderTicket, AlpacaDesk, scaleStrategy, probProfit, buildContext, GuardianPanel, PriceChart, ChainMatrix, OptionPanel, UnifiedView, taSignals, confluence, WhyThisTrade } from "./pro.jsx";
import { BandThumbnail, payoffBands, bandTakeaway, GaugeFigure, exitPlanSentence } from "./visuals.jsx";
import { fuseSignals, sentimentDirection, withSignalRank, compareCandidates, againstSignal, DRIVER_PRESETS, rankByDrivers, verdictNarrative } from "./signals.js";
import { N as nCDF, bs as bsPrice, smile as smileIV, payoff as payoffExp, SEASONAL, SIGMA } from "./engine.js";
import { T, themeName, setTheme, BADGE_SAFE } from "./theme.js";
import { RULES, sizing, ruleBadge, takeProfitLabel, stopLossLabel, perTradeCapLabel, RULE_PILLS, NOTHING_TODAY, money, pctText } from "./rules.js";
import { evaluateTrade, gateSummary } from "./riskGate.js";
import { DEMO, DEMO_BANNER, DEMO_TOOLTIP, DEMO_SEED_TICKERS, demoPositions } from "./demo.js";
import { CapitalOnboarding, WizardOpen, FindOpportunities, WizardCandidates, WizardConfirm, NothingToday, Card, Pill } from "./wizard.jsx";
import { buildHandOff, buildScreenState, BUILD_TAB } from "./handoff.js";

/* ============================== THEME ============================== */
const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sansUI = { fontFamily: "ui-sans-serif, system-ui" };

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
  SOYB: { commodity: true, name: "Soybeans", iv: 0.20, sigma: SIGMA.SOYB, step: 0.5,
    monthlyMean: SEASONAL.SOYB,
    newsQ: "soybean futures prices" },
  CORN: { commodity: true, name: "Corn", iv: 0.24, sigma: SIGMA.CORN, step: 0.5,
    monthlyMean: SEASONAL.CORN,
    newsQ: "corn futures USDA crop" },
  UNG: { commodity: true, name: "US Natural Gas", iv: 0.45, sigma: SIGMA.UNG, step: 0.5,
    monthlyMean: SEASONAL.UNG,
    newsQ: "natural gas prices storage EIA" },
  BOIL: { commodity: true, name: "2x Natural Gas", iv: 0.85, sigma: SIGMA.BOIL, step: 1,
    monthlyMean: SEASONAL.BOIL,
    newsQ: "natural gas prices forecast" },
  WEAT: { commodity: true, name: "Wheat", iv: 0.26, sigma: SIGMA.WEAT, step: 0.25,
    monthlyMean: SEASONAL.WEAT,
    newsQ: "wheat futures prices" },
  SPY: { name: "S&P 500 ETF", iv: 0.13, sigma: SIGMA.SPY, step: 5,
    monthlyMean: SEASONAL.SPY,
    newsQ: "S&P 500 stock market outlook" },
};
// The BASKET is the five commodity ETFs this app is about, derived from the
// table above rather than typed out a second time: SPY is here so the desk can
// price a hedge, it is not something the guided flow goes looking for.
const BASKET = Object.keys(UNDERLYINGS).filter((k) => UNDERLYINGS[k].commodity);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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

/* ============================== ALPACA PAPER (via proxy serverless /api/alpaca) ============================== */
async function alpacaGet(path) {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent(path)}`);
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  return r.json();
}
// Il proxy serverless punta SOLO a paper-api.alpaca.markets e lo dichiara in un
// header. Leggerlo qui e' l'unico modo di VERIFICARE (non presumere) che il
// conto sia paper: senza questa prova src/riskGate.js rifiuta l'ordine.
const PAPER_HOST = "paper-api.alpaca.markets";
async function alpacaAccount() {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent("/v2/account")}`);
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  const acc = await r.json();
  const host = r.headers.get("X-OSL-Paper-Endpoint");
  return { ...acc, paperVerified: host === PAPER_HOST, paperSource: host ? `the proxy routed this to ${host}` : null };
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
  { id: "verybear", label: "Very Bear", color: T.redDeep, icon: "⭣⭣", tgt: -0.08 },
  { id: "bear", label: "Bear", color: T.red, icon: "⭣", tgt: -0.04 },
  { id: "neutral", label: "Neutral", color: T.mut, icon: "→", tgt: 0 },
  { id: "bull", label: "Bull", color: T.green, icon: "⭡", tgt: 0.04 },
  { id: "verybull", label: "Very Bull", color: T.greenDeep, icon: "⭡⭡", tgt: 0.08 },
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
      { name: "Wide Bear Put Spread", raw: [[1, "put", 0], [-1, "put", -0.1]] },
      { name: "Bearish Put Butterfly", raw: [[1, "put", 0], [-2, "put", -0.06], [1, "put", -0.12]] },
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
      { name: "Bull Put Spread (credit)", raw: [[-1, "put", -0.03], [1, "put", -0.08]] },
    ],
    verybull: [
      { name: "Long Call ATM", raw: [[1, "call", 0]] },
      { name: "Wide Bull Call Spread", raw: [[1, "call", 0], [-1, "call", 0.1]] },
      { name: "Bullish Call Butterfly", raw: [[1, "call", 0], [-2, "call", 0.06], [1, "call", 0.12]] },
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
const EMPTY = { saved: [], positions: [], settings: { webhook: "", reportFreq: "weekly", reportLast: 0, reportLastMd: "", capital: RULES.defaultTradingCapital, concurrentTarget: RULES.defaultConcurrentTarget, savings: null, sizeOverride: null, mode: "pro", onboarded: false, notifyWhenReady: false }, seasonal: {}, journal: [], ivHist: {} };
async function saveState(st) {
  try { localStorage.setItem(SKEY, JSON.stringify(st)); } catch (e) { console.error(e); }
  // The server blob is ONE shared document, so a demo visitor writing to it
  // would overwrite the owner's positions and feed the autopilot a book that
  // is not theirs. Demo state stays in the visitor's own browser.
  if (DEMO) return;
  // sync server (abilita Autopilot ad app chiusa); fire-and-forget
  try { fetch("/api/state", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ positions: st.positions, settings: { webhook: st.settings?.webhook, capital: st.settings?.capital, concurrentTarget: st.settings?.concurrentTarget, savings: st.settings?.savings, sizeOverride: st.settings?.sizeOverride, notifyWhenReady: !!st.settings?.notifyWhenReady } }) }); } catch { /* offline ok */ }
}

/* ============================== UI ATOMS ============================== */
const Btn = ({ children, onClick, color = T.amber, ghost, disabled, small }) => (
  <button onClick={onClick} disabled={disabled}
    style={{
      ...mono, fontSize: small ? 11 : 12, padding: small ? "4px 8px" : "8px 12px", borderRadius: 6,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      background: ghost ? "transparent" : color, color: ghost ? color : T.onAccent,
      border: ghost ? `1px solid ${color}66` : "none", display: "inline-flex", alignItems: "center", gap: 6,
    }}>{children}</button>
);
const Panel = ({ children, style }) => (
  <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, padding: 14, ...style }}>{children}</div>
);
/** The demo banner. One line, on every screen, saying exactly what this is. */
const DemoBanner = () => (DEMO ? (
  <div style={{ ...mono, fontSize: 11.5, color: T.blue, background: `${T.blue}12`, borderBottom: `1px solid ${T.blue}44`,
    padding: "9px 14px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap", textAlign: "center" }}>
    <ShieldCheck size={13} style={{ flexShrink: 0 }} /> {DEMO_BANNER}
  </div>
) : null);
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
const ago = (d) => { const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };

/* ============================== MAIN ============================== */
class TabBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.k !== this.props.k && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) return (
      <div style={{ marginTop: 12, padding: 16, background: T.panel, border: `1px solid ${T.red}66`, borderRadius: 8 }}>
        <div style={{ ...mono, fontSize: 11, color: T.red, fontWeight: 700 }}>⚠ THIS SECTION HIT AN ERROR (the rest of the app still works)</div>
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 6, whiteSpace: "pre-wrap" }}>{String(this.state.err?.message || this.state.err).slice(0, 300)}</div>
        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Copy this message if you want it fixed. Switch tabs to carry on using the app.</div>
      </div>
    );
    return this.props.children;
  }
}

export default function OptionsStrategyLab() {
  // PRD §5: the wizard IS the app. `view` is the shell — the tabs are one of
  // its destinations, not the front door. `wizStep` is which wizard screen.
  const [view, setView] = useState("wizard");   // "wizard" | "desk"
  // The desk is three places, not eleven: the Build screen where a trade is put
  // together, the positions you hold and the journal of what happened. Everything
  // that used to be a tab of its own is evidence for one of those three (see `ev`).
  const [wizStep, setWizStep] = useState("open"); // open | questions | candidates | confirm | nothing
  const [nothing, setNothing] = useState(null);   // [{ id, text }] — why not today
  const [candidates, setCandidates] = useState([]); // screen 3: always two roads
  const [verdict, setVerdict] = useState([]);       // screen 3: what was examined, in English
  const [picked, setPicked] = useState(null);       // screen 4: the road taken
  const [confirmResult, setConfirmResult] = useState(null); // the gate's answer AFTER the tap
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState("build");       // "build" | "positions" | "journal"
  const [ev, setEv] = useState(null);           // which evidence section is open on the Build screen
  const [showSettings, setShowSettings] = useState(false);
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
  // FAULT A: risk and horizon start NULL and stay null until the user answers.
  // The old defaults ($250, 45 days) were quoted back on the verdict screen as
  // "the $250 you said you were willing to lose" to a user who had said nothing,
  // which is the app putting words in their mouth. The basket and the weights
  // DO have a starting position, because "all five markets, evenly weighted" is
  // a visible state the user can see and change, not an invented answer.
  const [wiz, setWiz] = useState({
    basket: BASKET, risk: null, horizon: null,
    weights: { ...DRIVER_PRESETS.balanced }, priority: "balanced", busy: false, err: null,
  });
  const [optRef, setOptRef] = useState(null); // price snapshot from the Shortlist, to reconcile against the Build screen
  const [weather, setWeather] = useState(null);  // regionId -> forecast 14g (fuseSignals)
  const [barsCache, setBarsCache] = useState({}); // ticker -> daily bars (fattore tecnico)
  const [against, setAgainst] = useState({ reason: "" }); // motivazione per un trade contro il segnale
  // A hand-off has to end where the trade is. `buildAnchor` marks the top of
  // the Build section and `scrollBuild` is bumped by every hand-off, so the
  // scroll happens after React has applied the new state, not before it.
  const buildAnchor = useRef(null);
  const [scrollBuild, setScrollBuild] = useState(0);

  const U = getU(ticker);
  const chain = chains[ticker];
  const spot = chain?.spot ?? null;
  const seas = seasonal[ticker] || { monthlyMean: U.monthlyMean, sigma: U.sigma, matrix: null, years: null, src: "estimate" };
  const iv = U.iv;
  const dte = expKey && chain?.byExp[expKey] ? chain.byExp[expKey].dte : dteManual;
  const expStrikes = useMemo(() => {
    if (!chain || !expKey || !chain.byExp[expKey]) return null;
    const s = new Set([...Object.keys(chain.byExp[expKey].calls), ...Object.keys(chain.byExp[expKey].puts)].map(Number));
    return Array.from(s).sort((a, b) => a - b);
  }, [chain, expKey]);
  const q = useMemo(() => makeQuote(chain, expKey), [chain, expKey]);

  /* ---- a hand-off ends where the trade is ---- */
  useEffect(() => {
    if (!scrollBuild) return;
    buildAnchor.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [scrollBuild]);

  /* ---- chain fetch ---- */
  const refreshChain = useCallback(async (tk, silent) => {
    if (!silent) { setBusy(tk); setMsg(`Loading ${tk} option prices…`); }
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
      if (!silent) setMsg(`${tk} loaded from ${c.source} — price $${c.spot?.toFixed(2)}, ${c.expirations.length} expiries.`);
      return c;
    } catch (e) {
      if (!silent) setMsg(`Could not load ${tk} option prices — ${e.message}`);
      return null;
    } finally { if (!silent) setBusy(null); }
  }, []);

  /* ---- avvio: storage + refresh automatico ---- */
  useEffect(() => {
    (async () => {
      try {
      const st = (await loadState()) || EMPTY;
      // merge timeline Autopilot dal server (brief generati ad app chiusa).
      // Not in demo: that blob holds the owner's real paper book, and a public
      // visitor has no business reading it.
      try {
        const r = DEMO ? { ok: false } : await fetch("/api/state");
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
      if (droppedPos > 0) setMsg(`${droppedPos} position${droppedPos === 1 ? "" : "s"} saved by an older version were damaged and have been removed. Everything else is intact.`);
      // Anyone who already has positions or saved strategies has been through
      // setup on an older build: do not send them back to onboarding.
      const settings = { ...EMPTY.settings, ...(st.settings || {}) };
      if (st.settings?.onboarded == null) {
        settings.onboarded = (st.positions || []).length > 0 || (st.saved || []).length > 0;
      }
      // The demo has no setup step: a visitor with three minutes should land on
      // the front page, not on a capital questionnaire.
      if (DEMO) settings.onboarded = true;
      setStore({ ...EMPTY, ...st, v: 2, settings });
      setHydrated(true);
      if (st.seasonal) setSeasonal(st.seasonal);
      const seedTickers = DEMO ? DEMO_SEED_TICKERS : [];
      const tickers = [...new Set([(st.positions || []).map((p) => p.ticker), "SOYB", ...seedTickers].flat())];
      setBusy("auto"); setMsg("Loading live option chains…");
      const loaded = {};
      for (const tk of tickers) { const c = await refreshChain(tk, true); if (c?.spot) loaded[tk] = c.spot; }
      // The three didactic positions are built HERE, from the prices that just
      // came back, so each one really is near its take-profit, near its stop or
      // sitting on a thesis that has expired. A fixture with numbers typed into
      // it would drift away from the live chain the first time it moved.
      if (DEMO && !(st.positions || []).length) {
        const seeded = demoPositions({ spots: loaded, underlying: getU });
        if (seeded.length) {
          setStore((s) => { const ns = { ...s, positions: seeded }; saveState(ns); return ns; });
        }
      }
      setMsg(null);
      setBusy(null);
      } finally { setHydrated(true); }
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
      setMsg(`${ticker}: seasonality worked out from ${h.years} years of real prices.`);
    } catch (e) { setMsg(`Could not load the price history: ${e.message}`); }
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
      if (!silent) setMsg("News feeds are not reachable right now.");
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
  // Every held position's history too: the band thumbnail draws the underlying's
  // price line over its zones (PRD §6), and without the bars the list falls back
  // to a flat dashed line that says nothing about how the price got there.
  useEffect(() => {
    for (const tk of new Set(store.positions.map((p) => p.ticker))) loadBars(tk);
  }, [store.positions, loadBars]);

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
  // A chain that is still being fetched is not a chain that failed. `busy` is
  // the ticker of the request in flight ("all" during a refresh-all), so the
  // Build screen can say "loading" instead of blaming the user for a request
  // that has not come back yet.
  const chainLoading = busy === ticker || busy === "all";
  const buildScreen = buildScreenState({ spot, hasTrade: !!A, chainLoading });
  const lv = useMemo(() => levelsFromGrid(oiGrid, spot), [oiGrid, spot]);


  /* ---- azioni strategia ---- */
  /* ---- ONE way to put a trade on the Build screen ----
     Every button that hands a specific trade to Build lands here: the
     Shortlist's presets, the multi-market scan, "Monitor" on a position,
     "Load" on a saved strategy and the wizard taking a road. `buildHandOff`
     (src/handoff.js) decides what changes; this applies it. Written inline at
     each button instead, a hand-off forgets one of the four things it has to
     do and the tap looks like it did nothing — see the comment there. */
  const openOnBuild = ({ ticker: tk, expKey: ek = null, legs: lg, name, ref = null }) => {
    const h = buildHandOff({ ticker: tk, expKey: ek, legs: lg, name, chains });
    setTicker(h.ticker); setExpKey(h.expKey); setLegs(h.legs); setStratName(h.name);
    setMc(null); setBt(null);
    setOptRef(ref);
    setEv(h.ev);          // close the evidence panel: the trade goes underneath it
    setTab(h.tab);
    if (h.loadChain) refreshChain(h.ticker);   // no chain, no price, no trade to show
    setScrollBuild((n) => n + 1);
  };
  const applyPreset = (p, a) => openOnBuild({
    ticker, expKey, legs: p.legs, name: p.name,
    ref: a ? { name: p.name, entry: a.entry, maxProfit: a.maxProfit, maxLoss: a.maxLoss, expKey, t: Date.now() } : null,
  });
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
    setStore(st); await saveState(st); setMsg("Strategy saved. It will still be here next time.");
  };
  /* ---- ONE way to open a paper position ----
     The Build screen and the wizard's confirm screen both land here, so a
     position opened from screen 4 carries exactly the same gate record, thesis
     and timeline as one built by hand. Two paths would mean two truths. */
  const commitPosition = async ({ ticker: tk, expKey: ek, legs: lg, dte: d, analysis, spot: sp, name, alpacaOrder, clashInfo, reason }) => {
    // Anche la posizione interna passa dal cancello: non tocca il broker, ma
    // entra nell'esposizione totale che il cancello misura al prossimo ordine.
    const gLocal = gate({ ticker: tk, intent: "open", legs: lg, dte: d, contracts: 1, maxLoss: analysis?.maxLoss, maxProfit: analysis?.maxProfit }, LOCAL_BOOK);
    if (!gLocal.pass) return { ok: false, gate: gLocal };
    const seasM = ((seasonal[tk]?.monthlyMean) || getU(tk).monthlyMean)[NOW_MONTH];
    const expiry = ek ? new Date(ek).toISOString() : new Date(Date.now() + d * 86400000).toISOString();
    const ivAvg0 = analysis.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, analysis.legPx.length);
    const pop0 = probProfit(analysis.curve, sp, ivAvg0, d);
    const f = fused[tk];
    const pos = {
      id: Date.now(), name, ticker: tk, expKey: ek, legs: lg, entryNet: analysis.entry, entrySpot: sp,
      openedAt: new Date().toISOString(), expiry, maxProfit: analysis.maxProfit, maxLoss: analysis.maxLoss,
      realEntry: analysis.realCount === lg.length,
      alpacaId: alpacaOrder?.id || null,
      thesis: { pop: pop0, iv: ivAvg0, seasonal: seasM, regime: seasM > 0.8 ? "strong up" : seasM < -0.8 ? "strong down" : "weak", spot: sp, breakevens: analysis.breakevens, delta: analysis.greeks.delta, vega: analysis.greeks.vega,
        signal: f ? { score: f.score, confidence: f.confidence, agreement: f.agreement, narrative: f.narrative } : null,
        againstSignal: clashInfo ? { ...clashInfo, reason: (reason || "").trim(), at: Date.now() } : null },
      timeline: [
        { t: Date.now(), type: "gate", text: `Risk gate — ${gateSummary(gLocal)}` },
        { t: Date.now(), type: "open", text: `${alpacaOrder ? "Alpaca order " + alpacaOrder.id.slice(0, 8) + "… sent · " : ""}Opened with a ${pop0 != null ? (pop0 * 100).toFixed(0) + "%" : "n/a"} chance · volatility ${(ivAvg0 * 100).toFixed(0)}% · season ${seasM.toFixed(1)}%/mo${f ? ` · signal ${f.score > 0 ? "+" : ""}${f.score}/100 ${f.agreement}` : ""}` },
        { t: Date.now(), type: "plan", text: `Exit plan frozen at entry — ${exitPlanSentence()}` },
        ...(clashInfo ? [{ t: Date.now(), type: "against", text: `Against ${clashInfo.n} of ${clashInfo.total} factors. Reason: "${(reason || "").trim()}"` }] : []),
      ],
    };
    const st = { ...store, positions: [...store.positions, pos] };
    setStore(st); await saveState(st);
    return { ok: true, gate: gLocal, pos };
  };

  const openPaper = async (alpacaOrder) => {
    // Non blocchiamo il trade: chiediamo la motivazione scritta e la salviamo
    // con la posizione (PRD §2, pattern override).
    if (clash && against.reason.trim().length < REASON_MIN) {
      setMsg(`Write why you are going against ${clash.n} of ${clash.total} factors (at least ${REASON_MIN} characters). The reason is stored with the position.`);
      return;
    }
    const r = await commitPosition({ ticker, expKey, legs, dte, analysis: A, spot, name: stratName,
      alpacaOrder, clashInfo: clash, reason: against.reason });
    if (!r.ok) { setMsg(`Risk gate: position not opened. ${r.gate.violations.map((v) => v.message).join(" ")}`); return; }
    setAgainst({ reason: "" }); setMsg("Position opened."); setTab("positions");
  };
  const delSaved = async (id) => { const st = { ...store, saved: store.saved.filter((s) => s.id !== id) }; setStore(st); await saveState(st); };
  // A day's event is logged ONCE. When it has already been logged, this has to
  // return the state it was given — the SAME object, not a copy of it.
  //
  // Returning `{ ...st, positions }` on a no-op looks harmless and is not: the
  // new array changes `store.positions`, which recomputes the `posAlerts` memo,
  // which re-runs the effect that called logEvent, which builds another new
  // array. That is an infinite render loop, and it fires the moment any
  // position is sitting on its take-profit or its stop — which, with the demo's
  // example positions, is on the very first screen. It also wrote the whole
  // state to disk on every pass round the loop.
  const logEvent = useCallback((id, type, text) => {
    setStore((st) => {
      let changed = false;
      const positions = st.positions.map((p) => {
        if (p.id !== id) return p;
        const day = new Date().toDateString();
        const dup = (p.timeline || []).some((e) => e.type === type && new Date(e.t).toDateString() === day);
        if (dup) return p;
        changed = true;
        return { ...p, timeline: [...(p.timeline || []), { t: Date.now(), type, text }] };
      });
      if (!changed) return st;
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
        riskOk: Math.abs(p.maxLoss) <= limits.perTradeLimit };
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
          out.push({ tk, sent, name: pr.name, legs: pr.legs, expKey: ek, dte: d2, a, pop, n, spot: sp, ev: pop * a.maxProfit * n });
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
    const steps = [{ m: 0, label: "open", S: spot, pnl: 0, note: "you open the trade" }];
    let Sx = spot, closed = null;
    for (let i = 1; i <= span; i++) {
      const r = row[((NOW_MONTH + i - 1) % 12) + 1];
      if (r == null) break;
      Sx = Sx * (1 + r / 100);
      const rem = Math.max(1, dte - i * 30);
      const pnl = ((i === span ? payoffExp(legs, Sx) : scenarioValue(legs, Sx, rem, iv)) - A.entry) * 100;
      let note = `price ${r >= 0 ? "+" : ""}${r.toFixed(1)}%`;
      if (!closed && pnl >= RULES.takeProfitPct * A.maxProfit) { closed = { i, pnl: RULES.takeProfitPct * A.maxProfit, why: takeProfitLabel() }; note += ` → 🎯 ${takeProfitLabel()} hit: you take the profit`; }
      else if (!closed && pnl <= RULES.stopLossPct * A.maxLoss) { closed = { i, pnl: RULES.stopLossPct * A.maxLoss, why: stopLossLabel() }; note += ` → 🛑 ${stopLossLabel()}: a warning, think about closing`; }
      steps.push({ m: i, label: MONTHS[(NOW_MONTH + i) % 12], S: Sx, pnl, note });
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
      const acc = await alpacaAccount();
      setAlpaca(acc);
      setMsg(`Alpaca paper account connected · balance $${(+acc.equity).toLocaleString()} · buying power $${(+acc.buying_power).toLocaleString()}`);
    } catch (e) {
      setAlpaca(null);
      setMsg(`Could not reach Alpaca: ${e.message}`);
    }
    setBusy(null);
  };
  const sendToAlpaca = async () => {
    // Order path 1 of the six (CLAUDE.md). The demo is read-only at the broker:
    // the check lives next to the send, not only on the button, so a path that
    // ever gets called some other way still cannot reach Alpaca.
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }
    if (!confirmSend) { setConfirmSend(true); return; }
    setConfirmSend(false); setBusy("order");
    try {
      // PRD §8: nessun ordine raggiunge Alpaca senza passare da qui.
      const g = gate({ ticker, intent: "open", legs, dte, contracts: 1, maxLoss: A?.maxLoss, maxProfit: A?.maxProfit });
      if (!g.pass) {
        setMsg(`Risk gate: order not sent. ${g.violations.map((v) => v.message).join(" ")}`);
        setBusy(null); return;
      }
      const withOcc = legs.map((l) => {
        const quote = q(l);
        const occ = quote?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null);
        if (!occ) throw new Error("pick a real expiry from the chain first, so the contracts can be named");
        return { ...l, occ };
      });
      const o = await alpacaOrderMleg(withOcc);
      setMsg(`Order sent to your Alpaca paper account · id ${o.id?.slice(0, 8)}…`);
    } catch (e) { setMsg(`The order was not sent: ${e.message}`); }
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
    const tpHit = pnl != null && p.maxProfit > 0 && pnl >= RULES.takeProfitPct * p.maxProfit;
    const slHit = pnl != null && p.maxLoss < 0 && pnl <= RULES.stopLossPct * p.maxLoss;
    const dteExit = dteLeft <= RULES.exitDTE;
    // verdetto autopilot recente non-HOLD in attesa
    const ap = (p.timeline || []).filter((e) => e.type === "autopilot" && Date.now() - e.t < 48 * 36e5 && !e.text.includes("HOLD")).slice(-1)[0];
    const level = tpHit || slHit || dteExit || ap ? "action" : pnl != null && pnl < 0.35 * p.maxLoss ? "watch" : "ok";
    const label = tpHit ? `${takeProfitLabel()} reached — take the profit` : slHit ? `${stopLossLabel()} reached — a warning, not an order` : dteExit ? `${dteLeft} days left — close or roll` : ap ? "The autopilot has something waiting for your OK" : pnl == null ? "waiting for prices…" : level === "watch" ? "Losing: check the reason you opened it" : "On plan";
    return { p, pnl, dteLeft, level, label, ap, live, spotNow: sp, tpHit, slHit, dteExit };
  }), [store.positions, chains, alSync]);

  // Log eventi regola (TP/SL/DTE) fuori dal render: prima veniva chiamato logEvent
  // DENTRO il JSX del tab Paper (setState durante il render) => instabilità del tab.
  useEffect(() => {
    for (const a of posAlerts) {
      if (a.tpHit) logEvent(a.p.id, "tp", `Reached ${takeProfitLabel()} (${fmt$(a.pnl)})`);
      if (a.slHit) logEvent(a.p.id, "sl", `Reached ${stopLossLabel()} (${fmt$(a.pnl)}) — a warning, nothing closes automatically`);
      if (a.dteExit) logEvent(a.p.id, "dte", `Inside the ${RULES.exitDTE}-day exit window`);
    }
  }, [posAlerts, logEvent]);
  const nAttention = posAlerts.filter((a) => a.level === "action").length;

  /* ---- the wizard search (PRD §5, screens 2 → 3) ----
     Two things can come out of here: two roads on screen 3, or the
     "nothing today" screen. The refusal is a first-class outcome, so it is
     computed here from the same numbers the rest of the app uses, and its
     sentences come from src/rules.js — never typed into a component.

     THE WHOLE BASKET, ON ONE SCALE. The old version picked the single
     best-scoring ticker and then built both roads out of it, which meant the
     two roads were always the same market wearing two structures — and a user
     who ticked five commodities got one. Now every ticker in the basket that we
     can actually read contributes candidates, they are ranked together on the
     user's three weights, and road 2 is free to come from a different market
     than road 1. That is the point of asking for a basket at all. */
  const runWizard = async (overrides) => {
    const ans = { ...wiz, ...(overrides || {}) };
    setWiz((w) => ({ ...w, ...(overrides || {}), busy: true, err: null }));
    setNothing(null);
    const stop = (reasons) => { setNothing(reasons); setWizStep("nothing"); setWiz((w) => ({ ...w, busy: false })); };
    try {
      // 0) Nothing is assumed. If the questions were not answered we do not
      // guess at them — we go back and ask (FindOpportunities blocks the button,
      // this is the belt to that pair of braces).
      const basket = (ans.basket || []).filter((tk) => UNDERLYINGS[tk]);
      if (!basket.length || !(ans.risk > 0) || !(ans.horizon > 0)) {
        setWiz((w) => ({ ...w, busy: false, err: "Answer all three before this can run: markets, what you are willing to lose, and how long to give it." }));
        setWizStep("questions");
        return;
      }

      // 1) Do we know anything at all? No weather, no news and no price history
      // means the four factors are quiet by default, which is a data problem
      // and not a verdict on the market. Say which it is.
      const dataIn = !!weather || newsPool.length > 0 || Object.keys(barsCache).length > 0;
      if (!dataIn) return stop([{ id: "no-data", text: NOTHING_TODAY.noData("weather, news and prices") }]);

      // 2) Do the four factors agree anywhere IN THE BASKET? A CONFLICT ticker,
      // or one under the confidence floor, is not a trade — it is a market we
      // cannot read, and it drops out of the basket rather than out of the app.
      // Why a market left the basket travels with it: the verdict narrative has
      // to say "we looked and it did not qualify" or "we could not see it", and
      // those are different sentences (CLAUDE.md, saying "nothing today").
      const excluded = [];
      const inBasket = scan.filter((r) => basket.includes(r.tk));
      const usable = inBasket.filter((r) => {
        const keep = !r.conflict && r.confidence >= RULES.lowConfidence;
        if (!keep) excluded.push({ tk: r.tk, reason: "signals" });
        return keep;
      });
      if (!usable.length) {
        const closest = inBasket.slice().sort((a, b) => b.confidence - a.confidence)[0];
        return stop([{ id: "signals", text: NOTHING_TODAY.signalsNotAligned(closest || null) }]);
      }

      // 3) Are the options themselves expensive versus their own history? A
      // ticker priced rich drops out; if that empties the basket, we stand down
      // and say which one came closest to being worth it.
      const ivRankOf = (tk) => {
        const h = (store.ivHist || {})[tk] || [];
        if (h.length < 20) return null;
        const cur = h[h.length - 1].iv;
        return Math.round((h.filter((x) => x.iv <= cur).length / h.length) * 100);
      };
      const priced = [];
      const tooRich = [];
      for (const r of usable) {
        const rank = ivRankOf(r.tk);
        if (rank != null && rank >= RULES.expensiveIVRank) {
          tooRich.push({ tk: r.tk, rank });
          excluded.push({ tk: r.tk, reason: "expensive" });
        } else priced.push(r);
      }
      if (!priced.length) {
        const cheapest = tooRich.slice().sort((a, b) => a.rank - b.rank)[0];
        return stop([{ id: "expensive", text: NOTHING_TODAY.optionsExpensive(cheapest.tk, cheapest.rank) }]);
      }

      // 4) Build candidates for EVERY readable ticker in the basket, and keep
      // the four-factor read attached to each one: the decision screen shows the
      // evidence next to the road, so the evidence has to travel with it.
      const examined = [];
      const pool = [];
      for (const r of priced) {
        const tk = r.tk;
        const c = chains[tk] || (await refreshChain(tk, true));
        if (!c?.spot) { excluded.push({ tk, reason: "nodata" }); continue; }
        const sp = c.spot;
        const exps = c.expirations.filter((e) => c.byExp[e].dte >= RULES.minEntryDTE && c.byExp[e].dte <= 130);
        if (!exps.length) { excluded.push({ tk, reason: "nodata" }); continue; }
        const ek = exps.reduce((b2, e) => Math.abs(c.byExp[e].dte - ans.horizon) < Math.abs(c.byExp[b2].dte - ans.horizon) ? e : b2, exps[0]);
        const d2 = c.byExp[ek].dte;
        const sSet = new Set([...Object.keys(c.byExp[ek].calls), ...Object.keys(c.byExp[ek].puts)].map(Number));
        const strikes = Array.from(sSet).sort((a, b) => a - b);
        const qq = makeQuote(c, ek);
        examined.push({ tk, fused: r.fused, spot: sp, dte: d2 });
        loadBars(tk);
        // candidati da ENTRAMBE le famiglie: direzionale (sentiment scanner) + intervallo (neutral)
        const fams = r.sugg === "neutral" ? ["neutral"] : [r.sugg, "neutral"];
        for (const sent of fams) {
          for (const pr of buildPresets(sent, sp, getU(tk).step, strikes)) {
            // A single long option is not a first trade: it pays for time it
            // usually does not get, and a beginner reads the loss as bad luck
            // rather than as decay. They stay on the full desk; the guided flow
            // never proposes one.
            if (pr.legs.length < 2) continue;
            const a = analyze(pr.legs, sp, d2, getU(tk).iv, qq);
            if (!Number.isFinite(a.maxProfit) || a.maxProfit <= 0 || !Number.isFinite(a.maxLoss) || a.maxLoss >= 0) continue;
            const ivA = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
            const pop = probProfit(a.curve, sp, ivA, d2) || 0;
            const unit = Math.abs(a.maxLoss);
            if (unit > ans.risk) continue;   // it does not fit the budget: not a road
            const pr2 = evProfile(pop, a.maxProfit, a.maxLoss);
            pool.push({
              tk, sent, pr, a, pop, unit, ek, spot: sp, dte: d2,
              ev100: pr2 ? pr2.ev100 : -999, rr: a.maxProfit / unit,
              risk: unit, fused: r.fused,
            });
          }
        }
      }
      if (!examined.length) return stop([{ id: "no-chain", text: NOTHING_TODAY.noData(basket.join(", ")) }]);

      // 5) Nothing fits the budget: also a real answer, not an error toast.
      if (!pool.length) return stop([{ id: "budget", text: NOTHING_TODAY.budgetTooSmall(ans.risk) }]);

      // 6) The user's three weights decide the order, across the whole basket at
      // once. Prefer the ones that are not expected to lose money: "win big"
      // should hand over the best-priced long shot, not simply the longest one.
      const worthIt = pool.filter((x) => x.ev100 >= 0);
      const ranked = rankByDrivers(worthIt.length >= 2 ? worthIt : pool, ans.weights);
      const first = ranked[0];

      // The SECOND road is not the runner-up: it is the one that trades the
      // hardest against the first (PRD §5). Picking the second-best would show
      // the same idea twice and teach nothing about the price of the choice.
      //
      // It must also be a real alternative. A candidate that is worse on how
      // often it works AND on what it pays AND on what it costs is not a road,
      // it is a mistake with a chart next to it.
      const rival = ranked.slice(1).filter((x) =>
        x.pop > first.pop + 1e-9 || x.rr > first.rr + 1e-9 || x.risk < first.risk - 1e-9);
      const spread = (f) => { const xs = ranked.map(f); const r = Math.max(...xs) - Math.min(...xs); return r > 0 ? r : 1; };
      const dPop = spread((x) => x.pop), dRR = spread((x) => x.rr);
      // A road from a DIFFERENT market is worth something on its own: two
      // structures on one underlying share a fate, and comparing them teaches
      // less than comparing two markets. It is a thumb on the scale, not a rule.
      const contrast = (x) => Math.abs(x.pop - first.pop) / dPop + Math.abs(x.rr - first.rr) / dRR
        + (x.tk !== first.tk ? 0.35 : 0);
      const second = rival.slice().sort((a, b) => contrast(b) - contrast(a))[0];

      // 7) One road is advice, not teaching. If everything else on the board is
      // beaten by the first on every axis, the app says so rather than dressing
      // a dominated structure up as a choice.
      if (!second) return stop([{ id: "one-road", text: NOTHING_TODAY.onlyOneRoad(ans.risk) }]);

      const toCandidate = (x, n) => ({
        id: `${x.tk}-${x.pr.name}-${n}`,
        ticker: x.tk, name: x.pr.name, legs: x.pr.legs.map((l) => ({ ...l })),
        entryNet: x.a.entry, spot: x.spot, expKey: x.ek, dte: x.dte,
        maxProfit: x.a.maxProfit, maxLoss: x.a.maxLoss, risk: x.risk, pop: x.pop,
        rr: x.rr, contracts: 1, a: x.a, fused: x.fused,
        driver: x.driver, drivers: x.drivers,
        sigma: (seasonal[x.tk]?.sigma) || getU(x.tk).sigma,
      });
      const roads = [toCandidate(first, 1), toCandidate(second, 2)];

      // 8) The copilot narrative: what was actually examined, in English, with
      // the real counts. Generated in src/signals.js from the same data the
      // score came from — never a template with the numbers dropped in.
      setVerdict(verdictNarrative({
        basket, examined, excluded, newsItems: newsPool, weatherData: weather,
        month: NOW_MONTH, weights: ans.weights, chosen: roads,
      }));

      setTicker(first.tk); setExpKey(first.ek);
      setWiz((w) => ({ ...w, busy: false }));
      setCandidates(roads);
      setPicked(null); setConfirmResult(null);
      setWizStep("candidates");
    } catch (e) { setWiz((w) => ({ ...w, busy: false, err: String(e.message || e) })); }
  };

  /* ---- screen 3 → screen 4. Taking a road loads it on Build too, so
     "open it on the Build screen and change it" is one tap away from the refusal. */
  const pickRoad = (c) => {
    setPicked(c); setConfirmResult(null);
    openOnBuild({ ticker: c.ticker, expKey: c.expKey, legs: c.legs, name: c.name });
    setWizStep("confirm");
  };

  /* ---- screen 4. The gate runs AFTER the tap (PRD §5): the screen shows what
     it measures, the tap makes it decide, and a refusal stays on this screen
     with its reasons rather than becoming a toast somewhere else. */
  const confirmRoad = async () => {
    if (!picked) return;
    setWiz((w) => ({ ...w, busy: true }));
    try {
      const r = await commitPosition({
        ticker: picked.ticker, expKey: picked.expKey, legs: picked.legs, dte: picked.dte,
        analysis: picked.a, spot: picked.spot, name: picked.name,
        clashInfo: againstSignal(fused[picked.ticker], Math.abs(picked.a.greeks.delta) < 0.05 ? 0 : Math.sign(picked.a.greeks.delta)),
        reason: "",
      });
      setConfirmResult(r.gate);
      if (r.ok) {
        setMsg(`${picked.ticker} · ${picked.name} is open on paper. ${exitPlanSentence()}`);
        setView("desk"); setTab("positions");
        setWizStep("open"); setPicked(null); setCandidates([]); setVerdict([]);
      }
    } catch (e) {
      setWiz((w) => ({ ...w, err: String(e.message || e) }));
    } finally {
      setWiz((w) => ({ ...w, busy: false }));
    }
  };


  const setNotify = async (on) => {
    const st = { ...store, settings: { ...store.settings, notifyWhenReady: on } };
    setStore(st); await saveState(st);
  };

  /* ---- profilo strategia: EV per $100 a rischio + etichetta onesta ---- */
  const evProfile = (pop, maxProfit, maxLoss) => {
    if (pop == null || !Number.isFinite(maxProfit) || !Number.isFinite(maxLoss) || maxLoss >= 0) return null;
    const risk = Math.abs(maxLoss);
    const ev = pop * maxProfit - (1 - pop) * risk;
    const ev100 = (ev / risk) * 100;
    const rr = maxProfit / risk;
    const tag = pop >= 0.6 ? { t: "WINS OFTEN", c: T.green, d: `works out about ${Math.round(pop * 10)} times in 10, for a smaller gain` }
      : pop < 0.45 && rr >= 2 ? { t: "WINS BIG", c: T.violet, d: `works out about ${Math.round(pop * 10)} times in 10, but pays ${rr.toFixed(1)}× what you risk` }
      : { t: "BALANCED", c: T.blue, d: "a middle path between how often and how much" };
    return { ev, ev100, rr, tag };
  };

  /* ---- import posizioni reali dal conto paper Alpaca ---- */
  const importAlpaca = useCallback(async (silent) => {
    try {
      const raw = await alpacaGet("/v2/positions");
      const opts = raw.filter((x) => x.asset_class === "us_option" && parseOcc(x.symbol));
      if (!opts.length) { if (!silent) setMsg("No option positions on the Alpaca account."); return; }
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
            id: Date.now() + added, name: "Imported from Alpaca", ticker: g.und, expKey: g.exp,
            legs: g.legs, entryNet: g.net, entrySpot: chains[g.und]?.spot ?? null,
            openedAt: new Date().toISOString(), expiry: g.exp,
            maxProfit: Number.isFinite(mp) ? mp : 0, maxLoss: Number.isFinite(ml) ? ml : 0,
            realEntry: true, alpacaId: "sync", alpacaLive: true,
            thesis: { imported: true, iv: getU(g.und).iv, seasonal: (seasonal[g.und]?.monthlyMean || getU(g.und).monthlyMean)[NOW_MONTH], pop: null, spot: chains[g.und]?.spot ?? null, vega: 1 },
            timeline: [{ t: Date.now(), type: "open", text: `Imported from your Alpaca paper account (${g.legs.length} legs, ${dte0} days to expiry). It is now being watched.` }],
          });
          added++;
        }
        if (!added) return st;
        const ns = { ...st, positions: next };
        saveState(ns);
        return ns;
      });
      if (!silent) setMsg(added ? `Imported ${added} position${added === 1 ? "" : "s"} from Alpaca.` : "Every Alpaca position is already linked.");
    } catch (e) { if (!silent) setMsg(`Could not import from Alpaca: ${e.message}`); }
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
    let level = 1, next = "Open your first paper trade";
    if (opened >= 1) { level = 2; next = `Open ${Math.max(0, 3 - opened)} more to reach level 3`; }
    if (opened >= 3) { level = 3; next = `Close ${Math.max(0, 5 - ruled)} trades by the rules to reach level 4`; }
    if (ruled >= 5 && (disciplina ?? 0) >= 0.6) { level = 4; next = "Reach 10 closed trades with 80% discipline for level 5"; }
    if (closed >= 10 && (disciplina ?? 0) >= 0.8) { level = 5; next = "You have the full set of habits. Ask the copilot whether you are ready for real money."; }
    return { level, next, score, disciplina, coerenza, pazienza, closed, opened, ruled };
  }, [store.journal, store.positions, store.settings.capital]);

  /* ---- risk gate (PRD §8) ----
     Un solo cancello per ogni ordine. La UI non ricalcola mai i limiti: chiede
     a src/riskGate.js e mostra quello che risponde. */
  const capitalAnswers = useMemo(() => ({
    tradingCapital: store.settings.capital,
    concurrentTarget: store.settings.concurrentTarget,
    savings: store.settings.savings,
    override: store.settings.sizeOverride,
  }), [store.settings]);
  const limits = useMemo(() => sizing(capitalAnswers), [capitalAnswers]);
  // Conto locale: la posizione "Paper interno" non lascia il browser, quindi la
  // verifica paper e' soddisfatta per costruzione. Non usarlo mai per un ordine.
  const LOCAL_BOOK = { paperVerified: true, paperSource: "local simulation, no broker involved" };
  const gate = useCallback((proposal, account) => evaluateTrade({
    proposal,
    portfolio: { positions: store.positions, account: account === undefined ? alpaca : account },
    capital: capitalAnswers,
    signals: fused[proposal?.ticker || ticker] || null,
  }), [store.positions, alpaca, capitalAnswers, fused, ticker]);

  const guard = useMemo(() => {
    if (!A) return null;
    return gate({ ticker, intent: "open", legs, dte, contracts: 1, maxLoss: A.maxLoss, maxProfit: A.maxProfit }, LOCAL_BOOK);
  }, [A, gate, legs, dte, ticker]); // eslint-disable-line

  /** Wizard screen 4: the gate's reading BEFORE the tap — the same numbers, no
      decision yet. Declared here, below `gate`: a useMemo runs during render,
      so reading `gate` from above its own declaration is a crash, not a hoist. */
  const confirmPreview = useMemo(() => (picked
    ? gate({ ticker: picked.ticker, intent: "open", legs: picked.legs, dte: picked.dte, contracts: 1,
      maxLoss: picked.maxLoss, maxProfit: picked.maxProfit }, LOCAL_BOOK)
    : null), [picked, gate]); // eslint-disable-line

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
  // The old "Today" tab is gone: what needs attention today is the wizard's
  // front page now (PRD §5), so keeping a second copy behind a flag would just
  // be two screens that can disagree about the same positions.
  // THREE places, and only three. A place is somewhere you go and stay: Build,
  // where a trade is put together, the Positions you hold, the Journal of what
  // happened. Everything that used to be a tab of its own — Radar, Shortlist,
  // market levels, history, the copilot — is EVIDENCE for the trade on the
  // Build screen, so it opens underneath it instead of taking you somewhere else.
  const PLACES = [
    { id: "build", label: "Build", I: Play },
    { id: "positions", label: "Positions", I: Briefcase },
    { id: "journal", label: "Journal", I: FileText },
  ];
  const EVIDENCE = [
    { id: "radar", label: "Radar", I: Radar, sub: "which market, and why" },
    { id: "shortlist", label: "Shortlist", I: Layers, sub: "which structures fit" },
    { id: "levels", label: "Market levels", I: Box, sub: "where the open interest sits" },
    { id: "history", label: "History", I: FlaskConical, sub: "what happened in past years" },
    { id: "copilot", label: "Copilot", I: MessageSquare, sub: "ask about this trade" },
  ];
  const SENT = SENTIMENTS.find((s) => s.id === sentiment);

  /* ---------- the shell (PRD §5) ----------
     Everything above is the app's brain. What follows decides which face it
     shows: setup on a first run, the wizard by default, the tabs on request. */

  const goHome = () => { setView("wizard"); setWizStep("open"); setNothing(null); };
  /* Leaving the wizard for the desk. `ev` is set explicitly every time: a
     panel left open from a previous visit hides whatever is on Build. */
  const goDesk = (evId = null) => {
    setView("desk"); setTab(BUILD_TAB); setEv(evId);
    // Land where the button promised. Coming off a scrolled wizard screen the
    // browser keeps the old scroll position, which drops you into the middle
    // of the desk: "Open it on the Build screen" has to end on the trade.
    if (evId) window.scrollTo?.({ top: 0 });
    else setScrollBuild((n) => n + 1);
  };
  const marketReady = !!spot || Object.keys(chains).length > 0;

  if (!hydrated) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.mut, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "ui-sans-serif, system-ui", fontSize: 15 }}>
        Loading your desk…
      </div>
    );
  }

  if (!store.settings.onboarded) {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.body }}>
        <DemoBanner />
        <CapitalOnboarding
          initial={{ capital: store.settings.capital, concurrentTarget: store.settings.concurrentTarget, savings: store.settings.savings }}
          onDone={async (a) => {
            const st = { ...store, settings: { ...store.settings,
              capital: a.tradingCapital, concurrentTarget: a.concurrentTarget, savings: a.savings,
              sizeOverride: a.override && a.override.reason && a.override.reason.trim().length >= RULES.minOverrideReasonChars ? a.override : null,
              onboarded: true } };
            setStore(st); await saveState(st); goHome();
          }}
        />
      </div>
    );
  }

  if (view === "wizard") {
    return (
      <div style={{ minHeight: "100vh", background: T.bg, color: T.body }}>
        <DemoBanner />
        {msg && (
          <div style={{ ...mono, fontSize: 12, color: T.amber, background: `${T.amber}12`, borderBottom: `1px solid ${T.amber}44`, padding: "10px 14px" }}>{msg}</div>
        )}
        {wizStep === "open" && (
          <WizardOpen
            positions={store.positions} posAlerts={posAlerts} attention={nAttention}
            marketReady={marketReady} barsFor={(tk) => barsCache[tk] || []}
            onPositions={() => { setView("desk"); setTab("positions"); }}
            onFind={() => { setNothing(null); setWizStep("questions"); }}
            onDesk={() => goDesk("radar")}
            onSettings={() => { setView("desk"); setShowSettings(true); }}
          />
        )}
        {wizStep === "questions" && (
          <FindOpportunities
            answers={wiz} setAnswers={setWiz} limits={limits} busy={wiz.busy} err={wiz.err}
            universe={BASKET.map((tk) => ({ tk, name: getU(tk).name }))}
            onBack={goHome} onDecide={() => runWizard()}
          />
        )}
        {wizStep === "candidates" && (
          <WizardCandidates
            candidates={candidates} answers={wiz} narrative={verdict}
            barsFor={(tk) => barsCache[tk] || []}
            weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
            onPick={pickRoad}
            onBack={() => setWizStep("questions")}
          />
        )}
        {wizStep === "confirm" && (
          <WizardConfirm
            candidate={picked} preview={confirmPreview} result={confirmResult}
            bars={barsCache[picked?.ticker] || []}
            sigma={(seasonal[picked?.ticker]?.sigma) || getU(picked?.ticker).sigma}
            driftAnnual={Math.log(1 + (((seasonal[picked?.ticker]?.monthlyMean) || getU(picked?.ticker).monthlyMean)[NOW_MONTH] || 0) / 100) * 12}
            busy={wiz.busy}
            onConfirm={confirmRoad}
            onBack={() => { setConfirmResult(null); setWizStep("candidates"); }}
            onDesk={() => goDesk()}
          />
        )}
        {wizStep === "nothing" && (
          <NothingToday
            reasons={nothing || []} notified={!!store.settings.notifyWhenReady}
            hasPositions={store.positions.length > 0}
            onNotify={() => setNotify(true)}
            onBack={() => setWizStep("questions")}
            onPositions={() => { setView("desk"); setTab("positions"); }}
            onDesk={() => goDesk("radar")}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.body, fontFamily: "ui-sans-serif, system-ui" }}>
      <DemoBanner />
      {/* The bottom padding is the strip reserved for the injected Netlify
             badge (see BADGE_SAFE in theme.js): it is fixed to the viewport and
             was covering whatever happened to be at the bottom right. */}
        <div style={{ maxWidth: 1720, margin: "0 auto", padding: `18px 14px ${BADGE_SAFE}px` }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
          <div>
            <button onClick={goHome}
              style={{ ...mono, fontSize: 12, minHeight: 44, padding: "6px 0", background: "transparent", border: "none", color: T.blue, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
              <ArrowLeft size={14} /> Home
            </button>
            <Lbl>OPTIONS STRATEGY LAB v2 · LIVE DATA</Lbl>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: T.ink, margin: "4px 0 6px" }}>Commodity Options Desk</h1>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span style={{ ...mono, fontSize: 10, color: T.green, border: `1px solid ${T.green}55`, background: `${T.green}12`, padding: "3px 8px", borderRadius: 5, display: "inline-flex", gap: 5, alignItems: "center" }}>
                <ShieldCheck size={12} /> PAPER · {ruleBadge()}
              </span>
              <span style={{ ...mono, fontSize: 10, color: chain ? T.blue : T.dim, border: `1px solid ${chain ? T.blue : T.dim}44`, padding: "3px 8px", borderRadius: 5 }}>
                {chain ? `${chain.source} · updated ${ago(chain.updated)}` : "prices not loaded"}
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
            <Btn small ghost onClick={() => setTheme(T.dark ? "light" : "dark")}>
              {T.dark ? <Sun size={13} /> : <Moon size={13} />} {T.dark ? "Light" : "Dark"}
            </Btn>
            {/* Settings is not a place you trade from, so it is not one of the
                three: it sits behind this gear, exactly as it does on screen 1. */}
            <Btn small ghost={!showSettings} color={T.blue} onClick={() => setShowSettings((v) => !v)}>
              <SlidersHorizontal size={13} /> Settings
            </Btn>
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
          <Stat k="PRICE NOW (CBOE)" v={spot ? `$${spot.toFixed(2)}` : "—"} />
          <Stat k="EXPIRY" v={expKey ? `${expKey} · ${dte} DTE` : `${dte} DTE (model)`} c={T.blue} />
          <Stat k={`SEASONALITY ${MONTHS[NOW_MONTH].toUpperCase()}`} v={`${seas.monthlyMean[NOW_MONTH] > 0 ? "+" : ""}${seas.monthlyMean[NOW_MONTH].toFixed(1)}%`} c={seas.monthlyMean[NOW_MONTH] > 0 ? T.green : T.red} />
          <Stat k="SEASONAL SOURCE" v={seas.src || "estimate"} c={seasonal[ticker] ? T.green : T.dim} />
          <Stat k="IV RANK" v={ivRank ? (ivRank.rank != null ? `${ivRank.rank}` : `${ivRank.collecting}d collected`) : "—"}
            c={ivRank?.rank != null ? (ivRank.rank >= 60 ? T.red : ivRank.rank <= 40 ? T.green : T.mut) : T.dim}
            tip="Where today's option prices sit against their own past year (0 = cheapest ever, 100 = dearest). High means selling premium pays better; low means buying options is good value. The history builds up with one refresh a day." />
        </div>

        {msg && <div style={{ ...mono, fontSize: 11.5, color: T.amber, border: `1px solid ${T.amber}44`, background: `${T.amber}10`, borderRadius: 6, padding: "7px 10px", marginTop: 10 }}>{msg}</div>}

        <TabBoundary k={`${tab}/${ev}`}>
        {/* Alert Center: morning check */}
        {posAlerts.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.panel, border: `1px solid ${nAttention ? T.red : T.line}55`, borderRadius: 8 }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: nAttention ? T.red : T.amber, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={11} /> TODAY · {nAttention ? `${nAttention} POSITION${nAttention === 1 ? "" : "S"} NEED A DECISION` : "EVERYTHING IS ON PLAN"}
            </div>
            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              {posAlerts.map(({ p, pnl, dteLeft, level, label }) => {
                const c2 = level === "action" ? T.red : level === "watch" ? T.amber : T.green;
                return (
                  <button key={p.id} onClick={() => setTab("positions")}
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

        {/* The three places */}
        <div style={{ display: "flex", gap: 6, marginTop: 14, flexWrap: "wrap" }}>
          {PLACES.map(({ id, label, I }) => {
            const on = tab === id && !showSettings;
            return (
              <button key={id} onClick={() => { setTab(id); setShowSettings(false); }}
                style={{
                  ...sansUI, fontSize: 14, fontWeight: on ? 700 : 500, minHeight: 46,
                  padding: "8px 16px", borderRadius: 8, whiteSpace: "nowrap", cursor: "pointer",
                  background: on ? T.amber : "transparent", color: on ? T.onAccent : T.ink,
                  border: `1.5px solid ${on ? T.amber : T.line}`, display: "inline-flex", gap: 6, alignItems: "center",
                }}>
                <I size={14} /> {label}{id === "positions" && nAttention > 0 && (
                  <span style={{ ...mono, fontSize: 9, background: T.red, color: T.onAccent, borderRadius: 8, padding: "0 5px", fontWeight: 800 }}>{nAttention}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* The evidence, under the Build screen where the trade is. Tabs are not
            destinations: each of these answers a question about THIS trade. */}
        {tab === "build" && !showSettings && (
          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.dim, marginRight: 4 }}>EVIDENCE</span>
              {EVIDENCE.map(({ id, label, I, sub }) => (
                <button key={id} onClick={() => setEv(ev === id ? null : id)} title={sub}
                  style={{
                    ...mono, fontSize: 11, padding: "7px 10px", borderRadius: 6, whiteSpace: "nowrap", cursor: "pointer",
                    background: ev === id ? `${T.blue}18` : "transparent", color: ev === id ? T.blue : T.mut,
                    border: `1px solid ${ev === id ? T.blue : T.line}`, display: "inline-flex", gap: 5, alignItems: "center",
                  }}>
                  <I size={12} /> {label} {ev === id ? "▲" : "▼"}
                </button>
              ))}
            </div>
            {ev && (
              <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>
                {EVIDENCE.find((e) => e.id === ev)?.sub} — evidence for the trade on the Build screen, not a place of its own.
              </div>
            )}
          </div>
        )}

        {/* ============ SCANNER ============ */}
        {tab === "build" && !showSettings && ev === "radar" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Lbl>BEST OPPORTUNITIES · 4-FACTOR SIGNAL · {MONTHS[NOW_MONTH].toUpperCase()}</Lbl>
              <Btn small ghost onClick={async () => { setBusy("all"); for (const tk of Object.keys(UNDERLYINGS)) await refreshChain(tk, true); setBusy(null); setMsg("All markets refreshed."); }}>
                <RefreshCw size={11} /> Refresh all
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
                        seasonal {r.seasonalScore > 0 ? "+" : ""}{r.seasonalScore.toFixed(1)}%/mo {r.real ? "(10y history)" : "(estimate)"} · {r.spot ? `$${r.spot.toFixed(2)}` : "prices not loaded"}{ta[r.tk] ? ` · trend ${ta[r.tk].trend > 0 ? "↑" : ta[r.tk].trend < 0 ? "↓" : "→"} RSI ${ta[r.tk].rsi.toFixed(0)}` : ""}
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
                    <Btn small ghost onClick={() => { switchTicker(r.tk); setSentiment(r.sugg); setTab("build"); setEv("shortlist"); }}>→ Shortlist</Btn>
                  </div>
                );
              })}
            </div>
            <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>
The order weighs the 4-factor signal (seasonality, price trend, weather, news): CONFLICT tickers stay last regardless. Tap the badge for the full narrative. Under History, "Real 10y seasonality" replaces the estimates with ten years of actual data for that market.
            </div>
          </Panel>
        )}

        {/* ============ OPTIMIZE ============ */}
        {tab === "build" && !showSettings && ev === "shortlist" && spot && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>1 · WHICH WAY DO YOU THINK IT GOES?</Lbl>
              <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                {SENTIMENTS.map((s) => (
                  <button key={s.id} onClick={() => setSentiment(s.id)}
                    style={{
                      ...mono, fontSize: 11, padding: "10px 12px", borderRadius: 24, cursor: "pointer", flex: "1 1 auto",
                      background: sentiment === s.id ? s.color : "transparent",
                      color: sentiment === s.id ? T.onAccent : s.color,
                      border: `1.5px solid ${s.color}`, fontWeight: 700,
                    }}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
                <Stat k="IMPLIED TARGET" v={`$${(spot * (1 + SENT.tgt)).toFixed(2)} (${SENT.tgt >= 0 ? "+" : ""}${(SENT.tgt * 100).toFixed(0)}%)`} c={T.blue} />
                <div>
                  <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>SIZE BY</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small ghost={optMode !== "budget"} onClick={() => setOptMode("budget")}>What I can spend</Btn>
                    <Btn small ghost={optMode !== "target"} onClick={() => setOptMode("target")}>What I want to make</Btn>
                  </div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{optMode === "budget" ? "MOST I WILL RISK ($)" : "PROFIT I AM AIMING FOR ($)"}</div>
                  <Inp type="number" min={50} step={50} value={optAmt} onChange={(e) => setOptAmt(Math.max(0, +e.target.value))} style={{ width: 100 }} />
                </div>
                {chain && (
                  <div>
                    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>EXPIRY</div>
                    <select value={expKey || ""} onChange={(e) => setExpKey(e.target.value)}
                      style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "5px 8px", fontSize: 12 }}>
                      {chain.expirations.map((e) => (
                        <option key={e} value={e}>{e} · {chain.byExp[e].dte} DTE</option>
                      ))}
                    </select>
                    {chain.expirations.length <= 4 && (
                      <div style={{ ...mono, fontSize: 9, color: T.dim, marginTop: 3, maxWidth: 220 }}>
                        These are every expiry CBOE lists for {ticker} — this ETF only has monthly ones, it is not a limit of the app.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            <WhyThisTrade
              fused={fused[ticker]}
              ticker={ticker} weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
              title={`WHY THIS TRADE · ${ticker}`}
              note={fused[ticker]?.agreement === "CONFLICT"
                ? "Candidates on a CONFLICT ticker rank last in the multi-market scan below, whatever their expected value."
                : "The scan below ranks candidates on expected value adjusted by this read."}
            />

            <Panel style={{ marginTop: 10 }}>
              <Lbl>2 · {SENT.label.toUpperCase()} STRATEGIES — {ticker} · PRICED FROM THE LIVE CHAIN</Lbl>
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
                            {a.realCount === p.legs.length ? "● live prices" : `◐ ${a.realCount}/${p.legs.length} live`}
                          </span>
                        </div>
                        <Btn small onClick={() => applyPreset(p, a)}>Open on Build →</Btn>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")}
                      </div>
                      <div style={{ marginTop: 6 }}><BandThumbnail bands={payoffBands({ legs: p.legs, entryNet: a.entry, spot })} bars={barsCache[ticker] || []} width={220} height={40} title={bandTakeaway(payoffBands({ legs: p.legs, entryNet: a.entry, spot }), { ticker })} /></div>
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                        <Stat k={a.entry >= 0 ? "YOU PAY" : "YOU RECEIVE"} v={fmt$(Math.abs(a.entry) * 100)} />
                        <Stat k="MAX PROFIT" v={fmt$(a.maxProfit)} c={T.green} />
                        <Stat k="MAX LOSS" v={fmt$(a.maxLoss)} c={T.red} />
                        <Stat k="R/R" v={rr ? rr.toFixed(2) : "—"} c={T.amber} />
                        <Stat k="CHANCE" v={pop != null ? `${(pop * 100).toFixed(0)}%` : "—"} c={pop >= 0.5 ? T.green : T.violet} />
                        <Stat k="BREAKEVEN" v={a.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                      </div>
                      {(() => {
                        const sc = scaleStrategy(a, optMode, optAmt);
                        if (!sc) return <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Cannot scale this one (unlimited profit or no defined risk): judge it at a single contract.</div>;
                        if (!sc.ok) return <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 6 }}>✗ Not enough budget: one of these {sc.isCredit ? `ties up ${fmt$(sc.unit)} of risk` : `costs ${fmt$(sc.unit)} to buy`}.</div>;
                        return (
                          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", padding: "6px 8px", background: `${T.amber}0d`, borderRadius: 5 }}>
                            <Stat k="HOW MANY" v={`×${sc.n}`} c={T.amber} />
                            <Stat k={sc.isCredit ? "YOU RECEIVE" : "YOU PAY"} v={fmt$(sc.totPrem)} c={sc.isCredit ? T.green : T.ink} />
                            <Stat k="MOST YOU CAN LOSE" v={fmt$(sc.totRisk)} c={T.red} />
                            <Stat k="MOST YOU CAN MAKE" v={fmt$(sc.totProfit)} c={T.green} />
                            {pop != null && <Stat k="PROFIT × CHANCE" v={fmt$(sc.totProfit * pop)} c={T.blue} />}
                            <Stat k={optMode === "target" ? "HITS THE TARGET" : "BUDGET USED"} v={optMode === "target" ? (sc.totProfit >= optAmt ? "✓ yes" : "✗ no") : `${((sc.n * sc.unit / Math.max(1, optAmt)) * 100).toFixed(0)}%`} c={T.blue} />
                            <div style={{ ...mono, fontSize: 9, color: T.dim, width: "100%" }}>Totals for ×{sc.n} · Build always shows one, so divide by {sc.n} to compare.</div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${T.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>3 · COMPARE MARKETS · USES THE DIRECTION YOU PICKED ABOVE</Lbl>
                  <Btn small onClick={runMultiScan} disabled={multi.busy}><Radar size={11} /> {multi.busy ? "Searching…" : "Search the selected markets"}</Btn>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small ghost={multi.senMode !== "auto"} onClick={() => setMulti((m) => ({ ...m, senMode: "auto", res: null }))}>Season decides each market</Btn>
                    <Btn small ghost={multi.senMode !== "fixed"} onClick={() => setMulti((m) => ({ ...m, senMode: "fixed", res: null }))}>My pick ({SENT.label}) everywhere</Btn>
                  </div>
                  <span style={{ ...mono, fontSize: 10, color: T.dim }}>HORIZON: ~{multi.dteT} DTE</span>
                  <input type="range" min={21} max={90} step={1} value={multi.dteT} onChange={(e) => setMulti((m) => ({ ...m, dteT: +e.target.value, res: null }))} style={{ width: 160, accentColor: T.amber }} />
                  <span style={{ ...mono, fontSize: 9.5, color: T.dim }}>change the horizon, then search again</span>
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
                    {multi.res.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Nothing fits your budget on the markets you picked.</div>}
                    {multi.res.some((r) => r.conflict) && (
                      <div style={{ ...mono, fontSize: 10, color: T.red }}>
                        Candidates marked CONFLICT sit at the bottom by construction: the four factors contradict each other on that underlying, and no expected value is worth a signal we cannot read.
                      </div>
                    )}
                    {multi.res.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                        <span style={{ ...mono, fontSize: 10, color: T.dim, width: 16 }}>#{i + 1}</span>
                        <BandThumbnail bands={payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot })} bars={barsCache[r.tk] || []} width={130} height={34} title={bandTakeaway(payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot }), { ticker: r.tk })} />
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
                        <Btn small ghost onClick={() => openOnBuild({ ticker: r.tk, expKey: r.expKey, legs: r.legs, name: `${r.name} (multi)` })}>Build →</Btn>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Budget is the most you will pay, taken from live CBOE prices. For trades where you receive money up front, the limit becomes the capital tied up instead. Chance is the probability of ending in profit at expiry. Your per-trade limit: {money(limits.perTradeLimit)} ({perTradeCapLabel()}).</div>
            </Panel>
          </div>
        )}

        {/* ============ BUILDER ============ */}
        {/* Where a hand-off lands. The anchor is rendered for every state of
            the Build screen, so scrolling works while the chain is loading. */}
        {tab === "build" && !showSettings && <div ref={buildAnchor} style={{ scrollMarginTop: 12 }} />}
        {tab === "build" && !showSettings && buildScreen === "builder" && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <input value={stratName} onChange={(e) => setStratName(e.target.value)}
                  style={{ ...mono, background: "transparent", border: "none", borderBottom: `1px dashed ${T.line}`, color: T.ink, fontSize: 15, fontWeight: 700, outline: "none", minWidth: 200 }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn small ghost color={T.blue} onClick={saveStrategy}><Save size={12} /> Save</Btn>
                  <Btn small color={T.green} onClick={openPaper} disabled={!reasonOk}><Briefcase size={12} /> Open on paper</Btn>
                  
                </div>
              </div>

              {chain && (
                <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ ...mono, fontSize: 10, color: T.dim }}>EXPIRY</span>
                  <select value={expKey || ""} onChange={(e) => { setExpKey(e.target.value); setMc(null); setBt(null); }}
                    style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "5px 8px", fontSize: 12 }}>
                    {chain.expirations.map((e) => (
                      <option key={e} value={e}>{e} · {chain.byExp[e].dte} DTE</option>
                    ))}
                  </select>
                  <span style={{ ...mono, fontSize: 10, color: A.realCount === legs.length ? T.green : T.amber }}>
                    {A.realCount === legs.length ? "● every price is a live CBOE quote" : `◐ ${A.realCount}/${legs.length} legs priced live — the rest are modelled`}
                  </span>
                </div>
              )}

              <WhyThisTrade
                fused={fused[ticker]}
                ticker={ticker} weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
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

              {/* Il verdetto del risk gate, non un calcolo parallelo: la stessa
                  funzione che decide se l'ordine parte scrive anche queste righe. */}
              {guard && !guard.pass && (
                <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.red}12`, border: `1px solid ${T.red}66`, borderRadius: 7 }}>
                  <div style={{ ...mono, fontSize: 11, color: T.red, fontWeight: 700 }}>⚠ RISK GATE: this order would not be sent</div>
                  <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                    {guard.violations.map((v) => (
                      <div key={v.code} style={{ fontSize: 12, color: T.body }}>{v.message}</div>
                    ))}
                  </div>
                </div>
              )}
              {guard && guard.pass && (
                <div style={{ ...mono, fontSize: 10, color: T.green, marginTop: 8 }}>
                  ✓ Inside your rules: risking {money(guard.limits.tradeRisk)} of {money(guard.limits.perTrade)} allowed · total {money(guard.limits.totalAfter)} of {money(guard.limits.total)}
                </div>
              )}
              {guard && guard.warnings.length > 0 && (
                <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                  {guard.warnings.map((w) => (
                    <div key={w.code} style={{ ...mono, fontSize: 10.5, color: T.amber }}>⚠ {w.message}</div>
                  ))}
                </div>
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
                        <button title="price history for this contract" onClick={() => setOptLeg({ occ, label: `${ticker} ${l.strike}${l.type === "call" ? "C" : "P"} ${expKey}`, quote: qq })}
                          style={{ background: "none", border: "none", color: T.violet, cursor: "pointer", ...mono, fontSize: 13 }}>📈</button>
                      ) : null; })()}
                      <button onClick={() => rmLeg(i)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}><Trash2 size={14} /></button>
                    </div>
                  );
                })}
                <Btn small ghost onClick={addLeg}><Plus size={12} /> Add a leg</Btn>
              </div>
              {optLeg && <OptionPanel occ={optLeg.occ} label={optLeg.label} quote={optLeg.quote} onClose={() => setOptLeg(null)} />}

              {/* Reconciliation with the Shortlist: same trade, numbers always explained */}
              {optRef && optRef.name === stratName && optRef.expKey === expKey && (() => {
                const d = (A.entry - optRef.entry) * 100;
                if (Math.abs(d) < 1) return (
                  <div style={{ ...mono, fontSize: 10, color: T.green, marginTop: 10 }}>✓ Same numbers as the Shortlist (same live quotes, one contract).</div>
                );
                return (
                  <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 10 }}>
                    ⚠ The price moved {fmt$(Math.abs(d))} {d > 0 ? "against you" : "in your favour"} since the Shortlist was drawn: the quotes refreshed in between. This one is the current price.
                  </div>
                );
              })()}
              {/* Stats */}
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                <Stat k={A.entry >= 0 ? "YOU PAY" : "YOU RECEIVE"} v={fmt$(Math.abs(A.entry) * 100)} tip="What it costs to open this trade, or what you are paid to open it. With live quotes this is the midpoint between the buy and sell price." />
                <Stat k="MOST YOU CAN MAKE" v={fmt$(A.maxProfit)} c={T.green} tip="The best this trade can do at expiry. It cannot make more than this." />
                <Stat k="MOST YOU CAN LOSE" v={fmt$(A.maxLoss)} c={T.red} tip="The worst this trade can do. It is fixed the moment you open it — never a dollar more." />
                <Stat k="BREAKEVEN" v={A.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                <Stat k={takeProfitLabel()} v={fmt$(A.maxProfit * RULES.takeProfitPct)} c={T.green} tip={RULE_PILLS.takeProfit()} />
                <Stat k={stopLossLabel()} v={fmt$(A.maxLoss * RULES.stopLossPct)} c={T.red} tip={RULE_PILLS.stopLoss()} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                <Stat k="Δ DELTA" v={A.greeks.delta.toFixed(2)} />
                <Stat k="Γ GAMMA" v={A.greeks.gamma.toFixed(3)} />
                <Stat k="Θ PER DAY" v={fmt$(A.greeks.theta)} c={A.greeks.theta >= 0 ? T.green : T.red} tip="What you gain (+) or lose (−) for each day that passes, if the price stays put. Positive means time is on your side." />
                <Stat k="V PER 1% VOL" v={fmt$(A.greeks.vega)} c={T.violet} tip="How much the value moves if the market gets 1% more jumpy. Positive means a nervous market helps you." />
              </div>

              <div style={{ marginTop: 14 }}>
                <Lbl>PRICE HISTORY × WHERE IT COULD GO × WHERE YOU MAKE MONEY</Lbl>
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
                      <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: cf.c }}>AGREEMENT: {cf.verdict}</span>
                      <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>seasonality {seas.monthlyMean[NOW_MONTH] >= 0 ? "+" : ""}{seas.monthlyMean[NOW_MONTH].toFixed(1)}%/mo · trend {t2.trendTxt} · RSI14 {t2.rsi.toFixed(0)}{t2.cross ? ` · ${t2.cross === "golden" ? "✚ recent golden cross" : "✖ recent death cross"}` : ""}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: T.body, marginTop: 5 }}>{cf.advice}</div>
                    {cf.warn && <div style={{ fontSize: 12, color: T.amber, marginTop: 4 }}>{cf.warn}</div>}
                    <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 5 }}>The price trend is used to confirm or time the seasonal read, never as a signal on its own.</div>
                  </div>
                );
              })()}

              {/* Payoff classico: vista secondaria */}
              <div style={{ marginTop: 14 }}>
              <Lbl>PROFIT AND LOSS BY PRICE · AT EXPIRY, TODAY, AND HALFWAY</Lbl>
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
                    <Line dataKey="now" name="today" stroke={T.violet} dot={false} strokeWidth={1.5} strokeDasharray="2 3" />
                    <Line dataKey="mid" name={`in ${Math.round(dte / 2)} days`} stroke={T.blue} dot={false} strokeWidth={1.5} strokeDasharray="5 4" />
                    <Line dataKey="exp" name="at expiry" stroke={T.amber} dot={false} strokeWidth={2.2} />
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
                  gate={gate} dte={dte} maxLoss={A.maxLoss} maxProfit={A.maxProfit}
                />
              )}
              {!alpaca && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Connect Alpaca in Positions → Integrations to unlock the full order ticket: limit or market, time in force, quantity and cancellations.</div>}
            </Panel>
          </div>
        )}

        {/* ============ 3D ============ */}
        {tab === "build" && !showSettings && ev === "levels" && (
          <Panel style={{ marginTop: 12 }}>
            <Lbl>WHERE THE MARKET IS POSITIONED (CBOE OPEN INTEREST)</Lbl>
            {!oiGrid && <div style={{ ...mono, fontSize: 12, color: T.mut, padding: 30, textAlign: "center" }}>Press Refresh at the top to load the prices first.</div>}
            {oiGrid && (
              <div style={{ height: 190, marginTop: 10 }}>
                <ResponsiveContainer>
                  <BarChart data={oiGrid.strikes.map((k, j) => ({ k, put: -oiGrid.oiPutTot[j], call: oiGrid.oiCallTot[j] }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} stackOffset="sign">
                    <XAxis dataKey="k" stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} />
                    <YAxis stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} width={44} tickFormatter={(v) => Math.abs(v)} />
                    <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} formatter={(v, n2) => [Math.abs(v), n2 === "put" ? "put contracts" : "call contracts"]} />
                    <ReferenceLine y={0} stroke={T.mut} />
                    {spot && <ReferenceLine x={oiGrid.strikes.reduce((b2, k) => Math.abs(k - spot) < Math.abs(b2 - spot) ? k : b2, oiGrid.strikes[0])} stroke={T.amber} strokeDasharray="4 3" />}
                    <Bar dataKey="put" fill={`${T.green}bb`} stackId="a" />
                    <Bar dataKey="call" fill={`${T.red}bb`} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {oiGrid && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 2 }}>Green bars below zero are where put buyers cluster — prices tend to hold there. Red bars above are where call buyers cluster — prices tend to stall there. The amber line is today's price.</div>}
            {lv && (
              <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.green }}>PRICES THAT TEND TO HOLD</div>
                  <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: T.ink }}>{lv.supports.map((x) => `$${x}`).join(" · ") || "—"}</div>
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.red }}>PRICES THAT TEND TO STALL</div>
                  <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: T.ink }}>{lv.resistances.map((x) => `$${x}`).join(" · ") || "—"}</div>
                </div>
              </div>
            )}
            <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>
              Added up across the first six expiries within 120 days (CBOE, ~15 min delayed). A big wall is a price the market has an interest in defending — useful when picking strikes and exits.
            </div>
          </Panel>
        )}

        {/* ============ BACKTEST ============ */}
        {tab === "build" && !showSettings && ev === "history" && spot && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>SEASONALITY {seasonal[ticker] ? `· ${seas.src}` : "(ESTIMATE — load the real history)"}</Lbl>
                <Btn small ghost color={T.blue} onClick={loadSeasonal} disabled={busy === "av"}>
                  <RefreshCw size={11} /> Real 10y seasonality
                </Btn>
              </div>
              {(() => {
                const mm = seas.monthlyMean;
                const bi = mm.indexOf(Math.max(...mm)), wi = mm.indexOf(Math.min(...mm));
                const cur = mm[NOW_MONTH];
                const rank = [...mm].sort((a, b) => b - a).indexOf(cur) + 1;
                return (
                  <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, padding: "8px 10px", background: `${T.amber}0a`, borderRadius: 6 }}>
                    <b style={{ color: T.ink }}>In plain words:</b> {ticker}'s best month historically is <b style={{ color: T.green }}>{MONTHS[bi]}</b> ({mm[bi] > 0 ? "+" : ""}{mm[bi].toFixed(1)}% a month on average), its worst is <b style={{ color: T.red }}>{MONTHS[wi]}</b> ({mm[wi].toFixed(1)}%). {MONTHS[NOW_MONTH]} (the amber bar) ranks {rank} of 12: {cur > 0.8 ? "the season is behind you — a directional trade makes sense." : cur < -0.8 ? "the season is against you — favour downside or non-directional trades." : "no clear push this month — a range trade suits it better."}
                  </div>
                );
              })()}
              <div style={{ height: 170, marginTop: 10 }}>
                <ResponsiveContainer>
                  <BarChart data={seas.monthlyMean.map((v, i) => ({ m: MONTHS[i], v: +v.toFixed(2) }))} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
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
              <Lbl>THREE PROBABILITIES · WHICH ONE TO READ, AND WHEN</Lbl>
              <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, lineHeight: 1.6 }}>
                <b style={{ color: T.blue }}>CHANCE</b> (Shortlist and Build): a snapshot — the odds of finishing in profit <i>at expiry</i>, worked out from what the market is pricing right now. Use it to <b>compare trades before you open one</b>.<br/>
                <b style={{ color: T.amber }}>SIMULATION</b> (below): the same question asked of history — 8,000 runs using the last ten years of seasonality and volatility. Use it to <b>check the season really is on your side</b>. If the two disagree sharply, the market is pricing something history has not seen: an event is coming.<br/>
                <b style={{ color: T.violet }}>EXIT PATH</b> (on open positions): the most realistic — it walks day by day <i>from today</i> and applies your own rules ({ruleBadge()}). It is the only one that answers "from here, how does this end if I stick to the plan?". Use it to <b>decide whether to hold or take the money</b>.
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>8,000 SIMULATIONS + REAL HISTORY — "{stratName}"</Lbl>
                <Btn small onClick={runMC} disabled={!A}><FlaskConical size={12} /> Run it</Btn>
              </div>
              {mc ? (
                <>
                  <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                    <Stat k="CHANCE OF PROFIT" v={`${(mc.pop * 100).toFixed(1)}%`} c={mc.pop >= 0.5 ? T.green : T.red} tip="The share of simulated runs that finish in profit at expiry." />
                    <Stat k="AVERAGE RESULT" v={fmt$(mc.ev)} c={mc.ev >= 0 ? T.green : T.red} />
                    <Stat k="BAD CASE" v={fmt$(mc.p5)} c={T.red} tip="Only 1 run in 20 turns out worse than this." />
                    <Stat k="TYPICAL" v={fmt$(mc.p50)} />
                    <Stat k="GOOD CASE" v={fmt$(mc.p95)} c={T.green} tip="Only 1 run in 20 turns out better than this." />
                    <Stat k="YEARLY DRIFT" v={`${(mc.muAnn * 100).toFixed(1)}%`} c={T.blue} />
                  </div>
                  <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
                    <b style={{ color: T.ink }}>In plain words:</b> out of 8,000 simulated runs, {Math.round(mc.pop * 100)} in 100 finish in profit.
                    In the worst 5% you lose about {fmt$(Math.abs(mc.p5))}{guard ? (Math.abs(mc.p5) <= guard.limits.perTrade ? ` — inside your per-trade limit of ${money(guard.limits.perTrade)} ✓` : ` — CAREFUL: past your per-trade limit of ${money(guard.limits.perTrade)}`) : ""}.
                    The typical result is {fmt$(mc.p50)}.
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
                      <Lbl>WHAT ACTUALLY HAPPENED · {MONTHS[NOW_MONTH]} → +{Math.max(1, Math.round(dte / 30))} MONTHS, EVERY YEAR</Lbl>
                      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                        <Stat k="YEARS IT WORKED" v={`${(bt.winRate * 100).toFixed(0)}%`} c={bt.winRate >= 0.5 ? T.green : T.red} />
                        <Stat k="AVERAGE RESULT" v={fmt$(bt.avg)} c={bt.avg >= 0 ? T.green : T.red} />
                        <Stat k="YEARS TESTED" v={bt.rows.length} />
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
                      The year-by-year history unlocks once you load the real seasonality above.
                    </div>
                  )}
                  {replay && (
                    <div style={{ marginTop: 12, padding: "10px 12px", background: `${T.amber}0a`, border: `1px solid ${T.amber}44`, borderRadius: 7 }}>
                      <Lbl>⏪ WHAT WOULD HAVE HAPPENED IN {replay.year} · "{stratName}" OPENED IN {MONTHS[NOW_MONTH].toUpperCase()}</Lbl>
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
                        Following your rules: {fmt$(replay.finale)} {replay.closed ? `(${replay.closed.why} in month ${replay.closed.i})` : "(held to expiry)"}
                      </div>
                      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>Replayed on real monthly returns. The point is to watch the rules work before you rely on them.</div>
                    </div>
                  )}
                  <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>
                    Simulated with {seasonal[ticker] ? "real" : "estimated"} seasonal drift and {(seas.sigma * 100).toFixed(0)}% volatility. A simplified model: no price jumps, no volatility term structure.
                  </div>
                </>
              ) : (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 10 }}>Press "Run it" for the odds, the spread of outcomes, and what happened in each of the last ten years.</div>
              )}
            </Panel>
          </div>
        )}

        {/* News and Weather are no longer tabs. They are the evidence behind the
            "Why this trade" panel: tapping the weather bar opens the regions and
            their anomalies, tapping the news bar opens the headlines with their
            tags. Evidence belongs next to the claim it supports. */}

        {/* ============ PAPER + INTEGRAZIONI ============ */}
        {tab === "positions" && !showSettings && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>YOUR POSITIONS ({store.positions.length}) · VALUED LIVE</Lbl>
                <label style={{ ...mono, fontSize: 10.5, color: autoMon ? T.green : T.dim, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={autoMon} onChange={(e) => setAutoMon(e.target.checked)} /> refresh every 60s
                </label>
              </div>
              {store.positions.length === 0 && <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8 }}>Nothing open yet. Build a trade, then press "Open on paper".</div>}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {store.positions.map((p) => {
                  const c = chains[p.ticker];
                  const s = c?.spot;
                  const dteLeft = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
                  const qp = makeQuote(c, p.expKey);
                  const nowNet = s ? netValue(p.legs, s, dteLeft, getU(p.ticker).iv, qp) : null;
                  const pnl = nowNet != null ? (nowNet - p.entryNet) * 100 : null;
                  const tpHit = pnl != null && p.maxProfit > 0 && pnl >= RULES.takeProfitPct * p.maxProfit;
                  const slHit = pnl != null && p.maxLoss < 0 && pnl <= RULES.stopLossPct * p.maxLoss;
                  const dteExit = dteLeft <= RULES.exitDTE;
                  const rec = tpHit ? { t: `→ TAKE THE PROFIT: ${takeProfitLabel()}`, c: T.green } : slHit ? { t: `→ WARNING: ${stopLossLabel()}`, c: T.red } : dteExit ? { t: `→ CLOSE OR ROLL: ${RULES.exitDTE} days left`, c: T.amber } : { t: "→ HOLD", c: T.mut };
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>{p.ticker} · {p.name}</div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn small ghost color={T.blue} onClick={() => openOnBuild({ ticker: p.ticker, expKey: p.expKey || null, legs: p.legs, name: p.name + " (monitor)" })}>Monitor ↗</Btn>
                          <Btn small ghost color={T.red} onClick={() => closePos(p.id)}><Trash2 size={11} /> Close</Btn>
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · expires {p.expKey || new Date(p.expiry).toLocaleDateString("en-GB")} · opened {new Date(p.openedAt).toLocaleDateString("en-GB")}
                      </div>
                      {/* PRD §6: the gauge is the primary visual on position detail.
                          It is drawn from payoff() like every other zone in the app. */}
                      <GaugeFigure legs={p.legs} entryNet={p.entryNet} spot={s ?? p.entrySpot}
                        ticker={p.ticker} size={230} style={{ marginTop: 10 }} />
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Stat k="ENTRY" v={fmt$(Math.abs(p.entryNet) * 100)} />
                        <Stat k="PROFIT NOW" v={pnl != null ? fmt$(pnl) : "loading…"} c={pnl >= 0 ? T.green : T.red} />
                        <Stat k="OF THE MAXIMUM" v={pnl != null && p.maxProfit > 0 ? `${((pnl / p.maxProfit) * 100).toFixed(0)}%` : "—"} />
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
                            setMsg={setMsg} logEvent={logEvent} gate={gate}
                          />
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {alpaca && <AlpacaDesk setMsg={setMsg} gate={gate} />}

            <Panel style={{ marginTop: 10 }}>
              <Lbl>SAVED STRATEGIES ({store.saved.length})</Lbl>
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {store.saved.map((sv) => (
                  <div key={sv.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 150 }}>
                      <div style={{ color: T.ink, fontWeight: 600, fontSize: 12.5 }}>{sv.ticker} · {sv.name}</div>
                      <div style={{ ...mono, fontSize: 10, color: T.dim }}>{sv.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · {sv.expKey || `${sv.dte} DTE`}</div>
                    </div>
                    <Btn small ghost onClick={() => openOnBuild({ ticker: sv.ticker, expKey: sv.expKey || null, legs: sv.legs, name: sv.name })}>Load</Btn>
                    <button onClick={() => delSaved(sv.id)} style={{ background: "none", border: "none", color: T.dim, cursor: "pointer" }}><Trash2 size={13} /></button>
                  </div>
                ))}
                {store.saved.length === 0 && <div style={{ ...mono, fontSize: 11.5, color: T.mut }}>Nothing saved yet.</div>}
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl><Plug size={11} style={{ verticalAlign: "-1px" }} /> INTEGRATIONS</Lbl>
              <div style={{ marginTop: 10 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Alpha Vantage — free 10-year price history</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>The key lives in the server environment (ALPHAVANTAGE_KEY). It powers the real seasonality and the year-by-year history under History.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Alpaca paper trading</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Btn small onClick={testAlpaca} disabled={busy === "alpaca"}>Check the connection</Btn>
                  <span style={{ ...mono, fontSize: 10.5, color: T.dim }}>keys live in the server environment (ALPACA_KEY / ALPACA_SECRET)</span>
                </div>
                {alpaca && (
                  <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                    <Stat k="EQUITY" v={`$${(+alpaca.equity).toLocaleString()}`} c={T.green} />
                    <Stat k="BUYING POWER" v={`$${(+alpaca.buying_power).toLocaleString()}`} />
                    <Stat k="STATUS" v={alpaca.status} c={T.blue} />
                  </div>
                )}
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>
                  Only paper-api.alpaca.markets is ever contacted, and the app checks that it was: no real money can be reached from here. Every order asks you twice before it is sent.
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Anthropic API — copilot and reports</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>The key lives in the server environment (ANTHROPIC_KEY), so nothing needs typing into the site.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Your capital and limits</div>
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 6 }}>Behind the Settings button at the top of this page, next to the theme.</div>
              </div>
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 11, color: T.ink, fontWeight: 700 }}>Report webhook (optional)</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Inp placeholder="https://hooks.zapier.com/…" value={store.settings.webhook} onChange={(e) => setSetting("webhook", e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 4 }}>The report in the Journal can post itself to Zapier or Make, which can forward it by email or messaging.</div>
              </div>
            </Panel>
          </div>
        )}

        {/* ============ SETTINGS ============ */}
        {showSettings && (
          <div style={{ marginTop: 12, maxWidth: 620 }}>
            <Card>
              <Lbl>APPEARANCE</Lbl>
              <div style={{ fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
                Light is the default. Dark is here whenever you want it — the app reloads to apply the change.
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {[["light", "Light", Sun], ["dark", "Dark", Moon]].map(([id, label, I]) => {
                  const on = themeName() === id;
                  return (
                    <button key={id} onClick={() => !on && setTheme(id)}
                      style={{ flex: 1, minHeight: 52, borderRadius: 10, cursor: on ? "default" : "pointer",
                        fontSize: 15, fontWeight: on ? 700 : 500, fontFamily: "ui-sans-serif, system-ui",
                        background: on ? T.amber : "transparent", color: on ? T.onAccent : T.ink,
                        border: `1.5px solid ${on ? T.amber : T.line}`, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                      <I size={16} /> {label}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card style={{ marginTop: 12 }}>
              <Lbl>YOUR CAPITAL · EVERY LIMIT COMES FROM HERE</Lbl>
              <div style={{ fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
                Change these and the per-trade limit changes with them. Nothing here is a number we handed you.
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>TRADING CAPITAL ($)</div>
                  <Inp type="number" min={100} step={500} value={store.settings.capital || RULES.defaultTradingCapital}
                    onChange={(e) => setSetting("capital", Math.max(100, +e.target.value))} style={{ width: 130, fontSize: 16, padding: "10px 10px" }} />
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>POSITIONS AT ONCE</div>
                  <Inp type="number" min={1} max={20} value={store.settings.concurrentTarget || RULES.defaultConcurrentTarget}
                    onChange={(e) => setSetting("concurrentTarget", Math.max(1, +e.target.value))} style={{ width: 90, fontSize: 16, padding: "10px 10px" }} />
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>TOTAL SAVINGS ($, OPTIONAL)</div>
                  <Inp type="number" min={0} step={1000} value={store.settings.savings ?? ""}
                    onChange={(e) => setSetting("savings", e.target.value === "" ? null : Math.max(0, +e.target.value))} style={{ width: 150, fontSize: 16, padding: "10px 10px" }} />
                </div>
              </div>
              {/* The pills explain the limit while you are still changing it. */}
              {limits.pills.map((pl) => <Pill key={pl.id}>{pl.text}</Pill>)}
              <div style={{ marginTop: 14, padding: "12px 14px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 10 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{money(limits.perTradeLimit)} at risk per trade</div>
                <div style={{ fontSize: 13, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
                  and {money(limits.totalLimit)} across everything at once ({pctText(RULES.totalExposurePct)} of your capital).
                  {limits.overrideAccepted ? ` This is your own limit, not the suggested one — your reason: “${limits.overrideReason}”.` : ""}
                </div>
              </div>
              {/* An override is allowed, and it costs a written reason (PRD §3). */}
              <div style={{ marginTop: 14 }}>
                <div style={{ ...mono, fontSize: 10, color: T.dim }}>OVERRIDE THE PER-TRADE LIMIT (NEEDS A WRITTEN REASON)</div>
                <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                  <Inp type="number" min={0} step={50} placeholder="amount"
                    value={store.settings.sizeOverride?.perTrade ?? ""}
                    onChange={(e) => setSetting("sizeOverride", e.target.value === ""
                      ? null
                      : { ...(store.settings.sizeOverride || {}), perTrade: Math.max(0, +e.target.value) })}
                    style={{ width: 120, fontSize: 16, padding: "10px 10px" }} />
                  {store.settings.sizeOverride && (
                    <Btn small ghost color={T.red} onClick={() => setSetting("sizeOverride", null)}>Remove override</Btn>
                  )}
                </div>
                {store.settings.sizeOverride && (
                  <textarea rows={3} placeholder="Why this limit and not the suggested one?"
                    value={store.settings.sizeOverride?.reason ?? ""}
                    onChange={(e) => setSetting("sizeOverride", { ...(store.settings.sizeOverride || {}), reason: e.target.value })}
                    style={{ width: "100%", boxSizing: "border-box", marginTop: 8, fontSize: 16, lineHeight: 1.45,
                      fontFamily: "ui-sans-serif, system-ui", background: T.bg, color: T.ink,
                      border: `1px solid ${limits.overrideAccepted ? T.green : T.amber}`, borderRadius: 8, padding: "10px 12px", resize: "vertical" }} />
                )}
              </div>
            </Card>

            <Card style={{ marginTop: 12 }}>
              <Lbl>WHEN THERE IS NOTHING TO DO</Lbl>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10, cursor: "pointer" }}>
                <input type="checkbox" checked={!!store.settings.notifyWhenReady}
                  onChange={(e) => setNotify(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
                <span style={{ fontSize: 13.5, color: T.body, lineHeight: 1.5 }}>
                  Flag it in the daily brief when the signals line up again and options stop being expensive.
                </span>
              </label>
            </Card>

            <Card style={{ marginTop: 12 }}>
              <Lbl>START OVER</Lbl>
              <div style={{ fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
                Run the capital questions again. Your positions and saved strategies are not touched.
              </div>
              <div style={{ marginTop: 12 }}>
                <Btn ghost color={T.blue} onClick={() => setSetting("onboarded", false)}>Redo setup</Btn>
              </div>
            </Card>
          </div>
        )}

        {tab === "build" && !showSettings && ev === "copilot" && (
          <CopilotTab
            apiKey={"server"}
            ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
          />
        )}

        {/* ============ JOURNAL — the third place ============
            What actually happened, and what it says about the habits. The
            report lives here too: it is a written record, not a workspace. */}
        {tab === "journal" && !showSettings && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>THE RECORD · {(store.journal || []).length} CLOSED · {store.positions.length} OPEN</Lbl>
              <div style={{ display: "flex", gap: 18, marginTop: 10, flexWrap: "wrap" }}>
                <Stat k="LEVEL" v={journey.level} c={T.amber} />
                <Stat k="AWARENESS" v={journey.score == null ? "—" : `${journey.score}/100`} c={journey.score >= 70 ? T.green : journey.score >= 40 ? T.amber : T.dim} />
                <Stat k="CLOSED BY THE RULES" v={journey.closed ? `${journey.ruled}/${journey.closed}` : "—"} c={T.blue} />
                <Stat k="INSIDE THE LIMIT" v={journey.coerenza == null ? "—" : pctText(journey.coerenza)} c={T.blue} />
              </div>
              <div style={{ fontSize: 13, color: T.mut, marginTop: 10, lineHeight: 1.5 }}>
                Next: {journey.next}. Discipline is the share of trades you closed because a rule said so rather than
                because you felt like it — it is the only number here that predicts the others.
              </div>
            </Panel>

            <Panel style={{ marginTop: 10 }}>
              <Lbl>CLOSED TRADES</Lbl>
              {!(store.journal || []).length && (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8 }}>Nothing closed yet. Every trade you close lands here with the reason it ended.</div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {(store.journal || []).slice().reverse().map((e) => (
                  <div key={e.id} style={{ padding: "9px 11px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>{e.ticker} · {e.name}</span>
                      <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: e.pnl == null ? T.dim : e.pnl >= 0 ? T.green : T.red }}>{e.pnl == null ? "—" : fmt$(e.pnl)}</span>
                      <span style={{ ...mono, fontSize: 10, color: e.ruleExit ? T.green : T.amber, border: `1px solid ${(e.ruleExit ? T.green : T.amber)}55`, borderRadius: 4, padding: "1px 6px" }}>
                        {e.ruleExit ? "closed by the rules" : "closed by hand"}
                      </span>
                      <span style={{ ...mono, fontSize: 10, color: e.riskOk ? T.dim : T.red }}>
                        {e.riskOk ? "inside the per-trade limit" : "over the per-trade limit at the time"}
                      </span>
                    </div>
                    <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 3 }}>
                      opened {new Date(e.openedAt).toLocaleDateString("en-GB")} · closed {new Date(e.t).toLocaleDateString("en-GB")}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <ReportTab
              apiKey={"server"}
              setSetting={setSetting}
              ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
            />
          </div>
        )}

        {/* The chain is on its way. Saying "no market data" here would blame
            the user for a request that has not come back yet. */}
        {tab === "build" && !showSettings && buildScreen === "loading" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.blue }}>Loading {ticker} option prices — the trade appears here as soon as they arrive.</div>
          </Panel>
        )}

        {tab === "build" && !showSettings && buildScreen === "no-market-data" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.amber }}>Option prices for {ticker} have not loaded yet — press Refresh at the top.</div>
          </Panel>
        )}

        {/* An empty Build screen is a normal state, not a blank screen: say what
            it is for and where the trades come from. */}
        {tab === "build" && !showSettings && buildScreen === "empty" && (
          <Panel style={{ marginTop: 12 }}>
            <Lbl>NOTHING TO BUILD YET</Lbl>
            <div style={{ fontSize: 13.5, color: T.body, marginTop: 8, lineHeight: 1.55 }}>
              This is where one trade sits while you take it apart: its payoff, its odds, its risk checks and
              the four factors behind it. Nothing is on it yet.
            </div>
            <div style={{ fontSize: 13.5, color: T.mut, marginTop: 8, lineHeight: 1.55 }}>
              Open <b style={{ color: T.blue }}>Radar</b> to see which market is worth looking at, or
              <b style={{ color: T.blue }}> Shortlist</b> to see which structures fit — both are evidence buttons
              just above. Or go back Home and answer three questions instead.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <Btn small onClick={() => setEv("radar")}><Radar size={11} /> Radar</Btn>
              <Btn small ghost onClick={() => setEv("shortlist")}><Layers size={11} /> Shortlist</Btn>
              <Btn small ghost color={T.blue} onClick={goHome}>← Home</Btn>
            </div>
          </Panel>
        )}

        </TabBoundary>

        <div style={{ ...mono, fontSize: 10, color: T.dim, textAlign: "center", marginTop: 22 }}>
          Paper trading only · CBOE prices delayed ~15 min · {perTradeCapLabel()} · Total exposure ≤{pctText(RULES.totalExposurePct)} · Educational software, not financial advice
        </div>
      </div>
    </div>
  );
}
