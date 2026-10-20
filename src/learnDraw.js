// ============================================================================
// src/learnDraw.js — A FIGURE DRAWN WITH A FINGER, RECOGNISED ON THE REAL MARKET (PR 77; owner 20 Oct 2026: "Learn is
// missing the manual drawing"; the prompt: "the owner draws the payoff shape he wants and the app says which figure it
// is, on the real market").
//
// Plain JS, no React and no browser: the picture (visuals.jsx) hands in the stroke in its own units — price across, P&L
// up — and this says which figures look like it. Nothing here sends, saves or calls out (learn.test.js reads it).
//
//   1. RESAMPLE the stroke onto a grid of prices across the span it covers (DRAW_GRID points), straight between the
//      finger's own samples; SMOOTH it (a short moving average) and NORMALISE it by its largest |P&L| — the scale of a
//      drawing means nothing, its sign does (where it is above or below zero).
//   2. CUT IT INTO SEGMENTS (Douglas–Peucker on the normalised curve, then each piece read as rising, falling or flat) and
//      read the KINKS (the prices where one segment meets the next) and each flat's SIGN (above, below or near zero). A
//      long call is "F− U"; a bull put spread "F− U F+"; an iron condor "F− U F+ D F−".
//   3. LAY OUT EVERY SHAPE `DRAW_SHAPES` names (rules.js: all of FIGURE_NAMES) on the strikes the chain lists for each
//      leg's own type (`strikesFor()`, a slot shared by a call and a put on a strike both list): the slots start on the
//      drawn kinks (or, where the drawing has fewer kinks than the shape has strikes, on evenly spaced prices across the
//      span), then each slot is moved one or two listed strikes at a time while that brings the shape nearer.
//   4. SCORE each laid-out shape against the drawing on the same grid, its P&L at expiry less its MODEL net (`netOf`,
//      handed in: the lab's own premiums), normalised the same way: the SEGMENT PATTERN first (an edit distance between the
//      two "F− U F+" readings), then the KINKS' positions, then the whole curve. Similarity = 1 − (0.5 pattern + 0.2 kinks
//      + 0.3 curve), each part in [0, 1].
//   5. The THREE closest, one per name (`figureOf()` of the legs laid out: the name is never this file's) and one per LINE (a
//      bull put spread draws the bull call spread's line on the same strikes: it is said in a sentence, not given a card).
//      Within two points is a tie: fewer legs first, then the one PAID when today's price already sits where it makes
//      money (a credit "stays"), else the one that PAYS (a debit "moves"), then the gallery's order.
//   6. A closest shape the app never sends (`undefinedRiskLegs()`, the gate's own question) is shown with its
//      DEFINED-RISK SIBLING first (`DEFINED_SIBLINGS`, rules.js), laid out on the same drawing.
//   7. Under `DRAW_MATCH_MIN`, or for a SCRIBBLE (a stroke the smoothing mostly took away), nothing is named: "No known
//      figure looks like this; the closest is X".
// ============================================================================
import { strikesFor } from "./chain.js";
import { DRAW_SHAPES, DEFINED_SIBLINGS, FIGURE_NAMES, LAB_FIGURES, figureOf, known } from "./rules.js";
import { undefinedRiskLegs } from "./riskGate.js";

/** Grid points the drawing is read on. */
export const DRAW_GRID = 64;
/** The stroke must cover at least this share of the picture's price range to be read. */
export const DRAW_MIN_SPAN = 0.4;
/**
 * BELOW THIS SIMILARITY NOTHING IS NAMED (chosen, PR 77, on scripts measured while it was built): nine figures drawn with a
 * tremor on fine, coarse and gappy boards, and sloppier ones (rounded corners, a tilted flat, a shorter stroke), scored
 * 0.92 or more for a figure of their own shape; twelve random walks scored 0.38–0.70 (smoothed, some honestly look like a
 * figure), zig-zags and a sine 0.28–0.44. 0.75 sits above every random walk and below every honest drawing.
 */
export const DRAW_MATCH_MIN = 0.75;
/** How many figures are shown. */
export const DRAW_SHOW = 3;
/** Two similarities this close are a tie (then fewer legs, the credit-or-debit rule, the gallery's order decide). */
export const DRAW_TIE = 0.02;

const DP_EPS = 0.1;           // Douglas–Peucker's tolerance, in normalised P&L (a drawn tremor is under it)
const FLAT_SLOPE = 0.8;       // |rise ÷ span| under this is flat (normalised P&L per whole span)
const FLAT_ZERO = 0.15;       // a flat within this of zero is "near zero"
const MIN_PIECE = 0.05;       // a segment shorter than this share of the span is folded into its neighbour
const SMOOTH_R = 3;           // the moving average's half-width, in grid points
const TWIN_RMS = 0.03;        // two figures whose normalised lines differ by less than this draw the same line
/** Past this share of the stroke taken away by the smoothing, the drawing is a scribble (chosen: a ±8% tremor takes
 *  about 0.05; a zig-zag a few strikes wide takes 0.5 or more). */
export const SCRIBBLE_WIGGLE = 0.2;

/* ---------------------------------------------------------------- 1. THE DRAWING ON A GRID */
/**
 * The stroke `[{ s, v }]` (price, P&L in the picture's units) on `n` prices across the span it covers. Null when it is
 * too short (`reason: "short"`) or has too few samples.
 */
export function resampleStroke(stroke = [], { lo, hi, n = DRAW_GRID } = {}) {
  const pts = (Array.isArray(stroke) ? stroke : []).filter((p) => p && Number.isFinite(Number(p.s)) && Number.isFinite(Number(p.v)))
    .map((p) => ({ s: Number(p.s), v: Number(p.v) })).sort((a, b) => a.s - b.s);
  if (pts.length < 6) return { ok: false, reason: "short" };
  // One value per price: a finger that went back over a price is averaged there.
  const uniq = [];
  for (const p of pts) {
    const last = uniq[uniq.length - 1];
    if (last && Math.abs(last.s - p.s) < 1e-9) { last.v = (last.v * last.k + p.v) / (last.k + 1); last.k += 1; }
    else uniq.push({ ...p, k: 1 });
  }
  const s0 = uniq[0].s, s1 = uniq[uniq.length - 1].s;
  const range = known(lo) && known(hi) && hi > lo ? hi - lo : s1 - s0;
  if (uniq.length < 4 || !(s1 > s0) || (s1 - s0) < DRAW_MIN_SPAN * range) return { ok: false, reason: "short" };
  const xs = [], ys = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = s0 + ((s1 - s0) * i) / (n - 1);
    while (j + 1 < uniq.length - 1 && uniq[j + 1].s < x) j++;
    const a = uniq[j], b = uniq[Math.min(uniq.length - 1, j + 1)];
    const t = b.s > a.s ? Math.min(1, Math.max(0, (x - a.s) / (b.s - a.s))) : 0;
    xs.push(x); ys.push(a.v + t * (b.v - a.v));
  }
  return { ok: true, xs, ys };
}

/** A short moving average (a finger's tremor out, its corners kept). */
export function smoothCurve(ys = [], r = SMOOTH_R) {
  return ys.map((_, i) => {
    let s = 0, k = 0;
    for (let j = Math.max(0, i - r); j <= Math.min(ys.length - 1, i + r); j++) { s += ys[j]; k++; }
    return s / k;
  });
}

/** Divided by its largest |value|: scale gone, sign kept. Null for a line flat at zero or one that never moves. */
export function normaliseCurve(ys = []) {
  const m = Math.max(...ys.map((y) => Math.abs(y)));
  if (!(m > 1e-12)) return null;
  const n = ys.map((y) => y / m);
  if (Math.max(...n) - Math.min(...n) < 0.1) return null;     // a flat line, wherever it sits, is no figure
  return n;
}

/* ---------------------------------------------------------------- 2. SEGMENTS, KINKS, SIGNS */
function douglasPeucker(xs, ys, a, b, eps, keep) {
  let worst = -1, at = -1;
  const dx = xs[b] - xs[a], dy = ys[b] - ys[a];
  for (let i = a + 1; i < b; i++) {
    const t = dx ? (xs[i] - xs[a]) / dx : 0;
    const d = Math.abs(ys[i] - (ys[a] + t * dy));
    if (d > worst) { worst = d; at = i; }
  }
  if (worst > eps && at > a) { douglasPeucker(xs, ys, a, at, eps, keep); keep.add(at); douglasPeucker(xs, ys, at, b, eps, keep); }
}

/**
 * The curve read as segments: `[{ a, b, kind: "U" | "D" | "F", sign: "+" | "−" | "0" | null }]` (grid indices), the kinks
 * (the prices where segments meet) and the tokens ("F−", "U", "F+"). `ys` normalised, `xs` the grid's prices.
 */
export function segmentsOf(xs = [], ys = []) {
  const n = ys.length;
  if (n < 3) return { segs: [], kinks: [], tokens: [] };
  const u = xs.map((_, i) => i / (n - 1));                     // the span as 0..1, so slopes are per whole span
  const keep = new Set([0, n - 1]);
  douglasPeucker(u, ys, 0, n - 1, DP_EPS, keep);
  const v = [...keep].sort((p, q) => p - q);
  let segs = [];
  for (let k = 0; k + 1 < v.length; k++) {
    const a = v[k], b = v[k + 1];
    const slope = (ys[b] - ys[a]) / (u[b] - u[a]);
    segs.push({ a, b, kind: Math.abs(slope) < FLAT_SLOPE ? "F" : slope > 0 ? "U" : "D" });
  }
  // A sliver shorter than MIN_PIECE of the span is folded into its longer neighbour.
  let changed = true;
  while (changed && segs.length > 1) {
    changed = false;
    for (let k = 0; k < segs.length; k++) {
      if (u[segs[k].b] - u[segs[k].a] >= MIN_PIECE) continue;
      const left = segs[k - 1], right = segs[k + 1];
      const into = !left ? right : !right ? left : (u[left.b] - u[left.a] >= u[right.b] - u[right.a] ? left : right);
      if (into === left) left.b = segs[k].b; else right.a = segs[k].a;
      segs.splice(k, 1); changed = true; break;
    }
  }
  // Neighbours of one kind are one segment.
  const merged = [];
  for (const sg of segs) {
    const last = merged[merged.length - 1];
    if (last && last.kind === sg.kind) last.b = sg.b; else merged.push({ ...sg });
  }
  for (const sg of merged) {
    if (sg.kind !== "F") { sg.sign = null; continue; }
    let s = 0, k = 0;
    for (let i = sg.a; i <= sg.b; i++) { s += ys[i]; k++; }
    const mean = s / k;
    sg.sign = mean > FLAT_ZERO ? "+" : mean < -FLAT_ZERO ? "−" : "0";
  }
  return {
    segs: merged,
    kinks: merged.slice(1).map((sg) => xs[sg.a]),
    tokens: merged.map((sg) => (sg.kind === "F" ? `F${sg.sign}` : sg.kind)),
  };
}

/** The edit distance between two readings, a near-zero flat half a step from a signed one; 0 same, 1 nothing alike. */
export function patternDistance(t1 = [], t2 = []) {
  const sub = (a, b) => (a === b ? 0 : a[0] === "F" && b[0] === "F" && (a === "F0" || b === "F0") ? 0.5 : 1);
  const m = t1.length, n = t2.length;
  if (!m && !n) return 0;
  const d = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sub(t1[i - 1], t2[j - 1]));
  }
  return d[m][n] / Math.max(m, n);
}

/**
 * The drawing, read: `{ ok, xs, ys (normalised), tokens, kinks, wiggle, scribble }` or `{ ok: false, reason: "short" | "flat" }`.
 * `wiggle` is how much of the stroke the smoothing took away (its RMS, as a share of the stroke's largest value): a
 * finger's tremor takes a few hundredths, a scribble — a zig-zag faster than the smoothing — most of it. Past
 * `SCRIBBLE_WIGGLE` the drawing is a scribble and nothing is named, whatever the smoothed line looks like.
 */
export function readDrawing(stroke, { lo, hi } = {}) {
  const r = resampleStroke(stroke, { lo, hi });
  if (!r.ok) return r;
  const sm = smoothCurve(r.ys);
  const ys = normaliseCurve(sm);
  if (!ys) return { ok: false, reason: "flat" };
  const top = Math.max(...r.ys.map((y) => Math.abs(y))) || 1;
  const wiggle = Math.sqrt(r.ys.reduce((a, y, i) => a + (y - sm[i]) ** 2, 0) / r.ys.length) / top;
  const sg = segmentsOf(r.xs, ys);
  return { ok: true, xs: r.xs, ys, tokens: sg.tokens, kinks: sg.kinks, segs: sg.segs, wiggle, scribble: wiggle > SCRIBBLE_WIGGLE };
}

/* ---------------------------------------------------------------- 3. A SHAPE ON THE BOARD */
/** The strikes a slot may take: those every type on it lists (a straddle's slot: both), inside [from, to] when given. */
function slotStrikes(shape, board, from = -Infinity, to = Infinity) {
  const slots = Math.max(...shape.map((l) => l[2])) + 1;
  const out = [];
  for (let s = 0; s < slots; s++) {
    const types = [...new Set(shape.filter((l) => l[2] === s).map((l) => l[1]))];
    let ks = null;
    for (const t of types) {
      const list = strikesFor(board, t) || [];
      ks = ks == null ? list.slice() : ks.filter((k) => list.includes(k));
    }
    out.push((ks || []).filter((k) => k >= from && k <= to).sort((a, b) => a - b));
  }
  return out;
}
const nearestIdx = (ks, x) => ks.reduce((b, k, i) => (Math.abs(k - x) < Math.abs(ks[b] - x) ? i : b), 0);

/** Legs for a shape whose slots sit on these strikes (increasing). */
export const shapeLegs = (shape, strikes) => shape.map(([side, type, slot, qty]) => ({ side, type, strike: strikes[slot], qty: qty || 1 }));

/** P&L at expiry per share at each grid price, less the net. */
function pnlCurve(legs, net, xs) {
  return xs.map((x) => legs.reduce((a, l) => a + Math.sign(l.side) * (l.qty || 1) *
    (l.type === "call" ? Math.max(x - l.strike, 0) : Math.max(l.strike - x, 0)), 0) - net);
}

/* ---------------------------------------------------------------- 4. THE SCORE */
/** How near a laid-out shape draws to the drawing: `{ sim, dPat, dKink, dCurve, tokens, kinks }`. */
export function scoreAgainst(drawn, legs, net) {
  const c = normaliseCurve(pnlCurve(legs, net, drawn.xs));
  if (!c) return { sim: 0, dPat: 1, dKink: 1, dCurve: 1, tokens: [], kinks: [] };
  const sg = segmentsOf(drawn.xs, c);
  const span = drawn.xs[drawn.xs.length - 1] - drawn.xs[0];
  const dPat = patternDistance(drawn.tokens, sg.tokens);
  const dKink = drawn.kinks.length === sg.kinks.length
    ? (drawn.kinks.length ? drawn.kinks.reduce((a, k, i) => a + Math.abs(k - sg.kinks[i]), 0) / drawn.kinks.length / span : 0)
    : 0.5;
  const dCurve = Math.sqrt(drawn.ys.reduce((a, y, i) => a + (y - c[i]) ** 2, 0) / drawn.ys.length) / 2;
  const sim = 1 - (0.5 * dPat + 0.2 * Math.min(1, 3 * dKink) + 0.3 * Math.min(1, 2 * dCurve));
  return { sim, dPat, dKink, dCurve, tokens: sg.tokens, kinks: sg.kinks };
}

/** k of the n candidates, in order (n ≤ 13, k ≤ 4: at most 715). */
function combos(n, k) {
  const out = [];
  const rec = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < n; i++) { acc.push(i); rec(i + 1, acc); acc.pop(); }
  };
  rec(0, []);
  return out;
}

/**
 * ONE SHAPE LAID OUT ON THE DRAWING: its slots on the listed strikes nearest the drawn kinks (or evenly spaced prices),
 * the best start kept, then each slot moved one or two listed strikes while that raises the similarity.
 * @returns { legs, net, score } or null when the board cannot hold the shape
 */
export function fitShape(shape, drawn, board, netOf) {
  // A shape is judged on what was drawn: every strike inside the drawn span, at least a segment's width (MIN_PIECE) from its
  // ends — a strike past them, or on them, would hide a kink nobody drew.
  const span = drawn.xs[drawn.xs.length - 1] - drawn.xs[0];
  const ks = slotStrikes(shape, board, drawn.xs[0] + MIN_PIECE * span, drawn.xs[drawn.xs.length - 1] - MIN_PIECE * span);
  if (ks.some((l) => !l.length)) return null;
  const nSlots = ks.length;
  const starts = [...drawn.kinks];
  for (let q = 1; q <= 7; q++) starts.push(drawn.xs[0] + (span * q) / 8);
  const cands = [...new Set(starts.map((x) => +x.toFixed(6)))].sort((a, b) => a - b);
  // Neighbouring strikes at least a segment apart: two strikes closer than that make a kink nobody could have drawn.
  const gap = MIN_PIECE * span;
  const evalIdx = (idx) => {
    for (let s = 1; s < nSlots; s++) if (!(ks[s][idx[s]] - ks[s - 1][idx[s - 1]] >= gap - 1e-9)) return null;
    const legs = shapeLegs(shape, idx.map((i, s) => ks[s][i]));
    const n = netOf ? netOf(legs) : null;
    const net = known(n) ? Number(n) : 0;
    return { idx, legs, net, score: scoreAgainst(drawn, legs, net) };
  };
  let best = null;
  for (const pick of combos(cands.length, nSlots)) {
    const idx = pick.map((p, s) => nearestIdx(ks[s], cands[p]));
    const r = evalIdx(idx);
    if (r && (!best || r.score.sim > best.score.sim)) best = r;
  }
  if (!best) return null;
  for (let round = 0; round < 12; round++) {
    let moved = false;
    for (let s = 0; s < nSlots; s++) {
      for (const step of [-2, -1, 1, 2]) {
        const idx = best.idx.slice();
        idx[s] += step;
        if (idx[s] < 0 || idx[s] >= ks[s].length) continue;
        const r = evalIdx(idx);
        if (r && r.score.sim > best.score.sim + 1e-9) { best = r; moved = true; }
      }
    }
    if (!moved) break;
  }
  return { legs: best.legs, net: best.net, score: best.score };
}

/* ---------------------------------------------------------------- THE WINGS THAT CAP A SOLD OPTION */
/** How far beyond a sold strike its wing sits: half an expected move (chosen, PR 77), at least one listed strike. */
export const WING_MOVES = 0.5;
/**
 * THE SAME LEGS WITH THEIR LOSS CAPPED: for every sold option its type leaves uncovered (`undefinedRiskLegs()`, the gate's
 * own question), a bought one of the same type beyond it — a call above the highest uncovered sold call, a put below the
 * lowest uncovered sold put — on the strike that type lists nearest `WING_MOVES` expected moves out (four listed strikes
 * without an expected move), never on the sold strike itself. The legs given are kept as they are.
 * @returns { legs, added: [leg] } or null when nothing is uncovered, the board has no strike beyond, or the result would pass
 *          four legs (a combination order's most)
 */
export function withWings(legs = [], board, { sd = null, maxLegs = 4 } = {}) {
  const bad = undefinedRiskLegs(legs);
  if (!bad.length || !board) return null;
  const added = [];
  for (const b of bad) {
    const ks = (strikesFor(board, b.type) || []).slice().sort((x, y) => x - y);
    const sold = legs.filter((l) => l.type === b.type && Number(l.side) < 0).map((l) => Number(l.strike));
    if (!ks.length || !sold.length) return null;
    const edge = b.type === "call" ? Math.max(...sold) : Math.min(...sold);
    const at = ks.indexOf(edge) >= 0 ? ks.indexOf(edge) : nearestIdx(ks, edge);
    const dir = b.type === "call" ? 1 : -1;
    let want;
    if (known(sd) && sd > 0) {
      const target = edge + dir * WING_MOVES * Number(sd);
      want = nearestIdx(ks, target);
      if (dir > 0 ? want <= at : want >= at) want = at + dir;
    } else want = at + 4 * dir;
    want = Math.max(0, Math.min(ks.length - 1, want));
    if (ks[want] === edge || (dir > 0 ? ks[want] < edge : ks[want] > edge)) return null;
    added.push({ side: 1, type: b.type, strike: ks[want], qty: b.uncovered });
  }
  const out = [...legs.map((l) => ({ ...l })), ...added];
  return out.length > maxLegs ? null : { legs: out, added };
}

/* ---------------------------------------------------------------- 5–7. THE CLOSEST FIGURES */
const GALLERY_ORDER = LAB_FIGURES.map((f) => f.id);
const orderOf = (id) => { const g = GALLERY_ORDER.indexOf(id); return g >= 0 ? g : 100 + Object.keys(FIGURE_NAMES).indexOf(id); };

/**
 * WHICH FIGURES LOOK LIKE THIS DRAWING, on this board.
 * @param stroke  [{ s, v }]: price, P&L in the picture's units (any scale)
 * @param board   `boardStrikes()` of the expiry shown ({ call: [...], put: [...] })
 * @param spot    today's price (which of two figures with the same line comes first)
 * @param lo, hi  the picture's price range (how much of it the stroke covers)
 * @param netOf   legs → their MODEL net per share (the lab's premiums), or null
 * @param sd      one expected move to the expiry, in dollars (how far a defined-risk sibling's wings sit), or null
 * @returns { ok, reason?, drawing, matches: [{ id, name, legs, net, sim, uncovered, sibling: bool, sentence }], best, named,
 *            twin: { of, id, name } | null, all }
 *          `named` false when the best is under DRAW_MATCH_MIN; `matches` is ordered as shown, one card per line drawn;
 *          `twin` the figure drawing the same line as the best (said in a sentence, not given a card).
 */
export function recogniseDrawing({ stroke, board, spot = null, lo = null, hi = null, netOf = null, sd = null } = {}) {
  const drawing = readDrawing(stroke, { lo, hi });
  if (!drawing.ok) return { ok: false, reason: drawing.reason, drawing, matches: [] };
  if (!board) return { ok: false, reason: "board", drawing, matches: [] };
  const byId = new Map();
  for (const [shapeId, shape] of Object.entries(DRAW_SHAPES)) {
    const fit = fitShape(shape, drawing, board, netOf);
    if (!fit) continue;
    const fig = figureOf(fit.legs);
    if (!FIGURE_NAMES[fig.id]) continue;                         // a slot pair that cancelled: not this shape
    const prev = byId.get(fig.id);
    if (!prev || fit.score.sim > prev.sim) byId.set(fig.id, { id: fig.id, name: fig.name, legs: fit.legs, net: fit.net, sim: fit.score.sim, shapeId });
  }
  const profitAtSpot = (m) => known(spot) && m.legs.reduce((a, l) => a + Math.sign(l.side) * (l.qty || 1) *
    (l.type === "call" ? Math.max(spot - l.strike, 0) : Math.max(l.strike - spot, 0)), 0) - m.net > 0;
  // Ties (within two points): the same line drawn by two figures. Fewer legs first (a butterfly before an iron butterfly);
  // then the one PAID to stay when today's price already makes money, the one that PAYS to move when it does not (a bull
  // put spread or a bull call spread); then the gallery's order.
  const ranked = [...byId.values()].sort((a, b) => {
    if (Math.abs(a.sim - b.sim) > DRAW_TIE) return b.sim - a.sim;
    if (a.legs.length !== b.legs.length) return a.legs.length - b.legs.length;
    const pref = (m) => (profitAtSpot(m) ? (m.net < 0 ? 0 : 1) : (m.net > 0 ? 0 : 1));
    if (pref(a) !== pref(b)) return pref(a) - pref(b);
    return orderOf(a.id) - orderOf(b.id);
  }).map((m) => ({ ...m, uncovered: undefinedRiskLegs(m.legs).length > 0, sibling: false, sentence: null }));
  if (!ranked.length) return { ok: false, reason: "board", drawing, matches: [] };
  const best = ranked[0];
  // ONE CARD PER LINE: a figure that draws the same line as one already shown (a bull put spread beside a bull call spread
  // on the same strikes, a long guts beside a long strangle) is not given a card of its own; the first such pair is said
  // in one sentence (`twin`).
  const lineOf = (m) => normaliseCurve(pnlCurve(m.legs, m.net, drawing.xs));
  const sameLine = (a, b) => {
    const la = lineOf(a), lb = lineOf(b);
    return !!la && !!lb && Math.sqrt(la.reduce((t, y, i) => t + (y - lb[i]) ** 2, 0) / la.length) < TWIN_RMS;
  };
  const distinct = [];
  let twin = null;
  for (const m of ranked) {
    const same = distinct.find((d) => sameLine(d, m));
    if (same) { if (!twin && same === distinct[0]) twin = { of: same.id, ofNet: same.net, id: m.id, name: m.name, net: m.net }; continue; }
    distinct.push(m);
    if (distinct.length >= DRAW_SHOW + 2) break;
  }
  let shown = distinct.slice(0, DRAW_SHOW);
  // THE DEFINED-RISK SIBLING FIRST when the closest is a figure the app never sends.
  // It is the drawn figure itself with a bought option beyond each sold one it leaves uncovered (`withWings()`: the drawn
  // strikes kept, the wings past them, where the drawing has nothing to say); where that is not the sibling's shape (the
  // guts, a synthetic), the sibling laid out on the drawing like any other figure.
  const sib = best.uncovered && DEFINED_SIBLINGS[best.id] ? DEFINED_SIBLINGS[best.id] : null;
  if (sib) {
    let s = null;
    const ww = withWings(best.legs, board, { sd });
    const wid = ww ? figureOf(ww.legs).id : null;
    if (ww && (wid === sib.to || wid === `broken-${sib.to}`)) {
      const n = netOf ? netOf(ww.legs) : null;
      const net = known(n) ? Number(n) : 0;
      s = { id: wid, name: FIGURE_NAMES[wid], legs: ww.legs, net, sim: scoreAgainst(drawing, ww.legs, net).sim, uncovered: false, added: ww.added };
    } else {
      s = ranked.find((m) => m.id === sib.to) || ranked.find((m) => m.id === `broken-${sib.to}`) || null;
    }
    if (s) shown = [{ ...s, sibling: true, sentence: `${best.name} → ${s.name}: ${sib.why}` },
      ...distinct.filter((m) => m.id !== s.id).slice(0, DRAW_SHOW - 1)];
  }
  const named = best.sim >= DRAW_MATCH_MIN && !drawing.scribble;
  return { ok: true, drawing, matches: shown, best, named, twin, all: ranked };
}
