// ============================================================================
// src/crossing.test.jsx — ROADMAP PR #39: NO PROPOSAL WHEN CROSSING COSTS TOO
// MUCH.
//
// DONE WHEN: no card on Radar or Shortlist has a maximum profit smaller than
// the cost of getting in and out. Held here on every fixture candidate, which
// `scripts/crossing-fixtures.jsx` builds through `shortlistWithFloors()` — the
// real generation site — plus the owner's own hand-read pairs.
//
// Bundled to CJS by scripts/test-jsx.mjs: files are read by repo-relative path.
// ============================================================================
import { readFileSync } from "node:fs";
import { fixtureCandidates, measured, removedAt } from "../scripts/crossing-fixtures.jsx";
import { RULES, crossingFloor, crossingFloorReason, crossingNote, qualityFloor, filterFold,
  liquiditySettingNote, emptyExpiryNote, NOTHING_TODAY, qualityFloorLine, comboSpreadSkippedNote } from "./rules.js";
import { verdictNarrative } from "./signals.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, sub) => { if (!String(s).includes(sub)) throw new Error(`missing ${JSON.stringify(sub)} in ${JSON.stringify(String(s).slice(0, 240))}`); };
const truthy = (x, what) => { if (!x) throw new Error(what); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} is not within ${tol} of ${b}`); };

const XLE_LEGS = [{ side: -1, qty: 1, type: "put", strike: 60 }, { side: 1, qty: 1, type: "put", strike: 57 }];
const XLE_QUOTES = [{ bid: 1.22, ask: 1.27 }, { bid: 0.49, ask: 0.53 }];

const ALL = fixtureCandidates();

/* ---------------- 1. the done-when condition ---------------- */

check("DONE WHEN: no shown fixture card has a maximum profit smaller than its crossing cost", () => {
  const shown = ALL.filter((c) => c.shown);
  truthy(shown.length >= 20, `the fixtures show enough cards to mean something (${shown.length})`);
  for (const c of shown) {
    const r = c.qf.crossing;
    if (!r.checked) {
      // The only unmeasured cards allowed on screen are the ones with no
      // ceiling — a crossing cost against an unbounded profit is no share.
      eq(r.skipped, "unbounded", `${c.fixture} ${c.name} was not measured`);
      continue;
    }
    truthy(r.maxProfit >= r.cost, `${c.fixture} ${c.name}: max profit $${r.maxProfit} under crossing $${r.cost}`);
  }
});

check("DONE WHEN: and none of them spends more than the share on crossing", () => {
  for (const c of measured(ALL).filter((x) => x.shown)) {
    const r = c.qf.crossing;
    truthy(r.cost / r.maxProfit <= RULES.maxCrossingShareOfMaxProfit + 1e-12,
      `${c.fixture} ${c.name}: ${(r.cost / r.maxProfit).toFixed(3)} over ${RULES.maxCrossingShareOfMaxProfit}`);
  }
});

check("THE FLOOR BITES on the fixtures, and what it removes is counted as crossing", () => {
  const removed = ALL.filter((c) => c.why === "crossing");
  truthy(removed.length > 0, "at least one fixture candidate is removed by this floor alone");
  for (const c of removed) {
    truthy(!c.shown, "a removed candidate is not shown");
    truthy(c.qf.crossing.cost > RULES.maxCrossingShareOfMaxProfit * c.qf.crossing.maxProfit, "and it really is over");
  }
  // The tally is the count of the cut entries, and it is its own count.
  const r = removedAt(ALL, RULES.maxCrossingShareOfMaxProfit);
  truthy(r.removedAlone <= r.removed, "a floor alone never removes more than the floor");
});

check("XLE 60/57 put credit: $9 of crossing against $71 of maximum profit (the $0.71 credit on the cent), and it passes", () => {
  const xle = ALL.find((c) => c.fixture.startsWith("XLE"));
  truthy(xle, "the owner's XLE reading is a fixture");
  near(xle.qf.crossing.cost, 9, 1e-9, "crossing cost");
  near(xle.qf.crossing.maxProfit, 71, 0.01, "maximum profit at the price that fills, on the cent the ticket sends (PR #40)");
  eq(xle.qf.crossing.pass, true, "0.126 of it clears 0.5");
  eq(xle.shown, true, "and it is offered");
});

/* ---------------- 2. the function ---------------- */

check("crossingFloor(): the cost is the combination spread × 100 × contracts", () => {
  const r = crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: 71.25 });
  near(r.cost, 9, 1e-9, "one combination");
  eq(r.checked, true, "checked");
  const r3 = crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: 213.75, contracts: 3 });
  near(r3.cost, 27, 1e-9, "three combinations");
  near(r3.share, r.share, 1e-12, "and the share does not move with size");
});

check("crossingFloor(): at the share passes, past it fails", () => {
  eq(crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: 18 }).pass, true, "9 against 18 is 0.5");
  eq(crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: 17.99 }).pass, false, "just past it");
  eq(crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: 0 }).pass, false,
    "a best case of nothing cannot pay for any crossing");
});

check("crossingFloor(): no book, no ceiling, no profit — each SKIPPED by name, never passed or failed silently", () => {
  const noBook = crossingFloor({ legs: XLE_LEGS, quotes: [{ bid: 1.22, ask: 1.27 }, {}], maxProfitAtFill: 71 });
  eq(noBook.checked, false, "no two-sided book: not checked"); eq(noBook.skipped, "no-book", "and says why");
  const unb = crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: null, unboundedProfit: true });
  eq(unb.skipped, "unbounded", "no ceiling");
  const none = crossingFloor({ legs: XLE_LEGS, quotes: XLE_QUOTES, maxProfitAtFill: null });
  eq(none.skipped, "no-profit", "`Number(null)` is 0 — a missing profit is not a profit of zero");
});

check("qualityFloor(): the crossing verdict travels with the others and fails the candidate", () => {
  const qf = qualityFloor({ openInterest: [500, 500], quotes: XLE_QUOTES, legs: XLE_LEGS,
    maxProfit: 73.5, maxLoss: -226.5, maxProfitAtFill: 12 });
  eq(qf.crossing.checked, true, "measured");
  eq(qf.crossing.pass, false, "9 against 12 is 0.75");
  eq(qf.pass, false, "and the candidate does not pass");
  has(qf.reasons.join(" "), "at the price that fills");
  has(crossingFloorReason(qf.crossing), "costs $9, against a maximum profit of $12");
});

/* ---------------- 3. its own count and its own sentence, everywhere ---------------- */

check("every 'not shown' summary names the crossing count on its own", () => {
  const fold = filterFold({ comboSpread: 1, crossing: 2, reward: 1 }, { what: "UNG" });
  has(fold.summary, "2 crossing costs over 50% of max profit");
  eq(fold.reasons.find((r) => r.id === "crossing").count, 2, "its own row");
  has(liquiditySettingNote("recommended", { kept: 3, crossing: 2 }), "2 removed for a crossing cost over 50% of max profit");
  has(emptyExpiryNote("2026-10-16", { crossing: 2 }), "2 for a crossing cost over 50% of max profit");
  has(NOTHING_TODAY.belowQualityFloor({ crossing: 2, markets: ["UNG"] }), "2 because crossing its market in and out");
  has(NOTHING_TODAY.belowQualityFloor({ crossing: 2, markets: ["UNG"] }), "filtered out by the quality floors");
  has(crossingNote(2, "UNG"), "more than 50% of the most each can make on UNG");
  has(qualityFloorLine("recommended"), "crossing cost");
  has(comboSpreadSkippedNote("Alpaca"), "crossing-cost");
});

check("the guided flow's refusal counts it too", () => {
  const paras = verdictNarrative({ basket: ["UNG"], examined: [], floors: { crossing: 3, markets: ["UNG"] } });
  has(paras.join(" "), "3 structures would have spent more than 50%");
  has(paras.join(" "), "3 candidates on UNG were");
});

/* ---------------- 4. a quality floor, never the gate ---------------- */

check("IT IS NOT IN THE GATE: riskGate.js never reads the crossing share", () => {
  const gate = readFileSync("src/riskGate.js", "utf8");
  truthy(!/maxCrossingShareOfMaxProfit|crossingFloor/.test(gate), "the gate must not refuse a send on this floor");
});

check("THE ONE HOME: the share is read from RULES at every generation site, never copied", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  eq((app.match(/maxProfitAtFill: aFill \? aFill\.maxProfit : null/g) || []).length, 3,
    "Shortlist, multi-market search and the guided flow all hand qualityFloor() the fill-price profit");
  truthy(!/maxCrossingShareOfMaxProfit/.test(app), "App.jsx reads the floor through qualityFloor(), not the number");
});

for (const [name, why] of bad) console.error(`  FAIL ${name}\n       ${why}`);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
