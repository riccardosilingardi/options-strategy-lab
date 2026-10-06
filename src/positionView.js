// ============================================================================
// src/positionView.js — WHAT THE POSITIONS CARD SAYS, WORKED OUT. Plain JS.
//
// PR #44, TASKS 1 and 2. Measured on the owner's phone on 2 Oct 2026: J-0001's
// card read HOLD with no P&L, the +$2,925 sat in the broker panel below it, a
// red "Close and file" button with a trash icon sent no order (it files the
// Journal), and the real close sat behind a fold. The card now leads with the
// action and the profit, shows how far each exit is, sets the entry beside now,
// and keeps "Close at limit" in view.
//
// >>> THIS FILE COMPUTES NOTHING NEW ABOUT A TRADE. <<< The profit is the one
// `posAlerts` already read (the broker's when synced); the take-profit target is
// `takeProfitTarget()`; the stop level is `stopWarningLevel()`; what is left to
// make and to lose is `remainingEdge()`. It only arranges them for a card, so a
// number on the card cannot differ from the one the action was decided on.
//
// It is plain JS (no React) so the arrangement can be tested without a browser.
// ============================================================================

import { RULES, money, chanceText, rewardRisk, remainingEdge, payoffCeiling, NO_CEILING,
  takeProfitProgress, takeProfitBasisWords, stopWarningLevel, known, exactExtremes, CARD_LABELS } from "./rules.js";
import { legsNotHeld } from "./closeOrder.js";
import { holdingShape, positionSize } from "./journal.js";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86400000;

/** "2026-10-30" -> "30 Oct". Null for anything that is not a date. */
export function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const mo = Number(m[2]) - 1;
  return mo >= 0 && mo < 12 ? `${Number(m[3])} ${MONTHS_SHORT[mo]}` : null;
}

const strikeText = (k) => String(Number(k));

/**
 * THE STRUCTURE'S NAME, FROM ITS LEGS. A record imported from Alpaca is stored
 * as "Imported from Alpaca", which names where it came from and not what it is;
 * the stored name is unchanged and this is what the screen shows instead.
 *
 *   one leg            "Long put 94 · 30 Oct"
 *   two legs, a pair   "Bull call spread 20/22 · 6 Nov"
 *   anything else      "4 legs · 30 Oct"
 */
export function structureName(legs = [], expKey = null) {
  const ls = Array.isArray(legs) ? legs.filter(Boolean) : [];
  const when = shortDate(expKey);
  const tail = when ? ` · ${when}` : "";
  if (ls.length === 1) {
    const l = ls[0];
    return `${Number(l.side) > 0 ? "Long" : "Short"} ${l.type === "call" ? "call" : "put"} ${strikeText(l.strike)}${tail}`;
  }
  if (ls.length === 2 && ls[0].type === ls[1].type && Number(ls[0].side) !== Number(ls[1].side)) {
    const [a, b] = ls[0].strike <= ls[1].strike ? [ls[0], ls[1]] : [ls[1], ls[0]];   // a = the lower strike
    const longLow = Number(a.side) > 0;
    // Long the lower strike: a call spread gains when the price rises (bull call) and so does a put spread (bull put,
    // the credit one). Long the higher strike it is the bear pair.
    const kind = a.type === "call" ? (longLow ? "Bull call" : "Bear call") : (longLow ? "Bull put" : "Bear put");
    return `${kind} spread ${strikeText(a.strike)}/${strikeText(b.strike)}${tail}`;
  }
  return `${ls.length} leg${ls.length === 1 ? "" : "s"}${tail}`;
}

/** The name the screen shows for a record: its own, unless it only says where it came from. */
export const displayName = (p) => {
  const stored = p && p.name ? String(p.name) : "";
  if (stored && !/^imported from alpaca/i.test(stored)) return stored;
  return structureName(p && p.legs, p && (p.expKey || p.expiry));
};

/**
 * THE CARD'S TITLE (redesign PR 3, the board: "Bull call spread 15/17 · 18 Dec"): the structure with its strikes and
 * expiry when the legs name one (one leg, or a two-leg pair), else the record's own name and the expiry. The stored
 * name is unchanged.
 */
export function positionTitle(p) {
  const ls = p && Array.isArray(p.legs) ? p.legs.filter(Boolean) : [];
  const exp = p && (p.expKey || p.expiry);
  const pair = ls.length === 2 && ls[0].type === ls[1].type && Number(ls[0].side) !== Number(ls[1].side);
  if (ls.length === 1 || pair) return structureName(ls, exp);
  const when = shortDate(exp);
  return `${displayName(p)}${when ? ` · ${when}` : ""}`;
}

/* ------------------------------------------------------------------
   THE THREE EXITS, AS PROGRESS
------------------------------------------------------------------ */

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

/** The date the time exit applies on: `exitDTE` days before expiry. Null without an expiry. */
export function exitDateOf(p) {
  const t = Date.parse(p && (p.expKey || p.expiry));
  if (!Number.isFinite(t)) return null;
  return new Date(t - RULES.exitDTE * DAY).toISOString().slice(0, 10);
}

/**
 * @param p        the record
 * @param pnl      the profit the card prints (posAlerts'), whole position, or null
 * @param dteLeft  days to expiry
 * @param tpTarget the alert's `takeProfitTarget()` (whole position)
 * @param n        contracts
 * @param now      epoch ms
 * @returns {{ time, takeProfit, stop }} each { text, frac, state }. `frac` is 0..1 for a bar; `state` is
 *          "ok" | "reached" | "unknown" | "none".
 */
export function exitProgress({ p, pnl = null, dteLeft = null, tpTarget = null, n = 1, now = Date.now() } = {}) {
  /* TIME. Counted to the EXIT date, not to expiry: the rule closes the trade there. */
  const exitDate = exitDateOf(p);
  const daysToExit = known(dteLeft) ? Number(dteLeft) - RULES.exitDTE : null;
  const opened = Date.parse(p && p.openedAt);
  const exitT = exitDate ? Date.parse(exitDate) : NaN;
  let time;
  if (daysToExit == null) time = { text: "Time exit: not known", frac: 0, state: "unknown" };
  else if (daysToExit <= 0) time = { text: `Time exit: reached, ${dteLeft} day${Number(dteLeft) === 1 ? "" : "s"} to expiry`, frac: 1, state: "reached" };
  else {
    const span = exitT - opened;
    time = { text: `Time exit: ${daysToExit} day${daysToExit === 1 ? "" : "s"} left${exitDate ? ` · ${shortDate(exitDate)}` : ""}`,
      frac: Number.isFinite(span) && span > 0 ? clamp01((now - opened) / span) : 0, state: "ok", daysLeft: daysToExit, date: exitDate };
  }

  /* TAKE PROFIT: dollars now of dollars to go, from the one function. */
  let takeProfit;
  const dollars = tpTarget && known(tpTarget.dollars) && tpTarget.dollars > 0 ? Number(tpTarget.dollars) : null;
  if (dollars == null) {
    takeProfit = { text: "Take profit: no target on this structure", frac: 0, state: "none" };
  } else if (!known(pnl)) {
    takeProfit = { text: `Take profit: — of ${money(dollars)}`, frac: 0, state: "unknown", target: dollars };
  } else {
    const prog = takeProfitProgress(pnl, tpTarget);
    takeProfit = { text: `Take profit: ${money(pnl)} of ${money(dollars)}`, frac: clamp01(prog), state: prog >= 1 ? "reached" : "ok",
      target: dollars, basis: tpTarget.basis, basisWords: takeProfitBasisWords(tpTarget.basis) };
  }

  /* STOP WARNING: its level, and how far the loss has come. A warning, never an order. */
  const level = stopWarningLevel({ maxLoss: p && p.maxLoss, contracts: n });
  let stop;
  if (level == null) stop = { text: "Stop warning: level not known", frac: 0, state: "unknown" };
  else if (!known(pnl)) stop = { text: `Stop warning: at ${money(level)}`, frac: 0, state: "unknown", level };
  else stop = { text: `Stop warning: at ${money(level)}`, frac: Number(pnl) < 0 ? clamp01(Number(pnl) / level) : 0,
    state: Number(pnl) <= level ? "reached" : "ok", level };
  return { time, takeProfit, stop };
}

/**
 * THE THREE EXITS IN THE CARD'S SHORT WORDS (redesign PR 3, the owner's board "Positions"): take profit, time exit,
 * stop, each over a 4px bar. Read from `exitProgress()` — the long lines stay on the position's screen, where
 * THE EXIT PLAN prints them whole. `tone` names the bar: "done" a take profit reached (green), "warn" a time exit or a
 * stop reached (amber), "field" anything still running.
 *   "Take profit ✓" · "Time exit 26d" · "Stop -$54"
 */
export function exitLabels(progress) {
  if (!progress) return [];
  const { takeProfit: tp, time, stop } = progress;
  const reached = (x) => x && x.state === "reached";
  return [
    { id: "takeProfit", text: reached(tp) ? "Take profit ✓" : tp && tp.state === "none" ? "Take profit —" : "Take profit",
      frac: tp ? tp.frac : 0, tone: reached(tp) ? "done" : "field" },
    { id: "time", text: reached(time) ? "Time exit ✓" : time && known(time.daysLeft) ? `Time exit ${time.daysLeft}d` : "Time exit —",
      frac: time ? time.frac : 0, tone: reached(time) ? "warn" : "field" },
    { id: "stop", text: reached(stop) ? "Stop ✓" : stop && known(stop.level) ? `Stop ${signedMoney$(stop.level)}` : "Stop —",
      frac: stop ? stop.frac : 0, tone: reached(stop) ? "warn" : "field" },
  ];
}

/**
 * THE CARD'S SENTENCE (the board: "Take profit reached: $24 of $21. The close is already working." / "Stop warning
 * reached: -$64 against -$62. A warning, not an order: you decide."). Its figures are the ones the action was decided
 * on — the profit `posAlerts` read, `exitProgress()`'s target and stop level. Any other action keeps
 * `positionAction()`'s own line; that line, whole, is the position's screen's.
 */
export function cardSentence({ act = null, pnl = null, progress = null, working = false } = {}) {
  if (!act) return null;
  const still = working ? " The close is already working." : "";
  const tp = progress && progress.takeProfit, stop = progress && progress.stop;
  if (act.action === "CLOSE" && act.rule === "take-profit" && known(pnl) && tp && known(tp.target)) {
    return `Take profit reached: ${money(pnl)} of ${money(tp.target)}.${still}`;
  }
  if (act.action === "WARNING" && act.kind === "stop" && known(pnl) && stop && known(stop.level)) {
    return `Stop warning reached: ${money(pnl)} against ${money(stop.level)}. A warning, not an order: you decide.`;
  }
  return `${act.line || ""}${act.action === "CLOSE" ? still : ""}` || null;
}

/** The card's top line: "J-0002 · UNG · 2 puts" — what Alpaca holds, per leg (`sizeWords()`). */
export const positionMetaLine = (p = {}) => [p.ref, p.ticker, sizeWords(p)].filter(Boolean).join(" · ");

/** "52% of risk" under the profit (the sign is the profit's own, one line above). Null when unknown. */
export function pnlShareShort(share) {
  if (share == null || !Number.isFinite(share)) return null;
  return `${Math.abs(Math.round(share * 100))}% of risk`;
}

/**
 * THE LINE UNDER THE CARDS FOR AN ORDER SENT AND NOT FILLED (the board: "The CORN spread from Build is an order, not a
 * position yet: it waits in Orders for Monday's open"). `records` are the records at stage "working"; `openDay` is
 * `nextOpenDay()` (null while the market is open or the clock is unread). Null when nothing waits; otherwise three
 * parts, [before, "Orders", after], so the screen can make the middle word the way to Orders.
 */
export function waitingOrdersLine(records = [], openDay = null) {
  const rs = (records || []).filter(Boolean);
  if (!rs.length) return null;
  const when = openDay ? ` for ${openDay}'s open` : "";
  if (rs.length === 1) {
    const r = rs[0];
    return [`The ${r.ticker} ${unitWords(r.legs)} from Build is an order, not a position yet: it waits in `, "Orders", `${when}.`];
  }
  return [`${rs.length} trades from Build are orders, not positions yet (${rs.map((r) => r.ref || r.ticker).join(", ")}): they wait in `,
    "Orders", `${when}.`];
}

/* ------------------------------------------------------------------
   AT ENTRY VERSUS NOW — the Find card's four figures, in its order, and the four factors
------------------------------------------------------------------ */

/* ONE HOME FOR THE FOUR LABELS (PR #48, TASK 0b): the Find card's `CARD_LABELS` in rules.js, in the card's order —
   YOU RISK, MAX PROFIT, CHANCE, RETURN ON RISK. This file kept its own list (RETURN ON RISK, CHANCE, PROFIT, RISK),
   which stopped equal to the card's in PR #45; `positionView.test.js` now holds the order to `CARD_LABELS`. */
const FIGURE_ORDER = ["risk", "profit", "chance", "rr"];
export const FACTOR_LABELS = { seasonal: "SEASONALITY", technical: "PRICE TREND", weather: "WEATHER", news: "NEWS" };
const DASH = "—";

/** A factor's direction as the one-glyph arrow (flat is "→"), with its strength. */
export const factorText = (f) => (f && Number.isFinite(f.dir) && Number.isFinite(f.strength)
  ? `${f.dir > 0 ? "↑" : f.dir < 0 ? "↓" : "→"} ${f.strength}` : DASH);

/**
 * @param p          the record
 * @param n          contracts
 * @param pnl        the profit the card prints
 * @param popNow     the chance now (the one chance), or null
 * @param nowSignals a `signalSnapshot()` of the four factors now, or null
 * @returns {{ figures: {k, entry, now}[], factors: {k, label, entry, now}[], hasEntrySignals }}
 *
 * EVERY CELL IS A DASH WHEN IT IS NOT KNOWN. A record opened before PR #44 has no entry factors, an imported
 * holding has no entry chance, and `Number(null)` is 0 and 0 is finite.
 */
export function entryVsNow({ p, n = 1, pnl = null, popNow = null, nowSignals = null } = {}) {
  const size = Math.max(1, Math.round(Number(n) || 1));
  // A STRUCTURE WITH NO CEILING HAS NO MAXIMUM: an imported record stores the edge of a grid there.
  const unbounded = !!(p && Array.isArray(p.legs) && p.legs.length && !payoffCeiling(p.legs).above);
  const maxProfit = unbounded || !p || !known(p.maxProfit) ? null : Number(p.maxProfit);
  const maxLoss = p && known(p.maxLoss) ? Number(p.maxLoss) : null;
  const rrEntry = rewardRisk(maxProfit, maxLoss);
  const edge = remainingEdge({ maxProfit: maxProfit == null ? null : maxProfit * size,
    maxLoss: maxLoss == null ? null : maxLoss * size, pnl });
  const pct = (r) => (r == null ? DASH : `${Math.round(r * 100)}%`);
  const cells = {
    risk: { entry: maxLoss == null ? DASH : money(Math.abs(maxLoss) * size), now: edge.known ? money(edge.risk) : DASH },
    profit: { entry: unbounded ? NO_CEILING : maxProfit == null ? DASH : money(maxProfit * size),
      now: unbounded ? NO_CEILING : edge.known ? money(edge.reward) : DASH },
    chance: { entry: chanceText(p && p.thesis ? p.thesis.pop : null), now: chanceText(popNow) },
    rr: { entry: pct(rrEntry), now: edge.known ? pct(edge.ratio) : DASH },
  };
  const figures = FIGURE_ORDER.map((id) => ({ id, k: CARD_LABELS[id], ...cells[id] }));
  const then = p && p.thesis ? p.thesis.signals : null;
  const hasEntrySignals = !!(then && then.ready && then.factors);
  const keys = ["seasonal", "technical", "weather", "news"];
  const factors = keys.map((k) => {
    const nowF = nowSignals && nowSignals.ready && nowSignals.factors ? nowSignals.factors[k] : null;
    const thenF = hasEntrySignals ? then.factors[k] : null;
    const na = (nowSignals && nowSignals.ready && !nowF) && (!hasEntrySignals || !thenF);
    // AN INPUT THAT FAILED TO LOAD IS "NOT READ", NOT A NEUTRAL ZERO: its factor is scored as neutral so the other
    // three still count, but a card must not print that neutral as something the market said.
    const cell = (f, snap) => (snap && Array.isArray(snap.failed) && snap.failed.includes(k) ? "not read" : factorText(f));
    return { k, label: FACTOR_LABELS[k], entry: na ? "n/a" : cell(thenF, hasEntrySignals ? then : null), now: na ? "n/a" : cell(nowF, nowSignals) };
  });
  return { figures, factors, hasEntrySignals, unbounded };
}

/* ------------------------------------------------------------------
   WHEN "FILE IN JOURNAL" IS OFFERED
------------------------------------------------------------------ */

/** Is this record backed by a broker order or holding at all? An app-book record has nothing to disagree with. */
export const isBrokerRecord = (p) => !!(p && (p.alpacaId || p.alpacaHeld || p.alpacaLive || p.alpacaFilled));

/**
 * @returns "gone"    a SUCCESSFUL sync did not find the holding: it is closed (or was never there) — file it
 *          "held"    the sync found it: filing would orphan an open broker position — not offered
 *          "unknown" no sync, or a failed one: only a quiet link, inside Details
 *          "book"    a record the broker never held: nothing to disagree with, so filing is how it ends
 */
export function fileState(p, alSync = null) {
  if (!isBrokerRecord(p)) return "book";
  const nh = legsNotHeld(p, alSync);
  if (nh == null) return "unknown";
  return nh.length ? "gone" : "held";
}

/** The profit as a share of the risk (the maximum loss, whole position), or null when either is unknown. */
export function pnlShareOfRisk(pnl, p, n = 1) {
  if (!known(pnl) || !p || !known(p.maxLoss) || !(Math.abs(Number(p.maxLoss)) > 0)) return null;
  return Number(pnl) / (Math.abs(Number(p.maxLoss)) * Math.max(1, Math.round(Number(n) || 1)));
}

/** "+65% of the risk", or null. */
export function pnlShareText(share) {
  if (share == null || !Number.isFinite(share)) return null;
  const v = Math.round(share * 100);
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v)}% of the risk`;
}

/** The signed profit as the card prints it: "+$2,925", "-$225", or a dash when unknown. */
export function signedMoney$(x) {
  if (!known(x)) return DASH;
  const r = Math.round(Math.abs(Number(x)));
  return `${Number(x) < 0 && r > 0 ? "-" : "+"}$${r.toLocaleString("en-US")}`;
}

/* ------------------------------------------------------------------
   "YOU ALREADY HOLD THIS" — a stop sign on Build, never a refusal
------------------------------------------------------------------ */

/**
 * The open position, if any, whose market, expiry and legs equal this structure's. THE SIZE IS A DIFFERENT QUESTION
 * FROM THE STRUCTURE: a 9-lot holding and a 1-lot candidate are the same shape, so this reads `holdingShape()`
 * (journal.js), which is how the sync tells two records from one holding. Only OWNED positions count (the caller
 * passes them).
 */
export function holdsStructure(positions = [], { ticker, expKey, legs } = {}) {
  if (!ticker || !expKey || !Array.isArray(legs) || !legs.length) return null;
  const shape = holdingShape(ticker, expKey, legs);
  return (positions || []).find((p) => p && p.ticker === ticker && Array.isArray(p.legs)
    && holdingShape(p.ticker, p.expKey || String(p.expiry || "").slice(0, 10), p.legs) === shape) || null;
}

/* ------------------------------------------------------------------
   THE SIZE SENTENCE STATES WHAT ALPACA HOLDS, PER LEG (PR #47, TASK 0b)

   Measured 2 Oct 2026: J-0001's card read "1 contract, the whole position" over 9 puts at Alpaca, and J-0002's
   "5 contracts" over +25 / −25, while the figures on the same cards multiplied by 9 and 25. `contracts` is the
   multiplier of a record's per-combination figures — on an imported record the size already sits in the leg
   quantities and `contracts` is 1 — so it is never the number a sentence states. `brokerQty` from
   `positionSize()` is: what each leg holds at Alpaca.
------------------------------------------------------------------ */

/** The unit one "combination" of these legs is, in words: "put", "call spread", "iron condor", or "combination". */
export function unitWords(legs = []) {
  const ls = Array.isArray(legs) ? legs.filter(Boolean) : [];
  if (ls.length === 1) return ls[0].type === "call" ? "call" : "put";
  if (ls.length === 2 && ls[0].type === ls[1].type && Math.sign(Number(ls[0].side)) !== Math.sign(Number(ls[1].side))) {
    return `${ls[0].type === "call" ? "call" : "put"} spread`;
  }
  const calls = ls.filter((l) => l.type === "call").length, puts = ls.length - calls;
  if (ls.length === 4 && calls === 2 && puts === 2) return "iron condor";
  return "combination";
}

/** "9 puts", "25 call spreads" — never `contracts` alone. */
export function sizeWords(p = {}) {
  const { brokerQty } = positionSize(p);
  const unit = unitWords(p && p.legs);
  return `${brokerQty} ${unit}${brokerQty === 1 ? "" : "s"}`;
}

/* ------------------------------------------------------------------
   A STORED MAXIMUM PROFIT CUT OFF BY A PRICE GRID (PR #47, TASK 0c)

   Records already stored keep their figures. The card recomputes the best case from the legs and the entry
   (`exactExtremes()`), and the timeline says "corrected" once. Only a figure that was CUT OFF moves: the exact
   best case above the stored one by more than half a dollar.
------------------------------------------------------------------ */

/** @returns {?{ from, to }} per combination, or null when the stored figure stands. */
export function maxProfitCorrection(p = {}) {
  if (!p || !known(p.maxProfit) || !Array.isArray(p.legs) || !known(p.entryNet)) return null;
  const ex = exactExtremes(p.legs, Number(p.entryNet));
  if (!ex || ex.maxProfit == null) return null;
  return ex.maxProfit > Number(p.maxProfit) + 0.5 ? { from: Number(p.maxProfit), to: ex.maxProfit } : null;
}

/** The record as the card reads it: the corrected best case in place of a cut-off one. The stored record is untouched. */
export function withExactMaxProfit(p) {
  const c = maxProfitCorrection(p);
  return c ? { ...p, maxProfit: c.to, maxProfitStored: c.from } : p;
}

/** The one timeline line, whole position. */
export function maxProfitCorrectionNote(c, p = {}) {
  if (!c) return null;
  const n = positionSize(p).contracts;
  return `Maximum profit corrected: ${money(c.from * n)} → ${money(c.to * n)} for the whole position. The old figure ` +
    `stopped at the edge of a price grid; this one is the payoff if the price went to zero, worked out from the legs ` +
    `and the entry. The stored figure is kept.`;
}
