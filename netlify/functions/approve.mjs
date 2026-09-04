// One-tap approve: esegue su Alpaca PAPER l'ordine proposto dall'Autopilot, previa validazione token
import { getStore } from "@netlify/blobs";
import { evaluateTrade } from "../../src/riskGate.js";
import { orderOutcome, alpacaErrorText } from "../../src/order.js";

// L'host paper e' una costante di questo file: e' la prova che l'ordine
// autorizzato finisce su un conto paper, ed e' cio' che il cancello verifica.
const PAPER_HOST = "paper-api.alpaca.markets";
const PAPER_ACCOUNT = { paperVerified: true, paperSource: `this endpoint posts only to ${PAPER_HOST}` };
const esc = (x) => String(x == null ? "" : x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title, body, ok) => new Response(
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#14181d;font-family:ui-monospace,monospace;color:#f5f0e6}
div{background:#1a1f26;border:1px solid ${ok ? "#7fb85c" : "#d66a5a"};border-radius:10px;padding:28px;max-width:360px}
h1{font-size:15px;color:${ok ? "#7fb85c" : "#d66a5a"};margin:0 0 10px}p{font-size:12px;color:#8b95a1;line-height:1.5}</style></head>
<body><div><h1>${title}</h1><p>${body}</p></div></body></html>`,
  { headers: { "content-type": "text/html; charset=utf-8" } });

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
    const r = await fetch(`https://${PAPER_HOST}/v2/orders`, {
      method: "POST",
      headers: { "APCA-API-KEY-ID": k, "APCA-API-SECRET-KEY": s, "Content-Type": "application/json" },
      body: JSON.stringify(a.order),
    });
    const out = await r.json();
    // LA RISPOSTA PER INTERO, NON I PRIMI 300 CARATTERI. Il motivo del rifiuto
    // sta nel corpo ("GCD[5 5] = 5"), ed e' l'unica cosa che rende leggibile
    // un 422. `esc` perche' quel testo arriva da fuori e finisce in una pagina.
    if (!r.ok) return page("Alpaca refused the order", esc(alpacaErrorText({ status: r.status, body: JSON.stringify(out) })), false);
    a.used = true; a.usedAt = Date.now(); a.orderId = out.id;
    approvals[id] = a;
    await store.set("approvals", JSON.stringify(approvals));
    // ACCETTATO NON E' ESEGUITO: fuori orario l'ordine resta in coda, e
    // "sent" da solo lascia credere che la posizione sia chiusa.
    const res = orderOutcome(out);
    return page("Order sent ✓", `${esc(a.label)} · ${esc(a.posName)}<br>Alpaca PAPER order ${esc(String(out.id || "").slice(0, 8))}…<br>${esc(res.headline)}<br>${esc(res.detail)}`, true);
  } catch (e) {
    return page("Something went wrong", String(e.message || e), false);
  }
};
