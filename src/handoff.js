// ============================================================================
// src/handoff.js — THE ONE WAY A TRADE REACHES THE BUILD SCREEN.
//
// Every "open this on Build" button in the app — the Shortlist's presets, the
// multi-market scan, "Monitor" on an open position, "Load" on a saved
// strategy, and the wizard taking a road — hands its trade over through
// `buildHandOff()`. Plain JS, no React: the same reason `rules.js` and
// `riskGate.js` are plain JS, so the decision can be tested without a browser.
//
// WHY THIS EXISTS. These buttons used to be written inline at each call site,
// and each one did roughly `setTicker(...); setLegs(...); setTab("build")`.
// From the Shortlist that looks like a button that does nothing:
//
//   · the user is ALREADY on the Build tab, so switching to it changes nothing
//     on screen;
//   · the open evidence panel (`ev`) stays expanded, and it is several
//     screens tall, so the Build section — which renders underneath it — lands
//     below the fold;
//   · some of them set a ticker whose option chain was never fetched, so the
//     Build screen has no `spot` and shows an empty state instead of the trade.
//
// A hand-off is therefore four things at once, and missing any one of them
// makes the tap look broken: carry the trade, CLOSE the evidence panel, make
// sure the chain is on its way, and scroll Build into view.
// ============================================================================

/** The tab id of the Build screen. One string, one place. */
export const BUILD_TAB = "build";

/**
 * What must change when a trade is handed to the Build screen.
 *
 * Pure: it reads the current chains and returns the new state, so the caller
 * (App.jsx) only has to apply it. It never mutates the legs it is given — a
 * position's legs are handed to the builder as copies, so editing the trade on
 * Build cannot rewrite the position it came from.
 *
 * @param {object}   a
 * @param {string}   a.ticker  the market the trade is on
 * @param {?string}  a.expKey  expiry key, or null to let the builder pick
 * @param {object[]} a.legs    the legs to load
 * @param {string}   a.name    what to call it on the Build screen
 * @param {object}   a.chains  ticker -> chain, to know whether one is missing
 * @returns {{tab: string, ticker: string, expKey: ?string, legs: object[],
 *            name: string, ev: null, loadChain: boolean, scroll: true}}
 */
export function buildHandOff({ ticker, expKey = null, legs = [], name = "", chains = {} }) {
  return {
    tab: BUILD_TAB,
    ticker,
    expKey,
    legs: (legs || []).map((l) => ({ ...l })),
    name,
    // Always null. The evidence panel answers a question about the trade on
    // Build; leaving it open pushes the trade the user just picked off screen.
    ev: null,
    // The Build screen needs a live price to value anything. Without this the
    // trade lands on a screen that says there is no market data.
    loadChain: !chains || !chains[ticker],
    scroll: true,
  };
}

/**
 * Which of the Build screen's four states to render.
 *
 * "loading" is the one that did not exist before: a chain that is still being
 * fetched used to render the same "prices have not loaded yet — press Refresh"
 * panel as a chain that failed, which blames the user for a request that is
 * still in flight.
 *
 * @param {object}  a
 * @param {?number} a.spot         live price, or null when the chain is absent
 * @param {boolean} a.hasTrade     is there an analysed trade to show
 * @param {boolean} a.chainLoading is a fetch for this ticker in flight
 * @returns {"loading"|"no-market-data"|"empty"|"builder"}
 */
export function buildScreenState({ spot, hasTrade, chainLoading }) {
  if (spot == null) return chainLoading ? "loading" : "no-market-data";
  return hasTrade ? "builder" : "empty";
}
