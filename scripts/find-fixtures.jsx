// ============================================================================
// scripts/find-fixtures.jsx — THE 31 FIXTURE CARDS FIND WOULD PRINT (PR #45).
//
// One home for the fixture list, read by `scripts/measure-find.mjs` (the numbers in the PR) and by
// `src/find.test.jsx` (the conditions held on them). It is built the way `App.jsx`'s `findGen` builds a row:
// `shortlistWithFloors()` for the structures and the floors, `listCardFigures()` for the figures and the one
// chance, `candidateOf()` for the shape the request is held against — so nothing here is a second arithmetic.
//
// FIXTURES, NOT A LIVE CHAIN. The boards are `scripts/crossing-fixtures.jsx`'s: the model's own marks at S=100,
// and the Alpaca-shaped UNG board. The chance is drifted on a FLAT seasonal (twelve zeros) so it does not move with
// the month the test is run in.
// ============================================================================
import { shortlistWithFloors, listCardFigures } from "../src/App.jsx";
import { candidateOf } from "../src/path.js";
import { seasonalProvenance, seasonalStampFields, chanceDrawFields } from "../src/rules.js";
import { MODEL_BOARD, ungBoards } from "./crossing-fixtures.jsx";

export const DIRECTIONS = ["verybear", "bear", "neutral", "bull", "verybull"];
const FLAT = seasonalProvenance(null, "fixture");   // the season not read: the chance drifts at zero (PR #48)

/** Every card the five directions produce on the fixture boards, as Find's rows. */
export function findCards() {
  const out = [];
  for (const b of [MODEL_BOARD, ...ungBoards()]) {
    for (const sent of DIRECTIONS) {
      const r = shortlistWithFloors(sent, b.S, b.step, b.strikes, b.dte, b.iv, b.q, { peers: b.peers });
      for (const { p, a, aFill } of r.rows) {
        const lf = listCardFigures(p.legs, { spot: b.S, dte: b.dte, iv: b.iv, q: b.q, ticker: b.ticker, expKey: b.id,
          seasonal: FLAT, a, aFill });
        const cand = candidateOf({ name: p.name, legs: p.legs, a: aFill, pop: lf.pop, dte: b.dte, expKey: b.id,
          ...seasonalStampFields(lf.mc), ...chanceDrawFields(lf.mc) }, { ticker: b.ticker, spot: b.S, source: "find" });
        out.push({ key: cand.key, tk: b.ticker, board: b.id, sent, name: p.name, legs: p.legs, expKey: b.id, dte: b.dte,
          spot: b.S, lf, cand });
      }
    }
  }
  return out;
}
