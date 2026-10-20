// ============================================================================
// src/listing.js — THE MARKET AS IBKR LISTS IT, READ FROM ALPACA (PR 76, task 76.4; owner 20 Oct 2026: "I asked for the
// underlying's code reference, so I recognise it immediately in IBKR").
//
// IBKR lists an instrument as SYMBOL – EXCHANGE and, under it, the official name in capitals. Alpaca's
// `GET /v2/assets/{symbol}` carries both (alpaca-py `Asset`: `symbol`, `exchange` — an `AssetExchange` code — and
// `name`), read through the proxy's GET allowlist (netlify/functions/alpaca.mjs). One GET per market, kept on the device
// for a day (`LISTING_KEY` in localStorage: /api/state carries no market cache, so there is no second copy to keep). A
// failed call, a reply for another symbol or one without an exchange and a name is NOT a listing: the screen shows the
// ticker alone. The words (`listingLine()`, `listingName()`, the exchange table) live in rules.js.
//
// Plain JS: the storage and the GET are handed in, so it is tested without a browser (src/listing.test.js).
// ============================================================================
import { EXCHANGE_WORDS } from "./rules.js";

/** Where the listings are kept on this device. */
export const LISTING_KEY = "osl-listings";
/** How long a listing is kept before it is asked again: a day (an ETF's name and exchange do not move overnight). */
export const LISTING_TTL_MS = 24 * 3600 * 1000;

/** Alpaca's asset reply → `{ exchange, name }` (IBKR's exchange word, the name in capitals), or null when it is not one. */
export function listingOf(tk, asset) {
  if (!asset || typeof asset !== "object") return null;
  const sym = String(asset.symbol || "").toUpperCase();
  if (!sym || sym !== String(tk || "").toUpperCase()) return null;
  const code = String(asset.exchange || "").trim().toUpperCase();
  const name = typeof asset.name === "string" ? asset.name.trim() : "";
  if (!code || !name) return null;
  return { exchange: EXCHANGE_WORDS[code] || code, name: name.toUpperCase() };
}

/** The listings this device holds: `{ [ticker]: { exchange, name, at } }`; an unreadable store is none. */
export function readListings(storage) {
  try {
    const j = JSON.parse((storage && storage.getItem(LISTING_KEY)) || "{}");
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}
/** Keep them (a full or locked storage keeps nothing, and nothing breaks). */
export function writeListings(storage, all) {
  try { if (storage) storage.setItem(LISTING_KEY, JSON.stringify(all)); } catch { /* nothing kept */ }
}

/** Is this listing younger than a day? */
export const listingFresh = (e, now) => !!e && Number.isFinite(Number(e.at)) && now >= Number(e.at) && now - Number(e.at) < LISTING_TTL_MS;
/** The tickers to ask again: never read, or read more than a day ago. */
export const listingsToAsk = (cache, tickers, now) => (tickers || []).filter((tk) => !listingFresh((cache || {})[tk], now));

/**
 * Ask Alpaca for each ticker's listing, one read-only GET each (`get(path)` resolves to the reply's JSON or throws).
 * @returns `{ [ticker]: { exchange, name, at } }` for the replies that are listings; a failure leaves its ticker out.
 */
export async function fetchListings(tickers, get, now = Date.now()) {
  const out = {};
  await Promise.all((tickers || []).map(async (tk) => {
    try {
      const l = listingOf(tk, await get(`/v2/assets/${encodeURIComponent(tk)}`));
      if (l) out[tk] = { ...l, at: now };
    } catch { /* not read: the ticker stands alone */ }
  }));
  return out;
}
