// src/learnView.js — THE FIGURE LAB'S ARITHMETIC (PR 74, owner 20 Oct 2026). Plain JS; learn.jsx draws, this computes.
//
// What the owner asked: "Education, the figure lab, as on IBKR Campus — tabs that add a long or short call or put,
// blue points to drag, a card per figure", on a real market (its price, the strikes its chain lists and their implied
// volatility), the premiums the model's: Black-Scholes on each leg's OWN implied volatility (`bs()`, engine.js), said as
// a model price. A lone sold option is allowed here, to learn what it does, and it is never sent.
//
// NOTHING HERE SENDS, SAVES OR CALLS OUT. No order body, no gate call, no fetch, no /api/state: the lab is a drawing
// board. learn.test.js reads this file and learn.jsx and fails on any of it. The bridge from a figure to the chain and
// Build is PR 75's.
//
// A leg is chosen on its own type's listed strikes (`boardStrikes()` / `strikesFor()`, chain.js), as everywhere else
// (PR 70): a tab adds at the strike nearest today's price, − / + and a drag move to the next listed strike, a gallery
// figure snaps each leg onto its type's board. Never a strike the chain did not list.
import { bs, legsAt } from "./engine.js";
import { boardStrikes, strikesFor, spotOf, atmIv } from "./chain.js";
import { RULES, figureOf, LAB_FIGURES, LAB_TABS, FIGURE_NAMES, LEARN_WORDS, exactExtremes, payoffCeiling, needsText,
  NO_CEILING, known, labWhereLine, labLegText, labLegName, exitPlanOf, marketChanceOf, MARKET_CHANCE_NOT_READ, dayWords } from "./rules.js";
import { exitCurve } from "./tradeChart.js";
import { undefinedRiskLegs } from "./riskGate.js";
import { MLEG_MAX_LEGS } from "./alpacaContract.js";

/** The most legs the lab holds: what one combination order may carry (Alpaca's mleg, read, never changed). */
export const LAB_MAX_LEGS = MLEG_MAX_LEGS;

/** The expiry the lab opens on: the listed one nearest the target entry (RULES.targetEntryDTE), at least a day out. */
export function labExpiry(chain, want = RULES.targetEntryDTE) {
  const exps = Array.isArray(chain?.expirations) ? chain.expirations.filter((e) => (chain.byExp?.[e]?.dte ?? -1) >= 1) : [];
  if (!exps.length) return null;
  return exps.reduce((b, e) => (Math.abs(chain.byExp[e].dte - want) < Math.abs(chain.byExp[b].dte - want) ? e : b), exps[0]);
}
/** The expiry one step before (dir −1) or after (+1); the same one at either end. */
export function labStepExpiry(chain, expKey, dir) {
  const exps = Array.isArray(chain?.expirations) ? chain.expirations.filter((e) => (chain.byExp?.[e]?.dte ?? -1) >= 1) : [];
  const i = exps.indexOf(expKey);
  if (i < 0) return labExpiry(chain);
  return exps[Math.max(0, Math.min(exps.length - 1, i + Math.sign(dir)))];
}

/** The index of the listed strike nearest `price` (ties to the lower). */
const nearestIndex = (ks, price) => ks.reduce((b, k, i) => (Math.abs(k - price) < Math.abs(ks[b] - price) ? i : b), 0);

/** A tab's option, at the strike its type lists nearest today's price. The legs unchanged at the cap or with no board. */
export function labAddLeg(legs = [], tabId, board, spot) {
  const tab = LAB_TABS.find((t) => t.id === tabId);
  const ks = tab ? strikesFor(board, tab.type) : null;
  if (!tab || !ks || !ks.length || !known(spot) || legs.length >= LAB_MAX_LEGS) return legs;
  return [...legs, { side: tab.side, type: tab.type, strike: ks[nearestIndex(ks, Number(spot))], qty: 1 }];
}
/** Leg `i` to the next listed strike of its type, up (+1) or down (−1); unchanged at the end of the board. */
export function labStepLeg(legs = [], i, dir, board) {
  const l = legs[i];
  const ks = l ? strikesFor(board, l.type) : null;
  if (!l || !ks || !ks.length) return legs;
  const at = ks.indexOf(Number(l.strike));
  const from = at >= 0 ? at : nearestIndex(ks, Number(l.strike));
  const to = Math.max(0, Math.min(ks.length - 1, from + Math.sign(dir)));
  if (ks[to] === l.strike) return legs;
  return legs.map((x, j) => (j === i ? { ...x, strike: ks[to] } : x));
}
/** Can leg `i` move that way? (− and + say so instead of doing nothing.) */
export function labCanStep(legs = [], i, dir, board) {
  const l = legs[i];
  const ks = l ? strikesFor(board, l.type) : null;
  if (!l || !ks || !ks.length) return false;
  const at = ks.indexOf(Number(l.strike));
  return dir > 0 ? at < ks.length - 1 : at > 0;
}
/** A drag: leg `i` onto the listed strike of its type nearest `price`. */
export function labMoveLeg(legs = [], i, price, board) {
  const l = legs[i];
  const ks = l ? strikesFor(board, l.type) : null;
  if (!l || !ks || !ks.length || !known(price)) return legs;
  const k = ks[nearestIndex(ks, Number(price))];
  return k === l.strike ? legs : legs.map((x, j) => (j === i ? { ...x, strike: k } : x));
}
/** Long ↔ short on leg `i`. */
export const labFlipLeg = (legs = [], i) => legs.map((x, j) => (j === i ? { ...x, side: -Number(x.side) } : x));
/** Leg `i` taken away. */
export const labRemoveLeg = (legs = [], i) => legs.filter((_, j) => j !== i);

/**
 * A GALLERY FIGURE ON THIS BOARD: each leg's `moves` (expected moves from the money; `sd` is one expected move in
 * dollars, today's price × the at-the-money IV × √(days ÷ 365)) snapped to a strike its type lists. Three things keep a
 * figure itself on any board (learn.test.js lays every one out on fine, coarse and gappy boards and names it back):
 *   · the at-the-money strike is one both types list when the figure has a call AND a put there (an iron butterfly's
 *     two sold legs share it);
 *   · a pair of legs at −m and +m sits the same distance either side of it, on the listed width nearest m × sd that
 *     both sides list (a butterfly's wings are equal);
 *   · legs with different `moves` never share a strike: on a coarse board the farther one steps out a strike.
 * Without an expected move, one move is four listed strikes. Null when the board cannot hold the figure.
 */
export function labFigureLegs(id, { board, spot, sd = null } = {}) {
  const fig = LAB_FIGURES.find((f) => f.id === id);
  if (!fig || !board || !known(spot)) return null;
  const S = Number(spot);
  const types = [...new Set(fig.legs.map((l) => l[1]))];
  const atZero = types.filter((t) => fig.legs.some((l) => l[1] === t && l[2] === 0));
  let shared = null;
  if (atZero.length === 2) {
    const c = strikesFor(board, "call") || [], p = new Set(strikesFor(board, "put") || []);
    const both = c.filter((k) => p.has(k));
    if (both.length) shared = both[nearestIndex(both, S)];
  }
  const out = new Array(fig.legs.length);
  for (const type of types) {
    const ks = strikesFor(board, type);
    if (!ks || !ks.length) return null;
    const mine = fig.legs.map((l, i) => ({ l, i })).filter(({ l }) => l[1] === type);
    const atm = shared != null && ks.includes(shared) ? ks.indexOf(shared) : nearestIndex(ks, S);
    const k0 = ks[atm];
    const per = known(sd) && sd > 0 ? Number(sd) : null;
    const moves = [...new Set(mine.map(({ l }) => l[2]))].sort((a, b) => a - b);
    const idxOf = new Map();
    for (const m of moves) {
      const want = m === 0 ? atm : per ? nearestIndex(ks, k0 + m * per) : atm + Math.round(m * 4);
      idxOf.set(m, Math.max(0, Math.min(ks.length - 1, want)));
    }
    // A pair at −m and +m: one width, listed on both sides of the money, nearest what the two snapped to.
    for (const m of moves.filter((x) => x > 0 && moves.includes(-x))) {
      const wantW = (Math.abs(ks[idxOf.get(m)] - k0) + Math.abs(k0 - ks[idxOf.get(-m)])) / 2;
      const set = new Set(ks);
      const widths = ks.filter((k) => k > k0 && set.has(k0 - (k - k0))).map((k) => k - k0);
      if (!widths.length) continue;
      const w = widths.reduce((b, x) => (Math.abs(x - wantW) < Math.abs(b - wantW) ? x : b), widths[0]);
      idxOf.set(m, ks.indexOf(k0 + w)); idxOf.set(-m, ks.indexOf(k0 - w));
    }
    // Keep the order of the moves on the board: the one nearest 0 stays put, the others step outward if needed.
    const zero = moves.includes(0) ? 0 : moves.reduce((b, m) => (Math.abs(m) < Math.abs(b) ? m : b), moves[0]);
    const up = moves.filter((m) => m > zero), down = moves.filter((m) => m < zero).reverse();
    let last = idxOf.get(zero);
    for (const m of up) { last = Math.max(idxOf.get(m), last + 1); idxOf.set(m, last); }
    last = idxOf.get(zero);
    for (const m of down) { last = Math.min(idxOf.get(m), last - 1); idxOf.set(m, last); }
    if ([...idxOf.values()].some((x) => x < 0 || x >= ks.length)) return null;
    for (const { l, i } of mine) out[i] = { side: l[0], type, strike: ks[idxOf.get(l[2])], qty: l[3] || 1 };
  }
  return out;
}

/** One expected move to the expiry, in dollars: price × ATM IV × √(days ÷ 365). Null when either is unknown. */
export function labExpectedMove(chain, expKey) {
  const S = spotOf(chain);
  const b = chain?.byExp?.[expKey];
  const atm = atmIv(chain);
  if (!S || !b || !atm || !known(b.dte)) return null;
  return S * Number(atm.iv) * Math.sqrt(Math.max(1, b.dte) / 365);
}

/** The implied volatility the chain lists for this leg's own strike and type; null when it lists none. */
export function legIv(chain, expKey, leg) {
  const b = chain?.byExp?.[expKey];
  const q = b && b[leg.type === "call" ? "calls" : "puts"]?.[leg.strike];
  const iv = q ? Number(q.iv) : NaN;
  return Number.isFinite(iv) && iv > 0 ? iv : null;
}

/**
 * EVERYTHING THE LAB SHOWS FOR ONE SET OF LEGS. `bandsOf` is `payoffBands()` (visuals.jsx, the one home for zones and
 * breakevens), handed in because this file is plain JS. Per combination of the legs as given, in dollars:
 *   prices     each leg's model price per share (null when the chain lists no IV for it — never a guess)
 *   net        Σ side × qty × price: positive costs, negative collects (null if any leg has no price)
 *   bands      the expiry payoff's zones on a range that holds every strike and today's price
 *   maxProfit  exact (`exactExtremes()`), null with no ceiling; maxLoss exact, null when it has no floor (a sold call)
 *   uncovered  `undefinedRiskLegs()` — the gate's own question; the screen says the app never sends this
 */
export function labModel({ ticker, chain, expKey, legs = [], bandsOf }) {
  const S = spotOf(chain);
  const b = chain?.byExp?.[expKey];
  const dte = b ? b.dte : null;
  const fig = figureOf(legs);
  const prices = legs.map((l) => {
    const iv = legIv(chain, expKey, l);
    return iv != null && S && known(dte) ? bs(S, Number(l.strike), dte / 365, iv, l.type) : null;
  });
  const net = legs.length && prices.every(known)
    ? legs.reduce((a, l, i) => a + Math.sign(Number(l.side)) * Math.abs(Number(l.qty) || 1) * prices[i], 0) : null;
  const ks = legs.map((l) => Number(l.strike));
  const lo = Math.max(0.01, Math.min(...(S ? [S * 0.75] : []), ...ks.map((k) => k * 0.85)));
  const hi = Math.max(...(S ? [S * 1.25] : []), ...ks.map((k) => k * 1.15));
  const bands = legs.length && bandsOf && Number.isFinite(lo) && Number.isFinite(hi)
    ? bandsOf({ legs, entryNet: net ?? 0, spot: S, lo, hi }) : null;
  const ext = legs.length && net != null ? exactExtremes(legs, net) : null;
  const ceil = payoffCeiling(legs);
  return {
    ticker, expKey, dte, spot: S, legs, figure: fig, prices, net, bands,
    priced: net != null,
    maxProfit: ext ? ext.maxProfit : null,
    unboundedProfit: legs.length > 0 && !ceil.above,
    maxLoss: ext && ceil.below ? ext.maxLoss : null,
    unboundedLoss: legs.length > 0 && !ceil.below,
    breakevens: bands && net != null ? bands.breakevens : [],
    needs: bands && net != null ? needsText(bands, ticker) : null,
    uncovered: undefinedRiskLegs(legs).length > 0,
    missingIv: legs.map((l, i) => (prices[i] == null ? l : null)).filter(Boolean),
  };
}

const usd = (x) => `$${Math.abs(Math.round(Number(x))).toLocaleString("en-US")}`;
const px = (x) => `$${Number(x).toFixed(2)}`;
/**
 * THE CARD OF THE FIGURE BEING BUILT: its name, its risk in one line, four rows and what it needs. Dollars for the legs
 * as they are (a lot is 100 shares); "model price" said on the cost row. Null with no leg.
 */
export function labCard(m) {
  if (!m || !m.legs.length) return null;
  const rows = [];
  if (m.net == null) rows.push({ id: "net", label: "Cost", value: "—" });
  else rows.push({ id: "net", label: m.net >= 0 ? "Costs" : "Collects", value: `${usd(m.net * 100)} ${LEARN_WORDS.modelPrice}` });
  rows.push({ id: "profit", label: "Max profit", value: m.unboundedProfit ? NO_CEILING : m.maxProfit == null ? "—" : usd(m.maxProfit) });
  rows.push({ id: "loss", label: "Max loss", value: m.unboundedLoss ? LEARN_WORDS.unlimited : m.maxLoss == null ? "—" : usd(m.maxLoss) });
  rows.push({ id: "be", label: m.breakevens.length > 1 ? "Breakevens" : "Breakeven",
    value: m.breakevens.length ? m.breakevens.map((x) => Number(x).toFixed(2)).join(" · ") : "—" });
  // Legs that net to nothing (a long and a short call on one strike) are a figure with no name and no risk: said so.
  const none = m.figure.id === "none";
  return {
    name: none ? LEARN_WORDS.cancels : m.figure.name, id: m.figure.id,
    risk: none ? { tone: "ok", text: LEARN_WORDS.cancelsNote }
      : m.uncovered ? { tone: "warn", text: LEARN_WORDS.neverSent } : { tone: "ok", text: LEARN_WORDS.defined },
    rows, needs: m.needs,
    missing: m.missingIv.map((l) => LEARN_WORDS.noIv(l.strike, l.type)),
    where: labWhereLine(m.ticker, m.expKey, m.dte),
  };
}

/** The OCC symbol the chain's listing carries for this leg (`occ` on the board's quote), or null — never one built. */
export function labLegOcc(chain, expKey, leg) {
  const q = chain?.byExp?.[expKey]?.[leg && leg.type === "call" ? "calls" : "puts"]?.[leg && leg.strike];
  return q && typeof q.occ === "string" && q.occ ? q.occ : null;
}

/**
 * A leg's row: its words, its model price, and whether − / + can move it. Since PR 76 (76.3) also its name the way IBKR
 * writes it ("Short SLV Nov27'26 49.5 Put", `labLegName()`) and, when the chain gives one, its OCC symbol (`chain` handed
 * in; without it, or without a symbol, none).
 */
export function labLegRows(m, board, chain = null) {
  if (!m) return [];
  return m.legs.map((l, i) => ({
    i, text: labLegText(l), name: labLegName(m.ticker, m.expKey, l), occ: chain ? labLegOcc(chain, m.expKey, l) : null,
    side: Number(l.side) > 0 ? "long" : "short", strike: l.strike, type: l.type,
    price: m.prices[i] == null ? "—" : `${px(m.prices[i])} ${LEARN_WORDS.modelPrice}`,
    canMinus: labCanStep(m.legs, i, -1, board), canPlus: labCanStep(m.legs, i, 1, board),
  }));
}

/** The gallery on this market: each figure's legs on the board and its model, or null where the board cannot hold it. */
export function labGallery({ ticker, chain, expKey, bandsOf }) {
  const board = boardStrikes(chain, expKey);
  const spot = spotOf(chain);
  const sd = labExpectedMove(chain, expKey);
  return LAB_FIGURES.map((f) => {
    const legs = labFigureLegs(f.id, { board, spot, sd });
    return { id: f.id, name: FIGURE_NAMES[f.id], idea: f.idea, legs,
      model: legs ? labModel({ ticker, chain, expKey, legs, bandsOf }) : null };
  });
}

/* =====================================================================================================================
   PR 76 (owner, 20 Oct 2026): "The graph is too simple" and "dragging works with a finger but not well". What the
   picture reads and where a finger lands, worked out here so it is tested without a browser; `FigureChart`
   (visuals.jsx) only draws it.
===================================================================================================================== */

/** Round ticks over [lo, hi]: about `want` of them, on a 1 · 2 · 2.5 · 5 step. */
export function niceTicks(lo, hi, want = 4) {
  if (lo == null || hi == null) return [];              // unknown is not zero (Number(null) is 0)
  const a = Number(lo), b = Number(hi);
  if (!Number.isFinite(a) || !Number.isFinite(b) || !(b > a) || !(want >= 1)) return [];
  const raw = (b - a) / want;
  const m = 10 ** Math.floor(Math.log10(raw));
  const ticksOf = (step) => {
    const out = [];
    for (let n = Math.ceil(a / step - 1e-9); n * step <= b + 1e-9; n++) out.push(+(n * step).toFixed(10));
    return out;
  };
  // The round step whose ticks come nearest the count asked for (a tie to the wider step), never fewer than two ticks
  // when a finer round step gives two.
  const steps = [0.5, 1, 2, 2.5, 5, 10].map((k) => k * m);
  let best = null;
  for (const st of steps) {
    const t = ticksOf(st);
    const score = Math.abs(t.length - want) + (t.length < 2 ? 10 : 0);
    if (!best || score < best.score || (score === best.score && st > best.st)) best = { st, t, score };
  }
  return best.t;
}

/** The day the plan's time exit falls: the expiry less `exitDTE` days, "YYYY-MM-DD"; null when the expiry is unknown. */
export function labExitDay(expKey, exitDTE) {
  const t = Date.parse(`${String(expKey || "").slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t) || !known(exitDTE)) return null;
  return new Date(t - Number(exitDTE) * 86400000).toISOString().slice(0, 10);
}

/**
 * THE TWO OTHER CURVES (76.1): the P&L TODAY (T+0) and ON THE EXIT DAY, for the legs as given (a lot is 100 shares), on
 * the expiry curve's own prices. Each leg on its OWN implied volatility (`legsAt()`, engine.js — the lab's premiums are
 * the same Black-Scholes, so today's curve is zero at today's price); the exit day is the plan's (`exitPlanOf()`: Learn
 * has no trade, so the defaults, the 21 days Build starts from) through Build's own `exitCurve()`. No curve when a leg has
 * no volatility or no price (never a guess); no exit curve when the expiry is already inside the exit window.
 * @returns { today, exit: [{ s, pnl }] | null, ivs, exitDTE, exitDay, inside }
 */
export function labCurves(m, chain, plan = exitPlanOf({})) {
  const exitDTE = plan.exitDTE;
  const none = { today: null, exit: null, ivs: null, exitDTE, exitDay: labExitDay(m && m.expKey, exitDTE), inside: false,
    legs: m && Array.isArray(m.legs) ? m.legs.length : 0 };
  if (!m || !m.bands || m.net == null || !m.legs.length || !known(m.dte)) return none;
  const ivs = m.legs.map((l) => legIv(chain, m.expKey, l));
  if (ivs.some((v) => v == null)) return none;
  const today = m.bands.samples.map((p) => ({ s: p.s, pnl: (legsAt(m.legs, p.s, m.dte, ivs).value - m.net) * 100 }));
  const ex = exitCurve({ legs: m.legs, entryNet: m.net, curve: m.bands.samples.map((p) => ({ s: p.s, exp: p.pnl })), ivs, dte: m.dte, exitDTE });
  return { ...none, today, ivs, exit: ex ? ex.map((c) => ({ s: c.s, pnl: c.exp })) : null, inside: !ex && Number(m.dte) <= exitDTE };
}

/**
 * THE CROSSHAIR'S SENTENCE (76.1): at a price, what the legs make at expiry and today. "at 13.40 → +$85 at expiry · +$40
 * today". Without a model price the P&L is unknown and the sentence says so.
 */
export function labReadout(m, curves, s) {
  if (!m || !m.legs.length || !known(s)) return null;
  const x = Number(s);
  if (m.net == null || !m.bands) return LEARN_WORDS.readoutNoPrice(x);
  const today = curves && curves.ivs ? (legsAt(m.legs, x, m.dte, curves.ivs).value - m.net) * 100 : null;
  return LEARN_WORDS.readout(x, m.bands.at(x), today);
}

/**
 * MAX PROFIT AND MAX LOSS ON THE PICTURE (76.1): the card's own figures (`exactExtremes()` through `labModel()`), never
 * re-read off the curve — the curve only says WHERE to write them: over the longest flat stretch at that level, or at the
 * strike where a peak is; at the chart's edge, "no ceiling" / "unlimited" as the card says; and a best or worst case that
 * sits at a price of zero (a long put's profit, a sold put's loss) at the left edge, saying so.
 * @returns [{ id: "profit" | "loss", s, pnl, edge: null | "left" | "right", text }]
 */
export function labExtremes(m) {
  if (!m || !m.bands || m.net == null || !m.legs.length || m.figure.id === "none") return [];
  const ss = m.bands.samples;
  const pn = ss.map((p) => p.pnl);
  const span = Math.max(...pn) - Math.min(...pn) || 1;
  const tol = Math.max(0.5, span * 0.01);
  const ks = m.legs.map((l) => Number(l.strike)).filter((k) => k >= m.bands.lo && k <= m.bands.hi);
  const place = (id, value, unbounded, isTop) => {
    const word = id === "profit" ? LEARN_WORDS.chartProfit : LEARN_WORDS.chartLoss;
    if (unbounded) {
      const right = isTop ? pn[pn.length - 1] >= pn[0] : pn[pn.length - 1] <= pn[0];
      const e = right ? ss[ss.length - 1] : ss[0];
      return { id, s: e.s, pnl: e.pnl, edge: right ? "right" : "left", text: word(null) };
    }
    if (!known(value)) return null;
    const v = Number(value);
    // Visible: a strike (or the flat between two) reaches it on this range.
    const atStrike = ks.find((k) => Math.abs(m.bands.at(k) - v) < 0.01);
    if (atStrike == null) return { id, s: ss[0].s, pnl: ss[0].pnl, edge: "left", text: word(v, true) };
    let best = null, run = null;
    ss.forEach((p, i) => {
      if (Math.abs(p.pnl - v) <= tol) { run = run ? { ...run, b: i } : { a: i, b: i }; if (!best || run.b - run.a > best.b - best.a) best = run; }
      else run = null;
    });
    const s = best && best.b > best.a ? (ss[best.a].s + ss[best.b].s) / 2 : atStrike;
    return { id, s, pnl: v, edge: null, text: word(v) };
  };
  return [place("profit", m.maxProfit, m.unboundedProfit, true), place("loss", m.maxLoss, m.unboundedLoss, false)].filter(Boolean);
}

/**
 * THE MARKET'S DISTRIBUTION AS A BAND (76.1): one expiry's `impliedDistribution()` (the PR 67 method, Build's fit, handed
 * in) cut to the chart's price range, each segment's density (its probability ÷ its width) as a share of the densest.
 * Empty when the distribution was not read.
 */
export function labDensity(dist, lo, hi) {
  if (!dist || !dist.ok || !Array.isArray(dist.segments) || !(Number(hi) > Number(lo))) return [];
  const segs = dist.segments.map((g) => ({ lo: Math.max(lo, g.lo), hi: Math.min(hi, g.hi), d: g.hi > g.lo ? g.p / (g.hi - g.lo) : 0 }))
    .filter((g) => g.hi > g.lo && g.d > 0);
  const top = segs.length ? Math.max(...segs.map((g) => g.d)) : 0;
  return top > 0 ? segs.map((g) => ({ lo: g.lo, hi: g.hi, w: g.d / top })) : [];
}

/** The line under the picture: the market's chance of profit at expiry, at the lab's MODEL net (said), or why not. */
export function labMarketLine(m, dist) {
  if (!m || !m.legs.length) return null;
  const mk = marketChanceOf({ dist, legs: m.legs, entryNet: m.net });
  if (mk.pop != null) return { pop: mk.pop, text: LEARN_WORDS.marketChance(mk.pop) };
  return { pop: null, text: MARKET_CHANCE_NOT_READ[mk.reason] || MARKET_CHANCE_NOT_READ.noBoard };
}

/**
 * THE LEGEND UNDER THE PICTURE (76.1): three entries — at expiry, today, the exit date (its day and its days before the
 * expiry) — each saying when it cannot be drawn. Null with no leg.
 */
export function labLegend(curves) {
  if (!curves || !curves.legs) return null;                // no leg, no curve to name
  const n = curves.exitDTE;
  return [
    { id: "expiry", text: LEARN_WORDS.legendExpiry, drawn: true },
    { id: "today", text: curves.today ? LEARN_WORDS.legendToday : LEARN_WORDS.legendNoCurves, drawn: !!curves.today },
    { id: "exit", text: curves.exit ? LEARN_WORDS.legendExit(dayWords(curves.exitDay), n)
      : curves.inside ? LEARN_WORDS.legendExitInside(n) : null, drawn: !!curves.exit },
  ].filter((e) => e.text);
}

/** The label above a held point (76.2): the strike it snaps to and that leg's model price, "49.5 P · $1.12". */
export function labSnapLabel(m, i) {
  const l = m && m.legs[i];
  if (!l) return null;
  return LEARN_WORDS.snap(l.strike, l.type, m.prices[i]);
}

/* ---- WHERE A FINGER LANDS (76.2) ---- */
/** Points closer than this are spread apart (legs on one strike sit side by side), in pixels. */
export const POINT_GAP = 22;
/** A finger's target: at least this wide, in pixels (WCAG's 44). */
export const HIT_MIN = 44;

/**
 * WHERE EACH POINT IS DRAWN: at its strike, except that points closer than `gap` pixels are spread apart in their order
 * (two legs on one strike side by side), the group centred where its strikes are. Pure: `xs` in, `xs` out.
 */
export function labPointXs(xs = [], gap = POINT_GAP) {
  const order = xs.map((x, i) => ({ x: Number(x), i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const out = new Array(xs.length);
  for (let a = 0; a < order.length;) {
    let b = a;
    while (b + 1 < order.length && order[b + 1].x - order[b].x < gap) b++;
    const n = b - a + 1;
    const centre = order.slice(a, b + 1).reduce((s, p) => s + p.x, 0) / n;
    // A group spreads only as far as it must: an even spacing of `gap`, centred on its strikes' mean.
    for (let j = 0; j < n; j++) out[order[a + j].i] = n === 1 ? order[a].x : centre + (j - (n - 1) / 2) * gap;
    a = b + 1;
  }
  // Spreading one group can bring it within `gap` of the next: once more until it holds (a handful of points).
  const again = order.some((p, k) => k && out[p.i] - out[order[k - 1].i] < gap - 1e-9);
  return again && xs.length > 1 && xs.length <= 8 ? labPointXs(out, gap) : out;
}

/**
 * WHERE EACH POINT TAKES A FINGER: one vertical band per point, the whole height of its dotted guide. Each band holds its
 * own point, never overlaps another, and is at least `min` wide wherever the neighbours leave room (two points closer
 * than that split the space between them at the midpoint, then each widens on its free side). Inside [left, right].
 * @returns [{ x0, x1 }] in the order of `xs`
 */
export function labHitZones(xs = [], { left = -Infinity, right = Infinity, min = HIT_MIN } = {}) {
  const order = xs.map((x, i) => ({ x: Number(x), i })).sort((a, b) => a.x - b.x || a.i - b.i);
  const z = order.map((p) => ({ x0: Math.max(left, p.x - min / 2), x1: Math.min(right, p.x + min / 2) }));
  for (let k = 1; k < z.length; k++) {
    if (z[k - 1].x1 > z[k].x0) { const mid = (order[k - 1].x + order[k].x) / 2; z[k - 1].x1 = mid; z[k].x0 = mid; }
  }
  for (let k = 0; k < z.length; k++) {
    const short = min - (z[k].x1 - z[k].x0);
    if (short <= 0) continue;
    const freeL = z[k].x0 - (k ? z[k - 1].x1 : left), freeR = (k + 1 < z.length ? z[k + 1].x0 : right) - z[k].x1;
    const takeL = Math.min(freeL, short), takeR = Math.min(freeR, short - takeL);
    z[k].x0 -= takeL; z[k].x1 += takeR;
  }
  const out = new Array(xs.length);
  order.forEach((p, k) => { out[p.i] = z[k]; });
  return out;
}

/** Which point a finger at `x` holds: the band it is in, or null. */
export const labPointAt = (zones = [], x) => {
  const i = zones.findIndex((zn) => zn && x >= zn.x0 && x <= zn.x1);
  return i >= 0 ? i : null;
};

/**
 * A DRAG, RELATIVE TO WHERE IT WAS HELD: the leg moves by how far the finger moved SIDEWAYS since it pressed — never by
 * the height (a thumb is never level) — onto the listed strike of its type nearest (`labMoveLeg()`). A point drawn beside
 * its strike (one of two on a strike) does not jump on the first move.
 */
export function labDragTo(legs, i, board, { startStrike, startPrice, price }) {
  if (!known(startStrike) || !known(startPrice) || !known(price)) return legs;
  return labMoveLeg(legs, i, Number(startStrike) + (Number(price) - Number(startPrice)), board);
}

/** Labels in one lane, in order, never overlapping: each `{ x, w }` (its left edge, its width) moved right as little as
 *  it must, then the lane pulled back inside `right`. Returns the left edges. */
export function labLane(items = [], { left = 0, right = Infinity, gap = 4 } = {}) {
  const order = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.x - b.x || a.i - b.i);
  let end = left - gap;
  const xs = order.map((it) => { const x = Math.max(it.x, end + gap, left); end = x + it.w; return x; });
  for (let k = order.length - 1, lim = right; k >= 0; k--) {
    if (xs[k] + order[k].w > lim) xs[k] = lim - order[k].w;
    lim = xs[k] - gap;
  }
  const out = new Array(items.length);
  order.forEach((it, k) => { out[it.i] = xs[k]; });
  return out;
}

export { boardStrikes };
