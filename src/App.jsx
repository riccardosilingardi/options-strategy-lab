import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from "recharts";
import {
  RefreshCw, ShieldCheck, Save, Trash2, Layers, Radar, Box,
  FlaskConical, Briefcase, Plus, Plug, Send, ExternalLink, MessageSquare, FileText, Bell,
  SlidersHorizontal, ArrowLeft, Sun, Moon, AlertTriangle,
} from "lucide-react";
import { fetchAllNews, fetchWeather, ImpactTags, CopilotTab, ReportTab, OrderTicket, AlpacaDesk, scaleStrategy, probProfit, buildContext, GuardianPanel, ChainMatrix, OptionPanel, UnifiedView, taSignals, confluence, WhyThisTrade, Markdown } from "./pro.jsx";
import { BandThumbnail, payoffBands, bandTakeaway, GaugeFigure, Gauge, CompareFigure, exitPlanSentence,
  OpenInterestStrip, oiStripTakeaway, oiCutAt, oiGhostCut, explainOiStrip, useWidth } from "./visuals.jsx";
import { fuseSignals, sentimentDirection, withSignalRank, compareCandidates, againstSignal, DRIVER_PRESETS, rankByDrivers, verdictNarrative } from "./signals.js";
import { N as nCDF, bs as bsPrice, smile as smileIV, payoff as payoffExp, SEASONAL, SIGMA } from "./engine.js";
import { parseOcc, buildOcc, fetchChain, hasOpenInterest, enrichOpenInterest, feedName, sourceNote, openInterestNote, oiProfile, expiryOpenInterest, nearMoneyOpenInterest, monotonicityBreaks, monotonicityNote, spotOf, spotAt } from "./chain.js";
import { T, themeName, setTheme, BADGE_SAFE } from "./theme.js";
import { RULES, sizing, ruleBadge, takeProfitLabel, stopLossLabel, perTradeCapLabel, RULE_PILLS, NOTHING_TODAY, money, pctText, capitalSourceNote, perTradeLimitPhrase, qualityFloor, qualityFloorSentence, liquiditySkippedNote,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityLevel, liquidityThreshold, looseningWarning, liquiditySettingNote, isLoosened, ordinal,
  priceability, unpriceableNote, rewardRisk, MIN_NET_DOLLARS,
  payoffCeiling, NO_CEILING, noCeilingNote, noCeilingRankNote,
  impossibleLoss, impossibleLossNote,
  expiryChoice, expiryChoiceNote, emptyExpiryNote, wideSpreadNote, spreadSkippedNote,
  chancePct, chanceText, chanceInTen, signedMoney } from "./rules.js";
import { isStale, freshnessNote, staleAmong } from "./freshness.js";
import { evaluateTrade, gateSummary } from "./riskGate.js";
import { DEMO, DEMO_BANNER, DEMO_TOOLTIP, DEMO_SEED_TICKERS, demoPositions } from "./demo.js";
import { CapitalOnboarding, WizardOpen, FindOpportunities, WizardCandidates, ConfirmSteps, NothingToday, Card, Pill } from "./wizard.jsx";
import { buildHandOff, buildScreenState, BUILD_TAB } from "./handoff.js";
import { orderBody, orderOutcome, alpacaErrorText } from "./order.js";
import { FIRST_STEP, stepCarry, candidateOf, candidateKey, legsLine, toggleCompare, inCompare, MAX_COMPARE, savedFromCandidate, candidateFromSaved, savedAge } from "./path.js";
import { StepNav, StepForward, EvidenceBar, EvidenceOverlay, CompareTray, CandidateActions } from "./steps.jsx";

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
// `src/basket.js` carries the same five for the Netlify function that cannot
// import this file, and `src/chain.test.js` fails the build if the two drift.
const BASKET = Object.keys(UNDERLYINGS).filter((k) => UNDERLYINGS[k].commodity);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const NOW_MONTH = new Date().getMonth();
// Accesso SICURO alle statistiche del sottostante: qualunque ticker (anche importato
// da Alpaca o salvato da versioni precedenti) ha sempre un fallback valido.
// Questo elimina la causa n.1 delle "schermate nere" (crash su UNDERLYINGS[ticker] undefined).
const FALLBACK_U = (tk) => ({ name: tk, iv: 0.30, sigma: 0.30, step: 0.5, monthlyMean: Array(12).fill(0), newsQ: `${tk} price outlook`, fallback: true });
const getU = (tk) => UNDERLYINGS[tk] || FALLBACK_U(tk || "?");

/* ============================== OPTION CHAIN: ALPACA FIRST, CBOE AS THE NET ==============================
   The chain lives in src/chain.js — one internal shape, two sources, and the
   mid price computed in one place so the two can never disagree about the price
   of the same contract for a reason that is only a formula. Alpaca is primary
   (the same broker the orders go to); CBOE catches every failure, so a slow or
   silent broker costs a few seconds, never a blank screen.
   ======================================================================== */

/* ============================== ALPHA VANTAGE: real monthly history ============================== */
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
  const j = await r.json();
  const h = parseAvJson(j);
  const st = statsFromMatrix(h.matrix);
  // WHERE IT CAME FROM AND HOW OLD IT IS. `_osl` is stamped by av.mjs: "live"
  // straight off Alpha Vantage, "cache" inside the seven-day TTL, "cache-stale"
  // when the upstream call failed and a month-old answer was served instead.
  // The screen prints this, so seasonality can never look fresher than it is.
  const meta = j._osl || {};
  const provenance = meta.source === "cache" ? "Alpha Vantage (cached)"
    : meta.source === "cache-stale" ? "Alpha Vantage (cached, upstream unavailable)"
    : "Alpha Vantage";
  // ONE SERIES, ONE NUMBER OF YEARS. The header said "10y history" while the
  // panel beside it said "11y" about the same numbers: the ten-year cutoff in
  // `parseAvJson` lands mid-year, so the matrix carries eleven CALENDAR YEARS
  // of which the first and last are partial. `st.years` is the count of rows
  // and it is the only figure any screen may print.
  return {
    ...st, matrix: h.matrix, from: h.from,
    src: `${provenance} · ${st.years}y`,
    provenance, at: meta.at || Date.now(), cached: meta.source !== "live",
    upstreamError: meta.upstreamError || null,
  };
}

/* ---- WHY A MARKET IS STILL ON THE HAND-WRITTEN TABLE ----
   `SEASONAL` in engine.js is hand-written and carries the heaviest of the four
   weights. Measured against 195 months of real data for CORN it has the WRONG
   SIGN on eight months of twelve — June reads +1.5 against a real ten-year mean
   of -3.46, September -1.1 against a real +1.03 — so the Radar has been calling
   CORN bearish in a month that is historically positive. It survives ONLY as a
   fallback now, and a fallback that will not say why it is in use is
   indistinguishable from a measurement. "Estimate" is not a reason. */
const seasonalFallbackNote = (state) => {
  const st = state || {};
  if (st.loading) return "the real history is loading";
  if (st.error) return `the price history did not load — ${st.error}`;
  return "the real price history has not been requested yet";
};
const seasonalSourceLine = (entry, state) => entry
  ? `${entry.src}${entry.upstreamError ? ` — Alpha Vantage refused the refresh (${entry.upstreamError}), so this is the last good answer` : ""}`
  : `hand-written estimate: ${seasonalFallbackNote(state)}`;

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
  // THE SIZE GOES IN QTY, THE SHAPE GOES IN THE RATIOS (src/order.js).
  // Alpaca refuses leg ratios that share a factor — 422 / 42210000,
  // "GCD[5 5] = 5" — so a five-lot vertical is five of a 1:1 combination.
  const body = orderBody({ legs, occs: legs.map((l) => l.occ), userQty: 1, type: "market", tif: "day", intent: "open" });
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent("/v2/orders")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // The status and the body are the diagnosis; they travel with the error
    // so the sentence on screen can carry them (`alpacaErrorText`).
    const text = await r.text();
    const e = new Error(alpacaErrorText({ status: r.status, body: text }));
    e.status = r.status; e.body = text;
    throw e;
  }
  return r.json();
}

/* ============================== STRATEGY PRESETS ============================== */
const SENTIMENTS = [
  // GLYPHS THAT EXIST EVERYWHERE. These were ⭡ / ⭣ (U+2B61, U+2B63), a
  // Unicode block Android has no font for: the buttons rendered as empty boxes
  // on a phone, which is where this app gets demoed. U+2191 / U+2193 are the
  // same arrows ARROW in signals.js already uses, and they are in every font.
  { id: "verybear", label: "Very Bear", color: T.redDeep, icon: "↓↓", tgt: -0.08 },
  { id: "bear", label: "Bear", color: T.red, icon: "↓", tgt: -0.04 },
  { id: "neutral", label: "Neutral", color: T.mut, icon: "→", tgt: 0 },
  { id: "bull", label: "Bull", color: T.green, icon: "↑", tgt: 0.04 },
  { id: "verybull", label: "Very Bull", color: T.greenDeep, icon: "↑↑", tgt: 0.08 },
];
// se c'è la chain reale, gli strike vengono agganciati ai più vicini disponibili
function snapStrike(x, strikes, step) {
  if (!strikes || !strikes.length) return Math.round(x / step) * step;
  return strikes.reduce((best, k) => (Math.abs(k - x) < Math.abs(best - x) ? k : best), strikes[0]);
}
export function buildPresets(sent, S, step, strikes) {
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
  // bid and ask travel with the leg, not just the mid they were averaged into:
  // `priceability()` in rules.js has to be able to see that the bid on a leg we
  // would be BUYING is zero, which a mid can never show — half of a placeholder
  // ask looks exactly like a price. A leg priced from the model carries no
  // bid at all, and undefined there means unknown, never zero.
  if (quote && quote.mid != null) return { px: quote.mid, iv: quote.iv || smileIV(baseIV, S, leg.strike), real: true, occ: quote.occ, oi: quote.oi, vol: quote.vol, bid: quote.bid, ask: quote.ask };
  const iv = smileIV(baseIV, S, leg.strike);
  return { px: bsPrice(S, leg.strike, dte / 365, iv, leg.type), iv, real: false };
}
/** The two-sided quotes behind an analysis, one per leg, for `priceability()`. */
const quotesOf = (a) => (a?.legPx || []).map((l) => ({ bid: l.bid, ask: l.ask }));
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
export function analyze(legs, S, dte, baseIV, q) {
  const legPx = legs.map((l) => priceLeg(l, S, dte, baseIV, q));
  const ivMap = legPx.map((p) => p.iv);
  const entry = legs.reduce((a, l, i) => a + Math.sign(l.side) * l.qty * legPx[i].px, 0);
  const realCount = legPx.filter((p) => p.real).length;
  const lo = S * 0.7, hi = S * 1.3, N = 240;
  let maxP = -Infinity, maxL = Infinity;
  const curve = []; const bes = []; let prev = null; let prevS = null;
  // THE SAME CONVENTION `payoffBands()` USES (src/visuals.jsx): a P&L of exactly
  // zero is not a profit, it is your money back. Two screens that split the sign
  // differently produce two breakevens for one trade, which is the fault below.
  const signOf = (v) => (v > 0 ? 1 : -1);
  for (let i = 0; i <= N; i++) {
    const s = lo + (i / N) * (hi - lo);
    const pnl = (payoffExp(legs, s) - entry) * 100;
    const pnlMid = (scenarioValue(legs, s, dte / 2, baseIV, ivMap) - entry) * 100;
    const pnlNow = (scenarioValue(legs, s, Math.max(0.5, dte), baseIV, ivMap) - entry) * 100;
    curve.push({ s: +s.toFixed(2), exp: +pnl.toFixed(0), mid: +pnlMid.toFixed(0), now: +pnlNow.toFixed(0) });
    if (pnl > maxP) maxP = pnl;
    if (pnl < maxL) maxL = pnl;
    // THE BREAKEVEN IS INTERPOLATED, NOT THE MIDDLE OF THE STEP IT FELL IN.
    // The expiry payoff is piecewise linear, so the crossing inside a bracket is
    // exact arithmetic rather than an estimate — and the grid step here is 0.051
    // of a dollar, which is how the Shortlist came to say BOIL makes money above
    // $20.67 while Build and its chart said 20.68 about the same trade. Both are
    // now the same string because both are the same calculation.
    if (prev !== null && signOf(prev) !== signOf(pnl)) {
      const t = prev === pnl ? 0.5 : prev / (prev - pnl);
      bes.push(+(prevS + t * (s - prevS)).toFixed(2));
    }
    prev = pnl; prevS = s;
  }
  // NO CEILING MEANS NO MAXIMUM, NOT A MAXIMUM AT THE EDGE OF THE GRID
  // (`payoffCeiling()` in src/rules.js). `maxP` above is the largest payoff
  // SAMPLED; for a long call that is simply the payoff at +30%, and printing it
  // as the best case is the same lie as printing an unreadable debit as $0.
  //
  // The loss side is deliberately left alone. Non-negotiable rule 2 is that the
  // maximum loss is always known, and the only way this grid understates a loss
  // is an uncovered short call — which the risk gate refuses by name
  // (UNDEFINED_RISK) before any order can be built on it.
  const ceiling = payoffCeiling(legs);
  return {
    entry, curve,
    maxProfit: ceiling.above ? maxP : null,
    profitUnbounded: !ceiling.above,
    sampledMaxProfit: maxP,   // for drawing only — never a figure on screen
    maxLoss: maxL, breakevens: bes,
    greeks: netGreeks(legs, S, dte, baseIV, ivMap), realCount, legPx,
  };
}

/**
 * The preset list for one direction, split by the quality floors (src/rules.js).
 *
 * Pure, and module-level, so the Shortlist cannot apply a different floor from
 * the one the wizard applies: both call `qualityFloor()` with the open interest
 * that came back on the legs. What is filtered out travels WITH the result —
 * `cut` carries the name and the reason — because a list that silently
 * shortens itself is indistinguishable from a broken one.
 */
export function shortlistWithFloors(sent, S, step, strikes, dte, baseIV, q, { peers = null, level = RECOMMENDED_LIQUIDITY } = {}) {
  const rows = [], cut = [];
  let oiSkipped = false;
  const tally = { liquidity: 0, spread: 0, reward: 0, skipped: 0, spreadSkipped: 0, unpriceable: 0, impossible: 0 };
  for (const p of buildPresets(sent, S, step, strikes)) {
    const a = analyze(p.legs, S, dte, baseIV, q);
    // UNPRICEABLE FIRST, because it is prior to both floors: they judge a
    // structure, and this asks whether there is a structure to judge. A leg
    // nobody bids for or a net of about nothing means the numbers below —
    // reward-to-risk, the maximum loss, how many contracts fit the budget —
    // would all be arithmetic on a placeholder. It is never rendered.
    const pz = priceability({ legs: p.legs, quotes: quotesOf(a), net: a.entry, maxLoss: a.maxLoss });
    if (!pz.priceable) {
      tally.unpriceable++;
      cut.push({ name: p.name, reasons: pz.reasons, why: "unpriceable" });
      continue;
    }
    // AND A WORST CASE THAT IS A PROFIT, in the same register and at the same
    // point in the order (src/rules.js, `impossibleLoss`). This is the debt
    // PR #14 wrote down and left open: the wizard already skipped it, the
    // Shortlist ranked it. An arbitrage on these chains is a mispriced leg, and
    // a mispriced leg is not a candidate.
    const imp = impossibleLoss(a.maxLoss);
    if (imp) {
      tally.impossible++;
      cut.push({ name: p.name, reasons: [imp], why: "impossible" });
      continue;
    }
    // The two-sided quotes go in as well now: the SPREAD floor reads them, and
    // it is a different question from the headcount the liquidity floor asks.
    // A leg can have 300 contracts open and a market 145% of the mid wide.
    const qf = qualityFloor({
      openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level,
      quotes: quotesOf(a),
      maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
    });
    if (!qf.liquidity.checked) { oiSkipped = true; tally.skipped++; }
    if (!qf.spread.checked) tally.spreadSkipped++;
    if (qf.pass) rows.push({ p, a });
    else {
      // WHICH FLOOR DID THE WORK, in the order they are applied. Pooling them
      // would leave the screen unable to say whether the leg was untraded or
      // simply unpriced, which are different faults with different answers.
      const why = !qf.liquidity.pass ? "liquidity" : !qf.spread.pass ? "spread" : "reward";
      tally[why]++;
      cut.push({ name: p.name, reasons: qf.reasons, why });
    }
  }
  return { rows, cut, oiSkipped, tally: { ...tally, kept: rows.length } };
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
  // THE CURRENT YEAR HAS NOT FINISHED ITS OWN WINDOW. A trade opened in
  // September and held for two months has no November yet, so this year's row
  // is a partial window sitting in a list of complete ones — and it is counted
  // in the win rate as if it were finished. It is excluded, and the screen says
  // so rather than quietly showing one row fewer than the years on the chart.
  const thisYear = new Date().getFullYear();
  for (const row of matrix) {
    const [y, ...ms] = row;
    if (+y === thisYear) continue;
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
  return { rows: out, winRate: wins / out.length, avg: out.reduce((a, b) => a + b.pnl, 0) / out.length,
    excludedYear: matrix.some((r) => +r[0] === thisYear) ? thisYear : null };
}

/* ============================== 3D DATA da chain reale ============================== */
function oiGridFromChain(chain, S) {
  // Open interest is not in every source: an Alpaca snapshot carries the quote,
  // the greeks and the IV, but not how many contracts are open. A grid of zeros
  // would draw an empty chart under a sentence explaining where buyers cluster,
  // which is the app describing something it cannot see. No OI, no panel.
  if (!chain || !hasOpenInterest(chain)) return null;
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
// `capital` and `concurrentTarget` start NULL, not at the suggested figures.
// A stored 5000 nobody typed is indistinguishable from a 5000 the user chose,
// and every screen downstream would print "$250 per trade" as his limit. Null
// means unanswered, `sizing()` reports `answered: false`, and the screens say
// "suggested" until he answers (PRD §3).
const EMPTY = { saved: [], positions: [], settings: { webhook: "", reportFreq: "weekly", reportLast: 0, reportLastMd: "", capital: null, concurrentTarget: null, savings: null, sizeOverride: null, mode: "pro", onboarded: false, notifyWhenReady: false }, seasonal: {}, journal: [], ivHist: {}, copilotLog: [] };
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
/* ============================== IS THE LIQUIDITY FLOOR RIGHT? ==============================
 *
 * The liquidity floor's two numbers were chosen from a handful of legs seen once in
 * a live walkthrough. That is evidence, not a measurement, and it cannot be
 * settled from inside the code: it needs chains nobody here can fetch. So the
 * app reports what it sees. This panel reads every chain the session has
 * loaded and prints the open interest those contracts actually carry, beside
 * the floor being applied to them.
 *
 * Two rows per market, because "every strike in the chain" and "the strikes a
 * trade is built from" are different populations, and only the second decides
 * whether the floor is sensible. It reports and never estimates: a feed with no
 * open interest is named as such rather than drawn as a row of zeros — the same
 * rule `qualityFloor()` applies when it skips.
 */
/* ---------------------------------------------------------------------------
 * THE LIQUIDITY FLOOR, AS A CONTROL RATHER THAN AN ASSERTION.
 *
 * The app recommends and the user decides. Three things this has to do, and it
 * is not the filter if it does not do all three:
 *
 *   SAY WHICH SETTING PRODUCED WHAT IS ON SCREEN, always and on the same screen
 *   as the list. A filtered list with no visible filter is a list that lies by
 *   omission about what it left out.
 *
 *   SHOW THE CONSEQUENCE AS IT MOVES. Each setting carries the count that
 *   setting produces — how many survive, and how many go for liquidity and how
 *   many for reward-to-risk — so moving the control is an experiment with a
 *   visible result rather than a guess.
 *
 *   NAME WHAT LOOSENING LETS BACK IN. Not "be careful": quotes on contracts
 *   nobody trades, in those words (`looseningWarning` in src/rules.js).
 *
 * It also prints the THRESHOLD IN CONTRACTS for the expiry on screen and says
 * which half of the floor bound — the chain's own distribution or the absolute
 * minimum underneath it. A relative floor that will not show its own arithmetic
 * is worse than the fixed number it replaced.
 * ------------------------------------------------------------------------- */
function LiquidityFilter({ levelId, onLevel, previews, threshold, ticker, expKey, peers, feed }) {
  const level = liquidityLevel(levelId);
  const [open, setOpen] = useState(null);
  // The strip is drawn at the panel's own width, so it fits a 390px phone and
  // grows on a desk screen rather than being cropped or letterboxed. The ref
  // goes on a wrapper that renders in EVERY state (see below): a ResizeObserver
  // handed a node that only exists once the data arrives observes nothing, and
  // the width stays at its fallback for the life of the component.
  const [wrapRef, panelW] = useWidth(320);
  const stripW = Math.max(180, panelW - 2);
  const here = previews?.[levelId];
  const warn = looseningWarning(level);
  const t = threshold;
  return (
    <Panel style={{ marginTop: 12 }}>
      <Lbl>LIQUIDITY FLOOR · YOUR SETTING, THE APP{"\u2019"}S RECOMMENDATION MARKED</Lbl>
      <div style={{ ...sansUI, fontSize: 13, color: T.body, lineHeight: 1.55, marginTop: 8 }}>
        A leg is judged against the other strikes on its own expiry, not against one number picked for every
        market: {RULES.minOpenInterestAbsolute} open contracts means one thing on a busy board and another on a
        quiet one. Underneath the relative test sits an absolute minimum, so a chain where nothing trades cannot
        pass itself by being uniformly empty.
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        {LIQUIDITY_LEVELS.map((l) => {
          const on = l.id === levelId;
          const col = l.id === "off" ? T.red : l.recommended ? T.green : T.blue;
          const pv = previews?.[l.id];
          return (
            <button key={l.id} onClick={() => onLevel(l.id)}
              style={{
                ...mono, fontSize: 11, padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                minHeight: 44, textAlign: "left", flex: "1 1 44%",
                background: on ? col : "transparent", color: on ? T.onAccent : col,
                border: `1.5px solid ${col}`, fontWeight: 700,
              }}>
              {l.label.toUpperCase()}{l.recommended ? " \u2713" : ""}
              <span style={{ display: "block", fontWeight: 400, fontSize: 9.5, marginTop: 2, opacity: 0.9 }}>
                {l.recommended ? "recommended \u00b7 " : ""}
                {pv ? `${pv.kept} of ${pv.total} shown` : "\u2014"}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ ...sansUI, fontSize: 12.5, color: T.mut, lineHeight: 1.5, marginTop: 10 }}>{level.blurb}</div>

      {/* THE FLOOR, DRAWN. Every CONTRACT on this expiry \u2014 calls and puts,
          which is twice the number of strikes \u2014 from the emptiest to the
          busiest, and the line where the setting above cuts. It sits directly
          under the buttons because the point is cause and effect: move the
          setting, watch the line move. Three paragraphs of prose could not
          explain this; the picture does it at a glance. */}
      {/* The wrapper is unconditional so the ResizeObserver has a node on mount;
          only its contents wait for the chain. */}
      <div ref={wrapRef} style={{ marginTop: 12 }}>
      {peers?.length > 0 && (
        <div>
          <OpenInterestStrip peers={peers} threshold={t?.threshold ?? 0} expKey={expKey}
            width={stripW} onExplain={setOpen} />
          <div style={{ ...sansUI, fontSize: 12.5, color: T.body, lineHeight: 1.5, marginTop: 6 }}>
            {oiStripTakeaway([...peers].sort((a, b) => a - b), t?.threshold ?? 0, { expKey })}
          </div>
          {open && (
            <div style={{ marginTop: 8, padding: "9px 11px", background: T.bg, border: `1px solid ${T.blue}55`, borderLeft: `3px solid ${T.blue}`, borderRadius: 8 }}>
              <div style={{ ...sansUI, fontSize: 12.5, color: T.body, lineHeight: 1.5 }}>
                {explainOiStrip(open, { threshold: t?.threshold ?? 0, cut: oiCutAt(peers, t?.threshold ?? 0), total: peers.length,
                  ghost: (t?.threshold ?? 0) > 0 ? null : oiGhostCut([...peers].sort((a, b) => a - b)).threshold })}
              </div>
              <button onClick={() => setOpen(null)} style={{ ...mono, fontSize: 10, marginTop: 6, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: 0 }}>close</button>
            </div>
          )}
        </div>
      )}
      </div>

      {/* THE CONSEQUENCE, LIVE. Not a promise about the setting: the count this
          setting produces on the list directly below it. */}
      <div style={{ ...mono, fontSize: 11, color: T.ink, marginTop: 8, lineHeight: 1.6, padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6 }}>
        {here
          ? `${here.kept} of ${here.total} structures on ${ticker} are shown at this setting` +
            `${here.liquidity ? ` \u00b7 ${here.liquidity} removed because a leg is too thinly traded` : ""}` +
            `${here.reward ? ` \u00b7 ${here.reward} removed for paying too little per dollar at risk` : ""}` +
            `${here.skipped ? ` \u00b7 ${here.skipped} not liquidity-checked at all \u2014 the open interest has not arrived, so those have not cleared this floor either` : ""}.`
          : `Nothing is priced on ${ticker} yet, so there is nothing for this setting to filter.`}
      </div>

      {/* THE ARITHMETIC, on the expiry actually on screen. */}
      <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
        {!(t && t.peers > 0)
          // NOT LANDED IS NOT PASSED. Alpaca snapshots carry `oi: null` on every
          // contract — all 26 of the tested expiry — and the count arrives later
          // from a separate trading-API call. Until it does the floor has
          // NOTHING TO JUDGE, and the sentence has to say that rather than
          // leaving a reader to assume the structures on screen cleared it.
          ? `${feed || "This feed"} has not reported open interest for ${ticker} ${expKey ? `on ${expKey}` : ""} yet, ` +
            `so the liquidity floor has NOTHING TO JUDGE: it was skipped, not passed. Nothing here was rejected ` +
            `for it and nothing here has cleared it. The count arrives from a separate call to the broker's ` +
            `contract list and is patched in when it lands \u2014 missing data is not evidence that nobody trades these.`
          : level.percentile <= 0 && level.absolute <= 0
            ? `Nothing on ${expKey} was removed for liquidity at this setting. ${feed || "The feed"} prices ${t.peers} contracts there \u2014 every call and every put \u2014 and every one of them is on offer, whatever is open on it.`
            : t.basis === "relative"
              ? `On ${expKey} that works out at ${t.threshold} open contracts per leg \u2014 the ${ordinal(level.percentile * 100)} percentile of the ${t.peers} contracts ${feed || "the feed"} prices there.`
              : `On ${expKey} the ${t.absolute}-contract absolute minimum is what binds: ${
                  t.relative == null
                    ? `only ${t.peers} contract${t.peers === 1 ? "" : "s"} there report open interest, too few to take a percentile of`
                    : `the ${ordinal(level.percentile * 100)} percentile of the ${t.peers} contracts there is only ${t.relative}`}.`}
      </div>

      {warn && (
        <div style={{ ...sansUI, fontSize: 12.5, color: T.red, marginTop: 10, lineHeight: 1.55, padding: "9px 11px", background: `${T.red}0f`, border: `1px solid ${T.red}66`, borderRadius: 6 }}>
          <AlertTriangle size={13} style={{ verticalAlign: "-2px", marginRight: 5 }} />{warn}
        </div>
      )}

      <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
        {liquidityMeasurementNote()}
      </div>
    </Panel>
  );
}

function OpenInterestReadout({ chains, floor, percentile = 0, level }) {
  const rows = Object.entries(chains || {})
    .map(([tk, c]) => ({ tk, feed: feedName(c) || "the feed", p: oiProfile(c, { floor, percentile }) }))
    .filter((r) => r.p);
  if (!rows.length) return null;
  const num = (x) => (x == null ? "\u2014" : String(Math.round(x)));
  const pct = (x) => (x == null ? "\u2014" : `${Math.round(x * 100)}%`);
  const reporting = rows.filter((r) => r.p.reports);
  const th = { padding: "4px 8px" };
  return (
    <Panel style={{ marginTop: 10 }}>
      <Lbl>3 · WHAT THESE CHAINS ACTUALLY CARRY — IS THIS THE RIGHT FLOOR?</Lbl>
      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 8, lineHeight: 1.6 }}>
        {`The floor in force rejects a leg below the ${ordinal(percentile * 100)} percentile of its own expiry, and never accepts one under ${floor} open contracts. Whether those are the right numbers is a question about real chains, not about the code, so here is what the ${rows.length === 1 ? "one chain" : "chains"} loaded in this session ${rows.length === 1 ? "contains" : "contain"}. The row that matters is `}
        <b>near the money</b>{" (within 10% of spot): that is where these structures get built."}
      </div>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ ...mono, fontSize: 10.5, borderCollapse: "collapse", minWidth: 420, width: "100%" }}>
          <thead>
            <tr style={{ color: T.dim, textAlign: "right" }}>
              <th style={{ ...th, textAlign: "left", paddingLeft: 0 }}>MARKET</th>
              <th style={{ ...th, textAlign: "left" }}>CONTRACTS</th>
              <th style={th}>MEDIAN OI</th>
              <th style={th}>90th</th>
              <th style={th}>MAX</th>
              <th style={th}>{ordinal(percentile * 100)}</th>
              <th style={{ ...th, paddingRight: 0 }}>CLEAR {floor}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ tk, feed, p }) => (p.reports ? (
              <React.Fragment key={tk}>
                <tr style={{ borderTop: `1px solid ${T.line}`, textAlign: "right" }}>
                  <td style={{ padding: "5px 8px 5px 0", textAlign: "left", color: T.ink, fontWeight: 700 }}>{tk}</td>
                  <td style={{ padding: "5px 8px", textAlign: "left", color: T.amber }}>near the money ({p.near.count})</td>
                  <td style={{ padding: "5px 8px", color: T.ink }}>{num(p.near.median)}</td>
                  <td style={{ padding: "5px 8px", color: T.mut }}>{num(p.near.p90)}</td>
                  <td style={{ padding: "5px 8px", color: T.mut }}>{num(p.near.max)}</td>
                  <td style={{ padding: "5px 8px", color: T.violet }}>{num(p.near.atPercentile)}</td>
                  <td style={{ padding: "5px 0 5px 8px", color: p.near.share >= 0.5 ? T.green : T.red }}>{pct(p.near.share)}</td>
                </tr>
                <tr style={{ textAlign: "right", color: T.dim }}>
                  <td style={{ padding: "0 8px 6px 0" }} />
                  <td style={{ padding: "0 8px 6px", textAlign: "left" }}>whole chain ({p.known})</td>
                  <td style={{ padding: "0 8px 6px" }}>{num(p.all.median)}</td>
                  <td style={{ padding: "0 8px 6px" }}>{num(p.all.p90)}</td>
                  <td style={{ padding: "0 8px 6px" }}>{num(p.all.max)}</td>
                  <td style={{ padding: "0 8px 6px" }}>{num(p.all.atPercentile)}</td>
                  <td style={{ padding: "0 0 6px 8px" }}>{pct(p.all.share)}</td>
                </tr>
              </React.Fragment>
            ) : (
              <tr key={tk} style={{ borderTop: `1px solid ${T.line}` }}>
                <td style={{ padding: "5px 8px 5px 0", color: T.ink, fontWeight: 700 }}>{tk}</td>
                <td colSpan={6} style={{ padding: "5px 8px", color: T.dim }}>
                  {`${feed} does not report open interest for these ${p.total} contracts — the floor is skipped, not failed.`}
                </td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
        {reporting.length === 0
          ? "No loaded feed reports open interest yet, so there is nothing here to judge the floor against. Open interest arrives after the chain, and only from the broker's contract list."
          : `Read it this way. The ${ordinal(percentile * 100)} column is what the RELATIVE half of the floor asks for on that set, and it moves with the market: where it sits above ${floor} the chain's own distribution is doing the work, and where it sits below, the ${floor}-contract minimum underneath is what bound. If "clear ${floor}" falls towards zero near the money on a market worth trading, the absolute minimum is too high for it. Every number here is a reported count, never an estimate. The floor's two numbers were set from exactly this reading, taken across all ${LIQUIDITY_MEASUREMENT.markets} chains on the ${LIQUIDITY_MEASUREMENT.asOf} close; /api/liquidity takes it again.`}
      </div>
    </Panel>
  );
}

const Stat = ({ k, v, c, tip }) => (
  <div>
    <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>{k}{tip && <span title={tip} style={{ cursor: "help", color: T.blue, marginLeft: 3 }}>ⓘ</span>}</div>
    <div style={{ ...mono, fontSize: 14, fontWeight: 700, color: c || T.ink }}>{v}</div>
  </div>
);
const Inp = (props) => (
  <input {...props} style={{ ...mono, background: T.bg, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 5, padding: "6px 8px", fontSize: 12, ...(props.style || {}) }} />
);
// "-$0" is not a smaller number than "$0": it is a figure the app could not
// read, wearing a minus sign. Round first, then decide the sign — same rule as
// `money()` in rules.js, which is where the reasoning lives.
const fmt$ = (x) => {
  if (x === Infinity || x === -Infinity || x == null || Number.isNaN(x)) return "—";
  const r = Math.abs(x).toFixed(0);
  return `${x < 0 && Number(r) > 0 ? "-" : ""}$${r}`;
};
/**
 * A BEST CASE, OR THE WORDS FOR NOT HAVING ONE.
 *
 * `fmt$(null)` is "—", and a dash where a maximum profit belongs reads as a
 * loading state or a bug. A payoff with no ceiling is neither: it is a fact
 * about the trade, and the screen says it in words (`NO_CEILING` in
 * src/rules.js, so the three words are written once).
 */
// No `Number(x)` here: `Number(null)` is 0 and 0 is finite, which would print
// a maximum profit of $0 for a payoff that has no maximum at all.
const ceil$ = (x) => (Number.isFinite(x) ? fmt$(x) : NO_CEILING);
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
  // open | questions | nothing. There is no "candidates" screen any more: the
  // roads the guided run produced are step 2 of the desk's own path, shown
  // beside every other candidate, so the guided door and the desk door walk
  // the same three steps.
  const [wizStep, setWizStep] = useState("open");
  const [nothing, setNothing] = useState(null);   // [{ id, text }] — why not today
  const [candidates, setCandidates] = useState([]); // screen 3: always two roads
  const [verdict, setVerdict] = useState([]);       // screen 3: what was examined, in English
  const [picked, setPicked] = useState(null);       // screen 4: the road taken
  // The gate's answer AFTER the tap on the Build screen's confirm step. A
  // refusal has to stay ON that screen with its reasons — a toast that scrolls
  // away is not an explanation.
  const [openResult, setOpenResult] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [tab, setTab] = useState("build");       // "build" | "positions" | "journal"
  /* ---- THE ONE NUMBERED PATH (src/path.js) ----
     The desk's first place is not a screen any more, it is three of them, and
     ONE is on screen at a time: 1 Radar (which markets have something today),
     2 Shortlist (the structures that survived, compared and saved), 3 Build
     (one trade taken apart). Radar and Shortlist used to be evidence panels
     that APPENDED to the Build page, which is why the desk read as one long
     page that only ever got longer. */
  const [step, setStep] = useState(FIRST_STEP);   // "radar" | "shortlist" | "build"
  const [ev, setEv] = useState(null);           // which evidence sheet is open OVER the step
  /* ---- comparing, on step 2 ----
     Up to three candidates, ticked from any of the three places that produce
     them (the guided roads, the per-market shortlist, the multi-market scan)
     and normalised into one shape by `candidateOf` so there is one comparison,
     not three. The list lives HERE and not inside the step, so walking forward
     to Build and back does not lose it. */
  const [compare, setCompare] = useState([]);
  const [compareNote, setCompareNote] = useState(null);
  const [showCompare, setShowCompare] = useState(false);
  // Did the candidates on screen come through the guided door? The roads and
  // the verdict are shown on the path itself, so the path has to know.
  const [guided, setGuided] = useState(null);   // { at, basket } | null
  const [showSettings, setShowSettings] = useState(false);
  const [ticker, setTicker] = useState("SOYB");
  const [chains, setChains] = useState({});      // ticker -> normalised chain (Alpaca, or CBOE as the net)
  const [seasonal, setSeasonal] = useState({});  // ticker -> {monthlyMean, sigma, matrix, years, src, at} from Alpha Vantage
  // WHY a market is not in `seasonal`: loading, or a named failure. A fallback
  // that cannot say why it is in use is indistinguishable from a measurement.
  const [seasonalState, setSeasonalState] = useState({});   // ticker -> { loading, error }
  // The loaders run in sequence across the basket and each one needs what the
  // previous one wrote; a state variable captured in a closure would still hold
  // the value from before the loop started, so the accumulating map lives in a
  // ref and `seasonal` is what the screen renders from.
  const seasonalRef = useRef({});
  const [news, setNews] = useState({});          // ticker -> items
  const [sentiment, setSentiment] = useState("bull");
  const [expKey, setExpKey] = useState(null);
  const [dteManual, setDteManual] = useState(45);
  const [legs, setLegs] = useState([]);
  const [stratName, setStratName] = useState("Bull Call Spread");
  const [store, setStore] = useState(EMPTY);
  /* ---- THE CAPITAL MODEL, PRD §3. ONE HOME, READ EVERYWHERE. ----
     Declared here, above everything that reads it, because everything does:
     the risk gate, the wizard's budget question, the Build screen's risk field,
     the Settings panel and every sentence that prints a dollar limit. The app
     used to carry two numbers for the same thing — a derived $250 and a
     hardcoded 500 in the Build field — and neither of them was the user's. */
  const capitalAnswers = useMemo(() => ({
    tradingCapital: store.settings.capital,
    concurrentTarget: store.settings.concurrentTarget,
    savings: store.settings.savings,
    override: store.settings.sizeOverride,
  }), [store.settings]);
  const limits = useMemo(() => sizing(capitalAnswers), [capitalAnswers]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [mc, setMc] = useState(null);
  const [bt, setBt] = useState(null);
  const [alpaca, setAlpaca] = useState(null);    // account info
  const [confirmSend, setConfirmSend] = useState(false);
  // THE COPILOT'S CONVERSATION LIVES HERE, not inside the panel. The panel is
  // an evidence panel: every other chip in the strip unmounts it, so state kept
  // inside it was destroyed on the next tap and an answer that landed while it
  // was shut never reached the screen at all.
  const [copilot, setCopilot] = useState({ msgs: [], busy: false, err: null, partial: "" });
  const [optMode, setOptMode] = useState("budget");
  // NOT a hardcoded 500. The field starts at the per-trade limit the capital
  // model derives and only holds a number of its own once the user types one,
  // so the Build screen and the wizard are incapable of disagreeing about how
  // much this user may risk.
  const [optAmtTyped, setOptAmt] = useState(null);
  const optAmt = optAmtTyped == null ? Math.round(limits.perTradeLimit) : optAmtTyped;
  const [autoMon, setAutoMon] = useState(true);
  const [optLeg, setOptLeg] = useState(null); // {occ, label, quote}
  const [alSync, setAlSync] = useState({ orders: [], positions: [], t: 0 });
  const [ta, setTa] = useState({}); // per ticker
  const [replay, setReplay] = useState(null);
  const [nf, setNf] = useState({ tk: "ALL", kind: "all", q: "", days: 7 });
  const [multi, setMulti] = useState({ sel: ["SOYB", "CORN", "UNG"], busy: false, res: null, err: null, dteT: 45, senMode: "auto" });
  // THE LIQUIDITY FLOOR IS A SETTING, NOT AN ASSERTION. The app recommends and
  // the user decides; every list filtered by it says which setting produced it,
  // and loosening it carries a warning naming what comes back (src/rules.js).
  const [liqLevelId, setLiqLevelId] = useState(RECOMMENDED_LIQUIDITY.id);
  // The guided run's narrative is folded to its first paragraph on arrival. It
  // is the last thing PR #12 handed forward that was code rather than access.
  const [verdictOpen, setVerdictOpen] = useState(false);
  const liqLevel = liquidityLevel(liqLevelId);
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
  // ONE SPOT, ONE HOME (src/chain.js, `spotOf`). The chain is the home because
  // it is the thing the trade is priced from; /api/liquidity also returns an
  // underlying price and read 20.22 seventeen seconds after the chain read
  // 20.19, and the app printed one PRICE NOW. That endpoint reports its own
  // reading for its own purpose and is never the price on screen.
  const spot = spotOf(chain);
  const spotAge = spotAt(chain);
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
      const c = await fetchChain(tk);
      setChains((m) => ({ ...m, [tk]: c }));
      // Open interest is not in an Alpaca snapshot. It IS in the broker's own
      // contract list, on the host /api/alpaca already proxies — but the quotes
      // are the product and this is a nice-to-have, so it is fired here, AFTER
      // the chain is on screen, and patched in when it lands. It has its own
      // short timeout, it swallows its own failure, and nothing waits for it.
      // The guard keeps a late answer from overwriting a fresher chain.
      if (!hasOpenInterest(c)) {
        enrichOpenInterest(tk, c)
          .then((withOI) => { if (withOI) setChains((m) => (m[tk] === c ? { ...m, [tk]: withOI } : m)); })
          .catch(() => { /* no open interest is a missing column, never a failed load */ });
      }
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

  /* ---- SEASONALITY, FOR EVERY MARKET IN THE BASKET ----
     This used to be one button for whichever ticker was on screen, and every
     other market scored on the hand-written table in engine.js — which is wrong
     on eight months of twelve for CORN. Seasonality is the heaviest of the four
     weights, so a market scored on the fallback is a market scored wrongly.

     The server caches for seven days (netlify/functions/av.mjs), which is what
     makes loading five markets affordable at all: Alpha Vantage's free tier is
     25 requests a DAY, so refetching per tab switch would exhaust the quota
     during a demo. Nothing here refetches an entry inside its budget.

     Failures are per-market and never fatal: one market that will not load
     leaves the other four on real data and itself on the table, SAYING SO. */
  const persistSeasonal = useCallback(async (s2) => {
    setSeasonal(s2);
    setStore((st0) => {
      const st = { ...st0, seasonal: Object.fromEntries(Object.entries(s2).map(([k, v]) => [k,
        { monthlyMean: v.monthlyMean, sigma: v.sigma, matrix: v.matrix, years: v.years, from: v.from,
          src: v.src, provenance: v.provenance, at: v.at, cached: v.cached, upstreamError: v.upstreamError }])) };
      saveState(st);
      return st;
    });
  }, []);

  /** One market. `force` ignores the freshness budget (the manual button). */
  const loadSeasonalFor = useCallback(async (tk, { force = false } = {}) => {
    if (!force && !isStale("seasonal", seasonalRef.current[tk]?.at)) return seasonalRef.current[tk];
    setSeasonalState((m) => ({ ...m, [tk]: { loading: true, error: null } }));
    try {
      const h = await fetchHistory(tk);
      const s2 = { ...seasonalRef.current, [tk]: h };
      seasonalRef.current = s2;
      await persistSeasonal(s2);
      setSeasonalState((m) => ({ ...m, [tk]: { loading: false, error: null } }));
      return h;
    } catch (e) {
      // The REASON is kept, not just the failure: the screen has to be able to
      // say why this market is on the fallback table. It is also RETURNED, not
      // only stored — a caller that reads it back out of `seasonalState`
      // straight after awaiting this gets the value from before the render and
      // reports "the call did not land" over the top of the real cause.
      const why = String(e.message || e);
      setSeasonalState((m) => ({ ...m, [tk]: { loading: false, error: why } }));
      return { error: why };
    }
  }, [persistSeasonal]);

  /** The whole basket, one at a time so five calls are not five at once. */
  const loadSeasonalBasket = useCallback(async ({ force = false } = {}) => {
    const todo = force ? BASKET : BASKET.filter((tk) => isStale("seasonal", seasonalRef.current[tk]?.at));
    if (!todo.length) return;
    // One at a time, and a market that fails does not stop the next: four
    // markets on real data and one saying why it is not is a far better screen
    // than five on a table that is wrong eight months out of twelve.
    for (const tk of todo) await loadSeasonalFor(tk, { force });
  }, [loadSeasonalFor]);

  /** The manual button on the History panel: this market, now, budget ignored. */
  const loadSeasonal = async () => {
    setBusy("av"); setMsg(null);
    const h = await loadSeasonalFor(ticker, { force: true });
    setMsg(h && !h.error
      ? `${ticker}: seasonality worked out from ${h.years} years of real prices (${h.provenance}).`
      : `Could not load the ${ticker} price history — ${h?.error || "the call did not land"}. ` +
        `${ticker} stays on the hand-written estimate until it does, and the Build screen says so.`);
    setBusy(null);
  };

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
      // The ref is what the sequential loaders accumulate into; restoring only
      // the state would make the first fetch overwrite everything saved.
      if (st.seasonal) { seasonalRef.current = st.seasonal; setSeasonal(st.seasonal); }
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
      // SEASONALITY FOR THE WHOLE BASKET, AFTER the chains are on screen.
      // It is the heaviest of the four weights and the hand-written table it
      // falls back to is wrong on eight months of twelve for CORN, so every
      // market needs the real series — but nothing waits for it, and the
      // seven-day server cache is what makes five calls affordable against a
      // 25-a-day quota. `store.seasonal` is already restored above, so on a
      // second visit inside the budget this fetches nothing at all.
      loadSeasonalBasket().catch(() => { /* per-market failures are reported per market */ });
      } finally { setHydrated(true); }
    })();
  }, [refreshChain, loadSeasonalBasket]);

  /* ---- WHICH EXPIRY THE APP OPENS ON ----
     The rule and its reasoning live in `expiryChoice()` in rules.js. What used
     to be here was "the first expiry between 35 and 60 days out", which on BOIL
     picked 2026-10-09 — 2 of its 7 near-the-money contracts clear the floor,
     against 12 of 14 on the expiry a week earlier. The Shortlist then said
     nothing cleared while the Radar said four structures did, and both were
     telling the truth about different boards.

     The floor used to rank the expiries is the one in force, so moving the
     liquidity setting moves the choice — which is the honest behaviour: the
     question "which board can I build on" has no answer independent of what
     counts as buildable. */
  const expiryOptions = useMemo(() => {
    if (!chain?.expirations) return [];
    return chain.expirations.map((e) => ({
      key: e, dte: chain.byExp[e]?.dte,
      ...nearMoneyOpenInterest(chain, e, { floor: liqLevel.absolute }),
    }));
  }, [chain, liqLevel]);
  const expChoice = useMemo(() => expiryChoice(expiryOptions), [expiryOptions]);
  useEffect(() => {
    if (chain && !expKey) {
      // Never nothing: with no eligible expiry at all the app still opens on
      // the board the feed gave it rather than showing an empty screen, and
      // the risk gate refuses the entry by name (ENTRY_DTE) if it is too near.
      setExpKey(expChoice.chosen?.key || chain.expirations[0] || null);
    }
  }, [chain, expKey, expChoice]);
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
  // The Shortlist, already past the quality floors. Computed here rather than
  // inside the render so the filtered-out list and the rows come from one call.
  // Every known open-interest count on the expiry being shown: the peer set the
  // liquidity floor judges each leg against, so a strike is compared with its
  // own neighbours rather than with a number chosen for another market.
  const expiryOI = useMemo(() => (chain && expKey ? expiryOpenInterest(chain, expKey) : []), [chain, expKey]);
  const shortlist = useMemo(
    () => (spot
      ? shortlistWithFloors(sentiment, spot, U.step, expStrikes, dte, iv, q, { peers: expiryOI, level: liqLevel })
      : { rows: [], cut: [], oiSkipped: false, tally: { kept: 0, liquidity: 0, reward: 0, skipped: 0 } }),
    [sentiment, spot, U.step, expStrikes, dte, iv, q, expiryOI, liqLevel]);
  // WHAT EVERY SETTING WOULD DO TO THIS LIST, so moving the control shows its
  // own consequence instead of promising one. Four runs of a pure function over
  // eight presets: cheap, and the only honest way to label the buttons.
  const liqPreview = useMemo(() => {
    if (!spot) return null;
    const out = {};
    for (const l of LIQUIDITY_LEVELS) {
      const r = shortlistWithFloors(sentiment, spot, U.step, expStrikes, dte, iv, q, { peers: expiryOI, level: l });
      out[l.id] = { ...r.tally, total: r.rows.length + r.cut.length };
    }
    return out;
  }, [sentiment, spot, U.step, expStrikes, dte, iv, q, expiryOI]);
  const liqThreshold = useMemo(() => liquidityThreshold(expiryOI, liqLevel), [expiryOI, liqLevel]);
  // IS THIS BOARD'S OWN ARITHMETIC POSSIBLE? Not a floor and it filters nothing:
  // it is a statement about the whole expiry, and the honest response to a chain
  // that contradicts itself is to say so rather than to price off it silently.
  const monoNote = useMemo(() => {
    if (!chain || !expKey) return null;
    return monotonicityNote(monotonicityBreaks(chain, expKey), expKey);
  }, [chain, expKey]);
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
    setEv(h.ev);          // close the evidence sheet: it covers the trade
    setTab(h.tab);
    // Step 3. A hand-off is what "forward" means on this path: the selection
    // travels, the step changes with it, and Build is where it lands.
    setStep("build");
    if (h.loadChain) refreshChain(h.ticker);   // no chain, no price, no trade to show
    setScrollBuild((n) => n + 1);
  };

  /* ---- moving along the path ----
     One step is on screen at a time, and every step stays reachable: going back
     must not lose what was selected, so the selection lives in this component
     and the step is only which part of it is being shown. */
  const goStep = (id) => {
    setView("desk"); setTab(BUILD_TAB); setStep(id); setEv(null); setShowSettings(false);
    window.scrollTo?.({ top: 0 });
    refreshExpired();
  };

  /* ---- WHAT IS OUT OF DATE, AND NOTHING ELSE ----
     Every source has its own budget (src/freshness.js) and they are wildly
     different: quotes go stale in minutes, open interest is the previous
     session's close and cannot change during a day, and seasonality is monthly
     data behind a free quota of 25 requests A DAY across five markets.
     Refetching everything on arriving at a screen is how a demo runs out of
     quota half way through — and how the same open-interest number gets read
     forty times. `staleAmong` answers which of them actually need it. */
  const refreshExpired = useCallback(() => {
    const stale = staleAmong(["chain", "seasonal"], {
      chain: spotAt(chains[ticker]),
      seasonal: seasonalRef.current[ticker]?.at,
    });
    if (stale.includes("chain")) refreshChain(ticker, true);
    if (stale.includes("seasonal")) loadSeasonalFor(ticker).catch(() => { /* reported per market */ });
  }, [chains, ticker, refreshChain, loadSeasonalFor]);

  /* ---- comparing and keeping a candidate ----
     `candidateOf` normalises whatever produced it, so a guided road, a
     shortlist row and a multi-market hit are the same kind of thing here. */
  const tickCompare = (c) => {
    const r = toggleCompare(compare, c);
    setCompare(r.list); setCompareNote(r.note);
    if (r.changed && r.list.length < 2) setShowCompare(false);
  };
  const savedKeys = useMemo(
    () => new Set((store.saved || []).map((sv) => candidateKey(candidateFromSaved(sv) || {}))),
    [store.saved]);
  const isSaved = (c) => !!c && savedKeys.has(c.key);
  // Saving a candidate uses the mechanism positions and strategies already use:
  // the same `store.saved` array, the same hydration check, the same sync. A
  // second store for "things to come back to" would be a second thing to keep
  // correct for no reason.
  const saveCandidate = async (c) => {
    const item = savedFromCandidate(c);
    if (!item || isSaved(c)) return;
    const st = { ...store, saved: [...store.saved, item] };
    setStore(st); await saveState(st);
    setMsg(`${c.ticker} ${c.name} kept. It is at the bottom of this step, and with your saved strategies on the Positions screen.`);
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
    // The quotes travel with the proposal: the gate's priceability check can
    // then see a long leg nobody bids for, which a mid price hides by
    // construction (src/rules.js, `priceability`).
    const gLocal = gate({ ticker: tk, intent: "open", legs: lg, dte: d, contracts: 1,
      maxLoss: analysis?.maxLoss, maxProfit: analysis?.maxProfit,
      quotes: quotesOf(analysis), net: analysis?.entry }, LOCAL_BOOK);
    if (!gLocal.pass) return { ok: false, gate: gLocal };
    // ACCEPTED IS NOT OPENED. The reply is read once, here, and every
    // sentence about this position downstream is composed from that reading
    // (`orderOutcome` in src/order.js). With no broker order at all this is
    // the app's own book and "opened" is simply true.
    const outcome = alpacaOrder ? orderOutcome(alpacaOrder) : null;
    const working = !!(outcome && !outcome.filled);
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
      // WHAT THE BROKER ACTUALLY SAID, ON THE POSITION'S OWN RECORD. An
      // order can come back "accepted" with nothing bought (queued outside
      // market hours, or a limit at the mid of a wide market), and a
      // timeline that reads "Opened" over that reply is the app describing
      // a fill that has not happened.
      alpacaStatus: outcome ? outcome.status : null,
      alpacaFilled: outcome ? outcome.filled : null,
      timeline: [
        { t: Date.now(), type: "gate", text: `Risk gate — ${gateSummary(gLocal)}` },
        { t: Date.now(), type: "open", text: `${alpacaOrder ? `Alpaca order ${String(alpacaOrder.id).slice(0, 8)}… — ${outcome.headline} ` : ""}${working ? "Recorded" : "Opened"} with a ${pop0 != null ? (pop0 * 100).toFixed(0) + "%" : "n/a"} chance · volatility ${(ivAvg0 * 100).toFixed(0)}% · season ${seasM.toFixed(1)}%/mo${f ? ` · signal ${f.score > 0 ? "+" : ""}${f.score}/100 ${f.agreement}` : ""}` },
        { t: Date.now(), type: "plan", text: working
          ? `Exit plan frozen at entry — ${exitPlanSentence()} It starts counting when the order fills; it has not filled yet.`
          : `Exit plan frozen at entry — ${exitPlanSentence()}` },
        ...(clashInfo ? [{ t: Date.now(), type: "against", text: `Against ${clashInfo.n} of ${clashInfo.total} factors. Reason: "${(reason || "").trim()}"` }] : []),
      ],
    };
    const st = { ...store, positions: [...store.positions, pos] };
    setStore(st); await saveState(st);
    return { ok: true, gate: gLocal, pos, outcome };
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
    setOpenResult(r.gate);
    if (!r.ok) { setMsg(`Risk gate: position not opened. ${r.gate.violations.map((v) => v.message).join(" ")}`); return; }
    setAgainst({ reason: "" }); setPicked(null); setOpenResult(null);
    // "POSITION OPENED" IS NOT TRUE OF AN ACCEPTED ORDER. The live run came
    // back status "accepted", filled_qty 0 — queued outside market hours —
    // and the app announced a position and an exit plan over it. Filled,
    // partly filled and working are three sentences, and only the first
    // starts the plan. With no broker order this is the app's own paper
    // book, where "opened" is the whole of the truth.
    setMsg(r.outcome
      ? `${r.outcome.headline} ${r.outcome.startsExitPlan ? exitPlanSentence() : r.outcome.detail}`
      : `Position opened on the app's own paper book. ${exitPlanSentence()}`);
    // AN ORDER THAT IS STILL WORKING KEEPS THE SCREEN THAT EXPLAINS IT.
    // Jumping to Positions unmounts the ticket, and the ticket is where the
    // "working, not filled" answer and the price it is waiting at are written.
    // A fill has somewhere better to be: the position it just opened.
    if (!r.outcome || r.outcome.filled) setTab("positions");
  };
  /* ---- an analysis run in the Copilot panel is filed in the Journal ----
     The Journal's report already quoted "the copilot's read" while the runs
     from the panel left no trace at all, so the two documents described the
     same day differently. Kept LOCAL and capped: it is analysis text, it has no
     business in the shared /api/state blob, and an uncapped log would fill
     localStorage with essays. */
  const COPILOT_LOG_MAX = 20;
  const logAnalysis = useCallback(({ label, prompt, answer, ticker: tk }) => {
    setStore((st) => {
      const entry = { t: Date.now(), label, prompt, answer, ticker: tk || null };
      const ns = { ...st, copilotLog: [entry, ...(st.copilotLog || [])].slice(0, COPILOT_LOG_MAX) };
      saveState(ns);
      return ns;
    });
  }, []);

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
      // What the quality floors removed, so an empty or short result can say why.
      const cutFloors = { n: 0, liquidity: 0, spread: 0, reward: 0, unpriceable: 0, impossible: 0,
        markets: new Set(), oiSkipped: new Set(), spreadSkipped: new Set() };
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
        // The peer set for THIS expiry on THIS market: the floor is relative to
        // the chain it is judging, so each market is measured against itself.
        const peers = expiryOpenInterest(c, ek);
        for (const pr of buildPresets(sent, sp, getU(tk).step, strikes)) {
          const a = analyze(pr.legs, sp, d2, getU(tk).iv, qq);
          // A MISSING CEILING IS NOT A MISSING CANDIDATE. This guard used to
          // read `a.maxProfit <= 0`, and `null <= 0` is true in JavaScript, so
          // making the best case honestly unknown would have made every long
          // call disappear from the wide search without a word. Unbounded
          // candidates stay in; they are ranked last below, with a sentence.
          if (!a.profitUnbounded && (!Number.isFinite(a.maxProfit) || a.maxProfit <= 0)) continue;
          if (!Number.isFinite(a.maxLoss)) continue;
          // Unpriceable first, and by the same function as the other two
          // generation sites: a hit with no readable price is not a hit.
          const pz = priceability({ legs: pr.legs, quotes: quotesOf(a), net: a.entry, maxLoss: a.maxLoss });
          if (!pz.priceable) { cutFloors.unpriceable++; cutFloors.markets.add(tk); continue; }
          // ...and a worst case that is a profit, the same way (PR #14's debt).
          if (impossibleLoss(a.maxLoss)) { cutFloors.impossible++; cutFloors.markets.add(tk); continue; }
          // Same floors as the Shortlist and the wizard, from the same function.
          const qf = qualityFloor({
            openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level: liqLevel,
            quotes: quotesOf(a),
            maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
          });
          if (!qf.liquidity.checked) cutFloors.oiSkipped.add(tk);
          if (!qf.spread.checked) cutFloors.spreadSkipped.add(tk);
          if (!qf.pass) {
            cutFloors.n++; cutFloors.markets.add(tk);
            if (!qf.liquidity.pass) cutFloors.liquidity++;
            else if (!qf.spread.pass) cutFloors.spread++;
            else cutFloors.reward++;
            continue;
          }
          const ivA = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
          const pop = probProfit(a.curve, sp, ivA, d2) || 0;
          const unit = Math.abs(a.maxLoss);
          const n = Math.floor(optAmt / Math.max(1, a.entry >= 0 ? Math.abs(a.entry) * 100 : unit));
          if (n < 1) continue;
          out.push({ tk, sent, name: pr.name, legs: pr.legs, expKey: ek, dte: d2, a, pop, n, spot: sp,
            ev: a.profitUnbounded ? null : pop * a.maxProfit * n });
        }
      }
      // Ranking: valore atteso CORRETTO dal segnale a 4 fattori, e i CONFLICT in
      // fondo comunque (PRD §7). Le funzioni pure stanno in src/signals.js.
      const ranked = out.map((o) => {
        const pr = evProfile(o.pop, o.a.maxProfit, o.a.maxLoss);
        return withSignalRank({ ...o, ev100: pr ? pr.ev100 : -999, tag: pr?.tag }, fz[o.tk], sentimentDirection(o.sent));
      }).sort(compareCandidates);
      setMulti((m) => ({ ...m, busy: false, res: ranked.slice(0, 8),
        floors: {
          n: cutFloors.n, liquidity: cutFloors.liquidity, spread: cutFloors.spread, reward: cutFloors.reward,
          unpriceable: cutFloors.unpriceable, impossible: cutFloors.impossible,
          markets: [...cutFloors.markets], oiSkipped: [...cutFloors.oiSkipped],
          spreadSkipped: [...cutFloors.spreadSkipped], level: liqLevel,
        } }));
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
      // NO CEILING, NO TAKE-PROFIT LEVEL. `0.5 * null` is 0 in JavaScript, so
      // without this the replay would "take profit" at break-even on every path
      // and report a discipline the rule never asked for. The DTE exit below
      // still runs: that half of the plan does not need a maximum.
      const tpLevel = Number.isFinite(A.maxProfit) ? RULES.takeProfitPct * A.maxProfit : null;
      if (!closed && tpLevel != null && pnl >= tpLevel) { closed = { i, pnl: tpLevel, why: takeProfitLabel() }; note += ` → TAKE PROFIT: ${takeProfitLabel()} hit: you take the profit`; }
      else if (!closed && pnl <= RULES.stopLossPct * A.maxLoss) { closed = { i, pnl: RULES.stopLossPct * A.maxLoss, why: stopLossLabel() }; note += ` → STOP: ${stopLossLabel()}: a warning, think about closing`; }
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
      const res = orderOutcome(o);
      setMsg(`Order sent to your Alpaca paper account · id ${o.id?.slice(0, 8)}… · ${res.headline} ${res.detail}`);
    } catch (e) { setMsg(`The order was not sent: ${alpacaErrorText(e)}`); }
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
      // What the quality floors threw out, and where. Counted per reason so the
      // refusal can name the floor: "nothing on CORN clears the liquidity floor
      // today" is a useful answer, an empty screen is not.
      const floors = { liquidity: 0, spread: 0, reward: 0, unpriceable: 0, impossible: 0,
        markets: new Set(), oiUnavailable: new Set(), spreadUnavailable: new Set() };
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
        const peers = expiryOpenInterest(c, ek);
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
            // A road has to have a ceiling: the verdict compares two roads on
            // what each pays, and a best case that is unknown cannot be one side
            // of that comparison. Every multi-leg preset this flow builds is
            // call-neutral, so this is a guard rather than a filter — but it is
            // the honest guard now, not `maxProfit <= 0` reading a null as zero.
            if (a.profitUnbounded || !Number.isFinite(a.maxProfit) || a.maxProfit <= 0) continue;
            if (!Number.isFinite(a.maxLoss)) continue;
            // UNPRICEABLE BEFORE ANYTHING ELSE (src/rules.js). A road whose
            // price the app cannot read is not a cheap road: every number the
            // verdict would put on it — what you risk, what it pays, how it
            // ranks against the other road — divides by that price.
            const pz = priceability({ legs: pr.legs, quotes: quotesOf(a), net: a.entry, maxLoss: a.maxLoss });
            if (!pz.priceable) { floors.unpriceable++; floors.markets.add(tk); continue; }
            // A WORST CASE THAT IS A PROFIT IS COUNTED AND NAMED, not skipped in
            // silence. This flow already dropped `maxLoss >= 0` with the rest of
            // the arithmetic guards above, which meant the one refusal the user
            // most deserves to read never reached the screen (PR #14's debt).
            if (impossibleLoss(a.maxLoss)) { floors.impossible++; floors.markets.add(tk); continue; }
            const ivA = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
            const pop = probProfit(a.curve, sp, ivA, d2) || 0;
            const unit = Math.abs(a.maxLoss);
            if (unit > ans.risk) continue;   // it does not fit the budget: not a road
            // THE QUALITY FLOORS (src/rules.js). A structure that clears every
            // other rule can still be a price on a contract nobody trades, or a
            // ticket that pays $15 for $86 at risk. Neither becomes a road, and
            // the tally below is what lets the refusal screen say WHICH floor
            // emptied the board rather than shrugging at an empty page.
            const qf = qualityFloor({
              openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level: liqLevel,
              quotes: quotesOf(a),
              maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
            });
            if (!qf.liquidity.checked) floors.oiUnavailable.add(tk);
            if (!qf.spread.checked) floors.spreadUnavailable.add(tk);
            if (!qf.pass) {
              if (!qf.liquidity.pass) floors.liquidity++;
              else if (!qf.spread.pass) floors.spread++;
              else floors.reward++;
              floors.markets.add(tk);
              continue;
            }
            const pr2 = evProfile(pop, a.maxProfit, a.maxLoss);
            pool.push({
              tk, sent, pr, a, pop, unit, ek, spot: sp, dte: d2,
              ev100: pr2 ? pr2.ev100 : -999, rr: rewardRisk(a.maxProfit, a.maxLoss),
              risk: unit, fused: r.fused,
            });
          }
        }
      }
      if (!examined.length) return stop([{ id: "no-chain", text: NOTHING_TODAY.noData(basket.join(", ")) }]);

      // 5) Nothing fits: a real answer, and WHICH real answer matters. A board
      // emptied by the quality floors is a different sentence from a board
      // emptied by the budget, and the user is owed the one that is true.
      if (!pool.length) {
        const cut = floors.liquidity + floors.spread + floors.reward;
        // AN UNREADABLE PRICE IS ITS OWN ANSWER. A board where nothing could be
        // priced is not a board emptied by the floors and is certainly not a
        // budget problem — saying either would blame the user, or the market,
        // for a chain the app could not read. Three refusals, three sentences.
        if (floors.unpriceable > 0 && cut === 0 && floors.impossible === 0) {
          return stop([{
            id: "unpriceable",
            text: NOTHING_TODAY.unpriceable({ unpriceable: floors.unpriceable, markets: [...floors.markets] }),
          }]);
        }
        // A BOARD THE APP PRICED AND THEN DISBELIEVED. Different from a board it
        // could not price, and further still from one the floors emptied: here
        // the quotes were read and what they produced — a trade that cannot lose
        // — is impossible. Four refusals, four sentences.
        if (floors.impossible > 0 && cut === 0 && floors.unpriceable === 0) {
          return stop([{
            id: "impossible-loss",
            text: NOTHING_TODAY.impossibleLoss({ impossible: floors.impossible, markets: [...floors.markets] }),
          }]);
        }
        if (cut > 0 || floors.impossible > 0 || floors.unpriceable > 0) {
          return stop([{
            id: "quality-floor",
            text: NOTHING_TODAY.belowQualityFloor({
              liquidity: floors.liquidity, spread: floors.spread, reward: floors.reward,
              unpriceable: floors.unpriceable,
              impossible: floors.impossible, markets: [...floors.markets], level: liqLevel,
            }),
          }]);
        }
        return stop([{ id: "budget", text: NOTHING_TODAY.budgetTooSmall(ans.risk) }]);
      }

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
        floors: { liquidity: floors.liquidity, spread: floors.spread, reward: floors.reward,
          unpriceable: floors.unpriceable, impossible: floors.impossible,
          markets: [...floors.markets], oiUnavailable: [...floors.oiUnavailable],
          spreadUnavailable: [...floors.spreadUnavailable] },
      }));

      setTicker(first.tk); setExpKey(first.ek);
      setWiz((w) => ({ ...w, busy: false }));
      setCandidates(roads);
      setPicked(null); setOpenResult(null);
      /* THE GUIDED DOOR FEEDS THE SAME PATH (PRD §12).
         It used to jump from the three questions straight to two roads, which
         is the middle of the path with the macro view skipped: the user never
         saw which markets were looked at, only the answer. It now lands on
         step 1 with what was examined in front of it — the roads are on step 2
         where every other candidate is, and the walk is the same one whether
         the user came through the guided door or through the desk. */
      setGuided({ at: Date.now(), basket, roads: roads.length });
      setCompare([]); setShowCompare(false); setCompareNote(null);
      goStep("radar");
    } catch (e) { setWiz((w) => ({ ...w, busy: false, err: String(e.message || e) })); }
  };

  /* ---- screen 3 → screen 4. Taking a road loads it on Build too, so
     "open it on the Build screen and change it" is one tap away from the refusal. */
  /* ---- taking a road LANDS ON BUILD (PRD §5).
     It used to jump straight to a confirm page carrying a send button, so the
     guided flow could reach an order without ever passing the screen where the
     trade can be looked at. The road now loads onto Build and the confirm step
     is the bottom of that screen: one route to an order, and it runs through
     the place that shows the chain, the legs and the greeks. */
  const pickRoad = (c) => {
    setPicked(c); setOpenResult(null);
    setView("desk");
    // `openOnBuild` is the one hand-off: it carries the trade, closes the
    // evidence sheet, loads the chain if it is missing, moves the path to
    // step 3 and scrolls the trade into view.
    openOnBuild({ ticker: c.ticker, expKey: c.expKey, legs: c.legs, name: c.name });
    setStratName(c.name);
  };



  const setNotify = async (on) => {
    const st = { ...store, settings: { ...store.settings, notifyWhenReady: on } };
    setStore(st); await saveState(st);
  };

  /* ---- profilo strategia: EV per $100 a rischio + etichetta onesta ---- */
  const evProfile = (pop, maxProfit, maxLoss) => {
    if (pop == null || !Number.isFinite(maxProfit) || !Number.isFinite(maxLoss) || maxLoss >= 0) return null;
    const risk = Math.abs(maxLoss);
    // Nothing divides by a risk the app could not read. `rewardRisk()` is the
    // one place that judgement is made, and everything here divides by `risk`.
    const rr = rewardRisk(maxProfit, maxLoss);
    if (rr == null) return null;
    const ev = pop * maxProfit - (1 - pop) * risk;
    const ev100 = (ev / risk) * 100;
    // ONE ROUNDING, from rules.js: the phrase is derived from the same whole
    // percent every CHANCE on screen prints, so a card cannot say "75%" beside
    // "8 times in 10" about two different roundings of one number.
    const tag = pop >= 0.6 ? { t: "WINS OFTEN", c: T.green, d: `works out about ${chanceInTen(pop)}, for a smaller gain` }
      : pop < 0.45 && rr >= 2 ? { t: "WINS BIG", c: T.violet, d: `works out about ${chanceInTen(pop)}, but pays ${rr.toFixed(1)}× what you risk` }
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
    return gate({ ticker, intent: "open", legs, dte, contracts: 1, maxLoss: A.maxLoss, maxProfit: A.maxProfit,
      quotes: quotesOf(A), net: A.entry }, LOCAL_BOOK);
  }, [A, gate, legs, dte, ticker]); // eslint-disable-line


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
    return { tk, name: u.name, spot: c?.spot ?? null, seasonalScore, score, sugg, real: !!seasonal[tk],
      // ONE SERIES, ONE NUMBER OF YEARS. The header said "10y history" and the
      // panel beside it said "11y" about the same numbers: the ten-year cutoff
      // lands mid-year, so the matrix holds eleven calendar years of which the
      // first and last are partial. `years` is the row count and the only
      // figure any screen prints.
      years: seasonal[tk]?.years ?? null, hasChain: !!c,
      fused: f, conflict: f?.agreement === "CONFLICT", agreement: f?.agreement, signalScore: f?.score ?? 0, confidence: f?.confidence ?? 0 };
  }).sort((a, b) => (a.conflict !== b.conflict ? (a.conflict ? 1 : -1) : b.score - a.score)), [chains, seasonal, fused]);

  /* ---- what the last search found in each market ----
     The Radar's job is to say which markets have something and which do not,
     and "do not" has to carry its reason: a row with nothing on it is the empty
     screen this app is not allowed to show. Roads from the guided run and hits
     from the multi-market search are counted together, because to the person
     reading the row they are the same fact — something cleared the floors here. */
  const marketFacts = useMemo(() => {
    const m = {};
    const touch = (tk) => (m[tk] = m[tk] || { n: 0, roads: 0, best: null, cut: false, oiSkipped: false, exps: new Set() });
    // WHICH EXPIRY THE COUNT IS ABOUT. Radar said "4 cleared" at 28 DTE while
    // the Shortlist said none at 35 DTE, and on screen that read as the app
    // contradicting itself. Both were true; neither said which board it meant.
    // A count with no expiry beside it is not a fact the user can act on.
    for (const c of candidates) {
      const f = touch(c.ticker); f.n++; f.roads++;
      if (c.expKey) f.exps.add(c.expKey);
      if (!f.best) f.best = { legs: c.legs, entryNet: c.entryNet, spot: c.spot };
    }
    for (const r of (multi.res || [])) {
      const f = touch(r.tk); f.n++;
      if (r.expKey) f.exps.add(r.expKey);
      if (!f.best) f.best = { legs: r.legs, entryNet: r.a.entry, spot: r.spot };
    }
    for (const tk of (multi.floors?.markets || [])) touch(tk).cut = true;
    for (const tk of (multi.floors?.oiSkipped || [])) touch(tk).oiSkipped = true;
    for (const tk of (multi.floors?.spreadSkipped || [])) touch(tk).spreadSkipped = true;
    for (const k of Object.keys(m)) m[k].expiries = [...m[k].exps].sort();
    return m;
  }, [candidates, multi.res, multi.floors]);

  /* ============================== RENDER ============================== */
  // The old "Today" tab is gone: what needs attention today is the wizard's
  // front page now (PRD §5), so keeping a second copy behind a flag would just
  // be two screens that can disagree about the same positions.
  // THE PATH IS THE FIRST PLACE, and it is three steps rather than one page:
  // 1 Radar (every market), 2 Shortlist (the structures that survived), 3 Build
  // (one trade taken apart). Positions and the Journal are the other two places.
  // Settings sits behind the gear, not in the row.
  //
  // Radar and Shortlist used to be EVIDENCE panels appended to the Build page.
  // They are steps now, because they are not evidence for a trade — they are
  // how you arrive at one, and each of them is a decision of its own.
  const OTHER_PLACES = [
    { id: "positions", label: "Positions", I: Briefcase },
    { id: "journal", label: "Journal", I: FileText },
  ];
  // What is left IS evidence: it answers a question about the step in front of
  // you, at any step, and it opens OVER that step (src/steps.jsx) rather than
  // making the page longer.
  const EVIDENCE = [
    { id: "why", label: "Why this market", I: Radar, sub: "seasonality, price trend, weather, news" },
    { id: "levels", label: "Market levels", I: Box, sub: "where the open interest sits" },
    { id: "history", label: "History", I: FlaskConical, sub: "what happened in past years" },
    { id: "copilot", label: "Copilot", I: MessageSquare, sub: "ask about this trade" },
  ];
  const EV_META = Object.fromEntries(EVIDENCE.map((e) => [e.id, e]));
  const SENT = SENTIMENTS.find((s) => s.id === sentiment);

  /* ---------- the shell (PRD §5) ----------
     Everything above is the app's brain. What follows decides which face it
     shows: setup on a first run, the wizard by default, the tabs on request. */

  const goHome = () => { setView("wizard"); setWizStep("open"); setNothing(null); };
  /* Leaving the wizard for the desk lands on a STEP of the path — `goStep`
     above. `ev` is cleared every time: a sheet left open from a previous visit
     covers whatever the button promised to show. */
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
            onDesk={() => goStep("radar")}
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
        {wizStep === "nothing" && (
          <NothingToday
            reasons={nothing || []} notified={!!store.settings.notifyWhenReady}
            hasPositions={store.positions.length > 0}
            onNotify={() => setNotify(true)}
            onBack={() => setWizStep("questions")}
            onPositions={() => { setView("desk"); setTab("positions"); }}
            onDesk={() => goStep("radar")}
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
          {/* The feed is named in ONE place (feedName in chain.js) and every label
              reads from it. This one used to say "(CBOE)" three centimetres under a
              badge that said "Alpaca (indicative)": a screen contradicting itself
              about where its own numbers came from. */}
          {/* AND HOW OLD IT IS. A stale number is acceptable; a stale number
              pretending to be live is not — "NOW" is a claim, and it has to be
              one the screen can back up (src/freshness.js). */}
          <Stat k={`PRICE NOW${feedName(chain) ? ` (${feedName(chain).toUpperCase()})` : ""}`} v={spot ? `$${spot.toFixed(2)}` : "—"}
            c={spot && isStale("chain", spotAge) ? T.amber : undefined}
            tip={freshnessNote("chain", spotAge, { what: "this price" })} />
          <Stat k="EXPIRY" v={expKey ? `${expKey} · ${dte} DTE` : `${dte} DTE (model)`} c={T.blue} />
          <Stat k={`SEASONALITY ${MONTHS[NOW_MONTH].toUpperCase()}`} v={`${seas.monthlyMean[NOW_MONTH] > 0 ? "+" : ""}${seas.monthlyMean[NOW_MONTH].toFixed(1)}%`} c={seas.monthlyMean[NOW_MONTH] > 0 ? T.green : T.red} />
          {/* A MARKET ON THE FALLBACK SAYS WHY. `SEASONAL` in engine.js is
              hand-written and wrong on eight months of twelve for CORN, and it
              carries the heaviest of the four weights. "Estimate" is not a
              reason; "the call failed" and "nobody asked yet" are. */}
          <Stat k="SEASONAL SOURCE" v={seasonal[ticker] ? seas.src : "hand-written estimate"}
            c={seasonal[ticker] ? (seasonalState[ticker]?.error ? T.amber : T.green) : T.amber}
            tip={`${seasonalSourceLine(seasonal[ticker], seasonalState[ticker])} · ${freshnessNote("seasonal", seasonal[ticker]?.at)}`} />
          <Stat k="IV RANK" v={ivRank ? (ivRank.rank != null ? `${ivRank.rank}` : `${ivRank.collecting}d collected`) : "—"}
            c={ivRank?.rank != null ? (ivRank.rank >= 60 ? T.red : ivRank.rank <= 40 ? T.green : T.mut) : T.dim}
            tip="Where today's option prices sit against their own past year (0 = cheapest ever, 100 = dearest). High means selling premium pays better; low means buying options is good value. The history builds up with one refresh a day." />
        </div>

        {msg && <div style={{ ...mono, fontSize: 11.5, color: T.amber, border: `1px solid ${T.amber}44`, background: `${T.amber}10`, borderRadius: 6, padding: "7px 10px", marginTop: 10 }}>{msg}</div>}

        <TabBoundary k={`${tab}/${step}/${ev}`}>
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

        {/* THE PATH: three numbered steps, one on screen at a time. The nav
            says what each step is carrying, because "back" has to be visibly
            free — the selection lives above these screens, so walking back and
            forward again cannot lose it. */}
        <StepNav step={tab === "build" && !showSettings ? step : null}
          carry={stepCarry({ ticker, trade: legs.length ? `${ticker} · ${stratName}` : null, compare: compare.length })}
          onStep={goStep} />

        {/* The other two places. A place is somewhere you go and stay; the three
            steps above are one place walked through in order. */}
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {OTHER_PLACES.map(({ id, label, I }) => {
            const on = tab === id && !showSettings;
            return (
              <button key={id} onClick={() => { setTab(id); setShowSettings(false); setEv(null); }}
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

        {/* THE EVIDENCE, at every step, opening OVER it. A chip that is doing
            something, or holding something you have not read, says so on the
            chip itself: the copilot answering into a closed sheet was
            indistinguishable from the copilot doing nothing at all. */}
        {tab === "build" && !showSettings && (
          <EvidenceBar items={EVIDENCE} open={ev} onOpen={setEv}
            mark={{
              copilot: copilot.busy ? "thinking"
                : (ev !== "copilot" && copilot.msgs.length > 0
                  && copilot.msgs[copilot.msgs.length - 1].role === "assistant") ? "answer ready" : null,
            }} />
        )}

        {/* The sheet itself. Every panel below renders inside it, so opening one
            covers the step instead of lengthening it — and because it is fixed
            to the viewport it can never land below the fold, which is what made
            History and the Copilot look like broken buttons on a phone. */}
        {tab === "build" && !showSettings && ev && (
          <EvidenceOverlay title={EV_META[ev]?.label || "Evidence"} sub={EV_META[ev]?.sub} onClose={() => setEv(null)}>
            {ev === "why" && (
              <WhyThisTrade
                fused={fused[ticker]}
                ticker={ticker} weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
                title={`WHY THIS MARKET · ${ticker}`} defaultDetail
                note={fused[ticker]?.agreement === "CONFLICT"
                  ? "Candidates on a CONFLICT market rank last wherever they appear, whatever their expected value."
                  : "The Radar and the Shortlist both rank candidates on expected value adjusted by this read."}
              />
            )}
            {ev === "levels" && (
              <>
                <Lbl>WHERE THE MARKET IS POSITIONED (OPEN INTEREST)</Lbl>
                {!oiGrid && <div style={{ ...mono, fontSize: 12, color: T.mut, padding: 30, textAlign: "center" }}>
                  {!chain ? "Press Refresh at the top to load the prices first."
                    : !hasOpenInterest(chain) ? `Open interest is not part of the ${chain.source} feed. It is fetched separately from the broker\u2019s contract list, and that has not come back \u2014 so this panel has nothing to draw yet.`
                      : "Not enough strikes near today's price to draw this."}
                </div>}
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
                  {openInterestNote(chain)} Added up across the first six expiries within 120 days. A big wall is a price the market has an interest in defending — useful when picking strikes and exits.
                </div>
              </>
            )}
            {ev === "history" && !spot && (
              <div style={{ ...mono, fontSize: 12, color: T.mut }}>
                The seasonality chart, the 8,000-run simulation and the year-by-year replay are all drawn from {ticker}{"\u2019"}s own prices, and they have not loaded yet. Press Refresh at the top of the screen.
              </div>
            )}
            {ev === "history" && spot && (
            <div style={{ marginTop: 12 }}>
              <Panel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>SEASONALITY {seasonal[ticker] ? `· ${seas.src}` : "(ESTIMATE — load the real history)"}</Lbl>
                  <Btn small ghost color={T.blue} onClick={loadSeasonal} disabled={busy === "av"}>
                    <RefreshCw size={11} /> Refresh real seasonality
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
                      <Stat k="CHANCE OF PROFIT" v={chanceText(mc.pop)} c={mc.pop >= 0.5 ? T.green : T.red} tip="The share of simulated runs that finish in profit at expiry." />
                      <Stat k="AVERAGE RESULT" v={fmt$(mc.ev)} c={mc.ev >= 0 ? T.green : T.red} />
                      <Stat k="BAD CASE" v={fmt$(mc.p5)} c={T.red} tip="Only 1 run in 20 turns out worse than this." />
                      <Stat k="TYPICAL" v={fmt$(mc.p50)} />
                      <Stat k="GOOD CASE" v={fmt$(mc.p95)} c={T.green} tip="Only 1 run in 20 turns out better than this." />
                      <Stat k="YEARLY DRIFT" v={`${(mc.muAnn * 100).toFixed(1)}%`} c={T.blue} />
                    </div>
                    <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
                      <b style={{ color: T.ink }}>In plain words:</b> out of 8,000 simulated runs, {chancePct(mc.pop)} in 100 finish in profit.
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
                        {/* A YEAR WHOSE WINDOW HAS NOT FINISHED IS NOT A RESULT.
                            The current year was in this list and in the win rate
                            with a partial window — a trade opened in September
                            and held two months has no November yet. It is left
                            out, and left out OUT LOUD: a list quietly one row
                            shorter than the chart above it is the same silent
                            shortening the shortlist is not allowed either. */}
                        {bt.excludedYear && (
                          <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 6, lineHeight: 1.55 }}>
                            {bt.excludedYear} is not in this list: its {Math.max(1, Math.round(dte / 30))}-month
                            window from {MONTHS[NOW_MONTH]} has not finished yet, so counting it as a year that
                            worked or did not would be scoring a trade that is still open.
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 10 }}>
                        The year-by-year history unlocks once you load the real seasonality above.
                      </div>
                    )}
                    {replay && (
                      <div style={{ marginTop: 12, padding: "10px 12px", background: `${T.amber}0a`, border: `1px solid ${T.amber}44`, borderRadius: 7 }}>
                        <Lbl>WHAT WOULD HAVE HAPPENED IN {replay.year} · "{stratName}" OPENED IN {MONTHS[NOW_MONTH].toUpperCase()}</Lbl>
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
            {ev === "copilot" && (
              <CopilotTab
                apiKey={"server"}
                convo={copilot} setConvo={setCopilot} onAnalysis={logAnalysis}
                ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
              />
            )}
          </EvidenceOverlay>
        )}

        {/* ============ STEP 1 · RADAR — THE MACRO VIEW ============
             Which markets have something worth looking at today, and which do
             not and why. This was an evidence panel that appended to the Build
             page; it is a step now, because "which market" is a decision and a
             decision is not evidence for something else. */}
        {tab === "build" && !showSettings && step === "radar" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sansUI, fontSize: 19, fontWeight: 800, color: T.ink, marginTop: 4 }}>
              Step 1 — where is there something today?
            </div>
            {/* ONE LINE HERE, THE FULL SENTENCE WHERE IT HAS A REFERENT.
                `qualityFloorSentence()` was printed twice on this screen: once
                at the top, describing a filter applied to content that is not
                on screen yet, and again under the results where there is
                something for it to be about. The second one is kept. */}
            <div style={{ ...sansUI, fontSize: 14, color: T.mut, lineHeight: 1.55, marginTop: 4 }}>
              Every market in the basket, read by the four factors, and — once you search — what each one
              actually produced after the quality floors, at the {liqLevel.label.toUpperCase()} setting.
            </div>

            {/* What the guided run examined, in English. It used to sit on the
                verdict screen above the two roads; it belongs here, where the
                question is which market rather than which structure. */}
            {guided && verdict.length > 0 && (
              <Panel style={{ marginTop: 12 }}>
                <Lbl>WHAT I LOOKED AT · FROM YOUR ANSWERS</Lbl>
                {/* A FOLD IS NOT A DELETION. This narrative is the app saying
                    what it actually examined, so none of it is for cutting —
                    but on a 390px phone it is roughly two screens of text
                    standing between the user and the markets underneath it, and
                    a wall of prose at the top of a step reads as something to
                    scroll past rather than something to read. The first
                    paragraph stays; the rest opens on a tap that SAYS how much
                    is behind it, so nobody has to guess whether it is worth it. */}
                <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
                  {(verdictOpen ? verdict : verdict.slice(0, 1)).map((para, i) => (
                    <p key={i} style={{ ...sansUI, fontSize: 14, color: T.body, lineHeight: 1.6, margin: 0 }}>{para}</p>
                  ))}
                </div>
                {verdict.length > 1 && (
                  <button onClick={() => setVerdictOpen((v) => !v)}
                    style={{
                      ...mono, fontSize: 11, marginTop: 10, minHeight: 40, padding: "8px 12px", cursor: "pointer",
                      background: "transparent", color: T.blue, border: `1px solid ${T.blue}`, borderRadius: 6,
                      width: "100%", textAlign: "left", fontWeight: 700,
                    }}>
                    {verdictOpen
                      ? "\u2191 Show less"
                      : `\u2193 Read the rest \u2014 ${verdict.length - 1} more paragraph${verdict.length === 2 ? "" : "s"} on what was examined`}
                  </button>
                )}
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 8 }}>
                  {candidates.length} road{candidates.length === 1 ? "" : "s"} came out of it, and they are waiting on step 2.
                </div>
              </Panel>
            )}

            <Panel style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>EVERY MARKET · 4-FACTOR SIGNAL · {MONTHS[NOW_MONTH].toUpperCase()}</Lbl>
                <Btn small ghost onClick={async () => { setBusy("all"); for (const tk of BASKET) await refreshChain(tk, true); setBusy(null); setMsg("All markets refreshed."); }}>
                  <RefreshCw size={11} /> Refresh all
                </Btn>
              </div>
              <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                {/* THE BASKET, not every symbol in the table. SPY is there so
                    the desk can price a hedge; the path does not go looking for
                    it, and a row for it on the Radar reads as a sixth market to
                    trade (CLAUDE.md, the basket). */}
                {scan.filter((r) => BASKET.includes(r.tk)).map((r, i) => {
                  const sObj = SENTIMENTS.find((s) => s.id === r.sugg);
                  const f = marketFacts[r.tk] || { n: 0 };
                  const best = f.best || null;
                  return (
                    <div key={r.tk} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: T.bg, border: `1px solid ${ticker === r.tk ? T.amber : T.line}`, borderRadius: 7, flexWrap: "wrap" }}>
                      <span style={{ ...mono, fontSize: 11, color: T.dim, width: 18 }}>#{i + 1}</span>
                      {/* THE STRUCTURE, NOT THE UNDERLYING. The two visuals a
                          list row gets are the payoff thumbnail and the gauge,
                          and both are cut from ONE payoffBands() result so they
                          cannot disagree about the same trade. The candles stay
                          on Build, where there is room to read them. */}
                      {best && (() => {
                        const bb = payoffBands({ legs: best.legs, entryNet: best.entryNet, spot: best.spot });
                        return (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <BandThumbnail bands={bb} bars={barsCache[r.tk] || []} width={110} height={40}
                              title={bandTakeaway(bb, { ticker: r.tk })} />
                            <Gauge bands={bb} size={86} ticker={r.tk} />
                          </div>
                        );
                      })()}
                      <div style={{ flex: 1, minWidth: 150 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 14 }}>{r.tk} <span style={{ color: T.dim, fontWeight: 400, fontSize: 11 }}>{r.name}</span></div>
                        <div style={{ ...mono, fontSize: 10.5, color: T.mut }}>
                          seasonal {r.seasonalScore > 0 ? "+" : ""}{r.seasonalScore.toFixed(1)}%/mo {r.real ? `(${r.years}y history)` : "(hand-written estimate)"} · {r.spot ? `$${r.spot.toFixed(2)}` : "prices not loaded"}{ta[r.tk] ? ` · trend ${ta[r.tk].trend > 0 ? "↑" : ta[r.tk].trend < 0 ? "↓" : "→"} RSI ${ta[r.tk].rsi.toFixed(0)}` : ""}
                        </div>
                        {/* What the search actually found here. An empty market
                            NEVER appears as a blank row: it says which floor
                            emptied it, or that nobody has searched it yet. */}
                        <div style={{ ...mono, fontSize: 10.5, color: f.n > 0 ? T.green : f.cut ? T.amber : T.dim, marginTop: 2 }}>
                          {f.n > 0
                            ? `${f.n} structure${f.n === 1 ? "" : "s"} cleared the floors on ` +
                              `${(f.expiries || []).length ? (f.expiries || []).join(" and ") : "the expiry searched"}` +
                              `${f.roads ? ` · ${f.roads} of them a road from your answers` : ""}`
                            : f.cut
                              ? "nothing here cleared the quality floors today"
                              : "not searched yet — use the search below, or answer the three questions"}
                          {f.oiSkipped ? " · open interest unknown on this feed, so that floor was skipped" : ""}
                          {f.spreadSkipped ? " · only one side quoted on some legs, so the spread floor was skipped there" : ""}
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
                      <Btn small ghost={ticker !== r.tk} onClick={() => { switchTicker(r.tk); setSentiment(r.sugg); goStep("shortlist"); }}>
                        Look at {r.tk} →
                      </Btn>
                    </div>
                  );
                })}
              </div>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 10 }}>
The order weighs the 4-factor signal (seasonality, price trend, weather, news): CONFLICT markets stay last regardless. Tap the badge for the full narrative, or open Why this market above for the four readings and what is behind them. Seasonality is loaded for the whole basket from real monthly prices; a market still showing an estimate says why on the Build screen, and History has a button to fetch it now.
              </div>
            </Panel>

              <Panel style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>SEARCH SEVERAL MARKETS AT ONCE · WHAT SURVIVES THE FLOORS</Lbl>
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
                  {BASKET.map((tk) => (
                    <Btn key={tk} small ghost={!multi.sel.includes(tk)}
                      onClick={() => setMulti((m) => ({ ...m, sel: m.sel.includes(tk) ? m.sel.filter((x) => x !== tk) : [...m.sel, tk] }))}>
                      {tk}
                    </Btn>
                  ))}
                </div>
                {multi.err && <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8 }}>{multi.err}</div>}
                {multi.res && (
                  <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                    {/* An empty scan always says WHY. "Nothing fits your budget"
                        and "nothing here clears the quality floors" are
                        different answers, and the second one is the useful one. */}
                    {multi.res.length === 0 && (
                      <div style={{ ...mono, fontSize: 11.5, color: T.mut, lineHeight: 1.6 }}>
                        {multi.floors?.n
                          ? `Nothing on ${multi.floors.markets.join(", ")} clears the quality floors today — ${multi.floors.n} structure${multi.floors.n === 1 ? " was" : "s were"} built and filtered out. ${qualityFloorSentence(multi.floors.level || liqLevel)}`
                          : multi.floors?.unpriceable
                            ? unpriceableNote(multi.floors.unpriceable, multi.floors.markets.join(", "))
                            : multi.floors?.impossible
                              ? impossibleLossNote(multi.floors.impossible, multi.floors.markets.join(", "))
                              : "Nothing fits your budget on the markets you picked."}
                      </div>
                    )}
                    {multi.res.length > 0 && multi.floors?.n > 0 && (
                      <div style={{ ...mono, fontSize: 10, color: T.amber, lineHeight: 1.6 }}>
                        {multi.floors.n} structure{multi.floors.n === 1 ? "" : "s"} on {multi.floors.markets.join(", ")} did
                        not clear the quality floors and {multi.floors.n === 1 ? "is" : "are"} not listed. {qualityFloorSentence(multi.floors.level || liqLevel)}
                      </div>
                    )}
                    {/* WHAT COULD NOT BE PRICED AT ALL. Not a floor and not a
                        budget: a structure whose price the chain could not
                        give us is left out, and the count says so rather than
                        the list quietly being shorter. */}
                    {multi.floors?.unpriceable > 0 && (
                      <div style={{ ...mono, fontSize: 10, color: T.amber, lineHeight: 1.6 }}>
                        {unpriceableNote(multi.floors.unpriceable, multi.floors.markets.join(", "))}
                      </div>
                    )}
                    {/* AND WHAT COULD NOT LOSE. PR #14's debt: a structure
                        whose worst case priced as a profit used to be ranked
                        here as the best trade on the board. It is refused, and
                        the count travels separately from the floors' because
                        no floor did the work. */}
                    {multi.floors?.impossible > 0 && (
                      <div style={{ ...mono, fontSize: 10, color: T.red, lineHeight: 1.6 }}>
                        {impossibleLossNote(multi.floors.impossible, multi.floors.markets.join(", "))}
                      </div>
                    )}
                    {/* AND WHAT COULD NOT BE SCORED. An unbounded profit has no
                        expected value, so it sits last — said in words, because
                        a candidate at the bottom of a list with a dash where its
                        score should be looks broken rather than honest. */}
                    {(multi.res || []).some((r) => r.a?.profitUnbounded) && (
                      <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6 }}>
                        {noCeilingRankNote((multi.res || []).filter((r) => r.a?.profitUnbounded).length)}
                      </div>
                    )}
                    {multi.floors?.oiSkipped?.length > 0 && (
                      <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6 }}>
                        {liquiditySkippedNote(`the feed for ${multi.floors.oiSkipped.join(", ")}`)}
                      </div>
                    )}
                    {/* WHICH SETTING PRODUCED THIS SCAN. Not the setting in
                        force now: the one the scan actually ran at, because a
                        list produced at a different floor answers a different
                        question, and saying otherwise would be the same lie by
                        omission the filter exists to stop. */}
                    <div style={{ ...mono, fontSize: 10, color: isLoosened(multi.floors?.level || liqLevel) ? T.red : T.dim, lineHeight: 1.6 }}>
                      {liquiditySettingNote(multi.floors?.level || liqLevel, {
                        kept: multi.res.length, liquidity: multi.floors?.liquidity, reward: multi.floors?.reward,
                        unpriceable: multi.floors?.unpriceable,
                      })}
                      {(multi.floors?.level || liqLevel).id !== liqLevel.id
                        ? ` The setting has changed since this ran \u2014 search again to see it at ${liqLevel.label.toUpperCase()}.` : ""}
                    </div>
                    {looseningWarning(multi.floors?.level || liqLevel) && (
                      <div style={{ ...sansUI, fontSize: 12, color: T.red, lineHeight: 1.5 }}>
                        {looseningWarning(multi.floors?.level || liqLevel)}
                      </div>
                    )}
                    {multi.res.some((r) => r.conflict) && (
                      <div style={{ ...mono, fontSize: 10, color: T.red }}>
                        Candidates marked CONFLICT sit at the bottom by construction: the four factors contradict each other on that underlying, and no expected value is worth a signal we cannot read.
                      </div>
                    )}
                    {multi.res.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                        <span style={{ ...mono, fontSize: 10, color: T.dim, width: 16 }}>#{i + 1}</span>
                        {(() => {
                          const bb = payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot });
                          return (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <BandThumbnail bands={bb} bars={barsCache[r.tk] || []} width={130} height={34}
                                title={bandTakeaway(bb, { ticker: r.tk })} />
                              <Gauge bands={bb} size={80} ticker={r.tk} />
                            </div>
                          );
                        })()}
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
                        <Stat k="CHANCE" v={chanceText(r.pop)} c={r.pop >= 0.5 ? T.green : T.violet} />
                        {/* AN EXPECTED VALUE NEEDS A BEST CASE. With no ceiling
                            there is none, so nothing is printed here and the
                            candidate sits last by construction (its rank is the
                            -999 `evProfile()` returns) rather than being scored
                            off the edge of a sampling grid. */}
                        <Stat k="EV/$100" v={r.a.profitUnbounded ? "—" : `${r.ev100 >= 0 ? "+" : ""}$${r.ev100.toFixed(0)}`}
                          c={r.a.profitUnbounded ? T.dim : r.ev100 >= 0 ? T.green : T.red}
                          tip={r.a.profitUnbounded ? noCeilingNote(`${r.tk} ${r.name}`) : undefined} />
                        <Stat k="RANK" v={r.a.profitUnbounded ? "last" : `${r.rank >= 0 ? "+" : ""}${r.rank.toFixed(0)}`} c={r.conflict ? T.red : T.amber} />
                        <Stat k="MAX TOT" v={r.a.profitUnbounded ? NO_CEILING : fmt$(r.n * r.a.maxProfit)} c={T.green} />
                        {/* A hit here hands the MARKET to step 2, where the
                            structures on it are compared and kept. Radar
                            answers "which market"; the Shortlist answers
                            "which structure", and jumping from here straight
                            to Build would skip the second question. */}
                        <Btn small ghost={ticker !== r.tk} onClick={() => { switchTicker(r.tk); setSentiment(r.sent); setExpKey(r.expKey); goStep("shortlist"); }}>
                          Look at {r.tk} →
                        </Btn>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

            <StepForward
              label={`See the shortlist for ${ticker} \u2192`}
              sub={`Step 2 is every structure that clears the floors on ${ticker} today, where up to ${MAX_COMPARE} of them can be put side by side.`}
              onClick={() => goStep("shortlist")} />
          </div>
        )}

        {/* ============ STEP 2 · SHORTLIST — THE CANDIDATES THAT SURVIVED ============
             What clears the quality floors on the market carried from step 1,
             plus the roads the guided run produced. Up to three of them can be
             put side by side, and any of them kept for later. */}
        {tab === "build" && !showSettings && step === "shortlist" && !spot && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.mut }}>
              The shortlist is built out of real {ticker} contracts, and they have not loaded yet. Press Refresh
              at the top of the screen, or go back to step 1 and pick a market whose prices are in.
            </div>
            <div style={{ marginTop: 10 }}><Btn small ghost onClick={() => goStep("radar")}>← Back to step 1</Btn></div>
          </Panel>
        )}

        {tab === "build" && !showSettings && step === "shortlist" && spot && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sansUI, fontSize: 19, fontWeight: 800, color: T.ink, marginTop: 4 }}>
              Step 2 — which structure, on {ticker}?
            </div>
            <div style={{ ...sansUI, fontSize: 14, color: T.mut, lineHeight: 1.55, marginTop: 4 }}>
              Everything below already clears the quality floors. Tick up to {MAX_COMPARE} to see them on one
              picture, keep any of them for later, and take one to step 3 when you have chosen.
            </div>

            {/* THE ROADS FROM THE GUIDED RUN, on the step where candidates live.
                This is the same verdict screen the guided flow used to jump to,
                with its narrative moved to step 1: what was examined is a
                question about markets, what to do about it is a question about
                structures, and they are now on the steps that ask them. */}
            {candidates.length > 0 && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: `${T.violet}0d`, border: `1px solid ${T.violet}44`, borderRadius: 8 }}>
                <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.violet }}>
                  FROM YOUR ANSWERS · {candidates.length} ROAD{candidates.length === 1 ? "" : "S"}
                </div>
                <WizardCandidates
                  candidates={candidates} answers={wiz} narrative={[]}
                  barsFor={(tk) => barsCache[tk] || []}
                  weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
                  onPick={pickRoad}
                  onBack={() => { setView("wizard"); setWizStep("questions"); }}
                  actionsFor={(c) => {
                    const cand = candidateOf(c, { source: "road" });
                    return (
                      <CandidateActions
                        ticked={inCompare(compare, cand)} onTick={() => tickCompare(cand)}
                        saved={isSaved(cand)} onSave={() => saveCandidate(cand)} />
                    );
                  }}
                />
              </div>
            )}

            <Panel style={{ marginTop: 12 }}>
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
                        These are every expiry {feedName(chain) || "the feed"} lists for {ticker} — this ETF only has monthly ones, it is not a limit of the app.
                      </div>
                    )}
                    {/* WHY THIS EXPIRY, AND WHAT WAS PASSED OVER. The app used
                        to pick by distance from a target DTE alone and land on
                        the deadest board on the market without a word about it
                        (src/rules.js, `expiryChoice`). When a nearer, busier
                        expiry is refused by the 30-day entry floor, the screen
                        says so — a rule the user cannot see is a rule they
                        cannot trust. */}
                    <div style={{ ...mono, fontSize: 9, color: T.mut, marginTop: 4, maxWidth: 260, lineHeight: 1.55 }}>
                      {expiryChoiceNote(expChoice, liqLevel)}
                    </div>
                    {/* AND WHETHER THIS BOARD'S OWN PRICES AGREE WITH THEMSELVES.
                        A call cannot cost more than a call at a lower strike;
                        five of BOIL's 25 adjacent near-the-money pairs did. */}
                    {monoNote && (
                      <div style={{ ...mono, fontSize: 9.5, color: T.red, marginTop: 4, maxWidth: 260, lineHeight: 1.55 }}>
                        {monoNote}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Panel>

            {/* The four readings are EVIDENCE, and evidence opens over the step
                rather than lengthening it (PRD §12). The panel itself is
                unchanged and still the only copy — it moved, it was not cut. */}
            <button onClick={() => setEv("why")}
              style={{
                ...sansUI, width: "100%", textAlign: "left", marginTop: 10, padding: "10px 12px",
                background: T.panel, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.blue}`,
                borderRadius: 8, cursor: "pointer", minHeight: 52,
              }}>
              <span style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.blue }}>WHY THIS MARKET · {ticker}</span>
              <span style={{ display: "block", fontSize: 13.5, color: T.body, marginTop: 3, lineHeight: 1.5 }}>
                {fused[ticker]
                  ? `${fused[ticker].agreement} · ${fused[ticker].score > 0 ? "+" : ""}${fused[ticker].score}/100 with ${fused[ticker].confidence} confidence — open the four readings, the weather regions and the headlines behind them.`
                  : "Open the four readings — seasonality, price trend, weather and news flow — and what is behind each one."}
              </span>
            </button>

            {/* THE FLOOR IS THE USER'S SETTING. It sits directly above the list
                it filters, because a filter written anywhere else is a filter
                the reader has to be told about rather than one they can see. */}
            <LiquidityFilter
              levelId={liqLevelId} onLevel={setLiqLevelId} previews={liqPreview}
              threshold={liqThreshold} ticker={ticker} expKey={expKey}
              peers={expiryOI} feed={feedName(chain)} />

            <Panel style={{ marginTop: 10 }}>
              <Lbl>2 · {SENT.label.toUpperCase()} STRATEGIES — {ticker} · PRICED FROM THE LIVE CHAIN</Lbl>
              {/* THE QUALITY FLOORS, before anything is drawn. A structure that
                  fails one is never rendered as an option — but the count of
                  what went and why is, because a list that silently shortens
                  itself teaches nothing and looks broken. */}
              {shortlist.cut.length > 0 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 8, lineHeight: 1.6, padding: "8px 10px", background: `${T.amber}0f`, border: `1px solid ${T.amber}44`, borderRadius: 6 }}>
                  {shortlist.cut.length} of {shortlist.cut.length + shortlist.rows.length} structures for this
                  direction are not shown{(() => {
                    // Three different facts, and the sentence says which one it
                    // is: a structure with no readable price never reached the
                    // floors, so reporting it as one they removed would credit
                    // them with work they did not do.
                    const un = shortlist.tally.unpriceable, floors = shortlist.cut.length - un;
                    if (un > 0 && floors > 0) return ` — ${un} could not be priced at all, and ${floors} did not clear the quality floors`;
                    if (un > 0) return ` — the price could not be read from the chain`;
                    return " because they did not clear the quality floors";
                  })()}:
                  <div style={{ marginTop: 4 }}>
                    {shortlist.cut.map((c) => <div key={c.name}>· {c.name} — {c.reasons[0]}</div>)}
                  </div>
                </div>
              )}
              {/* A price the app could not read is never drawn as $0. The count
                  is here instead, in the same register as the refusal screen. */}
              {shortlist.tally.unpriceable > 0 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 8, lineHeight: 1.6 }}>
                  {unpriceableNote(shortlist.tally.unpriceable, ticker)}
                </div>
              )}
              {/* AND A WORST CASE THAT CAME OUT AS A PROFIT. The debt PR #14
                  wrote down: the wizard skipped these, this list ranked them. */}
              {shortlist.tally.impossible > 0 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 8, lineHeight: 1.6 }}>
                  {impossibleLossNote(shortlist.tally.impossible, ticker)}
                </div>
              )}
              {/* AND WHAT HAS NO CEILING. Kept, shown, and named — never scored. */}
              {shortlist.rows.some(({ a }) => a.profitUnbounded) && (
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
                  {noCeilingRankNote(shortlist.rows.filter(({ a }) => a.profitUnbounded).length)}
                </div>
              )}
              {/* AN EMPTY LIST NAMES THE EXPIRY IT EMPTIED. "Nothing clears"
                  read as a verdict on the market while the Radar, looking at a
                  different board, said four structures had cleared — both true,
                  and together they read as a contradiction. `emptyExpiryNote()`
                  in rules.js carries the counts and the expiry in one sentence. */}
              {shortlist.rows.length === 0 && (
                <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8, lineHeight: 1.6 }}>
                  {emptyExpiryNote(expKey, shortlist.tally, liqLevel)} That is an answer about {ticker} on this
                  board, not an empty screen: {qualityFloorSentence(liqLevel)}
                </div>
              )}
              {shortlist.oiSkipped && (
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8, lineHeight: 1.6 }}>
                  {liquiditySkippedNote(feedName(chain))}
                </div>
              )}
              {shortlist.tally.spreadSkipped > 0 && (
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
                  {spreadSkippedNote(feedName(chain))}
                </div>
              )}
              {shortlist.tally.spread > 0 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 6, lineHeight: 1.6 }}>
                  {wideSpreadNote(shortlist.tally.spread, `${ticker} ${expKey || ""}`.trim())}
                </div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {shortlist.rows.map(({ p, a }) => {
                  // `rewardRisk()` and never a division here: a ratio taken
                  // against a max loss the app could not read printed
                  // "6748644041614687.00" on BOIL. Below the minimum it is "—".
                  const rr = rewardRisk(a.maxProfit, a.maxLoss);
                  const ivAvg = a.legPx.reduce((x, y) => x + y.iv, 0) / Math.max(1, a.legPx.length);
                  const pop = probProfit(a.curve, spot, ivAvg, dte);
                  // One shape for everything that can be compared or kept
                  // (src/path.js), so a road, a shortlist row and a
                  // multi-market hit are the same kind of thing here.
                  const bands = payoffBands({ legs: p.legs, entryNet: a.entry, spot });
                  const cand = candidateOf({ name: p.name, legs: p.legs, a, pop, dte, expKey },
                    { ticker, spot, sigma: seas.sigma, source: "shortlist" });
                  return (
                    <div key={p.name} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>
                          {p.name}{" "}
                          <span style={{ ...mono, fontSize: 9, color: a.realCount === p.legs.length ? T.green : T.amber }}>
                            {a.realCount === p.legs.length ? "● live prices" : `◐ ${a.realCount}/${p.legs.length} live`}
                          </span>
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 4 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")}
                      </div>
                      {/* The thumbnail says where the trade pays against where
                          the market has been; the gauge says the same thing as
                          one arc with the needle on today. Both are cut from
                          the same bands, so they cannot disagree. */}
                      <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <BandThumbnail bands={bands} bars={barsCache[ticker] || []} width={220} height={40}
                          title={bandTakeaway(bands, { ticker })} />
                        <Gauge bands={bands} size={128} ticker={ticker} />
                      </div>
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                        <Stat k={a.entry >= 0 ? "YOU PAY" : "YOU RECEIVE"} v={fmt$(Math.abs(a.entry) * 100)} />
                        <Stat k="MAX PROFIT" v={ceil$(a.maxProfit)} c={T.green}
                          tip={a.profitUnbounded ? noCeilingNote(p.name) : undefined} />
                        <Stat k="MAX LOSS" v={fmt$(a.maxLoss)} c={T.red} />
                        <Stat k="R/R" v={rr ? rr.toFixed(2) : "—"} c={T.amber} />
                        <Stat k="CHANCE" v={chanceText(pop)} c={pop >= 0.5 ? T.green : T.violet} />
                        <Stat k="BREAKEVEN" v={a.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                      </div>
                      {(() => {
                        const sc = scaleStrategy(a, optMode, optAmt);
                        if (!sc) return <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6 }}>Cannot scale this one (unlimited profit or no defined risk): judge it at a single contract.</div>;
                        if (sc.unpriceable) return <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 6 }}>✗ No quantity is shown: one of these prices at under {money(MIN_NET_DOLLARS)}, so there is no cost to divide your budget by.</div>;
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
                      <div style={{ marginTop: 8 }}>
                        <CandidateActions
                          ticked={inCompare(compare, cand)} onTick={() => tickCompare(cand)}
                          saved={isSaved(cand)} onSave={() => saveCandidate(cand)}
                          onBuild={() => applyPreset(p, a)} />
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* WHICH SETTING PRODUCED THIS LIST. On the same screen as the
                  list, in every state of it, including the empty one. */}
              <div style={{ ...mono, fontSize: 10, color: isLoosened(liqLevel) ? T.red : T.dim, marginTop: 10, lineHeight: 1.6 }}>
                {liquiditySettingNote(liqLevel, shortlist.tally)}
              </div>
              <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Budget is the most you will pay, taken from live {feedName(chain) || "market"} prices. For trades where you receive money up front, the limit becomes the capital tied up instead. Chance is the probability of ending in profit at expiry. {limits.answered ? "Your" : "The suggested"} per-trade limit: {money(limits.perTradeLimit)} ({perTradeCapLabel()}). {qualityFloorSentence(liqLevel)}</div>
            </Panel>

            {/* WHAT THE WIDE SEARCH FOUND ON THIS MARKET. The multi-market
                scan runs on step 1, where the question is which market; its
                hits for the market you carried in belong here, where the
                question is which structure. */}
            {(multi.res || []).filter((r) => r.tk === ticker).length > 0 && (
              <Panel style={{ marginTop: 10 }}>
                <Lbl>ALSO FOUND BY THE WIDE SEARCH ON {ticker}</Lbl>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {(multi.res || []).filter((r) => r.tk === ticker).map((r, i) => {
                    const cand = candidateOf({ name: r.name, legs: r.legs, a: r.a, pop: r.pop, dte: r.dte, expKey: r.expKey },
                      { ticker: r.tk, spot: r.spot, sigma: (seasonal[r.tk]?.sigma) || getU(r.tk).sigma, source: "wide search" });
                    const bands = payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot });
                    return (
                      <div key={`${r.name}-${i}`} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>{r.name}</div>
                        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>{legsLine(r.legs)} · {r.expKey} · {r.dte} DTE</div>
                        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                          <BandThumbnail bands={bands} bars={barsCache[r.tk] || []} width={200} height={40} title={bandTakeaway(bands, { ticker: r.tk })} />
                          <Gauge bands={bands} size={112} ticker={r.tk} />
                        </div>
                        <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                          <Stat k="CHANCE" v={chanceText(r.pop)} c={r.pop >= 0.5 ? T.green : T.violet} />
                          <Stat k="MAX PROFIT" v={ceil$(r.a.maxProfit)} c={T.green}
                            tip={r.a.profitUnbounded ? noCeilingNote(r.name) : undefined} />
                          <Stat k="MAX LOSS" v={fmt$(r.a.maxLoss)} c={T.red} />
                          <Stat k="EV/$100" v={r.a.profitUnbounded ? "—" : `${r.ev100 >= 0 ? "+" : ""}$${r.ev100.toFixed(0)}`}
                            c={r.a.profitUnbounded ? T.dim : r.ev100 >= 0 ? T.green : T.red} />
                        </div>
                        <div style={{ marginTop: 8 }}>
                          <CandidateActions
                            ticked={inCompare(compare, cand)} onTick={() => tickCompare(cand)}
                            saved={isSaved(cand)} onSave={() => saveCandidate(cand)}
                            onBuild={() => openOnBuild({ ticker: r.tk, expKey: r.expKey, legs: r.legs, name: r.name })} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}

            {/* KEPT FOR LATER — the same `store.saved` array the Build screen
                writes to, so there is one place saved things live. */}
            {(store.saved || []).length > 0 && (
              <Panel style={{ marginTop: 10 }}>
                <Lbl>KEPT TO COME BACK TO ({store.saved.length})</Lbl>
                <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
                  {[...store.saved].reverse().map((sv) => {
                    const cand = candidateFromSaved(sv);
                    return (
                      <div key={sv.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                        {/* A kept row is a candidate too, so it gets the same
                            pair. Without them it was a line of text: the one
                            list where you cannot see what you kept. */}
                        {cand && Number.isFinite(cand.spot) && (() => {
                          const bb = payoffBands({ legs: sv.legs, entryNet: cand.entryNet ?? 0, spot: cand.spot });
                          return (
                            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              <BandThumbnail bands={bb} bars={barsCache[sv.ticker] || []} width={110} height={34}
                                title={bandTakeaway(bb, { ticker: sv.ticker })} />
                              <Gauge bands={bb} size={80} ticker={sv.ticker} />
                            </div>
                          );
                        })()}
                        <div style={{ flex: 1, minWidth: 150 }}>
                          <div style={{ fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{sv.ticker} · {sv.name}</div>
                          <div style={{ ...mono, fontSize: 10, color: T.dim }}>{legsLine(sv.legs)}{sv.expKey ? ` · ${sv.expKey}` : ""} · {savedAge(sv)}</div>
                        </div>
                        {cand && Number.isFinite(cand.spot) && (
                          <button onClick={() => tickCompare(cand)}
                            style={{ ...mono, fontSize: 10.5, minHeight: 36, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: inCompare(compare, cand) ? T.blue : "transparent", color: inCompare(compare, cand) ? T.onAccent : T.blue, border: `1px solid ${T.blue}` }}>
                            {inCompare(compare, cand) ? "✓ comparing" : "Compare"}
                          </button>
                        )}
                        <Btn small ghost onClick={() => openOnBuild({ ticker: sv.ticker, expKey: sv.expKey, legs: sv.legs, name: sv.name })}>Take to Build →</Btn>
                        <Btn small ghost color={T.red} onClick={() => delSaved(sv.id)}><Trash2 size={11} /></Btn>
                      </div>
                    );
                  })}
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>
                  These are kept in this browser and travel with your saved strategies. The prices shown are the
                  ones from when you kept them; taking one to Build re-prices it from the live chain.
                </div>
              </Panel>
            )}

            {/* COMPARING — up to three, one picture (PRD §6): the payoffs
                overlaid on one axis with one shared distribution and every
                breakeven marked. Ticking gathers them here. */}
            <CompareTray items={compare} max={MAX_COMPARE} note={compareNote}
              onRemove={(c) => tickCompare(c)}
              onClear={() => { setCompare([]); setShowCompare(false); setCompareNote(null); }}
              onCompare={() => setShowCompare((v) => !v)} showing={showCompare} />
            {showCompare && compare.length >= 2 && (
              <Panel style={{ marginTop: 10 }}>
                <Lbl>{compare.length} SIDE BY SIDE · SAME AXIS, SAME PICTURE</Lbl>
                <div style={{ marginTop: 10 }}>
                  <CompareFigure items={compare} height={300} />
                </div>
                <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                  {compare.map((c, i) => (
                    <div key={c.key} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: [T.blue, T.amber, T.violet][i], flexShrink: 0 }} />
                      {Number.isFinite(c.spot) && (() => {
                        const bb = payoffBands({ legs: c.legs, entryNet: c.entryNet ?? 0, spot: c.spot });
                        return (
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <BandThumbnail bands={bb} bars={barsCache[c.ticker] || []} width={100} height={32}
                              title={bandTakeaway(bb, { ticker: c.ticker })} />
                            <Gauge bands={bb} size={74} ticker={c.ticker} />
                          </div>
                        );
                      })()}
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 12.5 }}>{c.ticker} · {c.name}</div>
                        <div style={{ ...mono, fontSize: 10, color: T.dim }}>{legsLine(c.legs)}</div>
                      </div>
                      <Stat k="RISK" v={fmt$(c.risk)} c={T.red} />
                      <Stat k="MAX PROFIT" v={ceil$(c.maxProfit)} c={T.green}
                        tip={c.maxProfit == null ? noCeilingNote(c.name) : undefined} />
                      <Stat k="CHANCE" v={chanceText(c.pop)} c={(c.pop || 0) >= 0.5 ? T.green : T.violet} />
                      <Btn small onClick={() => openOnBuild({ ticker: c.ticker, expKey: c.expKey, legs: c.legs, name: c.name })}>Take to Build →</Btn>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* The floor, held up against the chains it is applied to. The
                developer cannot fetch a live chain; the app can, so it reports.
                See OpenInterestReadout above. */}
            <OpenInterestReadout chains={chains} floor={liqLevel.absolute} percentile={liqLevel.percentile} level={liqLevel} />

            <StepForward
              label={legs.length ? `Go to Build \u2014 ${stratName} \u2192` : "Pick one above to go to Build"}
              disabled={!legs.length}
              disabledNote={`Step 3 is one structure taken apart. Use "Take to Build" on whichever of these you want to look at properly \u2014 nothing is sent until the checks at the bottom of that screen.`}
              sub={`${stratName} is loaded on step 3. Nothing is sent until the checks at the bottom of that screen.`}
              onClick={() => goStep("build")} />
          </div>
        )}

        {/* ============ BUILDER ============ */}
        {/* Where a hand-off lands. The anchor is rendered for every state of
            the Build screen, so scrolling works while the chain is loading. */}
        {/* THE EVIDENCE PANELS OPEN HERE, ALL FIVE OF THEM.
           Market levels, History and Copilot used to be written after the
           whole builder block, so opening one rendered it ~2000px down a page
           that does not scroll: on a phone the tap looked like it did nothing,
           which is how "History and Copilot are broken" was reported. Radar and
           Shortlist worked only because they happened to sit next to the strip.
           All five now open directly under the button that opened them. */}

        {/* THE EVIDENCE SHEETS ARE NOT WRITTEN HERE ANY MORE.
            Market levels, History and the Copilot used to be written after the
            whole builder block, so opening one rendered it ~2000px down a page
            that does not scroll: on a phone the tap looked like it did nothing,
            which is how "History and Copilot are broken" was reported. They now
            render inside `EvidenceOverlay` at the top of this screen — fixed to
            the viewport, so where they sit in the tree cannot put them below the
            fold, and opening one covers the step instead of lengthening it. */}


        {tab === "build" && !showSettings && step === "build" && (
          <div style={{ marginTop: 12 }}>
            <div style={{ ...sansUI, fontSize: 19, fontWeight: 800, color: T.ink }}>
              Step 3 — {legs.length ? `${ticker} · ${stratName}` : "one trade, taken apart"}
            </div>
            <div style={{ ...sansUI, fontSize: 14, color: T.mut, lineHeight: 1.55, marginTop: 4 }}>
              The chain, the greeks, the charts and the order. Everything you chose on the way here is still
              on step 2 — going back does not lose it.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              <Btn small ghost color={T.blue} onClick={() => goStep("shortlist")}>← Back to the shortlist</Btn>
              {compare.length > 0 && (
                <Btn small ghost color={T.blue} onClick={() => { setShowCompare(true); goStep("shortlist"); }}>
                  {compare.length} still ticked to compare
                </Btn>
              )}
            </div>
          </div>
        )}
        {tab === "build" && !showSettings && step === "build" && <div ref={buildAnchor} style={{ scrollMarginTop: 12 }} />}
        {/* Where the guided flow lands. Without this the trade simply appears on
            Build and the user has no way to tell that the road they picked is
            the thing in front of them. */}
        {tab === "build" && !showSettings && step === "build" && picked && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: `${T.blue}0f`, border: `1px solid ${T.blue}55`, borderLeft: `3px solid ${T.blue}`, borderRadius: 8 }}>
            <div style={{ ...mono, fontSize: 10, color: T.blue, letterSpacing: "0.1em" }}>THE ROAD YOU TOOK</div>
            <div style={{ fontSize: 13.5, color: T.body, marginTop: 4, lineHeight: 1.55 }}>
              {picked.ticker} · {picked.name}. It is loaded below — check the strikes, the expiry and the prices,
              change anything you want, then open it at the bottom of this screen. Nothing is sent until you do.
            </div>
            <button onClick={() => { setPicked(null); setOpenResult(null); }}
              style={{ ...mono, fontSize: 10.5, marginTop: 6, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: "4px 0" }}>
              dismiss
            </button>
          </div>
        )}
        {tab === "build" && !showSettings && step === "build" && buildScreen === "builder" && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <input value={stratName} onChange={(e) => setStratName(e.target.value)}
                  style={{ ...mono, background: "transparent", border: "none", borderBottom: `1px dashed ${T.line}`, color: T.ink, fontSize: 15, fontWeight: 700, outline: "none", minWidth: 200 }} />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <Btn small ghost color={T.blue} onClick={saveStrategy}><Save size={12} /> Save</Btn>
                  {/* One route to an order from this screen: the confirm step at
                      the bottom, which states the checks and the exit plan
                      first. A second button up here opened a position without
                      any of that ever being read. */}
                  
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
                    {A.realCount === legs.length ? `● every price is a live ${feedName(chain) || "market"} quote` : `◐ ${A.realCount}/${legs.length} legs priced live — the rest are modelled`}
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
                          style={{ background: "none", border: "none", color: T.violet, cursor: "pointer", ...mono, fontSize: 11 }}>chart</button>
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
              {/* A HAND-BUILT TRADE IS THE USER'S TO MAKE — the quality floors
                  do not apply here — but a price the chain could not give us is
                  not a cheap trade, and the figures underneath would be read as
                  one. The desk says so where the numbers are, and the gate at
                  the bottom of this screen refuses the order (src/rules.js). */}
              {(() => {
                const pz = priceability({ legs, quotes: quotesOf(A), net: A.entry, maxLoss: A.maxLoss });
                if (pz.priceable) return null;
                return (
                  <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 12, lineHeight: 1.6, padding: "8px 10px", background: `${T.red}0f`, border: `1px solid ${T.red}55`, borderRadius: 6 }}>
                    ⚠ THE PRICE OF THIS STRUCTURE CANNOT BE READ. {pz.reasons[0]} The figures below are what the
                    feed gives, not what this would cost: the risk gate will refuse the order.
                  </div>
                );
              })()}
              {/* Stats */}
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                <Stat k={A.entry >= 0 ? "YOU PAY" : "YOU RECEIVE"} v={fmt$(Math.abs(A.entry) * 100)} tip="What it costs to open this trade, or what you are paid to open it. With live quotes this is the midpoint between the buy and sell price." />
                {/* THE TOOLTIP USED TO SAY "It cannot make more than this" UNDER
                    A NUMBER THAT WAS THE EDGE OF A GRID. For a long call it can
                    make more than that, and there is no number at which it
                    cannot: the figure and the claim under it are both gone. */}
                <Stat k="MOST YOU CAN MAKE" v={ceil$(A.maxProfit)} c={T.green}
                  tip={A.profitUnbounded ? noCeilingNote(stratName || "This structure")
                    : "The best this trade can do at expiry. It cannot make more than this."} />
                <Stat k="MOST YOU CAN LOSE" v={fmt$(A.maxLoss)} c={T.red} tip="The worst this trade can do. It is fixed the moment you open it — never a dollar more." />
                <Stat k="BREAKEVEN" v={A.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                <Stat k={takeProfitLabel()} v={A.profitUnbounded ? "—" : fmt$(A.maxProfit * RULES.takeProfitPct)} c={T.green}
                  tip={A.profitUnbounded
                    ? `${RULE_PILLS.takeProfit()} ${noCeilingNote(stratName || "This structure")}`
                    : RULE_PILLS.takeProfit()} />
                <Stat k={stopLossLabel()} v={fmt$(A.maxLoss * RULES.stopLossPct)} c={T.red} tip={RULE_PILLS.stopLoss()} />
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
                <Stat k="Δ DELTA" v={A.greeks.delta.toFixed(2)} />
                <Stat k="Γ GAMMA" v={A.greeks.gamma.toFixed(3)} />
                {/* SIGNS ARE MANDATORY ON A RATE OF CHANGE. `fmt$` prints a
                    minus for a loss and nothing for a gain, which is right for
                    a price and wrong for these two: theta printed "$3" on a
                    long debit spread where the holder LOSES it every day, and
                    read as a gain it inverts the one thing the number says.
                    `signedMoney()` in rules.js also refuses to round a real
                    vega away to "$0" — that zero was a claim that volatility
                    does not move the trade, and it was false. */}
                <Stat k="Θ PER DAY" v={signedMoney(A.greeks.theta)} c={A.greeks.theta >= 0 ? T.green : T.red} tip="What you gain (+) or lose (−) for each day that passes, if the price stays put. Positive means time is on your side." />
                <Stat k="V PER 1% VOL" v={signedMoney(A.greeks.vega)} c={A.greeks.vega >= 0 ? T.violet : T.amber} tip="How much the value moves if the market gets 1% more jumpy. Positive means a nervous market helps you; negative means it hurts." />
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

            {/* THE CONFIRM STEP, AT THE END OF THE SCREEN THAT SHOWS THE TRADE.
                It used to be a wizard screen of its own that "Take this road"
                jumped to, which let the guided flow reach an order without ever
                passing the chain, the legs or the greeks. It reads the LIVE
                Build state, so a strike changed above changes the checks below:
                what is confirmed is what is on screen. */}
            <div style={{ marginTop: 12 }}>
              <ConfirmSteps
                candidate={{
                  ticker, name: stratName, legs, expKey, dte,
                  risk: Math.abs(A.maxLoss), maxProfit: A.maxProfit, entryNet: A.entry, spot,
                }}
                preview={guard} result={openResult}
                heading={false} showFigure={false}
                busy={busy === "order"}
                onConfirm={() => openPaper()}
              />
            </div>
          </div>
        )}

        {/* ============ 3D ============ */}
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
                      {/* THE ORDER BEHIND THIS ONE HAS NOT FILLED. It was
                          recorded at the moment it was sent, and an order can
                          sit accepted for a whole session; a row that says
                          nothing about that is a position the user does not
                          own yet, drawn as one he does. */}
                      {p.alpacaFilled === false && (
                        <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 5 }}>
                          {`⚠ The Alpaca order behind this one was "${p.alpacaStatus}" when it was sent, not filled. Check it on your paper account: until it fills, nothing here is a position you own, and the exit plan has not started.`}
                        </div>
                      )}
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
              <Lbl>{limits.answered ? "YOUR CAPITAL · EVERY LIMIT COMES FROM HERE" : "YOUR CAPITAL · NOT SET YET"}</Lbl>
              <div style={{ fontSize: 13, color: T.mut, marginTop: 8, lineHeight: 1.5 }}>
                Change these and the per-trade limit changes with them. Nothing here is a number we handed you.
              </div>
              {/* Empty means UNANSWERED, and the field says what a suggestion
                  would look like rather than filling itself in as if you had
                  chosen it. Every figure below then reads "suggested" until
                  both boxes have something in them. */}
              {!limits.answered && (
                <Pill tone={T.blue}>{capitalSourceNote(limits)}</Pill>
              )}
              <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>TRADING CAPITAL ($)</div>
                  <Inp type="number" min={100} step={500} value={store.settings.capital ?? ""}
                    placeholder={`e.g. ${RULES.suggestedTradingCapital}`}
                    onChange={(e) => setSetting("capital", e.target.value === "" ? null : Math.max(100, +e.target.value))} style={{ width: 130, fontSize: 16, padding: "10px 10px" }} />
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>POSITIONS AT ONCE</div>
                  <Inp type="number" min={1} max={20} value={store.settings.concurrentTarget ?? ""}
                    placeholder={`e.g. ${RULES.suggestedConcurrentTarget}`}
                    onChange={(e) => setSetting("concurrentTarget", e.target.value === "" ? null : Math.max(1, +e.target.value))} style={{ width: 90, fontSize: 16, padding: "10px 10px" }} />
                </div>
                <div>
                  <div style={{ ...mono, fontSize: 10, color: T.dim }}>TOTAL SAVINGS ($, OPTIONAL)</div>
                  <Inp type="number" min={0} step={1000} value={store.settings.savings ?? ""}
                    onChange={(e) => setSetting("savings", e.target.value === "" ? null : Math.max(0, +e.target.value))} style={{ width: 150, fontSize: 16, padding: "10px 10px" }} />
                </div>
              </div>
              {/* The pills explain the limit while you are still changing it. */}
              {limits.pills.map((pl) => <Pill key={pl.id}>{pl.text}</Pill>)}
              <div style={{ marginTop: 14, padding: "12px 14px", background: T.bg, border: `1px solid ${limits.answered ? T.line : T.blue}`, borderRadius: 10 }}>
                <div style={{ ...mono, fontSize: 10, color: limits.answered ? T.dim : T.blue, letterSpacing: "0.1em" }}>
                  {limits.answered ? "YOUR LIMITS" : "SUGGESTED — NOT YOUR LIMITS YET"}
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginTop: 4 }}>{money(limits.perTradeLimit)} at risk per trade</div>
                <div style={{ fontSize: 13, color: T.mut, marginTop: 4, lineHeight: 1.5 }}>
                  and {money(limits.totalLimit)} across everything at once ({pctText(RULES.totalExposurePct)} of your capital).
                  {limits.overrideAccepted ? ` This is your own limit, not the suggested one — your reason: “${limits.overrideReason}”.` : ""}
                </div>
                {/* Only when answered: unanswered, the pill above the fields
                    already says it, and saying it twice reads as noise. */}
                {limits.answered && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.5 }}>{capitalSourceNote(limits)}</div>}
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

            {/* THE ANALYSES RUN IN THE COPILOT PANEL, HERE, IN THE JOURNAL.
                The Journal is the record of what the app did; a pre-trade
                analysis or an opportunity radar is part of that record, and
                leaving it only in a panel that is one tap from being closed
                made the Journal and the Copilot disagree about the same day. */}
            {(store.copilotLog || []).length > 0 && (
              <Panel style={{ marginTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>COPILOT ANALYSES · {store.copilotLog.length} FILED</Lbl>
                  <Btn small ghost onClick={() => { setEv("copilot"); setTab("build"); }}>Run another →</Btn>
                </div>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
                  Every analysis you run from the Copilot panel on Build is filed here with the question that produced
                  it, newest first, and the last {store.copilotLog.length === 1 ? "one is" : `${store.copilotLog.length} are`} included in the report below.
                </div>
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {store.copilotLog.map((c, i) => (
                    <details key={c.t + "-" + i} style={{ background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7, padding: "9px 11px" }}>
                      <summary style={{ cursor: "pointer", listStyle: "none" }}>
                        <span style={{ ...mono, fontSize: 10, color: T.amber, letterSpacing: "0.08em" }}>{(c.label || "QUESTION").toUpperCase()}</span>
                        <span style={{ ...mono, fontSize: 10, color: T.dim, marginLeft: 8 }}>
                          {c.ticker ? `${c.ticker} · ` : ""}{new Date(c.t).toLocaleString("en-GB")}
                        </span>
                      </summary>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 7, lineHeight: 1.5 }}>{c.prompt}</div>
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                        <Markdown text={c.answer} />
                      </div>
                    </details>
                  ))}
                </div>
              </Panel>
            )}

            <ReportTab
              apiKey={"server"}
              setSetting={setSetting}
              ctx={{ store, scan, news: news[ticker]?.items || [], ticker, legs, expKey, A, spot, seasonalSrc: seas.src, setMsg }}
            />
          </div>
        )}

        {/* The chain is on its way. Saying "no market data" here would blame
            the user for a request that has not come back yet. */}
        {tab === "build" && !showSettings && step === "build" && buildScreen === "loading" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.blue }}>Loading {ticker} option prices — the trade appears here as soon as they arrive.</div>
          </Panel>
        )}

        {tab === "build" && !showSettings && step === "build" && buildScreen === "no-market-data" && (
          <Panel style={{ marginTop: 12 }}>
            <div style={{ ...mono, fontSize: 12, color: T.amber }}>Option prices for {ticker} have not loaded yet — press Refresh at the top.</div>
          </Panel>
        )}

        {/* An empty Build screen is a normal state, not a blank screen: say what
            it is for and where the trades come from. */}
        {tab === "build" && !showSettings && step === "build" && buildScreen === "empty" && (
          <Panel style={{ marginTop: 12 }}>
            <Lbl>NOTHING TO BUILD YET</Lbl>
            <div style={{ fontSize: 13.5, color: T.body, marginTop: 8, lineHeight: 1.55 }}>
              This is where one trade sits while you take it apart: its payoff, its odds, its risk checks and
              the four factors behind it. Nothing is on it yet.
            </div>
            <div style={{ fontSize: 13.5, color: T.mut, marginTop: 8, lineHeight: 1.55 }}>
              This is step 3, and a trade gets here from step 2. Go back to <b style={{ color: T.blue }}>1 Radar</b> to
              see which market is worth looking at, or to <b style={{ color: T.blue }}>2 Shortlist</b> to pick a
              structure on {ticker}. Or go back Home and answer three questions instead.
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
              <Btn small onClick={() => goStep("radar")}><Radar size={11} /> 1 Radar</Btn>
              <Btn small ghost onClick={() => goStep("shortlist")}><Layers size={11} /> 2 Shortlist</Btn>
              <Btn small ghost color={T.blue} onClick={goHome}>← Home</Btn>
            </div>
          </Panel>
        )}

        </TabBoundary>

        <div style={{ ...mono, fontSize: 10, color: T.dim, textAlign: "center", marginTop: 22 }}>
          {/* THE LIMIT IS DERIVED, NOT FIXED (PRD §3). This said "max 5% of
              capital" — the hardcoded rule the capital model replaced — while
              every other screen quoted the figure `sizing()` derives from the
              user's own answers. One home, read everywhere; and until both
              questions are answered the phrase calls it a suggestion. */}
          Paper trading only · {sourceNote(chain)} · {perTradeLimitPhrase(limits)} · Total exposure ≤{money(limits.totalLimit)} ({pctText(RULES.totalExposurePct)}) · Educational software, not financial advice
        </div>
      </div>
    </div>
  );
}
