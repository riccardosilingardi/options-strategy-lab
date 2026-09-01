// ============================================================================
// src/demo.js — PUBLIC DEMO MODE.
//
// The edge function (netlify/edge-functions/gate.js) checks `?demo=<DEMO_TOKEN>`
// against the env var and, when it matches, lets the request through and sets an
// `osl_demo` cookie so the SESSION stays in demo mode. The token itself never
// reaches this file: all the client learns is that it came in through the demo
// door.
//
// What demo mode changes, and nothing else:
//   · a banner says what this is
//   · every button that would reach the BROKER is disabled (PRD §8's six order
//     paths). Nothing else is hidden: a demo you cannot walk through teaches
//     nothing, so the wizard, the desk, the evidence and the paper book all work
//   · state is never POSTed to /api/state — that blob is a single shared
//     document, and a visitor must not overwrite the owner's positions
//   · three didactic positions are preloaded, built from today's real prices
//
// Plain JS, no React imports: the tests import it too.
// ============================================================================
import { netBS, payoff, SEASONAL } from "./engine.js";

/** The one sentence on every disabled control. Written once, here. */
export const DEMO_TOOLTIP = "Demo mode: read only";
/** The banner. */
export const DEMO_BANNER = "Public demo — paper trading, read only";

const DEMO_KEY = "osl-demo-until";
const DEMO_HOURS = 24; // matches the cookie the edge function sets

const hasCookie = () => {
  try { return /(?:^|;\s*)osl_demo=1(?:;|$)/.test(document.cookie || ""); }
  catch { return false; }
};
/** `?demo=` present, or `?demo=off` asking to leave. */
const urlAsk = () => {
  try {
    const v = new URLSearchParams(location.search).get("demo");
    if (v === null) return null;
    return v === "off" ? "off" : "on";
  } catch { return null; }
};
const remembered = () => {
  try {
    const until = Number(localStorage.getItem(DEMO_KEY));
    return Number.isFinite(until) && until > Date.now();
  } catch { return false; }
};
const remember = () => {
  try { localStorage.setItem(DEMO_KEY, String(Date.now() + DEMO_HOURS * 3600 * 1000)); }
  catch { /* private mode: the cookie still carries the session */ }
};
const forget = () => {
  try { localStorage.removeItem(DEMO_KEY); } catch { /* nothing to remove */ }
  try { document.cookie = "osl_demo=; Path=/; Max-Age=0; SameSite=Lax"; } catch { /* already gone */ }
};

/**
 * Is this session a demo? Read once at import time, exactly like `T` in
 * theme.js — a value that changed halfway through a render would mean two
 * screens disagreeing about whether an order can leave.
 *
 * The URL param and the cookie are both accepted: the param covers the first
 * request of a fresh session, the cookie covers every navigation after it, and
 * localStorage covers a local build with no edge function in front of it.
 *
 * `?demo=off` is the way back out, and it needs to exist: the one person who
 * must never be stuck in read-only mode is the owner, and clicking their own
 * demo link once would otherwise disable their trading buttons for a day.
 */
export function detectDemo() {
  if (typeof document === "undefined") return false;
  if (urlAsk() === "off") { forget(); return false; }
  const on = hasCookie() || urlAsk() === "on" || remembered();
  if (on) remember();
  return on;
}

export const DEMO = detectDemo();

/* ====================================================================
   THE THREE EXAMPLE POSITIONS

   Not fixtures with numbers typed into them: real structures priced with the
   same Black-Scholes the rest of the app uses, struck relative to TODAY'S live
   price so each one actually reads the way it is meant to when the app values
   it. Change nothing here and the app still does the arithmetic itself.

   One near its take-profit, one near its stop, and one where the price looks
   fine but the reason for opening it has gone.
==================================================================== */

/** The chains the three examples need before they can be priced. */
export const DEMO_SEED_TICKERS = ["CORN", "UNG", "SOYB", "WEAT"];

const snap = (x, step) => Math.round(x / step) * step;
const pct = (x) => `${x > 0 ? "+" : ""}${x.toFixed(1)}%`;
const iso = (ms) => new Date(ms).toISOString();
const DAY = 86400000;

/** Max profit and max loss in dollars, read off the payoff — never typed in. */
function extremes(legs, entryNet, S) {
  let maxProfit = -Infinity, maxLoss = Infinity;
  for (let i = 0; i <= 240; i++) {
    const s = S * 0.5 + (i / 240) * S;
    const pnl = (payoff(legs, s) - entryNet) * 100;
    if (pnl > maxProfit) maxProfit = pnl;
    if (pnl < maxLoss) maxLoss = pnl;
  }
  return { maxProfit, maxLoss };
}

/**
 * Which market's seasonal reading has most turned against a position opened in
 * `entryMonth` and still held in `month`.
 *
 * Position 3 is "the thesis broke", and that has to be TRUE rather than
 * asserted: the Thesis Integrity Score reads seasonality off the same table
 * used here, so if the copy claims the season has gone and the table says it
 * has strengthened, the demo is caught lying by its own screen.
 *
 * A sign flip is the clearest break; a reading that has faded to under half its
 * old size is a real one too. Some pairs of months offer neither — between
 * December and January every one of these markets is more bearish, not less —
 * so `broke` says which case we are in, and the copy only claims what happened.
 */
function brokenThesisTicker(tickers, month, entryMonth) {
  let best = null;
  for (const tk of tickers) {
    const row = SEASONAL[tk];
    if (!row) continue;
    const then = row[entryMonth], now = row[month];
    const flipped = Math.sign(then) !== Math.sign(now);
    const faded = !flipped && Math.abs(now) < Math.abs(then) * 0.5;
    const rank = (flipped ? 200 : faded ? 100 : 0) + Math.abs(then - now);
    if (!best || rank > best.rank) best = { tk, rank, then, now, broke: flipped || faded };
  }
  return best;
}

/**
 * @param {object} arg
 *   spots      — { ticker: live price }. A ticker with no price is skipped:
 *                a demo position priced off a made-up spot would teach the
 *                wrong lesson the moment the real chain loaded.
 *   underlying — (tk) => ({ iv, step }), i.e. App.jsx's getU
 *   now        — clock, injectable for the tests
 * @returns positions in exactly the shape commitPosition() produces.
 */
export function demoPositions({ spots = {}, underlying, now = Date.now() } = {}) {
  const U = typeof underlying === "function" ? underlying : () => ({ iv: 0.3, step: 0.5 });
  const month = new Date(now).getMonth();
  const out = [];

  const build = ({ tk, name, entryDaysAgo, dteAtEntry, entrySpot, rel, note, thesisOver }) => {
    const u = U(tk);
    const step = u.step || 0.5;
    const legs = rel.map(([side, type, pct, qty = 1]) => ({
      side, type, qty, strike: snap(entrySpot * (1 + pct), step),
    }));
    const entryNet = netBS(legs, entrySpot, dteAtEntry, u.iv);
    const { maxProfit, maxLoss } = extremes(legs, entryNet, entrySpot);
    if (!Number.isFinite(maxProfit) || !Number.isFinite(maxLoss) || maxLoss >= 0) return;
    const openedAt = now - entryDaysAgo * DAY;
    const dteLeft = dteAtEntry - entryDaysAgo;
    const entryMonth = new Date(openedAt).getMonth();
    out.push({
      id: openedAt,                       // stable per day, so a reload is idempotent
      demo: true,
      name, ticker: tk, expKey: iso(now + dteLeft * DAY).slice(0, 10),
      legs, entryNet, entrySpot,
      openedAt: iso(openedAt), expiry: iso(now + dteLeft * DAY),
      maxProfit, maxLoss,
      realEntry: false, alpacaId: null,
      thesis: {
        pop: null, iv: u.iv, seasonal: SEASONAL[tk] ? SEASONAL[tk][entryMonth] : 0,
        regime: "demo", spot: entrySpot, breakevens: [],
        delta: 0, vega: 1, ...(thesisOver || {}),
      },
      timeline: [
        { t: openedAt, type: "open", text: `Opened in the public demo, ${entryDaysAgo} days ago at ${tk} $${entrySpot.toFixed(2)}.` },
        { t: openedAt, type: "plan", text: `Exit plan frozen at entry — take profit at half the maximum, close at 21 days to expiration.` },
        { t: now - DAY, type: "note", text: note },
      ],
    });
  };

  // 1) Working, and close to the take-profit rule. The price has run past the
  //    short strike, so the spread is nearly at its maximum and the rule that
  //    matters is "take it".
  if (spots.CORN > 0) {
    build({
      tk: "CORN", name: "Bull Call Spread", entryDaysAgo: 35, dteAtEntry: 60,
      entrySpot: spots.CORN / 1.07,
      rel: [[1, "call", 0], [-1, "call", 0.05]],
      thesisOver: { pop: 0.46, delta: 0.3 },
      note: "The price has run past the short strike, so most of the profit this trade can make is already made. This is what the take-profit rule is for: the last part of the maximum is the slowest and the most fragile.",
    });
  }

  // 2) Wrong, and close to the stop. The stop is a WARNING (PRD §4): the demo
  //    shows an alert on a losing position that nothing closes automatically.
  if (spots.UNG > 0) {
    build({
      tk: "UNG", name: "Bear Put Spread", entryDaysAgo: 30, dteAtEntry: 55,
      entrySpot: spots.UNG / 1.09,
      rel: [[1, "put", 0], [-1, "put", -0.05]],
      thesisOver: { pop: 0.48, delta: -0.28 },
      note: "The price went the other way. The stop is a warning here, not an order: nothing closes by itself, and the decision — take the loss or give it the days it has left — is still yours.",
    });
  }

  // 3) The hard one. The price is sitting exactly where you wanted it, the P&L
  //    is fine, and the reason you opened it has gone. Nothing on the front
  //    page will shout: the Thesis Integrity Score is where this shows up.
  //
  //    The break has to be real on more than one axis, because the calendar
  //    does not always oblige — between some pairs of months none of these
  //    markets flips its seasonal sign. So the condor also carries a thesis
  //    recorded in a CALMER market than today's: it is short volatility, the
  //    nerves have risen since, and that hurts it whatever the price does.
  const entryMonth = new Date(now - 32 * DAY).getMonth();
  const broken = brokenThesisTicker(["SOYB", "CORN", "WEAT", "UNG"], month, entryMonth);
  if (broken && spots[broken.tk] > 0) {
    const tk = broken.tk;
    build({
      tk, name: "Iron Condor", entryDaysAgo: 32, dteAtEntry: 60,
      entrySpot: spots[tk],
      rel: [[1, "put", -0.10], [-1, "put", -0.05], [-1, "call", 0.05], [1, "call", 0.10]],
      // Short volatility (vega negative): it wants the market to calm down.
      thesisOver: { pop: 0.82, iv: U(tk).iv * 0.8, vega: -1, delta: 0 },
      note: `The price is still inside the range, so the P&L looks fine. What has gone is the reason. ` +
        (broken.broke
          ? `${tk} averaged ${pct(broken.then)}/month in the month this was opened and ${pct(broken.now)}/month ` +
            `in the one we are in, so the season it was betting on is no longer the season we are in. It was also `
          : `The seasonal case is still standing — ${tk} averaged ${pct(broken.then)}/month at entry and ` +
            `${pct(broken.now)}/month now — but it was `) +
        `opened in a calmer market than today's, and this structure is short volatility: rising nerves cost it ` +
        `money even while the price behaves. A position whose thesis has expired is not the same trade you took, ` +
        `whatever the P&L says — open it and read the Thesis Integrity Score.`,
    });
  }

  return out;
}
