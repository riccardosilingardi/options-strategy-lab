// Redesign PR 3, TASK 3 — one position, its own screen (the owner's board "PositionDetail"), rendered.
//
// The Details sheet (PR #44, TASK 2) became this screen. It is rendered here the way App.jsx hands it its figures, and
// what the board asks for is held in plain strings, no DOM library.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { PositionScreen, StatusBlock, AlpacaDetails, positionSkills } from "./positionScreen.jsx";
import { T } from "./theme.js";
import { takeProfitTarget, positionAction } from "./rules.js";
import { payoffBands } from "./visuals.jsx";
import { exitProgress, entryVsNow, positionTitle, positionSubLine, statusBadge, paysLine, exitPlanRows, turnedLine, recordRows,
  keepEntry, keptLine, screenHeadline, dayLabel } from "./positionView.js";
import { POSITION_SKILL_IDS, BUILD_SKILL_IDS, SKILLS } from "./pro.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, x, m) => { if (!s.includes(x)) throw new Error(`${m || "missing"}: "${x}" not in ${s.slice(0, 160)}…`); };
const hasNot = (s, x, m) => { if (s.includes(x)) throw new Error(`${m || "unexpected"}: "${x}" is in the markup`); };
const NOW = Date.parse("2026-10-05T14:00:00Z");

// J-0003 of the fixture book (scripts/book-fixture.js): CORN 14/15 bull call spread × 3, 0.80 debit, past the stop warning.
const snap = (score, factors) => ({ ready: true, waiting: [], failed: [], score, confidence: 80, agreement: "CONFLUENT", factors });
const P = { id: 2003, ref: "J-0003", ticker: "CORN", name: "Bull Call Spread", expKey: "2026-12-18", expiry: "2026-12-18T21:00:00.000Z",
  legs: [{ side: 1, type: "call", strike: 14, qty: 1 }, { side: -1, type: "call", strike: 15, qty: 1 }], entryNet: 0.8, entrySpot: 14.4,
  contracts: 3, openedAt: "2026-09-25T14:12:00.000Z", maxProfit: 20, maxLoss: -80, alpacaHeld: true,
  thesis: { pop: 0.44, signals: snap(32, { seasonal: { dir: 1, strength: 45 }, technical: { dir: 1, strength: 35 }, weather: { dir: 1, strength: 40 }, news: { dir: 0, strength: 0 } }) },
  timeline: [
    { seq: "J-0003·01", t: Date.parse("2026-09-25T14:12:00Z"), text: "SENT to Alpaca." },
    { seq: "J-0003·02", t: Date.parse("2026-09-25T14:13:00Z"), text: "Filled 3 of 3 at 0.80 debit." },
    { seq: "J-0003·03", t: Date.parse("2026-09-29T20:00:00Z"), text: "HOLD. Nothing to do: the exit plan is running." },
    { seq: "J-0003·04", t: Date.parse("2026-10-01T20:00:00Z"), text: "Price trend turned down." },
    { seq: "J-0003·05", t: Date.parse("2026-10-02T19:50:00Z"), text: "Stop warning reached. A warning, not an order." },
  ] };
const N = 3, PNL = -153, SPOT = 13.24;
const NOW_SIGNALS = snap(-20, { seasonal: { dir: -1, strength: 49 }, technical: { dir: -1, strength: 31 }, weather: { dir: 1, strength: 40 }, news: { dir: 0, strength: 0 } });

const vOf = (over = {}) => {
  const pnl = over.pnl === undefined ? PNL : over.pnl;
  const tp = takeProfitTarget({ legs: P.legs, maxProfit: P.maxProfit, maxLoss: P.maxLoss, entryNet: P.entryNet, contracts: N });
  const progress = exitProgress({ p: P, pnl, dteLeft: 74, tpTarget: tp, n: N, now: NOW });
  const act = over.act || positionAction({ slHit: true, pnl, dteLeft: 74 });
  const bands = payoffBands({ legs: P.legs, entryNet: P.entryNet, spot: SPOT });
  return {
    p: P, ref: P.ref, title: positionTitle(P), sub: positionSubLine(P), back: { label: "Positions", onClick: () => {} },
    status: { act, action: act.action, badge: statusBadge(act), pnl, progress, ref: P.ref, notes: act.notes || [],
      ruleLine: act.action === "HOLD" ? null : act.line, canKeep: act.action === "WARNING" || act.action === "CLOSE", onClose: () => {} },
    keep: { min: 12, onKeep: async () => ({ ok: true, seq: "J-0003·06" }) },
    closeNode: over.closeNode || null, workingNode: over.workingNode || null, fileNode: null,
    pays: { bands, bars: [], spot: SPOT, entrySpot: P.entrySpot, openedAt: P.openedAt, strikes: [14, 15],
      line: paysLine({ bands, spot: SPOT, ticker: "CORN", expKey: P.expKey, closed: true }), title: "CORN" },
    progress, plan: "Close at 50% of the maximum profit, or at 21 days to expiration.",
    ev: entryVsNow({ p: P, n: N, pnl, popNow: 0.27, nowSignals: NOW_SIGNALS }), entryDay: dayLabel(P.openedAt), nowDay: "now",
    timeline: P.timeline, onWholeRecord: () => {}, onAnalyse: () => {},
    details: { open: false, onOpen: () => {}, onClose: () => {}, d: { legsText: "+1 14C / −1 15C · 3 call spreads at Alpaca" } },
    copilot: { apiKey: "server", convo: { msgs: [], busy: false, err: null, partial: "" }, setConvo: () => {}, ctx: { ticker: "CORN" } },
    guardian: <div>GUARDIAN BODY</div>, fileKind: over.fileKind || "held", onFile: () => {},
  };
};
const screen = (over) => renderToStaticMarkup(<PositionScreen v={vOf(over)} />);

console.log("\nRedesign PR 3 — the position's own screen, rendered\n");

check("THE BOARD'S ORDER: back, ref, title, what to do now, where it pays, exit plan, entry vs now, record, the two buttons, copilot, the fold", () => {
  const h = screen();
  const order = [">Positions</span>", ">J-0003</span>", ">Bull call spread 14/15 · 18 Dec</h1>", "CORN · 3 call spreads · opened",
    "What to do now", "WHERE IT MAKES AND LOSES MONEY", "THE EXIT PLAN", "AT ENTRY VS NOW", "RECORD · LAST 4", "Analyse as a new trade",
    "Alpaca details", "ASK THE COPILOT ABOUT THIS POSITION", "Exit orders · the reason check"];
  let last = -1;
  for (const k of order) { const at = h.indexOf(k); if (at < 0) throw new Error(`${k} missing`); if (at < last) throw new Error(`${k} out of order`); last = at; }
  has(h, "GUARDIAN BODY", "the Guardian stays mounted in its fold (it logs on mount)");
});

check("WHAT TO DO NOW on a stop warning: the badge says which rule, the loss in violet, the sentence ends with its two answers", () => {
  const h = screen();
  has(h, ">WARNING · STOP LEVEL</span>");
  has(h, "-$153");
  has(h, `color:${T.violet}`, "a loss is violet");
  has(h, "Stop warning reached: -$153 against -$120. A warning, not an order: close it, or keep it and write why.");
  has(h, "About the rule", "the rule's whole sentence is behind its ⓘ");
  const close = h.slice(h.lastIndexOf("<button", h.indexOf(">Close at limit<")), h.indexOf(">Close at limit<"));
  has(close, `background:${T.action}`, "Close at limit: the action tone");
  has(h, ">Keep it, write why<");
  hasNot(h, `background:${T.red}`, "nothing on it is an error");
});

check("HOLD: no 'Keep it' (there is nothing to keep it against); Close at limit stays, quiet", () => {
  const h = screen({ pnl: 5, act: { action: "HOLD", line: "Nothing to do today: the exit plan is running.", notes: [] } });
  hasNot(h, "Keep it, write why");
  const close = h.slice(h.lastIndexOf("<button", h.indexOf(">Close at limit<")), h.indexOf(">Close at limit<"));
  has(close, "background:transparent");
  has(h, "Nothing to do today: the exit plan is running.");
});

check("THE CLOSE (order path 3, unchanged): its confirm replaces the two answers; a working close says so and offers Manage order", () => {
  const c = screen({ closeNode: <div data-close-confirm>CONFIRM</div> });
  has(c, "Closing at a limit, not at market. Check it, then send."); has(c, "CONFIRM"); hasNot(c, "Keep it, write why");
  const w = screen({ workingNode: <div data-working-close>Close working at $0.27 · 0 of 3</div> });
  has(w, "Close sent to Alpaca. The position stays here until it fills."); has(w, "data-working-close"); hasNot(w, ">Close at limit<");
});

check("KEEP IT, WRITE WHY: a timeline entry with the reason, and the line the screen shows after", () => {
  const act = positionAction({ slHit: true, pnl: PNL, dteLeft: 74 });
  const e = keepEntry({ reason: "  EIA storage on Thursday could turn it ", act, pnl: PNL, t: 1 });
  eq(e.type, "keep");
  eq(e.text, "Kept on WARNING at -$153, with this reason: “EIA storage on Thursday could turn it”.");
  eq(keptLine({ seq: "J-0003·06", reason: "EIA storage on Thursday could turn it", act }),
    "J-0003·06 filed: kept, “EIA storage on Thursday could turn it”. The stop warning stays on.");
  eq(screenHeadline({ mode: "keeping" }), "Keeping it is allowed. Say why, so the Journal can hold you to it.");
  const app = readFileSync("src/App.jsx", "utf8");
  const at = app.indexOf("const keepPosition = async");
  const body = app.slice(at, app.indexOf("\n  };", at));
  has(body, "if (PREVIEW) return { ok: false, message: PREVIEW_READ_ONLY }", "a preview keeps nothing (CLAUDE.md rule 6)");
  has(body, "appendTimeline(p, keepEntry(", "a timeline entry, not a new /api/state field");
  has(body, "CLOSE_REASON_MIN");
});

check("WHERE IT PAYS: one sentence from the payoff's own bands, and the price now against it", () => {
  const bc = payoffBands({ legs: P.legs, entryNet: 0.8, spot: SPOT });
  eq(paysLine({ bands: bc, spot: SPOT, ticker: "CORN", expKey: "2026-12-18", closed: true }), "Pays above $14.80 on 18 Dec. CORN closed at $13.24, $1.56 under that.");
  const bp = payoffBands({ legs: [{ side: 1, type: "put", strike: 15, qty: 1 }], entryNet: 1.6, spot: 14 });
  eq(paysLine({ bands: bp, spot: 14, ticker: "UNG", expKey: "2026-12-18" }), "Pays below $13.40 on 18 Dec. UNG is at $14.00, $0.60 over that.");
  const fly = payoffBands({ legs: [{ side: 1, type: "call", strike: 13, qty: 1 }, { side: -1, type: "call", strike: 14, qty: 2 }, { side: 1, type: "call", strike: 15, qty: 1 }], entryNet: 0.3, spot: 14 });
  if (!/^Pays between \$13\.30 and \$14\.70 on 18 Dec\. X is at \$14\.00, inside it\.$/.test(paysLine({ bands: fly, spot: 14, ticker: "X", expKey: "2026-12-18" }))) throw new Error("between");
  eq(paysLine({ bands: null }), null);
});

check("THE EXIT PLAN: three rows cut from exitProgress()'s own lines; a reached exit says so", () => {
  const rows = exitPlanRows(vOf().progress);
  eq(rows.map((r) => r.label).join(" · "), "Take profit · Time exit · Stop warning");
  eq(rows[2].value, "at -$120"); eq(rows[2].reached, true); eq(rows[2].tone, "warn");
  const h = screen();
  has(h, "Stop warning<span"); has(h, " · reached</span>");
});

check("AT ENTRY VS NOW: the card's names in sentence case, the turned factors marked, and how many turned", () => {
  const h = screen();
  for (const k of ["You risk", "Max profit", "Chance", "Return on risk", "Seasonality", "Price trend", "Weather", "News"]) has(h, `>${k}</span>`);
  eq((h.match(/data-turned="true"/g) || []).length, 2, "seasonality and the price trend turned; weather held; news was flat on both days");
  has(h, "2 of the 4 reasons you opened it have turned.");
  eq(turnedLine({ hasEntrySignals: false }, P).startsWith("The record has no reading of the four factors"), true);
});

check("RECORD · LAST 4: the newest first, each with its number and day; Whole record goes to the Journal", () => {
  const r = recordRows(P.timeline, 4);
  eq(r.length, 4); eq(r[0].when, "·05 2 Oct"); eq(r[3].when, "·02 25 Sep");
  has(screen(), "Whole record ›");
});

check("THE COPILOT ON A POSITION asks the three position questions and none of Build's; it explains, it never acts", () => {
  eq(positionSkills().map((s) => s.id).join(","), POSITION_SKILL_IDS.join(","));
  const h = screen();
  for (const s of positionSkills()) has(h, `>${s.label}</button>`);
  for (const id of BUILD_SKILL_IDS) hasNot(h, `>${SKILLS.find((s) => s.id === id).label}</button>`, `Build's ${id}`);
  has(h, "It explains this position; it never closes, rolls or opens anything.");
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "logAnalysis({ ...a, label: `${p.ref || p.ticker} · ${a.label}` })", "filed in the Journal, tagged with the ref");
  has(app, "Asked the copilot: “${a.label}”. The answer is in the Journal.", "and one line on the position's timeline");
});

check("ALPACA DETAILS is a sheet of the record's own rows, read-only: nothing in it can send an order", () => {
  const h = renderToStaticMarkup(<AlpacaDetails d={{ legsText: "+1 14C / −1 15C", expiresText: "2026-12-18", openedText: "25/09/2026",
    entryText: "a debit of $0.80 a combination, the broker's fill", pnl: -153, shareText: "-64% of the risk" }} />);
  for (const x of ["LEGS", "EXPIRES", "OPENED", "ENTRY PRICE", "PROFIT NOW", "-$153"]) has(h, x);
  hasNot(h, "<button");
  hasNot(screen(), "role=\"dialog\"", "closed at rest");
});

check("THE CARD'S CLOSE OPENS THIS SCREEN with the confirm open; the old Details sheet is gone", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  has(app, "onClose={() => { setDetailsId(p.id); prepareCardClose(p); }}");
  hasNot(app, "<PositionDetails");
  has(app, "{tab === \"positions\" && !showSettings && positionScreenNode}");
});

check("WCAG: every control is 44px tall and no text is under 12px", () => {
  const h = screen();
  for (const b of h.match(/<button\b[^>]*>/g) || []) {
    if (/aria-label="About /.test(b)) continue;   // the ⓘ atom: its own 44px floor is ui.test.jsx's
    if (!/min-height:44px|;height:44px/.test(b)) throw new Error(`button without a 44px floor: ${b.slice(0, 140)}`);
  }
  const small = [...h.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1])).filter((x) => x < 12);
  if (small.length) throw new Error(`text under 12px: ${small.join(", ")}`);
});

check("StatusBlock stands alone", () => {
  const v = vOf();
  has(renderToStaticMarkup(<StatusBlock s={v.status} keep={v.keep} />), "data-position-status");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [n, m] of bad) console.error(`FAILED: ${n}\n${m}`); process.exit(1); }
