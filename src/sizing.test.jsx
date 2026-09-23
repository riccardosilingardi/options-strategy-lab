// ============================================================================
// src/sizing.test.jsx — FREE SIZING, ON THE SCREENS AND IN THE RECORD
// (PR #41, TASK 4; owner decision, 23 Sep 2026).
//
// The gate half is in riskGate.test.js. This holds what the owner reads: the
// confirm step's two size rows, the Journal field and the weekly report's
// P&L split by it.
// ============================================================================
import { evaluateTrade } from "./riskGate.js";
import { gateChecklist } from "./wizard.jsx";
import { journalEntry } from "./journal.js";
import { pnlBySizing, pnlBySizingLine, buildReportMd } from "./pro.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const has = (h, s) => { if (!String(h).includes(s)) throw new Error(`missing "${s}" in "${String(h).slice(0, 200)}"`); };
const hasNot = (h, s) => { if (String(h).includes(s)) throw new Error(`should not contain "${s}"`); };

const PAPER = { account_number: "PA3XYZ01", paperVerified: true };
const CAPITAL = { tradingCapital: 5000, concurrentTarget: 4 };
const BIG = { ticker: "SLV", intent: "open", dte: 58, contracts: 4,
  legs: [{ side: 1, qty: 1, type: "put", strike: 58 }, { side: -1, qty: 2, type: "put", strike: 55 }, { side: 1, qty: 1, type: "put", strike: 51 }],
  maxLoss: -143, maxProfit: 257 };
const BOOK = { positions: [{ maxLoss: -300, contracts: 2 }], account: PAPER };

check("CONFIRM STEP, FLAG OFF: the two size rows quote the limits, exactly as before", () => {
  const r = evaluateTrade({ proposal: BIG, portfolio: BOOK, capital: CAPITAL });
  const rows = gateChecklist(r, BIG);
  const per = rows.find((x) => x.id === "per-trade"), tot = rows.find((x) => x.id === "total");
  eq(per.ok, false, "$572 is over the $250 limit");
  has(per.text, "per-trade limit");
  has(tot.text, "against a ceiling of");
});

check("CONFIRM STEP, FLAG ON: both rows tick and say no limit was applied — never quote one", () => {
  const r = evaluateTrade({ proposal: BIG, portfolio: BOOK, capital: CAPITAL, sizingFree: true });
  eq(r.pass, true, "nothing refused on size");
  const rows = gateChecklist(r, BIG);
  const per = rows.find((x) => x.id === "per-trade"), tot = rows.find((x) => x.id === "total");
  eq(per.ok, true, "per-trade"); eq(tot.ok, true, "total");
  has(per.text, "$572 at risk"); has(per.text, "Free sizing is on");
  has(tot.text, "$600 is already at risk"); has(tot.text, "no ceiling is applied");
  hasNot(per.text, "$250"); hasNot(tot.text, "ceiling of");
  eq(rows.find((x) => x.id === "paper").ok, true, "the paper row is untouched");
});

check("THE JOURNAL KEEPS sizingFree: true only when the position said so", () => {
  eq(journalEntry({ pos: { id: 1, sizingFree: true } }).sizingFree, true, "free");
  eq(journalEntry({ pos: { id: 2, sizingFree: false } }).sizingFree, false, "limits");
  eq(journalEntry({ pos: { id: 3 } }).sizingFree, false, "an older record, before the flag");
});

check("THE WEEKLY REPORT SPLITS P&L BY IT, and a figure never read stays out of both", () => {
  const J = [
    { id: 1, ref: "J-0101", pnl: 120, closeOrderId: "a", sizingFree: true },
    { id: 2, ref: "J-0102", pnl: -80, closeOrderId: "b", sizingFree: true },
    { id: 3, ref: "J-0103", pnl: 45, closeOrderId: "c", sizingFree: false },
    { id: 4, ref: "J-0104", pnl: null, pnlNote: "not read from a fill", sizingFree: false },
  ];
  const s = pnlBySizing(J);
  eq(s.free.total, 40, "free"); eq(s.free.counted, 2, "free count");
  eq(s.limits.total, 45, "limits"); eq(s.limits.counted, 1, "limits count"); eq(s.limits.excluded, 1, "the unread one");
  const line = pnlBySizingLine(s);
  has(line, "free sizing $40 over 2 closed");
  has(line, "within the limits $45 over 1 closed (1 with no fill figure left out)");
  eq(pnlBySizingLine(pnlBySizing([])), "**P&L by sizing:** free sizing nothing closed · within the limits nothing closed", "empty");
  const md = buildReportMd({ store: { positions: [], journal: J, settings: {} }, scan: [], news: [] }, [], null);
  has(md, "**P&L by sizing:**");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
