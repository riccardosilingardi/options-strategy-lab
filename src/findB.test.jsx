// ============================================================================
// src/findB.test.jsx — FIND, VERSION B, AND THE MARKET PAGE, RENDERED (redesign PR 1, TASKS 2-4).
//
// Rendered on the 31 fixture cards Find's measurements already use (scripts/find-fixtures.jsx: the SPY model board
// and the Alpaca-shaped UNG boards) and on the UNG chain fixture. Static markup, no DOM library: what the screen says at
// rest and in each state. JSX tests are bundled to CJS, so files are read by repo-relative path.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { FindStep, FindHeader, MarketRow, CompareSheet } from "./find.jsx";
import { StrategyCard } from "./market.jsx";
import { compareCards } from "./rows.js";
import { scaleStrategy } from "./pro.jsx";
import { toggleCompare } from "./path.js";
import { MarketPage, ChainTab } from "./market.jsx";
import { listCardFigures } from "./App.jsx";
import { normaliseAlpacaChain } from "./chain.js";
import { findCards } from "../scripts/find-fixtures.jsx";
import { BASKET, MARKET_CATEGORIES } from "./markets.js";
import { findOrderCompare } from "./signals.js";
import { requestOf, RULES, FIND_CHIPS, FIND_ORDERS, FIND_STYLES, FIND_VIEWS, NET_SIDES, PLACEHOLDER_HEAD, NEWS_NOT_READ, chanceText, sizedFree, sizedFigures, money, CARD_LABELS,
  COMPARE_TICK, returnText, styleNumbersText, POSITIVE_FUTURE_TOGGLE, SHOW_FLAGGED_TOGGLE, HIDE_MISSES_TOGGLE } from "./rules.js";
import { rowFigures } from "./rows.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 240)}"`); };
const hasNot = (h, s) => { if (String(h).includes(s)) throw new Error(`should not contain "${s}"`); };
const count = (h, s) => String(h).split(s).length - 1;
const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

console.log("\nFIND, VERSION B, AND THE MARKET PAGE — rendered\n");

const SENTS = [{ id: "verybear", label: "Very Bear", icon: "↓↓" }, { id: "bear", label: "Bear", icon: "↓" },
  { id: "neutral", label: "Neutral", icon: "→" }, { id: "bull", label: "Bull", icon: "↑" }, { id: "verybull", label: "Very Bull", icon: "↑↑" }];
const LIMITS = { answered: true, tradingCapital: 10000, concurrentTarget: 4, perTradeLimit: 500, cappedPerTrade: 500 };
const CARDS = findCards().map((x) => ({ ...x, flags: [], fused: null, family: null, feedBroken: false, noQuoteLegs: 0 }));
const SORTED = CARDS.slice().sort(findOrderCompare("ev"));
const GEN = { items: CARDS, tally: {}, noBoard: [], loading: [], failed: [], oiSkipped: [], spreadSkipped: [], comboSpreadSkipped: [],
  boards: { UNG: { expKey: CARDS.find((x) => x.tk === "UNG").expKey, dte: 40, signal: { dir: "bull", s: 38.6, why: "score +46 × confidence 84 / 100 = 38.6 ≥ 12.5" } } },
  stale: [] };
const FIND = { markets: ["SPY", "UNG"], dir: "signals", horizon: RULES.targetEntryDTE, cat: null, flagged: true, hideMisses: false, positiveOnly: false };
const LIQ = { id: "recommended", label: "Recommended", defaultId: "recommended" };
const LEVEL = { id: "recommended", label: "Recommended", absolute: 10, percentile: 0.4 };
const find = (over = {}) => renderToStaticMarkup(
  <FindStep request={requestOf(over.want || {}, LIMITS)} onRequest={() => {}} sentiments={SENTS} find={{ ...FIND, ...(over.find || {}) }}
    setFind={() => {}} limits={LIMITS} onLimit={() => {}} freeSizing={false} findGen={{ ...GEN, ...(over.gen || {}) }}
    findShown={over.shown || SORTED} findOrder={over.order || "ev"} onFindOrder={() => {}} readiness={over.readiness || {}}
    liqLevel={LEVEL} liqState={LIQ} sheet={over.sheet || null} onSheet={() => {}} freshness={over.freshness || null}
    compare={[]} showCompare={false} compareNote={null} onTickCompare={() => {}} onClearCompare={() => {}} onToggleCompare={() => {}}
    onTakeToBuild={() => {}} />);

check("CATEGORY TABS: 'All 10 · Grains 3 · Energy 4 · Metals 3' — the registry's own counts, never a typed list", () => {
  // Round 2: underlined tabs; the count is a mono span after the label (the markup pinned here changed with the look).
  const tabs = (h) => h.slice(h.indexOf('aria-label="Categories"'), h.indexOf("data-chip-row")).replace(/<[^>]+>/g, "|");
  const t = tabs(find());
  has(t, `All|${BASKET.length}|`);
  for (const c of MARKET_CATEGORIES) has(t, `${c.id}|${c.tickers.length}|`);
  const energy = find({ find: { cat: "Energy" } });
  has(energy.slice(energy.indexOf('aria-label="Categories"')), 'aria-pressed="true" style="font-family:system-ui, -apple-system, Segoe UI, Roboto, sans-serif;flex:0 0 auto;min-height:44px;padding:0 10px;background:transparent;border:none;border-bottom:3px solid');
});

check("ONE ROW OF CHIPS (PR 66): View · Style · Max loss · ⇅ Sort · More, in order, each 44px, filled only when off its default", () => {
  const h = find();
  const bar = h.slice(h.indexOf("data-chip-row"), h.indexOf("</div>", h.indexOf("data-chip-row")));
  if (count(bar, "<button") !== FIND_CHIPS.length || FIND_CHIPS.length !== 5) throw new Error(`${count(bar, "<button")} chips`);
  // A chip's name and value are two spans (name in mut, value in mono for a figure); read as text, the words in order.
  const words = bar.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const want = ["View Signals ▾", "Style Balanced ▾", "Max loss $500 ▾", "⇅ Future avg ▾", "More ▾"];
  let at = -1;
  for (const t of want) { const i = words.indexOf(t); if (i < 0) throw new Error(`missing "${t}" in ${words}`); if (i < at) throw new Error(`"${t}" out of order`); at = i; }
  for (const gone of ["Chance any", "Return ≥", "Horizon ", "Direction", "Avg &gt; 0", "Liquidity"]) hasNot(words, gone);
  if (count(bar, "min-height:44px") !== FIND_CHIPS.length) throw new Error("a chip under 44px");
  if (count(bar, 'aria-pressed="true"') !== 0) throw new Error("a chip is filled at its default");
  hasNot(h, ">Reset<");
  // Off its default: a style, a side, a fixed view — each fills its own chip, and Reset appears.
  const words2 = (o) => { const x = find(o); return x.slice(x.indexOf("data-chip-row")).replace(/<[^>]+>/g, " ").replace(/\s+/g, " "); };
  has(words2({ want: { minChance: 0.6 } }), "Style Custom"); has(find({ want: { minChance: 0.6 } }), ">Reset<");
  has(words2({ want: { minChance: RULES.styleCautiousChance } }), "Style Cautious");
  has(words2({ want: { minReturn: RULES.styleBoldReturn } }), "Style Bold");
  has(words2({ want: { side: "credit" } }), "More · 1");
  has(words2({ find: { positiveOnly: true, flagged: false } }), "More · 2");
  has(words2({ find: { dir: "verybull", target: null } }), `View Up ${RULES.viewFartherMoves}×`);
  has(words2({ find: { dir: "bear", target: 1.25 } }), "View Down 1.25×");
  has(words2({ find: { dir: "neutral" } }), "View Range");
});

check("ONE ROW PER MARKET, IN THE ORDER OF ITS CARD: ticker (mono), subtitle, picture, three figures (the sorted one ringed), the days and 'risk $N'", () => {
  const h = find();
  if (count(h, 'role="listitem" data-row=') !== 2) throw new Error("not one row per market");
  if (h.indexOf('data-row="' + SORTED[0].tk + '"') > h.indexOf('data-row="' + SORTED.find((x) => x.tk !== SORTED[0].tk).tk + '"')) {
    throw new Error("the rows are not in the order of their cards");
  }
  has(h, "Days · risk");
  has(h, "risk $");
  // PR 63: Chance · Return on risk · Avg per $100 at risk on every row, the sorted-by one (Future avg) ringed, and the days.
  if (count(h, 'data-row-fig="chance"') !== 2 || count(h, 'data-row-fig="rr"') !== 2 || count(h, 'data-row-fig="future"') !== 2) {
    throw new Error("a row without its three figures");
  }
  if (count(h, 'data-row-fig="future" data-sorted="true"') !== 2 || count(h, 'data-sorted="true"') !== 2) throw new Error("the ring is not on Future avg alone");
  has(h, " avg per $100"); has(h, `>${SORTED[0].dte}d<`);
  has(h, "<svg width=\"72\" height=\"40\"");          // the 72×40 picture: payoffBands()'s zones and the price line
  has(h, "▲ Bull");                                  // UNG's direction from signalDirection(), never "Very"
  has(h, "2 of 2 fit");
});

check("A MISS STAYS IN ITS PLACE, QUIETER, ITS REASON IN PLACE OF THE SUBTITLE; 'Hide them' hides it behind the count", () => {
  const want = { minChance: 0.8 };
  const h = find({ want });
  has(h, 'data-miss="true"');
  has(h, "chance ");                                   // the miss reason: "chance 34% under the 80% asked"
  has(h, " fit · 2 dimmed");
  has(h, ">Hide them<");
  const hidden = find({ want, find: { hideMisses: true } });
  has(hidden, " fit · 2 hidden"); has(hidden, ">Show them<");
  hasNot(hidden, 'data-miss="true"');
});

check("NOTHING FITS: the filter that binds, the cheapest card here, ONE fix button", () => {
  const h = find({ want: { amt: 10 } });
  has(h, "Nothing fits your budget.");
  has(h, "All 2 markets miss. Cheapest here:");
  if (!/Set budget to \$\d+/.test(h)) throw new Error("no budget fix offered");
});

check("READING: a market still being read waits after the rows that are in, with '—' and what it waits for", () => {
  const h = find({ find: { markets: ["SPY", "UNG", "CORN", "GLD"] }, gen: { loading: ["CORN"] },
    readiness: { GLD: { reading: true, waiting: ["seasonal"], failed: [] } } });
  has(h, 'data-waiting="chain"'); has(h, "Reading the chain…");
  has(h, 'data-waiting="season"'); has(h, "Reading the season…");
  has(h, "Reading 4 markets · 2 done · the order settles when all are in");
  if (h.indexOf('data-row="CORN"') < h.indexOf('data-row="UNG"')) throw new Error("a waiting row sits above a row that is in");
});

check("STALE: the freshness line as a banner, with Retry (round 2: in Find's own header, in place of the status line)", () => {
  const h = renderToStaticMarkup(<FindHeader status="10 markets · prices 3m ago · Alpaca · Paper"
    stale={{ stale: true, closeDay: "Fri 2 Oct", failedAt: "14:05", onRetry: () => {} }} />);
  // Redesign PR 3, TASK 0a (the board "Find · stale"): the status line turns amber with a dot, the banner under it says why.
  has(h, "data-find-status"); has(h, esc("Stale · close Fri 2 Oct"));
  has(h, esc("The feed didn't answer at 14:05."));
  has(h, esc("These are Fri 2 Oct's closing numbers; prices may have moved."));
  has(h, ">Retry<");
});

check("THE SHEETS (PR 66): View, Style, Budget, ⇅ Sort, More — each holds its controls and ends with a live 'Show N of M'", () => {
  const budget = find({ sheet: "find:budget" });
  has(budget, 'role="dialog"'); has(budget, "What I can spend"); has(budget, "What I want to make"); has(budget, "edit the per-trade limit");
  has(budget, ">Show 2 of 2<");
  const sort = find({ sheet: "find:sort" });
  for (const o of FIND_ORDERS) { has(sort, esc(o.label)); has(sort, esc(o.note)); }
  hasNot(sort, "Future avg + signal"); hasNot(sort, SHOW_FLAGGED_TOGGLE);
  // View: the four choices; Up and Down take the target in expected moves and say which family it builds.
  const view = find({ sheet: "find:view" });
  for (const v of FIND_VIEWS) has(view, `>${esc(v.label)}<`);
  hasNot(view, "Very Bull"); hasNot(view, "Target, in expected moves");
  const up = find({ sheet: "find:view", find: { dir: "bull", target: null } });
  has(up, "Target, in expected moves"); has(up, "builds the Bull cards"); has(up, ">Show 2 of 2<");
  has(find({ sheet: "find:view", find: { dir: "verybull", target: null } }), "builds the Very Bull cards");
  // Style: the three, each with the two numbers it sets; the two sliders one fold down.
  const style = find({ sheet: "find:style" });
  for (const st of FIND_STYLES) { has(style, `>${st.label}<`); has(style, esc(styleNumbersText(st))); }
  has(style, "Set them yourself");
  // More: Debit · Credit · Both, Horizon, the three list toggles, and the Liquidity panel as a fold.
  const more = find({ sheet: "find:more" });
  for (const o of NET_SIDES) has(more, `>${o.label}<`);
  has(more, ">Horizon<"); has(more, esc(POSITIVE_FUTURE_TOGGLE)); has(more, SHOW_FLAGGED_TOGGLE); has(more, HIDE_MISSES_TOGGLE);
  has(more, "Liquidity · Recommended");
  // No sheet open: none of them is on screen.
  hasNot(find(), 'role="dialog"');
});

check("THE FILTER THAT BINDS (PR 66, task 66.2): named under the summary when rows are dimmed, with ONE fix", () => {
  // Credit only: on the fixture, SPY and UNG both carry credits, so nothing is dimmed and no line is drawn.
  hasNot(find({ want: { side: "credit" } }), "data-find-binding");
  // Cautious keeps SPY (Bear Call at 73%) and UNG (Bull Put at 58%): nothing dimmed either.
  hasNot(find({ want: { minChance: RULES.styleCautiousChance } }), "data-find-binding");
  // 60%: SPY fits, UNG is dimmed by the chance alone → "Style Custom leaves out 1 market · Loosen ›".
  const h = find({ want: { minChance: 0.6 } });
  has(h, "1 of 2 fit · 1 dimmed"); has(h, "data-find-binding"); has(h, "Style Custom leaves out 1 market"); has(h, ">Loosen ›<");
});

check("FIND DRAWS NO CARDS AND NO PICTURE ROW ANY MORE: the cards are on the market page", () => {
  const h = find();
  hasNot(h, "data-card-key"); hasNot(h, "YOU RISK"); hasNot(h, "<StepForward");
});

/* ---------------------------------------------------------------- THE MARKET PAGE */
const RAW = JSON.parse(readFileSync("src/fixtures/alpaca-chain-UNG.json", "utf8"));
const NOW = Date.parse("2026-10-04T07:00:00Z");
const CHAIN = normaliseAlpacaChain("UNG", RAW, { spot: 13.24, now: Date.parse("2026-09-02T12:00:00Z") });
const FUSED = { ticker: "UNG", score: 46, confidence: 84, agreement: "MIXED", factors: ["seasonal", "technical", "weather", "news"],
  components: { seasonal: { dir: 1, strength: 30 }, technical: { dir: 1, strength: 40 }, weather: { dir: 1, strength: 20 }, news: { dir: 0, strength: 0 } } };
// The fixture boards are named "UNG-<expiry>"; the chain's own key is the date.
const UNG = SORTED.filter((x) => x.tk === "UNG").map((x, i) => ({ ...x, expKey: x.expKey.replace(/^UNG-/, ""), fused: FUSED,
  family: i % 2 ? "neutral" : "signal" }));
const QUOTE = (c, ek) => (leg) => (c.byExp[ek] ? c.byExp[ek][leg.type === "call" ? "calls" : "puts"][leg.strike] || null : null);
const page = (over = {}) => renderToStaticMarkup(
  <MarketPage tk="UNG" tab={over.tab || "strategies"} onTab={() => {}} onBack={() => {}} onTicker={() => {}}
    chain={over.chain === undefined ? CHAIN : over.chain} freshLine="1 market · prices 3m ago" clockLine="Market closed · opens Mon 15:30 your time"
    bars={[{ time: "2026-10-01", open: 12.9, high: 13.1, low: 12.8, close: 13.0, volume: 1000 }, { time: "2026-10-02", open: 13.0, high: 13.2, low: 12.9, close: 13.1, volume: 1000 }]} ivRank={null} ivDays={7}
    board={{ ...GEN.boards.UNG, expKey: UNG[0].expKey }} fused={FUSED}
    items={UNG} allItems={SORTED} boards={GEN.boards} request={requestOf({}, LIMITS)} findDir={over.dir || "signals"} sentiments={SENTS}
    findOrder="ev" newsItems={[]} newsState={over.news || { err: "timeout" }} now={over.now || NOW} timeZone="Europe/Rome"
    cardFigures={listCardFigures} quoteOf={QUOTE} liqFloor={10} compareProps={{ compare: [] }} />);

check("THE HEADER (round 2's look): back arrow, the switcher (icon, ticker ▾, name · category), ↻, ☆; price, day change, status; IV, IV rank 'collecting', move", () => {
  const h = page();
  has(h, 'aria-label="Back to Find"'); hasNot(h, ">‹ Find<");
  has(h, ">UNG</span>"); has(h, ">▾</span>"); has(h, "US Natural Gas · Energy"); has(h, "$13.24");
  has(h, "since the Fri 2 Oct close");                     // the day change's spoken sentence (dayChangeText)
  has(h, "Market closed · opens Mon 15:30 your time");
  has(h, ">IV rank<"); has(h, "collecting 7 of 20"); has(h, "IV rank: collecting, 7 of 20 days");
  has(h, ">Move to ");
  has(h, 'aria-label="Save this market&#x27;s first card"');
  has(h, NEWS_NOT_READ);
  // The three tabs are underlined tabs, not a segmented control.
  has(h, "border-bottom:3px solid");
});

check("THE EVENT LINE (round 2, dates read 5 Oct 2026): UNG at 4 Oct names EIA storage Thu 8 Oct in the user's time; the placeholder only after the table's end", () => {
  const h = page();
  has(h, "EIA storage"); has(h, "Thu 8 Oct, 16:30"); has(h, "in 4 days");
  hasNot(h, 'data-placeholder="events-calendar"');
  const after = page({ now: Date.parse("2027-01-02T12:00:00Z") });
  has(after, PLACEHOLDER_HEAD); has(after, 'data-placeholder="events-calendar"');
  hasNot(after, "your time · in ");
});

check("STRATEGIES: the signals' family first, then Neutral 'always listed'; the arithmetic line; each card's stance and actions", () => {
  const h = page();
  has(h, "▲ BULL · WHAT THE SIGNALS SUGGEST"); has(h, "≈ NEUTRAL · ALWAYS LISTED");
  if (h.indexOf("WHAT THE SIGNALS SUGGEST") > h.indexOf("ALWAYS LISTED")) throw new Error("Neutral came first");
  // Round 2: the whole line is the block's spoken name; on screen the arithmetic is set in mono, the rest beneath.
  has(h, "Signals: +46 × 84 ÷ 100 = 38.6 → Bull · sorted by Future avg · built on");
  has(h, "Neutral cards are always listed. Order: Future avg.");
  has(h, ">The market&#x27;s read ›<");
  if (!/with the signals, \d of 4|against the signals, \d of 4|direction-neutral/.test(h)) throw new Error("no stance line");
  for (const a of ['>Compare</button>', ">Open in chain<", ">Build ›<", ">Details ▾<"]) has(h, a);
  // Every card is the COMPACT card at rest; the full card waits behind Details.
  if (count(h, "data-card-key") !== UNG.length) throw new Error("not every UNG card is on its page");
  if (count(h, 'data-compact="') !== UNG.length) throw new Error("not every card is compact");
  // A fixed direction: one group, the user's, and it says so.
  const fixed = page({ dir: "bear" });
  has(fixed, "YOUR VIEW"); hasNot(fixed, "WHAT THE SIGNALS SUGGEST");
  // PR 66: the line says the View in its own words, with this market's price at the target.
  has(fixed, "View: Down to $");
});

check("CHAIN: expiries with days left, under 30d dashed and not buildable; OI · Vol only with open interest; '—' for a missing delta", () => {
  const legs = UNG[0].legs.map((l) => ({ ...l }));
  const h = renderToStaticMarkup(<ChainTab tk="UNG" chain={CHAIN} clock={{ is_open: false }} tray={{ expKey: UNG[0].expKey, legs, note: null }}
    setTray={() => {}} cardFigures={listCardFigures} quoteOf={QUOTE} iv={0.48} liqFloor={10} onBuildLegs={() => {}} />);
  has(h, "Call Bid"); has(h, "Strike"); has(h, "Put Ask");
  has(h, "13.24 close</span>");                           // the spot line: "13.24 close"
  const under = CHAIN.expirations.find((e) => CHAIN.byExp[e].dte < RULES.minEntryDTE);
  if (under) { has(h, "under 30d"); has(h, "cannot be built from"); }
  has(h, "data-chain-tray"); has(h, ">Build ›<"); has(h, ">Clear<");
  for (const k of ["Debit", "Max profit", "Max loss", "Chance"]) if (!h.includes(k) && !h.includes("Credit")) throw new Error(`tray: ${k}`);
  // The Alpaca fixture carries no open interest: the OI chip says so, never a column of zeros.
  const noOi = { ...CHAIN, byExp: Object.fromEntries(Object.entries(CHAIN.byExp).map(([e, b]) => [e, { ...b,
    calls: Object.fromEntries(Object.entries(b.calls).map(([k, q]) => [k, { ...q, oi: null, delta: null }])),
    puts: Object.fromEntries(Object.entries(b.puts).map(([k, q]) => [k, { ...q, oi: null }])) }])) };
  const h2 = renderToStaticMarkup(<ChainTab tk="UNG" chain={noOi} tray={null} setTray={() => {}} cardFigures={listCardFigures}
    quoteOf={QUOTE} iv={0.48} liqFloor={10} onBuildLegs={() => {}} />);
  has(h2, "does not send open interest"); hasNot(h2, ">thin<");
});

check("CHAIN: an uncovered short leg blocks Build with the reason; nothing is sent from this page", () => {
  const k = Object.keys(CHAIN.byExp[UNG[0].expKey].calls)[3];
  const h = renderToStaticMarkup(<ChainTab tk="UNG" chain={CHAIN} tray={{ expKey: UNG[0].expKey, legs: [{ type: "call", strike: Number(k), side: -1, qty: 1 }], note: null }}
    setTray={() => {}} cardFigures={listCardFigures} quoteOf={QUOTE} iv={0.48} liqFloor={10} onBuildLegs={() => {}} />);
  has(h, "Build is blocked: a short leg is not covered");
  if (!/<button[^>]*disabled=""[^>]*>Build ›<\/button>/.test(h)) throw new Error("Build is not disabled");
  const src = readFileSync("src/market.jsx", "utf8");
  for (const w of ["orderBody", "sendToAlpaca", "alpacaReq", "/v2/orders"]) hasNot(src, w);
});

check("☆ IS A TOGGLE (PR 61): a saved row's star stays enabled and says it removes; the market header's star says the same", () => {
  const x = SORTED.find((c) => c.tk === "UNG");
  const row = { tk: x.tk, x, misses: [], fits: true };
  const fig = rowFigures(x, null, "ev");
  const off = renderToStaticMarkup(<MarketRow row={row} fig={fig} saved={false} onSave={() => {}} onOpen={() => {}} />);
  const on = renderToStaticMarkup(<MarketRow row={row} fig={fig} saved onSave={() => {}} onOpen={() => {}} />);
  has(off, `aria-label="${esc(`Save: UNG ${x.name}`)}"`); has(off, "☆");
  has(on, `aria-label="${esc(`Remove from Saved: UNG ${x.name}`)}"`); has(on, "★");
  if (/<button[^>]*aria-label="Remove from Saved[^"]*"[^>]*disabled/.test(on)) throw new Error("a saved star is disabled");
  const src = readFileSync("src/market.jsx", "utf8");
  has(src, "label={saved ? UNSAVE_FIRST_CARD : SAVE_FIRST_CARD}");
});

check("ONE COMPARE (PR 61): tick on the market page → '1 of 3 to compare · See them ›' → the sheet shows THAT card with the figures its card prints", () => {
  const x = UNG[0];
  const request = requestOf({}, LIMITS);
  const size = sizedFree(scaleStrategy(x.lf.aFill, request.mode, request.amt, request.riskCap), false);
  // The tick shows its word, off and on.
  const off = renderToStaticMarkup(<StrategyCard x={x} size={size} misses={[]} bars={[]} sortedBy="future" findOrder="ev" saved={false} ticked={false}
    onSave={() => {}} onTick={() => {}} onBuild={() => {}} onChain={() => {}} badge={null} />);
  const on = renderToStaticMarkup(<StrategyCard x={x} size={size} misses={[]} bars={[]} sortedBy="future" findOrder="ev" saved={false} ticked
    onSave={() => {}} onTick={() => {}} onBuild={() => {}} onChain={() => {}} badge={null} />);
  has(off, `aria-pressed="false" data-compare-tick`); has(off, `>${COMPARE_TICK.off}</button>`);
  has(on, `aria-pressed="true" data-compare-tick`); has(on, `>${COMPARE_TICK.on}</button>`);
  // After the tick: the line, on the page, with the way to the sheet.
  const ticked = toggleCompare([], x.cand).list;
  const h = page({}).replace(/compareProps=\{\{ compare: \[\] \}\}/, "");
  hasNot(h, "data-compare-line");
  const withLine = renderToStaticMarkup(<MarketPage tk="UNG" tab="strategies" onTab={() => {}} onBack={() => {}} onTicker={() => {}} chain={CHAIN}
    board={{ ...GEN.boards.UNG, expKey: UNG[0].expKey }} fused={FUSED} items={UNG} allItems={SORTED} boards={GEN.boards} request={request}
    findDir="signals" sentiments={SENTS} findOrder="ev" newsItems={[]} newsState={{ err: "x" }} now={NOW} timeZone="Europe/Rome"
    cardFigures={listCardFigures} quoteOf={QUOTE} liqFloor={10} compareProps={{ compare: ticked, onOpen: () => {} }} />);
  has(withLine, "data-compare-line"); has(withLine, "1 of 3 to compare"); has(withLine, "See them ›");
  // The refusal of a fourth is on the line, not swallowed.
  const four = toggleCompare([UNG[0].cand, UNG[1].cand, UNG[2].cand], UNG[3] ? UNG[3].cand : SORTED[0].cand);
  const capped = renderToStaticMarkup(<MarketPage tk="UNG" tab="strategies" onTab={() => {}} onBack={() => {}} onTicker={() => {}} chain={CHAIN}
    board={{ ...GEN.boards.UNG, expKey: UNG[0].expKey }} fused={FUSED} items={UNG} allItems={SORTED} boards={GEN.boards} request={request}
    findDir="signals" sentiments={SENTS} findOrder="ev" newsItems={[]} newsState={{ err: "x" }} now={NOW} timeZone="Europe/Rome"
    cardFigures={listCardFigures} quoteOf={QUOTE} liqFloor={10} compareProps={{ compare: four.list, note: four.note, onOpen: () => {} }} />);
  has(capped, "3 of 3 to compare"); has(capped, "Untick one first");
  // The sheet: the ticked card's row, labelled C1, with the figures the card prints for the same size.
  const cmp = compareCards([x], request, () => size, { fitOnly: false });
  const sheet = renderToStaticMarkup(<CompareSheet open onClose={() => {}} cmp={cmp} rows={[{ cand: ticked[0], card: cmp.cards[0] }]} ticked={ticked} />);
  has(sheet, "data-compare-sheet"); has(sheet, ">C1<"); has(sheet, "1 card you ticked");
  const f = sizedFigures(x.lf.aFill, size.ok ? size.n : null);
  for (const v of [`${CARD_LABELS.risk} ${money(f.risk)}`, `${CARD_LABELS.chance} ${chanceText(x.lf.pop)}`, `${CARD_LABELS.rr} ${returnText(x.lf.rr)}`]) has(sheet, v);
  // …and those are the card's own strings.
  has(on, money(f.risk)); has(on, chanceText(x.lf.pop)); has(on, returnText(x.lf.rr));
  hasNot(sheet, "per contract");
  // Find's "Compare ›" shows with ticks even when nothing fits.
  has(renderToStaticMarkup(<FindStep request={request} onRequest={() => {}} sentiments={SENTS} find={FIND} setFind={() => {}} limits={LIMITS} onLimit={() => {}}
    freeSizing={false} findGen={GEN} findShown={SORTED} findOrder="ev" onFindOrder={() => {}} readiness={{}} liqLevel={LEVEL} liqState={LIQ}
    onSheet={() => {}} compare={ticked} compareFitting={0} copilot={{ convo: null, setConvo: () => {} }} />), "data-find-compare");
});

/* PR 73 (owner, 19 Oct 2026): ON A COMPUTER the chips wrap onto a second line and the market page's tray docks at the foot
   of its own pane; a phone keeps the sideways chip row and the tray fixed above the bottom bar. */
check("PR 73 — ON A COMPUTER FIND'S CHIPS WRAP (no sideways scroll); a phone keeps its one scrolling row", () => {
  const wideHtml = renderToStaticMarkup(
    <FindStep wide request={requestOf({}, LIMITS)} onRequest={() => {}} sentiments={SENTS} find={FIND} setFind={() => {}} limits={LIMITS} onLimit={() => {}}
      freeSizing={false} findGen={GEN} findShown={SORTED} findOrder="ev" onFindOrder={() => {}} readiness={{}} liqLevel={LEVEL} liqState={LIQ}
      sheet={null} onSheet={() => {}} compare={[]} />);
  const row = wideHtml.slice(wideHtml.indexOf("data-chip-row"), wideHtml.indexOf(">", wideHtml.indexOf("data-chip-row")));
  has(row, 'data-chip-row="wrap"'); has(row, "flex-wrap:wrap"); hasNot(row, "overflow-x");
  const phone = find();
  const prow = phone.slice(phone.indexOf("data-chip-row"), phone.indexOf(">", phone.indexOf("data-chip-row")));
  has(prow, "overflow-x:auto"); hasNot(prow, "flex-wrap:wrap");
});
check("PR 73 — ON A COMPUTER THE CHAIN'S TRAY DOCKS IN ITS PANE (sticky at the pane's foot); a phone's stays fixed above the bar", () => {
  const legs = UNG[0].legs.map((l) => ({ ...l }));
  const at = (docked) => renderToStaticMarkup(<ChainTab tk="UNG" chain={CHAIN} clock={{ is_open: false }} tray={{ expKey: UNG[0].expKey, legs, note: null }}
    setTray={() => {}} cardFigures={listCardFigures} quoteOf={QUOTE} iv={0.48} liqFloor={10} onBuildLegs={() => {}} docked={docked} />);
  const d = at(true), p = at(false);
  const tray = (h) => h.slice(h.indexOf("data-chain-tray"), h.indexOf(">", h.indexOf("data-chain-tray")));
  has(tray(d), 'data-chain-tray="docked"'); has(tray(d), "position:sticky"); hasNot(tray(d), "position:fixed");
  has(tray(p), "position:fixed");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
