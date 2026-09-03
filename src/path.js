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

/** The three steps, in order. `n` is what the user sees on screen. */
export const STEPS = [
  { n: 1, id: "radar", label: "Radar", blurb: "which markets have something today" },
  { n: 2, id: "shortlist", label: "Shortlist", blurb: "the structures that survived" },
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
export function stepCarry({ ticker = null, trade = null, compare = 0 } = {}) {
  return {
    radar: "every market",
    shortlist: ticker ? (compare > 0 ? `${ticker} · ${compare} to compare` : ticker) : "pick a market first",
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
 *                      dte, maxProfit, maxLoss, risk, pop, rr, sigma }
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
    pop: num(raw.pop, extra.pop),
    rr: Number.isFinite(raw.rr) ? raw.rr
      : (Number.isFinite(maxProfit) && Number.isFinite(maxLoss) && maxLoss < 0 ? maxProfit / Math.abs(maxLoss) : null),
    sigma: num(raw.sigma, extra.sigma),
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
    from: c.source || "shortlist",
  };
}

/** A saved item read back as a candidate, so it can be compared like any other. */
export const candidateFromSaved = (sv) => candidateOf(sv, { source: "saved" });

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
