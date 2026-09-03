// Tests for the visual language (PRD §6). What is actually being held here:
//
//  · every zone comes from payoff() — the bands, the gauge arcs and the unified
//    component all read the SAME payoffBands() result, so two screens cannot
//    disagree about one trade;
//  · an iron condor produces three bands with no special-case code;
//  · the gauge colours come from the sign of the payoff, so a BEAR spread is
//    green on the LEFT — the one thing a "gauge" component usually gets wrong;
//  · every takeaway is ONE sentence, generated, and carries a number;
//  · the unified component switches the cone and the distribution off below the
//    width threshold and on above it.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  payoffBands, profitBands, gaugeArcs, unifiedLayout, UNIFIED_DETAIL_WIDTH,
  bandTakeaway, gaugeTakeaway, unifiedTakeaway, explainElement, chanceInProfit,
  BandThumbnail, Gauge, UnifiedPosition, exitPlanSentence, inTenPhrase,
  OpenInterestStrip, oiBarHeights, oiCutAt, oiStripTakeaway, explainOiStrip,
  oiGhostCut, isEmptyStrike, OI_EMPTY_BAR,
} from "./visuals.jsx";
import { payoff } from "./engine.js";
import { RULES, RECOMMENDED_LIQUIDITY, liquidityThreshold } from "./rules.js";
import { T } from "./theme.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); } };
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, sub) => { if (!String(s).includes(sub)) throw new Error(`missing ${JSON.stringify(sub)} in ${JSON.stringify(String(s).slice(0, 160))}`); };
const oneSentence = (s) => {
  // "One always-visible sentence": at most one full stop that is not part of a
  // number, and it is the last character.
  const t = String(s).trim();
  const stops = (t.replace(/\d\.\d/g, "00").match(/\.(?=\s|$)/g) || []).length;
  if (stops !== 1 || !t.endsWith(".")) throw new Error(`not one sentence: ${JSON.stringify(t)}`);
};

/* ---- the structures every test below uses ---- */
const SPOT = 100;
const bullCall = [{ side: 1, type: "call", strike: 100, qty: 1 }, { side: -1, type: "call", strike: 105, qty: 1 }];
const bearPut = [{ side: 1, type: "put", strike: 100, qty: 1 }, { side: -1, type: "put", strike: 95, qty: 1 }];
const ironCondor = [
  { side: 1, type: "put", strike: 90, qty: 1 }, { side: -1, type: "put", strike: 95, qty: 1 },
  { side: -1, type: "call", strike: 105, qty: 1 }, { side: 1, type: "call", strike: 110, qty: 1 },
];

check("bands are read off payoff() and nothing else", () => {
  const entry = 2;
  const b = payoffBands({ legs: bullCall, entryNet: entry, spot: SPOT });
  for (const s of [80, 97, 102.5, 108, 120]) {
    eq(Math.round(b.at(s)), Math.round((payoff(bullCall, s) - entry) * 100), `payoff at ${s}`);
  }
});

check("a vertical spread gives two bands, red then green", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  eq(b.bands.length, 2, "band count");
  eq(b.bands[0].sign, -1, "low side");
  eq(b.bands[1].sign, 1, "high side");
  eq(b.breakevens.length, 1, "breakevens");
  if (Math.abs(b.breakevens[0] - 102) > 0.2) throw new Error(`breakeven ${b.breakevens[0]} should be near 102`);
});

check("an iron condor gives three bands with no special-case code", () => {
  const b = payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT });
  eq(b.bands.length, 3, "band count");
  eq(b.bands.map((z) => z.sign).join(","), "-1,1,-1", "red / green / red");
  eq(profitBands(b).length, 1, "one profit band");
});

check("the gauge is green on the LEFT for a bear spread", () => {
  // The single thing this component must not get wrong: left is low price, not
  // "bad". Colours are the sign of the payoff, so a bear spread pays on the left.
  const bear = payoffBands({ legs: bearPut, entryNet: 2, spot: SPOT });
  const arcs = gaugeArcs(bear);
  const leftMost = arcs.reduce((a, x) => (x.from > a.from ? x : a), arcs[0]);   // 180° = lowest price
  const rightMost = arcs.reduce((a, x) => (x.to < a.to ? x : a), arcs[0]);      // 0°  = highest price
  eq(leftMost.sign, 1, "bear spread, low prices");
  eq(rightMost.sign, -1, "bear spread, high prices");
  // ...and the mirror image for a bull spread, from the same function.
  const bull = gaugeArcs(payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT }));
  eq(bull.reduce((a, x) => (x.from > a.from ? x : a), bull[0]).sign, -1, "bull spread, low prices");
  eq(bull.reduce((a, x) => (x.to < a.to ? x : a), bull[0]).sign, 1, "bull spread, high prices");
});

check("gauge arcs sweep the full semicircle in price order", () => {
  const arcs = gaugeArcs(payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT }));
  if (Math.abs(arcs[0].from - Math.PI) > 1e-9) throw new Error("does not start at 180°");
  if (Math.abs(arcs[arcs.length - 1].to) > 1e-9) throw new Error("does not end at 0°");
  for (const a of arcs) if (!(a.to < a.from)) throw new Error("an arc runs backwards");
});

check("every takeaway is one generated sentence carrying a number", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  for (const t of [
    bandTakeaway(b, { ticker: "CORN" }),
    gaugeTakeaway(b, { ticker: "CORN" }),
    unifiedTakeaway(b, { ticker: "CORN", sigma: 0.25, dte: 45 }),
  ]) {
    oneSentence(t);
    has(t, "CORN");
    if (!/\d/.test(t)) throw new Error(`no number in: ${t}`);
  }
});

check("the takeaway reads as a sentence about the market, not about 'it'", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  const t = bandTakeaway(b, { ticker: "BOIL" });
  if (/^BOIL it /.test(t)) throw new Error(`double subject: ${t}`);
  has(t, "BOIL makes money above");
  has(unifiedTakeaway(b, { ticker: "BOIL", sigma: 0.25, dte: 45 }), "BOIL is at $100.00 and makes money above");
});

check("a structure with no profitable price says so without contorting", () => {
  const hopeless = payoffBands({ legs: bullCall, entryNet: 9, spot: SPOT });
  eq(profitBands(hopeless).length, 0, "profit bands");
  const t = bandTakeaway(hopeless, { ticker: "CORN" });
  oneSentence(t);
  has(t, "no price at expiry pays this trade back");
  has(explainElement("green", hopeless, { ticker: "CORN" }), "There is no green here");
});

check("the takeaway states the conclusion, not the mechanism", () => {
  const b = payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT });
  const t = bandTakeaway(b, { ticker: "UNG" });
  has(t, "makes money between");
  has(t, "inside that today");   // spot 100 sits in the condor's green band
});

check("the gauge takeaway names the move needed when spot is in the red", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: 95 });
  const t = gaugeTakeaway(b, { ticker: "SOYB" });
  has(t, "loses");
  has(t, "break even");
  oneSentence(t);
});

check("an English verb carries the sign — never 'loses -$118'", () => {
  const losing = payoffBands({ legs: bullCall, entryNet: 2, spot: 95 });
  for (const t of [
    gaugeTakeaway(losing, { ticker: "BOIL" }),
    unifiedTakeaway(losing, { ticker: "BOIL", sigma: 0.3, dte: 45 }),
    explainElement("needle", losing, { ticker: "BOIL" }),
  ]) {
    if (/(lose|loses)\s+-\$/.test(t)) throw new Error(`double negative: ${t}`);
    if (/(pay|pays)\s+\+\$/.test(t)) throw new Error(`redundant plus: ${t}`);
  }
  // ...and where the sign IS the information, it is still shown
  has(explainElement("red", losing, { ticker: "BOIL" }), "-$");
});

check("counts read as English", () => {
  eq(inTenPhrase(0.1), "1 time in 10", "singular");
  eq(inTenPhrase(0.5), "5 times in 10", "plural");
  eq(inTenPhrase(0), "0 times in 10", "zero");
});

check("explain() answers about the element tapped, with this trade's numbers", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  has(explainElement("green", b, { ticker: "CORN" }), "$300");     // 5-wide spread less $200 paid
  has(explainElement("red", b, { ticker: "CORN" }), "-$200");
  has(explainElement("breakeven", b, { ticker: "CORN" }), "Break even at $102");
  has(explainElement("needle", b, { ticker: "CORN" }), "$100.00");
  has(explainElement("payoff", b, { ticker: "CORN" }), "Best case");
});

check("chance in profit is read off the same bands", () => {
  const b = payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT });
  const p = chanceInProfit(b, { spot: SPOT, sigma: 0.25, dte: 45 });
  if (!(p > 0.1 && p < 0.9)) throw new Error(`implausible probability ${p}`);
  // a condor centred on spot must beat a spread that needs a 2% move first
  const p2 = chanceInProfit(payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT }), { spot: SPOT, sigma: 0.25, dte: 45 });
  if (!(p > p2)) throw new Error(`condor ${p} should beat the out-of-the-money spread ${p2}`);
});

check("the unified component drops the cone and the histogram when narrow", () => {
  const wide = unifiedLayout(900);
  const narrow = unifiedLayout(UNIFIED_DETAIL_WIDTH - 1);
  if (!wide.detail) throw new Error("wide should keep the detail");
  if (narrow.detail) throw new Error("narrow should drop the detail");
  if (!(wide.xConeEnd > wide.xToday)) throw new Error("no cone column when wide");
  if (narrow.xConeEnd !== narrow.xToday) throw new Error("cone column still present when narrow");
  if (narrow.xDistEnd !== narrow.xConeEnd) throw new Error("histogram column still present when narrow");
  // the payoff panel survives at every width — it is the point of the chart
  if (!(narrow.xPayEnd > narrow.xDistEnd)) throw new Error("payoff panel lost when narrow");
});

check("the coloured bands stop where the cone ends", () => {
  const html = renderToStaticMarkup(
    <UnifiedPosition legs={ironCondor} entryNet={-2} spot={SPOT} width={900} dte={45} sigma={0.25} ticker="UNG" />);
  const L = unifiedLayout(900);
  const rects = [...html.matchAll(/<rect[^>]*width="([\d.]+)"[^>]*>/g)].map((m) => +m[1]);
  const bandWidth = +(L.xConeEnd - L.xToday).toFixed(10);
  if (!rects.some((w) => Math.abs(w - bandWidth) < 0.01)) {
    throw new Error(`no band drawn at the cone's width (${bandWidth}); widths seen: ${rects.slice(0, 8)}`);
  }
});

check("the thumbnail carries no numbers and no labels", () => {
  const b = payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT });
  const html = renderToStaticMarkup(<BandThumbnail bands={b} width={80} height={30} />);
  if (/<text/.test(html)) throw new Error("the thumbnail renders text");
  // three bands, breakeven ticks, the price line and the spot marker
  eq((html.match(/<rect/g) || []).length, 3, "band rects");
  if (!/<circle/.test(html)) throw new Error("no spot marker");
});

check("the thumbnail draws the underlying's PRICE LINE over the bands (PRD §6)", () => {
  const b = payoffBands({ legs: ironCondor, entryNet: -2, spot: SPOT });
  const bars = [92, 95, 99, 104, 101, 100].map((c) => ({ open: c, high: c + 1, low: c - 1, close: c }));
  const html = renderToStaticMarkup(<BandThumbnail bands={b} width={160} height={44} bars={bars} spot={SPOT} />);
  const path = (html.match(/<path d="(M[^"]+)"/) || [])[1];
  if (!path) throw new Error("bare coloured bars: no price line at all");
  eq((path.match(/L/g) || []).length, bars.length - 1, "price line vertices");
  // price is the VERTICAL axis, as it is in the unified component: the bands
  // span the full width and stack, so the line can run across them.
  const widths = [...html.matchAll(/<rect[^>]*width="([\d.]+)"/g)].map((m) => +m[1]);
  if (!widths.every((w) => Math.abs(w - 160) < 0.01)) throw new Error(`bands are not full-width stripes: ${widths}`);
});

check("a thumbnail with no history still draws a line, never bare bars", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  const html = renderToStaticMarkup(<BandThumbnail bands={b} width={80} height={30} spot={SPOT} />);
  if (!/stroke-dasharray="2 3"/.test(html)) throw new Error("no fallback price line");
});

check("the price axis stretches to hold history outside the payoff range", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  // a close far above the sampled range must still land inside the picture
  const bars = [{ close: SPOT * 2 }, { close: SPOT }];
  const html = renderToStaticMarkup(<BandThumbnail bands={b} width={100} height={40} bars={bars} spot={SPOT} />);
  const path = (html.match(/<path d="(M[^"]+)"/) || [])[1];
  const ys = [...path.matchAll(/[ML][\d.-]+,([\d.-]+)/g)].map((m) => +m[1]);
  if (ys.some((y) => y < -0.01 || y > 40.01)) throw new Error(`the price line runs off the chart: ${ys}`);
});

check("the visuals render at all, and describe themselves for a screen reader", () => {
  const b = payoffBands({ legs: bullCall, entryNet: 2, spot: SPOT });
  const g = renderToStaticMarkup(<Gauge bands={b} size={240} ticker="CORN" />);
  has(g, 'aria-label="' + gaugeTakeaway(b, { ticker: "CORN" }).replace(/&/g, "&amp;").replace(/"/g, "&quot;"));
  has(g, "<path");
  const u = renderToStaticMarkup(
    <UnifiedPosition legs={bullCall} entryNet={2} spot={SPOT} width={900} dte={45} sigma={0.25} ticker="CORN"
      bars={[{ open: 98, high: 101, low: 97, close: 100 }, { open: 100, high: 102, low: 99, close: 100 }]} />);
  has(u, "<svg");
});

check("the exit plan sentence comes from the rules, not from a component", () => {
  const t = exitPlanSentence();
  has(t, String(Math.round(RULES.takeProfitPct * 100)));
  has(t, String(RULES.exitDTE));
});

console.log(ok.map((n) => "  ok   " + n).join("\n"));
if (bad.length) console.log(bad.map(([n, e]) => "  FAIL " + n + " — " + e).join("\n"));
/* ============ THE OPEN-INTEREST STRIP — the floor, drawn ============ */

check("one bar per strike, and the cut lands at the right rank", () => {
  const peers = [0, 2, 5, 9, 14, 30, 60, 120, 400, 900];
  const html = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={10} width={200} />);
  eq((html.match(/<rect/g) || []).length, peers.length, "every strike on the expiry is drawn");
  eq(oiCutAt(peers, 10), 4, "0, 2, 5 and 9 are under the floor");
});

check("the strip is coloured by the floor, not by the order", () => {
  const peers = [1, 3, 50, 900];
  const html = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={10} width={200} />);
  eq((html.match(new RegExp(T.red, "g")) || []).length, 2, "the two under the floor are drawn as removed");
  eq((html.match(new RegExp(T.green, "g")) || []).length, 2, "and the two above it as kept");
});

check("moving the floor moves the cut, and nothing else about the picture", () => {
  const peers = [1, 3, 50, 900, 12, 7, 200, 33];
  eq(oiCutAt(peers, 5), 2, "at 5");
  eq(oiCutAt(peers, 40), 5, "at 40");
  eq(oiCutAt(peers, 0), 0, "a floor of zero removes nothing");
  const loose = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={0} width={200} />);
  const tight = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={40} width={200} />);
  eq((loose.match(/<rect/g) || []).length, (tight.match(/<rect/g) || []).length,
    "the same strikes are drawn at every setting: only the cut moves");
});

check("a 66,000-to-1 range still draws a shape rather than two bars", () => {
  // Real UNG numbers. Drawn linearly, everything but the tallest bar would be
  // an invisible sliver, which is why the height is compressed.
  const h = oiBarHeights([1, 8, 40, 300, 2000, 12000, 66130], 46);
  eq(h.length, 7, "one height per strike");
  if (!h.every((x, i) => i === 0 || x >= h[i - 1])) throw new Error("taller for busier, always");
  if (!(h[0] >= 1)) throw new Error("the emptiest strike is still visible");
  if (!(h[1] > h[0] * 1.5)) throw new Error("and the small ones stay distinguishable from each other");
  if (!(h[h.length - 1] <= 46)) throw new Error("nothing draws outside the box");
});

check("a strike with nothing open is drawn, not skipped", () => {
  const h = oiBarHeights([0, 0, 5], 40);
  eq(h.length, 3, "three strikes");
  if (!(h[0] >= 1)) throw new Error("zero open interest is a fact about a strike, not an absent strike");
});

check("a strike with nothing open is VISIBLE, and grey rather than green or red", () => {
  // Read on BOIL 2026-10-09: the emptiest strikes on that expiry carry 0 open
  // contracts, log1p(0) is 0, and two thirds of the strip drew at zero height —
  // indistinguishable from not drawn at all, at any setting.
  const h = oiBarHeights([0, 0, 0, 4, 90], 46);
  if (!(h[0] >= OI_EMPTY_BAR)) throw new Error(`an empty strike must clear ${OI_EMPTY_BAR}px, got ${h[0]}`);
  eq(isEmptyStrike(0), true, "nothing open");
  eq(isEmptyStrike(1), false, "one contract is not nothing");
  // Off: nothing is removed, so nothing is red — but the empties are not green
  // either, because the app is not calling a strike with no contracts on it fine.
  const off = renderToStaticMarkup(<OpenInterestStrip peers={[0, 0, 0, 4, 90]} threshold={0} width={200} />);
  eq((off.match(new RegExp(T.red, "g")) || []).length, 0, "nothing is removed at Off");
  eq((off.match(new RegExp(T.mut, "g")) || []).length >= 3, true, "the three empty strikes are grey");
  eq((off.match(new RegExp(T.green, "g")) || []).length, 2, "and only the two with contracts on them are green");
});

check("with the floor OFF the strip shows where the recommendation WOULD cut", () => {
  // A solid green block with no line in it teaches nothing: "off" only means
  // something against what is being switched off.
  const peers = [0, 0, 1, 3, 8, 14, 30, 60, 120, 400, 900, 1800];
  const ghost = oiGhostCut(peers);
  eq(ghost.threshold, liquidityThreshold(peers, RECOMMENDED_LIQUIDITY).threshold,
    "the ghost is the real recommended cut for this expiry, not an illustration");
  eq(ghost.cut, oiCutAt(peers, ghost.threshold), "at the rank that threshold actually falls on");
  const off = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={0} width={240} />);
  has(off, "RECOMMENDED WOULD CUT HERE");
  has(off, String(ghost.threshold));
  // ...and it is labelled as a ghost, not applied: the takeaway still says
  // nothing is filtered.
  const t = oiStripTakeaway([...peers].sort((a, b) => a - b), 0);
  oneSentence(t);
  has(t, "No contract is removed");
  // At any real setting there is a real line, and no ghost.
  const on = renderToStaticMarkup(<OpenInterestStrip peers={peers} threshold={10} width={240} />);
  if (on.includes("RECOMMENDED WOULD CUT HERE")) throw new Error("the ghost belongs to the OFF setting only");
});

check("the empty strikes and the ghost line explain themselves on tap", () => {
  has(explainOiStrip("empty", { total: 12 }), "NOTHING open");
  has(explainOiStrip("ghost", { ghost: 10 }), "OFF");
  has(explainOiStrip("ghost", { ghost: 10 }), "10");
});


check("no strikes means no chart, not a broken one", () => {
  eq(renderToStaticMarkup(<OpenInterestStrip peers={[]} threshold={10} />), "", "nothing to draw");
  eq(oiStripTakeaway([], 10), "", "and nothing to say");
});

check("the strip's takeaway is ONE generated sentence carrying the real numbers", () => {
  const t = oiStripTakeaway([0, 2, 5, 9, 14, 30, 60, 120, 400, 900], 10, { expKey: "2026-10-16" });
  oneSentence(t);
  has(t, "10");           // the floor
  has(t, "4");            // how many it removes
  has(t, "900");          // what the busiest strike here carries
  has(t, "2026-10-16");
  const none = oiStripTakeaway([50, 60, 70], 10);
  oneSentence(none);
  has(none, "removes none");
  // With the floor OFF, "carry at least 0 open contracts" is true and useless.
  const off = oiStripTakeaway([0, 3, 70], 0, { expKey: "2026-10-16" });
  oneSentence(off);
  has(off, "No contract is removed");
  has(off, "70");
  if (/at least 0/.test(off)) throw new Error("the no-floor case must not quote a floor of zero");
});

check("every part of the strip explains itself on tap", () => {
  const cut = explainOiStrip("cut", { threshold: 30, cut: 4, total: 11 });
  has(cut, "30"); has(cut, "4");
  has(cut, "placeholder");     // it names what a price on an untraded strike really is
  has(explainOiStrip("kept", { threshold: 30, cut: 4, total: 11 }), "this expiry's own strikes");
  has(explainOiStrip("elsewhere", { total: 11 }), "11");
});

for (const [n, m] of bad) console.log(`  FAIL ${n}\n       ${m}`);
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);

