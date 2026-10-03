// ============================================================================
// src/basket.js — the markets Find reads, as a plain list, for the Netlify functions.
//
// SINCE PR #48 IT IS DERIVED, NOT TYPED. `src/markets.js` is the one registry (one row per market) and is plain JS,
// so a function can import it directly; this file re-exports its `BASKET` so `liquidity.mjs` and the tests that
// already import from here keep working. SPY is not in it: it is priced as a hedge, never proposed.
// ============================================================================
export { BASKET } from "./markets.js";
