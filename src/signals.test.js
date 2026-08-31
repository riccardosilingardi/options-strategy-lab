// Tests for the 4-factor confluence engine (src/signals.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import assert from "node:assert/strict";
import { fuseSignals, weatherComponent, newsComponent, ageDecay } from "./signals.js";

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
  assert.ok(s.length >= 3 && s.length <= 4, `narrative must be 3-4 sentences, got ${s.length}`);
  assert.ok(!/signals are positive/i.test(r.narrative), "narrative must not be a content-free summary");
  assert.ok(r.narrative.includes(String(r.confidence)), "narrative must state the confidence figure");
}

console.log("\nsrc/signals.js — 4-factor confluence\n");

/* ---------------- 1. all bullish ---------------- */
test("all four factors bullish -> CONFLUENT, confidence 75-95, positive score", () => {
  const r = fuseSignals({
    ticker: "CORN", month: JULY, now: NOW,
    weatherData: HOT_DRY_JULY, newsItems: BULLISH_NEWS, bars: bars("up"), seasonalMean: 1.3,
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
    weatherData: WET_SEPTEMBER, newsItems: BEARISH_NEWS, bars: bars("down"), seasonalMean: -1.1,
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
    weatherData: WET_JULY, newsItems: [], bars: bars("flat"), seasonalMean: 1.3,
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
    weatherData: null, newsItems: BULLISH_NEWS, bars: bars("flat"), seasonalMean: 0,
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
    weatherData: HOT_DRY_JULY, newsItems: [], bars: bars("flat"), seasonalMean: 0,
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
    weatherData: null, newsItems: [], bars: bars("flat"), seasonalMean: 0.2,
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
  const common = { ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, bars: bars("flat"), seasonalMean: 0 };
  const withGeo = fuseSignals({ ...common, newsItems: [{ title: "Black Sea grain corridor halted by Russia", date: daysAgo(0) }] });
  const withMarket = fuseSignals({ ...common, newsItems: [{ title: "Ethanol plant expansion lifts biofuel demand", date: daysAgo(0) }] });
  assert.equal(withGeo.reinforced, true);
  assert.equal(withMarket.reinforced, false);
  assert.match(withGeo.narrative, /1\.25x/, "the narrative must disclose the multiplier");
});

/* ---------------- 11. bounds ---------------- */
test("score stays within -100..100 and confidence within 0..100", () => {
  const cases = [
    { ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, newsItems: [...BULLISH_NEWS, ...BULLISH_NEWS], bars: bars("up"), seasonalMean: 12 },
    { ticker: "CORN", month: SEPTEMBER, now: NOW, weatherData: WET_SEPTEMBER, newsItems: BEARISH_NEWS, bars: bars("down"), seasonalMean: -12 },
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
  const r = fuseSignals({ ticker: "UNG", month: 0, now: NOW });
  assert.equal(r.components.technical.dir, 0);
  assert.equal(r.components.weather.dir, 0);
  assert.equal(r.components.news.dir, 0);
  // UNG has a strong January seasonal in engine.js, so seasonality alone speaks.
  assert.equal(r.components.seasonal.dir, 1);
  assert.equal(r.agreement, "MIXED");
  narrativeIsUsable(r);
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
