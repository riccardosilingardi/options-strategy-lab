// One-tap approve: esegue su Alpaca PAPER l'ordine proposto dall'Autopilot, previa validazione token
//
// WHAT CHANGED, AND WHY IT IS HERE RATHER THAN IN THE AUTOPILOT.
//
// The autopilot used to build the closing order itself, as a MARKET order, and
// store the finished body. Tapping the link up to 24 hours later sent it. Two
// faults in one:
//
//   * A market order into these books is not a price. BOIL quoted bid/ask
//     spreads of 66%, 91%, 145% and 166% OF THE MID near the money on strikes
//     this app builds on. The app refuses to PRICE a new candidate off a market
//     that wide (`spreadFloor` in rules.js) and then closed one at the touch.
//   * Even a limit worked out at proposal time would be a day old by the time
//     somebody taps.
//
// So the approval carries the INTENT — which legs, which contracts, which way —
// and the price is worked out HERE, at tap time, from a chain fetched now.
// `orderBody()` is used exactly as it is, with `type: "limit"`.
import { getStore } from "@netlify/blobs";
import { evaluateTrade } from "../../src/riskGate.js";
import { orderBody, orderOutcome, alpacaErrorText } from "../../src/order.js";
import { closeMarket, closeLimitPrice, closeLimitNote, closeUnreadableNote } from "../../src/rules.js";
import { appendTimeline } from "../../src/journal.js";
import { parseCboeJson, CBOE_URL } from "../../src/chain.js";

// L'host paper e' una costante di questo file: e' la prova che l'ordine
// autorizzato finisce su un conto paper, ed e' cio' che il cancello verifica.
const PAPER_HOST = "paper-api.alpaca.markets";
const PAPER_ACCOUNT = { paperVerified: true, paperSource: `this endpoint posts only to ${PAPER_HOST}` };
const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title, body, ok) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#14181d;font-family:ui-monospace,monospace;color:#f5f0e6;padding:20px;box-sizing:border-box}
div{background:#1a1f26;border:1px solid ${ok ? "#7fb85c" : "#d66a5a"};border-radius:10px;padding:28px;max-width:380px}
h1{font-size:15px;color:${ok ? "#7fb85c" : "#d66a5a"};margin:0 0 10px}p{font-size:12px;color:#8b95a1;line-height:1.5;word-break:break-word}</style></head>
<body><div><h1>${title}</h1><p>${body}</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } });

// Il feed della chain, con gli header che CBOE si aspetta da un browser.
const HDRS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36", "Referer": "https://www.cboe.com/", "Origin": "https://www.cboe.com" };

/** A FRESH CHAIN, NOW. Same two symbol candidates the autopilot tries. */
async function freshChain(sym) {
  for (const cand of [sym, `_${sym}`]) {
    try {
      const r = await fetch(CBOE_URL(cand), { headers: HDRS });
      if (!r.ok) continue;
      const j = await r.json();
      if (j?.data?.options?.length) return parseCboeJson(sym, j);
    } catch { /* next candidate */ }
  }
  return null;
}

/** Each leg's live two-sided quote, in the order the legs are held. */
function legQuotes(chain, expKey, legs) {
  const exp = chain?.byExp?.[expKey];
  if (!exp) return legs.map(() => ({}));
  return legs.map((l) => {
    const side = l.type === "put" ? exp.puts : exp.calls;
    const q = side?.[l.strike] ?? side?.[String(l.strike)] ?? null;
    return q ? { bid: q.bid, ask: q.ask } : {};
  });
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const store = getStore("autopilot");
    const raw = await store.get("approvals");
    const approvals = raw ? JSON.parse(raw) : {};
    const a = approvals[id];
    if (!a) return page("Link not valid", "This authorisation does not exist, or it has already been removed.", false);
    if (a.used) return page("Already executed", `This order was authorised on ${new Date(a.usedAt).toLocaleString("en-GB", { timeZone: "UTC" })} UTC and cannot be sent twice.`, false);
    if (Date.now() > a.exp) return page("Link expired", "This authorisation was valid for 24 hours and that window has passed. The autopilot will issue a new one on its next run if the proposal still stands.", false);

    // A LINK FROM THE OLD BUILD PROPOSED A MARKET ORDER, AND IS NOT SENT.
    // Those links carry a finished `order` body with `type: "market"` and no
    // intent to re-price. Sending one would be the exact thing this endpoint
    // now exists to prevent, and quietly converting it to a limit would be
    // inventing a price for an order nobody proposed at that price.
    if (!a.orderIntent) {
      return page("This link is out of date",
        "It was issued by an earlier version of the autopilot, which proposed closing at whatever the market " +
        "was showing. Closing orders are limit orders now, priced from a live chain at the moment you tap. " +
        "Nothing has been sent. The autopilot will issue a new link on its next run if the proposal still stands.", false);
    }

    // PRD §8: il cancello gira di nuovo QUI, al momento dell'esecuzione. Fra la
    // proposta e il tap possono passare 24 ore, e le posizioni possono cambiare.
    const state = JSON.parse((await store.get("state")) || "{}");
    const g = evaluateTrade({
      proposal: a.gateContext?.proposal || { intent: "close", legs: [], maxLoss: 0 },
      portfolio: { positions: state.positions || [], account: PAPER_ACCOUNT },
      capital: a.gateContext?.capital || {},
      signals: null,
    });
    if (!g.pass) return page("Blocked by the risk gate", g.violations.map((v) => v.message).join("<br>"), false);

    const k = Netlify.env.get("ALPACA_KEY"), s = Netlify.env.get("ALPACA_SECRET");
    if (!k || !s) return page("Server not configured", "ALPACA_KEY and ALPACA_SECRET are not set in the Netlify environment.", false);

    /* ---- THE PRICE, WORKED OUT NOW ---- */
    const oi = a.orderIntent;
    const chain = await freshChain(oi.ticker);
    if (!chain) {
      return page("No live prices right now",
        `The option chain for ${esc(oi.ticker)} could not be read just now, so there is no price to close at and ` +
        `nothing has been sent. Nothing has changed on the broker. Try again in a minute, or wait for the ` +
        `autopilot's next run.`, false);
    }
    const quotes = legQuotes(chain, oi.expKey, oi.legs);
    const market = closeMarket(oi.legs, quotes);
    if (!market.ok) {
      return page("No price to close at", esc(closeUnreadableNote(market.missing, oi.legs)), false);
    }
    const priced = closeLimitPrice({ netMid: market.netMid, spread: market.spread });

    // `orderBody()` UNCHANGED, with `type: "limit"`. The size goes in qty and
    // the shape in the ratios exactly as it does at every other order site.
    const order = orderBody({
      legs: oi.legs, occs: oi.occs, userQty: oi.userQty || 1,
      type: "limit", limit: priced.net, tif: oi.tif || "day", intent: oi.intent || "close",
    });

    const r = await fetch(`https://${PAPER_HOST}/v2/orders`, {
      method: "POST",
      headers: { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s, "Content-Type": "application/json" },
      body: JSON.stringify(order),
    });
    const out = await r.json();
    // LA RISPOSTA PER INTERO, NON I PRIMI 300 CARATTERI. Il motivo del rifiuto
    // sta nel corpo ("GCD[5 5] = 5"), ed e' l'unica cosa che rende leggibile
    // un 422. `esc` perche' quel testo arriva da fuori e finisce in una pagina.
    if (!r.ok) return page("Alpaca refused the order", esc(alpacaErrorText({ status: r.status, body: JSON.stringify(out) })), false);
    a.used = true; a.usedAt = Date.now(); a.orderId = out.id; a.limit = order.limit_price;
    approvals[id] = a;
    await store.set("approvals", JSON.stringify(approvals));

    // ACCETTATO NON E' ESEGUITO: fuori orario l'ordine resta in coda, e
    // "sent" da solo lascia credere che la posizione sia chiusa.
    const res = orderOutcome(out);

    /* ---- THE POSITION'S OWN RECORD SAYS WHAT WAS SENT ----
       The Journal keeps the whole timeline now, and this is the entry that says
       a close was actually approved and what the broker did with it. Without it
       the record ends at "the autopilot proposed a close" and the order that
       went out is only in the brief, which nothing keeps.
       The order id is FULL, never the eight-character slice the pages print. */
    try {
      const positions = state.positions || [];
      const pos = positions.find((p) => String(p.id) === String(a.posId))
        || positions.find((p) => `${p.ticker} ${p.name}` === a.posName);
      if (pos) {
        const t = appendTimeline(pos, {
          t: Date.now(), type: "order", orderId: out.id ? String(out.id) : null,
          orderStatus: res.status, orderFilled: res.filled, orderWorking: res.working,
          limit: order.limit_price,
          text: `${a.label} approved and sent — Alpaca order ${out.id ? String(out.id) : "(no id)"} at a limit of ` +
            `$${order.limit_price} per combination. ${res.headline}`,
        });
        pos.timeline = t.timeline; pos.seqNext = t.seqNext;
        await store.set("state", JSON.stringify(state));
      }
    } catch { /* the order went: a record that failed to write must not undo it */ }

    return page("Order sent ✓",
      `${esc(a.label)} · ${esc(a.posName)}<br>Alpaca PAPER order ${esc(String(out.id || ""))}<br>` +
      `${esc(res.headline)}<br>${esc(res.detail)}<br><br>${esc(closeLimitNote(priced))}` +
      `${res.working ? "<br><br>This order has NOT filled. Nothing is re-sent by itself: the autopilot's next run " +
        "will propose the close again at a price worked out from a fresh chain, and it is yours to approve or ignore." : ""}`, true);
  } catch (e) {
    return page("Something went wrong", String(e.message || e), false);
  }
};
