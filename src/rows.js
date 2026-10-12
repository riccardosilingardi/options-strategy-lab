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
// A ROW'S FIGURES ARE THE CARD'S TILES. `rowFigures()` (PR 63: three figures, always, plus the days) reads the same pieces
// the card reads — `sizedFigures()` for the risk, `futureFigures()` / `pastFigures()` / `chanceText()` / `returnText()` for
// the tiles — at the price that fills (`lf.aFill`, worked out by `listCardFigures()` in findGen). `figures.test.jsx` holds
// each of a row's figures equal to the card's tile for the same candidate under all five orders.
//
// Plain JS, no React: it is tested without a browser, like path.js and rules.js.
// ============================================================================
import { meetsRequest, sizedFigures, futureFigures, futureTile, pastFigures, pastTileText, chanceText, returnText, compareLabel,
  per100Value, ROW_FIGURE_WORDS, optimizeLabel, RULES, styleOf, STYLE_DEFAULT, DEFAULT_NET_SIDE, bindingFilterText,
  MARKET_CHANCE_ROW_WORD } from "./rules.js";
import { findOrderOf, findOrderCompare } from "./signals.js";

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
 * WHICH FILTER BINDS, AND ONE FIX (PR 66, task 66.2): "Style Cautious leaves out 5 markets · Loosen ›". Read from the same
 * `meetsRequest()` misses that dim the rows — no second filter. For each request control that is off its default (the
 * Style's two floors, Debit · Credit, the budget) it counts the dimmed markets that would fit if that one control alone
 * let them in: a market counts when at least one of its cards misses ONLY on that control. The one that leaves out the
 * most is named (ties: Style, then Debit · Credit, then the budget). The fix never passes the per-trade limit: the budget's
 * is the amount that lets those markets in, at most the limit (the capital under free sizing); a card over the limit gives
 * no budget fix and the line says so.
 *
 * @param items   findShown (every card of every market, in the owner's order)
 * @param request a `requestOf()` result
 * @param sizeOf  (cand) → the size the budget buys, or null
 * @returns null when nothing is dimmed or nothing one control can loosen; else
 *   { control: "style"|"side"|"size", count, text, fix: { label, patch } | null, overLimit: boolean }
 */
export function bindingFilter(items = [], request, sizeOf = () => null) {
  if (!request) return null;
  const rows = marketRows(items, request, sizeOf);
  const dimmed = new Set(rows.filter((r) => !r.fits).map((r) => r.tk));
  if (!dimmed.size) return null;
  const cards = (items || []).filter((x) => x && x.tk && dimmed.has(x.tk))
    .map((x) => ({ tk: x.tk, misses: meetsRequest(x.cand, request, sizeOf(x.cand)).misses }));
  const markets = (test) => new Set(cards.filter((c) => c.misses.length && c.misses.every(test)).map((c) => c.tk)).size;
  const tries = [];
  const style = styleOf(request);
  if (style !== STYLE_DEFAULT) {
    tries.push({ control: "style", count: markets((m) => m.control === "chance" || m.control === "return"),
      fix: { patch: { minChance: null, minReturn: null } }, style });
  }
  if (request.side && request.side !== DEFAULT_NET_SIDE) {
    tries.push({ control: "side", count: markets((m) => m.control === "side"), fix: { patch: { side: DEFAULT_NET_SIDE } }, side: request.side });
  }
  const amt = Number(request.amt);
  if (request.mode === "budget" && Number.isFinite(amt) && amt > 0) {
    const over = (m) => m.control === "size" && m.id === "budget" && m.need != null;
    const top = Number.isFinite(Number(request.riskCap)) ? Number(request.riskCap) : (Number.isFinite(Number(request.amtMax)) ? Number(request.amtMax) : null);
    const needs = cards.filter((c) => c.misses.length && c.misses.every(over)).map((c) => Math.max(...c.misses.map((m) => Number(m.need))));
    const within = needs.filter((n) => top == null || n <= top);
    if (needs.length) {
      const step = RULES.amountAskStep;
      const value = within.length ? Math.min(top == null ? Infinity : top, Math.ceil(Math.max(...within) / step) * step) : null;
      const count = value == null ? markets(over) : markets((m) => over(m) && Number(m.need) <= value);
      tries.push({ control: "size", count, fix: value == null ? null : { patch: { amt: value } }, value, amt, mode: request.mode,
        overLimit: value == null });
    }
  }
  const best = tries.filter((t) => t.count > 0).sort((a, b) => b.count - a.count)[0];
  if (!best) return null;
  const words = bindingFilterText(best);
  return { control: best.control, count: best.count, text: words.text,
    fix: best.fix ? { label: words.fix, patch: best.fix.patch } : null, overLimit: !!best.overLimit };
}

/**
 * WHAT A ROW PRINTS (PR 63, owner 7 Oct 2026: "three figures, always: Chance · Return on risk · Avg per $100 at risk, plus
 * the days"). Each figure is the card's own — `chanceText()` and `returnText()` as the CHANCE and RETURN ON RISK tiles print
 * them, the FUTURE tile's per-$100 figure (`per100Value()`, its first line) — for the size the budget buys, at the price that
 * fills; the one the list is sorted by is `sorted` (ringed). Under "Past yrs" the PAST tile's text is added, ringed, so the
 * ring is always on the figure that decides the order. Then the days and the risk (YOU RISK).
 *
 * @param x     a findGen item ({ lf, expKey, dte })
 * @param size  the size the budget buys for its candidate, or null
 * @param order the Find order id ("ev", "evSignal", "chance", "rr", "past")
 * @returns {{ tile, items: [{ tile, value, word, sorted }], days, risk }} — `tile` is the sorted-by tile's key (CARD_LABELS)
 */
export function rowFigures(x, size, order) {
  const lf = x && x.lf ? x.lf : null;
  const af = lf ? lf.aFill : null;
  const n = size && size.ok ? size.n : null;
  const tile = findOrderOf(order).tile;
  const f = af ? sizedFigures(af, n) : null;
  const ff = lf ? futureFigures(lf.mc, af, n, x.expKey) : null;
  const items = [
    // PR 67 (owner's leaning, 12 Oct 2026: "yes, small"): the market's chance beside the model's, "74% chance · mkt 71%".
    // The sort stays on the model's (the ring is the tile's). Not read is a dash, never 0%.
    { tile: "chance", value: lf ? chanceText(lf.pop) : "—", word: ROW_FIGURE_WORDS.chance,
      extra: lf ? { word: MARKET_CHANCE_ROW_WORD, value: lf.mkt && lf.mkt.pop != null ? chanceText(lf.mkt.pop) : "—" } : null },
    { tile: "rr", value: lf && lf.rr != null ? returnText(lf.rr) : "—", word: ROW_FIGURE_WORDS.rr },
    { tile: "future", value: ff ? per100Value(ff.per100) : "—", word: ROW_FIGURE_WORDS.future },
  ];
  if (tile === "past") items.push({ tile: "past", value: lf ? pastTileText(pastFigures(lf.bt, af, n)) : "not read", word: null });
  return { tile, items: items.map((it) => ({ ...it, sorted: it.tile === tile })), days: x && x.dte != null ? x.dte : null,
    risk: f ? f.risk : null };
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
      // PR 67: both chances, labelled; the copilot reads them as the card prints them (grounding.js accepts any figure sent).
      chance: chanceText(x.lf.pop), chanceMarket: x.lf.mkt && x.lf.mkt.pop != null ? chanceText(x.lf.mkt.pop) : null, returnOnRisk: x.lf.rr == null ? null : returnText(x.lf.rr),
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

/**
 * OPTIMIZE'S RANKING (PR 65; owner 7 Oct 2026: "the best combination of duration and also of legs"). The candidates
 * `priceAlt()` read on Build (App.jsx) — the floors Find applies, the price that fills, the size the budget buys, the gate
 * at that size — put in the owner's Find order (`findOrderCompare()` on each one's `rank`, the very fields a Find card
 * sorts on), with the request applied as Find applies it (`meetsRequest()` at the size the budget buys). A candidate
 * fits when it meets the request AND the gate passes it at that size. Nothing is priced or simulated here.
 *
 * @param priced  [{ …alt, dte, cut?, cand, size, rank, gate, gateText, loaded }] — `cut` when a floor refused it
 * @param request a `requestOf()` result
 * @param order   the Find order id
 * @returns {{ checked, expiries, lo, hi, cut, fitting, missing, rows, anyFit, place }}
 *   rows   the first `max` that fit, each tagged O1…; when none fits, the first `max` that miss, each with its `reason`
 *   place  where the loaded trade sits: { rank, of, fits }, { cut: true }, or null when it is not among them
 */
export function rankOptimize(priced = [], request, order, { max = 5 } = {}) {
  const all = (priced || []).filter(Boolean);
  const days = all.map((p) => p.dte).filter((d) => d != null && Number.isFinite(Number(d))).map(Number);
  const cmp = findOrderCompare(order);
  const read = all.filter((p) => !p.cut).map((p) => {
    const misses = meetsRequest(p.cand, request, p.size).misses;
    const gateOk = !!(p.gate && p.gate.pass);
    // Its reason, in the request's own short words, then the gate's line when that is what stops it.
    const reason = misses.length ? misses.map((m) => m.short).join(" · ") : gateOk ? null : p.gateText || null;
    return { ...p, misses, reason, fits: !misses.length && gateOk };
  }).sort((a, b) => cmp(a.rank, b.rank));
  const fit = read.filter((p) => p.fits);
  const rows = (fit.length ? fit : read).slice(0, max).map((p, i) => ({ ...p, tag: optimizeLabel(i + 1) }));
  const loaded = all.find((p) => p.loaded) || null;
  const place = !loaded ? null : loaded.cut ? { cut: true }
    : fit.includes(read.find((p) => p.loaded)) ? { rank: fit.findIndex((p) => p.loaded) + 1, of: fit.length, fits: true } : { fits: false };
  return { checked: all.length, expiries: new Set(all.map((p) => p.expKey)).size, lo: days.length ? Math.min(...days) : null,
    hi: days.length ? Math.max(...days) : null, cut: all.length - read.length, fitting: fit.length, missing: read.length - fit.length,
    rows, anyFit: fit.length > 0, place };
}
