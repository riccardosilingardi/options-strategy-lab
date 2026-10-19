// ============================================================================
// src/journalSync.js — ONE JOURNAL ON EVERY DEVICE (PR 71, owner 19 Oct 2026). Plain JS, no React.
//
// Until PR 71 the Journal lived only in the browser that filed it (PRD §5, "Journal on the server", deferred on 24 Sep
// 2026 because the only live record was about to close). A cleared browser lost it, and the phone and the computer kept
// two different Journals. Now `journal` and `journalSeq` ride on `/api/state` beside the positions, and both sides MERGE
// rather than overwrite:
//
//   - ONE ENTRY PER TRADE. An entry is keyed by its ref AND the position id it was filed from (`journalKey()`): the
//     same trade on two devices is one entry; two different trades that ever carried the same ref (two devices that
//     each issued J-0010 before this PR) stay two entries — a merge never lets one overwrite the other.
//   - THE NEWER EDIT WINS. An entry carries `updatedAt` (stamped when it is filed and on every later edit: a roll's
//     link line, a copilot lesson line). An entry filed before PR 71 has none and is read at its filing time `t`.
//   - NOTHING IS EVER DELETED BY A MERGE. An entry one side lacks is kept from the other. An empty browser, a stale
//     browser or a body with no Journal at all cannot take an entry away from the server (`mergeStateBody()`, the
//     server's POST) or from this browser (the load in App.jsx).
//   - THE REF COUNTER ONLY GOES UP, ON BOTH SIDES. `journalSeq` is the highest of the two counters and of every ref
//     either side has seen (`refCounter()`), so a device that reloads after another one opened J-0011 issues J-0012.
//
// The server's POST (netlify/functions/state.mjs) and the client's load both call these functions: one rule, two sites.
// ============================================================================
import { refCounter } from "./journal.js";

const num = (x) => (x != null && x !== "" && Number.isFinite(Number(x)) ? Number(x) : null);

/** The key an entry is merged by: its ref and the id of the position it was filed from. */
export function journalKey(e) {
  if (!e || typeof e !== "object") return null;
  const ref = e.ref ? String(e.ref) : "", id = e.id != null ? String(e.id) : "";
  if (ref || id) return `${ref}|${id}`;
  // No ref and no id (nothing the app has ever filed): its filing time and ticker, so it is still kept.
  return `t:${num(e.t) ?? ""}|${e.ticker || ""}`;
}

/** When an entry was last changed: `updatedAt`, else its filing time `t`, else 0. */
export const entryStamp = (e) => num(e && e.updatedAt) ?? num(e && e.t) ?? 0;

/** An edited entry, stamped (every edit of a FILED entry goes through here). */
export const touchEntry = (e, now = Date.now()) => ({ ...e, updatedAt: now });

/** Of two copies of one entry, the one to keep: the newer edit; on a tie the longer timeline; then the first. */
function newer(a, b) {
  const sa = entryStamp(a), sb = entryStamp(b);
  if (sa !== sb) return sb > sa ? b : a;
  const ta = Array.isArray(a.timeline) ? a.timeline.length : 0, tb = Array.isArray(b.timeline) ? b.timeline.length : 0;
  return tb > ta ? b : a;
}

/**
 * THE MERGE. Every entry of either side, once; where both hold it, the newer edit. Filing order (`t`), oldest first,
 * as the Journal has always been appended. Anything that is not an object is dropped (it was never an entry).
 */
export function mergeJournals(a = [], b = []) {
  const out = new Map();
  for (const e of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
    const k = journalKey(e);
    if (k == null) continue;
    out.set(k, out.has(k) ? newer(out.get(k), e) : e);
  }
  return [...out.values()].sort((x, y) => (num(x.t) ?? 0) - (num(y.t) ?? 0));
}

/** The counter both sides agree on: the highest stored counter, and every ref in the positions and the Journal. */
export function mergedSeq(...states) {
  return Math.max(0, ...states.map((s) => refCounter(s || {})));
}

/**
 * THIS BROWSER'S STATE AFTER READING THE SERVER'S (the load, App.jsx). The Journal merged, the counter the highest
 * either side has seen. Positions are not touched here (their sync is unchanged: the last save wins).
 */
export function mergeJournalState(local = {}, server = {}) {
  const journal = mergeJournals(local && local.journal, server && server.journal);
  const journalSeq = mergedSeq(local, server, { journal });
  return { journal, journalSeq };
}

/**
 * DOES THE SERVER LACK SOMETHING THIS BROWSER HAS? An entry it does not hold, an older copy of one, or a lower
 * counter. True is what makes the load upload `{ journal, journalSeq }` once (the migration, PR 71 task 71.2).
 */
export function journalBehind(server = {}, merged = {}) {
  const held = new Map((Array.isArray(server && server.journal) ? server.journal : []).map((e) => [journalKey(e), e]));
  for (const e of merged.journal || []) {
    const s = held.get(journalKey(e));
    if (!s || entryStamp(e) > entryStamp(s)) return true;
  }
  return (num(merged.journalSeq) ?? 0) > (num(server && server.journalSeq) ?? 0);
}

/**
 * THE OPEN POSITIONS ANOTHER DEVICE HAS ALREADY FILED. A position is closed when the Journal holds an entry filed from
 * it: the same position id AND the same ref (both, so a ref two devices once both issued never closes the wrong
 * trade). Returns their ids; the load drops them from this browser's open list, so a closed trade is not sent back to
 * the server (and the autopilot) as open.
 */
export function filedElsewhere(positions = [], journal = []) {
  const filed = new Set((journal || []).filter((e) => e && e.ref && e.id != null).map((e) => `${e.ref}|${e.id}`));
  return (positions || []).filter((p) => p && p.ref && p.id != null && filed.has(`${p.ref}|${p.id}`)).map((p) => p.id);
}

/**
 * WHAT THE SERVER STORES ON A POST (state.mjs). Every key the body sends replaces the stored one, as before — the
 * positions and the settings — and a key it does not send is kept (a Journal-only upload leaves the positions alone).
 * The Journal is the exception: merged, never replaced, so no POST can delete an entry; the counter is the highest.
 */
export function mergeStateBody(stored = {}, incoming = {}) {
  const s = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const i = incoming && typeof incoming === "object" && !Array.isArray(incoming) ? incoming : {};
  const next = { ...s, ...i };
  if (s.journal != null || i.journal != null || s.journalSeq != null || i.journalSeq != null) {
    const journal = mergeJournals(s.journal, i.journal);
    next.journal = journal;
    next.journalSeq = mergedSeq(s, i, { journal });
  }
  return next;
}
