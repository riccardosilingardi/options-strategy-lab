// ============================================================================
// src/impliedDist.js — THE MARKET'S OWN DISTRIBUTION, READ OFF THE OPTION PRICES (PR 67, task 67.1; owner 12 Oct 2026:
// "the market probability must be the same as IBKR's").
//
// IBKR's "Probability of profit — implied by the market" comes from a distribution built from the option prices
// themselves, strike by strike, with no view and no interest. Its production code is not public; its method is described
// on IBKR's Probability Lab page, and this is that method as the owner's prompt sets it out (the page itself could not be
// read from this sandbox: the network policy blocks interactivebrokers.com). Equality with IBKR's screen is an OWNER CHECK
// (PRD §4).
//
//   · SEGMENTS between consecutive strikes of ONE expiry — the strikes that carry a usable quote — each segment's
//     probability sitting at its midpoint. Below the lowest strike one segment from zero, its mass at ⅔ of that strike;
//     above the highest one segment whose mass sits 20% above it.
//   · OUT-OF-THE-MONEY OPTIONS ONLY: calls for strikes above the forward, puts below ("calls for high prices and puts for
//     low prices"); both at a strike equal to it. Interest is ignored, so the forward is today's price.
//   · THE PRICE IS THE MID of the bid and the ask — A CHOICE: IBKR does not say which price it reads. A quote with no bid
//     or no ask, or an ask under its bid, is not a price (unknown is never zero) and is left out.
//   · FAIR PRICING: each option's price = Σ segment probability × its payoff at the segment's midpoint; the probabilities
//     add up to 1. Solved by NON-NEGATIVE LEAST SQUARES (Lawson–Hanson's active set) with Σ = 1 held exactly
//     (`simplexLS()`), so a stale or inverted quote bends the fit instead of producing a negative probability.
//   · A STRATEGY'S MARKET CHANCE = the probability of the segments where its P&L at expiry is above zero, a segment split
//     in proportion where a breakeven falls inside it (each segment read as uniform between its edges; the tails span
//     [⅓K, K] and [K, 1.4K], so their midpoints are where their mass sits).
//
// Plain JS, imports nothing (engine.js's discipline): every threshold is the caller's. Deterministic: the same board gives
// the same numbers, on every screen.
// ============================================================================

const TAIL_LOW = 2 / 3;      // the lowest segment's mass sits at ⅔ of the lowest strike (IBKR's page, as the prompt quotes it)
const TAIL_HIGH = 1.2;       // the highest segment's mass sits 20% above the highest strike
const SMOOTH = 0.01;         // the second-difference penalty × the median strike width: the smallest measured value that tames the zig-zag (impliedDist.test.js)

/** A quote that is a price: a bid and an ask above zero, the ask at or above the bid. Its mid, or null. */
export function quoteMid(q) {
  if (!q) return null;
  const b = Number(q.bid), a = Number(q.ask);
  if (q.bid == null || q.ask == null || !Number.isFinite(b) || !Number.isFinite(a) || b <= 0 || a <= 0 || a < b) return null;
  return (a + b) / 2;
}

const payoffAt = (type, K, x) => (type === "call" ? Math.max(x - K, 0) : Math.max(K - x, 0));

/* ---- least squares on the probability simplex: x ≥ 0 and Σx = 1 (Lawson & Hanson's active set, 1974, ch. 23,
        with the sum held exactly by a Lagrange multiplier on each step) ---- */

/**
 * min ‖Ax − b‖ subject to x ≥ 0 and Σx = 1. A is m × n (array of rows). AᵀA and Aᵀb are formed once; each step solves the
 * active set's equations with the sum held exactly (a Lagrange multiplier μ: z = G⁻¹(h − μ1), 1ᵀz = 1), on a Cholesky
 * factor grown one column at a time and rebuilt only when a mass leaves the set. PR 67 measured the QR version this
 * replaced (Σ = 1 as a heavily weighted row) at 26 ms for a 60-strike board and 63 ms for 100, once per market per chain
 * load; impliedDist.test.js prints this one's. Deterministic.
 * @returns the solution, or null when there is none to find (no columns)
 */
export function simplexLS(A, b, { tol = 1e-11 } = {}) {
  const m = A.length, n = m ? A[0].length : 0;
  if (!n) return null;
  const G = Array.from({ length: n }, () => new Float64Array(n));
  const h = new Float64Array(n);
  for (let i = 0; i < m; i++) {
    const row = A[i], bi = b[i];
    for (let j = 0; j < n; j++) {
      const a = row[j];
      if (a === 0) continue;
      h[j] += a * bi;
      const Gj = G[j];
      for (let c = j; c < n; c++) if (row[c] !== 0) Gj[c] += a * row[c];
    }
  }
  for (let j = 0; j < n; j++) for (let c = 0; c < j; c++) G[j][c] = G[c][j];
  // ρ(Σx − 1)² is zero on every point with Σx = 1, so adding it changes no answer; it makes G positive definite where the
  // prices alone leave a direction free (more segments than quotes), at the matrix's own scale.
  let tr = 0; for (let j = 0; j < n; j++) tr += G[j][j];
  const rho = Math.max(1e-12, tr / n);
  for (let j = 0; j < n; j++) { h[j] += rho; for (let c = 0; c < n; c++) G[j][c] += rho; }
  const thresh = tol * Math.max(1, ...Array.from(h, Math.abs), ...G.map((r, j) => Math.abs(r[j])));

  // THE ACTIVE SET, in the order it was built, and the Cholesky factor of G on it (row r of L has r + 1 entries).
  let order = [], L = [];
  /** Add variable t to the factor: one new row, by forward substitution. False when t is dependent on the set. */
  const append = (t) => {
    const k = order.length, row = new Float64Array(k + 1);
    let d = G[t][t];
    for (let r = 0; r < k; r++) {
      let v = G[t][order[r]];
      const Lr = L[r];
      for (let q = 0; q < r; q++) v -= row[q] * Lr[q];
      row[r] = v / Lr[r];
      d -= row[r] * row[r];
    }
    if (!(d > G[t][t] * 1e-12)) return false;
    row[k] = Math.sqrt(d);
    L.push(row); order.push(t);
    return true;
  };
  const rebuild = (keep) => { order = []; L = []; for (const j of keep) append(j); };
  const solve = (rhs) => {
    const k = order.length, y = new Float64Array(k), z = new Float64Array(k);
    for (let i = 0; i < k; i++) { let v = rhs[i]; const Li = L[i]; for (let r = 0; r < i; r++) v -= Li[r] * y[r]; y[i] = v / Li[i]; }
    for (let i = k - 1; i >= 0; i--) { let v = y[i]; for (let r = i + 1; r < k; r++) v -= L[r][i] * z[r]; z[i] = v / L[i][i]; }
    return z;
  };
  /** The set's solution with Σ = 1, and its multiplier. */
  const solveSet = () => {
    const g = solve(order.map((j) => h[j])), u = solve(order.map(() => 1));
    let su = 0, sg = 0;
    for (let i = 0; i < u.length; i++) { su += u[i]; sg += g[i]; }
    const mu = (sg - 1) / su;
    return { z: Array.from(g, (v, i) => v - mu * u[i]), mu };
  };

  // Start at the one segment that alone fits best: x = e_j, the objective G_jj − 2h_j (+ bᵀb).
  let j0 = 0;
  for (let j = 1; j < n; j++) if (G[j][j] - 2 * h[j] < G[j0][j0] - 2 * h[j0]) j0 = j;
  const x = new Float64Array(n); x[j0] = 1;
  const inP = new Uint8Array(n); inP[j0] = 1;
  append(j0);
  let mu = solveSet().mu;
  const skip = new Uint8Array(n);
  const limit = 3 * n + 10;
  for (let it = 0; it < limit; it++) {
    // The Lagrangian's slope for each segment outside the set: positive means adding it lowers the misfit.
    let t = -1, best = thresh;
    for (let j = 0; j < n; j++) {
      if (inP[j] || skip[j]) continue;
      let w = h[j] - mu; const Gj = G[j];
      for (const c of order) w -= Gj[c] * x[c];
      if (w > best) { best = w; t = j; }
    }
    if (t < 0) break;
    if (!append(t)) { skip[t] = 1; continue; }
    inP[t] = 1;
    for (let inner = 0; inner < limit; inner++) {
      const { z, mu: m2 } = solveSet();
      if (z.every((v) => v > 0)) { order.forEach((j, i) => { x[j] = z[i]; }); mu = m2; break; }
      // Step from x toward z until the first mass reaches zero; both add up to 1, so every point between does too.
      let alpha = 1;
      order.forEach((j, i) => { if (z[i] <= 0) { const a = x[j] / (x[j] - z[i]); if (a < alpha) alpha = a; } });
      order.forEach((j, i) => { x[j] += alpha * (z[i] - x[j]); });
      const keep = order.filter((j) => x[j] > 1e-15);
      for (const j of order) if (x[j] <= 1e-15) { inP[j] = 0; x[j] = 0; }
      rebuild(keep);
      if (!order.length) break;
    }
    skip.fill(0);
  }
  return Array.from(x, (v) => (v < 0 ? 0 : v));
}

/**
 * THE DISTRIBUTION IMPLIED BY ONE EXPIRY'S OPTION PRICES.
 *
 * @param board  one expiry of a chain, `chain.byExp[expKey]`: { calls: { [strike]: quote }, puts: { … } }
 * @param spot   today's price (interest ignored: it is the forward)
 * @param opts   { stale } — the caller's reading of the board (`boardLooksStale()`); { minQuotes } the fewest usable
 *               out-of-the-money quotes a distribution is read from (the caller's RULES value)
 * @returns { ok: true, segments: [{ lo, hi, at, p }], used: [{ type, strike, price }], rms, forward }
 *          or { ok: false, reason: "stale" | "few" | "noSpot", used }
 */
export function impliedDistribution(board, spot, { stale = false, minQuotes = 4, smooth = SMOOTH } = {}) {
  const F = Number(spot);
  if (spot == null || !Number.isFinite(F) || F <= 0) return { ok: false, reason: "noSpot", used: [] };
  if (stale) return { ok: false, reason: "stale", used: [] };
  const used = [];
  const take = (book, type) => {
    for (const [k, q] of Object.entries((board && board[book]) || {})) {
      const K = Number(k);
      if (!Number.isFinite(K) || K <= 0) continue;
      const otm = type === "call" ? K >= F : K <= F;
      if (!otm) continue;
      const price = quoteMid(q);
      if (price == null) continue;
      used.push({ type, strike: K, price });
    }
  };
  take("calls", "call");
  take("puts", "put");
  used.sort((a, b) => a.strike - b.strike || (a.type < b.type ? -1 : 1));
  if (used.length < minQuotes) return { ok: false, reason: "few", used };
  const ks = [...new Set(used.map((u) => u.strike))].sort((a, b) => a - b);
  // The segments: [0, K1] at ⅔K1, [Ki, Ki+1] at the midpoint, [Kn, ∞) at 1.2Kn. For the breakeven split the tails are
  // [⅓K1, K1] and [Kn, 1.4Kn], whose midpoints are where the mass sits.
  const segs = [{ lo: ks[0] * (2 * TAIL_LOW - 1), hi: ks[0], at: ks[0] * TAIL_LOW }];
  for (let i = 0; i + 1 < ks.length; i++) segs.push({ lo: ks[i], hi: ks[i + 1], at: (ks[i] + ks[i + 1]) / 2 });
  const top = ks[ks.length - 1];
  segs.push({ lo: top, hi: top * (2 * TAIL_HIGH - 1), at: top * TAIL_HIGH });
  // Fair pricing, one row per option; Σ p = 1 is held exactly by the solver (`simplexLS()`).
  const A = used.map((u) => segs.map((s) => payoffAt(u.type, u.strike, s.at)));
  const b = used.map((u) => u.price);
  // THE ZIG-ZAG (measured, PR 67): with each segment's mass at its midpoint, the prices pin down only the SUMS of two
  // neighbouring segments, so the bare fit is ill-conditioned and a cent of noise moves mass to every other segment. A
  // small penalty on the second difference of the interior masses (`smooth` × the median strike width) removes that mode
  // and nothing else of note: rows of the same least-squares problem, still non-negative, still Σ = 1.
  if (smooth > 0 && segs.length > 4) {
    const widths = ks.slice(1).map((k, i) => k - ks[i]).sort((x, y) => x - y);
    const lam = smooth * (widths.length ? widths[widths.length >> 1] : 1);
    for (let i = 2; i + 1 < segs.length - 1; i++) {
      const row = segs.map(() => 0); row[i - 1] = lam; row[i] = -2 * lam; row[i + 1] = lam;
      A.push(row); b.push(0);
    }
  }
  const p = simplexLS(A, b);
  if (!p) return { ok: false, reason: "few", used };
  const sum = p.reduce((a, x) => a + x, 0);
  const ps = sum > 0 ? p.map((x) => x / sum) : p;
  const fit = used.map((u) => segs.reduce((s, sg, i) => s + ps[i] * payoffAt(u.type, u.strike, sg.at), 0));
  const rms = Math.sqrt(fit.reduce((s, f, i) => s + (f - used[i].price) ** 2, 0) / used.length);
  return { ok: true, segments: segs.map((s, i) => ({ ...s, p: ps[i] })), used, rms, forward: F };
}

/** P&L per share at expiry: Σ side × qty × payoff − the net paid (negative for a credit). */
const pnlAt = (legs, entryNet, x) => legs.reduce((a, l) => a + Math.sign(l.side) * (Number(l.qty) || 1) * payoffAt(l.type, Number(l.strike), x), 0) - entryNet;

/** The share of [lo, hi] where the P&L is above zero: the P&L is a straight line between the legs' strikes. */
function positiveShare(legs, entryNet, lo, hi) {
  if (!(hi > lo)) return 0;
  const cuts = [lo, ...legs.map((l) => Number(l.strike)).filter((k) => k > lo && k < hi), hi].sort((a, b) => a - b);
  let len = 0;
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], c = cuts[i + 1], fa = pnlAt(legs, entryNet, a), fc = pnlAt(legs, entryNet, c);
    if (fa > 0 && fc > 0) len += c - a;
    else if (fa > 0 || fc > 0) {
      const t = fa / (fa - fc);              // where the line crosses zero, a fraction of the way from a to c
      len += fa > 0 ? t * (c - a) : (1 - t) * (c - a);
    }
  }
  return len / (hi - lo);
}

/**
 * THE MARKET'S CHANCE OF PROFIT for one structure at one price: the probability of the segments where its P&L at expiry
 * is above zero (a P&L of exactly zero is your money back, not a profit — the app's one convention).
 * @returns a probability in [0, 1], or null when the distribution was not read or the inputs are not numbers
 */
export function marketChance(dist, legs, entryNet) {
  if (!dist || !dist.ok || !Array.isArray(legs) || !legs.length || entryNet == null || !Number.isFinite(Number(entryNet))) return null;
  const e = Number(entryNet);
  let p = 0;
  for (const s of dist.segments) p += s.p * positiveShare(legs, e, s.lo, s.hi);
  return Math.min(1, Math.max(0, p));
}

/** P(S_T < x) on the market's distribution, each segment uniform between its edges. */
export function marketBelow(dist, x) {
  if (!dist || !dist.ok || !Number.isFinite(Number(x))) return null;
  let p = 0;
  for (const s of dist.segments) {
    if (x >= s.hi) p += s.p;
    else if (x > s.lo) p += s.p * (x - s.lo) / (s.hi - s.lo);
  }
  return p;
}
