// Tests for the 4-factor confluence engine (src/signals.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import assert from "node:assert/strict";
import { TICKERS } from "./markets.js";
import { fuseSignals, weatherComponent, newsComponent, ageDecay, regionSignals,
  sentimentDirection, signalAdjustment, rankScore, compareCandidates, withSignalRank, againstSignal,
  weatherApplies, weatherNaReason, factorsOf, tagImpacts, seasonalComponent, REGIONS,
  readingState, readingLine, unreadInputsAria, signalSnapshot, compareSignals,
  verdictLine, scoreWorking, confidenceWorking, signalDirection, signalFamilies,
  FIND_ORDERS, DEFAULT_FIND_ORDER, findOrderOf, findOrderKey, findOrderCompare, placeLine, placeSignal, numbersFitLines, NEUTRAL_QUIET, SIGNAL_DIVISOR, BASE_WEIGHTS, REINFORCE, CONFLICT_DAMPING, CONFIDENCE_BANDS } from "./signals.js";
import { readFileSync } from "node:fs";
import { seasonalSignal, RULES } from "./rules.js";
/* A MEASURED SEASON FOR A FIXTURE (PR #48): every month at `x`%, 16 years, a standard error of 0.4% — so a month
   counts when |x| ≥ 0.8 (RULES.seasonalSignalT = 2 × 0.4), the same line the retired ±0.8% band drew. */
const seasonAt = (x, dte = 30) => seasonalSignal({ monthlyMean: Array(12).fill(x), monthN: Array(12).fill(16),
  monthSE: Array(12).fill(0.4) }, 6, dte);


/* ---------------- tiny harness ---------------- */
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

/* ---------------- fixtures ---------------- */
const NOW = Date.UTC(2025, 6, 15); // 15 July 2025
const JULY = 6, SEPTEMBER = 8;
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

const forecast = (tmax, rainTotal, len = 14) => ({
  tmax: Array.from({ length: len }, () => tmax),
  tmin: Array.from({ length: len }, () => tmax - 10),
  prec: Array.from({ length: len }, () => rainTotal / len),
  dates: Array.from({ length: len }, (_, i) => new Date(NOW + i * 86400000).toISOString().slice(0, 10)),
});

// Deterministic bar series, no RNG: 80 daily closes.
const bars = (kind) => Array.from({ length: 80 }, (_, i) => {
  const close = kind === "up" ? 100 * (1 + 0.004 * i) + 0.4 * Math.sin(i)
    : kind === "down" ? 140 * (1 - 0.004 * i) + 0.4 * Math.sin(i)
      : 100 + (i % 2 ? 0.5 : -0.5);
  return { open: close, high: close + 1, low: close - 1, close };
});

// Hot and dry over every region that drives CORN: three concurring regions.
const HOT_DRY_JULY = { cornbelt: forecast(36, 10), brazil: forecast(36, 0), blacksea: forecast(35, 2) };
// Cool and very wet over the same three regions.
const WET_JULY = { cornbelt: forecast(29, 130), brazil: forecast(30, 20), blacksea: forecast(27, 45) };
const WET_SEPTEMBER = { cornbelt: forecast(24, 100), brazil: forecast(33, 60), blacksea: forecast(22, 50) };

const BULLISH_NEWS = [
  { title: "Black Sea grain corridor halted as Russia exits deal", date: daysAgo(0) },
  { title: "China books large soybean and corn purchases from US exporters", date: daysAgo(1) },
  { title: "Drought and heat wave scorch Midwest soil moisture", date: daysAgo(2) },
];
const BEARISH_NEWS = [
  { title: "Bumper harvest expected as beneficial rain improves yields", date: daysAgo(0) },
  { title: "Record crop forecast after favourable weather across the belt", date: daysAgo(1) },
];

const sentences = (n) => n.split(/\.\s+/).filter(Boolean);

/* ---------------- shared expectations ---------------- */
function narrativeIsUsable(r) {
  assert.match(r.narrative, /\d/, "narrative must contain numbers");
  const s = sentences(r.narrative);
  // A factor that does not apply adds its one sentence (PR #48: a season not read is such a factor).
  const most = 4 + ((r.excluded || []).length ? 1 : 0);
  assert.ok(s.length >= 3 && s.length <= most, `narrative must be 3-${most} sentences, got ${s.length}`);
  assert.ok(!/signals are positive/i.test(r.narrative), "narrative must not be a content-free summary");
  assert.ok(r.narrative.includes(String(r.confidence)), "narrative must state the confidence figure");
}

console.log("\nsrc/signals.js — 4-factor confluence\n");

/* ---------------- 1. all bullish ---------------- */
test("all four factors bullish -> CONFLUENT, confidence 75-95, positive score", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: HOT_DRY_JULY, newsItems: BULLISH_NEWS, bars: bars("up"), season: seasonAt(1.3),
  });
  assert.equal(r.agreement, "CONFLUENT");
  assert.ok(r.confidence >= 75 && r.confidence <= 95, `confidence ${r.confidence} outside 75-95`);
  assert.ok(r.score > 40, `score ${r.score} should be strongly positive`);
  for (const k of ["seasonal", "technical", "weather", "news"]) {
    assert.equal(r.components[k].dir, 1, `${k} should read bullish`);
    assert.match(r.components[k].why, /\d/, `${k}.why must contain numbers`);
  }
  assert.equal(r.reinforced, true, "weather + geopolitical news agree, so the signal is reinforced");
  narrativeIsUsable(r);
});

/* ---------------- 2. all bearish ---------------- */
test("all four factors bearish -> CONFLUENT, confidence 75-95, negative score", () => {
  const r = fuseSignals({
    ticker: "CORN", month: SEPTEMBER, now: NOW,
    weatherData: WET_SEPTEMBER, newsItems: BEARISH_NEWS, bars: bars("down"), season: seasonAt(-1.1),
  });
  assert.equal(r.agreement, "CONFLUENT");
  assert.ok(r.confidence >= 75 && r.confidence <= 95, `confidence ${r.confidence} outside 75-95`);
  assert.ok(r.score < -40, `score ${r.score} should be strongly negative`);
  for (const k of ["seasonal", "technical", "weather", "news"]) {
    assert.equal(r.components[k].dir, -1, `${k} should read bearish`);
  }
  narrativeIsUsable(r);
});

/* ---------------- 3. weather vs seasonal conflict ---------------- */
test("weather against seasonality -> CONFLICT, confidence under 40, both named", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: WET_JULY, newsItems: [], bars: bars("flat"), season: seasonAt(1.3),
  });
  assert.equal(r.agreement, "CONFLICT");
  assert.ok(r.confidence < 40, `confidence ${r.confidence} must be under 40 on a conflict`);
  assert.equal(r.components.seasonal.dir, 1);
  assert.equal(r.components.weather.dir, -1);
  assert.match(r.narrative, /seasonality/, "narrative must name the seasonal factor");
  assert.match(r.narrative, /weather/, "narrative must name the weather factor");
  assert.match(r.narrative, /contradict/, "narrative must say the factors contradict each other");
  assert.ok(Math.abs(r.score) < 30, `score ${r.score} should stay small while factors disagree`);
  narrativeIsUsable(r);
});

/* ---------------- 4. news only ---------------- */
test("news only -> MIXED, confidence 45-70, other three neutral", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: null, newsItems: BULLISH_NEWS, bars: bars("flat"), season: seasonAt(0),
  });
  assert.equal(r.agreement, "MIXED");
  assert.ok(r.confidence >= 45 && r.confidence <= 70, `confidence ${r.confidence} outside 45-70`);
  assert.equal(r.components.news.dir, 1);
  assert.equal(r.components.weather.dir, 0);
  assert.equal(r.components.seasonal.dir, 0);
  assert.equal(r.components.technical.dir, 0);
  assert.equal(r.reinforced, false, "no weather reading means nothing to reinforce");
  assert.ok(r.score > 0 && r.score < 40, `score ${r.score} should be positive but modest`);
  narrativeIsUsable(r);
});

/* ---------------- 5. weather only ---------------- */
test("weather only -> MIXED, confidence 45-70, three concurring regions", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: HOT_DRY_JULY, newsItems: [], bars: bars("flat"), season: seasonAt(0),
  });
  assert.equal(r.agreement, "MIXED");
  assert.ok(r.confidence >= 45 && r.confidence <= 70, `confidence ${r.confidence} outside 45-70`);
  assert.equal(r.components.weather.dir, 1);
  assert.equal(r.components.weather.regions.length, 3, "CORN is driven by three regions");
  assert.match(r.components.weather.why, /3 of 3 regions/, "why must state how many regions concur");
  assert.ok(r.score > 0, `score ${r.score} should be positive`);
  narrativeIsUsable(r);
});

/* ---------------- 6. all neutral ---------------- */
test("nothing pushing -> score 0, confidence well under 40, 'nothing today' narrative", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: null, newsItems: [], bars: bars("flat"), season: seasonAt(0.2),
  });
  assert.equal(r.score, 0);
  assert.ok(r.confidence < 40, `confidence ${r.confidence} must be low when no factor is active`);
  for (const k of ["seasonal", "technical", "weather", "news"]) assert.equal(r.components[k].dir, 0);
  assert.match(r.narrative, /nothing today/i, "the engine must be able to say nothing today");
  narrativeIsUsable(r);
});

/* ---------------- 7. region concurrence ---------------- */
test("three concurring regions weigh more than one", () => {
  const one = weatherComponent("CORN", { cornbelt: forecast(36, 10) }, JULY);
  const three = weatherComponent("CORN", HOT_DRY_JULY, JULY);
  assert.equal(one.dir, 1);
  assert.equal(three.dir, 1);
  assert.ok(three.strength > one.strength, `three regions (${three.strength}) must beat one (${one.strength})`);
});

/* ---------------- 8. news age decay ---------------- */
test("a five-day-old headline counts half, and old news weighs less than fresh", () => {
  assert.equal(ageDecay(0), 1);
  assert.equal(ageDecay(5), 0.5);
  assert.equal(ageDecay(10), 0.25);
  const fresh = newsComponent("CORN", BULLISH_NEWS.map((n) => ({ ...n, date: daysAgo(0) })), NOW);
  const stale = newsComponent("CORN", BULLISH_NEWS.map((n) => ({ ...n, date: daysAgo(10) })), NOW);
  assert.ok(stale.strength < fresh.strength, `stale (${stale.strength}) must weigh less than fresh (${fresh.strength})`);
  assert.ok(stale.strength > 0, "old news is discounted, not discarded");
});

/* ---------------- 9. geopolitical weighting ---------------- */
test("a geopolitical headline weighs more than a market one of the same age", () => {
  const geo = newsComponent("CORN", [{ title: "Black Sea grain corridor halted by Russia", date: daysAgo(0) }], NOW);
  const mkt = newsComponent("CORN", [{ title: "Ethanol plant expansion lifts biofuel demand", date: daysAgo(0) }], NOW);
  assert.equal(geo.dir, 1);
  assert.equal(mkt.dir, 1);
  assert.ok(geo.strength > mkt.strength, `geopolitical (${geo.strength}) must outweigh market (${mkt.strength})`);
  assert.equal(geo.geoDir, 1);
  assert.equal(mkt.geoDir, 0);
});

/* ---------------- 10. reinforcement multiplier ---------------- */
test("weather + geopolitical news on the same ticker multiplies the score", () => {
  const common = { ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, bars: bars("flat"), season: seasonAt(0) };
  const withGeo = fuseSignals({ ...common, newsItems: [{ title: "Black Sea grain corridor halted by Russia", date: daysAgo(0) }] });
  const withMarket = fuseSignals({ ...common, newsItems: [{ title: "Ethanol plant expansion lifts biofuel demand", date: daysAgo(0) }] });
  assert.equal(withGeo.reinforced, true);
  assert.equal(withMarket.reinforced, false);
  assert.match(withGeo.narrative, /1\.25x/, "the narrative must disclose the multiplier");
});

/* ---------------- 11. bounds ---------------- */
test("score stays within -100..100 and confidence within 0..100", () => {
  const cases = [
    { ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, newsItems: [...BULLISH_NEWS, ...BULLISH_NEWS], bars: bars("up"), season: seasonAt(12) },
    { ticker: "CORN", month: SEPTEMBER, now: NOW, weatherData: WET_SEPTEMBER, newsItems: BEARISH_NEWS, bars: bars("down"), season: seasonAt(-12) },
    { ticker: "UNG", month: JULY, now: NOW },
  ];
  for (const c of cases) {
    const r = fuseSignals(c);
    assert.ok(r.score >= -100 && r.score <= 100, `score ${r.score} out of range`);
    assert.ok(r.confidence >= 0 && r.confidence <= 100, `confidence ${r.confidence} out of range`);
    assert.ok(["CONFLUENT", "MIXED", "CONFLICT"].includes(r.agreement));
    narrativeIsUsable(r);
  }
});

/* ---------------- 12. missing inputs ---------------- */
test("missing bars, weather and news degrade to neutral instead of throwing", () => {
  const r = fuseSignals({ ticker: "UNG", month: 0, now: NOW, season: seasonAt(2.1) });
  assert.equal(r.components.technical.dir, 0);
  assert.equal(r.components.weather.dir, 0);
  assert.equal(r.components.news.dir, 0);
  // A measured season that beats its noise, so seasonality alone speaks.
  assert.equal(r.components.seasonal.dir, 1);
  assert.equal(r.agreement, "MIXED");
  narrativeIsUsable(r);
});

/* ---------------- 13. ranking: CONFLICT last, signal weighed ---------------- */
const bullish = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, newsItems: BULLISH_NEWS, bars: bars("up"), season: seasonAt(2.5) });
const conflicted = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, bars: bars("down"), season: seasonAt(-2.5) });

test("the fixtures used for ranking really are CONFLUENT and CONFLICT", () => {
  assert.equal(bullish.agreement, "CONFLUENT");
  assert.equal(conflicted.agreement, "CONFLICT");
});

test("sentimentDirection maps every preset family to +1 / -1 / 0", () => {
  assert.equal(sentimentDirection("verybull"), 1);
  assert.equal(sentimentDirection("bull"), 1);
  assert.equal(sentimentDirection("bear"), -1);
  assert.equal(sentimentDirection("verybear"), -1);
  assert.equal(sentimentDirection("neutral"), 0);
  assert.equal(sentimentDirection(undefined), 0);
});

test("the signal helps a candidate that agrees with it and hurts one that does not", () => {
  const withIt = signalAdjustment(bullish, 1);
  const againstIt = signalAdjustment(bullish, -1);
  assert.ok(withIt > 0, `a bullish read must help a bullish candidate (got ${withIt})`);
  assert.ok(againstIt < 0, `a bullish read must hurt a bearish candidate (got ${againstIt})`);
  assert.equal(Math.round(withIt + againstIt), 0, "the two adjustments must be mirror images");
  assert.equal(signalAdjustment(null, 1), 0, "no read means no adjustment");
});

test("a range structure is helped by a quiet tape and hurt by a loud one", () => {
  const quiet = fuseSignals({ ticker: "UNG", month: 5, now: NOW });
  assert.ok(signalAdjustment(quiet, 0) > signalAdjustment(bullish, 0),
    "a score near zero must rank a neutral structure above a loud one");
});

test("rankScore moves EV by the signal, and a missing EV does not throw", () => {
  assert.equal(rankScore(20, null, 1), 20);
  assert.ok(rankScore(20, bullish, 1) > 20);
  assert.ok(rankScore(20, bullish, -1) < 20);
  assert.ok(Number.isFinite(rankScore(undefined, bullish, 1)));
});

test("a CONFLICT candidate ranks last however good its expected value", () => {
  const candidates = [
    withSignalRank({ name: "conflicted but rich", ev100: 500 }, conflicted, 1),
    withSignalRank({ name: "poor but clean", ev100: -5 }, bullish, 1),
    withSignalRank({ name: "decent and clean", ev100: 10 }, bullish, 1),
  ].sort(compareCandidates);
  assert.equal(candidates[candidates.length - 1].name, "conflicted but rich",
    `CONFLICT must sort last, got ${candidates.map((c) => c.name).join(" > ")}`);
  assert.equal(candidates[0].name, "decent and clean");
  assert.equal(candidates[0].conflict, false);
});

/* ---------------- 14. going against the signal ---------------- */
test("a trade fighting the signal reports how many factors it fights", () => {
  const a = againstSignal(bullish, -1);
  assert.ok(a, "a bearish trade against a bullish read must be flagged");
  assert.ok(a.n >= 1 && a.n <= 4, `expected 1..4 opposing factors, got ${a.n}`);
  assert.equal(a.total, 4);
  assert.equal(a.question, `You are going against ${a.n} of 4 factors. Why?`);
  assert.match(a.detail, /\d/, "the prompt must carry the numbers, not just an adjective");
  assert.equal(a.opposing.length, a.n);
});

test("a trade that agrees with the signal, or has no direction, is not flagged", () => {
  assert.equal(againstSignal(bullish, 1), null);
  assert.equal(againstSignal(bullish, 0), null);
  assert.equal(againstSignal(null, -1), null);
});

test("a score inside the noise floor is nothing to go against", () => {
  const quiet = fuseSignals({ ticker: "UNG", month: 5, now: NOW });
  assert.ok(Math.abs(quiet.score) < 10, `fixture must be quiet, scored ${quiet.score}`);
  assert.equal(againstSignal(quiet, 1), null);
  assert.equal(againstSignal(quiet, -1), null);
});

/* ---------------- 15. the UI adapter reads the same numbers ---------------- */
test("regionSignals returns one row per region with data, same direction as the engine", () => {
  const rows = regionSignals(HOT_DRY_JULY, JULY);
  assert.equal(rows.length, 3, "three regions have a forecast in this fixture");
  for (const r of rows) {
    assert.ok(["\u2191", "\u2193", "\u2248"].includes(r.dir), `unexpected arrow ${r.dir}`);
    assert.ok(["strong", "medium", "weak"].includes(r.strength));
    assert.ok(r.why.length > 20, "the row must carry the engine's own sentence");
  }
  assert.ok(rows.every((r) => r.numDir === 1), "hot and dry in July reads bullish everywhere here");
  assert.deepEqual(regionSignals(null, JULY), [], "no forecast means no rows, not a throw");
});


/* ================================================================
   THE LIQUID TIER (ROADMAP P2-bis): weather does not apply to a metal,
   and a missing seasonal row is UNKNOWN rather than a quiet zero.
================================================================ */

test("weather applicability is the REGISTRY's (PR #48), and the region table agrees with it", () => {
  for (const tk of ["CORN", "SOYB", "WEAT", "UNG", "BOIL"]) {
    assert.equal(weatherApplies(tk), true, `${tk} has regions in the table`);
    assert.ok(REGIONS.some((r) => r.affects.includes(tk)));
  }
  for (const tk of ["GLD", "SLV", "GDX", "USO", "XLE"]) {
    assert.equal(weatherApplies(tk), false, `${tk} has no region driving it`);
  }
  // THE TWO SAY THE SAME THING FOR EVERY MARKET: a row that says weather applies has a region, one that says it
  // does not has none, and no region drives a market the registry does not know.
  for (const tk of TICKERS) {
    assert.equal(weatherApplies(tk), REGIONS.some((r) => r.affects.includes(tk)), `${tk}: registry and regions agree`);
  }
  for (const r of REGIONS) for (const tk of r.affects) assert.ok(TICKERS.includes(tk), `${r.id} drives ${tk}, a known market`);
});

const sum4 = (w) => Object.values(w).reduce((a, b) => a + b, 0);

test("a factor that DOES NOT APPLY is out of the weights, and they still sum to one", () => {
  const corn = factorsOf("CORN");
  assert.deepEqual(corn.keys, ["seasonal", "technical", "weather", "news"]);
  assert.equal(corn.excluded.length, 0);
  assert.equal(corn.note, null);
  assert.equal(+sum4(corn.weights).toFixed(6), 1, "four factors still sum to one");
  // ...and the four are unchanged in value.
  assert.equal(+corn.weights.seasonal.toFixed(2), 0.30);
  assert.equal(+corn.weights.weather.toFixed(2), 0.25);

  const gld = factorsOf("GLD");
  assert.deepEqual(gld.keys, ["seasonal", "technical", "news"]);
  assert.deepEqual(gld.excluded, ["weather"]);
  assert.equal(+sum4(gld.weights).toFixed(6), 1, "three factors are RENORMALISED to one");
  assert.equal(gld.weights.weather, undefined, "weather is not in the scale at all");
  // The share is spread in proportion, not dropped on the floor.
  assert.ok(gld.weights.seasonal > 0.30 && gld.weights.news > 0.20);
  assert.ok(/gold/i.test(gld.note), "and the reason names the market");
});

test("weather on a metal is n/a, not a reading of zero", () => {
  const c = weatherComponent("GLD", null, JULY);
  assert.equal(c.applies, false);
  assert.equal(c.strength, 0);
  assert.deepEqual(c.regions, []);
  assert.ok(!/no forecast available/.test(c.why), "a missing forecast is a different sentence");
  assert.ok(/does not apply/i.test(c.why));
  // A market that HAS regions but no data loaded is the other case, and it stays in.
  const corn = weatherComponent("CORN", null, JULY);
  assert.equal(corn.applies, true);
  assert.ok(/no forecast available/.test(corn.why));
});

test("the excluded factor is out of the AGREEMENT count and the confidence, not scored 0", () => {
  const newsItems = [{ title: "Fed signals a rate cut as real yields fall", date: daysAgo(0) }];
  const gld = fuseSignals({ ticker: "GLD", month: JULY, weatherData: null, newsItems, bars: bars("up"), season: seasonAt(2.0), now: NOW });
  assert.deepEqual(gld.factors, ["seasonal", "technical", "news"]);
  assert.equal(gld.components.weather.applies, false);
  // Three of three agreeing is CONFLUENT; the fourth slot is not a quiet factor
  // holding it down to MIXED.
  assert.equal(gld.agreement, "CONFLUENT");
  assert.ok(gld.confidence >= 75, `three-factor confluence keeps its confidence (${gld.confidence})`);
  assert.ok(/does not apply/i.test(gld.narrative), "and the narrative says so once");

  // THE PROOF THAT IT IS THE EXCLUSION DOING THE WORK: the same readings on a
  // market that HAS weather, with none loaded, cannot reach CONFLUENT.
  const corn = fuseSignals({ ticker: "CORN", month: JULY, weatherData: null, newsItems: [{ title: "Beneficial rains improve the crop", date: daysAgo(0) }], bars: bars("up"), season: seasonAt(2.0), now: NOW });
  assert.equal(corn.components.weather.applies, true);
  assert.equal(corn.components.weather.strength, 0);
});

test("A SEASON NOT READ IS EXCLUDED WITH ITS REASON, never 0%/mo (PR #48)", () => {
  const c = seasonalComponent("GLD", JULY, null);
  assert.equal(c.mean, null, "null, not zero");
  assert.equal(c.strength, 0);
  assert.equal(c.applies, false);
  assert.match(c.why, /season not read: no drift/);
  // Excluded like weather on a metal: out of the weights, the agreement count and the confidence, with the reason.
  const f = factorsOf("GLD", { seasonRead: false });
  assert.ok(!f.keys.includes("seasonal"));
  assert.match(f.note, /Season not read: no drift for GLD/);
  const r = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, newsItems: [], bars: bars("up") });
  assert.ok(r.excluded.includes("seasonal"));
  assert.equal(+Object.values(r.weights).reduce((a, b) => a + b, 0).toFixed(6), 1, "the rest still sum to one");
  // …and once read, it is back in, whether or not any month counts.
  assert.ok(factorsOf("GLD").keys.includes("seasonal"));
  const quiet = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, season: seasonAt(0.3) });
  assert.ok(quiet.factors.includes("seasonal"));
  assert.equal(quiet.components.seasonal.dir, 0, "0.3% is under 2 × 0.4%: not a signal");
});

test("THE SEASON FACTOR: direction and strength from the COUNTED window mean, today's strength formula (PR #48)", () => {
  // June counts (2.2× its noise), July does not: a 2-month window leans −3.46 / 2 = −1.73% a month.
  const stats = { monthlyMean: Array(12).fill(0), monthN: Array(12).fill(16), monthSE: Array(12).fill(1.6) };
  stats.monthlyMean[5] = -3.46; stats.monthlyMean[6] = 1.2;
  const sig = seasonalSignal(stats, 5, 60);
  assert.equal(sig.span, 2);
  assert.deepEqual(sig.used.map((x) => x.label), ["Jun"]);
  assert.deepEqual(sig.dropped.map((x) => x.label), ["Jul"]);
  assert.equal(+sig.mean.toFixed(2), -1.73);
  const c = seasonalComponent("CORN", 5, sig);
  assert.equal(c.dir, -1);
  assert.equal(c.strength, Math.round(1.73 * 40));
  assert.match(c.why, /Jun −3\.5% ± 1\.6% \(16 yrs\) · counts; Jul \+1\.2% ± 1\.6% \(16 yrs\) · not a signal/);
});

test("the new news rules tag the new markets, each with its one-line why", () => {
  const cases = [
    ["Fed signals a rate cut as real yields fall", "GLD", 1],
    ["Hawkish Fed: higher for longer, real yields rising", "GLD", -1],
    ["Dollar index surges to a two-year high", "SLV", -1],
    ["Central bank gold buying hits a record", "GLD", 1],
    ["Solar panel demand lifts industrial metals", "SLV", 1],
    ["OPEC announces a production cut", "USO", 1],
    ["EIA reports a large crude inventory build", "USO", 0],
    ["Tanker attack in the Strait of Hormuz", "USO", 1],
    ["US crude production from the Permian hits a record", "USO", -1],
    ["Refinery outage widens the crack spread", "XLE", 1],
    ["Mine strike halts output at a major producer", "GDX", 0],
  ];
  for (const [title, tk, dir] of cases) {
    const hit = tagImpacts(title).find((x) => x.tk === tk);
    assert.ok(hit, `"${title}" should tag ${tk}`);
    assert.equal(hit.dir, dir, `"${title}" → ${tk}`);
    assert.ok(hit.why && hit.why.length > 12, "every rule carries a one-line why");
  }
});

test("a headline about gold does not quietly tag a grain, and vice versa", () => {
  const gold = tagImpacts("Central bank gold buying hits a record").map((x) => x.tk);
  assert.ok(!gold.includes("CORN") && !gold.includes("WEAT"));
  const grain = tagImpacts("Heatwave and drought stress the corn belt").map((x) => x.tk);
  assert.ok(!grain.includes("GLD") && !grain.includes("USO"));
});

/* ---------------- PR #44, TASK 4: reading, snapshot, reconcile ---------------- */

const GDX_NEWS = [{ title: "Central bank gold buying hits a record", date: daysAgo(1) },
  { title: "Gold slides as the dollar surges and real yields jump", date: daysAgo(1) },
  { title: "Gold price falls on a stronger dollar", date: daysAgo(2) }];
const fuseGdx = (newsItems) => fuseSignals({ ticker: "GDX", month: JULY, weatherData: null, newsItems,
  bars: bars("up"), season: seasonAt(1.4), now: NOW });

test("READING — a market is reading until every input it has has landed or failed", () => {
  const all = { seasonal: "ready", technical: "ready", weather: "ready", news: "ready" };
  assert.equal(readingState({ ticker: "CORN", inputs: all }).reading, false);
  const r = readingState({ ticker: "CORN", inputs: { ...all, news: "loading" } });
  assert.equal(r.reading, true);
  assert.deepEqual(r.waiting, ["news"]);
  assert.equal(readingLine(r), "reading news…");
  // An input nobody reported is not "landed": unknown never lets a score out early.
  assert.equal(readingState({ ticker: "CORN", inputs: { seasonal: "ready" } }).reading, true);
});

test("READING — a failure is named, is not a wait, and the other factors still score", () => {
  const r = readingState({ ticker: "CORN", inputs: { seasonal: "ready", technical: "failed", weather: "ready", news: "ready" } });
  assert.equal(r.reading, false);
  assert.equal(r.failed.length, 1);
  assert.equal(r.failed[0].name, "price history");
  assert.match(unreadInputsAria(r.failed), /Price history could not be read/);
  assert.equal(unreadInputsAria([]), null);
});

test("READING — a factor the market does not have is never waited for", () => {
  // GDX has no weather factor (factorsOf), so loading weather cannot hold its badge.
  assert.equal(factorsOf("GDX").keys.includes("weather"), false);
  const r = readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "ready", weather: "loading" } });
  assert.equal(r.reading, false);
});

test("SNAPSHOT — no score is held while an input is on the way", () => {
  const reading = readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "loading" } });
  const snap = signalSnapshot(fuseGdx([]), { reading });
  assert.equal(snap.ready, false);
  assert.equal(snap.score, null);
  assert.deepEqual(snap.waiting, ["news"]);
});

test("SAME INPUTS, IDENTICAL FACTORS — the card and Build read one result", () => {
  const settled = { seasonal: "ready", technical: "ready", news: "ready" };
  const card = signalSnapshot(fuseGdx(GDX_NEWS), { reading: readingState({ ticker: "GDX", inputs: settled }), seasonalSource: "measured" });
  const build = signalSnapshot(fuseGdx([...GDX_NEWS]), { reading: readingState({ ticker: "GDX", inputs: settled }), seasonalSource: "measured" });
  assert.equal(card.ready, true);
  assert.deepEqual(card.factors, build.factors);
  assert.equal(card.score, build.score);
  assert.equal(card.agreement, build.agreement);
  assert.equal(card.confidence, build.confidence);
  const cmp = compareSignals(card, build, { ticker: "GDX" });
  assert.equal(cmp.same, true);
  assert.match(cmp.line, /^✓ Same four factors as the card/);
});

test("RECONCILE — news that was missing on the card says what moved and why, in one line", () => {
  const thenFused = fuseGdx([]);
  const nowFused = fuseGdx(GDX_NEWS);
  assert.notDeepEqual(thenFused.components.news, nowFused.components.news, "the fixture must actually move the news factor");
  const was = signalSnapshot(thenFused, { reading: readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "failed" } }), seasonalSource: "measured" });
  const is = signalSnapshot(nowFused, { reading: readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "ready" } }), seasonalSource: "measured" });
  const cmp = compareSignals(was, is, { ticker: "GDX" });
  assert.equal(cmp.same, false);
  assert.ok(!cmp.line.includes("\n"), "one line");
  assert.match(cmp.line, /^⚠ News for GDX loaded: news /);
  if (thenFused.agreement !== nowFused.agreement) assert.match(cmp.line, new RegExp(`${thenFused.agreement} → ${nowFused.agreement}`));
});

test("RECONCILE — a card taken while the market was still reading says so, never 'same'", () => {
  const reading = readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "loading" } });
  const was = signalSnapshot(null, { reading });
  const is = signalSnapshot(fuseGdx(GDX_NEWS), { reading: readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "ready" } }) });
  const cmp = compareSignals(was, is, { ticker: "GDX" });
  assert.equal(cmp.same, false);
  assert.equal(cmp.pending, true);
  assert.match(cmp.line, /still loading on the card \(news\)/);
  assert.equal(compareSignals(was, signalSnapshot(null, { reading }), { ticker: "GDX" }), null, "nothing to compare with an unready result");
});

test("RECONCILE — a changed seasonal source is part of the line", () => {
  const f = fuseGdx(GDX_NEWS);
  const r = readingState({ ticker: "GDX", inputs: { seasonal: "ready", technical: "ready", news: "ready" } });
  const a = signalSnapshot(f, { reading: r, seasonalSource: "table" }), b = signalSnapshot(f, { reading: r, seasonalSource: "measured" });
  assert.match(compareSignals(a, b, { ticker: "GDX" }).line, /seasonal source table → measured/);
});

/* ---------------- summary ---------------- */

/* ---------------- PR #46, TASK 3: HOW THE SCORE AND THE CONFIDENCE ARE WORKED OUT ---------------- */

test("THE CORN READING OF 2 OCT, WRITTEN OUT: 0.30×47 + 0.25×0 + 0.25×67 + 0.20×100 = 50.85 × 1.25 = 63.56 → +64; 75 + 0.15 × mean(47, 67, 100) = 85.7 → 86", () => {
  const corn = { ticker: "CORN", factors: ["seasonal", "technical", "weather", "news"],
    weights: { seasonal: 0.30, technical: 0.25, weather: 0.25, news: 0.20 }, excluded: [], reinforced: true,
    agreement: "CONFLUENT", score: 64, confidence: 86,
    components: { seasonal: { dir: 1, strength: 47 }, technical: { dir: 0, strength: 0 }, weather: { dir: 1, strength: 67 }, news: { dir: 1, strength: 100 } } };
  const sw = scoreWorking(corn), cw = confidenceWorking(corn);
  assert.ok(sw.sentence.includes("0.30×47 + 0.25×0 + 0.25×67 + 0.20×100 = 50.85 × 1.25"), sw.sentence);
  assert.ok(sw.sentence.endsWith("= 63.56 → +64."), sw.sentence);
  assert.equal(sw.result, 64);
  assert.ok(cw.sentence.includes("75 + 0.15 × mean(47, 67, 100) = 85.7 → 86 (held between 75 and 95)"), cw.sentence);
  assert.equal(cw.result, 86);
  assert.equal(verdictLine(corn).text, "▲ the factors agree · 3 of 4 agree · score +64 · confidence 86");
});

test("THE WORKED SENTENCE ARRIVES AT fused.score AND fused.confidence — every fixture market, weather or not, every case", () => {
  const TICKERS = ["CORN", "SOYB", "WEAT", "UNG", "BOIL", "GLD", "SLV", "USO", "XLE", "GDX"];
  const SETS = [
    { weatherData: HOT_DRY_JULY, newsItems: BULLISH_NEWS, bars: bars("up"), season: seasonAt(2.5) },
    { weatherData: WET_JULY, newsItems: BEARISH_NEWS, bars: bars("down"), season: seasonAt(-2) },
    { weatherData: HOT_DRY_JULY, newsItems: BEARISH_NEWS, bars: bars("up"), season: seasonAt(-1) },
    { weatherData: WET_JULY, newsItems: [], bars: bars("flat"), season: seasonAt(0.3) },
    { weatherData: null, newsItems: [], bars: null, season: seasonAt(0) },
  ];
  const seen = new Set();
  let noWeather = 0;
  for (const tk of TICKERS) for (const set of SETS) {
    const f = fuseSignals({ ticker: tk, month: JULY, now: NOW, ...set });
    const sw = scoreWorking(f), cw = confidenceWorking(f);
    assert.equal(sw.result, f.score, `${tk} score: ${sw.sentence}`);
    assert.equal(cw.result, f.confidence, `${tk} confidence: ${cw.sentence}`);
    assert.ok(sw.sentence.endsWith(`→ ${f.score > 0 ? "+" : ""}${f.score}.`) || (f.score === 0 && sw.sentence.endsWith("→ 0.")), sw.sentence);
    assert.ok(cw.sentence.includes(String(f.confidence)), cw.sentence);
    seen.add(f.agreement + ":" + (f.agreement === "MIXED" ? Object.values(f.components).filter((c) => c.applies !== false && c.dir !== 0).length : ""));
    if ((f.excluded || []).includes("weather")) {
      noWeather++;
      assert.ok(/does not apply here/.test(sw.sentence), "a market without weather says its share is spread over the rest");
    }
  }
  assert.ok(noWeather > 0, "at least one fixture market has no weather factor");
  assert.ok(seen.has("CONFLUENT:") && seen.has("CONFLICT:"), `cases covered: ${[...seen].join(", ")}`);
});

test("THE CONSTANTS ARE UNCHANGED IN VALUE — only their explanation is new", () => {
  assert.deepEqual({ ...BASE_WEIGHTS }, { seasonal: 0.30, technical: 0.25, weather: 0.25, news: 0.20 });
  assert.equal(REINFORCE, 1.25);
  assert.equal(CONFLICT_DAMPING, 0.6);
  assert.deepEqual(JSON.parse(JSON.stringify(CONFIDENCE_BANDS)), {
    confluent: { base: 75, perStrength: 0.15, perExtra: 5, lo: 75, hi: 95 },
    conflict: { base: 38, perSeverity: 0.25, lo: 8, hi: 39 },
    two: { base: 50, perStrength: 0.2, lo: 45, hi: 70 },
    one: { base: 45, perStrength: 0.12, lo: 45, hi: 58 },
    none: { value: 20 },
  });
  // …and fuseSignals reads them, not a copy: no bare band literal survives in its body.
  const src = readFileSync(new URL("./signals.js", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export function fuseSignals"), src.indexOf("/* ================================================================\n   HOW THE SCORE"));
  assert.equal(/Math\.round\(\s*\d/.test(body), false, "a confidence formula with a literal base is back in fuseSignals");
});

test("THE ⓘ OPENS ON TAP, NEVER A title ATTRIBUTE; the sheet says what it changes in Find and that the numbers are chosen", () => {
  const why = readFileSync(new URL("./why.jsx", import.meta.url), "utf8");
  const top = why.slice(why.indexOf("export function WhySheetTop"), why.indexOf("export function WhySheet("));
  assert.ok(/onClick=\{onHow\}/.test(top) && /aria-expanded/.test(top), "the ⓘ is a button that toggles");
  assert.equal(/title=/.test(top), false, "no title attribute on the ⓘ");
  assert.ok(why.includes("WEIGHTS_CHOSEN_LINE") && why.includes("whyFindEffect()"));
  assert.ok(why.includes('summary="The full reasoning"'), "the narrative is behind The full reasoning");
});

test("SIGNALS DECIDE (PR #48): s = score × confidence / 100 against directionSignalMin; CONFLICT Neutral; never Very", () => {
  assert.equal(RULES.directionSignalMin, 12.5, "chosen, not measured (PRD §4.8)");
  const at = (score, confidence, agreement = "MIXED") => signalDirection({ score, confidence, agreement });
  assert.equal(at(64, 86, "CONFLUENT").dir, "bull");
  assert.equal(+at(64, 86, "CONFLUENT").s.toFixed(2), 55.04);
  assert.equal(at(25, 50).dir, "bull");
  assert.equal(at(24, 50).dir, "neutral");
  assert.equal(at(-25, 50).dir, "bear");
  assert.equal(at(-24, 50).dir, "neutral");
  assert.equal(at(10, 45).dir, "neutral");
  assert.equal(at(90, 95, "CONFLICT").dir, "neutral", "CONFLICT is Neutral whatever the arithmetic");
  assert.equal(at(100, 100, "CONFLUENT").dir, "bull", "never Very");
  assert.equal(signalDirection(null), null, "reading: no direction");
  assert.deepEqual(signalFamilies(null), ["neutral"]);
  assert.deepEqual(signalFamilies(at(64, 86)), ["bull", "neutral"]);
  assert.deepEqual(signalFamilies(at(-64, 86)), ["bear", "neutral"]);
  assert.deepEqual(signalFamilies(at(5, 40)), ["neutral"]);
  const app = readFileSync("src/App.jsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
  assert.equal(/const suggestion(Score|Of)\s*=/.test(app), false, "suggestionScore / suggestionOf retired");
  assert.ok(/signalFamilies\(sd\)/.test(app), "Find builds the suggested family plus Neutral");
});

test("ORDER BY (PR #48, names PR #49): five orders; only 'Future avg + signal' adds the signal and puts CONFLICT last", () => {
  assert.deepEqual(FIND_ORDERS.map((o) => o.label), ["Future avg", "Future avg + signal", "Chance", "Return on risk", "Past yrs"]);
  assert.deepEqual(FIND_ORDERS.map((o) => o.id), ["ev", "evSignal", "chance", "rr", "past"], "the stored ids are unchanged");
  assert.equal(DEFAULT_FIND_ORDER, "ev");
  const corn = { score: 64, confidence: 86, agreement: "CONFLUENT" };
  const war = { score: 30, confidence: 30, agreement: "CONFLICT" };
  const A = { key: "a", ev100: -12, sent: "bull", fused: corn, lf: { pop: 0.42, rr: 1.2 }, past: { wins: 9, n: 14, winRate: 9 / 14, per100: 30 } };
  const B = { key: "b", ev100: 5, sent: "neutral", fused: null, lf: { pop: 0.61, rr: 0.4 }, past: { wins: 9, n: 14, winRate: 9 / 14, per100: 45 } };
  const C = { key: "c", ev100: 20, sent: "bull", fused: war, lf: { pop: 0.5, rr: 0.9 }, past: { wins: 3, n: 14, winRate: 3 / 14, per100: 80 } };
  const D = { key: "d", ev100: -999, sent: "bull", fused: null, lf: { pop: null, rr: null }, past: null };
  const order = (o) => [A, B, C, D].sort(findOrderCompare(o)).map((x) => x.key).join("");
  assert.equal(order("ev"), "cbad", "future avg alone; CONFLICT is not last; unknown last");
  assert.equal(order("evSignal"), "abdc", "−12 + 27.5 = 15.5 beats 5; CONFLICT last");
  assert.equal(order("chance"), "bcad");
  assert.equal(order("rr"), "acbd");
  assert.equal(order("past"), "bacd", "win rate first (9 of 14 beats 3 of 14), then the average per $100; not read last");
  // THE "SORTED BY" LINE is built from the same figures the sort read.
  assert.equal(placeSignal(A), signalAdjustment(corn, 1));
  assert.equal(+placeSignal(A).toFixed(2), 27.52);
  assert.equal(placeLine(A, "evSignal"), "sorted by −12.0 + signal +27.5 = 15.5 per $100");
  assert.equal(+(findOrderKey(A, "evSignal")).toFixed(1), 15.5, "the line's result is the sort key");
  assert.equal(placeLine(A, "ev"), "future avg −12.0 per $100");
  assert.equal(placeLine(A, "chance"), "chance 42%");
  assert.equal(placeLine(A, "rr"), "return on risk 120%");
  assert.equal(placeLine(A, "past"), "past yrs won 9 of 14");
  assert.match(placeLine(C, "evSignal"), /CONFLICT: last$/);
  assert.equal(placeLine(D, "ev"), "future avg not known · last");
  assert.equal(findOrderOf("nonsense").id, "ev", "an unknown setting reads as the default");
});

test("HOW THE NUMBERS FIT (PR #48, rewritten PR #49): every number printed is the function it describes", () => {
  const lines = numbersFitLines("evSignal");
  const all = lines.map((l) => l.text).join(" ");
  assert.deepEqual(lines.map((l) => l.k), ["future", "past", "signal", "filter", "decide", "autopilot"]);
  assert.ok(all.includes(`Future (Monte Carlo) = ${RULES.mcRuns.toLocaleString("en-US")} invented futures to expiry`));
  assert.ok(all.includes("It is a simulation, not history."));
  assert.ok(all.includes("Past yrs (backtest) = this trade replayed on the ETF's real past, one row per year"));
  assert.ok(all.includes(`${RULES.seasonalSignalT}× their own noise`));
  assert.ok(all.includes(`score ÷ ${SIGNAL_DIVISOR} × confidence ÷ 100 for a bull or bear card`));
  assert.ok(all.includes(`(${NEUTRAL_QUIET} − |score|) ÷ ${SIGNAL_DIVISOR} × confidence ÷ 100 for a neutral one`));
  assert.ok(all.includes("Filter = the sliders and toggles only"));
  assert.ok(all.includes(`"Signals decide" = score × confidence ÷ 100 against ±${RULES.directionSignalMin}`));
  assert.ok(all.includes(`Autopilot = confidence of at least ${RULES.autopilotConfidence}`));
  assert.ok(all.includes("(Future avg + signal)"));
  // …and the numbers are the ones the functions use. + signal is signalAdjustment's, for both kinds of card,
  const f = { score: 64, confidence: 86 };
  assert.equal(signalAdjustment(f, 1), (f.score / SIGNAL_DIVISOR) * (f.confidence / 100));
  assert.equal(signalAdjustment(f, -1), (-f.score / SIGNAL_DIVISOR) * (f.confidence / 100));
  assert.equal(signalAdjustment(f, 0), ((NEUTRAL_QUIET - Math.abs(f.score)) / SIGNAL_DIVISOR) * (f.confidence / 100));
  // directionSignalMin is signalDirection's threshold,
  const min = RULES.directionSignalMin;
  assert.equal(signalDirection({ score: min * 2, confidence: 50, agreement: "MIXED" }).dir, "bull");
  assert.equal(signalDirection({ score: min * 2 - 1, confidence: 50, agreement: "MIXED" }).dir, "neutral");
  // seasonalSignalT is seasonalSignal's,
  const st = { monthlyMean: Array(12).fill(RULES.seasonalSignalT), monthN: Array(12).fill(9), monthSE: Array(12).fill(1) };
  assert.equal(seasonalSignal(st, 0, 30).counts, true);
  assert.equal(seasonalSignal({ ...st, monthlyMean: Array(12).fill(RULES.seasonalSignalT - 0.01) }, 0, 30).counts, false);
  // and no number in the text is anything else.
  const nums = all.match(/\d[\d,.]*/g).map((x) => x.replace(/,/g, "").replace(/\.$/, ""));
  const allowed = new Set([String(RULES.mcRuns), String(RULES.seasonalSignalT), String(RULES.directionSignalMin), String(RULES.autopilotConfidence),
    String(SIGNAL_DIVISOR), String(NEUTRAL_QUIET), "100"]);
  for (const n of nums) assert.ok(allowed.has(n), `an unexplained number in the text: ${n}`);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
