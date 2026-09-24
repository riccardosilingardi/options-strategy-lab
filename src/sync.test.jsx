// ============================================================================
// src/sync.test.jsx — A BROWSER WITH NOTHING SAVED STARTS FROM THE SERVER'S
// BOOK (PR #42).
//
// The owner's phone, 23 Sep 2026: the app opened from a link rather than its
// installed icon started empty, re-imported the GDX holding as a stranger, and
// its first save overwrote the server's copy the autopilot reads.
// ============================================================================
import { readFileSync } from "node:fs";
import { hydrateFromServer } from "./App.jsx";

const ok = [], bad = [];
const check = (n, f) => { try { f(); ok.push(n); console.log(`  ok   ${n}`); }
  catch (e) { bad.push([n, e.message]); console.log(`  FAIL ${n} — ${e.message}`); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

const J1 = { id: 1, ref: "J-0001", ticker: "GDX", legs: [{ side: 1, qty: 1, type: "put", strike: 94 }], entryNet: 5, contracts: 9 };
const SRV = { positions: [J1], settings: { capital: 100000, concurrentTarget: 20, sizingFree: null, notifyWhenReady: true, stray: "x" } };

check("NOTHING SAVED HERE: the server's positions and synced settings are adopted", () => {
  const r = hydrateFromServer(null, SRV);
  eq(r.positions.length, 1, "the book");
  eq(r.positions[0].ref, "J-0001", "with its ref — not re-imported as a stranger");
  eq(r.settings.capital, 100000, "the capital answer");
  eq(r.settings.notifyWhenReady, true, "a synced setting");
  eq(r.settings.stray, undefined, "only the settings the sync payload carries");
  eq(r.restoredFromServer, true, "and it says where it came from");
});

check("A LOCAL STORE ALWAYS WINS — even an empty one, which is the owner's own newer word", () => {
  const local = { positions: [], settings: {} };
  eq(hydrateFromServer(local, SRV), local, "an emptied book stays empty");
  const mine = { positions: [J1] };
  eq(hydrateFromServer(mine, { positions: [] }), mine, "the server never overwrites this browser");
});

check("NOTHING ANYWHERE is nothing: no invented state", () => {
  eq(hydrateFromServer(null, { positions: [] }), null, "an empty server");
  eq(hydrateFromServer(null, null), null, "no server");
  eq(hydrateFromServer(null, {}), null, "a server with no book");
});

check("THE STARTUP READS IT BEFORE ANYTHING ELSE RUNS, and a restored browser skips setup", () => {
  const app = readFileSync("src/App.jsx", "utf8");
  const at = app.indexOf("const restored = hydrateFromServer(local, srv);");
  if (at < 0) throw new Error("startup does not restore");
  if (!/settings: \{ \.\.\.EMPTY\.settings, \.\.\.restored\.settings, onboarded: true \}/.test(app)) throw new Error("setup would run again");
  // Restored before the merge loop, the sanitiser and the first save.
  if (!(at < app.indexOf("const okPos = (p) =>"))) throw new Error("restored too late");
});

console.log(`\n${ok.length} passed, ${bad.length} failed\n`);
for (const [n, m] of bad) console.error(`FAILED: ${n}\n  ${m}`);
if (bad.length) process.exit(1);
