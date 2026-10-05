// src/deploy.test.js — DEPLOY PREVIEWS ARE READ-ONLY (redesign PR 2, TASK 0a).
//
// Every Netlify function that writes or sends is driven here with a stubbed context: a deploy preview, the published
// production deploy, an unpublished production deploy and no context at all. The blob store and the network are
// stand-ins that record every call, so "refused" means NOTHING reached upstream, not merely a 403 on the way out.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deployWrites, readOnlyResponse, PREVIEW_READ_ONLY, PREVIEW_BANNER, isPreviewContext, PREVIEW, BUILD_CONTEXT } from "./deploy.js";
import stateFn, { deps as stateDeps } from "../netlify/functions/state.mjs";
import alpacaFn from "../netlify/functions/alpaca.mjs";
import approveFn, { deps as approveDeps } from "../netlify/functions/approve.mjs";
import autopilotFn, { deps as autopilotDeps } from "../netlify/functions/autopilot.mjs";
import avFn, { deps as avDeps } from "../netlify/functions/av.mjs";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const PROD = { deploy: { context: "production", id: "d1", published: true } };
const PREVIEW_CTX = { deploy: { context: "deploy-preview", id: "d2", published: false } };
const BRANCH = { deploy: { context: "branch-deploy", id: "d3", published: false } };
const OLD_PROD = { deploy: { context: "production", id: "d0", published: false } };
const REFUSED = [["a deploy preview", PREVIEW_CTX], ["a branch deploy", BRANCH], ["an unpublished production deploy", OLD_PROD],
  ["no context at all", undefined], ["a context with no deploy", {}], ["a deploy with no context name", { deploy: { published: true } }]];

/** A blob store that records every read and write. */
function recordingStore(initial = {}) {
  const data = { ...initial };
  const calls = [];
  return {
    calls, data,
    store: {
      async get(k, opts) { calls.push(["get", k]); const v = data[k]; return opts?.type === "json" && v != null ? JSON.parse(v) : (v ?? null); },
      async set(k, v) { calls.push(["set", k]); data[k] = v; },
    },
  };
}
/** fetch, recorded. */
function recordingFetch(reply = { ok: true, status: 200, json: { id: "abc" } }) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push([String(url), init?.method || "GET"]);
    const body = JSON.stringify(reply.json);
    return { ok: reply.ok, status: reply.status, async text() { return body; }, async json() { return reply.json; } };
  };
  return { calls, fn };
}
const ENV = { ALPACA_KEY: "k", ALPACA_SECRET: "s", ALPHAVANTAGE_KEY: "av" };
globalThis.Netlify = { env: { get: (k) => ENV[k] ?? null }, context: null };
const realFetch = globalThis.fetch;
const withFetch = async (rec, fn) => { globalThis.fetch = rec.fn; try { return await fn(); } finally { globalThis.fetch = realFetch; } };

/* ---- the one check ---- */
test("deployWrites: only the published production deploy may write; unknown is not production", () => {
  assert.equal(deployWrites(PROD).ok, true);
  for (const [what, ctx] of REFUSED) assert.equal(deployWrites(ctx).ok, false, what);
  assert.match(deployWrites(PREVIEW_CTX).why, /deploy-preview/);
  assert.match(deployWrites(undefined).why, /could not be read/);
});
test("deployWrites falls back to Netlify.context, the global, when no argument is passed", () => {
  globalThis.Netlify.context = PROD;
  try { assert.equal(deployWrites().ok, true); } finally { globalThis.Netlify.context = null; }
  globalThis.Netlify.context = PREVIEW_CTX;
  try { assert.equal(deployWrites().ok, false); } finally { globalThis.Netlify.context = null; }
});
test("the refusal is a 403 with the sentence", async () => {
  const r = readOnlyResponse();
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, PREVIEW_READ_ONLY);
  assert.equal(PREVIEW_READ_ONLY, "Preview deploys are read-only: nothing is saved or sent from here.");
  assert.equal(PREVIEW_BANNER, "Preview · read-only: nothing here is saved or sent");
});

/* ---- state.mjs ---- */
const post = (url, body, method = "POST") => new Request(url, { method, body, headers: { "Content-Type": "application/json" } });
test("state.mjs: a preview's POST is 403 and the store is never touched", async () => {
  for (const [what, ctx] of REFUSED) {
    const rec = recordingStore({ state: '{"positions":[{"id":"GDX"}]}' });
    stateDeps.getStore = () => rec.store;
    const r = await stateFn(post("https://x/api/state", '{"positions":[]}'), ctx);
    assert.equal(r.status, 403, what);
    assert.equal((await r.json()).error, PREVIEW_READ_ONLY);
    assert.deepEqual(rec.calls, [], `${what}: nothing read or written`);
    assert.equal(rec.data.state, '{"positions":[{"id":"GDX"}]}', `${what}: production's book is intact`);
  }
});
test("state.mjs: the GET still reads on a preview; production's POST writes as before", async () => {
  const rec = recordingStore({ state: '{"positions":[1]}' });
  stateDeps.getStore = () => rec.store;
  const g = await stateFn(new Request("https://x/api/state"), PREVIEW_CTX);
  assert.equal(g.status, 200);
  assert.equal(await g.text(), '{"positions":[1]}');
  const p = await stateFn(post("https://x/api/state", '{"positions":[2]}'), PROD);
  assert.equal(p.status, 200);
  assert.deepEqual(await p.json(), { ok: true });
  assert.equal(rec.data.state, '{"positions":[2]}');
});

/* ---- alpaca.mjs ---- */
const alpacaReq = (method, path, body) => new Request(`https://x/api/alpaca?path=${encodeURIComponent(path)}`,
  { method, body, headers: { "Content-Type": "application/json" } });
const SENDS = [["POST", "/v2/orders", '{"qty":"1"}'], ["PATCH", "/v2/orders/abc-123", '{"limit_price":"1.00"}'],
  ["DELETE", "/v2/orders/abc-123"], ["DELETE", "/v2/orders"]];
test("alpaca.mjs: every order, replace and cancel from a preview is 403 and nothing reaches Alpaca", async () => {
  for (const [what, ctx] of REFUSED) {
    for (const [m, p, b] of SENDS) {
      const f = recordingFetch();
      const r = await withFetch(f, () => alpacaFn(alpacaReq(m, p, b), ctx));
      assert.equal(r.status, 403, `${what}: ${m} ${p}`);
      assert.equal((await r.json()).error, PREVIEW_READ_ONLY);
      assert.equal(f.calls.length, 0, `${what}: ${m} ${p} sent nothing upstream`);
    }
  }
});
test("alpaca.mjs: the reads still pass on a preview", async () => {
  for (const p of ["/v2/account", "/v2/clock", "/v2/positions", "/v2/orders?status=open", "/v2/orders/abc-123", "/v2/options/contracts?underlying_symbols=GDX"]) {
    const f = recordingFetch({ ok: true, status: 200, json: { ok: 1 } });
    const r = await withFetch(f, () => alpacaFn(alpacaReq("GET", p), PREVIEW_CTX));
    assert.equal(r.status, 200, p);
    assert.equal(r.headers.get("X-OSL-Paper-Endpoint"), "paper-api.alpaca.markets");
    assert.deepEqual(f.calls, [[`https://paper-api.alpaca.markets${p}`, "GET"]], p);
  }
});
test("alpaca.mjs: production sends exactly as before", async () => {
  for (const [m, p, b] of SENDS) {
    const f = recordingFetch({ ok: true, status: 200, json: { id: "o1" } });
    const r = await withFetch(f, () => alpacaFn(alpacaReq(m, p, b), PROD));
    assert.equal(r.status, 200, `${m} ${p}`);
    assert.deepEqual(f.calls, [[`https://paper-api.alpaca.markets${p}`, m]]);
  }
  // The allowlist still answers first: a liquidation is 405 on production, as before.
  const f = recordingFetch();
  const r = await withFetch(f, () => alpacaFn(alpacaReq("DELETE", "/v2/positions"), PROD));
  assert.equal(r.status, 405);
  assert.equal(f.calls.length, 0);
});

/* ---- approve.mjs ---- */
test("approve.mjs: a preview gets a 403 page and nothing is read, sent or written", async () => {
  for (const [what, ctx] of REFUSED) {
    const rec = recordingStore({ approvals: JSON.stringify({ a1: { exp: Date.now() + 1e6, orderIntent: {} } }) });
    approveDeps.getStore = () => rec.store;
    const f = recordingFetch();
    const r = await withFetch(f, () => approveFn(new Request("https://x/api/approve?id=a1"), ctx));
    assert.equal(r.status, 403, what);
    assert.ok((await r.text()).includes(PREVIEW_READ_ONLY), what);
    assert.deepEqual(rec.calls, [], `${what}: the store is not touched`);
    assert.equal(f.calls.length, 0, `${what}: nothing sent`);
  }
});
test("approve.mjs: production reads the approvals as before", async () => {
  const rec = recordingStore({ approvals: "{}" });
  approveDeps.getStore = () => rec.store;
  const r = await approveFn(new Request("https://x/api/approve?id=nope"), PROD);
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("Link not valid"));
  assert.deepEqual(rec.calls, [["get", "approvals"]]);
});

/* ---- autopilot.mjs ---- */
test("autopilot.mjs: off production it reads nothing, writes nothing, sends nothing", async () => {
  for (const [what, ctx] of REFUSED) {
    const rec = recordingStore({ state: JSON.stringify({ positions: [], settings: { notifyWhenReady: true } }) });
    autopilotDeps.getStore = () => rec.store;
    const f = recordingFetch();
    const r = await withFetch(f, () => autopilotFn(new Request("https://x/"), ctx));
    assert.equal(r.status, 403, what);
    assert.deepEqual(rec.calls, [], `${what}: the store is not touched`);
    assert.equal(f.calls.length, 0, `${what}: no AI, no webhook, no chain`);
  }
});
test("autopilot.mjs: production runs as before (no positions, nothing asked: it stops after reading)", async () => {
  const rec = recordingStore({ state: JSON.stringify({ positions: [] }) });
  autopilotDeps.getStore = () => rec.store;
  const r = await autopilotFn(new Request("https://x/"), PROD);
  assert.equal(await r.text(), "no positions");
  assert.deepEqual(rec.calls.map((c) => c[0]), ["get", "get", "get"]);
});

/* ---- av.mjs ---- */
const AV_BODY = { "Monthly Adjusted Time Series": { "2026-09-30": { "5. adjusted close": "10" } } };
test("av.mjs: a preview serves the live answer and never saves it into the site-wide store", async () => {
  for (const [what, ctx] of REFUSED) {
    const rec = recordingStore();
    avDeps.getStore = () => rec.store;
    const f = recordingFetch({ ok: true, status: 200, json: AV_BODY });
    const r = await withFetch(f, () => avFn(new Request("https://x/api/av?sym=CORN"), ctx));
    assert.equal(r.status, 200, what);
    assert.equal((await r.json())._osl.source, "live");
    assert.deepEqual(rec.calls.filter((c) => c[0] === "set"), [], `${what}: no write`);
  }
});
test("av.mjs: a preview still reads the cache; production saves as before", async () => {
  const cached = JSON.stringify({ at: Date.now(), body: AV_BODY });
  const rec = recordingStore({ "av/CORN.json": cached });
  avDeps.getStore = () => rec.store;
  const f = recordingFetch();
  const r = await withFetch(f, () => avFn(new Request("https://x/api/av?sym=CORN"), PREVIEW_CTX));
  assert.equal((await r.json())._osl.source, "cache");
  assert.equal(f.calls.length, 0);
  const rec2 = recordingStore();
  avDeps.getStore = () => rec2.store;
  const f2 = recordingFetch({ ok: true, status: 200, json: AV_BODY });
  await withFetch(f2, () => avFn(new Request("https://x/api/av?sym=CORN"), PROD));
  assert.deepEqual(rec2.calls.filter((c) => c[0] === "set"), [["set", "av/CORN.json"]]);
});

/* ---- every writer asks, and the readers do not ---- */
test("every function that writes or sends asks deployWrites(); the read-only ones do not", () => {
  for (const f of ["state", "alpaca", "approve", "autopilot", "av"]) {
    assert.match(readFileSync(`netlify/functions/${f}.mjs`, "utf8"), /deployWrites\(context\)/, f);
  }
  for (const f of ["chain", "chainAlpaca", "bars", "liquidity", "proxy"]) {
    const src = readFileSync(`netlify/functions/${f}.mjs`, "utf8");
    assert.doesNotMatch(src, /getStore|@netlify\/blobs/, `${f} opens no blob store`);
    assert.doesNotMatch(src, /method:\s*["'](POST|PATCH|DELETE)["']/, `${f} sends nothing`);
  }
});

/* ---- the client's side ---- */
test("the client: a vite build stamped anything but production is a preview; no stamp (a test, a script) is not", () => {
  assert.equal(isPreviewContext("production"), false);
  for (const s of ["deploy-preview", "branch-deploy", "dev", "unknown"]) assert.equal(isPreviewContext(s), true, s);
  assert.equal(isPreviewContext(undefined), false);
  assert.equal(PREVIEW, false, "this test runs unstamped");
  assert.equal(BUILD_CONTEXT, null);
  const vite = readFileSync("vite.config.js", "utf8");
  assert.match(vite, /__OSL_DEPLOY_CONTEXT__:\s*JSON\.stringify\(process\.env\.CONTEXT \|\| "unknown"\)/);
});
test("the client never saves to /api/state on a preview, and says so on every screen", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  assert.match(app, /if \(DEMO \|\| PREVIEW\) return;/, "saveState skips the POST");
  assert.match(app, /<PreviewBanner \/>/);
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
