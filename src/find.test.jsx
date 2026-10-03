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
  nearestRelaxation, resultsLine } from "./rules.js";
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
  return <CandidateCard key={x.key} name={`${x.tk} · ${x.name}`} legs="x" misses={misses} rr={x.lf.rr} pop={x.lf.pop}
    figures={sizedFigures(x.lf.aFill, null)} />;
};
const render = (req, extra = {}) => renderToStaticMarkup(
  <MatchList items={cands} request={req} sizeOf={sizesFor(req)} renderItem={renderRow} {...extra} />);
const articles = (h) => (h.match(/<article/g) || []).length;

check("AT 'CHANCE AT LEAST 60%' ONLY THE CARDS THAT MEET ARE ON SCREEN, AND THE REST ARE A COUNT", () => {
  const req = requestOf({ minChance: 0.6 }, LIMITS);
  const sp = splitByRequest(cands, req, sizesFor(req));
  const n = sp.meets.length, m = sp.others.length;
  eq(n + m, 31, "nothing is dropped: the two are the whole list");
  if (!(n > 0 && m > 0)) throw new Error(`the fixture has to split at 60% (${n}/${m})`);
  const closed = render(req);
  eq(articles(closed), n, "only the matching cards are on screen");
  has(closed, resultsLine(n, m, false));
  const open = render(req, { defaultOpen: true });
  eq(articles(open), 31, "tapping the count shows every one");
  has(open, resultsLine(n, m, true));
  // ...each of the revealed ones with its reason.
  for (const o of sp.others) has(open, o.misses[0].short);
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
  for (const k of ["request", "want", "minChance", "minReturn", "amt", "freeSizing", "limits"]) {
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

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
