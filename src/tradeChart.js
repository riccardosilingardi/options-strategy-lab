// ============================================================================
// src/tradeChart.js — BUILD'S CHART, ITS ARITHMETIC (PR 63, tasks 63.4 and 63.5; owner 7 Oct 2026).
//
// What the one chart on Build (`UnifiedView` / `UnifiedChart` in pro.jsx) adds to the picture, worked out here so a test
// can hold it without a browser:
//   · THE ZONES: the payoff's profit and loss zones (`payoffBands()`'s bands, cut where the P&L at expiry changes sign),
//     the first stretched down to a price of zero and the last up without end, each with the chance of finishing in it
//     on THE CHANCE'S OWN LOGNORMAL (`exactPnl()` in engine.js, the drift and the volatility `chanceOf()` used). They add
//     up to 100%, and the profit zones add up to the CHANCE figure itself (chart.test.jsx holds both).
//   · THE FAN'S EDGES: the prices one standard deviation either side at expiry, S·exp(m ± s), on the same lognormal — the
//     edges of the fan's darker band, which is drawn at ±1 sd.
//   · THE EXIT: the day the plan exits, `RULES.exitDTE` days before the expiry, read off the expiry's own date (no clock).
//   · THE CROSSHAIR: at a price, what the trade makes at expiry for the size (`payoff()`, the one payoff) and the chance of
//     finishing below it (the same lognormal); its keyboard steps.
//
// Plain JS, no React. Nothing here is a new rule or a new number: it reads the chance's distribution and the payoff.
// ============================================================================
import { exactPnl, payoff } from "./engine.js";
import { RULES, dayWords, crosshairLine } from "./rules.js";

/** The chance's distribution at expiry, or null when the policy cannot be read (no spot, no volatility, no days). */
export function chartDist(legs, entryNet, spot, { driftAnnual, sigma, dte } = {}) {
  try {
    return exactPnl(legs, Number(entryNet) || 0, spot, { driftAnnual: Number(driftAnnual) || 0, sigma: Number(sigma), dte: Number(dte) });
  } catch { return null; }
}

/**
 * THE ZONES WITH THEIR CHANCES. `bands` are `payoffBands()`'s, in price order ({ lo, hi, sign }); the first is stretched
 * to 0 and the last to Infinity, so the chances cover every price and add up to 1.
 * @returns [{ lo, hi, sign, p }] or [] when there is no distribution
 */
export function zoneOdds(bands = [], dist = null) {
  if (!dist || !Array.isArray(bands) || !bands.length) return [];
  return bands.map((b, i) => {
    const lo = i === 0 ? 0 : b.lo;
    const hi = i === bands.length - 1 ? Infinity : b.hi;
    return { lo, hi, sign: b.sign, p: dist.mass(lo, hi) };
  });
}

/** One standard deviation either side at expiry, and the middle: S·exp(m ± s), m = (drift − σ²/2)·T, s = σ·√T. */
export function coneEdges(spot, { driftAnnual = 0, sigma, dte } = {}) {
  const S = Number(spot), sg = Number(sigma), d = Number(dte);
  if (!(S > 0) || !(sg > 0) || !(d > 0)) return null;
  const T = d / 365, s = sg * Math.sqrt(T), m = ((Number(driftAnnual) || 0) - 0.5 * sg * sg) * T;
  return { lo: S * Math.exp(m - s), mid: S * Math.exp(m), hi: S * Math.exp(m + s) };
}

/** "2026-11-20" − 21 days → { key: "2026-10-30", day: "30 Oct", daysFromNow: dte − 21 }; null when already inside the exit. */
export function exitMark(expKey, dte, exitDTE = RULES.exitDTE) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(expKey || ""));
  if (!m || !Number.isFinite(Number(dte)) || Number(dte) <= exitDTE) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]) - exitDTE * 86400000;
  const key = new Date(t).toISOString().slice(0, 10);
  return { key, day: dayWords(key), daysFromNow: Number(dte) - exitDTE };
}

/** How far a breakeven is from today's price, as a fraction (−0.008 is 0.8% below). */
export const awayFrom = (px, spot) => (Number(spot) > 0 && Number.isFinite(Number(px)) ? (Number(px) - Number(spot)) / Number(spot) : null);

/**
 * THE CROSSHAIR'S READOUT at a price: the P&L at expiry for the size, the chance of finishing below, and its sentence.
 * `contracts` is Build's size (1 when unknown, and then the sentence says "1 contract").
 */
export function crosshairReadout({ ticker, price, expKey, legs, entryNet, contracts, dist }) {
  const px = price == null ? NaN : Number(price);
  if (!Number.isFinite(px) || px <= 0 || !Array.isArray(legs) || !legs.length) return null;
  const n = Number.isFinite(Number(contracts)) && Number(contracts) >= 1 ? Math.round(Number(contracts)) : 1;
  const pnl = (payoff(legs, px) - (Number(entryNet) || 0)) * 100 * n;
  const below = dist ? dist.P(px) : null;
  return { price: px, pnl, below, contracts: n,
    text: crosshairLine({ ticker, price: px, day: dayWords(expKey) || expKey || "expiry", pnl, contracts: n, below }) };
}

/** The crosshair's keyboard step: a round number near 0.25% of the price ($1 on GLD at 378, 5 cents on UNG at 12). */
export function crossStep(spot) {
  const want = Math.abs(Number(spot) || 0) * 0.0025;
  const steps = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25];
  return steps.find((s) => s >= want) || steps[steps.length - 1];
}

/**
 * THE CROSSHAIR'S KEYS, as a slider's (WAI-ARIA): ↑ / → one step up, ↓ / ← one down, Page Up / Page Down ten, Home the
 * chart's lowest price, End its highest. With no line yet the first key starts from today's price.
 * @returns the new price, or null when the key is not one of these
 */
export function crossKey(price, key, { min, max, step, spot }) {
  // `Number(null)` is 0 and 0 is finite (CLAUDE.md): no line yet is null, tested before the coercion.
  const at = price != null && Number.isFinite(Number(price)) ? Number(price) : Number(spot);
  const clamp = (v) => Math.min(max, Math.max(min, v));
  const snap = (v) => Math.round(v / step) * step;
  switch (key) {
    case "ArrowUp": case "ArrowRight": return clamp(snap(at + step));
    case "ArrowDown": case "ArrowLeft": return clamp(snap(at - step));
    case "PageUp": return clamp(snap(at + 10 * step));
    case "PageDown": return clamp(snap(at - 10 * step));
    case "Home": return min;
    case "End": return max;
    default: return null;
  }
}
