// Tests for the autopilot's verdict and the price a closing order is sent at.
// Plain Node, no test framework: `npm test` runs this file directly.
//
// Three measured faults, and every one of them is a rule of action that was
// written somewhere it could not be tested:
//
//   TASK 2 — THE AUTOPILOT COULD ACT ON A MODEL PRICE LABELLED AS MARKET DATA.
//     `markFromChain()` returns `net: null` unless EVERY leg was found with a
//     two-sided quote; the caller then falls back to `netBS()`. The brief went
//     on reporting `chainSource: "CBOE delayed"` whenever the chain had loaded
//     at all, so a position marked entirely by Black-Scholes was handed to the
//     model, and printed, as delayed market data — and an approve link was
//     built on it.
//
//   TASK 3 — THE STOP IS A WARNING IN THE PRD AND WAS AN ORDER IN THE CODE.
//     `autopilot.mjs` set `verdict = "STOP"` when `pnl <= stopLossPct * maxLoss`
//     and then issued an approve link, on the rule PRD §4 downgraded to an alert
//     because its evidence is the weakest in the app. The backtest that would
//     settle it is NOT BUILT.
//
//   TASK 4 — CLOSING ORDERS WERE MARKET ORDERS. `type: "market"`, built at
//     proposal time and sent up to 24 hours later. BOIL quoted bid/ask spreads
//     of 66%, 91%, 145% and 166% of the mid near the money on strikes this app
//     builds on: the app refuses to PRICE a candidate off a market that wide
//     and then closed one at the touch.

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  RULES, CLOSE_LIMIT_SLIPPAGE, MODEL_PRICE,
  markProvenance, modelPriceNote, autopilotVerdict, AUTOPILOT_VERDICTS, stopWarningSentence,
  closeMarket, closeLimitPrice, closeLimitNote, closeUnreadableNote,
} from "./rules.js";
import { orderBody } from "./order.js";
import { exitSim, SIGMA } from "./engine.js";
import { sigmaProvenance, FALLBACK_SIGMA, FALLBACK_SIGMA_SOURCE, TABLE_SIGMA_SOURCE } from "./rules.js";

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failures.push({ name, e }); console.log(`  FAIL ${name}\n       ${e.message}`); }
}

const AUTOPILOT = readFileSync(new URL("../netlify/functions/autopilot.mjs", import.meta.url), "utf8");
const APPROVE = readFileSync(new URL("../netlify/functions/approve.mjs", import.meta.url), "utf8");
const RULES_SRC = readFileSync(new URL("./rules.js", import.meta.url), "utf8");

/**
 * THE CODE WITHOUT ITS COMMENTS.
 *
 * "This no longer happens here" is a claim about what the file DOES, and the
 * comment explaining what it used to do quotes the very thing being asserted
 * gone. Without this, writing down why `type: "market"` was wrong makes the
 * test that proves it is gone fail.
 */
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
const AUTOPILOT_CODE = codeOnly(AUTOPILOT);

/* ================================================================
   THE PAYLOAD

   BOIL 2026-10-16, a five-lot bull call spread opened for $0.42, now
   worth $0.50 — and the near-the-money market this app measured on BOIL:
   bids and asks that disagree by a factor of three.
================================================================ */

const POSITION = {
  ticker: "BOIL", name: "Bull Call Spread", expKey: "2026-10-16",
  legs: [{ side: 1, qty: 5, type: "call", strike: 19 }, { side: -1, qty: 5, type: "call", strike: 19.5 }],
  entryNet: 0.42, maxProfit: 40, maxLoss: -210,
};
// A normal, tight market: 2 cents wide on each leg.
const TIGHT = [{ bid: 1.22, ask: 1.24 }, { bid: 0.73, ask: 0.75 }];
// The BOIL reading: a 145%-of-mid market. Bid 0.10, ask 0.62 — the ask is more
// than three times the bid, and the mid between them is a figure neither side
// quoted.
const WIDE = [{ bid: 1.22, ask: 1.24 }, { bid: 0.10, ask: 0.62 }];

/* ================================================================
   1) TASK 2 — A MODEL PRICE IS CALLED "model"
================================================================ */

test('the chain produced the net → the source is the FEED, and nothing is estimated', () => {
  const p = markProvenance(0.5, "CBOE delayed");
  assert.equal(p.modelled, false);
  assert.equal(p.source, "CBOE delayed");
  assert.equal(p.note, null);
});

test('THE NET CAME FROM netBS → THE SOURCE IS "model"', () => {
  const p = markProvenance(null, "CBOE delayed");
  assert.equal(p.modelled, true);
  assert.equal(p.source, MODEL_PRICE);
  assert.equal(p.source, "model");
  assert.ok(p.note.includes("ESTIMATED"), "and it says the price is an estimate");
});

test("A CHAIN THAT LOADED WITH ONE LEG MISSING IS STILL A MODEL PRICE", () => {
  // This is the exact case the old label got wrong: `data` was truthy, so the
  // brief said "CBOE delayed", while `m.net` was null and the mark came from
  // Black-Scholes. The chain loading is not the question — the NET is.
  assert.equal(markProvenance(null, "CBOE delayed").source, "model");
});

test("a net of exactly zero is still a net, not a missing one", () => {
  // `null` is the signal and nothing else is. A real net of 0 would be caught by
  // `priceability()` at entry, not silently reclassified here.
  assert.equal(markProvenance(0, "CBOE delayed").modelled, false);
});

test("rules.js never names the feed itself — the caller hands it one", () => {
  const rules = readFileSync(new URL("./rules.js", import.meta.url), "utf8");
  const section = rules.slice(rules.indexOf("export function markProvenance"));
  assert.ok(!/CBOE|Alpaca/.test(section.slice(0, 900)),
    "CLAUDE.md: never write a feed's name outside chain.js and the site that knows it");
  assert.ok(/const CHAIN_FEED = "CBOE delayed";/.test(AUTOPILOT), "and the autopilot names its own");
});

test("the autopilot reports prov.source, not 'the chain loaded'", () => {
  assert.ok(/chainSource: prov\.source/.test(AUTOPILOT));
  assert.ok(/priceIsEstimated: prov\.modelled/.test(AUTOPILOT));
  assert.ok(!/chainSource: data \? "CBOE delayed"/.test(AUTOPILOT_CODE), "the old label is gone");
});

test("the brief says the figures are estimates, above the figures", () => {
  assert.ok(/These figures are ESTIMATES/.test(AUTOPILOT));
  assert.ok(/price from \$\{b\.priceSource\}/.test(AUTOPILOT), "and every section names its price source");
});

/* ================================================================
   2) TASK 2 — A MODEL PRICE PRODUCES A WARNING, NEVER A LINK
================================================================ */

test("TAKE PROFIT ON A REAL PRICE: CLOSE_ALL, and it may be approved", () => {
  const d = autopilotVerdict({ pctMax: 62, pnl: 25, maxLoss: -210, dteLeft: 40, modelled: false });
  assert.equal(d.verdict, "CLOSE_ALL");
  assert.equal(d.rule, "take-profit");
  assert.equal(d.approvable, true);
});

test("TAKE PROFIT ON A MODEL PRICE: A WARNING, AND NO LINK", () => {
  const d = autopilotVerdict({ pctMax: 62, pnl: 25, maxLoss: -210, dteLeft: 40, modelled: true });
  assert.equal(d.approvable, false, "nothing may be approved on a price nobody quoted");
  assert.equal(d.verdict, "HOLD");
  assert.ok(d.warnings.some((w) => /ESTIMATED/.test(w)), "the trigger is reported as a warning");
  assert.ok(d.warnings.some((w) => /take-profit/i.test(w)), "and names which rule fired");
  assert.ok(/estimated/i.test(d.rationale));
});

test("EXIT DTE ON A REAL PRICE: CLOSE_ALL, and it may be approved", () => {
  const d = autopilotVerdict({ pctMax: 10, pnl: 5, maxLoss: -210, dteLeft: RULES.exitDTE, modelled: false });
  assert.equal(d.verdict, "CLOSE_ALL");
  assert.equal(d.rule, "exit-dte");
  assert.equal(d.approvable, true);
});

test("EXIT DTE ON A MODEL PRICE: A WARNING, AND NO LINK", () => {
  const d = autopilotVerdict({ pctMax: 10, pnl: 5, maxLoss: -210, dteLeft: 12, modelled: true });
  assert.equal(d.verdict, "HOLD");
  assert.equal(d.approvable, false);
  assert.ok(d.warnings.some((w) => new RegExp(`${RULES.exitDTE}-day`).test(w)));
});

test("a model price does not invent a warning when no rule fired", () => {
  const d = autopilotVerdict({ pctMax: 10, pnl: 5, maxLoss: -210, dteLeft: 40, modelled: true });
  assert.equal(d.verdict, "HOLD");
  assert.equal(d.warnings.length, 0);
});

test("the approve link is gated on approvable, not merely on the verdict", () => {
  assert.ok(/if \(dec\.approvable && verdict !== "HOLD"/.test(AUTOPILOT));
});

/* ================================================================
   3) TASK 3 — THE STOP IS A WARNING, NEVER AN ACTION
================================================================ */

test("THE STOP CROSSING PRODUCES HOLD AND A WARNING — never STOP, never a link", () => {
  // -110 on a -210 maximum loss: past 50% of max loss, which is where the old
  // code set `verdict = "STOP"` and then built an approve link.
  const d = autopilotVerdict({ pctMax: -20, pnl: -110, maxLoss: -210, dteLeft: 40, modelled: false });
  assert.equal(d.verdict, "HOLD");
  assert.equal(d.approvable, false);
  assert.equal(d.rule, null);
  assert.equal(d.warnings.length, 1);
  assert.ok(d.warnings[0].startsWith("Stop threshold crossed — not validated by backtest"));
});

test("the warning carries the number that crossed", () => {
  const d = autopilotVerdict({ pnl: -110, maxLoss: -210, dteLeft: 40 });
  assert.ok(/\$110/.test(d.warnings[0]), `the figure is in the sentence: ${d.warnings[0]}`);
});

test("exactly at the threshold counts as crossed", () => {
  const d = autopilotVerdict({ pnl: RULES.stopLossPct * -210, maxLoss: -210, dteLeft: 40 });
  assert.equal(d.warnings.length, 1);
  assert.equal(d.verdict, "HOLD");
});

test("one cent short of it does not", () => {
  const d = autopilotVerdict({ pnl: RULES.stopLossPct * -210 + 0.01, maxLoss: -210, dteLeft: 40 });
  assert.equal(d.warnings.length, 0);
});

test("A STOP THE MODEL RETURNS ANYWAY IS TURNED BACK INTO HOLD", () => {
  const d = autopilotVerdict({ verdict: "STOP", pctMax: -20, pnl: -50, maxLoss: -210, dteLeft: 40 });
  assert.equal(d.verdict, "HOLD");
  assert.equal(d.approvable, false);
});

test("THE STOP NEVER OVERRIDES A TAKE PROFIT — it used to, and both are impossible together anyway", () => {
  // The old code applied the stop AFTER the take-profit, unconditionally, so a
  // stop crossing replaced a CLOSE_ALL with a STOP and its link.
  const d = autopilotVerdict({ pctMax: 62, pnl: -110, maxLoss: -210, dteLeft: 40 });
  assert.equal(d.verdict, "CLOSE_ALL");
  assert.equal(d.rule, "take-profit");
  assert.equal(d.approvable, true);
  assert.equal(d.warnings.length, 1, "and the crossing is still reported");
});

test("THE MODEL IS NOT OFFERED STOP AS A VERDICT", () => {
  assert.deepEqual(AUTOPILOT_VERDICTS, ["HOLD", "CLOSE_ALL"]);
  assert.ok(/\$\{AUTOPILOT_VERDICTS\.join\("\|"\)\}/.test(AUTOPILOT),
    "the prompt's verdict list is the tested constant, not a typed string");
  assert.ok(!/HOLD\|CLOSE_ALL\|STOP/.test(AUTOPILOT_CODE), "the old three-way menu is gone");
  assert.ok(!/STOP when pnl <=/.test(AUTOPILOT_CODE), "and so is the instruction to return it");
  assert.ok(/There is no STOP verdict/.test(AUTOPILOT), "the prompt says so out loud");
});

test("the autopilot no longer sets verdict STOP anywhere", () => {
  assert.ok(!/verdict = "STOP"/.test(AUTOPILOT_CODE));
});

test("the PRD's own setting is unchanged and still says warn", () => {
  assert.equal(RULES.stopLossEnforcement, "warn");
  assert.equal(RULES.stopLossPct, 0.5, "the value is untouched: only what is DONE with it changed");
});

/* ================================================================
   4) TASK 4 — THE CLOSING PRICE
================================================================ */

test("the slippage constant lives in rules.js and says it was CHOSEN", () => {
  assert.equal(CLOSE_LIMIT_SLIPPAGE, RULES.closeLimitSlippage, "one home, one number");
  assert.equal(CLOSE_LIMIT_SLIPPAGE, 0.25);
  const rules = readFileSync(new URL("./rules.js", import.meta.url), "utf8");
  const section = rules.slice(rules.indexOf("closeLimitSlippage — HOW FAR"), rules.indexOf("closeLimitSlippage: 0.25"));
  assert.ok(/CHOSEN, NOT MEASURED/.test(section), "it says what it is");
  assert.ok(/NOT\s+\n?\s*\/\/ VERIFIED|NOT VERIFIED/.test(section), "and that it goes on the NOT VERIFIED list");
});

test("a tight market prices a close at the mid less a quarter of the spread", () => {
  const m = closeMarket(POSITION.legs, TIGHT);
  assert.equal(m.ok, true);
  // +5 × 1.23  −5 × 0.74 = 6.15 − 3.70 = 2.45, and the spread is 5×0.02 + 5×0.02 = 0.20
  assert.ok(Math.abs(m.netMid - 2.45) < 1e-9);
  assert.ok(Math.abs(m.spread - 0.20) < 1e-9);
  const p = closeLimitPrice(m);
  assert.ok(Math.abs(p.allowance - 0.05) < 1e-9, "a quarter of 0.20");
  assert.ok(Math.abs(p.limit - 2.40) < 1e-9, "the mid, conceded by the allowance and no more");
});

test("THE CONCESSION IS ALWAYS AGAINST THE CLOSER, WHICHEVER WAY THE TRADE FACES", () => {
  const long = closeLimitPrice({ netMid: 3.00, spread: 0.40 });
  assert.equal(long.limit, 2.90, "selling to close: you accept 10c less");
  const short = closeLimitPrice({ netMid: -3.00, spread: 0.40 });
  assert.equal(short.limit, 3.10, "buying to close: you pay 10c more");
  assert.ok(long.net > 0 && short.net < 0, "the sign of the position is kept");
});

test("A QUARTER IS NOT THE FAR SIDE — that is the market order this replaces", () => {
  const m = closeMarket(POSITION.legs, WIDE);
  const p = closeLimitPrice(m);
  // The far side of that market, for a close of this structure, is the bid on
  // the long leg and the ask on the short one.
  const far = 5 * 1.22 - 5 * 0.62;
  assert.ok(p.net > far, `the limit ${p.net} concedes less than the touch ${far}`);
  assert.ok(p.net < m.netMid, "and it does concede something");
});

test("the allowance can never exceed a quarter of the spread", () => {
  for (const spread of [0.02, 0.20, 2.60, 13.0]) {
    const p = closeLimitPrice({ netMid: 5, spread });
    assert.ok(Math.abs(p.allowance - spread * CLOSE_LIMIT_SLIPPAGE) < 1e-9);
    assert.ok(Math.abs(p.netMid - p.net) <= spread * CLOSE_LIMIT_SLIPPAGE + 1e-9,
      "never worse than mid + the allowance");
  }
});

test("A LEG WITH NO BID IS NOT A PRICE, AND THE CLOSE IS NOT SENT", () => {
  const m = closeMarket(POSITION.legs, [{ bid: 1.22, ask: 1.24 }, { bid: 0, ask: 0.40 }]);
  assert.equal(m.ok, false);
  assert.deepEqual(m.missing, [1]);
  assert.equal(m.netMid, null, "and no number is produced to send anyway");
});

test("a leg missing from the chain altogether is the same refusal", () => {
  const m = closeMarket(POSITION.legs, [{ bid: 1.22, ask: 1.24 }, {}]);
  assert.equal(m.ok, false);
  assert.deepEqual(m.missing, [1]);
});

test("a crossed market is not a market", () => {
  const m = closeMarket(POSITION.legs, [{ bid: 1.30, ask: 1.24 }, { bid: 0.73, ask: 0.75 }]);
  assert.equal(m.ok, false);
});

test("the refusal names which leg, in strikes rather than indexes", () => {
  const note = closeUnreadableNote([1], POSITION.legs);
  assert.ok(note.includes("19.5C"), note);
  assert.ok(/Nothing was sent/.test(note));
  assert.ok(/Nothing has changed on the broker/.test(note));
  assert.ok(/next run/.test(note), "and says what happens instead");
});

test("the limit note says where the number came from and what it conceded", () => {
  const n = closeLimitNote(closeLimitPrice({ netMid: 2.45, spread: 0.20 }));
  assert.ok(/\$240/.test(n), `the limit in dollars a contract: ${n}`);
  assert.ok(/25%/.test(n), "the share it conceded");
  assert.ok(/limit, not a market order/.test(n));
});

test("A CONCESSION THAT WOULD TURN THE TRADE ROUND IS FLOORED INSTEAD", () => {
  // Worth +0.02 into a 0.40-wide market: conceding a quarter of the spread
  // lands on −0.08, and since the body carries the MAGNITUDE the broker would
  // read that as "sell it for 8 cents" — four times better than the mid, on an
  // order that was supposed to give something up.
  const p = closeLimitPrice({ netMid: 0.02, spread: 0.40 });
  assert.equal(p.limit, 0.01);
  assert.ok(p.net > 0, "and it still faces the way the position does");
  // The short side needs no floor: conceding moves it AWAY from zero, so
  // buying back a 0.02 liability with a 0.10 allowance is 0.12 and faces the
  // right way already. Only the long side can concede its way through zero.
  const short = closeLimitPrice({ netMid: -0.02, spread: 0.40 });
  assert.equal(short.limit, 0.12);
  assert.ok(short.net < 0);
});

test("AN UNREADABLE MARKET PRODUCES NO PRICE — Number(null) IS 0 AND 0 IS FINITE", () => {
  // The trap this repository has written down three times already: the missing
  // ceiling, the unmeasured expiry, the absent probability. A null net must not
  // become a net of zero and then a limit of one cent.
  assert.equal(closeLimitPrice({ netMid: null, spread: 0.2 }), null);
  assert.equal(closeLimitPrice({ netMid: 2.45, spread: null }), null);
  assert.equal(closeLimitPrice({}), null);
  assert.equal(closeLimitPrice({ netMid: NaN, spread: 0.2 }), null);
  // and the whole chain refuses together: an unreadable market to no price.
  assert.equal(closeLimitPrice(closeMarket(POSITION.legs, [{ bid: 1.22, ask: 1.24 }, {}])), null);
});

/* ================================================================
   5) TASK 4 — THE BODY THAT GOES OUT
================================================================ */

test("THE CLOSING BODY IS A LIMIT, BUILT BY orderBody() UNCHANGED", () => {
  const m = closeMarket(POSITION.legs, TIGHT);
  const p = closeLimitPrice(m);
  const body = orderBody({
    legs: POSITION.legs,
    occs: ["BOIL261016C00019000", "BOIL261016C00019500"],
    userQty: 1, type: "limit", limit: p.net, tif: "day", intent: "close",
  });
  assert.equal(body.type, "limit");
  assert.equal(body.order_class, "mleg");
  // The size is in qty and the shape is in the ratios — the 2026-09-04 refusal.
  assert.deepEqual(body.legs.map((l) => l.ratio_qty), ["1", "1"]);
  assert.equal(body.qty, "5");
  // The five-lot net priced as ONE combination: 2.40 / 5.
  assert.equal(body.limit_price, "0.48");
  assert.equal(body.legs[0].position_intent, "sell_to_close");
  assert.equal(body.legs[1].position_intent, "buy_to_close");
});

test("order.js was not touched to make this work", () => {
  const order = readFileSync(new URL("./order.js", import.meta.url), "utf8");
  assert.ok(!/CLOSE_LIMIT_SLIPPAGE|closeLimitPrice|closeMarket/.test(order),
    "the limit is computed by the caller; order.js only spells the body");
});

test("THE AUTOPILOT NO LONGER BUILDS A MARKET ORDER — OR ANY ORDER", () => {
  assert.ok(!/type: "market"/.test(AUTOPILOT_CODE), "the market close is gone");
  assert.ok(!/orderBody\(/.test(AUTOPILOT_CODE), "and the autopilot builds no body at all");
  assert.ok(/orderIntent: \{/.test(AUTOPILOT), "what travels is the intent");
});

test("THE LIMIT IS COMPUTED IN approve.mjs, FROM A CHAIN FETCHED AT TAP TIME", () => {
  assert.ok(/const chain = await freshChain\(oi\.ticker\);/.test(APPROVE));
  assert.ok(/closeMarket\(oi\.legs, quotes\)/.test(APPROVE));
  assert.ok(/closeLimitPrice\(\{ netMid: market\.netMid, spread: market\.spread \}\)/.test(APPROVE));
  assert.ok(/type: "limit", limit: priced\.net/.test(APPROVE));
  // and the order of operations: price first, post second.
  assert.ok(APPROVE.indexOf("closeLimitPrice(") < APPROVE.indexOf("/v2/orders"));
});

test("a leg with no live quote stops the send, and the page says why", () => {
  assert.ok(/if \(!market\.ok\) \{/.test(APPROVE));
  assert.ok(/closeUnreadableNote\(market\.missing, oi\.legs\)/.test(APPROVE));
  // the refusal is BEFORE the POST
  assert.ok(APPROVE.indexOf("closeUnreadableNote") < APPROVE.indexOf(`https://${"${PAPER_HOST}"}/v2/orders`));
});

test("a link from the old build is refused rather than re-priced behind the user's back", () => {
  assert.ok(/if \(!a\.orderIntent\)/.test(APPROVE));
  assert.ok(/This link is out of date/.test(APPROVE));
});

/* ================================================================
   6) TASK 1 / TASK 4 — THE RECORD OF WHAT WAS SENT
================================================================ */

test("approve.mjs appends a timeline entry with the FULL order id", () => {
  assert.ok(/appendTimeline\(pos, \{/.test(APPROVE), "and it is sequenced like every other entry");
  assert.ok(/orderId: out\.id \? String\(out\.id\) : null/.test(APPROVE));
  assert.ok(/\$\{out\.id \? String\(out\.id\) : "\(no id\)"\}/.test(APPROVE), "no eight-character slice in the record");
  assert.ok(/res\.headline/.test(APPROVE), "and orderOutcome's headline is what it says happened");
});

test("the entry lands on the right position, by id and not by display name", () => {
  assert.ok(/posId: pos\.id/.test(AUTOPILOT), "the approval carries the id");
  assert.ok(/String\(p\.id\) === String\(a\.posId\)/.test(APPROVE));
});

test("A WORKING CLOSE IS SAID TO BE WORKING, AND NOTHING RETRIES IT", () => {
  assert.ok(/orderWorking: res\.working/.test(APPROVE), "the timeline records that it did not fill");
  assert.ok(/This order has NOT filled/.test(APPROVE), "and the page says so");
  assert.ok(/e\.type === "order" && e\.orderWorking/.test(AUTOPILOT),
    "the next run reads that entry back");
  assert.ok(/has not filled\. Nothing has been re-sent by itself/.test(AUTOPILOT),
    "and says the new proposal is a fresh one, not a retry");
});

test("the position's record is written back to the store after the order", () => {
  assert.ok(/pos\.timeline = t\.timeline; pos\.seqNext = t\.seqNext;/.test(APPROVE));
  assert.ok(/await store\.set\("state", JSON\.stringify\(state\)\);/.test(APPROVE));
});

test("a record that fails to write never undoes an order that went", () => {
  const tail = APPROVE.slice(APPROVE.indexOf("THE POSITION'S OWN RECORD"));
  assert.ok(/\} catch \{ \/\* the order went/.test(tail));
});

/* ================================================================
   7) PR #24 — THE SIMULATOR'S HORIZON, AND THE VOLATILITY IT WALKS ON
================================================================ */

test("THE SIMULATOR IS RUN AT THE EXIT RULE, AND THE POLICY COMES FROM ITS HOME", () => {
  // `exitSim` held its own copies (0.5, 0.5 and 7) and `RULES.exitDTE` is 21.
  assert.ok(/const EXIT_POLICY = \{ exitDTE: RULES\.exitDTE, takeProfitPct: RULES\.takeProfitPct, stopLossPct: RULES\.stopLossPct \}/
    .test(AUTOPILOT_CODE), "the policy is read from RULES, in one place");
  assert.ok(/exitSim\(pos, spot, dteLeft, iv, vol\.sigma, EXIT_POLICY\)/.test(AUTOPILOT_CODE),
    "and handed to the simulator, which has no default for it");
});

test("THE FIELD NAMES CLAIM THE HORIZON THE BLOCK WAS COMPUTED AT", () => {
  // `p_exit_at_exit_dte_positive` asserted the exit rule while the arithmetic
  // ran to 7 days. The model writes prose on top of these names.
  const block = AUTOPILOT_CODE.slice(AUTOPILOT_CODE.indexOf("simulator_from_today"));
  assert.ok(/p_exit_at_exit_dte_positive: \+\(sim\.pTimePos \* 100\)/.test(block));
  assert.ok(/simulated_to_dte: sim\.exitDTE/.test(block),
    "the block states the day it stopped at, from the simulator's own answer");
  assert.ok(/days_simulated: sim\.horizon/.test(block), "and how far it walked");
  // And the number in `simulated_to_dte` is the rule, not a second opinion:
  // `exitSim` returns the `exitDTE` it was RUN with, and it was run with RULES'.
  assert.equal(exitSim({ legs: [{ side: 1, type: "call", strike: 20, qty: 1 }], entryNet: 0.5, maxProfit: 100, maxLoss: -50 },
    20, 45, 0.3, 0.2, { exitDTE: RULES.exitDTE, takeProfitPct: RULES.takeProfitPct, stopLossPct: RULES.stopLossPct }, 5).exitDTE,
  RULES.exitDTE);
});

test("THE FALLBACK VOLATILITY HAS A NAME, AND THE BRIEF SAYS WHICH ONE WAS IN FORCE", () => {
  // It was `SIGMA[pos.ticker] || 0.25`: a hand-written table with an unlabelled
  // hand-written fallback behind it, driving every figure the simulator prints.
  assert.ok(!/SIGMA\[pos\.ticker\] \|\| 0\.25/.test(AUTOPILOT_CODE), "the bare fallback is gone");
  assert.ok(/sigmaProvenance\(SIGMA\[pos\.ticker\], pos\.ticker\)/.test(AUTOPILOT_CODE), "it is decided once");
  assert.ok(/simSigma: vol\.sigma, simSigmaSource: vol\.source/.test(AUTOPILOT_CODE), "carried on the brief");
  assert.ok(/if \(!vol\.fromTable\) ruleWarnings\.push\(vol\.note\)/.test(AUTOPILOT_CODE),
    "and a simulation walked at a number nobody wrote down for this market says so");
  assert.ok(/volatility_source: vol\.source/.test(AUTOPILOT_CODE), "the model is told too");
});

test("sigmaProvenance — a row in the table and no row are two different answers", () => {
  const boil = sigmaProvenance(SIGMA.BOIL, "BOIL");
  assert.equal(boil.sigma, SIGMA.BOIL);
  assert.equal(boil.fromTable, true);
  assert.equal(boil.source, TABLE_SIGMA_SOURCE);
  assert.ok(/written down, not measured/.test(boil.note), "and even the table says it was typed, not measured");

  for (const missing of [undefined, null, 0, NaN, -1]) {
    const v = sigmaProvenance(missing, "GLD");
    assert.equal(v.sigma, FALLBACK_SIGMA, `${missing} is not a volatility`);
    assert.equal(v.fromTable, false);
    assert.equal(v.source, FALLBACK_SIGMA_SOURCE);
    assert.ok(/FALLBACK VOLATILITY/.test(v.note) && /GLD/.test(v.note), "and it names the market it is guessing about");
  }
  // The number itself is CHOSEN, and the comment beside it says so. This test
  // holds the value so a silent edit is a failing build rather than a drift.
  assert.equal(FALLBACK_SIGMA, 0.25);
  assert.equal(FALLBACK_SIGMA, RULES.fallbackSigma, "and it lives in RULES with every other chosen number");
  assert.equal(RULES_SRC.includes("**0.25 IS CHOSEN, NOT MEASURED.**"), true,
    "the constant carries its own provenance, like closeLimitSlippage");
});

/* ---------------- report ---------------- */
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) { for (const f of failures) console.error(f.e); process.exit(1); }
