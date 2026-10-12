// ============================================================================
// src/find.test.jsx — THE FIND CONTROLS DO WHAT THEY SAY, ON THE 31 FIXTURE CARDS (PR #45, TASKS 0 AND 1).
//
// The owner read two faults on his own screen:
//   0. A budget typed at $5,150 against a per-trade limit of $5,000 sized 27 of 28 cards above $5,000 (XLE: 26 ×
//      $193 = $5,018), and the gate refuses every one of them on Build. A card offered a trade it could not send.
//   1. "The filters do not filter": at "chance at least 60%" 4 of 31 cards met it and all 31 stayed on screen, and
//      a budget from $500 to $5,000 moved nobody.
//
// Both are measured on `scripts/find-fixtures.jsx` — the fixture boards, through the REAL generation functions —
// and the conditions are held here so they cannot come back. `scripts/measure-find.mjs` prints the same numbers.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { buildPresets } from "./App.jsx";
import { scaleStrategy } from "./pro.jsx";
import { MatchList, CandidateCard } from "./card.jsx";
import { RULES, requestOf, sizing, sizedFree, sizedFigures, sizeLine, controlReadings, splitByRequest,
  nearestRelaxation, resultsLine, futureFigures, futureIsPositive, FIND_ORDERS, FIND_CHIPS, chipText, chipPartsOf, chipOffDefault,
  anyChipOff, moreOffCount, MORE_ITEMS, viewOfDir, dirOfView, FIND_STYLES, styleOf, styleNumbersText, NET_SIDES, netSideOf,
  meetsRequest, nothingFits, bindingFilterText, viewTargetPrice, viewExampleText } from "./rules.js";
import { findOrderCompare, findOrderOf } from "./signals.js";
import { marketRows, bindingFilter } from "./rows.js";
import { findCards, DIRECTIONS } from "../scripts/find-fixtures.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 200)}"`); };

const cards = findCards();
const cands = cards.map((c) => c.cand);
const byKey = new Map(cards.map((c) => [c.key, c]));
const sizesFor = (req, free = false) => {
  const m = new Map(cards.map((c) => [c.key, sizedFree(scaleStrategy(c.lf.aFill, req.mode, req.amt, req.riskCap), free)]));
  return (c) => m.get(c.key) || null;
};

check("THE FIXTURE IS THE ONE THE OWNER'S MEASUREMENT NAMES: 31 cards over 5 directions", () => {
  eq(cards.length, 31, "cards");
  eq(new Set(cards.map((c) => c.sent)).size, 5, "directions");
  eq(new Set(cards.map((c) => c.key)).size, 31, "every card has its own key");
});

/* ====================================================================
   TASK 0 — THE AMOUNT NEVER PASSES THE PER-TRADE LIMIT, AND NO CARD OFFERS A TRADE THE GATE REFUSES
==================================================================== */
check("THE DEBT IS REAL WITHOUT THE CAP — so the next test can fail", () => {
  // Free of the cap (`riskCap` null), $5,150 against a $5,000 limit sizes cards past it.
  let past = 0;
  for (const c of cards) {
    const s = scaleStrategy(c.lf.aFill, "budget", 5150, null);
    if (s && s.ok && s.totRisk > 5000) past++;
  }
  if (past < 10) throw new Error(`only ${past} cards past the limit: the fixture does not reproduce the owner's screen`);
});

check("FLAG OFF: NO CARD'S TOTAL RISK EXCEEDS THE PER-TRADE LIMIT, WHATEVER IS TYPED, IN EITHER MODE", () => {
  let sized = 0;
  for (const limit of [250, 1000, 5000]) {
    for (const mode of ["budget", "target"]) {
      for (const amt of [100, limit, limit + 150, limit * 10, 1e6]) {
        const req = requestOf({ mode, amt }, { perTradeLimit: limit });
        eq(req.riskCap, limit, "the cap is the per-trade limit");
        if (mode === "budget" && req.amt > limit) throw new Error(`the amount ${req.amt} passes the limit ${limit}`);
        for (const c of cards) {
          const s = scaleStrategy(c.lf.aFill, req.mode, req.amt, req.riskCap);
          if (!s || !s.ok) continue;
          sized++;
          if (s.totRisk > limit + 1e-9) throw new Error(`${c.tk} ${c.name}: ${s.n} × ${s.risk} = ${s.totRisk} at risk on a limit of ${limit} (${mode} ${amt})`);
        }
      }
    }
  }
  if (sized < 200) throw new Error(`only ${sized} sized cards: the sweep proves little`);
});

check("THE OWNER'S CASE: $5,150 typed, limit $5,000 — the amount is held at the limit and says so", () => {
  const req = requestOf({ amt: 5150 }, { perTradeLimit: 5000 });
  eq(req.amt, 5000, "held at the limit"); eq(req.amtCapped, true, "and says it was");
  eq(requestOf({ amt: 4000 }, { perTradeLimit: 5000 }).amtCapped, false, "under the limit is not capped");
  eq(requestOf({}, { perTradeLimit: 5000 }).amtCapped, false, "a derived default is not a typed amount");
  // `floor`, not `round`: a limit of $5,000.40 may not let a rounding past it.
  eq(requestOf({ amt: 9999 }, { perTradeLimit: 5000.6 }).amt, 5000, "floored");
});

check("RAISING THE LIMIT GOES THROUGH THE EXISTING EDIT, AND THEN THE AMOUNT MAY FOLLOW IT", () => {
  const low = sizing({ tradingCapital: 100000, concurrentTarget: 10 });            // 5% of 100,000 → 5,000
  const raised = sizing({ tradingCapital: 100000, concurrentTarget: 10, override: { perTrade: 8000, reason: "a bigger edge on this one" } });
  eq(Math.round(low.perTradeLimit), 5000, "the cap before"); eq(raised.perTradeLimit, 8000, "the cap after, with a typed reason");
  eq(requestOf({ amt: 7000 }, low).amt, 5000, "held at the old limit");
  eq(requestOf({ amt: 7000 }, raised).amt, 7000, "the raised limit is the new cap");
  // Without the typed reason the override is refused, so the cap stays.
  const refused = sizing({ tradingCapital: 100000, concurrentTarget: 10, override: { perTrade: 8000, reason: "" } });
  eq(requestOf({ amt: 7000 }, refused).amt, 5000, "no reason, no raise");
});

check("FREE SIZING ON: BEHAVIOUR IS UNCHANGED — NO CAP, THE SLIDER'S TOP IS THE CAPITAL", () => {
  const limits = { perTradeLimit: 5000, tradingCapital: 100000 };
  const req = requestOf({ amt: 5150 }, limits, { sizingFree: true });
  eq(req.amt, 5150, "the amount is not held"); eq(req.riskCap, null, "no cap"); eq(req.amtMax, 100000, "the top is the capital");
  let past = 0;
  for (const c of cards) { const s = scaleStrategy(c.lf.aFill, req.mode, req.amt, req.riskCap); if (s && s.ok && s.totRisk > 5000) past++; }
  if (past === 0) throw new Error("free sizing is capped: it must not be");
  // ...and the flag off, same inputs, is capped: the flag is the ONLY thing that differs.
  eq(requestOf({ amt: 5150 }, limits).amt, 5000, "flag off");
});

check("EVERY CARD THE LIST SIZES FITS THE GATE'S PER-TRADE CHECK: n × maxLoss ≤ the limit", () => {
  // The gate measures `Math.abs(maxLoss) × contracts` against `perTradeLimit` (riskGate.js, PER_TRADE_LIMIT).
  const limits = { perTradeLimit: 5000 };
  const req = requestOf({ amt: 5150 }, limits);
  const sizeOf = sizesFor(req);
  for (const c of cards) {
    const s = sizeOf(c.cand);
    if (!s || !s.ok) continue;
    if (Math.abs(c.lf.aFill.maxLoss) * s.n > limits.perTradeLimit) throw new Error(`${c.tk} ${c.name} would be refused on Build`);
  }
});

/* ====================================================================
   TASK 1 — WHAT MISSES IS HIDDEN, AND NOTHING IS DROPPED WITHOUT A COUNT
==================================================================== */
const LIMITS = { perTradeLimit: 5000, tradingCapital: 100000 };
const renderRow = (c, misses) => {
  const x = byKey.get(c.key);
  return <CandidateCard key={x.key} cardKey={x.key} name={`${x.tk} · ${x.name}`} legs="x" misses={misses} rr={x.lf.rr} pop={x.lf.pop}
    figures={sizedFigures(x.lf.aFill, null)} />;
};
const render = (req, extra = {}) => renderToStaticMarkup(
  <MatchList items={cands} request={req} sizeOf={sizesFor(req)} renderItem={renderRow} {...extra} />);
const articles = (h) => (h.match(/<article/g) || []).length;
const keysOf = (h) => [...h.matchAll(/data-card-key="([^"]+)"/g)].map((m) => m[1]);

check("ONE LIST (PR #49): AT 'CHANCE AT LEAST 60%' EVERY CARD IS ON SCREEN, THE MISSES IN PLACE WITH THEIR REASONS", () => {
  const req = requestOf({ minChance: 0.6 }, LIMITS);
  const sp = splitByRequest(cands, req, sizesFor(req));
  const n = sp.meets.length, m = sp.others.length;
  eq(n + m, 31, "nothing is dropped: the two are the whole list");
  if (!(n > 0 && m > 0)) throw new Error(`the fixture has to split at 60% (${n}/${m})`);
  const all = render(req);
  eq(articles(all), 31, "every card is on screen, misses included");
  has(all, resultsLine(n, m, false));
  eq((all.match(/data-miss="true"/g) || []).length, m, "each miss is marked as one");
  for (const o of sp.others) has(all, o.misses[0].short);
  // The list keeps the order it was given: a miss is not moved below the matches.
  eq(keysOf(all).join("|"), cands.map((c) => c.key).join("|"), "the order on screen is the caller's order");
  const hidden = render(req, { hideMisses: true });
  eq(articles(hidden), n, "'Hide cards that miss' gives the old view");
  has(hidden, resultsLine(n, m, true));
});

check("SWITCHING 'ORDER BY' REORDERS THE WHOLE LIST — misses included — and the top card changes", () => {
  const req = requestOf({ minChance: 0.6 }, LIMITS);
  const tops = new Set();
  for (const o of FIND_ORDERS) {
    const sorted = [...cards].sort(findOrderCompare(o.id));
    const html = renderToStaticMarkup(<MatchList items={sorted.map((c) => c.cand)} request={req} sizeOf={sizesFor(req)} renderItem={renderRow} />);
    eq(keysOf(html).join("|"), sorted.map((c) => c.key).join("|"), `${o.label}: the screen is the sorted list`);
    tops.add(sorted[0].key);
  }
  if (tops.size < 3) throw new Error(`the five orders put only ${tops.size} different cards on top`);
});

check("THE FUTURE AND THE PAST ON THE FIXTURES (PR #49): the tile's figure is the one 'Future avg' sorts on", () => {
  const ev = cards.map((c) => c.ev100).filter((v) => v > -999).sort((a, b) => a - b);
  const med = ev[Math.floor(ev.length / 2)];
  const pos = cards.filter((c) => futureIsPositive(c.ev100)).length;
  console.log(`       future avg per $100: ${ev[0].toFixed(1)} → ${ev[ev.length - 1].toFixed(1)}, median ${med.toFixed(1)}, ${pos} of ${cards.length} above zero`);
  for (const c of cards) {
    const ff = futureFigures(c.lf.mc, c.lf.aFill, null, c.expKey);
    if (c.ev100 > -999) eq(+ff.per100.toFixed(9), +c.ev100.toFixed(9), `${c.name}: tile and sort read one figure`);
    else eq(ff.per100, null, `${c.name}: no figure, sorts last`);
  }
  // The past is read on every fixture card from the one matrix, and "Past yrs" sorts on win rate first.
  const withPast = cards.filter((c) => c.past);
  eq(withPast.length, cards.length, "every card has its replay");
  const byPast = [...cards].sort(findOrderCompare("past"));
  for (let i = 1; i < byPast.length; i++) if (byPast[i].past.winRate > byPast[i - 1].past.winRate + 1e-12) throw new Error("not sorted by win rate");
  // "Only a positive future avg" hides exactly the cards at or under zero, and an unknown one.
  eq(futureIsPositive(-999), false, "unknown is not above zero"); eq(futureIsPositive(0), false, "zero is not above zero");
  eq(futureIsPositive(0.1), true, "above zero");
});

check("THE CHANCE CONTROL FILTERS: moving it from 20% to 80% takes the matching count monotonically down", () => {
  let last = Infinity;
  for (const minChance of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    const req = requestOf({ minChance }, LIMITS);
    const n = splitByRequest(cands, req, sizesFor(req)).meets.length;
    if (n > last) throw new Error(`${minChance}: ${n} match, more than ${last} at the looser one`);
    last = n;
  }
  const lo = splitByRequest(cands, requestOf({ minChance: 0.2 }, LIMITS), sizesFor(requestOf({}, LIMITS))).meets.length;
  const hi = splitByRequest(cands, requestOf({ minChance: 0.8 }, LIMITS), sizesFor(requestOf({}, LIMITS))).meets.length;
  if (!(lo > hi)) throw new Error(`the control moved nothing: ${lo} → ${hi}`);
});

check("THE RETURN CONTROL FILTERS, AND CAN ONLY TIGHTEN THE REWARD FLOOR", () => {
  const base = requestOf({ minChance: 0.2 }, LIMITS);
  const all = splitByRequest(cands, base, sizesFor(base)).meets.length;
  // 20% is the chance slider's own bottom, which reads "any" since PR #49: the card under it (one on the fixtures)
  // meets too, and at the reward floor the return control removes nothing.
  eq(all, cards.length, "at 'any' and the reward floor nothing is removed");
  const tight = requestOf({ minChance: 0.2, minReturn: 1.5 }, LIMITS);
  const sp = splitByRequest(cands, tight, sizesFor(tight));
  if (!(sp.meets.length < 31 && sp.meets.length > 0)) throw new Error(`150% splits nothing: ${sp.meets.length}`);
  for (const m of sp.meets) {
    const x = byKey.get(m.cand.key);
    if (x.lf.aFill.profitUnbounded) continue;           // no ceiling has no ratio and passes
    if (!(x.lf.rr >= 1.5 - 1e-9)) throw new Error(`${x.tk} ${x.name} at ${x.lf.rr} passed 150%`);
  }
  // A structure with no ceiling is not unknown: it passes the return filter.
  const unb = cards.filter((c) => c.lf.aFill.profitUnbounded);
  if (!unb.length) throw new Error("the fixture has no long call");
  for (const c of unb) if (!sp.meets.some((m) => m.cand.key === c.key) && tight.minChance <= c.lf.pop) throw new Error(`${c.name}: no ceiling was called unknown`);
  // Every card on the fixture already clears the floor: nothing here removed anything the floors kept.
  for (const c of cards) if (!c.lf.aFill.profitUnbounded && !(c.lf.rr >= RULES.minRewardRisk)) throw new Error(`${c.name} is under the floor`);
});

check("THE BUDGET CHANGES THE SIZE, NOT THE LIST — and the size is now visible on the card (PR #45, TASK 3)", () => {
  const members = (amt) => { const r = requestOf({ amt, minChance: 0.2 }, LIMITS); return splitByRequest(cands, r, sizesFor(r)).meets.map((m) => m.cand.key).join("|"); };
  eq(members(500), members(5000), "membership between $500 and $5,000 (the owner's finding stands: this is not what the budget is for)");
  const a = requestOf({ amt: 500 }, LIMITS), b = requestOf({ amt: 5000 }, LIMITS);
  let moved = 0;
  for (const c of cards) {
    const sa = sizesFor(a)(c.cand), sb = sizesFor(b)(c.cand);
    if (sa && sb && sa.ok && sb.ok && sizedFigures(c.lf.aFill, sb.n).risk !== sizedFigures(c.lf.aFill, sa.n).risk) moved++;
  }
  if (moved < 25) throw new Error(`only ${moved} cards' YOU RISK moved with the budget`);
});

check("ZERO MATCHES: THE CONTROL THAT BINDS AND A VALUE THAT REALLY LETS SOMETHING IN", () => {
  // The claim is a number, so it is checked as one: apply the value the line names and something matches.
  const attempts = [
    { minChance: 0.8 }, { minChance: 0.75 }, { minChance: 0.7 },
    { minChance: 0.2, minReturn: 3 }, { minChance: 0.2, minReturn: 2.5 },
    { minChance: 0.5, minReturn: 1.5 },
  ];
  let named = 0;
  for (const want of attempts) {
    const req = requestOf(want, LIMITS), sizeOf = sizesFor(req);
    if (splitByRequest(cands, req, sizeOf).meets.length) continue;
    const r = nearestRelaxation(cands, req, sizeOf);
    if (!r) throw new Error(`${JSON.stringify(want)}: nothing matches and nothing is said`);
    if (!r.control) { has(r.text, "No single control"); continue; }
    named++;
    const patched = { ...want, ...(r.control === "chance" ? { minChance: r.value } : r.control === "return" ? { minReturn: r.value } : { amt: r.value }) };
    const req2 = requestOf(patched, { ...LIMITS, perTradeLimit: Math.max(5000, r.control === "size" ? r.value : 0) });
    const got = splitByRequest(cands, req2, sizesFor(req2)).meets;
    if (!got.length) throw new Error(`${JSON.stringify(want)}: "${r.text}" lets nothing in`);
    const tickers = new Set(got.map((g) => g.cand.ticker));
    for (const t of r.matches.filter((x) => !x.startsWith("+"))) if (!tickers.has(t)) throw new Error(`"${r.text}" names ${t}, which does not match`);
    if (!/^(Lower|Raise)/.test(r.text) || !/→ \d+ match(es)?: /.test(r.text)) throw new Error(`the line is not the promised shape: ${r.text}`);
  }
  if (named < 3) throw new Error(`only ${named} of the attempts named a control: the sweep proves little`);
});

check("…AND IT SAYS SO WITHOUT GUESSING WHEN NO ONE CONTROL IS ENOUGH", () => {
  // Two cards, each missing BOTH the chance and the return asked: relaxing either one alone lets neither in.
  const two = [
    { key: "a", ticker: "AAA", pop: 0.3, rr: 0.5, maxProfit: 50, maxLoss: -100 },
    { key: "b", ticker: "BBB", pop: 0.4, rr: 0.6, maxProfit: 60, maxLoss: -100 },
  ];
  const req = requestOf({ minChance: 0.8, minReturn: 2 }, LIMITS);
  const sizer = () => ({ ok: true, n: 1, unit: 100, risk: 100, isCredit: false, totProfit: 50 });
  const r = nearestRelaxation(two, req, sizer);
  eq(r.control, null, "no single control");
  has(r.text, "No single control lets one in");
  has(r.text, "2 on chance"); has(r.text, "2 on return on risk");
  has(renderToStaticMarkup(<MatchList items={two} request={req} sizeOf={sizer} renderItem={() => null} />), "No single control");
  eq(nearestRelaxation(cands, requestOf({ minChance: 0.2 }, LIMITS), sizesFor(requestOf({}, LIMITS))), null, "something matches: nothing to say");
  eq(nearestRelaxation([], requestOf({}, LIMITS), () => null), null, "no candidates: nothing to say");
});

check("EACH CONTROL'S READING IS ITS OWN: histogram values and 'N pass' come from the cards' own figures", () => {
  const req = requestOf({ minChance: 0.5, minReturn: 1.5 }, LIMITS);
  const r = controlReadings(cands, req, sizesFor(req));
  eq(r.total, 31, "total");
  eq(r.chance.pass, cards.filter((c) => c.lf.pop >= 0.5).length, "chance passes");
  eq(r.chance.values.length, 31, "every chance is read");
  const bounded = cards.filter((c) => !c.lf.aFill.profitUnbounded);
  eq(r.return.values.length, bounded.length, "a structure with no ceiling is not a bin");
  eq(r.return.pass, cards.filter((c) => c.lf.aFill.profitUnbounded || c.lf.rr >= 1.5).length, "return passes");
  eq(r.all, splitByRequest(cands, req, sizesFor(req)).meets.length, "all = the list's own count");
});

/* ====================================================================
   "SEASON DECIDES" AND THE FIXED DIRECTIONS
==================================================================== */
check("EACH FIXED DIRECTION YIELDS ONLY ITS OWN PRESET FAMILY ON THE FIXTURE BOARDS", () => {
  const family = Object.fromEntries(DIRECTIONS.map((d) => [d, new Set(buildPresets(d, 100, 5, [90, 95, 100, 105, 110, 115]).map((p) => p.name))]));
  for (const d of DIRECTIONS) {
    const rows = cards.filter((c) => c.sent === d);
    if (!rows.length) throw new Error(`${d} produced no card on the fixtures`);
    for (const c of rows) if (!family[d].has(c.name)) throw new Error(`${d} yielded ${c.name}, which is not one of its presets: ${[...family[d]].join(", ")}`);
    for (const other of DIRECTIONS.filter((o) => o !== d)) for (const c of rows) if (family[other].has(c.name)) throw new Error(`${d} yielded ${other}'s ${c.name}`);
  }
  // ...and the families are disjoint, or "its own family" would mean nothing.
  const all = DIRECTIONS.flatMap((d) => [...family[d]]);
  eq(new Set(all).size, all.length, "no structure belongs to two directions");
});

/* ====================================================================
   PERFORMANCE — A SLIDER FILTERS THE GENERATED LIST AND NEVER RE-SIMULATES
==================================================================== */
const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

check("THE SLIDERS NEVER TRIGGER A SIMULATION: generation stays in findGen's memo, which does not read the request", () => {
  const app = code("src/App.jsx");
  const dep = app.match(/const findGen = useMemo\([\s\S]*?\n  \}, (\[[^\]]*\])\)/);
  if (!dep) throw new Error("findGen's dependency list moved; point this at it again");
  // PR 66: nor the View's target, the style or the side — a target moved inside one family re-builds nothing.
  for (const k of ["request", "want", "minChance", "minReturn", "amt", "freeSizing", "limits", "target", "side", "style"]) {
    if (new RegExp(`\\b${k}\\b`).test(dep[1])) throw new Error(`findGen depends on ${k}: a slider move re-simulates every card`);
  }
  for (const f of ["src/find.jsx", "src/card.jsx", "src/ui.jsx"]) {
    const c = code(f);
    for (const fn of ["chanceCheckOf", "chanceOf", "terminalMC", "listCardFigures", "shortlistWithFloors", "analyze("]) {
      if (c.includes(fn)) throw new Error(`${f} calls ${fn}: a slider move would re-run it`);
    }
  }
});

check("ONE SLIDER MOVE ON THE 31 CARDS IS MILLISECONDS, NOT THE GENERATION'S HUNDREDS", () => {
  const N = 50;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) {
    const req = requestOf({ minChance: 0.2 + (i % 13) * 0.05, amt: 500 + (i % 9) * 500 }, LIMITS);
    const so = sizesFor(req);
    controlReadings(cands, req, so);
    if (!splitByRequest(cands, req, so).meets.length) nearestRelaxation(cands, req, so);
  }
  const per = (performance.now() - t0) / N;
  console.log(`       one slider move: ${per.toFixed(3)} ms on ${cards.length} cards`);
  if (per > 25) throw new Error(`${per.toFixed(1)} ms a move: something in it is no longer a filter`);
});

/* ====================================================================
   PR 66 — FOUR CHIPS AND MORE, FROM YOUR VIEW OF THE MARKET (owner, 12 Oct 2026)
==================================================================== */
const ST = (o = {}) => ({ order: "ev", request: requestOf(o.want || {}, LIMITS), horizon: RULES.targetEntryDTE, dir: "signals", target: null,
  positiveOnly: false, flagged: true, hideMisses: false, liqId: "recommended", liqLabel: "Recommended", liqDefault: "recommended", ...(o.st || {}) });

check("66.1 — FIVE CHIPS, EACH SAYING ITS VALUE, AND OFF ITS DEFAULT ONLY WHEN SOMETHING WAS CHANGED", () => {
  eq(FIND_CHIPS.map((c) => c.id).join(" "), "view style budget sort more", "the order of the row");
  const at = ST();
  eq(FIND_CHIPS.map((c) => chipText(c.id, at)).join(" | "), "View Signals | Style Balanced | Max loss $5,000 | ⇅ Future avg | More", "at rest");
  eq(anyChipOff(at), false, "nothing is off at rest");
  const cases = [
    ["view", { st: { dir: "bull", target: null } }, "View Up 1×"],
    ["view", { st: { dir: "verybear", target: null } }, `View Down ${RULES.viewFartherMoves}×`],
    ["view", { st: { dir: "neutral" } }, "View Range"],
    ["style", { want: { minChance: RULES.styleCautiousChance } }, "Style Cautious"],
    ["style", { want: { minReturn: RULES.styleBoldReturn } }, "Style Bold"],
    ["style", { want: { minChance: 0.65, minReturn: 1 } }, "Style Custom"],
    ["budget", { want: { amt: 750 } }, "Max loss $750"],
    ["budget", { want: { mode: "target", amt: 300 } }, "Target $300"],
    ["sort", { st: { order: "past" } }, "⇅ Past yrs"],
  ];
  for (const [id, o, text] of cases) {
    const st = ST(o);
    eq(chipText(id, st), text, `${id} text`);
    eq(chipOffDefault(id, st), true, `${id} is off its default`);
    for (const other of FIND_CHIPS.map((c) => c.id).filter((c) => c !== id && c !== "budget")) eq(chipOffDefault(other, st), false, `${id} moved ${other}`);
  }
  eq(chipOffDefault("style", ST({ want: { minChance: null, minReturn: null } })), false, "Balanced is the default style");
  eq(chipPartsOf("budget", ST()).name, "Max loss", "the IBKR wording");
});

check("66.1e — MORE COUNTS EACH OF ITS SIX ITEMS OFF ITS DEFAULT, AND SAYS HOW MANY", () => {
  eq(MORE_ITEMS.join(" "), "side horizon liquidity positive flagged hideMisses", "what More holds");
  const one = { side: { want: { side: "credit" } }, horizon: { st: { horizon: 60 } }, liquidity: { st: { liqId: "off" } },
    positive: { st: { positiveOnly: true } }, flagged: { st: { flagged: false } }, hideMisses: { st: { hideMisses: true } } };
  for (const k of MORE_ITEMS) {
    const st = ST(one[k]);
    eq(moreOffCount(st), 1, `${k} alone`); eq(chipText("more", st), "More · 1", `${k}: the chip`); eq(chipOffDefault("more", st), true, k);
  }
  const all = ST({ want: { side: "debit" }, st: { horizon: 60, liqId: "off", positiveOnly: true, flagged: false, hideMisses: true } });
  eq(chipText("more", all), "More · 6", "all six");
});

check("66.1a — THE VIEW: the five old directions collapse into four, 'Very' is a farther target, and the target picks the family", () => {
  for (const [dir, view, target] of [["verybull", "up", RULES.viewFartherMoves], ["bull", "up", RULES.viewTargetDefault],
    ["verybear", "down", RULES.viewFartherMoves], ["bear", "down", RULES.viewTargetDefault], ["neutral", "range", null], ["signals", "signals", null]]) {
    const v = viewOfDir(dir);
    eq(v.view, view, `${dir}: view`); eq(v.target, target, `${dir}: target`);
    eq(dirOfView(v.view, v.target), dir, `${dir}: and back to the same family`);
  }
  eq(viewOfDir("nonsense").view, "signals", "anything unknown is Signals decide, never an error");
  eq(viewOfDir(undefined).view, "signals", "nothing stored is Signals decide");
  // The target inside one family builds the same family (so findGen, which reads the family, re-builds nothing)…
  eq(dirOfView("up", RULES.viewTargetMin), "bull"); eq(dirOfView("up", RULES.viewVeryMoves), "bull");
  eq(dirOfView("up", RULES.viewVeryMoves + RULES.viewTargetStep), "verybull"); eq(dirOfView("down", RULES.viewTargetMax), "verybear");
  // …a target kept when it still builds the family, the default when it does not.
  eq(viewOfDir("bull", 1.25).target, 1.25); eq(viewOfDir("bull", 2.5).target, RULES.viewTargetDefault);
  // The price on one market: spot ± target × the expected move; unknown is null, never a price of zero.
  eq(viewTargetPrice("up", 1.5, 10, 0.8), 11.2); eq(+viewTargetPrice("down", 1, 10, 0.8).toFixed(2), 9.2);
  eq(viewTargetPrice("up", 1, null, 0.8), null, "no spot"); eq(viewTargetPrice("range", 1, 10, 0.8), null, "range has no target");
  has(viewExampleText("CORN", "up", 1, 17.2, 1.2, "2026-11-20"), "CORN $17.20 → $18.40 by 20 Nov (1× its expected move of ±$1.20).");
});

check("66.1b — THE THREE STYLES ON THE 31 FIXTURE CARDS: Cautious 5, Balanced 31 (today's default), Bold 19, no card shared", () => {
  const kept = {};
  for (const st of FIND_STYLES) {
    const req = requestOf({ minChance: st.minChance, minReturn: st.minReturn }, LIMITS);
    eq(styleOf(req), st.id, `${st.label} reads as itself`);
    kept[st.id] = splitByRequest(cands, req, sizesFor(req)).meets.map((m) => m.cand.key);
    const rows = marketRows(cards, req, sizesFor(req)).filter((r) => r.fits).length;
    console.log(`       ${st.label.padEnd(9)} ${styleNumbersText(st).padEnd(30)} cards ${String(kept[st.id].length).padStart(2)} of ${cards.length} · rows ${rows} of 2`);
  }
  eq(kept.balanced.length, 31, "Balanced keeps today's default list");
  const base = requestOf({}, LIMITS);
  eq(styleOf(base), "balanced", "the default request IS Balanced");
  eq(kept.cautious.length, 5, "Cautious"); eq(kept.bold.length, 19, "Bold");
  const shared = kept.cautious.filter((k) => kept.bold.includes(k));
  eq(shared.length, 0, "Cautious and Bold give visibly different lists");
  // The return floor is never under minRewardRisk, whatever a style or a slider asks.
  eq(requestOf({ minReturn: 0.01 }, LIMITS).minReturn, RULES.minRewardRisk, "never under the floor");
});

check("66.1e — DEBIT · CREDIT · BOTH ON THE FIXTURE CARDS: the card's own net decides, and an unknown net is a miss", () => {
  const credits = cards.filter((c) => netSideOf(c.cand.entryNet) === "credit").length;
  const debits = cards.filter((c) => netSideOf(c.cand.entryNet) === "debit").length;
  eq(credits, 10, "credits on the fixture"); eq(debits, 21, "debits on the fixture");
  eq(NET_SIDES.map((x) => x.id).join(" "), "debit credit both");
  for (const [side, n] of [["both", 31], ["credit", 10], ["debit", 21]]) {
    const req = requestOf({ side }, LIMITS);
    eq(splitByRequest(cands, req, sizesFor(req)).meets.length, n, side);
  }
  const req = requestOf({ side: "credit" }, LIMITS);
  const debit = cards.find((c) => netSideOf(c.cand.entryNet) === "debit");
  const m = meetsRequest(debit.cand, req, sizesFor(req)(debit.cand)).misses;
  eq(m.length, 1, "one miss"); eq(m[0].control, "side"); eq(m[0].short, "a debit, not a credit");
  const unknown = meetsRequest({ ...debit.cand, entryNet: null }, req, sizesFor(req)(debit.cand)).misses;
  eq(unknown[0].id, "side-unknown", "unknown is not a pass");
  eq(netSideOf(0), null, "a net of zero is not a side"); eq(netSideOf(null), null, "Number(null) is 0: tested before");
  // With nothing fitting at all, the one fix is to show both again.
  const nf = nothingFits(cards.filter((c) => netSideOf(c.cand.entryNet) === "debit").map((c) => c.cand), req, sizesFor(req));
  eq(nf.control, "side", "the side binds"); eq(nf.fix.patch.side, "both", "the fix");
});

check("66.2 — THE FILTER THAT BINDS: read from the same misses, its fix lets those markets in and never passes the limit", () => {
  // Chance 60% on the fixture: SPY fits, UNG is dimmed by the chance alone.
  const req = requestOf({ minChance: 0.6 }, LIMITS);
  const b = bindingFilter(cards, req, sizesFor(req));
  eq(b.control, "style", "the style binds"); eq(b.count, 1, "one market left out"); eq(b.text, "Style Custom leaves out 1 market");
  eq(b.fix.label, "Loosen ›"); eq(JSON.stringify(b.fix.patch), JSON.stringify({ minChance: null, minReturn: null }), "Loosen is Balanced");
  // Applied, the fix lets the market in.
  const after = requestOf({ minChance: null, minReturn: null }, LIMITS);
  eq(marketRows(cards, after, sizesFor(after)).filter((r) => r.fits).length, 2, "both rows fit after the fix");
  // Nothing dimmed: nothing said.
  eq(bindingFilter(cards, requestOf({}, LIMITS), sizesFor(requestOf({}, LIMITS))), null, "nothing to say at rest");
  // The budget, on a limit of $250: a budget that leaves one market's cards over it names the budget, and its fix is an amount
  // inside the limit — or no fix, said, when the cheapest card is over the limit.
  const lim = { perTradeLimit: 250, tradingCapital: 5000 };
  const sz = (r) => { const mm = new Map(cards.map((c) => [c.key, sizedFree(scaleStrategy(c.lf.aFill, r.mode, r.amt, r.riskCap), false)])); return (c) => mm.get(c.key) || null; };
  let named = 0;
  for (const amt of [25, 50, 75, 100, 150, 200]) {
    const small = requestOf({ amt }, lim);
    const bb = bindingFilter(cards, small, sz(small));
    if (!bb || bb.control !== "size") continue;
    named++;
    if (bb.fix) {
      if (!(bb.fix.patch.amt <= 250)) throw new Error(`the fix ${bb.fix.patch.amt} passes the $250 limit`);
      if (!/^Max loss \$[\d,]+ ›$/.test(bb.fix.label)) throw new Error(bb.fix.label);
      const fixed = requestOf({ amt: bb.fix.patch.amt }, lim);
      const before = marketRows(cards, small, sz(small)).filter((r) => r.fits).length;
      const now = marketRows(cards, fixed, sz(fixed)).filter((r) => r.fits).length;
      if (!(now > before)) throw new Error(`$${amt}: the fix lets nothing in`);
    } else has(bb.text, "over your per-trade limit");
  }
  console.log(`       the budget named as binding on ${named} of 6 amounts on a $250 limit`);
  // The words: one home each.
  eq(bindingFilterText({ control: "side", count: 4, side: "credit" }).text, "Credit only leaves out 4 markets");
  eq(bindingFilterText({ control: "side", count: 4, side: "credit" }).fix, "Both ›");
  eq(bindingFilterText({ control: "style", count: 5, style: "cautious" }).text, "Style Cautious leaves out 5 markets");
  eq(bindingFilterText({ control: "size", count: 3, amt: 500, value: 750 }).fix, "Max loss $750 ›");
  eq(bindingFilterText({ control: "size", count: 3, amt: 500, overLimit: true }).text, "Max loss $500 leaves out 3 markets · over your per-trade limit");
});

check("66.1d — A STORED 'evSignal' READS AS FUTURE AVG, AND NO ORDER ADDS THE SIGNAL", () => {
  eq(findOrderOf("evSignal").id, "ev", "migrated");
  const byEv = [...cards].sort(findOrderCompare("ev")).map((c) => c.key).join("|");
  eq([...cards].sort(findOrderCompare("evSignal")).map((c) => c.key).join("|"), byEv, "the same list");
  eq(FIND_ORDERS.length, 4, "four orders");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
