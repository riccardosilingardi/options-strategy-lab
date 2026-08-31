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

export function probProfit(legs, entry, S, iv, dte) {
  const T = dte / 365, sq = iv * Math.sqrt(T);
  const mu = Math.log(S) + (0.045 - 0.5 * iv * iv) * T;
  const cdf = (x) => 0.5 * (1 + erf((Math.log(x) - mu) / (sq * Math.SQRT2)));
  let p = 0, prevS = S * 0.7, prevPos = payoff(legs, prevS) - entry > 0;
  if (prevPos) p += cdf(prevS);
  for (let i = 1; i <= 240; i++) {
    const s2 = S * 0.7 + (i / 240) * S * 0.6;
    const pos = payoff(legs, s2) - entry > 0;
    if (pos || prevPos) p += Math.max(0, cdf(s2) - cdf(prevS));
    prevS = s2; prevPos = pos;
  }
  if (prevPos) p += 1 - cdf(prevS);
  return Math.min(1, Math.max(0, p));
}

export function exitSim(pos, S, dteLeft, iv, sigma, n = 1500) {
  const tp = 0.5 * pos.maxProfit, sl = 0.5 * pos.maxLoss, days = Math.max(1, dteLeft - 7);
  let nTP = 0, nSL = 0, nPos = 0, sum = 0; const tds = [];
  for (let i = 0; i < n; i++) {
    let s = S, done = false;
    for (let d = 1; d <= days; d++) {
      let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random();
      s *= Math.exp(-0.5 * sigma * sigma / 365 + sigma * Math.sqrt(1 / 365) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
      const pnl = (netBS(pos.legs, s, dteLeft - d, iv) - pos.entryNet) * 100;
      if (pnl >= tp) { nTP++; tds.push(d); sum += pnl; done = true; break; }
      if (pnl <= sl) { nSL++; sum += pnl; done = true; break; }
    }
    if (!done) { const pnl = (netBS(pos.legs, s, 7, iv) - pos.entryNet) * 100; if (pnl > 0) nPos++; sum += pnl; }
  }
  tds.sort((a, b) => a - b);
  return { pTP: nTP / n, pSL: nSL / n, pTimePos: nPos / n, ev: sum / n, medDays: tds.length ? tds[(tds.length / 2) | 0] : null };
}

export const SEASONAL = {
  SOYB: [-0.5, -0.3, 0.2, 0.4, 0.5, 1.2, 1.8, 1.1, -0.6, -0.8, -0.4, -0.2], CORN: [-0.6, -0.4, 0.1, 0.3, 0.9, 1.5, 1.3, -0.9, -1.1, -0.5, -0.3, -0.2],
  UNG: [2.1, 1.4, -1.8, -2.5, -1.2, -0.4, 0.3, 0.5, 0.8, 1.6, 2.4, 2.2], BOIL: [4.0, 2.6, -3.8, -5.2, -2.6, -1.0, 0.4, 0.8, 1.4, 3.0, 4.6, 4.2],
  WEAT: [-0.3, 0.1, 0.8, 1.1, 0.9, -0.4, -0.8, -0.6, -0.4, -0.2, 0.0, -0.1], SPY: [0.9, 0.2, 0.8, 1.2, 0.6, 0.5, 1.3, 0.1, -0.7, 0.8, 1.6, 1.1],
};

export const SIGMA = { SOYB: 0.19, CORN: 0.22, UNG: 0.48, BOIL: 0.95, WEAT: 0.25, SPY: 0.16 };
