import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalOnboarding, WizardOpen, WizardQuestions, WizardCandidates, WizardConfirm, NothingToday, statusLine, tradeOffSentence, gateChecklist } from "./wizard.jsx";
import { evaluateTrade } from "./riskGate.js";
import { sizing, NOTHING_TODAY, RULES } from "./rules.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };

const limits = sizing({ tradingCapital: 5000, concurrentTarget: 4 });

check("onboarding renders with derived limits", () => {
  const h = renderToStaticMarkup(<CapitalOnboarding onDone={() => {}} />);
  has(h, "First, how much are we working with?");
  has(h, "at risk per trade");
});

check("onboarding shows the 1-position pill before the choice", () => {
  const h = renderToStaticMarkup(<CapitalOnboarding initial={{ capital: 5000, concurrentTarget: 1 }} onDone={() => {}} />);
  has(h, "all your risk sits on one outcome");
  // the pill must appear BEFORE the Start button in the markup
  if (h.indexOf("all your risk sits on one outcome") > h.indexOf(">Start<")) throw new Error("pill rendered after the confirm button");
});

check("screen 1 with no positions", () => {
  const h = renderToStaticMarkup(<WizardOpen positions={[]} posAlerts={[]} attention={0} perTradeLimit={250} />);
  has(h, "My positions"); has(h, "Find opportunities"); has(h, "Decide for me");
  has(h, "Nothing to manage");
});

check("screen 1 leads with what needs attention once positions exist", () => {
  const pos = [{ id: 1, ticker: "CORN", name: "Bull Call Spread" }];
  const alerts = [{ p: pos[0], pnl: -42, dteLeft: 30, level: "action", label: "21 days left — close or roll" }];
  const h = renderToStaticMarkup(<WizardOpen positions={pos} posAlerts={alerts} attention={1} perTradeLimit={250} />);
  has(h, "Needs attention today");
  has(h, "CORN");
  has(h, "-$42");
  // the wizard is still one tap away
  has(h, "Find opportunities");
  if (h.indexOf("Needs attention today") > h.indexOf("Find opportunities")) throw new Error("attention must lead the page");
});

check("statusLine is generated, not hand-written per case", () => {
  const a = statusLine({ positions: [], attention: 0 });
  const b = statusLine({ positions: [1, 2, 3], attention: 2 });
  const c = statusLine({ positions: [1], attention: 0 });
  if (!b.includes("2 of your 3 positions")) throw new Error(b);
  if (!c.includes("1 position open")) throw new Error(c);
  if (!a.includes("No open positions")) throw new Error(a);
});

check("screen 2 asks three questions and no Greeks", () => {
  const h = renderToStaticMarkup(<WizardQuestions answers={{ risk: 250, horizon: 45, priority: "balanced" }} setAnswers={() => {}} limits={limits} />);
  has(h, "QUESTION 1 OF 3"); has(h, "QUESTION 2 OF 3"); has(h, "QUESTION 3 OF 3");
  has(h, "Win often"); has(h, "Win big"); has(h, "Balanced");
  for (const banned of ["delta", "Delta", "implied volatility", "Greek", "vega", "theta", "IV "]) {
    if (h.includes(banned)) throw new Error(`screen 2 mentions "${banned}"`);
  }
});

check("screen 2 pill precedes the budget choice", () => {
  const h = renderToStaticMarkup(<WizardQuestions answers={{ risk: 250, horizon: 45, priority: "balanced" }} setAnswers={() => {}} limits={limits} />);
  has(h, "This is the most you can lose");
  if (h.indexOf("This is the most you can lose") > h.indexOf("Show me what fits")) throw new Error("pill after the action");
});

check("screen 2 warns when the budget exceeds the derived limit", () => {
  const h = renderToStaticMarkup(<WizardQuestions answers={{ risk: 9999, horizon: 45, priority: "big" }} setAnswers={() => {}} limits={limits} />);
  has(h, "over your own per-trade limit");
});

/* ---------------- screen 3 — two roads, never one ---------------- */

const bullCall = [{ side: 1, type: "call", strike: 100, qty: 1 }, { side: -1, type: "call", strike: 105, qty: 1 }];
const condor = [
  { side: 1, type: "put", strike: 90, qty: 1 }, { side: -1, type: "put", strike: 95, qty: 1 },
  { side: -1, type: "call", strike: 105, qty: 1 }, { side: 1, type: "call", strike: 110, qty: 1 },
];
const ROADS = [
  { id: "a", ticker: "CORN", name: "Iron Condor", legs: condor, entryNet: -2, spot: 100, expKey: "2026-01-16",
    dte: 45, maxProfit: 200, maxLoss: -300, risk: 300, pop: 0.7, rr: 0.67, contracts: 1 },
  { id: "b", ticker: "CORN", name: "Bull Call Spread", legs: bullCall, entryNet: 2, spot: 100, expKey: "2026-01-16",
    dte: 45, maxProfit: 300, maxLoss: -200, risk: 200, pop: 0.4, rr: 1.5, contracts: 1 },
];

check("screen 3 shows two roads, never a single best", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={{ risk: 300 }} onPick={() => {}} />);
  has(h, "ROAD 1"); has(h, "ROAD 2");
  has(h, "Two ways to do this.");
  has(h, "Iron Condor"); has(h, "Bull Call Spread");
  if (h.toLowerCase().includes("best choice") || h.toLowerCase().includes("recommended")) {
    throw new Error("screen 3 is ranking rather than comparing");
  }
});

check("each road carries a band thumbnail and a takeaway", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={{ risk: 300 }} onPick={() => {}} />);
  // two SVG thumbnails, one per road, drawn from payoff()
  if ((h.match(/<svg/g) || []).length < 2) throw new Error("a road is missing its thumbnail");
  has(h, "makes money between");     // the condor's generated takeaway
  has(h, "makes money above");       // the spread's generated takeaway
});

check("each road names what it gives up, from the numbers", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={{ risk: 300 }} onPick={() => {}} />);
  has(h, "Gives up");
  // the condor gives up the size of the win; the spread gives up how often
  has(h, "the size of the win");
  has(h, "how often it works");
});

check("a road never gives up everything: 'nothing measurable' means a real tie", () => {
  // If a road is worse on every axis it is not a road, and the wizard must not
  // reach screen 3 with it (App.jsx drops dominated candidates). The sentence
  // still has to be honest about the case where the two genuinely tie.
  const tie = { ...ROADS[1], id: "c", pop: 0.4, maxProfit: 300, risk: 200 };
  has(tradeOffSentence(ROADS[1], tie), "Gives up nothing measurable");
  // and a dominated pairing names BOTH things it gives up, so it is visible
  const worse = { id: "d", pop: 0.1, maxProfit: 70, risk: 430 };
  const t = tradeOffSentence(worse, ROADS[1]);
  has(t, "how often it works"); has(t, "the size of the win");
});

check("counts are written in English, never '1 times in 10'", () => {
  has(tradeOffSentence({ pop: 0.1, maxProfit: 70, risk: 100 }, { pop: 0.5, maxProfit: 70, risk: 100 }), "1 time in 10");
  const h = renderToStaticMarkup(<WizardCandidates
    candidates={[{ ...ROADS[0], pop: 0.1 }, ROADS[1]]} answers={{ risk: 300 }} onPick={() => {}} />);
  if (h.includes("1 times in 10")) throw new Error("'1 times in 10' reached the screen");
  has(h, "1 time in 10");
});

check("the trade-off sentence is generated, not written per case", () => {
  const a = tradeOffSentence(ROADS[0], ROADS[1]);
  const b = tradeOffSentence(ROADS[1], ROADS[0]);
  has(a, "$200"); has(a, "$300");
  has(b, "about 4 times in 10 against 7");
  if (a === b) throw new Error("both roads give up the same thing");
  // symmetry: what one gives up, the other does not
  if (a.includes("how often it works")) throw new Error("the higher-probability road cannot give up probability");
});

/* ---------------- screen 4 — confirm ---------------- */

const CAPITAL = { tradingCapital: 5000, concurrentTarget: 4 };
const PAPER = { paperVerified: true, paperSource: "local simulation, no broker involved" };
const passResult = evaluateTrade({
  proposal: { intent: "open", ticker: "CORN", legs: bullCall, dte: 45, contracts: 1, maxLoss: -200, maxProfit: 300 },
  portfolio: { positions: [], account: PAPER }, capital: CAPITAL,
});
const blockedResult = evaluateTrade({
  proposal: { intent: "open", ticker: "CORN", legs: bullCall, dte: 45, contracts: 1, maxLoss: -900, maxProfit: 300 },
  portfolio: { positions: [], account: PAPER }, capital: CAPITAL,
});

check("screen 4 states the checks in plain English with real numbers", () => {
  const h = renderToStaticMarkup(
    <WizardConfirm candidate={ROADS[1]} preview={passResult} result={null} onConfirm={() => {}} onBack={() => {}} />);
  has(h, "The checks that run when you tap");
  has(h, "$200");                       // the real max loss
  has(h, "$250 per-trade limit");       // the real derived limit
  has(h, "45 days to expiration at entry");
  has(h, "Paper account confirmed");
  // and the checks are described, not just ticked
  has(h, "Every option sold is covered by one bought");
});

check("screen 4 states the exit plan as already decided", () => {
  const h = renderToStaticMarkup(
    <WizardConfirm candidate={ROADS[1]} preview={passResult} onConfirm={() => {}} onBack={() => {}} />);
  has(h, "Close at 50% of max gain, or at 21 days to expiration.");
  has(h, "decided now, not later");
  has(h, "not renegotiated while the position is open");
  for (const offered of ["Choose your exit", "Set a target", "Pick a stop"]) {
    if (h.includes(offered)) throw new Error(`screen 4 is offering the exit rather than stating it: ${offered}`);
  }
});

check("screen 4 offers the order until the gate has spoken, then reports the refusal", () => {
  const before = renderToStaticMarkup(
    <WizardConfirm candidate={ROADS[1]} preview={passResult} result={null} onConfirm={() => {}} onBack={() => {}} />);
  has(before, "Open this on paper");
  if (before.includes("Blocked by the risk gate")) throw new Error("refusing before the tap");

  const after = renderToStaticMarkup(
    <WizardConfirm candidate={{ ...ROADS[1], maxLoss: -900, risk: 900 }} preview={passResult}
      result={blockedResult} onConfirm={() => {}} onBack={() => {}} onDesk={() => {}} />);
  has(after, "The gate refused this");
  has(after, "Blocked by the risk gate");
  has(after, "your limit: 5%");   // the gate's own sentence, with its numbers
  has(after, "Open it on the bench and change it");
});

check("the checklist is read off the gate, never recomputed", () => {
  const rows = gateChecklist(blockedResult, { dte: 45 });
  const perTrade = rows.find((r) => r.id === "per-trade");
  const total = rows.find((r) => r.id === "total");
  if (perTrade.ok) throw new Error("a blocked per-trade limit still reads as passing");
  if (!total.ok) throw new Error("exposure was blocked when only the per-trade limit was");
  // every number in the row comes from the gate's own `limits`
  has(perTrade.text, "$900");
  has(perTrade.text, "$250");
});

check("the unified component is the visual on screen 4", () => {
  const h = renderToStaticMarkup(
    <WizardConfirm candidate={ROADS[1]} preview={passResult} onConfirm={() => {}} onBack={() => {}}
      bars={[{ open: 98, high: 101, low: 97, close: 100 }]} sigma={0.25} />);
  has(h, "What this looks like");
  has(h, "<svg");
  has(h, "CORN is at $100.00");   // the generated takeaway under the chart
});

check("screen 5 is a designed screen that states why and offers to notify", () => {
  const reasons = [
    { id: "signals", text: NOTHING_TODAY.signalsNotAligned({ tk: "UNG", confidence: 22 }) },
    { id: "expensive", text: NOTHING_TODAY.optionsExpensive("CORN", 84) },
  ];
  const h = renderToStaticMarkup(<NothingToday reasons={reasons} notified={false} hasPositions />);
  has(h, "Nothing today.");
  has(h, "Not a glitch");
  has(h, "do not agree on any market today");
  has(h, "expensive right now");
  has(h, "Notify me");
  if (h.toLowerCase().includes("error")) throw new Error("reads as an error state");
});

check("screen 5 does not pass a data failure off as a market verdict", () => {
  const h = renderToStaticMarkup(<NothingToday reasons={[{ id: "no-data", text: "prices did not load" }]} />);
  has(h, "because we could not see them");
  if (h.includes("worth your money right now")) throw new Error("claims a market judgement it did not make");
  // and the market-judgement wording is still used when it IS a judgement
  const h2 = renderToStaticMarkup(<NothingToday reasons={[{ id: "signals", text: "factors disagree" }]} />);
  has(h2, "worth your money right now");
});

check("screen 5 tells a one-road day apart from an empty board", () => {
  const h = renderToStaticMarkup(<NothingToday reasons={[{ id: "one-road", text: NOTHING_TODAY.onlyOneRoad(250) }]} />);
  has(h, "One structure fits, and one is not enough");
  has(h, "one answer is advice rather than teaching");
  if (h.includes("worth your money right now")) throw new Error("a one-road day is not an empty board");
  if (h.includes("because we could not see them")) throw new Error("a one-road day is not a data failure");
});

check("screen 5 acknowledges an existing notify subscription", () => {
  const h = renderToStaticMarkup(<NothingToday reasons={[{ id: "x", text: "because" }]} notified hasPositions={false} />);
  has(h, "You’ll hear from us.");
  if (h.includes(">Notify me<")) throw new Error("still offering to subscribe");
});

check("the refusal sentences carry the thresholds that caused them", () => {
  const s1 = NOTHING_TODAY.signalsNotAligned({ tk: "UNG", confidence: 22 });
  if (!s1.includes(String(RULES.lowConfidence))) throw new Error("no confidence floor in the sentence");
  const s2 = NOTHING_TODAY.optionsExpensive("CORN", 84);
  if (!s2.includes(String(RULES.expensiveIVRank))) throw new Error("no IV-rank threshold in the sentence");
});

console.log(ok.map((n) => "  ok   " + n).join("\n"));
if (bad.length) { console.log(bad.map(([n, e]) => "  FAIL " + n + " — " + e).join("\n")); }
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
