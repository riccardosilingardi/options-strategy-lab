// src/listing.test.js — PR 76, task 76.4 (owner, 20 Oct 2026): every market the way IBKR lists it, read from Alpaca.
//
// Plain JS: Alpaca's asset reply read into "SLV · ARCA" and its official name in capitals; a failed call, a reply for
// another symbol or one with no exchange or name gives the ticker alone; the exchange words in one table; a day's cache
// on the device that asks again only what is older than a day. The fixture reply is alpaca-py's `Asset` shape
// (alpaca/trading/models.py, 0.44.0) with the values a test needs — it is not a live reply (the sandbox's Alpaca
// credential is refused, PRD §4).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listingOf, readListings, writeListings, listingFresh, listingsToAsk, fetchListings, LISTING_KEY, LISTING_TTL_MS } from "./listing.js";
import { EXCHANGE_WORDS, listingLine, listingName, listingSearchInfo } from "./rules.js";
import { BASKET } from "./markets.js";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

/** alpaca-py `Asset`, as `GET /v2/assets/SLV` returns it (the fields this app reads, and a few it does not). */
const SLV = { id: "00000000-0000-4000-8000-000000000000", class: "us_equity", exchange: "ARCA", symbol: "SLV", name: "iShares Silver Trust",
  status: "active", tradable: true, marginable: true, shortable: true, easy_to_borrow: true, fractionable: true };
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };

test("A FIXTURE ASSET reads as IBKR lists it: 'SLV · ARCA' and 'ISHARES SILVER TRUST'", () => {
  const l = listingOf("SLV", SLV);
  assert.deepEqual(l, { exchange: "ARCA", name: "ISHARES SILVER TRUST" });
  assert.equal(listingLine("SLV", l), "SLV · ARCA");
  assert.equal(listingName(l), "ISHARES SILVER TRUST");
});
test("A FAILED CALL gives the ticker alone, and so does any reply that is not this market's listing", () => {
  assert.equal(listingLine("SLV", null), "SLV"); assert.equal(listingName(null), null);
  for (const bad of [null, {}, { message: "unauthorized." }, { ...SLV, symbol: "GLD" }, { ...SLV, exchange: "" }, { ...SLV, name: "" },
    { ...SLV, name: null }, "SLV"]) {
    assert.equal(listingOf("SLV", bad), null, JSON.stringify(bad));
  }
});
test("THE EXCHANGE WORDS: Alpaca's codes in IBKR's words in one table; NYSEARCA is ARCA; a code not in it is shown as read", () => {
  assert.deepEqual(Object.keys(EXCHANGE_WORDS).sort(), ["AMEX", "ARCA", "BATS", "NASDAQ", "NYSE", "NYSEARCA"]);
  for (const [code, word] of [["ARCA", "ARCA"], ["NYSE", "NYSE"], ["NASDAQ", "NASDAQ"], ["BATS", "BATS"], ["AMEX", "AMEX"], ["NYSEARCA", "ARCA"]]) {
    assert.equal(listingOf("X", { symbol: "X", exchange: code, name: "x" }).exchange, word);
  }
  assert.equal(listingOf("X", { symbol: "X", exchange: "otc", name: "x" }).exchange, "OTC");
});
test("A DAY ON THE DEVICE: kept, read back, asked again only past a day; an unreadable store is none", async () => {
  const st = memory(), now = Date.parse("2026-10-20T10:00:00Z");
  assert.deepEqual(readListings(st), {});
  writeListings(st, { SLV: { exchange: "ARCA", name: "ISHARES SILVER TRUST", at: now } });
  assert.equal(readListings(st).SLV.exchange, "ARCA");
  assert.equal(listingFresh(readListings(st).SLV, now + LISTING_TTL_MS - 1), true);
  assert.equal(listingFresh(readListings(st).SLV, now + LISTING_TTL_MS), false, "a day old is asked again");
  assert.deepEqual(listingsToAsk(readListings(st), ["SLV", "GLD"], now + 1000), ["GLD"]);
  st.setItem(LISTING_KEY, "not json");
  assert.deepEqual(readListings(st), {});
  assert.deepEqual(readListings(null), {});
  writeListings({ setItem: () => { throw new Error("full"); } }, {});   // a full store keeps nothing and does not throw
});
test("ONE READ-ONLY GET PER MARKET, through the proxy's path; a market whose call fails is left out (its ticker alone)", async () => {
  const asked = [];
  const get = async (path) => {
    asked.push(path);
    if (path.endsWith("/SLV")) return SLV;
    if (path.endsWith("/GLD")) throw new Error("Alpaca 401: unauthorized.");
    return { message: "asset not found" };
  };
  const got = await fetchListings(["SLV", "GLD", "CORN"], get, 123);
  assert.deepEqual(asked.sort(), ["/v2/assets/CORN", "/v2/assets/GLD", "/v2/assets/SLV"]);
  assert.deepEqual(got, { SLV: { exchange: "ARCA", name: "ISHARES SILVER TRUST", at: 123 } });
  assert.equal(listingLine("GLD", got.GLD), "GLD");
});
test("THE ⓘ in the market sheets: search the symbol, not the word (the registry's word for the market)", () => {
  assert.equal(listingSearchInfo("SLV", "Silver"), "In IBKR, search the symbol (SLV), not the word: searching 'silver' lists other countries' funds first.");
});
test("NO NAME IS TYPED: the registry carries no exchange or official name, and the app loads the listing for the whole basket", () => {
  const reg = readFileSync("src/markets.js", "utf8");
  assert.ok(!/ISHARES|SPDR|VANECK|TEUCRIUM|exchange\s*:/i.test(reg), "markets.js names no listing");
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("listingsToAsk(listings, BASKET,") && app.includes("fetchListings("), "App.jsx asks for the basket's listings");
  assert.ok(BASKET.length >= 10);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\nlisting: ${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
