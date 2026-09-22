// ============================================================================
// src/ticket.test.jsx — THE THREE FAULTS READ ON A PHONE, AND THE TICKET THAT
// CAME OUT OF THEM.
//
// >>> THE LIVE READING. UNG, 2026-09-20, spot $10.42, the 2026-10-23 board at
// 33 DTE. <<<
//
//     buy  10.50C   mid 0.48   OI 471
//     sell 11.00C   mid 0.34   OI 172
//     combo:  bid $4   mid $14   ask $24   spread $20 = 143% of the mid
//
// The screen showed YOU PAY $14 · MOST YOU CAN MAKE $36 · MOST YOU CAN LOSE
// -$14 · BREAKEVEN 10.64. Every one of those numbers is internally consistent,
// which is why no test in this repository could have caught any of it: they
// describe a trade the user cannot have.
//
//   0a. The spread floor measured ONE LEG AT A TIME and charged the pair. Each
//       leg here is about ten cents wide — 21% and 29% of its own mid, both
//       inside the 35% per-leg ceiling — and the combination is 143% of its
//       own mid, because two leg spreads ADD onto one net that SUBTRACTS.
//   0b. Every figure was worked out at the MID, two thousand pixels above a
//       panel saying in these words that a limit at the mid does not fill. At
//       $24 the same structure pays $26, risks $24 and breaks even at 10.74.
//   0c. A limit is a CEILING, not a price: an order past the touch fills AT the
//       touch, so offering more costs nothing — and nothing said so.
//
// Everything here runs against the REAL sites: `shortlistWithFloors` and
// `analyze` out of App.jsx, `qualityFloor` out of rules.js, the rendered
// ticket out of pro.jsx.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  RULES, comboBook, comboSpreadShare, comboSpreadFloor, comboSpreadFloorReason,
  wideComboNote, comboSpreadSkippedNote, spreadFloor, qualityFloor,
  effectiveLimit, limitCeilingNote, orderVerdict, ORDER_VERDICTS,
  legBook, sizeSkippedNote, legLimitSeed, netFromLegs, onTick, openLimitPrice,
  rewardRisk, conflictSummaryLine, warningsToPrint, NOTHING_TODAY,
  tradeCard, TRADE_CARD_IDS, unlistedContractNote, unquotedLegNote, unquotedLegPointer,
  strikeSnapNote, offBoardStrikeLabel, checkedAgainstNote, NO_CEILING,
  limitPlacement, INDICATIVE_CLAUSE,
  rewardRiskRange, RR_POINTS, crossingCost, crossingCostNote, openingMarkNote, MIN_NET_DOLLARS,
} from "./rules.js";
import { analyze, shortlistWithFloors, TradeCard } from "./App.jsx";
import { terminalDist, compareDistInputs, compareDistNote, ComparePayoffs } from "./visuals.jsx";
import { candidateOf } from "./path.js";
import { evaluateTrade } from "./riskGate.js";
import { money } from "./rules.js";
import { OrderTicket, buildReportMd } from "./pro.jsx";
import { bookPositions } from "./journal.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const near = (a, b, tol, what) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${what}: ${a} is not within ${tol} of ${b}`); };
const has = (s, sub) => { if (!String(s).includes(sub)) throw new Error(`missing ${JSON.stringify(sub)} in ${JSON.stringify(String(s).slice(0, 300))}`); };
const hasNot = (s, sub) => { if (String(s).includes(sub)) throw new Error(`should not contain ${JSON.stringify(sub)}`); };

/* ---- THE LIVE UNG READING, AS A FIXTURE ----
   Ten cents wide on each leg, which is what produces the mids and the
   combination the owner read off the screen. */
const UNG_SPOT = 10.42;
const UNG_DTE = 33;
const UNG_IV = 0.55;
const UNG_LEGS = [
  { side: 1, qty: 1, type: "call", strike: 10.5 },
  { side: -1, qty: 1, type: "call", strike: 11.0 },
];
const UNG_QUOTES = [{ bid: 0.43, ask: 0.53, bidSize: 12, askSize: 8 }, { bid: 0.29, ask: 0.39, bidSize: 40, askSize: 25 }];

/* ==================================================================
   0a — THE PAIR IS NOT THE LEGS
================================================================== */

check("the live UNG pair passes the per-leg floor and is REFUSED by the pair one", () => {
  // Each leg on its own is fine, and that is the whole point.
  const perLeg = spreadFloor(UNG_QUOTES);
  eq(perLeg.checked, true, "both legs were measurable");
  eq(perLeg.pass, true, "each leg is inside the per-leg ceiling");
  if (!(perLeg.widest < RULES.maxSpreadShareOfMid)) {
    throw new Error(`the widest leg is ${perLeg.widest}, which the per-leg floor would already have caught`);
  }
  // The combination is not.
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  near(book.bid, 0.04, 1e-9, "combo bid");
  near(book.mid, 0.14, 1e-9, "combo mid");
  near(book.ask, 0.24, 1e-9, "combo ask");
  near(book.spread, 0.20, 1e-9, "combo spread");
  const combo = comboSpreadFloor(UNG_LEGS, UNG_QUOTES);
  eq(combo.checked, true, "there was a book to measure");
  eq(combo.pass, false, "143% of its own mid must not clear the pair ceiling");
  near(combo.share, 20 / 14, 1e-9, "the share the owner read");
  // ...and by a margin, not by a whisker.
  if (!(combo.share > RULES.maxComboSpreadShareOfNet * 1.4)) {
    throw new Error(`the live case clears the ceiling by only ${combo.share / RULES.maxComboSpreadShareOfNet}x`);
  }
});

check("the pair floor names itself, with its own numbers in the sentence", () => {
  const combo = comboSpreadFloor(UNG_LEGS, UNG_QUOTES);
  const why = comboSpreadFloorReason(combo.share, combo.spread, combo.mid, combo.floor);
  has(why, "$20");           // the spread
  has(why, "$14");           // the mid
  has(why, "142.9%");        // the share, at the app's own one-decimal rounding
  has(why, "COMBINATION");   // which of the two floors did the work
  // It must not read as the per-leg floor's refusal.
  has(why, "Its LEGS are each quoted tightly enough");
  // And the list line is its own sentence too.
  has(wideComboNote(2, "UNG 2026-10-23"), "WHOLE COMBINATION");
  has(wideComboNote(2, "UNG 2026-10-23"), "UNG 2026-10-23");
  has(comboSpreadSkippedNote("Alpaca"), "SKIPPED");
});

check("UNKNOWN IS NOT WIDE: a leg with no two-sided quote skips the pair floor", () => {
  const oneSided = [{ bid: 0.43, ask: 0.53 }, { bid: null, ask: 0.39 }];
  const r = comboSpreadFloor(UNG_LEGS, oneSided);
  eq(r.checked, false, "there is no combination market to measure");
  eq(r.pass, true, "and a book we do not have is not a wide one");
  // A net under the absolute minimum belongs to priceability(), not here: a
  // division by it is the infinity that printed R/R 6748644041614687.00.
  const zeroNet = [{ bid: 1.00, ask: 1.02 }, { bid: 1.00, ask: 1.02 }];
  eq(comboSpreadFloor(UNG_LEGS, zeroNet).checked, false, "a net of about nothing is unpriceable, not wide");
  eq(comboSpreadShare({ ok: false }), null, "no book, no share");
});

check("qualityFloor() counts the pair separately — no pooled count", () => {
  const qf = qualityFloor({
    openInterest: [471, 172], peerOpenInterest: [471, 172, 300, 900, 50, 80, 120, 260],
    quotes: UNG_QUOTES, legs: UNG_LEGS,
    maxProfit: 36, maxLoss: -14,
  });
  eq(qf.pass, false, "the pair floor removes it");
  eq(qf.spread.pass, true, "and the per-leg floor did NOT");
  eq(qf.comboSpread.pass, false, "which is the count that has to carry it");
  eq(qf.liquidity.pass, true, "471 and 172 open contracts are not the problem");
  eq(qf.reward.pass, true, "2.57:1 is not the problem either");
  // Exactly one reason, and it is this floor's.
  eq(qf.reasons.length, 1, "one fault, one sentence");
  has(qf.reasons[0], "COMBINATION");
});

check("the Shortlist refuses it at the REAL generation site, with its own tally", () => {
  // A UNG-shaped board: every leg ten cents wide, deep open interest, nothing
  // else wrong with any of it.
  const strikes = [9.5, 10.0, 10.5, 11.0, 11.5];
  const MID = { 9.5: 1.06, 10.0: 0.72, 10.5: 0.48, 11.0: 0.34, 11.5: 0.22 };
  const quote = (leg) => {
    const px = MID[leg.strike];
    return px == null ? null : { mid: px, bid: +(px - 0.05).toFixed(2), ask: +(px + 0.05).toFixed(2), iv: UNG_IV, oi: 400, vol: 30 };
  };
  const r = shortlistWithFloors("bull", UNG_SPOT, 0.5, strikes, UNG_DTE, UNG_IV, quote,
    { peers: [400, 400, 400, 400, 400, 400, 400, 400, 400, 400] });
  if (!(r.tally.comboSpread > 0)) throw new Error("no structure was removed for its combination spread");
  eq(r.tally.spread, 0, "and none of them for a single leg — that is the fault");
  const cut = r.cut.filter((c) => c.why === "comboSpread");
  eq(cut.length, r.tally.comboSpread, "the count and the list are the same thing");
  has(cut[0].reasons[0], "COMBINATION");
  // Nothing that survived is over the pair ceiling.
  for (const row of r.rows) {
    const q = row.p.legs.map((l) => { const x = quote(l); return { bid: x.bid, ask: x.ask }; });
    const c = comboSpreadFloor(row.p.legs, q);
    if (c.checked && !c.pass) throw new Error(`${row.p.name} was offered at ${c.share} of its net wide`);
  }
});

check("the refusal screen and the list line know about the pair as well", () => {
  const screen = NOTHING_TODAY.belowQualityFloor({ comboSpread: 3, markets: ["UNG"], level: null });
  has(screen, "3 because");
  has(screen, "WHOLE combination");
  has(screen, "filtered out by the quality floors");
});

/* ==================================================================
   0b — EVERY FIGURE AT THE PRICE THAT WILL BE SENT
================================================================== */

const at = (net) => analyze(UNG_LEGS, UNG_SPOT, UNG_DTE, UNG_IV, (leg) => {
  const q = { 10.5: UNG_QUOTES[0], 11.0: UNG_QUOTES[1] }[leg.strike];
  return q ? { mid: (q.bid + q.ask) / 2, bid: q.bid, ask: q.ask, iv: UNG_IV, oi: 400, vol: 10 } : null;
}, net == null ? {} : { net });

check("the same structure at $14 and at $24 is NOT the same trade", () => {
  const mid = at(0.14), touch = at(0.24);
  // What the owner read, and what he could actually have had.
  near(mid.entry, 0.14, 1e-9, "at the mid");
  near(touch.entry, 0.24, 1e-9, "at the price that trades");
  near(mid.maxProfit, 36, 0.51, "MOST YOU CAN MAKE at the mid");
  near(touch.maxProfit, 26, 0.51, "MOST YOU CAN MAKE at the touch");
  near(mid.maxLoss, -14, 0.51, "MOST YOU CAN LOSE at the mid");
  near(touch.maxLoss, -24, 0.51, "MOST YOU CAN LOSE at the touch");
  near(mid.breakevens[0], 10.64, 0.006, "BREAKEVEN at the mid");
  near(touch.breakevens[0], 10.74, 0.006, "BREAKEVEN at the touch");
  // NEARLY HALF THE REWARD AND NEARLY DOUBLE THE RISK: 2.6:1 becomes 1.1:1.
  near(rewardRisk(mid.maxProfit, mid.maxLoss), 2.57, 0.05, "made per $1 risked at the mid");
  near(rewardRisk(touch.maxProfit, touch.maxLoss), 1.08, 0.05, "made per $1 risked at the touch");
});

check("the mid is still on screen, and `entrySource` says which price produced the figures", () => {
  const touch = at(0.24);
  near(touch.entryMid, 0.14, 1e-9, "the mid travels with the analysis, always");
  eq(touch.entrySource, "limit", "and a field name may not assert a price the arithmetic did not use");
  const plain = at(null);
  eq(plain.entrySource, "mid", "with no override it is the old behaviour exactly");
  near(plain.entry, plain.entryMid, 1e-12, "and entry IS the mid there");
});

/* ==================================================================
   0c — A LIMIT IS A CEILING, NOT A PRICE
================================================================== */

check("a limit above the ask produces the ASK's figures, not the limit's", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const e = effectiveLimit(0.30, book, 1);
  eq(e.known, true, "there is a book to place it against");
  eq(e.capped, true, "0.30 is past the 0.24 touch");
  near(e.effective, 0.24, 1e-9, "you pay the ask, not what you offered");
  near(e.give, 0.06, 1e-9, "and the app knows by how much");
  // And the figures follow the effective price, not the typed one.
  const figures = at(e.net);
  near(figures.entry, 0.24, 1e-9, "the analysis is at the ask");
  near(figures.maxProfit, 26, 0.51, "not the $20 a $0.30 debit would leave");
  // Inside the spread nothing is capped and the typed price IS the price.
  const inside = effectiveLimit(0.18, book, 1);
  eq(inside.capped, false, "0.18 is inside the market");
  near(inside.effective, 0.18, 1e-9, "so it stands as typed");
});

check("the sentence the app never said, and only when there is something to say", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const note = limitCeilingNote(effectiveLimit(0.30, book, 1));
  has(note, "$30");        // what you offer
  has(note, "$24");        // what you pay
  has(note, "CEILING");
  eq(limitCeilingNote(effectiveLimit(0.18, book, 1)), null, "nothing is said when nothing differs");
  eq(limitCeilingNote(null), null, "and nothing at all without a reading");
});

check("a credit is capped the other way round — the direction has one home", () => {
  const creditLegs = [{ side: -1, qty: 1, type: "call", strike: 10.5 }, { side: 1, qty: 1, type: "call", strike: 11.0 }];
  const book = comboBook(creditLegs, UNG_QUOTES);
  if (!(book.mid < 0)) throw new Error("this fixture is supposed to be a credit");
  // `book.ask` is the price the structure AS BUILT trades at right now, which
  // on a credit is the SMALLEST magnitude of the three: crossing the market
  // here pays you only $4. Asking for LESS than that gets you the $4.
  near(Math.abs(book.ask), 0.04, 1e-9, "what crossing pays you today");
  const e = effectiveLimit(0.02, book, -1);
  eq(e.capped, true, "a smaller demand is the keener offer on a credit");
  near(e.effective, Math.abs(book.ask), 1e-9, "you receive what is on the table, not the less you asked for");
  // Asking for more than it is offering is not capped, and may never flip.
  const greedy = effectiveLimit(0.14, book, -1);
  eq(greedy.capped, false, "demanding more than the market offers is not a fill");
  near(greedy.effective, 0.14, 1e-9, "and it stands as asked");
  if (greedy.net > 0) throw new Error("a credit must stay signed as a credit");
});

/* ==================================================================
   TASK 1 — THE TICKET
================================================================== */

check("ONE PRICE WITH DAY AND WITH GTC IS TWO DIFFERENT VERDICTS", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const day = orderVerdict(0.18, book, { sign: 1, tif: "day" });
  const gtc = orderVerdict(0.18, book, { sign: 1, tif: "gtc" });
  eq(day.state, "waiting", "inside the spread is waiting, whichever horizon");
  eq(gtc.state, "waiting", "the price has not changed");
  if (day.tifSentence === gtc.tifSentence) throw new Error("the time in force changed nothing about the verdict");
  has(gtc.tifSentence, "survives");        // it lives past the close
  has(day.tifSentence, "TODAY ONLY");      // it does not
  has(day.tifSentence, "gone");
});

check("the verdict band is three states and names the distance", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  eq(orderVerdict(0.30, book, { sign: 1, tif: "day" }).state, "fills", "past the touch fills");
  // EXACTLY AT THE TOUCH FILLS, and this one is floating point: `book.ask` is a
  // SUM of leg quotes and comes out 0.24000000000000005, so without the
  // half-cent slack in `keenerThan()` a limit at the one price that trades read
  // "you are waiting". Same disease as the mid comparison, same tolerance.
  eq(orderVerdict(0.24, book, { sign: 1, tif: "day" }).state, "fills", "at the touch fills");
  eq(effectiveLimit(0.24, book, 1).capped, true, "and the effective price agrees with the verdict");
  eq(orderVerdict(0.18, book, { sign: 1, tif: "day" }).state, "waiting", "inside the spread waits");
  eq(orderVerdict(0.14, book, { sign: 1, tif: "day" }).state, "no-fill", "the mid is the one that does not fill");
  eq(orderVerdict(0.02, book, { sign: 1, tif: "day" }).state, "no-fill", "and past the far side certainly does not");
  for (const L of [0.30, 0.18, 0.14]) {
    const v = orderVerdict(L, book, { sign: 1, tif: "day" });
    if (!ORDER_VERDICTS.includes(v.state)) throw new Error(`${v.state} is not one of the three`);
  }
  // The waiting label carries the distance from what trades today.
  has(orderVerdict(0.18, book, { sign: 1, tif: "day" }).label, "$6");
  has(orderVerdict(0.18, book, { sign: 1, tif: "day" }).label, "under what trades today");
  // No book, no verdict — and it says so rather than guessing.
  eq(orderVerdict(0.18, comboBook(UNG_LEGS, [{ bid: 0.43, ask: 0.53 }, {}]), { sign: 1 }).known, false,
    "an unquoted leg has no placement");
});

/* ==================================================================
   ROADMAP P10 §1 — ONE PRICE, AND WHAT CROSSING COSTS
================================================================== */

check("R/R IS INVARIANT UNDER SIZE — nobody may build a budget-driven one", () => {
  /* >>> READ THIS BEFORE BUILDING ANYTHING THAT LOOKS LIVE. <<< `analyze()`
     multiplies `maxProfit` AND `maxLoss` by the same leg quantities, so the
     RATIO cannot move with the size: $4 against $346 at one contract is $40
     against $3,460 at ten. A "reward-to-risk as a function of the budget"
     would be a number that looks live and never moves, which is this
     repository's oldest failure mode wearing a new coat. */
  const one = analyze(UNG_LEGS, 10.42, 33, 0.85, () => null, { net: 0.24 });
  const ten = analyze(UNG_LEGS.map((l) => ({ ...l, qty: l.qty * 10 })), 10.42, 33, 0.85, () => null, { net: 2.4 });
  const a = rewardRisk(one.maxProfit, one.maxLoss);
  const b = rewardRisk(ten.maxProfit, ten.maxLoss);
  if (a == null || b == null) throw new Error("both sizes must price");
  if (Math.abs(a - b) > 1e-9) throw new Error(`the ratio moved with the size: ${a} against ${b}`);
  // ...and both ends really did scale, so the invariance is not two nulls.
  if (!(Math.abs(ten.maxLoss) > Math.abs(one.maxLoss) * 5)) throw new Error("the size did not scale the dollars");
});

check("THE RANGE IS THREE RATIOS WITH THEIR THREE NETS", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const at = (net) => analyze(UNG_LEGS, 10.42, 33, 0.85, () => null, { net });
  const r = rewardRiskRange({ book, at });
  for (const k of RR_POINTS) {
    if (!(k in r)) throw new Error(`${k} is missing from the range`);
    if (!("net" in r[k]) || !("rr" in r[k])) throw new Error(`${k} carries a ratio with no price`);
  }
  /* >>> AND ON THIS BOOK THE BID END IS CORRECTLY NULL. <<< UNG's combination
     bids $0.04, under `minNetPremium` — so there is no ratio to print at it,
     exactly as `rewardRisk()` returns null under its own minimum. A range with
     an unreadable end is not a range, and it says so rather than dividing. */
  eq(r.bid.rr, null, "a combination bid under the minimum has no ratio");
  eq(r.bid.net, null);
  if (!(r.mid.rr > r.fill.rr)) {
    throw new Error(`the range does not order with the price: ${r.mid.rr} ${r.fill.rr}`);
  }
  // THE PRICE IS WHAT MOVES IT: on a book whose three ends are all readable,
  // cheaper in is a better ratio, all the way down.
  const wide = comboBook(
    [{ side: 1, qty: 1, type: "call", strike: 10.5 }, { side: -1, qty: 1, type: "call", strike: 12 }],
    [{ bid: 1.00, ask: 1.20 }, { bid: 0.30, ask: 0.50 }]);
  const wr = rewardRiskRange({
    book: wide,
    at: (net) => analyze(
      [{ side: 1, qty: 1, type: "call", strike: 10.5 }, { side: -1, qty: 1, type: "call", strike: 12 }],
      10.42, 33, 0.85, () => null, { net }),
  });
  for (const k of RR_POINTS) if (wr[k].rr == null) throw new Error(`${k} should be readable on this book`);
  if (!(wr.bid.rr > wr.mid.rr && wr.mid.rr > wr.fill.rr)) {
    throw new Error(`the range does not order with the price: ${wr.bid.rr} ${wr.mid.rr} ${wr.fill.rr}`);
  }
  // ...and `rewardRisk()` keeps its single-value job, unchanged.
  const one = at(r.fill.net);
  near(rewardRisk(one.maxProfit, one.maxLoss), r.fill.rr, 1e-9, "the range reads rewardRisk()");
  // NO BOOK, NO RANGE — and a net under the minimum is a null end, not a ratio.
  eq(rewardRiskRange({ book: comboBook(UNG_LEGS, [{ bid: 0.43, ask: 0.53 }, {}]), at }), null);
  const tiny = rewardRiskRange({ book: { ok: true, bid: 0.001, mid: 0.001, ask: 0.001, spread: 0 }, at });
  eq(tiny.mid.rr, null, "a price under the minimum has no ratio");
  eq(tiny.mid.net, null, "and no price either");
});

check("WHAT CROSSING COSTS IS ONE LINE, AND THE MARK AT THE BID IS IN THE FOLD", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const cc = crossingCost({ book });
  eq(cc.known, true);
  // The suggestion IS openLimitPrice(), not a fourth number.
  near(cc.fill, openLimitPrice({ netMid: book.mid, spread: book.spread }).net, 1e-9, "one suggestion");
  near(cc.cost, Math.abs(cc.fill) - Math.abs(cc.mid), 1e-9, "the cost is the concession and nothing else");
  const line = crossingCostNote(cc);
  has(line, "Suggested"); has(line, "fair value (mid)"); has(line, "costs you");
  // WHY A NEW POSITION STARTS NEGATIVE, said where the range is.
  has(openingMarkNote(cc), "the moment it opens");
  has(openingMarkNote(cc), "round trip");
  // NO BOOK IS NOT A PRICE OF ZERO.
  const none = crossingCost({ book: comboBook(UNG_LEGS, [{ bid: 0.43, ask: 0.53 }, {}]) });
  eq(none.known, false); eq(none.fill, null);
  has(crossingCostNote(none), "cannot suggest a price");
  eq(openingMarkNote(none), null);
});

check("FILLS NOW NAMES THE FEED IT WAS JUDGED ON — J-0003", () => {
  /* J-0003: SOYB 28/30, a debit of $0.80 good until cancelled, typed at the
     combination ASK the ticket was showing. The ticket said FILLS NOW. Several
     sessions later it is still open and nothing has filled.

     The book this app reads is Alpaca's INDICATIVE option snapshot, not OPRA,
     and a combination ask is the arithmetic of four of them. This is WORDING:
     no threshold moves, the three zones are the three zones, and every other
     sentence is untouched. What changes is that the strongest claim on the
     ticket stops asserting a certainty it has no way to have. */
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const fills = limitPlacement(Math.abs(book.ask), book);
  eq(fills.zone, "fills", "at the touch is still the fills-now zone");
  has(fills.sentence, INDICATIVE_CLAUSE);
  // ...and it is the FILLS branch that carries it. A price that is waiting or
  // will not fill is not claiming anything the feed can be wrong about.
  const waiting = limitPlacement(0.18, book);
  eq(waiting.zone, "waiting", "0.18 is inside this spread");
  if (waiting.sentence.includes(INDICATIVE_CLAUSE)) {
    throw new Error("only the certainty needs the caveat");
  }
  // THE ARITHMETIC IS UNTOUCHED: the same three zones at the same prices.
  eq(limitPlacement(0.30, book).zone, "fills");
  eq(limitPlacement(0.14, book).zone, "unlikely", "the mid still does not fill");
  eq(limitPlacement(0.02, book).zone, "no-fill");
  // And the verdict band reads the placement, so it inherits the clause.
  has(orderVerdict(Math.abs(book.ask), book, { sign: 1, tif: "gtc" }).sentence, INDICATIVE_CLAUSE);
});

check("A LEG WITH NO QUOTED SIZE IS SKIPPED, AND THE SCREEN SAYS WHICH", () => {
  const noSize = [{ bid: 0.43, ask: 0.53, bidSize: 12, askSize: 8 }, { bid: 0.29, ask: 0.39 }];
  const lb = legBook(UNG_LEGS, noSize);
  eq(lb.rows[0].bidSize, 12, "a size that came back is a size");
  eq(lb.rows[1].bidSize, null, "and one that did not is UNKNOWN");
  eq(lb.rows[1].askSize, null, "never zero: Number(null) is 0 and 0 is finite");
  eq(lb.missingSizes, 1, "counted, so the screen can name it");
  has(sizeSkippedNote(1, "Alpaca"), "One leg");
  has(sizeSkippedNote(1, "Alpaca"), "Alpaca");
  has(sizeSkippedNote(2), "2 legs");
  // A size of 0 that the feed really did report is a reading, not an absence.
  eq(legBook(UNG_LEGS, [{ bid: 0.43, ask: 0.53, bidSize: 0, askSize: 0 }, UNG_QUOTES[1]]).rows[0].bidSize, 0,
    "a reported zero is a real reading");
});

check("which side of each leg trades, and the whole market is read-only", () => {
  const lb = legBook(UNG_LEGS, UNG_QUOTES);
  eq(lb.rows[0].trades, "ask", "you lift the ask on a leg you are buying");
  eq(lb.rows[1].trades, "bid", "and hit the bid on one you are selling");
  eq(lb.quoted, 2, "both legs are two-sided here");
  eq(legBook(UNG_LEGS, [{ bid: 0.43, ask: 0.53 }, { ask: 0.39 }]).unquoted, 1, "and a one-sided leg is named");
});

check("the sliders start where openLimitPrice() puts the combination, on the cent", () => {
  const seed = legLimitSeed(UNG_LEGS, UNG_QUOTES);
  eq(seed.length, 2, "one price per leg");
  for (const p of seed) eq(onTick(p), p, "every seeded price is on the tick");
  // A long leg concedes UP, a short leg concedes DOWN: both raise the debit.
  if (!(seed[0] > (UNG_QUOTES[0].bid + UNG_QUOTES[0].ask) / 2)) throw new Error("the long leg did not concede upward");
  if (!(seed[1] < (UNG_QUOTES[1].bid + UNG_QUOTES[1].ask) / 2)) throw new Error("the short leg did not concede downward");
  // ...and never past its own touch.
  if (seed[0] > UNG_QUOTES[0].ask || seed[1] < UNG_QUOTES[1].bid) throw new Error("a concession crossed the touch");
  // The net they sum to is the combination's own suggested limit, to the cent.
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const combo = openLimitPrice({ netMid: book.mid, spread: book.spread });
  const summed = netFromLegs(UNG_LEGS, seed);
  near(Math.abs(summed.net), combo.limit, 0.011, "one arithmetic seen two ways, within one tick");
});

check("the net is derived from the legs and shows its own arithmetic", () => {
  const r = netFromLegs(UNG_LEGS, [0.52, 0.30]);
  near(r.net, 0.22, 1e-9, "0.52 − 0.30");
  eq(r.ok, true, "every leg is priced");
  has(r.line, "0.52");
  has(r.line, "0.30");
  has(r.line, "$22");
  // An unpriced leg is not a net of nothing.
  const missing = netFromLegs(UNG_LEGS, [0.52, null]);
  eq(missing.net, null, "a missing leg has no net");
  eq(missing.unpriced, 1, "and the screen is told which");
  eq(missing.line, null, "no arithmetic to show either");
});

check("options do not have continuous prices — the value itself is on the tick", () => {
  eq(onTick(0.525), 0.53, "half a cent rounds to a cent");
  eq(onTick(0.5249), 0.52, "and down where it should");
  eq(onTick("0.335"), 0.34, "a string from an input is a number first");
  eq(onTick("abc"), null, "and nothing at all is null, never zero");
});

check("the rebuilt ticket renders the market, the sliders and the verdict band", () => {
  const book = comboBook(UNG_LEGS, UNG_QUOTES);
  const seed = legLimitSeed(UNG_LEGS, UNG_QUOTES);
  const net = netFromLegs(UNG_LEGS, seed).net;
  const html = renderToStaticMarkup(
    <OrderTicket
      legs={UNG_LEGS} expKey="2026-10-23" ticker="UNG"
      quoteFn={() => null} estNet={0.14} setMsg={() => {}} gate={() => ({ pass: true, violations: [], warnings: [] })}
      dte={UNG_DTE} maxLoss={-24} maxProfit={26} spot={UNG_SPOT}
      cfg={{ type: "limit", tif: "gtc" }} onCfg={() => {}}
      quotes={UNG_QUOTES} legPrices={seed} net={net}
      verdict={orderVerdict(Math.abs(net), book, { sign: 1, tif: "gtc" })}
      effective={effectiveLimit(Math.abs(net), book, 1)}
      seed={seed} feed="Alpaca (indicative)" />);
  // 1 — the market, read-only, first, with the sizes.
  has(html, "THE MARKET, LEG BY LEG");
  has(html, "BUY");
  has(html, "SELL");
  has(html, "0.43");   // the long leg's bid
  has(html, "0.53");   // ...and its ask, which is the side that trades
  has(html, "12");     // bid size
  has(html, "8");      // ask size
  // 2 and 3 — the sliders and the net beside its own arithmetic.
  has(html, "ONE-CENT STEPS");
  has(html, 'type="range"');
  has(html, "YOUR LIMIT");
  // 4 and 5 — the time in force is part of the verdict, not a footnote.
  has(html, "WAITING");
  has(html, "survives");
  // 6 — the four numbers that move, at the effective price.
  has(html, "MOST YOU CAN MAKE");
  has(html, "MOST YOU CAN LOSE");
  has(html, "MADE PER $1 RISKED");
  has(html, "NOTIONAL CONTROLLED");
  // 7 — the warnings are NOT here: they are in the one panel on the screen.
  hasNot(html, "The four factors disagree");
});

/* ==================================================================
   TASK 1.7 — THE WARNINGS, ONCE
================================================================== */

check("the CONFLICT paragraph is replaced by a line carrying the number", () => {
  const narrative = "The four factors disagree about UNG. ".repeat(12).trim();
  const warnings = [
    { code: "SIGNAL_CONFLICT", message: `The four factors disagree (agreement: CONFLICT, score -12/100, confidence 32/100). ${narrative}` },
    { code: "LOW_CONFIDENCE", message: "Signal confidence is 32/100, under the 40 mark." },
  ];
  const clash = { n: 3, total: 4, confidence: 32, agreement: "CONFLICT" };
  const pointer = conflictSummaryLine(clash, { confidence: 32, agreement: "CONFLICT" });
  has(pointer, "3 of 4 factors");
  has(pointer, "32/100");
  has(pointer, "Why this trade");
  const out = warningsToPrint(warnings, { narrative, pointer });
  eq(out.length, 2, "nothing is dropped — the gate's verdict is untouched");
  hasNot(out[0].message, narrative);
  has(out[0].message, "CONFLICT");             // the headline and the counts stay
  has(out[0].message, "3 of 4 factors");       // and the pointer takes the paragraph's place
  eq(out[0].narrativeRemoved, true, "and the screen can tell it happened");
  eq(out[1].message, warnings[1].message, "a warning with no narrative in it is returned as it was");
  // With no narrative to remove, nothing changes at all.
  eq(warningsToPrint(warnings, {})[0].message, warnings[0].message, "no narrative, no surgery");
});

/* ==================================================================
   TASK 2 — THE COMPARE PICTURE
================================================================== */

check("terminalDist() has NO default drift, and a missing one is not a zero", () => {
  const base = { spot: 22, sigma: 0.3, dte: 45, lo: 12, hi: 34, bins: 20 };
  eq(terminalDist(base).bins.length, 0, "no drift, no distribution");
  if (!(terminalDist({ ...base, driftAnnual: 0 }).bins.length === 20)) throw new Error("an explicit zero is a reading");
  // ...and the two are genuinely different pictures, which is why it matters.
  const flat = terminalDist({ ...base, driftAnnual: 0 });
  const drifted = terminalDist({ ...base, driftAnnual: 0.35 });
  if (flat.bins[3].p === drifted.bins[3].p) throw new Error("the drift changed nothing about the curve");
});

check("ComparePayoffs draws at the numbers the CHANCE was worked out at", () => {
  // A candidate carrying the chance's own implied volatility and seasonal drift.
  const cand = candidateOf({
    name: "Bull Call Spread", legs: UNG_LEGS, entryNet: 0.24, pop: 0.42,
    dte: UNG_DTE, expKey: "2026-10-23", maxProfit: 26, maxLoss: -24,
    sigma: UNG_IV, driftAnnual: 0.11,
  }, { ticker: "UNG", spot: UNG_SPOT });
  eq(cand.sigma, UNG_IV, "the volatility the chance was priced at");
  eq(cand.driftAnnual, 0.11, "and the drift it leaned on");
  const inputs = compareDistInputs([cand, { ...cand, key: "b", name: "other" }]);
  eq(inputs.ok, true, "both numbers are there, so the curve can be drawn");
  eq(inputs.sigma, UNG_IV, "and it is drawn at the implied one");
  eq(inputs.driftAnnual, 0.11, "on the seasonal drift");
  // An unstamped candidate — one saved before this — draws nothing and says why.
  const old = candidateOf({ name: "Old", legs: UNG_LEGS, entryNet: 0.24, dte: UNG_DTE, maxProfit: 26, maxLoss: -24, sigma: UNG_IV },
    { ticker: "UNG", spot: UNG_SPOT });
  eq(old.driftAnnual, null, "the ABSENCE of the stamp is the marker");
  const noDrift = compareDistInputs([old, { ...old, key: "b" }]);
  eq(noDrift.ok, false, "and no distribution is drawn over it");
  eq(noDrift.why, "drift", "naming what is missing");
  has(compareDistNote("drift"), "a missing drift is not a drift of zero");
  has(compareDistNote("markets"), "not all the same market");
  // The picture still renders in every state.
  renderToStaticMarkup(<ComparePayoffs items={[cand, old]} width={700} />);
  renderToStaticMarkup(<ComparePayoffs items={[cand]} width={700} />);
});

/* ====================================================================
   THE TRADE CARD — FIVE FIXED LINES, AND A REFUSAL THAT IS NOT BEHIND A TAP.
   PRD §4n, ROADMAP P4. Rendered against the REAL component out of App.jsx and
   the REAL sentences out of rules.js — no second implementation of either.
==================================================================== */

const CARD_ARGS = {
  ticker: "SOYB", name: "Bull Call Spread", dir: 1, spot: 27.64,
  expKey: "2026-11-20", dte: 61,
  maxLoss: -67.3, maxProfit: 82.7, breakevens: [27.67], profitUnbounded: false,
  contracts: 14,
  chance: { pop: 0.44, runs: 8000, ev: 3.2 },
  chanceNote: "SOYB's own seasonal reading drifted it.",
  limits: { answered: true, perTrade: 1000, tradingCapital: 20000 },
  notional: 38696,
  agreement: "CONFLUENT",
};

check("the five-line card renders all five lines, with real numbers", () => {
  const card = tradeCard(CARD_ARGS);
  eq(card.lines.length, 5, "the card is not five lines");
  eq(card.lines.map((l) => l.id).join(","), TRADE_CARD_IDS.join(","), "the five are not the five");
  const html = renderToStaticMarkup(
    <TradeCard ticker="SOYB" name="Bull Call Spread" card={card} refusals={[]}
      onNumbers={() => {}} onOrder={() => {}} />);
  for (const l of card.lines) {
    has(html, l.label);
    // every sentence, whole, not a summary of it
    has(html, l.text.slice(0, 40));
  }
  // 1 — what you are betting on: the direction, the level and the horizon.
  has(html, "SOYB goes up");
  has(html, "$27.67");
  has(html, "2026-11-20");
  // 2 — what you risk, at the SIZE on screen, against the limit that binds.
  has(html, "$942");
  has(html, "$1,000 per-trade limit");
  has(html, "$38,696");
  // 3 — how often it works, and WHICH question that answers.
  has(html, "4 times in 10");
  has(html, "AT EXPIRY");
  // A CHANCE NEVER TRAVELS WITHOUT THE TABLE THAT DRIFTED IT.
  has(html, "seasonal reading");
  // 4 — when it exits, and the stop named as the warning it is.
  has(html, "21 days to expiration");
  has(html, "WARNING");
  // 5 — what would make it wrong.
  has(html, "the exit rule closes it there");
  // THE CURRENCY IS THE BROKER'S, SAID ONCE, NOT CONVERTED.
  has(html, "US dollars");
  hasNot(html, "euro");
  hasNot(html, "€");
});

check("A REFUSAL IS ON THE FIRST SCREEN, NEVER BEHIND THE TAP", () => {
  const card = tradeCard(CARD_ARGS);
  const refusals = [{ code: "UNLISTED_CONTRACT", message: unlistedContractNote(
    [{ i: 0, leg: { strike: 27.5, type: "call" }, side: 1 }], 2) }];
  const html = renderToStaticMarkup(
    <TradeCard ticker="SOYB" name="Bull Call Spread" card={card} refusals={refusals}
      onNumbers={() => {}} onOrder={() => {}} />);
  has(html, "THIS ORDER WOULD NOT BE SENT");
  has(html, "27.5C");
  has(html, "never listed");
  // ...and the two taps that hide the NUMBERS are still offered beside it: the
  // tap only ever hides figures that explain a trade, never a reason it cannot
  // be made.
  has(html, "All the numbers");
  has(html, "Price it and send");
});

check("an unknown is still not a number on the card", () => {
  const blank = tradeCard({ ticker: "SOYB", name: "x" });
  eq(blank.lines.length, 5, "a card with nothing in it is still five lines");
  has(blank.lines[1].text, "could not be computed");
  has(blank.lines[2].text, "not a confident zero");
  // NO CEILING IS NOT A TAKE-PROFIT OF ZERO.
  const unbounded = tradeCard({ ...CARD_ARGS, profitUnbounded: true, maxProfit: null });
  has(unbounded.lines[3].text, NO_CEILING);
  hasNot(unbounded.lines[3].text, "$0");
});

check("THE UNQUOTED-LEG SENTENCE APPEARS ONCE, NOT TWICE", () => {
  /* >>> COUNTED ON THE BUILD SCREEN OF 20 Sep 2026. <<< "One leg has no
     two-sided quote" was printed by the leg table AND by the combination
     panel — the same fault as the CONFLICT paragraph that was on one page four
     times, inside the panel PR #28 built to fix it. One fact, one place. */
  const oneSided = [{ bid: 0.43, ask: 0.53, mid: 0.48, occ: "UNG261023C00010500" },
    { bid: 0.3, ask: null, mid: 0.3, occ: "UNG261023C00011000" }];
  const html = renderToStaticMarkup(
    <OrderTicket
      legs={UNG_LEGS} expKey="2026-10-23" ticker="UNG"
      quoteFn={() => null} estNet={0.14} setMsg={() => {}}
      gate={() => ({ pass: true, violations: [], warnings: [] })}
      dte={UNG_DTE} maxLoss={-24} maxProfit={26} spot={UNG_SPOT}
      cfg={{ type: "limit", tif: "gtc" }} onCfg={() => {}}
      quotes={oneSided} legPrices={[0.5, 0.3]} net={0.2}
      seed={[0.5, 0.3]} feed="Alpaca (indicative)" />);
  const full = unquotedLegNote(1);
  const n = html.split(full.slice(0, 50)).length - 1;
  eq(n, 1, `the unquoted-leg sentence is on the screen ${n} times`);
  // ...and the other panel points at it instead of repeating it.
  has(html, unquotedLegPointer(1).slice(0, 40));
});

check("A MARKET ORDER EARNS ITS WARNING, and stops claiming a price below", () => {
  const html = renderToStaticMarkup(
    <OrderTicket
      legs={UNG_LEGS} expKey="2026-10-23" ticker="UNG"
      quoteFn={() => null} estNet={0.14} setMsg={() => {}}
      gate={() => ({ pass: true, violations: [], warnings: [] })}
      dte={UNG_DTE} maxLoss={-24} maxProfit={26} spot={UNG_SPOT}
      cfg={{ type: "market", tif: "day" }} onCfg={() => {}}
      quotes={UNG_QUOTES} legPrices={[]} net={null}
      seed={[]} feed="Alpaca (indicative)" />);
  has(html, "A market order has no price");
  // The stat tile used to say "at the price below, not at the mid" under a
  // MARKET order, which names a control that is not on the screen.
  hasNot(html, "at the price below, not at the mid");
  has(html, "at the touch a market order takes");
});

check("a strike that moved onto a new board says so", () => {
  const note = strikeSnapNote([{ i: 0, from: 27.5, to: 28 }], "2026-11-20");
  has(note, "27.5 → 28");
  has(note, "2026-11-20");
  eq(strikeSnapNote([], "2026-11-20"), null, "nothing moved is not an event");
});

/* ==========================================================================
   THE WEEKLY REPORT DESCRIBED A BOOK THAT WAS NOT THERE.

   Section 2's job is to say what is open against the rules. It listed
   `store.positions` whole, so the three WATCHING rows from the phone — orders
   the broker came back on with nothing bought — were reported as positions.
   And it summed `maxLoss` RAW, while `maxLoss` describes ONE combination.
   ========================================================================== */
const reportCtx = (positions) => ({
  store: { positions, journal: [], settings: {} },
  scan: [], news: [], seasonalSrc: {},
});
const NOT_TAKEN_3 = [
  { ticker: "SOYB", name: "Bull Call Spread", expKey: "2026-11-20", expiry: "2026-11-20T00:00:00.000Z",
    entryNet: 4.5, maxProfit: 550, maxLoss: -450, contracts: 1,
    alpacaId: "o1", alpacaStatus: "canceled", alpacaFilled: false },
  { ticker: "BOIL", name: "Iron Condor", expKey: "2026-11-20", expiry: "2026-11-20T00:00:00.000Z",
    entryNet: -5.77, maxProfit: 577, maxLoss: -577, contracts: 1,
    alpacaId: "o2", alpacaStatus: "expired", alpacaFilled: false },
  { ticker: "UNG", name: "Bull Put Spread", expKey: "2026-11-20", expiry: "2026-11-20T00:00:00.000Z",
    entryNet: -0.14, maxProfit: 14, maxLoss: -14, contracts: 1,
    alpacaId: "o3", alpacaStatus: "canceled", alpacaFilled: false },
];

check("SECTION 2 SAYS NO OPEN POSITIONS over the three rows nobody bought", () => {
  const md = buildReportMd(reportCtx(NOT_TAKEN_3), null, null);
  const sec2 = md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7"));
  has(sec2, "No open positions.");
  hasNot(sec2, "SOYB");
  hasNot(sec2, "Across everything");
  hasNot(sec2, "$1,04");
});

check("A FILLED POSITION IS STILL REPORTED, and at the size the record holds", () => {
  const owned = [{ ...NOT_TAKEN_3[0], contracts: 10, alpacaStatus: "filled", alpacaFilled: true }];
  const md = buildReportMd(reportCtx(owned), null, null);
  const sec2 = md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7"));
  has(sec2, "SOYB");
  has(sec2, "\u00d710 on this position");
  // $450 a combination \u00d7 10 = $4,500, the figure the risk gate measures.
  has(sec2, "$4500 at risk");
  has(sec2, "up to $5500 to be made");
});

check("one combination prints no size, because there is nothing to disambiguate", () => {
  const owned = [{ ...NOT_TAKEN_3[0], contracts: 1, alpacaStatus: "filled", alpacaFilled: true }];
  const sec2 = (() => { const md = buildReportMd(reportCtx(owned), null, null);
    return md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7")); })();
  hasNot(sec2, "on this position");
  has(sec2, "$450 at risk");
});

check("a WORKING order is in the report, because it can still fill", () => {
  const working = [{ ...NOT_TAKEN_3[0], alpacaStatus: "new", alpacaFilled: false }];
  eq(bookPositions(working).length, 1);
  const md = buildReportMd(reportCtx(working), null, null);
  has(md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7")), "SOYB");
});

/* ==================================================================
   P9 TASK 2 — SENT IS NOT FILLED, IN THE REPORT TOO

   `bookPositions()` is owned PLUS working, because the exposure ceiling
   limits what may be COMMITTED. That is right about the MONEY and was
   wrong about the WORDS: section 2 listed the whole book under one
   heading and wrote "opened at" against every row.
================================================================== */

check("TASK 2 — a working order is \"sent, not filled\", never \"opened at\"", () => {
  const working = [{ ...NOT_TAKEN_3[0], alpacaStatus: "new", alpacaFilled: false }];
  const md = buildReportMd(reportCtx(working), null, null);
  const sec2 = md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7"));
  has(sec2, "Sent, not filled (1)");
  has(sec2, "not filled");
  hasNot(sec2, "opened at");
  // IT IS LISTED APART, and the heading above it is honest about the book.
  has(sec2, "No open positions.");
  // ...AND IT IS STILL COUNTED IN THE EXPOSURE, exactly as the gate counts it.
  has(sec2, "$450 at risk");
  has(sec2, "money committed");
});

check("TASK 2 — a filled position and a working order are listed apart, both counted", () => {
  const mixed = [
    { ...NOT_TAKEN_3[0], contracts: 1, alpacaStatus: "filled", alpacaFilled: true },
    { ...NOT_TAKEN_3[1], contracts: 1, alpacaStatus: "new", alpacaFilled: false },
  ];
  const md = buildReportMd(reportCtx(mixed), null, null);
  const sec2 = md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7"));
  hasNot(sec2, "No open positions.");
  // The filled one keeps "opened at"; the working one is under its own heading.
  has(sec2, "SOYB");
  has(sec2, "opened at");
  has(sec2, "Sent, not filled (1)");
  has(sec2, "BOIL");
  // 450 + 577, the same total `bookPositions()` hands the gate.
  has(sec2, "$1027 at risk");
});

check("A MISSING CEILING STILL CANNOT BE ADDED TO A TOTAL, at any size", () => {
  const owned = [{ ...NOT_TAKEN_3[0], contracts: 4, maxProfit: null, alpacaStatus: "filled", alpacaFilled: true }];
  const md = buildReportMd(reportCtx(owned), null, null);
  const sec2 = md.slice(md.indexOf("## 2 \u00b7"), md.indexOf("## 3 \u00b7"));
  has(sec2, NO_CEILING);
  has(sec2, "$1800 at risk");
  has(sec2, "up to $0 to be made");
  has(sec2, "which cannot be added to a total");
});

check("offBoardStrikeLabel() names the strike and nothing else", () => {
  eq(offBoardStrikeLabel(27.5), "27.5 \u00b7 not on this board");
  eq(offBoardStrikeLabel(16), "16 \u00b7 not on this board");
});

check("checkedAgainstNote() distinguishes the two books in words", () => {
  const a = checkedAgainstNote(true, "account number PA3XYZ01 (Alpaca paper accounts start with PA)");
  const b = checkedAgainstNote(false, null);
  has(a, "PA3XYZ01");
  hasNot(b, "Alpaca");
  if (a === b) throw new Error("one sentence for two different accounts");
});

/* ==================================================================
   THE CARD READS THE FIGURE THE TICKET WILL SEND — SOYB, 21 Sep 2026

   >>> THE LIVE READING. <<< The trade card said "Inside your rules: risking
   $44 of $1,000". The owner then moved the ticket's sliders to the ask and
   sent a DAY limit of $60 — the combo ask, on a book quoting bid $4 / mid $28
   / ask $60, model $35.

   The two figures come from ONE expression and always did: `AE` on the Build
   screen is `analyze()` at `effectiveLimit()`'s net, and the gate, the card
   and the ticket are all handed it. What was missing is that the card never
   NAMED the price it had read, and the order sheet holding the sliders covers
   the card while they are moved — so a figure read at one price and an order
   sent at another were indistinguishable from two screens disagreeing.

   This runs the whole chain at BOTH prices, through the real functions, and
   holds the three numbers equal at each of them.
================================================================== */

const SOYB_SPOT = 27.64;
const SOYB_DTE = 60;
const SOYB_IV = 0.20;
const SOYB_LEGS = [
  { side: 1, qty: 1, type: "call", strike: 28 },
  { side: -1, qty: 1, type: "call", strike: 29 },
];
/* Per-leg quotes whose combination is the book the owner read:
   ask = 0.70 - 0.10 = 0.60, bid = 0.34 - 0.30 = 0.04, mid = 0.52 - 0.20 = 0.32. */
const SOYB_QUOTES = [
  { bid: 0.34, ask: 0.70, mid: 0.52, bidSize: 20, askSize: 15, occ: "SOYB261120C00028000" },
  { bid: 0.10, ask: 0.30, mid: 0.20, bidSize: 12, askSize: 9, occ: "SOYB261120C00029000" },
];
const SOYB_CAPITAL = { tradingCapital: 20000, concurrentTarget: 4 };

/** The Build screen's chain, end to end, for one set of per-leg prices. */
const buildAt = (legPx) => {
  const book = comboBook(SOYB_LEGS, SOYB_QUOTES);
  const net = netFromLegs(SOYB_LEGS, legPx).net;
  const eff = effectiveLimit(net == null ? null : Math.abs(net), book, 1);
  const AE = analyze(SOYB_LEGS, SOYB_SPOT, SOYB_DTE, SOYB_IV, (l) => SOYB_QUOTES[SOYB_LEGS.indexOf(l)],
    Number.isFinite(eff.net) ? { net: eff.net } : {});
  const gate = evaluateTrade({
    proposal: { ticker: "SOYB", intent: "open", legs: SOYB_LEGS, dte: SOYB_DTE, contracts: 1,
      maxLoss: AE.maxLoss, maxProfit: AE.maxProfit, net: AE.entry,
      quotes: SOYB_QUOTES, occs: SOYB_QUOTES.map((x) => x.occ) },
    portfolio: { positions: [], account: { paperVerified: true, note: "the app's own paper book" } },
    capital: SOYB_CAPITAL, signals: null,
  });
  const card = tradeCard({
    ticker: "SOYB", name: "Bull Call Spread", dir: 1, spot: SOYB_SPOT, expKey: "2026-11-20", dte: SOYB_DTE,
    maxLoss: AE.maxLoss, maxProfit: AE.maxProfit, breakevens: AE.breakevens,
    profitUnbounded: AE.profitUnbounded, contracts: 1, limits: gate.limits,
    entry: AE.entry, entrySource: AE.entrySource,
  });
  const html = renderToStaticMarkup(
    <OrderTicket
      legs={SOYB_LEGS} expKey="2026-11-20" ticker="SOYB"
      quoteFn={() => null} estNet={AE.entry} setMsg={() => {}}
      gate={() => ({ pass: true, violations: [], warnings: [] })}
      dte={SOYB_DTE} maxLoss={AE.maxLoss} maxProfit={AE.maxProfit} spot={SOYB_SPOT}
      cfg={{ type: "limit", tif: "day" }} onCfg={() => {}}
      quotes={SOYB_QUOTES} legPrices={legPx} net={net}
      verdict={orderVerdict(Math.abs(net), book, { sign: 1, tif: "day" })}
      effective={eff} seed={legPx} limits={gate.limits} feed="Alpaca (indicative)" />);
  return { book, net, eff, AE, gate, card, html,
    riskLine: card.lines.find((l) => l.id === "risk").text };
};

check("the card, the gate and the ticket read ONE figure — at the seed and at the ask", () => {
  const seed = legLimitSeed(SOYB_LEGS, SOYB_QUOTES);
  const atSeed = buildAt(seed);
  // The seed concedes a quarter of the combination's spread and no more.
  near(atSeed.eff.effective, openLimitPrice({ netMid: atSeed.book.mid, spread: atSeed.book.spread }).limit, 0.011,
    "the seed is mid plus a quarter of the spread");
  // ...and the ask, which is where the owner dragged them: long lifted, short hit.
  const atAsk = buildAt([SOYB_QUOTES[0].ask, SOYB_QUOTES[1].bid]);
  near(atAsk.eff.effective, 0.60, 1e-9, "dragging to the side that trades IS the combo ask");

  for (const [what, r] of [["at the seed", atSeed], ["at the ask", atAsk]]) {
    const sent = Math.abs(r.eff.net) * 100;               // what `orderBody()` carries
    near(Math.abs(r.AE.maxLoss), sent, 0.51, `${what}: the analysis risks the money the order sends`);
    near(r.gate.limits.tradeRisk, sent, 0.51, `${what}: the gate measures that same money`);
    has(r.riskLine, money(r.gate.limits.tradeRisk));      // the card prints the gate's own figure
    has(r.html, money(r.gate.limits.tradeRisk));          // ...and so does the ticket, beside the button
  }
  // The two prices really are different trades: $44-ish against $60.
  if (Math.abs(atSeed.gate.limits.tradeRisk - atAsk.gate.limits.tradeRisk) < 10) {
    throw new Error("the fixture does not move the price, so it proves nothing");
  }
  hasNot(atSeed.riskLine, money(atAsk.gate.limits.tradeRisk));
});

check("the card NAMES the price its figure was worked out at, and which price it is", () => {
  const atAsk = buildAt([SOYB_QUOTES[0].ask, SOYB_QUOTES[1].bid]);
  has(atAsk.riskLine, "$60");
  has(atAsk.riskLine, "debit the ticket is holding");
  // With no readable ticket price the analysis falls back to the mid, and the
  // card has to say THAT rather than claiming a limit nobody typed.
  const atMid = buildAt([null, null]);
  eq(atMid.AE.entrySource, "mid", "an unpriced leg leaves the analysis at the mid");
  has(atMid.riskLine, "the middle of the market");
  hasNot(atMid.riskLine, "the ticket is holding");
});

check("the per-trade limit is printed where the SEND is, not only on the card it covers", () => {
  const atAsk = buildAt([SOYB_QUOTES[0].ask, SOYB_QUOTES[1].bid]);
  has(atAsk.html, "MOST YOU CAN LOSE");
  has(atAsk.html, `of ${money(1000)} allowed`);
  // The old note repeated its own label back and said nothing.
  hasNot(atAsk.html, "the most you can lose");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
