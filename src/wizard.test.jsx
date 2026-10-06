import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { CapitalOnboarding, statusLine, gateChecklist } from "./wizard.jsx";
import { BottomBar } from "./navBar.jsx";
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

check("ROUND 2 (owner, 5 Oct 2026): THE APP OPENS ON FIND — Home is no longer a screen, a first run still asks the two questions first", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  if (/WizardOpen/.test(app)) throw new Error("App.jsx still draws Home");
  if (!/const \[view, setView\] = useState\("desk"\);/.test(app)) throw new Error("the app does not start on the desk");
  if (!/const \[step, setStep\] = useState\(FIRST_STEP\);/.test(app)) throw new Error("the first step is not Find");
  if (!/setStore\(st\); await saveState\(st\); goStep\("find"\);/.test(app)) throw new Error("onboarding does not land on Find");
  if (/← Home|> Home</.test(app)) throw new Error("a Home link is left");
});

check("ROUND 2: WHAT HOME SAID MOVES TO THE POSITIONS BADGE — its spoken name is statusLine()", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  if (!/badgeLabel=\{statusLine\(\{ positions: ownedPositions, attention: nAttention, looks: attn\.looks, closing: attn\.closesWorking \}\)\}/.test(app)) throw new Error("the badge does not read statusLine()");
  const h = renderToStaticMarkup(<BottomBar current="find" badge={1} badgeLabel={statusLine({ positions: [1, 2], attention: 1 })} />);
  has(h, "Positions: 1 of your 2 positions needs a decision today.");
  has(renderToStaticMarkup(<BottomBar current="find" badge={0} />), 'aria-label="Positions"');
});

check("0f — a close already working is counted as one, never as a decision (PR #47)", () => {
  const l = statusLine({ positions: [1, 2], attention: 0, looks: 0, closing: 1 });
  if (!/1 close working/.test(l) || /decision today/.test(l)) throw new Error(l);
  const both = statusLine({ positions: [1, 2], attention: 1, looks: 1, closing: 1 });
  if (!/1 of your 2 positions needs a decision today\. 1 close working\./.test(both)) throw new Error(both);
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

/* REDESIGN PR 3 (TASK 0b, owner's go): `ConfirmSteps` is gone — nothing mounted it since Build's review sheet (PR 2). Its
   checks are `gateChecklist()`'s, which the review sheet reads, and they are held here; the exit plan stated as decided,
   the refusal after the gate and the chart are held by build.test.jsx ("THE EXIT PLAN AND SEND", "THE REVIEW SHEET") and
   visuals.test.jsx. */
check("the gate's checks are stated in plain English with real numbers (the rows the review sheet reads)", () => {
  const h = gateChecklist(passResult, { dte: 45 }).map((r) => r.text).join(" ");
  has(h, "$200");                       // the real max loss
  has(h, "$250 per-trade limit");       // the real derived limit
  has(h, "45 days to expiration at entry");
  has(h, "Paper account confirmed");
  // and the checks are described, not just ticked
  has(h, "Every option sold is covered by one bought");
});

check("an unpriceable trade is NOT ticked as a worst case you can read", () => {
  // The BOIL butterfly: a maximum loss of about zero is one the app could not
  // compute, and the row must say that rather than printing $0 next to a tick.
  // The sentence is the gate's own — this file never writes a rule.
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
  if (rows.some((r) => /-\$0/.test(r.text))) throw new Error("a row printed -$0");
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

console.log(ok.map((n) => "  ok   " + n).join("\n"));
if (bad.length) { console.log(bad.map(([n, e]) => "  FAIL " + n + " — " + e).join("\n")); }
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
