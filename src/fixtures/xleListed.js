// ============================================================================
// src/fixtures/xleListed.js — THE BOARD THE OWNER MET ON 13 OCT 2026 (PR 70), SYNTHETIC.
//
// XLE, the 27 Nov board: 59.5 is listed as a CALL and NOT as a put; 60 is listed on both sides. Find proposed an iron
// condor buying the 59.5 PUT (snapped onto the calls-and-puts union), Build priced that leg off the model ("◌") and the
// gate refused it (UNLISTED_CONTRACT). The prices are Black-Scholes at one volatility with three-cent markets and 500
// contracts open — synthetic bytes in the shape `normaliseAlpacaChain()` produces; only WHICH strikes each side lists is
// the owner's reading. Plain JS: the plain and the JSX suites both import it.
// ============================================================================
import { bs } from "../engine.js";
import { buildOcc } from "../chain.js";

export const XLE_EK = "2026-11-27";
export const XLE_SPOT = 66.1;
export const XLE_DTE = 45;
export const XLE_IV = 0.25;
export const CALL_STRIKES = [55, 57.5, 59.5, 60, 62.5, 65, 67.5, 69, 70, 72.5, 75];
export const PUT_STRIKES = [55, 57.5, 60, 62.5, 65, 67.5, 70, 72.5, 75];

const quote = (type, k) => {
  const mid = +bs(XLE_SPOT, k, XLE_DTE / 365, XLE_IV, type).toFixed(2);
  return { bid: Math.max(0.01, +(mid - 0.03).toFixed(2)), ask: +(mid + 0.03).toFixed(2), mid, bidSize: 10, askSize: 10,
    iv: XLE_IV, oi: 500, vol: 20, delta: null, theta: null, gamma: null, vega: null, occ: buildOcc("XLE", XLE_EK, type, k) };
};
/** The chain, in the app's one internal shape. `tweak(type, k, q)` may change one quote (a bid of 0, say). */
export function xleChain(tweak = null) {
  const side = (type, ks) => Object.fromEntries(ks.map((k) => {
    const q = quote(type, k);
    return [k, tweak ? tweak(type, k, q) : q];
  }));
  return { spot: XLE_SPOT, expirations: [XLE_EK], updated: "2026-10-13T14:00:00Z", source: "Alpaca (indicative)",
    byExp: { [XLE_EK]: { dte: XLE_DTE, calls: side("call", CALL_STRIKES), puts: side("put", PUT_STRIKES) } } };
}
/** The owner's iron condor, as Find proposed it: −62.5P / −69C / +70C / +59.5P. */
export const OWNER_CONDOR = [
  { side: -1, qty: 1, type: "put", strike: 62.5 }, { side: -1, qty: 1, type: "call", strike: 69 },
  { side: 1, qty: 1, type: "call", strike: 70 }, { side: 1, qty: 1, type: "put", strike: 59.5 },
];
/** True when any leg is the put the board does not list. */
export const hasUnlistedPut = (legs) => (legs || []).some((l) => l.type === "put" && Number(l.strike) === 59.5);
