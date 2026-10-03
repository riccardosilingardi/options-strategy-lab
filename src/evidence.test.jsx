// PR #46, TASKS 1–3 — Find's header stops pointing at one market; evidence has a subject; the Why sheet.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { WhySheet } from "./why.jsx";
import { EvidenceBar } from "./steps.jsx";
import { findFreshness } from "./freshness.js";
import { seasonalSignal as seasonalSignalE } from "./rules.js";
const seasonAt = (x, dte = 30) => seasonalSignalE({ monthlyMean: Array(12).fill(x), monthN: Array(12).fill(16), monthSE: Array(12).fill(0.4) }, 6, dte);
import { fuseSignals } from "./signals.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s) => { if (!h.includes(s)) throw new Error(`missing ${JSON.stringify(s)}`); };
const hasnt = (h, s) => { if (h.includes(s)) throw new Error(`should not contain ${JSON.stringify(s)}`); };
const app = readFileSync("src/App.jsx", "utf8");
const header = app.slice(app.indexOf("{/* Header */}"), app.indexOf("{/* ONE TICKER'S STRIP"));

check("TASK 1 — no ticker select in the header; one Refresh for every selected market; Settings is one gear", () => {
  hasnt(header, "<select");
  has(header, "for (const tk of find.markets) await refreshChain(tk, true)");
  has(header, 'aria-label="Settings"');
  hasnt(header, '"Light" : "Dark"');            // the theme toggle moved into Settings
  has(app, 'aria-label="Market for this trade"'); // Build's selector, beside the trade
});

check("TASK 1 — the bar reads 'N markets · prices Xm ago', the OLDEST, and an unloaded market is counted", () => {
  const ago = (t) => `${Math.round((Date.parse("2026-10-02T15:00:00Z") - t) / 60000)}m ago`;
  const chains = { CORN: { updated: "2026-10-02T14:55:00Z" }, GLD: { updated: "2026-10-02T14:48:00Z" } };
  if (findFreshness(["CORN", "GLD"], chains, ago).line !== "2 markets · prices 12m ago") throw new Error(findFreshness(["CORN", "GLD"], chains, ago).line);
  if (findFreshness(["CORN", "GLD", "UNG"], chains, ago).line !== "3 markets · prices 12m ago · 1 not loaded") throw new Error("missing not counted");
  if (findFreshness(["UNG"], {}, ago).line !== "1 market · prices not loaded") throw new Error("nothing loaded is not fresh");
  // No single-chain message on Find: the per-market refresh is silent.
  has(app, "One Refresh for every selected market, quietly");
});

check("TASK 2 — no EvidenceBar on Find; Build's bar is headed 'About this trade · <TK> <structure>'", () => {
  has(app, 'tab === "build" && !showSettings && step === "build" && (\n          <EvidenceBar');
  has(app, "heading={`About this trade · ${ticker}");
  const h = renderToStaticMarkup(<EvidenceBar items={[{ id: "why", label: "Why this market" }]} heading="About this trade · CORN Bull Call Spread" />);
  has(h, "About this trade · CORN Bull Call Spread");
  // A card's badge and its fold open evidence for THE CARD's market, and remember the card for Back.
  has(app, "onClick={() => { scrollToCard.current = x.key; setWhyTk(x.tk); setWhyDte(x.dte); setEv(\"why\"); }}");
  has(app, "onMore={(x) => { scrollToCard.current = x.key; setWhyTk(x.tk); setEv(\"more\"); }}");
  has(readFileSync("src/card.jsx", "utf8"), "More on {more.tk}: levels · history");
  has(app, 'if (step !== "find" || ev || !scrollToCard.current) return;');
});

check("TASK 3 — the sheet: '<TK> this month', the market not this trade; one verdict line, two ⓘ, one sentence, the narrative folded", () => {
  has(app, 'title={ev === "why" ? `${whyTk || ticker} this month`');
  has(app, 'sub={ev === "why" ? "the market, not this trade"');
  const f = fuseSignals({ ticker: "GLD", month: 6, now: Date.UTC(2025, 6, 15), season: seasonAt(2), newsItems: [], bars: null });
  const h = renderToStaticMarkup(<WhySheet fused={f} ticker="GLD" newsItems={[]} month={6} />);
  has(h, `score ${f.score > 0 ? "+" : ""}${f.score}`);
  has(h, `confidence ${f.confidence}`);
  if ((h.match(/ⓘ/g) || []).length !== 2) throw new Error("two ⓘ, beside score and confidence");
  has(h, 'aria-expanded="false"');
  has(h, "What this changes in Find");
  has(h, "The full reasoning");
  hasnt(h, "How these are worked out</div>");      // closed until tapped
  hasnt(h, f.narrative.slice(0, 40));              // the narrative is folded
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
