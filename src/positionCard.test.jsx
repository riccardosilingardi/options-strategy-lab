// PR #44, TASKS 1, 2 and 7 — the Positions card and its Details sheet, rendered.
//
// Measured on J-0001 on the owner's phone, 2 Oct 2026: the card read HOLD with no profit, the red button in view
// said "Close and file" and sent nothing, and "Close at limit" was behind a fold. This renders the card the way the
// App lays it out and holds what the owner asked for in plain strings, no DOM library.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PositionCard, PositionDetails, EntryVsNow, ProgressLine } from "./positionCard.jsx";
import { T } from "./theme.js";
import { takeProfitTarget, positionAction } from "./rules.js";
import { exitProgress, entryVsNow, displayName, pnlShareOfRisk, pnlShareText } from "./positionView.js";

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
  return renderToStaticMarkup(
    <PositionCard p={J1} title={displayName(J1)} action={act.action} line={act.line} notes={act.notes} pnl={pnl}
      shareText={pnlShareText(pnlShareOfRisk(pnl, J1, n))}
      progress={exitProgress({ p: J1, pnl, dteLeft: 28, tpTarget, n, now: NOW })}
      ev={entryVsNow({ p: J1, n, pnl, popNow: 0.6, nowSignals: null })} unitNote="9 contracts, the whole position. Now is what is left from here."
      closeLabel="Close at limit" fileKind={over.fileKind || "held"} {...over.props}>{over.children}</PositionCard>);
};

console.log("\nPR #44 — the Positions card, rendered\n");

check("J-0001 reads CLOSE first, then the profit in dollars and as a share of the risk", () => {
  const h = cardFor();
  has(h, "CLOSE");
  has(h, "+$2,925");
  has(h, "+65% of the risk");
  has(h, "Take profit reached: 50% of the premium paid.");
  if (h.indexOf("CLOSE") > h.indexOf("+$2,925")) throw new Error("the action word comes before the profit");
  has(h, "GDX</span> · Long put 94 · 30 Oct", "the title is the structure's name, not 'Imported from Alpaca'");
  hasNot(h, "Imported from Alpaca");
});

check("three exit lines: time, take profit, stop warning", () => {
  const h = cardFor();
  has(h, "Time exit: 7 days left · 9 Oct");
  has(h, "Take profit: $2,925 of $2,250");
  has(h, "Stop warning: at -$2,250");
});

check("AT ENTRY VS NOW: the Find card's four labels in its order, then the four factors", () => {
  const h = cardFor();
  const order = ["RETURN ON RISK", "CHANCE", "PROFIT", "RISK", "SEASONALITY", "PRICE TREND", "WEATHER", "NEWS"];
  let last = -1;
  for (const k of order) {
    const at = h.indexOf(`>${k}</th>`);
    if (at < 0) throw new Error(`${k} row missing`);
    if (at < last) throw new Error(`${k} is out of order`);
    last = at;
  }
  has(h, "AT ENTRY"); has(h, "NOW");
  has(h, "—", "an unknown cell is a dash");
  has(h, "<th scope=\"row\"", "the table has row headers a screen reader can read");
});

check("CLOSE AT LIMIT IS THERE: primary in the ACTION tone on CLOSE (red is for errors, PR #47), secondary on HOLD", () => {
  const closeH = cardFor();
  const holdH = cardFor({ pnl: 100, act: { action: "HOLD", line: "Nothing to do today: the exit plan is running.", notes: [] } });
  for (const h of [closeH, holdH]) has(h, "Close at limit");
  const btn = (h) => h.slice(h.lastIndexOf("<button", h.indexOf("Close at limit")), h.indexOf("Close at limit"));
  has(btn(closeH), `background:${T.action}`, "CLOSE: filled in the action tone, the primary button");
  hasNot(btn(closeH), `background:${T.red}`, "CLOSE is not an error");
  hasNot(btn(holdH), `background:${T.red}`, "HOLD: not red");
  has(btn(holdH), "background:transparent", "HOLD: a secondary (ghost) button");
  hasNot(btn(holdH), `color:${T.red}`, "HOLD: not red text either");
});

check("A CLOSE WORKING: no close button at all — the card shows one line and Manage order instead (PR #47)", () => {
  const h = cardFor({ props: { closeLabel: null } });
  hasNot(h, "Close at limit"); hasNot(h, "Close order working");
  has(h, "Details");
});

check("FILE IN JOURNAL: only when the holding is gone (or never at a broker); no trash icon, no 'Close and file'", () => {
  for (const kind of ["held", "unknown"]) hasNot(cardFor({ fileKind: kind }), "File in Journal", `${kind}: not offered`);
  for (const kind of ["gone", "book"]) has(cardFor({ fileKind: kind }), "File in Journal", `${kind}: offered`);
  const h = cardFor({ fileKind: "gone" });
  hasNot(h, "Close and file");
  hasNot(h, "lucide-trash", "no trash icon");
});

check("DETAILS is a dialog button, and nothing says Monitor", () => {
  const h = cardFor();
  has(h, ">Details</button>");
  has(h, "aria-haspopup=\"dialog\"");
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
  const sentence = h.slice(h.lastIndexOf("<div", h.indexOf("Take profit reached")), h.indexOf("Take profit reached"));
  has(sentence, "system-ui");
});

check("the card is an article with a name a screen reader can say, and the title is a heading", () => {
  const h = cardFor();
  has(h, "<article aria-label=\"J-0001 Long put 94 · 30 Oct\"");
  has(h, "<h3");
});

check("an unknown profit is a dash and says so; it is not a $0", () => {
  const h = cardFor({ pnl: null, act: { action: null, line: "No quote: no broker price for this position right now, so no action can be read. It is not HOLD.", notes: [] } });
  has(h, "NO ACTION");
  has(h, "—");
  has(h, "no price right now");
  hasNot(h, "+$0");
});

check("the Guardian's fold is kept in the tree while closed (it logs a weakened reason on mount)", () => {
  const h = cardFor({ props: { guardian: <div>GUARDIAN BODY</div> } });
  has(h, "GUARDIAN BODY");
  has(h, " hidden");
  has(h, "aria-expanded=\"false\"");
});

check("DETAILS SHEET: legs, opened, entry price, profit, entry vs now, the picture, the exit plan, the timeline", () => {
  const ev = entryVsNow({ p: J1, n: 9, pnl: 2925, popNow: 0.6, nowSignals: null });
  const h = renderToStaticMarkup(
    <PositionDetails p={J1} title="Long put 94 · 30 Oct" onClose={() => {}} legsText="+1 94P · × 9 contracts"
      expiresText="2026-10-30" openedText="22/09/2026" entryText="a debit of $5.00 a combination, the broker's fill"
      pnl={2925} shareText="+65% of the risk" ev={ev} unitNote="note" spotNow={92.4} planSentence="Close at 50% of the premium paid, or at 21 days to expiration."
      planDetail="That is $2,250 of profit for 9." timeline={J1.timeline} onAnalyse={() => {}} fileKind="unknown" onFile={() => {}} />);
  for (const x of ["role=\"dialog\"", "+1 94P", "OPENED", "22/09/2026", "ENTRY PRICE", "+$2,925", "AT ENTRY VS NOW", "WHERE IT MAKES AND LOSES MONEY",
    "entry</text>", "THE EXIT PLAN", "TIMELINE", "J-0001·01"]) has(h, x);
  has(h, "Analyse as a new trade");
  has(h, "A Send there would open a second position.");
  has(h, "Closed it elsewhere? File it", "the quiet link, for the unknown case");
  const held = renderToStaticMarkup(<PositionDetails p={J1} title="x" onClose={() => {}} ev={ev} timeline={[]} fileKind="held" onAnalyse={() => {}} planSentence="p" planDetail="d" />);
  hasNot(held, "Closed it elsewhere?");
  hasNot(h, "ⓘ", "no tooltip glyph");
});

check("DETAILS SHEET is read-only: nothing in it can send an order", () => {
  const h = renderToStaticMarkup(<PositionDetails p={J1} title="x" onClose={() => {}} ev={entryVsNow({ p: J1 })} timeline={[]} fileKind="held" onAnalyse={() => {}} planSentence="p" planDetail="d" />);
  const labels = (h.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) || []).map((b) => b.replace(/<[^>]*>/g, "").trim());
  eq(JSON.stringify(labels), JSON.stringify(["Close", "Analyse as a new trade"]), "the only controls: leave the sheet, or go to Build");
  for (const x of ["Close at limit", "Cancel it", "GTC"]) hasNot(h, x);
});

check("EntryVsNow and ProgressLine stand alone", () => {
  has(renderToStaticMarkup(<ProgressLine line={{ text: "Take profit: $1 of $2", frac: 0.5, state: "ok" }} />), "width:50%");
  eq(renderToStaticMarkup(<EntryVsNow ev={null} />), "");
});

console.log(`\n${ok.length} passed, ${bad.length} failed`);
if (bad.length) { for (const [n, m] of bad) console.error(`FAILED: ${n}\n${m}`); process.exit(1); }
