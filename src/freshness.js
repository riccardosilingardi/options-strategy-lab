// ============================================================================
// src/freshness.js — HOW OLD IS THE NUMBER ON SCREEN, AND MAY IT BE?
//
// A stale number is acceptable. A stale number pretending to be live is not.
//
// THE FAULT THIS EXISTS FOR. Three live captures on 2026-09-03T17:57Z: the
// option chain reported BOIL at 20.19 and the liquidity endpoint reported 20.22
// SEVENTEEN SECONDS apart, and the app printed one "PRICE NOW". Neither number
// was wrong; the screen was, because it showed a figure with no age on it.
//
// EVERY SOURCE GETS ITS OWN BUDGET, and the budgets are wildly different on
// purpose — reading them all on one clock is what made "refresh everything on
// every tab change" look reasonable:
//
//   - the option chain moves every minute the market is open;
//   - open interest is the PREVIOUS SESSION'S CLOSE and cannot change during a
//     day, so refetching it hourly is pure waste (chain.js already says so);
//   - seasonality is monthly data behind a 25-requests-a-DAY free quota, so
//     refetching it per tab switch would exhaust the day during a demo.
//
// Plain JS, no React imports, for the same reason rules.js and handoff.js are:
// the tests and the components both read it.
// ============================================================================

/**
 * What each source is allowed to be, before the app should go and look again.
 * `ttlMs` is when it goes stale; `unit` is how its age should be SPOKEN about,
 * because "0 days old" and "40 seconds old" are the same fact told badly.
 */
export const BUDGETS = {
  chain: {
    ttlMs: 5 * 60 * 1000, unit: "minutes",
    what: "option prices",
    why: "Quotes move while the market is open, so anything older than a few minutes is a picture of the past.",
  },
  openInterest: {
    ttlMs: 20 * 60 * 60 * 1000, unit: "days",
    what: "open interest",
    why: "Open interest is the previous session's close and does not change during the day: refetching it more often than daily reads the same number again.",
  },
  seasonal: {
    ttlMs: 7 * 24 * 60 * 60 * 1000, unit: "days",
    what: "seasonality",
    why: "Monthly history changes once a month, and the free data quota is 25 requests a day across five markets.",
  },
  bars: {
    ttlMs: 60 * 60 * 1000, unit: "hours",
    what: "price history",
    why: "Daily bars change once a day; an hour keeps the last close current without re-reading a year of them.",
  },
};

export const budgetOf = (kind) => BUDGETS[kind] || null;

/** Milliseconds since `at`, or null when nothing has ever landed. */
export const ageMs = (at, now = Date.now()) => {
  const t = Number(at);
  return Number.isFinite(t) && t > 0 ? Math.max(0, now - t) : null;
};

/**
 * Has this source outlived its budget?
 *
 * NEVER LOADED IS STALE, and that is deliberate: the caller's question is "do I
 * need to fetch this", and the answer for something that has never arrived is
 * yes. It is NOT the same as "old", which is why `ageMs` returns null there and
 * the sentence below says "not loaded yet" rather than inventing an age.
 */
export const isStale = (kind, at, now = Date.now()) => {
  const b = budgetOf(kind);
  if (!b) return true;
  const a = ageMs(at, now);
  return a == null || a >= b.ttlMs;
};

/** `4 minutes`, `1 day`, `just now` — one phrasing, in the unit that suits. */
export function agePhrase(ms, unit = "minutes") {
  if (ms == null) return null;
  const s = Math.round(ms / 1000);
  if (unit === "minutes" && s < 45) return "just now";
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const mins = Math.round(s / 60), hours = Math.round(s / 3600), days = Math.floor(s / 86400);
  if (unit === "days") {
    if (days >= 1) return plural(days, "day");
    return hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, mins), "minute");
  }
  if (unit === "hours") return hours >= 1 ? plural(hours, "hour") : plural(Math.max(1, mins), "minute");
  if (mins < 60) return plural(Math.max(1, mins), "minute");
  return hours < 24 ? plural(hours, "hour") : plural(days, "day");
}

/**
 * The line a screen prints beside a number, saying how old it is and — when it
 * is past its budget — that the app knows.
 *
 * @param kind  a key of BUDGETS
 * @param at    when this source last landed, or null/0 if it never has
 * @param what  overrides the source's own name, for a screen with a better one
 */
export function freshnessNote(kind, at, { what = null, now = Date.now() } = {}) {
  const b = budgetOf(kind);
  if (!b) return "";
  const name = what || b.what;
  const a = ageMs(at, now);
  if (a == null) return `${name.toUpperCase()}: not loaded yet. ${b.why}`;
  const age = agePhrase(a, b.unit);
  return a >= b.ttlMs
    ? `${name.toUpperCase()}: ${age} old, past the ${agePhrase(b.ttlMs, b.unit)} this app treats as current — it will be refreshed. ${b.why}`
    : `${name.toUpperCase()}: ${age === "just now" ? "read just now" : `${age} old`}.`;
}

/**
 * WHICH SOURCES NEED FETCHING ON ENTERING A SCREEN — and no others.
 *
 * Alpha Vantage's free tier is 25 calls a DAY. Refetching everything on every
 * tab change is how a demo runs out of quota half way through, and it is also
 * how open interest gets re-read forty times for a number that changed once,
 * last night. Ask this instead of refetching.
 *
 * @param wanted  the kinds this screen needs, e.g. ["chain", "openInterest"]
 * @param at      `{ chain: 1725..., seasonal: null }` — when each last landed
 * @returns the subset of `wanted` that is actually out of date
 */
export const staleAmong = (wanted = [], at = {}, now = Date.now()) =>
  (Array.isArray(wanted) ? wanted : []).filter((k) => isStale(k, at?.[k], now));
