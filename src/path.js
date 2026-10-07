// ============================================================================
// src/path.js — THE ONE NUMBERED PATH, MACRO TO MICRO.
//
// The desk used to be one page that grew. An evidence panel did not replace
// anything: it appended. Open the Shortlist and the page got longer; open
// History and it got longer again, so scrolling down you met "Why this trade",
// then "Agreement", then "How to read it", then "Three probabilities", then the
// totals, then the legend — none of them duplicated in the code, all of them on
// screen at once. Nothing felt like a step because nothing WAS one: there was
// no navigation, only accumulation.
//
// The path is three steps and one of them is on screen at a time:
//
//   1 RADAR      the wide scan across every market in the basket — which ones
//                have something worth looking at today, and which do not and
//                why. Already filtered by the quality floors (PRD §4b).
//   2 SHORTLIST  the candidates that survived. Up to three compared side by
//                side, any of them saved to come back to.
//   3 BUILD      one chosen structure taken apart: chain, greeks, charts, order.
//
// Moving forward carries the selection with it; moving back does not lose it.
// That is why the selection lives in App.jsx and the RULES for it live here:
// plain JS, no React, so what the path does can be tested without a browser —
// the same reason `rules.js`, `riskGate.js` and `handoff.js` are plain JS.
//
// This file decides NOTHING about a trade. It knows the order of the steps,
// what each one carries, and how to turn the three different things the app
// calls a "candidate" into ONE shape, so comparing and saving cannot end up
// with two implementations.
// ============================================================================

/** The steps, in order. `n` is what the user sees on screen.
 *
 *  >>> TWO STEPS SINCE PR #40 (TASK 1). <<< Radar and Shortlist were two
 *  lists of one question, and the guided door was a third: the owner saw
 *  "Nothing today" there while Radar listed seven structures on the same data.
 *
 *  >>> THREE STEPS SINCE THE OWNER'S REDESIGN, 4 OCT 2026 (redesign PR 1). <<<
 *  Find → the market page → Build. PR #40's point stands: Find is still ONE
 *  sorted list (findGen, sorted by the owner's order), shown one row per
 *  market; the market page is a FILTERED VIEW of that same list for one
 *  ticker (its cards, in the same order), not a second list, and nothing on
 *  it re-ranks or re-simulates. */
export const STEPS = [
  { n: 1, id: "find", label: "Find", blurb: "every market, one row each" },
  { n: 2, id: "market", label: "Market", blurb: "one market: overview, strategies, chain" },
  { n: 3, id: "build", label: "Build", blurb: "one trade, taken apart" },
];

export const FIRST_STEP = STEPS[0].id;
export const LAST_STEP = STEPS[STEPS.length - 1].id;

/** Where a step sits in the path, or -1 for something that is not a step. */
export const stepIndex = (id) => STEPS.findIndex((s) => s.id === id);

/** The step itself, or the first one when the id is unknown. */
export const stepOf = (id) => STEPS[Math.max(0, stepIndex(id))];

export const nextStepId = (id) => STEPS[Math.min(STEPS.length - 1, stepIndex(id) + 1)].id;
export const prevStepId = (id) => STEPS[Math.max(0, stepIndex(id) - 1)].id;

/**
 * What each step is carrying, as the words that go under its number.
 *
 * The nav has to SAY what moving forward takes with it, or "back" feels like
 * losing something. Step 2 carries the market picked on the Radar, step 3
 * carries the structure picked on the Shortlist.
 *
 * @param {object} a
 *   ticker  — the market carried into steps 2 and 3
 *   trade   — the name of the structure loaded on Build, if any
 *   compare — how many candidates are ticked for comparison
 * @returns {Record<string,string>} step id -> the line under its number
 */
export function stepCarry({ ticker = null, trade = null, compare = 0, markets = null, market = null } = {}) {
  return {
    find: `${markets == null ? "every market" : `${markets} market${markets === 1 ? "" : "s"}`}${compare > 0 ? ` · ${compare} to compare` : ""}`,
    market: market || "no market open",
    build: trade || (ticker ? `${ticker} · nothing loaded` : "nothing loaded"),
  };
}

/* ====================================================================
   ONE SHAPE FOR A CANDIDATE

   Three parts of the app produce candidate structures and none of them agreed
   on a shape: the guided flow's roads ({ ticker, legs, entryNet, pop, … }), the
   Shortlist's preset rows ({ p, a }) and the multi-market scan
   ({ tk, name, legs, a, pop, n }). Comparing and saving would have needed three
   implementations, which is three chances for two screens to disagree about one
   trade. They are normalised HERE, once, on the way into the selection.
==================================================================== */

/** A stable identity for a structure: the market, the expiry and the legs. */
export function candidateKey(c) {
  if (!c) return "";
  const legs = (c.legs || []).map((l) => `${l.side > 0 ? "+" : "-"}${l.qty || 1}${l.type === "call" ? "C" : "P"}${l.strike}`).join(",");
  return `${c.ticker || c.tk || "?"}|${c.expKey || "?"}|${legs}`;
}

/** The legs written the way every list in the app writes them. */
export const legsLine = (legs = []) =>
  legs.map((l) => `${l.side > 0 ? "+" : "−"}${l.qty || 1} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / ");

/**
 * Turn anything the app calls a candidate into the one shape.
 *
 * @param {object} raw   a road, a shortlist row, a multi-scan hit or a saved item
 * @param {object} extra { source, ticker, spot, expKey, dte, sigma, bars }
 * @returns {?object} { key, source, ticker, name, legs, entryNet, spot, expKey,
 *                      dte, maxProfit, maxLoss, risk, pop, rr, sigma,
 *                      driftAnnual, seasonalSource, seasonalYears, seasonalAgeDays }
 *
 * THE CHANCE TRAVELS WITH ITS SOURCE. `pop` is drifted on a seasonal table, and
 * which table decides it: one corrected CORN cell moves a printed chance by
 * 18.8 points. A kept candidate is read back days later, so carrying the number
 * without the stamp would make it unreadable exactly when it is re-read. The
 * ABSENCE of the stamp is the marker, as with `contractsAssumed`: a candidate
 * saved before this PR carries none, and `seasonalStampOf()` in rules.js reads
 * that absence as the hand-written estimate, because at that point the
 * hand-written table was the only one the app could reach.
 */
export function candidateOf(raw, extra = {}) {
  if (!raw) return null;
  const a = raw.a || raw.analysis || null;
  const legs = (raw.legs || raw.p?.legs || []).map((l) => ({ ...l }));
  if (!legs.length) return null;
  const ticker = extra.ticker || raw.ticker || raw.tk || null;
  const entryNet = num(raw.entryNet, a ? a.entry : null);
  const maxProfit = num(raw.maxProfit, a ? a.maxProfit : null);
  const maxLoss = num(raw.maxLoss, a ? a.maxLoss : null);
  const risk = Number.isFinite(raw.risk) ? raw.risk : (Number.isFinite(maxLoss) ? Math.abs(maxLoss) : null);
  const c = {
    source: extra.source || raw.source || "shortlist",
    ticker,
    name: raw.name || raw.p?.name || "Structure",
    legs,
    entryNet,
    spot: num(extra.spot, raw.spot),
    expKey: raw.expKey ?? extra.expKey ?? null,
    dte: num(raw.dte, extra.dte),
    maxProfit, maxLoss, risk,
    // No ceiling is a FACT about a structure (a long call), not a gap in what is known: it has no ratio and the
    // return filter must not call it unknown (PR #45). Absent on a candidate saved before this: not unbounded.
    profitUnbounded: raw.profitUnbounded != null ? !!raw.profitUnbounded : !!(a && a.profitUnbounded),
    pop: num(raw.pop, extra.pop),
    // The future avg per $100 at risk (redesign PR 1): what `savedFromCandidate()` keeps. Absent is null.
    futureAvg: num(raw.futureAvg, extra.futureAvg),
    // Never defaulted: an unstamped candidate stays unstamped, which is what
    // `seasonalStampOf()` reads as the hand-written estimate.
    seasonalSource: raw.seasonalSource ?? extra.seasonalSource ?? null,
    seasonalYears: num(raw.seasonalYears, extra.seasonalYears),
    seasonalAgeDays: num(raw.seasonalAgeDays, extra.seasonalAgeDays),
    rr: Number.isFinite(raw.rr) ? raw.rr
      : (Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss < 0 ? maxProfit / Math.abs(maxLoss) : null),
    // THE PICTURE IS DRAWN AT THE NUMBERS THE CHANCE WAS WORKED OUT AT.
    // `sigma` used to arrive as `sigmaFor(ticker).sigma` — the REALISED
    // volatility — and there was no drift at all, so `ComparePayoffs` drew a
    // risk-free lognormal at a realised sigma under a `pop` computed at the
    // chain's IMPLIED volatility on the seasonal drift. Both now come from
    // `chanceDrawFields()` on the same `chanceOf()` result that produced `pop`,
    // and NEITHER IS DEFAULTED: a candidate saved before this carries null and
    // the compare picture says so instead of drawing something it cannot stand
    // behind (`compareDistInputs()` in visuals.jsx).
    sigma: num(raw.sigma, extra.sigma),
    driftAnnual: num(raw.driftAnnual, extra.driftAnnual),
  };
  c.key = candidateKey(c);
  return c;
}

const num = (a, b) => (Number.isFinite(a) ? a : (Number.isFinite(b) ? b : null));

/* ====================================================================
   COMPARING — up to three, and the cap is explained rather than enforced
   silently. PRD §6: overlapping payoffs plus ONE shared distribution.
==================================================================== */

export const MAX_COMPARE = 3;

/**
 * Tick or untick a candidate. Pure: returns the new list and, when nothing
 * happened, the sentence saying why — a checkbox that silently refuses to tick
 * is a broken checkbox.
 *
 * @returns {{ list: object[], changed: boolean, note: ?string }}
 */
export function toggleCompare(list = [], cand) {
  if (!cand) return { list, changed: false, note: null };
  const key = cand.key || candidateKey(cand);
  const at = list.findIndex((x) => (x.key || candidateKey(x)) === key);
  if (at >= 0) return { list: list.filter((_, i) => i !== at), changed: true, note: null };
  if (list.length >= MAX_COMPARE) {
    return {
      list, changed: false,
      note: `Three is the most that can be compared at once: past that the payoffs overlap into a scribble and the picture stops answering the question. Untick one first.`,
    };
  }
  return { list: [...list, cand], changed: true, note: null };
}

/**
 * THE COMPARE PICTURE AT THE SIZE THE BUDGET BUYS (PR 61). The Compare sheet's rows print each card's figures for the size
 * the budget buys, as the card does; the picture above them was per contract ("up to $78" over a row's "$1,005"). The
 * payoff is linear in the quantity, so the same candidate with every leg, the net, the maximum profit and loss times `n`
 * is the same trade at that size: the curves, the takeaway and the rows then say one number. The breakevens and the
 * chance do not move. n missing or 1 returns the candidate as it is.
 */
export function sizedCandidate(c, n) {
  const k = Number.isFinite(Number(n)) && Number(n) >= 1 ? Math.round(Number(n)) : 1;
  if (!c || k === 1) return c;
  const m = (v) => (v != null && Number.isFinite(Number(v)) ? Number(v) * k : v);
  return { ...c, legs: (c.legs || []).map((l) => ({ ...l, qty: (l.qty || 1) * k })), entryNet: m(c.entryNet),
    maxProfit: m(c.maxProfit), maxLoss: m(c.maxLoss), risk: m(c.risk) };
}

export const inCompare = (list = [], cand) => {
  const key = cand ? (cand.key || candidateKey(cand)) : "";
  return list.some((x) => (x.key || candidateKey(x)) === key);
};

/* ====================================================================
   SAVING — the mechanism positions already use.

   A saved candidate is a `store.saved` item, exactly like one saved from the
   Build screen: same array, same hydration check (legs + ticker), same sync.
   There is no second store, and nothing new to sanitise on load.
==================================================================== */

/** The `store.saved` item for a candidate. Shaped like `saveStrategy()`'s. */
export function savedFromCandidate(c, now = Date.now()) {
  if (!c || !(c.legs || []).length || !c.ticker) return null;
  return {
    id: now,
    name: c.name,
    ticker: c.ticker,
    expKey: c.expKey || null,
    dte: Number.isFinite(c.dte) ? Math.round(c.dte) : null,
    legs: c.legs.map((l) => ({ ...l })),
    savedAt: new Date(now).toISOString(),
    // What the Shortlist knew when it was saved, so the row can be read later
    // without re-pricing it. Never used INSTEAD of a live price: the Build
    // screen re-prices everything it loads.
    entryNet: c.entryNet ?? null,
    spot: c.spot ?? null,
    maxProfit: c.maxProfit ?? null,
    maxLoss: c.maxLoss ?? null,
    pop: c.pop ?? null,
    // THE FUTURE AVG PER $100 AT RISK WHEN SAVED (redesign PR 1, owner decision 4 Oct 2026): the one new field, so
    // Saved can show "When saved" beside "Now". An item saved before has none, and reads "not recorded".
    futureAvg: Number.isFinite(c.futureAvg) ? c.futureAvg : null,
    // ...and the stamp is saved with it, for the same reason the price is.
    seasonalSource: c.seasonalSource ?? null,
    seasonalYears: c.seasonalYears ?? null,
    seasonalAgeDays: c.seasonalAgeDays ?? null,
    from: c.source || "shortlist",
  };
}

/** A saved item read back as a candidate, so it can be compared like any other. */
export const candidateFromSaved = (sv) => candidateOf(sv, { source: "saved" });

/* ☆ IS A TOGGLE (PR 61, owner 7 Oct 2026: "the Find star does not unsave"). A second tap removes the saved item, and
   the message line offers Undo, which puts back THE SAME item (its id, its "When saved" figures). `isSaved()` in App.jsx
   and these read one key: `candidateKey()` of the saved item read back as a candidate. */
/** The `store.saved` item a candidate is already saved as, or null. */
export function savedItemFor(saved = [], c) {
  const key = c ? (c.key || candidateKey(c)) : null;
  if (!key) return null;
  return (Array.isArray(saved) ? saved : []).find((sv) => candidateKey(candidateFromSaved(sv) || {}) === key) || null;
}
/** THE ONE REMOVER: `store.saved` without the item whose id this is. `delSaved()` in App.jsx is its only caller. */
export const withoutSaved = (saved = [], id) => (Array.isArray(saved) ? saved : []).filter((s) => s.id !== id);
/** Undo of a removal: the same item back at the end, unless an item for the same trade is already there. */
export function restoreSaved(saved = [], item) {
  const list = Array.isArray(saved) ? saved : [];
  if (!item) return list;
  const c = candidateFromSaved(item);
  if (list.some((s) => s.id === item.id) || (c && savedItemFor(list, c))) return list;
  return [...list, item];
}

/**
 * Is this saved row still the same trade the Build screen would load today?
 *
 * A saved candidate carries the price it was saved at; the market moves. This
 * says how stale it is in plain words rather than hiding it, because a saved
 * card showing a price from last week reads as a live one.
 */
export function savedAge(sv, now = Date.now()) {
  const t = sv?.savedAt ? Date.parse(sv.savedAt) : (sv?.id || null);
  if (!Number.isFinite(t)) return "saved earlier";
  const d = Math.max(0, now - t);
  const h = d / 3600000;
  if (h < 1) return "saved just now";
  if (h < 24) return `saved ${Math.round(h)}h ago — the prices below are from then`;
  return `saved ${Math.round(h / 24)}d ago — the prices below are from then`;
}

/** What the picture says instead of drawing a curve it cannot stand behind. */
export const compareDistNote = (why) => {
  if (why === "markets") {
    return `These are not all the same market and horizon, so there is no single distribution to draw ` +
      `underneath them: one curve of where the price could finish would have to be two. The payoffs and the ` +
      `breakevens are still on one axis, read as the move from each market\u2019s own price today.`;
  }
  if (why === "sigma" || why === "horizon") {
    return `Where the price could finish is not drawn: ${why === "sigma" ? "the volatility" : "the horizon"} ` +
      `these candidates were priced at did not travel with them. The payoffs and the breakevens are unaffected ` +
      `\u2014 they are arithmetic on the legs, not a forecast.`;
  }
  if (why === "drift") {
    return `Where the price could finish is not drawn: these candidates carry no seasonal drift, and a missing ` +
      `drift is not a drift of zero. Drawing a market that goes nowhere under a chance worked out on the ` +
      `season would be two readings of one trade. Candidates saved before this was recorded have none.`;
  }
  return null;
};
