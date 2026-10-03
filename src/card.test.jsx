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
import { CandidateCard, MatchList, RequestControls, MissLine, CardGrid, SignalBadge, badgeText, NumbersFit, MarketPicker, ResultsFilter } from "./card.jsx";
import { readFileSync } from "node:fs";
import { requestOf, RULES, fillNet, comboBook, openLimitPrice, rewardRisk, onTick, sizeLine, candidateFlags,
  sizedFigures, directionTag, controlReadings, futureFigures, pastFigures } from "./rules.js";
import { T } from "./theme.js";
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

/* A figure set as the list prints it: the analysis shape `sizedFigures()` reads, and a contract count. */
const A80 = { maxLoss: -80, maxProfit: 120, profitUnbounded: false };
const PIC = { bands: BANDS, legs: LEGS, entryNet: 0.8, spot: 28.6, bars: [], dte: 45, sigma: 0.3, driftAnnual: 0.02, ticker: "SOYB" };

check("ZERO PROSE — no text node on a card runs past six words", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C / −1 30C" direction="↑ bull · signals"
      rr={1.5} pop={0.62} figures={sizedFigures(A80, 3)} sizeText={sizeLine({ ok: true, n: 3, risk: 80 })} picture={PIC} />);
  // The size line is the third long thing: "3 contracts × $80 at risk each" is the owner's own line, and it is a
  // product written out — labels and numbers, not a sentence (PR #45).
  const EXEMPT = new Set(["Bull Call Spread", "+1 28C / −1 30C", "3 contracts × $80 at risk each"]);
  for (const t of textNodes(html)) {
    if (EXEMPT.has(t)) continue;
    if (wordsIn(t) > 6) {
      throw new Error(`"${t}" is ${wordsIn(t)} words — a card carries labels and numbers, not sentences`);
    }
  }
});

check("FOUR FIGURES, ALWAYS THE SAME FOUR, ALWAYS IN THE SAME ORDER, FOR THE SIZE THE BUDGET BUYS", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C" rr={1.5} pop={0.62}
      figures={sizedFigures(A80, 3)} sizeText={sizeLine({ ok: true, n: 3, risk: 80 })} picture={PIC} />);
  // The labels are matched as WHOLE text nodes: "RISK" is a substring of "RETURN ON RISK" and "YOU RISK".
  const ORDER = [">YOU RISK<", ">MAX PROFIT<", ">CHANCE<", ">RETURN ON RISK<"];
  for (const k of ORDER) has(html, k);
  // ...in that order, because a figure that moves places is a figure nobody can compare.
  const at = ORDER.map((k) => html.indexOf(k));
  for (let i = 1; i < at.length; i++) {
    if (!(at[i] > at[i - 1])) throw new Error("the four figures are not in their fixed order");
  }
  // THE VALUES ARE THE WHOLE POSITION'S: 3 × $80 at risk, 3 × $120 at most, and the ratio does not move with size.
  has(html, "$240"); has(html, "$360"); has(html, "62%"); has(html, "150%");
  // THE UNIT IS SAID ONCE ABOVE THEM, AND THE ARITHMETIC UNDER THEM.
  has(html, "FOR 3 CONTRACTS");
  has(html, "3 contracts × $80 at risk each");
  // THE PER-CONTRACT FIGURES ARE BEHIND THE FOLD: its summary is on the card, its children are not until it is tapped.
  has(html, "Per contract");
  if (html.includes("RISK, ONE CONTRACT")) throw new Error("the per-contract figures are on the card, not behind its fold");
});

check("A CARD WITH NO SIZE SAYS PER CONTRACT, AND HAS NO FOLD TO SAY IT AGAIN", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C" rr={1.5} pop={0.62} figures={sizedFigures(A80, null)} />);
  has(html, "PER CONTRACT"); has(html, "$80"); has(html, "$120");
  if (html.includes("FOR ")) throw new Error("a card with no size claims one");
  // (The two ⓘ in the FUTURE and PAST tiles carry aria-expanded since PR #49; the fold is what must be absent.)
  if (html.includes("figures ▼") || html.includes("more ▼")) throw new Error("there is nothing per-contract to fold away");
});

check("THE NAME AND THE LEGS ARE THE ONLY LONG THINGS, AND THEY ARE ON IT", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bullish Call Butterfly" legs="+1 21C / −2 22.5C / +1 24C" rr={2} pop={0.3}
      figures={sizedFigures({ maxLoss: -100, maxProfit: 200 }, 1)} />);
  has(html, "Bullish Call Butterfly");
  has(html, "22.5C");
});

check("UNKNOWN IS A DASH, NEVER A CONFIDENT ZERO", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Long Call" legs="+1 28C" rr={null} pop={null}
      figures={sizedFigures({ maxLoss: -80, maxProfit: null, profitUnbounded: true }, 2)} />);
  // A missing reward-to-risk and a missing chance both print a dash.
  if (html.includes(">0%<")) throw new Error("a missing chance printed as 0%");
  has(html, "—");
  // ...and no ceiling is said in words, from its one home — and NOT multiplied: n × "no ceiling" is not a number.
  has(html, "no ceiling");
  has(html, "$160");
  const none = renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={null} pop={null} figures={sizedFigures({ maxLoss: null, maxProfit: null }, 2)} />);
  if (none.includes(">$0<")) throw new Error("an unreadable risk printed as $0");
});

check("THE PICTURE ROW IS THE GAUGE BESIDE THE UNIFIED PICTURE, AND THE BAND THUMBNAIL IS GONE (PR #45, TASK 4)", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C / −1 30C" rr={1.5} pop={0.62} figures={sizedFigures(A80, 3)} picture={PIC} />);
  if ((html.match(/<svg/g) || []).length < 2) throw new Error("the gauge and the unified picture are two drawings");
  has(html, "Open the full picture for SOYB");
  has(html, 'aria-expanded="false"');
  const src = readFileSync("src/card.jsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  if (/BandThumbnail/.test(src)) throw new Error("the card still draws the band thumbnail: the unified picture contains it");
  // A card with nothing to draw (no bands) draws nothing rather than an empty frame.
  const bare = renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} figures={sizedFigures(A80, 1)} picture={{ ...PIC, bands: null }} />);
  if (bare.includes("Open the full picture")) throw new Error("an empty picture frame");
});

check("A CARD SAYS WHICH FAMILY IT CAME FROM UNDER 'SIGNALS DECIDE' (PR #48, TASK 3)", () => {
  const SENT = [{ id: "bull", label: "Bull", icon: "↑" }, { id: "bear", label: "Bear", icon: "↓" }, { id: "neutral", label: "Neutral", icon: "→" }];
  if (directionTag("bull", SENT) !== "↑ bull · signals") throw new Error(directionTag("bull", SENT));
  if (directionTag("bear", SENT) !== "↓ bear · signals") throw new Error(directionTag("bear", SENT));
  if (directionTag("neutral", SENT) !== "→ neutral") throw new Error(directionTag("neutral", SENT));
  if (directionTag("sideways", SENT) !== null) throw new Error("an unknown direction was named");
  has(renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} figures={sizedFigures(A80, 1)} direction="↑ bull · signals" />), "↑ bull · signals");
  if (renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} figures={sizedFigures(A80, 1)} />).includes("signals")) {
    throw new Error("a card the owner chose the direction for says the signals did");
  }
});

check("A ROW AMONG THE MISSES CARRIES ITS REASON, AND IT IS ONE LINE", () => {
  const html = renderToStaticMarkup(
    <MissLine misses={[{ id: "budget", short: "over budget by $40", text: "long form" }]} />);
  has(html, "over budget by $40");
  if (html.includes("long form")) throw new Error("the card prints the phrase, not the paragraph");
});

/* ---- THE LIST (PR #49, TASK 1): ONE list in the caller's order; a miss stays in place, quieter, with its reason ---- */
const ROWS = [
  { key: "b", name: "B", ticker: "BBB", pop: 0.2, rr: 1.5, maxProfit: 300, maxLoss: -80, entryNet: 0.8 },
  { key: "a", name: "A", ticker: "AAA", pop: 0.7, rr: 1.5, maxProfit: 120, maxLoss: -80, entryNet: 0.8 },
];
const sizer = () => ({ ok: true, n: 1, unit: 80, risk: 80, isCredit: false, totProfit: 120 });
const renderRow = (c, misses) => (
  <CandidateCard key={c.key} name={c.name} legs="+1 28C" misses={misses} rr={c.rr} pop={c.pop} figures={sizedFigures(A80, 1)} />);

check("ONE LIST: a card that misses stays IN PLACE, in the order given, quieter, with its reason at the top", () => {
  const req = requestOf({ amt: 500, minChance: 0.5 }, {});
  const html = renderToStaticMarkup(<MatchList items={ROWS} request={req} sizeOf={sizer} renderItem={renderRow} onHideMisses={() => {}} />);
  has(html, "1 card matches what you asked · 1 shown as a miss");
  has(html, ">A<"); has(html, ">B<");
  if (!(html.indexOf(">B<") < html.indexOf(">A<"))) throw new Error("the miss was moved below the match: the order is the caller's");
  has(html, "chance 20% under the 50% asked");
  // The reason is the first thing on B's card, and B is marked a miss and drawn in the muted tone.
  const b = html.slice(html.lastIndexOf("<article", html.indexOf('aria-label="B"')), html.lastIndexOf("<article", html.indexOf('aria-label="A"')));
  has(b, 'data-miss="true"');
  if (!(b.indexOf("chance 20% under") < b.indexOf(">B<"))) throw new Error("the reason is not at the top of the card");
  has(b, `color:${T.mut}`);
  if (html.includes("show 1 that") || html.includes("hide the")) throw new Error("the old count-button is back");
  has(html, "Hide cards that miss");
});

check("…'HIDE CARDS THAT MISS' GIVES THE OLD VIEW, AND THE LINE SAYS HOW MANY ARE HIDDEN", () => {
  const req = requestOf({ amt: 500, minChance: 0.5 }, {});
  const html = renderToStaticMarkup(<MatchList items={ROWS} request={req} sizeOf={sizer} renderItem={renderRow} hideMisses onHideMisses={() => {}} />);
  has(html, "1 card matches what you asked · 1 hidden");
  has(html, ">A<");
  if (html.includes(">B<")) throw new Error("a hidden miss is on screen");
});

check("EVERYTHING MATCHING: the line is the count alone, and there is no toggle to hide nothing", () => {
  const req = requestOf({ amt: 500 }, {});
  const html = renderToStaticMarkup(<MatchList items={ROWS} request={req} sizeOf={sizer} renderItem={renderRow} onHideMisses={() => {}} />);
  has(html, "2 cards match what you asked");
  if (html.includes("Hide cards that miss")) throw new Error("a toggle with nothing behind it");
});

check("ZERO MATCHES NAMES THE CONTROL THAT BINDS AND THE NEAREST VALUE THAT LETS ONE IN", () => {
  const req = requestOf({ amt: 500, minChance: 0.8 }, {});
  const html = renderToStaticMarkup(<MatchList items={ROWS} request={req} sizeOf={sizer} renderItem={renderRow} />);
  has(html, "0 cards match what you asked · 2 shown as misses");
  has(html, "Lower chance to 70% → 1 match: AAA");
});

check("SIX TILES IN A FIXED ORDER (PR #49): the four, then FUTURE (MONTE CARLO) and PAST YRS (BACKTEST)", () => {
  const future = futureFigures({ ev: -2.88 }, A80, 3, "2026-10-30");
  const bt = { wins: 9, n: 14, winRate: 9 / 14, avg: 103.4, span: 2, month: 9, excludedYear: 2026 };
  const html = renderToStaticMarkup(
    <CandidateCard name="Bull Call Spread" legs="+1 28C" rr={1.5} pop={0.62} figures={sizedFigures(A80, 3)}
      future={future} past={pastFigures(bt, A80, 3)} ticker="CORN" />);
  const ORDER = [">YOU RISK<", ">MAX PROFIT<", ">CHANCE<", ">RETURN ON RISK<", ">FUTURE (MONTE CARLO)<", ">PAST YRS (BACKTEST)<"];
  const at = ORDER.map((k) => html.indexOf(k));
  if (at.some((x) => x < 0)) throw new Error(`a tile is missing: ${ORDER.filter((k, i) => at[i] < 0)}`);
  for (let i = 1; i < at.length; i++) if (!(at[i] > at[i - 1])) throw new Error("the six tiles are not in their fixed order");
  // FUTURE: the value for the size (3 × −$2.88 = −$9), then per $100 at risk (−2.88 / 80 × 100 = −3.6), then to the expiry.
  has(html, "-$9"); has(html, "−3.6 per $100 at risk"); has(html, "to 30 Oct 2026");
  // PAST: won 9 of 14 · avg for the size (3 × $103.4 = +$310).
  has(html, "won 9 of 14 · avg +$310");
  // Each new tile has its ⓘ, icon only: the tile's name is the label.
  has(html, 'aria-label="About future (monte carlo)"'); has(html, 'aria-label="About past yrs (backtest)"');
  const none = renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} figures={sizedFigures(A80, 1)} />);
  has(none, "not read");
});

check("THE ORDER IS VISIBLE AT REST: the sorted-by tile is ringed and labelled, and '+ signal' says its sum", () => {
  const html = renderToStaticMarkup(
    <CandidateCard name="X" legs="x" rr={1.5} pop={0.62} figures={sizedFigures(A80, 1)} sortedBy="chance" />);
  const ringed = [...html.matchAll(/data-tile="([^"]+)" data-sorted="true"/g)].map((m) => m[1]);
  if (ringed.join() !== "CHANCE") throw new Error(`ringed: ${ringed}`);
  has(html, ">sorted by<"); has(html, `outline:2px solid ${T.blue}`);
  const sig = renderToStaticMarkup(
    <CandidateCard name="X" legs="x" rr={1.5} pop={0.62} figures={sizedFigures(A80, 1)} sortedBy="future"
      placeAtRest="sorted by −3.6 + signal +27.5 = 23.9 per $100" />);
  has(sig, "sorted by −3.6 + signal +27.5 = 23.9 per $100");
  if (sig.includes("Why this place")) throw new Error("the place line is still in the fold");
});

check("THE PRICE NOTE IS OPT-IN, because a mid-priced row may not claim otherwise", () => {
  const req = requestOf({ amt: 500 }, {});
  const off = renderToStaticMarkup(<MatchList items={[]} request={req} renderItem={() => null} />);
  if (off.includes("price that fills")) throw new Error("a list claimed a price nobody asked it to read");
  const on = renderToStaticMarkup(<MatchList items={[]} request={req} priceNote renderItem={() => null} />);
  has(on, "price that fills");
});

check("CARDS LIE IN A GRID: ONE COLUMN ON A PHONE, AS MANY ~340px COLUMNS AS A DESKTOP HOLDS (PR #45, TASK 4)", () => {
  const html = renderToStaticMarkup(<CardGrid><i /></CardGrid>);
  has(html, "repeat(auto-fill, minmax(min(100%, 340px), 1fr))");
});

check("THE PRICE THAT FILLS IS openLimitPrice() ON comboBook(), AND NOTHING ELSE", () => {
  const book = comboBook(LEGS, QUOTES);
  const expected = openLimitPrice({ netMid: book.mid, spread: book.spread }).net;
  if (fillNet(LEGS, QUOTES) !== onTick(expected)) throw new Error("fillNet() is a second arithmetic");
  // NO BOOK IS NO PRICE, never a price of zero.
  if (fillNet(LEGS, [{ bid: 1.0, ask: 1.2 }, {}]) !== null) throw new Error("an unquoted leg produced a price");
});

/* ---- THE CONTROLS: one style, a slider each (PR #45, TASK 2) ---- */
const LIMITS = { perTradeLimit: 400, cappedPerTrade: 400, tradingCapital: 8000, answered: true };
const SENTS = [{ id: "bull", label: "Bull", color: "#0a0", icon: "↑", tgt: 0.04 }];

check("THE CONTROLS BLOCK IS ONE REQUEST, AND ITS EXPLANATION FOLDS", () => {
  const req = requestOf({ amt: 300 }, LIMITS);
  const html = renderToStaticMarkup(
    <RequestControls request={req} onChange={() => {}} limits={LIMITS} onLimit={() => {}}
      sentiments={SENTS} direction="bull" ticker="SOYB" spot={27.5}
      universe={["SOYB", "GLD"]} markets={["SOYB"]} onMarkets={() => {}}
      horizon={45} onHorizon={() => {}} />);
  for (const k of ["MARKETS · 1 OF 2", "DIRECTION", "Signals decide", "TARGET PRICE", "SIZE BY",
    "Most I will risk", "Chance at least", "Return on risk at least", "Horizon"]) has(html, k);
  has(html, "$28.60");            // the direction read as a price, with one market and one direction
  if (html.includes("Search")) throw new Error("there is no Search button: the list re-filters live");
  if (html.includes("They do NOT create a structure")) {
    throw new Error("the controls block explains itself in a paragraph; it must fold");
  }
});

check("ONE STYLE: FOUR SLIDERS, NO NUMBER BOX AND NO RISK CHIPS, EACH 44px AND SAYING ITS VALUE", () => {
  const req = requestOf({ amt: 300 }, LIMITS);
  const html = renderToStaticMarkup(<RequestControls request={req} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  const sliders = html.match(/<input[^>]*type="range"[^>]*>/g) || [];
  if (sliders.length !== 4) throw new Error(`${sliders.length} sliders: amount, chance, return, horizon`);
  for (const sl of sliders) {
    if (!/aria-valuetext="[^"]+"/.test(sl)) throw new Error(`no aria-valuetext on ${sl}`);
    if (!/height:44px/.test(sl)) throw new Error("a slider smaller than a thumb");
  }
  if (/<input[^>]*type="number"/.test(html)) throw new Error("the amount is still a number box");
  if (/risk \$|make \$/.test(html)) throw new Error("the quick-amount chips are back");
  // SIZE BY stays as two chips.
  has(html, "What I can spend"); has(html, "What I want to make");
});

check("THE AMOUNT SLIDER'S TOP IS THE PER-TRADE LIMIT, WITH 'limit $X · edit' BESIDE IT", () => {
  const req = requestOf({ amt: 300 }, LIMITS);
  const html = renderToStaticMarkup(<RequestControls only={["size"]} request={req} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  has(html, 'max="400"'); has(html, `min="${RULES.amountAskStep}"`); has(html, `step="${RULES.amountAskStep}"`);
  has(html, "limit"); has(html, "$400"); has(html, ">edit<");
  // A typed amount past the limit is held at it, and the screen says so.
  const over = requestOf({ amt: 9000 }, LIMITS);
  const h2 = renderToStaticMarkup(<RequestControls only={["size"]} request={over} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  has(h2, "held at the per-trade limit of $400");
  has(h2, 'value="400"');
  // UNDER FREE SIZING THE TOP IS THE TRADING CAPITAL AND NO LIMIT IS APPLIED.
  const free = requestOf({ amt: 9000 }, LIMITS, { sizingFree: true });
  const h3 = renderToStaticMarkup(<RequestControls only={["size"]} request={free} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  has(h3, 'max="8000"'); has(h3, "no limit applied");
  if (h3.includes(">edit<")) throw new Error("free sizing has no limit to edit");
});

check("TARGET MODE RELABELS THE AMOUNT (PR #40)", () => {
  const budget = renderToStaticMarkup(<RequestControls only={["size"]} request={requestOf({ amt: 200 }, LIMITS)} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  has(budget, "Most I will risk");
  const target = renderToStaticMarkup(<RequestControls only={["size"]} request={requestOf({ mode: "target", amt: 200 }, LIMITS)} onChange={() => {}} limits={LIMITS} onLimit={() => {}} />);
  has(target, "Profit I am aiming for");
  if (target.includes("Most I will risk")) throw new Error("the label did not change");
});

check("EACH SLIDER READS ITS BAND AND ITS STEP FROM RULES; THE RETURN ONE NEVER GOES UNDER THE REWARD FLOOR", () => {
  const html = renderToStaticMarkup(
    <RequestControls only={["chance", "return"]} request={requestOf({ minChance: 0.6, minReturn: 1 }, {})} onChange={() => {}} />);
  has(html, `min="${RULES.chanceAskMin}"`); has(html, `max="${RULES.chanceAskMax}"`); has(html, `step="${RULES.chanceAskStep}"`);
  has(html, `min="${RULES.minRewardRisk}"`); has(html, `max="${RULES.rewardAskMax}"`); has(html, `step="${RULES.rewardAskStep}"`);
  has(html, "60%"); has(html, "100%");
  // Asking for nothing extra sits AT the floor, never under it.
  const floor = requestOf({}, {});
  if (floor.minReturn !== RULES.minRewardRisk) throw new Error("the default return is not the floor");
  if (requestOf({ minReturn: 0.01 }, {}).minReturn !== RULES.minRewardRisk) throw new Error("the slider can loosen the floor");
  if (requestOf({ minReturn: 99 }, {}).minReturn !== RULES.rewardAskMax) throw new Error("the slider passes its top");
});

check("EACH SLIDER SHOWS A HISTOGRAM OF THE CANDIDATES AND HOW MANY PASS (PR #45, TASK 2)", () => {
  const req = requestOf({ amt: 500, minChance: 0.5 }, {});
  const readings = controlReadings(ROWS, req, sizer);
  const html = renderToStaticMarkup(<RequestControls only={["chance"]} request={req} onChange={() => {}} readings={readings} />);
  has(html, "1</span> pass");
  if (!html.includes('aria-hidden="true"')) throw new Error("no histogram drawn");
  const bare = renderToStaticMarkup(<RequestControls only={["chance"]} request={req} onChange={() => {}} />);
  if (bare.includes(" pass")) throw new Error("a count with nothing to count");
});

check("WHAT THE GUIDED DOOR DROPPED IS A VISIBLE STATE ON THE CARD (PR #40)", () => {
  const flags = candidateFlags({ legs: [{ side: 1, qty: 1, type: "call", strike: 28 }],
    fused: { agreement: "CONFLICT", confidence: 21 } });
  const ids = flags.map((f) => f.id);
  for (const id of ["single", "conflict", "confidence"]) if (!ids.includes(id)) throw new Error(`${id} not flagged`);
  const html = renderToStaticMarkup(<CandidateCard name="X" legs="+1 28C" rr={1} pop={0.5} figures={sizedFigures(A80, 1)} flags={flags} />);
  has(html, "single option"); has(html, "CONFLICT"); has(html, `confidence under ${RULES.lowConfidence}`);
});

check("THE BADGE READS '<TK> ↑ +64 · conf 86'; reading reads '<TK> reading…' (PR #48)", () => {
  const corn = { ticker: "CORN", score: 64, confidence: 86, agreement: "CONFLUENT" };
  if (badgeText(corn) !== "CORN ↑ +64 · conf 86") throw new Error(badgeText(corn));
  if (badgeText({ ...corn, score: -20, agreement: "MIXED" }) !== "CORN ↓ -20 · conf 86") throw new Error("down");
  if (badgeText({ ...corn, agreement: "CONFLICT" }) !== "CORN ● +64 · conf 86") throw new Error("conflict");
  has(renderToStaticMarkup(<SignalBadge fused={corn} />), "CORN ↑ +64 · conf 86");
  has(renderToStaticMarkup(<SignalBadge fused={null} ticker="XLE" state={{ reading: true, waiting: ["news"], failed: [] }} />), "XLE reading…");
});

check("WHY THIS PLACE sits in the card's fold, and the ⓘ 'How the numbers fit' is one tap (PR #48)", () => {
  const html = renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} figures={sizedFigures(A80, 2)} place="expected value −12.0 per $100 + signal +27.5 = 15.5" />);
  if (html.includes("Why this place")) throw new Error("a closed fold printed its line");
  has(html, "figures ▼");
  const info = renderToStaticMarkup(<NumbersFit order="ev" />);
  has(info, 'aria-label="About how the numbers fit"'); has(info, 'aria-expanded="false"');
  has(renderToStaticMarkup(<CandidateCard name="X" legs="x" rr={1} pop={0.5} basis="prices only" figures={sizedFigures(A80, 2)} />), "chance: prices only");
});

check("FIND BY CATEGORY: groups with 'N of M · all / none', and 'All N · Grains n · Energy n · Metals n' (PR #48)", () => {
  const html = renderToStaticMarkup(<MarketPicker universe={["CORN", "SOYB", "WEAT", "UNG", "GLD"]} markets={["CORN", "UNG"]} onMarkets={() => {}} />);
  has(html, "MARKETS · 2 OF 5"); has(html, "Grains"); has(html, "1 of 3 ·"); has(html, ">all<"); has(html, ">none<");
  has(html, "Energy"); has(html, "Metals"); has(html, "0 of 1 ·");
  const counts = [{ id: "Grains", n: 3, tickers: [{ tk: "CORN", n: 3 }, { tk: "SOYB", n: 0 }] }, { id: "Energy", n: 2, tickers: [{ tk: "UNG", n: 2 }] }];
  const rf = renderToStaticMarkup(<ResultsFilter counts={counts} total={5} cat={null} />);
  has(rf, "All 5"); has(rf, "Grains 3"); has(rf, "Energy 2");
  if (rf.includes("CORN")) throw new Error("a closed category showed its tickers");
  const open = renderToStaticMarkup(<ResultsFilter counts={counts} total={5} cat="Grains" statusOf={(tk) => (tk === "SOYB" ? "loading" : null)} />);
  has(open, "CORN</span> 3"); has(open, "SOYB</span> loading");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
