/* ============================================================================
   THE INSTALLABLE APP — the two things about it that can silently be wrong.

   1. THE SERVICE WORKER'S ROUTE RULE. A cache in front of every request is one
      typo away from serving yesterday's price as today's. So this loads THE
      REAL public/sw.js — not a copy of its rules — and asks its router about
      every path the app actually calls, read out of netlify.toml. A seventh
      endpoint added there tomorrow is covered by this test the day it is added.

   2. THE MANIFEST. It is static JSON, so it cannot import `src/theme.js`, which
      means its two colours are a COPY of theme tokens. A copy nothing checks is
      the bug; this is the check — the same arrangement as `src/basket.js` and
      `src/liquidity.test.js`. It also opens every icon the manifest names,
      because a manifest that parses and points at a missing file installs an
      app with no picture and says nothing about it.
============================================================================ */

import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { PALETTES } from "./theme.js";

let pass = 0, fail = 0;
const test = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); pass++; }
  catch (e) { console.log(`  FAIL ${name}`); console.log(e); fail++; }
};

console.log("\nTHE PWA — the shell may be cached, a price may not\n");

/* ------------------------------------------------------------------
   Load the real service worker.

   A service worker script cannot simply be imported: it talks to `self`,
   `caches` and `addEventListener`, none of which exist in node. So it runs in a
   vm with those stubbed, and hands its router back on `self.OSL_SW` — which is
   how the worker itself is wired, not an affordance added for the test.
------------------------------------------------------------------ */
const SW_SRC = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://strategy-lab-optiontrading.netlify.app";
const selfStub = {
  location: { origin: ORIGIN },
  addEventListener: () => {},
  skipWaiting: async () => {},
  clients: { claim: async () => {} },
};
const ctx = createContext({
  self: selfStub, caches: { open: async () => ({}), keys: async () => [], match: async () => null, delete: async () => true },
  fetch: async () => ({}), Request: class {}, Response: { error: () => ({}) }, URL, console,
});
runInContext(SW_SRC, ctx);
const SW = selfStub.OSL_SW;
const route = (path, opts = {}) => SW.routeOf({ url: ORIGIN + path, method: "GET", mode: "", ...opts });

test("the worker exposes its router, so this test drives the real rules", () => {
  assert.equal(typeof SW?.routeOf, "function");
});

/* ---- 1) EVERY /api/* PATH IS NETWORK-ONLY -------------------------------
   Read out of netlify.toml so the list cannot fall behind the app. */

const TOML = readFileSync(new URL("../netlify.toml", import.meta.url), "utf8");
const apiPaths = [...TOML.matchAll(/from\s*=\s*"(\/api\/[^"]+)"/g)].map((m) => m[1]);

test("netlify.toml really does declare the /api paths this reads", () => {
  // If the redirects are ever renamed, this test must fail loudly rather than
  // quietly asserting nothing about an empty list.
  assert.ok(apiPaths.length >= 8, `found only ${apiPaths.length}: ${apiPaths.join(", ")}`);
  for (const p of ["/api/chain", "/api/alpaca", "/api/state", "/api/approve"]) {
    assert.ok(apiPaths.includes(p), `${p} missing from netlify.toml`);
  }
});

for (const p of apiPaths) {
  test(`${p} is never cached`, () => assert.equal(route(p), "never"));
}

test("/api/ai — the edge function, which claims its path instead of redirecting — is never cached", () => {
  assert.equal(route("/api/ai"), "never");
});

test("a query string does not sneak an /api path past the rule", () => {
  assert.equal(route("/api/chain?ticker=BOIL&exp=2026-10-16"), "never");
  assert.equal(route("/api/bars?tk=UNG&_=1758000000000"), "never");
});

test("an /api path that LOOKS like a static file is still never cached", () => {
  // The extension test must not be reachable for these: the prefix wins.
  assert.equal(route("/api/state.json"), "never");
  assert.equal(route("/api/chain/BOIL.js"), "never");
  assert.equal(route("/api/report.html"), "never");
  assert.equal(route("/api/icon-192.png"), "never");
});

test("a navigation to an /api path is still never cached", () => {
  assert.equal(route("/api/approve?id=abc", { mode: "navigate" }), "never");
});

test("the functions are never cached under their own path either", () => {
  for (const p of ["/.netlify/functions/alpaca", "/.netlify/functions/approve",
                   "/.netlify/functions/state", "/.netlify/functions/autopilot",
                   "/.netlify/edge-functions/ai"]) {
    assert.equal(route(p), "never", p);
  }
});

test("nothing but GET is ever cacheable — an order is an instruction, not a document", () => {
  for (const m of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "post"]) {
    assert.equal(route("/index.html", { method: m }), "never", m);
    assert.equal(route("/assets/index-abc123.js", { method: m }), "never", m);
  }
});

test("another origin is never cached, whatever it is serving", () => {
  assert.equal(SW.routeOf({ url: "https://data.alpaca.markets/v1beta1/options/snapshots/BOIL" }), "never");
  assert.equal(SW.routeOf({ url: "https://paper-api.alpaca.markets/v2/orders" }), "never");
  assert.equal(SW.routeOf({ url: "https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY" }), "never");
});

test("THE RULE DENIES BY DEFAULT — an unrecognised path is not cached", () => {
  // This is the property that makes a new endpoint safe without anyone
  // remembering to come back to sw.js.
  assert.equal(route("/something-nobody-has-written-yet"), "never");
  assert.equal(route("/data/positions"), "never");
  assert.equal(route("/orders.csv"), "never");   // an extension, but not a shell one
});

/* ---- the other side: the shell IS cached -------------------------------- */

test("a navigation is the shell, fetched from the network first", () => {
  assert.equal(route("/", { mode: "navigate" }), "shell");
  assert.equal(route("/index.html", { mode: "navigate" }), "shell");
});

test("the hashed bundle and the icons are assets", () => {
  assert.equal(route("/assets/index-Cps-uLhz.js"), "asset");
  assert.equal(route("/assets/index-Cps-uLhz.css"), "asset");
  assert.equal(route("/icon-192.png"), "asset");
  assert.equal(route("/apple-touch-icon-180.png"), "asset");
  assert.equal(route("/manifest.webmanifest"), "asset");
});

test("the never-cache prefixes are the two that matter, and they are written once", () => {
  // Spread: the worker ran in a vm, so its Array has a different realm's prototype.
  assert.deepEqual([...SW.NEVER_CACHE_PREFIXES], ["/api/", "/.netlify/"]);
});

test("THE SHELL PRECACHES THE BUILT BUNDLE, not just the HTML that names it", () => {
  // The visit that INSTALLS a worker is never a visit it controls, so nothing
  // it merely intercepts is in the cache yet. An app installed and taken
  // straight into airplane mode therefore had a cached index.html pointing at a
  // bundle in no cache of ours — it booted off the browser's own HTTP cache,
  // which lasts exactly until the phone decides otherwise.
  const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.ok(SW_SRC.includes('"__OSL_ASSETS__"'), "sw.js no longer has a slot for the built files");
  assert.ok(/\.concat\(/.test(SW_SRC), "the stamped assets are not joined onto the shell");
  assert.ok(vite.includes('"__OSL_ASSETS__"'), "nothing stamps the built files into the shell");
  assert.ok(vite.includes("/assets/"), "the stamp does not name the emitted files");
});

test("unstamped, the shell is still the fixed half and nothing throws", () => {
  // The placeholder is a STRING, so this file is valid before the build as well
  // as after — which is what lets `vite dev` serve it and this test load it.
  assert.ok(Array.isArray(SW.SHELL));
  for (const p of ["/", "/index.html", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon-180.png"]) {
    assert.ok([...SW.SHELL].includes(p), `${p} is not in the shell`);
  }
  assert.ok(![...SW.SHELL].some((x) => typeof x !== "string"), "the unstamped placeholder leaked into the shell");
});

test("the cache name carries a version, so a deploy replaces the shell", () => {
  assert.ok(/^osl-shell-/.test(SW.CACHE), SW.CACHE);
  // In the repo the placeholder is still in place: vite.config.js stamps it at
  // build time. If this ever reads as a fixed string, the worker would never
  // update and every deploy after the first would be invisible.
  assert.ok(SW_SRC.includes("__OSL_BUILD__"), "sw.js lost its build placeholder");
  const vite = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
  assert.ok(vite.includes("__OSL_BUILD__"), "nothing stamps the placeholder at build time");
});

/* ---- 2) THE MANIFEST ---------------------------------------------------- */

const MANIFEST_PATH = new URL("../public/manifest.webmanifest", import.meta.url);
let M = null;

test("the manifest parses", () => {
  M = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
});

test("it says what the app is called, and launches standalone from /", () => {
  assert.equal(M.name, "Options Strategy Lab");
  assert.equal(M.short_name, "OSL");
  assert.equal(M.display, "standalone");
  assert.equal(M.start_url, "/");
});

test("ITS COLOURS ARE THE THEME'S, not a second opinion about them", () => {
  // Static JSON cannot import theme.js, so this is the thing that stops the
  // splash screen drifting away from the page it opens on. Light is the
  // default (CLAUDE.md), so the light palette is the one an install shows.
  assert.equal(M.background_color, PALETTES.light.bg);
  assert.equal(M.theme_color, PALETTES.light.bg);
});

test("index.html's theme-color agrees with the manifest, and its dark one with the dark palette", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const meta = /<meta\s+name="theme-color"\s+content="([^"]+)"/.exec(html);
  assert.ok(meta, "index.html has no theme-color");
  assert.equal(meta[1], M.theme_color);
  assert.ok(html.includes(`"${PALETTES.dark.bg}"`), "the stored-dark first paint no longer uses the dark palette's background");
});

test("every icon the manifest names is a PNG that exists and is not empty", () => {
  assert.ok(M.icons.length >= 3);
  for (const ic of M.icons) {
    assert.ok(ic.src.startsWith("/"), `${ic.src} is not rooted`);
    assert.equal(ic.type, "image/png");
    const f = new URL("../public" + ic.src, import.meta.url);
    const st = statSync(f);           // throws if it is not there
    assert.ok(st.size > 200, `${ic.src} is ${st.size} bytes`);
    // A real PNG, not a renamed something-else.
    const head = readFileSync(f).subarray(0, 8);
    assert.deepEqual([...head], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${ic.src} is not a PNG`);
  }
});

test("the sizes it claims are the sizes the files are", () => {
  for (const ic of M.icons) {
    const buf = readFileSync(new URL("../public" + ic.src, import.meta.url));
    // IHDR is the first chunk: width and height are big-endian at byte 16.
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    assert.equal(`${w}x${h}`, ic.sizes, `${ic.src} is ${w}x${h} but claims ${ic.sizes}`);
  }
});

test("there is a 192, a 512 and a MASKABLE 512", () => {
  assert.ok(M.icons.some((i) => i.sizes === "192x192"));
  assert.ok(M.icons.some((i) => i.sizes === "512x512" && i.purpose === "any"));
  assert.ok(M.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"),
    "without a maskable icon Android crops the tile however it likes");
});

test("Safari's icon is linked from the page, because iOS does not read the manifest for it", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(/rel="apple-touch-icon"[^>]*href="\/apple-touch-icon-180\.png"/.test(html));
  const buf = readFileSync(new URL("../public/apple-touch-icon-180.png", import.meta.url));
  assert.equal(buf.readUInt32BE(16), 180);
  assert.equal(buf.readUInt32BE(20), 180);
});

test("the page links the manifest and asks for the full screen", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  assert.ok(/rel="manifest"[^>]*href="\/manifest\.webmanifest"/.test(html));
  assert.ok(html.includes("viewport-fit=cover"));
  assert.ok(/name="apple-mobile-web-app-capable"\s+content="yes"/.test(html));
  assert.ok(html.includes("env(safe-area-inset-top)"), "viewport-fit=cover with no safe-area inset puts content under the notch");
});

/* ---- 3) THE GATE LETS THE MANIFEST THROUGH, AND NOTHING ELSE NEW --------- */

test("the manifest and its icons are excluded from the password gate", () => {
  // Fetched without credentials by the browser's install machinery: behind
  // Basic Auth they 401 and the install offer never appears.
  const block = /function\s*=\s*"gate"[\s\S]*?excludedPath\s*=\s*\[([\s\S]*?)\]/.exec(TOML);
  assert.ok(block, "the gate declares no excludedPath");
  const excluded = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(excluded.includes("/manifest.webmanifest"));
  for (const ic of M.icons) assert.ok(excluded.includes(ic.src), `${ic.src} is still behind the gate`);
  assert.ok(excluded.includes("/apple-touch-icon-180.png"));
});

test("NOTHING ELSE LEFT THE GATE — the app, the api and the worker stay behind it", () => {
  const block = /function\s*=\s*"gate"[\s\S]*?excludedPath\s*=\s*\[([\s\S]*?)\]/.exec(TOML);
  const excluded = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const allowed = new Set(["/api/approve", "/manifest.webmanifest", "/apple-touch-icon-180.png",
    ...M.icons.map((i) => i.src)]);
  for (const p of excluded) assert.ok(allowed.has(p), `${p} was let out of the gate and should not be`);
  // The worker is the app, and the app is behind the password.
  assert.ok(!excluded.includes("/sw.js"));
  assert.ok(!excluded.includes("/index.html") && !excluded.includes("/"));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
