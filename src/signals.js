// 4-factor confluence engine — PRD §7.
//
// Plain JS, no React imports: the client (App.jsx, pro.jsx), the Netlify
// functions and the test file all import from here.
//
// fuseSignals() reads four independent factors for one ticker — seasonality,
// price trend, weather and news — and returns a single score, a confidence, the
// four component readings, an agreement verdict and an English narrative that
// always contains the numbers behind the verdict.
//
// NOTE ON DUPLICATION — read before editing.
// The region table, the climate norms, the news cause->effect rules and the
// SMA/RSI read below are ports of the ones currently living in `pro.jsx`
// (`REGIONS`, `NORMALS`, `TAG_RULES`, `taSignals`). They are ports rather than
// imports because `pro.jsx` imports React and cannot be loaded outside the
// browser bundle. The thresholds and the reasoning are deliberately identical.
// When the UI is wired to this engine (next session, PRD §10 Day 2), `pro.jsx`
// must import these four blocks from here and delete its own copies, so the
// numbers cannot drift apart.

import { SEASONAL } from "./engine.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Direction as an arrow, for the UI. */
export const ARROW = { 1: "↑", "-1": "↓", 0: "≈" };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const signed = (x, digits = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;

/* ================================================================
   Region table and climate norms (port of pro.jsx REGIONS / NORMALS)
================================================================ */

export const REGIONS = [
  { id: "cornbelt", name: "Corn Belt (Iowa)", affects: ["CORN", "SOYB"], kind: "agri" },
  { id: "brazil", name: "Mato Grosso (Brazil)", affects: ["SOYB", "CORN"], kind: "agri" },
  { id: "plains", name: "Plains (Kansas)", affects: ["WEAT"], kind: "agri" },
  { id: "blacksea", name: "Odessa (Ukraine)", affects: ["WEAT", "CORN"], kind: "agri" },
  { id: "gas-south", name: "Dallas (cooling demand)", affects: ["UNG", "BOIL"], kind: "energy" },
  { id: "gas-ne", name: "New York (cooling demand)", affects: ["UNG", "BOIL"], kind: "energy" },
];

// Monthly climate normals: t = average daily Tmax in Celsius, p = rainfall in mm/month.
export const WEATHER_NORMALS = {
  cornbelt: { t: [0, 3, 10, 17, 23, 28, 30, 29, 25, 18, 9, 2], p: [26, 29, 55, 92, 118, 128, 114, 108, 79, 66, 48, 34] },
  brazil: { t: [31, 31, 31, 31, 30, 30, 31, 33, 34, 33, 31, 31], p: [211, 198, 185, 102, 34, 8, 6, 12, 44, 111, 166, 200] },
  plains: { t: [6, 9, 15, 21, 25, 31, 34, 33, 28, 21, 13, 7], p: [22, 26, 55, 71, 105, 111, 84, 76, 66, 55, 34, 27] },
  blacksea: { t: [3, 5, 9, 16, 21, 26, 29, 29, 23, 17, 10, 5], p: [38, 33, 31, 30, 34, 42, 32, 32, 34, 30, 39, 42] },
  "gas-south": { t: [14, 17, 21, 25, 29, 33, 36, 36, 32, 26, 20, 15], p: [58, 63, 82, 84, 118, 95, 55, 51, 66, 90, 65, 62] },
  "gas-ne": { t: [4, 6, 11, 17, 22, 27, 30, 29, 25, 18, 12, 7], p: [82, 74, 96, 96, 96, 92, 97, 95, 90, 88, 84, 92] },
};

// How much one region counts once its anomaly has been classified.
const REGION_WEIGHT = { strong: 1.0, medium: 0.65, weak: 0.3 };

/**
 * Read one region's 14-day forecast as an anomaly against its own monthly
 * climate norm — never against a fixed temperature threshold, because +30°C is
 * normal in Dallas in July and extreme in Odessa in April.
 * Returns { dir, weight, why } or null when the region has no usable data.
 */
export function readRegion(region, forecast, month) {
  const norm = WEATHER_NORMALS[region.id];
  if (!forecast || !norm || !forecast.tmax?.length || !forecast.prec?.length) return null;

  const tAvg = avg(forecast.tmax);
  const dT = tAvg - norm.t[month];
  const rain = sum(forecast.prec);
  const dP = rain - norm.p[month] / 2; // 14 days is roughly half a month
  const half = Math.floor(forecast.tmax.length / 2);
  const trend = avg(forecast.tmax.slice(half)) - avg(forecast.tmax.slice(0, half));
  const trendTxt = trend > 1.5 ? "and intensifying" : trend < -1.5 ? "and easing" : "and steady";
  const m = MONTHS[month];
  const head = `${region.name} runs ${signed(dT)}°C against its ${m} norm`;

  if (region.kind === "agri") {
    if (dT >= 3 && dP < 0) {
      return { dir: 1, weight: dT >= 5 ? REGION_WEIGHT.strong : REGION_WEIGHT.medium,
        why: `${head} with rain ${Math.abs(dP).toFixed(0)}mm below normal over 14 days, ${trendTxt} — crop stress, bullish` };
    }
    if (dT >= 3) {
      return { dir: 1, weight: REGION_WEIGHT.weak,
        why: `${head} but rain is normal (${signed(dP, 0)}mm), ${trendTxt} — mild pressure only` };
    }
    if (dP > norm.p[month] * 0.4 && dT <= 1) {
      return { dir: -1, weight: REGION_WEIGHT.medium,
        why: `${head} with rain ${signed(dP, 0)}mm above normal — near-ideal growing weather, bearish` };
    }
    if (dT <= -3) {
      return { dir: 0, weight: REGION_WEIGHT.weak,
        why: `${head}, cool enough to slow growth without damaging it — neutral` };
    }
    return { dir: 0, weight: REGION_WEIGHT.weak,
      why: `${head} with rain ${signed(dP, 0)}mm off normal — inside the seasonal range, not a factor` };
  }

  // Energy regions: the anomaly drives cooling/heating demand, not crop yield.
  if (dT >= 2.5) {
    return { dir: 1, weight: dT >= 4 ? REGION_WEIGHT.strong : REGION_WEIGHT.medium,
      why: `${head}, ${trendTxt} — abnormal cooling demand, bullish gas` };
  }
  if (dT <= -2.5) {
    return { dir: -1, weight: REGION_WEIGHT.medium,
      why: `${head}, ${trendTxt} — weak cooling demand, bearish gas` };
  }
  return { dir: 0, weight: REGION_WEIGHT.weak, why: `${head} — demand in line with the season` };
}

/**
 * WEATHER component, aggregated per TICKER rather than per region (PRD §7).
 * Each region declares which tickers it affects; three concurring regions on the
 * same ticker weigh more than a single one.
 */
export function weatherComponent(ticker, weatherData, month) {
  const relevant = REGIONS.filter((r) => r.affects.includes(ticker));
  const reads = [];
  for (const r of relevant) {
    const read = readRegion(r, weatherData?.[r.id], month);
    if (read) reads.push({ region: r.name, ...read });
  }
  if (!reads.length) {
    return { dir: 0, strength: 0, why: `no forecast available for the ${relevant.length} regions that drive ${ticker}`, regions: [] };
  }

  const net = sum(reads.map((r) => r.dir * r.weight));
  const dir = Math.sign(net);
  const concurring = reads.filter((r) => r.dir === dir && dir !== 0);
  // Concurrence bonus: the second and third region agreeing add conviction that
  // a single strong region cannot provide on its own.
  const strength = dir === 0 ? 0 : clamp(Math.round(40 * Math.abs(net) + 15 * (concurring.length - 1)), 0, 100);
  const against = reads.filter((r) => r.dir === -dir && r.dir !== 0);

  let why;
  if (dir === 0) {
    why = `all ${reads.length} regions watched for ${ticker} sit inside their seasonal norms, combined weight ${net.toFixed(2)}`;
  } else {
    const lead = concurring.slice(0, 2).map((r) => r.why).join("; ");
    why = `${concurring.length} of ${reads.length} regions affecting ${ticker} point ${dir > 0 ? "up" : "down"} (combined weight ${signed(net, 2)}): ${lead}`;
    if (against.length) why += `; ${against.length} ${against.length === 1 ? "region pulls" : "regions pull"} the other way`;
  }
  return { dir: strength >= 10 ? dir : 0, strength, why, regions: reads };
}

/* ================================================================
   News: cause -> effect tagging (port of pro.jsx TAG_RULES / tagImpacts)
================================================================ */

const TAG_RULES = [
  { re: /(heat ?wave|drought|dry (spell|weather)|scorching|soil moisture)/i, imp: [["CORN", 1], ["SOYB", 1], ["WEAT", 1]], why: "heat/water stress on crops cuts expected yield" },
  { re: /(beneficial rain|rains improve|good weather|favou?rable weather|bumper (crop|harvest)|record (crop|harvest))/i, imp: [["CORN", -1], ["SOYB", -1]], why: "favourable weather lifts expected supply" },
  { re: /(usda|wasde|crop report|grain stocks|acreage|prospective plantings)/i, imp: [["CORN", 0], ["SOYB", 0], ["WEAT", 0]], why: "USDA figure: direction depends on the number versus consensus" },
  { re: /(china).{0,40}(soy|grain|corn|purchas|import|buy)/i, imp: [["SOYB", 1], ["CORN", 1]], why: "Chinese export demand supports prices" },
  { re: /(export sales|export ban|export restriction|tariff|trade (war|deal))/i, imp: [["SOYB", 0], ["CORN", 0], ["WEAT", 0], ["SPY", -1]], why: "trade flows redirected; escalation is risk-off for equities" },
  { re: /(black sea|ukrain|grain corridor|odesa|russia.{0,30}(wheat|grain))/i, imp: [["WEAT", 1], ["CORN", 1]], why: "Black Sea supply risk puts a risk premium on grain" },
  { re: /(natural gas storage|eia.{0,30}(storage|inventory|injection)|working gas)/i, imp: [["UNG", 0], ["BOIL", 0]], why: "EIA storage figure: build above consensus bearish, below bullish" },
  { re: /(lng (export|terminal|plant)|freeport|cheniere|sabine)/i, imp: [["UNG", 1], ["BOIL", 1]], why: "more LNG export means more US gas demand" },
  { re: /(hurricane|tropical storm|gulf (of mexico|coast).{0,30}(gas|oil|energy))/i, imp: [["UNG", 1], ["BOIL", 1]], why: "Gulf production and infrastructure at risk" },
  { re: /(opec|crude .{0,10}(cut|sanction)|oil sanction|energy sanction|pipeline (halt|attack|outage)|nord stream)/i, imp: [["UNG", 1], ["SPY", -1]], why: "an energy supply shock spills over into gas" },
  { re: /(fed|fomc|interest rate|inflation|cpi|payrolls|recession)/i, imp: [["SPY", 0]], why: "US macro: hawkish prints bearish, dovish bullish" },
  { re: /(la ni[nñ]a|el ni[nñ]o|monsoon|frost|freeze|polar vortex)/i, imp: [["CORN", 0], ["SOYB", 0], ["UNG", 1]], why: "climate pattern; extreme cold lifts heating demand" },
  { re: /(ethanol|biofuel|renewable (fuel|diesel))/i, imp: [["CORN", 1], ["SOYB", 1]], why: "biofuel demand pulls on the crop" },
];

// Geopolitical / government sources move supply structurally rather than for a
// session, so they carry more weight than ordinary market chatter (PRD §7).
const GEO_RE = /(opec|sanction|embargo|black sea|ukrain|russia|usda|wasde|\beia\b|export ban|export restriction|tariff|trade war|china|government|ministry|nord stream|grain corridor|odesa|crop report|grain stocks|acreage)/i;

const GEO_WEIGHT = 1.8;
const MARKET_WEIGHT = 1.0;
const NEWS_HALF_LIFE_DAYS = 5; // a five-day-old item counts half

/** Tag one headline with its cause->effect impacts. */
export function tagImpacts(title) {
  const out = [];
  const seen = new Set();
  for (const r of TAG_RULES) {
    if (!r.re.test(title || "")) continue;
    for (const [tk, dir] of r.imp) {
      if (seen.has(tk)) continue;
      seen.add(tk);
      out.push({ tk, dir, why: r.why });
    }
  }
  return out;
}

export const ageDecay = (days) => clamp(Math.pow(0.5, Math.max(0, days) / NEWS_HALF_LIFE_DAYS), 0.05, 1);

/**
 * NEWS component. Age-decayed, and geopolitical/government items weigh more.
 * `geoDir` is returned separately: weather agreeing with geopolitical news is a
 * reinforced signal in the fusion step below.
 */
export function newsComponent(ticker, newsItems, now = Date.now()) {
  const items = Array.isArray(newsItems) ? newsItems : [];
  let net = 0, geoNet = 0, nUp = 0, nDown = 0, nAmbiguous = 0, nGeo = 0;
  let freshest = null;

  for (const it of items) {
    const impacts = it.impacts?.length ? it.impacts : tagImpacts(it.title);
    const hit = impacts.find((im) => im.tk === ticker);
    if (!hit) continue;
    const dir = typeof hit.dir === "number" ? hit.dir : hit.dir === "↑" ? 1 : hit.dir === "↓" ? -1 : 0;

    const t = it.date ? new Date(it.date).getTime() : NaN;
    const days = Number.isFinite(t) ? (now - t) / 86400000 : NEWS_HALF_LIFE_DAYS;
    const decay = ageDecay(days);
    const isGeo = it.geo === true || GEO_RE.test(it.title || "");
    if (isGeo) nGeo++;

    if (dir === 0) { nAmbiguous++; continue; }
    if (dir > 0) nUp++; else nDown++;
    if (freshest === null || days < freshest) freshest = days;

    const w = dir * (isGeo ? GEO_WEIGHT : MARKET_WEIGHT) * decay;
    net += w;
    if (isGeo) geoNet += w;
  }

  const tagged = nUp + nDown + nAmbiguous;
  if (!tagged) {
    return { dir: 0, strength: 0, why: `none of the ${items.length} headlines read tag ${ticker}`, geoDir: 0, counts: { up: 0, down: 0, ambiguous: 0, geo: 0 } };
  }

  const dir = Math.abs(net) >= 0.4 ? Math.sign(net) : 0;
  const strength = clamp(Math.round(Math.abs(net) * 25), 0, 100);
  const nDays = freshest === null ? 0 : Math.round(freshest);
  const freshTxt = freshest === null ? "" : `, freshest is ${freshest < 1 ? "under a day" : `${nDays} ${nDays === 1 ? "day" : "days"}`} old`;
  const head = `${tagged} ${tagged === 1 ? "headline tags" : "headlines tag"} ${ticker}`;
  const why = dir === 0
    ? `${head} (${nUp} bullish, ${nDown} bearish, ${nAmbiguous} direction-dependent) but after age decay the balance is only ${signed(net, 2)}${freshTxt}`
    : `${head}, ${nGeo} of them geopolitical or government; after age decay the balance is ${signed(net, 2)} (${nUp} bullish, ${nDown} bearish)${freshTxt}`;

  return {
    dir: strength >= 10 ? dir : 0,
    strength,
    why,
    geoDir: Math.abs(geoNet) >= 0.4 ? Math.sign(geoNet) : 0,
    counts: { up: nUp, down: nDown, ambiguous: nAmbiguous, geo: nGeo },
  };
}

/* ================================================================
   Technical (port of the SMA/RSI read in pro.jsx taSignals)
================================================================ */

/** SMA20 / SMA50 / RSI14 read of a daily bar series. Null under 60 bars. */
export function taRead(bars) {
  if (!bars || bars.length < 60) return null;
  const cl = bars.map((b) => b.close);
  const sma = (n, i = cl.length - 1) => avg(cl.slice(i - n + 1, i + 1));
  const s20 = sma(20), s50 = sma(50), s20p = sma(20, cl.length - 6), s50p = sma(50, cl.length - 6);
  let g = 0, l = 0;
  for (let i = cl.length - 14; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
  const rsi = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  const trend = s20 > s50 && s20 > s20p ? 1 : s20 < s50 && s20 < s20p ? -1 : 0;
  const cross = s20 > s50 && s20p <= s50p ? "golden" : s20 < s50 && s20p >= s50p ? "death" : null;
  return { trend, rsi, s20, s50, cross, px: cl[cl.length - 1] };
}

export function technicalComponent(bars) {
  const ta = taRead(bars);
  if (!ta) return { dir: 0, strength: 0, why: `fewer than 60 daily bars available (${bars?.length || 0}), the trend read is skipped`, ta: null };

  const sep = Math.abs(ta.s20 / ta.s50 - 1) * 100; // gap between the two averages, in %
  if (ta.trend === 0) {
    return { dir: 0, strength: 0, ta,
      why: `SMA20 ${ta.s20.toFixed(2)} and SMA50 ${ta.s50.toFixed(2)} are ${sep.toFixed(1)}% apart and flat, RSI ${ta.rsi.toFixed(0)} — no trend to lean on` };
  }
  let strength = clamp(Math.round(30 + 20 * sep), 0, 100);
  const stretched = (ta.trend > 0 && ta.rsi >= 70) || (ta.trend < 0 && ta.rsi <= 30);
  if (stretched) strength = Math.round(strength * 0.7);
  const why = `price ${ta.px.toFixed(2)} with SMA20 ${ta.s20.toFixed(2)} ${ta.trend > 0 ? "above" : "below"} SMA50 ${ta.s50.toFixed(2)} by ${sep.toFixed(1)}%, RSI ${ta.rsi.toFixed(0)}`
    + (ta.cross ? ` after a ${ta.cross} cross` : "")
    + (stretched ? ` — the trend is real but RSI ${ta.rsi.toFixed(0)} is stretched, so this reading is cut by 30%` : "");
  return { dir: ta.trend, strength, why, ta };
}

/* ================================================================
   Seasonal
================================================================ */

/** seasonalMean is a %/month figure; an array of 12 is indexed by month. */
export function seasonalComponent(ticker, month, seasonalMean) {
  let mean = seasonalMean;
  if (Array.isArray(mean)) mean = mean[month];
  if (mean == null || !Number.isFinite(mean)) mean = SEASONAL[ticker]?.[month];
  if (mean == null || !Number.isFinite(mean)) {
    return { dir: 0, strength: 0, why: `no seasonal history for ${ticker}`, mean: null };
  }
  const dir = mean > 0.8 ? 1 : mean < -0.8 ? -1 : 0;
  const strength = clamp(Math.round(Math.abs(mean) * 40), 0, 100);
  const why = dir === 0
    ? `${MONTHS[month]} has averaged ${signed(mean)}% for ${ticker}, inside the +/-0.8% band that counts as no seasonal edge`
    : `${MONTHS[month]} has averaged ${signed(mean)}% for ${ticker} historically, a ${dir > 0 ? "bullish" : "bearish"} month`;
  return { dir: strength >= 10 ? dir : 0, strength, why, mean };
}

/* ================================================================
   Fusion
================================================================ */

const WEIGHTS = { seasonal: 0.30, technical: 0.25, weather: 0.25, news: 0.20 };
const LABEL = { seasonal: "seasonality", technical: "the price trend", weather: "weather", news: "news flow" };
const REINFORCE = 1.25; // weather and geopolitical news agreeing on the same ticker
const CONFLICT_DAMPING = 0.6;

const dirWord = (d) => (d > 0 ? "higher" : d < 0 ? "lower" : "sideways");
const scoreTxt = (x) => (x === 0 ? "0" : signed(x, 0));
const verb = (n, singular, plural) => (n === 1 ? singular : plural);

/**
 * @param {object}   input
 * @param {string}   input.ticker        e.g. "CORN"
 * @param {number}  [input.month]        0-11, defaults to the current month
 * @param {object}  [input.weatherData]  { regionId: { tmax[], tmin[], prec[], dates[] } }
 * @param {Array}   [input.newsItems]    [{ title, date, geo, impacts? }]
 * @param {Array}   [input.bars]         daily bars [{ close, ... }], 60+ needed
 * @param {number|number[]} [input.seasonalMean] %/month, or 12 monthly means
 * @param {number}  [input.now]          epoch ms, injectable for tests
 */
export function fuseSignals({ ticker, month, weatherData, newsItems, bars, seasonalMean, now = Date.now() } = {}) {
  const m = Number.isInteger(month) ? month : new Date(now).getMonth();

  const components = {
    seasonal: seasonalComponent(ticker, m, seasonalMean),
    technical: technicalComponent(bars),
    weather: weatherComponent(ticker, weatherData, m),
    news: newsComponent(ticker, newsItems, now),
  };
  for (const k of Object.keys(components)) components[k].arrow = ARROW[components[k].dir];

  const keys = Object.keys(WEIGHTS);
  const up = keys.filter((k) => components[k].dir > 0);
  const down = keys.filter((k) => components[k].dir < 0);
  const quiet = keys.filter((k) => components[k].dir === 0);
  const nActive = up.length + down.length;

  let agreement;
  if (up.length && down.length) agreement = "CONFLICT";
  else if (nActive >= 3) agreement = "CONFLUENT";
  else agreement = "MIXED";

  // Score: weighted sum of signed strengths, so it already lives in -100..100.
  let raw = sum(keys.map((k) => WEIGHTS[k] * components[k].dir * components[k].strength));

  const reinforced = components.weather.dir !== 0 && components.weather.dir === components.news.geoDir;
  if (reinforced) raw *= REINFORCE;
  if (agreement === "CONFLICT") raw *= CONFLICT_DAMPING;
  const score = clamp(Math.round(raw), -100, 100);

  const agreeing = up.length ? up : down;
  const meanStrength = agreeing.length ? avg(agreeing.map((k) => components[k].strength)) : 0;

  let confidence;
  if (agreement === "CONFLUENT") {
    confidence = clamp(Math.round(75 + 0.15 * meanStrength + (nActive - 3) * 5), 75, 95);
  } else if (agreement === "CONFLICT") {
    // The more evenly matched and the stronger the opposition, the less we know.
    const severity = Math.min(avg(up.map((k) => components[k].strength)), avg(down.map((k) => components[k].strength)));
    confidence = clamp(Math.round(38 - 0.25 * severity), 8, 39);
  } else if (nActive === 2) {
    confidence = clamp(Math.round(50 + 0.2 * meanStrength), 45, 70);
  } else if (nActive === 1) {
    confidence = clamp(Math.round(45 + 0.12 * meanStrength), 45, 58);
  } else {
    // Nothing is pushing: this is the "nothing today" case, not a 45-70 read.
    confidence = 20;
  }

  const narrative = buildNarrative({ ticker, month: m, components, agreement, score, confidence, up, down, quiet, reinforced });

  return { ticker, month: m, score, confidence, components, agreement, narrative, reinforced };
}

function buildNarrative({ ticker, month, components, agreement, score, confidence, up, down, quiet, reinforced }) {
  const keys = Object.keys(WEIGHTS);
  const nActive = up.length + down.length;
  const strongest = [...keys].sort((a, b) => components[b].strength - components[a].strength);
  const s = [];

  // 1) The verdict, with both numbers.
  if (agreement === "CONFLUENT") {
    const d = up.length ? 1 : -1;
    s.push(`${ticker}: ${nActive} of the 4 factors point ${dirWord(d)} together, giving a score of ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
  } else if (agreement === "CONFLICT") {
    s.push(`${ticker}: the factors contradict each other, so the score is held down to ${scoreTxt(score)} out of 100 and confidence to ${confidence}/100`);
  } else if (nActive === 0) {
    s.push(`${ticker}: none of the 4 factors is pushing in either direction, so the score is ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
  } else {
    const d = up.length ? 1 : -1;
    s.push(`${ticker}: ${nActive} of the 4 factors ${verb(nActive, "points", "point")} ${dirWord(d)} and ${quiet.length} ${verb(quiet.length, "is", "are")} neutral, giving a score of ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
  }

  // 2) The strongest reading, in full, with its numbers.
  const lead = strongest[0];
  s.push(`The heaviest reading is ${LABEL[lead]} at ${components[lead].strength}/100: ${components[lead].why}`);

  // 3) Who disagrees, or what stays quiet.
  if (agreement === "CONFLICT") {
    const upTxt = up.map((k) => `${LABEL[k]} (${components[k].strength}/100)`).join(" and ");
    const downTxt = down.map((k) => `${LABEL[k]} (${components[k].strength}/100)`).join(" and ");
    s.push(`The contradiction is direct: ${upTxt} read higher while ${downTxt} read lower, and two factors cannot both be right about the same ${MONTHS[month]} tape`);
  } else if (reinforced) {
    s.push(`Weather and geopolitical news agree on ${ticker}, which is two independent sources saying the same thing, so the score carries a ${REINFORCE}x reinforcement multiplier`);
  } else if (quiet.length) {
    const quietTxt = quiet.map((k) => `${LABEL[k]} (${components[k].strength}/100)`).join(", ");
    s.push(`Adding nothing this week: ${quietTxt}`);
  } else {
    s.push(`All 4 factors are active and none contradicts the others, which is the ${nActive}-factor case the engine is built to find`);
  }

  // 4) What it means for an order, against the thresholds the app actually uses.
  if (agreement === "CONFLUENT" && confidence >= 70) {
    s.push(`At ${confidence}/100 this clears the 70-confidence bar the autopilot needs to propose a defined-risk spread in the ${dirWord(up.length ? 1 : -1)} direction`);
  } else if (agreement === "CONFLICT") {
    s.push(`Confidence ${confidence}/100 is under the 40 the risk gate treats as a warning, so nothing here justifies an order today`);
  } else if (nActive === 0) {
    s.push(`With no factor above the noise floor the honest answer is nothing today, not a trade at ${confidence}/100 confidence`);
  } else {
    s.push(`At ${confidence}/100 this sits below the 70-confidence bar for opening a position, so it is a watch-list name rather than a trade`);
  }

  return s.join(". ") + ".";
}
