import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalOnboarding, WizardOpen, WizardQuestions, NothingToday, statusLine } from "./wizard.jsx";
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
