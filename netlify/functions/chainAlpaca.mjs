/* ============================== OPTION CHAIN FROM ALPACA ==============================
 *
 * The app sends its orders to Alpaca. This endpoint reads its PRICES from the
 * same broker, so the number on the confirm screen and the number the order
 * meets are quoted by the same book.
 *
 * WHY THIS IS A SEPARATE FUNCTION FROM `alpaca.mjs`, AND MUST STAY ONE.
 * `alpaca.mjs` talks only to paper-api.alpaca.markets and says so in the
 * X-OSL-Paper-Endpoint response header — that header is how src/riskGate.js
 * VERIFIES (rather than assumes) that an order is going to the paper account.
 * Market data lives on a different host, data.alpaca.markets, and it neither
 * places orders nor knows anything about an account. Routing it through the
 * order proxy would mean that proxy no longer speaks to exactly one host, and
 * the paper verification would become a claim instead of a fact. So: two
 * functions, one host each. This one CANNOT reach the trading API.
 *
 * WHAT COMES BACK: the normalised chain, identical in shape to the CBOE path
 * (src/chain.js), so the client can swap sources with no downstream change.
 *
 * THE FEED IS INDICATIVE, NOT OPRA. Alpaca's Basic plan serves a calculated
 * feed, not the consolidated real-time tape, and the source string says
 * "Alpaca (indicative)" on every screen that shows it. Set ALPACA_OPTIONS_FEED
 * to "opra" only with a subscription that actually provides it; the label then
 * changes with the data, so the app never claims a feed it did not read.
 *
 * Keys are read here and only here (ALPACA_KEY / ALPACA_SECRET). Nothing
 * derived from them, and no broker URL, is in the response.
 *
 * Verified against Alpaca's own SDK (alpaca-py 0.44.0):
 *   GET /v1beta1/options/snapshots/{underlying}
 *       ?feed&type&strike_price_gte&strike_price_lte
 *       &expiration_date_gte&expiration_date_lte&limit&page_token
 *   → { snapshots: { "<OCC>": { latestQuote{bp,ap,bs,as,t}, latestTrade{p,s,t},
 *                               greeks{delta,gamma,rho,theta,vega},
 *                               impliedVolatility } },
 *       next_page_token }
 *   GET /v2/stocks/trades/latest?symbols=UNG → { trades: { UNG: { p, t } } }
 */
import { normaliseAlpacaChain, MAX_DTE } from "../../src/chain.js";

const DATA = "https://data.alpaca.markets";

/* How much of the chain to ask for.
 * The whole board for a liquid ETF is thousands of contracts and this function
 * has ten seconds to live. The app only ever builds spreads around the money,
 * so the strikes far from spot are payload we would parse and never read.
 * The expiry ceiling is the same 400 days the CBOE parser keeps. */
const STRIKE_BAND = 0.45;   // ±45% of spot
const PAGE = 1000;          // Alpaca's own maximum
const MAX_PAGES = 4;        // 4000 contracts is far more than any of these ETFs list
const UPSTREAM_MS = 7000;   // abort before Netlify's own timeout, so we can answer

/** Log the shape of what actually came back — once per cold start, not per call. */
let shapeLogged = false;
function logShape(sym, payload, pages) {
  if (shapeLogged) return;
  shapeLogged = true;
  const snaps = payload?.snapshots || {};
  const [firstKey] = Object.keys(snaps);
  const first = firstKey ? snaps[firstKey] : null;
  console.log("[chainAlpaca] raw payload shape", JSON.stringify({
    sym,
    topLevelKeys: Object.keys(payload || {}),
    contracts: Object.keys(snaps).length,
    pages,
    sampleSymbol: firstKey || null,
    sampleKeys: first ? Object.keys(first) : [],
    sample: first || null,
  }));
}

const headers = (key, secret) => ({
  "APCA-API-KEY-ID": key,
  "APCA-API-SECRET-KEY": secret,
  "Accept": "application/json",
});

/** One upstream GET, with its own abort so a hung broker cannot hold the function. */
async function get(url, h, signal) {
  const r = await fetch(url, { headers: h, signal });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    // The upstream message can name the plan or the subscription; it never
    // contains the key, and it is the single most useful thing to see when
    // this fails on someone else's account.
    throw new Error(`upstream ${r.status}${body ? `: ${body.slice(0, 300)}` : ""}`);
  }
  return r.json();
}

/** The underlying's own last price. No spot, no chain: every zone is drawn off it. */
async function fetchSpot(sym, h, signal) {
  const j = await get(`${DATA}/v2/stocks/trades/latest?symbols=${encodeURIComponent(sym)}`, h, signal);
  const px = j?.trades?.[sym]?.p;
  if (!(px > 0)) throw new Error("no last trade for the underlying");
  return px;
}

/** Every snapshot page, merged, filtered to the strikes and expiries we use. */
async function fetchSnapshots(sym, spot, feed, h, signal) {
  const lo = Math.max(0, spot * (1 - STRIKE_BAND));
  const hi = spot * (1 + STRIKE_BAND);
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const until = new Date(today.getTime() + MAX_DTE * 86400000);

  const base = new URLSearchParams({
    feed,
    limit: String(PAGE),
    strike_price_gte: lo.toFixed(2),
    strike_price_lte: hi.toFixed(2),
    expiration_date_gte: iso(today),
    expiration_date_lte: iso(until),
  });

  const snapshots = {};
  let token = null, pages = 0;
  do {
    const q = new URLSearchParams(base);
    if (token) q.set("page_token", token);
    const j = await get(`${DATA}/v1beta1/options/snapshots/${encodeURIComponent(sym)}?${q}`, h, signal);
    Object.assign(snapshots, j?.snapshots || {});
    token = j?.next_page_token || null;
    pages++;
  } while (token && pages < MAX_PAGES);

  return { payload: { snapshots }, pages, truncated: !!token };
}

/** What the ?debug=1 report answers: are the greeks actually there, or null? */
function coverage(chain) {
  let n = 0, iv = 0, delta = 0, theta = 0, quoted = 0;
  for (const e of chain.expirations) {
    for (const side of ["calls", "puts"]) {
      for (const c of Object.values(chain.byExp[e][side])) {
        n++;
        if (c.iv != null) iv++;
        if (c.delta != null) delta++;
        if (c.theta != null) theta++;
        if (c.mid != null) quoted++;
      }
    }
  }
  return { contracts: n, withIV: iv, withDelta: delta, withTheta: theta, withPrice: quoted };
}

export default async (req) => {
  const url = new URL(req.url);
  const sym = (url.searchParams.get("sym") || "").toUpperCase().replace(/[^A-Z]/g, "");
  if (!sym) return Response.json({ error: "missing sym" }, { status: 400 });

  const key = Netlify.env.get("ALPACA_KEY");
  const secret = Netlify.env.get("ALPACA_SECRET");
  if (!key || !secret) {
    // Not an error the user should ever see: the client falls back to CBOE.
    return Response.json({ error: "server non configurato: ALPACA_KEY/ALPACA_SECRET" }, { status: 503 });
  }
  const feed = (Netlify.env.get("ALPACA_OPTIONS_FEED") || "indicative").toLowerCase() === "opra"
    ? "opra" : "indicative";

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_MS);
  try {
    const h = headers(key, secret);
    const spot = await fetchSpot(sym, h, ctl.signal);
    const { payload, pages, truncated } = await fetchSnapshots(sym, spot, feed, h, ctl.signal);
    logShape(sym, payload, pages);

    const chain = normaliseAlpacaChain(sym, payload, { spot, feed });

    if (url.searchParams.get("debug")) {
      // A shape report, not the chain: what came back, and whether the greeks
      // are really populated on this plan. No key, no upstream URL, no account.
      const mid = chain.expirations.reduce((b, e) =>
        Math.abs(chain.byExp[e].dte - 45) < Math.abs(chain.byExp[b].dte - 45) ? e : b, chain.expirations[0]);
      const strikesAt = (e) => new Set([
        ...Object.keys(chain.byExp[e].calls), ...Object.keys(chain.byExp[e].puts),
      ].map(Number));
      const sampleK = [...strikesAt(mid)].sort((a, b) => Math.abs(a - spot) - Math.abs(b - spot))[0];
      return Response.json({
        sym, feed, source: chain.source, spot, pages, truncated,
        expirations: chain.expirations.length,
        expiryDTEs: chain.expirations.map((e) => chain.byExp[e].dte),
        nearest45: { exp: mid, dte: chain.byExp[mid].dte, strikes: strikesAt(mid).size },
        sampleContract: chain.byExp[mid].calls[sampleK] || chain.byExp[mid].puts[sampleK] || null,
        coverage: coverage(chain),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return new Response(JSON.stringify(chain), {
      status: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  } catch (e) {
    const aborted = e?.name === "AbortError";
    console.log("[chainAlpaca] failed", sym, aborted ? "upstream timeout" : String(e?.message || e));
    return Response.json(
      { error: aborted ? "alpaca timeout" : String(e?.message || e) },
      { status: 502 },
    );
  } finally {
    clearTimeout(timer);
  }
};
