// ============================================================================
// scripts/screens.jsx — THE SCREENS, DRAWN ON FIXTURES FOR A HEADLESS BROWSER (redesign PR 1, round 2, TASK 4).
//
// `scripts/shoot-screens.mjs` bundles this for the browser and photographs it at 390×844. It mounts the REAL
// components (FindHeader, FindStep, SavedList, MarketPage, BottomBar) on the fixtures findB.test.jsx already uses — the
// 31 fixture cards (scripts/find-fixtures.jsx) and the Alpaca-shaped UNG chain — with the app's own page shell for these
// screens (edge to edge, the list ending FIND_LIST_END above the bottom). Nothing here is a live price; nothing is sent.
// The screen is picked by the location hash: #find, #find-budget, #find-nothing, #saved, #strategies, #overview, #chain.
// ============================================================================
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { T } from "../src/theme.js";
import { sans } from "../src/ui.jsx";
import { FindHeader, FindStep } from "../src/find.jsx";
import { SavedList } from "../src/saved.jsx";
import { MarketPage } from "../src/market.jsx";
import { BottomBar, FIND_LIST_END } from "../src/navBar.jsx";
import { listCardFigures } from "../src/App.jsx";
import { normaliseAlpacaChain } from "../src/chain.js";
import { findCards } from "./find-fixtures.jsx";
import { findOrderCompare } from "../src/signals.js";
import { requestOf, RULES, findStatusText, seasonalProvenance } from "../src/rules.js";
import { wouldHaveDone } from "../src/journal.js";

const SENTS = [{ id: "verybear", label: "Very Bear", icon: "↓↓" }, { id: "bear", label: "Bear", icon: "↓" },
  { id: "neutral", label: "Neutral", icon: "→" }, { id: "bull", label: "Bull", icon: "↑" }, { id: "verybull", label: "Very Bull", icon: "↑↑" }];
const LIMITS = { answered: true, tradingCapital: 10000, concurrentTarget: 4, perTradeLimit: 500, cappedPerTrade: 500 };
const CARDS = findCards().map((x) => ({ ...x, flags: [], fused: null, family: null, feedBroken: false, noQuoteLegs: 0 }));
const SORTED = CARDS.slice().sort(findOrderCompare("ev"));
const UNG_SIGNAL = { dir: "bull", s: 38.6, why: "score +46 × confidence 84 / 100 = 38.6 ≥ 12.5" };
const GEN = { items: CARDS, tally: {}, noBoard: [], loading: [], failed: [], oiSkipped: [], spreadSkipped: [], comboSpreadSkipped: [],
  boards: { UNG: { expKey: CARDS.find((x) => x.tk === "UNG").expKey.replace(/^UNG-/, ""), dte: 40, signal: UNG_SIGNAL },
    SPY: { expKey: "2026-11-20", dte: 46, signal: { dir: "neutral", s: 4, why: "score +10 × 40 / 100 = 4.0, between ±12.5" } } },
  stale: [] };
const LEVEL = { id: "recommended", label: "Recommended", absolute: 10, percentile: 0.4 };
const LIQ = { id: "recommended", label: "Recommended", defaultId: "recommended" };
const RAW = JSON.parse(readFileSync("src/fixtures/alpaca-chain-UNG.json", "utf8"));
const NOW = Date.parse("2026-10-04T07:00:00Z");
const CHAIN = normaliseAlpacaChain("UNG", RAW, { spot: 13.24, now: Date.parse("2026-09-02T12:00:00Z") });
const FUSED = { ticker: "UNG", score: 46, confidence: 84, agreement: "MIXED", factors: ["seasonal", "technical", "weather", "news"],
  components: { seasonal: { dir: 1, strength: 30, why: "fixture" }, technical: { dir: 1, strength: 40, why: "fixture" },
    weather: { dir: 1, strength: 20, why: "fixture" }, news: { dir: 0, strength: 0, why: "fixture" } } };
const UNG = SORTED.filter((x) => x.tk === "UNG").map((x, i) => ({ ...x, expKey: x.expKey.replace(/^UNG-/, ""), fused: FUSED,
  family: i % 2 ? "neutral" : "signal" }));
const QUOTE = (c, ek) => (leg) => (c.byExp[ek] ? c.byExp[ek][leg.type === "call" ? "calls" : "puts"][leg.strike] || null : null);
/** Fixture bars: a deterministic walk to the chain's spot, so the thumbnails and the chart have a line. Not a price. */
const BARS = (() => {
  const out = []; let p = 12.2; const d0 = Date.UTC(2026, 3, 1);
  for (let i = 0; i < 130; i++) {
    p = Math.max(5, p * (1 + 0.012 * Math.sin(i / 5) + 0.006 * Math.cos(i / 2.3)));
    const t = new Date(d0 + i * 86400000 * 1.4).toISOString().slice(0, 10);
    out.push({ time: t, open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 1000 });
  }
  const k = 13.24 / out[out.length - 1].close;
  return out.map((b) => ({ ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k }));
})();
window.fetch = async (url) => {
  if (String(url).startsWith("/api/bars")) return new Response(JSON.stringify({ bars: BARS, source: "fixture" }), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 503 });
};

const screen = (location.hash || "#find").slice(1);
const Shell = ({ children, place = "find" }) => (
  <div style={{ minHeight: "100vh", background: T.bg, color: T.body, ...sans }}>
    <div style={{ maxWidth: 1720, margin: "0 auto", padding: `0 0 ${FIND_LIST_END}px` }}>{children}</div>
    <BottomBar current={place} badge={1} badgeLabel="1 of your 1 position needs a decision today." />
  </div>
);

function FindScreen({ sheet = null, want = {}, seg = "results" }) {
  const [find, setFind] = useState({ markets: ["SPY", "UNG"], dir: "signals", horizon: RULES.targetEntryDTE, cat: null, flagged: true,
    hideMisses: false, positiveOnly: false });
  const [w, setW] = useState(want);
  const [sh, setSh] = useState(sheet);
  return (
    <Shell>
      <FindHeader seg={seg} savedN={2} nMarkets={find.markets.length} onRefresh={() => {}} onSettings={() => {}} onSeg={() => {}}
        status={findStatusText("2 markets · prices 3m ago", "Alpaca")} stale={{ stale: false }} />
      {seg === "saved" ? <SavedList rows={SAVED_ROWS} savedNow={SAVED_NOW} barsCache={{ UNG: BARS }} ago={() => "2h ago"} />
        : <FindStep request={requestOf(w, LIMITS)} onRequest={(p) => setW((x) => ({ ...x, ...p }))} sentiments={SENTS} find={find} setFind={setFind}
          limits={LIMITS} onLimit={() => {}} freeSizing={false} findGen={GEN} findShown={SORTED} findOrder="ev" onFindOrder={() => {}}
          barsCache={{ UNG: BARS }} readiness={{}} liqLevel={LEVEL} liqState={LIQ} sheet={sh} onSheet={setSh}
          onReset={() => setW({})} compare={[]} showCompare={false} compareNote={null} onTickCompare={() => {}} onClearCompare={() => {}}
          onToggleCompare={() => {}} onTakeToBuild={() => {}} />}
    </Shell>
  );
}

const savedOf = (x, i) => ({ id: 100 + i, ticker: x.tk, name: x.name, legs: x.legs, expKey: x.expKey, entryNet: x.lf.aFill.entry,
  pop: x.lf.pop, futureAvg: x.lf.future ? x.lf.future.per100 : null, maxLoss: x.lf.aFill.maxLoss, savedAt: "2026-10-03T10:00:00Z" });
const SAVED = [SORTED[0], SORTED[3]].map(savedOf);
const SAVED_ROWS = SAVED.map((sv) => ({ key: `s-${sv.id}`, kind: "saved", saved: sv, ref: null, ticker: sv.ticker, name: sv.name, legs: sv.legs,
  expKey: sv.expKey, at: 1, status: null, entryNet: sv.entryNet, nowNet: sv.entryNet * 1.1, spot: sv.ticker === "UNG" ? 13.24 : 100,
  contracts: 1, entrySource: "limit", would: wouldHaveDone({ entryNet: sv.entryNet, nowNet: sv.entryNet * 1.1, contracts: 1 }) }));
const SAVED_NOW = Object.fromEntries(SAVED.map((sv) => [sv.id, { pop: sv.pop ? sv.pop + 0.03 : null, per100: sv.futureAvg, risk: Math.abs(sv.maxLoss) }]));

function Market({ tab: tab0 }) {
  const [tab, setTab] = useState(tab0);
  const [sheet, setSheet] = useState(null);
  return (
    <Shell>
      <MarketPage tk="UNG" tab={tab} onTab={setTab} onBack={() => {}} onTicker={() => {}} onRefresh={() => {}}
        chain={CHAIN} freshLine="1 market · prices 3m ago" clock={{ is_open: false }} clockLine="Market closed · opens Mon 15:30 your time"
        bars={BARS} ivRank={null} ivDays={7} board={{ ...GEN.boards.UNG, expKey: UNG[0].expKey }} fused={FUSED}
        items={UNG} allItems={SORTED} boards={GEN.boards} request={requestOf({}, LIMITS)} findDir="signals" sentiments={SENTS}
        findOrder="ev" newsItems={[{ title: "Natural gas storage build beats estimates as mild weather lingers", date: "2026-10-03T14:00:00Z", src: "Reuters", link: "https://example.com" }]}
        newsState={{ items: [] }} now={NOW} timeZone="Europe/Rome" ago={() => "17h ago"}
        cardFigures={listCardFigures} quoteOf={QUOTE} seasonal={seasonalProvenance(null, "fixture")} liqFloor={10} sheet={sheet} onSheet={setSheet}
        compareProps={{ compare: [], onTickCompare: () => {}, onClearCompare: () => {}, onToggleCompare: () => {}, onTakeToBuild: () => {} }}
        initialTray={screen === "chain" ? { expKey: UNG[0].expKey, legs: twoLegs(), note: null } : null} />
    </Shell>
  );
}
function twoLegs() {
  const ks = Object.keys(CHAIN.byExp[UNG[0].expKey].puts).map(Number).sort((a, b) => a - b).filter((k) => k <= 13.24);
  const hi = ks[ks.length - 1], lo = ks[ks.length - 3];
  return [{ type: "put", strike: hi, side: 1, qty: 1 }, { type: "put", strike: lo, side: -1, qty: 1 }];
}

const VIEWS = {
  find: () => <FindScreen />,
  "find-budget": () => <FindScreen sheet="find:budget" />,
  "find-nothing": () => <FindScreen want={{ amt: 10 }} />,
  saved: () => <FindScreen seg="saved" />,
  strategies: () => <Market tab="strategies" />,
  overview: () => <Market tab="overview" />,
  "overview-copilot": () => <Market tab="overview" />,
  chain: () => <Market tab="chain" />,
};
document.body.style.margin = "0";
document.body.style.background = T.bg;
createRoot(document.getElementById("root")).render((VIEWS[screen] || VIEWS.find)());
