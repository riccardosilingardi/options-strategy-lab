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

/* THE BROKER'S OWN CONTRACT, MIRRORED FROM alpaca-py. There is no official
   JavaScript SDK for multi-leg option orders, so the field names, the enums
   and the validators are written down once in `alpacaContract.js` with the
   alpaca-py file each rule came from cited beside it. This file SPELLS a
   body; that file says what a body IS. It imports nothing, so this is
   leaf-ward like every import in this repository. */
import { ORDER_CLASS, ORDER_TYPE, ORDER_STATUS, optionLegRequest, validateOrderRequest,
  contractRefusal, wireNumber } from "./alpacaContract.js";

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
 * The limit price of ONE reduced combination, AS A MAGNITUDE.
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
 *
 * IT IS THE MAGNITUDE AND IT IS NOT WHAT AN MLEG BODY CARRIES. A single-leg
 * order is unsigned because its `side` already says which way the money goes;
 * a multi-leg order's legs each have their own side and the NET can go either
 * way, so the sign has to be on the price. `mlegLimitPrice()` below is the one
 * place that decides it. Everything else — the screen, the preview line, the
 * per-combination figure beside an x5 — reads this one, which is a number the
 * user compares against a price and never a direction.
 */
export function unitLimit(comboLimit, factor, perContract = 1) {
  const d = Math.max(1, Math.round(+factor || 1)) * Math.max(1, Math.round(+perContract || 1));
  return (Math.abs(+comboLimit || 0) / d).toFixed(2);
}

/* ------------------------------------------------------------------
   1b) THE SIGN ON A MULTI-LEG LIMIT — ONE HOME, AND IT IS MEASURED

   >>> MEASURED ON THE OWNER'S ALPACA PAPER ACCOUNT, 21 Sep 2026. <<<

   J-0001, XLE Bull Put Spread 2026-10-30, −1 62.5P / +1 59P. The ticket
   said CREDIT $75 and the order went GTC. Alpaca now holds it as an OPEN
   POSITION: +1 XLE261030P00059000 at 1.12, −1 XLE261030P00062500 at 1.16
   — a net credit of $0.04 a combination. **$4 received against $75
   intended.** The maximum loss is $346 instead of $275 and the Positions
   screen reads −$112.

   The cause was `unitLimit()` above, used for the mleg body as well:
   it returns `Math.abs()`. Alpaca's multi-leg `limit_price` is SIGNED —
   POSITIVE is a debit (you pay up to this) and NEGATIVE is a credit (you
   receive at least this); see alpaca-py's `LimitOrderRequest` reference for
   multi-leg orders. So +0.75 on a structure the app meant to SELL for 0.75
   was read as "pay up to $0.75 for it", which is marketable against a book
   quoting a credit, and it filled instantly at whatever the book gave.

   CONFIRMED ON ALPACA'S OWN ORDERS PANEL the same day: the XLE 2-Leg Order
   reads "Limit @ $0.75" — no minus, a debit — beside "Avg. Fill Price
   −0.04", Alpaca printing the credit it actually gave as a negative. The
   broker's display uses this same signed convention in both directions,
   which is what the two functions below adopt.

   IT IS THE ORDER'S DIRECTION, NOT THE STRUCTURE'S, AND THAT IS THE TRAP.
   The same structure is a credit one way and a debit the other:

     opening  a credit structure (net −0.75) → −0.75  you receive
     opening  a debit  structure (net +0.24) → +0.24  you pay
     closing  a debit  structure (net +0.64) → −0.64  you receive
     closing  a credit structure (net −0.37) → +0.37  you pay

   So the sign is `sign(structure net)` flipped when the intent is "close".
   Closing the butterfly or a bull call spread with `Math.abs()` — which is
   what every path did until this — offers to BUY BACK what you are selling,
   which a market maker meets at any price at all.
------------------------------------------------------------------ */

/**
 * WHICH WAY THE MONEY MOVES ON THE ORDER: +1 debit, −1 credit, 0 unreadable.
 *
 * @param structureNet  the net of the structure AS BUILT (signed: + is a debit)
 * @param intent        "open" | "close"
 */
export function limitDirection(structureNet, intent = "open") {
  const n = Number(structureNet);
  if (!Number.isFinite(n) || n === 0) return 0;
  return (n > 0 ? 1 : -1) * (intent === "close" ? -1 : 1);
}

/**
 * THE PRICE AN MLEG BODY CARRIES — signed, and the only way it is written.
 *
 * ROUND FIRST, DECIDE THE SIGN AFTER, the same rule `money()` in rules.js
 * keeps: a net of −0.0001 rounds to zero and "-0.00" is a direction the
 * number does not have.
 */
export function mlegLimitPrice(structureNet, factor, intent = "open") {
  const mag = unitLimit(structureNet, factor);
  if (Number(mag) === 0) return mag;
  return limitDirection(structureNet, intent) < 0 ? `-${mag}` : mag;
}

/**
 * THE SIGNED PRICE AN ORDER OF THIS INTENT WOULD CARRY, as a NUMBER.
 *
 * For a screen that holds a structure net and has to name the direction before
 * any body exists — the exit ladder's three buttons are the case. They printed
 * `Math.abs(ladderNet(...))`: a bare magnitude, on the buttons the owner will
 * use to close XLE J-0001, which is the first close this app has ever sent.
 * "$0.37" does not distinguish receiving 37 cents from paying them, and that
 * is the whole of the §4q fault read one screen later.
 *
 * It exists so a component never has to write `-net`: the rule that a close
 * flips the sign lives in `limitDirection()` and nowhere else.
 *
 * @returns {?number} null when the net is unreadable; 0 when it rounds away.
 */
export function signedLimitFor(structureNet, intent = "open") {
  // `Number(null)` IS 0 AND 0 IS FINITE — the seventh time in this repository,
  // and it was caught by this function's own test on the first run. A missing
  // net is not a rung priced at nothing: the nulls go out before the coercion.
  if (structureNet == null || structureNet === "") return null;
  const n = Number(structureNet);
  if (!Number.isFinite(n)) return null;
  const d = limitDirection(n, intent);
  return d === 0 ? 0 : d * Math.abs(n);
}

/**
 * WHAT A SIGNED LIMIT MEANS, IN WORDS. Every limit this app displays says
 * "debit" or "credit" rather than leaving a minus sign to carry the whole
 * fact — the read-back that hid the fault above was three screens printing
 * `Math.abs()` of the broker's own number, so nothing anywhere showed that
 * a credit spread had been sent as a debit.
 *
 * @param limitPrice  a SIGNED price, per combination (a string or a number)
 * @returns {?string} null when there is no readable price — never "$0".
 */
export function limitWords(limitPrice) {
  const n = Number(limitPrice);
  if (!Number.isFinite(n)) return null;
  const mag = +Math.abs(n).toFixed(2);
  if (mag === 0) return null;
  return n < 0
    ? `a credit of $${mag.toFixed(2)} (you receive it)`
    : `a debit of $${mag.toFixed(2)} (you pay it)`;
}

/**
 * THE ONE WORD, for a screen that formats its own amount — the Positions
 * rows print dollars a combination (`money(x * 100)`) rather than the price
 * a share, and a sentence may not be assembled out of a raw minus sign.
 * @returns {?("debit"|"credit")} null when there is no readable price.
 */
export function limitKind(limitPrice) {
  const n = Number(limitPrice);
  if (!Number.isFinite(n) || +Math.abs(n).toFixed(2) === 0) return null;
  return n < 0 ? "credit" : "debit";
}

/**
 * THE BODY ALPACA IS SENT — one implementation, five order paths.
 *
 * @param legs     [{ side, qty }] — side +1 buy / -1 sell, qty the leg's share
 * @param occs     the OCC symbol for each leg, in the same order
 * @param userQty  how many of the structure the user asked for (the ticket's QTY)
 * @param type     "limit" | "market"
 * @param limit    the SIGNED net of the WHOLE structure as built — positive is
 *   a debit, negative a credit, and it is a property of the STRUCTURE, never
 *   of the order. `mlegLimitPrice()` turns it into the order's own direction.
 *   A caller that hands a magnitude here sends every credit as a debit.
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
  /* THE LEG IS THE CONTRACT'S, NOT THIS FILE'S. The four `position_intent`
     values and the side that has to agree with each of them were written out
     here from memory; `optionLegRequest()` mirrors alpaca-py's
     `OptionLegRequest`, decides both from one table, and is the only place
     either is spelled. */
  const mlegs = legs.map((l, i) => optionLegRequest({
    symbol: occs[i], ratioQty: ratios[i], legSide: l.side, intent,
  }));
  const body = mlegs.length === 1
    // A SIMPLE ORDER'S PRICE IS UNSIGNED, and that is not an oversight: its
    // own `side` already says whether the money is going out or coming in,
    // and Alpaca rejects a negative limit on one.
    ? {
      symbol: mlegs[0].symbol, qty: String(qty * ratios[0]), side: mlegs[0].side,
      type, time_in_force: tif,
      ...(type === ORDER_TYPE.LIMIT ? { limit_price: unitLimit(limit, factor, ratios[0]) } : {}),
    }
    : {
      order_class: ORDER_CLASS.MLEG, qty: String(qty), type, time_in_force: tif, legs: mlegs,
      // AN MLEG PRICE IS SIGNED. See `mlegLimitPrice()` and the measurement
      // above it: `unitLimit()` here sent a $75 credit as a $75 debit and it
      // filled. Alpaca's own documentation states the convention in one
      // sentence: "For the mleg order class, a positive value indicates a
      // debit ... while a negative value signifies a credit."
      ...(type === ORDER_TYPE.LIMIT ? { limit_price: mlegLimitPrice(limit, factor, intent) } : {}),
    };
  /* AND IT IS HELD AGAINST THE CONTRACT BEFORE IT LEAVES. Every fault this
     file has ever had was a body the broker refused after a round trip — the
     GCD 422, the unlisted symbol, the inverted sign — and every one of those
     rules is written down in `alpacaContract.js`. A body that alpaca-py would
     not build is not sent, and the sentence names the rule rather than
     waiting for a 422 to name it worse. All six order paths pass through
     here, which is the only reason one check is enough. */
  const v = validateOrderRequest(body);
  if (!v.ok) throw new Error(contractRefusal(v.errors));
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
  // THE PREVIEW SAYS WHICH WAY THE MONEY GOES. A tap that arms a confirmation
  // has to show what it armed, and "$0.75" does not distinguish paying 75
  // cents from receiving them — which is the whole of the XLE fault above.
  const words = legs.length > 1
    ? limitWords(mlegLimitPrice(limit, factor, intent))
    : (unitLimit(limit, factor) !== "0.00" ? `a limit of $${unitLimit(limit, factor)}` : null);
  const price = type === "limit"
    ? `${words || "a limit the app could not read"} for one combination`
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

/* ALPACA'S ORDER STATUSES, SORTED BY WHAT THEY MEAN TO THE PERSON WHO TAPPED.
   The VOCABULARY is the broker's and is mirrored once in `alpacaContract.js`
   (alpaca-py `OrderStatus`); what each status MEANS to this app is decided
   here, because that is a product decision and not a fact about the wire.
   `"cancelled"` with two Ls is not one of Alpaca's spellings and is kept
   deliberately: a defensive reading costs nothing and a status read wrong
   buries a live order. */
const FILLED = [ORDER_STATUS.FILLED];
const PARTIAL = [ORDER_STATUS.PARTIALLY_FILLED];
const DEAD = [ORDER_STATUS.REJECTED, ORDER_STATUS.CANCELED, "cancelled", ORDER_STATUS.EXPIRED,
  ORDER_STATUS.DONE_FOR_DAY, ORDER_STATUS.SUSPENDED, ORDER_STATUS.STOPPED];
// Everything else that the broker holds: new, accepted, pending_new,
// accepted_for_bidding, held, calculated, pending_review, replaced, …

const asInt = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};

/**
 * WHAT THE BROKER ACTUALLY GAVE, SIGNED, per combination — or null.
 *
 * `filled_avg_price` carries Alpaca's own sign on a multi-leg order (a credit
 * is negative, as its Orders panel prints it), and it is the number the app
 * has never once been able to hold its own limit against, because nothing had
 * ever filled. UNKNOWN IS NOT ZERO: a reply with no fill price at all returns
 * null, never 0, for the same reason a missing open interest is not a zero.
 */
export function fillPriceOf(order = {}) {
  // ONE READER FOR EVERY NUMBER OFF THE WIRE. alpaca-py types this field
  // `Optional[Union[str, float]]` because the wire sends strings, and
  // `Number("")` is 0: `wireNumber()` in alpacaContract.js is where the nulls
  // go out before the coercion, once, for every field the app reads.
  return wireNumber(order && order.filled_avg_price);
}

/* ------------------------------------------------------------------
   IS THIS ORDER STILL ALIVE? — THE QUESTION NOBODY ASKED.

   >>> READ ON THE OWNER'S PHONE, 20 Sep 2026. <<< A panel headed
   "WORKING AT THE BROKER (3) · SENT, NOT FILLED" with three orders inside
   it whose own badges read CANCELED, EXPIRED and CANCELED. They are not
   working. They are dead, and two of them had been dead for three days.

   The cause is one expression. `App.jsx` picked the live orders with

       p.alpacaId && p.alpacaFilled === false

   which asks whether the order was FILLED and never whether it is still
   ALIVE. A cancelled order was never filled, so it stayed "working" for
   ever. `DEAD` above has always known better and `orderOutcome()` has
   returned `working: false` for those statuses since PR #18 — nobody was
   asking it. The knowledge was in the file; the screen contradicted it.

   SENT is not FILLED (PR #18) and DEAD is not WORKING (this one) are the
   same rule read at two different moments of an order's life.
------------------------------------------------------------------ */

/**
 * Where an order stands, from what the broker last said about it.
 *
 * @param {object} o  `{ status, filled }` — the two fields a position record
 *   keeps (`alpacaStatus`, `alpacaFilled`). A whole Alpaca reply works too.
 * @returns {"filled"|"working"|"dead"|"unknown"}
 *
 * UNKNOWN IS NOT DEAD AND IT IS NOT WORKING. A record with no status is one
 * the broker has not been asked about yet; `recheckOrders()` is what resolves
 * it, and until it does the app may not decide for itself which it was. The
 * same rule as a missing open interest or a missing quote size.
 */
export function orderLifecycle(o = {}) {
  if (o.filled === true) return "filled";
  const status = String(o.status ?? "").toLowerCase();
  if (!status) return o.filled === false ? "working" : "unknown";
  if (FILLED.includes(status)) return "filled";
  if (DEAD.includes(status)) return "dead";
  if (PARTIAL.includes(status)) return "working";
  return "working";
}

/** True only for an order the broker is still holding. */
export const orderIsWorking = (o) => orderLifecycle(o) === "working";

/** True for an order that ended without buying anything. */
export const orderIsDead = (o) => orderLifecycle(o) === "dead";

/** The one line a list prints over the orders that ended with nothing bought. */
export const deadOrderNote = (n) =>
  `${n === 1 ? "One order" : `${n} orders`} left the app and came back with nothing bought — cancelled, ` +
  `rejected or expired at the broker. ${n === 1 ? "It is" : "They are"} finished: nothing is waiting, nothing ` +
  `is open, and there is no risk on ${n === 1 ? "it" : "them"}. ${n === 1 ? "It" : "They"} stay here because ` +
  `an order that did not fill is the most useful thing this app can show you about its own prices.`;

/** Where an order is waiting, named rather than implied.
 *  THE BROKER'S LIMIT KEEPS ITS SIGN HERE. This read `Math.abs()`, which is
 *  why no screen in the app ever showed that the XLE credit spread had gone
 *  out as a debit — the app sent the wrong number and then hid it on the way
 *  back. `limitWords()` says which of the two it is, in words. */
export function orderWaitingPhrase(order = {}) {
  const type = String(order.type || "").toLowerCase();
  const words = order.limit_price != null ? limitWords(order.limit_price) : null;
  const priced = type === "limit" && words
    ? `at your limit of ${words}`
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
  // THE FILL PRICE KEEPS ITS SIGN TOO. Alpaca prints a multi-leg credit as a
  // NEGATIVE average fill price ("Avg. Fill Price −0.04" on the XLE order),
  // and `Math.abs()` here turned "you received four cents" into "you paid
  // four cents" on every screen that quotes a fill.
  const avgWords = o.filled_avg_price != null ? limitWords(o.filled_avg_price) : null;
  const at = avgWords ? ` at ${avgWords}` : "";
  // AND IT TRAVELS, SIGNED, SO THE CALLER NEVER RE-READS THE REPLY. What the
  // broker gave is the other half of the comparison ROADMAP P0 owes: the app
  // records `min(limit, ask)` and has never had a fill to hold it against.
  const fillPrice = fillPriceOf(o);

  if (!status) {
    return { kind: "unknown", filled: false, working: false, startsExitPlan: false, status, fillPrice,
      headline: "Alpaca did not say what happened to the order.",
      detail: `The reply carried no status, so the app cannot tell you whether anything was bought.` +
        ` Check the order list on your Alpaca paper account before doing anything else${tail}.` };
  }
  if (FILLED.includes(status)) {
    const n = got != null ? got : want;
    const what = n != null ? `${n} combination${n === 1 ? " is" : "s are"} yours` : "the order is yours";
    return { kind: "filled", filled: true, working: false, startsExitPlan: true, status, fillPrice,
      headline: `Filled${at}: ${what}. Position opened.`,
      detail: `The exit plan starts now${tail}.` };
  }
  if (PARTIAL.includes(status)) {
    const rest = want != null && got != null ? Math.max(0, want - got) : null;
    return { kind: "partial", filled: false, working: true, startsExitPlan: false, status, fillPrice,
      headline: `Partly filled${at}: ${got != null ? got : "some"} of ${want != null ? want : "the"} combinations are yours.`,
      detail: `${rest != null ? `The other ${rest} ${rest === 1 ? "is" : "are"} still working ` : "The rest is still working "}` +
        `${orderWaitingPhrase(o)}. The exit plan applies to what has filled; the rest is not a position yet${tail}.` };
  }
  if (DEAD.includes(status)) {
    const why = o.reject_reason || o.rejected_reason || null;
    return { kind: "dead", filled: false, working: false, startsExitPlan: false, status, fillPrice,
      headline: `Alpaca took the order and then ${status === "rejected" ? "rejected" : status.replace(/_/g, " ")} it: nothing was bought.`,
      detail: `${why ? `Alpaca's reason: ${why}. ` : ""}Nothing is open and nothing is working${tail}.` };
  }
  return { kind: "working", filled: false, working: true, startsExitPlan: false, status, fillPrice,
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

/* ------------------------------------------------------------------
   4) A CANCEL IS A REQUEST, NOT AN OUTCOME

   Read on the owner's account, 23 Sep 2026, at about 04:00 New York. He
   tapped Cancel on J-0003. Alpaca accepted the request and put the order in
   `pending_cancel`, which completes when the options session opens. The app
   said "Order cancelled." — false — and the Cancel button stayed live. The
   second tap came back HTTP 422, code 42210000, "order pending cancel", and
   the app printed "The cancellation did not go through" over a cancel that
   had gone through and was simply waiting.

   THREE FACTS, THREE SENTENCES, ONE HOME. Both call sites (the desk's order
   list and the Positions card) read this, and no other copy of these
   sentences exists:
     - a 2xx reply means Alpaca has the REQUEST. It is "Cancel requested".
     - an order is CANCELLED only when Alpaca reports the status `canceled`.
     - a 422 that says pending cancel is a STATE, not an error: a cancel is
       already waiting, and it completes when the options session opens.
   Until Alpaca reports `canceled` the order is still working and still counts
   in exposure: `orderLifecycle()` reads `pending_cancel` as working, and
   nothing here writes a status the broker did not report.
------------------------------------------------------------------ */

const PENDING_CANCEL_RE = /pending[ _]?cancel/i;

/**
 * What a cancel tap came to, or what state a cancel is in.
 *
 * @param ok     true when the DELETE came back 2xx
 * @param error  the error `alpacaReq` threw, with `status` and `body`
 * @param order  `{ status, cancelRequested }` — an Alpaca order, or a record's
 *               `alpacaStatus` and the time a cancel was requested on it
 * @returns {?{ kind, waiting, headline }} kind is "canceled" | "pending" |
 *   "requested" | "failed"; `waiting` true means show no Cancel and no
 *   Re-price. Null when there is no cancel to speak of.
 */
export function cancelOutcome({ ok = false, error = null, order = null } = {}) {
  const status = String(order?.status ?? "").toLowerCase();
  if (status === ORDER_STATUS.CANCELED || status === "cancelled") {
    return { kind: "canceled", waiting: false,
      headline: `Cancelled: Alpaca reports the order canceled. Nothing was bought and nothing is working.` };
  }
  const said = error ? `${alpacaBodySentence(error.body)} ${error.message || ""}` : "";
  if (status === ORDER_STATUS.PENDING_CANCEL || (error && Number(error.status) === 422 && PENDING_CANCEL_RE.test(said))) {
    return { kind: "pending", waiting: true,
      headline: `A cancel is already waiting at Alpaca. It completes when the options session opens ` +
        `(9:30 New York); until Alpaca reports it canceled, the order still counts in your exposure.` };
  }
  if (error) {
    return { kind: "failed", waiting: false, headline: `The cancellation did not go through: ${alpacaErrorText(error)}` };
  }
  // A cancel requested on an order that has since FILLED or otherwise ended is
  // not waiting for anything: the broker's status decides, not the request.
  if (!ok && status && orderLifecycle({ status }) !== "working") return null;
  if (ok || order?.cancelRequested) {
    return { kind: "requested", waiting: true,
      headline: `Cancel requested. Alpaca has the request; until it reports the order canceled, the order ` +
        `still counts in your exposure.` };
  }
  return null;
}

/** True while a cancel is on its way: show the sentence, not Cancel or Re-price. */
export const cancelWaiting = (order) => !!(cancelOutcome({ order })?.waiting);
