// src/exitPlan.test.js — PR 72 (owner, 19 Oct 2026): the exit plan per trade, "against the signals" on that plan, the
// exposure line, the contracts named twice, the market chance at the order's price, the price history asked again.
//
// Plain JS: the rules (rules.js), the readers (positionView.js, journal.js, closeOrder.js), the signals (signals.js), the
// chart's exit-day curve (tradeChart.js) and the implied distribution (impliedDist.js). Build's sections are rendered in
// src/exitPlan.test.jsx.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULES, exitPlanOf, exitPlanBounds, clampExitPlan, stepExitPlan, rulesExitPlan, structureFamily, exitPlanVariants,
  exitSuggestionOf, exitSuggestionLine, exitPlanEntryLine, exitPlanShort, takeProfitTarget, stopWarningLevel, ruleExitOf,
  positionAction, autopilotVerdict, timeExitDay, EXIT_ROWS, exitReplayPolicy, payoffNeed, needDirection, exposureLine,
  ibkrName, chanceAtPriceLine, trayChanceText, ROW_FIGURE_WORDS, marketDistOf, marketChanceOf, barsNotLoadedText,
  CHART_WHEN, takeProfitLabel, stopLossLabel } from "./rules.js";
import { exitDateOf, exitProgress } from "./positionView.js";
import { journalEntry } from "./journal.js";
import { heldSymbolFor } from "./closeOrder.js";
import { againstOnPlan, againstSignal, signalDirection } from "./signals.js";
import { exitCurve, curveZones, exitMark } from "./tradeChart.js";
import { legsAt, payoff, exitBacktest, N } from "./engine.js";
import { marketChance } from "./impliedDist.js";
import { feedLine, FEED_INFO, SOURCE } from "./chain.js";
import { expectedMove, fetchJsonRetry } from "./marketView.js";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
const near = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} is not within ${tol} of ${b}`);
const leg = (side, type, strike) => ({ side, qty: 1, type, strike });

/* ================================================================ 72.1 THE EXIT PLAN PER TRADE */
test("72.1 BOUNDS: take profit 25–90%, stop 25–100% of the max loss (owner, 19 Oct), both in 5-point steps; time exit 7–45 days", () => {
  assert.deepEqual(exitPlanBounds("takeProfitPct"), { min: 0.25, max: 0.9, step: 0.05 });
  assert.deepEqual(exitPlanBounds("stopLossPct"), { min: 0.25, max: 1, step: 0.05 });
  assert.deepEqual(exitPlanBounds("exitDTE", 60), { min: 7, max: 45, step: 1 });
  const p = clampExitPlan({ takeProfitPct: 0.93, exitDTE: 50, stopLossPct: 1.6 }, { dte: 60 });
  assert.deepEqual(p, { takeProfitPct: 0.9, exitDTE: 45, stopLossPct: 1 });
  assert.equal(clampExitPlan({ takeProfitPct: 0.1, exitDTE: 2, stopLossPct: 0.1 }, { dte: 60 }).takeProfitPct, 0.25);
  assert.equal(clampExitPlan({ takeProfitPct: 0.52 }, { dte: 60 }).takeProfitPct, 0.5, "on its 5-point step");
});
test("72.1 THE TIME EXIT STAYS BEFORE THE EXPIRY (entryRoom): on 30 days the most is 29; − and + stop at the bounds", () => {
  assert.equal(exitPlanBounds("exitDTE", 30).max, 29);
  assert.equal(clampExitPlan({ exitDTE: 40 }, { dte: 30 }).exitDTE, 29);
  let p = rulesExitPlan([leg(1, "call", 10), leg(-1, "call", 11)]);
  for (let i = 0; i < 20; i++) p = stepExitPlan(p, "takeProfitPct", 1, { dte: 45 });
  assert.equal(p.takeProfitPct, 0.9, "+ stops at 90%");
  for (let i = 0; i < 40; i++) p = stepExitPlan(p, "exitDTE", -1, { dte: 45 });
  assert.equal(p.exitDTE, 7, "− stops at 7 days");
  p = stepExitPlan(p, "stopLossPct", 1, { dte: 45 });
  assert.equal(p.stopLossPct, 0.55);
});
test("72.1 A POSITION OPENED BEFORE PR 72 READS THE RULES; one with a plan reads its own", () => {
  const old = { legs: [leg(1, "call", 10), leg(-1, "call", 11)] };
  assert.deepEqual(exitPlanOf(old), { takeProfitPct: RULES.takeProfitPct, exitDTE: RULES.exitDTE, stopLossPct: RULES.stopLossPct, source: null, suggestedFrom: null });
  const single = { legs: [leg(1, "put", 94)] };
  assert.equal(exitPlanOf(single).takeProfitPct, RULES.singleTakeProfitPctOfPremium);
  const mine = { ...old, exitPlan: { takeProfitPct: 0.6, exitDTE: 14, stopLossPct: 0.8, source: "edited", suggestedFrom: { takeProfitPct: 0.5, exitDTE: 21, stopLossPct: 0.5, from: "defaults" } } };
  const p = exitPlanOf(mine);
  assert.equal(p.takeProfitPct, 0.6); assert.equal(p.exitDTE, 14); assert.equal(p.stopLossPct, 0.8); assert.equal(p.source, "edited");
});
test("72.1 EVERY READER USES THE PLAN: the target, the stop level, the exit date, the rule words, the action", () => {
  const plan = { takeProfitPct: 0.6, exitDTE: 14, stopLossPct: 0.8 };
  const t = takeProfitTarget({ legs: [leg(1, "call", 10), leg(-1, "call", 11)], maxProfit: 60, maxLoss: -40, entryNet: 0.4, contracts: 3, plan });
  assert.equal(t.pct, 0.6); near(t.perCombo, 36, 1e-9, "60% of $60"); near(t.dollars, 108, 1e-9, "×3");
  // A single long option: the plan's share of the premium paid.
  const s1 = takeProfitTarget({ legs: [leg(1, "put", 94)], maxProfit: 8900, maxLoss: -500, entryNet: 5, plan });
  assert.equal(s1.basis, "premium"); near(s1.perCombo, 300, 1e-9, "60% of $500");
  // Without a plan, exactly as before.
  near(takeProfitTarget({ legs: [leg(1, "call", 10), leg(-1, "call", 11)], maxProfit: 60, maxLoss: -40 }).perCombo, 30, 1e-9, "50% default");
  near(stopWarningLevel({ maxLoss: -40, contracts: 2, plan }), -64, 1e-9, "80% of −$40 ×2");
  near(stopWarningLevel({ maxLoss: -40, contracts: 2 }), -40, 1e-9, "default 50%");
  assert.match(ruleExitOf({ dteExit: true, dteLeft: 13, plan }).text, /inside the 14-day exit window/);
  assert.match(ruleExitOf({ tpHit: true, plan }).text, /60% of the maximum profit was reached/);
  assert.match(positionAction({ dteExit: true, dteLeft: 13, pnl: 5, plan }).line, /the 14-day exit applies/);
  assert.match(positionAction({ slHit: true, pnl: -70, plan }).line, /at or past 80% of the maximum loss/);
  const pos = { expKey: "2026-12-18", legs: [leg(1, "call", 10), leg(-1, "call", 11)], exitPlan: { ...plan, source: "edited" }, openedAt: "2026-10-19", maxLoss: -40 };
  assert.equal(exitDateOf(pos), "2026-12-04", "14 days before 18 Dec");
  assert.equal(exitDateOf({ expKey: "2026-12-18", legs: pos.legs }), "2026-11-27", "21 days by default");
  const pr = exitProgress({ p: pos, pnl: -10, dteLeft: 30, tpTarget: takeProfitTarget({ ...pos, maxProfit: 60, plan }), n: 1 });
  assert.match(pr.time.text, /16 days left/);
  assert.equal(pr.stop.level, -32);
  assert.equal(timeExitDay("2026-12-18", 14), "4 Dec");
  assert.equal(EXIT_ROWS.time(plan), "14 days before expiry");
  assert.equal(EXIT_ROWS.stop(plan), "alert at 80% of max loss, no order");
  assert.equal(EXIT_ROWS.takeProfit("max-profit", plan), "at 60% of max profit");
  assert.equal(takeProfitLabel("max-profit", 0.6), "TP 60%"); assert.equal(stopLossLabel(0.8), "SL 80%");
  assert.equal(CHART_WHEN.exitAt(14), "At the 14-DTE exit");
  assert.equal(exitMark("2026-12-18", 45, 14).daysFromNow, 31);
});
test("72.1 THE AUTOPILOT JUDGES THE POSITION'S OWN PLAN: 18 days left is not an exit under a 14-day plan, and its stop is 80%", () => {
  const plan = { takeProfitPct: 0.6, exitDTE: 14, stopLossPct: 0.8 };
  assert.equal(autopilotVerdict({ dteLeft: 18, pnl: 0, maxLoss: -40 }).rule, "exit-dte", "the rules' 21 days");
  assert.equal(autopilotVerdict({ dteLeft: 18, pnl: 0, maxLoss: -40, plan }).verdict, "HOLD", "the plan's 14 days");
  assert.equal(autopilotVerdict({ dteLeft: 13, pnl: 0, maxLoss: -40, plan }).rule, "exit-dte");
  assert.equal(autopilotVerdict({ dteLeft: 30, pnl: -25, maxLoss: -40, plan }).warnings.length, 0, "−25 is not past 80% of −40");
  assert.equal(autopilotVerdict({ dteLeft: 30, pnl: -33, maxLoss: -40, plan }).warnings.length, 1);
  // The take-profit target the autopilot hands in carries the plan's share.
  const tp = takeProfitTarget({ legs: [leg(1, "call", 10), leg(-1, "call", 11)], maxProfit: 60, plan });
  assert.match(autopilotVerdict({ dteLeft: 30, pnl: 40, maxLoss: -40, takeProfit: tp, plan }).rationale, /60% of the maximum profit/);
  const ap = readFileSync("netlify/functions/autopilot.mjs", "utf8");
  assert.ok(ap.includes("autopilotVerdict({ verdict, takeProfit: tpTarget, pnl, maxLoss: pos.maxLoss, dteLeft, modelled: prov.modelled, plan })"));
});
test("72.1 FROZEN AT SEND, FILED IN THE JOURNAL: the record carries the plan, and its first lines say where it came from", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("exitPlan: buildPlan });"), "Send hands Build's plan to commitPosition()");
  assert.ok(app.includes("exitPlan: exitPlan ? { ...clampExitPlan(exitPlan, { dte: d, legs: lg }),"), "commitPosition() freezes it");
  const pos = { id: 9, ref: "J-0009", ticker: "XLE", legs: [], exitPlan: { takeProfitPct: 0.6, exitDTE: 14, stopLossPct: 0.5, source: "edited",
    suggestedFrom: { takeProfitPct: 0.5, exitDTE: 21, stopLossPct: 0.5, from: "replay", n: 11, ticker: "XLE" } } };
  assert.deepEqual(journalEntry({ pos }).exitPlan, pos.exitPlan);
  assert.equal(journalEntry({ pos: { id: 1, ticker: "UNG", legs: [] } }).exitPlan, null, "a trade from before PR 72");
  assert.equal(exitPlanEntryLine(pos.exitPlan),
    "Exit plan: TP 60% · 14 days · stop 50% — edited; suggested was TP 50% · 21 days · stop 50% (suggested from the replay: 11 windows on XLE).");
  assert.equal(exitPlanEntryLine({ takeProfitPct: 0.5, exitDTE: 21, stopLossPct: 0.5, source: "suggested", suggestedFrom: { from: "defaults" } }),
    "Exit plan: TP 50% · 21 days · stop 50% — as suggested (the defaults, not backtested).");
});
test("72.1 THE SUGGESTION: the replay's best variant on a finished window, else the defaults; the owner's line", () => {
  const legs = [leg(-1, "put", 58), leg(1, "put", 56)];
  assert.equal(structureFamily(legs), "+1p -1p");
  assert.equal(structureFamily([leg(1, "put", 40), leg(-1, "put", 45)]), structureFamily(legs), "the same family on any strikes");
  const vs = exitPlanVariants(45, legs);
  assert.equal(vs.length, 9);
  assert.ok(vs.some((p) => p.takeProfitPct === RULES.takeProfitPct && p.exitDTE === RULES.exitDTE), "the defaults are among them");
  assert.equal(exitPlanVariants(25, legs).length, 6, "on 25 days the 30-day exit is left out (entryRoom)");
  const res = (per100, n = 11) => ({ n, years: [2021, 2025], rules: { per100 } });
  const runs = vs.map((plan) => ({ plan, result: res(plan.takeProfitPct === 0.75 && plan.exitDTE === 14 ? 6.2 : 1.0) }));
  const sg = exitSuggestionOf({ ticker: "XLE", legs, runs, month: 9 });
  assert.deepEqual([sg.takeProfitPct, sg.exitDTE, sg.n, sg.from], [0.75, 14, 11, "replay"]);
  assert.equal(exitSuggestionLine(sg), "Suggested from the replay: 11 windows on XLE, TP 75% · 14 days");
  // A tie goes to the defaults; no finished window is no suggestion.
  const tie = exitSuggestionOf({ ticker: "XLE", legs, runs: vs.map((plan) => ({ plan, result: res(2) })) });
  assert.deepEqual([tie.takeProfitPct, tie.exitDTE], [0.5, 21]);
  assert.equal(exitSuggestionOf({ ticker: "XLE", legs, runs: vs.map((plan) => ({ plan, result: null })) }), null);
  assert.equal(exitSuggestionLine(null), null);
  assert.equal(exitPlanShort({ takeProfitPct: 0.75, exitDTE: 14, stopLossPct: 0.5 }), "TP 75% · 14 days · stop 50%");
});
test("72.1 THE REPLAY READS A PLAN: a later time exit and a lower target change what it replays (synthetic closes)", () => {
  // A slow steady rise: the bull call spread reaches 25% of its maximum before 50%, so a 25% plan exits sooner.
  const bars = []; let px = 100;
  for (let i = 0; i < 1500; i++) { const d = new Date(Date.UTC(2020, 0, 1) + i * 864e5); if (d.getUTCDay() % 6 === 0) continue;
    px *= 1 + 0.0004 + 0.012 * Math.sin(i / 7); bars.push({ time: d.toISOString().slice(0, 10), close: px }); }
  const legs = [leg(1, "call", 100), leg(-1, "call", 105)];
  const a = exitBacktest(legs, 100, 45, bars, exitReplayPolicy(), { month: 2, year: 2099 });
  const b = exitBacktest(legs, 100, 45, bars, exitReplayPolicy({ takeProfitPct: 0.25, exitDTE: 30, stopLossPct: 0.5 }), { month: 2, year: 2099 });
  assert.ok(a && b && a.n === b.n && a.n > 0);
  assert.ok(b.rules.held <= a.rules.held, "an earlier exit holds no longer");
});

/* ================================================================ 72.2 AGAINST THE SIGNALS, ON THE PLAN */
// A fused reading in the engine's shape: four factors, each a direction and a strength.
const fusedOf = (score, confidence, dirs = { seasonal: -1, technical: -1, weather: 0, news: 0 }) => ({
  ticker: "XLE", score, confidence, agreement: "ALIGNED", factors: ["seasonal", "technical", "weather", "news"],
  components: Object.fromEntries(Object.entries(dirs).map(([k, d]) => [k, { dir: d, strength: d ? 60 : 0, why: "" }])),
});
const S0 = 60, IV = 0.30, DTE = 45;
const zonesAtExit = (legs, exitDTE = 21) => {
  const ivs = legs.map(() => IV);
  const entry = legsAt(legs, S0, DTE, ivs).value;
  const curve = []; for (let s = 40; s <= 80.0001; s += 0.25) curve.push({ s, exp: (payoff(legs, s) - entry) * 100 });
  const cx = exitCurve({ legs, entryNet: entry, curve, ivs, dte: DTE, exitDTE });
  return { need: { ...payoffNeed({ bands: curveZones(cx), lo: cx[0].s, hi: cx[cx.length - 1].s, spot: S0 }), at: "exit" }, entry };
};
const CONDOR = [leg(1, "put", 54), leg(-1, "put", 57), leg(-1, "call", 63), leg(1, "call", 66)];
test("72.2 A CONDOR WITH A SLIGHTLY NEGATIVE DELTA AND WEAK BEARISH SIGNALS IS NOT AGAINST", () => {
  const { need } = zonesAtExit(CONDOR);
  assert.equal(need.need, "between"); assert.equal(need.lean, null, "today's price sits in the exit-day zone");
  assert.equal(needDirection(need), 0, "neutral on its own plan");
  const weak = fusedOf(-20, 50);   // s = −10, inside Find's ±12.5: Neutral
  assert.equal(signalDirection(weak).dir, "neutral");
  const move = expectedMove(S0, IV, DTE - 21);
  assert.equal(againstOnPlan(weak, need, { dirFallback: -1, spot: S0, move }), null);
  // Before PR 72 the net delta decided: a delta past +0.05 against these signals was asked for a reason; now it is not.
  assert.ok(againstSignal(weak, 1), "the old reading on a slightly positive delta");
  assert.equal(againstOnPlan(weak, need, { dirFallback: 1, spot: S0, move }), null);
});
test("72.2 THE SAME CONDOR WITH A STRONG BEARISH SIGNAL WHOSE EXPECTED MOVE BREAKS THE LOWER EDGE BY THE EXIT DAY IS AGAINST", () => {
  const { need } = zonesAtExit(CONDOR);
  const strong = fusedOf(-60, 80);   // s = −48: Bear
  const move = expectedMove(S0, IV, DTE - 21);
  assert.ok(S0 - move < need.lo, `one expected move down (${move.toFixed(2)}) leaves the zone (${need.lo.toFixed(2)})`);
  const c = againstOnPlan(strong, need, { spot: S0, move, exitDay: "4 Dec", ticker: "XLE" });
  assert.ok(c && c.neutral);
  assert.equal(c.n, 2, "the two factors pushing down"); assert.equal(c.total, 4);
  assert.match(c.question, /move past this trade's profit zone/);
  assert.match(c.detail, /XLE reads Bear \(score × confidence ÷ 100 = -48\), and one expected move down by the exit day, 4 Dec \(\$\d+\.\d\d\) takes it from \$60\.00 to \$\d+\.\d\d, below the zone where this trade is in profit then \(\$\d+\.\d\d–\$\d+\.\d\d\)/);
  // A move that stays inside the zone is not against, however strong the signal.
  assert.equal(againstOnPlan(strong, need, { spot: S0, move: 0.5 }), null);
  // A long strangle pays on a move either way: never against.
  assert.equal(againstOnPlan(strong, { need: "apart", lo: 55, hi: 65, lean: null }, { spot: S0, move }), null);
});
test("72.2 A BULL PUT SPREAD IN A BEARISH MARKET IS STILL AGAINST (directional: today's rule, the payoff's direction)", () => {
  const { need } = zonesAtExit([leg(-1, "put", 58), leg(1, "put", 56)]);
  assert.equal(need.need, "up");
  const c = againstOnPlan(fusedOf(-40, 70), need, { spot: S0, move: 3 });
  assert.ok(c && !c.neutral && c.dir === 1);
  assert.match(c.question, /You are going against 2 of 4 factors/);
  // Under the noise floor, nothing to go against (unchanged).
  assert.equal(againstOnPlan(fusedOf(-8, 70), need, { spot: S0, move: 3 }), null);
});
test("72.2 BUILD READS THE PAYOFF ON THE PLAN'S EXIT DAY, and recomputes when the plan changes", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("const curveX = exitCurve({ legs, entryNet: AE.entry, curve: AE.curve, ivs: AE.legPx.map((p) => p.iv), dte, exitDTE: buildPlan.exitDTE });"));
  assert.ok(app.includes("return againstOnPlan(fused[ticker], planNeed, { dirFallback: tradeDir, spot, move: expectedMove(spot, sigma, toExit),"));
  assert.ok(/\[fused, ticker, planNeed, tradeDir, spot, chance, AE, dte, buildPlan\.exitDTE, expKey\]/.test(app), "the plan's exit day is a dependency");
});

/* ================================================================ 72.3 THE EXPOSURE LINE */
test("72.3 OPEN RISK PAST THE TOTAL LIMIT: one amber line, the user's limit or 'suggested'; nothing under the limit", () => {
  assert.equal(exposureLine({ after: 5200, total: 5000, tradingCapital: 20000, answered: true }),
    "Open risk after this trade: $5,200 = 26% of capital (your limit: 25%)");
  assert.equal(exposureLine({ after: 5200, total: 5000, tradingCapital: 20000, answered: false }),
    "Open risk after this trade: $5,200 = 26% of capital (suggested: 25%)");
  assert.equal(exposureLine({ after: 4900, total: 5000, tradingCapital: 20000, answered: true }), null);
  assert.equal(exposureLine({ after: null, total: 5000, tradingCapital: 20000 }), null, "unknown is not zero");
  const app = readFileSync("src/App.jsx", "utf8");
  // The gate's own figures, the trade not added twice; shown with the cap on or off (no `freeSizing` in the condition).
  assert.ok(app.includes("exposure: L ? exposureLine({ after: sentAlready ? L.openRisk : L.totalAfter, total: L.total, tradingCapital: L.tradingCapital,"));
  // It never blocks: Send's `disabled` reads `sendBlock` only.
  assert.ok(app.includes("send: { label: sendLabel({ type: ticket.type, net, n: contracts }), disabled: !!sendBlock, reason: sendBlock,"));
});

/* ================================================================ 72.4 CONTRACT NAMES AND THE FEED */
test("72.4 IBKR'S NAME: ticker, MonDD'YY, the strike as listed, Call or Put", () => {
  assert.equal(ibkrName("SLV", "2026-11-27", leg(1, "put", 49.5)), "SLV Nov27'26 49.5 Put");
  assert.equal(ibkrName("GLD", "2026-11-27", leg(-1, "call", 391)), "GLD Nov27'26 391 Call");
  assert.equal(ibkrName("UNG", "2027-01-15", leg(1, "call", 12.5)), "UNG Jan15'27 12.5 Call");
});
test("72.4 THE OCC SYMBOL IS READ, NEVER BUILT: the chain's on Build and the review, the broker's on a position", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("name: ibkrName(ticker, expKey, l),\n                  occ: bookQuotes[i] && bookQuotes[i].occ ? bookQuotes[i].occ : null,"), "Build's legs");
  assert.ok(app.includes("name: ibkrName(ticker, expKey, l), occ: bookQuotes[i] && bookQuotes[i].occ ? bookQuotes[i].occ : null })),"), "the review sheet");
  assert.ok(app.includes("occ: heldSymbolFor(dp, l, alSync) || (dm.qp && dm.qp(l) && dm.qp(l).occ) || null"), "a position");
  const rec = { ticker: "SLV", expKey: "2026-11-27", legs: [leg(-1, "call", 53), leg(1, "call", 56)] };
  const sync = { t: 1, positions: [{ symbol: "SLV261127C00053000", qty: "-2", side: "short" }, { symbol: "SLV261127C00056000", qty: "2", side: "long" }] };
  assert.equal(heldSymbolFor(rec, rec.legs[0], sync), "SLV261127C00053000");
  assert.equal(heldSymbolFor(rec, rec.legs[1], sync), "SLV261127C00056000");
  assert.equal(heldSymbolFor(rec, leg(1, "call", 57), sync), null, "a leg the broker does not hold has no symbol");
  assert.equal(heldSymbolFor(rec, rec.legs[0], null), null, "no sync, no symbol");
});
test("72.4 THE FEED BESIDE THE PRICES' AGE: indicative by default, OPRA when the deploy reads it, CBOE delayed; one ⓘ", () => {
  assert.equal(feedLine({ source: SOURCE.alpacaIndicative }), "Alpaca indicative prices");
  assert.equal(feedLine({ source: SOURCE.alpacaOpra }), "Alpaca OPRA real-time");
  assert.equal(feedLine({ source: SOURCE.cboeServer }), "CBOE delayed prices");
  assert.equal(feedLine(null), null);
  assert.match(FEED_INFO, /can differ by a few cents/);
  // The function reads ALPACA_OPTIONS_FEED, indicative unless it says "opra".
  assert.ok(readFileSync("netlify/functions/chainAlpaca.mjs", "utf8").includes('(Netlify.env.get("ALPACA_OPTIONS_FEED") || "indicative").toLowerCase() === "opra"'));
});

/* ================================================================ 72.5 THE MARKET'S CHANCE AT THE ORDER'S PRICE */
// THE OWNER'S TWO READINGS (19 Oct 2026, against IBKR's Option Wizard): SLV Nov27 −53C/+56C, IBKR 63%, OSL "Market" 65%;
// GLD Nov27 −391C/+410C, IBKR 70%, OSL 73% (read on Find's tray). The screenshots are not in this environment and no live
// board can be read here, so each board is SYNTHETIC: Black-Scholes at one flat IV with no interest (IBKR's method reads
// none), its spot chosen so that the lognormal's P(below the breakeven at IBKR's price) is IBKR's figure. On such a board
// IBKR's figure IS that probability, so the test asserts the method — OSL's market chance at IBKR's price within 2 points
// of it — and the price's own effect. It does not replace the owner's check on the live boards (PRD §4 #9).
const bs0 = (S, K, T, v, type) => {
  const d1 = (Math.log(S / K) + 0.5 * v * v * T) / (v * Math.sqrt(T)), d2 = d1 - v * Math.sqrt(T);
  return type === "call" ? S * N(d1) - K * N(d2) : K * N(-d2) - S * N(-d1);
};
const Ninv = (p) => { let lo = -8, hi = 8; for (let i = 0; i < 100; i++) { const m = (lo + hi) / 2; if (N(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; };
/** The spot at which P(S_T < be) = p on a driftless lognormal: ln(be/S) = z·σ√T − σ²T/2 … solved for S. */
const spotFor = (be, p, v, T) => be / Math.exp(Ninv(p) * v * Math.sqrt(T) - 0.5 * v * v * T);
const boardOf = (S, v, T, lo, hi, step) => {
  const b = { calls: {}, puts: {} };
  for (let K = lo; K <= hi + 1e-9; K += step) {
    const k = +K.toFixed(2);
    b.calls[k] = { bid: bs0(S, k, T, v, "call") * 0.99, ask: bs0(S, k, T, v, "call") * 1.01 };
    b.puts[k] = { bid: Math.max(0.001, bs0(S, k, T, v, "put") * 0.99), ask: bs0(S, k, T, v, "put") * 1.01 };
  }
  return b;
};
const T39 = 39 / 365;   // 19 Oct → 27 Nov 2026
const CASES = [
  // GLD: IBKR's breakeven 394.78 at the natural credit 3.78; OSL read the mid, 4.00 (breakeven 395.00). Strikes $1 apart.
  { tk: "GLD", ibkr: 0.70, legs: [leg(-1, "call", 391), leg(1, "call", 410)], natural: 3.78, mid: 4.00, iv: 0.22, lo: 300, hi: 470, step: 1 },
  // SLV: the owner's prices for it are not in the prompt; a natural of 1.20 and a mid of 1.30 are SYNTHETIC. Strikes $0.50 apart.
  { tk: "SLV", ibkr: 0.63, legs: [leg(-1, "call", 53), leg(1, "call", 56)], natural: 1.20, mid: 1.30, iv: 0.35, lo: 30, hi: 75, step: 0.5 },
];
for (const c of CASES) {
  test(`72.5 ${c.tk}: OSL's market chance AT IBKR'S PRICE is within 2 points of IBKR's ${Math.round(c.ibkr * 100)}%; the mid flatters the credit`, () => {
    const be = c.legs[0].strike + c.natural;
    const S = spotFor(be, c.ibkr, c.iv, T39);
    const board = boardOf(S, c.iv, T39, c.lo, c.hi, c.step);
    const dist = marketDistOf(board, S);
    assert.ok(dist.ok, dist.reason);
    const atIbkr = marketChanceOf({ dist, legs: c.legs, entryNet: -c.natural });
    const atMid = marketChanceOf({ dist, legs: c.legs, entryNet: -c.mid });
    assert.ok(atIbkr.ok && atMid.ok);
    near(atIbkr.pop, c.ibkr, 0.02, `${c.tk} at the natural ${c.natural}`);
    assert.ok(atMid.pop >= atIbkr.pop, "a credit read at the mid breaks even higher: its chance is never lower");
    // The price's own effect is the market's mass between the two breakevens — a fraction of a point on these boards.
    near(atMid.pop - atIbkr.pop, marketChance(dist, c.legs, -c.mid) - marketChance(dist, c.legs, -c.natural), 1e-12, "one arithmetic");
    console.log(`       ${c.tk}: at ${c.natural} ${(atIbkr.pop * 100).toFixed(1)}%, at ${c.mid} ${(atMid.pop * 100).toFixed(1)}% (IBKR ${Math.round(c.ibkr * 100)}%)`);
  });
}
test("72.5 BUILD READS BOTH CHANCES AT THE LIMIT IN FORCE, AND THE ⓘ SAYS WHICH PRICE AND BREAKEVEN; Find's tray and rows say which", () => {
  assert.equal(chanceAtPriceLine(-3.78, [394.78]), "Both are read at the limit in force, $3.78 credit: breakeven $394.78. A change of the limit moves both.");
  assert.equal(chanceAtPriceLine(null), null);
  const app = readFileSync("src/App.jsx", "utf8");
  // `AE` is `analyze()` at `effectiveLimit()`'s net — the ticket's limit — and the market's chance reads `AE` (PR 67).
  assert.ok(app.includes("const mkt = AE && legs.length ? marketChanceCheckOf(AE, { legs, dist }) : null;"));
  assert.ok(app.includes("atPrice: chanceAtPriceLine(AE.entry, AE.breakevens)"));
  // GLD's 73% was read on the tray, which printed the OSL MODEL's chance under the word "Chance": now it names both.
  assert.equal(trayChanceText(0.73, 0.70), "73% model · 70% mkt");
  assert.equal(trayChanceText(0.73, null), "73% model · — mkt");
  assert.equal(ROW_FIGURE_WORDS.chance, "model chance");
});

/* ================================================================ 72.6 THE PRICE HISTORY, ASKED AGAIN */
test("72.6 'Failed to fetch' (no answer) is asked again, with a growing wait; an answer — even a refusal — is not", async () => {
  let calls = 0; const waits = [];
  const flaky = async () => { calls++; if (calls < 3) throw new TypeError("Failed to fetch"); return { ok: true, status: 200, json: async () => ({ bars: [1] }) }; };
  const r = await fetchJsonRetry("/api/bars?sym=SLV", { fetchImpl: flaky, sleep: async (ms) => { waits.push(ms); } });
  assert.equal(calls, 3); assert.deepEqual(waits, [800, 1600]); assert.equal(r.ok, true); assert.deepEqual(r.json.bars, [1]);
  calls = 0;
  const refuses = async () => { calls++; return { ok: false, status: 504, json: async () => ({ error: "No price history came back" }) }; };
  const r2 = await fetchJsonRetry("/api/bars", { fetchImpl: refuses, sleep: async () => {} });
  assert.equal(calls, 1, "a refusal is not asked again"); assert.equal(r2.network, false); assert.equal(r2.error, "No price history came back");
  const dead = async () => { throw new TypeError("Failed to fetch"); };
  const r3 = await fetchJsonRetry("/api/bars", { fetchImpl: dead, sleep: async () => {} });
  assert.equal(r3.network, true);
  assert.match(barsNotLoadedText(r3), /did not arrive: the connection dropped before the server answered, three times/);
  assert.equal(barsNotLoadedText(r2), "The price history is not loaded: No price history came back.");
  const bars = readFileSync("netlify/functions/bars.mjs", "utf8");
  assert.ok(/export const UPSTREAM_MS = 4000;/.test(bars) && !bars.includes("await fetch("), "every upstream call has its own wait");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
