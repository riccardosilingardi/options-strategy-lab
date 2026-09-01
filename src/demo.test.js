// Tests for the public demo (src/demo.js) and the edge gate that lets it in.
//
// Two things are being held down here.
//
// 1. THE DOOR. A demo token that is not set must not open anything: an empty
//    DEMO_TOKEN matching an empty ?demo= would make the password optional, and
//    that is the kind of bug you only find after the site is public.
//
// 2. THE THREE EXAMPLE POSITIONS. They are the demo's whole argument, so each
//    one has to actually read the way it claims to when the app values it with
//    the same maths every other screen uses. A fixture that merely says
//    "near take profit" in a comment teaches nothing.
import { readFileSync } from "node:fs";
import { demoPositions, DEMO_TOOLTIP, DEMO_BANNER, DEMO_SEED_TICKERS } from "./demo.js";
import { netBS, SEASONAL } from "./engine.js";
import { RULES } from "./rules.js";

const ok = [], bad = [];
const pending = [];
const check = (name, fn) => {
  pending.push((async () => {
    try { await fn(); ok.push(name); } catch (e) { bad.push([name, e.message]); }
  })());
};

const U = {
  CORN: { iv: 0.24, step: 0.5 }, UNG: { iv: 0.45, step: 0.5 },
  SOYB: { iv: 0.20, step: 0.5 }, WEAT: { iv: 0.26, step: 0.25 },
};
const underlying = (tk) => U[tk] || { iv: 0.3, step: 0.5 };
const SPOTS = { CORN: 19.4, UNG: 13.2, SOYB: 22.1, WEAT: 5.1 };

/** What the app itself would show for this position today. */
const livePnl = (p, spot) => {
  const dteLeft = Math.max(1, Math.round((new Date(p.expiry) - Date.now()) / 86400000));
  return (netBS(p.legs, spot, dteLeft, underlying(p.ticker).iv) - p.entryNet) * 100;
};

/* ---------------- the door ----------------
   The gate is RUN, not grepped. A regex over the source can be satisfied by
   code that does not do what it looks like it does, and this file is the only
   thing standing between a public token and the owner's account. */

const gateSrc = readFileSync(new URL("../netlify/edge-functions/gate.js", import.meta.url), "utf8");

/** Load the edge function with a fake Deno.env and a fake context.next(). */
async function loadGate(env) {
  globalThis.Deno = { env: { get: (k) => env[k] } };
  const mod = await import(`data:text/javascript;base64,${Buffer.from(gateSrc).toString("base64")}`);
  return async ({ url = "https://site.test/", cookie = "", auth = "" } = {}) => {
    const headers = new Headers();
    if (cookie) headers.set("cookie", cookie);
    if (auth) headers.set("authorization", auth);
    const next = async () => new Response("PAGE", { status: 200 });
    const res = await mod.default(new Request(url, { headers }), { next });
    return { status: res.status, body: await res.text(), setCookie: res.headers.get("set-cookie") || "" };
  };
}
const basic = (pw) => "Basic " + Buffer.from(`user:${pw}`).toString("base64");
const ENV = { SITE_PASSWORD: "hunter2", DEMO_TOKEN: "s3cret" };

check("the password still guards the site", async () => {
  const gate = await loadGate(ENV);
  if ((await gate()).status !== 401) throw new Error("the site is open without a password");
  if ((await gate({ auth: basic("wrong") })).status !== 401) throw new Error("a wrong password got in");
  if ((await gate({ auth: basic("hunter2") })).status !== 200) throw new Error("the right password was refused");
});

check("the demo token opens the site, and only the real one does", async () => {
  const gate = await loadGate(ENV);
  const ok = await gate({ url: "https://site.test/?demo=s3cret" });
  if (ok.status !== 200) throw new Error("the real token did not open the site");
  if (!/osl_demo=1/.test(ok.setCookie)) throw new Error("nothing keeps the session in demo mode");
  if (ok.setCookie.includes("s3cret")) throw new Error("the token itself was written into the cookie");
  if ((await gate({ url: "https://site.test/?demo=wrong" })).status !== 401) throw new Error("a wrong token got in");
});

check("an unset DEMO_TOKEN is not a door", async () => {
  // The bug this exists for: `asked === DEMO` with both empty is `true`, and
  // then ?demo= walks past the password on a site that never enabled a demo.
  const gate = await loadGate({ SITE_PASSWORD: "hunter2" });
  for (const u of ["https://site.test/?demo=", "https://site.test/?demo=anything", "https://site.test/?demo"]) {
    if ((await gate({ url: u })).status !== 401) throw new Error(`${u} walked past the password`);
  }
});

check("the demo session survives navigation without repeating the token", async () => {
  const gate = await loadGate(ENV);
  const res = await gate({ url: "https://site.test/api/chain?sym=CORN", cookie: "osl_demo=1" });
  if (res.status !== 200) throw new Error("the demo session lost its access on the next request");
});

check("?demo=off is a way OUT, never a way in", async () => {
  const gate = await loadGate(ENV);
  // with no password it must still be refused: the escape hatch is not a door
  if ((await gate({ url: "https://site.test/?demo=off" })).status !== 401) {
    throw new Error("?demo=off walked past the password");
  }
  // it must not be honoured as a token match either, even if a cookie is held
  if ((await gate({ url: "https://site.test/?demo=off", cookie: "osl_demo=1" })).status !== 401) {
    throw new Error("?demo=off kept its access instead of dropping it");
  }
  // and with the password it goes through AND clears the cookie
  const out = await gate({ url: "https://site.test/?demo=off", cookie: "osl_demo=1", auth: basic("hunter2") });
  if (out.status !== 200) throw new Error("the owner could not get back out of demo mode");
  if (!/osl_demo=;/.test(out.setCookie)) throw new Error("the demo cookie was not cleared");
});

check("the read-only wording is written once", () => {
  if (DEMO_TOOLTIP !== "Demo mode: read only") throw new Error(DEMO_TOOLTIP);
  if (!DEMO_BANNER.includes("read only")) throw new Error(DEMO_BANNER);
  if (!DEMO_BANNER.includes("paper trading")) throw new Error(DEMO_BANNER);
});

check("every order path checks the demo flag", () => {
  const pro = readFileSync(new URL("./pro.jsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
  // paths 2, 3 and 4 live in pro.jsx; path 1 in App.jsx (CLAUDE.md, order paths)
  for (const n of ["order path 2 of six", "order path 3 of six", "order path 4 of six"]) {
    if (!pro.includes(n)) throw new Error(`missing the demo guard on ${n}`);
  }
  if (!app.includes("Order path 1 of the six")) throw new Error("missing the demo guard on order path 1");
  // and the shared state blob is never written from a demo session
  if (!/if \(DEMO\) return;/.test(app)) throw new Error("a demo session can still write the shared state blob");
});

/* ---------------- the three example positions ---------------- */

const POS = demoPositions({ spots: SPOTS, underlying });

check("three positions, and every chain they need is loaded first", () => {
  if (POS.length !== 3) throw new Error(`${POS.length} positions, expected 3`);
  for (const p of POS) {
    if (!DEMO_SEED_TICKERS.includes(p.ticker)) throw new Error(`${p.ticker} is not in the seed list`);
  }
});

check("a position with no live price is skipped, never invented", () => {
  const none = demoPositions({ spots: {}, underlying });
  if (none.length) throw new Error("positions were built with no prices to build them from");
  const one = demoPositions({ spots: { CORN: 19.4 }, underlying });
  if (one.length !== 1) throw new Error(`${one.length} positions from one price`);
});

check("every position is defined-risk with a max loss you can read", () => {
  for (const p of POS) {
    if (!(p.maxLoss < 0) || !Number.isFinite(p.maxLoss)) throw new Error(`${p.ticker}: max loss ${p.maxLoss}`);
    if (!(p.maxProfit > 0) || !Number.isFinite(p.maxProfit)) throw new Error(`${p.ticker}: max profit ${p.maxProfit}`);
    // no naked short: every sold leg is covered by a bought one of the same type
    for (const type of ["call", "put"]) {
      const shorts = p.legs.filter((l) => l.type === type && l.side < 0).reduce((a, l) => a + l.qty, 0);
      const longs = p.legs.filter((l) => l.type === type && l.side > 0).reduce((a, l) => a + l.qty, 0);
      if (shorts > longs) throw new Error(`${p.ticker}: ${shorts} short ${type}s against ${longs} long`);
    }
  }
});

check("every position is opened inside the entry rules and still has room to work", () => {
  for (const p of POS) {
    const dteLeft = Math.round((new Date(p.expiry) - Date.now()) / 86400000);
    if (dteLeft <= RULES.exitDTE) throw new Error(`${p.ticker} is already inside its own exit window at ${dteLeft} days`);
  }
});

check("one position really is near its take-profit", () => {
  const p = POS.find((x) => x.ticker === "CORN");
  const pnl = livePnl(p, SPOTS.CORN);
  if (!(pnl >= RULES.takeProfitPct * p.maxProfit)) {
    throw new Error(`CORN sits at ${pnl.toFixed(0)}, and the rule fires at ${(RULES.takeProfitPct * p.maxProfit).toFixed(0)}`);
  }
});

check("one position really is near its stop", () => {
  const p = POS.find((x) => x.ticker === "UNG");
  const pnl = livePnl(p, SPOTS.UNG);
  if (!(pnl <= RULES.stopLossPct * p.maxLoss)) {
    throw new Error(`UNG sits at ${pnl.toFixed(0)}, and the warning fires at ${(RULES.stopLossPct * p.maxLoss).toFixed(0)}`);
  }
  // ...and the stop is a WARNING, so it must not also be at its take-profit
  if (pnl >= RULES.takeProfitPct * p.maxProfit) throw new Error("the losing position is somehow also winning");
});

check("one position has a broken thesis while the price still looks fine", () => {
  const p = POS.find((x) => x.name === "Iron Condor");
  const pnl = livePnl(p, SPOTS[p.ticker]);
  // the price looks fine: in profit, and no rule is firing
  if (!(pnl > 0)) throw new Error(`the P&L is ${pnl.toFixed(0)}, which does not look fine`);
  if (pnl >= RULES.takeProfitPct * p.maxProfit) throw new Error("a rule is firing, so it is not a quiet position");
  if (pnl <= RULES.stopLossPct * p.maxLoss) throw new Error("a rule is firing, so it is not a quiet position");
  // And the reason it was opened has gone, on the axes the Thesis Integrity
  // Score actually measures. Two of them, because the calendar does not always
  // oblige: between some pairs of months none of these markets flips its
  // seasonal sign, and a demo that only works nine months of the year is a demo
  // that lies for three.
  // Short volatility (vega < 0) recorded in a calmer market than today's: the
  // nerves have risen since, and that costs a short-premium position money
  // whatever the price does. This half is true on every date.
  if (!(p.thesis.vega < 0)) throw new Error("the condor is not recorded as short volatility");
  if (!(p.thesis.iv < underlying(p.ticker).iv)) throw new Error("it was not opened in a calmer market than today's");
  // the chance of profit recorded at entry has to be one a live condor cannot
  // still be claiming, or the score has nothing to fall from
  if (!(p.thesis.pop > 0.75)) throw new Error(`entry chance of ${p.thesis.pop} leaves no room to degrade`);
});

check("the copy never claims a seasonal break that did not happen", () => {
  // The Thesis Integrity Score reads seasonality off the same table this does,
  // so a note claiming the season has gone when the table says it has
  // strengthened is the demo being caught lying by its own screen. Between some
  // pairs of months none of these markets weakens — December into January every
  // one of them is MORE bearish — and the copy has to survive those months too.
  const U2 = { CORN: { iv: 0.24, step: 0.5 }, UNG: { iv: 0.45, step: 0.5 }, SOYB: { iv: 0.2, step: 0.5 }, WEAT: { iv: 0.26, step: 0.25 } };
  const und = (tk) => U2[tk] || { iv: 0.3, step: 0.5 };
  for (let day = 1; day <= 365; day += 5) {
    const now = new Date(2026, 0, day).getTime();
    const c = demoPositions({ spots: SPOTS, underlying: und, now }).find((x) => x.name === "Iron Condor");
    if (!c) throw new Error(`no third example on ${new Date(now).toDateString()}`);
    const then = c.thesis.seasonal;
    const nowSeasonal = SEASONAL[c.ticker][new Date(now).getMonth()];
    const broke = Math.sign(then) !== Math.sign(nowSeasonal) || Math.abs(nowSeasonal) < Math.abs(then) * 0.5;
    const note = c.timeline.map((e) => e.text).join(" ");
    if (note.includes("no longer the season we are in") && !broke) {
      throw new Error(`${new Date(now).toDateString()}: claims a seasonal break, but ${then} became ${nowSeasonal}`);
    }
    if (!broke && !note.includes("seasonal case is still standing")) {
      throw new Error(`${new Date(now).toDateString()}: the note does not say which half of the thesis broke`);
    }
  }
});

check("the timelines say what each example is there to teach", () => {
  const text = POS.map((p) => p.timeline.map((e) => e.text).join(" ")).join(" ");
  if (!/take-profit rule/.test(text)) throw new Error("the winning example does not explain itself");
  if (!/warning here, not an order/.test(text)) throw new Error("the losing example does not explain the stop");
  if (!/thesis/.test(text)) throw new Error("the third example does not name the thesis");
});

await Promise.all(pending);
ok.sort(); bad.sort();
console.log(ok.map((n) => "  ok   " + n).join("\n"));
if (bad.length) { console.log(bad.map(([n, e]) => "  FAIL " + n + " — " + e).join("\n")); }
console.log(`\n${ok.length} passed, ${bad.length} failed`);
process.exit(bad.length ? 1 : 0);
