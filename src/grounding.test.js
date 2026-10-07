// Tests for src/grounding.js — a copilot number must exist in the app's figures (PR 62, owner 7 Oct 2026).
// Plain Node: `npm test` runs this file directly.
import assert from "node:assert/strict";
import { numbersIn, sentNumbers, figuresIn, ungroundedFigures } from "./grounding.js";
import { notInFiguresLine, copilotRulesBlock } from "./rules.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* A context shaped like the one Build sends (pro.jsx buildContext): the review rows with their shares, the size, figures. */
const CONTEXT = JSON.stringify({
  currentTicker: "GLD", spot: 378.4,
  currentStrategy: { legs: [{ side: 1, type: "put", strike: 382 }, { side: -1, type: "put", strike: 363 }], entry: 675, maxProfit: 1225, maxLoss: -675,
    breakevens: [375.25], greeks: { delta: -0.31, theta: 2, vega: -14 } },
  sizedByTheApp: { contracts: 7, riskDollars: 4725, perTradeLimit: 5000 },
  reviewChecklist: [{ check: "Per-trade cap", value: "$4,725 of $5,000", passed: true, shareOfLimit: "94%", nearLimit: true }],
  findCards: [{ label: "C1", ticker: "GLD", chance: "47%", returnOnRisk: "181%", futureAvg: "+$929", pastYrs: "won 9 of 16 · avg +$310" }],
  list: [12, 130],
});
const SENT = { text: copilotRulesBlock(), context: CONTEXT };

test("FORMATTING IS IGNORED: '$4,725' is 4725, '29%' is 29 and 0.29, a sign is not a different figure", () => {
  assert.deepEqual(numbersIn("risk $4,725 · 29% · 1234.5"), [4725, 29, 1234.5]);
  assert.deepEqual(figuresIn("-$153 and −$4,725 and +12.5%").map((f) => [f.kind, f.value]), [["$", 153], ["$", 4725], ["%", 12.5]]);
  assert.deepEqual(ungroundedFigures("A chance of 29%.", { context: { pop: 0.2934 } }), [], "29% is the context's 0.29");
  assert.deepEqual(ungroundedFigures("It loses -$675 at worst.", SENT), [], "a loss written with its sign is the maxLoss");
});

test("A LIST IS NOT A THOUSANDS SEPARATOR: the context's [12, 130] is 12 and 130, never 12,130", () => {
  const ns = sentNumbers(SENT);
  assert.ok(ns.includes(12) && ns.includes(130) && !ns.includes(12130));
  assert.deepEqual(numbersIn("12,13,14"), [12, 13, 14]);
});

test("ONLY A ROUNDING TOLERANCE: half a unit of the last digit written, or of a round hundred or thousand", () => {
  assert.deepEqual(ungroundedFigures("You risk $4,725.", SENT), []);
  assert.deepEqual(ungroundedFigures("You risk about $4,700.", SENT), [], "$4,700 is $4,725 rounded to the hundred");
  assert.deepEqual(ungroundedFigures("You risk $4.7k.", SENT), []);
  assert.deepEqual(ungroundedFigures("You risk $4,726.", SENT), ["$4,726"], "a dollar off is not rounding");
  assert.deepEqual(ungroundedFigures("A chance of 47.4%.", SENT), ["47.4%"], "a decimal the app never printed");
  assert.deepEqual(ungroundedFigures("A chance of 47%.", SENT), []);
});

test("WHAT IT FINDS: a figure the app never sent, each once, in the order written", () => {
  const answer = "## Verdict\nDOUBTS. You risk $4,725, which is 94% of the per-trade cap. Your average is +$929 but it could lose $1,040 " +
    "and the chance is 52%. Again: $1,040.";
  assert.deepEqual(ungroundedFigures(answer, SENT), ["$1,040", "52%"]);
  assert.equal(notInFiguresLine(["$1,040", "52%"]), "Not in the app's figures: $1,040, 52%.");
  assert.equal(notInFiguresLine([]), null, "every figure found: nothing is printed");
});

test("STRIKES, DATES AND PLAIN COUNTS ARE NOT LOOKED AT; 'per $100' is a unit; the rule numbers were sent", () => {
  const answer = "The $382/$363 put spread, the $380 put and the 395 call, 7 contracts, 44 days to 20 Nov 2026, 9 of 16 years, " +
    "+$12.5 per $100 at risk. The 5% per-trade rule and the 21-day exit.";
  assert.deepEqual(figuresIn(answer).map((f) => f.raw), ["+$12.5", "5%"], "only the per-$100 figure and the rule are figures");
  assert.deepEqual(ungroundedFigures(answer, { text: copilotRulesBlock(), context: { future: { per100: 12.5 } } }), []);
});

test("A CONTEXT THAT IS NOT JSON is read as text, and nothing sent means every figure is listed", () => {
  assert.deepEqual(ungroundedFigures("$5 and 10%", { context: "risk $5, chance 10%" }), []);
  assert.deepEqual(ungroundedFigures("$5 and 10%", { context: null }), ["$5", "10%"]);
  assert.deepEqual(ungroundedFigures("No figures at all.", SENT), []);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
