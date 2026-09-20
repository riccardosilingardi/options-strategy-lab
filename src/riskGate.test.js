// Tests for the risk gate (src/riskGate.js) and the rule config (src/rules.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluateTrade, paperStatus, undefinedRiskLegs } from "./riskGate.js";
import { positionSize, positionSizeNote, contractsOf, withPositionSize } from "./journal.js";
import { orderBody } from "./order.js";
import { RULES, sizing, ruleBadge, qualityFloor, qualityFloorSentence, liquiditySkippedNote, NOTHING_TODAY,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityThreshold, looseningWarning, liquiditySettingNote,
  priceability, rewardRisk, unpriceableNote, money, MIN_NET_DOLLARS,
  spreadShare, spreadFloor, spreadFloorReason, wideSpreadNote, spreadSkippedNote,
  expiryChoice, expiryChoiceNote, emptyExpiryNote,
  modelSanity, modelSanityReason, modelDisagreementNote,
  chanceOf, chanceSeedKey, seasonalProvenance, seasonalStampOf, seasonalSourceSentence,
  MEASURED_SEASONAL_SOURCE, ESTIMATED_SEASONAL_SOURCE, watchAttentionLevel,
  ivProvenance, CHAIN_IV_SOURCE, THESIS_IV_SOURCE, FALLBACK_IV_SOURCE,
  comboBook, openLimitPrice, openLimitNote, limitPlacement, notionalControlled, notionalNote,
  entryRoom, entryInsideExitNote, entryRoomWarning, entryRoomOverrideAsk, entryOverrideOk, entryOverrideNote,
  passedOverRecord, passedOverSummary, OPEN_LIMIT_SLIPPAGE, CLOSE_LIMIT_SLIPPAGE,
  chancePct, chanceText, chanceInTen, signedMoney,
  sigmaProvenance, TABLE_SIGMA_SOURCE, MEASURED_SIGMA_SOURCE, FALLBACK_SIGMA_SOURCE } from "./rules.js";
import { netBS, SIGMA, exitSim } from "./engine.js";
import { isStale, staleAmong, agePhrase, freshnessNote, BUDGETS } from "./freshness.js";

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

/* ---- THE ENTRY FLOOR IS THREE BANDS NOW, NOT A CLIFF (src/rules.js,
   `entryRoom`). The 30 is UNCHANGED and so is the refusal inside the exit
   window; what is new is the band between them and the typed override. ---- */

test("ENTRY DTE — an entry at 12 DTE is refused: the 21 DTE exit would already have fired", () => {
  const r = evaluateTrade({ proposal: trade({ dte: 12 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["ENTRY_DTE"]);
  assert.match(messageFor(r, "ENTRY_DTE"), /at or inside the 21-day exit rule/);
  assert.match(messageFor(r, "ENTRY_DTE"), /no days at all/);
  assert.match(messageFor(r, "ENTRY_DTE"), /not overridable/);
});

test("ENTRY DTE — exactly AT the exit rule is still the hard refusal, not the warning band", () => {
  const r = evaluateTrade({ proposal: trade({ dte: RULES.exitDTE }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["ENTRY_DTE"]);
  // And a written reason does NOT unlock it: there is no version of the trade
  // the frozen exit rule does not immediately end.
  const r2 = evaluateTrade({
    proposal: trade({ dte: RULES.exitDTE, entryOverride: "the 21-day board is the only liquid one on this market" }),
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
  });
  assert.equal(r2.pass, false);
  assert.deepEqual(codes(r2), ["ENTRY_DTE"]);
});

test("ENTRY DTE — 28 DTE blocks WITHOUT a reason, and the block says what would unlock it", () => {
  const r = evaluateTrade({ proposal: trade({ dte: 28 }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["ENTRY_DTE_ROOM"]);
  const m = messageFor(r, "ENTRY_DTE_ROOM");
  assert.match(m, /7 days before the 21-day exit/);      // the room, in the sentence
  assert.match(m, /the app aims for 9/);                 // and what it aims for
  assert.match(m, new RegExp(`at least ${RULES.minOverrideReasonChars} characters`));
});

test("ENTRY DTE — a reason that is too short is not an override", () => {
  const short = "x".repeat(RULES.minOverrideReasonChars - 1);
  const r = evaluateTrade({ proposal: trade({ dte: 28, entryOverride: short }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, false);
  assert.deepEqual(codes(r), ["ENTRY_DTE_ROOM"]);
  // Whitespace is not a reason either.
  const blank = evaluateTrade({ proposal: trade({ dte: 28, entryOverride: "              " }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(blank.pass, false);
});

test("ENTRY DTE — a written reason of sufficient length turns the block into a warning", () => {
  const why = "the 28-day board is the only one on BOIL with any open interest near the money";
  const r = evaluateTrade({ proposal: trade({ dte: 28, entryOverride: why }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.pass, true, "the trade unlocks");
  assert.deepEqual(codes(r), [], "and nothing is left blocking it");
  const w = r.warnings.find((x) => x.code === "ENTRY_DTE_ROOM");
  assert.ok(w, "but it is still warned about — an override is not a dismissal");
  assert.match(w.message, /7 days before the 21-day exit/);
});

test("ENTRY DTE — at and above the floor nothing is said at all, warning included", () => {
  for (const dte of [RULES.minEntryDTE, 45, 90]) {
    const r = evaluateTrade({ proposal: trade({ dte }), portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
    assert.equal(codes(r).includes("ENTRY_DTE_ROOM"), false, `${dte} DTE does not block`);
    assert.equal(codes(r).includes("ENTRY_DTE"), false, `${dte} DTE does not block`);
    assert.equal(r.warnings.some((w) => w.code === "ENTRY_DTE_ROOM"), false, `${dte} DTE does not warn`);
  }
});

test("ENTRY DTE — a CLOSING order is never held by any of the three bands", () => {
  for (const dte of [5, 12, 21, 28]) {
    const r = evaluateTrade({
      proposal: { ...trade({ dte }), intent: "close" },
      portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT,
    });
    assert.equal(codes(r).includes("ENTRY_DTE"), false, `close at ${dte} DTE is not refused`);
    assert.equal(codes(r).includes("ENTRY_DTE_ROOM"), false, `close at ${dte} DTE is not refused`);
  }
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
  // A setting that asks for no percentile, a chain with too few contracts to take
  // one from, and a percentile that was measured and simply lost to the
  // absolute floor are not the same fact, and the screen must not report them
  // as one. Blaming "too few contracts" for the app's own setting is the app
  // blaming the data.
  const tooFew = liquidityThreshold([100, 200, 300], RECOMMENDED_LIQUIDITY);
  assert.equal(tooFew.relative, null, "three numbers are not a distribution");
  assert.equal(tooFew.threshold, RULES.minOpenInterestAbsolute);
  assert.ok(tooFew.basis.includes("too few contracts"));

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

/* ============================================================================
   TASK 3 — A WIDE MARKET IS NOT A PRICE.
   Measured on BOIL 2026-10-09 near the money: bid/ask spreads of 66%, 91%,
   145% and 166% of the mid, on strikes the app builds on.
   ========================================================================= */

test("the spread is measured as a SHARE of the mid, not in cents", () => {
  // 10 cents wide is nothing on a $4 option and the whole trade on a $0.12 one.
  assert.equal(Math.round(spreadShare(3.95, 4.05) * 1000) / 1000, 0.025);
  assert.equal(Math.round(spreadShare(0.07, 0.17) * 100) / 100, 0.83);
});

test("THE FOUR LIVE BOIL READINGS ARE ALL REFUSED, and a normal market is not", () => {
  // Each pair below is a bid/ask whose spread is the measured share of its mid.
  for (const [bid, ask] of [[0.30, 0.60], [0.20, 0.52], [0.10, 0.60], [0.05, 0.45]]) {
    const r = spreadFloor([{ bid, ask }]);
    assert.equal(r.pass, false, `${bid}/${ask} should be refused`);
    assert.ok(r.widest > RULES.maxSpreadShareOfMid);
  }
  assert.equal(spreadFloor([{ bid: 1.20, ask: 1.26 }]).pass, true, "a real market passes");
});

test("UNKNOWN IS NOT WIDE — a leg the feed quoted one side of tests nothing", () => {
  // The same rule as `oi: null`. A model-priced leg carries no bid or ask at
  // all, and reading that as a bad market would reject a whole feed.
  assert.equal(spreadShare(null, 0.6), null);
  assert.equal(spreadShare(0.3, undefined), null);
  assert.equal(spreadShare(0, 0.6), null, "a zero bid is the no-bid case, not a 200% spread");
  const skipped = spreadFloor([{ bid: null, ask: null }, {}]);
  assert.equal(skipped.checked, false);
  assert.equal(skipped.pass, true, "unmeasurable is not failed");
  assert.equal(skipped.unknown, 2);
});

test("it is judged on the WIDEST leg, and it names itself", () => {
  const r = spreadFloor([{ bid: 1.2, ask: 1.26 }, { bid: 0.1, ask: 0.6 }]);
  assert.equal(r.pass, false, "one bad leg is enough: the structure is priced off all of them");
  const why = spreadFloorReason(r.widest, r.floor);
  assert.ok(why.includes("bid to ask") && why.includes("MID"));
  assert.ok(wideSpreadNote(2, "BOIL").includes("2 structures"));
  assert.ok(spreadSkippedNote("Alpaca").includes("Alpaca"));
});

test("A LEG CAN BE BUSY AND STILL UNPRICEABLY WIDE — the two floors are independent", () => {
  // The whole reason this floor exists: 300 contracts open, a 145%-wide market,
  // and the liquidity floor waves it straight through.
  const r = qualityFloor({
    openInterest: [300, 300], peerOpenInterest: [300, 300, 280, 260, 240, 220, 200, 180],
    quotes: [{ bid: 0.10, ask: 0.60 }, { bid: 1.2, ask: 1.26 }],
    maxProfit: 200, maxLoss: -100,
  });
  assert.equal(r.liquidity.pass, true, "the headcount is fine");
  assert.equal(r.spread.pass, false, "and the market is still not a price");
  assert.equal(r.pass, false);
});

test("the spread floor does NOT move with the liquidity setting", () => {
  // Loosening the headcount is not an answer to "may the two sides disagree by
  // a factor of three".
  const wide = [{ bid: 0.10, ask: 0.60 }];
  for (const level of LIQUIDITY_LEVELS) {
    const r = qualityFloor({ openInterest: [500], quotes: wide, level, maxProfit: 200, maxLoss: -100 });
    assert.equal(r.spread.pass, false, `still refused at ${level.id}`);
  }
});

test("the liquidity floor's own two constants are untouched by any of this", () => {
  assert.equal(RULES.liquidityPercentile, 0.40);
  assert.equal(RULES.minOpenInterestAbsolute, 10);
});

/* ============================================================================
   TASK 2 — THE APP OPENED ON THE DEADEST EXPIRY ON THE BOARD.
   Measured on BOIL near the money, contracts clearing the 10-contract floor:
     2026-09-18 (14 DTE) 19 of 23 | 2026-10-02 (28 DTE) 12 of 14
     2026-10-09 (35 DTE)  2 of  7   <- the one the app selected
   ========================================================================= */

const BOIL_BOARD = [
  { key: "2026-09-18", dte: 14, clears: 19, near: 23 },
  { key: "2026-10-02", dte: 28, clears: 12, near: 14 },
  { key: "2026-10-09", dte: 35, clears: 2, near: 7 },
  { key: "2026-11-20", dte: 77, clears: 9, near: 12 },
];

test("THE BOARD DECIDES, NOT THE CALENDAR: the dead 35-DTE expiry is not chosen", () => {
  const c = expiryChoice(BOIL_BOARD);
  assert.notEqual(c.chosen.key, "2026-10-09", "2 of 7 is why the Shortlist kept saying nothing clears");
  assert.equal(c.chosen.key, "2026-11-20", "the busiest board past the entry floor");
  assert.equal(c.reason, "liquidity");
});

test("the 30-DTE entry floor is NOT broken to reach a busier board — and it says so", () => {
  const c = expiryChoice(BOIL_BOARD);
  assert.ok(c.eligible.every((e) => e.dte >= RULES.minEntryDTE), "nothing under the floor is eligible");
  assert.equal(c.passedOver.key, "2026-09-18", "the nearer, thicker board is named");
  const note = expiryChoiceNote(c);
  assert.ok(note.includes("2026-09-18") && note.includes("19 of 23"), "the screen says what was passed over");
  assert.ok(note.includes(String(RULES.minEntryDTE)) && note.includes(String(RULES.exitDTE)),
    "and why: the entry floor exists so the exit rule has room");
});

test("AN EXPIRY THAT SETTLES TODAY IS NOT A BOARD ANYBODY PASSED OVER", () => {
  // Read live on 2026-09-04. The note named "2026-09-04 ... only 0 days out"
  // as the busier alternative, which on the main screen reads as a bug rather
  // than as a rule explaining itself: nobody was weighing a 45-day position
  // against a contract with hours left on it. The sentence is for a REAL
  // trade-off the 30-day entry floor forced, so 2026-09-18 is what it owes.
  const c = expiryChoice([{ key: "2026-09-04", dte: 0, clears: 16, near: 16 }, ...BOIL_BOARD]);
  assert.equal(c.chosen.key, "2026-11-20", "the choice itself is unchanged");
  assert.equal(c.passedOver.key, "2026-09-18", "the nearest REAL alternative is named instead");
  const note = expiryChoiceNote(c);
  assert.ok(note.includes("2026-09-18") && note.includes("19 of 23"), "and it is the one in the sentence");
  assert.ok(!note.includes("2026-09-04"), "the settling board is not named at all");
  assert.ok(!note.includes("0 days out"), "nor is its DTE");
});

test("a board with ONE day left is the same non-choice", () => {
  // Expiry-day open interest does not vanish at midnight, so the cut is at 1,
  // not at 0. With nothing else under the floor there is no sentence to print.
  const c = expiryChoice([{ key: "tomorrow", dte: 1, clears: 40, near: 44 },
                          { key: "2026-10-16", dte: 42, clears: 9, near: 12 }]);
  assert.equal(c.chosen.key, "2026-10-16");
  assert.equal(c.passedOver, null, "a board with hours left is not an alternative");
  assert.ok(!expiryChoiceNote(c).includes("passed over"));
});

test("a year-out board does not win on volume alone", () => {
  const c = expiryChoice([...BOIL_BOARD, { key: "2027-06-18", dte: 288, clears: 40, near: 44 }]);
  assert.equal(c.chosen.key, "2026-11-20", "past the horizon it is a different trade, not a better one");
});

test("UNKNOWN OPEN INTEREST RANKS ON DTE, and is never read as an empty board", () => {
  // `Number(null)` is 0 and 0 is finite: coercing first would rank every expiry
  // the feed has not reported LAST, which is exactly backwards.
  const c = expiryChoice([{ key: "A", dte: 33, clears: null, near: null },
                          { key: "B", dte: 46, clears: null, near: null }]);
  assert.equal(c.measured, false, "nothing was measured");
  assert.equal(c.chosen.key, "B", "so it falls back to distance from the target DTE");
  assert.ok(expiryChoiceNote(c).includes("not known yet"));
});

test("a REAL zero is still a real zero", () => {
  const c = expiryChoice([{ key: "X", dte: 35, clears: 0, near: 7 }, { key: "Y", dte: 48, clears: 5, near: 9 }]);
  assert.equal(c.measured, true);
  assert.equal(c.chosen.key, "Y");
});

test("an empty list NAMES THE EXPIRY it emptied", () => {
  // Radar said 4 cleared at 28 DTE while the Shortlist said none at 35 DTE.
  // Both were true, and on screen it read as a contradiction.
  const note = emptyExpiryNote("2026-10-09", { liquidity: 3, spread: 1, reward: 0 });
  assert.ok(note.includes("2026-10-09"), "the expiry is in the sentence");
  assert.ok(note.includes("3 for liquidity") && note.includes("1 for a bid/ask spread"));
  assert.ok(note.includes("another expiry"), "and it says the verdict is about this board only");
});

test("with no expiry past the entry floor the answer is nothing, not a bad expiry", () => {
  const c = expiryChoice([{ key: "soon", dte: 9, clears: 40, near: 44 }]);
  assert.equal(c.chosen, null);
  assert.ok(expiryChoiceNote(c).includes(String(RULES.minEntryDTE)));
});

/* ============================================================================
   TASK 6 — ONE ROUNDING, ONE FUNCTION, AND A SIGN WHERE THE SIGN IS THE POINT.
   ========================================================================= */

test("ONE PROBABILITY, ONE ROUNDING: the percent and the phrase cannot disagree", () => {
  // One spread read 44%, 45% and "5 times in 10" across three screens.
  for (const p of [0.44, 0.449, 0.75, 0.5, 0.03, 1]) {
    const pc = chancePct(p);
    assert.equal(chanceText(p), `${pc}%`);
    assert.equal(chanceInTen(p), `${Math.round(pc / 10)} time${Math.round(pc / 10) === 1 ? "" : "s"} in 10`,
      "the phrase is derived from the percent, not rounded a second time");
  }
});

test("a missing probability is a dash, never a confident 0%", () => {
  for (const p of [null, undefined, NaN, ""]) {
    assert.equal(chancePct(p), null);
    assert.equal(chanceText(p), "\u2014");
    assert.equal(chanceInTen(p), "\u2014");
  }
  assert.equal(chanceText(0), "0%", "but a real zero is a real zero");
});

test("THETA AND VEGA ALWAYS CARRY A SIGN — a rate of change is not a price", () => {
  // Theta printed "$3" on a long debit spread where the holder LOSES it daily.
  assert.equal(signedMoney(-3.4), "-$3");
  assert.equal(signedMoney(3.4), "+$3");
  assert.equal(money(-3.4), "-$3", "money() is unchanged: a price does not need a plus");
});

test("vega is not rounded away to a $0 it does not mean", () => {
  // "$0" on a 35-day spread reads as "volatility does not move this", which is
  // a claim, and a false one.
  assert.notEqual(signedMoney(0.004), "$0");
  assert.ok(signedMoney(0.004).includes("0.004"));
  assert.equal(signedMoney(0), "$0", "an exact zero IS the number");
  assert.equal(signedMoney(null), "\u2014", "and an absent one is still a dash");
});

/* ============================================================================
   TASK 5 — EVERY SOURCE HAS ITS OWN BUDGET, AND ITS AGE IS ON SCREEN.
   ========================================================================= */

test("the budgets are ordered the way the data actually moves", () => {
  assert.ok(BUDGETS.chain.ttlMs < BUDGETS.bars.ttlMs, "quotes move faster than daily bars");
  assert.ok(BUDGETS.bars.ttlMs < BUDGETS.openInterest.ttlMs, "which move faster than a session's close");
  assert.ok(BUDGETS.openInterest.ttlMs < BUDGETS.seasonal.ttlMs, "which moves faster than monthly history");
});

test("NEVER LOADED is stale — the caller's question is whether to fetch", () => {
  assert.equal(isStale("chain", null), true);
  assert.equal(isStale("chain", Date.now()), false);
  assert.equal(isStale("chain", Date.now() - 10 * 60 * 1000), true);
  // ...but it is not the same as OLD, and the sentence must not invent an age.
  assert.ok(freshnessNote("seasonal", null).includes("not loaded yet"));
  assert.ok(!/\d+ day/.test(freshnessNote("seasonal", null)));
});

test("ONLY WHAT EXPIRED IS REFETCHED — the quota is 25 calls a day", () => {
  const now = Date.now();
  const stale = staleAmong(["chain", "openInterest", "seasonal"], {
    chain: now - 10 * 60 * 1000,          // past its five minutes
    openInterest: now - 60 * 60 * 1000,   // an hour old, and it changed last night
    seasonal: now - 24 * 60 * 60 * 1000,  // a day old, inside a seven-day budget
  }, now);
  assert.deepEqual(stale, ["chain"], "one call, not three");
});

test("an age is spoken in the unit that suits its source", () => {
  assert.equal(agePhrase(30 * 1000, "minutes"), "just now");
  assert.equal(agePhrase(4 * 60 * 1000, "minutes"), "4 minutes");
  assert.equal(agePhrase(3 * 24 * 3600 * 1000, "days"), "3 days");
  assert.equal(agePhrase(24 * 3600 * 1000, "days"), "1 day", "never \"1 days\"");
});

test("a number past its budget SAYS SO rather than looking live", () => {
  const fresh = freshnessNote("chain", Date.now() - 60 * 1000);
  const old = freshnessNote("chain", Date.now() - 20 * 60 * 1000);
  assert.ok(!/past the/.test(fresh));
  assert.ok(/past the/.test(old), "a stale number pretending to be live is the fault");
  assert.ok(old.includes("refreshed"));
});

/* ============================================================================
   A PRICE HAS TO SURVIVE A SANITY CHECK, NOT JUST A FLOOR (src/rules.js,
   `modelSanity`). The fixture IS the order that reached the broker on
   17 September 2026: BOIL 2026-10-23, buy 20C / sell 21C, spot 19.84, 36 days
   out, limit $0.05 — exactly MIN_NET_DOLLARS, one cent above the floor built
   to catch the $0 butterfly, against a model value of $33.29.
============================================================================ */

const BOIL_SPREAD = [
  { side: 1, qty: 1, type: "call", strike: 20 },
  { side: -1, qty: 1, type: "call", strike: 21 },
];
const BOIL = { spot: 19.84, dte: 36, iv: SIGMA.BOIL };

test("MODEL SANITY — the live order that never filled is refused, by name and by the numbers", () => {
  const r = modelSanity({ legs: BOIL_SPREAD, net: 0.05, marks: [0.40, 0.35], ...BOIL });
  assert.equal(r.checked, true);
  assert.equal(r.pass, false, "$0.05 against a $33 model value is not a price");
  assert.equal(r.marketNet, MIN_NET_DOLLARS, "it cleared the absolute floor exactly");
  assert.ok(Math.abs(r.modelNet - 33.29) < 0.5, `model says ${r.modelNet}`);
  assert.ok(r.ratio < 0.2 && r.ratio > 0.1, `ratio ${r.ratio}`);
  // RULE 3: it names the leg, because "the price is wrong" is not actionable.
  assert.ok(r.worstLeg, "a leg is named");
  assert.equal(r.worstLeg.name, "20C");
  assert.match(r.reason, /20C/);
  assert.match(r.reason, /6\.7 times less/);
});

test("MODEL SANITY — the same structure at its model value passes untouched", () => {
  const honest = netBS(BOIL_SPREAD, BOIL.spot, BOIL.dte, BOIL.iv);
  const r = modelSanity({ legs: BOIL_SPREAD, net: honest, marks: [2.33, 2.00], ...BOIL });
  assert.equal(r.pass, true);
  assert.ok(Math.abs(r.ratio - 1) < 0.01, "a real structure sits at 1");
  assert.equal(r.reason, null, "nothing to say about a price that is the price");
});

test("MODEL SANITY — the bar is symmetric: too expensive is refused as well as too cheap", () => {
  const honest = netBS(BOIL_SPREAD, BOIL.spot, BOIL.dte, BOIL.iv);
  const rich = modelSanity({ legs: BOIL_SPREAD, net: honest * (RULES.modelDisagreementRatio + 1), ...BOIL });
  assert.equal(rich.pass, false);
  assert.match(rich.reason, /times more/);
  // ...and exactly AT the bar is inside it, either way round.
  for (const m of [RULES.modelDisagreementRatio, 1 / RULES.modelDisagreementRatio]) {
    const edge = modelSanity({ legs: BOIL_SPREAD, net: honest * m, ...BOIL });
    assert.equal(edge.pass, true, `exactly ${m}x is not beyond ${RULES.modelDisagreementRatio}x`);
  }
});

test("MODEL SANITY — UNKNOWN IS NOT DISAGREEMENT: no model means SKIPPED, never failed", () => {
  // The same rule the liquidity half applies to `oi: null` and the spread half
  // to a one-sided quote. `Number(null)` is 0 and 0 is finite, which would
  // price the whole board at a spot of zero and refuse all of it.
  for (const missing of [{ spot: null }, { dte: null }, { iv: null }, { spot: 0 }, { iv: 0 }]) {
    const r = modelSanity({ legs: BOIL_SPREAD, net: 0.05, ...BOIL, ...missing });
    assert.equal(r.checked, false, `${JSON.stringify(missing)} skips`);
    assert.equal(r.pass, true, "skipped is not failed");
    assert.equal(r.reason, null);
  }
  assert.equal(modelSanity({ legs: [], net: 0.05, ...BOIL }).checked, false, "no legs, nothing to judge");
  assert.equal(modelSanity({ legs: BOIL_SPREAD, net: null, ...BOIL }).checked, false, "no net, nothing to judge");
});

test("MODEL SANITY — nothing is judged against a price under the minimum, either side", () => {
  // A model net of pennies is not a valuation. This is the same discipline as
  // `rewardRisk()` refusing to divide by a cost under the minimum, and it is
  // where the measured error budget blows out from 0.27 to 0.11.
  const far = [{ side: 1, qty: 1, type: "call", strike: 60 }, { side: -1, qty: 1, type: "call", strike: 61 }];
  const r = modelSanity({ legs: far, net: 0.05, ...BOIL });
  assert.equal(r.checked, false, "a model value of about nothing judges nothing");
  assert.equal(r.pass, true);
  assert.equal(modelSanity({ legs: BOIL_SPREAD, net: 0.0001, ...BOIL }).checked, false,
    "and a market net under the minimum is priceability()'s refusal, not this one's");
});

test("MODEL SANITY — the bar tolerates every artefact the app's own model can produce", () => {
  // THE MEASUREMENT BEHIND `RULES.modelDisagreementRatio`. The denominator is
  // Black-Scholes at a hardcoded per-ticker sigma, so the bar cannot be tighter
  // than that model's own error. Reprice every family on every market with the
  // volatility deliberately wrong by anything up to a factor of two: nothing
  // that is really worth what the model says may be refused.
  const U = { CORN: 19, SOYB: 22.5, WEAT: 5.4, UNG: 10.6, BOIL: 19.8 };
  const step = 0.5;
  let checked = 0;
  for (const [tk, S] of Object.entries(U)) {
    const iv = SIGMA[tk];
    for (const dte of [30, 45, 90]) {
      for (const off of [-2, 0, 2]) {
        const k = Math.round((S + off * step) / step) * step;
        const fams = [
          [{ side: 1, qty: 1, type: "call", strike: k }, { side: -1, qty: 1, type: "call", strike: k + step }],
          [{ side: 1, qty: 1, type: "put", strike: k }, { side: -1, qty: 1, type: "put", strike: k - step }],
          [{ side: 1, qty: 1, type: "call", strike: k - step }, { side: -1, qty: 2, type: "call", strike: k }, { side: 1, qty: 1, type: "call", strike: k + step }],
        ];
        for (const legs of fams) {
          for (const m of [0.5, 0.75, 1, 1.5, 2]) {
            const real = netBS(legs, S, dte, iv * m);
            const r = modelSanity({ legs, net: real, spot: S, dte, iv });
            if (!r.checked) continue;        // under the minimum: not judged, by rule 2
            checked++;
            assert.equal(r.pass, true,
              `${tk} ${dte}d iv x${m} would be refused at ratio ${r.ratio && r.ratio.toFixed(2)}`);
          }
        }
      }
    }
  }
  assert.ok(checked > 100, `the sweep has to actually judge things (${checked})`);
});

test("MODEL SANITY — its refusal is a finished sentence with its own count", () => {
  const note = modelDisagreementNote(3, "BOIL");
  assert.match(note, /3 structures/);
  assert.match(note, /BOIL/);
  assert.match(note, new RegExp(`${RULES.modelDisagreementRatio}x`));
  assert.match(NOTHING_TODAY.modelDisagreement({ modelDisagreement: 2, markets: ["BOIL"] }),
    new RegExp(`${RULES.modelDisagreementRatio}x`));
  // It is a DIFFERENT sentence from the other four refusals, not a rewording.
  const others = [
    NOTHING_TODAY.unpriceable({ unpriceable: 2, markets: ["BOIL"] }),
    NOTHING_TODAY.impossibleLoss({ impossible: 2, markets: ["BOIL"] }),
  ];
  for (const o of others) {
    assert.notEqual(o, NOTHING_TODAY.modelDisagreement({ modelDisagreement: 2, markets: ["BOIL"] }));
  }
});

/** The source of a file with its COMMENTS REMOVED, for structural tests that
 *  must not be satisfied by a sentence in a comment. This matters: the previous
 *  version of the test below counted `modelSanity(` across the whole of App.jsx
 *  and was green on two PROSE mentions and one real call, which is exactly the
 *  fault it was written to catch. These files are heavily commented and the
 *  comments name the functions they explain. */
const codeOf = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments, including the long ones
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");   // line comments, but not "https://"

test("MODEL SANITY — IT IS A PROPOSAL FLOOR AND IT IS NOT IN THE GATE", () => {
  // A trade the user builds by hand on the desk is his to make. The gate's job
  // is "is there a price at all"; this one's is "is it this structure's price".
  const src = readFileSync(new URL("./riskGate.js", import.meta.url), "utf8");
  assert.equal(/modelSanity/.test(src), false,
    "the model check must never become a reason an order is refused");
});

test("MODEL SANITY — ONE EXPRESSION, and the ticket does not run a second one", () => {
  // ROADMAP P0 left this open: `ComboBookPanel` in pro.jsx called
  // `modelSanity()` on every render of the ticket, which made it a SECOND
  // consumer of `analyze()`'s per-leg marks with a different spelling — the
  // Shortlist passed the model's own price for an unquoted leg, the ticket
  // passed null. `modelCheckOf()` in App.jsx is now the only spelling.
  const app = codeOf("App.jsx");
  assert.equal((app.match(/modelSanity\(/g) || []).length, 1,
    "modelSanity is called in exactly one place in App.jsx: inside modelCheckOf");
  const uses = (app.match(/modelCheckOf\(/g) || []).length;
  assert.ok(uses >= 4,
    `all three generation sites and the ticket's memo read it (found ${uses})`);
  const pro = codeOf("pro.jsx");
  assert.equal((pro.match(/modelSanity\(/g) || []).length, 0,
    "the order ticket takes the verdict as a prop, it does not compute one");
});

/* ============================================================================
   ONE CHANCE, ONE ARITHMETIC (PR #25, ROADMAP P1).

   The app computed "the chance of profit" FOUR ways, and the real difference
   between them was the drift: a Monte Carlo on the app's seasonal means, a
   closed form in engine.js at a risk-neutral 0.045, a second closed form in
   pro.jsx at the same 0.045, and a band integration at a drift of zero. The
   owner's decision is that the Monte Carlo is the single truth.

   What is held below is the STRUCTURE of that decision — one spelling, one run
   count, no closed form left to print. The arithmetic is held in
   `engine.test.js` and the agreement between screens in `ceiling.test.jsx`,
   against the real generation sites.
============================================================================ */

test("ONE CHANCE — `chanceOf` is spelled once in App.jsx and nowhere in pro.jsx", () => {
  // The same discipline as `modelSanity` above and for the same reason: two
  // call sites are two chances to pass a different argument, and the whole
  // point of the change is that one position has one number.
  const app = codeOf("App.jsx");
  assert.equal((app.match(/chanceOf\(/g) || []).length, 1,
    "chanceOf is called in exactly one place in App.jsx: inside chanceCheckOf");
  const uses = (app.match(/chanceFor\(/g) || []).length;
  assert.ok(uses >= 5,
    `the Radar, the Shortlist, Build, the record and the Guardian all read it (found ${uses})`);
  const pro = codeOf("pro.jsx");
  assert.equal((pro.match(/chanceOf\(/g) || []).length, 0,
    "the Guardian takes the chance as a prop, it does not compute one");
});

test("ONE CHANCE — no closed form survives anywhere for a screen to print", () => {
  // `probProfit` was the name both of them went under. A faster approximation
  // kept beside the truth is a second number waiting for a screen to reach for
  // it, so neither is kept.
  for (const f of ["engine.js", "App.jsx", "pro.jsx", "visuals.jsx", "wizard.jsx",
    "../netlify/functions/autopilot.mjs"]) {
    assert.equal(/probProfit/.test(codeOf(f)), false, `${f} still carries a closed-form chance`);
  }
});

test("ONE CHANCE — one run count, so ranking and printing cannot disagree", () => {
  // THE TRAP THIS EXISTS FOR. The Shortlist prices and ranks many candidates
  // and prints the chance of each one; a cheaper run count for ranking than for
  // printing would mean the row you compared and the row you opened disagreeing
  // about the same trade. The decision is ONE count for both, and the cost of
  // it is measured in the comment beside `RULES.mcRuns`.
  assert.equal(typeof RULES.mcRuns, "number");
  assert.ok(RULES.mcRuns >= 1000, "a run count this low would be visible at the whole percent printed");
  // `chanceOf` is the only entry point and it reads the home; nothing else in
  // the app may hand `terminalMC` a run count of its own.
  const rules = codeOf("rules.js");
  assert.equal((rules.match(/terminalMC\(/g) || []).length, 1,
    "terminalMC is called in exactly one place: inside chanceOf");
  for (const f of ["App.jsx", "pro.jsx", "visuals.jsx", "wizard.jsx", "../netlify/functions/autopilot.mjs"]) {
    assert.equal(/terminalMC/.test(codeOf(f)), false, `${f} runs its own simulation`);
  }
});

test("ONE CHANCE — unknown is not a number, at every missing input", () => {
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const ok = { legs, entryNet: 0.4, spot: 20, iv: 0.85, dte: 45,
    seasonal: seasonalProvenance({ monthlyMean: Array(12).fill(1), years: 11, at: Date.now() }, null, "BOIL"),
    month: 8, ticker: "BOIL", expKey: "2026-11-06" };
  assert.ok(chanceOf(ok).pop > 0, "the fixture itself has to work");
  for (const missing of [{ spot: null }, { spot: 0 }, { dte: null }, { dte: 0 },
    { entryNet: null }, { legs: [] }, { legs: null }, { month: null },
    // NO TABLE AT ALL IS NOT A DRIFT OF ZERO. `seasonalProvenance(null, null)`
    // is `missing`, and a missing reading is a dash on screen, never a
    // confident claim that the market goes nowhere.
    { seasonal: seasonalProvenance(null, null, "BOIL") }]) {
    assert.equal(chanceOf({ ...ok, ...missing }), null,
      `a missing ${Object.keys(missing)[0]} must be null, never a confident 0%`);
  }
  // A MISSING IMPLIED VOLATILITY IS THE ONE THAT IS NOT NULL, and deliberately:
  // `ivProvenance()` has a named fallback for it and says so on screen, exactly
  // as `sigmaProvenance()` does for the simulator's volatility.
  const noIV = chanceOf({ ...ok, iv: null });
  assert.equal(noIV.sigma, RULES.fallbackIV);
  assert.ok(noIV.ivNote.includes("FALLBACK"), "and it says so");
});

test("ONE SEASONAL SOURCE — no call site may drift a chance without provenance", () => {
  /* THE SHAPE GUARD, in the register of the rule-literal sweep above.

     `chanceOf()` used to take twelve monthly means and nothing else, so a call
     site could hand it `SEASONAL[pos.ticker]` — the HAND-WRITTEN table — and
     the number came back indistinguishable from one drifted on measured
     prices. That is exactly what `autopilot.mjs` did for four pull requests
     while App.jsx read measured means, and neither side said so. On CORN one
     corrected cell is worth 18.8 percentage points and the sign of the EV.

     Two halves, because a runtime throw and a source sweep catch different
     mistakes: the throw catches the call that runs, the sweep catches the call
     written today that only runs on a market nobody demos. */

  // 1) A BARE ROW THROWS. Not null — a missing INPUT is a dash on screen, a
  //    missing PROVENANCE is a call site printing a number nobody can trace.
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const base = { legs, entryNet: 0.4, spot: 20, iv: 0.85, dte: 45, month: 8, ticker: "CORN", expKey: "2026-11-06" };
  for (const wrong of [Array(12).fill(1), null, undefined, "measured", 0.25, { monthlyMean: Array(12).fill(1) }]) {
    assert.throws(() => chanceOf({ ...base, seasonal: wrong }), /seasonalProvenance/,
      `chanceOf must refuse ${JSON.stringify(wrong)} as a drift`);
  }
  // ...and the legitimate shape does not throw.
  assert.ok(chanceOf({ ...base, seasonal: seasonalProvenance(null, Array(12).fill(1), "CORN") }).pop > 0);

  // 2) NO CALL SITE HANDS A SEASONAL ROW WHERE THE PROVENANCE GOES. Read off
  //    the CALL rather than off the file, because `monthlyMean:` is legitimate
  //    where the hand-written row is DEFINED — the `UNDERLYINGS` table in
  //    App.jsx is its one honest home — and illegitimate only where a chance is
  //    being asked for. Comments are stripped by `codeOf`, so the prose
  //    explaining the deletion cannot satisfy or fail this.
  const CHANCE_CALL = /(chanceOf|chanceCheckOf|chanceFor)\s*\(/g;
  for (const f of ["App.jsx", "pro.jsx", "wizard.jsx", "visuals.jsx", "rules.js",
    "../netlify/functions/autopilot.mjs", "../netlify/functions/approve.mjs"]) {
    const code = codeOf(f);
    // A per-ticker LOOKUP into a seasonal table is never an argument name; the
    // table's own definition (`monthlyMean: SEASONAL.CORN`) is, and stays.
    assert.equal(/monthlyMean:\s*(SEASONAL\[|getU\(|seasonal\[|SEASONAL\.\w+ *\|\|)/.test(code), false,
      `${f} hands a raw seasonal row where a seasonalProvenance() result belongs`);
    assert.equal(/seasonal:\s*(SEASONAL|getU\()/.test(code), false,
      `${f} passes a bare seasonal table straight in as the drift`);
    // ...and the arguments of every chance call are read directly.
    for (const m of code.matchAll(CHANCE_CALL)) {
      const args = code.slice(m.index, m.index + 400);
      assert.equal(/monthlyMean/.test(args), false,
        `${f}: a chance is asked for with monthly means instead of a provenance`);
    }
  }

  // 3) THE PROVENANCE IS DECIDED IN ONE HOME, and the two consumers read it
  //    rather than each deciding for themselves.
  const rules = codeOf("rules.js");
  assert.equal((rules.match(/export function seasonalProvenance\(/g) || []).length, 1,
    "seasonalProvenance has exactly one definition, in rules.js");
  for (const f of ["App.jsx", "../netlify/functions/autopilot.mjs"]) {
    assert.ok(/seasonalProvenance\(/.test(codeOf(f)), `${f} must read the one home`);
  }
});

/* ============================================================================
   ...AND THE SAME SHAPE GUARD FOR THE REALISED VOLATILITY (PR #27, PRD §4k).

   `exitSim` and `exitPathSim` took a bare sigma, and the two call sites read it
   from two different places: `App.jsx` from `seasonal[tk]?.sigma ||
   getU(tk).sigma` (measured, falling back to the hand-written row) and
   `autopilot.mjs` from `SIGMA[pos.ticker]` with no measured value available to
   it at all. One position, two volatilities, and pTP, pSL, pTimePos, ev and
   medDays all move with the difference.

   The throw in the two simulators catches the call that RUNS. This catches the
   call written today that only runs on a market nobody demos — the same pair of
   defences `chanceOf()` and the seasonal sweep above keep.
============================================================================ */

test("SHAPE — no call site hands a simulator a bare SIGMA lookup", () => {
  const SIM_CALL = /(exitSim|exitPathSim)\s*\(/g;
  // What a bare lookup looks like in this codebase, in the shapes it takes.
  const BARE = [
    /SIGMA\s*\[/,                    // SIGMA[pos.ticker]
    /\bSIGMA\.\w+/,                  // SIGMA.BOIL
    /getU\([^)]*\)\.sigma/,          // getU(tk).sigma
    /seasonal\s*\[[^\]]*\]\s*\??\.sigma/, // seasonal[tk]?.sigma
    /\bvol\.sigma\b/,                // the provenance unwrapped at the call
    /\bsigma:\s*\d/,                 // a literal passed as the volatility
  ];
  for (const f of ["App.jsx", "pro.jsx", "wizard.jsx", "engine.js", "rules.js",
    "../netlify/functions/autopilot.mjs", "../netlify/functions/approve.mjs"]) {
    const code = codeOf(f);
    for (const m of code.matchAll(SIM_CALL)) {
      // The DEFINITIONS match this too; they are the one place the argument is
      // named rather than passed, and they are what does the refusing.
      const head = code.slice(Math.max(0, m.index - 20), m.index);
      if (/(function|export function)\s*$/.test(head)) continue;
      const args = code.slice(m.index, m.index + 220);
      for (const bad of BARE) {
        assert.equal(bad.test(args), false,
          `${f}: a simulator is handed a volatility with no source attached — ${args.slice(0, 120)}`);
      }
    }
  }
});

test("SHAPE — exitSim REFUSES a bare sigma at run time, not only in a sweep", () => {
  const pos = { legs: [{ side: 1, type: "call", strike: 20, qty: 1 },
    { side: -1, type: "call", strike: 22, qty: 1 }], entryNet: 0.6, maxProfit: 140, maxLoss: -60 };
  const policy = { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct, stopLossPct: RULES.stopLossPct };
  // `exitPathSim` lives in pro.jsx, which this plain-node suite cannot import;
  // the same assertion about it is in `ceiling.test.jsx`, which is bundled.
  assert.throws(() => exitSim(pos, 20, 45, 0.3, SIGMA.CORN, policy, 5), /sigmaProvenance/);
  const vol = sigmaProvenance(null, SIGMA.CORN, "CORN");
  assert.equal(exitSim(pos, 20, 45, 0.3, vol, policy, 5).sigmaSource, TABLE_SIGMA_SOURCE);
});

test("SHAPE — sigmaProvenance has ONE definition, and both consumers read it", () => {
  const rules2 = codeOf("rules.js");
  assert.equal((rules2.match(/export function sigmaProvenance\(/g) || []).length, 1,
    "sigmaProvenance has exactly one definition, in rules.js");
  for (const f of ["App.jsx", "../netlify/functions/autopilot.mjs"]) {
    assert.ok(/sigmaProvenance\(/.test(codeOf(f)), `${f} must read the one home`);
  }
  // The `||` that made a decision with no source attached is gone for good.
  assert.equal(/seasonal\s*\[[^\]]*\]\s*\??\.sigma\s*\|\|/.test(codeOf("App.jsx")), false,
    "App.jsx no longer picks a volatility with a bare fallback");
});

test("SHAPE — the realised fallback and the implied one are still two constants", () => {
  // They are the same number today and merging them would make a correction to
  // either silently move the other: one is what the SHARE is walked at, the
  // other what the OPTIONS are priced at. PR #27 adds a third SOURCE to the
  // realised one and must not have touched this.
  assert.equal(RULES.fallbackSigma, 0.25, "unchanged in value");
  assert.equal(RULES.fallbackIV, RULES.fallbackSigma);
  const rules3 = readFileSync(new URL("./rules.js", import.meta.url), "utf8");
  assert.ok(/fallbackSigma:/.test(rules3) && /fallbackIV:/.test(rules3), "two entries in RULES");
  assert.ok(/0\.25 IS CHOSEN, NOT MEASURED/.test(rules3),
    "and the realised fallback still says it was chosen rather than measured");
  // The hand-written table itself is untouched: this PR changes where the
  // volatility comes from, never what the typed row contains.
  assert.deepEqual(SIGMA, { SOYB: 0.19, CORN: 0.22, UNG: 0.48, BOIL: 0.95, WEAT: 0.25, SPY: 0.16 });
});

test("ONE SEASONAL SOURCE — measured and hand-written print DIFFERENT sentences", () => {
  // The whole point. Two markets, two tables, two numbers of the same name: if
  // the sentence beside them is the same string, nothing on screen distinguishes
  // a measurement from a guess.
  const row = Array(12).fill(1);
  const meas = seasonalProvenance({ monthlyMean: row, years: 11, at: Date.now() - 3 * 86400000 }, row, "CORN");
  const hand = seasonalProvenance(null, row, "CORN");
  assert.equal(meas.source, MEASURED_SEASONAL_SOURCE);
  assert.equal(hand.source, ESTIMATED_SEASONAL_SOURCE);
  assert.notEqual(meas.note, hand.note, "one sentence for two sources is no sentence at all");
  assert.ok(/MEASURED/.test(meas.note) && /11 years/.test(meas.note) && /3 days ago/.test(meas.note), meas.note);
  assert.ok(/HAND-WRITTEN/.test(hand.note), hand.note);
  // AGE IS NEVER INVENTED. A reading with no timestamp does not read as today's.
  const undated = seasonalProvenance({ monthlyMean: row, years: 11 }, row, "CORN");
  assert.equal(undated.ageDays, null);
  assert.equal(/read today/.test(undated.note), false, undated.note);

  // AND THE ABSENCE OF A STAMP IS THE MARKER, as with `contractsAssumed`.
  assert.equal(seasonalStampOf({}).source, ESTIMATED_SEASONAL_SOURCE);
  assert.equal(seasonalStampOf({}).stamped, false);
  assert.equal(seasonalStampOf({ seasonalSource: MEASURED_SEASONAL_SOURCE, seasonalYears: 11 }).measured, true);
  // `Number(null)` is 0 and 0 is finite: a record with no year count must never
  // read as zero years of history.
  assert.equal(seasonalStampOf({ seasonalSource: MEASURED_SEASONAL_SOURCE }).years, null);
  assert.equal(/0 years/.test(seasonalSourceSentence({ measured: true, ticker: "CORN" })), false);
});

test("ONE CHANCE — the seed is the TRADE's, so it moves when the trade moves", () => {
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const base = { ticker: "BOIL", expKey: "2026-11-06", legs, spot: 21.23, dte: 45 };
  assert.equal(chanceSeedKey(base), chanceSeedKey({ ...base }), "same trade, same key");
  // A price wobbling in the third decimal between two renders must not re-roll
  // the simulation under the reader; a different strike or expiry must.
  assert.equal(chanceSeedKey({ ...base, spot: 21.2301 }), chanceSeedKey(base));
  assert.notEqual(chanceSeedKey({ ...base, spot: 21.25 }), chanceSeedKey(base));
  assert.notEqual(chanceSeedKey({ ...base, expKey: "2026-12-04" }), chanceSeedKey(base));
  assert.notEqual(chanceSeedKey({ ...base, ticker: "UNG" }), chanceSeedKey(base));
  assert.notEqual(chanceSeedKey({ ...base, dte: 46 }), chanceSeedKey(base));
  assert.notEqual(
    chanceSeedKey({ ...base, legs: [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 22, qty: 1 }] }),
    chanceSeedKey(base));
});

/* ============================================================================
   THREE NUMBERS THAT HAD NO HOME (PR #24 found them and left them deliberately).
   No value changed here — a rename that moves a number is two changes wearing
   one coat — but all three read `RULES` now, and two exclusions the sweep above
   carried because of them are gone.
============================================================================ */

test("HOMES — the watch level, the autopilot bar and the IV fallback are in RULES", () => {
  assert.equal(RULES.watchAttentionShare, 0.35, "unchanged in value, as the owner decided");
  assert.equal(RULES.autopilotConfidence, 70, "unchanged in value");
  assert.equal(RULES.fallbackIV, 0.25, "unchanged in value");
  // AND THE TWO COLLISIONS ARE NOW HARMLESS RATHER THAN HIDDEN. These pairs are
  // the reason two files could not be swept for rule literals at all.
  assert.equal(RULES.watchAttentionShare, RULES.maxSpreadShareOfMid,
    "the collision is real and stays: what changed is that both have a home");
  assert.equal(RULES.autopilotConfidence, RULES.expensiveIVRank);
  assert.equal(RULES.fallbackIV, RULES.fallbackSigma,
    "the same number and DELIBERATELY two constants: one is realised, one implied");
});

test("HOMES — the watch level reads its home and is a signed level, not a share", () => {
  // `maxLoss` is negative, so the level is negative with it: a position is
  // "watch" when its P&L is BELOW this.
  assert.ok(watchAttentionLevel(-100) < 0);
  assert.equal(watchAttentionLevel(-100), RULES.watchAttentionShare * -100);
  // An unknown maximum loss has no share to take, and null is not a level of 0
  // — which would mark every losing position at a cent down.
  assert.equal(watchAttentionLevel(null), null);
  assert.equal(watchAttentionLevel(undefined), null);
  const app = codeOf("App.jsx");
  assert.ok(/watchAttentionLevel\(/.test(app), "App.jsx reads the home");
});

test("HOMES — the autopilot's confidence bar is read from RULES by signals.js", () => {
  const src = codeOf("signals.js");
  assert.ok(/RULES\.autopilotConfidence/.test(src), "signals.js reads the home");
  // The two generated sentences quote the constant rather than a typed 70.
  // And no sentence in the file types the number out any more.
  assert.equal(/the 70-confidence bar|not the 70 the autopilot/.test(readFileSync(new URL("./signals.js", import.meta.url), "utf8")),
    false, "the bar is quoted from the constant, not typed into the sentence");
});

test("HOMES — ivProvenance names which of three sources produced the volatility", () => {
  const chain = ivProvenance(0.42, 0.31, "BOIL");
  assert.equal(chain.iv, 0.42);
  assert.equal(chain.source, CHAIN_IV_SOURCE);
  assert.equal(chain.fromFallback, false);
  const thesis = ivProvenance(null, 0.31, "BOIL");
  assert.equal(thesis.iv, 0.31);
  assert.equal(thesis.source, THESIS_IV_SOURCE);
  assert.ok(thesis.note.includes("when this position was opened"));
  const none = ivProvenance(null, null, "BOIL");
  assert.equal(none.iv, RULES.fallbackIV);
  assert.equal(none.source, FALLBACK_IV_SOURCE);
  assert.equal(none.fromFallback, true);
  assert.ok(none.note.includes("FALLBACK"), "the fallback sentence is not a quiet one");
  assert.ok(none.note.includes("BOIL"), "and it names the market it could not read");
  // A zero or a negative is not a volatility: it is a missing one.
  assert.equal(ivProvenance(0, null).iv, RULES.fallbackIV);
  assert.equal(ivProvenance(-0.3, null).iv, RULES.fallbackIV);
});

test("HOMES — no bare IV fallback survives in the two files that carried one", () => {
  for (const f of ["pro.jsx", "../netlify/functions/autopilot.mjs"]) {
    const src = codeOf(f);
    assert.ok(/ivProvenance\(/.test(src), `${f} reads the home`);
    assert.equal(/\?\?\s*0\.25|\|\|\s*0\.25/.test(src), false,
      `${f} still falls back to a bare 0.25`);
  }
});

/* ============================================================================
   THE POSITION REMEMBERS ITS SIZE (ROADMAP P1.1 / P1.2).

   MEASURED: `riskGate.js` read `p.contracts` in three places — the 25% total
   exposure ceiling, the dollars a proposal risks, and the stop threshold — and
   NOTHING ANYWHERE EVER WROTE THAT FIELD. `commitPosition()` in App.jsx built
   the record without it, so every open position counted as ONE contract for the
   rest of its life however many were really bought, and the gate on the Build
   screen ran at a hardcoded `contracts: 1` while the ticket below it sized the
   order at `cfg.qty`. A cap that reads the wrong quantity is not a display bug.
============================================================================ */

test("SIZE — total exposure with a seven-lot position is seven times a one-lot one", () => {
  const one = evaluateTrade({
    proposal: trade({ maxLoss: -100 }),
    portfolio: { positions: [{ maxLoss: -100, contracts: 1 }], account: PAPER },
    capital: CAPITAL,
  });
  const seven = evaluateTrade({
    proposal: trade({ maxLoss: -100 }),
    portfolio: { positions: [{ maxLoss: -100, contracts: 7 }], account: PAPER },
    capital: CAPITAL,
  });
  assert.equal(one.limits.openRisk, 100);
  assert.equal(seven.limits.openRisk, 700, "seven lots of a $100 worst case are $700 at risk");
  assert.equal(seven.limits.openRisk, one.limits.openRisk * 7);
});

test("SIZE — the proposal's own risk is the worst case TIMES the quantity", () => {
  // $250 is the binding per-trade cap on $5,000 of capital. One combination of
  // a $60 spread is well inside it; five of them are not.
  const one = evaluateTrade({ proposal: trade({ maxLoss: -60, contracts: 1 }), portfolio: { account: PAPER }, capital: CAPITAL });
  const five = evaluateTrade({ proposal: trade({ maxLoss: -60, contracts: 5 }), portfolio: { account: PAPER }, capital: CAPITAL });
  assert.equal(one.limits.tradeRisk, 60);
  assert.equal(five.limits.tradeRisk, 300);
  assert.equal(one.pass, true, "one combination is inside the cap");
  assert.deepEqual(codes(five), ["PER_TRADE_LIMIT"],
    "five of the same combination is not, and this is the cap that did not hold");
  assert.match(messageFor(five, "PER_TRADE_LIMIT"), /\$300/);
});

test("SIZE — the exposure ceiling counts the book at its real size", () => {
  // $1,250 is 25% of $5,000. Four one-lot $300 positions sit under it; the same
  // four as three-lot positions are $3,600 and are a long way over.
  const small = Array.from({ length: 4 }, () => ({ maxLoss: -300, contracts: 1 }));
  const big = Array.from({ length: 4 }, () => ({ maxLoss: -300, contracts: 3 }));
  const a = evaluateTrade({ proposal: trade({ maxLoss: -50 }), portfolio: { positions: small, account: PAPER }, capital: CAPITAL });
  const b = evaluateTrade({ proposal: trade({ maxLoss: -50 }), portfolio: { positions: big, account: PAPER }, capital: CAPITAL });
  assert.equal(a.limits.openRisk, 1200);
  assert.equal(b.limits.openRisk, 3600);
  assert.equal(codes(a).includes("TOTAL_EXPOSURE"), false);
  assert.deepEqual(codes(b), ["TOTAL_EXPOSURE"]);
});

test("SIZE — the stop threshold scales with the size", () => {
  // Stop at 50% of the maximum loss. On one combination of a −$200 worst case
  // that is −$100; on five it is −$500, and a −$300 P&L is NOT past it.
  const at = (contracts, pnl) => warnCodes(evaluateTrade({
    proposal: trade({ intent: "close", maxLoss: -200, contracts, pnl }),
    portfolio: { account: PAPER }, capital: CAPITAL,
  }));
  assert.ok(at(1, -110).includes("STOP_LOSS_REACHED"), "one lot, past the stop");
  assert.equal(at(5, -300).includes("STOP_LOSS_REACHED"), false,
    "five lots: −$300 is not half of a −$1,000 worst case");
  assert.ok(at(5, -550).includes("STOP_LOSS_REACHED"), "five lots, past the stop");
});

test("SIZE — a legacy position with no size still loads, and is READ AS ONE", () => {
  // Nothing ever wrote `contracts`, so every position saved by an earlier build
  // has none and there is no way to recover it. One is the safe direction to be
  // wrong in: it under-counts exposure rather than over-counting it.
  const legacy = { maxLoss: -400 };                 // exactly what an old record is
  const r = evaluateTrade({
    proposal: trade({ maxLoss: -50 }),
    portfolio: { positions: [legacy], account: PAPER }, capital: CAPITAL,
  });
  assert.equal(r.limits.openRisk, 400, "it loads, and it counts once");
  assert.equal(positionSize(legacy).contracts, 1);
  assert.equal(positionSize(legacy).assumed, true, "and it is marked as assumed");
});

test("SIZE — an ASSUMED one never prints as a MEASURED one", () => {
  assert.equal(positionSize({ contracts: 7 }).assumed, false);
  assert.equal(positionSize({ contracts: 7 }).contracts, 7);
  assert.equal(contractsOf({ contracts: 7 }), 7);
  // A record migrated at hydration carries both the number and the flag, so
  // saving it again cannot launder the assumption into a measurement.
  const migrated = withPositionSize({ maxLoss: -400 });
  assert.equal(migrated.contracts, 1);
  assert.equal(migrated.contractsAssumed, true);
  assert.equal(positionSize(migrated).assumed, true, "still assumed after a round trip");
  assert.match(positionSizeNote(migrated), /assumed, not recorded/);
  assert.match(positionSizeNote({ contracts: 3 }), /^3 contracts$/);
  assert.match(positionSizeNote({ contracts: 1 }), /^1 contract$/);
  // A record that already had a size is left exactly as it was.
  const kept = { contracts: 4, maxLoss: -10 };
  assert.equal(withPositionSize(kept), kept, "nothing is rewritten");
  // Rubbish is read as one, and said to be assumed, rather than crashing.
  for (const junk of [{ contracts: 0 }, { contracts: -3 }, { contracts: "x" }, {}, null]) {
    assert.equal(positionSize(junk).contracts, 1);
    assert.equal(positionSize(junk).assumed, true);
  }
});

test("SIZE — a proposal that passes the gate passes it again at the quantity shown", () => {
  // ROADMAP P1's DONE WHEN. The screen evaluates the trade; the ticket sends it.
  // They have to be the same reading, so the gate is run at the number the order
  // will carry and not at a hardcoded 1.
  const shown = (contracts) => evaluateTrade({
    proposal: trade({ maxLoss: -60, contracts }),
    portfolio: { account: PAPER }, capital: CAPITAL,
  });
  for (const n of [1, 2, 3, 4]) {
    const preview = shown(n);          // what the Build screen prints
    const send = shown(n);             // what the ticket runs before it posts
    assert.equal(preview.pass, send.pass, `×${n}: the two readings agree`);
    assert.equal(preview.limits.tradeRisk, send.limits.tradeRisk);
    assert.equal(preview.limits.tradeRisk, 60 * n, `×${n}: and it is the real number`);
  }
  // And the refusal really is the cap doing its job, not a coincidence.
  assert.equal(shown(4).pass, true, "$240 is inside the $250 cap");
  assert.equal(shown(5).pass, false, "$300 is not");
});

test("SIZE — the gate and the order body are sized by the same number", () => {
  // `orderBody` puts the size in `qty` and the shape in the ratios (GCD rule,
  // PRD §8b). The number it is given is the number the gate measured.
  const legs = [{ side: 1, type: "call", strike: 20, qty: 1 }, { side: -1, type: "call", strike: 21, qty: 1 }];
  const body = orderBody({ legs, occs: ["A", "B"], userQty: 7, type: "limit", limit: 1.4, tif: "day", intent: "open" });
  assert.equal(+body.qty, 7, "seven combinations");
  assert.deepEqual(body.legs.map((l) => +l.ratio_qty), [1, 1], "of a 1:1 shape");
  const g = evaluateTrade({
    proposal: trade({ legs, maxLoss: -30, contracts: +body.qty }),
    portfolio: { account: PAPER }, capital: CAPITAL,
  });
  assert.equal(g.limits.tradeRisk, 210, "and the gate measured all seven");
});

/* ============================================================================
   NO SECOND COPY OF A RULE NUMBER (ROADMAP P0's last inherited debt).

   `App.jsx` carried a bare `REASON_MIN = 15` beside `RULES.minOverrideReasonChars`
   and now reads the constant. The sweep for the rest of that disease found three
   more: the Build screen's default horizon, the wide search's default horizon and
   its fallback, all spelled `45` where `RULES.targetEntryDTE` lives.

   This test cannot prove there is no copy anywhere — a number can be written a
   hundred ways. What it does is refuse the SHAPES a copy actually takes in this
   codebase: a default, an initial state, or a local constant holding a value
   that already has a home.
============================================================================ */

/** Every file that computes a number a screen or a brief prints. Read off the
 *  disk rather than typed out, so a new endpoint or a new module is swept
 *  without anybody coming back here — which is how `engine.js` and the Netlify
 *  functions stayed outside the sweep while the exit simulator held its own
 *  copies of three rules. `rules.js` is the HOME and is excluded by name;
 *  `main.jsx` mounts the app and computes nothing. */
const SWEEP_EXCLUDED = {
  "rules.js": "the HOME: every number in it is the original",
  "main.jsx": "it mounts the app and computes nothing",
  // TWO EXCLUSIONS WITH THEIR REASONS, so they are visible rather than absent.
  // Both are places the matcher would name the WRONG rule, and a guard that
  // says something false about a line is worse than one that misses it.
  "demo.js": "a fixture: `entryDaysAgo: 30` is a fact about a made-up position, not the entry floor",
  // `signals.js` WAS EXCLUDED HERE AND IS NOT ANY MORE. It carried a bare 70 in
  // two generated sentences — "the 70-confidence bar the autopilot needs" —
  // with no home in RULES and a value that collides with `expensiveIVRank`, so
  // pointing the sweep at the file would have named the wrong rule. The bar has
  // its own home now (`RULES.autopilotConfidence`) and the file is swept.
};
const LITERAL_FILES = [
  ...readdirSync(new URL(".", import.meta.url))
    .filter((f) => /\.jsx?$/.test(f) && !/\.test\./.test(f) && !SWEEP_EXCLUDED[f]),
  ...readdirSync(new URL("../netlify/functions", import.meta.url)).map((f) => `../netlify/functions/${f}`),
  ...readdirSync(new URL("../netlify/edge-functions", import.meta.url))
    .filter((f) => f.endsWith(".js")).map((f) => `../netlify/edge-functions/${f}`),
];

/* WHAT A COPY LOOKS LIKE, IN THE THREE SHAPES IT TAKES IN THIS CODEBASE.

   Shapes 1 and 2 — a `useState` default and a property or local constant —
   caught `REASON_MIN = 15` and the three loose `45`s. Shape 3 is the one PR #24
   added, and it is the shape that hid the fault in `exitSim`: a rule number as
   an operand of an arithmetic expression, `dteLeft - 7`, `0.5 * pos.maxProfit`.

   SHAPE 4 IS THIS SESSION'S, AND IT HID IN PLAIN SIGHT FOR THREE PULL REQUESTS.
   `ComparePayoffs()` in visuals.jsx read `dte: shown[0].dte || 45` — a FALLBACK
   OPERAND, where the rule number is neither assigned to a name nor added to
   anything, so shapes 1, 2 and 3 all walk straight past it. PR #24 caught a
   parameter default of 45 in that very file and fixed it; this spelling of the
   same number, four lines away, survived. `||` and `??` both, because they are
   the same sentence about the same number.

   IT STAYS QUIET THE SAME WAY SHAPE 3 DOES: the identifier on the left has to
   carry a RULE WORD, matched on words and not as a substring. `c.dte || 45` is
   a copy; `bins.length || 45` and `RULES.exitDTE ?? 21` are not.

   THE HARD PART OF SHAPE 3 IS NOT FINDING COPIES, IT IS NOT CRYING WOLF. `0.5`
   is in Black-Scholes twice and in every Gaussian, `4` is in every coordinate,
   `30` is how many days are in a month. Four rules keep it quiet, and each one
   is a statement about what a rule number IS:

     * the value must sit beside a RULE-NAMED identifier, matched on the
       identifier's WORDS rather than as a substring — `dteLeft` is about DTE,
       `xToday` is an x coordinate that happens to contain "day";
     * division is not one of the operators. A rule number is compared against
       or applied to a quantity; when something is divided BY it, it is a unit
       (`Math.round(dte / 30)` is days into months, not the entry floor);
     * an operand already anchored at the home — `RULES.targetEntryDTE + 30` —
       is reading the home, whatever is added to it;
     * the cosmetic names keep doing their job, so a `marginTop` is never a rule.

   It still cannot prove a negative: `Math.round(44.9)`, a number inside a
   template string, or a STALE copy of a rule whose value has since changed
   (which is exactly what the bare 7 was) all pass it. The PRD says so. */
const RULE_WORD = /^(dtes?|days?|horizons?|capital|targets?|confidence|reasons?|chars|contracts?|percentile|interest|premiums?|slippage|exposure|entry|exit|override|floors?|profits?|loss(es)?|pct)$/i;
const RULEISH = /(dte|day|horizon|capital|target|confidence|reason|chars|contract|percentile|interest|premium|slippage|exposure|entry|exit|override|floor)/i;
// The name has to be about a RULE, not about a pixel. `max: 40` on a progress
// bar and `minHeight: 40` on a button are not copies of `lowConfidence`.
const COSMETIC = /(height|width|size|weight|radius|spacing|top|left|right|bottom|opacity|index|gap|padding|margin|font|stroke|delay|duration|color)/i;
const identWords = (id) => id.split(/[.[\]]+|(?=[A-Z])/).filter(Boolean);
// NOTE THAT SHAPE 3 DOES NOT USE `COSMETIC`, AND MUST NOT: `dteLeft` is the
// identifier the real fault sat beside, and "left" is in that list as a box
// offset. The ruleish-WORD requirement already keeps the pixels out, because a
// coordinate is not called after a rule — `xToday`, `marginTop`, `barHeight`
// carry no rule word at all.
const ruleNamed = (id) =>
  !id.startsWith("RULES.") && identWords(id).some((w) => RULE_WORD.test(w));

/** Every place `code` spells one of `literals` instead of reading its home.
 *  One entry per site; two rules that share a value (`takeProfitPct` and
 *  `stopLossPct` are both 0.5) are named together on the one hit. */
function ruleLiteralHits(code, literals) {
  const at = new Map();   // index -> { text, names[] }
  const add = (i, text, name) => {
    const cur = at.get(i);
    if (cur) { if (!cur.names.includes(name)) cur.names.push(name); return; }
    at.set(i, { text: text.trim(), names: [name] });
  };
  const OPERAND = "[A-Za-z_$][A-Za-z0-9_$.[\\]]*";
  for (const [name, value] of literals) {
    const v = String(value).replace(".", "\\.");
    // Shape 1 — an initial state: `useState(45)`.
    for (const m of code.matchAll(new RegExp(`useState\\(\\s*${v}\\s*\\)`, "g"))) add(m.index, m[0], name);
    // Shape 2 — a property or a local constant: `dteT: 45`, `REASON_MIN = 15`.
    for (const m of code.matchAll(new RegExp(`\\b[A-Za-z_][A-Za-z0-9_]*\\s*[:=]\\s*${v}\\b(?![.\\d])`, "g"))) {
      const ident = m[0].split(/[:=]/)[0].trim();
      if (RULEISH.test(ident) && !COSMETIC.test(ident)) add(m.index, m[0], name);
    }
    // Shape 3 — an operand of an arithmetic expression: `dteLeft - 7`.
    const arith = new RegExp(
      `(?:(${OPERAND})\\s*([-+*])\\s*${v}\\b(?![.\\d])|(?<![.\\w])${v}\\s*([-+*])\\s*(${OPERAND}))`, "g");
    for (const m of code.matchAll(arith)) if (ruleNamed(m[1] || m[4])) add(m.index, m[0], name);
    // Shape 4 — a FALLBACK operand: `shown[0].dte || 45`, `c.dte ?? 45`. The
    // rule number is not assigned to anything and not added to anything, so
    // none of the three shapes above can see it.
    const fallback = new RegExp(`(${OPERAND})\\s*(?:\\|\\||\\?\\?)\\s*${v}\\b(?![.\\d])`, "g");
    for (const m of code.matchAll(fallback)) if (ruleNamed(m[1])) add(m.index, m[0], name);
  }
  return [...at.entries()].sort((a, b) => a[0] - b[0]).map(([, h]) => h);
}

test("RULES LITERALS — no file that computes a printed number keeps its own copy", () => {
  const RULE_LITERALS = [
    ["targetEntryDTE", RULES.targetEntryDTE],
    ["minEntryDTE", RULES.minEntryDTE],
    ["exitDTE", RULES.exitDTE],
    ["maxEntryDTE", RULES.maxEntryDTE],
    ["minOverrideReasonChars", RULES.minOverrideReasonChars],
    ["lowConfidence", RULES.lowConfidence],
    ["expensiveIVRank", RULES.expensiveIVRank],
    ["suggestedTradingCapital", RULES.suggestedTradingCapital],
    ["suggestedConcurrentTarget", RULES.suggestedConcurrentTarget],
    ["minOpenInterestAbsolute", RULES.minOpenInterestAbsolute],
    ["minPeersForPercentile", RULES.minPeersForPercentile],
    // THE TWO THE EXPRESSION SHAPE WAS ADDED FOR. `0.5` is a common number and
    // these two are the same 0.5, so a hit names both: what the guard can say
    // is that a rule's value is being applied here without reading its home,
    // not which of the two rules the author had in mind.
    ["takeProfitPct", RULES.takeProfitPct],
    ["stopLossPct", RULES.stopLossPct],
    ["fallbackSigma", RULES.fallbackSigma],
    ["openLimitSlippage", RULES.openLimitSlippage],
    ["closeLimitSlippage", RULES.closeLimitSlippage],
    // `maxSpreadShareOfMid` (0.35) WAS DELIBERATELY OFF THIS LIST AND IS BACK ON
    // IT. It was kept off because App.jsx drew a position's attention level at
    // `pnl < 0.35 * p.maxLoss * n` — a "watch" badge with no home in RULES,
    // whose value COLLIDES with the spread floor's — and a guard that names the
    // wrong rule on a line is worse than one that is not printed. That level is
    // `RULES.watchAttentionShare` now, read through `watchAttentionLevel()`, so
    // the collision is harmless and the spread floor is swept like the rest.
    ["maxSpreadShareOfMid", RULES.maxSpreadShareOfMid],
    ["watchAttentionShare", RULES.watchAttentionShare],
    ["autopilotConfidence", RULES.autopilotConfidence],
    ["fallbackIV", RULES.fallbackIV],
    ["minNetPremium", RULES.minNetPremium],
    ["modelDisagreementRatio", RULES.modelDisagreementRatio],
    ["liquidityPercentile", RULES.liquidityPercentile],
    ["scratchPayoffShare", RULES.scratchPayoffShare],
  ];
  const bad = [];
  for (const file of LITERAL_FILES) {
    for (const hit of ruleLiteralHits(codeOf(file), RULE_LITERALS)) {
      bad.push(`${file}: ${hit.text} — ${hit.names.join(" / ")} in RULES`);
    }
  }
  assert.deepEqual(bad, [], `a rule number has a home; these are copies:\n  ${bad.join("\n  ")}`);
});

test("RULES LITERALS — the test can actually see a copy when there is one", () => {
  // A guard that cannot fail is not a guard — and this one has just been handed
  // a real catch, so it had better still be able to fail. Each of the three
  // shapes is checked against the same matcher the sweep above uses.
  const L = [["targetEntryDTE", RULES.targetEntryDTE], ["minOverrideReasonChars", RULES.minOverrideReasonChars],
    ["exitDTE", RULES.exitDTE], ["takeProfitPct", RULES.takeProfitPct]];
  const seen = (src) => ruleLiteralHits(src, L).map((h) => h.text);

  // Shape 1 — an initial state. The sweep found this three times in App.jsx.
  assert.deepEqual(seen(`const [dteManual, setDteManual] = useState(${RULES.targetEntryDTE});`),
    [`useState(${RULES.targetEntryDTE})`]);
  // Shape 2 — a local constant. This is the bare REASON_MIN PR #23 inherited.
  assert.deepEqual(seen(`  const REASON_MIN = ${RULES.minOverrideReasonChars};`),
    [`REASON_MIN = ${RULES.minOverrideReasonChars}`]);
  // Shape 3 — INSIDE AN ARITHMETIC EXPRESSION. This is the one that let the
  // simulator's exit policy sit in plain sight for four pull requests.
  assert.deepEqual(seen(`  const days = Math.max(1, dteLeft - ${RULES.exitDTE});`),
    [`dteLeft - ${RULES.exitDTE}`]);
  assert.deepEqual(seen(`  const tp = ${RULES.takeProfitPct} * pos.maxProfit;`),
    [`${RULES.takeProfitPct} * pos.maxProfit`]);
  assert.deepEqual(seen(`  const sl = ${RULES.stopLossPct} * pos.maxLoss, x = 1;`),
    [`${RULES.stopLossPct} * pos.maxLoss`]);
  assert.deepEqual(seen(`  const back = entryDte + ${RULES.exitDTE};`), [`entryDte + ${RULES.exitDTE}`]);
  // Shape 4 — A FALLBACK OPERAND. This is the live catch this session made:
  // `ComparePayoffs()` read `dte: shown[0].dte || 45` where
  // `RULES.targetEntryDTE` lives, and PR #24 had fixed a parameter default of
  // the same number four lines away in the same file.
  assert.deepEqual(seen(`  dte: shown[0].dte || ${RULES.targetEntryDTE},`),
    [`shown[0].dte || ${RULES.targetEntryDTE}`]);
  assert.deepEqual(seen(`  const horizon = c.dte ?? ${RULES.targetEntryDTE};`),
    [`c.dte ?? ${RULES.targetEntryDTE}`]);

  // ...AND IT STILL HAS TO STAY QUIET ON THE THINGS THAT ARE NOT COPIES, or the
  // build fails on arithmetic and the next session deletes the guard.
  assert.deepEqual(seen(`const span = Math.round(dte / 30);`), [],
    "days into months is a unit conversion, not the entry floor");
  assert.deepEqual(seen(`<text x={xToday + 4} />`), [],
    "a coordinate beside TODAY is not the suggested number of positions");
  assert.deepEqual(seen(`const d1 = (Math.log(S / K) + (0.045 + ${RULES.takeProfitPct} * iv * iv) * T);`), [],
    "Black-Scholes has a half in it and it is not the take-profit rule");
  assert.deepEqual(seen(`{ days: RULES.targetEntryDTE + 30, label: "2-3 months" }`), [],
    "an expression anchored at the home is already reading the home");
  assert.deepEqual(seen(`const bar = { height: ${RULES.lowConfidence}, marginTop: ${RULES.exitDTE} };`), [],
    "a pixel is not a rule, however ruleish the file it is in");
  // ...AND SHAPE 4 HAS TO STAY QUIET TOO, or a guard that has just been given a
  // real catch starts failing the build on ordinary defaulting.
  assert.deepEqual(seen(`const n = bins.length || ${RULES.targetEntryDTE};`), [],
    "a bin count is not the target horizon, however convenient the number");
  assert.deepEqual(seen(`const d = RULES.targetEntryDTE ?? ${RULES.targetEntryDTE};`), [],
    "an expression anchored at the home is already reading the home");
  assert.deepEqual(seen(`const w = barWidth || ${RULES.exitDTE};`), [],
    "a pixel fallback is not the exit rule");
});

/* ============================================================================
   AN OPENING LIMIT THAT CAN ACTUALLY FILL, AND A TICKET THAT SHOWS THE BOOK.
============================================================================ */

// A BOIL-shaped market: a 145%-of-mid spread on the long leg, which is what
// this repo measured on the real board.
const WIDE = [{ bid: 0.30, ask: 0.50 }, { bid: 0.10, ask: 0.24 }];
const TIGHT = [{ bid: 2.30, ask: 2.36 }, { bid: 1.98, ask: 2.02 }];

test("COMBO BOOK — each leg at the side that actually trades, for the whole structure", () => {
  const b = comboBook(BOIL_SPREAD, WIDE);
  assert.equal(b.ok, true);
  // To BUY this you lift the 0.50 ask and receive the 0.10 bid: 0.40.
  assert.ok(Math.abs(b.ask - 0.40) < 1e-9, `ask ${b.ask}`);
  // To SELL it you receive the 0.30 bid and pay the 0.24 ask: 0.06.
  assert.ok(Math.abs(b.bid - 0.06) < 1e-9, `bid ${b.bid}`);
  assert.ok(Math.abs(b.mid - 0.23) < 1e-9, `mid ${b.mid}`);
  assert.ok(b.bid < b.mid && b.mid < b.ask, "a person reads them in that order");
  assert.ok(Math.abs(b.spread - 0.34) < 1e-9, "and the structure's own spread");
});

test("COMBO BOOK — a leg with no two-sided quote means there is no book, not a book of zeros", () => {
  for (const q of [[{ bid: 0.30, ask: 0.50 }, {}], [{ bid: 0, ask: 0.50 }, { bid: 0.10, ask: 0.24 }],
    [{ bid: 0.30, ask: 0.50 }, { bid: 0.30, ask: 0.10 }]]) {
    const b = comboBook(BOIL_SPREAD, q);
    assert.equal(b.ok, false);
    assert.equal(b.bid, null); assert.equal(b.mid, null); assert.equal(b.ask, null);
    assert.ok(b.missing.length > 0, "and it names which leg");
  }
  assert.equal(comboBook([], []).ok, false, "no legs is no book either");
});

test("OPENING LIMIT — IT IS NOT THE BARE MID: it concedes a share of the spread", () => {
  const b = comboBook(BOIL_SPREAD, WIDE);
  const o = openLimitPrice({ netMid: b.mid, spread: b.spread });
  assert.notEqual(o.limit, Math.abs(b.mid), "THE FAULT: the ticket seeded the bare mid");
  assert.ok(o.limit > Math.abs(b.mid), "a debit concedes UPWARDS — the direction that fills");
  assert.ok(Math.abs(o.allowance - RULES.openLimitSlippage * b.spread) < 1e-9);
  assert.ok(Math.abs(o.limit - (b.mid + RULES.openLimitSlippage * b.spread)) < 1e-9);
  // ...and never past the touch, which is the market order this replaces.
  assert.ok(o.limit < Math.abs(b.ask), "a quarter of the spread is not the far side of it");
});

test("OPENING LIMIT — a CREDIT structure concedes downwards, and the arithmetic has no branch", () => {
  const credit = openLimitPrice({ netMid: -0.40, spread: 0.20 });
  assert.ok(Math.abs(credit.net + 0.45) < 1e-9, "you accept less, not more");
  assert.equal(credit.limit, 0.45, "and the MAGNITUDE is what orderBody() sends");
  const debit = openLimitPrice({ netMid: 0.40, spread: 0.20 });
  assert.ok(Math.abs(debit.net - 0.45) < 1e-9);
});

test("OPENING LIMIT — a concession may never flip the sign round", () => {
  // The same trap as the close: a +0.02 debit conceded through zero reaches the
  // broker as a magnitude, i.e. as an order on the wrong side of the market.
  const r = openLimitPrice({ netMid: 0.02, spread: 0.40 });
  assert.ok(r.net > 0, "a debit stays a debit");
  const c = openLimitPrice({ netMid: -0.02, spread: 0.40 });
  assert.ok(c.net < 0, "and a credit stays a credit");
});

test("OPENING LIMIT — a missing market is no price at all, never a price of zero", () => {
  assert.equal(openLimitPrice({ netMid: null, spread: 0.2 }), null);
  assert.equal(openLimitPrice({ netMid: 0.4, spread: null }), null);
  assert.match(openLimitNote(null), /cannot be read on both sides/);
  assert.match(openLimitNote(openLimitPrice({ netMid: 0.23, spread: 0.34 })), /concedes 25%/);
});

test("OPENING LIMIT — it is a SIBLING of the closing one, with its own constant", () => {
  assert.equal(OPEN_LIMIT_SLIPPAGE, RULES.openLimitSlippage);
  assert.equal(CLOSE_LIMIT_SLIPPAGE, RULES.closeLimitSlippage);
  // They happen to be equal today. What must hold is that moving one does not
  // move the other: two questions, two numbers.
  const b = comboBook(BOIL_SPREAD, WIDE);
  const a = openLimitPrice({ netMid: b.mid, spread: b.spread, slippage: 0.5 });
  const c = openLimitPrice({ netMid: b.mid, spread: b.spread, slippage: 0.1 });
  assert.ok(a.limit > c.limit, "the allowance is what moves the price");
});

test("THE LIMIT IS PLACED IN THE BOOK, with one plain sentence about each zone", () => {
  const b = comboBook(BOIL_SPREAD, WIDE);        // bid 0.06, mid 0.23, ask 0.40
  assert.equal(limitPlacement(0.40, b).zone, "fills");
  assert.equal(limitPlacement(0.45, b).zone, "fills");
  assert.equal(limitPlacement(0.31, b).zone, "waiting");
  assert.equal(limitPlacement(0.06, b).zone, "no-fill");
  assert.equal(limitPlacement(0.01, b).zone, "no-fill");
  for (const L of [0.40, 0.31, 0.06]) {
    const p = limitPlacement(L, b);
    assert.ok(p.known && p.label && p.sentence.length > 40, "every zone says something");
  }
});

test("THE LIMIT AT THE MID IS NAMED AS THE THING THAT DOES NOT FILL", () => {
  // This is the case that matters: it is the price the app seeded and the one
  // order this app has ever sent sat at it. Floating point must not lose it —
  // the mid of two two-decimal quotes is 0.23000000000000004.
  const b = comboBook(BOIL_SPREAD, WIDE);
  const p = limitPlacement(0.23, b);
  assert.equal(p.zone, "unlikely");
  assert.equal(p.label, "THIS WILL NOT FILL");
  assert.match(p.sentence, /middle of the market/);
});

test("THE DIRECTION OF \"MORE AGGRESSIVE\" INVERTS ON A CREDIT, and the sentence follows it", () => {
  // THE BUG THIS LOCKS: on a DEBIT you pay, so a bigger number is a better
  // offer and the fill price is the LARGEST of the three magnitudes. On a
  // CREDIT you receive, so a smaller number is the better offer and the fill
  // price is the SMALLEST. Comparing magnitudes with `>=` in both cases reads a
  // credit exactly backwards — it calls a limit DEMANDING MORE than the market
  // is offering "fills now", which is the one sentence here that must never be
  // wrong, on the one screen where being wrong sends an order.
  const credit = comboBook(
    [{ side: -1, qty: 1 }, { side: 1, qty: 1 }],
    [{ bid: 1.00, ask: 1.10 }, { bid: 0.40, ask: 0.50 }]);
  assert.equal(credit.ok, true);
  assert.ok(credit.mid < 0, "a credit structure has a negative net");
  // Opening it sells the structure: hit the 1.00 bid, lift the 0.50 ask = 0.50.
  assert.ok(Math.abs(Math.abs(credit.ask) - 0.50) < 1e-9, `fills at ${credit.ask}`);
  assert.ok(Math.abs(Math.abs(credit.mid) - 0.60) < 1e-9);
  assert.equal(limitPlacement(0.45, credit).zone, "fills", "accepting less than offered fills");
  assert.equal(limitPlacement(0.50, credit).zone, "fills", "and exactly the offer fills");
  assert.equal(limitPlacement(0.55, credit).zone, "waiting");
  assert.equal(limitPlacement(0.60, credit).zone, "unlikely", "at the mid, on a credit too");
  assert.equal(limitPlacement(0.80, credit).zone, "no-fill", "demanding well over the mid never fills");
  // The sentence has to say "accept", not "pay" — it is the other way round.
  assert.match(limitPlacement(0.45, credit).sentence, /accept/);
  assert.match(limitPlacement(0.40, comboBook([{ side: 1, qty: 1 }, { side: -1, qty: 1 }],
    [{ bid: 0.30, ask: 0.50 }, { bid: 0.10, ask: 0.24 }])).sentence, /pay/);
});

test("A LIMIT SITTING ON THE FAR TOUCH JOINS THE QUEUE, it does not trade", () => {
  // A buy limit exactly ON the bid does not cross it. That belongs with the
  // prices that do not fill, not with the ones that might.
  const b = comboBook([{ side: 1, qty: 1 }, { side: -1, qty: 1 }], WIDE);
  assert.equal(limitPlacement(Math.abs(b.bid), b).zone, "no-fill");
  assert.equal(limitPlacement(Math.abs(b.bid) + 0.02, b).zone, "unlikely", "just inside it is not the same");
});

test("THE LIMIT PLACEMENT SAYS SO when there is no book to place it in", () => {
  const none = comboBook(BOIL_SPREAD, [{ bid: 0.3, ask: 0.5 }, {}]);
  const p = limitPlacement(0.40, none);
  assert.equal(p.known, false);
  assert.match(p.sentence, /no two-sided market/);
  assert.equal(limitPlacement(0, comboBook(BOIL_SPREAD, WIDE)).known, false, "and no price is not a price");
});

test("NOTIONAL CONTROLLED — contracts x 100 x spot, which was never on screen", () => {
  assert.equal(notionalControlled(10, 19.84), 19840);
  assert.equal(notionalControlled(1, 19.84), 1984);
  for (const bad of [[0, 19.84], [10, 0], [null, 19.84], [10, null]]) {
    assert.equal(notionalControlled(...bad), null, "and it is never invented");
  }
  const n = notionalNote(19840, 500, "BOIL");
  assert.match(n, /\$19,840/);
  assert.match(n, /\$500/);
  assert.match(n, /40 times/, "the leverage stated as a number, which is the point");
});

/* ============================================================================
   THE ENTRY FLOOR AS ROOM. The gate's three bands are tested above; these are
   the rule functions behind them, and the board that can now be offered.
============================================================================ */

test("ENTRY ROOM — three bands, and the boundaries are where the rules are", () => {
  assert.equal(entryRoom(RULES.exitDTE - 1).band, "inside-exit");
  assert.equal(entryRoom(RULES.exitDTE).band, "inside-exit", "AT the exit rule is inside it");
  assert.equal(entryRoom(RULES.exitDTE + 1).band, "tight");
  assert.equal(entryRoom(RULES.minEntryDTE - 1).band, "tight");
  assert.equal(entryRoom(RULES.minEntryDTE).band, "clear", "AT the floor is clear of it");
  assert.equal(entryRoom(90).band, "clear");
  // The quantity that matters, and what the app aims for.
  assert.equal(entryRoom(28).room, 28 - RULES.exitDTE);
  assert.equal(entryRoom(28).target, RULES.minEntryDTE - RULES.exitDTE);
  assert.equal(entryRoom(null).known, false, "and an unknown DTE is not a DTE of zero");
});

test("ENTRY ROOM — a written reason is the same mechanism as every other override", () => {
  assert.equal(entryOverrideOk(""), false);
  assert.equal(entryOverrideOk("   "), false);
  assert.equal(entryOverrideOk("x".repeat(RULES.minOverrideReasonChars - 1)), false);
  assert.equal(entryOverrideOk("x".repeat(RULES.minOverrideReasonChars)), true);
  assert.equal(entryOverrideOk(null), false, "and nothing is not a reason");
  const note = entryOverrideNote(entryRoom(28), "the 28-day board is the only liquid one");
  assert.match(note, /28 DTE/);
  assert.match(note, /7 days/);
  assert.match(note, /only liquid one/, "the reason itself is in the record");
});

test("ENTRY ROOM — the 30 IS NOT CHANGED, and neither is the 21", () => {
  // This session rewrote what happens either side of the floor and deliberately
  // did not move it: the reading that would settle it is ROADMAP P5's.
  assert.equal(RULES.minEntryDTE, 30);
  assert.equal(RULES.exitDTE, 21);
  assert.equal(RULES.bestPracticePerTradePct, 0.05);
  assert.equal(RULES.totalExposurePct, 0.25);
});

test("EXPIRY CHOICE — a passed-over board past the exit rule is OFFERABLE now", () => {
  const c = expiryChoice([
    { key: "2026-10-02", dte: 28, clears: 12, near: 14 },
    { key: "2026-10-09", dte: 35, clears: 2, near: 7 },
  ]);
  assert.equal(c.chosen.key, "2026-10-09", "the CHOICE is untouched");
  assert.equal(c.passedOver.key, "2026-10-02");
  assert.equal(c.passedOver.offerable, true);
  assert.match(expiryChoiceNote(c), /writing down why/, "and the sentence says what you may do");
});

test("EXPIRY CHOICE — a board at or inside the exit rule is named and NOT offerable", () => {
  const c = expiryChoice([
    { key: "2026-09-18", dte: 14, clears: 19, near: 23 },
    { key: "2026-10-09", dte: 35, clears: 2, near: 7 },
  ]);
  assert.equal(c.passedOver.offerable, false);
  assert.match(expiryChoiceNote(c), /not offered to anybody/);
});

test("THE FLOOR IS INSTRUMENTED so a later session can calibrate it from a reading", () => {
  const c = expiryChoice([
    { key: "2026-10-02", dte: 28, clears: 12, near: 14 },
    { key: "2026-10-09", dte: 35, clears: 2, near: 7 },
  ]);
  const row = passedOverRecord("BOIL", c);
  assert.ok(row);
  assert.equal(row.ticker, "BOIL");
  assert.equal(row.chosen.key, "2026-10-09");
  assert.equal(row.passedOver.key, "2026-10-02");
  assert.equal(row.busierBy, 10);
  assert.equal(row.busierFactor, 6);
  assert.equal(row.offerable, true);
  // NOTHING PASSED OVER IS NOT AN EVENT. A log full of nulls is not a reading.
  const none = expiryChoice([{ key: "2026-10-09", dte: 35, clears: 2, near: 7 }]);
  assert.equal(passedOverRecord("BOIL", none), null);
  assert.equal(passedOverRecord("BOIL", null), null);
  // And the summary reads the rows rather than asserting anything.
  assert.match(passedOverSummary([]), /has not taken a busier board away/);
  const sum = passedOverSummary([row, { ...row, ticker: "UNG", offerable: false }]);
  assert.match(sum, /2 times/);
  assert.match(sum, /BOIL/);
  assert.match(sum, /UNG/);
});

/* ---------------- summary ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
