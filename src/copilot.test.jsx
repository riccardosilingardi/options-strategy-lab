// src/copilot.test.jsx — THE COPILOT, BY PLACE (redesign PR 3, TASK 0c; owner, 6 Oct 2026).
//
// "It depends where it is. In Find, a preset analyses the cards and, under the filters set, makes objective comparisons
// that highlight or suggest the best strategy. In Build it explains the strategy. In Positions it analyses the
// position, the exit strategy, where you started from." PR 4 (owner, 6 Oct 2026): the app builds, the copilot explains
// and recommends ONLY among what the app built, the person decides, the gate checks. Every question in SKILLS (pro.jsx,
// the one home) names its place and opens with that place's role; a screen shows only its own place's questions.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SKILLS, COPILOT_ROLE, BUILD_VERDICTS, BUILD_SKILL_IDS, POSITION_SKILL_IDS, skillsFor } from "./pro.jsx";
import { compareCards } from "./rows.js";
import { positionActions, POSITION_ACTIONS, sinceEntry } from "./positionView.js";
import { FactorRows } from "./why.jsx";
import { MARKET_TABS, factorHeadline, findCopilotLine } from "./rules.js";

const ok = [], bad = [];
const check = (name, fn) => { try { fn(); ok.push(name); console.log(`  ok   ${name}`); } catch (e) { bad.push(name); console.log(`  FAIL ${name}\n       ${e.message}`); } };
const has = (h, s, what = "") => { if (!String(h).includes(s)) throw new Error(`${what} missing ${JSON.stringify(s)}`); };
const hasNot = (h, s, what = "") => { if (String(h).includes(s)) throw new Error(`${what} should not contain ${JSON.stringify(s)}`); };
const eq = (a, b, m = "") => { if (a !== b) throw new Error(`${m} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const byId = (id) => SKILLS.find((s) => s.id === id);

console.log("\nThe copilot, by place (redesign PR 3; PR 4)\n");

check("EVERY QUESTION NAMES ITS PLACE AND OPENS WITH THAT PLACE'S ROLE; the old desk place is gone", () => {
  for (const s of SKILLS) {
    if (!["find", "market", "build", "positions"].includes(s.place)) throw new Error(`${s.id}: no place (${s.place})`);
    has(s.prompt, COPILOT_ROLE[s.place], s.id);
  }
  if (!BUILD_SKILL_IDS.every((id) => byId(id) && byId(id).place === "build")) throw new Error("Build's are not Build's");
  if (!POSITION_SKILL_IDS.every((id) => byId(id) && byId(id).place === "positions")) throw new Error("the position's are not Positions'");
  eq(skillsFor("find").map((s) => s.label).join(" | "), "Compare the cards | News impact");
  eq(skillsFor("market").map((s) => s.label).join(" | "), "News impact");
});

check("EVERY ROLE: recommend only among what the app built or offers; never a strike, an expiry, a size or an order of its own", () => {
  has(COPILOT_ROLE.find, "one or two of the cards the app built"); has(COPILOT_ROLE.find, "never a structure, a strike, an expiry or a size");
  has(COPILOT_ROLE.find, "never an order");
  has(COPILOT_ROLE.market, "you recommend no trade");
  has(COPILOT_ROLE.build, "never change its strikes, its expiry or its size yourself"); has(COPILOT_ROLE.build, "never tell me to send it");
  has(COPILOT_ROLE.positions, "one of the actions the app offers for it (position.actionsOffered)");
  has(COPILOT_ROLE.positions, "never another action and never a size"); has(COPILOT_ROLE.positions, "never close or place anything yourself");
});

check("IN FIND IT COMPARES AND RECOMMENDS AMONG THE CARDS THAT FIT: the filters named, each card's figures and Greeks, the app's order", () => {
  const r = byId("radar");
  for (const w of ["Name the filters first", "you risk, max profit, chance, return on risk, future avg and past yrs", "its Greeks",
    "recommend the one card, at most two", "or say that none fits and which filter binds", "findFilters.order", "per-trade limit"]) has(r.prompt, w, "radar");
  has(byId("newsAll").prompt, "Recommend nothing from the news alone");
});

check("IN BUILD IT GIVES A VERDICT, NEVER THE GATE'S: Pre-trade analysis reads the gate back and ends on one of three readings", () => {
  const pre = byId("pretrade").prompt;
  has(pre, `exactly one of ${BUILD_VERDICTS.join(", ")}`); eq(BUILD_VERDICTS.join("|"), "CONFIRM|DOUBTS|DO NOT CONFIRM");
  has(pre, "never your own verdict on a check"); has(pre, "the gate's checks stand whatever you say"); has(pre, "do not suggest another size");
  has(pre, "review checklist in the context"); has(pre, "the size the app sized");
  has(byId("greeks").prompt, "Quote only the Greeks in the context"); has(byId("chart").prompt, "there are no bars");
});

check("IN POSITIONS IT REVIEWS AND RECOMMENDS ONE OF THE APP'S ACTIONS: five questions, the roll and the chart since entry among them", () => {
  eq(POSITION_SKILL_IDS.map(byId).map((s) => s.label).join(" | "), "Review this position | The exit from here | Should I roll it? | Since I opened it | The chart since I opened it");
  has(byId("posRoll").prompt, "when it is not offered, say why in the app's words and do not suggest one");
  has(byId("posRoll").prompt, "A candidate the gate refuses is never recommended");
  has(byId("variants").prompt, "A variant the gate refuses is never recommended");
  has(byId("posReview").prompt, "recommend one of the actions offered, or none");
  has(byId("posExit").prompt, "good-till-cancelled take-profit order");
  has(byId("posSince").prompt, "position.greeksAtEntry and position.greeksNow"); has(byId("posSince").prompt, "is said to be not recorded");
  has(byId("posChart").prompt, "position.sinceEntry");
  if (SKILLS.find((s) => s.id === "positions")) throw new Error("PR #38's HOLD / CLOSE / ROLL review is back");
});

check("THE ACTIONS OFFERED ARE THE SCREEN'S OWN: a working close offers Manage, never a second close; not held offers nothing to do", () => {
  const free = positionActions({ canKeep: true, hasTarget: true });
  eq(free.join(" | "), [POSITION_ACTIONS.keep, POSITION_ACTIONS.keepWhy, POSITION_ACTIONS.close, POSITION_ACTIONS.takeProfit].join(" | "));
  const working = positionActions({ working: true, canKeep: false, hasTarget: true });
  eq(working.includes(POSITION_ACTIONS.close), false, "never two working orders for one holding");
  eq(working.includes(POSITION_ACTIONS.manage), true);
  eq(positionActions({ notHeld: true }).join(), POSITION_ACTIONS.keep);
});

check("SINCE ENTRY: read from the bars on or after the opening; no bar after it is null, never a zero", () => {
  const bars = [{ time: "2026-09-20", close: 9 }, { time: "2026-09-25", close: 13 }, { time: "2026-10-01", close: 14 }, { time: "2026-10-02", close: 12.5 }];
  const r = sinceEntry(bars, "2026-09-25T14:00:00Z", 12.95, 13.24);
  eq(r.priceAtEntry, 12.95); eq(r.priceNow, 13.24); eq(r.highestCloseSince, 14); eq(r.lowestCloseSince, 12.5); eq(r.sessionsSince, 3);
  eq(sinceEntry(bars, "2026-11-01T00:00:00Z"), null); eq(sinceEntry([], "2026-09-25"), null); eq(sinceEntry(bars, null), null);
});

check("FIND'S COMPARE READS THE CARDS THAT FIT, IN ORDER, AT MOST 20, WITH THE CARD'S OWN FIGURES; the misses counted by reason", () => {
  const a = { maxLoss: -40, maxProfit: 60, profitUnbounded: false, greeks: { delta: 0.12, theta: 1.5, vega: -2 } };
  const item = (k, tk, fits) => ({ key: k, tk, name: "Bull Call Spread", legs: [{ side: 1, qty: 1, strike: 14, type: "call" }, { side: -1, qty: 1, strike: 15, type: "call" }],
    expKey: "2026-12-18", cand: { key: k, fits }, lf: { aFill: a, pop: 0.41, rr: 1.5, mc: null, bt: null } });
  const items = [item("a", "CORN", true), item("b", "UNG", false), ...Array.from({ length: 24 }, (_, i) => item(`c${i}`, "GLD", true))];
  const request = { mode: "budget", amt: 500, riskCap: 500 };
  const sizeOf = (c) => (c.fits ? { ok: true, n: 3, unit: 40, totProfit: 180 } : { ok: false, n: 0, unit: 900 });
  const r = compareCards(items, request, sizeOf);
  eq(r.cards.length, 20, "at most 20"); eq(r.fitting, 25); eq(r.misses.count, 1);
  eq(r.cards[0].ticker, "CORN"); eq(r.cards[0].rank, 1); eq(r.cards[1].ticker, "GLD", "the miss is not handed in");
  eq(r.cards[0].youRisk, 120); eq(r.cards[0].maxProfit, 180); eq(r.cards[0].chance, "41%"); eq(r.cards[0].returnOnRisk, "150%");
  eq(r.cards[0].greeks.deltaShares, 36); eq(r.cards[0].greeks.thetaPerDay, 5); eq(r.cards[0].greeks.vegaPerVolPoint, -6);
  eq(r.cards[0].legs, "+1 14C / -1 15C");
  eq(Object.values(r.misses.reasons).reduce((x, y) => x + y, 0) >= 1, true);
  has(findCopilotLine(20, 25), "first 20 of the 25 cards that fit"); has(findCopilotLine(3, 3), "the 3 cards that fit");
});

check("THE MARKET PAGE'S TABS SPEAK FOR THEMSELVES: Signals; each factor block's title says what it highlights; news opens its headlines", () => {
  eq(MARKET_TABS.map((t) => t.label).join(" · "), "Signals · Strategies · Chain");
  eq(MARKET_TABS[0].id, "overview", "nav.js keeps the id");
  eq(factorHeadline("NEWS", { dir: -1 }, "3 headlines"), "NEWS · pushes down · 3 headlines");
  eq(factorHeadline("WEATHER", { dir: 0, applies: false }), "WEATHER · does not apply here");
  const fused = { factors: ["seasonal", "news"], weights: { seasonal: 0.6, news: 0.4 },
    components: { seasonal: { dir: 1, arrow: "▲", strength: 62, why: "October rose in 9 of 12 years" }, news: { dir: -1, arrow: "▼", strength: 40, why: "two headlines lean down" } } };
  const news = [{ title: "EIA storage build above consensus", date: "2026-10-04", impacts: [{ tk: "UNG", dir: -1, why: "x" }] }];
  const h = renderToStaticMarkup(<FactorRows fused={fused} ticker="UNG" newsItems={news} newsExtra={<i>ASK</i>} />);
  has(h, "SEASONALITY · pushes up"); has(h, "NEWS · pushes down · 1 headline"); has(h, "The headlines ▾"); has(h, "<i>ASK</i>");
});

check("A SCREEN SHOWS ITS OWN PLACE'S QUESTIONS: Find's sheet, the market page's news fold, Build and a position's screen", () => {
  const find = readFileSync("src/find.jsx", "utf8"), market = readFileSync("src/market.jsx", "utf8"), build = readFileSync("src/build.jsx", "utf8");
  has(find, 'skills={skillsFor("find")}'); has(market, 'skills={skillsFor("market")}');
  hasNot(build, 's.place === "desk"', "the desk place is gone");
  for (const p of ["build", "positions", "find", "market"]) for (const s of skillsFor(p)) if (s.place !== p) throw new Error(`${s.id} leaked into ${p}`);
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) process.exit(1);
