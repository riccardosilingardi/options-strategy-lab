/* Capture a REAL Alpaca option-snapshot response and save it as the test fixture.
 *
 *   ALPACA_KEY=... ALPACA_SECRET=... node scripts/capture-alpaca-chain.mjs UNG
 *
 * Why this exists: the normaliser test is only worth something if it runs
 * against a payload the broker actually sent. Run this once, commit the file it
 * writes, and `npm test` is then holding the real shape down rather than the
 * shape we assumed. It also prints the report the reviewer wants — spot, how
 * many expiries, how many strikes on the ~45 DTE expiry, and whether IV, delta
 * and theta came back populated or null on this account's plan.
 *
 * The keys are read from the environment and never written into the file.
 */
import { writeFileSync } from "node:fs";
import { normaliseAlpacaChain, MAX_DTE } from "../src/chain.js";

const DATA = "https://data.alpaca.markets";
const sym = (process.argv[2] || "UNG").toUpperCase();
const feed = (process.env.ALPACA_OPTIONS_FEED || "indicative").toLowerCase();
const key = process.env.ALPACA_KEY, secret = process.env.ALPACA_SECRET;
if (!key || !secret) {
  console.error("Set ALPACA_KEY and ALPACA_SECRET in the environment first.");
  process.exit(1);
}
const H = { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret, Accept: "application/json" };

const get = async (url) => {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
};

const spotJson = await get(`${DATA}/v2/stocks/trades/latest?symbols=${sym}`);
const spot = spotJson?.trades?.[sym]?.p;
if (!(spot > 0)) throw new Error(`no last trade for ${sym}: ${JSON.stringify(spotJson)}`);

const iso = (d) => d.toISOString().slice(0, 10);
const params = new URLSearchParams({
  feed, limit: "1000",
  strike_price_gte: (spot * 0.55).toFixed(2),
  strike_price_lte: (spot * 1.45).toFixed(2),
  expiration_date_gte: iso(new Date()),
  expiration_date_lte: iso(new Date(Date.now() + MAX_DTE * 86400000)),
});

const snapshots = {};
let token = null, pages = 0;
do {
  const q = new URLSearchParams(params);
  if (token) q.set("page_token", token);
  const j = await get(`${DATA}/v1beta1/options/snapshots/${sym}?${q}`);
  Object.assign(snapshots, j.snapshots || {});
  token = j.next_page_token || null;
  pages++;
} while (token && pages < 4);

const out = `src/fixtures/alpaca-chain-${sym}.json`;
writeFileSync(out, JSON.stringify({ snapshots, next_page_token: null }, null, 1));

/* ---- the report ---- */
const chain = normaliseAlpacaChain(sym, { snapshots }, { spot, feed });
const near45 = chain.expirations.reduce((b, e) =>
  Math.abs(chain.byExp[e].dte - 45) < Math.abs(chain.byExp[b].dte - 45) ? e : b, chain.expirations[0]);
const strikes = new Set([...Object.keys(chain.byExp[near45].calls), ...Object.keys(chain.byExp[near45].puts)]);
let n = 0, iv = 0, delta = 0, theta = 0, priced = 0;
for (const e of chain.expirations) for (const side of ["calls", "puts"])
  for (const c of Object.values(chain.byExp[e][side])) {
    n++; if (c.iv != null) iv++; if (c.delta != null) delta++;
    if (c.theta != null) theta++; if (c.mid != null) priced++;
  }

console.log(`
${sym} — ${feed} feed          (written to ${out}, ${pages} page(s))
  spot                     $${spot}
  expirations              ${chain.expirations.length}
  nearest 45 DTE           ${near45} (${chain.byExp[near45].dte} DTE), ${strikes.size} strikes
  contracts                ${n}
  with implied volatility  ${iv}  (${((iv / n) * 100).toFixed(0)}%)
  with delta               ${delta}  (${((delta / n) * 100).toFixed(0)}%)
  with theta               ${theta}  (${((theta / n) * 100).toFixed(0)}%)
  with a usable price      ${priced}  (${((priced / n) * 100).toFixed(0)}%)
`);
