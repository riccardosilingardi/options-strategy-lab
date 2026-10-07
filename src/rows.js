// ============================================================================
// src/rows.js — FIND, VERSION B: ONE ROW PER MARKET (redesign PR 1, TASK 2; owner's mockups, 4 Oct 2026).
//
// THE ROWS ARE A VIEW OF THE ONE SORTED LIST, NOT A SECOND LIST. `findGen` builds every candidate once (the chains,
// the floors, the exact chance) and `findShown` sorts them in the owner's order; this file only groups that
// array by market. No new ranking, no new simulation: a row's card is the market's FIRST card that fits the request
// in the chosen order, or — when none of its cards fits — its first card, and the row is a miss (quieter, the reason
// in place of the subtitle). Rows sit in the order of their card in the sorted list, so a miss stays in its place
// (CLAUDE.md "One sorted list").
//
// A ROW'S FIGURE IS THE CARD'S TILE. `rowFigure()` reads the same pieces the card reads — `sizedFigures()` for the
// risk, `futureFigures()` / `pastFigures()` / `chanceText()` / `returnText()` for the tile — at the price that fills
// (`lf.aFill`, worked out by `listCardFigures()` in findGen). `figures.test.jsx` holds a row's figure equal to the
// card's tile for the same candidate under all five orders.
//
// Plain JS, no React: it is tested without a browser, like path.js and rules.js.
// ============================================================================
import { meetsRequest, sizedFigures, futureFigures, futureTile, pastFigures, pastTileText, chanceText, returnText, compareLabel } from "./rules.js";
import { findOrderOf } from "./signals.js";

/**
 * One row per market, in the order of each row's card in `items` (already sorted by the caller).
 *
 * @param items   findShown: [{ key, tk, cand, lf, … }] in the chosen order
 * @param request a `requestOf()` result
 * @param sizeOf  (cand) → the size the budget buys (the same map the cards read), or null
 * @returns [{ tk, x, misses, fits, index, cards, fitting }]
 *   x        the item whose card the row shows
 *   misses   that card's misses ([] when it fits)
 *   fits     at least one of the market's cards fits
 *   index    where the row's card sits in `items`
 *   cards    how many cards the market has; fitting: how many of them fit
 */
export function marketRows(items = [], request, sizeOf = () => null) {
  const by = new Map();
  (items || []).forEach((x, index) => {
    if (!x || !x.tk) return;
    const misses = meetsRequest(x.cand, request, sizeOf(x.cand)).misses;
    let g = by.get(x.tk);
    if (!g) { g = { tk: x.tk, first: null, fit: null, cards: 0, fitting: 0 }; by.set(x.tk, g); }
    g.cards++;
    if (!g.first) g.first = { x, misses, index };
    if (!misses.length) { g.fitting++; if (!g.fit) g.fit = { x, misses, index }; }
  });
  return [...by.values()].map((g) => {
    const pick = g.fit || g.first;
    return { tk: g.tk, x: pick.x, misses: pick.misses, fits: !!g.fit, index: pick.index, cards: g.cards, fitting: g.fitting };
  }).sort((a, b) => a.index - b.index);
}

/** "N of M fit": how many rows fit and how many there are. */
export const rowCounts = (rows = []) => ({ n: rows.filter((r) => r.fits).length, m: rows.length });

/**
 * THE FIGURE A ROW PRINTS: the tile the list is sorted by, for the size the budget buys, and the risk — read exactly
 * as the card reads them (find.jsx's `renderItem`).
 *
 * @param x     a findGen item ({ lf, expKey })
 * @param size  the size the budget buys for its candidate, or null
 * @param order the Find order id ("ev", "evSignal", "chance", "rr", "past")
 * @returns {{ tile, value, risk }} — `tile` is the card tile's key (CARD_LABELS), `value` the text that tile prints
 */
export function rowFigure(x, size, order) {
  const af = x && x.lf ? x.lf.aFill : null;
  const n = size && size.ok ? size.n : null;
  const tile = findOrderOf(order).tile;
  const f = af ? sizedFigures(af, n) : null;
  let value = "—";
  if (x && x.lf) {
    if (tile === "future") value = futureTile(futureFigures(x.lf.mc, af, n, x.expKey)).value;
    else if (tile === "past") value = pastTileText(pastFigures(x.lf.bt, af, n));
    else if (tile === "chance") value = chanceText(x.lf.pop);
    else if (tile === "rr") value = x.lf.rr == null ? "—" : returnText(x.lf.rr);
  }
  return { tile, value, risk: f ? f.risk : null };
}

/**
 * WHAT A MARKET THAT IS NOT IN SAYS ON ITS ROW (redesign PR 1). Its chain still loading, its signals still being read
 * (the season, or the rest), failed, or no board far enough out. A market being read has no fused result and no rank
 * effect, as before: its row waits, after the rows that are in.
 *
 * @param tk the market
 * @param g  { loading: [tk], failed: [{tk, why}], noBoard: [tk] } from findGen
 * @param reading the market's `readiness[tk]` (`readingState()`), or null
 * @returns null when the market is in; else { state: "chain"|"season"|"waiting"|"failed"|"noBoard", why? }
 */
export function rowStateOf(tk, g = {}, reading = null) {
  if ((g.loading || []).includes(tk)) return { state: "chain" };
  const f = (g.failed || []).find((x) => x.tk === tk);
  if (f) return { state: "failed", why: f.why };
  if ((g.noBoard || []).includes(tk)) return { state: "noBoard" };
  if (reading && reading.reading) {
    const seasonLoading = (reading.waiting || []).includes("seasonal");
    return { state: seasonLoading ? "season" : "waiting" };
  }
  return null;
}

/**
 * WHAT FIND'S "COMPARE THE CARDS" HANDS THE COPILOT (PR 4, owner: "the cards that fit, in your order, up to 20").
 *
 * The cards that fit the request, in the order `items` already has (the owner's), at most `max`; each with the figures
 * its card prints — read through the same functions the card reads (`sizedFigures()`, `futureFigures()`,
 * `pastFigures()`, `chanceText()`, `returnText()`) — and its Greeks for the size the budget buys, from the analysis at
 * the price that fills (`lf.aFill`, `analyze()`'s own Greeks). Nothing is recomputed. The cards that miss are counted,
 * with how many miss for each reason (`meetsRequest()`'s own short words).
 *
 * PR 61: each card carries its label (C1…Cn, `compareLabel()`), the one the sheet's table prints and the copilot names it
 * by; `markets` counts the markets the fitting cards come from ("N cards from M markets fit": the sheet counts cards,
 * Find's summary line keeps counting rows).
 *
 * @returns {{ cards: object[], fitting: number, markets: number, misses: { count: number, reasons: object } }}
 */
export function compareCards(items = [], request, sizeOf, { max = 20, fitOnly = true } = {}) {
  const cards = [];
  const reasons = {};
  const tks = new Set();
  let fitting = 0, missN = 0;
  for (const x of items) {
    if (!x || !x.cand || !x.lf) continue;
    const size = sizeOf ? sizeOf(x.cand) : null;
    const { meets, misses } = meetsRequest(x.cand, request, size);
    if (!meets) {
      missN += 1;
      for (const m of misses) reasons[m.short] = (reasons[m.short] || 0) + 1;
      // THE TICKED CARDS (PR 61, `fitOnly: false`): the ones the person chose are compared whether they fit or not, and
      // a miss says so in the request's own short words.
      if (fitOnly) continue;
    } else fitting += 1;
    tks.add(x.tk);
    if (cards.length >= max) continue;
    const af = x.lf.aFill || null;
    const n = size && size.ok ? size.n : null;
    const k = n == null ? 1 : n;
    const f = af ? sizedFigures(af, n) : null;
    const g = af && af.greeks ? af.greeks : null;
    const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? +(Number(v)).toFixed(d) : null);
    cards.push({
      rank: cards.length + 1, label: compareLabel(cards.length + 1), ticker: x.tk, name: x.name || (x.cand && x.cand.name) || null, expiry: x.expKey || null,
      legs: (x.legs || (x.cand && x.cand.legs) || []).map((l) => `${l.side > 0 ? "+" : "-"}${l.qty || 1} ${l.strike}${l.type === "call" ? "C" : "P"}`).join(" / "),
      contracts: n,
      youRisk: f ? f.risk : null, maxProfit: f ? (f.unbounded ? "no ceiling" : f.profit) : null,
      chance: chanceText(x.lf.pop), returnOnRisk: x.lf.rr == null ? null : returnText(x.lf.rr),
      futureAvg: futureTile(futureFigures(x.lf.mc, af, n, x.expKey)).value,
      pastYrs: pastTileText(pastFigures(x.lf.bt, af, n)),
      // THE GREEKS FOR THE SIZE: delta in shares (× 100 × contracts), theta in dollars a day, vega in dollars per point of
      // volatility — `analyze()`'s own per-combination figures times the contracts, as Build's Numbers print them.
      ...(meets ? {} : { misses: misses.map((m) => m.short) }),
      greeks: g ? { deltaShares: num(Number(g.delta) * 100 * k, 0), thetaPerDay: num(Number(g.theta) * k, 0), vegaPerVolPoint: num(Number(g.vega) * k, 0) } : null,
    });
  }
  return { cards, fitting, markets: tks.size, misses: { count: missN, reasons } };
}
