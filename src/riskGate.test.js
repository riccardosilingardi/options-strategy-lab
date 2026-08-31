// Tests for the risk gate (src/riskGate.js) and the rule config (src/rules.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import assert from "node:assert/strict";
import { evaluateTrade, paperStatus, undefinedRiskLegs } from "./riskGate.js";
import { RULES, sizing, ruleBadge } from "./rules.js";

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

test("missing onboarding answers fall back to the defaults instead of throwing", () => {
  const r = evaluateTrade({ proposal: GOOD_TRADE, portfolio: EMPTY_BOOK });
  assert.equal(r.limits.tradingCapital, RULES.defaultTradingCapital);
  assert.equal(r.pass, true);
  assert.doesNotThrow(() => evaluateTrade({}));
  assert.equal(evaluateTrade({}).pass, false, "no proposal, no account: nothing goes out");
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
