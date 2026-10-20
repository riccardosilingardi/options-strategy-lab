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
import { bs } from "./engine.js";
import { boardStrikes, strikesFor, spotOf, atmIv } from "./chain.js";
import { RULES, figureOf, LAB_FIGURES, LAB_TABS, FIGURE_NAMES, LEARN_WORDS, exactExtremes, payoffCeiling, needsText,
  NO_CEILING, known, labWhereLine, labLegText } from "./rules.js";
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

/** A leg's row: its words, its model price, and whether − / + can move it. */
export function labLegRows(m, board) {
  if (!m) return [];
  return m.legs.map((l, i) => ({
    i, text: labLegText(l), side: Number(l.side) > 0 ? "long" : "short", strike: l.strike, type: l.type,
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

export { boardStrikes };
