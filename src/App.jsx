import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from "recharts";
import {
  RefreshCw, ShieldCheck, Save, Trash2, Layers, Radar, Box,
  FlaskConical, Briefcase, Plus, Plug, Send, ExternalLink, MessageSquare, FileText, Bell,
  SlidersHorizontal, ArrowLeft, Sun, Moon, AlertTriangle, WifiOff,
} from "lucide-react";
import { fetchAllNews, fetchWeather, ImpactTags, CopilotTab, TaCopilot, ReportTab, OrderTicket, AlpacaDesk, scaleStrategy, buildContext, GuardianPanel, ChainMatrix, OptionPanel, PriceChart, QtyField, UnifiedView, taSignals, confluence, WhyThisTrade, Markdown, alpacaReq } from "./pro.jsx";
import { BandThumbnail, payoffBands, bandTakeaway, GaugeFigure, Gauge, CompareFigure, exitPlanSentence,
  OpenInterestStrip, oiStripTakeaway, oiCutAt, oiGhostCut, explainOiStrip, useWidth } from "./visuals.jsx";
import { fuseSignals, sentimentDirection, withSignalRank, compareCandidates, againstSignal, DRIVER_PRESETS, rankByDrivers, verdictNarrative } from "./signals.js";
import { N as nCDF, bs as bsPrice, smile as smileIV, payoff as payoffExp, SEASONAL, SIGMA,
  parseAvJson, statsFromMatrix } from "./engine.js";
import { parseOcc, buildOcc, snapStrike, resnapLegs, expiryStrikes, strikeOptions, fetchChain, hasOpenInterest, enrichOpenInterest, feedName, sourceNote, openInterestNote, oiProfile, expiryOpenInterest, nearMoneyOpenInterest, monotonicityBreaks, monotonicityNote, spotOf, spotAt } from "./chain.js";
import { T, themeName, setTheme, BADGE_SAFE } from "./theme.js";
import { RULES, sizing, ruleBadge, takeProfitLabel, stopLossLabel, perTradeCapLabel, RULE_PILLS, NOTHING_TODAY, money, pctText, capitalSourceNote, perTradeLimitPhrase, qualityFloor, qualityFloorSentence, liquiditySkippedNote,
  positionPnl, BROKER_PNL, remainingEdge, remainingEdgeLabel, shareOfMaximum, attentionCount,
  filterFold, qualityFloorLine, voicePointer, VOICE_HOMES, noCeilingRankLine,
  buildableExpiries, openableBoard, offFloorExpiryLabel, horizonFloorNote, emptyShortlistCta,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityLevel, liquidityThreshold, looseningWarning, liquiditySettingNote, isLoosened, ordinal,
  priceability, unpriceableNote, rewardRisk, MIN_NET_DOLLARS,
  payoffCeiling, NO_CEILING, noCeilingNote, noCeilingRankNote,
  impossibleLoss, impossibleLossNote,
  contractListing, unlistedContractNote, unlistedContractListNote, strikeSnapNote, offBoardStrikeLabel,
  tradeCard, cardCurrencyNote, CARD_CURRENCY, limitOwner,
  modelSanity, modelDisagreementNote,
  entryRoom, entryRoomWarning, entryOverrideOk, entryOverrideNote, entryInsideExitNote,
  passedOverRecord, passedOverSummary,
  expiryChoice, expiryChoiceNote, emptyExpiryNote, unloadedBoardNote, checkedAgainstNote, wideSpreadNote, spreadSkippedNote,
  wideComboNote, comboSpreadSkippedNote, comboBook, effectiveLimit, limitCeilingNote, notionalControlled,
  radarSplit, radarQuietNote,
  orderVerdict, legBook, legLimitSeed, netFromLegs, onTick, sizeSkippedNote,
  conflictSummaryLine, warningsToPrint,
  chancePct, chanceText, chanceInTen, signedMoney,
  ruleExitOf, stopWarningSentence, watchAttentionLevel,
  chanceOf, chanceSourceNote, seasonalProvenance, seasonalStampNote, seasonalStampFields, chanceDrawFields,
  sigmaProvenance, isButterfly,
  requestOf, requestAmountLabel, requestAmountOwner, contractsSourceNote,
  splitByRequest, meetsHeading, otherwiseHeading, missReasonLine, fillPriceHeading, fillNet,
  rewardRiskRange, RR_POINTS, crossingCost, crossingCostNote, openingMarkNote } from "./rules.js";
import { isStale, freshnessNote, staleAmong } from "./freshness.js";
import { evaluateTrade, gateSummary } from "./riskGate.js";
import { DEMO, DEMO_BANNER, DEMO_TOOLTIP, DEMO_SEED_TICKERS, demoPositions } from "./demo.js";
import { CapitalOnboarding, WizardOpen, FindOpportunities, WizardCandidates, ConfirmSteps, NothingToday, Card, Pill } from "./wizard.jsx";
// THE CONTROLS AND THE ONE CANDIDATE CARD (ROADMAP P10). Its own file: it is
// nothing but a trade, so it may not live in `steps.jsx`, and `wizard.jsx`
// renders the same card, so it may not live here.
import { RequestControls, SplitSections, MissLine, CandidateCard } from "./card.jsx";
import { buildHandOff, buildScreenState, BUILD_TAB } from "./handoff.js";
import { orderBody, orderOutcome, alpacaErrorText, reduceRatios, limitWords, fillPriceOf } from "./order.js";
// THE PERMANENT RECORD: the ref a position is given at open, the sequence on
// every timeline entry, the close reason, and what survives into the Journal.
import { nextRef, refCounter, appendTimeline, stampTimeline, orderStatusRecheck, closeDecision,
  autopilotHorizonNote, autopilotVolNote,
  positionSize, positionSizeNote, contractsOf, withPositionSize, fillVsLimit, orderReconciliation,
  storedLimitOf,
  positionStage, positionStageNote, bookPositions, wouldHaveDone, isBrokerHolding, upgradeHolding,
  isTestRecord, testRecordNote, scoredJournal,
  journalEntry, searchJournal, CLOSE_REASON_MIN, refNumber } from "./journal.js";
import { FIRST_STEP, stepCarry, candidateOf, candidateKey, legsLine, toggleCompare, inCompare, MAX_COMPARE, savedFromCandidate, candidateFromSaved, savedAge } from "./path.js";
import { StepNav, StepForward, EvidenceBar, EvidenceOverlay, DeskSheet, CompareTray, CandidateActions, Fold } from "./steps.jsx";

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

  /* ============ THE LIQUID COMMODITY TIER (ROADMAP P2-bis) ============
     Read on the owner's phone: SOYB and CORN produced "0 of 2 shown" and a wall
     of refusal text. The grain chains are too thin for the floors this app
     measured on live data, so most of what is on screen is an explanation of
     why there is nothing on screen. These five are real commodities — the
     seasonal engine still applies — with option books an order of magnitude
     deeper, and calibrating P2's edge on them is worth far more than
     calibrating it on CORN.

     >>> NOT ONE NUMBER IS INVENTED FOR THEM. <<< Three things every row above
     carries are deliberately absent here:

       - `monthlyMean`. There is no `SEASONAL` row and there will not be one.
         Seasonality is UNKNOWN for these markets until Alpha Vantage's real
         monthly history loads, `seasonalProvenance()` reports `missing`, and
         every screen prints a dash and the sentence rather than a zero. A
         hand-written row would be a fifth estimate on a table this repository
         has already measured as wrong on eight months of twelve.
       - `sigma`. No `SIGMA` row either, so `sigmaProvenance()` falls to
         `RULES.fallbackSigma` and says on screen that the number was CHOSEN,
         not measured — until the same Alpha Vantage read supplies the measured
         realised volatility it has always returned beside the means.
       - a per-market `iv`. `RULES.fallbackIV` is the one home for "the implied
         volatility the options are priced at when nothing else is known", and
         `ivProvenance()` already says so wherever it is used. Writing 0.15 for
         GLD out of memory would be exactly the estimate-as-a-reading this
         codebase keeps refusing; the live chain quotes its own IV per contract
         and that is what every figure is worked out at the moment it loads.

     `step` IS A FALLBACK AND ONLY A FALLBACK. Strikes are a property of the
     board (`expiryStrikes()` in chain.js), `buildPresets()` refuses to build
     without one (PR #31), and `snapStrike()`'s grid is unreachable from it.
     These are the conventional listing increments, kept so a dropdown has
     something to offer before the chain lands, not so a trade can be built on
     them. ======================================================== */
  GLD: { commodity: true, name: "Gold", iv: RULES.fallbackIV, step: 1,
    newsQ: "gold price fed real yields dollar" },
  SLV: { commodity: true, name: "Silver", iv: RULES.fallbackIV, step: 0.5,
    newsQ: "silver price industrial demand dollar" },
  USO: { commodity: true, name: "Crude Oil", iv: RULES.fallbackIV, step: 1,
    newsQ: "crude oil price OPEC EIA inventories" },
  XLE: { commodity: true, name: "Energy Sector", iv: RULES.fallbackIV, step: 1,
    newsQ: "energy sector oil majors outlook" },
  GDX: { commodity: true, name: "Gold Miners", iv: RULES.fallbackIV, step: 1,
    newsQ: "gold miners production costs outlook" },

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

/* WHICH SEASONAL MEANS ARE IN FORCE FOR A MARKET — ONE EXPRESSION.
   `seasonalProvenance()` in rules.js is the home; this binds it to the loaded
   Alpha Vantage state and the table row behind it (which the liquid tier does
   not have, and must not). Every reader goes through it, so a screen cannot
   print `monthlyMean[NOW_MONTH]` off a row that is not there — `undefined[8]`
   throws, and the guard people reach for instead is `|| 0`, which prints a
   market as having no seasonal edge when nobody has measured one. */
const seasonalOf = (state, tk) => seasonalProvenance((state || {})[tk] || null, getU(tk).monthlyMean, tk);
/** This month's seasonal mean, or null. Never a zero nobody measured. */
const seasonalNowOf = (state, tk) => {
  const mm = seasonalOf(state, tk).monthlyMean;
  return Array.isArray(mm) && Number.isFinite(mm[NOW_MONTH]) ? mm[NOW_MONTH] : null;
};

/* ============================== OPTION CHAIN: ALPACA FIRST, CBOE AS THE NET ==============================
   The chain lives in src/chain.js — one internal shape, two sources, and the
   mid price computed in one place so the two can never disagree about the price
   of the same contract for a reason that is only a formula. Alpaca is primary
   (the same broker the orders go to); CBOE catches every failure, so a slow or
   silent broker costs a few seconds, never a blank screen.
   ======================================================================== */

/* ============================== ALPHA VANTAGE: real monthly history ==============================
   `parseAvJson()` and `statsFromMatrix()` USED TO LIVE HERE and are now in
   engine.js, imported above. The autopilot has to derive the same measured
   monthly means from the same cached body while the app is closed, and a
   Netlify function cannot import this file (React, recharts,
   lightweight-charts) — so keeping the parse here would have meant a second
   implementation of the seasonal table on the server, which is precisely the
   disagreement this PR exists to end.

   The dead `AV_URL` constant went with them. Nothing on the client may call
   Alpha Vantage directly: the key lives in a Netlify environment variable and
   `/api/av` is the only door. A URL template with an `apikey` slot in bundled
   code is an invitation to reopen that door by accident.
   ================================================================================================ */
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
/* WHAT IS IN FORCE, AND IT IS NOT ALWAYS AN ESTIMATE. The liquid tier carries
   no hand-written row, so "hand-written estimate: …" would be naming a table
   that does not exist for that market. `prov.missing` is the third case and it
   is the one this app has to be able to say out loud. */
const seasonalSourceLine = (entry, state, prov) => entry
  ? `${entry.src}${entry.upstreamError ? ` — Alpha Vantage refused the refresh (${entry.upstreamError}), so this is the last good answer` : ""}`
  : `${prov && prov.missing ? "no seasonal reading at all" : "hand-written estimate"}: ${seasonalFallbackNote(state)}`;

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
/* THE APP'S OWN BOOK — AND IT IS NOT A STAND-IN FOR THE BROKER'S.
   A position recorded on the app's own paper book never leaves the browser,
   so rule 1 (paper trading only) is satisfied by construction and the gate is
   told so. It is at module scope because it is a constant, and because being
   a constant is what makes `bookFor()` below able to say, in one expression,
   which account a given tap is actually measured against.

   NEVER use it for anything that reaches Alpaca. Read on the phone, SOYB,
   21 September 2026: the checklist on the Build screen was evaluated against
   THIS while the send beside it was gated against the broker account, so the
   list the owner read said "paper mode verified — local simulation, no broker
   involved" about an order that was about to go to a broker. The two agreed
   by luck (the gate reads the account for `paperStatus()` and nothing else,
   and this one always passes), which is worse than disagreeing: a checklist
   that cannot fail is not a check. */
const LOCAL_BOOK = { paperVerified: true, paperSource: "local simulation, no broker involved" };

async function alpacaAccount() {
  const r = await fetch(`/api/alpaca?path=${encodeURIComponent("/v2/account")}`);
  if (!r.ok) throw new Error(`Alpaca ${r.status}: ${await r.text()}`);
  const acc = await r.json();
  const host = r.headers.get("X-OSL-Paper-Endpoint");
  return { ...acc, paperVerified: host === PAPER_HOST, paperSource: host ? `the proxy routed this to ${host}` : null };
}
async function alpacaOrderMleg(legs, userQty = 1) {
  // THE SIZE GOES IN QTY, THE SHAPE GOES IN THE RATIOS (src/order.js).
  // Alpaca refuses leg ratios that share a factor — 422 / 42210000,
  // "GCD[5 5] = 5" — so a five-lot vertical is five of a 1:1 combination.
  // The size is the caller's, and it is the SAME number the risk gate was run
  // at: a gate that measured one combination and an order that sends seven is
  // a cap that does not hold.
  const body = orderBody({ legs, occs: legs.map((l) => l.occ), userQty, type: "market", tif: "day", intent: "open" });
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
/* AN UNLOADED BOARD IS UNKNOWN, NOT A GRID — AND THIS IS WHERE THE 27.5 CAME
   FROM. The Build screen's preset effect fired on the render where the chain
   (and so `spot`) arrived, while `expKey` was being set by a SIBLING effect in
   that same render, so `expStrikes` was still null. `snapStrike()` then fell
   back to `Math.round(x / step) * step`: SOYB at 27.64, step 0.5, Bull Call
   Spread [0, +0.05] gives 27.5 / 29 — exactly the leg the broker refused, on
   a board that lists whole dollars. Nothing re-snapped afterwards, so every
   fresh load of such a board produced an order the gate had to refuse.

   The guard is HERE rather than at the four call sites for the same reason
   `snapStrike()` itself lives in chain.js: one question, one answer. With no
   board there are no presets, so no caller can produce tradeable legs from
   one — each of them says on screen what it does with the empty answer. The
   `step` fallback inside `snapStrike()` is now unreachable from this
   function, which is the point: a percentage of spot rounded to a grid is a
   guess about what the market lists, and this app does not guess those. */
/* ==========================================================================
   THE STRIKE DROPDOWN SAYS WHAT IT IS SHOWING — failure class 1, read on the
   owner's phone.

   `<select value={27.5}>` over options 16…32 does not render empty and does
   not warn: the browser displays the FIRST option. So the dropdown read 16
   while the trade card above it read 27.5, and the two disagreed about which
   trade was on screen with nothing on the page saying so. The order carried
   the 27.5; the number the user could see was the 16.

   `strikeOptions()` in chain.js always includes the current strike, flagged
   `listed: false` when the board does not carry it. Here that becomes a
   DISABLED option named by `offBoardStrikeLabel()` in rules.js: the leg is
   shown, it is selected, it can be changed, and it cannot be chosen. The gate
   is what refuses the order (`UNLISTED_CONTRACT`); this is what stops the
   screen from quietly showing a different strike instead.

   Exported so a test can render it. With no board at all it is a plain number
   field, exactly as before — an unloaded board is UNKNOWN, and a dropdown of
   strikes nobody has confirmed would be the same invention one control over.
   ========================================================================== */
export function StrikeSelect({ strikes, value, step, onChange }) {
  const opts = strikeOptions(strikes, value);
  if (!opts) {
    return <Inp type="number" step={step} value={value} onChange={(e) => onChange(+e.target.value)} style={{ width: 76 }} />;
  }
  const off = opts.find((o) => !o.listed);
  return (
    <select value={value} onChange={(e) => onChange(+e.target.value)}
      title={off ? offBoardStrikeLabel(off.k) : undefined}
      style={{ ...mono, background: T.panel, color: off ? T.red : T.ink, border: `1px solid ${off ? T.red : T.line}`, borderRadius: 5, padding: "5px 6px", fontSize: 12, width: off ? 150 : 90 }}>
      {opts.map((o) => (
        <option key={o.k} value={o.k} disabled={!o.listed}>
          {o.listed ? o.k : offBoardStrikeLabel(o.k)}
        </option>
      ))}
    </select>
  );
}

export function buildPresets(sent, S, step, strikes) {
  if (!strikes || !strikes.length) return [];
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
  // ...and the SIZES travel with them, for the same reason. The ticket's market
  // table says how many contracts are bid for and offered at those two prices,
  // which is what "how close am I to a probable fill" actually means. A missing
  // size stays undefined — UNKNOWN, never zero (`legBook()` in rules.js).
  if (quote && quote.mid != null) return { px: quote.mid, iv: quote.iv || smileIV(baseIV, S, leg.strike), real: true, occ: quote.occ, oi: quote.oi, vol: quote.vol, bid: quote.bid, ask: quote.ask, bidSize: quote.bidSize, askSize: quote.askSize };
  const iv = smileIV(baseIV, S, leg.strike);
  return { px: bsPrice(S, leg.strike, dte / 365, iv, leg.type), iv, real: false };
}
/** The two-sided quotes behind an analysis, one per leg, for `priceability()`. */
const quotesOf = (a) => (a?.legPx || []).map((l) => ({ bid: l.bid, ask: l.ask }));
/**
 * THE SAME STRUCTURE, RE-READ AT THE PRICE THAT FILLS (ROADMAP P10 §3-bis).
 *
 * A candidate's `analyze()` is at the MID, deliberately: a candidate is a
 * structure and not yet a price. But a CARD carries four figures somebody
 * decides on, and §4l is the whole argument for which price they are read at —
 * on UNG the same structure is 2.6:1 at the mid and 1.1:1 at the price that
 * trades, and the mid is a price this app has proved nobody gives you.
 *
 * `analyze()` is UNCHANGED and is called exactly as the Build screen calls it,
 * with `{ net }`. No readable book means the mid stands and the caller says so
 * — never a price of zero.
 */
const atFillPrice = (legs, a, { spot: sp, dte: d, iv: v, q: qq }) => {
  if (!a) return a;
  const net = fillNet(legs, quotesOf(a));
  if (!Number.isFinite(net) || !sp) return a;
  return analyze(legs, sp, d, v, qq, { net });
};
/**
 * THE CONTRACTS THE CHAIN ACTUALLY LISTED, one per leg, for
 * `contractListing()` in rules.js — null where it listed none.
 *
 * `priceLeg()` carries `occ` only when the chain answered about that leg, so
 * the absence of a symbol here is the absence of a contract, not a contract
 * with no name. That is the whole of the SOYB 422: four order paths filled the
 * gap with `buildOcc()`, which FORMATS a symbol from a strike the app chose
 * and cannot know whether anybody issued it. Never write that fallback into an
 * order path again — the gate refuses it by name now (UNLISTED_CONTRACT).
 */
const occsOf = (a) => (a?.legPx || []).map((l) => l.occ || null);
/**
 * IS IT THIS STRUCTURE'S PRICE? — asked ONCE, from an analysis, everywhere.
 *
 * `modelSanity()` (src/rules.js) was spelled out at each of the three
 * generation sites and a fourth time inside the order ticket, which made the
 * ticket a SECOND consumer of `analyze()`'s per-leg marks: the Shortlist fed it
 * `legPx[i].px` and the ticket re-derived the marks from `quoteFn(leg).mid`.
 * Those are the same number for a quoted leg and different for one priced off
 * the model — the ticket passed `null`, the Shortlist passed the model's own
 * price — so two screens could name a different leg as the culprit for one
 * trade. One expression, one answer, and `ceiling.test.jsx` holds the two
 * together against the same chain.
 *
 * `marketNet` and `modelNet` never depended on the marks; `worstLeg` did, and
 * "which quote to go and look at" is the only actionable half of the refusal.
 */
export const modelCheckOf = (a, { legs, spot, dte, iv }) => modelSanity({
  legs, net: a?.entry, marks: (a?.legPx || []).map((l) => l.px), spot, dte, iv,
});

/**
 * THE STRUCTURE'S OWN IMPLIED VOLATILITY — the average of what the chain quoted
 * for its legs, or null when `analyze()` produced no legs to average. It is the
 * number `analyze()` already priced the trade at, so the chance below is worked
 * out at the same volatility the P&L on screen is.
 */
export const structureIV = (a) => {
  const px = a?.legPx || [];
  if (!px.length) return null;
  const ivs = px.map((l) => l.iv).filter((x) => Number.isFinite(x) && x > 0);
  return ivs.length ? ivs.reduce((x, y) => x + y, 0) / ivs.length : null;
};

/**
 * ONE CHANCE, ONE ARITHMETIC — `chanceOf()` IS SPELLED ONCE IN THIS FILE, HERE.
 *
 * The same discipline as `modelCheckOf()` above, for the same reason. Before
 * this, App.jsx asked "what is the chance of profit" in three different places
 * with `probProfit()` (a closed form at a risk-neutral drift) and in a fourth
 * with its own unseeded `montecarlo()`, and pro.jsx had a fifth. The Radar row,
 * the Shortlist row, the Build panel, the Guardian and the autopilot's brief
 * therefore printed different numbers about one trade.
 *
 * `riskGate.test.js` fails the build if this file spells `chanceOf` more than
 * once, exactly as it does for `modelSanity`.
 */
export const chanceCheckOf = (a, { ticker, legs, spot, dte, expKey = null, seasonal, thesisIV = null }) =>
  chanceOf({
    legs, entryNet: a?.entry, spot, dte, expKey, ticker, seasonal,
    month: NOW_MONTH, iv: structureIV(a), thesisIV,
  });

/**
 * THE ONE SENTENCE THAT TRAVELS WITH EVERY PRINTED CHANCE.
 *
 * PR #25 made all five screens agree on the NUMBER and left the debt it wrote
 * down open: four of the five markets sit on the hand-written seasonal table
 * until Alpha Vantage loads, the app says so on the Build screen's SEASONAL
 * SOURCE stat, and it said nothing beside the CHANCE — which is the figure that
 * table actually moves. Correcting one CORN cell to the value av.mjs documents
 * moves the printed chance by 18.8 points and flips the sign of the average
 * result, so the source is not a footnote about the number, it IS the number.
 *
 * `chanceOf()` stamps its own result, so this reads the answer rather than
 * re-deciding it. A row with no chance gets the sentence that says why there
 * is none, never a blank.
 */
const chanceStamp = (mc, ticker = "this market") => (mc ? mc.seasonalNote : chanceSourceNote(null, ticker));

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
/**
 * EVERY FIGURE ON THIS SCREEN IS WORKED OUT AT ONE PRICE, AND IT IS NOT ALWAYS
 * THE MID (the second of the three faults read on the owner's phone).
 *
 * `analyze()` priced the structure at the mid, full stop. On UNG 2026-09-20
 * that produced YOU PAY $14 · MOST YOU CAN MAKE $36 · MOST YOU CAN LOSE -$14 ·
 * BREAKEVEN 10.64, while `limitPlacement()` two thousand pixels below said in
 * these words that a limit AT the mid is a limit nobody has to meet. At $24 —
 * the price that actually trades — the same structure pays $26, risks $24 and
 * breaks even at 10.74: NEARLY HALF THE REWARD AND NEARLY DOUBLE THE RISK.
 *
 * So the entry price is an ARGUMENT now. `opts.net` is the signed net per share
 * the trade would really be done at (`effectiveLimit()` in rules.js, which is
 * `min(limit, ask)` on a debit and never the number typed), and with none the
 * mid is used exactly as before — every existing caller is unchanged.
 *
 * `entryMid` and `entrySource` always travel, because the mid is still the
 * honest "what it is worth" and a screen must be able to print both without
 * deciding which is which for itself. The LEG marks, the greeks and the
 * volatility are untouched: those are properties of the chain, not of the
 * price you chose to pay.
 */
export function analyze(legs, S, dte, baseIV, q, opts = {}) {
  const legPx = legs.map((l) => priceLeg(l, S, dte, baseIV, q));
  const ivMap = legPx.map((p) => p.iv);
  const entryMid = legs.reduce((a, l, i) => a + Math.sign(l.side) * l.qty * legPx[i].px, 0);
  const override = Number(opts && opts.net);
  const usesOverride = Number.isFinite(override);
  const entry = usesOverride ? override : entryMid;
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
    entry, entryMid, entrySource: usesOverride ? "limit" : "mid", curve,
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
  const tally = { liquidity: 0, spread: 0, comboSpread: 0, reward: 0, skipped: 0, spreadSkipped: 0,
    comboSpreadSkipped: 0, unpriceable: 0, impossible: 0, model: 0 };
  /* >>> THIS IS A GENERATION SITE, SO IT WILL NOT OFFER WHAT THE GATE REFUSES
     (P9, TASK 1). <<< The guard is IN the function and not at its call sites,
     for the same reason `buildPresets()` refuses a null board inside itself: a
     fourth caller added next year is covered without anybody coming back.
     `offFloor` is a separate answer from an empty list — the board did not
     empty, it was never one this app opens on — and it travels with its own
     name so the screen can print a sentence instead of a shrug. */
  if (!openableBoard(dte)) {
    return { rows, cut, oiSkipped: false, offFloor: entryRoom(dte), tally };
  }
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
    // AND A PRICE THE MODEL CANNOT ACCOUNT FOR (src/rules.js, `modelSanity`).
    // Third question, third refusal, and it is not either of the two above: the
    // price was read and it clears the absolute minimum, it is simply not this
    // structure's price. The BOIL 20/21 spread that reached the broker priced
    // at $0.05 against a model value of $0.333 — one cent above the floor built
    // to catch the $0 butterfly, and wrong by a factor of 6.7.
    const ms = modelCheckOf(a, { legs: p.legs, spot: S, dte, iv: baseIV });
    if (!ms.pass) {
      tally.model++;
      cut.push({ name: p.name, reasons: [ms.reason], why: "model" });
      continue;
    }
    // The two-sided quotes go in as well now: the SPREAD floor reads them, and
    // it is a different question from the headcount the liquidity floor asks.
    // A leg can have 300 contracts open and a market 145% of the mid wide.
    const qf = qualityFloor({
      openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level,
      // AND THE LEGS, because the COMBINATION spread floor needs to know which
      // side of each leg trades. The pair is not the legs: UNG's 10.50/11.00
      // call spread passed the per-leg test on both legs and its combination
      // was 143% of its own mid wide (src/rules.js, `comboSpreadFloor`).
      quotes: quotesOf(a), legs: p.legs,
      maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
    });
    if (!qf.liquidity.checked) { oiSkipped = true; tally.skipped++; }
    if (!qf.spread.checked) tally.spreadSkipped++;
    if (!qf.comboSpread.checked) tally.comboSpreadSkipped++;
    if (qf.pass) rows.push({ p, a });
    else {
      // WHICH FLOOR DID THE WORK, in the order they are applied. Pooling them
      // would leave the screen unable to say whether the leg was untraded or
      // simply unpriced, which are different faults with different answers.
      const why = !qf.liquidity.pass ? "liquidity" : !qf.spread.pass ? "spread"
        : !qf.comboSpread.pass ? "comboSpread" : "reward";
      tally[why]++;
      cut.push({ name: p.name, reasons: qf.reasons, why });
    }
  }
  return { rows, cut, oiSkipped, tally: { ...tally, kept: rows.length } };
}

/* ============================== THE ONE CHANCE + BACKTEST STORICO ==============================

   `montecarlo(legs, S, dte, entry, sigma, monthlyMean, nSim = 8000)` USED TO
   LIVE HERE. It was 8,000 UNSEEDED runs — `Math.random` — drifting on the
   seasonal monthly means, and it fed exactly one panel on the Build screen
   while every other screen in this app printed "the chance" from a closed form
   with a different drift. Two faults in one function: a fourth arithmetic for
   one question, and an answer that changed every time the button was pressed.

   Both are gone. `terminalMC()` in engine.js is the arithmetic, `chanceOf()` in
   rules.js is the policy around it, and `chanceFor()` below is the ONE place
   this file spells it. The seed comes from the position, so the number on this
   panel is the number on the Shortlist row, the Radar row, the Guardian and the
   autopilot's brief — by construction rather than by coincidence.
============================================================================== */
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
// `journalSeq` is the highest position ref this state has ever issued. It only
// ever goes up: closing a position does not hand its number back (src/journal.js).
const EMPTY = { journalSeq: 0, saved: [], positions: [], expiryLog: [], settings: { webhook: "", reportFreq: "weekly", reportLast: 0, reportLastMd: "", capital: null, concurrentTarget: null, savings: null, sizeOverride: null, mode: "pro", onboarded: false, notifyWhenReady: false }, seasonal: {}, journal: [], ivHist: {}, copilotLog: [] };
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
/* THE OFFLINE BANNER — the counterpart to the service worker's one rule.
 *
 * Installed on a home screen, this app opens with no network at all, and every
 * screen it opens on was written on the assumption that a number on it is a
 * number from today. `public/sw.js` never caches a price, a position or an
 * order, so offline the fetches simply fail and the screens already say
 * "prices not loaded" and print dashes where a figure would be. That is the
 * truth, but it reads like a fault.
 *
 * This says which it is, in the app's own voice, on every screen. It does not
 * guess: `navigator.onLine` is the browser's own answer and the two events are
 * the browser telling us it changed. It never hides a number and it never shows
 * one — the app's existing empty states do that work. */
const OfflineBanner = () => {
  const [off, setOff] = useState(typeof navigator !== "undefined" && navigator.onLine === false);
  useEffect(() => {
    const on = () => setOff(false), down = () => setOff(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", down); };
  }, []);
  if (!off) return null;
  return (
    <div style={{ ...mono, fontSize: 11.5, color: T.amber, background: `${T.amber}12`, borderBottom: `1px solid ${T.amber}44`,
      padding: "9px 14px", display: "flex", gap: 8, alignItems: "center", justifyContent: "center", flexWrap: "wrap", textAlign: "center" }}>
      <WifiOff size={13} style={{ flexShrink: 0 }} />
      Offline — no live data. Nothing on screen is a current price, and no order can be sent until you are back on a network.
    </div>
  );
};
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
      {/* WHY THE FLOOR IS RELATIVE. Worth reading ONCE; the four buttons
          below it are what the reader came for (P9, TASK 3). */}
      <Fold label="why relative" tone={T.body} style={{ marginTop: 8 }}
        summary={`A leg is judged against the other strikes on its own expiry, never against one number picked for every market.`}>
        <div style={{ ...sansUI, fontSize: 13, color: T.body, lineHeight: 1.55, marginTop: 6 }}>
          {RULES.minOpenInterestAbsolute} open contracts means one thing on a busy board and another on a quiet
          one. Underneath the relative test sits an absolute minimum, so a chain where nothing trades cannot
          pass itself by being uniformly empty.
        </div>
      </Fold>

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
            `${here.spread ? ` \u00b7 ${here.spread} removed because one leg's own market is too wide` : ""}` +
            // THE PAIR, NAMED SEPARATELY FROM THE LEG. It does not move with
            // this setting either, and the two are different faults.
            `${here.comboSpread ? ` \u00b7 ${here.comboSpread} removed because the WHOLE combination is too wide, though each leg is fine` : ""}` +
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

      {/* WHERE THE TWO NUMBERS CAME FROM. It is PROVENANCE — a reading of
          1,654 contracts on one close — and provenance is what somebody
          checks, not what they read on the way past (P9, TASK 3). */}
      <Fold label="where these numbers come from" tone={T.dim} style={{ marginTop: 8 }}
        summary={`Both floor numbers are measured, not chosen: ${LIQUIDITY_MEASUREMENT.markets} live chains on the ${LIQUIDITY_MEASUREMENT.asOf} close.`}>
        <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
          {liquidityMeasurementNote()}
        </div>
      </Fold>
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
      {/* THIS PANEL IS INSTRUMENTATION, NOT A DECISION (P9, TASK 3). It exists
          so the floor can be settled from a live screen instead of re-argued
          from one walkthrough — a question somebody ASKS, which is exactly
          what a fold is for. The table itself stays on screen; only the
          paragraph explaining why it is here folds. */}
      <Fold label="what am I looking at" tone={T.mut} style={{ marginTop: 8 }}
        summary={`Near the money (within 10% of spot) is the row that matters: that is where these structures get built.`}>
        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 6, lineHeight: 1.6 }}>
          {`The floor in force rejects a leg below the ${ordinal(percentile * 100)} percentile of its own expiry, and never accepts one under ${floor} open contracts. Whether those are the right numbers is a question about real chains, not about the code, so here is what the ${rows.length === 1 ? "one chain" : "chains"} loaded in this session ${rows.length === 1 ? "contains" : "contain"}.`}
        </div>
      </Fold>
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

/* ====================================================================
   THE TRADE CARD — FIVE FIXED LINES (ROADMAP P4, PRD §4n).

   What you are betting on, what you risk, how often it works, when it exits,
   what would invalidate it. The sentences are generated in `rules.js` by
   `tradeCard()`, with every other generated sentence, so they cannot drift
   from the numbers they describe — and no number on this card is new: it is
   `analyze()` at the price that will be sent, `chanceOf()`'s one simulation,
   `sizing()`'s limits through the gate, and the rules themselves.

   >>> A REFUSAL IS NEVER BEHIND A TAP. <<< Anything that stops the order — a
   gate violation, an unpriceable leg, a contract the chain never listed —
   renders HERE, beside the button, under the same rule as "an order that fails
   must fail where the button is". The tap only ever hides numbers that explain
   a trade, never a reason it cannot be made.

   LAID OUT FOR A 390px PHONE: one column, a 18px rail for the line number, no
   horizontal scroll, and every control at least 44px tall.
==================================================================== */
export function TradeCard({ ticker, name, card, refusals = [], warnings = 0, onNumbers, onOrder, orderLabel, children }) {
  if (!card) return null;
  return (
    <div style={{ marginTop: 14, padding: "12px 13px", background: T.panel, border: `1px solid ${T.violet}66`, borderLeft: `3px solid ${T.violet}`, borderRadius: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
        <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.violet }}>THE TRADE</div>
        <div style={{ ...mono, fontSize: 9.5, color: T.dim }}>FIGURES IN {CARD_CURRENCY.toUpperCase()}</div>
      </div>
      <div style={{ ...sansUI, fontSize: 17, fontWeight: 800, color: T.ink, marginTop: 3, lineHeight: 1.3 }}>
        {ticker} · {name}
      </div>
      <div style={{ display: "grid", gap: 11, marginTop: 12 }}>
        {card.lines.map((l, i) => (
          <div key={l.id} style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", gap: 8, alignItems: "start" }}>
            <div style={{ ...mono, fontSize: 11.5, fontWeight: 800, color: T.violet, lineHeight: 1.6 }}>{i + 1}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ ...mono, fontSize: 9.5, letterSpacing: 0.4, color: T.dim, fontWeight: 700 }}>{l.label}</div>
              <div style={{ ...sansUI, fontSize: 14, color: T.body, lineHeight: 1.55, marginTop: 2 }}>{l.text}</div>
            </div>
          </div>
        ))}
      </div>

      {/* THE REFUSALS, ON THE FIRST SCREEN, ALWAYS. */}
      {refusals.length > 0 && (
        <div style={{ marginTop: 12, padding: "9px 11px", background: `${T.red}12`, border: `1px solid ${T.red}88`, borderRadius: 7 }}>
          <div style={{ ...mono, fontSize: 10.5, color: T.red, fontWeight: 800, letterSpacing: 0.4 }}>
            ✗ THIS ORDER WOULD NOT BE SENT
          </div>
          <div style={{ display: "grid", gap: 7, marginTop: 6 }}>
            {refusals.map((r) => (
              <div key={r.code} style={{ ...sansUI, fontSize: 13, color: T.body, lineHeight: 1.55 }}>{r.message}</div>
            ))}
          </div>
        </div>
      )}
      {children}

      <div style={{ display: "flex", gap: 8, marginTop: 13, flexWrap: "wrap" }}>
        <Btn ghost color={T.blue} onClick={onNumbers}>All the numbers →</Btn>
        <Btn color={T.violet} onClick={onOrder}>{orderLabel || "Price it and send →"}</Btn>
      </div>
      {/* >>> A REFUSAL AND A REASSURANCE MAY NOT SHARE A CARD (P9, TASK 1). <<<
          The owner read "THIS ORDER WOULD NOT BE SENT" and, four lines below
          it, "none of them stops the order". Both clauses were true of
          different things — the first of a VIOLATION, the second of the
          WARNINGS — and together they are §4m's fault on the card P4-ter built
          to end it: a screen arguing with itself, where the part that shouts
          loudest wins. While a violation stands, the refusal above is the whole
          verdict and this line is suppressed. It is not deleted: the warnings
          keep their home in the panel the sentence points at. */}
      {warnings > 0 && refusals.length === 0 && (
        <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 7, lineHeight: 1.6 }}>
          {`${warnings} warning${warnings === 1 ? "" : "s"} apply to this trade. ${warnings === 1 ? "It is" : "They are"} in the warnings panel above, written once — none of them stops the order.`}
        </div>
      )}
      {warnings > 0 && refusals.length > 0 && (
        <div style={{ ...mono, fontSize: 10, color: T.amber, marginTop: 7, lineHeight: 1.6 }}>
          {`${warnings} warning${warnings === 1 ? "" : "s"} also apply, in the warnings panel above. The refusal above is what decides: nothing is sent while it stands.`}
        </div>
      )}
      <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 7, lineHeight: 1.6 }}>{card.currency}</div>
    </div>
  );
}

/* ====================================================================
   THE WARNINGS, ONCE.

   >>> COUNTED ON THE OWNER'S PHONE, one Build screen, UNG 2026-09-20. <<<
   The four-factor CONFLICT paragraph — the same ~400 characters — was on that
   page FOUR TIMES: inside "Why this trade", again in the amber
   against-the-signal block, again in the order ticket's warning list, and
   again in "The checks that run when you tap". The gate embeds
   `signals.narrative` in its SIGNAL_CONFLICT warning because the gate has no
   screen of its own, so every surface rendering a gate verdict printed the
   paragraph a second time beside the panel that already carried it.

   ONE PLACE, COLLAPSED, WITH THE NUMBER IN THE SUMMARY LINE. The narrative
   keeps its home — the evidence panel — and everything here carries the count
   and a pointer (`warningsToPrint()` / `conflictSummaryLine()` in rules.js).
   The gate is UNCHANGED: what changed is what a screen prints.

   IT OPENS BY ITSELF WHEN SOMETHING IS REQUIRED OF THE USER. A textarea that
   unlocks the ticket cannot be behind a tap nobody knows to make.
==================================================================== */
function BuildWarnings({ summary, count, forceOpen = false, children }) {
  const [open, setOpen] = useState(false);
  const shown = open || forceOpen;
  if (!count) return null;
  return (
    <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.amber}0d`, border: `1px solid ${T.amber}66`, borderRadius: 8 }}>
      <button onClick={() => setOpen((o) => !o)} disabled={forceOpen}
        style={{ display: "flex", gap: 8, alignItems: "baseline", width: "100%", textAlign: "left",
          background: "transparent", border: "none", padding: 0, cursor: forceOpen ? "default" : "pointer" }}>
        <span style={{ ...mono, fontSize: 10, fontWeight: 800, color: T.amber, letterSpacing: 0.4 }}>
          ⚠ {count} WARNING{count === 1 ? "" : "S"}
        </span>
        <span style={{ fontSize: 12.5, color: T.body, lineHeight: 1.5 }}>{summary}</span>
        {!forceOpen && (
          <span style={{ ...mono, fontSize: 10.5, color: T.blue, marginLeft: "auto", whiteSpace: "nowrap" }}>
            {shown ? "hide ▲" : "read them ▼"}
          </span>
        )}
      </button>
      {shown && <div style={{ marginTop: 9 }}>{children}</div>}
    </div>
  );
}

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
  const [dteManual, setDteManual] = useState(RULES.targetEntryDTE);
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
  const [bt, setBt] = useState(null);
  const [alpaca, setAlpaca] = useState(null);    // account info
  const [confirmSend, setConfirmSend] = useState(false);
  /* ---- HOW MANY COMBINATIONS — ONE HOME, READ EVERYWHERE (ROADMAP P1) ----

     MEASURED: this number lived inside `OrderTicket` as `cfg.qty`, which meant
     the ticket sized the order correctly and NOTHING ELSE on the screen knew.
     The risk gate ran at a hardcoded `contracts: 1` in four places here, so a
     seven-lot spread was measured against the 5% per-trade cap as a one-lot
     one; `commitPosition()` then wrote a position with no size at all, and the
     25% total-exposure ceiling counted it as a single contract for the rest of
     its life. A cap that reads the wrong quantity is not a display bug.

     It is a piece of Build-screen state like `legs` and `dte`, so it lives with
     them, above the ticket, the confirm step, the gate preview and the position
     that gets written. The ticket is now a controlled input on it. */
  /* >>> AND IT IS DERIVED FROM THE BUDGET UNLESS SOMEBODY TYPES ONE (P10 §2).
     <<< The state here is the OVERRIDE, not the size: `contractsTyped` is null
     until the user sets a quantity by hand, and `contracts` below is read off
     the request the same way the Shortlist reads it. The owner's "pt. 1" was
     that what the budget decides has to be the count the Shortlist shows, Build
     loads and the ticket sends; a size that reset to 1 on the way to Build was
     a budget answered once and thrown away three screens later. */
  const [contractsTyped, setContractsTyped] = useState(null);
  /* Changing the market or the expiry RE-DERIVES the size from the budget; it
     does not forget it. "×7" typed against a butterfly is not an answer about
     the vertical that replaced it — so the typed override is dropped — but the
     budget is an answer about the USER, not about the structure, and it
     survives.

     THE REF IS NOT DECORATION. `openOnBuild()` sets the ticker, the expiry AND
     the size in one go, and a re-price hands back the size the order was sent
     at. Without this guard the effect would fire on the ticker it just set and
     drop an override the user had already made. */
  const sizedFor = useRef(null);
  useEffect(() => {
    const key = `${ticker}|${expKey}`;
    if (sizedFor.current === key) return;
    sizedFor.current = key;
    setContractsTyped(null);
    // ...and the PRICE with it, for the same reason: a per-leg limit typed
    // against a butterfly is not an answer about the vertical that replaced it.
    setTicket((t) => ({ ...t, legPx: null }));
  }, [ticker, expKey]);
  // THE COPILOT'S CONVERSATION LIVES HERE, not inside the panel. The panel is
  // an evidence panel: every other chip in the strip unmounts it, so state kept
  // inside it was destroyed on the next tap and an answer that landed while it
  // was shut never reached the screen at all.
  const [copilot, setCopilot] = useState({ msgs: [], busy: false, err: null, partial: "" });
  /* AND SO DOES THE TECHNICAL COPILOT'S, for the same reason, and its BARS
     with it. `PriceChart` fetches the daily history once per ticker and hands
     it up here; the copilot under it reads the SAME bars rather than fetching
     a second copy — one fetch, one history, one set of indicators, which is
     the whole reason `indicators.js` exists. */
  const [taChat, setTaChat] = useState({ msgs: [], busy: false, err: null, partial: "" });
  const [taBars, setTaBars] = useState(null);
  useEffect(() => { setTaBars(null); setTaChat({ msgs: [], busy: false, err: null, partial: "" }); }, [ticker]);
  /* >>> ONE STATE FOR "WHAT I WANT", ABOVE BOTH DOORS (ROADMAP P10 §2). <<<
     `optMode` / `optAmt` lived here and the guided run had its own `wiz.risk`:
     two homes for one answer, which is the shape CLAUDE.md's standing rule is
     about. There is one now. Every field is NULL until answered — the amount
     falls back to `limits.perTradeLimit`, DERIVED and never typed, and
     `request.amtAnswered` is how every screen knows to call it a suggestion
     rather than quoting a figure the user never chose back at them. */
  const [want, setWant] = useState({ mode: "budget", amt: null, minChance: null });
  const request = useMemo(() => requestOf(want, limits), [want, limits]);
  const [autoMon, setAutoMon] = useState(true);
  // THE CLOSE ASKS WHY. `{ id, written, err }` while a close is being written.
  const [closing, setClosing] = useState(null);
  // The Journal's search box. Sorted and searched by ref (src/journal.js).
  const [jq, setJq] = useState("");
  const [optLeg, setOptLeg] = useState(null); // {occ, label, quote}
  // What re-snapping the legs onto a new board moved, in one sentence, until
  // the next board change. A strike that moves under the reader without a word
  // is the same fault as a size the app assumed and printed as measured.
  const [snapNote, setSnapNote] = useState(null);
  /* WHICH SHEET IS OPEN OVER THE DECISION AREA (PRD §4n, ROADMAP P4).
     The Build screen's decision is FIVE LINES; the numbers behind them and the
     ticket that sends them open OVER the step, never under it — the same
     pattern and the same component as the evidence panels, for the same reason
     a panel written 2,000px down a page looked on a phone like a tap that did
     nothing. One at a time: null | "numbers" | "order". */
  const [deskSheet, setDeskSheet] = useState(null);
  const [alSync, setAlSync] = useState({ orders: [], positions: [], t: 0 });
  const [ta, setTa] = useState({}); // per ticker
  const [replay, setReplay] = useState(null);
  const [nf, setNf] = useState({ tk: "ALL", kind: "all", q: "", days: 7 });
  /* THE WIDE SEARCH OPENS ON THE MARKETS THAT HAVE SOMETHING TO FIND. It
     started on SOYB, CORN and UNG, and the first two are the two chains this
     app measured producing "0 of 2 shown" and a screen of refusal text. The
     selection is the user's — every market in the basket is one tap away right
     under it — but the default it offers should be a search with results in it
     (ROADMAP P2-bis). */
  const [multi, setMulti] = useState({ sel: ["GLD", "SLV", "USO"], busy: false, res: null, err: null, dteT: RULES.targetEntryDTE, senMode: "auto" });
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
    basket: BASKET, horizon: null,
    weights: { ...DRIVER_PRESETS.balanced }, priority: "balanced", busy: false, err: null,
  });
  /* >>> `risk` IS NOT IN `wiz` ANY MORE, AND THAT IS THE POINT (P10 §2). <<<
     The guided run's budget and the desk's budget were two states holding one
     answer. `want.amt` is the one home; this is the wizard's READING of it, and
     it stays NULL until the user answers — `request.amt` carries the derived
     suggestion for screens that must print something, and this carries the
     ANSWER, which is what the wizard may quote back and what its button waits
     for. `setWizAnswers()` splits a write to `risk` back to that one home. */
  const wizAnswers = useMemo(
    () => ({ ...wiz, risk: request.amtAnswered ? request.amt : null }), [wiz, request]);
  const setWizAnswers = useCallback((next) => {
    const { risk, ...rest } = next || {};
    setWant((w) => (risk === w.amt ? w : { ...w, amt: risk == null ? null : risk }));
    setWiz((w) => ({ ...w, ...rest }));
  }, []);
  const [optRef, setOptRef] = useState(null); // price snapshot from the Shortlist, to reconcile against the Build screen
  const [weather, setWeather] = useState(null);  // regionId -> forecast 14g (fuseSignals)
  const [barsCache, setBarsCache] = useState({}); // ticker -> daily bars (fattore tecnico)
  const [against, setAgainst] = useState({ reason: "" }); // motivazione per un trade contro il segnale
  /* THE ENTRY-ROOM OVERRIDE (src/rules.js, `entryRoom`). The same written-reason
     mechanism as `against` above and as the per-trade cap in `sizing()`, and the
     same constant behind all three. It unlocks ONE band — past the exit rule,
     under the entry floor — and nothing unlocks a board inside the exit window. */
  const [roomReason, setRoomReason] = useState("");
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
  // NO `sigma` HERE. This fallback used to carry `sigma: U.sigma`, which was a
  // second place deciding which realised volatility is in force when nothing
  // is loaded — `sigmaProvenance()` is the one that decides that now, and
  // nothing on this screen reads a realised volatility off `seas` at all.
  /* AND `monthlyMean` MAY BE NULL. The liquid tier carries no hand-written row
     at all, so a market whose Alpha Vantage history has not loaded has UNKNOWN
     seasonality rather than an estimate — every reader of `seas.monthlyMean`
     below checks before it indexes. */
  const seas = seasonal[ticker] || { monthlyMean: U.monthlyMean || null, matrix: null, years: null, src: null };
  const seasProv = seasonalOf(seasonal, ticker);
  const seasNow = seasonalNowOf(seasonal, ticker);
  const iv = U.iv;
  const dte = expKey && chain?.byExp[expKey] ? chain.byExp[expKey].dte : dteManual;
  /* ONE IMPLEMENTATION OF "WHICH STRIKES DOES THIS BOARD CARRY". This was a
     second copy of `expiryStrikes()` in chain.js, written out again here and
     twice more below in the wide search and the guided run — four answers to
     one question, any of which could have been corrected without the others.
     A strike is a fact about a board, so the board decides. */
  const expStrikes = useMemo(() => expiryStrikes(chain, expKey), [chain, expKey]);
  const q = useMemo(() => makeQuote(chain, expKey), [chain, expKey]);

  /* ---- a hand-off ends where the trade is ---- */
  useEffect(() => {
    if (!scrollBuild) return;
    buildAnchor.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [scrollBuild]);

  /* ---- THE OPEN INTEREST THE FLOOR JUDGES IS THE OPEN INTEREST ON SCREEN ----

     >>> READ ON THE OWNER'S PHONE, 21 Sep 2026, one session, one chain. <<<
     The Radar said "on BOIL, WEAT, USO, SLV and GDX the feed reported no open
     interest at all, so the liquidity floor was SKIPPED" — while the GDX
     2026-10-30 chain on screen printed open interest per strike, the Shortlist
     read its near-the-money median at 84 and removed "the 63 emptiest of the
     96 contracts", and the wizard's number-one road was a butterfly with legs
     at OI 3 and OI 4.

     TWO PATHS, TWO VERDICTS, ONE CHAIN, and the difference is a return value.
     Open interest is not in an option snapshot: it is fetched separately and
     PATCHED IN, so `refreshChain()` sets the bare chain, fires the enrichment
     and returns the BARE one. The Shortlist reads `chains[tk]` out of state,
     which by then carries the numbers; the wizard and the wide search read
     what `refreshChain()` handed back, which never does. So one path judged a
     chain with open interest and the other called the same chain unreported.

     `ensureOpenInterest()` is the one home. The SCREEN is still never made to
     wait — `refreshChain()` fires this and does not await it, exactly as
     before — but a caller that is about to apply a liquidity floor awaits the
     answer instead of judging a column that has not landed. The promise is
     memoised per ticker so the two callers share one fetch, and a chain that
     genuinely carries no open interest still comes back unreported, because
     UNKNOWN IS NOT LOW and that half is right. */
  const oiInFlight = useRef(new Map());
  const ensureOpenInterest = useCallback(async (tk, c) => {
    if (!c || hasOpenInterest(c)) return c;
    let pending = oiInFlight.current.get(c);
    if (!pending) {
      pending = enrichOpenInterest(tk, c)
        .then((withOI) => {
          if (withOI) setChains((m) => (m[tk] === c ? { ...m, [tk]: withOI } : m));
          return withOI || c;
        })
        // A missing column is never a failed load: the chain comes back as it
        // was and the floor reports SKIPPED, which is the truth about it.
        .catch(() => c)
        .finally(() => { oiInFlight.current.delete(c); });
      oiInFlight.current.set(c, pending);
    }
    return pending;
  }, []);

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
      // Fired, never awaited — the screen does not wait for a nice-to-have.
      // A caller that is about to judge a liquidity floor awaits the same
      // promise through `ensureOpenInterest()`, and gets this one fetch.
      ensureOpenInterest(tk, c);
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
  }, [ensureOpenInterest]);

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
      // EVERY POSITION HAS A REF, INCLUDING THE ONES OPENED BEFORE THERE WERE
      // REFS. A position saved by an older build has a timeline and no ref and
      // no sequences; it gets both here, once, and the counter moves with it so
      // no number is ever handed out twice. Autopilot entries merged from
      // `/api/state` a moment ago are numbered by the same pass — they arrive in
      // the MIDDLE of the list by time while being the last thing recorded.
      let seq = Math.max(0, +st.journalSeq || 0,
        ...[...(st.positions || []), ...(st.journal || [])].map((x) => refNumber(x && x.ref) || 0));
      // AND EVERY POSITION HAS A SIZE, INCLUDING THE ONES OPENED BEFORE THE
      // APP RECORDED ONE. Nothing ever wrote `contracts`, so every position
      // saved by an earlier build carries no size at all and there is no way to
      // recover it — the order is gone and the record never held it. It is read
      // as one combination, which under-counts exposure rather than over-counts
      // it (the direction that refuses trades rather than letting them through),
      // and `withPositionSize()` marks it as ASSUMED so no screen can print it
      // as a size somebody chose.
      st.positions = (st.positions || []).map((p) => {
        const withRef = p.ref ? p : { ...p, ref: nextRef({ journalSeq: seq++ }).ref };
        return stampTimeline(withPositionSize(withRef));
      });
      st.journalSeq = seq;
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
          setStore((s) => {
            // The demo's three positions are positions, so they get refs and
            // sequences like any other. A visitor who opens the Journal and
            // finds rows with no ref is looking at a different app.
            let n = refCounter(s);
            const withRefs = seeded.map((p) => stampTimeline({ ...p, ref: nextRef({ journalSeq: n++ }).ref }));
            const ns = { ...s, positions: withRefs, journalSeq: n };
            saveState(ns); return ns;
          });
        }
      }
      setMsg(null);
      setBusy(null);
      // SEASONALITY FOR THE WHOLE BASKET, AFTER the chains are on screen.
      // It is the heaviest of the four weights and the hand-written table it
      // falls back to is wrong on eight months of twelve for CORN, so every
      // market needs the real series — but nothing waits for it, and the
      // seven-day server cache is what makes ten calls affordable against a
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
  /* >>> WHICH BOARDS A DROPDOWN MAY OFFER — ONE LIST, TWO SCREENS (P10 §2).
     <<< The controls block on the Radar and the expiry dropdown on the
     Shortlist are the same question, and a second spelling of "which boards may
     be offered" is how the two come to disagree. `buildableExpiries()` decides
     what the gate would pass WITHOUT an override; a refused board is still
     RENDERED and NAMED, disabled — the `strikeOptions()` / `offFloorExpiryLabel()`
     pattern, because a list that silently drops a row teaches nothing and a
     `<select>` whose value matches no option displays the first one. The board
     already selected is always offered, however it got there. */
  const expiryMenu = useMemo(() => expiryOptions.map((e) => ({
    key: e.key, dte: e.dte,
    buildable: openableBoard(e.dte) || e.key === expKey,
    label: offFloorExpiryLabel(e.key, e.dte),
  })), [expiryOptions, expKey]);

  /* INSTRUMENTING THE ENTRY FLOOR SO IT CAN BE CALIBRATED FROM A READING
     (src/rules.js, `passedOverRecord`; ROADMAP P5).

     `minEntryDTE` is 30 and nobody has ever measured it — it is an inherited
     tastytrade default, like the rest of §4. The evidence that would settle it
     is how often the floor takes a genuinely busier board away, on which
     market, and by how much. That happens as the owner uses the app, so it is
     RECORDED rather than argued about: one row per market per board, capped,
     local, and read back in the Journal.

     ONE ROW PER MARKET PER BOARD, not per render. `expChoice` recomputes on
     every chain refresh and every move of the liquidity setting; without the
     key check below the log would fill with the same fact. */
  const EXPIRY_LOG_MAX = 60;
  useEffect(() => {
    const row = passedOverRecord(ticker, expChoice);
    if (!row) return;
    setStore((st) => {
      const log = st.expiryLog || [];
      const seen = log.some((x) => x && x.ticker === row.ticker
        && x.chosen?.key === row.chosen.key && x.passedOver?.key === row.passedOver.key);
      if (seen) return st;                       // nothing changed: no write, no render loop
      const ns = { ...st, expiryLog: [row, ...log].slice(0, EXPIRY_LOG_MAX) };
      saveState(ns);
      return ns;
    });
  }, [ticker, expChoice]); // eslint-disable-line

  useEffect(() => {
    if (chain && !expKey) {
      // Never nothing: with no eligible expiry at all the app still opens on
      // the board the feed gave it rather than showing an empty screen, and
      // the risk gate refuses the entry by name (ENTRY_DTE) if it is too near.
      setExpKey(expChoice.chosen?.key || chain.expirations[0] || null);
    }
  }, [chain, expKey, expChoice]);
  /* NOTHING IS BUILT UNTIL THE BOARD IS KNOWN. `buildPresets()` returns an
     empty list without one (see its comment), so this waits instead of
     inventing: the chain arrives a render or two later and the effect fires
     again on `expStrikes`. An empty legs editor for one render is a far
     smaller failure than a default trade naming a contract nobody issued. */
  useEffect(() => {
    if (!spot || !expStrikes || legs.length !== 0) return;
    const first = buildPresets(sentiment, spot, U.step, expStrikes)[0];
    if (first) setLegs(first.legs);
  }, [spot, expStrikes]); // eslint-disable-line

  /* AND WHATEVER IS ALREADY IN STATE MOVES ONTO THE BOARD WHEN IT ARRIVES.
     `resnapTo()` below covers the expiry dropdown, where the target board is
     read straight off the chain inside the handler. It cannot cover the case
     this effect is for: legs that were in state BEFORE any board was loaded —
     carried in by `goStep()`, which moves the path to Build with the state
     legs exactly as they are, or left over from a ticker that had a chain.
     `resnapLegs()` returns the SAME array when nothing moves, so React bails
     out of the update and this cannot loop; and a board that never loads is
     left alone rather than snapped against a fallback grid. */
  useEffect(() => {
    if (!expStrikes) return;
    setLegs((L) => {
      if (!L.length) return L;
      const r = resnapLegs(L, expStrikes);
      if (r.moved.length) setSnapNote(strikeSnapNote(r.moved, expKey));
      return r.legs;
    });
  }, [expStrikes]); // eslint-disable-line

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

  const switchTicker = (tk) => { setTicker(tk); setExpKey(null); setLegs([]); setBt(null); setAgainst({ reason: "" }); if (!chains[tk]) refreshChain(tk); };

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
    // NULL, NEVER A ZERO NOBODY MEASURED. `seasonalComponent()` reads a null
    // as "no seasonal history for this market" and says so on the bar; a 0
    // would read as a market measured to have no seasonal edge.
    seasonalMean: seasonalNowOf(seasonal, tk),
  }), [weather, newsPool, barsCache, seasonal]);

  const fused = useMemo(
    () => Object.fromEntries(Object.keys(UNDERLYINGS).map((tk) => [tk, fuseFor(tk)])),
    [fuseFor]
  );

  /* ---- analisi ---- */
  /* `A` IS THE STRUCTURE AT THE MID — what it is WORTH. It is still the honest
     answer to that question and it is still on screen. It is no longer the
     answer to "what will this trade do", because that depends on the price it
     will be done at: see `AE` below. */
  const A = useMemo(() => (spot && legs.length ? analyze(legs, spot, dte, iv, q) : null), [legs, spot, dte, iv, q]);

  /* ===================================================================
     THE PRICE THE ORDER WILL BE SENT AT IS BUILD-SCREEN STATE.

     It lived inside `OrderTicket` as `cfg`, exactly as the quantity did before
     PR #23 — so the screen above the ticket had no idea what price it was
     about to send, and every figure on it was worked out from the MID while
     the ticket two thousand pixels below said a limit at the mid does not
     fill. Type, time in force and ONE PRICE PER LEG live here now; the ticket
     is a controlled input on them, like the quantity field beside it.

     `legPx` is null until the user moves something, and the seed is derived
     (`legLimitSeed()` in rules.js): a stored seed would go stale the moment
     the chain refreshed, and a stale seed presented as the user's price is the
     same fault as a suggested capital figure quoted back as his answer.
  =================================================================== */
  const [ticket, setTicket] = useState({ type: "limit", tif: "day", legPx: null });
  const bookQuotes = useMemo(
    // THE OCC TRAVELS WITH THE QUOTE, for the same reason the bid and the
    // sizes do: the ticket has to be able to see that the chain never listed a
    // leg, and a mid can never show that. It is what the ticket hands the gate
    // as `occs`, and what it names the contracts with when it sends.
    () => (A ? A.legPx.map((l) => ({ bid: l.bid, ask: l.ask, mid: l.px, bidSize: l.bidSize, askSize: l.askSize, occ: l.occ || null })) : []),
    [A]);
  const book = useMemo(() => comboBook(legs, bookQuotes), [legs, bookQuotes]);
  const seedPx = useMemo(() => legLimitSeed(legs, bookQuotes), [legs, bookQuotes]);
  /* THE USER'S PRICES, OR THE SEED — never a mix. A `legPx` of the wrong
     length belongs to a structure that is no longer on screen. */
  const legPrices = useMemo(
    () => (Array.isArray(ticket.legPx) && ticket.legPx.length === legs.length ? ticket.legPx : seedPx),
    [ticket.legPx, seedPx, legs.length]);
  /* THE NET IS DERIVED FROM THE LEGS, which is the reverse of the single net
     field the ticket had, and is the direction the owner thinks in. */
  const ticketNet = useMemo(() => netFromLegs(legs, legPrices || []), [legs, legPrices]);
  const ticketDir = useMemo(
    () => (book.ok ? (book.mid >= 0 ? 1 : -1) : (A && A.entry < 0 ? -1 : 1)),
    [book, A]);
  /* A LIMIT IS A CEILING, NOT A PRICE (src/rules.js, `effectiveLimit`). An
     order at or past the touch fills AT the touch, so the price that decides
     the trade is `min(limit, ask)` on a debit — never the number typed. A
     MARKET order has no limit at all: it takes the touch, and that is what
     every figure below is then worked out at. */
  const effective = useMemo(() => {
    if (ticket.type === "market") {
      if (!book.ok) return { known: false, dir: ticketDir, typed: null, touch: null, effective: null, net: null, capped: false, give: null };
      const touch = Math.abs(book.ask);
      return { known: true, dir: ticketDir, typed: null, touch, effective: touch, net: ticketDir * touch, capped: true, give: 0 };
    }
    return effectiveLimit(ticketNet.net == null ? null : Math.abs(ticketNet.net), book, ticketDir);
  }, [ticket.type, book, ticketNet, ticketDir]);
  /* >>> AND THIS IS THE ANALYSIS EVERY FIGURE ON THE SCREEN READS. <<<
     Same legs, same chain, same volatility — one different number, the entry
     price, and on UNG it is the difference between 2.6:1 and 1.1:1. With no
     readable price it falls back to `A`, which is the old behaviour and says
     so rather than blanking the screen. */
  const AE = useMemo(() => {
    if (!A) return null;
    if (!Number.isFinite(effective.net)) return A;
    return analyze(legs, spot, dte, iv, q, { net: effective.net });
  }, [A, effective.net, legs, spot, dte, iv, q]);
  /* >>> HOW MANY COMBINATIONS THE BUDGET BUYS, AND IT IS ONE HOME (P10 §2).
     <<< `scaleStrategy()` is untouched — it is the same function the Shortlist
     calls and it is on the DO-NOT-TOUCH list — and it is read HERE at the price
     the order will be sent at, which is the same price the Shortlist card
     prices its own figures at (`openLimitPrice()` on `comboBook()`, which is
     what `legLimitSeed()` sums to). So the count on the card and the count in
     the ticket agree by construction, and if the user moves the ticket's
     sliders the budget re-derives against the price they are now offering —
     which is the honest answer to "how many can I have", not a stale one. */
  const budgetSize = useMemo(
    () => (AE ? scaleStrategy(AE, request.mode, request.amt) : null),
    [AE, request.mode, request.amt]);
  /* A COUNT TYPED BY HAND WINS, AND THE SCREEN SAYS IT OVERRIDES THE BUDGET.
     The gate is unchanged: it measures whatever `contracts` says, whichever of
     the two produced it. */
  const contracts = contractsTyped != null ? contractsTyped
    : (budgetSize && budgetSize.ok ? budgetSize.n : 1);
  const setContracts = useCallback(
    (n) => setContractsTyped(Math.max(1, Math.round(Number(n) || 1))), []);
  /* WHERE THAT PRICE FALLS AND WHAT THE TIME IN FORCE DOES TO IT. One verdict,
     read by the band in the ticket and by the confirm step. */
  const ticketVerdict = useMemo(
    () => orderVerdict(ticketNet.net == null ? null : Math.abs(ticketNet.net), book,
      { sign: ticketDir, tif: ticket.tif, type: ticket.type }),
    [ticketNet, book, ticketDir, ticket.tif, ticket.type]);
  /* IS IT THIS STRUCTURE'S PRICE — COMPUTED ONCE, HERE.
     `ComboBookPanel` in pro.jsx ran the model check on every render of the
     ticket, which is a Black-Scholes reprice of every leg for each keystroke in
     the limit field, and it re-derived the per-leg marks from `quoteFn` instead
     of reading the ones `analyze()` already produced. Two consumers of one set
     of marks is how two screens come to name different legs for one trade.
     `modelCheckOf()` is the expression the three generation sites use; the
     ticket is handed its answer. */
  const modelCheck = useMemo(
    () => (A ? modelCheckOf(A, { legs, spot, dte, iv }) : null),
    [A, legs, spot, dte, iv]);
  /* WHICH SEASONAL TABLE A CHANCE IS DRIFTED ON, AND WHERE IT CAME FROM, for
     any market, from the one place that decides it: `seasonalProvenance()` in
     rules.js, given the loaded Alpha Vantage series when there is one and the
     hand-written row behind it when there is not. Every call to `chanceFor`
     below goes through this, so no screen can drift a probability on a
     different table from the one the Radar scores that market with — and no
     screen can print the number without the sentence naming its source. */
  const seasonalFor = useCallback((tk) => seasonalOf(seasonal, tk), [seasonal]);
  /* AND WHICH REALISED VOLATILITY THE EXIT SIMULATION WALKS THE SHARE ON, from
     the one place that decides THAT: `sigmaProvenance()` in rules.js. It is the
     SAME loaded reading — `statsFromMatrix()` returns the twelve means and the
     annualised sigma of one monthly series — and until now this screen read it
     as `seasonal[tk]?.sigma || getU(tk).sigma` in four places while
     `autopilot.mjs` had no measured sigma available to it at all. One position,
     two volatilities, and every exit-simulator figure moved with the
     difference. Never spell that `||` again: it is a decision with no source
     attached, which is what `exitSim` and `exitPathSim` now refuse by shape. */
  const sigmaFor = useCallback(
    (tk) => sigmaProvenance(seasonal[tk] || null, getU(tk).sigma, tk),
    [seasonal]);
  /* THE ONE CHANCE, BOUND TO THIS COMPONENT'S SEASONAL STATE. `chanceCheckOf`
     is the module-level expression; this supplies the only argument a screen
     cannot know on its own. */
  const chanceFor = useCallback(
    (a, opts) => chanceCheckOf(a, { ...opts, seasonal: seasonalFor(opts.ticker) }),
    [seasonalFor]);
  /* AND THE BUILD SCREEN'S OWN, COMPUTED ONCE. The CHANCE stat, the PROFIT x
     CHANCE stat, the simulation panel and the position record all read this
     object — they used to read three different calculations. */
  /* AT THE PRICE THAT WILL BE SENT, like every other figure on this screen.
     `chanceOf()` reads `entryNet`, so a chance worked out at the mid beside a
     maximum loss worked out at the ask would be two readings of one trade —
     the fault this whole section exists to remove. The Shortlist row still
     prints its candidate at the MID, because a candidate is not yet a price;
     the Build screen says so where the two are side by side. */
  const chance = useMemo(
    () => (AE && spot && legs.length ? chanceFor(AE, { ticker, legs, spot, dte, expKey }) : null),
    [AE, chanceFor, ticker, legs, spot, dte, expKey]);
  // The Shortlist, already past the quality floors. Computed here rather than
  // inside the render so the filtered-out list and the rows come from one call.
  // Every known open-interest count on the expiry being shown: the peer set the
  // liquidity floor judges each leg against, so a strike is compared with its
  // own neighbours rather than with a number chosen for another market.
  const expiryOI = useMemo(() => (chain && expKey ? expiryOpenInterest(chain, expKey) : []), [chain, expKey]);
  /* AND THE BOARD IS A PRECONDITION HERE TOO, NOT JUST A FILTER. Without it
     `buildPresets()` returns nothing, and an empty Shortlist rendered through
     `emptyExpiryNote()` would say NOTHING CLEARED ON <expiry> about a board
     that has not loaded — a missing-data answer wearing a market verdict's
     words. `board` carries which of the two this is. */
  const shortlist = useMemo(
    () => (spot && expStrikes
      ? { board: "loaded", ...shortlistWithFloors(sentiment, spot, U.step, expStrikes, dte, iv, q, { peers: expiryOI, level: liqLevel }) }
      : { board: null, rows: [], cut: [], oiSkipped: false, offFloor: null, tally: { kept: 0, liquidity: 0, reward: 0, skipped: 0 } }),
    [sentiment, spot, U.step, expStrikes, dte, iv, q, expiryOI, liqLevel]);
  // WHAT EVERY SETTING WOULD DO TO THIS LIST, so moving the control shows its
  // own consequence instead of promising one. Four runs of a pure function over
  // eight presets: cheap, and the only honest way to label the buttons.
  const liqPreview = useMemo(() => {
    // No board, no consequence to preview: four runs over an empty preset list
    // would label every setting "0 survive" and blame the filter for it.
    if (!spot || !expStrikes) return null;
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
  const openOnBuild = ({ ticker: tk, expKey: ek = null, legs: lg, name, ref = null, contracts: n = null }) => {
    const h = buildHandOff({ ticker: tk, expKey: ek, legs: lg, name, chains });
    setTicker(h.ticker); setExpKey(h.expKey); setLegs(h.legs); setStratName(h.name);
    setBt(null);
    // A STRIKE THAT MOVED ONTO THIS BOARD IS SAID, NOT SLID UNDER THE READER.
    // `buildHandOff` re-snaps onto the expiry it is handing the trade to; a leg
    // this board does not list is what became SOYB261120C00027500 (PRD §4n).
    setSnapNote(h.moved && h.moved.length ? strikeSnapNote(h.moved, h.expKey) : null);
    // A HAND-OFF IS A DIFFERENT TRADE, SO IT IS NOT THE PREVIOUS ONE'S SIZE.
    // The ticket's quantity now drives the gate and the position record, and a
    // "×7" left over from the structure that was on this screen a moment ago
    // would size a trade nobody sized. The one caller that passes a size is a
    // RE-PRICE, which is the same trade at a different price: sending it back
    // at one lot would quietly shrink an order the user already sized.
    sizedFor.current = `${h.ticker}|${h.expKey}`;
    // A PLAIN HAND-OFF CARRIES NO SIZE, so the budget decides it on arrival.
    // The one caller that DOES pass a size is a RE-PRICE — the same trade at a
    // different price — and that is a size the user already set by hand, so it
    // arrives as the typed override rather than as a number the budget derived.
    setContractsTyped(n == null ? null : Math.max(1, Math.round(Number(n) || 1)));
    setOptRef(ref);
    setEv(h.ev);          // close the evidence sheet: it covers the trade
    setTab(h.tab);
    // Step 3. A hand-off is what "forward" means on this path: the selection
    // travels, the step changes with it, and Build is where it lands.
    setStep("build");
    if (h.loadChain) refreshChain(h.ticker);   // no chain, no price, no trade to show
    setScrollBuild((n) => n + 1);
  };

  /* ====================================================================
     AN ORDER THAT IS WORKING NEEDS A HOME IN THE MAIN FLOW.

     `orderOutcome()` has distinguished accepted from filled since PR #18, and
     the position row has carried the warning. What was missing is anywhere in
     the main flow to SEE an order that is working: it lived only on the desk,
     behind "Open the full desk", inside the Alpaca panel. So the one order
     this app has ever sent — accepted, filled 0.00, never filled, expired at
     the close of the session — was invisible from the moment it was sent.
     That is failure class 8: the app knew and did not say.

     Two things can be done about one, and only two. CANCEL it, which is a
     DELETE and not an order — the same call `AlpacaDesk` already makes.
     Or RE-PRICE it, which is a new order, and a new order does not get a new
     path to the broker: it cancels the old one and lands the trade back on
     BUILD, where the chain, the legs, the greeks, the book and the confirm
     step are. "A road must not be able to reach an order without passing the
     screen that shows the trade" — a re-price is a road. So there are still
     SIX order paths, and re-pricing goes down path 2 like everything else on
     that screen.
  ==================================================================== */
  const [orderBusy, setOrderBusy] = useState(null);

  /* ====================================================================
     THREE LISTS, ONE FUNCTION — and DEAD IS NOT WORKING.

     This was ONE list picked with `p.alpacaId && p.alpacaFilled === false`,
     which asks whether an order was filled and never whether it is still
     alive. A cancelled order was never filled, so it stayed in "WORKING AT
     THE BROKER" for ever: the owner's phone showed that heading over three
     rows badged CANCELED, EXPIRED and CANCELED, two of them three days old.

     Every list below comes out of `positionStage()` in journal.js, so no
     screen can decide for itself what a record is. Only `owned` is a
     position: it is the only one with a real profit and loss, the only one
     the exposure ceiling counts, and the only one with an exit plan running.
  ==================================================================== */
  const byStage = useMemo(() => {
    const newest = (a, b) => (b.alpacaSentAt || b.id || 0) - (a.alpacaSentAt || a.id || 0);
    const out = { owned: [], working: [], notTaken: [] };
    for (const p of store.positions) {
      const stage = positionStage(p);
      if (stage === "owned") out.owned.push(p);
      else if (stage === "working") out.working.push(p);
      else out.notTaken.push(p);
    }
    out.working.sort(newest); out.notTaken.sort(newest);
    return out;
  }, [store.positions]);
  /** What the user actually holds. The only list that is a book. */
  const ownedPositions = byStage.owned;
  /** Sent, still at the broker, nothing bought yet. */
  const workingOrders = byStage.working;
  /** Sent and finished with nothing bought — no trade here, and there never was. */
  const notTakenOrders = byStage.notTaken;
  /* WHY THE TWO COUNTS DIFFER — the debt PR #32 handed forward. The app lists
     the orders it holds records of and Alpaca lists the account's; neither
     panel is wrong and nothing said why they disagreed. One cause was the
     import sentinel (PRD §4r). The other is real and arithmetic cannot fix
     it: an order sent before the local store was cleared has no record here.
     `alSync.orders` is what the broker last reported; null until it has been
     asked, and an unasked broker is not an empty one. */
  const orderGap = useMemo(
    () => orderReconciliation(workingOrders, alSync.t ? alSync.orders : null),
    [workingOrders, alSync]);

  const cancelWorking = async (p) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }
    setOrderBusy(p.id);
    try {
      await alpacaReq(`/v2/orders/${encodeURIComponent(p.alpacaId)}`, "DELETE");
      setStore((st) => {
        const positions = st.positions.map((x) => {
          if (x.id !== p.id) return x;
          const t = appendTimeline(x, [{
            t: Date.now(), type: "status", orderId: String(x.alpacaId),
            text: `Alpaca order ${x.alpacaId} was CANCELLED from the Positions screen. Nothing was bought, ` +
              `nothing is working, and this position is the app's own record of a trade that never opened.`,
          }]);
          return { ...x, alpacaStatus: "canceled", timeline: t.timeline, seqNext: t.seqNext };
        });
        const ns = { ...st, positions }; saveState(ns); return ns;
      });
      setMsg("The order was cancelled at the broker. The position row says so, and the timeline records it.");
    } catch (e) { setMsg(`The cancellation did not go through: ${alpacaErrorText(e)}`); }
    setOrderBusy(null);
  };

  /** Cancel what is working, then put the same trade back on Build to re-price. */
  const repriceWorking = async (p) => {
    if (DEMO) { setMsg(DEMO_TOOLTIP); return; }
    await cancelWorking(p);
    openOnBuild({ ticker: p.ticker, expKey: p.expKey, legs: p.legs, name: p.name, contracts: contractsOf(p) });
    setMsg(`The working order was cancelled and ${p.ref || p.ticker} is back on Build at ` +
      `${contractsOf(p)} combination${contractsOf(p) === 1 ? "" : "s"} — the size it was sent at. The chain has been ` +
      `re-read, so the suggested limit is worked out from the market as it is now — not as it was when the ` +
      `first order went out. Send it again from the confirm step at the bottom.`);
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
  // A leg quantity left empty or invalid while typing: { [legIndex]: note }.
  // It disables Send and the confirm button; it never becomes 1 by itself.
  const [legQtyErr, setLegQtyErr] = useState({});
  const legQtyMsg = Object.keys(legQtyErr).filter((k) => legQtyErr[k] && Number(k) < legs.length)
    .map((k) => `Leg ${Number(k) + 1}: ${legQtyErr[k]}`)[0] || null;
  /* MOVING THE BOARD MOVES THE STRIKES WITH IT. `expStrikes` is memoised on
     the expiry that is still in state when this runs, so the target board's
     strikes are read straight off the chain here rather than waited for. */
  const resnapTo = (ek) => {
    const ks = expiryStrikes(chain, ek);
    if (!ks) { setSnapNote(null); return; }
    setLegs((L) => {
      const r = resnapLegs(L, ks);
      setSnapNote(r.moved.length ? strikeSnapNote(r.moved, ek) : null);
      return r.legs;
    });
  };
  const onChainCell = (k, t) => {
    setLegs((L) => {
      const i = L.findIndex((l) => l.strike === k && l.type === t);
      if (i < 0) return [...L, { side: 1, type: t, strike: k, qty: 1 }];
      if (L[i].side > 0) return L.map((l, j) => (j === i ? { ...l, side: -1 } : l));
      return L.filter((_, j) => j !== i);
    });
    setBt(null);
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
  const commitPosition = async ({ ticker: tk, expKey: ek, legs: lg, dte: d, analysis, spot: sp, name, alpacaOrder, clashInfo, reason, roomOverride, contracts: n }) => {
    /* HOW MANY, AND IN WHICH UNITS — THE TRAP IS THE UNITS.
       Where a broker order was built, the ORDER BODY'S `qty` is the authority:
       it is what Alpaca was actually asked for. But it is NOT the number that
       multiplies the dollars, and reading it as one was wrong by the legs' GCD.

       `orderBody()` divides the legs by their greatest common divisor and puts
       the factor into `qty` (PRD 8b). A vertical saved as +10/-10 therefore
       goes out as qty 10 of a 1:1 shape — while `analysis.maxLoss` ALREADY
       holds that ten, because `analyze()` multiplies by each leg's own qty. So
       storing the broker's 10 here would have counted a $450 worst case as
       $4,500 the moment the order filled.

       Dividing by the same factor puts it back into the units `maxLoss` is in,
       which is the ticket's own quantity. Where the app opened on its own book
       there is no order body, and the authority is that quantity directly. */
    const factor = Math.max(1, Math.round(reduceRatios(lg).factor) || 1);
    const fromBroker = Number(alpacaOrder?.qty) / factor;
    const sized = Math.max(1, Math.round(
      Number.isFinite(fromBroker) && fromBroker >= 1 ? fromBroker : Number(n) || 1));
    // Anche la posizione interna passa dal cancello: non tocca il broker, ma
    // entra nell'esposizione totale che il cancello misura al prossimo ordine.
    // WHICH BOOK IT PASSED THROUGH IS THE ONE THE TRADE WENT TO. With a broker
    // order this record IS that order, so the gate summary written onto its
    // timeline has to name the account it went to; without one nothing left
    // the browser and the app's own book is the whole of the truth. It used to
    // say "local simulation, no broker involved" in the Journal entry of an
    // order Alpaca was holding.
    // The quotes travel with the proposal: the gate's priceability check can
    // then see a long leg nobody bids for, which a mid price hides by
    // construction (src/rules.js, `priceability`).
    const gLocal = gate({ ticker: tk, intent: "open", legs: lg, dte: d, contracts: sized,
      maxLoss: analysis?.maxLoss, maxProfit: analysis?.maxProfit,
      quotes: quotesOf(analysis), net: analysis?.entry, occs: occsOf(analysis), entryOverride: roomOverride },
      bookFor(!!alpacaOrder));
    if (!gLocal.pass) return { ok: false, gate: gLocal };
    // ACCEPTED IS NOT OPENED. The reply is read once, here, and every
    // sentence about this position downstream is composed from that reading
    // (`orderOutcome` in src/order.js). With no broker order at all this is
    // the app's own book and "opened" is simply true.
    const outcome = alpacaOrder ? orderOutcome(alpacaOrder) : null;
    const working = !!(outcome && !outcome.filled);
    const seasM = seasonalNowOf(seasonal, tk);
    const expiry = ek ? new Date(ek).toISOString() : new Date(Date.now() + d * 86400000).toISOString();
    const ivAvg0 = structureIV(analysis);
    // THE CHANCE THIS POSITION IS OPENED ON, from the one expression. The TIS
    // compares today's chance against this one for the rest of the position's
    // life (`computeTIS` in pro.jsx and in autopilot.mjs), so an entry figure
    // computed a different way from the monitoring figure would have made that
    // comparison meaningless — it was a closed form at a risk-neutral drift
    // against a Monte Carlo at the app's own.
    const mc0 = chanceFor(analysis, { ticker: tk, legs: lg, spot: sp, dte: d, expKey: ek });
    const pop0 = mc0 ? mc0.pop : null;
    const f = fused[tk];
    // THE REF IS GIVEN HERE, ONCE, AND IS THE POSITION'S NAME FOR THE REST OF
    // ITS LIFE — including after it is closed, which is the whole point: the
    // Journal entry keeps it, so a closed trade can still be pointed at.
    const { n: refN, ref } = nextRef(store);
    const pos = {
      id: Date.now(), ref, name, ticker: tk, expKey: ek, legs: lg, entryNet: analysis.entry, entrySpot: sp,
      // THE POSITION REMEMBERS ITS SIZE. `entryNet`, `maxProfit` and `maxLoss`
      // below are all figures for ONE combination; without this number none of
      // the totals — the exposure ceiling, the stop threshold, the P&L on the
      // row — can be formed, and the app was forming them from an assumed 1.
      contracts: sized,
      openedAt: new Date().toISOString(), expiry, maxProfit: analysis.maxProfit, maxLoss: analysis.maxLoss,
      realEntry: analysis.realCount === lg.length,
      alpacaId: alpacaOrder?.id || null,
      // WHICH SEASONAL TABLE THE CHANCE ABOVE WAS DRIFTED ON, ON THE RECORD.
      // The Guardian's TIS divides today's chance by `thesis.pop`, so if the
      // market was on the hand-written estimate at entry and on measured prices
      // today, the score reads a change in the TABLE as a change in the TRADE.
      // The absence of these three fields on an older record is the marker, the
      // way `contractsAssumed` marks a size that was assumed: at that point the
      // hand-written table was the only one either side could reach.
      thesis: { pop: pop0, ...seasonalStampFields(mc0), iv: ivAvg0, seasonal: seasM, regime: seasM > 0.8 ? "strong up" : seasM < -0.8 ? "strong down" : "weak", spot: sp, breakevens: analysis.breakevens, delta: analysis.greeks.delta, vega: analysis.greeks.vega,
        signal: f ? { score: f.score, confidence: f.confidence, agreement: f.agreement, narrative: f.narrative } : null,
        againstSignal: clashInfo ? { ...clashInfo, reason: (reason || "").trim(), at: Date.now() } : null },
      // WHAT THE BROKER ACTUALLY SAID, ON THE POSITION'S OWN RECORD. An
      // order can come back "accepted" with nothing bought (queued outside
      // market hours, or a limit at the mid of a wide market), and a
      // timeline that reads "Opened" over that reply is the app describing
      // a fill that has not happened.
      alpacaStatus: outcome ? outcome.status : null,
      alpacaFilled: outcome ? outcome.filled : null,
      // WHAT THE ORDER ACTUALLY WAS, so the working-orders list can show its
      // price and how long it stands without asking the broker again.
      alpacaOrderType: alpacaOrder?.type ?? null,
      /* THE BROKER'S OWN LIMIT, WITH ITS SIGN. This took `Math.abs()`, and so
         did the timeline sentence below it and the working-orders row on the
         Positions screen — which is why the app could send a $75 credit
         spread out as a $75 DEBIT and no screen anywhere showed it. The app
         sent the wrong number and then hid it on the way back. Positive is a
         debit, negative a credit, exactly as Alpaca prints it (src/order.js). */
      alpacaLimit: alpacaOrder?.limit_price != null && Number.isFinite(+alpacaOrder.limit_price)
        ? +alpacaOrder.limit_price : null,
      /* AND THE RECORD SAYS THAT THE NUMBER ABOVE CARRIES A SIGN. Everything
         written before PR #33 stored `Math.abs()` of it, so one field holds two
         different quantities depending on WHEN it was written and nothing said
         which. The ABSENCE of this stamp is the marker, the seventh time this
         repository uses that pattern: `storedLimitOf()` in journal.js reads it
         back, and an unstamped limit gets no direction word and no comparison
         against the fill. It is never inferred — the direction is at the
         broker, not in the record. */
      alpacaLimitSigned: alpacaOrder?.limit_price != null && Number.isFinite(+alpacaOrder.limit_price)
        ? true : null,
      alpacaTif: alpacaOrder?.time_in_force ?? null,
      alpacaSentAt: alpacaOrder ? Date.now() : null,
      entryRoomOverride: entryOverrideOk(roomOverride) && entryRoom(d).band === "tight"
        ? { dte: d, room: entryRoom(d).room, reason: String(roomOverride).trim(), at: Date.now() } : null,
      /* SENT AND FILLED ARE TWO EVENTS, AND THEY GET TWO ENTRIES.
         The live order came back `accepted` with `filled_qty: 0` and the app
         wrote one entry that read as an opening. Nothing in the record then
         distinguished "this left the building" from "this became a position",
         which is the same fault as the headline that said "Position opened"
         over a queued order — one fact wearing another fact's words.

         So: `sent` is written here, now, and says where the order is waiting
         and how long it stands. `fill` is written by `recheckOrders()` when
         and if the broker says so, and never before. A position the app opened
         on its own book has no `sent` entry at all, because nothing was. */
      timeline: [
        { t: Date.now(), type: "gate", text: `Risk gate — ${gateSummary(gLocal)}` },
        ...(alpacaOrder ? [{
          t: Date.now(), type: "sent", orderId: alpacaOrder.id ? String(alpacaOrder.id) : null,
          text: `SENT to Alpaca — order ${String(alpacaOrder.id || "(id unknown)")}, ` +
            `${String(alpacaOrder.type || "an order whose type Alpaca did not report")} ` +
            `${limitWords(alpacaOrder.limit_price) ? `at ${limitWords(alpacaOrder.limit_price)} a share, a combination at a time, ` : ""}` +
            `${String(alpacaOrder.time_in_force || "").toLowerCase() === "gtc" ? "standing until cancelled" : "good for today's session only"}. ` +
            `${outcome.headline}`,
        }] : []),
        { t: Date.now(), type: "open", text: `${working ? "Recorded" : "Opened"} with a ${pop0 != null ? (pop0 * 100).toFixed(0) + "%" : "n/a"} chance · volatility ${(ivAvg0 * 100).toFixed(0)}% · season ${seasM.toFixed(1)}%/mo${f ? ` · signal ${f.score > 0 ? "+" : ""}${f.score}/100 ${f.agreement}` : ""}` },
        { t: Date.now(), type: "plan", text: working
          ? `Exit plan frozen at entry — ${exitPlanSentence()} It starts counting when the order fills; it has not filled yet.`
          : `Exit plan frozen at entry — ${exitPlanSentence()}` },
        ...(clashInfo ? [{ t: Date.now(), type: "against", text: `Against ${clashInfo.n} of ${clashInfo.total} factors. Reason: "${(reason || "").trim()}"` }] : []),
        // THE ENTRY-ROOM OVERRIDE AND ITS REASON GO TO THE JOURNAL. That is
        // the whole point of asking for one: a run of these is what ROADMAP P5
        // calibrates the 30 from.
        ...(entryOverrideOk(roomOverride) && entryRoom(d).band === "tight"
          ? [{ t: Date.now(), type: "override", text: entryOverrideNote(entryRoom(d), roomOverride) }]
          : []),
      ],
    };
    // The four opening entries are stamped J-0007·01 … ·04 by the same function
    // every later append goes through, so there is one way an entry gets a
    // sequence and it cannot disagree with itself.
    const stamped = stampTimeline(pos);
    const st = { ...store, journalSeq: refN, positions: [...store.positions, stamped] };
    setStore(st); await saveState(st);
    return { ok: true, gate: gLocal, pos: stamped, outcome };
  };

  const openPaper = async (alpacaOrder) => {
    // Non blocchiamo il trade: chiediamo la motivazione scritta e la salviamo
    // con la posizione (PRD §2, pattern override).
    if (clash && against.reason.trim().length < REASON_MIN) {
      setMsg(`Write why you are going against ${clash.n} of ${clash.total} factors (at least ${REASON_MIN} characters). The reason is stored with the position.`);
      return;
    }
    // THE RECORD CARRIES THE PRICE THE TRADE WAS DONE AT, NOT THE MID. `AE` is
    // `analyze()` at `effectiveLimit()`'s net, which is what the confirm step
    // above showed and what the ticket sent. A position recorded at the mid is
    // a position whose maximum loss, breakeven and take-profit target describe
    // a trade nobody made — and the Guardian reads it for the rest of its life.
    const r = await commitPosition({ ticker, expKey, legs, dte, analysis: AE, spot, name: stratName,
      alpacaOrder, clashInfo: clash, reason: against.reason, roomOverride: roomReason, contracts });
    setOpenResult(r.gate);
    if (!r.ok) { setMsg(`Risk gate: position not opened. ${r.gate.violations.map((v) => v.message).join(" ")}`); return; }
    setAgainst({ reason: "" }); setRoomReason(""); setPicked(null); setOpenResult(null);
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
  /* STOP WATCHING a trade that was never taken. It deletes the record, and
     that is the whole of it: nothing was ever bought, so there is nothing to
     close, no profit to bank and nothing the Journal needs to keep. A record
     of a trade that did not happen is worth exactly as much as the owner
     finds it worth, which is why the button exists at all. */
  const dropWatched = async (id) => {
    const target = store.positions.find((p) => p.id === id);
    if (!target || positionStage(target) !== "not-taken") return;
    const st = { ...store, positions: store.positions.filter((p) => p.id !== id) };
    setStore(st); await saveState(st);
    setMsg("Stopped watching it. Nothing was bought and nothing was closed — the record is simply gone.");
  };
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
        const t = appendTimeline(p, { t: Date.now(), type, text });
        return { ...p, timeline: t.timeline, seqNext: t.seqNext };
      });
      if (!changed) return st;
      const ns = { ...st, positions };
      saveState(ns);
      return ns;
    });
  }, []);

  /* ---- CLOSING A POSITION KEEPS ITS HISTORY ----

     What it used to keep, measured: ticker, pnl, ruleExit, riskOk. The
     timeline, the thesis, the order ids and the reason were dropped on the
     floor, so the Journal — the app's own record of what it did, and the only
     place its discipline number comes from — could say a trade ended at a
     profit and could not say why it was opened, what it was told while it was
     open, or who decided to end it.

     `journalEntry()` in src/journal.js decides what survives; this function
     decides the two things only the screen knows: what the position is worth
     right now, and what the user wrote.

     AND THE STOP IS NOT A RULE THAT CLOSES ANYTHING. `posAlerts` raises the
     stop warning to level "action" so the row is impossible to miss, and this
     read that level as "a rule said so" — so a warning the user chose to act on
     was filed as obedience, in the one number that is supposed to be honest
     about the difference. `ruleExitOf()` says which rules actually end a trade:
     the take-profit and the exit window, and nothing else. */
  const closePos = async (id, { written = "" } = {}) => {
    const p = store.positions.find((x) => x.id === id);
    if (!p) return { ok: true };
    const al = posAlerts.find((a) => a.p.id === id) || null;
    const decision = closeDecision({ alert: al, written });
    if (!decision.reason.ok) return { ok: false, decision };
    const entry = journalEntry({
      pos: p,
      pnl: al?.pnl ?? null,
      reason: decision.reason,
      // THE DISCIPLINE NUMBER IS ABOUT THE WHOLE TRADE. `maxLoss` is one
      // combination; a seven-lot position that broke the per-trade cap seven
      // times over was filed as having respected it.
      riskOk: Math.abs(p.maxLoss) * contractsOf(p) <= limits.perTradeLimit,
    });
    const st = { ...store,
      positions: store.positions.filter((x) => x.id !== id),
      journal: [...(store.journal || []), entry] };
    setStore(st); await saveState(st);
    setMsg(`${p.ref ? `${p.ref} · ` : ""}${p.ticker} ${p.name} closed and filed in the Journal with its whole timeline. ` +
      `${decision.reason.kind === "rule" ? decision.reason.text : `Your reason: "${decision.reason.text}"`}`);
    return { ok: true, decision, entry };
  };

  /* ---- RE-READING AN ORDER THAT HAD NOT FILLED ----

     The debt the last session wrote down, in its own words: "nothing re-reads
     `alpacaStatus` after the fact. The position is written once, at send time,
     and the warning stays until the user checks the broker."

     An order can come back `accepted` with `filled_qty: 0` — queued outside
     market hours, or a limit sitting in a wide market. The position row then
     carries a warning saying nothing here is a position you own yet. Overnight
     it fills, and the app goes on warning about it because nobody asked again.

     Three rules hold this. It only asks about orders that had NOT filled (a
     filled order is finished and re-reading it is noise). It writes only when
     the answer CHANGED, so a timeline does not gain "still accepted" every
     minute. And it is silent about failure: this is a background read, and a
     broker that cannot be reached is not an event worth interrupting anybody
     for — the warning simply stays until it can be. */
  const rechecking = useRef(false);
  const recheckOrders = useCallback(async () => {
    if (DEMO || rechecking.current) return;               // no broker call in the demo
    // ONLY THE ONES STILL ALIVE. This asked the broker about every unfilled
    // order, which meant re-reading three orders that had been cancelled for
    // days, once a minute, for ever. A finished order has no news to give.
    // ...AND ONLY THE ONES THAT ARE REALLY ORDERS. A record imported from the
    // broker's holdings has no order id, and asking `/v2/orders/sync` for one
    // 404s into the silent catch below for ever (PRD §4r).
    const todo = store.positions.filter((p) => positionStage(p) === "working" && p.alpacaId && p.alpacaId !== "sync");
    if (!todo.length) return;
    rechecking.current = true;
    const changes = [];
    for (const p of todo) {
      try {
        const o = await alpacaReq(`/v2/orders/${encodeURIComponent(p.alpacaId)}`);
        const r = orderStatusRecheck(p, o);
        if (r.changed) changes.push({ id: p.id, r });
      } catch { /* the broker is not reachable: the warning stays, nothing is written */ }
    }
    rechecking.current = false;
    if (!changes.length) return;
    setStore((st) => {
      const positions = st.positions.map((p) => {
        const c = changes.find((x) => x.id === p.id);
        if (!c) return p;
        // A fill that happens after the fact starts the exit plan, and says so:
        // the plan entry written at open said it had not started yet.
        // FILLED IS ITS OWN EVENT, WITH ITS OWN TYPE. `sent` was written when
        // the order left; this is the other half, and only the broker can say
        // it. Anything that moved but did not fill stays a `status` entry.
        const entries = [
          c.r.outcome.filled
            ? { ...c.r.entry, type: "fill" }
            : c.r.entry,
          ...(c.r.outcome.startsExitPlan ? [{ t: Date.now(), type: "plan",
            text: `The order has filled, so the exit plan starts now — ${exitPlanSentence()}` }] : []),
        ];
        const t = appendTimeline(p, entries);
        // WHAT THE BROKER GAVE GOES ON THE RECORD, SIGNED. Until 21 Sep 2026
        // nothing had ever filled, so the app stored what it OFFERED and had
        // nothing to hold it against. `c.r.against` is that comparison and it
        // is already in the timeline entry above (journal.js, `fillVsLimit`).
        return { ...p, alpacaStatus: c.r.status, alpacaFilled: c.r.filled,
          alpacaFillPrice: c.r.fillPrice ?? p.alpacaFillPrice ?? null,
          timeline: t.timeline, seqNext: t.seqNext };
      });
      const ns = { ...st, positions };
      saveState(ns);
      return ns;
    });
    const filled = changes.filter((c) => c.r.outcome.filled).length;
    setMsg(`${changes.length} order${changes.length === 1 ? "" : "s"} moved on since ${changes.length === 1 ? "it was" : "they were"} sent` +
      `${filled ? `: ${filled} ${filled === 1 ? "has" : "have"} filled` : ""}. The timeline says what changed.`);
  }, [store.positions]);

  // On arrival, and with the 60-second monitor. A position whose order has not
  // filled is the only thing this asks about, so the usual case is no call.
  useEffect(() => { if (hydrated) recheckOrders(); }, [hydrated]); // eslint-disable-line
  useEffect(() => {
    if (!autoMon) return;
    const id = setInterval(() => recheckOrders(), 60000);
    return () => clearInterval(id);
  }, [autoMon, recheckOrders]);

  const runMultiScan = async () => {
    setMulti((m) => ({ ...m, busy: true, err: null, res: null }));
    try {
      const out = [];
      // What the quality floors removed, so an empty or short result can say why.
      const cutFloors = { n: 0, liquidity: 0, spread: 0, comboSpread: 0, reward: 0, unpriceable: 0, impossible: 0, model: 0,
        markets: new Set(), oiSkipped: new Set(), spreadSkipped: new Set(), comboSpreadSkipped: new Set(),
        // A MARKET WITH NO BOARD THE GATE WOULD OPEN ON IS NOT A MARKET THE
        // FLOORS EMPTIED. Its own count, its own sentence — the same rule that
        // keeps `unpriceable` apart from `liquidity`.
        noBoard: new Set() };
      // le barre servono al fattore tecnico: caricale prima di fondere i segnali
      const barsMap = Object.fromEntries(await Promise.all(multi.sel.map(async (tk) => [tk, await loadBars(tk)])));
      const fz = Object.fromEntries(multi.sel.map((tk) => [tk, fuseFor(tk, barsMap[tk] ?? barsCache[tk])]));
      for (const tk of multi.sel) {
        // THE SAME CHAIN THE SHORTLIST JUDGES, open interest included. Without
        // this await the floor was SKIPPED on every market in a wide search
        // while the Shortlist read the numbers off the very same board.
        let c = await ensureOpenInterest(tk, chains[tk] || (await refreshChain(tk, true)));
        if (!c?.spot) continue;
        const sp = c.spot;
        const dT = multi.dteT || RULES.targetEntryDTE;
        /* >>> ONLY BOARDS THE GATE WOULD OPEN ON (P9, TASK 1). <<< This was
           `dte >= dT - 20 && dte <= dT + 35`, which at the slider's old floor
           of 21 meant ONE to fifty-six days: every hit this search produced on
           22 September sat at 24 DTE and every one of them was refused by
           `ENTRY_DTE_ROOM` the moment it reached Build. `buildableExpiries()`
           in rules.js is the one home and it is built on `entryRoom()`, so the
           search cannot disagree with the gate about the floor. The horizon is
           a TIE-BREAK inside what is buildable, never a way past it. */
        const ok2 = buildableExpiries(c.expirations.map((e) => ({ key: e, dte: c.byExp[e].dte }))).buildable;
        const ek = ok2.length ? ok2.reduce((b2, e) => Math.abs(e.dte - dT) < Math.abs(b2.dte - dT) ? e : b2, ok2[0]).key : null;
        if (!ek) { cutFloors.noBoard.add(tk); continue; }
        const d2 = c.byExp[ek].dte;
        const row = scan.find((r) => r.tk === tk);
        const sent = multi.senMode === "fixed" ? sentiment : (row && row.sugg !== "neutral" ? row.sugg : "neutral");
        // The board, from the one function that knows what a board carries.
        // `ek` came out of `c.expirations`, so this is non-null by
        // construction — the skip is the belt to that brace, and it is a skip
        // rather than a grid because a market whose strikes cannot be read is
        // a market this search has nothing to say about.
        const strikes = expiryStrikes(c, ek);
        if (!strikes) continue;
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
          // ...and a price the app's own model cannot account for, same function.
          if (!modelCheckOf(a, { legs: pr.legs, spot: sp, dte: d2, iv: getU(tk).iv }).pass) {
            cutFloors.model++; cutFloors.markets.add(tk); continue;
          }
          // Same floors as the Shortlist and the wizard, from the same function.
          const qf = qualityFloor({
            openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level: liqLevel,
            // ...and the LEGS, for the combination spread floor beside it.
            quotes: quotesOf(a), legs: pr.legs,
            maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
          });
          if (!qf.liquidity.checked) cutFloors.oiSkipped.add(tk);
          if (!qf.spread.checked) cutFloors.spreadSkipped.add(tk);
          if (!qf.comboSpread.checked) cutFloors.comboSpreadSkipped.add(tk);
          if (!qf.pass) {
            cutFloors.n++; cutFloors.markets.add(tk);
            if (!qf.liquidity.pass) cutFloors.liquidity++;
            else if (!qf.spread.pass) cutFloors.spread++;
            else if (!qf.comboSpread.pass) cutFloors.comboSpread++;
            else cutFloors.reward++;
            continue;
          }
          // THE ONE CHANCE. This was `probProfit(a.curve, sp, ivA, d2) || 0` — a
          // closed form at a risk-neutral drift, and `|| 0` turning a chance
          // the app could not work out into a confident zero.
          const mc = chanceFor(a, { ticker: tk, legs: pr.legs, spot: sp, dte: d2, expKey: ek });
          const pop = mc ? mc.pop : null;
          const unit = Math.abs(a.maxLoss);
          // THE SIZE HAS ONE HOME AND THIS WAS A SECOND ONE. A hand-rolled
          // division, in a file that already imports `scaleStrategy()` — and
          // it divided by the PREMIUM on a debit and by the RISK on a credit
          // with a `Math.max(, 1)` floor under it, which is the shape that
          // turned a $250 budget into 250 contracts of an unpriced butterfly.
          // THE CARD'S FIGURES ARE READ AT THE PRICE THAT FILLS (P10 §3-bis),
          // and this is where the quote function for this board is in scope.
          // `a` stays the MID reading: the compare picture and the stamp are
          // drawn from it, and a candidate is a structure before it is a price.
          const aFill = atFillPrice(pr.legs, a, { spot: sp, dte: d2, iv: getU(tk).iv, q: qq });
          const sc = scaleStrategy(aFill, request.mode, request.amt);
          const n = sc && sc.ok ? sc.n : 0;
          /* >>> AND IT NO LONGER DROPS WHAT THE BUDGET WILL NOT BUY (P10 §3).
             <<< `if (n < 1) continue` removed a structure that had cleared
             every floor, in silence, because of an answer about the USER
             rather than about the trade. The owner asked for the opposite:
             "l'app propone anche altro". It is GROUPED now — the second
             section names it and says what it missed — and the floors are
             still the only thing that REMOVES. */
          out.push({ tk, sent, name: pr.name, legs: pr.legs, expKey: ek, dte: d2, a, aFill, mc, pop, n, spot: sp,
            // AND THE EXPECTED VALUE IS THE SIMULATION'S OWN MEAN, times the
            // size. It was `pop * a.maxProfit * n`: the best case weighted by
            // the chance, which is the expected value of nothing the app
            // simulated — it ignores every outcome between zero and the
            // maximum, and every outcome below zero.
            // A SIZE OF ZERO IS "THE BUDGET BUYS NONE", NOT AN EV OF ZERO.
            // The row is still shown — grouped, with its reason — so the
            // figure beside it has to describe ONE combination rather than
            // none of them.
            ev: mc && !a.profitUnbounded ? mc.ev * Math.max(1, n) : null });
        }
      }
      // Ranking: valore atteso CORRETTO dal segnale a 4 fattori, e i CONFLICT in
      // fondo comunque (PRD §7). Le funzioni pure stanno in src/signals.js.
      const ranked = out.map((o) => {
        const pr = evProfile(o.mc, o.a.maxProfit, o.a.maxLoss);
        return withSignalRank({ ...o, ev100: pr ? pr.ev100 : -999, tag: pr?.tag }, fz[o.tk], sentimentDirection(o.sent));
      }).sort(compareCandidates);
      setMulti((m) => ({ ...m, busy: false, res: ranked.slice(0, 8),
        floors: {
          n: cutFloors.n, liquidity: cutFloors.liquidity, spread: cutFloors.spread,
          comboSpread: cutFloors.comboSpread, reward: cutFloors.reward,
          unpriceable: cutFloors.unpriceable, impossible: cutFloors.impossible, model: cutFloors.model,
          markets: [...cutFloors.markets], oiSkipped: [...cutFloors.oiSkipped],
          spreadSkipped: [...cutFloors.spreadSkipped], noBoard: [...cutFloors.noBoard],
          comboSpreadSkipped: [...cutFloors.comboSpreadSkipped], level: liqLevel,
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

  // ONLY THE HISTORICAL REPLAY IS BEHIND A BUTTON NOW. The simulation that
  // produces the chance is a memo (`chance` above) because every screen in the
  // app is already showing its answer; a button over it would suggest the panel
  // and the stat were two separate readings, which is the fault this PR closes.
  const runMC = () => { setBt(histBacktest(legs, spot, dte, A.entry, seas.matrix)); };

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
      // At the price that will be sent, like the preview above it (`AE`).
      // THE SAME EVIDENCE THE SCREEN ABOVE GAVE THE GATE. This call used to
      // pass the maximum loss alone, so the gate guarding the send was weaker
      // than the gate preview the user had just read: it could not see an
      // unquoted leg and it could not see a contract the chain never listed.
      const g = gate({ ticker, intent: "open", legs, dte, contracts, maxLoss: AE?.maxLoss, maxProfit: AE?.maxProfit,
        quotes: quotesOf(AE), net: AE?.entry, occs: occsOf(AE) });
      if (!g.pass) {
        setMsg(`Risk gate: order not sent. ${g.violations.map((v) => v.message).join(" ")}`);
        setBusy(null); return;
      }
      // >>> THE CHAIN IS THE ONLY THING THAT KNOWS WHICH CONTRACTS EXIST. <<<
      // This line used to read `quote?.occ || buildOcc(...)`, and `buildOcc()`
      // formats a symbol out of a strike the app chose. On SOYB 2026-11-20 that
      // produced SOYB261120C00027500, which the broker refused by name. There
      // is no fallback any more: an unlisted leg is UNKNOWN, the gate above has
      // already refused it, and this throw is the belt to that pair of braces.
      const withOcc = legs.map((l, i) => {
        const occ = occsOf(AE)[i];
        if (!occ) throw new Error(unlistedContractNote([{ i, leg: l, side: Math.sign(Number(l.side) || 1) }], legs.length));
        return { ...l, occ };
      });
      const o = await alpacaOrderMleg(withOcc, contracts);
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
  /* ====================================================================
     WATCHING — WHAT WOULD HAVE HAPPENED, AND IT IS NOT A BOOK.

     Two sources, one list, because they are the same question asked twice:

       - a trade that WAS sent and came back with nothing bought
         (`positionStage()` says "not-taken"). The owner tried to take it and
         the market did not meet him. These arrive here by themselves.
       - a structure SAVED from the Shortlist and never sent. `store.saved`
         has carried `entryNet`, `spot` and `savedAt` since the path was
         built — everything needed to answer "how would it have gone" — and
         did nothing with them but offer a Load button.

     Every row is re-priced against today's chain and carries a THEORETICAL
     figure produced by `wouldHaveDone()` in journal.js, which returns the
     sentence with the number so that neither can be rendered alone. Null
     where today's price cannot be read: an unknown is never a hopeful zero.

     >>> THE STARTING PRICE IS THE TRAP, AND IT IS THE ONE PR #28 JUST FIXED.
     A saved row's `entryNet` came off the Shortlist, which prices at the MID
     — the price this app has just finished proving nobody gives you. Started
     from there, every watched trade would read better than it could have
     been, and three months of that is a story about being right. The row
     says which of the two prices it began from, and an unstamped record —
     everything saved before this — is named rather than flattered. <<<
  ==================================================================== */
  const watchRows = useMemo(() => {
    const priceToday = (ticker, legs, expKey, expiry) => {
      const c = chains[ticker];
      const sp = c?.spot;
      if (!sp || !legs?.length) return { net: null, spot: sp ?? null };
      const left = expiry ? Math.max(0, Math.round((new Date(expiry) - Date.now()) / 86400000)) : null;
      const qp = makeQuote(c, expKey);
      return { net: netValue(legs, sp, Math.max(1, left ?? RULES.targetEntryDTE), getU(ticker).iv, qp), spot: sp };
    };
    const rows = [];
    for (const p of notTakenOrders) {
      const { net, spot: sp } = priceToday(p.ticker, p.legs, p.expKey, p.expiry);
      rows.push({
        key: `p-${p.id}`, kind: "not-taken", pos: p,
        ref: p.ref, ticker: p.ticker, name: p.name, legs: p.legs, expKey: p.expKey,
        at: p.alpacaSentAt || p.openedAt, status: p.alpacaStatus,
        entryNet: p.entryNet, nowNet: net, spot: sp,
        contracts: contractsOf(p),
        // The ABSENCE of the stamp is the marker, the fifth time this
        // codebase uses that pattern: a record written before PR #28 carries
        // no `entrySource`, and at that point the mid was the only price
        // `analyze()` could produce.
        entrySource: p.entrySource ?? null,
      });
    }
    for (const sv of store.saved) {
      const { net, spot: sp } = priceToday(sv.ticker, sv.legs, sv.expKey, sv.expKey);
      rows.push({
        key: `s-${sv.id}`, kind: "saved", saved: sv,
        ref: null, ticker: sv.ticker, name: sv.name, legs: sv.legs, expKey: sv.expKey,
        at: sv.savedAt ? new Date(sv.savedAt).getTime() : sv.id, status: null,
        entryNet: sv.entryNet, nowNet: net, spot: sp, contracts: 1,
        entrySource: sv.entrySource ?? null,
      });
    }
    return rows
      .map((r) => ({ ...r, would: wouldHaveDone({ entryNet: r.entryNet, nowNet: r.nowNet, contracts: r.contracts }) }))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
  }, [notTakenOrders, store.saved, chains]);

  /* >>> ONE P&L PER POSITION, ONE SPELLING IN THIS FILE (P9, TASK 0b). <<<
     `positionPnl()` in rules.js decides WHICH of the two sources a figure came
     from and carries the sentence when it is the app's own mark; this is the
     only place in App.jsx that assembles its two inputs, the same discipline
     `chanceCheckOf()` and `modelCheckOf()` already hold. A second spelling here
     is how the home page and the Positions card came to print -$127 and -$130
     for one XLE position, three dollars apart, neither of them labelled.

     THE BROKER'S FIGURE IS A TOTAL and so is the app's: `unrealized_pl` covers
     every contract of the position, and the model side is multiplied by
     `contracts` before it gets here. `maxProfit` and `maxLoss` are stored PER
     COMBINATION and are scaled at the boundary, exactly as they were. */
  const pnlOf = useCallback((p, { spot: sp, dteLeft, quote, contracts }) => {
    let broker = null;
    if (p.alpacaLive && alSync.positions.length) {
      const match = alSync.positions.filter((x) => {
        const o = parseOcc(x.symbol || "");
        return o && o.und === p.ticker && o.exp === p.expKey && p.legs.some((l) => l.strike === o.strike && l.type === o.type);
      });
      // AN UNASKED BROKER IS NOT A BROKER REPORTING ZERO. No matching leg means
      // no figure, never a 0 — `Number(null)` is 0 and 0 is finite.
      if (match.length) broker = match.reduce((a, x) => a + (+x.unrealized_pl), 0);
    }
    const model = sp != null
      ? (netValue(p.legs, sp, Math.max(1, dteLeft), getU(p.ticker).iv, quote) - p.entryNet) * 100 * contracts
      : null;
    return positionPnl({ brokerPnl: broker, modelPnl: model, feed: feedName(chains[p.ticker]) || "the option chain" });
  }, [alSync, chains]);

  /* ONLY WHAT IS OWNED NEEDS A DECISION TODAY. This read every record, so the
     front page said "EVERYTHING IS ON PLAN" over three trades that had never
     been bought — and would equally have said "3 POSITIONS NEED A DECISION"
     about them. There is no decision to take on a trade you do not hold. */
  const posAlerts = useMemo(() => ownedPositions.map((p) => {
    const c = chains[p.ticker];
    const sp = c?.spot;
    const dteLeft = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
    const qp = makeQuote(c, p.expKey);
    /* THE TWO P&L SOURCES HAVE TO BE THE SAME QUANTITY.
       Alpaca's `unrealized_pl` is the WHOLE position's — every contract of it —
       and the app's own calculation below is one combination. With `contracts`
       never written the two happened to agree, because everything was one lot.
       They are both totals now, and every per-combination figure they are
       compared against (`maxProfit`, `maxLoss`, both stored per combination) is
       scaled by the same number. */
    const size = positionSize(p);
    const n = size.contracts;
    /* ONE P&L PER POSITION, AND IT IS THE BROKER'S (P9, TASK 0b).
       This memo already preferred `unrealized_pl`; the Positions CARD a few
       hundred lines below re-derived its own mark and printed -$127 over the
       broker's -$130 in the largest red figure on the screen. `positionPnl()`
       in rules.js is the one home and `pnlOf()` below is its one spelling in
       this file, so the two screens cannot read one position two ways. */
    const pv = pnlOf(p, { spot: sp, dteLeft, quote: qp, contracts: n });
    const pnl = pv.pnl, live = pv.source === BROKER_PNL;
    const tpHit = pnl != null && p.maxProfit > 0 && pnl >= RULES.takeProfitPct * p.maxProfit * n;
    const slHit = pnl != null && p.maxLoss < 0 && pnl <= RULES.stopLossPct * p.maxLoss * n;
    const dteExit = dteLeft <= RULES.exitDTE;
    // verdetto autopilot recente non-HOLD in attesa
    const ap = (p.timeline || []).filter((e) => e.type === "autopilot" && Date.now() - e.t < 48 * 36e5 && !e.text.includes("HOLD")).slice(-1)[0];
    // THE "WATCH" LEVEL READS ITS HOME. This was a bare `0.35 * p.maxLoss`: a
    // rule number with no home in RULES, and one whose value collides with
    // `maxSpreadShareOfMid` — which is why that constant was the one rule
    // number the literal sweep could not be pointed at. `watchAttentionLevel()`
    // is that home, and the sweep covers the spread floor again.
    const watchLevel = watchAttentionLevel(p.maxLoss);
    /* >>> THE ENTRY QUESTION, ASKED OF AN OPEN POSITION (P9, TASK 2). <<<
       `remainingEdge()` in rules.js: what is left to make against what is left
       to lose, and whether this structure was ever one the rules would offer.
       XLE could make $4 and lose $346 — a reward-to-risk of 0.01 against a
       floor of 0.25 — while five lines on two screens called it on plan.
       It is a WARNING and it is an ATTENTION item: nothing closes on it, the
       exit rules stay frozen, and `ruleExitOf()` does not know it exists. */
    const edge = remainingEdge({ maxProfit: p.maxProfit == null ? null : p.maxProfit * n, maxLoss: p.maxLoss * n, pnl });
    const level = tpHit || slHit || dteExit || ap || edge.thin ? "action"
      : pnl != null && watchLevel != null && pnl < watchLevel * n ? "watch" : "ok";
    const label = tpHit ? `${takeProfitLabel()} reached — take the profit` : slHit ? `${stopLossLabel()} reached — a warning, not an order` : dteExit ? `${dteLeft} days left — close or roll` : ap ? "The autopilot has something waiting for your OK" : edge.thin ? remainingEdgeLabel(edge) : pnl == null ? "waiting for prices…" : level === "watch" ? "Losing: check the reason you opened it" : "On plan";
    return { p, pnl, pnlNote: pv.sentence, dteLeft, level, label, ap, live, spotNow: sp, tpHit, slHit, dteExit, edge, contracts: n, sizeAssumed: size.assumed };
  }), [ownedPositions, chains, alSync, pnlOf]);

  // Log eventi regola (TP/SL/DTE) fuori dal render: prima veniva chiamato logEvent
  // DENTRO il JSX del tab Paper (setState durante il render) => instabilità del tab.
  useEffect(() => {
    for (const a of posAlerts) {
      if (a.tpHit) logEvent(a.p.id, "tp", `Reached ${takeProfitLabel()} (${fmt$(a.pnl)})`);
      if (a.slHit) logEvent(a.p.id, "sl", `Reached ${stopLossLabel()} (${fmt$(a.pnl)}) — a warning, nothing closes automatically`);
      if (a.dteExit) logEvent(a.p.id, "dte", `Inside the ${RULES.exitDTE}-day exit window`);
    }
  }, [posAlerts, logEvent]);
  /* THE HEADLINE IS DERIVED FROM THE LIST (P9, TASK 2). `nAttention` counted
     only `action`, so a `watch` row printed "Losing: check the reason you
     opened it" under a headline reading "EVERYTHING IS ON PLAN".
     `attentionCount()` in rules.js is the one home: `decisions` draws the
     badge, and `looks` is what no headline may call quiet. */
  const attn = useMemo(() => attentionCount(posAlerts), [posAlerts]);
  const nAttention = attn.decisions;

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
    // THE BUDGET COMES FROM THE ONE HOME, not from a second copy on `wiz`.
    const ans = { ...wizAnswers, ...(overrides || {}) };
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
      const floors = { liquidity: 0, spread: 0, comboSpread: 0, reward: 0, unpriceable: 0, impossible: 0, model: 0,
        // NOT A FLOOR, AND ITS COUNT TRAVELS SEPARATELY. A butterfly is not
        // refused for being a bad price — it is not offered here at all, and
        // pooling it with a floor's count would explain neither.
        butterfly: 0,
        markets: new Set(), oiUnavailable: new Set(), spreadUnavailable: new Set(),
        comboSpreadUnavailable: new Set() };
      for (const r of priced) {
        const tk = r.tk;
        // ...and the guided run reads it too. Its number-one GDX road had legs
        // at 3 and 4 contracts open on a board whose median near the money is
        // 84, because the floor it passed had been told there was no column.
        const c = await ensureOpenInterest(tk, chains[tk] || (await refreshChain(tk, true)));
        if (!c?.spot) { excluded.push({ tk, reason: "nodata" }); continue; }
        const sp = c.spot;
        // THE SAME ONE HOME AS THE OTHER TWO GENERATION SITES (P9, TASK 1).
        // This was `>= RULES.minEntryDTE && <= 130` — right about the floor and
        // a bare 130 about the horizon, which is `RULES.maxEntryDTE` written
        // out a second time and forty days wrong.
        const exps = buildableExpiries(c.expirations.map((e) => ({ key: e, dte: c.byExp[e].dte }))).buildable;
        if (!exps.length) { excluded.push({ tk, reason: "noboard" }); continue; }
        const ek = exps.reduce((b2, e) => Math.abs(e.dte - ans.horizon) < Math.abs(b2.dte - ans.horizon) ? e : b2, exps[0]).key;
        const d2 = c.byExp[ek].dte;
        // The board, from `expiryStrikes()`. `ek` was reduced out of
        // `c.expirations`, so a null here means the chain changed under the
        // run; the market is excluded with the reason it already has for a
        // market it could not read, never carried on with an invented grid.
        const strikes = expiryStrikes(c, ek);
        if (!strikes) { excluded.push({ tk, reason: "nodata" }); continue; }
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
            // ...AND NEITHER IS A BUTTERFLY (ROADMAP P2, decided and until now
            // not implemented). Its maximum needs the market to finish exactly
            // on the middle strike on the last day, so the 50% take profit is
            // unreachable before the 21-DTE exit and the rule the guided flow
            // is teaching never fires. `isButterfly()` in rules.js reads the
            // SHAPE — four presets spell one today and a fifth is one line
            // away. The full desk still builds them.
            if (isButterfly(pr.legs)) { floors.butterfly++; continue; }
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
            // A PRICE THE MODEL DISBELIEVES IS NOT A ROAD. Every figure the
            // verdict would put on it — what you risk, what it pays, how it
            // ranks — is that price, and the maximum loss it would print would
            // be wrong by the same factor it is wrong by (src/rules.js).
            if (!modelCheckOf(a, { legs: pr.legs, spot: sp, dte: d2, iv: getU(tk).iv }).pass) {
              floors.model++; floors.markets.add(tk); continue;
            }
            // THE ONE CHANCE, from the same expression the Shortlist, the
            // Radar, Build and the autopilot use.
            const mc = chanceFor(a, { ticker: tk, legs: pr.legs, spot: sp, dte: d2, expKey: ek });
            const pop = mc ? mc.pop : null;
            const unit = Math.abs(a.maxLoss);
            if (unit > ans.risk) continue;   // it does not fit the budget: not a road
            // THE QUALITY FLOORS (src/rules.js). A structure that clears every
            // other rule can still be a price on a contract nobody trades, or a
            // ticket that pays $15 for $86 at risk. Neither becomes a road, and
            // the tally below is what lets the refusal screen say WHICH floor
            // emptied the board rather than shrugging at an empty page.
            const qf = qualityFloor({
              openInterest: a.legPx.map((l) => l.oi), peerOpenInterest: peers, level: liqLevel,
              // ...and the LEGS, for the combination spread floor beside it.
              quotes: quotesOf(a), legs: pr.legs,
              maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded,
            });
            if (!qf.liquidity.checked) floors.oiUnavailable.add(tk);
            if (!qf.spread.checked) floors.spreadUnavailable.add(tk);
            if (!qf.comboSpread.checked) floors.comboSpreadUnavailable.add(tk);
            if (!qf.pass) {
              if (!qf.liquidity.pass) floors.liquidity++;
              else if (!qf.spread.pass) floors.spread++;
              else if (!qf.comboSpread.pass) floors.comboSpread++;
              else floors.reward++;
              floors.markets.add(tk);
              continue;
            }
            const pr2 = evProfile(mc, a.maxProfit, a.maxLoss);
            pool.push({
              tk, sent, pr, a, mc, pop, unit, ek, spot: sp, dte: d2,
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
        const cut = floors.liquidity + floors.spread + floors.comboSpread + floors.reward;
        // AN UNREADABLE PRICE IS ITS OWN ANSWER. A board where nothing could be
        // priced is not a board emptied by the floors and is certainly not a
        // budget problem — saying either would blame the user, or the market,
        // for a chain the app could not read. Three refusals, three sentences.
        if (floors.unpriceable > 0 && cut === 0 && floors.impossible === 0 && floors.model === 0) {
          return stop([{
            id: "unpriceable",
            text: NOTHING_TODAY.unpriceable({ unpriceable: floors.unpriceable, markets: [...floors.markets] }),
          }]);
        }
        // A BOARD THE APP PRICED AND THEN DISBELIEVED. Different from a board it
        // could not price, and further still from one the floors emptied: here
        // the quotes were read and what they produced — a trade that cannot lose
        // — is impossible. Four refusals, four sentences.
        if (floors.impossible > 0 && cut === 0 && floors.unpriceable === 0 && floors.model === 0) {
          return stop([{
            id: "impossible-loss",
            text: NOTHING_TODAY.impossibleLoss({ impossible: floors.impossible, markets: [...floors.markets] }),
          }]);
        }
        // A BOARD THE APP PRICED AND THEN DID NOT BELIEVE THE PRICE OF. The
        // fifth sentence, and it is none of the other four: the chain quoted,
        // the net cleared the minimum, the worst case is a perfectly possible
        // loss — it is simply not this structure's loss. Saying "we could not
        // price it" would be false, and saying "the floors emptied it" would
        // credit a floor that never looked at it.
        if (floors.model > 0 && cut === 0 && floors.unpriceable === 0 && floors.impossible === 0) {
          return stop([{
            id: "model-disagreement",
            text: NOTHING_TODAY.modelDisagreement({ modelDisagreement: floors.model, markets: [...floors.markets] }),
          }]);
        }
        if (cut > 0 || floors.impossible > 0 || floors.unpriceable > 0 || floors.model > 0) {
          return stop([{
            id: "quality-floor",
            text: NOTHING_TODAY.belowQualityFloor({
              liquidity: floors.liquidity, spread: floors.spread, comboSpread: floors.comboSpread,
              reward: floors.reward,
              unpriceable: floors.unpriceable, model: floors.model,
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
        // ONE COMBINATION, DELIBERATELY, AND THE CARD SAYS SO. A road is built
        // to fit the budget answer at one contract (`unit > ans.risk` above is
        // that test), so this genuinely is a per-contract figure and not a
        // hardcoded quantity standing in for one nobody asked for. The size is
        // chosen on Build, where the ticket, the gate and the position record
        // all read the same number.
        rr: x.rr, contracts: 1, a: x.a, fused: x.fused,
        driver: x.driver, drivers: x.drivers,
        // THE TWO NUMBERS THE PICTURE IS DRAWN AT ARE THE TWO THE CHANCE WAS
        // WORKED OUT AT. This was `sigmaFor(x.tk).sigma` — the REALISED
        // volatility — beside a `pop` computed at the chain's IMPLIED one, and
        // with no drift travelling at all.
        ...chanceDrawFields(x.mc),
        /* A ROAD CARRIES THE SOURCE OF ITS OWN CHANCE. Two roads are ranked on
           one scale across the whole basket, so road 1 and road 2 can be in
           different markets — and two roads compared side by side can have their
           "works out N times in 10" drifted on two different tables.

           >>> IT TAKES THE PROVENANCE, NOT THE CHANCE. <<< Read on the owner's
           phone, XLE 21 September 2026: the road card said *"Drifted on the
           HAND-WRITTEN seasonal estimate for XLE… that table is wrong on eight
           months of twelve"* while the header two blocks above read "SEASONAL
           SOURCE · Alpha Vantage · 11y" and the Build screen for the same trade
           said "Drifted on XLE's MEASURED seasonality: 11 years of monthly
           prices, read today". **XLE has no hand-written table at all** — the
           liquid tier deliberately carries none — so the card was naming a table
           that does not exist.

           The cause is that this was handed `x.mc`. A `chanceOf()` result
           carries `seasonalSource` / `seasonalYears` / `seasonalAgeDays`;
           `seasonalStampFields()` reads a PROVENANCE, whose fields are `source`
           / `years` / `ageDays`. Every one came back `undefined`, the record
           went out unstamped, and `seasonalStampOf()` reads an absent stamp as
           the hand-written table — which is the right reading for a record
           written before stamps existed and the wrong one for a road generated
           three seconds ago. And when `chanceOf()` returns null, as it does for
           a market with no seasonal reading at all, there was no object to read
           at all. `seasonalFor()` is the same provenance `chanceFor()` drifted
           this candidate on, so the stamp and the arithmetic cannot disagree. */
        ...seasonalStampFields(seasonalFor(x.tk)),
      });
      const roads = [toCandidate(first, 1), toCandidate(second, 2)];

      // 8) The copilot narrative: what was actually examined, in English, with
      // the real counts. Generated in src/signals.js from the same data the
      // score came from — never a template with the numbers dropped in.
      setVerdict(verdictNarrative({
        basket, examined, excluded, newsItems: newsPool, weatherData: weather,
        month: NOW_MONTH, weights: ans.weights, chosen: roads,
        floors: { liquidity: floors.liquidity, spread: floors.spread, comboSpread: floors.comboSpread,
          reward: floors.reward,
          unpriceable: floors.unpriceable, impossible: floors.impossible,
          butterfly: floors.butterfly,
          markets: [...floors.markets], oiUnavailable: [...floors.oiUnavailable],
          spreadUnavailable: [...floors.spreadUnavailable],
          comboSpreadUnavailable: [...floors.comboSpreadUnavailable] },
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
      /* AND WHICH BOARDS IT ACTUALLY READ. `examined` is every market whose
         chain and expiry this run got as far as pricing; without it the Radar
         reported "not searched yet" about markets the narrative four lines
         above named as having come through. See `radarSplit()` in rules.js. */
      setGuided({ at: Date.now(), basket, roads: roads.length, examined: examined.map((e) => e.tk) });
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

  /* ---- profilo strategia: EV per $100 a rischio + etichetta onesta ----

     THE EXPECTED VALUE IS THE SIMULATION'S OWN MEAN NOW. It was
     `pop * maxProfit - (1 - pop) * risk`: a two-outcome bet, the best case or
     the worst case and nothing in between, weighted by a probability computed
     somewhere else entirely. An iron condor that finishes a dollar inside a
     short strike is neither of those two numbers, and neither is a vertical
     that expires between its strikes — which is most of the distribution. The
     Monte Carlo has already walked every one of those outcomes and averaged
     them, so this reads `mc.ev` and stops inventing a second arithmetic.

     THE GUARDS ARE UNCHANGED, DELIBERATELY. A structure with no ceiling still
     returns null and still ranks last with a blank EV — `mc.ev` exists for it
     and is honest, but making it rankable is a change to the no-ceiling rule
     (PRD §4c) rather than to this arithmetic, and it is not this PR's. */
  const evProfile = (mc, maxProfit, maxLoss) => {
    if (!mc || !Number.isFinite(mc.ev) || !Number.isFinite(maxProfit) || !Number.isFinite(maxLoss) || maxLoss >= 0) return null;
    const pop = mc.pop;
    const risk = Math.abs(maxLoss);
    // Nothing divides by a risk the app could not read. `rewardRisk()` is the
    // one place that judgement is made, and everything here divides by `risk`.
    const rr = rewardRisk(maxProfit, maxLoss);
    if (rr == null) return null;
    const ev = mc.ev;
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
      let added = 0, upgraded = 0;
      setStore((st) => {
        const sigOf = (tk, exp, legs) => tk + exp + legs.map((l) => `${l.side}${l.type[0]}${l.strike}x${l.qty}`).sort().join("");
        const known = new Set(st.positions.map((p) => sigOf(p.ticker, p.expKey || "", p.legs)));
        /* >>> A MATCH IS NOT A REASON TO DO NOTHING (P9, TASK 0a). <<<
           This loop used to `continue` on a signature already in the store,
           which is right about ADDING and wrong about everything else: a
           record written before PR #33 carries no `alpacaHeld`, no
           `entrySource`, no measured size and no fill or plan entry, and the
           `continue` meant the upgrade could never reach it. XLE J-0002 —
           the one holding the owner actually has — read "1 contract —
           assumed, not recorded" against a broker that was listing it.

           `upgradeHolding()` in journal.js is the one home for what a
           holdings payload is allowed to write back onto a record. It
           returns the SAME object when there is nothing to add, so the
           60-second sync cannot loop and running it twice is running it
           once. The plan SENTENCE is passed in, because words that state a
           rule live in rules.js and never in a record-shaped function. */
        let next = st.positions.map((p) => {
          const g0 = Object.values(groups).find((g) => sigOf(g.und, g.exp, g.legs) === sigOf(p.ticker, p.expKey || "", p.legs));
          if (!g0) return p;
          const exitOn0 = new Date(new Date(g0.exp).getTime() - RULES.exitDTE * 864e5).toISOString().slice(0, 10);
          const up = upgradeHolding(p, g0, {
            plan: `Exit plan starts from the broker's own fill — ${exitPlanSentence()} On this expiry the ` +
              `${RULES.exitDTE}-day mark is ${exitOn0}.` });
          if (up !== p) upgraded++;
          return up;
        });
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
          /* >>> THE FILL THE APP COULD NOT SEE (PRD §4r). <<< This record used
             to carry `alpacaId: "sync"` — a sentinel, not an order id — and no
             status at all, so `positionStage()` read a holding the broker
             ALREADY OWNS as an order still waiting to fill, and printed it
             under WORKING with "A ? order, which time in force not recorded".
             It could never resolve either: `recheckOrders()` then asked for
             `GET /v2/orders/sync`, which 404s into a silent catch.

             `/v2/positions` RETURNS ONLY WHAT THE ACCOUNT HOLDS. There is no
             order here, so no order field is invented for one: `alpacaHeld`
             says what the record is and `positionStage()` reads it (journal.js).

             And it is a FILL, so it carries the price it was filled at —
             `avg_entry_price` summed over the legs, which is what `g.net`
             already is — stamped `entrySource: "fill"`, the sixth use of "the
             absence of the stamp is the marker". The legs carry the broker's
             own quantities and `payoffExp` multiplies by them, so the size is
             MEASURED and `contracts: 1` here is not an assumed one. */
          const exitOn = new Date(new Date(g.exp).getTime() - RULES.exitDTE * 864e5)
            .toISOString().slice(0, 10);
          next.push({
            id: Date.now() + added, name: "Imported from Alpaca", ticker: g.und, expKey: g.exp,
            legs: g.legs, entryNet: g.net, entrySpot: chains[g.und]?.spot ?? null,
            openedAt: new Date().toISOString(), expiry: g.exp,
            maxProfit: Number.isFinite(mp) ? mp : 0, maxLoss: Number.isFinite(ml) ? ml : 0,
            realEntry: true, alpacaId: null, alpacaHeld: true, alpacaLive: true,
            // NO ORDER FIELDS. There is no order here, so there is no status
            // to record and none is written: `positionStage()` reads
            // `alpacaHeld` and never asks `orderLifecycle()` about a holding.
            // Writing `alpacaStatus: "filled"` would be the app asserting an
            // order the broker never told it about — the same class of fault
            // as the sentinel this replaces.
            entrySource: "fill", contracts: 1,
            thesis: { imported: true, iv: getU(g.und).iv, seasonal: seasonalNowOf(seasonal, g.und), pop: null, spot: chains[g.und]?.spot ?? null, vega: 1 },
            timeline: [
              { t: Date.now(), type: "fill", text:
                `Read from your Alpaca paper account as an OPEN POSITION — ${g.legs.length} legs, ` +
                `${dte0} days to expiry, at the broker's own average entry prices ` +
                `(${limitWords(g.net) || "a net the app could not read"} a combination). ` +
                `This is a fill, not an order: the broker lists only what the account holds.` },
              // NEVER INVENT THE LIMIT. The app did not send this order — or
              // sent it before its local record was cleared — so there is no
              // intended price to hold the fill against, and the row says so
              // rather than quoting the fill back as if it were the target.
              { t: Date.now(), type: "note", text: fillVsLimit({ limit: null, fill: g.net, contracts: 1 }).sentence },
              { t: Date.now(), type: "plan", text:
                `Exit plan starts now — ${exitPlanSentence()} On this expiry the ${RULES.exitDTE}-day mark ` +
                `is ${exitOn}.` },
            ],
          });
          added++;
        }
        if (!added && !upgraded) return st;
        const ns = { ...st, positions: next };
        saveState(ns);
        return ns;
      });
      if (!silent) setMsg(added
        ? `Imported ${added} position${added === 1 ? "" : "s"} from Alpaca.`
        : upgraded
          ? `${upgraded} position${upgraded === 1 ? " was" : "s were"} brought up to what Alpaca reports: the size is the broker's own leg quantities now, not an assumed one.`
          : "Every Alpaca position is already linked.");
    } catch (e) { if (!silent) setMsg(`Could not import from Alpaca: ${e.message}`); }
  }, [chains, seasonal]);

  useEffect(() => {
    (async () => {
      try { const acc = await alpacaGet("/v2/account"); if (acc?.account_number) { setAlpaca(acc); importAlpaca(true); } } catch { /* non configurato */ }
    })();
  }, []); // eslint-disable-line

  /* ---- percorso: livello + awareness score ---- */
  const journey = useMemo(() => {
    /* A TEST IS NOT A TRADE (P9, TASK 3). Three records opened and closed by
       hand within the minute at zero P&L moved the owner up a level and spent
       his "patience" budget. `scoredJournal()` in journal.js steps over them;
       they are NOT deleted, and the Journal row below says what they are. */
    const j = scoredJournal(store.journal || []);
    const closed = j.length;
    const ruled = j.filter((x) => x.ruleExit).length;
    const disciplina = closed ? ruled / closed : null;
    const coerenza = closed ? j.filter((x) => x.riskOk).length / closed : null;
    // A TRADE NOBODY BOUGHT IS NOT A TRADE YOU OPENED. This counted every
    // record in `store.positions`, so three orders that came back with
    // nothing bought moved the owner up a level and spent his "patience"
    // budget — three trades in a week that never happened.
    const opened0 = bookPositions(store.positions);
    const opens = [...j.map((x) => new Date(x.openedAt).getTime()), ...opened0.map((p) => new Date(p.openedAt).getTime())].sort();
    let maxWk = 0;
    for (let i = 0; i < opens.length; i++) { let c2 = 1; for (let k = i + 1; k < opens.length && opens[k] - opens[i] < 6048e5; k++) c2++; maxWk = Math.max(maxWk, c2); }
    const pazienza = opens.length === 0 ? null : maxWk <= 3 ? 1 : maxWk <= 5 ? 0.6 : 0.2;
    const parts = [disciplina, coerenza, pazienza].filter((x) => x != null);
    const score = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length * 100) : null;
    const opened = closed + opened0.length;
    let level = 1, next = "Open your first paper trade";
    if (opened >= 1) { level = 2; next = `Open ${Math.max(0, 3 - opened)} more to reach level 3`; }
    if (opened >= 3) { level = 3; next = `Close ${Math.max(0, 5 - ruled)} trades by the rules to reach level 4`; }
    if (ruled >= 5 && (disciplina ?? 0) >= 0.6) { level = 4; next = "Reach 10 closed trades with 80% discipline for level 5"; }
    if (closed >= 10 && (disciplina ?? 0) >= 0.8) { level = 5; next = "You have the full set of habits. Ask the copilot whether you are ready for real money."; }
    return { level, next, score, disciplina, coerenza, pazienza, closed, opened, ruled };
  }, [store.journal, store.positions, store.settings.capital]);

  // The Journal list: filtered by the search box, newest ref first. The sort is
  // by REF and not by date, so the order on screen is the order the trades were
  // opened in and a ref you are holding is where you expect to find it.
  const journalRows = useMemo(() => searchJournal(store.journal || [], jq), [store.journal, jq]);

  /* ---- risk gate (PRD §8) ----
     Un solo cancello per ogni ordine. La UI non ricalcola mai i limiti: chiede
     a src/riskGate.js e mostra quello che risponde. */
  /* THE EXPOSURE IS MEASURED ON THE BOOK, NOT ON THE DECISIONS LOG.
     `store.positions` is what the app DECIDED; the gate was reading it whole
     and charging the 25% exposure ceiling for trades the broker never filled.
     Read on the phone, SOYB, 21 September 2026: "$1,042 already at risk" —
     450 + 577 + 14, the three rows sitting under WATCHING — against zero
     positions. `bookPositions()` in journal.js is the one home for which of
     the three stages count, and why `working` is one of them. */
  /* THE CHECKS ON SCREEN ARE THE CHECKS THE TAP RUNS — one expression, so
     they cannot be two answers.

     `bookFor(viaBroker)` is the ONLY place this app decides which account a
     gate call is measured against. `true` means the order will reach Alpaca,
     so it is measured against the Alpaca account: whatever `paperStatus()`
     makes of it — verified by the proxy's own header, verified by a PA account
     number, or NOT VERIFIED AT ALL, which refuses the order — is what the
     screen prints and what the send enforces. `false` means nothing leaves the
     browser, and only then is `LOCAL_BOOK` the truth.

     Non-negotiable rule 1 is "if paper mode cannot be verified, reject", and a
     checklist that answers it about a different account than the send does is
     not an answer at all. */
  const bookFor = useCallback((viaBroker) => (viaBroker ? alpaca : LOCAL_BOOK), [alpaca]);
  const gate = useCallback((proposal, account) => evaluateTrade({
    proposal,
    portfolio: { positions: bookPositions(store.positions), account: account === undefined ? alpaca : account },
    capital: capitalAnswers,
    signals: fused[proposal?.ticker || ticker] || null,
  }), [store.positions, alpaca, capitalAnswers, fused, ticker]);

  const guard = useMemo(() => {
    if (!AE) return null;
    // AT THE QUANTITY THAT WILL ACTUALLY BE SENT. This read `contracts: 1`
    // while the ticket below it sized the order at `cfg.qty`, so the checks the
    // user read and the checks the order had to pass were about two different
    // trades — and the per-trade cap was measured against one combination of a
    // seven-lot spread.
    // ...AND AT THE PRICE THAT WILL ACTUALLY BE SENT. The per-trade cap is
    // measured against the maximum loss, and on UNG the maximum loss at the
    // mid is $14 while the maximum loss at the price that trades is $24 — the
    // gate was reading a figure the order could not be filled at.
    // ...AND AT THE CONTRACTS THE CHAIN REALLY LISTED. Without `occs` the gate
    // cannot see that a leg names a symbol nobody issued, which is what the
    // broker refused on 20 September before the order reached the market.
    // ...AND AGAINST THE ACCOUNT THE SEND WILL USE. This passed `LOCAL_BOOK`,
    // so the trade card's checklist — the one thing on the Build screen that
    // answers "is this paper?" — was answering about the app's own book while
    // the order ticket beside it gates against Alpaca. With the broker
    // connected the route to an order on this screen IS that ticket, so this
    // is the broker's account; with none connected the only route is the
    // confirm step, which records locally. One expression, `bookFor()`.
    return gate({ ticker, intent: "open", legs, dte, contracts, maxLoss: AE.maxLoss, maxProfit: AE.maxProfit,
      quotes: quotesOf(AE), net: AE.entry, occs: occsOf(AE), entryOverride: roomReason }, bookFor(!!alpaca));
  }, [AE, gate, bookFor, alpaca, legs, dte, ticker, roomReason, contracts]); // eslint-disable-line
  /* Which band this expiry falls in, for the screen. The gate decides; this
     only decides what the screen has to ASK for. */
  const room = useMemo(() => entryRoom(dte), [dte]);


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
  // ONE HOME FOR THE OVERRIDE MINIMUM. This was a bare 15 sitting beside the
  // constant it is a copy of; the entry-room override added a second caller and
  // a second copy is how the two come to disagree about what a reason is.
  const REASON_MIN = RULES.minOverrideReasonChars;
  const reasonOk = !clash || against.reason.trim().length >= REASON_MIN;

  /* ====================================================================
     THE TRADE CARD (PRD §4n, ROADMAP P4) — FIVE LINES, ASSEMBLED HERE AND
     WRITTEN IN rules.js.

     >>> NO NEW ARITHMETIC. <<< Every argument below is a figure this screen
     already computes: `AE` is `analyze()` at the price that will be sent,
     `chance` is the one seeded Monte Carlo every other screen prints, `guard`
     is the gate at the quantity that will be sent, and `tradeDir` is the net
     delta. The card READS them and writes English.

     THE CHANCE TRAVELS WITH ITS PROVENANCE, as it must everywhere:
     `chanceSourceNote()` says which seasonal table drifted it, so the card
     cannot be the one screen that prints a probability without its source.
  ==================================================================== */
  const buildPriceable = useMemo(
    () => (A ? priceability({ legs, quotes: quotesOf(A), net: A.entry, maxLoss: A.maxLoss })
      : { priceable: true, reasons: [] }),
    [A, legs]);
  /* THE REFUSALS ARE THE GATE'S OWN, VERBATIM. Every reason an order does not
     leave is a gate violation — including the two this session added to it —
     so there is one list and it is not re-derived here. */
  const buildRefusals = useMemo(() => (guard && !guard.pass ? guard.violations : []), [guard]);
  const buildCard = useMemo(() => {
    if (!AE) return null;
    return tradeCard({
      ticker, name: stratName, dir: tradeDir, spot, expKey, dte,
      maxLoss: AE.maxLoss, maxProfit: AE.maxProfit, breakevens: AE.breakevens,
      profitUnbounded: AE.profitUnbounded, contracts,
      /* THE PRICE THE FIGURES WERE WORKED OUT AT, BY NAME. `AE.entry` is
         `effectiveLimit()`'s net whenever the ticket has a readable one and the
         mid when it has not, and `AE.entrySource` says which — the same pair
         `analyze()` has carried since §4l. The card printing the risk without
         the price is how "$44" and an order for "$60" read as two trades. */
      entry: AE.entry, entrySource: AE.entrySource,
      chance, chanceNote: chance ? chanceSourceNote(chance, ticker) : null,
      limits: guard ? guard.limits : null,
      notional: notionalControlled(contracts, spot),
      agreement: fused[ticker]?.agreement || null,
      clashCount: clash ? clash.n : 0,
    });
  }, [AE, ticker, stratName, tradeDir, spot, expKey, dte, contracts, chance, guard, fused, clash]);

  /* ---- scanner ----
     Il punteggio non è più la sola stagionalità: pesa fuseSignals(), che
     contiene già stagionalità, trend, meteo e news con i loro pesi (PRD §7).
     Un ticker in CONFLICT finisce ULTIMO comunque: quando i fattori si
     contraddicono non sappiamo abbastanza, e nessun rendimento atteso può
     farci cambiare idea. */
  const scan = useMemo(() => Object.entries(UNDERLYINGS).map(([tk, u]) => {
    // NULL WHERE NOBODY HAS MEASURED IT. The liquid tier has no hand-written
    // row, so this is null until Alpha Vantage lands — and the ROW below prints
    // a sentence rather than "+0.0%/mo", which is a claim about a market.
    const seasonalScore = seasonalNowOf(seasonal, tk);
    const c = chains[tk];
    const f = fused[tk];
    // fuseSignals vive in -100..+100, la stagionalità in %/mese: /25 le riporta
    // sulla stessa scala prima di sommarle.
    // A SORT KEY CANNOT BE NULL, so an unknown season contributes nothing to
    // the ORDER of the list. That is not the same as printing a zero: the
    // number on screen is `seasonalScore`, which stays null and says so.
    const score = (seasonalScore ?? 0) * 1.5 + (f ? (f.score / 25) * (f.confidence / 100) : 0);
    const sugg = score > 1.5 ? "verybull" : score > 0.5 ? "bull" : score < -1.5 ? "verybear" : score < -0.5 ? "bear" : "neutral";
    return { tk, name: u.name, spot: c?.spot ?? null, seasonalScore, score, sugg, real: !!seasonal[tk],
      // ONE SERIES, ONE NUMBER OF YEARS. The header said "10y history" and the
      // panel beside it said "11y" about the same numbers: the ten-year cutoff
      // lands mid-year, so the matrix holds eleven calendar years of which the
      // first and last are partial. `years` is the row count and the only
      // figure any screen prints.
      years: seasonal[tk]?.years ?? null, hasChain: !!c,
      // AND THE STAMP TRAVELS WITH THE ROW, because the weekly report is built
      // from `scan` and is read away from the screen: "seasonal +1.5%/mo" in a
      // document with nothing saying which table produced it is the same fault
      // as a chance with nothing saying which table drifted it.
      ...seasonalStampFields(seasonalFor(tk)),
      fused: f, conflict: f?.agreement === "CONFLICT", agreement: f?.agreement, signalScore: f?.score ?? 0, confidence: f?.confidence ?? 0 };
  }).sort((a, b) => (a.conflict !== b.conflict ? (a.conflict ? 1 : -1) : b.score - a.score)), [chains, seasonal, fused, seasonalFor]);

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
    /* SEARCHED, EVEN WHEN IT PRODUCED NOTHING. Three things count as having
       read a board: the guided run examined it, the wide search ran on it, or
       the floors emptied it. Without this a market the guided run priced and
       did not choose read as "not searched yet" on the same screen that named
       it as examined (`radarSplit()` in rules.js). */
    for (const tk of (guided?.examined || [])) touch(tk).searched = true;
    if (multi.res) for (const tk of (multi.sel || [])) touch(tk).searched = true;
    for (const tk of (multi.floors?.markets || [])) { touch(tk).cut = true; touch(tk).searched = true; }
    for (const tk of (multi.floors?.oiSkipped || [])) touch(tk).oiSkipped = true;
    for (const tk of (multi.floors?.spreadSkipped || [])) touch(tk).spreadSkipped = true;
    for (const k of Object.keys(m)) m[k].expiries = [...m[k].exps].sort();
    return m;
  }, [candidates, multi.res, multi.sel, multi.floors, guided]);

  /* ============================== RENDER ============================== */
  // The old "Today" tab is gone: what needs attention today is the wizard's
  // front page now (PRD §5), so keeping a second copy behind a flag would just
  // be two screens that can disagree about the same positions.
  // THE PATH IS THE FIRST PLACE, and it is three steps rather than one page:
  /* WHICH MARKETS GET A ROW, AND WHICH GET A NAME IN ONE LINE.
     `radarSplit()` in rules.js decides; this only supplies the two facts it
     reads. The basket is ten markets since the liquid tier, and a screen whose
     content is ten paragraphs explaining why it is empty is not a screen. */
  const radarRows = useMemo(
    () => radarSplit(scan.filter((r) => BASKET.includes(r.tk))
      .map((r) => ({ ...r, n: (marketFacts[r.tk] || {}).n || 0,
        cut: !!(marketFacts[r.tk] || {}).cut, searched: !!(marketFacts[r.tk] || {}).searched }))),
    [scan, marketFacts]);
  const radarQuiet = useMemo(() => radarQuietNote(radarRows), [radarRows]);

  // 1 Radar (every market), 2 Shortlist (the structures that survived), 3 Build
  // (one trade taken apart). Positions and the Journal are the other two places.
  // Settings sits behind the gear, not in the row.
  //
  // Radar and Shortlist used to be EVIDENCE panels appended to the Build page.
  // They are steps now, because they are not evidence for a trade — they are
  // how you arrive at one, and each of them is a decision of its own.
  /* WATCHING IS THE THIRD PLACE, AND IT EXISTS BECAUSE THE FIRST TWO WERE
     BEING ASKED TO HOLD SOMETHING THAT IS NEITHER. A trade you did not take
     is not a position and it is not history: it is a live observation, and
     the owner asked for it in those words — "magari voglio vedere come
     sarebbe andata, ma non deve stare nella stessa schermata delle posizioni
     e ordini." Putting it inside the Journal would have been the compromise
     that gets undone in two months, because the Journal is the record of what
     HAPPENED and this is a question about what is happening now. */
  const OTHER_PLACES = [
    { id: "positions", label: "Positions", I: Briefcase },
    { id: "watching", label: "Watching", I: Layers },
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
        <OfflineBanner />
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
        <OfflineBanner />
        {msg && (
          <div style={{ ...mono, fontSize: 12, color: T.amber, background: `${T.amber}12`, borderBottom: `1px solid ${T.amber}44`, padding: "10px 14px" }}>{msg}</div>
        )}
        {wizStep === "open" && (
          <WizardOpen
            /* "N OPEN POSITIONS" MEANS OWNED. Working orders have their own
               panel on this screen and trades nobody bought are under
               Watching; counting all three here is how the front page came to
               say "3 open positions" over a broker holding none. */
            positions={ownedPositions} posAlerts={posAlerts} attention={nAttention} looks={attn.looks}
            marketReady={marketReady} barsFor={(tk) => barsCache[tk] || []}
            onPositions={() => { setView("desk"); setTab("positions"); }}
            onFind={() => { setNothing(null); setWizStep("questions"); }}
            onDesk={() => goStep("radar")}
            onSettings={() => { setView("desk"); setShowSettings(true); }}
          />
        )}
        {wizStep === "questions" && (
          <FindOpportunities
            answers={wizAnswers} setAnswers={setWizAnswers} limits={limits} busy={wiz.busy} err={wiz.err}
            request={request} onRequest={(patch) => setWant((w) => ({ ...w, ...patch }))}
            universe={BASKET.map((tk) => ({ tk, name: getU(tk).name }))}
            onBack={goHome} onDecide={() => runWizard()}
          />
        )}
        {wizStep === "nothing" && (
          <NothingToday
            reasons={nothing || []} notified={!!store.settings.notifyWhenReady}
            hasPositions={bookPositions(store.positions).length > 0}
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
      <OfflineBanner />
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
          {/* A DASH, NOT A ZERO. `seasNow` is null for a market whose monthly
              history has not loaded and has no written row behind it, and
              "+0.0%" there would be the app claiming it measured no edge. */}
          <Stat k={`SEASONALITY ${MONTHS[NOW_MONTH].toUpperCase()}`}
            v={seasNow == null ? "—" : `${seasNow > 0 ? "+" : ""}${seasNow.toFixed(1)}%`}
            c={seasNow == null ? T.dim : seasNow > 0 ? T.green : T.red}
            tip={seasNow == null ? seasProv.note : undefined} />
          {/* A MARKET ON THE FALLBACK SAYS WHY. `SEASONAL` in engine.js is
              hand-written and wrong on eight months of twelve for CORN, and it
              carries the heaviest of the four weights. "Estimate" is not a
              reason; "the call failed" and "nobody asked yet" are. */}
          <Stat k="SEASONAL SOURCE" v={seasonal[ticker] ? seas.src : "hand-written estimate"}
            c={seasonal[ticker] ? (seasonalState[ticker]?.error ? T.amber : T.green) : T.amber}
            tip={`${seasonalSourceLine(seasonal[ticker], seasonalState[ticker], seasProv)} · ${freshnessNote("seasonal", seasonal[ticker]?.at)}`} />
          {/* >>> THE HEADER CARRIES NOTHING THAT ASKS NOTHING OF THE USER
              (P9, TASK 3). <<< "IV RANK · 6d collected" is a PROGRESS BAR for
              a number that is not yet a number: there is no decision in it, no
              action behind it, and it sat in the row the reader scans first on
              every screen. The rank itself still earns its place — it is what
              `RULES.expensiveIVRank` refuses a trade on — so it stays when it
              EXISTS, and the collection counter moved to the History overlay,
              which is where the history is. */}
          {ivRank?.rank != null && (
            <Stat k="IV RANK" v={`${ivRank.rank}`}
              c={ivRank.rank >= RULES.expensiveIVRank ? T.red : ivRank.rank <= 40 ? T.green : T.mut}
              tip="Where today's option prices sit against their own past year (0 = cheapest ever, 100 = dearest). High means selling premium pays better; low means buying options is good value." />
          )}
        </div>

        {msg && <div style={{ ...mono, fontSize: 11.5, color: T.amber, border: `1px solid ${T.amber}44`, background: `${T.amber}10`, borderRadius: 6, padding: "7px 10px", marginTop: 10 }}>{msg}</div>}

        <TabBoundary k={`${tab}/${step}/${ev}`}>
        {/* AND A WORKING ORDER IS SOMETHING THAT NEEDS A DECISION TODAY. It
            is not a position, so it is not in `posAlerts`, and that is exactly
            how it stayed invisible: the app's own list of what needs attention
            only ever contained things that had already happened. */}
        {workingOrders.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.panel, border: `1px solid ${T.amber}66`, borderRadius: 8 }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: T.amber, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={11} /> {workingOrders.length} ORDER{workingOrders.length === 1 ? "" : "S"} WORKING AT THE BROKER · NOT FILLED
            </div>
            <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
              {workingOrders.map((p) => (
                <button key={p.id} onClick={() => { setView("desk"); setTab("positions"); }}
                  style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", background: "transparent", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 4, background: T.amber, flexShrink: 0 }} />
                  <span style={{ ...mono, fontSize: 11.5, color: T.ink, fontWeight: 700 }}>{p.ref ? `${p.ref} ` : ""}{p.ticker} {p.name}</span>
                  <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>
                    · sent, nothing bought{(() => { const sl = storedLimitOf(p);
                      return sl.has ? (sl.signed ? ` · a ${sl.kind} limit of ${money(sl.magnitude * 100)}`
                        : ` · a limit of ${money(sl.magnitude * 100)}, direction not recorded`) : ""; })()} →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Alert Center: morning check */}
        {posAlerts.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 12px", background: T.panel, border: `1px solid ${nAttention ? T.red : T.line}55`, borderRadius: 8 }}>
            <div style={{ ...mono, fontSize: 10, letterSpacing: "0.15em", color: nAttention ? T.red : T.amber, display: "flex", alignItems: "center", gap: 6 }}>
              <Bell size={11} /> TODAY · {nAttention
                ? `${nAttention} POSITION${nAttention === 1 ? "" : "S"} NEED A DECISION`
                : attn.looks
                  ? `${attn.looks} POSITION${attn.looks === 1 ? "" : "S"} TO LOOK AT`
                  : "EVERYTHING IS ON PLAN"}
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
              {/* >>> WHERE THE IV-RANK COUNTER WENT (P9, TASK 3). <<< It was
                  in the header stat row — "IV RANK · 6d collected" — which is
                  a progress bar for a number that is not yet a number, in the
                  row the reader scans first on every screen. The collection is
                  HISTORY, so it belongs in the panel whose subject is history,
                  and it renders only while there is nothing to report. */}
              {ivRank && ivRank.rank == null && (
                <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginBottom: 10, lineHeight: 1.6 }}>
                  IV rank: {ivRank.collecting} day{ivRank.collecting === 1 ? "" : "s"} of implied volatility
                  collected for {ticker}, of the 20 it takes to place today against its own past year. It
                  builds up with one refresh a day.
                </div>
              )}
              {/* THE PRICE CHART, WHICH NOTHING HAS EVER RENDERED.
                  `PriceChart` has been exported from pro.jsx since the desk
                  was built and mounted by no screen in the app: the candles,
                  the support and resistance lines, the break-evens and the leg
                  lines were all code nobody could see. This is where price
                  history belongs — the panel whose whole subject is what this
                  market has done — and it carries the indicators now.
                  The break-evens and the legs are the ones on the Build screen
                  above, so the chart is about THIS trade, not about the
                  ticker in the abstract. */}
              <Panel>
                <PriceChart ticker={ticker} levels={lv}
                  breakevens={legs.length && AE ? AE.breakevens : []}
                  legLines={legs.map((l) => ({ price: l.strike, side: l.side,
                    label: `${l.side > 0 ? "+" : "\u2212"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}` }))}
                  onBars={setTaBars} />
                {/* THE TECHNICAL COPILOT SITS DIRECTLY UNDER THE CHART IT IS
                    ABOUT, and its conversation lives in App.jsx — an evidence
                    panel owns no state, or an answer that lands while the
                    sheet is shut never reaches the screen. */}
                <TaCopilot ticker={ticker} bars={taBars} convo={taChat} setConvo={setTaChat}
                  onAnalysis={logAnalysis}
                  structure={legs.length && AE ? { name: stratName, expKey, dte,
                    legs, breakevens: AE.breakevens, entry: AE.entry, maxLoss: AE.maxLoss, spot } : null} />
              </Panel>
              <Panel style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>SEASONALITY · {seasonal[ticker] ? seas.src : seasProv.missing ? "NOT LOADED — NO READING AT ALL" : "ESTIMATE — LOAD THE REAL HISTORY"}</Lbl>
                  <Btn small ghost color={T.blue} onClick={loadSeasonal} disabled={busy === "av"}>
                    <RefreshCw size={11} /> Refresh real seasonality
                  </Btn>
                </div>
                {(() => {
                  const mm = seas.monthlyMean;
                  // NO ROW, NO CHART AND NO PLAIN WORDS. `Math.max(...null)` is
                  // a crash and `mm[NOW_MONTH] || 0` is a lie; the honest third
                  // option is the sentence `seasonalProvenance()` already
                  // writes for exactly this case.
                  if (!Array.isArray(mm)) return (
                    <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, padding: "8px 10px", background: `${T.amber}0a`, borderRadius: 6, lineHeight: 1.55 }}>
                      {seasProv.note}
                    </div>
                  );
                  const bi = mm.indexOf(Math.max(...mm)), wi = mm.indexOf(Math.min(...mm));
                  const cur = mm[NOW_MONTH];
                  const rank = [...mm].sort((a, b) => b - a).indexOf(cur) + 1;
                  return (
                    <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, padding: "8px 10px", background: `${T.amber}0a`, borderRadius: 6 }}>
                      <b style={{ color: T.ink }}>In plain words:</b> {ticker}'s best month historically is <b style={{ color: T.green }}>{MONTHS[bi]}</b> ({mm[bi] > 0 ? "+" : ""}{mm[bi].toFixed(1)}% a month on average), its worst is <b style={{ color: T.red }}>{MONTHS[wi]}</b> ({mm[wi].toFixed(1)}%). {MONTHS[NOW_MONTH]} (the amber bar) ranks {rank} of 12: {cur > 0.8 ? "the season is behind you — a directional trade makes sense." : cur < -0.8 ? "the season is against you — favour downside or non-directional trades." : "no clear push this month — a range trade suits it better."}
                    </div>
                  );
                })()}
                {Array.isArray(seas.monthlyMean) && (
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
                )}
              </Panel>

              {/* TWO QUESTIONS, NOT THREE PROBABILITIES. This panel used to
                  name three numbers and explain which to read — because there
                  really were three, computed three ways, and a paragraph of
                  prose was standing in for an arithmetic that did not agree
                  with itself. There is one chance now and it is the same number
                  on every screen; what remains is a genuine difference of
                  QUESTION, and two questions need two sentences, not three. */}
              <Panel style={{ marginTop: 10 }}>
                <Lbl>TWO QUESTIONS · WHERE IT ENDS, AND HOW IT ENDS</Lbl>
                <div style={{ fontSize: 12.5, color: T.body, marginTop: 8, lineHeight: 1.6 }}>
                  <b style={{ color: T.blue }}>CHANCE</b> (everywhere — Radar, Shortlist, Build, your open positions and the autopilot's brief): where the price finishes <i>at expiry</i>, and whether the trade is in profit there. One simulation, one seed, the same number on every screen. Use it to <b>compare trades</b>.<br/>
                  <b style={{ color: T.violet }}>EXIT PATH</b> (on open positions): a different question — it walks day by day <i>from today</i> and applies your own rules ({ruleBadge()}), so it answers "from here, how does this end if I stick to the plan?" rather than "where does it finish". Use it to <b>decide whether to hold or take the money</b>.
                </div>
              </Panel>

              <Panel style={{ marginTop: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                  <Lbl>THE SIMULATION BEHIND THE CHANCE — "{stratName}"</Lbl>
                  <Btn small onClick={runMC} disabled={!A || !seas.matrix}><FlaskConical size={12} /> Replay the real years</Btn>
                </div>
                {/* THE SIMULATION IS NOT BEHIND A BUTTON ANY MORE, and that is
                    the point of the change rather than a convenience: it is no
                    longer a panel with its own answer, it is the working behind
                    the CHANCE stat at the top of this screen. A "Run it" button
                    over a number the rest of the page has already printed would
                    say the two are separate things. The historical replay below
                    keeps its button — that one really is a second question. */}
                {chance ? (
                  <>
                    <div style={{ display: "flex", gap: 16, marginTop: 12, flexWrap: "wrap" }}>
                      <Stat k="CHANCE OF PROFIT" v={chanceText(chance.pop)} c={chance.pop >= 0.5 ? T.green : T.red} tip={chanceSourceNote(chance, ticker)} />
                      <Stat k="AVERAGE RESULT" v={signedMoney(chance.ev)} c={chance.ev >= 0 ? T.green : T.red} tip="The mean of every simulated run, a combination at a time — not the best case weighted by the chance." />
                      <Stat k="BAD CASE" v={fmt$(chance.p5)} c={T.red} tip="Only 1 run in 20 turns out worse than this." />
                      <Stat k="TYPICAL" v={fmt$(chance.p50)} />
                      <Stat k="GOOD CASE" v={fmt$(chance.p95)} c={T.green} tip="Only 1 run in 20 turns out better than this." />
                      <Stat k="YEARLY DRIFT" v={pctText(chance.driftAnnual)} c={T.blue} tip="This market's own seasonal reading over the window the trade is held for. It is what makes this the app's probability rather than the market's." />
                    </div>
                    <div style={{ marginTop: 10, padding: "9px 11px", background: `${T.blue}0d`, border: `1px solid ${T.blue}33`, borderRadius: 7, fontSize: 12.5, color: T.body }}>
                      <b style={{ color: T.ink }}>In plain words:</b> out of {chance.runs.toLocaleString("en-US")} simulated runs, {chancePct(chance.pop)} in 100 finish in profit.
                      In the worst 5% you lose about {fmt$(Math.abs(chance.p5))}{guard ? (Math.abs(chance.p5) <= guard.limits.perTrade ? ` — inside your per-trade limit of ${money(guard.limits.perTrade)} ✓` : ` — CAREFUL: past your per-trade limit of ${money(guard.limits.perTrade)}`) : ""}.
                      The typical result is {fmt$(chance.p50)}. {chanceSourceNote(chance, ticker)}
                      {chance.ivNote ? ` ${chance.ivNote}` : ""}
                    </div>
                    <div style={{ height: 180, marginTop: 12 }}>
                      <ResponsiveContainer>
                        <BarChart data={chance.bins} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                          <XAxis dataKey="x" stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} />
                          <YAxis stroke={T.dim} tick={{ fontSize: 9, fontFamily: "monospace" }} width={40} />
                          <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, fontFamily: "monospace", fontSize: 11 }} />
                          <Bar dataKey="n">
                            {chance.bins.map((b, i) => <Cell key={i} fill={b.x >= 0 ? `${T.green}cc` : `${T.red}cc`} />)}
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
                      {/* WHAT THE PANEL ABOVE ACTUALLY RAN ON — AND THE N IN
                          THIS SENTENCE USED TO BE THE WRONG QUANTITY. It read
                          `seas.sigma`, the REALISED volatility of the monthly
                          series, which is what the exit simulator walks the
                          SHARE on; nothing on this panel uses it. The chance,
                          its distribution and its average result are all priced
                          at the chain's IMPLIED volatility. So the fix is not to
                          say where that N came from — it is to name the number
                          that produced the figures above, with its source, and
                          stop printing one that produced nothing here. */}
                      Simulated at {pctText(chance.sigma)} implied volatility from the {chance.ivSource}, drifted on {ticker}&apos;s {chance.seasonalMeasured ? "measured" : "hand-written"} seasonality — both named in full above. A simplified model: no price jumps, no volatility term structure.
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

            {/* THE CONTROLS COME FIRST (P10 §2). One block, above every
                result, and the guided door renders what it does not already
                ask: "dipende dalla journey". */}
            <RequestControls
              journey="desk" style={{ marginTop: 12 }}
              request={request} onChange={(patch) => setWant((w) => ({ ...w, ...patch }))}
              sentiments={SENTIMENTS} sentiment={sentiment} onSentiment={setSentiment}
              ticker={ticker} spot={spot}
              expiries={expiryMenu} expKey={expKey} onExpiry={setExpKey} />

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
                {radarRows.shown.map((r, i) => {
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
                          {/* UNKNOWN IS NOT +0.0%/mo, AND "ESTIMATE" IS NOT
                              THE ONLY ALTERNATIVE TO MEASURED. Five of the ten
                              markets have no written row behind them at all. */}
                          seasonal {r.seasonalScore == null ? "not loaded" : `${r.seasonalScore > 0 ? "+" : ""}${r.seasonalScore.toFixed(1)}%/mo`} {r.real ? `(${r.years}y history)` : r.seasonalScore == null ? "(no reading yet)" : "(hand-written estimate)"} · {r.spot ? `$${r.spot.toFixed(2)}` : "prices not loaded"}{ta[r.tk] ? ` · trend ${ta[r.tk].trend > 0 ? "↑" : ta[r.tk].trend < 0 ? "↓" : "→"} RSI ${ta[r.tk].rsi.toFixed(0)}` : ""}
                        </div>
                        {/* WHAT THE SEARCH FOUND HERE — and this row only
                            exists BECAUSE it found something. The two empty
                            cases, "nothing cleared" and "not searched yet",
                            used to be printed here once per market and are now
                            the one line under the list (`radarQuietNote()`).
                            An empty market still never appears as a blank row;
                            it appears as a name in that line. */}
                        <div style={{ ...mono, fontSize: 10.5, color: T.green, marginTop: 2 }}>
                          {`${f.n} structure${f.n === 1 ? "" : "s"} cleared the floors on ` +
                            `${(f.expiries || []).length ? (f.expiries || []).join(" and ") : "the expiry searched"}` +
                            `${f.roads ? ` · ${f.roads} of them a road from your answers` : ""}`}
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
                {/* ============ AND EVERYTHING WITH NOTHING ON IT, IN ONE LINE.
                    `radarSplit()` / `radarQuietNote()` in rules.js. This
                    REPLACES the per-market sentence that used to sit inside
                    every quiet row — "not searched yet — use the search below"
                    ten times over — with one line carrying the same two facts
                    and the same ten taps. Nothing is unreachable: each name is
                    the button that opens that market. ============ */}
                {radarQuiet && (
                  <div style={{ padding: "9px 12px", background: T.bg, border: `1px dashed ${T.line}`, borderRadius: 7 }}>
                    <div style={{ ...mono, fontSize: 10.5, color: T.dim, lineHeight: 1.6 }}>{radarQuiet}</div>
                    <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" }}>
                      {radarRows.quiet.map((r) => (
                        <Btn key={r.tk} small ghost
                          onClick={() => { switchTicker(r.tk); setSentiment(r.sugg); goStep("shortlist"); }}>
                          {r.tk} →
                        </Btn>
                      ))}
                    </div>
                  </div>
                )}
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
                  {/* THE CONTROL CANNOT ASK FOR A BOARD THE GATE WOULD REFUSE
                      (P9, TASK 1). `min` was 21 — `RULES.exitDTE` wearing a
                      horizon's clothes — and every hit at that setting was
                      blocked by `ENTRY_DTE_ROOM` when it reached Build. Both
                      ends read their rule, and the label says why in one
                      clause rather than leaving the reader to find out at the
                      send button. */}
                  <span style={{ ...mono, fontSize: 10, color: T.dim }}>HORIZON: ~{multi.dteT} DTE</span>
                  <input type="range" min={RULES.minEntryDTE} max={RULES.maxEntryDTE} step={1} value={multi.dteT} onChange={(e) => setMulti((m) => ({ ...m, dteT: +e.target.value, res: null }))} style={{ width: 160, accentColor: T.amber }} />
                  <span style={{ ...mono, fontSize: 9.5, color: T.dim }}>{horizonFloorNote()} — change it, then search again</span>
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
                    {/* >>> WHY THINGS ARE NOT ON THIS LIST, IN ONE FOLD
                        (P9, TASK 3). <<< There were NINE paragraphs here, one
                        per reason, and `qualityFloorSentence()` — a hundred
                        and sixty-two words — was printed twice on the same
                        panel. Every one of those paragraphs is worth reading
                        ONCE, by somebody who has asked; none is worth reading
                        every time the screen renders.

                        FOLD, NEVER DELETE: `filterFold()` puts the counts and
                        the setting on one always-visible line, and every long
                        note is inside the fold, unchanged and unrewritten. The
                        only thing removed is the SECOND copy of the floor
                        paragraph, which is the rule this task is. */}
                    {multi.res.length === 0 && !multi.floors?.n && !multi.floors?.unpriceable
                      && !multi.floors?.impossible && !multi.floors?.model && (
                      <div style={{ ...mono, fontSize: 11.5, color: T.mut, lineHeight: 1.6 }}>
                        {multi.floors?.noBoard?.length
                          ? `No expiry on ${multi.floors.noBoard.join(", ")} is far enough out to open on, so nothing was built there.`
                          : "Nothing fits your budget on the markets you picked."}
                      </div>
                    )}
                    {(() => {
                      const what = (multi.floors?.markets || []).join(", ") || null;
                      const f = multi.floors || {};
                      const fold = filterFold(f, { level: f.level || liqLevel, what });
                      if (!fold.total) return null;
                      /* THE LONG NOTES ARE WRITTEN INSIDE THE FOLD, not built
                         above it and passed in: a reader tapping "why" gets
                         each rule in its own words, unchanged, and a reader
                         who does not gets one line. */
                      return (
                        <Fold summary={fold.summary} label="why" tone={multi.res.length === 0 ? T.mut : T.amber}>
                          {f.unpriceable > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 6 }}>{unpriceableNote(f.unpriceable, what)}</div>}
                          {f.impossible > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.red, lineHeight: 1.6, marginTop: 6 }}>{impossibleLossNote(f.impossible, what)}</div>}
                          {f.model > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.red, lineHeight: 1.6, marginTop: 6 }}>{modelDisagreementNote(f.model, what)}</div>}
                          {f.spread > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 6 }}>{wideSpreadNote(f.spread, what)}</div>}
                          {f.comboSpread > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 6 }}>{wideComboNote(f.comboSpread, what)}</div>}
                          <div style={{ ...mono, fontSize: 10.5, color: T.dim, lineHeight: 1.6, marginTop: 8 }}>{qualityFloorSentence(f.level || liqLevel)}</div>
                        </Fold>
                      );
                    })()}
                    {/* WHAT COULD NOT BE SCORED. An unbounded profit has no
                        expected value, so it sits last — said in words, because
                        a candidate at the bottom of a list with a dash where its
                        score should be looks broken rather than honest. */}
                    {(multi.res || []).some((r) => r.a?.profitUnbounded) && (
                      <Fold label="why last" tone={T.dim}
                        summary={noCeilingRankLine((multi.res || []).filter((r) => r.a?.profitUnbounded).length)}>
                        <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6, marginTop: 6 }}>
                          {noCeilingRankNote((multi.res || []).filter((r) => r.a?.profitUnbounded).length)}
                        </div>
                      </Fold>
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
                        omission the filter exists to stop. A LOOSENED setting
                        still shouts — `looseningWarning()` is not folded,
                        because it is the app warning rather than explaining. */}
                    <div style={{ ...mono, fontSize: 10, color: isLoosened(multi.floors?.level || liqLevel) ? T.red : T.dim, lineHeight: 1.6 }}>
                      {liquiditySettingNote(multi.floors?.level || liqLevel, {
                        kept: multi.res.length, liquidity: multi.floors?.liquidity, reward: multi.floors?.reward,
                        unpriceable: multi.floors?.unpriceable,
                      })}
                      {(multi.floors?.level || liqLevel).id !== liqLevel.id
                        ? ` The setting has changed since this ran \u2014 search again to see it at ${liqLevel.label.toUpperCase()}.` : ""}
                    </div>
                    {/* ONE CALL, NOT TWO. `{x() && <div>{x()}</div>}` renders
                        the sentence once and GENERATES it twice, which is the
                        shape `voice.test.js` reads as two sites on one screen
                        — and it is worth not writing anyway (P9, TASK 3). */}
                    {(() => {
                      const loose = looseningWarning(multi.floors?.level || liqLevel);
                      return loose ? (
                        <div style={{ ...sansUI, fontSize: 12, color: T.red, lineHeight: 1.5 }}>{loose}</div>
                      ) : null;
                    })()}
                    {multi.res.some((r) => r.conflict) && (
                      <div style={{ ...mono, fontSize: 10, color: T.red }}>
                        Candidates marked CONFLICT sit at the bottom by construction: the four factors contradict each other on that underlying, and no expected value is worth a signal we cannot read.
                      </div>
                    )}
                    {/* THE LIST SPLITS HERE TOO (P10 §3). The wide search used
                        to DROP a hit the budget would not buy, in silence. It
                        groups now: the floors are still what removes. */}
                    {(() => {
                      const built = multi.res.map((r, i) => ({
                        r, i,
                        cand: candidateOf({ name: r.name, legs: r.legs, a: r.a, pop: r.pop, dte: r.dte, expKey: r.expKey,
                          ...seasonalStampFields(r.mc), ...chanceDrawFields(r.mc) },
                        { ticker: r.tk, spot: r.spot, source: "wide search" }),
                        // THE FOUR FIGURES ARE READ AT THE PRICE THAT FILLS,
                        // worked out where this hit was generated — this row
                        // has no quote function of its own at render time.
                        bands: payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot }),
                        size: scaleStrategy(r.aFill || r.a, request.mode, request.amt),
                      }));
                      const byKey = new Map(built.map((x) => [x.cand.key, x]));
                      return (
                        <SplitSections
                          items={built.map((x) => x.cand)} request={request} priceNote
                          sizeOf={(c) => (byKey.get(c.key) || {}).size || null}
                          renderItem={(c, misses) => {
                            const x = byKey.get(c.key);
                            if (!x) return null;
                            const { r, i, bands } = x;
                            const af = r.aFill || r.a;
                            return (
                              <CandidateCard key={`${r.tk}-${r.name}-${i}`}
                                name={`${r.tk} \u00b7 ${r.name}`} legs={`${legsLine(r.legs)} \u00b7 ${r.expKey}`}
                                misses={misses}
                                rr={rewardRisk(af.maxProfit, af.maxLoss)} pop={r.pop}
                                profit={af.maxProfit} risk={af.maxLoss} noCeiling={af.profitUnbounded}
                                bands={bands} bars={barsCache[r.tk] || []} ticker={r.tk}
                                badge={r.fused ? (
                                  <span title={r.fused.narrative}
                                    style={{ ...mono, fontSize: 8.5, color: r.conflict ? T.red : r.fused.agreement === "CONFLUENT" ? T.green : T.blue, border: `1px solid ${(r.conflict ? T.red : r.fused.agreement === "CONFLUENT" ? T.green : T.blue)}55`, borderRadius: 4, padding: "1px 6px", cursor: "help" }}>
                                    {r.fused.agreement} {r.fused.score > 0 ? "+" : ""}{r.fused.score}
                                  </span>) : null}
                                actions={
                                  <Btn small ghost={ticker !== r.tk} onClick={() => { switchTicker(r.tk); setSentiment(r.sent); setExpKey(r.expKey); goStep("shortlist"); }}>
                                    Look at {r.tk} →
                                  </Btn>
                                } />
                            );
                          }} />
                      );
                    })()}
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
            {/* The tick, keep and take-to-Build controls are on every row and
                say what they do; `CompareTray` says what a second tick gets
                you, and only while one is ticked (P9, TASK 3). */}
            <div style={{ ...sansUI, fontSize: 14, color: T.mut, lineHeight: 1.55, marginTop: 4 }}>
              Everything below already clears the quality floors.
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
                  candidates={candidates} answers={wizAnswers} narrative={[]}
                  barsFor={(tk) => barsCache[tk] || []}
                  weatherData={weather} newsItems={newsPool} month={NOW_MONTH}
                  /* THE LIVE READING, so the road card, the Radar row and the
                     Build screen cannot print three signal scores for one
                     market on one day. */
                  fusedFor={(tk) => fused[tk] || null}
                  /* THE SAME SPLIT AS EVERY OTHER GENERATION SITE (P10 §3).
                     A road is built to FIT the budget at one combination
                     (`unit > ans.risk` in `runWizard`), so it normally sits
                     above the line; the slider is what can move it. */
                  request={request}
                  sizeOf={(c) => (c && c.a ? scaleStrategy(c.a, request.mode, request.amt) : null)}
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

            {/* THE CONTROLS COME FIRST HERE TOO (P10 §2). This panel WAS the
                block, spread out, with a 100px number field buried in it. Same
                component as the Radar's, same state, one spelling of each of
                the five. Nothing cut: the implied target is TARGET PRICE, and
                the two expiry sentences sit below, where they have a referent. */}
            <RequestControls
              journey="desk" style={{ marginTop: 12 }}
              request={request} onChange={(patch) => setWant((w) => ({ ...w, ...patch }))}
              sentiments={SENTIMENTS} sentiment={sentiment} onSentiment={setSentiment}
              ticker={ticker} spot={spot}
              expiries={expiryMenu} expKey={expKey} onExpiry={setExpKey} />
            {chain && (
              <div style={{ marginTop: 6 }}>
                {chain.expirations.length <= 4 && (
                  <div style={{ ...mono, fontSize: 9.5, color: T.dim, lineHeight: 1.55 }}>
                    These are every expiry {feedName(chain) || "the feed"} lists for {ticker} — this ETF only has monthly ones, it is not a limit of the app.
                  </div>
                )}
                {/* WHY THIS EXPIRY, AND WHAT WAS PASSED OVER. */}
                <div style={{ ...mono, fontSize: 9.5, color: T.mut, marginTop: 4, lineHeight: 1.55 }}>
                  {expiryChoiceNote(expChoice, liqLevel, { selected: expKey })}
                </div>
                {monoNote && (
                  <div style={{ ...mono, fontSize: 9.5, color: T.red, marginTop: 4, lineHeight: 1.55 }}>
                    {monoNote}
                  </div>
                )}
              </div>
            )}

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
              {/* >>> ONE FOLD FOR EVERY REASON A STRUCTURE IS NOT ON THIS
                  LIST (P9, TASK 3). <<< There were NINE separate paragraphs
                  here — liquidity, per-leg spread, combination spread, reward,
                  unpriceable, impossible, model disagreement, no ceiling and
                  the three "was skipped" cases — about six hundred and fifty
                  words explaining a list of at most eight rows, with
                  `qualityFloorSentence()`'s hundred and sixty-two words
                  printed TWICE on the same screen.

                  FOLD, NEVER DELETE. `filterFold()` puts the counts and the
                  setting on one line that is always visible; every long note
                  is inside, unchanged and in its own words. The reader who
                  wants the rule taps once; the reader who wants the list reads
                  a list. The count is IN the summary, so nobody has to open it
                  to find out whether it is worth opening. */}
              {(() => {
                const t = shortlist.tally || {};
                const what = `${ticker}${expKey ? ` ${expKey}` : ""}`;
                const fold = filterFold(t, { level: liqLevel, what });
                const skipped = shortlist.oiSkipped || t.spreadSkipped > 0 || t.comboSpreadSkipped > 0;
                if (!fold.total && !skipped) return null;
                const summary = fold.summary
                  || `Nothing was removed on ${what}. ${qualityFloorLine(liqLevel)}`;
                return (
                  <Fold summary={summary} label="why" tone={T.amber}
                    style={{ marginTop: 8, padding: "8px 10px", background: `${T.amber}0f`, border: `1px solid ${T.amber}44`, borderRadius: 6 }}>
                    {shortlist.cut.length > 0 && (
                      <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 4 }}>
                        {shortlist.cut.map((c) => <div key={c.name}>· {c.name} — {c.reasons[0]}</div>)}
                      </div>
                    )}
                    {t.unpriceable > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.red, lineHeight: 1.6, marginTop: 6 }}>{unpriceableNote(t.unpriceable, ticker)}</div>}
                    {t.impossible > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.red, lineHeight: 1.6, marginTop: 6 }}>{impossibleLossNote(t.impossible, ticker)}</div>}
                    {t.model > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.red, lineHeight: 1.6, marginTop: 6 }}>{modelDisagreementNote(t.model, ticker)}</div>}
                    {t.spread > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 6 }}>{wideSpreadNote(t.spread, what)}</div>}
                    {/* AND THE PAIR, WHICH IS NOT THE LEGS. Its own count and
                        its own sentence: UNG's 10.50/11.00 call spread passed
                        the per-leg test on both legs and its combination was
                        143% of its own mid wide. */}
                    {t.comboSpread > 0 && <div style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6, marginTop: 6 }}>{wideComboNote(t.comboSpread, what)}</div>}
                    {/* MISSING DATA IS NOT ILLIQUIDITY, and a floor that was
                        never applied must not be reported as one that was. */}
                    {shortlist.oiSkipped && <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6, marginTop: 6 }}>{liquiditySkippedNote(feedName(chain))}</div>}
                    {t.spreadSkipped > 0 && <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6, marginTop: 6 }}>{spreadSkippedNote(feedName(chain))}</div>}
                    {t.comboSpreadSkipped > 0 && <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6, marginTop: 6 }}>{comboSpreadSkippedNote(feedName(chain))}</div>}
                    {/* >>> THE FLOOR PARAGRAPH'S ONE HOME ON THIS SCREEN. <<<
                        It was printed here AND in the budget footnote below,
                        and again on the Radar twice. This is the home; every
                        other site prints `qualityFloorLine()`. */}
                    <div style={{ ...mono, fontSize: 10.5, color: T.dim, lineHeight: 1.6, marginTop: 8 }}>{qualityFloorSentence(liqLevel)}</div>
                  </Fold>
                );
              })()}
              {/* WHAT HAS NO CEILING. Kept, shown, and named — never scored. */}
              {shortlist.rows.some(({ a }) => a.profitUnbounded) && (
                <Fold label="why last" tone={T.dim} style={{ marginTop: 8 }}
                  summary={noCeilingRankLine(shortlist.rows.filter(({ a }) => a.profitUnbounded).length)}>
                  <div style={{ ...mono, fontSize: 10, color: T.dim, lineHeight: 1.6, marginTop: 6 }}>
                    {noCeilingRankNote(shortlist.rows.filter(({ a }) => a.profitUnbounded).length)}
                  </div>
                </Fold>
              )}
              {/* AN EMPTY LIST NAMES THE EXPIRY IT EMPTIED, and a board that
                  has not loaded is not a board that emptied. Three different
                  answers, three different sentences — the line `wizard.test`
                  holds on the refusal screen. NONE of these is folded: an
                  empty screen with no sentence is the fault they exist for. */}
              {shortlist.rows.length === 0 && shortlist.board === null && (
                <div style={{ ...mono, fontSize: 11, color: T.amber, marginTop: 8, lineHeight: 1.6 }}>
                  {unloadedBoardNote(ticker, expKey)}
                </div>
              )}
              {/* >>> AND A BOARD THE GATE WOULD NOT OPEN ON IS A THIRD ANSWER
                  (P9, TASK 1). <<< Not "nothing cleared" — nothing was built,
                  because an order on this board is refused at the send. The
                  headline is one line; the rule's own paragraph is behind the
                  tap, because it is an EXPLANATION and this is a REFUSAL. */}
              {shortlist.offFloor && (
                <Fold label="the rule" tone={T.amber} style={{ marginTop: 8 }}
                  summary={`Nothing is offered on ${expKey || "this board"}: it is ${shortlist.offFloor.dte} days out, and the app does not propose a trade its own checks would block. Pick a further expiry above.`}>
                  <div style={{ ...mono, fontSize: 10.5, color: T.mut, lineHeight: 1.6, marginTop: 6 }}>
                    {shortlist.offFloor.band === "inside-exit"
                      ? entryInsideExitNote(shortlist.offFloor)
                      : entryRoomWarning(shortlist.offFloor)}
                  </div>
                </Fold>
              )}
              {shortlist.rows.length === 0 && shortlist.board !== null && !shortlist.offFloor && (
                <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 8, lineHeight: 1.6 }}>
                  {emptyExpiryNote(expKey, shortlist.tally, liqLevel)}
                </div>
              )}
              {/* ============ THE LIST SPLITS, AND MEMBERSHIP IS LIVE
                  (ROADMAP P10 §3). ============ Above: what meets what was
                  asked for. Below, never hidden and never folded: everything
                  else that cleared the floors, each row saying what it missed.
                  It GROUPS; the floors above are what REMOVES. Membership is
                  derived on every render and never stored on a candidate. */}
              {(() => {
                const built = shortlist.rows.map(({ p, a }) => {
                  // `rewardRisk()` and never a division here: a ratio taken
                  // against a max loss the app could not read printed
                  // "6748644041614687.00" on BOIL. Below the minimum it is "—".
                  const rr = rewardRisk(a.maxProfit, a.maxLoss);
                  // THE ONE CHANCE. The row and the Build panel below it are
                  // the same object for the same structure, seeded from it.
                  const mcRow = chanceFor(a, { ticker, legs: p.legs, spot, dte, expKey });
                  const pop = mcRow ? mcRow.pop : null;
                  // One shape for everything that can be compared or kept
                  // (src/path.js), so a road, a shortlist row and a
                  // multi-market hit are the same kind of thing here.
                  const bands = payoffBands({ legs: p.legs, entryNet: a.entry, spot });
                  const cand = candidateOf({ name: p.name, legs: p.legs, a, pop, dte, expKey,
                    ...seasonalStampFields(mcRow), ...chanceDrawFields(mcRow) },
                  // NO `sigma` FROM THE REALISED TABLE HERE ANY MORE. The two
                  // numbers a compare picture is drawn at are the two the
                  // chance was computed at, and they come off `mcRow` above.
                  { ticker, spot, source: "shortlist" });
                  /* >>> EVERY FIGURE ON THE CARD IS READ AT THE PRICE THAT
                     FILLS (P10 §3-bis). <<< `a` stays the MID reading — a
                     candidate is a structure and not yet a price, and the
                     compare picture and the stamp are drawn from it. `aFill`
                     is the same `analyze()` at `openLimitPrice()`, which is
                     the number the ticket seeds to, so the card and the order
                     agree by construction rather than by luck. */
                  const aFill = atFillPrice(p.legs, a, { spot, dte, iv, q });
                  return { p, a, aFill, cand, bands, mcRow, pop,
                    rr: rewardRisk(aFill.maxProfit, aFill.maxLoss),
                    size: scaleStrategy(aFill, request.mode, request.amt) };
                });
                const byKey = new Map(built.map((x) => [x.cand.key, x]));
                return (
                  <SplitSections
                    items={built.map((x) => x.cand)} request={request} priceNote
                    sizeOf={(c) => (byKey.get(c.key) || {}).size || null}
                    renderItem={(c, misses) => {
                      const x = byKey.get(c.key);
                      if (!x) return null;
                      const { p, a, aFill, cand, bands, mcRow, pop, rr } = x;
                      return (
                        <CandidateCard key={p.name}
                          name={p.name} legs={legsLine(p.legs)} misses={misses}
                          rr={rr} pop={pop} profit={aFill.maxProfit} risk={aFill.maxLoss}
                          noCeiling={aFill.profitUnbounded}
                          bands={bands} bars={barsCache[ticker] || []} ticker={ticker}
                          actions={
                            <CandidateActions
                              ticked={inCompare(compare, cand)} onTick={() => tickCompare(cand)}
                              saved={isSaved(cand)} onSave={() => saveCandidate(cand)}
                              onBuild={() => applyPreset(p, a)} />
                          } />
                      );
                    }} />
                );
              })()}
              {/* WHICH SETTING PRODUCED THIS LIST. On the same screen as the
                  list, in every state of it, including the empty one. */}
              <div style={{ ...mono, fontSize: 10, color: isLoosened(liqLevel) ? T.red : T.dim, marginTop: 10, lineHeight: 1.6 }}>
                {liquiditySettingNote(liqLevel, shortlist.tally)}
              </div>
              {/* >>> THE SECOND COPY OF THE FLOOR PARAGRAPH, AND IT IS GONE
                  (P9, TASK 3). <<< A hundred and sixty-two words, printed here
                  and again above the list on the same screen. The fold above
                  is its ONE home; this prints `qualityFloorLine()`, which
                  states which floors ran and at what setting and nothing else.
                  The reasoning did not move far: it is one tap up the page.
                  The three sentences about the budget and the chance are
                  folded with it — they explain a column heading, and a column
                  heading is not something to read every time. */}
              <Fold label="what these columns mean" tone={T.dim} style={{ marginTop: 8 }}
                summary={`${qualityFloorLine(liqLevel)} ${limits.answered ? "Your" : "The suggested"} per-trade limit: ${money(limits.perTradeLimit)} (${perTradeCapLabel()}).`}>
                <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 6, lineHeight: 1.6 }}>
                  Budget is the most you will pay, taken from live {feedName(chain) || "market"} prices. For trades
                  where you receive money up front, the limit becomes the capital tied up instead. Chance is the
                  probability of ending in profit at expiry.
                </div>
              </Fold>
            </Panel>

            {/* WHAT THE WIDE SEARCH FOUND ON THIS MARKET. The multi-market
                scan runs on step 1, where the question is which market; its
                hits for the market you carried in belong here, where the
                question is which structure. */}
            {(multi.res || []).filter((r) => r.tk === ticker).length > 0 && (
              <Panel style={{ marginTop: 10 }}>
                <Lbl>ALSO FOUND BY THE WIDE SEARCH ON {ticker}</Lbl>
                {/* TWO SECTIONS HERE TOO (P10 §3). */}
                {(() => {
                  const built = (multi.res || []).filter((r) => r.tk === ticker).map((r, i) => ({
                    r, i,
                    cand: candidateOf({ name: r.name, legs: r.legs, a: r.a, pop: r.pop, dte: r.dte, expKey: r.expKey,
                      ...seasonalStampFields(r.mc), ...chanceDrawFields(r.mc) },
                    { ticker: r.tk, spot: r.spot, source: "wide search" }),
                    bands: payoffBands({ legs: r.legs, entryNet: r.a.entry, spot: r.spot }),
                    size: scaleStrategy(r.aFill || r.a, request.mode, request.amt),
                  }));
                  const byKey = new Map(built.map((x) => [x.cand.key, x]));
                  return (
                    <SplitSections
                      items={built.map((x) => x.cand)} request={request} priceNote
                      sizeOf={(c) => (byKey.get(c.key) || {}).size || null}
                      renderItem={(c, misses) => {
                        const x = byKey.get(c.key);
                        if (!x) return null;
                        const { r, i, cand, bands } = x;
                        const af = r.aFill || r.a;
                        return (
                          <CandidateCard key={`${r.name}-${i}`}
                            name={r.name} legs={`${legsLine(r.legs)} \u00b7 ${r.expKey}`} misses={misses}
                            rr={rewardRisk(af.maxProfit, af.maxLoss)} pop={r.pop}
                            profit={af.maxProfit} risk={af.maxLoss} noCeiling={af.profitUnbounded}
                            bands={bands} bars={barsCache[r.tk] || []} ticker={r.tk}
                            actions={
                              <CandidateActions
                                ticked={inCompare(compare, cand)} onTick={() => tickCompare(cand)}
                                saved={isSaved(cand)} onSave={() => saveCandidate(cand)}
                                onBuild={() => openOnBuild({ ticker: r.tk, expKey: r.expKey, legs: r.legs, name: r.name })} />
                            } />
                        );
                      }} />
                  );
                })()}
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
                      <Stat k="CHANCE" v={chanceText(c.pop)} c={(c.pop || 0) >= 0.5 ? T.green : T.violet} tip={seasonalStampNote(c, c.ticker || "this market")} />
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

            {/* >>> A STRUCTURE THE FLOORS REMOVED IS NOT SOMETHING TO OFFER
                (P9, TASK 1). <<< This carried whatever was in the Build
                screen's legs, which after a refusal is the structure the list
                above has just said it will not offer — so the honest button
                and the honest sentence are the same one. Under an empty
                shortlist it asks for another expiry, another market, or
                nothing today. */}
            {(() => {
              const empty = shortlist.rows.length === 0;
              return (
                <StepForward
                  label={empty ? "Nothing here to take apart" : legs.length ? `Go to Build \u2014 ${stratName} \u2192` : "Pick one above to go to Build"}
                  disabled={empty || !legs.length}
                  disabledNote={empty
                    ? emptyShortlistCta({ expKey, ticker })
                    : `Step 3 is one structure taken apart. Use "Take to Build" on whichever of these you want to look at properly \u2014 nothing is sent until the checks at the bottom of that screen.`}
                  sub={`${stratName} is loaded on step 3. Nothing is sent until the checks at the bottom of that screen.`}
                  onClick={() => goStep("build")} />
              );
            })()}
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
            {/* `StepNav` already writes what each step carries under its own
                number (`stepCarry` in path.js), so this repeated it a second
                time four lines below it (P9, TASK 3). */}
            <div style={{ ...sansUI, fontSize: 14, color: T.mut, lineHeight: 1.55, marginTop: 4 }}>
              The chain, the greeks, the charts and the order.
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
            {/* "Nothing is sent until you do" is on the confirm step at the
                bottom of this screen, where the send is (P9, TASK 3). */}
            <div style={{ fontSize: 13.5, color: T.body, marginTop: 4, lineHeight: 1.55 }}>
              {picked.ticker} · {picked.name} — loaded below. Change anything you want, then open it at the bottom.
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
                  {/* >>> CHANGING THE BOARD RE-SNAPS THE STRIKES. <<< It did
                      not, and that is one of the two ways the app came to name
                      a contract nobody has issued: strikes are a property of
                      the EXPIRY, and a 27.5 carried over from a board that
                      lists half dollars onto one that does not is a leg the
                      chain will never quote. `snapStrike()` has always done
                      this for a preset; a hand-off and this dropdown skipped
                      it. What moved is said out loud (`strikeSnapNote`). */}
                  <select value={expKey || ""} onChange={(e) => { setExpKey(e.target.value); setBt(null); resnapTo(e.target.value); }}
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

              {/* ---- ONE WARNINGS PANEL, COLLAPSED (PRD §4l, TASK 1.7) ----
                  The against-the-signal block (PRD §7) and the gate's own
                  warnings, in one place, with the number in the summary line.
                  It does not close and does not block the trade: it asks for
                  the written reason, which is saved in the position's thesis.

                  It opens by itself while a reason is still required, because a
                  textarea that unlocks the ticket cannot be behind a tap. */}
              {(() => {
                const fusedHere = fused[ticker] || null;
                // THE NARRATIVE HAS ONE HOME — "Why this trade", just above.
                // Everything here carries the count and points at it.
                const gateWarnings = warningsToPrint(guard?.warnings || [], {
                  narrative: fusedHere?.narrative || null,
                  pointer: conflictSummaryLine(clash, fusedHere),
                });
                const count = (clash ? 1 : 0) + gateWarnings.length;
                if (!count) return null;
                const summary = clash
                  ? conflictSummaryLine(clash, fusedHere)
                  : `${gateWarnings.length} thing${gateWarnings.length === 1 ? "" : "s"} the risk gate wants you to have read before you send this.`;
                return (
                  <BuildWarnings summary={summary} count={count} forceOpen={!!clash && !reasonOk}>
                    {clash && (
                      <>
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
                      </>
                    )}
                    {gateWarnings.length > 0 && (
                      <div style={{ display: "grid", gap: 6, marginTop: clash ? 10 : 0 }}>
                        {gateWarnings.map((w) => (
                          <div key={w.code} style={{ ...mono, fontSize: 10.5, color: T.amber, lineHeight: 1.6 }}>⚠ {w.message}</div>
                        ))}
                      </div>
                    )}
                  </BuildWarnings>
                );
              })()}

              {/* THE ENTRY FLOOR IS NOT A CLIFF ANY MORE (src/rules.js,
                  `entryRoom`). Three bands, and only the middle one has a door:
                  at or inside the 21-day exit rule there is no trade to have,
                  above the 30-day floor there is nothing to say. The number 30
                  is UNCHANGED this session — what changed is that the board
                  `expiryChoice()` has been naming in `passedOver` can now
                  actually be taken, which is what makes that sentence honest. */}
              {room.known && room.band === "inside-exit" && (
                <div style={{ ...mono, fontSize: 11, color: T.red, marginTop: 12, lineHeight: 1.6, padding: "9px 11px", background: `${T.red}0f`, border: `1px solid ${T.red}66`, borderRadius: 7 }}>
                  ✗ {entryInsideExitNote(room)}
                </div>
              )}
              {room.known && room.band === "tight" && (
                <div style={{ marginTop: 12, padding: "9px 11px", background: `${T.amber}0f`, border: `1px solid ${T.amber}66`, borderRadius: 7 }}>
                  <div style={{ ...mono, fontSize: 9.5, color: T.amber, fontWeight: 800, letterSpacing: 0.4 }}>
                    {room.room} DAYS OF ROOM · THE APP AIMS FOR {room.target}
                  </div>
                  <div style={{ fontSize: 12.5, color: T.body, marginTop: 5, lineHeight: 1.55 }}>
                    {entryRoomWarning(room)}
                  </div>
                  <textarea
                    value={roomReason}
                    onChange={(e) => setRoomReason(e.target.value)}
                    placeholder="Why is this expiry worth taking with less room than the app aims for? The reason is stored with the position and appears in the Journal."
                    rows={2}
                    style={{ ...mono, width: "100%", boxSizing: "border-box", marginTop: 9, background: T.bg, color: T.ink, border: `1px solid ${entryOverrideOk(roomReason) ? T.green : T.amber}`, borderRadius: 6, padding: "8px 9px", fontSize: 12, resize: "vertical" }}
                  />
                  <div style={{ ...mono, fontSize: 10, color: entryOverrideOk(roomReason) ? T.green : T.dim, marginTop: 4, lineHeight: 1.5 }}>
                    {entryOverrideOk(roomReason)
                      ? "✓ Reason recorded. The trade is unlocked and the warning stays — an override is not a dismissal."
                      : `${Math.max(0, RULES.minOverrideReasonChars - roomReason.trim().length)} more characters and this unlocks. Until then the risk gate holds it, and it says so below.`}
                  </div>
                </div>
              )}

              {/* THE GATE VERDICT HAS MOVED ONTO THE TRADE CARD, BESIDE THE
                  BUTTON. It used to be printed here, above the chain and the
                  legs editor — hundreds of pixels from the control it governs —
                  and the gate's WARNINGS were printed here raw as well, while
                  the collapsed warnings panel above was already printing the
                  same list through `warningsToPrint()`. That is the CONFLICT
                  paragraph fault again, one panel further down the same screen.
                  One fact, one place: the refusals sit on the card, the
                  warnings in the warnings panel, and neither is anywhere else.
                  A refusal is never behind a tap (PRD §4n). */}

              {/* THE STRIKES FOLLOW THE BOARD, AND IT SAYS WHEN THEY MOVED. */}
              {snapNote && (
                <div style={{ ...mono, fontSize: 10.5, color: T.blue, marginTop: 10, lineHeight: 1.6, padding: "8px 10px", background: `${T.blue}0d`, border: `1px solid ${T.blue}55`, borderRadius: 6 }}>
                  {snapNote}
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
                      <StrikeSelect strikes={expStrikes} value={l.strike} step={U.step}
                        onChange={(v) => updLeg(i, "strike", v)} />
                      <QtyField value={l.qty} min={1} max={10} ariaLabel={`Leg ${i + 1} quantity`} onValue={(n) => updLeg(i, "qty", n)}
                        onValidity={(ok, note) => setLegQtyErr((m) => ({ ...m, [i]: ok ? null : note }))} style={{ width: 48 }} />
                      <span style={{ ...mono, fontSize: 11, color: lp.real ? T.green : T.mut, marginLeft: "auto" }}>
                        ${lp.px.toFixed(2)} {lp.real ? "●" : "◌"} <span style={{ color: T.dim }}>IV {(lp.iv * 100).toFixed(0)}%{lp.oi != null ? ` · OI ${lp.oi}` : ""}</span>
                      </span>
                      {/* `buildOcc()` SURVIVES HERE AND ONLY HERE ON THIS
                          SCREEN, because NAMING a contract is not asserting
                          that it trades: this opens a price-history panel, it
                          is not an order path, and the Journal needs the same
                          ability. It says when the chain did not list it, so
                          an empty chart is explained rather than mysterious. */}
                      {(() => { const qq = q(l); const listed = !!qq?.occ; const occ = qq?.occ || (expKey ? buildOcc(ticker, expKey, l.type, l.strike) : null); return occ ? (
                        <button title={listed ? "price history for this contract" : "the chain never listed this contract — no order can be sent for it"}
                          onClick={() => setOptLeg({ occ, label: `${ticker} ${l.strike}${l.type === "call" ? "C" : "P"} ${expKey}${listed ? "" : " \u00b7 not listed on this board"}`, quote: qq })}
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
              {/* ============ ONE PRICE, AND WHAT CROSSING COSTS (P10 §1).
                  ============ The owner's reading of the whole product: "is it
                  a good bet? yes — but how much do I pay for it?" Measured on
                  his own orders: J-0003 at the indicative combination ask has
                  not filled after several sessions, and his earlier limits at
                  the mid expired. So the app suggests ONE price, names what the
                  structure is worth, and says what the difference costs.

                  FIVE FIGURES, LABEL ABOVE VALUE, IN ONE ROW, all at the price
                  that will be sent. `AE` is `analyze()` at `effectiveLimit()`'s
                  net and it seeds at `openLimitPrice()`, so this row and the
                  ticket cannot disagree. The bid/mid/ask breakdown and the
                  reward-to-risk RANGE are one tap below, as the WHY. */}
              {AE && (() => {
                const cc = crossingCost({ book });
                const rng = rewardRiskRange({
                  book,
                  // THE CALLER'S OWN `analyze()`, at each of the three nets.
                  // This file owns it; `rules.js` does not, and a second
                  // implementation would be a second answer.
                  at: (net) => analyze(legs, spot, dte, iv, q, { net }),
                });
                return (
                  <div style={{ marginTop: 12, padding: "12px 14px", background: T.panel,
                    border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.blue}`, borderRadius: 8 }}>
                    <div style={{ ...sansUI, fontSize: 15, fontWeight: 700, color: T.ink }}>
                      {ticker} · {stratName}
                    </div>
                    <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 2 }}>{legsLine(legs)}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      {[[AE.entry >= 0 ? "YOU PAY" : "YOU RECEIVE", fmt$(Math.abs(AE.entry) * 100), T.ink],
                        ["MAX LOSS", fmt$(AE.maxLoss), T.red],
                        ["MAX PROFIT", ceil$(AE.maxProfit), T.green],
                        ["CHANCE", chanceText(chance ? chance.pop : null), T.violet],
                        ["BREAK-EVEN", AE.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—", T.blue],
                      ].map(([k, v, col]) => (
                        <div key={k} style={{ minWidth: 68 }}>
                          <div style={{ ...mono, fontSize: 9, letterSpacing: "0.08em", color: T.dim }}>{k}</div>
                          <div style={{ ...mono, fontSize: 15, fontWeight: 800, color: col }}>{v}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: T.blue, marginTop: 9, lineHeight: 1.5 }}>
                      {crossingCostNote(cc)}
                    </div>
                    {/* THE BREAKDOWN AND THE RANGE FOLD, AS THE WHY. */}
                    <Fold label="the price" tone={T.dim} style={{ marginTop: 8 }}
                      summary={`Where that price sits in the market, and the range behind it`}>
                      {cc.known ? (
                        <>
                          <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap" }}>
                            {[["BID", cc.bid], ["MID", cc.mid], ["ASK", cc.ask], ["SUGGESTED", cc.fill]].map(([k, v]) => (
                              <div key={k}>
                                <div style={{ ...mono, fontSize: 9, color: T.dim }}>{k}</div>
                                <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: T.ink }}>{fmt$(Math.abs(v) * 100)}</div>
                              </div>
                            ))}
                          </div>
                          {/* THE RANGE. A budget cannot move a reward-to-risk —
                              `analyze()` scales both ends by the same leg
                              quantities — and the PRICE can, because `maxLoss`
                              IS the debit. */}
                          {rng && (
                            <div style={{ display: "flex", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
                              {RR_POINTS.map((k) => (
                                <div key={k}>
                                  <div style={{ ...mono, fontSize: 9, color: T.dim }}>
                                    {k === "fill" ? "R/R SUGGESTED" : `R/R AT THE ${k.toUpperCase()}`}
                                  </div>
                                  <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: T.amber }}>
                                    {rng[k].rr == null ? "—" : rng[k].rr.toFixed(2)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* WHY A NEW POSITION STARTS NEGATIVE. */}
                          <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 10, lineHeight: 1.6 }}>
                            {openingMarkNote(cc)}
                          </div>
                        </>
                      ) : null}
                    </Fold>
                  </div>
                );
              })()}

              {/* ============ THE DECISION, IN FIVE LINES (PRD §4n) ============
                  Everything this screen printed here is still here; it opens
                  behind a tap, in a sheet over the step, because a decision is
                  what this part of the screen is for and eleven blocks of
                  correct arithmetic are not a decision. The refusals never
                  move: they are on the card, beside the button. */}
              <TradeCard
                ticker={ticker} name={stratName}
                card={buildCard}
                refusals={buildRefusals}
                warnings={(guard?.warnings || []).length}
                onNumbers={() => setDeskSheet("numbers")}
                onOrder={() => setDeskSheet("order")}
                orderLabel={alpaca ? "Price it and send →" : "Open it on the app's own book →"}>
                {guard && guard.pass && (
                  <div style={{ ...mono, fontSize: 10.5, color: T.green, marginTop: 10, lineHeight: 1.6 }}>
                    ✓ Inside {limitOwner(guard.limits)} rules: risking {money(guard.limits.tradeRisk)} of {money(guard.limits.perTrade)} allowed · total {money(guard.limits.totalAfter)} of {money(guard.limits.total)}
                  </div>
                )}
              </TradeCard>

              {/* ---- SHEET 1: ALL THE NUMBERS. Not one figure, tooltip or
                  sentence below is changed; the block simply opens over the
                  step instead of standing between the trade and the decision.
                  The comment that follows is the one PR #28 wrote here. ---- */}
              <DeskSheet open={deskSheet === "numbers"} eyebrow="THE NUMBERS"
                title={`${ticker} · ${stratName}`}
                sub={`Every figure at the price that will be sent \u00b7 ${CARD_CURRENCY}`}
                onClose={() => setDeskSheet(null)}>
              {/* >>> EVERY FIGURE HERE IS WORKED OUT AT THE PRICE THAT WILL BE
                  SENT, NOT AT THE MID. <<< Read on the owner's phone, UNG
                  2026-09-20: this block said YOU PAY $14 · MOST YOU CAN MAKE
                  $36 · MOST YOU CAN LOSE -$14 · BREAKEVEN 10.64, all worked out
                  from the mid, while the ticket below said in these words that
                  a limit at the mid is a limit nobody has to meet. At $24 — the
                  price that trades — the same structure pays $26, risks $24 and
                  breaks even at 10.74. He decided on 2.6:1 and could only have
                  1.1:1. `AE` is `analyze()` at `effectiveLimit()`'s net; the
                  MID is still on screen, beside it, as what it is worth. */}
              <div style={{ display: "flex", gap: 16, marginTop: 14, flexWrap: "wrap" }}>
                <Stat k={AE.entry >= 0 ? "YOU PAY" : "YOU RECEIVE"} v={fmt$(Math.abs(AE.entry) * 100)}
                  tip={`What this trade costs at the price the order will be sent at. The MID — what the structure is worth, half way between the two sides of its market — is ${fmt$(Math.abs(AE.entryMid) * 100)}. A limit at the mid is a limit nobody has to meet, so the figures beside this one are worked out at the price that trades.`} />
                <Stat k="WORTH (MID)" v={fmt$(Math.abs(AE.entryMid) * 100)} c={T.mut}
                  tip="Half way between the two sides of the market. It is the honest answer to what this structure is WORTH, and it is not the price anybody has to trade with you at." />
                {/* THE TOOLTIP USED TO SAY "It cannot make more than this" UNDER
                    A NUMBER THAT WAS THE EDGE OF A GRID. For a long call it can
                    make more than that, and there is no number at which it
                    cannot: the figure and the claim under it are both gone. */}
                <Stat k="MOST YOU CAN MAKE" v={ceil$(AE.maxProfit)} c={T.green}
                  tip={AE.profitUnbounded ? noCeilingNote(stratName || "This structure")
                    : "The best this trade can do at expiry, at the price it will be opened at. It cannot make more than this."} />
                <Stat k="MOST YOU CAN LOSE" v={fmt$(AE.maxLoss)} c={T.red} tip="The worst this trade can do, at the price it will be opened at. It is fixed the moment you open it — never a dollar more." />
                <Stat k="BREAKEVEN" v={AE.breakevens.map((b) => b.toFixed(2)).join(" · ") || "—"} c={T.blue} />
                <Stat k="MADE PER $1 RISKED" v={(() => { const r = rewardRisk(AE.maxProfit, AE.maxLoss); return r == null ? "—" : `${r.toFixed(2)}`; })()}
                  c={T.violet}
                  tip={AE.profitUnbounded ? noCeilingNote(stratName || "This structure")
                    : "The best case divided by the worst, at the price that will be sent. At the mid it would read better than this and you cannot trade at the mid."} />
                <Stat k={takeProfitLabel()} v={AE.profitUnbounded ? "—" : fmt$(AE.maxProfit * RULES.takeProfitPct)} c={T.green}
                  tip={AE.profitUnbounded
                    ? `${RULE_PILLS.takeProfit()} ${noCeilingNote(stratName || "This structure")}`
                    : RULE_PILLS.takeProfit()} />
                <Stat k={stopLossLabel()} v={fmt$(AE.maxLoss * RULES.stopLossPct)} c={T.red} tip={RULE_PILLS.stopLoss()} />
              </div>
              {/* ONE SENTENCE SAYING WHICH PRICE THE BLOCK ABOVE IS AT, because
                  the Shortlist row for the same structure is at the MID and a
                  reader moving between the two screens is owed the reason they
                  differ. `entrySource` comes off `analyze()` itself, so a label
                  cannot assert a price the arithmetic did not use. */}
              {AE.entrySource === "limit" && Math.abs(AE.entry - AE.entryMid) > 0.0049 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 8, lineHeight: 1.6 }}>
                  {`These figures are worked out at ${fmt$(Math.abs(AE.entry) * 100)} — the price the ticket below ` +
                   `will send, and what would really be ${AE.entry >= 0 ? "paid" : "received"} for it. The mid is ` +
                   `${fmt$(Math.abs(AE.entryMid) * 100)}, which is what the Shortlist row for this structure shows: ` +
                   `a candidate is a structure, and this is a price. Move a leg's price in the ticket and every ` +
                   `number above moves with it.`}
                </div>
              )}
              {/* EVERY FIGURE ABOVE IS ONE COMBINATION. The ticket below can
                  send seven, and until this session the gate was measuring one
                  of them: a per-contract number read as the trade's is the same
                  fault as an assumed size printed as a measured one. The number
                  here is the ticket's own — there is one size on this screen. */}
              {contracts > 1 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 9, lineHeight: 1.6, padding: "7px 9px", background: `${T.amber}0f`, border: `1px solid ${T.amber}55`, borderRadius: 6 }}>
                  {`Those are the figures for ONE combination. The ticket is set to ×${contracts}, so this trade pays ` +
                   `${AE.entry >= 0 ? "" : "you "}${fmt$(Math.abs(AE.entry) * 100 * contracts)}${AE.entry >= 0 ? " to open" : " to open"}, ` +
                   `risks ${fmt$(Math.abs(AE.maxLoss) * contracts)} and can make ` +
                   `${AE.profitUnbounded ? NO_CEILING : fmt$(AE.maxProfit * contracts)}. The risk gate and the confirm step below both read the ×${contracts}.`}
                </div>
              )}
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
              {/* THE PRICE THE CHAIN COULD NOT READ, WHERE THE NUMBERS ARE.
                  The refusal itself is on the card, on the first screen; this
                  is the sentence that stops the figures above being read as a
                  cheap trade rather than an unread one. */}
              {!buildPriceable.priceable && (
                <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 12, lineHeight: 1.6, padding: "8px 10px", background: `${T.red}0f`, border: `1px solid ${T.red}55`, borderRadius: 6 }}>
                  ⚠ THE PRICE OF THIS STRUCTURE CANNOT BE READ. {buildPriceable.reasons[0]} The figures above are
                  what the feed gives, not what this would cost: the risk gate refuses the order.
                </div>
              )}
              </DeskSheet>

              <div style={{ marginTop: 14 }}>
                <Lbl>PRICE HISTORY × WHERE IT COULD GO × WHERE YOU MAKE MONEY</Lbl>
                <div style={{ marginTop: 8 }}>
                  <UnifiedView
                    ticker={ticker} dte={dte} spot={spot}
                    sigma={A.legPx.length ? A.legPx.reduce((x, y) => x + y.iv, 0) / A.legPx.length : iv}
                    driftM={seasNow}
                    curve={A.curve} legs={legs} breakevens={A.breakevens}
                    onTa={(t2) => setTa((m) => ({ ...m, [ticker]: t2 }))}
                  />
                </div>
              </div>

              {(() => {
                const t2 = ta[ticker];
                // NO SEASONAL READING, NO AGREEMENT PANEL. `confluence()`
                // compares the season with the trend; with one of the two
                // unknown there is nothing to agree or disagree about, and a
                // zero would make "the season is flat" out of "nobody looked".
                const cf = seasNow == null ? null : confluence(seasNow, t2);
                if (!cf) return null;
                return (
                  <div style={{ marginTop: 10, padding: "10px 12px", background: `${cf.c}0d`, border: `1px solid ${cf.c}55`, borderRadius: 8 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ ...mono, fontSize: 12, fontWeight: 800, color: cf.c }}>AGREEMENT: {cf.verdict}</span>
                      <span style={{ ...mono, fontSize: 10.5, color: T.mut }}>seasonality {seasNow >= 0 ? "+" : ""}{seasNow.toFixed(1)}%/mo · trend {t2.trendTxt} · RSI14 {t2.rsi.toFixed(0)}{t2.cross ? ` · ${t2.cross === "golden" ? "✚ recent golden cross" : "✖ recent death cross"}` : ""}</span>
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

              {/* ---- SHEET 2: PRICE IT AND SEND. The ticket PR #28 designed
                  with the owner, and the confirm step, in one sheet over the
                  step — because they are one act. Nothing in either is changed.
                  The confirm step USED TO SIT BELOW THIS PANEL, at the very
                  bottom of the longest screen in the app; it is beside the
                  ticket now, which is where the decision is made. ---- */}
              <DeskSheet open={deskSheet === "order"} eyebrow="THE ORDER"
                title={`${ticker} · ${stratName}`}
                sub={alpaca ? `Alpaca paper account \u00b7 nothing is sent until you confirm` : `The app's own paper book \u00b7 no broker involved`}
                onClose={() => setDeskSheet(null)}>
              {alpaca && !reasonOk && (
                <div style={{ ...mono, fontSize: 11, color: T.amber, marginTop: 10, padding: "9px 11px", border: `1px solid ${T.amber}66`, borderRadius: 7 }}>
                  The order ticket unlocks as soon as you write why you are going against {clash.n} of {clash.total} factors. The trade is not forbidden — the written reason is required.
                </div>
              )}
              {alpaca && reasonOk && (
                <OrderTicket
                  onSent={(o) => openPaper(o)}
                  legs={legs} expKey={expKey} ticker={ticker}
                  quoteFn={q} estNet={AE.entry}
                  setMsg={setMsg}
                  /* THE FIGURES THE TICKET PRINTS ARE THE ONES THE SCREEN ABOVE
                     PRINTS, at the price about to be sent (`AE`). They used to
                     be `A`'s — the mid — which is how the ticket came to say a
                     limit at the mid does not fill under a maximum loss worked
                     out at exactly that mid. */
                  gate={gate} dte={dte} maxLoss={AE.maxLoss} maxProfit={AE.maxProfit}
                  /* THE SIZE IS THE SCREEN'S, NOT THE TICKET'S. It used to be
                     `cfg.qty` inside the ticket, which is why the gate above and
                     the position written below both ran at a hardcoded 1. */
                  qty={contracts} onQty={setContracts}
                  qtyNote={contractsSourceNote({ contracts, typed: contractsTyped != null, request, fits: !!(budgetSize && budgetSize.ok) })}
                  /* AND NEITHER IS THE PRICE, for the same reason and one
                     session later. Type, time in force and one price per leg
                     are Build-screen state; the verdict and the effective price
                     are worked out once, above, and handed down. */
                  cfg={ticket} onCfg={(patch) => setTicket((t) => ({ ...t, ...patch }))}
                  quotes={bookQuotes} legPrices={legPrices || []} net={ticketNet.net}
                  verdict={ticketVerdict} effective={effective}
                  seed={seedPx} onReseed={() => setTicket((t) => ({ ...t, legPx: null }))}
                  feed={feedName(chain)}
                  /* AND THE MODEL VERDICT IS COMPUTED ONCE, not per render of
                     the ticket, and from `analyze()`'s own marks — the same
                     expression the Shortlist judges this structure with. */
                  model={modelCheck}
                  /* AND THE LIMIT THE SEND IS MEASURED AGAINST, from the one
                     gate call above — the same `guard.limits` the trade card
                     prints. The card is behind this sheet while the sliders are
                     being moved, so the check has to be readable here too. */
                  limits={guard ? guard.limits : null}
                  spot={spot} entryOverride={roomReason}
                  qtyBlock={legQtyMsg}
                />
              )}
              {!alpaca && <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 8 }}>Connect Alpaca in Positions → Integrations to unlock the full order ticket: limit or market, time in force, quantity and cancellations.</div>}

            {/* THE CONFIRM STEP, BESIDE THE TICKET IT CONFIRMS.
                It used to be a wizard screen of its own that "Take this road"
                jumped to, which let the guided flow reach an order without ever
                passing the chain, the legs or the greeks. Then it was the last
                thing on the longest screen in the app, a full scroll below the
                ticket. It reads the LIVE Build state, so a strike changed
                outside this sheet changes the checks inside it: what is
                confirmed is what is on screen. */}
            <div style={{ marginTop: 12 }}>
              {legQtyMsg && (
                <div style={{ ...mono, fontSize: 11, color: T.amber, marginBottom: 8, padding: "9px 11px", border: `1px solid ${T.amber}66`, borderRadius: 7 }}>
                  {`${legQtyMsg}. Nothing can be opened until it is filled in.`}
                </div>
              )}
              {!legQtyMsg && <ConfirmSteps
                /* AT THE PRICE THAT WILL BE SENT (`AE`), like every other
                   figure on this screen and like the record that is written
                   when the button is tapped. The confirm step used to describe
                   a trade at the mid over a ticket about to send a different
                   price. */
                candidate={{
                  ticker, name: stratName, legs, expKey, dte,
                  risk: Math.abs(AE.maxLoss), maxProfit: AE.maxProfit, entryNet: AE.entry, spot,
                }}
                preview={guard} result={openResult}
                contracts={contracts}
                // THE SAME VOLATILITY AND THE SAME DRIFT THE CHANCE ON THIS
                // SCREEN WAS COMPUTED AT, so the figure and the number can
                // never be two readings of one trade.
                sigma={chance?.sigma} driftAnnual={chance?.driftAnnual}
                heading={false} showFigure={false}
                /* THE WARNINGS ARE IN THE ONE PANEL ABOVE. Printing them here
                   as well is how the same 400-character CONFLICT paragraph
                   came to be on one screen four times. */
                showWarnings={false}
                busy={busy === "order"}
                onConfirm={() => openPaper()}
              />}
              {/* AND THE LIST SAYS WHOSE ACCOUNT IT CHECKED. This sheet holds
                  two taps — the ticket, which sends, and the confirm step,
                  which records on the app's own book — and the checks above
                  are the SEND'S, run against the same account the send uses.
                  They used to be run against `LOCAL_BOOK` whatever was
                  connected, so the paper row read "local simulation, no broker
                  involved" directly above a button that reaches Alpaca. */}
              <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 10, lineHeight: 1.6 }}>
                {checkedAgainstNote(!!alpaca, guard?.limits?.paper?.why)}
              </div>
            </div>
              </DeskSheet>
            </Panel>
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
            {/* WORKING ORDERS, FIRST ON THE SCREEN, BECAUSE THEY ARE NOT
                POSITIONS YET. An order that never fills used to be visible
                only on the full desk, so the one order this app has ever sent
                sat at "new" with a filled quantity of 0.00 and nothing in the
                main flow ever mentioned it again. It sits ABOVE the positions
                because "this has not happened yet" has to be read before
                "here is what you own", not after. */}
            {/* THE PANEL OPENS FOR A GAP TOO, NOT ONLY FOR THE APP'S OWN ROWS.
                With zero records and one order at the broker this said nothing
                at all, which is the silence PR #32 handed forward. */}
            {(workingOrders.length > 0 || orderGap.sentence) && (
              <Panel style={{ border: `1px solid ${T.amber}66`, marginBottom: 10 }}>
                <Lbl>WORKING AT THE BROKER ({workingOrders.length}) · SENT, NOT FILLED</Lbl>
                {workingOrders.length > 0 && (
                <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 6, lineHeight: 1.6 }}>
                  {workingOrders.length === 1 ? "This order has" : "These orders have"} left the app and
                  {workingOrders.length === 1 ? " has" : " have"} not bought anything. Nothing here is a position,
                  no exit plan has started, and the risk on {workingOrders.length === 1 ? "it" : "them"} is not
                  open risk. A limit at the middle of a wide market can wait all day; a DAY order that is still
                  here at the close is gone.
                </div>
                )}
                {orderGap.sentence && (
                  <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 8, lineHeight: 1.6 }}>
                    {orderGap.sentence}
                  </div>
                )}
                <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                  {workingOrders.map((p) => {
                    const sentAt = p.alpacaSentAt || p.id || null;
                    const mins = sentAt ? Math.max(0, Math.round((Date.now() - sentAt) / 60000)) : null;
                    const age = mins == null ? "age unknown"
                      : mins < 60 ? `${mins} minute${mins === 1 ? "" : "s"} old`
                      : mins < 1440 ? `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? "" : "s"} old`
                      : `${Math.round(mins / 1440)} day${Math.round(mins / 1440) === 1 ? "" : "s"} old`;
                    const tif = String(p.alpacaTif || "").toLowerCase();
                    const stands = tif === "gtc" ? "stands until you cancel it"
                      : tif === "day" ? "dies at the close of the session it was sent in"
                      : "time in force not recorded";
                    // A DAY order older than a session is almost certainly gone
                    // already, and saying so is the whole point of this panel.
                    const stale = tif === "day" && mins != null && mins > 8 * 60;
                    return (
                      <div key={p.id} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${stale ? T.red : T.amber}55`, borderRadius: 7 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", alignItems: "baseline" }}>
                          <div style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>
                            {p.ref ? `${p.ref} · ` : ""}{p.ticker} {p.name}
                          </div>
                          <div style={{ ...mono, fontSize: 10.5, color: stale ? T.red : T.amber, fontWeight: 700 }}>
                            {String(p.alpacaStatus || "working").toUpperCase().replace(/_/g, " ")} · {age}
                          </div>
                        </div>
                        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 5, lineHeight: 1.6 }}>
                          {/* HOW MANY COMBINATIONS ARE WAITING, IN THE BROKER'S
                              OWN UNITS — `contracts x GCD(legs)`, which is the
                              number in Alpaca's reply and on the timeline entry.
                              This row printed the structure count and read as a
                              contradiction beside a timeline saying "0 of 10". */}
                          {`${positionSize(p).brokerQty} combination${positionSize(p).brokerQty === 1 ? "" : "s"}. `}
                          {/* WHICH WAY THE MONEY GOES, AND "?" IS NOT A FIELD.
                              This row printed `money(alpacaLimit * 100)` over a
                              magnitude, so a credit spread and a debit spread of
                              the same size read identically — and a missing order
                              type rendered as a literal question mark, which is
                              failure class 1: a field nobody recorded, drawn as
                              if it were a value. */}
                          {p.alpacaOrderType === "limit" && storedLimitOf(p).has
                            ? (storedLimitOf(p).signed
                              ? `A ${storedLimitOf(p).kind} limit of ${money(storedLimitOf(p).magnitude * 100)} a combination, which ${stands}.`
                              : `${storedLimitOf(p).note} It ${stands}.`)
                            : p.alpacaOrderType
                              ? `A ${p.alpacaOrderType} order, which ${stands}.`
                              : `An order whose type was not recorded, which ${stands}.`}
                          {" "}Order <span style={{ wordBreak: "break-all" }}>{p.alpacaId}</span>.
                        </div>
                        {stale && (
                          <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 5, lineHeight: 1.6 }}>
                            ⚠ This is a DAY order and it is {age}. It has almost certainly expired unfilled at the
                            close of its session without a word from anybody. Nothing was bought. Cancel it to tidy
                            the record, or re-price it and send it again.
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap", alignItems: "center" }}>
                          <Btn small ghost disabled={orderBusy === p.id || DEMO} onClick={() => repriceWorking(p)}
                            title={DEMO ? DEMO_TOOLTIP : undefined}>Re-price it →</Btn>
                          <Btn small color={T.red} disabled={orderBusy === p.id || DEMO} onClick={() => cancelWorking(p)}
                            title={DEMO ? DEMO_TOOLTIP : undefined}>{orderBusy === p.id ? "Working…" : "Cancel it"}</Btn>
                          <Btn small ghost disabled={DEMO} onClick={() => recheckOrders()}>Ask Alpaca again</Btn>
                          <span style={{ ...mono, fontSize: 10, color: T.dim }}>
                            Re-pricing cancels this one and puts the trade back on Build at today's market.
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
            <Panel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>YOUR POSITIONS ({ownedPositions.length}) · VALUED LIVE</Lbl>
                <label style={{ ...mono, fontSize: 10.5, color: autoMon ? T.green : T.dim, display: "flex", gap: 5, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={autoMon} onChange={(e) => setAutoMon(e.target.checked)} /> refresh every 60s
                </label>
              </div>
              {ownedPositions.length === 0 && (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8, lineHeight: 1.6 }}>
                  {/* A POSITION IS SOMETHING THE BROKER FILLED. An order that was
                      sent and is still waiting, or that came back cancelled, is
                      not a position however much the app wanted it to be — and
                      this list said otherwise for three trades at once. */}
                  Nothing is open. {workingOrders.length > 0 || notTakenOrders.length > 0
                    ? `You have ${workingOrders.length > 0 ? `${workingOrders.length} order${workingOrders.length === 1 ? "" : "s"} still working at the broker` : ""}${workingOrders.length > 0 && notTakenOrders.length > 0 ? " and " : ""}${notTakenOrders.length > 0 ? `${notTakenOrders.length} that ended with nothing bought — ${notTakenOrders.length === 1 ? "it is" : "they are"} under Watching` : ""}. A position appears here only when Alpaca has actually filled the order.`
                    : `Build a trade, then confirm it at the bottom of the Build screen.`}
                </div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {ownedPositions.map((p) => {
                  const c = chains[p.ticker];
                  const s = c?.spot;
                  const dteLeft = Math.max(0, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
                  const qp = makeQuote(c, p.expKey);
                  // EVERY FIGURE ON THIS ROW IS THE WHOLE POSITION'S. `entryNet`,
                  // `maxProfit` and `maxLoss` are stored per combination, so the
                  // size is what turns them into what this trade is actually
                  // doing — and until this session nothing knew what the size was.
                  const size = positionSize(p);
                  const n = size.contracts;
                  /* >>> THE SAME P&L THE HOME PAGE READ (P9, TASK 0b). <<< This
                     row used to re-derive its own from `netValue()` and print
                     -$127 directly above the broker's own -$130. `posAlerts`
                     has already asked `pnlOf()`, so the row reads the answer
                     rather than computing a second one. */
                  const al0 = posAlerts.find((a) => a.p.id === p.id) || null;
                  const pnl = al0 ? al0.pnl : null;
                  const tpHit = !!al0 && al0.tpHit, slHit = !!al0 && al0.slHit;
                  const dteExit = dteLeft <= RULES.exitDTE;
                  const edge = al0 ? al0.edge : null;
                  const rec = tpHit ? { t: `→ TAKE THE PROFIT: ${takeProfitLabel()}`, c: T.green } : slHit ? { t: `→ WARNING: ${stopLossLabel()}`, c: T.red } : dteExit ? { t: `→ CLOSE OR ROLL: ${RULES.exitDTE} days left`, c: T.amber } : edge && edge.thin ? { t: "→ LOOK AT THIS ONE", c: T.amber } : { t: "→ HOLD", c: T.mut };
                  return (
                    <div key={p.id} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                        <div style={{ fontWeight: 700, color: T.ink, fontSize: 13.5 }}>
                          {/* THE REF, ON SCREEN, FROM THE MOMENT IT IS OPENED. It is
                              how this trade is referred to for the rest of its life and
                              after it: the Journal entry keeps it when the position is
                              gone, and every timeline entry is numbered from it. */}
                          {p.ref && <span style={{ ...mono, fontSize: 10.5, color: T.dim, marginRight: 7 }}>{p.ref}</span>}
                          {p.ticker} · {p.name}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <Btn small ghost color={T.blue} onClick={() => openOnBuild({ ticker: p.ticker, expKey: p.expKey || null, legs: p.legs, name: p.name + " (monitor)" })}>Monitor ↗</Btn>
                          <Btn small ghost color={T.red} onClick={() => setClosing({ id: p.id, written: "", err: null })}><Trash2 size={11} /> Close</Btn>
                        </div>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                        {p.legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ")} · expires {p.expKey || new Date(p.expiry).toLocaleDateString("en-GB")} · opened {new Date(p.openedAt).toLocaleDateString("en-GB")}
                      </div>
                      {/* HOW BIG IT IS — AND WHETHER THAT IS KNOWN.
                          An assumed 1 must never print as a measured 1: nothing
                          wrote this field before this build, so a position saved
                          earlier has no size and every figure on the row is read
                          as one combination. `positionSizeNote()` says which. */}
                      <div style={{ ...mono, fontSize: 10.5, color: size.assumed && size.perCombo === 1 ? T.amber : T.mut, marginTop: 3, lineHeight: 1.5 }}>
                        {size.assumed && size.perCombo === 1 ? "⚠ " : "× "}{positionSizeNote(p)}
                      </div>
                      {/* THE ORDER BEHIND THIS ONE HAS NOT FILLED. This list is
                          `ownedPositions` now, so the case should be impossible
                          — but a record whose two broker fields contradict each
                          other is exactly the kind of thing that put three
                          phantom positions on this screen, and a guard that
                          self-suppresses costs nothing. `positionStageNote()`
                          returns null for anything genuinely owned, so the
                          words have one home and cannot drift from Watching's. */}
                      {positionStageNote(p) && (
                        <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 5, lineHeight: 1.6 }}>
                          ⚠ {positionStageNote(p)}
                        </div>
                      )}
                      {/* WHAT YOU ASKED FOR AGAINST WHAT YOU GOT — the comparison
                          ROADMAP P0 has owed since PR #28 and could not make,
                          because nothing had ever filled. It prints only on a
                          position that really did fill, and a record with no
                          limit of its own SAYS so rather than quoting the fill
                          back as though it had been the target (journal.js). */}
                      {(p.alpacaFillPrice != null || (isBrokerHolding(p) && p.entrySource === "fill")) && (
                        <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 5, lineHeight: 1.6 }}>
                          {fillVsLimit({ limit: p.alpacaLimit,
                            fill: p.alpacaFillPrice != null ? p.alpacaFillPrice : p.entryNet,
                            contracts: size.contracts, limitSigned: p.alpacaLimitSigned === true }).sentence}
                        </div>
                      )}
                      {/* CLOSING ASKS WHY, AND THE ANSWER IS KEPT.
                          A rule close names its rule and needs nothing typed. A close
                          with no rule behind it needs the same written reason as an
                          against-the-signal override — including a close taken on the
                          stop WARNING, which is a decision and is recorded as one. */}
                      {closing && closing.id === p.id && (() => {
                        const al = posAlerts.find((a) => a.p.id === p.id) || null;
                        const d = closeDecision({ alert: al, written: closing.written });
                        return (
                          <div style={{ marginTop: 8, padding: "10px 12px", background: T.bg, border: `1px solid ${T.red}55`, borderRadius: 7 }}>
                            <Lbl>CLOSE {p.ref || p.ticker} — WHY?</Lbl>
                            {d.ruleExit ? (
                              <div style={{ ...mono, fontSize: 11, color: T.green, marginTop: 6, lineHeight: 1.5 }}>{d.text}</div>
                            ) : (
                              <div style={{ ...mono, fontSize: 11, color: T.mut, marginTop: 6, lineHeight: 1.5 }}>
                                No rule ended this trade, so this is a close you are choosing. Write why: it is stored
                                with the trade and it is what the Journal can teach you something from later.
                              </div>
                            )}
                            {d.stopWarning && (
                              <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 6, lineHeight: 1.5 }}>
                                {`⚠ ${stopWarningSentence(al?.pnl ?? null)}`}
                              </div>
                            )}
                            <textarea
                              value={closing.written} rows={2}
                              onChange={(e) => setClosing((c) => ({ ...c, written: e.target.value, err: null }))}
                              placeholder={d.ruleExit ? "Anything you want on the record (optional)" : `Why are you closing this? At least ${CLOSE_REASON_MIN} characters.`}
                              style={{ width: "100%", marginTop: 8, padding: "7px 9px", background: T.panel, color: T.ink,
                                border: `1px solid ${T.line}`, borderRadius: 6, ...mono, fontSize: 11.5, boxSizing: "border-box", resize: "vertical" }} />
                            {!d.ruleExit && !d.reason.ok && (
                              <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 4 }}>{d.reason.message}</div>
                            )}
                            {closing.err && <div style={{ ...mono, fontSize: 10.5, color: T.red, marginTop: 4 }}>{closing.err}</div>}
                            <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                              <Btn small color={T.red} disabled={!d.reason.ok}
                                onClick={async () => {
                                  const r = await closePos(p.id, { written: closing.written });
                                  if (r.ok) setClosing(null);
                                  else setClosing((c) => ({ ...c, err: r.decision.reason.message }));
                                }}>Close and file it</Btn>
                              <Btn small ghost onClick={() => setClosing(null)}>Keep it open</Btn>
                            </div>
                          </div>
                        );
                      })()}
                      {/* >>> THE ENTRY QUESTION, ASKED AGAIN (P9, TASK 2). <<<
                          A warning, never an exit rule: the exit rules were
                          chosen at construction and are frozen, and nothing
                          here closes anything. It renders where the figures
                          are, because a refusal behind a tap is not a refusal. */}
                      {edge && edge.thin && (
                        <div style={{ ...mono, fontSize: 10.5, color: T.amber, marginTop: 7, lineHeight: 1.6, padding: "8px 10px", background: `${T.amber}0f`, border: `1px solid ${T.amber}44`, borderRadius: 6 }}>
                          ⚠ {edge.sentence}
                        </div>
                      )}
                      {/* AND WHOSE NUMBER THE PROFIT IS. Null when the broker
                          answered — a figure read off the account needs no
                          apology, and printing one on every row would be the
                          §4m fault in the other direction. */}
                      {al0?.pnlNote && (
                        <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 5, lineHeight: 1.55 }}>
                          {al0.pnlNote}
                        </div>
                      )}
                      {/* PRD §6: the gauge is the primary visual on position detail.
                          It is drawn from payoff() like every other zone in the app. */}
                      <GaugeFigure legs={p.legs} entryNet={p.entryNet} spot={s ?? p.entrySpot}
                        ticker={p.ticker} size={230} style={{ marginTop: 10 }} />
                      <div style={{ display: "flex", gap: 14, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <Stat k="ENTRY" v={fmt$(Math.abs(p.entryNet) * 100 * n)} tip={n > 1 ? `${n} × ${fmt$(Math.abs(p.entryNet) * 100)} a combination` : undefined} />
                        <Stat k="PROFIT NOW" v={pnl != null ? fmt$(pnl) : "loading…"} c={pnl >= 0 ? T.green : T.red}
                          tip={al0?.pnlNote || undefined} />
                        {/* A PERCENTAGE OF ALMOST NOTHING IS NOT A SHARE OF
                            ANYTHING. -$127 against a $4 maximum printed
                            "-3188%" — a true division and a false sentence.
                            `shareOfMaximum()` applies the rule `rewardRisk()`
                            already applies: nothing divides by a figure under
                            MIN_NET_DOLLARS, and below it this says what it
                            means in words. */}
                        {(() => { const sh = shareOfMaximum(pnl, p.maxProfit == null ? null : p.maxProfit * n);
                          return <Stat k="OF THE MAXIMUM" v={sh.text} tip={sh.note || undefined} />; })()}
                        <Stat k="DTE" v={dteLeft} c={dteExit ? T.amber : T.ink} />
                        <span style={{ ...mono, fontSize: 11.5, fontWeight: 700, color: rec.c }}>{rec.t}</span>
                      </div>
                      {(() => {
                        const ivNow = (() => {
                          if (!c || !p.expKey || !c.byExp[p.expKey]) return p.thesis?.iv ?? getU(p.ticker).iv;
                          const ivs = p.legs.map((l) => qp(l)?.iv).filter(Boolean);
                          return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : (p.thesis?.iv ?? getU(p.ticker).iv);
                        })();
                        const seasNow = seasonalNowOf(seasonal, p.ticker);
                        // THE ONE CHANCE, ON A POSITION THAT IS ALREADY OPEN.
                        // The Guardian's TIS compares this with `thesis.pop`,
                        // recorded at entry — and until now the two came from
                        // two different arithmetics, so the score measured the
                        // gap between two formulas as much as the gap between
                        // two days.
                        const mcNow = s ? (() => {
                          const a2 = analyze(p.legs, s, Math.max(1, dteLeft), ivNow, qp);
                          return chanceFor(a2, { ticker: p.ticker, legs: p.legs, spot: s,
                            dte: Math.max(1, dteLeft), expKey: p.expKey || null, thesisIV: p.thesis?.iv ?? null });
                        })() : null;
                        const popNow = mcNow ? mcNow.pop : null;
                        return (
                          <GuardianPanel
                            pos={p} spot={s || p.entrySpot} dteLeft={dteLeft} ivNow={ivNow}
                            vol={sigmaFor(p.ticker)}
                            seasonalNow={seasNow} pnlNow={pnl} popNow={popNow} chanceNow={mcNow}
                            seasonalNote={chanceStamp(mcNow, p.ticker)}
                            thesisSeasonalNote={seasonalStampNote(p.thesis, p.ticker)}
                            vegaSign={Math.sign(p.thesis?.vega ?? 1) || 1}
                            alpaca={!!alpaca} quoteFn={qp}
                            setMsg={setMsg} logEvent={logEvent} gate={gate}
                          />
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </Panel>

            {alpaca && <AlpacaDesk setMsg={setMsg} gate={gate} positions={ownedPositions} />}

            {/* SAVED STRATEGIES USED TO SIT HERE, under the broker panel and
                above Integrations — a list of trades you have NOT taken, on the
                screen whose whole job is the trades you have. It is the first
                row of the Watching tab now. */}

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
        {/* ============ WATCHING ============ */}
        {tab === "watching" && !showSettings && (
          <div>
            <Panel style={{ marginTop: 10 }}>
              <Lbl>WATCHING ({watchRows.length}) · TRADES YOU DID NOT TAKE</Lbl>
              <div style={{ ...sansUI, fontSize: 13, color: T.body, lineHeight: 1.55, marginTop: 8 }}>
                Nothing here is a position and nothing here is money. These are structures you saved, and orders
                that were sent and came back with nothing bought — kept so you can see what they would have done.
                No exit plan runs on them, none of them counts towards your exposure, and none of the figures
                below is a profit or a loss.
              </div>
              {watchRows.length === 0 && (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 10, lineHeight: 1.6 }}>
                  Nothing is being watched. Save a structure from the Shortlist to follow it without taking it —
                  and an order that ends without filling arrives here by itself.
                </div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {watchRows.map((r) => {
                  const w = r.would;
                  const bands = r.spot ? payoffBands({ legs: r.legs, entryNet: r.entryNet, spot: r.spot }) : null;
                  return (
                    <div key={r.key} style={{ padding: "10px 12px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8 }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <span style={{ color: T.ink, fontWeight: 700, fontSize: 13.5 }}>
                          {r.ref ? `${r.ref} ` : ""}{r.ticker} · {r.name}
                        </span>
                        {/* WHICH OF THE TWO IT IS, on the row, because "I chose
                            not to" and "I tried and missed" are different facts
                            about the same picture. */}
                        <span style={{ ...mono, fontSize: 9, fontWeight: 800, letterSpacing: 0.4, padding: "2px 6px", borderRadius: 4,
                          background: r.kind === "saved" ? `${T.blue}22` : `${T.amber}22`, color: r.kind === "saved" ? T.blue : T.amber }}>
                          {r.kind === "saved" ? "SAVED, NEVER SENT" : `SENT · ${String(r.status || "finished").toUpperCase().replace(/_/g, " ")}`}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: T.dim, marginLeft: "auto" }}>{r.at ? ago(r.at) : ""}</span>
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                        {legsLine(r.legs)}{r.expKey ? ` · ${r.expKey}` : ""}
                      </div>

                      {bands && (
                        <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                          <BandThumbnail bands={bands} bars={barsCache[r.ticker] || []} width={200} height={40}
                            title={bandTakeaway(bands, { ticker: r.ticker })} />
                          <Gauge bands={bands} size={96} ticker={r.ticker} />
                        </div>
                      )}

                      {/* THE THEORETICAL FIGURE, AND IT MAY NEVER LOOK LIKE A REAL
                          ONE. Muted, never red or green, with the sentence beside
                          it — `wouldHaveDone()` returns the two together so one
                          cannot be rendered without the other. Printing -$80 in
                          the same red the Positions screen uses is exactly the
                          fault this whole tab exists to undo. */}
                      <div style={{ marginTop: 9, padding: "8px 10px", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 6 }}>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "baseline" }}>
                          <div>
                            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4 }}>WOULD HAVE OPENED AT</div>
                            <div style={{ ...mono, fontSize: 13, fontWeight: 800, color: T.mut }}>
                              {Number.isFinite(Number(r.entryNet)) ? fmt$(Math.abs(Number(r.entryNet)) * 100 * r.contracts) : "—"}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4 }}>WORTH TODAY</div>
                            <div style={{ ...mono, fontSize: 13, fontWeight: 800, color: T.mut }}>
                              {r.nowNet != null ? fmt$(Math.abs(r.nowNet) * 100 * r.contracts) : "—"}
                            </div>
                          </div>
                          <div>
                            <div style={{ ...mono, fontSize: 9, color: T.dim, letterSpacing: 0.4 }}>DIFFERENCE</div>
                            <div style={{ ...mono, fontSize: 13, fontWeight: 800, color: T.mut }}>
                              {w ? `${w.pnl >= 0 ? "+" : "−"}${fmt$(Math.abs(w.pnl))}` : "—"}
                            </div>
                          </div>
                        </div>
                        <div style={{ ...sansUI, fontSize: 12.5, color: T.body, marginTop: 6, lineHeight: 1.5 }}>
                          {w ? w.sentence
                            : `Today's price for this structure cannot be read, so there is nothing to compare the ` +
                              `opening price with. That is a missing number, not a flat result.`}
                        </div>
                        {/* AND WHICH PRICE IT STARTED FROM. A row begun at the mid
                            flatters itself for ever, and every row saved before
                            PR #28 was begun at the mid. */}
                        <div style={{ ...mono, fontSize: 9.5, color: T.dim, marginTop: 5, lineHeight: 1.6 }}>
                          {r.entrySource === "limit"
                            ? `Opened at the price that would really have been paid, not the mid.`
                            : `This one starts from the MID — the middle of the market, which is not a price anybody ` +
                              `has to give you. Read it as the friendliest version of what would have happened.`}
                        </div>
                      </div>

                      <div style={{ display: "flex", gap: 6, marginTop: 9, flexWrap: "wrap" }}>
                        <Btn small ghost onClick={() => openOnBuild({ ticker: r.ticker, expKey: r.expKey || null, legs: r.legs, name: r.name })}>
                          Open it on Build →
                        </Btn>
                        <button
                          onClick={() => (r.kind === "saved" ? delSaved(r.saved.id) : dropWatched(r.pos.id))}
                          style={{ ...mono, fontSize: 10.5, background: "transparent", border: `1px solid ${T.line}`, color: T.dim, borderRadius: 6, padding: "6px 10px", cursor: "pointer", minHeight: 36 }}>
                          <Trash2 size={12} style={{ verticalAlign: "-2px" }} /> Stop watching
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}

        {tab === "journal" && !showSettings && (
          <div style={{ marginTop: 12 }}>
            <Panel>
              <Lbl>THE RECORD · {(store.journal || []).length} CLOSED · {ownedPositions.length} OPEN</Lbl>
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

            {/* CLOSED TRADES — THE WHOLE RECORD, NOT FOUR FIELDS OF IT.
                Each entry opens on its full timeline (every entry, not the last
                six), the thesis it was opened on, the reason it ended and both
                Alpaca order ids in full — eight characters is right on a row and
                useless when you are looking a trade up on the broker.
                Sorted and searched by ref, which is what a ref is for. */}
            <Panel style={{ marginTop: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <Lbl>CLOSED TRADES</Lbl>
                {(store.journal || []).length > 0 && (
                  <input value={jq} onChange={(e) => setJq(e.target.value)}
                    placeholder="find by ref — J-0003, 3, or a ticker"
                    style={{ ...mono, fontSize: 11, padding: "5px 8px", background: T.bg, color: T.ink,
                      border: `1px solid ${T.line}`, borderRadius: 6, minWidth: 210 }} />
                )}
              </div>
              {!(store.journal || []).length && (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8 }}>Nothing closed yet. Every trade you close lands here with the reason it ended, its whole timeline and the orders behind it.</div>
              )}
              {(store.journal || []).length > 0 && !journalRows.length && (
                <div style={{ ...mono, fontSize: 12, color: T.mut, marginTop: 8 }}>
                  {`Nothing matches "${jq}". The refs run from ${(store.journal || []).map((e) => e.ref).filter(Boolean).sort()[0] || "—"} upwards.`}
                </div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {journalRows.map((e) => (
                  <details key={e.id} style={{ padding: "9px 11px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 7 }}>
                    <summary style={{ cursor: "pointer", listStyle: "none" }}>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        {e.ref && <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: T.blue }}>{e.ref}</span>}
                        <span style={{ fontWeight: 700, color: T.ink, fontSize: 13 }}>{e.ticker} · {e.name}</span>
                        <span style={{ ...mono, fontSize: 13, fontWeight: 700, color: e.pnl == null ? T.dim : e.pnl >= 0 ? T.green : T.red }}>{e.pnl == null ? "—" : fmt$(e.pnl)}</span>
                        <span style={{ ...mono, fontSize: 10, color: e.ruleExit ? T.green : T.amber, border: `1px solid ${(e.ruleExit ? T.green : T.amber)}55`, borderRadius: 4, padding: "1px 6px" }}>
                          {e.ruleExit ? "closed by the rules" : "closed by hand"}
                        </span>
                        <span style={{ ...mono, fontSize: 10, color: e.riskOk ? T.dim : T.red }}>
                          {e.riskOk ? "inside the per-trade limit" : "over the per-trade limit at the time"}
                        </span>
                        {/* MARKED, NEVER DELETED (P9, TASK 3). The Journal is
                            the record of what happened; a record removed to
                            make a score look better is the opposite of what
                            this screen is for. The LEVEL steps over it. */}
                        {isTestRecord(e) && (
                          <span style={{ ...mono, fontSize: 10, color: T.dim, border: `1px dashed ${T.dim}66`, borderRadius: 4, padding: "1px 6px" }}
                            title={testRecordNote()}>
                            read as a test
                          </span>
                        )}
                      </div>
                      <div style={{ ...mono, fontSize: 10.5, color: T.dim, marginTop: 3 }}>
                        opened {new Date(e.openedAt).toLocaleDateString("en-GB")} · closed {new Date(e.t).toLocaleDateString("en-GB")}
                        {(e.timeline || []).length ? ` · ${e.timeline.length} entr${e.timeline.length === 1 ? "y" : "ies"} — tap to open` : ""}
                      </div>
                    </summary>

                    <div style={{ ...mono, fontSize: 11, color: T.body, marginTop: 9, paddingTop: 8, borderTop: `1px solid ${T.line}`, lineHeight: 1.55 }}>
                      <span style={{ color: T.dim }}>WHY IT ENDED · </span>
                      {e.closeReason?.text || (e.ruleExit ? "closed by the rules" : "no reason was recorded")}
                      {e.closeReason?.kind === "rule" && e.closeReason.written
                        ? <span style={{ color: T.mut }}>{` — you also wrote: "${e.closeReason.written}"`}</span> : null}
                    </div>

                    {e.thesis && (
                      <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 7, lineHeight: 1.55 }}>
                        <span style={{ color: T.dim }}>THE REASON YOU OPENED IT · </span>
                        {`chance ${e.thesis.pop != null ? chanceText(e.thesis.pop) : "n/a"} · volatility ${e.thesis.iv != null ? (e.thesis.iv * 100).toFixed(0) + "%" : "n/a"} · season ${e.thesis.seasonal != null ? e.thesis.seasonal.toFixed(1) + "%/mo" : "n/a"}${e.thesis.regime ? ` · ${e.thesis.regime}` : ""}`}
                        {/* WHICH TABLE THAT CHANCE WAS DRIFTED ON. A closed
                            trade is re-read months later, when nothing else on
                            screen can still say which seasonal reading was in
                            force the day it was opened. An entry with no stamp
                            is one written before the app recorded one, and the
                            sentence says that rather than guessing. */}
                        {e.thesis.pop != null
                          ? <div style={{ color: T.dim, marginTop: 3 }}>{seasonalStampNote(e.thesis, e.ticker || "this market")}</div>
                          : null}
                        {e.thesis.againstSignal
                          ? <div style={{ color: T.amber, marginTop: 3 }}>{`Opened against ${e.thesis.againstSignal.n} of ${e.thesis.againstSignal.total} factors — "${e.thesis.againstSignal.reason}"`}</div>
                          : null}
                      </div>
                    )}

                    {/* THE ORDER IDS IN FULL. This is the record, not a screen:
                        the whole id is what you paste into the broker. */}
                    <div style={{ ...mono, fontSize: 10, color: T.dim, marginTop: 7, lineHeight: 1.6, wordBreak: "break-all" }}>
                      <div>{`OPENING ORDER · ${e.openOrderId || "none — this was the app's own paper book"}${e.openStatus ? ` (${e.openStatus})` : ""}`}</div>
                      <div>{`CLOSING ORDER · ${e.closeOrderId || "none — closed in the app, no broker order"}`}</div>
                    </div>

                    {/* THE WHOLE TIMELINE. The position screen shows the last six
                        because it is a live screen with a chart under it; the
                        record has no reason to stop at six. */}
                    {(e.timeline || []).length > 0 && (
                      <div style={{ marginTop: 9, paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
                        <div style={{ ...mono, fontSize: 9, color: T.dim }}>TIMELINE · {e.timeline.length} ENTRIES, ALL OF THEM</div>
                        {e.timeline.map((x, i) => {
                          // THE SAME SENTENCE THE LIVE SCREEN SHOWS, in the
                          // permanent record — a closed trade's autopilot
                          // entries are exactly the ones nobody will re-read
                          // against the fix. `autopilotHorizonNote()` is null
                          // on every entry that carries its own horizon.
                          // ...and which volatility it walked on, the same way.
                          const notes = [autopilotHorizonNote(x), autopilotVolNote(x)].filter(Boolean);
                          return (
                            <div key={x.seq || i} style={{ marginTop: 3 }}>
                              <div style={{ ...mono, fontSize: 10, color: T.mut, lineHeight: 1.5 }}>
                                <span style={{ color: T.blue }}>{x.seq || `${e.ref || ""}·??`}</span>
                                <span style={{ color: T.dim }}>{` ${new Date(x.t).toLocaleDateString("en-GB")} · `}</span>
                                {x.text}
                              </div>
                              {notes.map((n) => <div key={n} style={{ ...mono, fontSize: 9.5, color: T.amber, lineHeight: 1.5 }}>{`⚠ ${n}`}</div>)}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </Panel>

            {/* THE ANALYSES RUN IN THE COPILOT PANEL, HERE, IN THE JOURNAL.
                The Journal is the record of what the app did; a pre-trade
                analysis or an opportunity radar is part of that record, and
                leaving it only in a panel that is one tap from being closed
                made the Journal and the Copilot disagree about the same day. */}
            {/* WHAT THE ENTRY FLOOR HAS COST, COUNTED RATHER THAN ARGUED ABOUT.
                `minEntryDTE` is 30 and no session has ever measured it — it is
                an inherited default. The reading that would settle it is how
                often the floor takes a genuinely busier board away and by how
                much, and the only place that can be collected is here, as the
                app is used. ROADMAP P5 is what reads it back. It is local: it
                is calibration data about this user's markets, not a position. */}
            <Panel style={{ marginTop: 12 }}>
              <Lbl>THE {RULES.minEntryDTE}-DAY ENTRY FLOOR · {(store.expiryLog || []).length} BOARD{(store.expiryLog || []).length === 1 ? "" : "S"} PASSED OVER</Lbl>
              <div style={{ ...mono, fontSize: 10.5, color: T.mut, marginTop: 6, lineHeight: 1.6 }}>
                {passedOverSummary(store.expiryLog || [])}
              </div>
              {(store.expiryLog || []).length > 0 && (
                <div style={{ display: "grid", gap: 5, marginTop: 9 }}>
                  {(store.expiryLog || []).map((r, i) => (
                    <div key={r.t + "-" + i} style={{ ...mono, fontSize: 10.5, color: T.body, lineHeight: 1.6, padding: "6px 9px", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 6 }}>
                      <span style={{ color: T.amber, fontWeight: 700 }}>{r.ticker}</span>
                      {" "}built on {r.chosen.key} ({r.chosen.dte}d, {r.chosen.clears ?? "?"} of {r.chosen.near ?? "?"} clear)
                      {" "}· passed over {r.passedOver.key} ({r.passedOver.dte}d, {r.passedOver.clears ?? "?"} of {r.passedOver.near ?? "?"} clear
                      {r.busierFactor != null ? `, ${r.busierFactor.toFixed(1)}× busier` : ""})
                      {" "}· <span style={{ color: r.offerable ? T.green : T.red }}>
                        {r.offerable ? "could be taken with a written reason" : `at or inside the ${RULES.exitDTE}-day exit — not offerable`}
                      </span>
                      <span style={{ color: T.dim }}> · {ago(r.t)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

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
            {/* TWO PARAGRAPHS SAYING ONE THING (P9, TASK 3): what step 3 is
                for, and then that a trade gets here from step 2. The buttons
                below already say where to go. */}
            <div style={{ fontSize: 13.5, color: T.body, marginTop: 8, lineHeight: 1.55 }}>
              One trade, taken apart — its payoff, its odds, its risk checks. Nothing is on it yet: a trade
              gets here from step 2.
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
