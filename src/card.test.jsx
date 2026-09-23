// ============================================================================
// src/card.test.jsx — THE ONE CANDIDATE CARD, AND THE RULE THAT MAKES IT ONE.
//
// ROADMAP P10 §3-bis, points 2-4. The owner sent two captures of a tool he
// finds clear and said "vedi com'e chiaro?". What makes those screens readable
// is not that they are pretty: it is that EVERY result is the same card, with
// the same four figures in the same four places, and NOT ONE SENTENCE on it.
//
// So the rule is falsifiable, and this is where it is falsified: no text node
// on a card may run past six words, except the structure's NAME and the LEGS
// line. Those two are the card's subject; everything else is a label and a
// number.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CandidateCard, SplitSections, RequestControls, MissLine } from "./card.jsx";
import { requestOf, RULES, fillNet, comboBook, openLimitPrice, rewardRisk, onTick, sizeLine, candidateFlags } from "./rules.js";
import { payoffBands } from "./visuals.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const has = (h, s) => { if (!h.includes(s)) throw new Error(`missing "${s}"`); };

const LEGS = [
  { side: 1, qty: 1, type: "call", strike: 28 },
  { side: -1, qty: 1, type: "call", strike: 30 },
];
const QUOTES = [{ bid: 1.0, ask: 1.2 }, { bid: 0.3, ask: 0.5 }];
const BANDS = payoffBands({ legs: LEGS, entryNet: 0.8, spot: 28.6 });

/** Every run of text the rendered card puts on screen, tag markup removed. */
function textNodes(html) {
  return html
    .replace(/<[^>]*>/g, "\u0001")
    .split("\u0001")
    .map((s) => s.replace(/&[a-z]+;/g, " ").trim())
    .filter(Boolean);
}
const wordsIn = (s) => s.split(/\s+/).filter(Boolean).length;

check("ZERO PROSE — no text node on a card runs past six words", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C / −1 30C"
      rr={1.5} pop={0.62} profit={120} risk={-80} bands={BANDS} ticker="SOYB" />);
  const EXEMPT = new Set(["Bull Call Spread", "+1 28C / −1 30C"]);
  for (const t of textNodes(html)) {
    if (EXEMPT.has(t)) continue;
    if (wordsIn(t) > 6) {
      throw new Error(`"${t}" is ${wordsIn(t)} words — a card carries labels and numbers, not sentences`);
    }
  }
});

check("FOUR FIGURES, ALWAYS THE SAME FOUR, ALWAYS IN THE SAME ORDER", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C" rr={1.5} pop={0.62}
      profit={120} risk={-80} bands={BANDS} ticker="SOYB" />);
  // The labels are matched as WHOLE text nodes: "RISK" is a substring of
  // "RETURN ON RISK", and a test that cannot tell them apart cannot see the
  // order it claims to be checking.
  for (const k of [">RETURN ON RISK<", ">CHANCE<", ">PROFIT<", ">RISK<"]) has(html, k);
  // ...in that order, because a figure that moves places is a figure nobody can compare.
  const at = [">RETURN ON RISK<", ">CHANCE<", ">PROFIT<", ">RISK<"].map((k) => html.indexOf(k));
  for (let i = 1; i < at.length; i++) {
    if (!(at[i] > at[i - 1])) throw new Error("the four figures are not in their fixed order");
  }
  // and the values themselves
  has(html, "150%"); has(html, "62%"); has(html, "$120"); has(html, "$80");
});

check("the name and the legs are the only long things, and they are on it", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bullish Call Butterfly" legs="+1 21C / −2 22.5C / +1 24C"
      rr={2} pop={0.3} profit={200} risk={-100} bands={BANDS} ticker="BOIL" />);
  has(html, "Bullish Call Butterfly");
  has(html, "22.5C");
});

check("UNKNOWN IS A DASH, NEVER A CONFIDENT ZERO", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Long Call" legs="+1 28C" rr={null} pop={null}
      profit={null} risk={-80} noCeiling bands={BANDS} ticker="SOYB" />);
  // A missing reward-to-risk and a missing chance both print a dash.
  if (html.includes(">0%<")) throw new Error("a missing chance printed as 0%");
  has(html, "—");
  // ...and no ceiling is said in words, from its one home.
  has(html, "no ceiling");
});

check("A ROW IN THE SECOND SECTION CARRIES ITS REASON, AND IT IS ONE LINE", () => {
  const html = renderToStaticMarkup(
    <MissLine misses={[{ id: "budget", short: "over budget by $40", text: "long form" }]} />);
  has(html, "over budget by $40");
  if (html.includes("long form")) throw new Error("the card prints the phrase, not the paragraph");
});

check("THE SECTIONS SPLIT, AND THE SECOND ONE IS NEVER FOLDED AWAY", () => {
  const rows = [
    { key: "a", name: "A", pop: 0.7, maxProfit: 120, maxLoss: -80, entryNet: 0.8 },
    { key: "b", name: "B", pop: 0.2, maxProfit: 300, maxLoss: -80, entryNet: 0.8 },
  ];
  const req = requestOf({ amt: 500, minChance: 0.5 }, {});
  const html = renderToStaticMarkup(
    <SplitSections items={rows} request={req}
      sizeOf={() => ({ ok: true, n: 1, unit: 80, isCredit: false, totProfit: 120 })}
      renderItem={(c, misses) => (
        <CandidateCard key={c.key} name={c.name} legs="+1 28C" misses={misses}
          rr={1} pop={c.pop} profit={c.maxProfit} risk={c.maxLoss} bands={BANDS} ticker="X" />
      )} />);
  has(html, "MEETS WHAT YOU ASKED FOR (1)");
  has(html, "ALSO FOUND, AND WHAT EACH ONE MISSED (1)");
  // BOTH rows are on the page: this groups, it does not remove.
  has(html, ">A<"); has(html, ">B<");
  has(html, "chance 20% under the 50% asked");
  // ...and the second section is not inside a fold's button.
  if (/<button[^>]*>[\s\S]{0,200}ALSO FOUND/.test(html)) {
    throw new Error("the second section is behind a tap; it must never be");
  }
});

check("THE PRICE NOTE IS OPT-IN, because a mid-priced row may not claim otherwise", () => {
  const req = requestOf({ amt: 500 }, {});
  const off = renderToStaticMarkup(
    <SplitSections items={[]} request={req} renderItem={() => null} />);
  if (off.includes("price that fills")) throw new Error("a section claimed a price nobody asked it to read");
  const on = renderToStaticMarkup(
    <SplitSections items={[]} request={req} priceNote renderItem={() => null} />);
  has(on, "price that fills");
});

check("THE PRICE THAT FILLS IS openLimitPrice() ON comboBook(), AND NOTHING ELSE", () => {
  const book = comboBook(LEGS, QUOTES);
  const expected = openLimitPrice({ netMid: book.mid, spread: book.spread }).net;
  if (fillNet(LEGS, QUOTES) !== onTick(expected)) throw new Error("fillNet() is a second arithmetic");
  // NO BOOK IS NO PRICE, never a price of zero.
  if (fillNet(LEGS, [{ bid: 1.0, ask: 1.2 }, {}]) !== null) throw new Error("an unquoted leg produced a price");
});

check("THE CONTROLS BLOCK IS ONE REQUEST, AND ITS EXPLANATION FOLDS (PR #40)", () => {
  const req = requestOf({ amt: 300 }, { perTradeLimit: 300 });
  const html = renderToStaticMarkup(
    <RequestControls request={req} onChange={() => {}}
      sentiments={[{ id: "bull", label: "Bull", color: "#0a0", icon: "↑", tgt: 0.04 }]}
      direction="bull" ticker="SOYB" spot={27.5}
      universe={["SOYB", "GLD"]} markets={["SOYB"]} onMarkets={() => {}}
      horizon={45} onHorizon={() => {}} />);
  for (const k of ["MARKETS · 1 OF 2", "DIRECTION", "Season decides", "TARGET PRICE", "SIZE BY", "HORIZON", "CHANCE OF PROFIT"]) has(html, k);
  has(html, "$28.60");            // the direction read as a price, with one market and one direction
  if (html.includes("Search")) throw new Error("there is no Search button: the list re-filters live");
  if (html.includes("They do NOT create a structure")) {
    throw new Error("the controls block explains itself in a paragraph; it must fold");
  }
  if (!html.includes("minHeight:38px") && !html.includes("min-height:38px")) {
    throw new Error("a control smaller than a thumb is not a control on a phone");
  }
});

check("TARGET MODE RELABELS THE AMOUNTS AND CHANGES EVERY CARD (PR #40)", () => {
  const limits = { perTradeLimit: 400, cappedPerTrade: 400 };
  const budget = renderToStaticMarkup(<RequestControls only={["size"]} request={requestOf({ amt: 200 }, limits)} onChange={() => {}} limits={limits} onLimit={() => {}} />);
  has(budget, "risk $100"); has(budget, "per-trade limit $400");
  const target = renderToStaticMarkup(<RequestControls only={["size"]} request={requestOf({ mode: "target", amt: 200 }, limits)} onChange={() => {}} limits={limits} onLimit={() => {}} />);
  has(target, "make $100");
  if (target.includes("risk $100")) throw new Error("the chips did not relabel");
  const size = { ok: true, n: 14, totProfit: 1932, totRisk: 868, isCredit: false };   // 14 × the card's $62 risk
  const card = renderToStaticMarkup(<CandidateCard name="X" legs="+1 28C" rr={1} pop={0.5} profit={138} risk={-62}
    size={sizeLine(requestOf({ mode: "target", amt: 1900 }, limits), size)} />);
  has(card, "14 contracts to reach $1,900");
  const cardB = renderToStaticMarkup(<CandidateCard name="X" legs="+1 28C" rr={1} pop={0.5} profit={138} risk={-62}
    size={sizeLine(requestOf({ amt: 900 }, limits), size)} />);
  has(cardB, "14 contracts for $868");
});

check("WHAT THE GUIDED DOOR DROPPED IS A VISIBLE STATE ON THE CARD (PR #40)", () => {
  const flags = candidateFlags({ legs: [{ side: 1, qty: 1, type: "call", strike: 28 }],
    fused: { agreement: "CONFLICT", confidence: 21 } });
  const ids = flags.map((f) => f.id);
  for (const id of ["single", "conflict", "confidence"]) if (!ids.includes(id)) throw new Error(`${id} not flagged`);
  const html = renderToStaticMarkup(<CandidateCard name="X" legs="+1 28C" rr={1} pop={0.5} profit={1} risk={-1} flags={flags} />);
  has(html, "single option"); has(html, "CONFLICT"); has(html, `confidence under ${RULES.lowConfidence}`);
});

check("THE SLIDER READS ITS BAND AND ITS STEP FROM RULES", () => {
  const req = requestOf({ minChance: 0.6 }, {});
  const html = renderToStaticMarkup(
    <RequestControls only={["chance"]} request={req} onChange={() => {}} />);
  has(html, `min="${RULES.chanceAskMin}"`);
  has(html, `max="${RULES.chanceAskMax}"`);
  has(html, `step="${RULES.chanceAskStep}"`);
  has(html, "60%");
  has(html, "pays more"); has(html, "works more often");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
