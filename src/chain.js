/* ============================== THE OPTION CHAIN, AND WHERE IT COMES FROM ==============================
 *
 * One internal shape, two sources.
 *
 *   { spot, byExp: { "YYYY-MM-DD": { dte, calls: {strike:{...}}, puts: {...} } },
 *     expirations: [...], updated, source }
 *
 * and every contract inside it:
 *
 *   { bid, ask, mid, iv, oi, vol, delta, theta, occ }
 *
 * That shape is the contract with the rest of the app. The Shortlist, the
 * wizard's ranking and every visual read it, so a new source is allowed to
 * change where the numbers come from and nothing else.
 *
 * ALPACA IS THE PRIMARY SOURCE, CBOE IS THE FALLBACK. The app sends its orders
 * to Alpaca, so reading its prices from the same broker means the price on the
 * confirm screen and the price the order meets are quoted by the same book.
 * But a broker that is slow, rate-limited or down must never be the reason a
 * beginner sees a blank screen: `fetchChain()` gives Alpaca a short timeout and
 * falls back to CBOE, which is exactly what the app did before this file existed.
 *
 * `mid` IS COMPUTED IN ONE PLACE for both sources (`midOf`). Two sources that
 * disagree about the price of the same contract because one averages bid/ask
 * and the other took the last trade would be a bug that looks like a market.
 *
 * This file is plain JS with no React imports: the client, the serverless
 * function and the tests all import from here.
 */

/** How far out we look. CBOE hands us everything; this is the ceiling for both. */
import { quantile, knownCounts } from "./rules.js";

export const MAX_DTE = 400;

/** The label the user sees. Never call the indicative feed real-time (PRD: honesty about data). */
export const SOURCE = {
  alpacaIndicative: "Alpaca (indicative)",
  alpacaOpra: "Alpaca (OPRA)",
  cboeServer: "CBOE (server)",
  cboeDirect: "CBOE diretta",
};

/* ---------- WHAT THE SCREEN CALLS THE FEED ----------
 * ONE PLACE DECIDES, and every label reads from it. A screen that hardcodes a
 * feed name is a screen that can contradict the badge three centimetres above
 * it — which is exactly what "PRICE NOW (CBOE)" did while the badge said
 * "Alpaca (indicative)". A label the code does not derive is a label that goes
 * stale the first time the source changes.
 */

/** The short name: what to put in a heading. "Alpaca", "CBOE", or null. */
export function feedName(chain) {
  const s = chain?.source;
  if (!s) return null;
  if (s === SOURCE.alpacaIndicative || s === SOURCE.alpacaOpra) return "Alpaca";
  if (s === SOURCE.cboeServer || s === SOURCE.cboeDirect) return "CBOE";
  return s;
}

/**
 * One sentence saying how fresh these prices really are.
 * The delay is a property of the feed, so it is stated wherever the feed is —
 * never "~15 min delayed" under numbers that came from somewhere else.
 */
export function sourceNote(chain) {
  const s = chain?.source;
  if (!s) return "prices not loaded";
  if (s === SOURCE.alpacaIndicative) return "Alpaca indicative prices — a calculated feed, not the consolidated tape";
  if (s === SOURCE.alpacaOpra) return "Alpaca OPRA prices — the consolidated tape";
  return "CBOE prices, about 15 minutes delayed";
}

/** OCC symbol → its parts. `UNG260116C00013000` → UNG, 2026-01-16, call, 13. */
export function parseOcc(occ) {
  const m = occ.match(/^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/);
  if (!m) return null;
  return {
    und: m[1],
    exp: `20${m[2]}-${m[3]}-${m[4]}`,
    type: m[5] === "C" ? "call" : "put",
    strike: parseInt(m[6], 10) / 1000,
    occ,
  };
}

/** The same thing backwards: what an order ticket needs to name a contract. */
export function buildOcc(sym, expISO, type, strike) {
  const d = expISO.replaceAll("-", "").slice(2); // YYMMDD
  const k = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${sym.toUpperCase()}${d}${type === "call" ? "C" : "P"}${k}`;
}

/**
 * The price of one contract, decided once for every source.
 * Mid of bid and ask when both sides are quoted; the last trade otherwise;
 * null when neither exists, which is how `priceLeg()` knows to fall back to
 * Black-Scholes instead of pricing a trade off a number nobody quoted.
 */
export function midOf(bid, ask, last) {
  return bid > 0 && ask > 0 ? (bid + ask) / 2 : (last > 0 ? last : null);
}

/** Days to expiration, rounded, from an ISO date. */
const dteOf = (expISO, now) => Math.round((new Date(expISO + "T00:00:00Z") - now) / 86400000);

/* ============================== CBOE ============================== */
// Public CBOE endpoint (~15 min delayed): bid/ask, IV, OI, volume and real
// greeks per strike. It was the only source before Alpaca; it is now the net.

export const CBOE_URL = (sym) =>
  `https://cdn.cboe.com/api/global/delayed_quotes/options/${sym.toUpperCase()}.json`;

export function parseCboeJson(sym, j, now = Date.now()) {
  const d = j.data || {};
  const spot = d.current_price ?? d.close ?? d.last ?? null;
  const byExp = {};
  for (const o of d.options || []) {
    const p = parseOcc(o.option || "");
    if (!p) continue;
    const dte = dteOf(p.exp, now);
    if (dte < 0 || dte > MAX_DTE) continue; // ~13 months: every CBOE expiry we can use
    if (!byExp[p.exp]) byExp[p.exp] = { dte, calls: {}, puts: {} };
    byExp[p.exp][p.type === "call" ? "calls" : "puts"][p.strike] = {
      bid: o.bid, ask: o.ask, mid: midOf(o.bid, o.ask, o.last_trade_price),
      iv: o.iv || null, oi: o.open_interest || 0, vol: o.volume || 0,
      delta: o.delta, theta: o.theta, occ: p.occ,
    };
  }
  const expirations = Object.keys(byExp).sort();
  if (!expirations.length) throw new Error("the chain came back with no usable expirations");
  return { spot, byExp, expirations, updated: new Date().toISOString(), source: SOURCE.cboeDirect };
}

async function fetchCboeDirect(sym, fetchImpl) {
  const r = await fetchImpl(CBOE_URL(sym));
  if (!r.ok) throw new Error("CBOE " + r.status);
  return parseCboeJson(sym, await r.json());
}

export async function fetchCboeChain(sym, { fetchImpl = fetch } = {}) {
  // 1) dedicated server endpoint (handles symbol variants + browser headers)
  try {
    const r = await fetchImpl(`/api/chain?sym=${encodeURIComponent(sym)}`);
    if (r.ok) { const c = parseCboeJson(sym, await r.json()); return { ...c, source: SOURCE.cboeServer }; }
    const err = await r.json().catch(() => ({}));
    throw new Error((err.tried || [err.error]).join(" | "));
  } catch (eServer) {
    // 2) direct fetch (works in local dev)
    try { return await fetchCboeDirect(sym, fetchImpl); }
    catch (eDirect) { throw new Error(`server: ${eServer.message} · diretta: ${eDirect.message}`); }
  }
}

/* ============================== ALPACA ============================== */
/**
 * Normalise Alpaca's option snapshots into the internal shape.
 *
 * The payload (data.alpaca.markets, /v1beta1/options/snapshots/{underlying}):
 *
 *   { "snapshots": {
 *       "UNG260116C00013000": {
 *         "latestQuote": { "bp": 0.41, "ap": 0.52, "bs": 12, "as": 8, "t": "..." },
 *         "latestTrade": { "p": 0.47, "s": 1, "t": "..." },
 *         "greeks": { "delta": 0.42, "gamma": 0.18, "rho": 0.01, "theta": -0.004, "vega": 0.02 },
 *         "impliedVolatility": 0.5123 } },
 *     "next_page_token": null }
 *
 * Two fields the broker does not send: open interest and volume. They are
 * DISPLAY-ONLY in this app — nothing filters or ranks on them — so they come
 * back `null` rather than a zero that would read on screen as "nobody is
 * trading this". Where CBOE knows them it still fills them in.
 *
 * @param sym       underlying ticker, used to reject contracts on another root
 * @param payload   one merged Alpaca response (snapshots of every page)
 * @param spot      the underlying's own last price — the chain is useless without it
 * @param feed      "indicative" | "opra", only to name the source honestly
 */
export function normaliseAlpacaChain(sym, payload, { spot, feed = "indicative", now = Date.now() } = {}) {
  const snaps = payload?.snapshots || {};
  const root = String(sym || "").toUpperCase();
  const byExp = {};
  for (const [occ, s] of Object.entries(snaps)) {
    const p = parseOcc(occ);
    if (!p || p.und !== root) continue;         // ignore a different root on the same underlying
    const dte = dteOf(p.exp, now);
    if (dte < 0 || dte > MAX_DTE) continue;      // same ceiling the CBOE parser uses
    if (!byExp[p.exp]) byExp[p.exp] = { dte, calls: {}, puts: {} };
    const q = s?.latestQuote || {};
    const t = s?.latestTrade || {};
    const g = s?.greeks || {};
    const bid = q.bp ?? 0, ask = q.ap ?? 0;
    byExp[p.exp][p.type === "call" ? "calls" : "puts"][p.strike] = {
      bid, ask, mid: midOf(bid, ask, t.p),
      iv: s?.impliedVolatility ?? null,
      oi: null, vol: null,                       // not in an Alpaca snapshot — see above
      delta: g.delta ?? null, theta: g.theta ?? null,
      occ: p.occ,
    };
  }
  const expirations = Object.keys(byExp).sort();
  if (!expirations.length) throw new Error("Alpaca: chain vuota");
  if (!(spot > 0)) throw new Error("Alpaca: no underlying price");
  return {
    spot, byExp, expirations,
    updated: new Date().toISOString(),
    source: feed === "opra" ? SOURCE.alpacaOpra : SOURCE.alpacaIndicative,
  };
}

/**
 * Does this chain know how many contracts are open?
 * Alpaca's snapshots do not carry open interest; `enrichOpenInterest` below
 * fills it in afterwards from the broker's contract list, and until it lands
 * (or when it never does) the panel built on it has nothing to draw. It must
 * then say so rather than draw a row of zeros under a sentence about where
 * buyers cluster — and every OI column on screen hides itself the same way.
 */
export function hasOpenInterest(chain) {
  if (!chain?.expirations) return false;
  for (const e of chain.expirations) {
    for (const side of ["calls", "puts"]) {
      for (const c of Object.values(chain.byExp[e]?.[side] || {})) if (c.oi > 0) return true;
    }
  }
  return false;
}

/* ============================== OPEN INTEREST ==============================
 *
 * Alpaca's MARKET DATA snapshot carries the quote, the trade and the greeks and
 * no open interest. Its TRADING API does carry it:
 *
 *   GET /v2/options/contracts
 *       ?underlying_symbols&status&expiration_date_gte&expiration_date_lte
 *       &strike_price_gte&strike_price_lte&limit&page_token
 *   → { option_contracts: [ { symbol, strike_price, expiration_date, type,
 *                             open_interest, open_interest_date,
 *                             close_price, close_price_date, ... } ],
 *       next_page_token }
 *
 * Verified against Alpaca's own SDK (alpaca-py 0.44.0, GetOptionContractsRequest
 * and OptionContract). Two things that bite: `limit` maxes out at 10000, and
 * `open_interest` arrives as a STRING, not a number.
 *
 * THAT LIVES ON paper-api.alpaca.markets, which `netlify/functions/alpaca.mjs`
 * already proxies — so this needs no new host, no new function and no new key,
 * and alpaca.mjs still speaks to exactly one host. Its X-OSL-Paper-Endpoint
 * header, the thing src/riskGate.js checks to VERIFY paper mode, means exactly
 * what it meant before: nothing here touches it.
 *
 * TWO RULES, AND THEY ARE NOT NEGOTIABLE.
 *
 *   NON-BLOCKING. The quotes are the product; open interest is a nice-to-have.
 *   This call gets its own short timeout, swallows its own failure, and never
 *   sits between the user and a chain. The app fires it AFTER the chain is on
 *   screen and patches the numbers in when they land (`refreshChain`).
 *
 *   HONEST. The figure is the previous session's close, not a live count. It is
 *   labelled as such wherever it appears, and `oiAsOf` carries the date the
 *   broker stamped on it. When the call does not land, `oi` stays null and the
 *   column disappears — a dash is not a number, and a zero we invented would be
 *   worse than both.
 */
const OI_TIMEOUT_MS = 3500;
const OI_PAGE = 10000;   // Alpaca's own maximum for this endpoint
const OI_MAX_PAGES = 3;

/** The proxied path. One host (paper-api), one method (GET), no key on the client. */
export function openInterestPath(sym, { expFrom, expTo, strikeLo, strikeHi, pageToken } = {}) {
  // Deliberately no URLSearchParams: alpaca.mjs validates the path against a
  // character whitelist, and an encoded comma or colon would be rejected there.
  const q = [
    `underlying_symbols=${encodeURIComponent(sym)}`,
    "status=active",
    `limit=${OI_PAGE}`,
  ];
  if (expFrom) q.push(`expiration_date_gte=${expFrom}`);
  if (expTo) q.push(`expiration_date_lte=${expTo}`);
  if (strikeLo > 0) q.push(`strike_price_gte=${strikeLo.toFixed(2)}`);
  if (strikeHi > 0) q.push(`strike_price_lte=${strikeHi.toFixed(2)}`);
  if (pageToken) q.push(`page_token=${encodeURIComponent(pageToken)}`);
  return `/v2/options/contracts?${q.join("&")}`;
}

/** The strikes and expiries this chain actually holds — nothing else is worth asking for. */
function chainBounds(chain) {
  const exps = chain?.expirations || [];
  if (!exps.length) return null;
  let lo = Infinity, hi = 0;
  for (const e of exps) {
    for (const side of ["calls", "puts"]) {
      for (const k of Object.keys(chain.byExp[e]?.[side] || {})) {
        const kk = +k;
        if (kk < lo) lo = kk;
        if (kk > hi) hi = kk;
      }
    }
  }
  if (!(hi > 0)) return null;
  return { expFrom: exps[0], expTo: exps[exps.length - 1], strikeLo: lo, strikeHi: hi };
}

/**
 * Ask the broker how many contracts are open, keyed by OCC symbol.
 * Returns `{ byOcc, asOf }`; throws on anything that goes wrong, because the
 * only caller wraps it in a catch that shrugs.
 */
export async function fetchOpenInterest(sym, chain, { fetchImpl = fetch, timeoutMs = OI_TIMEOUT_MS } = {}) {
  const bounds = chainBounds(chain);
  if (!bounds) throw new Error("nothing to enrich");

  const ctl = typeof AbortController === "function" ? new AbortController() : null;
  const timer = setTimeout(() => ctl?.abort(), timeoutMs);
  try {
    const byOcc = new Map();
    let asOf = null, token = null, pages = 0;
    do {
      const path = openInterestPath(sym, { ...bounds, pageToken: token });
      const r = await fetchImpl(`/api/alpaca?path=${encodeURIComponent(path)}`, { signal: ctl?.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      for (const c of j?.option_contracts || []) {
        const oi = Number(c?.open_interest);       // the broker sends it as a string
        if (!c?.symbol || !Number.isFinite(oi)) continue;
        byOcc.set(c.symbol, oi);
        if (c.open_interest_date && (!asOf || c.open_interest_date > asOf)) asOf = c.open_interest_date;
      }
      token = j?.next_page_token || null;
      pages++;
    } while (token && pages < OI_MAX_PAGES);

    if (!byOcc.size) throw new Error("no contracts came back");
    return { byOcc, asOf };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A copy of the chain with `oi` filled in where the OCC symbol matched.
 * Returns null when nothing matched: swapping a chain for an identical one
 * would re-render every screen to show the same numbers.
 */
export function applyOpenInterest(chain, byOcc, asOf = null) {
  if (!chain?.expirations || !byOcc?.size) return null;
  let filled = 0;
  const byExp = {};
  for (const e of chain.expirations) {
    const src = chain.byExp[e];
    const out = { ...src, calls: {}, puts: {} };
    for (const side of ["calls", "puts"]) {
      for (const [k, c] of Object.entries(src[side] || {})) {
        const oi = byOcc.get(c.occ);
        if (oi == null) { out[side][k] = c; continue; }
        out[side][k] = { ...c, oi };
        filled++;
      }
    }
    byExp[e] = out;
  }
  if (!filled) return null;
  return { ...chain, byExp, oiAsOf: asOf, oiSource: "Alpaca contracts" };
}

/** Both halves, for the one caller that wants the enriched chain or nothing. */
export async function enrichOpenInterest(sym, chain, opts = {}) {
  const { byOcc, asOf } = await fetchOpenInterest(sym, chain, opts);
  return applyOpenInterest(chain, byOcc, asOf);
}

/**
 * How to describe the open-interest number on screen, with the date the broker
 * stamped on it. Never sounds fresher than it is: this is the previous
 * session's close, and saying so is the same rule that makes the feed label
 * read "indicative".
 */
export function openInterestNote(chain) {
  if (!chain?.oiSource) return "Open interest as reported by the feed.";
  return `Open interest is the previous session's close${chain.oiAsOf ? `, as of ${chain.oiAsOf}` : ""}, from the broker's contract list — not a live count.`;
}

/* ---------------------------------------------------------------------------
 * WHAT THE CHAIN ACTUALLY CONTAINS, so the floor can be argued with.
 *
 * The liquidity floor is now two numbers (`RULES.liquidityPercentile` and
 * `RULES.minOpenInterestAbsolute`), and both were SET from a measurement of
 * all five live chains (see the table in `rules.js`). This panel is how the
 * setting is re-checked from inside the app as the market moves: it prints the
 * distribution of open interest across the chains actually loaded, the value
 * the relative half of the floor asks for on that distribution, and the share
 * of contracts that clear the absolute minimum underneath it. One day's close
 * is a reading, not a law — the numbers are worth looking at again.
 *
 * Two figures, because they answer different questions. `all` covers every
 * contract in the chain and is dominated by far-out strikes nobody trades;
 * `near` covers strikes within `nearPct` of spot, which is where these
 * structures are actually built, and is the one that decides whether the floor
 * is sensible or is emptying markets.
 *
 * Pure, and it never invents a number: a contract whose count is unknown is
 * counted as unknown, never as zero. That is the same rule `qualityFloor()`
 * applies, for the same reason.
 * ------------------------------------------------------------------------- */
export function oiProfile(chain, { floor = 0, nearPct = 0.1, percentile = 0 } = {}) {
  if (!chain?.expirations) return null;
  const S = Number(chain.spot);
  const all = [], near = [];
  let total = 0, unknown = 0;
  for (const e of chain.expirations) {
    for (const side of ["calls", "puts"]) {
      for (const [k, c] of Object.entries(chain.byExp?.[e]?.[side] || {})) {
        total++;
        const raw = c?.oi;
        if (raw == null || raw === "" || !Number.isFinite(Number(raw))) { unknown++; continue; }
        const n = Number(raw);
        all.push(n);
        if (S > 0 && Math.abs(Number(k) - S) <= S * nearPct) near.push(n);
      }
    }
  }
  const stat = (xs) => {
    if (!xs.length) return { count: 0, median: null, p90: null, max: null, atPercentile: null, clearing: 0, share: null };
    const s = [...xs].sort((a, b) => a - b);
    const clearing = s.filter((x) => x >= floor).length;
    return {
      count: s.length,
      median: quantile(s, 0.5), p90: quantile(s, 0.9), max: s[s.length - 1],
      // What the RELATIVE half of the floor would ask for on this set. Printed
      // beside the absolute floor so the two can be compared on one screen.
      atPercentile: percentile > 0 ? quantile(s, percentile) : null,
      clearing, share: clearing / s.length,
    };
  };
  return { total, unknown, known: all.length, reports: all.length > 0, all: stat(all), near: stat(near) };
}

/**
 * Every known open-interest count on ONE expiry — the peer set the liquidity
 * floor measures a leg against (src/rules.js, `liquidityThreshold`).
 *
 * The comparison is per EXPIRY and not per chain on purpose: a front-month
 * strike and a strike thirteen months out are not neighbours, and pooling them
 * would let the busiest expiry set the bar for the quietest. Unknown counts are
 * dropped, never read as zero — the same rule everywhere else in this file.
 */
export function expiryOpenInterest(chain, expKey) {
  const e = chain?.byExp?.[expKey];
  if (!e) return [];
  const out = [];
  for (const side of ["calls", "puts"]) {
    for (const c of Object.values(e[side] || {})) out.push(c?.oi);
  }
  return knownCounts(out);
}

/** Shape-check what came back over the wire before the app trusts it. */
function assertChain(c) {
  if (!c || typeof c !== "object") throw new Error("empty response");
  if (!(c.spot > 0)) throw new Error("no spot price");
  if (!Array.isArray(c.expirations) || !c.expirations.length) throw new Error("no expirations");
  if (!c.byExp || typeof c.byExp !== "object") throw new Error("no contracts");
  return c;
}

/* ============================== THE ONE THE APP CALLS ============================== */
/**
 * Alpaca first, CBOE second, and never nothing.
 *
 * The broker gets a SHORT leash. `refreshChain` is called once per ticker and
 * the wizard walks the basket one ticker at a time, so five slow attempts are
 * twenty seconds of an app that looks broken with a working fallback one call
 * away. After two failures in a row we stop asking for the rest of the session:
 * a source that is down stays down for longer than a page view, and the user
 * should not pay the timeout five more times to learn that.
 */
const ALPACA_TIMEOUT_MS = 4000;
const ALPACA_STRIKES = 2;   // failures before this session gives up on the broker
let alpacaFails = 0;

/** Testing seam and a way back in after a user-initiated retry. */
export const resetChainSource = () => { alpacaFails = 0; };
export const alpacaGivenUp = () => alpacaFails >= ALPACA_STRIKES;

export async function fetchChain(sym, {
  fetchImpl = fetch,
  timeoutMs = ALPACA_TIMEOUT_MS,
  useAlpaca = true,
} = {}) {
  if (useAlpaca && !alpacaGivenUp()) {
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(() => ctl?.abort(), timeoutMs);
    try {
      const r = await fetchImpl(`/api/chainAlpaca?sym=${encodeURIComponent(sym)}`, { signal: ctl?.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const c = assertChain(await r.json());
      alpacaFails = 0;
      return c;
    } catch {
      alpacaFails++;   // the reason travels in the CBOE chain that follows, not in a toast
    } finally {
      clearTimeout(timer);
    }
  }
  return fetchCboeChain(sym, { fetchImpl });
}
