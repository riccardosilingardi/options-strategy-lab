// ============================================================================
// src/listed.test.jsx — PR 70: ONLY LISTED CONTRACTS, EVERYWHERE A LEG IS CHOSEN (+ three wrong sentences).
//
// The owner, 13 Oct 2026, XLE 27 Nov board: Find proposed −62.5P / −69C / +70C / +59.5P. The board lists a 59.5 CALL and
// no 59.5 PUT; Build priced that leg off the model ("◌"), Send refused it (UNLISTED_CONTRACT), "Edit in chain" stayed
// blocked, and only "Load" on a variant got him out. On the same trade Build said "needs XLE to go up" (an iron condor),
// "One simulation, one seed" (there is no simulation since PR 62) and "Buying here often means buying the top" (a credit).
//
// Held here, on the owner's board (src/fixtures/xleListed.js: which strikes each side lists is his reading, the prices
// are synthetic): Find's presets and its floors never name a 59.5 put; Build's put dropdown does not offer it; a bought
// leg at bid 0 or a leg with no quote is dropped at generation with the note; the gate's own `priceability()` is
// unchanged; the fix under Send; the tray; and each of the three sentences. Plain functions are tested in chain.test.js,
// alternatives.test.js and marketView.test.js.
// ============================================================================
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { analyze, shortlistWithFloors, buildPresets, StrikeSelect, floorsFor, readAlternative, makeQuote } from "./App.jsx";
import { SendBar } from "./build.jsx";
import { ChainTab } from "./market.jsx";
import { confluence } from "./pro.jsx";
import { payoffBands } from "./visuals.jsx";
import { boardStrikes, expiryStrikes, strikesFor } from "./chain.js";
import { chainQuotedLegs, priceability, unpriceableNote, payoffNeed, structureNeedsLine, rsiWarning, tradeCard,
  chanceMethodLine, CHANCE_EXACT_LINE, CHANCE_METHOD_HEAD, listedFixLead, VARIANT_LOAD, TRAY_UNLISTED } from "./rules.js";
import { evaluateTrade } from "./riskGate.js";
import { xleChain, XLE_EK, XLE_SPOT, XLE_DTE, XLE_IV, OWNER_CONDOR, hasUnlistedPut } from "./fixtures/xleListed.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push([name, e.message]); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const truthy = (x, m) => { if (!x) throw new Error(m); };
const has = (h, s, m) => { if (!String(h).includes(s)) throw new Error(`${m || "missing"}: ${JSON.stringify(s)} in ${JSON.stringify(String(h).slice(0, 240))}`); };
const hasNot = (h, s, m) => { if (String(h).includes(s)) throw new Error(`${m || "unexpected"}: ${JSON.stringify(s)}`); };
const app = readFileSync("src/App.jsx", "utf8");
const pro = readFileSync("src/pro.jsx", "utf8");
const quotesOf = (a) => a.legPx.map((l) => ({ bid: l.bid, ask: l.ask, real: l.real === true }));

console.log("\nPR 70 — only listed contracts, everywhere a leg is chosen\n");

const C = xleChain();
const BOARD = boardStrikes(C, XLE_EK);
const Q = makeQuote(C, XLE_EK);
const SENTS = ["verybear", "bear", "neutral", "bull", "verybull"];

/* ---------------------------------------------------------------- 70.1 FIND */
check("FIND, BEFORE: on the calls-and-puts union the iron condor buys a 59.5 PUT (the owner's trade, reproduced)", () => {
  const ic = buildPresets("neutral", XLE_SPOT, 0.5, expiryStrikes(C, XLE_EK)).find((p) => p.name === "Iron Condor");
  truthy(ic && hasUnlistedPut(ic.legs), "the fixture no longer reproduces the owner's 59.5P");
});
check("FIND, AFTER: no preset of any family names a 59.5 put; each leg sits on a strike ITS type lists", () => {
  for (const sent of SENTS) {
    const ps = buildPresets(sent, XLE_SPOT, 0.5, BOARD);
    truthy(ps.length > 0, `${sent}: no presets`);
    for (const p of ps) {
      eq(hasUnlistedPut(p.legs), false, `${sent} ${p.name} names a 59.5 put`);
      for (const l of p.legs) truthy(strikesFor(BOARD, l.type).includes(l.strike), `${sent} ${p.name}: ${l.strike}${l.type} is not listed`);
    }
  }
  const ic = buildPresets("neutral", XLE_SPOT, 0.5, BOARD).find((p) => p.name === "Iron Condor");
  eq(ic.legs.map((l) => `${l.side > 0 ? "+" : "-"}${l.strike}${l.type[0].toUpperCase()}`).join(" "), "+60P -62.5P -69C +72.5C",
    "the condor's long put moves to the nearest listed PUT");
});
check("FIND'S FLOORS (the real generation site): no row and no cut names a 59.5 put, every family", () => {
  for (const sent of SENTS) {
    const r = shortlistWithFloors(sent, XLE_SPOT, 0.5, BOARD, XLE_DTE, XLE_IV, Q);
    for (const row of r.rows) eq(hasUnlistedPut(row.p.legs), false, `${sent} row ${row.p.name}`);
    for (const c of r.cut) eq(hasUnlistedPut(c.legs || []), false, `${sent} cut ${c.name}`);
  }
});
check("A PRESET NEEDING A TYPE THE BOARD LISTS NOTHING FOR IS NOT BUILT (never snapped to a grid)", () => {
  const callsOnly = { call: [60, 62.5, 65], put: [] };
  const ps = buildPresets("bear", XLE_SPOT, 0.5, callsOnly);
  eq(ps.map((p) => p.name).join(","), "Bear Call Spread", "only the all-call preset is built");
  eq(buildPresets("bull", XLE_SPOT, 0.5, null).length, 0, "no board");
  eq(buildPresets("bull", XLE_SPOT, 0.5, []).length, 0, "an empty board");
});

/* ---------------------------------------------------------------- 70.1 BUILD */
check("BUILD: the put StrikeSelect does not offer 59.5; the call StrikeSelect does", () => {
  const put = renderToStaticMarkup(<StrikeSelect strikes={strikesFor(BOARD, "put")} value={60} step={0.5} onChange={() => {}} />);
  hasNot(put, 'value="59.5"', "the put dropdown offers 59.5");
  has(put, 'value="60"');
  const call = renderToStaticMarkup(<StrikeSelect strikes={strikesFor(BOARD, "call")} value={60} step={0.5} onChange={() => {}} />);
  has(call, 'value="59.5"', "the call dropdown lost 59.5");
});
check("BUILD'S SOURCE: every leg's dropdown reads its own type; CALL ↔ PUT goes through toggleLegType(); no union left", () => {
  has(app, "<StrikeSelect strikes={strikesFor(expStrikes, l.type)}", "a leg's dropdown is not its type's strikes");
  has(app, "const expStrikes = useMemo(() => boardStrikes(chain, expKey), [chain, expKey]);");
  has(app, "onClick={() => flipLegType(i)}", "the CALL/PUT button does not re-snap");
  has(app, "const r = toggleLegType(L, i, expStrikes);");
  has(app, "setSnapNote(r.moved.length ? typeSnapNote(r.moved, expKey) : null);", "the type move is not said");
  hasNot(app, 'updLeg(i, "type"', "the type is flipped without a re-snap again");
  eq((app.match(/expiryStrikes\(/g) || []).length, 1, "App.jsx calls the union again (only its comment may name it)");
  // Build's default preset is the first whose legs the chain quotes.
  has(app, ".find((p) => chainQuotedLegs({ legs: p.legs, quotes: quotesOf(analyze(p.legs, spot, dte, iv, q)) }).ok);");
});

/* ---------------------------------------------------------------- 70.2 GENERATION ONLY */
check("A LEG WITH NO QUOTE (◌) IS DROPPED AT GENERATION, with the note; the GATE's priceability() is unchanged", () => {
  const a = analyze(OWNER_CONDOR, XLE_SPOT, XLE_DTE, XLE_IV, Q);
  eq(a.legPx[3].real, false, "the 59.5P is priced off the model");
  const ql = chainQuotedLegs({ legs: OWNER_CONDOR, quotes: quotesOf(a) });
  eq(ql.ok, false); eq(ql.bad.join(","), "3", "which leg");
  has(ql.reasons[0], "never listed the 59.5P you would be buying");
  const f = floorsFor(OWNER_CONDOR, { S: XLE_SPOT, dte: XLE_DTE, iv: XLE_IV, q: Q });
  eq(f.pass, false); eq(f.why, "unpriceable", "counted with the unpriceable ones");
  // THE GATE'S OWN TEST IS NOT LOOSENED OR TIGHTENED: priceability() still reads the unquoted leg as UNKNOWN and lets
  // it pass (root cause B, kept on purpose for a hand-built trade)…
  const pz = priceability({ legs: OWNER_CONDOR, quotes: quotesOf(a), net: a.entry, maxLoss: a.maxLoss });
  eq(pz.unknownQuotes, 1, "the model leg is counted as unknown, as before");
  eq(pz.priceable, true, "priceability() changed inside the gate");
  // …and the gate still refuses the contract by name (UNLISTED_CONTRACT), exactly as on the owner's phone.
  const g = evaluateTrade({ proposal: { ticker: "XLE", intent: "open", legs: OWNER_CONDOR, dte: XLE_DTE, contracts: 1, maxLoss: a.maxLoss,
    maxProfit: a.maxProfit, quotes: quotesOf(a), net: a.entry, occs: a.legPx.map((l) => l.occ || null) } });
  truthy(g.violations.some((v) => v.code === "UNLISTED_CONTRACT"), "the gate no longer refuses the unlisted leg");
});
check("A BOUGHT LEG AT BID 0 IS DROPPED AT GENERATION, counted, and the note names the reasons", () => {
  const noBid = xleChain((type, k, q) => (type === "put" ? { ...q, bid: 0 } : q));
  const q0 = makeQuote(noBid, XLE_EK);
  const r = shortlistWithFloors("neutral", XLE_SPOT, 0.5, BOARD, XLE_DTE, XLE_IV, q0);
  eq(r.rows.some((row) => row.p.legs.some((l) => l.type === "put" && l.side > 0)), false, "a row buys a put nobody bids for");
  truthy(r.tally.unpriceable > 0, "the drop is not counted");
  const note = unpriceableNote(r.tally.unpriceable, "XLE");
  has(note, "a leg the chain does not list"); has(note, "a leg nobody bids for");
  const ql = chainQuotedLegs({ legs: [{ side: 1, type: "put", strike: 60 }], quotes: [{ bid: 0, ask: 0.4, real: true }] });
  eq(ql.ok, false); eq(ql.noBid.length, 1);
  eq(chainQuotedLegs({ legs: [{ side: -1, type: "put", strike: 60 }], quotes: [{ bid: 0, ask: 0.4, real: true }] }).ok, true,
    "a SOLD leg is not asked for a bid (the net test catches an imaginary credit), as priceability() does");
  eq(chainQuotedLegs({ legs: [{ side: 1, type: "put", strike: 60 }], quotes: [{ bid: null, ask: 0.4, real: true }] }).ok, false,
    "a bought leg's unknown bid is not a bid");
});
check("A VARIANT (no floors) NAMING AN UNQUOTED LEG COMES BACK CUT, never priced — no ◌ on a variant row", () => {
  const r = readAlternative({ kind: "down", legs: OWNER_CONDOR, expKey: XLE_EK }, { chain: C, ticker: "XLE", iv: XLE_IV, seasonal: null,
    request: { mode: "budget", amt: 500, riskCap: 500 }, gate: () => ({ pass: true, violations: [] }) });
  truthy(r && r.cut, "the variant was priced");
  eq(r.cut.why, "unpriceable");
  has(app, "const buildVariants = useMemo(() => variantsPriced.filter((r) => !r.cut), [variantsPriced]);", "a cut variant reaches the rows");
});

/* ---------------------------------------------------------------- 70.3 SEND */
check("SEND REFUSED ON A LEG: the nearest listed alternative under the refusal, one tap — AltRows with VARIANT_LOAD", () => {
  const row = { kind: "listed", expKey: XLE_EK, label: "Nearest listed strike", legsText: "+60P −62.5P −69C +70C · 27 Nov 2026",
    youRisk: 250, maxProfit: 120, chance: "55%", rr: "48%", future: "−$3", past: "not read", gate: { pass: true }, gateText: "✓ The gate passes it at this size." };
  const lead = listedFixLead([{ from: { type: "put", strike: 59.5 }, to: { type: "put", strike: 60 } }]);
  const html = renderToStaticMarkup(<SendBar label="Send limit order" disabled reason="The option chain never listed the 59.5P…" footer=""
    onSend={() => {}} fix={{ lead, rows: [row], onLoad: () => {} }} />);
  has(html, "data-send-fix"); has(html, "59.5P → 60P"); has(html, VARIANT_LOAD); has(html, "Nearest listed strike");
  // App.jsx: only on UNLISTED_CONTRACT or UNPRICEABLE, priced through priceAlt(), loaded through openOnBuild().
  has(app, 'guard.violations.some((x) => x.code === "UNLISTED_CONTRACT" || x.code === "UNPRICEABLE")');
  has(app, "const alt = nearestListedOf({ legs, expKey, chain, bad: ql.bad });");
  has(app, "fix: sendBlock && listedFix ? { ...listedFix, onLoad: (alt) => openOnBuild(");
});
check("EDIT IN CHAIN: the tray marks the leg the board does not list and says a tap REPLACES it", () => {
  const html = renderToStaticMarkup(<ChainTab tk="XLE" chain={C} clock={null} tray={{ expKey: XLE_EK, legs: OWNER_CONDOR, note: null }}
    setTray={() => {}} cardFigures={null} quoteOf={makeQuote} seasonal={null} matrix={null} iv={XLE_IV} liqFloor={10} onBuildLegs={() => {}} />);
  has(html, `59.5P · ${TRAY_UNLISTED}`, "the chip is not marked");
  has(html, "data-tray-unlisted"); has(html, "No 59.5P on this board: tap a put ask to replace it.");
  // Quoted legs are not marked.
  hasNot(html, `62.5P · ${TRAY_UNLISTED}`);
});

/* ---------------------------------------------------------------- 70.4 THREE SENTENCES */
const L = (side, type, strike, qty = 1) => ({ side, type, strike, qty });
const needOf = (legs, net) => payoffNeed(payoffBands({ legs, entryNet: net, spot: XLE_SPOT }));
check("SENTENCE 1: an iron condor needs XLE to STAY BETWEEN its breakevens — never 'go up' — whatever its delta", () => {
  const a = analyze(OWNER_CONDOR.slice(0, 3).concat([L(1, "put", 60)]), XLE_SPOT, XLE_DTE, XLE_IV, Q);
  const n = needOf(OWNER_CONDOR.slice(0, 3).concat([L(1, "put", 60)]), a.entry);
  eq(n.need, "between");
  const line = structureNeedsLine(n, "XLE");
  has(line, "This structure needs XLE to stay between $"); hasNot(line, "go up"); hasNot(line, "go down");
  eq(n.lean, null, "a condor around today's price leans nowhere");
  const card = tradeCard({ ticker: "XLE", dir: 1, need: n, breakevens: a.breakevens, spot: XLE_SPOT, maxLoss: a.maxLoss, maxProfit: a.maxProfit });
  const bet = card.lines.find((x) => x.id === card.ids[0]).text;
  hasNot(bet, "goes up", "the trade card still bets the condor goes up"); has(bet, "stays between two prices"); has(bet, "between $");
  // The other shapes, read off the payoff: a bull call spread, a bear put spread, a long strangle.
  eq(structureNeedsLine(needOf([L(1, "call", 65), L(-1, "call", 70)], 2), "XLE").startsWith("This structure needs XLE to go up: above $"), true);
  eq(structureNeedsLine(needOf([L(1, "put", 65), L(-1, "put", 60)], 2), "XLE").startsWith("This structure needs XLE to go down: below $"), true);
  has(structureNeedsLine(needOf([L(1, "put", 62.5), L(1, "call", 70)], 1.5), "XLE"), "to move far, either way: below $");
  // A butterfly centred BELOW today's price is "between" too, but it needs the price to fall into its zone.
  const bearFly = [L(1, "put", 62.5), L(-1, "put", 60, 2), L(1, "put", 57.5)];
  const nf = needOf(bearFly, 0.3);
  eq(nf.need, "between"); eq(nf.lean, "down");
  has(structureNeedsLine(nf, "XLE"), "to go down, to between $"); hasNot(structureNeedsLine(nf, "XLE"), "quiet tape");
  const flyCard = tradeCard({ ticker: "XLE", dir: 0, need: nf, breakevens: [57.8, 62.2], spot: XLE_SPOT, maxLoss: -30, maxProfit: 220 });
  has(flyCard.lines.find((x) => x.id === flyCard.ids[0]).text, "XLE goes down. You make money between $");
  // Without a payoff, the card reads the delta as before.
  has(tradeCard({ ticker: "XLE", dir: 1, breakevens: [64], spot: XLE_SPOT }).lines[0].text, "XLE goes up.");
  // Build reads the payoff for the sentence, not the net delta.
  has(app, "note={structureNeedsLine(tradeNeed, ticker)}");
  hasNot(app, "to go ${tradeDir > 0 ? \"up\" : \"down\"}", "Build words the trade from the delta again");
});
check("SENTENCE 2: no simulation is named under the chance — the OSL model's exact chance and the market's", () => {
  for (const gone of ["One simulation, one seed", "THE SIMULATION BEHIND THE CHANCE", "Simulated at", "hand-written\" } seasonality",
    "Press \"Run it\""]) hasNot(app, gone, `App.jsx still says ${gone}`);
  has(app, "{CHANCE_EXACT_LINE}"); has(app, "<Label>{CHANCE_METHOD_HEAD} — \"{stratName}\"</Label>"); has(app, "{chanceMethodLine(chance, BF.mkt, ticker)}");
  has(CHANCE_EXACT_LINE, "worked out exactly"); has(CHANCE_EXACT_LINE, "the market's"); hasNot(CHANCE_EXACT_LINE.toLowerCase(), "simulat");
  hasNot(CHANCE_METHOD_HEAD.toLowerCase(), "simulat");
  const line = chanceMethodLine({ pop: 0.58, sigma: 0.259, ivSource: "average of the legs' implied volatilities", seasonalMeasured: true,
    driftAnnual: 0.04, dte: 45 }, { pop: 0.55 }, "XLE");
  has(line, "OSL model 58%: worked out exactly at 25.9% implied volatility"); has(line, "Market 55%"); hasNot(line.toLowerCase(), "simulat");
  has(chanceMethodLine({ pop: 0.58, sigma: 0.259, ivSource: "x", seasonalMeasured: false, driftAnnual: 0 }, { pop: null, reason: "few" }, "XLE"),
    "Market chance not read");
});
check("SENTENCE 3: the RSI warning follows what the trade needs — nothing on a neutral credit, nothing against the run", () => {
  eq(rsiWarning(75, "between"), null, "a condor after a run up");
  eq(rsiWarning(75, "apart"), null); eq(rsiWarning(75, "down"), null, "a bearish trade after a run up is not 'buying the top'");
  eq(rsiWarning(25, "up"), null, "a bullish trade after a fall");
  has(rsiWarning(75, "up"), "this trade needs it to keep rising"); has(rsiWarning(25, "down"), "this trade needs it to keep falling");
  eq(rsiWarning(55, "up"), null); eq(rsiWarning(null, "up"), null);
  const ta = { rsi: 76, trend: 1 };
  eq(confluence(0.5, ta, "between").warn, null, "the agreement panel warns a neutral trade");
  has(confluence(0.5, ta, "up").warn, "keep rising");
  hasNot(pro, "Buying here often means buying the top", "the old sentence is back");
  has(app, 'tradeNeed ? tradeNeed.lean : tradeDir > 0 ? "up" : tradeDir < 0 ? "down" : null');
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
