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
//
// Plain JS, no React: tested without a browser (alternatives.test.js).
// ============================================================================
import { RULES } from "./rules.js";
import { expiryStrikes } from "./chain.js";

const DAY = 86400000;
/** Days from `now` to an expiry key ("2026-12-18"), at the 4pm New York close (20:00 UTC, the same day). */
export const daysTo = (expKey, now = Date.now()) => {
  const t = Date.parse(`${expKey}T20:00:00Z`);
  return Number.isFinite(t) ? Math.round((t - now) / DAY) : null;
};
const sameLegs = (a, b) => a.length === b.length && a.every((l, i) => l.strike === b[i].strike && l.type === b[i].type && l.side === b[i].side && (l.qty || 1) === (b[i].qty || 1));

/** Every leg moved `steps` listed strikes (+ up, − down); null when one leaves the board or starts off it. */
export function shiftLegs(legs = [], strikes = null, steps = 1) {
  if (!strikes || !strikes.length || !legs.length) return null;
  const out = [];
  for (const l of legs) {
    const i = strikes.indexOf(Number(l.strike));
    const j = i + steps;
    if (i < 0 || j < 0 || j >= strikes.length) return null;
    out.push({ ...l, strike: strikes[j] });
  }
  return out;
}

/**
 * The outer leg of each pair moved one listed strike further out (`dir` +1, wider) or in (−1, narrower).
 * A pair is two legs of one type with opposite sides; the outer one is the farther from `spot`. A type with another
 * shape (a butterfly's three strikes, a single option) has no width to change: null when no pair moved.
 */
export function widthLegs(legs = [], strikes = null, spot = null, dir = 1) {
  if (!strikes || !strikes.length || !legs.length || !Number.isFinite(Number(spot))) return null;
  const out = legs.map((l) => ({ ...l }));
  let moved = 0;
  for (const type of ["call", "put"]) {
    const idx = out.map((l, i) => (l.type === type ? i : -1)).filter((i) => i >= 0);
    if (idx.length !== 2) continue;
    const [a, b] = idx.map((i) => out[i]);
    if (Math.sign(a.side) === Math.sign(b.side)) continue;
    const outer = Math.abs(a.strike - spot) >= Math.abs(b.strike - spot) ? idx[0] : idx[1];
    const inner = outer === idx[0] ? idx[1] : idx[0];
    const away = out[outer].strike > out[inner].strike ? 1 : -1;
    const i = strikes.indexOf(Number(out[outer].strike));
    const j = i + away * dir;
    if (i < 0 || j < 0 || j >= strikes.length) return null;
    if (strikes[j] === out[inner].strike || Math.sign(strikes[j] - out[inner].strike) !== away) return null; // never onto or past its pair
    out[outer] = { ...out[outer], strike: strikes[j] };
    moved += 1;
  }
  return moved ? out : null;
}

/** The same strikes on another board; null when that board does not list one of them. */
export function sameOnBoard(legs = [], strikes = null) {
  if (!strikes || !strikes.length || !legs.length) return null;
  return legs.every((l) => strikes.includes(Number(l.strike))) ? legs.map((l) => ({ ...l })) : null;
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
  const strikes = expiryStrikes(chain, expKey);
  const out = [];
  const add = (kind, ls, ek = expKey) => { if (ls && !(ek === expKey && sameLegs(ls, legs)) && !out.some((v) => v.expKey === ek && sameLegs(v.legs, ls))) out.push({ kind, legs: ls, expKey: ek }); };
  add("up", shiftLegs(legs, strikes, 1));
  add("down", shiftLegs(legs, strikes, -1));
  add("wider", widthLegs(legs, strikes, spot, 1));
  add("narrower", widthLegs(legs, strikes, spot, -1));
  const next = laterExpiries(chain, expKey, { now })[0];
  if (next) add("later", sameOnBoard(legs, expiryStrikes(chain, next)), next);
  return out;
}

/**
 * A ROLL'S CANDIDATES: the same structure on the first `n` later expiries the entry window allows — the same strikes,
 * then one step up and one step down on that board. Each { kind, legs, expKey }.
 */
export function rollCandidates({ legs = [], expKey = null, chain = null, now = Date.now(), n = 2 } = {}) {
  const out = [];
  for (const ek of laterExpiries(chain, expKey, { now }).slice(0, n)) {
    const strikes = expiryStrikes(chain, ek);
    const same = sameOnBoard(legs, strikes);
    for (const [kind, ls] of [["roll", same], ["rollUp", shiftLegs(legs, strikes, 1)], ["rollDown", shiftLegs(legs, strikes, -1)]]) {
      if (ls && !out.some((v) => v.expKey === ek && sameLegs(v.legs, ls))) out.push({ kind, legs: ls, expKey: ek });
    }
  }
  return out;
}

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
