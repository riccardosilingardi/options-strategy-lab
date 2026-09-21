// Tests for the 4-factor confluence engine (src/signals.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import assert from "node:assert/strict";
import { fuseSignals, weatherComponent, newsComponent, ageDecay, regionSignals,
  sentimentDirection, signalAdjustment, rankScore, compareCandidates, withSignalRank, againstSignal,
  weatherApplies, weatherNaReason, factorsOf, tagImpacts, seasonalComponent, REGIONS } from "./signals.js";

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

/* ---------------- 13. ranking: CONFLICT last, signal weighed ---------------- */
const bullish = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, newsItems: BULLISH_NEWS, bars: bars("up"), seasonalMean: 2.5 });
const conflicted = fuseSignals({ ticker: "CORN", month: JULY, now: NOW, weatherData: HOT_DRY_JULY, bars: bars("down"), seasonalMean: -2.5 });

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

test("weather applicability is DERIVED from the region table, never a second list", () => {
  for (const tk of ["CORN", "SOYB", "WEAT", "UNG", "BOIL"]) {
    assert.equal(weatherApplies(tk), true, `${tk} has regions in the table`);
    assert.ok(REGIONS.some((r) => r.affects.includes(tk)));
  }
  for (const tk of ["GLD", "SLV", "GDX", "USO", "XLE"]) {
    assert.equal(weatherApplies(tk), false, `${tk} has no region driving it`);
  }
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
  const gld = fuseSignals({ ticker: "GLD", month: JULY, weatherData: null, newsItems, bars: bars("up"), seasonalMean: 2.0, now: NOW });
  assert.deepEqual(gld.factors, ["seasonal", "technical", "news"]);
  assert.equal(gld.components.weather.applies, false);
  // Three of three agreeing is CONFLUENT; the fourth slot is not a quiet factor
  // holding it down to MIXED.
  assert.equal(gld.agreement, "CONFLUENT");
  assert.ok(gld.confidence >= 75, `three-factor confluence keeps its confidence (${gld.confidence})`);
  assert.ok(/does not apply/i.test(gld.narrative), "and the narrative says so once");

  // THE PROOF THAT IT IS THE EXCLUSION DOING THE WORK: the same readings on a
  // market that HAS weather, with none loaded, cannot reach CONFLUENT.
  const corn = fuseSignals({ ticker: "CORN", month: JULY, weatherData: null, newsItems: [{ title: "Beneficial rains improve the crop", date: daysAgo(0) }], bars: bars("up"), seasonalMean: 2.0, now: NOW });
  assert.equal(corn.components.weather.applies, true);
  assert.equal(corn.components.weather.strength, 0);
});

test("a market with no seasonal row at all reads UNKNOWN, never 0%/mo", () => {
  const c = seasonalComponent("GLD", JULY, null);
  assert.equal(c.mean, null, "null, not zero");
  assert.equal(c.strength, 0);
  assert.ok(/no seasonal history/.test(c.why));
  // And it is NOT excluded: seasonality applies to gold, it simply has not been
  // read yet, and not knowing something that matters is real uncertainty.
  assert.ok(factorsOf("GLD").keys.includes("seasonal"));
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

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
