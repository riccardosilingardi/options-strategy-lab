// ============================================================================
// src/markets.test.js — THE MARKET REGISTRY (PR #48, TASK 1).
//
// "Adding a market = one registry row." This holds that promise: a DUMMY row handed to `buildRegistry()` shows up in
// every derivation (basket, getU, its category, the weather rule, the category counts), and the exported registry
// never contains it — so it cannot reach the UI. Then it checks that no other file keeps its own copy of a market
// list or a market's facts.
// ============================================================================
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKET_ROWS, MARKETS, BASKET, TICKERS, getU, CATEGORIES, MARKET_CATEGORIES, buildRegistry, checkRow, CATEGORY_ICONS,
  categoryCounts, categorySelection, categoryOf } from "./markets.js";
import { BASKET as BASKET_FN } from "./basket.js";
import { factorsOf, weatherApplies } from "./signals.js";
import { DEMO_SEED_TICKERS } from "./demo.js";

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); pass++; console.log(`  ok   ${name}`); }
  catch (e) { fail++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};

test("THE CATEGORIES ARE THE OWNER'S: Grains (CORN, SOYB, WEAT), Energy (UNG, BOIL, USO, XLE), Metals (GLD, SLV, GDX)", () => {
  assert.deepEqual([...CATEGORIES], ["Grains", "Energy", "Metals"]);
  assert.deepEqual(MARKET_CATEGORIES.map((c) => [c.id, [...c.tickers]]), [
    ["Grains", ["CORN", "SOYB", "WEAT"]], ["Energy", ["UNG", "BOIL", "USO", "XLE"]], ["Metals", ["GLD", "SLV", "GDX"]]]);
  assert.deepEqual([...BASKET], ["CORN", "SOYB", "WEAT", "UNG", "BOIL", "USO", "XLE", "GLD", "SLV", "GDX"]);
});

test("SPY IS A HEDGE: known to getU, never proposed, in no category", () => {
  assert.ok(TICKERS.includes("SPY"));
  assert.ok(!BASKET.includes("SPY"));
  assert.equal(categoryOf("SPY"), null);
  assert.equal(getU("SPY").proposable, false);
});

test("basket.js IS the registry's basket (the Netlify functions read it)", () => {
  assert.equal(BASKET_FN, BASKET);
});

test("getU(): a registry row, or a fallback for a ticker nobody listed — never undefined", () => {
  assert.equal(getU("CORN").name, "Corn");
  assert.equal(getU("CORN").fallback, false);
  const x = getU("ZZZ");
  assert.equal(x.fallback, true); assert.equal(x.name, "ZZZ"); assert.ok(x.iv > 0 && x.step > 0);
  assert.equal(getU(undefined).name, "?");
});

const DUMMY = { ticker: "DUMY", name: "Dummy market", category: "Metals", step: 0.5, proposable: true,
  weather: { applies: false, reason: "Weather does not apply to a dummy." }, newsQ: "dummy", iv: 0.3, sigma: null };

test("ADDING A MARKET = ONE ROW: a dummy row reaches every derivation…", () => {
  const R = buildRegistry([...MARKET_ROWS, DUMMY]);
  assert.ok(R.basket.includes("DUMY"), "Find's basket");
  assert.ok(R.tickers.includes("DUMY"));
  assert.equal(R.getU("DUMY").name, "Dummy market", "getU()");
  assert.equal(R.getU("DUMY").fallback, false);
  assert.equal(R.categoryOf("DUMY"), "Metals");
  assert.ok(R.categories.find((c) => c.id === "Metals").tickers.includes("DUMY"), "its group in Find");
  assert.equal(R.weatherApplies("DUMY"), false, "the weather rule");
  assert.equal(R.weatherReason("DUMY"), DUMMY.weather.reason);
});

test("…and never reaches the exported registry, so never the UI", () => {
  assert.ok(!TICKERS.includes("DUMY")); assert.ok(!BASKET.includes("DUMY"));
  assert.equal(getU("DUMY").fallback, true);
  assert.ok(!MARKET_CATEGORIES.some((c) => c.tickers.includes("DUMY")));
  assert.ok(!factorsOf("DUMY").keys.includes("weather"));
});

test("A ROW THAT CANNOT BE USED IS REFUSED WITH A SENTENCE", () => {
  assert.throws(() => checkRow({ ...DUMMY, category: "Softs" }), /category must be one of/);
  assert.throws(() => checkRow({ ...DUMMY, weather: { applies: false } }), /say why weather does not apply/);
  assert.throws(() => checkRow({ ...DUMMY, iv: null }), /iv must be a positive number/);
  assert.throws(() => checkRow({ ...DUMMY, category: null }), /a proposable market needs a category/);
  assert.throws(() => buildRegistry([...MARKET_ROWS, { ...DUMMY, ticker: "CORN" }]), /CORN is listed twice/);
  assert.doesNotThrow(() => checkRow(DUMMY));
});

test("THE WEATHER RULE IS THE REGISTRY'S, AND factorsOf() READS IT", () => {
  for (const r of MARKET_ROWS) {
    assert.equal(weatherApplies(r.ticker), r.weather.applies, r.ticker);
    assert.equal(factorsOf(r.ticker).keys.includes("weather"), r.weather.applies, r.ticker);
    if (!r.weather.applies) assert.equal(factorsOf(r.ticker).note, r.weather.reason);
  }
});

test("CATEGORY COUNTS: All N · Grains n · Energy n · Metals n, a selected market with nothing is 0", () => {
  const items = [{ tk: "CORN" }, { tk: "CORN" }, { tk: "UNG" }, { tk: "GLD" }];
  const c = categoryCounts(items, BASKET);
  assert.deepEqual(c.map((x) => [x.id, x.n]), [["Grains", 2], ["Energy", 1], ["Metals", 1]]);
  assert.deepEqual(c[0].tickers, [{ tk: "CORN", n: 2 }, { tk: "SOYB", n: 0 }, { tk: "WEAT", n: 0 }]);
  // A category with none of its markets selected is not drawn.
  assert.deepEqual(categoryCounts(items, ["CORN", "UNG"]).map((x) => x.id), ["Grains", "Energy"]);
  assert.deepEqual(categorySelection("Energy", ["UNG", "XLE", "CORN"]), { on: 2, of: 4 });
});

test("NO OTHER FILE KEEPS A COPY OF THE MARKETS", () => {
  const read = (f) => readFileSync(f, "utf8");
  const app = read("src/App.jsx");
  assert.ok(!/const UNDERLYINGS\s*=/.test(app), "App.jsx's table is gone");
  assert.ok(/from "\.\/markets\.js"/.test(app));
  assert.ok(!/export const BASKET\s*=\s*\[/.test(read("src/basket.js")), "basket.js re-exports, it does not type");
  assert.ok(!/const WEATHER_NA\s*=/.test(read("src/signals.js")), "the weather sentences live on the rows");
  assert.ok(!/DEMO_SEED_TICKERS\s*=\s*\[/.test(read("src/demo.js")), "the demo's seed list is derived");
  assert.ok(!/SOYB, CORN, UNG, BOIL, WEAT/.test(read("src/pro.jsx")), "the copilot's list is the registry's");
  for (const tk of DEMO_SEED_TICKERS) assert.ok(BASKET.includes(tk), `demo market ${tk} is a registry market`);
  assert.equal(MARKETS.rows.length, MARKET_ROWS.length);
});

test("ROUND 2: EVERY CATEGORY HAS ITS ICON (a lucide-react name, so this file stays plain JS), and market.jsx maps every one", () => {
  assert.deepEqual(Object.keys(CATEGORY_ICONS).sort(), [...CATEGORIES].sort());
  const mk = readFileSync("src/market.jsx", "utf8");
  for (const name of Object.values(CATEGORY_ICONS)) assert.match(mk, new RegExp(`\\b${name}\\b`), `${name} is not mapped in market.jsx`);
  assert.doesNotMatch(readFileSync("src/markets.js", "utf8"), /from "lucide-react"/);
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
