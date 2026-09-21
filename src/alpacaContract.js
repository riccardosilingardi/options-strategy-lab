/* ====================================================================
   THE BROKER'S OWN CONTRACT, MIRRORED — src/alpacaContract.js

   THERE IS NO OFFICIAL JAVASCRIPT SDK FOR MULTI-LEG OPTION ORDERS.
   `alpaca-py` is the reference implementation, and every rule below cites
   the file in it that the rule came from. Nothing here is Python, nothing
   here is vendored, and no dependency was added: this is a hand-written
   mirror of a contract that would otherwise live in four order paths and a
   serverless function as four separate acts of memory.

   >>> AND ALPACA'S PUBLISHED OpenAPI SPEC CANNOT VALIDATE THESE BODIES. <<<
   It exists — `alpacahq/alpaca-docs`, `oas/trading/openapi.yaml`, the
   machine-readable description of `POST /v2/orders` — and it PREDATES
   multi-leg options completely. Searched on 21 Sep 2026, the whole document
   contains no `mleg`, no `ratio_qty`, no `position_intent`, and no request
   schema for `legs` (its one `legs:` is a RESPONSE field, "an array of Order
   entities associated with this order"). Its `OrderClass` enum reads, in
   full:

       enum: [simple, bracket, oco, oto, '']

   — no `mleg` at all. So there is nothing in the spec to hold an mleg body
   against, and saying so is the honest answer rather than implying a
   validation that did not happen. What the spec CAN still settle is the
   vocabulary the two order classes share, and the enums below carry both
   citations where both exist.

   WHY THIS FILE EXISTS AT ALL. Every fault in PR #33 was the app spelling
   out, from memory, something the broker had already defined:
   `limit_price`'s sign, `position_intent`'s four values, how many legs an
   mleg takes. A contract written down once, with its source cited, is the
   only version of that memory that can be checked.

   Plain JS, no React, no imports — `order.js` imports this and nothing
   imports `order.js` back.
==================================================================== */

/* ------------------------------------------------------------------
   1) THE ENUMS — alpaca/trading/enums.py

   Frozen, and exported as both a lookup and a list, so a caller can name a
   value (`ORDER_SIDE.BUY`) and a validator can ask whether a string is one
   (`isOneOf`). Never write "buy_to_open" into a component again.
------------------------------------------------------------------ */

const freeze = (o) => Object.freeze({ ...o });

/** alpaca-py `OrderSide` (alpaca/trading/enums.py). Also in the OpenAPI
 *  spec's `OrderSide` schema, with the same two values. */
export const ORDER_SIDE = freeze({ BUY: "buy", SELL: "sell" });

/** alpaca-py `PositionIntent` (alpaca/trading/enums.py). NOT in the
 *  OpenAPI spec — see the header: the spec predates options entirely. */
export const POSITION_INTENT = freeze({
  BUY_TO_OPEN: "buy_to_open",
  BUY_TO_CLOSE: "buy_to_close",
  SELL_TO_OPEN: "sell_to_open",
  SELL_TO_CLOSE: "sell_to_close",
});

/** alpaca-py `TimeInForce` (alpaca/trading/enums.py), identical to the
 *  OpenAPI spec's `TimeInForce` enum. */
export const TIME_IN_FORCE = freeze({
  DAY: "day", GTC: "gtc", OPG: "opg", CLS: "cls", IOC: "ioc", FOK: "fok",
});

/** alpaca-py `OrderClass` (alpaca/trading/enums.py). The OpenAPI spec's own
 *  `OrderClass` is [simple, bracket, oco, oto, ''] — it has no `mleg`, which
 *  is the single clearest statement of why alpaca-py is the reference here. */
export const ORDER_CLASS = freeze({
  SIMPLE: "simple", MLEG: "mleg", BRACKET: "bracket", OCO: "oco", OTO: "oto",
});

/** alpaca-py `OrderType` (alpaca/trading/enums.py), identical to the
 *  OpenAPI spec's `OrderType` enum. */
export const ORDER_TYPE = freeze({
  MARKET: "market", LIMIT: "limit", STOP: "stop",
  STOP_LIMIT: "stop_limit", TRAILING_STOP: "trailing_stop",
});

/** alpaca-py `OrderStatus` (alpaca/trading/enums.py) — every status the
 *  broker can report. `order.js` reads its lifecycle lists off this, so a
 *  status the app has never heard of is a status this file did not mirror,
 *  rather than one three files disagree about. */
export const ORDER_STATUS = freeze({
  NEW: "new",
  PARTIALLY_FILLED: "partially_filled",
  FILLED: "filled",
  DONE_FOR_DAY: "done_for_day",
  CANCELED: "canceled",
  EXPIRED: "expired",
  REPLACED: "replaced",
  PENDING_CANCEL: "pending_cancel",
  PENDING_REPLACE: "pending_replace",
  PENDING_REVIEW: "pending_review",
  ACCEPTED: "accepted",
  PENDING_NEW: "pending_new",
  ACCEPTED_FOR_BIDDING: "accepted_for_bidding",
  STOPPED: "stopped",
  REJECTED: "rejected",
  SUSPENDED: "suspended",
  CALCULATED: "calculated",
  HELD: "held",
});

/** The values of an enum above, as a list. */
export const valuesOf = (e) => Object.freeze(Object.values(e));
const isOneOf = (e, v) => Object.values(e).includes(String(v));

/* ------------------------------------------------------------------
   2) THE LEG — alpaca-py `OptionLegRequest`

       class OptionLegRequest(NonEmptyRequest):
           symbol: str
           ratio_qty: float
           side: Optional[OrderSide] = None
           position_intent: Optional[PositionIntent] = None

           @model_validator(mode="before")
           def root_validator(cls, values):
               if side is None and position_intent is None:
                   raise ValueError("at least one of side or position_intent
                                     must be provided for OptionLegRequest")

   THIS APP ALWAYS SENDS BOTH, deliberately. alpaca-py accepts either one
   alone; sending both means the broker is told the SAME fact twice in two
   vocabularies — "sell" and "sell_to_close" — and a body where the two
   disagree is a body this app built wrong. `positionIntentFor()` below is
   the one place the pairing is decided, and `validateLeg()` refuses a pair
   that contradicts itself, which is a rule alpaca-py does NOT have.
------------------------------------------------------------------ */

/**
 * WHICH OF THE FOUR INTENTS A LEG CARRIES.
 *
 * @param legSide  +1 long / -1 short, as this app's legs are written
 * @param intent   "open" | "close" — what the ORDER is doing
 * @returns one of POSITION_INTENT's four values
 *
 * A long leg is bought to open and sold to close; a short leg is sold to
 * open and bought to close. That is the whole table, and it is the same
 * table `orderBody()` uses to pick the leg's `side`: one fact, two
 * vocabularies, decided in one place so they cannot disagree.
 */
export function positionIntentFor(legSide, intent = "open") {
  const long = Number(legSide) > 0;
  if (intent === "close") return long ? POSITION_INTENT.SELL_TO_CLOSE : POSITION_INTENT.BUY_TO_CLOSE;
  return long ? POSITION_INTENT.BUY_TO_OPEN : POSITION_INTENT.SELL_TO_OPEN;
}

/** Which `side` goes with an intent. `buy_to_open` and `buy_to_close` both
 *  buy; `sell_to_open` and `sell_to_close` both sell. */
export function sideForIntent(positionIntent) {
  const p = String(positionIntent);
  if (p === POSITION_INTENT.BUY_TO_OPEN || p === POSITION_INTENT.BUY_TO_CLOSE) return ORDER_SIDE.BUY;
  if (p === POSITION_INTENT.SELL_TO_OPEN || p === POSITION_INTENT.SELL_TO_CLOSE) return ORDER_SIDE.SELL;
  return null;
}

/**
 * ONE LEG OF AN MLEG BODY, in the broker's own field names.
 * `ratio_qty` is a STRING because that is what the wire carries and what
 * every example in Alpaca's documentation shows.
 */
export function optionLegRequest({ symbol, ratioQty, legSide, intent = "open" } = {}) {
  return {
    symbol: symbol == null ? symbol : String(symbol),
    ratio_qty: String(ratioQty),
    side: Number(legSide) > 0 === (intent !== "close") ? ORDER_SIDE.BUY : ORDER_SIDE.SELL,
    position_intent: positionIntentFor(legSide, intent),
  };
}

/** @returns {string[]} one message per rule broken, alpaca-py's words where
 *  alpaca-py has a message and this file's where the rule is its own. */
export function validateLeg(leg, i = 0) {
  const e = [];
  const at = `leg ${i}`;
  const l = leg || {};
  if (!l.symbol || typeof l.symbol !== "string") {
    e.push(`${at}: symbol is required and must be the OCC symbol the chain gave.`);
  }
  const r = Number(l.ratio_qty);
  if (!Number.isFinite(r) || r <= 0 || Math.round(r) !== r) {
    e.push(`${at}: ratio_qty must be a whole number above zero (got ${JSON.stringify(l.ratio_qty)}).`);
  }
  if (l.side == null && l.position_intent == null) {
    // alpaca-py's own message, verbatim.
    e.push("at least one of side or position_intent must be provided for OptionLegRequest");
  }
  if (l.side != null && !isOneOf(ORDER_SIDE, l.side)) e.push(`${at}: side "${l.side}" is not one of ${valuesOf(ORDER_SIDE).join(", ")}.`);
  if (l.position_intent != null && !isOneOf(POSITION_INTENT, l.position_intent)) {
    e.push(`${at}: position_intent "${l.position_intent}" is not one of ${valuesOf(POSITION_INTENT).join(", ")}.`);
  }
  // THIS APP'S OWN RULE, AND alpaca-py DOES NOT HAVE IT. Sending both means
  // saying the same thing twice; saying it twice differently is a bug that
  // the broker would accept and act on.
  if (l.side != null && l.position_intent != null) {
    const want = sideForIntent(l.position_intent);
    if (want && want !== l.side) {
      e.push(`${at}: side "${l.side}" contradicts position_intent "${l.position_intent}", which is a ${want}.`);
    }
  }
  return e;
}

/* ------------------------------------------------------------------
   3) THE ORDER — alpaca-py `OrderRequest`, `MarketOrderRequest`,
      `LimitOrderRequest` (alpaca/trading/requests.py)

   The mleg half of `OrderRequest.root_validator`, verbatim in its logic:

       if not qty_set and not notional_set:
           raise ValueError("At least one of qty or notional must be provided")
       elif qty_set and notional_set:
           raise ValueError("Both qty and notional can not be set.")
       _validate_mleg_order_type(values)        # market or limit only
       if order_class == MLEG:
           if not qty_set:  "qty is required for the mleg order class."
           if legs is None: "legs is required for the mleg order class."
           if len > 4:      "At most 4 legs are allowed for the mleg order class."
           if len < 2:      "At least 2 legs are required for the mleg order class."
           if not unique:   "All legs must have unique symbols."
       else:
           if no symbol: "symbol is required for all order classes other than mleg."
           if no side:   "side is required for all order classes other than mleg."

   and `LimitOrderRequest.root_validator`:

       if order_class != OCO and limit_price is None:
           raise ValueError("limit_price is required")

   `_validate_mleg_order_type`:

       raise ValueError("mleg order class only supports market and limit orders.")
------------------------------------------------------------------ */

/** alpaca-py: "At most 4 legs are allowed for the mleg order class." */
export const MLEG_MAX_LEGS = 4;
/** alpaca-py: "At least 2 legs are required for the mleg order class." */
export const MLEG_MIN_LEGS = 2;

/** alpaca-py `_field_is_set`: `values.get(field, None) is not None`. */
const fieldIsSet = (o, k) => o != null && o[k] !== undefined && o[k] !== null;

/**
 * IS THIS BODY ONE ALPACA-PY WOULD BUILD?
 *
 * @param body  the object about to be POSTed to /v2/orders
 * @returns {{ ok: boolean, errors: string[] }}
 *
 * It is a MIRROR, not a superset: every rule is one alpaca-py enforces,
 * except the two marked "this app's own rule", which are marked because a
 * rule nobody can attribute is a rule nobody can check.
 */
export function validateOrderRequest(body) {
  const errors = [];
  const b = body || {};
  const mleg = b.order_class === ORDER_CLASS.MLEG;

  // qty / notional — the first thing alpaca-py's root validator asks.
  const qtySet = fieldIsSet(b, "qty");
  const notionalSet = fieldIsSet(b, "notional");
  if (!qtySet && !notionalSet) errors.push("At least one of qty or notional must be provided");
  else if (qtySet && notionalSet) errors.push("Both qty and notional can not be set.");
  if (qtySet) {
    const q = Number(b.qty);
    if (!Number.isFinite(q) || q <= 0) errors.push(`qty must be a number above zero (got ${JSON.stringify(b.qty)}).`);
  }

  // The vocabulary.
  if (!isOneOf(ORDER_TYPE, b.type)) errors.push(`type "${b.type}" is not one of ${valuesOf(ORDER_TYPE).join(", ")}.`);
  if (!isOneOf(TIME_IN_FORCE, b.time_in_force)) {
    errors.push(`time_in_force "${b.time_in_force}" is not one of ${valuesOf(TIME_IN_FORCE).join(", ")}.`);
  }
  if (b.order_class != null && !isOneOf(ORDER_CLASS, b.order_class)) {
    errors.push(`order_class "${b.order_class}" is not one of ${valuesOf(ORDER_CLASS).join(", ")}.`);
  }

  // `_validate_mleg_order_type`.
  if (mleg && b.type !== ORDER_TYPE.MARKET && b.type !== ORDER_TYPE.LIMIT) {
    errors.push("mleg order class only supports market and limit orders.");
  }

  if (mleg) {
    if (!qtySet) errors.push("qty is required for the mleg order class.");
    if (!Array.isArray(b.legs)) errors.push("legs is required for the mleg order class.");
    else {
      if (b.legs.length > MLEG_MAX_LEGS) errors.push("At most 4 legs are allowed for the mleg order class.");
      if (b.legs.length < MLEG_MIN_LEGS) errors.push("At least 2 legs are required for the mleg order class.");
      const syms = b.legs.map((l) => (l || {}).symbol);
      if (new Set(syms).size !== syms.length) errors.push("All legs must have unique symbols.");
      b.legs.forEach((l, i) => errors.push(...validateLeg(l, i)));
      /* THIS APP'S OWN RULE, and it is the one Alpaca answered with a 422 on
         2026-09-04: "leg ratio quantities should be relatively prime:
         GCD[5 5] = 5". alpaca-py does not check it — the broker does, after
         the round trip. `reduceRatios()` in order.js is what makes it true;
         this is what makes a regression visible before the order leaves. */
      const rs = b.legs.map((l) => Math.abs(Math.round(Number((l || {}).ratio_qty))) || 0).filter((n) => n > 0);
      if (rs.length === b.legs.length && rs.length > 1 && gcdOf(rs) !== 1) {
        errors.push(`leg ratio quantities should be relatively prime: GCD[${rs.join(" ")}] = ${gcdOf(rs)}. ` +
          `The SIZE belongs in qty and the SHAPE in the ratios.`);
      }
    }
    if (b.symbol != null) errors.push("an mleg order names its contracts on the legs, never at the top level.");
  } else {
    if (!fieldIsSet(b, "symbol")) errors.push("symbol is required for all order classes other than mleg.");
    if (!fieldIsSet(b, "side")) errors.push("side is required for all order classes other than mleg.");
    if (b.side != null && !isOneOf(ORDER_SIDE, b.side)) {
      errors.push(`side "${b.side}" is not one of ${valuesOf(ORDER_SIDE).join(", ")}.`);
    }
  }

  // `LimitOrderRequest.root_validator`.
  if (b.type === ORDER_TYPE.LIMIT) {
    if (!fieldIsSet(b, "limit_price")) errors.push("limit_price is required");
    else if (!Number.isFinite(Number(b.limit_price))) {
      errors.push(`limit_price "${b.limit_price}" is not a number.`);
    } else if (!mleg && Number(b.limit_price) < 0) {
      /* THIS APP'S OWN RULE, AND IT IS THE §4q FAULT READ THE OTHER WAY.
         A SIMPLE order's own `side` carries the direction, so its limit is a
         magnitude and Alpaca refuses a negative one. An MLEG limit is SIGNED
         — Alpaca's own words: "For the mleg order class, a positive value
         indicates a debit ... while a negative value signifies a credit" —
         so a negative one there is correct and must never be refused. */
      errors.push(`limit_price ${b.limit_price} is negative on a single-contract order, whose own side ` +
        `already says which way the money goes. Only an mleg limit is signed.`);
    }
  }
  // `_raise_for_unsupported_price_fields(values, LIMIT, ["limit_price"])`.
  if (b.type !== ORDER_TYPE.LIMIT && fieldIsSet(b, "limit_price")) {
    errors.push(`limit_price is not supported for ${b.type} orders.`);
  }
  for (const f of ["stop_price", "trail_price", "trail_percent"]) {
    if (fieldIsSet(b, f)) errors.push(`${f} is not supported for ${b.type} orders.`);
  }

  return { ok: errors.length === 0, errors };
}

const gcd2 = (a, b) => (b ? gcd2(b, a % b) : a);
const gcdOf = (ns) => ns.reduce((a, b) => gcd2(a, b), ns[0]) || 1;

/** The one sentence a refused body produces. It never truncates: the reason
 *  a 422 is readable at all is that the whole of it is printed (order.js). */
export function contractRefusal(errors = []) {
  const n = errors.length;
  return `This order does not match Alpaca's own contract, so it was not sent: ` +
    `${errors.join(" ")} ${n === 1 ? "That rule is" : "Those rules are"} mirrored from alpaca-py in ` +
    `src/alpacaContract.js, which is where it says which file each one came from.`;
}

/* ------------------------------------------------------------------
   4) WHAT COMES BACK — alpaca-py `Order` and `Position`
      (alpaca/trading/models.py)

   Read, never re-derived. The owner's rule, and the species of all three
   PR #33 faults: "hai sempre tutte le info da Alpaca con la API, devi solo
   renderizzarle."

   THE STRINGS ARE THE POINT. alpaca-py types `qty`, `filled_qty`,
   `filled_avg_price` and `limit_price` as `Optional[Union[str, float]]`
   because the wire sends strings — and `Number("")` is 0, `Number(null)` is
   0, and 0 is finite. Every reader below puts the nulls out before the
   coercion, for the eighth time in this repository.
------------------------------------------------------------------ */

/** A number off the wire, or null. NEVER 0 for a missing field. */
export function wireNumber(x) {
  if (x == null || x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/**
 * ALPACA'S ORDER REPLY, in the fields this app reads — and only those.
 * `limit_price` and `filled_avg_price` keep their SIGN: on an mleg a credit
 * is negative, as Alpaca's own Orders panel prints it ("Avg. Fill Price
 * −0.04" beside "Limit @ $0.75"). `Math.abs()` on either is what hid §4q.
 */
export function parseOrder(raw) {
  const o = raw || {};
  return {
    id: o.id != null ? String(o.id) : null,
    clientOrderId: o.client_order_id != null ? String(o.client_order_id) : null,
    status: o.status != null ? String(o.status).toLowerCase() : null,
    orderClass: o.order_class != null ? String(o.order_class) : null,
    type: (o.type ?? o.order_type) != null ? String(o.type ?? o.order_type).toLowerCase() : null,
    side: o.side != null ? String(o.side).toLowerCase() : null,
    timeInForce: o.time_in_force != null ? String(o.time_in_force).toLowerCase() : null,
    symbol: o.symbol != null ? String(o.symbol) : null,
    qty: wireNumber(o.qty),
    filledQty: wireNumber(o.filled_qty),
    limitPrice: wireNumber(o.limit_price),
    filledAvgPrice: wireNumber(o.filled_avg_price),
    positionIntent: o.position_intent != null ? String(o.position_intent) : null,
    ratioQty: wireNumber(o.ratio_qty),
    legs: Array.isArray(o.legs) ? o.legs.map(parseOrder) : null,
    // A status this file did not mirror is a fact about this file, not about
    // the order: it is reported rather than silently treated as one we know.
    statusKnown: o.status != null && isOneOf(ORDER_STATUS, String(o.status).toLowerCase()),
  };
}

/**
 * ALPACA'S POSITION, in the fields this app reads. `/v2/positions` returns
 * ONLY what the account HOLDS, which is what makes a record found here a
 * holding rather than an order still waiting (`isBrokerHolding()`).
 */
export function parsePosition(raw) {
  const p = raw || {};
  return {
    symbol: p.symbol != null ? String(p.symbol) : null,
    assetClass: p.asset_class != null ? String(p.asset_class) : null,
    qty: wireNumber(p.qty),
    qtyAvailable: wireNumber(p.qty_available),
    side: p.side != null ? String(p.side).toLowerCase() : null,
    avgEntryPrice: wireNumber(p.avg_entry_price),
    costBasis: wireNumber(p.cost_basis),
    marketValue: wireNumber(p.market_value),
    currentPrice: wireNumber(p.current_price),
    unrealizedPl: wireNumber(p.unrealized_pl),
  };
}
