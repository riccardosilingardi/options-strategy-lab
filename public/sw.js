/* ============================================================================
   THE SERVICE WORKER — and the only thing it is allowed to remember is the SHELL.

   WHAT A SERVICE WORKER IS. A small script the browser keeps after the page is
   closed, and runs IN FRONT of every request the app makes. That is what lets an
   installed app open from the home screen with no network. It is also what makes
   it dangerous here: a cache in front of every request is, by default, a machine
   for showing yesterday's prices as if they were today's.

   THE RULE, AND IT IS THE WHOLE FILE. The shell may be cached — the HTML, the
   JavaScript, the CSS, the icons. NOTHING ELSE MAY BE. Not /api/anything, not
   /.netlify/functions/anything: not the chain, not the bars, not the seasonal
   series, not the saved state, and above all not an order or a position. Those
   are NETWORK-ONLY. If the network is not there they FAIL, and a failed fetch is
   what the app already knows how to say out loud ("prices not loaded", and the
   offline banner beside it). A cached price rendered as current would be the app
   lying about the one thing it exists to get right.

   SO THE ROUTER DENIES BY DEFAULT. `routeOf()` below returns "never" unless a
   request positively proves it is a static shell asset. A new endpoint added to
   netlify.toml tomorrow is network-only without anybody remembering to come back
   here, because it was never on a list of things to cache in the first place.
   (`src/pwa.test.js` reads netlify.toml's redirects and asserts exactly that.)

   AND NAVIGATIONS GO TO THE NETWORK FIRST. The cached copy of index.html is the
   OFFLINE FALLBACK, never the normal path. A shell served from cache while the
   network was available is how a PWA gets stuck on the build it was installed
   from: index.html names a hashed bundle, so a stale shell pins a stale app. The
   version below is stamped by the build (see vite.config.js), so a deploy also
   drops the previous shell outright rather than layering on top of it.
============================================================================ */

// Rewritten at build time from the hashes of the emitted assets — see the
// `stampServiceWorker` plugin in vite.config.js. "dev" is what `vite dev` and a
// hand-run `vite preview` see, and it is correct for them: nothing was built.
const BUILD = "__OSL_BUILD__";
// The hashed files the build emitted, stamped in beside the version. It is a
// STRING until the build replaces it with an array — so this file is valid
// JavaScript before it is stamped as well as after, which is what lets
// `vite dev` run it and `src/pwa.test.js` load it. Unstamped it means "no built
// bundle to name", which is the truth in both of those places.
const BUILT = "__OSL_ASSETS__";
const CACHE = `osl-shell-${BUILD}`;

// The shell. The fixed half is written out here; the hashed half is stamped in
// by the build, because its name changes every time and nobody can type it.
//
// THE BUNDLE HAS TO BE PRECACHED, NOT PICKED UP ON THE WAY PAST. The "asset"
// route below would eventually cache it — but only on a visit where the worker
// was already in control, which is never the visit that installed it. So an app
// installed and then taken straight into airplane mode had a cached index.html
// naming a bundle that was in no cache of ours. It was measured booting anyway,
// off the browser's own HTTP cache, which is exactly the kind of thing that
// works until the phone evicts it. Precaching it here makes the offline launch
// a property of this file instead of a piece of luck.
const SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-512-maskable.png",
  "/apple-touch-icon-180.png",
].concat(Array.isArray(BUILT) ? BUILT : []);

// Anything under these is a live answer about money. Never cached, never served
// from a cache, no exceptions and no "but only when offline".
const NEVER_CACHE_PREFIXES = ["/api/", "/.netlify/"];

// A shell asset is recognised by its extension, not by where it sits. The list
// is deliberately short: if a file type is not on it, it is network-only.
const SHELL_EXTENSIONS = [".html", ".js", ".mjs", ".css", ".png", ".svg", ".ico", ".webmanifest", ".woff", ".woff2"];

/**
 * WHICH OF THE THREE THINGS THIS REQUEST IS.
 *
 *   "never"  — network-only, and never written to a cache. The default.
 *   "shell"  — a navigation: network first, the cached shell only if offline.
 *   "asset"  — a static file: cache first, because its name carries its hash.
 *
 * Pure, and it takes the two fields it needs rather than a Request, so a test
 * can ask it about a path without building a fetch event.
 */
function routeOf({ url, method = "GET", mode = "" } = {}) {
  // Only GET is ever cacheable. A POST is an instruction, not a document.
  if (String(method).toUpperCase() !== "GET") return "never";

  let u;
  try { u = new URL(url, self.location ? self.location.origin : "http://localhost"); }
  catch { return "never"; }

  // Someone else's origin is someone else's business.
  if (self.location && u.origin !== self.location.origin) return "never";

  // THE LINE THAT MATTERS. Prices, positions, orders, the state blob, the
  // Anthropic proxy — everything the app asks a server for lives under one of
  // these, and none of it may be remembered.
  if (NEVER_CACHE_PREFIXES.some((p) => u.pathname.startsWith(p))) return "never";

  // A navigation: the address bar, a home-screen launch, a reload.
  if (mode === "navigate") return "shell";

  const path = u.pathname.toLowerCase();
  const dot = path.lastIndexOf(".");
  const ext = dot > path.lastIndexOf("/") ? path.slice(dot) : "";
  if (ext && SHELL_EXTENSIONS.includes(ext)) return "asset";

  // An extensionless path that is not a navigation is not something we can
  // recognise, so it is not something we are willing to keep.
  return "never";
}

/* ---- install: take the shell, and do not wait to be asked twice ---------- */
self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // One at a time and forgiving: a single 404 on an icon must not abandon the
    // whole install and leave the app with no offline shell at all.
    await Promise.all(SHELL.map((u) => c.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

/* ---- activate: every older version goes ---------------------------------
   This is what "version the cache" buys. The new worker deletes every cache
   that is not its own, so a deploy REPLACES the shell instead of leaving the
   previous one behind to be served by some stale code path. */
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("osl-shell-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* ---- fetch --------------------------------------------------------------- */
self.addEventListener("fetch", (e) => {
  const route = routeOf({ url: e.request.url, method: e.request.method, mode: e.request.mode });

  // NETWORK-ONLY. Not `respondWith` at all: the request goes to the network
  // exactly as it would with no service worker installed, including its
  // credentials, and when it fails it fails in the app's own hands.
  if (route === "never") return;

  if (route === "shell") {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(e.request);
        // Only a real answer is worth keeping. A 401 from the password gate is
        // not a shell, and caching one would lock the app out of itself.
        if (fresh && fresh.ok) {
          const c = await caches.open(CACHE);
          c.put("/index.html", fresh.clone()).catch(() => {});
        }
        return fresh;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match("/index.html")) || (await c.match("/")) ||
          Response.error();
      }
    })());
    return;
  }

  // "asset": cache first. These names carry a content hash, so a hit is
  // always the right file and a miss is fetched once and kept.
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(e.request);
    if (hit) return hit;
    const fresh = await fetch(e.request);
    if (fresh && fresh.ok && fresh.type !== "opaque") c.put(e.request, fresh.clone()).catch(() => {});
    return fresh;
  })());
});

// THE ROUTER IS EXPORTED SO THE TEST DRIVES THE REAL FILE. There is no second
// copy of these rules anywhere: `src/pwa.test.js` loads THIS script and asks
// this function, so a rule cannot be right in a test and wrong in the worker.
if (typeof self !== "undefined") {
  self.OSL_SW = { routeOf, CACHE, BUILD, SHELL, NEVER_CACHE_PREFIXES, SHELL_EXTENSIONS };
}
