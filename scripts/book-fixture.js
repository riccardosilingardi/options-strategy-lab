// ============================================================================
// scripts/book-fixture.js — A FIXTURE BOOK FOR POSITIONS, A POSITION'S SCREEN AND ORDERS (redesign PR 3, TASK 2).
//
// Read by scripts/app-screens.jsx under the "+book" flag. Three records written the way Build writes them when it sends
// (src/App.jsx, the record after `sendToAlpaca()`), the holdings Alpaca would list for two of them and the open orders
// it would list. Every figure here is a FIXTURE INPUT (strikes, fills, quantities, dates) on the UNG chain fixture that
// app-screens.jsx serves under every ticker; every figure on screen is worked out from them by the app's own functions.
// None is copied from a board.
//
//   J-0002 UNG long 15 put × 2, filled 1.60 on 21 Sep: the fixture's bid is 2.46, past the take-profit of +50% of the
//          premium — the card reads CLOSE, and a close is working at Alpaca (sell 2 at 2.46, GTC).
//   J-0003 CORN 14/15 bull call spread × 3, filled 0.80 debit on 25 Sep: worth about 0.29 now, a loss past the stop
//          warning (50% of max loss) — the card reads WARNING. Opened on four factors that have since moved.
//   J-0004 SOYB 13/12 bull put spread × 1, sent from Build on 4 Oct at 0.40 credit, day: still working at Alpaca,
//          an order and not a position yet.
// ============================================================================
const EXP = "2026-12-18";
const occ = (tk, type, strike) => `${tk}261218${type === "call" ? "C" : "P"}${String(Math.round(strike * 1000)).padStart(8, "0")}`;
const at = (iso) => Date.parse(iso);

/** The four factors as read at entry: a `signalSnapshot()` of the day. */
const snap = (ticker, iso, score, confidence, agreement, factors) => ({
  ticker, t: at(iso), waiting: [], failed: [], ready: true, month: 8, score, agreement, confidence, factors, seasonalSource: "measured",
});

export function bookRecords() {
  return [
    {
      id: 2002, ref: "J-0002", name: "Long Put", ticker: "UNG", expKey: EXP, expiry: `${EXP}T21:00:00.000Z`,
      legs: [{ side: 1, type: "put", strike: 15, qty: 1 }], entryNet: 1.6, entrySpot: 14.1, contracts: 2, sizingFree: false,
      openedAt: "2026-09-21T14:05:00.000Z", maxProfit: 1340, maxLoss: -160, realEntry: true,
      alpacaId: "fx-open-2002", alpacaStatus: "filled", alpacaFilled: true, alpacaFillPrice: 1.6, alpacaLimit: 1.62, alpacaLimitSigned: true,
      alpacaTif: "day", alpacaSentAt: at("2026-09-21T14:05:00Z"), alpacaHeld: true, entrySource: "fill",
      closeOrder: { id: "fx-close-2002", limit: 2.46, at: at("2026-10-02T19:40:00Z") },
      thesis: { pop: 0.41, iv: 0.47, seasonal: -1.4, regime: "strong down", spot: 14.1, breakevens: [13.4], delta: -0.55, vega: 2.1,
        signal: { score: -38, confidence: 74, agreement: "CONFLUENT" },
        signals: snap("UNG", "2026-09-21T14:05:00Z", -38, 74, "CONFLUENT",
          { seasonal: { dir: -1, strength: 52 }, technical: { dir: -1, strength: 40 }, weather: { dir: 0, strength: 0 }, news: { dir: -1, strength: 20 } }) },
      timeline: [
        { seq: "J-0002·01", t: at("2026-09-21T14:05:00Z"), type: "sent", orderId: "fx-open-2002", text: "SENT to Alpaca — order fx-open-2002, limit at 1.62 debit a share, good for today's session only." },
        { seq: "J-0002·02", t: at("2026-09-21T14:06:00Z"), type: "fill", orderId: "fx-open-2002", text: "Filled 2 of 2 at 1.60 debit." },
        { seq: "J-0002·03", t: at("2026-09-29T20:00:00Z"), type: "hold", text: "HOLD. Nothing to do: the exit plan is running." },
        { seq: "J-0002·04", t: at("2026-10-02T19:40:00Z"), type: "close-sent", orderId: "fx-close-2002", text: "Close sent: sell 2 at 2.46, good till cancelled." },
      ],
    },
    {
      id: 2003, ref: "J-0003", name: "Bull Call Spread", ticker: "CORN", expKey: EXP, expiry: `${EXP}T21:00:00.000Z`,
      legs: [{ side: 1, type: "call", strike: 14, qty: 1 }, { side: -1, type: "call", strike: 15, qty: 1 }],
      entryNet: 0.8, entrySpot: 14.4, contracts: 3, sizingFree: false,
      openedAt: "2026-09-25T14:12:00.000Z", maxProfit: 20, maxLoss: -80, realEntry: true,
      alpacaId: "fx-open-2003", alpacaStatus: "filled", alpacaFilled: true, alpacaFillPrice: 0.8, alpacaLimit: 0.81, alpacaLimitSigned: true,
      alpacaTif: "day", alpacaSentAt: at("2026-09-25T14:12:00Z"), alpacaHeld: true, entrySource: "fill",
      thesis: { pop: 0.44, iv: 0.45, seasonal: 1.2, regime: "strong up", spot: 14.4, breakevens: [14.8], delta: 0.3, vega: 0.4,
        signal: { score: 32, confidence: 81, agreement: "CONFLUENT" },
        signals: snap("CORN", "2026-09-25T14:12:00Z", 32, 81, "CONFLUENT",
          { seasonal: { dir: 1, strength: 45 }, technical: { dir: 1, strength: 35 }, weather: { dir: 1, strength: 40 }, news: { dir: 0, strength: 0 } }) },
      timeline: [
        { seq: "J-0003·01", t: at("2026-09-25T14:12:00Z"), type: "sent", orderId: "fx-open-2003", text: "SENT to Alpaca — order fx-open-2003, limit at 0.81 debit a share, good for today's session only." },
        { seq: "J-0003·02", t: at("2026-09-25T14:13:00Z"), type: "fill", orderId: "fx-open-2003", text: "Filled 3 of 3 at 0.80 debit." },
        { seq: "J-0003·03", t: at("2026-09-29T20:00:00Z"), type: "hold", text: "HOLD. Nothing to do: the exit plan is running." },
        { seq: "J-0003·04", t: at("2026-10-01T20:00:00Z"), type: "signal", text: "Price trend turned down: the 20-day average under the 50-day." },
        { seq: "J-0003·05", t: at("2026-10-02T19:50:00Z"), type: "alert", text: "Stop warning reached. A warning, not an order." },
      ],
    },
    {
      id: 2004, ref: "J-0004", name: "Bull Put Spread", ticker: "SOYB", expKey: EXP, expiry: `${EXP}T21:00:00.000Z`,
      legs: [{ side: -1, type: "put", strike: 13, qty: 1 }, { side: 1, type: "put", strike: 12, qty: 1 }],
      entryNet: -0.4, entrySpot: 13.2, contracts: 1, sizingFree: false,
      openedAt: "2026-10-04T08:12:00.000Z", maxProfit: 40, maxLoss: -60, realEntry: true,
      alpacaId: "fx-open-2004", alpacaStatus: "accepted", alpacaFilled: false, alpacaLimit: -0.4, alpacaLimitSigned: true,
      alpacaTif: "day", alpacaSentAt: at("2026-10-04T08:12:00Z"),
      thesis: { pop: 0.63, iv: 0.46, seasonal: 0.4, regime: "weak", spot: 13.2, breakevens: [12.6], delta: 0.2, vega: -0.3,
        signal: { score: 22, confidence: 70, agreement: "MIXED" },
        signals: snap("SOYB", "2026-10-04T08:12:00Z", 22, 70, "MIXED",
          { seasonal: { dir: 1, strength: 20 }, technical: { dir: 1, strength: 30 }, weather: { dir: 0, strength: 0 }, news: { dir: 0, strength: 0 } }) },
      timeline: [
        { seq: "J-0004·01", t: at("2026-10-04T08:12:00Z"), type: "sent", orderId: "fx-open-2004", text: "SENT to Alpaca — order fx-open-2004, limit at 0.40 credit a share, good for today's session only. It waits for Monday's open." },
      ],
    },
  ];
}

/** What `GET /v2/positions` lists: the two held structures, leg by leg. */
export function bookHoldings() {
  const leg = (tk, type, strike, qty, avg) => ({ symbol: occ(tk, type, strike), qty: String(qty), side: qty > 0 ? "long" : "short",
    avg_entry_price: String(avg), asset_class: "us_option", exchange: "", cost_basis: String(Math.abs(qty) * avg * 100) });
  return [
    leg("UNG", "put", 15, 2, 1.6),
    leg("CORN", "call", 14, 3, 1.25), leg("CORN", "call", 15, -3, 0.45),
  ];
}

/** What `GET /v2/orders?status=open` lists: J-0002's close and J-0004's opening order. */
export function bookOrders() {
  return [
    { id: "fx-close-2002", client_order_id: "osl-close-2002", status: "new", order_class: "simple", symbol: occ("UNG", "put", 15),
      side: "sell", qty: "2", filled_qty: "0", type: "limit", limit_price: "2.46", time_in_force: "gtc", position_intent: "sell_to_close",
      submitted_at: "2026-10-02T19:40:00Z", created_at: "2026-10-02T19:40:00Z", updated_at: "2026-10-02T19:40:01Z" },
    { id: "fx-open-2004", client_order_id: "osl-open-2004", status: "accepted", order_class: "mleg", qty: "1", filled_qty: "0",
      type: "limit", limit_price: "-0.40", time_in_force: "day",
      legs: [{ symbol: occ("SOYB", "put", 13), side: "sell", ratio_qty: "1", position_intent: "sell_to_open" },
        { symbol: occ("SOYB", "put", 12), side: "buy", ratio_qty: "1", position_intent: "buy_to_open" }],
      submitted_at: "2026-10-04T08:12:00Z", created_at: "2026-10-04T08:12:00Z", updated_at: "2026-10-04T08:12:01Z" },
  ];
}
