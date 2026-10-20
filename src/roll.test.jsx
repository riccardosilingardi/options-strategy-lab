// PR 4b — Build's variants and a position's roll, rendered (no DOM library).
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { VariantsSection, AltRows, OptimizeSection } from "./build.jsx";
import { RollSection } from "./positionScreen.jsx";
import { ROLL_WHY, ROLL_HOW, ROLL_NONE, ROLL_PREPARE, VARIANT_LOAD, VARIANTS_NOTE, VARIANTS_NONE, rollLine, rollCloseFirst,
  OPTIMIZE_HEAD, OPTIMIZE_RUN, OPTIMIZE_CURRENT, OPTIMIZE_NONE_FIT, ROLL_JUDGE_NOTE, ROLL_NONE_SAFE, optimizeNote } from "./rules.js";
import { T } from "./theme.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); } catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (s, x, m) => { if (!s.includes(x)) throw new Error(`${m || "missing"}: "${x}"`); };
const hasNot = (s, x, m) => { if (s.includes(x)) throw new Error(`${m || "unexpected"}: "${x}"`); };
const row = (o) => ({ kind: "up", expKey: "2026-12-18", label: "Strikes one step higher", legsText: "+1 15C / −1 16C · 18 Dec 2026", n: 3,
  youRisk: 240, maxProfit: 60, unbounded: false, chance: "41%", rr: "25%", future: "-$12", past: "won 9 of 16 · avg +$40",
  gate: { pass: true, violations: [] }, gateText: "✓ The gate passes it at this size.", ...o });

console.log("\nPR 4b — Build's variants and a position's roll\n");

check("A VARIANT ROW PRINTS THE CARD'S FIGURES, THE FUTURE AND THE PAST, AND THE GATE'S LINE; a refusal is red", () => {
  const h = renderToStaticMarkup(<AltRows rows={[row(), row({ kind: "down", label: "Strikes one step lower", gate: { pass: false, violations: [{ message: "x" }] }, gateText: "✗ Over the limit." })]}
    action={VARIANT_LOAD} onPick={() => {}} />);
  for (const x of ["Strikes one step higher", "+1 15C / −1 16C · 18 Dec 2026", "YOU RISK $240", "MAX PROFIT $60", "CHANCE 41%", "RETURN ON RISK 25%",
    "Future avg -$12 · Past yrs won 9 of 16", "The gate passes it at this size.", "✗ Over the limit.", "Load ›"]) has(h, x);
  has(h, `color:${T.red}`, "a refusal is red (an error or refusal)");
});

check("BUILD'S VARIANTS: a section with its ⓘ; none listed says so, never an empty box", () => {
  const h = renderToStaticMarkup(<VariantsSection rows={[row()]} onLoad={() => {}} note={VARIANTS_NOTE} none={VARIANTS_NONE} />);
  has(h, "Variants of this trade"); has(h, "How they are made"); has(h, "data-build-variants");
  has(renderToStaticMarkup(<VariantsSection rows={[]} onLoad={() => {}} note={VARIANTS_NOTE} none={VARIANTS_NONE} />), "there is no variant to show");
});

check("ROLL IT: offered — its sentence, its ⓘ and its candidates; offered with no later board — the sentence why; turned — why not, no candidates", () => {
  const offered = renderToStaticMarkup(<RollSection r={{ ok: true, why: ROLL_WHY.ok, how: ROLL_HOW, rows: [row({ kind: "roll", label: "Same strikes" })], onPrepare: () => {} }} />);
  has(offered, "ROLL IT"); has(offered, "How a roll works"); has(offered, "Same strikes"); has(offered, ROLL_PREPARE);
  has(renderToStaticMarkup(<RollSection r={{ ok: true, why: ROLL_WHY.ok, how: ROLL_HOW, rows: [], onPrepare: () => {} }} />), "there is no roll to prepare");
  const turned = renderToStaticMarkup(<RollSection r={{ ok: false, why: ROLL_WHY.turned, how: ROLL_HOW, rows: [row()], onPrepare: () => {} }} />);
  has(turned, "the app offers no roll on a changed idea"); hasNot(turned, ROLL_PREPARE, "no candidate on a turned idea");
  if (renderToStaticMarkup(<RollSection r={null} />) !== "") throw new Error("no section when the screen hands none");
  if (!ROLL_NONE.includes("30–90")) throw new Error("the window is the rule's");
});

check("OPTIMIZE (PR 65): at rest one button and its ⓘ, nothing priced; after the tap the summary, where the trade sits, O1… rows", () => {
  const rest = renderToStaticMarkup(<OptimizeSection note={optimizeNote(2)} asked={false} onRun={() => {}} onLoad={() => {}} />);
  has(rest, OPTIMIZE_HEAD); has(rest, OPTIMIZE_RUN); has(rest, "How it searches"); has(rest, "data-build-optimize");
  hasNot(rest, "data-alt-rows", "it never runs on its own");
  const rows = [row({ kind: "optimize", label: "O1 · Same strikes", current: true, note: "44 days, held ~23 days (exit at 21 DTE) · future avg +4.2 per $100" }),
    row({ kind: "optimize", label: "O2 · One step higher", expKey: "2027-01-15", legsText: "+1 16C / −1 17C · 15 Jan 2027" })];
  const ran = renderToStaticMarkup(<OptimizeSection note={optimizeNote(2)} asked onRun={() => {}} onLoad={() => {}} rows={rows}
    summary="Checked 14 on 2 expiries, 44–72 days: 9 fit your request, 3 miss it, 2 fail a floor." place="Your trade is the best of the 9 that fit." />);
  for (const x of ["Checked 14 on 2 expiries", "Your trade is the best of the 9 that fit.", "O1 · Same strikes", "O2 · One step higher",
    OPTIMIZE_CURRENT, VARIANT_LOAD, "held ~23 days (exit at 21 DTE)", "data-alt-note"]) has(ran, x);
  hasNot(ran, OPTIMIZE_RUN, "the button gives way to its answer");
  // Nothing fits: the line, then the best that miss — quieter, the reason first.
  const miss = renderToStaticMarkup(<OptimizeSection note="" asked onRun={() => {}} onLoad={() => {}} none={OPTIMIZE_NONE_FIT} summary="Checked 2."
    rows={[row({ kind: "optimize", label: "O1 · Same strikes", miss: true, note: "Misses: over budget by $40 · 44 days" })]} />);
  has(miss, OPTIMIZE_NONE_FIT); has(miss, "data-alt-miss"); has(miss, "Misses: over budget by $40");
  if (!optimizeNote(2).includes("up to two listed steps") || !optimizeNote(1).includes("up to one listed step")) throw new Error("the width is the constant's");
});

check("ROLL IT (PR 65): judged on the whole trade — the summary line, each row's whole-trade line, and why none when all risk more", () => {
  const r = renderToStaticMarkup(<RollSection r={{ ok: true, why: ROLL_WHY.ok, how: `${ROLL_HOW} ${ROLL_JUDGE_NOTE}`,
    summary: "Checked 24 rolls on 3 later expiries: 9 keep the whole trade within the $600 you accepted at entry.",
    rows: [row({ kind: "roll", label: "Same strikes", note: "Whole trade: back to $0 or better 41% · reaches your target 18% · worst -$540 · avg -$35" })], onPrepare: () => {} }} />);
  has(r, "Checked 24 rolls on 3 later expiries"); has(r, "Whole trade: back to $0 or better 41%"); has(r, "data-roll-summary");
  const none = renderToStaticMarkup(<RollSection r={{ ok: true, why: ROLL_WHY.ok, how: ROLL_HOW, summary: "Checked 6 rolls on 1 later expiry: 0 keep…",
    none: ROLL_NONE_SAFE, rows: [], onPrepare: () => {} }} />);
  has(none, ROLL_NONE_SAFE); hasNot(none, "there is no roll to prepare", "the chain listed some: the reason is the risk, not the board");
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "priceAlt(rp.ticker, c, { floors: true, contracts: n })", "a roll is read at the size held, through Find's floors");
  has(app, "contracts: rollView.n", "and arrives on Build at that size");
  has(app, "priceAlt(ticker, c, { floors: true })", "Optimize reads each candidate through Find's floors");
});

check("A ROLL NEVER HOLDS BOTH: Build's Send waits while the old position is held, and the two records are linked on their timelines", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "rollHeld ? rollCloseFirst(rollRef)", "Send is blocked while the old one is held");
  has(app, "note: rollRef ? rollLine(rollRef, !rollHeld)", "Build says which step it is on");
  has(app, 'text: rolledInto(toRef)'); has(app, 'text: rolledFrom(fromRef)');
  // PR 71: the filed record's new line also stamps it (`touchEntry()`), so the newer copy wins across devices.
  has(app, "journal: (st.journal || []).map((x) => { const y = link(x); return y === x ? x : touchEntry(y, t); })", "the old record is linked even once filed");
  has(rollCloseFirst("J-0003"), "never holds both positions at once");
  has(rollLine("J-0003", false), "close J-0003 first"); has(rollLine("J-0003", true), "J-0003 is closed");
  // The new trade goes through the same send as any other: no eighth order path.
  const calls = (app.match(/evaluateTrade\(\{/g) || []).length;
  if (calls !== 1) throw new Error(`App.jsx calls evaluateTrade ${calls} times (the one gate callback)`);
  has(app, "const g = gate({ ticker: tk, intent: \"open\", legs: alt.legs", "an alternative is checked by the same gate callback");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [n, m] of bad) console.error(`FAILED: ${n}\n${m}`); process.exit(1); }
