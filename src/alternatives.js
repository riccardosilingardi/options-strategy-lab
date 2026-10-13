// ============================================================================
// src/alternatives.js — THE ALTERNATIVES OF A STRUCTURE, FROM THE CHAIN (PR 4b; owner, 6 Oct 2026).
//
// "In Build it confirms the structure or not, refining it"; "if a position is not in profit it can suggest the roll
// and how, preparing it in Build". Both are the same calculation: the loaded legs moved on the board the chain LISTS
// — every strike one listed step up or down, the outer leg of each pair one step further out or in, the same strikes
// on a later expiry. It returns LEGS ONLY. Pricing (`listCardFigures()`), sizing (`scaleStrategy()`) and the gate
// (`evaluateTrade()`) are the caller's, through the same functions every card reads; the copilot recommends among
// these and never writes a strike of its own.
//
// NEVER NAME A CONTRACT THE CHAIN DID NOT LIST (CLAUDE.md): a leg that would fall off the board, onto a strike the
// expiry does not list, or onto its own pair, makes the whole alternative null — it is left out, never snapped.
// SINCE PR 70 "THE BOARD" IS PER TYPE (`boardStrikes()`): a put moves along the strikes the PUTS list, a call along the
// calls'. On the merged list a put stepped onto a strike only the calls list (XLE 27 Nov, 59.5). `strikes` below is a
// board from `boardStrikes()`, or a plain array for a board whose two sides list the same strikes (`strikesFor()`).
//
// Plain JS, no React: tested without a browser (alternatives.test.js).
// ============================================================================
import { RULES, chainQuotedLegs } from "./rules.js";
import { boardStrikes, strikesFor } from "./chain.js";
import { exactPnl } from "./engine.js";

const DAY = 86400000;
/** Days from `now` to an expiry key ("2026-12-18"), at the 4pm New York close (20:00 UTC, the same day). */
export const daysTo = (expKey, now = Date.now()) => {
  const t = Date.parse(`${expKey}T20:00:00Z`);
  return Number.isFinite(t) ? Math.round((t - now) / DAY) : null;
};
const sameLegs = (a, b) => a.length === b.length && a.every((l, i) => l.strike === b[i].strike && l.type === b[i].type && l.side === b[i].side && (l.qty || 1) === (b[i].qty || 1));

/** Every leg moved `steps` strikes its own type lists (+ up, − down); null when one leaves the board or starts off it. */
export function shiftLegs(legs = [], strikes = null, steps = 1) {
  if (!strikes || !legs.length) return null;
  const out = [];
  for (const l of legs) {
    const ks = strikesFor(strikes, l.type) || [];
    const i = ks.indexOf(Number(l.strike));
    const j = i + steps;
    if (i < 0 || j < 0 || j >= ks.length) return null;
    out.push({ ...l, strike: ks[j] });
  }
  return out;
}

/**
 * The outer leg of each pair moved one listed strike further out (`dir` +1, wider) or in (−1, narrower).
 * A pair is two legs of one type with opposite sides; the outer one is the farther from `spot`. A type with another
 * shape (a butterfly's three strikes, a single option) has no width to change: null when no pair moved.
 */
export function widthLegs(legs = [], strikes = null, spot = null, dir = 1) {
  // `Number(null)` is 0 and 0 is finite (CLAUDE.md): an unread price is null, tested before the coercion (PR 65 found it).
  if (!strikes || !legs.length || spot == null || !Number.isFinite(Number(spot))) return null;
  const out = legs.map((l) => ({ ...l }));
  let moved = 0;
  for (const type of ["call", "put"]) {
    const ks = strikesFor(strikes, type) || [];
    const idx = out.map((l, i) => (l.type === type ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 2) continue;
    const [a, b] = idx.map((i) => out[i]);
    if (Math.sign(a.side) === Math.sign(b.side)) continue;
    const outer = Math.abs(a.strike - spot) >= Math.abs(b.strike - spot) ? idx[0] : idx[1];
    const inner = outer === idx[0] ? idx[1] : idx[0];
    const away = out[outer].strike > out[inner].strike ? 1 : -1;
    const i = ks.indexOf(Number(out[outer].strike));
    const j = i + away * dir;
    if (i < 0 || j < 0 || j >= ks.length) return null;
    if (ks[j] === out[inner].strike || Math.sign(ks[j] - out[inner].strike) !== away) return null; // never onto or past its pair
    out[outer] = { ...out[outer], strike: ks[j] };
    moved += 1;
  }
  return moved ? out : null;
}

/** The same strikes on another board; null when that board does not list one of them for its leg's type. */
export function sameOnBoard(legs = [], strikes = null) {
  if (!strikes || !legs.length) return null;
  return legs.every((l) => (strikesFor(strikes, l.type) || []).includes(Number(l.strike))) ? legs.map((l) => ({ ...l })) : null;
}

/** The chain's expiries after `expKey` whose days fall in [min, max], nearest first. */
export function laterExpiries(chain, expKey, { now = Date.now(), min = RULES.minEntryDTE, max = RULES.maxEntryDTE } = {}) {
  if (!chain || !chain.byExp) return [];
  return Object.keys(chain.byExp).filter((k) => k > String(expKey || "")).sort()
    // The chain's own day count when it carries one (the same `dte` Build reads), else the 4pm close.
    .filter((k) => { const d = Number.isFinite(chain.byExp[k] && chain.byExp[k].dte) ? chain.byExp[k].dte : daysTo(k, now); return d != null && d >= min && d <= max; });
}

/**
 * BUILD'S VARIANTS: the loaded structure one step up, one step down, wider, narrower, and the same strikes on the
 * next expiry the entry window allows. Each { kind, legs, expKey }; the ones the chain cannot list are left out, and
 * one equal to the loaded legs is dropped.
 */
export function variantsOf({ legs = [], expKey = null, chain = null, spot = null, now = Date.now() } = {}) {
  const strikes = boardStrikes(chain, expKey);
  const out = [];
  const add = (kind, ls, ek = expKey) => { if (ls && !(ek === expKey && sameLegs(ls, legs)) && !out.some((v) => v.expKey === ek && sameLegs(v.legs, ls))) out.push({ kind, legs: ls, expKey: ek }); };
  add("up", shiftLegs(legs, strikes, 1));
  add("down", shiftLegs(legs, strikes, -1));
  add("wider", widthLegs(legs, strikes, spot, 1));
  add("narrower", widthLegs(legs, strikes, spot, -1));
  const next = laterExpiries(chain, expKey, { now })[0];
  if (next) add("later", sameOnBoard(legs, boardStrikes(chain, next)), next);
  return out;
}

/**
 * THE NEAREST LISTED ALTERNATIVE (PR 70, task 70.3) — what Send offers, one tap away, when the gate refuses a leg the
 * chain does not list or quote (UNLISTED_CONTRACT) or a bought leg nobody bids for (UNPRICEABLE). Read live, XLE 27 Nov:
 * "Load" on a variant was the only thing that unblocked the owner. The same structure on the same expiry, each refused
 * leg (`bad`, indices) moved to the nearest strike ITS TYPE lists that passes `chainQuotedLegs()` — the one predicate the
 * generation sites use — never onto another leg of its type; a tie goes to the lower strike, as `snapStrike()` does.
 * Null when a refused leg has no such strike. LEGS ONLY: pricing, sizing and the gate are the caller's (`priceAlt()`).
 *
 * @returns {{ kind: "listed", legs, expKey, moved: {i, from, to}[] } | null}
 */
export function nearestListedOf({ legs = [], expKey = null, chain = null, bad = [] } = {}) {
  const board = chain && chain.byExp && chain.byExp[expKey];
  const strikes = boardStrikes(chain, expKey);
  if (!board || !strikes || !legs.length || !bad.length) return null;
  const out = legs.map((l) => ({ ...l }));
  const moved = [];
  for (const i of [...new Set(bad)].sort((a, b) => a - b)) {
    const l = out[i];
    if (!l) return null;
    const side = board[l.type === "call" ? "calls" : "puts"] || {};
    const taken = new Set(out.filter((x, j) => j !== i && x.type === l.type).map((x) => Number(x.strike)));
    const k0 = Number(l.strike);
    const ks = (strikesFor(strikes, l.type) || []).filter((k) => k !== k0 && !taken.has(k))
      .sort((a, b) => Math.abs(a - k0) - Math.abs(b - k0) || a - b);
    const k = ks.find((x) => {
      const q = side[x];
      return !!q && chainQuotedLegs({ legs: [{ ...l, strike: x }], quotes: [{ bid: q.bid, ask: q.ask, real: q.mid != null }] }).ok;
    });
    if (k == null) return null;
    out[i] = { ...l, strike: k };
    moved.push({ i, from: legs[i], to: out[i] });
  }
  return { kind: "listed", legs: out, expKey, moved };
}

/* ====================================================================
   OPTIMIZE (PR 65, owner 7 Oct 2026: "a separate run that finds the best combination of duration and also of legs"; "ok in
   Build"; the width "the objectively best"). The loaded structure on EVERY expiry the chain lists inside the entry window,
   and on each board every move up to `OPTIMIZE_STEPS` listed strikes: the same strikes, up and down, wider and narrower.
   LEGS ONLY, as above: pricing, the floors, sizing, the gate and the ranking are the caller's (App.jsx `optimizeRun`).
==================================================================== */
/* WHY ONE STEP (PR 65, task 64.5). Two steps hold every candidate one step holds, so the first pick can only be as good
   or better; what it costs is time, and the rule fixed BEFORE measuring was "two steps if one run stays under 50 ms on the
   fixture chains, else one". `node scripts/measure-optimize.mjs` on UNG's board copied onto 9 expiries (a market listing
   weeklies): the slowest trade's run took 40–82 ms at two steps (over 50 ms in four of six repeats), 32–48 ms at one; two
   steps changed the first pick on 1 of 9 trades. So one step. Two is this one number, and the owner's to ask for. */
export const OPTIMIZE_STEPS = 1;

/** The chain's expiries whose days fall in [min, max], nearest first. */
export function windowExpiries(chain, { now = Date.now(), min = RULES.minEntryDTE, max = RULES.maxEntryDTE } = {}) {
  if (!chain || !chain.byExp) return [];
  return Object.keys(chain.byExp).sort()
    .filter((k) => { const d = Number.isFinite(chain.byExp[k] && chain.byExp[k].dte) ? chain.byExp[k].dte : daysTo(k, now); return d != null && d >= min && d <= max; });
}

/**
 * Every move of a structure on one board, up to `steps` listed strikes each way: { move, step, legs }, move one of
 * "same" (step 0), "up", "down", "wider", "narrower". A move the board cannot list is left out, never snapped; two
 * moves that land on the same legs are kept once (the first).
 */
export function movesOnBoard(legs = [], strikes = null, spot = null, steps = OPTIMIZE_STEPS) {
  const out = [];
  const add = (move, step, ls) => { if (ls && !out.some((x) => sameLegs(x.legs, ls))) out.push({ move, step, legs: ls }); };
  add("same", 0, sameOnBoard(legs, strikes));
  for (let k = 1; k <= steps; k++) {
    add("up", k, shiftLegs(legs, strikes, k));
    add("down", k, shiftLegs(legs, strikes, -k));
  }
  for (const [move, dir] of [["wider", 1], ["narrower", -1]]) {
    let ls = legs;
    for (let k = 1; k <= steps && ls; k++) { ls = widthLegs(ls, strikes, spot, dir); add(move, k, ls); }
  }
  return out;
}

/**
 * BUILD'S OPTIMIZE CANDIDATES: the loaded structure's moves on every expiry in the entry window (and on the loaded
 * expiry, which may sit outside it). Each { kind: "optimize", move, step, legs, expKey, loaded } — `loaded` marks the
 * trade on Build itself, so the run can say where it ranks.
 */
export function optimizeCandidates({ legs = [], expKey = null, chain = null, spot = null, now = Date.now(), steps = OPTIMIZE_STEPS } = {}) {
  if (!chain || !chain.byExp || !legs.length) return [];
  const eks = windowExpiries(chain, { now });
  if (expKey && chain.byExp[expKey] && !eks.includes(expKey)) eks.push(expKey);
  const out = [];
  for (const ek of eks.sort()) {
    for (const m of movesOnBoard(legs, boardStrikes(chain, ek), spot, steps)) {
      out.push({ kind: "optimize", move: m.move, step: m.step, legs: m.legs, expKey: ek, loaded: ek === expKey && sameLegs(m.legs, legs) });
    }
  }
  return out;
}

/**
 * A ROLL'S CANDIDATES (PR 65: the same search as Optimize, on the LATER expiries only — owner: "evaluate whether the
 * search principle is the same"; it is, the judge is not, see `rollJudge()` below). Every later expiry the entry
 * window allows × every move up to `steps` listed strikes. Each { kind, move, step, legs, expKey }: kind "roll" for the
 * same strikes, "rollUp" / "rollDown" for a shift, "rollWider" / "rollNarrower" for a width.
 */
export function rollCandidates({ legs = [], expKey = null, chain = null, spot = null, now = Date.now(), steps = OPTIMIZE_STEPS } = {}) {
  const KIND = { same: "roll", up: "rollUp", down: "rollDown", wider: "rollWider", narrower: "rollNarrower" };
  const out = [];
  for (const ek of laterExpiries(chain, expKey, { now })) {
    for (const m of movesOnBoard(legs, boardStrikes(chain, ek), spot, steps)) out.push({ kind: KIND[m.move], move: m.move, step: m.step, legs: m.legs, expKey: ek });
  }
  return out;
}

/**
 * A ROLL JUDGED ON THE WHOLE TRADE (PR 65; owner 7 Oct 2026: "in a roll it must weigh the starting position more, to
 * mitigate the risk against the initial strategy and goal, which is maybe different"). The search is Optimize's; the
 * judge is not, because a roll is not a new idea: it is the same position, carried on.
 *
 * The close books `realized` (the position's P&L now, at or below zero — `rollEligible()` offers a roll only then). The
 * new trade, at the SAME size `n` as the one held, adds n × its P&L at expiry, read on the chance's own lognormal
 * (`exactPnl()`, the drift, volatility and days the new trade's CHANCE used — `mc` is `listCardFigures()`' `mc`). So:
 *   worst   realized + n × the new maximum loss: the roll is REFUSED ("overRisk") when that is more than `accepted`,
 *           the maximum loss accepted at entry for the whole position (|record max loss| × n). Never more risk.
 *   back    the chance the whole trade ends at or above zero: P(realized + n·X ≥ 0)
 *   target  the chance it reaches the take-profit set at entry (`target`, dollars for the position), or null
 *   avg     realized + n × the new trade's average
 * Unknown is not zero: a missing P&L, size, risk or model is "noFigures", never a pass.
 *
 * @returns {{ ok: boolean, why: "ok"|"overRisk"|"noFigures", worst?, back?, target?, avg? }}
 */
export function rollJudge({ realized = null, n = null, accepted = null, target = null, legs = [], entryNet = null, spot = null, mc = null, maxLoss = null } = {}) {
  const fin = (x) => x != null && Number.isFinite(Number(x));
  if (![realized, n, accepted, entryNet, spot, maxLoss].every(fin) || !(Number(n) >= 1) || !mc || !legs.length) return { ok: false, why: "noFigures" };
  let D;
  try { D = exactPnl(legs, Number(entryNet), Number(spot), { driftAnnual: Number(mc.driftAnnual) || 0, sigma: Number(mc.sigma), dte: Number(mc.dte) }); }
  catch { return { ok: false, why: "noFigures" }; }
  const R = Number(realized), k = Math.round(Number(n));
  const worst = R + k * Number(maxLoss);
  // P(R + k·X ≥ x) = 1 − P(X < (x − R) / k): the exact distribution's strict cdf.
  const atLeast = (x) => 1 - D.cdf((x - R) / k, true);
  const ev = fin(mc.ev) ? Number(mc.ev) : null;
  const out = { worst, back: atLeast(0), target: fin(target) && Number(target) > 0 ? atLeast(Number(target)) : null, avg: ev == null ? null : R + k * ev };
  // A cent of tolerance: the two are the same dollars, rounded differently on the way in.
  if (worst < -Math.abs(Number(accepted)) - 0.01) return { ok: false, why: "overRisk", ...out };
  return { ok: true, why: "ok", ...out };
}

/** The rolls that keep the risk, best first: the chance back to zero, then the average; unknown last. */
export const rankRolls = (rows = []) => rows.filter((r) => r && r.judge && r.judge.ok).sort((a, b) =>
  (b.judge.back - a.judge.back) || ((b.judge.avg == null ? -Infinity : b.judge.avg) - (a.judge.avg == null ? -Infinity : a.judge.avg)));

/**
 * MAY THIS POSITION BE ROLLED? (owner: "if it is not in profit"; PR 4a's plan: "only while the reasons it was opened
 * still hold — rolling an idea that turned is doubling down on it"). Unknown is not zero: a profit nobody read, or
 * reasons nobody recorded, is a no with its reason.
 *
 * @param o { pnl, notHeld, working, factors } — `factors` are `entryVsNow()`'s ({ readAtEntry, turned })
 * @returns {{ ok: boolean, why: string }} — `why` is a key of `ROLL_WHY` in rules.js
 */
export function rollEligible({ pnl = null, notHeld = false, working = false, factors = [] } = {}) {
  if (notHeld) return { ok: false, why: "notHeld" };
  if (working) return { ok: false, why: "working" };
  if (pnl == null || !Number.isFinite(Number(pnl))) return { ok: false, why: "noPnl" };
  if (Number(pnl) > 0) return { ok: false, why: "inProfit" };
  const read = (factors || []).filter((f) => f && f.readAtEntry);
  if (!read.length) return { ok: false, why: "notRecorded" };
  if (read.some((f) => f.turned)) return { ok: false, why: "turned" };
  return { ok: true, why: "ok" };
}
