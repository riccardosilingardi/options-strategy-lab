// Redesign PR 3b — the Journal, Settings and the computer's layout, rendered (no DOM library).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { JournalScreen } from "./journal.jsx";
import { SettingsScreen } from "./settings.jsx";
import { BottomBar } from "./navBar.jsx";
import { useWide, WIDE_MIN, RAIL_W } from "./ui.jsx";
import { T } from "./theme.js";
import { whyOpenedLine, endedLine, closedState, closedTitle, netNote, openState, timelineItems, stampWords, pnlWords } from "./journalView.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); } catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, x, m) => { if (!s.includes(x)) throw new Error(`${m || "missing"}: "${x}"`); };
const hasNot = (s, x, m) => { if (s.includes(x)) throw new Error(`${m || "unexpected"}: "${x}"`); };

const snap = (score, agreement, factors) => ({ ready: true, score, confidence: 86, agreement, factors });
const RULE_CLOSE = { id: 1, ref: "J-0001", ticker: "GLD", name: "Bull put spread · 16 Oct", pnl: 18, closeOrderId: "c1", ruleExit: true,
  closeReason: { kind: "rule", text: "Take profit reached: 50% of the maximum profit" }, openOrderId: "o1",
  thesis: { pop: 0.74, signals: snap(28, "CONFLUENT", { seasonal: { dir: 1 }, technical: { dir: 1 }, weather: { dir: 0 }, news: { dir: 1 } }) },
  timeline: [{ seq: "J-0001·01", t: Date.parse("2026-09-14T14:20:00Z"), text: "Opened at 0.36 credit × 1.", orderId: "o1" },
    { seq: "J-0001·02", t: Date.parse("2026-10-01T15:05:00Z"), text: "Take profit reached." }] };
const HAND_CLOSE = { id: 2, ref: "J-0002", ticker: "SOYB", name: "Iron condor · 16 Oct", pnl: -22, closeOrderId: "c2", ruleExit: false,
  closeReason: { kind: "manual", text: "USDA report on Friday; stepping aside before it.", written: "USDA report on Friday; stepping aside before it." },
  thesis: { pop: 0.59, signals: snap(4, "CONFLICT", { seasonal: { dir: 1 }, technical: { dir: -1 } }) }, timeline: [] };
const OPEN = { id: 7, ref: "J-0007", ticker: "CORN", name: "Bull Call Spread", legs: [], thesis: null, timeline: [{ seq: "J-0007·01", t: 1, text: "Sent." }] };
const JOURNEY = { level: 3, closed: 2, ruled: 1, score: 64, next: "Close 4 more trades by the rules to reach level 4.", coerenza: 1 };
const journal = (over = {}) => renderToStaticMarkup(<JournalScreen v={{ journey: JOURNEY, insideLimit: "Inside the limit: 100%.",
  open: [{ p: OPEN, m: { name: "Bull call spread 14/15 · 18 Dec", pnl: -153, act: { action: "WARNING", kind: "stop" }, working: false }, stage: "owned" }],
  closed: [HAND_CLOSE, RULE_CLOSE], allClosed: [HAND_CLOSE, RULE_CLOSE], query: "", onQuery: () => {}, report: <div>REPORT</div>,
  floorLog: <div>FLOOR LOG</div>, ...over }} />);

console.log("\nRedesign PR 3b — the Journal, Settings and the computer's layout\n");

check("THE JOURNAL, IN THE BOARD'S ORDER: header, the record, Find a trade, OPEN, CLOSED TRADES with the net, Refs only go up, then the folds", () => {
  const h = journal();
  const order = [">Journal</h1>", "THE RECORD · 2 CLOSED · 1 OPEN", "LEVEL", "RULE CLOSES", "AWARENESS", "Next: Close 4 more", "Find a trade",
    "OPEN · 1", "CLOSED TRADES · 2 · NET -$4", "Refs only go up", "The report", "FLOOR LOG"];
  let last = -1;
  for (const k of order) { const at = h.indexOf(k); if (at < 0) throw new Error(`${k} missing`); if (at < last) throw new Error(`${k} out of order`); last = at; }
  has(h, ">1 of 2<"); has(h, ">64/100<");
  has(h, "About the measures", "inside the limit is behind the record's ⓘ");
});

check("A ROW: ref, ticker · name, how it ended, the figure (a loss violet) and RULE / YOUR REASON / WARNING", () => {
  const h = journal();
  has(h, "Closed by the rules: take profit reached: 50% of the maximum profit.");
  has(h, "Your reason: “USDA report on Friday; stepping aside before it.”");
  has(h, ">RULE<"); has(h, ">YOUR REASON<"); has(h, ">WARNING<");
  has(h, "+$18"); has(h, "-$22");
  has(h, `color:${T.violet}`, "a loss is violet");
  hasNot(h, `color:${T.red}`, "nothing on the Journal is an error");
});

check("ONE ROW OPENS: the reason it was opened, why it ended, the per-trade reading, both order ids and the WHOLE timeline", () => {
  const h = journal({ openRef: "J-0001" });
  has(h, "THE REASON YOU OPENED IT · ");
  has(h, "▲ 3 of 4 factors agree · score 28 · confidence 86 · chance 74%.");
  has(h, "WHY IT ENDED · "); has(h, "OPENING ORDER · o1"); has(h, "CLOSING ORDER · c1");
  has(h, "TIMELINE · 2 ENTRIES, ALL OF THEM"); has(h, "order o1");
  eq((h.match(/data-entry-body/g) || []).length, 1, "one entry open at a time");
});

check("SEARCH: 'Nothing matches' names the range of refs; an open trade is found by its ref too", () => {
  const none = journal({ query: "XYZ", closed: [] });
  has(none, "Nothing matches &quot;XYZ&quot;. The refs run from J-0001 upwards.");
  const found = journal({ query: "7", closed: [] });
  has(found, "OPEN · 1");
});

check("THE WORDS: one line per reason, never a made-up figure", () => {
  eq(whyOpenedLine(HAND_CLOSE.thesis), "≈ the factors contradict each other: Neutral · chance 59%.");
  eq(whyOpenedLine(null), "Not recorded: this trade was opened before the app wrote its reasons down.");
  eq(whyOpenedLine({ pop: 0.5, iv: 0.3 }), "chance 50% · volatility 30%.");
  eq(endedLine({ closeReason: {} }), "No reason was recorded.");
  eq(closedState(RULE_CLOSE), "RULE"); eq(closedState(HAND_CLOSE), "YOUR REASON");
  eq(closedTitle([]), "CLOSED TRADES · 0");
  eq(netNote([{ pnl: 5 }]), "The net leaves out 1 figure that is not a fill.", "a figure with no closing order is not in the net");
  eq(openState({ stage: "working" }), "ORDER WORKING"); eq(openState({ working: true, action: "CLOSE" }), "CLOSE WORKING");
  eq(openState({ action: null }), "NO QUOTE");
  eq(pnlWords(null), "—"); eq(stampWords("not a date"), null);
  eq(timelineItems([{ t: 1, text: "x" }])[0].seq, "·01", "an entry with no seq still has its place");
});

const LIMITS = { answered: true, perTradeLimit: 500, totalLimit: 2500, pills: [] };
const settings = (over = {}) => renderToStaticMarkup(<SettingsScreen v={{ onBack: () => {}, settings: { capital: 10000, webhook: "" }, limits: LIMITS,
  openNow: 620, freeSizing: false, capitalNote: "Worked out from the $10,000 you set aside.", onSetting: () => {}, onNotify: () => {}, theme: "dark",
  onTheme: () => {}, sizingFreeOk: () => false, onCheckAlpaca: () => {}, checking: false,
  conn: { alpaca: { ok: true, state: "Connected · checked 10:14", account: "PA1" }, av: { ok: false, state: "Not read yet" }, ai: { ok: false, state: "Not asked yet" } },
  ...over }} />);

check("SETTINGS, IN THE BOARD'S ORDER: Back, capital and limits, free sizing, connections, appearance, nothing to do, start over", () => {
  const h = settings();
  const order = [">Back<", ">Settings</h1>", "YOUR CAPITAL · EVERY LIMIT COMES FROM HERE", "Trading capital, in dollars", "YOUR LIMITS",
    "$500", "at risk per trade", "$2,500", "Open now: ", "$620", "More limits", "FREE SIZING", "The 5% and 25% limits are", "CONNECTIONS",
    "Alpaca paper trading", "● Connected · checked 10:14", "Check the connection", "Alpha Vantage", "Anthropic API", "Report webhook",
    "Keys live on the server", "APPEARANCE", "WHEN THERE IS NOTHING TO DO", "START OVER", "Redo setup"];
  let last = -1;
  for (const k of order) { const at = h.indexOf(k); if (at < 0) throw new Error(`${k} missing`); if (at < last) throw new Error(`${k} out of order`); last = at; }
});

check("A CONNECTION NOBODY READ IS NOT 'WORKING' (unknown is not zero), and is not green", () => {
  const h = settings();
  has(h, ">Not read yet<"); has(h, ">Not asked yet<");
  eq((h.match(/● Working/g) || []).length, 0);
  const at = h.indexOf(">Not read yet<");
  hasNot(h.slice(h.lastIndexOf("<span", at), at), `color:${T.green}`);
});

check("NOTHING IS DROPPED: positions at once, savings and your own per-trade limit are in the More limits fold (mounted)", () => {
  const h = settings();
  for (const k of ["Positions at once", "Total savings, in dollars (optional)", "Your own per-trade limit"]) has(h, k);
  has(settings({ settings: { capital: 1, sizeOverride: { perTrade: 300, reason: "x" } } }), "Remove your own limit");
});

check("A COMPUTER: from WIDE_MIN the bar is a left sidebar with the same four places and the badge; a test has no window, so not wide", () => {
  eq(WIDE_MIN, 1024); eq(RAIL_W, 200);
  let seen = null;
  const Probe = () => { seen = useWide(); return null; };
  renderToStaticMarkup(<Probe />);
  eq(seen, false, "no window: the phone layout");
  const rail = renderToStaticMarkup(<BottomBar rail current="positions" badge={2} onGo={() => {}} />);
  has(rail, "data-rail"); has(rail, `width:${RAIL_W}px`); has(rail, 'aria-current="page"'); has(rail, "Positions, 2 to look at");
  for (const k of ["Find", "Build", "Positions", "Journal"]) has(rail, `<span style="flex:1">${k}</span>`);
  const bar = renderToStaticMarkup(<BottomBar current="positions" badge={2} onGo={() => {}} />);
  hasNot(bar, "data-rail", "a phone keeps the bottom bar");
});

check("TWO PANES ONLY ON A COMPUTER: Find's rows beside the market page, Positions' cards beside a position's screen; on a phone the wrappers are display:contents", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "const paneFind = wide && (onFindStep || onMarketStep);");
  has(app, "const panePos = wide && onPositions;");
  has(app, 'style={paneFind ? PANES : CONTENTS}');
  has(app, 'const CONTENTS = { display: "contents" };');
  has(app, "<BottomBar rail={wide}");
  has(journal({ wide: true }), "grid-template-columns:minmax(0, 1fr) minmax(0, 1fr)");
  has(journal(), "display:contents", "a phone's Journal is one column");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [n, m] of bad) console.error(`FAILED: ${n}\n${m}`); process.exit(1); }
