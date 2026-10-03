#!/usr/bin/env node
// ============================================================================
// scripts/sanity.mjs — THE SANITY CHECK'S READER (PR #50, TASK 1a).
//
//   NODE_USE_ENV_PROXY=1 node scripts/sanity.mjs --live            read, sanitize, save
//   node scripts/sanity.mjs --from docs/sanity/live-2026-10-03     replay a saved folder, no network
//
// READ-ONLY. `liveGet()` is the only way this file touches the network: GET only, three hosts only
// (paper-api.alpaca.markets, data.alpaca.markets, www.alphavantage.co). It refuses api.alpaca.markets — the LIVE
// trading host — and every other host, and it has no code path for POST, PATCH or DELETE.
//
// CREDENTIALS. On the cloud environment the agent proxy adds the keys after a request leaves the machine, so this
// file sends none. Only when that fails (401/403, or Alpha Vantage saying the key is missing) and the environment
// has ALPACA_KEY / ALPACA_SECRET / ALPHAVANTAGE_KEY does it add them itself — and never prints, saves or logs them.
//
// SANITIZED. A saved payload drops `account_number`, the account's `id`, and any string that names the account.
// `/v2/account/activities` is never called (its descriptions carry the account number).
// Alpha Vantage: at most three calls a run, failed ones included — GLD, GDX, SLV, in that order.
// ============================================================================
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export const LIVE_HOSTS = Object.freeze(["paper-api.alpaca.markets", "data.alpaca.markets", "www.alphavantage.co"]);
export const AV_SYMBOLS = Object.freeze(["GLD", "GDX", "SLV"]);
const AV_MAX_CALLS = 3;
let avCalls = 0;

/** Is this URL one the sanity check may read? GET only is enforced by `liveGet()` itself (it has no method input). */
export function hostAllowed(url) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === "https:" && LIVE_HOSTS.includes(u.hostname);
}

const envAuth = () => {
  const k = process.env.ALPACA_KEY, s = process.env.ALPACA_SECRET;
  return k && s ? { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s } : null;
};

/**
 * The one network call. GET only; the three hosts only. Returns { status, json, text, via } — never throws on an HTTP
 * status, so a 401 is recorded as a 401 and the run continues on the owner's GROUND TRUTH.
 */
export async function liveGet(url, { fetchImpl = fetch } = {}) {
  if (!hostAllowed(url)) throw new Error(`liveGet refuses ${url}: only ${LIVE_HOSTS.join(", ")}, GET only`);
  const isAV = new URL(url).hostname === "www.alphavantage.co";
  if (isAV) {
    if (avCalls >= AV_MAX_CALLS) throw new Error(`liveGet refuses ${url}: Alpha Vantage is limited to ${AV_MAX_CALLS} calls a run`);
    avCalls++;
  }
  const once = async (u, headers) => {
    const r = await fetchImpl(u, { method: "GET", headers });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, json, text };
  };
  let out = { ...(await once(url, {})), via: "proxy" };
  const avKeyMissing = isAV && out.json && typeof (out.json.Information || out.json["Error Message"] || out.json.Note) === "string"
    && /api ?key/i.test(out.json.Information || out.json["Error Message"] || out.json.Note);
  if (!isAV && (out.status === 401 || out.status === 403) && envAuth()) {
    out = { ...(await once(url, envAuth())), via: "env" };
  } else if (avKeyMissing && process.env.ALPHAVANTAGE_KEY) {
    // The fallback re-asks; it counts as a call of its own.
    if (avCalls >= AV_MAX_CALLS) return { ...out, via: "proxy (key missing; no call left for the fallback)" };
    avCalls++;
    const u = new URL(url); u.searchParams.set("apikey", process.env.ALPHAVANTAGE_KEY);
    out = { ...(await once(u.toString(), {})), via: "env" };
  }
  return out;
}

/* ---- SANITIZE: no account number, no account id, no string naming the account ---- */
const DROP_KEYS = new Set(["account_number", "account_id", "id_account"]);
export function sanitize(payload, { accountId = null, accountNumber = null } = {}) {
  const names = [accountId, accountNumber].filter((x) => x != null && String(x).length >= 4).map(String);
  const walk = (v, key = null, parentIsAccount = false) => {
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") {
      const o = {};
      for (const [k, x] of Object.entries(v)) {
        if (DROP_KEYS.has(k)) continue;
        if (parentIsAccount && k === "id") continue;
        o[k] = walk(x, k);
      }
      return o;
    }
    if (typeof v === "string") {
      let s = v;
      for (const n of names) s = s.split(n).join("[account]");
      return s;
    }
    return v;
  };
  return walk(payload, null, !!(payload && typeof payload === "object" && !Array.isArray(payload) && "account_number" in payload));
}

/* ---- THE READS ---- */
const PAPER = "https://paper-api.alpaca.markets";
const DATA = "https://data.alpaca.markets";
export const HELD = Object.freeze(["GDX261030P00094000", "SLV261120C00055000", "SLV261120C00061000"]);
export const GLD_PAIR = Object.freeze(["GLD261120P00380000", "GLD261120P00361000"]);

async function readLive(dir) {
  mkdirSync(dir, { recursive: true });
  const log = [];
  const save = (name, res, ids = {}) => {
    const body = res.json != null ? sanitize(res.json, ids) : { nonJson: String(res.text || "").slice(0, 200) };
    writeFileSync(join(dir, `${name}.json`), JSON.stringify({ status: res.status, via: res.via, body }, null, 2));
    log.push(`${name}: HTTP ${res.status} (${res.via})`);
    return body;
  };
  const acc = await liveGet(`${PAPER}/v2/account`);
  const ids = { accountId: acc.json?.id, accountNumber: acc.json?.account_number };
  save("account", acc, ids);
  save("clock", await liveGet(`${PAPER}/v2/clock`), ids);
  save("positions", await liveGet(`${PAPER}/v2/positions`), ids);
  // Orders, every status, paged forward from 1 Sep 2026 by `after` (Alpaca's own cursor is the submit time).
  const orders = []; let after = "2026-09-01T00:00:00Z"; let last = null;
  for (let page = 0; page < 10; page++) {
    const res = await liveGet(`${PAPER}/v2/orders?status=all&limit=500&nested=true&direction=asc&after=${encodeURIComponent(after)}`);
    last = res;
    if (res.status !== 200 || !Array.isArray(res.json) || !res.json.length) break;
    orders.push(...res.json);
    if (res.json.length < 500) break;
    after = res.json[res.json.length - 1].submitted_at;
  }
  save("orders", { ...(last || { status: 0, via: "none" }), json: last && last.status === 200 ? orders : last?.json }, ids);
  save("snapshots", await liveGet(`${DATA}/v1beta1/options/snapshots?symbols=${[...HELD, ...GLD_PAIR].join(",")}&feed=indicative`), ids);
  save("gld-bars", await liveGet(`${DATA}/v2/stocks/GLD/bars?timeframe=1Day&feed=iex&start=2025-08-01&end=2026-10-03&limit=1000&adjustment=raw`), ids);
  for (const sym of AV_SYMBOLS) {
    save(`av-${sym}`, await liveGet(`https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY_ADJUSTED&symbol=${sym}`), ids);
  }
  writeFileSync(join(dir, "README.md"), `# Live reads, ${new Date().toISOString().slice(0, 10)}\n\n` +
    `Read by \`scripts/sanity.mjs --live\` (GET only, sanitized). One line per read:\n\n${log.map((l) => `- ${l}`).join("\n")}\n`);
  return log;
}

/** Replay a saved folder: what each read returned, with no network at all. */
export function readFolder(dir) {
  const out = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    out[f.replace(/\.json$/, "")] = JSON.parse(readFileSync(join(dir, f), "utf8"));
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const args = process.argv.slice(2);
  if (args[0] === "--live") {
    const dir = args[1] || "docs/sanity/live-2026-10-03";
    const log = await readLive(dir);
    console.log(log.join("\n"));
  } else if (args[0] === "--from" && args[1] && existsSync(args[1])) {
    const saved = readFolder(args[1]);
    for (const [k, v] of Object.entries(saved)) {
      const n = Array.isArray(v.body) ? `${v.body.length} items` : v.body && typeof v.body === "object" ? `${Object.keys(v.body).length} keys` : "";
      console.log(`${k.padEnd(12)} HTTP ${v.status} (${v.via}) ${n}`);
    }
  } else {
    console.log("usage: NODE_USE_ENV_PROXY=1 node scripts/sanity.mjs --live [dir] | node scripts/sanity.mjs --from <dir>");
    process.exitCode = 1;
  }
}
