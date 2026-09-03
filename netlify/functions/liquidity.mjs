/* ============================== HOW MUCH IS ACTUALLY OPEN, MEASURED ==============================
 *
 * WHY THIS EXISTS.
 * `src/rules.js` sets a liquidity floor and nobody has ever counted the open
 * interest actually present on UNG, CORN, SOYB, BOIL and WEAT. It cannot be
 * counted from a development sandbox: the broker keys live only in Netlify's
 * environment and this repository has never had network access to Alpaca. So
 * the measurement runs where the keys already are. Open this endpoint in a
 * browser, behind the site's own password, and paste the JSON back into the
 * next session; the percentile and the absolute minimum then come from a
 * reading instead of an argument.
 *
 *   /api/liquidity                 all five markets
 *   /api/liquidity?sym=UNG,CORN    just those
 *   /api/liquidity?near=15         widen the near-the-money band to +/-15%
 *
 * NO CREDENTIALS AND NO ACCOUNT DATA LEAVE THIS FUNCTION, AND NEITHER DOES A
 * CONTRACT. What comes back is aggregate statistics only: per market and per
 * expiry, how many strikes there are, how many report open interest at all, and
 * the distribution of that open interest. Not one contract symbol, not one
 * strike-level count, nothing about the account. The keys are read here and
 * used to sign the two upstream requests; nothing derived from them is in the
 * response, and no upstream URL is either.
 *
 * IT IS BEHIND THE SAME PASSWORD AS THE SITE. `netlify/edge-functions/gate.js`
 * runs on `/*` with only `/api/approve` excluded, so this path is gated by the
 * same SITE_PASSWORD prompt as every other page. No new door.
 *
 * WHY IT TALKS TO TWO HOSTS, AND WHY THAT IS SAFE.
 * Open interest is on the TRADING api (paper-api.alpaca.markets,
 * `/v2/options/contracts`); the underlying's last price is on the MARKET DATA
 * api (data.alpaca.markets). The rule this repository keeps is that
 * `netlify/functions/alpaca.mjs` speaks to exactly one host, because its
 * `X-OSL-Paper-Endpoint` response header is what `src/riskGate.js` checks to
 * VERIFY paper mode. Nothing here touches that: this function is GET-only,
 * places no order, reads no account endpoint, and returns no paper header for
 * anything to trust. It is a read-only measurement, and it stays one.
 *
 * The universe measured is deliberately the SAME universe the app builds in:
 * the strike band and the expiry ceiling below match `chainAlpaca.mjs`, so the
 * distribution reported here is the distribution the floor is applied to.
 */
import { BASKET } from "../../src/basket.js";
import { MAX_DTE } from "../../src/chain.js";
import { RULES, quantile, knownCounts } from "../../src/rules.js";

const TRADING = "https://paper-api.alpaca.markets";
const DATA = "https://data.alpaca.markets";

const STRIKE_BAND = 0.45;   // +/-45% of spot — the same band chainAlpaca asks for
const PAGE = 10000;         // Alpaca's own maximum on /v2/options/contracts
const MAX_PAGES = 2;
const UPSTREAM_MS = 8000;   // abort before Netlify's own timeout, so we can answer

const headers = (key, secret) => ({
  "APCA-API-KEY-ID": key,
  "APCA-API-SECRET-KEY": secret,
  Accept: "application/json",
});

async function get(url, h, signal) {
  const r = await fetch(url, { headers: h, signal });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    // The upstream message can name the plan or the subscription. It never
    // contains the key, and it is the single most useful thing to see when this
    // fails on someone else's account.
    throw new Error(`upstream ${r.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
  }
  return r.json();
}

/** The last trade for each underlying, so "near the money" means something. */
async function fetchSpots(syms, h, signal) {
  try {
    const j = await get(`${DATA}/v2/stocks/trades/latest?symbols=${syms.join(",")}`, h, signal);
    const out = {};
    for (const s of syms) {
      const p = j?.trades?.[s]?.p;
      if (p > 0) out[s] = p;
    }
    return out;
  } catch {
    // A missing spot costs the near-the-money split and nothing else. The
    // whole-chain distribution is still worth reading, so this never throws.
    return {};
  }
}

/** Every active contract on one underlying, inside the band the app builds in. */
async function fetchContracts(sym, spot, h, signal) {
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const q = [
    `underlying_symbols=${encodeURIComponent(sym)}`,
    "status=active",
    `limit=${PAGE}`,
    `expiration_date_gte=${iso(today)}`,
    `expiration_date_lte=${iso(new Date(today.getTime() + MAX_DTE * 86400000))}`,
  ];
  if (spot > 0) {
    q.push(`strike_price_gte=${(spot * (1 - STRIKE_BAND)).toFixed(2)}`);
    q.push(`strike_price_lte=${(spot * (1 + STRIKE_BAND)).toFixed(2)}`);
  }
  const out = [];
  let token = null, pages = 0;
  do {
    const url = `${TRADING}/v2/options/contracts?${q.join("&")}${token ? `&page_token=${encodeURIComponent(token)}` : ""}`;
    const j = await get(url, h, signal);
    for (const c of j?.option_contracts || []) out.push(c);
    token = j?.next_page_token || null;
    pages++;
  } while (token && pages < MAX_PAGES);
  return { contracts: out, pages, truncated: !!token };
}

/**
 * The distribution of a set of counts. `quantile` is imported from rules.js
 * rather than written again here, so the numbers in this report and the
 * threshold the app applies are computed by one function.
 */
export function distribution(counts) {
  const s = knownCounts(counts);
  if (!s.length) return null;
  return {
    n: s.length,
    min: s[0],
    q1: quantile(s, 0.25),
    median: quantile(s, 0.5),
    q3: quantile(s, 0.75),
    p90: quantile(s, 0.9),
    max: s[s.length - 1],
    // What the two halves of the current floor would ask of this set — the
    // whole point of the reading.
    atFloorPercentile: quantile(s, RULES.liquidityPercentile),
    clearingAbsolute: s.filter((x) => x >= RULES.minOpenInterestAbsolute).length,
  };
}

/** One market, reduced to counts. No contract survives this function. */
export function summarise(sym, spot, contracts, nearPct) {
  const byExp = new Map();
  const allOI = [], nearOI = [];
  const strikesAll = new Set();
  let reporting = 0, asOf = null;

  for (const c of contracts) {
    const exp = c?.expiration_date;
    const strike = Number(c?.strike_price);
    if (!exp || !Number.isFinite(strike)) continue;
    // Alpaca sends open_interest as a STRING, and absent when it has none.
    const raw = c?.open_interest;
    const oi = raw == null || raw === "" ? null : Number(raw);
    const known = Number.isFinite(oi);
    if (known) reporting++;
    if (c?.open_interest_date && (!asOf || c.open_interest_date > asOf)) asOf = c.open_interest_date;

    strikesAll.add(strike);
    if (known) allOI.push(oi);
    const near = spot > 0 && Math.abs(strike - spot) <= spot * nearPct;
    if (known && near) nearOI.push(oi);

    if (!byExp.has(exp)) byExp.set(exp, { contracts: 0, reporting: 0, strikes: new Set(), oi: [], nearOi: [] });
    const e = byExp.get(exp);
    e.contracts++;
    e.strikes.add(strike);
    if (known) { e.reporting++; e.oi.push(oi); if (near) e.nearOi.push(oi); }
  }

  const dteOf = (exp) => Math.round((new Date(`${exp}T00:00:00Z`) - Date.now()) / 86400000);
  const expiries = [...byExp.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([exp, e]) => ({
      expiry: exp,
      dte: dteOf(exp),
      contracts: e.contracts,
      strikes: e.strikes.size,
      reportingOpenInterest: e.reporting,
      openInterest: distribution(e.oi),
      nearTheMoney: distribution(e.nearOi),
    }));

  return {
    market: sym,
    spot: spot > 0 ? Number(spot.toFixed(4)) : null,
    openInterestAsOf: asOf,
    contracts: contracts.length,
    strikes: strikesAll.size,
    reportingOpenInterest: reporting,
    expiries: expiries.length,
    wholeChain: distribution(allOI),
    nearTheMoney: distribution(nearOI),
    byExpiry: expiries,
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const asked = (url.searchParams.get("sym") || "")
    .toUpperCase().split(",").map((x) => x.replace(/[^A-Z]/g, "")).filter(Boolean);
  const syms = asked.length ? asked : BASKET;
  const nearPct = Math.min(0.5, Math.max(0.01, Number(url.searchParams.get("near") || 10) / 100));

  const key = Netlify.env.get("ALPACA_KEY");
  const secret = Netlify.env.get("ALPACA_SECRET");
  if (!key || !secret) {
    return Response.json({ error: "server not configured: set ALPACA_KEY / ALPACA_SECRET in the Netlify environment" }, { status: 503 });
  }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_MS);
  try {
    const h = headers(key, secret);
    const spots = await fetchSpots(syms, h, ctl.signal);

    // One market failing must not cost the other four: each carries its own
    // error, and a partial reading is still a reading.
    const markets = await Promise.all(syms.map(async (sym) => {
      try {
        const { contracts, pages, truncated } = await fetchContracts(sym, spots[sym] || 0, h, ctl.signal);
        return { ...summarise(sym, spots[sym] || 0, contracts, nearPct), pages, truncated };
      } catch (e) {
        return { market: sym, error: String(e?.message || e) };
      }
    }));

    return Response.json({
      generated: new Date().toISOString(),
      what: "Aggregate open-interest statistics only. No credentials, no account data, no contract-level rows. " +
        "Open interest is the previous session's close as reported by the broker's contract list, not a live count.",
      universe: {
        strikeBand: `+/-${Math.round(STRIKE_BAND * 100)}% of spot`,
        maxDTE: MAX_DTE,
        nearTheMoney: `+/-${Math.round(nearPct * 100)}% of spot`,
        note: "The same band and ceiling the app's own chain request uses, so this is the distribution the floor is actually applied to.",
      },
      floorUnderTest: {
        liquidityPercentile: RULES.liquidityPercentile,
        minOpenInterestAbsolute: RULES.minOpenInterestAbsolute,
        minPeersForPercentile: RULES.minPeersForPercentile,
        status: "Measured from this endpoint's own reading of the 2026-09-01 close (see src/rules.js). " +
          "Re-run it to check them against a later market: open interest moves with the expiry cycle.",
        howToRead: "Per expiry, `openInterest.atFloorPercentile` is what the relative half of the floor would demand " +
          "there, and `clearingAbsolute` is how many contracts clear the absolute minimum. Where atFloorPercentile " +
          "sits well above the absolute minimum near the money, the relative half is doing the work and the " +
          "absolute one is only catching dead chains — which is the intended shape.",
      },
      markets,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const aborted = e?.name === "AbortError";
    return Response.json({ error: aborted ? "upstream timeout" : String(e?.message || e) }, { status: 502 });
  } finally {
    clearTimeout(timer);
  }
};
