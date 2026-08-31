// Proxy Alpaca: SOLO paper trading (Netlify Functions 2.0)
const BASE = "https://paper-api.alpaca.markets"; // hardcoded: mai live
// L'host paper viaggia in un header di risposta: e' cosi' che il client puo'
// VERIFICARE (non presumere) di stare parlando col conto paper. src/riskGate.js
// rifiuta l'ordine quando questa verifica manca (PRD ss.8, regola 1).
export const PAPER_HOST = "paper-api.alpaca.markets";

export default async (req) => {
  try {
    const key = Netlify.env.get("ALPACA_KEY");
    const secret = Netlify.env.get("ALPACA_SECRET");
    if (!key || !secret) return Response.json({ error: "server non configurato: imposta ALPACA_KEY/ALPACA_SECRET nelle env Netlify" }, { status: 503 });
    const path = new URL(req.url).searchParams.get("path") || "/v2/account";
    if (!/^\/v2\/[a-zA-Z0-9/_\-.?=&%]*$/.test(path)) return Response.json({ error: "bad path" }, { status: 400 });
    const init = {
      method: req.method,
      headers: {
        "APCA-API-KEY-ID": key,
        "APCA-API-SECRET-KEY": secret,
        "Content-Type": "application/json",
      },
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const body = await req.text();
      if (body) init.body = body;
    }
    const r = await fetch(BASE + path, init);
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { "Content-Type": "application/json", "X-OSL-Paper-Endpoint": PAPER_HOST, "Access-Control-Expose-Headers": "X-OSL-Paper-Endpoint" } });
  } catch (e) {
    return Response.json({ error: String(e.message || e) }, { status: 502 });
  }
};
