// Tests for the option chain and where it comes from (src/chain.js).
//
// Three things are being held down here.
//
// 1. THE SHAPE. Alpaca and CBOE are two different payloads and the rest of the
//    app knows about neither: it reads one internal shape. If the Alpaca
//    normaliser drifts from it by a single field name, the Shortlist, the
//    wizard's ranking and every visual get quietly worse and nothing throws.
//
// 2. THE PRICE. Both sources go through the same `midOf`, so the two can never
//    disagree about the price of the same contract for a reason that is only a
//    formula. That is asserted directly, on the same numbers, both ways.
//
// 3. THE NET. Alpaca is primary. The moment it errors, empties out or hangs,
//    the user must still get a chain — from CBOE, saying CBOE on screen. A
//    broker that is down is allowed to cost a few seconds. It is never allowed
//    to produce a blank screen.
import { readFileSync } from "node:fs";
import {
  normaliseAlpacaChain, parseCboeJson, midOf, parseOcc, buildOcc,
  fetchChain, resetChainSource, SOURCE, MAX_DTE,
} from "./chain.js";

const ok = [], bad = [];
// Run IN ORDER, one at a time. The fallback tests below drive a session-level
// circuit breaker (two failures and the client stops asking the broker), and
// tests racing each other through that counter would fail for a reason that has
// nothing to do with the code under test.
const queue = [];
const check = (name, fn) => queue.push([name, fn]);
const run = async () => {
  for (const [name, fn] of queue) {
    try { await fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); }
  }
};
const eq = (a, b, what) => { if (a !== b) throw new Error(`${what}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const truthy = (x, what) => { if (!x) throw new Error(`${what} is ${JSON.stringify(x)}`); };

/* The fixture. Real capture or not, it is a payload in Alpaca's own shape, and
   the normaliser is read against it with a FIXED clock so the DTE assertions
   below mean the same thing next month as they do today. */
const RAW = JSON.parse(readFileSync(new URL("./fixtures/alpaca-chain-UNG.json", import.meta.url)));
const SPOT = RAW._capture?.underlying_last_trade ?? 13.24;
const NOW = Date.parse("2026-09-02T12:00:00Z");

/* ---------------- 1. the shape ---------------- */

check("the Alpaca normaliser produces the internal chain shape", () => {
  const c = normaliseAlpacaChain("UNG", RAW, { spot: SPOT, feed: "indicative", now: NOW });
  eq(c.spot, SPOT, "spot");
  truthy(Array.isArray(c.expirations) && c.expirations.length >= 2, "expirations");
  truthy(!Number.isNaN(Date.parse(c.updated)), "updated is a timestamp");
  eq(c.source, "Alpaca (indicative)", "source");
  // expirations are the keys of byExp, sorted, and each carries its own dte
  eq(JSON.stringify(c.expirations), JSON.stringify([...c.expirations].sort()), "expirations sorted");
  for (const e of c.expirations) {
    const x = c.byExp[e];
    truthy(Number.isFinite(x.dte), `dte on ${e}`);
    truthy(x.calls && x.puts, `calls/puts on ${e}`);
    for (const [k, q] of [...Object.entries(x.calls), ...Object.entries(x.puts)]) {
      truthy(Number.isFinite(+k), "strike key is a number");
      for (const f of ["bid", "ask", "mid", "iv", "oi", "vol", "delta", "theta", "occ"]) {
        if (!(f in q)) throw new Error(`contract ${q.occ} has no ${f}`);
      }
      eq(parseOcc(q.occ).strike, +k, `occ ↔ strike key for ${q.occ}`);
    }
  }
});

check("iv, delta and theta are actually populated, not just present", () => {
  const c = normaliseAlpacaChain("UNG", RAW, { spot: SPOT, now: NOW });
  let n = 0, iv = 0, delta = 0, theta = 0;
  for (const e of c.expirations) for (const side of ["calls", "puts"])
    for (const q of Object.values(c.byExp[e][side])) {
      n++; if (q.iv != null) iv++; if (q.delta != null) delta++; if (q.theta != null) theta++;
    }
  truthy(n > 10, `only ${n} contracts in the fixture`);
  // A normaliser that read the wrong key would leave these at zero, which is
  // the failure this whole exercise is meant to catch early.
  truthy(iv / n > 0.9, `implied volatility on only ${iv}/${n} contracts`);
  truthy(delta / n > 0.9, `delta on only ${delta}/${n} contracts`);
  truthy(theta / n > 0.9, `theta on only ${theta}/${n} contracts`);
});

check("a contract the feed could not price keeps its fields as nulls", () => {
  const c = normaliseAlpacaChain("UNG", {
    snapshots: { UNG261016C00013000: { latestQuote: { bp: 0.4, ap: 0.5 } } },
  }, { spot: 13, now: NOW });
  const q = c.byExp["2026-10-16"].calls[13];
  eq(q.iv, null, "iv"); eq(q.delta, null, "delta"); eq(q.theta, null, "theta");
  eq(q.mid, 0.45, "mid still comes off the quote");
});

check("open interest and volume are null, never a zero that reads as 'nobody trades this'", () => {
  const c = normaliseAlpacaChain("UNG", RAW, { spot: SPOT, now: NOW });
  const e = c.expirations[0];
  const q = Object.values(c.byExp[e].calls)[0];
  eq(q.oi, null, "oi");
  eq(q.vol, null, "vol");
});

check("the 400-day ceiling and the past are dropped, exactly as the CBOE parser does", () => {
  const c = normaliseAlpacaChain("UNG", RAW, { spot: SPOT, now: NOW });
  for (const e of c.expirations) {
    const dte = c.byExp[e].dte;
    truthy(dte >= 0 && dte <= MAX_DTE, `${e} is ${dte} DTE, outside 0..${MAX_DTE}`);
  }
  // the fixture deliberately carries a 2027 expiry beyond the ceiling
  truthy(Object.keys(RAW.snapshots).some((s) => s.startsWith("UNG2712")), "fixture has no far expiry to reject");
  truthy(!c.expirations.includes("2027-12-17"), "a >400 DTE expiry survived");
});

check("a contract on another root never lands in this chain", () => {
  const c = normaliseAlpacaChain("UNG", {
    snapshots: {
      UNG261016C00013000: { latestQuote: { bp: 0.4, ap: 0.5 } },
      BOIL261016C00013000: { latestQuote: { bp: 9.9, ap: 10.1 } },
    },
  }, { spot: 13, now: NOW });
  eq(Object.keys(c.byExp["2026-10-16"].calls).length, 1, "contracts kept");
  eq(c.byExp["2026-10-16"].calls[13].bid, 0.4, "the surviving one is UNG's");
});

check("an empty chain, or one with no underlying price, is an error and not an empty screen", () => {
  let threw = 0;
  try { normaliseAlpacaChain("UNG", { snapshots: {} }, { spot: 13, now: NOW }); } catch { threw++; }
  try { normaliseAlpacaChain("UNG", RAW, { spot: 0, now: NOW }); } catch { threw++; }
  eq(threw, 2, "both refusals");
});

check("the source string names the feed it actually read", () => {
  eq(normaliseAlpacaChain("UNG", RAW, { spot: SPOT, feed: "indicative", now: NOW }).source, SOURCE.alpacaIndicative, "indicative");
  eq(normaliseAlpacaChain("UNG", RAW, { spot: SPOT, feed: "opra", now: NOW }).source, SOURCE.alpacaOpra, "opra");
  // the default must never be the one that claims a real-time tape
  eq(normaliseAlpacaChain("UNG", RAW, { spot: SPOT, now: NOW }).source, SOURCE.alpacaIndicative, "default");
});

/* ---------------- 2. the price ---------------- */

check("both sources price the same contract identically", () => {
  // Same contract, same numbers, arriving in each source's own vocabulary.
  const bid = 0.41, ask = 0.53, last = 0.47;
  const alp = normaliseAlpacaChain("UNG", {
    snapshots: { UNG261016C00013000: { latestQuote: { bp: bid, ap: ask }, latestTrade: { p: last } } },
  }, { spot: 13, now: NOW }).byExp["2026-10-16"].calls[13];
  const cbo = parseCboeJson("UNG", {
    data: { current_price: 13, options: [{ option: "UNG261016C00013000", bid, ask, last_trade_price: last }] },
  }, NOW).byExp["2026-10-16"].calls[13];
  eq(alp.mid, cbo.mid, "mid");
  eq(alp.bid, cbo.bid, "bid");
  eq(alp.ask, cbo.ask, "ask");
});

check("with one side of the book missing, both fall back to the last trade", () => {
  const alp = normaliseAlpacaChain("UNG", {
    snapshots: { UNG261016P00012000: { latestQuote: { bp: 0, ap: 0.6 }, latestTrade: { p: 0.55 } } },
  }, { spot: 13, now: NOW }).byExp["2026-10-16"].puts[12];
  const cbo = parseCboeJson("UNG", {
    data: { current_price: 13, options: [{ option: "UNG261016P00012000", bid: 0, ask: 0.6, last_trade_price: 0.55 }] },
  }, NOW).byExp["2026-10-16"].puts[12];
  eq(alp.mid, 0.55, "alpaca mid");
  eq(cbo.mid, 0.55, "cboe mid");
});

check("no quote and no trade means no price, so the engine prices it itself", () => {
  eq(midOf(0, 0, 0), null, "nothing quoted");
  eq(midOf(undefined, undefined, undefined), null, "nothing at all");
  eq(midOf(1, 2, 9), 1.5, "both sides win over the last trade");
});

check("occ symbols survive the round trip", () => {
  const occ = buildOcc("UNG", "2026-10-16", "call", 13.5);
  eq(occ, "UNG261016C00013500", "built");
  const p = parseOcc(occ);
  eq(p.exp, "2026-10-16", "exp"); eq(p.type, "call", "type"); eq(p.strike, 13.5, "strike");
});

/* ---------------- 3. the net ---------------- */

const CBOE_PAYLOAD = {
  data: { current_price: 13.1, options: [
    { option: "UNG261016C00013000", bid: 0.4, ask: 0.5, last_trade_price: 0.45, iv: 0.5, open_interest: 120, volume: 4, delta: 0.5, theta: -0.004 },
    { option: "UNG261016P00013000", bid: 0.3, ask: 0.4, last_trade_price: 0.35, iv: 0.5, open_interest: 90, volume: 2, delta: -0.5, theta: -0.004 },
  ] },
};
/** A fetch that answers the CBOE server endpoint and does whatever `alpaca` says. */
const fakeFetch = (alpaca) => async (url, init) => {
  if (String(url).startsWith("/api/chainAlpaca")) return alpaca(init);
  if (String(url).startsWith("/api/chain")) return { ok: true, json: async () => CBOE_PAYLOAD };
  throw new Error("unexpected url " + url);
};

check("when Alpaca throws, the user still gets a chain and it says CBOE", async () => {
  resetChainSource();
  const c = await fetchChain("UNG", { fetchImpl: fakeFetch(() => { throw new Error("boom"); }) });
  eq(c.source, SOURCE.cboeServer, "source");
  truthy(c.spot > 0 && c.expirations.length === 1, "a usable chain");
  eq(c.byExp["2026-10-16"].calls[13].mid, 0.45, "priced from CBOE");
});

check("an Alpaca 502, and an Alpaca 200 with nothing in it, both fall back", async () => {
  resetChainSource();
  const a = await fetchChain("UNG", { fetchImpl: fakeFetch(() => ({ ok: false, status: 502, json: async () => ({ error: "upstream 403" }) })) });
  eq(a.source, SOURCE.cboeServer, "on a 502");
  resetChainSource();
  const b = await fetchChain("UNG", { fetchImpl: fakeFetch(() => ({ ok: true, json: async () => ({ spot: null, expirations: [], byExp: {} }) })) });
  eq(b.source, SOURCE.cboeServer, "on an empty 200");
});

check("a hanging broker costs the timeout, not the screen", async () => {
  resetChainSource();
  const hang = (init) => new Promise((_, reject) => {
    init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
  });
  const t0 = Date.now();
  const c = await fetchChain("UNG", { fetchImpl: fakeFetch(hang), timeoutMs: 60 });
  const spent = Date.now() - t0;
  eq(c.source, SOURCE.cboeServer, "source");
  truthy(spent < 2000, `waited ${spent}ms on a hung broker`);
});

check("Alpaca wins when it answers, and one bad call does not blacklist it", async () => {
  resetChainSource();
  const alpacaChain = { spot: 13.24, expirations: ["2026-10-16"], byExp: { "2026-10-16": { dte: 44, calls: {}, puts: {} } }, updated: new Date().toISOString(), source: SOURCE.alpacaIndicative };
  const good = () => ({ ok: true, json: async () => alpacaChain });
  eq((await fetchChain("UNG", { fetchImpl: fakeFetch(good) })).source, SOURCE.alpacaIndicative, "primary source");
  // one failure, then a success: the session must not have given up
  await fetchChain("UNG", { fetchImpl: fakeFetch(() => { throw new Error("blip"); }) });
  eq((await fetchChain("UNG", { fetchImpl: fakeFetch(good) })).source, SOURCE.alpacaIndicative, "back on Alpaca after one blip");
});

check("after two failures in a row the session stops paying the timeout", async () => {
  resetChainSource();
  let asked = 0;
  const dead = () => { asked++; throw new Error("down"); };
  for (let i = 0; i < 4; i++) await fetchChain("UNG", { fetchImpl: fakeFetch(dead) });
  eq(asked, 2, "attempts made before giving up");
  // and a user-initiated retry lets it back in
  resetChainSource();
  await fetchChain("UNG", { fetchImpl: fakeFetch(dead) });
  eq(asked, 3, "attempts after the reset");
});

await run();
console.log(`chain: ${ok.length} passed, ${bad.length} failed`);
for (const [n, m] of bad) console.log(`  ✗ ${n}\n    ${m}`);
if (RAW._capture?.NOT_LIVE) {
  console.log("  ! the Alpaca fixture is hand-built to the SDK's shape, not captured live —");
  console.log("    run scripts/capture-alpaca-chain.mjs with real keys to replace it.");
}
process.exit(bad.length ? 1 : 0);
