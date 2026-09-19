/* ====================================================================
   AN ALPHA VANTAGE MONTHLY BODY, IN THE SHAPE ALPHA VANTAGE RETURNS.

   WHY THIS FILE EXISTS. PR #26 moved `parseAvJson()` and
   `statsFromMatrix()` out of `App.jsx` into `engine.js` so the client and
   `autopilot.mjs` would derive the seasonal means from ONE parse of one
   body — and wrote down, in the debt it handed forward, that **no test
   exercised either function before the move and none exercised them
   after it**. The measured path has still never run: there is no
   `ALPHAVANTAGE_KEY` in this sandbox and the egress proxy refuses the
   CONNECT to alphavantage.co, so `/api/av` cannot be called here at all.

   What a fixture CAN close is the other half: that the round trip stops
   being unexercised. Two suites read this file — `engine.test.js` parses
   it directly, `autopilot.test.js` serves it out of a fake blob store —
   and a second builder in each would be two ideas of what Alpha Vantage
   returns, which is the same duplication `engine.js` exists to prevent.

   WHAT IS REAL ABOUT IT, AND WHAT IS NOT. The SHAPE is real and is the
   part under test: the `"Monthly Adjusted Time Series"` key, dates as
   `YYYY-MM-DD`, every value a STRING, `"5. adjusted close"` as the field
   `parseAvJson` reads, and the refusal bodies Alpha Vantage answers with
   HTTP 200 rather than an error status. THE PRICES ARE NOT A MARKET.
   They are generated from a seed so the numbers are reproducible, and
   nothing derived from them may ever be quoted as a measurement of any
   ticker — see PRD §4k, which labels every figure taken from this file
   as a SENSITIVITY and never as a reading.
==================================================================== */

/** Deterministic, tiny, and the same everywhere: mulberry32, as in engine.js. */
function gen(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The last calendar day Alpha Vantage stamps a monthly row with. */
const lastDay = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/**
 * @param months    how many monthly rows, oldest to newest
 * @param endYear   the calendar year the newest row falls in
 * @param endMonth  the month the newest row falls in, 0-11
 * @param seed      which reproducible walk of prices to build
 * @param drift     a per-month log drift, so a caller can build a series
 *                  whose statistics it knows the sign of
 * @param vol       a per-month log standard deviation, likewise
 * @returns the body `/api/av` passes through, ready for `parseAvJson()`
 */
export function avMonthlyBody({ months = 132, endYear = 2026, endMonth = 8,
  seed = 1, drift = 0, vol = 0.06 } = {}) {
  const next = gen(seed);
  const series = {};
  let price = 20;
  for (let i = months - 1; i >= 0; i--) {
    const total = endYear * 12 + endMonth - i;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    price *= Math.exp(drift + vol * z);
    const day = String(lastDay(y, m)).padStart(2, "0");
    // EVERY VALUE IS A STRING, as Alpha Vantage sends them. `parseFloat` on
    // the client is not a formality: a fixture with numbers in it would let a
    // parse that never called `parseFloat` pass this test.
    series[`${y}-${String(m + 1).padStart(2, "0")}-${day}`] = {
      "1. open": price.toFixed(4),
      "2. high": (price * 1.02).toFixed(4),
      "3. low": (price * 0.98).toFixed(4),
      "4. close": price.toFixed(4),
      "5. adjusted close": price.toFixed(4),
      "6. volume": "1000000",
      "7. dividend amount": "0.0000",
    };
  }
  return {
    "Meta Data": {
      "1. Information": "Monthly Adjusted Prices and Volumes",
      "2. Symbol": "TEST",
      "3. Last Refreshed": Object.keys(series).slice(-1)[0],
      "4. Time Zone": "US/Eastern",
    },
    "Monthly Adjusted Time Series": series,
  };
}

/**
 * THE THREE REFUSALS, ALL SERVED WITH HTTP 200. A quota refusal, a bad key
 * and an unknown symbol arrive as a normal response whose body is a note, so
 * the failure has to be read out of the payload and never off the status.
 * `av.mjs` names all three; `parseAvJson()` has to throw on all three or a
 * refusal becomes a seasonal table.
 */
export const AV_REFUSALS = {
  Note: { Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 25 requests per day." },
  Information: { Information: "The demo API key is for demo purposes only. Please claim your free API key." },
  "Error Message": { "Error Message": "Invalid API call. Please retry or visit the documentation." },
};
