// Tests for the risk gate (src/riskGate.js) and the rule config (src/rules.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluateTrade, paperStatus, undefinedRiskLegs } from "./riskGate.js";
import { RULES, sizing, ruleBadge, qualityFloor, qualityFloorSentence, liquiditySkippedNote, NOTHING_TODAY,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityThreshold, looseningWarning, liquiditySettingNote,
  priceability, rewardRisk, unpriceableNote, money, MIN_NET_DOLLARS,
  spreadShare, spreadFloor, spreadFloorReason, wideSpreadNote, spreadSkippedNote,
  expiryChoice, expiryChoiceNote, emptyExpiryNote,
  modelSanity, modelSanityReason, modelDisagreementNote,
  comboBook, openLimitPrice, openLimitNote, limitPlacement, notionalControlled, notionalNote,
  entryRoom, entryInsideExitNote, entryRoomWarning, entryRoomOverrideAsk, entryOverrideOk, entryOverrideNote,
  passedOverRecord, passedOverSummary, OPEN_LIMIT_SLIPPAGE, CLOSE_LIMIT_SLIPPAGE,
  chancePct, chanceText, chanceInTen, signedMoney } from "./rules.js";
import { netBS, SIGMA } from "./engine.js";
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

test("MODEL SANITY — IT IS A PROPOSAL FLOOR AND IT IS NOT IN THE GATE", () => {
  // A trade the user builds by hand on the desk is his to make. The gate's job
  // is "is there a price at all"; this one's is "is it this structure's price".
  const src = readFileSync(new URL("./riskGate.js", import.meta.url), "utf8");
  assert.equal(/modelSanity/.test(src), false,
    "the model check must never become a reason an order is refused");
  // ...and it IS at all three generation sites.
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const n = (app.match(/modelSanity\(/g) || []).length;
  assert.ok(n >= 3, `all three generation sites call it (found ${n})`);
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
