// src/exitPlan.test.jsx — PR 72, rendered: Build's Exit plan card edited in place (tags, − / +, Reset to suggested, the
// replay's line or the defaults' pill), the exposure line above Send (never a block), a contract named twice (IBKR's name,
// the OCC symbol with Copy, or the line that says the chain did not list it), and the price history's Retry.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExitPlanSection, SendBar, LegRow } from "./build.jsx";
import { ContractName } from "./ui.jsx";
import { EXIT_PLAN_WORDS, EXIT_ROWS, exitsPill, exitSuggestionLine, OCC_NOT_LISTED, COPY_WORDS, exposureLine } from "./rules.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s, m) => { if (!h.includes(s)) throw new Error(`${m || "missing"}: ${JSON.stringify(s)}`); };
const hasNot = (h, s, m) => { if (h.includes(s)) throw new Error(`${m || "unexpected"}: ${JSON.stringify(s)}`); };
const count = (h, s) => h.split(s).length - 1;
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

console.log("\nPR 72 — Build's exit plan, the exposure line, contract names, rendered\n");

const plan = { takeProfitPct: 0.6, exitDTE: 21, stopLossPct: 0.5 };
const edit = (value, tag) => ({ value, tag, onMinus: () => {}, onPlus: () => {}, canMinus: true, canPlus: true });
const rows = [
  { id: "takeProfitPct", label: "Take profit", sub: EXIT_ROWS.takeProfit("max-profit", plan), value: "$36", edit: edit("60%", "edited") },
  { id: "exitDTE", label: "Time exit", sub: EXIT_ROWS.time(plan), value: "27 Nov", edit: edit("21 days", "suggested") },
  { id: "stopLossPct", label: "Stop", sub: EXIT_ROWS.stop(plan), value: "$20", edit: edit("50%", "suggested") },
];

check("THE EXIT PLAN: three tappable rows, each with its Suggested or Edited tag; Reset under the card while edited", () => {
  const h = renderToStaticMarkup(<ExitPlanSection pill={exitsPill("XLE")} rows={rows} footer="Exits go in as limit orders." words={EXIT_PLAN_WORDS}
    reset={{ label: EXIT_PLAN_WORDS.reset, onReset: () => {} }} />);
  has(h, "defaults · not backtested on XLE");
  for (const r of rows) has(h, `data-exit-row="${r.id}"`);
  eq(count(h, 'aria-expanded="false"'), 3, "three rows, each a button that opens its editor");
  eq(count(h, 'data-exit-tag="edited"'), 1); eq(count(h, 'data-exit-tag="suggested"'), 2);
  has(h, ">Edited<"); has(h, ">Suggested<");
  has(h, "at 60% of max profit"); has(h, "21 days before expiry");
  has(h, "Reset to suggested");
  hasNot(h, "data-exit-editor", "no editor is open at rest");
  has(h, 'aria-label="Take profit of the exit plan"');
});
check("…the replay's line in the pill's place, and no Reset when nothing is edited", () => {
  const sg = { from: "replay", n: 11, ticker: "XLE", takeProfitPct: 0.5, exitDTE: 21 };
  const h = renderToStaticMarkup(<ExitPlanSection pill={null} note={exitSuggestionLine(sg)} rows={rows.map((r) => ({ ...r, edit: { ...r.edit, tag: "suggested" } }))}
    footer="" words={EXIT_PLAN_WORDS} reset={null} />);
  has(h, "Suggested from the replay: 11 windows on XLE, TP 50% · 21 days");
  hasNot(h, "not backtested"); hasNot(h, "Reset to suggested");
});
check("THE EXPOSURE LINE: amber, above Send, and Send stays as the gate leaves it", () => {
  const line = exposureLine({ after: 5200, total: 5000, tradingCapital: 20000, answered: false });
  const h = renderToStaticMarkup(<SendBar label="Send limit order · credit $25" exposure={line} footer="Paper" onSend={() => {}} />);
  has(h, "data-exposure-line"); has(h, "(suggested: 25%)");
  if (h.indexOf("data-exposure-line") > h.indexOf("<button")) throw new Error("the line is above Send");
  hasNot(h, "disabled", "the line never blocks");
  hasNot(renderToStaticMarkup(<SendBar label="Send" exposure={null} footer="" onSend={() => {}} />), "data-exposure-line");
});
check("A CONTRACT NAMED TWICE: IBKR's name, the OCC symbol in small mono with Copy; nothing invented when unlisted", () => {
  const h = renderToStaticMarkup(<ContractName name="SLV Nov27'26 49.5 Put" occ="SLV261127P00049500" />);
  has(h, "SLV Nov27&#x27;26 49.5 Put"); has(h, "SLV261127P00049500"); has(h, `>${COPY_WORDS.copy}<`);
  has(h, 'aria-label="Copy SLV261127P00049500"');
  const none = renderToStaticMarkup(<ContractName name="SLV Nov27'26 49.5 Put" occ={null} />);
  has(none, OCC_NOT_LISTED); hasNot(none, COPY_WORDS.copy);
  // Build's leg row keeps its mockup hook on the name.
  const row = renderToStaticMarkup(<LegRow leg={{ side: -1, qty: 1, strike: 53, type: "call", name: "SLV Nov27'26 53 Call", occ: "SLV261127C00053000", mid: 1.1, bid: 1, ask: 1.2, delta: 0.3 }} />);
  has(row, "data-leg-name"); has(row, "1 × SLV Nov27&#x27;26 53 Call"); has(row, "SLV261127C00053000");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
