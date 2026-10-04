// ============================================================================
// src/marketView.js — WHAT THE MARKET PAGE'S HEADER AND CHAIN TRAY WORK OUT (redesign PR 1, TASK 3).
//
// Plain JS, no React, like positionView.js: the page (market.jsx) prints, this file reads. Each function is one
// answer, tested on its own (market.test.js):
//   dayChange()      the change since the previous session's close, from the daily bars already cached — no fetch
//   expectedMove()   spot × IV × √(days ÷ 365), the one-standard-deviation move to the expiry shown
//   latestNews()     the newest headline the news factor tagged for this market, from the news already read
//   toggleChainLeg() the Chain tab's tap: an ask buys one, a bid sells one, the same cell again removes it
//
// IT COMPUTES NOTHING THE BROKER OWNS: the price is the chain's spot, the IV the broker's quote (`atmIv()` in
// chain.js), the closes are the bars `/api/bars` returned. A missing input is null and the screen says so.
// ============================================================================
import { tagImpacts, newsComponent } from "./signals.js";

const finite = (x) => x != null && x !== "" && Number.isFinite(Number(x));
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON3 = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Today's date in New York (the exchange's calendar), "YYYY-MM-DD". */
export function etDate(now = Date.now()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now));
  const get = (t) => p.find((x) => x.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
/** "2026-10-02" → "Fri 2 Oct" (a calendar date: no time zone moves it). */
export function dayWords(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${DAY3[d.getUTCDay()]} ${+m[3]} ${MON3[+m[2] - 1]}`;
}

/**
 * THE CHANGE SINCE THE PREVIOUS SESSION'S CLOSE. The previous close is the LAST BAR DATED BEFORE TODAY in New York:
 * on a Tuesday it is Monday's, on a Monday or a weekend day it is Friday's (today's own bar, when the feed already has
 * one, is skipped). No bars, no earlier bar or no spot → null, and the header prints no change line.
 * @returns {null | { prev, prevDay, change, pct }}
 */
export function dayChange(bars, spot, now = Date.now()) {
  if (!Array.isArray(bars) || !bars.length || !finite(spot)) return null;
  const today = etDate(now);
  let prev = null;
  for (let i = bars.length - 1; i >= 0; i--) {
    const b = bars[i];
    if (b && typeof b.time === "string" && b.time < today && finite(b.close)) { prev = b; break; }
  }
  if (!prev || !(Number(prev.close) > 0)) return null;
  const change = Number(spot) - Number(prev.close);
  return { prev: Number(prev.close), prevDay: dayWords(prev.time), change, pct: change / Number(prev.close) };
}

/**
 * THE EXPECTED MOVE TO AN EXPIRY: spot × IV × √(days ÷ 365) — one standard deviation of the lognormal the option
 * prices imply, in dollars. 18.42 × 24.2% × √(47 ÷ 365) = ±$1.60. Null on any missing input.
 */
export function expectedMove(spot, iv, dte) {
  if (!finite(spot) || !finite(iv) || !finite(dte) || Number(spot) <= 0 || Number(iv) <= 0 || Number(dte) <= 0) return null;
  return Number(spot) * Number(iv) * Math.sqrt(Number(dte) / 365);
}

/**
 * THE LATEST NEWS FOR A MARKET, FROM WHAT THE NEWS FACTOR HAS ALREADY READ. The newest headline the factor tagged for
 * this ticker (`tagImpacts()`, the factor's own tagging); none tagged → the factor's own words ("none of the 6
 * headlines read tag CORN"); the feed failed → { failed: true }. No new fetch.
 * @param items  the news pool the factor reads
 * @param state  the market's news state ({ err, loading, at }) or null
 * @returns {{ failed: true } | { none: string } | { title, source, date } | null}  null while it loads
 */
export function latestNews(tk, items = [], state = null) {
  if (state && state.err) return { failed: true };
  if (!state || state.loading) return null;
  const tagged = (items || []).filter((it) => (it.impacts?.length ? it.impacts : tagImpacts(it.title)).some((im) => im.tk === tk));
  if (!tagged.length) return { none: newsComponent(tk, items).why };
  const newest = tagged.slice().sort((a, b) => (new Date(b.date).getTime() || 0) - (new Date(a.date).getTime() || 0))[0];
  return { title: newest.title, source: newest.src || null, date: newest.date || null };
}

/**
 * THE CHAIN TAB'S TAP. An ask is "buy 1" (side +1), a bid is "sell 1" (side −1); the same cell again removes the leg;
 * the other side of the same contract replaces it (a contract is held one way). At most `max` legs
 * (`MLEG_MAX_LEGS`, read by the caller from alpacaContract.js): one more returns the legs unchanged and `full`.
 * @param legs [{ type, strike, side, qty }]
 * @param tap  { type: "call"|"put", strike, side: 1|-1 }
 * @returns {{ legs, full: boolean }}
 */
export function toggleChainLeg(legs = [], tap, max = 4) {
  const same = (l) => l.type === tap.type && Number(l.strike) === Number(tap.strike);
  const at = legs.findIndex(same);
  if (at >= 0 && Math.sign(legs[at].side) === Math.sign(tap.side)) return { legs: legs.filter((_, i) => i !== at), full: false };
  if (at >= 0) return { legs: legs.map((l, i) => (i === at ? { ...l, side: Math.sign(tap.side) } : l)), full: false };
  if (legs.length >= max) return { legs, full: true };
  const next = [...legs, { type: tap.type, strike: Number(tap.strike), side: Math.sign(tap.side), qty: 1 }];
  next.sort((a, b) => a.strike - b.strike || (a.type === b.type ? 0 : a.type === "put" ? -1 : 1));
  return { legs: next, full: false };
}

/** The cell a leg occupies: "ask" for a long, "bid" for a short. */
export const legCell = (legs = [], type, strike) => {
  const l = legs.find((x) => x.type === type && Number(x.strike) === Number(strike));
  return !l ? null : l.side > 0 ? "ask" : "bid";
};
