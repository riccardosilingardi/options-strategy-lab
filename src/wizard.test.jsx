import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalOnboarding, WizardOpen, FindOpportunities, WizardCandidates, ConfirmSteps, NothingToday, statusLine, tradeOffSentence, roadHeadline, gateChecklist } from "./wizard.jsx";
import { evaluateTrade } from "./riskGate.js";
import { WhyThisTrade } from "./why.jsx";
import { Markdown, sseDeltas, gatewayPageMessage } from "./pro.jsx";
import { sizing, NOTHING_TODAY, RULES } from "./rules.js";
import { DRIVER_PRESETS, normaliseWeights, presetOf, rankByDrivers, verdictNarrative } from "./signals.js";

const UNIVERSE = [
  { tk: "CORN", name: "Corn" }, { tk: "UNG", name: "US Natural Gas" }, { tk: "SOYB", name: "Soybeans" },
  { tk: "BOIL", name: "2x Natural Gas" }, { tk: "WEAT", name: "Wheat" },
];
const ALL = UNIVERSE.map((u) => u.tk);
/** The answers a user has actually given: nothing here is a default. */
const ANSWERED = { basket: ALL, risk: 250, horizon: 45, weights: DRIVER_PRESETS.balanced };

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

/* ---- THE COPILOT'S ANSWER IS RENDERED, NOT PRINTED ---- */

check("the copilot's markdown is rendered, never shown as source", () => {
  // This is the shape the model actually returns, taken from a live run that
  // reached the screen as `## 1. STRUCTURE`, `**Ticker:**` and a wall of pipes.
  const real = [
    "---", "", "## 1. STRUCTURE", "",
    "**Ticker:** UNG | Spot: **$10.58**", "",
    "| Leg | Side | Strike |", "|-----|------|--------|", "| Long put | +1 | $10.00 |", "",
    "- The $10.00/$10.50 put spread is a **short bull put spread**",
    "- The $10.50/$11.50 call spread is a long call spread", "",
    "```", "Max Profit: $58", "```", "",
    "1. First step", "2. Second step",
  ].join("\n");
  const h = renderToStaticMarkup(<Markdown text={real} />);
  for (const raw of ["##", "**", "|---", "```"]) {
    if (h.includes(raw)) throw new Error(`markdown source ${JSON.stringify(raw)} reached the screen`);
  }
  for (const tag of ["<table", "<ul", "<ol", "<b ", "<hr"]) has(h, tag);
  has(h, "STRUCTURE");
  // the heading keeps its words and loses its numbering
  if (h.includes(">1. STRUCTURE<")) throw new Error("the heading kept its numbering");
});

check("an empty or absent answer renders nothing rather than crashing", () => {
  if (renderToStaticMarkup(<Markdown text="" />) !== "") throw new Error("empty text should render nothing");
  if (renderToStaticMarkup(<Markdown text={null} />) !== "") throw new Error("null text should render nothing");
});

/* ---- THE COPILOT STREAMS, SO A GATEWAY CANNOT TIME IT OUT ---- */

const delta = (t) => `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`;

check("the stream parser pulls the text out of Anthropic's frames", () => {
  const buf = `event: message_start\ndata: {"type":"message_start"}\n\n` + delta("Hello ") + delta("world.");
  const { text, rest } = sseDeltas(buf);
  if (text !== "Hello world.") throw new Error(`assembled ${JSON.stringify(text)}`);
  if (rest !== "") throw new Error("a complete buffer should leave no tail");
});

check("a delta split across two network reads is not dropped", () => {
  // The whole reason the parser keeps a tail: TCP does not respect frame
  // boundaries, and half a delta thrown away is text silently missing.
  const whole = delta("Hello ") + delta("world.");
  const cut = 30;
  const first = sseDeltas(whole.slice(0, cut));
  const second = sseDeltas(first.rest + whole.slice(cut));
  if (first.text + second.text !== "Hello world.") {
    throw new Error(`split read lost text: ${JSON.stringify(first.text + second.text)}`);
  }
});

check("a finished message is told apart from a stream that just stops", () => {
  // Without this the app cannot know the difference, and half an analysis gets
  // filed in the Journal as a whole one.
  const cut = sseDeltas(delta("Half a thought"));
  if (cut.stopped) throw new Error("a stream with no message_stop was read as finished");
  const whole = sseDeltas(delta("A whole thought.") + `event: message_stop\ndata: {"type":"message_stop"}\n\n`);
  if (!whole.stopped) throw new Error("message_stop was not noticed");
  if (whole.text !== "A whole thought.") throw new Error("the text was mangled by the stop frame");
});

check("an error frame stops the stream instead of being ignored", () => {
  const buf = `event: error\ndata: ${JSON.stringify({ type: "error", error: { message: "overloaded" } })}\n\n`;
  let threw = null;
  try { sseDeltas(buf); } catch (e) { threw = e; }
  if (!threw) throw new Error("an error frame passed silently");
  has(threw.message, "overloaded");
});

check("a gateway page is reported as a timeout, never dumped as markup", () => {
  // Exactly what came back from the live site when an analysis ran long.
  const page = '<HTML> <HEAD> <TITLE>Inactivity Timeout</TITLE> </HEAD> <BODY BGCOLOR="white">'
    + '<H1>Inactivity Timeout</H1><B>Description: Too much time has passed without sending any data for document.</B></BODY></HTML>';
  const m = gatewayPageMessage(page);
  if (!m) throw new Error("an HTML gateway page was not recognised");
  if (/<HTML|<BODY|BGCOLOR|<H1/i.test(m)) throw new Error("the markup reached the message");
  has(m, "Inactivity Timeout");          // the title names the cause, so it is kept
  has(m, "gateway answered with a web page");
  has(m, "timeout on a long analysis");
});

check("a real JSON error is left alone for the API's own sentence", () => {
  if (gatewayPageMessage('{"error":{"message":"invalid x-api-key"}}') !== null) {
    throw new Error("a JSON error body was mistaken for a gateway page");
  }
});

/* ---- THE EVIDENCE TOGGLE NAMES WHAT IT OPENS ---- */

check("the 'why this trade' toggle names the four readings behind it", () => {
  const fused = {
    ticker: "CORN", score: 30, confidence: 60, agreement: "MIXED", narrative: "CORN scores +30.",
    components: {
      seasonal: { dir: 1, strength: 50, why: "s" }, technical: { dir: 1, strength: 40, why: "t" },
      weather: { dir: 0, strength: 10, why: "w" }, news: { dir: 1, strength: 20, why: "n" },
    },
  };
  const h = renderToStaticMarkup(<WhyThisTrade fused={fused} />);
  // "show detail" was a door with no sign on it and nobody opened it.
  if (/show detail/i.test(h)) throw new Error("the toggle still hides what it opens behind the word 'detail'");
  has(h, "Show the four readings:");
  for (const label of ["Seasonality", "Price trend", "Weather", "News flow"]) has(h, label);
});

/* ---- THE CAPITAL MODEL: asked, never assumed (PRD §3) ---- */

check("onboarding does not pre-answer either question", () => {
  const h = renderToStaticMarkup(<CapitalOnboarding onDone={() => {}} />);
  // Empty fields, and a button that names what is still missing rather than
  // being a locked door with no sign on it.
  has(h, "Still needed: how much you are trading with");
  if (/value="5000"/.test(h)) throw new Error("the capital field pre-filled itself with the suggestion");
  // The suggestion is on screen, visibly a suggestion the user can accept.
  has(h, "No idea? Start from $5,000");
});

check("an unanswered capital question is labelled a suggestion, never a limit", () => {
  const open = sizing({});
  if (open.answered) throw new Error("nothing was answered, so nothing is answered");
  const h = renderToStaticMarkup(<CapitalOnboarding onDone={() => {}} />);
  has(h, "WHAT THE ANSWERS WOULD GIVE YOU");
  if (h.includes(">YOUR LIMITS<")) throw new Error("a figure nobody chose was labelled YOUR LIMITS");
});

check("both answers given makes the same figures his", () => {
  const h = renderToStaticMarkup(<CapitalOnboarding initial={{ capital: 5000, concurrentTarget: 4 }} onDone={() => {}} />);
  has(h, "YOUR LIMITS");
  has(h, "Start");
  if (h.includes("Still needed")) throw new Error("both questions are answered; nothing is missing");
});

check("the wizard's budget step reads the capital model, and says whose it is", () => {
  const open = sizing({});
  const h = renderToStaticMarkup(
    <FindOpportunities answers={{ ...ANSWERED, risk: null, horizon: null }} setAnswers={() => {}}
      limits={open} universe={UNIVERSE} />);
  has(h, "The suggested limit works out at");
  has(h, "not from anything you chose");
  const mine = sizing({ tradingCapital: 5000, concurrentTarget: 4 });
  const h2 = renderToStaticMarkup(
    <FindOpportunities answers={ANSWERED} setAnswers={() => {}} limits={mine} universe={UNIVERSE} />);
  has(h2, "Your limit works out at");
  if (h2.includes("not from anything you chose")) throw new Error("he answered; stop calling it a suggestion");
});

check("screen 1 offers TWO doors, and 'decide for me' is not one of them", () => {
  const h = renderToStaticMarkup(<WizardOpen positions={[]} posAlerts={[]} attention={0} />);
  has(h, "My positions"); has(h, "Find opportunities");
  has(h, "Nothing to manage");
  // Three doors was the wrong structure: a door that skips the questions can
  // only skip them by inventing the answers.
  if (h.includes("Decide for me")) throw new Error("the third door is still on screen 1");
});

check("screen 1 leads with what needs attention once positions exist", () => {
  const pos = [{ id: 1, ticker: "CORN", name: "Bull Call Spread" }];
  const alerts = [{ p: pos[0], pnl: -42, dteLeft: 30, level: "action", label: "21 days left — close or roll" }];
  const h = renderToStaticMarkup(<WizardOpen positions={pos} posAlerts={alerts} attention={1} />);
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

check("screen 2 is one screen with three steps and no Greeks", () => {
  const h = renderToStaticMarkup(<FindOpportunities answers={ANSWERED} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(h, "STEP 1 OF 3"); has(h, "STEP 2 OF 3"); has(h, "STEP 3 OF 3");
  has(h, "Which markets should it look at?");
  has(h, "How much, and for how long?");
  has(h, "What should it weigh most?");
  for (const banned of ["delta", "Delta", "implied volatility", "Greek", "vega", "theta", "IV "]) {
    if (h.includes(banned)) throw new Error(`screen 2 mentions "${banned}"`);
  }
});

check("the basket holds all five markets by default, and can still be emptied", () => {
  const unset = renderToStaticMarkup(<FindOpportunities answers={{ ...ANSWERED, basket: undefined }} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  for (const u of UNIVERSE) has(unset, u.tk);
  if (unset.includes("Nothing is selected")) throw new Error("an unset basket read as an empty one");
  // ...and an empty basket stays empty rather than quietly re-selecting the lot,
  // or the last chip could never be switched off
  const empty = renderToStaticMarkup(<FindOpportunities answers={{ ...ANSWERED, basket: [] }} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(empty, "Nothing is selected");
  has(empty, "at least one market");
});

check("FAULT A — nothing is pre-answered, and the button says what is missing", () => {
  const blank = { basket: ALL, risk: null, horizon: null, weights: DRIVER_PRESETS.balanced };
  const h = renderToStaticMarkup(<FindOpportunities answers={blank} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(h, "Still missing");
  has(h, "how much you are willing to lose");
  has(h, "how long to give it");
  has(h, "disabled=\"\"");
  // and no invented figure anywhere on the screen
  if (/\$250(?!\s*per-trade)/.test(h.replace(/\$250 per trade/g, ""))) {
    // the derived LIMIT may legitimately be $250; an ANSWER of $250 may not
    if (h.includes("value=\"250\"")) throw new Error("the budget field was pre-filled");
  }
});

check("the button unlocks once every question has a real answer", () => {
  const h = renderToStaticMarkup(<FindOpportunities answers={ANSWERED} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(h, "Decide for me");
  if (h.includes("Still missing")) throw new Error("complete answers still read as missing");
  if (/Decide for me[\s\S]{0,200}disabled/.test(h)) throw new Error("the button is still locked");
});

check("screen 2 pill precedes the budget choice", () => {
  const h = renderToStaticMarkup(<FindOpportunities answers={ANSWERED} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(h, "This is the most you can lose");
  if (h.indexOf("This is the most you can lose") > h.indexOf("Decide for me")) throw new Error("pill after the action");
});

check("screen 2 warns when the budget exceeds the derived limit", () => {
  const h = renderToStaticMarkup(<FindOpportunities answers={{ ...ANSWERED, risk: 9999 }} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  has(h, "over your own per-trade limit");
});

/* ---------------- the three drivers ---------------- */

check("FAULT C — the presets SET the sliders rather than replacing them", () => {
  const h = renderToStaticMarkup(<FindOpportunities answers={{ ...ANSWERED, weights: DRIVER_PRESETS.often }} setAnswers={() => {}} limits={limits} universe={UNIVERSE} />);
  // the three words are still offered...
  has(h, "Win often"); has(h, "Balanced"); has(h, "Win big");
  // ...and the numbers they mean are on screen next to them
  has(h, "How often it works");
  has(h, "How much it pays");
  has(h, "How little it ties up");
  has(h, String(DRIVER_PRESETS.often.chance));
  has(h, "=  100");
  // three real sliders, not three buttons pretending
  if ((h.match(/type="range"/g) || []).length !== 3) throw new Error("the sliders are not sliders");
});

check("the three weights always sum to 100, whichever one is dragged", () => {
  const sum = (w) => w.chance + w.profit + w.budget;
  for (const v of [0, 5, 40, 95, 100]) {
    const w = normaliseWeights({ chance: v, profit: 33, budget: 33 }, "chance");
    if (w.chance !== v) throw new Error(`the dragged slider moved: asked ${v}, got ${w.chance}`);
    if (sum(w) !== 100) throw new Error(`weights sum to ${sum(w)} after dragging to ${v}`);
  }
  if (sum(normaliseWeights({ chance: 0, profit: 0, budget: 0 })) !== 100) throw new Error("zeroes do not normalise");
  for (const id of ["often", "balanced", "big"]) {
    if (presetOf(DRIVER_PRESETS[id]) !== id) throw new Error(`${id} does not round-trip through presetOf`);
  }
  if (presetOf({ chance: 50, profit: 25, budget: 25 })) throw new Error("a hand-set dial still reads as a preset");
});

check("the weights actually reorder the candidates", () => {
  const pool = [
    { id: "safe", pop: 0.8, rr: 0.4, risk: 300 },
    { id: "big", pop: 0.3, rr: 3.0, risk: 300 },
    { id: "cheap", pop: 0.5, rr: 1.0, risk: 80 },
  ];
  const often = rankByDrivers(pool, DRIVER_PRESETS.often)[0].id;
  const big = rankByDrivers(pool, DRIVER_PRESETS.big)[0].id;
  const thrifty = rankByDrivers(pool, { chance: 10, profit: 10, budget: 80 })[0].id;
  if (often !== "safe") throw new Error(`"win often" picked ${often}`);
  if (big !== "big") throw new Error(`"win big" picked ${big}`);
  if (thrifty !== "cheap") throw new Error(`a budget-weighted dial picked ${thrifty}`);
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
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
  has(h, "ROAD 1"); has(h, "ROAD 2");
  has(h, "Two ways to do this.");
  has(h, "Iron Condor"); has(h, "Bull Call Spread");
  if (h.toLowerCase().includes("best choice") || h.toLowerCase().includes("recommended")) {
    throw new Error("screen 3 is ranking rather than comparing");
  }
});

check("each road carries a band thumbnail, a gauge and a takeaway", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
  // two visuals per road now: the thumbnail and the gauge
  if ((h.match(/<svg/g) || []).length < 4) throw new Error("a road is missing a visual");
  if (!/<path/.test(h)) throw new Error("no gauge arc: the gauge is not on the road");
  has(h, "makes money between");     // the condor's generated takeaway
  has(h, "makes money above");       // the spread's generated takeaway
});

check("FAULT D — the thumbnail carries the underlying's price line over the bands", () => {
  const bars = [96, 98, 97, 101, 103, 100].map((c) => ({ open: c, high: c + 1, low: c - 1, close: c }));
  const withBars = renderToStaticMarkup(
    <WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} barsFor={() => bars} />);
  // a multi-point path with the history's own vertices, not just the gauge arcs
  const paths = [...withBars.matchAll(/<path d="(M[^"]+)"/g)].map((m) => m[1]);
  if (!paths.some((d) => (d.match(/L/g) || []).length >= bars.length - 1)) {
    throw new Error("no price line drawn across the bands");
  }
  // and with no history it still draws something rather than bare bars
  const none = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
  if (!/stroke-dasharray="2 3"/.test(none)) throw new Error("no fallback price line when history is missing");
});

check("FAULT B — each road carries the evidence, with the factor bars open", () => {
  const fused = {
    ticker: "CORN", score: 42, confidence: 78, agreement: "CONFLUENT", reinforced: false,
    narrative: "CORN: 3 of the 4 factors point higher together, giving a score of +42 out of 100 at 78/100 confidence",
    components: {
      seasonal: { dir: 1, strength: 52, why: "September has averaged +1.3% for CORN historically", arrow: "\u2191" },
      technical: { dir: 1, strength: 40, why: "price above both moving averages", arrow: "\u2191" },
      weather: { dir: 1, strength: 61, why: "2 of 3 regions affecting CORN point up", arrow: "\u2191", regions: [] },
      news: { dir: 0, strength: 8, why: "none of the 12 headlines read tag CORN", arrow: "\u2248", counts: { up: 0, down: 0, ambiguous: 0, geo: 0 } },
    },
  };
  const h = renderToStaticMarkup(
    <WizardCandidates candidates={[{ ...ROADS[0], fused }, ROADS[1]]} answers={ANSWERED} onPick={() => {}}
      weatherData={{}} newsItems={[]} month={8} />);
  has(h, "WHY THIS MARKET");
  has(h, "CONFLUENT");                       // the agreement badge
  has(h, "78 / 100");                        // the confidence, in numbers
  has(h, "Seasonality"); has(h, "Price trend"); has(h, "Weather"); has(h, "News flow");
  has(h, "61/100");                          // a factor's strength, as a bar
  // the drill-through to the regions and the headlines is offered, not buried
  has(h, "regions?"); has(h, "headlines?");
});

check("FAULT D — two roads may come from two different markets", () => {
  const mixed = [ROADS[0], { ...ROADS[1], ticker: "UNG" }];
  const h = renderToStaticMarkup(<WizardCandidates candidates={mixed} answers={ANSWERED} onPick={() => {}} />);
  has(h, "In 2 different markets.");
  has(h, "CORN"); has(h, "UNG");
});

check("the verdict opens with what was actually examined", () => {
  const narrative = verdictNarrative({
    basket: ALL,
    examined: [{ tk: "CORN", fused: { components: { seasonal: { mean: -1.1 } } } }],
    newsItems: [
      { title: "China export restriction after sanctions", date: new Date().toISOString(), geo: true },
      { title: "Drought scorching the Corn Belt", date: new Date().toISOString() },
    ],
    weatherData: { cornbelt: { tmax: Array(14).fill(35), prec: Array(14).fill(0) } },
    month: 8, weights: DRIVER_PRESETS.big,
    chosen: [{ ticker: "CORN", name: "Bull Call Spread", drivers: { chance: 0.5, profit: 0.9, budget: 0.3 } }],
  });
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} narrative={narrative} onPick={() => {}} />);
  has(h, "What I looked at");
  has(h, "2 headlines");            // the real count
  has(h, "geopolitical");           // and how many of them were
  has(h, "September");              // seasonality for THIS month
  has(h, "own September norm");     // the anomalous region, against its own norm
  has(h, "out of 100.");            // the weights, and how they tipped it
  // a narrative without numbers is a failure (PRD §7)
  if (!/\d/.test(narrative.join(" "))) throw new Error("the narrative carries no numbers");
});

check("the narrative never calls an unconvincing market an unreadable one", () => {
  // "We could not see it" and "we looked and it did not qualify" are different
  // answers, and writing them as the same sentence is the same failure the
  // "nothing today" screen exists to avoid, pointing the other way.
  const paras = verdictNarrative({
    basket: ["CORN", "UNG", "SOYB", "WEAT"],
    examined: [{ tk: "CORN", fused: { components: { seasonal: { mean: -1.1 } } } }],
    excluded: [{ tk: "UNG", reason: "signals" }, { tk: "SOYB", reason: "expensive" }, { tk: "WEAT", reason: "nodata" }],
    month: 8, chosen: [],
  });
  const first = paras[0];
  has(first, "On UNG the four factors contradicted each other");
  has(first, "SOYB is priced richly");
  has(first, "WEAT had no prices we could read");
  // the clause about UNG must not borrow the missing-data wording
  const ungClause = first.split(";").find((c) => c.includes("UNG"));
  if (/could not (see|read) (it|them)|no prices/.test(ungClause)) {
    throw new Error(`a market we read is described as unreadable: ${ungClause}`);
  }
  // and with nothing excluded it does not invent an exclusion
  const clean = verdictNarrative({ basket: ["CORN"], examined: [{ tk: "CORN", fused: {} }], month: 8, chosen: [] });
  has(clean[0], "All 1 came through to the shortlist.");
});

check("FAULT A — the verdict reads the answers back, with a way to change them", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
  has(h, "What you told it");
  has(h, "$250");                        // the budget the user actually gave
  has(h, "CORN \u00b7 UNG");                 // the basket they actually picked
  has(h, ">change<");
  // and it never claims an answer nobody gave
  const blank = renderToStaticMarkup(
    <WizardCandidates candidates={ROADS} answers={{ basket: [], risk: null, horizon: null }} onPick={() => {}} />);
  if (/you said you were willing to lose/.test(blank)) throw new Error("quoting an answer the user never gave");
  has(blank, "\u2014");
});

check("a road leads with what it gives and costs, not with the frequency", () => {
  const line = roadHeadline(ROADS[1]);
  has(line, "Pays up to $300");
  has(line, "for $200 at risk");
  has(line, "4 times in 10");
  // the payout and the frequency are ONE sentence, and the frequency is not first
  if (line.indexOf("times in 10") < line.indexOf("Pays up to")) throw new Error("the frequency still leads");
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
  const road2 = h.slice(h.indexOf("ROAD 2"));
  if (road2.indexOf("times in 10") < road2.indexOf("Pays up to")) throw new Error("the card still leads with the odds");
});

check("each road names what it gives up, from the numbers", () => {
  const h = renderToStaticMarkup(<WizardCandidates candidates={ROADS} answers={ANSWERED} onPick={() => {}} />);
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
    candidates={[{ ...ROADS[0], pop: 0.1 }, ROADS[1]]} answers={ANSWERED} onPick={() => {}} />);
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

check("the confirm step states the checks in plain English with real numbers", () => {
  const h = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={passResult} result={null} onConfirm={() => {}} onBack={() => {}} />);
  has(h, "The checks that run when you tap");
  has(h, "$200");                       // the real max loss
  has(h, "$250 per-trade limit");       // the real derived limit
  has(h, "45 days to expiration at entry");
  has(h, "Paper account confirmed");
  // and the checks are described, not just ticked
  has(h, "Every option sold is covered by one bought");
});

check("the confirm step states the exit plan as already decided", () => {
  const h = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={passResult} onConfirm={() => {}} onBack={() => {}} />);
  has(h, "Close at 50% of max gain, or at 21 days to expiration.");
  has(h, "decided now, not later");
  has(h, "not renegotiated while the position is open");
  for (const offered of ["Choose your exit", "Set a target", "Pick a stop"]) {
    if (h.includes(offered)) throw new Error(`the confirm step is offering the exit rather than stating it: ${offered}`);
  }
});

check("the confirm step offers the order until the gate has spoken, then reports the refusal", () => {
  const before = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={passResult} result={null} onConfirm={() => {}} onBack={() => {}} />);
  has(before, "Open this on paper");
  if (before.includes("Blocked by the risk gate")) throw new Error("refusing before the tap");

  const after = renderToStaticMarkup(
    <ConfirmSteps candidate={{ ...ROADS[1], maxLoss: -900, risk: 900 }} preview={passResult}
      result={blockedResult} onConfirm={() => {}} onBack={() => {}} onDesk={() => {}} />);
  has(after, "The gate refused this");
  has(after, "Blocked by the risk gate");
  has(after, "your limit: 5%");   // the gate's own sentence, with its numbers
  has(after, "Change the trade above and try again");
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

check("the confirm step can carry the unified component as its visual", () => {
  const h = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={passResult} onConfirm={() => {}} onBack={() => {}}
      bars={[{ open: 98, high: 101, low: 97, close: 100 }]} sigma={0.25} />);
  has(h, "What this looks like");
  has(h, "<svg");
  has(h, "CORN is at $100.00");   // the generated takeaway under the chart
});

check("on Build the confirm step drops the chart and the heading it would duplicate", () => {
  // The Build screen already shows the trade's name and its charts above. The
  // block there is the CHECKS, the exit plan and the button — nothing repeated.
  const h = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={passResult} heading={false} showFigure={false}
      onConfirm={() => {}} />);
  if (h.includes("What this looks like")) throw new Error("the chart is drawn twice on Build");
  if (h.includes(">Confirm<")) throw new Error("the heading is drawn twice on Build");
  has(h, "The checks that run when you tap");
  has(h, "decided now, not later");
  has(h, "Open this on paper");
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
