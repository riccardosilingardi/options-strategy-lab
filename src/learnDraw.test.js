// src/learnDraw.test.js — PR 77 (owner, 20 Oct 2026): a figure drawn with a finger, recognised on the real market.
//
// Plain JS. A DRAWN FIXTURE is what a finger leaves on the picture: a figure's P&L at expiry (its legs on the board, less
// their model net), sampled left to right at uneven steps across most of the picture, with a tremor of ±3% of its largest
// value and any scale (the picture's pixels are not dollars). Every fixture is laid out on a fine (1-point), a coarse
// (5-point) and a gappy board (2.5-point with three strikes missing near the money), shaped like GLD's on 20 Oct 2026.
// The RNG is seeded: the same drawings every run.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { recogniseDrawing, readDrawing, resampleStroke, segmentsOf, patternDistance, normaliseCurve, withWings, fitShape,
  DRAW_MATCH_MIN, DRAW_SHOW } from "./learnDraw.js";
import * as Draw from "./learnDraw.js";
import { DRAW_SHAPES, DEFINED_SIBLINGS, FIGURE_NAMES, figureOf, siblingSentence, LEARN_WORDS } from "./rules.js";
import { boardStrikes } from "./chain.js";
import { bs } from "./engine.js";
import { undefinedRiskLegs } from "./riskGate.js";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const L = (side, type, strike, qty = 1) => ({ side, type, strike, qty });

const SPOT = 377.2, EXP = "2026-11-27", DTE = 38;
function chainOf({ step = 1, lo = 320, hi = 440, putsTop = 420, gaps = [] } = {}) {
  const calls = {}, puts = {};
  for (let k = lo; k <= hi + 1e-9; k += step) {
    const kk = Math.round(k * 100) / 100;
    if (gaps.includes(kk)) continue;
    const iv = 0.2 + Math.abs(kk - 377) / 2000;
    calls[kk] = { iv }; if (kk <= putsTop) puts[kk] = { iv };
  }
  return { spot: SPOT, expirations: [EXP], byExp: { [EXP]: { dte: DTE, calls, puts } } };
}
const BOARDS = { fine: chainOf(), coarse: chainOf({ step: 5, lo: 300, hi: 460 }), gappy: chainOf({ step: 2.5, gaps: [372.5, 375, 380] }) };
/** The lab's own premiums: Black-Scholes on each leg's own IV (labModel's arithmetic, without the picture). */
const netOfFor = (ch) => (legs) => legs.reduce((a, l) => {
  const q = ch.byExp[EXP][l.type === "call" ? "calls" : "puts"][l.strike];
  return q ? a + Math.sign(l.side) * (l.qty || 1) * bs(SPOT, l.strike, DTE / 365, q.iv, l.type) : NaN;
}, 0);
const LO = SPOT * 0.75, HI = SPOT * 1.25;
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pnl = (legs, net) => (x) => legs.reduce((a, l) => a + Math.sign(l.side) * (l.qty || 1) *
  (l.type === "call" ? Math.max(x - l.strike, 0) : Math.max(l.strike - x, 0)), 0) - net;
/** A finger's drawing of these legs: uneven samples left to right over 6–94% of the picture, a tremor, any scale. */
function drawOf(legs, net, { wobble = 0.03, scale = 3.7, from = 0.06, to = 0.94, round = 0 } = {}) {
  const f = pnl(legs, net);
  const g = round ? (x) => { let s = 0; for (let k = -6; k <= 6; k++) s += f(x + k * round); return s / 13; } : f;
  const m = Math.max(...Array.from({ length: 201 }, (_, i) => Math.abs(f(LO + ((HI - LO) * i) / 200))));
  const out = [];
  for (let x = LO + (HI - LO) * from; x <= LO + (HI - LO) * to; x += (HI - LO) * (0.004 + 0.012 * rnd())) {
    out.push({ s: x, v: scale * (g(x) + (rnd() - 0.5) * 2 * wobble * m) });
  }
  return out;
}
const snap = (board, k, t) => board[t].reduce((b, x) => (Math.abs(x - k) < Math.abs(b - k) ? x : b), board[t][0]);
const FIX = {
  "long-call": [L(1, "call", 385)],
  "bull-call": [L(1, "call", 380), L(-1, "call", 400)],
  "bull-put": [L(1, "put", 350), L(-1, "put", 365)],
  "iron-condor": [L(1, "put", 340), L(-1, "put", 355), L(-1, "call", 400), L(1, "call", 415)],
  "butterfly": [L(1, "call", 360), L(-1, "call", 377, 2), L(1, "call", 394)],
  "long-straddle": [L(1, "call", 377), L(1, "put", 377)],
  "short-strangle": [L(-1, "put", 355), L(-1, "call", 400)],
};
const BUTTERFLIES = ["call-fly", "put-fly", "broken-call-fly", "broken-put-fly", "iron-fly"];
const read = (name, legs0, opts = {}) => {
  const ch = BOARDS[name], board = boardStrikes(ch, EXP), netOf = netOfFor(ch);
  const legs = legs0.map((l) => ({ ...l, strike: snap(board, l.strike, l.type) }));
  return { board, r: recogniseDrawing({ stroke: drawOf(legs, netOf(legs), opts), board, spot: SPOT, lo: LO, hi: HI, netOf, sd: 24 }) };
};

/* ================================================================ THE TABLE */
test("EVERY SHAPE FIGURE_NAMES NAMES CAN BE DRAWN: DRAW_SHAPES covers all 34, laid out on slots, and names itself back", () => {
  assert.deepEqual(Object.keys(DRAW_SHAPES).sort(), Object.keys(FIGURE_NAMES).sort());
  assert.equal(Draw.DRAW_SHAPES, undefined, "learnDraw.js reads the table from rules.js; it keeps no copy");
  // Each shape on evenly spaced listed strikes is its own name (the broken-wing ones come out even: a plain butterfly).
  const board = boardStrikes(BOARDS.fine, EXP);
  for (const [id, shape] of Object.entries(DRAW_SHAPES)) {
    const slots = Math.max(...shape.map((l) => l[2])) + 1;
    const ks = Array.from({ length: slots }, (_, i) => 360 + 10 * i);
    const legs = shape.map(([side, type, slot, qty]) => ({ side, type, strike: ks[slot], qty: qty || 1 }));
    for (const l of legs) assert.ok(board[l.type].includes(l.strike));
    assert.equal(figureOf(legs).id, id.replace(/^broken-/, ""), id);
  }
});
test("THE DEFINED-RISK SIBLINGS: every shape the gate would refuse has one, and the one sentence reads as the owner wrote it", () => {
  for (const id of Object.keys(FIGURE_NAMES)) {
    const shape = DRAW_SHAPES[id];
    const legs = shape.map(([side, type, slot, qty]) => ({ side, type, strike: 360 + 10 * slot, qty: qty || 1 }));
    if (undefinedRiskLegs(legs).length) assert.ok(DEFINED_SIBLINGS[id], `${id} needs a sibling`);
    else assert.equal(DEFINED_SIBLINGS[id], undefined, `${id} is already defined risk`);
  }
  for (const s of Object.values(DEFINED_SIBLINGS)) {
    const shape = DRAW_SHAPES[s.to];
    assert.equal(undefinedRiskLegs(shape.map(([side, type, slot, qty]) => ({ side, type, strike: 360 + 10 * slot, qty: qty || 1 }))).length, 0, `${s.to} is defined risk`);
  }
  assert.equal(siblingSentence("short-straddle"), "Short straddle → Iron butterfly: same shape, the wings cap the loss");
  assert.equal(siblingSentence("short-strangle"), "Short strangle → Iron condor: same shape, the wings cap the loss");
  assert.equal(siblingSentence("short-put"), "Short put → Bull put spread: the bought put caps the loss");
  assert.equal(siblingSentence("short-call"), "Short call → Bear call spread: the bought call caps the loss");
});

/* ================================================================ READING A STROKE */
test("A STROKE IS READ: resampled across its span, smoothed, normalised (scale gone, sign kept), cut into segments", () => {
  const s = [{ s: 300, v: -10 }, { s: 330, v: -10 }, { s: 360, v: -10 }, { s: 380, v: 20 }, { s: 400, v: 50 }, { s: 430, v: 50 }, { s: 460, v: 50 }];
  const r = resampleStroke(s, { lo: LO, hi: HI });
  assert.equal(r.ok, true); assert.equal(r.xs.length, 64); assert.equal(r.xs[0], 300); assert.equal(r.xs[63], 460);
  const d = readDrawing(s, { lo: LO, hi: HI });
  assert.deepEqual(d.tokens, ["F−", "U", "F+"], "a bull spread: flat below zero, up, flat above");
  assert.equal(d.kinks.length, 2); assert.ok(Math.abs(d.kinks[0] - 360) < 8 && Math.abs(d.kinks[1] - 400) < 8, `kinks ${d.kinks}`);
  const big = readDrawing(s.map((p) => ({ ...p, v: p.v * 1000 })), { lo: LO, hi: HI });
  assert.deepEqual(big.tokens, d.tokens, "scale does not matter");
  assert.deepEqual(readDrawing(s.slice(0, 3), { lo: LO, hi: HI }), { ok: false, reason: "short" });
  assert.equal(readDrawing([{ s: 360, v: 1 }, { s: 361, v: 2 }, { s: 362, v: 1 }, { s: 363, v: 3 }, { s: 364, v: 1 }, { s: 365, v: 2 }], { lo: LO, hi: HI }).reason, "short",
    "a stroke across a sliver of the picture is not read");
  assert.equal(readDrawing(Array.from({ length: 30 }, (_, i) => ({ s: 300 + 5 * i, v: 7 })), { lo: LO, hi: HI }).reason, "flat", "a flat line is no figure");
  assert.equal(normaliseCurve([0, 0, 0]), null);
});
test("THE PATTERN'S DISTANCE: the same reading 0; a near-zero flat half a step from a signed one; nothing alike 1", () => {
  assert.equal(patternDistance(["F−", "U", "F+"], ["F−", "U", "F+"]), 0);
  assert.equal(patternDistance(["F0", "U"], ["F−", "U"]), 0.25);
  assert.equal(patternDistance(["U", "D"], ["D", "U"]), 1);
  assert.equal(patternDistance(["D", "U"], ["D", "F−", "U"]), 1 / 3);
  const z = segmentsOf([0, 1, 2], [0, 0, 0]);
  assert.deepEqual(z.tokens, ["F0"]);
});

/* ================================================================ THE FIGURES, DRAWN */
for (const name of Object.keys(BOARDS)) {
  test(`DRAWN ON A ${name.toUpperCase()} BOARD: a long call, the two bull spreads, an iron condor, a butterfly, a straddle, each named first`, () => {
    for (const [id, legs] of Object.entries(FIX)) {
      if (id === "short-strangle") continue;
      const { board, r } = read(name, legs);
      assert.ok(r.ok && r.named, `${id}: named (best ${r.best && r.best.id} ${r.best && r.best.sim.toFixed(2)})`);
      const want = id === "butterfly" ? BUTTERFLIES : [id];
      assert.ok(want.includes(r.best.id), `${id} on ${name}: best is ${r.best.id} (${r.matches.map((m) => m.id).join(", ")})`);
      assert.equal(r.matches[0].id, r.best.id, "the closest is shown first");
      assert.ok(r.best.sim >= 0.9, `${id} on ${name}: ${r.best.sim.toFixed(3)}`);
      assert.ok(r.matches.length <= DRAW_SHOW);
      for (const m of r.matches) {
        assert.equal(figureOf(m.legs).id, m.id, "the name is figureOf's of the legs laid out");
        for (const l of m.legs) assert.ok(board[l.type].includes(l.strike), `${m.id}: ${l.strike} ${l.type} is listed`);
        assert.ok(m.legs.length <= 4);
      }
    }
  });
  test(`A SHORT STRANGLE DRAWN ON A ${name.toUpperCase()} BOARD is offered as an iron condor first, with its sentence; the strangle says the app never sends it`, () => {
    const { r } = read(name, FIX["short-strangle"]);
    assert.equal(r.best.id, "short-strangle"); assert.equal(r.best.uncovered, true);
    assert.equal(r.matches[0].id, "iron-condor"); assert.equal(r.matches[0].sibling, true); assert.equal(r.matches[0].uncovered, false);
    assert.equal(r.matches[0].sentence, "Short strangle → Iron condor: same shape, the wings cap the loss");
    const [p0, c0] = [FIX["short-strangle"][0], FIX["short-strangle"][1]];
    const sold = r.matches[0].legs.filter((l) => l.side < 0).map((l) => l.strike).sort((a, b) => a - b);
    assert.deepEqual(sold, r.best.legs.map((l) => l.strike).sort((a, b) => a - b), "the drawn strangle's strikes are kept; wings are added beyond");
    const tol = name === "coarse" ? 10 : 5;     // two listed strikes on each board
    assert.ok(Math.abs(sold[0] - p0.strike) <= tol && Math.abs(sold[1] - c0.strike) <= tol, `sold ${sold} near the drawn kinks`);
    const s = r.matches.find((m) => m.id === "short-strangle");
    assert.ok(s && s.uncovered, "the strangle itself is still shown, marked");
  });
}
test("THE SAME LINE, TWO FIGURES: a bull put spread is named first where today's price already makes money (paid to stay); the bull call spread where it must move", () => {
  const { r: put } = read("fine", FIX["bull-put"]);
  const { r: call } = read("fine", FIX["bull-call"]);
  assert.equal(put.best.id, "bull-put"); assert.ok(put.best.net < 0, "a credit");
  assert.equal(call.best.id, "bull-call"); assert.ok(call.best.net > 0, "a debit");
  const twins = [put, call].map((r) => (r.twin ? `${r.twin.of}/${r.twin.id}` : null));
  assert.ok(twins.includes("bull-put/bull-call") || twins.includes("bull-call/bull-put") || put.all.some((m) => m.id === "bull-call"),
    "the other spread draws the same line: said in a sentence, not a card of its own");
  assert.match(LEARN_WORDS.sameLine("Bull call spread", "Bull put spread", 1.2, -0.8), /one pays to enter, the other is paid/);
  assert.match(LEARN_WORDS.sameLine("Short strangle", "Short guts", -1, -4), /the same profit and loss from different strikes/);
});
test("A SLOPPIER HAND (rounded corners, a stronger tremor) is still read: long call, spreads, straddle, strangle", () => {
  for (const id of ["long-call", "bull-call", "bull-put", "long-straddle", "short-strangle"]) {
    const { r } = read("fine", FIX[id], { wobble: 0.06, round: 1.2, from: 0.12, to: 0.88 });
    assert.equal(r.best.id, id, `${id}: ${r.best.id} ${r.best.sim.toFixed(2)}`);
    assert.ok(r.named);
  }
});
test("A SCRIBBLE IS NO KNOWN FIGURE: 'No known figure looks like this; the closest is X' — never a forced name", () => {
  const board = boardStrikes(BOARDS.fine, EXP), netOf = netOfFor(BOARDS.fine);
  const zig = [];
  for (let x = LO + 6; x < HI - 6; x += 1.1) zig.push({ s: x, v: (Math.floor((x - LO) / 9) % 2 ? 30 : -30) + (x % 3) });
  const sine = Array.from({ length: 160 }, (_, i) => ({ s: LO + 6 + i, v: Math.sin(i / 9) * 10 }));
  // A square wave a few strikes wide: the smoothing alone would turn it into a step; it is a scribble.
  const square = []; for (let x = LO + 7; x < HI - 6; x += 1.1) square.push({ s: x, v: Math.floor((x - LO) / 9) % 2 ? 30 : -30 });
  assert.ok(readDrawing(square, { lo: LO, hi: HI }).scribble, "most of it is wiggle");
  for (const [id, legs] of Object.entries(FIX)) {
    const netOf = netOfFor(BOARDS.fine);
    const d = readDrawing(drawOf(legs, netOf(legs), { wobble: 0.06, round: 1.2 }), { lo: LO, hi: HI });
    assert.ok(!d.scribble && d.wiggle < 0.1, `${id}: a tremor is not a scribble (${d.wiggle.toFixed(3)})`);
  }
  for (const stroke of [zig, sine, square]) {
    const r = recogniseDrawing({ stroke, board, spot: SPOT, lo: LO, hi: HI, netOf, sd: 24 });
    assert.equal(r.ok, true); assert.equal(r.named, false, `best ${r.best.id} ${r.best.sim.toFixed(2)}: nothing is named`);
    assert.ok(r.best.sim < DRAW_MATCH_MIN || r.drawing.scribble, "under the threshold, or a scribble whatever its smoothed line scores");
    assert.equal(LEARN_WORDS.noMatch(r.best.name), `No known figure looks like this; the closest is ${r.best.name}.`);
  }
});

/* ================================================================ THE WINGS */
test("WITH WINGS: each uncovered sold option gets a bought one beyond it, half an expected move out, on its type's listed strikes", () => {
  const board = boardStrikes(BOARDS.fine, EXP);
  const straddle = withWings([L(-1, "call", 377), L(-1, "put", 377)], board, { sd: 24 });
  assert.equal(figureOf(straddle.legs).id, "iron-fly");
  assert.deepEqual(straddle.added.map((l) => [l.type, l.strike]).sort(), [["call", 389], ["put", 365]]);
  assert.equal(figureOf(withWings([L(-1, "put", 360)], board, { sd: 24 }).legs).id, "bull-put");
  assert.equal(figureOf(withWings([L(-1, "call", 400)], board, { sd: 24 }).legs).id, "bear-call");
  assert.equal(figureOf(withWings([L(1, "call", 370), L(-1, "call", 380, 2)], board, { sd: 24 }).legs).id, "broken-call-fly", "a ratio spread, covered");
  assert.equal(withWings([L(1, "call", 370), L(-1, "call", 380)], board, { sd: 24 }), null, "nothing uncovered: nothing added");
  const coarse = boardStrikes(BOARDS.coarse, EXP);
  const w = withWings([L(-1, "put", 360)], coarse, {});
  assert.equal(w.added[0].strike, 340, "with no expected move, four listed strikes out");
  assert.equal(withWings([L(-1, "put", 300)], coarse, { sd: 24 }), null, "no strike below the board's lowest: none");
  assert.equal(withWings([L(1, "put", 330), L(1, "put", 340), L(-1, "call", 400), L(1, "put", 350)], board, { sd: 24 }), null, "never past four legs");
});
test("A SHAPE IS JUDGED ON WHAT WAS DRAWN: no strike outside the drawn span, none closer than a segment to another", () => {
  const board = boardStrikes(BOARDS.fine, EXP), netOf = netOfFor(BOARDS.fine);
  const legs = [L(1, "call", 380), L(-1, "call", 400)];
  const d = readDrawing(drawOf(legs, netOf(legs), { from: 0.25, to: 0.75 }), { lo: LO, hi: HI });
  assert.ok(d.ok, "half the picture, drawn");
  for (const [id, shape] of Object.entries(DRAW_SHAPES)) {
    const f = fitShape(shape, d, board, netOf);
    if (!f) continue;
    const span = d.xs[63] - d.xs[0];
    const ks = [...new Set(f.legs.map((l) => l.strike))].sort((a, b) => a - b);
    for (const k of ks) assert.ok(k >= d.xs[0] && k <= d.xs[63], `${id}: ${k} inside the drawn span`);
    for (let i = 1; i < ks.length; i++) assert.ok(ks[i] - ks[i - 1] >= 0.05 * span - 1e-9, `${id}: strikes a segment apart`);
  }
});

/* ================================================================ NOTHING SENT */
test("NOTHING SENDS, SAVES OR CALLS OUT: learnDraw.js imports no order path and calls no server", () => {
  const src = readFileSync("src/learnDraw.js", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const bad of ["closeOrder", "modifyOrder", "./order.js", "./pro.jsx", "./App.jsx", "useTicketSend", "sendToAlpaca", "placeExit",
    "evaluateTrade", "orderBody", "fetch(", "/api/", "localStorage", "XMLHttpRequest", "buildHandOff"]) {
    assert.ok(!src.includes(bad), `learnDraw.js must not mention ${bad}`);
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\nlearnDraw: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
