import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalOnboarding, WizardOpen, ConfirmSteps, statusLine, gateChecklist } from "./wizard.jsx";
import { evaluateTrade } from "./riskGate.js";
import { WhyThisTrade } from "./why.jsx";
import { Markdown, sseDeltas, gatewayPageMessage } from "./pro.jsx";
import { sizing, RULES } from "./rules.js";


const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasNot = (html, s) => { if (html.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };

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

check("THE LAST FRAME IS FLUSHED, so a complete answer is not reported as cut off", () => {
  // The bug: `sseDeltas` holds the trailing frame back on every read because
  // TCP does not respect frame boundaries — but on the LAST read there is no
  // next read to hand it to. Anthropic's closing message_stop does not always
  // arrive with a blank line after it, so the frame that says the answer
  // finished was discarded as partial. Every time.
  const noTrailingBlank = delta("A whole thought.")
    + `event: message_stop\ndata: {"type":"message_stop"}`;   // no \n\n at the end
  const streaming = sseDeltas(noTrailingBlank);
  if (streaming.stopped) throw new Error("mid-stream, an unterminated frame must still be held back");
  const flushed = sseDeltas(streaming.rest, { final: true });
  if (!flushed.stopped) throw new Error("the final flush did not see message_stop");
});

check("the final flush does not double-count text already read", () => {
  const whole = delta("Hello ") + delta("world.") + `event: message_stop\ndata: {"type":"message_stop"}`;
  const first = sseDeltas(whole);
  const tail = sseDeltas(first.rest, { final: true });
  if (first.text + tail.text !== "Hello world.") {
    throw new Error(`flush changed the text: ${JSON.stringify(first.text + tail.text)}`);
  }
});

check("RUNNING OUT OF ROOM IS NOT A DROPPED CONNECTION — stop_reason is read", () => {
  // message_delta carries stop_reason and was being ignored entirely, so an
  // answer cut at the token budget arrived WITH message_stop, was judged
  // complete, and was filed in the Journal as finished.
  const md = (reason) => `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: reason } })}\n\n`;
  const stop = `event: message_stop\ndata: {"type":"message_stop"}\n\n`;

  const truncated = sseDeltas(delta("Half an answer") + md("max_tokens") + stop);
  if (!truncated.stopped) throw new Error("message_stop was not seen");
  if (truncated.stopReason !== "max_tokens") throw new Error("stop_reason was not read");

  const finished = sseDeltas(delta("A whole answer.") + md("end_turn") + stop);
  if (finished.stopReason !== "end_turn") throw new Error("a normal ending is reported too");
  if (finished.stopReason === "max_tokens") throw new Error("a normal ending was called truncation");
});

check("a stream with no message_delta at all still reports no reason, not a wrong one", () => {
  const r = sseDeltas(delta("text") + `event: message_stop\ndata: {"type":"message_stop"}\n\n`);
  if (r.stopReason !== null) throw new Error("a reason was invented where none was sent");
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

check("screen 1 offers TWO doors, and 'decide for me' is not one of them", () => {
  const h = renderToStaticMarkup(<WizardOpen positions={[]} posAlerts={[]} attention={0} />);
  has(h, "My positions"); has(h, "Find a trade");
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
  has(h, "Find a trade");
  if (h.indexOf("Needs attention today") > h.indexOf("Find a trade")) throw new Error("attention must lead the page");
});

check("statusLine is generated, not hand-written per case", () => {
  const a = statusLine({ positions: [], attention: 0 });
  const b = statusLine({ positions: [1, 2, 3], attention: 2 });
  const c = statusLine({ positions: [1], attention: 0 });
  if (!b.includes("2 of your 3 positions")) throw new Error(b);
  if (!c.includes("1 position open")) throw new Error(c);
  if (!a.includes("No open positions")) throw new Error(a);
});

/* ---------------- the confirm step (Build) ---------------- */

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

check("an unpriceable trade is NOT ticked as a worst case you can read", () => {
  // The BOIL butterfly: a maximum loss of about zero is one the app could not
  // compute, and the confirm row must say that rather than printing $0 next to
  // a tick. The sentence is the gate's own — this screen never writes a rule.
  const unpriced = evaluateTrade({
    proposal: { intent: "open", ticker: "BOIL", legs: bullCall, dte: 45, contracts: 1, maxLoss: -1e-14, maxProfit: 37462 },
    portfolio: { positions: [], account: PAPER }, capital: CAPITAL,
  });
  const rows = gateChecklist(unpriced, { dte: 45 });
  const defined = rows.find((r) => r.id === "defined");
  if (defined.ok) throw new Error("a maximum loss of zero cannot be ticked");
  has(defined.text, "unpriced one");
  if (/The worst case is a number you can read/.test(defined.text)) {
    throw new Error("it is claiming to have read a number it could not read");
  }
  const h = renderToStaticMarkup(
    <ConfirmSteps candidate={ROADS[1]} preview={unpriced} result={null} onConfirm={() => {}} onBack={() => {}} />);
  if (/-\$0/.test(h)) throw new Error("the confirm step printed -$0");
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

check("THE GUIDED DOOR IS GONE: Home's second door goes straight to Find (PR #40)", () => {
  const h = renderToStaticMarkup(<WizardOpen positions={[]} posAlerts={[]} attention={0} />);
  hasNot(h, "Find opportunities");
  hasNot(h, "Nothing today");
  hasNot(h, "Open the full desk");
});

console.log(ok.map((n) => "  ok   " + n).join("\n"));
if (bad.length) { console.log(bad.map(([n, e]) => "  FAIL " + n + " — " + e).join("\n")); }
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
