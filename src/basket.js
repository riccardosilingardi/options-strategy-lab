// ============================================================================
// src/basket.js — the five commodity ETFs this app is about, as a plain list.
//
// WHY THIS LIST EXISTS WHEN `BASKET` IN App.jsx ALREADY DOES.
// The one home for the basket is the `commodity: true` flag on `UNDERLYINGS` in
// `src/App.jsx`, and that has not changed. But `App.jsx` imports React,
// recharts and lightweight-charts, so a Netlify function cannot import it —
// and `netlify/functions/liquidity.mjs` has to know which five markets to
// measure. Rather than let the two drift silently, the list is written here
// once, in plain JS, and `src/chain.test.js` reads App.jsx and FAILS THE BUILD
// if the flags in that table and this array stop agreeing. Same device as
// `src/theme.test.js`: a copy nobody can quietly break is a copy the code can
// live with; a copy nothing checks is the bug.
//
// SPY is deliberately absent. It is in the underlyings table so the desk can
// price a hedge; it is not a market the path goes looking for.
// ============================================================================
export const BASKET = ["SOYB", "CORN", "UNG", "BOIL", "WEAT"];
