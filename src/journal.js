/* ====================================================================
   THE PERMANENT RECORD OF A POSITION.

   Plain JS, no React, for the same reason `rules.js`, `order.js`,
   `path.js` and `handoff.js` are: this is a set of decisions about what
   is kept and what it is called, and decisions belong somewhere they can
   be tested rather than inside a component.

   WHAT WAS WRONG. `closePos()` in App.jsx kept four fields — ticker,
   pnl, ruleExit, riskOk — and dropped everything else on the floor:

     entry = { id, t, ticker, name, openedAt, pnl, ruleExit, riskOk }

   The timeline went, the thesis went, the Alpaca order ids went, and the
   reason went with them. So the Journal, which is the app's own record of
   what it did and the only place its discipline number comes from, could
   say a trade closed at a profit and could not say why it was opened,
   what the app told the owner while it was open, which order opened it,
   which order closed it, or who decided to end it. A position that had
   been managed for six weeks became one line with a number in it.

   Four things this fixes, and they are all the same thing: a record that
   survives the thing it is a record of.

   1. A REF, GIVEN AT OPEN AND NEVER REUSED. `J-0001`. Until now a
      position was identified by `Date.now()`, which is fine for a key
      and useless for a human: you cannot say "look at J-0007" to
      somebody, and you cannot sort by it in a way that means anything.
      The counter only ever goes up — it is the highest number the state
      has ever issued, and closing or deleting a position does not hand
      its number back.

   2. A SEQUENCE PER ENTRY. `J-0001·03` is the third thing that happened
      to position J-0001. The autopilot writes into this timeline from a
      server while the app is shut, the app writes into it from the
      browser, and the two are merged on the next load — so the entries
      need an identity of their own, given when they are RECORDED, not a
      position in an array that shifts when a merge lands.

   3. THE CLOSE REASON, AND IT IS EITHER A RULE OR A SENTENCE THE USER
      WROTE. There is no third option and there is no blank. A rule close
      names the rule; a manual close asks for the same minimum reason as
      the against-the-signal override, and stores it.

   4. THE ORDER IDS, IN FULL. The app slices them to eight characters
      everywhere it prints them, which is right on a screen and wrong in
      a record: eight characters is not what you type into a broker's
      order list when you are trying to work out what happened.
==================================================================== */

import { RULES, ruleExitOf } from "./rules.js";
import { orderOutcome } from "./order.js";

/* ------------------------------------------------------------------
   1) THE REF AND THE SEQUENCE
------------------------------------------------------------------ */

export const REF_PREFIX = "J-";
export const REF_DIGITS = 4;
// A middle dot. Inside what every font has (CLAUDE.md: no rare glyphs —
// this app is demoed on a phone, and U+2B61 rendered as an empty box).
export const SEQ_SEP = "·";
export const SEQ_DIGITS = 2;

/** `J-0001` from 1. */
export const refOf = (n) =>
  `${REF_PREFIX}${String(Math.max(1, Math.round(+n || 1))).padStart(REF_DIGITS, "0")}`;

/** 1 from `J-0001`, or null from anything that is not a ref. */
export const refNumber = (ref) => {
  const m = /^J-0*(\d+)$/i.exec(String(ref == null ? "" : ref).trim());
  return m ? Number(m[1]) : null;
};

/** `J-0001·03` — the third entry recorded against J-0001. */
export const seqOf = (ref, n) =>
  `${ref}${SEQ_SEP}${String(Math.max(1, Math.round(+n || 1))).padStart(SEQ_DIGITS, "0")}`;

/** The highest sequence number a timeline has ever carried. */
export const highestSeq = (timeline = []) =>
  (timeline || []).reduce((m, e) => Math.max(m, Number.isFinite(+(e && e.n)) ? +e.n : 0), 0);

/**
 * THE HIGHEST REF THIS STATE HAS EVER ISSUED.
 *
 * Read from three places and the largest wins: the counter the state carries,
 * the open positions, and the closed journal. The counter alone would be enough
 * if nothing ever went wrong; the other two are there because a state restored
 * from an older version has refs and no counter, and because a counter that
 * somehow went backwards must not be able to hand out a number twice.
 */
export function refCounter(store = {}) {
  const used = [
    ...(store.positions || []).map((p) => refNumber(p && p.ref)),
    ...(store.journal || []).map((e) => refNumber(e && e.ref)),
  ].filter((n) => Number.isFinite(n));
  const stored = Number.isFinite(+store.journalSeq) ? +store.journalSeq : 0;
  return Math.max(stored, 0, ...used);
}

/** The next ref, and the counter to store with it. */
export function nextRef(store = {}) {
  const n = refCounter(store) + 1;
  return { n, ref: refOf(n) };
}

/* ------------------------------------------------------------------
   2) WRITING INTO A TIMELINE

   Every append goes through here, so every entry gets its sequence at the
   moment it is recorded and no two entries on one position can share one.
------------------------------------------------------------------ */

/**
 * Append one or more entries to a position's timeline.
 * @returns { timeline, seqNext, added } — `added` is the stamped entries.
 *
 * The position is not mutated: the caller decides what to do with the result,
 * because `logEvent` has to be able to return the state it was given untouched
 * when nothing changed (an infinite render loop lives on the other side of that
 * — see the comment on `logEvent` in App.jsx).
 */
export function appendTimeline(pos = {}, entries = []) {
  const list = Array.isArray(entries) ? entries : [entries];
  const ref = (pos && pos.ref) || null;
  let n = Number.isFinite(+pos.seqNext) && +pos.seqNext > 0
    ? +pos.seqNext
    : highestSeq(pos.timeline) + 1;
  const added = list.filter(Boolean).map((e) => {
    const k = n++;
    return { ...e, n: k, seq: ref ? seqOf(ref, k) : null };
  });
  return { timeline: [...(pos.timeline || []), ...added], seqNext: n, added };
}

/**
 * GIVE A POSITION ITS SEQUENCES WHERE IT HAS NONE.
 *
 * Two cases, and both are real. A position opened by an older build has a
 * timeline and no sequences at all. And the autopilot's entries arrive from
 * `/api/state` on the next load, merged into a timeline that already has some —
 * so an entry can land in the MIDDLE of the list by time while being the LAST
 * one recorded.
 *
 * Numbers already given are kept. Everything else is numbered on from the
 * highest, in time order, which is why the sequence is the order things were
 * recorded rather than an index into an array that a merge can shuffle.
 */
export function stampTimeline(pos = {}) {
  const ref = pos.ref || null;
  const tl = [...(pos.timeline || [])].sort((a, b) => (+(a && a.t) || 0) - (+(b && b.t) || 0));
  let n = highestSeq(tl);
  const out = tl.map((e) => {
    if (Number.isFinite(+(e && e.n)) && +e.n > 0) return { ...e, seq: ref ? seqOf(ref, +e.n) : (e.seq ?? null) };
    n += 1;
    return { ...e, n, seq: ref ? seqOf(ref, n) : null };
  });
  return { ...pos, timeline: out, seqNext: n + 1 };
}

/* ------------------------------------------------------------------
   3) RE-READING AN ORDER THAT HAD NOT FILLED

   Carried forward from the last session's NOT VERIFIED list, in its own
   words: "nothing re-reads `alpacaStatus` after the fact. The position is
   written once, at send time, and the warning stays until the user checks
   the broker."

   An order can be `accepted` with `filled_qty: 0` — queued outside market
   hours, or a limit sitting in a wide market — and the position row then
   carries a warning saying so. Overnight that order fills, and the app goes
   on warning about it because nobody ever asked Alpaca again.
------------------------------------------------------------------ */

/**
 * @param pos    the position as stored
 * @param order  what `GET /v2/orders/{id}` came back with
 * @returns { changed, outcome, status, filled, entry }
 *
 * `changed` is false when the broker says what the position already says, so
 * the caller writes nothing — a timeline that gains "still accepted" every
 * sixty seconds is not a record, it is noise.
 */
export function orderStatusRecheck(pos = {}, order = null) {
  if (!order || typeof order !== "object") return { changed: false, outcome: null };
  const outcome = orderOutcome(order);
  const status = outcome.status || null;
  const filled = outcome.filled;
  const was = pos.alpacaStatus ?? null;
  if (status === was && filled === (pos.alpacaFilled ?? null)) {
    return { changed: false, outcome, status, filled };
  }
  const id = order.id || pos.alpacaId || null;
  return {
    changed: true, outcome, status, filled,
    entry: {
      t: Date.now(), type: "status", orderId: id ? String(id) : null,
      text: `Alpaca order ${id ? String(id) : "(id unknown)"} is now "${status}"` +
        `${was ? ` — it was "${was}" when it was sent` : ""}. ${outcome.headline}`,
    },
  };
}

/* ------------------------------------------------------------------
   4) WHY IT ENDED

   A rule, or a sentence the user wrote. Never a blank, and never a rule
   the app inferred from a warning the user chose to act on.
------------------------------------------------------------------ */

/** The same minimum as the against-the-signal override. One rule, one home. */
export const CLOSE_REASON_MIN = RULES.minOverrideReasonChars;

/**
 * @param rule      what `ruleExitOf()` decided, or null
 * @param written   what the user typed
 * @returns { ok, kind, rule, text, written, need, message }
 *
 * A RULE CLOSE STILL CARRIES ANYTHING THE USER WROTE, because "I took the 50%
 * and here is why I did not roll it" is worth keeping. It just is not required.
 */
export function closeReason({ rule = null, ruleText = "", written = "" } = {}) {
  const text = String(written == null ? "" : written).trim();
  if (rule) {
    return { ok: true, kind: "rule", rule, text: ruleText || rule, written: text || null, need: 0, message: null };
  }
  if (text.length < CLOSE_REASON_MIN) {
    const need = CLOSE_REASON_MIN - text.length;
    return {
      ok: false, kind: "manual", rule: null, text: null, written: text || null, need,
      message: `No rule ended this trade, so the record needs your reason: ${need} more character` +
        `${need === 1 ? "" : "s"}. Nothing here stops you closing — you are only asked to write down why, ` +
        `because a close with no reason is the one thing the Journal cannot teach you anything from.`,
    };
  }
  return { ok: true, kind: "manual", rule: null, text, written: text, need: 0, message: null };
}

/** The close reason for a position, decided from the alerts on its row. */
export function closeDecision({ alert = null, written = "" } = {}) {
  const r = ruleExitOf({
    tpHit: !!(alert && alert.tpHit),
    dteExit: !!(alert && alert.dteExit),
    slHit: !!(alert && alert.slHit),
    dteLeft: alert ? alert.dteLeft : null,
  });
  return { ...r, reason: closeReason({ rule: r.rule, ruleText: r.text, written }) };
}

/* ------------------------------------------------------------------
   4b) HOW BIG THE POSITION IS — AND WHETHER THAT IS KNOWN

   MEASURED: nothing ever wrote `contracts` onto a position. `riskGate.js`
   reads it in three places — the 25% total-exposure ceiling, the dollars a
   proposal puts at risk, and the stop threshold — and every one of them fell
   back to ONE. So a seven-lot spread counted against the exposure ceiling as
   a single contract for the rest of its life, and the cap that is supposed to
   stop a run of trades from adding up to more than a quarter of the capital
   was measuring a seventh of what was really out there. That is not a display
   bug: it is a limit that does not hold.

   `commitPosition()` in App.jsx now stores the size — the order body's `qty`
   where a broker filled it, the number the user confirmed where the app opened
   it on its own book. This function is how everything else reads it back.

   AND AN ASSUMED ONE IS NOT A MEASURED ONE. A position saved by an older build
   carries no size at all, and there is no way to recover it: the order is gone
   and the record never held it. Defaulting it to 1 is the only safe direction
   to be wrong in — it under-counts exposure rather than over-counting it, which
   is the direction that refuses trades rather than letting them through — but a
   1 nobody wrote must never print as a 1 somebody did (failure class 1). So the
   answer carries `assumed`, and the screens that print a size say which it is.
------------------------------------------------------------------ */

/** The size an older record is read as when it does not carry one. */
export const ASSUMED_CONTRACTS = 1;

/**
 * How many combinations this position is, and whether the app actually knows.
 *
 * @param   {object} pos  a position record (or a closed Journal entry)
 * @returns {{ contracts: number, assumed: boolean }}
 *          `contracts` is always a whole number of at least 1. `assumed` is
 *          true when the record carried no readable size and the 1 is this
 *          function's, not the user's.
 */
export function positionSize(pos = {}) {
  const raw = Number(pos && pos.contracts);
  if (Number.isFinite(raw) && raw >= 1) {
    // A record migrated at hydration carries the flag as well as the number, so
    // a size written by an older build cannot launder itself into a measured one
    // by being saved again.
    return { contracts: Math.round(raw), assumed: !!(pos && pos.contractsAssumed) };
  }
  return { contracts: ASSUMED_CONTRACTS, assumed: true };
}

/** Just the number, for the arithmetic that only needs that. */
export const contractsOf = (pos) => positionSize(pos).contracts;

/**
 * What a screen prints beside a position's size. It never says "1 contract"
 * flatly about a record that does not carry one.
 */
export function positionSizeNote(pos = {}) {
  const { contracts, assumed } = positionSize(pos);
  if (!assumed) return `${contracts} contract${contracts === 1 ? "" : "s"}`;
  return `${contracts} contract${contracts === 1 ? "" : "s"} — assumed, not recorded: ` +
    `this position was opened before the app kept its size, so every figure below is read as one combination.`;
}

/**
 * Gives a position a size when it has none, at hydration, the way the `v: 2`
 * sanitising gives it a ref. It marks what it did: a record that goes through
 * here is one whose size was never written down.
 */
export function withPositionSize(pos) {
  if (!pos || typeof pos !== "object") return pos;
  const raw = Number(pos.contracts);
  if (Number.isFinite(raw) && raw >= 1) return pos;
  return { ...pos, contracts: ASSUMED_CONTRACTS, contractsAssumed: true };
}

/* ------------------------------------------------------------------
   5) THE CLOSED ENTRY
------------------------------------------------------------------ */

/** The last closing order this position knows about, from its own timeline. */
export const lastCloseOrderId = (pos = {}) => {
  const hit = [...(pos.timeline || [])]
    .filter((e) => e && e.orderId && (e.type === "order" || e.type === "close" || e.type === "ladder"))
    .sort((a, b) => (+a.t || 0) - (+b.t || 0))
    .pop();
  return hit ? String(hit.orderId) : null;
};

/**
 * WHAT A CLOSED TRADE KEEPS. Everything the position had that says what it was
 * and what happened to it — and the order ids IN FULL, never the eight-character
 * slice the screens print.
 */
export function journalEntry({ pos = {}, pnl = null, reason = null, closeOrderId = null,
  riskOk = null, t = Date.now() } = {}) {
  const r = reason || { kind: "manual", rule: null, text: null, written: null };
  return {
    id: pos.id,
    ref: pos.ref || null,
    t,
    ticker: pos.ticker,
    name: pos.name,
    openedAt: pos.openedAt,
    expKey: pos.expKey || null,
    legs: pos.legs || [],
    entryNet: pos.entryNet ?? null,
    maxProfit: pos.maxProfit ?? null,
    maxLoss: pos.maxLoss ?? null,
    // HOW BIG IT WAS. `entryNet`, `maxProfit` and `maxLoss` are all figures for
    // ONE combination, so without this the Journal cannot say what the trade
    // actually risked — and `riskOk`, the discipline number, is computed from
    // the total. The flag travels with it: an assumed size stays assumed in the
    // record it is filed under.
    contracts: contractsOf(pos),
    contractsAssumed: positionSize(pos).assumed,
    pnl,
    riskOk,
    // "Closed by the rules" is the app's one measure of discipline, so it is
    // exactly as true as `ruleExitOf()` says and no truer.
    ruleExit: r.kind === "rule",
    closeReason: { kind: r.kind, rule: r.rule || null, text: r.text || null, written: r.written || null },
    thesis: pos.thesis || null,
    timeline: pos.timeline || [],
    seqNext: pos.seqNext ?? (highestSeq(pos.timeline) + 1),
    // FULL, both of them.
    openOrderId: pos.alpacaId ? String(pos.alpacaId) : null,
    closeOrderId: closeOrderId ? String(closeOrderId) : lastCloseOrderId(pos),
    openStatus: pos.alpacaStatus ?? null,
    openFilled: pos.alpacaFilled ?? null,
  };
}

/* ------------------------------------------------------------------
   6) FINDING IT AGAIN

   Sorted and searched by ref, which is the point of having one.
------------------------------------------------------------------ */

/** Newest ref first. Anything without a ref sorts after everything that has one. */
export const byRefDesc = (a, b) => {
  const x = refNumber(a && a.ref), y = refNumber(b && b.ref);
  if (x == null && y == null) return (+(b && b.t) || 0) - (+(a && a.t) || 0);
  if (x == null) return 1;
  if (y == null) return -1;
  return y - x;
};

/** Oldest ref first. */
export const byRefAsc = (a, b) => -byRefDesc(a, b);

/**
 * Does this entry answer the query?
 *
 * The ref is matched three ways, because nobody types `J-0001` when they mean
 * the first one: `J-0001`, `0001` and `1` all find it, and so does a SEQUENCE
 * from the timeline (`J-0001·03`) — which is the string somebody is most likely
 * to be holding, since it is what the timeline prints. Ticker and name match too,
 * so the box is a search box rather than a ref box that looks like one.
 */
export function matchesRef(entry, query) {
  const q = String(query == null ? "" : query).trim().toLowerCase();
  if (!q) return true;
  const ref = String((entry && entry.ref) || "").toLowerCase();
  if (ref) {
    if (ref.includes(q)) return true;
    // `J-0001·03` typed in full, or `0001·03`: match on the ref part.
    const head = q.split(SEQ_SEP)[0];
    if (head && ref.includes(head)) return true;
    const n = refNumber(entry && entry.ref);
    const qn = Number(head.replace(/^j-/, ""));
    if (n != null && Number.isFinite(qn) && qn === n) return true;
  }
  const hay = `${(entry && entry.ticker) || ""} ${(entry && entry.name) || ""}`.toLowerCase();
  return hay.includes(q);
}

/** The Journal list: filtered by the query, newest ref first. */
export function searchJournal(entries = [], query = "") {
  return (entries || []).filter((e) => matchesRef(e, query)).sort(byRefDesc);
}

export default { refOf, seqOf, nextRef, appendTimeline, journalEntry, searchJournal };
