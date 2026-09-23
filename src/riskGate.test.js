// Tests for the risk gate (src/riskGate.js) and the rule config (src/rules.js).
// Plain Node, no test framework: `npm test` runs this file directly.

import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
import { evaluateTrade, paperStatus, undefinedRiskLegs } from "./riskGate.js";
import { positionSize, positionSizeNote, contractsOf, withPositionSize, bookPositions, positionStage, positionForHolding } from "./journal.js";
import { orderBody, mlegLimitPrice } from "./order.js";
import { RULES, sizing, ruleBadge, qualityFloor, qualityFloorSentence, liquiditySkippedNote,
  LIQUIDITY_LEVELS, RECOMMENDED_LIQUIDITY, LIQUIDITY_MEASUREMENT, liquidityMeasurementNote, liquidityThreshold, looseningWarning, liquiditySettingNote,
  priceability, rewardRisk, unpriceableNote, impossibleLossNote, money, MIN_NET_DOLLARS,
  contractListing, unlistedContractNote, legName, tradeCard, TRADE_CARD_IDS, cardCurrencyNote,
  isButterfly, butterflySkipNote,
  unquotedLegNote, unquotedLegPointer, marketOrderNote, strikeSnapNote,
  spreadShare, spreadFloor, spreadFloorReason, wideSpreadNote, spreadSkippedNote,
  expiryChoice, expiryChoiceNote, checkedAgainstNote, offBoardStrikeLabel,
  modelSanity, modelSanityReason, modelDisagreementNote,
  chanceOf, chanceSeedKey, seasonalProvenance, seasonalStampOf, seasonalSourceSentence,
  MEASURED_SEASONAL_SOURCE, ESTIMATED_SEASONAL_SOURCE, watchAttentionLevel,
  ivProvenance, CHAIN_IV_SOURCE, THESIS_IV_SOURCE, FALLBACK_IV_SOURCE,
  comboBook, limitAgainstBook, openLimitPrice, closeLimitPrice, openLimitNote, limitPlacement, notionalControlled, notionalNote,
  entryRoom, entryInsideExitNote, entryRoomWarning, entryRoomOverrideAsk, entryOverrideOk, entryOverrideNote,
  passedOverRecord, passedOverSummary, OPEN_LIMIT_SLIPPAGE, CLOSE_LIMIT_SLIPPAGE,
  chancePct, chanceText, chanceInTen, signedMoney,
  sigmaProvenance, TABLE_SIGMA_SOURCE, MEASURED_SIGMA_SOURCE, FALLBACK_SIGMA_SOURCE,
  positionPnl, modelPnlNote, BROKER_PNL, MODEL_PNL,
  buildableExpiries, openableBoard, offFloorExpiryLabel, horizonFloorNote,
  remainingEdge, remainingEdgeNote, remainingEdgeLabel, shareOfMaximum, attentionCount, sameCloseNote,
  requestOf, requestAmountLabel, requestAmountOwner, contractsSourceNote, clampAskedChance,
  REQUEST_MODES, meetsRequest, splitByRequest, meetsHeading, otherwiseHeading,
  targetPriceOf, chanceAskLabel, nothingTodayLine } from "./rules.js";
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
  assert.ok(!/-\$0/.test(note), "and it does not print -$0 either");
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
  // closeOrder.js prepareClose() passes the cost basis, which is a positive magnitude.
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
  // It is a DIFFERENT sentence from the other refusals, not a rewording.
  for (const o of [unpriceableNote(2, "BOIL"), impossibleLossNote(2, "BOIL")]) assert.notEqual(o, note);
});

/** The source of a file with its COMMENTS REMOVED, for structural tests that
 *  must not be satisfied by a sentence in a comment. This matters: the previous
 *  version of the test below counted `modelSanity(` across the whole of App.jsx
 *  and was green on two PROSE mentions and one real call, which is exactly the
 *  fault it was written to catch. These files are heavily commented and the
 *  comments name the functions they explain. */
/* =========================================================================
   THE BODY THAT LEAVES MUST AGREE IN SIGN WITH THE BOOK IT MEETS

   The third debt PR #33 handed forward, and the one check that would have
   stopped J-0001 at the door: `limit_price: "0.75"`, a DEBIT, sent into a
   book quoting that bull put spread as a CREDIT.
========================================================================= */

/** A two-sided book on every leg, from the leg prices given. */
const quotesOf = (...pairs) => pairs.map(([bid, ask]) => ({ bid, ask }));

test("LIMIT vs BOOK — the four §4q directions all agree with their own market", () => {
  // Each row: the legs, a book, the intent, and the direction the order carries.
  const bullPut = [{ side: -1, qty: 1, type: "put", strike: 62.5 }, { side: 1, qty: 1, type: "put", strike: 59 }];
  const bullCall = [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }];
  // A credit structure: short the dear put, long the cheap one → mid is negative.
  const creditBook = comboBook(bullPut, quotesOf([1.10, 1.22], [0.30, 0.42]));
  // A debit structure: long the dear call, short the cheap one → mid is positive.
  const debitBook = comboBook(bullCall, quotesOf([0.90, 1.02], [0.30, 0.42]));
  assert.ok(creditBook.ok && creditBook.mid < 0, `credit book mid ${creditBook.mid}`);
  assert.ok(debitBook.ok && debitBook.mid > 0, `debit book mid ${debitBook.mid}`);

  const check = (book, net, intent, legs) => limitAgainstBook({
    limitPrice: mlegLimitPrice(net, 1, intent), book, intent, legCount: legs.length });

  // 1. open a credit structure → the order is a credit.
  const a = check(creditBook, creditBook.mid, "open", bullPut);
  assert.equal(a.checked, true); assert.equal(a.ok, true); assert.equal(a.got, -1);
  // 2. open a debit structure → the order is a debit.
  const b = check(debitBook, debitBook.mid, "open", bullCall);
  assert.equal(b.checked, true); assert.equal(b.ok, true); assert.equal(b.got, 1);
  // 3. close a debit structure → the order is a CREDIT. The half nobody had read.
  const c = check(debitBook, debitBook.mid, "close", bullCall);
  assert.equal(c.checked, true); assert.equal(c.ok, true); assert.equal(c.got, -1);
  // 4. close a credit structure → the order is a DEBIT.
  const d = check(creditBook, creditBook.mid, "close", bullPut);
  assert.equal(d.checked, true); assert.equal(d.ok, true); assert.equal(d.got, 1);
});

test("LIMIT vs BOOK — J-0001 AS IT WAS SENT is refused, in words", () => {
  const legs = [{ side: -1, qty: 1, type: "put", strike: 62.5 }, { side: 1, qty: 1, type: "put", strike: 59 }];
  const book = comboBook(legs, quotesOf([1.10, 1.22], [0.30, 0.42]));   // a CREDIT
  // The body the app actually sent that day: "0.75", positive, a debit.
  const r = limitAgainstBook({ limitPrice: "0.75", book, intent: "open", legCount: 2 });
  assert.equal(r.checked, true);
  assert.equal(r.ok, false, "an offer to PAY sent into a market that pays you must not leave");
  assert.equal(r.expected, -1);
  assert.equal(r.got, 1);
  assert.ok(/WRONG WAY ROUND/.test(r.sentence), r.sentence);
  assert.ok(/credit/.test(r.sentence) && /debit/.test(r.sentence), r.sentence);
  assert.ok(/Nothing is sent/.test(r.sentence), r.sentence);
  // AND THE CORRECTLY SIGNED VERSION OF THAT SAME ORDER GOES THROUGH.
  assert.equal(limitAgainstBook({ limitPrice: "-0.75", book, intent: "open", legCount: 2 }).ok, true);
});

test("LIMIT vs BOOK — four unknowns SKIP, and each one names itself", () => {
  const legs = [{ side: 1, qty: 1, type: "call", strike: 22 }, { side: -1, qty: 1, type: "call", strike: 24 }];
  const book = comboBook(legs, quotesOf([0.90, 1.02], [0.30, 0.42]));
  const cases = [
    [{ limitPrice: "0.60", book, intent: "open", legCount: 1 }, "single-leg"],
    [{ limitPrice: null, book, intent: "open", legCount: 2 }, "no-limit"],
    [{ limitPrice: "0.00", book, intent: "open", legCount: 2 }, "no-limit"],
    [{ limitPrice: "0.60", book: null, intent: "open", legCount: 2 }, "no-book"],
    [{ limitPrice: "0.60", book: comboBook(legs, [{ bid: 0.9, ask: 1.02 }, {}]), intent: "open", legCount: 2 }, "no-book"],
  ];
  for (const [arg, reason] of cases) {
    const r = limitAgainstBook(arg);
    assert.equal(r.checked, false, `${reason} should skip`);
    assert.equal(r.ok, true, "a skip is not a block");
    assert.equal(r.reason, reason);
    assert.ok(r.sentence && r.sentence.length > 40, `${reason} must say which unknown stopped it`);
  }
  // A MID UNDER THE MINIMUM IS `priceability()`'S QUESTION, NOT THIS ONE.
  const tiny = comboBook(legs, quotesOf([0.50, 0.52], [0.49, 0.51]));
  assert.ok(tiny.ok && Math.abs(tiny.mid) * 100 < MIN_NET_DOLLARS, `mid ${tiny.mid}`);
  const t = limitAgainstBook({ limitPrice: "-0.60", book: tiny, intent: "open", legCount: 2 });
  assert.equal(t.checked, false);
  assert.equal(t.reason, "mid-too-small");
  // `Number(null)` IS 0 AND 0 IS FINITE, and it does not become a direction.
  assert.equal(limitAgainstBook({}).checked, false);
  assert.equal(limitAgainstBook({ limitPrice: "", book, legCount: 2 }).reason, "no-limit");
});

test("LIMIT vs BOOK — the GATE refuses an inverted OPEN, and only an open", () => {
  const legs = [{ side: -1, qty: 1, type: "put", strike: 62.5 }, { side: 1, qty: 1, type: "put", strike: 59 }];
  const quotes = quotesOf([1.10, 1.22], [0.30, 0.42]);        // a credit book
  const occs = ["XLE261030P00062500", "XLE261030P00059000"];
  const base = { ticker: "XLE", name: "Bull Put Spread", dte: 45, contracts: 1, legs, quotes, occs,
    maxLoss: -275, maxProfit: 75 };
  // THE ORDER AS J-0001 WAS SENT: a POSITIVE net on a credit structure.
  const bad = evaluateTrade({ proposal: { ...base, intent: "open", net: 0.75 },
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.ok(codes(bad).includes("LIMIT_AGAINST_BOOK"), codes(bad).join(", "));
  assert.equal(bad.pass, false);
  assert.match(messageFor(bad, "LIMIT_AGAINST_BOOK"), /WRONG WAY ROUND/);

  // The same structure priced the way the market quotes it passes.
  const good = evaluateTrade({ proposal: { ...base, intent: "open", net: -0.75 },
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(codes(good).includes("LIMIT_AGAINST_BOOK"), false, codes(good).join(", "));

  // ENTRY ONLY. A close is never refused by the gate for this — being unable to
  // get OUT is the worse failure, and the close paths refuse it at the button.
  const close = evaluateTrade({ proposal: { ...base, intent: "close", net: 0.75, maxLoss: 275 },
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(codes(close).includes("LIMIT_AGAINST_BOOK"), false, codes(close).join(", "));

  // AND A CALLER WITH NO EVIDENCE IS NOT CHECKED, rather than quietly passed.
  const blind = evaluateTrade({ proposal: { ...base, intent: "open" },
    portfolio: EMPTY_BOOK, capital: CAPITAL, signals: CONFLUENT });
  assert.equal(codes(blind).includes("LIMIT_AGAINST_BOOK"), false);
});

const codeOf = (name) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, " ")      // block comments, including the long ones
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1");   // line comments, but not "https://"

test("LIMIT vs BOOK — every CLOSE path refuses it beside its own button", () => {
  /* It is NOT in the gate for a close, so each close path has to ask for
     itself. A path that never asks is a path where an inverted closing order
     leaves in silence — and closing has never been exercised at all. */
  // placeExit() in pro.jsx; order path 3 (the desk's and the Positions card's
  // close) in closeOrder.js, where closeGroup()'s body moved in PR #38.
  for (const f of ["pro.jsx", "closeOrder.js"]) {
    const src = codeOf(f);
    const hits = (src.match(/limitAgainstBook\(/g) || []).length;
    assert.ok(hits >= 1, `${f} calls limitAgainstBook() ${hits} times: placeExit() and prepareClose() both need it`);
  }
  const approve = readFileSync(new URL("../netlify/functions/approve.mjs", import.meta.url), "utf8");
  assert.ok(/limitAgainstBook\(/.test(approve),
    "approve.mjs builds a fresh limit from a live chain and is the one close path that can invert by arithmetic");
});

test("MODEL SANITY — IT IS A PROPOSAL FLOOR AND IT IS NOT IN THE GATE", () => {
  // A trade the user builds by hand on the desk is his to make. The gate's job
  // is "is there a price at all"; this one's is "is it this structure's price".
  const src = readFileSync(new URL("./riskGate.js", import.meta.url), "utf8");
  assert.equal(/modelSanity/.test(src), false,
    "the model check must never become a reason an order is refused");
});

test("DEAD IS NOT WORKING — the filter that outlived three cancelled orders", () => {
  /* >>> READ ON THE OWNER'S PHONE, 20 Sep 2026. <<< A panel headed "WORKING
     AT THE BROKER (3) · SENT, NOT FILLED" containing three rows badged
     CANCELED, EXPIRED and CANCELED — two of them three days old. The filter
     was

         p.alpacaId && p.alpacaFilled === false

     which asks whether an order was FILLED and never whether it is still
     ALIVE. `order.js` had known which statuses are finished since PR #18 and
     nobody asked it. Every list is built from `positionStage()` now. */
  const app = codeOf("App.jsx");
  assert.equal(/alpacaFilled\s*===\s*false/.test(app), false,
    "a working order is not 'one that was never filled': ask orderLifecycle() through positionStage()");
  assert.ok(/positionStage\(/.test(app), "App.jsx reads the stage from journal.js");

  // ...and the three lists come out of that one function, not three filters.
  assert.ok(/const byStage = useMemo/.test(app), "one pass over the book, three lists");
  for (const name of ["ownedPositions", "workingOrders", "notTakenOrders"]) {
    assert.ok(new RegExp(`\\b${name}\\b`).test(app), `${name} exists`);
  }

  // ONLY WHAT IS OWNED IS A POSITION. The Positions screen and the attention
  // alert both read the owned list — the alert said "EVERYTHING IS ON PLAN"
  // over three trades that had never been bought.
  assert.ok(/YOUR POSITIONS \(\{ownedPositions\.length\}\)/.test(app),
    "the Positions count is the owned count, not every record");
  assert.ok(/const posAlerts = useMemo\(\(\) => ownedPositions\.map/.test(app),
    "and nothing that was never bought asks for a decision today");
});

test("WATCHING IS A PLACE OF ITS OWN, and its figures are not money", () => {
  // The owner's words: "magari voglio vedere come sarebbe andata, ma non deve
  // stare nella stessa schermata delle posizioni e ordini."
  const app = codeOf("App.jsx");
  assert.ok(/id: "watching"/.test(app), "a fourth place beside Positions and the Journal");
  assert.ok(/tab === "watching"/.test(app), "and a screen behind it");
  assert.ok(/wouldHaveDone\(/.test(app), "the theoretical figure comes from journal.js, with its sentence");

  // SAVED STRATEGIES LEFT THE POSITIONS SCREEN. It was a list of trades NOT
  // taken, sitting on the screen whose whole job is the trades you have.
  const positionsTab = app.slice(app.indexOf('{tab === "positions"'), app.indexOf('{tab === "watching"'));
  assert.equal(/SAVED STRATEGIES/.test(positionsTab), false,
    "saved strategies belong to Watching, not to the book");

  // A THEORETICAL P&L MAY NEVER BE PAINTED LIKE A REAL ONE. Printing it in
  // the red the Positions cards use would rebuild, one tab across, the exact
  // fault this session removed.
  const watchTab = app.slice(app.indexOf('{tab === "watching"'), app.indexOf('{tab === "journal"'));
  assert.ok(watchTab.length > 500, "the Watching screen is really in there");
  assert.equal(/WOULD HAVE OPENED AT[\s\S]{0,400}c=\{T\.red\}/.test(watchTab), false,
    "no red on a figure that is not a loss");
  assert.ok(/Nothing here is a position and nothing here is money/.test(watchTab),
    "and the screen says so in its own words, at the top");
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
  // PR #40: one generation site now (`shortlistWithFloors()`, which Find calls
  // per market) and the ticket's memo.
  assert.ok(uses >= 2,
    `the generation site and the ticket's memo read it (found ${uses})`);
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
  // PR #40: the list card and Build read it through `listCardFigures()` and
  // `buildFigures()`, which call `chanceCheckOf` directly; `chanceFor` is the
  // component's binding of the same expression. Both count.
  const uses = (app.match(/\b(chanceFor|chanceCheckOf)\(/g) || []).length;
  assert.ok(uses >= 5,
    `the list, Build, the record and the Guardian all read it (found ${uses})`);
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

test("OPENING LIMIT — a CREDIT structure concedes towards zero: you accept less, not more", () => {
  // THIS TEST USED TO ASSERT −0.45, which is the bug it was named after: a
  // credit of MORE than the mid, on the side of the market that never fills.
  // Its own message said "you accept less, not more"; −0.35 is less.
  const credit = openLimitPrice({ netMid: -0.40, spread: 0.20 });
  assert.ok(Math.abs(credit.net + 0.35) < 1e-9, "you accept less, not more");
  assert.equal(credit.limit, 0.35, "and the MAGNITUDE is what the ticket prints");
  const debit = openLimitPrice({ netMid: 0.40, spread: 0.20 });
  assert.ok(Math.abs(debit.net - 0.45) < 1e-9, "a debit offers to pay more");
});

/* THE OWNER'S XLE 2026-10-30 QUOTES, 23 Sep 2026: SELL 60P 1.22/1.27, BUY 57P
   0.49/0.53. The app suggested a credit of $75.75 — above the mid, on the side
   that never fills — while the ticket's own sliders summed to $71. */
const XLE_CREDIT_LEGS = [{ side: -1, qty: 1, strike: 60, type: "put" }, { side: 1, qty: 1, strike: 57, type: "put" }];
const XLE_CREDIT_QUOTES = [{ bid: 1.22, ask: 1.27 }, { bid: 0.49, ask: 0.53 }];

test("OPENING LIMIT — XLE credit put spread: suggested −0.7125, and it is a price that can fill", () => {
  const b = comboBook(XLE_CREDIT_LEGS, XLE_CREDIT_QUOTES);
  assert.ok(Math.abs(b.mid + 0.735) < 1e-9, "the mid is a credit of 0.735");
  assert.ok(Math.abs(b.spread - 0.09) < 1e-9, "the combination is 9 cents wide");
  assert.ok(Math.abs(b.ask + 0.69) < 1e-9, "the price that fills now is a credit of 0.69");
  const o = openLimitPrice({ netMid: b.mid, spread: b.spread });
  assert.ok(Math.abs(o.net + 0.7125) < 1e-9, `suggested net −0.7125 (receive $71.25), got ${o.net}`);
  const place = limitPlacement(o.limit, b);
  assert.equal(place.zone, "waiting", "between the mid and the side that fills");
  assert.notEqual(place.zone, "no-fill");
  assert.notEqual(place.zone, "unlikely");
});

test("OPENING LIMIT — PROPERTY: for any two-sided book the suggestion sits between the mid and the side that fills", () => {
  // A deterministic walk over debits and credits, wide and narrow, one to four
  // legs. The side that fills is `book.ask` — the structure as built, bought.
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let credits = 0, debits = 0;
  for (let i = 0; i < 2000; i++) {
    const n = 1 + Math.floor(rnd() * 4);
    const legs = [], quotes = [];
    for (let k = 0; k < n; k++) {
      const bid = Math.round((0.05 + rnd() * 5) * 100) / 100;
      const ask = Math.round((bid + 0.01 + rnd() * 0.6) * 100) / 100;
      legs.push({ side: rnd() < 0.5 ? 1 : -1, qty: 1 + Math.floor(rnd() * 2) });
      quotes.push({ bid, ask });
    }
    const b = comboBook(legs, quotes);
    if (!b.ok || Math.abs(b.mid) < 0.05) continue;
    const o = openLimitPrice({ netMid: b.mid, spread: b.spread });
    const lo = Math.min(b.mid, b.ask), hi = Math.max(b.mid, b.ask);
    if (Math.sign(b.ask) !== Math.sign(b.mid)) {
      // The far side is across zero: the sign floor holds instead.
      assert.equal(Math.sign(o.net), Math.sign(b.mid), `case ${i}: a concession never flips the sign`);
      continue;
    }
    assert.ok(o.net >= lo - 1e-9 && o.net <= hi + 1e-9,
      `case ${i}: mid ${b.mid}, fills at ${b.ask}, suggested ${o.net}`);
    assert.equal(Math.sign(o.net), Math.sign(b.mid), `case ${i}: the sign is the structure's`);
    if (b.mid < 0) credits++; else debits++;
  }
  assert.ok(credits > 100 && debits > 100, `both directions exercised (${credits} credits, ${debits} debits)`);
});

test("CLOSE LIMIT — UNCHANGED: a held credit pays more than the mid to close, a held debit receives less", () => {
  // closeLimitPrice() is on the do-not-touch list and was traced correct. This
  // locks it: the opening fix above must never be "mirrored" into the close.
  const heldCredit = closeLimitPrice({ netMid: -0.735, spread: 0.09 });
  assert.ok(Math.abs(heldCredit.net + 0.7575) < 1e-9, "buying back a credit concedes past the mid");
  const heldDebit = closeLimitPrice({ netMid: 0.40, spread: 0.20 });
  assert.ok(Math.abs(heldDebit.net - 0.35) < 1e-9, "selling a debit concedes under the mid");
  assert.ok(closeLimitPrice({ netMid: 0.02, spread: 0.40 }).net > 0, "and it never flips either");
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

/* ================================================================
   THE APP INVENTED A CONTRACT THAT DOES NOT EXIST (PRD §4n)

   >>> THE FOURTH ORDER, SOYB, 20 Sep 2026, 21:49, spot $27.64. <<<

       Alpaca refused it — HTTP 422. code 42210000:
       invalid legs: [leg.0 asset "SOYB261120C00027500" not found]

   Well formed, never issued. Four of the six order paths spelled
   `q?.occ || buildOcc(...)`, and `buildOcc()` FORMATS a symbol out of a strike
   the app chose — so an unquoted leg made the app name a contract nobody has
   ever listed and ask the broker to trade it.
================================================================ */

// The real leg off that board: the 27.5 call the chain never listed, sold
// against the 29 it did.
const SOYB_LEGS = [
  { side: 1, qty: 1, type: "call", strike: 27.5 },
  { side: -1, qty: 1, type: "call", strike: 29 },
];
const SOYB = (over = {}) => ({
  ticker: "SOYB", name: "Bull Call Spread", intent: "open", dte: 61, contracts: 1,
  legs: SOYB_LEGS, maxLoss: -67, maxProfit: 83,
  quotes: [{ bid: 0.6, ask: 0.75 }, { bid: 0.05, ask: 0.12 }], net: 0.67,
  ...over,
});
const BIG = { tradingCapital: 20000, concurrentTarget: 4 };
const run = (proposal, capital = BIG) =>
  evaluateTrade({ proposal, portfolio: EMPTY_BOOK, capital, signals: CONFLUENT });

test("THE SOYB LEG — an order whose leg has no occ from the chain is REFUSED, by name", () => {
  const r = run(SOYB({ occs: [null, "SOYB261120C00029000"] }));
  assert.equal(r.pass, false);
  assert.ok(codes(r).includes("UNLISTED_CONTRACT"), `expected UNLISTED_CONTRACT, got ${codes(r)}`);
  const m = messageFor(r, "UNLISTED_CONTRACT");
  // IT SAYS WHICH LEG. "The price is wrong" is not actionable and neither is
  // "a contract is missing"; the strike and the side are the whole of it.
  assert.match(m, /27\.5C/, "the refusal does not name the leg");
  assert.match(m, /buying/, "the refusal does not say which side of it he is on");
  assert.ok(!m.includes("29C"), "it names the leg the chain DID list");
  assert.match(m, /Nothing is sent/);
});

test("a leg the chain DID quote is unaffected, and a genuine ratio still sends", () => {
  const both = run(SOYB({ occs: ["SOYB261120C00027500", "SOYB261120C00029000"] }));
  assert.equal(both.pass, true, `${codes(both)}`);
  // A 1x2x1 butterfly: a genuine ratio, every contract listed. It passes the
  // gate and `orderBody` still writes 1, 2, 1 — the GCD rule is untouched.
  const fly = run({
    ticker: "SOYB", intent: "open", dte: 61, contracts: 1, maxLoss: -120, maxProfit: 380,
    legs: [
      { side: 1, qty: 1, type: "call", strike: 27 },
      { side: -1, qty: 2, type: "call", strike: 28 },
      { side: 1, qty: 1, type: "call", strike: 29 },
    ],
    quotes: [{ bid: 1.0, ask: 1.1 }, { bid: 0.5, ask: 0.6 }, { bid: 0.2, ask: 0.3 }],
    net: 1.2,
    occs: ["SOYB261120C00027000", "SOYB261120C00028000", "SOYB261120C00029000"],
  });
  assert.equal(fly.pass, true, `${codes(fly)}`);
  const body = orderBody({
    legs: [{ side: 1, qty: 1 }, { side: -1, qty: 2 }, { side: 1, qty: 1 }],
    occs: ["A", "B", "C"], userQty: 1, type: "limit", limit: "1.20", tif: "day", intent: "open",
  });
  assert.deepEqual(body.legs.map((l) => String(l.ratio_qty)), ["1", "2", "1"]);
});

test("UNKNOWN IS NOT MISSING — no occs at all tests nothing; an EMPTY array is an answer", () => {
  // The same discipline `quotes` gets: evidence the caller either has or does
  // not. A path that cannot answer is not told it failed.
  const silent = run(SOYB());
  assert.ok(!codes(silent).includes("UNLISTED_CONTRACT"), "a caller with no evidence was refused anyway");
  // ...but an empty array beside two real legs IS an answer: the chain listed
  // nothing. That is the case the SOYB order was.
  const empty = run(SOYB({ occs: [] }));
  assert.ok(codes(empty).includes("UNLISTED_CONTRACT"));
  const blank = run(SOYB({ occs: ["", "   "] }));
  assert.ok(codes(blank).includes("UNLISTED_CONTRACT"), "a blank string is not a symbol");
});

test("ENTRY ONLY — a close is never blocked because a feed went quiet", () => {
  const close = evaluateTrade({
    proposal: { ...SOYB(), intent: "close", occs: [null, null], maxLoss: 67 },
    portfolio: EMPTY_BOOK, capital: BIG,
  });
  assert.ok(!codes(close).includes("UNLISTED_CONTRACT"),
    "refusing to let somebody OUT of a position because a feed is quiet is the worse failure");
});

test("IT IS THE GATE'S BUSINESS, AND THE QUALITY FLOORS STILL ARE NOT", () => {
  const src = readFileSync(new URL("./riskGate.js", import.meta.url), "utf8");
  assert.match(src, /contractListing/, "the gate does not ask whether the contract exists");
  // The floors stay out, as they always have: a hand-built trade is the user's
  // to make. "Does this contract exist" is not a judgement about a trade.
  assert.equal(/qualityFloor|spreadFloor|comboSpreadFloor|modelSanity/.test(src), false);
});

test("contractListing() reports rather than deciding", () => {
  const none = contractListing({ legs: SOYB_LEGS, occs: null });
  assert.equal(none.checked, false);
  assert.equal(none.listed, true);
  assert.equal(none.reasons.length, 0);
  const one = contractListing({ legs: SOYB_LEGS, occs: [null, "X"] });
  assert.equal(one.checked, true);
  assert.equal(one.listed, false);
  assert.equal(one.missing.length, 1);
  assert.equal(one.missing[0].i, 0);
  assert.equal(one.missing[0].side, 1);
  // No legs at all is NO_STRUCTURE's business, not this one's.
  assert.equal(contractListing({ legs: [], occs: [] }).checked, false);
});

/* ---------------------------------------------------------------------
   THE TICKET'S GATE CALL WAS WEAKER THAN THE SCREEN ABOVE IT.

   `runGate(gate, { ticker, intent: "open", legs, dte, contracts, maxLoss,
   maxProfit, entryOverride })` passed NO quotes and NO net, so
   `priceability()` inside the gate saw only the maximum loss and could not
   refuse an unquoted leg — while the Build screen's `guard` memo, twenty lines
   of the same file away, passed both. The weaker of the two was the one
   guarding the send.

   This sweeps the SOURCE rather than the behaviour, for the same reason the
   rule-literal sweep does: the throw catches the call that runs, and the sweep
   catches the call written today that only runs on a market nobody demos.
--------------------------------------------------------------------- */
const GATE_CALL = /\b(?:runGate\s*\(\s*[A-Za-z_$][\w$]*\s*,\s*|gate\s*\(\s*|evaluateTrade\s*\(\s*)\{/g;
/** The object literal that starts at `i` (the `{`), balanced. */
function literalAt(src, i) {
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const c = src[j];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  return src.slice(i);
}
const OPEN_INTENT_EVIDENCE = ["quotes", "net", "occs"];

test("EVERY OPEN-INTENT GATE CALL CARRIES THE SAME EVIDENCE", () => {
  const files = ["App.jsx", "pro.jsx", "wizard.jsx", "riskGate.js"];
  let found = 0;
  for (const f of files) {
    const src = codeOf(f);
    let m;
    GATE_CALL.lastIndex = 0;
    while ((m = GATE_CALL.exec(src)) !== null) {
      const lit = literalAt(src, m.index + m[0].length - 1);
      if (!/intent:\s*"open"/.test(lit)) continue;
      found++;
      for (const key of OPEN_INTENT_EVIDENCE) {
        assert.ok(new RegExp(`(^|[{,\\s])${key}\\s*:`).test(lit),
          `${f}: an open-intent gate call leaves out \`${key}\`:\n${lit.slice(0, 260)}`);
      }
    }
  }
  // The guard itself has to have found something, or it is green on nothing.
  assert.ok(found >= 3, `only ${found} open-intent gate calls were swept`);
});

test("NO ORDER PATH MAY NAME A CONTRACT THE CHAIN DID NOT SUPPLY", () => {
  // `buildOcc()` stays — the Journal and the option-history panel legitimately
  // NAME a contract — but naming one is not asserting that it trades.
  const pro = codeOf("pro.jsx");
  assert.equal(/buildOcc/.test(pro), false,
    "pro.jsx builds an OCC symbol again; the chain is the only thing that knows which exist");
  const app = codeOf("App.jsx");
  // In App.jsx exactly ONE call survives, and it is the price-history button.
  const calls = (app.match(/buildOcc\s*\(/g) || []).length;
  assert.equal(calls, 1, `App.jsx calls buildOcc() ${calls} times; only the chart button may`);
  const send = app.slice(app.indexOf("const sendToAlpaca"), app.indexOf("const ivRank"));
  assert.equal(/buildOcc/.test(send), false, "the manual multileg ticket invents a symbol again");
});

/* ==========================================================================
   TASK 2 — THE EXPOSURE COUNTED TRADES NOBODY BOUGHT.

   Read on the owner's phone, SOYB, 21 September 2026, 09:14: the gate said
   "$1,042 already at risk" against ZERO open positions. The three rows were
   450 + 577 + 14 — the three entries sitting under WATCHING, every one of
   them an order the broker came back on with nothing bought.
   ========================================================================== */
// The three rows exactly as the phone showed them: sent, dead at the broker.
const NOT_TAKEN = [
  { ticker: "SOYB", maxLoss: -450, contracts: 1, alpacaId: "o1", alpacaStatus: "canceled", alpacaFilled: false },
  { ticker: "BOIL", maxLoss: -577, contracts: 1, alpacaId: "o2", alpacaStatus: "expired", alpacaFilled: false },
  { ticker: "UNG", maxLoss: -14, contracts: 1, alpacaId: "o3", alpacaStatus: "canceled", alpacaFilled: false },
];

test("THE THREE PHONE ROWS ARE not-taken, and bookPositions() drops all three", () => {
  assert.deepEqual(NOT_TAKEN.map(positionStage), ["not-taken", "not-taken", "not-taken"]);
  assert.deepEqual(bookPositions(NOT_TAKEN), []);
});

test("$1,042 OF PHANTOM EXPOSURE IS $0 — the gate measures the book, not the decisions log", () => {
  const raw = evaluateTrade({
    proposal: GOOD_TRADE, portfolio: { positions: NOT_TAKEN, account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(raw.limits.openRisk, 1041, "the fixture must reproduce the phone's figure");

  const fixed = evaluateTrade({
    proposal: GOOD_TRADE, portfolio: { positions: bookPositions(NOT_TAKEN), account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(fixed.limits.openRisk, 0, "a trade nobody bought is still eating the exposure ceiling");
  assert.match(raw.limits.paper.why, /paper/);

  // AND IT DOES NOT ONLY PRINT A FALSE NUMBER — IT SPENDS THE CEILING.
  // $5,000 of capital gives a $1,250 total ceiling. $1,041 of phantom risk
  // leaves $209, so a $220 trade — comfortably inside the $250 per-trade cap
  // — is refused for an exposure that does not exist.
  const sized = trade({ maxLoss: -220 });
  const blocked = evaluateTrade({ proposal: sized, portfolio: { positions: NOT_TAKEN, account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.deepEqual(codes(blocked), ["TOTAL_EXPOSURE"]);
  const allowed = evaluateTrade({ proposal: sized, portfolio: { positions: bookPositions(NOT_TAKEN), account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(allowed.pass, true, "the same trade against the real book is inside every limit");
});

test("A WORKING ORDER COUNTS, BECAUSE IT CAN STILL FILL", () => {
  const working = [{ ticker: "SOYB", maxLoss: -450, contracts: 1, alpacaId: "o9", alpacaStatus: "new", alpacaFilled: false }];
  assert.equal(positionStage(working[0]), "working");
  assert.deepEqual(bookPositions(working), working);
  const r = evaluateTrade({ proposal: GOOD_TRADE, portfolio: { positions: bookPositions(working), account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.limits.openRisk, 450, "an order standing at the broker is money committed");
});

test("UNKNOWN IS NOT DEAD — a record the broker has not been asked about stays in the book", () => {
  const unknown = [{ ticker: "SOYB", maxLoss: -450, contracts: 1, alpacaId: "o9" }];
  assert.deepEqual(bookPositions(unknown), unknown);
});

test("AN OWNED POSITION IS COUNTED AT ITS SIZE, not at one combination", () => {
  const owned = [{ ticker: "SOYB", maxLoss: -100, contracts: 5, alpacaId: "o1", alpacaStatus: "filled", alpacaFilled: true }];
  const r = evaluateTrade({ proposal: GOOD_TRADE, portfolio: { positions: bookPositions(owned), account: PAPER },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(r.limits.openRisk, 500);
});

test("bookPositions() survives the shapes a store can really hold", () => {
  assert.deepEqual(bookPositions(), []);
  assert.deepEqual(bookPositions(null), []);
  assert.deepEqual(bookPositions(undefined), []);
  assert.deepEqual(bookPositions([{}]), [{}], "a record with no alpacaId is the app's own book: owned");
});

test("NO CONSUMER THAT MEASURES MONEY READS store.positions RAW AGAIN", () => {
  // A source sweep, for the same reason the rule-literal sweep is one: the
  // throw catches the call that runs, the sweep catches the one written today
  // that only runs on a book nobody demos.
  const app = codeOf("App.jsx");
  const gateCall = app.slice(app.indexOf("const gate = useCallback"), app.indexOf("const gate = useCallback") + 420);
  assert.equal(/positions:\s*bookPositions\(store\.positions\)/.test(gateCall), true,
    "the risk gate reads store.positions whole again");
  const pro = codeOf("pro.jsx");
  for (const m of pro.match(/store\.positions/g) || []) void m;
  const raw = (pro.match(/(?<!bookPositions\()store\.positions/g) || []).length;
  assert.equal(raw, 0, `pro.jsx reads store.positions raw ${raw} time(s); the report is the book`);
  for (const f of ["autopilot.mjs", "approve.mjs"]) {
    const src = readFileSync(new URL(`../netlify/functions/${f}`, import.meta.url), "utf8");
    assert.equal(/bookPositions\(/.test(src), true, `${f} does not read the book through bookPositions()`);
  }
});

/* ==========================================================================
   TASK 3 — THE CHECKS SHOWN ARE THE CHECKS THE TAP RUNS.

   The Build screen's checklist was evaluated against LOCAL_BOOK ("local
   simulation, no broker involved") while the send beside it gates against the
   Alpaca account. They agreed only by luck: the gate reads the account for
   `paperStatus()` and nothing else, and the local book always passes it — so
   the list the owner read could not fail.
   ========================================================================== */
test("THE TWO BOOKS GIVE DIFFERENT ANSWERS, so which one is displayed is not cosmetic", () => {
  const LOCAL = { paperVerified: true, paperSource: "local simulation, no broker involved" };
  const UNVERIFIED = { account_number: "8899XYZ" };   // a connected account that is not provably paper
  const local = evaluateTrade({ proposal: GOOD_TRADE, portfolio: { positions: [], account: LOCAL },
    capital: CAPITAL, signals: CONFLUENT });
  const broker = evaluateTrade({ proposal: GOOD_TRADE, portfolio: { positions: [], account: UNVERIFIED },
    capital: CAPITAL, signals: CONFLUENT });
  assert.equal(local.pass, true);
  assert.equal(broker.pass, false, "an unverifiable account must refuse the order — rule 1");
  assert.deepEqual(codes(broker), ["PAPER_MODE"]);
  assert.notEqual(local.limits.paper.why, broker.limits.paper.why,
    "the paper SOURCE is what the checklist prints; the two must be distinguishable");
});

test("THE DISPLAYED CHECKLIST AND THE SEND USE ONE EXPRESSION, and App.jsx spells it once", () => {
  const app = codeOf("App.jsx");
  // LOCAL_BOOK may be named exactly twice: where it is defined, and inside
  // `bookFor()`. A third mention is a screen choosing its own account again.
  const mentions = (app.match(/LOCAL_BOOK/g) || []).length;
  assert.equal(mentions, 2, `App.jsx names LOCAL_BOOK ${mentions} times; only the constant and bookFor() may`);
  assert.equal(/const bookFor = useCallback\(\(viaBroker\) => \(viaBroker \? alpaca : LOCAL_BOOK\)/.test(app), true,
    "bookFor() is not the one place the account is chosen any more");
  // The displayed guard is the SEND's account.
  const guard = app.slice(app.indexOf("const guard = useMemo"), app.indexOf("const guard = useMemo") + 1800);
  assert.equal(/bookFor\(!!alpaca\)/.test(guard), true, "the checklist is gated against a different account than the send");
  // And the record is gated against the account the trade actually went to.
  const commit = app.slice(app.indexOf("const commitPosition"), app.indexOf("const commitPosition") + 4000);
  assert.equal(/bookFor\(!!alpacaOrder\)/.test(commit), true, "the record names an account the trade did not go to");
});

test("checkedAgainstNote() names the account, and says which tap the checks belong to", () => {
  const via = checkedAgainstNote(true, "the proxy routed this to paper-api.alpaca.markets");
  assert.match(via, /Alpaca paper account/);
  assert.match(via, /paper-api\.alpaca\.markets/);
  assert.match(via, /SEND button/);
  const local = checkedAgainstNote(false, null);
  assert.match(local, /own paper book/);
  assert.match(local, /leaves the browser/);
  assert.equal(/could not be established/.test(checkedAgainstNote(true, null)), true,
    "a missing source must be named, never left blank");
});

/* ==========================================================================
   TASK 1 — the sentences that came with the preset fix.
   ========================================================================== */

test("offBoardStrikeLabel() is written once, and it names the strike", () => {
  assert.equal(offBoardStrikeLabel(27.5), "27.5 \u00b7 not on this board");
  const app = codeOf("App.jsx");
  assert.equal(/not on this board/.test(app.replace(/offBoardStrikeLabel/g, "")), false,
    "App.jsx writes the sentence itself instead of reading the one home for it");
});

test("buildPresets() REFUSES A NULL BOARD, and the preset effect waits for one", () => {
  const app = codeOf("App.jsx");
  const fn = app.slice(app.indexOf("export function buildPresets"), app.indexOf("export function buildPresets") + 300);
  assert.equal(/if \(!strikes \|\| !strikes\.length\) return \[\];/.test(fn), true,
    "buildPresets() builds from a fallback grid again");
  assert.equal(/if \(!spot \|\| !expStrikes \|\| legs\.length !== 0\) return;/.test(app), true,
    "the default-preset effect fires before the board is known again");
  // And the two inline copies of expiryStrikes() are gone.
  const copies = (app.match(/new Set\(\[\.\.\.Object\.keys\([a-z.]*\.?byExp\[[a-zA-Z]+\]\.calls\)/g) || []).length;
  assert.equal(copies, 0, `App.jsx re-implements expiryStrikes() ${copies} time(s)`);
});

/* ================================================================
   THE RADAR MUST NOT GET LONGER WHEN THE BASKET DOES (ROADMAP P2-bis)
================================================================ */






/* ================================================================
   TASK 3 — ONE CHAIN, ONE OPEN INTEREST, ONE VERDICT

   >>> READ ON THE OWNER'S PHONE, 21 Sep 2026, one session. <<<
   Radar: "on BOIL, WEAT, USO, SLV and GDX the feed reported no open
   interest at all, so the liquidity floor was SKIPPED".
   Shortlist, same session, same chain: GDX near-the-money median OI 84,
   76% clearing the 10-contract minimum, "the 63 emptiest of the 96
   contracts" removed. And the guided run's number-one road was a GDX
   butterfly 94.5 / 89×2 / 85 with legs at OI 3 and OI 4.

   The cause is a return value. Open interest is not in an option
   snapshot; it is fetched separately and PATCHED IN, so `refreshChain()`
   returned the BARE chain while `chains[tk]` in state later carried the
   numbers. The Shortlist read state, the wizard and the wide search read
   the return value.
================================================================ */

test("OPEN INTEREST — the wizard and the wide search await the same chain the Shortlist reads", () => {
  const app = codeOf("App.jsx");
  // ONE HOME for "the chain with its open interest".
  assert.ok(/const ensureOpenInterest = useCallback/.test(app),
    "there must be one function that answers 'has this chain's open interest landed'");
  // Both generation sites go through it. The Shortlist is handed `chains[tk]`
  // from state, which the same function patches.
  const bare = app.match(/chains\[tk\] \|\| \(await refreshChain\(tk, true\)\)/g) || [];
  const wrapped = app.match(/ensureOpenInterest\(tk, chains\[tk\] \|\| \(await refreshChain\(tk, true\)\)\)/g) || [];
  assert.equal(bare.length, wrapped.length,
    "every generation site that judges a liquidity floor must await the open interest, not the bare chain");
  // PR #40: the guided run and the wide search are gone. Find reads
  // `chains[tk]` from state, which `ensureOpenInterest()` patches — the way
  // the Shortlist always did — and its memo re-runs when the column lands.
  assert.ok(/const findGen = useMemo/.test(app) && /const c = chains\[tk\];/.test(app),
    "Find judges the chain in state, the one ensureOpenInterest() patches");
  // ...and the SCREEN still never waits: refreshChain fires it and moves on.
  assert.ok(/ensureOpenInterest\(tk, c\);/.test(app),
    "refreshChain must fire the enrichment without awaiting it");
  assert.equal(/await ensureOpenInterest\(tk, c\)/.test(app), false,
    "the chain must still reach the screen before its open interest does");
  // The old shape — a second enrichOpenInterest call site — is gone.
  assert.equal((app.match(/enrichOpenInterest\(/g) || []).length, 1,
    "enrichOpenInterest is called in exactly one place");
});

test("OPEN INTEREST — unknown is still SKIPPED, never rejected", () => {
  /* The half that was always right: a chain that genuinely carries no open
     interest must still skip the floor rather than fail every leg on it.
     `qualityFloor()` is unchanged by this work and this holds it so. */
  const unknown = qualityFloor({
    openInterest: [null, null], peerOpenInterest: [], level: RECOMMENDED_LIQUIDITY,
    quotes: [{ bid: 1.0, ask: 1.1 }, { bid: 0.5, ask: 0.6 }],
    legs: [{ side: 1, qty: 1 }, { side: -1, qty: 1 }],
    maxProfit: 60, maxLoss: -40,
  });
  assert.equal(unknown.liquidity.checked, false, "no open interest: the floor is SKIPPED");
  assert.equal(unknown.liquidity.pass, true, "and never failed");
  // A REAL ZERO IS A REAL READING and still fails.
  const zero = qualityFloor({
    openInterest: [0, 0], peerOpenInterest: [40, 50, 60, 80, 100, 120, 140, 160],
    level: RECOMMENDED_LIQUIDITY,
    quotes: [{ bid: 1.0, ask: 1.1 }, { bid: 0.5, ask: 0.6 }],
    legs: [{ side: 1, qty: 1 }, { side: -1, qty: 1 }],
    maxProfit: 60, maxLoss: -40,
  });
  assert.equal(zero.liquidity.checked, true);
  assert.equal(zero.liquidity.pass, false);
});

test("BUTTERFLIES — the guided path does not offer one, and it is a SHAPE not a name", () => {
  const K = (strike, type, q) => ({ side: Math.sign(q), qty: Math.abs(q), type, strike });
  // The four spellings `buildPresets()` carries today.
  assert.equal(isButterfly([K(58, "call", 1), K(60, "call", -2), K(62, "call", 1)]), true, "Call Butterfly ATM");
  assert.equal(isButterfly([K(62, "put", 1), K(60, "put", -2), K(58, "put", 1)]), true, "Bearish Put Butterfly");
  assert.equal(isButterfly([K(60, "call", 1), K(63, "call", -2), K(66, "call", 1)]), true, "Bullish Call Butterfly");
  assert.equal(isButterfly([K(58, "put", 1), K(60, "put", -1), K(60, "call", -1), K(62, "call", 1)]), true, "Iron Butterfly");
  // AND NOTHING ELSE. A condor's shorts are on TWO strikes; that is the whole
  // difference, and it is why the test is on the shape rather than the name.
  assert.equal(isButterfly([K(56, "put", 1), K(58, "put", -1), K(62, "call", -1), K(64, "call", 1)]), false, "Iron Condor");
  assert.equal(isButterfly([K(60, "call", 1), K(62, "call", -1)]), false, "vertical");
  assert.equal(isButterfly([K(60, "call", 1)]), false, "single leg");
  assert.equal(isButterfly([]), false);
  assert.equal(isButterfly(null), false);
});

test("BUTTERFLIES — a FLAG on the card since PR #40, never a silent cut", () => {
  const app = codeOf("App.jsx");
  // The guided run excluded them in silence; it is gone. `candidateFlags()`
  // names one on its card, and the flag toggle is the only thing that hides it.
  assert.equal((app.match(/isButterfly\(/g) || []).length, 0, "no screen drops one by itself");
  assert.ok(/candidateFlags\(/.test(app), "Find flags what the guided door used to drop");
  const rules = codeOf("rules.js");
  assert.ok(/isButterfly\(legs\)/.test(rules.slice(rules.indexOf("export function candidateFlags"))),
    "and the flag reads the shape from the one home");
  // `buildPresets()` still builds them: the desk is unchanged.
  const src = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  for (const name of ["Bearish Put Butterfly", "Iron Butterfly", "Call Butterfly ATM", "Bullish Call Butterfly"]) {
    assert.ok(src.includes(name), `${name} must survive in buildPresets() for the full desk`);
  }
});

test("BUTTERFLIES — the count travels separately and has its own sentence", () => {
  // Not a floor: it is not a judgement about the price, so pooling it with a
  // floor's count would explain neither. Same discipline as `unpriceable`.
  const n = butterflySkipNote();
  assert.ok(n.includes(String(RULES.exitDTE)), "the sentence names the rule it is about");
  assert.ok(/full desk/.test(n), "and says where they are still reachable");
  assert.ok(!/liquidity|spread|reward/.test(n), "it is not a quality floor and must not sound like one");
});

/* ================================================================
   P9 TASK 0b — ONE P&L PER POSITION, AND IT IS THE BROKER'S

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026. <<< The Positions card
   printed -$127 in the largest red figure on the screen, directly
   above the broker's own panel printing -$130 for the same XLE
   position. `posAlerts` preferred `unrealized_pl`; the CARD a few
   hundred lines below re-derived its own from `netValue()`.
================================================================ */

test("0b — THE BROKER'S FIGURE WINS, and it is read rather than recomputed", () => {
  const r = positionPnl({ brokerPnl: -130, modelPnl: -127 });
  assert.equal(r.pnl, -130, "the account's number, not the app's model of it");
  assert.equal(r.source, BROKER_PNL);
  assert.equal(r.live, true);
  assert.equal(r.sentence, null, "a figure read off the account needs no apology");
});

test("0b — THE APP'S MARK SURVIVES WHERE THERE IS NO BROKER FIGURE, AND SAYS SO", () => {
  const r = positionPnl({ brokerPnl: null, modelPnl: -127, feed: "CBOE" });
  assert.equal(r.pnl, -127);
  assert.equal(r.source, MODEL_PNL);
  assert.equal(r.live, false);
  assert.ok(r.sentence, "it may never be printed silently beside a broker's");
  assert.ok(/APP'S OWN MARK/.test(r.sentence));
  assert.ok(r.sentence.includes("CBOE"), "and it names the feed it priced from");
});

test("0b — AN UNASKED BROKER IS NOT A BROKER REPORTING ZERO", () => {
  // `Number(null)` is 0 and 0 is finite, for the eighth time in this repo.
  assert.equal(positionPnl({ brokerPnl: null, modelPnl: null }).pnl, null);
  assert.equal(positionPnl({ brokerPnl: null, modelPnl: null }).source, null);
  assert.equal(positionPnl({ brokerPnl: "", modelPnl: -5 }).source, MODEL_PNL);
  // ...and a real 0 from the broker IS a reading.
  assert.equal(positionPnl({ brokerPnl: 0, modelPnl: -127 }).pnl, 0);
  assert.equal(positionPnl({ brokerPnl: 0, modelPnl: -127 }).source, BROKER_PNL);
});

test("0b — `App.jsx` SPELLS THE POSITION P&L ONCE, through `pnlOf()`", () => {
  /* The same discipline `chanceCheckOf()` and `modelCheckOf()` hold. Two
     spellings is exactly how one XLE position came to print two figures. */
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  const derived = app.match(/netValue\([\s\S]{0,160}?-\s*p\.entryNet/g) || [];
  assert.equal(derived.length, 1,
    `the position mark is derived in ${derived.length} places; it belongs only inside pnlOf()`);
  // Comments naming the field are prose; a READ of it is `x.unrealized_pl`.
  assert.equal((app.match(/\.unrealized_pl/g) || []).length, 1,
    "and the broker's own figure is READ in exactly one place, inside the same callback");
  assert.ok(/const pnlOf = useCallback/.test(app), "and that place is `pnlOf`");
});

/* ================================================================
   P9 TASK 1 — THE SOURCE SWEEPS (the arithmetic half is in
   ceiling.test.jsx, against the real generation sites).
================================================================ */

test("TASK 1 — the horizon control cannot ask for a board the gate would refuse", () => {
  // PR #40: the horizon is one control in Find's request block (card.jsx).
  const card = readFileSync(new URL("./card.jsx", import.meta.url), "utf8");
  const slider = card.match(/<input type="range" aria-label="horizon in days"[^>]*>/);
  assert.ok(slider, "the horizon slider moved; point this at it again");
  assert.ok(!/min=\{21\}/.test(slider[0]), "21 is RULES.exitDTE wearing a horizon's clothes");
  assert.ok(/min=\{RULES\.minEntryDTE\}/.test(slider[0]), "both ends read their rule");
  assert.ok(/max=\{RULES\.maxEntryDTE\}/.test(slider[0]));
  // ...and the label says WHY, in one clause, from the rule.
  assert.ok(horizonFloorNote().includes(String(RULES.minEntryDTE)));
  assert.ok(/the gate would refuse/.test(horizonFloorNote()));
});

test("TASK 1 — every generation site reads the one home, none filters expiries by hand", () => {
  // COMMENTS STRIPPED, because the comments beside these sites QUOTE the
  // windows they replaced — which is the point of them, and would otherwise
  // make the sweep fail on its own explanation.
  const app = codeOf("App.jsx");
  // The three windows this closed: `dT - 20` / `dT + 35`, a bare 130, and none.
  assert.ok(!/dte >= dT - 20/.test(app), "the wide search's own window is gone");
  assert.ok(!/\.dte <= 130/.test(app), "and the guided run's bare 130");
  const uses = app.match(/buildableExpiries\(/g) || [];
  assert.ok(uses.length >= 1, `Find, the one generation site, must read it; found ${uses.length}`);
  // ...and the third site holds the guard INSIDE itself, so a fourth caller
  // added next year is covered without anybody coming back.
  assert.ok(/if \(!openableBoard\(dte\)\)/.test(app));
});

test("TASK 1 — an empty Find list says why with counts, and offers no button onto a refused trade", () => {
  // PR #40: "Nothing today" appears only when zero candidates pass, with the
  // count for every reason, and the step forward stays disabled with nothing loaded.
  const line = nothingTodayLine({ liquidity: 3, reward: 2 }, { noBoard: ["XLE"], noChain: ["UNG"] });
  assert.ok(/^Nothing today\./.test(line));
  assert.ok(line.includes("3 too little open interest") && line.includes("2 pays too little"));
  assert.ok(line.includes("XLE") && line.includes("UNG"));
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  assert.ok(/findGen\.items\.length === 0 && \(/.test(app), "only when zero candidates pass");
  assert.ok(/disabled=\{!legs\.length\}/.test(app), "and the button says so rather than naming a structure");
});

/* ================================================================
   P9 TASK 2 — A POSITION SAYS ONE THING

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026, XLE, in one scroll. <<<
       home      "all inside the plan. Nothing to do"
       desk      "TODAY · EVERYTHING IS ON PLAN"
       the row   "Losing: check the reason you opened it"
       verdict   "-> HOLD"
       stat      "OF THE MAXIMUM  -3188%"
   For a trade that can make $4 and can lose $346.
================================================================ */

// XLE J-0002 as the owner's screen carries it: the §4q inversion turned a $75
// credit into $4, and nothing has asked the entry question since.
const XLE_EDGE = { maxProfit: 4, maxLoss: -346, pnl: -127 };

test("TASK 2 — the entry question, asked of an open position, and BOTH readings", () => {
  const e = remainingEdge(XLE_EDGE);
  assert.equal(e.known, true);
  // From the current mark: $131 still to make, $219 still to lose.
  assert.equal(e.reward, 131);
  assert.equal(e.risk, 219);
  assert.ok(Math.abs(e.ratio - 131 / 219) < 1e-9);
  // And the reading that damns it: $4 against $346, forty times under the floor.
  assert.ok(Math.abs(e.ceilingRatio - 4 / 346) < 1e-9);
  assert.equal(e.thin, true, "either one being thin is an attention item");
  assert.equal(e.thinReason, "ceiling");
});

test("TASK 2 — the sentence names BOTH dollar figures and the rule", () => {
  const e = remainingEdge(XLE_EDGE);
  assert.ok(e.sentence.includes("$4"), "what it can make");
  assert.ok(e.sentence.includes("$346"), "what it can lose");
  assert.ok(/would not open this trade today/.test(e.sentence));
  // >>> AND IT IS NOT AN EXIT RULE. <<<
  assert.ok(/Nothing closes on this/.test(e.sentence));
  assert.ok(/frozen/.test(e.sentence), "the exit rules were chosen at construction");
  assert.ok(/the same way the stop is/.test(e.sentence), "a warning, like the stop");
  assert.ok(remainingEdgeLabel(e).includes("$4") && remainingEdgeLabel(e).includes("$346"));
});

test("TASK 2 — a healthy position is not an attention item, so this is not a wall", () => {
  const e = remainingEdge({ maxProfit: 320, maxLoss: -180, pnl: 10 });
  assert.equal(e.thin, false);
  assert.equal(e.sentence, null);
  assert.equal(remainingEdgeLabel(e), null);
});

test("TASK 2 — UNKNOWN IS NOT A THIN EDGE: no ceiling and no mark both SKIP", () => {
  // `Number(null)` is 0 and 0 is finite, for the ninth time in this repository.
  assert.equal(remainingEdge({ maxProfit: null, maxLoss: -300, pnl: -10 }).known, false,
    "an unbounded payoff has no ceiling to take a ratio of");
  assert.equal(remainingEdge({ maxProfit: 300, maxLoss: -300, pnl: null }).known, false,
    "and a position with no readable mark has no 'from here'");
  assert.equal(remainingEdge({}).thin, false, "unknown is never thin");
});

test("TASK 2 — the exit rules are untouched: this adds no verdict and no rule exit", () => {
  // The gate, the autopilot menu and `ruleExitOf()` must not know it exists.
  const rules = codeOf("rules.js");
  assert.ok(!/remainingEdge/.test(codeOf("riskGate.js")), "it is not in the gate");
  const verdicts = rules.match(/AUTOPILOT_VERDICTS = \[([^\]]*)\]/);
  assert.ok(verdicts && !/THIN|EDGE/.test(verdicts[1]), "and not on the autopilot's menu");
  assert.equal(RULES.takeProfitPct, 0.5, "50% of max profit, unchanged");
  assert.equal(RULES.stopLossPct, 0.5, "the stop, unchanged");
  assert.equal(RULES.exitDTE, 21, "21 DTE, unchanged");
});

test("TASK 2 — \"OF THE MAXIMUM\" prints a percent only above MIN_NET_DOLLARS", () => {
  // -$127 against a $4 maximum is -3188%: a true division and a false sentence.
  const tiny = shareOfMaximum(-127, 4);
  assert.equal(tiny.pct, null);
  assert.ok(!/%/.test(tiny.text), `printed ${tiny.text}`);
  assert.ok(tiny.note.includes(money(MIN_NET_DOLLARS)), "and says which rule stopped it");
  // Above it, it is exactly the number it always was.
  assert.equal(shareOfMaximum(160, 320).text, "50%");
  assert.equal(shareOfMaximum(null, 320).text, "—");
  assert.equal(shareOfMaximum(160, null).text, "—", "no ceiling is a dash, never 0%");
});

test("TASK 2 — no headline may say \"nothing to do\" while an attention item exists", () => {
  const watching = [{ level: "watch" }, { level: "ok" }];
  const a = attentionCount(watching);
  assert.equal(a.decisions, 0, "no RULE has fired, so the badge stays quiet");
  assert.equal(a.looks, 1, "but one row says to look at it");
  assert.equal(a.quiet, false, "so the book is not quiet");
  assert.equal(attentionCount([{ level: "ok" }]).quiet, true);
  assert.equal(attentionCount([]).quiet, true);
  // And the two screens that print the headline read this, not their own filter.
  const app = codeOf("App.jsx");
  assert.ok(/attentionCount\(posAlerts\)/.test(app));
  assert.ok(!/posAlerts\.filter\(\(a\) => a\.level === "action"\)/.test(app),
    "the hand-written filter that produced the contradiction is gone");
});

test("TASK 2 — ONE CLOSE CONTROL PER POSITION", () => {
  const held = { id: 1, ref: "J-0002", ticker: "XLE", expKey: "2026-10-30", alpacaHeld: true, legs: [] };
  const book = [held];
  assert.equal(positionForHolding(book, { ticker: "XLE", expKey: "2026-10-30" }), held);
  // A holding this app has NO record of keeps the broker panel's own button:
  // removing it would strand a position with no way out of this app at all.
  assert.equal(positionForHolding(book, { ticker: "GLD", expKey: "2026-10-30" }), null);
  assert.equal(positionForHolding(book, { ticker: "XLE", expKey: null }), null);
  // ...and only an OWNED record counts: pointing at a "Close" button on a row
  // that is not in the Positions list is a door with nothing behind it.
  const notTaken = { id: 2, ticker: "SOYB", expKey: "2026-11-20", alpacaId: "x", alpacaStatus: "canceled", legs: [] };
  assert.equal(positionStage(notTaken), "not-taken");
  assert.equal(positionForHolding([notTaken], { ticker: "SOYB", expKey: "2026-11-20" }), null);
  const note = sameCloseNote("J-0002");
  assert.ok(note.includes("J-0002") && /Positions screen/.test(note));
  assert.ok(/asks what ended the trade/.test(note), "and says WHY it is the one to use");
});

/* ---------------- summary ---------------- */
/* ====================================================================
   ROADMAP P10 §2 — ONE STATE FOR "WHAT I WANT", AND THE SIZE TRAVELS
==================================================================== */

test("REQUEST — the amount is DERIVED from the per-trade limit, never typed", () => {
  const limits = sizing({ tradingCapital: 5000, concurrentTarget: 4 });
  const r = requestOf({}, limits);
  assert.equal(r.amt, Math.round(limits.perTradeLimit),
    "the starting amount is the sizing() result, not a number somebody wrote down");
  assert.equal(r.amtAnswered, false, "a derived default is not an answer");
  assert.equal(r.answered, false);
  assert.match(requestAmountOwner(r), /suggested/,
    "until it is answered, every screen calls it a suggestion");
  // ...and once it IS answered it is the user's, and it is what is read.
  const typed = requestOf({ amt: 400 }, limits);
  assert.equal(typed.amt, 400);
  assert.equal(typed.amtAnswered, true);
  assert.equal(requestAmountOwner(typed), "your answer");
});

test("REQUEST — Number(null) is 0 and 0 is finite, for the seventh time", () => {
  // An amount of 0, null, "" or NaN is NOT an answer of zero.
  for (const amt of [null, undefined, 0, "", NaN, -50]) {
    const r = requestOf({ amt }, { perTradeLimit: 250 });
    assert.equal(r.amtAnswered, false, `${String(amt)} is not an answer`);
    assert.equal(r.amt, 250, "it falls back to the derived limit");
  }
  // ...and with no limits at all there is no number, rather than a zero.
  assert.equal(requestOf({}, {}).amt, null);
  assert.equal(requestOf({}, { perTradeLimit: 0 }).amt, null);
});

test("REQUEST — the mode is one of two, and the label follows it", () => {
  assert.deepEqual(REQUEST_MODES, ["budget", "target"]);
  assert.equal(requestOf({ mode: "nonsense" }, {}).mode, "budget", "an unknown mode is the default");
  assert.match(requestAmountLabel("budget"), /RISK/);
  assert.match(requestAmountLabel("target"), /PROFIT/);
});

test("REQUEST — the slider's band and step live in RULES, and it is clamped", () => {
  for (const k of ["chanceAskMin", "chanceAskMax", "chanceAskStep", "chanceAskDefault"]) {
    assert.equal(typeof RULES[k], "number", `${k} has a home in RULES`);
  }
  assert.ok(RULES.chanceAskMin < RULES.chanceAskDefault && RULES.chanceAskDefault < RULES.chanceAskMax,
    "the default is inside the band it is the default of");
  assert.equal(clampAskedChance(0.99), RULES.chanceAskMax);
  assert.equal(clampAskedChance(0.01), RULES.chanceAskMin);
  assert.equal(clampAskedChance(null), RULES.chanceAskDefault, "unknown is the default, never a zero");
  assert.equal(requestOf({ minChance: 2 }, {}).minChance, RULES.chanceAskMax);
  assert.equal(requestOf({}, {}).chanceAnswered, false);
  // THE STEP IS COARSER THAN THE SIMULATION'S OWN ERROR. At `mcRuns` the
  // standard error is about half a point; a step finer than that would move
  // rows between the two sections on sampling noise.
  assert.ok(RULES.chanceAskStep >= 0.02,
    "a step finer than the Monte Carlo's own error is a control that appears to do what it did not");
  // AND IT IS NOT THE REWARD FLOOR. `minRewardRisk` stays a FIXED rule.
  assert.equal(RULES.minRewardRisk, 0.25, "the reward floor is not a control and does not move");
});

test("REQUEST — the contract count says whose number it is", () => {
  const r = requestOf({ amt: 500 }, { perTradeLimit: 250 });
  assert.match(contractsSourceNote({ contracts: 3, typed: true, request: r }), /yours/);
  assert.match(contractsSourceNote({ contracts: 3, typed: true, request: r }), /overrides the budget/);
  assert.match(contractsSourceNote({ contracts: 3, typed: false, request: r }), /buys/);
  assert.match(contractsSourceNote({ contracts: 1, typed: false, request: r, fits: false }), /buys none/);
  const t = requestOf({ mode: "target", amt: 500 }, {});
  assert.match(contractsSourceNote({ contracts: 2, typed: false, request: t }), /reaches/);
  // Every one of them names the count itself, so the clause cannot drift from
  // the field it sits under.
  for (const typed of [true, false]) {
    assert.match(contractsSourceNote({ contracts: 7, typed, request: r }), /x7/);
  }
});

test("ONE HOME — App.jsx keeps no second copy of the budget or the size", () => {
  const app = codeOf("App.jsx");
  /* `optMode` / `optAmt` were Build-and-Shortlist state and `wiz.risk` was the
     guided run's: two states, one question. A reappearance of either name is a
     second home, and the Build screen's hardcoded 500 beside the wizard's
     derived 250 is what that costs. */
  for (const name of ["optMode", "optAmt", "optAmtTyped", "setOptAmt", "setOptMode"]) {
    assert.equal(new RegExp(`\\b${name}\\b`).test(app), false,
      `${name} is back in App.jsx: the request has one home (ROADMAP P10 §2)`);
  }
  assert.equal(/risk:\s*null/.test(app), false,
    "`wiz` carries its own budget again: it must READ `want.amt`, not hold a copy");
  assert.ok(/requestOf\(/.test(app), "App.jsx reads the request through its one home");
  /* AND THE SIZE IS DERIVED FROM IT RATHER THAN RESET. `setContracts(1)` on a
     ticker change was a budget answered once and thrown away three screens
     later. */
  assert.equal(/setContracts\(1\)/.test(app), false,
    "a ticker change RE-DERIVES the size from the budget; it does not forget it");
  assert.ok(/scaleStrategy\(AE, request\.mode, request\.amt\)/.test(app),
    "Build sizes from the one home, at the price the order will be sent at");
  /* AND THE WIDE SEARCH STOPPED ROLLING ITS OWN. `Math.floor(amt / Math.max(1,
     ...))` is the shape that turned a $250 budget into 250 contracts. */
  assert.equal(/Math\.floor\(\s*optAmt/.test(app), false);
  assert.equal(/Math\.floor\(\s*request\.amt/.test(app), false,
    "the size has ONE home and scaleStrategy() is it");
});

/* ====================================================================
   ROADMAP P10 §3 — THE LIST SPLITS, AND MEMBERSHIP IS LIVE
==================================================================== */

/* One fixture row, and a `scaleStrategy()`-shaped sizer for it. The sizer is
   HANDED IN on purpose: how many combinations a budget buys has one home and
   `rules.js` is not it. */
const P10_ROW = { name: "Bull Call Spread", pop: 0.62, maxProfit: 180, maxLoss: -120, entryNet: 1.2, legs: [{}, {}] };
const p10Size = (amt) => (c) => {
  const unit = Math.abs(c.entryNet) * 100;
  return unit <= amt
    ? { ok: true, n: Math.floor(amt / unit), unit, isCredit: false, totProfit: Math.floor(amt / unit) * c.maxProfit }
    : { ok: false, unit, isCredit: false };
};

test("SPLIT — a row crosses on the BUDGET and comes back", () => {
  const rich = requestOf({ amt: 300 }, {});
  const poor = requestOf({ amt: 100 }, {});
  const inTop = splitByRequest([P10_ROW], rich, p10Size(300));
  assert.equal(inTop.meets.length, 1, "$120 a combination is inside a $300 budget");
  assert.equal(inTop.others.length, 0);
  const dropped = splitByRequest([P10_ROW], poor, p10Size(100));
  assert.equal(dropped.meets.length, 0, "and outside a $100 one");
  assert.equal(dropped.others.length, 1);
  assert.match(dropped.others[0].misses[0].short, /over budget by \$20/);
  // ...AND BACK. Membership is derived, so nothing has to be un-stored.
  assert.equal(splitByRequest([P10_ROW], rich, p10Size(300)).meets.length, 1);
});

test("SPLIT — a row crosses on the SLIDER and comes back", () => {
  const easy = requestOf({ amt: 300, minChance: 0.5 }, {});
  const hard = requestOf({ amt: 300, minChance: 0.75 }, {});
  assert.equal(splitByRequest([P10_ROW], easy, p10Size(300)).meets.length, 1, "62% clears a 50% bar");
  const below = splitByRequest([P10_ROW], hard, p10Size(300));
  assert.equal(below.meets.length, 0, "and not a 75% one");
  assert.match(below.others[0].misses[0].short, /chance 62% under the 75% asked/);
  assert.equal(splitByRequest([P10_ROW], easy, p10Size(300)).meets.length, 1);
});

test("SPLIT — it GROUPS, it never removes, and no row lands without a reason", () => {
  const req = requestOf({ amt: 100, minChance: 0.8 }, {});
  const rows = [P10_ROW, { ...P10_ROW, name: "B", pop: 0.9 }, { ...P10_ROW, name: "C", pop: null }];
  const sp = splitByRequest(rows, req, p10Size(100));
  assert.equal(sp.total, rows.length, "nothing is dropped: the two sections are the whole list");
  assert.equal(sp.meets.length + sp.others.length, rows.length);
  for (const o of sp.others) {
    assert.ok(o.misses.length > 0, `${o.cand.name} sits in the second section with no reason`);
    for (const m of o.misses) assert.ok(m.short && m.text, "a reason is a phrase AND a sentence");
  }
  // UNKNOWN IS NOT A PASS AND NOT A ZERO. `Number(null)` is 0 and 0 is finite.
  const unknown = sp.others.find((o) => o.cand.name === "C");
  assert.ok(unknown.misses.some((m) => m.id === "chance-unknown"));
  assert.match(unknown.misses.find((m) => m.id === "chance-unknown").text, /Unknown is not a low number/);
});

test("SPLIT — the target mode misses by the shortfall, in dollars", () => {
  const req = requestOf({ mode: "target", amt: 1000 }, {});
  const sized = () => ({ ok: true, n: 2, unit: 120, isCredit: false, totProfit: 360 });
  const sp = splitByRequest([P10_ROW], req, sized);
  assert.equal(sp.others.length, 1);
  assert.match(sp.others[0].misses[0].short, /short of the target by \$640/);
});

test("SPLIT — the headings carry the counts, so neither needs a sentence", () => {
  const req = requestOf({ amt: 300 }, {});
  assert.match(meetsHeading(req, 3), /\(3\)/);
  assert.match(otherwiseHeading(5), /\(5\)/);
  assert.ok(meetsHeading(req, 3).split(/\s+/).length <= 8, "a heading is not a paragraph");
  assert.ok(otherwiseHeading(5).split(/\s+/).length <= 10);
});

test("SPLIT — membership is NEVER stored on a candidate", () => {
  const req = requestOf({ amt: 300 }, {});
  const row = { ...P10_ROW };
  const before = JSON.stringify(row);
  splitByRequest([row], req, p10Size(300));
  assert.equal(JSON.stringify(row), before,
    "a stored membership is a stale one the moment the control moves");
  // ...and App.jsx may not write one either.
  const app = codeOf("App.jsx");
  assert.equal(/\.meets\s*=|meetsRequest:\s/.test(app), false,
    "membership is derived on every render, never assigned onto a candidate");
});

test("SPLIT — the quality floors are untouched by any of this", () => {
  // The slider may not move the reward floor, and nothing here calls a floor.
  assert.equal(RULES.minRewardRisk, 0.25);
  const rules = codeOf("rules.js");
  const at = rules.indexOf("export function meetsRequest");
  const end = rules.indexOf("export function splitByRequest");
  const body = rules.slice(at, end);
  for (const floor of ["qualityFloor", "spreadFloor", "comboSpreadFloor", "liquidityThreshold", "minRewardRisk"]) {
    assert.equal(body.includes(floor), false,
      `meetsRequest() names ${floor}: this GROUPS, the floors REMOVE, and they are not the same question`);
  }
});

test("TARGET PRICE — the direction read as a number, and unknown stays unknown", () => {
  const t = targetPriceOf(27.5, { tgt: 0.04 });
  assert.equal(t.known, true);
  assert.ok(Math.abs(t.price - 28.6) < 1e-9);
  assert.equal(t.movePct, 4);
  // NO SPOT IS UNKNOWN, NEVER A TARGET OF ZERO.
  for (const bad of [null, undefined, 0, NaN, ""]) {
    assert.equal(targetPriceOf(bad, { tgt: 0.04 }).known, false, `${String(bad)} is not a price`);
    assert.equal(targetPriceOf(bad, { tgt: 0.04 }).price, null);
  }
  assert.equal(targetPriceOf(27.5, null).known, false, "no direction, no target");
  assert.equal(targetPriceOf(27.5, {}).known, false, "a direction with no move is not a move of zero");
  // ...but NEUTRAL really is a move of zero, and that is a reading.
  const flat = targetPriceOf(27.5, { tgt: 0 });
  assert.equal(flat.known, true);
  assert.equal(flat.price, 27.5);
  // ...and the slider's label carries the number it is asking for.
  assert.match(chanceAskLabel(requestOf({ minChance: 0.65 }, {})), /65%/);
});

console.log(`\n${passed} passed, ${failures.length} failed\n`);
if (failures.length) {
  for (const f of failures) console.error(`${f.name}:\n${f.e.stack}\n`);
  process.exit(1);
}
