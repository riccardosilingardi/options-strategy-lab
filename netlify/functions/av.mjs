// ============================================================================
// Alpha Vantage monthly price history — THE SOURCE OF THE SEASONAL TABLE.
//
// WHY THIS IS CACHED, AND IN DAYS.
//
// `SEASONAL` in src/engine.js is hand-written and carries 30% of the four-factor
// score, the heaviest weight of the four. Measured against 195 months of real
// Alpha Vantage data for CORN it has the WRONG SIGN on EIGHT months of twelve:
// June reads +1.5 in the table against a real ten-year mean of -3.46, and
// September reads -1.1 against a real +1.03 — so the Radar has been calling CORN
// bearish in a month that is historically positive. The fix is to score on this
// endpoint's data instead, which means every market in the basket has to load
// it, not just whichever one the user pressed a button on.
//
// That makes the quota the constraint. Alpha Vantage's free tier allows 25
// requests A DAY, and the basket is five markets: refetching per tab switch
// would exhaust the day's allowance during a demo and leave every market on the
// wrong hand-written table. So:
//
//   - The answer is cached SERVER-SIDE, in the blob store the autopilot already
//     uses, with a TTL measured in DAYS. Monthly data changes once a month; a
//     TTL in minutes would be pretending it changes faster than it does.
//   - A STALE ENTRY IS SERVED WHEN THE UPSTREAM CALL FAILS. Alpha Vantage
//     answers a quota refusal with HTTP 200 and a "Note"/"Information" body, so
//     the failure has to be read out of the payload rather than the status. Six
//     weeks of month-old seasonality beats today's hand-written wrong sign.
//   - Every response says WHERE IT CAME FROM and HOW OLD IT IS, in
//     `_osl` — the client puts that on screen. A market on the fallback table
//     must be able to say WHY, and "the call failed" and "nobody has asked yet"
//     are different sentences.
//
// The upstream body is passed through UNCHANGED apart from that one added key,
// so `parseAvJson()` on the client keeps working exactly as it did.
// ============================================================================
import { getStore } from "@netlify/blobs";

/** Monthly data changes once a month. A week is well inside that and well
 *  outside the 25-a-day quota: five markets refresh at most five times a week. */
const TTL_DAYS = 7;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

/**
 * Alpha Vantage refuses with HTTP 200. A quota refusal, a bad key and an
 * unknown symbol all arrive as a normal response whose body is a note, so the
 * only way to tell a real series from a refusal is to look for the series.
 */
const seriesOf = (j) => (j && typeof j === "object") ? j["Monthly Adjusted Time Series"] : null;
const refusalOf = (j) => (j && typeof j === "object")
  ? (j["Note"] || j["Information"] || j["Error Message"] || null) : null;

export default async (req) => {
  const sym = (() => {
    try { return (new URL(req.url).searchParams.get("sym") || "").toUpperCase().replace(/[^A-Z]/g, ""); }
    catch { return ""; }
  })();
  if (!sym) return Response.json({ error: "missing sym" }, { status: 400 });

  // The cache is a nice-to-have on both sides: a blob store that is not
  // configured must never stop the endpoint working, so every touch of it is
  // wrapped and a failure simply means no cache today.
  let store = null;
  try { store = getStore("autopilot"); } catch { /* no blob store: go straight upstream */ }
  const key = `av/${sym}.json`;
  let cached = null;
  try { cached = store ? await store.get(key, { type: "json" }) : null; } catch { /* treat as a miss */ }

  const ageMs = cached?.at ? Date.now() - cached.at : null;
  const fresh = cached && ageMs != null && ageMs < TTL_MS;
  const stamp = (payload, source, at) => Response.json(
    { ...payload, _osl: { source, at, ageDays: at ? Math.floor((Date.now() - at) / 86400000) : null, ttlDays: TTL_DAYS, sym } },
    { status: 200, headers: { "Cache-Control": "public, max-age=86400" } });

  if (fresh) return stamp(cached.body, "cache", cached.at);

  // `Netlify.env.get` is what every other function in this directory uses;
  // process.env is the fallback so the file is still readable outside the
  // Netlify runtime (a test, a local script) instead of throwing on the global.
  const apiKey = (typeof Netlify !== "undefined" ? Netlify.env.get("ALPHAVANTAGE_KEY") : null)
    || process.env.ALPHAVANTAGE_KEY;
  if (!apiKey) {
    // A stale answer is still an answer, and a market with real seasonality is
    // better off than one back on the hand-written table.
    if (cached) return stamp(cached.body, "cache-stale", cached.at);
    return Response.json({ error: "server not configured: set ALPHAVANTAGE_KEY" }, { status: 503 });
  }

  try {
    const r = await fetch(`https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${sym}&apikey=${apiKey}`);
    const body = await r.json();
    if (r.ok && seriesOf(body)) {
      const at = Date.now();
      try { await store?.set(key, JSON.stringify({ at, body })); } catch { /* the answer still goes out */ }
      return stamp(body, "live", at);
    }
    // A refusal, a rate limit or an unknown symbol. Serve what we have rather
    // than nothing, and SAY that is what happened.
    const why = refusalOf(body) || `Alpha Vantage returned HTTP ${r.status} with no series`;
    if (cached) return Response.json(
      { ...cached.body, _osl: { source: "cache-stale", at: cached.at, ageDays: Math.floor((Date.now() - cached.at) / 86400000), ttlDays: TTL_DAYS, sym, upstreamError: String(why) } },
      { status: 200 });
    return Response.json({ error: String(why), _osl: { source: "none", sym, upstreamError: String(why) } }, { status: 502 });
  } catch (e) {
    const why = String(e?.message || e);
    if (cached) return Response.json(
      { ...cached.body, _osl: { source: "cache-stale", at: cached.at, ageDays: Math.floor((Date.now() - cached.at) / 86400000), ttlDays: TTL_DAYS, sym, upstreamError: why } },
      { status: 200 });
    return Response.json({ error: why, _osl: { source: "none", sym, upstreamError: why } }, { status: 502 });
  }
};
