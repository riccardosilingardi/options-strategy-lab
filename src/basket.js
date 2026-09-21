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
//
// TEN MARKETS SINCE ROADMAP P2-bis. The five grain and gas ETFs this app was
// built on, plus the liquid tier — GLD, SLV, USO, XLE, GDX — which are real
// commodities the seasonal engine applies to, with option books deep enough
// that the quality floors have something to pass. The grain chains are so thin
// that almost nothing clears them, and a screen whose content is mostly an
// explanation of why it is empty is not a screen.
// ============================================================================
export const BASKET = ["SOYB", "CORN", "UNG", "BOIL", "WEAT", "GLD", "SLV", "USO", "XLE", "GDX"];
