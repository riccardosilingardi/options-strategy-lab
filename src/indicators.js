/* ====================================================================
   THE INDICATORS — ONE HOME. src/indicators.js

   Pure functions over daily bars. No React, no imports, no fetch, no
   clock: the same bars give the same numbers, which is what makes an
   indicator a reading rather than an opinion.

   WHY THIS FILE EXISTS. `signals.js` has carried an inline SMA20/SMA50 +
   RSI14 read since the four-factor engine was written, and the price chart
   drew candles and volume and nothing else. Adding a second SMA beside the
   first is how two screens come to disagree about one market — the fault
   this repository has fixed for the chance of profit (four arithmetics,
   §4h), for the seasonal drift (§4j), for the realised volatility (§4k) and
   for open interest (§4r.4). It is not being repeated for a moving average.

   So: `signals.js` READS ITS TREND FROM HERE. Its outputs are unchanged —
   `indicators.test.js` holds the before against the after on the same bars,
   because a refactor that moves a number is two changes wearing one coat.

   >>> UNKNOWN IS NOT A NUMBER, AND IT IS THE RULE OF THIS FILE. <<<
   Every function returns an array the same length as its input with `null`
   wherever there were not enough bars to form the value. A 200-day moving
   average on 120 bars is not a 120-day average and it is not zero: it is
   nothing, and the chart draws nothing and says why. `Number(null)` is 0 and
   0 is finite, so the nulls go out before any coercion — for the ninth time
   in this repository.

   THE PERIODS ARE NAMED, WITH THEIR REASONING. They are not in `RULES`
   deliberately: `RULES` is the single source of the TRADING rules — what the
   app will and will not do with money — and a moving-average length decides
   nothing the app does. It decides what a line on a chart is. They are
   conventions, they are named here, and where a convention is not the only
   one in use this file says so out loud.
==================================================================== */

/* ------------------------------------------------------------------
   THE PERIODS, AND WHY EACH ONE
------------------------------------------------------------------ */

export const PERIODS = Object.freeze({
  /** SMA_FAST (20) — about one trading month. The shortest average that is
   *  still an average rather than the price itself. It is the one
   *  `signals.js` has always scored the trend with. */
  SMA_FAST: 20,
  /** SMA_MID (50) — about a quarter. The second half of `signals.js`'s
   *  trend read: fast above slow is an uptrend, and the two crossing is the
   *  event everybody watching a chart is watching for. */
  SMA_MID: 50,
  /** SMA_SLOW (200) — about a year of trading. It says nothing about this
   *  week and everything about which side of the market you are on. On a
   *  45-day option it is context, never a trigger. */
  SMA_SLOW: 200,
  /** EMA_FAST (9) / EMA_SLOW (21) — an exponential average weights the last
   *  bars more heavily, so it turns sooner than an SMA of the same length
   *  and whipsaws more. Nine and twenty-one are the pair MACD's own
   *  arithmetic made conventional. */
  EMA_FAST: 9,
  EMA_SLOW: 21,
  /** BOLL_LEN (20) / BOLL_SD (2) — the same 20-day average with a band two
   *  standard deviations of the last 20 closes either side. Under a normal
   *  distribution about 95% of closes fall inside it; prices are not normal,
   *  so treat it as "unusually far from the average", never as a
   *  probability. This app has its own probability and it is a simulation. */
  BOLL_LEN: 20,
  BOLL_SD: 2,
  /** RSI_LEN (14) — see the note above `rsi()`. Fourteen is Wilder's, and
   *  the SMOOTHING this app uses is not. */
  RSI_LEN: 14,
  /** MACD_FAST (12) / MACD_SLOW (26) / MACD_SIGNAL (9) — the difference
   *  between two exponential averages, and an average of that difference.
   *  It measures whether the trend is gaining or losing speed, which is a
   *  different question from which way it points. */
  MACD_FAST: 12,
  MACD_SLOW: 26,
  MACD_SIGNAL: 9,
  /** ATR_LEN (14) — the average true range: how far this market moves in a
   *  day, in dollars. It is the one indicator here that is directly
   *  comparable with an option's breakeven distance, which is why the
   *  copilot is given it. */
  ATR_LEN: 14,
  /** VOL_AVG_LEN (20) — today's volume against a month of it. Volume alone
   *  is a number nobody can read; volume against its own average is. */
  VOL_AVG_LEN: 20,
});

/** Above this the fast/slow trend read is formed. It is `signals.js`'s own
 *  guard, moved here with it and unchanged in value: below 60 daily bars the
 *  50-day average has barely ten independent points behind it. */
export const MIN_TREND_BARS = 60;

/** Where an RSI reading stops being ordinary. They are drawn on the chart and
 *  quoted in a sentence; they trigger nothing, and `signals.js` has always
 *  used exactly these two to cut a trend reading by 30%. */
export const RSI_HIGH = 70;
export const RSI_LOW = 30;

/* ------------------------------------------------------------------
   THE PRIMITIVES

   Every one takes a series and returns an array of the SAME LENGTH, with
   null wherever the value does not exist yet. Same length matters: the
   chart lines up a value with its bar by index, and a shorter array that
   the caller has to offset by hand is an off-by-one waiting to happen.
------------------------------------------------------------------ */

const isNum = (x) => typeof x === "number" && Number.isFinite(x);
/** A series of finite numbers, or nulls where the input was not one. */
const clean = (xs) => (Array.isArray(xs) ? xs : []).map((x) => (isNum(+x) && x != null && x !== "" ? +x : null));

/**
 * SIMPLE MOVING AVERAGE. `out[i]` is the mean of the `len` closes ending at
 * `i`, or null before there are `len` of them.
 * A window containing an unreadable close is null, not a mean of what is
 * left: an average of 19 of 20 days is a 19-day average wearing the wrong
 * name.
 */
export function sma(series, len) {
  const xs = clean(series);
  const n = Math.max(1, Math.round(Number(len) || 0));
  const out = new Array(xs.length).fill(null);
  let sum = 0, have = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] == null) { sum = 0; have = 0; continue; }
    sum += xs[i]; have++;
    if (have > n) { sum -= xs[i - n]; have = n; }
    if (have === n) out[i] = sum / n;
  }
  return out;
}

/**
 * EXPONENTIAL MOVING AVERAGE, seeded on the simple average of the first
 * `len` values — the standard seeding, and the one every charting package
 * uses, so the line here and the line on TradingView start at the same
 * place. The multiplier is 2 / (len + 1).
 */
export function ema(series, len) {
  const xs = clean(series);
  const n = Math.max(1, Math.round(Number(len) || 0));
  const out = new Array(xs.length).fill(null);
  const k = 2 / (n + 1);
  let prev = null, sum = 0, have = 0;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] == null) { prev = null; sum = 0; have = 0; continue; }
    if (prev == null) {
      sum += xs[i]; have++;
      if (have === n) { prev = sum / n; out[i] = prev; }
      continue;
    }
    prev = xs[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** The population standard deviation of the `len` values ending at `i`. */
function stdevAt(xs, len, i, mean) {
  let s = 0;
  for (let j = i - len + 1; j <= i; j++) {
    if (xs[j] == null) return null;
    s += (xs[j] - mean) ** 2;
  }
  return Math.sqrt(s / len);
}

/**
 * BOLLINGER BANDS — the moving average with a band `sd` standard deviations
 * either side. Returns three aligned arrays.
 */
export function bollinger(series, len = PERIODS.BOLL_LEN, sd = PERIODS.BOLL_SD) {
  const xs = clean(series);
  const n = Math.max(1, Math.round(Number(len) || 0));
  const mid = sma(xs, n);
  const upper = new Array(xs.length).fill(null);
  const lower = new Array(xs.length).fill(null);
  for (let i = 0; i < xs.length; i++) {
    if (mid[i] == null) continue;
    const s = stdevAt(xs, n, i, mid[i]);
    if (s == null) continue;
    upper[i] = mid[i] + sd * s;
    lower[i] = mid[i] - sd * s;
  }
  return { mid, upper, lower, sd };
}

/**
 * RELATIVE STRENGTH INDEX.
 *
 * >>> THIS IS NOT WILDER'S SMOOTHED RSI, AND THAT IS SAID RATHER THAN
 *     SILENTLY CHANGED. <<<
 *
 * Wilder's original smooths the average gain and the average loss the way an
 * exponential average does, so every bar in the history still has some
 * weight. This one is the SIMPLE mean of the gains and losses over the last
 * `len` changes and nothing before them — the variant usually attributed to
 * Cutler, and the arithmetic `signals.js` has used since the four-factor
 * engine was written.
 *
 * It is kept because the four-factor score has ALWAYS read it, and moving
 * the trend read into this file must not move the score: a refactor that
 * changes a number is two changes wearing one coat. The chart draws THE SAME
 * READING the score uses, so this app has one RSI and not two — which is the
 * whole reason this file exists.
 *
 * The consequence is real and is on the PRD's NOT VERIFIED list: a charting
 * package will print a slightly different number on the same bars. Switching
 * to Wilder's is a measured decision nobody has made, and it is ROADMAP P8.
 */
export function rsi(series, len = PERIODS.RSI_LEN) {
  const xs = clean(series);
  const n = Math.max(1, Math.round(Number(len) || 0));
  const out = new Array(xs.length).fill(null);
  for (let i = n; i < xs.length; i++) {
    let gain = 0, loss = 0, ok = true;
    for (let j = i - n + 1; j <= i; j++) {
      if (xs[j] == null || xs[j - 1] == null) { ok = false; break; }
      const d = xs[j] - xs[j - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    if (!ok) continue;
    // NO LOSSES AT ALL IS 100, not a division by zero. `signals.js` has
    // always spelled it this way and the value is unchanged.
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/**
 * MACD — the fast exponential average minus the slow one, with an
 * exponential average of that difference as the signal line, and the gap
 * between the two as the histogram.
 */
export function macd(series, fast = PERIODS.MACD_FAST, slow = PERIODS.MACD_SLOW, sig = PERIODS.MACD_SIGNAL) {
  const xs = clean(series);
  const f = ema(xs, fast), s = ema(xs, slow);
  const line = xs.map((_, i) => (f[i] == null || s[i] == null ? null : f[i] - s[i]));
  // The signal line is an average OF THE MACD LINE, so it can only start
  // once the line has: the leading nulls are dropped, averaged, and put back
  // in place, rather than being fed to `ema()` as if they were prices.
  const from = line.findIndex((v) => v != null);
  const signal = new Array(xs.length).fill(null);
  if (from >= 0) {
    const tail = ema(line.slice(from), sig);
    for (let i = 0; i < tail.length; i++) signal[from + i] = tail[i];
  }
  const hist = xs.map((_, i) => (line[i] == null || signal[i] == null ? null : line[i] - signal[i]));
  return { line, signal, hist };
}

/**
 * AVERAGE TRUE RANGE — how far this market moves in a day, in dollars.
 * True range is the greatest of: today's high minus today's low, the
 * distance from yesterday's close up to today's high, and the distance from
 * yesterday's close down to today's low. The third and second exist so a gap
 * overnight counts as movement, which it is.
 *
 * The average is a SIMPLE mean of the last `len` true ranges, for the same
 * reason `rsi()` above uses one: one smoothing convention in this file, said
 * out loud, rather than two that look alike.
 */
export function atr(bars, len = PERIODS.ATR_LEN) {
  const bs = Array.isArray(bars) ? bars : [];
  const tr = bs.map((b, i) => {
    const hi = Number(b && b.high), lo = Number(b && b.low);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
    if (i === 0) return hi - lo;
    const pc = Number(bs[i - 1] && bs[i - 1].close);
    if (!Number.isFinite(pc)) return hi - lo;
    return Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc));
  });
  return sma(tr, len);
}

/** Today's volume and the average of the last `len` days of it. */
export function volumeRead(bars, len = PERIODS.VOL_AVG_LEN) {
  const bs = Array.isArray(bars) ? bars : [];
  const vols = bs.map((b) => {
    // `Number(null)` IS 0 AND 0 IS FINITE — caught here by this file's own
    // test, and a zero-volume day is a real and different fact from a day
    // whose volume the feed did not send.
    const raw = b && b.volume;
    if (raw == null || raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  });
  return { volume: vols, average: sma(vols, len) };
}

/* ------------------------------------------------------------------
   CROSSINGS — the event, with the date it happened

   A crossing is a fact about two series and a moment, and the copilot is
   given it as a typed fact rather than left to find one in a wall of bars.
------------------------------------------------------------------ */

/**
 * Every place `a` crosses `b`, most recent last.
 * @returns [{ i, time, dir }] — dir +1 when `a` crossed UP through `b`.
 *
 * A bar where either series is null is not a crossing and does not end a
 * run: it is a hole, and a hole is unknown.
 */
export function crossings(a, b, times = []) {
  const out = [];
  let prev = null;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] == null || b[i] == null) continue;
    const sign = a[i] > b[i] ? 1 : a[i] < b[i] ? -1 : 0;
    if (sign === 0) continue;
    if (prev != null && sign !== prev) out.push({ i, time: times[i] ?? null, dir: sign });
    prev = sign;
  }
  return out;
}

/** The most recent crossing, or null. */
export const lastCrossing = (xs) => (xs && xs.length ? xs[xs.length - 1] : null);

/** How many bars ago a crossing was, or null if there was none. */
export const barsSince = (cross, total) => (cross && Number.isFinite(total) ? total - 1 - cross.i : null);

/* ------------------------------------------------------------------
   THE WHOLE READING, IN ONE CALL

   `indicatorSet(bars)` is what a chart, a copilot context and a takeaway
   sentence all read. One pass, one set of numbers, so the line on the pane
   and the number in the sentence and the figure the model is given cannot
   be three different readings of one market.
------------------------------------------------------------------ */

const lastOf = (xs) => {
  if (!Array.isArray(xs)) return null;
  for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return xs[i];
  return null;
};
/** The value at the last bar — null if the last bar has none. Different
 *  from `lastOf`, which reaches back for the newest value that exists. */
const atLast = (xs) => (Array.isArray(xs) && xs.length ? xs[xs.length - 1] ?? null : null);

/**
 * @param bars  daily bars, oldest first: { time, open, high, low, close, volume }
 * @returns {{ bars, times, closes, ready, series, last, crosses, notes }}
 *   `ready` is per indicator: false means there were not enough bars, and
 *   `notes[name]` says so in one sentence. NEVER a line drawn from zero.
 */
export function indicatorSet(bars) {
  const bs = Array.isArray(bars) ? bars.filter(Boolean) : [];
  const times = bs.map((b) => b.time ?? null);
  const closes = bs.map((b) => Number(b.close));
  const P = PERIODS;

  const series = {
    sma20: sma(closes, P.SMA_FAST),
    sma50: sma(closes, P.SMA_MID),
    sma200: sma(closes, P.SMA_SLOW),
    ema9: ema(closes, P.EMA_FAST),
    ema21: ema(closes, P.EMA_SLOW),
    rsi: rsi(closes, P.RSI_LEN),
    atr: atr(bs, P.ATR_LEN),
  };
  const bb = bollinger(closes, P.BOLL_LEN, P.BOLL_SD);
  const md = macd(closes, P.MACD_FAST, P.MACD_SLOW, P.MACD_SIGNAL);
  const vol = volumeRead(bs, P.VOL_AVG_LEN);
  series.bbUpper = bb.upper; series.bbMid = bb.mid; series.bbLower = bb.lower;
  series.macd = md.line; series.macdSignal = md.signal; series.macdHist = md.hist;
  series.volume = vol.volume; series.volumeAvg = vol.average;

  const need = {
    sma20: P.SMA_FAST, sma50: P.SMA_MID, sma200: P.SMA_SLOW,
    ema9: P.EMA_FAST, ema21: P.EMA_SLOW, rsi: P.RSI_LEN + 1, atr: P.ATR_LEN,
    bollinger: P.BOLL_LEN, macd: P.MACD_SLOW + P.MACD_SIGNAL, volumeAvg: P.VOL_AVG_LEN,
  };
  const ready = {}, notes = {};
  for (const [k, n] of Object.entries(need)) {
    ready[k] = bs.length >= n;
    notes[k] = ready[k] ? null
      : `${LABELS[k] || k} needs ${n} daily bars and this market has loaded ${bs.length}. ` +
        `Nothing is drawn for it: an average of fewer days than it is named after is a different ` +
        `average, and a line from zero is not a reading at all.`;
  }

  const last = {
    close: atLast(closes.map((c) => (Number.isFinite(c) ? c : null))),
    time: times.length ? times[times.length - 1] : null,
    sma20: atLast(series.sma20), sma50: atLast(series.sma50), sma200: atLast(series.sma200),
    ema9: atLast(series.ema9), ema21: atLast(series.ema21),
    rsi: atLast(series.rsi), atr: atLast(series.atr),
    bbUpper: atLast(series.bbUpper), bbMid: atLast(series.bbMid), bbLower: atLast(series.bbLower),
    macd: atLast(series.macd), macdSignal: atLast(series.macdSignal), macdHist: atLast(series.macdHist),
    volume: atLast(series.volume), volumeAvg: atLast(series.volumeAvg),
  };

  const crosses = {
    smaFastMid: crossings(series.sma20, series.sma50, times),
    emaFastSlow: crossings(series.ema9, series.ema21, times),
    macdSignal: crossings(series.macd, series.macdSignal, times),
    priceSlow: crossings(closes.map((c) => (Number.isFinite(c) ? c : null)), series.sma200, times),
  };

  return { bars: bs, times, closes, ready, notes, series, last, crosses, lastOf };
}

/** What each indicator is called on screen and in a sentence. */
export const LABELS = Object.freeze({
  sma20: `SMA ${PERIODS.SMA_FAST}`,
  sma50: `SMA ${PERIODS.SMA_MID}`,
  sma200: `SMA ${PERIODS.SMA_SLOW}`,
  ema9: `EMA ${PERIODS.EMA_FAST}`,
  ema21: `EMA ${PERIODS.EMA_SLOW}`,
  bollinger: `Bollinger ${PERIODS.BOLL_LEN}/${PERIODS.BOLL_SD}`,
  rsi: `RSI ${PERIODS.RSI_LEN}`,
  macd: `MACD ${PERIODS.MACD_FAST}/${PERIODS.MACD_SLOW}/${PERIODS.MACD_SIGNAL}`,
  atr: `ATR ${PERIODS.ATR_LEN}`,
  volumeAvg: `Volume vs ${PERIODS.VOL_AVG_LEN}-day average`,
});

/** What each indicator MEASURES, in one clause, for the first time a reader
 *  meets it. The app's teaching rule: define the term in the same sentence.
 *
 *  EVERY PERIOD IN THIS COPY IS READ FROM `PERIODS`, never typed a second
 *  time. The sentences said "a 21-day average" and "the last 14 days" as
 *  literals, so changing a period would have left the prose describing the
 *  old one — the same class of fault as a field name asserting a rule the
 *  arithmetic had not applied. (It is also how the rule-literal sweep in
 *  riskGate.test.js found this: a bare 21 beside the word "day" is
 *  indistinguishable from a copy of `RULES.exitDTE`, and the sweep was
 *  right to say so.) */
export const MEASURES = Object.freeze({
  sma20: `the average closing price of the last ${PERIODS.SMA_FAST} trading days`,
  sma50: `the average closing price of the last ${PERIODS.SMA_MID} trading days`,
  sma200: `the average closing price of the last ${PERIODS.SMA_SLOW} trading days, about a year`,
  ema9: `a ${PERIODS.EMA_FAST}-day average that weights the most recent days most heavily`,
  ema21: `a ${PERIODS.EMA_SLOW}-day average that weights the most recent days most heavily`,
  bollinger: `a band ${PERIODS.BOLL_SD} standard deviations either side of the ${PERIODS.BOLL_LEN}-day ` +
    `average — how far from ordinary today's price is`,
  rsi: `how much of the last ${PERIODS.RSI_LEN} days' movement was upward, on a 0-100 scale`,
  macd: `whether the trend is gaining or losing speed, from the gap between a ${PERIODS.MACD_FAST}-day ` +
    `and a ${PERIODS.MACD_SLOW}-day average`,
  atr: "how far this market moves in an average day, in dollars",
  volumeAvg: `how many shares changed hands today against the last ${PERIODS.VOL_AVG_LEN} days`,
});

/* ------------------------------------------------------------------
   THE TAKEAWAY — one generated sentence per indicator

   The visual contract in CLAUDE.md: every visual exposes one always-visible
   sentence generated from its own numbers. If it needs two, change the
   chart, not the copy.

   A takeaway NEVER states a direction it cannot read. With the indicator
   not ready it returns the `notes` sentence, which says how many bars are
   missing. A dash is not a reading and neither is a confident zero.
------------------------------------------------------------------ */

const money2 = (x) => `$${Math.abs(x).toFixed(2)}`;
const pct1 = (x) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

/**
 * @param name  one of the keys in LABELS
 * @param set   an `indicatorSet()` result
 * @returns {?string} one sentence, or null when this app has nothing to say
 */
export function takeaway(name, set) {
  if (!set) return null;
  if (set.notes[name]) return set.notes[name];
  const L = set.last;
  const ago = (c) => {
    const n = barsSince(c, set.bars.length);
    if (n == null) return "";
    return n === 0 ? " today" : n === 1 ? " yesterday" : ` ${n} trading days ago`;
  };

  if (name === "sma20" || name === "sma50" || name === "sma200") {
    const v = L[name];
    if (v == null || L.close == null) return null;
    const gap = L.close / v - 1;
    return `${LABELS[name]} — ${MEASURES[name]} — is ${money2(v)}, and the last close of ${money2(L.close)} is ` +
      `${pct1(gap)} ${gap >= 0 ? "above" : "below"} it.`;
  }
  if (name === "ema9" || name === "ema21") {
    const v = L[name];
    if (v == null || L.close == null) return null;
    return `${LABELS[name]} — ${MEASURES[name]} — is ${money2(v)}. It turns sooner than a simple average of the ` +
      `same length, which is useful early and wrong more often.`;
  }
  if (name === "bollinger") {
    if (L.bbUpper == null || L.bbLower == null || L.close == null) return null;
    const width = L.bbMid ? (L.bbUpper - L.bbLower) / L.bbMid : null;
    const where = L.close > L.bbUpper ? "above the upper band"
      : L.close < L.bbLower ? "below the lower band" : "inside the band";
    return `The ${PERIODS.BOLL_LEN}-day band runs ${money2(L.bbLower)} to ${money2(L.bbUpper)} and the last close of ` +
      `${money2(L.close)} is ${where}` +
      `${width != null ? `, with the band ${(width * 100).toFixed(1)}% of the average wide` : ""}. ` +
      `Outside it means unusually far from ordinary, not that it must come back.`;
  }
  if (name === "rsi") {
    if (L.rsi == null) return null;
    const state = L.rsi >= RSI_HIGH ? `above ${RSI_HIGH}, which is a stretched advance`
      : L.rsi <= RSI_LOW ? `below ${RSI_LOW}, which is a stretched decline`
        : `between ${RSI_LOW} and ${RSI_HIGH}, the ordinary range`;
    return `RSI is ${L.rsi.toFixed(0)} — ${MEASURES.rsi} — ${state}. Stretched is not a signal to trade ` +
      `against: a strong trend can hold an extreme reading for weeks.`;
  }
  if (name === "macd") {
    if (L.macd == null || L.macdSignal == null) return null;
    const c = lastCrossing(set.crosses.macdSignal);
    return `MACD is ${L.macd >= 0 ? "above" : "below"} zero at ${L.macd.toFixed(3)} with its signal line at ` +
      `${L.macdSignal.toFixed(3)}, so momentum is ${L.macdHist >= 0 ? "building" : "fading"}` +
      `${c ? `, and the two last crossed ${c.dir > 0 ? "upward" : "downward"}${ago(c)}` : ""}. ` +
      `It measures speed, never direction on its own.`;
  }
  if (name === "atr") {
    if (L.atr == null || L.close == null) return null;
    return `This market moves about ${money2(L.atr)} in an average day, which is ` +
      `${((L.atr / L.close) * 100).toFixed(1)}% of the ${money2(L.close)} price. Compare that with how far your ` +
      `break-even is from here: that distance divided by this is roughly how many ordinary days it takes.`;
  }
  if (name === "volumeAvg") {
    if (L.volume == null || L.volumeAvg == null || !(L.volumeAvg > 0)) return null;
    const r = L.volume / L.volumeAvg;
    return `Today ${Math.round(L.volume).toLocaleString("en-US")} shares changed hands, ` +
      `${r >= 1 ? `${r.toFixed(1)} times` : `${(r * 100).toFixed(0)}% of`} the ${PERIODS.VOL_AVG_LEN}-day average. ` +
      `A move on light volume is a move fewer people took part in.`;
  }
  return null;
}

/* ------------------------------------------------------------------
   THE TREND READ — the one `signals.js` scores

   It lived inline in `signals.js` and its arithmetic is unchanged, to the
   value: `indicators.test.js` runs the old body and this one over the same
   bars and holds every field equal. What moved is WHERE it is computed, so
   the chart above it and the score beside it read one set of numbers.
------------------------------------------------------------------ */

/**
 * @returns {?{ trend, rsi, s20, s50, cross, px }} null under MIN_TREND_BARS.
 *   `trend` +1 up / −1 down / 0 none; `cross` "golden" | "death" | null.
 *
 * The trend is UP when the fast average is above the slow one AND rising
 * against itself five bars ago — an average above another that is falling is
 * a trend ending, not a trend. The five is the lookback `signals.js` has
 * always used and it is unchanged.
 */
export function trendRead(bars) {
  const bs = Array.isArray(bars) ? bars : [];
  if (bs.length < MIN_TREND_BARS) return null;
  const closes = bs.map((b) => b.close);
  const fast = sma(closes, PERIODS.SMA_FAST);
  const mid = sma(closes, PERIODS.SMA_MID);
  const i = closes.length - 1;
  const back = i - 5;
  const s20 = fast[i], s50 = mid[i], s20p = fast[back], s50p = mid[back];
  if (s20 == null || s50 == null || s20p == null || s50p == null) return null;
  const r = rsi(closes, PERIODS.RSI_LEN)[i];
  if (r == null) return null;
  const trend = s20 > s50 && s20 > s20p ? 1 : s20 < s50 && s20 < s20p ? -1 : 0;
  const cross = s20 > s50 && s20p <= s50p ? "golden" : s20 < s50 && s20p >= s50p ? "death" : null;
  return { trend, rsi: r, s20, s50, cross, px: closes[i] };
}

/* ------------------------------------------------------------------
   THE TYPED CONTEXT — what the copilot is allowed to see

   >>> THE MODEL NEVER RECEIVES RAW BARS. <<< This is the whole rule of the
   technical copilot, and it is a rule about arithmetic rather than about
   tone: a model handed 400 daily closes will compute a moving average, and
   the number it computes will not be the number on the chart beside its
   answer. This app has spent four pull requests removing second
   implementations of one figure; it is not adding one that nobody can even
   read afterwards.

   So the model is handed THIS, and only this: the values `indicatorSet()`
   already produced, the crossings with their dates, and — when a trade is
   loaded on the Build screen — that structure's own legs and break-evens.
   Everything in it is a figure some part of the screen is also showing.

   `taContext()` is the ONLY source. `rules.js` writes the prompt that
   forbids inventing anything outside it, and `indicators.test.js` holds
   both halves.
------------------------------------------------------------------ */

const r2 = (x, d = 2) => (x == null ? null : +Number(x).toFixed(d));

/**
 * @param bars       the same daily bars the chart drew
 * @param structure  the trade on the Build screen, or null
 * @returns a plain object, JSON-serialisable, with no bar series in it
 */
export function taContext(bars, structure = null) {
  const set = indicatorSet(bars);
  const L = set.last;
  const cross = (xs) => {
    const c = lastCrossing(xs);
    if (!c) return null;
    return { direction: c.dir > 0 ? "up" : "down", date: c.time, trading_days_ago: barsSince(c, set.bars.length) };
  };
  const trend = trendRead(set.bars);

  const ctx = {
    what_this_is: "Every number below was computed by the app from daily bars and is the same number drawn on the chart. There are no price bars in this context on purpose.",
    bars_loaded: set.bars.length,
    last_bar_date: L.time,
    last_close: r2(L.close),
    indicators_not_available: Object.entries(set.ready).filter(([, ok]) => !ok).map(([k]) => k),
    moving_averages: {
      sma20: r2(L.sma20), sma50: r2(L.sma50), sma200: r2(L.sma200),
      ema9: r2(L.ema9), ema21: r2(L.ema21),
      close_vs_sma20_pct: L.sma20 && L.close ? r2((L.close / L.sma20 - 1) * 100, 1) : null,
      close_vs_sma50_pct: L.sma50 && L.close ? r2((L.close / L.sma50 - 1) * 100, 1) : null,
      close_vs_sma200_pct: L.sma200 && L.close ? r2((L.close / L.sma200 - 1) * 100, 1) : null,
    },
    trend_read: trend
      ? { direction: trend.trend > 0 ? "up" : trend.trend < 0 ? "down" : "none",
        cross: trend.cross, note: "This is the same trend reading the app's four-factor score uses." }
      : { direction: null, note: `Fewer than ${MIN_TREND_BARS} daily bars, so the app forms no trend reading at all.` },
    crossings: {
      sma20_vs_sma50: cross(set.crosses.smaFastMid),
      ema9_vs_ema21: cross(set.crosses.emaFastSlow),
      macd_vs_signal: cross(set.crosses.macdSignal),
      price_vs_sma200: cross(set.crosses.priceSlow),
    },
    bollinger: {
      length: PERIODS.BOLL_LEN, standard_deviations: PERIODS.BOLL_SD,
      upper: r2(L.bbUpper), middle: r2(L.bbMid), lower: r2(L.bbLower),
      close_position: L.bbUpper == null || L.close == null ? null
        : L.close > L.bbUpper ? "above the upper band"
          : L.close < L.bbLower ? "below the lower band" : "inside the band",
    },
    rsi: { length: PERIODS.RSI_LEN, value: r2(L.rsi, 1), high_mark: RSI_HIGH, low_mark: RSI_LOW,
      variant: "Simple average of the last 14 changes (Cutler's), NOT Wilder's smoothing. A charting package may print a slightly different number." },
    macd: { fast: PERIODS.MACD_FAST, slow: PERIODS.MACD_SLOW, signal_length: PERIODS.MACD_SIGNAL,
      macd: r2(L.macd, 3), signal: r2(L.macdSignal, 3), histogram: r2(L.macdHist, 3) },
    atr: { length: PERIODS.ATR_LEN, dollars: r2(L.atr), percent_of_price: L.atr && L.close ? r2((L.atr / L.close) * 100, 1) : null },
    volume: { today: L.volume == null ? null : Math.round(L.volume),
      average_length: PERIODS.VOL_AVG_LEN, average: L.volumeAvg == null ? null : Math.round(L.volumeAvg),
      ratio: L.volume != null && L.volumeAvg > 0 ? r2(L.volume / L.volumeAvg) : null },
    takeaways: Object.fromEntries(Object.keys(LABELS).map((k) => [k, takeaway(k, set)])),
  };

  /* THE TRADE, WHEN THERE IS ONE. Its break-evens are what make an ATR worth
     quoting — "the market moves $0.44 a day and your break-even is $1.30
     away" is the one sentence that joins a chart to a position. The legs and
     the break-evens come from `analyze()` on the Build screen: this repeats
     them, it does not recompute them. */
  ctx.your_trade = structure && Array.isArray(structure.legs) && structure.legs.length
    ? {
      name: structure.name || null,
      expiry: structure.expKey || null,
      days_to_expiration: structure.dte ?? null,
      spot: r2(structure.spot),
      legs: structure.legs.map((l) => ({
        side: Number(l.side) > 0 ? "long" : "short",
        quantity: Math.abs(Number(l.qty) || 1),
        type: l.type === "put" ? "put" : "call",
        strike: r2(l.strike),
      })),
      breakevens: Array.isArray(structure.breakevens) ? structure.breakevens.map((b) => r2(b)) : [],
      distance_to_breakevens_in_average_days: Array.isArray(structure.breakevens) && L.atr > 0 && L.close
        ? structure.breakevens.map((b) => r2(Math.abs(b - L.close) / L.atr, 1))
        : [],
      note: "These figures come from the trade loaded on the Build screen. They are not recomputed here.",
    }
    : { note: "No trade is loaded on the Build screen, so there are no legs or break-evens to relate this market to." };

  return ctx;
}
