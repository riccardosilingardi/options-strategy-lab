// ============================================================================
// scripts/crossing-fixtures.jsx — EVERY FIXTURE CANDIDATE, AND WHAT CROSSING
// ITS MARKET COSTS AGAINST WHAT IT CAN MAKE (ROADMAP PR #39).
//
// One home for the fixture candidates, read by two things:
//   - `scripts/measure-crossing.mjs`, which prints the table for the PR, and
//   - `src/crossing.test.jsx`, which holds the done-when condition on them.
//
// The chain fixtures go through `shortlistWithFloors()` from App.jsx — the real
// generation site, not a copy of it — so every figure here is the figure the
// Shortlist would have judged. The hand fixtures are the owner's own readings,
// judged by the same `qualityFloor()` with the maximum profit at `fillNet()`.
//
// Nothing here is a live chain. The UNG board is Alpaca-SHAPED with synthetic
// bytes (see its `_capture` note); the S=100 board is the model's own marks.
// ============================================================================
import { readFileSync } from "node:fs";
import { shortlistWithFloors, analyze } from "../src/App.jsx";
import { scaleStrategy } from "../src/pro.jsx";
import { normaliseAlpacaChain, expiryStrikes, expiryOpenInterest } from "../src/chain.js";
import { RULES, comboBook, fillNet, openLimitPrice, qualityFloor, rewardRisk, openableBoard,
  chanceOf, seasonalProvenance } from "../src/rules.js";

const SENTIMENTS = ["verybear", "bear", "neutral", "bull", "verybull"];
const quotesOf = (a) => (a?.legPx || []).map((l) => ({ bid: l.bid, ask: l.ask }));

/* THE OPENING LIMIT AS IT WAS BEFORE 0a, for the audit only: `mid + dir ×
   allowance`, which on a credit asks for MORE than the mid. Never used to
   judge anything — it is here so the report can say what moved. */
export const oldOpenNet = (mid, spread, slippage = RULES.openLimitSlippage) => {
  const dir = Math.sign(mid) || 1;
  const c = mid + dir * Math.max(0, spread) * slippage;
  return Math.abs(c) >= 0.01 ? +c.toFixed(4) : dir * 0.01;
};

/* 1. The S=100 board from ceiling.test.jsx: marks off the model, 10-cent
   markets, 500 contracts open on every leg. */
const MODEL_C = { 90: 11.396, 95: 7.536, 100: 4.471, 105: 2.556, 110: 1.384, 115: 0.719 };
const MODEL_P = { 90: 0.898, 95: 2.010, 100: 3.918, 105: 6.975, 110: 10.775, 115: 15.083 };
const mark = (px) => ({ mid: px, bid: px - 0.05, ask: px + 0.05, iv: 0.3, oi: 500, vol: 10 });
export const MODEL_BOARD = {
  id: "S100-model", ticker: "SPY", S: 100, step: 5, strikes: [90, 95, 100, 105, 110, 115], dte: 45, iv: 0.3,
  q: (leg) => { const px = (leg.type === "put" ? MODEL_P : MODEL_C)[leg.strike]; return px == null ? null : mark(px); },
  peers: null,
};

/* 2. The Alpaca-shaped UNG board (src/fixtures), every expiry the gate would
   open on, read with a fixed clock so the DTE is the same next month. */
export function ungBoards() {
  const RAW = JSON.parse(readFileSync("src/fixtures/alpaca-chain-UNG.json", "utf8"));
  const S = RAW._capture?.underlying_last_trade ?? 13.24;
  const c = normaliseAlpacaChain("UNG", RAW, { spot: S, now: Date.parse("2026-09-02T12:00:00Z") });
  return c.expirations.filter((e) => openableBoard(c.byExp[e].dte)).map((ek) => ({
    id: `UNG-${ek}`, ticker: "UNG", S, step: 0.5, strikes: expiryStrikes(c, ek), dte: c.byExp[ek].dte, iv: 0.48,
    q: (leg) => c.byExp[ek][leg.type === "call" ? "calls" : "puts"][leg.strike] || null,
    peers: expiryOpenInterest(c, ek),
  }));
}

/* 3. The owner's own readings — one structure each, legs and quotes only. */
const HAND = [
  { id: "XLE-2026-10-30 (owner, 23 Sep)", ticker: "XLE", name: "Bull Put Spread (credit) 60/57", S: 61.5, dte: 37, iv: 0.25,
    legs: [{ side: -1, qty: 1, type: "put", strike: 60 }, { side: 1, qty: 1, type: "put", strike: 57 }],
    quotes: [{ bid: 1.22, ask: 1.27 }, { bid: 0.49, ask: 0.53 }] },
  { id: "UNG-2026-10-23 (owner, 20 Sep)", ticker: "UNG", name: "Bull Call Spread 10.50/11.00", S: 10.42, dte: 33, iv: 0.55,
    legs: [{ side: 1, qty: 1, type: "call", strike: 10.5 }, { side: -1, qty: 1, type: "call", strike: 11.0 }],
    quotes: [{ bid: 0.43, ask: 0.53 }, { bid: 0.29, ask: 0.39 }] },
  { id: "SOYB-2026-11-20 (owner)", ticker: "SOYB", name: "Bull Call Spread 28/29", S: 27.64, dte: 60, iv: 0.20,
    legs: [{ side: 1, qty: 1, type: "call", strike: 28 }, { side: -1, qty: 1, type: "call", strike: 29 }],
    quotes: [{ bid: 0.34, ask: 0.70 }, { bid: 0.10, ask: 0.30 }] },
];

const FLAT = seasonalProvenance(null, Array(12).fill(0), "fixture");

/** The figures one candidate carries, at the old fill, the new fill and the mid. */
function figures({ legs, S, dte, iv, q, a }) {
  const quotes = quotesOf(a);
  const book = comboBook(legs, quotes);
  const at = (net) => (Number.isFinite(net) ? analyze(legs, S, dte, iv, q, { net }) : null);
  const newNet = fillNet(legs, quotes);
  const oldNet = book.ok ? oldOpenNet(book.mid, book.spread) : null;
  const aNew = at(newNet), aOld = at(oldNet);
  const pop = (x, net) => (x ? chanceOf({ legs, entryNet: net, spot: S, iv, dte, seasonal: FLAT, month: 8 })?.pop ?? null : null);
  const size = (x) => { const s = x ? scaleStrategy(x, "budget", 500) : null; return s && s.ok ? s.n : 0; };
  return {
    book, credit: book.ok ? book.mid < 0 : a.entry < 0,
    crossingCost: book.ok ? book.spread * 100 : null,
    newNet, oldNet,
    maxProfitNew: aNew ? aNew.maxProfit : null, maxProfitOld: aOld ? aOld.maxProfit : null,
    maxLossNew: aNew ? aNew.maxLoss : null, maxLossOld: aOld ? aOld.maxLoss : null,
    rrNew: aNew ? rewardRisk(aNew.maxProfit, aNew.maxLoss) : null,
    rrOld: aOld ? rewardRisk(aOld.maxProfit, aOld.maxLoss) : null,
    popNew: pop(aNew, newNet), popOld: pop(aOld, oldNet),
    sizeNew: size(aNew), sizeOld: size(aOld),
  };
}

/**
 * Every fixture candidate that reached the quality floors, with its verdict
 * (`qf`), whether it would be shown, and its figures at the old and new fill.
 */
export function fixtureCandidates() {
  const out = [];
  for (const b of [MODEL_BOARD, ...ungBoards()]) {
    for (const sent of SENTIMENTS) {
      const r = shortlistWithFloors(sent, b.S, b.step, b.strikes, b.dte, b.iv, b.q, { peers: b.peers });
      const push = (name, legs, a, qf, why, shown) => out.push({
        fixture: b.id, sentiment: sent, name, legs, a, qf, why, shown,
        ...figures({ legs, S: b.S, dte: b.dte, iv: b.iv, q: b.q, a }),
      });
      for (const row of r.rows) push(row.p.name, row.p.legs, row.a, row.qf, null, true);
      // Cut entries that reached the floors carry their verdict, legs and
      // analysis; one refused before the floors (unpriceable, model,
      // impossible) has no verdict and no crossing to report.
      for (const c of r.cut) if (c.qf) push(c.name, c.legs, c.a, c.qf, c.why, false);
    }
  }
  for (const h of HAND) {
    const q = (leg) => { const i = h.legs.indexOf(leg); const x = h.quotes[i]; return x ? { ...x, mid: (x.bid + x.ask) / 2 } : null; };
    const a = analyze(h.legs, h.S, h.dte, h.iv, q);
    const f = figures({ legs: h.legs, S: h.S, dte: h.dte, iv: h.iv, q, a });
    const qf = qualityFloor({ openInterest: [null, null], quotes: h.quotes, legs: h.legs,
      maxProfit: a.maxProfit, maxLoss: a.maxLoss, unboundedProfit: a.profitUnbounded, maxProfitAtFill: f.maxProfitNew });
    const why = qf.pass ? null : !qf.liquidity.pass ? "liquidity" : !qf.spread.pass ? "spread"
      : !qf.comboSpread.pass ? "comboSpread" : !qf.crossing.pass ? "crossing" : "reward";
    out.push({ fixture: h.id, sentiment: "hand", name: h.name, legs: h.legs, a, qf, why, shown: qf.pass, ...f });
  }
  return out;
}

/** Candidates whose crossing floor was actually measured. */
export const measured = (cands) => cands.filter((c) => c.qf && c.qf.crossing.checked);

/**
 * How many a share would remove, two ways: of every measured candidate, and of
 * those that cleared EVERY OTHER floor — the ones this floor alone decides.
 */
export function removedAt(cands, share) {
  const m = measured(cands);
  const fails = (c) => !(c.qf.crossing.maxProfit > 0) || c.qf.crossing.cost / c.qf.crossing.maxProfit > share;
  const others = (c) => c.qf.liquidity.pass && c.qf.spread.pass && c.qf.comboSpread.pass && c.qf.reward.pass;
  return {
    share, measured: m.length,
    removed: m.filter(fails).length,
    removedAlone: m.filter((c) => others(c) && fails(c)).length,
    clearedOthers: m.filter(others).length,
  };
}
