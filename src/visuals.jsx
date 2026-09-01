// ============================================================================
// src/visuals.jsx — THE VISUAL LANGUAGE (PRD §6).
//
// Three visuals, one source of truth. Every zone, every colour and every
// sentence in this file is derived from `payoff(legs, S)` in src/engine.js
// through the single function `payoffBands()` below. Nothing here recomputes
// where a trade wins: if two screens ever disagreed about the same trade, it
// would be because someone added a second way of asking.
//
//   · BandThumbnail  — price line + green/red bands. Readable at 80px. Lists.
//   · Gauge          — the payoff projected into polar coordinates, needle at
//                      spot. Colours come from the SIGN of the payoff, so left
//                      is not always red: a bear spread is green on the left.
//   · UnifiedPosition— price history → dispersion cone → terminal distribution
//                      → payoff rotated 90°, all on ONE vertical price axis.
//
// Every visual exposes two things (PRD §6):
//   takeaway()        one always-visible English sentence, generated from the
//                     numbers. If it needs two sentences, the chart is wrong.
//   explain(element)  the explanation of one element, on tap.
// Neither is ever hand-written per case, and there is no hover anywhere: tap
// to open, tap outside to close, and on a narrow screen the explanation lands
// below the chart instead of floating over it.
// ============================================================================
import React, { useState, useEffect, useRef } from "react";
import { payoff, N as normCdf } from "./engine.js";
import { T } from "./theme.js";
import { money, RULES, pctText } from "./rules.js";

const mono = { fontFamily: "ui-monospace, Menlo, monospace" };
const sans = { fontFamily: "ui-sans-serif, system-ui" };

/** `$4.55` — a price, always two decimals, never confused with a P&L. */
export const price = (x) => (Number.isFinite(Number(x)) ? `$${Number(x).toFixed(2)}` : "n/a");
/** `+$120` / `-$80` — a P&L where the SIGN is the information. */
export const pnl$ = (x) => (Number.isFinite(Number(x)) ? `${Number(x) < 0 ? "-" : "+"}$${Math.abs(Math.round(Number(x))).toLocaleString("en-US")}` : "n/a");
/** `$120` — the same amount where an English verb already carries the sign.
    "loses -$118" and "pays +$120" both read as mistakes; the verb says it. */
export const amount$ = (x) => (Number.isFinite(Number(x)) ? `$${Math.abs(Math.round(Number(x))).toLocaleString("en-US")}` : "n/a");

/* ====================================================================
   THE ONE FUNCTION EVERY VISUAL ASKS

   Sample the expiry payoff across a price range and cut it into bands by the
   SIGN of the result. A vertical spread gives two bands, an iron condor gives
   three, a butterfly gives three — with no special case anywhere, because the
   sign of a number is the only thing being read.
==================================================================== */

/**
 * @param {object} arg
 *   legs      — [{ side, type, strike, qty }]
 *   entryNet  — what the structure cost per share (negative for a credit)
 *   lo, hi    — the price range to sample; defaults to ±30% around `spot`
 *   spot      — today's price, used for the default range and for `at`
 *   n         — samples; 240 matches the Build screen's own curve resolution
 * @returns { samples, bands, breakevens, maxProfit, maxLoss, at, lo, hi, spot }
 *   bands: [{ lo, hi, sign }] in price order, sign +1 profit / -1 loss.
 */
export function payoffBands({ legs = [], entryNet = 0, spot = null, lo, hi, n = 240 } = {}) {
  const base = Number.isFinite(spot) && spot > 0 ? spot
    : (legs.length ? legs.reduce((a, l) => a + l.strike, 0) / legs.length : 100);
  const LO = Number.isFinite(lo) ? lo : base * 0.7;
  const HI = Number.isFinite(hi) ? hi : base * 1.3;

  /** P&L per contract at expiry, in dollars. The only definition used here. */
  const at = (s) => (payoff(legs, s) - entryNet) * 100;

  const samples = [];
  for (let i = 0; i <= n; i++) {
    const s = LO + (i / n) * (HI - LO);
    samples.push({ s, pnl: at(s) });
  }

  // A P&L of exactly zero is not a profit: you got your money back. Folding it
  // into the loss side also stops zero-width bands appearing on flat wings.
  const signOf = (v) => (v > 0 ? 1 : -1);
  const bands = [];
  const breakevens = [];
  let startS = samples[0].s;
  let curSign = signOf(samples[0].pnl);
  for (let i = 1; i < samples.length; i++) {
    const sg = signOf(samples[i].pnl);
    if (sg === curSign) continue;
    // Interpolate the crossing so the band edge IS the breakeven, rather than
    // the nearest sample to it.
    const a = samples[i - 1], b = samples[i];
    const t = a.pnl === b.pnl ? 0.5 : a.pnl / (a.pnl - b.pnl);
    const cross = a.s + t * (b.s - a.s);
    bands.push({ lo: startS, hi: cross, sign: curSign });
    breakevens.push(cross);
    startS = cross;
    curSign = sg;
  }
  bands.push({ lo: startS, hi: samples[samples.length - 1].s, sign: curSign });

  const pnls = samples.map((p) => p.pnl);
  return {
    samples, bands, breakevens,
    maxProfit: Math.max(...pnls), maxLoss: Math.min(...pnls),
    at, lo: LO, hi: HI, spot: Number.isFinite(spot) ? spot : null,
  };
}

/** The profit bands only, in price order — what the eye reads as "green". */
export const profitBands = (b) => b.bands.filter((x) => x.sign > 0);

/** Chance the price finishes inside the green, under a lognormal at `dte`. */
export function chanceInProfit(b, { spot, sigma, dte, driftAnnual = 0 }) {
  if (!Number.isFinite(spot) || !(sigma > 0) || !(dte > 0)) return null;
  const Tyr = dte / 365, sq = sigma * Math.sqrt(Tyr);
  const mu = Math.log(spot) + (driftAnnual - 0.5 * sigma * sigma) * Tyr;
  const cdf = (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sq));
  return profitBands(b).reduce((a, z) => a + Math.max(0, cdf(z.hi) - cdf(z.lo)), 0);
}

/* ====================================================================
   TAKEAWAYS — one sentence each, generated from the numbers above.
==================================================================== */

/**
 * Describe the green zones as an English predicate — no subject, so the caller
 * can put the ticker in front of it: "CORN makes money above $4.20".
 */
function greenPhrase(b) {
  const g = profitBands(b);
  if (!g.length) return "makes money at no price at expiry";
  const open = (z) => z.lo <= b.lo + 1e-9;
  const openTop = (z) => z.hi >= b.hi - 1e-9;
  const one = (z) => (open(z) && openTop(z) ? "at any price"
    : open(z) ? `below ${price(z.hi)}`
      : openTop(z) ? `above ${price(z.lo)}`
        : `between ${price(z.lo)} and ${price(z.hi)}`);
  if (g.length === 1) return `makes money ${one(g[0])}`;
  if (g.length === 2) return `makes money ${one(g[0])} and ${one(g[1])}`;
  return `makes money in ${g.length} separate bands, the widest ${one(g.slice().sort((x, y) => (y.hi - y.lo) - (x.hi - x.lo))[0])}`;
}

/** `1 time in 10`, `5 times in 10` — never "1 times". */
export const inTenPhrase = (p) => {
  const n = Math.max(0, Math.min(10, Math.round((p || 0) * 10)));
  return `${n} time${n === 1 ? "" : "s"} in 10`;
};

/** BAND THUMBNAIL takeaway. Names the market, then where the green is. */
export function bandTakeaway(b, { ticker = "this market" } = {}) {
  const g = profitBands(b);
  if (!g.length) return `${ticker}: no price at expiry pays this trade back — check the structure before you send it.`;
  const where = b.spot == null ? null : g.some((z) => b.spot >= z.lo && b.spot <= z.hi);
  return `${ticker} ${greenPhrase(b)}` +
    (where == null ? "." : where ? `, and at ${price(b.spot)} it is inside that today.` : `, and at ${price(b.spot)} it is outside that today.`);
}

/** GAUGE takeaway. The needle is the point, so the sentence starts there. */
export function gaugeTakeaway(b, { ticker = "this market" } = {}) {
  if (b.spot == null) return `${ticker} ${greenPhrase(b)} — today's price is not loaded, so the needle is not showing.`;
  const now = b.at(b.spot);
  const inGreen = now > 0;
  const g = profitBands(b);
  const nearest = g.length
    ? g.reduce((best, z) => {
      const d = b.spot < z.lo ? z.lo - b.spot : b.spot > z.hi ? b.spot - z.hi : 0;
      return best && best.d <= d ? best : { d, z };
    }, null)
    : null;
  if (inGreen) {
    return `${ticker} is at ${price(b.spot)}: expiring here pays ${amount$(now)}, and it stays profitable ` +
      `${nearest && nearest.z.hi < b.hi - 1e-9 ? `up to ${price(nearest.z.hi)}` : "however far it runs"}.`;
  }
  if (!nearest) return `${ticker} is at ${price(b.spot)}: expiring here loses ${amount$(now)}, and no price pays this trade back.`;
  const move = nearest.z.lo > b.spot ? nearest.z.lo : nearest.z.hi;
  const pct = Math.abs(move - b.spot) / b.spot;
  return `${ticker} is at ${price(b.spot)}: expiring here loses ${amount$(now)}, and it needs ` +
    `${move > b.spot ? "a rise" : "a fall"} to ${price(move)} — ${pctText(pct)} away — to break even.`;
}

/** UNIFIED takeaway. Spot, the payoff there, and how often the cone lands green. */
export function unifiedTakeaway(b, { ticker = "this market", sigma, dte, driftAnnual = 0 } = {}) {
  if (b.spot == null) return `${ticker}: today's price is not loaded, so nothing can be projected yet.`;
  const now = b.at(b.spot);
  const p = chanceInProfit(b, { spot: b.spot, sigma, dte, driftAnnual });
  const head = `${ticker} is at ${price(b.spot)} and ${greenPhrase(b)}`;
  if (p == null) return `${head} — expiring at today's price would ${now > 0 ? "pay" : "lose"} ${amount$(now)}.`;
  return `${head}, which the next ${Math.round(dte)} days reach about ${pctText(p)} of the time — ` +
    `and expiring at today's price would ${now > 0 ? "pay" : "lose"} ${amount$(now)}.`;
}

/* ====================================================================
   EXPLAIN — the explanation of a single element, on tap.
   Generated from the same numbers, so an explanation can never describe a
   chart the code did not draw.
==================================================================== */

export function explainElement(el, b, ctx = {}) {
  const { ticker = "this market", sigma, dte, driftAnnual = 0 } = ctx;
  switch (el) {
    case "green":
      return profitBands(b).length
        ? `Green is every price at which this trade is worth more at expiry than it cost. ` +
          `Here that is ${greenPhrase(b).replace(/^makes money /, "")}, worth up to ${pnl$(b.maxProfit)}.`
        : `There is no green here: no price at expiry pays this structure back what it cost. ` +
          `The best it can do is ${pnl$(b.maxProfit)}.`;
    case "red":
      return `Red is every price at which it expires worth less than you paid. The worst case is ` +
        `${pnl$(b.maxLoss)}, and it cannot get worse than that — that is what "defined risk" means.`;
    case "breakeven":
      return b.breakevens.length
        ? `Break even at ${b.breakevens.map(price).join(" and ")}: the price where the trade has given ` +
          `back exactly what it cost. Left of it and right of it are different outcomes, not different amounts.`
        : `There is no break-even price here: the payoff never crosses zero inside the range shown.`;
    case "needle":
      return b.spot == null
        ? `The needle marks today's price. It is not drawn because the price has not loaded.`
        : `The needle is today's price, ${price(b.spot)}. Expiring exactly here would ${b.at(b.spot) > 0 ? "pay" : "lose"} ` +
          `${amount$(b.at(b.spot))} — it is where the trade stands if nothing at all happens.`;
    case "history":
      return `That is where ${ticker} has actually traded. It shares the vertical price axis with everything to ` +
        `its right, so a level in the past lines up with the same level in the payoff: you can read straight ` +
        `across from where the price has been to what the trade would be worth there.`;
    case "cone":
      return sigma > 0 && dte > 0
        ? `The cone is where the price can realistically get to by expiry, at ${pctText(sigma)} annual volatility ` +
          `over ${Math.round(dte)} days: the pale band is the 5–95% range, the solid one 25–75%, and the dashed ` +
          `line the middle path.`
        : `The cone is where the price can realistically get to by expiry. It needs a volatility and a number of days to draw.`;
    case "distribution": {
      const p = chanceInProfit(b, { spot: b.spot, sigma, dte, driftAnnual });
      return `The histogram is the same cone read at expiry only: how likely each finishing price is. ` +
        (p == null ? `Where it overlaps the green bands is where this trade pays.`
          : `About ${pctText(p)} of it falls inside the green bands.`);
    }
    case "payoff":
      return `The payoff is turned on its side so it shares the price axis: read a price on the left, follow ` +
        `it across, and the width tells you the money. Best case ${pnl$(b.maxProfit)}, worst case ${pnl$(b.maxLoss)}.`;
    case "spotline":
      return b.spot == null
        ? `The dashed line runs from today's price across to what the trade is worth there.`
        : `The dashed line runs from today's price, ${price(b.spot)}, across to what this trade is worth at that ` +
          `price on expiry day: ${pnl$(b.at(b.spot))}.`;
    default:
      return `Every zone on this chart comes from the same payoff calculation, so no two screens can disagree about this trade.`;
  }
}

/* ====================================================================
   Tap-to-explain plumbing. There is no hover on a phone.
==================================================================== */

/** True while the viewport is too narrow to float an explanation over content. */
export function useNarrow(px = 720) {
  const [narrow, setNarrow] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= px : false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${px}px)`);
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener ? mq.addEventListener("change", on) : mq.addListener(on);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", on) : mq.removeListener(on));
  }, [px]);
  return narrow;
}

/** Measured width of a block, so a component can decide its own level of detail. */
export function useWidth(fallback = 900) {
  const ref = useRef(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (typeof ResizeObserver === "undefined" || !ref.current) return;
    const ro = new ResizeObserver(() => setW(ref.current?.clientWidth || fallback));
    ro.observe(ref.current);
    setW(ref.current.clientWidth || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

/**
 * The frame every visual sits in: the chart, the always-visible takeaway, and
 * the explanation of whatever was last tapped. Tap outside closes it; on a
 * narrow screen the explanation renders below rather than over the chart.
 */
export function Figure({ takeaway, explanation, onClose, children, style }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!explanation) return;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose && onClose(); };
    const esc = (e) => { if (e.key === "Escape") onClose && onClose(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [explanation, onClose]);
  return (
    <div ref={ref} style={{ ...sans, ...style }}>
      {children}
      {takeaway && (
        <div style={{ ...sans, fontSize: 13.5, lineHeight: 1.5, color: T.body, marginTop: 8 }}>{takeaway}</div>
      )}
      {explanation && (
        <div style={{
          marginTop: 8, padding: "10px 12px", background: T.panel,
          border: `1px solid ${T.blue}55`, borderRadius: 8, borderLeft: `3px solid ${T.blue}`,
        }}>
          <div style={{ ...sans, fontSize: 13, color: T.body, lineHeight: 1.5 }}>{explanation}</div>
          <button onClick={onClose} style={{ ...mono, fontSize: 10, marginTop: 6, background: "transparent", border: "none", color: T.blue, cursor: "pointer", padding: 0 }}>
            tap anywhere outside to close
          </button>
        </div>
      )}
    </div>
  );
}

/* ====================================================================
   1) BAND THUMBNAIL
   The underlying's price line over the green/red bands, and nothing else. No
   numbers, no labels, no legend: at 80px there is no room for any of them and
   no need either.

   PRICE IS THE VERTICAL AXIS, exactly as it is in the unified component, so the
   two never disagree about which way is up. That makes the bands horizontal
   stripes and lets the underlying's own recent path run left to right across
   them, ending at today's price on the right-hand edge. Without that line the
   thumbnail is a row of coloured bars: it says where the trade pays, but not
   where the market actually is in relation to it, which is the whole question.

   With no history loaded the line degrades to a flat one at today's price —
   still an answer ("here, and we do not know how it got here"), never a blank.
==================================================================== */

/** The closes of a bar series, whatever shape the feed used. */
const closes = (bars) => (Array.isArray(bars) ? bars : [])
  .map((x) => Number(x?.close ?? x?.c ?? x?.value ?? x))
  .filter((x) => Number.isFinite(x) && x > 0);

export function BandThumbnail({ bands, width = 160, height = 44, spot = null, bars = [], onExplain, title }) {
  const b = bands;
  if (!b || !b.bands.length) return null;
  const s0 = spot ?? b.spot;
  const hist = closes(bars);

  // The price axis has to hold the bands AND the history, or the line walks off
  // the top of the picture the moment the market moves outside the payoff range.
  const lo = Math.min(b.lo, ...(hist.length ? [Math.min(...hist)] : []));
  const hi = Math.max(b.hi, ...(hist.length ? [Math.max(...hist)] : []));
  const Y = (s) => height - ((s - lo) / (hi - lo || 1)) * height;

  // The history occupies the left three quarters; today sits at the right edge,
  // so the eye lands on "where we are" without hunting for it.
  const xToday = width * 0.78;
  const XH = (i) => (hist.length > 1 ? (i / (hist.length - 1)) * xToday : xToday);
  const path = hist.length > 1
    ? hist.map((c, i) => `${i ? "L" : "M"}${XH(i).toFixed(2)},${Y(c).toFixed(2)}`).join(" ")
    : null;

  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img"
      aria-label={title || "where this trade makes and loses money, and where the price is now"}
      style={{ display: "block", borderRadius: 4, background: T.bg, cursor: onExplain ? "pointer" : "default", maxWidth: "100%" }}>
      {b.bands.map((z, i) => (
        <rect key={i} x={0} y={Y(z.hi)} width={width} height={Math.max(0.5, Y(z.lo) - Y(z.hi))}
          fill={z.sign > 0 ? T.green : T.red} opacity={z.sign > 0 ? 0.3 : 0.15}
          onClick={tap(z.sign > 0 ? "green" : "red")} />
      ))}
      {b.breakevens.map((s, i) => (
        <line key={i} x1={0} x2={width} y1={Y(s)} y2={Y(s)}
          stroke={T.ink} strokeWidth={1} opacity={0.35} strokeDasharray="3 3" onClick={tap("breakeven")} />
      ))}
      {/* the price line — the underlying's own path across the zones */}
      {path
        ? <path d={path} fill="none" stroke={T.ink} strokeWidth={1.4} strokeLinejoin="round"
            strokeLinecap="round" opacity={0.85} onClick={tap("history")} />
        : s0 != null && (
          <line x1={0} x2={xToday} y1={Y(s0)} y2={Y(s0)} stroke={T.ink} strokeWidth={1.2}
            opacity={0.4} strokeDasharray="2 3" onClick={tap("history")} />
        )}
      {s0 != null && (
        <g onClick={tap("needle")}>
          <line x1={xToday} x2={width} y1={Y(s0)} y2={Y(s0)} stroke={T.ink} strokeWidth={1.6} />
          <circle cx={xToday} cy={Y(s0)} r={Math.max(2.5, height * 0.09)} fill={T.ink} />
        </g>
      )}
    </svg>
  );
}

/** The thumbnail with its takeaway and tap-to-explain, for a list row. */
export function BandThumbFigure({ legs, entryNet, spot, bars, ticker, width, height, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  return (
    <Figure style={style} takeaway={bandTakeaway(b, { ticker })}
      explanation={open ? explainElement(open, b, { ticker }) : null} onClose={() => setOpen(null)}>
      <BandThumbnail bands={b} width={width} height={height} bars={bars} onExplain={setOpen}
        title={bandTakeaway(b, { ticker })} />
    </Figure>
  );
}

/* ====================================================================
   2) GAUGE
   The payoff projected into polar coordinates: the price range becomes a
   semicircle, left = lowest price, right = highest. The arc is coloured by
   the SIGN of the payoff at that price, so a bear spread is green on the
   LEFT — the colours are read off the trade, never off the direction.
==================================================================== */

const polar = (cx, cy, r, th) => [cx + r * Math.cos(th), cy - r * Math.sin(th)];
/** Angle for a price: 180° at the bottom of the range, 0° at the top. */
const angleFor = (s, lo, hi) => Math.PI * (1 - (s - lo) / (hi - lo));
const arcPath = (cx, cy, r, t0, t1) => {
  const [x0, y0] = polar(cx, cy, r, t0);
  const [x1, y1] = polar(cx, cy, r, t1);
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 0 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
};

/** The arcs a gauge draws, as data — so a test can read the colours. */
export function gaugeArcs(b) {
  return b.bands.map((z) => ({
    sign: z.sign,
    from: angleFor(z.lo, b.lo, b.hi),
    to: angleFor(z.hi, b.lo, b.hi),
    lo: z.lo, hi: z.hi,
  }));
}

export function Gauge({ bands, size = 260, onExplain, ticker = "this market" }) {
  const b = bands;
  if (!b || !b.bands.length) return null;
  const W = size, R = size * 0.42, cx = W / 2, cy = size * 0.56, thick = size * 0.13;
  const H = cy + size * 0.105;
  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);
  const s0 = b.spot;
  const inRange = s0 != null && s0 >= b.lo && s0 <= b.hi;
  const nTh = inRange ? angleFor(s0, b.lo, b.hi) : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={gaugeTakeaway(b, { ticker })}
      style={{ display: "block", maxWidth: "100%", cursor: onExplain ? "pointer" : "default" }}>
      {gaugeArcs(b).map((a, i) => (
        <path key={i} d={arcPath(cx, cy, R, a.from, a.to)} fill="none" strokeWidth={thick}
          stroke={a.sign > 0 ? T.green : T.red} opacity={a.sign > 0 ? 0.85 : 0.4}
          onClick={tap(a.sign > 0 ? "green" : "red")} />
      ))}
      {b.breakevens.map((s, i) => {
        const th = angleFor(s, b.lo, b.hi);
        const [x1, y1] = polar(cx, cy, R - thick / 2, th);
        const [x2, y2] = polar(cx, cy, R + thick / 2, th);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={T.panel} strokeWidth={2} onClick={tap("breakeven")} />;
      })}
      {inRange && (
        <g onClick={tap("needle")}>
          <line x1={cx} y1={cy} x2={polar(cx, cy, R + thick * 0.62, nTh)[0]} y2={polar(cx, cy, R + thick * 0.62, nTh)[1]}
            stroke={T.ink} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={cx} cy={cy} r={size * 0.035} fill={T.ink} />
        </g>
      )}
      {/* The ends of the price range, anchored inwards so they cannot clip. */}
      <text x={cx - R - thick / 2} y={cy + size * 0.085} textAnchor="start" fill={T.dim} fontSize={size * 0.045} fontFamily="ui-monospace, Menlo, monospace">{price(b.lo)}</text>
      <text x={cx + R + thick / 2} y={cy + size * 0.085} textAnchor="end" fill={T.dim} fontSize={size * 0.045} fontFamily="ui-monospace, Menlo, monospace">{price(b.hi)}</text>
    </svg>
  );
}

/** The gauge with its takeaway and tap-to-explain — position detail. */
export function GaugeFigure({ legs, entryNet, spot, ticker, size, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  return (
    <Figure style={style} takeaway={gaugeTakeaway(b, { ticker })}
      explanation={open ? explainElement(open, b, { ticker }) : null} onClose={() => setOpen(null)}>
      <Gauge bands={b} size={size} onExplain={setOpen} ticker={ticker} />
    </Figure>
  );
}

/* ====================================================================
   3) UNIFIED POSITION COMPONENT
   Left to right on ONE shared vertical price axis:
     price history → dispersion cone from today → terminal distribution as a
     rotated histogram → payoff rotated 90°.
   A horizontal dashed line runs from today's spot across to the payoff value.
   Cone and distribution switch on above a width threshold and off below it:
   one component, two levels of detail, never two components that can drift.
==================================================================== */

export const UNIFIED_DETAIL_WIDTH = 560; // below this, history and payoff only

/** The column layout, as data: a test can check the panels turn off. */
export function unifiedLayout(width) {
  const detail = width >= UNIFIED_DETAIL_WIDTH;
  const padL = 4, padR = 52, padB = 22, padT = 10;
  const inner = Math.max(80, width - padL - padR);
  const share = detail
    ? { history: 0.46, cone: 0.24, dist: 0.12, payoff: 0.18 }
    : { history: 0.62, cone: 0, dist: 0, payoff: 0.38 };
  const xHist = padL;
  const xToday = xHist + inner * share.history;
  const xConeEnd = xToday + inner * share.cone;
  const xDistEnd = xConeEnd + inner * share.dist;
  const xPayEnd = xDistEnd + inner * share.payoff;
  return { detail, padL, padR, padT, padB, inner, xHist, xToday, xConeEnd, xDistEnd, xPayEnd };
}

export function UnifiedPosition({
  legs = [], entryNet = 0, spot, bars = [], dte = 45, sigma = 0.3, driftAnnual = 0,
  ticker = "this market", height = 380, width: fixedWidth, onExplain,
}) {
  const [ref, measured] = useWidth(900);
  const W = fixedWidth || measured;
  const b = payoffBands({ legs, entryNet, spot });
  const L = unifiedLayout(W);
  const tap = (el) => (onExplain ? () => onExplain(el) : undefined);

  const H = height;
  const days = Math.max(1, dte);

  // --- the cone: lognormal quantiles from today out to expiry ---
  const QZ = { p5: -1.645, p25: -0.674, p50: 0, p75: 0.674, p95: 1.645 };
  const cone = [];
  if (L.detail && Number.isFinite(spot) && sigma > 0) {
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * (days / 365);
      const o = { x: L.xToday + (i / 24) * (L.xConeEnd - L.xToday) };
      for (const [k, z] of Object.entries(QZ)) {
        o[k] = spot * Math.exp((driftAnnual - 0.5 * sigma * sigma) * t + sigma * Math.sqrt(t) * z);
      }
      cone.push(o);
    }
  }

  // --- the shared vertical price axis: every panel is read off this one ---
  const ys = [
    ...bars.map((x) => x.low), ...bars.map((x) => x.high),
    ...cone.map((c) => c.p5), ...cone.map((c) => c.p95),
    ...legs.map((l) => l.strike), ...b.breakevens,
    ...(Number.isFinite(spot) ? [spot] : []),
  ].filter((v) => Number.isFinite(v) && v > 0);
  const yMin = ys.length ? Math.min(...ys) * 0.98 : b.lo;
  const yMax = ys.length ? Math.max(...ys) * 1.02 : b.hi;
  const Y = (v) => L.padT + (1 - (v - yMin) / (yMax - yMin)) * (H - L.padT - L.padB);
  const XH = (i) => L.xHist + (bars.length > 1 ? (i / (bars.length - 1)) * (L.xToday - L.xHist) : 0);

  // --- the terminal distribution, as a histogram rotated onto the price axis ---
  const distW = L.xDistEnd - L.xConeEnd;
  const distBars = [];
  if (distW > 4 && Number.isFinite(spot) && sigma > 0) {
    const Tyr = days / 365, sq = sigma * Math.sqrt(Tyr);
    const mu = Math.log(spot) + (driftAnnual - 0.5 * sigma * sigma) * Tyr;
    const cdf = (x) => (x <= 0 ? 0 : normCdf((Math.log(x) - mu) / sq));
    const NB = 26;
    let peak = 0;
    for (let i = 0; i < NB; i++) {
      const lo = yMin + (i / NB) * (yMax - yMin), hi = yMin + ((i + 1) / NB) * (yMax - yMin);
      const p = Math.max(0, cdf(hi) - cdf(lo));
      peak = Math.max(peak, p);
      distBars.push({ lo, hi, p, profit: b.at((lo + hi) / 2) > 0 });
    }
    for (const d of distBars) d.w = peak > 0 ? (d.p / peak) * (distW - 2) : 0;
  }

  // --- the payoff, rotated 90°: price up the axis, money across ---
  const payW = L.xPayEnd - L.xDistEnd;
  const inRange = b.samples.filter((p) => p.s >= yMin && p.s <= yMax);
  const pMax = Math.max(1, ...inRange.map((p) => Math.abs(p.pnl)));
  const PX = (v) => L.xDistEnd + 2 + ((v + pMax) / (2 * pMax)) * (payW - 4);
  const payLine = inRange.map((p, i) => `${i ? "L" : "M"}${PX(p.pnl).toFixed(1)},${Y(p.s).toFixed(1)}`).join("");
  const zeroX = PX(0);

  const nowPnl = Number.isFinite(spot) ? b.at(spot) : null;

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={unifiedTakeaway(b, { ticker, sigma, dte, driftAnnual })}
        style={{ display: "block", background: T.bg, border: `1px solid ${T.line}`, borderRadius: 8, maxWidth: "100%", cursor: onExplain ? "pointer" : "default" }}>

        {/* the price axis itself, shared by every panel to its left and right */}
        {Array.from({ length: 6 }, (_, i) => {
          const v = yMin + (i / 5) * (yMax - yMin);
          return (
            <g key={i}>
              <line x1={L.xHist} x2={L.xPayEnd} y1={Y(v)} y2={Y(v)} stroke={T.line} strokeWidth={0.6} />
              <text x={L.xPayEnd + 5} y={Y(v) + 3} fill={T.dim} fontSize={9.5} fontFamily="ui-monospace, Menlo, monospace">{v.toFixed(2)}</text>
            </g>
          );
        })}

        {/* zones: the SAME bands every other visual draws, and they stop where
            the cone stops — past that the payoff panel speaks for itself. */}
        {L.xConeEnd > L.xToday && b.bands.map((z, i) => (
          <rect key={i} x={L.xToday} y={Y(Math.min(z.hi, yMax))}
            width={L.xConeEnd - L.xToday}
            height={Math.max(0, Y(Math.max(z.lo, yMin)) - Y(Math.min(z.hi, yMax)))}
            fill={z.sign > 0 ? T.green : T.red} opacity={z.sign > 0 ? 0.17 : 0.06}
            onClick={tap(z.sign > 0 ? "green" : "red")} />
        ))}

        {/* dispersion cone */}
        {cone.length > 0 && (
          <g onClick={tap("cone")}>
            <polygon fill={T.violet} opacity={0.1}
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p95).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c.p5).toFixed(1)}`).join(" ")} />
            <polygon fill={T.violet} opacity={0.17}
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p75).toFixed(1)}`).join(" ") + " " + [...cone].reverse().map((c) => `${c.x.toFixed(1)},${Y(c.p25).toFixed(1)}`).join(" ")} />
            <polyline fill="none" stroke={T.violet} strokeWidth={1.3} strokeDasharray="4 3"
              points={cone.map((c) => `${c.x.toFixed(1)},${Y(c.p50).toFixed(1)}`).join(" ")} />
          </g>
        )}

        {/* terminal distribution, rotated onto the price axis */}
        {distBars.map((d, i) => (
          <rect key={i} x={L.xConeEnd + 1} y={Y(d.hi)} width={Math.max(0, d.w)}
            height={Math.max(0.6, Y(d.lo) - Y(d.hi) - 0.6)}
            fill={d.profit ? T.green : T.red} opacity={0.55} onClick={tap("distribution")} />
        ))}

        {/* price history */}
        <g onClick={tap("history")}>
          {bars.map((bar, i) => {
            const x = XH(i), up = bar.close >= bar.open;
            const cw = Math.max(1.2, ((L.xToday - L.xHist) / Math.max(1, bars.length)) * 0.6);
            return (
              <g key={i}>
                <line x1={x} x2={x} y1={Y(bar.high)} y2={Y(bar.low)} stroke={up ? T.green : T.red} strokeWidth={0.8} />
                <rect x={x - cw / 2} y={Y(Math.max(bar.open, bar.close))} width={cw}
                  height={Math.max(1, Math.abs(Y(bar.open) - Y(bar.close)))} fill={up ? T.green : T.red} />
              </g>
            );
          })}
        </g>

        {/* payoff, rotated 90° */}
        <g onClick={tap("payoff")}>
          <line x1={zeroX} x2={zeroX} y1={L.padT} y2={H - L.padB} stroke={T.line} strokeWidth={1} />
          <path d={payLine} fill="none" stroke={T.amber} strokeWidth={2} />
        </g>

        {/* today, and the dashed line from spot across to the payoff value */}
        <line x1={L.xToday} x2={L.xToday} y1={L.padT} y2={H - L.padB} stroke={T.amber} strokeWidth={1} strokeDasharray="3 3" />
        {Number.isFinite(spot) && spot >= yMin && spot <= yMax && (
          <g onClick={tap("spotline")}>
            <line x1={L.xHist} x2={PX(nowPnl)} y1={Y(spot)} y2={Y(spot)}
              stroke={T.ink} strokeWidth={1.2} strokeDasharray="5 4" opacity={0.8} />
            <circle cx={PX(nowPnl)} cy={Y(spot)} r={3.4} fill={nowPnl > 0 ? T.green : T.red} />
          </g>
        )}

        {/* strikes */}
        {legs.map((l, i) => (
          <line key={i} x1={L.xToday} x2={L.xPayEnd} y1={Y(l.strike)} y2={Y(l.strike)}
            stroke={l.side > 0 ? T.green : T.red} strokeWidth={1} opacity={0.55} />
        ))}
      </svg>
    </div>
  );
}

/** The unified component with its takeaway and tap-to-explain — screen 4. */
export function UnifiedFigure({ legs, entryNet, spot, bars, dte, sigma, driftAnnual, ticker, height, width, style }) {
  const [open, setOpen] = useState(null);
  const b = payoffBands({ legs, entryNet, spot });
  const ctx = { ticker, sigma, dte, driftAnnual };
  return (
    <Figure style={style} takeaway={unifiedTakeaway(b, ctx)}
      explanation={open ? explainElement(open, b, ctx) : null} onClose={() => setOpen(null)}>
      <UnifiedPosition legs={legs} entryNet={entryNet} spot={spot} bars={bars} dte={dte}
        sigma={sigma} driftAnnual={driftAnnual} ticker={ticker} height={height} width={width} onExplain={setOpen} />
    </Figure>
  );
}

/* ====================================================================
   The exit plan, as a sentence. It is decided at construction time and then
   frozen (PRD §4), so screen 4 states it rather than offering it — and the
   numbers come from src/rules.js like every other rule number.
==================================================================== */
export const exitPlanSentence = () =>
  `Close at ${pctText(RULES.takeProfitPct)} of max gain, or at ${RULES.exitDTE} days to expiration.`;

export const exitPlanDetail = (maxProfit) =>
  `That is ${money(RULES.takeProfitPct * Math.abs(maxProfit || 0))} of profit, or the ${RULES.exitDTE}-day mark, ` +
  `whichever comes first. A loss of ${pctText(RULES.stopLossPct)} of the maximum raises a warning, never an ` +
  `automatic close. These are chosen now and not renegotiated while the position is open.`;
