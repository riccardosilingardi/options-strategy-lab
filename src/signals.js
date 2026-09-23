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
// SINGLE SOURCE OF TRUTH — read before editing.
// The region table, the climate norms, the news cause->effect rules and the
// SMA/RSI read below used to be duplicated in `pro.jsx`. They are not any more:
// `pro.jsx` imports them from here and keeps only the rendering. Never copy a
// threshold out of this file into a component — two copies drift apart, and
// then two screens disagree about the same trade.

import { SEASONAL } from "./engine.js";
import { RULES, liquidityLevel, butterflySkipNote } from "./rules.js";
import { trendRead } from "./indicators.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Direction as an arrow, for the UI. */
export const ARROW = { 1: "↑", "-1": "↓", 0: "≈" };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const sum = (a) => a.reduce((x, y) => x + y, 0);
const avg = (a) => (a.length ? sum(a) / a.length : 0);
const signed = (x, digits = 1) => `${x >= 0 ? "+" : ""}${x.toFixed(digits)}`;

/* ================================================================
   Region table and climate norms
================================================================ */

// `lat`/`lon` are the Open-Meteo request coordinates, `phase` the crop or demand
// phase shown next to each region in the weather drill-down.
export const REGIONS = [
  { id: "cornbelt", name: "Corn Belt (Iowa)", lat: 41.6, lon: -93.6, affects: ["CORN", "SOYB"], kind: "agri", phase: "Jul-Aug: corn pollination / soybean flowering" },
  { id: "brazil", name: "Mato Grosso (Brazil)", lat: -15.6, lon: -56.1, affects: ["SOYB", "CORN"], kind: "agri", phase: "Oct-Feb: soybean planting and growth (off-season now)" },
  { id: "plains", name: "Plains (Kansas)", lat: 37.7, lon: -97.3, affects: ["WEAT"], kind: "agri", phase: "Jun-Jul: winter wheat harvest" },
  { id: "blacksea", name: "Odessa (Ukraine)", lat: 46.5, lon: 30.7, affects: ["WEAT", "CORN"], kind: "agri", phase: "Jul: Black Sea wheat harvest" },
  { id: "gas-south", name: "Dallas (cooling demand)", lat: 32.8, lon: -96.8, affects: ["UNG", "BOIL"], kind: "energy", phase: "Summer: cooling degree days drive power burn" },
  { id: "gas-ne", name: "New York (cooling demand)", lat: 40.7, lon: -74.0, affects: ["UNG", "BOIL"], kind: "energy", phase: "Summer: cooling degree days drive power burn" },
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
  // >>> DOES NOT APPLY IS NOT QUIET. <<< See `weatherApplies()` below: with no
  // region declaring this market there is no weather READING to be had, ever,
  // and the old sentence here — "no forecast available for the 0 regions that
  // drive GLD" — was a missing forecast where the truth is that the question
  // does not arise. `applies: false` is what keeps it out of the weighted sum
  // and out of the confidence denominator rather than scoring it 0/100.
  if (!relevant.length) {
    return { dir: 0, strength: 0, applies: false, why: weatherNaReason(ticker), regions: [] };
  }
  const reads = [];
  for (const r of relevant) {
    const read = readRegion(r, weatherData?.[r.id], month);
    if (read) reads.push({ region: r.name, ...read });
  }
  if (!reads.length) {
    return { dir: 0, strength: 0, applies: true, why: `no forecast available for the ${relevant.length} regions that drive ${ticker}`, regions: [] };
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
  return { dir: strength >= 10 ? dir : 0, strength, applies: true, why, regions: reads };
}

/* ================================================================
   WHICH OF THE FOUR FACTORS APPLY TO A MARKET

   >>> WEATHER DOES NOT APPLY TO A METAL, AND A FACTOR THAT DOES NOT APPLY IS
   NOT A QUIET ONE. <<< Nothing about a forecast moves an ounce of gold, so
   scoring GLD's weather as 0/100 would put a quarter of the weighted sum on a
   question that has no answer, drag every score toward zero, and — worse —
   spend one of the four slots the CONFLUENT/MIXED read is counted out of. A
   market with three real factors would then look less certain than one with
   four, purely because a fourth had been invented and then silently failed.

   TWO CASES, AND THEY ARE DIFFERENT:
     - DOES NOT APPLY (weather on a metal): dropped from the weights and from
       the counts. The remaining weights are renormalised so they still sum to
       one, and the screen says so.
     - APPLIES BUT IS UNKNOWN (no forecast loaded yet; no seasonal history yet):
       kept, contributing nothing. Not knowing something that matters IS real
       uncertainty about this market and belongs in the score and in the
       confidence. Only the first case is an exclusion.

   IT IS DERIVED, NEVER A SECOND LIST. `REGIONS` already declares which markets
   each region drives; a hand-typed "these have weather" beside it would be two
   answers to one question waiting to disagree.
================================================================ */

/** True when some region in the table declares that it drives this market. */
export const weatherApplies = (ticker) => REGIONS.some((r) => r.affects.includes(ticker));

/* WHY NOT, IN ONE LINE EACH. These are sentences, not thresholds: nothing here
   decides anything, `weatherApplies()` above does. Written per market because
   "no region drives it" is true and useless — the reader wants to know whether
   that is a gap in the table or a fact about the asset. */
const WEATHER_NA = {
  GLD: "Weather does not apply to gold: an ounce is not grown, not stored in degree-days and not consumed by a cold winter. What moves it — real yields, the dollar, central-bank buying — reaches this app through the news factor.",
  SLV: "Weather does not apply to silver. Its industrial half moves with manufacturing demand and its monetary half with real yields, and neither is a forecast; both reach this app through the news factor.",
  GDX: "Weather does not apply to gold miners. They are equities whose earnings track the gold price, so the same reasoning as GLD holds one step removed.",
  USO: "Weather is not read for crude here. A Gulf hurricane really can shut production in, but this app's regions are crop stress and heating or cooling demand, and neither of those is what moves a barrel — storm supply risk reaches crude through the news rules instead.",
  XLE: "Weather is not read for energy equities here, for the same reason as crude: this app's regions measure crop stress and degree-days, and an integrated oil company's earnings are not a function of either.",
};

/** The sentence a screen prints where the weather bar would have been. */
export const weatherNaReason = (ticker) => WEATHER_NA[ticker]
  || `No region in this app's table drives ${ticker}, so there is no weather reading for it — and no reading is not a reading of zero.`;

/**
 * THE APPLICABLE FACTORS AND THEIR WEIGHTS, for one market.
 * @returns {{ keys: string[], weights: object, excluded: string[], note: ?string }}
 *   `weights` always sums to 1 across `keys`, so dropping a factor redistributes
 *   its share in proportion rather than leaving a quarter of the scale unused.
 */
export function factorsOf(ticker) {
  const applies = { seasonal: true, technical: true, weather: weatherApplies(ticker), news: true };
  const keys = Object.keys(BASE_WEIGHTS).filter((k) => applies[k]);
  const total = sum(keys.map((k) => BASE_WEIGHTS[k]));
  const weights = Object.fromEntries(keys.map((k) => [k, BASE_WEIGHTS[k] / total]));
  const excluded = Object.keys(BASE_WEIGHTS).filter((k) => !applies[k]);
  return { keys, weights, excluded,
    note: excluded.includes("weather") ? weatherNaReason(ticker) : null };
}

/* ================================================================
   News: cause -> effect tagging
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
  { re: /(opec|crude .{0,10}(cut|sanction)|oil sanction|energy sanction|pipeline (halt|attack|outage)|nord stream)/i, imp: [["UNG", 1], ["USO", 1], ["XLE", 1], ["SPY", -1]], why: "an energy supply shock lifts the barrel and spills over into gas" },
  { re: /(la ni[nñ]a|el ni[nñ]o|monsoon|frost|freeze|polar vortex)/i, imp: [["CORN", 0], ["SOYB", 0], ["UNG", 1]], why: "climate pattern; extreme cold lifts heating demand" },
  { re: /(ethanol|biofuel|renewable (fuel|diesel))/i, imp: [["CORN", 1], ["SOYB", 1]], why: "biofuel demand pulls on the crop" },

  /* ---- THE LIQUID TIER (ROADMAP P2-bis) ----
     Same shape as everything above: a regular expression, the markets it moves,
     and ONE LINE saying why it moves them. A headline whose direction genuinely
     depends on the number against consensus is tagged 0 — ambiguous — exactly
     as the USDA and EIA storage rules already are, because a guess dressed as a
     direction is worse than saying the print decides.

     GDX RIDES WITH GOLD, LEVERAGED. A miner's revenue is the gold price and its
     costs are not, so the same cause reaches it amplified rather than
     differently — which is why it appears beside GLD rather than in rules of
     its own, except where the cause really is specific to a mine. */
  { re: /(rate cut|dovish|easing cycle|(lower|falling|negative) real yields)/i, imp: [["GLD", 1], ["SLV", 1], ["GDX", 1]], why: "lower real yields cut the cost of holding an asset that pays no income" },
  { re: /(rate hike|hawkish|higher for longer|(rising|higher) real yields)/i, imp: [["GLD", -1], ["SLV", -1], ["GDX", -1]], why: "higher real yields raise the cost of holding an asset that pays no income" },
  { re: /(dollar (index|rally|strength|surge)|\bdxy\b|stronger dollar)/i, imp: [["GLD", -1], ["SLV", -1], ["GDX", -1]], why: "a stronger dollar makes dollar-priced metal dearer in every other currency" },
  { re: /(weaker dollar|dollar (slide|weakness|falls|slips))/i, imp: [["GLD", 1], ["SLV", 1], ["GDX", 1]], why: "a weaker dollar makes dollar-priced metal cheaper in every other currency" },
  { re: /(safe.haven|bullion|central bank.{0,20}(gold|buying|reserves)|gold reserves)/i, imp: [["GLD", 1], ["SLV", 1], ["GDX", 1]], why: "reserve and haven buying is demand that does not care about the price" },
  { re: /(solar (panel|demand|installation)|photovoltaic|industrial (silver|metal) demand)/i, imp: [["SLV", 1]], why: "silver is half an industrial metal, and solar is its largest single use" },
  { re: /(mine (strike|closure|accident|outage)|mining (strike|output|production)|ore grade|all.in sustaining)/i, imp: [["GDX", 0]], why: "a mine disruption cuts a miner's output and lifts the metal: which dominates depends on the miner" },
  { re: /(eia.{0,30}(crude|petroleum|oil).{0,25}(stock|inventor)|crude (inventories|stocks|stockpiles))/i, imp: [["USO", 0], ["XLE", 0]], why: "EIA crude inventory: a build above consensus is bearish, a draw bullish" },
  { re: /(hormuz|red sea|houthi|tanker (attack|seiz|strike)|shipping (lane|disruption|attack)|suez)/i, imp: [["USO", 1], ["XLE", 1], ["SPY", -1]], why: "a threat to the sea lanes that carry crude puts a risk premium on the barrel" },
  { re: /(refinery (outage|fire|shutdown|closure)|refining margin|crack spread)/i, imp: [["XLE", 1], ["USO", 0]], why: "lost refining capacity widens margins for those still running and backs crude up at the wellhead" },
  { re: /(shale|permian|rig count|us (oil|crude) (output|production))/i, imp: [["USO", -1], ["XLE", -1]], why: "more US output is more supply, and the marginal barrel sets the price" },

  /* >>> LAST, AND THE ORDER IS THE POINT. <<< `tagImpacts()` gives each ticker
     to the FIRST rule that claims it, so a catch-all has to sit below every
     rule that says something sharper. "Fed signals a rate cut as real yields
     fall" matches both this and the rule above it; the specific one knows the
     direction and this one only knows the subject, so the specific one must
     get there first. This used to sit in the middle of the list, where it was
     harmless with SPY as its only ticker and stopped being harmless the moment
     the metals were added to it. */
  { re: /(fed|fomc|interest rate|inflation|cpi|payrolls|recession)/i, imp: [["SPY", 0], ["GLD", 0], ["SLV", 0], ["GDX", 0]], why: "US macro: hawkish prints bearish for an asset that pays no income, dovish bullish" },
];

// Geopolitical / government sources move supply structurally rather than for a
// session, so they carry more weight than ordinary market chatter (PRD §7).
const GEO_RE = /(opec|sanction|embargo|black sea|ukrain|russia|usda|wasde|\beia\b|export ban|export restriction|tariff|trade war|china|government|ministry|nord stream|grain corridor|odesa|crop report|grain stocks|acreage|hormuz|red sea|houthi|central bank|federal reserve|fomc)/i;

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
   Technical: SMA / RSI read
================================================================ */

/** SMA20 / SMA50 / RSI14 read of a daily bar series. Null under 60 bars.
 *
 *  >>> THE ARITHMETIC MOVED TO `src/indicators.js` AND DID NOT CHANGE. <<<
 *  It was written inline here, and the price chart drew none of it — so the
 *  moment the chart gained a moving average there would have been two SMA20s
 *  in this app, which is the fault this repository has already fixed for the
 *  chance of profit, the seasonal drift, the realised volatility and open
 *  interest. `indicators.js` is the one home; this is the one caller that
 *  SCORES what it reads.
 *
 *  `indicators.test.js` runs the body this function used to have against the
 *  body it has now, over the same bars, and holds every field equal —
 *  because a refactor that moves a number is two changes wearing one coat. */
export const taRead = (bars) => trendRead(bars);

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

/* THE FOUR WEIGHTS AS WRITTEN. `factorsOf()` above renormalises them over the
   factors that apply to a given market, so this is the shape of the scale and
   never the scale a particular market is scored on. Unchanged in value. */
const BASE_WEIGHTS = { seasonal: 0.30, technical: 0.25, weather: 0.25, news: 0.20 };
// The gate's warning floor, imported rather than written down again: a
// narrative must only ever quote a threshold the code actually applies.
const LOW_CONFIDENCE = RULES.lowConfidence;
// THE BAR THE AUTOPILOT WAITS FOR, READ FROM ITS HOME. It was written out as a
// bare 70 in the two sentences below — with no home in RULES, and a value that
// collides with `expensiveIVRank`, which is why this file could not be swept
// for rule literals at all. Both are fixed by the constant, not by the sweep.
const AUTOPILOT_CONFIDENCE = RULES.autopilotConfidence;
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

  // WHICH FACTORS THIS MARKET HAS AT ALL, and the weights renormalised over
  // them. Everything below counts `keys` and never the four: a factor that does
  // not apply is not in the sum, not in the agreement count and not in the
  // confidence denominator.
  const { keys, weights, excluded, note: factorNote } = factorsOf(ticker);
  for (const k of excluded) components[k].applies = false;
  const up = keys.filter((k) => components[k].dir > 0);
  const down = keys.filter((k) => components[k].dir < 0);
  const quiet = keys.filter((k) => components[k].dir === 0);
  const nActive = up.length + down.length;

  let agreement;
  if (up.length && down.length) agreement = "CONFLICT";
  // THREE AGREEING IS STILL THREE. On a market with only three factors that
  // means all three, which is a HIGHER bar than three of four — deliberately:
  // there is less evidence, so the word CONFLUENT has to be harder to earn, not
  // easier. Scaling the bar with the count would have made a market with one
  // factor removed look more certain than one with it.
  else if (nActive >= 3) agreement = "CONFLUENT";
  else agreement = "MIXED";

  // Score: weighted sum of signed strengths, so it already lives in -100..100.
  let raw = sum(keys.map((k) => weights[k] * components[k].dir * components[k].strength));

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

  const narrative = buildNarrative({ ticker, month: m, components, agreement, score, confidence, up, down, quiet, reinforced, keys, factorNote });

  return { ticker, month: m, score, confidence, components, agreement, narrative, reinforced,
    // THE SCALE THIS MARKET WAS SCORED ON TRAVELS WITH THE SCORE. `why.jsx`
    // printed "seasonality 30%, price trend 25%, weather 25%, news 20%" as a
    // fixed sentence under the bars; on a market with no weather that sentence
    // would have been describing a scale nothing was measured against.
    factors: keys, weights, excluded, factorNote };
}

function buildNarrative({ ticker, month, components, agreement, score, confidence, up, down, quiet, reinforced, keys, factorNote }) {
  const nActive = up.length + down.length;
  const strongest = [...keys].sort((a, b) => components[b].strength - components[a].strength);
  const s = [];

  // 1) The verdict, with both numbers.
  if (agreement === "CONFLUENT") {
    const d = up.length ? 1 : -1;
    s.push(`${ticker}: ${nActive} of the ${keys.length} factors point ${dirWord(d)} together, giving a score of ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
  } else if (agreement === "CONFLICT") {
    s.push(`${ticker}: the factors contradict each other, so the score is held down to ${scoreTxt(score)} out of 100 and confidence to ${confidence}/100`);
  } else if (nActive === 0) {
    s.push(`${ticker}: none of the ${keys.length} factors is pushing in either direction, so the score is ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
  } else {
    const d = up.length ? 1 : -1;
    s.push(`${ticker}: ${nActive} of the ${keys.length} factors ${verb(nActive, "points", "point")} ${dirWord(d)} and ${quiet.length} ${verb(quiet.length, "is", "are")} neutral, giving a score of ${scoreTxt(score)} out of 100 at ${confidence}/100 confidence`);
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
    s.push(`All ${keys.length} factors are active and none contradicts the others, which is the ${nActive}-factor case the engine is built to find`);
  }

  // 3b) AND IF ONE OF THE FOUR IS NOT THERE AT ALL, THAT IS SAID ONCE. It is a
  // fact about the market rather than about today, so it comes after the read
  // and not instead of it.
  if (factorNote) s.push(factorNote.replace(/\.$/, ""));

  // 4) What it means for an order, against the thresholds the app actually uses.
  if (agreement === "CONFLUENT" && confidence >= AUTOPILOT_CONFIDENCE) {
    s.push(`At ${confidence}/100 this clears the ${AUTOPILOT_CONFIDENCE}-confidence bar the autopilot needs to propose a defined-risk spread in the ${dirWord(up.length ? 1 : -1)} direction`);
  } else if (agreement === "CONFLICT") {
    s.push(`Confidence ${confidence}/100 is under the ${LOW_CONFIDENCE} the risk gate treats as a warning, so nothing here justifies an order today`);
  } else if (nActive === 0) {
    s.push(`With no factor above the noise floor the honest answer is nothing today, not a trade at ${confidence}/100 confidence`);
  } else {
    // Two different bars, and saying "not a trade" conflates them. The
    // autopilot bar is what
    // the AUTOPILOT needs before it proposes something unprompted (PRD §9); the
    // guided flow's floor is the risk gate's 40. A market at 55 is one you may
    // trade deliberately but not one the app will bring to you on its own — and
    // on a screen that is offering it as a road, "this is not a trade" reads as
    // the app arguing with itself in front of the user.
    s.push(`At ${confidence}/100 this clears the ${LOW_CONFIDENCE} the risk gate needs but not the ${AUTOPILOT_CONFIDENCE} the autopilot ` +
      `waits for before proposing anything unprompted, so it is worth taking deliberately rather than on autopilot`);
  }

  return s.join(". ") + ".";
}

/* ================================================================
   Adapters for the UI

   These exist so no component ever re-implements a threshold. They reshape
   what the engine already computed; they never decide anything new.
================================================================ */

/** Weight -> the word the weather drill-down shows next to a region. */
export const WEIGHT_LABEL = (w) => (w >= 1 ? "strong" : w >= 0.65 ? "medium" : "weak");

/**
 * One row per watched region, shaped for the weather drill-down: arrow direction, a
 * strength word and the same `why` sentence the engine reasons with.
 */
export function regionSignals(weatherData, month = new Date().getMonth()) {
  const out = [];
  for (const rg of REGIONS) {
    const read = readRegion(rg, weatherData?.[rg.id], month);
    if (!read) continue;
    out.push({ region: rg.name, tks: rg.affects, dir: ARROW[read.dir], numDir: read.dir, strength: WEIGHT_LABEL(read.weight), why: read.why });
  }
  return out;
}

/* ================================================================
   Ranking — PRD §7 wiring

   A candidate is ranked on its expected value AND on whether the four factors
   agree with the direction that candidate needs. A CONFLICT always ranks last:
   when the factors contradict each other we do not know enough to trade, and no
   expected value is allowed to argue us out of that.
================================================================ */

/** The direction a sentiment preset needs in order to pay: +1, -1 or 0. */
export function sentimentDirection(sent) {
  if (sent === "bull" || sent === "verybull") return 1;
  if (sent === "bear" || sent === "verybear") return -1;
  return 0;
}

/**
 * How many EV points the signal read is worth to a candidate that needs
 * direction `dir`. Scaled by confidence, so a 20/100 read barely moves a rank.
 * A range structure (dir 0) is helped by a quiet tape and hurt by a loud one.
 */
export function signalAdjustment(fused, dir) {
  if (!fused) return 0;
  const align = dir === 0 ? (40 - Math.abs(fused.score)) / 2 : (dir * fused.score) / 2;
  return align * (fused.confidence / 100);
}

/** EV per $100 at risk, adjusted by the signal read. */
export function rankScore(ev100, fused, dir) {
  return (Number.isFinite(ev100) ? ev100 : -999) + signalAdjustment(fused, dir);
}

/**
 * Comparator for candidates carrying `{ conflict, rank }`. CONFLICT last, then
 * best adjusted rank first.
 */
export function compareCandidates(a, b) {
  if (!!a.conflict !== !!b.conflict) return a.conflict ? 1 : -1;
  return b.rank - a.rank;
}

/** Attach `conflict` and `rank` to a candidate, ready for compareCandidates. */
export function withSignalRank(candidate, fused, dir) {
  return {
    ...candidate,
    fused,
    conflict: fused?.agreement === "CONFLICT",
    rank: rankScore(candidate.ev100, fused, dir),
  };
}

/* ================================================================
   Going against the signal — PRD §7 / §2 override pattern
================================================================ */

// Below this the score is noise and there is nothing to go against.
const AGAINST_MIN_SCORE = 10;

/**
 * Is a trade needing direction `dir` fighting the engine? Returns null when it
 * is not, otherwise the numbers the prompt must state. Never blocks: the caller
 * asks for a written reason and stores it with the position.
 */
export function againstSignal(fused, dir) {
  if (!fused || !dir) return null;
  if (Math.abs(fused.score) < AGAINST_MIN_SCORE) return null;
  if (Math.sign(fused.score) === dir) return null;

  // THE FACTORS THIS MARKET HAS, not the four in the abstract. "3 of 4 factors
  // disagree" on a market with no weather counts a factor nobody read.
  const keys = fused.factors || Object.keys(BASE_WEIGHTS);
  const opposing = keys.filter((k) => fused.components[k].dir === -dir && fused.components[k].dir !== 0);
  const supporting = keys.filter((k) => fused.components[k].dir === dir);
  return {
    dir,
    n: opposing.length,
    total: keys.length,
    opposing: opposing.map((k) => ({ key: k, label: LABEL[k], strength: fused.components[k].strength, why: fused.components[k].why })),
    supporting: supporting.map((k) => LABEL[k]),
    score: fused.score,
    confidence: fused.confidence,
    agreement: fused.agreement,
    question: `You are going against ${opposing.length} of ${keys.length} factors. Why?`,
    detail: `${fused.ticker} scores ${scoreTxt(fused.score)} out of 100 at ${fused.confidence}/100 confidence, which points ${dirWord(Math.sign(fused.score))}, and this structure needs ${dirWord(dir)}`
      + (opposing.length ? `. Against you: ${opposing.map((k) => `${LABEL[k]} (${fused.components[k].strength}/100)`).join(", ")}` : "")
      + (supporting.length ? `. With you: ${supporting.map((k) => LABEL[k]).join(", ")}` : ". Nothing reads your way"),
  };
}


/* The guided door's three drivers (DRIVERS, DRIVER_PRESETS, presetOf,
   normaliseWeights, rankByDrivers) and its narrative (verdictNarrative) were
   deleted with the door itself in PR #40, TASK 1: Find ranks every candidate
   by `compareCandidates()` above, and says why a list is short in counts. */
