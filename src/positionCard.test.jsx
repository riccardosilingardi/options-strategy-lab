// PR #44, TASKS 1, 2 and 7 — the Positions card and its Details sheet, rendered.
//
// Measured on J-0001 on the owner's phone, 2 Oct 2026: the card read HOLD with no profit, the red button in view
// said "Close and file" and sent nothing, and "Close at limit" was behind a fold. This renders the card the way the
// App lays it out and holds what the owner asked for in plain strings, no DOM library.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PositionCard } from "./positionCard.jsx";
import { T } from "./theme.js";
import { takeProfitTarget, positionAction } from "./rules.js";
import { exitProgress, entryVsNow, pnlShareOfRisk, positionTitle, cardSentence, pnlShareShort, positionMetaLine,
  exitLabels, waitingOrdersLine } from "./positionView.js";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (s, x, m) => { if (!s.includes(x)) throw new Error(`${m || "missing"}: "${x}" not in ${s.slice(0, 200)}…`); };
const hasNot = (s, x, m) => { if (s.includes(x)) throw new Error(`${m || "unexpected"}: "${x}" is in the markup`); };
const NOW = Date.parse("2026-10-02T12:00:00Z");

const J1 = { id: 1, ref: "J-0001", ticker: "GDX", name: "Imported from Alpaca", expKey: "2026-10-30", expiry: "2026-10-30",
  legs: [{ side: 1, type: "put", strike: 94, qty: 1 }], entryNet: 5, entrySpot: 100, contracts: 9,
  openedAt: "2026-09-22T14:00:00Z", maxProfit: 8900, maxLoss: -500, alpacaHeld: true, thesis: { pop: null },
  timeline: [{ t: NOW - 86400000, seq: "J-0001·01", text: "SENT to Alpaca — order 1234" }] };

const cardFor = (over = {}) => {
  const pnl = over.pnl === undefined ? 2925 : over.pnl;
  const n = 9;
  const tpTarget = takeProfitTarget({ legs: J1.legs, maxProfit: J1.maxProfit, maxLoss: J1.maxLoss, entryNet: J1.entryNet, contracts: n });
  const hit = pnl != null && pnl >= tpTarget.dollars;
  const act = over.act || positionAction({ tpHit: hit, pnl, dteLeft: 28, tpBasis: tpTarget.basis });
  const progress = exitProgress({ p: J1, pnl, dteLeft: 28, tpTarget, n, now: NOW });
  return renderToStaticMarkup(
    <ul><PositionCard p={J1} title={positionTitle(J1)} action={act.action}
      line={act.action === "HOLD" ? act.line : cardSentence({ act, pnl, progress, working: !!over.working })} notes={act.notes} pnl={pnl}
      shareText={pnlShareShort(pnlShareOfRisk(pnl, J1, n))} meta={positionMetaLine(J1)} labels={exitLabels(progress)}
      closeLabel="Close at limit" fileKind={over.fileKind || "held"} {...over.props}>{over.children}</PositionCard></ul>);
};

console.log("\nPR #44, redesign PR 3 — the Positions card on the owner's board, rendered\n");

check("J-0001 reads its badge first, then the ref, ticker and what Alpaca holds, the title, the profit and its share", () => {
  const h = cardFor();
  has(h, ">CLOSE</span>");
  has(h, "J-0001 · GDX · 9 puts", "sizeWords(), never contracts alone");
  has(h, ">Long put 94 · 30 Oct</button>", "the title is the structure's name, not 'Imported from Alpaca'");
  hasNot(h, "Imported from Alpaca");
  has(h, "+$2,925");
  has(h, "65% of risk");
  has(h, "Take profit reached: $2,925 of $2,250.", "the board's sentence, on the figures the action was decided on");
  if (h.indexOf(">CLOSE<") > h.indexOf("+$2,925")) throw new Error("the action word comes before the profit");
});

check("three exits in short words over 4px bars: take profit, time exit, stop", () => {
  const h = cardFor();
  has(h, "Take profit ✓"); has(h, "Time exit 7d"); has(h, "Stop -$2,250");
  eq((h.match(/height:4px/g) || []).length, 3, "three bars");
  has(h, `background:${T.green}`, "a take profit reached is a green bar");
});

check("THE ENTRY AGAINST NOW AND THE EXIT ORDERS LEFT THE CARD: they are on the position's own screen", () => {
  const h = cardFor();
  for (const k of ["YOU RISK", "AT ENTRY", "Exit orders", "Entry vs now"]) hasNot(h, k);
});

check("THE FOOT: Close at limit in the ACTION tone on CLOSE; Decide on a WARNING (amber); a quiet Details › on HOLD", () => {
  const closeH = cardFor();
  has(closeH, "Close at limit");
  const btn = (h, w) => h.slice(h.lastIndexOf("<button", h.indexOf(w)), h.indexOf(w));
  has(btn(closeH, "Close at limit"), `background:${T.action}`, "CLOSE: filled in the action tone");
  hasNot(btn(closeH, "Close at limit"), T.red, "CLOSE is not an error");
  const warnH = cardFor({ pnl: -2400, act: positionAction({ slHit: true, pnl: -2400, dteLeft: 28 }) });
  has(warnH, ">WARNING</span>");
  has(warnH, "Stop warning reached: -$2,400 against -$2,250. A warning, not an order: you decide.");
  has(btn(warnH, "Decide: close or keep ›"), `background:${T.amber}`);
  hasNot(warnH, "Close at limit", "a warning offers no close on the card: the decision is on the position's screen");
  const holdH = cardFor({ pnl: 100, act: { action: "HOLD", line: "Nothing to do today: the exit plan is running.", notes: [] } });
  has(holdH, ">HOLD</span>"); has(holdH, "Details ›"); hasNot(holdH, "Close at limit");
  has(holdH, 'aria-label="About hold"', "HOLD's sentence is behind its ⓘ");
  hasNot(holdH, "Nothing to do today", "…and not at rest");
  for (const h of [closeH, warnH, holdH]) hasNot(h, `background:${T.red}`);
});

check("A CLOSE WORKING: no close button at all — the foot is its one line and Manage order (PR #47)", () => {
  const h = cardFor({ working: true, props: { closeLabel: null, foot: <div data-working-close>Close working at $7.62 · 0 of 9</div> } });
  hasNot(h, "Close at limit"); hasNot(h, "Close order working");
  has(h, "The close is already working.");
  has(h, "data-working-close");
  hasNot(h, "Details ›", "the title opens the position's screen");
  has(h, "data-position-open");
});

check("FILE IN JOURNAL: only when the holding is gone (or never at a broker); no trash icon, no 'Close and file'", () => {
  for (const kind of ["held", "unknown"]) hasNot(cardFor({ fileKind: kind }), "File in Journal", `${kind}: not offered`);
  for (const kind of ["gone", "book"]) has(cardFor({ fileKind: kind }), "File in Journal", `${kind}: offered`);
  const h = cardFor({ fileKind: "gone" });
  hasNot(h, "Close and file");
  hasNot(h, "lucide-trash", "no trash icon");
});

check("THE TITLE opens the position's screen (a dialog button), and nothing says Monitor", () => {
  const h = cardFor();
  has(h, 'data-position-open="true" aria-haspopup="dialog"');
  hasNot(h, "Monitor");
});

check("WCAG: every button is 44px tall and no text is under 12px", () => {
  const h = cardFor({ fileKind: "gone" });
  const buttons = h.match(/<button\b[^>]*>/g) || [];
  if (buttons.length < 3) throw new Error(`expected the card's buttons, found ${buttons.length}`);
  for (const b of buttons) has(b, "min-height:44px", `button without a 44px floor: ${b.slice(0, 120)}`);
  const sizes = [...h.matchAll(/font-size:([\d.]+)px/g)].map((m) => Number(m[1]));
  if (!sizes.length) throw new Error("no font sizes found");
  const small = sizes.filter((x) => x < 12);
  if (small.length) throw new Error(`text under 12px: ${small.join(", ")}`);
});

check("TWO STACKS: numbers, tickers and symbols in mono, sentences in the sans stack", () => {
  const h = cardFor();
  has(h, "font-family:system-ui", "the action line is a sentence, in sans");
  has(h, "font-family:ui-monospace", "figures are mono");
  const sentence = h.slice(h.lastIndexOf("<p", h.indexOf("Take profit reached")), h.indexOf("Take profit reached"));
  has(sentence, "system-ui");
});

check("the card is a list item with a name a screen reader can say, and the title is a heading", () => {
  const h = cardFor();
  has(h, "<li aria-label=\"J-0001 Long put 94 · 30 Oct\"");
  has(h, "<h3");
});

check("an unknown profit is a dash and says so; it is not a $0", () => {
  const h = cardFor({ pnl: null, act: { action: null, line: "No quote: no broker price for this position right now, so no action can be read. It is not HOLD.", notes: [] } });
  has(h, "NO ACTION");
  has(h, "—");
  has(h, "no price right now");
  hasNot(h, "+$0");
});

check("THE LINE UNDER THE CARDS for an order sent and not filled; the card's helpers on unknowns", () => {
  const soyb = { ticker: "SOYB", legs: [{ side: -1, type: "put", strike: 13, qty: 1 }, { side: 1, type: "put", strike: 12, qty: 1 }] };
  eq(waitingOrdersLine([soyb], "Monday").join(""), "The SOYB put spread from Build is an order, not a position yet: it waits in Orders for Monday's open.");
  eq(waitingOrdersLine([soyb], null).join(""), "The SOYB put spread from Build is an order, not a position yet: it waits in Orders.");
  eq(waitingOrdersLine([], "Monday"), null);
  eq(pnlShareShort(null), null);
  eq(exitLabels(null).length, 0);
  eq(exitLabels({ takeProfit: { state: "none" }, time: { state: "unknown" }, stop: { state: "unknown" } }).map((l) => l.text).join(" · "),
    "Take profit — · Time exit — · Stop —", "unknown is a dash, never a zero");
});

// The Details sheet's tests moved with it to src/positionScreen.test.jsx (redesign PR 3: it is the position's own screen).

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [n, m] of bad) console.error(`FAILED: ${n}\n${m}`); process.exit(1); }
