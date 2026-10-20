// ============================================================================
// src/visuals.jsx — THE VISUAL LANGUAGE (PRD §6).
//
// Three visuals, one source of truth. Every zone, every colour and every
// sentence in this file is derived from `payoff(legs, S)` in src/engine.js
// through the single function `payoffBands()` below. Nothing here recomputes
// where a trade wins: if two screens ever disagreed about the same trade, it
// would be because someone added a second way of asking.
//
//   · BandThumbnail  — price line + green/red bands. Readable at 80px. Lists.
//   · Gauge          — the payoff projected into polar coordinates, needle at
//                      spot. Colours come from the SIGN of the payoff, so left
//                      is not always red: a bear spread is green on the left.
//   · UnifiedPosition— price history → dispersion cone → terminal distribution
//                      → payoff rotated 90°, all on ONE vertical price axis.
//
// Every visual exposes two things (PRD §6):
//   takeaway()        one always-visible English sentence, generated from the
//                     numbers. If it needs two sentences, the chart is wrong.
//   explain(element)  the explanation of one element, on tap.
// Neither is ever hand-written per case, and there is no hover anywhere: tap
// to open, tap outside to close, and on a narrow screen the explanation lands
// below the chart instead of floating over it.
// ============================================================================
import React, { useState, useEffect, useRef, useId } from "react";
import { payoff, N as normCdf } from "./engine.js";
import { T, TYPE } from "./theme.js";
import { mono, sans } from "./ui.jsx";
import { money, RULES, pctText, liquidityThreshold, RECOMMENDED_LIQUIDITY,
  payoffCeiling, scratchLevel, NO_CEILING, chanceInTen, takeProfitBasisWords } from "./rules.js";

// PR #48 SWEEP: the stacks come from ui.jsx; the HTML text around a drawing takes the type tokens. The drawings
// themselves (SVG text) keep their own sizes, the card's axis label at the 12px token (`labelSize`).
const FS = TYPE.size, LH = TYPE.line;

/** `$4.55` — a price, always two decimals, never confused with a P&L. */
export const price = (x) => (Number.isFinite(Number(x)) ? `$${Number(x).toFixed(2)}` : "n/a");
/** `+$120` / `-$80` — a P&L where the SIGN is the information. */
export const pnl$ = (x) => (Number.isFinite(Number(x)) ? `${Number(x) < 0 ? "-" : "+"}$${Math.abs(Math.round(Number(x))).toLocaleString("en-US")}` : "n/a");
/** `$120` — the same amount where an English verb already carries the sign.
    "loses -$118" and "pays +$120" both read as mistakes; the verb says it. */
export const amount$ = (x) => (Number.isFinite(Number(x)) ? `$${Math.abs(Math.round(Number(x))).toLocaleString("en-US")}` : "n/a");

/* ====================================================================
   THE ONE FUNCTION EVERY VISUAL ASKS

   Sample the expiry payoff across a price range and cut it into bands by the
   SIGN of the result. A vertical spread gives two bands, an iron condor gives
   three, a butterfly gives three — with no special case anywhere, because the
   sign of a number is the only thing being read.
==================================================================== */

/**
 * @param {object} arg
 *   legs      — [{ side, type, strike, qty }]
 *   entryNet  — what the structure cost per share (negative for a credit)
 *   lo, hi    — the price range to sample; defaults to ±30% around `spot`
 *   spot      — today's price, used for the default range and for `at`
 *   n         — samples; 240 matches the Build screen's own curve resolution
 * @returns { samples, bands, breakevens, maxProfit, maxLoss, at, lo, hi, spot }
 *   bands: [{ lo, hi, sign }] in price order, sign +1 profit / -1 loss.
 */
export function payoffBands({ legs = [], entryNet = 0, spot = null, lo, hi, n = 240 } = {}) {
  const base = Number.isFinite(spot) && spot > 0 ? spot
    : (legs.length ? legs.reduce((a, l) => a + l.strike, 0) / legs.length : 100);
  const LO = Number.isFinite(lo) ? lo : base * 0.7;
  const HI = Number.isFinite(hi) ? hi : base * 1.3;

  /** P&L per contract at expiry, in dollars. The only definition used here. */
  const at = (s) => (payoff(legs, s) - entryNet) * 100;

  const samples = [];
  for (let i = 0; i <= n; i++) {
    const s = LO + (i / n) * (HI - LO);
    samples.push({ s, pnl: at(s) });
  }

  // A P&L of exactly zero is not a profit: you got your money back. Folding it
  // into the loss side also stops zero-width bands appearing on flat wings.
  const signOf = (v) => (v > 0 ? 1 : -1);
  const bands = [];
  const breakevens = [];
  let startS = samples[0].s;
  let curSign = signOf(samples[0].pnl);
  for (let i = 1; i < samples.length; i++) {
    const sg = signOf(samples[i].pnl);
    if (sg === curSign) continue;
    // Interpolate the crossing so the band edge IS the breakeven, rather than
    // the nearest sample to it.
    const a = samples[i - 1], b = samples[i];
    const t = a.pnl === b.pnl ? 0.5 : a.pnl / (a.pnl - b.pnl);
    const cross = a.s + t * (b.s - a.s);
    bands.push({ lo: startS, hi: cross, sign: curSign });
    breakevens.push(cross);
    startS = cross;
    curSign = sg;
  }
  bands.push({ lo: startS, hi: samples[samples.length - 1].s, sign: curSign });

  const pnls = samples.map((p) => p.pnl);
  const sampledMax = Math.max(...pnls);
  // THE SAMPLED TOP IS NOT THE BEST CASE WHEN THERE IS NO CEILING
  // (`payoffCeiling()` in src/rules.js). The range above stops at +30%, so for
  // a long call `Math.max(...pnls)` is the payoff at 1.3 x spot and nothing
  // more: a number produced by where the sampling stopped. `sampledTop` stays
  // for the drawing code, which has to scale a picture to something; the
  // SENTENCES read `maxProfit` and get null, which is the truth.
  const unbounded = !payoffCeiling(legs).above;
  return {
    samples, bands, breakevens,
    maxProfit: unbounded ? null : sampledMax,
    unbounded, sampledTop: sampledMax,
    maxLoss: Math.min(...pnls),
    at, lo: LO, hi: HI, spot: Number.isFinite(spot) ? spot : null,
  };
}

/** The profit bands only, in price order — what the eye reads as "green". */
export const profitBands = (b) => b.bands.filter((x) => x.sign > 0);

/* --------------------------------------------------------------------
   A SCRATCH IS NOT A WIN — AND THIS IS FOR THE COPY ONLY.

   Nothing below filters a candidate, moves a zone or changes a colour.
   `payoffBands()`, `profitBands()` and `chanceInProfit()` are untouched and
   still answer exactly what they answered before: where the payoff is positive,
   and how often the price lands there. That arithmetic was never wrong.

   What was wrong was joining those two true numbers into one sentence. On the
   live UNG broken-wing butterfly the green ran from the bottom of the range up
   to $11.51 and the price lands inside it about 73% of the time — but most of
   that green is the flat lower wing paying ONE DOLLAR against a $51 peak. Read
   next to "up to $50", 73% becomes a claim nobody made.

   So the profit region is cut a second time, at `scratchLevel()` in
   src/rules.js: above the line is where the money actually is, below it the
   trade merely scratches. The cut uses the same samples and the same linear
   interpolation the sign cut above uses, so the two can never disagree about a
   crossing — and a whole band whose own peak sits under the line simply
   disappears from the result, which is the band-level test read off the same
   arithmetic instead of a second one beside it.
-------------------------------------------------------------------- */

/** The regions where the payoff clears `level`, interpolated like the sign cut. */
export function bandsAbove(b, level) {
  if (!Number.isFinite(level)) return [];
  const sp = b?.samples || [];
  if (sp.length < 2) return [];
  const out = [];
  let start = null;
  const cross = (a, c) => (a.pnl === c.pnl ? a.s : a.s + ((level - a.pnl) / (c.pnl - a.pnl)) * (c.s - a.s));
  if (sp[0].pnl > level) start = sp[0].s;
  for (let i = 1; i < sp.length; i++) {
    const was = sp[i - 1].pnl > level, is = sp[i].pnl > level;
    if (is && !was) start = cross(sp[i - 1], sp[i]);
    else if (!is && was) { out.push({ lo: start, hi: cross(sp[i - 1], sp[i]) }); start = null; }
  }
  if (start != null) out.push({ lo: start, hi: sp[sp.length - 1].s });
  return out;
}

/** Where the money is: the profit region minus the scratch. Empty when unknown. */
export const payingBands = (b) => {
  const lv = scratchLevel(b?.maxProfit);
  return lv == null ? [] : bandsAbove(b, lv);
};

/**
 * How the green splits between money and scratch, as probabilities.
 * `null` when there is no ceiling to take a share of, or no distribution to
 * measure against — in both cases there is nothing to say and the takeaway
 * says nothing rather than guessing.
 */
export function scratchSplit(b, { spot, sigma, dte, driftAnnual } = {}) {
  const lv = scratchLevel(b?.maxProfit);
  const inProfit = chanceInProfit(b, { spot, sigma, dte, driftAnnual });
  if (lv == null || inProfit == null) return null;
  const mass = bandMass(b, bandsAbove(b, lv), { spot, sigma, dte, driftAnnual });
  const paying = bandsAbove(b, lv);
  return { level: lv, paying, inProfit, pPaying: mass, pScratch: Math.max(0, inProfit - mass) };
}

/* --------------------------------------------------------------------
   THE CHART CANNOT SAY SOMETHING ELSE — TWO FIXES IN ONE FUNCTION.

   1) THE DRIFT. `driftAnnual` used to DEFAULT TO ZERO and no caller ever
      passed one, so the green under the distribution was drawn against a
      market that goes nowhere, while the CHANCE stat printed beside it was a
      closed form at a risk-neutral 4.5% and the Build panel's Monte Carlo ran
      on the app's seasonal means. Three drifts, one picture. The default is
      gone: a caller that does not say what the drift is gets `null`, and a
      dash, instead of a confident number worked out against an assumption
      nobody made.

   2) THE TAILS. `payoffBands()` samples a FINITE range — ±30% of spot — so the
      outermost bands stop where the sampling stops, not where the payoff does.
      Integrating the lognormal band by band therefore threw away every path
      that finished outside that window and reported the remainder as a
      probability. On BOIL, sigma 0.85 over 45 days, one standard deviation is
      about 30%: roughly a third of the distribution was simply missing, and
      the shortfall was worst on exactly the structures whose profit region
      runs to an edge. A band that reaches the edge of the sampling now reaches
      the tail, which is what the payoff itself does — `probProfit` in
      engine.js always did this, and the band integration never did.
-------------------------------------------------------------------- */

/** The lognormal mass over a set of price zones, tails included. */
export function bandMass(b, zones, { spot, sigma, dte, driftAnnual }) {
  if (!Number.isFinite(spot) || !(sigma > 0) || !(dte > 0) || !Number.isFinite(driftAnnual)) return null;
  const Tyr = dte / 365, sq = sigma * Math.sqrt(Tyr);
  const mu = Math.log(spot) + (driftAnnual - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sq));
  // The edges of the sampled window, to a hair: a zone that reaches one of them
  // is a zone that continues past it.
  const eps = Math.max(1e-9, (b.hi - b.lo) * 1e-9);
  return (zones || []).reduce((a, z) => {
    const lo = z.lo <= b.lo + eps ? 0 : cdf(z.lo);
    const hi = z.hi >= b.hi - eps ? 1 : cdf(z.hi);
    return a + Math.max(0, hi - lo);
  }, 0);
}

/** Chance the price finishes inside the green, under a lognormal at `dte`. */
export function chanceInProfit(b, { spot, sigma, dte, driftAnnual }) {
  return bandMass(b, profitBands(b), { spot, sigma, dte, driftAnnual });
}

/* ====================================================================
   TAKEAWAYS — one sentence each, generated from the numbers above.
==================================================================== */

/**
 * Describe the green zones as an English predicate — no subject, so the caller
 * can put the ticker in front of it: "CORN makes money above $4.20".
 */
function zonesPhrase(zones, b) {
  const open = (z) => z.lo <= b.lo + 1e-9;
  const openTop = (z) => z.hi >= b.hi - 1e-9;
  const one = (z) => (open(z) && openTop(z) ? "at any price"
    : open(z) ? `below ${price(z.hi)}`
      : openTop(z) ? `above ${price(z.lo)}`
        : `between ${price(z.lo)} and ${price(z.hi)}`);
  if (!zones.length) return null;
  if (zones.length === 1) return one(zones[0]);
  if (zones.length === 2) return `${one(zones[0])} and ${one(zones[1])}`;
  return `in ${zones.length} separate bands, the widest ${one(zones.slice().sort((x, y) => (y.hi - y.lo) - (x.hi - x.lo))[0])}`;
}

function greenPhrase(b) {
  const g = profitBands(b);
  if (!g.length) return "makes money at no price at expiry";
  return `makes money ${zonesPhrase(g, b)}`;
}

/**
 * `1 time in 10`, `5 times in 10` — never "1 times".
 *
 * ONE ROUNDING, IN ONE PLACE. This used to round the raw probability itself,
 * while every "CHANCE 75%" on screen rounded the same number separately — which
 * is how one spread came to read 44%, 45% and "5 times in 10" across three
 * screens. `chanceInTen()` in rules.js derives the phrase FROM the percentage,
 * so the two ways of saying it cannot disagree. Kept as a name because half the
 * visual takeaways read better with it.
 */
export const inTenPhrase = (p) => chanceInTen(p);

/** BAND THUMBNAIL takeaway. Names the market, then where the green is. */
export function bandTakeaway(b, { ticker = "this market" } = {}) {
  const g = profitBands(b);
  if (!g.length) return `${ticker}: no price at expiry pays this trade back — check the structure before you send it.`;
  const where = b.spot == null ? null : g.some((z) => b.spot >= z.lo && b.spot <= z.hi);
  return `${ticker} ${greenPhrase(b)}` +
    (where == null ? "." : where ? `, and at ${price(b.spot)} it is inside that today.` : `, and at ${price(b.spot)} it is outside that today.`);
}

/** GAUGE takeaway. The needle is the point, so the sentence starts there. */
export function gaugeTakeaway(b, { ticker = "this market" } = {}) {
  if (b.spot == null) return `${ticker} ${greenPhrase(b)} — today's price is not loaded, so the needle is not showing.`;
  const now = b.at(b.spot);
  const inGreen = now > 0;
  const g = profitBands(b);
  const nearest = g.length
    ? g.reduce((best, z) => {
      const d = b.spot < z.lo ? z.lo - b.spot : b.spot > z.hi ? b.spot - z.hi : 0;
      return best && best.d <= d ? best : { d, z };
    }, null)
    : null;
  if (inGreen) {
    return `${ticker} is at ${price(b.spot)}: expiring here pays ${amount$(now)}, and it stays profitable ` +
      `${nearest && nearest.z.hi < b.hi - 1e-9 ? `up to ${price(nearest.z.hi)}` : "however far it runs"}.`;
  }
  if (!nearest) return `${ticker} is at ${price(b.spot)}: expiring here loses ${amount$(now)}, and no price pays this trade back.`;
  const move = nearest.z.lo > b.spot ? nearest.z.lo : nearest.z.hi;
  const pct = Math.abs(move - b.spot) / b.spot;
  return `${ticker} is at ${price(b.spot)}: expiring here loses ${amount$(now)}, and it needs ` +
    `${move > b.spot ? "a rise" : "a fall"} to ${price(move)} — ${pctText(pct)} away — to break even.`;
}

/**
 * UNIFIED takeaway. Spot, the payoff there, and how often the cone lands green —
 * and, when most of that green is a scratch, WHERE THE MONEY ACTUALLY IS.
 *
 * Still ONE sentence (PRD §6). The extra clause is only written when the numbers
 * demand it: when the chance of finishing in a band that pays a real share of
 * the best case is SMALLER than the chance of finishing in one that merely
 * scratches. That comparison is read off the distribution, not tuned — "more of
 * this green is a scratch than is money" is a fact about the trade, and it is
 * the fact a beginner cannot see when 73% sits next to "up to $50".
 */
export function unifiedTakeaway(b, { ticker = "this market", sigma, dte, driftAnnual } = {}) {
  if (b.spot == null) return `${ticker}: today's price is not loaded, so nothing can be projected yet.`;
  const now = b.at(b.spot);
  const p = chanceInProfit(b, { spot: b.spot, sigma, dte, driftAnnual });
  const paid = `expiring at today's price would ${now > 0 ? "pay" : "lose"} ${amount$(now)}`;
  const head = `${ticker} is at ${price(b.spot)} and ${greenPhrase(b)}`;
  if (p == null) return `${head} — ${paid}.`;

  const sp = scratchSplit(b, { spot: b.spot, sigma, dte, driftAnnual });
  const where = sp && sp.paying.length ? zonesPhrase(sp.paying, b) : null;
  if (sp && where && sp.pScratch > sp.pPaying) {
    return `${ticker} is at ${price(b.spot)} and ${greenPhrase(b)} about ${pctText(p)} of the time in the next ` +
      `${Math.round(dte)} days, but most of that is a scratch — it pays more than ${amount$(sp.level)} only ` +
      `${where}, about ${pctText(sp.pPaying)} of the time — and ${paid}.`;
  }
  return `${head}, which the next ${Math.round(dte)} days reach about ${pctText(p)} of the time — and ${paid}.`;
}

/* ====================================================================
   EXPLAIN — the explanation of a single element, on tap.
   Generated from the same numbers, so an explanation can never describe a
   chart the code did not draw.
==================================================================== */

export function explainElement(el, b, ctx = {}) {
  const { ticker = "this market", sigma, dte, driftAnnual } = ctx;
  switch (el) {
    case "green": {
      if (!profitBands(b).length) {
        return `There is no green here: no price at expiry pays this structure back what it cost. ` +
          (b.unbounded ? `` : `The best it can do is ${pnl$(b.maxProfit)}.`);
      }
      const head = `Green is every price at which this trade is worth more at expiry than it cost. ` +
        `Here that is ${greenPhrase(b).replace(/^makes money /, "")}`;
      // NO CEILING: the top of the drawn range is where the sampling stopped,
      // not what the trade can make, and "worth up to" that number is the lie
      // this whole file exists to avoid.
      if (b.unbounded) {
        return `${head}, with ${NO_CEILING} on what it can be worth: the payoff keeps rising with the price, ` +
          `so there is no "up to" to print.`;
      }
      const pay = payingBands(b);
      const lv = scratchLevel(b.maxProfit);
      // Green is one colour but not one outcome. Where a real part of that band
      // pays back a rounding of the peak, say so here rather than let the eye
      // read the whole stripe as the best case.
      if (pay.length && lv != null && zonesPhrase(pay, b) !== greenPhrase(b).replace(/^makes money /, "")) {
        return `${head}, worth up to ${pnl$(b.maxProfit)} — but only ${zonesPhrase(pay, b)} pays more than ` +
          `${amount$(lv)}; the rest of the green hands back roughly what it cost.`;
      }
      return `${head}, worth up to ${pnl$(b.maxProfit)}.`;
    }
    case "red":
      return `Red is every price at which it expires worth less than you paid. The worst case is ` +
        `${pnl$(b.maxLoss)}, and it cannot get worse than that — that is what "defined risk" means.`;
    case "breakeven":
      return b.breakevens.length
        ? `Break even at ${b.breakevens.map(price).join(" and ")}: the price where the trade has given ` +
          `back exactly what it cost. Left of it and right of it are different outcomes, not different amounts.`
        : `There is no break-even price here: the payoff never crosses zero inside the range shown.`;
    case "needle":
      return b.spot == null
        ? `The needle marks today's price. It is not drawn because the price has not loaded.`
        : `The needle is today's price, ${price(b.spot)}. Expiring exactly here would ${b.at(b.spot) > 0 ? "pay" : "lose"} ` +
          `${amount$(b.at(b.spot))} — it is where the trade stands if nothing at all happens.`;
    case "history":
      return `That is where ${ticker} has actually traded. It shares the vertical price axis with everything to ` +
        `its right, so a level in the past lines up with the same level in the payoff: you can read straight ` +
        `across from where the price has been to what the trade would be worth there.`;
    case "cone":
      return sigma > 0 && dte > 0
        ? `The cone is where the price can realistically get to by expiry, at ${pctText(sigma)} annual volatility ` +
          `over ${Math.round(dte)} days: the pale band is the 5–95% range, the solid one 25–75%, and the dashed ` +
          `line the middle path.`
        : `The cone is where the price can realistically get to by expiry. It needs a volatility and a number of days to draw.`;
    case "distribution": {
      const p = chanceInProfit(b, { spot: b.spot, sigma, dte, driftAnnual });
      return `The histogram is the same cone read at expiry only: how likely each finishing price is. ` +
        (p == null ? `Where it overlaps the green bands is where this trade pays.`
          : `About ${pctText(p)} of it falls inside the green bands.`);
    }
    case "payoff":
      return `The payoff is turned on its side so it shares the price axis: read a price on the left, follow ` +
        `it across, and the width tells you the money. ` +
        (b.unbounded
          ? `The worst case is ${pnl$(b.maxLoss)}; there is ${NO_CEILING} on the best one — the payoff keeps ` +
            `widening as the price rises, and the chart simply stops where the sampling does.`
          : `Best case ${pnl$(b.maxProfit)}, worst case ${pnl$(b.maxLoss)}.`);
    case "spotline":
      return b.spot == null
        ? `The dashed line runs from today's price across to what the trade is worth there.`
        : `The dashed line runs from today's price, ${price(b.spot)}, across to what this trade is worth at that ` +
          `price on expiry day: ${pnl$(b.at(b.spot))}.`;
    default:
      return `Every zone on this chart comes from the same payoff calculation, so no two screens can disagree about this trade.`;
  }
}

/* ====================================================================
   Tap-to-explain plumbing. There is no hover on a phone.
==================================================================== */

/** True while the viewport is too narrow to float an explanation over content. */
export function useNarrow(px = 720) {
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= px : false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [px]);
  return narrow;
}

/** Measured width of a block, so a component can decide its own level of detail. */
export function useWidth(fallback = 900) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth || fallback));
    ro.observe(ref.current);
    setW(ref.current.clientWidth || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

/**
 * The frame every visual sits in: the chart, the always-visible takeaway, and
 * the explanation of whatever was last tapped. Tap outside closes it; on a
 * narrow screen the explanation renders below rather than over the chart.
 */
export function Figure({ takeaway, explanation, onClose, children, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!explanation) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose && onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [explanation, onClose]);
  return (
    <div ref={ref} style={{ ...sans, ...style }}>
      {children}
      {takeaway && (
        <div style={{ ...sans, fontSize: FS.sm, lineHeight: LH.body, color: T.body, marginTop: 8 }}>{takeaway}</div>
      )}
      {explanation && (
        <div style={{
          marginTop: 8, padding: "10px 12px", background: T.panel,
          border: `1px solid ${T.blue}55`, borderRadius: 8, borderLeft: `3px solid ${T.blue}`,
        }}>
          <div style={{ ...sans, fontSize: FS.sm, color: T.body, lineHeight: LH.body }}>{explanation}</div>
          <button onClick={onClose} style={{ ...sans, fontSize: FS.xs, marginTop: 6, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: 0 }}>
            tap anywhere outside to close
          </button>
        </div>
      )}
    </div>
  );
}

/* ====================================================================
   1) BAND THUMBNAIL
   The underlying's price line over the green/red bands, and nothing else. No
   numbers, no labels, no legend: at 80px there is no room for any of them and
   no need either.

   PRICE IS THE VERTICAL AXIS, exactly as it is in the unified component, so the
   two never disagree about which way is up. That makes the bands horizontal
   stripes and lets the underlying's own recent path run left to right across
   them, ending at today's price on the right-hand edge. Without that line the
   thumbnail is a row of coloured bars: it says where the trade pays, but not
   where the market actually is in relation to it, which is the whole question.

   With no history loaded the line degrades to a flat one at today's price —
   still an answer ("here, and we do not know how it got here"), never a blank.
==================================================================== */

/** The closes of a bar series, whatever shape the feed used. */
const closes = (bars) => (Array.isArray(bars) ? bars : [])
  .map((x) => Number(x?.close ?? x?.c ?? x?.value ?? x))
  .filter((x) => Number.isFinite(x) && x > 0);

/**
 * THE PRICE LINE, REDUCED TO WHAT THE SIZE CAN CARRY.
 *
 * A hundred and twenty daily closes drawn across 230px is a scribble: every
 * day gets under two pixels, the line reads as noise, and at 80px in a list it
 * is a grey smudge that says nothing about where the market has been. This was
 * the last thing on the PRD's NEXT list that was code rather than access — "no
 * unreadable candles at 80px" — and it is one function, not a new chart.
 *
 * The series is bucketed into at most `maxPts` points and each bucket becomes
 * its mean, so the SHAPE survives and the wiggle does not. Two rules keep it
 * honest: the first and the last close are always kept exactly, because the
 * last one is today and the picture is about where today sits, and a series
 * already short enough is returned untouched rather than smoothed for no reason.
 *
 * @param {number[]} hist   closes, oldest first
 * @param {number}   maxPts the most points the width can show
 * @returns {number[]} at most `maxPts` closes, first and last preserved
 */
export function simplifyCloses(hist = [], maxPts = 40) {
  const xs = hist.filter((x) => Number.isFinite(x) && x > 0);
  const n = Math.max(2, Math.floor(maxPts));
  if (xs.length <= n) return xs;
  const out = [];
  for (let i = 0; i < n; i++) {
    const from = Math.floor((i / n) * xs.length);
    const to = Math.max(from + 1, Math.floor(((i + 1) / n) * xs.length));
    let s = 0;
    for (let j = from; j < to; j++) s += xs[j];
    out.push(s / (to - from));
  }
  out[0] = xs[0];
  out[out.length - 1] = xs[xs.length - 1];
  return out;
}

/** How many points a line this wide can actually show. One point per ~7px. */
export const thumbPoints = (width) => Math.max(6, Math.round(width / 7));

export function BandThumbnail({ bands, width = 160, height = 44, spot = null, entrySpot = null, bars = [], onExplain, title, lineWidth = 1.4 }) {
  const b = bands;
  if (!b || !b.bands.length) return null;
  const s0 = spot ?? b.spot;
  const hist = simplifyCloses(closes(bars), thumbPoints(width * 0.78));

  // The price axis has to hold the bands AND the history, or the line walks off
  // the top of the picture the moment the market moves outside the payoff range.
  // `entrySpot` is where the market stood when the position was opened (PR #44, TASK 2): it is marked on the same
  // axis as today's price, so the picture says how far the market has come, and the axis has to hold it too.
  const ent = Number.isFinite(Number(entrySpot)) && entrySpot != null ? Number(entrySpot) : null;
  const lo = Math.min(b.lo, ...(hist.length ? [Math.min(...hist)] : []), ...(ent != null ? [ent] : []));
  const hi = Math.max(b.hi, ...(hist.length ? [Math.max(...hist)] : []), ...(ent != null ? [ent] : []));
  const Y = (s) => height - ((s - lo) / (hi - lo || 1)) * height;

  // The history occupies the left three quarters; today sits at the right edge,
  // so the eye lands on "where we are" without hunting for it.
  const xToday = width * 0.78;
  const XH = (i) => (hist.length > 1 ? (i / (hist.length - 1)) * xToday : xToday);
  const path = hist.length > 1
    ? hist.map((c, i) => `${i ? "L" : "M"}${XH(i).toFixed(2)},${Y(c).toFixed(2)}`).join(" ")
    : null;

  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={title || "where this trade makes and loses money, and where the price is now"}
      style={{ display: "block", borderRadius: 4, background: T.bg, cursor: onExplain ? "pointer" : "default", maxWidth: "100%" }}>
      {b.bands.map((z, i) => (
        <rect key={i} x={0} y={Y(z.hi)} width={width} height={Math.max(0.5, Y(z.lo) - Y(z.hi))}
          fill={z.sign > 0 ? T.green : T.red} opacity={z.sign > 0 ? 0.3 : 0.15}
          onClick={tap(z.sign > 0 ? "green" : "red")} />
      ))}
      {b.breakevens.map((s, i) => (
        <line key={i} x1={0} x2={width} y1={Y(s)} y2={Y(s)}
          stroke={T.ink} strokeWidth={1} opacity={0.35} strokeDasharray="3 3" onClick={tap("breakeven")} />
      ))}
      {/* the price line — the underlying's own path across the zones */}
      {path
        ? <path d={path} fill="none" stroke={T.ink} strokeWidth={lineWidth} strokeLinejoin="round"
            strokeLinecap="round" opacity={0.85} onClick={tap("history")} />
        : s0 != null && (
          <line x1={0} x2={xToday} y1={Y(s0)} y2={Y(s0)} stroke={T.ink} strokeWidth={1.2}
            opacity={0.4} strokeDasharray="2 3" onClick={tap("history")} />
        )}
      {ent != null && (
        <g aria-label="where the market was when you opened it">
          <line x1={0} x2={width} y1={Y(ent)} y2={Y(ent)} stroke={T.amber} strokeWidth={1.4} strokeDasharray="5 3" />
          <text x={4} y={Math.max(11, Math.min(height - 3, Y(ent) - 3))} fill={T.amber} fontSize={12}
            style={{ fontFamily: "ui-monospace, Menlo, monospace" }}>entry</text>
        </g>
      )}
      {s0 != null && (
        <g onClick={tap("needle")}>
          <line x1={xToday} x2={width} y1={Y(s0)} y2={Y(s0)} stroke={T.ink} strokeWidth={1.6} />
          <circle cx={xToday} cy={Y(s0)} r={Math.max(2.5, height * 0.09)} fill={T.ink} />
        </g>
      )}
    </svg>
  );
}

/** The thumbnail with its takeaway and tap-to-explain, for a list row. */
export function BandThumbFigure({ legs, entryNet, spot, bars, ticker, width, height, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  return (
    <Figure style={style} takeaway={bandTakeaway(b, { ticker })}
      explanation={open ? explainElement(open, b, { ticker }) : null} onClose={() => setOpen(null)}>
      <BandThumbnail bands={b} width={width} height={height} bars={bars} onExplain={setOpen}
        title={bandTakeaway(b, { ticker })} />
    </Figure>
  );
}

/* ====================================================================
   1b) OPEN-INTEREST STRIP
   The liquidity floor, drawn instead of described.

   WHAT IT SHOWS: every CONTRACT on ONE expiry — the calls and the puts, which
   is twice the number of strikes — lined up from the emptiest to the
   busiest, with the line where the floor cuts. Left of the line is what the
   setting removes; right of it is what survives. Move the filter and the line
   moves. That is the entire concept of a relative floor in one picture, and it
   took three paragraphs of prose to fail to explain.

   THIS IS THE ONE VISUAL IN THIS FILE NOT CUT FROM `payoffBands()`, and that is
   not an exception to the rule — the rule is that the ZONES OF A TRADE come
   from one place, and this chart has no trade in it. It draws how crowded each
   strike is, which is a fact about the market and not about a structure.
   Do not confuse it with `terminalDist()`: that one is where the PRICE may end
   up, a forecast built from volatility and time. This one is a headcount of who
   is already there.

   THE HEIGHT IS ON A COMPRESSED SCALE, AND THE PICTURE SAYS SO. Open interest
   on these chains runs from 1 to 66,130 on a single expiry: drawn linearly you
   would see two bars and a flat grey floor. Heights are log-compressed so the
   SHAPE survives, and because that makes height unreadable as a quantity, the
   real smallest and largest are printed at the ends and the takeaway carries
   the numbers. A chart whose vertical axis cannot be read as a number must not
   pretend otherwise.
==================================================================== */

/** The floor under a bar with NOTHING open, in pixels. See `oiBarHeights`. */
export const OI_EMPTY_BAR = 2;

/** Bar heights for a sorted list, log-compressed so the shape survives. */
export function oiBarHeights(sorted = [], height = 46) {
  if (!sorted.length) return [];
  const top = Math.log1p(Math.max(...sorted, 1));
  return sorted.map((v) => {
    const h = top > 0 ? (Math.log1p(Math.max(0, v)) / top) * height : 0;
    // A STRIKE WITH NOTHING OPEN IS A FACT, AND IT HAS TO BE VISIBLE.
    // (Drawn at nearly full opacity for the same reason: two pixels at half
    // strength is fainter than the one pixel this replaced.)
    // log1p(0) is 0, so on BOIL's 2026-10-09 board — where the emptiest third
    // of the strikes carry no open contracts at all — two thirds of the strip
    // drew at zero height and read as "not drawn". One pixel was not enough to
    // tell the two apart on a phone. Two is, and the colour says which it is.
    return Math.max(v <= 0 ? OI_EMPTY_BAR : 1, h);
  });
}

/** Is this bar a strike with nothing open at all? Drawn grey, never as a count. */
export const isEmptyStrike = (v) => Number(v) <= 0;

/** How many of the sorted counts the floor removes. */
export const oiCutAt = (sorted = [], threshold = 0) =>
  sorted.filter((v) => v < threshold).length;

/**
 * WHERE THE APP'S OWN RECOMMENDATION WOULD CUT THIS EXPIRY.
 *
 * Only used when the floor is OFF. At that setting the strip is a solid green
 * block with no line in it, which teaches nothing: "off" is only meaningful
 * against what is being switched off. The ghost line is drawn from
 * `liquidityThreshold()` at the recommended level, so it is the real cut this
 * chain would take and not an illustration — and it is dashed, dimmed and
 * labelled, because nothing here is being filtered.
 */
export const oiGhostCut = (sorted = []) => {
  const t = liquidityThreshold(sorted, RECOMMENDED_LIQUIDITY);
  const cut = oiCutAt(sorted, t.threshold);
  return { threshold: t.threshold, cut, basis: t.basis };
};

/** One generated sentence: what this setting does to this expiry. */
export function oiStripTakeaway(sorted = [], threshold = 0, { expKey } = {}) {
  if (!sorted.length) return "";
  const cut = oiCutAt(sorted, threshold);
  const where = expKey ? ` on ${expKey}` : "";
  // "At least 0 open contracts" is true and silly: with no floor at all the
  // fact worth stating is that nothing is being filtered, not the threshold.
  // CONTRACTS, NOT STRIKES, and the difference is a factor of two. The peer
  // set is `expiryOpenInterest()`, which walks the CALLS AND THE PUTS on the
  // expiry: BOIL 2026-10-09 has 26 strikes and 52 contracts, so "the 45
  // emptiest of the 52 strikes" was counting one thing and naming another.
  // Every count in this file is a count of contracts.
  if (threshold <= 0) {
    return `No contract is removed at this setting: all ${sorted.length}${where} are offered, from the ` +
      `${sorted[0]} open contracts on the emptiest to ${sorted[sorted.length - 1]} on the busiest.`;
  }
  if (cut === 0) {
    return `All ${sorted.length} contracts${where} carry at least ${threshold} open contracts, so this setting ` +
      `removes none of them.`;
  }
  return `The ${cut} emptiest of the ${sorted.length} contracts${where} are removed for carrying under ` +
    `${threshold} open contracts, against ${sorted[sorted.length - 1]} on the busiest contract here.`;
}

export function OpenInterestStrip({
  peers = [], threshold = 0, expKey, width = 320, height = 46, onExplain,
}) {
  const sorted = [...peers].filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const heights = oiBarHeights(sorted, height);
  const cut = oiCutAt(sorted, threshold);
  const bw = width / sorted.length;
  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  const lineX = cut * bw;
  // With the floor OFF there is no cut to draw, and a solid green block says
  // nothing about what has been switched off. The ghost shows where the app's
  // own recommendation would land on THIS expiry — dashed, dimmed, labelled,
  // and filtering nothing.
  const ghost = threshold > 0 ? null : oiGhostCut(sorted);
  const ghostX = ghost ? ghost.cut * bw : 0;

  return (
    <svg width={width} height={height + 14} viewBox={`0 0 ${width} ${height + 14}`} role="img"
      aria-label={oiStripTakeaway(sorted, threshold, { expKey })}
      style={{ display: "block", maxWidth: "100%", background: T.bg, borderRadius: 4, cursor: onExplain ? "pointer" : "default" }}>
      {sorted.map((v, i) => {
        const removed = v < threshold;
        // THREE STATES, THREE COLOURS. A strike with nothing open is not the
        // same fact as one the floor removed or one that survived: at OFF it is
        // not removed at all, and drawing it green would say the app is happy
        // with a strike on which nobody holds a single contract.
        const empty = isEmptyStrike(v);
        const fill = empty ? T.mut : removed ? T.red : T.green;
        return (
          <rect key={i} x={i * bw} y={height - heights[i]} width={Math.max(0.5, bw - (bw > 3 ? 1 : 0))}
            height={heights[i]} fill={fill} opacity={empty ? 0.85 : removed ? 0.45 : 0.9}
            onClick={tap(empty ? "empty" : removed ? "cut" : "kept")} />
        );
      })}
      {/* where the floor lands. Drawn at a RANK, not at a value: the horizontal
          axis is the ordering of the strikes, not how many contracts each has. */}
      {cut > 0 && cut < sorted.length && (
        <line x1={lineX} x2={lineX} y1={0} y2={height} stroke={T.ink} strokeWidth={1.5} strokeDasharray="3 2" />
      )}
      {ghost && ghost.cut > 0 && ghost.cut < sorted.length && (
        <g onClick={tap("ghost")}>
          <line x1={ghostX} x2={ghostX} y1={0} y2={height} stroke={T.mut} strokeWidth={1} strokeDasharray="2 3" opacity={0.85} />
          <text x={Math.min(width - 2, ghostX + 3)} y={9} textAnchor={ghostX > width * 0.6 ? "end" : "start"}
            style={{ ...mono }} fontSize={7.5} fill={T.mut}>
            {`RECOMMENDED WOULD CUT HERE (${ghost.threshold})`}
          </text>
        </g>
      )}
      <line x1={0} x2={width} y1={height} y2={height} stroke={T.line} strokeWidth={1} />
      {/* the real numbers at the ends, because the height cannot be read as one */}
      <text x={0} y={height + 11} style={{ ...mono }} fontSize={8.5} fill={T.dim}>{sorted[0]}</text>
      <text x={width} y={height + 11} textAnchor="end" style={{ ...mono }} fontSize={8.5} fill={T.dim}>
        {sorted[sorted.length - 1]}
      </text>
    </svg>
  );
}

/** What one part of the strip means, on tap. */
export const explainOiStrip = (el, { threshold, cut, total, ghost } = {}) => ({
  empty: `These contracts have NOTHING open: not one of them exists in anybody's account. They are drawn grey ` +
    `and kept at a sliver of height so they can be seen at all — a bar of zero height is indistinguishable ` +
    `from one that was never drawn, and "nobody is here" is the most important thing this picture can tell you.`,
  ghost: `The liquidity floor is OFF, so nothing on this expiry is being removed. The grey dashed line is where ` +
    `the app's recommendation WOULD cut it${ghost ? `: under ${ghost} open contracts` : ""} — everything to the ` +
    `left of it is what you are choosing to keep in the list.`,
  cut: `These ${cut} contracts are the emptiest on this expiry: each carries fewer than ${threshold} open contracts. ` +
    `A price quoted on one of them is a market maker's placeholder rather than something two people agreed on, ` +
    `and you may not find anyone to sell it back to.`,
  kept: `These contracts clear the floor: at least ${threshold} are already open on each. That number is not ` +
    `fixed — it comes from this expiry's own strikes, so a busy market asks for more of a leg than a quiet one.`,
}[el] || `${total} contracts on this expiry — every call and every put — ordered from the emptiest to the busiest. The dashed line is where the floor cuts.`);

/* ====================================================================
   2) GAUGE/* ====================================================================
   2) GAUGE
   The payoff projected into polar coordinates: the price range becomes a
   semicircle, left = lowest price, right = highest. The arc is coloured by
   the SIGN of the payoff at that price, so a bear spread is green on the
   LEFT — the colours are read off the trade, never off the direction.
==================================================================== */

const polar = (cx, cy, r, th) => [cx + r * Math.cos(th), cy - r * Math.sin(th)];
/** Angle for a price: 180° at the bottom of the range, 0° at the top. */
const angleFor = (s, lo, hi) => Math.PI * (1 - (s - lo) / (hi - lo));
const arcPath = (cx, cy, r, t0, t1) => {
  const [x0, y0] = polar(cx, cy, r, t0);
  const [x1, y1] = polar(cx, cy, r, t1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

/** The arcs a gauge draws, as data — so a test can read the colours. */
export function gaugeArcs(b) {
  return b.bands.map((z) => ({
    sign: z.sign,
    from: angleFor(z.lo, b.lo, b.hi),
    to: angleFor(z.hi, b.lo, b.hi),
    lo: z.lo, hi: z.hi,
  }));
}

/* THE GAUGE'S TWO END LABELS, AND WHERE THEY GO (PR #49, TASK 0e). The owner's phone, 3 Oct 2026: on a card's 104px
   gauge at a 12px label the two ends ran together, "$103.18$191.62". Mono glyphs are ~0.6 of the font size wide (0.62 is used), so
   the widths are known before drawing: if the two labels and a gap do not fit the arc's width, the cents go
   ("$103", "$192"); if they still do not fit, the right one drops one line below the left. Never overlapping. */
export function gaugeEndLabels(lo, hi, { size, lab }) {
  const span = size * 0.42 * 2 + size * 0.13;           // the arc's outer width: 2R + the stroke
  const w = (t) => t.length * lab * 0.62;
  const gap = lab;                                       // at least one character apart
  const fits = (a, b2) => w(a) + w(b2) + gap <= span;
  let left = price(lo), right = price(hi), mode = "full";
  if (!fits(left, right)) {
    const whole = (x) => (Number.isFinite(Number(x)) ? `$${Math.round(Number(x))}` : "n/a");
    left = whole(lo); right = whole(hi); mode = "whole";
    if (!fits(left, right)) mode = "stacked";
  }
  return { left, right, stacked: mode === "stacked", mode, widths: [w(left), w(right)], span, gap };
}

export function Gauge({ bands, size = 260, onExplain, ticker = "this market", labelSize = null }) {
  const b = bands;
  if (!b || !b.bands.length) return null;
  const W = size, R = size * 0.42, cx = W / 2, cy = size * 0.56, thick = size * 0.13;
  // `labelSize` is for a gauge drawn small (a card's 104px one): the ends' labels are 4.5% of the size by default,
  // which is 4.7px there, so the caller names a readable size and the frame grows to hold it (PR #45).
  const lab = labelSize || size * 0.045;
  const ends = gaugeEndLabels(b.lo, b.hi, { size, lab });
  const H = cy + Math.max(size * 0.105, size * 0.085 + lab * 0.4) + (ends.stacked ? lab * 1.2 : 0);
  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  const s0 = b.spot;
  const inRange = s0 != null && s0 >= b.lo && s0 <= b.hi;
  const nTh = inRange ? angleFor(s0, b.lo, b.hi) : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={gaugeTakeaway(b, { ticker })}
      style={{ display: "block", maxWidth: "100%", cursor: onExplain ? "pointer" : "default" }}>
      {gaugeArcs(b).map((a, i) => (
        <path key={i} d={arcPath(cx, cy, R, a.from, a.to)} fill="none" strokeWidth={thick}
          stroke={a.sign > 0 ? T.green : T.red} opacity={a.sign > 0 ? 0.85 : 0.4}
          onClick={tap(a.sign > 0 ? "green" : "red")} />
      ))}
      {b.breakevens.map((s, i) => {
        const th = angleFor(s, b.lo, b.hi);
        const [x1, y1] = polar(cx, cy, R - thick / 2, th);
        const [x2, y2] = polar(cx, cy, R + thick / 2, th);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.panel} strokeWidth={2} onClick={tap("breakeven")} />;
      })}
      {inRange && (
        <g onClick={tap("needle")}>
          <line x1={cx} y1={cy} x2={polar(cx, cy, R + thick * 0.62, nTh)[0]} y2={polar(cx, cy, R + thick * 0.62, nTh)[1]}
            stroke={T.ink} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={size * 0.035} fill={T.ink} />
        </g>
      )}
      {/* The ends of the price range, anchored inwards so they cannot clip. */}
      <text x={cx - R - thick / 2} y={cy + size * 0.085} textAnchor="start" fill={T.dim} fontSize={lab} fontFamily="ui-monospace, Menlo, monospace">{ends.left}</text>
      <text x={cx + R + thick / 2} y={cy + size * 0.085 + (ends.stacked ? lab * 1.2 : 0)} textAnchor="end" fill={T.dim} fontSize={lab} fontFamily="ui-monospace, Menlo, monospace">{ends.right}</text>
    </svg>
  );
}

/** The gauge with its takeaway and tap-to-explain — position detail. */
export function GaugeFigure({ legs, entryNet, spot, ticker, size, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  return (
    <Figure style={style} takeaway={gaugeTakeaway(b, { ticker })}
      explanation={open ? explainElement(open, b, { ticker }) : null} onClose={() => setOpen(null)}>
      <Gauge bands={b} size={size} onExplain={setOpen} ticker={ticker} />
    </Figure>
  );
}

/* ====================================================================
   3) UNIFIED POSITION COMPONENT
   Left to right on ONE shared vertical price axis:
     price history → dispersion cone from today → terminal distribution as a
     rotated histogram → payoff rotated 90°.
   A horizontal dashed line runs from today's spot across to the payoff value.
   Cone and distribution switch on above a width threshold and off below it:
   one component, two levels of detail, never two components that can drift.
==================================================================== */

/**
 * WHERE THE PRICE COULD FINISH, as a set of bars over a price range.
 *
 * Lifted out of `UnifiedPosition` so the compare view can draw the SAME
 * distribution the position detail draws. Two lognormals written twice is two
 * screens that can disagree about the same market, which is the one thing this
 * file exists to prevent.
 *
 * @returns {{ bins: {lo,hi,mid,p}[], peak: number }} probability per bin, and
 *   the tallest bin, so a caller can scale bars without rescanning them.
 */
/* >>> THE DEFAULT DRIFT IS GONE, AND IT WAS THE LAST ONE. <<<
   `bandMass()` had `driftAnnual = 0` removed in PR #25 for the reason written at
   the top of this file: a picture drawn against a market that goes nowhere,
   beside a number drifted on the season, is two screens disagreeing about one
   trade. `terminalDist()` kept its own, and `ComparePayoffs()` below was the
   caller relying on it — it passed no drift at all, so every compare card
   printed a seasonal chance above a risk-free picture. `UnifiedPosition` was
   never at fault: it has always passed `drawDrift`.

   A MISSING DRIFT IS NOT A DRIFT OF ZERO. With none, there is no distribution
   to draw and the caller says so, exactly as it already does for two markets. */
export function terminalDist({ spot, sigma, dte, driftAnnual, lo, hi, bins = 26 }) {
  if (!(Number.isFinite(spot) && spot > 0) || !(sigma > 0) || !(dte > 0) || !(hi > lo)) return { bins: [], peak: 0 };
  if (!Number.isFinite(driftAnnual)) return { bins: [], peak: 0 };
  const Tyr = Math.max(1, dte) / 365, sq = sigma * Math.sqrt(Tyr);
  const mu = Math.log(spot) + (driftAnnual - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sq));
  const out = [];
  let peak = 0;
  for (let i = 0; i < bins; i++) {
    const a = lo + (i / bins) * (hi - lo), z = lo + ((i + 1) / bins) * (hi - lo);
    const p = Math.max(0, cdf(z) - cdf(a));
    peak = Math.max(peak, p);
    out.push({ lo: a, hi: z, mid: (a + z) / 2, p });
  }
  return { bins: out, peak };
}

export const UNIFIED_DETAIL_WIDTH = 560; // below this, history and payoff only

/** The column layout, as data: a test can check the panels turn off. */
export function unifiedLayout(width) {
  const detail = width >= UNIFIED_DETAIL_WIDTH;
  const padL = 4, padR = 52, padB = 22, padT = 10;
  const inner = Math.max(80, width - padL - padR);
  const share = detail
    ? { history: 0.46, cone: 0.24, dist: 0.12, payoff: 0.18 }
    : { history: 0.62, cone: 0, dist: 0, payoff: 0.38 };
  const xHist = padL;
  const xToday = xHist + inner * share.history;
  const xConeEnd = xToday + inner * share.cone;
  const xDistEnd = xConeEnd + inner * share.dist;
  const xPayEnd = xDistEnd + inner * share.payoff;
  return { detail, padL, padR, padT, padB, inner, xHist, xToday, xConeEnd, xDistEnd, xPayEnd };
}

export function UnifiedPosition({
  // The horizon this draws over when the caller does not name one is the
  // horizon the app aims at, and that has a home (it was a bare 45 here).
  legs = [], entryNet = 0, spot, bars = [], dte = RULES.targetEntryDTE, sigma = 0.3, driftAnnual,
  ticker = "this market", height = 380, width: fixedWidth, onExplain,
  // The axis labels' size: 9.5px by default, and a card that draws this small names a readable one (PR #45).
  labelSize = 9.5,
  // The width drawn at until the first measurement lands. 900 is a screen's; a card names its own, so a narrow slot
  // never flashes the wide level of detail for a frame (PR #45).
  fallbackWidth = 900,
}) {
  /* THE DRIFT HAS NO DEFAULT FOR THE SENTENCE AND A ZERO FOR THE DRAWING, and
     the two are deliberately not the same thing. A picture has to be drawn at
     something, so the cone and the histogram fall back to a flat market. A
     PROBABILITY does not have to be printed at all: the takeaway is handed the
     raw value, so a caller that never said what the drift is gets a sentence
     with no percentage in it rather than a confident number worked out against
     an assumption nobody made. That default zero was the fourth of the four
     drifts this app used to call "the chance". */
  const drawDrift = Number.isFinite(driftAnnual) ? driftAnnual : 0;
  const [ref, measured] = useWidth(fallbackWidth);
  const W = fixedWidth || measured;
  const b = payoffBands({ legs, entryNet, spot });
  const L = unifiedLayout(W);
  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);

  const H = height;
  const days = Math.max(1, dte);

  // --- the cone: lognormal quantiles from today out to expiry ---
  const QZ = { p5: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645 };
  const cone = [];
  if (L.detail && Number.isFinite(spot) && sigma > 0) {
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (days / 365);
      const o = { x: L.xToday + (i / 24) * (L.xConeEnd - L.xToday) };
      for (const [k, z] of Object.entries(QZ)) {
        o[k] = spot * Math.exp((drawDrift - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
      }
      cone.push(o);
    }
  }

  // --- the shared vertical price axis: every panel is read off this one ---
  const ys = [
    ...bars.map((x) => x.low), ...bars.map((x) => x.high),
    ...cone.map((c) => c.p5), ...cone.map((c) => c.p95),
    ...legs.map((l) => l.strike), ...b.breakevens,
    ...(Number.isFinite(spot) ? [spot] : []),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const yMin = ys.length ? Math.min(...ys) * 0.98 : b.lo;
  const yMax = ys.length ? Math.max(...ys) * 1.02 : b.hi;
  const Y = (v) => L.padT + (1 - (v - yMin) / (yMax - yMin)) * (H - L.padT - L.padB);
  const XH = (i) => L.xHist + (bars.length > 1 ? (i / (bars.length - 1)) * (L.xToday - L.xHist) : 0);

  // --- the terminal distribution, as a histogram rotated onto the price axis ---
  const distW = L.xDistEnd - L.xConeEnd;
  const dist = distW > 4 ? terminalDist({ spot, sigma, dte: days, driftAnnual: drawDrift, lo: yMin, hi: yMax }) : { bins: [], peak: 0 };
  const distBars = dist.bins.map((d) => ({
    ...d,
    profit: b.at(d.mid) > 0,
    w: dist.peak > 0 ? (d.p / dist.peak) * (distW - 2) : 0,
  }));

  // --- the payoff, rotated 90°: price up the axis, money across ---
  const payW = L.xPayEnd - L.xDistEnd;
  const inRange = b.samples.filter((p) => p.s >= yMin && p.s <= yMax);
  const pMax = Math.max(1, ...inRange.map((p) => Math.abs(p.pnl)));
  const PX = (v) => L.xDistEnd + 2 + ((v + pMax) / (2 * pMax)) * (payW - 4);
  const payLine = inRange.map((p, i) => `${i ? "L" : "M"}${PX(p.pnl).toFixed(1)},${Y(p.s).toFixed(1)}`).join("");
  const zeroX = PX(0);

  const nowPnl = Number.isFinite(spot) ? b.at(spot) : null;

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={unifiedTakeaway(b, { ticker, sigma, dte, driftAnnual })}
        style={{ display: "block", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, maxWidth: "100%", cursor: onExplain ? "pointer" : "default" }}>

        {/* the price axis itself, shared by every panel to its left and right */}
        {Array.from({ length: 6 }, (_, i) => {
          const v = yMin + (i / 5) * (yMax - yMin);
          return (
            <g key={i}>
              <line x1={L.xHist} x2={L.xPayEnd} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
              <text x={L.xPayEnd + 5} y={Y(v) + 3} fill={T.dim} fontSize={labelSize} fontFamily="ui-monospace, Menlo, monospace">{v.toFixed(2)}</text>
            </g>
          );
        })}

        {/* zones: the SAME bands every other visual draws, and they stop where
            the cone stops — past that the payoff panel speaks for itself. */}
        {L.xConeEnd > L.xToday && b.bands.map((z, i) => (
          <rect key={i} x={L.xToday} y={Y(Math.min(z.hi, yMax))}
            width={L.xConeEnd - L.xToday}
            height={Math.max(0, Y(Math.max(z.lo, yMin)) - Y(Math.min(z.hi, yMax)))}
            fill={z.sign > 0 ? T.green : T.red} opacity={z.sign > 0 ? 0.17 : 0.06}
            onClick={tap(z.sign > 0 ? "green" : "red")} />
        ))}

        {/* dispersion cone */}
        {cone.length > 0 && (
          <g onClick={tap("cone")}>
            <polygon fill={T.violet} opacity={0.1}
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p95).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c.p5).toFixed(1)}`).join(" ")} />
            <polygon fill={T.violet} opacity={0.17}
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p75).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c.p25).toFixed(1)}`).join(" ")} />
            <polyline fill="none" stroke={T.violet} strokeWidth={1.3} strokeDasharray="4 3"
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p50).toFixed(1)}`).join(" ")} />
          </g>
        )}

        {/* terminal distribution, rotated onto the price axis */}
        {distBars.map((d, i) => (
          <rect key={i} x={L.xConeEnd + 1} y={Y(d.hi)} width={Math.max(0, d.w)}
            height={Math.max(0.6, Y(d.lo) - Y(d.hi) - 0.6)}
            fill={d.profit ? T.green : T.red} opacity={0.55} onClick={tap("distribution")} />
        ))}

        {/* price history */}
        <g onClick={tap("history")}>
          {bars.map((bar, i) => {
            const x = XH(i), up = bar.close >= bar.open;
            const cw = Math.max(1.2, ((L.xToday - L.xHist) / Math.max(1, bars.length)) * 0.6);
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={Y(bar.high)} y2={Y(bar.low)} stroke={up ? T.green : T.red} strokeWidth={0.8} />
                <rect x={x - cw / 2} y={Y(Math.max(bar.open, bar.close))} width={cw}
                  height={Math.max(1, Math.abs(Y(bar.open) - Y(bar.close)))} fill={up ? T.green : T.red} />
              </g>
            );
          })}
        </g>

        {/* payoff, rotated 90° */}
        <g onClick={tap("payoff")}>
          <line x1={zeroX} x2={zeroX} y1={L.padT} y2={H - L.padB} stroke={T.line} strokeWidth={1} />
          <path d={payLine} fill="none" stroke={T.amber} strokeWidth={2} />
        </g>

        {/* today, and the dashed line from spot across to the payoff value */}
        <line x1={L.xToday} x2={L.xToday} y1={L.padT} y2={H - L.padB} stroke={T.amber} strokeWidth={1} strokeDasharray="3 3" />
        {Number.isFinite(spot) && spot >= yMin && spot <= yMax && (
          <g onClick={tap("spotline")}>
            <line x1={L.xHist} x2={PX(nowPnl)} y1={Y(spot)} y2={Y(spot)}
              stroke={T.ink} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.8} />
            <circle cx={PX(nowPnl)} cy={Y(spot)} r={3.4} fill={nowPnl > 0 ? T.green : T.red} />
          </g>
        )}

        {/* strikes */}
        {legs.map((l, i) => (
          <line key={i} x1={L.xToday} x2={L.xPayEnd} y1={Y(l.strike)} y2={Y(l.strike)}
            stroke={l.side > 0 ? T.green : T.red} strokeWidth={1} opacity={0.55} />
        ))}
      </svg>
    </div>
  );
}

/** The unified component with its takeaway and tap-to-explain — screen 4. */
export function UnifiedFigure({ legs, entryNet, spot, bars, dte, sigma, driftAnnual, ticker, height, width, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  const ctx = { ticker, sigma, dte, driftAnnual };
  return (
    <Figure style={style} takeaway={unifiedTakeaway(b, ctx)}
      explanation={open ? explainElement(open, b, ctx) : null} onClose={() => setOpen(null)}>
      <UnifiedPosition legs={legs} entryNet={entryNet} spot={spot} bars={bars} dte={dte}
        sigma={sigma} driftAnnual={driftAnnual} ticker={ticker} height={height} width={width} onExplain={setOpen} />
    </Figure>
  );
}

/* ====================================================================
   4) COMPARE — up to three candidates, ONE picture (PRD §6)

   Three payoffs overlaid on one shared axis, and one shared distribution with
   every breakeven marked on it. Not three charts side by side, and not a table
   of every number the app knows: the reader has to be able to say which one
   they prefer, and why, from the picture.

   The shared axis is the MOVE from today's price, not the price itself, because
   two roads can be in two different markets — $4.55 of CORN and $13.20 of UNG
   have no common axis, "up 8%" does. The vertical axis is dollars of profit per
   contract, shared, so the taller curve really is the bigger win.

   The distribution is drawn only when the candidates share a market and a
   horizon, because there is no such thing as one distribution over two
   different markets. When they do not, the breakevens are still marked and the
   picture says why the curve is missing rather than drawing an average of two
   things that are not the same thing.
==================================================================== */

/** The three curve colours, in order. Never more: the cap is three. */
export const COMPARE_COLORS = [T.blue, T.amber, T.violet];

/** Do these candidates share one market and one expiry? */
export const sharesOneMarket = (items = []) =>
  items.length > 0
  && items.every((c) => c.ticker === items[0].ticker)
  && items.every((c) => Math.abs((c.dte || 0) - (items[0].dte || 0)) <= 1)
  && Number.isFinite(items[0].spot) && items[0].spot > 0;

/**
 * THE ONE DISTRIBUTION UNDER THE COMPARE CURVES, AND THE TWO NUMBERS IT NEEDS.
 *
 * >>> THE FAULT PR #27's WORK EXPOSED WITHOUT TOUCHING. <<< This read
 * `sigma: shown[0].sigma || 0.3, dte: shown[0].dte || 45` and passed NO DRIFT,
 * so `terminalDist()`'s own `driftAnnual = 0` took over. `shown[0].sigma` was
 * the candidate's REALISED volatility (`sigmaFor(ticker).sigma`) while the
 * `pop` printed on the cards directly above the curve comes from `chanceOf()` —
 * the chain's IMPLIED volatility and the SEASONAL drift. One trade, drawn one
 * way and counted another, which is the rule `bandMass()` had its own default
 * removed for.
 *
 * The candidate now carries the two numbers THE CHANCE WAS WORKED OUT AT
 * (`chanceDrawFields()` in rules.js, spread into `candidateOf()`), and there is
 * NO fallback for either: an unstamped candidate — one saved before this — has
 * no distribution to draw and the picture says so, which is the same answer it
 * already gives for two markets.
 *
 * @returns {{ ok, why }} `why` names what is missing, for the sentence.
 */
export const compareDistInputs = (items = []) => {
  const c = items[0];
  if (!sharesOneMarket(items)) return { ok: false, why: "markets", sigma: null, driftAnnual: null };
  // `Number(null)` IS 0 AND 0 IS FINITE, so an unstamped candidate would arrive
  // here as a candidate drifting at exactly zero — which is the very picture
  // this function exists to stop being drawn. The null goes out first.
  const sigma = c.sigma == null ? NaN : Number(c.sigma);
  const driftAnnual = c.driftAnnual == null ? NaN : Number(c.driftAnnual);
  if (!(sigma > 0)) return { ok: false, why: "sigma", sigma: null, driftAnnual: null };
  if (!Number.isFinite(driftAnnual)) return { ok: false, why: "drift", sigma, driftAnnual: null };
  if (!(Number(c.dte) > 0)) return { ok: false, why: "horizon", sigma, driftAnnual };
  return { ok: true, why: null, sigma, driftAnnual, dte: Number(c.dte) };
};

/* `compareDistNote()` moved to path.js (PR #40, TASK 2) so the word counter,
   which runs in plain node, can score it; re-exported here unchanged. */
import { compareDistNote } from "./path.js";
// PR 76: where Learn's picture puts its points, a finger's bands and its labels (plain JS, tested in learn.test.js).
import { niceTicks, labPointXs, labHitZones, labLane } from "./learnView.js";
export { compareDistNote };

/** One sentence: who pays most, who works most often, and what it costs. */
export function compareTakeaway(items = []) {
  if (!items.length) return "Nothing ticked to compare yet.";
  if (items.length === 1) return `Only ${items[0].name} is ticked — tick a second one and the two payoffs are drawn on the same axis.`;
  const often = items.reduce((a, c) => ((c.pop || 0) > (a.pop || 0) ? c : a), items[0]);
  // A CANDIDATE WITH NO CEILING CANNOT BE "THE ONE THAT PAYS MOST", because
  // there is no number to compare. `(c.maxProfit || 0)` would have scored it
  // ZERO and handed the title to whichever bounded structure happened to be
  // beside it, which is the artefact in reverse. It is named instead.
  const unbounded = items.filter((c) => c.maxProfit == null);
  const priced = items.filter((c) => Number.isFinite(c.maxProfit));
  if (unbounded.length) {
    const names = unbounded.map((c) => c.name).join(" and ");
    return `${names} ${unbounded.length === 1 ? "has" : "have"} ${NO_CEILING} on the profit, so ${unbounded.length === 1 ? "it" : "they"} ` +
      `cannot be ranked against the others on what ${unbounded.length === 1 ? "it pays" : "they pay"} — ` +
      `${often.name} works most often at ${inTenPhrase(often.pop)}, for ${amount$(often.risk)} at risk.`;
  }
  const payer = priced.reduce((a, c) => ((c.maxProfit || 0) > (a.maxProfit || 0) ? c : a), priced[0] || items[0]);
  if (payer === often) {
    return `${payer.name} both pays the most, up to ${amount$(payer.maxProfit)}, and works most often at ${inTenPhrase(payer.pop)}, for ${amount$(payer.risk)} at risk.`;
  }
  return `${payer.name} pays the most — up to ${amount$(payer.maxProfit)}, ${inTenPhrase(payer.pop)} — while ${often.name} works most often at ${inTenPhrase(often.pop)} for up to ${amount$(often.maxProfit)}.`;
}

/** The explanation of one element of the compare picture, on tap. */
export function explainCompareElement(el, items = []) {
  const one = items[0];
  switch (el) {
    case "curve":
      return "Each line is one candidate's profit or loss at expiry, in dollars for a single contract, read against the same move across the bottom. Where a line is above the middle rule it makes money; the height is how much.";
    case "zero":
      return "The middle rule is breaking even. A line crossing it is that candidate's breakeven, marked underneath in the same colour.";
    case "breakeven":
      return "A marker is where that candidate stops losing and starts making money. Two markers means the trade needs the price to finish between them.";
    case "distribution":
      return `The grey bars are where the price could finish by expiry, under the market's own volatility${one?.ticker ? ` for ${one.ticker}` : ""}. Read them under the lines: a candidate whose green stretch sits under the tall bars is one the market is more likely to reach.`;
    case "today":
      return "The dashed line is today: no move at all. Everything to the left is the market falling, everything to the right is it rising.";
    default:
      return "";
  }
}

/**
 * The compare picture itself.
 *
 * @param {object[]} items up to three normalised candidates (src/path.js)
 */
export function ComparePayoffs({ items = [], height = 300, width: fixedWidth, onExplain }) {
  const [ref, measured] = useWidth(760);
  const shown = items.slice(0, COMPARE_COLORS.length);
  // The svg has a floor below which the curves are unreadable, and it scrolls
  // inside its OWN box when the column is narrower than that — the page never
  // moves sideways (CLAUDE.md).
  const W = Math.max(300, fixedWidth || measured);
  const H = height;
  const padL = 46, padR = 12, padT = 12, padB = 58;
  const distH = 34;

  // Everything renders through this wrapper, in every state, so the
  // ResizeObserver always has a node to observe on mount.
  const frame = (children) => (
    <div ref={ref}>
      <div style={{ overflowX: "auto", maxWidth: "100%" }}>{children}</div>
    </div>
  );
  if (!shown.length) return frame(null);

  const bandsOf = (c) => payoffBands({
    legs: c.legs, entryNet: c.entryNet, spot: c.spot,
    lo: c.spot * 0.62, hi: c.spot * 1.38,
  });
  const drawn = shown.map((c, i) => ({ c, color: COMPARE_COLORS[i], b: bandsOf(c) }));

  // The shared axis: the move from today, wide enough to hold every breakeven
  // on the picture plus a margin, and never narrower than ±12%.
  const moves = drawn.flatMap(({ c, b }) => b.breakevens.map((s) => s / c.spot - 1));
  const reach = Math.min(0.38, Math.max(0.12, ...moves.map((m) => Math.abs(m) * 1.6)));
  const X = (m) => padL + ((m + reach) / (2 * reach)) * (W - padL - padR);

  const pnls = drawn.flatMap(({ c, b }) => b.samples
    .filter((p) => Math.abs(p.s / c.spot - 1) <= reach)
    .map((p) => p.pnl));
  const pHi = Math.max(1, ...pnls), pLo = Math.min(-1, ...pnls);
  const Y = (v) => padT + (1 - (v - pLo) / (pHi - pLo)) * (H - padT - padB);

  // ONE READING OF ONE TRADE: the volatility and the drift the chance on the
  // card above was computed at, or no distribution at all. No `|| 0.3`, no
  // `|| 45`, no default drift — see `compareDistInputs()`.
  const inputs = compareDistInputs(shown);
  const yDist = H - padB + 16;
  const dist = inputs.ok
    ? terminalDist({
      spot: shown[0].spot, sigma: inputs.sigma, dte: inputs.dte, driftAnnual: inputs.driftAnnual,
      lo: shown[0].spot * (1 - reach), hi: shown[0].spot * (1 + reach), bins: 30,
    })
    : { bins: [], peak: 0 };

  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  const pct = (m) => `${m > 0 ? "+" : ""}${Math.round(m * 100)}%`;

  return frame(
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={compareTakeaway(shown)}
      style={{ display: "block", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, cursor: onExplain ? "pointer" : "default" }}>
      {/* dollars up the left-hand side, shared by every curve */}
      {Array.from({ length: 5 }, (_, i) => {
        const v = pLo + (i / 4) * (pHi - pLo);
        return (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
            <text x={padL - 5} y={Y(v) + 3} textAnchor="end" fill={T.dim} fontSize={9.5} fontFamily="ui-monospace, Menlo, monospace">
              {v >= 0 ? `$${Math.round(v)}` : `-$${Math.abs(Math.round(v))}`}
            </text>
          </g>
        );
      })}

      {/* breaking even, and today */}
      <line x1={padL} x2={W - padR} y1={Y(0)} y2={Y(0)} stroke={T.mut} strokeWidth={1.2} onClick={tap("zero")} />
      <line x1={X(0)} x2={X(0)} y1={padT} y2={H - padB} stroke={T.amber} strokeWidth={1} strokeDasharray="3 3" onClick={tap("today")} />

      {/* the move across the bottom */}
      {[-reach, -reach / 2, 0, reach / 2, reach].map((m, i) => (
        <text key={i} x={X(m)} y={H - padB + 12} textAnchor="middle" fill={T.dim} fontSize={9.5} fontFamily="ui-monospace, Menlo, monospace">{pct(m)}</text>
      ))}

      {/* where the price could finish — one distribution, under every curve */}
      {dist.bins.map((d, i) => {
        const x0 = X(d.lo / shown[0].spot - 1), x1 = X(d.hi / shown[0].spot - 1);
        const h = dist.peak > 0 ? (d.p / dist.peak) * distH : 0;
        return (
          <rect key={i} x={x0} y={yDist + (distH - h)} width={Math.max(0.6, x1 - x0 - 0.8)} height={Math.max(0.4, h)}
            fill={T.mut} opacity={0.35} onClick={tap("distribution")} />
        );
      })}

      {/* the payoffs, overlaid */}
      {drawn.map(({ c, b, color }, i) => {
        const pts = b.samples.filter((p) => Math.abs(p.s / c.spot - 1) <= reach);
        const d = pts.map((p, j) => `${j ? "L" : "M"}${X(p.s / c.spot - 1).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join("");
        return (
          <g key={c.key || i} onClick={tap("curve")}>
            <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" opacity={0.95} />
            {b.breakevens.map((s, k) => (
              <g key={k} onClick={tap("breakeven")}>
                <line x1={X(s / c.spot - 1)} x2={X(s / c.spot - 1)} y1={Y(0) - 5} y2={yDist + distH}
                  stroke={color} strokeWidth={1} strokeDasharray="2 3" opacity={0.75} />
                <circle cx={X(s / c.spot - 1)} cy={yDist + distH} r={3.2} fill={color} />
              </g>
            ))}
          </g>
        );
      })}

      {/* which line is which */}
      {drawn.map(({ c, color }, i) => (
        <g key={`k${c.key || i}`}>
          <rect x={padL + i * Math.min(190, (W - padL - padR) / drawn.length)} y={H - 14} width={9} height={9} fill={color} rx={2} />
          <text x={padL + i * Math.min(190, (W - padL - padR) / drawn.length) + 13} y={H - 6}
            fill={T.body} fontSize={10.5} fontFamily="ui-sans-serif, system-ui">
            {c.ticker} {c.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** The compare picture with its takeaway and tap-to-explain. */
export function CompareFigure({ items = [], height, width, style }) {
  const [open, setOpen] = useState(null);
  const shown = items.slice(0, COMPARE_COLORS.length);
  return (
    <Figure style={style} takeaway={compareTakeaway(shown)}
      explanation={open ? explainCompareElement(open, shown) : null} onClose={() => setOpen(null)}>
      <ComparePayoffs items={shown} height={height} width={width} onExplain={setOpen} />
      {shown.length > 1 && !compareDistInputs(shown).ok && (
        <div style={{ ...sans, fontSize: FS.xs, color: T.mut, lineHeight: LH.body, marginTop: 6 }}>
          {compareDistNote(compareDistInputs(shown).why)}
        </div>
      )}
    </Figure>
  );
}

/* ====================================================================
   The exit plan, as a sentence. It is decided at construction time and then
   frozen (PRD §4), so screen 4 states it rather than offering it — and the
   numbers come from src/rules.js like every other rule number.
==================================================================== */
// PR 72: the trade's own plan (`exitPlanOf()`); without one, the RULES defaults.
const planDays = (plan) => (plan && Number.isFinite(Number(plan.exitDTE)) ? Number(plan.exitDTE) : RULES.exitDTE);
const planStop = (plan) => (plan && Number.isFinite(Number(plan.stopLossPct)) ? Number(plan.stopLossPct) : RULES.stopLossPct);
const planTp = (target, plan) => (target && Number.isFinite(Number(target.pct)) ? Number(target.pct)
  : plan && Number.isFinite(Number(plan.takeProfitPct)) ? Number(plan.takeProfitPct) : RULES.takeProfitPct);
export const exitPlanSentence = (target = null, plan = null) =>
  `Close at ${target && target.basis === "premium" ? takeProfitBasisWords("premium", planTp(target, plan)) : `${pctText(planTp(target, plan))} of max gain`}, or at ${planDays(plan)} days to expiration.`;

/** @param target a `takeProfitTarget()` result for ONE combination (rules.js) — the one place the target is worked out. */
export const exitPlanDetail = (target, contracts = 1, plan = null) => {
  // EVERY MONEY FIGURE SAYS ITS UNIT (PR #40, TASK 0): the confirm step said
  // "$66 of profit" for one contract beside "$924 of $1,848" for fourteen.
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const tail = `A loss of ${pctText(planStop(plan))} of the maximum raises a warning, never an ` +
    `automatic close. These are chosen now and not renegotiated while the position is open.`;
  // NO CEILING AND NOT A SINGLE OPTION MEANS NO TARGET. Half of an unknown is
  // not $0, and printing "that is $0 of profit" under a structure with no
  // maximum would turn the take-profit rule into an instruction to close at
  // break-even. The rule stands, its number does not exist, and the DTE half
  // of it still does.
  if (!target || !Number.isFinite(target.perCombo)) {
    return `There is ${NO_CEILING} on this one, so ${pctText(planTp(target, plan))} of the maximum is not a ` +
      `dollar figure the app can put here — the ${planDays(plan)}-day mark is the exit that still applies, and ` +
      `a profit target on this trade is yours to set. ${tail}`;
  }
  if (target.basis === "premium") {
    return `That is ${money(target.perCombo * n)} of profit ${n > 1 ? `for ${n}` : "per contract"}, ${pctText(target.pct)} of the ${money(target.base * n)} you pay, ` +
      `or the ${planDays(plan)}-day mark, whichever comes first. ${tail}`;
  }
  return `That is ${money(target.perCombo * n)} of profit ${n > 1 ? `for ${n}` : "per contract"}, or the ${planDays(plan)}-day mark, ` +
    `whichever comes first. ${tail}`;
};

/* --------------------------------------------------------------------
   THE POSITION'S CHART (redesign PR 3, the owner's board "PositionDetail"): the last 60 sessions of the market's own
   closes over the payoff at expiry — the profit range shaded green, the loss range violet (red is for errors), the
   breakevens dashed in ink with their price, the strikes dotted, the entry (a ring, on the session the position opened)
   and now (a dot). Cut from `payoffBands()` like every other trade picture; it computes no figure of its own.
-------------------------------------------------------------------- */
export function PositionChart({ bands, bars = [], spot = null, entrySpot = null, openedAt = null, strikes = [], width = 326, height = 230, title }) {
  if (!bands || !Array.isArray(bands.bands) || !bands.bands.length) return null;
  const hist = (Array.isArray(bars) ? bars : []).map((b) => ({ t: b && (b.time || b.t) ? String(b.time || b.t).slice(0, 10) : null,
    c: Number(b?.close ?? b?.c ?? b?.value) })).filter((x) => Number.isFinite(x.c) && x.c > 0).slice(-60);
  const fin = (v) => v != null && Number.isFinite(Number(v));
  const now = fin(spot) ? Number(spot) : hist.length ? hist[hist.length - 1].c : null;
  const day = openedAt ? String(openedAt).slice(0, 10) : null;
  let ei = -1;
  if (day) hist.forEach((h, i) => { if (h.t && h.t <= day) ei = i; });
  const entry = ei >= 0 ? hist[ei].c : fin(entrySpot) ? Number(entrySpot) : null;
  const levels = [...hist.map((h) => h.c), ...bands.breakevens, ...strikes, now, entry].filter(fin).map(Number);
  if (!levels.length) return null;
  const lo0 = Math.min(...levels), hi0 = Math.max(...levels), padV = Math.max((hi0 - lo0) * 0.12, hi0 * 0.01);
  const lo = lo0 - padV, hi = hi0 + padV;
  const W = width - 36, top = 10, bot = height - 10;
  const y = (v) => top + ((hi - v) / (hi - lo)) * (bot - top);
  const n = hist.length;
  const x = (i) => (n > 1 ? (i * W) / (n - 1) : W);
  const f1 = (v) => v.toFixed(1);
  const step = (() => { const raw = (hi - lo) / 4; const m = 10 ** Math.floor(Math.log10(raw)); return [1, 2, 2.5, 5, 10].map((k) => k * m).find((k) => k >= raw) || raw; })();
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const dec = step < 1 ? (step < 0.1 ? 2 : 1) : 0;
  const lbl = { fontFamily: mono.fontFamily, fontSize: 12, fill: T.ink };
  const ny = now != null ? y(now) : null, eyv = entry != null ? y(entry) : null;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} data-position-chart
      style={{ display: "block", maxWidth: "100%", height: "auto" }}>
      {bands.bands.map((b, i) => {
        const a = Math.max(lo, b.lo), z = Math.min(hi, b.hi);
        if (z <= a) return null;
        return <rect key={i} x={0} y={f1(y(z))} width={W} height={f1(y(a) - y(z))} fill={b.sign > 0 ? T.green : T.violet} fillOpacity={b.sign > 0 ? 0.14 : 0.08} />;
      })}
      {strikes.filter((k) => k > lo && k < hi).map((k) => (
        <line key={`k${k}`} x1={0} x2={W} y1={f1(y(k))} y2={f1(y(k))} stroke={T.field} strokeWidth={1} strokeDasharray="2 4" />
      ))}
      {bands.breakevens.filter((v) => v > lo && v < hi).map((v) => (
        <g key={`be${v}`}>
          <line x1={0} x2={W} y1={f1(y(v))} y2={f1(y(v))} stroke={T.ink} strokeWidth={1} strokeDasharray="4 3" strokeOpacity={0.75} />
          <text x={4} y={f1(y(v) - 6)} style={{ ...lbl, fontWeight: 700 }}>{`BE ${v.toFixed(2)}`}</text>
        </g>
      ))}
      {n > 1 && <polyline fill="none" stroke={T.ink} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"
        points={hist.map((h, i) => `${f1(x(i))},${f1(y(h.c))}`).join(" ")} />}
      {eyv != null && ei >= 0 && (
        <g>
          <circle cx={f1(x(ei))} cy={f1(eyv)} r={5} fill={T.panel} stroke={T.ink} strokeWidth={2} />
          {/* Beside now, the two labels would sit on each other: the entry's goes on the other side of its ring. */}
          <text x={f1(x(ei))} y={f1(ny != null && Math.abs(eyv - ny) < 30 && ny < eyv ? eyv + 20 : eyv - 10)}
            textAnchor={x(ei) > W * 0.5 ? "end" : "start"} style={lbl}>{`entry ${entry.toFixed(2)}`}</text>
        </g>
      )}
      {ny != null && (
        <g>
          <circle cx={W} cy={f1(ny)} r={5} fill={T.ink} stroke={T.panel} strokeWidth={2} />
          <text x={W - 6} y={f1(ny + (ny > (top + bot) / 2 ? -12 : 20))} textAnchor="end" style={lbl}>{`now ${now.toFixed(2)}`}</text>
        </g>
      )}
      {ticks.map((v) => (
        <text key={`t${v}`} x={W + 6} y={f1(y(v) + 4)} style={{ ...lbl, fill: T.mut }}>{v.toFixed(dec)}</text>
      ))}
    </svg>
  );
}

/* ====================================================================
   THE FIGURE LAB'S PICTURE (PR 74, owner 20 Oct 2026: "as on IBKR Campus — blue points to drag"; PR 76, the same day:
   "the graph is too simple", "dragging works with a finger but not well").

   The classic payoff diagram: the price runs left to right, the profit or loss up and down, the zero line across. Cut
   from `payoffBands()` like every picture in this file: the curve is its samples, the green and red are its sign, the
   breakevens its own. Since PR 76 it reads like IBKR's Option Wizard: a dollar scale with its grid and the prices along
   the bottom; the card's max profit and max loss written where the curve is flat (or "no ceiling" / "unlimited" at the
   edge); the breakevens labelled clear of the curve and of each other; two more curves, TODAY (dashed) and on the EXIT
   DATE (dotted), from `labCurves()`; the market's distribution as a thin band under the axis (`labDensity()`); and a
   crosshair where a finger or a mouse rests, saying what the legs make there (`labReadout()`). Everything it writes is
   handed in from learnView.js: it works out nothing.

   One BLUE POINT per leg sits on the curve at the leg's strike. A finger holds it anywhere along its dotted guide (a band
   at least 44px wide, `labHitZones()`, whose `touch-action: none` keeps the page still while it is held; the rest of the
   picture still scrolls the page up and down), a label rides 48px above the finger with the strike it snaps to and the
   leg's model price, and each snap is felt (a 5ms vibration where the phone has one). Two legs on one strike sit side by
   side (`labPointXs()`), each its own band. The leg moves by how far the finger moved SIDEWAYS (`labDragTo()`): a thumb's
   wobble up and down does nothing. − / + and the arrow keys stay. The snapping is the caller's (listed strikes only).
   `compact` draws the gallery's small card picture: no words, no points, as in PR 74.
==================================================================== */
/** A snap felt under the finger: five milliseconds where the phone has a vibrator, nothing anywhere else. */
export const snapBuzz = () => {
  try { if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(5); } catch { /* none */ }
};
export function FigureChart(props) {
  return props.compact ? <FigureThumb {...props} /> : <FigureLab {...props} />;
}

/** The gallery's small picture: the curve and its two colours, today's price, nothing to read or hold (PR 74). */
function FigureThumb({ bands, spot = null, width = 84, height = 44 }) {
  const W = Math.max(60, width), H = Math.max(36, height);
  const padL = 2, padR = 2, padT = 3, padB = 3;
  const b = bands;
  const lo = b ? b.lo : (spot ? spot * 0.75 : 0), hi = b ? b.hi : (spot ? spot * 1.25 : 1);
  const pnls = b ? b.samples.map((p) => p.pnl) : [0];
  const top = Math.max(0, ...pnls), bot = Math.min(0, ...pnls);
  const span = (top - bot) || 1;
  const yTop = top + span * 0.08, yBot = bot - span * 0.08;
  const X = (s) => padL + ((s - lo) / ((hi - lo) || 1)) * (W - padL - padR);
  const Y = (v) => padT + ((yTop - v) / ((yTop - yBot) || 1)) * (H - padT - padB);
  const y0 = Y(0);
  const line = b ? b.samples.map((p, i) => `${i ? "L" : "M"}${X(p.s).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(" ") : null;
  const area = b ? `${line} L${X(b.samples[b.samples.length - 1].s).toFixed(1)},${y0.toFixed(1)} L${X(b.samples[0].s).toFixed(1)},${y0.toFixed(1)} Z` : null;
  const id = `fig${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" data-figure-chart="thumb" aria-label="the figure's payoff at expiry"
      style={{ display: "block", maxWidth: "100%", background: T.bg, borderRadius: 4, touchAction: "auto" }}>
      <defs>
        <clipPath id={`${id}u`}><rect x={0} y={0} width={W} height={Math.max(0, y0)} /></clipPath>
        <clipPath id={`${id}d`}><rect x={0} y={y0} width={W} height={Math.max(0, H - y0)} /></clipPath>
      </defs>
      <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke={T.field} strokeWidth={1} />
      {area && <path d={area} fill={T.green} opacity={0.28} clipPath={`url(#${id}u)`} />}
      {area && <path d={area} fill={T.red} opacity={0.16} clipPath={`url(#${id}d)`} />}
      {spot != null && Number.isFinite(spot) && spot >= lo && spot <= hi && (
        <line x1={X(spot)} x2={X(spot)} y1={padT} y2={H - padB} stroke={T.ink} strokeWidth={1} opacity={0.45} strokeDasharray="3 3" />
      )}
      {line && <path d={line} fill="none" stroke={T.ink} strokeWidth={1.4} strokeLinejoin="round" />}
    </svg>
  );
}

/** The three curves' strokes, one home: the picture and its legend read these. */
const FIGURE_CURVES = {
  expiry: { stroke: "ink", strokeWidth: 2 },
  today: { stroke: "mut", strokeWidth: 1.6, strokeDasharray: "6 4" },
  exit: { stroke: "mut", strokeWidth: 2, strokeDasharray: "0.5 4", strokeLinecap: "round" },
};
const curveStroke = (id) => { const c = FIGURE_CURVES[id]; return { ...c, stroke: T[c.stroke] }; };
/** A legend's sample of one curve, drawn as the picture draws it. */
export const FigureLegendLine = ({ id }) => (
  <svg width={22} height={8} aria-hidden="true" style={{ flexShrink: 0 }}><line x1={1} x2={21} y1={4} y2={4} {...curveStroke(id)} /></svg>
);
/** About how wide a run of 11px mono text is (0.6em a character): enough to keep labels apart. */
const textW = (t) => String(t || "").length * 6.6;
/** "$0", "+$200", "-$1,000": the dollar scale's words. */
const axisMoney = (v) => (Math.abs(v) < 1e-9 ? "$0" : `${v > 0 ? "+" : "-"}$${Math.round(Math.abs(v)).toLocaleString("en-US")}`);
const axisPrice = (v) => (Number.isInteger(v) ? String(v) : String(+Number(v).toFixed(2)));
const pathOf = (pts, X, Y) => pts.map((p, i) => `${i ? "L" : "M"}${X(p.s).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(" ");
/** A curve's value at a price, on its own samples (straight between them). */
const curveAt = (pts, s) => {
  if (!pts || !pts.length) return null;
  if (s <= pts[0].s) return pts[0].pnl;
  for (let i = 1; i < pts.length; i++) if (s <= pts[i].s) { const a = pts[i - 1], c = pts[i]; return a.pnl + ((s - a.s) / ((c.s - a.s) || 1)) * (c.pnl - a.pnl); }
  return pts[pts.length - 1].pnl;
};

function FigureLab({ bands, legs = [], spot = null, width = 340, height = 260, onMove, onStep, handleLabel = (i) => `Leg ${i + 1}`,
  curves = null, extremes = [], density = [], readout = null, snapLabel = null, vibrate = snapBuzz,
  drawMode = false, stroke = null, onStroke = null }) {
  const svgRef = useRef(null);
  const dragRef = useRef(null);                 // { i, startStrike, startPrice } while a point is held
  // PR 77: DRAWING. While "Draw" is on, a finger (or a mouse) traces a profile; the stroke is kept in the picture's own
  // units (price, P&L) and handed over when the finger lifts (`onStroke`). The page never scrolls under a drawing finger.
  const drawRef = useRef(null);                 // the stroke being drawn: [{ s, v }]
  const [live, setLive] = useState(null);
  const drawOn = useRef(drawMode);
  drawOn.current = drawMode;
  const [drag, setDrag] = useState(null);       // the same, plus where the finger is, for the label above it
  const [cross, setCross] = useState(null);     // a price, while a finger or a mouse rests on the picture
  const lastStrike = useRef(null);
  const W = Math.max(200, width), H = Math.max(160, height);
  const padL = 50, padR = 12, padT = 24, padB = 46;
  const plotB = H - padB;
  const b = bands;
  const lo = b ? b.lo : (spot ? spot * 0.75 : 0), hi = b ? b.hi : (spot ? spot * 1.25 : 1);
  const today = curves && curves.today, exit = curves && curves.exit;
  const all = [...(b ? b.samples.map((p) => p.pnl) : [0]), ...(today || []).map((p) => p.pnl), ...(exit || []).map((p) => p.pnl)];
  const top = Math.max(0, ...all), bot = Math.min(0, ...all);
  const span = (top - bot) || 1;
  const yTop = top + span * 0.14, yBot = bot - span * 0.14;
  const X = (s) => padL + ((s - lo) / ((hi - lo) || 1)) * (W - padL - padR);
  const Y = (v) => padT + ((yTop - v) / ((yTop - yBot) || 1)) * (plotB - padT);
  const y0 = Y(0);
  const local = (e) => {
    const r = svgRef.current?.getBoundingClientRect?.();
    if (!r || !r.width) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };
  const priceOfX = (x) => lo + ((x - padL) / ((W - padL - padR) || 1)) * (hi - lo);
  const valueOfY = (y) => yTop - ((y - padT) / ((plotB - padT) || 1)) * (yTop - yBot);
  /* THE STROKE (PR 77): down starts it, every move adds a point inside the plot, up hands it over. */
  const drawStart = (e) => {
    const p = local(e);
    if (!p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawRef.current = [{ s: priceOfX(Math.min(W - padR, Math.max(padL, p.x))), v: valueOfY(Math.min(plotB, Math.max(padT, p.y))) }];
    setLive(drawRef.current.slice());
  };
  const drawMove = (e) => {
    if (!drawRef.current) return;
    const p = local(e);
    if (!p) return;
    drawRef.current.push({ s: priceOfX(Math.min(W - padR, Math.max(padL, p.x))), v: valueOfY(Math.min(plotB, Math.max(padT, p.y))) });
    setLive(drawRef.current.slice());
  };
  const drawEnd = (e) => {
    const pts = drawRef.current;
    drawRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setLive(null);
    if (pts && pts.length > 1 && onStroke) onStroke({ points: pts, lo, hi });
  };
  const shownStroke = live || (stroke && stroke.points) || null;
  const line = b ? pathOf(b.samples, X, Y) : null;
  const area = b ? `${line} L${X(b.samples[b.samples.length - 1].s).toFixed(1)},${y0.toFixed(1)} L${X(b.samples[0].s).toFixed(1)},${y0.toFixed(1)} Z` : null;
  const id = `fig${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  // A halo in the ground's colour keeps a label readable where a curve runs through it.
  const txt = { fontFamily: "ui-monospace, Menlo, monospace", fontSize: 11, fill: T.mut, stroke: T.bg, strokeWidth: 3, paintOrder: "stroke" };

  /* A FINGER ON A POINT HOLDS THE PAGE STILL. Chromium and Safari ignore `touch-action` on the shapes INSIDE an <svg>
     (measured in Chromium, PR 76: a finger on a point with `touch-action: none` still scrolled the page and the drag was
     cancelled), so the picture cancels the scroll itself: a touch that starts on a point, or moves while one is held, is
     `preventDefault()`ed — which needs listeners that are not passive (React's are). Anywhere else the page scrolls. */
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof el.addEventListener !== "function") return undefined;
    const onStart = (e) => { if (drawOn.current || (e.target && typeof e.target.closest === "function" && e.target.closest("[data-lab-point]"))) e.preventDefault(); };
    const onMove = (e) => { if (dragRef.current || drawRef.current) e.preventDefault(); };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => { el.removeEventListener("touchstart", onStart); el.removeEventListener("touchmove", onMove); };
  }, []);

  // EACH SNAP IS FELT: the held leg's strike changed since the last render.
  const heldStrike = drag && legs[drag.i] ? Number(legs[drag.i].strike) : null;
  useEffect(() => {
    if (heldStrike == null) { lastStrike.current = null; return; }
    if (lastStrike.current != null && heldStrike !== lastStrike.current) vibrate();
    lastStrike.current = heldStrike;
  }, [heldStrike, vibrate]);

  // THE POINTS: at their strikes, spread apart when closer than 22px; each its own band for a finger.
  const inRange = legs.map((l) => Number.isFinite(Number(l.strike)) && Number(l.strike) >= lo && Number(l.strike) <= hi);
  const pxs = labPointXs(legs.map((l) => X(Number(l.strike))));
  const zones = labHitZones(pxs, { left: padL, right: W - padR });
  // THE STRIKE LABELS under the band, in one lane, never on top of each other.
  const kText = legs.map((l) => `${+Number(l.strike).toFixed(3)}${l.type === "call" ? "C" : "P"}`);
  const kLane = labLane(legs.map((l, i) => ({ x: pxs[i] - textW(kText[i]) / 2, w: textW(kText[i]) })), { left: padL, right: W - padR });

  // THE WORDS ON THE CURVE: today's price on the top lane (the crosshair's sentence takes its place while it shows), the
  // card's extremes, then each breakeven on the side of the zero line the curve leaves empty.
  const boxes = [];
  const overlaps = (r) => boxes.some((q) => r.x0 < q.x1 + 2 && r.x1 > q.x0 - 2 && r.y0 < q.y1 + 1 && r.y1 > q.y0 - 1);
  const clampX = (x, w) => Math.min(W - padR - w, Math.max(padL + 2, x));
  const todayText = spot != null && Number.isFinite(spot) && spot >= lo && spot <= hi ? `today ${Number(spot).toFixed(2)}` : null;
  const todayX = todayText ? clampX(X(spot) - textW(todayText) / 2, textW(todayText)) : 0;
  if (todayText) boxes.push({ x0: todayX, x1: todayX + textW(todayText), y0: 4, y1: 16 });
  // The points are obstacles too: no word sits on a blue point.
  if (b) legs.forEach((l, i) => { if (inRange[i]) { const cy = Y(b.at(Number(l.strike))); boxes.push({ x0: pxs[i] - 9, x1: pxs[i] + 9, y0: cy - 9, y1: cy + 9 }); } });
  const extremeLabels = (extremes || []).map((e) => {
    const w = textW(e.text);
    const x = e.edge === "right" ? W - padR - 2 - w : e.edge === "left" ? padL + 4 : clampX(X(e.s) - w / 2, w);
    // Above the best case, below the worst, a step farther out when a point or a label is in the way.
    const tries = e.id === "profit" ? [Y(e.pnl) - 7, Y(e.pnl) - 14] : [Y(e.pnl) + 16, Y(e.pnl) + 23];
    const ys = tries.map((y) => (e.id === "profit" ? Math.max(padT + 10, y) : Math.min(plotB - 3, y)));
    const yb = ys.find((y) => !overlaps({ x0: x, x1: x + w, y0: y - 10, y1: y + 2 })) ?? ys[ys.length - 1];
    boxes.push({ x0: x, x1: x + w, y0: yb - 10, y1: yb + 2 });
    return { ...e, x, y: yb };
  });
  const beLabels = b ? b.breakevens.map((s) => {
    const t = Number(s).toFixed(2), w = textW(t);
    const rising = b.at(s + (hi - lo) * 0.004) > b.at(s - (hi - lo) * 0.004);
    // Rising through zero, the curve fills the lower left and the upper right: the label goes upper left, else lower right.
    const spots = rising ? [[X(s) - 6 - w, y0 - 6], [X(s) + 6, y0 + 15]] : [[X(s) + 6, y0 - 6], [X(s) - 6 - w, y0 + 15]];
    const pick = spots.map(([x, y]) => ({ x: clampX(x, w), y })).find((p) => !overlaps({ x0: p.x, x1: p.x + w, y0: p.y - 10, y1: p.y + 2 }))
      || { x: clampX(spots[0][0], w), y: spots[0][1] };
    boxes.push({ x0: pick.x, x1: pick.x + w, y0: pick.y - 10, y1: pick.y + 2 });
    return { s, t, ...pick };
  }) : [];

  // No leg, no money to scale: the dollar figures wait for a curve (a scale of "$0" either side says nothing).
  const yTicks = b ? niceTicks(yBot, yTop, 4).filter((v) => Y(v) >= padT - 1 && Y(v) <= plotB + 1 && (v === 0 || Math.round(Math.abs(v)) > 0)) : [];
  const xTicks = niceTicks(lo, hi, 4).filter((v) => v >= lo && v <= hi);
  const crossText = cross != null && readout ? readout(cross) : null;
  const crossX = crossText ? clampX(X(cross) - textW(crossText) / 2, textW(crossText)) : 0;
  const crossToday = cross != null ? curveAt(today, cross) : null;

  /* THE POINTER ON THE PICTURE (not on a point): a crosshair while a finger or a mouse rests there; gone on release. A
     finger's up-and-down still scrolls the page (`touch-action: pan-y`), which ends the crosshair. */
  const rest = (e) => {
    if (dragRef.current) return;
    const p = local(e);
    if (!p || p.x < padL || p.x > W - padR || p.y > plotB) { setCross(null); return; }
    setCross(priceOfX(p.x));
  };
  const leave = () => setCross(null);
  const hold = (i, e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const p = local(e);
    if (!p) return;
    const d = { i, startStrike: Number(legs[i].strike), startPrice: priceOfX(p.x) };
    dragRef.current = d; lastStrike.current = d.startStrike;
    setCross(null); setDrag({ ...d, x: p.x, y: p.y });
  };
  const slide = (i, e) => {
    const d = dragRef.current;
    if (!d || d.i !== i) return;
    e.stopPropagation();
    const p = local(e);
    if (!p) return;
    setDrag({ ...d, x: p.x, y: p.y });
    if (onMove) onMove(i, { startStrike: d.startStrike, startPrice: d.startPrice, price: priceOfX(p.x) });
  };
  const release = (e) => { e.currentTarget.releasePointerCapture?.(e.pointerId); dragRef.current = null; setDrag(null); };

  const held = drag && legs[drag.i] && snapLabel ? snapLabel(drag.i) : null;
  const heldW = held ? textW(held) + 16 : 0;
  const heldX = held ? Math.min(W - padR - heldW, Math.max(padL, drag.x - heldW / 2)) : 0;
  const heldY = held ? Math.min(plotB - 24, Math.max(2, drag.y - 48 - 12)) : 0;

  return (
    <svg ref={svgRef} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="group" data-figure-chart="lab"
      aria-label="the payoff at expiry, today and on the exit date; each blue point is a leg's strike"
      data-draw-mode={drawMode ? "draw" : "points"}
      onPointerDown={drawMode ? drawStart : rest} onPointerMove={drawMode ? drawMove : (e) => { if (e.pointerType === "mouse" || cross != null) rest(e); }}
      onPointerUp={drawMode ? drawEnd : (e) => { if (e.pointerType !== "mouse") leave(); }} onPointerCancel={drawMode ? drawEnd : leave}
      onPointerLeave={drawMode ? undefined : leave}
      style={{ display: "block", maxWidth: "100%", background: T.bg, borderRadius: 8, touchAction: drawMode ? "none" : "pan-y",
        cursor: drawMode ? "crosshair" : undefined }}>
      <defs>
        <clipPath id={`${id}u`}><rect x={padL} y={0} width={W - padL - padR} height={Math.max(0, y0)} /></clipPath>
        <clipPath id={`${id}d`}><rect x={padL} y={y0} width={W - padL - padR} height={Math.max(0, plotB - y0)} /></clipPath>
        <clipPath id={`${id}p`}><rect x={padL} y={0} width={W - padL - padR} height={plotB} /></clipPath>
      </defs>
      {/* THE DOLLAR SCALE: a light grid and its figures on the left; the zero line stronger. */}
      <g data-lab-yaxis aria-hidden="true">
        {yTicks.map((v) => (
          <g key={`y${v}`}>
            {Math.abs(v) > 1e-9 && <line x1={padL} x2={W - padR} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.8} />}
            <text x={padL - 6} y={Y(v) + 4} textAnchor="end" style={{ ...txt, stroke: "none" }}>{axisMoney(v)}</text>
          </g>
        ))}
      </g>
      <line x1={padL} x2={W - padR} y1={y0} y2={y0} stroke={T.field} strokeWidth={1} />
      {area && <path d={area} fill={T.green} opacity={0.28} clipPath={`url(#${id}u)`} />}
      {area && <path d={area} fill={T.red} opacity={0.16} clipPath={`url(#${id}d)`} />}
      {todayText && (
        <g aria-label="today's price">
          <line x1={X(spot)} x2={X(spot)} y1={padT - 4} y2={plotB} stroke={T.ink} strokeWidth={1} opacity={0.45} strokeDasharray="3 3" />
          {!crossText && <text x={todayX} y={14} style={txt}>{todayText}</text>}
        </g>
      )}
      <g clipPath={`url(#${id}p)`} opacity={drawMode ? 0.3 : 1}>
        {exit && <path data-lab-curve="exit" d={pathOf(exit, X, Y)} fill="none" {...curveStroke("exit")} />}
        {today && <path data-lab-curve="today" d={pathOf(today, X, Y)} fill="none" {...curveStroke("today")} />}
        {line && <path data-lab-curve="expiry" d={line} fill="none" {...curveStroke("expiry")} strokeLinejoin="round" />}
      </g>
      {/* PR 77: THE DRAWN STROKE, in the picture's own units: drawn as the finger moves, kept once it lifts. */}
      {drawMode && shownStroke && shownStroke.length > 1 && (
        <path data-lab-stroke d={shownStroke.map((p, i) => `${i ? "L" : "M"}${X(p.s).toFixed(1)},${Math.min(plotB, Math.max(padT, Y(p.v))).toFixed(1)}`).join(" ")}
          fill="none" stroke={T.blue} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#${id}p)`} />
      )}
      {!drawMode && extremeLabels.map((e) => (
        <text key={e.id} data-lab-extreme={e.id} x={e.x} y={e.y} style={{ ...txt, fill: T.ink }}>{e.text}</text>
      ))}
      {!drawMode && beLabels.map((x, i) => (
        <g key={`be${i}`} data-lab-be aria-label="breakeven">
          <circle cx={X(x.s)} cy={y0} r={3} fill={T.ink} />
          <text x={x.x} y={x.y} style={txt}>{x.t}</text>
        </g>
      ))}
      {/* THE MARKET'S DISTRIBUTION: a thin band under the price axis, darker where the market's prices put the price. */}
      {density && density.length > 0 && (
        <g data-lab-density aria-hidden="true">
          {density.map((g, i) => (
            <rect key={`d${i}`} x={X(g.lo)} y={plotB + 3} width={Math.max(0.5, X(g.hi) - X(g.lo))} height={6} fill={T.blue} opacity={0.1 + 0.8 * g.w} />
          ))}
        </g>
      )}
      <g data-lab-xaxis aria-hidden="true">
        {xTicks.map((v) => {
          const w = textW(axisPrice(v));
          return (<g key={`x${v}`}>
            <line x1={X(v)} x2={X(v)} y1={plotB} y2={plotB + 3} stroke={T.field} strokeWidth={1} />
            <text x={Math.min(W - padR - w, Math.max(padL - 4, X(v) - w / 2))} y={H - 4} style={{ ...txt, stroke: "none" }}>{axisPrice(v)}</text>
          </g>);
        })}
      </g>
      {!drawMode && crossText && (
        <g data-lab-cross aria-live="polite">
          <line x1={X(cross)} x2={X(cross)} y1={padT - 4} y2={plotB} stroke={T.ink} strokeWidth={1} opacity={0.7} />
          {b && <circle cx={X(cross)} cy={Y(b.at(cross))} r={4} fill={T.ink} stroke={T.bg} strokeWidth={1.5} />}
          {crossToday != null && <circle cx={X(cross)} cy={Y(crossToday)} r={3.5} fill={T.bg} stroke={T.ink} strokeWidth={1.5} />}
          <text x={crossX} y={14} style={{ ...txt, fill: T.ink }}>{crossText}</text>
        </g>
      )}
      {b && !drawMode && legs.map((l, i) => {
        if (!inRange[i]) return null;
        const k = Number(l.strike);
        const cx = pxs[i], cy = Y(b.at(k));
        const on = drag && drag.i === i;
        const z = zones[i];
        return (
          <g key={`h${i}`} data-lab-point={i} role="slider" tabIndex={0} aria-label={handleLabel(i)} aria-valuenow={k}
            aria-valuetext={String(k)} style={{ cursor: on ? "grabbing" : "grab", outline: "none", touchAction: "none" }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); onStep && onStep(i, -1); }
              if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); onStep && onStep(i, 1); }
            }}
            onPointerDown={(e) => hold(i, e)} onPointerMove={(e) => slide(i, e)} onPointerUp={release} onPointerCancel={release}>
            {/* THE FINGER'S BAND: the whole height of the guide, at least 44px wide where there is room, the page held still. */}
            <rect data-lab-zone={i} x={z.x0} y={padT - 4} width={Math.max(0, z.x1 - z.x0)} height={plotB - padT + 4} fill="transparent" style={{ touchAction: "none" }} />
            <line x1={cx} x2={cx} y1={cy} y2={plotB} stroke={T.blue} strokeWidth={1} opacity={0.5} strokeDasharray="2 3" />
            <circle data-lab-dot cx={cx} cy={cy} r={on ? 9 : 7} fill={T.blue} stroke={T.bg} strokeWidth={2} />
            <text x={kLane[i]} y={plotB + 22} style={{ ...txt, fill: T.blue }}>{kText[i]}</text>
          </g>
        );
      })}
      {held && (
        <g data-lab-held aria-hidden="true" pointerEvents="none">
          <rect x={heldX} y={heldY} width={heldW} height={22} rx={6} fill={T.panel} stroke={T.blue} strokeWidth={1} />
          <text x={heldX + 8} y={heldY + 15} style={{ ...txt, fill: T.ink, stroke: "none" }}>{held}</text>
        </g>
      )}
    </svg>
  );
}
