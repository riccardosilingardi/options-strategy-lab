// src/learn.test.js — PR 74 (owner, 20 Oct 2026): Learn, the figure lab.
//
// Plain JS: what a set of legs is called (`figureOf()`, rules.js), the gallery laid out on a board and named back as
// itself, the legs moved only onto strikes their type lists, the model prices on each leg's own volatility, the risk
// read from the payoff and the gate's own question, and — read off the source — that nothing in the lab sends, saves or
// calls out. The screen is rendered in src/learn.test.jsx.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { figureOf, figureLegs, FIGURE_NAMES, LAB_FIGURES, LAB_TABS, LEARN_WORDS, labWhereLine, labLegText, NO_CEILING } from "./rules.js";
import { labExpiry, labStepExpiry, labAddLeg, labStepLeg, labCanStep, labMoveLeg, labFlipLeg, labRemoveLeg, labFigureLegs,
  labExpectedMove, legIv, labModel, labCard, labLegRows, labGallery, LAB_MAX_LEGS,
  niceTicks, labExitDay, labCurves, labReadout, labExtremes, labDensity, labMarketLine, labLegend, labSnapLabel, labPointXs, labHitZones,
  labPointAt, labDragTo, labLane, labLegOcc, POINT_GAP, HIT_MIN } from "./learnView.js";
import { boardStrikes } from "./chain.js";
import { bs, legsAt } from "./engine.js";
import { impliedDistribution } from "./impliedDist.js";
import { exitPlanOf, marketChanceOf, MARKET_CHANCE_NOT_READ, labLegName, RULES } from "./rules.js";
import { MLEG_MAX_LEGS } from "./alpacaContract.js";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const L = (side, type, strike, qty = 1) => ({ side, type, strike, qty });
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);

/** A board shaped like GLD's on 20 Oct 2026: 1-point strikes 320–440, the puts listing fewer above the money. */
function chainOf({ step = 1, lo = 320, hi = 440, putsTop = 420, spot = 377.2, ivAt = (k) => 0.2 + Math.abs(k - 377) / 2000, gaps = [] } = {}) {
  const calls = {}, puts = {};
  for (let k = lo; k <= hi + 1e-9; k += step) {
    const kk = Math.round(k * 100) / 100;
    if (gaps.includes(kk)) continue;
    calls[kk] = { bid: 1, ask: 1.2, mid: 1.1, iv: ivAt(kk) };
    if (kk <= putsTop) puts[kk] = { bid: 1, ask: 1.2, mid: 1.1, iv: ivAt(kk) };
  }
  return { spot, expirations: ["2026-10-21", "2026-11-27", "2026-12-18"],
    byExp: { "2026-10-21": { dte: 0, calls, puts }, "2026-11-27": { dte: 38, calls, puts }, "2026-12-18": { dte: 59, calls, puts } } };
}

/* ================================================================ WHAT A SET OF LEGS IS CALLED */
test("figureOf: one name for every shape in FIGURE_NAMES, and a mirror is its own name", () => {
  const cases = {
    "long-call": [L(1, "call", 100)], "short-call": [L(-1, "call", 100)], "long-put": [L(1, "put", 100)], "short-put": [L(-1, "put", 100)],
    "bull-call": [L(1, "call", 100), L(-1, "call", 105)], "bear-call": [L(-1, "call", 100), L(1, "call", 105)],
    "bull-put": [L(1, "put", 95), L(-1, "put", 100)], "bear-put": [L(-1, "put", 95), L(1, "put", 100)],
    "call-ratio": [L(1, "call", 100), L(-1, "call", 105, 2)], "put-ratio": [L(1, "put", 100), L(-1, "put", 95, 2)],
    "long-straddle": [L(1, "call", 100), L(1, "put", 100)], "short-straddle": [L(-1, "call", 100), L(-1, "put", 100)],
    "long-strangle": [L(1, "put", 95), L(1, "call", 105)], "short-strangle": [L(-1, "put", 95), L(-1, "call", 105)],
    "long-guts": [L(1, "put", 105), L(1, "call", 95)], "short-guts": [L(-1, "put", 105), L(-1, "call", 95)],
    "synthetic-long": [L(1, "call", 100), L(-1, "put", 100)], "synthetic-short": [L(-1, "call", 100), L(1, "put", 100)],
    "bull-reversal": [L(-1, "put", 95), L(1, "call", 105)], "bear-reversal": [L(1, "put", 95), L(-1, "call", 105)],
    "call-fly": [L(1, "call", 95), L(-1, "call", 100, 2), L(1, "call", 105)], "put-fly": [L(1, "put", 95), L(-1, "put", 100, 2), L(1, "put", 105)],
    "short-call-fly": [L(-1, "call", 95), L(1, "call", 100, 2), L(-1, "call", 105)],
    "short-put-fly": [L(-1, "put", 95), L(1, "put", 100, 2), L(-1, "put", 105)],
    "broken-call-fly": [L(1, "call", 95), L(-1, "call", 100, 2), L(1, "call", 110)],
    "broken-put-fly": [L(1, "put", 90), L(-1, "put", 100, 2), L(1, "put", 105)],
    "iron-condor": [L(1, "put", 90), L(-1, "put", 95), L(-1, "call", 105), L(1, "call", 110)],
    "iron-fly": [L(1, "put", 90), L(-1, "put", 100), L(-1, "call", 100), L(1, "call", 110)],
    "reverse-iron-condor": [L(-1, "put", 90), L(1, "put", 95), L(1, "call", 105), L(-1, "call", 110)],
    "reverse-iron-fly": [L(-1, "put", 90), L(1, "put", 100), L(1, "call", 100), L(-1, "call", 110)],
    "call-condor": [L(1, "call", 90), L(-1, "call", 95), L(-1, "call", 105), L(1, "call", 110)],
    "put-condor": [L(1, "put", 90), L(-1, "put", 95), L(-1, "put", 105), L(1, "put", 110)],
    "short-call-condor": [L(-1, "call", 90), L(1, "call", 95), L(1, "call", 105), L(-1, "call", 110)],
    "short-put-condor": [L(-1, "put", 90), L(1, "put", 95), L(1, "put", 105), L(-1, "put", 110)],
  };
  assert.deepEqual(Object.keys(cases).sort(), Object.keys(FIGURE_NAMES).sort(), "every name has a case");
  for (const [id, legs] of Object.entries(cases)) {
    assert.equal(figureOf(legs).id, id, `${id}`);
    assert.equal(figureOf([...legs].reverse()).id, id, `${id}, legs in another order`);
    assert.equal(figureOf(legs).name, FIGURE_NAMES[id]);
  }
});
test("figureOf reads a NET position: two shorts on one strike are one leg × 2, a long and a short on one strike cancel", () => {
  assert.equal(figureOf([L(1, "call", 95), L(-1, "call", 100), L(-1, "call", 100), L(1, "call", 105)]).id, "call-fly", "the 4-leg butterfly");
  assert.deepEqual(figureLegs([L(-1, "call", 100), L(-1, "call", 100)]), [{ type: "call", strike: 100, side: -1, qty: 2 }]);
  assert.equal(figureOf([L(1, "call", 100), L(-1, "call", 100)]).id, "none");
  assert.equal(figureOf([]).name, null);
  assert.equal(figureOf([L(1, "call", 100), L(1, "call", 105)]).name, "2 legs", "a shape with no name says how many legs");
  assert.equal(figureOf([L(1, "call", 95), L(-1, "call", 100, 2), L(1, "call", 105), L(1, "put", 90)]).id, "custom");
});

/* ================================================================ THE GALLERY ON A BOARD */
test("THE GALLERY: 14 figures, each laid out on the board and named back as itself (fine, coarse and gappy boards)", () => {
  assert.equal(LAB_FIGURES.length, 14);
  for (const f of LAB_FIGURES) assert.ok(FIGURE_NAMES[f.id] && f.idea.length < 110, `${f.id} has a name and a one-line idea`);
  const boards = [chainOf(), chainOf({ step: 5, lo: 300, hi: 460 }), chainOf({ step: 2.5, gaps: [372.5, 375, 380] }),
    chainOf({ spot: 13.24, lo: 9, hi: 18, putsTop: 18, ivAt: () => 0.3 })];
  for (const ch of boards) {
    const exp = labExpiry(ch);
    const board = boardStrikes(ch, exp);
    for (const f of LAB_FIGURES) {
      const legs = labFigureLegs(f.id, { board, spot: ch.spot, sd: labExpectedMove(ch, exp) });
      assert.ok(legs, `${f.id} fits the board`);
      assert.equal(figureOf(legs).id, f.id, `${f.id} on a ${ch.spot} board: ${JSON.stringify(legs)}`);
      for (const l of legs) assert.ok(board[l.type].includes(l.strike), `${f.id}: ${l.strike} ${l.type} is listed`);
    }
  }
  // Without an expected move, one move is four listed strikes: the figures still come out as themselves.
  const ch = chainOf(), board = boardStrikes(ch, "2026-11-27");
  for (const f of LAB_FIGURES) assert.equal(figureOf(labFigureLegs(f.id, { board, spot: ch.spot })).id, f.id, `${f.id} with no IV`);
  assert.equal(labFigureLegs("iron-condor", { board: null, spot: 377 }), null, "no board, no figure");
});

/* ================================================================ LEGS ON LISTED STRIKES ONLY */
test("A TAB ADDS ITS OPTION at the strike its own type lists nearest today's price; four legs at most (MLEG_MAX_LEGS)", () => {
  assert.equal(LAB_MAX_LEGS, MLEG_MAX_LEGS);
  assert.deepEqual(LAB_TABS.map((t) => t.label), ["+ Long call", "+ Short call", "+ Long put", "+ Short put"]);
  const board = { call: [370, 375, 380, 385], put: [360, 365, 370] };
  let legs = labAddLeg([], "long-call", board, 377.2);
  assert.deepEqual(legs, [L(1, "call", 375)]);
  legs = labAddLeg(legs, "short-put", board, 377.2);
  assert.deepEqual(legs[1], L(-1, "put", 370), "the puts' own nearest, never a call strike");
  legs = labAddLeg(labAddLeg(legs, "long-put", board, 377.2), "short-call", board, 377.2);
  assert.equal(legs.length, 4);
  assert.equal(labAddLeg(legs, "long-call", board, 377.2), legs, "a fifth is refused: the same legs back");
  assert.equal(labAddLeg([], "long-call", null, 377.2).length, 0, "no board, no leg");
  assert.equal(LEARN_WORDS.maxLegs(4), "4 legs at most, as a combination order allows.");
});
test("− / + AND A DRAG move a leg only onto its own type's listed strikes, and stop at the ends", () => {
  const board = { call: [370, 375, 380], put: [360, 365, 370] };
  let legs = [L(1, "call", 375), L(-1, "put", 365)];
  legs = labStepLeg(legs, 0, 1, board);
  assert.equal(legs[0].strike, 380);
  assert.equal(labStepLeg(legs, 0, 1, board), legs, "+ at the top does nothing");
  assert.equal(labCanStep(legs, 0, 1, board), false); assert.equal(labCanStep(legs, 0, -1, board), true);
  assert.equal(labMoveLeg(legs, 1, 377.9, board)[1].strike, 370, "a drag past the puts' top lands on their top");
  assert.equal(labMoveLeg(legs, 1, 362, board)[1].strike, 360);
  assert.equal(labFlipLeg(legs, 1)[1].side, 1);
  assert.deepEqual(labRemoveLeg(legs, 0), [L(-1, "put", 365)]);
  const rows = labLegRows(labModel({ ticker: "GLD", chain: chainOf(), expKey: "2026-11-27", legs: [L(1, "call", 440)] }), boardStrikes(chainOf(), "2026-11-27"));
  assert.equal(rows[0].canPlus, false); assert.equal(rows[0].canMinus, true);
  assert.equal(labLegText(L(-1, "put", 49.5)), "Short 49.5 put"); assert.equal(labLegText(L(-1, "call", 100, 2)), "Short 2 × 100 call");
});
test("THE EXPIRY: the listed one nearest the target entry, never one with no day left; ‹ › stop at the ends", () => {
  const ch = chainOf();
  assert.equal(labExpiry(ch), "2026-11-27", "38 days is nearer 45 than 59; 0 days is never offered");
  assert.equal(labStepExpiry(ch, "2026-11-27", 1), "2026-12-18");
  assert.equal(labStepExpiry(ch, "2026-11-27", -1), "2026-11-27", "the 0-day expiry is not a step back");
  assert.equal(labStepExpiry(ch, "2026-12-18", 1), "2026-12-18");
  assert.equal(labExpiry(null), null);
  assert.equal(labWhereLine("GLD", "2026-11-27", 38), "GLD · 27 Nov · 38 days");
});

/* ================================================================ THE MODEL AND THE CARD */
test("MODEL PRICES: Black-Scholes on each leg's OWN implied volatility; a strike with none has no price (never a guess)", () => {
  const ch = chainOf();
  const legs = [L(1, "put", 340), L(-1, "put", 361)];
  const m = labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs });
  near(m.prices[0], bs(377.2, 340, 38 / 365, legIv(ch, "2026-11-27", legs[0]), "put"), 1e-12, "the 340 put");
  near(m.prices[1], bs(377.2, 361, 38 / 365, legIv(ch, "2026-11-27", legs[1]), "put"), 1e-12, "the 361 put");
  assert.ok(legIv(ch, "2026-11-27", legs[0]) !== legIv(ch, "2026-11-27", legs[1]), "two strikes, two volatilities");
  near(m.net, m.prices[0] - m.prices[1], 1e-12, "net: positive costs, negative collects");
  assert.ok(m.net < 0, "a bull put spread collects");
  const holed = chainOf();
  holed.byExp["2026-11-27"].puts[340] = { bid: 1, ask: 1.2, mid: 1.1, iv: null };
  const h = labModel({ ticker: "GLD", chain: holed, expKey: "2026-11-27", legs });
  assert.equal(h.prices[0], null); assert.equal(h.net, null);
  const c = labCard(h);
  assert.equal(c.rows.find((r) => r.id === "net").value, "—");
  assert.deepEqual(c.missing, ["The chain lists no volatility for the 340 put, so it has no model price."]);
});
test("THE CARD: name, defined risk, cost said as a model price, exact best and worst (payoffAtZero included)", () => {
  const ch = chainOf();
  const legs = [L(1, "put", 340), L(-1, "put", 361)];
  const m = labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs });
  const c = labCard(m);
  assert.equal(c.name, "Bull put spread"); assert.equal(c.risk.tone, "ok"); assert.equal(c.risk.text, LEARN_WORDS.defined);
  const credit = -m.net * 100;
  assert.equal(c.rows[0].label, "Collects");
  assert.equal(c.rows[0].value, `$${Math.round(credit).toLocaleString("en-US")} model price`);
  assert.equal(c.rows[1].value, `$${Math.round(credit).toLocaleString("en-US")}`, "max profit is the credit");
  assert.equal(c.rows[2].value, `$${Math.round(2100 - credit).toLocaleString("en-US")}`, "max loss is the width less the credit");
  assert.equal(c.where, "GLD · 27 Nov · 38 days");
  assert.equal(labCard(labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: [] })), null, "no leg, no card");
  const none = labCard(labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: [L(1, "call", 380), L(-1, "call", 380)] }));
  assert.equal(none.name, LEARN_WORDS.cancels, "legs that cancel out are said so, not left nameless");
});
test("A SOLD OPTION ALONE: allowed to learn from; the loss without limit is 'unlimited', and the card says the app never sends it", () => {
  const ch = chainOf();
  const call = labCard(labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: [L(-1, "call", 390)] }));
  assert.equal(call.name, "Short call");
  assert.equal(call.risk.tone, "warn"); assert.equal(call.risk.text, LEARN_WORDS.neverSent);
  assert.equal(call.rows.find((r) => r.id === "loss").value, "unlimited");
  const put = labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: [L(-1, "put", 360)] });
  assert.ok(put.uncovered && !put.unboundedLoss && put.maxLoss < 0, "a sold put: the gate's uncovered short, its loss known at a price of zero");
  near(put.maxLoss, (0 - 360 - put.net) * 100, 1e-6, "the worst case is at zero");
  assert.equal(labCard(put).risk.text, LEARN_WORDS.neverSent);
  const long = labCard(labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: [L(1, "call", 390)] }));
  assert.equal(long.rows.find((r) => r.id === "profit").value, NO_CEILING, "a long call's best case is 'no ceiling', never the chart's edge");
});
test("THE GALLERY'S MODELS are the card's own arithmetic: one labModel per figure, on the market shown", () => {
  const ch = chainOf();
  const g = labGallery({ ticker: "GLD", chain: ch, expKey: "2026-11-27" });
  assert.equal(g.length, LAB_FIGURES.length);
  for (const x of g) {
    assert.ok(x.model && x.model.priced, `${x.id} priced`);
    assert.deepEqual(x.model, labModel({ ticker: "GLD", chain: ch, expKey: "2026-11-27", legs: x.legs }));
  }
});

/* ================================================================ PR 76: THE PICTURE, THE FINGER, THE NAMES */
const condorOn = (ch, exp = "2026-11-27") => labFigureLegs("iron-condor", { board: boardStrikes(ch, exp), spot: ch.spot, sd: labExpectedMove(ch, exp) });
// Plain JS: no payoff picture here (visuals.jsx is JSX); the picture's readings are tested in learn.test.jsx.
const modelOf = (legs, ch = chainOf(), exp = "2026-11-27") => labModel({ ticker: "GLD", chain: ch, expKey: exp, legs });

test("76.1 THE SCALES: round ticks on a 1 · 2 · 2.5 · 5 step, inside the range, none for an empty one", () => {
  assert.deepEqual(niceTicks(9, 18, 4), [10, 12.5, 15, 17.5]);
  assert.deepEqual(niceTicks(-140, 90, 3), [-100, 0]);
  assert.deepEqual(niceTicks(-0.14, 0.14, 3), [-0.1, 0, 0.1], "the picture drops figures that round to $0");
  assert.deepEqual(niceTicks(5, 5), []); assert.deepEqual(niceTicks(null, 3), []);
  for (const v of niceTicks(280.3, 471.9, 4)) assert.ok(v >= 280.3 && v <= 471.9);
});
test("76.2 A FINGER WITH A WOBBLE STILL MOVES THE LEG: only the sideways distance counts, from where it was held", () => {
  const ch = chainOf(), board = boardStrikes(ch, "2026-11-27");
  let legs = [L(1, "put", 360), L(-1, "put", 370)];
  // The picture's own mapping: 300px of plot for prices 300–450 (2px a dollar). The finger holds the 370 put at x = 140
  // and slides right 24px, 3px at a time, its height wobbling ±14px.
  const W = 300, lo = 300, hi = 450, X = (s) => ((s - lo) / (hi - lo)) * W, P = (x) => lo + (x / W) * (hi - lo);
  const hold = { startStrike: 370, startPrice: P(X(370) + 3) };   // pressed 3px right of the point: no jump
  const ys = [];
  for (let k = 1; k <= 8; k++) {
    const pointer = { x: X(370) + 3 + 3 * k, y: 120 + (k % 2 ? 14 : -14) };
    ys.push(pointer.y);
    legs = labDragTo(legs, 1, board, { ...hold, price: P(pointer.x) });
    assert.ok(board.put.includes(legs[1].strike), "every snap is a listed put strike");
    assert.equal(labSnapLabel(modelOf(legs, ch), 1), LEARN_WORDS.snap(legs[1].strike, "put", modelOf(legs, ch).prices[1]),
      "the label above the finger shows the strike it snaps to and its model price");
    assert.match(labSnapLabel(modelOf(legs, ch), 1), new RegExp(`^${legs[1].strike} P · \\$\\d+\\.\\d\\d$`));
  }
  assert.equal(legs[1].strike, 382, "24px right is 12 dollars: 370 → 382, whatever the height did");
  assert.ok(Math.max(...ys) - Math.min(...ys) === 28, "the finger wobbled 28px up and down");
  assert.equal(labDragTo(legs, 1, board, { ...hold, price: P(X(370) + 3) })[1].strike, 370, "back where it was held: back on 370");
  assert.equal(labDragTo(legs, 1, board, { startStrike: null, startPrice: 1, price: 2 }), legs, "no hold, no move");
});
test("76.2 TWO LEGS ON ONE STRIKE are drawn side by side and BOTH are reachable; every band ≥ 44px where there is room", () => {
  const xs = labPointXs([100, 100, 200, 300]);
  assert.equal(xs[1] - xs[0], POINT_GAP, "side by side, 22px apart"); assert.equal((xs[0] + xs[1]) / 2, 100, "centred on their strike");
  assert.equal(xs[2], 200); assert.equal(xs[3], 300);
  const z = labHitZones(xs, { left: 0, right: 400 });
  z.forEach((zn, i) => assert.ok(zn.x0 <= xs[i] && xs[i] <= zn.x1, `band ${i} holds its point`));
  z.forEach((zn, i) => assert.ok(zn.x1 - zn.x0 >= HIT_MIN, `band ${i} is ${zn.x1 - zn.x0}px`));
  for (let i = 0; i < z.length; i++) for (let j = i + 1; j < z.length; j++) assert.ok(z[i].x1 <= z[j].x0 || z[j].x1 <= z[i].x0, `bands ${i} and ${j} do not overlap`);
  assert.equal(labPointAt(z, xs[0]), 0); assert.equal(labPointAt(z, xs[1]), 1, "the second leg on the strike is its own target");
  assert.equal(labPointAt(z, 380), null, "past every band: the picture, not a point (the crosshair, or the page's scroll)");
  // Crowded: three strikes 8px apart are spread to 22px; their bands split the space and never overlap.
  const cx = labPointXs([200, 208, 216]);
  assert.ok(cx[1] - cx[0] >= POINT_GAP - 1e-9 && cx[2] - cx[1] >= POINT_GAP - 1e-9);
  const cz = labHitZones(cx, { left: 0, right: 400 });
  cz.forEach((zn, i) => assert.equal(labPointAt(cz, cx[i]), i));
  // At the picture's edge a band stays inside it.
  assert.ok(labHitZones([5], { left: 0, right: 400 })[0].x0 >= 0);
});
test("76.1 LABELS IN ONE LANE never overlap and stay inside the picture", () => {
  const x = labLane([{ x: 10, w: 30 }, { x: 20, w: 30 }, { x: 380, w: 40 }], { left: 0, right: 400 });
  assert.ok(x[1] >= x[0] + 30, "pushed right of the first"); assert.ok(x[2] + 40 <= 400, "pulled back inside");
});
test("76.3 A LEG'S NAME IS IBKR'S AND ITS SYMBOL THE CHAIN'S: 'Short GLD Nov27'26 361 Put'; no symbol listed, none built", () => {
  const ch = chainOf();
  ch.byExp["2026-11-27"].puts[361] = { ...ch.byExp["2026-11-27"].puts[361], occ: "GLD261127P00361000" };
  const m = modelOf([L(1, "put", 340), L(-1, "put", 361)], ch);
  const rows = labLegRows(m, boardStrikes(ch, "2026-11-27"), ch);
  assert.equal(rows[1].name, "Short GLD Nov27'26 361 Put"); assert.equal(rows[1].occ, "GLD261127P00361000");
  assert.equal(rows[0].name, "Long GLD Nov27'26 340 Put"); assert.equal(rows[0].occ, null, "the chain gave no symbol: none");
  assert.equal(labLegName("SLV", "2026-11-27", L(-1, "put", 49.5)), "Short SLV Nov27'26 49.5 Put");
  assert.equal(labLegName("GLD", "2026-11-27", L(-1, "call", 400, 2)), "Short 2 × GLD Nov27'26 400 Call");
  assert.equal(labLegOcc(ch, "2026-11-27", L(1, "call", 999)), null);
  assert.equal(labLegRows(m, boardStrikes(ch, "2026-11-27"))[1].occ, null, "no chain handed in: no symbol");
});

/* ================================================================ NOTHING IS SENT FROM HERE */
test("NOTHING SENDS, SAVES OR CALLS OUT: learnView.js and learn.jsx import no order path and call no server", () => {
  for (const f of ["src/learnView.js", "src/learn.jsx"]) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const bad of ["closeOrder", "modifyOrder", "./order.js", "./pro.jsx", "./build.jsx", "./App.jsx", "useTicketSend", "sendToAlpaca",
      "placeExit", "evaluateTrade", "orderBody", "fetch(", "/api/", "saveState", "setStore", "localStorage", "XMLHttpRequest"]) {
      assert.ok(!src.includes(bad), `${f} must not mention ${bad}`);
    }
  }
  const app = readFileSync("src/App.jsx", "utf8");
  const block = app.slice(app.indexOf('{tab === "learn" && !showSettings && ('), app.indexOf("{/* The chain is on its way."));
  assert.ok(block.includes("<LearnScreen") && block.length < 5000, "the Learn block is the screen and its handlers");
  for (const bad of ["saveState", "setStore", "sendToAlpaca", "evaluateTrade", "fetch(", "openOnBuild", "setLegs("]) {
    assert.ok(!block.includes(bad), `the Learn block must not ${bad}`);
  }
  assert.ok(/const \[lab, setLab\] = useState\(/.test(app) && !/serverPayload[\s\S]{0,400}\blab\b/.test(app.slice(app.indexOf("function serverPayload"), app.indexOf("function serverPayload") + 600)),
    "the lab lives in memory: it is not in the /api/state payload");
});
test("THE LAB KEEPS ITS MARKET once it holds a leg (Build moving elsewhere must not leave these strikes on another board)", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("const editLab = (f) => setLab((l) => ({ ...l, ticker: l.ticker || labTk, legs: f(l.legs)"), "every edit pins it");
  const block = app.slice(app.indexOf('{tab === "learn" && !showSettings && ('), app.indexOf("{/* The chain is on its way."));
  assert.ok(block.includes("legs: g.legs, figureId: g.id") && /ticker: l\.ticker \|\| labTk, legs: g\.legs/.test(block), "a gallery figure pins it");
  assert.equal((block.match(/ticker: l\.ticker \|\| labTk, expKey: next/g) || []).length, 2, "so does a change of expiry");
  assert.ok(app.includes("labAsked.current.has(labTk)"), "one chain request per market");
});
test("ONE HOME FOR THE LAB'S WORDS: learn.jsx spells none of LEARN_WORDS' sentences itself", () => {
  const jsx = readFileSync("src/learn.jsx", "utf8");
  for (const w of ["model price", "nothing is sent", "The app never sends", "Tap one to load", "Drag a blue point", "cancel out"]) {
    assert.ok(!jsx.includes(w), `learn.jsx spells "${w}": it belongs in LEARN_WORDS`);
  }
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
