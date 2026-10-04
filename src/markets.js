// ============================================================================
// src/markets.js — ONE ROW PER MARKET (PR #48, TASK 1).
//
// MEASURED BEFORE THIS FILE: a market's facts lived in five places — `UNDERLYINGS` in App.jsx (name, step, iv,
// sigma, news query, the commodity flag), `src/basket.js` (the same ten again, for the Netlify functions),
// signals.js (`WEATHER_NA`, and which markets the weather regions drive), engine.js (`SEASONAL`, `SIGMA`) and ticker
// lists in demo.js and pro.jsx. Adding a market meant editing five files and hoping a sync test caught the sixth.
//
// NOW: ADDING A MARKET IS ONE ROW BELOW. Everything else derives from `MARKETS`:
//   BASKET (what Find reads) · getU() (the fallback stats every screen reads) · the categories Find groups by ·
//   whether the weather factor applies and why not (`factorsOf()` in signals.js) · the list the Netlify functions
//   measure (`basket.js` re-exports `BASKET`) · the demo's seed list · the copilot's market list in pro.jsx.
// `markets.test.js` adds a dummy row through `buildRegistry()` and checks that every one of those derives it, and
// that the dummy never reaches the exported registry, so it can never reach the UI.
//
// PLAIN JS, NO REACT: the Netlify functions import it. It imports `SIGMA` (engine.js, the volatility fallback, out of
// scope here and unchanged) and `RULES` (the named implied-volatility fallback), and nothing imports it back from
// those two files, so there is no cycle.
//
// WHAT A ROW DOES NOT CARRY: a seasonal table. Since PR #48 the season is MEASURED ONLY (Alpha Vantage monthly
// history through /api/av) — see `seasonalSignal()` in rules.js — so there is nothing hand-written to put here.
// ============================================================================
import { SIGMA } from "./engine.js";
import { RULES } from "./rules.js";

/** The calendars a row's `events` key may name (src/events.js holds their dates; events.test.js holds the two equal). */
export const EVENT_CALENDARS = Object.freeze(["grains", "natgas", "petroleum", "fomc"]);

/** Find's groups, in the order they are drawn. A market with no category (SPY) is never offered. */
export const CATEGORIES = Object.freeze(["Grains", "Energy", "Metals"]);

/* WHY WEATHER DOES NOT APPLY — sentences, not thresholds. They used to be `WEATHER_NA` in signals.js. */
const NO_WEATHER = {
  GLD: "Weather does not apply to gold: an ounce is not grown, not stored in degree-days and not consumed by a cold winter. What moves it — real yields, the dollar, central-bank buying — reaches this app through the news factor.",
  SLV: "Weather does not apply to silver. Its industrial half moves with manufacturing demand and its monetary half with real yields, and neither is a forecast; both reach this app through the news factor.",
  GDX: "Weather does not apply to gold miners. They are equities whose earnings track the gold price, so the same reasoning as GLD holds one step removed.",
  USO: "Weather is not read for crude here. A Gulf hurricane really can shut production in, but this app's regions are crop stress and heating or cooling demand, and neither of those is what moves a barrel — storm supply risk reaches crude through the news rules instead.",
  XLE: "Weather is not read for energy equities here, for the same reason as crude: this app's regions measure crop stress and degree-days, and an integrated oil company's earnings are not a function of either.",
  SPY: "Weather is not read for the S&P 500: no region in this app's table drives it.",
};

/* ---- THE ROWS ----
   ticker, name, category, step (a listing increment for a dropdown before the chain lands — never a strike a trade
   is built on: strikes are the board's, `expiryStrikes()`), proposable (false: priced as a hedge, never offered),
   weather (does the factor apply, and the sentence when it does not), newsQ (the news query), iv (the implied
   volatility used before a chain quotes one: a reference, `RULES.fallbackIV` for every market nobody measured) and
   sigma (the realised-volatility fallback from `SIGMA`, or null: `sigmaProvenance()` then says the fallback was chosen)
   and events (redesign PR 1: which calendar in src/events.js the market reads — "grains", "natgas", "petroleum",
   "fomc" — or null for none).
   NOT ONE NUMBER IS INVENTED FOR THE LIQUID TIER (ROADMAP P2-bis): no sigma, and the named iv fallback. */
export const MARKET_ROWS = Object.freeze([
  { ticker: "CORN", name: "Corn", category: "Grains", step: 0.5, proposable: true,
    weather: { applies: true }, newsQ: "corn futures USDA crop", iv: 0.24, sigma: SIGMA.CORN, events: "grains" },
  { ticker: "SOYB", name: "Soybeans", category: "Grains", step: 0.5, proposable: true,
    weather: { applies: true }, newsQ: "soybean futures prices", iv: 0.20, sigma: SIGMA.SOYB, events: "grains" },
  { ticker: "WEAT", name: "Wheat", category: "Grains", step: 0.25, proposable: true,
    weather: { applies: true }, newsQ: "wheat futures prices", iv: 0.26, sigma: SIGMA.WEAT, events: "grains" },
  { ticker: "UNG", name: "US Natural Gas", category: "Energy", step: 0.5, proposable: true,
    weather: { applies: true }, newsQ: "natural gas prices storage EIA", iv: 0.45, sigma: SIGMA.UNG, events: "natgas" },
  { ticker: "BOIL", name: "2x Natural Gas", category: "Energy", step: 1, proposable: true,
    weather: { applies: true }, newsQ: "natural gas prices forecast", iv: 0.85, sigma: SIGMA.BOIL, events: "natgas" },
  { ticker: "USO", name: "Crude Oil", category: "Energy", step: 1, proposable: true,
    weather: { applies: false, reason: NO_WEATHER.USO }, newsQ: "crude oil price OPEC EIA inventories", iv: RULES.fallbackIV, sigma: null, events: "petroleum" },
  { ticker: "XLE", name: "Energy Sector", category: "Energy", step: 1, proposable: true,
    weather: { applies: false, reason: NO_WEATHER.XLE }, newsQ: "energy sector oil majors outlook", iv: RULES.fallbackIV, sigma: null, events: "petroleum" },
  { ticker: "GLD", name: "Gold", category: "Metals", step: 1, proposable: true,
    weather: { applies: false, reason: NO_WEATHER.GLD }, newsQ: "gold price fed real yields dollar", iv: RULES.fallbackIV, sigma: null, events: "fomc" },
  { ticker: "SLV", name: "Silver", category: "Metals", step: 0.5, proposable: true,
    weather: { applies: false, reason: NO_WEATHER.SLV }, newsQ: "silver price industrial demand dollar", iv: RULES.fallbackIV, sigma: null, events: "fomc" },
  { ticker: "GDX", name: "Gold Miners", category: "Metals", step: 1, proposable: true,
    weather: { applies: false, reason: NO_WEATHER.GDX }, newsQ: "gold miners production costs outlook", iv: RULES.fallbackIV, sigma: null, events: "fomc" },
  // SPY: priced as a hedge on the desk, never proposed, in no category.
  { ticker: "SPY", name: "S&P 500 ETF", category: null, step: 5, proposable: false,
    weather: { applies: false, reason: NO_WEATHER.SPY }, newsQ: "S&P 500 stock market outlook", iv: 0.13, sigma: SIGMA.SPY, events: null },
]);

const finite = (x) => typeof x === "number" && Number.isFinite(x);

/** A row the registry can use, or a thrown sentence naming what is missing. */
export function checkRow(r) {
  const where = r && r.ticker ? r.ticker : "a row";
  if (!r || typeof r.ticker !== "string" || !/^[A-Z]{1,6}$/.test(r.ticker)) throw new Error(`${where}: a ticker is 1-6 capital letters`);
  if (typeof r.name !== "string" || !r.name) throw new Error(`${where}: no name`);
  if (r.category !== null && !CATEGORIES.includes(r.category)) throw new Error(`${where}: category must be one of ${CATEGORIES.join(", ")} or null`);
  if (!(finite(r.step) && r.step > 0)) throw new Error(`${where}: step must be a positive number`);
  if (typeof r.proposable !== "boolean") throw new Error(`${where}: proposable must be true or false`);
  if (r.proposable && r.category === null) throw new Error(`${where}: a proposable market needs a category`);
  if (!r.weather || typeof r.weather.applies !== "boolean") throw new Error(`${where}: weather.applies must be true or false`);
  if (!r.weather.applies && !(typeof r.weather.reason === "string" && r.weather.reason)) throw new Error(`${where}: say why weather does not apply`);
  if (typeof r.newsQ !== "string" || !r.newsQ) throw new Error(`${where}: no news query`);
  if (!(finite(r.iv) && r.iv > 0)) throw new Error(`${where}: iv must be a positive number (RULES.fallbackIV when nobody measured one)`);
  if (r.sigma !== null && !(finite(r.sigma) && r.sigma > 0)) throw new Error(`${where}: sigma is a positive number or null`);
  if (r.events != null && !EVENT_CALENDARS.includes(r.events)) throw new Error(`${where}: events is one of ${EVENT_CALENDARS.join(", ")} or null`);
  return r;
}

/**
 * EVERYTHING THE APP DERIVES FROM THE ROWS, IN ONE FUNCTION — so a test can hand it a dummy row and see every
 * derivation pick it up without the dummy ever entering the exported registry.
 */
export function buildRegistry(rows) {
  const list = rows.map(checkRow);
  const seen = new Set();
  for (const r of list) { if (seen.has(r.ticker)) throw new Error(`${r.ticker} is listed twice`); seen.add(r.ticker); }
  const byTicker = Object.freeze(Object.fromEntries(list.map((r) => [r.ticker, Object.freeze({ ...r })])));
  const basket = Object.freeze(list.filter((r) => r.proposable).map((r) => r.ticker));
  const categories = Object.freeze(CATEGORIES.map((c) => Object.freeze({ id: c, tickers: Object.freeze(basket.filter((tk) => byTicker[tk].category === c)) }))
    .filter((c) => c.tickers.length));
  /** The stats a screen reads for any ticker — a fallback for one the registry does not know (an Alpaca import). */
  const getU = (tk) => {
    const r = byTicker[tk];
    if (r) return { ...r, fallback: false };
    return { ticker: tk || "?", name: tk || "?", category: null, step: 0.5, proposable: false,
      weather: { applies: false, reason: null }, newsQ: `${tk || "?"} price outlook`, iv: 0.30, sigma: 0.30, events: null, fallback: true };
  };
  return {
    rows: Object.freeze(list), byTicker, basket, categories, getU,
    tickers: Object.freeze(list.map((r) => r.ticker)),
    categoryOf: (tk) => (byTicker[tk] ? byTicker[tk].category : null),
    weatherApplies: (tk) => !!(byTicker[tk] && byTicker[tk].weather.applies),
    weatherReason: (tk) => (byTicker[tk] && !byTicker[tk].weather.applies ? byTicker[tk].weather.reason : null),
  };
}

export const MARKETS = buildRegistry(MARKET_ROWS);

/** The markets Find reads: every proposable row, in category order. SPY is not in it. */
export const BASKET = MARKETS.basket;
/** Every ticker the registry knows (BASKET plus SPY). */
export const TICKERS = MARKETS.tickers;
export const getU = MARKETS.getU;
export const categoryOf = MARKETS.categoryOf;
export const weatherAppliesTo = MARKETS.weatherApplies;
export const weatherReasonFor = MARKETS.weatherReason;
/** `[{ id: "Grains", tickers: [...] }, ...]` — Find's groups, only the categories that hold a market. */
export const MARKET_CATEGORIES = MARKETS.categories;

/**
 * Counts per category for a list of tickers (Find's results filter): `[{ id, n, tickers: [{ tk, n }] }]`.
 * @param items  anything with a `tk`
 * @param markets  the tickers on screen, so a selected market with nothing is a 0 rather than absent
 */
export function categoryCounts(items = [], markets = BASKET) {
  const per = new Map();
  for (const x of items) if (x && x.tk) per.set(x.tk, (per.get(x.tk) || 0) + 1);
  return MARKET_CATEGORIES.map((c) => {
    const tks = c.tickers.filter((tk) => markets.includes(tk)).map((tk) => ({ tk, n: per.get(tk) || 0 }));
    return { id: c.id, n: tks.reduce((a, t) => a + t.n, 0), tickers: tks };
  }).filter((c) => c.tickers.length);
}

/** "3 of 3" style count for one category against a selection. */
export const categorySelection = (cat, markets = []) => {
  const c = MARKET_CATEGORIES.find((x) => x.id === cat);
  const on = c ? c.tickers.filter((tk) => markets.includes(tk)).length : 0;
  return { on, of: c ? c.tickers.length : 0 };
};
