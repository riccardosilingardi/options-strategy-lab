/* ====================================================================
   WHAT IS ACTUALLY SENT, AND WHAT CAME BACK.

   Plain JS, no React, for the same reason `rules.js`, `path.js` and
   `handoff.js` are: five sites build an Alpaca order body and read the
   reply, and five copies of that arithmetic is how one of them ends up
   wrong. One of them did (see 1 below), in all five at once.

   Two questions live here, and only these two:

   1. WHAT SHAPE DOES THE BODY TAKE — `orderBody()`, and the three pieces
      it is made of: `reduceRatios()`, `orderQty()`, `unitLimit()`, plus
      `orderPreviewLines()` for the tap that arms it.
   2. WHAT DID THE BROKER SAY — `orderOutcome()`, `alpacaErrorText()`.

   No rule number and no rule sentence is written here: the exit plan is
   `exitPlanSentence()` in visuals.jsx, and `orderOutcome()` only reports
   whether the reply is the kind of reply that STARTS one.
==================================================================== */

/* ------------------------------------------------------------------
   1) THE RATIOS AND THE QUANTITY

   Alpaca refuses a multi-leg order whose leg ratios share a common factor:

     422 / 42210000 "leg ratio quantities should be relatively prime:
                     GCD[5 5] = 5"

   That is the whole of it. A five-lot vertical is not "5 and 5"; it is
   "1 and 1, five times" — the SIZE belongs in the order's qty and the
   SHAPE belongs in the leg ratios. A 1x2x1 butterfly has a genuine ratio
   of 1:2:1 and must survive untouched, which is exactly what dividing by
   the greatest common divisor does: GCD(1,2,1) is 1.

   The factor does not disappear. It comes back out in `orderQty()` (the
   number of combinations sent) and in `unitLimit()` (the price of ONE of
   them), so the money the order can spend is unchanged — only the way it
   is spelled for the broker.
------------------------------------------------------------------ */

const gcd2 = (a, b) => (b ? gcd2(b, a % b) : a);

/** The greatest common divisor of a list of positive integers (1 if empty). */
export function gcdAll(ns) {
  const xs = ns.map((n) => Math.abs(Math.round(+n || 0))).filter((n) => n > 0);
  if (!xs.length) return 1;
  return xs.reduce((a, b) => gcd2(a, b), xs[0]) || 1;
}

/**
 * Reduce the leg quantities to their relatively-prime shape.
 * @param legs  anything carrying a `qty` (or a plain number per leg)
 * @returns { ratios, factor } — ratios are what goes in `ratio_qty`,
 *          factor is what multiplies the order's `qty`.
 */
export function reduceRatios(legs) {
  const qtys = (legs || []).map((l) => Math.abs(Math.round(+(l && typeof l === "object" ? l.qty : l) || 0)) || 1);
  const factor = gcdAll(qtys);
  return { ratios: qtys.map((q) => q / factor), factor };
}

/** The order's own qty: how many of the reduced combination to send. */
export function orderQty(userQty, factor) {
  const u = Math.max(1, Math.round(+userQty || 1));
  return u * Math.max(1, Math.round(+factor || 1));
}

/**
 * The limit price of ONE reduced combination.
 * The price on screen is the price of the structure AS BUILT — five lots of
 * a vertical quote five lots of net. Sending that as the unit price of a
 * one-lot combination would multiply the money at stake by the factor, so
 * the same factor that left the ratios has to leave the price.
 * `perContract` divides again for a single-leg order, which Alpaca prices
 * per contract rather than per combination.
 *
 * This reads Alpaca's mleg `limit_price` as the net of ONE combination, and it
 * is the safe way round to be wrong: if that is right the trade costs what the
 * ticket says, and if it were the whole order's net instead the limit is merely
 * too tight and the order does not fill. Never the other way.
 */
export function unitLimit(comboLimit, factor, perContract = 1) {
  const d = Math.max(1, Math.round(+factor || 1)) * Math.max(1, Math.round(+perContract || 1));
  return (Math.abs(+comboLimit || 0) / d).toFixed(2);
}

/**
 * THE BODY ALPACA IS SENT — one implementation, five order paths.
 *
 * @param legs     [{ side, qty }] — side +1 buy / -1 sell, qty the leg's share
 * @param occs     the OCC symbol for each leg, in the same order
 * @param userQty  how many of the structure the user asked for (the ticket's QTY)
 * @param type     "limit" | "market"
 * @param limit    the price of the WHOLE structure as built (any sign)
 * @param tif      "day" | "gtc"
 * @param intent   "open" | "close" — which way the legs are being traded
 *
 * A single leg goes as a simple order (Alpaca's mleg class wants 2-4 legs and
 * answers 422 otherwise); two to four go as one mleg. More than four is the
 * caller's problem, and every caller already says so in its own words.
 */
export function orderBody({ legs = [], occs = [], userQty = 1, type = "market", limit = null, tif = "day", intent = "open" } = {}) {
  const { ratios, factor } = reduceRatios(legs);
  const qty = orderQty(userQty, factor);
  const buy = (side) => (intent === "close" ? side <= 0 : side > 0);
  const mlegs = legs.map((l, i) => ({
    symbol: occs[i],
    ratio_qty: String(ratios[i]),
    side: buy(l.side) ? "buy" : "sell",
    position_intent: intent === "close"
      ? (l.side > 0 ? "sell_to_close" : "buy_to_close")
      : (l.side > 0 ? "buy_to_open" : "sell_to_open"),
  }));
  if (mlegs.length === 1) {
    const body = { symbol: mlegs[0].symbol, qty: String(qty * ratios[0]), side: mlegs[0].side, type, time_in_force: tif };
    if (type === "limit") body.limit_price = unitLimit(limit, factor, ratios[0]);
    return body;
  }
  const body = { order_class: "mleg", qty: String(qty), type, time_in_force: tif, legs: mlegs };
  if (type === "limit") body.limit_price = unitLimit(limit, factor);
  return body;
}

/**
 * What will be sent, in words, one line per leg plus one line for the order.
 * Used by the ticket's pending-confirmation state: a tap that arms a
 * confirmation must show what it armed, or it looks like nothing happened.
 */
export function orderPreviewLines({ legs = [], ratios, ticker = "", expKey = "", qty = 1, factor = 1,
  type = "limit", limit, tif = "day", intent = "open" } = {}) {
  const rs = ratios || reduceRatios(legs).ratios;
  const n = orderQty(qty, factor);
  const lines = legs.map((l, i) => {
    const side = intent === "close" ? (l.side > 0 ? "SELL to close" : "BUY to close") : (l.side > 0 ? "BUY" : "SELL");
    const each = rs[i] * n;
    const strike = l.strike != null ? `$${(+l.strike).toFixed(2)} ` : "";
    const kind = l.type === "put" ? "put" : "call";
    return `${side} ${each} × ${ticker} ${strike}${kind}${expKey ? ` expiring ${expKey}` : ""}`;
  });
  const price = type === "limit"
    ? `a limit of $${unitLimit(limit, factor)} for one combination`
    : "at whatever the market is showing";
  const stands = tif === "gtc" ? "standing until you cancel it" : "good for today only";
  lines.push(`${n} combination${n === 1 ? "" : "s"}, ${price}, ${stands}.`);
  return lines;
}

/* ------------------------------------------------------------------
   2) WHAT THE BROKER SAID

   ACCEPTED IS NOT OPENED. A limit at the mid of a wide market can be taken
   by Alpaca and never fill, and an order sent outside market hours is
   queued rather than executed: `status: "accepted"`, `filled_qty: 0`. The
   app announced "Position opened" over exactly that reply. Filled, partly
   filled and working are three different sentences, and only the first one
   starts an exit plan — a plan measured from a fill that never happened is
   a plan about nothing.
------------------------------------------------------------------ */

// Alpaca's order statuses, sorted by what they mean to the person who tapped.
const FILLED = ["filled"];
const PARTIAL = ["partially_filled"];
const DEAD = ["rejected", "canceled", "cancelled", "expired", "done_for_day", "suspended", "stopped"];
// Everything else that the broker holds: new, accepted, pending_new,
// accepted_for_bidding, held, calculated, pending_review, replaced, …

const asInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/** Where an order is waiting, named rather than implied. */
export function orderWaitingPhrase(order = {}) {
  const type = String(order.type || "").toLowerCase();
  const lim = order.limit_price != null ? Math.abs(+order.limit_price) : null;
  const priced = type === "limit" && lim != null && Number.isFinite(lim)
    ? `at your limit of $${lim.toFixed(2)}`
    : type === "market" ? "as a market order" : "as it was sent";
  const tif = String(order.time_in_force || "").toLowerCase();
  const stands = tif === "gtc" ? "and it stands until you cancel it"
    : tif === "day" ? "and it stands for today's session only"
    : "";
  return `${priced}${stands ? ` ${stands}` : ""}`;
}

/**
 * Read an Alpaca order reply.
 * @returns {{ kind, filled, working, startsExitPlan, headline, detail, status }}
 *   kind: "filled" | "partial" | "working" | "dead" | "unknown"
 *   startsExitPlan is TRUE only for a complete fill.
 */
export function orderOutcome(order) {
  const o = order || {};
  const status = String(o.status || "").toLowerCase();
  const id = o.id ? String(o.id).slice(0, 8) : null;
  const tail = id ? ` · order ${id}…` : "";
  const want = asInt(o.qty);
  const got = asInt(o.filled_qty);
  const avg = o.filled_avg_price != null ? Math.abs(+o.filled_avg_price) : null;
  const at = avg != null && Number.isFinite(avg) && avg > 0 ? ` at $${avg.toFixed(2)}` : "";

  if (!status) {
    return { kind: "unknown", filled: false, working: false, startsExitPlan: false, status,
      headline: "Alpaca did not say what happened to the order.",
      detail: `The reply carried no status, so the app cannot tell you whether anything was bought.` +
        ` Check the order list on your Alpaca paper account before doing anything else${tail}.` };
  }
  if (FILLED.includes(status)) {
    const n = got != null ? got : want;
    const what = n != null ? `${n} combination${n === 1 ? " is" : "s are"} yours` : "the order is yours";
    return { kind: "filled", filled: true, working: false, startsExitPlan: true, status,
      headline: `Filled${at}: ${what}. Position opened.`,
      detail: `The exit plan starts now${tail}.` };
  }
  if (PARTIAL.includes(status)) {
    const rest = want != null && got != null ? Math.max(0, want - got) : null;
    return { kind: "partial", filled: false, working: true, startsExitPlan: false, status,
      headline: `Partly filled${at}: ${got != null ? got : "some"} of ${want != null ? want : "the"} combinations are yours.`,
      detail: `${rest != null ? `The other ${rest} ${rest === 1 ? "is" : "are"} still working ` : "The rest is still working "}` +
        `${orderWaitingPhrase(o)}. The exit plan applies to what has filled; the rest is not a position yet${tail}.` };
  }
  if (DEAD.includes(status)) {
    const why = o.reject_reason || o.rejected_reason || null;
    return { kind: "dead", filled: false, working: false, startsExitPlan: false, status,
      headline: `Alpaca took the order and then ${status === "rejected" ? "rejected" : status.replace(/_/g, " ")} it: nothing was bought.`,
      detail: `${why ? `Alpaca's reason: ${why}. ` : ""}Nothing is open and nothing is working${tail}.` };
  }
  return { kind: "working", filled: false, working: true, startsExitPlan: false, status,
    headline: `The order is working, not filled${want != null ? ` — 0 of ${want} combination${want === 1 ? "" : "s"} bought` : ""}.`,
    detail: `Alpaca has it (status "${status}") and it is waiting ${orderWaitingPhrase(o)}. ` +
      `An order sent outside market hours waits for the next session, and a limit at the middle of a wide market ` +
      `can wait all day. Nothing has been bought yet, so the exit plan has not started${tail}.` };
}

/* ------------------------------------------------------------------
   3) WHY IT DID NOT GO

   A rejection is unreadable without the status and the body: "leg ratio
   quantities should be relatively prime: GCD[5 5] = 5" is the whole
   diagnosis and it lives in Alpaca's own reply. `alpacaReq` carries both
   on the error; this turns them into the sentence the user reads, and
   never truncates the part that says what is wrong.
------------------------------------------------------------------ */

/** Alpaca's own words, pulled out of a JSON body when it is one. */
export function alpacaBodySentence(body) {
  const raw = typeof body === "string" ? body.trim() : "";
  if (!raw) return "";
  try {
    const j = JSON.parse(raw);
    const msg = j.message || j.error || j.msg;
    if (msg) return `${j.code != null ? `code ${j.code}: ` : ""}${msg}`;
  } catch { /* not JSON: the raw text IS the message */ }
  return raw;
}

/**
 * The sentence a failed order shows.
 * `e.status` and `e.body` come from `alpacaReq`; an error without them
 * (a thrown precondition, a dropped connection) still reads as a sentence.
 */
export function alpacaErrorText(e) {
  const err = e || {};
  const said = alpacaBodySentence(err.body);
  if (err.status) {
    return `Alpaca refused it — HTTP ${err.status}${said ? `. ${said}` : ", and the reply had no body."}`;
  }
  return err.message || "The order was not sent, and the app could not read why.";
}
