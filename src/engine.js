// Shared math engine — Black-Scholes, payoff, probability of profit, exit simulator,
// seasonal tables. Plain JS, no React imports. Imported by both the client (App.jsx,
// pro.jsx) and the Netlify functions (autopilot.mjs). Never duplicate this math —
// see CLAUDE.md.

export const erf = (x) => {
  const s = x < 0 ? -1 : 1; x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  return s * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x));
};

export const N = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

export function bs(S, K, T, iv, type) {
  if (T <= 0 || iv <= 0) return type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
  const d1 = (Math.log(S / K) + (0.045 + 0.5 * iv * iv) * T) / (iv * Math.sqrt(T));
  const d2 = d1 - iv * Math.sqrt(T);
  return type === "call" ? S * N(d1) - K * Math.exp(-0.045 * T) * N(d2) : K * Math.exp(-0.045 * T) * N(-d2) - S * N(-d1);
}

export const smile = (b, S, K) => b * (1 + 0.6 * Math.abs(Math.log(K / S)));

export const netBS = (legs, S, dte, iv) => legs.reduce((a, l) => a + Math.sign(l.side) * l.qty * bs(S, l.strike, dte / 365, smile(iv, S, l.strike), l.type), 0);

export const payoff = (legs, S) => legs.reduce((a, l) => a + Math.sign(l.side) * l.qty * (l.type === "call" ? Math.max(S - l.strike, 0) : Math.max(l.strike - S, 0)), 0);

/* ============================================================================
   ONE CHANCE, ONE ARITHMETIC — AND THE MONTE CARLO IS THE ONE.

   WHAT WAS HERE, AND WHY IT IS GONE. `probProfit(legs, entry, S, iv, dte)`
   integrated the expiry payoff against a lognormal with a RISK-NEUTRAL drift of
   0.045 — the same 4.5% that discounts an option in `bs()` above. It was one of
   FOUR calculations this app called "the chance of profit", and the real
   difference between them was never the algorithm, it was the drift:

     · `montecarlo()` in App.jsx   8,000 unseeded runs, drift from the app's own
                                   seasonal monthly means
     · `probProfit()` here         closed form, risk-neutral drift 0.045
     · `probProfit()` in pro.jsx   a second closed form, same risk-neutral drift
     · `chanceInProfit()`          band integration, `driftAnnual` defaulting to 0

   Three drifts, one question. The owner's decision is that the Monte Carlo is
   the single truth, so the two closed forms are deleted rather than kept as a
   faster approximation — a screen that prints one of them prints a different
   number for the same trade, which is the fault this whole file exists to make
   impossible.

   AND IT IS SEEDED. An unseeded Monte Carlo gives each caller a different
   answer for the same position, which is two screens disagreeing about one
   object engineered in on purpose. `terminalMC` takes a seed and has no default
   for it; `chanceOf()` in rules.js derives one from the position itself, so the
   Radar, the Shortlist, Build, the Guardian and the autopilot all land on the
   same stream of numbers for the same trade.

   THE POLICY IS THE CALLER'S AND HAS NO DEFAULT, for the same reason `exitSim`
   below has none: this file imports nothing and `rules.js` imports it, so
   reading RULES here would be a cycle — and a default is how a stale number
   comes back silently in a year.
============================================================================ */

/**
 * A 32-bit seed from any string. FNV-1a: small, deterministic, and the same in
 * the browser and in a Netlify function, which is the whole requirement.
 */
export function seedFrom(key) {
  let h = 0x811c9dc5;
  const str = String(key);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 — a deterministic generator in place of `Math.random`. Thirty-two
 * bits of state, uniform on [0, 1), and it is not cryptographic and does not
 * need to be: what is being asked of it is that two callers holding the same
 * seed walk the same path.
 */
export function rng(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * THE APP'S OWN THESIS AS A DRIFT. The seasonal monthly means over the window
 * the trade is actually held for, averaged and annualised — the same arithmetic
 * `montecarlo()` in App.jsx used, moved here so the client and the server
 * cannot derive it two ways.
 *
 * @param monthlyMean  twelve monthly means in PERCENT, as `SEASONAL` holds them
 * @param month        the month the trade opens in, 0-11
 * @param dte          days to expiry
 * @returns the annualised drift as a fraction, or null when unreadable
 */
export function seasonalDrift(monthlyMean, month, dte) {
  if (!Array.isArray(monthlyMean) || monthlyMean.length !== 12) return null;
  if (!Number.isFinite(month) || !Number.isFinite(dte) || dte <= 0) return null;
  const span = Math.max(1, Math.round(dte / 30));
  let mu = 0;
  for (let i = 0; i < span; i++) {
    const v = monthlyMean[(((month + i) % 12) + 12) % 12];
    if (!Number.isFinite(v)) return null;
    mu += v / 100;
  }
  return (mu / span) * 12;
}

/**
 * THE ONE CHANCE. Where the price finishes at expiry, under a lognormal with
 * the caller's drift and the caller's volatility, and what the payoff is worth
 * there. Everything a screen or a brief prints as "the chance of profit", "the
 * average result" or the distribution behind them comes out of this function.
 *
 * @param legs      [{ side, type, strike, qty }]
 * @param entryNet  what the structure cost per share (negative for a credit)
 * @param S         today's price
 * @param policy    { driftAnnual, sigma, dte, runs, seed } — NO DEFAULTS
 * @returns { pop, ev, p5, p50, p95, bins, runs, driftAnnual, sigma, dte, seed }
 *          with `ev`, `p5`, `p50` and `p95` in DOLLARS per combination.
 */
export function terminalMC(legs, entryNet, S, policy) {
  const { driftAnnual, sigma, dte, runs, seed } = policy || {};
  const finite = (x) => Number.isFinite(x);
  if (![driftAnnual, sigma, dte, runs, seed].every(finite) || !Array.isArray(legs) || !finite(entryNet)) {
    throw new TypeError(
      "terminalMC needs { driftAnnual, sigma, dte, runs, seed } and finite legs/entryNet: see chanceOf() in src/rules.js",
    );
  }
  if (!(S > 0) || !(sigma > 0) || !(dte > 0) || !(runs >= 1)) {
    throw new RangeError("terminalMC needs a positive spot, volatility, horizon and run count");
  }
  const n = Math.round(runs);
  const Tyr = dte / 365;
  const next = rng(seed);
  const pnls = new Float64Array(n);
  let wins = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    const ST = S * Math.exp((driftAnnual - 0.5 * sigma * sigma) * Tyr + sigma * Math.sqrt(Tyr) * z);
    // A P&L of exactly zero is not a profit: you got your money back. The same
    // convention `payoffBands()` and `analyze()` use, so the chance and the
    // green on the chart cannot disagree about where the line is.
    const pnl = (payoff(legs, ST) - entryNet) * 100;
    pnls[i] = pnl; sum += pnl; if (pnl > 0) wins++;
  }
  const sorted = Array.from(pnls).sort((a, b) => a - b);
  const qq = (q) => sorted[Math.floor(q * (n - 1))];
  const lo = qq(0.01), hi = qq(0.99), B = 30;
  const span = hi - lo;
  const bins = Array.from({ length: B }, (_, i) => ({ x: +(lo + ((i + 0.5) / B) * span).toFixed(0), n: 0 }));
  for (const p of pnls) {
    const idx = span > 0 ? Math.min(B - 1, Math.max(0, Math.floor(((p - lo) / span) * B))) : 0;
    bins[idx].n++;
  }
  return { pop: wins / n, ev: sum / n, p5: qq(0.05), p50: qq(0.5), p95: qq(0.95),
    bins, runs: n, driftAnnual, sigma, dte, seed };
}

/**
 * THE EXIT SIMULATOR — and the exit policy is the CALLER'S, never this file's.
 *
 * THE FAULT THIS SIGNATURE EXISTS TO MAKE IMPOSSIBLE. This function used to
 * open with
 *
 *     const tp = Number.isFinite(pos.maxProfit) ? 0.5 * pos.maxProfit : null;
 *     const sl = 0.5 * pos.maxLoss, days = Math.max(1, dteLeft - 7);
 *
 * and mark the survivors with `netBS(pos.legs, s, 7, iv)`. Four copies of three
 * rules that have a home in `src/rules.js`: `takeProfitPct` (0.5),
 * `stopLossPct` (0.5) and `exitDTE` — which is **21**, and has been since it
 * was CHANGED FROM 7 (PRD §4). So the simulator walked the position to 7 days
 * and marked whatever survived at 7 days, while the app's own rule closes or
 * rolls it at 21. `autopilot.mjs` then handed the result to the model in a
 * field called `p_exit_at_exit_dte_positive`: the NAME asserted the rule the
 * arithmetic had not applied, and the model wrote prose on top of it.
 *
 * WHY THE POLICY IS AN ARGUMENT AND NOT AN IMPORT. `engine.js` imports nothing,
 * and `rules.js` imports `engine.js` — a leaf-ward import, stated as such in
 * `rules.js`. Reading `RULES` from here would turn that into a cycle. So the
 * policy comes from the caller, which already reads the home.
 *
 * AND IT HAS NO DEFAULT, DELIBERATELY. A default is how the bare 7 comes back,
 * silently, in a year: a new call site that forgets the argument gets the
 * number this file happens to hold rather than the number the app applies.
 * A missing or unreadable policy THROWS.
 *
 * @param policy  { exitDTE, takeProfitPct, stopLossPct } — from `RULES`.
 */
export function exitSim(pos, S, dteLeft, iv, sigma, policy, n = 1500) {
  const { exitDTE, takeProfitPct, stopLossPct } = policy || {};
  if (![exitDTE, takeProfitPct, stopLossPct].every((x) => Number.isFinite(x))) {
    throw new TypeError(
      "exitSim needs the exit policy from RULES: { exitDTE, takeProfitPct, stopLossPct }",
    );
  }
  // `takeProfitPct * null` is 0 in JavaScript. A position with no ceiling on
  // its profit has no take-profit level (src/rules.js, `payoffCeiling`), and
  // without this guard every path that touched break-even would be counted as
  // one — the simulator reporting a rule the app does not apply.
  const tp = Number.isFinite(pos.maxProfit) ? takeProfitPct * pos.maxProfit : null;
  const sl = stopLossPct * pos.maxLoss;
  // The window is what is left BEFORE the exit rule ends the trade, so the
  // last day simulated is the day the rule acts.
  const days = Math.max(1, dteLeft - exitDTE);
  let nTP = 0, nSL = 0, nPos = 0, sum = 0; const tds = [];
  for (let i = 0; i < n; i++) {
    let s = S, done = false;
    for (let d = 1; d <= days; d++) {
      let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
      s *= Math.exp(-0.5 * sigma * sigma / 365 + sigma * Math.sqrt(1 / 365) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
      const pnl = (netBS(pos.legs, s, dteLeft - d, iv) - pos.entryNet) * 100;
      if (tp != null && pnl >= tp) { nTP++; tds.push(d); sum += pnl; done = true; break; }
      if (pnl <= sl) { nSL++; sum += pnl; done = true; break; }
    }
    // WHAT SURVIVES IS MARKED WHERE THE RULE ENDS IT, which is the same number
    // the walk above stopped at. These two were 7 and 7 while the rule said 21.
    if (!done) { const pnl = (netBS(pos.legs, s, exitDTE, iv) - pos.entryNet) * 100; if (pnl > 0) nPos++; sum += pnl; }
  }
  tds.sort((a, b) => a - b);
  return { pTP: nTP / n, pSL: nSL / n, pTimePos: nPos / n, ev: sum / n, medDays: tds.length ? tds[(tds.length / 2) | 0] : null, horizon: days, exitDTE };
}

export const SEASONAL = {
  SOYB: [-0.5, -0.3, 0.2, 0.4, 0.5, 1.2, 1.8, 1.1, -0.6, -0.8, -0.4, -0.2], CORN: [-0.6, -0.4, 0.1, 0.3, 0.9, 1.5, 1.3, -0.9, -1.1, -0.5, -0.3, -0.2],
  UNG: [2.1, 1.4, -1.8, -2.5, -1.2, -0.4, 0.3, 0.5, 0.8, 1.6, 2.4, 2.2], BOIL: [4.0, 2.6, -3.8, -5.2, -2.6, -1.0, 0.4, 0.8, 1.4, 3.0, 4.6, 4.2],
  WEAT: [-0.3, 0.1, 0.8, 1.1, 0.9, -0.4, -0.8, -0.6, -0.4, -0.2, 0.0, -0.1], SPY: [0.9, 0.2, 0.8, 1.2, 0.6, 0.5, 1.3, 0.1, -0.7, 0.8, 1.6, 1.1],
};

export const SIGMA = { SOYB: 0.19, CORN: 0.22, UNG: 0.48, BOIL: 0.95, WEAT: 0.25, SPY: 0.16 };

/* ============================================================================
   THE MEASURED SEASONAL SERIES — ONE PARSE, READ BY THE CLIENT AND THE SERVER.

   `SEASONAL` above is hand-written and wrong on eight months of twelve for
   CORN. The measured means that replace it arrive as an Alpha Vantage
   `TIME_SERIES_MONTHLY_ADJUSTED` body, through `/api/av`, and the SAME body is
   what `netlify/functions/av.mjs` caches in the blob store. Two consumers read
   it: the client, which puts the means on screen and drifts every chance on
   them, and `autopilot.mjs`, which writes the brief while the app is closed.

   These two functions used to live in App.jsx, which a Netlify function cannot
   import (React, recharts, lightweight-charts). That is exactly the shape of
   duplication this file exists to prevent: two parses of one payload are two
   seasonal tables waiting to disagree about one market. They are plain data
   arithmetic, they read no RULES and import nothing, so they belong here beside
   `SEASONAL` and `seasonalDrift()`.
============================================================================ */

/**
 * An Alpha Vantage monthly body → a year-by-month matrix of percentage returns.
 *
 * The ten-year cutoff lands MID-YEAR, so the matrix carries eleven CALENDAR
 * rows of which the first and last are partial. `statsFromMatrix().years` is
 * the row count and is the only figure any screen may print about it.
 *
 * @throws when the body is a refusal rather than a series — Alpha Vantage
 *         answers a quota refusal with HTTP 200 and a "Note" body, so the
 *         failure has to be read out of the payload, never the status.
 */
export function parseAvJson(j) {
  const ts = j && j["Monthly Adjusted Time Series"];
  if (!ts) throw new Error((j && (j["Note"] || j["Information"] || j["Error Message"])) || "risposta vuota (rate limit?)");
  const rows = Object.entries(ts)
    .map(([date, v]) => ({ date, close: parseFloat(v["5. adjusted close"]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = new Date(); cutoff.setFullYear(cutoff.getFullYear() - 10);
  const recent = rows.filter((r2) => new Date(r2.date) >= cutoff);
  const byYM = {};
  for (let i = 1; i < recent.length; i++) {
    const d = new Date(recent[i].date);
    if (!byYM[d.getFullYear()]) byYM[d.getFullYear()] = Array(12).fill(null);
    byYM[d.getFullYear()][d.getMonth()] = (recent[i].close / recent[i - 1].close - 1) * 100;
  }
  const matrix = Object.entries(byYM).map(([y, ms]) => [+y, ...ms]);
  return { matrix, from: recent[0]?.date };
}

/**
 * The matrix → twelve monthly means in PERCENT (the units `SEASONAL` is in and
 * `seasonalDrift()` expects), the annualised realised sigma of the same series,
 * and how many rows produced them.
 */
export function statsFromMatrix(matrix) {
  const all = [];
  const monthlyMean = Array.from({ length: 12 }, (_, m) => {
    const xs = matrix.map((row) => row[m + 1]).filter((x) => x != null && !Number.isNaN(x));
    xs.forEach((x) => all.push(x / 100));
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  });
  const mean = all.reduce((a, b) => a + b, 0) / Math.max(1, all.length);
  const varr = all.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, all.length - 1);
  return { monthlyMean, sigma: Math.sqrt(varr * 12), years: matrix.length };
}
