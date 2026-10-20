// src/journalSync.test.js — ONE JOURNAL ON EVERY DEVICE (PR 71, owner 19 Oct 2026).
//
// Two devices — the phone and the computer — each with its own browser store, one server blob. Driven through the
// merge functions (src/journalSync.js) and through the server's own POST (netlify/functions/state.mjs) on a recording
// blob store, so "kept" means kept in what the server stored, not merely in a return value.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mergeJournals, mergeJournalState, journalBehind, filedElsewhere, mergeStateBody, journalKey, entryStamp, touchEntry,
  mergedSeq } from "./journalSync.js";
import { nextRef, journalEntry, refOf } from "./journal.js";
import { journalSyncLine, restoredFromServerLine, filedElsewhereLine } from "./journalView.js";
import stateFn, { deps as stateDeps } from "../netlify/functions/state.mjs";

let passed = 0, failed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const entry = (n, { t = n * 1000, updatedAt, lines = 1, id = 100 + n, ticker = "UNG" } = {}) => ({
  id, ref: refOf(n), t, ...(updatedAt != null ? { updatedAt } : {}), ticker, name: "Bull put spread", legs: [],
  timeline: Array.from({ length: lines }, (_, i) => ({ t: t + i, n: i + 1, text: `line ${i + 1}` })),
});
const PROD = { deploy: { context: "production", id: "d1", published: true } };
const PREVIEW_CTX = { deploy: { context: "deploy-preview", id: "d2", published: false } };
function recordingStore(initial = {}) {
  const data = { ...initial };
  const calls = [];
  return { calls, data, store: {
    async get(k) { calls.push(["get", k]); return data[k] ?? null; },
    async set(k, v) { calls.push(["set", k]); data[k] = v; },
  } };
}
const post = (body) => new Request("https://x/api/state", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });
const stored = (rec) => JSON.parse(rec.data.state);

/* ---- the merge ---- */
test("TWO DEVICES: a new entry on each side and an edit conflict on a third — every entry once, the newer edit wins", () => {
  const shared = entry(1, { updatedAt: 1000, lines: 1 });
  const phone = [touchEntry({ ...shared, timeline: [...shared.timeline, { t: 5000, n: 2, text: "phone's line" }] }, 5000), entry(2)];
  const computer = [touchEntry({ ...shared, timeline: [...shared.timeline, { t: 7000, n: 2, text: "computer's line" }] }, 7000), entry(3)];
  const m = mergeJournals(phone, computer);
  assert.deepEqual(m.map((e) => e.ref), ["J-0001", "J-0002", "J-0003"], "each entry once, in filing order");
  assert.equal(m[0].timeline[1].text, "computer's line", "the newer edit (7000) wins the conflict");
  // The same two lists the other way round give the same answer: the merge does not favour a side.
  assert.deepEqual(mergeJournals(computer, phone), m);
});
test("AN ENTRY FILED BEFORE PR 71 (no updatedAt) is read at its filing time; a later edit beats it", () => {
  const old = entry(4, { t: 4000 });
  assert.equal(entryStamp(old), 4000);
  const edited = touchEntry({ ...old, timeline: [...old.timeline, { t: 9000, n: 2, text: "lesson" }] }, 9000);
  assert.equal(mergeJournals([old], [edited])[0].timeline.length, 2);
  assert.equal(mergeJournals([edited], [old])[0].timeline.length, 2);
  // A tie keeps the longer timeline.
  assert.equal(mergeJournals([old], [{ ...old, timeline: [...old.timeline, { t: 4001, n: 2 }] }])[0].timeline.length, 2);
});
test("TWO TRADES THAT SHARE A REF (two devices each issued J-0010 before PR 71) stay two entries", () => {
  const a = entry(10, { id: 1 }), b = entry(10, { id: 2, ticker: "GLD" });
  assert.notEqual(journalKey(a), journalKey(b));
  assert.equal(mergeJournals([a], [b]).length, 2, "neither overwrites the other");
});
test("journalEntry() stamps updatedAt at filing", () => {
  const e = journalEntry({ pos: { id: 9, ref: "J-0009", ticker: "UNG", legs: [] }, t: 1234 });
  assert.equal(e.updatedAt, 1234);
});

/* ---- nothing is deleted ---- */
test("AN EMPTY BROWSER NEVER ERASES: merged on the load, and on the server's POST", async () => {
  const srv = { positions: [], journal: [entry(1), entry(2)], journalSeq: 2 };
  // The load: this browser has nothing in its Journal.
  const m = mergeJournalState({ journal: [], journalSeq: 0 }, srv);
  assert.equal(m.journal.length, 2, "the load keeps the server's entries");
  assert.equal(m.journalSeq, 2);
  // The server: an empty browser posts an empty Journal and a zero counter.
  const rec = recordingStore({ state: JSON.stringify(srv) });
  stateDeps.getStore = () => rec.store;
  const r = await stateFn(post({ positions: [], settings: {}, journal: [], journalSeq: 0 }), PROD);
  assert.equal(r.status, 200);
  assert.equal(stored(rec).journal.length, 2, "the server keeps both entries");
  assert.equal(stored(rec).journalSeq, 2, "and its counter");
  // A body with no Journal at all (a build from before PR 71) changes neither.
  await stateFn(post({ positions: [{ id: 1, ref: "J-0003" }], settings: {} }), PROD);
  assert.equal(stored(rec).journal.length, 2);
  assert.equal(stored(rec).journalSeq, 3, "the counter moves to the highest ref seen, never down");
});
test("THE SERVER'S POST: positions and settings replaced as before, the Journal merged; a Journal-only upload leaves the positions", async () => {
  const rec = recordingStore({ state: JSON.stringify({ positions: [{ id: 1, ref: "J-0001" }], settings: { capital: 5 }, journal: [entry(2)], journalSeq: 2 }) });
  stateDeps.getStore = () => rec.store;
  await stateFn(post({ positions: [], settings: { capital: 9 }, journal: [entry(3)], journalSeq: 3 }), PROD);
  assert.deepEqual(stored(rec).positions, [], "positions replaced (the last save wins, unchanged)");
  assert.equal(stored(rec).settings.capital, 9, "settings replaced");
  assert.deepEqual(stored(rec).journal.map((e) => e.ref), ["J-0002", "J-0003"], "the Journal merged");
  await stateFn(post({ journal: [entry(4)], journalSeq: 4 }), PROD);
  assert.deepEqual(stored(rec).positions, [], "a Journal-only upload does not touch the positions");
  assert.equal(stored(rec).settings.capital, 9);
  assert.equal(stored(rec).journal.length, 3);
  // Not JSON: refused in words, nothing written.
  const before = rec.data.state;
  const bad = await stateFn(new Request("https://x/api/state", { method: "POST", body: "{nope" }), PROD);
  assert.equal(bad.status, 400);
  assert.equal(rec.data.state, before);
});
test("A PREVIEW CANNOT WRITE THE JOURNAL: 403, the store never read or written", async () => {
  const rec = recordingStore({ state: JSON.stringify({ journal: [entry(1)], journalSeq: 1 }) });
  stateDeps.getStore = () => rec.store;
  const r = await stateFn(post({ journal: [entry(1), entry(2)], journalSeq: 2 }), PREVIEW_CTX);
  assert.equal(r.status, 403);
  assert.deepEqual(rec.calls, []);
  assert.equal(stored(rec).journal.length, 1);
  // And the client never uploads from a preview (the load's upload is guarded by PREVIEW, the save returns before fetch).
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("if (behind && !PREVIEW) {"), "the load's upload skips a preview");
  const save = app.slice(app.indexOf("async function saveState(st) {"), app.indexOf("/* ============================== UI ATOMS"));
  assert.ok(save.indexOf("if (DEMO || PREVIEW) return;") > 0 && save.indexOf("if (DEMO || PREVIEW) return;") < save.indexOf('fetch("/api/state", { method: "POST"'),
    "the save returns before posting on a preview");
});

/* ---- the counter ---- */
test("THE REF COUNTER NEVER REPEATS: a device that reloads after the other opened J-0011 issues J-0012", () => {
  const computer = { positions: [{ id: 11, ref: "J-0011" }], journal: [entry(1)], journalSeq: 11 };
  const phone = { positions: [], journal: [entry(1)], journalSeq: 10 };
  const m = mergeJournalState(phone, computer);
  assert.equal(m.journalSeq, 11);
  assert.equal(nextRef({ ...phone, ...m }).ref, "J-0012");
  // The counter is the highest of the counters AND of every ref either side holds, open or filed.
  assert.equal(mergedSeq({ journalSeq: 3, positions: [{ ref: "J-0007" }] }, { journal: [entry(9)] }), 9);
  // A body with a lower counter never lowers the server's.
  assert.equal(mergeStateBody({ journalSeq: 20 }, { journalSeq: 5 }).journalSeq, 20);
  // Before a new ref is issued the server's counter is read (App.jsx `serverSeq()`), so two open devices do not collide.
  const app = readFileSync("src/App.jsx", "utf8");
  assert.ok(app.includes("const srvSeq = await serverSeq();"), "commitPosition reads the server's counter first");
  assert.ok(app.includes("nextRef({ ...store, journalSeq: Math.max(+store.journalSeq || 0, srvSeq) })"));
});

/* ---- the load ---- */
test("journalBehind: the server lacks an entry, holds an older copy, or a lower counter — then the Journal is uploaded once", () => {
  const srv = { journal: [entry(1, { updatedAt: 1000 })], journalSeq: 1 };
  assert.equal(journalBehind(srv, mergeJournalState({ journal: [] }, srv)), false, "nothing to upload");
  assert.equal(journalBehind(srv, mergeJournalState({ journal: [entry(2)] }, srv)), true, "a local entry the server lacks");
  assert.equal(journalBehind(srv, mergeJournalState({ journal: [touchEntry(entry(1), 5000)] }, srv)), true, "a newer local edit");
  assert.equal(journalBehind(srv, { journal: srv.journal, journalSeq: 4 }), true, "a higher local counter");
});
test("A POSITION FILED ON ANOTHER DEVICE closes here: matched by id AND ref, never by ref alone", () => {
  const open = [{ id: 101, ref: "J-0001" }, { id: 555, ref: "J-0002" }, { id: 103, ref: "J-0003" }];
  const journal = [entry(1), entry(2) /* id 102: a different trade that once got J-0002 */];
  assert.deepEqual(filedElsewhere(open, journal), [101]);
  assert.equal(filedElsewhereLine(1), "1 position was closed and filed in the Journal on another device: it is no longer shown as open here.");
});

/* ---- the words ---- */
test("THE LINE UNDER THE TITLE: saved with its time, amber when the server did not answer, nothing before it is known", () => {
  const at = new Date(2026, 9, 19, 14, 5).getTime();
  assert.deepEqual(journalSyncLine({ ok: true, at }), { text: "Saved on the server · updated 14:05", warn: false });
  assert.deepEqual(journalSyncLine({ ok: false, at }), { text: "Only on this device: the server did not answer", warn: true });
  assert.equal(journalSyncLine({ ok: null }), null);
  assert.equal(restoredFromServerLine(2, 5), "This browser had nothing saved, so your 2 open positions and the Journal (5 entries) were loaded from the server.");
  assert.equal(restoredFromServerLine(0, 1), "This browser had nothing saved, so the Journal (1 entry) was loaded from the server.");
  assert.equal(restoredFromServerLine(1, 0), "This browser had nothing saved, so your 1 open position was loaded from the server.");
});

for (const [name, fn] of tests) {
  try { await fn(); passed++; console.log(`  ok   ${name}`); }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${e.message}`); }
}
console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
