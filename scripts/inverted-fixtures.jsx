// ============================================================================
// scripts/inverted-fixtures.jsx — INVERTED PAIRS, PER MARKET, ON THE FIXTURES,
// AND HOW MANY CARDS EACH RULE LABELS (PR #41, TASK 2).
//
// Read by two things:
//   - `scripts/measure-inverted.mjs`, which prints the table for the PR, and
//   - `src/status.test.jsx`, which holds the before/after on these boards.
//
// THE BOARDS:
//   1. UNG, every expiry the gate opens on — the Alpaca-shaped fixture in
//      src/fixtures (synthetic bytes, see its `_capture` note). Clean.
//   2. SYNTHETIC 30-pair boards, Black-Scholes marks with a smile, built here:
//        - "clean"      no pair inverted
//        - "SOYB shape" 2 of 30 pairs inverted — the owner's SOYB 2026-11-20
//                       count; WHERE they were on his board is not known, so
//                       one is near the money and one far out
//        - "BOIL shape" 6 of 30 inverted (20%) — the share read live on BOIL
//                       2026-10-09 (5 of 25)
//      None of these is a capture. They exist to show what each rule labels.
//
// BEFORE is main's rule: any inverted pair on the expiry labels every card on
// it. AFTER is PR #41's: a card is labelled only when a broken pair touches
// its own strikes, and the board is called stale once, at RULES.staleBoardShare.
// ============================================================================
import { shortlistWithFloors } from "../src/App.jsx";
import { monotonicityBreaks, invertedOnStrikes, expiryStrikes, expiryOpenInterest } from "../src/chain.js";
import { boardLooksStale } from "../src/rules.js";
import { bs, smile } from "../src/engine.js";
import { ungBoards } from "./crossing-fixtures.jsx";

const SENTIMENTS = ["verybear", "bear", "neutral", "bull", "verybull"];

/** A 16-strike board around S: 15 call pairs + 15 put pairs = 30. */
function synthChain(tk, S, strikes, dte, iv, invert = []) {
  const ek = "2026-11-20";
  const side = (type) => {
    const out = {};
    for (const k of strikes) {
      const mid = +bs(S, k, dte / 365, smile(iv, S, k), type).toFixed(3);
      out[k] = { mid, bid: Math.max(0.01, +(mid - 0.03).toFixed(2)), ask: +(mid + 0.03).toFixed(2), iv, oi: 500 };
    }
    return out;
  };
  const c = { spot: S, byExp: { [ek]: { dte, calls: side("call"), puts: side("put") } } };
  // INVERT A PAIR: the strike that should be cheaper is quoted 5 cents dearer.
  for (const { type, lower, upper } of invert) {
    const book = c.byExp[ek][type === "call" ? "calls" : "puts"];
    const [cheap, dear] = type === "call" ? [upper, lower] : [lower, upper];
    const mid = +(book[dear].mid + 0.05).toFixed(3);
    book[cheap] = { ...book[cheap], mid, bid: +(mid - 0.03).toFixed(2), ask: +(mid + 0.03).toFixed(2) };
  }
  return { chain: c, ek };
}

const STRIKES = Array.from({ length: 16 }, (_, i) => 24 + i * 0.5);   // 24 … 31.5
const SOYB_INV = [{ type: "call", lower: 28, upper: 28.5 }, { type: "put", lower: 24, upper: 24.5 }];
const BOIL_INV = [
  { type: "call", lower: 25, upper: 25.5 }, { type: "call", lower: 27.5, upper: 28 }, { type: "call", lower: 30, upper: 30.5 },
  { type: "put", lower: 24.5, upper: 25 }, { type: "put", lower: 27, upper: 27.5 }, { type: "put", lower: 29.5, upper: 30 },
];

/** Every fixture board, as Find reads one: chain, expiry, and the shortlist inputs. */
export function invertedBoards() {
  const out = [];
  for (const b of ungBoards()) {
    // ungBoards() hands `q`; the chain it came from is rebuilt from `q` for the scan.
    const ek = b.id.replace(/^UNG-/, "");
    const byExp = { calls: {}, puts: {} };
    for (const k of b.strikes) {
      const cq = b.q({ type: "call", strike: k }), pq = b.q({ type: "put", strike: k });
      if (cq) byExp.calls[k] = cq;
      if (pq) byExp.puts[k] = pq;
    }
    out.push({ id: `UNG ${ek} (fixture)`, tk: "UNG", chain: { spot: b.S, byExp: { [ek]: { dte: b.dte, ...byExp } } }, ek,
      S: b.S, step: b.step, dte: b.dte, iv: b.iv });
  }
  for (const [id, tk, inv] of [["clean (synthetic)", "SYN", []], ["SOYB shape, 2 of 30 (synthetic)", "SOYB", SOYB_INV],
    ["BOIL shape, 6 of 30 (synthetic)", "BOIL", BOIL_INV]]) {
    const { chain, ek } = synthChain(tk, 27.6, STRIKES, 58, 0.22, inv);
    out.push({ id, tk, chain, ek, S: 27.6, step: 0.5, dte: 58, iv: 0.22 });
  }
  return out;
}

/** Per board: pairs, breaks, stale, and how many cards each rule labels. */
export function invertedTable() {
  return invertedBoards().map((b) => {
    const m = monotonicityBreaks(b.chain, b.ek);
    const q = (leg) => b.chain.byExp[b.ek][leg.type === "call" ? "calls" : "puts"][leg.strike] || null;
    const peers = expiryOpenInterest(b.chain, b.ek);
    let cards = 0, before = 0, after = 0;
    for (const sent of SENTIMENTS) {
      const r = shortlistWithFloors(sent, b.S, b.step, expiryStrikes(b.chain, b.ek), b.dte, b.iv, q, { peers });
      for (const row of r.rows) {
        cards++;
        if (m.breaks > 0) before++;                                   // main: any pair, every card
        if (invertedOnStrikes(m, row.p.legs).length > 0) after++;     // PR #41: its own strikes
      }
    }
    return { id: b.id, tk: b.tk, ek: b.ek, pairs: m.pairs, breaks: m.breaks, share: m.share,
      stale: boardLooksStale(m), cards, before, after };
  });
}
