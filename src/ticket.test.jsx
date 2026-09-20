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
} from "./rules.js";
import { analyze, shortlistWithFloors } from "./App.jsx";
import { terminalDist, compareDistInputs, compareDistNote, ComparePayoffs } from "./visuals.jsx";
import { candidateOf } from "./path.js";
import { OrderTicket } from "./pro.jsx";

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
      legs={UNG_LEGS} expKey="2026-10-23" ticker="UNG" buildOcc={() => "UNG261023C00010500"}
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

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
