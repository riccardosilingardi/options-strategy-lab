// Tests for the risk gate (src/riskGate.js) and the rule config (src/rules.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluateTrade, paperStatus, undefinedRiskLegs } from "./riskGate.js";
import { RULES, sizing, ruleBadge, qualityFloor, qualityFloorSentence, liquiditySkippedNote, NOTHING_TODAY,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityThreshold, looseningWarning, liquiditySettingNote,
  priceability, rewardRisk, unpriceableNote, money, MIN_NET_DOLLARS } from "./rules.js";

/* ---------------- tiny harness ---------------- */
let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}
const codes = (r) => r.violations.map((v) => v.code);
const warnCodes = (r) => r.warnings.map((w) => w.code);
const messageFor = (r, code) => (r.violations.find((v) => v.code === code) || {}).message || "";

/* ---------------- fixtures ----------------
   $5,000 of trading capital, 4 positions at a time.
     suggestedPerTrade = 5000 / 4 = $1,250
     bestPracticeCap   = 5% of 5000 = $250   <- the binding limit
     suggestedTotal    = 25% of 5000 = $1,250                          */
const CAPITAL = { tradingCapital: 5000, concurrentTarget: 4, savings: 40000 };

// A verified paper account. The serverless proxy hardcodes paper-api.alpaca.markets
// and echoes it back, which is what sets paperVerified.
const PAPER = { account_number: "PA3XYZ01", paperVerified: true, paperSource: "paper-api.alpaca.markets" };
const EMPTY_BOOK = { positions: [], account: PAPER };

// A CORN bull call spread, 45 DTE: buy the 22 call, sell the 24 call.
// Max loss $180 per combo — 3.6% of $5,000, inside the $250 limit.
const GOOD_TRADE = {
  ticker: "CORN", name: "Bull Call Spread", intent: "open", dte: 45, contracts: 1,
  legs: [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }],
  maxLoss: -180, maxProfit: 320,
};
const CONFLUENT = { agreement: "CONFLUENT", confidence: 78, score: 61, narrative: "Three factors agree." };

const trade = (over = {}) => ({ ...GOOD_TRADE, ...over });

/* ================================================================
   1. THE PASSING TRADE
================================================================ */
test("a defined-risk spread at 45 DTE, 3.6% of capital, on a verified paper account passes clean", () => {
  const r = evaluateTrade({ proposal: GOOD_TRADE, portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, true, `expected a pass, got: ${r.violations.map((v) => v.message).join(" | ")}`);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.limits.perTrade, 250, "the binding limit is the 5% cap, not capital/4");
  assert.equal(r.limits.tradeRisk, 180);
});

/* ================================================================
   2. ONE FAILING CASE PER HARD RULE
================================================================ */

/* -------- the per-trade limit: this is the one in the demo video --------
   Same $5,000 account. The user is shown a trade risking $340.
   $340 / $5,000 = 6.8%. The limit is 5% of $5,000 = $250.
   The gate must say all four of those numbers, in one sentence.          */
test("PER-TRADE LIMIT — a $340 max loss on $5,000 of capital is refused with the exact figures", () => {
  const r = evaluateTrade({
    proposal: trade({ maxLoss: -340 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });

  assert.equal(r.pass, false, "a trade at 6.8% of capital must not pass");
  assert.deepEqual(codes(r), ["PER_TRADE_LIMIT"], "and it must fail for that reason and no other");

  // The sentence a judge reads on screen:
  assert.equal(
    messageFor(r, "PER_TRADE_LIMIT"),
    "Max loss $340 = 6.8% of capital (your limit: 5%, i.e. $250).");
});

test("PER-TRADE LIMIT — the limit follows the derived model, not a hardcoded 5%", () => {
  // 10 positions at a time: 5000/10 = $500 suggested, which is UNDER the 5%
  // cap of $250? No — $500 > $250, so the cap still binds. Take 40 instead:
  // 5000/40 = $125, and the derived number is the tighter one.
  const tight = { tradingCapital: 5000, concurrentTarget: 40 };
  const r = evaluateTrade({ proposal: trade({ maxLoss: -180 }), portfolio: EMPTY_BOOK, capital: tight, signals: CONFLUENT });
  assert.equal(r.limits.perTrade, 125, "capital/concurrentTarget binds when it is below the 5% cap");
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["PER_TRADE_LIMIT"]);
  assert.match(messageFor(r, "PER_TRADE_LIMIT"), /your limit: 2\.5%, i\.e\. \$125/);
});

test("UNDEFINED RISK — a naked short call is refused, and the message says why it has no ceiling", () => {
  const r = evaluateTrade({
    proposal: trade({ legs: [{ side: -1, qty: 1, type: "call", strike: 24 }], maxLoss: -Infinity }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.ok(codes(r).includes("UNDEFINED_RISK"));
  assert.match(messageFor(r, "UNDEFINED_RISK"), /1 short call is not covered by a long call \(1 short vs 0 long\)/);
  assert.match(messageFor(r, "UNDEFINED_RISK"), /no ceiling/);
});

test("UNDEFINED RISK — a 1x2 call ratio is refused even though it has a long leg", () => {
  const r = evaluateTrade({
    proposal: trade({ legs: [
      { side: 1, qty: 1, type: "call", strike: 22 },
      { side: -1, qty: 2, type: "call", strike: 24 },
    ] }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.match(messageFor(r, "UNDEFINED_RISK"), /2 short vs 1 long/);
});

test("UNDEFINED RISK — a naked short put is refused too: large is not the same as defined", () => {
  const r = evaluateTrade({
    proposal: trade({ legs: [{ side: -1, qty: 1, type: "put", strike: 20 }], maxLoss: -2000 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.match(messageFor(r, "UNDEFINED_RISK"), /short put/);
});

test("TOTAL EXPOSURE — $1,150 already at risk plus a $180 trade breaks the 25% ceiling", () => {
  const r = evaluateTrade({
    proposal: GOOD_TRADE,
    portfolio: { positions: [{ maxLoss: -700 }, { maxLoss: -450 }], account: PAPER },
    capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["TOTAL_EXPOSURE"], "the trade itself is inside the per-trade limit");
  assert.equal(
    messageFor(r, "TOTAL_EXPOSURE"),
    "Total exposure would be $1,330 = 26.6% of capital ($1,150 already open + $180 for this trade). " +
    "Your limit: 25%, i.e. $1,250.");
});

test("ENTRY DTE — an entry at 12 DTE is refused: the 21 DTE exit would already have fired", () => {
  const r = evaluateTrade({ proposal: trade({ dte: 12 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["ENTRY_DTE"]);
  assert.match(messageFor(r, "ENTRY_DTE"), /12 DTE is below the 30 DTE minimum/);
  assert.match(messageFor(r, "ENTRY_DTE"), /exit rule fires at 21 DTE/);
  assert.match(messageFor(r, "ENTRY_DTE"), /no days at all/);
});

test("ENTRY DTE — 28 DTE is refused as well, and the message counts the days it would have", () => {
  const r = evaluateTrade({ proposal: trade({ dte: 28 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.match(messageFor(r, "ENTRY_DTE"), /only 7 days to work/);
});

test("PAPER MODE — an unverifiable account is refused, on an otherwise perfect trade", () => {
  const r = evaluateTrade({
    proposal: GOOD_TRADE,
    portfolio: { positions: [], account: null },   // the account call failed
    capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["PAPER_MODE"]);
  assert.match(messageFor(r, "PAPER_MODE"), /no account data/);
});

test("PAPER MODE — a live-looking account number is refused, not merely warned about", () => {
  const r = evaluateTrade({
    proposal: GOOD_TRADE,
    portfolio: { positions: [], account: { account_number: "926473501" } },
    capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["PAPER_MODE"]);
  assert.match(messageFor(r, "PAPER_MODE"), /926473501 does not identify a paper account/);
});

test("NO STRUCTURE — an empty proposal is refused rather than silently sized at zero", () => {
  const r = evaluateTrade({ proposal: trade({ legs: [], maxLoss: undefined }), portfolio: EMPTY_BOOK, capital: CAPITAL });
  assert.equal(r.pass, false);
  assert.ok(codes(r).includes("NO_STRUCTURE"));
  assert.ok(codes(r).includes("UNDEFINED_RISK"), "a missing max loss is also a block");
});

test("every violation message carries a number — no bare 'risk too high' anywhere", () => {
  const cases = [
    trade({ maxLoss: -340 }),
    trade({ dte: 12 }),
    trade({ legs: [{ side: -1, qty: 1, type: "call", strike: 24 }] }),
    trade({ legs: [] }),
  ];
  for (const proposal of cases) {
    const r = evaluateTrade({ proposal, portfolio: { positions: [{ maxLoss: -1200 }], account: null }, capital: CAPITAL });
    for (const v of r.violations) assert.match(v.message, /\d/, `no number in: ${v.message}`);
  }
});

/* ================================================================
   3. WARNINGS — shown, never blocking
================================================================ */
test("WARNING — CONFLICT and low confidence warn but let a sound trade through", () => {
  const r = evaluateTrade({
    proposal: GOOD_TRADE, portfolio: EMPTY_BOOK, capital: CAPITAL,
    signals: { agreement: "CONFLICT", confidence: 31, score: -4, narrative: "Seasonality says up, weather says down." },
  });
  assert.equal(r.pass, true, "a warning is not a block");
  assert.deepEqual(warnCodes(r), ["SIGNAL_CONFLICT", "LOW_CONFIDENCE"]);
  assert.match(r.warnings[0].message, /Seasonality says up, weather says down\./);
  assert.match(r.warnings[1].message, /31\/100, under the 40 mark/);
});

test("WARNING — the stop-loss threshold warns, it never closes and never blocks", () => {
  const r = evaluateTrade({
    proposal: trade({ pnl: -95 }),          // -95 is past 50% of a $180 max loss
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, true);
  assert.deepEqual(warnCodes(r), ["STOP_LOSS_REACHED"]);
  assert.match(r.warnings[0].message, /-\$95, at or past the 50% stop \(-\$90 of a \$180 maximum loss\)/);
  assert.match(r.warnings[0].message, /warning, not an automatic close/);
});

test("WARNING — a P&L short of the stop stays quiet", () => {
  const r = evaluateTrade({ proposal: trade({ pnl: -40 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.deepEqual(warnCodes(r), []);
});

/* ================================================================
   4. CLOSING ORDERS — the exit ladder still routes through the gate
================================================================ */
test("a closing order is not judged by the entry rules, but paper mode still blocks it", () => {
  // Closing a position that is over every entry limit: it REDUCES risk.
  const closing = { intent: "close", dte: 3, contracts: 1, maxLoss: -900,
    legs: [{ side: -1, qty: 1, type: "call", strike: 22 }, { side: 1, qty: 1, type: "call", strike: 24 }] };
  const ok = evaluateTrade({ proposal: closing, portfolio: { positions: [{ maxLoss: -900 }], account: PAPER }, capital: CAPITAL });
  assert.equal(ok.pass, true, `closing must not be blocked by entry rules: ${ok.violations.map((v) => v.message).join(" | ")}`);
  assert.equal(ok.intent, "close");

  const noPaper = evaluateTrade({ proposal: closing, portfolio: { positions: [], account: undefined }, capital: CAPITAL });
  assert.equal(noPaper.pass, false, "an unverifiable account blocks exits too");
  assert.deepEqual(codes(noPaper), ["PAPER_MODE"]);
});

/* ================================================================
   5. PURITY AND THE UNITS THE GATE IS BUILT ON
================================================================ */
test("the gate is pure: same inputs, same answer, and it mutates nothing", () => {
  const proposal = trade({ maxLoss: -340 });
  const portfolio = { positions: [{ maxLoss: -200 }], account: PAPER };
  const before = JSON.stringify({ proposal, portfolio, CAPITAL });
  const a = evaluateTrade({ proposal, portfolio, capital: CAPITAL, signals: CONFLUENT });
  const b = evaluateTrade({ proposal, portfolio, capital: CAPITAL, signals: CONFLUENT });
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify({ proposal, portfolio, CAPITAL }), before, "inputs must come back untouched");
});

test("contracts multiply the risk: four combos of a $180 spread is $720, over the limit", () => {
  const r = evaluateTrade({ proposal: trade({ contracts: 4 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.limits.tradeRisk, 720);
  assert.deepEqual(codes(r), ["PER_TRADE_LIMIT"]);
  assert.match(messageFor(r, "PER_TRADE_LIMIT"), /Max loss \$720 = 14\.4% of capital/);
});

test("undefinedRiskLegs reads the structure, not the name on it", () => {
  const condor = [
    { side: 1, qty: 1, type: "put", strike: 20 }, { side: -1, qty: 1, type: "put", strike: 21 },
    { side: -1, qty: 1, type: "call", strike: 24 }, { side: 1, qty: 1, type: "call", strike: 25 },
  ];
  assert.deepEqual(undefinedRiskLegs(condor), [], "an iron condor is defined risk on both sides");
  assert.equal(undefinedRiskLegs([{ side: -1, qty: 1, type: "call", strike: 24 }]).length, 1);
  assert.deepEqual(undefinedRiskLegs([]), []);
});

test("paperStatus accepts only the two things that actually prove paper mode", () => {
  assert.equal(paperStatus({ paperVerified: true }).verified, true);
  assert.equal(paperStatus({ account_number: "PA123" }).verified, true);
  assert.equal(paperStatus({ account_number: "123" }).verified, false);
  assert.equal(paperStatus({ status: "ACTIVE" }).verified, false);
  assert.equal(paperStatus(null).verified, false);
  assert.equal(paperStatus(undefined).verified, false);
});

/* ================================================================
   6. THE RULE CONFIG ITSELF (PRD §3 and §4)
================================================================ */
test("the config carries the PRD §4 numbers, with 21 DTE and not 7", () => {
  assert.equal(RULES.takeProfitPct, 0.5);
  assert.equal(RULES.stopLossPct, 0.5);
  assert.equal(RULES.stopLossEnforcement, "warn", "the stop is an alert, not an order");
  assert.equal(RULES.exitDTE, 21);
  assert.equal(ruleBadge(), "TP 50% · SL 50% · 21 DTE");
});

test("the sizing model derives the limits from the answers (PRD §3)", () => {
  const s = sizing({ tradingCapital: 10000, concurrentTarget: 5 });
  assert.equal(s.suggestedPerTrade, 2000, "10000 / 5");
  assert.equal(s.bestPracticeCap, 500, "5% of 10000");
  assert.equal(s.cappedPerTrade, 500, "the cap binds");
  assert.equal(s.suggestedTotal, 2500, "25% of 10000");
  assert.equal(s.pills.some((p) => p.id === "per-trade-over-best-practice"), true);
  assert.match(s.pills[0].text, /each one would be 20% of your capital/);
});

test("sizing warns when trading capital is a big slice of savings, and when there is one position", () => {
  const s = sizing({ tradingCapital: 5000, concurrentTarget: 1, savings: 20000 });
  assert.equal(s.pills.some((p) => p.id === "capital-share-of-savings"), true);
  assert.equal(s.pills.some((p) => p.id === "single-position"), true);
});

test("an override needs a typed reason: a bare number does not move the limit", () => {
  const bare = sizing({ tradingCapital: 5000, concurrentTarget: 4, override: { perTrade: 800 } });
  assert.equal(bare.overrideAccepted, false);
  assert.equal(bare.perTradeLimit, 250, "the limit holds until a reason is written");
  assert.equal(bare.pills.some((p) => p.id === "override-needs-reason"), true);

  const withReason = sizing({ tradingCapital: 5000, concurrentTarget: 4,
    override: { perTrade: 800, reason: "Seasonal window I have backtested for three years" } });
  assert.equal(withReason.overrideAccepted, true);
  assert.equal(withReason.perTradeLimit, 800);

  // ...and the gate then sizes against the override, not against the 5% cap.
  const r = evaluateTrade({
    proposal: trade({ maxLoss: -340 }), portfolio: EMPTY_BOOK,
    capital: { tradingCapital: 5000, concurrentTarget: 4,
      override: { perTrade: 800, reason: "Seasonal window I have backtested for three years" } },
    signals: CONFLUENT,
  });
  assert.equal(r.pass, true, "an override with a written reason is the user's call to make");
});

test("missing onboarding answers fall back to the SUGGESTED figures, and say so", () => {
  const r = evaluateTrade({ proposal: GOOD_TRADE, portfolio: EMPTY_BOOK });
  assert.equal(r.limits.tradingCapital, RULES.suggestedTradingCapital);
  assert.equal(r.limits.answered, false, "nothing was answered, so nothing is the user's own limit");
  // The gate still enforces — it just refuses to call a suggestion a decision.
  assert.ok(r.warnings.some((w) => w.code === "CAPITAL_NOT_SET"),
    "an unanswered capital question has to reach the screen, not stay in the gate");
  assert.ok(r.warnings.find((w) => w.code === "CAPITAL_NOT_SET").message.includes("not from anything you chose"));
  assert.equal(r.pass, true);
  assert.doesNotThrow(() => evaluateTrade({}));
  assert.equal(evaluateTrade({}).pass, false, "no proposal, no account: nothing goes out");
});

/* ================= THE QUALITY FLOORS (rules.js) ================= */

test("the live SOYB example is refused on both floors", () => {
  // From the site: buy the 28 call at 1.16, sell the 29 at 0.30. $86 paid for a
  // $15 maximum gain, on legs with 2 and 0 contracts open.
  const r = qualityFloor({ openInterest: [2, 0], maxProfit: 15, maxLoss: -86 });
  assert.equal(r.pass, false);
  assert.equal(r.liquidity.pass, false);
  assert.equal(r.reward.pass, false);
  assert.ok(r.reasons[0].includes("0"), "the sentence carries the number that caused it");
  assert.ok(r.reasons[1].includes("85%"), "and the break-even hit rate it implies");
});

test("the live WEAT example clears both floors", () => {
  // Also from the site: $43 to make $57, on liquid strikes.
  const r = qualityFloor({ openInterest: [900, 640], maxProfit: 57, maxLoss: -43 });
  assert.equal(r.pass, true);
  assert.deepEqual(r.reasons, []);
});

test("a high-probability credit spread is NOT collateral damage", () => {
  // A 68%-chance credit spread collecting a third of its width: exactly the
  // boring trade this app exists to teach. A floor that killed it would be a
  // floor set too high.
  const r = qualityFloor({ openInterest: [400, 400], maxProfit: 33, maxLoss: -67 });
  assert.equal(r.pass, true, "0.49 reward-to-risk has to survive a 0.25 floor");
});

test("MISSING open interest skips the liquidity floor, it does not fail it", () => {
  // Alpaca snapshots carry no open interest: `null`, not 0. Reading that as
  // zero would reject the entire feed and call it illiquidity.
  const r = qualityFloor({ openInterest: [null, 300], maxProfit: 57, maxLoss: -43 });
  assert.equal(r.liquidity.checked, false, "the check was skipped");
  assert.equal(r.pass, true, "nothing may be rejected for a number we do not have");
  const u = qualityFloor({ openInterest: [undefined, undefined], maxProfit: 57, maxLoss: -43 });
  assert.equal(u.liquidity.checked, false);
  assert.equal(u.pass, true);
  // ...and a REAL zero, which CBOE does report, still fails.
  const z = qualityFloor({ openInterest: [0, 300], maxProfit: 57, maxLoss: -43 });
  assert.equal(z.liquidity.checked, true);
  assert.equal(z.pass, false);
});

test("the skip is stated, never silent", () => {
  assert.ok(liquiditySkippedNote("Alpaca").includes("SKIPPED"));
  assert.ok(liquiditySkippedNote("Alpaca").includes("Missing data is not evidence"));
});

test("a market emptied by the floors gets a sentence, not a blank screen", () => {
  const t = NOTHING_TODAY.belowQualityFloor({ liquidity: 3, reward: 1, markets: ["CORN"] });
  assert.ok(t.includes("CORN"));
  assert.ok(t.includes("3"), "the counts are in the sentence");
  assert.ok(t.includes(String(RULES.minOpenInterestAbsolute)) || t.includes("least-traded strikes"));
});

test("the floors are named numbers, and the copy quotes those numbers", () => {
  assert.equal(typeof RULES.liquidityPercentile, "number");
  assert.equal(typeof RULES.minOpenInterestAbsolute, "number");
  assert.equal(typeof RULES.minRewardRisk, "number");
  assert.ok(qualityFloorSentence().includes(String(RULES.minOpenInterestAbsolute)),
    "the sentence on screen and the constant in the code cannot drift apart");
  assert.ok(qualityFloorSentence().includes("40%"), "and the relative half is quoted too");
});

/* ---- THE FLOOR IS RELATIVE TO THE CHAIN IT IS JUDGING ---- */

test("the same raw count passes on a thin chain and fails on a busy one", () => {
  // 30 open contracts. On a quiet expiry that is a well-traded strike; on a
  // busy one it is the tail. A single absolute number cannot tell them apart,
  // which is exactly why this floor is not one.
  const thin = [0, 0, 1, 2, 3, 4, 6, 8, 11, 14, 18, 22, 26, 30];
  const busy = [40, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1400, 2000, 3000, 5000];
  const onThin = qualityFloor({ openInterest: [30, 30], peerOpenInterest: thin, maxProfit: 57, maxLoss: -43 });
  const onBusy = qualityFloor({ openInterest: [30, 30], peerOpenInterest: busy, maxProfit: 57, maxLoss: -43 });
  assert.equal(onThin.liquidity.pass, true, "30 beats most of a quiet expiry");
  assert.equal(onBusy.liquidity.pass, false, "30 is the tail of a busy one");
  assert.equal(onBusy.liquidity.threshold.basis, "relative");
  assert.ok(onBusy.reasons[0].includes("percentile"), "the sentence says where the bar came from");
});

test("a chain where nothing trades cannot certify itself", () => {
  // Every strike on the expiry is single digits, so the 40th percentile is 1.
  // Without the absolute floor underneath, the emptiness would BE the standard.
  const empty = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5];
  const r = qualityFloor({ openInterest: [3, 4], peerOpenInterest: empty, maxProfit: 57, maxLoss: -43 });
  assert.equal(r.liquidity.pass, false, "beating a distribution of nothing is not liquidity");
  assert.equal(r.liquidity.threshold.threshold, RULES.minOpenInterestAbsolute);
  assert.equal(r.liquidity.threshold.basis, "absolute");
});

test("the three reasons the relative half is absent are three different sentences", () => {
  // A setting that asks for no percentile, a chain with too few strikes to take
  // one from, and a percentile that was measured and simply lost to the
  // absolute floor are not the same fact, and the screen must not report them
  // as one. Blaming "too few strikes" for the app's own setting is the app
  // blaming the data.
  const tooFew = liquidityThreshold([100, 200, 300], RECOMMENDED_LIQUIDITY);
  assert.equal(tooFew.relative, null, "three numbers are not a distribution");
  assert.equal(tooFew.threshold, RULES.minOpenInterestAbsolute);
  assert.ok(tooFew.basis.includes("too few strikes"));

  const notAsked = liquidityThreshold([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200], "off");
  assert.ok(notAsked.basis.includes("no relative test"), "OFF asks for no percentile: that is not a data problem");

  const lost = liquidityThreshold([0, 0, 1, 2, 3, 4, 6, 8, 11, 14, 18, 22, 26, 30], RECOMMENDED_LIQUIDITY);
  assert.ok(Number.isFinite(lost.relative), "it WAS measured");
  assert.equal(lost.basis, "absolute", "it just lost to the floor underneath");
});

test("MISSING open interest still skips the floor, whatever the peers say", () => {
  const busy = [40, 60, 90, 120, 180, 240, 300, 420, 600, 900, 1400, 2000, 3000, 5000];
  const r = qualityFloor({ openInterest: [null, 5], peerOpenInterest: busy, maxProfit: 57, maxLoss: -43 });
  assert.equal(r.liquidity.checked, false);
  assert.equal(r.pass, true, "the relative floor changed nothing about missing data");
});

/* ---- THE SETTING IS THE USER'S, AND THE SCREEN SAYS WHICH ONE PRODUCED IT ---- */

test("the recommendation is marked, and it IS the constant in the code", () => {
  assert.equal(LIQUIDITY_LEVELS.filter((l) => l.recommended).length, 1, "exactly one recommendation");
  assert.equal(RECOMMENDED_LIQUIDITY.percentile, RULES.liquidityPercentile);
  assert.equal(RECOMMENDED_LIQUIDITY.absolute, RULES.minOpenInterestAbsolute);
});

test("every level is ordered from strictest to loosest, and OFF is really off", () => {
  const ids = LIQUIDITY_LEVELS.map((l) => l.id);
  assert.deepEqual(ids, ["strict", "recommended", "relaxed", "off"]);
  for (let i = 1; i < LIQUIDITY_LEVELS.length; i++) {
    assert.ok(LIQUIDITY_LEVELS[i].absolute <= LIQUIDITY_LEVELS[i - 1].absolute);
    assert.ok(LIQUIDITY_LEVELS[i].percentile <= LIQUIDITY_LEVELS[i - 1].percentile);
  }
  const off = qualityFloor({ openInterest: [0, 0], level: "off", maxProfit: 57, maxLoss: -43 });
  assert.equal(off.liquidity.pass, true, "OFF is no floor, not a gentler one");
});

test("loosening carries a warning that NAMES what it lets back in", () => {
  assert.equal(looseningWarning("strict"), null, "stricter than recommended needs no warning");
  assert.equal(looseningWarning("recommended"), null);
  const relaxed = looseningWarning("relaxed");
  assert.ok(relaxed && relaxed.includes("20%"), "it says how much of the expiry comes back");
  assert.ok(relaxed.includes("5"), "and how few open contracts it allows");
  const off = looseningWarning("off");
  assert.ok(off.includes("OFF"));
  assert.ok(off.includes("nobody trades"), "the warning names the thing, not a mood");
});

test("a filtered list always says which setting produced it", () => {
  const n = liquiditySettingNote("relaxed", { kept: 4, liquidity: 2, reward: 1, skipped: 0 });
  assert.ok(n.includes("RELAXED"));
  assert.ok(n.includes("4 shown"));
  assert.ok(n.includes("2 removed for liquidity"));
  assert.ok(n.includes("1 removed for reward-to-risk"));
  assert.ok(n.includes(LIQUIDITY_MEASUREMENT.asOf), "and the close the floor was measured against");
  const rec = liquiditySettingNote("recommended", { kept: 9 });
  assert.ok(rec.includes("recommendation"));
});

test("the floor numbers carry the measurement they were set from", () => {
  const src = readFileSync(new URL("./rules.js", import.meta.url), "utf8");
  assert.ok(/MEASURED/.test(src), "the constants say where they came from");
  assert.ok(src.includes("/api/liquidity"), "and name the endpoint that produced it");
  assert.ok(!/PROVISIONAL/.test(src), "and no longer claim to be provisional");
});

test("the measurement is a reading, and is never derived from the floor it justifies", () => {
  const M = LIQUIDITY_MEASUREMENT;
  assert.equal(M.markets, 5);
  assert.ok(M.reporting > 0 && M.reporting <= M.contracts, "you cannot report more strikes than you read");
  // The whole point of the two-part floor: the bar a leg must clear is not one
  // number across these markets. If this spread ever collapses, a single
  // absolute floor would do just as well and this design has lost its reason.
  assert.ok(M.high.bar >= M.low.bar * 4,
    "the measured near-the-money bar spans several times over between markets");
  assert.notEqual(M.low.market, M.high.market);
  // And it must not be computable from the floor's own constants: a screen that
  // recomputed the finding out of the setting would report a new measurement
  // every time somebody moved the setting.
  for (const k of ["liquidityPercentile", "minOpenInterestAbsolute", "minPeersForPercentile"]) {
    assert.notEqual(M.low.bar, RULES[k]);
    assert.notEqual(M.high.bar, RULES[k]);
  }
});

test("the measurement sentence is generated, and no two words are glued together", () => {
  // JSX drops whitespace-only text that spans a newline, so a paragraph built
  // out of {expr} and prose across several lines silently produces "read1035
  // strikes" and "all 5markets". This sentence is generated in one string for
  // that reason; this test is what stops it being reassembled in a component.
  const t = liquidityMeasurementNote();
  assert.ok(!/[0-9][A-Za-z]/.test(t), `a number is glued to a word: ${t}`);
  assert.ok(!/[A-Za-z][0-9]/.test(t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")), "and a word to a number");
  assert.ok(t.includes(LIQUIDITY_MEASUREMENT.asOf), "it names the close it was taken on");
  assert.ok(t.includes(String(LIQUIDITY_MEASUREMENT.low.bar)) && t.includes(LIQUIDITY_MEASUREMENT.low.market));
  assert.ok(t.includes(String(LIQUIDITY_MEASUREMENT.high.bar)) && t.includes(LIQUIDITY_MEASUREMENT.high.market));
});

test("the measurement explains the number it actually moved", () => {
  // The reading's one real change: the peer threshold. The app aims at ~45 DTE
  // and the grain markets carried 10-11 REPORTING strikes there, so 12 would
  // have switched the relative half off exactly where the app builds.
  assert.ok(RULES.minPeersForPercentile <= 10,
    "an expiry with 10 reporting strikes must still get a percentile");
  assert.ok(RULES.minPeersForPercentile >= 5,
    "but a handful of numbers is not a distribution");
  const tenStrikeExpiry = [2, 5, 7, 12, 20, 33, 60, 90, 180, 353];
  const t = liquidityThreshold(tenStrikeExpiry, RECOMMENDED_LIQUIDITY);
  assert.ok(Number.isFinite(t.relative), "the 43-day grain board is measurable at this setting");
});

test("RECOMMENDED is what the app STARTS at — a measured floor shipped switched off is a measurement nobody applies", () => {
  assert.equal(RECOMMENDED_LIQUIDITY.recommended, true);
  assert.equal(RECOMMENDED_LIQUIDITY.percentile, RULES.liquidityPercentile);
  assert.equal(RECOMMENDED_LIQUIDITY.absolute, RULES.minOpenInterestAbsolute);
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/useState\(RECOMMENDED_LIQUIDITY\.id\)/.test(app),
    "the liquidity level must start at the recommended one, not at OFF");
});

/* ================= UNPRICEABLE IS NOT FREE (rules.js, riskGate.js) =================
   Read live on BOIL 2026-10-09, spot $21.23, liquidity floor OFF: a Bullish
   Call Butterfly (+1 21C / -2 22.5C / +1 24C) priced at a net debit of ZERO and
   was offered with YOU PAY $0, MAX LOSS -$0, R/R 6748644041614687.00 and 250
   contracts. Everything below holds that case shut. */

// The structure as the screen had it: the 24C nobody bids for, and a net that
// cancels to nothing because half of an ask is not a price.
const BOIL_FLY = [
  { side: 1, qty: 1, type: "call", strike: 21 },
  { side: -1, qty: 2, type: "call", strike: 22.5 },
  { side: 1, qty: 1, type: "call", strike: 24 },
];
const BOIL_QUOTES = [{ bid: 0.62, ask: 0.70 }, { bid: 0.31, ask: 0.36 }, { bid: 0, ask: 0.05 }];

test("the BOIL butterfly is UNPRICEABLE, not free", () => {
  const r = priceability({ legs: BOIL_FLY, quotes: BOIL_QUOTES, net: 0, maxLoss: -1e-14 });
  assert.equal(r.priceable, false);
  assert.equal(r.why, "no-bid", "the long leg nobody bids for is named first");
  assert.ok(r.reasons.join(" ").includes("24C"), "and the sentence says WHICH leg");
  assert.ok(r.reasons.join(" ").includes(money(MIN_NET_DOLLARS)), "with the minimum it failed against");
});

test("a long leg with no bid is unpriceable on its own, whatever the net says", () => {
  // The net can look perfectly healthy while one leg is a placeholder: you
  // cannot sell back what nobody is bidding for, so what it cost is unknown.
  const r = priceability({ legs: BOIL_FLY, quotes: [{ bid: 0.62, ask: 0.7 }, { bid: 0.31, ask: 0.36 }, { bid: 0, ask: 0.05 }], net: 0.42, maxLoss: -42 });
  assert.equal(r.priceable, false);
  assert.equal(r.why, "no-bid");
});

test("a genuine CREDIT structure is priceable: the test is on the absolute value", () => {
  const credit = [{ side: -1, qty: 1, type: "put", strike: 20 }, { side: 1, qty: 1, type: "put", strike: 19 }];
  const r = priceability({ legs: credit, quotes: [{ bid: 0.48, ask: 0.55 }, { bid: 0.18, ask: 0.22 }], net: -0.30, maxLoss: -70 });
  assert.equal(r.priceable, true, "a negative net is money received, not a missing price");
  assert.deepEqual(r.reasons, []);
});

test("a SHORT leg with no bid does not fail on its own — the net is what catches it", () => {
  // Symmetry would be wrong here: you are not buying that leg. What matters is
  // whether the structure as a whole still prices to something.
  const legs = [{ side: 1, qty: 1, type: "call", strike: 21 }, { side: -1, qty: 1, type: "call", strike: 24 }];
  const r = priceability({ legs, quotes: [{ bid: 0.62, ask: 0.7 }, { bid: 0, ask: 0.05 }], net: 0.6, maxLoss: -60 });
  assert.equal(r.priceable, true);
});

test("a quote the feed did not give is UNKNOWN, never a bid of zero", () => {
  // The same rule the liquidity floor already applies to open interest: a leg
  // priced from the model carries no bid at all, and that rejects nothing.
  const r = priceability({ legs: BOIL_FLY, quotes: [null, undefined, {}], net: 0.45, maxLoss: -45 });
  assert.equal(r.priceable, true, "missing quotes reject nothing");
  assert.equal(r.unknownQuotes, 3, "but the caller can see they were missing");
});

test("the minimum bites on the NET, so a structure that prices to nothing is out with no quotes at all", () => {
  const r = priceability({ legs: BOIL_FLY, net: 0.01, maxLoss: -1 });
  assert.equal(r.priceable, false);
  assert.equal(r.why, "no-net");
  const fine = priceability({ legs: BOIL_FLY, net: 0.35, maxLoss: -35 });
  assert.equal(fine.priceable, true);
});

test("THE GATE REJECTS AN UNKNOWN MAXIMUM LOSS — a finite number is not a known one", () => {
  const r = evaluateTrade({
    proposal: trade({ legs: BOIL_FLY, quotes: BOIL_QUOTES, net: 0, maxLoss: -1e-14, maxProfit: 37462 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL,
  });
  assert.equal(r.pass, false, "-1e-14 is finite, and it is still not a maximum loss");
  assert.ok(codes(r).includes("UNPRICEABLE"));
  assert.ok(messageFor(r, "UNPRICEABLE").includes("24C"), "the block says what is wrong with the trade");
});

test("the gate blocks a zero max loss even when the caller passes no quotes", () => {
  const r = evaluateTrade({
    proposal: trade({ legs: BOIL_FLY, maxLoss: -0.0001, maxProfit: 37462 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL,
  });
  assert.equal(r.pass, false);
  assert.ok(codes(r).includes("UNPRICEABLE"));
});

test("the priceability block never touches a CLOSING order", () => {
  // Getting out is always allowed: the rules that gate an entry do not gate an
  // exit, and a position already open is not made safer by being unclosable.
  const r = evaluateTrade({
    proposal: trade({ intent: "close", legs: BOIL_FLY, maxLoss: -1e-14 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL,
  });
  assert.ok(!codes(r).includes("UNPRICEABLE"));
});

test("the ordinary spread still passes with quotes attached", () => {
  const r = evaluateTrade({
    proposal: trade({ quotes: [{ bid: 1.10, ask: 1.20 }, { bid: 0.28, ask: 0.33 }], net: 0.85 }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r.pass, true, r.violations.map((v) => v.message).join(" | "));
});

test("R/R is a dash, never a ratio, when there is nothing to divide by", () => {
  assert.equal(rewardRisk(37462, -1e-14), null, "6748644041614687.00 was arithmetic on a placeholder");
  assert.equal(rewardRisk(37462, -0), null);
  assert.equal(rewardRisk(57, -43).toFixed(2), "1.33", "and a real one is still a ratio");
  assert.equal(rewardRisk(0, -43), null, "no upside is not a reward-to-risk either");
});

test("nothing prints as -$0", () => {
  assert.equal(money(-0.0001), "$0", "a minus sign in front of zero invents a direction");
  assert.equal(money(-0), "$0");
  assert.equal(money(-340), "-$340", "and a real loss keeps its sign");
});

test("the quality floor cannot judge a structure whose price could not be read", () => {
  const r = qualityFloor({ openInterest: [900, 640], maxProfit: 37462, maxLoss: -1e-14 });
  assert.equal(r.reward.rr, null, "no ratio is formed against a max loss under the minimum");
  assert.equal(r.pass, false);
});

test("an unpriceable structure is left out WITH A SENTENCE, and never at $0", () => {
  const note = unpriceableNote(3, "BOIL");
  assert.ok(note.includes("3") && note.includes("BOIL"));
  assert.ok(note.includes("not a maximum loss of zero"), "it says what a zero actually means");
  const refusal = NOTHING_TODAY.unpriceable({ unpriceable: 3, markets: ["BOIL"] });
  assert.ok(refusal.includes("BOIL") && refusal.includes("unpriced"));
  assert.ok(!/-\$0/.test(refusal), "the refusal screen does not print -$0 either");
});

test("a board emptied by unreadable prices is a different sentence from one emptied by the floors", () => {
  const unpriced = NOTHING_TODAY.unpriceable({ unpriceable: 2, markets: ["BOIL"] });
  const floored = NOTHING_TODAY.belowQualityFloor({ liquidity: 2, reward: 0, markets: ["BOIL"] });
  assert.notEqual(unpriced, floored);
  assert.ok(!unpriced.includes("budget"), "and neither of them is the budget answer");
});

/* ============================================================================
   TASK 0 — THE POSITIVE-MAX-LOSS TEST IS NOW IN THE RISK GATE.
   The debt PR #15 left open, and the case is LIVE: on BOIL 2026-10-09 six call
   pairs price a bull call spread as a CREDIT (buy 19 / sell 19.5 nets -0.290,
   buy 22 / sell 22.5 nets -0.171), which cannot lose at expiry.
   ========================================================================= */

const BOIL_CREDIT_SPREAD = [
  { side: 1, type: "call", strike: 19, qty: 1 },
  { side: -1, type: "call", strike: 19.5, qty: 1 },
];

test("A HAND-BUILT STRUCTURE WHOSE WORST CASE IS A PROFIT DOES NOT LEAVE", () => {
  const r = evaluateTrade({
    proposal: { intent: "open", ticker: "BOIL", legs: BOIL_CREDIT_SPREAD, dte: 36, contracts: 1,
      maxLoss: 29, maxProfit: 79 },   // SIGNED: positive means it cannot lose
    portfolio: EMPTY_BOOK, capital: { tradingCapital: 5000, concurrentTarget: 4 },
  });
  assert.equal(r.pass, false, "an arbitrage is not sendable");
  const v = r.violations.find((x) => x.code === "IMPOSSIBLE_LOSS");
  assert.ok(v, "and it is refused BY NAME, not swept into UNDEFINED_RISK");
  assert.ok(v.message.includes("$29"), "the sentence carries the number that produced it");
  assert.ok(/PROFIT/.test(v.message), "and says what is wrong: the worst case is a gain");
});

test("the ordinary debit spread — a NEGATIVE worst case — is untouched by it", () => {
  const r = evaluateTrade({
    proposal: { intent: "open", ticker: "BOIL", legs: BOIL_CREDIT_SPREAD, dte: 36, contracts: 1,
      maxLoss: -29, maxProfit: 21 },
    portfolio: EMPTY_BOOK, capital: { tradingCapital: 5000, concurrentTarget: 4 },
  });
  assert.equal(r.violations.some((v) => v.code === "IMPOSSIBLE_LOSS"), false);
  assert.equal(r.pass, true, "a real trade still passes");
});

test("THE SIGN TRAP: a CLOSING order carrying a positive magnitude is never sign-tested", () => {
  // pro.jsx closeGroup() passes the cost basis, which is a positive magnitude.
  // Reading that as an arbitrage would block every close on the desk.
  const r = evaluateTrade({
    proposal: { intent: "close", ticker: "BOIL", legs: BOIL_CREDIT_SPREAD, contracts: 1, maxLoss: 340 },
    portfolio: EMPTY_BOOK, capital: { tradingCapital: 5000, concurrentTarget: 4 },
  });
  assert.equal(r.violations.some((v) => v.code === "IMPOSSIBLE_LOSS"), false);
  assert.equal(r.pass, true, "a close is never blocked by an entry-only rule");
});

test("a max loss of exactly zero is UNPRICEABLE, not an arbitrage — the two stay separate", () => {
  const r = evaluateTrade({
    proposal: { intent: "open", ticker: "BOIL", legs: BOIL_CREDIT_SPREAD, dte: 36, contracts: 1, maxLoss: 0 },
    portfolio: EMPTY_BOOK, capital: { tradingCapital: 5000, concurrentTarget: 4 },
  });
  assert.ok(r.violations.some((v) => v.code === "UNPRICEABLE"), "zero is a price we could not read");
  assert.equal(r.violations.some((v) => v.code === "IMPOSSIBLE_LOSS"), false,
    "and it is NOT reported as a trade that cannot lose");
});

/* ============================================================================
   TASK 4a — THE COPILOT CALL IS ON THE EDGE, AND STILL BEHIND THE PASSWORD.
   A synchronous Netlify Function is killed at roughly ten seconds; a 1200-token
   streamed analysis takes longer than that EVERY time, so the copilot was
   structurally cut off rather than intermittently unlucky. Moving it to the
   edge is the fix — and the thing that must not go wrong while doing it is the
   password, so these read the repository rather than trusting a memory of it.
   ========================================================================= */

test("the AI proxy is an EDGE function, and the old synchronous one is gone", () => {
  const edge = readFileSync(new URL("../netlify/edge-functions/ai.js", import.meta.url), "utf8");
  assert.ok(edge.includes("api.anthropic.com/v1/messages"), "it still proxies Anthropic");
  assert.ok(edge.includes("Deno.env.get(\"ANTHROPIC_KEY\")"), "and reads the key from the Deno environment");
  // A CALL, not the word: the header comment names Netlify.env to explain why
  // it is not used, and a test that cannot tell prose from code is a test that
  // stops the comment being written.
  assert.ok(!edge.includes("Netlify.env.get("), "Netlify.env is the Node runtime and does not exist on the edge");
  assert.throws(
    () => readFileSync(new URL("../netlify/functions/ai.mjs", import.meta.url), "utf8"),
    "the ten-second version must not survive beside the edge one");
});

test("THE PASSWORD RUNS FIRST — the AI proxy is never reachable without it", () => {
  const toml = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
  const gateAt = toml.indexOf('function = "gate"');
  const aiAt = toml.indexOf('function = "ai"');
  assert.ok(gateAt > -1 && aiAt > -1, "both edge functions are declared in netlify.toml");
  assert.ok(gateAt < aiAt, "and the gate is declared FIRST: netlify.toml runs them in written order");
  assert.ok(!/from = "\/api\/ai"/.test(toml), "the old redirect to a Netlify Function is gone");

  // Belt and braces: the order above is a deployment behaviour this repository
  // cannot execute, so ai.js asks the same question itself. The failure this
  // guards against is an unauthenticated Anthropic proxy on the open internet.
  const edge = readFileSync(new URL("../netlify/edge-functions/ai.js", import.meta.url), "utf8");
  assert.ok(/accessOf\(req/.test(edge), "ai.js checks access itself as well");
  assert.ok(edge.includes("401"), "and refuses with a 401 when it fails");
});

test("there is still exactly ONE place a password is compared", () => {
  const access = readFileSync(new URL("../netlify/edge-functions/lib/access.js", import.meta.url), "utf8");
  const gate = readFileSync(new URL("../netlify/edge-functions/gate.js", import.meta.url), "utf8");
  const edge = readFileSync(new URL("../netlify/edge-functions/ai.js", import.meta.url), "utf8");
  assert.ok(access.includes("given === password"), "the comparison lives in lib/access.js");
  for (const [name, src] of [["gate.js", gate], ["ai.js", edge]]) {
    assert.ok(/from "\.\/lib\/access\.js"|from "\.\/lib\/access\.js"/.test(src), `${name} imports it`);
    assert.ok(!src.includes("given === "), `${name} does not carry a second copy of the comparison`);
  }
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
