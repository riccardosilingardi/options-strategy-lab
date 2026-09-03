// Tests for the navigation (src/steps.jsx) and for the compare picture
// (ComparePayoffs in src/visuals.jsx). Run through scripts/test-jsx.mjs.
//
// What is being held here:
//
//  · the nav is NUMBERED and says what each step carries, because "back" has to
//    look free before anyone will use it;
//  · the evidence sheet is fixed to the viewport — it covers the step instead of
//    lengthening the page, which is the whole complaint this work answers, and
//    it cannot land below the fold the way the old inline panels could;
//  · the compare picture draws up to three payoffs on ONE axis with ONE shared
//    distribution, and when the candidates are not the same market it SAYS why
//    there is no single distribution rather than drawing an average of two
//    markets;
//  · the price line in a thumbnail is reduced to what the width can show, so it
//    is a shape at 80px rather than a scribble.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StepNav, StepForward, EvidenceBar, EvidenceOverlay, CompareTray, CandidateActions } from "./steps.jsx";
import {
  ComparePayoffs, CompareFigure, compareTakeaway, explainCompareElement, sharesOneMarket,
  simplifyCloses, thumbPoints, terminalDist, BandThumbnail, payoffBands, COMPARE_COLORS,
} from "./visuals.jsx";
import { stepCarry, candidateOf, MAX_COMPARE } from "./path.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const has = (html, s) => { if (!html.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasNot = (html, s) => { if (html.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

/* ---------------- the numbered nav ---------------- */

check("the three steps are numbered on screen", () => {
  const h = renderToStaticMarkup(<StepNav step="radar" carry={stepCarry({})} />);
  has(h, ">1<"); has(h, ">2<"); has(h, ">3<");
  has(h, "Radar"); has(h, "Shortlist"); has(h, "Build");
});

check("the nav says what each step is carrying", () => {
  const h = renderToStaticMarkup(
    <StepNav step="shortlist" carry={stepCarry({ ticker: "SOYB", trade: "SOYB · Iron Condor", compare: 2 })} />);
  has(h, "SOYB");
  has(h, "2 to compare");
  has(h, "Iron Condor");
});

check("a step already walked is marked done, not hidden", () => {
  const h = renderToStaticMarkup(<StepNav step="build" carry={stepCarry({ ticker: "CORN" })} />);
  // step 1 and 2 are behind us: they show a tick and stay tappable
  has(h, "✓");
  has(h, "aria-current=\"step\"");
});

check("the forward button names the step it leads to, and says why it cannot", () => {
  const on = renderToStaticMarkup(<StepForward label="Go to Build" sub="loaded on step 3" />);
  has(on, "Go to Build"); has(on, "loaded on step 3");
  const off = renderToStaticMarkup(
    <StepForward label="Pick one above" disabled disabledNote="Use Take to Build on one of these first." />);
  has(off, "disabled");
  has(off, "Use Take to Build on one of these first.");
  hasNot(off, "loaded on step 3");
});

/* ---------------- the evidence sheet ---------------- */

check("the evidence bar says evidence opens over the step", () => {
  const h = renderToStaticMarkup(
    <EvidenceBar items={[{ id: "why", label: "Why this market", sub: "the four readings" }]} open={null} />);
  has(h, "Why this market");
  has(h, "never adds to the bottom of this page");
});

check("a chip that is thinking or holding an answer says so on the chip", () => {
  const h = renderToStaticMarkup(
    <EvidenceBar items={[{ id: "copilot", label: "Copilot" }]} open={null} mark={{ copilot: "answer ready" }} />);
  has(h, "Copilot · answer ready");
});

check("the sheet is fixed to the viewport, so it covers the step instead of lengthening it", () => {
  const h = renderToStaticMarkup(
    <EvidenceOverlay title="History" sub="what happened in past years"><div>the panel</div></EvidenceOverlay>);
  has(h, "position:fixed");
  has(h, "role=\"dialog\"");
  has(h, "aria-modal=\"true\"");
  has(h, "the panel");
  has(h, "Close");
  has(h, "puts you back on the step you were reading");
});

/* ---------------- the compare tray ---------------- */

const c1 = candidateOf({
  ticker: "CORN", name: "Bull Call Spread", spot: 22, entryNet: 0.8, expKey: "2026-10-16", dte: 45,
  legs: [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }],
  maxProfit: 120, maxLoss: -80, pop: 0.45, sigma: 0.28,
});
const c2 = candidateOf({
  ticker: "CORN", name: "Iron Condor", spot: 22, entryNet: -0.5, expKey: "2026-10-16", dte: 45,
  legs: [
    { side: 1, qty: 1, type: "put", strike: 19 }, { side: -1, qty: 1, type: "put", strike: 20 },
    { side: -1, qty: 1, type: "call", strike: 24 }, { side: 1, qty: 1, type: "call", strike: 25 }],
  maxProfit: 50, maxLoss: -50, pop: 0.72, sigma: 0.28,
});
const c3 = candidateOf({
  ticker: "UNG", name: "Bear Put Spread", spot: 13, entryNet: 0.6, expKey: "2026-10-16", dte: 45,
  legs: [{ side: 1, qty: 1, type: "put", strike: 13 }, { side: -1, qty: 1, type: "put", strike: 12 }],
  maxProfit: 40, maxLoss: -60, pop: 0.5, sigma: 0.5,
});

check("the tray says how many of the three are ticked and offers the way out", () => {
  const h = renderToStaticMarkup(<CompareTray items={[c1, c2]} max={MAX_COMPARE} showing={false} />);
  has(h, "COMPARING 2 OF 3");
  has(h, "Compare them");
  has(h, "Bull Call Spread");
});

check("one on its own explains what a second one would buy", () => {
  const h = renderToStaticMarkup(<CompareTray items={[c1]} max={MAX_COMPARE} />);
  has(h, "Tick a second one");
  hasNot(h, "Compare them");   // there is nothing to compare it with yet
});

check("the refusal to add a fourth is shown, not swallowed", () => {
  const h = renderToStaticMarkup(
    <CompareTray items={[c1, c2, c3]} max={MAX_COMPARE} note="Untick one first." />);
  has(h, "Untick one first.");
});

check("a candidate row carries tick, keep and take-to-Build", () => {
  const h = renderToStaticMarkup(<CandidateActions ticked={false} saved={false} onBuild={() => {}} />);
  has(h, "Compare"); has(h, "Save for later"); has(h, "Take to Build");
  const on = renderToStaticMarkup(<CandidateActions ticked saved />);
  has(on, "✓ comparing"); has(on, "✓ saved");
});

/* ---------------- the compare picture (PRD §6) ---------------- */

check("three payoffs are drawn on ONE axis, with every breakeven marked", () => {
  const h = renderToStaticMarkup(<ComparePayoffs items={[c1, c2, c3]} />);
  // one svg, not three charts side by side
  eq(h.split("<svg").length - 1, 1, "the compare view drew more than one chart");
  // one path per candidate, plus a marker per breakeven
  const paths = h.split("<path").length - 1;
  if (paths < 3) throw new Error(`only ${paths} payoff curves drawn`);
  const marks = h.split("<circle").length - 1;
  if (marks < 3) throw new Error(`only ${marks} breakevens marked`);
  for (const col of COMPARE_COLORS) has(h, col);
});

check("the shared distribution is drawn for one market and refused across two", () => {
  if (!sharesOneMarket([c1, c2])) throw new Error("two structures on CORN are one market");
  if (sharesOneMarket([c1, c3])) throw new Error("CORN and UNG were treated as one market");
  const one = renderToStaticMarkup(<CompareFigure items={[c1, c2]} />);
  hasNot(one, "there is no single distribution");
  const two = renderToStaticMarkup(<CompareFigure items={[c1, c3]} />);
  has(two, "there is no single distribution");
});

check("the compare takeaway is one generated sentence carrying the numbers", () => {
  const s = compareTakeaway([c1, c2]);
  const stops = (s.replace(/\d\.\d/g, "00").match(/\.(?=\s|$)/g) || []).length;
  if (stops !== 1 || !s.trim().endsWith(".")) throw new Error(`not one sentence: ${s}`);
  has(s, "Bull Call Spread");   // pays the most
  has(s, "Iron Condor");        // works most often
  has(s, "$120");
});

check("nothing ticked, and one ticked, both say something rather than nothing", () => {
  has(compareTakeaway([]), "Nothing ticked");
  has(compareTakeaway([c1]), "tick a second one");
});

check("every element of the compare picture explains itself on tap", () => {
  for (const el of ["curve", "zero", "breakeven", "distribution", "today"]) {
    const t = explainCompareElement(el, [c1, c2]);
    if (!t || t.length < 40) throw new Error(`${el} has no explanation`);
  }
});

check("the compare picture renders in every state without a chart to draw", () => {
  const h = renderToStaticMarkup(<ComparePayoffs items={[]} />);
  // the ResizeObserver wrapper has to exist on mount even with nothing in it,
  // or the width freezes at its initial value for the component's life
  has(h, "<div");
});

/* ---------------- the thumbnail, readable at 80px ---------------- */

check("the price line is reduced to what the width can carry", () => {
  const hist = Array.from({ length: 240 }, (_, i) => 20 + Math.sin(i / 9) * 2);
  const few = simplifyCloses(hist, thumbPoints(80));
  if (few.length > thumbPoints(80)) throw new Error(`${few.length} points at 80px`);
  eq(few[0], hist[0], "the first close moved");
  eq(few[few.length - 1], hist[hist.length - 1], "today moved");
  // a short series is left exactly as it is, never smoothed for no reason
  const short = [1, 2, 3];
  eq(simplifyCloses(short, 40).length, 3, "a short series was resampled");
});

check("a thumbnail at 80px draws a line, not one point per day", () => {
  const b = payoffBands({
    legs: [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }],
    entryNet: 0.8, spot: 22,
  });
  const bars = Array.from({ length: 200 }, (_, i) => ({ close: 21 + (i % 7) * 0.2 }));
  const h = renderToStaticMarkup(<BandThumbnail bands={b} bars={bars} width={80} height={40} />);
  const d = /d="M([^"]*)"/.exec(h);
  if (!d) throw new Error("no price line drawn");
  const points = d[1].split("L").length;
  if (points > thumbPoints(80 * 0.78) + 1) throw new Error(`${points} points drawn in 80px`);
  if (points < 4) throw new Error("the line lost its shape entirely");
});

/* ---------------- the shared distribution ---------------- */

check("the terminal distribution is one function, used by both charts", () => {
  const d = terminalDist({ spot: 22, sigma: 0.3, dte: 45, lo: 22 * 0.5, hi: 22 * 1.6, bins: 40 });
  eq(d.bins.length, 40, "bin count");
  const total = d.bins.reduce((a, x) => a + x.p, 0);
  if (total < 0.9 || total > 1.001) throw new Error(`the probabilities sum to ${total}`);
  if (!(d.peak > 0)) throw new Error("no peak");
  // and it refuses rather than inventing when it is not told enough
  eq(terminalDist({ spot: 22, sigma: 0, dte: 45, lo: 10, hi: 30 }).bins.length, 0, "drew a distribution with no volatility");
});

/* ---------------- report ---------------- */
for (const n of ok) console.log(`  ok   ${n}`);
for (const [n, m] of bad) console.log(`  FAIL ${n}\n       ${m}`);
console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
if (bad.length) process.exit(1);
