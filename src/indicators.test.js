/* ============================================================================
   src/indicators.test.js

   Two jobs, and the first one is the important one:

   1. THE TREND READ MOVED AND DID NOT CHANGE. `signals.js` carried an inline
      SMA20/SMA50 + RSI14 body since the four-factor engine was written. It is
      in `indicators.js` now, where the chart can read the same numbers. The
      OLD BODY IS REPRODUCED HERE VERBATIM and run against the new one over
      the same bars: every field, every market, every length. A refactor that
      moves a number is two changes wearing one coat.

   2. UNKNOWN IS NOT A NUMBER. Every indicator returns null where there were
      not enough bars, the chart says how many are missing, and nothing is
      ever drawn from zero.
============================================================================ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  PERIODS, MIN_TREND_BARS, RSI_HIGH, RSI_LOW, LABELS, MEASURES,
  sma, ema, bollinger, rsi, macd, atr, volumeRead,
  crossings, lastCrossing, barsSince, indicatorSet, takeaway, trendRead, taContext,
} from "./indicators.js";
import { taCopilotPrompt, TA_QUESTIONS, TA_DISCLAIMER } from "./rules.js";
import { taRead, technicalComponent } from "./signals.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- deterministic bars ---------------- */

/** A seeded generator, so a failure is reproducible. Nothing here is random
 *  at run time: the same seed gives the same series for ever. */
function makeBars(n, seed = 7, start = 20) {
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p *= 1 + (rnd() - 0.48) * 0.03;
    const hi = p * (1 + rnd() * 0.012), lo = p * (1 - rnd() * 0.012);
    out.push({ time: `2026-01-${String(i % 28 + 1).padStart(2, "0")}`, open: p * 0.999,
      high: Math.max(hi, p), low: Math.min(lo, p), close: p, volume: Math.round(10000 + rnd() * 90000) });
  }
  return out;
}

/* ============================================================================
   1. THE BEFORE AND THE AFTER
============================================================================ */

/** `taRead()` EXACTLY AS IT WAS IN signals.js BEFORE THIS CHANGE, copied out
 *  of the file so the comparison is against the real thing and not against a
 *  description of it. `avg` was signals.js's own helper. */
function taReadBefore(bars) {
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  if (!bars || bars.length < 60) return null;
  const cl = bars.map((b) => b.close);
  const smaOld = (n, i = cl.length - 1) => avg(cl.slice(i - n + 1, i + 1));
  const s20 = smaOld(20), s50 = smaOld(50), s20p = smaOld(20, cl.length - 6), s50p = smaOld(50, cl.length - 6);
  let g = 0, l = 0;
  for (let i = cl.length - 14; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
  const rsiOld = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  const trend = s20 > s50 && s20 > s20p ? 1 : s20 < s50 && s20 < s20p ? -1 : 0;
  const cross = s20 > s50 && s20p <= s50p ? "golden" : s20 < s50 && s20p >= s50p ? "death" : null;
  return { trend, rsi: rsiOld, s20, s50, cross, px: cl[cl.length - 1] };
}

test("BEFORE / AFTER — the trend read is the SAME number, on 40 different series", () => {
  let compared = 0, crossesSeen = 0, trendsSeen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    for (const n of [60, 61, 75, 120, 400]) {
      const bars = makeBars(n, seed, 10 + (seed % 9) * 5);
      const before = taReadBefore(bars);
      const after = taRead(bars);
      assert.equal(after == null, before == null, `seed ${seed} n ${n}: one is null and the other is not`);
      if (!before) continue;
      compared++;
      trendsSeen.add(before.trend);
      if (before.cross) crossesSeen++;
      for (const k of ["trend", "cross", "px"]) {
        assert.equal(after[k], before[k], `seed ${seed} n ${n}: ${k} moved`);
      }
      for (const k of ["rsi", "s20", "s50"]) {
        assert.ok(Math.abs(after[k] - before[k]) < 1e-9,
          `seed ${seed} n ${n}: ${k} ${after[k]} vs ${before[k]}`);
      }
    }
  }
  // A COMPARISON THAT COMPARED NOTHING IS NOT A COMPARISON.
  assert.ok(compared >= 190, `only ${compared} readings compared`);
  assert.ok(crossesSeen > 0, "no series produced a crossing: the cross field was never exercised");
  assert.equal(trendsSeen.size, 3, `only ${[...trendsSeen]} trend values were produced`);
});

test("BEFORE / AFTER — the SCORE signals.js builds on it is unchanged too", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const bars = makeBars(200, seed, 12 + seed);
    const before = taReadBefore(bars);
    const c = technicalComponent(bars);
    // `technicalComponent` reads `taRead` and scores it. Rebuild its own
    // arithmetic from the OLD reading and hold the result equal.
    const sep = Math.abs(before.s20 / before.s50 - 1) * 100;
    const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
    let strength = before.trend === 0 ? 0 : clamp(Math.round(30 + 20 * sep), 0, 100);
    const stretched = (before.trend > 0 && before.rsi >= 70) || (before.trend < 0 && before.rsi <= 30);
    if (before.trend !== 0 && stretched) strength = Math.round(strength * 0.7);
    assert.equal(c.dir, before.trend, `seed ${seed}: direction moved`);
    assert.equal(c.strength, strength, `seed ${seed}: strength moved`);
  }
  // Under the bar count the component says so and scores nothing, as before.
  const thin = technicalComponent(makeBars(30));
  assert.equal(thin.dir, 0);
  assert.equal(thin.ta, null);
  assert.match(thin.why, /fewer than 60 daily bars/);
});

test("ONE IMPLEMENTATION — signals.js no longer carries its own", () => {
  const src = readFileSync(new URL("./signals.js", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.equal(/100\s*-\s*100\s*\/\s*\(\s*1\s*\+/.test(src), false,
    "signals.js is computing an RSI of its own again");
  assert.equal(/const\s+sma\s*=/.test(src), false, "signals.js is computing a moving average of its own again");
  assert.ok(/trendRead/.test(src), "signals.js must read its trend from indicators.js");
});

/* ============================================================================
   2. THE PRIMITIVES
============================================================================ */

test("SMA — the mean of the window, aligned with its own bar", () => {
  const xs = [1, 2, 3, 4, 5, 6];
  assert.deepEqual(sma(xs, 3), [null, null, 2, 3, 4, 5]);
  assert.deepEqual(sma(xs, 1), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(sma([1, 2], 3), [null, null], "not enough bars is null, never a partial average");
  assert.deepEqual(sma([], 3), []);
  // A rolling sum must not drift: compare against the direct mean on a long
  // series, because an accumulator is exactly how a long chart goes wrong.
  const long = makeBars(500, 3).map((b) => b.close);
  const rolled = sma(long, 50);
  for (const i of [49, 100, 250, 499]) {
    const direct = long.slice(i - 49, i + 1).reduce((a, b) => a + b, 0) / 50;
    assert.ok(Math.abs(rolled[i] - direct) < 1e-9, `drift at ${i}: ${rolled[i]} vs ${direct}`);
  }
});

test("EMA — seeded on the simple average, and the multiplier is 2/(n+1)", () => {
  const xs = [1, 2, 3, 4, 5, 6, 7];
  const e = ema(xs, 3);
  assert.deepEqual(e.slice(0, 2), [null, null]);
  assert.equal(e[2], 2, "seeded on the mean of the first three");
  const k = 2 / 4;
  assert.ok(Math.abs(e[3] - (4 * k + 2 * (1 - k))) < 1e-12);
  assert.deepEqual(ema([1, 2], 5), [null, null]);
});

test("RSI — all up is 100, all down is 0, and it is the reading signals.js scores", () => {
  const up = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  assert.equal(rsi(up, 14)[14], 100, "no losses at all is 100, not a division by zero");
  const down = up.slice().reverse();
  assert.equal(rsi(down, 14)[14], 0);
  assert.deepEqual(rsi([1, 2, 3], 14), [null, null, null]);
  // The value at the last bar IS what taRead reports.
  const bars = makeBars(120, 11);
  assert.ok(Math.abs(rsi(bars.map((b) => b.close), 14)[119] - taRead(bars).rsi) < 1e-9);
});

test("BOLLINGER — the band is the average plus and minus two deviations", () => {
  const xs = new Array(30).fill(10);
  const b = bollinger(xs, 20, 2);
  assert.equal(b.mid[25], 10);
  assert.equal(b.upper[25], 10, "a flat series has no width, and that is a real zero");
  assert.equal(b.lower[25], 10);
  const v = bollinger([1, 2, 3, 4, 5], 5, 1);
  assert.ok(Math.abs(v.mid[4] - 3) < 1e-12);
  assert.ok(Math.abs(v.upper[4] - (3 + Math.sqrt(2))) < 1e-12, `${v.upper[4]}`);
  assert.equal(v.mid[3], null);
});

test("MACD — the signal line averages the MACD LINE, not the prices", () => {
  const bars = makeBars(200, 5);
  const closes = bars.map((b) => b.close);
  const m = macd(closes, 12, 26, 9);
  assert.equal(m.line[24], null, "the line needs the slow average first");
  assert.ok(m.line[25] != null);
  // The signal cannot start before the line it averages has nine values.
  assert.equal(m.signal[25 + 7], null);
  assert.ok(m.signal[25 + 8] != null);
  for (let i = 0; i < closes.length; i++) {
    if (m.line[i] == null || m.signal[i] == null) { assert.equal(m.hist[i], null); continue; }
    assert.ok(Math.abs(m.hist[i] - (m.line[i] - m.signal[i])) < 1e-12);
  }
});

test("ATR — a gap overnight counts as movement", () => {
  const bars = [
    { high: 11, low: 10, close: 10.5 },
    { high: 11.2, low: 11.0, close: 11.1 },   // gapped up: true range is 11.2-10.5
  ];
  const a = atr(bars, 2);
  assert.ok(Math.abs(a[1] - ((11 - 10) + (11.2 - 10.5)) / 2) < 1e-12, `${a[1]}`);
  assert.equal(a[0], null);
  assert.deepEqual(atr([], 14), []);
});

test("VOLUME — today against its own average, and a missing volume is null", () => {
  const bars = [{ volume: 100 }, { volume: 200 }, { volume: 300 }, { volume: null }];
  const v = volumeRead(bars, 2);
  assert.equal(v.average[1], 150);
  assert.equal(v.volume[3], null, "a missing volume is unknown, never a zero-volume day");
  assert.equal(v.average[3], null);
});

test("CROSSINGS — the event, with its date, and a hole is not a crossing", () => {
  const a = [1, 3, 3, 1, 1];
  const b = [2, 2, 2, 2, 2];
  const t = ["d0", "d1", "d2", "d3", "d4"];
  const xs = crossings(a, b, t);
  assert.deepEqual(xs.map((x) => [x.i, x.time, x.dir]), [[1, "d1", 1], [3, "d3", -1]]);
  assert.equal(lastCrossing(xs).dir, -1);
  assert.equal(lastCrossing([]), null);
  assert.equal(barsSince(xs[1], 5), 1);
  assert.equal(barsSince(null, 5), null);
  // A null on either side is skipped, and does not itself count as a change.
  assert.deepEqual(crossings([1, null, 3], [2, 2, 2], t).map((x) => x.i), [2]);
});

/* ============================================================================
   3. UNKNOWN IS NOT A NUMBER
============================================================================ */

test("A SHORT HISTORY DRAWS NOTHING, AND SAYS HOW MUCH IS MISSING", () => {
  const set = indicatorSet(makeBars(30, 2));
  assert.equal(set.ready.sma20, true, "20 of 30 bars is enough for a 20-day average");
  assert.equal(set.ready.sma50, false);
  assert.equal(set.ready.sma200, false);
  assert.equal(set.ready.macd, false);
  assert.equal(set.last.sma50, null, "not enough bars is null, never zero and never a partial mean");
  assert.equal(set.last.sma200, null);
  for (const k of ["sma50", "sma200", "macd"]) {
    assert.ok(/needs \d+ daily bars/.test(set.notes[k]), set.notes[k]);
    assert.ok(set.notes[k].includes("30"), `${k} must name how many bars there are: ${set.notes[k]}`);
    // The takeaway IS the note when there is nothing to read — never a dash.
    assert.equal(takeaway(k, set), set.notes[k]);
  }
  // No series contains a zero standing in for a missing value.
  for (const [name, xs] of Object.entries(set.series)) {
    if (name === "volume" || name === "volumeAvg") continue;
    for (let i = 0; i < 20; i++) {
      assert.notEqual(xs[i], 0, `${name} drew a zero at bar ${i} instead of nothing`);
    }
  }
  // And an empty history is not a crash.
  const none = indicatorSet([]);
  assert.equal(none.last.close, null);
  assert.equal(none.ready.sma20, false);
  assert.deepEqual(none.crosses.smaFastMid, []);
  assert.equal(indicatorSet(null).bars.length, 0);
  assert.equal(indicatorSet(undefined).closes.length, 0);
});

test("EVERY INDICATOR HAS A LABEL, A MEASURE AND A TAKEAWAY", () => {
  const set = indicatorSet(makeBars(400, 4));
  for (const k of Object.keys(LABELS)) {
    assert.ok(MEASURES[k], `${k} has no plain-English measure`);
    const t = takeaway(k, set);
    assert.ok(t && t.length > 40, `${k} has no takeaway: ${t}`);
    // ONE SENTENCE IS THE CONTRACT — allow the second that names the caveat,
    // which is the teaching half, but never a paragraph.
    assert.ok(t.split(/(?<=[.!?])\s+/).length <= 3, `${k}'s takeaway is a paragraph: ${t}`);
    assert.equal(/NaN|undefined|Infinity/.test(t), false, `${k}: ${t}`);
  }
  // The teaching rule: a term is defined the first time it is used.
  assert.ok(takeaway("rsi", set).includes(MEASURES.rsi), takeaway("rsi", set));
  assert.equal(takeaway("nonsense", set), null);
  assert.equal(takeaway("rsi", null), null);
});

test("THE PERIODS ARE NAMED, AND THEY ARE NOT TRADING RULES", () => {
  assert.deepEqual(
    [PERIODS.SMA_FAST, PERIODS.SMA_MID, PERIODS.SMA_SLOW], [20, 50, 200]);
  assert.deepEqual([PERIODS.EMA_FAST, PERIODS.EMA_SLOW], [9, 21]);
  assert.deepEqual([PERIODS.BOLL_LEN, PERIODS.BOLL_SD], [20, 2]);
  assert.equal(PERIODS.RSI_LEN, 14);
  assert.deepEqual([PERIODS.MACD_FAST, PERIODS.MACD_SLOW, PERIODS.MACD_SIGNAL], [12, 26, 9]);
  assert.equal(PERIODS.ATR_LEN, 14);
  assert.equal(PERIODS.VOL_AVG_LEN, 20);
  assert.equal(MIN_TREND_BARS, 60);
  assert.deepEqual([RSI_HIGH, RSI_LOW], [70, 30]);
  assert.throws(() => { PERIODS.RSI_LEN = 9; }, /read only|Cannot assign/i);
  // The file says out loud that its RSI is not Wilder's, because a reader who
  // compares it against a charting package will find a different number.
  const src = readFileSync(new URL("./indicators.js", import.meta.url), "utf8");
  assert.ok(/NOT WILDER/i.test(src), "the RSI variant in use must be stated, not implied");
  assert.ok(/imports nothing|no imports/i.test(src), "indicators.js is a leaf and says so");
  assert.equal(/^import /m.test(src), false, "indicators.js must import nothing");
});

test("trendRead — the guard is the bar count, and null is null", () => {
  assert.equal(trendRead(makeBars(59)), null);
  assert.ok(trendRead(makeBars(60)) != null);
  assert.equal(trendRead([]), null);
  assert.equal(trendRead(null), null);
  const r = trendRead(makeBars(120, 9));
  assert.ok([1, 0, -1].includes(r.trend));
  assert.ok(r.rsi >= 0 && r.rsi <= 100);
});

/* ============================================================================
   4. THE COPILOT'S CONTEXT — the only thing the model is allowed to see
============================================================================ */

test("CONTEXT — no price bars reach the model, ever", () => {
  const bars = makeBars(400, 6);
  const ctx = taContext(bars, null);
  const json = JSON.stringify(ctx);
  // The whole rule, checked the only way it can be: the serialised context
  // must not contain a series. A model handed 400 closes computes its own
  // moving average, and that number is not the one on the chart.
  assert.equal(/"open"|"high"|"low"|"volume":\s*\[/.test(json), false, "a bar field reached the context");
  for (const [k, v] of Object.entries(ctx)) {
    assert.equal(Array.isArray(v) && v.length > 12, false, `${k} is a series, not a reading`);
  }
  assert.equal(json.includes("\"bars\""), false, "the context must not carry a bars array");
  assert.ok(json.length < 6000, `the context is ${json.length} characters: it has stopped being a summary`);
  // Everything in it IS in the reading the chart drew.
  const set = indicatorSet(bars);
  assert.equal(ctx.last_close, +set.last.close.toFixed(2));
  assert.equal(ctx.moving_averages.sma20, +set.last.sma20.toFixed(2));
  assert.equal(ctx.rsi.value, +set.last.rsi.toFixed(1));
  assert.equal(ctx.bars_loaded, 400);
  // The RSI variant travels with the number, because a reader comparing it
  // against a charting package will find a different one.
  assert.ok(/NOT Wilder/i.test(ctx.rsi.variant), ctx.rsi.variant);
});

test("CONTEXT — a short history says which indicators do not exist", () => {
  const ctx = taContext(makeBars(30, 8), null);
  assert.ok(ctx.indicators_not_available.includes("sma200"), JSON.stringify(ctx.indicators_not_available));
  assert.ok(ctx.indicators_not_available.includes("macd"));
  assert.equal(ctx.moving_averages.sma200, null, "unknown is null, never a number the model can quote");
  assert.equal(ctx.trend_read.direction, null);
  assert.match(ctx.trend_read.note, /Fewer than 60 daily bars/);
  // An empty history is a context, not a crash.
  const none = taContext([], null);
  assert.equal(none.bars_loaded, 0);
  assert.equal(none.last_close, null);
});

test("CONTEXT — the trade is REPEATED from the Build screen, never recomputed", () => {
  const bars = makeBars(400, 2);
  const withTrade = taContext(bars, {
    name: "Bull Call Spread", expKey: "2026-11-20", dte: 45, spot: 21.4,
    legs: [{ side: 1, qty: 1, type: "call", strike: 21 }, { side: -1, qty: 1, type: "call", strike: 23 }],
    breakevens: [21.62],
  });
  assert.equal(withTrade.your_trade.legs.length, 2);
  assert.equal(withTrade.your_trade.legs[0].side, "long");
  assert.equal(withTrade.your_trade.legs[1].side, "short");
  assert.deepEqual(withTrade.your_trade.breakevens, [21.62], "the break-even is analyze()'s, repeated");
  assert.equal(withTrade.your_trade.days_to_expiration, 45);
  assert.ok(/not recomputed here/i.test(withTrade.your_trade.note));
  // The one number the context DOES form from the trade is a distance in
  // ordinary days, which is the sentence an ATR exists to make possible.
  assert.equal(withTrade.your_trade.distance_to_breakevens_in_average_days.length, 1);
  // AND NO TRADE IS NOT AN EMPTY TRADE.
  const without = taContext(bars, null);
  assert.equal(without.your_trade.legs, undefined);
  assert.match(without.your_trade.note, /No trade is loaded/);
  assert.equal(taContext(bars, { legs: [] }).your_trade.legs, undefined);
});

test("PROMPT — it forbids inventing a figure, and says the context is the only source", () => {
  const p = taCopilotPrompt();
  // THE RULE THIS WHOLE PANEL EXISTS FOR, in the prompt's own words.
  assert.match(p, /may not produce any others/i);
  assert.match(p, /every number you write must be quoted from it/i);
  assert.match(p, /not given the price bars/i);
  assert.match(p, /Do not compute, estimate, infer or recall any figure that is not in the context/i);
  // Unknown is not zero, and a missing indicator is named rather than described.
  assert.match(p, /null is UNKNOWN and is never zero/i);
  assert.match(p, /indicators_not_available/);
  // The educational register, and the disclaimer ONCE.
  assert.ok(p.includes(TA_DISCLAIMER), "the disclaimer line must be in the prompt");
  assert.equal(p.split(TA_DISCLAIMER).length - 1, 1, "the disclaimer appears exactly once");
  assert.match(p, /what it MEASURES/);
  assert.match(p, /what it is SAYING right now/);
  assert.match(p, /what would make that read WRONG/);
  // It explains a chart; it does not propose a trade.
  assert.match(p, /Do not recommend a trade, a strike or an expiry/i);
  assert.match(p, /Do not guarantee an outcome/i);
  // No tables: the Markdown renderer exists because the prompt drifted once.
  assert.match(p, /No tables, no pipe characters, no code fences/i);
});

test("PROMPT — the four one-tap questions are questions, and they are named here", () => {
  assert.equal(TA_QUESTIONS.length, 4);
  for (const q of TA_QUESTIONS) {
    assert.ok(q.id && q.label && q.ask, JSON.stringify(q));
    assert.ok(q.label.length < 40, `"${q.label}" will not fit on a 390px chip row`);
    assert.ok(q.ask.endsWith("?"), `"${q.ask}" is not a question`);
  }
  assert.equal(new Set(TA_QUESTIONS.map((q) => q.id)).size, 4);
  // One of them relates the chart to the trade, which is the only reason the
  // break-evens are in the context at all.
  assert.ok(TA_QUESTIONS.some((q) => /break-even/i.test(q.ask)), "no question uses the trade in the context");
});

test("THE PANEL HAS NO SECOND SOURCE, and the desk prompt no longer recommends what the app refuses", () => {
  const pro = readFileSync(new URL("./pro.jsx", import.meta.url), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const panel = pro.slice(pro.indexOf("export function TaCopilot"), pro.indexOf("export function CopilotTab"));
  assert.ok(panel.length > 500, "TaCopilot must be findable");
  // ONE SOURCE. The panel builds its context with taContext() and hands the
  // model nothing else — no bars, no second indicator call of its own.
  assert.ok(/taContext\(\s*bars\s*,\s*structure\s*\)/.test(panel), "the panel must build its context with taContext()");
  assert.equal(/JSON\.stringify\(\s*bars/.test(panel), false, "the panel is serialising the bars to the model");
  assert.equal(/indicatorSet\(/.test(panel), false, "the panel recomputes the indicators instead of reading taContext()");
  assert.ok(/taCopilotPrompt\(\)/.test(panel), "the panel must send the chart prompt, not the desk one");
  // STATE LIVES ABOVE THE PANEL.
  assert.equal(/useState\(\s*\{\s*msgs/.test(panel), false, "the conversation must be owned by App.jsx, not by the panel");
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/const \[taChat, setTaChat\] = useState/.test(app), "App.jsx owns the chart copilot's conversation");
  // A CUT-OFF ANSWER IS LABELLED, AND IS NOT FILED.
  assert.ok(/CUT OFF/.test(panel) && /RAN OUT OF ROOM/.test(panel), "both endings must be named");
  assert.ok(/truncated/.test(panel));

  /* AND THE DESK PROMPT'S DECISION TREES — ROADMAP P3's first item. They
     recommended a long call and a long straddle, both of which `runWizard`
     excludes, so the copilot argued with the screen beside it. */
  const sysAt = pro.indexOf("const SYSTEM_PROMPT");
  const sys = pro.slice(sysAt, pro.indexOf("`;", sysAt));
  assert.equal(/→ bull call spread \(small capital\) or long call/.test(sys), false,
    "the desk prompt still recommends a long call, which the guided path excludes");
  assert.equal(/long ATM straddle\/strangle/.test(sys), false,
    "the desk prompt still recommends a straddle, which is two single-leg longs");
  assert.ok(/NEVER recommend one of those/.test(sys), "it must say which structures are off the menu");
  assert.ok(/RECOMMEND NOTHING/.test(sys), '"nothing today" must be one of the branches');
  for (const word of ["LONG options", "STRADDLES and STRANGLES", "BUTTERFLIES"]) {
    assert.ok(sys.includes(word), `the excluded structures must be named: ${word}`);
  }
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(`\nFAILED: ${f.name}\n${f.e.stack}`); process.exit(1); }
