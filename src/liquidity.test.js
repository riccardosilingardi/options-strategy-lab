// Tests for the liquidity measurement endpoint's pure half
// (netlify/functions/liquidity.mjs) and for the basket it measures.
//
// The handler itself needs broker keys and a network; these two functions are
// the part that decides what the report SAYS, and they are plain data in, plain
// data out.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { distribution, summarise } from "../netlify/functions/liquidity.mjs";
import { BASKET } from "./basket.js";
import { MARKET_ROWS } from "./markets.js";
import { RULES } from "./rules.js";

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}`); console.log(e); fail++; }
};

console.log("\nnetlify/functions/liquidity.mjs — the measurement, and what it may say\n");

/* ---- the distribution ---- */

test("the quartiles come back, and from the same quantile the app applies", () => {
  const d = distribution([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100]);
  assert.equal(d.n, 12);
  assert.equal(d.min, 0);
  assert.equal(d.max, 100);
  assert.ok(d.q1 <= d.median && d.median <= d.q3 && d.q3 <= d.p90, "the quartiles are ordered");
  assert.equal(typeof d.atFloorPercentile, "number");
  assert.equal(d.clearingAbsolute, [0,1,2,3,4,5,6,7,8,9,10,100].filter((x) => x >= RULES.minOpenInterestAbsolute).length);
});

test("a set with nothing known is null, never a row of zeros", () => {
  assert.equal(distribution([]), null);
  assert.equal(distribution([null, undefined, ""]), null, "unknown is not zero, here as everywhere else");
});

/* ---- the summary ---- */

const contract = (exp, strike, oi, date = "2026-09-02") => ({
  symbol: `X${exp}${strike}`, expiration_date: exp, strike_price: String(strike),
  type: "call", open_interest: oi == null ? undefined : String(oi), open_interest_date: oi == null ? undefined : date,
});

test("a market is reduced to counts per expiry, and no contract survives", () => {
  const rows = [
    contract("2026-10-16", 13, 400), contract("2026-10-16", 14, 250), contract("2026-10-16", 20, 3),
    contract("2026-11-20", 13, 90), contract("2026-11-20", 25, 0),
  ];
  const r = summarise("UNG", 13.2, rows, 0.1);
  assert.equal(r.market, "UNG");
  assert.equal(r.contracts, 5);
  assert.equal(r.strikes, 4, "13, 14, 20 and 25");
  assert.equal(r.byExpiry.length, 2);
  assert.equal(r.byExpiry[0].expiry, "2026-10-16");
  assert.equal(r.byExpiry[0].contracts, 3);
  assert.equal(r.openInterestAsOf, "2026-09-02", "the broker's own date travels with the numbers");
  // Nothing contract-shaped may appear anywhere in the payload.
  const json = JSON.stringify(r);
  assert.ok(!json.includes("X2026-10-1613"), "no contract symbol");
  assert.ok(!/"strike_price"/.test(json) && !/"symbol"/.test(json), "no contract row");
});

test("near the money is a different population from the whole chain", () => {
  const rows = [
    contract("2026-10-16", 13, 400), contract("2026-10-16", 14, 250),   // within 10% of 13.2
    contract("2026-10-16", 20, 3), contract("2026-10-16", 25, 1),       // far out
  ];
  const r = summarise("UNG", 13.2, rows, 0.1);
  assert.equal(r.wholeChain.n, 4);
  assert.equal(r.nearTheMoney.n, 2, "only the two strikes a trade is built from");
  assert.ok(r.nearTheMoney.median > r.wholeChain.median, "the tail drags the whole-chain figure down");
});

test("an unreported count is counted as unknown, never as zero", () => {
  const rows = [contract("2026-10-16", 13, 400), contract("2026-10-16", 14, null)];
  const r = summarise("UNG", 13.2, rows, 0.1);
  assert.equal(r.contracts, 2);
  assert.equal(r.reportingOpenInterest, 1, "one of the two told us");
  assert.equal(r.wholeChain.n, 1, "and the distribution is over that one, not over a zero we invented");
});

test("no spot means no near-the-money split, and the rest still reads", () => {
  const r = summarise("UNG", 0, [contract("2026-10-16", 13, 400)], 0.1);
  assert.equal(r.spot, null);
  assert.equal(r.nearTheMoney, null, "an unmeasurable population is absent, not empty");
  assert.equal(r.wholeChain.n, 1);
});

/* ---- the basket, which must not drift ---- */

test("src/basket.js IS the registry's basket (PR #48): one home, no copy to drift", () => {
  assert.deepEqual([...BASKET], MARKET_ROWS.filter((r) => r.proposable).map((r) => r.ticker));
  for (const tk of ["GLD", "SLV", "USO", "XLE", "GDX"]) assert.ok(BASKET.includes(tk), `${tk} is in the basket`);
  assert.equal(BASKET.length, 10);
  assert.ok(!BASKET.includes("SPY"), "SPY is in the registry to price a hedge, not to be traded");
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(!app.includes("const UNDERLYINGS = {"), "App.jsx no longer carries its own market table");
});

test("NOT ONE SIGMA OR IV NUMBER IS INVENTED FOR THE LIQUID TIER", () => {
  // Failure classes 1 and 5: a value nobody measured must never print as one somebody did.
  const eng = readFileSync(new URL("./engine.js", import.meta.url), "utf8");
  const sigmaLine = eng.slice(eng.indexOf("export const SIGMA"), eng.indexOf("\n", eng.indexOf("export const SIGMA")));
  for (const tk of ["GLD", "SLV", "USO", "XLE", "GDX"]) {
    assert.ok(!sigmaLine.includes(`${tk}:`), `${tk} must have no hand-written SIGMA row`);
    const row = MARKET_ROWS.find((r) => r.ticker === tk);
    assert.equal(row.sigma, null, `${tk} carries no sigma`);
    // The implied volatility is the NAMED fallback with provenance, never a per-market guess.
    assert.equal(row.iv, RULES.fallbackIV, `${tk}'s IV must be RULES.fallbackIV`);
    assert.ok(!("monthlyMean" in row), `${tk} carries no seasonal row`);
  }
});

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
