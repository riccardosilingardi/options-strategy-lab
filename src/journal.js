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

// The two source NAMES a simulator-volatility stamp is compared against. They
// have one home (`sigmaProvenance()` in rules.js) and a string literal here
// would be a second one. `rules.js` imports `engine.js` and nothing else, so
// this is a leaf-ward import and not a cycle.
import { MEASURED_SIGMA_SOURCE, TABLE_SIGMA_SOURCE } from "./rules.js";

import { RULES, ruleExitOf, money } from "./rules.js";
import { orderOutcome, reduceRatios, orderLifecycle } from "./order.js";

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
  /* WHAT THE BROKER GAVE, AGAINST WHAT THE APP ASKED FOR — the comparison
     ROADMAP P0 has owed since PR #28 and could not make, because nothing had
     ever filled. `pos.alpacaLimit` is the SIGNED limit the order carried;
     `outcome.fillPrice` is Alpaca's own signed average. Neither is invented:
     a record with no limit says so in words (`fillVsLimit`). */
  const fillPrice = outcome.fillPrice;
  const against = filled
    ? fillVsLimit({ limit: pos.alpacaLimit, fill: fillPrice, contracts: positionSize(pos).contracts,
        limitSigned: pos.alpacaLimitSigned === true })
    : null;
  return {
    changed: true, outcome, status, filled, fillPrice,
    against,
    entry: {
      t: Date.now(), type: "status", orderId: id ? String(id) : null,
      fillPrice: fillPrice ?? null,
      text: `Alpaca order ${id ? String(id) : "(id unknown)"} is now "${status}"` +
        `${was ? ` — it was "${was}" when it was sent` : ""}. ${outcome.headline}` +
        `${against ? ` ${against.sentence}` : ""}`,
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

/* THE SIZE IS WRITTEN IN TWO PLACES AND THEY ARE DIFFERENT UNITS.
   This is the trap, and it was READ ON SCREEN before it was understood here:
   position J-0001 showed "1 contract" on its row while its own timeline said
   "0 of 10 combinations bought". Both were true and the screen said neither.

     * `legs` carry a `qty` each. On the Build screen that box is how the app
       used to be sized: a ten-lot vertical was saved as +10/-10, GCD 10.
       `analyze()` multiplies by it, so `entryNet`, `maxProfit` and `maxLoss`
       on such a record ALREADY hold the ten.
     * `orderBody()` divides the legs by their GCD and puts the factor into the
       order's `qty` (PRD 8b, the "relatively prime" refusal). So the broker was
       asked for `userQty x GCD` combinations of the REDUCED shape.

   So there are two counts and only one of them multiplies the dollars:

     contracts  — combinations of the structure AS BUILT. This is the one that
                  multiplies `maxLoss`, and it is the ticket's own quantity.
     brokerQty  — contracts x GCD(legs). What Alpaca was asked for, what its
                  reply counts, and the number on the timeline entry.

   Reading the broker's `qty` as `contracts` multiplies the risk by the GCD a
   second time: on +10/-10 that is a $450 worst case counted as $4,500. */

/** How many of the reduced shape ONE structure-as-built is: the legs' GCD. */
export const perCombination = (pos) => {
  const legs = pos && Array.isArray(pos.legs) ? pos.legs : null;
  if (!legs || !legs.length) return 1;
  return Math.max(1, Math.round(reduceRatios(legs).factor) || 1);
};

/* ====================================================================
   WHAT IS THIS RECORD, ACTUALLY? — owned, working, or never taken.

   >>> READ ON THE OWNER'S PHONE, 20 Sep 2026. <<< "YOUR POSITIONS (3) ·
   VALUED LIVE", with -$80, -$27 and $0 beside them and "TODAY · EVERYTHING
   IS ON PLAN" over the lot — while the panel directly above said, from the
   broker's own mouth, "OPEN POSITIONS (0) — Nothing open on Alpaca."

   Not one of the three had ever been bought. The -$80 was the loss on a
   trade that does not exist, printed in red, in the largest figure on the
   card, under a gauge and a 76/100 score. The card even carried the correct
   warning — "until it fills, nothing here is a position you own" — in small
   amber text under the number that contradicted it. A screen that argues
   with itself is worse than one that says nothing, because the part that
   shouts loudest wins, and here the part that shouted was the false one.

   `store.positions` is a record of what the app DECIDED, which is not the
   same thing as what the user OWNS. Three stages, one function, and every
   list in the app is built from it rather than from a hand-written filter:

     owned      the broker filled it, or it never went to a broker at all
                (the app's own paper book, where deciding IS owning).
     working    it was sent and the broker is still holding it. No position,
                no exit plan, and the risk on it is not open risk.
     not-taken  it was sent and came back with nothing bought. There is no
                trade here and there never was one.

   ONLY `owned` IS A POSITION. Only `owned` carries a real profit and loss,
   and only `owned` has an exit plan running. The other two are worth keeping
   and worth looking at — they are the record of what this app's prices
   actually achieved — but they are not the book.

   THE EXPOSURE CEILING IS THE ONE PLACE `working` COUNTS TOO, and that is a
   decision rather than an oversight. See `bookPositions()` below.
==================================================================== */

/**
 * Which of the three stages a position record is at.
 *
 * @param {object} pos  a `store.positions` record
 * @returns {"owned"|"working"|"not-taken"}
 *
 * A record with NO `alpacaId` never went to a broker: it is the app's own
 * paper book and it is owned by construction, which is how every screen has
 * always treated it. Everything else is decided by `orderLifecycle()` in
 * order.js — the one place that knows which broker statuses are finished —
 * so a status added to that list is understood here without anybody coming
 * back. An order the broker has not been asked about yet is WORKING, never
 * dead: unknown is not a verdict (the same rule as a missing open interest).
 */
export function positionStage(pos = {}) {
  if (!pos) return "owned";
  // A HOLDING THE BROKER ITSELF LISTS IS OWNED, AND THERE IS NO ORDER TO WAIT
  // FOR. See `isBrokerHolding()` below: `/v2/positions` returns only what the
  // account actually holds, so asking `orderLifecycle()` about it is asking
  // the wrong question of the wrong object.
  if (isBrokerHolding(pos)) return "owned";
  if (!pos.alpacaId) return "owned";
  const life = orderLifecycle({ status: pos.alpacaStatus, filled: pos.alpacaFilled });
  if (life === "filled") return "owned";
  if (life === "dead") return "not-taken";
  return "working";
}

/* ------------------------------------------------------------------
   THE FILL THE APP COULD NOT SEE — and it is one sentinel

   >>> READ ON THE OWNER'S PHONE, 21 Sep 2026, one screen, one minute. <<<

       YOUR POSITIONS (0) · Nothing is open
       XLE  Imported from Alpaca · WORKING · A ? order, which time in
            force not recorded
       -- and directly below, the broker's own panel --
       OPEN POSITIONS: XLE, 2 legs
       ORDERS WAITING: MULTILEG limit @ 0.6 · day        (that is SOYB)

   The app called the XLE POSITION a waiting order and did not list the
   SOYB ORDER at all, so the two read as swapped.

   THE CAUSE IS `importAlpaca()` WRITING `alpacaId: "sync"`. That is a
   sentinel, not an order id. `positionStage()` saw a truthy `alpacaId`,
   asked `orderLifecycle()` about a record carrying no status and no
   `filled` flag, correctly got "unknown" — unknown is not dead — and
   returned "working". So every position imported from the broker's own
   holdings was filed as an order still waiting to fill.

   And it could never resolve: `recheckOrders()` then asked Alpaca for
   `GET /v2/orders/sync`, which 404s, and that read swallows its own
   failure by design. The record was stuck as "working" for ever.

   THE BROKER'S HOLDINGS ARE NOT ORDERS. `/v2/positions` lists what the
   account OWNS — there is nothing pending about it, no limit, no time in
   force and no order id, which is exactly why "?" and "not recorded"
   appeared on that row. The record says what it is now, and no order
   field is invented for it.
------------------------------------------------------------------ */

/**
 * Is this record a holding read off the broker's own positions list?
 *
 * `alpacaId: "sync"` is the LEGACY spelling and is recognised here rather
 * than migrated in ten places: a record saved by an earlier build is still
 * in `localStorage` and in the `/api/state` blob, and it must read correctly
 * on the first render after this ships, not after a write.
 */
export const isBrokerHolding = (pos) =>
  !!(pos && (pos.alpacaHeld === true || pos.alpacaId === "sync"));

/**
 * WHAT COUNTS AS THE BOOK — owned, PLUS working. The one home for it.
 *
 * Read on the owner's phone, SOYB, 21 September 2026: the gate said
 * "$1,042 already at risk" — 450 + 577 + 14 — against ZERO positions. All
 * three rows were `not-taken`: orders that came back from the broker with
 * nothing bought. The gate read `store.positions` whole, and `store.positions`
 * is what the app DECIDED, not what the user owns. So a trade nobody bought
 * was eating a quarter of the exposure ceiling for the rest of its life.
 *
 * `working` DOES count, and the reason is the opposite of the one that makes
 * it not a position: a working order can still fill. The exposure ceiling is
 * not a report of what is open — it is a limit on what may be COMMITTED, and
 * an order standing at the broker is committed. Counting it is the
 * conservative reading and the only one that survives the order filling one
 * second after the next order is sent. (That is a different question from
 * `positionStageNote()`'s "the money is not at risk yet", which is about
 * profit and loss: there is nothing to value until it fills.)
 *
 * `not-taken` NEVER counts, anywhere. There is no trade there and there never
 * was one.
 *
 * Every consumer that measures money or writes a brief reads this: the risk
 * gate in App.jsx, the weekly report, the model's context, `autopilot.mjs` and
 * `approve.mjs`. Never write the filter by hand.
 */
export const bookPositions = (positions = []) =>
  (Array.isArray(positions) ? positions : []).filter((p) => positionStage(p) !== "not-taken");

/** True only for something the user actually holds. */
export const isOwnedPosition = (pos) => positionStage(pos) === "owned";

/* ------------------------------------------------------------------
   A RECORD WRITTEN BEFORE THIS BUILD CARRIES AN UNSIGNED LIMIT.

   PR #33 made Alpaca's multi-leg `limit_price` SIGNED on the way out and
   stored the broker's own echo of it on `alpacaLimit`. Everything written
   before that stored `Math.abs()` of it — the very `Math.abs()` that sent
   the XLE credit spread out as a debit (PRD §4q).

   So one field now holds two different quantities depending on WHEN it was
   written, and nothing on the record said which. `fillVsLimit()` compares
   DIRECTIONS; `limitKind()` prints one in words. Both are confident, both
   are wrong on an older record, and the one the owner has in front of him
   is exactly such a record.

   THE ABSENCE OF THE STAMP IS THE MARKER, for the SEVENTH time in this
   repository — after `contractsAssumed`, `simExitDTE`, `seasonalSource`,
   `driftAnnual`, `entrySource` and the `"sync"` holding. `commitPosition()`
   writes `alpacaLimitSigned: true` beside every limit it stores from now
   on; a record without it is a MAGNITUDE whose direction nobody kept, and
   the app says so rather than choosing one.

   THIS IS NOT A MIGRATION AND MUST NOT BECOME ONE. The direction cannot be
   recovered: the order is at the broker and the record never held the sign.
   Inferring it from the structure's own net would be inventing evidence —
   the whole fault was the app spelling a direction the order did not have.
------------------------------------------------------------------ */

/** "a debit of $0.75" / "a credit of $0.04" — the one spelling of a signed
 *  price in this file, shared by the stamp reader and the fill comparison so
 *  the two cannot word the same number differently. */
const SIGNED_WORD = (x) => `${x < 0 ? "a credit of " : "a debit of "}$${Math.abs(+Number(x).toFixed(2)).toFixed(2)}`;

/**
 * THE STORED LIMIT, AND WHETHER ITS DIRECTION IS KNOWN — the one way a
 * position's `alpacaLimit` is read back. Never read the field directly: that
 * is how a screen comes to print "a debit of $0.75" over a credit order.
 *
 * @param pos  a position record
 * @returns {{ has, signed, limit, magnitude, kind, words, note }}
 *   `has` false when the record carries no limit at all (a market order, or
 *   a holding imported from `/v2/positions`, which was never an order here).
 *   `kind` and `words` are NULL on an unstamped record — there is no word for
 *   a direction nobody recorded — and `note` is the sentence that says so.
 */
export function storedLimitOf(pos = {}) {
  const raw = pos && pos.alpacaLimit;
  const n = raw == null || raw === "" ? NaN : Number(raw);
  if (!Number.isFinite(n)) {
    return { has: false, signed: false, limit: null, magnitude: null, kind: null, words: null, note: null };
  }
  const magnitude = Math.abs(n);
  if (pos.alpacaLimitSigned !== true) {
    return {
      has: true, signed: false, limit: n, magnitude, kind: null, words: null,
      note: `$${magnitude.toFixed(2)} a combination — this record predates the app storing which way a ` +
        `limit went, so whether that was money paid or money received is not recorded here. Your Alpaca ` +
        `account prints the order's own sign.`,
    };
  }
  return {
    has: true, signed: true, limit: n, magnitude, kind: n < 0 ? "credit" : "debit",
    words: SIGNED_WORD(n), note: null,
  };
}

/* ------------------------------------------------------------------
   THE LIMIT AGAINST THE FILL — the comparison ROADMAP P0 has owed
   since PR #28, and could not make because nothing had ever filled.

   The app records what it OFFERED (`effectiveLimit()`'s net — min(limit,
   ask) on a debit, max(limit, bid) on a credit) and the broker records
   what it GAVE. Until 21 Sep 2026 those two numbers had never sat beside
   each other, and the first time they did the gap was the whole story:
   +0.75 offered, −0.04 given, because the offer went out with the wrong
   sign (PRD §4q).

   BOTH FIGURES ARE SIGNED, and the comparison is made on the signed
   numbers, because a credit received and a debit paid of the same size
   are as far apart as two prices can be.
------------------------------------------------------------------ */

/**
 * @param limit  the SIGNED limit the app sent, per combination, or null
 * @param fill   the SIGNED average fill price Alpaca reported, or null
 * @param contracts  how many combinations, for the dollar figure
 * @param limitSigned  TRUE only for a record written by a build that stores
 *   the broker's SIGN on `alpacaLimit`. See `storedLimitOf()` above: the
 *   absence of the stamp means the number is a MAGNITUDE and its direction
 *   is unknown.
 * @returns {{ known, signUnknown, limit, fill, diff, dollars, sentence }}
 *
 * `known` is false when either side is missing, and the sentence then SAYS
 * which one — it never invents a limit for a record that has none. A
 * position imported from the broker's holdings is the standing example:
 * the app never saw the order, so there is no intended price to compare,
 * and pretending otherwise would be the same class of fault as reading a
 * missing open interest as a zero.
 *
 * AND A LIMIT WHOSE DIRECTION IS UNKNOWN IS NOT COMPARED AT ALL. This
 * function's whole arithmetic is `L - F` on two SIGNED numbers; run on a
 * stored magnitude it reports the exact opposite verdict, with a dollar
 * figure and a BETTER/WORSE in capitals. J-0001 is the case: stored 0.75
 * against a fill of −0.04. Read as signed that is $79 worse, which is the
 * truth; read as a magnitude that was written before the sign existed, the
 * app cannot say whether 0.75 meant a debit or a credit — and guessing
 * either way is how the §4q fault stayed invisible for four pull requests.
 */
export function fillVsLimit({ limit = null, fill = null, contracts = 1, limitSigned = false } = {}) {
  // `Number(null)` IS 0 AND 0 IS FINITE. The nulls go out before the
  // coercion, for the sixth time in this repository.
  const num = (x) => (x == null || x === "" ? NaN : Number(x));
  const L = num(limit), F = num(fill);
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const hasL = Number.isFinite(L), hasF = Number.isFinite(F);
  if (!hasL || !hasF) {
    const missing = !hasF
      ? `the broker has not reported a fill price`
      : `this record does not carry the limit the order was sent at`;
    return {
      known: false, signUnknown: false, limit: hasL ? L : null, fill: hasF ? F : null, diff: null, dollars: null,
      sentence: `The price you offered and the price you got cannot be compared here, because ` +
        `${missing}. Nothing is estimated in its place.`,
    };
  }
  // A LIMIT WITH NO DIRECTION IS NOT HALF A COMPARISON, IT IS NONE.
  if (limitSigned !== true) {
    return {
      known: false, signUnknown: true, limit: L, fill: F, diff: null, dollars: null,
      sentence: `This record was written before the app stored which way its limit went, so the ` +
        `$${Math.abs(L).toFixed(2)} it carries could be a debit or a credit and the two are as far apart ` +
        `as two prices get. The broker filled it at ${SIGNED_WORD(F)} a combination. The app will not ` +
        `guess the missing direction, so the comparison is not made — read the order on your Alpaca ` +
        `account, where the limit is printed with its own sign.`,
    };
  }
  // POSITIVE MEANS THE FILL WAS BETTER FOR YOU than the offer: you paid less
  // than your debit, or received more than your credit. The signed limit and
  // the signed fill are both "money out per combination", so better is lower.
  const diff = L - F;
  const dollars = diff * 100 * n;
  const word = SIGNED_WORD;
  const verdict = Math.abs(dollars) < 0.5
    ? `That is the price you asked for.`
    : dollars > 0
      ? `That is $${Math.abs(dollars).toFixed(2)} BETTER than you asked for, across ${n} combination${n === 1 ? "" : "s"}.`
      : `That is $${Math.abs(dollars).toFixed(2)} WORSE than you asked for, across ${n} combination${n === 1 ? "" : "s"}.`;
  return {
    known: true, signUnknown: false, limit: L, fill: F, diff, dollars,
    sentence: `You offered ${word(L)} a combination and the broker filled it at ${word(F)}. ${verdict}`,
  };
}

/* ------------------------------------------------------------------
   WHY THE APP'S ORDER COUNT AND THE BROKER'S DISAGREE

   PR #32 handed this forward: "the app's working-order count and the
   broker's disagree, 1 against 2 ... both panels are labelled and neither
   is wrong, but nothing on that screen SAYS why the two numbers differ."

   Two causes, and they are different facts. One was the sentinel above —
   a holding counted as an order. The other is real and cannot be fixed by
   arithmetic: the local store was reset, so an order the broker is still
   holding has no record in this app at all. The app cannot invent the
   record; it CAN say the order exists and that it has no record of it.
------------------------------------------------------------------ */

/**
 * @param working  the app's own working-order records (`positionStage` === "working")
 * @param brokerOrders  what `GET /v2/orders?status=open` returned, or null if not asked
 * @returns {{ asked, mine, theirs, unknownToApp, sentence }}
 *   `unknownToApp` are the broker's order ids this app holds no record of.
 *   `sentence` is null when the two agree, or when the broker has not been asked.
 */
export function orderReconciliation(working = [], brokerOrders = null) {
  const mine = (Array.isArray(working) ? working : []).filter(Boolean);
  if (!Array.isArray(brokerOrders)) {
    return { asked: false, mine: mine.length, theirs: null, unknownToApp: [], sentence: null };
  }
  const known = new Set(mine.map((p) => String(p.alpacaId || "")).filter(Boolean));
  const unknownToApp = brokerOrders.filter((o) => o && o.id && !known.has(String(o.id)));
  if (!unknownToApp.length) {
    return { asked: true, mine: mine.length, theirs: brokerOrders.length, unknownToApp: [], sentence: null };
  }
  const n = unknownToApp.length;
  const ids = unknownToApp.map((o) => String(o.id).slice(0, 8)).join(", ");
  return {
    asked: true, mine: mine.length, theirs: brokerOrders.length, unknownToApp,
    sentence: `Your Alpaca account is holding ${brokerOrders.length} waiting order` +
      `${brokerOrders.length === 1 ? "" : "s"} and this app has a record of ${mine.length}. ` +
      `${n === 1 ? "One of them" : `${n} of them`} was not sent from this browser, or was sent before the ` +
      `app's local record was cleared (${ids}…). It is a real order and it can still fill: the broker's own ` +
      `panel below is the authority on it. This app can only cancel or re-price the orders it has records of.`,
  };
}

/**
 * One sentence saying what a record is, for the screen that renders it.
 * The stage is a FACT ABOUT THE RECORD, so the words for it live here beside
 * `positionSizeNote()` and `autopilotHorizonNote()` rather than in a component.
 */
export const positionStageNote = (pos = {}) => {
  const stage = positionStage(pos);
  if (stage === "owned") return null;   // nothing to explain: it is a position
  if (stage === "working") {
    return `This order is still at the broker and has not bought anything. Nothing here is a position you own, ` +
      `no exit plan has started, and the money is not at risk yet — it is an offer that has not been met.`;
  }
  const what = pos.alpacaStatus ? String(pos.alpacaStatus).replace(/_/g, " ") : "finished";
  return `This trade was never taken: the order was ${what} at the broker with nothing bought. What you see ` +
    `below is what it WOULD have done, priced from the day it was sent — not a position, not a profit, and ` +
    `not a loss.`;
};

/**
 * WHAT A TRADE THAT WAS NEVER TAKEN WOULD HAVE DONE.
 *
 * The same arithmetic as a real position's profit and loss, and deliberately
 * NOT the same words. A theoretical figure printed the way a real one is
 * printed is the fault this whole section exists to remove, so the caller gets
 * the number AND the sentence that says what it is not, and neither can be
 * rendered without the other.
 *
 * @param entryNet  what the structure would have been opened at, per share
 * @param nowNet    what it is worth today, per share
 * @param contracts how many combinations
 * @returns {?{ pnl, sentence }} null when today's price cannot be read — an
 *   unknown is never a theoretical zero.
 */
export function wouldHaveDone({ entryNet, nowNet, contracts = 1 } = {}) {
  // `Number(null)` IS 0 AND 0 IS FINITE — the fifth time that coercion has
  // produced a wrong number in this repository. A trade whose price today
  // cannot be read would arrive here as a trade worth nothing, and the
  // sentence would say it is "down $450" when the truth is that nobody knows.
  // The nulls go out BEFORE the coercion, exactly as `qualityFloor()` throws
  // out an unknown open interest before it counts one.
  const num = (x) => (x == null || x === "" ? NaN : Number(x));
  const a = num(entryNet), b = num(nowNet);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const n = Math.max(1, Math.round(Number(contracts) || 1));
  const pnl = (b - a) * 100 * n;
  const dir = pnl > 0 ? "up" : pnl < 0 ? "down" : "level";
  return {
    pnl,
    sentence: `If you had opened this, it would be ${dir}${pnl === 0 ? "" : ` ${money(Math.abs(pnl))}`} today. ` +
      `You did not open it, so this is not money you have made or lost.`,
  };
}

/**
 * How many combinations this position is, and whether the app actually knows.
 *
 * @param   {object} pos  a position record (or a closed Journal entry)
 * @returns {{ contracts: number, assumed: boolean, perCombo: number, brokerQty: number }}
 *   `contracts` multiplies `maxLoss` / `entryNet` / `maxProfit` and is always a
 *   whole number of at least 1. `brokerQty` is what the broker was asked for.
 *   `assumed` is true when the record carried no readable size of its own and
 *   the 1 is this function's rather than the user's.
 */
export function positionSize(pos = {}) {
  const perCombo = perCombination(pos);
  const raw = Number(pos && pos.contracts);
  const known = Number.isFinite(raw) && raw >= 1;
  const contracts = known ? Math.round(raw) : ASSUMED_CONTRACTS;
  return {
    contracts,
    // A record migrated at hydration carries the flag as well as the number, so
    // a size written by an older build cannot launder itself into a measured one
    // by being saved again.
    assumed: known ? !!(pos && pos.contractsAssumed) : true,
    perCombo,
    brokerQty: contracts * perCombo,
  };
}

/** Just the number that multiplies the dollars, for arithmetic that needs only that. */
export const contractsOf = (pos) => positionSize(pos).contracts;

/**
 * What a screen prints beside a position's size.
 *
 * TWO CASES, because the doubt is not the same in both:
 *
 *  - THE SIZE IS IN THE LEGS (`perCombo > 1`). The app is not guessing: the
 *    record says +10/-10 and every dollar figure on the row already holds the
 *    ten. Saying "1 contract, assumed" over that is the screen contradicting
 *    its own timeline, which is what this text used to do.
 *  - THE LEGS SAY NOTHING (`perCombo === 1`). Here a missing `contracts` really
 *    is unknown between one and any number, the figures really are for one
 *    combination, and an assumed 1 must say so.
 */
export function positionSizeNote(pos = {}) {
  const { contracts, assumed, perCombo, brokerQty } = positionSize(pos);
  const combos = `${brokerQty} combination${brokerQty === 1 ? "" : "s"}`;
  if (perCombo > 1) {
    return `${combos} — the size is written into the leg quantities, so every figure below is ` +
      `already the whole position` +
      (assumed
        ? `. The record carries no separate size, so the app reads it as one of these: check ${brokerQty} ` +
          `against the order on your paper account.`
        : `.`);
  }
  if (!assumed) return `${contracts} contract${contracts === 1 ? "" : "s"}`;
  return `1 contract — assumed, not recorded: this position was opened before the app kept its size, ` +
    `so every figure below is read as one combination.`;
}

/**
 * Gives a position a size when it has none, at hydration, the way the `v: 2`
 * sanitising gives it a ref. It marks what it did: a record that goes through
 * here is one whose size was never written down as a field of its own.
 *
 * ONE, NOT THE LEGS' GCD, AND DELIBERATELY. `entryNet`, `maxProfit` and
 * `maxLoss` on such a record already hold the leg quantities, so this number is
 * a SECOND multiplier on top of them — the ticket's own, which was never saved.
 * Reading the legs into it would count the size twice. `positionSize()` reports
 * the broker-facing count separately and the screen prints that one.
 */
export function withPositionSize(pos) {
  if (!pos || typeof pos !== "object") return pos;
  const raw = Number(pos.contracts);
  if (Number.isFinite(raw) && raw >= 1) return pos;
  return { ...pos, contracts: ASSUMED_CONTRACTS, contractsAssumed: true };
}

/* ------------------------------------------------------------------
   4b) WHAT HORIZON AN AUTOPILOT ENTRY WAS WRITTEN AT

   THE FAULT THIS EXISTS TO MARK. `exitSim()` in engine.js walked every position
   to 7 DTE and marked the survivors at 7 DTE while `RULES.exitDTE` has been 21
   since it was changed from 7. Four pull requests shipped on top of that, and
   every autopilot brief the owner received described the chance of being
   positive "at the exit rule" at a horizon fourteen days past the rule. What
   the Journal keeps is not the brief: `appendTimeline()` stores the verdict,
   the share of the maximum, the TIS and the model's RATIONALE — prose the model
   wrote after reading those numbers. So the wrong horizon is inside the prose
   of past entries, where nothing can reach it.

   IT IS NOT MARKED BY DATE, DELIBERATELY. A deploy date is a second home for a
   fact the entry can carry itself, and it would have to be maintained by hand
   for the life of the record. So the entries written SINCE the fix carry the
   horizon the simulation actually used, and the ABSENCE of that stamp is what
   identifies an entry written before it — exactly the pattern `contractsAssumed`
   uses for a size that was assumed rather than recorded.

   An entry that is not an autopilot entry has no horizon and is not marked: it
   never quoted one.
------------------------------------------------------------------ */

/**
 * What horizon this timeline entry's simulation ran to.
 * @returns { autopilot, stamped, exitDTE, days } — `stamped` false on an entry
 *          written before the simulator was corrected.
 */
export function simHorizonOf(entry = {}) {
  const autopilot = !!entry && entry.type === "autopilot";
  // `Number(null)` IS 0 AND 0 IS FINITE. An entry with no stamp at all would
  // read as a stamp of zero — the very confusion this marker exists to end —
  // so the raw value has to be a number before it is coerced to one.
  const raw = entry?.simExitDTE;
  const exitDTE = typeof raw === "number" ? raw : NaN;
  const rawDays = entry?.simDays;
  const days = typeof rawDays === "number" ? rawDays : NaN;
  const stamped = autopilot && Number.isFinite(exitDTE) && exitDTE >= 0;
  return {
    autopilot,
    stamped,
    exitDTE: stamped ? exitDTE : null,
    days: stamped && Number.isFinite(days) ? days : null,
  };
}

/**
 * ONE PLAIN SENTENCE, ON EVERY SCREEN THAT RENDERS AN UNSTAMPED ENTRY, and
 * null everywhere else. Not an apology and not a paragraph: what the reader
 * needs is that a number inside the text below is not the app's current rule.
 */
export function autopilotHorizonNote(entry = {}) {
  const h = simHorizonOf(entry);
  if (!h.autopilot || h.stamped) return null;
  return "The simulation behind this entry ran to a day the app no longer uses, so any chance quoted inside it " +
    "is not the app's current exit rule.";
}

/* ------------------------------------------------------------------
   AND WHICH VOLATILITY THAT SIMULATION WALKED ON.

   The same fact about the same entry, one layer down. `exitSim` produces
   `pTP`, `pSL`, `pTimePos`, `ev` and `medDays`, the model reads them and writes
   the RATIONALE that this timeline entry's text is made of — so the volatility
   those figures came from ends up buried inside prose no migration can reach,
   exactly as the horizon did. And until this PR the two sides walked different
   volatilities: the Guardian on the MEASURED realised sigma of the monthly
   series, the brief on the hand-written `SIGMA` row it was the only one able to
   read.

   THE ABSENCE OF THE STAMP IS THE MARKER, the third time this file uses that
   pattern (`contractsAssumed`, `simExitDTE`). An entry written before this
   carries no `simSigmaSource`, and that absence reads as the HAND-WRITTEN TABLE
   — because the table was the only volatility the autopilot could reach.
   Inventing a measurement for it would be the same lie in the other direction.
------------------------------------------------------------------ */


/**
 * WHICH VOLATILITY AN AUTOPILOT ENTRY'S SIMULATION RAN ON, off the entry itself.
 *
 * `Number.isFinite` guards every number for the usual reason: `Number(null)` is
 * 0 and 0 is finite, so a missing year count must not read as zero years of
 * returns and a missing age must not read as "read today".
 */
export function simVolOf(entry = {}) {
  const autopilot = !!entry && entry.type === "autopilot";
  const rawSource = entry?.simSigmaSource;
  const source = typeof rawSource === "string" && rawSource ? rawSource : null;
  const rawSigma = entry?.simSigma;
  const sigma = typeof rawSigma === "number" && Number.isFinite(rawSigma) ? rawSigma : null;
  const stamped = autopilot && !!source;
  const measured = stamped && source === MEASURED_SIGMA_SOURCE;
  return {
    autopilot,
    stamped,
    source: stamped ? source : TABLE_SIGMA_SOURCE,
    measured,
    sigma: stamped ? sigma : null,
    years: measured && Number.isFinite(entry?.simSigmaYears) ? entry.simSigmaYears : null,
    ageDays: measured && Number.isFinite(entry?.simSigmaAgeDays) ? entry.simSigmaAgeDays : null,
  };
}

/**
 * ONE PLAIN SENTENCE, ON EVERY SCREEN THAT RENDERS AN UNSTAMPED ENTRY, and null
 * everywhere else — the same contract `autopilotHorizonNote()` keeps. What the
 * reader needs is that a figure inside the text below was walked at a
 * volatility nobody measured, and that the record cannot say which.
 */
export function autopilotVolNote(entry = {}) {
  const v = simVolOf(entry);
  if (!v.autopilot || v.stamped) return null;
  return "This entry does not say which volatility its simulation walked on, so it was the hand-written " +
    "table — the only one the autopilot could reach when it was written.";
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
export function journalEntry({ pos = {}, pnl = null, pnlNote = null, reason = null, closeOrderId = null,
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
    // WHICH SIZING THE POSITION WAS OPENED UNDER (PR #41, TASK 4): `true` only
    // when the record says so; an older record, written before the flag, is false.
    sizingFree: pos.sizingFree === true,
    pnl,
    // WHY THERE IS NO FIGURE, when there is none on purpose (`NOT_A_FILL`).
    pnlNote: pnlNote || null,
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
   5b) A RESULT IS A FILL, OR IT IS NOT A RESULT (0c, 23 Sep 2026)

   J-0002 was filed at -$133 with "closing order · none": a figure the app
   worked out from its own model for a position Alpaca did not hold, stored as
   the trade's result. The stored record is NOT edited — the Journal is what
   happened — but it is READ for what it is:
     - an entry filed with `pnlNote` (a record Alpaca did not hold) has no
       figure at all, and says it was not read from a fill;
     - an entry with a figure but no broker closing order prints it as the
       app's mark at close, never as a result;
     - neither is counted in any sum. `countedPnl()` is the gate every sum
       goes through, and `journalPnlTotal()` is the sum.
------------------------------------------------------------------ */

/** What is stored when there is nothing a fill could have told us. */
export const NOT_A_FILL = "not read from a fill";
/** How a figure filed with no broker closing order is labelled. */
export const MARK_AT_CLOSE = "the app's mark at close \u2014 not a fill";

/** How a Journal entry's P&L reads: the figure, whether it counts, and why not. */
export function journalPnl(entry = {}) {
  const e = entry || {};
  // `Number(null)` is 0 and 0 is finite: a figure never read is not a zero.
  const v = e.pnl == null || e.pnl === "" ? NaN : Number(e.pnl);
  if (e.pnlNote) return { shown: null, counted: null, note: String(e.pnlNote) };
  if (!Number.isFinite(v)) return { shown: null, counted: null, note: null };
  if (!e.closeOrderId) return { shown: v, counted: null, note: MARK_AT_CLOSE };
  return { shown: v, counted: v, note: null };
}

/** The figure a sum may use, or null. */
export const countedPnl = (entry) => journalPnl(entry).counted;

/** The one sum over closed trades, and how many it left out and why. */
export function journalPnlTotal(entries = []) {
  let total = 0, counted = 0, excluded = 0;
  for (const e of entries || []) {
    const c = countedPnl(e);
    if (c == null) { excluded++; continue; }
    total += c; counted++;
  }
  return { total: counted ? total : null, counted, excluded };
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

/* ------------------------------------------------------------------
   A HOLDING WRITTEN BEFORE THE STAMP NEVER UPGRADED (P9, TASK 0a)

   >>> READ ON THE OWNER'S PHONE, 22 Sep 2026. <<< XLE J-0002 is a
   position Alpaca ITSELF lists under `/v2/positions`, and the app shows
   it as "1 contract — assumed, not recorded", with one timeline entry,
   no fill entry, no exit plan, and no `fillVsLimit()` sentence anywhere.

   THE CAUSE IS A `continue`. `importAlpaca()` builds a signature per
   broker group and skips any signature already in `store.positions`:

       if (known.has(sigOf(g.und, g.exp, g.legs))) continue;

   That is right about ADDING and wrong about everything else. PR #33
   gave a holding `alpacaHeld`, `entrySource: "fill"`, the broker's own
   measured size and two timeline entries — and every record written
   BEFORE it matches the signature, so the upgrade can never reach it.
   The one record the owner actually has is exactly such a record.

   A MATCH IS NOT A REASON TO DO NOTHING. It is a reason to UPGRADE:
   the sync is holding the broker's own legs and the broker's own
   average entry prices, which is every input the missing fields need.

   WHAT IT MAY WRITE, AND WHAT IT MAY NOT:

     - `alpacaHeld` — `/v2/positions` returned it, so it IS a holding.
       This is the field `positionStage()` reads, and it is the whole
       difference between "owned" and an order that will never resolve.
     - THE SIZE, MEASURED. The broker's legs carry the broker's own
       quantities, so `reduceRatios()` — the one home for that
       arithmetic — divides out the shape and leaves the count. A
       measured size clears `contractsAssumed`; it does not "assume" a
       1 the record happens to agree with.
     - `entrySource: "fill"` and the net from `avg_entry_price`. The
       broker filled it; the price is the broker's, read and not
       re-derived.
     - The `fill` and `plan` timeline entries, ONLY IF MISSING, and
       through `appendTimeline()` so a sequence number is given the one
       way it is ever given.

     - >>> NO ORDER FIELD IS INVENTED. <<< No `alpacaStatus`, no
       `alpacaLimit`, no `alpacaLimitSigned`, no time in force. §4r.1
       decided this and §4s sharpened it: the broker named a HOLDING,
       not an order, and the direction of a limit this app once sent is
       at the broker, not in a positions payload. An unstamped limit
       stays unstamped and `fillVsLimit()` goes on refusing to compare
       it.

   IT RETURNS THE SAME OBJECT WHEN NOTHING CHANGES, so React bails out
   and a sync on a 60-second timer cannot loop — the same discipline
   `resnapLegs()` uses in chain.js. Running it twice is running it once.
------------------------------------------------------------------ */

/**
 * Bring a position record up to what the broker's own holdings say.
 *
 * @param pos    a `store.positions` record that matched a broker group
 * @param group  `{ legs, net }` as `importAlpaca()` already builds it —
 *               `legs` carry the broker's quantities, `net` is the sum of
 *               `avg_entry_price` at those quantities.
 * @param plan   the exit-plan sentence, passed in because the words are a
 *               RULE and rules live in rules.js, never in this file.
 * @returns the SAME object when there is nothing to add, otherwise a new one.
 */
export function upgradeHolding(pos, group = {}, { plan = null, now = Date.now() } = {}) {
  if (!pos) return pos;
  const legs = Array.isArray(group.legs) ? group.legs : null;
  const net = group.net == null || group.net === "" ? null : Number(group.net);
  let out = pos;
  const touch = () => { if (out === pos) out = { ...pos }; return out; };

  // 1) IT IS A HOLDING. The field `positionStage()` reads.
  if (pos.alpacaHeld !== true) { touch().alpacaHeld = true; out.alpacaLive = true; }

  // 2) THE SIZE, MEASURED FROM THE BROKER'S OWN LEG QUANTITIES.
  //    `Number(null)` is 0 and 0 is finite, so the null goes out first: a group
  //    with no legs tells us nothing about the size and must leave it alone.
  //    >>> IN THE RECORD'S OWN UNITS (PR #42). <<< `contracts` multiplies the
  //    record's legs, so the broker's count is divided by what ONE of the
  //    record's structures already holds (`perCombination()`). GDX, 23 Sep
  //    2026: the imported record's leg already said 9 puts, the sync wrote
  //    `contracts: 9` on top of it, and the book counted 81 puts — $40,500 at
  //    risk for a $4,500 position. The app's own J-0001 (one put × 9) was
  //    right only because its leg said 1.
  if (legs && legs.length) {
    const measured = Math.max(1, Math.round(reduceRatios(legs).factor / perCombination(pos)) || 1);
    const cur = Number(pos.contracts);
    const hasCur = Number.isFinite(cur) && cur >= 1;
    if (!hasCur || Math.round(cur) !== measured || pos.contractsAssumed) {
      touch().contracts = measured;
      // MEASURED IS NOT ASSUMED, even when the two agree on the number. The
      // flag is about where the figure came from, not about its value.
      out.contractsAssumed = false;
    }
  }

  // 3) IT IS A FILL, AND IT CARRIES THE PRICE THE BROKER GAVE.
  if (Number.isFinite(net)) {
    if (pos.entrySource !== "fill") { touch().entrySource = "fill"; }
    // The stored entry is per combination, like every other stored figure, and
    // `group.net` already is one: `importAlpaca()` sums side x qty x price over
    // the legs, and the legs carry the shape.
    if (!Number.isFinite(Number(pos.entryNet))) touch().entryNet = net;
  }

  // 4) THE TWO ENTRIES A HOLDING SHOULD HAVE, AND NEITHER TWICE.
  const has = (type) => (pos.timeline || []).some((e) => e && e.type === type);
  const add = [];
  if (!has("fill")) {
    add.push({ t: now, type: "fill", text:
      `Read from your Alpaca paper account as an OPEN POSITION${legs && legs.length ? ` — ${legs.length} legs` : ""}` +
      `${Number.isFinite(net) ? `, at the broker's own average entry prices (${SIGNED_WORD(net)} a combination)` : ""}. ` +
      `This is a fill, not an order: the broker lists only what the account holds. ` +
      `This record predates the app storing any of that, so it was read back from the broker rather than invented here.` });
  }
  if (!has("plan") && plan) add.push({ t: now, type: "plan", text: plan });
  if (add.length) {
    const t = appendTimeline(out === pos ? pos : out, add);
    touch().timeline = t.timeline;
    out.seqNext = t.seqNext;
  }
  return out;
}

/* ------------------------------------------------------------------
   WHICH RECORD IS WHICH HOLDING — BY SHAPE, NOT BY QUANTITY (PR #42)

   >>> READ ON THE OWNER'S PHONE, 23 Sep 2026. <<< One GDX 94P holding, nine
   contracts, sent from the app as J-0001, and TWO cards on Positions: J-0001
   and "J-0002 · Imported from Alpaca". The sync matched records to the
   broker's holdings on a signature that spelled every leg's QUANTITY: the
   app stores the structure as built (+1 put) and the size apart (9), the
   broker lists +9, and "+1" is not "+9". So the holding looked unknown and
   was imported a second time — while the broker panel, which matches on
   ticker and expiry, said "This is J-0001" underneath.

   A holding is matched on its SHAPE: ticker, expiry, and each leg's side,
   type, strike and ratio after `reduceRatios()` divides the size out. The
   size is then measured by `upgradeHolding()`, in the record's own units.
------------------------------------------------------------------ */

/** The size-free shape of a set of legs: side, type, strike and ratio. */
export function holdingShape(ticker, expKey, legs = []) {
  const { ratios } = reduceRatios(legs || []);
  return `${ticker || ""}|${expKey || ""}|` + (legs || [])
    .map((l, i) => `${Number(l.side) > 0 ? "+" : "-"}${ratios[i]}${String(l.type || "")[0]}${Number(l.strike)}`)
    .sort().join(",");
}

/** Was this record written by the sync from the broker's holdings, rather
 *  than by an order this app sent? */
export const isImportedRecord = (pos) =>
  !!(pos && ((pos.thesis && pos.thesis.imported === true) || pos.alpacaId === "sync"));

/**
 * A duplicate the old signature created: an IMPORTED record whose holding the
 * app's own record of the order already describes (same shape). The app's
 * record keeps its ref, its thesis, its timeline and its sizing; the import
 * held nothing the broker cannot give again, so it goes.
 *
 * @param positions `store.positions`
 * @returns {{ positions, dropped: string[] }} — `dropped` are the refs removed;
 *   the SAME array back when there is nothing to remove.
 */
export function dropImportedTwins(positions = []) {
  const list = Array.isArray(positions) ? positions : [];
  const own = new Set(list.filter((p) => p && !isImportedRecord(p) && positionStage(p) === "owned")
    .map((p) => holdingShape(p.ticker, p.expKey, p.legs)));
  const dropped = [];
  const kept = list.filter((p) => {
    if (!isImportedRecord(p) || !own.has(holdingShape(p.ticker, p.expKey, p.legs))) return true;
    dropped.push(p.ref || String(p.id));
    return false;
  });
  return { positions: dropped.length ? kept : list, dropped };
}

/* ------------------------------------------------------------------
   ONE CLOSE CONTROL PER POSITION (P9, TASK 2)

   There are two buttons on two screens for one act. The Positions card's
   "Close" asks WHY, files a Journal entry with the reason, and is the only
   one that keeps the record honest. The broker panel's "Close the whole
   trade" sends a market order and files nothing — so which of the two the
   owner happens to tap decides whether the trade has a history.

   THEY ARE NOT MERGED INTO ONE CODE PATH, deliberately: the broker panel
   can list a holding this app has no record of at all (an order sent before
   the local store was cleared — `orderReconciliation()` already names that
   case), and removing its button would strand that position with no way out
   of this app. What is removed is the CHOICE where there is no choice to
   make: when the group matches a record, the panel says so and points at
   the one control that writes the reason down.
------------------------------------------------------------------ */

/**
 * The position record a broker holding belongs to, or null.
 *
 * @param positions  `store.positions`
 * @param ticker / expKey  read off the broker group's own OCC symbols.
 */
export function positionForHolding(positions = [], { ticker = null, expKey = null } = {}) {
  if (!ticker || !expKey) return null;
  // ONLY A POSITION THE APP CONSIDERS OPEN. Pointing the owner at a "Close"
  // button on a record that is not in the Positions list would be a door with
  // nothing behind it — the `passedOver` fault, one screen across.
  return (positions || []).find((p) => p && p.ticker === ticker
    && (p.expKey || "") === expKey && positionStage(p) === "owned") || null;
}

/* ------------------------------------------------------------------
   A TEST IS NOT A TRADE (P9, TASK 3)

   The owner opened three trades and closed them again within the
   minute, by hand, at zero profit and loss, to see what the buttons
   did. `journey` in App.jsx counted them: they moved him up a level
   and spent his "patience" budget — the score that measures whether
   he is opening too many trades in a week.

   It is §4m's fault one tab across. `store.positions` is what the app
   DECIDED, not what the user OWNS, and `store.journal` is what
   HAPPENED — and a record opened and closed on the same day, by hand,
   for nothing, did not happen in the sense the level is measuring.

   >>> THEY ARE NOT DELETED. <<< The Journal is the record of what the
   app did, and deleting a record to make a score look better is the
   opposite of what it is for. They stay, they are marked, and the
   score steps over them.

   THREE CONDITIONS, ALL OF THEM: zero P&L (nothing was at stake), the
   same calendar day (nothing had time to happen), and closed BY HAND
   (a rule exit on the same day is a real trade that hit its take
   profit, however unlikely). Any one of them alone is an ordinary
   trade: a scratch, a day trade, a manual close.
------------------------------------------------------------------ */

/** Was this closed record a button-test rather than a trade? */
export function isTestRecord(entry = {}) {
  if (!entry) return false;
  // `Number(null)` IS 0 AND 0 IS FINITE, for the tenth time in this
  // repository: a record whose P&L was never read is UNKNOWN, and an
  // unknown result is not a zero one.
  const pnl = entry.pnl == null || entry.pnl === "" ? NaN : Number(entry.pnl);
  if (!Number.isFinite(pnl) || Math.abs(pnl) >= 0.005) return false;
  if (entry.ruleExit === true) return false;          // a rule ended it: a real trade
  const opened = entry.openedAt ? new Date(entry.openedAt) : null;
  const closed = entry.t ? new Date(entry.t) : null;
  if (!opened || !closed || Number.isNaN(+opened) || Number.isNaN(+closed)) return false;
  return opened.toDateString() === closed.toDateString();
}

/** What the Journal row says about one, so it is marked rather than hidden. */
export const testRecordNote = () =>
  `Opened and closed by hand the same day for nothing — read as a test of the buttons, so it is not counted ` +
  `towards your level or your awareness score. It stays on the record: the Journal is what happened, not what ` +
  `flatters the score.`;

/** The closed records a level or a score may be computed from. */
export const scoredJournal = (entries = []) => (entries || []).filter((e) => !isTestRecord(e));

export default { refOf, seqOf, nextRef, appendTimeline, journalEntry, searchJournal, upgradeHolding, positionForHolding, isTestRecord };
